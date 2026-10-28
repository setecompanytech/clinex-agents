import { criarAgendamento, criarPaciente, demandaPorProcedimento, getPacientePorCpf, listAgendamentosDoDia, listAgenda, listAgendaFresca, listClinicas, listCombos, listProcedimentos, listProfissionais, type Clinica, type Combo, type Horario, type Procedimento } from '../../../integrations/clinilink.js';
import { env } from '../../../lib/env.js';
import { exibir, prepararGeneros } from '../../../lib/genero.js';
import { evt } from '../../../lib/log.js';
import { ordenarItens } from './combosOrdem.js';
import { ehServicoExterno } from './servicosExternos.js';
import { RAIZES, rotuloDaEtapa, type ComboInfo, type Descoberta, type EscolherExames, type Fonte, type ItemDeCombo, type ItemExame, type OfertaCombo, type PedidoReserva, type Periodo, type ResultadoReserva, type Servico, type Slot, type Unidade } from './catalog.js';

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
  // categoria EXTERNA no Clinilink (colonoscopia...): a equipe atende, com ou sem agenda; a Amanda não agenda
  if (/extern/i.test(c.proc.categoria ?? '')) return { servicoExterno: itemCurto(c.proc.nome) };
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
    categoria: c.proc.categoria,
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

/** Paciente já cadastrado, ou cria agora (CPF_DUPLICADO devolve o existente). */
async function garantirPaciente(p: PedidoReserva): Promise<{ pacienteId: string; cadastrou: boolean } | { erro: ResultadoReserva }> {
  let pacienteId = p.pacienteId; let cadastrou = false;
  if (!pacienteId) {
    if (!p.cadastro) return { erro: { ok: false, codigo: 'SEM_DADOS', motivo: 'faltam dados do cadastro' } };
    const c = p.cadastro;
    const r = await criarPaciente({ nome: c.nome, cpf: p.cpf, dataNascimento: c.nascimento, sexo: c.sexo, telefone: c.telefone });
    if (r.ok) { pacienteId = r.dados.paciente?.id ?? r.dados.id; cadastrou = true; }
    else if (r.codigo === 'CPF_DUPLICADO' && r.corpo?.pacienteExistente?.id) pacienteId = r.corpo.pacienteExistente.id;
    else return { erro: { ok: false, codigo: r.codigo, motivo: `cadastro recusado: ${r.mensagem || r.codigo}`, incerto: r.incerto } };
    if (!pacienteId) return { erro: { ok: false, codigo: 'SEM_ID_PACIENTE', motivo: 'o cadastro não devolveu o id do paciente', incerto: true } };
  }
  return { pacienteId, cadastrou };
}

