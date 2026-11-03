import { estado, infoArmazenamento } from '../crm/banco.js';
import { tarefasDoDia } from '../crm/motor.js';
import { painelExecutivo } from '../crm/pipeline/metricas.js';
import { diaBRT, somaDia, visiveis } from '../crm/pipeline/regras.js';
import { montarBI } from '../bi/fonte.js';
import { alertasDoAgente } from '../panel/assistente.js';
import { env } from '../lib/env.js';
import { temAcesso, type Sessao } from '../lib/painel-auth.js';

/**
 * Painel geral: junta, num só retrato, o que o CRM e o Agente receptivo já calculam (nada novo é medido aqui).
 * Cada bloco só vai se a pessoa tem o módulo. Os dois lados se encontram em dois pontos reais: o eixo do tempo
 * (dia a dia, no mesmo fuso) e o Clinilink (a Amanda agenda lá e o CRM acompanha os orçamentos de lá). Não há ligação
 * paciente a paciente: os eventos do BI saem mascarados, então não dá (nem deve) cruzar pessoas.
 */

export type AlertaGeral = { id: string; origem: 'CRM' | 'Agente'; nivel: 'risco' | 'atencao' | 'info'; titulo: string; texto: string; href: string };
const soma = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const ORDEM = { risco: 0, atencao: 1, info: 2 } as const;

function blocoCrm(dias: number, agora: Date) {
  const pl = estado.pipelines;
  const funis = pl.funis.filter((f) => !f.oculto);
  const hoje = diaBRT(agora), ini = somaDia(hoje, -(dias - 1));
  const rotulos = Array.from({ length: dias }, (_, i) => somaDia(ini, i));
  const porFunil = funis.map((f) => ({ f, p: painelExecutivo(pl, f, dias, agora) }));

  const receita = soma(porFunil.map((x) => x.p.kpis.receita.valor)), anterior = soma(porFunil.map((x) => x.p.kpis.receita.anterior));
  const convertidos = soma(porFunil.map((x) => x.p.kpis.conversao.convertidos)), entradas = soma(porFunil.map((x) => x.p.kpis.conversao.entradas));
  const entradasAnt = soma(porFunil.map((x) => x.p.kpis.conversao.entradasAnt));
  const novosPorDia = rotulos.map(() => 0);
  const idx = new Map(rotulos.map((d, i) => [d, i]));
  for (const f of funis) for (const a of visiveis(f, pl.atribuicoes)) {
    const d = a.ultimoSnapshot.criadoEm ? diaBRT(a.ultimoSnapshot.criadoEm) : undefined;
    const i = d === undefined ? undefined : idx.get(d);
    if (i !== undefined) novosPorDia[i]++;
  }
  const alertas: AlertaGeral[] = porFunil.flatMap(({ f, p }) => p.alertas.map((a, i) => ({
    id: `crm:${f.id}:${i}`, origem: 'CRM' as const, nivel: a.nivel, titulo: `${f.nome}: ${a.titulo}`, texto: a.texto, href: '/painel/crm',
  })));
  const tarefas = tarefasDoDia(estado.leads, agora);
  return {
    dados: {
      receita: { valor: receita, anterior, deltaPct: anterior > 0 ? Math.round(((receita - anterior) / anterior) * 1000) / 10 : null },
      pipeline: { valor: soma(porFunil.map((x) => x.p.kpis.pipeline.valor)), n: soma(porFunil.map((x) => x.p.kpis.pipeline.n)) },
      previsao: soma(porFunil.map((x) => x.p.kpis.previsao.valor)),
      conversao: { convertidos, entradas, entradasAnt, taxa: entradas > 0 ? Math.round((convertidos / entradas) * 1000) / 10 : null },
      foraDaCadencia: soma(porFunil.flatMap((x) => x.p.etapas.map((e) => e.atrasados))),
      leadsNoGuia: estado.leads.length, tarefasHoje: tarefas.length,
      funis: porFunil.map(({ f, p }) => ({ id: f.id, nome: f.nome, cards: visiveis(f, pl.atribuicoes).length, abertos: p.kpis.pipeline.n, valor: p.kpis.pipeline.valor, receita: p.kpis.receita.valor, atrasados: soma(p.etapas.map((e) => e.atrasados)) })),
      serie: { rotulos, receita: rotulos.map((_, i) => soma(porFunil.map((x) => x.p.serie.receita[i] ?? 0))), novos: novosPorDia },
    },
    alertas,
  };
}

