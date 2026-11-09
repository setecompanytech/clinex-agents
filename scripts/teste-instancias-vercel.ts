/**
 * Simula a Vercel: DUAS instâncias do servidor (VERCEL=1) falando com o mesmo Supabase FALSO (imita o PostgREST).
 * Garante que uma conta criada numa instância aparece na outra e já está no banco quando a resposta chega.
 * Rodar: npx tsx scripts/teste-instancias-vercel.ts
 */
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:http';

type Linha = Record<string, unknown>;
const tabelas = new Map<string, Map<string, Linha>>();
let fora = false; // banco "fora do ar": derruba toda conexão
const tab = (n: string) => { let t = tabelas.get(n); if (!t) { t = new Map(); tabelas.set(n, t); } return t; };
const banco = createServer((req, res) => {
  const u = new URL(req.url!, 'http://x'); const nome = u.pathname.split('/').pop()!;
  if (fora) { req.socket.destroy(); return; }
  let corpo = ''; req.on('data', (d) => { corpo += d; }).on('end', () => {
    const t = tab(nome);
    if (req.method === 'POST') {
      const chave = (u.searchParams.get('on_conflict') ?? 'id').split(',');
      for (const l of JSON.parse(corpo) as Linha[]) t.set(chave.map((c) => String(l[c])).join('|'), { ...l, atualizado_em: new Date().toISOString().replace('Z', '+00:00') });
      return void res.writeHead(201).end();
    }
    if (req.method === 'DELETE') {
      const alvo = u.searchParams.get('id') ?? ''; const ids = alvo.replace(/^in\.\(|\)$/g, '').split(',').map((s) => s.replace(/"/g, ''));
      for (const [k, l] of [...t]) if (ids.includes(String(l.id))) t.delete(k);
      return void res.writeHead(204).end();
    }
    const off = Number(u.searchParams.get('offset') ?? 0), lim = Number(u.searchParams.get('limit') ?? 1000);
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify([...t.values()].slice(off, off + lim)));
  });
});
await new Promise<void>((r) => banco.listen(0, r));
const portaBanco = (banco.address() as { port: number }).port;

const filhos: ChildProcess[] = [];
const subir = async (porta: number) => {
  const p = spawn('npx', ['tsx', 'src/server.ts'], { shell: true, stdio: 'ignore', env: {
    ...process.env, VERCEL: '1', PORT: String(porta), SUPABASE_URL: `http://127.0.0.1:${portaBanco}`, SUPABASE_SERVICE_ROLE_KEY: 'chave-teste',
    PAINEL_PASSWORD: 'senha-mestra-teste', SUPABASE_ESPERA_MS: '500', CRM_ROTINA: 'false', CLINILINK_API_KEY: '', CRM_CLINILINK_API_KEY: '', INOVSTAR_TOKEN: '', ANTHROPIC_API_KEY: '', CRM_PERSISTIR: 'false',
  } });
  filhos.push(p);
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${porta}/healthz`)).ok) return; } catch { /* ainda subindo */ } await new Promise((r) => setTimeout(r, 500)); }
  throw new Error(`o servidor da porta ${porta} não subiu`);
};
const auth = { Authorization: `Basic ${Buffer.from('mestre:senha-mestra-teste').toString('base64')}` };
const api = (porta: number, metodo: string, caminho: string, corpo?: unknown) =>
  fetch(`http://127.0.0.1:${porta}/painel${caminho}`, { method: metodo, headers: { ...auth, 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
const nomes = async (porta: number) => ((await (await api(porta, 'GET', '/api/usuarios')).json()) as { usuarios: { nome: string }[] }).usuarios.map((u) => u.nome).sort();

let falhas = 0;
const t = async (nome: string, f: () => Promise<void>) => { try { await f(); console.log(`  ok  ${nome}`); } catch (e) { falhas++; console.log(`  FALHOU  ${nome}\n        ${(e as Error).message}`); } };

try {
  await Promise.all([subir(3071), subir(3072)]);
  await t('as duas instâncias começam sem contas', async () => { assert.deepEqual(await nomes(3071), []); assert.deepEqual(await nomes(3072), []); });

  await t('conta criada na instância A já está no banco quando a resposta chega', async () => {
    const r = await api(3071, 'POST', '/api/usuarios', { nome: 'Ana', email: 'ana@clinex.com', perfil: 'atendente', modulos: ['crm'], senha: 'SenhaForte123' });
    assert.equal(r.status, 201, await r.clone().text());
    assert.equal(tab('painel_usuarios').size, 1, 'a conta deveria estar gravada no banco ao receber a resposta');
  });

  await t('a instância B (que subiu antes da conta existir) enxerga a conta de A', async () => {
    assert.deepEqual(await nomes(3072), ['Ana']);
  });

  await t('várias contas seguidas, cada uma numa instância diferente, ficam todas', async () => {
    for (const [i, n] of ['Bia', 'Carla', 'Dani', 'Eva'].entries()) {
      const r = await api(i % 2 ? 3071 : 3072, 'POST', '/api/usuarios', { nome: n, email: `${n.toLowerCase()}@clinex.com`, perfil: 'atendente', modulos: ['crm'], senha: 'SenhaForte123' });
      assert.equal(r.status, 201, await r.clone().text());
    }
    await new Promise((r) => setTimeout(r, 3300)); // passa o intervalo de releitura
    const esperado = ['Ana', 'Bia', 'Carla', 'Dani', 'Eva'];
    assert.deepEqual(await nomes(3071), esperado); assert.deepEqual(await nomes(3072), esperado); assert.equal(tab('painel_usuarios').size, 5);
  });

  await t('remover numa instância some nas duas, sem apagar as outras contas', async () => {
    const lista = (await (await api(3071, 'GET', '/api/usuarios')).json()) as { usuarios: { id: string; nome: string }[] };
    const bia = lista.usuarios.find((u) => u.nome === 'Bia')!;
    assert.equal((await api(3071, 'DELETE', `/api/usuarios/${bia.id}`)).status, 200);
    await new Promise((r) => setTimeout(r, 3300));
    const esperado = ['Ana', 'Carla', 'Dani', 'Eva'];
    assert.deepEqual(await nomes(3071), esperado); assert.deepEqual(await nomes(3072), esperado); assert.equal(tab('painel_usuarios').size, 4);
  });

  await t('quem acabou de ser criada consegue entrar pela outra instância', async () => {
    const r = await fetch('http://127.0.0.1:3072/painel/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: 'eva@clinex.com', senha: 'SenhaForte123' }) });
    assert.equal(r.status, 200, await r.text());
  });
  await t('banco fora do ar na subida: escrita é recusada (não finge que salvou) e a instância volta sozinha quando o banco volta', async () => {
    const antes = tab('painel_usuarios').size;
    fora = true; await subir(3073);
    const r = await api(3073, 'POST', '/api/usuarios', { nome: 'Fátima', email: 'fatima@clinex.com', perfil: 'atendente', modulos: ['crm'], senha: 'SenhaForte123' });
    assert.equal(r.status, 503, 'com o banco fora a escrita deveria ser recusada: ' + (await r.clone().text()));
    assert.equal(((await r.json()) as { erro: string }).erro, 'banco');
    fora = false;
    await new Promise((x) => setTimeout(x, 10_500)); // intervalo mínimo entre tentativas
    const r2 = await api(3073, 'POST', '/api/usuarios', { nome: 'Fátima', email: 'fatima@clinex.com', perfil: 'atendente', modulos: ['crm'], senha: 'SenhaForte123' });
    assert.equal(r2.status, 201, 'depois que o banco volta a escrita deveria funcionar: ' + (await r2.clone().text()));
    assert.equal(tab('painel_usuarios').size, antes + 1, 'a conta está no banco');
    assert.ok((await nomes(3071)).includes('Fátima'), 'as outras instâncias enxergam');
  });
} finally {
  for (const f of filhos) f.kill();
  banco.close();
}
console.log(falhas ? `${falhas} falha(s)` : 'Todos os testes passaram.');
// os processos do tsx podem sobreviver ao kill do shell no Windows: encerra por porta
if (process.platform === 'win32') spawn('powershell', ['-NoProfile', '-Command', 'Get-NetTCPConnection -LocalPort 3071,3072,3073 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }'], { stdio: 'ignore' });
process.exit(falhas ? 1 : 0);
