/**
 * Lê os logs de execução da Vercel e devolve só os eventos estruturados do agente ({"app":"amanda",...}).
 * Precisa de LOGS_VERCEL_TOKEN (token criado em vercel.com/account/tokens, escopo do time), LOGS_VERCEL_PROJECT_ID e LOGS_VERCEL_TEAM_ID.
 * Obs.: a Vercel guarda logs por tempo limitado (depende do plano). Nada é gravado por nós.
 */
export type Evento = { t: string; evt: string; atendimento?: string; [k: string]: unknown };

const API = 'https://api.vercel.com';

function cfg() {
  const token = process.env.LOGS_VERCEL_TOKEN ?? '';
  const projectId = process.env.LOGS_VERCEL_PROJECT_ID ?? process.env.VERCEL_PROJECT_ID ?? '';
  const teamId = process.env.LOGS_VERCEL_TEAM_ID ?? '';
  return { token, projectId, teamId };
}

export const logsConfigurado = () => {
  const c = cfg();
  return Boolean(c.token && c.projectId);
};

async function api(path: string, params: Record<string, string>, signalMs = 15000): Promise<Response> {
  const { token, teamId } = cfg();
  const qs = new URLSearchParams({ ...params, ...(teamId ? { teamId } : {}) });
  return fetch(`${API}${path}?${qs}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(signalMs) });
}

/** O endpoint de runtime-logs é um stream NDJSON: lê até acabar ou até o tempo máximo e usa o que chegou. */
async function lerStream(res: Response, maxMs: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let texto = '';
  const fim = Date.now() + maxMs;
  try {
    while (Date.now() < fim) {
      const r = await Promise.race([reader.read(), new Promise<{ done: true; value?: undefined }>((ok) => setTimeout(() => ok({ done: true }), Math.max(200, fim - Date.now())))]);
      if (r.done) break;
      texto += dec.decode(r.value, { stream: true });
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
  return texto;
}

/** Extrai eventos do amanda de uma linha de log (formato do endpoint de runtime-logs OU do `vercel logs -j`). */
function extrair(linha: string, out: Evento[]) {
  let obj: any;
  try { obj = JSON.parse(linha); } catch { return; }
  const msgs: string[] = [];
  if (typeof obj?.message === 'string') msgs.push(obj.message);
  if (Array.isArray(obj?.logs)) for (const l of obj.logs) if (typeof l?.message === 'string') msgs.push(l.message);
  for (const m of msgs) {
    const i = m.indexOf('{"app":"amanda"');
    if (i < 0) continue;
    try { const e = JSON.parse(m.slice(i)); if (e?.evt) out.push(e as Evento); } catch { /* linha cortada */ }
  }
}

export async function buscarEventos(opts: { minutos?: number; limite?: number } = {}): Promise<{ eventos: Evento[]; deployments: number; erro?: string }> {
  const { projectId } = cfg();
  const minutos = Math.min(Math.max(opts.minutos ?? 60, 5), 24 * 60);
  const limite = Math.min(opts.limite ?? 400, 1000);
  const desde = Date.now() - minutos * 60_000;
  try {
    const dep = await api('/v6/deployments', { projectId, target: 'production', limit: '3', state: 'READY' });
    if (!dep.ok) return { eventos: [], deployments: 0, erro: `Vercel recusou a consulta de deployments (${dep.status}). Confira o token.` };
    const lista: { uid: string }[] = ((await dep.json()) as any).deployments ?? [];
    const eventos: Evento[] = [];
    for (const d of lista) {
      const r = await api(`/v1/projects/${projectId}/deployments/${d.uid}/runtime-logs`, { since: String(desde), limit: '1000' }, 20000);
      if (!r.ok) continue;
      const bruto = await lerStream(r, 7000);
      for (const linha of bruto.split('\n')) if (linha.trim()) extrair(linha, eventos);
    }
    const vistos = new Set<string>();
    const unicos = eventos.filter((e) => { const k = JSON.stringify(e); if (vistos.has(k)) return false; vistos.add(k); return true; });
    unicos.sort((a, b) => String(b.t).localeCompare(String(a.t)));
    return { eventos: unicos.filter((e) => !e.t || new Date(e.t).getTime() >= desde).slice(0, limite), deployments: lista.length };
  } catch (e) {
    return { eventos: [], deployments: 0, erro: `Falha ao ler os logs da Vercel: ${(e as Error).message}` };
  }
}
