import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../lib/env.js';
import { describe, getHistory, sendText, transferToSector, type MessageReceivedEvent } from '../../integrations/inovstar.js';
import { buildSystemPrompt } from './prompt.js';

const anthropic = env.anthropicKey ? new Anthropic({ apiKey: env.anthropicKey }) : null;

const tools: Anthropic.Tool[] = [
  {
    name: 'transferir_para_humano',
    description: 'Encaminha a conversa para a fila de atendentes humanos e encerra a atuação do agente nela.',
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

/** Chave DDD + 8 últimos dígitos: ignora +55 e a diferença do nono dígito. */
const phoneKey = (v: string) => {
  let n = v.replace(/\D/g, '');
  if (n.length >= 12 && n.startsWith('55')) n = n.slice(2);
  return n.slice(0, 2) + n.slice(-8);
};
const isAllowed = (phone: string) => env.allowedNumbers.some((a) => phoneKey(a) === phoneKey(phone));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sem banco: o estado vive na Inovstar.
 *  - O agente só atua em atendimentos do setor AGENT_SECTOR_ID e sem atendente atribuído.
 *  - Ao transferir, o atendimento vai para HUMAN_SECTOR_ID, saindo do escopo do agente.
 *  - O histórico vem de GET /attendance/{id}/history.
 */
export async function handleIncoming(ev: MessageReceivedEvent) {
  const skip = (why: string) => console.log(`[${ev.attendanceId}] ignorado: ${why}`);
  if (!isAllowed(ev.to)) return skip(`número ${ev.to} fora da whitelist`);
  if (ev.isGroup) return skip('grupo');
  if (ev.isAssigned) return skip('atendimento já tem atendente humano');
  if (env.agentSectorId && ev.sectorId !== env.agentSectorId) return skip(`setor ${ev.sectorId} != setor da IA`);

  // Debounce: espera o paciente terminar de digitar e só a última mensagem dispara a resposta.
  await sleep(env.debounceMs);
  const { messages: history } = await getHistory(ev.attendanceId);
  const lastIn = [...history].reverse().find((m) => m.direction === 'in');
  if (lastIn && lastIn._id !== ev.messageId) return; // chegou mensagem mais nova; o webhook dela responde

  // Se um humano/bot já respondeu depois da última mensagem do paciente, não duplica.
  const last = history[history.length - 1];
  if (last && last.direction === 'out' && last.status !== 'whisper') return;

  // Turnos user/assistant, fundindo consecutivos do mesmo papel
  const turns: Anthropic.MessageParam[] = [];
  for (const m of history) {
    const content = describe(m);
    if (!content) continue;
    const role = m.direction === 'in' ? 'user' : 'assistant';
    const prev = turns[turns.length - 1];
    if (prev && prev.role === role) prev.content = `${prev.content}\n${content}`;
    else turns.push({ role, content });
  }
  while (turns[0]?.role === 'assistant') turns.shift();
  if (turns.length === 0 || turns[turns.length - 1].role !== 'user') return;

  // Modo teste (sem ANTHROPIC_API_KEY): valida webhook, leitura do histórico e envio, com resposta fixa.
  if (!anthropic) {
    console.log(`[${ev.attendanceId}] MODO TESTE: ${turns.length} turnos lidos; última do paciente: "${String(turns[turns.length - 1].content).slice(-120)}"`);
    const fixed = env.testReply;
    console.log(`[${ev.attendanceId}] resposta -> ${fixed}`);
    if (env.autoReply) {
      await sendText({ channelId: ev.channelId, to: ev.to, attendanceId: ev.attendanceId, text: fixed, clientMessageId: `agente-receptivo-${ev.messageId}` });
    }
    return;
  }

  const resp = await anthropic.messages.create({
    model: env.model,
    max_tokens: 600,
    system: buildSystemPrompt({ name: env.clinicName, knowledge: env.knowledge, persona: env.persona }),
    tools,
    messages: turns,
  });

  const text = resp.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('\n').trim();
  const handoff = resp.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'transferir_para_humano');

  if (handoff) {
    const { motivo, mensagem_ao_paciente } = handoff.input as { motivo: string; mensagem_ao_paciente: string };
    const msg = mensagem_ao_paciente || text;
    console.log(`[${ev.attendanceId}] transferir -> ${motivo} | ${msg}`);
    if (env.autoReply) {
      if (env.humanSectorId) await transferToSector(ev.attendanceId, env.humanSectorId, motivo, msg);
      else await sendText({ channelId: ev.channelId, to: ev.to, attendanceId: ev.attendanceId, text: msg, clientMessageId: `agente-receptivo-${ev.messageId}` });
    }
    return;
  }

  if (!text) return;
  console.log(`[${ev.attendanceId}] resposta -> ${text}`);
  if (env.autoReply) {
    await sendText({
      channelId: ev.channelId,
      to: ev.to,
      attendanceId: ev.attendanceId,
      text,
      clientMessageId: `agente-receptivo-${ev.messageId}`,
    });
  }
}
