/**
 * Testa a evolução no tempo (src/crm/tempo.ts). Rodar: npx tsx scripts/teste-tempo-crm.ts
 */
import assert from 'node:assert/strict';
import { analisarTempo, statusNoDia, transicoes } from '../src/crm/tempo.js';
import { gerarExemplos } from '../src/crm/exemplos.js';
import { aplicar, criarLead, hojeDe, somaDias, tarefasDoDia, vistaDoLead, type Lead } from '../src/crm/motor.js';

let ok = 0;
const teste = (nome: string, fn: () => void) => { try { fn(); ok++; console.log(`  ok  ${nome}`); } catch (e) { console.error(`FALHOU  ${nome}\n        ${(e as Error).message}`); process.exitCode = 1; } };
const em = (dia: string, h = '10:00') => new Date(`${dia}T${h}:00-03:00`);
const AGORA = em('2026-03-20', '09:30');
const HOJE = hojeDe(AGORA);
const dia = (n: number) => somaDias(HOJE, -n);
const tempo = (leads: Lead[], d: 14 | 30 | 90) => analisarTempo(leads, AGORA, d, tarefasDoDia(leads, AGORA), new Map(leads.map((l) => [l.id, vistaDoLead(l, AGORA)])));
const novo = (nome: string, d0: string, valor = 300) => criarLead({ nome, telefone: '91900000000', valor, d0, exame: 'ultrassom', origem: 'Instagram', atendente: 'Amanda' }, em(d0, '09:00'));
const contato = (l: Lead, d: string, passo: string, h = '10:00') => aplicar(l, { tipo: 'contato', canal: 'whatsapp', naoFoiRecepcao: true, passo }, em(d, h));
const ATIVOS = ['aberto', 'sem_retorno', 'negociacao', 'agendado'];

// A: contatou, respondeu, agendou, compareceu. B: contatou e foi descartado por preço. C: lead de hoje.
const A = novo('Ana', dia(6)); contato(A, dia(5), 'primeiro'); aplicar(A, { tipo: 'resposta' }, em(dia(5), '11:30')); aplicar(A, { tipo: 'agendou', data: dia(3) }, em(dia(4))); aplicar(A, { tipo: 'compareceu' }, em(dia(3), '18:00'));
const B = novo('Bia', dia(10), 800); contato(B, dia(9), 'primeiro'); aplicar(B, { tipo: 'descartar', motivo: 'Preço' }, em(dia(2), '17:00'));
const C = novo('Caio', HOJE, 200);

console.log('Reconstrução do estado de cada lead em cada dia');
teste('linha do tempo de um lead que converteu', () => {
  const tr = transicoes(A);
  assert.equal(statusNoDia(tr, dia(7)), null);
  assert.equal(statusNoDia(tr, dia(6)), 'aberto');
  assert.equal(statusNoDia(tr, dia(5)), 'negociacao');
  assert.equal(statusNoDia(tr, dia(4)), 'agendado');
  assert.equal(statusNoDia(tr, dia(3)), 'convertido_ativo');
  assert.equal(statusNoDia(tr, HOJE), 'convertido_ativo');
});
teste('pipeline diário: soma das etapas = leads ativos naquele dia', () => {
  const t = tempo([A, B, C], 14);
  const p = t.series.pipeline;
  const fim = (i: number) => somaDias(HOJE, -(13 - i));
  for (let i = 0; i < 14; i++) {
    const esperado = [A, B, C].filter((l) => { const s = statusNoDia(transicoes(l), fim(i)); return !!s && ATIVOS.includes(s); }).length;
    assert.equal(p.aberto[i] + p.sem_retorno[i] + p.negociacao[i] + p.agendado[i], esperado, `dia ${fim(i)}`);
  }
  assert.equal(p.aberto[13] + p.negociacao[13] + p.sem_retorno[13] + p.agendado[13], 1); // só o Caio, que entrou hoje
  assert.equal(p.valor[13], 200);
  assert.equal(p.valor[13 - 5], 300 + 800); // há 5 dias: Ana negociando (300) e Bia em aberto (800)
});
teste('séries: novos, convertidos e descartados nos dias certos', () => {
  const s = tempo([A, B, C], 14).series;
  const i = (d: number) => 13 - d;
  assert.equal(s.novos[i(6)], 1); assert.equal(s.novos[i(10)], 1); assert.equal(s.novos[13], 1);
  assert.equal(s.convertidos[i(3)], 1); assert.equal(s.valorConv[i(3)], 300);
  assert.equal(s.descartados[i(2)], 1); assert.equal(s.valorPerdido[i(2)], 800);
  assert.equal(s.contatos[i(5)], 1); assert.equal(s.respostas[i(5)], 1);
});
teste('período de 90 dias usa 13 pontos semanais', () => {
  const t = tempo([A, B, C], 90);
  assert.equal(t.rotulos.length, 13); assert.equal(t.semanal, true);
  assert.equal(t.series.novos.reduce((x, y) => x + y, 0), 3);
});
teste('período atual x anterior', () => {
  const t = tempo([A, B, C], 14);
  assert.equal(t.atual.novos, 3); assert.equal(t.atual.convertidos, 1); assert.equal(t.atual.descartados, 1);
  assert.equal(t.atual.taxaConversao, 50); assert.equal(t.atual.valorConvertido, 300); assert.equal(t.atual.valorPerdido, 800);
  assert.equal(t.anterior.novos, 0);
});

