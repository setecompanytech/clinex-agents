import { randomUUID } from 'node:crypto';
import { FunilError, type Atribuicao, type Etapa, type Extras, type Funil, type Mov, type RegraAuto } from './tipos.js';

/**
 * Regras dos funis (documento seções 1, 5 e 6). Tudo puro: o relógio entra por `agora`; nada lê nem grava disco.
 * Datas: o documento usa America/Fortaleza nas métricas e America/Sao_Paulo na ingestão. Os dois são UTC-3 o ano todo
 * (sem horário de verão), então um deslocamento fixo de 3 h serve para ambos.
 */

const FUSO = -3 * 3_600_000;
export const diaBRT = (iso: string | Date) => new Date((typeof iso === 'string' ? Date.parse(iso) : iso.getTime()) + FUSO).toISOString().slice(0, 10);
export const somaDia = (dia: string, n: number) => { const d = new Date(`${dia}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const diffDia = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// ------------------------------------------------------------------------------------------------ classificação por rótulo

export type Classe = 'aberto' | 'agendado' | 'ganho_ativo' | 'ganho_organico' | 'perda' | 'recuperado';
/** Não existem flags convertido/perdido: o rótulo manda. Renomear colunas muda as métricas. */
export function classeDaEtapa(label: string): Classe {
  const n = norm(label);
  if (/convert/.test(n)) return /organ/.test(n) ? 'ganho_organico' : 'ganho_ativo';
  if (/perd|descart|sem retorno/.test(n)) return 'perda';
  if (/recuper/.test(n)) return 'recuperado';
  if (/agendad/.test(n)) return 'agendado';
  return 'aberto';
}
export const ehGanho = (c: Classe) => c === 'ganho_ativo' || c === 'ganho_organico';
const ehSempreTudo = (label: string) => /em aberto|em negociacao/.test(norm(label));

export const stageIdDoHistorico = (m: Mov): string => (m.stageId ?? m.para ?? '') as string;
export const topo = (f: Funil) => f.stages[0];
export const etapaDe = (f: Funil, id: string) => f.stages.find((s) => s.id === id);
/** Para ler histórico: enxerga também as colunas que já foram excluídas. */
export const etapaHist = (f: Funil, id: string) => etapaDe(f, id) ?? f.removidas?.find((s) => s.id === id);

// ------------------------------------------------------------------------------------------------ funis padrão (documento seção 2)

const slug = (t: string) => norm(t).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const mkEtapas = (l: [string, string, number?][]): Etapa[] => l.map(([label, color, cadenciaDias], i) => ({ id: slug(label), label, color, cadenciaDias, posX: 240 * i, posY: 0 }));

export function funisPadrao(agora: Date): Funil[] {
  const criadoEm = agora.toISOString();
  return [
    {
      id: randomUUID(), nome: 'Orçamentos em aberto', dimensao: 'orcamento', statusPermitidos: ['aberto'], criadoEm, automacoes: [], valorEstrela: [300, 800, 1500, 3000],
      stages: mkEtapas([['EM ABERTO', '#3F8E86', 1], ['PRIMEIRO CONTATO', '#5F7CFF', 1], ['NOVA TENTATIVA', '#8D93B4', 2], ['DESCONTO', '#A58BFF', 1], ['RETORNO PERSONALIZADO', '#FF6A86'], ['EM NEGOCIAÇÃO', '#FF2D55', 15], ['AGENDADO', '#FF6A3D'], ['CONVERTIDO ATIVO', '#19D38C'], ['CONVERTIDO - ORGANICO', '#3EE6FF'], ['Descarte', '#6C7390'], ['Sem retorno', '#7C849F']]),
    },
    {
      id: randomUUID(), nome: 'No-show', dimensao: 'agendamento', statusPermitidos: ['faltou'], criadoEm, automacoes: [], valorEstrela: [300, 800, 1500, 3000],
      stages: mkEtapas([['No-show', '#FF2D55', 1], ['Retomada 1', '#FFB020', 2], ['Agendado', '#FF6A3D'], ['Perdido', '#6C7390'], ['Sem Retorno', '#7C849F'], ['Recuperado', '#19D38C']]),
    },
    {
      id: randomUUID(), nome: 'Leads WhatsApp', dimensao: 'lead', statusPermitidos: ['novo_lead', 'interesse', 'follow_up_1', 'convertido'], criadoEm, automacoes: [], oculto: true, valorEstrela: [300, 800, 1500, 3000],
      stages: mkEtapas([['Leads', '#5F7CFF'], ['Interesse', '#FFB020'], ['Follow-up 1', '#A58BFF', 2], ['Convertido', '#19D38C'], ['Descarte', '#6C7390']]),
    },
  ];
}

// ------------------------------------------------------------------------------------------------ mover card (seção 5.3)

/** Bloqueia voltar para a 1ª coluna, grava a trilha no histórico e atualiza a entrada na coluna. */
export function moverCard(a: Atribuicao, f: Funil, paraId: string, agora: Date, opc: { por?: string; manual?: boolean } = {}): boolean {
  if (a.caseStatus === 'removido') throw new FunilError('removido', 'Este card foi removido do funil.');
  const para = etapaDe(f, paraId);
  if (!para) throw new FunilError('etapa', 'Coluna de destino não encontrada neste funil.');
  if (a.stageId === paraId) return false;
  if (paraId === topo(f).id) throw new FunilError('topo', 'Um card não volta para a primeira coluna depois de sair dela.');
  const manual = opc.manual !== false;
  a.historico.push({ stageId: paraId, em: agora.toISOString(), manual, ...(opc.por ? { por: opc.por } : {}) });
  a.stageId = paraId;
  a.enteredAt = agora.toISOString();
  a.manual = manual;
  if (classeDaEtapa(para.label) === 'recuperado') { a.caseStatus = 'recuperado'; a.recoveredAt = agora.toISOString(); }
  return true;
}

// ------------------------------------------------------------------------------------------------ automações (seção 5.6)

/** Último instante (≤ agora) em que a regra de horário deveria ter disparado. */
function ultimaOcorrencia(r: RegraAuto, agora: Date): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(r.horario ?? '');
  if (!m) return null;
  const hh = Number(m[1]), mm = Number(m[2]);
  const hoje = diaBRT(agora);
  const alvo = (dia: string) => Date.parse(`${dia}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00-03:00`);
  for (let i = 0; i < 8; i++) {
    const dia = somaDia(hoje, -i);
    if (r.tipo === 'horario_semanal' && new Date(`${dia}T12:00:00Z`).getUTCDay() !== r.diaSemana) continue;
    if (alvo(dia) <= agora.getTime()) return alvo(dia);
  }
  return null;
}

/** Só para cards abertos no topo; grava com manual:false. Roda no servidor (o documento roda no navegador). */
export function aplicarAutomacoes(f: Funil, atribs: Atribuicao[], agora: Date): number {
  if (!f.automacoes.length) return 0;
  const t = topo(f);
  let n = 0;
  for (const a of atribs) {
    if (a.funilId !== f.id || a.stageId !== t.id || a.caseStatus !== 'aberto') continue;
    for (const r of f.automacoes) {
      if (r.deStageId !== t.id || !etapaDe(f, r.paraStageId)) continue;
      let dispara = false;
      if (r.tipo === 'apos_horas') dispara = agora.getTime() - Date.parse(a.enteredAt) >= (r.horas ?? 0) * 3_600_000;
      else { const o = ultimaOcorrencia(r, agora); dispara = o !== null && Date.parse(a.enteredAt) < o; }
      if (dispara && moverCard(a, f, r.paraStageId, agora, { manual: false })) { n++; break; }
    }
  }
  return n;
}

// ------------------------------------------------------------------------------------------------ período e recortes (seção 6)

export type FiltroPor = 'criacao' | 'agendamento' | 'conversao';
export type Periodo = { de?: string; ate?: string; por?: FiltroPor };

const dentro = (dia: string | undefined, p: Periodo) => !!dia && (!p.de || dia >= p.de) && (!p.ate || dia <= p.ate);

/** Quando o card entrou na primeira coluna de uma classe (para os filtros "Agendamento" e "Conversão"). */
export function entradaEmClasse(a: Atribuicao, f: Funil, fn: (c: Classe) => boolean): string | undefined {
  for (const m of a.historico) {
    const e = etapaHist(f, stageIdDoHistorico(m));
    if (e && fn(classeDaEtapa(e.label))) return m.em;
  }
  return undefined;
}

export function diaDoFiltro(a: Atribuicao, f: Funil, por: FiltroPor): string | undefined {
  if (por === 'criacao') return a.ultimoSnapshot.criadoEm ? diaBRT(a.ultimoSnapshot.criadoEm) : undefined;
  const iso = por === 'agendamento' ? entradaEmClasse(a, f, (c) => c === 'agendado') : entradaEmClasse(a, f, ehGanho);
  return iso ? diaBRT(iso) : undefined;
}

export type Recorte = 'v1' | 'v2';
/** V1: o período só recorta o topo; as demais colunas mostram tudo em andamento.
 *  V2: recorta todas as colunas, EXCETO "Em aberto" e "Em negociação", que sempre mostram tudo. */
export function recortar(f: Funil, atribs: Atribuicao[], p: Periodo, modo: Recorte): Atribuicao[] {
  if (!p.de && !p.ate) return atribs;
  const por = p.por ?? 'criacao';
  const t = topo(f);
  return atribs.filter((a) => {
    const e = etapaDe(f, a.stageId);
    if (modo === 'v1') return a.stageId !== t.id || dentro(diaDoFiltro(a, f, por), p);
    if (e && ehSempreTudo(e.label)) return true;
    return dentro(diaDoFiltro(a, f, por), p);
  });
}

/** Cards exibíveis: sem os removidos. O snapshot exibido é o congelado (só `status` é atualizado depois). */
export const visiveis = (f: Funil, atribs: Atribuicao[]) => atribs.filter((a) => a.funilId === f.id && a.caseStatus !== 'removido');

export const valorExibido = (a: Atribuicao, x?: Extras) => (x?.valorNegociado !== undefined && x.valorNegociado !== null ? x.valorNegociado : a.ultimoSnapshot.valor);

export function estrelas(valor: number, cortes: number[] | undefined): number {
  const c = cortes && cortes.length === 4 ? cortes : [300, 800, 1500, 3000];
  return 1 + c.filter((x) => valor >= x).length;
}

/** Dias na coluna atual e se estourou a cadência da coluna (SLA). */
export function diasNaEtapa(a: Atribuicao, agora: Date) { return Math.max(0, diffDia(diaBRT(a.enteredAt), diaBRT(agora))); }
export function atrasado(a: Atribuicao, f: Funil, agora: Date): boolean {
  const e = etapaDe(f, a.stageId);
  return !!e?.cadenciaDias && a.caseStatus === 'aberto' && classeDaEtapa(e.label) === 'aberto' && diasNaEtapa(a, agora) > e.cadenciaDias;
}

// ------------------------------------------------------------------------------------------------ configuração do funil (seção 5.5)

/** Valida a edição de colunas. Excluir coluna com cards exige coluna de destino (que não pode ser o topo). */
export function validarConfig(atual: Funil, novas: Etapa[], atribs: Atribuicao[], destinos: Record<string, string>): { stages: Etapa[]; mover: [string, string][] } {
  if (!novas.length) throw new FunilError('config', 'O funil precisa de pelo menos uma coluna.');
  const ids = new Set<string>();
  const stages = novas.map((e, i) => {
    const label = String(e.label ?? '').trim().slice(0, 60);
    if (!label) throw new FunilError('config', `A coluna ${i + 1} está sem nome.`);
    const id = e.id && !ids.has(e.id) ? String(e.id) : `${slug(label) || 'coluna'}-${randomUUID().slice(0, 4)}`;
    ids.add(id);
    const cad = e.cadenciaDias === undefined || (e.cadenciaDias as unknown) === '' || e.cadenciaDias === null ? undefined : Number(e.cadenciaDias);
    if (cad !== undefined && (!Number.isInteger(cad) || cad < 1 || cad > 365)) throw new FunilError('config', `Cadência da coluna "${label}": use de 1 a 365 dias.`);
    return { id, label, color: /^#[0-9a-fA-F]{6}$/.test(String(e.color)) ? String(e.color) : '#6C7390', cadenciaDias: cad, posX: Number(e.posX) || i * 240, posY: Number(e.posY) || 0 } as Etapa;
  });
  const novoTopo = stages[0].id;
  const mover: [string, string][] = [];
  for (const velho of atual.stages) {
    if (ids.has(velho.id)) continue;
    const afetados = atribs.filter((a) => a.funilId === atual.id && a.stageId === velho.id && a.caseStatus !== 'removido');
    if (!afetados.length) continue;
    const dest = destinos[velho.id];
    if (!dest || !ids.has(dest)) throw new FunilError('destino', `A coluna "${velho.label}" tem ${afetados.length} cards. Escolha para onde eles vão antes de excluir.`);
    if (dest === novoTopo && velho.id !== atual.stages[0].id) throw new FunilError('destino', 'Os cards não podem ir para a primeira coluna.');
    mover.push([velho.id, dest]);
  }
  return { stages, mover };
}

export function validarAutomacoes(lista: unknown, stages: Etapa[]): RegraAuto[] {
  if (!Array.isArray(lista)) return [];
  const ids = new Set(stages.map((s) => s.id));
  return lista.map((r: Record<string, unknown>, i) => {
    const tipo = r.tipo as RegraAuto['tipo'];
    if (!['apos_horas', 'horario_diario', 'horario_semanal'].includes(tipo)) throw new FunilError('auto', `Automação ${i + 1}: tipo inválido.`);
    if (!ids.has(String(r.deStageId)) || !ids.has(String(r.paraStageId))) throw new FunilError('auto', `Automação ${i + 1}: escolha as colunas de origem e destino.`);
    if (String(r.deStageId) !== stages[0].id) throw new FunilError('auto', `Automação ${i + 1}: só vale para cards na primeira coluna.`);
    if (r.paraStageId === r.deStageId) throw new FunilError('auto', `Automação ${i + 1}: o destino precisa ser outra coluna.`);
    const out: RegraAuto = { id: String(r.id || randomUUID().slice(0, 8)), deStageId: String(r.deStageId), paraStageId: String(r.paraStageId), tipo };
    if (tipo === 'apos_horas') { const h = Number(r.horas); if (!Number.isFinite(h) || h < 1 || h > 24 * 90) throw new FunilError('auto', `Automação ${i + 1}: horas de 1 a 2160.`); out.horas = h; }
    else {
      if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(String(r.horario))) throw new FunilError('auto', `Automação ${i + 1}: horário no formato HH:MM.`);
      out.horario = String(r.horario);
      if (tipo === 'horario_semanal') { const d = Number(r.diaSemana); if (!Number.isInteger(d) || d < 0 || d > 6) throw new FunilError('auto', `Automação ${i + 1}: escolha o dia da semana.`); out.diaSemana = d; }
    }
    return out;
  });
}