async function blocoAgente(dias: number, rotulos: string[], fonte: 'real' | 'demo') {
  const bi = await montarBI(dias <= 7 ? '7d' : '30d', fonte);
  const porDia = new Map(bi.serie.map((p) => [diaBRT(new Date(p.t)), p]));
  // alertas de configuração são do servidor de verdade: com dados de exemplo não entram
  const alertas: AlertaGeral[] = (fonte === 'demo' ? [] : await alertasDoAgente()).map((a) => ({ id: `agente:${a.id}`, origem: 'Agente' as const, nivel: a.nivel, titulo: a.titulo, texto: a.texto, href: a.acoes?.[0]?.href ?? '/painel/receptivo' }));
  return {
    dados: {
      fonte, vazio: bi.fonte.eventos === 0, eventos: bi.fonte.eventos, modo: env.mode === 'claude' ? 'Claude' : 'Roteiro', respondendo: env.autoReply,
      kpis: { atual: bi.kpis.atual, anterior: bi.kpis.anterior },
      serie: { rotulos, conversas: rotulos.map((d) => porDia.get(d)?.conversas ?? 0), agendamentos: rotulos.map((d) => porDia.get(d)?.agendamentos ?? 0), transferencias: rotulos.map((d) => porDia.get(d)?.transferencias ?? 0) },
      funil: bi.funil.map((e) => ({ etapa: e.etapa, chegaram: e.chegaram, pct: e.pct })),
      integracoes: bi.integracoes.map((i) => ({ nome: i.nome, chamadas: i.chamadas, falhas: i.falhas, okPct: i.okPct, p95: i.p95 })),
      origemDados: bi.fonte.origens,
    },
    alertas,
  };
}

export async function montarGeral(sessao: Sessao, diasPedido: number, fonteAgente: 'real' | 'demo' = 'real') {
  const dias = diasPedido === 30 ? 30 : 7;
  const agora = new Date();
  const verCrm = temAcesso(sessao, 'crm'), verAgente = temAcesso(sessao, 'agente');
  const crm = verCrm ? blocoCrm(dias, agora) : null;
  const rotulos = crm?.dados.serie.rotulos ?? Array.from({ length: dias }, (_, i) => somaDia(diaBRT(agora), -(dias - 1) + i));
  let agente: Awaited<ReturnType<typeof blocoAgente>> | null = null, erroAgente: string | undefined;
  if (verAgente) { try { agente = await blocoAgente(dias, rotulos, fonteAgente); } catch (e) { erroAgente = (e as Error).message; } }

  const alertas = [...(crm?.alertas ?? []), ...(agente?.alertas ?? [])].sort((a, b) => ORDEM[a.nivel] - ORDEM[b.nivel]);
  const arm = infoArmazenamento();
  return {
    geradoEm: agora.toISOString(), dias, acesso: { crm: verCrm, agente: verAgente },
    crm: crm?.dados ?? null, agente: agente?.dados ?? null, erroAgente,
    alertas: alertas.slice(0, 12), totalAlertas: alertas.length,
    // onde os dois lados se encontram de verdade
    encontro: crm && agente ? {
      agendamentosAmanda: soma(agente.dados.serie.agendamentos), novosCards: soma(crm.dados.serie.novos), convertidosCrm: crm.dados.conversao.convertidos, receitaCrm: crm.dados.receita.valor,
      nota: 'Os dois lados usam a mesma agenda do Clinilink e o mesmo calendário, mas não são ligados paciente a paciente: os eventos da Amanda saem mascarados (sem nome nem telefone). Compare tendências, não pessoas.',
    } : null,
    sistema: { armazenamento: arm.destino === 'supabase' ? 'Supabase' : arm.destino === 'arquivo' ? 'arquivo local' : 'memória', erro: arm.erro ?? null },
  };
}
