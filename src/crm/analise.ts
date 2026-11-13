import { diaDoInstante, diffDias, ehConversaoAtiva, hojeDe, horaDe, somaDias, type EventoLead, type Lead, type Tarefa, type Vista } from './motor.js';
import { LIMITES, MENSAGENS } from './modelo.js';

/**
 * Análises da tela Hoje do CRM. Tudo é calculado dos eventos que cada lead já guarda (contatos, respostas, agendamentos,
 * comparecimentos, descartes): nada é estimado nem inventado. Função pura: mesma entrada, mesma saída.
 * Janelas: 14 dias para atividade, 30 dias para conversão/valor, 90 dias para funil, origem e exames.
 */

const HORA_MS = 3_600_000;
const ATIVOS = ['aberto', 'sem_retorno', 'negociacao', 'agendado'] as const;
const porcento = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);
const soma = (a: number[]) => a.reduce((x, y) => x + y, 0);
const arred = (v: number, c = 1) => Math.round(v * 10 ** c) / 10 ** c;
/** número no formato brasileiro, para os textos (vírgula decimal) */
const fmt = (v: number, c = 1) => v.toLocaleString('pt-BR', { maximumFractionDigits: c });
const media = (a: number[]) => (a.length ? soma(a) / a.length : null);
const mediana = (a: number[]) => { if (!a.length) return null; const o = [...a].sort((x, y) => x - y); const m = o.length >> 1; return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2; };
const horaLocal = (iso: string) => horaDe(new Date(iso)).h;

export type Marcos = { d0: string; contatado?: string; respondeu?: string; agendou?: string; compareceu?: string; descartou?: string; motivo?: string; organico?: string };

export function marcosDe(l: Lead): Marcos {
  const m: Marcos = { d0: l.d0 };
  for (const e of l.eventos) {
    const d = diaDoInstante(e.quando);
    if (e.tipo === 'contato') m.contatado ??= d;
    else if (e.tipo === 'resposta') m.respondeu ??= d;
    else if (e.tipo === 'agendamento') m.agendou ??= d;
    else if (ehConversaoAtiva(e)) m.compareceu = d;
    else if (e.tipo === 'descarte') { m.descartou = d; m.motivo = /Motivo: ([^.]+)\./.exec(e.texto)?.[1] ?? 'Outro'; }
    else if (e.tipo === 'recepcao') m.organico = d;
  }
  return m;
}

export type Insight = { nivel: 'critico' | 'atencao' | 'info' | 'bom'; titulo: string; texto: string; metrica?: string; acao?: { rotulo: string; leadId?: string; leadIds?: string[]; aba?: string } };
const ORDEM = { critico: 0, atencao: 1, info: 2, bom: 3 } as const;

