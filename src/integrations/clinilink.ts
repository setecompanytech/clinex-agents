import { env } from '../lib/env.js';
import { evt } from '../lib/log.js';

/**
 * Cliente da API de agendamento do Clinilink (Clinex).
 * Doc: clinilink/clinex/docs/api/clinex/agendamento/inovstar/INOVSTAR_API.md
 * Auth: header x-api-key. Leitura usa CLINILINK_API_KEY (perfil "ro" basta); reservar e cadastrar usam
 * CLINILINK_API_KEY_ESCRITA (perfil "rw", entrada em SCHEDULING_API_KEY do servidor). Com chave "ro" o Clinilink recusa a gravação (403) e o agente passa para a equipe.
 * Escrita NUNCA é repetida automaticamente: se o POST der timeout, o resultado é incerto e vai para a equipe.
 *
 * O servidor do Render pode "dormir" e levar até ~1 min para acordar: timeout longo + 1 retry.
 */

export type Clinica = { id: string; nome: string; horarioFuncionamento?: string; endereco?: string; telefone?: string };
export type Procedimento = { id: string; nome: string; categoria?: string; preco?: number; /* precoDinheiro: de propósito NÃO usado, o preço é sempre `preco` */ preparo?: string | null };
export type Horario = { data: string; hora: string; dataHora?: string; agendaId: string; agendaNome?: string; agendaHoraInicio?: string; profissional?: { id: string; nome: string }; unidade?: { id: string; nome: string } };

export class ClinilinkError extends Error {
  constructor(message: string, public status?: number) { super(message); }
}

const cache = new Map<string, { exp: number; val: Promise<unknown> }>();
function memo<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) { evt('clinilink', { cache: true, recurso: key.split(':')[0] }); return hit.val as Promise<T>; }
  const val = fn();
  cache.set(key, { exp: Date.now() + ttlMs, val });
  val.catch(() => cache.delete(key)); // não guarda falha
  // resultado vazio vale só 20 s: quem acabou de liberar um serviço/agenda no Clinilink não espera 10 minutos para a Amanda enxergar
  val.then((v) => { if (Array.isArray(v) && v.length === 0) cache.set(key, { exp: Date.now() + 20_000, val }); }).catch(() => {});
  return val;
}

/** Resumo do retorno para o log: contagem + amostra dos itens (sem dados pessoais; paciente só conta). */
function resumo(caminho: string, body: any) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body ?? {})) {
    if (!Array.isArray(v)) continue;
    if (k === 'pacientes') { out.pacientes = { encontrados: v.length }; continue; }
    if (k === 'agendamentos') { out.agendamentos = { total: v.length }; continue; } // lista com nome/telefone de paciente: só a contagem vai para o log
    out[k] = { total: v.length, amostra: v.slice(0, 5).map((x: any) => ({ unidade: k === 'clinicas' ? x.nome : x.unidade?.nome, procedimento: k === 'procedimentos' ? x.nome : undefined, medico: x.profissional?.nome, id: typeof x.id === 'string' ? x.id.slice(0, 8) : undefined, data: x.data, hora: x.hora, inicioAgenda: x.agendaHoraInicio, preco: x.preco, precoDinheiro: x.precoDinheiro })) };
  }
  return out;
}

async function get<T>(path: string, params: Record<string, string | undefined>): Promise<T> {
  if (!env.clinilinkKey) throw new ClinilinkError('CLINILINK_API_KEY não configurada');
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const url = `${env.clinilinkBase}${path}${qs.size ? `?${qs}` : ''}`;
  const paramsLog = Object.fromEntries(Object.entries(params).filter(([, v]) => v).map(([k, v]) => [k, /^(unidadeId|procedimentoId|profissionalId)$/.test(k) ? String(v).slice(0, 8) : v]));
  let ultimo: unknown;
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const t0 = Date.now();
    try {
      const res = await fetch(url, { headers: { 'x-api-key': env.clinilinkKey }, signal: AbortSignal.timeout(25000) });
      const body: any = await res.json().catch(() => null);
      evt('clinilink', { metodo: 'GET', caminho: path, params: paramsLog, status: res.status, ms: Date.now() - t0, tentativa: tentativa + 1, ok: Boolean(res.ok && body?.ok), erro: body?.erro, retorno: res.ok ? resumo(path, body) : undefined });
      if (res.ok && body?.ok) return body as T;
      if (res.status < 500) throw new ClinilinkError(body?.mensagem ?? `Clinilink ${path} -> ${res.status}`, res.status);
      ultimo = new ClinilinkError(`Clinilink ${path} -> ${res.status}`, res.status);
    } catch (e) {
      if (e instanceof ClinilinkError && (e.status ?? 500) < 500) throw e;
      if (!(e instanceof ClinilinkError)) evt('clinilink', { metodo: 'GET', caminho: path, params: paramsLog, ms: Date.now() - t0, tentativa: tentativa + 1, ok: false, erro: (e as Error).message });
      ultimo = e;
    }
  }
  throw ultimo instanceof Error ? ultimo : new ClinilinkError('Falha ao consultar o Clinilink');
}

