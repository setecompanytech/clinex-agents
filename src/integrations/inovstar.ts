import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../lib/env.js';
import { evt } from '../lib/log.js';

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
  media?: { caption?: string | null; url?: string | null; mimeType?: string | null; filename?: string | null };
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
    // o texto pode vir como string ou como objeto { text } / { body } (igual ao histórico): sempre devolve string ou null
    text: typeof d.text === 'string' ? d.text : (d.text && typeof d.text === 'object' ? (typeof d.text.text === 'string' ? d.text.text : typeof d.text.body === 'string' ? d.text.body : null) : null),
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
  const t0 = Date.now();
  const rotulo = path.replace(/\/[0-9a-f]{24}/g, '/{id}').split('?')[0];
  const res = await fetch(`${env.inovstarBase}/api${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.inovstarToken}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  evt('inovstar', { metodo: method, caminho: rotulo, status: res.status, ms: Date.now() - t0, ok: res.ok });
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
    // mensagem recebida: { text }; mensagem ENVIADA: { body }. Ler só `.text` deixava as mensagens da Amanda sem texto.
    text: typeof m.text === 'object' && m.text ? (m.text.text ?? m.text.body ?? null) : (m.text ?? null),
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
export function transferToSector(attendanceId: string, sectorId: string, reason: string, message?: string) {
  return request('PUT', `/attendance/${attendanceId}/transfer`, {
    toSectorId: sectorId,
    reason: reason.slice(0, 500),
    ...(message ? { message } : {}),
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

/** Texto do paciente para o ROTEIRO: áudio vira a própria transcrição, sem prefixo. Mídia sem texto não vira "mensagem". */
export function textoLimpo(m: InovstarMessage): string | null {
  if (m.isWhisper || m.type === 'system' || m.status === 'whisper') return null;
  if (m.text) return m.text;
  if (m.type === 'audio') return m.transcription?.text?.trim() || null;
  if (m.interactiveReply?.title) return m.interactiveReply.title;
  if (m.media?.caption) return m.media.caption;
  return null;
}

/** Mensagem do paciente que o roteiro não consegue ler: áudio sem transcrição ou arquivo/imagem sem texto. */
export function ilegivel(m: InovstarMessage): 'audio' | 'arquivo' | null {
  if (m.direction !== 'in' || textoLimpo(m) || m.isWhisper || m.type === 'system' || m.type === 'image' || m.type === 'document') return null; // imagem/documento: o roteiro decide (comprovante)
  return m.type === 'audio' ? 'audio' : 'arquivo';
}

/** Texto do paciente para o roteiro: igual ao textoLimpo, mas imagem/documento viram [[midia:tipo:id]] (comprovante de pix). */
export function textoRoteiro(m: InovstarMessage): string | null {
  if (m.direction === 'in' && (m.type === 'image' || m.type === 'document') && !m.isWhisper) {
    const legenda = textoLimpo(m);
    return `[[midia:${m.type}:${m._id}]]${legenda ? ` ${legenda}` : ''}`;
  }
  return textoLimpo(m);
}

/** A Inovstar só transcreve áudio sob demanda. A chamada é síncrona e o resultado fica em cache do lado deles. */
export async function transcribeMessage(messageId: string): Promise<{ text: string | null; status: string }> {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await request<{ data: { transcription: { text: string | null; status: string } } }>('POST', `/whatsapp/message/${messageId}/transcribe`, {});
      return r.data.transcription;
    } catch (e) {
      if (/TRANSCRIPTION_IN_PROGRESS|-> 409/.test((e as Error).message) && i < 2) { await new Promise((ok) => setTimeout(ok, 2500)); continue; }
      throw e;
    }
  }
  return { text: null, status: 'failed' };
}

// ------------------------------------------------------------------------------------------------ envio ativo por modelo (template)

/** Telefone para a Inovstar: +55 e DDD. Aceita 10 ou 11 dígitos nacionais, com ou sem 55. Devolve null se não for um número brasileiro válido. */
export function paraE164Brasil(bruto: string): string | null {
  let n = String(bruto ?? '').replace(/\D/g, '');
  // 12 ou 13 dígitos começando em 55 já têm o código do país; com 10 ou 11 é número nacional (inclusive DDD 55, do RS)
  // (celular de 11 dígitos tem 9 depois do DDD; assim um número de outro país com 11 dígitos não passa por brasileiro)
  if (n.length === 10 || (n.length === 11 && n[2] === '9')) n = `55${n}`;
  return /^55(\d{2}9\d{8}|\d{10})$/.test(n) ? `+${n}` : null;
}

let canalCache: { id: string; ate: number } | null = null;
/** O WhatsApp conectado da empresa. A Inovstar não tem canal fixo no nosso lado: acha o primeiro `whatsCloud` conectado e guarda por 10 minutos. */
async function canalWhatsApp(): Promise<string> {
  if (canalCache && canalCache.ate > Date.now()) return canalCache.id;
  const emp = await request<{ companies?: { _id: string }[]; data?: { companies?: { _id: string }[] } }>('GET', '/company');
  const empresa = (emp.companies ?? emp.data?.companies ?? [])[0]?._id;
  if (!empresa) throw new Error('A Inovstar não devolveu nenhuma empresa para este token.');
  const cs = await request<{ channels?: { _id: string; type: string; status: string }[]; data?: { channels?: { _id: string; type: string; status: string }[] } }>('GET', `/channels/company/${empresa}`);
  const canal = (cs.channels ?? cs.data?.channels ?? []).find((c) => c.type === 'whatsCloud' && c.status === 'connected');
  if (!canal) throw new Error('Nenhum canal de WhatsApp conectado na Inovstar.');
  canalCache = { id: canal._id, ate: Date.now() + 10 * 60_000 };
  return canal._id;
}
export const esquecerCanal = () => { canalCache = null; };

/** Envia um modelo aprovado (só corpo, com variáveis posicionais {{1}}, {{2}}...). `parametros` na mesma ordem das variáveis do modelo na Meta. */
export async function sendTemplate(p: { to: string; nome: string; idioma: string; parametros: string[]; clientMessageId: string }): Promise<{ messageId?: string; bruto: unknown }> {
  const channelId = await canalWhatsApp();
  const r = await request<{ data?: { whatsappMessageId?: string; messageId?: string }; whatsappMessageId?: string; messageId?: string }>('POST', '/whatsapp/send/template', {
    channelId, to: p.to, clientMessageId: p.clientMessageId,
    template: { name: p.nome, language: p.idioma, components: p.parametros.length ? [{ type: 'BODY', parameters: p.parametros.map((t) => ({ type: 'text', text: String(t).slice(0, 200) })) }] : [] },
  });
  return { messageId: r.data?.whatsappMessageId ?? r.data?.messageId ?? r.whatsappMessageId ?? r.messageId, bruto: r };
}