// ---------------- COMBOS ----------------
// Um combo é uma lista de serviços (consulta, exames...) com preço fechado. A Amanda agenda em ETAPAS, uma de cada vez, e cada etapa é um agendamento
// ligado ao combo: cada serviço é uma etapa e os exames de laboratório entram juntos numa etapa só (uma coleta). O "retorno" do combo é uma consulta
// futura sem custo: não é agendado agora.
const ehRetornoDoCombo = (nome: string) => /\bretorno\b/.test(norm(nome));
const itensDoCombo = (c: Combo) => c.servicos.filter((s) => !ehRetornoDoCombo(s.nome));
const temRetornoNoCombo = (c: Combo) => c.servicos.some((s) => ehRetornoDoCombo(s.nome));
const ehLab = (categoria?: string) => /laborat/i.test(categoria ?? '');
/** Preço do combo = soma dos serviços dentro do combo (o `preco` de cada item já é o preço no combo). Sem preço em algum item, não cita valor. */
const totalDoCombo = (c: Combo): number | undefined => {
  const it = itensDoCombo(c);
  if (it.length === 0 || it.some((s) => typeof s.preco !== 'number' || !Number.isFinite(s.preco))) return undefined;
  const t = Math.round(it.reduce((a, s) => a + (s.preco ?? 0), 0) * 100) / 100;
  return t > 0 ? t : undefined;
};
const tituloCombo = (s: string) => titulo(s).replace(/\((\p{L})/gu, (_m, a: string) => `(${a.toLocaleUpperCase('pt-BR')}`);
/** "PAPANICOLAOU (CITOPATOLÓGICO) - CAPTURA DE IMAGEM" -> "Papanicolaou" */
const itemCurto = (nome: string) => titulo(nome.split(/\s+[-(]/)[0].replace(/[.\s]+$/, '').trim());
const listaDeItens = (c: Combo, max: number) => { const it = itensDoCombo(c).map((s) => itemCurto(s.nome)); return it.slice(0, max).join(', ') + (it.length > max ? ` e mais ${it.length - max}` : ''); };

/** Preço de cada serviço FORA do combo (o campo `preco` do catálogo): é o que permite dizer quanto o paciente economiza. */
async function precosAvulsos(): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  for (const x of await catalogo()) { const v = precoDe(x.cand.proc); if (v !== undefined) m.set(x.cand.proc.id, v); }
  return m;
}
/** Quanto o paciente economiza no combo: o que os serviços custam avulsos menos o preço do combo. Só afirma quando TODOS os preços avulsos são conhecidos. */
function economiaDoCombo(cb: Combo, avulsos: Map<string, number>): number | undefined {
  const total = totalDoCombo(cb); const it = itensDoCombo(cb);
  if (total === undefined || it.some((i) => !avulsos.has(i.id))) return undefined;
  const e = Math.round((it.reduce((a, i) => a + (avulsos.get(i.id) ?? 0), 0) - total) * 100) / 100;
  return e > 0.009 ? e : undefined;
}
/**
 * O combo para o roteiro: os itens (com o preço no combo e o avulso) na ordem do combo no Clinilink (ou a de `ORDEM_DOS_COMBOS`) e as opções de agendamento:
 * cada serviço é uma opção e os exames de laboratório formam uma opção só (uma coleta), na posição do primeiro deles. O paciente escolhe quais agenda
 * agora; juntando opções, vários serviços entram no mesmo agendamento.
 */
function infoDoCombo(cb: Combo, avulsos: Map<string, number>): ComboInfo {
  const itens: ItemDeCombo[] = ordenarItens(cb.nome, itensDoCombo(cb).map((s) => ({ id: s.id, nome: s.nome, curto: itemCurto(s.nome), preco: typeof s.preco === 'number' && s.preco > 0 ? s.preco : undefined, avulso: avulsos.get(s.id), categoria: s.categoriaNome })));
  const etapas: string[][] = []; let posLab = -1;
  for (const i of itens) {
    if (!ehLab(i.categoria)) etapas.push([i.id]);
    else if (posLab < 0) { posLab = etapas.length; etapas.push([i.id]); }
    else etapas[posLab].push(i.id);
  }
  return { id: cb.id, nome: cb.nome, rotulo: tituloCombo(cb.nome), total: totalDoCombo(cb), economia: economiaDoCombo(cb, avulsos), temRetorno: temRetornoNoCombo(cb), itens, etapas };
}
/**
 * Roda `fn` nos itens, `n` por vez. O Clinilink responde erro 500 quando recebe dezenas de consultas de agenda ao mesmo tempo
 * (cada uma de 30 dias traz mais de mil horários), então nada aqui dispara tudo de uma vez.
 */
async function emLotes<T, R>(itens: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = [];
  for (let i = 0; i < itens.length; i += n) saida.push(...await Promise.all(itens.slice(i, i + n).map(fn)));
  return saida;
}
/**
 * Cada etapa tem horário aberto nos próximos 30 dias, em alguma unidade? Olha só o primeiro serviço da etapa (os exames de laboratório
 * compartilham a agenda da coleta). Se o Clinilink falhar na consulta, conta como "tem" (não sei): sem vaga de verdade aparece na hora de agendar.
 */
async function etapasComAgenda(info: ComboInfo): Promise<boolean[]> {
  const clinicas = await listClinicas(); const ini = hojeYmd(); const fim = somaDias(ini, 30);
  const pares = info.etapas.flatMap((ids, e) => clinicas.map((u) => ({ e, u, id: ids[0] })));
  const achou = await emLotes(pares, 4, (x) => listAgenda({ unidadeId: x.u.id, dataInicial: ini, dataFinal: fim, procedimentoId: x.id }).then((h) => h.length > 0).catch(() => true));
  return info.etapas.map((_, e) => pares.some((x, i) => x.e === e && achou[i]));
}

const FAMILIAS_DE_COMBO: { chave: string; rotulo: string; plural: string; re: RegExp }[] = [
  { chave: 'feminino', rotulo: 'Feminino', plural: 'femininos', re: /\b(mulher|mulheres|feminin\w*|ginec\w*)\b/ },
  { chave: 'masculino', rotulo: 'Masculino', plural: 'masculinos', re: /\b(homem|homens|masculin\w*|urolog\w*)\b/ },
  { chave: 'infantil', rotulo: 'Infantil', plural: 'infantis', re: /\b(crianca|criancas|infantil|pediatr\w*|bebe)\b/ },
  { chave: 'cardio', rotulo: 'Cardio', plural: 'de cardio', re: /\b(cardio\w*|coracao)\b/ },
  { chave: 'clinico', rotulo: 'Clínico', plural: 'clínicos', re: /\b(clinico|clinica geral|geral)\b/ },
  { chave: 'ortopedista', rotulo: 'Ortopedista', plural: 'de ortopedista', re: /\b(ortoped\w*)\b/ },
  { chave: 'gastro', rotulo: 'Gastro', plural: 'de gastro', re: /\b(gastro\w*|endoscopia)\b/ },
  { chave: 'risco', rotulo: 'Risco cirúrgico', plural: 'de risco cirúrgico', re: /\b(risco|cirurg\w*)\b/ },
  { chave: 'check up', rotulo: 'Check-up', plural: 'de check-up', re: /\bcheck ?-?up\b/ },
];

async function opcoesDeCombos(cs: Combo[], familiaPlural?: string): Promise<Descoberta> {
  const avulsos = await precosAvulsos();
  const ordenados = [...cs].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }));
  return {
    opcoes: ordenados.map((c) => { const t = totalDoCombo(c); const e = economiaDoCombo(c, avulsos); return { id: `combo:${c.id}`, nome: `${tituloCombo(c.nome)}${t ? ` (${reais(t)}${e ? `, economiza ${reais(e)}` : ''})` : ''}: ${listaDeItens(c, 5)}` }; }),
    intro: familiaPlural ? `Claro! Tenho estes combos ${familiaPlural}:` : 'Claro! Tenho estes combos:',
    pergunta: 'Qual deles você quer? Pode ser o número ou o nome.',
  };
}

/** "Tem combo feminino?", "quanto tá um combo", "quero o combo Feminino 2", "check up". */
async function descobrirCombo(t: string): Promise<Descoberta> {
  const querCombo = /\b(combos?|pacotes?|check ?-?up)\b/.test(t);
  const todos = await listCombos().catch(() => [] as Combo[]);
  if (todos.length === 0) return undefined;
  const simples = (c: Combo) => norm(c.nome).replace(/\s*\(.*?\)/g, '').trim();
  // o nome do combo dito por inteiro ("feminino 2", "check up geral"): vale mesmo sem a palavra "combo"
  const exatos = todos.filter((c) => /\d|geral|risco/.test(simples(c)) && new RegExp(`\\b${simples(c).replace(/ /g, ' ?')}\\b`).test(t));
  if (!querCombo && exatos.length === 0) return undefined;
  let escolhidos = exatos;
  let rotulo: string | undefined;
  if (escolhidos.length === 0) {
    const fams = FAMILIAS_DE_COMBO.filter((f) => f.re.test(t));
    escolhidos = todos.filter((c) => fams.some((f) => norm(c.nome).includes(f.chave)));
    if (fams.length === 1) rotulo = fams[0].plural;
    if (escolhidos.length === 0) {
      // só "combo": mostra as famílias que existem
      const existentes = FAMILIAS_DE_COMBO.filter((f) => todos.some((c) => norm(c.nome).includes(f.chave)));
      return { opcoes: existentes.map((f) => ({ id: `combofam:${f.chave}`, nome: f.rotulo })), intro: 'Claro! Tenho combos de:', pergunta: 'Qual te interessa? Pode ser o número ou o nome.' };
    }
  }
  if (escolhidos.length === 1) return montarCombo(escolhidos[0]);
  return opcoesDeCombos(escolhidos, rotulo);
}

