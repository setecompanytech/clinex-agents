import type { NextFunction, Request, Response } from 'express';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { achar, autenticarConta, motivoDaRecusa, normalizaEmail, totalDeContas, registrarAcesso, MODULOS, type Modulo, type Perfil } from './usuarios.js';
import { atualizarContas, estado } from '../crm/banco.js';
import { evt } from './log.js';

/**
 * Acesso ao painel (/painel, CRM, Agente receptivo). Duas formas de entrar:
 *  1. Conta de usuário (e-mail + senha) na tela de login: gera um cookie de sessão assinado (12 h), HttpOnly.
 *  2. Acesso MESTRE: a senha PAINEL_PASSWORD (por Basic Auth, como sempre foi, ou na tela de login com o usuário "mestre").
 *     Vale como administrador de emergência e mantém scripts e testes funcionando.
 * Sem nenhuma conta e sem PAINEL_PASSWORD o painel responde 503 (nunca fica público).
 */

export type Sessao = { id: string; nome: string; email: string; perfil: Perfil; modulos: Modulo[]; master?: boolean };
declare global { namespace Express { interface Request { sessao?: Sessao } } }

const COOKIE = 'clinex_sessao';
const DURACAO_S = 12 * 3600;
export const LOGIN_MESTRE = 'mestre';

const digest = (v: string) => createHash('sha256').update(v, 'utf8').digest();
const aleatorioDoProcesso = randomBytes(32).toString('hex');
const segredo = () => process.env.SESSION_SECRET || createHash('sha256').update(`clinex-sessao|${process.env.PAINEL_PASSWORD || aleatorioDoProcesso}`).digest('hex');
const assinar = (corpo: string) => createHmac('sha256', segredo()).update(corpo).digest('base64url');

const MESTRE: Sessao = { id: 'mestre', nome: 'Acesso mestre', email: LOGIN_MESTRE, perfil: 'admin', modulos: [...MODULOS], master: true };

// ------------------------------------------------------------------------------------------------ token de sessão

export function criarToken(s: Sessao, versao = 0, agoraMs = Date.now()): string {
  const corpo = Buffer.from(JSON.stringify({ i: s.id, e: Math.floor(agoraMs / 1000) + DURACAO_S, v: versao })).toString('base64url');
  return `${corpo}.${assinar(corpo)}`;
}

