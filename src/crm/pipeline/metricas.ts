import { atrasado, classeDaEtapa, diaBRT, diasNaEtapa, diffDia, ehGanho, entradaEmClasse, etapaDe, etapaHist, somaDia, stageIdDoHistorico, valorExibido, visiveis, type Classe } from './regras.js';
import type { Atribuicao, EstadoFunis, Funil } from './tipos.js';

/**
 * Relatório de produtividade (documento 7.1) e painel executivo (7.2), calculados só a partir dos cards e do
 * histórico do CRM (não chamam o Clinilink). Funções puras.
 */

const SEM_AUTOR = 'sem autor';
const med = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10; };
const soma = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

type Mov = { cardId: string; funilId: string; funil: string; de: string; para: string; classeDe: Classe; classePara: Classe; idxDe: number; idxPara: number; por: string; em: string; dia: string; valor: number; paciente: string };

/** Cada item do histórico a partir do índice 1 (a entrada inicial não conta). */
function movimentos(est: EstadoFunis, funis: Funil[], de: string, ate: string): Mov[] {
  const out: Mov[] = [];
  const porId = new Map(funis.map((f) => [f.id, f]));
  for (const a of est.atribuicoes) {
    const f = porId.get(a.funilId); if (!f) continue;
    for (let i = 1; i < a.historico.length; i++) {
      const m = a.historico[i], ant = a.historico[i - 1];
      const dia = diaBRT(m.em); if (dia < de || dia > ate) continue;
      const eD = etapaHist(f, stageIdDoHistorico(ant)), eP = etapaHist(f, stageIdDoHistorico(m));
      if (!eD || !eP) continue;
      out.push({ cardId: a.cardId, funilId: f.id, funil: f.nome, de: eD.label, para: eP.label, classeDe: classeDaEtapa(eD.label), classePara: classeDaEtapa(eP.label), idxDe: f.stages.indexOf(eD), idxPara: f.stages.indexOf(eP), por: m.por?.trim() || SEM_AUTOR, em: m.em, dia, valor: valorExibido(a, est.extras[a.cardId]), paciente: a.ultimoSnapshot.paciente });
    }
  }
  return out.sort((x, y) => y.em.localeCompare(x.em));
}

/** Log de movimentações (tela /crm/pipeline/log). */
export function logMovimentacoes(est: EstadoFunis, funis: Funil[], de: string, ate: string, limite = 500) {
  const ms = movimentos(est, funis, de, ate);
  return { total: ms.length, movimentos: ms.slice(0, limite).map((m) => ({ cardId: m.cardId, funilId: m.funilId, funil: m.funil, paciente: m.paciente, de: m.de, para: m.para, por: m.por, em: m.em, valor: m.valor })) };
}

