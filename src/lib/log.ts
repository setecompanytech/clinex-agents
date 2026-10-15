import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Log estruturado: UMA linha JSON por evento, prefixo fixo {"app":"amanda",...}. O painel /painel/logs
 * lê essas linhas dos logs de execução da Vercel. Dados pessoais são mascarados ANTES de escrever
 * (CPF, telefone, data de nascimento, tokens) e o nome de paciente aparece só como primeiro nome.
 */

const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const NASC = /\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}\b/g;
const FONE = /\+?\b\d{10,13}\b/g;
const SEGREDO = /(Bearer\s+|x-api-key[:=]\s*|key=|inovstar_|sk-)[A-Za-z0-9_\-]{8,}/gi;

const NOME_COMPLETO = /((?:cadastro de|paciente novo:|cadastrado \()\s*)(\p{L}+)((?:\s+\p{L}+)+)/giu;

export function mascarar(texto: string): string {
  return texto
    .replace(NOME_COMPLETO, (_m, pre, primeiro) => `${pre}${primeiro} ***`)
    .replace(SEGREDO, '$1***')
    .replace(CPF, '***.***.***-**')
    .replace(NASC, '**/**/****')
    .replace(FONE, (m) => `(**) *****-${m.slice(-4)}`);
}

const CHAVES_SENSIVEIS = /^(cpf|nascimento|dataNascimento|telefone|email|endereco|senha|token|chave|apiKey)$/i;

function limpar(v: unknown, chave = '', fundo = 0): unknown {
  if (fundo > 5) return '[…]';
  if (CHAVES_SENSIVEIS.test(chave)) return '***';
  if (/^nome(Paciente)?$/i.test(chave) && typeof v === 'string') return v.split(/\s+/)[0] ?? '';
  if (typeof v === 'string') return mascarar(v).slice(0, 1500);
  if (Array.isArray(v)) return v.slice(0, 12).map((x) => limpar(x, chave, fundo + 1));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, limpar(x, k, fundo + 1)]));
  return v;
}

/** Contexto da conversa: todo evento escrito dentro de `comAtendimento` leva o id do atendimento. */
const ctx = new AsyncLocalStorage<{ atendimento: string }>();
export const comAtendimento = <T>(atendimento: string, fn: () => Promise<T>) => ctx.run({ atendimento }, fn);

/** tipo: webhook | ignorado | clinilink | inovstar | gpt | resposta | transferencia | erro */
export function evt(tipo: string, dados: Record<string, unknown> = {}) {
  try {
    console.log(JSON.stringify({ app: 'amanda', t: new Date().toISOString(), evt: tipo, atendimento: ctx.getStore()?.atendimento, ...(limpar(dados) as object) }));
  } catch {
    console.log(JSON.stringify({ app: 'amanda', evt: 'erro', mensagem: 'falha ao registrar evento' }));
  }
}
