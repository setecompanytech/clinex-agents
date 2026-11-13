import { diaDoInstante, diffDias, ehConversaoAtiva, hojeDe, horaDe, somaDias, type Lead, type Tarefa, type Vista } from './motor.js';
import type { Status } from './modelo.js';
import { LIMITES, MENSAGENS } from './modelo.js';
import { marcosDe, type Marcos } from './analise.js';
import { janela as janelaDe, type Janela } from './periodo.js';

/**
 * Evolução no tempo para a tela Análises do CRM. O estado de cada lead em cada dia é reconstruído do histórico de
 * eventos (entrada, respostas, agendamento, comparecimento, descarte...), então funciona também para leads antigos.
 * Nada é estimado: todo ponto do gráfico é contagem ou razão de contagens. Função pura.
 * Períodos de 14 e 30 dias usam pontos diários (taxas em janela móvel de 7 dias); 90 dias usa pontos semanais.
 */

export type Periodo = 14 | 30 | 90;
const ATIVOS: Status[] = ['aberto', 'sem_retorno', 'negociacao', 'agendado'];
const porcento = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null);
const r1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);
const soma = (a: number[]) => a.reduce((x, y) => x + y, 0);
const media = (a: number[]) => (a.length ? soma(a) / a.length : null);
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const fmt = (v: number, c = 1) => v.toLocaleString('pt-BR', { maximumFractionDigits: c });

type Trans = { dia: string; status: Status };

/** Linha do tempo de etapas de um lead, lida dos eventos que ele já guarda. */
export function transicoes(l: Lead): Trans[] {
  const out: Trans[] = [{ dia: l.d0, status: 'aberto' }];
  for (const e of l.eventos) {
    const dia = diaDoInstante(e.quando);
    let s: Status | null = null;
    // o card do Pipelines escreve a etapa em maiúsculas ("EM NEGOCIAÇÃO"): compara sem diferenciar maiúsculas
    if (e.tipo === 'etapa') s = /negocia[cç][aã]o/i.test(e.texto) ? 'negociacao' : /sem retorno/i.test(e.texto) ? 'sem_retorno' : /^Acompanhou o funil/.test(e.texto) ? 'aberto' : null;
    else if (e.tipo === 'automacao' && /para Sem retorno/.test(e.texto)) s = 'sem_retorno';
    else if (e.tipo === 'agendamento') s = 'agendado';
    else if (e.tipo === 'comparecimento') s = ehConversaoAtiva(e) ? 'convertido_ativo' : 'negociacao';
    else if (e.tipo === 'descarte') s = 'descarte';
    else if (e.tipo === 'recepcao') s = 'convertido_organico';
    if (s) out.push({ dia, status: s });
  }
  return out;
}
export function statusNoDia(tr: Trans[], dia: string): Status | null {
  if (dia < tr[0].dia) return null;
  let s: Status = tr[0].status;
  for (const t of tr) { if (t.dia <= dia) s = t.status; else break; }
  return s;
}