export function relatorio(est: EstadoFunis, funis: Funil[], de: string, ate: string) {
  const ms = movimentos(est, funis, de, ate);
  const porId = new Map(funis.map((f) => [f.id, f]));
  // convertidos = cards que ESTÃO hoje numa coluna de convertido e entraram nela no período
  const conv = { ativo: { n: 0, valor: 0 }, organico: { n: 0, valor: 0 } };
  const convAtivoPor = new Map<string, number>();
  for (const a of est.atribuicoes) {
    const f = porId.get(a.funilId); if (!f || a.caseStatus === 'removido') continue;
    const c = classeDaEtapa(etapaDe(f, a.stageId)?.label ?? '');
    if (!ehGanho(c)) continue;
    const quando = entradaEmClasse(a, f, ehGanho); if (!quando) continue;
    const dia = diaBRT(quando); if (dia < de || dia > ate) continue;
    const v = valorExibido(a, est.extras[a.cardId]);
    const k = c === 'ganho_ativo' ? 'ativo' : 'organico';
    conv[k].n++; conv[k].valor += v;
    if (c === 'ganho_ativo') { const mov = [...a.historico].reverse().find((m) => { const e = etapaDe(f, stageIdDoHistorico(m)); return e && classeDaEtapa(e.label) === 'ganho_ativo'; }); const por = mov?.por?.trim() || SEM_AUTOR; convAtivoPor.set(por, (convAtivoPor.get(por) ?? 0) + v); }
  }

  type Linha = { usuario: string; movimentos: number; cards: number; emAbertoParaNegociacao: number; negociacaoParaAgendado: number; agendadoParaConvertido: number; semRetornoDescarte: number; convertidosAtivos: number; taxaConversao: number | null; valorConvertido: number; participacao: number | null };
  const por = new Map<string, { m: number; cards: Set<string>; neg: number; ag: number; conv: number; perda: Set<string>; convCards: Set<string> }>();
  const get = (u: string) => { let x = por.get(u); if (!x) { x = { m: 0, cards: new Set(), neg: 0, ag: 0, conv: 0, perda: new Set(), convCards: new Set() }; por.set(u, x); } return x; };
  for (const m of ms) {
    const x = get(m.por); x.m++; x.cards.add(m.cardId);
    const f = porId.get(m.funilId)!; const rotPara = m.para.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const progresso = m.idxPara > m.idxDe;
    if (progresso && /em negociacao/.test(rotPara)) x.neg++;
    if (progresso && m.classePara === 'agendado') x.ag++;
    if (progresso && m.classePara === 'ganho_ativo') { x.conv++; x.convCards.add(m.cardId); }
    if (m.classePara === 'perda') x.perda.add(`${m.cardId}:${m.para}`); // cada lead conta 1× por pessoa por coluna
    void f;
  }
  const linhas: Linha[] = [...por].map(([usuario, x]) => ({
    usuario, movimentos: x.m, cards: x.cards.size, emAbertoParaNegociacao: x.neg, negociacaoParaAgendado: x.ag, agendadoParaConvertido: x.conv, semRetornoDescarte: x.perda.size,
    convertidosAtivos: x.convCards.size, taxaConversao: pct(x.convCards.size, x.cards.size), valorConvertido: convAtivoPor.get(usuario) ?? 0, participacao: null,
  }));
  for (const [u, v] of convAtivoPor) if (!por.has(u)) linhas.push({ usuario: u, movimentos: 0, cards: 0, emAbertoParaNegociacao: 0, negociacaoParaAgendado: 0, agendadoParaConvertido: 0, semRetornoDescarte: 0, convertidosAtivos: 0, taxaConversao: null, valorConvertido: v, participacao: null });
  const totalV = soma(linhas.map((l) => l.valorConvertido));
  for (const l of linhas) l.participacao = totalV > 0 ? pct(l.valorConvertido, totalV) : null;
  linhas.sort((a, b) => b.valorConvertido - a.valorConvertido || b.movimentos - a.movimentos);

  const fluxo = new Map<string, { de: string; para: string; n: number }>();
  for (const m of ms) { const k = `${m.de}→${m.para}`; const x = fluxo.get(k) ?? { de: m.de, para: m.para, n: 0 }; x.n++; fluxo.set(k, x); }
  const dias: Record<string, number> = {}; for (const m of ms) dias[m.dia] = (dias[m.dia] ?? 0) + 1;

  return {
    de, ate,
    kpis: { movimentos: ms.length, cardsMovidos: new Set(ms.map((m) => m.cardId)).size, convertidos: conv.ativo.n + conv.organico.n, valorConvertido: conv.ativo.valor + conv.organico.valor, ativo: conv.ativo, organico: conv.organico },
    produtividade: linhas, fluxo: [...fluxo.values()].sort((a, b) => b.n - a.n), porDia: dias,
  };
}

// ------------------------------------------------------------------------------------------------ painel executivo

