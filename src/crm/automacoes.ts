import { randomUUID } from 'node:crypto';
import { CFG_PADRAO, diffDias, executarAcaoAuto, hojeDe, RegraError, type AcaoAuto, type CfgAuto, type Lead } from './motor.js';
import { MOTIVOS_DESCARTE } from './modelo.js';

/**
 * Automações do pipeline. Duas vêm do guia (builtin, só se ajusta o prazo e se liga/desliga) e a equipe cria as
 * suas: GATILHO + FILTROS + AÇÕES. Tudo puro: o relógio entra por `agora` e o armazenamento fica em banco.ts.
 */

export type EtapaAuto = 'aberto' | 'sem_retorno' | 'negociacao' | 'agendado';
export type Gatilho =
  | { tipo: 'parado_etapa'; etapa: EtapaAuto; dias: number }
  | { tipo: 'sem_contato'; dias: number }
  | { tipo: 'lead_novo'; dias: number }
  | { tipo: 'agendamento_proximo'; dias: number }
  | { tipo: 'no_show'; dias: number }
  | { tipo: 'builtin_sem_resposta'; dia: number }
  | { tipo: 'builtin_descarte'; dias: number };
export type Filtros = { unidade?: string; atendente?: string; valorMin?: number; valorMax?: number };
export type Regra = {
  id: string; nome: string; descricao?: string; ativa: boolean; builtin?: boolean;
  gatilho: Gatilho; filtros: Filtros; acoes: AcaoAuto[];
  criadaEm: string; execucoes: number; ultima?: string;
};
export type LogAuto = { id: string; quando: string; regraId: string; regraNome: string; leadId: string; leadNome: string; resumo: string; alerta?: boolean };

export const ID_SEM_RESPOSTA = 'builtin-sem-resposta';
export const ID_D8 = 'builtin-d8';

export function regrasPadrao(agora: Date): Regra[] {
  const t = agora.toISOString();
  return [
    { id: ID_SEM_RESPOSTA, nome: 'Sem resposta ao 1º contato → Sem retorno', descricao: 'Do guia. Contatou em Em aberto e o paciente não respondeu: o lead segue para Sem retorno, com a nova tentativa no dia escolhido.', ativa: true, builtin: true, gatilho: { tipo: 'builtin_sem_resposta', dia: CFG_PADRAO.semResposta.dia }, filtros: {}, acoes: [{ tipo: 'mover', para: 'sem_retorno' }], criadaEm: t, execucoes: 0 },
    { id: ID_D8, nome: 'Encerramento sem resposta → Descarte', descricao: 'Do guia. Depois do aviso de encerramento (D7) sem resposta, o lead é descartado com o motivo "Sem retorno".', ativa: true, builtin: true, gatilho: { tipo: 'builtin_descarte', dias: CFG_PADRAO.descarteD8.dias }, filtros: {}, acoes: [{ tipo: 'descartar', motivo: 'Sem retorno' }], criadaEm: t, execucoes: 0 },
  ];
}

export function cfgDeRegras(regras: Regra[]): CfgAuto {
  const a = regras.find((r) => r.id === ID_SEM_RESPOSTA), b = regras.find((r) => r.id === ID_D8);
  return {
    semResposta: { ativa: a ? a.ativa : true, dia: a && a.gatilho.tipo === 'builtin_sem_resposta' ? a.gatilho.dia : CFG_PADRAO.semResposta.dia },
    descarteD8: { ativa: b ? b.ativa : true, dias: b && b.gatilho.tipo === 'builtin_descarte' ? b.gatilho.dias : CFG_PADRAO.descarteD8.dias },
  };
}

