import { diffDias, hojeDe, somaDias, type Lead, type Vista } from './motor.js';
import { transicoes, type Periodo } from './tempo.js';
import { ITENS, LIMITES, type Status } from './modelo.js';

/**
 * Análise de UMA etapa do fluxo (a que o usuário abre ao clicar num card): quem está lá agora, quem entrou e saiu,
 * quanto tempo leva, para onde vai, como o contato funciona e uma narrativa em texto. Função pura sobre os leads.
 */

const ROT: Record<string, string> = {
  aberto: 'Em aberto', sem_retorno: 'Sem retorno', negociacao: 'Em negociação', agendado: 'Agendado',
  convertido_ativo: 'Convertido ativo', convertido_organico: 'Convertido orgânico', descarte: 'Descartado',
};
const TODOS: Status[] = ['aberto', 'sem_retorno', 'negociacao', 'agendado', 'convertido_ativo', 'convertido_organico', 'descarte'];

type Def = { st: Status[]; passo?: string; entrada?: boolean };
const DEF: Record<string, Def> = {
  lead: { st: TODOS, entrada: true },
  aberto: { st: ['aberto'] }, primeiro: { st: ['aberto'], passo: 'primeiro' },
  tentativa: { st: ['sem_retorno'], passo: 'tentativa' }, desconto: { st: ['sem_retorno'], passo: 'desconto' }, semretorno: { st: ['sem_retorno'], passo: 'encerramento' },
  negociacao: { st: ['negociacao'] }, retorno: { st: ['negociacao'], passo: 'retorno' },
  neg0: { st: ['negociacao'], passo: 'orcamento' }, neg1: { st: ['negociacao'], passo: 'followup' }, neg3: { st: ['negociacao'], passo: 'objecao' }, neg7: { st: ['negociacao'], passo: 'ultima' },
  agendado: { st: ['agendado'] }, ativo: { st: ['convertido_ativo'] }, organico: { st: ['convertido_organico'] }, antes: { st: ['convertido_organico'] },
  descarte: { st: ['descarte'] }, reativacao: { st: ['descarte'], passo: 'reativacao' },
};

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const brl = (v: number) => BRL.format(Math.round(v || 0));
const pl = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
const med = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);
const dec = (v: number) => String(v).replace('.', ',');
const soma = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

type Passagem = { id: string; entrada: string; saida?: string; dest?: Status; dur?: number };

export type Narrativa = { titulo: string; texto: string };
export type Insight = { tom: 'bom' | 'atencao' | 'risco' | 'info'; titulo: string; texto: string };