/**
 * Horários da âncora de um agendamento com VÁRIOS serviços, só nos dias em que os outros também têm horário na unidade. Os exames de laboratório
 * compartilham a agenda da coleta, então só o primeiro deles é consultado (pouquíssimas consultas por vez: o Clinilink responde 500 a dezenas de
 * uma vez). Erro do Clinilink numa consulta = não restringe o dia. Na hora de gravar cada serviço é conferido de novo (`reservarCombo`).
 */
async function horariosDoGrupo(itens: { id: string; lab?: boolean }[], ancoraId: string, unidadeId: string, de: string, ate: string): Promise<Horario[]> {
  const labs = itens.filter((i) => i.lab);
  const ids = [...new Set([ancoraId, ...itens.filter((i) => !i.lab).map((i) => i.id), ...(labs.length ? [labs[0].id] : [])])];
  const listas = await emLotes(ids, 3, (id) => listAgenda({ unidadeId, dataInicial: de, dataFinal: ate, procedimentoId: id }).then((h) => h as Horario[] | null).catch(() => null));
  const doAncora = listas[ids.indexOf(ancoraId)];
  if (!doAncora) return [];
  let dias = new Set(doAncora.map((h) => h.data));
  ids.forEach((id, k) => { const l = listas[k]; if (id === ancoraId || !l) return; const d = new Set(l.map((h) => h.data)); dias = new Set([...dias].filter((x) => d.has(x))); });
  return doAncora.filter((h) => dias.has(h.data));
}
async function horariosDoCombo(sv: Servico, un: Unidade, de: string, ate: string): Promise<Slot[]> {
  if (!un.id || !sv.combo) return [];
  return agrupar(await horariosDoGrupo(sv.combo.itens, sv.combo.ancoraId, un.id, de, ate));
}

/** O combo escolhido pelo paciente: o roteiro mostra o que inclui e agenda etapa por etapa (`etapaDoCombo`). */
async function montarCombo(cb: Combo): Promise<Descoberta> {
  const info = infoDoCombo(cb, await precosAvulsos());
  const rotulo = info.rotulo;
  if (info.etapas.length === 0 || !(await etapasComAgenda(info)).some(Boolean)) return { semAgenda: `o combo ${rotulo}` };
  const servico: Servico = {
    id: `combo:${cb.id}`, nome: rotulo, frase: `o combo ${rotulo}`, tipo: 'exame', unidades: [],
    precoTexto: info.total ? `O combo é ${reais(info.total)}${info.economia ? `, você economiza ${reais(info.economia)}` : ''}.` : '', nomeBruto: cb.nome,
    detalhe: `O ${rotulo} inclui: ${listaDeItens(cb, 12)}.${info.temRetorno ? ' O retorno da consulta está incluso, sem custo.' : ''}`,
    pacote: info,
  };
  return { servico };
}

/** Preço do combo em cada unidade (o Clinilink pode ter um preço específico por unidade); falta a unidade = vale o preço geral. */
async function totalPorUnidade(comboId: string): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  for (const c of await listClinicas()) { const cb = (await listCombos(c.id).catch(() => [] as Combo[])).find((x) => x.id === comboId); const t = cb ? totalDoCombo(cb) : undefined; if (t) m.set(c.id, t); }
  return m;
}
/** O procedimento de um item do combo (do catálogo; fora dele, monta com o que o combo informa). */
async function candidatoDoItem(it: ItemDeCombo): Promise<Cand> {
  const doCatalogo = (await catalogo()).find((x) => x.cand.proc.id === it.id)?.cand;
  return doCatalogo ?? { proc: { id: it.id, nome: it.nome, categoria: it.categoria, preco: it.avulso ?? it.preco }, clinicas: await listClinicas() };
}

/** Um serviço de uma etapa do combo: um item (serviço normal, sem preço avulso na conversa) ou os exames de laboratório juntos (o horário é o do primeiro; os outros entram no mesmo dia). */
async function etapaDoComboFonte(cb: { id: string; rotulo: string; total?: number }, itens: ItemDeCombo[]): Promise<Servico | { semAgenda: string }> {
  const totais = await totalPorUnidade(cb.id);
  const rotulo = rotuloDaEtapa(itens);
  if (itens.length === 1) {
    const d = await montar(await candidatoDoItem(itens[0]));
    if (!d || !('servico' in d)) return { semAgenda: rotulo };
    // dentro do combo o preço que vale é o do combo inteiro (é ele que o pix cobre): o preço avulso do item não entra na conversa
    return { ...d.servico, precoTexto: '', unidades: d.servico.unidades.map((u) => ({ ...u, precoPix: (u.id ? totais.get(u.id) : undefined) ?? cb.total })) };
  }
  const ids = itens.map((i) => i.id);
  const ancora = itens.find((i) => !ehLab(i.categoria)) ?? itens[0]; // o horário é o do primeiro serviço que não é coleta (a coleta tem agenda larga)
  const ini = hojeYmd(); const fim = somaDias(ini, 30);
  const comAgenda: { u: Clinica; medicos: string[] }[] = [];
  await Promise.all((await listClinicas()).map(async (u) => {
    const h = await horariosDoGrupo(itens.map((i) => ({ id: i.id, lab: ehLab(i.categoria) })), ancora.id, u.id, ini, fim);
    if (h.length === 0) return;
    comAgenda.push({ u, medicos: [...new Set(h.map((x) => x.profissional?.nome).filter((x): x is string => Boolean(x) && !ehSala(x)).map(titulo))].slice(0, 3) });
  }));
  if (comAgenda.length === 0) return { semAgenda: rotulo };
  await prepararGeneros(comAgenda.flatMap((x) => x.medicos));
  comAgenda.sort((a, b) => a.u.nome.localeCompare(b.u.nome));
  comAgenda.forEach(({ u }) => unidadesPorId.set(u.id, u));
  const cands = await Promise.all(itens.map(candidatoDoItem));
  const preparos = [...new Set(cands.map((c) => preparoUtil(c.proc.preparo)).filter((x): x is string => Boolean(x)))];
  return {
    id: `combo:${cb.id}:${ids.join('+')}`, nome: rotulo, frase: rotulo, tipo: 'exame', precoTexto: '',
    unidades: comAgenda.map(({ u, medicos }): Unidade => ({ id: u.id, nome: nomeUnidade(u), profissionais: medicos, precoPix: totais.get(u.id) ?? cb.total, nomeBruto: u.nome, endereco: u.endereco, telefone: u.telefone })),
    nomeBruto: itens.map((i) => i.nome).join(', '), preparo: preparos.length ? preparos.join('\n\n') : undefined,
    combo: { id: cb.id, nome: cb.rotulo, itens: itens.map((i) => ({ id: i.id, nome: i.nome, lab: ehLab(i.categoria) })), ancoraId: ancora.id },
  };
}

