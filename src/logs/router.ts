import { Router, type NextFunction, type Request, type Response } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { buscarEventos, logsConfigurado } from './vercel.js';
import { clientJs } from './client.js';

/**
 * Painel de LOGS (GET /painel/logs): cada consulta ao Clinilink/Inovstar/GPT e cada resposta da Amanda.
 * Mesma proteção do /painel (senha PAINEL_PASSWORD). Não grava nada: lê os logs de execução da Vercel.
 * Dados pessoais já saem mascarados na origem (src/lib/log.ts).
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

const CSP = "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const pagina = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Logs do agente</title>
<style>
:root{--bg:#f6f7f9;--fg:#1c2330;--mut:#667085;--card:#fff;--bd:#e3e6eb;--acc:#1f6feb}
@media (prefers-color-scheme:dark){:root{--bg:#0f1218;--fg:#e7eaf0;--mut:#98a2b3;--card:#171c25;--bd:#2a3140;--acc:#58a6ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,Segoe UI,Roboto,sans-serif}
header{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:14px 18px;border-bottom:1px solid var(--bd);background:var(--card)}
h1{font-size:17px;margin:0;flex:1}a{color:var(--acc);text-decoration:none}
.wrap{padding:16px 18px;max-width:1280px;margin:0 auto}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:14px}
.card{background:var(--card);border:1px solid var(--bd);border-radius:10px;padding:12px 14px}.n{font-size:22px;font-weight:650}.l{color:var(--mut);font-size:12px}
.bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:10px}
select,input[type=text],button{font:inherit;padding:7px 10px;border:1px solid var(--bd);border-radius:8px;background:var(--card);color:var(--fg)}
button{cursor:pointer;background:var(--acc);color:#fff;border-color:var(--acc)}
.aviso{display:none;background:#fff4e5;color:#7a4b00;border:1px solid #f5c26b;padding:10px 12px;border-radius:8px;margin-bottom:12px}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--bd);border-radius:10px;overflow:hidden}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--bd);vertical-align:top}th{color:var(--mut);font-weight:600;font-size:12px}
tr.lin{cursor:pointer}tr.lin:hover{background:rgba(127,127,127,.08)}
.mono{font-family:ui-monospace,Consolas,monospace}.mut{color:var(--mut)}
.b{display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;border:1px solid var(--bd)}
.b-clinilink{background:#e6f0ff;color:#0b4fb3}.b-gpt{background:#f1e8ff;color:#5a2db3}.b-resposta{background:#e5f7ea;color:#146c2e}.b-inovstar{background:#fff2e0;color:#8a4b00}.b-ignorado{background:#eee;color:#555}.b-erro{background:#fde8e8;color:#a31616}
pre{margin:0;white-space:pre-wrap;word-break:break-word;font:12px/1.4 ui-monospace,Consolas,monospace;background:rgba(127,127,127,.1);padding:10px;border-radius:8px}
.nota{color:var(--mut);font-size:12px;margin-top:10px}
</style></head><body>
<header><h1>Logs do agente: consultas e retornos</h1><a href="/painel">← Mapa do fluxo</a><span id="estado" class="mut"></span></header>
<div class="wrap">
<div id="aviso" class="aviso"></div>
<div id="cards" class="cards"></div>
<div class="bar">
<label>Janela <select id="f-min"><option value="30">30 min</option><option value="60" selected>1 hora</option><option value="180">3 horas</option><option value="720">12 horas</option><option value="1440">24 horas</option></select></label>
<label>Tipo <select id="f-tipo"><option value="">todos</option><option value="clinilink">Clinilink</option><option value="resposta">Resposta da Amanda</option><option value="gpt">Tom amigável (GPT)</option><option value="inovstar">Inovstar</option><option value="ignorado">Ignorado</option><option value="erro">Erro</option></select></label>
<input id="f-at" type="text" placeholder="Atendimento (últimos caracteres)">
<label><input id="f-erro" type="checkbox"> só problemas</label>
<label><input id="auto" type="checkbox"> atualizar a cada 15 s</label>
<button id="btn" type="button">Atualizar</button><span id="cont" class="mut"></span>
</div>
<table><thead><tr><th>Hora (Belém)</th><th>Atendimento</th><th>Tipo</th><th>O que aconteceu</th></tr></thead><tbody id="corpo"></tbody></table>
<p class="nota">Clique em uma linha para ver o registro completo, incluindo o retorno resumido de cada consulta. CPF, telefone e nascimento são mascarados e o paciente aparece só pelo primeiro nome. A Vercel guarda os logs por um tempo limitado, conforme o plano contratado.</p>
</div>
<script src="/painel/logs/app.js"></script>
</body></html>`;

router.get('/', (_req, res) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.type('text/html; charset=utf-8').send(pagina);
});
router.get('/app.js', (_req, res) => res.type('application/javascript; charset=utf-8').send(clientJs));

router.get('/data.json', async (req, res) => {
  if (!logsConfigurado()) return res.json({ configurado: false, eventos: [] });
  const min = Number(req.query.min ?? 60);
  const r = await buscarEventos({ minutos: Number.isFinite(min) ? min : 60 });
  res.json({ configurado: true, ...r });
});

export default router;
