/**
 * Card (Pipelines) e lead (Hoje/Leads/Funil) do mesmo orçamento andam juntos. Sem rede e sem banco.
 * Rodar: npx tsx scripts/teste-sincronia-card-lead.ts
 */
import assert from 'node:assert/strict';
import { regrasPadrao } from '../src/crm/automacoes.js';
import { leadsDosOrcamentos } from '../src/crm/leadsOrcamento.js';
import { aplicar, tarefasDoDia } from '../src/crm/motor.js';
import { funilDestino, ingerir } from '../src/crm/pipeline/ingestao.js';
import { funisPadrao, moverCard } from '../src/crm/pipeline/regras.js';
import { alinharCardsELeads, atribuirResponsaveis, ehPessoa, primeiroResponsavel } from '../src/crm/sincroniaCardLead.js';
import type { CardSnap } from '../src/crm/pipeline/tipos.js';
import type { Estado } from '../src/crm/banco.js';

const T0 = new Date('2026-11-09T12:00:00Z'), T1 = new Date('2026-11-09T20:00:00Z'), T2 = new Date('2026-11-10T12:00:00Z');
const uuid = (i: number) => `1a2b3c4d-0000-4000-8000-${String(i).padStart(12, '0')}`;
const snap = (i: number): CardSnap => ({ id: uuid(i), codigo: `C${i}`, paciente: `Paciente ${i}`, contato: '(91) 98888-7766', valor: 100 * i, itens: ['Ultrassom'], criadoEm: '2026-11-06T08:00:00Z', origem: 'Indicação', unidade: 'CLINEX GUAMÁ' } as CardSnap);
function cenario(n = 1) {
  const e: Estado = { versao: 1, atendentes: [], leads: [], usuarios: [], automacoes: regrasPadrao(T0), logAuto: [], pipelines: { funis: funisPadrao(T0), atribuicoes: [], extras: {}, followups: [], contatos: [], rotina: {} } } as unknown as Estado;
  const f = funilDestino(e.pipelines, 'orcamento', T0);
  ingerir(e.pipelines, f, Array.from({ length: n }, (_, i) => snap(i + 1)), T0);
  leadsDosOrcamentos(e, T0);
  const etapa = (rotulo: RegExp) => f.stages.find((s) => rotulo.test(s.label.toLowerCase()))!.id;
  return { e, f, card: (i = 1) => e.pipelines.atribuicoes.find((a) => a.cardId === uuid(i))!, lead: (i = 1) => e.leads.find((l) => l.cardId === uuid(i))!, etapa };
}
let ok = 0;
const teste = (nome: string, fn: () => void) => { try { fn(); ok++; console.log(`  ok  ${nome}`); } catch (e) { console.error(`FALHOU  ${nome}\n        ${(e as Error).message}`); process.exitCode = 1; } };

teste('sem ninguém mexer, nada muda', () => {
  const c = cenario();
  assert.deepEqual(alinharCardsELeads(c.e, T1), { leads: 0, cards: 0 });
  assert.equal(c.lead().status, 'aberto'); assert.equal(c.card().stageId, c.f.stages[0].id);
});

teste('card movido para Convertido orgânico: o lead converte e sai das tarefas atrasadas', () => {
  const c = cenario();
  assert.equal(tarefasDoDia(c.e.leads, T1).length, 1);
  moverCard(c.card(), c.f, c.etapa(/organico/), T1, { por: 'Vanuza' });
  assert.deepEqual(alinharCardsELeads(c.e, T1), { leads: 1, cards: 0 });
  assert.equal(c.lead().status, 'convertido_organico');
  assert.equal(tarefasDoDia(c.e.leads, T1).length, 0, 'sem tarefa para quem já converteu');
  assert.deepEqual(alinharCardsELeads(c.e, T1), { leads: 0, cards: 0 }, 'idempotente');
});

teste('card para Convertido ativo, Agendado, Em negociação e Descarte levam o lead junto', () => {
  const c = cenario(4);
  moverCard(c.card(1), c.f, c.etapa(/convertido ativo/), T1); moverCard(c.card(2), c.f, c.etapa(/^agendado/), T1);
  moverCard(c.card(3), c.f, c.etapa(/em negocia/), T1); moverCard(c.card(4), c.f, c.etapa(/^descarte/), T1);
  assert.deepEqual(alinharCardsELeads(c.e, T1), { leads: 4, cards: 0 });
  assert.deepEqual([1, 2, 3, 4].map((i) => c.lead(i).status), ['convertido_ativo', 'agendado', 'negociacao', 'descarte']);
  assert.equal(c.lead(4).descarte?.motivo, 'Outro');
});

teste('etapa de trabalho (Primeiro contato) não muda o status do lead', () => {
  const c = cenario();
  moverCard(c.card(), c.f, c.etapa(/primeiro contato/), T1);
  assert.deepEqual(alinharCardsELeads(c.e, T1), { leads: 0, cards: 0 }); assert.equal(c.lead().status, 'aberto');
});

teste('lead marcado depois (agendou/descartou/recepção): o card vai para a etapa correspondente', () => {
  const c = cenario(3);
  aplicar(c.lead(1), { tipo: 'agendou', data: '2026-11-12' }, T1);
  aplicar(c.lead(2), { tipo: 'recepcao' }, T1);
  aplicar(c.lead(3), { tipo: 'descartar', motivo: 'Preço' }, T1);
  assert.deepEqual(alinharCardsELeads(c.e, T1), { leads: 0, cards: 3 });
  assert.equal(c.card(1).stageId, c.etapa(/^agendado/)); assert.equal(c.card(2).stageId, c.etapa(/organico/)); assert.equal(c.card(3).stageId, c.etapa(/^descarte/));
  assert.equal(c.card(1).historico.at(-1)?.por, 'CRM (lead)');
  assert.deepEqual(alinharCardsELeads(c.e, T2), { leads: 0, cards: 0 }, 'e não fica brigando');
});