/** Combos que incluem o serviço e saem mais em conta (só os que têm todos os preços avulsos conhecidos e economia de verdade, e agenda em todas as etapas). Até 3, do mais barato. */
async function combosComServicoFonte(sv: Servico): Promise<OfertaCombo[]> {
  if (sv.pacote || sv.combo) return [];
  const chave = (n: string) => [...new Set(palavrasDoNome(n))].sort().join(' ');
  const kSv = chave(sv.nomeBruto ?? sv.nome);
  const candidatos = (await listCombos().catch(() => [] as Combo[])).filter((cb) => itensDoCombo(cb).some((i) => i.id === sv.id || chave(i.nome) === kSv));
  if (candidatos.length === 0) return [];
  const avulsos = await precosAvulsos();
  const infos = candidatos.map((cb) => infoDoCombo(cb, avulsos)).filter((i) => i.total !== undefined && i.economia !== undefined).sort((a, b) => a.total! - b.total! || b.economia! - a.economia!);
  const ofertas: OfertaCombo[] = [];
  for (const i of infos.slice(0, 6)) {
    if (!(await etapasComAgenda(i)).every(Boolean)) continue;
    const nomes = i.itens.map((x) => x.curto);
    ofertas.push({ id: i.id, rotulo: i.rotulo, total: i.total!, economia: i.economia!, texto: `${i.rotulo} (${reais(i.total!)}, economiza ${reais(i.economia!)}): ${nomes.slice(0, 5).join(', ')}${nomes.length > 5 ? ` e mais ${nomes.length - 5}` : ''}` });
    if (ofertas.length === 3) break;
  }
  return ofertas;
}

