import { diaDoInstante, diffDias, ehConversaoAtiva, hojeDe, somaDias, type EventoLead, type Lead } from './motor.js';
import { PASSOS } from './modelo.js';
import { ROTULO_INTENCAO } from './rastreio.js';
import type { Janela } from './periodo.js';
import { diaBRT } from './pipeline/regras.js';
import type { Atribuicao, EstadoFunis } from './pipeline/tipos.js';

/**
 * IA Performance: tudo o que a IA de disparo (contatos com auto = true) trouxe de resultado. Função pura, lida só dos eventos que
 * cada lead já guarda. Nada é estimado: todo número é uma contagem ou uma razão de contagens.
 *
 * Regras de atribuição (iguais em todos os números):
 *  - Resposta da IA: o paciente respondeu em até 72 h depois de um contato da IA e antes do próximo contato da IA.
 *  - Receita recuperada: o valor dos pacientes que a IA trouxe de volta e pagaram: quem compareceu e pagou (conversão) depois de uma mensagem da IA
 *    e os no-show que a equipe levou para "Recuperado" depois do convite da IA. Cada paciente conta uma vez, pelo valor do orçamento (ou do card).
 *  - Agendamento/conversão da IA: o evento aconteceu em até 14 dias depois de um contato da IA. O passo creditado é o do contato
 *    da IA mais recente antes do evento. "Sozinha": a equipe não fez nenhum contato entre esse contato e o evento.
 */

const JANELA_RESPOSTA_H = 72;
const JANELA_RESULTADO_D = 14;
const MS_H = 3_600_000;
const ROTULO_PASSO: Record<string, string> = Object.fromEntries(PASSOS.map((p) => [p.id, p.rotulo]));
const ORDEM_PASSOS = ['primeiro', 'tentativa', 'desconto', 'encerramento', 'noshow', 'retorno', 'reativacao', 'orcamento', 'followup', 'objecao', 'ultima'];
const INTENCOES_QUENTES = new Set(['agendar', 'valor_horario', 'ainda_quer', 'duvida', 'reagendar']);

type Contato = {
  lead: Lead; t: number; dia: string; hora: number; dow: number; passo: string; msg: number;
  respondeu: boolean; minResp: number | null; intencao: string | null;
};
type Recup = { lead: Lead; t: number; dia: string; valor: number; origem: 'orcamento' | 'noshow' };
type Resultado = { lead: Lead; t: number; dia: string; tipo: 'agendamento' | 'conversao'; passo: string; sozinha: boolean; valor: number };

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const soma = (a: number[]) => a.reduce((x, y) => x + y, 0);
const mediana = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);
const parteBRT = (t: number) => { const d = new Date(t - 3 * MS_H); return { hora: d.getUTCHours(), dow: d.getUTCDay() }; };

