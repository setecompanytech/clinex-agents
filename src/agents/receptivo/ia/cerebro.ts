/**
 * Amanda IA: o laço do modelo. Lê a conversa, decide, chama as ferramentas (quantas precisar) e escreve a resposta.
 * Com ANTHROPIC_API_KEY usa o Claude; sem ela, a OpenAI (IA_MODEL_OPENAI). As regras de negócio estão nas ferramentas.
 */
import { env } from '../../../lib/env.js';
import { evt } from '../../../lib/log.js';
import { DEFINICOES, executar, type Contexto } from './ferramentas.js';

export type Msg = { role: 'user' | 'assistant'; content: string };
/** Tokens gastos numa resposta (todas as rodadas somadas). entrada inclui os do cache; cache = os cobrados com desconto. */
export type Uso = { chamadas: number; entrada: number; cache: number; saida: number };
export type Resposta = { texto: string; rodadas: number; ferramentas: { nome: string; args: unknown; ms: number; res: string }[]; modelo: string; uso: Uso };

export const usoZero = (): Uso => ({ chamadas: 0, entrada: 0, cache: 0, saida: 0 });
export const somarUso = (a: Uso, b: Uso): Uso => ({ chamadas: a.chamadas + b.chamadas, entrada: a.entrada + b.entrada, cache: a.cache + b.cache, saida: a.saida + b.saida });

/** Preço por 1 milhão de tokens em US$: [entrada, entrada em cache, saída] (tabela pública da OpenAI/Anthropic, nov/2026). */
const PRECOS: [RegExp, [number, number, number]][] = [
  [/^gpt-4\.1-nano/, [0.1, 0.025, 0.4]], [/^gpt-4\.1-mini/, [0.4, 0.1, 1.6]], [/^gpt-4\.1/, [2, 0.5, 8]],
  [/^gpt-4o-mini/, [0.15, 0.075, 0.6]], [/^gpt-4o/, [2.5, 1.25, 10]],
  [/haiku/, [1, 0.1, 5]], [/sonnet/, [3, 0.3, 15]], [/opus/, [5, 0.5, 25]],
];
/** Custo estimado em US$ (null se o modelo não estiver na tabela). */
export function custoUSD(modelo: string, u: Uso): number | null {
  const p = PRECOS.find(([re]) => re.test(modelo))?.[1];
  if (!p) return null;
  return Math.round((((u.entrada - u.cache) * p[0] + u.cache * p[1] + u.saida * p[2]) / 1e6) * 1e5) / 1e5;
}

const PRAZO_MS = 75_000;
const MAX_RODADAS = 10;

/**
 * Provedor principal: OpenAI (IA_PROVEDOR=claude troca). Se o principal falhar (sem crédito, fora do ar, limite) e houver chave do outro,
 * a resposta sai pelo outro: a Amanda não para (caso real 16/11: a OpenAI ficou sem crédito e tudo foi para a equipe).
 */
export async function pensar(system: string, conversa: Msg[], c: Contexto, modeloOpenai?: string): Promise<Resposta> {
  const temOpenai = Boolean(env.openaiKey), temClaude = Boolean(env.anthropicKey);
  const principalClaude = process.env.IA_PROVEDOR === 'claude' ? temClaude : !temOpenai && temClaude;
  const principal = principalClaude ? comClaude : comOpenai;
  const reserva = principalClaude ? (temOpenai ? comOpenai : undefined) : (temClaude ? comClaude : undefined);
  try { return await (principal === comOpenai ? comOpenai(system, conversa, c, modeloOpenai) : principal(system, conversa, c)); }
  catch (e) {
    if (!reserva) throw e;
    evt('erro', { mensagem: `IA: provedor principal falhou, usando a reserva: ${(e as Error).message.slice(0, 160)}` });
    return reserva === comOpenai ? comOpenai(system, conversa, c, modeloOpenai) : reserva(system, conversa, c);
  }
}

