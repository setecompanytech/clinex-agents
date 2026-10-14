import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../lib/env.js';

// Doc: https://inovstar.readme.io — base {gateway}/api, auth "Authorization: Bearer inovstar_<token>"

export type InovstarMessage = {
  _id: string;
  direction: 'in' | 'out';
  type: string;
  text: string | null;
  status: string;
  createdAt: string;
  isWhisper?: boolean;
  transcription?: { text: string | null; status: string };
  media?: { caption?: string | null };
  interactiveReply?: { title?: string | null };
};

export type MessageReceivedEvent = {
  deliveryId: string;
  messageId: string;
  attendanceId: string;
  channelId: string;
  to: string;
  type: string;
  text: string | null;
  sectorId?: string;
  isAssigned: boolean;
  isGroup: boolean;
  attendanceInfo: string;
  contactName?: string;
};

/** Valida X-InovStar-Signature (sha256=<hex>) sobre o corpo cru. Sem segredo configurado, aceita. */
export function verifySignature(rawBody: Buffer | undefined, header: string | undefined): boolean {
  if (!env.webhookSecret) return true;
  if (!rawBody || !header) return false;
  const expected = 'sha256=' + createHmac('sha256', env.webhookSecret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Extrai o que importa de um MESSAGE_RECEIVED; null para qualquer outro evento ou direção. */
export function parseMessageReceived(body: any): MessageReceivedEvent | null {
  if (body?.event !== 'MESSAGE_RECEIVED') return null;
  const d = body.data;
  if (!d || d.direction !== 'in' || !d.attendance?.id) return null;
  return {
    deliveryId: String(body.id),
    messageId: String(d.id),
    attendanceId: String(d.attendance.id),
    channelId: String(d.channel?.id ?? ''),
    to: '+' + String(d.contact?.waId ?? '').replace(/\D/g, ''),
    type: String(d.type),
    text: d.text ?? null,
    sectorId: d.attendance.sector?.id,
    // Na fila (status 'pending', ex.: transferido para um setor) não há dono, mesmo que o webhook
    // ainda traga o usuário que iniciou/transferiu o atendimento.
    isAssigned: Boolean(d.attendance.isAssigned || d.attendance.user) && d.attendance.status !== 'pending',
    attendanceInfo: JSON.stringify({ status: d.attendance.status, isAssigned: d.attendance.isAssigned, user: d.attendance.user?.name, sector: d.attendance.sector?.name }),
    isGroup: Boolean(d.author),
    contactName: d.contact?.name,
  };
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${env.inovstarBase}/api${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.inovstarToken}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Inovstar ${method} ${path} -> ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

/** Últimas mensagens do atendimento, em ordem cronológica.
 * A resposta real difere da doc: `id` (não `_id`), `timestamp` (não `createdAt`) e `text` pode vir como `{ text }`. */
export async function getHistory(attendanceId: string, limit = 30) {
  const q = new URLSearchParams({ limit: String(limit), lightweight: 'true' });
  const r = await request<{ data: { messages: any[] } }>('GET', `/attendance/${attendanceId}/history?${q}`);
  const messages: InovstarMessage[] = r.data.messages.map((m) => ({
    ...m,
    _id: String(m.id ?? m._id),
    text: typeof m.text === 'object' && m.text ? (m.text.text ?? null) : (m.text ?? null),
    createdAt: m.timestamp ?? m.createdAt ?? m.waTimestamp,
    isWhisper: m.isWhisper ?? m.isPrivate,
  }));
  messages.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  return { messages };
}

/** Texto livre; clientMessageId garante idempotência do lado da Inovstar. */
export function sendText(params: { channelId: string; to: string; attendanceId: string; text: string; clientMessageId: string }) {
  return request('POST', '/whatsapp/send/text', params);
}

/** Devolve o atendimento a um setor (fila humana), já avisando o paciente na mesma chamada. */
export function transferToSector(attendanceId: string, sectorId: string, reason: string, message: string) {
  return request('PUT', `/attendance/${attendanceId}/transfer`, {
    toSectorId: sectorId,
    reason: reason.slice(0, 500),
    message,
  });
}

/** Texto legível de uma mensagem para o histórico do agente. */
export function describe(m: InovstarMessage): string | null {
  if (m.isWhisper || m.type === 'system' || m.status === 'whisper') return null;
  if (m.text) return m.text;
  if (m.type === 'audio') return m.transcription?.text ? `[áudio transcrito] ${m.transcription.text}` : '[áudio sem transcrição]';
  if (m.interactiveReply?.title) return m.interactiveReply.title;
  if (m.media?.caption) return `[${m.type}] ${m.media.caption}`;
  return `[${m.type}]`;
}
