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
export const etapaDoItem = (f: Funil, item: string): Etapa | undefined => f.stages.find((e) => itemDaEtapa(e.label) === item);
const itemDoLeadNaConferencia = (l: Lead, agora: Date) => { const i = vistaDoLead(l, agora).item; return i === 'reativacao' ? 'descarte' : i; };

export type Divergencia = { leadId: string; cardId: string; nome: string; fluxo: string; pipeline: string; alinhavel: boolean; motivo?: string; statusSugerido: string | null };
/** Em que status o lead precisa estar para ficar na mesma etapa que a coluna onde o card está (usado em "Mudar o lead para onde o card está"). */
const STATUS_DO_ITEM: Record<string, string> = { aberto: 'aberto', primeiro: 'aberto', tentativa: 'sem_retorno', desconto: 'sem_retorno', semretorno: 'sem_retorno', retorno: 'retorno', negociacao: 'negociacao', agendado: 'agendado', ativo: 'convertido_ativo', organico: 'convertido_organico', descarte: 'descarte' };
/** Quem não tem par do outro lado: lead sem card visível (sem card, card removido do funil, card em outro funil) ou card sem lead. */
export type SemPar = { tipo: 'lead_sem_card' | 'card_sem_lead'; leadId: string | null; cardId: string | null; nome: string; etapa: string; motivo: string };
export type LinhaConferencia = { item: string; rotulo: string; fluxo: number; pipeline: number; semCard: number; semLead: number; cardEmOutra: number; leadEmOutro: number };

export function conferir(estado: Estado, agora: Date) {
  const f = estado.pipelines.funis.find((x) => x.dimensao === 'orcamento');
  if (!f) return { funil: null as string | null, linhas: [] as LinhaConferencia[], divergencias: [] as Divergencia[], semPar: [] as SemPar[], totais: { fluxo: 0, pipeline: 0, divergentes: 0, alinhaveis: 0 } };
  const cards = visiveis(f, estado.pipelines.atribuicoes).filter((a) => a.funilId === f.id);
  const porCard = new Map(cards.map((a) => [a.cardId, a]));
  const leads = estado.leads.filter((l) => !l.demo);
  const leadDoCard = new Map<string, Lead>(); for (const l of leads) if (l.cardId && porCard.has(l.cardId)) leadDoCard.set(l.cardId, l);
  const linhas = new Map(ETAPAS_COMPARADAS.map(([item, rotulo]) => [item, { item, rotulo, fluxo: 0, pipeline: 0, semCard: 0, semLead: 0, cardEmOutra: 0, leadEmOutro: 0 } as LinhaConferencia]));
  const divergencias: Divergencia[] = [];
  const semPar: SemPar[] = [];
  const atribDe = new Map(estado.pipelines.atribuicoes.map((x) => [x.cardId, x]));
  const rotulo = (i: string) => ETAPAS_COMPARADAS.find(([k]) => k === i)?.[1] ?? i;
  const etapaAtual = (a: Atribuicao) => etapaDe(f, a.stageId);

  for (const l of leads) {
    const item = itemDoLeadNaConferencia(l, agora), li = linhas.get(item); if (!li) continue;
    li.fluxo++;
    const a = l.cardId ? porCard.get(l.cardId) : undefined;
    if (!a) {
      li.semCard++;
      const orig = l.cardId ? atribDe.get(l.cardId) : undefined;
      const motivo = !l.cardId ? 'Lead cadastrado à mão (não veio de um card do Clinilink).' : !orig ? 'O card deste lead não existe mais nos Pipelines.' : orig.caseStatus === 'removido' ? 'O card foi removido do funil (o lead continua no Fluxo).' : orig.funilId !== f.id ? 'O card está em outro funil.' : 'O card não aparece nos Pipelines (filtro do funil).';
      semPar.push({ tipo: 'lead_sem_card', leadId: l.id, cardId: l.cardId ?? null, nome: l.nome, etapa: rotulo(item), motivo });
      continue;
    }
    const e = etapaAtual(a), cardItem = e ? itemDaEtapa(e.label) : null;
    if (cardItem === item) continue;
    li.cardEmOutra++;
    let alinhavel = false, motivo: string | undefined;
    const alvo = etapaDoItem(f, item);
    if (!cardItem) motivo = 'A coluna do card não tem equivalente no Fluxo.';
    else if (!TRABALHO.has(cardItem) && cardItem !== 'negociacao') motivo = 'O card está numa coluna de status (agendado, convertido, descarte...): vale o último movimento, e a sincronização automática resolve.';
    else if (!TRABALHO.has(item) && item !== 'negociacao') motivo = 'O lead já está em uma etapa de status: a sincronização automática move o card ou o lead (vale o último movimento).';
    else if (!alvo) motivo = 'O funil não tem coluna para esta etapa do Fluxo.';
    else if (alvo.id === f.stages[0].id) motivo = 'Um card não volta para a primeira coluna (Em aberto) depois de sair dela. Para igualar, registre o contato feito no lead (Registrar contato).';
    else alinhavel = true;
    divergencias.push({ leadId: l.id, cardId: a.cardId, nome: l.nome, fluxo: rotulo(item), pipeline: rotulo(cardItem ?? '?'), alinhavel, motivo, statusSugerido: cardItem && STATUS_DO_ITEM[cardItem] && STATUS_DO_ITEM[cardItem] !== STATUS_DO_ITEM[item] ? STATUS_DO_ITEM[cardItem] : null });
  }
  for (const a of cards) {
    const e = etapaAtual(a), item = e ? itemDaEtapa(e.label) : null, li = item ? linhas.get(item) : undefined; if (!li) continue;
    li.pipeline++;
    const l = leadDoCard.get(a.cardId);
    if (!l) { li.semLead++; semPar.push({ tipo: 'card_sem_lead', leadId: null, cardId: a.cardId, nome: a.ultimoSnapshot.paciente, etapa: rotulo(item ?? '?'), motivo: 'Este card ainda não tem lead no Fluxo.' }); } else if (itemDoLeadNaConferencia(l, agora) !== item) li.leadEmOutro++;
  }
  const lista = [...linhas.values()];
  return {
    funil: f.nome as string | null, linhas: lista,
    semPar: semPar.sort((x, y) => x.tipo.localeCompare(y.tipo) || x.nome.localeCompare(y.nome)).slice(0, 300),
    divergencias: divergencias.sort((x, y) => Number(y.alinhavel) - Number(x.alinhavel) || x.nome.localeCompare(y.nome)).slice(0, 300),
    totais: { fluxo: lista.reduce((s, x) => s + x.fluxo, 0), pipeline: lista.reduce((s, x) => s + x.pipeline, 0), divergentes: divergencias.length, alinhaveis: divergencias.filter((d) => d.alinhavel).length },
  };
}

