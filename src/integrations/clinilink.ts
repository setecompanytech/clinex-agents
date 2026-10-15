import { env } from '../lib/env.js';

/**
 * Cliente SOMENTE LEITURA da API de agendamento do Clinilink (Clinex).
 * Doc: clinilink/clinex/docs/api/clinex/agendamento/inovstar/INOVSTAR_API.md
 * Auth: header x-api-key. Use uma credencial de perfil "ro" (nome:ro:chave em SCHEDULING_API_KEY).
 * Este módulo nunca chama POST/PATCH/DELETE: o agente consulta, não grava.
 *
 * O servidor do Render pode "dormir" e levar até ~1 min para acordar: timeout longo + 1 retry.
 */

export type Clinica = { id: string; nome: string; horarioFuncionamento?: string };
export type Procedimento = { id: string; nome: string; categoria?: string; preco?: number; precoDinheiro?: number; preparo?: string | null };
export type Horario = { data: string; hora: string; agendaId: string; agendaNome?: string; agendaHoraInicio?: string; profissional?: { id: string; nome: string }; unidade?: { id: string; nome: string } };

export class ClinilinkError extends Error {
  constructor(message: string, public status?: number) { super(message); }
}

const cache = new Map<string, { exp: number; val: Promise<unknown> }>();
function memo<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.val as Promise<T>;
  const val = fn();
  cache.set(key, { exp: Date.now() + ttlMs, val });
  val.catch(() => cache.delete(key)); // não guarda falha
  return val;
}

async function get<T>(path: string, params: Record<string, string | undefined>): Promise<T> {
  if (!env.clinilinkKey) throw new ClinilinkError('CLINILINK_API_KEY não configurada');
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const url = `${env.clinilinkBase}${path}${qs.size ? `?${qs}` : ''}`;
  let ultimo: unknown;
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const res = await fetch(url, { headers: { 'x-api-key': env.clinilinkKey }, signal: AbortSignal.timeout(25000) });
      const body: any = await res.json().catch(() => null);
      if (res.ok && body?.ok) return body as T;
      if (res.status < 500) throw new ClinilinkError(body?.mensagem ?? `Clinilink ${path} -> ${res.status}`, res.status);
      ultimo = new ClinilinkError(`Clinilink ${path} -> ${res.status}`, res.status);
    } catch (e) {
      if (e instanceof ClinilinkError && (e.status ?? 500) < 500) throw e;
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

export const listAgenda = (p: { unidadeId: string; dataInicial: string; dataFinal: string; procedimentoId?: string }) =>
  memo(`agenda:${p.unidadeId}:${p.dataInicial}:${p.dataFinal}:${p.procedimentoId ?? ''}`, 2 * 60_000, async () =>
    (await get<{ horarios: Horario[] }>('/v1/agendamento/agenda', p)).horarios);

export type Paciente = { id: string; nome: string; cpf?: string | null; dataNascimento?: string | null; telefone?: string | null };

/** Consulta de paciente por CPF. Dado pessoal: nunca em cache e nunca logado. */
export async function getPacientePorCpf(cpf: string): Promise<Paciente[]> {
  return (await get<{ pacientes: Paciente[] }>('/v1/agendamento/pacientes', { cpf })).pacientes;
}
