import { agendamentos, orcamentos, type AgendamentoCrm, type OrcamentoCrm } from '../clinilink.js';
import { diaBRT, diffDia, funisPadrao, somaDia, topo } from './regras.js';
import { FunilError, type Atribuicao, type CardSnap, type EstadoFunis, type Funil } from './tipos.js';

/**
 * Ingestão do Clinilink (documento seção 4.1). Regras que valem sempre:
 *  - só a rotina cria cards nos funis de Orçamento e No-show; a tela nunca cria;
 *  - janela padrão = anteontem + ontem (America/Sao_Paulo), nunca o dia atual;
 *  - idempotente: card que já existe (em qualquer coluna, até removido) nunca é movido, reaberto nem alterado,
 *    exceto o topo de funil, que ainda reflete o dado vivo, e a etiqueta de status dos demais.
 */

/** Ids das unidades do Clinilink (agendamentos exigem uma chamada por unidade). Descobertos na API real. */
export const UNIDADES_CLINEX = [
  { id: 'ee920324-ad7a-4f5e-b407-e8c1cc84e75c', nome: 'CLINEX GUAMÁ' },
  { id: 'd209b2e7-4777-42b3-b28b-c5a82fcf82d4', nome: 'CLINEX TELEGRAFO' },
];

export type Janela = { de: string; ate: string };
export const janelaPadrao = (agora: Date): Janela => { const hoje = diaBRT(agora); return { de: somaDia(hoje, -2), ate: somaDia(hoje, -1) }; };

/** Corpo opcional da chamada manual: { dia } ou { de, ate } (máximo 60 dias). */
export function janelaDoPedido(agora: Date, corpo: unknown): Janela {
  const b = (corpo ?? {}) as { dia?: string; de?: string; ate?: string };
  const ok = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
  if (b.dia !== undefined) { if (!ok(b.dia)) throw new FunilError('janela', 'Dia inválido: use AAAA-MM-DD.'); return { de: b.dia, ate: b.dia }; }
  if (b.de !== undefined || b.ate !== undefined) {
    if (!ok(b.de) || !ok(b.ate)) throw new FunilError('janela', 'Informe "de" e "ate" no formato AAAA-MM-DD.');
    if (b.de! > b.ate!) throw new FunilError('janela', 'A data inicial é depois da final.');
    if (diffDia(b.de!, b.ate!) > 59) throw new FunilError('janela', 'A janela máxima é de 60 dias.');
    return { de: b.de!, ate: b.ate! };
  }
  return janelaPadrao(agora);
}

// ------------------------------------------------------------------------------------------------ mapeamento para o card

export function snapDeOrcamento(o: OrcamentoCrm): CardSnap {
  const itens = (o.itens ?? []).map((i) => String(i.nome ?? '')).filter(Boolean);
  return {
    id: o.orcamentoId, codigo: o.codigo, paciente: o.paciente?.nome ?? 'Sem nome', contato: o.paciente?.telefone,
    subtitulo: itens.slice(0, 2).join(' · ') + (itens.length > 2 ? ` +${itens.length - 2}` : ''),
    valor: Number(o.valorLiquido ?? o.valorBruto ?? 0) || 0, itens, criadoEm: o.criadoEm, unidade: o.unidade?.nome, status: o.status,
    convenio: o.convenio, origem: o.origem, prioridade: o.prioridade, observacao: o.observacao,
  };
}
export function snapDeAgendamento(a: AgendamentoCrm): CardSnap {
  const procs = (a.procedimentos ?? []).map((p) => p.nome).filter(Boolean);
  return {
    id: a.agendamentoId, paciente: a.paciente?.nome ?? 'Sem nome', contato: a.paciente?.telefone,
    subtitulo: [procs.join(' · '), a.profissional?.nome].filter(Boolean).join(' — '),
    valor: Number(a.valorTotal ?? 0) || 0, itens: procs, criadoEm: a.dataHora, unidade: a.unidade?.nome, status: a.status, observacao: a.observacao,
  };
}