/** Agenda uma etapa do combo com VÁRIOS exames (laboratório): o primeiro no horário escolhido (com os que a mesma agenda atende) e os demais no mesmo dia, em outras agendas. */
async function reservarCombo(p: PedidoReserva): Promise<ResultadoReserva> {
  const { unidade, slot, servico } = p; const cmb = servico.combo!;
  if (!unidade.id) return { ok: false, codigo: 'UNIDADE_SEM_ID', motivo: 'unidade sem id' };
  const ancora = cmb.itens.find((i) => i.id === cmb.ancoraId);
  if (!ancora) return { ok: false, codigo: 'COMBO_SEM_ANCORA', motivo: 'combo sem serviço principal' };
  const outros = cmb.itens.filter((i) => i.id !== ancora.id);
  // 1) a âncora: horário livre AGORA (sem cache), como nos serviços avulsos
  const livresA = (await listAgendaFresca({ unidadeId: unidade.id, dataInicial: slot.ymd, dataFinal: slot.ymd, procedimentoId: ancora.id }))
    .filter((h) => periodoDe(h.agendaHoraInicio ?? h.hora) === slot.turno && (!slot.profissionalId || h.profissional?.id === slot.profissionalId))
    .sort((a, b) => a.hora.localeCompare(b.hora));
  if (livresA.length === 0) return { ok: false, codigo: 'SEM_VAGA_AGORA', motivo: 'a vaga escolhida acabou de ser preenchida' };
  // 2) os outros serviços no mesmo dia: se algum não tem horário, nada é gravado
  const disp = new Map<string, Horario[]>();
  await emLotes(outros, 4, async (i) => { disp.set(i.id, await listAgendaFresca({ unidadeId: unidade.id!, dataInicial: slot.ymd, dataFinal: slot.ymd, procedimentoId: i.id })); });
  const semVaga = outros.filter((i) => (disp.get(i.id) ?? []).length === 0);
  if (semVaga.length) return { ok: false, codigo: 'COMBO_SEM_VAGA_NO_DIA', motivo: `sem horário no dia para: ${semVaga.map((i) => itemCurto(i.nome)).join(', ')}` };
  // 3) paciente
  const pac = await garantirPaciente(p);
  if ('erro' in pac) return pac.erro;
  const { pacienteId, cadastrou } = pac;
  const obs = p.observacao;
  const feitos: { itens: string[]; hora: string; prof?: string; profBruto?: string }[] = [];
  const falhou = (codigo: string, motivo: string, incerto?: boolean): ResultadoReserva => ({
    ok: false, codigo: feitos.length ? 'COMBO_PARCIAL' : codigo, incerto, cadastrou,
    motivo: feitos.length ? `ETAPA DO COMBO AGENDADA SÓ EM PARTE. Já agendado: ${feitos.map((f) => f.itens.map(itemCurto).join(', ')).join(' | ')}. NÃO agendado: ${motivo}` : motivo,
  });
  // 4) a âncora + os serviços que a mesma agenda atende, no mesmo horário (se alguém ocupou, tenta o próximo livre; até 3)
  let principal: Horario | undefined; let grupoA: { id: string; nome: string }[] = [];
  let ultimo = '';
  for (const h of livresA.slice(0, 3)) {
    const junto = outros.filter((i) => (disp.get(i.id) ?? []).some((x) => x.agendaId === h.agendaId));
    const dataHora = h.dataHora ?? `${h.data}T${h.hora}:00-03:00`;
    const r = await criarAgendamento({ pacienteId, unidadeId: unidade.id, agendaId: h.agendaId, profissionalId: h.profissional?.id ?? slot.profissionalId ?? '', dataHora, procedimentoId: ancora.id, procedimentoIds: [ancora.id, ...junto.map((i) => i.id)], comboId: cmb.semCombo ? undefined : cmb.id, observacao: obs });
    if (r.ok) { principal = h; grupoA = junto; feitos.push({ itens: [ancora.nome, ...junto.map((i) => i.nome)], hora: inicioMostrado(h), prof: nomeDePessoa(h.profissional?.nome) ?? undefined, profBruto: h.profissional?.nome }); break; }
    ultimo = r.codigo;
    if (r.codigo !== 'HORARIO_OCUPADO') return { ok: false, codigo: r.codigo, motivo: r.mensagem || r.codigo, incerto: r.incerto, cadastrou };
  }
  if (!principal) return { ok: false, codigo: ultimo || 'HORARIO_OCUPADO', motivo: 'os horários do período foram ocupados', cadastrou };
  // 5) o que a agenda da âncora não atende: agenda que atende mais itens do que falta (empate: a que abre mais cedo), no mesmo dia
  let restantes = outros.filter((i) => !grupoA.includes(i));
  const extras: { ord: number; txt: string }[] = []; // avisos dos outros grupos (na ordem dos serviços)
  while (restantes.length) {
    const porAgenda = new Map<string, { ids: Set<string>; hs: Horario[] }>();
    for (const i of restantes) for (const h of disp.get(i.id) ?? []) {
      const e = porAgenda.get(h.agendaId) ?? { ids: new Set<string>(), hs: [] }; e.ids.add(i.id); e.hs.push(h); porAgenda.set(h.agendaId, e);
    }
    const melhor = [...porAgenda.entries()].sort((a, b) => b[1].ids.size - a[1].ids.size || a[1].hs.map((h) => h.hora).sort()[0].localeCompare(b[1].hs.map((h) => h.hora).sort()[0]))[0];
    if (!melhor) return falhou('COMBO_SEM_AGENDA', `sem agenda para: ${restantes.map((i) => itemCurto(i.nome)).join(', ')}`);
    const [agendaId, e] = melhor;
    const h2 = [...e.hs].sort((a, b) => a.hora.localeCompare(b.hora))[0];
    const grupo = restantes.filter((i) => e.ids.has(i.id));
    const r2 = await criarAgendamento({ pacienteId, unidadeId: unidade.id, agendaId, profissionalId: h2.profissional?.id ?? '', dataHora: h2.dataHora ?? `${h2.data}T${h2.hora}:00-03:00`, procedimentoId: grupo[0].id, procedimentoIds: grupo.map((i) => i.id), comboId: cmb.semCombo ? undefined : cmb.id, observacao: obs });
    if (!r2.ok) return falhou(r2.codigo, `${grupo.map((i) => itemCurto(i.nome)).join(', ')} (${r2.codigo}${r2.mensagem ? `: ${r2.mensagem}` : ''})`, r2.incerto);
    feitos.push({ itens: grupo.map((i) => i.nome), hora: inicioMostrado(h2), prof: nomeDePessoa(h2.profissional?.nome) ?? undefined, profBruto: h2.profissional?.nome });
    extras.push({ ord: cmb.itens.findIndex((i) => i.id === grupo[0].id), txt: `${grupo.map((i) => itemCurto(i.nome)).join(', ')} ${grupo.length > 1 ? 'ficam agendados' : 'fica agendado'} no mesmo dia, a partir das ${inicioMostrado(h2)}, por ordem de chegada.` });
    restantes = restantes.filter((i) => !e.ids.has(i.id));
  }
  // linhas do modelo da clínica: cada serviço com o profissional (ou sala) do cadastro
  const ordemItem = (nome: string) => cmb.itens.findIndex((i) => i.nome === nome);
  const todos = feitos.flatMap((f) => f.itens.map((n) => ({ n, linha: `${n}${f.profBruto ? ` - ${f.profBruto}` : ''}` }))).sort((a, b) => ordemItem(a.n) - ordemItem(b.n));
  const linhas = todos.slice(0, 14).map((x) => x.linha);
  const mais = todos.length - linhas.length;
  if (mais > 0) linhas.push(`E MAIS ${mais} EXAMES DO COMBO`);
  return { ok: true, profissional: nomeDePessoa(principal.profissional?.nome) ?? slot.profissional, profissionalBruto: principal.profissional?.nome ?? slot.profissionalBruto, hora: inicioMostrado(principal), cadastrou, pacienteId, linhas, extra: extras.length ? extras.sort((a, b) => a.ord - b.ord).map((e) => e.txt).join(' ') : undefined };
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

// ---------------- ORÇAMENTO DE EXAMES ----------------
// O paciente manda o pedido médico (foto ou os nomes) e a Amanda acha cada exame no Clinilink. O pedido pode trazer qualquer procedimento (laboratório,
// ultrassom, raio-x...), então a busca olha o catálogo todo, menos consultas e retornos. O preço é SEMPRE o campo `preco` de cada unidade.
const ehExameDoCatalogo = (p: Procedimento) => !/^(consulta|aplica[cç][aã]o|infiltra[cç][aã]o|cauteriza[cç][aã]o|curativo|retirada)\b/i.test(p.nome.trim()) && !/\bretorno\b/i.test(p.nome);
type ExameCat = { id: string; nome: string; categoria?: string; precos: Record<string, number> };

/** Os exames do catálogo (todas as unidades), com o preço de cada unidade. */
async function examesDoCatalogo(): Promise<ExameCat[]> {
  const mapa = new Map<string, ExameCat>();
  for (const c of await listClinicas()) {
    for (const p of await listProcedimentos(c.id, '').catch(() => [] as Procedimento[])) {
      if (!ehExameDoCatalogo(p)) continue;
      const x = mapa.get(p.id) ?? { id: p.id, nome: p.nome.replace(/\s+/g, ' ').trim(), categoria: p.categoria, precos: {} };
      const v = precoDe(p);
      if (v !== undefined) x.precos[nomeUnidade(c)] = v;
      mapa.set(p.id, x);
    }
  }
  return [...mapa.values()];
}

const PALAVRAS_FRACAS_EXAME = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'com', 'para', 'por', 'a', 'o', 'as', 'os', 'exame', 'exames', 'dosagem', 'pesquisa']);
const tokensDeExame = (s: string) => norm(s).replace(/\([^)]*\)/g, ' ').split(/[^a-z0-9]+/).filter((w) => w.length >= 1 && !PALAVRAS_FRACAS_EXAME.has(w));
/** O nome como o paciente escreveu, sem marcador de lista, sem "exame de"/"dosagem de" e sem pontuação solta. */
const limparNomeExame = (s: string) => s.replace(/\s+/g, ' ').replace(/^(?:\s*(?:e|mais|tamb[eé]m|tbm|o|a|os|as)\b[\s,]*)+/i, '').replace(/^[\s\-•*·]+/, '').replace(/^\d{1,2}\s*[.)-]\s+/, '').replace(/^(exame|exames|dosagem|pesquisa)\s+(de|do|da)\s+/i, '').replace(/[.;:,\s]+$/, '').trim().slice(0, 100);

