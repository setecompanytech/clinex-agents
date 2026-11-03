/**
 * Testa contas, sessões e controle de acesso do painel (src/lib/usuarios.ts e src/lib/painel-auth.ts).
 * Tudo em memória: não usa o Supabase nem grava em disco. Rodar: npx tsx scripts/teste-usuarios.ts
 */
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import express from 'express';

process.env.SUPABASE_URL = ''; process.env.SUPABASE_SERVICE_ROLE_KEY = ''; process.env.CRM_PERSISTIR = 'false';
process.env.PAINEL_PASSWORD = 'senha-mestra-teste'; process.env.SESSION_SECRET = 'segredo-de-teste';
const U = await import('../src/lib/usuarios.js');
const A = await import('../src/lib/painel-auth.js');
const { estado } = await import('../src/crm/banco.js');

let ok = 0;
const teste = async (nome: string, fn: () => Promise<void> | void) => { try { await fn(); ok++; console.log(`  ok  ${nome}`); } catch (e) { console.error(`FALHOU  ${nome}\n        ${(e as Error).message}`); process.exitCode = 1; } };
const erroDe = (fn: () => unknown) => { try { fn(); } catch (e) { return e instanceof U.UsuarioError || e instanceof A.LoginError ? (e as { codigo?: string; status?: number }).codigo ?? String((e as { status?: number }).status) : `INESPERADO ${(e as Error).message}`; } return null; };
const reqFalso = (ip = '1.1.1.1') => ({ ip }) as never;