// ------------------------------------------------------------------------------------------------ combo: um card só

const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
const unicos = (xs: (string | undefined)[]) => [...new Set(xs.map((x) => (x ?? '').trim()).filter(Boolean))];

/**
 * No Clinilink cada serviço de um combo é um agendamento próprio. Quando o paciente falta, o combo não pode virar vários
 * cards "como se fossem vários serviços": agendamentos do MESMO paciente, na MESMA unidade e no MESMO horário viram UM card,
 * com todos os serviços, o valor somado e os ids de origem em agendamentoIds.
 * Id do card = o de um agendamento que já é card (assim a rotina não duplica); sem nenhum, o menor id do grupo.
 * Se mais de um agendamento do grupo já virou card separado (cards antigos, de antes do agrupamento), não mexe neles:
 * seguem como estão, para nunca contar o mesmo valor duas vezes.
 */
export function snapsDeAgendamentos(ags: AgendamentoCrm[], jaCards: Iterable<CardSnap> = []): CardSnap[] {
  const cards = [...jaCards], porId = new Map<string, CardSnap>();
  for (const c of cards) { porId.set(c.id, c); for (const i of c.agendamentoIds ?? []) if (!porId.has(i)) porId.set(i, c); }
  const grupos = new Map<string, AgendamentoCrm[]>(), saida: CardSnap[] = [], ordem: (CardSnap | string)[] = [];
  for (const a of ags) {
    const nome = semAcento(a.paciente?.nome ?? '');
    if (!nome || nome === 'SEM NOME' || !a.dataHora) { ordem.push(snapDeAgendamento(a)); continue; }
    const k = [nome, semAcento(a.unidade?.nome ?? ''), String(a.dataHora).slice(0, 16)].join('|');
    if (!grupos.has(k)) { grupos.set(k, []); ordem.push(k); }
    grupos.get(k)!.push(a);
  }
  for (const o of ordem) {
    if (typeof o !== 'string') { saida.push(o); continue; }
    const g = grupos.get(o)!.sort((x, y) => String(x.agendamentoId).localeCompare(String(y.agendamentoId)));
    if (g.length === 1) {
      const c = porId.get(g[0].agendamentoId);
      if (c && c.id !== g[0].agendamentoId) continue; // este serviço já está dentro de um card de combo
      saida.push(snapDeAgendamento(g[0])); continue;
    }
    const ids = g.map((x) => x.agendamentoId);
    const emCard = new Set(ids.map((i) => porId.get(i)?.id).filter((x): x is string => !!x));
    if (emCard.size > 1) { for (const x of g) saida.push(snapDeAgendamento(x)); continue; } // cards antigos separados: ficam como estão
    const id = [...emCard][0] ?? ids[0];
    const snaps = g.map(snapDeAgendamento);
    const itens = unicos(snaps.flatMap((s) => s.itens));
    const profs = unicos(g.map((x) => x.profissional?.nome));
    const base = snaps[0];
    saida.push({
      ...base, id, itens, valor: Math.round(snaps.reduce((t, s) => t + s.valor, 0) * 100) / 100,
      subtitulo: [itens.join(' · '), profs.join(' · ')].filter(Boolean).join(' — '),
      observacao: unicos(snaps.map((s) => s.observacao)).join(' | ') || undefined, agendamentoIds: ids,
    });
  }
  return saida;
}

// ------------------------------------------------------------------------------------------------ gravação idempotente

/** O funil que recebe os cards da rotina: pelo `dimensao` (+ nome no de orçamento); o mais antigo se houver mais de um. */
export function funilDestino(est: EstadoFunis, dimensao: 'orcamento' | 'agendamento', agora: Date): Funil {
  const doTipo = est.funis.filter((f) => f.dimensao === dimensao).sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
  const achado = (dimensao === 'orcamento' ? doTipo.find((f) => /or[cç]amentos? em aberto/i.test(f.nome)) : undefined) ?? doTipo[0];
  if (achado) return achado;
  const novo = funisPadrao(agora).find((f) => f.dimensao === dimensao)!;
  est.funis.push(novo);
  return novo;
}