/** Quantas palavras do pedido aparecem no nome do exame (iguais, começo da palavra ou erro de digitação) e quanto do nome do exame elas cobrem. */
function pontuarExame(q: string[], c: ExameCat) {
  const nomes = tokensDeExame(c.nome);
  let hits = 0; let score = 0;
  for (const w of q) { const m = Math.max(0, ...nomes.map((n) => simPalavra(w, n))); if (m >= 2) { hits++; score += m; } }
  return { hits, score, cobertura: hits / Math.max(1, nomes.length) };
}
/** O exame que o nome do pedido é, quando não há dúvida: todas as palavras batem e ou o nome é igual, ou são 2+ palavras, ou só há uma ou duas opções parecidas. */
function melhorForte(nome: string, cat: ExameCat[]): ExameCat | undefined {
  const q = tokensDeExame(nome);
  if (q.length === 0) return undefined;
  const pont = cat.map((c) => ({ c, ...pontuarExame(q, c) })).filter((x) => x.hits === q.length)
    .sort((a, b) => (b.cobertura + (/laborat/i.test(b.c.categoria ?? '') ? 0.3 : 0)) - (a.cobertura + (/laborat/i.test(a.c.categoria ?? '') ? 0.3 : 0)) || b.score - a.score || a.c.nome.length - b.c.nome.length);
  if (pont.length === 0) return undefined;
  const topo = pont[0];
  if (topo.cobertura >= 0.99 || q.length >= 2) return topo.c;
  return pont.length === 1 ? topo.c : undefined; // uma palavra só ("vitamina") com mais de uma opção parecida: dúvida (vai para a IA ou fica sem achar)
}
const SIGLAS_DE_EXAME = new Set(['TSH', 'PCR', 'HDL', 'LDL', 'VLDL', 'TGO', 'TGP', 'PSA', 'VHS', 'T3', 'T4', 'FSH', 'LH', 'DHEA', 'ACTH', 'HIV', 'HCG', 'IGE', 'IGG', 'IGM', 'CPK', 'GGT', 'TTPA', 'EAS', 'FAN', 'ECG', 'USG', 'RX', 'TC', 'RM', 'PTH', 'HPV', 'HBSAG', 'VDRL', 'CEA']);
/** "Transaminase Oxalacetica - Aspartato Aminotransferase (TGO)" -> "Transaminase Oxalacetica (TGO)"; siglas continuam em maiúsculas (TSH, HDL). */
function nomeCurtoDeExame(nome: string): string {
  const base = itemCurto(nome).replace(/\b[\p{L}\d]{1,5}\b/gu, (w) => (SIGLAS_DE_EXAME.has(w.toUpperCase()) ? w.toUpperCase() : w)); const abr = nome.match(/\(([A-Za-z0-9]{2,6})\)\s*$/)?.[1];
  return abr && !norm(base).includes(norm(abr)) ? `${base} (${abr.toUpperCase()})` : base;
}

async function casarExamesFonte(nomes: string[], escolher?: EscolherExames): Promise<{ itens: ItemExame[]; naoAchados: string[]; externos: string[] }> {
  const cat = await examesDoCatalogo();
  const brutos = [...new Set(nomes.map(limparNomeExame).filter((n) => /[\p{L}\d]{2,}/u.test(n)))];
  // "TSH e vitamina D", "TGO/TGP": cada exame é um nome (a menos que o nome inteiro já seja UM exame, como "colesterol total e frações")
  const limpos = [...new Set(brutos.flatMap((n) => {
    if (melhorForte(n, cat)) return [n];
    const partes = n.split(/\s+e\s+|\s*[+&/]\s*/i).map(limparNomeExame).filter((x) => /[\p{L}\d]{2,}/u.test(x));
    return partes.length > 1 ? partes : [n];
  }))];
  const achados: ExameCat[][] = limpos.map(() => []);
  const externos: string[] = [];
  const externoCat = (c: ExameCat) => /extern/i.test(c.categoria ?? '');
  const nomeExterno = (n: string) => (n.length > 50 ? `${n.slice(0, 47)}...` : titulo(n));
  const pend: number[] = [];
  limpos.forEach((n, i) => {
    const f = melhorForte(n, cat);
    if (f) { if (externoCat(f)) externos.push(nomeExterno(n)); else achados[i] = [f]; } // exame de categoria "externo" no catálogo
    else if (ehServicoExterno(n)) externos.push(nomeExterno(n)); // tomografia, ressonância...: não está no catálogo do chatbot e NUNCA vai para a IA (ela não pode trocar por outro exame)
    else pend.push(i);
  });
  if (pend.length && escolher) {
    const ia = await escolher({ nomes: pend.map((i) => limpos[i]), catalogo: cat.map(({ id, nome }) => ({ id, nome })) }).catch(() => null);
    if (ia) pend.forEach((i, k) => { achados[i] = (ia[k] ?? []).map((id) => cat.find((c) => c.id === id)).filter((x): x is ExameCat => Boolean(x)); });
    for (const i of pend) if (achados[i].some(externoCat)) { externos.push(nomeExterno(limpos[i])); achados[i] = []; }
  }
  // sem IA (ou ela não achou): tenta cada pedaço de "hemograma e glicemia", "TGO/TGP"
  for (const i of pend) {
    if (achados[i].length) continue;
    const partes = limpos[i].split(/\s+e\s+|\s*[+&/]\s*/i).map((p) => p.trim()).filter(Boolean);
    if (partes.length < 2) continue;
    const fs = partes.map((p) => melhorForte(p, cat));
    if (fs.every(Boolean)) achados[i] = fs as ExameCat[];
  }
  const itens: ItemExame[] = []; const naoAchados: string[] = [];
  limpos.forEach((n, i) => {
    if (achados[i].length === 0) { if (externos.includes(nomeExterno(n))) return; naoAchados.push(n.length > 40 ? `${n.slice(0, 37)}...` : titulo(n)); return; }
    for (const c of achados[i]) if (!itens.some((x) => x.id === c.id)) itens.push({ id: c.id, nome: nomeCurtoDeExame(c.nome), nomeBruto: c.nome, categoria: c.categoria, precos: c.precos, pedido: n });
  });
  return { itens, naoAchados, externos: [...new Set(externos)] };
}