await teste('senha: hash scrypt com sal, confere certo e errado, nunca em texto puro', () => {
  const h1 = U.hashSenha('abc12345'), h2 = U.hashSenha('abc12345');
  assert.notEqual(h1, h2, 'sal diferente a cada hash'); assert.ok(h1.startsWith('scrypt$') && !h1.includes('abc12345'));
  assert.equal(U.confereSenha('abc12345', h1), true); assert.equal(U.confereSenha('abc12346', h1), false); assert.equal(U.confereSenha('x', 'lixo'), false);
});
await teste('senha: mínimo de 8, temporária legível e diferente a cada vez', () => {
  assert.equal(erroDe(() => U.validarSenha('curta')), 'senha');
  const a = U.senhaTemporaria(), b = U.senhaTemporaria(); assert.equal(a.length, 12); assert.notEqual(a, b); assert.ok(!/[0Ol1I]/.test(a));
});
await teste('criar: normaliza e-mail, rejeita duplicado e dados ruins, admin recebe todos os módulos', () => {
  const r = U.criar({ nome: ' Ana Admin ', email: ' ANA@Clinex.com ', perfil: 'admin', modulos: [] });
  assert.equal(r.usuario.email, 'ana@clinex.com'); assert.equal(r.usuario.nome, 'Ana Admin'); assert.deepEqual(r.usuario.modulos, ['crm', 'agente']); assert.equal(r.senhaTemporaria?.length, 12);
  assert.ok(!('senha' in r.usuario), 'o hash não volta para a tela');
  assert.equal(erroDe(() => U.criar({ nome: 'Outra', email: 'ana@clinex.com', perfil: 'gestor', modulos: ['crm'] })), 'duplicado');
  assert.equal(erroDe(() => U.criar({ nome: '', email: 'a@b.com', perfil: 'gestor', modulos: ['crm'] })), 'nome');
  assert.equal(erroDe(() => U.criar({ nome: 'X', email: 'sem-arroba', perfil: 'gestor', modulos: ['crm'] })), 'email');
  assert.equal(erroDe(() => U.criar({ nome: 'X', email: 'x@b.com', perfil: 'chefe', modulos: ['crm'] })), 'perfil');
  assert.equal(erroDe(() => U.criar({ nome: 'X', email: 'x@b.com', perfil: 'atendente', modulos: [] })), 'modulos');
  assert.equal(erroDe(() => U.criar({ nome: 'X', email: 'x@b.com', perfil: 'atendente', modulos: ['crm'], senha: '123' })), 'senha');
});
await teste('último administrador não pode ser rebaixado, desativado nem excluído', () => {
  const ana = U.listar()[0];
  assert.equal(erroDe(() => U.atualizar(ana.id, { perfil: 'gestor' })), 'ultimo-admin');
  assert.equal(erroDe(() => U.atualizar(ana.id, { ativo: false })), 'ultimo-admin');
  assert.equal(erroDe(() => U.remover(ana.id)), 'ultimo-admin');
  assert.equal(erroDe(() => U.remover(ana.id, ana.id)), 'proprio');
  const bia = U.criar({ nome: 'Bia', email: 'bia@clinex.com', perfil: 'admin', modulos: [], senha: 'bia12345' }).usuario;
  U.atualizar(ana.id, { perfil: 'gestor', modulos: ['crm'] }); assert.equal(U.achar(ana.id)!.perfil, 'gestor');
  U.atualizar(ana.id, { perfil: 'admin' }); U.remover(bia.id);
});
await teste('login: conta correta entra; senha errada, e-mail desconhecido e conta inativa dão a mesma mensagem', () => {
  const c = U.criar({ nome: 'Carla', email: 'carla@clinex.com', perfil: 'atendente', modulos: ['crm'], senha: 'carla1234' }).usuario;
  const r = A.entrar(reqFalso('2.2.2.2'), 'Carla@Clinex.com', 'carla1234');
  assert.equal(r.sessao.id, c.id); assert.equal(r.sessao.perfil, 'atendente'); assert.ok(U.achar(c.id)!.ultimoAcesso, 'registra o último acesso');
  const msg = (e: string, s: string) => { try { A.entrar(reqFalso('3.3.3.3'), e, s); } catch (x) { return (x as Error).message; } return ''; };
  A.limparTentativas();
  const m1 = msg('carla@clinex.com', 'errada123'), m2 = msg('naoexiste@x.com', 'qualquer123'); assert.equal(m1, m2); assert.match(m1, /incorretos/);
  U.atualizar(c.id, { ativo: false }); assert.equal(msg('carla@clinex.com', 'carla1234'), m1, 'inativa = mesma mensagem'); U.atualizar(c.id, { ativo: true });
});
await teste('login mestre com PAINEL_PASSWORD; sem a variável o usuário "mestre" não entra', () => {
  const r = A.entrar(reqFalso('4.4.4.4'), 'mestre', 'senha-mestra-teste'); assert.equal(r.sessao.master, true); assert.equal(r.sessao.perfil, 'admin');
  assert.equal(erroDe(() => A.entrar(reqFalso('4.4.4.4'), 'mestre', 'errada')), '401');
  assert.ok(A.lerToken(r.token), 'token mestre vale');
  const guardada = process.env.PAINEL_PASSWORD; delete process.env.PAINEL_PASSWORD;
  assert.equal(A.lerToken(r.token), null, 'sem a variável o token mestre deixa de valer');
  assert.equal(erroDe(() => A.entrar(reqFalso('4.4.4.5'), 'mestre', 'senha-mestra-teste')), '401'); process.env.PAINEL_PASSWORD = guardada;
});
await teste('proteção contra tentativas: trava no 6º erro e destrava depois do prazo ou com acerto na janela', () => {
  A.limparTentativas();
  const ip = reqFalso('5.5.5.5'); const t0 = 1_000_000;
  for (let i = 0; i < 5; i++) assert.equal(erroDe(() => A.entrar(ip, 'carla@clinex.com', 'errada1234', t0 + i)), '401');
  assert.equal(erroDe(() => A.entrar(ip, 'carla@clinex.com', 'carla1234', t0 + 100)), '429', 'mesmo a senha certa fica travada');
  assert.ok(A.entrar(ip, 'carla@clinex.com', 'carla1234', t0 + 61_000).sessao, 'depois de 1 minuto libera');
  assert.ok(A.entrar(reqFalso('6.6.6.6'), 'carla@clinex.com', 'carla1234').sessao, 'outro IP não é afetado');
});
await teste('token: adulterado, expirado, de usuário desativado, com senha trocada ou perfil mudado deixa de valer', () => {
  A.limparTentativas();
  const u = U.criar({ nome: 'Dani', email: 'dani@clinex.com', perfil: 'gestor', modulos: ['crm', 'agente'], senha: 'dani12345' }).usuario;
  const { token } = A.entrar(reqFalso('7.7.7.7'), 'dani@clinex.com', 'dani12345');
  assert.equal(A.lerToken(token)?.id, u.id);
  const [c, s] = token.split('.'); assert.equal(A.lerToken(`${c}.${s.slice(0, -2)}xx`), null, 'assinatura trocada');
  assert.equal(A.lerToken(`${Buffer.from(JSON.stringify({ i: u.id, e: 9999999999, v: 1 })).toString('base64url')}.${s}`), null, 'conteúdo trocado');
  assert.equal(A.lerToken(token, Date.now() + 13 * 3600_000), null, 'expira em 12 h');
  assert.equal(A.lerToken(undefined), null); assert.equal(A.lerToken('lixo'), null);
  U.atualizar(u.id, { perfil: 'leitura' }); assert.equal(A.lerToken(token), null, 'perfil mudou: sessão cai');
  const t2 = A.entrar(reqFalso('7.7.7.8'), 'dani@clinex.com', 'dani12345').token; assert.ok(A.lerToken(t2));
  U.redefinirSenha(u.id, 'nova-senha-1'); assert.equal(A.lerToken(t2), null, 'senha redefinida: sessão cai');
  const t3 = A.entrar(reqFalso('7.7.7.9'), 'dani@clinex.com', 'nova-senha-1').token; assert.ok(A.lerToken(t3));
  U.atualizar(u.id, { ativo: false }); assert.equal(A.lerToken(t3), null, 'desativada: sessão cai');
});
await teste('alterar a própria senha exige a atual e derruba as outras sessões', () => {
  A.limparTentativas();
  const u = U.criar({ nome: 'Edu', email: 'edu@clinex.com', perfil: 'atendente', modulos: ['crm'], senha: 'edu123456' }).usuario;
  const t = A.entrar(reqFalso('8.8.8.8'), 'edu@clinex.com', 'edu123456').token;
  assert.equal(erroDe(() => U.alterarMinhaSenha(u.id, 'errada', 'novasenha1')), 'senha-atual');
  assert.equal(erroDe(() => U.alterarMinhaSenha(u.id, 'edu123456', 'curta')), 'senha');
  U.alterarMinhaSenha(u.id, 'edu123456', 'novasenha1'); assert.equal(A.lerToken(t), null);
  assert.ok(A.entrar(reqFalso('8.8.8.9'), 'edu@clinex.com', 'novasenha1').sessao);
});

