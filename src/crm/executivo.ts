import { diaDoInstante, diffDias, ehConversaoAtiva, hojeDe, horaDe, somaDias, type EventoLead, type Lead, type Tarefa, type Vista } from './motor.js';
import { LIMITES, MENSAGENS, type Status } from './modelo.js';
import { marcosDe, type Marcos } from './analise.js';
import { transicoes, type Periodo } from './tempo.js';
import { fraseJanela, janela, type Janela } from './periodo.js';

/**
 * Visão executiva e "Meu Report" do CRM. Tudo é calculado dos registros de cada lead (eventos, etapas, valores):
 * nada é estimado, e a previsão ponderada usa só taxas reais observadas no histórico (com o tamanho da amostra à vista).
 * Função pura: mesma entrada, mesma saída. "Ganho" = Convertido ativo (compareceu e pagou) ou Convertido orgânico (já foi à recepção).
 */

const ATIVOS: Status[] = ['aberto', 'sem_retorno', 'negociacao', 'agendado'];
export const ETAPAS: { item: string; rotulo: string; status: Status }[] = [
  { item: 'aberto', rotulo: 'Em aberto', status: 'aberto' },
  { item: 'primeiro', rotulo: 'Primeiro contato', status: 'aberto' },
  { item: 'tentativa', rotulo: 'Nova tentativa', status: 'sem_retorno' },
  { item: 'desconto', rotulo: 'Desconto', status: 'sem_retorno' },
  { item: 'semretorno', rotulo: 'Sem retorno', status: 'sem_retorno' },
  { item: 'retorno', rotulo: 'Retorno personalizado', status: 'negociacao' },
  { item: 'negociacao', rotulo: 'Em negociação', status: 'negociacao' },
  { item: 'agendado', rotulo: 'Agendado', status: 'agendado' },
];
const ROTULO_STATUS: Record<string, string> = { aberto: 'Em aberto', sem_retorno: 'Sem retorno', negociacao: 'Em negociação', agendado: 'Agendado' };
const FAIXAS_IDADE: [string, (n: number) => boolean][] = [['0–2 dias', (n) => n <= 2], ['3–5 dias', (n) => n >= 3 && n <= 5], ['6–10 dias', (n) => n >= 6 && n <= 10], ['+10 dias', (n) => n > 10]];

const soma = (a: number[]) => a.reduce((x, y) => x + y, 0);
const pc = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const mediana = (a: number[]) => { if (!a.length) return null; const o = [...a].sort((x, y) => x - y); const m = o.length >> 1; return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2; };
const r1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const fmt = (v: number, c = 1) => v.toLocaleString('pt-BR', { maximumFractionDigits: c });
const un = (l: Lead) => l.unidade?.trim() || 'Sem unidade';
const dono = (l: Lead) => l.atendente?.trim() || 'Sem responsável';
const quem = (e: EventoLead, l: Lead) => e.atendente?.trim() || dono(l);
const dentro = (d: string | undefined, a: string, b: string) => !!d && d >= a && d <= b;
const delta = (a: number, b: number) => (b > 0 ? r1(((a - b) / b) * 100) : null);

/** Pontos do gráfico: diários até 30 dias, semanais acima disso. */
function pontos(hoje: string, dias: number, de?: string) {
  const semanal = dias > 30, n = semanal ? Math.ceil(dias / 7) : dias;
  const fins = Array.from({ length: n }, (_, i) => somaDias(hoje, -(n - 1 - i) * (semanal ? 7 : 1)));
  const inis = fins.map((f) => (semanal ? somaDias(f, -6) : f));
  const rotulos = inis.map((d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`);
  const titulos = fins.map((f, i) => (semanal ? `${rotulos[i]} a ${f.slice(8, 10)}/${f.slice(5, 7)}` : new Date(`${f}T12:00:00-03:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })));
  const idx = (dia: string) => { if (de && dia < de) return -1; const k = diffDias(dia, hoje); if (k < 0) return -1; const i = n - 1 - (semanal ? Math.floor(k / 7) : k); return i >= 0 && i < n ? i : -1; };
  return { semanal, n, rotulos, titulos, idx };
}

// ------------------------------------------------------------------------------------------------ no-show: funil de recuperação
const ETAPAS_NOSHOW = ['No-show', 'Retomada', 'Agendado', 'Perdido', 'Sem retorno', 'Recuperado'] as const;
type EtapaNS = (typeof ETAPAS_NOSHOW)[number];
type CasoNS = { id: string; nome: string; unidade: string; etapa: EtapaNS; dia: string; valor: number; dono: string };

