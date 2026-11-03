/**
 * Cliente mínimo do Supabase (PostgREST) com a chave service_role, SÓ no servidor. Sem dependências: usa fetch.
 * A service_role ignora o RLS: nunca vai para o navegador nem para o git (fica no .env).
 */

const url = () => (process.env.SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
const chave = () => (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
export const supabaseConfigurado = () => Boolean(url() && chave());

export class SupabaseError extends Error {
  constructor(public codigo: string, mensagem: string) { super(mensagem); }
}

const ESPERA_MS = 45_000;
const PAGINA = 1000; // limite do PostgREST por resposta

type Param = string | number;
async function pedir<T>(metodo: string, tabela: string, query: Record<string, Param> = {}, corpo?: unknown, extra: Record<string, string> = {}): Promise<T> {
  if (!supabaseConfigurado()) throw new SupabaseError('config', 'SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY não estão configuradas no .env.');
  const u = new URL(`${url()}/rest/v1/${tabela}`);
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, String(v));
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ESPERA_MS);
  try {
    const res = await fetch(u, {
      method: metodo, signal: ctl.signal,
      headers: { apikey: chave(), Authorization: `Bearer ${chave()}`, 'Content-Type': 'application/json', ...extra },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    if (res.status === 204 || res.status === 201 && !(res.headers.get('content-type') ?? '').includes('json')) return undefined as T;
    const texto = await res.text();
    const json = texto ? (JSON.parse(texto) as unknown) : undefined;
    if (!res.ok) {
      const e = (json ?? {}) as { code?: string; message?: string; hint?: string };
      throw new SupabaseError(e.code ?? `http_${res.status}`, `${tabela}: ${e.message ?? res.statusText}${e.hint ? ` (${e.hint})` : ''}`);
    }
    return json as T;
  } catch (e) {
    if (e instanceof SupabaseError) throw e;
    throw new SupabaseError((e as Error).name === 'AbortError' ? 'tempo' : 'rede', `${tabela}: ${(e as Error).name === 'AbortError' ? 'o Supabase demorou demais para responder' : (e as Error).message}`);
  } finally { clearTimeout(t); }
}

/** Lê a tabela inteira (ou o filtro) em páginas de 1000. `ordem` deve ser estável (ex.: "id"). */
export async function sbLer<T = Record<string, unknown>>(tabela: string, opc: { filtro?: Record<string, string>; ordem?: string; max?: number } = {}): Promise<T[]> {
  const todos: T[] = [];
  const max = opc.max ?? Infinity;
  for (let desde = 0; todos.length < max; desde += PAGINA) {
    const lote = await pedir<T[]>('GET', tabela, { select: '*', ...(opc.filtro ?? {}), ...(opc.ordem ? { order: opc.ordem } : {}), limit: Math.min(PAGINA, max - todos.length), offset: desde });
    todos.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return todos;
}

export async function sbVazia(tabela: string): Promise<boolean> {
  const r = await pedir<unknown[]>('GET', tabela, { select: '*', limit: 1 });
  return r.length === 0;
}

/** Insere ou atualiza por chave (`onConflict` = colunas da chave, separadas por vírgula), em lotes. */
export async function sbGravar(tabela: string, linhas: Record<string, unknown>[], onConflict: string, lote = 200) {
  for (let i = 0; i < linhas.length; i += lote) {
    await pedir<void>('POST', tabela, { on_conflict: onConflict }, linhas.slice(i, i + lote), { Prefer: 'resolution=merge-duplicates,return=minimal' });
  }
}

/** Só insere (eventos). Ignora duplicados quando há chave natural. */
export async function sbInserir(tabela: string, linhas: Record<string, unknown>[], lote = 500) {
  for (let i = 0; i < linhas.length; i += lote) await pedir<void>('POST', tabela, {}, linhas.slice(i, i + lote), { Prefer: 'return=minimal' });
}

/** Apaga por filtro PostgREST (ex.: { id: 'in.(a,b)' } ou { t: 'lt.2026-01-01' }). Sem filtro, recusa. */
export async function sbApagar(tabela: string, filtro: Record<string, string>) {
  if (!Object.keys(filtro).length) throw new SupabaseError('filtro', 'Recusei apagar a tabela inteira sem filtro.');
  await pedir<void>('DELETE', tabela, filtro, undefined, { Prefer: 'return=minimal' });
}

/** Teste de ida e volta: as tabelas existem e a chave vale? Devolve as que faltam. */
export async function sbFaltantes(tabelas: string[]): Promise<string[]> {
  const faltam: string[] = [];
  for (const t of tabelas) {
    try { await pedir('GET', t, { select: '*', limit: 1 }); } catch (e) { if (e instanceof SupabaseError && (e.codigo === 'PGRST205' || e.codigo === '42P01')) faltam.push(t); else throw e; }
  }
  return faltam;
}
