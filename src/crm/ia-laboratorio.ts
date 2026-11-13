import { randomUUID } from 'node:crypto';
import type { Estado } from './banco.js';
import { aplicar, automatizar, criarLead, hojeDe, proximoPasso, somaDias, type Lead } from './motor.js';
import { MENSAGENS } from './modelo.js';
import { avaliarLead, checagens, configAuto } from './ia-disparo.js';
import { DisparoError, MARCA } from './whatsapp.js';

/**
 * Laboratório do "Modo Simulação" do IA Manager: leads FICTÍCIOS que o gerente cria para ver a IA trabalhando de ponta a ponta
 * (decide, escolhe a mensagem, preenche as variáveis e "envia"), em qualquer dia e hora, sem tocar em paciente real.
 *
 * Os leads de teste ficam guardados à parte (estado.disparoAuto.simulacao), NUNCA em estado.leads: não aparecem em Hoje, Funil,
 * Análises, Time nem em nenhum número do CRM, e nada sai para o WhatsApp. São avaliados pelas MESMAS checagens da IA de verdade.
 */

export const LIMITE_LAB = 12;
export type TipoLab = 'orcamento' | 'noshow';

const erroLab = (m: string, status = 400) => new DisparoError('lab', m, status);
const leadsDe = (estado: Estado): Lead[] => estado.disparoAuto?.simulacao?.leads ?? [];
const guardar = (estado: Estado, leads: Lead[]) => { estado.disparoAuto = { ...(estado.disparoAuto ?? { modo: 'desligado' }), simulacao: { leads } }; };

/** O texto da mensagem como o paciente receberia: o corpo do guia com os [campos] trocados pelos parâmetros, na ordem. */
export function textoDaMensagem(msg: number, parametros: string[]): { msg: number; texto: string; botoes: string[] } | null {
  const m = MENSAGENS.find((x) => x.n === msg);
  if (!m) return null;
  let i = 0;
  return { msg: m.n, texto: m.corpo.replace(/\[[^\]]*\]/g, (c) => parametros[i++] ?? c), botoes: m.botoes ?? [] };
}

/** "2026-11-13T08:30" (horário de Belém) vira o instante. Sem valor válido, vale agora. */
export function instanteDoRelogio(v: unknown, agora = new Date()): Date {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return agora;
  const d = new Date(`${v}:00-03:00`);
  return Number.isNaN(d.getTime()) ? agora : d;
}

export type EntradaLab = { nome?: unknown; valor?: unknown; unidade?: unknown; exame?: unknown; atendente?: unknown; tipo?: unknown; diasAtras?: unknown };

export function criarLeadLab(estado: Estado, e: EntradaLab, agora: Date): Lead {
  const atuais = leadsDe(estado);
  if (atuais.length >= LIMITE_LAB) throw erroLab(`O laboratório comporta ${LIMITE_LAB} leads de teste. Remova algum para criar outro.`, 409);
  const nome = String(e.nome ?? '').trim();
  if (!nome) throw erroLab('Dê um nome ao lead de teste.');
  if (nome.length > 60) throw erroLab('O nome do lead de teste pode ter no máximo 60 letras.');
  const valor = e.valor === undefined || e.valor === null || e.valor === '' ? 0 : Number(e.valor);
  if (!Number.isFinite(valor) || valor < 0 || valor > 1_000_000) throw erroLab('Valor do orçamento inválido.');
  const diasAtras = e.diasAtras === undefined || e.diasAtras === '' ? 1 : Number(e.diasAtras);
  if (!Number.isInteger(diasAtras) || diasAtras < 0 || diasAtras > 30) throw erroLab('A idade do orçamento vai de 0 a 30 dias.');
  const tipo: TipoLab = e.tipo === 'noshow' ? 'noshow' : 'orcamento';
  const hoje = hojeDe(agora);
  // número fictício, válido para o formato brasileiro, mas que nunca é usado: nada é enviado de verdade
  const telefone = `9199${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`;
  const lead = criarLead({ nome, telefone, valor, exame: String(e.exame ?? '').trim().slice(0, 60) || 'Ultrassom', unidade: String(e.unidade ?? '').trim().slice(0, 60) || undefined, atendente: String(e.atendente ?? '').trim().slice(0, 40) || undefined, origem: 'Simulação', d0: somaDias(hoje, -diasAtras) }, agora);
  lead.id = `sim-${randomUUID().slice(0, 6)}`;
  if (tipo === 'noshow') {
    lead.status = 'negociacao'; lead.noShow = true; lead.pulados = ['orcamento']; lead.statusDesde = hoje; lead.faseId = `negociacao:${hoje}:1`;
  }
  guardar(estado, [...atuais, lead]);
  return lead;
}

