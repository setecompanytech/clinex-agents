import type { Evento } from '../logs/vercel.js';

/**
 * Motor de análise do BI: recebe os eventos do agente receptivo e devolve tudo já calculado para a tela.
 * Função pura (sem rede, sem disco, sem relógio escondido): mesma entrada, mesma saída.
 */

const HORA = 3_600_000;
const DIA = 24 * HORA;
const FUSO_H = -3; // Belém (America/Belem), sem horário de verão

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const txt = (v: unknown): string => (typeof v === 'string' ? v : '');
const quando = (e: Evento) => Date.parse(e.t);
const soma = (a: number[]) => a.reduce((x, y) => x + y, 0);
const porcento = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);
const arred = (v: number, casas = 1) => Math.round(v * 10 ** casas) / 10 ** casas;

function percentil(valores: number[], p: number): number | null {
  if (!valores.length) return null;
  const o = [...valores].sort((a, b) => a - b);
  return o[Math.min(o.length - 1, Math.floor((p / 100) * o.length))];
}
const mediana = (v: number[]) => percentil(v, 50);

function ranking<T>(itens: T[], chave: (x: T) => string | undefined, topo = 10): { nome: string; n: number }[] {
  const m = new Map<string, number>();
  for (const i of itens) {
    const k = chave(i);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([nome, n]) => ({ nome, n })).sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome)).slice(0, topo);
}

const local = (t: number) => new Date(t + FUSO_H * HORA); // ler sempre com getUTC*
const inicioDoDia = (t: number) => Math.floor((t + FUSO_H * HORA) / DIA) * DIA - FUSO_H * HORA;
const inicioDaHora = (t: number) => Math.floor((t + FUSO_H * HORA) / HORA) * HORA - FUSO_H * HORA;
const dd = (n: number) => String(n).padStart(2, '0');

// ----------------------------------------------------------------------------------------------- conversas

/** Funil único (roteiro e Amanda IA): o caminho do agendamento, igual ao fluxo do monitor de conversas. Índice = `estagio` da conversa. */
export const ETAPAS_FUNIL = [
  'Iniciou a conversa',
  'Serviço identificado',
  'Horários oferecidos',
  'Dados do paciente',
  'Agendamento confirmado',
];

/**
 * Posição do funil JÁ ALCANÇADA quando a conversa fica esperando o paciente em certa etapa (-1 = fora do funil: transferida, falha, etc.).
 * Ordem do agendamento: serviço -> unidade -> horário -> DADOS do paciente -> forma de pagamento -> agenda. Os textos vêm de `etapa()` em
 * src/agents/receptivo/script/engine.ts; combos e orçamento de exames também aparecem aqui.
 */
function posicaoEtapa(etapa: string): number {
  const e = etapa.toLowerCase();
  if (e.includes('segurança') || e.includes('transferida') || e.includes('falha ao consultar') || e.includes('ilegível')) return -1;
  if (e.startsWith('recepção') || e.includes('opções de serviço') || e.includes('esperando o pedido médico')) return 0;
  if (e.includes('confirmando o serviço')) return 1;
  if (e.includes('combos sugeridos') || e.includes('confirmando os exames') || e.includes('oferecendo a coleta')) return 2;
  if (e.includes('unidade')) return 2;
  if (e.includes('data e turno')) return 3;
  if (e.includes('cpf') || e.includes('paciente') || e.includes('cadastro')) return 4; // pedindo/consultando/confirmando os dados do paciente: o horário já foi escolhido
  if (e.includes('pagamento') || e.includes('comprovante')) return 5; // os dados já foram dados
  if (e.includes('concluindo o agendamento') || e.includes('decidindo a próxima etapa')) return 6; // pagamento resolvido (no combo, o primeiro agendamento já foi gravado)
  return -1;
}

type Turno = { t: number; paciente: string; amanda: string; etapa: string; gpt: string; transferiu: boolean; urgente: boolean; motivo?: string; semEnvio: boolean };
export type Status = 'agendada' | 'finalizada' | 'transferida' | 'emergencia' | 'abandonada' | 'andamento';
type Conversa = {
  id: string; inicio: number; fim: number; turnos: Turno[]; maxEtapa: number; etapaFinal: string;
  agendada: boolean; tAgendou?: number; simulada: boolean; transferida: boolean; tTransferiu?: number; urgente: boolean;
  motivo?: string; retomou: boolean; problemas: number; status: Status;
  /** fluxo (leadflow): 0 entrou, 1 serviço identificado, 2 horários oferecidos, 3 dados do paciente, 4 agendou */
  estagio: number; motor: 'ia' | 'roteiro';
};

const ABANDONO_MS = 2 * HORA;

/**
 * Até onde a conversa chegou no caminho do agendamento (o leadflow do monitor): 0 entrou, 1 serviço identificado, 2 horários oferecidos,
 * 3 dados do paciente, 4 agendou. Roteiro: pela etapa (posicaoEtapa). Amanda IA: pelas ferramentas que ela usou com resultado.
 */
