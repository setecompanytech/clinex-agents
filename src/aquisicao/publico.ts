import { Router, type Request } from 'express';
import { waitUntil } from '@vercel/functions';
import { campanhaPorCodigo, gravarEvento, NUMERO_WHATSAPP, SITE_PADRAO, textoWhats, visitante } from './campanhas.js';

/**
 * Rotas PÚBLICAS do funil de aquisição (sem login: quem acessa é quem clicou no anúncio).
 *   GET /c/CODIGO?d=site|wa       link do anúncio: conta o clique e manda para o site (com ?cmp=CODIGO) ou para o WhatsApp
 *                                  com a mensagem pronta e "(ref: CODIGO)" no fim
 *   GET /c/CODIGO?d=wa&via=site   botão de WhatsApp do site (reescrito pelo site.js): conta e manda com "(ref: CODIGO-SITE)"
 *   GET /c/CODIGO/v?u=VISITANTE   o site abriu vindo da campanha (imagem 1x1 chamada pelo site.js)
 *   GET /c/site.js                script que o site da Clinex carrega em todas as páginas
 * Nunca quebra o anúncio: código desconhecido ou banco fora ainda redireciona. Não guarda IP nem telefone.
 */
const router = Router();
const ROBO = /bot|crawl|spider|facebookexternalhit|facebot|preview|slurp|whatsapp\/|telegrambot|slackbot|discordbot|headless|lighthouse/i;
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const ip = (req: Request) => String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim();
const ua = (req: Request) => String(req.headers['user-agent'] ?? '');
const base = (req: Request) => `${String(req.headers['x-forwarded-proto'] ?? req.protocol).split(',')[0]}://${req.headers['x-forwarded-host'] ?? req.get('host')}`;
const semCache = { 'Cache-Control': 'no-store, max-age=0', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer-when-downgrade' };
const registrar = (p: Promise<unknown>) => waitUntil(p.catch((e) => console.error('[aquisicao] não gravei o evento:', (e as Error).message)));

router.get('/site.js', (req, res) => {
  res.set({ 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=900', 'Access-Control-Allow-Origin': '*' });
  res.send(scriptDoSite(base(req)));
});

router.get('/:codigo/v', async (req, res) => {
  res.set({ ...semCache, 'Content-Type': 'image/gif', 'Access-Control-Allow-Origin': '*' });
  res.send(GIF);
  if (ROBO.test(ua(req))) return;
  const c = await campanhaPorCodigo(String(req.params.codigo)).catch(() => undefined);
  if (!c) return;
  const u = /^[a-z0-9]{4,24}$/i.test(String(req.query.u ?? '')) ? String(req.query.u) : visitante(ip(req), ua(req));
  const dia = new Date().toISOString().slice(0, 10);
  registrar(gravarEvento({ campanha: c.id, etapa: 'site', chave: `site:${c.id}:${u}:${dia}`, telefone: null, atendimento: null, contato: null, dados: { pagina: String(req.query.p ?? '').slice(0, 120) } }));
});

router.get('/:codigo', async (req, res) => {
  res.set(semCache);
  const c = await campanhaPorCodigo(String(req.params.codigo)).catch(() => undefined);
  if (!c) return res.redirect(302, SITE_PADRAO);
  const viaSite = req.query.via === 'site';
  const destino = req.query.d === 'wa' || viaSite ? 'wa' : req.query.d === 'site' ? 'site' : c.urlSite || !c.mensagem ? 'site' : 'wa';
  if (!ROBO.test(ua(req))) {
    const janela = Math.floor(Date.now() / 600_000); // o mesmo clique repetido em 10 min conta uma vez
    registrar(gravarEvento({ campanha: c.id, etapa: 'clique', chave: `clique:${c.id}:${destino}:${viaSite ? 's' : 'a'}:${visitante(ip(req), ua(req))}:${janela}`, telefone: null, atendimento: null, contato: null, dados: { destino, via: viaSite ? 'site' : 'anuncio' } }));
  }
  if (destino === 'wa') {
    const doSite = typeof req.query.t === 'string' ? req.query.t.slice(0, 300) : undefined;
    return res.redirect(302, `https://wa.me/${NUMERO_WHATSAPP}?text=${encodeURIComponent(textoWhats(c, viaSite, doSite))}`);
  }
  let alvo: URL;
  try { alvo = new URL(c.urlSite || SITE_PADRAO); } catch { alvo = new URL(SITE_PADRAO); }
  const q = alvo.searchParams;
  q.set('cmp', c.codigo);
  if (!q.has('utm_source')) q.set('utm_source', c.canal);
  if (!q.has('utm_medium')) q.set('utm_medium', 'anuncio');
  if (!q.has('utm_campaign')) q.set('utm_campaign', c.codigo);
  return res.redirect(302, alvo.toString());
});

/** Script do site: lembra a campanha (?cmp=) na visita, avisa a visita e faz os botões de WhatsApp passarem pelo link rastreado. */
function scriptDoSite(api: string): string {
  return `/* Clinex · funil de aquisição: liga a visita ao site e o clique no WhatsApp à campanha do anúncio */
(function () {
  'use strict';
  var API = ${JSON.stringify(api)};
  var q = new URLSearchParams(location.search);
  var veio = (q.get('cmp') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  var c = veio;
  try { if (veio) sessionStorage.setItem('clx_cmp', veio); else c = sessionStorage.getItem('clx_cmp') || ''; } catch (e) {}
  if (!c) return;
  var v = 'x';
  try { v = localStorage.getItem('clx_v') || ''; if (!v) { v = Math.random().toString(36).slice(2, 12); localStorage.setItem('clx_v', v); } } catch (e) { v = Math.random().toString(36).slice(2, 12); }
  if (veio) { var i = new Image(); i.src = API + '/c/' + c + '/v?u=' + v + '&p=' + encodeURIComponent(location.pathname); }
  function marcar(a) {
    var h = a.getAttribute('href') || '';
    // sem trava de "já marcado": o site troca o href depois (formulário de agendamento) e o clique marca de novo
    if (!/^https?:\\/\\/(wa\\.me|api\\.whatsapp\\.com|web\\.whatsapp\\.com)\\//i.test(h)) return;
    var t = '';
    try { t = new URL(h).searchParams.get('text') || ''; } catch (e) {}
    a.setAttribute('href', API + '/c/' + c + '?d=wa&via=site' + (t ? '&t=' + encodeURIComponent(t) : ''));
  }
  function tudo() { var l = document.querySelectorAll('a[href]'); for (var k = 0; k < l.length; k++) marcar(l[k]); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tudo); else tudo();
  document.addEventListener('click', function (e) { var a = e.target && e.target.closest ? e.target.closest('a[href]') : null; if (a) marcar(a); }, true);
})();
`;
}

export default router;
