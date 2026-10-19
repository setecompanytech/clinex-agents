import { criarAgendamento, criarPaciente, getPacientePorCpf, listAgenda, listAgendaFresca, listClinicas, listProcedimentos, listProfissionais, type Clinica, type Horario, type Procedimento } from '../../../integrations/clinilink.js';
import { env } from '../../../lib/env.js';
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

const slotDe = (h: Horario): Slot => {
  const inicio = h.agendaHoraInicio ?? h.hora;
  return { ymd: h.data, turno: periodoDe(inicio), inicio, profissional: h.profissional?.nome ? titulo(h.profissional.nome) : undefined, profissionalId: h.profissional?.id };
};
/** Um slot por (data, período): várias horas de uma mesma agenda viram um único período. */
function agrupar(horarios: Horario[]): Slot[] {
  const ordenados = [...horarios].sort((a, b) => (a.data + (a.agendaHoraInicio ?? a.hora)).localeCompare(b.data + (b.agendaHoraInicio ?? b.hora)));
  const vistos = new Set<string>(); const out: Slot[] = [];
  for (const h of ordenados) { const s = slotDe(h); const k = `${s.ymd}|${s.turno}`; if (!vistos.has(k)) { vistos.add(k); out.push(s); } }
  return out;
}

async function montar(c: Cand, prof?: { id: string; nome: string }): Promise<Descoberta> {
  const ini = hojeYmd();
  const fim = somaDias(ini, 30);
  // unidade só conta como disponível com agenda confirmada nesta consulta
  const comAgenda: { u: Clinica; proc: Procedimento; medicos: string[] }[] = [];
  await Promise.all(c.clinicas.map(async (u) => {
    const h = await listAgenda({ unidadeId: u.id, dataInicial: ini, dataFinal: fim, procedimentoId: c.proc.id, profissionalId: prof?.id });
    if (h.length > 0) comAgenda.push({ u, proc: c.proc, medicos: prof ? [titulo(prof.nome)] : [...new Set(h.map((x) => x.profissional?.nome).filter((x): x is string => Boolean(x)).map(titulo))].slice(0, 3) });
  }));
  const nome = titulo(c.proc.nome);
  if (comAgenda.length === 0) return { semAgenda: nome };
  comAgenda.sort((a, b) => a.u.nome.localeCompare(b.u.nome));
  comAgenda.forEach(({ u }) => unidadesPorId.set(u.id, u));

  // preço: um valor se for igual nas unidades, senão por unidade. Sem valor, não cita.
  const porUnidade = new Map<string, string>();
  for (const { u, proc } of comAgenda) {
    const base = proc.precoDinheiro ?? proc.preco;
    const dif = proc.precoDinheiro !== undefined && proc.preco !== undefined && proc.precoDinheiro !== proc.preco;
    if (base !== undefined && base !== null) porUnidade.set(nomeUnidade(u), `${reais(base)}${dif ? ', no dinheiro ou Pix' : ''}`);
  }
  const valores = [...new Set(porUnidade.values())];
  const consulta = /consulta/i.test(c.proc.nome) || /consulta/i.test(c.proc.categoria ?? '');
  const sujeito = consulta ? 'A consulta' : 'O exame';
  const precoTexto = valores.length === 0 ? '' : valores.length === 1 ? `${sujeito} custa ${valores[0]}.` : `${[...porUnidade].map(([u, v]) => `No ${u}, ${sujeito.toLowerCase()} custa ${v}`).join('. ')}.`;

  const servico: Servico = {
    id: c.proc.id, nome, tipo: consulta ? 'consulta' : 'exame',
    frase: `${nome.replace(/^Consulta\b/, 'consulta')}${prof ? ` com ${titulo(prof.nome)}` : ''}`,
    profissional: prof ? { id: prof.id, nome: titulo(prof.nome) } : undefined,
    unidades: comAgenda.map(({ u, medicos, proc }): Unidade => ({ id: u.id, nome: nomeUnidade(u), profissionais: medicos, precoPix: proc.precoDinheiro ?? proc.preco ?? undefined })), precoTexto,
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

/** Distância de edição <= 1 ("rebeca" ~ "rebecca"). */
function perto(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  const [c, l] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  while (i < c.length && c[i] === l[i]) i++;
  return c.length === l.length ? c.slice(i + 1) === l.slice(i + 1) : c.slice(i) === l.slice(i + 1);
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
  if (empatados.length > 1) return { opcoes: empatados.slice(0, 4).map(({ p }) => ({ id: `prof:${p.id}`, nome: `${titulo(p.nome)}${p.especialidade ? ` (${p.especialidade})` : ''}` })) };
  return servicoDaProfissional(pont[0].p);
}

export const fonteClinilink: Fonte = {
  tipo: 'clinilink',
  async nomesUnidades() { return (await listClinicas()).map(nomeUnidade); },

  async descobrir(t, buscando) {
    // pediu uma pessoa pelo nome ("com a dra Rebecca")? acha a pessoa e o atendimento dela com agenda
    const pessoa = await descobrirProfissional(t);
    if (pessoa) return pessoa;
    const raizes = RAIZES.filter((r) => r.re.test(t));
    let termos = raizes.flatMap((r) => [r.busca, ...(r.alt ?? [])]); // ex.: ultrassom -> usg -> ultrassonografia
    const solto = [...new Set(t.split(/[^a-z]+/).filter((w) => w.length >= 5 && !STOP.has(w)))].slice(0, 2);
    // palavra solta: tenta inteira e depois só o radical ("ergometrico" -> "ergometr" acha "ergometria"), para pegar nome igual ou parecido
    if (termos.length === 0 && buscando) termos = solto.flatMap((w) => (w.length >= 8 ? [w, w.slice(0, w.length - 3)] : [w]));
    if (termos.length === 0) return undefined;
    const pediu = /\b(quero|queria|preciso|gostaria|marcar|agendar|fazer|realizar|consulta|exame)\b/.test(t);
    const rotulo = raizes[0]?.nome ?? (pediu && buscando ? solto.join(' ') : '');
    const viaSintoma = raizes.some((r) => r.sintoma?.test(t));

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
      const cands = [...mapa.values()].sort((a, b) => pontuar(b.proc, t) - pontuar(a.proc, t));
      const melhor = pontuar(cands[0].proc, t);
      const empatados = cands.filter((x) => pontuar(x.proc, t) === melhor);
      if (empatados.length > 1) return { opcoes: empatados.slice(0, 4).map((x) => ({ id: x.proc.id, nome: titulo(x.proc.nome) })) };
      const d = await montar(cands[0]);
      return d && 'servico' in d ? { servico: { ...d.servico, viaSintoma } } : d;
    }
    // nada com esse nome nem parecido (ou não está liberado para agendamento pelo chatbot): o paciente fica sabendo
    evt('servico_nao_encontrado', { termo: rotulo || solto.join(' '), tentativas: termos });
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
      if (r.ok) return { ok: true, profissional: h.profissional?.nome ? titulo(h.profissional.nome) : slot.profissional, hora: h.agendaHoraInicio ?? h.hora, cadastrou };
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