/** O serviço para agendar a coleta dos exames do orçamento: um exame só é um serviço normal; vários viram UM agendamento (mesmo dia, a mesma agenda no mesmo horário), sem combo. */
async function servicoDeExamesFonte(itens: ItemExame[]): Promise<Servico | { semAgenda: string }> {
  const somaPorUnidade = (nomeUn: string): number | undefined => (itens.every((i) => typeof i.precos[nomeUn] === 'number') ? Math.round(itens.reduce((a, i) => a + i.precos[nomeUn], 0) * 100) / 100 : undefined);
  const itensCombo: ItemDeCombo[] = itens.map((i) => ({ id: i.id, nome: i.nomeBruto, curto: i.nome, categoria: i.categoria }));
  if (itensCombo.length === 1) {
    const d = await montar(await candidatoDoItem(itensCombo[0]));
    return d && 'servico' in d ? d.servico : { semAgenda: itens[0].nome };
  }
  const sv = await etapaDoComboFonte({ id: '', rotulo: 'exames' }, itensCombo);
  if ('semAgenda' in sv) return sv;
  return {
    ...sv, frase: 'os exames do pedido', precoTexto: '',
    unidades: sv.unidades.map((u) => ({ ...u, precoPix: somaPorUnidade(u.nome) })),
    combo: sv.combo ? { ...sv.combo, semCombo: true } : sv.combo,
  };
}

/** Um combo que inclui TODOS os exames pedidos e sai por menos que a soma: vira uma dica no orçamento. */
async function dicaDeComboFonte(itens: ItemExame[], soma: number): Promise<string | undefined> {
  const ids = itens.map((i) => i.id);
  const cands = (await listCombos().catch(() => [] as Combo[]))
    .filter((cb) => { const its = itensDoCombo(cb); return ids.every((id) => its.some((x) => x.id === id)); })
    .map((cb) => ({ cb, total: totalDoCombo(cb) })).filter((x) => x.total !== undefined && x.total < soma - 0.009)
    .sort((a, b) => a.total! - b.total!);
  if (!cands.length) return undefined;
  const { cb, total } = cands[0];
  const extras = itensDoCombo(cb).length - ids.length;
  return `Dica: o combo ${tituloCombo(cb.nome)} inclui todos esses exames${extras > 0 ? ` e mais ${extras}` : ''} e sai por ${reais(total!)}, ${reais(soma - total!)} a menos que a soma. Se preferir o combo, é só me falar.`;
}

