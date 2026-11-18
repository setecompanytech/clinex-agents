import type { Estado } from './banco.js';
import { vistaDoLead, type Lead } from './motor.js';
import { etapaDe, moverCard, visiveis } from './pipeline/regras.js';
import type { Atribuicao, Etapa, Funil } from './pipeline/tipos.js';

/**
 * Conferência Pipelines × Fluxo. O Fluxo conta LEADS pela cadência do guia (Primeiro contato, Nova tentativa, Desconto...);
 * o Pipelines conta CARDS pela coluna onde cada um está. São duas fotos do mesmo orçamento e só batem se o card estiver na coluna
 * que o guia manda. Aqui mostramos, por etapa, quanto cada lado conta e POR QUE diferem (lead sem card, card sem lead, card em
 * outra coluna), listamos quem diverge e deixamos alinhar os cards ao Fluxo de uma vez.
 */

const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const ETAPAS_COMPARADAS: [string, string][] = [['aberto', 'Em aberto'], ['primeiro', 'Primeiro contato'], ['tentativa', 'Nova tentativa'], ['desconto', 'Desconto'], ['semretorno', 'Sem retorno'], ['retorno', 'Retorno personalizado'], ['negociacao', 'Em negociação'], ['agendado', 'Agendado'], ['ativo', 'Convertido ativo'], ['organico', 'Convertido orgânico'], ['descarte', 'Descarte']];
/** Etapas de TRABALHO: o card só sai delas por movimento do guia/da equipe; as demais (negociação, agendado, convertidos, descarte) já são sincronizadas pelo status do lead. */
const TRABALHO = new Set(['aberto', 'primeiro', 'tentativa', 'desconto', 'semretorno', 'retorno']);

/** O item do Fluxo que a coluna do card representa. */
export function itemDaEtapa(label: string): string | null {
  const n = norm(label);
  if (/convert/.test(n)) return /organ/.test(n) ? 'organico' : 'ativo';
  if (/sem retorno/.test(n)) return 'semretorno';
  if (/perd|descart/.test(n)) return 'descarte';
  if (/retorno personalizado/.test(n)) return 'retorno';
  if (/em negociac/.test(n)) return 'negociacao';
  if (/agendad/.test(n)) return 'agendado';
  if (/primeiro contato/.test(n)) return 'primeiro';
  if (/nova tentativa/.test(n)) return 'tentativa';
  if (/desconto/.test(n)) return 'desconto';
  if (/em aberto/.test(n)) return 'aberto';
  return null;
}
const etapaDoItem = (f: Funil, item: string): Etapa | undefined => f.stages.find((e) => itemDaEtapa(e.label) === item);
const itemDoLeadNaConferencia = (l: Lead, agora: Date) => { const i = vistaDoLead(l, agora).item; return i === 'reativacao' ? 'descarte' : i; };

export type Divergencia = { leadId: string; cardId: string; nome: string; fluxo: string; pipeline: string; alinhavel: boolean; motivo?: string };
export type LinhaConferencia = { item: string; rotulo: string; fluxo: number; pipeline: number; semCard: number; semLead: number; cardEmOutra: number; leadEmOutro: number };