export type ResultadoIngestao = { buscados: number; criados: number; ignorados: number; atualizados: number };

export function ingerir(est: EstadoFunis, f: Funil, snaps: CardSnap[], agora: Date): ResultadoIngestao {
  const existentes = new Map<string, Atribuicao>();
  for (const a of est.atribuicoes) if (a.funilId === f.id) existentes.set(a.cardId, a);
  const t = topo(f);
  const vistos = new Set<string>();
  let criados = 0, ignorados = 0, atualizados = 0;
  for (const s of snaps) {
    if (!s.id || vistos.has(s.id)) { ignorados++; continue; }
    vistos.add(s.id);
    const a = existentes.get(s.id);
    if (a) {
      // card existente nunca é movido nem reaberto. No topo (ainda não trabalhado) acompanha o dado vivo;
      // fora dele só a etiqueta de status muda (o resto fica congelado).
      if (a.caseStatus !== 'removido') {
        if (a.stageId === t.id) { if (JSON.stringify(a.ultimoSnapshot) !== JSON.stringify(s)) { a.ultimoSnapshot = s; atualizados++; } }
        else if (a.ultimoSnapshot.status !== s.status) { a.ultimoSnapshot = { ...a.ultimoSnapshot, status: s.status }; atualizados++; }
      }
      ignorados++;
      continue;
    }
    est.atribuicoes.push({
      funilId: f.id, cardId: s.id, stageId: t.id, enteredAt: agora.toISOString(), manual: false,
      historico: [{ stageId: t.id, em: agora.toISOString(), manual: false }],
      originSnapshot: s, ultimoSnapshot: s, originStatus: s.status, caseStatus: 'aberto',
    });
    criados++;
  }
  f.ultimaIngestaoDia = diaBRT(agora);
  return { buscados: snaps.length, criados, ignorados, atualizados };
}

// ------------------------------------------------------------------------------------------------ rotina (busca + grava)

export type Sincronizacao = { janela: Janela; orcamentos?: ResultadoIngestao; agendamentos?: ResultadoIngestao; erros: string[] };

/** Busca no Clinilink (em paralelo) e grava. Um erro numa tarefa não desfaz a outra. */
export async function sincronizar(est: EstadoFunis, agora: Date, pedido?: unknown): Promise<Sincronizacao> {
  const janela = janelaDoPedido(agora, pedido);
  const out: Sincronizacao = { janela, erros: [] };
  const [orc, ag] = await Promise.allSettled([
    orcamentos({ status: 'aberto', dataInicial: janela.de, dataFinal: janela.ate }),
    Promise.all(UNIDADES_CLINEX.map((u) => agendamentos({ unidadeId: u.id, dataInicial: janela.de, dataFinal: janela.ate, status: 'faltou' }))),
  ]);
  if (orc.status === 'fulfilled') out.orcamentos = ingerir(est, funilDestino(est, 'orcamento', agora), orc.value.map(snapDeOrcamento), agora);
  else out.erros.push(`Orçamentos: ${(orc.reason as Error).message}`);
  if (ag.status === 'fulfilled') {
    const fn = funilDestino(est, 'agendamento', agora);
    out.agendamentos = ingerir(est, fn, snapsDeAgendamentos(ag.value.flat(), est.atribuicoes.filter((a) => a.funilId === fn.id).map((a) => a.originSnapshot)), agora);
  }
  else out.erros.push(`No-show: ${(ag.reason as Error).message}`);
  est.rotina = { ultimaExecucao: agora.toISOString(), ultimoDia: diaBRT(agora), resultado: out, erro: out.erros.length ? out.erros.join(' | ') : undefined };
  return out;
}