function estagioDoFluxo(c: { agendada: boolean; maxEtapa: number }, evs: Evento[]): number {
  if (c.agendada) return 4;
  let e = c.maxEtapa >= 4 ? 3 : c.maxEtapa >= 3 ? 2 : c.maxEtapa >= 1 ? 1 : 0;
  for (const ev of evs) {
    const fs = Array.isArray(ev.ferramentas) ? (ev.ferramentas as { nome?: string; res?: string }[]) : [];
    for (const f of fs) {
      const res = String(f.res ?? '');
      if (f.nome === 'agendar' || f.nome === 'buscar_paciente') e = Math.max(e, 3);
      else if (f.nome === 'ver_horarios' && res.includes('horario_id')) e = Math.max(e, 2);
      else if (/"resultado":"servico"/.test(res) || (f.nome === 'orcar_exames' && res.includes('"exame"'))) e = Math.max(e, 1);
    }
  }
  return e;
}

export function construirConversas(eventos: Evento[], ate: number): Conversa[] {
  const porId = new Map<string, Evento[]>();
  for (const e of eventos) if (e.atendimento) (porId.get(e.atendimento) ?? porId.set(e.atendimento, []).get(e.atendimento)!).push(e);
  const out: Conversa[] = [];
  for (const [id, evs] of porId) {
    evs.sort((a, b) => quando(a) - quando(b));
    const turnos: Turno[] = evs.filter((e) => e.evt === 'resposta').map((e) => ({
      t: quando(e), paciente: txt(e.paciente_disse), amanda: txt(e.enviado) || txt(e.roteiro), etapa: txt(e.etapa), gpt: txt(e.gpt),
      transferiu: e.transferiu === true, urgente: txt(e.etapa).includes('segurança'), motivo: txt(e.motivo_transferencia) || undefined,
      semEnvio: e.enviou_de_verdade === false,
    }));
    if (!turnos.length) continue;
    const ag = turnos.find((t) => t.amanda.includes('Agendamento confirmado'));
    const tr = turnos.find((t) => t.transferiu);
    const ultimo = turnos[turnos.length - 1];
    const c: Conversa = {
      id, inicio: turnos[0].t, fim: ultimo.t, turnos,
      maxEtapa: Math.max(-1, ...turnos.map((t) => posicaoEtapa(t.etapa))),
      etapaFinal: ultimo.etapa,
      agendada: Boolean(ag), tAgendou: ag?.t,
      simulada: turnos.some((t) => t.amanda.includes('Simulação: nada foi agendado')),
      transferida: Boolean(tr), tTransferiu: tr?.t, urgente: turnos.some((t) => t.urgente), motivo: tr?.motivo,
      retomou: evs.some((e) => e.retomou_da_fila === true),
      estagio: 0, motor: evs.some((e) => e.motor === 'ia') ? 'ia' : 'roteiro',
      problemas: evs.filter((e) => e.evt === 'erro' || e.ok === false).length,
      status: 'andamento',
    };
    c.estagio = estagioDoFluxo(c, evs);
    c.status = c.agendada ? 'agendada' : c.urgente ? 'emergencia' : c.transferida ? 'transferida'
      : ultimo.etapa.includes('concluída') || ultimo.etapa === 'IA: encerrou' ? 'finalizada' : ate - c.fim > ABANDONO_MS ? 'abandonada' : 'andamento';
    out.push(c);
  }
  return out;
}

function kpisDe(convs: Conversa[], eventos: Evento[]) {
  const n = convs.length;
  const duracoes = convs.filter((c) => c.turnos.length >= 2).map((c) => (c.fim - c.inicio) / 60_000);
  return {
    conversas: n,
    agendamentos: convs.filter((c) => c.agendada).length,
    conversao: porcento(convs.filter((c) => c.agendada).length, n),
    autonomia: n ? porcento(convs.filter((c) => !c.transferida).length, n) : 0,
    transferencias: convs.filter((c) => c.transferida).length,
    mensagens: n ? soma(convs.map((c) => c.turnos.length)) / n : 0,
    duracaoMin: mediana(duracoes) ?? 0,
    erros: eventos.filter((e) => e.evt === 'erro').length,
  };
}
type Kpis = ReturnType<typeof kpisDe>;

// ----------------------------------------------------------------------------------------------- integrações

function integracao(nome: string, evs: Evento[], falhou: (e: Evento) => boolean, chave: (e: Evento) => string | undefined = () => undefined) {
  const chamadas = evs.filter((e) => e.cache !== true);
  const ms = chamadas.map((e) => num(e.ms)).filter((v): v is number => v !== undefined);
  const falhas = chamadas.filter(falhou);
  return {
    nome, chamadas: chamadas.length, falhas: falhas.length,
    okPct: chamadas.length ? arred(100 - porcento(falhas.length, chamadas.length)) : null,
    p50: percentil(ms, 50), p95: percentil(ms, 95), max: ms.length ? Math.max(...ms) : null,
    cache: evs.length - chamadas.length,
    erros: ranking(falhas, (e) => txt(e.erro) || txt(e.motivo) || (num(e.status) ? `HTTP ${e.status}` : '') || chave(e) || 'falha sem detalhe', 3),
  };
}