/** Modelos prontos para a equipe começar (a pessoa edita antes de salvar). */
export const MODELOS: Omit<Regra, 'id' | 'criadaEm' | 'execucoes' | 'ultima'>[] = [
  { nome: 'Orçamento alto parado → alerta', descricao: 'Avisa quando um orçamento grande fica parado em negociação.', ativa: true, gatilho: { tipo: 'parado_etapa', etapa: 'negociacao', dias: 3 }, filtros: { valorMin: 1000 }, acoes: [{ tipo: 'alerta', texto: '[Nome] tem orçamento de [Valor] parado. Ligue hoje.' }, { tipo: 'etiqueta', texto: 'Alto valor parado' }] },
  { nome: 'Lead esfriando → etiqueta', descricao: 'Marca leads ativos sem nenhum contato há dias.', ativa: true, gatilho: { tipo: 'sem_contato', dias: 4 }, filtros: {}, acoes: [{ tipo: 'etiqueta', texto: 'Esfriando' }] },
  { nome: 'Agendamento amanhã → lembrete', descricao: 'Deixa uma nota e um alerta na véspera da consulta.', ativa: true, gatilho: { tipo: 'agendamento_proximo', dias: 1 }, filtros: {}, acoes: [{ tipo: 'alerta', texto: '[Nome] tem [Exame] amanhã. Confirme a presença.' }] },
  { nome: 'Negociação sem avanço → Sem retorno', descricao: 'Quem fica parado muito tempo em negociação volta para a cadência de Sem retorno.', ativa: true, gatilho: { tipo: 'parado_etapa', etapa: 'negociacao', dias: 10 }, filtros: {}, acoes: [{ tipo: 'mover', para: 'sem_retorno' }, { tipo: 'nota', texto: 'Voltou para Sem retorno por falta de avanço.' }] },
  { nome: 'Sem retorno longo → descartar', descricao: 'Descarta quem passou do prazo da etapa sem responder.', ativa: true, gatilho: { tipo: 'parado_etapa', etapa: 'sem_retorno', dias: 10 }, filtros: {}, acoes: [{ tipo: 'descartar', motivo: 'Sem retorno' }] },
  { nome: 'Lead novo de valor alto → responsável', descricao: 'Leads novos de orçamento grande vão direto para a pessoa mais experiente.', ativa: true, gatilho: { tipo: 'lead_novo', dias: 0 }, filtros: { valorMin: 1500 }, acoes: [{ tipo: 'atribuir', atendente: '' }, { tipo: 'etiqueta', texto: 'Prioridade' }] },
  { nome: 'No show parado → alerta', descricao: 'Avisa quando um no show segue sem remarcação.', ativa: true, gatilho: { tipo: 'no_show', dias: 2 }, filtros: {}, acoes: [{ tipo: 'alerta', texto: '[Nome] faltou e ainda não remarcou.' }] },
];

// ------------------------------------------------------------------------------------------------ validação

const ETAPAS: EtapaAuto[] = ['aberto', 'sem_retorno', 'negociacao', 'agendado'];
const inteiro = (v: unknown, min: number, max: number, campo: string) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new RegraError('dados', `${campo}: use um número inteiro entre ${min} e ${max}.`);
  return n;
};
const texto = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