export function analisarTempo(leads: Lead[], agora: Date, per: Periodo | Janela, tarefas: Tarefa[], vistas: Map<string, Vista>) {
  const J = janelaDe(per, agora), dias = J.dias, hoje = J.ate, hojeReal = hojeDe(agora);
  const semanal = dias > 30;
  const n = semanal ? Math.ceil(dias / 7) : dias;
  const passo = semanal ? 7 : 1;
  const fins = Array.from({ length: n }, (_, i) => somaDias(hoje, -(n - 1 - i) * passo));
  const inis = fins.map((f) => (semanal ? somaDias(f, -6) : f));
  const rotulos = inis.map((d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`);
  const titulos = fins.map((f, i) => (semanal ? `${rotulos[i]} a ${f.slice(8, 10)}/${f.slice(5, 7)}` : new Date(`${f}T12:00:00-03:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })));
  const idx = (dia: string) => { if (dia < J.de) return -1; const k = diffDias(dia, hoje); if (k < 0) return -1; const i = n - 1 - (semanal ? Math.floor(k / 7) : k); return i >= 0 && i < n ? i : -1; };
  const zero = () => Array<number>(n).fill(0);
  const marcos = new Map<string, Marcos>(leads.map((l) => [l.id, marcosDe(l)]));
  const trs = new Map(leads.map((l) => [l.id, transicoes(l)]));

  // ------------------------------------------------------------------ séries por ponto
  const S = { novos: zero(), contatos: zero(), respostas: zero(), agendamentos: zero(), convertidos: zero(), descartados: zero(), organicos: zero(), valorConv: zero(), valorPerdido: zero() };
  const contatados: Set<string>[] = Array.from({ length: n }, () => new Set());
  const ciclosPorPonto: number[][] = Array.from({ length: n }, () => []);
  const heat = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const msgs = new Map<number, { env: number; resp: number }>();
  const iniPeriodo = J.de;
  for (const l of leads) {
    const i0 = idx(l.d0); if (i0 >= 0) S.novos[i0]++;
    const evs = [...l.eventos].sort((a, b) => a.quando.localeCompare(b.quando));
    evs.forEach((e, k) => {
      const dia = diaDoInstante(e.quando), i = idx(dia);
      if (i < 0) return;
      if (e.tipo === 'contato') {
        S.contatos[i]++; contatados[i].add(l.id);
        if (e.msg) {
          const x = msgs.get(e.msg) ?? { env: 0, resp: 0 }; x.env++;
          const t0 = Date.parse(e.quando);
          for (let j = k + 1; j < evs.length; j++) { if (evs[j].tipo === 'contato') break; if (evs[j].tipo === 'resposta') { if (Date.parse(evs[j].quando) - t0 <= 72 * 3_600_000) x.resp++; break; } }
          msgs.set(e.msg, x);
        }
      } else if (e.tipo === 'resposta') {
        S.respostas[i]++;
        const wd = new Date(`${dia}T12:00:00Z`).getUTCDay();
        heat[wd][horaDe(new Date(e.quando)).h]++;
      } else if (e.tipo === 'agendamento') S.agendamentos[i]++;
      else if (ehConversaoAtiva(e)) { S.convertidos[i]++; S.valorConv[i] += l.valor; ciclosPorPonto[i].push(diffDias(l.d0, dia)); }
      else if (e.tipo === 'descarte') { S.descartados[i]++; S.valorPerdido[i] += l.valor; }
      else if (e.tipo === 'recepcao') S.organicos[i]++;
    });
  }

  // ------------------------------------------------------------------ pipeline: quantos leads em cada etapa no fim de cada ponto
  const pipe = { aberto: zero(), sem_retorno: zero(), negociacao: zero(), agendado: zero(), valor: zero() };
  for (const l of leads) {
    const tr = trs.get(l.id)!;
    fins.forEach((f, i) => { const s = statusNoDia(tr, f); if (s && (ATIVOS as string[]).includes(s)) { (pipe as unknown as Record<string, number[]>)[s][i]++; pipe.valor[i] += l.valor; } });
  }

  // ------------------------------------------------------------------ taxas (janela móvel de 7 dias nos pontos diários, semana a semana nos semanais)
  const janela = (i: number) => { const a = semanal ? i : Math.max(0, i - 6); return [a, i] as const; };
  const somaJ = (arr: number[], i: number) => { const [a, b] = janela(i); return soma(arr.slice(a, b + 1)); };
  const taxas = {
    resposta: S.contatos.map((_, i) => r1(porcento(somaJ(S.respostas, i), somaJ(S.contatos, i)))),
    agendamento: S.contatos.map((_, i) => { const [a, b] = janela(i); const u = new Set<string>(); for (let k = a; k <= b; k++) contatados[k].forEach((x) => u.add(x)); return r1(porcento(somaJ(S.agendamentos, i), u.size)); }),
    conversao: S.contatos.map((_, i) => r1(porcento(somaJ(S.convertidos, i), somaJ(S.convertidos, i) + somaJ(S.descartados, i)))),
  };
  const ciclo = ciclosPorPonto.map((_, i) => { const [a, b] = janela(i); const v = ciclosPorPonto.slice(a, b + 1).flat(); return v.length ? r1(media(v)) : null; });

  // ------------------------------------------------------------------ funil por semana de entrada (coortes)
  const semanas = Math.ceil(dias / 7);
  const coortes = Array.from({ length: semanas }, (_, k) => {
    const fim = somaDias(hoje, -7 * (semanas - 1 - k)), ini6 = somaDias(fim, -6), ini = ini6 < J.de ? J.de : ini6;
    const ls = leads.filter((l) => l.d0 >= ini && l.d0 <= fim);
    const p = (f: (m: Marcos) => boolean) => r1(porcento(ls.filter((l) => f(marcos.get(l.id)!)).length, ls.length));
    return { rotulo: `${ini.slice(8, 10)}/${ini.slice(5, 7)}`, leads: ls.length, contatados: p((m) => !!m.contatado), responderam: p((m) => !!m.respondeu), agendaram: p((m) => !!m.agendou), compareceram: p((m) => !!m.compareceu) };
  });

  // ------------------------------------------------------------------ período x período anterior
  const resumo = (ini: string, fim: string) => {
    const dentro = (d?: string) => !!d && d >= ini && d <= fim;
    let contatos = 0, respostas = 0, agend = 0;
    for (const l of leads) for (const e of l.eventos) { const d = diaDoInstante(e.quando); if (d < ini || d > fim) continue; if (e.tipo === 'contato') contatos++; else if (e.tipo === 'resposta') respostas++; else if (e.tipo === 'agendamento') agend++; }
    const conv = leads.filter((l) => dentro(marcos.get(l.id)!.compareceu)), desc = leads.filter((l) => dentro(marcos.get(l.id)!.descartou) && l.status === 'descarte');
    const ciclos = conv.map((l) => diffDias(l.d0, marcos.get(l.id)!.compareceu!));
    return {
      novos: leads.filter((l) => l.d0 >= ini && l.d0 <= fim).length, contatos, respostas, agendamentos: agend, convertidos: conv.length, descartados: desc.length,
      taxaResposta: r1(porcento(respostas, contatos)), taxaConversao: r1(porcento(conv.length, conv.length + desc.length)),
      valorConvertido: soma(conv.map((l) => l.valor)), valorPerdido: soma(desc.map((l) => l.valor)), ciclo: ciclos.length ? r1(media(ciclos)) : null,
    };
  };
  const atual = resumo(iniPeriodo, hoje), anterior = resumo(somaDias(iniPeriodo, -dias), somaDias(iniPeriodo, -1));

  // ------------------------------------------------------------------ composição do período
  const noPeriodo = leads.filter((l) => l.d0 >= iniPeriodo);
  const mf = (f: (m: Marcos) => boolean) => noPeriodo.filter((l) => f(marcos.get(l.id)!)).length;
  const funil = [['Leads', noPeriodo.length], ['Contatados', mf((m) => !!m.contatado)], ['Responderam', mf((m) => !!m.respondeu)], ['Agendaram', mf((m) => !!m.agendou)], ['Compareceram', mf((m) => !!m.compareceu)]]
    .map(([etapa, q], i, a) => ({ etapa: etapa as string, n: q as number, pct: r1(porcento(q as number, a[0][1] as number)) ?? 0, perda: i && (a[i - 1][1] as number) ? r1(100 - (q as number) / (a[i - 1][1] as number) * 100) ?? 0 : 0 }));
  const motivos = new Map<string, { n: number; valor: number }>();
  for (const l of leads) { const m = marcos.get(l.id)!; if (l.status === 'descarte' && m.descartou && m.descartou >= iniPeriodo) { const k = m.motivo ?? 'Outro'; const x = motivos.get(k) ?? { n: 0, valor: 0 }; x.n++; x.valor += l.valor; motivos.set(k, x); } }
  const descartes = [...motivos.entries()].map(([motivo, x]) => ({ motivo, ...x })).sort((a, b) => b.n - a.n);
  const grupo = (chave: (l: Lead) => string) => {
    const g = new Map<string, Lead[]>();
    for (const l of noPeriodo) { const k = chave(l); (g.get(k) ?? g.set(k, []).get(k)!).push(l); }
    return [...g.entries()].map(([nome, ls]) => {
      const conv = ls.filter((l) => marcos.get(l.id)!.compareceu).length, desc = ls.filter((l) => l.status === 'descarte').length;
      return { nome, leads: ls.length, convertidos: conv, descartados: desc, taxa: r1(porcento(conv, conv + desc)), ticket: Math.round(soma(ls.map((l) => l.valor)) / ls.length) };
    }).sort((a, b) => b.leads - a.leads).slice(0, 8);
  };
  const origem = grupo((l) => l.origem?.trim() || 'Não informada');
  const exames = grupo((l) => { const e = (l.exame || 'Sem exame informado').trim(); return e.charAt(0).toUpperCase() + e.slice(1); });
  const mensagens = MENSAGENS.map((m) => { const x = msgs.get(m.n) ?? { env: 0, resp: 0 }; return { n: m.n, titulo: m.titulo, enviadas: x.env, respostas: x.resp, taxa: r1(porcento(x.resp, x.env)) }; }).filter((m) => m.enviadas > 0);

  // ------------------------------------------------------------------ o que o sistema fez sozinho no período (tela Regras)
  const autoContagem = new Map<string, number>();
  for (const l of leads) {
    for (const e of l.eventos) {
      if (e.tipo !== 'automacao' && !(e.tipo === 'descarte' && e.auto)) continue;
      const d = diaDoInstante(e.quando); if (d < J.de || d > J.ate) continue;
      const k = e.tipo === 'descarte' ? 'Descartes automáticos (sem retorno)' : /para Sem retorno/.test(e.texto) ? 'Leads movidos para Sem retorno' : /Confirmação/.test(e.texto) ? 'Confirmações de agendamento registradas' : 'Outras ações automáticas';
      autoContagem.set(k, (autoContagem.get(k) ?? 0) + 1);
    }
  }
  const automaticas = [...autoContagem.entries()].map(([rotulo, n]) => ({ rotulo, n })).sort((a, b) => b.n - a.n);

  // ------------------------------------------------------------------ equipe e carga (hoje)
  const atrasados = new Set(tarefas.filter((t) => t.situacao === 'atrasada').map((t) => t.leadId));
  const eq = new Map<string, Lead[]>();
  for (const l of leads) { const k = l.atendente || 'Sem responsável'; (eq.get(k) ?? eq.set(k, []).get(k)!).push(l); }
  const equipe = [...eq.entries()].map(([nome, ls]) => {
    const conv = ls.filter((l) => { const d = marcos.get(l.id)!.compareceu; return !!d && d >= iniPeriodo; }).length;
    const desc = ls.filter((l) => { const m = marcos.get(l.id)!; return l.status === 'descarte' && !!m.descartou && m.descartou >= iniPeriodo; }).length;
    const ativos = ls.filter((l) => (ATIVOS as string[]).includes(l.status));
    return { nome, ativos: ativos.length, valorAtivo: soma(ativos.map((l) => l.valor)), atrasados: ativos.filter((l) => atrasados.has(l.id)).length, convertidos: conv, taxa: r1(porcento(conv, conv + desc)) };
  }).sort((a, b) => b.ativos - a.ativos);
  const faixas: [string, (v: number) => boolean][] = [['Até R$ 200', (v) => v <= 200], ['R$ 201 a 500', (v) => v > 200 && v <= 500], ['R$ 501 a 1.000', (v) => v > 500 && v <= 1000], ['Acima de R$ 1.000', (v) => v > 1000]];
  const ativosL = leads.filter((l) => (ATIVOS as string[]).includes(l.status));
  const valores = faixas.map(([rotulo, ok]) => { const ls = ativosL.filter((l) => ok(l.valor)); return { rotulo, n: ls.length, valor: soma(ls.map((l) => l.valor)) }; });
  const faixasAging: [string, (n: number) => boolean][] = [['0–1 dia', (n) => n <= 1], ['2–3 dias', (n) => n >= 2 && n <= 3], ['4–7 dias', (n) => n >= 4 && n <= 7], ['8–14 dias', (n) => n >= 8 && n <= 14], ['15+ dias', (n) => n >= 15]];
  const aging = (['aberto', 'sem_retorno', 'negociacao'] as Status[]).map((s) => ({
    status: s, faixas: faixasAging.map(([rotulo, ok]) => ({ rotulo, n: leads.filter((l) => l.status === s && ok(diffDias(l.statusDesde, hojeReal))).length })),
  }));
  void vistas;

  // ------------------------------------------------------------------ destaques: o que mudou em relação ao período anterior
  const destaques: { nivel: 'bom' | 'atencao' | 'info'; texto: string }[] = [];
  const delta = (a: number | null, b: number | null, minimo: number) => (a === null || b === null || b === 0 || Math.max(a, b) < minimo ? null : ((a - b) / b) * 100);
  const add = (nivel: 'bom' | 'atencao' | 'info', texto: string) => destaques.push({ nivel, texto });
  const dn = delta(atual.novos, anterior.novos, 5);
  if (dn !== null && Math.abs(dn) >= 15) add(dn > 0 ? 'bom' : 'atencao', `Entraram ${fmt(atual.novos, 0)} leads novos, ${dn > 0 ? 'alta' : 'queda'} de ${fmt(Math.abs(dn), 0)}% sobre os ${dias} dias anteriores (${fmt(anterior.novos, 0)}).`);
  if (atual.taxaConversao !== null && anterior.taxaConversao !== null && atual.convertidos + atual.descartados >= 5) {
    const d = atual.taxaConversao - anterior.taxaConversao;
    if (Math.abs(d) >= 5) add(d > 0 ? 'bom' : 'atencao', `A conversão dos encerrados ${d > 0 ? 'subiu' : 'caiu'} ${fmt(Math.abs(d), 0)} p.p.: ${fmt(atual.taxaConversao, 0)}% agora contra ${fmt(anterior.taxaConversao, 0)}%.`);
  }
  if (atual.taxaResposta !== null && anterior.taxaResposta !== null && atual.contatos >= 10) {
    const d = atual.taxaResposta - anterior.taxaResposta;
    if (Math.abs(d) >= 5) add(d > 0 ? 'bom' : 'atencao', `A taxa de resposta ${d > 0 ? 'subiu' : 'caiu'} ${fmt(Math.abs(d), 0)} p.p. (${fmt(atual.taxaResposta, 0)}% contra ${fmt(anterior.taxaResposta, 0)}%).`);
  }
  const dv = delta(atual.valorConvertido, anterior.valorConvertido, 500);
  if (dv !== null && Math.abs(dv) >= 15) add(dv > 0 ? 'bom' : 'atencao', `O valor convertido foi de ${brl(atual.valorConvertido)}, ${dv > 0 ? 'alta' : 'queda'} de ${fmt(Math.abs(dv), 0)}% (antes ${brl(anterior.valorConvertido)}).`);
  if (atual.ciclo !== null && anterior.ciclo !== null && Math.abs(atual.ciclo - anterior.ciclo) >= 2) add(atual.ciclo < anterior.ciclo ? 'bom' : 'atencao', `O ciclo até converter ${atual.ciclo < anterior.ciclo ? 'encurtou' : 'alongou'}: ${fmt(atual.ciclo)} dias, antes ${fmt(anterior.ciclo)}.`);
  if (descartes[0] && soma(descartes.map((d) => d.n)) >= 5 && descartes[0].n / soma(descartes.map((d) => d.n)) >= 0.4) add('info', `${descartes[0].motivo} é o principal motivo de descarte (${descartes[0].n} leads, ${brl(descartes[0].valor)} em orçamentos).`);
  const mb = [...mensagens].filter((m) => m.enviadas >= 5 && m.taxa !== null).sort((a, b) => b.taxa! - a.taxa!);
  if (mb.length >= 3) add('info', `A mensagem ${mb[0].n} (${mb[0].titulo}) é a que mais gera resposta (${fmt(mb[0].taxa!, 0)}%) e a ${mb[mb.length - 1].n} (${mb[mb.length - 1].titulo}) a que menos (${fmt(mb[mb.length - 1].taxa!, 0)}%).`);
  const picoPipe = Math.max(...pipe.valor); const iPico = pipe.valor.indexOf(picoPipe);
  if (picoPipe > 0 && iPico !== n - 1 && pipe.valor[n - 1] < picoPipe * 0.8) add('atencao', `O pipeline em andamento está ${fmt((1 - pipe.valor[n - 1] / picoPipe) * 100, 0)}% abaixo do pico do período (${brl(picoPipe)} em ${rotulos[iPico]}). Falta entrada de leads ou sobra descarte.`);
  if (!destaques.length) add('info', 'Sem mudanças relevantes em relação ao período anterior.');

  return {
    dias, semanal, hoje, de: J.de, ate: J.ate, rotulos, titulos,
    series: { ...S, taxas, ciclo, pipeline: pipe },
    coortes, atual, anterior, funil, descartes, origem, exames, mensagens, automaticas, equipe, valores, aging, heat, destaques,
    limites: { janelaInicioH: LIMITES.janelaInicioH },
  };
}
export type AnaliseTempo = ReturnType<typeof analisarTempo>;
