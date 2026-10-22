import { criarAgendamento, criarPaciente, demandaPorProcedimento, getPacientePorCpf, listAgendamentosDoDia, listAgenda, listAgendaFresca, listClinicas, listProcedimentos, listProfissionais, type Clinica, type Horario, type Procedimento } from '../../../integrations/clinilink.js';
import { env } from '../../../lib/env.js';
import { exibir, prepararGeneros } from '../../../lib/genero.js';
import { evt } from '../../../lib/log.js';
import { RAIZES, type PedidoReserva, type ResultadoReserva, type Descoberta, type Fonte, type Periodo, type Servico, type Slot, type Unidade } from './catalog.js';

/** Fonte REAL: unidades, médicos, preços, agenda e pacientes vêm do Clinilink. Reservar/cadastrar só com credencial rw. */

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const titulo = (s: string) => s.toLocaleLowerCase('pt-BR').replace(/(^|[\s-])(\p{L})/gu, (_m, a, b) => a + b.toLocaleUpperCase('pt-BR')).replace(/\b(De|Da|Do|Dos|Das|E)\b/g, (x) => x.toLowerCase());
const reais = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** "CLINEX GUAMÁ" -> "Guamá" */
const nomeUnidade = (c: Clinica) => { const n = titulo(c.nome.replace(/^clinex\s+/i, '')); return /^telegrafo$/i.test(n) ? 'Telégrafo' : n; };
const STOP = new Set(['quero', 'preciso', 'gostaria', 'marcar', 'agendar', 'consulta', 'exame', 'fazer', 'saber', 'sobre', 'para', 'com', 'uma', 'umas', 'amanha', 'hoje', 'tarde', 'manha', 'noite', 'valor', 'preco', 'quanto', 'custa', 'tenho', 'horario', 'vaga', 'dia', 'semana', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo', 'obrigado', 'obrigada', 'por', 'favor', 'voces', 'tem', 'teste', 'informacao', 'informacoes', 'duvida', 'duvidas', 'ajuda', 'atendimento', 'pergunta', 'gostaria', 'queria']);

const hojeYmd = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: env.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const somaDias = (ymd: string, n: number) => { const [y, m, d] = ymd.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d)); dt.setUTCDate(dt.getUTCDate() + n); return dt.toISOString().slice(0, 10); };
const periodoDe = (inicio?: string): Periodo => (inicio && inicio < '12:00' ? 'manhã' : 'tarde');

type Cand = { proc: Procedimento; clinicas: Clinica[] };
const conhecidos = new Map<string, Cand>(); // procedimentoId -> candidato (preenchido por descobrir, lido por resolver)
const unidadesPorId = new Map<string, Clinica>();

/** Prefere "consulta"; descarta "retorno"; dá peso grande se o paciente citou uma palavra específica do nome (ex.: ecocardiograma). */
function pontuar(p: Procedimento, texto = '') {
  const n = norm(p.nome);
  const citou = n.split(/[^a-z]+/).some((w) => w.length >= 7 && w !== 'consulta' && texto.includes(w));
  return (n.includes('consulta') ? 2 : 0) + (p.categoria && /consulta/i.test(p.categoria) ? 1 : 0) - (/^retorno|\bretorno\b/.test(n) ? 5 : 0) + (citou ? 6 : 0);
}

/** Hoje o começo da agenda (ex.: 14h) já passou: vale o primeiro horário livre que sobrou. Nos outros dias, o começo da agenda (ordem de chegada). */
const inicioMostrado = (h: Horario) => { const bloco = h.agendaHoraInicio ?? h.hora; return h.data === hojeYmd() && h.hora > bloco ? h.hora : bloco; };
const slotDe = (h: Horario): Slot => {
  const inicio = inicioMostrado(h);
  return { ymd: h.data, turno: periodoDe(h.agendaHoraInicio ?? h.hora), inicio, profissional: nomeDePessoa(h.profissional?.nome), profissionalId: h.profissional?.id, profissionalBruto: h.profissional?.nome };
};
/** Um slot por (data, período): várias horas de uma mesma agenda viram um único período. */
function agrupar(horarios: Horario[]): Slot[] {
  const ordenados = [...horarios].sort((a, b) => (a.data + (a.agendaHoraInicio ?? a.hora) + a.hora).localeCompare(b.data + (b.agendaHoraInicio ?? b.hora) + b.hora));
  const vistos = new Set<string>(); const out: Slot[] = [];
  for (const h of ordenados) { const s = slotDe(h); const k = `${s.ymd}|${s.turno}`; if (!vistos.has(k)) { vistos.add(k); out.push(s); } }
  return out;
}

/** Preço do procedimento = SEMPRE o campo `preco` do Clinilink (nunca `precoDinheiro`). Só vale número maior que zero; senão, não há preço para citar. */
export const precoDe = (p: Pick<Procedimento, 'preco'>): number | undefined => (typeof p.preco === 'number' && Number.isFinite(p.preco) && p.preco > 0 ? p.preco : undefined);

