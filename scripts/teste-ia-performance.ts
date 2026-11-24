/**
 * Testa a IA Performance (src/crm/ia-performance.ts): atribuição de respostas, agendamentos e conversões à IA de disparo.
 * Rodar: npx tsx scripts/teste-ia-performance.ts
 */
import assert from 'node:assert/strict';
import { criarLead, type EventoLead, type Lead } from '../src/crm/motor.js';
import { analisarIAPerformance } from '../src/crm/ia-performance.js';

let ok = 0;
const teste = (nome: string, fn: () => void) => { try { fn(); ok++; console.log(`  ok  ${nome}`); } catch (e) { console.error(`FALHOU  ${nome}\n        ${(e as Error).message}`); process.exitCode = 1; } };
const em = (dia: string, h = '10:00') => new Date(`${dia}T${h}:00-03:00`);
const AGORA = em('2026-11-20', '12:00');
let seq = 0;
const ev = (l: Lead, quando: Date, e: Partial<EventoLead> & { tipo: EventoLead['tipo'] }) => { l.eventos.push({ id: `e${++seq}`, quando: quando.toISOString(), texto: '', ...e } as EventoLead); };
const lead = (nome: string, valor = 500, unidade = 'GUAMÁ') => criarLead({ nome, telefone: '91981628017', valor, unidade, d0: '2026-11-10' }, em('2026-11-10'));
const ia = (l: Lead, quando: Date, passo = 'primeiro', msg = 1) => ev(l, quando, { tipo: 'contato', canal: 'whatsapp', auto: true, passo, msg, texto: 'WhatsApp · modelo x' });
const J = { de: '2026-11-14', ate: '2026-11-20', dias: 7 };

teste('IA Performance: contato da IA, resposta em 72 h, agendamento e conversão atribuídos ao passo certo', () => {
  const a = lead('Ana', 400); ia(a, em('2026-11-16', '09:00')); ev(a, em('2026-11-16', '09:30'), { tipo: 'resposta', intencao: 'agendar' }); ev(a, em('2026-11-16', '10:00'), { tipo: 'agendamento', texto: 'Agendou' }); ev(a, em('2026-11-18', '15:00'), { tipo: 'comparecimento', texto: 'Compareceu e pagou: Convertido ativo.' });
  const b = lead('Bia', 800); ia(b, em('2026-11-16', '09:00')); // não respondeu
  const c = lead('Caio', 300, 'ICOARACI'); ia(c, em('2026-11-17', '11:30'), 'tentativa', 2); ev(c, em('2026-11-20', '14:00'), { tipo: 'resposta', intencao: 'valor_horario' }); // 3 dias depois: fora das 72 h
  const humano = lead('Dora', 600); ia(humano, em('2026-11-15', '09:00')); ev(humano, em('2026-11-15', '10:00'), { tipo: 'contato', canal: 'ligacao', auto: false, texto: 'Ligou' }); ev(humano, em('2026-11-15', '11:00'), { tipo: 'agendamento', texto: 'Agendou' });
  const demo = lead('Demo'); demo.demo = true; ia(demo, em('2026-11-16'));
  const r = analisarIAPerformance([a, b, c, humano, demo], undefined, AGORA, J);
  assert.equal(r.atual.enviadas, 4, 'lead demo não conta'); assert.equal(r.atual.leads, 4);
  assert.equal(r.atual.respostas, 1, 'só a da Ana: a do Caio veio depois de 72 h'); assert.equal(r.atual.taxaResposta, 25);
  assert.equal(r.atual.agendamentos, 2); assert.equal(r.atual.agSozinha, 1, 'a Dora teve ligação da equipe no meio');
  assert.equal(r.atual.conversoes, 1); assert.equal(r.atual.receita, 400);
  const p1 = r.porPasso.find((x) => x.passo === 'primeiro')!; assert.equal(p1.enviadas, 3); assert.equal(p1.agendamentos, 2); assert.equal(p1.conversoes, 1); assert.equal(p1.receita, 400);
  assert.equal(r.porPasso.find((x) => x.passo === 'tentativa')!.enviadas, 1);
  assert.equal(r.funil.alcancados, 4); assert.equal(r.funil.responderam, 1); assert.equal(r.funil.agendaram, 2); assert.equal(r.funil.converteram, 1);
  assert.deepEqual(r.intencoes.map((x) => x.id), ['agendar']);
  assert.equal(r.serie.enviadas.length, 7); assert.equal(r.serie.enviadas.reduce((x, y) => x + y, 0), 4);
  assert.ok(r.insights.length > 0); assert.equal(r.temDados, true);
});
teste('IA Performance: resultado depois de mais de 14 dias do contato não é da IA; período anterior serve de comparação', () => {
  const a = lead('Eva'); ia(a, em('2026-10-20', '09:00')); ev(a, em('2026-11-16', '09:00'), { tipo: 'agendamento', texto: 'Agendou' });
  const b = lead('Fabio'); ia(b, em('2026-11-09', '09:00')); ev(b, em('2026-11-09', '09:20'), { tipo: 'resposta' });
  const r = analisarIAPerformance([a, b], undefined, AGORA, J);
  assert.equal(r.atual.agendamentos, 0, 'Eva agendou 27 dias depois do contato'); assert.equal(r.atual.enviadas, 0);
  assert.equal(r.anterior.enviadas, 1, 'Fabio está no período anterior (07 a 13/11)'); assert.equal(r.anterior.taxaResposta, 100);
  assert.equal(r.desdeOComeco.enviadas.reduce((x, y) => x + y, 0), 2); assert.equal(r.primeiroEnvio, '2026-10-20');
});
teste('IA Performance: quem pediu algo à IA e a equipe ainda não atendeu aparece na lista; atendido some', () => {
  const a = lead('Gil'); ia(a, em('2026-11-19', '09:00')); ev(a, em('2026-11-19', '09:10'), { tipo: 'resposta', intencao: 'valor_horario', resp: 'qual o valor?' });
  const b = lead('Hana'); ia(b, em('2026-11-19', '09:00')); ev(b, em('2026-11-19', '09:10'), { tipo: 'resposta', intencao: 'agendar' }); ev(b, em('2026-11-19', '10:00'), { tipo: 'contato', canal: 'whatsapp', auto: false, texto: 'Atendi' });
  const c = lead('Ivo'); ia(c, em('2026-11-19', '09:00')); ev(c, em('2026-11-19', '09:10'), { tipo: 'resposta', intencao: 'sem_interesse' });
  const r = analisarIAPerformance([a, b, c], undefined, AGORA, J);
  assert.deepEqual(r.esperando.map((x) => x.nome), ['Gil']); assert.equal(r.totalEsperando, 1); assert.ok(r.esperando[0].horas >= 24);
});
teste('IA Performance: sem nenhum envio da IA devolve tudo zerado, sem quebrar', () => {
  const r = analisarIAPerformance([lead('Jo')], undefined, AGORA, J);
  assert.equal(r.temDados, false); assert.equal(r.atual.enviadas, 0); assert.equal(r.atual.taxaResposta, null); assert.deepEqual(r.porPasso, []); assert.equal(r.primeiroEnvio, null);
});
console.log(`${ok} testes passaram.`);
