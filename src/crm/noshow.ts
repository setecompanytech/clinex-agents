import { narrar } from './etapa.js';
import { ETAPA_DO_ITEM, ITEM_DA_ETAPA, ITENS_NOSHOW, LIMITE_NOSHOW } from './modelo-noshow.js';
import { classeDaEtapa, diaBRT, diasNaEtapa, diffDia, etapaDe, etapaHist, somaDia, stageIdDoHistorico, valorExibido, visiveis } from './pipeline/regras.js';
import type { Atribuicao, EstadoFunis, Funil, Mov } from './pipeline/tipos.js';

/**
 * O fluxo do No-show olha para os cards do funil "No-show" (o mesmo da aba Pipelines). Aqui ficam só funções puras:
 * os números de cada etapa para o mapa e a análise de uma etapa (mesma forma de etapa.ts, para o modal usar as mesmas abas).
 */

const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
/** Reconhece a etapa pelo rótulo da coluna (renomear a coluna para algo parecido continua funcionando). */
export function chaveDaEtapa(rotulo: string): string | null {
  const n = norm(rotulo);
  if (/no.?show|falt/.test(n)) return 'noshow';
  if (/retomada/.test(n)) return 'retomada';
  if (/recuper/.test(n)) return 'recuperado';
  if (/sem retorno/.test(n)) return 'semretorno';
  if (/perd|descart/.test(n)) return 'perdido';
  if (/agendad/.test(n)) return 'agendado';
  return null;
}

export function funilNoShow(est: EstadoFunis): Funil | undefined {
  // se houver mais de um (duplicatas antigas), vale o mais antigo: é o que a aba Pipelines e a rotina usam
  const doTipo = est.funis.filter((f) => f.dimensao === 'agendamento').sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
  return doTipo[0] ?? est.funis.find((f) => /no.?show/.test(norm(f.nome)));
}

const soma = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
const med = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);

/**
 * Faltas de UM dia (o dia do agendamento, não o da entrada no funil), contadas das duas formas: por agendamento (cada card)
 * e por paciente (mesmo nome conta uma vez). Considera todos os cards do funil, mesmo os que já saíram da etapa No-show.
 */
export function faltasDoDia(f: Funil, est: EstadoFunis, dia: string) {
  const nome = (t: string) => norm(t).replace(/\s+/g, " ").trim();
  const doDia = visiveis(f, est.atribuicoes).filter((a) => { const d = Date.parse(a.originSnapshot.criadoEm); return !Number.isNaN(d) && diaBRT(new Date(d)) === dia; });
  const porUnidade = new Map<string, { cards: number; pac: Set<string> }>();
  for (const a of doDia) { const u = a.originSnapshot.unidade || "Sem unidade"; const x = porUnidade.get(u) ?? { cards: 0, pac: new Set<string>() }; x.cards++; x.pac.add(nome(a.originSnapshot.paciente)); porUnidade.set(u, x); }
  return { dia, agendamentos: doDia.length, pacientes: new Set(doDia.map((a) => nome(a.originSnapshot.paciente))).size, porUnidade: [...porUnidade].map(([unidade, x]) => ({ unidade, agendamentos: x.cards, pacientes: x.pac.size })).sort((x, y) => y.pacientes - x.pacientes) };
}