/** Tudo da IA, evento a evento, de todos os leads. */
type OpcoesColeta = { autor?: (e: EventoLead, l: Lead) => boolean; exclusivo?: boolean };
function coletar(leads: Lead[], cartoes: Map<string, Atribuicao>, op: OpcoesColeta = {}) {
  const contatos: Contato[] = [], resultados: Resultado[] = [];
  const pendentes: { lead: Lead; intencao: string; t: number; resp: string }[] = [];
  for (const l of leads) {
    if (l.demo) continue;
    const evs = [...l.eventos].sort((a, b) => a.quando.localeCompare(b.quando));
    const ia = evs.filter((e) => e.tipo === 'contato' && e.canal === 'whatsapp' && (op.autor ? op.autor(e, l) : e.auto === true));
    if (!ia.length) continue;
    const mine: Contato[] = ia.map((e) => {
      const t = Date.parse(e.quando), { hora, dow } = parteBRT(t);
      return { lead: l, t, dia: diaDoInstante(e.quando), hora, dow, passo: e.passo ?? 'outro', msg: e.msg ?? 0, respondeu: false, minResp: null, intencao: null };
    });
    mine.forEach((c, i) => {
      const fim = Math.min(c.t + JANELA_RESPOSTA_H * MS_H, mine[i + 1]?.t ?? Infinity);
      const r = evs.find((e) => e.tipo === 'resposta' && Date.parse(e.quando) > c.t && Date.parse(e.quando) <= fim);
      if (r) { c.respondeu = true; c.minResp = (Date.parse(r.quando) - c.t) / 60000; c.intencao = r.intencao ?? null; }
    });
    contatos.push(...mine);
    // agendamentos e conversões: o contato da IA mais recente antes do evento, em até 14 dias
    for (const e of evs) {
      const tipo = e.tipo === 'agendamento' ? 'agendamento' : ehConversaoAtiva(e) ? 'conversao' : null;
      if (!tipo) continue;
      const t = Date.parse(e.quando);
      const c = [...mine].reverse().find((x) => x.t <= t);
      if (!c || t - c.t > JANELA_RESULTADO_D * 86_400_000) continue;
      // crédito exclusivo (comparar a IA com cada vendedor): só vale se ninguém mais contatou o paciente entre esse contato e o resultado
      if (op.exclusivo && evs.some((x) => x.tipo === 'contato' && Date.parse(x.quando) > c.t && Date.parse(x.quando) <= t)) continue;
      const sozinha = !evs.some((x) => x.tipo === 'contato' && !x.auto && Date.parse(x.quando) > c.t && Date.parse(x.quando) <= t);
      resultados.push({ lead: l, t, dia: diaDoInstante(e.quando), tipo, passo: c.passo, sozinha, valor: l.valor });
    }
    // quem pediu algo à IA e a equipe ainda não atendeu (respostas dos últimos 7 dias, lead ainda aberto)
    const aberto = l.status === 'aberto' || l.status === 'sem_retorno' || l.status === 'negociacao';
    if (aberto) {
      const r = [...evs].reverse().find((e) => e.tipo === 'resposta' && e.intencao && INTENCOES_QUENTES.has(e.intencao));
      if (r && mine.some((c) => c.t < Date.parse(r.quando))) {
        const t = Date.parse(r.quando);
        const atendido = evs.some((x) => Date.parse(x.quando) > t && ((x.tipo === 'contato' && !x.auto) || x.tipo === 'agendamento'));
        if (!atendido) pendentes.push({ lead: l, intencao: r.intencao as string, t, resp: (r.resp ?? '').slice(0, 120) });
      }
    }
  }
  // receita recuperada: cada paciente uma vez (a primeira conversão; ou o card de no-show levado a Recuperado depois do convite da IA)
  const recup = new Map<string, Recup>();
  for (const r of [...resultados].sort((a, b) => a.t - b.t)) {
    if (r.tipo !== 'conversao' || recup.has(r.lead.id)) continue;
    recup.set(r.lead.id, { lead: r.lead, t: r.t, dia: r.dia, valor: r.valor, origem: r.passo === 'noshow' || r.lead.fonte === 'noshow' ? 'noshow' : 'orcamento' });
  }
  for (const c of contatos) {
    const a = c.lead.cardId ? cartoes.get(c.lead.cardId) : undefined;
    if (c.passo !== 'noshow' || recup.has(c.lead.id) || !a || a.caseStatus !== 'recuperado' || !a.recoveredAt) continue;
    const t = Date.parse(a.recoveredAt);
    if (t < c.t || t - c.t > JANELA_RESULTADO_D * 86_400_000) continue;
    recup.set(c.lead.id, { lead: c.lead, t, dia: diaBRT(a.recoveredAt), valor: a.ultimoSnapshot.valor || c.lead.valor, origem: 'noshow' });
  }
  // agendados pela IA que ainda não pagaram: receita a receber
  const agendados = new Map<string, Resultado>();
  for (const r of [...resultados].sort((a, b) => a.t - b.t)) if (r.tipo === 'agendamento' && !recup.has(r.lead.id) && r.lead.status === 'agendado' && !agendados.has(r.lead.id)) agendados.set(r.lead.id, r);
  return { contatos, resultados, pendentes, recup: [...recup.values()], agendados: [...agendados.values()] };
}