// ---------------------------------------------------------------- middlewares com um servidor de verdade
const app = express();
app.use(express.json());
app.use(A.painelAuth);
app.get('/pagina', (_req, res) => res.send('pagina'));
app.get('/dados', (req, res) => res.json({ eu: req.sessao?.nome }));
app.use('/crm', A.exigirModulo('crm'), A.exigirEscrita, (_req, res) => res.json({ ok: true }));
app.use('/agente', A.exigirModulo('agente'), (_req, res) => res.json({ ok: true }));
app.get('/admin', A.exigirAdmin, (_req, res) => res.json({ admin: true }));
const servidor = createServer(app); await new Promise<void>((r) => servidor.listen(0, r));
const base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
const basic = (s = 'senha-mestra-teste') => ({ Authorization: `Basic ${Buffer.from(`x:${s}`).toString('base64')}` });
const comCookie = (token: string, extra: Record<string, string> = {}) => ({ Cookie: `clinex_sessao=${encodeURIComponent(token)}`, ...extra });
const tokenDe = (email: string, senha: string) => { A.limparTentativas(); return A.entrar(reqFalso('9.9.9.9'), email, senha).token; };
/** Navegação de verdade (o fetch do Node força Sec-Fetch-Mode: cors, então usamos http direto). */
const nav = (rota: string, h: Record<string, string> = {}) => new Promise<{ status: number; location?: string; texto: string }>((ok, ruim) => {
  const u = new URL(base + rota);
  const r = httpRequest({ host: u.hostname, port: u.port, path: u.pathname + u.search, headers: { Accept: 'text/html', 'Sec-Fetch-Mode': 'navigate', ...h } }, (res) => { let t = ''; res.on('data', (c) => (t += c)); res.on('end', () => ok({ status: res.statusCode ?? 0, location: res.headers.location, texto: t })); });
  r.on('error', ruim); r.end();
});
const get = (rota: string, h: Record<string, string> = {}, init: RequestInit = {}) => fetch(base + rota, { redirect: 'manual', headers: h, ...init });

