import { Router, type NextFunction, type Request, type Response } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { buscarEventos, logsConfigurado, type Evento } from './vercel.js';
import { eventosDaMemoria, estadoArmazem } from '../bi/armazem.js';
import { DS_CSP, paginaModulo } from '../ui/ds.js';
import { clientJs } from './client.js';

/**
 * Painel de LOGS (GET /painel/receptivo/logs): cada consulta ao Clinilink/Inovstar/GPT e cada resposta da Amanda.
 * Mesma proteção do /painel (senha PAINEL_PASSWORD). Lê os eventos do banco do BI (Supabase ou arquivo local) e,
 * se configurado, também os logs de execução da Vercel. Dados pessoais já saem mascarados na origem (src/lib/log.ts).
 */
const router = Router();
const digest = (v: string) => createHash('sha256').update(v, 'utf8').digest();

function basicAuth(req: Request, res: Response, next: NextFunction) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const expected = process.env.PAINEL_PASSWORD ?? '';
  if (!expected) return res.status(503).type('text/plain; charset=utf-8').send('Painel desativado: a variável PAINEL_PASSWORD não está configurada.');
  const header = req.header('authorization') ?? '';
  let given = '';
  if (/^basic /i.test(header)) { const d = Buffer.from(header.slice(6).trim(), 'base64').toString('utf8'); given = d.slice(d.indexOf(':') + 1); }
  if (!(timingSafeEqual(digest(given), digest(expected)) && header.length > 0)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Painel do agente", charset="UTF-8"');
    return res.status(401).type('text/plain; charset=utf-8').send('Autenticação necessária.');
  }
  next();
}
router.use(basicAuth);

const css = `
.lg-tipo{--tc:var(--mut);border-color:color-mix(in srgb,var(--tc) 45%,transparent);color:var(--tc);background:color-mix(in srgb,var(--tc) 10%,transparent)}
.lg-tipo i{width:7px;height:7px;border-radius:50%;background:var(--tc);box-shadow:0 0 8px var(--tc)}
.lg-res{line-height:1.55;overflow-wrap:anywhere;max-width:760px}
.lg-bad{color:var(--bad)}
.lg-fala{display:flex;gap:10px;align-items:baseline;margin-top:4px;font-size:13px}
.lg-fala span{flex:none;min-width:62px;font:800 10px ui-monospace,Consolas,monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--mut)}
.lg-fala.amanda{color:var(--ink)}
tr.lg-prob td:first-child{box-shadow:inset 3px 0 0 var(--bad)}
tr.lg-det td{background:var(--card);padding:0 14px 14px}
tr.lg-det pre{margin:0;white-space:pre-wrap;word-break:break-word;font:12px/1.5 ui-monospace,Consolas,monospace;background:var(--solid);border:1px solid var(--line);padding:12px 14px;border-radius:12px;color:var(--ink2);animation:entra .25s both}
.tbl td{vertical-align:top}
.tab-cartao .card-h{margin-bottom:6px}
`;

const pagina = paginaModulo({
  titulo: 'Logs do agente', modulo: 'receptivo', ativo: 'logs', css, scripts: ['/painel/receptivo/logs/app.js'],
  main: '<main id="main"><p class="mut">Carregando…</p></main>',
});

router.get('/', (_req, res) => {
  res.setHeader('Content-Security-Policy', DS_CSP);
  res.type('text/html; charset=utf-8').send(pagina);
});
router.get('/app.js', (_req, res) => res.type('application/javascript; charset=utf-8').send(clientJs));

/** Junta os eventos do banco do BI (Supabase ou arquivo) com os logs de execução da Vercel, quando configurados. */
router.get('/data.json', async (req, res) => {
  const pedido = Number(req.query.min ?? 60);
  const min = Math.min(Math.max(Number.isFinite(pedido) ? pedido : 60, 5), 24 * 60);
  const desde = Date.now() - min * 60_000;
  const arm = estadoArmazem();
  let eventos: Evento[] = await eventosDaMemoria(desde);
  let fonte = arm.destino === 'supabase' ? 'Supabase' : arm.destino === 'arquivo' ? 'arquivo local' : 'memória do servidor';
  let erro: string | undefined = arm.erro ?? undefined;
  if (logsConfigurado()) {
    const chave = (e: Evento) => `${e.t}|${e.evt}|${e.atendimento ?? ''}`;
    const r = await buscarEventos({ minutos: min });
    const vistos = new Set(eventos.map(chave));
    eventos = [...eventos, ...r.eventos.filter((e) => !vistos.has(chave(e)))];
    fonte += ' + Vercel';
    erro = erro ?? r.erro;
  }
  eventos.sort((a, b) => String(b.t).localeCompare(String(a.t)));
  res.json({ configurado: true, eventos: eventos.slice(0, 600), fonte, erro });
});

export default router;