export const fonteClinilink: Fonte = {
  tipo: 'clinilink',
  /** O paciente já tem este serviço neste dia? Procura nas unidades e devolve só o que vai para a conversa (unidade, hora, médico). */
  async agendamentoExistente(sv, ymd, pacienteId) {
    if (!pacienteId) return null;
    for (const c of await listClinicas()) {
      const feitos = await listAgendamentosDoDia(c.id, ymd).catch(() => []);
      const a = feitos.find((x) => x.pacienteId === pacienteId && (sv.combo ? sv.combo.itens.some((i) => x.procedimentoIds.includes(i.id)) : x.procedimentoIds.includes(sv.id)));
      if (!a) continue;
      const hora = a.agendaHoraInicio ?? a.dataHora?.slice(11, 16) ?? undefined;
      return { unidade: nomeUnidade(c), hora, periodo: hora ? periodoDe(hora) : undefined, profissional: a.profissional ? titulo(a.profissional) : undefined };
    }
    return null;
  },
  /** Pré-carrega unidades e catálogo (o Clinilink pode demorar para "acordar"): a espera de 15 s do agente já cobre boa parte disso. */
  async aquecer() { await Promise.allSettled([listClinicas().then(() => catalogo()), demandaPorProcedimento()]); },
  async nomesUnidades() { return (await listClinicas()).map(nomeUnidade); },

  async descobrir(t, buscando, forte = false) {
    // combo ("tem combo feminino?"): lista os combos, mostra o que inclui e o preço; escolhido, segue o fluxo normal de unidade, dia e pagamento
    if (buscando && !forte) { const combo = await descobrirCombo(t); if (combo !== undefined) return combo; }
    // "tenho um pedido médico com exames": é o pedido de exames (antes de procurar uma pessoa pelo "com ...")
    if (buscando && !forte && /\b(pedido (medico|de exames?)|requisicao de exames?|solicitacao de exames?|orcamento de exames?|orcar (os )?exames?)\b/.test(t)) return { pedirPedido: true };
    // serviço EXTERNO pedido pelo nome ("tomografia de abdome", "ecocardiograma"): não vira ultrassom só porque cita o mesmo órgão. Se o catálogo do chatbot NÃO tem um
    // serviço com todas as palavras do pedido, é com a equipe (linha de atendimento principal).
    if (buscando && !forte && ehServicoExterno(t)) {
      const q = tokensDeExame(palavrasDoPedido(t).join(' '));
      const catalogoExames = await examesDoCatalogo();
      if (!(q.length > 0 && catalogoExames.some((c) => pontuarExame(q, c).hits === q.length))) {
        const nomeDito = titulo(t.replace(/\b(quero|queria|preciso|precisando|gostaria|marcar|agendar|agendamento|fazer|realizar|um|uma|uns|umas|o|a|os|as|pra|para|por favor|favor)\b/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 60);
        return { servicoExterno: nomeDito || 'esse exame' };
      }
    }
    // pediu uma pessoa pelo nome ("com a dra Rebecca")? acha a pessoa e o atendimento dela com agenda
    const pessoa = await descobrirProfissional(t);
    if (pessoa) return pessoa;
    const raizes = RAIZES.filter((r) => r.re.test(t));
    const termos = raizes.flatMap((r) => [r.busca, ...(r.alt ?? [])]); // ex.: ultrassom -> usg -> ultrassonografia
    const palavras = palavrasDoPedido(t);
    // "exame de sangue", "coleta", "preciso fazer uns exames", "tenho o pedido do médico": como a atendente, pede o pedido médico (foto ou os nomes) para montar o orçamento
    if (buscando && /\b(sangue|laboratori\w*|coleta)\b/.test(t) && palavras.filter((w) => !SO_GENERICAS_DE_SANGUE.has(w)).length === 0) return { pedirPedido: true };
    // pedido genérico: quer AGENDAR um exame (ou uma consulta) e não disse qual -> mostra os que têm agenda
    if (buscando && !forte && termos.length === 0 && palavras.length === 0) {
      const exame = /\b(exames?)\b/.test(t); const consulta = /\b(consultas?)\b/.test(t);
      const querAgendar = /\b(marcar|agendar|agendamento|marcacao|quero|queria|preciso|precisando|gostaria|fazer|realizar|tem vaga|disponivel|horario)\b/.test(t);
      const outroAssunto = /\b(remarc\w*|reagend\w*|desmarc\w*|cancel\w*|resultado|laudo|retorno)\b/.test(t);
      if (exame !== consulta && querAgendar && !outroAssunto) return exame ? { pedirPedido: true } : sugerirPorTipo('consulta');
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
    // tomografia, ressonância, ecocardiograma...: serviço EXTERNO (não aparece no catálogo do chatbot); a equipe atende
    if (buscando && ehServicoExterno(t)) return { servicoExterno: rotulo || palavras.join(' ') || 'esse exame' };
    return rotulo ? { naoAchouServico: rotulo } : undefined;
  },

  async resolver(id) {
    if (id.startsWith('combofam:')) { const ch = id.slice(9); const fam = FAMILIAS_DE_COMBO.find((f) => f.chave === ch); const cs = (await listCombos()).filter((c) => norm(c.nome).includes(ch)); return cs.length ? opcoesDeCombos(cs, fam?.plural) : undefined; }
    if (id.startsWith('combo:')) { const cb = (await listCombos()).find((c) => c.id === id.slice(6)); return cb ? montarCombo(cb) : undefined; }
    if (id.startsWith('prof:')) {
      const pessoa = (await todosProfissionais()).find((x) => x.id === id.slice(5));
      return pessoa ? servicoDaProfissional(pessoa) : undefined;
    }
    const c = conhecidos.get(id);
    return c ? montar(c) : undefined;
  },

  async periodos(sv, un, ymd) {
    if (!un.id) return [];
    if (sv.combo) return horariosDoCombo(sv, un, ymd, ymd);
    return agrupar(await listAgenda({ unidadeId: un.id, dataInicial: ymd, dataFinal: ymd, procedimentoId: sv.id, profissionalId: sv.profissional?.id }));
  },

  async proximas(sv, un, de, max) {
    if (!un.id) return [];
    if (sv.combo) return (await horariosDoCombo(sv, un, de, somaDias(de, 21))).slice(0, max);
    return agrupar(await listAgenda({ unidadeId: un.id, dataInicial: de, dataFinal: somaDias(de, 21), procedimentoId: sv.id, profissionalId: sv.profissional?.id })).slice(0, max);
  },

  async reservar(p: PedidoReserva): Promise<ResultadoReserva> {
    if (p.servico.combo) return reservarCombo(p);
    const { unidade, slot, servico } = p;
    if (!unidade.id) return { ok: false, codigo: 'UNIDADE_SEM_ID', motivo: 'unidade sem id' };
    // 1) horário livre AGORA (sem cache): o primeiro do período escolhido, com o mesmo médico informado ao paciente
    const livres = (await listAgendaFresca({ unidadeId: unidade.id, dataInicial: slot.ymd, dataFinal: slot.ymd, procedimentoId: servico.id, profissionalId: servico.profissional?.id }))
      .filter((h) => periodoDe(h.agendaHoraInicio ?? h.hora) === slot.turno && (!slot.profissionalId || h.profissional?.id === slot.profissionalId))
      .sort((a, b) => a.hora.localeCompare(b.hora));
    if (livres.length === 0) return { ok: false, codigo: 'SEM_VAGA_AGORA', motivo: 'a vaga escolhida acabou de ser preenchida' };

    // 2) paciente: já cadastrado, ou cria agora (CPF_DUPLICADO devolve o existente)
    const pac = await garantirPaciente(p);
    if ('erro' in pac) return pac.erro;
    const { pacienteId, cadastrou } = pac;

    // 3) reserva; se alguém ocupou o horário no meio do caminho, tenta o próximo livre (até 3)
    let ultimo = '';
    for (const h of livres.slice(0, 3)) {
      const dataHora = h.dataHora ?? `${h.data}T${h.hora}:00-03:00`;
      const r = await criarAgendamento({ pacienteId, unidadeId: unidade.id, agendaId: h.agendaId, profissionalId: h.profissional?.id ?? slot.profissionalId ?? '', dataHora, procedimentoId: servico.id, observacao: p.observacao, comboId: p.comboId });
      if (r.ok) return { ok: true, profissional: nomeDePessoa(h.profissional?.nome) ?? slot.profissional, profissionalBruto: h.profissional?.nome ?? slot.profissionalBruto, hora: inicioMostrado(h), cadastrou, pacienteId };
      ultimo = r.codigo;
      if (r.codigo !== 'HORARIO_OCUPADO') return { ok: false, codigo: r.codigo, motivo: r.mensagem || r.codigo, incerto: r.incerto, cadastrou };
    }
    return { ok: false, codigo: ultimo || 'HORARIO_OCUPADO', motivo: 'os horários do período foram ocupados', cadastrou };
  },

  combosComServico: combosComServicoFonte,
  casarExames: casarExamesFonte,
  servicoDeExames: servicoDeExamesFonte,
  dicaDeCombo: dicaDeComboFonte,
  etapaDoCombo: etapaDoComboFonte,

  async paciente(cpf) {
    const lista = await getPacientePorCpf(cpf);
    const p = lista[0];
    return p ? { id: p.id, nome: titulo(p.nome) } : null;
  },
};
