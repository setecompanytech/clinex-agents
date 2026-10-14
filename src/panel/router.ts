import { Router, type NextFunction, type Request, type Response } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { flow } from './flow.js';
import { pageHtml } from './page.js';
import { clientJs } from './client.js';

/**
 * Painel somente-leitura do fluxo do agente (GET /painel).
 * Protegido por HTTP Basic Auth: usuário livre, senha = PAINEL_PASSWORD.
 * Sem PAINEL_PASSWORD configurada responde 503 (nunca fica público).
 * Não lê banco, não lê dados de pacientes e não expõe nenhuma variável de ambiente.
 */
const router = Router();

const digest = (v: string) => createHash('sha256').update(v, 'utf8').digest();

function basicAuth(req: Request, res: Response, next: NextFunction) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');

  const expected = process.env.PAINEL_PASSWORD ?? '';
  if (!expected) {
    return res.status(503).type('text/plain; charset=utf-8').send('Painel desativado: a variável PAINEL_PASSWORD não está configurada.');
  }

  const header = req.header('authorization') ?? '';
  let given = '';
  if (/^basic /i.test(header)) {
    const decoded = Buffer.from(header.slice(6).trim(), 'base64').toString('utf8');
    given = decoded.slice(decoded.indexOf(':') + 1);
  }
  // compara os hashes (tamanho fixo) em tempo constante, sem vazar o tamanho da senha
  const ok = timingSafeEqual(digest(given), digest(expected)) && header.length > 0;
  if (!ok) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Painel do agente", charset="UTF-8"');
    return res.status(401).type('text/plain; charset=utf-8').send('Autenticação necessária.');
  }
  next();
}

router.use(basicAuth);

const CSP = "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

router.get('/', (_req, res) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.type('text/html; charset=utf-8').send(pageHtml);
});

router.get('/app.js', (_req, res) => {
  res.type('application/javascript; charset=utf-8').send(clientJs);
});

router.get('/flow.json', (_req, res) => {
  res.json(flow);
});

export default router;
