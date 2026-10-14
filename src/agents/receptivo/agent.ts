import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../lib/env.js';
import { db } from '../../lib/supabase.js';
import { sendText, transferToHuman, type IncomingMessage } from '../../integrations/inovstar.js';
import { buildSystemPrompt } from './prompt.js';

const anthropic = new Anthropic({ apiKey: env.anthropicKey });

const tools: Anthropic.Tool[] = [
  {
    name: 'transferir_para_humano',
    description: 'Encaminha a conversa para um atendente humano e encerra a atuação do agente nela.',
    input_schema: {
      type: 'object',
      properties: {
        motivo: { type: 'string', description: 'Resumo para o atendente: quem é, o que quer, o que já foi dito.' },
        mensagem_ao_paciente: { type: 'string', description: 'Mensagem curta avisando o paciente que a equipe continuará.' },
      },
      required: ['motivo', 'mensagem_ao_paciente'],
    },
  },
];

const HISTORY_LIMIT = 30;

export async function handleIncoming(clinicSlug: string, msg: IncomingMessage) {
  const { data: clinic } = await db.from('clinics').select('*').eq('slug', clinicSlug).single();
  if (!clinic) throw new Error(`Clínica desconhecida: ${clinicSlug}`);

  // Idempotência: a Inovstar pode reenviar o mesmo evento
  const role = msg.fromMe ? 'human' : 'patient';
  const { error: dup } = await db
    .from('agent_messages')
    .insert({ clinic_id: clinic.id, chat_id: msg.chatId, external_id: msg.messageId, role, content: msg.text });
  if (dup) return; // já processada

  const now = new Date().toISOString();

  // Mensagem da clínica => só registra. Humano assumiu, agente se cala nessa conversa.
  // TODO: se a Inovstar ecoar no webhook as mensagens enviadas pelo próprio agente, filtrar aqui
  // (comparar com agent_messages role='agent' ou marcar via clientMessageId) para não ser tratado como humano.
  if (msg.fromMe) {
    await db.from('agent_chats').upsert({ clinic_id: clinic.id, chat_id: msg.chatId, handoff: true, handoff_reason: 'humano respondeu', updated_at: now });
    return;
  }

  const { data: chat } = await db.from('agent_chats').select('handoff').eq('clinic_id', clinic.id).eq('chat_id', msg.chatId).maybeSingle();
  if (chat?.handoff) return;
  await db.from('agent_chats').upsert({
    clinic_id: clinic.id, chat_id: msg.chatId, patient_name: msg.patientName, patient_phone: msg.patientPhone, updated_at: now,
  });

  const { data: rows } = await db
    .from('agent_messages').select('role, content').eq('clinic_id', clinic.id).eq('chat_id', msg.chatId)
    .order('created_at', { ascending: false }).limit(HISTORY_LIMIT);
  const history = (rows ?? []).reverse();

  // Mapeia para turnos user/assistant, fundindo consecutivos do mesmo papel
  const messages: Anthropic.MessageParam[] = [];
  for (const r of history) {
    const r2 = r.role === 'patient' ? 'user' : 'assistant';
    const last = messages[messages.length - 1];
    if (last && last.role === r2) last.content = `${last.content}\n${r.content}`;
    else messages.push({ role: r2, content: r.content });
  }
  if (messages[0]?.role === 'assistant') messages.shift();
  if (messages.length === 0) return;

  const resp = await anthropic.messages.create({
    model: env.model,
    max_tokens: 600,
    system: buildSystemPrompt(clinic),
    tools,
    messages,
  });

  let reply = resp.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('\n').trim();
  const handoffCall = resp.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'transferir_para_humano');

  if (handoffCall) {
    const input = handoffCall.input as { motivo: string; mensagem_ao_paciente: string };
    reply = input.mensagem_ao_paciente || reply;
    await db.from('agent_chats').upsert({ clinic_id: clinic.id, chat_id: msg.chatId, handoff: true, handoff_reason: input.motivo, updated_at: now });
  }

  if (reply) {
    if (clinic.auto_reply) await sendText(msg.chatId, reply);
    await db.from('agent_messages').insert({ clinic_id: clinic.id, chat_id: msg.chatId, role: 'agent', content: reply, sent: clinic.auto_reply });
  }
  if (handoffCall && clinic.auto_reply) {
    await transferToHuman(msg.chatId, (handoffCall.input as { motivo: string }).motivo);
  }
}