function endpoints(evs: Evento[], prefixo: string) {
  const m = new Map<string, { ms: number[]; n: number; falhas: number }>();
  for (const e of evs) {
    if (e.cache === true) continue;
    const k = `${txt(e.metodo) || 'GET'} ${txt(e.caminho) || '?'}`;
    const x = m.get(k) ?? { ms: [], n: 0, falhas: 0 };
    x.n++;
    if (e.ok === false) x.falhas++;
    const v = num(e.ms);
    if (v !== undefined) x.ms.push(v);
    m.set(k, x);
  }
  return [...m.entries()].map(([rotulo, x]) => ({ origem: prefixo, rotulo, n: x.n, falhas: x.falhas, p50: percentil(x.ms, 50), p95: percentil(x.ms, 95) }))
    .sort((a, b) => b.n - a.n).slice(0, 8);
}

// ----------------------------------------------------------------------------------------------- texto

const STOP = new Set(('oi ola bom boa dia tarde noite quero queria gostaria gostaríamos preciso precisava para fazer agendar marcar saber sobre voces vcs favor pode poderia ' +
  'tudo bem como esta estao tem com uma uns umas que por mais essa esse isso minha meu tenho estou ainda hoje amanha valor preco quanto custa informacao informacoes ' +
  'gostaria queria uma uns dos das nos nas aqui ali pra pro voce vc sim nao obrigado obrigada horario horarios fazem atendem vaga vagas disponivel disponiveis ' +
  'semana proxima proximo possivel consegue conseguem fazer marcado marcada ').split(' '));

function termos(frases: string[]): { nome: string; n: number }[] {
  const m = new Map<string, number>();
  for (const f of frases) {
    const vistos = new Set<string>();
    for (const w of f.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z]+/)) {
      if (w.length < 4 || STOP.has(w) || vistos.has(w)) continue;
      vistos.add(w);
      m.set(w, (m.get(w) ?? 0) + 1);
    }
  }
  return [...m.entries()].map(([nome, n]) => ({ nome, n })).filter((x) => x.n >= 2).sort((a, b) => b.n - a.n).slice(0, 12);
}

function categoriaMotivo(motivo: string, urgente: boolean): string {
  const m = motivo.toLowerCase();
  if (urgente || /urg[eê]ncia|emerg[eê]ncia|crise|seguran[cç]a/.test(m)) return 'Segurança (emergência/crise)';
  if (/trava de veracidade/.test(m)) return 'Trava de veracidade (dado não confirmado)';
  if (/escrito [àa] m[aã]o|manuscrit/.test(m)) return 'Pedido escrito à mão';
  if (/or[cç]amento/.test(m)) return 'Orçamento (equipe monta)';
  if (/link de cr[eé]dito/.test(m)) return 'Pagamento por link de crédito';
  if (/n[aã]o conseguiu entender|2 tentativas/.test(m)) return 'Não entendeu após 2 tentativas';
  if (/resultado|remarc|cancel|laudo|atestado|documento/.test(m)) return 'Resultado, remarcação ou documentos';
  if (/conv[eê]nio|extern/.test(m)) return 'Convênio ou serviço externo';
  if (/bloqueio|falha|clinilink|erro|n[aã]o consegu/.test(m)) return 'Falha técnica';
  if (/humano|atendente|pessoa|equipe|pediu/.test(m)) return 'Paciente pediu atendente';
  if (/comprovante|pix|pagamento/.test(m)) return 'Pagamento / comprovante';
  if (/cadastro|cpf|paciente/.test(m)) return 'Cadastro / identificação';
  if (/n[aã]o entend|confus|repet/.test(m)) return 'Não entendeu o paciente';
  return 'Outros motivos';
}

/** Por que a Amanda não entrou numa conversa. null = detalhe interno (mensagem juntada, resposta já enviada), não é falta de cobertura. */
function categoriaIgnorado(motivo: string): string | null {
  const m = motivo.toLowerCase();
  if (/a amanda assume|o.s. gerada|j[aá] estava no setor de destino|lembrete|retomou/.test(m)) return null;
  if (/mensagem mais nova|j[aá] [eé] de sa[ií]da|n[aã]o duplica|enquanto a resposta|sem turno|sem mensagens|roteiro sem resposta|ia sem resposta|demorou demais/.test(m)) return null;
  if (/atendente humano/.test(m)) return 'Atendente humano já atribuído';
  if (/setor .*!= setor da ia|fora da whitelist|n[aã]o atende ningu/.test(m)) return 'Fora do setor da IA';
  if (/mensagem autom[aá]tica/.test(m)) return 'Resposta a mensagem automática da clínica';
  if (/equipe|fila da equipe|transferida a pedido/.test(m)) return 'Conversa já com a equipe';
  if (/grupo/.test(m)) return 'Grupo';
  if (/agradecimento depois da despedida|encerrou|finalizado/.test(m)) return null;
  return 'Outros';
}