export function painelExecutivo(est: EstadoFunis, f: Funil, dias: number, agora: Date) {
  const hoje = diaBRT(agora), ini = somaDia(hoje, -(dias - 1)), ini0 = somaDia(ini, -dias), fim0 = somaDia(ini, -1);
  const cards = visiveis(f, est.atribuicoes);
  const dentro = (d: string | undefined, a: string, b: string) => !!d && d >= a && d <= b;
  const info = cards.map((a) => {
    const e = etapaDe(f, a.stageId); const c = classeDaEtapa(e?.label ?? '');
    const q = entradaEmClasse(a, f, ehGanho);
    return { a, c, etapa: e, valor: valorExibido(a, est.extras[a.cardId]), criado: a.ultimoSnapshot.criadoEm ? diaBRT(a.ultimoSnapshot.criadoEm) : undefined, conv: ehGanho(c) && q ? diaBRT(q) : undefined };
  });
  const receita = (a: string, b: string) => { const ls = info.filter((x) => dentro(x.conv, a, b)); const at = ls.filter((x) => x.c === 'ganho_ativo'), og = ls.filter((x) => x.c === 'ganho_organico'); return { valor: soma(ls.map((x) => x.valor)), n: ls.length, ativo: { valor: soma(at.map((x) => x.valor)), n: at.length }, organico: { valor: soma(og.map((x) => x.valor)), n: og.length } }; };
  const r = receita(ini, hoje), r0 = receita(ini0, fim0);
  const abertos = info.filter((x) => x.c === 'aberto' || x.c === 'agendado');
  const entradas = info.filter((x) => dentro(x.criado, ini, hoje)).length, entradas0 = info.filter((x) => dentro(x.criado, ini0, fim0)).length;
  const convPer = info.filter((x) => dentro(x.conv, ini, hoje));
  const ciclo = convPer.map((x) => (x.criado && x.conv ? diffDia(x.criado, x.conv) : null)).filter((n): n is number => n !== null && n >= 0);

  // forecast ponderado: peso = fração dos cards resolvidos que passaram pela etapa e ganharam (mínimo 5 resolvidos)
  const resolvidos = info.filter((x) => ehGanho(x.c) || x.c === 'perda');
  const etapas = f.stages.map((e, i) => {
    const noEtapa = abertos.filter((x) => x.a.stageId === e.id);
    const passaram = resolvidos.filter((x) => x.a.historico.some((m) => stageIdDoHistorico(m) === e.id));
    const ganhos = passaram.filter((x) => ehGanho(x.c)).length;
    const peso = passaram.length >= 5 ? ganhos / passaram.length : null;
    const dias_ = noEtapa.map((x) => diasNaEtapa(x.a, agora));
    return { id: e.id, etapa: e.label, color: e.color, classe: classeDaEtapa(e.label), n: noEtapa.length, valor: soma(noEtapa.map((x) => x.valor)), peso: peso === null ? null : Math.round(peso * 100), mediaDias: dias_.length ? Math.round((soma(dias_) / dias_.length) * 10) / 10 : null, cadenciaDias: e.cadenciaDias ?? null, atrasados: noEtapa.filter((x) => atrasado(x.a, f, agora)).length, previsto: peso === null ? 0 : soma(noEtapa.map((x) => x.valor)) * peso };
  });
  const funil = f.stages.map((e) => { const ls = info.filter((x) => x.a.stageId === e.id); return { etapa: e.label, color: e.color, n: ls.length, valor: soma(ls.map((x) => x.valor)) }; });

  const idade = [{ rotulo: '0 a 2 dias', n: 0, valor: 0 }, { rotulo: '3 a 7 dias', n: 0, valor: 0 }, { rotulo: '8 a 15 dias', n: 0, valor: 0 }, { rotulo: '16+ dias', n: 0, valor: 0 }];
  for (const x of abertos) { const d = diasNaEtapa(x.a, agora); const b = idade[d <= 2 ? 0 : d <= 7 ? 1 : d <= 15 ? 2 : 3]; b.n++; b.valor += x.valor; }

  const ms = movimentos(est, [f], ini, hoje);
  const atividade = new Map<string, number>(); for (const m of ms) atividade.set(m.por, (atividade.get(m.por) ?? 0) + 1);
  const serieReceita: number[] = []; const rotulos: string[] = [];
  for (let i = 0; i < dias; i++) { const d = somaDia(ini, i); rotulos.push(d); serieReceita.push(soma(info.filter((x) => x.conv === d).map((x) => x.valor))); }

  const atras = abertos.filter((x) => atrasado(x.a, f, agora));
  const grandes = abertos.filter((x) => x.valor >= 1000 && diasNaEtapa(x.a, agora) >= 3);
  const alertas: { nivel: 'risco' | 'atencao' | 'info'; titulo: string; texto: string }[] = [];
  if (atras.length) alertas.push({ nivel: atras.length >= 20 ? 'risco' : 'atencao', titulo: `${atras.length} cards estouraram a cadência da coluna`, texto: `${Math.round(soma(atras.map((x) => x.valor))).toLocaleString('pt-BR')} em orçamentos esperam ação além do SLA da etapa.` });
  if (grandes.length) alertas.push({ nivel: 'atencao', titulo: `${grandes.length} orçamentos de R$ 1.000 ou mais parados há 3 dias ou mais`, texto: 'Prioridade de contato: valores altos esfriam mais rápido.' });
  const semResp = info.filter((x) => !est.extras[x.a.cardId]?.responsavel && (x.c === 'aberto' || x.c === 'agendado')).length;
  if (semResp > 0) alertas.push({ nivel: 'info', titulo: `${semResp} cards sem responsável`, texto: 'Defina o responsável no card para a produtividade e o relatório refletirem quem atende.' });

  return {
    funil: f.nome, dias, ini, hoje,
    kpis: {
      receita: { ...r, anterior: r0.valor, deltaPct: r0.valor > 0 ? Math.round(((r.valor - r0.valor) / r0.valor) * 1000) / 10 : null },
      pipeline: { valor: soma(abertos.map((x) => x.valor)), n: abertos.length },
      previsao: { valor: Math.round(soma(etapas.map((e) => e.previsto))) },
      conversao: { taxa: pct(convPer.length, entradas), convertidos: convPer.length, entradas, entradasAnt: entradas0 },
      velocidade: { mediana: med(ciclo), n: ciclo.length },
    },
    etapas, funil_: funil, idade, atividade: [...atividade].map(([usuario, n]) => ({ usuario, n })).sort((a, b) => b.n - a.n), serie: { rotulos, receita: serieReceita }, alertas,
  };
}
