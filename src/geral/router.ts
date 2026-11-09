import { Router, type NextFunction, type Request, type Response } from 'express';
import { criarToken, definirCookie, entrar, exigirAdmin, exigirModulo, limparCookie, LoginError, painelAuth, sessaoDaRequisicao, sessaoPublica } from '../lib/painel-auth.js';
import { alterarMinhaSenha, atualizar, criar, listar, MODULOS, PERFIS, redefinirSenha, remover, UsuarioError } from '../lib/usuarios.js';
import { atualizarContas, estado } from '../crm/banco.js';
import { tabelasAusentes } from '../crm/persistencia.js';
import { DS_CSP, paginaModulo } from '../ui/ds.js';
import { montarGeral } from './dados.js';
import { assistenteCss, assistenteJs } from './assistente.js';
import { geralCss, geralJs, loginCss, loginHtml, loginJs, usuariosCss, usuariosJs } from './ui.js';

/**
 * Painel geral (/painel): login, visão geral com CRM + Agente receptivo e gestão de usuários.
 * As rotas protegidas usam painelAuth uma a uma (este roteador também fica no caminho de /painel/crm e /painel/receptivo,
 * que têm a própria proteção).
 */
const router = Router();

const semCache = (res: Response) => { res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('X-Robots-Tag', 'noindex, nofollow'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); };
const js = (res: Response, texto: string) => res.type('application/javascript; charset=utf-8').send(texto);
/** Só aceita voltar para dentro do painel (nunca para outro site). */
const destino = (n: unknown) => (typeof n === 'string' && /^\/painel(?:[/?#]|$)/.test(n) && !n.startsWith('//') && !n.includes('\\') ? n : '/painel');
const mesmaOrigem = (req: Request) => { const o = req.headers.origin; if (!o) return true; try { return new URL(o).host === req.headers.host; } catch { return false; } };

// ------------------------------------------------------------------------------------------------ login e sessão (públicos)

router.get('/login', (req, res) => {
  semCache(res);
  if (!process.env.PAINEL_PASSWORD && !estado.usuarios.length) return void res.status(503).type('text/plain; charset=utf-8').send('Painel desativado: configure PAINEL_PASSWORD (acesso mestre) para criar o primeiro usuário.');
  if (sessaoDaRequisicao(req)) return void res.redirect(302, destino(req.query.next));
  res.setHeader('Content-Security-Policy', DS_CSP);
  res.type('text/html; charset=utf-8').send(loginHtml(loginCss));
});
router.get('/login.js', (_req, res) => js(res, loginJs));

router.post('/login', async (req, res) => {
  semCache(res);
  if (!mesmaOrigem(req)) return void res.status(403).json({ erro: 'origem', mensagem: 'Pedido de outra origem recusado.' });
  const b = (req.body ?? {}) as { login?: unknown; senha?: unknown; next?: unknown };
  await atualizarContas(0).catch(() => undefined);
  try {
    const { token } = entrar(req, b.login, b.senha);
    definirCookie(req, res, token);
    res.json({ ok: true, next: destino(b.next) });
  } catch (e) {
    if (e instanceof LoginError) return void res.status(e.status).json({ erro: 'login', mensagem: e.message });
    throw e;
  }
});

router.post('/sair', (req, res) => { semCache(res); if (!mesmaOrigem(req)) return void res.status(403).json({ erro: 'origem' }); limparCookie(res); res.json({ ok: true }); });
router.get('/sair', (_req, res) => { semCache(res); limparCookie(res); res.redirect(302, '/painel/login'); });

// ------------------------------------------------------------------------------------------------ eu

router.get('/eu', painelAuth, (req, res) => res.json(sessaoPublica(req.sessao!)));

router.put('/api/eu/senha', painelAuth, (req, res) => {
  const s = req.sessao!;
  if (s.master) return void res.status(400).json({ erro: 'mestre', mensagem: 'O acesso mestre usa a senha do servidor (PAINEL_PASSWORD). Troque por lá.' });
  const b = (req.body ?? {}) as { atual?: unknown; nova?: unknown };
  try {
    const versao = alterarMinhaSenha(s.id, b.atual, b.nova);
    definirCookie(req, res, criarToken(s, versao)); // esta sessão continua; as outras caem
    res.json({ ok: true });
  } catch (e) { erroUsuario(res, e); }
});

// ------------------------------------------------------------------------------------------------ gestão de usuários (só administrador)

function erroUsuario(res: Response, e: unknown) {
  if (e instanceof UsuarioError) {
    const status = e.codigo === 'inexistente' ? 404 : e.codigo === 'duplicado' || e.codigo === 'ultimo-admin' ? 409 : 400;
    return void res.status(status).json({ erro: e.codigo, mensagem: e.message });
  }
  throw e;
}
const admin = [painelAuth, exigirAdmin];

router.get('/api/usuarios', ...admin, async (req, res) => {
  await atualizarContas(0).catch(() => undefined); // a lista de contas sempre sai fresca do banco
  res.json({ usuarios: listar(), perfis: PERFIS, modulos: MODULOS, eu: req.sessao!.id, tabelaAusente: tabelasAusentes().includes('painel_usuarios') });
});
router.post('/api/usuarios', ...admin, (req, res) => {
  try { res.status(201).json(criar((req.body ?? {}) as Record<string, unknown>, req.sessao!.nome)); } catch (e) { erroUsuario(res, e); }
});
router.put('/api/usuarios/:id', ...admin, (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  if (String(req.params.id) === req.sessao!.id && (b.ativo === false || (b.perfil !== undefined && b.perfil !== 'admin'))) {
    return void res.status(400).json({ erro: 'proprio', mensagem: 'Você não pode desativar nem rebaixar o seu próprio usuário. Peça a outro administrador.' });
  }
  try { res.json({ usuario: atualizar(String(req.params.id), b) }); } catch (e) { erroUsuario(res, e); }
});
router.post('/api/usuarios/:id/senha', ...admin, (req, res) => {
  try { res.json(redefinirSenha(String(req.params.id), (req.body as { senha?: unknown } | undefined)?.senha)); } catch (e) { erroUsuario(res, e); }
});
router.delete('/api/usuarios/:id', ...admin, (req, res) => {
  try { remover(String(req.params.id), req.sessao!.id); res.json({ ok: true }); } catch (e) { erroUsuario(res, e); }
});

// ------------------------------------------------------------------------------------------------ dados e páginas

router.get('/api/geral', painelAuth, (req: Request, res: Response, next: NextFunction) => {
  montarGeral(req.sessao!, Number(req.query.dias), req.query.fonte === 'demo' ? 'demo' : 'real').then((d) => res.json(d)).catch(next);
});

const paginaGeral = paginaModulo({
  titulo: 'Painel geral', modulo: 'geral', ativo: 'geral', css: geralCss, agente: false, scripts: ['/painel/geral.js'],
  main: '<main id="main" class="tela"><p class="mut">Carregando…</p></main>',
});
const paginaUsuarios = paginaModulo({
  titulo: 'Usuários', modulo: 'geral', ativo: 'usuarios', css: usuariosCss, agente: false, scripts: ['/painel/usuarios.js'],
  main: '<main id="main" class="tela"><p class="mut">Carregando…</p></main>',
});
const paginaAssistente = paginaModulo({
  titulo: 'Agente Clinex', modulo: 'geral', ativo: 'assistente', css: assistenteCss, agente: false, scripts: ['/painel/assistente.js'],
  main: '<main id="main" class="tela"><p class="mut">Carregando…</p></main>',
});
router.get('/assistente', painelAuth, exigirModulo('crm'), (_req, res) => { res.setHeader('Content-Security-Policy', DS_CSP); res.type('text/html; charset=utf-8').send(paginaAssistente); });
router.get('/assistente.js', painelAuth, exigirModulo('crm'), (_req, res) => js(res, assistenteJs));
router.get('/', painelAuth, (_req, res) => { res.setHeader('Content-Security-Policy', DS_CSP); res.type('text/html; charset=utf-8').send(paginaGeral); });
router.get('/usuarios', painelAuth, exigirAdmin, (_req, res) => { res.setHeader('Content-Security-Policy', DS_CSP); res.type('text/html; charset=utf-8').send(paginaUsuarios); });
router.get('/geral.js', painelAuth, (_req, res) => js(res, geralJs));
router.get('/usuarios.js', painelAuth, exigirAdmin, (_req, res) => js(res, usuariosJs));

export default router;