export function analisarHoje(leads: Lead[], agora: Date, tarefas: Tarefa[], vistas: Map<string, Vista>) {
  const hoje = hojeDe(agora);
  const d = (n: number) => somaDias(hoje, -n);
  const marcos = new Map(leads.map((l) => [l.id, marcosDe(l)]));
  const mk = (l: Lead) => marcos.get(l.id)!;
  const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const eventosTodos: { l: Lead; e: EventoLead; dia: string }[] = [];
  for (const l of leads) for (const e of l.eventos) eventosTodos.push({ l, e, dia: diaDoInstante(e.quando) });

  // ------------------------------------------------------------------ atividade dos últimos 14 dias
  const dias14 = Array.from({ length: 14 }, (_, i) => d(13 - i));
  const idx14 = new Map(dias14.map((x, i) => [x, i]));
  const zero = () => Array<number>(14).fill(0);
  // "novo" = dia em que o lead ENTROU no CRM (criadoEm), não a data do orçamento (D0): a sincronização roda de madrugada e só traz orçamentos de dias anteriores
  const entrouEm = (l: { criadoEm: string; d0: string }) => (Number.isNaN(Date.parse(l.criadoEm)) ? l.d0 : hojeDe(new Date(l.criadoEm)));
  const ativ = { contatos: zero(), respostas: zero(), novos: zero(), agendamentos: zero(), convertidos: zero(), descartes: zero() };
  for (const l of leads) { const i = idx14.get(entrouEm(l)); if (i !== undefined) ativ.novos[i]++; }
  for (const { e, dia } of eventosTodos) {
    const i = idx14.get(dia); if (i === undefined) continue;
    if (e.tipo === 'contato') ativ.contatos[i]++;
    else if (e.tipo === 'resposta') ativ.respostas[i]++;
    else if (e.tipo === 'agendamento') ativ.agendamentos[i]++;
    else if (ehConversaoAtiva(e)) ativ.convertidos[i]++;
    else if (e.tipo === 'descarte') ativ.descartes[i]++;
  }

  // ------------------------------------------------------------------ progresso do dia e ritmo
  const feitasHoje = eventosTodos.filter(({ e, dia }) => dia === hoje && ((e.tipo === 'contato' && e.passo) || (e.tipo === 'comparecimento') || (e.tipo === 'descarte' && !e.auto))).length;
  const pendentes = tarefas.filter((t) => t.situacao === 'hoje').length; // só o que vence hoje; as atrasadas têm contador próprio
  const atrasadas = tarefas.filter((t) => t.situacao === 'atrasada').length;
  const { h: horaAgora, m: minAgora } = horaDe(agora);
  const restaH = horaAgora < LIMITES.janelaInicioH ? LIMITES.janelaFimH - LIMITES.janelaInicioH : horaAgora >= LIMITES.janelaFimH ? 0 : LIMITES.janelaFimH - horaAgora - minAgora / 60;
  const ritmo = restaH > 0 ? pendentes / restaH : null;
  const progresso = { feitas: feitasHoje, pendentes, atrasadas, pct: arred(porcento(feitasHoje, feitasHoje + pendentes)), horasRestantes: arred(restaH), ritmoPorHora: ritmo === null ? null : arred(ritmo) };

  // ------------------------------------------------------------------ funil (90 dias)
  const f90 = leads.filter((l) => l.d0 >= d(89));
  const funil = [
    { etapa: 'Leads', n: f90.length },
    { etapa: 'Contatados', n: f90.filter((l) => mk(l).contatado).length },
    { etapa: 'Responderam', n: f90.filter((l) => mk(l).respondeu).length },
    { etapa: 'Agendaram', n: f90.filter((l) => mk(l).agendou).length },
    { etapa: 'Compareceram', n: f90.filter((l) => mk(l).compareceu).length },
  ].map((x, i, a) => ({ ...x, pct: arred(porcento(x.n, a[0].n)), perda: i && a[i - 1].n ? arred(100 - porcento(x.n, a[i - 1].n)) : 0 }));
  const saidas90 = { organicos: f90.filter((l) => l.status === 'convertido_organico').length, descartados: f90.filter((l) => l.status === 'descarte').length, emAndamento: f90.filter((l) => (ATIVOS as readonly string[]).includes(l.status)).length };

  // ------------------------------------------------------------------ janelas de comparação (30 dias)
  const ini30 = d(29), ini60 = d(59);
  const inW = (dia: string | undefined, a: string, b: string) => !!dia && dia >= a && dia <= b;
  const conv30 = leads.filter((l) => inW(mk(l).compareceu, ini30, hoje)).length;
  const desc30 = leads.filter((l) => inW(mk(l).descartou, ini30, hoje) && l.status === 'descarte').length;
  const conv30p = leads.filter((l) => inW(mk(l).compareceu, ini60, d(30))).length;
  const desc30p = leads.filter((l) => inW(mk(l).descartou, ini60, d(30)) && l.status === 'descarte').length;
  const taxaConv = porcento(conv30, conv30 + desc30), taxaConvAnt = conv30p + desc30p ? porcento(conv30p, conv30p + desc30p) : null;
  const valorConv30 = soma(leads.filter((l) => inW(mk(l).compareceu, ini30, hoje)).map((l) => l.valor));
  const valorPerdido30 = soma(leads.filter((l) => inW(mk(l).descartou, ini30, hoje) && l.status === 'descarte').map((l) => l.valor));

  const respostaTaxa = (a: string, b: string) => { const c = leads.filter((l) => inW(mk(l).contatado, a, b)); return { n: c.length, taxa: c.length ? porcento(c.filter((l) => mk(l).respondeu).length, c.length) : null }; };
  const r14 = respostaTaxa(d(13), hoje), r14p = respostaTaxa(d(27), d(14));
  const agendTaxa = (a: string, b: string) => { const c = leads.filter((l) => inW(mk(l).contatado, a, b)); return { n: c.length, taxa: c.length ? porcento(c.filter((l) => mk(l).agendou).length, c.length) : null }; };
  const a30 = agendTaxa(ini30, hoje), a30p = agendTaxa(ini60, d(30));
  const ciclos = leads.filter((l) => mk(l).compareceu && mk(l).compareceu! >= d(89)).map((l) => diffDias(l.d0, mk(l).compareceu!));
  const novos7 = ativ.novos.slice(7).reduce((a, b) => a + b, 0), novos7p = ativ.novos.slice(0, 7).reduce((a, b) => a + b, 0);

  const ativosL = leads.filter((l) => (ATIVOS as readonly string[]).includes(l.status));
  const atrasadosIds = new Set(tarefas.filter((t) => t.situacao === 'atrasada').map((t) => t.leadId));
  const excedidos = ativosL.filter((l) => vistas.get(l.id)?.limite?.excedido);
  const risco = ativosL.filter((l) => atrasadosIds.has(l.id) || vistas.get(l.id)?.limite?.excedido);

  const kpis = {
    novosHoje: leads.filter((l) => entrouEm(l) === hoje).length, novos7, novos7Ant: novos7p, serieNovos: ativ.novos,
    contatosHoje: ativ.contatos[13], serieContatos: ativ.contatos,
    respostaTaxa: r14.taxa, respostaTaxaAnt: r14p.taxa, respostaN: r14.n, serieRespostas: ativ.respostas,
    agendTaxa: a30.taxa, agendTaxaAnt: a30p.taxa, agendN: a30.n, serieAgend: ativ.agendamentos,
    conversao: conv30 + desc30 ? taxaConv : null, conversaoAnt: taxaConvAnt, conversaoN: conv30 + desc30, serieConv: ativ.convertidos,
    cicloMedio: media(ciclos), cicloMediana: mediana(ciclos), cicloN: ciclos.length,
    pipelineValor: soma(ativosL.map((l) => l.valor)), pipelineN: ativosL.length,
    riscoValor: soma(risco.map((l) => l.valor)), riscoN: risco.length,
    convertidoValor30: valorConv30, convertidoN30: conv30, perdidoValor30: valorPerdido30, perdidoN30: desc30,
  };

  // ------------------------------------------------------------------ pipeline por etapa e aging
  const pipeline = (ATIVOS as readonly string[]).map((s) => {
    const ls = leads.filter((l) => l.status === s);
    const dias = ls.map((l) => diffDias(l.statusDesde, hoje));
    return {
      status: s, n: ls.length, valor: soma(ls.map((l) => l.valor)), diasMedio: media(dias) === null ? null : arred(media(dias)!),
      excedidos: ls.filter((l) => vistas.get(l.id)?.limite?.excedido).length, atrasados: ls.filter((l) => atrasadosIds.has(l.id)).length,
    };
  });
  const faixasAging: [string, (n: number) => boolean][] = [['0–1 dia', (n) => n <= 1], ['2–3 dias', (n) => n >= 2 && n <= 3], ['4–7 dias', (n) => n >= 4 && n <= 7], ['8–14 dias', (n) => n >= 8 && n <= 14], ['15+ dias', (n) => n >= 15]];
  const aging = (ATIVOS as readonly string[]).filter((s) => s !== 'agendado').map((s) => ({
    status: s, faixas: faixasAging.map(([rotulo, ok]) => ({ rotulo, n: leads.filter((l) => l.status === s && ok(diffDias(l.statusDesde, hoje))).length })),
  }));

  // ------------------------------------------------------------------ desempenho por mensagem (resposta atribuída ao último contato antes dela)
  const porMsg = new Map<number, { env: number; resp: number }>();
  const respPorHora = Array<number>(24).fill(0), contPorHora = Array<number>(24).fill(0);
  for (const l of leads) {
    const evs = [...l.eventos].sort((a, b) => a.quando.localeCompare(b.quando));
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      if (diaDoInstante(e.quando) >= d(89)) {
        if (e.tipo === 'contato') contPorHora[horaLocal(e.quando)]++;
        if (e.tipo === 'resposta') respPorHora[horaLocal(e.quando)]++;
      }
      if (e.tipo !== 'contato' || !e.msg) continue;
      const x = porMsg.get(e.msg) ?? { env: 0, resp: 0 };
      x.env++;
      const t0 = Date.parse(e.quando);
      for (let j = i + 1; j < evs.length; j++) {
        if (evs[j].tipo === 'contato') break;
        if (evs[j].tipo === 'resposta') { if (Date.parse(evs[j].quando) - t0 <= 72 * HORA_MS) x.resp++; break; }
      }
      porMsg.set(e.msg, x);
    }
  }
  const mensagens = MENSAGENS.map((m) => { const x = porMsg.get(m.n) ?? { env: 0, resp: 0 }; return { n: m.n, titulo: m.titulo, enviadas: x.env, respostas: x.resp, taxa: x.env ? arred(porcento(x.resp, x.env)) : null }; });

  // ------------------------------------------------------------------ descartes, origem, exames, equipe, valor, ciclo
  const motivos = new Map<string, { n: number; valor: number }>();
  for (const l of leads) { const m = mk(l); if (l.status === 'descarte' && m.descartou && m.descartou >= d(89)) { const k = m.motivo ?? 'Outro'; const x = motivos.get(k) ?? { n: 0, valor: 0 }; x.n++; x.valor += l.valor; motivos.set(k, x); } }
  const descartes = [...motivos.entries()].map(([motivo, x]) => ({ motivo, ...x })).sort((a, b) => b.n - a.n);

  const grupo = (chave: (l: Lead) => string) => {
    const g = new Map<string, Lead[]>();
    for (const l of f90) { const k = chave(l); (g.get(k) ?? g.set(k, []).get(k)!).push(l); }
    return [...g.entries()].map(([nome, ls]) => {
      const conv = ls.filter((l) => mk(l).compareceu).length, desc = ls.filter((l) => l.status === 'descarte').length;
      return { nome, leads: ls.length, convertidos: conv, descartados: desc, taxa: conv + desc ? arred(porcento(conv, conv + desc)) : null, valorConvertido: soma(ls.filter((l) => mk(l).compareceu).map((l) => l.valor)), valorTotal: soma(ls.map((l) => l.valor)), ticket: ls.length ? Math.round(soma(ls.map((l) => l.valor)) / ls.length) : 0 };
    }).sort((a, b) => b.leads - a.leads);
  };
  const origem = grupo((l) => l.origem?.trim() || 'Não informada').slice(0, 8);
  const exames = grupo((l) => { const e = (l.exame || 'Sem exame informado').trim(); return e.charAt(0).toUpperCase() + e.slice(1); }).slice(0, 8);

  const equipeMap = new Map<string, Lead[]>();
  for (const l of leads) { const k = l.atendente || 'Sem responsável'; (equipeMap.get(k) ?? equipeMap.set(k, []).get(k)!).push(l); }
  const equipe = [...equipeMap.entries()].map(([nome, ls]) => {
    const ids = new Set(ls.map((l) => l.id));
    const ts = tarefas.filter((t) => ids.has(t.leadId));
    const conv = ls.filter((l) => inW(mk(l).compareceu, ini30, hoje)).length, desc = ls.filter((l) => inW(mk(l).descartou, ini30, hoje) && l.status === 'descarte').length;
    return {
      nome, ativos: ls.filter((l) => (ATIVOS as readonly string[]).includes(l.status)).length, tarefas: ts.length, atrasadas: ts.filter((t) => t.situacao === 'atrasada').length,
      contatosHoje: eventosTodos.filter(({ l, e, dia }) => ids.has(l.id) && e.tipo === 'contato' && dia === hoje).length, convertidos30: conv, taxa30: conv + desc ? arred(porcento(conv, conv + desc)) : null,
      valorAtivo: soma(ls.filter((l) => (ATIVOS as readonly string[]).includes(l.status)).map((l) => l.valor)),
    };
  }).sort((a, b) => b.ativos - a.ativos);

  const faixasValor: [string, (v: number) => boolean][] = [['Até R$ 200', (v) => v <= 200], ['R$ 201 a 500', (v) => v > 200 && v <= 500], ['R$ 501 a 1.000', (v) => v > 500 && v <= 1000], ['Acima de R$ 1.000', (v) => v > 1000]];
  const valores = faixasValor.map(([rotulo, ok]) => { const ls = ativosL.filter((l) => ok(l.valor)); return { rotulo, n: ls.length, valor: soma(ls.map((l) => l.valor)) }; });
  const faixasCiclo: [string, (n: number) => boolean][] = [['0–3 dias', (n) => n <= 3], ['4–7 dias', (n) => n >= 4 && n <= 7], ['8–14 dias', (n) => n >= 8 && n <= 14], ['15+ dias', (n) => n >= 15]];
  const ciclo = faixasCiclo.map(([rotulo, ok]) => ({ rotulo, n: ciclos.filter(ok).length }));

  // ------------------------------------------------------------------ quentes e próximos dias
  const quentes = ativosL.filter((l) => l.status === 'negociacao' || l.status === 'agendado').map((l) => {
    const r = [...l.eventos].reverse().find((e) => e.tipo === 'resposta');
    return r && agora.getTime() - Date.parse(r.quando) <= 48 * HORA_MS ? { id: l.id, nome: l.nome, exame: l.exame, valor: l.valor, status: l.status, horas: Math.max(0, Math.round((agora.getTime() - Date.parse(r.quando)) / HORA_MS)) } : null;
  }).filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => b.valor - a.valor).slice(0, 8);
  const proximos = Array.from({ length: 7 }, (_, i) => {
    const dia = somaDias(hoje, i + 1);
    const ls = leads.filter((l) => { const p = vistas.get(l.id)?.proximo; return p && p.situacao === 'futura' && p.vence === dia; });
    return { dia, n: ls.length, valor: soma(ls.map((l) => l.valor)), nomes: ls.slice(0, 4).map((l) => l.nome.split(' ')[0]) };
  });

  // ------------------------------------------------------------------ inteligência: o que merece atenção hoje
  const insights: Insight[] = [];
  const add = (nivel: Insight['nivel'], titulo: string, texto: string, metrica?: string, acao?: Insight['acao']) => insights.push({ nivel, titulo, texto, metrica, acao });
  const p1 = tarefas.filter((t) => t.prioridade === 1 && t.situacao !== 'futura');
  if (p1.length) {
    const ids = p1.map((t) => t.leadId); const v = soma(p1.map((t) => leads.find((l) => l.id === t.leadId)?.valor ?? 0));
    add('critico', `${p1.length} ${p1.length === 1 ? 'caso de no show ou comparecimento' : 'casos de no show ou comparecimento'} para tratar primeiro`, `É a 1ª prioridade do dia: ${brl(v)} em orçamentos dependem de confirmar se o paciente veio ou de reagendar quem faltou.`, brl(v), { rotulo: 'Ver os casos', leadIds: ids });
  }
  const atr2 = tarefas.filter((t) => t.situacao === 'atrasada' && t.atraso >= 2);
  if (atr2.length) add('atencao', `${atr2.length} ${atr2.length === 1 ? 'passo atrasado' : 'passos atrasados'} há 2 dias ou mais`, 'Cada dia de atraso reduz a chance de resposta e tira o lead do ritmo da cadência. Priorize estes antes dos leads novos.', `${atr2.length} atrasados`, { rotulo: 'Ver os leads', leadIds: atr2.map((t) => t.leadId) });
  if (excedidos.length) add('atencao', `${excedidos.length} ${excedidos.length === 1 ? 'lead passou' : 'leads passaram'} do limite de dias da etapa`, 'Em aberto vale 1 dia, Sem retorno 10 e Em negociação 15. Decida: avançar, agendar ou descartar com motivo.', brl(soma(excedidos.map((l) => l.valor))), { rotulo: 'Ver os leads', leadIds: excedidos.map((l) => l.id) });
  if (restaH > 0 && ritmo !== null && pendentes >= 4) add(ritmo > 6 ? 'atencao' : 'info', `Ritmo do dia: ${fmt(ritmo)} tarefas por hora`, `Restam ${fmt(restaH)} h de janela de contato (até ${LIMITES.janelaFimH}h) e ${pendentes} tarefas pendentes.${ritmo > 6 ? ' É um ritmo puxado: comece pelas de maior valor.' : ''}`, `${pendentes} em ${fmt(restaH)} h`);
  else if (restaH === 0 && pendentes) add('info', 'Janela de contato encerrada', `Foram feitas ${feitasHoje} tarefas hoje e ${pendentes} ficam para amanhã. O contato só é permitido entre ${LIMITES.janelaInicioH}h e ${LIMITES.janelaFimH}h.`, `${pendentes} para amanhã`);
  const liga = ativosL.filter((l) => l.status === 'aberto' && l.valor > LIMITES.ligacaoAcimaDe);
  if (liga.length) add('info', `${liga.length} ${liga.length === 1 ? 'orçamento alto exige' : 'orçamentos altos exigem'} ligação`, `Acima de R$ ${LIMITES.ligacaoAcimaDe} o primeiro contato é WhatsApp e ligação. Juntos somam ${brl(soma(liga.map((l) => l.valor)))}.`, brl(soma(liga.map((l) => l.valor))), { rotulo: 'Ver os leads', leadIds: liga.map((l) => l.id) });
  if (quentes.length) add('bom', `${quentes.length} ${quentes.length === 1 ? 'lead quente' : 'leads quentes'}: respondeu nas últimas 48 h`, `Quem respondeu agora fecha mais rápido. Responda em minutos. Somam ${brl(soma(quentes.map((q) => q.valor)))} em negociação ou agendados.`, brl(soma(quentes.map((q) => q.valor))), { rotulo: 'Ver os leads', leadIds: quentes.map((q) => q.id) });
  const totResp = soma(respPorHora);
  if (totResp >= 10) {
    const pico = respPorHora.indexOf(Math.max(...respPorHora));
    const janela = [pico, pico + 1].map((h) => respPorHora[h % 24]);
    add('info', `Pacientes respondem mais por volta das ${String(pico).padStart(2, '0')}h`, `${fmt(porcento(Math.max(...respPorHora) + (janela[1] ?? 0), totResp), 0)}% das respostas dos últimos 90 dias chegam entre ${String(pico).padStart(2, '0')}h e ${String((pico + 2) % 24).padStart(2, '0')}h. Agende os contatos mais importantes para antes desse horário.`, `${String(pico).padStart(2, '0')}h`);
  }
  const fl = funil.slice(1).filter((f) => f.perda >= 20 && funil[0].n >= 10).sort((a, b) => b.perda - a.perda)[0];
  if (fl) { const i = funil.indexOf(fl); add('atencao', `Maior perda do funil: de "${funil[i - 1].etapa}" para "${fl.etapa}"`, `${fmt(fl.perda, 0)}% dos leads se perdem nesta passagem (90 dias). É onde mais vale revisar a abordagem.`, `−${fmt(fl.perda, 0)}%`); }
  const msgs = mensagens.filter((m) => m.enviadas >= 5 && m.taxa !== null);
  if (msgs.length >= 3) {
    const mediaTaxa = porcento(soma(msgs.map((m) => m.respostas)), soma(msgs.map((m) => m.enviadas)));
    const pior = [...msgs].sort((a, b) => a.taxa! - b.taxa!)[0], melhor = [...msgs].sort((a, b) => b.taxa! - a.taxa!)[0];
    if (pior.taxa! < mediaTaxa * 0.6) add('atencao', `A mensagem ${pior.n} (${pior.titulo}) responde pouco`, `Taxa de resposta de ${fmt(pior.taxa!, 0)}% contra a média de ${fmt(mediaTaxa, 0)}%. Vale testar outro texto ou outro horário de envio.`, `${fmt(pior.taxa!, 0)}%`);
    if (melhor.taxa! > mediaTaxa * 1.4) add('bom', `A mensagem ${melhor.n} (${melhor.titulo}) é a que mais responde`, `${fmt(melhor.taxa!, 0)}% de resposta, bem acima da média de ${fmt(mediaTaxa, 0)}%. Use o jeito dela como modelo para as outras.`, `${fmt(melhor.taxa!, 0)}%`);
  }
  const totDesc = soma(descartes.map((x) => x.n));
  if (totDesc >= 5 && descartes[0] && porcento(descartes[0].n, totDesc) >= 40) add('info', `Principal motivo de descarte: ${descartes[0].motivo}`, `${fmt(porcento(descartes[0].n, totDesc), 0)}% dos descartes (${brl(descartes[0].valor)} em orçamentos) têm esse motivo.${descartes[0].motivo === 'Preço' ? ' A mensagem de desconto (Msg 3) e a condição da Msg 7 ajudam aqui.' : ''}`, `${descartes[0].n} descartes`);
  const reat = leads.filter((l) => vistas.get(l.id)?.reativacao?.situacao === 'aberta' && !l.reativacaoTentada);
  if (reat.length) add('info', `${reat.length} ${reat.length === 1 ? 'lead elegível' : 'leads elegíveis'} para reativação`, `Estão na janela de 30 a 60 dias após o descarte. Envie a mensagem 11 com a condição da campanha do mês.`, brl(soma(reat.map((l) => l.valor))), { rotulo: 'Ver os leads', leadIds: reat.map((l) => l.id) });
  const semResp = ativosL.filter((l) => !l.atendente);
  if (semResp.length) add('atencao', `${semResp.length} ${semResp.length === 1 ? 'lead sem responsável' : 'leads sem responsável'}`, 'Sem dono, ninguém cobra o próximo passo. Atribua um responsável.', `${semResp.length} leads`, { rotulo: 'Ver os leads', leadIds: semResp.map((l) => l.id) });
  const atrTotal = equipe.reduce((s, e) => s + e.atrasadas, 0);
  const topAtr = [...equipe].sort((a, b) => b.atrasadas - a.atrasadas)[0];
  if (topAtr && atrTotal >= 4 && topAtr.atrasadas / atrTotal >= 0.6 && equipe.length > 1) add('atencao', `${topAtr.nome} concentra ${topAtr.atrasadas} dos ${atrTotal} atrasos`, 'Considere redistribuir alguns leads para equilibrar a carga.', `${topAtr.atrasadas} atrasos`);
  if (taxaConvAnt !== null && conv30 + desc30 >= 5 && conv30p + desc30p >= 5) {
    const dif = taxaConv - taxaConvAnt;
    if (dif >= 5) add('bom', 'A conversão subiu', `${fmt(taxaConv, 0)}% dos leads encerrados nos últimos 30 dias converteram, contra ${fmt(taxaConvAnt, 0)}% nos 30 dias anteriores.`, `+${fmt(dif, 0)} p.p.`);
    else if (dif <= -5) add('atencao', 'A conversão caiu', `${fmt(taxaConv, 0)}% nos últimos 30 dias contra ${fmt(taxaConvAnt, 0)}% nos 30 anteriores. Veja o funil e os motivos de descarte.`, `${fmt(dif, 0)} p.p.`);
  }
  const orig = origem.filter((o) => o.convertidos + o.descartados >= 5 && o.taxa !== null);
  if (orig.length >= 2) { const m = [...orig].sort((a, b) => b.taxa! - a.taxa!)[0]; add('info', `${m.nome} é a origem que mais converte`, `${fmt(m.taxa!, 0)}% dos leads encerrados de ${m.nome} viraram paciente, com ticket médio de ${brl(m.ticket)}.`, `${fmt(m.taxa!, 0)}%`); }
  if (!atrasadas && pendentes > 0) add('bom', 'Nenhum passo atrasado', 'Toda a cadência está em dia. Mantenha o ritmo.');
  if (leads.length && leads.length < 15) add('info', 'Poucos dados ainda', `Com ${leads.length} leads no CRM, os percentuais oscilam muito. As análises ficam mais confiáveis com o tempo.`);
  insights.sort((a, b) => ORDEM[a.nivel] - ORDEM[b.nivel]);

  return {
    hoje, kpis, progresso, funil, saidas90, atividade: { dias: dias14, ...ativ }, pipeline, aging, mensagens, respostasPorHora: respPorHora, contatosPorHora: contPorHora,
    descartes, origem, exames, equipe, valores, ciclo, quentes, proximos, insights,
  };
}
export type AnaliseHoje = ReturnType<typeof analisarHoje>;
