/**
 * Testa a persistência no Supabase (src/lib/supabase.ts, src/crm/persistencia.ts, src/bi/armazem.ts) contra um
 * servidor FALSO que imita o PostgREST (upsert por chave, filtros eq/in/gt/gte/lt, ordem, paginação, datas em
 * "+00:00" e chaves de jsonb reordenadas, como o Postgres faz). Não toca em nenhum banco real.
 * Rodar: npx tsx scripts/teste-supabase-crm.ts
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

// ---------------------------------------------------------------- PostgREST falso
type Linha = Record<string, unknown>;
const tabelas = new Map<string, Map<string, Linha>>();
const pedidos: { metodo: string; tabela: string; linhas: number }[] = [];
let falhar = 0;
let derrubar = 0; // as próximas N conexões caem sem resposta (rede instável da Vercel)
let seq = 0;
const reordenar = (v: unknown): unknown => (Array.isArray(v) ? v.map(reordenar) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as Linha).sort(([a], [b]) => a.length - b.length || a.localeCompare(b)).map(([k, x]) => [k, reordenar(x)])) : v);
const comoPostgres = (l: Linha): Linha => Object.fromEntries(Object.entries(l).map(([k, v]) => [k, typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(v) ? v.replace('Z', '+00:00') : typeof v === 'object' ? reordenar(v) : v]));
const tab = (n: string) => { let t = tabelas.get(n); if (!t) { t = new Map(); tabelas.set(n, t); } return t; };
const filtra = (rows: Linha[], q: URLSearchParams) => {
  for (const [k, v] of q) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(k)) continue;
    const [op, ...r] = v.split('.'); const val = r.join('.');
    rows = rows.filter((l) => {
      const x = String(l[k]);
      if (op === 'eq') return x === val;
      if (op === 'in') return val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')).includes(x);
      if (op === 'gt') return Date.parse(x) > Date.parse(val);
      if (op === 'gte') return Date.parse(x) >= Date.parse(val);
      if (op === 'lt') return Date.parse(x) < Date.parse(val);
      return true;
    });
  }
  return rows;
};
const servidor = createServer((req, res) => {
  const u = new URL(req.url!, 'http://x'); const nome = u.pathname.split('/').pop()!;
  let corpo = ''; req.on('data', (d) => { corpo += d; }).on('end', () => {
    const json = corpo ? (JSON.parse(corpo) as Linha[]) : [];
    pedidos.push({ metodo: req.method!, tabela: nome, linhas: json.length });
    if (derrubar > 0) { derrubar--; req.socket.destroy(); return; }
    if (req.headers.apikey !== 'chave-teste') { res.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ message: 'Invalid API key' })); return; }
    if (falhar > 0 && req.method !== 'GET') { falhar--; res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ message: 'falha simulada' })); return; }
    const t = tab(nome);
    if (req.method === 'POST') {
      const conflito = u.searchParams.get('on_conflict');
      for (const l of json) {
        const k = conflito ? conflito.split(',').map((c) => String(l[c])).join('|') : `#${++seq}`;
        t.set(k, comoPostgres(conflito ? { ...t.get(k), ...l } : { id: seq, ...l }));
      }
      res.writeHead(201).end(); return;
    }
    if (req.method === 'DELETE') { const ks = [...t].filter(([, l]) => filtra([l], u.searchParams).length).map(([k]) => k); ks.forEach((k) => t.delete(k)); res.writeHead(204).end(); return; }
    let rows = filtra([...t.values()], u.searchParams);
    const ord = u.searchParams.get('order');
    if (ord) { const [c, d] = ord.split('.'); rows = rows.sort((a, b) => (String(a[c]) < String(b[c]) ? -1 : String(a[c]) > String(b[c]) ? 1 : 0) * (d === 'desc' ? -1 : 1)); }
    const off = Number(u.searchParams.get('offset') ?? 0), lim = Number(u.searchParams.get('limit') ?? 1000);
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(rows.slice(off, off + lim)));
  });
});
await new Promise<void>((r) => servidor.listen(0, r));
const porta = (servidor.address() as { port: number }).port;
process.env.SUPABASE_URL = `http://127.0.0.1:${porta}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-teste';

// só agora os módulos (eles leem o ambiente ao carregar)
const { atualizarLeads, carregarDoBanco, gravarMudancas, COLECOES } = await import('../src/crm/persistencia.js');
const { funisPadrao, moverCard } = await import('../src/crm/pipeline/regras.js');
const { ingerir, funilDestino } = await import('../src/crm/pipeline/ingestao.js');
const { regrasPadrao } = await import('../src/crm/automacoes.js');
const { criarLead } = await import('../src/crm/motor.js');
const { sbFaltantes, sbGravar, sbInserir, sbLer, SupabaseError } = await import('../src/lib/supabase.js');
type Estado = import('../src/crm/banco.js').Estado;

let ok = 0;
const teste = async (nome: string, fn: () => Promise<void> | void) => { try { await fn(); ok++; console.log(`  ok  ${nome}`); } catch (e) { console.error(`FALHOU  ${nome}\n        ${(e as Error).message}`); process.exitCode = 1; } };
const AGORA = new Date('2026-11-02T12:00:00Z');
const novo = (): Estado => ({ versao: 1, atendentes: [], leads: [], automacoes: regrasPadrao(AGORA), logAuto: [], pipelines: { funis: funisPadrao(AGORA), atribuicoes: [], extras: {}, followups: [], contatos: [], rotina: {} } });
const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const snap = (i: number) => ({ id: uuid(i), codigo: `C${i}`, paciente: `Paciente ${i}`, valor: 100 * i, itens: ['Ultrassom'], criadoEm: '2026-11-01T12:00:00.000Z', unidade: 'CLINEX GUAMÁ', status: 'aberto' });
const reqs = (m?: string) => pedidos.filter((p) => !m || p.metodo === m);

const est = novo();
const f = funilDestino(est.pipelines, 'orcamento', AGORA);
ingerir(est.pipelines, f, Array.from({ length: 450 }, (_, i) => snap(i + 1)), AGORA);
est.leads.push(criarLead({ nome: 'Maria Lead', telefone: '91999990000', valor: 300 }, AGORA));
est.atendentes = ['Amanda', 'Bruno'];
est.pipelines.extras[uuid(1)] = { responsavel: 'Amanda', valorNegociado: 0, valorNegociadoPor: 'Ana', valorNegociadoEm: '2026-11-02T12:00:00.000Z' };
est.pipelines.followups.push({ id: uuid(901), cardId: uuid(1), data: '2026-11-05', descricao: 'Ligar' });
est.pipelines.contatos.push({ id: uuid(902), cardId: uuid(1), data: '2026-11-02T12:00:00.000Z', tipo: 'Mandou WhatsApp' });

await teste('antes de ler o banco, nada é gravado (senão nascem funis duplicados)', async () => { pedidos.length = 0; await gravarMudancas(est); assert.equal(reqs().length, 0); assert.equal(tab('pipelines').size, 0); });
await teste('banco vazio é reconhecido (nada carregado)', async () => { assert.equal(await carregarDoBanco(novo()), 0); });
await teste('primeira gravação envia tudo, em lotes, e cria as linhas certas', async () => {
  pedidos.length = 0;
  await gravarMudancas(est);
  assert.equal(tab('pipelines').size, 3); assert.equal(tab('pipeline_card_assignments').size, 450); assert.equal(tab('crm_leads').size, 1);
  assert.equal(tab('lead_extras').size, 1); assert.equal(tab('lead_followups').size, 1); assert.equal(tab('lead_contact_history').size, 1); assert.equal(tab('crm_automacoes').size, 2); assert.equal(tab('crm_config').size, 2);
  assert.ok(reqs('POST').filter((p) => p.tabela === 'pipeline_card_assignments').length >= 3, '450 cards em lotes de 200');
  const linha = [...tab('pipeline_card_assignments').values()][0];
  assert.ok('pipeline_id' in linha && 'card_id' in linha && 'ultimo_snapshot' in linha && 'case_status' in linha, 'colunas do documento');
  assert.equal(typeof (tab('pipelines').values().next().value as Linha).stages, 'object');
});
await teste('sem mudança nenhuma, não grava nada', async () => { pedidos.length = 0; await gravarMudancas(est); assert.equal(reqs().length, 0); });
await teste('mudar 1 card grava só 1 linha', async () => {
  pedidos.length = 0;
  moverCard(est.pipelines.atribuicoes[0], f, f.stages[5].id, AGORA, { por: 'Ana' });
  await gravarMudancas(est);
  assert.deepEqual(reqs().map((p) => `${p.metodo} ${p.tabela} ${p.linhas}`), ['POST pipeline_card_assignments 1']);
  assert.equal(((tab('pipeline_card_assignments').get(`${f.id}|${uuid(1)}`)!.historico as unknown[]) ?? []).length, 2);
});
await teste('carregar do banco devolve o mesmo sistema (datas e jsonb normalizados)', async () => {
  const b = novo(); const n = await carregarDoBanco(b);
  assert.ok(n > 450);
  assert.equal(b.pipelines.atribuicoes.length, 450); assert.equal(b.pipelines.funis.length, 3);
  const a = (e: Estado) => [...e.pipelines.atribuicoes].sort((x, y) => x.cardId.localeCompare(y.cardId));
  assert.deepEqual(JSON.parse(JSON.stringify(a(b))), JSON.parse(JSON.stringify(a(est))), 'cards idênticos');
  assert.deepEqual(JSON.parse(JSON.stringify(b.pipelines.funis.map((x) => ({ ...x, criadoEm: 0 })).sort((x, y) => x.id.localeCompare(y.id)))), JSON.parse(JSON.stringify(est.pipelines.funis.map((x) => ({ ...x, criadoEm: 0 })).sort((x, y) => x.id.localeCompare(y.id)))), 'funis idênticos');
  assert.deepEqual(b.pipelines.extras, est.pipelines.extras); assert.deepEqual(b.pipelines.followups, est.pipelines.followups); assert.deepEqual(b.pipelines.contatos, est.pipelines.contatos);
  assert.deepEqual(b.atendentes, ['Amanda', 'Bruno']); assert.equal(b.leads.length, 1); assert.equal(b.leads[0].nome, 'Maria Lead');
  pedidos.length = 0; await gravarMudancas(b);
  assert.equal(reqs('POST').length + reqs('DELETE').length, 0, 'depois de carregar, a próxima gravação não reenvia nada');
});
await teste('apagar follow-up e lead remove a linha; remover da lista não deixa lixo', async () => {
  pedidos.length = 0;
  est.pipelines.followups = []; est.leads = [];
  await gravarMudancas(est);
  assert.equal(tab('lead_followups').size, 0); assert.equal(tab('crm_leads').size, 0);
  assert.ok(reqs('DELETE').length >= 2);
});
await teste('falha do banco não perde dados: erro registrado e a próxima gravação refaz', async () => {
  pedidos.length = 0; falhar = 1;
  est.pipelines.extras[uuid(2)] = { responsavel: 'Bruno' };
  await gravarMudancas(est);
  assert.equal(tab('lead_extras').size, 1, 'ainda não chegou');
  await gravarMudancas(est);
  assert.equal(tab('lead_extras').size, 2, 'chegou na tentativa seguinte');
});
await teste('configuração (atendentes e rotina) vai e volta', async () => {
  est.pipelines.rotina = { ultimaExecucao: '2026-11-02T06:00:00.000Z', ultimoDia: '2026-11-02', resultado: { orcamentos: { criados: 5 } } };
  est.atendentes = ['Amanda', 'Bruno', 'Carla'];
  await gravarMudancas(est);
  const b = novo(); await carregarDoBanco(b);
  assert.deepEqual(b.atendentes, ['Amanda', 'Bruno', 'Carla']); assert.equal(b.pipelines.rotina.ultimoDia, '2026-11-02');
});
await teste('chave errada dá erro claro; tabelas faltantes são listadas', async () => {
  assert.deepEqual(await sbFaltantes(COLECOES.map((c) => c.tabela)), []);
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'errada';
  await assert.rejects(() => sbFaltantes(['pipelines']), (e: Error) => e instanceof SupabaseError && /Invalid API key/.test(e.message));
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-teste';
});

// ---------------------------------------------------------------- eventos do Agente Receptivo (BI)
const { evt } = await import('../src/lib/log.js');
const { eventosDaMemoria, estadoArmazem } = await import('../src/bi/armazem.js');
const log = console.log; console.log = () => {}; // o evt() imprime a linha JSON; silencia só durante o teste
await teste('eventos do agente vão para a tabela agente_eventos e voltam pelo BI', async () => {
  evt('webhook', { atendimento: 'A1', nomePaciente: 'Maria Souza' });
  evt('resposta', { atendimento: 'A1', texto: 'Olá!' });
  await new Promise((r) => setTimeout(r, 300));
  console.log = log;
  assert.equal(tab('agente_eventos').size, 2);
  const linha = [...tab('agente_eventos').values()][0];
  assert.ok(linha.t && linha.evt === 'webhook' && (linha.dados as Linha).app === 'amanda', 'colunas t, evt e dados');
  assert.ok(!JSON.stringify(linha).includes('Souza'), 'dado pessoal continua mascarado no banco');
  await new Promise((r) => setTimeout(r, 5200)); // cache do BI atualiza a cada 5 s
  const evs = await eventosDaMemoria(Date.now() - 60_000);
  assert.equal(evs.filter((e) => e.evt === 'webhook' || e.evt === 'resposta').length, 2, 'BI lê do banco sem duplicar');
  assert.equal(estadoArmazem().destino, 'supabase'); assert.equal(estadoArmazem().pendentes, 0);
});
await teste('conexão que cai: leitura e gravação com upsert repetem; inserir sem chave não repete (não duplica)', async () => {
  const aviso = console.warn; console.warn = () => undefined;
  try {
    derrubar = 2; await sbGravar('t_retry', [{ id: 'a', v: 1 }], 'id');
    assert.equal(tab('t_retry').size, 1, 'o upsert chegou depois de 2 quedas');
    derrubar = 2; assert.equal((await sbLer('t_retry')).length, 1, 'a leitura chegou depois de 2 quedas');
    derrubar = 1; await assert.rejects(() => sbInserir('t_log', [{ x: 1 }]), (e: Error) => e instanceof SupabaseError && e.codigo === 'rede');
    assert.equal(tab('t_log').size, 0, 'nada foi inserido, então nada duplica');
    derrubar = 3; await assert.rejects(() => sbGravar('t_retry', [{ id: 'b', v: 2 }], 'id'), (e: Error) => e instanceof SupabaseError, 'depois de 3 quedas desiste com erro claro');
  } finally { console.warn = aviso; derrubar = 0; }
});
await teste('outra instância da Vercel mexeu no lead: a releitura traz a mudança, no mesmo objeto, sem perder o que está pendente aqui', async () => {
  const c = novo(); await carregarDoBanco(c);
  c.usuarios = []; c.leads.push(criarLead({ nome: 'Maria Remota', telefone: '91977770000', valor: 50 }, AGORA)); await gravarMudancas(c);
  const maria = c.leads[0]; const linhaMaria = tab('crm_leads').get(maria.id)!;
  // a "outra instância" grava o envio de WhatsApp direto no banco
  const dados = JSON.parse(JSON.stringify(linhaMaria.dados)) as typeof maria;
  dados.eventos.push({ id: 'ev-outra', quando: '2026-11-02T12:05:00.000Z', tipo: 'contato', texto: 'WhatsApp · modelo primeiro_contato' } as never);
  tab('crm_leads').set(maria.id, { ...linhaMaria, dados });
  assert.equal(maria.eventos.some((e) => e.id === 'ev-outra'), false, 'sem releitura a memória segue velha (o defeito)');
  // mudança local ainda não gravada: tem que ir para o banco antes da releitura, e não ser pisada
  c.leads.push(criarLead({ nome: 'Lead local', telefone: '91988880000', valor: 10 }, AGORA));
  await atualizarLeads(c, 0);
  assert.equal(c.leads.length, 2, 'o lead local foi gravado e continua');
  const depois = c.leads.find((l) => l.id === maria.id)!;
  assert.equal(depois, maria, 'o objeto é o mesmo (requisição em andamento não fica com cópia solta)');
  assert.ok(depois.eventos.some((e) => e.id === 'ev-outra'), 'o envio da outra instância apareceu');
  assert.ok(tab('crm_leads').size === 2, 'o lead local chegou ao banco antes de reler');
  pedidos.length = 0; await gravarMudancas(c);
  assert.equal(reqs('POST').length + reqs('DELETE').length, 0, 'depois da releitura não há nada a regravar');
});
console.log = log;
console.log(`${ok} testes passaram.`);
servidor.close(); process.exit(process.exitCode ?? 0);