/** Só para os testes: esquece o que está em memória. */
export const _limparCache = () => { cache.clear(); semDemandaAte = 0; };

export const listClinicas = () =>
  memo('clinicas', 10 * 60_000, async () => (await get<{ clinicas: Clinica[] }>('/v1/agendamento/clinicas', {})).clinicas);

export const listProcedimentos = (unidadeId: string, busca: string) =>
  memo(`proc:${unidadeId}:${busca}`, 10 * 60_000, async () =>
    (await get<{ procedimentos: Procedimento[] }>('/v1/agendamento/procedimentos', { unidadeId, busca })).procedimentos);

/** Combos ativos: um combo é uma lista de serviços (consulta, exames...) com preço fechado. `preco` de cada item já é o preço DENTRO do combo. */
export type Combo = { id: string; nome: string; servicos: { id: string; nome: string; preco?: number; categoriaNome?: string }[] };
export const listCombos = (unidadeId?: string) =>
  memo(`combos:${unidadeId ?? ''}`, 10 * 60_000, async () => (await get<{ combos: Combo[] }>('/v1/agendamento/combos', unidadeId ? { unidadeId } : {})).combos ?? []);

export type Profissional = { id: string; nome: string; conselho?: string; especialidade?: string };

/** Profissionais com agenda ativa na unidade; com `procedimentoId`, só quem atende aquele procedimento. */
export const listProfissionais = (unidadeId: string, procedimentoId?: string) =>
  memo(`prof:${unidadeId}:${procedimentoId ?? ''}`, 10 * 60_000, async () =>
    (await get<{ profissionais: Profissional[] }>('/v1/agendamento/profissionais', { unidadeId, procedimentoId })).profissionais);

export const listAgenda = (p: { unidadeId: string; dataInicial: string; dataFinal: string; procedimentoId?: string; profissionalId?: string }) =>
  memo(`agenda:${p.unidadeId}:${p.dataInicial}:${p.dataFinal}:${p.procedimentoId ?? ''}:${p.profissionalId ?? ''}`, 2 * 60_000, async () =>
    (await get<{ horarios: Horario[] }>('/v1/agendamento/agenda', p)).horarios);

/**
 * Demanda: quantos agendamentos (não cancelados) cada procedimento teve nos últimos 30 dias, somando as unidades. Serve para sugerir
 * primeiro o que a clínica mais agenda. A listagem do Clinilink traz nome e telefone de paciente: aqui só se CONTA por procedimento,
 * nada disso é guardado, logado ou devolvido. Fica em memória por 6 h. Se falhar, devolve vazio (as sugestões caem na regra
 * de serviços principais) e não tenta de novo por 5 min.
 */
let semDemandaAte = 0;
export async function demandaPorProcedimento(): Promise<Map<string, number>> {
  if (Date.now() < semDemandaAte) return new Map();
  try {
    return await memo('demanda', 6 * 3600_000, async () => {
      const hoje = new Date();
      const ymd = (d: Date) => d.toISOString().slice(0, 10);
      const ini = ymd(new Date(hoje.getTime() - 30 * 86400000)); const fim = ymd(hoje);
      const total = new Map<string, number>();
      for (const c of await listClinicas()) {
        const pagina = (offset: number) => get<{ total?: number; agendamentos: { status?: string; procedimentos?: { id: string }[] }[] }>('/v1/agendamento/agendamentos', { unidadeId: c.id, dataInicial: ini, dataFinal: fim, limite: '500', offset: String(offset) });
        const conta = (r: Awaited<ReturnType<typeof pagina>>) => {
          for (const a of r.agendamentos ?? []) { if (a.status === 'cancelado') continue; for (const p of a.procedimentos ?? []) total.set(p.id, (total.get(p.id) ?? 0) + 1); }
        };
        const primeira = await pagina(0); conta(primeira);
        const paginas = Math.min(8, Math.ceil((primeira.total ?? 0) / 500)); // até 4000 por unidade
        const resto = await Promise.all(Array.from({ length: Math.max(0, paginas - 1) }, (_, i) => pagina((i + 1) * 500)));
        resto.forEach(conta);
      }
      evt('clinilink', { recurso: 'demanda', procedimentos: total.size, agendamentos: [...total.values()].reduce((a, b) => a + b, 0) });
      return total;
    });
  } catch (e) {
    semDemandaAte = Date.now() + 5 * 60_000;
    evt('clinilink', { recurso: 'demanda', erro: (e as Error).message.slice(0, 120) });
    return new Map();
  }
}

/** Um agendamento já feito, SÓ com o que o fluxo precisa (nome, telefone e o resto do paciente ficam de fora desta camada). */
export type AgendamentoFeito = { pacienteId?: string; procedimentoIds: string[]; status: string; dataHora?: string; agendaHoraInicio?: string | null; profissional?: string; unidadeId: string };