type Dados = ReturnType<typeof coletar>;

/** Totais de uma janela (usado no período escolhido e no período anterior, para a comparação). */
function totais(d: Dados, de: string, ate: string) {
  const cs = d.contatos.filter((c) => c.dia >= de && c.dia <= ate);
  const rs = d.resultados.filter((r) => r.dia >= de && r.dia <= ate);
  const ag = rs.filter((r) => r.tipo === 'agendamento'), cv = rs.filter((r) => r.tipo === 'conversao');
  const rc = d.recup.filter((r) => r.dia >= de && r.dia <= ate);
  const leadsAlc = new Set(cs.map((c) => c.lead.id));
  const leadsResp = new Set(cs.filter((c) => c.respondeu).map((c) => c.lead.id));
  const tempos = cs.map((c) => c.minResp).filter((x): x is number => x !== null);
  return {
    enviadas: cs.length, leads: leadsAlc.size, respostas: cs.filter((c) => c.respondeu).length, leadsResponderam: leadsResp.size,
    taxaResposta: pct(cs.filter((c) => c.respondeu).length, cs.length),
    agendamentos: new Set(ag.map((r) => r.lead.id)).size, conversoes: new Set(cv.map((r) => r.lead.id)).size,
    receita: soma(rc.map((r) => r.valor)), recuperados: rc.length,
    receitaOrcamentos: soma(rc.filter((r) => r.origem === 'orcamento').map((r) => r.valor)), receitaNoshow: soma(rc.filter((r) => r.origem === 'noshow').map((r) => r.valor)),
    nOrcamentos: rc.filter((r) => r.origem === 'orcamento').length, nNoshow: rc.filter((r) => r.origem === 'noshow').length,
    agSozinha: new Set(ag.filter((r) => r.sozinha).map((r) => r.lead.id)).size,
    tempoResposta: r1(mediana(tempos)),
  };
}

