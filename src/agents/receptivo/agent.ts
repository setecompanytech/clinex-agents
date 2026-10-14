import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../lib/env.js';
import { describe, getHistory, sendText, transferToSector, type MessageReceivedEvent } from '../../integrations/inovstar.js';
import { buildSystemPrompt } from './prompt.js';

const anthropic = new Anthropic({ apiKey: env.anthropicKey });

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sem banco: o estado vive na Inovstar.
 *  - O agente só atua em atendimentos do setor AGENT_SECTOR_ID e sem atendente atribuído.
 *  - Ao transferir, o atendimento vai para HUMAN_SECTOR_ID, saindo do escopo do agente.
 *  - O histórico vem de GET /attendance/{id}/history.
 */
export async function handleIncoming(ev: MessageReceivedEvent) {
  if (ev.isGroup || ev.isAssigned) return;
  if (!env.agentSectorId || ev.sectorId !== env.agentSectorId) return;

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
    if (env.autoReply && env.humanSectorId) await transferToSector(ev.attendanceId, env.humanSectorId, motivo, msg);
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