export function removerLeadLab(estado: Estado, id: string): boolean {
  const atuais = leadsDe(estado);
  if (!atuais.some((l) => l.id === id)) return false;
  guardar(estado, atuais.filter((l) => l.id !== id));
  return true;
}
export const limparLab = (estado: Estado) => guardar(estado, []);

export type ResultadoLab = { leadId: string; nome: string; passo: string | null; msg?: number; resultado: 'enviaria' | 'espera' | 'pulado' | 'nada'; motivo: string; texto?: string };

/** Uma rodada simulada no instante escolhido: avalia cada lead de teste e, onde a IA enviaria, registra o "envio" no próprio lead de teste. */
export function rodarLab(estado: Estado, agora: Date): { quando: string; resultados: ResultadoLab[] } {
  const cfg = configAuto(estado), resultados: ResultadoLab[] = [];
  let feitos = 0;
  for (const l of leadsDe(estado)) {
    automatizar(l, agora); // as regras do guia movem o lead com o passar dos dias (no CRM de verdade isso roda sozinho)
    const av = avaliarLead(estado, l, agora, { ignorarLista: true }, cfg);
    if (!av) {
      const px = proximoPasso(l, hojeDe(agora));
      resultados.push({ leadId: l.id, nome: l.nome, passo: px?.passo.rotulo ?? null, resultado: 'nada', motivo: px ? `Nada para a IA agora. Próximo passo: ${px.passo.rotulo}, ${px.situacao === 'futura' ? `vence em ${px.vence.split('-').reverse().join('/')}` : px.passo.msg ? 'vence hoje' : 'passo manual'}` : 'Sem passo pendente agora: as regras do guia movem o lead com o passar dos dias' });
      continue;
    }
    const base = { leadId: l.id, nome: l.nome, passo: av.passo.rotulo, msg: av.passo.msg };
    if (av.tipo !== 'pronto') { resultados.push({ ...base, resultado: av.tipo, motivo: av.motivo }); continue; }
    if (feitos >= cfg.limites.porRodada) { resultados.push({ ...base, resultado: 'espera', motivo: `Fica para a próxima rodada (máximo de ${cfg.limites.porRodada} por rodada)` }); continue; }
    const m = textoDaMensagem(av.msg, av.parametros);
    const texto = `${MARCA}${av.modelo} · simulado\n${m?.texto ?? ''}`;
    try { aplicar(l, { tipo: 'contato', canal: 'whatsapp', naoFoiRecepcao: true, passo: av.passo.id, msg: av.msg, texto, atendente: 'IA', auto: true }, agora); }
    catch (e) { resultados.push({ ...base, resultado: 'pulado', motivo: (e as Error).message }); continue; }
    automatizar(l, agora); // como no envio de verdade
    feitos++;
    resultados.push({ ...base, resultado: 'enviaria', motivo: 'Todas as condições atendidas', texto: m?.texto });
  }
  guardar(estado, leadsDe(estado)); // força a gravação do que mudou nos leads de teste
  return { quando: agora.toISOString(), resultados };
}

/** O laboratório como a tela mostra, no instante escolhido. */
export function resumoLab(estado: Estado, agora: Date) {
  const cfg = configAuto(estado), hoje = hojeDe(agora);
  return {
    quando: agora.toISOString(), limite: LIMITE_LAB,
    leads: leadsDe(estado).map((l) => {
      const px = proximoPasso(l, hoje), av = avaliarLead(estado, l, agora, { ignorarLista: true }, cfg), r = checagens(estado, l, agora, cfg, { ignorarLista: true });
      return {
        id: l.id, nome: l.nome, telefone: l.telefone, valor: l.valor, unidade: l.unidade ?? '', exame: l.exame, atendente: l.atendente ?? '', tipo: l.noShow ? 'noshow' : 'orcamento', d0: l.d0, status: l.status,
        proximo: px ? { passo: px.passo.rotulo, msg: px.passo.msg ?? null, vence: px.vence, situacao: px.situacao } : null,
        decisao: av ? { tipo: av.tipo, motivo: av.tipo === 'pronto' ? 'Todas as condições atendidas' : av.motivo } : null,
        checks: r.checks,
        mensagens: l.eventos.filter((e) => e.tipo === 'contato' && e.auto === true).map((e) => ({ quando: e.quando, msg: e.msg ?? null, passo: e.passo ?? '', texto: e.texto.split('\n').slice(1).join('\n') })),
      };
    }),
  };
}
