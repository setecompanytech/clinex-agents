import type { Estado } from './banco.js';
import { acompanharCard, type EventoLead, type Lead } from './motor.js';
import type { Status } from './modelo.js';
import { classeDaEtapa, etapaDe, moverCard } from './pipeline/regras.js';
import type { Atribuicao, Etapa, Funil } from './pipeline/tipos.js';

/**
 * O lead (telas Hoje, Leads, Funil) e o card (quadro de Pipelines) são o mesmo orçamento: o que acontece em um precisa
 * aparecer no outro. Vale o que foi mudado por último:
 *  - card movido depois da última mudança do lead  -> o lead acompanha (convertido, agendado, descartado, em negociação);
 *  - lead mudado depois do último movimento do card -> o card vai para a etapa correspondente.
 * Idempotente: se os dois já dizem a mesma coisa, não faz nada. Chame depois de qualquer mudança em um dos lados.
 */

const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const MUDANCAS = new Set(['etapa', 'agendamento', 'descarte', 'recepcao', 'comparecimento']);

/** O status que uma etapa do card representa para o lead (null = etapa de trabalho, que não muda o status). */
export function statusDaEtapa(e: Etapa): Status | null {
  const c = classeDaEtapa(e.label);
  if (c === 'ganho_ativo') return 'convertido_ativo';
  if (c === 'ganho_organico') return 'convertido_organico';
  if (c === 'agendado') return 'agendado';
  if (c === 'perda') return 'descarte';
  if (c === 'aberto' && /em negociacao/.test(norm(e.label))) return 'negociacao';
  return null;
}

/** A etapa do funil que corresponde a um status do lead (null = o lead não tem etapa própria no funil). */
export function etapaDoStatus(f: Funil, s: Status): Etapa | undefined {
  const por = (fn: (e: Etapa) => boolean) => f.stages.find(fn);
  switch (s) {
    case 'convertido_ativo': return por((e) => classeDaEtapa(e.label) === 'ganho_ativo');
    case 'convertido_organico': return por((e) => classeDaEtapa(e.label) === 'ganho_organico');
    case 'agendado': return por((e) => classeDaEtapa(e.label) === 'agendado');
    case 'negociacao': return por((e) => /em negociacao/.test(norm(e.label)));
    case 'descarte': return por((e) => /descart/.test(norm(e.label))) ?? por((e) => classeDaEtapa(e.label) === 'perda');
    default: return undefined;
  }
}

/** Nomes que não são uma pessoa do time: o sistema, a IA, o WhatsApp, o acesso mestre compartilhado. */
const NAO_PESSOA = new Set(['', 'ia', 'whatsapp', 'crm', 'crm (lead)', 'painel', 'sistema', 'acesso mestre', 'painel (api)']);
export const ehPessoa = (nome?: string) => !NAO_PESSOA.has((nome ?? '').trim().toLowerCase());
/** O que conta como "movimentar o lead": contato, resposta, mudança de etapa, agendamento, retorno, descarte, comparecimento e recepção. */
const MOVIMENTOS = new Set(['contato', 'resposta', 'etapa', 'agendamento', 'retorno', 'descarte', 'comparecimento', 'recepcao']);

/**
 * Responsável = a PRIMEIRA pessoa que movimentou o lead: o autor do primeiro movimento feito por uma pessoa, olhando os
 * eventos do lead e os movimentos do card no Pipelines (o 1º registro do histórico do card é a entrada dele, não um movimento).
 * Quem já tem responsável definido nunca é trocado. Null se ninguém (de verdade) mexeu ainda.
 */
export function primeiroResponsavel(l: Lead, a?: Atribuicao): string | null {
  let melhor: { t: number; nome: string } | null = null;
  const ver = (quando: string, nome?: string) => { const t = Date.parse(quando); if (t && ehPessoa(nome) && (!melhor || t < melhor.t)) melhor = { t, nome: nome!.trim() }; };
  for (const e of l.eventos as EventoLead[]) if (MOVIMENTOS.has(e.tipo)) ver(e.quando, e.atendente);
  if (a) for (const m of a.historico.slice(1)) ver(m.em, m.por);
  return (melhor as { nome: string } | null)?.nome ?? null;
}

const quandoDoLead = (l: Lead) => l.eventos.reduce((m, e) => (MUDANCAS.has(e.tipo) ? Math.max(m, Date.parse(e.quando) || 0) : m), 0);
/** Um card que nunca saiu da entrada não conta como "movido": o horário dele é só o da ingestão. */
const quandoDoCard = (a: Atribuicao) => (a.historico.length > 1 ? Date.parse(a.enteredAt) || 0 : 0);

export function alinharCardsELeads(estado: Estado, agora: Date): { leads: number; cards: number } {
  let leads = 0, cards = 0;
  const atribs = new Map(estado.pipelines.atribuicoes.map((a) => [a.cardId, a]));
  for (const l of estado.leads) {
    const a = l.cardId ? atribs.get(l.cardId) : undefined;
    if (!a || a.caseStatus === 'removido') continue;
    const f = estado.pipelines.funis.find((x) => x.id === a.funilId);
    const etapa = f && etapaDe(f, a.stageId);
    if (!f || !etapa) continue;
    const doCard = statusDaEtapa(etapa);
    if (doCard === l.status) continue; // já dizem a mesma coisa
    const tCard = quandoDoCard(a), tLead = quandoDoLead(l);
    if (tCard > 0 && tCard >= tLead) {
      const por = a.historico[a.historico.length - 1]?.por;
      if (doCard && acompanharCard(l, doCard, agora, etapa.label, ehPessoa(por) ? por : undefined)) leads++;
    } else if (tLead > tCard) {
      const alvo = etapaDoStatus(f, l.status);
      try { if (alvo && alvo.id !== a.stageId && moverCard(a, f, alvo.id, agora, { por: 'CRM (lead)', manual: true })) cards++; }
      catch { /* regra do funil (ex.: não volta ao topo): o card fica onde está */ }
    }
  }
  return { leads, cards };
}

/**
 * Define o responsável dos leads que ainda não têm: a primeira pessoa que os movimentou (ver primeiroResponsavel). Roda junto
 * com o alinhamento card e lead, então vale para o que já existe e para tudo que acontecer daqui para frente. Devolve quantos
 * leads ganharam responsável (quem chama salva se for maior que zero).
 */
export function atribuirResponsaveis(estado: Estado): number {
  const atribs = new Map(estado.pipelines.atribuicoes.map((a) => [a.cardId, a]));
  let n = 0;
  for (const l of estado.leads) {
    if (l.atendente?.trim()) continue;
    const quem = primeiroResponsavel(l, l.cardId ? atribs.get(l.cardId) : undefined);
    if (quem) { l.atendente = quem; n++; }
  }
  return n;
}