async function rodarFerramenta(nome: string, args: unknown, c: Contexto, log: Resposta['ferramentas']) {
  const t0 = Date.now();
  const r = JSON.stringify(await executar(nome, args, c)).slice(0, 12000);
  (c.saida.dados ??= []).push(r);
  log.push({ nome, args, ms: Date.now() - t0, res: r.slice(0, 300) });
  return r;
}

async function comOpenai(system: string, conversa: Msg[], c: Contexto, modeloOpenai?: string): Promise<Resposta> {
  const modelo = modeloOpenai || env.iaModeloOpenai;
  const tools = DEFINICOES.map((d) => ({ type: 'function', function: { name: d.name, description: d.description, parameters: d.parameters } }));
  const msgs: any[] = [{ role: 'system', content: system }, ...conversa];
  const log: Resposta['ferramentas'] = [];
  const uso = usoZero();
  const ini = Date.now();
  for (let i = 1; i <= MAX_RODADAS; i++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', signal: AbortSignal.timeout(Math.max(5000, PRAZO_MS - (Date.now() - ini))),
      headers: { Authorization: `Bearer ${env.openaiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: modelo, messages: msgs, tools, temperature: 0.2, parallel_tool_calls: true }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const j: any = await res.json();
    uso.chamadas++; uso.entrada += j.usage?.prompt_tokens ?? 0; uso.cache += j.usage?.prompt_tokens_details?.cached_tokens ?? 0; uso.saida += j.usage?.completion_tokens ?? 0;
    const m = j.choices?.[0]?.message;
    const calls: any[] = m?.tool_calls ?? [];
    if (!calls.length) return { texto: String(m?.content ?? '').trim(), rodadas: i, ferramentas: log, modelo, uso };
    msgs.push({ role: 'assistant', content: m.content ?? null, tool_calls: calls });
    const saidas = await Promise.all(calls.map(async (tc) => {
      let args: unknown = {};
      try { args = JSON.parse(tc.function.arguments || '{}'); } catch { /* args inválidos */ }
      return { role: 'tool', tool_call_id: tc.id, content: await rodarFerramenta(tc.function.name, args, c, log) };
    }));
    msgs.push(...saidas);
  }
  evt('erro', { mensagem: 'IA: limite de rodadas de ferramentas' });
  return { texto: '', rodadas: MAX_RODADAS, ferramentas: log, modelo, uso };
}

async function comClaude(system: string, conversa: Msg[], c: Contexto): Promise<Resposta> {
  const modelo = env.model;
  const tools = DEFINICOES.map((d) => ({ name: d.name, description: d.description, input_schema: d.parameters }));
  const msgs: any[] = conversa.map((m) => ({ role: m.role, content: m.content }));
  const log: Resposta['ferramentas'] = [];
  const uso = usoZero();
  const ini = Date.now();
  for (let i = 1; i <= MAX_RODADAS; i++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: AbortSignal.timeout(Math.max(5000, PRAZO_MS - (Date.now() - ini))),
      headers: { 'x-api-key': env.anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: modelo, max_tokens: 1200, system, tools, messages: msgs }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const j: any = await res.json();
    { const cl = j.usage?.cache_read_input_tokens ?? 0; uso.chamadas++; uso.entrada += (j.usage?.input_tokens ?? 0) + cl + (j.usage?.cache_creation_input_tokens ?? 0); uso.cache += cl; uso.saida += j.usage?.output_tokens ?? 0; }
    const blocos: any[] = j.content ?? [];
    const usos = blocos.filter((b) => b.type === 'tool_use');
    const texto = blocos.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (!usos.length) return { texto, rodadas: i, ferramentas: log, modelo, uso };
    msgs.push({ role: 'assistant', content: blocos });
    const resultados = await Promise.all(usos.map(async (u) => ({ type: 'tool_result', tool_use_id: u.id, content: await rodarFerramenta(u.name, u.input, c, log) })));
    msgs.push({ role: 'user', content: resultados });
  }
  evt('erro', { mensagem: 'IA: limite de rodadas de ferramentas' });
  return { texto: '', rodadas: MAX_RODADAS, ferramentas: log, modelo, uso };
}
