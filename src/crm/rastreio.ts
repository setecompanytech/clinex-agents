import { aplicar, ehTerminal, type Lead } from './motor.js';
import type { Estado } from './banco.js';
import { chaveFone, ehEnvio } from './whatsapp.js';

/**
 * Rastreio das respostas aos disparos. Toda mensagem que o paciente manda depois de receber um modelo nosso vira um evento
 * "resposta" no lead (texto, o que ele quis dizer e a qual mensagem respondeu) e entra nos números de resposta do CRM.
 * Só registra: não responde ao paciente (isso é da equipe, ou do agente receptivo, que é outro sistema).
 */

export type Intencao = 'agendar' | 'valor_horario' | 'duvida' | 'sem_interesse' | 'ja_fez' | 'ainda_quer' | 'reagendar' | 'outro';

export const ROTULO_INTENCAO: Record<Intencao, string> = {
  agendar: 'Quer agendar', valor_horario: 'Pediu valor ou horário', duvida: 'Tem dúvida', sem_interesse: 'Sem interesse',
  ja_fez: 'Já fez o exame', ainda_quer: 'Ainda quer o exame', reagendar: 'Quer reagendar', outro: 'Outra resposta',
};

const limpa = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9º° ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Botões de resposta rápida das mensagens do guia (texto exato) e, depois, palavras do texto livre. */
const BOTOES: Record<string, Intencao> = {
  'agendar': 'agendar', 'quero agendar': 'agendar', 'ver valor e horario': 'valor_horario', 'esclarecer duvida': 'duvida', 'saber mais': 'duvida',
  'nao tenho interesse': 'sem_interesse', 'agora nao': 'sem_interesse', 'ainda quero o exame': 'ainda_quer', 'ja fiz o exame': 'ja_fez',
  'reagendar': 'reagendar', '1º horario': 'agendar', '2º horario': 'agendar', 'outro horario': 'valor_horario',
};
/** "pare de me mandar mensagem": além de classificar, bloqueia novos disparos automáticos para este lead. */
const PEDIDO_DE_PARAR = /\b(pare|parar|para de|nao me (envie|mande|chame|escreva|procure)|nao quero (receber|mais)|descadastr|remov[ae]|sair da lista|bloque)/;

export function classificarResposta(texto: string | null | undefined): { intencao: Intencao; parar: boolean } {
  const t = limpa(texto ?? '');
  if (!t) return { intencao: 'outro', parar: false };
  if (BOTOES[t]) return { intencao: BOTOES[t], parar: false };
  if (PEDIDO_DE_PARAR.test(t)) return { intencao: 'sem_interesse', parar: true };
  if (/\b(nao tenho interesse|sem interesse|nao quero|nao preciso|nao tenho mais|desisti|ja fiz em outro|fiz em outro)\b/.test(t)) return { intencao: 'sem_interesse', parar: false };
  if (/\b(ja fiz|ja realizei|ja fui|ja consegui)\b/.test(t)) return { intencao: 'ja_fez', parar: false };
  if (/\b(remarcar|reagendar|outra data|mudar (a )?data|trocar (o )?dia)\b/.test(t)) return { intencao: 'reagendar', parar: false };
  if (/\b(agendar|marcar|marca|agenda|quero sim|tenho interesse|pode marcar|vamos marcar|fechado|bora)\b/.test(t) || /^(sim|quero|pode|ok|isso|combinado)\b/.test(t)) return { intencao: 'agendar', parar: false };
  if (/\b(valor|preco|quanto|custa|custo|orcamento|horario|horarios|que horas|qual dia|quando|vaga|disponib)\b/.test(t)) return { intencao: 'valor_horario', parar: false };
  if (/\b(duvida|como|onde|endereco|preparo|jejum|precisa|convenio|plano|aceita|pedido)\b/.test(t) || /\?/.test(texto ?? '')) return { intencao: 'duvida', parar: false };
  return { intencao: 'outro', parar: false };
}