/** Números do mapa: quantos cards há em cada etapa agora e quem são (os de maior valor primeiro). */
export function dadosNoShow(est: EstadoFunis, agora: Date) {
  const f = funilNoShow(est);
  if (!f) return { funilId: null, nome: 'No-show', total: 0, valor: 0, contagens: {} as Record<string, number>, cards: {} as Record<string, unknown[]> };
  const contagens: Record<string, number> = {};
  const cards: Record<string, { id: string; nome: string; valor: number; dias: number; unidade?: string }[]> = {};
  let total = 0, valor = 0;
  for (const a of visiveis(f, est.atribuicoes)) {
    const k = chaveDaEtapa(etapaDe(f, a.stageId)?.label ?? ''); if (!k) continue;
    const item = ITEM_DA_ETAPA[k], v = valorExibido(a, est.extras[a.cardId]);
    contagens[item] = (contagens[item] ?? 0) + 1;
    (cards[item] ??= []).push({ id: a.cardId, nome: a.ultimoSnapshot.paciente, valor: v, dias: diasNaEtapa(a, agora), unidade: a.ultimoSnapshot.unidade });
    total++; valor += v;
  }
  for (const k of Object.keys(cards)) cards[k] = cards[k].sort((x, y) => y.valor - x.valor).slice(0, 40);
  return { funilId: f.id, nome: f.nome, total, valor, contagens, cards, faltas: faltasDoDia(f, est, somaDia(diaBRT(agora), -1)) };
}

type Passagem = { a: Atribuicao; entrada: string; saida?: string; dest?: string; dur?: number; primeira?: boolean };