/** Orientação de preparo cadastrada: só vale texto de verdade (o cadastro tem "0" e vazios). */
const preparoUtil = (x?: string | null) => { const t = (x ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim(); return t.length > 3 && t !== '0' ? t : undefined; }; // mantém as quebras de linha do cadastro

async function montar(c: Cand, prof?: { id: string; nome: string }): Promise<Descoberta> {
  const ini = hojeYmd();
  const fim = somaDias(ini, 30);
  // unidade só conta como disponível com agenda confirmada nesta consulta
  const comAgenda: { u: Clinica; proc: Procedimento; medicos: string[] }[] = [];
  await Promise.all(c.clinicas.map(async (u) => {
    const h = await listAgenda({ unidadeId: u.id, dataInicial: ini, dataFinal: fim, procedimentoId: c.proc.id, profissionalId: prof?.id });
    if (h.length > 0) comAgenda.push({ u, proc: c.proc, medicos: prof ? [titulo(prof.nome)] : [...new Set(h.map((x) => x.profissional?.nome).filter((x): x is string => Boolean(x) && !ehSala(x)).map(titulo))].slice(0, 3) });
  }));
  const nome = titulo(c.proc.nome);
  if (comAgenda.length === 0) return { semAgenda: nome };
  await prepararGeneros([prof?.nome, ...comAgenda.flatMap((x) => x.medicos)]); // Dr./Dra. nas frases
  comAgenda.sort((a, b) => a.u.nome.localeCompare(b.u.nome));
  comAgenda.forEach(({ u }) => unidadesPorId.set(u.id, u));

  // preço: SEMPRE o campo preco do Clinilink (o campo `precoDinheiro` não é usado em nada). Zero ou ausente = não definido: nunca vira "R$ 0,00".
  // Um valor se for igual nas unidades, senão por unidade. Sem valor, não cita.
  const porUnidade = new Map<string, string>();
  for (const { u, proc } of comAgenda) {
    const valor = precoDe(proc);
    if (valor === undefined) evt('preco_invalido', { procedimento: proc.nome, unidade: nomeUnidade(u), preco: proc.preco ?? null });
    else porUnidade.set(nomeUnidade(u), reais(valor));
  }
  const valores = [...new Set(porUnidade.values())];
  const consulta = /consulta/i.test(c.proc.nome) || /consulta/i.test(c.proc.categoria ?? '');
  const sujeito = consulta ? 'A consulta' : 'O exame';
  const precoTexto = valores.length === 0 ? '' : valores.length === 1 ? `${sujeito} é ${valores[0]}.` : `${[...porUnidade].map(([u, v]) => `No ${u} ${sujeito.toLowerCase()} é ${v}`).join('. ')}.`;

  const servico: Servico = {
    id: c.proc.id, nome, tipo: consulta ? 'consulta' : 'exame',
    frase: `${nome.replace(/^Consulta\b/, 'consulta')}${prof ? ` com ${exibir(prof.nome, { artigo: true })}` : ''}`,
    profissional: prof ? { id: prof.id, nome: titulo(prof.nome) } : undefined,
    unidades: comAgenda.map(({ u, medicos, proc }): Unidade => ({ id: u.id, nome: nomeUnidade(u), profissionais: medicos, precoPix: precoDe(proc), nomeBruto: u.nome, endereco: u.endereco, telefone: u.telefone })), precoTexto,
    nomeBruto: c.proc.nome,
    preparo: preparoUtil(c.proc.preparo),
  };
  return { servico };
}

// ---------------- profissionais: "quero com a dra Rebecca" ----------------
type ProfMerged = { id: string; nome: string; especialidade?: string; clinicas: Clinica[] };

/** Todos os profissionais com agenda ativa, juntando as unidades em que cada um atende. */
async function todosProfissionais(): Promise<ProfMerged[]> {
  const clinicas = await listClinicas();
  const mapa = new Map<string, ProfMerged>();
  await Promise.all(clinicas.map(async (c) => {
    for (const p of await listProfissionais(c.id).catch(() => [])) {
      const x = mapa.get(p.id) ?? { id: p.id, nome: p.nome, especialidade: p.especialidade, clinicas: [] };
      x.clinicas.push(c); mapa.set(p.id, x);
    }
  }));
  return [...mapa.values()];
}

const TRATAMENTO = /^(dr|dra|doutor|doutora|medico|medica|profissional|prof|professor|professora)$/;
const IGNORAR = new Set([...STOP, 'com', 'a', 'o', 'as', 'os', 'de', 'da', 'do', 'dos', 'das', 'um', 'pra', 'no', 'na', 'em', 'e', 'que', 'se', 'hora', 'horas', 'agenda', 'ver', 'vou', 'cedo', 'proxima', 'proximo', 'gostaria', 'atendimento']);

/** Palavras que parecem o NOME de uma pessoa: depois de "dr/dra/doutor(a)/médico(a)" ou de "com". */
function nomeCitado(t: string): { tokens: string[]; comTitulo: boolean } | undefined {
  const w = t.split(/[^a-z]+/).filter(Boolean);
  for (let i = 0; i < w.length; i++) {
    const ehTitulo = TRATAMENTO.test(w[i]);
    if (!ehTitulo && !(w[i] === 'com' && i + 1 < w.length)) continue;
    const tokens: string[] = [];
    for (let j = i + 1; j < w.length && tokens.length < 3; j++) {
      if (TRATAMENTO.test(w[j]) || w[j] === 'a' || w[j] === 'o') continue; // "com a dra rebecca"
      if (IGNORAR.has(w[j]) || w[j].length < 3 || RAIZES.some((r) => r.re.test(w[j]))) { if (tokens.length) break; continue; }
      tokens.push(w[j]);
    }
    if (tokens.length) return { tokens, comTitulo: ehTitulo || w.slice(i, i + 4).some((x) => TRATAMENTO.test(x)) };
  }
  return undefined;
}

/** Uma letra a mais, a menos, trocada ou duas vizinhas invertidas ("rebeca" ~ "rebecca", "ergoemtrico" ~ "ergometrico"). */
function perto(a: string, b: string): boolean {
  return Math.abs(a.length - b.length) <= 1 && distancia(a, b) <= 1;
}

/** Pontua quanto o nome da pessoa combina com o que o paciente escreveu: palavra igual = 2; parecida (erro de 1 letra ou começo) = 1. */
function pontuarNome(nome: string, tokens: string[]): number {
  const partes = norm(nome).split(/\s+/).filter((x) => x.length >= 2 && !/^(de|da|do|dos|das|e)$/.test(x));
  let pts = 0;
  for (const tk of tokens) {
    if (partes.includes(tk)) pts += 2;
    else if (tk.length >= 5 && partes.some((n) => (n.length >= 5 && perto(tk, n)) || n.startsWith(tk))) pts += 1;
  }
  return pts;
}

/** O atendimento da pessoa: pela especialidade dela acha a consulta e confirma que ela atende aquele procedimento. */
async function servicoDaProfissional(p: ProfMerged): Promise<Descoberta> {
  const esp = norm(p.especialidade ?? '');
  const raiz = RAIZES.find((r) => r.re.test(esp));
  // sem especialidade no cadastro: olha as consultas em geral e confere quais ela realmente atende
  const termos = raiz ? [raiz.busca, ...(raiz.alt ?? [])] : esp ? [esp.split(/\s+/)[0]] : ['consulta'];
  const cands = new Map<string, Procedimento>();
  for (const c of p.clinicas) for (const termo of termos) for (const pr of await listProcedimentos(c.id, termo).catch(() => [])) cands.set(pr.id, pr);
  const ordenados = [...cands.values()].sort((a, b) => pontuar(b) - pontuar(a)).slice(0, esp ? 4 : 12);
  for (const proc of ordenados) {
    // só conta o procedimento se a pessoa realmente atende ele em alguma unidade
    const unidades: Clinica[] = [];
    for (const c of p.clinicas) if ((await listProfissionais(c.id, proc.id).catch(() => [])).some((x) => x.id === p.id)) unidades.push(c);
    if (unidades.length === 0) continue;
    const cand: Cand = { proc, clinicas: unidades };
    conhecidos.set(proc.id, cand);
    const com = await montar(cand, { id: p.id, nome: p.nome });
    if (com && 'servico' in com) return com;
    // sem horários abertos para ela: oferece a mesma especialidade com outros profissionais
    const geral = await montar(cand);
    return { semAgendaProfissional: { nome: titulo(p.nome), alternativa: geral && 'servico' in geral ? geral.servico : undefined } };
  }
  return { semAgendaProfissional: { nome: titulo(p.nome) } };
}

/** Se a frase pede uma PESSOA pelo nome, acha quem é; senão devolve undefined e o fluxo normal (especialidade) segue. */
async function descobrirProfissional(t: string): Promise<Descoberta> {
  const citado = nomeCitado(t);
  if (!citado) return undefined;
  const pessoas = await todosProfissionais();
  const pont = pessoas.map((p) => ({ p, pts: pontuarNome(p.nome, citado.tokens) })).filter((x) => x.pts > 0).sort((a, b) => b.pts - a.pts);
  if (pont.length === 0) {
    // só afirma "não achei" quando o paciente deixou claro que pediu uma pessoa (dr/dra/doutor/médico) e não citou especialidade
    return citado.comTitulo && !RAIZES.some((r) => r.re.test(t)) ? { naoAchouProfissional: titulo(citado.tokens.join(' ')) } : undefined;
  }
  // empate no topo: pergunta qual
  const empatados = pont.filter((x) => x.pts === pont[0].pts);
  if (empatados.length > 1) {
    await prepararGeneros(empatados.slice(0, 4).map(({ p }) => p.nome));
    return { opcoes: empatados.slice(0, 4).map(({ p }) => ({ id: `prof:${p.id}`, nome: `${exibir(titulo(p.nome))}${p.especialidade ? ` (${p.especialidade})` : ''}` })) };
  }
  return servicoDaProfissional(pont[0].p);
}

// ---------------- similaridade no catálogo: "teste ergo", "ergometrio", "só teste" ----------------
/** Palavras que não identificam serviço nenhum (verbos, saudações, dias...). "teste" NÃO está aqui: ele pode ser o começo de "teste ergométrico". */
const SEM_VALOR = new Set([...STOP].filter((w) => w !== 'teste').concat(['ola', 'bom', 'boa', 'uma', 'umas', 'uns', 'pra', 'com', 'sem', 'ter', 'que', 'quer', 'queria', 'exames', 'vou', 'ver', 'info', 'minha', 'meu', 'esse', 'essa', 'isso', 'aqui', 'algum', 'alguma', 'qual', 'quais', 'onde', 'como', 'quando', 'custa', 'pode', 'poderia', 'possivel', 'agora', 'proxima', 'proximo', 'medico', 'medica', 'doutor', 'doutora', 'unidade', 'unidades', 'guama', 'telegrafo', 'clinica', 'clinex', 'tudo', 'mais', 'ainda', 'porque', 'tambem', 'muito', 'pouco', 'alguem', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo', 'realizar', 'marcado', 'marcada', 'agendado', 'agendada']));

/** Palavras do pedido que podem ser parte do nome de um serviço (4+ letras, sem acento). */
const palavrasDoPedido = (t: string) => [...new Set(t.split(/[^a-z]+/).filter((w) => w.length >= 4 && !SEM_VALOR.has(w)))].slice(0, 4);

const prefixoComum = (a: string, b: string) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };
/** Distância de edição entre palavras curtas, contando a troca de duas letras vizinhas como UM erro. */
function distancia(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}
/** Quanto uma palavra do pedido (q) combina com uma palavra do nome do serviço (n): igual 3; começo do nome ("ergo" -> "ergometrico") 2,5; parecida 2; erro de digitação 1,5-2. */
function simPalavra(q: string, n: string): number {
  if (q === n) return 3;
  if (n.startsWith(q)) return 2.5;
  if (q.length >= 5 && n.includes(q)) return 2;
  const pc = prefixoComum(q, n);
  if (pc >= 6 && pc >= 0.7 * Math.min(q.length, n.length)) return 2; // "ergometrico" ~ "ergometria"
  if (q.length >= 5 && perto(q, n)) return 2; // erro de uma letra
  if (q.length >= 8 && distancia(q, n) <= 2) return 1.5;
  return 0;
}

type ItemCatalogo = { cand: Cand; palavras: string[] };
/** Catálogo inteiro que o chatbot pode agendar (todas as unidades). Fica em memória por 10 min (vazio, 20 s). */
async function catalogo(): Promise<ItemCatalogo[]> {
  const clinicas = await listClinicas();
  const mapa = new Map<string, Cand>();
  await Promise.all(clinicas.map(async (c) => {
    for (const p of await listProcedimentos(c.id, '').catch(() => [])) {
      const k = mapa.get(p.id) ?? { proc: p, clinicas: [] };
      k.clinicas.push(c); mapa.set(p.id, k);
    }
  }));
  return [...mapa.values()].map((cand) => ({ cand, palavras: norm(cand.proc.nome).split(/[^a-z0-9]+/).filter((x) => x.length >= 2 && !/^(de|da|do|dos|das|e|com|para|em)$/.test(x)) }));
}

/** Ordena candidatos pela semelhança com o que o paciente escreveu (mais palavras batendo, depois mais parecidas). */
function ranquear(cands: Cand[], palavras: string[], t: string) {
  return cands.map((cand) => {
    const nomes = norm(cand.proc.nome).split(/[^a-z0-9]+/).filter((x) => x.length >= 2);
    let hits = 0; let score = 0; let forte = 0;
    for (const q of palavras) { const melhor = Math.max(0, ...nomes.map((n) => simPalavra(q, n))); if (melhor > 0) { hits++; score += melhor; forte = Math.max(forte, melhor); } }
    return { cand, hits, score, forte };
  }).sort((x, y) => y.hits - x.hits || y.score - x.score || pontuar(y.cand.proc, t) - pontuar(x.cand.proc, t));
}

const PALAVRAS_FRACAS = new Set(['com', 'para', 'por', 'sem', 'dos', 'das', 'uma', 'uns', 'umas', 'ou']);
const palavrasDoNome = (s: string) => norm(s).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !PALAVRAS_FRACAS.has(w));

/**
 * Como a atendente: não pergunta "qual das duas" quando uma é claramente a certa.
 *  - "Retorno" só vale se o paciente pediu retorno;
 *  - cadastros repetidos com as mesmas palavras em outra ordem ("Clinico Geral Consulta" = "Consulta Clínico Geral") viram um só (o primeiro, que já vem
 *    ordenado pela demanda da clínica);
 *  - o serviço "puro" ("Usg Transvaginal") ganha das versões com qualificador que o paciente não citou ("... Com Doppler", "... Contagem de Folículos").
 * `soDuplicatas`: só junta os repetidos (para listas genéricas de "consultas mais procuradas").
 */
export function canonizar<T>(itens: T[], nome: (x: T) => string, pedido: string, soDuplicatas = false): T[] {
  let lista = itens;
  if (!soDuplicatas && !/\b(retorno|retornar|reconsulta)\b/.test(norm(pedido))) {
    const sem = lista.filter((x) => !/\bretorno\b/.test(norm(nome(x))));
    if (sem.length) lista = sem;
  }
  const vistos = new Set<string>();
  lista = lista.filter((x) => { const k = [...new Set(palavrasDoNome(nome(x)))].sort().join(' '); if (vistos.has(k)) return false; vistos.add(k); return true; });
  if (!soDuplicatas && lista.length > 1) {
    const q = new Set(palavrasDoNome(pedido));
    const toks = lista.map((x) => new Set(palavrasDoNome(nome(x))));
    const puro = toks.findIndex((a, i) => a.size > 0 && toks.every((b, j) => j === i || [...a].every((w) => b.has(w))));
    if (puro >= 0) {
      const pediuQualificador = toks.some((b, j) => j !== puro && [...b].some((w) => !toks[puro].has(w) && q.has(w)));
      if (!pediuQualificador) lista = [lista[puro]];
    }
  }
  return lista;
}

/** Serviços que a clínica mais agenda: na hora de sugerir, passam na frente dos exames raros. */
const PRINCIPAIS = /ergometr|esforco|eletrocardio|\becg\b|ecocardio|holter|\bmapa\b|ultrassom|\busg\b|ultrassonograf|raio ?x|radiograf|tomograf|resson|mamograf|densitom|endosc|colonosc|espirom|audiom|papanicolau|preventivo|\bconsulta\b/;

/** Quantos horários abertos o serviço tem nos próximos 30 dias, somando as unidades (compartilha o cache da agenda com o resto do fluxo). */
async function vagasAbertas(c: Cand): Promise<number> {
  const ini = hojeYmd(); const fim = somaDias(ini, 30);
  const r = await Promise.all(c.clinicas.map((u) => listAgenda({ unidadeId: u.id, dataInicial: ini, dataFinal: fim, procedimentoId: c.proc.id }).then((h) => h.length).catch(() => 0)));
  return r.reduce((a, b) => a + b, 0);
}
/** O serviço tem horário aberto nos próximos 30 dias em alguma unidade? */
const temAgenda = async (c: Cand): Promise<boolean> => (await vagasAbertas(c)) > 0;

/**
 * Um vencedor claro vira o serviço; vários parecidos (ex.: só "teste") viram até 5 sugestões, escolhidas com inteligência:
 * só o que tem agenda aberta (se houver), os serviços principais primeiro (ergométrico antes de teste rápido de laboratório).
 */
async function decidir(pont: ReturnType<typeof ranquear>, viaSintoma: boolean, pedido = ''): Promise<Descoberta> {
  const topo = pont[0]; const seg = pont[1];
  for (const x of pont.slice(0, 8)) conhecidos.set(x.cand.proc.id, x.cand);
  if (!seg || topo.hits > seg.hits || topo.score - seg.score >= 1.5) {
    const d = await montar(topo.cand);
    return d && 'servico' in d ? { servico: { ...d.servico, viaSintoma } } : d;
  }
  const parecidos = pont.filter((x) => x.hits === topo.hits && topo.score - x.score < 1.5);
  const principal = (x: (typeof parecidos)[number]) => (PRINCIPAIS.test(norm(x.cand.proc.nome)) ? 1 : 0);
  // o que a clínica mais agenda (últimos 30 dias) vem primeiro; sem esse dado, vale a regra dos serviços principais
  const dem = await demandaPorProcedimento();
  const demanda = (x: (typeof parecidos)[number]) => dem.get(x.cand.proc.id) ?? 0;
  // olha a agenda em blocos de 12 (os principais primeiro) até juntar sugestões com horário aberto: no catálogo real há dezenas de
  // testes rápidos de laboratório sem agenda e eles não podem esconder os serviços agendáveis
  const fila = [...parecidos].sort((a, b) => demanda(b) - demanda(a) || principal(b) - principal(a) || b.score - a.score);
  const itens: { x: (typeof parecidos)[number]; ag: boolean }[] = [];
  for (let i = 0; i < fila.length && i < 36; i += 12) {
    const bloco = fila.slice(i, i + 12);
    const ag = await Promise.all(bloco.map((x) => temAgenda(x.cand)));
    bloco.forEach((x, k) => itens.push({ x, ag: ag[k] }));
    if (itens.filter((it) => it.ag).length >= 5) break;
  }
  const visiveis = itens.some((i) => i.ag) ? itens.filter((i) => i.ag) : itens;
  const ordenados = visiveis.sort((a, b) => demanda(b.x) - demanda(a.x) || principal(b.x) - principal(a.x) || b.x.score - a.x.score || pontuar(b.x.cand.proc) - pontuar(a.x.cand.proc));
  const top = canonizar(ordenados, (i) => i.x.cand.proc.nome, pedido).slice(0, 5); // sem "retorno", sem repetidos, sem qualificador que ele não pediu
  if (top.length === 1) {
    const d = await montar(top[0].x.cand);
    return d && 'servico' in d ? { servico: { ...d.servico, viaSintoma } } : d;
  }
  return { opcoes: top.map((i) => ({ id: i.x.cand.proc.id, nome: titulo(i.x.cand.proc.nome) })) };
}

/**
 * Procura no catálogo inteiro os serviços de nome igual ou PARECIDO com o pedido.
 * `forte`: só vale se alguma palavra do pedido for igual ou o começo de uma palavra do nome ("ergo" -> "ergométrico").
 */
async function buscarSimilares(t: string, palavras: string[], viaSintoma: boolean, forte: boolean): Promise<Descoberta> {
  const itens = await catalogo();
  const pont = ranquear(itens.map((x) => x.cand), palavras, t).filter((x) => x.hits > 0 && (!forte || x.forte >= 2.5));
  return pont.length ? decidir(pont, viaSintoma, t) : undefined;
}

/**
 * Pedido genérico ("preciso agendar um exame", "quero marcar uma consulta") sem dizer qual: em vez de perguntar no escuro, mostra os
 * serviços DAQUELE tipo que têm agenda aberta (os principais primeiro). Só entra o que o chatbot pode agendar e que tem horário.
 */
async function sugerirPorTipo(tipo: 'exame' | 'consulta'): Promise<Descoberta> {
  const [itens, dem] = await Promise.all([catalogo(), demandaPorProcedimento()]);
  const ehConsulta = (c: Cand) => /consulta/i.test(c.proc.nome) || /consulta/i.test(c.proc.categoria ?? '');
  const demanda = (c: Cand) => dem.get(c.proc.id) ?? 0;
  const principal = (c: Cand) => (PRINCIPAIS.test(norm(c.proc.nome)) ? 1 : 0);
  // o que a clínica mais agenda primeiro (últimos 30 dias); sem esse dado, os serviços principais
  const fila = canonizar(itens.map((i) => i.cand)
    .filter((c) => (tipo === 'consulta' ? ehConsulta(c) : !ehConsulta(c)) && !/\bretorno\b/i.test(c.proc.nome))
    .sort((a, b) => demanda(b) - demanda(a) || principal(b) - principal(a) || pontuar(b.proc) - pontuar(a.proc) || a.proc.nome.localeCompare(b.proc.nome)), (c) => c.proc.nome, '', true); // sem cadastros repetidos ("Clinico Geral Consulta" e "Consulta Clínico Geral")
  const achados: Cand[] = []; const pulados: Cand[] = []; const porCategoria = new Map<string, number>();
  // olha a agenda em blocos de 12 (os mais agendados primeiro) até juntar 6 com horário aberto; nos exames, no máximo 2 por categoria
  // (senão a lista fica só de laboratório e some o ultrassom, o eletrocardiograma...)
  for (let i = 0; i < fila.length && i < 60 && achados.length < 6; i += 12) {
    const bloco = fila.slice(i, i + 12);
    const vagas = await Promise.all(bloco.map((c) => vagasAbertas(c)));
    bloco.forEach((c, k) => {
      if (vagas[k] === 0 || achados.length >= 6) return;
      const cat = norm(c.proc.categoria ?? '');
      if (tipo === 'exame' && (porCategoria.get(cat) ?? 0) >= 2) { pulados.push(c); return; }
      porCategoria.set(cat, (porCategoria.get(cat) ?? 0) + 1); achados.push(c);
    });
  }
  for (const c of pulados) if (achados.length < 6) achados.push(c);
  if (achados.length === 0) return undefined;
  for (const c of achados) conhecidos.set(c.proc.id, c);
  if (achados.length === 1) return montar(achados[0]);
  return {
    opcoes: achados.map((c) => ({ id: c.proc.id, nome: titulo(c.proc.nome) })),
    intro: tipo === 'exame' ? 'Claro! Estes são os exames mais procurados que tenho com agenda:' : 'Claro! Estas são as consultas mais procuradas que tenho com agenda:',
    pergunta: tipo === 'exame' ? 'Qual deles você precisa? Se for outro, me diz o nome.' : 'Qual delas você precisa? Se for outra, me diz o nome.',
  };
}

const SO_GENERICAS_DE_SANGUE = new Set(['sangue', 'laboratorial', 'laboratorio', 'laboratoriais', 'coleta', 'realizar', 'exame', 'exames', 'teste', 'testes']);
/**
 * "Quero fazer um exame de sangue": mostra os exames laboratoriais mais procurados que têm agenda (como a atendente pergunta "qual exame de sangue?"),
 * em vez de adivinhar um nome parecido.
 */
async function sugerirLaboratorio(): Promise<Descoberta> {
  const [itens, dem] = await Promise.all([catalogo(), demandaPorProcedimento()]);
  const demanda = (c: Cand) => dem.get(c.proc.id) ?? 0;
  const fila = canonizar(itens.map((i) => i.cand)
    .filter((c) => /laborat/i.test(c.proc.categoria ?? '') && !/\b(teste rapido|rapido)\b/i.test(norm(c.proc.nome)))
    .sort((a, b) => demanda(b) - demanda(a) || a.proc.nome.localeCompare(b.proc.nome)), (c) => c.proc.nome, '', true);
  const achados: Cand[] = [];
  for (let i = 0; i < fila.length && i < 36 && achados.length < 6; i += 12) {
    const bloco = fila.slice(i, i + 12);
    const vagas = await Promise.all(bloco.map((c) => vagasAbertas(c)));
    bloco.forEach((c, k) => { if (vagas[k] > 0 && achados.length < 6) achados.push(c); });
  }
  if (achados.length === 0) return undefined;
  for (const c of achados) conhecidos.set(c.proc.id, c);
  if (achados.length === 1) return montar(achados[0]);
  return {
    opcoes: achados.map((c) => ({ id: c.proc.id, nome: titulo(c.proc.nome) })),
    intro: 'Claro! Estes são os exames de laboratório mais procurados que tenho com agenda:',
    pergunta: 'Qual deles você precisa? Se for outro, me diz o nome.',
  };
}

/** Nome de sala ou setor cadastrado como "profissional" ("Coleta", "Exames", ".SALA DE EXAMES"): não é médico, não aparece como "com Fulano". */
export const ehSala = (nome?: string | null) => Boolean(nome) && /^\.?\s*(sala|coleta|exames?|laborat\w*|recepc\w*|triagem|ultrassom|usg)\b/.test(norm(nome!));
const nomeDePessoa = (nome?: string | null) => (nome && !ehSala(nome) ? titulo(nome) : undefined);

export const fonteClinilink: Fonte = {
  tipo: 'clinilink',
  /** O paciente já tem este serviço neste dia? Procura nas unidades e devolve só o que vai para a conversa (unidade, hora, médico). */
  async agendamentoExistente(sv, ymd, pacienteId) {
    if (!pacienteId) return null;
    for (const c of await listClinicas()) {
      const feitos = await listAgendamentosDoDia(c.id, ymd).catch(() => []);
      const a = feitos.find((x) => x.pacienteId === pacienteId && x.procedimentoIds.includes(sv.id));
      if (!a) continue;
      const hora = a.agendaHoraInicio ?? a.dataHora?.slice(11, 16) ?? undefined;
      return { unidade: nomeUnidade(c), hora, periodo: hora ? periodoDe(hora) : undefined, profissional: a.profissional ? titulo(a.profissional) : undefined };
    }
    return null;
  },
  /** Pré-carrega unidades e catálogo (o Clinilink pode demorar para "acordar"): a espera de 30 s do agente já cobre isso. */
  async aquecer() { await Promise.allSettled([listClinicas().then(() => catalogo()), demandaPorProcedimento()]); },
  async nomesUnidades() { return (await listClinicas()).map(nomeUnidade); },

  async descobrir(t, buscando, forte = false) {
    // pediu uma pessoa pelo nome ("com a dra Rebecca")? acha a pessoa e o atendimento dela com agenda
    const pessoa = await descobrirProfissional(t);
    if (pessoa) return pessoa;
    const raizes = RAIZES.filter((r) => r.re.test(t));
    const termos = raizes.flatMap((r) => [r.busca, ...(r.alt ?? [])]); // ex.: ultrassom -> usg -> ultrassonografia
    const palavras = palavrasDoPedido(t);
    // "exame de sangue" sem dizer qual: como a atendente, mostra os exames de laboratório mais procurados (não adivinha "Sangue Oculto")
    if (buscando && /\b(sangue|laboratori\w*|coleta)\b/.test(t) && palavras.filter((w) => !SO_GENERICAS_DE_SANGUE.has(w)).length === 0) {
      const lab = await sugerirLaboratorio();
      if (lab) return lab;
    }
    // pedido genérico: quer AGENDAR um exame (ou uma consulta) e não disse qual -> mostra os que têm agenda
    if (buscando && !forte && termos.length === 0 && palavras.length === 0) {
      const exame = /\b(exames?)\b/.test(t); const consulta = /\b(consultas?)\b/.test(t);
      const querAgendar = /\b(marcar|agendar|agendamento|marcacao|quero|queria|preciso|precisando|gostaria|fazer|realizar|tem vaga|disponivel|horario)\b/.test(t);
      const outroAssunto = /\b(remarc\w*|reagend\w*|desmarc\w*|cancel\w*|resultado|laudo|retorno)\b/.test(t);
      if (exame !== consulta && querAgendar && !outroAssunto) return sugerirPorTipo(exame ? 'exame' : 'consulta');
    }
    // sem raiz conhecida e sem palavra que possa ser nome de serviço: não é pedido de serviço
    if (termos.length === 0 && !(buscando && palavras.length)) return undefined;
    const pediu = /\b(quero|queria|preciso|gostaria|marcar|agendar|fazer|realizar|consulta|exame)\b/.test(t);
    const rotulo = raizes[0]?.nome ?? (pediu && buscando ? palavras.join(' ') : '');
    const viaSintoma = raizes.some((r) => r.sintoma?.test(t));

    // "exame de gravidez", "teste ergo": o NOME do serviço ganha da raiz de especialidade (gravidez != consulta de ginecologia)
    const dizExame = /\b(exames?|testes?)\b/.test(t);
    if (buscando && palavras.length && (termos.length === 0 || dizExame)) {
      const forte = await buscarSimilares(t, palavras, viaSintoma, true);
      if (forte) return forte;
    }

    const clinicas = await listClinicas();
    for (const termo of termos) {
      const listas = await Promise.all(clinicas.map(async (c) => ({ c, procs: await listProcedimentos(c.id, termo) })));
      const mapa = new Map<string, Cand>();
      for (const { c, procs } of listas) for (const p of procs) {
        const k = mapa.get(p.id) ?? { proc: p, clinicas: [] };
        k.clinicas.push(c); mapa.set(p.id, k);
      }
      if (mapa.size === 0) continue;
      for (const [id, v] of mapa) conhecidos.set(id, v);
      // vários candidatos para a mesma raiz: o mais parecido com o que ele escreveu; sem diferença, o mais "consulta"; empate, opções
      const pont = ranquear([...mapa.values()], palavras, t);
      const topo = pont[0];
      const iguais = pont.filter((x) => x.hits === topo.hits && Math.abs(x.score - topo.score) < 0.01 && pontuar(x.cand.proc, t) === pontuar(topo.cand.proc, t));
      if (iguais.length > 1) {
        const dem = await demandaPorProcedimento();
        iguais.sort((a, b) => (dem.get(b.cand.proc.id) ?? 0) - (dem.get(a.cand.proc.id) ?? 0));
        const unicos = canonizar(iguais, (x) => x.cand.proc.nome, t);
        if (unicos.length === 1) { const d = await montar(unicos[0].cand); return d && 'servico' in d ? { servico: { ...d.servico, viaSintoma } } : d; }
        return { opcoes: unicos.slice(0, 5).map((x) => ({ id: x.cand.proc.id, nome: titulo(x.cand.proc.nome) })) };
      }
      return decidir(pont, viaSintoma, t);
    }
    // a busca exata não achou: procura no catálogo inteiro por nome igual ou PARECIDO (abreviação, erro de digitação, radical)
    if (palavras.length && !forte) {
      const sim = await buscarSimilares(t, palavras, viaSintoma, false);
      if (sim) return sim;
    }
    // nada igual nem parecido (ou não está liberado para agendamento pelo chatbot): o paciente fica sabendo
    evt('servico_nao_encontrado', { termo: rotulo || palavras.join(' '), tentativas: termos, palavras });
    return rotulo ? { naoAchouServico: rotulo } : undefined;
  },

  async resolver(id) {
    if (id.startsWith('prof:')) {
      const pessoa = (await todosProfissionais()).find((x) => x.id === id.slice(5));
      return pessoa ? servicoDaProfissional(pessoa) : undefined;
    }
    const c = conhecidos.get(id);
    return c ? montar(c) : undefined;
  },

  async periodos(sv, un, ymd) {
    if (!un.id) return [];
    return agrupar(await listAgenda({ unidadeId: un.id, dataInicial: ymd, dataFinal: ymd, procedimentoId: sv.id, profissionalId: sv.profissional?.id }));
  },

  async proximas(sv, un, de, max) {
    if (!un.id) return [];
    return agrupar(await listAgenda({ unidadeId: un.id, dataInicial: de, dataFinal: somaDias(de, 21), procedimentoId: sv.id, profissionalId: sv.profissional?.id })).slice(0, max);
  },

  async reservar(p: PedidoReserva): Promise<ResultadoReserva> {
    const { unidade, slot, servico } = p;
    if (!unidade.id) return { ok: false, codigo: 'UNIDADE_SEM_ID', motivo: 'unidade sem id' };
    // 1) horário livre AGORA (sem cache): o primeiro do período escolhido, com o mesmo médico informado ao paciente
    const livres = (await listAgendaFresca({ unidadeId: unidade.id, dataInicial: slot.ymd, dataFinal: slot.ymd, procedimentoId: servico.id, profissionalId: servico.profissional?.id }))
      .filter((h) => periodoDe(h.agendaHoraInicio ?? h.hora) === slot.turno && (!slot.profissionalId || h.profissional?.id === slot.profissionalId))
      .sort((a, b) => a.hora.localeCompare(b.hora));
    if (livres.length === 0) return { ok: false, codigo: 'SEM_VAGA_AGORA', motivo: 'a vaga escolhida acabou de ser preenchida' };

    // 2) paciente: já cadastrado, ou cria agora (CPF_DUPLICADO devolve o existente)
    let pacienteId = p.pacienteId; let cadastrou = false;
    if (!pacienteId) {
      if (!p.cadastro) return { ok: false, codigo: 'SEM_DADOS', motivo: 'faltam dados do cadastro' };
      const c = p.cadastro;
      const r = await criarPaciente({ nome: c.nome, cpf: p.cpf, dataNascimento: c.nascimento, sexo: c.sexo, telefone: c.telefone });
      if (r.ok) { pacienteId = r.dados.paciente?.id ?? r.dados.id; cadastrou = true; }
      else if (r.codigo === 'CPF_DUPLICADO' && r.corpo?.pacienteExistente?.id) pacienteId = r.corpo.pacienteExistente.id;
      else return { ok: false, codigo: r.codigo, motivo: `cadastro recusado: ${r.mensagem || r.codigo}`, incerto: r.incerto };
      if (!pacienteId) return { ok: false, codigo: 'SEM_ID_PACIENTE', motivo: 'o cadastro não devolveu o id do paciente', incerto: true };
    }

    // 3) reserva; se alguém ocupou o horário no meio do caminho, tenta o próximo livre (até 3)
    let ultimo = '';
    for (const h of livres.slice(0, 3)) {
      const dataHora = h.dataHora ?? `${h.data}T${h.hora}:00-03:00`;
      const r = await criarAgendamento({ pacienteId, unidadeId: unidade.id, agendaId: h.agendaId, profissionalId: h.profissional?.id ?? slot.profissionalId ?? '', dataHora, procedimentoId: servico.id, observacao: p.observacao });
      if (r.ok) return { ok: true, profissional: nomeDePessoa(h.profissional?.nome) ?? slot.profissional, profissionalBruto: h.profissional?.nome ?? slot.profissionalBruto, hora: inicioMostrado(h), cadastrou };
      ultimo = r.codigo;
      if (r.codigo !== 'HORARIO_OCUPADO') return { ok: false, codigo: r.codigo, motivo: r.mensagem || r.codigo, incerto: r.incerto, cadastrou };
    }
    return { ok: false, codigo: ultimo || 'HORARIO_OCUPADO', motivo: 'os horários do período foram ocupados', cadastrou };
  },

  async paciente(cpf) {
    const lista = await getPacientePorCpf(cpf);
    const p = lista[0];
    return p ? { id: p.id, nome: titulo(p.nome) } : null;
  },
};