export type RespostaRecebida = { telefone: string; texto: string | null; tipo?: string; messageId?: string; contato?: string };

const DIAS_DE_JANELA = 14;

/** Lead que recebeu um disparo nosso para esse telefone, o mais recente, dentro da janela. */
export function leadDoDisparo(estado: Estado, telefone: string, agora: Date): { lead: Lead; msg?: number } | null {
  const chave = chaveFone(telefone);
  let melhor: { lead: Lead; quando: number; msg?: number } | null = null;
  for (const l of estado.leads) {
    if (chaveFone(l.telefone) !== chave) continue;
    for (const e of l.eventos) {
      if (e.tipo !== 'contato' || !ehEnvio(e.texto)) continue;
      const q = Date.parse(e.quando);
      if (agora.getTime() - q > DIAS_DE_JANELA * 86_400_000) continue;
      if (!melhor || q > melhor.quando) melhor = { lead: l, quando: q, msg: e.msg };
    }
  }
  return melhor ? { lead: melhor.lead, msg: melhor.msg } : null;
}

/** Texto para guardar: mídia sem texto vira um marcador legível. */
const textoDe = (r: RespostaRecebida) => (r.texto && r.texto.trim() ? r.texto.trim() : r.tipo && r.tipo !== 'text' ? `[${r.tipo === 'audio' ? 'áudio' : r.tipo === 'image' ? 'imagem' : r.tipo === 'document' ? 'documento' : r.tipo}]` : '');

/**
 * Registra a resposta no lead que recebeu o disparo. Devolve o que fez (para log/teste).
 * Qualquer resposta, menos "sem interesse" e "já fiz", segue a regra do guia (quem estava em Em aberto/Sem retorno vai para
 * Em negociação). Sem interesse e "já fiz" ficam só registrados: descartar é decisão de uma pessoa, com motivo.
 */
export function registrarResposta(estado: Estado, r: RespostaRecebida, agora: Date): { registrado: boolean; motivo?: string; leadId?: string; intencao?: Intencao } {
  const alvo = leadDoDisparo(estado, r.telefone, agora);
  if (!alvo) return { registrado: false, motivo: 'sem disparo nosso para este telefone nos últimos 14 dias' };
  const l = alvo.lead;
  if (r.messageId && l.eventos.some((e) => e.msgId === r.messageId)) return { registrado: false, motivo: 'mensagem já registrada', leadId: l.id };
  const texto = textoDe(r);
  const { intencao, parar } = classificarResposta(r.texto);
  const comum = { texto: texto || undefined, intencao, msgId: r.messageId, msg: alvo.msg };
  if (parar) l.semDisparoAuto = true;
  if (ehTerminal(l.status)) { aplicar(l, { tipo: 'nota', texto: `Respondeu pelo WhatsApp (${ROTULO_INTENCAO[intencao]})${texto ? `: “${texto.slice(0, 300)}”` : ''}. O lead já estava encerrado.`, atendente: 'WhatsApp' }, agora); return { registrado: true, leadId: l.id, intencao }; }
  const soRegistrar = intencao === 'sem_interesse' || intencao === 'ja_fez' || (l.status !== 'aberto' && l.status !== 'sem_retorno' && l.status !== 'descarte');
  try { aplicar(l, { tipo: 'resposta', botao: ROTULO_INTENCAO[intencao], ...comum, soRegistrar, atendente: 'WhatsApp' }, agora); }
  catch { aplicar(l, { tipo: 'resposta', botao: ROTULO_INTENCAO[intencao], ...comum, soRegistrar: true, atendente: 'WhatsApp' }, agora); }
  if (parar) aplicar(l, { tipo: 'nota', texto: 'O paciente pediu para não receber mais mensagens: a IA de disparo não escreve mais para este lead.', atendente: 'WhatsApp' }, agora);
  return { registrado: true, leadId: l.id, intencao };
}
