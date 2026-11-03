import type { NextFunction, Request, Response } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Basic Auth compartilhado pelas telas de início (/painel), do CRM (/painel/crm) e do BI (/painel/receptivo/bi).
 * Usuário livre, senha = PAINEL_PASSWORD. Sem a variável responde 503 (nunca fica público).
 * O módulo do agente receptivo mantém a sua própria cópia, para os módulos não dependerem entre si.
 */
const digest = (v: string) => createHash('sha256').update(v, 'utf8').digest();

export function painelAuth(req: Request, res: Response, next: NextFunction) {
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
  const ok = timingSafeEqual(digest(given), digest(expected)) && header.length > 0;
  if (!ok) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Painel", charset="UTF-8"');
    return res.status(401).type('text/plain; charset=utf-8').send('Autenticação necessária.');
  }
  next();
}
