/**
 * Traz para o BI os eventos REAIS da Amanda que estão nos logs de produção da Vercel (usa a CLI `vercel` já logada: nenhuma chave nova).
 * Grava em .data/eventos.jsonl (o mesmo arquivo que o BI local lê). Eventos repetidos não duplicam; os dados pessoais já saem mascarados do agente.
 *
 *   npm run bi:importar              importa o que a Vercel ainda guarda (a Vercel só mantém os logs mais recentes: de 30 min a 1 h no plano atual)
 *   npm run bi:importar -- --seguir  repete a cada 60 s, juntando o histórico enquanto o comando ficar aberto
 *
 * Para o histórico ficar permanente sem depender deste comando, configure o Supabase (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no servidor de produção).
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

const ARQUIVO = process.env.BI_ARQUIVO || '.data/eventos.jsonl';
const seguir = process.argv.includes('--seguir');
const janela = process.argv.find((a) => /^\d+[hm]$/.test(a)) ?? '24h';

const chave = (e: Record<string, unknown>) => JSON.stringify(e);
const vistos = new Set<string>();
if (existsSync(ARQUIVO)) for (const l of readFileSync(ARQUIVO, 'utf8').split('\n')) { if (!l) continue; try { vistos.add(chave(JSON.parse(l))); } catch { /* linha cortada */ } }

function buscar(): Record<string, unknown>[] {
  const r = spawnSync('vercel', ['logs', '--no-branch', '--environment', 'production', '--since', janela, '--limit', '1000', '--json'], { encoding: 'utf8', shell: true, maxBuffer: 200 * 1024 * 1024 });
  if (r.status !== 0 && !r.stdout) throw new Error((r.stderr || 'falha ao chamar a CLI da Vercel (rode "vercel login" e "vercel link")').slice(0, 300));
  const eventos: Record<string, unknown>[] = [];
  for (const linha of (r.stdout ?? '').split('\n')) {
    if (!linha.startsWith('{')) continue;
    let reg: { message?: string; logs?: { message?: string }[] };
    try { reg = JSON.parse(linha); } catch { continue; }
    for (const m of [reg.message, ...(reg.logs ?? []).map((x) => x.message)]) {
      if (!m || !m.startsWith('{"app":"amanda"')) continue;
      try { const e = JSON.parse(m); if (e.app === 'amanda' && typeof e.evt === 'string' && typeof e.t === 'string') eventos.push(e); } catch { /* ignora */ }
    }
  }
  return eventos;
}

function importar() {
  const novos = buscar().filter((e) => !vistos.has(chave(e))).sort((a, b) => String(a.t).localeCompare(String(b.t)));
  const unicos = novos.filter((e) => { const k = chave(e); if (vistos.has(k)) return false; vistos.add(k); return true; });
  if (unicos.length) {
    mkdirSync(dirname(ARQUIVO), { recursive: true });
    appendFileSync(ARQUIVO, unicos.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
  }
  const conversas = new Set(unicos.map((e) => e.atendimento).filter(Boolean));
  console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ${unicos.length} evento(s) novo(s) de ${conversas.size} conversa(s) importados para ${ARQUIVO}`);
}

importar();
if (seguir) { console.log('Seguindo: repete a cada 60 s (Ctrl+C para parar).'); setInterval(() => { try { importar(); } catch (e) { console.error((e as Error).message); } }, 60_000); }
