import { env } from '../lib/env.js';

/**
 * Adapter da Inovstar. ATENÇÃO: o formato do webhook de entrada e os endpoints de envio de
 * texto / transferência abaixo são SUPOSIÇÕES (a Inovstar só tinha sido usada aqui para leitura e
 * envio de template). Confirmar na doc e ajustar SÓ este arquivo.
 */

export type IncomingMessage = {
  chatId: string; // attendanceId
  messageId: string;
  text: string;
  fromMe: boolean; // enviada pela clínica (humano ou bot)
  patientName?: string;
  patientPhone?: string;
};

/** Normaliza o payload do webhook; retorna null se não for mensagem de texto. */
export function parseWebhook(body: any): IncomingMessage | null {
  const m = body?.message ?? body?.data?.message ?? body;
  const chatId = body?.attendanceId ?? m?.attendanceId ?? body?.chatId;
  const text = m?.text ?? m?.body;
  const messageId = m?.IdMessage ?? m?.id ?? m?.messageId;
  if (!chatId || !text || !messageId) return null;
  return {
    chatId: String(chatId),
    messageId: String(messageId),
    text: String(text),
    fromMe: Boolean(m?.isSentByMe ?? m?.fromMe),
    patientName: body?.contact?.name ?? m?.senderName,
    patientPhone: body?.contact?.number,
  };
}

async function call(path: string, body: unknown) {
  const res = await fetch(`${env.inovstarBase}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.inovstarToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Inovstar ${path} -> ${res.status}: ${await res.text()}`);
  return res.json().catch(() => ({}));
}

/** Envia texto livre dentro da janela de 24h do WhatsApp. (endpoint a confirmar) */
export function sendText(chatId: string, text: string) {
  return call('/api/chats/send-message', { attendanceId: chatId, text });
}

/** Devolve a conversa para a fila humana. (endpoint a confirmar) */
export function transferToHuman(chatId: string, reason: string) {
  return call('/api/chats/transfer', { attendanceId: chatId, reason });
}