function casosNoShow(leads: Lead[], ini: string, fim: string): CasoNS[] {
  const out: CasoNS[] = [];
  for (const l of leads) {
    let idx = -1;
    l.eventos.forEach((e, i) => { if (e.tipo === 'comparecimento' && /^No show/.test(e.texto) && dentro(diaDoInstante(e.quando), ini, fim)) idx = i; });
    if (idx < 0) continue;
    const dia = diaDoInstante(l.eventos[idx].quando), depois = l.eventos.slice(idx + 1);
    const recuperado = depois.some((e) => ehConversaoAtiva(e));
    const perdido = !recuperado && (depois.some((e) => e.tipo === 'descarte') && l.status === 'descarte');
    const reagendou = !recuperado && !perdido && depois.some((e) => e.tipo === 'agendamento');
    const retomada = depois.some((e) => e.tipo === 'contato' && e.passo === 'noshow');
    const etapa: EtapaNS = recuperado ? 'Recuperado' : perdido ? 'Perdido' : reagendou ? 'Agendado' : l.status === 'sem_retorno' ? 'Sem retorno' : retomada ? 'Retomada' : 'No-show';
    out.push({ id: l.id, nome: l.nome, unidade: un(l), etapa, dia, valor: l.valor, dono: dono(l) });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ visão executiva
export type Alerta = { nivel: 'risco' | 'atencao' | 'info'; tag: string; titulo: string; texto: string; acao: string; leadIds?: string[]; valor?: number };

export function analisarExecutivo(todos: Lead[], agora: Date, per: Periodo | Janela, unidade: string | null, tarefas: Tarefa[], vistas: Map<string, Vista>) {
  const J = janela(per, agora), dias = J.dias, hoje = J.ate, ini = J.de, ini0 = somaDias(ini, -dias), fim0 = somaDias(ini, -1), hojeReal = hojeDe(agora);
  const unidades = [...new Set(todos.map(un))].sort();
  const L = unidade ? todos.filter((l) => un(l) === unidade) : todos;
  const marcos = new Map<string, Marcos>(todos.map((l) => [l.id, marcosDe(l)]));
  const mk = (l: Lead) => marcos.get(l.id)!;
  const ativosL = L.filter((l) => (ATIVOS as string[]).includes(l.status));
  const atrasados = new Set(tarefas.filter((t) => t.situacao === 'atrasada').map((t) => t.leadId));

  // ---- receita convertida (ganho = compareceu e pagou + já foi à recepção)
  const ganhos = (a: string, b: string, base: Lead[] = L) => {
    const ativo = base.filter((l) => dentro(mk(l).compareceu, a, b)), org = base.filter((l) => dentro(mk(l).organico, a, b));
    return { ativo, org, valor: soma(ativo.map((l) => l.valor)) + soma(org.map((l) => l.valor)), n: ativo.length + org.length };
  };
  const g = ganhos(ini, hoje), g0 = ganhos(ini0, fim0);
  const valAtivo = soma(g.ativo.map((l) => l.valor)), valOrg = soma(g.org.map((l) => l.valor));
  const pipelineValor = soma(ativosL.map((l) => l.valor));

  // ---- pesos reais por etapa (histórico de todos os leads já resolvidos) e previsão ponderada
  const num: Record<string, number> = {}, den: Record<string, number> = {};
  for (const l of todos) {
    const sucesso = l.status === 'convertido_ativo' || l.status === 'convertido_organico', resolvido = sucesso || l.status === 'descarte';
    if (!resolvido) continue;
    for (const s of new Set(transicoes(l).map((t) => t.status))) if ((ATIVOS as string[]).includes(s)) { den[s] = (den[s] ?? 0) + 1; if (sucesso) num[s] = (num[s] ?? 0) + 1; }
  }
  const peso = (s: string) => ((den[s] ?? 0) >= 5 ? (num[s] ?? 0) / den[s] : null);
  const previsaoEtapas = ATIVOS.map((s) => {
    const ls = ativosL.filter((l) => l.status === s), w = peso(s), valor = soma(ls.map((l) => l.valor));
    return { status: s, rotulo: ROTULO_STATUS[s], peso: w === null ? null : r1(w * 100), amostra: den[s] ?? 0, n: ls.length, valor, esperado: Math.round(valor * (w ?? 0)) };
  });
  const previsao = soma(previsaoEtapas.map((p) => p.esperado));

  // ---- conversão (coorte: leads recebidos no período que já são ganho) e velocidade de venda
  const receb = (a: string, b: string) => L.filter((l) => l.d0 >= a && l.d0 <= b);
  const ganhoAgora = (l: Lead) => l.status === 'convertido_ativo' || l.status === 'convertido_organico';
  const rc = receb(ini, hoje), rc0 = receb(ini0, fim0);
  const conv = pc(rc.filter(ganhoAgora).length, rc.length), conv0 = pc(rc0.filter(ganhoAgora).length, rc0.length);
  const ciclos = (gs: ReturnType<typeof ganhos>) => [...gs.ativo.map((l) => diffDias(l.d0, mk(l).compareceu!)), ...gs.org.map((l) => diffDias(l.d0, mk(l).organico!))];
  const cic = ciclos(g), cic0 = ciclos(g0);
  const vel = mediana(cic), vel0 = mediana(cic0);

  // ---- risco: leads prestes a estourar o prazo da etapa e leads já fora do prazo
  const folga = (l: Lead) => { const lim = vistas.get(l.id)?.limite; return lim ? lim.dias - lim.usados : null; };
  const prestes = ativosL.filter((l) => { const f = folga(l); return f !== null && f >= 0 && f <= 2; });
  const excedidos = ativosL.filter((l) => vistas.get(l.id)?.limite?.excedido);

  // ---- no-show (funil de recuperação)
  const ns = casosNoShow(L, ini, hoje), ns0 = casosNoShow(L, ini0, fim0);
  const nsEtapas = ETAPAS_NOSHOW.map((e) => ({ etapa: e, n: ns.filter((c) => c.etapa === e).length })).map((x) => ({ ...x, pct: pc(x.n, ns.length) ?? 0 }));
  const nsRecuperados = ns.filter((c) => c.etapa === 'Recuperado');

  // ---- alertas executivos
  const alertas: Alerta[] = [];
  if (prestes.length) alertas.push({ nivel: 'risco', tag: 'ORÇAMENTOS', titulo: `${brl(soma(prestes.map((l) => l.valor)))} podem esfriar nas próximas 48h`, texto: `${prestes.length} ${prestes.length === 1 ? 'orçamento prestes' : 'orçamentos prestes'} a estourar o prazo da etapa em que ${prestes.length === 1 ? 'está' : 'estão'}, sem sinal de avanço.`, acao: 'Priorizar contato imediato com esses orçamentos.', leadIds: prestes.map((l) => l.id), valor: soma(prestes.map((l) => l.valor)) });
  if (excedidos.length) alertas.push({ nivel: 'atencao', tag: 'ORÇAMENTOS', titulo: `${excedidos.length} ${excedidos.length === 1 ? 'orçamento acima' : 'orçamentos acima'} do prazo da etapa`, texto: `Já passaram do limite de dias da cadência para a etapa em que estão parados (${brl(soma(excedidos.map((l) => l.valor)))} em orçamentos).`, acao: 'Revisar a fila de decisão executiva abaixo.', leadIds: excedidos.map((l) => l.id), valor: soma(excedidos.map((l) => l.valor)) });
  // unidade com queda de conversão
  const porUnidade = (u: string) => {
    const base = todos.filter((l) => un(l) === u), a = base.filter((l) => l.d0 >= ini && l.d0 <= hoje), b = base.filter((l) => l.d0 >= ini0 && l.d0 <= fim0);
    return { u, a: a.length, b: b.length, ca: pc(a.filter(ganhoAgora).length, a.length), cb: pc(b.filter(ganhoAgora).length, b.length) };
  };
  if (!unidade) {
    const quedas = unidades.map(porUnidade).filter((x) => x.a >= 5 && x.b >= 5 && x.ca !== null && x.cb !== null && x.ca - x.cb <= -10).sort((p, q) => (p.ca! - p.cb!) - (q.ca! - q.cb!));
    if (quedas[0]) alertas.push({ nivel: 'atencao', tag: 'UNIDADES', titulo: `${quedas[0].u.toUpperCase()} teve queda de ${fmt(Math.abs(quedas[0].ca! - quedas[0].cb!))} p.p. na conversão`, texto: 'Comparado ao período anterior de mesma duração.', acao: `Investigar o funil de ${quedas[0].u.toUpperCase()} neste período.` });
  }
  if (nsEtapas[0].n + ns.filter((c) => c.etapa === 'Retomada').length >= 3) alertas.push({ nivel: 'atencao', tag: 'NO-SHOW', titulo: `${ns.filter((c) => c.etapa === 'No-show' || c.etapa === 'Retomada').length} no-shows ainda sem reagendamento`, texto: 'Pacientes que faltaram e ainda não voltaram a agendar. É a 1ª prioridade da cadência.', acao: 'Enviar a mensagem 10 e oferecer novo horário.', leadIds: ns.filter((c) => c.etapa === 'No-show' || c.etapa === 'Retomada').map((c) => c.id), valor: soma(ns.filter((c) => c.etapa === 'No-show' || c.etapa === 'Retomada').map((c) => c.valor)) });
  if (g.n && g0.n && g.valor < g0.valor * 0.8) alertas.push({ nivel: 'atencao', tag: 'RECEITA', titulo: `A receita convertida caiu ${fmt(((g0.valor - g.valor) / g0.valor) * 100, 0)}%`, texto: `${brl(g.valor)} no período contra ${brl(g0.valor)} no anterior.`, acao: 'Ver a evolução em Análises > Evolução.' });
  if (!alertas.length) alertas.push({ nivel: 'info', tag: 'GERAL', titulo: 'Nenhum risco imediato', texto: 'Nenhum orçamento está perto de estourar o prazo da etapa e não há quedas relevantes de conversão.', acao: 'Manter o ritmo da cadência.' });
  const ordemA = { risco: 0, atencao: 1, info: 2 } as const;
  alertas.sort((a, b) => ordemA[a.nivel] - ordemA[b.nivel]);

  // ---- quem mais converteu
  const rk = new Map<string, { nome: string; valor: number; n: number }>();
  for (const l of [...g.ativo, ...g.org]) { const x = rk.get(dono(l)) ?? { nome: dono(l), valor: 0, n: 0 }; x.valor += l.valor; x.n++; rk.set(dono(l), x); }
  const ranking = [...rk.values()].sort((a, b) => b.valor - a.valor);

  // ---- fila de decisão executiva
  const ultimoMov = (l: Lead) => { const e = [...l.eventos].reverse().find((x) => x.tipo !== 'nota' && x.tipo !== 'edicao'); return e ? diaDoInstante(e.quando) : l.d0; };
  const fila = ativosL.map((l) => {
    const v = vistas.get(l.id), px = v?.proximo, f = folga(l);
    const prioridade = v?.limite?.excedido || (px && px.situacao === 'atrasada' && px.atraso >= 2) ? 'Risco' : (px && px.situacao === 'atrasada') || (f !== null && f <= 2) ? 'Atenção' : 'Oportunidade';
    const etapa = ETAPAS.find((e) => e.item === v?.item)?.rotulo ?? ROTULO_STATUS[l.status];
    return {
      id: l.id, nome: l.nome, unidade: un(l), etapa, parado: diffDias(ultimoMov(l), hojeReal), proxima: px ? px.passo.rotulo : l.status === 'agendado' ? 'Aguardar a data' : 'Aguardar resposta', valor: l.valor, prioridade,
      score: l.valor * (prioridade === 'Risco' ? 1.6 : prioridade === 'Atenção' ? 1.25 : 1),
    };
  }).sort((a, b) => b.score - a.score).slice(0, 120).map(({ score: _s, ...x }) => x);

  // ---- ritmo e conversão por data de entrada
  const P = pontos(hoje, dias, ini);
  const ritmo = { rotulos: P.rotulos, titulos: P.titulos, todos: Array<number>(P.n).fill(0), ativo: Array<number>(P.n).fill(0), organico: Array<number>(P.n).fill(0), participacao: Array<number | null>(P.n).fill(null) };
  for (const l of L) { const i = P.idx(l.d0); if (i < 0) continue; ritmo.todos[i]++; if (l.status === 'convertido_ativo') ritmo.ativo[i]++; if (l.status === 'convertido_organico') ritmo.organico[i]++; }
  ritmo.participacao = ritmo.todos.map((t, i) => pc(ritmo.ativo[i] + ritmo.organico[i], t));

  // ---- receita convertida ao longo do período (por ponto e acumulada)
  const receitaSerie = { rotulos: P.rotulos, titulos: P.titulos, porPonto: Array<number>(P.n).fill(0), acumulado: Array<number>(P.n).fill(0) };
  for (const l of g.ativo) { const i = P.idx(mk(l).compareceu!); if (i >= 0) receitaSerie.porPonto[i] += l.valor; }
  for (const l of g.org) { const i = P.idx(mk(l).organico!); if (i >= 0) receitaSerie.porPonto[i] += l.valor; }
  receitaSerie.porPonto.reduce((acc, v, i) => (receitaSerie.acumulado[i] = acc + v), 0);

  // ---- fluxo do dinheiro: leads recebidos -> responderam ou não -> resultado atual
  const resultado = (l: Lead): string => (l.status === 'convertido_ativo' ? 'ativo' : l.status === 'convertido_organico' ? 'organico' : l.status === 'descarte' ? 'descartado' : 'andamento');
  const fluxoLinks = new Map<string, { de: string; para: string; valor: number; n: number }>();
  const soma2 = (de: string, para: string, l: Lead) => { const k = de + '>' + para; const x = fluxoLinks.get(k) ?? { de, para, valor: 0, n: 0 }; x.valor += l.valor; x.n++; fluxoLinks.set(k, x); };
  for (const l of rc) { const col1 = mk(l).respondeu ? 'resp' : 'semresp'; soma2('rec', col1, l); soma2(col1, resultado(l), l); }
  const fluxo = {
    nos: [
      { id: 'rec', col: 0, rotulo: 'Leads recebidos' }, { id: 'resp', col: 1, rotulo: 'Responderam' }, { id: 'semresp', col: 1, rotulo: 'Sem resposta' },
      { id: 'ativo', col: 2, rotulo: 'Convertido ativo' }, { id: 'organico', col: 2, rotulo: 'Convertido orgânico' }, { id: 'andamento', col: 2, rotulo: 'Em andamento' }, { id: 'descartado', col: 2, rotulo: 'Descartado' },
    ],
    links: [...fluxoLinks.values()], totalValor: soma(rc.map((l) => l.valor)), totalN: rc.length,
  };

  // ---- pipeline por etapa (agora) e dinheiro por etapa
  const pipeEtapas = ETAPAS.map((e) => {
    const ls = ativosL.filter((l) => vistas.get(l.id)?.item === e.item), w = peso(e.status);
    return { item: e.item, etapa: e.rotulo, n: ls.length, valor: soma(ls.map((l) => l.valor)), peso: w === null ? null : r1(w * 100) };
  });
  const ganhoEtapas = [{ item: 'ativo', etapa: 'Convertido ativo', n: g.ativo.length, valor: valAtivo }, { item: 'organico', etapa: 'Convertido orgânico', n: g.org.length, valor: valOrg }];
  const perdidos = L.filter((l) => l.status === 'descarte' && dentro(mk(l).descartou, ini, hoje));
  const totalAberto = soma(pipeEtapas.map((p) => p.valor));
  const maior = [...pipeEtapas].sort((a, b) => b.valor - a.valor)[0];
  const dinheiro = {
    etapas: [...pipeEtapas.map((p) => ({ etapa: p.etapa, valor: p.valor, tipo: 'aberto' as const })), { etapa: 'Convertido (período)', valor: g.valor, tipo: 'ganho' as const }, { etapa: 'Perdido (período)', valor: soma(perdidos.map((l) => l.valor)), tipo: 'perdido' as const }],
    concentracao: maior && totalAberto > 0 ? { etapa: maior.etapa, pct: Math.round((maior.valor / totalAberto) * 100) } : null,
    vencidoValor: soma(excedidos.map((l) => l.valor)), vencidoN: excedidos.length,
  };

  // ---- mapa de envelhecimento
  const idade = (n: number) => FAIXAS_IDADE.findIndex(([, ok]) => ok(n));
  const envOrc = ETAPAS.map((e) => {
    const faixas = FAIXAS_IDADE.map(() => 0);
    for (const l of ativosL) if (vistas.get(l.id)?.item === e.item) faixas[idade(Math.max(0, diffDias(l.statusDesde, hojeReal)))]++;
    return { etapa: e.rotulo, faixas };
  }).filter((r) => r.faixas.some((n) => n > 0));
  const nsAbertos = ns.filter((c) => c.etapa === 'No-show' || c.etapa === 'Retomada' || c.etapa === 'Agendado' || c.etapa === 'Sem retorno');
  const envNs = (['No-show', 'Retomada', 'Agendado', 'Sem retorno'] as EtapaNS[]).map((e) => {
    const faixas = FAIXAS_IDADE.map(() => 0);
    for (const c of nsAbertos) if (c.etapa === e) faixas[idade(Math.max(0, diffDias(c.dia, hojeReal)))]++;
    return { etapa: e as string, faixas };
  }).filter((r) => r.faixas.some((n) => n > 0));
  const critico = (rows: { faixas: number[] }[]) => soma(rows.map((r) => r.faixas[3]));
  const pontosOrc = ativosL.map((l) => ({ id: l.id, nome: l.nome, etapa: ETAPAS.find((e) => e.item === vistas.get(l.id)?.item)?.rotulo ?? ROTULO_STATUS[l.status], dias: Math.max(0, diffDias(l.statusDesde, hojeReal)), valor: l.valor }));
  const pontosNs = nsAbertos.map((c) => ({ id: c.id, nome: c.nome, etapa: c.etapa as string, dias: Math.max(0, diffDias(c.dia, hojeReal)), valor: c.valor }));
  const envelhecimento = { faixas: FAIXAS_IDADE.map(([r]) => r), orcamentos: envOrc, noshow: envNs, criticosOrcamentos: critico(envOrc), criticosNoshow: critico(envNs), pontos: { orcamentos: pontosOrc, noshow: pontosNs } };

  // ---- unidades: volume x conversão (compara todas as unidades, ignora o filtro de unidade)
  const bolhasOrc = unidades.map((u) => {
    const base = todos.filter((l) => un(l) === u), r = base.filter((l) => l.d0 >= ini && l.d0 <= hoje), gg = ganhos(ini, hoje, base);
    return { nome: u, volume: r.length, taxa: pc(r.filter(ganhoAgora).length, r.length) ?? 0, receita: gg.valor, convertidos: r.filter(ganhoAgora).length };
  }).filter((b) => b.volume > 0);
  const nsTodos = casosNoShow(todos, ini, hoje);
  const bolhasNs = unidades.map((u) => {
    const c = nsTodos.filter((x) => x.unidade === u), rec = c.filter((x) => x.etapa === 'Recuperado');
    return { nome: u, volume: c.length, taxa: pc(rec.length, c.length) ?? 0, receita: soma(rec.map((x) => x.valor)), convertidos: rec.length };
  }).filter((b) => b.volume > 0);
  const melhor = (b: { nome: string; volume: number; convertidos: number }[]) => [...b].sort((x, y) => y.convertidos - x.convertidos || y.volume - x.volume)[0]?.nome ?? null;
  const unidadesBolhas = { orcamentos: bolhasOrc, noshow: bolhasNs, melhorOrcamentos: bolhasOrc.length > 1 ? melhor(bolhasOrc) : null, melhorNoshow: bolhasNs.length > 1 ? melhor(bolhasNs) : null };

  // ---- atividade por login
  const nomes = new Set<string>(L.map(dono));
  const mov = new Map<string, { movimentos: number; contatos: number; respostas: number; agendamentos: number }>();
  const TIPOS_MOV = ['contato', 'resposta', 'agendamento', 'retorno', 'descarte', 'comparecimento', 'recepcao', 'nota'];
  for (const l of L) for (const e of l.eventos) {
    if (!TIPOS_MOV.includes(e.tipo) || !dentro(diaDoInstante(e.quando), ini, hoje)) continue;
    const q = quem(e, l); nomes.add(q);
    const x = mov.get(q) ?? { movimentos: 0, contatos: 0, respostas: 0, agendamentos: 0 }; x.movimentos++;
    if (e.tipo === 'contato') x.contatos++; else if (e.tipo === 'resposta') x.respostas++; else if (e.tipo === 'agendamento') x.agendamentos++;
    mov.set(q, x);
  }
  const atividade = [...nomes].map((nome) => ({ nome, ...(mov.get(nome) ?? { movimentos: 0, contatos: 0, respostas: 0, agendamentos: 0 }), receita: soma([...g.ativo, ...g.org].filter((l) => dono(l) === nome).map((l) => l.valor)) })).sort((a, b) => b.movimentos - a.movimentos);

  return {
    dias, hoje, ini, de: ini, ate: hoje, unidade, unidades,
    kpis: {
      receita: { valor: g.valor, n: g.n, ativo: { valor: valAtivo, n: g.ativo.length }, organico: { valor: valOrg, n: g.org.length }, anterior: g0.valor, deltaPct: delta(g.valor, g0.valor) },
      pipeline: { valor: pipelineValor, n: ativosL.length, multiplo: g.valor > 0 ? r1(pipelineValor / g.valor) : null },
      previsao: { valor: previsao, pctDoAberto: pipelineValor > 0 ? Math.round((previsao / pipelineValor) * 100) : null },
      conversao: { taxa: conv, convertidos: rc.filter(ganhoAgora).length, recebidos: rc.length, deltaPP: conv !== null && conv0 !== null ? r1(conv - conv0) : null },
      velocidade: { mediana: vel, n: cic.length, deltaDias: vel !== null && vel0 !== null ? r1(vel - vel0) : null },
    },
    previsaoEtapas, alertas, ranking, fila, ritmo, receitaSerie, fluxo, pipelineEtapas: pipeEtapas, ganhoEtapas, dinheiro, envelhecimento, unidadesBolhas, atividade,
    noshow: { entraram: ns.length, anterior: ns0.length, recuperados: nsRecuperados.length, pctRecuperacao: pc(nsRecuperados.length, ns.length), valorRecuperado: soma(nsRecuperados.map((c) => c.valor)), etapas: nsEtapas },
  };
}
export type AnaliseExecutiva = ReturnType<typeof analisarExecutivo>;

// ------------------------------------------------------------------------------------------------ meu report (individual)
export function meuReport(todos: Lead[], agora: Date, per: Periodo | Janela, nome: string, tarefas: Tarefa[], vistas: Map<string, Vista>) {
  const J = janela(per, agora), dias = J.dias, hoje = J.ate, ini = J.de, ini0 = somaDias(ini, -dias), fim0 = somaDias(ini, -1), hojeReal = hojeDe(agora);
  const marcos = new Map<string, Marcos>(todos.map((l) => [l.id, marcosDe(l)]));
  const mk = (l: Lead) => marcos.get(l.id)!;
  const nomes = [...new Set(todos.map(dono))].sort();
  const ativoSt = (l: Lead) => (ATIVOS as string[]).includes(l.status);
  const ganhoAgora = (l: Lead) => l.status === 'convertido_ativo' || l.status === 'convertido_organico';
  const diaGanho = (l: Lead) => mk(l).compareceu ?? mk(l).organico;

  // métricas de uma pessoa em uma janela (atividade = o que a pessoa FEZ; resultado = leads sob a responsabilidade dela)
  const metricas = (n: string, a: string, b: string) => {
    const meus = todos.filter((l) => dono(l) === n);
    let contatos = 0, respostas = 0, agend = 0;
    for (const l of todos) for (const e of l.eventos) { if (quem(e, l) !== n) continue; const d = diaDoInstante(e.quando); if (d < a || d > b) continue; if (e.tipo === 'contato') contatos++; else if (e.tipo === 'resposta') respostas++; else if (e.tipo === 'agendamento') agend++; }
    const ganhos = meus.filter((l) => dentro(diaGanho(l), a, b));
    const recebidos = meus.filter((l) => l.d0 >= a && l.d0 <= b);
    const ciclos = ganhos.map((l) => diffDias(l.d0, diaGanho(l)!));
    return {
      contatos, respostas, agendamentos: agend, taxaResposta: pc(respostas, contatos), convertidos: ganhos.length, receita: soma(ganhos.map((l) => l.valor)), recebidos: recebidos.length,
      conversao: pc(recebidos.filter(ganhoAgora).length, recebidos.length), velocidade: mediana(ciclos), descartes: meus.filter((l) => l.status === 'descarte' && dentro(mk(l).descartou, a, b)).length,
    };
  };
  const atual = metricas(nome, ini, hoje), anterior = metricas(nome, ini0, fim0);
  const equipe = nomes.map((n) => ({ nome: n, ...metricas(n, ini, hoje) }));
  const posicao = (campo: 'receita' | 'convertidos' | 'contatos' | 'conversao') => {
    const ord = [...equipe].filter((e) => (e[campo] ?? 0) > 0 || e.nome === nome).sort((a, b) => (b[campo] ?? 0) - (a[campo] ?? 0));
    return { pos: ord.findIndex((e) => e.nome === nome) + 1, de: ord.length, valores: ord.map((e) => ({ nome: e.nome, valor: e[campo] ?? 0 })) };
  };
  const mediaEq = (campo: 'receita' | 'convertidos' | 'contatos' | 'conversao' | 'taxaResposta' | 'velocidade') => { const v = equipe.filter((e) => e[campo] !== null && e[campo] !== undefined && (campo !== 'conversao' && campo !== 'taxaResposta' && campo !== 'velocidade' ? true : (e[campo] as number) >= 0)).map((e) => e[campo] as number); return v.length ? Math.round(soma(v) / v.length * 10) / 10 : null; };

  // ---- séries no tempo
  const P = pontos(hoje, dias, ini);
  const zero = () => Array<number>(P.n).fill(0);
  const S = { contatos: zero(), respostas: zero(), agendamentos: zero(), convertidos: zero(), receita: zero(), recebidos: zero() };
  const heat = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const msgs = new Map<number, { env: number; resp: number }>();
  for (const l of todos) {
    if (dono(l) === nome) {
      const i0 = P.idx(l.d0); if (i0 >= 0) S.recebidos[i0]++;
      const dg = diaGanho(l); if (dg) { const i = P.idx(dg); if (i >= 0) { S.convertidos[i]++; S.receita[i] += l.valor; } }
    }
    const evs = [...l.eventos].sort((a, b) => a.quando.localeCompare(b.quando));
    evs.forEach((e, k) => {
      if (quem(e, l) !== nome) return;
      const dia = diaDoInstante(e.quando), i = P.idx(dia); if (i < 0) return;
      if (e.tipo === 'contato') {
        S.contatos[i]++;
        heat[new Date(`${dia}T12:00:00Z`).getUTCDay()][horaDe(new Date(e.quando)).h]++;
        if (e.msg) { const x = msgs.get(e.msg) ?? { env: 0, resp: 0 }; x.env++; const t0 = Date.parse(e.quando); for (let j = k + 1; j < evs.length; j++) { if (evs[j].tipo === 'contato') break; if (evs[j].tipo === 'resposta') { if (Date.parse(evs[j].quando) - t0 <= 72 * 3_600_000) x.resp++; break; } } msgs.set(e.msg, x); }
      } else if (e.tipo === 'resposta') S.respostas[i]++; else if (e.tipo === 'agendamento') S.agendamentos[i]++;
    });
  }

  // ---- carteira atual, funil e descartes
  const meus = todos.filter((l) => dono(l) === nome);
  const carteiraL = meus.filter(ativoSt), ids = new Set(carteiraL.map((l) => l.id));
  const minhasTarefas = tarefas.filter((t) => ids.has(t.leadId));
  const carteira = {
    n: carteiraL.length, valor: soma(carteiraL.map((l) => l.valor)), atrasadas: minhasTarefas.filter((t) => t.situacao === 'atrasada').length, hoje: minhasTarefas.length,
    foraDoLimite: carteiraL.filter((l) => vistas.get(l.id)?.limite?.excedido).length,
    porEtapa: ETAPAS.map((e) => { const ls = carteiraL.filter((l) => vistas.get(l.id)?.item === e.item); return { etapa: e.rotulo, n: ls.length, valor: soma(ls.map((l) => l.valor)) }; }).filter((x) => x.n > 0),
    aging: FAIXAS_IDADE.map(([rotulo, ok]) => ({ rotulo, n: carteiraL.filter((l) => ok(Math.max(0, diffDias(l.statusDesde, hojeReal)))).length })),
  };
  const rec = meus.filter((l) => l.d0 >= ini && l.d0 <= hoje);
  const m = (f: (x: Marcos) => boolean) => rec.filter((l) => f(mk(l))).length;
  const funil = [['Leads recebidos', rec.length], ['Contatados', m((x) => !!x.contatado)], ['Responderam', m((x) => !!x.respondeu)], ['Agendaram', m((x) => !!x.agendou)], ['Convertidos', rec.filter(ganhoAgora).length]]
    .map(([etapa, n], i, a) => ({ etapa: etapa as string, n: n as number, pct: pc(n as number, a[0][1] as number) ?? 0, perda: i && (a[i - 1][1] as number) ? r1(100 - ((n as number) / (a[i - 1][1] as number)) * 100) ?? 0 : 0 }));
  const motivos = new Map<string, { n: number; valor: number }>();
  for (const l of meus) if (l.status === 'descarte' && dentro(mk(l).descartou, ini, hoje)) { const k = mk(l).motivo ?? 'Outro'; const x = motivos.get(k) ?? { n: 0, valor: 0 }; x.n++; x.valor += l.valor; motivos.set(k, x); }
  const descartes = [...motivos.entries()].map(([motivo, x]) => ({ motivo, ...x })).sort((a, b) => b.n - a.n);
  const mensagens = MENSAGENS.map((ms) => { const x = msgs.get(ms.n) ?? { env: 0, resp: 0 }; return { n: ms.n, titulo: ms.titulo, enviadas: x.env, respostas: x.resp, taxa: pc(x.resp, x.env) }; }).filter((x) => x.enviadas > 0);
  const casos = casosNoShow(meus, ini, hoje), rcNs = casos.filter((c) => c.etapa === 'Recuperado');
  const noshow = { entraram: casos.length, recuperados: rcNs.length, pct: pc(rcNs.length, casos.length), valorRecuperado: soma(rcNs.map((c) => c.valor)) };

  // ---- comparação com a equipe e posição
  const ranking = { receita: posicao('receita'), convertidos: posicao('convertidos'), contatos: posicao('contatos'), conversao: posicao('conversao') };
  const media = { receita: mediaEq('receita'), convertidos: mediaEq('convertidos'), contatos: mediaEq('contatos'), conversao: mediaEq('conversao'), taxaResposta: mediaEq('taxaResposta'), velocidade: mediaEq('velocidade') };

  // ---- radar: o quanto a pessoa chega perto do melhor da equipe em cada eixo (velocidade: menor é melhor)
  const eixo = (nomeEixo: string, f: (e: (typeof equipe)[number]) => number | null, invertido = false) => {
    const vals = equipe.map(f).filter((v): v is number => v !== null && (!invertido || v > 0));
    const eu = f(equipe.find((e) => e.nome === nome) ?? equipe[0]);
    const melhorV = vals.length ? (invertido ? Math.min(...vals) : Math.max(...vals)) : 0;
    const mediaV = vals.length ? Math.round((soma(vals) / vals.length) * 10) / 10 : null;
    return { eixo: nomeEixo, valor: eu, media: mediaV, melhor: melhorV, invertido };
  };
  const radar = [
    eixo('Receita', (e) => e.receita), eixo('Conversão', (e) => e.conversao), eixo('Contatos', (e) => e.contatos),
    eixo('Resposta', (e) => e.taxaResposta), eixo('Agendamentos', (e) => e.agendamentos), eixo('Velocidade', (e) => e.velocidade, true),
  ];

  // ---- resumo para a diretoria (frases prontas, com os números)
  const resumo: string[] = [];
  const dr = delta(atual.receita, anterior.receita);
  resumo.push(`${nome} recebeu ${atual.recebidos} ${atual.recebidos === 1 ? 'lead' : 'leads'} ${fraseJanela(J, hojeReal).quando} e converteu ${atual.convertidos}, gerando ${brl(atual.receita)}${dr !== null ? (Math.abs(dr) <= 500 ? `, ${dr >= 0 ? 'alta' : 'queda'} de ${fmt(Math.abs(dr), 0)}% sobre o período anterior (${brl(anterior.receita)})` : `, contra ${brl(anterior.receita)} no período anterior`) : ''}.`);
  if (ranking.receita.de > 1 && atual.receita > 0) resumo.push(`Ocupa a ${ranking.receita.pos}ª posição de ${ranking.receita.de} em receita convertida na equipe.`);
  if (atual.contatos) resumo.push(`Fez ${atual.contatos} ${atual.contatos === 1 ? 'contato' : 'contatos'} e recebeu ${atual.respostas} ${atual.respostas === 1 ? 'resposta' : 'respostas'} (taxa de ${atual.taxaResposta !== null ? fmt(atual.taxaResposta, 0) : '–'}%${media.taxaResposta !== null ? `, média da equipe ${fmt(media.taxaResposta, 0)}%` : ''}).`);
  if (atual.conversao !== null) resumo.push(`A conversão dos leads recebidos é de ${fmt(atual.conversao, 0)}%${media.conversao !== null ? ` (média da equipe ${fmt(media.conversao, 0)}%)` : ''}${atual.velocidade !== null ? `, com ${fmt(atual.velocidade, 1)} dias de ciclo mediano até converter` : ''}.`);
  resumo.push(`A carteira ativa tem ${carteira.n} ${carteira.n === 1 ? 'lead' : 'leads'} (${brl(carteira.valor)}); ${carteira.atrasadas} com passo atrasado e ${carteira.foraDoLimite} fora do limite de dias da etapa.`);
  const mb = [...mensagens].filter((x) => x.enviadas >= 5 && x.taxa !== null).sort((a, b) => b.taxa! - a.taxa!)[0];
  if (mb) resumo.push(`A mensagem que mais gera resposta nos contatos de ${nome} é a ${mb.n} (${mb.titulo}), com ${fmt(mb.taxa!, 0)}%.`);
  if (noshow.entraram) resumo.push(`Recuperou ${noshow.recuperados} de ${noshow.entraram} no-shows (${brl(noshow.valorRecuperado)}).`);

  return {
    dias, hoje, ini, de: ini, ate: hoje, nome, nomes, rotulos: P.rotulos, titulos: P.titulos, semanal: P.semanal,
    atual, anterior, media, ranking, radar, series: S, heat, carteira, funil, descartes, mensagens, noshow, resumo,
    equipe: equipe.map((e) => ({ nome: e.nome, receita: e.receita, convertidos: e.convertidos, contatos: e.contatos, conversao: e.conversao })).sort((a, b) => b.receita - a.receita),
  };
}
export type MeuReport = ReturnType<typeof meuReport>;

// ------------------------------------------------------------------------------------------------ Time: todos os vendedores lado a lado

/**
 * Aba "Time" de Análises: cada responsável (dono dos leads) com atividade (contatos, respostas, agendamentos), resultado
 * (convertidos, receita, ticket, conversão, ciclo), velocidade (dias até o 1º contato), carteira de agora e a evolução no
 * tempo, mais o total do time, a IA de disparo à parte e o funil do período. Mesmas regras do "Meu Report" (atividade = o que a
 * pessoa FEZ; resultado = leads sob a responsabilidade dela). Função pura.
 */
export function analisarTime(todos: Lead[], agora: Date, per: Periodo | Janela, tarefas: Tarefa[], vistas: Map<string, Vista>) {
  const J = janela(per, agora), dias = J.dias, hoje = J.ate, ini = J.de, ini0 = somaDias(ini, -dias), fim0 = somaDias(ini, -1), hojeReal = hojeDe(agora);
  const marcos = new Map<string, Marcos>(todos.map((l) => [l.id, marcosDe(l)]));
  const mk = (l: Lead) => marcos.get(l.id)!;
  const nomes = [...new Set(todos.map(dono))].sort();
  const ativoSt = (l: Lead) => (ATIVOS as string[]).includes(l.status);
  const ganhoAgora = (l: Lead) => l.status === 'convertido_ativo' || l.status === 'convertido_organico';
  const diaGanho = (l: Lead) => mk(l).compareceu ?? mk(l).organico;
  const IA = 'IA';

  // atividade por quem fez; resultado por dono. nome === null = todo o time (qualquer autor, qualquer dono)
  const metricas = (nome: string | null, a: string, b: string) => {
    const meus = nome === null ? todos : todos.filter((l) => dono(l) === nome);
    let contatos = 0, respostas = 0, agend = 0;
    for (const l of todos) for (const e of l.eventos) {
      if (nome !== null && quem(e, l) !== nome) continue;
      const d = diaDoInstante(e.quando); if (d < a || d > b) continue;
      if (e.tipo === 'contato') contatos++; else if (e.tipo === 'resposta') respostas++; else if (e.tipo === 'agendamento') agend++;
    }
    const ganhos = meus.filter((l) => dentro(diaGanho(l), a, b));
    const recebidos = meus.filter((l) => l.d0 >= a && l.d0 <= b);
    const comContato = recebidos.filter((l) => !!mk(l).contatado);
    const ciclos = ganhos.map((l) => diffDias(l.d0, diaGanho(l)!));
    const receita = soma(ganhos.map((l) => l.valor));
    return {
      recebidos: recebidos.length, contatos, respostas, agendamentos: agend, taxaResposta: pc(respostas, contatos),
      convertidos: ganhos.length, receita, ticket: ganhos.length ? Math.round(receita / ganhos.length) : null,
      conversao: pc(recebidos.filter(ganhoAgora).length, recebidos.length), ciclo: mediana(ciclos),
      primeiroContato: mediana(comContato.map((l) => Math.max(0, diffDias(l.d0, mk(l).contatado!)))), semContato: recebidos.length - comContato.length,
      descartes: meus.filter((l) => l.status === 'descarte' && dentro(mk(l).descartou, a, b)).length,
    };
  };

  const equipe = nomes.map((n) => {
    const atual = metricas(n, ini, hoje), anterior = metricas(n, ini0, fim0);
    const meus = todos.filter((l) => dono(l) === n), cart = meus.filter(ativoSt), ids = new Set(cart.map((l) => l.id));
    const ns = casosNoShow(meus, ini, hoje), rc = ns.filter((c) => c.etapa === 'Recuperado');
    return {
      nome: n, ...atual, anterior: { receita: anterior.receita, convertidos: anterior.convertidos, contatos: anterior.contatos, conversao: anterior.conversao, recebidos: anterior.recebidos },
      carteira: { n: cart.length, valor: soma(cart.map((l) => l.valor)), atrasadas: tarefas.filter((t) => t.situacao === 'atrasada' && ids.has(t.leadId)).length, foraDoLimite: cart.filter((l) => vistas.get(l.id)?.limite?.excedido).length },
      noshow: { entraram: ns.length, recuperados: rc.length, valorRecuperado: soma(rc.map((c) => c.valor)) },
    };
  }).sort((a, b) => b.receita - a.receita || b.contatos - a.contatos || a.nome.localeCompare(b.nome));
  const totalAtual = metricas(null, ini, hoje), totalAnterior = metricas(null, ini0, fim0);

  // ---- evolução no tempo: o time todo, a IA e cada pessoa (as 8 que mais movimentam)
  const P = pontos(hoje, dias, ini);
  const zero = () => Array<number>(P.n).fill(0);
  const nova = () => ({ contatos: zero(), respostas: zero(), agendamentos: zero(), convertidos: zero(), receita: zero(), recebidos: zero() });
  const total = nova(), ia = nova(), porPessoa = new Map<string, ReturnType<typeof nova>>(nomes.map((n) => [n, nova()]));
  const heat = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const msgs = new Map<number, { env: number; resp: number }>();
  for (const l of todos) {
    const meu = porPessoa.get(dono(l))!;
    const i0 = P.idx(l.d0); if (i0 >= 0) { total.recebidos[i0]++; meu.recebidos[i0]++; }
    const dg = diaGanho(l); if (dg) { const i = P.idx(dg); if (i >= 0) { total.convertidos[i]++; total.receita[i] += l.valor; meu.convertidos[i]++; meu.receita[i] += l.valor; } }
    const evs = [...l.eventos].sort((a, b) => a.quando.localeCompare(b.quando));
    evs.forEach((e, k) => {
      const dia = diaDoInstante(e.quando), i = P.idx(dia); if (i < 0) return;
      const autor = quem(e, l), s = porPessoa.get(autor), eIA = e.auto === true || autor === IA;
      const campo = e.tipo === 'contato' ? 'contatos' : e.tipo === 'resposta' ? 'respostas' : e.tipo === 'agendamento' ? 'agendamentos' : null;
      if (!campo) return;
      total[campo][i]++; if (eIA && campo === 'contatos') ia.contatos[i]++; if (s) s[campo][i]++;
      if (campo === 'contatos') {
        heat[new Date(`${dia}T12:00:00Z`).getUTCDay()][horaDe(new Date(e.quando)).h]++;
        if (e.msg) {
          const x = msgs.get(e.msg) ?? { env: 0, resp: 0 }; x.env++; const t0 = Date.parse(e.quando);
          for (let j = k + 1; j < evs.length; j++) { if (evs[j].tipo === 'contato') break; if (evs[j].tipo === 'resposta') { if (Date.parse(evs[j].quando) - t0 <= 72 * 3_600_000) x.resp++; break; } }
          msgs.set(e.msg, x);
        }
      }
    });
  }
  const principais = equipe.filter((e) => e.nome !== 'Sem responsável').slice(0, 8).map((e) => e.nome);
  const pessoas: Record<string, ReturnType<typeof nova>> = {}; for (const n of principais) pessoas[n] = porPessoa.get(n)!;

  // ---- funil do período (leads recebidos por todo o time), unidades e mensagens
  const rec = todos.filter((l) => l.d0 >= ini && l.d0 <= hoje);
  const mf = (f: (x: Marcos) => boolean) => rec.filter((l) => f(mk(l))).length;
  const funil = [['Leads recebidos', rec.length], ['Contatados', mf((x) => !!x.contatado)], ['Responderam', mf((x) => !!x.respondeu)], ['Agendaram', mf((x) => !!x.agendou)], ['Convertidos', rec.filter(ganhoAgora).length]]
    .map(([etapa, n], i, a) => ({ etapa: etapa as string, n: n as number, pct: pc(n as number, a[0][1] as number) ?? 0, perda: i && (a[i - 1][1] as number) ? r1(100 - ((n as number) / (a[i - 1][1] as number)) * 100) ?? 0 : 0 }));
  const unidades = [...new Set(todos.map(un))].sort().map((u) => {
    const ls = todos.filter((l) => un(l) === u), r = ls.filter((l) => l.d0 >= ini && l.d0 <= hoje), g = ls.filter((l) => dentro(diaGanho(l), ini, hoje));
    return { nome: u, recebidos: r.length, convertidos: g.length, receita: soma(g.map((l) => l.valor)), conversao: pc(r.filter(ganhoAgora).length, r.length) };
  }).filter((u) => u.recebidos || u.convertidos).sort((a, b) => b.receita - a.receita);
  const mensagens = MENSAGENS.map((ms) => { const x = msgs.get(ms.n) ?? { env: 0, resp: 0 }; return { n: ms.n, titulo: ms.titulo, enviadas: x.env, respostas: x.resp, taxa: pc(x.resp, x.env) }; }).filter((x) => x.enviadas > 0);
  const semDono = todos.filter((l) => dono(l) === 'Sem responsável' && ativoSt(l));

  // ---- destaques em frases
  const destaques: { nivel: 'bom' | 'atencao' | 'info'; texto: string }[] = [];
  const add = (nivel: 'bom' | 'atencao' | 'info', texto: string) => destaques.push({ nivel, texto });
  const comNome = equipe.filter((e) => e.nome !== 'Sem responsável');
  const topReceita = comNome[0];
  if (topReceita && topReceita.receita > 0) add('bom', `${topReceita.nome} lidera em receita convertida: ${brl(topReceita.receita)} com ${topReceita.convertidos} ${topReceita.convertidos === 1 ? 'conversão' : 'conversões'}.`);
  const melhorConv = comNome.filter((e) => e.recebidos >= 5 && e.conversao !== null).sort((a, b) => b.conversao! - a.conversao!)[0];
  if (melhorConv) add('bom', `${melhorConv.nome} tem a melhor conversão entre quem recebeu 5 leads ou mais: ${fmt(melhorConv.conversao!, 0)}%.`);
  const subiu = comNome.map((e) => ({ e, d: e.receita - e.anterior.receita })).filter((x) => x.e.anterior.receita > 0 && x.d > 0).sort((a, b) => b.d - a.d)[0];
  if (subiu) add('bom', `${subiu.e.nome} foi quem mais cresceu em receita sobre o período anterior: +${brl(subiu.d)}.`);
  const caiu = comNome.map((e) => ({ e, d: e.receita - e.anterior.receita })).filter((x) => x.e.anterior.receita >= 500 && x.d < 0).sort((a, b) => a.d - b.d)[0];
  if (caiu) add('atencao', `${caiu.e.nome} teve a maior queda de receita sobre o período anterior: −${brl(Math.abs(caiu.d))}.`);
  const maisAtrasos = comNome.filter((e) => e.carteira.atrasadas > 0).sort((a, b) => b.carteira.atrasadas - a.carteira.atrasadas)[0];
  if (maisAtrasos) add('atencao', `${maisAtrasos.nome} tem ${maisAtrasos.carteira.atrasadas} ${maisAtrasos.carteira.atrasadas === 1 ? 'passo atrasado' : 'passos atrasados'} na carteira (${brl(maisAtrasos.carteira.valor)} em andamento).`);
  const lentos = comNome.filter((e) => e.primeiroContato !== null && e.recebidos >= 5).sort((a, b) => b.primeiroContato! - a.primeiroContato!)[0];
  if (lentos && lentos.primeiroContato! >= 2) add('atencao', `${lentos.nome} leva em média ${fmt(lentos.primeiroContato!, 0)} dias para o primeiro contato (mediana). Quanto antes, mais o lead responde.`);
  if (semDono.length) add('atencao', `${semDono.length} ${semDono.length === 1 ? 'lead ativo está' : 'leads ativos estão'} sem responsável (${brl(soma(semDono.map((l) => l.valor)))}). Defina quem atende.`);
  const iaTotal = soma(ia.contatos);
  if (iaTotal) add('info', `A IA de disparo fez ${iaTotal} de ${totalAtual.contatos} contatos do período (${fmt((iaTotal / Math.max(1, totalAtual.contatos)) * 100, 0)}%).`);
  if (!destaques.length) add('info', 'Ainda não há movimento suficiente no período para destacar alguém.');

  return {
    dias, hoje, de: ini, ate: hoje, ...fraseJanela(J, hojeReal), semanal: P.semanal, rotulos: P.rotulos, titulos: P.titulos,
    equipe, totais: { atual: totalAtual, anterior: totalAnterior },
    series: { total, ia, pessoas, principais }, heat, funil, unidades, mensagens, destaques,
    semResponsavel: { n: semDono.length, valor: soma(semDono.map((l) => l.valor)) },
  };
}
export type AnaliseTime = ReturnType<typeof analisarTime>;

// ------------------------------------------------------------------------------------------------ detalhe de uma pessoa (modal de "Atividade por login")

/**
 * Tudo sobre uma pessoa no período: o Meu Report (resultado, atividade, funil, carteira, ranking) mais as listas que o
 * explicam: quem ela converteu, a carteira de agora (lead a lead) e o que ela fez, movimento a movimento.
 */
export function detalhePessoa(todos: Lead[], agora: Date, per: Periodo | Janela, nome: string, tarefas: Tarefa[], vistas: Map<string, Vista>) {
  const rep = meuReport(todos, agora, per, nome, tarefas, vistas);
  const J = janela(per, agora), ini = J.de, hoje = J.ate, hojeReal = hojeDe(agora);
  const meus = todos.filter((l) => dono(l) === nome);
  const mk = (l: Lead) => marcosDe(l);
  const diaGanho = (m: Marcos) => m.compareceu ?? m.organico;
  const convertidos = meus.map((l) => ({ l, m: mk(l) })).filter(({ m }) => dentro(diaGanho(m), ini, hoje))
    .map(({ l, m }) => ({ leadId: l.id, nome: l.nome, valor: l.valor, dia: diaGanho(m)!, tipo: m.compareceu ? 'ativo' : 'organico', ciclo: diffDias(l.d0, diaGanho(m)!), exame: l.exame, unidade: un(l) }))
    .sort((a, b) => b.dia.localeCompare(a.dia) || b.valor - a.valor);
  const ativos = meus.filter((l) => (ATIVOS as string[]).includes(l.status));
  const carteiraLeads = ativos.map((l) => {
    const v = vistas.get(l.id), px = v?.proximo;
    return { leadId: l.id, nome: l.nome, valor: l.valor, etapa: ETAPAS.find((e) => e.item === v?.item)?.rotulo ?? ROTULO_STATUS[l.status] ?? l.status, proximo: px ? px.passo.rotulo : null, situacao: px?.situacao ?? null, atraso: px?.atraso ?? 0, diasNaEtapa: Math.max(0, diffDias(l.statusDesde, hojeReal)), foraDoLimite: !!v?.limite?.excedido };
  }).sort((a, b) => (b.situacao === 'atrasada' ? 1 : 0) - (a.situacao === 'atrasada' ? 1 : 0) || b.valor - a.valor).slice(0, 60);
  const TIPOS = ['contato', 'resposta', 'agendamento', 'retorno', 'descarte', 'comparecimento', 'recepcao', 'etapa', 'nota'];
  const porTipo: Record<string, number> = {};
  const atividade: { quando: string; leadId: string; lead: string; tipo: string; texto: string; auto: boolean }[] = [];
  const movDia = Array<number>(rep.rotulos.length).fill(0);
  const P = pontos(hoje, J.dias, ini);
  for (const l of todos) for (const e of l.eventos) {
    if (quem(e, l) !== nome || !TIPOS.includes(e.tipo)) continue;
    const d = diaDoInstante(e.quando); if (d < ini || d > hoje) continue;
    porTipo[e.tipo] = (porTipo[e.tipo] ?? 0) + 1;
    const i = P.idx(d); if (i >= 0) movDia[i]++;
    atividade.push({ quando: e.quando, leadId: l.id, lead: l.nome, tipo: e.tipo, texto: e.texto.replace(/\s+/g, ' ').slice(0, 160), auto: !!e.auto });
  }
  atividade.sort((a, b) => b.quando.localeCompare(a.quando));
  const recebidosLista = meus.filter((l) => l.d0 >= ini && l.d0 <= hoje).length;
  return { ...rep, movimentos: { total: soma(Object.values(porTipo)), porTipo: Object.entries(porTipo).map(([tipo, n]) => ({ tipo, n })).sort((a, b) => b.n - a.n), serie: movDia }, convertidos, carteiraLeads, atividade: atividade.slice(0, 80), atividadeTotal: atividade.length, recebidosLista, donoDeLeads: meus.length };
}
export type DetalhePessoa = ReturnType<typeof detalhePessoa>;
