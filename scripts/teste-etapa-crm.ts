/**
 * Testa a análise por etapa do fluxo (src/crm/etapa.ts). Rodar: npx tsx scripts/teste-etapa-crm.ts
 */
import assert from 'node:assert/strict';
import { analisarEtapa } from '../src/crm/etapa.js';
import { ITENS } from '../src/crm/modelo.js';
import { gerarExemplos } from '../src/crm/exemplos.js';
import { aplicar, criarLead, vistaDoLead, type Lead } from '../src/crm/motor.js';

let ok = 0;
const teste = (nome: string, fn: () => void) => { try { fn(); ok++; console.log(`  ok  ${nome}`); } catch (e) { console.error(`FALHOU  ${nome}\n        ${(e as Error).message}`); process.exitCode = 1; } };
const em = (dia: string, h = '10:00') => new Date(`${dia}T${h}:00-03:00`);
const AGORA = em('2026-03-20', '09:30');
const vistasDe = (ls: Lead[]) => new Map(ls.map((l) => [l.id, vistaDoLead(l, AGORA)]));
const ex = gerarExemplos(AGORA);

teste('todas as etapas do fluxo geram análise sem erro', () => {
  for (const it of ITENS) {
    for (const d of [14, 30, 90] as const) {
      const r = analisarEtapa(ex, AGORA, it.id, d, vistasDe(ex));
      assert.ok(r, `sem análise para ${it.id}`);
      assert.ok(r.historia.length >= 1 && r.insights.length >= 1, `sem narrativa em ${it.id}`);
      assert.equal(r.fluxo.serie.entradas.length, r.rotulos.length);
      assert.ok(!JSON.stringify(r).includes('NaN') && !JSON.stringify(r).includes('undefined'), `NaN/undefined em ${it.id}`);
    }
  }
});
teste('etapa desconhecida devolve null', () => assert.equal(analisarEtapa(ex, AGORA, 'xyz', 30, vistasDe(ex)), null));
teste('"aqui agora" bate com o item de cada lead', () => {
  const v = vistasDe(ex);
  for (const id of ['aberto', 'negociacao', 'agendado', 'descarte', 'ativo']) {
    const r = analisarEtapa(ex, AGORA, id, 30, v)!;
    assert.equal(r.agora.n, ex.filter((l) => v.get(l.id)!.item === id).length, id);
  }
});
teste('faixas de idade somam o total de leads aqui', () => {
  const r = analisarEtapa(ex, AGORA, 'negociacao', 30, vistasDe(ex))!;
  assert.equal(r.agora.faixas.reduce((s, f) => s + f.n, 0), r.agora.n);
  assert.equal(r.agora.porUnidade.reduce((s, f) => s + f.n, 0), r.agora.n);
});
teste('cenário controlado: entradas, saídas, destino e contato', () => {
  const a = criarLead({ nome: 'Ana', telefone: '91900000001', valor: 300, d0: '2026-03-15', origem: 'Instagram' }, em('2026-03-15', '09:00'));
  aplicar(a, { tipo: 'contato', canal: 'whatsapp', naoFoiRecepcao: true, passo: 'primeiro' }, em('2026-03-16'));
  aplicar(a, { tipo: 'resposta' }, em('2026-03-16', '11:00'));
  const b = criarLead({ nome: 'Bia', telefone: '91900000002', valor: 800, d0: '2026-03-15', origem: 'Google' }, em('2026-03-15', '09:00'));
  aplicar(b, { tipo: 'contato', canal: 'ligacao', naoFoiRecepcao: true, passo: 'primeiro' }, em('2026-03-16'));
  const ls = [a, b]; const v = vistasDe(ls);
  const r = analisarEtapa(ls, AGORA, 'aberto', 30, v)!;
  assert.equal(r.fluxo.entradas, 2);
  assert.equal(r.fluxo.saidas, 1);
  assert.equal(r.fluxo.destinos[0].status, 'negociacao');
  const p = analisarEtapa(ls, AGORA, 'primeiro', 30, v)!;
  assert.equal(p.contatos.total, 2); assert.equal(p.contatos.ligacao, 1); assert.equal(p.contatos.responderam, 1);
  const e = analisarEtapa(ls, AGORA, 'lead', 30, v)!;
  assert.equal(e.fluxo.entradas, 2); assert.equal(e.origem.length, 2);
});
teste('sem leads: não quebra e diz que não há movimento', () => {
  const r = analisarEtapa([], AGORA, 'negociacao', 30, new Map())!;
  assert.equal(r.agora.n, 0);
  assert.ok(r.historia[0].texto.includes('nenhum lead'));
});
console.log(`${ok} testes passaram.`);
