/**
 * Amanda IA: o laço do modelo. Lê a conversa, decide, chama as ferramentas (quantas precisar) e escreve a resposta.
 * Com ANTHROPIC_API_KEY usa o Claude; sem ela, a OpenAI (IA_MODEL_OPENAI). As regras de negócio estão nas ferramentas.
 */
import { env } from '../../../lib/env.js';
import { evt } from '../../../lib/log.js';
import { DEFINICOES, executar, type Contexto } from './ferramentas.js';

export type Msg = { role: 'user' | 'assistant'; content: string };
export type Resposta = { texto: string; rodadas: number; ferramentas: { nome: string; args: unknown; ms: number; res: string }[]; modelo: string };

const PRAZO_MS = 75_000;
const MAX_RODADAS = 10;

export async function pensar(system: string, conversa: Msg[], c: Contexto): Promise<Resposta> {
  return env.anthropicKey ? comClaude(system, conversa, c) : comOpenai(system, conversa, c);
}

async function rodarFerramenta(nome: string, args: unknown, c: Contexto, log: Resposta['ferramentas']) {
  const t0 = Date.now();
  const r = JSON.stringify(await executar(nome, args, c)).slice(0, 12000);
  (c.saida.dados ??= []).push(r);
  log.push({ nome, args, ms: Date.now() - t0, res: r.slice(0, 300) });
  return r;
}

async function comOpenai(system: string, conversa: Msg[], c: Contexto): Promise<Resposta> {
  const modelo = env.iaModeloOpenai;
  const tools = DEFINICOES.map((d) => ({ type: 'function', function: { name: d.name, description: d.description, parameters: d.parameters } }));
  const msgs: any[] = [{ role: 'system', content: system }, ...conversa];
  const log: Resposta['ferramentas'] = [];
  const ini = Date.now();
  for (let i = 1; i <= MAX_RODADAS; i++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', signal: AbortSignal.timeout(Math.max(5000, PRAZO_MS - (Date.now() - ini))),
      headers: { Authorization: `Bearer ${env.openaiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: modelo, messages: msgs, tools, temperature: 0.2, parallel_tool_calls: true }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const j: any = await res.json();
    const m = j.choices?.[0]?.message;
    const calls: any[] = m?.tool_calls ?? [];
    if (!calls.length) return { texto: String(m?.content ?? '').trim(), rodadas: i, ferramentas: log, modelo };
    msgs.push({ role: 'assistant', content: m.content ?? null, tool_calls: calls });
    const saidas = await Promise.all(calls.map(async (tc) => {
      let args: unknown = {};
      try { args = JSON.parse(tc.function.arguments || '{}'); } catch { /* args inválidos */ }
      return { role: 'tool', tool_call_id: tc.id, content: await rodarFerramenta(tc.function.name, args, c, log) };
    }));
    msgs.push(...saidas);
  }
  evt('erro', { mensagem: 'IA: limite de rodadas de ferramentas' });
  return { texto: '', rodadas: MAX_RODADAS, ferramentas: log, modelo };
}

async function comClaude(system: string, conversa: Msg[], c: Contexto): Promise<Resposta> {
  const modelo = env.model;
  const tools = DEFINICOES.map((d) => ({ name: d.name, description: d.description, input_schema: d.parameters }));
  const msgs: any[] = conversa.map((m) => ({ role: m.role, content: m.content }));
  const log: Resposta['ferramentas'] = [];
  const ini = Date.now();
  for (let i = 1; i <= MAX_RODADAS; i++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: AbortSignal.timeout(Math.max(5000, PRAZO_MS - (Date.now() - ini))),
      headers: { 'x-api-key': env.anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: modelo, max_tokens: 1200, system, tools, messages: msgs }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const j: any = await res.json();
    const blocos: any[] = j.content ?? [];
    const usos = blocos.filter((b) => b.type === 'tool_use');
    const texto = blocos.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (!usos.length) return { texto, rodadas: i, ferramentas: log, modelo };
    msgs.push({ role: 'assistant', content: blocos });
    const resultados = await Promise.all(usos.map(async (u) => ({ type: 'tool_result', tool_use_id: u.id, content: await rodarFerramenta(u.name, u.input, c, log) })));
    msgs.push({ role: 'user', content: resultados });
  }
  evt('erro', { mensagem: 'IA: limite de rodadas de ferramentas' });
  return { texto: '', rodadas: MAX_RODADAS, ferramentas: log, modelo };
}