export function analisarEtapa(todos: Lead[], agora: Date, itemId: string, dias: Periodo, vistas: Map<string, Vista>) {
  const it = ITENS.find((i) => i.id === itemId);
  const def = DEF[itemId];
  if (!it || !def) return null;
  const hoje = hojeDe(agora);
  const semanal = dias > 30;
  const nB = semanal ? Math.ceil(dias / 7) : dias;
  const passoB = semanal ? 7 : 1;
  const fins = Array.from({ length: nB }, (_, i) => somaDias(hoje, -(nB - 1 - i) * passoB));
  const inis = fins.map((f) => (semanal ? somaDias(f, -6) : f));
  const rotulos = inis.map((d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`);
  const titulos = fins.map((f, i) => (semanal ? `${rotulos[i]} a ${f.slice(8, 10)}/${f.slice(5, 7)}` : `${f.slice(8, 10)}/${f.slice(5, 7)}`));
  const ini = inis[0], ini0 = somaDias(ini, -dias), fim0 = somaDias(ini, -1);
  const balde = (dia: string) => { for (let i = 0; i < nB; i++) if (dia >= inis[i] && dia <= fins[i]) return i; return -1; };
  const dentro = (s: Status) => def.st.includes(s);

  // ---- passagens pela etapa (histórico reconstruído dos eventos)
  const passagens: (Passagem & { lead: Lead })[] = [];
  for (const l of todos) {
    const tr = transicoes(l);
    for (let i = 0; i < tr.length; i++) {
      if (!dentro(tr[i].status)) continue;
      if (i > 0 && dentro(tr[i - 1].status)) continue;
      if (def.entrada && i > 0) continue;
      const out = def.entrada ? undefined : tr.slice(i + 1).find((t) => !dentro(t.status));
      passagens.push({ lead: l, id: l.id, entrada: tr[i].dia, saida: out?.dia, dest: out?.status, dur: out ? Math.max(0, diffDias(tr[i].dia, out.dia)) : undefined });
    }
  }
  const entP = passagens.filter((p) => p.entrada >= ini);
  const entP0 = passagens.filter((p) => p.entrada >= ini0 && p.entrada <= fim0);
  const saiP = passagens.filter((p) => p.saida && p.saida >= ini);
  const entradas = Array(nB).fill(0) as number[], saidas = Array(nB).fill(0) as number[];
  for (const p of entP) { const b = balde(p.entrada); if (b >= 0) entradas[b]++; }
  for (const p of saiP) { const b = balde(p.saida!); if (b >= 0) saidas[b]++; }

  // ---- onde estão agora
  const aqui = def.entrada ? [] : todos.filter((l) => {
    const v = vistas.get(l.id); if (!v) return false;
    if (v.item === itemId) return true;
    return it.tipo === 'passo' && l.status === 'negociacao' && v.proximo?.passo.item === itemId;
  });
  const idadeDe = (l: Lead) => Math.max(0, diffDias(l.status === 'aberto' ? l.d0 : l.statusDesde, hoje));
  const faixas = [{ rotulo: '0 a 1 dia', n: 0, valor: 0 }, { rotulo: '2 a 3 dias', n: 0, valor: 0 }, { rotulo: '4 a 7 dias', n: 0, valor: 0 }, { rotulo: '8 a 14 dias', n: 0, valor: 0 }, { rotulo: '15+ dias', n: 0, valor: 0 }];
  for (const l of aqui) { const d = idadeDe(l); const f = faixas[d <= 1 ? 0 : d <= 3 ? 1 : d <= 7 ? 2 : d <= 14 ? 3 : 4]; f.n++; f.valor += l.valor; }
  const agrupa = (chave: (l: Lead) => string) => {
    const m = new Map<string, { nome: string; n: number; valor: number }>();
    for (const l of aqui) { const k = chave(l); const x = m.get(k) ?? { nome: k, n: 0, valor: 0 }; x.n++; x.valor += l.valor; m.set(k, x); }
    return [...m.values()].sort((a, b) => b.valor - a.valor);
  };
  const atrasados = aqui.filter((l) => vistas.get(l.id)?.proximo?.situacao === 'atrasada');
  const estourados = aqui.filter((l) => vistas.get(l.id)?.limite?.excedido);
  const quase = aqui.filter((l) => { const lim = vistas.get(l.id)?.limite; return lim && !lim.excedido && lim.dias - lim.usados <= 1; });
  const antigo = [...aqui].sort((a, b) => idadeDe(b) - idadeDe(a))[0];
  const topValor = [...aqui].sort((a, b) => b.valor - a.valor).slice(0, 5).map((l) => ({ id: l.id, nome: l.nome, valor: l.valor, dias: idadeDe(l) }));
  const valorAqui = soma(aqui.map((l) => l.valor));

  // ---- destinos e tempo
  const periodoSai = saiP.filter((p) => p.dest);
  const baseDest = periodoSai.length ? periodoSai : passagens.filter((p) => p.dest);
  const cont = new Map<string, number>();
  for (const p of baseDest) cont.set(p.dest!, (cont.get(p.dest!) ?? 0) + 1);
  const destinos = [...cont].sort((a, b) => b[1] - a[1]).map(([s, n]) => ({ status: s, rotulo: ROT[s], n, pct: pct(n, baseDest.length) ?? 0 }));
  const avancaram = baseDest.filter((p) => p.dest !== 'descarte').length;
  const descartaram = baseDest.filter((p) => p.dest === 'descarte').length;
  const duracoes = (saiP.length ? saiP : passagens).filter((p) => p.dur !== undefined).map((p) => p.dur!);
  const tempoMedio = med(duracoes);
  const limiteDias = def.st[0] === 'aberto' ? LIMITES.aberto : def.st[0] === 'sem_retorno' ? LIMITES.sem_retorno : def.st[0] === 'negociacao' ? LIMITES.negociacao : null;

  // ---- contato nesta etapa
  const donos = new Set(passagens.map((p) => p.id));
  let contatos = 0, whats = 0, lig = 0; const comContato = new Set<string>(); const responderam = new Set<string>();
  const contPorBalde = Array(nB).fill(0) as number[];
  const tem = !def.entrada && it.tipo !== 'regra' && !['ativo', 'organico', 'agendado', 'descarte'].includes(itemId);
  if (tem) {
    for (const l of todos) {
      if (!donos.has(l.id)) continue;
      let contatou = false;
      for (const e of l.eventos) {
        const dia = e.quando.slice(0, 10);
        if (e.tipo === 'contato' && (def.passo ? e.passo === def.passo : !e.fase || dentro(e.fase as Status))) {
          if (dia >= ini) { contatos++; if (e.canal === 'ligacao') lig++; else whats++; const b = balde(dia); if (b >= 0) contPorBalde[b]++; }
          comContato.add(l.id); contatou = true;
        } else if (e.tipo === 'resposta' && contatou) responderam.add(l.id);
      }
    }
  }
  const taxaResposta = comContato.size >= 3 ? pct(responderam.size, comContato.size) : null;

  // ---- descartes que nasceram aqui
  const motivosMap = new Map<string, { n: number; valor: number }>();
  for (const l of todos) {
    if (!l.descarte) continue;
    const vemDaqui = itemId === 'descarte' || itemId === 'reativacao' ? true : def.st.includes(l.descarte.de);
    if (!vemDaqui) continue;
    const x = motivosMap.get(l.descarte.motivo) ?? { n: 0, valor: 0 }; x.n++; x.valor += l.valor; motivosMap.set(l.descarte.motivo, x);
  }
  const motivos = [...motivosMap].sort((a, b) => b[1].n - a[1].n).map(([motivo, x]) => ({ motivo, ...x }));

  // ---- entrada (item "lead"): origem
  const origem = def.entrada ? agrupaOrigem(entP.map((p) => p.lead)) : [];

  const entN = entP.length, entN0 = entP0.length;
  const out = {
    item: { id: it.id, titulo: it.titulo, limiteDias }, dias, semanal, rotulos, titulos,
    agora: { n: aqui.length, valor: valorAqui, ticket: aqui.length ? Math.round(valorAqui / aqui.length) : 0, atrasados: atrasados.length, estourados: estourados.length, quase: quase.length, valorRisco: soma([...estourados, ...quase].map((l) => l.valor)), antigo: antigo ? { id: antigo.id, nome: antigo.nome, dias: idadeDe(antigo) } : null, faixas, porUnidade: agrupa((l) => l.unidade || 'Sem unidade'), porAtendente: agrupa((l) => l.atendente || 'Sem responsável'), topValor },
    fluxo: { entradas: entN, entradasAnt: entN0, saidas: saiP.length, avancaram, descartaram, taxaAvanco: pct(avancaram, baseDest.length), destinos, destinosHistorico: !periodoSai.length && baseDest.length > 0, tempoMedio, serie: { entradas, saidas } },
    contatos: { tem, total: contatos, whatsapp: whats, ligacao: lig, leads: comContato.size, responderam: responderam.size, taxaResposta, serie: contPorBalde },
    motivos, origem,
  };
  return { ...out, ...narrar(it.titulo, def, out) };
}

function agrupaOrigem(ls: Lead[]) {
  const m = new Map<string, number>();
  for (const l of ls) m.set(l.origem || 'Não informada', (m.get(l.origem || 'Não informada') ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]).map(([nome, n]) => ({ nome, n }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function narrar(titulo: string, def: { st: string[]; entrada?: boolean }, d: Record<string, any>): { historia: Narrativa[]; insights: Insight[] } {
  const A = d.agora, F = d.fluxo, C = d.contatos, dias: number = d.dias;
  const historia: Narrativa[] = []; const insights: Insight[] = [];
  const delta = F.entradasAnt > 0 ? Math.round(((F.entradas - F.entradasAnt) / F.entradasAnt) * 100) : null;
  const nome = titulo.toLowerCase();

  // 1. retrato
  if (def.entrada) {
    const top = d.origem[0];
    historia.push({ titulo: 'Como os leads chegam', texto: `Nos últimos ${dias} dias entraram ${pl(F.entradas, 'lead', 'leads')}${delta === null ? '' : `, ${delta >= 0 ? 'uma alta' : 'uma queda'} de ${Math.abs(delta)}% sobre os ${dias} dias anteriores (${F.entradasAnt})`}.${top ? ` A origem que mais traz gente é ${top.nome}, com ${top.n} (${pct(top.n, F.entradas)}%).` : ''} Tudo começa aqui: o dia da entrada é o D0, e é dele que se contam todos os prazos do guia.` });
    if (delta !== null && delta <= -20) insights.push({ tom: 'atencao', titulo: 'Entrada de leads em queda', texto: `Vieram ${F.entradas} leads contra ${F.entradasAnt} no período anterior (${delta}%). Vale checar campanhas e canais antes que a fila esvazie.` });
    else if (delta !== null && delta >= 20) insights.push({ tom: 'bom', titulo: 'Mais leads chegando', texto: `Entraram ${F.entradas} leads, ${delta}% a mais que no período anterior. Garanta que o 1º contato ainda saia no D1.` });
    if (top && F.entradas >= 5 && (pct(top.n, F.entradas) ?? 0) >= 60) insights.push({ tom: 'info', titulo: 'Dependência de uma origem', texto: `${pct(top.n, F.entradas)}% dos leads vêm de ${top.nome}. Se esse canal falhar, o funil seca.` });
    if (!insights.length) insights.push({ tom: 'info', titulo: F.entradas ? 'Entrada dentro do normal' : 'Sem leads novos', texto: F.entradas ? `${pl(F.entradas, 'lead entrou', 'leads entraram')} no período, sem variação relevante contra o anterior.` : 'Nenhum lead novo no período.' });
    return { historia, insights };
  }

  const aquiTxt = A.n
    ? `Agora há **${pl(A.n, 'lead', 'leads')}** na etapa "${titulo}", somando **${brl(A.valor)}** em orçamentos (ticket médio de ${brl(A.ticket)}).${A.antigo ? ` O mais antigo é ${A.antigo.nome}, há ${pl(A.antigo.dias, 'dia', 'dias')} nesta etapa.` : ''}`
    : `Neste momento não há nenhum lead na etapa "${titulo}".`;
  const fluxoTxt = F.entradas || F.saidas
    ? ` Nos últimos ${dias} dias, ${pl(F.entradas, 'lead entrou', 'leads entraram')}${delta === null ? '' : ` (${delta >= 0 ? '+' : ''}${delta}% sobre o período anterior)`} e ${pl(F.saidas, 'saiu', 'saíram')}.`
    : ` Nos últimos ${dias} dias ninguém entrou nem saiu desta etapa.`;
  historia.push({ titulo: 'O retrato de agora', texto: aquiTxt + fluxoTxt });

  // 2. para onde vão
  if (F.destinos.length) {
    const principal = F.destinos[0];
    const resto = F.destinos.slice(1, 3).map((x: { rotulo: string; pct: number }) => `${x.pct}% para ${x.rotulo}`).join(' e ');
    historia.push({ titulo: 'Para onde os leads vão', texto: `${F.destinosHistorico ? 'No histórico' : 'No período'}, de ${pl(F.avancaram + F.descartaram, 'lead que saiu', 'leads que saíram')} desta etapa, a maior parte (${principal.pct}%) foi para ${principal.rotulo}${resto ? `, seguida de ${resto}` : ''}. ${F.taxaAvanco !== null ? `No total, ${F.taxaAvanco}% avançaram no funil e ${100 - F.taxaAvanco}% viraram descarte.` : ''}` });
    if (F.taxaAvanco !== null && F.avancaram + F.descartaram >= 5) {
      if (F.taxaAvanco >= 70) insights.push({ tom: 'bom', titulo: 'Etapa que flui bem', texto: `${F.taxaAvanco}% de quem sai da etapa "${titulo}" avança. O gargalo, se existe, está mais à frente.` });
      else if (F.taxaAvanco < 40) insights.push({ tom: 'risco', titulo: 'Vazamento nesta etapa', texto: `Só ${F.taxaAvanco}% de quem sai da etapa "${titulo}" avança; ${100 - F.taxaAvanco}% vira descarte. É aqui que o funil mais perde gente.` });
      else insights.push({ tom: 'atencao', titulo: 'Avanço mediano', texto: `${F.taxaAvanco}% avançam e ${100 - F.taxaAvanco}% são descartados. Há espaço para recuperar parte desses leads.` });
    }
  }

  // 3. tempo
  if (F.tempoMedio !== null) {
    const lim = d.item.limiteDias;
    const folga = lim ? (F.tempoMedio <= lim ? `dentro do limite de ${pl(lim, 'dia', 'dias')} do guia` : `acima do limite de ${pl(lim, 'dia', 'dias')} do guia`) : '';
    historia.push({ titulo: 'Quanto tempo ficam', texto: `Em média os leads passam **${dec(F.tempoMedio)} ${F.tempoMedio === 1 ? 'dia' : 'dias'}** na etapa "${titulo}"${folga ? `, ${folga}` : ''}.${A.estourados ? ` Hoje ${pl(A.estourados, 'lead já passou', 'leads já passaram')} do prazo, com ${brl(A.valorRisco)} em jogo.` : A.quase ? ` ${pl(A.quase, 'lead está', 'leads estão')} a 1 dia de estourar o prazo.` : ' Nenhum lead está estourando o prazo agora.'}` });
    if (lim && F.tempoMedio > lim) insights.push({ tom: 'atencao', titulo: 'Tempo médio acima do prazo', texto: `A média de ${dec(F.tempoMedio)} dias passa do limite de ${lim}. A cadência está atrasando.` });
  }
  if (A.estourados) insights.push({ tom: 'risco', titulo: `${pl(A.estourados, 'lead passou', 'leads passaram')} do prazo`, texto: `${brl(A.valorRisco)} em orçamentos pedem decisão hoje: contatar ou descartar com motivo.` });
  else if (A.quase) insights.push({ tom: 'atencao', titulo: `${pl(A.quase, 'lead', 'leads')} a 1 dia do limite`, texto: `${brl(A.valorRisco)} esfriam amanhã se nada for feito.` });
  if (A.atrasados) insights.push({ tom: A.atrasados >= 5 ? 'risco' : 'atencao', titulo: `${pl(A.atrasados, 'tarefa atrasada', 'tarefas atrasadas')}`, texto: `Cadência vencida em ${pl(A.atrasados, 'lead desta etapa', 'leads desta etapa')}. Comece pelos de maior valor.` });

  // 4. contato
  if (C.tem && C.total + C.leads > 0) {
    const mix = C.total ? `${pct(C.whatsapp, C.total)}% por WhatsApp e ${pct(C.ligacao, C.total)}% por ligação` : '';
    historia.push({ titulo: 'Como o contato está funcionando', texto: `${C.total ? `Foram ${pl(C.total, 'contato registrado', 'contatos registrados')} nesta etapa no período (${mix}).` : 'Nenhum contato foi registrado nesta etapa no período.'}${C.taxaResposta !== null ? ` Dos ${C.leads} leads já contatados aqui, ${C.responderam} responderam: **${C.taxaResposta}%**.` : ''}` });
    if (C.taxaResposta !== null) {
      if (C.taxaResposta >= 55) insights.push({ tom: 'bom', titulo: 'Boa taxa de resposta', texto: `${C.taxaResposta}% respondem depois do contato nesta etapa. A abordagem está funcionando.` });
      else if (C.taxaResposta <= 25) insights.push({ tom: 'atencao', titulo: 'Pouca resposta', texto: `Só ${C.taxaResposta}% respondem. Teste outro horário, a variante da mensagem ou a ligação.` });
    }
    if (C.total >= 8 && C.ligacao === 0 && def.st[0] !== 'negociacao') insights.push({ tom: 'info', titulo: 'Nenhuma ligação', texto: 'Todo contato foi por WhatsApp. O guia prevê ligação como apoio, principalmente em orçamentos acima de R$ 500.' });
  }

  // 5. descartes
  if (d.motivos.length) {
    const m = d.motivos[0]; const tot = soma(d.motivos.map((x: { n: number }) => x.n));
    historia.push({ titulo: 'Por que se perdem', texto: `Os leads que saem daqui por descarte somam ${pl(tot, 'caso', 'casos')} no histórico. O motivo líder é **${m.motivo}** (${pct(m.n, tot)}%, ${brl(m.valor)} em orçamentos)${d.motivos[1] ? `, depois ${d.motivos[1].motivo} (${pct(d.motivos[1].n, tot)}%)` : ''}.` });
    if (tot >= 5 && (pct(m.n, tot) ?? 0) >= 40) insights.push({ tom: 'atencao', titulo: `${m.motivo} concentra as perdas`, texto: `${pct(m.n, tot)}% dos descartes vindos da etapa "${titulo}" têm esse motivo. Vale preparar uma resposta específica.` });
  }

  // 6. concentração
  const pu = A.porUnidade[0];
  if (A.n >= 5 && pu && A.porUnidade.length > 1 && (pct(pu.n, A.n) ?? 0) >= 60) insights.push({ tom: 'info', titulo: `Concentrado em ${pu.nome}`, texto: `${pct(pu.n, A.n)}% dos leads desta etapa são da unidade ${pu.nome}.` });
  const faixa15 = A.faixas[4].n;
  if (faixa15) insights.push({ tom: 'atencao', titulo: 'Leads muito antigos', texto: `${pl(faixa15, 'lead está', 'leads estão')} há 15 dias ou mais aqui. É hora de reativar com oferta ou encerrar com motivo.` });

  // 7. o que fazer
  const acoes: string[] = [];
  if (A.estourados) acoes.push(`decidir os ${A.estourados} que estouraram o prazo`);
  if (A.atrasados) acoes.push(`zerar as ${A.atrasados} tarefas atrasadas`);
  if (A.quase) acoes.push(`olhar os ${A.quase} que vencem amanhã`);
  historia.push({ titulo: 'O que eu faria agora', texto: acoes.length ? `Hoje, nesta etapa: ${acoes.join(', depois ')}. Priorize sempre o maior valor primeiro e registre cada tentativa no card.` : A.n ? 'A etapa está em dia. Mantenha o ritmo da cadência e registre cada tentativa no card.' : 'Sem pendências aqui. Olhe as etapas à frente para ver onde o dinheiro está parado.' });
  if (!insights.length) insights.push({ tom: 'info', titulo: 'Sem alertas nesta etapa', texto: A.n || F.entradas ? 'Nada fora do esperado pelas regras do guia.' : 'Ainda não há movimento suficiente para gerar insights.' });
  const ordem = { risco: 0, atencao: 1, info: 2, bom: 3 };
  insights.sort((a, b) => ordem[a.tom] - ordem[b.tom]);
  return { historia, insights };
}