export function lerToken(token: string | undefined, agoraMs = Date.now()): Sessao | null {
  if (!token) return null;
  const [corpo, assinatura] = token.split('.');
  if (!corpo || !assinatura) return null;
  const esperada = assinar(corpo);
  if (assinatura.length !== esperada.length || !timingSafeEqual(Buffer.from(assinatura), Buffer.from(esperada))) return null;
  let p: { i?: string; e?: number; v?: number };
  try { p = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8')); } catch { return null; }
  if (!p.i || !p.e || p.e * 1000 < agoraMs) return null;
  if (p.i === MESTRE.id) return process.env.PAINEL_PASSWORD ? { ...MESTRE } : null;
  const u = achar(p.i);
  // desativado, e-mail/perfil/módulos alterados ou senha trocada: a sessão antiga deixa de valer
  if (!u || !u.ativo || u.sessaoVersao !== p.v) return null;
  return { id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, modulos: u.modulos };
}

function cookieDe(req: Request): string | undefined {
  const c = req.headers.cookie; if (!c) return undefined;
  for (const par of c.split(';')) { const i = par.indexOf('='); if (par.slice(0, i).trim() === COOKIE) return decodeURIComponent(par.slice(i + 1).trim()); }
  return undefined;
}
/** Sessão de conta/mestre pelo cookie (sem exigir nada): usada pela tela de login para pular o login de quem já entrou. */
export const sessaoDaRequisicao = (req: Request): Sessao | null => lerToken(cookieDe(req));
const https = (req: Request) => req.secure || (req.headers['x-forwarded-proto'] ?? '').toString().split(',')[0] === 'https';
export function definirCookie(req: Request, res: Response, token: string) {
  res.append('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/painel; HttpOnly; SameSite=Lax; Max-Age=${DURACAO_S}${https(req) ? '; Secure' : ''}`);
}
export function limparCookie(res: Response) { res.append('Set-Cookie', `${COOKIE}=; Path=/painel; HttpOnly; SameSite=Lax; Max-Age=0`); }

// ------------------------------------------------------------------------------------------------ login com proteção contra tentativas em massa

const tentativas = new Map<string, { n: number; ate: number }>();
const LIMITE = 5, TRAVA_MS = 60_000;
const chaveTent = (req: Request, email: string) => `${req.ip ?? ''}|${email}`;
export function limparTentativas() { tentativas.clear(); }

export class LoginError extends Error {
  constructor(public status: number, mensagem: string) { super(mensagem); }
}

/** Valida as credenciais e devolve a sessão. Lança LoginError com a mensagem para a tela. */
export function entrar(req: Request, loginBruto: unknown, senhaBruta: unknown, agoraMs = Date.now()): { sessao: Sessao; token: string } {
  const login = normalizaEmail(loginBruto), senha = String(senhaBruta ?? '');
  const chave = chaveTent(req, login);
  const t = tentativas.get(chave);
  if (t && t.n >= LIMITE && t.ate > agoraMs) throw new LoginError(429, `Muitas tentativas. Aguarde ${Math.ceil((t.ate - agoraMs) / 1000)} segundos e tente de novo.`);
  if (!login || !senha) throw new LoginError(400, 'Informe o e-mail e a senha.');
  let sessao: Sessao | null = null, versao = 0;
  const senhaMestra = process.env.PAINEL_PASSWORD ?? '';
  if (login === LOGIN_MESTRE) {
    if (senhaMestra && timingSafeEqual(digest(senha), digest(senhaMestra))) sessao = { ...MESTRE };
  } else {
    const u = autenticarConta(login, senha);
    if (u) { sessao = { id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, modulos: u.modulos }; versao = u.sessaoVersao; registrarAcesso(u.id); }
  }
  if (!sessao) {
    const n = (t && t.ate > agoraMs ? t.n : 0) + 1;
    tentativas.set(chave, { n, ate: agoraMs + TRAVA_MS });
    // o motivo real fica só no log do servidor (nunca a senha); a tela não revela qual dos casos foi
    evt('login_recusado', { conta: login, motivo: login === LOGIN_MESTRE ? (senhaMestra ? 'senha_mestra_errada' : 'senha_mestra_nao_configurada') : motivoDaRecusa(login, senha), contas_carregadas: totalDeContas(), tentativa: n });
    throw new LoginError(401, 'E-mail ou senha incorretos.');
  }
  tentativas.delete(chave);
  return { sessao, token: criarToken(sessao, versao, agoraMs) };
}

// ------------------------------------------------------------------------------------------------ middlewares

function basicMestre(req: Request): boolean {
  const esperada = process.env.PAINEL_PASSWORD ?? '';
  const h = req.header('authorization') ?? '';
  if (!esperada || !/^basic /i.test(h)) return false;
  const d = Buffer.from(h.slice(6).trim(), 'base64').toString('utf8');
  return timingSafeEqual(digest(d.slice(d.indexOf(':') + 1)), digest(esperada));
}
const ehNavegacao = (req: Request) => req.method === 'GET' && /text\/html/.test(req.headers.accept ?? '') && req.headers['sec-fetch-mode'] !== 'cors';
const temContas = () => estado.usuarios.length > 0;

function negarPagina(res: Response, status: number, titulo: string, texto: string) {
  res.status(status).type('text/html; charset=utf-8').send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${titulo}</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/painel/ds.css"></head><body style="display:grid;place-items:center;min-height:100vh;padding:24px"><main style="max-width:460px;text-align:center"><h1 style="font:800 28px/1.2 system-ui;margin-bottom:10px">${titulo}</h1><p class="mut" style="margin-bottom:22px">${texto}</p><a class="btn pri" href="/painel">Voltar ao painel</a></main></body></html>`);
}

/** Antes de checar a sessão, atualiza as contas a partir do banco (só na Vercel; fora dela não faz nada). */
export function painelAuth(req: Request, res: Response, next: NextFunction) {
  atualizarContas().then(() => verificarAcesso(req, res, next), () => verificarAcesso(req, res, next));
}
function verificarAcesso(req: Request, res: Response, next: NextFunction) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');

  if (!process.env.PAINEL_PASSWORD && !temContas()) {
    return res.status(503).type('text/plain; charset=utf-8').send('Painel desativado: configure PAINEL_PASSWORD (acesso mestre) para criar o primeiro usuário.');
  }
  // 1º a sessão de quem entrou pelo formulário. A senha mestra por Basic Auth é só para scripts (curl, testes): o navegador
  // guarda essa senha de quando o painel usava a janelinha de senha e a reenvia sozinho, então ela NUNCA vale numa
  // navegação de página (senão ela esconderia a conta de quem fez login e o "Sair" não sairia de verdade).
  const daSessao = lerToken(cookieDe(req));
  let sessao: Sessao | null = daSessao, porCookie = !!daSessao;
  if (!sessao && !ehNavegacao(req) && basicMestre(req)) sessao = { ...MESTRE };

  if (!sessao) {
    if (ehNavegacao(req)) return res.redirect(302, `/painel/login?next=${encodeURIComponent(req.originalUrl)}`);
    return res.status(401).json({ erro: 'auth', mensagem: 'Entre no painel para continuar.' });
  }
  // sessão por cookie: alteração só se a origem for este mesmo site (barra pedidos forjados de outros sites)
  if (porCookie && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origem = req.headers.origin;
    if (origem && new URL(origem).host !== req.headers.host) return res.status(403).json({ erro: 'origem', mensagem: 'Pedido de outra origem recusado.' });
  }
  req.sessao = sessao;
  next();
}

const temAcesso = (s: Sessao, m: Modulo) => s.master || s.perfil === 'admin' || s.modulos.includes(m);
export const podeEscrever = (s: Sessao) => s.perfil !== 'leitura';

function negar(req: Request, res: Response, texto: string) {
  if (ehNavegacao(req)) return negarPagina(res, 403, 'Sem acesso', texto);
  return res.status(403).json({ erro: 'acesso', mensagem: texto });
}

/** Barra quem não tem o módulo liberado. Usar DEPOIS de painelAuth. */
export const exigirModulo = (m: Modulo) => (req: Request, res: Response, next: NextFunction) =>
  req.sessao && temAcesso(req.sessao, m) ? next() : negar(req, res, 'O seu usuário não tem este módulo liberado. Peça a um administrador.');

export const exigirAdmin = (req: Request, res: Response, next: NextFunction) =>
  req.sessao && (req.sessao.master || req.sessao.perfil === 'admin') ? next() : negar(req, res, 'Só administradores acessam a gestão de usuários.');

/** Usuário "somente leitura" não altera nada: só passam as consultas e as perguntas ao agente/simulações (que não gravam). */
const LIVRES_NA_LEITURA = /(^|\/)(agente|simular)(\/|$)/;
export function exigirEscrita(req: Request, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || !req.sessao || podeEscrever(req.sessao) || LIVRES_NA_LEITURA.test(req.path)) return next();
  return res.status(403).json({ erro: 'leitura', mensagem: 'Seu perfil é somente leitura: não dá para alterar nada.' });
}

export const sessaoPublica = (s: Sessao) => ({ id: s.id, nome: s.nome, email: s.email, perfil: s.perfil, modulos: s.modulos, master: !!s.master });
export { temAcesso };
