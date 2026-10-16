import { env } from '../../lib/env.js';
import { aguardandoTranscricao, describe, getHistory, ilegivel, sendText, textoLimpo, transferToSector, type MessageReceivedEvent } from '../../integrations/inovstar.js';
import { buildSystemPrompt } from './prompt.js';
import { MARCAS_FIM, MARCA_AGENDADO, etapa, responder } from './script/engine.js';
import { fonteSimulada } from './script/catalog.js';
import { fonteClinilink } from './script/clinilinkFonte.js';
import { amigavelDetalhado } from '../../lib/humanizer.js';
import { comAtendimento, evt } from '../../lib/log.js';
import { firstName, followUpMessage, greeting, nowParts, welcomeMessage } from '../../lib/humanize.js';

type Turn = { role: 'user' | 'assistant'; content: string };
type Block = { type: 'text'; text: string } | { type: 'tool_use'; name: string; input: unknown };

async function callClaude(system: string, messages: Turn[]): Promise<Block[]> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: env.model, max_tokens: 600, system, tools, messages }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { content: Block[] }).content;
}

const tools = [
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
/** Nomes de médicos, paciente e cadastro que aparecem no texto: o GPT não pode alterá-los. */
function nomesProtegidos(r: { state?: any; reply: string }): string[] {
  const st = r.state;
  if (!st) return [];
  const nomes: string[] = [
    ...(st.servico?.unidades ?? []).flatMap((u: any) => u.profissionais ?? []),
    st.slot?.profissional, st.paciente?.nome, st.cad?.nome,
  ].filter(Boolean);
  return [...new Set(nomes)].filter((n) => r.reply.toLocaleLowerCase('pt-BR').includes(String(n).toLocaleLowerCase('pt-BR')));
}

const isAllowed = (phone: string) => env.allowedNumbers.some((a) => phoneKey(a) === phoneKey(phone));

const withTitle = (text: string) => (env.agentTitle ? `${env.agentTitle}
${text}` : text);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Faz a resposta parecer digitada: ela só sai entre replyDelayMinMs e replyDelayMaxMs depois que a mensagem
 * do paciente chegou. O tempo já gasto (espera de 4 s, GPT, Clinilink) conta; se já passou do alvo, não espera mais.
 * Mensagem de segurança (emergência/crise) nunca espera.
 */
export async function pareceDigitando(inicio: number, urgente: boolean) {
  const { replyDelayMinMs: min, replyDelayMaxMs: max } = env;
  if (urgente || !(max > 0)) return;
  const alvo = min + Math.random() * Math.max(0, max - min);
  const falta = Math.min(alvo - (Date.now() - inicio), 30000);
  if (falta > 0) await sleep(falta);
}

/**
 * Sem banco: o estado vive na Inovstar.
 *  - O agente só atua em atendimentos do setor AGENT_SECTOR_ID e sem atendente atribuído.
 *  - Ao transferir, o atendimento vai para HUMAN_SECTOR_ID, saindo do escopo do agente.
 *  - O histórico vem de GET /attendance/{id}/history.
 */
export const handleIncoming = (ev: MessageReceivedEvent) => comAtendimento(ev.attendanceId, () => processar(ev));

async function processar(ev: MessageReceivedEvent) {
  const inicio = Date.now();
  const skip = (why: string) => {
    console.log(`[${ev.attendanceId}] ignorado: ${why}`);
    if (!why.includes('fora da whitelist')) evt('ignorado', { motivo: why }); // número de outros pacientes não vira evento (só do piloto)
  };
  if (!isAllowed(ev.to)) return skip(`número ${ev.to} fora da whitelist`);
  if (ev.isGroup) return skip('grupo');
  if (ev.isAssigned) return skip(`atendimento já tem atendente humano ${ev.attendanceInfo}`);
  if (env.agentSectorId && ev.sectorId !== env.agentSectorId) return skip(`setor ${ev.sectorId} != setor da IA`);

  // Debounce: espera o paciente terminar de digitar e só a última mensagem dispara a resposta.
  await sleep(env.debounceMs);
  let { messages: history } = await getHistory(ev.attendanceId);
  // áudio recém-chegado: a transcrição pode levar alguns segundos; espera até ~17 s antes de desistir
  for (let i = 0; i < 7; i++) {
    const ult = [...history].reverse().find((m) => m.direction === 'in');
    if (!ult || ult._id !== ev.messageId || !aguardandoTranscricao(ult)) break;
    await sleep(2500);
    history = (await getHistory(ev.attendanceId)).messages;
  }
  const lastIn = [...history].reverse().find((m) => m.direction === 'in');
  if (lastIn && lastIn._id !== ev.messageId) return skip(`chegou mensagem mais nova (${lastIn._id} != ${ev.messageId}); o webhook dela responde`);

  // Se um humano/bot já respondeu depois da última mensagem do paciente, não duplica.
  const last = history[history.length - 1];
  if (last && last.direction === 'out' && last.status !== 'whisper') return skip(`última mensagem já é de saída (${last.type}); não duplica`);

  // Turnos user/assistant, fundindo consecutivos do mesmo papel
  const turns: Turn[] = [];
  for (const m of history) {
    const content = describe(m);
    if (!content) continue;
    const role = m.direction === 'in' ? 'user' : 'assistant';
    const prev = turns[turns.length - 1];
    if (prev && prev.role === role) prev.content = `${prev.content}\n${content}`;
    else turns.push({ role, content });
  }
  while (turns[0]?.role === 'assistant') turns.shift();
  if (turns.length === 0 || turns[turns.length - 1].role !== 'user') return skip('sem turno do paciente para responder');

  // A Amanda já respondeu nesta conversa? (mensagem de saída que carrega o título da Amanda)
  const marker = env.agentTitle.replace(/\*/g, '').trim();
  const jaRespondeu = Boolean(marker) && history.some((m) => m.direction === 'out' && m.text?.includes(marker));
  const nome = firstName(ev.contactName);

  // Roteiro fixo (sem IA): reprocessa as mensagens do paciente da jornada atual e responde a última.
  // A jornada recomeça depois da última mensagem de confirmação (MARCA_FIM) e é limitada a 12 horas.
  if (env.mode === 'scripted') {
    // A jornada recomeça (1) depois da confirmação do agendamento e (2) depois de qualquer evento do sistema da
    // Inovstar ("Transferido para o setor...", "início de atendimento"): o que veio antes não conta (falhas antigas
    // faziam a Amanda transferir de novo logo na primeira mensagem).
    const fimIdx = history.reduce((acc, m, i) => ((m.direction === 'out' && MARCAS_FIM.some((x) => m.text?.includes(x))) || m.type === 'system' ? i : acc), -1);
    const desde = Date.now() - 12 * 3600 * 1000;
    // turnos: mensagens do paciente entre duas respostas (qualquer saída que não seja nota interna)
    const turnos: string[][] = [];
    let saiuDesdeAUltima = true;
    history.forEach((m, i) => {
      if (m.direction === 'out' && m.status !== 'whisper') { saiuDesdeAUltima = true; return; }
      if (m.direction !== 'in' || i <= fimIdx || +new Date(m.createdAt) <= desde) return;
      const txt = textoLimpo(m);
      if (!txt) return;
      if (saiuDesdeAUltima || turnos.length === 0) turnos.push([]);
      saiuDesdeAUltima = false;
      turnos[turnos.length - 1].push(txt);
    });
    const textos = turnos.flat();
    // a última mensagem é um áudio sem transcrição ou um arquivo sem texto: pede para escrever (não conta como "não entendi")
    const ultimaMsg = [...history].reverse().find((m) => m.direction === 'in');
    const ilg = ultimaMsg && ultimaMsg._id === ev.messageId ? ilegivel(ultimaMsg) : null;
    if (textos.length === 0 && !ilg) return skip('sem mensagens do paciente na jornada atual');
    const fonte = env.clinilinkKey ? fonteClinilink : fonteSimulada;
    const tag = `[${ev.attendanceId}]`;
    let r;
    if (ilg) {
      r = { state: undefined as never, reply: ilg === 'audio' ? 'Não consegui ouvir esse áudio. Pode escrever a sua mensagem ou enviar o áudio de novo?' : 'Por aqui consigo ler texto e ouvir áudio. Pode escrever o que você precisa?', handoff: undefined };
    } else try {
      r = await responder(turnos, { now: new Date(), nome, tz: env.timezone, telefone: ev.to }, fonte);
    } catch (e) {
      // Clinilink fora do ar / lento: não inventa dado, devolve para a equipe
      console.error(`${tag} falha ao consultar a fonte (${fonte.tipo}):`, (e as Error).message);
      r = { state: undefined as never, reply: 'Estou com dificuldade para consultar a agenda agora. Vou pedir para a equipe te ajudar, só um instante.', handoff: { motivo: `Falha ao consultar o Clinilink: ${(e as Error).message}` } };
    }
    if (!r) return skip('roteiro sem resposta');
    // o GPT só reescreve o tom; emergência/crise nunca passam por ele
    const gpt = ilg ? { texto: r.reply, status: 'desligado' as const, motivo: 'mensagem fixa (áudio/arquivo ilegível)' } : r.handoff?.urgente ? { texto: r.reply, status: 'desligado' as const, motivo: 'mensagem de segurança' } : r.reply.includes(MARCA_AGENDADO) ? { texto: r.reply, status: 'desligado' as const, motivo: 'confirmação de agendamento (texto exato)' } : await amigavelDetalhado(r.reply, nomesProtegidos(r));
    const texto = gpt.texto;
    const msg = withTitle(texto);
    evt('resposta', {
      fonte: fonte.tipo,
      etapa: r.state ? etapa(r.state, r.handoff) : ilg ? 'mensagem ilegível (áudio sem transcrição ou arquivo)' : 'falha ao consultar a agenda',
      mensagens_na_jornada: textos.length,
      paciente_disse: ilg ? `[${ilg} ilegível]` : textos[textos.length - 1],
      roteiro: r.reply,
      enviado: msg,
      gpt: gpt.status,
      gpt_motivo: gpt.motivo,
      transferiu: Boolean(r.handoff),
      motivo_transferencia: r.handoff?.motivo,
      enviou_de_verdade: env.autoReply,
    });
    if (!env.autoReply) return;
    await pareceDigitando(inicio, Boolean(r.handoff?.urgente));
    if (r.handoff && env.humanSectorId) {
      try { await transferToSector(ev.attendanceId, env.humanSectorId, r.handoff.motivo, msg); }
      catch (e) {
        // a conversa já foi transferida por outra mensagem do mesmo paciente: nada a fazer
        if (/já está neste setor/i.test((e as Error).message)) evt('ignorado', { motivo: 'atendimento já estava no setor da equipe' });
        else throw e;
      }
    }
    else await sendText({ channelId: ev.channelId, to: ev.to, attendanceId: ev.attendanceId, text: msg, clientMessageId: `agente-receptivo-${ev.messageId}` });
    return;
  }

  // Modo teste (sem ANTHROPIC_API_KEY): valida webhook, leitura do histórico e envio, com resposta fixa.
  if (!env.anthropicKey) {
    console.log(`[${ev.attendanceId}] MODO TESTE: ${turns.length} turnos lidos; última do paciente: "${String(turns[turns.length - 1].content).slice(-120)}"`);
    const fixed = jaRespondeu ? followUpMessage(nome, ev.messageId) : welcomeMessage(nome, ev.messageId);
    console.log(`[${ev.attendanceId}] resposta -> ${fixed}`);
    if (env.autoReply) {
      await sendText({ channelId: ev.channelId, to: ev.to, attendanceId: ev.attendanceId, text: withTitle(fixed), clientMessageId: `agente-receptivo-${ev.messageId}` });
    }
    return;
  }

  const t = nowParts();
  const system = buildSystemPrompt(
    { name: env.clinicName, knowledge: env.knowledge, persona: env.persona },
    { saudacao: greeting(), agora: `${t.weekday}, ${t.day} de ${t.month}, ${t.hour}:${t.minute}`, nomePaciente: nome, primeiraResposta: !jaRespondeu },
  );
  const content = await callClaude(system, turns);

  const text = content.filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text').map((b) => b.text).join('\n').trim();
  const handoff = content.find((b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use' && b.name === 'transferir_para_humano');

  if (handoff) {
    const { motivo, mensagem_ao_paciente } = handoff.input as { motivo: string; mensagem_ao_paciente: string };
    const msg = withTitle(mensagem_ao_paciente || text);
    console.log(`[${ev.attendanceId}] transferir -> ${motivo} | ${msg}`);
    if (env.autoReply) {
      if (env.humanSectorId) await transferToSector(ev.attendanceId, env.humanSectorId, motivo, msg);
      else await sendText({ channelId: ev.channelId, to: ev.to, attendanceId: ev.attendanceId, text: msg, clientMessageId: `agente-receptivo-${ev.messageId}` });
    }
    return;
  }

  if (!text) return skip('modelo não devolveu texto');
  console.log(`[${ev.attendanceId}] resposta -> ${text}`);
  if (env.autoReply) {
    await sendText({
      channelId: ev.channelId,
      to: ev.to,
      attendanceId: ev.attendanceId,
      text: withTitle(text),
      clientMessageId: `agente-receptivo-${ev.messageId}`,
    });
  }
}