/** Análise de UMA etapa do No-show (modal): quem está lá, quem entrou e saiu, tempo, destinos, contato e a narrativa. */
export function analisarNoShow(est: EstadoFunis, agora: Date, itemId: string, dias: 14 | 30 | 90) {
  const it = ITENS_NOSHOW.find((i) => i.id === itemId);
  const f = funilNoShow(est);
  if (!it || !(itemId in ETAPA_DO_ITEM) || !f) return null;
  const chave = ETAPA_DO_ITEM[itemId]; // null = a entrada ("Paciente faltou")
  const entrada = chave === null;
  const hoje = diaBRT(agora);
  const semanal = dias > 30;
  const nB = semanal ? Math.ceil(dias / 7) : dias, passoB = semanal ? 7 : 1;
  const fins = Array.from({ length: nB }, (_, i) => somaDia(hoje, -(nB - 1 - i) * passoB));
  const inis = fins.map((x) => (semanal ? somaDia(x, -6) : x));
  const rotulos = inis.map((d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`);
  const titulos = fins.map((x, i) => (semanal ? `${rotulos[i]} a ${x.slice(8, 10)}/${x.slice(5, 7)}` : `${x.slice(8, 10)}/${x.slice(5, 7)}`));
  const ini = inis[0], ini0 = somaDia(ini, -dias), fim0 = somaDia(ini, -1);
  const balde = (dia: string) => { for (let i = 0; i < nB; i++) if (dia >= inis[i] && dia <= fins[i]) return i; return -1; };

  const cartoes = visiveis(f, est.atribuicoes);
  const chaveDe = (m: Mov) => chaveDaEtapa(etapaHist(f, stageIdDoHistorico(m))?.label ?? '');
  const rotuloDe = (k: string) => etapaHist(f, f.stages.find((s) => chaveDaEtapa(s.label) === k)?.id ?? '')?.label ?? k;

  // ---- passagens pela etapa (reconstruídas do histórico de cada card)
  const passagens: Passagem[] = [];
  for (const a of cartoes) {
    const h = a.historico;
    for (let i = 0; i < h.length; i++) {
      const k = chaveDe(h[i]);
      if (entrada) { if (i === 0) passagens.push({ a, entrada: diaBRT(h[0].em) }); continue; }
      if (k !== chave) continue;
      if (i > 0 && chaveDe(h[i - 1]) === chave) continue;
      const j = h.findIndex((m, x) => x > i && chaveDe(m) !== chave);
      const dia = diaBRT(h[i].em);
      passagens.push({ a, entrada: dia, primeira: i === 0, saida: j >= 0 ? diaBRT(h[j].em) : undefined, dest: j >= 0 ? chaveDe(h[j]) ?? undefined : undefined, dur: j >= 0 ? Math.max(0, diffDia(dia, diaBRT(h[j].em))) : undefined });
    }
  }
  const entP = passagens.filter((p) => p.entrada >= ini);
  const entP0 = passagens.filter((p) => p.entrada >= ini0 && p.entrada <= fim0);
  const saiP = passagens.filter((p) => p.saida && p.saida >= ini);
  const entradas = Array(nB).fill(0) as number[], saidas = Array(nB).fill(0) as number[];
  for (const p of entP) { const b = balde(p.entrada); if (b >= 0) entradas[b]++; }
  for (const p of saiP) { const b = balde(p.saida!); if (b >= 0) saidas[b]++; }

  // ---- onde estão agora
  const aqui = entrada ? [] : cartoes.filter((a) => chaveDaEtapa(etapaDe(f, a.stageId)?.label ?? '') === chave);
  const valorDe = (a: Atribuicao) => valorExibido(a, est.extras[a.cardId]);
  const idadeDe = (a: Atribuicao) => diasNaEtapa(a, agora);
  const limiteDias = chave ? LIMITE_NOSHOW[chave] ?? null : null;
  const faixas = [{ rotulo: '0 a 1 dia', n: 0, valor: 0 }, { rotulo: '2 a 3 dias', n: 0, valor: 0 }, { rotulo: '4 a 7 dias', n: 0, valor: 0 }, { rotulo: '8 a 14 dias', n: 0, valor: 0 }, { rotulo: '15+ dias', n: 0, valor: 0 }];
  for (const a of aqui) { const d = idadeDe(a); const x = faixas[d <= 1 ? 0 : d <= 3 ? 1 : d <= 7 ? 2 : d <= 14 ? 3 : 4]; x.n++; x.valor += valorDe(a); }
  const agrupa = (chaveFn: (a: Atribuicao) => string) => {
    const m = new Map<string, { nome: string; n: number; valor: number }>();
    for (const a of aqui) { const k = chaveFn(a); const x = m.get(k) ?? { nome: k, n: 0, valor: 0 }; x.n++; x.valor += valorDe(a); m.set(k, x); }
    return [...m.values()].sort((x, y) => y.valor - x.valor);
  };
  const estourados = limiteDias ? aqui.filter((a) => idadeDe(a) > limiteDias) : [];
  const quase = limiteDias ? aqui.filter((a) => idadeDe(a) <= limiteDias && limiteDias - idadeDe(a) <= 1) : [];
  const antigo = [...aqui].sort((x, y) => idadeDe(y) - idadeDe(x))[0];
  const topValor = [...aqui].sort((x, y) => valorDe(y) - valorDe(x)).slice(0, 5).map((a) => ({ id: a.cardId, nome: a.ultimoSnapshot.paciente, valor: valorDe(a), dias: idadeDe(a), card: true }));
  const valorAqui = soma(aqui.map(valorDe));

  // ---- destinos e tempo
  const periodoSai = saiP.filter((p) => p.dest);
  const baseDest = periodoSai.length ? periodoSai : passagens.filter((p) => p.dest);
  const cont = new Map<string, number>();
  for (const p of baseDest) cont.set(p.dest!, (cont.get(p.dest!) ?? 0) + 1);
  const destinos = [...cont].sort((x, y) => y[1] - x[1]).map(([k, n]) => ({ status: `ns_${k}`, rotulo: rotuloDe(k), n, pct: pct(n, baseDest.length) ?? 0 }));
  const perdas = (k: string | undefined) => classeDaEtapa(rotuloDe(k ?? '')) === 'perda';
  const descartaram = baseDest.filter((p) => perdas(p.dest)).length;
  const avancaram = baseDest.length - descartaram;
  const duracoes = (saiP.length ? saiP : passagens).filter((p) => p.dur !== undefined).map((p) => p.dur!);
  const tempoMedio = med(duracoes);

  // ---- contato nesta etapa (registros do card, dentro do intervalo em que ele esteve na etapa)
  const tem = !entrada && ['noshow', 'retomada', 'semretorno'].includes(chave!);
  let contatos = 0, whats = 0, lig = 0; const comContato = new Set<string>(), responderam = new Set<string>();
  const contPorBalde = Array(nB).fill(0) as number[];
  if (tem) {
    const porCard = new Map<string, typeof est.contatos>();
    for (const c of est.contatos) { const l = porCard.get(c.cardId) ?? []; l.push(c); porCard.set(c.cardId, l); }
    for (const p of passagens) {
      // o contato do dia da troca de etapa é da etapa que o card está deixando (o de remarcação sai no No-show, antes de mover)
      const lista = (porCard.get(p.a.cardId) ?? []).filter((c) => { const d = diaBRT(c.data); return (d > p.entrada || (p.primeira && d >= p.entrada)) && (!p.saida || d <= p.saida); }).sort((x, y) => x.data.localeCompare(y.data));
      let contatou = false;
      for (const c of lista) {
        const dia = diaBRT(c.data);
        if (/whatsapp|ligou/i.test(c.tipo)) {
          if (dia >= ini) { contatos++; if (/ligou/i.test(c.tipo)) lig++; else whats++; const b = balde(dia); if (b >= 0) contPorBalde[b]++; }
          comContato.add(p.a.cardId); contatou = true;
        } else if (/respondeu/i.test(c.tipo) && contatou) responderam.add(p.a.cardId);
      }
    }
  }
  const taxaResposta = comContato.size >= 3 ? pct(responderam.size, comContato.size) : null;

  // ---- entrada: de onde vêm as faltas
  const origem = entrada ? (() => { const m = new Map<string, number>(); for (const p of entP) { const o = p.a.ultimoSnapshot.unidade || p.a.ultimoSnapshot.origem || 'Não informada'; m.set(o, (m.get(o) ?? 0) + 1); } return [...m].sort((x, y) => y[1] - x[1]).map(([nome, n]) => ({ nome, n })); })() : [];

  const out = {
    item: { id: it.id, titulo: it.titulo, limiteDias, entrada }, dias, semanal, rotulos, titulos,
    agora: { n: aqui.length, valor: valorAqui, ticket: aqui.length ? Math.round(valorAqui / aqui.length) : 0, atrasados: 0, estourados: estourados.length, quase: quase.length, valorRisco: soma([...estourados, ...quase].map(valorDe)), antigo: antigo ? { id: antigo.cardId, nome: antigo.ultimoSnapshot.paciente, dias: idadeDe(antigo) } : null, faixas, porUnidade: agrupa((a) => a.ultimoSnapshot.unidade || 'Sem unidade'), porAtendente: agrupa((a) => est.extras[a.cardId]?.responsavel || 'Sem responsável'), topValor },
    fluxo: { entradas: entP.length, entradasAnt: entP0.length, saidas: saiP.length, avancaram, descartaram, taxaAvanco: pct(avancaram, baseDest.length), destinos, destinosHistorico: !periodoSai.length && baseDest.length > 0, tempoMedio, serie: { entradas, saidas } },
    contatos: { tem, total: contatos, whatsapp: whats, ligacao: lig, leads: comContato.size, responderam: responderam.size, taxaResposta, serie: contPorBalde },
    motivos: [] as { motivo: string; n: number; valor: number }[], origem,
  };
  const n = narrar(it.titulo, { st: entrada ? [] : ['noshow'], entrada }, out);
  // o texto da narrativa foi escrito para o fluxo de leads: aqui o que se acompanha são cards de pacientes que faltaram
  const card = (t: string) => t.replace(/\bleads\b/g, 'cards').replace(/\blead\b/g, 'card').replace(/\bLeads\b/g, 'Cards').replace(/\bLead\b/g, 'Card');
  return { ...out, historia: n.historia.map((x) => ({ titulo: card(x.titulo), texto: card(x.texto) })), insights: n.insights.map((x) => ({ ...x, titulo: card(x.titulo), texto: card(x.texto) })) };
}
