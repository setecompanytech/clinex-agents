import { env } from '../../lib/env.js';
import { describe, getHistory, ilegivel, sendText, textoRoteiro, transcribeMessage, transferToSector, type InovstarMessage, type MessageReceivedEvent } from '../../integrations/inovstar.js';
import { analisarComprovante, type Comprovante } from '../../lib/comprovante.js';
import { analisarPedidoMedico, type PedidoLido } from '../../lib/pedidoMedico.js';
import { escolherExames } from '../../lib/interpretarExames.js';
import { buildSystemPrompt } from './prompt.js';
import { MARCAS_FIM, MARCA_ADEUS, MARCA_AGENDADO, MARCA_DUP, MARCA_MAIS, SEM_GPT, ehUrgencia, estadoDepoisDaResposta, etapa, handoffDuro, responder, type Pos, type Result, type State } from './script/engine.js';
import { apagarEstado, estadoAtivo, guardarEstado, guardarMemoriaIA, lerEstado, lerMemoriaIA, travarAtendimento } from '../../lib/estado.js';
import { atenderComIA } from './ia/atender.js';
import { memoriaNova, type MemoriaIA } from './ia/ferramentas.js';
import { fonteSimulada } from './script/catalog.js';
import { fonteClinilink } from './script/clinilinkFonte.js';
import { amigavelDetalhado, temPrecoZero } from '../../lib/humanizer.js';
import { interpretarEscolha } from '../../lib/interpretar.js';
import { interpretarPedido } from '../../lib/interpretarPedido.js';
import { entenderNoContexto, type MensagemConversa } from '../../lib/contexto.js';
import { exibir } from '../../lib/genero.js';
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
  // médicos: a forma que aparece na conversa ("Dra. Fernanda", "Dr. Armando"); pacientes: o nome como está no cadastro
  const medicos: string[] = [
    ...(st.servico?.unidades ?? []).flatMap((u: any) => [...(u.profissionais ?? []), ...(u.porServico ?? []).flatMap((x: any) => x.profissionais ?? [])]),
    st.slot?.profissional, st.servico?.profissional?.nome,
  ].filter(Boolean).map((n: string) => exibir(n));
  // o nome do serviço ("consulta Cardiologista com a Dra. Fernanda", "Teste Ergometrico") também não pode ser trocado nem encurtado
  const nomes: string[] = [...medicos, st.paciente?.nome, st.cad?.nome, st.servico?.frase].filter(Boolean);
  return [...new Set(nomes)].filter((n) => r.reply.toLocaleLowerCase('pt-BR').includes(String(n).toLocaleLowerCase('pt-BR')));
}

/** Sem lista (ALLOWED_NUMBERS vazio): atende qualquer número que esteja no setor da IA. Com lista: só esses números (piloto). */
/** Aviso do sistema da Inovstar de que a conversa foi para o setor da IA ("Transferido pelo Assistente para o setor Agente IA"). */
const TRANSF_PARA_IA = /transferid[oa]\b.*\bsetor\b.*\bagente\s*(de\s*)?ia\b/i;
const isAllowed = (phone: string) => env.allowedNumbers.length === 0 || env.allowedNumbers.some((a) => phoneKey(a) === phoneKey(phone));

