/**
 * Orçamentos do Clinilink viram leads do CRM (src/crm/leadsOrcamento.ts). Sem rede e sem banco.
 * Rodar: npx tsx scripts/teste-leads-orcamento.ts
 */
import assert from 'node:assert/strict';
import { regrasPadrao } from '../src/crm/automacoes.js';
import { idDoLead, leadsDosOrcamentos } from '../src/crm/leadsOrcamento.js';
import { funilDestino, ingerir } from '../src/crm/pipeline/ingestao.js';
import { funisPadrao } from '../src/crm/pipeline/regras.js';
import type { CardSnap } from '../src/crm/pipeline/tipos.js';
import type { Estado } from '../src/crm/banco.js';

const AGORA = new Date('2026-11-09T12:00:00Z');
const novo = (): Estado => ({ versao: 1, atendentes: [], leads: [], usuarios: [], automacoes: regrasPadrao(AGORA), logAuto: [], pipelines: { funis: funisPadrao(AGORA), atribuicoes: [], extras: {}, followups: [], contatos: [], rotina: {} } });
const uuid = (i: number) => `1a2b3c4d-0000-4000-8000-${String(i).padStart(12, '0')}`;
const snap = (i: number, extra: Partial<CardSnap> = {}): CardSnap => ({ id: uuid(i), codigo: `C${i}`, paciente: `Paciente ${i}`, contato: '(91) 98888-7766', valor: 100 * i, itens: ['Ultrassom'], criadoEm: '2026-11-06T08:30:00-03:00', unidade: 'CLINEX GUAMÁ', status: 'aberto', origem: 'Indicação', ...extra });

let ok = 0;
const teste = (nome: string, fn: () => void) => { try { fn(); ok++; console.log(`  ok  ${nome}`); } catch (e) { console.error(`FALHOU  ${nome}\n        ${(e as Error).message}`); process.exitCode = 1; } };

teste('cada orçamento aberto vira um lead com os dados do paciente', () => {
  const e = novo();
  ingerir(e.pipelines, funilDestino(e.pipelines, 'orcamento', AGORA), [snap(1), snap(2, { itens: [], subtitulo: 'Hemograma' })], AGORA);
  assert.deepEqual(leadsDosOrcamentos(e, AGORA), { criados: 2, ignorados: 0 });
  const l = e.leads.find((x) => x.cardId === uuid(1))!;
  assert.equal(l.id, idDoLead(uuid(1)));
  assert.equal(l.nome, 'Paciente 1'); assert.equal(l.telefone, '91988887766'); assert.equal(l.valor, 100);
  assert.equal(l.exame, 'Ultrassom'); assert.equal(l.origem, 'Indicação'); assert.equal(l.unidade, 'CLINEX GUAMÁ');
  assert.equal(l.d0, '2026-11-06', 'D0 é o dia do orçamento (Brasília)'); assert.equal(l.status, 'aberto'); assert.equal(l.fonte, 'clinilink'); assert.equal(l.demo, undefined);
  assert.ok(l.obs?.includes('Orçamento C1'));
  assert.equal(e.leads.find((x) => x.cardId === uuid(2))!.exame, 'Hemograma', 'sem itens usa o subtítulo');
});

teste('rodar de novo não duplica nem mexe no lead que já está sendo trabalhado', () => {
  const e = novo();
  ingerir(e.pipelines, funilDestino(e.pipelines, 'orcamento', AGORA), [snap(1)], AGORA);
  leadsDosOrcamentos(e, AGORA);
  e.leads[0].atendente = 'Carla'; e.leads[0].status = 'negociacao';
  assert.deepEqual(leadsDosOrcamentos(e, new Date('2026-11-10T12:00:00Z')), { criados: 0, ignorados: 0 });
  assert.equal(e.leads.length, 1); assert.equal(e.leads[0].atendente, 'Carla'); assert.equal(e.leads[0].status, 'negociacao');
});

teste('card novo na sincronização seguinte vira lead; o resto fica igual', () => {
  const e = novo(); const f = funilDestino(e.pipelines, 'orcamento', AGORA);
  ingerir(e.pipelines, f, [snap(1)], AGORA); leadsDosOrcamentos(e, AGORA);
  ingerir(e.pipelines, f, [snap(1), snap(2)], AGORA);
  assert.equal(leadsDosOrcamentos(e, AGORA).criados, 1); assert.equal(e.leads.length, 2);
});

teste('sem telefone válido não cria lead (continua só no funil); no-show e cards removidos não viram lead', () => {
  const e = novo();
  ingerir(e.pipelines, funilDestino(e.pipelines, 'orcamento', AGORA), [snap(1, { contato: '' }), snap(2, { contato: '123' }), snap(3)], AGORA);
  ingerir(e.pipelines, funilDestino(e.pipelines, 'agendamento', AGORA), [snap(4)], AGORA);
  e.pipelines.atribuicoes.find((a) => a.cardId === uuid(3))!.caseStatus = 'removido';
  assert.deepEqual(leadsDosOrcamentos(e, AGORA), { criados: 0, ignorados: 2 });
  assert.equal(e.leads.length, 0);
});

teste('dois processos criando o mesmo lead geram o mesmo id (gravam a mesma linha no banco)', () => {
  const a = novo(), b = novo();
  for (const e of [a, b]) { ingerir(e.pipelines, funilDestino(e.pipelines, 'orcamento', AGORA), [snap(7)], AGORA); leadsDosOrcamentos(e, AGORA); }
  assert.equal(a.leads[0].id, b.leads[0].id);
});

console.log(`${ok} testes passaram.`);