export function validarRegra(b: unknown, atual?: Regra): Omit<Regra, 'id' | 'criadaEm' | 'execucoes' | 'ultima'> {
  const o = (b ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const nome = texto(o.nome, 80);
  if (!nome) throw new RegraError('dados', 'Dê um nome à automação.');
  const ativa = o.ativa !== false;
  const g = (o.gatilho ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (atual?.builtin) {
    // do guia: só liga/desliga e o prazo
    const gat: Gatilho = atual.gatilho.tipo === 'builtin_sem_resposta' ? { tipo: 'builtin_sem_resposta', dia: inteiro(g.dia ?? atual.gatilho.dia, 1, 5, 'Dia da nova tentativa') } : { tipo: 'builtin_descarte', dias: inteiro(g.dias ?? (atual.gatilho as { dias: number }).dias, 1, 5, 'Dias após o encerramento') };
    return { nome: atual.nome, descricao: atual.descricao, ativa, builtin: true, gatilho: gat, filtros: {}, acoes: atual.acoes };
  }
  let gatilho: Gatilho;
  switch (g.tipo) {
    case 'parado_etapa': {
      if (!ETAPAS.includes(g.etapa)) throw new RegraError('dados', 'Escolha a etapa do gatilho.');
      gatilho = { tipo: 'parado_etapa', etapa: g.etapa, dias: inteiro(g.dias, 1, 90, 'Dias parado') }; break;
    }
    case 'sem_contato': gatilho = { tipo: 'sem_contato', dias: inteiro(g.dias, 1, 60, 'Dias sem contato') }; break;
    case 'lead_novo': gatilho = { tipo: 'lead_novo', dias: inteiro(g.dias, 0, 30, 'Dias desde a entrada') }; break;
    case 'agendamento_proximo': gatilho = { tipo: 'agendamento_proximo', dias: inteiro(g.dias, 0, 30, 'Dias antes da consulta') }; break;
    case 'no_show': gatilho = { tipo: 'no_show', dias: inteiro(g.dias, 0, 30, 'Dias de no show') }; break;
    default: throw new RegraError('dados', 'Escolha o gatilho (quando a automação dispara).');
  }
  const f = (o.filtros ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const filtros: Filtros = {};
  if (texto(f.unidade, 60)) filtros.unidade = texto(f.unidade, 60);
  if (texto(f.atendente, 60)) filtros.atendente = texto(f.atendente, 60);
  if (f.valorMin !== undefined && f.valorMin !== '' && f.valorMin !== null) { const n = Number(f.valorMin); if (!Number.isFinite(n) || n < 0) throw new RegraError('dados', 'Valor mínimo inválido.'); filtros.valorMin = n; }
  if (f.valorMax !== undefined && f.valorMax !== '' && f.valorMax !== null) { const n = Number(f.valorMax); if (!Number.isFinite(n) || n < 0) throw new RegraError('dados', 'Valor máximo inválido.'); filtros.valorMax = n; }
  if (filtros.valorMin !== undefined && filtros.valorMax !== undefined && filtros.valorMin > filtros.valorMax) throw new RegraError('dados', 'O valor mínimo é maior que o máximo.');
  const lista = Array.isArray(o.acoes) ? o.acoes : [];
  if (!lista.length) throw new RegraError('dados', 'Adicione pelo menos uma ação.');
  if (lista.length > 4) throw new RegraError('dados', 'No máximo 4 ações por automação.');
  const acoes: AcaoAuto[] = lista.map((a: Record<string, any>) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    switch (a?.tipo) {
      case 'mover': if (a.para !== 'sem_retorno' && a.para !== 'negociacao') throw new RegraError('dados', 'Mover: escolha Sem retorno ou Em negociação.'); return { tipo: 'mover', para: a.para };
      case 'descartar': if (!(MOTIVOS_DESCARTE as readonly string[]).includes(a.motivo)) throw new RegraError('motivo', 'Descarte sempre com motivo: escolha um da lista.'); return { tipo: 'descartar', motivo: a.motivo };
      case 'atribuir': { const t = texto(a.atendente, 60); if (!t) throw new RegraError('dados', 'Atribuir: informe o responsável.'); return { tipo: 'atribuir', atendente: t }; }
      case 'etiqueta': { const t = texto(a.texto, 30); if (!t) throw new RegraError('dados', 'Etiqueta: escreva o texto.'); return { tipo: 'etiqueta', texto: t }; }
      case 'nota': { const t = texto(a.texto, 300); if (!t) throw new RegraError('dados', 'Nota: escreva o texto.'); return { tipo: 'nota', texto: t }; }
      case 'alerta': { const t = texto(a.texto, 300); if (!t) throw new RegraError('dados', 'Alerta: escreva o texto.'); return { tipo: 'alerta', texto: t }; }
      default: throw new RegraError('dados', 'Ação desconhecida.');
    }
  });
  // mover/descartar antes de qualquer outra ação que dependa do estado: ordena para que o lead mude de etapa por último não é necessário;
  // mas depois de descartar nenhuma outra mudança de etapa faz sentido
  const iDesc = acoes.findIndex((a) => a.tipo === 'descartar');
  if (iDesc >= 0 && acoes.some((a, i) => i > iDesc && (a.tipo === 'mover' || a.tipo === 'descartar'))) throw new RegraError('dados', 'Depois de descartar não dá para mover ou descartar de novo.');
  return { nome, descricao: texto(o.descricao, 200) || undefined, ativa, gatilho, filtros, acoes };
}

// ------------------------------------------------------------------------------------------------ casamento e execução

const ATIVOS = ['aberto', 'sem_retorno', 'negociacao'];

function passaFiltros(l: Lead, f: Filtros): boolean {
  if (f.unidade && (l.unidade || '') !== f.unidade) return false;
  if (f.atendente && (l.atendente || '') !== f.atendente) return false;
  if (f.valorMin !== undefined && l.valor < f.valorMin) return false;
  if (f.valorMax !== undefined && l.valor > f.valorMax) return false;
  return true;
}

function ultimoContato(l: Lead): string {
  const c = l.eventos.filter((e) => e.tipo === 'contato' || e.tipo === 'resposta');
  return (c.length ? c[c.length - 1].quando : l.criadoEm).slice(0, 10);
}

const chave = (r: Regra, l: Lead) => `${r.id}:${l.faseId}${r.gatilho.tipo === 'agendamento_proximo' ? `:${l.agendamento?.data ?? ''}` : ''}`;

/** O lead cumpre o gatilho e os filtros agora, e a regra ainda não rodou nele nesta passagem? */
export function casa(l: Lead, r: Regra, agora: Date): boolean {
  if (r.builtin) return false; // as do guia rodam dentro do motor
  const hoje = hojeDe(agora);
  const g = r.gatilho;
  if (l.autoRegras?.[chave(r, l)]) return false;
  if (!passaFiltros(l, r.filtros)) return false;
  switch (g.tipo) {
    case 'parado_etapa': {
      if (l.status !== g.etapa) return false;
      const desde = l.status === 'aberto' ? l.d0 : l.statusDesde;
      return diffDias(desde, hoje) >= g.dias;
    }
    case 'sem_contato': return ATIVOS.includes(l.status) && diffDias(ultimoContato(l), hoje) >= g.dias;
    case 'lead_novo': return l.status === 'aberto' && diffDias(l.d0, hoje) >= g.dias && diffDias(l.d0, hoje) <= g.dias + 7;
    case 'agendamento_proximo': return l.status === 'agendado' && !!l.agendamento && diffDias(hoje, l.agendamento.data) === g.dias;
    case 'no_show': return l.status === 'negociacao' && !!l.noShow && diffDias(l.statusDesde, hoje) >= g.dias;
    default: return false;
  }
}

export type Quem = { id: string; nome: string; valor: number; etapa: string };
/** O que aconteceria se esta regra rodasse agora (sem alterar nada). */
export function simular(leads: Lead[], r: Regra, agora: Date): { total: number; valor: number; amostra: Quem[] } {
  const quem = leads.filter((l) => casa(l, r, agora));
  return { total: quem.length, valor: quem.reduce((s, l) => s + l.valor, 0), amostra: quem.slice(0, 12).map((l) => ({ id: l.id, nome: l.nome, valor: l.valor, etapa: l.status })) };
}

/** Roda as regras ativas nos leads. Devolve o que foi feito (para o registro de atividade). */
export function rodarRegras(leads: Lead[], regras: Regra[], agora: Date): LogAuto[] {
  const log: LogAuto[] = [];
  for (const r of regras) {
    if (!r.ativa || r.builtin) continue;
    for (const l of leads) {
      if (!casa(l, r, agora)) continue;
      const feitos: string[] = [];
      let alerta = false;
      for (const a of r.acoes) {
        try { feitos.push(executarAcaoAuto(l, a, agora, r.nome)); if (a.tipo === 'alerta') alerta = true; } catch (e) { if (!(e instanceof RegraError)) throw e; }
      }
      // marca mesmo se nada coube, para não tentar de novo a cada 10 minutos neste mesmo ponto da jornada
      l.autoRegras = { ...(l.autoRegras ?? {}), [chave(r, l)]: agora.toISOString() };
      if (!feitos.length) continue;
      r.execucoes++; r.ultima = agora.toISOString();
      log.push({ id: randomUUID().slice(0, 8), quando: agora.toISOString(), regraId: r.id, regraNome: r.nome, leadId: l.id, leadNome: l.nome, resumo: feitos.join(' · '), alerta: alerta || undefined });
    }
  }
  return log;
}

/** Registra no log as automações do guia que o motor aplicou (compara a etapa antes e depois). */
export function logDoGuia(antes: Map<string, string>, leads: Lead[], regras: Regra[], agora: Date): LogAuto[] {
  const out: LogAuto[] = [];
  for (const l of leads) {
    const de = antes.get(l.id);
    if (!de || de === l.status) continue;
    const id = de === 'aberto' && l.status === 'sem_retorno' ? ID_SEM_RESPOSTA : de === 'sem_retorno' && l.status === 'descarte' ? ID_D8 : null;
    const r = id ? regras.find((x) => x.id === id) : null;
    if (!r) continue;
    r.execucoes++; r.ultima = agora.toISOString();
    out.push({ id: randomUUID().slice(0, 8), quando: agora.toISOString(), regraId: r.id, regraNome: r.nome, leadId: l.id, leadNome: l.nome, resumo: id === ID_D8 ? 'descartado (Sem retorno)' : 'movido para Sem retorno' });
  }
  return out;
}
