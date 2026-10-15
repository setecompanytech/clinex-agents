import { getPacientePorCpf, listAgenda, listClinicas, listProcedimentos, type Clinica, type Horario, type Procedimento } from '../../../integrations/clinilink.js';
import { env } from '../../../lib/env.js';
import { RAIZES, type Descoberta, type Fonte, type Periodo, type Servico, type Slot, type Unidade } from './catalog.js';

/** Fonte REAL (somente leitura): unidades, médicos, preços, agenda e pacientes vêm do Clinilink. */

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const titulo = (s: string) => s.toLocaleLowerCase('pt-BR').replace(/(^|[\s-])(\p{L})/gu, (_m, a, b) => a + b.toLocaleUpperCase('pt-BR')).replace(/\b(De|Da|Do|Dos|Das|E)\b/g, (x) => x.toLowerCase());
const reais = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** "CLINEX GUAMÁ" -> "Guamá" */
const nomeUnidade = (c: Clinica) => titulo(c.nome.replace(/^clinex\s+/i, ''));
const STOP = new Set(['quero', 'preciso', 'gostaria', 'marcar', 'agendar', 'consulta', 'exame', 'fazer', 'saber', 'sobre', 'para', 'com', 'uma', 'umas', 'amanha', 'hoje', 'tarde', 'manha', 'noite', 'valor', 'preco', 'quanto', 'custa', 'tenho', 'horario', 'vaga', 'dia', 'semana', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo', 'obrigado', 'obrigada', 'por', 'favor', 'voces', 'tem', 'teste']);

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
  return { ymd: h.data, turno: periodoDe(inicio), inicio, profissional: h.profissional?.nome ? titulo(h.profissional.nome) : undefined };
};
/** Um slot por (data, período): várias horas de uma mesma agenda viram um único período. */
function agrupar(horarios: Horario[]): Slot[] {
  const ordenados = [...horarios].sort((a, b) => (a.data + (a.agendaHoraInicio ?? a.hora)).localeCompare(b.data + (b.agendaHoraInicio ?? b.hora)));
  const vistos = new Set<string>(); const out: Slot[] = [];
  for (const h of ordenados) { const s = slotDe(h); const k = `${s.ymd}|${s.turno}`; if (!vistos.has(k)) { vistos.add(k); out.push(s); } }
  return out;
}

async function montar(c: Cand): Promise<Descoberta> {
  const ini = hojeYmd();
  const fim = somaDias(ini, 30);
  // unidade só conta como disponível com agenda confirmada nesta consulta
  const comAgenda: { u: Clinica; proc: Procedimento; medicos: string[] }[] = [];
  await Promise.all(c.clinicas.map(async (u) => {
    const h = await listAgenda({ unidadeId: u.id, dataInicial: ini, dataFinal: fim, procedimentoId: c.proc.id });
    if (h.length > 0) comAgenda.push({ u, proc: c.proc, medicos: [...new Set(h.map((x) => x.profissional?.nome).filter((x): x is string => Boolean(x)).map(titulo))].slice(0, 3) });
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
    frase: nome.replace(/^Consulta\b/, 'consulta'),
    unidades: comAgenda.map(({ u, medicos }): Unidade => ({ id: u.id, nome: nomeUnidade(u), profissionais: medicos })), precoTexto,
  };
  return { servico };
}

export const fonteClinilink: Fonte = {
  tipo: 'clinilink',
  async nomesUnidades() { return (await listClinicas()).map(nomeUnidade); },

  async descobrir(t, buscando) {
    const raizes = RAIZES.filter((r) => r.re.test(t));
    let termos = raizes.map((r) => r.busca);
    if (termos.length === 0 && buscando) termos = [...new Set(t.split(/[^a-z]+/).filter((w) => w.length >= 5 && !STOP.has(w)))].slice(0, 2);
    if (termos.length === 0) return undefined;
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
    return undefined;
  },

  async resolver(id) {
    const c = conhecidos.get(id);
    return c ? montar(c) : undefined;
  },

  async periodos(sv, un, ymd) {
    if (!un.id) return [];
    return agrupar(await listAgenda({ unidadeId: un.id, dataInicial: ymd, dataFinal: ymd, procedimentoId: sv.id }));
  },

  async proximas(sv, un, de, max) {
    if (!un.id) return [];
    return agrupar(await listAgenda({ unidadeId: un.id, dataInicial: de, dataFinal: somaDias(de, 21), procedimentoId: sv.id })).slice(0, max);
  },

  async paciente(cpf) {
    const lista = await getPacientePorCpf(cpf);
    const p = lista[0];
    return p ? { id: p.id, nome: titulo(p.nome) } : null;
  },
};