teste('vale o que mudou por último: card movido, depois o lead reabre; e o contrário', () => {
  const c = cenario();
  moverCard(c.card(), c.f, c.etapa(/organico/), T1); alinharCardsELeads(c.e, T1);
  assert.equal(c.lead().status, 'convertido_organico');
  // depois, na outra ponta: alguém move o card para Em negociação (mais novo que a conversão do lead)
  moverCard(c.card(), c.f, c.etapa(/em negocia/), T2); alinharCardsELeads(c.e, T2);
  assert.equal(c.lead().status, 'negociacao'); assert.equal(c.card().stageId, c.etapa(/em negocia/));
});

teste('card "Sem retorno" vira lead descartado com esse motivo, sem o card pular de coluna', () => {
  const c = cenario();
  moverCard(c.card(), c.f, c.etapa(/^sem retorno/), T1); alinharCardsELeads(c.e, T1);
  assert.equal(c.lead().status, 'descarte'); assert.equal(c.lead().descarte?.motivo, 'Sem retorno');
  assert.deepEqual(alinharCardsELeads(c.e, T2), { leads: 0, cards: 0 });
  assert.equal(c.card().stageId, c.etapa(/^sem retorno/), 'continua em Sem retorno');
});

teste('lead sem card, ou card removido, ficam como estão', () => {
  const c = cenario();
  c.lead().cardId = undefined; assert.deepEqual(alinharCardsELeads(c.e, T1), { leads: 0, cards: 0 });
  const d = cenario(); d.card().caseStatus = 'removido'; moverCard; assert.deepEqual(alinharCardsELeads(d.e, T1), { leads: 0, cards: 0 });
});


console.log('Responsável = a primeira pessoa que movimentou o lead');
teste('card movido por uma pessoa: ela vira a responsável do lead (e o evento do lead diz quem moveu)', () => {
  const c = cenario();
  assert.equal(c.lead().atendente, undefined);
  assert.equal(atribuirResponsaveis(c.e), 0, 'ninguém mexeu ainda: continua sem responsável');
  moverCard(c.card(), c.f, c.etapa(/organico/), T1, { por: 'Vanuza' });
  alinharCardsELeads(c.e, T1);
  assert.equal(atribuirResponsaveis(c.e), 1); assert.equal(c.lead().atendente, 'Vanuza');
  assert.equal(c.lead().eventos.find((x) => x.auto && x.tipo === 'recepcao')?.atendente, 'Vanuza');
  assert.equal(atribuirResponsaveis(c.e), 0, 'idempotente');
});
teste('vale a PRIMEIRA pessoa: quem mexer depois não troca o responsável', () => {
  const c = cenario();
  moverCard(c.card(), c.f, c.etapa(/negocia/), T1, { por: 'Ana' });
  assert.equal(atribuirResponsaveis(c.e), 1); assert.equal(c.lead().atendente, 'Ana');
  moverCard(c.card(), c.f, c.etapa(/organico/), T2, { por: 'Bruno' });
  alinharCardsELeads(c.e, T2); atribuirResponsaveis(c.e);
  assert.equal(c.lead().atendente, 'Ana');
});
teste('entre uma ação no lead e um movimento do card, vale o que veio antes', () => {
  const c = cenario();
  aplicar(c.lead(), { tipo: 'nota', texto: 'só uma anotação', atendente: 'Nota' }, T0);
  moverCard(c.card(), c.f, c.etapa(/negocia/), T2, { por: 'Depois' });
  aplicar(c.lead(), { tipo: 'contato', canal: 'whatsapp', naoFoiRecepcao: true, atendente: 'Carla' }, T1);
  assert.equal(primeiroResponsavel(c.lead(), c.card()), 'Carla', 'a anotação não conta como movimento; o contato de Carla veio antes do card');
});
teste('quem já tem responsável não é trocado; sistema, IA, WhatsApp e acesso mestre nunca viram responsável', () => {
  const c = cenario(2);
  c.lead(1).atendente = 'Definida'; moverCard(c.card(1), c.f, c.etapa(/negocia/), T1, { por: 'Outra' });
  moverCard(c.card(2), c.f, c.etapa(/negocia/), T1, { por: 'CRM (lead)' });
  aplicar(c.lead(2), { tipo: 'contato', canal: 'whatsapp', naoFoiRecepcao: true, atendente: 'IA', auto: true }, T1);
  aplicar(c.lead(2), { tipo: 'resposta', atendente: 'WhatsApp' }, T1);
  assert.equal(atribuirResponsaveis(c.e), 0);
  assert.equal(c.lead(1).atendente, 'Definida'); assert.equal(c.lead(2).atendente, undefined);
  assert.equal(ehPessoa('Acesso mestre'), false); assert.equal(ehPessoa('Vanuza Gomes'), true);
});
teste('o movimento feito pelo próprio lead (contato registrado na tela) também faz a pessoa virar responsável', () => {
  const c = cenario();
  aplicar(c.lead(), { tipo: 'contato', canal: 'whatsapp', naoFoiRecepcao: true, atendente: 'Rafaela' }, T1);
  assert.equal(atribuirResponsaveis(c.e), 1); assert.equal(c.lead().atendente, 'Rafaela');
});

console.log(process.exitCode ? '\nHouve falhas.' : `\nTodos os ${ok} testes passaram.`);