const withTitle = (text: string) => (env.agentTitle ? `${env.agentTitle}
${text}` : text);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Comprovantes já lidos (por id da mensagem), para não reler a imagem a cada reprocessamento da conversa. */
const comprovantes = new Map<string, Promise<Comprovante | null>>();
function lerComprovanteDe(history: InovstarMessage[]) {
  return (id: string): Promise<Comprovante | null> => {
    let p = comprovantes.get(id);
    if (!p) {
      p = (async () => {
        const m = history.find((x) => x._id === id);
        const url = m?.media?.url;
        if (!url || !/^https:\/\//.test(url)) return null;
        const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
        if (!res.ok) return null;
        const bytes = Buffer.from(await res.arrayBuffer());
        if (bytes.length > 8_000_000) return null;
        return analisarComprovante(bytes, m?.media?.mimeType ?? res.headers.get('content-type') ?? '');
      })().catch(() => null);
      comprovantes.set(id, p);
    }
    return p;
  };
}

/** Pedidos médicos já lidos (por id da mensagem): a foto não é relida a cada mensagem do paciente. */
const pedidos = new Map<string, Promise<PedidoLido | null>>();
function lerPedidoDe(history: InovstarMessage[]) {
  return (id: string): Promise<PedidoLido | null> => {
    let p = pedidos.get(id);
    if (!p) {
      p = (async () => {
        const m = history.find((x) => x._id === id);
        const url = m?.media?.url;
        if (!url || !/^https:\/\//.test(url)) return null;
        const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
        if (!res.ok) return null;
        const bytes = Buffer.from(await res.arrayBuffer());
        if (bytes.length > 12_000_000) return null;
        return analisarPedidoMedico(bytes, m?.media?.mimeType ?? res.headers.get('content-type') ?? '');
      })().catch(() => null);
      pedidos.set(id, p);
    }
    return p;
  };
}

/**
 * Faz a resposta parecer digitada por uma pessoa: espera o tempo de ler e escrever AQUELE texto (resposta grande demora mais).
 * Mensagem de segurança (emergência/crise) nunca espera.
 */
export async function pareceDigitando(inicio: number, urgente: boolean, texto = '', primeiro = true) {
  if (urgente) return;
  const ms = tempoDeDigitacao(texto, primeiro);
  // a função da Vercel vive 120 s: a "digitação" nunca come o tempo que falta para enviar
  const espera = Math.min(ms, LIMITE_FUNCAO_MS - (Date.now() - inicio) - 3000);
  if (espera > 0) await sleep(espera);
}

const LIMITE_FUNCAO_MS = 110_000;

/**
 * Quanto uma pessoa levaria para ler e digitar este texto: de 1 a 2 s de leitura (só no primeiro balão; nos seguintes, uma pausa
 * curta) mais ~40 ms por caractere, com variação de 15% para não ficar cronometrado, entre o mínimo e o máximo de cada balão.
 * Contado a partir de AGORA (resposta pronta), não de quando a mensagem do paciente chegou.
 */
export function tempoDeDigitacao(texto: string, primeiro: boolean): number {
  const { replyDelayMinMs: min, replyDelayMaxMs: max, typingMsPerChar: porChar } = env;
  if (!(max > 0)) return 0;
  const leitura = primeiro ? 1000 + Math.random() * 1000 : 400 + Math.random() * 600;
  const digitando = texto.length * porChar * (0.85 + Math.random() * 0.3);
  return Math.round(Math.min(max, Math.max(min, leitura + digitando)));
}

/** Parágrafos separados por linha em branco viram balões separados (até 4), como uma pessoa que manda um texto em partes. */
export function dividirEmBaloes(texto: string): string[] {
  const partes = texto.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  // a confirmação de um combo traz o modelo da clínica de CADA agendamento: cada um precisa do seu balão (para o paciente encaminhar ou guardar)
  const max = /\(COMBO [^)\n]+\)/.test(texto) ? 9 : 4;
  if (partes.length <= max) return partes.length ? partes : [texto];
  return [...partes.slice(0, max - 1), partes.slice(max - 1).join('\n')];
}

/**
 * Sem banco: o estado vive na Inovstar.
 *  - O agente só atua em atendimentos do setor AGENT_SECTOR_ID e sem atendente atribuído.
 *  - Ao transferir, o atendimento vai para HUMAN_SECTOR_ID, saindo do escopo do agente.
 *  - O histórico vem de GET /attendance/{id}/history.
 */
export const handleIncoming = (ev: MessageReceivedEvent) => comAtendimento(ev.attendanceId, () => processar(ev));

/**
 * Turnos do paciente (mensagens entre duas respostas da Amanda) a partir do fim da jornada anterior. `duplicados` = índices dos turnos
 * cuja resposta foi o aviso "Vi que esse paciente já tem ...": a conversa continua dali (não recomeça), então o roteiro precisa saber.
 */
export function montarTurnos(history: InovstarMessage[], fimIdx: number, desde: number): { turnos: string[][]; duplicados: number[] } {
  const turnos: string[][] = [];
  const duplicados: number[] = [];
  let saiuDesdeAUltima = true;
  history.forEach((m, i) => {
    if (m.direction === 'out' && m.status !== 'whisper') {
      if (!saiuDesdeAUltima && turnos.length > 0 && i > fimIdx && m.text?.includes(MARCA_DUP)) duplicados.push(turnos.length - 1);
      saiuDesdeAUltima = true;
      return;
    }
    if (m.direction !== 'in' || i <= fimIdx || +new Date(m.createdAt) <= desde) return;
    const txt = textoRoteiro(m);
    if (!txt) return;
    if (saiuDesdeAUltima || turnos.length === 0) turnos.push([]);
    saiuDesdeAUltima = false;
    turnos[turnos.length - 1].push(txt);
  });
  return { turnos, duplicados };
}

/**
 * A conversa lida ANTES de responder: as últimas mensagens dos DOIS lados (sem o título da Amanda nem notas internas) e o trecho da
 * última confirmação de agendamento (até 24 h), para responder "já tá agendado?" com o que foi confirmado.
 */
export function lerConversa(history: InovstarMessage[]): { conversa: MensagemConversa[]; confirmacao?: string } {
  const limpa = (t: string) => t.replace(/^\*[^*\n]+\*\s*/, '').replace(/\[\[midia:[^\]]+\]\]/g, '[imagem]').trim();
  const conversa: MensagemConversa[] = history
    .filter((m) => m.type !== 'system' && m.status !== 'whisper' && !m.isWhisper)
    .map((m) => ({ de: (m.direction === 'in' ? 'paciente' : 'amanda') as MensagemConversa['de'], texto: limpa(textoRoteiro(m) ?? '').slice(0, 400) }))
    .filter((m) => m.texto)
    .slice(-12);
  // a confirmação é o balão com o modelo da clínica ("Paciente: ... Procedimento: ... Data: ..."), enviado até 24 h atrás
  const conf = [...history].reverse().find((m) => m.direction === 'out' && /Paciente:[\s\S]*Procedimento:/.test(m.text ?? '') && Date.now() - +new Date(m.createdAt) < 24 * 3600 * 1000);
  const confirmacao = conf?.text?.replace(/^\*[^*\n]+\*\s*/, '').trim();
  return { conversa, confirmacao };
}