export function conferir(estado: Estado, agora: Date) {
  const f = estado.pipelines.funis.find((x) => x.dimensao === 'orcamento');
  if (!f) return { funil: null as string | null, linhas: [] as LinhaConferencia[], divergencias: [] as Divergencia[], totais: { fluxo: 0, pipeline: 0, divergentes: 0, alinhaveis: 0 } };
  const cards = visiveis(f, estado.pipelines.atribuicoes).filter((a) => a.funilId === f.id);
  const porCard = new Map(cards.map((a) => [a.cardId, a]));
  const leads = estado.leads.filter((l) => !l.demo);
  const leadDoCard = new Map<string, Lead>(); for (const l of leads) if (l.cardId && porCard.has(l.cardId)) leadDoCard.set(l.cardId, l);
  const linhas = new Map(ETAPAS_COMPARADAS.map(([item, rotulo]) => [item, { item, rotulo, fluxo: 0, pipeline: 0, semCard: 0, semLead: 0, cardEmOutra: 0, leadEmOutro: 0 } as LinhaConferencia]));
  const divergencias: Divergencia[] = [];
  const rotulo = (i: string) => ETAPAS_COMPARADAS.find(([k]) => k === i)?.[1] ?? i;
  const etapaAtual = (a: Atribuicao) => etapaDe(f, a.stageId);

  for (const l of leads) {
    const item = itemDoLeadNaConferencia(l, agora), li = linhas.get(item); if (!li) continue;
    li.fluxo++;
    const a = l.cardId ? porCard.get(l.cardId) : undefined;
    if (!a) { li.semCard++; continue; }
    const e = etapaAtual(a), cardItem = e ? itemDaEtapa(e.label) : null;
    if (cardItem === item) continue;
    li.cardEmOutra++;
    let alinhavel = false, motivo: string | undefined;
    const alvo = etapaDoItem(f, item);
    if (!cardItem) motivo = 'A coluna do card não tem equivalente no Fluxo.';
    else if (!TRABALHO.has(cardItem) && cardItem !== 'negociacao') motivo = 'O card está numa coluna de status (agendado, convertido, descarte...): vale o último movimento, e a sincronização automática resolve.';
    else if (!TRABALHO.has(item) && item !== 'negociacao') motivo = 'O lead já está em uma etapa de status: a sincronização automática move o card ou o lead (vale o último movimento).';
    else if (!alvo) motivo = 'O funil não tem coluna para esta etapa do Fluxo.';
    else if (alvo.id === f.stages[0].id) motivo = 'Um card não volta para a primeira coluna (Em aberto) depois de sair dela.';
    else alinhavel = true;
    divergencias.push({ leadId: l.id, cardId: a.cardId, nome: l.nome, fluxo: rotulo(item), pipeline: rotulo(cardItem ?? '?'), alinhavel, motivo });
  }
  for (const a of cards) {
    const e = etapaAtual(a), item = e ? itemDaEtapa(e.label) : null, li = item ? linhas.get(item) : undefined; if (!li) continue;
    li.pipeline++;
    const l = leadDoCard.get(a.cardId);
    if (!l) li.semLead++; else if (itemDoLeadNaConferencia(l, agora) !== item) li.leadEmOutro++;
  }
  const lista = [...linhas.values()];
  return {
    funil: f.nome as string | null, linhas: lista,
    divergencias: divergencias.sort((x, y) => Number(y.alinhavel) - Number(x.alinhavel) || x.nome.localeCompare(y.nome)).slice(0, 300),
    totais: { fluxo: lista.reduce((s, x) => s + x.fluxo, 0), pipeline: lista.reduce((s, x) => s + x.pipeline, 0), divergentes: divergencias.length, alinhaveis: divergencias.filter((d) => d.alinhavel).length },
  };
}

/** Move os cards que o Fluxo e o Pipelines contam de forma diferente para a coluna do Fluxo. Só mexe em cards de etapas de trabalho; o resto fica com a sincronização por status. */
export function alinharCardsAoFluxo(estado: Estado, agora: Date, por: string): { movidos: number; ignorados: { nome: string; motivo: string }[] } {
  const f = estado.pipelines.funis.find((x) => x.dimensao === 'orcamento');
  if (!f) return { movidos: 0, ignorados: [] };
  const cards = new Map(visiveis(f, estado.pipelines.atribuicoes).filter((a) => a.funilId === f.id).map((a) => [a.cardId, a]));
  let movidos = 0; const ignorados: { nome: string; motivo: string }[] = [];
  for (const l of estado.leads) {
    const a = l.cardId ? cards.get(l.cardId) : undefined; if (!a) continue;
    const item = itemDoLeadNaConferencia(l, agora), e = etapaDe(f, a.stageId), cardItem = e ? itemDaEtapa(e.label) : null;
    if (!cardItem || cardItem === item || (!TRABALHO.has(cardItem) && cardItem !== 'negociacao') || (!TRABALHO.has(item) && item !== 'negociacao')) continue;
    const alvo = etapaDoItem(f, item); if (!alvo) continue;
    try { if (moverCard(a, f, alvo.id, agora, { por, manual: false })) movidos++; }
    catch (er) { ignorados.push({ nome: l.nome, motivo: (er as Error).message }); }
  }
  return { movidos, ignorados };
}