export function analisarIAPerformance(leads: Lead[], pipelines: EstadoFunis | undefined, agora: Date, J: Janela) {
  const cartoes = new Map<string, Atribuicao>(pipelines ? pipelines.atribuicoes.map((a) => [a.cardId, a] as const) : []);
  const d = coletar(leads, cartoes);
  const hoje = hojeDe(agora);
  const dias = J.dias, anterior = { de: somaDias(J.de, -dias), ate: somaDias(J.de, -1) };
  const atual = totais(d, J.de, J.ate), ant = totais(d, anterior.de, anterior.ate);
  const cs = d.contatos.filter((c) => c.dia >= J.de && c.dia <= J.ate);
  const rs = d.resultados.filter((r) => r.dia >= J.de && r.dia <= J.ate);

  // ------------------------------------------------------------------ série no tempo (diária até 31 dias, semanal acima)
  const semanal = dias > 31;
  const n = semanal ? Math.ceil(dias / 7) : dias, passo = semanal ? 7 : 1;
  const fins = Array.from({ length: n }, (_, i) => somaDias(J.ate, -(n - 1 - i) * passo));
  const inis = fins.map((f) => (semanal ? somaDias(f, -6) : f));
  const idx = (dia: string) => { if (dia < J.de || dia > J.ate) return -1; const k = diffDias(dia, J.ate); const i = n - 1 - (semanal ? Math.floor(k / 7) : k); return i >= 0 && i < n ? i : -1; };
  const z = () => Array<number>(n).fill(0);
  const serie = { enviadas: z(), respostas: z(), agendamentos: z(), conversoes: z(), receita: z() };
  for (const c of cs) { const i = idx(c.dia); if (i >= 0) { serie.enviadas[i]++; if (c.respondeu) serie.respostas[i]++; } }
  const vistos = { agendamento: new Set<string>(), conversao: new Set<string>() };
  for (const r of rs) { const i = idx(r.dia), k = r.tipo; if (i < 0 || vistos[k].has(r.lead.id)) continue; vistos[k].add(r.lead.id); if (k === 'agendamento') serie.agendamentos[i]++; else serie.conversoes[i]++; }
  for (const r of d.recup) { const i = idx(r.dia); if (i >= 0) serie.receita[i] += r.valor; }
  const taxaPorPonto = serie.enviadas.map((e, i) => (e > 0 ? Math.round((serie.respostas[i] / e) * 1000) / 10 : null));
  const rotulos = inis.map((x) => `${x.slice(8, 10)}/${x.slice(5, 7)}`);
  const titulos = fins.map((f, i) => (semanal ? `${rotulos[i]} a ${f.slice(8, 10)}/${f.slice(5, 7)}` : new Date(`${f}T12:00:00-03:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })));

  // ------------------------------------------------------------------ desde o começo (independente do período): semanas desde o 1º envio
  const primeiro = d.contatos.reduce((m, c) => (c.dia < m ? c.dia : m), hoje);
  const sem = Math.max(1, Math.min(60, Math.ceil((diffDias(primeiro, hoje) + 1) / 7)));
  const fimSem = Array.from({ length: sem }, (_, i) => somaDias(hoje, -(sem - 1 - i) * 7));
  const iSem = (dia: string) => { const k = diffDias(dia, hoje); if (k < 0) return -1; const i = sem - 1 - Math.floor(k / 7); return i >= 0 && i < sem ? i : -1; };
  const hist = { enviadas: Array<number>(sem).fill(0), respostas: Array<number>(sem).fill(0), agendamentos: Array<number>(sem).fill(0), conversoes: Array<number>(sem).fill(0), receita: Array<number>(sem).fill(0) };
  for (const c of d.contatos) { const i = iSem(c.dia); if (i >= 0) { hist.enviadas[i]++; if (c.respondeu) hist.respostas[i]++; } }
  const vh = { agendamento: new Set<string>(), conversao: new Set<string>() };
  for (const r of d.resultados) { const i = iSem(r.dia); if (i < 0 || vh[r.tipo].has(r.lead.id)) continue; vh[r.tipo].add(r.lead.id); if (r.tipo === 'agendamento') hist.agendamentos[i]++; else hist.conversoes[i]++; }
  for (const r of d.recup) { const i = iSem(r.dia); if (i >= 0) hist.receita[i] += r.valor; }
  const acum = (a: number[]) => { let s = 0; return a.map((v) => (s += v)); };

  // ------------------------------------------------------------------ por passo (etapa da cadência)
  const passos = [...new Set(d.contatos.map((c) => c.passo))].sort((a, b) => (ORDEM_PASSOS.indexOf(a) + 99) % 99 - (ORDEM_PASSOS.indexOf(b) + 99) % 99);
  const porPasso = passos.map((p) => {
    const c = cs.filter((x) => x.passo === p), r = rs.filter((x) => x.passo === p);
    const ag = new Set(r.filter((x) => x.tipo === 'agendamento').map((x) => x.lead.id)), cv = new Map(r.filter((x) => x.tipo === 'conversao').map((x) => [x.lead.id, x.valor]));
    const tempos = c.map((x) => x.minResp).filter((x): x is number => x !== null);
    return { passo: p, rotulo: ROTULO_PASSO[p] ?? p, enviadas: c.length, respostas: c.filter((x) => x.respondeu).length, taxaResposta: pct(c.filter((x) => x.respondeu).length, c.length), agendamentos: ag.size, conversoes: cv.size, receita: soma([...cv.values()]), tempoResposta: r1(mediana(tempos)) };
  }).filter((x) => x.enviadas > 0 || x.agendamentos > 0 || x.conversoes > 0);

  // ------------------------------------------------------------------ funil dos leads alcançados no período (coorte)
  const prim = new Map<string, Contato>();
  for (const c of cs) if (!prim.has(c.lead.id)) prim.set(c.lead.id, c);
  const coorte = [...prim.values()];
  const aposPrimeiro = (c: Contato, tipo: 'agendamento' | 'conversao') => d.resultados.some((r) => r.lead.id === c.lead.id && r.tipo === tipo);
  const respLead = (c: Contato) => cs.some((x) => x.lead.id === c.lead.id && x.respondeu);
  const funil = {
    alcancados: coorte.length, responderam: coorte.filter(respLead).length,
    agendaram: coorte.filter((c) => aposPrimeiro(c, 'agendamento')).length, converteram: coorte.filter((c) => aposPrimeiro(c, 'conversao')).length,
    receita: soma(coorte.filter((c) => aposPrimeiro(c, 'conversao')).map((c) => c.lead.valor)),
    pediramParar: coorte.filter((c) => c.lead.semDisparoAuto).length,
    descartados: coorte.filter((c) => c.lead.status === 'descarte').length,
    emNegociacao: coorte.filter((c) => c.lead.status === 'negociacao').length,
  };

  // ------------------------------------------------------------------ horários, dias, tempo de resposta, intenções
  const calor = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const porHora = Array.from({ length: 24 }, (_, h) => ({ hora: h, enviadas: 0, respostas: 0 }));
  const porDow = Array.from({ length: 7 }, (_, w) => ({ dow: w, enviadas: 0, respostas: 0 }));
  for (const c of cs) { calor[c.dow][c.hora]++; porHora[c.hora].enviadas++; porDow[c.dow].enviadas++; if (c.respondeu) { porHora[c.hora].respostas++; porDow[c.dow].respostas++; } }
  const horas = porHora.filter((x) => x.enviadas > 0).map((x) => ({ ...x, taxa: pct(x.respostas, x.enviadas) }));
  const dowT = porDow.map((x) => ({ ...x, taxa: pct(x.respostas, x.enviadas) }));
  const limites: [string, number, number][] = [['Até 5 min', 0, 5], ['5 a 30 min', 5, 30], ['30 min a 2 h', 30, 120], ['2 a 24 h', 120, 1440], ['Mais de 24 h', 1440, Infinity]];
  const respondidos = cs.filter((c) => c.minResp !== null);
  const tempoFaixas = limites.map(([rotulo, de, ate]) => ({ rotulo, n: respondidos.filter((c) => (c.minResp as number) >= de && (c.minResp as number) < ate).length }));
  const intMap = new Map<string, number>();
  for (const c of cs) if (c.respondeu) { const k = c.intencao ?? 'outro'; intMap.set(k, (intMap.get(k) ?? 0) + 1); }
  const intencoes = [...intMap].map(([k, v]) => ({ id: k, rotulo: ROTULO_INTENCAO[k as keyof typeof ROTULO_INTENCAO] ?? 'Outra resposta', n: v })).sort((a, b) => b.n - a.n);

  // ------------------------------------------------------------------ por unidade e por faixa de valor
  const agPorLead = new Set(rs.filter((r) => r.tipo === 'agendamento').map((r) => r.lead.id)), cvPorLead = new Map(rs.filter((r) => r.tipo === 'conversao').map((r) => [r.lead.id, r.valor]));
  const unidades = new Map<string, { enviadas: number; respostas: number; leads: Set<string> }>();
  for (const c of cs) { const k = c.lead.unidade?.trim() || 'Sem unidade'; const u = unidades.get(k) ?? { enviadas: 0, respostas: 0, leads: new Set() }; u.enviadas++; if (c.respondeu) u.respostas++; u.leads.add(c.lead.id); unidades.set(k, u); }
  const porUnidade = [...unidades].map(([unidade, u]) => ({ unidade, enviadas: u.enviadas, taxaResposta: pct(u.respostas, u.enviadas), agendamentos: [...u.leads].filter((id) => agPorLead.has(id)).length, receita: soma([...u.leads].map((id) => cvPorLead.get(id) ?? 0)) })).sort((a, b) => b.enviadas - a.enviadas).slice(0, 8);
  const faixas: [string, number, number][] = [['Até R$ 200', 0, 200], ['R$ 200 a 500', 200, 500], ['R$ 500 a 1.000', 500, 1000], ['Acima de R$ 1.000', 1000, Infinity]];
  const porValor = faixas.map(([rotulo, a, b]) => { const c = cs.filter((x) => x.lead.valor >= a && x.lead.valor < b); const ls = new Set(c.map((x) => x.lead.id)); return { rotulo, enviadas: c.length, taxaResposta: pct(c.filter((x) => x.respondeu).length, c.length), agendamentos: [...ls].filter((id) => agPorLead.has(id)).length }; }).filter((x) => x.enviadas > 0);

  // ------------------------------------------------------------------ No-show (reagendar quem faltou)
  const ns = cs.filter((c) => c.passo === 'noshow'), nsRes = rs.filter((r) => r.passo === 'noshow');
  const nsLeads = new Set(ns.map((c) => c.lead.id));
  const noshow = {
    enviadas: ns.length, respostas: ns.filter((c) => c.respondeu).length, taxaResposta: pct(ns.filter((c) => c.respondeu).length, ns.length),
    reagendados: new Set(nsRes.filter((r) => r.tipo === 'agendamento').map((r) => r.lead.id)).size,
    compareceram: new Set(nsRes.filter((r) => r.tipo === 'conversao').map((r) => r.lead.id)).size,
    recuperadosNoPipeline: atual.nNoshow, valorRecuperado: atual.receitaNoshow,
  };

  // ------------------------------------------------------------------ receita recuperada (o número que a diretoria quer ver)
  const aReceber = d.agendados.filter((r) => r.dia >= J.de && r.dia <= J.ate);
  const receita = {
    total: atual.receita, anterior: ant.receita, pacientes: atual.recuperados, ticket: atual.recuperados ? Math.round(atual.receita / atual.recuperados) : null,
    orcamentos: { valor: atual.receitaOrcamentos, n: atual.nOrcamentos }, noshow: { valor: atual.receitaNoshow, n: atual.nNoshow },
    aReceber: { valor: soma(aReceber.map((r) => r.valor)), n: aReceber.length },
    totalDesdeOComeco: soma(d.recup.map((r) => r.valor)), pacientesDesdeOComeco: d.recup.length,
  };

  // ------------------------------------------------------------------ quem espera a equipe
  const esperando = d.pendentes.filter((p) => agora.getTime() - p.t <= 7 * 86_400_000).sort((a, b) => a.t - b.t).slice(0, 12)
    .map((p) => ({ leadId: p.lead.id, nome: p.lead.nome, intencao: ROTULO_INTENCAO[p.intencao as keyof typeof ROTULO_INTENCAO] ?? p.intencao, horas: Math.round((agora.getTime() - p.t) / MS_H), valor: p.lead.valor, texto: p.resp }));
  const totalEsperando = d.pendentes.filter((p) => agora.getTime() - p.t <= 7 * 86_400_000).length;

  // ------------------------------------------------------------------ leitura em português: o que os números dizem
  const insights: { tom: 'bom' | 'atencao' | 'info'; titulo: string; texto: string }[] = [];
  const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const comTaxa = porPasso.filter((p) => p.enviadas >= 5 && p.taxaResposta !== null).sort((a, b) => (b.taxaResposta as number) - (a.taxaResposta as number));
  if (comTaxa.length >= 2) insights.push({ tom: 'bom', titulo: `${comTaxa[0].rotulo} é a mensagem que mais gera resposta`, texto: `${comTaxa[0].taxaResposta}% de resposta, contra ${comTaxa[comTaxa.length - 1].taxaResposta}% de ${comTaxa[comTaxa.length - 1].rotulo}.` });
  const melhorHora = [...horas].filter((x) => x.enviadas >= 5).sort((a, b) => (b.taxa as number) - (a.taxa as number))[0];
  if (melhorHora && horas.filter((x) => x.enviadas >= 5).length >= 3) insights.push({ tom: 'info', titulo: `Melhor horário: ${String(melhorHora.hora).padStart(2, '0')}h`, texto: `${melhorHora.taxa}% de resposta nos envios dessa hora (${melhorHora.enviadas} envios). Dá para ajustar o horário de cada gatilho no Controle.` });
  const melhorDia = [...dowT].filter((x) => x.enviadas >= 5).sort((a, b) => (b.taxa as number) - (a.taxa as number))[0];
  if (melhorDia) insights.push({ tom: 'info', titulo: `Melhor dia da semana: ${['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][melhorDia.dow]}`, texto: `${melhorDia.taxa}% de resposta (${melhorDia.enviadas} envios).` });
  if (totalEsperando > 0) insights.push({ tom: 'atencao', titulo: `${totalEsperando} ${totalEsperando === 1 ? 'paciente pediu' : 'pacientes pediram'} algo e a equipe ainda não atendeu`, texto: 'Responderam à IA querendo agendar, saber valor ou tirar dúvida. Quanto antes a equipe responder, maior a chance de agendar. A lista está logo abaixo.' });
  if (funil.alcancados >= 10 && funil.pediramParar / funil.alcancados > 0.05) insights.push({ tom: 'atencao', titulo: 'Muitos pedidos para parar de receber mensagens', texto: `${funil.pediramParar} de ${funil.alcancados} pacientes (${pct(funil.pediramParar, funil.alcancados)}%). Vale rever horário e frequência dos gatilhos.` });
  if (atual.agendamentos > 0) insights.push({ tom: 'bom', titulo: `${atual.agendamentos} ${atual.agendamentos === 1 ? 'agendamento' : 'agendamentos'} depois de mensagem da IA`, texto: `${atual.agSozinha} sem nenhum contato da equipe no meio. ${atual.conversoes ? `${atual.conversoes} já compareceram e pagaram (${brl(atual.receita)}).` : ''}` });
  if (noshow.reagendados > 0) insights.push({ tom: 'bom', titulo: `${noshow.reagendados} ${noshow.reagendados === 1 ? 'faltante reagendou' : 'faltantes reagendaram'} depois do convite da IA`, texto: noshow.valorRecuperado ? `${brl(noshow.valorRecuperado)} recuperados no funil No-show.` : 'Os convites de reagendamento estão funcionando.' });
  const lento = pct(tempoFaixas[4].n + tempoFaixas[3].n, respondidos.length); // mais de 2 h
  if (respondidos.length >= 10 && lento !== null && lento > 50) insights.push({ tom: 'info', titulo: 'A maioria responde só depois de horas', texto: `${lento}% das respostas levam mais de 2 horas. Mensagens no começo da janela dão mais tempo para o paciente responder no mesmo dia.` });
  if (ant.enviadas > 0 && atual.enviadas > 0 && atual.taxaResposta !== null && ant.taxaResposta !== null && Math.abs(atual.taxaResposta - ant.taxaResposta) >= 5) insights.push({ tom: atual.taxaResposta > ant.taxaResposta ? 'bom' : 'atencao', titulo: `Taxa de resposta ${atual.taxaResposta > ant.taxaResposta ? 'subiu' : 'caiu'} ${Math.abs(Math.round(atual.taxaResposta - ant.taxaResposta))} pontos`, texto: `Foi de ${ant.taxaResposta}% para ${atual.taxaResposta}% contra o período anterior.` });

  return {
    periodo: { de: J.de, ate: J.ate, dias, anterior, semanal }, regras: { respostaHoras: JANELA_RESPOSTA_H, resultadoDias: JANELA_RESULTADO_D },
    primeiroEnvio: d.contatos.length ? primeiro : null, temDados: d.contatos.length > 0,
    atual, anterior: ant, receita, funil, serie: { rotulos, titulos, ...serie, taxaResposta: taxaPorPonto },
    desdeOComeco: { rotulos: fimSem.map((x) => `${x.slice(8, 10)}/${x.slice(5, 7)}`), ...hist, acumEnviadas: acum(hist.enviadas), acumAgendamentos: acum(hist.agendamentos), acumConversoes: acum(hist.conversoes), acumReceita: acum(hist.receita), taxaResposta: hist.enviadas.map((e, i) => (e > 0 ? Math.round((hist.respostas[i] / e) * 1000) / 10 : null)) },
    porPasso, calor, horas, semana: dowT, tempoFaixas, intencoes, porUnidade, porValor, noshow, esperando, totalEsperando, insights,
  };
}

/**
 * Comparar a IA com cada vendedor no MESMO critério: só mensagens de WhatsApp, resposta em até 72 h, e agendamento/conversão
 * creditados a quem fez o último contato antes do resultado (crédito exclusivo, ninguém conta duas vezes). Cada autor traz o que
 * decide se um contato é dele. "por100" normaliza pelo volume: a IA envia muito mais mensagens que uma pessoa.
 */
const primeiros = (d: Dados, J: Janela) => { const prim = new Map<string, { lead: Lead; dia: string }>(); for (const c of d.contatos) { const x = prim.get(c.lead.id); if (!x || c.dia < x.dia) prim.set(c.lead.id, { lead: c.lead, dia: c.dia }); } return [...prim.values()].filter((x) => x.lead.d0 >= J.de && x.lead.d0 <= J.ate).map((x) => Math.max(0, diffDias(x.lead.d0, x.dia))); };
export function desempenhoPorAutor(leads: Lead[], pipelines: EstadoFunis | undefined, J: Janela, autores: { nome: string; ia?: boolean; autor: (e: EventoLead, l: Lead) => boolean }[]) {
  const cartoes = new Map<string, Atribuicao>(pipelines ? pipelines.atribuicoes.map((a) => [a.cardId, a] as const) : []);
  return autores.map((a) => {
    const d = coletar(leads, cartoes, { autor: a.autor, exclusivo: true });
    const t = totais(d, J.de, J.ate);
    const p = (v: number) => (t.enviadas > 0 ? Math.round((v / t.enviadas) * 1000) / 10 : null);
    return {
      nome: a.nome, ia: !!a.ia, enviadas: t.enviadas, leads: t.leads, respostas: t.respostas, taxaResposta: t.taxaResposta, agendamentos: t.agendamentos, conversoes: t.conversoes,
      receita: t.receita, ticket: t.recuperados ? Math.round(t.receita / t.recuperados) : null, tempoResposta: t.tempoResposta,
      // convites de no-show (Msg 10) enviados e quantos voltaram; dias entre o lead entrar e a primeira mensagem do autor (leads que entraram no período)
      noshow: { convites: d.contatos.filter((c) => c.passo === 'noshow' && c.dia >= J.de && c.dia <= J.ate).length, recuperados: t.nNoshow, valor: t.receitaNoshow },
      primeiroContato: mediana(primeiros(d, J)),
      por100: { agendamentos: p(t.agendamentos), conversoes: p(t.conversoes), receita: t.enviadas > 0 ? Math.round((t.receita / t.enviadas) * 100) : null },
    };
  });
}