async function processar(ev: MessageReceivedEvent) {
  const inicio = Date.now();
  const skip = (why: string) => {
    console.log(`[${ev.attendanceId}] ignorado: ${why}`);
    if (!why.includes('fora da whitelist')) evt('ignorado', { motivo: why }); // número de outros pacientes não vira evento (só do piloto)
  };
  // segurança: sem lista de números E sem setor da IA configurado, ela responderia qualquer conversa de qualquer setor
  if (env.allowedNumbers.length === 0 && !env.agentSectorId) return skip('sem AGENT_SECTOR_ID e sem lista de números: não atende ninguém');
  if (!isAllowed(ev.to)) return skip(`número ${ev.to} fora da whitelist`);
  if (ev.isGroup) return skip('grupo');
  if (ev.isAssigned) return skip(`atendimento já tem atendente humano ${ev.attendanceInfo}`);
  // Conversa parada na fila da equipe, sem atendente: se foi a Amanda que transferiu, ela pode retomar quando o paciente volta a escrever.
  let naFilaDaEquipe = Boolean(env.humanSectorId) && ev.sectorId === env.humanSectorId;
  // A primeira mensagem de uma conversa nova chega SEM setor (ou na fila da equipe) e só depois o assistente da Inovstar transfere para a IA.
  // A transferência não gera aviso e a API não informa o setor nem mostra as mensagens de sistema: a conversa NOVA (ninguém respondeu nada
  // neste atendimento) é da IA, regra da clínica. Ela mesma garante o setor da IA e responde; conversa em que a equipe já falou fica com a equipe.
  const podeTerIdoPraIA = Boolean(env.agentSectorId) && (!ev.sectorId || naFilaDaEquipe);
  if (env.agentSectorId && ev.sectorId !== env.agentSectorId && !naFilaDaEquipe && !podeTerIdoPraIA) return skip(`setor ${ev.sectorId} != setor da IA`);

  // Enquanto espera, já acorda o Clinilink (unidades, catálogo, serviços mais agendados): a primeira consulta lenta não soma à espera.
  if (env.clinilinkKey) void fonteClinilink.aquecer?.().catch(() => {});
  // Debounce: espera o paciente terminar de digitar e só a última mensagem dispara a resposta.
  // (emergência e crise não esperam: respondem em poucos segundos)
  await sleep(ehUrgencia(ev.text ?? '') ? Math.min(env.debounceMs, 3000) : env.debounceMs);
  // uma resposta por vez NESTE atendimento (as outras conversas seguem em paralelo); a próxima lê o estado que esta deixou
  const trava = await travarAtendimento(ev.attendanceId);
  if (!trava) return skip('a resposta anterior deste atendimento demorou demais; a próxima mensagem dele retoma');
  try {
  const { messages: history } = await getHistory(ev.attendanceId, 80); // a jornada inteira (o padrão de 30 mensagens cortava o começo das conversas longas)
  const lastIn = [...history].reverse().find((m) => m.direction === 'in' && m.type !== 'system');
  if (lastIn && lastIn._id !== ev.messageId) return skip(`chegou mensagem mais nova (${lastIn._id} != ${ev.messageId}); o webhook dela responde`);
  // Resposta a uma mensagem AUTOMÁTICA da clínica (modelo do WhatsApp: confirmação de consulta com "Confirmar/Reagendar/Cancelar", campanha):
  // não é pedido de atendimento. A Amanda fica fora desse atendimento inteiro (e não puxa a conversa para o setor dela).
  const modelo = history.find((m) => m.direction === 'in' && (m.replyTo?.type === 'template' || m.interactiveReply?.kind === 'template_button'));
  if (modelo) return skip(`resposta a mensagem automática da clínica (${modelo.replyTo?.template?.name ?? modelo.interactiveReply?.kind ?? 'modelo'}): a Amanda não entra`);
  if (podeTerIdoPraIA) {
    const iMsg = history.findIndex((m) => m._id === ev.messageId);
    const foiPraIA = history.some((m, i) => i > iMsg && m.type === 'system' && TRANSF_PARA_IA.test(m.text ?? ''));
    // conversa nova = atendimento recém-aberto: ninguém respondeu, ninguém da equipe transferiu e todas as mensagens do paciente são dos últimos 3 minutos
    const conversaNova = !history.some((m) => m.direction === 'out' && m.status !== 'whisper' && !m.isWhisper)
      && !history.some((m) => m.type === 'system' && /transferid[oa]\b.*\bpor\b/i.test(m.text ?? '') && !/assistente|\bapi\b/i.test(m.text ?? ''))
      && history.filter((m) => m.direction === 'in' && m.type !== 'system').every((m) => Date.now() - +new Date(m.createdAt) < 3 * 60_000);
    if (foiPraIA || conversaNova) {
      if (!foiPraIA && env.autoReply) {
        try { await transferToSector(ev.attendanceId, env.agentSectorId, 'Conversa nova: atendimento pela Amanda (IA)'); }
        catch (e) { if (!/já está neste setor|Informe um setor diferente/i.test((e as Error).message)) return skip(`não consegui passar a conversa nova para o setor da IA: ${(e as Error).message.slice(0, 120)}`); }
      }
      naFilaDaEquipe = false;
      evt('ignorado', { motivo: 'conversa nova sem setor (ou na fila da equipe): a Amanda assume' });
    } else if (!ev.sectorId) return skip(`setor ${ev.sectorId} != setor da IA`);
  }

  const titulosAmanda = [env.agentTitle, ...env.agentTitlesAntigos].map((t) => t.replace(/\*/g, '').trim()).filter(Boolean);
  const eDaAmanda = (m: InovstarMessage) => m.direction === 'out' && titulosAmanda.some((t) => m.text?.includes(t));
  // Já tem resposta depois da última mensagem do paciente: de um humano/bot (não duplica) ou da própria Amanda a ESTA mensagem (webhook repetido).
  // Se a resposta da Amanda era para a mensagem anterior (esta chegou enquanto ela respondia), esta ainda precisa de resposta.
  const last = history[history.length - 1];
  let respostaDaAnterior = false; // a última saída é a resposta da Amanda à mensagem ANTERIOR: esta ainda precisa de resposta
  if (last && last.direction === 'out' && last.status !== 'whisper') {
    const salvoAgora = estadoAtivo() ? await lerEstado(ev.attendanceId) : null;
    const jaRespondida = !estadoAtivo() || salvoAgora?.ate === ev.messageId || !history.some((m) => m.direction === 'out' && eDaAmanda(m) && history.indexOf(m) > history.findIndex((x) => x._id === ev.messageId));
    if (!eDaAmanda(last) || jaRespondida) return skip(`última mensagem já é de saída (${last.type}); não duplica`);
    respostaDaAnterior = true;
  }

  // Na fila da equipe só retoma conversa em que a própria Amanda já falou (nas últimas 12 h); as demais são da equipe.
  if (naFilaDaEquipe && !history.some((m) => eDaAmanda(m) && Date.now() - +new Date(m.createdAt) < 12 * 3600 * 1000)) {
    return skip('conversa da fila da equipe que não é da Amanda');
  }

  // Áudios: a Inovstar só transcreve sob demanda (POST /whatsapp/message/{id}/transcribe, síncrono, com cache do lado deles)
  const desde12h = Date.now() - 12 * 3600 * 1000;
  await Promise.all(history.filter((m) => m.direction === 'in' && m.type === 'audio' && !m.transcription?.text && +new Date(m.createdAt) > desde12h).slice(-5).map(async (m) => {
    const tr = await transcribeMessage(m._id).catch((e) => { evt('erro', { mensagem: `transcrição falhou: ${(e as Error).message.slice(0, 120)}` }); return null; });
    if (tr?.text) m.transcription = { text: tr.text, status: tr.status };
  }));

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
  while (respostaDaAnterior && turns[turns.length - 1]?.role === 'assistant') turns.pop();
  if (turns.length === 0 || turns[turns.length - 1].role !== 'user') return skip('sem turno do paciente para responder');

  // A Amanda já respondeu nesta conversa? (mensagem de saída que carrega o título da Amanda)
  const jaRespondeu = history.some(eDaAmanda);
  const nome = firstName(ev.contactName);

  // Amanda IA: o modelo conduz a conversa com as ferramentas do Clinilink (AGENT_MODE=ia: todos; AGENTE_IA_NUMEROS: só o piloto)
  if (usaIA(ev.to)) return await responderComIA(ev, history, inicio, naFilaDaEquipe, nome, titulosAmanda);

  // Roteiro fixo (sem IA): reprocessa as mensagens do paciente da jornada atual e responde a última.
  // A jornada recomeça depois da última mensagem de confirmação (MARCA_FIM) e é limitada a 12 horas.
  if (env.mode === 'scripted') {
    // A jornada recomeça (1) depois da confirmação do agendamento e (2) depois de qualquer evento do sistema da
    // Inovstar ("Transferido para o setor...", "início de atendimento"): o que veio antes não conta (falhas antigas
    // faziam a Amanda transferir de novo logo na primeira mensagem).
    const fimIdx = history.reduce((acc, m, i) => ((m.direction === 'out' && MARCAS_FIM.some((x) => m.text?.includes(x))) || (m.type === 'system' && !/transferido pela api/i.test(m.text ?? '') && !TRANSF_PARA_IA.test(m.text ?? '')) ? i : acc), -1);
    const desde = Date.now() - 12 * 3600 * 1000;
    // logo depois de um agendamento concluído (até 1 h): "obrigado" -> pergunta se ajuda em mais algo; "só isso" -> despede
    const marcaOut = fimIdx >= 0 ? history[fimIdx] : undefined;
    const pos: Pos | undefined = marcaOut && marcaOut.direction === 'out' && Date.now() - +new Date(marcaOut.createdAt) < 3600 * 1000
      ? (marcaOut.text?.includes(MARCA_AGENDADO) ? 'confirmado' : marcaOut.text?.includes(MARCA_MAIS) ? 'perguntou_mais' : marcaOut.text?.includes(MARCA_ADEUS) ? 'encerrou' : undefined)
      : undefined;
    // turnos: mensagens do paciente entre duas respostas (qualquer saída que não seja nota interna)
    const { turnos, duplicados } = montarTurnos(history, fimIdx, desde);
    // quando o paciente começou este pedido (primeira mensagem da jornada): comprovante pago antes disso é de outro atendimento
    const primeiraDaJornada = history.find((m, i) => m.direction === 'in' && i > fimIdx && +new Date(m.createdAt) > desde && textoRoteiro(m));
    const inicioJornada = primeiraDaJornada ? new Date(primeiraDaJornada.createdAt) : undefined;
    // Estado guardado depois da última resposta enviada: continua dali, só com as mensagens NOVAS (não reinterpreta a conversa inteira, o que
    // muda de resposta se o código, a agenda ou a data mudaram no meio). Sem estado guardado, ou se algo não bate, reprocessa a jornada toda.
    let retomada: { state: State; aposHandoffDuro: boolean; passos?: number; turnos: string[][] } | undefined;
    if (primeiraDaJornada && estadoAtivo()) {
      const salvo = await lerEstado(ev.attendanceId);
      if (salvo && salvo.jornada === primeiraDaJornada._id && salvo.ate !== ev.messageId) {
        const iAte = history.findIndex((m) => m._id === salvo.ate);
        const novos = iAte >= 0 ? montarTurnos(history.slice(iAte + 1), -1, desde).turnos : [];
        if (novos.length > 0) retomada = { state: salvo.state as State, aposHandoffDuro: salvo.duro, passos: salvo.passos, turnos: novos };
      }
    }
    const { conversa, confirmacao } = lerConversa(history); // lê a conversa dos dois lados antes de responder
    const textos = turnos.flat();
    // o que a Amanda acabou de dizer: o GPT varia as expressões em vez de repetir o mesmo elogio
    const anteriores = history.filter((m) => m.direction === 'out' && m.text && m.status !== 'whisper').slice(-2).map((m) => (m.text ?? '').replace(/^\*[^*\n]+\*\s*/, ''));
    // a última mensagem é um áudio sem transcrição ou um arquivo sem texto: pede para escrever (não conta como "não entendi")
    const ultimaMsg = [...history].reverse().find((m) => m.direction === 'in' && m.type !== 'system');
    const ilg = ultimaMsg && ultimaMsg._id === ev.messageId ? ilegivel(ultimaMsg) : null;
    if (textos.length === 0 && !ilg) return skip('sem mensagens do paciente na jornada atual');
    const fonte = env.clinilinkKey ? fonteClinilink : fonteSimulada;
    const tag = `[${ev.attendanceId}]`;
    let r: Result | undefined;
    if (ilg) {
      r = { state: undefined as never, reply: ilg === 'audio' ? 'Não consegui ouvir esse áudio. Escreve pra mim ou manda de novo?' : 'Recebi o arquivo, mas só leio texto e áudio por aqui. Pode me escrever?', handoff: undefined };
    } else try {
      r = await responder(retomada ? retomada.turnos : turnos, { now: new Date(), nome, tz: env.timezone, telefone: ev.to, pos, lerComprovante: lerComprovanteDe(history), lerPedido: lerPedidoDe(history), casarExames: escolherExames, interpretar: interpretarEscolha, interpretarPedido, duplicadoNosTurnos: retomada ? [] : duplicados, inicioJornada, conversa, confirmacao, contexto: entenderNoContexto }, fonte, retomada && { state: retomada.state, aposHandoffDuro: retomada.aposHandoffDuro, passos: retomada.passos });
    } catch (e) {
      // Clinilink fora do ar / lento: não inventa dado, devolve para a equipe
      console.error(`${tag} falha ao consultar a fonte (${fonte.tipo}):`, (e as Error).message);
      r = { state: undefined as never, reply: 'Tô com dificuldade pra consultar a agenda agora. Vou chamar alguém da equipe pra te ajudar. Só um instante.', handoff: { motivo: `Falha ao consultar o Clinilink: ${(e as Error).message}` } };
    }
    if (!r) return skip('roteiro sem resposta');
    if (r.silencio) return skip('agradecimento depois da despedida: sem resposta');
    // o paciente pediu um humano (ou foi urgência) e voltou a escrever: a equipe segue, a Amanda não retoma
    if (naFilaDaEquipe && r.aposHandoffDuro) return skip('conversa transferida a pedido do paciente (ou urgência): a Amanda não retoma');
    const replyTxt = r.reply;
    // o GPT só reescreve o tom; emergência/crise nunca passam por ele
    const gpt = ilg ? { texto: r.reply, status: 'desligado' as const, motivo: 'mensagem fixa (áudio/arquivo ilegível)' } : r.handoff?.urgente ? { texto: r.reply, status: 'desligado' as const, motivo: 'mensagem de segurança' } : SEM_GPT.some((x) => replyTxt.includes(x)) ? { texto: r.reply, status: 'desligado' as const, motivo: 'texto exato (valores, chave pix, confirmação)' } : await amigavelDetalhado(r.reply, nomesProtegidos(r), { nome: textos.length % 3 === 0 ? nome : '', anteriores, conversa }); // o nome só em 1 a cada 3 mensagens, para não cansar
    let texto = gpt.texto;
    // TRAVA FINAL: preço zerado ("R$ 0,00") nunca chega ao paciente, venha de onde vier (dado errado no Clinilink, texto do roteiro, GPT).
    // A mensagem é trocada, a conversa vai para a equipe e o log registra o erro com o texto bloqueado.
    if (temPrecoZero(r.reply) || temPrecoZero(texto)) {
      evt('erro', { mensagem: 'preço zero bloqueado antes do envio', roteiro: r.reply.slice(0, 300), reescrito: texto.slice(0, 300) });
      texto = 'Preciso conferir uma informação antes de continuar. Vou chamar alguém da equipe pra te ajudar. Só um instante.';
      r = { ...r, handoff: { motivo: 'BLOQUEIO DE SEGURANÇA: a resposta continha preço "R$ 0,00". Conferir o preço do procedimento no Clinilink e responder ao paciente.' } };
    }
    const msg = withTitle(texto);
    evt('resposta', {
      fonte: fonte.tipo,
      etapa: r.state ? etapa(r.state, r.handoff) : ilg ? 'mensagem ilegível (áudio sem transcrição ou arquivo)' : 'falha ao consultar a agenda',
      mensagens_na_jornada: textos.length,
      estado: retomada ? 'guardado (continuou de onde parou)' : estadoAtivo() ? 'reprocessou a jornada' : 'reprocessou a jornada (sem estado guardado)',
      paciente_disse: ilg ? `[${ilg} ilegível]` : textos[textos.length - 1],
      roteiro: r.reply,
      enviado: msg,
      gpt: gpt.status,
      gpt_motivo: gpt.motivo,
      retomou_da_fila: naFilaDaEquipe,
      transferiu: Boolean(r.handoff),
      motivo_transferencia: r.handoff?.motivo,
      enviou_de_verdade: env.autoReply,
    });
    if (!env.autoReply) return;
    // A mensagem ao paciente vai SEMPRE como texto normal: a mensagem anexada ao endpoint de transferência não chega
    // ao paciente (o histórico mostra só a resposta automática do setor). Depois, se for o caso, transfere.
    // Cada balão espera o tempo de alguém ler e digitar aquele texto (resposta grande demora mais), e só o primeiro leva o título.
    // Enquanto a resposta era preparada e "digitada", o paciente pode ter escrito de novo: essa resposta já nasceu desatualizada. Então ela
    // não é enviada (nem o resto dos balões): a mensagem nova espera o próprio tempo, lê a conversa inteira e responde uma vez só.
    const mensagemMaisNova = async (): Promise<string | undefined> => {
      try {
        const { messages } = await getHistory(ev.attendanceId, 15);
        const l = [...messages].reverse().find((m) => m.direction === 'in' && m.type !== 'system');
        return l && l._id !== ev.messageId ? l._id : undefined;
      } catch { return undefined; } // não conseguiu conferir: envia (melhor responder do que ficar mudo)
    };
    const enviar = async (): Promise<boolean> => {
      const baloes = dividirEmBaloes(texto);
      for (let i = 0; i < baloes.length; i++) {
        await pareceDigitando(inicio, Boolean(r.handoff?.urgente), baloes[i], i === 0);
        const nova = r.handoff?.urgente ? undefined : await mensagemMaisNova(); // segurança (emergência/crise) sempre sai
        if (nova) {
          evt('ignorado', { motivo: `chegou mensagem nova (${nova}) enquanto a resposta era preparada: ${i} de ${baloes.length} balões enviados; o webhook da mensagem nova responde com a conversa inteira` });
          return false;
        }
        await sendText({ channelId: ev.channelId, to: ev.to, attendanceId: ev.attendanceId, text: i === 0 ? withTitle(baloes[i]) : baloes[i], clientMessageId: i === 0 ? `agente-receptivo-${ev.messageId}` : `agente-receptivo-${ev.messageId}-${i + 1}` });
      }
      return true;
    };
    const transferir = async (setor: string, motivo: string) => {
      try { await transferToSector(ev.attendanceId, setor, motivo); }
      catch (e) {
        // já está no setor de destino (outra mensagem do mesmo paciente já transferiu): nada a fazer
        if (/já está neste setor|Informe um setor diferente/i.test((e as Error).message)) evt('ignorado', { motivo: 'atendimento já estava no setor de destino' });
        else throw e;
      }
    };
    let enviou = true;
    if (naFilaDaEquipe && !r.handoff && env.agentSectorId) {
      // o paciente voltou: devolve a conversa para a Amanda e responde
      await transferir(env.agentSectorId, 'A Amanda retomou o atendimento porque o paciente voltou a escrever.');
      enviou = await enviar();
    } else if (r.handoff && env.humanSectorId) {
      // só transfere se a resposta foi enviada: se chegou mensagem nova, a conversa é reprocessada inteira pelo webhook dela
      enviou = await enviar();
      if (enviou && !naFilaDaEquipe) await transferir(env.humanSectorId, r.handoff.motivo);
    } else enviou = await enviar();
    // Guarda o estado só depois de a resposta ter saído (se chegou mensagem nova e ela não foi enviada, o estado anterior continua valendo).
    // Agendamento concluído: apaga (o estado carrega nome e CPF do paciente).
    if (enviou && r.state && primeiraDaJornada && estadoAtivo()) {
      if (r.state.fim && !r.handoff) await apagarEstado(ev.attendanceId);
      else await guardarEstado(ev.attendanceId, { jornada: primeiraDaJornada._id, ate: ev.messageId, state: estadoDepoisDaResposta(r), duro: r.handoff ? handoffDuro(r.handoff) : Boolean(r.aposHandoffDuro), passos: r.passos });
    }
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
  } finally {
    await trava.soltar();
  }
}

// ================================================================================================ Amanda IA
/** A conversa deste telefone é atendida pela Amanda IA? (modo ia para todos, ou o número está no piloto) */
export const usaIA = (phone: string) => Boolean(env.anthropicKey || env.openaiKey) && (env.mode === 'ia' || env.iaNumeros.some((n) => phoneKey(n) === phoneKey(phone)));

async function responderComIA(ev: MessageReceivedEvent, history: InovstarMessage[], inicio: number, naFilaDaEquipe: boolean, nome: string, titulos: string[]) {
  const tag = `[${ev.attendanceId}]`;
  const mem = estadoAtivo() ? await lerMemoriaIA<MemoriaIA>(ev.attendanceId) : null;
  // a própria IA passou a conversa para a equipe: a equipe segue, a IA não retoma sozinha
  if (naFilaDaEquipe && mem?.transferiu) { console.log(`${tag} ignorado: conversa passada para a equipe pela Amanda IA`); evt('ignorado', { motivo: 'IA: conversa já passada para a equipe' }); return; }
  const fonte = env.clinilinkKey ? fonteClinilink : fonteSimulada;
  const ultimaImagem = [...history].reverse().find((m) => m.direction === 'in' && (m.type === 'image' || m.type === 'document'));
  const pacienteDisse = [...history].reverse().find((m) => m.direction === 'in' && m.type !== 'system');
  let a: Awaited<ReturnType<typeof atenderComIA>>;
  try {
    a = await atenderComIA({
      history, titulos, telefone: ev.to, nomeContato: nome, fonte, memoria: mem,
      lerComprovante: ultimaImagem ? () => lerComprovanteDe(history)(ultimaImagem._id) : undefined,
      lerPedido: ultimaImagem ? () => lerPedidoDe(history)(ultimaImagem._id) : undefined,
    });
  } catch (e) {
    console.error(`${tag} IA falhou:`, (e as Error).message);
    evt('erro', { mensagem: `IA falhou: ${(e as Error).message}`.slice(0, 300) });
    a = { texto: 'Tô com uma instabilidade aqui agora. Vou chamar alguém da equipe pra te ajudar. Só um instante.', handoff: { motivo: `Falha da Amanda IA: ${(e as Error).message.slice(0, 160)}` }, encerrar: false, agendou: false, mem: mem ?? memoriaNova(), resposta: { texto: '', rodadas: 0, ferramentas: [], modelo: 'erro' } };
  }
  if (!a) { console.log(`${tag} ignorado: IA sem resposta`); evt('ignorado', { motivo: 'IA sem resposta' }); return; }
  let texto = a.texto;
  if (temPrecoZero(texto)) {
    evt('erro', { mensagem: 'preço zero bloqueado antes do envio (IA)', reescrito: texto.slice(0, 300) });
    texto = 'Preciso conferir uma informação antes de continuar. Vou chamar alguém da equipe pra te ajudar. Só um instante.';
    a = { ...a, handoff: { motivo: 'BLOQUEIO DE SEGURANÇA: a resposta continha preço "R$ 0,00". Conferir o preço no Clinilink e responder ao paciente.' } };
  }
  const msg = withTitle(texto);
  evt('resposta', {
    fonte: fonte.tipo,
    etapa: a.agendou ? 'IA: agendado' : a.handoff ? 'IA: passou para a equipe' : a.encerrar ? 'IA: encerrou' : 'IA: conversando',
    paciente_disse: pacienteDisse ? (textoRoteiro(pacienteDisse) ?? '').slice(0, 400) : '',
    roteiro: texto,
    enviado: msg,
    gpt: 'ia',
    gpt_motivo: `${a.resposta.modelo}: ${a.resposta.ferramentas.map((f) => `${f.nome}(${f.ms}ms)`).join(', ') || 'sem ferramenta'}`,
    ferramentas: a.resposta.ferramentas.map((f) => ({ nome: f.nome, args: f.args, res: f.res, ms: f.ms })),
    retomou_da_fila: naFilaDaEquipe,
    transferiu: Boolean(a.handoff),
    motivo_transferencia: a.handoff?.motivo,
    enviou_de_verdade: env.autoReply,
    motor: 'ia',
  });
  console.log(`${tag} IA (${a.resposta.modelo}, ${a.resposta.ferramentas.length} ferramentas, ${Date.now() - inicio} ms) -> ${texto.slice(0, 200).replace(/\n/g, ' | ')}`);
  if (!env.autoReply) return;
  const urgente = Boolean(a.handoff?.urgente);
  const mensagemMaisNova = async (): Promise<string | undefined> => {
    try {
      const { messages } = await getHistory(ev.attendanceId, 15);
      const l = [...messages].reverse().find((m) => m.direction === 'in' && m.type !== 'system');
      return l && l._id !== ev.messageId ? l._id : undefined;
    } catch { return undefined; }
  };
  const transferir = async (setor: string, motivo: string) => {
    try { await transferToSector(ev.attendanceId, setor, motivo); }
    catch (e) { if (!/já está neste setor|Informe um setor diferente/i.test((e as Error).message)) throw e; }
  };
  // voltou da fila da equipe (a IA não tinha transferido): a conversa volta para o setor da IA
  if (naFilaDaEquipe && !a.handoff && env.agentSectorId) await transferir(env.agentSectorId, 'A Amanda retomou o atendimento porque o paciente voltou a escrever.');
  const baloes = dividirEmBaloes(texto);
  for (let i = 0; i < baloes.length; i++) {
    await pareceDigitando(inicio, urgente, baloes[i], i === 0);
    // o paciente escreveu de novo enquanto ela "digitava": essa resposta nasceu velha (a agendada já foi gravada e segue na memória)
    const nova = urgente || a.agendou ? undefined : await mensagemMaisNova();
    if (nova) { evt('ignorado', { motivo: `IA: chegou mensagem nova (${nova}) enquanto a resposta era enviada: ${i} de ${baloes.length} balões` }); break; }
    await sendText({ channelId: ev.channelId, to: ev.to, attendanceId: ev.attendanceId, text: i === 0 ? withTitle(baloes[i]) : baloes[i], clientMessageId: i === 0 ? `agente-receptivo-${ev.messageId}` : `agente-receptivo-${ev.messageId}-${i + 1}` });
  }
  if (a.handoff && env.humanSectorId && !naFilaDaEquipe) await transferir(env.humanSectorId, a.handoff.motivo);
  if (estadoAtivo()) {
    const m = a.encerrar ? memoriaNova() : a.mem;
    await guardarMemoriaIA(ev.attendanceId, { ...m, ate: ev.messageId, transferiu: Boolean(a.handoff) });
  }
}
