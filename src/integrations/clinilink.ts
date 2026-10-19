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

export type Clinica = { id: string; nome: string; horarioFuncionamento?: string };
export type Procedimento = { id: string; nome: string; categoria?: string; preco?: number; precoDinheiro?: number; preparo?: string | null };
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
  return val;
}

/** Resumo do retorno para o log: contagem + amostra dos itens (sem dados pessoais; paciente só conta). */
function resumo(caminho: string, body: any) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body ?? {})) {
    if (!Array.isArray(v)) continue;
    if (k === 'pacientes') { out.pacientes = { encontrados: v.length }; continue; }
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

export const listClinicas = () =>
  memo('clinicas', 10 * 60_000, async () => (await get<{ clinicas: Clinica[] }>('/v1/agendamento/clinicas', {})).clinicas);

export const listProcedimentos = (unidadeId: string, busca: string) =>
  memo(`proc:${unidadeId}:${busca}`, 10 * 60_000, async () =>
    (await get<{ procedimentos: Procedimento[] }>('/v1/agendamento/procedimentos', { unidadeId, busca })).procedimentos);

export type Profissional = { id: string; nome: string; conselho?: string; especialidade?: string };

/** Profissionais com agenda ativa na unidade; com `procedimentoId`, só quem atende aquele procedimento. */
export const listProfissionais = (unidadeId: string, procedimentoId?: string) =>
  memo(`prof:${unidadeId}:${procedimentoId ?? ''}`, 10 * 60_000, async () =>
    (await get<{ profissionais: Profissional[] }>('/v1/agendamento/profissionais', { unidadeId, procedimentoId })).profissionais);

export const listAgenda = (p: { unidadeId: string; dataInicial: string; dataFinal: string; procedimentoId?: string; profissionalId?: string }) =>
  memo(`agenda:${p.unidadeId}:${p.dataInicial}:${p.dataFinal}:${p.procedimentoId ?? ''}:${p.profissionalId ?? ''}`, 2 * 60_000, async () =>
    (await get<{ horarios: Horario[] }>('/v1/agendamento/agenda', p)).horarios);

export type Paciente = { id: string; nome: string; cpf?: string | null; dataNascimento?: string | null; telefone?: string | null };

/** Consulta de paciente por CPF. Dado pessoal: nunca em cache e nunca logado. */
export async function getPacientePorCpf(cpf: string): Promise<Paciente[]> {
  return (await get<{ pacientes: Paciente[] }>('/v1/agendamento/pacientes', { cpf })).pacientes;
}

// ---------------------------- ESCRITA (exige credencial rw) ----------------------------

export type NovoPaciente = { nome: string; cpf: string; dataNascimento?: string; sexo?: 'feminino' | 'masculino'; telefone?: string };
export type NovoAgendamento = { pacienteId: string; unidadeId: string; agendaId: string; profissionalId: string; dataHora: string; procedimentoId: string; observacao?: string };
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
    procedimentos: [a.procedimentoId], observacao: a.observacao ?? 'Agendado pela Amanda (IA) via WhatsApp', origem: 'whatsapp',
  });

/** Agenda SEM cache: usada no momento de reservar, para pegar o horário livre de verdade. */
export async function listAgendaFresca(p: { unidadeId: string; dataInicial: string; dataFinal: string; procedimentoId?: string; profissionalId?: string }) {
  return (await get<{ horarios: Horario[] }>('/v1/agendamento/agenda', p)).horarios;
}
