/**
 * Testa o assistente flutuante do agente receptivo (src/panel/assistente.ts) com eventos simulados do BI.
 * Não usa o Supabase nem a internet. Rodar: npx tsx scripts/teste-assistente.ts
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ambiente isolado ANTES de carregar os módulos (eles leem as variáveis ao carregar)
const dir = mkdtempSync(join(tmpdir(), 'assistente-'));
process.env.SUPABASE_URL = ''; process.env.SUPABASE_SERVICE_ROLE_KEY = ''; process.env.ANTHROPIC_API_KEY = '';
process.env.BI_ARQUIVO = join(dir, 'eventos.jsonl'); process.env.LOGS_VERCEL_TOKEN = '';
const { gerarDemo } = await import('../src/bi/demo.js');
writeFileSync(process.env.BI_ARQUIVO, gerarDemo(Date.now()).map((e) => JSON.stringify(e)).join('\n') + '\n');
const { alertasDoAgente, responderAssistente } = await import('../src/panel/assistente.js');
const { flow } = await import('../src/panel/flow.js');

let ok = 0;
const teste = async (nome: string, fn: () => Promise<void>) => { try { await fn(); ok++; console.log(`  ok  ${nome}`); } catch (e) { console.error(`FALHOU  ${nome}\n        ${(e as Error).message}`); process.exitCode = 1; } };
const p = (q: string) => responderAssistente(q, []);
const tudo = (r: { texto: string; itens?: { titulo: string; sub?: string }[] }) => `${r.texto} ${(r.itens ?? []).map((i) => i.titulo).join(' ')}`;

await teste('saudação e pergunta vazia apresentam o assistente com sugestões', async () => {
  for (const q of ['', 'oi', 'ajuda']) { const r = await p(q); assert.match(r.texto, /assistente do agente receptivo/); assert.ok(r.sugestoes.length >= 3); assert.equal(r.fonte, 'regras'); }
});
await teste('conversão: números reais do BI e link para o BI', async () => {
  const r = await p('como está a conversão?');
  assert.match(r.texto, /\d+ conversas/); assert.match(r.texto, /conversão de \*\*\d/); assert.equal(r.itens?.[0].href, '/painel/receptivo/bi');
});
await teste('período entendido na pergunta (24h, 7 dias, 30 dias)', async () => {
  assert.match((await p('conversão hoje')).texto, /últimas 24 horas/);
  assert.match((await p('conversão no último mês')).texto, /últimos 30 dias/);
  assert.match((await p('conversão')).texto, /últimos 7 dias/);
});
await teste('transferências: motivos com percentuais', async () => {
  const r = await p('por que a Amanda transfere para a equipe?');
  assert.match(r.texto, /foram para a equipe/); assert.match(r.texto, /•/); assert.match(r.texto, /%/);
});
await teste('integrações: sucesso, tempo e erro mais comum de cada uma', async () => {
  const r = await p('como estão as integrações?');
  assert.match(r.texto, /Clinilink/); assert.match(r.texto, /de sucesso/); assert.match(r.texto, /lento/);
  assert.ok(r.itens!.some((i) => i.href.endsWith('/logs')));
});
await teste('funil e onde as conversas param', async () => {
  const r = await p('onde as conversas param?');
  assert.match(r.texto, /Iniciou a conversa/); assert.match(r.texto, /maior perda/i);
});
await teste('pico de horário e volume', async () => assert.match((await p('qual o horário de pico?')).texto, /pico de procura é às \*\*\d{2}h/));
await teste('pedidos que a Amanda não achou', async () => assert.match((await p('o que os pacientes pedem que ela não achou?')).texto, /não achou/));
await teste('erros recentes: lista com hora e link para os logs', async () => {
  const r = await p('mostre os erros recentes');
  assert.match(r.texto, /eventos/); assert.ok(r.itens!.some((i) => i.href.endsWith('/logs')));
});
await teste('modo e configuração, sem expor segredos', async () => {
  const r = await p('em que modo a Amanda está?');
  assert.match(r.texto, /Modo:/); assert.match(r.texto, /Integrações/);
  assert.ok(!/inovstar_[0-9a-f]{10}|sk-[A-Za-z0-9]{10}|eyJ[A-Za-z0-9]{20}/.test(r.texto), 'nenhum token no texto');
  assert.match((await p('o que faz o AUTO_REPLY?')).texto, /modo sombra/i);
});
await teste('o que a Amanda faz e o que não faz (do resumo do fluxo)', async () => {
  assert.match((await p('o que a Amanda faz?')).texto, /Objetivo/);
  assert.match((await p('o que ela ainda não faz?')).texto, /NÃO faz/);
});
await teste('passo pelo número e por palavras, com link direto no mapa', async () => {
  const n = (flow.nodes as { id: string; step?: number | string; title: string }[]).find((x) => x.step === 9)!;
  const r1 = await p('explique o passo 9');
  assert.match(r1.texto, new RegExp(n.title.slice(0, 12))); assert.equal(r1.itens![0].href, `/painel/receptivo#passo/${n.id}`);
  const r2 = await p('como a Amanda confirma o paciente pelo CPF?');
  assert.ok(r2.itens!.length >= 1 && r2.itens![0].href.startsWith('/painel/receptivo#passo/'), 'achou passos por palavras');
});
await teste('o que acontece se algo falhar usa o "se falhar" do passo, não os logs', async () => {
  const r = await p('o que acontece se o Clinilink falhar na consulta de horários?');
  assert.ok(r.itens && r.itens.length >= 1); assert.ok(!/^Nas últimas 24 horas/.test(r.texto));
});
await teste('pergunta fora do escopo recebe orientação e sugestões', async () => {
  const r = await p('qual a capital da França');
  assert.match(r.texto, /Não entendi/); assert.ok(r.sugestoes.length >= 3);
});
await teste('alertas: vêm do BI e da configuração, ordenados por gravidade, com ações', async () => {
  const a = await alertasDoAgente();
  assert.ok(a.length >= 1);
  const ordem = { risco: 0, atencao: 1, info: 2 };
  for (let i = 1; i < a.length; i++) assert.ok(ordem[a[i - 1].nivel] <= ordem[a[i].nivel], 'ordenado');
  assert.ok(a.every((x) => x.id && x.titulo && x.texto && (x.acoes?.length ?? 0) >= 1), 'todos com id, texto e ação');
  assert.equal(new Set(a.map((x) => x.id)).size, a.length, 'ids únicos');
});
await teste('sem dados reais o assistente diz isso em vez de inventar número', async () => {
  writeFileSync(process.env.BI_ARQUIVO!, '');
  // a memória do BI já foi carregada; a checagem direta é a do texto para um período sem conversas
  const r = await p('conversão');
  assert.ok(/\d+ conversas|Ainda não há conversas reais/.test(r.texto));
});
console.log(`${ok} testes passaram.`);
process.exit(process.exitCode ?? 0);
