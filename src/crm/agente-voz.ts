import { env } from '../lib/env.js';
import { ErroAgente } from './agente-chat.js';

/**
 * Voz do Agente Clinex: transcreve o áudio de quem fala (OpenAI) e transforma a resposta em fala (OpenAI).
 * Sem OPENAI_API_KEY, a tela usa a voz e o reconhecimento do próprio navegador.
 */

export const vozDisponivel = () => ({ transcrever: Boolean(env.openaiKey), falar: Boolean(env.openaiKey) });

const DICA = 'Conversa sobre um CRM de clínicas: leads, orçamento, no-show, Clinex, IA Manager, gatilhos, Guamá, Nazaré, Telégrafo, WhatsApp, pipelines, convertido, descarte.';

export async function transcrever(audio: Buffer, tipo: string): Promise<string> {
  if (!env.openaiKey) throw new ErroAgente('voz', 'A transcrição de voz não está configurada neste ambiente.', 503);
  if (audio.length < 800) throw new ErroAgente('voz', 'Não ouvi nada. Tente falar de novo.', 400);
  const ext = /mp4|m4a|aac/.test(tipo) ? 'mp4' : /ogg/.test(tipo) ? 'ogg' : /wav/.test(tipo) ? 'wav' : /mpeg|mp3/.test(tipo) ? 'mp3' : 'webm';
  const f = new FormData();
  f.append('file', new Blob([new Uint8Array(audio)], { type: tipo || 'audio/webm' }), `fala.${ext}`);
  f.append('model', env.vozTranscricaoModelo); f.append('language', 'pt'); f.append('prompt', DICA); f.append('response_format', 'json');
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 40_000);
  try {
    const r = await fetch(`${env.openaiBase}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${env.openaiKey}` }, body: f, signal: ctl.signal });
    if (!r.ok) throw new ErroAgente('voz', `Não consegui transcrever o áudio (${r.status}).`, 502);
    const j = (await r.json()) as { text?: string };
    return String(j.text ?? '').trim();
  } catch (e) { if (e instanceof ErroAgente) throw e; throw new ErroAgente('voz', 'Não consegui transcrever o áudio agora.', 502); }
  finally { clearTimeout(t); }
}

/** O texto vira MP3. Tira o markdown e limita o tamanho (a fala é para frases curtas). */
export async function falar(texto: string): Promise<Buffer> {
  if (!env.openaiKey) throw new ErroAgente('voz', 'A voz não está configurada neste ambiente.', 503);
  const limpo = texto.replace(/\*\*/g, '').replace(/[#>*_`|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1200);
  if (!limpo) throw new ErroAgente('voz', 'Nada para falar.', 400);
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 40_000);
  try {
    const r = await fetch(`${env.openaiBase}/audio/speech`, {
      method: 'POST', headers: { Authorization: `Bearer ${env.openaiKey}`, 'Content-Type': 'application/json' }, signal: ctl.signal,
      body: JSON.stringify({ model: env.vozFalaModelo, voice: env.vozFalaVoz, input: limpo, response_format: 'mp3', instructions: 'Fale em português do Brasil, com tom natural, caloroso e objetivo, como uma colega de trabalho prestativa. Ritmo tranquilo.' }),
    });
    if (!r.ok) throw new ErroAgente('voz', `Não consegui gerar a voz (${r.status}).`, 502);
    return Buffer.from(await r.arrayBuffer());
  } catch (e) { if (e instanceof ErroAgente) throw e; throw new ErroAgente('voz', 'Não consegui gerar a voz agora.', 502); }
  finally { clearTimeout(t); }
}