/** Move os cards que o Fluxo e o Pipelines contam de forma diferente para a coluna do Fluxo. Só mexe em cards de etapas de trabalho; o resto fica com a sincronização por status. */
export function alinharCardsAoFluxo(estado: Estado, agora: Date, por: string, soLeadId?: string): { movidos: number; ignorados: { nome: string; motivo: string }[] } {
  const f = estado.pipelines.funis.find((x) => x.dimensao === 'orcamento');
  if (!f) return { movidos: 0, ignorados: [] };
  const cards = new Map(visiveis(f, estado.pipelines.atribuicoes).filter((a) => a.funilId === f.id).map((a) => [a.cardId, a]));
  let movidos = 0; const ignorados: { nome: string; motivo: string }[] = [];
  for (const l of estado.leads) {
    if (soLeadId && l.id !== soLeadId) continue;
    const a = l.cardId ? cards.get(l.cardId) : undefined; if (!a) continue;
    const item = itemDoLeadNaConferencia(l, agora), e = etapaDe(f, a.stageId), cardItem = e ? itemDaEtapa(e.label) : null;
    if (!cardItem || cardItem === item || (!TRABALHO.has(cardItem) && cardItem !== 'negociacao') || (!TRABALHO.has(item) && item !== 'negociacao')) continue;
    const alvo = etapaDoItem(f, item); if (!alvo) continue;
    try { if (moverCard(a, f, alvo.id, agora, { por, manual: false })) movidos++; }
    catch (er) { ignorados.push({ nome: l.nome, motivo: (er as Error).message }); }
  }
  return { movidos, ignorados };
}
