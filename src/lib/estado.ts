import { env } from './env.js';
import { evt } from './log.js';

/**
 * Estado da conversa guardado entre uma mensagem e a seguinte (Redis, protocolo REST da Upstash).
 *
 * Sem isso a Amanda reprocessa TODAS as mensagens do paciente a cada resposta, e qualquer coisa que mude no meio da conversa (uma
 * versão nova do código, a agenda do Clinilink, a data de "amanhã") muda o que ela entende das mensagens antigas: ela "se perde".
 * Guardado, ela continua exatamente de onde parou. Sem o Redis configurado (ou se ele cair), tudo funciona como antes, reprocessando.
 *
 * O que fica guardado tem prazo (24 h) e é apagado quando o agendamento é concluído, pois carrega nome e CPF do paciente.
 */
export const ESQUEMA_ESTADO = 1;
const TTL_SEGUNDOS = 24 * 3600;

export type EstadoGuardado = {
  v: number;
  jornada: string; // id da primeira mensagem do paciente da jornada: outra jornada, outro estado
  ate: string; // id da última mensagem do paciente já respondida
  state: unknown; // o State do roteiro
  duro: boolean; // houve transferência dura (humano/urgência): a Amanda não retoma sozinha
  passos?: number; // mensagens do paciente já processadas (as frases variam com esse número)
};

const chave = (attendanceId: string) => `amanda:estado:${attendanceId}`;

async function comando<T>(cmd: (string | number)[]): Promise<T | null> {
  if (!env.redisUrl || !env.redisToken) return null;
  try {
    const res = await fetch(env.redisUrl, {
      method: 'POST', headers: { Authorization: `Bearer ${env.redisToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(cmd), signal: AbortSignal.timeout(3000),
    });
    const j: any = await res.json().catch(() => null);
    if (!res.ok || j?.error) { evt('erro', { mensagem: `estado (${cmd[0]}): ${String(j?.error ?? res.status).slice(0, 120)}` }); return null; }
    return (j?.result ?? null) as T | null;
  } catch (e) {
    evt('erro', { mensagem: `estado (${cmd[0]}): ${(e as Error).message.slice(0, 120)}` });
    return null;
  }
}

export const estadoAtivo = () => Boolean(env.redisUrl && env.redisToken);

export async function lerEstado(attendanceId: string): Promise<EstadoGuardado | null> {
  const bruto = await comando<string>(['GET', chave(attendanceId)]);
  if (!bruto) return null;
  try {
    const e = JSON.parse(bruto) as EstadoGuardado;
    return e && e.v === ESQUEMA_ESTADO && typeof e.jornada === 'string' && typeof e.ate === 'string' && e.state && typeof e.state === 'object' ? e : null;
  } catch { return null; }
}

export async function guardarEstado(attendanceId: string, e: Omit<EstadoGuardado, 'v'>): Promise<void> {
  await comando(['SET', chave(attendanceId), JSON.stringify({ v: ESQUEMA_ESTADO, ...e }), 'EX', TTL_SEGUNDOS]);
}

export async function apagarEstado(attendanceId: string): Promise<void> {
  await comando(['DEL', chave(attendanceId)]);
}

// ------------------------------------------------------------------------------------------------ trava por atendimento
/**
 * Uma resposta por vez em cada atendimento. A Vercel roda várias instâncias ao mesmo tempo: duas mensagens do MESMO paciente podem cair em
 * instâncias diferentes, e sem trava as duas responderiam com o mesmo estado. Pacientes diferentes nunca esperam um pelo outro (a chave é o
 * atendimento). Sem Redis (ou com ele fora do ar) não trava: segue como antes, para nunca deixar ninguém sem resposta.
 */
export async function travarAtendimento(attendanceId: string, esperaMs = 55_000): Promise<{ soltar: () => Promise<void> } | null> {
  const livre = { soltar: async () => {} };
  if (!estadoAtivo()) return livre;
  const k = `amanda:trava:${attendanceId}`;
  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const ate = Date.now() + esperaMs;
  while (Date.now() < ate) {
    let r = null as { result?: unknown; error?: unknown } | null;
    try {
      const res = await fetch(env.redisUrl!, { method: 'POST', headers: { Authorization: `Bearer ${env.redisToken}`, 'content-type': 'application/json' }, body: JSON.stringify(['SET', k, token, 'NX', 'PX', 100_000]), signal: AbortSignal.timeout(3000) });
      r = res.ok ? ((await res.json().catch(() => null)) as typeof r) : null;
    } catch { r = null; }
    if (!r || r.error) { evt('erro', { mensagem: 'trava do atendimento: Redis indisponível, seguindo sem trava' }); return livre; }
    if (r.result === 'OK') {
      return { soltar: async () => { await comando(['EVAL', "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, k, token]); } };
    }
    await new Promise((ok) => setTimeout(ok, 800));
  }
  return null;
}

// ------------------------------------------------------------------------------------------------ memória da Amanda IA
/** Memória da Amanda IA por atendimento (serviços consultados, horários oferecidos, paciente identificado). 24 h; apagada ao encerrar. */
const chaveIA = (attendanceId: string) => `amanda:ia:${attendanceId}`;
export async function lerMemoriaIA<T>(attendanceId: string): Promise<T | null> {
  const bruto = await comando<string>(['GET', chaveIA(attendanceId)]);
  if (!bruto) return null;
  try { return JSON.parse(bruto) as T; } catch { return null; }
}
export async function guardarMemoriaIA(attendanceId: string, m: unknown): Promise<void> {
  await comando(['SET', chaveIA(attendanceId), JSON.stringify(m), 'EX', TTL_SEGUNDOS]);
}