console.log('Dados de exemplo');
const demo = gerarExemplos(AGORA);
teste('estado reconstruído de hoje == estado real, para TODOS os leads de exemplo', () => {
  for (const l of demo) assert.equal(statusNoDia(transicoes(l), HOJE), l.status, `${l.nome}: ${l.status}`);
});
teste('pipeline do último ponto == leads ativos agora, em todos os períodos', () => {
  const ativos = demo.filter((l) => ATIVOS.includes(l.status));
  for (const d of [14, 30, 90] as const) {
    const t = tempo(demo, d), p = t.series.pipeline, u = t.rotulos.length - 1;
    assert.equal(p.aberto[u] + p.sem_retorno[u] + p.negociacao[u] + p.agendado[u], ativos.length, `${d} dias`);
    assert.equal(p.valor[u], ativos.reduce((s, l) => s + l.valor, 0));
  }
});
teste('taxas entre 0 e 100 (ou nulas) e um ponto por dia/semana', () => {
  for (const d of [14, 30, 90] as const) {
    const t = tempo(demo, d);
    for (const arr of [t.series.taxas.resposta, t.series.taxas.agendamento, t.series.taxas.conversao]) { assert.equal(arr.length, t.rotulos.length); for (const v of arr) assert.ok(v === null || (v >= 0 && v <= 100), String(v)); }
    for (const c of t.coortes) for (const v of [c.contatados, c.responderam, c.agendaram, c.compareceram]) assert.ok(v === null || (v >= 0 && v <= 100));
  }
});
teste('novos leads do período == leads com D0 no período', () => {
  const t = tempo(demo, 30);
  const esperado = demo.filter((l) => l.d0 >= somaDias(HOJE, -29)).length;
  assert.equal(t.series.novos.reduce((s, v) => s + v, 0), esperado);
  assert.equal(t.atual.novos, esperado);
});
teste('mapa de calor tem respostas e todas as caixas de horário são válidas', () => {
  const t = tempo(demo, 90);
  assert.equal(t.heat.length, 7); assert.ok(t.heat.every((l) => l.length === 24));
  assert.ok(t.heat.flat().reduce((s, v) => s + v, 0) > 0);
});
teste('destaques e funil coerentes', () => {
  const t = tempo(demo, 30);
  assert.ok(t.destaques.length > 0);
  for (let i = 1; i < t.funil.length; i++) assert.ok(t.funil[i].n <= t.funil[i - 1].n);
});

console.log(`\n${ok} testes passaram${process.exitCode ? ', COM FALHAS' : ''}.`);