await teste('sem credencial: navegação vai para o login (com o destino); API e scripts recebem 401 JSON', async () => {
  const n = await nav('/pagina'); assert.equal(n.status, 302); assert.equal(n.location, '/painel/login?next=%2Fpagina');
  const api = await get('/dados', { Accept: 'application/json' }); assert.equal(api.status, 401); assert.equal((await api.json()).erro, 'auth');
  assert.equal((await get('/pagina')).status, 401, 'sem Accept de página também é 401');
});
await teste('Basic Auth com a senha mestra continua funcionando (scripts, testes e curl)', async () => {
  assert.equal((await get('/pagina', basic())).status, 200); assert.equal((await get('/pagina', basic('errada'))).status, 401);
  assert.equal((await (await get('/dados', basic())).json()).eu, 'Acesso mestre');
});
await teste('quem entrou pela conta vale mais que a senha mestra reenviada pelo navegador (Basic em cache)', async () => {
  const t = tokenDe('carla@clinex.com', 'carla1234');
  const r = await get('/dados', { ...comCookie(t), ...basic() });
  assert.equal((await r.json()).eu, 'Carla', 'a conta tem que vencer o mestre');
});
await teste('a senha mestra em cache do navegador não abre páginas (vai para o login); para scripts continua valendo', async () => {
  const n = await nav('/pagina', basic()); assert.equal(n.status, 302); assert.match(n.location ?? '', /\/painel\/login/);
  assert.equal((await get('/pagina', basic())).status, 200);
});
await teste('cookie de sessão autentica e identifica a pessoa', async () => {
  const r = await get('/dados', comCookie(tokenDe('carla@clinex.com', 'carla1234'))); assert.equal(r.status, 200); assert.equal((await r.json()).eu, 'Carla');
});
await teste('módulo não liberado: 403 (JSON para API, página amigável para navegação); admin e mestre passam', async () => {
  const carla = comCookie(tokenDe('carla@clinex.com', 'carla1234'));   // atendente só com CRM
  assert.equal((await get('/crm', carla)).status, 200);
  const api = await get('/agente', carla); assert.equal(api.status, 403); assert.equal((await api.json()).erro, 'acesso');
  const pag = await nav('/agente', { Cookie: carla.Cookie }); assert.equal(pag.status, 403); assert.match(pag.texto, /Sem acesso/);
  assert.equal((await get('/agente', basic())).status, 200);
});
await teste('gestão de usuários só para administrador', async () => {
  assert.equal((await get('/admin', comCookie(tokenDe('carla@clinex.com', 'carla1234')))).status, 403);
  assert.equal((await get('/admin', basic())).status, 200);
});
await teste('perfil somente leitura: consulta passa, alteração é barrada, pergunta ao agente continua livre', async () => {
  U.criar({ nome: 'Leo', email: 'leo@clinex.com', perfil: 'leitura', modulos: ['crm'], senha: 'leo123456' });
  const leo = comCookie(tokenDe('leo@clinex.com', 'leo123456'), { 'Content-Type': 'application/json' });
  assert.equal((await get('/crm/leads', leo)).status, 200);
  const post = await get('/crm/leads', leo, { method: 'POST', body: '{}' }); assert.equal(post.status, 403); assert.equal((await post.json()).erro, 'leitura');
  assert.equal((await get('/crm/agente', leo, { method: 'POST', body: '{}' })).status, 200, 'perguntas ao agente não gravam');
  assert.equal((await get('/crm/x', comCookie(tokenDe('carla@clinex.com', 'carla1234'), { 'Content-Type': 'application/json' }), { method: 'POST', body: '{}' })).status, 200, 'atendente altera');
});
await teste('alteração por cookie de outra origem é recusada; da mesma origem passa', async () => {
  const c = comCookie(tokenDe('carla@clinex.com', 'carla1234'), { 'Content-Type': 'application/json' });
  assert.equal((await get('/crm/x', { ...c, Origin: 'https://site-malicioso.com' }, { method: 'POST', body: '{}' })).status, 403);
  assert.equal((await get('/crm/x', { ...c, Origin: base }, { method: 'POST', body: '{}' })).status, 200);
});
await teste('sem PAINEL_PASSWORD e sem contas o painel fica fechado (503)', async () => {
  const guardada = process.env.PAINEL_PASSWORD, contas = estado.usuarios; delete process.env.PAINEL_PASSWORD; estado.usuarios = [];
  assert.equal((await get('/pagina')).status, 503); process.env.PAINEL_PASSWORD = guardada; estado.usuarios = contas;
});
servidor.close();
console.log(process.exitCode ? `${ok} passaram, houve falhas.` : `${ok} testes passaram.`);
process.exit(process.exitCode ?? 0);