/** Agendamentos (não cancelados) de uma unidade em um dia. Dado pessoal: guardado só 1 min em memória e nunca logado. */
export const listAgendamentosDoDia = (unidadeId: string, ymd: string) =>
  memo(`feitos:${unidadeId}:${ymd}`, 60_000, async () => {
    const saida: AgendamentoFeito[] = [];
    for (let offset = 0; offset < 2000; offset += 500) {
      const r = await get<{ total?: number; agendamentos: { status?: string; dataHora?: string; agendaHoraInicio?: string | null; paciente?: { id?: string }; profissional?: { nome?: string }; procedimentos?: { id: string }[] }[] }>(
        '/v1/agendamento/agendamentos', { unidadeId, dataInicial: ymd, dataFinal: ymd, limite: '500', offset: String(offset) });
      for (const a of r.agendamentos ?? []) {
        if (a.status === 'cancelado') continue;
        saida.push({ pacienteId: a.paciente?.id, procedimentoIds: (a.procedimentos ?? []).map((p) => p.id), status: a.status ?? '', dataHora: a.dataHora, agendaHoraInicio: a.agendaHoraInicio, profissional: a.profissional?.nome, unidadeId });
      }
      if (offset + 500 >= (r.total ?? 0)) break;
    }
    return saida;
  });

export type Paciente = { id: string; nome: string; cpf?: string | null; dataNascimento?: string | null; telefone?: string | null };

/** Consulta de paciente por CPF. Dado pessoal: nunca em cache e nunca logado. */
export async function getPacientePorCpf(cpf: string): Promise<Paciente[]> {
  return (await get<{ pacientes: Paciente[] }>('/v1/agendamento/pacientes', { cpf })).pacientes;
}

// ---------------------------- ESCRITA (exige credencial rw) ----------------------------

export type NovoPaciente = { nome: string; cpf: string; dataNascimento?: string; sexo?: 'feminino' | 'masculino'; telefone?: string };
export type NovoAgendamento = { pacienteId: string; unidadeId: string; agendaId: string; profissionalId: string; dataHora: string; procedimentoId: string; observacao?: string; /** combo: vários serviços do mesmo combo no mesmo horário */ comboId?: string; procedimentoIds?: string[] };
export type RespostaEscrita<T> = { ok: true; dados: T } | { ok: false; codigo: string; mensagem: string; incerto?: boolean; corpo?: any };

/** POST sem retry. `incerto` = não sabemos se gravou (timeout/queda/500) e alguém precisa conferir. */
async function post<T>(path: string, corpo: unknown): Promise<RespostaEscrita<T>> {
  if (!env.clinilinkWriteKey) return { ok: false, codigo: 'SEM_CHAVE', mensagem: 'CLINILINK_API_KEY_ESCRITA não configurada' };
  const t0 = Date.now();
  try {
    const res = await fetch(`${env.clinilinkBase}${path}`, { method: 'POST', headers: { 'x-api-key': env.clinilinkWriteKey, 'content-type': 'application/json' }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(40000) });
    const body: any = await res.json().catch(() => null);
    const ok = res.ok && body?.ok;
    // log sem dado pessoal: só o resultado e o código de erro
    evt('clinilink', { metodo: 'POST', caminho: path, status: res.status, ms: Date.now() - t0, ok: Boolean(ok), erro: body?.erro });
    if (ok) return { ok: true, dados: body as T };
    return { ok: false, codigo: String(body?.erro ?? `HTTP_${res.status}`), mensagem: String(body?.mensagem ?? ''), incerto: res.status >= 500, corpo: body };
  } catch (e) {
    evt('clinilink', { metodo: 'POST', caminho: path, ms: Date.now() - t0, ok: false, erro: (e as Error).message });
    return { ok: false, codigo: 'SEM_RESPOSTA', mensagem: (e as Error).message, incerto: true };
  }
}

export const criarPaciente = (p: NovoPaciente) =>
  post<{ paciente?: { id: string; nome: string }; id?: string }>('/v1/agendamento/pacientes', p);

export const criarAgendamento = (a: NovoAgendamento) =>
  post<{ agendamentoId: string; status: string; dataHora: string; profissional?: { nome: string }; valorTotal?: number }>('/v1/agendamento/agendamentos', {
    pacienteId: a.pacienteId, unidadeId: a.unidadeId, agendaId: a.agendaId, profissionalId: a.profissionalId, dataHora: a.dataHora,
    procedimentos: a.procedimentoIds?.length ? a.procedimentoIds : [a.procedimentoId], ...(a.comboId ? { comboId: a.comboId } : {}), observacao: a.observacao ?? 'Agendado pela Amanda (IA) via WhatsApp', origem: 'whatsapp',
  });

/** Agenda SEM cache: usada no momento de reservar, para pegar o horário livre de verdade. */
export async function listAgendaFresca(p: { unidadeId: string; dataInicial: string; dataFinal: string; procedimentoId?: string; profissionalId?: string }) {
  return (await get<{ horarios: Horario[] }>('/v1/agendamento/agenda', p)).horarios;
}