// ----------------------------------------------------------------------------------------------- insights

export type Insight = { nivel: 'critico' | 'atencao' | 'info' | 'bom'; titulo: string; texto: string; metrica?: string };
const ORDEM: Record<Insight['nivel'], number> = { critico: 0, atencao: 1, info: 2, bom: 3 };
const f1 = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const f0 = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const seg = (ms: number) => (ms >= 1000 ? `${f1(ms / 1000)} s` : `${f0(ms)} ms`);

// ----------------------------------------------------------------------------------------------- principal

export type Opcoes = { desde: number; ate: number; rotulo: string; fonte: { tipo: 'real' | 'demo'; origens: string[]; avisos: string[] } };

export function analisar(todos: Evento[], o: Opcoes) {
  const duracao = o.ate - o.desde;
  const antesDesde = o.desde - duracao;
  const naJanela = todos.filter((e) => { const t = quando(e); return t >= o.desde && t <= o.ate; });
  const naAnterior = todos.filter((e) => { const t = quando(e); return t >= antesDesde && t < o.desde; });

  const convsTodas = construirConversas(todos.filter((e) => quando(e) >= antesDesde - DIA && quando(e) <= o.ate), o.ate);
  const convs = convsTodas.filter((c) => c.inicio >= o.desde && c.inicio <= o.ate);
  const convsAnt = convsTodas.filter((c) => c.inicio >= antesDesde && c.inicio < o.desde);
  const k = kpisDe(convs, naJanela);
  const temAnterior = convsAnt.length > 0;
  const kAnt: Kpis | null = temAnterior ? kpisDe(convsAnt, naAnterior) : null;

  const turnos = convs.flatMap((c) => c.turnos);
  const respostas = naJanela.filter((e) => e.evt === 'resposta');

  // ---- série no tempo (por hora até 48 h, depois por dia)
  const porHora = duracao <= 48 * HORA;
  const passo = porHora ? HORA : DIA;
  const base = porHora ? inicioDaHora : inicioDoDia;
  const serie: { t: number; rotulo: string; conversas: number; agendamentos: number; transferencias: number }[] = [];
  const idx = new Map<number, number>();
  for (let t = base(o.desde); t <= o.ate; t += passo) {
    const d = local(t);
    idx.set(t, serie.length);
    serie.push({ t, rotulo: porHora ? `${dd(d.getUTCHours())}h` : `${dd(d.getUTCDate())}/${dd(d.getUTCMonth() + 1)}`, conversas: 0, agendamentos: 0, transferencias: 0 });
  }
  const em = (t: number) => serie[idx.get(base(t)) ?? -1];
  for (const c of convs) {
    const a = em(c.inicio); if (a) a.conversas++;
    if (c.tAgendou) { const b = em(c.tAgendou); if (b) b.agendamentos++; }
    if (c.tTransferiu) { const b = em(c.tTransferiu); if (b) b.transferencias++; }
  }

  // ---- horários de procura
  const horas = Array<number>(24).fill(0);
  const calor = Array.from({ length: 7 }, () => Array<number>(24).fill(0)); // [dia da semana 0=dom][hora]
  for (const c of convs) { const d = local(c.inicio); horas[d.getUTCHours()]++; calor[d.getUTCDay()][d.getUTCHours()]++; }

  // ---- funil
  const alcance = convs.map((c) => (c.agendada ? ETAPAS_FUNIL.length - 1 : c.estagio));
  const funil = ETAPAS_FUNIL.map((etapa, i) => {
    const chegaram = i === 0 ? convs.length : alcance.filter((a) => a >= i).length;
    return { etapa, chegaram, pct: arred(porcento(chegaram, convs.length)) };
  }).map((f, i, a) => ({ ...f, perdaPct: i === 0 || a[i - 1].chegaram === 0 ? 0 : arred(100 - porcento(f.chegaram, a[i - 1].chegaram)) }));

  // ---- como terminam / onde param
  const status = ranking(convs, (c) => c.status, 6);
  const ondeParou = (c: Conversa) => (c.motor === 'ia' ? `Parou em "${ETAPAS_FUNIL[c.estagio]}"` : c.etapaFinal || 'sem etapa');
  const paradas = ranking(convs.filter((c) => c.status === 'abandonada'), ondeParou, 8);

  // ---- mensagens por conversa
  const faixas: [string, (n: number) => boolean][] = [['1', (x) => x === 1], ['2', (x) => x === 2], ['3', (x) => x === 3], ['4-5', (x) => x >= 4 && x <= 5], ['6-8', (x) => x >= 6 && x <= 8], ['9+', (x) => x >= 9]];
  const msgsDist = faixas.map(([faixa, ok]) => ({ faixa, n: convs.filter((c) => ok(c.turnos.length)).length }));

  // ---- transferências
  const trans = convs.filter((c) => c.transferida);
  const categorias = ranking(trans, (c) => categoriaMotivo(c.motivo ?? '', c.urgente), 8);
  const motivos = ranking(trans, (c) => (c.motivo ?? 'sem motivo registrado').replace(/\s+/g, ' ').slice(0, 110), 8);
  const transEtapa = ranking(trans, (c) => ETAPAS_FUNIL[c.agendada ? 4 : c.estagio], 6);

  // ---- integrações
  const por = (nome: string) => naJanela.filter((e) => e.evt === nome);
  const cl = por('clinilink'), ino = por('inovstar'), gptEv = por('gpt'), comp = por('comprovante'), inter = por('interpretar');
  const integracoes = [
    integracao('Clinilink · leitura', cl.filter((e) => txt(e.metodo) !== 'POST'), (e) => e.ok === false),
    integracao('Clinilink · gravação', cl.filter((e) => txt(e.metodo) === 'POST'), (e) => e.ok === false),
    integracao('Inovstar · WhatsApp', ino, (e) => e.ok === false),
    integracao('GPT · reescrita do tom', gptEv, (e) => e.status === 'falhou'),
    integracao('Leitura de comprovante', comp, (e) => Boolean(e.erro)),
    integracao('Intérprete de apoio (IA)', inter, (e) => Boolean(e.erro)),
  ].filter((i) => i.chamadas > 0 || i.cache > 0);
  const detalhes = [...endpoints(cl, 'Clinilink'), ...endpoints(ino, 'Inovstar')];

  // ---- GPT
  const gptRespostas = ranking(respostas, (e) => txt(e.gpt) || 'sem registro', 6);
  const gpt = {
    respostas: gptRespostas,
    chamadas: gptEv.length,
    msMedio: gptEv.filter((e) => e.status === 'usado').length ? Math.round(soma(gptEv.filter((e) => e.status === 'usado').map((e) => num(e.ms) ?? 0)) / gptEv.filter((e) => e.status === 'usado').length) : null,
    tokens: soma(gptEv.map((e) => num(e.tokens) ?? 0)),
    rejeicoes: ranking(gptEv.filter((e) => e.status === 'rejeitado'), (e) => txt(e.motivo).slice(0, 90) || 'sem motivo', 5),
  };

  // ---- comprovantes
  const compOk = comp.filter((e) => !e.erro);
  const comprovantes = {
    total: comp.length,
    status: ranking(comp, (e) => (e.erro ? 'erro de leitura' : txt(e.status) || 'sem status'), 6),
    tipos: ranking(compOk, (e) => txt(e.tipo) || undefined, 5),
    msMedio: comp.length ? Math.round(soma(comp.map((e) => num(e.ms) ?? 0)) / comp.length) : null,
  };

  // ---- intérprete
  const interpretador = {
    chamadas: inter.length,
    entendeu: inter.filter((e) => !e.erro && (num(e.indice) != null || e.primeiro || e.ultimo || e.mais || e.apartir || e.ate || e.hora || e.turno)).length,
    erros: inter.filter((e) => e.erro).length,
  };

  // ---- demanda
  const naoEncontrados = ranking(por('servico_nao_encontrado'), (e) => txt(e.termo).toLowerCase().trim().slice(0, 60) || undefined, 10);
  const precosInvalidos = ranking(por('preco_invalido'), (e) => txt(e.procedimento) || undefined, 5);
  const primeiras = convs.map((c) => c.turnos[0]?.paciente ?? '').filter((p) => p && !p.startsWith('['));
  const demanda = { naoEncontrados, precosInvalidos, termos: termos(primeiras) };

  // ---- ignorados e falhas
  const ignorados = ranking(por('ignorado'), (e) => categoriaIgnorado(txt(e.motivo)) ?? 'Mensagem juntada ou já respondida (interno)', 8);

  // ---- cobertura: de todos os atendimentos que chegaram, em quantos a Amanda entrou (e por que não nos outros)
  const porAtendimento = new Map<string, { respondeu: boolean; motivos: string[]; atendentes: string[] }>();
  for (const e of naJanela) {
    if (!e.atendimento || (e.evt !== 'ignorado' && e.evt !== 'resposta')) continue;
    const a = porAtendimento.get(String(e.atendimento)) ?? { respondeu: false, motivos: [], atendentes: [] };
    if (e.evt === 'resposta') a.respondeu = true;
    else { const cat = categoriaIgnorado(txt(e.motivo)); if (cat) a.motivos.push(cat); const u = /"user":"([^"]+)"/.exec(txt(e.motivo))?.[1]; if (u) a.atendentes.push(u); }
    porAtendimento.set(String(e.atendimento), a);
  }
  const atendimentos = [...porAtendimento.values()].filter((a) => a.respondeu || a.motivos.length);
  const semIA = atendimentos.filter((a) => !a.respondeu);
  const maisComum = (l: string[]) => ranking(l, (x) => x, 1)[0]?.nome;
  const cobertura = {
    atendimentos: atendimentos.length,
    comIA: atendimentos.length - semIA.length,
    pct: atendimentos.length ? arred(porcento(atendimentos.length - semIA.length, atendimentos.length)) : null,
    motivos: ranking(semIA, (a) => maisComum(a.motivos), 8),
    atendentes: ranking(semIA.filter((a) => a.atendentes.length), (a) => maisComum(a.atendentes), 8),
  };

  // ---- Amanda IA: tempo, ferramentas, travas, lembretes, finalizações e O.S.
  const respIA = respostas.filter((e) => e.motor === 'ia');
  const msIA = respIA.map((e) => num(e.ms_ia)).filter((v): v is number => v !== undefined);
  const usos = respIA.flatMap((e) => (Array.isArray(e.ferramentas) ? (e.ferramentas as { nome?: string; res?: string; ms?: number }[]) : []));
  const porFerramenta = new Map<string, { n: number; erros: number; ms: number[] }>();
  for (const f of usos) {
    const nome = txt(f.nome); if (!nome) continue;
    const x = porFerramenta.get(nome) ?? { n: 0, erros: 0, ms: [] };
    x.n++; if (/^\{"erro"/.test(txt(f.res))) x.erros++; const v = num(f.ms); if (v !== undefined) x.ms.push(v);
    porFerramenta.set(nome, x);
  }
  const msgErro = (re: RegExp) => naJanela.filter((e) => e.evt === 'erro' && re.test(txt(e.mensagem))).length;
  const motivoIgn = (re: RegExp) => naJanela.filter((e) => e.evt === 'ignorado' && re.test(txt(e.motivo))).length;
  const convIA = convs.filter((c) => c.motor === 'ia');
  const ia = {
    respostas: respIA.length,
    conversas: convIA.length,
    agendadas: convIA.filter((c) => c.agendada).length,
    msP50: percentil(msIA, 50), msP95: percentil(msIA, 95),
    modelos: ranking(respIA, (e) => txt(e.gpt_motivo).split(':')[0] || undefined, 3),
    ferramentas: [...porFerramenta.entries()].map(([nome, x]) => ({ nome, n: x.n, erros: x.erros, p50: percentil(x.ms, 50) })).sort((a, b) => b.n - a.n),
    semFerramenta: respIA.filter((e) => !Array.isArray(e.ferramentas) || !(e.ferramentas as unknown[]).length).length,
    trava: { refeitas: msgErro(/resposta com dado que n[aã]o veio/), bloqueadas: msgErro(/insistiu em dado/) },
    lembretes: por('lembrete').length,
    finalizados: motivoIgn(/atendimento finalizado/),
    os: { geradas: motivoIgn(/O\.S\. gerada/), falhas: msgErro(/O\.S\. n[aã]o foi gerada/) },
  };
  const falhas = naJanela
    .filter((e) => e.evt === 'erro' || ((e.evt === 'clinilink' || e.evt === 'inovstar') && e.ok === false) || (e.evt === 'gpt' && e.status === 'falhou') || (e.evt === 'comprovante' && e.erro))
    .sort((a, b) => quando(b) - quando(a)).slice(0, 30)
    .map((e) => ({
      t: quando(e), origem: e.evt, atendimento: e.atendimento ? String(e.atendimento).slice(-6) : undefined,
      mensagem: (txt(e.mensagem) || txt(e.erro) || txt(e.motivo) || [txt(e.metodo), txt(e.caminho), num(e.status) ? `→ ${e.status}` : ''].filter(Boolean).join(' ') || 'falha sem detalhe').slice(0, 220),
    }));

  const semEnvio = turnos.length > 0 && turnos.filter((t) => t.semEnvio).length / turnos.length > 0.5;

  // ---- conversas recentes (com a transcrição para o detalhe)
  const conversas = [...convs].sort((a, b) => b.fim - a.fim).slice(0, 80).map((c) => ({
    id: c.id.slice(-6), inicio: c.inicio, fim: c.fim, status: c.status, mensagens: c.turnos.length, etapaFinal: c.motor === 'ia' ? ETAPAS_FUNIL[c.agendada ? 4 : c.estagio] : c.etapaFinal, motor: c.motor,
    duracaoMin: arred((c.fim - c.inicio) / 60_000), motivo: c.motivo, problemas: c.problemas, retomou: c.retomou, simulada: c.simulada,
    turnos: c.turnos.slice(0, 40).map((t) => ({ t: t.t, paciente: t.paciente.slice(0, 320), amanda: t.amanda.slice(0, 520), etapa: t.etapa, gpt: t.gpt, transferiu: t.transferiu, motivo: t.motivo?.slice(0, 200) })),
  }));

  // ---- insights
  const insights: Insight[] = [];
  const add = (nivel: Insight['nivel'], titulo: string, texto: string, metrica?: string) => insights.push({ nivel, titulo, texto, metrica });
  const nC = convs.length;
  if (nC === 0) add('info', 'Ainda não há conversas neste período', 'Assim que a Amanda atender pacientes, tudo aparece aqui. Troque o período ou use a demonstração para conhecer a tela.');
  if (nC > 0 && nC < 15) add('info', 'Amostra pequena', `Só ${nC} conversas no período: percentuais oscilam muito com poucos casos. Olhe tendências com cuidado.`, `${nC} conversas`);
  if (semEnvio) add('atencao', 'Modo sombra: as respostas não estão sendo enviadas', 'Na maioria das respostas, AUTO_REPLY está desligado. O paciente não recebe a mensagem da Amanda.', 'AUTO_REPLY=false');
  if (nC >= 10) {
    if (kAnt && kAnt.conversas >= 10) {
      const d = k.conversao - kAnt.conversao;
      if (d >= 3) add('bom', 'A conversão subiu', `${f1(k.conversao)}% das conversas viraram agendamento, contra ${f1(kAnt.conversao)}% no período anterior.`, `+${f1(d)} p.p.`);
      else if (d <= -3) add('atencao', 'A conversão caiu', `${f1(k.conversao)}% das conversas viraram agendamento, contra ${f1(kAnt.conversao)}% no período anterior. Veja no funil em que etapa a perda aumentou.`, `${f1(d)} p.p.`);
    }
    const piores = funil.slice(1).filter((f) => f.perdaPct >= 15).sort((a, b) => b.perdaPct - a.perdaPct)[0];
    if (piores) {
      const i = funil.indexOf(piores);
      add(piores.perdaPct >= 30 ? 'atencao' : 'info', `Maior perda no funil: "${piores.etapa}"`,
        `${f0(piores.perdaPct)}% das conversas que chegaram em "${funil[i - 1].etapa}" não passaram para "${piores.etapa}". É onde mais vale melhorar a mensagem ou o roteiro.`, `−${f0(piores.perdaPct)}%`);
    }
    const falha = categorias.find((c) => c.nome === 'Falha técnica');
    if (falha && porcento(falha.n, nC) >= 3) add(porcento(falha.n, nC) >= 8 ? 'critico' : 'atencao', 'Transferências por falha técnica', `${falha.n} conversas foram para a equipe porque algo falhou (agenda, preço ou integração), ${f1(porcento(falha.n, nC))}% do total. Veja "Saúde das integrações".`, `${falha.n} conversas`);
    if (k.autonomia >= 85) add('bom', 'Alta autonomia', `${f1(k.autonomia)}% das conversas foram resolvidas sem chamar a equipe.`, `${f1(k.autonomia)}%`);
    else if (k.autonomia < 60) add('atencao', 'Muitas conversas vão para a equipe', `Só ${f1(k.autonomia)}% foram resolvidas sem transferir. O principal motivo: ${categorias[0]?.nome ?? 'não registrado'}.`, `${f1(100 - k.autonomia)}% transferidas`);
    const fora = horas.reduce((s, v, h) => s + (h < 8 || h >= 18 ? v : 0), 0);
    if (porcento(fora, nC) >= 20) add('info', 'Boa parte da procura acontece fora do expediente', `${f0(porcento(fora, nC))}% das conversas começam antes das 8h ou depois das 18h, quando a recepção normalmente está fechada. A Amanda está capturando essa demanda.`, `${fora} conversas`);
    const pico = horas.indexOf(Math.max(...horas));
    if (horas[pico] > 0) add('info', `Pico de procura às ${dd(pico)}h`, `${horas[pico]} conversas começaram nessa hora (${f0(porcento(horas[pico], nC))}% do total). Garanta equipe disponível para as transferências nesse horário.`, `${dd(pico)}h`);
    const ab = convs.filter((c) => c.status === 'abandonada').length;
    if (porcento(ab, nC) >= 25) add('atencao', 'Muitas conversas ficam sem resposta do paciente', `${f0(porcento(ab, nC))}% das conversas pararam sem concluir nem transferir. ${paradas[0] ? `A etapa mais comum foi "${paradas[0].nome}".` : ''}`, `${ab} abandonadas`);
  }
  if (naoEncontrados[0] && naoEncontrados[0].n >= 2) add('atencao', 'Pacientes pedem serviços que a Amanda não achou', `"${naoEncontrados[0].nome}" apareceu ${naoEncontrados[0].n} vezes sem correspondência no Clinilink${naoEncontrados[1] ? `, e "${naoEncontrados[1].nome}" ${naoEncontrados[1].n}` : ''}. Vale cadastrar ou criar um sinônimo.`, `${soma(naoEncontrados.map((x) => x.n))} buscas sem resultado`);
  if (precosInvalidos.length) add('critico', 'Procedimentos com preço inválido no Clinilink', `${precosInvalidos.map((p) => `"${p.nome}"`).slice(0, 3).join(', ')} chegou sem preço válido. A Amanda bloqueia a mensagem e transfere, o que custa agendamentos.`, `${soma(precosInvalidos.map((x) => x.n))} ocorrências`);
  const lerClin = integracoes.find((i) => i.nome === 'Clinilink · leitura');
  if (lerClin && lerClin.chamadas >= 20) {
    if ((lerClin.p95 ?? 0) >= 4000) add('atencao', 'Clinilink está lento', `Uma em cada vinte consultas demora ${seg(lerClin.p95!)} ou mais. O paciente espera a Amanda responder.`, `p95 ${seg(lerClin.p95!)}`);
    if ((lerClin.okPct ?? 100) < 97) add((lerClin.okPct ?? 100) < 90 ? 'critico' : 'atencao', 'Falhas ao consultar o Clinilink', `${f1(100 - (lerClin.okPct ?? 100))}% das consultas falharam.${lerClin.erros[0] ? ` Erro mais comum: ${lerClin.erros[0].nome}.` : ''}`, `${f1(lerClin.okPct ?? 0)}% de sucesso`);
  }
  const gravar = integracoes.find((i) => i.nome === 'Clinilink · gravação');
  if (gravar && gravar.falhas > 0) add('critico', 'Falhas ao gravar no Clinilink', `${gravar.falhas} gravações (cadastro ou agendamento) falharam. Confira se algum paciente ficou sem horário reservado.${gravar.erros[0] ? ` Erro: ${gravar.erros[0].nome}.` : ''}`, `${gravar.falhas} falhas`);
  const rej = gptRespostas.find((x) => x.nome === 'rejeitado');
  const totalGpt = soma(gptRespostas.map((x) => x.n));
  if (rej && totalGpt >= 20 && porcento(rej.n, totalGpt) >= 12) add('atencao', 'O GPT está sendo rejeitado com frequência', `${f0(porcento(rej.n, totalGpt))}% das reescritas foram descartadas pela validação e a Amanda usou o texto fixo do roteiro.`, `${rej.n} rejeitadas`);
  const compProb = comprovantes.status.filter((s) => s.nome !== 'concluído' && s.nome !== 'concluido' && s.nome !== 'ok');
  if (comprovantes.total >= 5 && porcento(soma(compProb.map((x) => x.n)), comprovantes.total) >= 30) add('atencao', 'Muitos comprovantes de pix não passam na leitura', `${f0(porcento(soma(compProb.map((x) => x.n)), comprovantes.total))}% das leituras não validaram (ilegível, valor ou data divergente). Esses pacientes caem na equipe.`, `${soma(compProb.map((x) => x.n))} de ${comprovantes.total}`);
  if (cobertura.atendimentos >= 10 && cobertura.pct !== null && cobertura.pct < 50) add('atencao', 'A Amanda entra em poucas conversas', `Ela atendeu ${cobertura.comIA} de ${cobertura.atendimentos} atendimentos que chegaram (${f0(cobertura.pct)}%). Principal motivo de não entrar: ${cobertura.motivos[0]?.nome ?? 'não registrado'}.`, `${f0(cobertura.pct)}% de cobertura`);
  if (ia.trava.bloqueadas > 0) add('atencao', 'Respostas bloqueadas pela trava de veracidade', `${ia.trava.bloqueadas} resposta(s) da IA citavam médico, valor ou horário que não veio do Clinilink e foram trocadas por transferência para a equipe.`, `${ia.trava.bloqueadas} bloqueadas`);
  const ferrErro = ia.ferramentas.filter((f) => f.n >= 5 && f.erros / f.n >= 0.3)[0];
  if (ferrErro) add('info', `Ferramenta "${ferrErro.nome}" com muitas recusas`, `${ferrErro.erros} de ${ferrErro.n} chamadas devolveram erro (regras da clínica barrando, dado faltando ou id errado). Vale olhar as conversas.`, `${ferrErro.erros} recusas`);
  if (k.erros > 0) add(k.erros >= 5 ? 'atencao' : 'info', `${k.erros} ${k.erros === 1 ? 'erro registrado' : 'erros registrados'}`, `Veja a lista em "Falhas recentes" para entender a causa.`, `${k.erros} erros`);
  if (nC >= 10 && !insights.some((i) => i.nivel === 'critico' || i.nivel === 'atencao')) add('bom', 'Nenhum alerta no período', 'Funil, transferências e integrações dentro do esperado.');
  insights.sort((a, b) => ORDEM[a.nivel] - ORDEM[b.nivel]);

  return {
    geradoEm: Date.now(),
    periodo: { desde: o.desde, ate: o.ate, rotulo: o.rotulo, porHora },
    fonte: { ...o.fonte, eventos: naJanela.length, modoSombra: semEnvio },
    kpis: { atual: k, anterior: kAnt },
    serie, horas, calor, funil, status, paradas, msgsDist,
    transferencias: { total: trans.length, categorias, motivos, porEtapa: transEtapa },
    integracoes, detalhes, gpt, comprovantes, interpretador, demanda, ignorados, falhas, cobertura, ia,
    conversas, insights,
  };
}

export type BI = ReturnType<typeof analisar>;
