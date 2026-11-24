/**
 * Testa as regras dos funis do documento "pipelines-crm-tecnico" (src/crm/pipeline). Rodar: npx tsx scripts/teste-funis-crm.ts
 */
import assert from 'node:assert/strict';
import { cardsSemServicos, funilDestino, ingerir, reporServicos, janelaDoPedido, janelaPadrao, snapDeAgendamento, snapDeOrcamento, snapsDeAgendamentos } from '../src/crm/pipeline/ingestao.js';
import { painelExecutivo, relatorio } from '../src/crm/pipeline/metricas.js';
import { aplicarAutomacoes, atrasado, classeDaEtapa, diaBRT, estrelas, funisPadrao, moverCard, recortar, validarAutomacoes, validarConfig, valorExibido } from '../src/crm/pipeline/regras.js';
import { FunilError, type CardSnap, type EstadoFunis } from '../src/crm/pipeline/tipos.js';
import { contatosDoLead, mensagemDoLead } from '../src/crm/pipeline/api.js';
import { estado as estadoCrm } from '../src/crm/banco.js';
import { aplicar, criarLead, vistaDoLead, type Acao } from '../src/crm/motor.js';
import { alinharCardsELeads } from '../src/crm/sincroniaCardLead.js';
import { alinharCardsAoFluxo, conferir, itemDaEtapa } from '../src/crm/conferencia.js';
import { leadsDosNoShow } from '../src/crm/leadsNoShow.js';
import { avaliarLead } from '../src/crm/ia-disparo.js';

let ok = 0;
const teste = (nome: string, fn: () => void) => { try { fn(); ok++; console.log(`  ok  ${nome}`); } catch (e) { console.error(`FALHOU  ${nome}\n        ${(e as Error).message}`); process.exitCode = 1; } };
const em = (dia: string, h = '10:00') => new Date(`${dia}T${h}:00-03:00`);
const AGORA = em('2026-11-02', '09:00');
const novoEstado = (): EstadoFunis => ({ funis: funisPadrao(AGORA), atribuicoes: [], extras: {}, followups: [], contatos: [], rotina: {} });
const snap = (id: string, criadoEm = '2026-11-01T12:00:00Z', valor = 500, extra: Partial<CardSnap> = {}): CardSnap => ({ id, paciente: `Paciente ${id}`, valor, itens: ['Ultrassom'], criadoEm, status: 'aberto', unidade: 'CLINEX GUAMÁ', ...extra });
const erroDe = (fn: () => void) => { try { fn(); } catch (e) { return e instanceof FunilError ? e.codigo : `INESPERADO ${(e as Error).message}`; } return null; };
const por = (est: EstadoFunis, nome: string) => est.funis.find((f) => f.nome === nome)!;
const etapa = (est: EstadoFunis, f: string, label: string) => por(est, f).stages.find((s) => s.label === label)!.id;

teste('funis padrão batem com o documento (seção 2)', () => {
  const est = novoEstado();
  assert.deepEqual(por(est, 'Orçamentos em aberto').stages.map((s) => s.label), ['EM ABERTO', 'PRIMEIRO CONTATO', 'NOVA TENTATIVA', 'DESCONTO', 'RETORNO PERSONALIZADO', 'EM NEGOCIAÇÃO', 'AGENDADO', 'CONVERTIDO ATIVO', 'CONVERTIDO - ORGANICO', 'Descarte', 'Sem retorno']);
  assert.deepEqual(por(est, 'No-show').stages.map((s) => s.label), ['No-show', 'Retomada 1', 'Agendado', 'Perdido', 'Sem Retorno', 'Recuperado']);
  assert.deepEqual(por(est, 'Leads WhatsApp').stages.map((s) => s.label), ['Leads', 'Interesse', 'Follow-up 1', 'Convertido', 'Descarte']);
  assert.equal(por(est, 'Orçamentos em aberto').dimensao, 'orcamento'); assert.deepEqual(por(est, 'No-show').statusPermitidos, ['faltou']);
  assert.ok(por(est, 'Leads WhatsApp').oculto);
});
teste('ganho e perda são reconhecidos pelo rótulo da coluna', () => {
  assert.equal(classeDaEtapa('CONVERTIDO ATIVO'), 'ganho_ativo'); assert.equal(classeDaEtapa('CONVERTIDO - ORGANICO'), 'ganho_organico'); assert.equal(classeDaEtapa('Convertido'), 'ganho_ativo');
  for (const p of ['Descarte', 'Sem retorno', 'Sem Retorno', 'Perdido']) assert.equal(classeDaEtapa(p), 'perda', p);
  assert.equal(classeDaEtapa('Recuperado'), 'recuperado'); assert.equal(classeDaEtapa('AGENDADO'), 'agendado'); assert.equal(classeDaEtapa('EM NEGOCIAÇÃO'), 'aberto');
});
teste('ingestão: cria no topo com histórico inicial e é idempotente', () => {
  const est = novoEstado(); const f = funilDestino(est, 'orcamento', AGORA);
  const r1 = ingerir(est, f, [snap('a'), snap('b')], AGORA);
  assert.deepEqual([r1.criados, r1.ignorados], [2, 0]);
  const a = est.atribuicoes[0]; assert.equal(a.stageId, f.stages[0].id); assert.equal(a.historico.length, 1); assert.equal(a.caseStatus, 'aberto');
  const r2 = ingerir(est, f, [snap('a'), snap('b'), snap('c')], AGORA);
  assert.deepEqual([r2.criados, r2.ignorados], [1, 2]); assert.equal(est.atribuicoes.length, 3);
});
teste('ingestão: card movido nunca é movido de volta, reaberto nem alterado; só a etiqueta de status muda', () => {
  const est = novoEstado(); const f = funilDestino(est, 'orcamento', AGORA);
  ingerir(est, f, [snap('a', undefined, 500)], AGORA);
  const a = est.atribuicoes[0]; moverCard(a, f, etapa(est, f.nome, 'PRIMEIRO CONTATO'), AGORA, { por: 'Ana' });
  ingerir(est, f, [snap('a', undefined, 9999, { status: 'aprovado', paciente: 'Outro Nome' })], AGORA);
  assert.equal(a.stageId, etapa(est, f.nome, 'PRIMEIRO CONTATO'), 'não voltou ao topo'); assert.equal(a.ultimoSnapshot.valor, 500, 'valor congelado');
  assert.equal(a.ultimoSnapshot.paciente, 'Paciente a', 'paciente congelado'); assert.equal(a.ultimoSnapshot.status, 'aprovado', 'status atualiza');
  a.caseStatus = 'removido'; ingerir(est, f, [snap('a')], AGORA); assert.equal(a.caseStatus, 'removido', 'removido não reabre'); assert.equal(est.atribuicoes.length, 1);
});
teste('card no topo acompanha o dado vivo', () => {
  const est = novoEstado(); const f = funilDestino(est, 'orcamento', AGORA);
  ingerir(est, f, [snap('a', undefined, 500)], AGORA); const r = ingerir(est, f, [snap('a', undefined, 700)], AGORA);
  assert.equal(est.atribuicoes[0].ultimoSnapshot.valor, 700); assert.equal(r.atualizados, 1); assert.equal(est.atribuicoes[0].originSnapshot.valor, 500, 'origem preservada');
});
teste('janela: padrão é anteontem + ontem, nunca hoje; manual aceita dia ou de/ate até 60 dias', () => {
  assert.deepEqual(janelaPadrao(AGORA), { de: '2026-10-31', ate: '2026-11-01' });
  assert.deepEqual(janelaDoPedido(AGORA, { dia: '2026-10-10' }), { de: '2026-10-10', ate: '2026-10-10' });
  assert.deepEqual(janelaDoPedido(AGORA, { de: '2026-09-03', ate: '2026-11-01' }), { de: '2026-09-03', ate: '2026-11-01' });
  assert.equal(erroDe(() => janelaDoPedido(AGORA, { de: '2026-08-01', ate: '2026-11-01' })), 'janela');
  assert.equal(erroDe(() => janelaDoPedido(AGORA, { dia: 'ontem' })), 'janela');
  assert.equal(erroDe(() => janelaDoPedido(AGORA, { de: '2026-11-02', ate: '2026-11-01' })), 'janela');
});
teste('mapeamento do Clinilink para o card omite CPF e usa valor líquido', () => {
  const s = snapDeOrcamento({ orcamentoId: 'o1', codigo: 'C1', status: 'aberto', criadoEm: '2026-11-01T10:00:00Z', unidade: { id: 'u', nome: 'CLINEX GUAMÁ' }, paciente: { id: 'p', nome: 'Maria', telefone: '91999990000', cpf: '12345678900' }, valorBruto: 100, valorLiquido: 80, itens: [{ nome: 'RX' }, { nome: 'US' }, { nome: 'TC' }] });
  assert.equal(s.valor, 80); assert.equal(s.contato, '91999990000'); assert.ok(!JSON.stringify(s).includes('12345678900')); assert.equal(s.subtitulo, 'RX · US +1');
  const a = snapDeAgendamento({ agendamentoId: 'a1', status: 'faltou', dataHora: '2026-11-01T08:00:00Z', paciente: { nome: 'João' }, procedimentos: [{ nome: 'Consulta' }], profissional: { nome: 'Dr. X' }, valorTotal: 200 });
  assert.equal(a.valor, 200); assert.equal(a.subtitulo, 'Consulta — Dr. X');
});
teste('mover: não volta ao topo, grava histórico com autor e entrada na coluna', () => {
  const est = novoEstado(); const f = funilDestino(est, 'orcamento', AGORA); ingerir(est, f, [snap('a')], AGORA);
  const a = est.atribuicoes[0]; const t1 = em('2026-11-02', '11:00');
  assert.equal(moverCard(a, f, etapa(est, f.nome, 'EM NEGOCIAÇÃO'), t1, { por: 'Bruno' }), true);
  assert.deepEqual([a.historico.length, a.historico[1].por, a.historico[1].manual, a.enteredAt], [2, 'Bruno', true, t1.toISOString()]);
  assert.equal(erroDe(() => moverCard(a, f, f.stages[0].id, t1)), 'topo');
  assert.equal(moverCard(a, f, etapa(est, f.nome, 'EM NEGOCIAÇÃO'), t1), false, 'mesma coluna = nada');
  assert.equal(erroDe(() => moverCard(a, f, 'inexistente', t1)), 'etapa');
});
teste('automações: apos_horas e horários só movem cards abertos do topo, com manual:false', () => {
  const est = novoEstado(); const f = funilDestino(est, 'orcamento', AGORA);
  const [t, pc] = [f.stages[0].id, etapa(est, f.nome, 'PRIMEIRO CONTATO')];
  f.automacoes = validarAutomacoes([{ tipo: 'apos_horas', deStageId: t, paraStageId: pc, horas: 24 }], f.stages);
  ingerir(est, f, [snap('velho'), snap('novo')], em('2026-10-30', '08:00'));
  est.atribuicoes[1].enteredAt = em('2026-11-02', '08:00').toISOString();
  assert.equal(aplicarAutomacoes(f, est.atribuicoes, AGORA), 1);
  assert.equal(est.atribuicoes[0].stageId, pc); assert.equal(est.atribuicoes[0].manual, false); assert.equal(est.atribuicoes[0].historico[1].manual, false); assert.equal(est.atribuicoes[1].stageId, t);
  est.atribuicoes[0].caseStatus = 'removido'; est.atribuicoes[1].enteredAt = '2026-10-01T00:00:00Z'; est.atribuicoes[1].caseStatus = 'removido'; assert.equal(aplicarAutomacoes(f, est.atribuicoes, AGORA), 0, 'removido não move');
});
teste('automações: horário diário e semanal respeitam a última ocorrência', () => {
  const est = novoEstado(); const f = funilDestino(est, 'orcamento', AGORA); const [t, pc] = [f.stages[0].id, etapa(est, f.nome, 'PRIMEIRO CONTATO')];
  ingerir(est, f, [snap('a')], em('2026-11-02', '07:00'));
  f.automacoes = validarAutomacoes([{ tipo: 'horario_diario', deStageId: t, paraStageId: pc, horario: '08:00' }], f.stages);
  assert.equal(aplicarAutomacoes(f, est.atribuicoes, em('2026-11-02', '07:30')), 0, 'ainda não deu o horário (e entrou antes de 08:00 de ontem não conta)');
  assert.equal(aplicarAutomacoes(f, est.atribuicoes, em('2026-11-02', '08:05')), 1, 'passou das 08:00 depois de entrar');
  const est2 = novoEstado(); const f2 = funilDestino(est2, 'orcamento', AGORA); ingerir(est2, f2, [snap('a')], em('2026-11-02', '07:00'));
  f2.automacoes = validarAutomacoes([{ tipo: 'horario_semanal', deStageId: f2.stages[0].id, paraStageId: etapa(est2, f2.nome, 'PRIMEIRO CONTATO'), horario: '09:00', diaSemana: 1 }], f2.stages); // segunda
  assert.equal(aplicarAutomacoes(f2, est2.atribuicoes, em('2026-11-02', '09:30')), 1, '02/11/2026 é segunda');
  const est3 = novoEstado(); const f3 = funilDestino(est3, 'orcamento', AGORA); ingerir(est3, f3, [snap('a')], em('2026-11-02', '07:00'));
  f3.automacoes = validarAutomacoes([{ tipo: 'horario_semanal', deStageId: f3.stages[0].id, paraStageId: etapa(est3, f3.nome, 'PRIMEIRO CONTATO'), horario: '09:00', diaSemana: 3 }], f3.stages);
  assert.equal(aplicarAutomacoes(f3, est3.atribuicoes, em('2026-11-03', '09:30')), 0, 'terça não é quarta');
  assert.equal(aplicarAutomacoes(f3, est3.atribuicoes, em('2026-11-04', '09:30')), 1, 'quarta dispara');
});
teste('validação das automações e da configuração de colunas', () => {
  const est = novoEstado(); const f = funilDestino(est, 'orcamento', AGORA); const [t, pc] = [f.stages[0].id, f.stages[1].id];
  assert.equal(erroDe(() => validarAutomacoes([{ tipo: 'apos_horas', deStageId: pc, paraStageId: t, horas: 5 }], f.stages)), 'auto', 'só a partir do topo');
  assert.equal(erroDe(() => validarAutomacoes([{ tipo: 'horario_diario', deStageId: t, paraStageId: pc, horario: '25:99' }], f.stages)), 'auto');
  ingerir(est, f, [snap('a')], AGORA); moverCard(est.atribuicoes[0], f, pc, AGORA);
  assert.equal(erroDe(() => validarConfig(f, f.stages.filter((s) => s.id !== pc), est.atribuicoes, {})), 'destino', 'excluir coluna com cards exige destino');
  assert.equal(erroDe(() => validarConfig(f, f.stages.filter((s) => s.id !== pc), est.atribuicoes, { [pc]: f.stages[0].id })), 'destino', 'destino não pode ser o topo');
  const r = validarConfig(f, f.stages.filter((s) => s.id !== pc), est.atribuicoes, { [pc]: f.stages[2].id }); assert.deepEqual(r.mover, [[pc, f.stages[2].id]]);
  assert.equal(erroDe(() => validarConfig(f, [{ ...f.stages[0], label: ' ' }], est.atribuicoes, {})), 'config');
});
teste('recortes V1 e V2 e filtros por criação, agendamento e conversão', () => {
  const est = novoEstado(); const f = funilDestino(est, 'orcamento', AGORA);
  ingerir(est, f, [snap('topoDentro', '2026-11-01T12:00:00Z'), snap('topoFora', '2026-09-01T12:00:00Z'), snap('negFora', '2026-09-01T12:00:00Z'), snap('agFora', '2026-09-01T12:00:00Z')], AGORA);
  const g = (id: string) => est.atribuicoes.find((a) => a.cardId === id)!;
  moverCard(g('negFora'), f, etapa(est, f.nome, 'EM NEGOCIAÇÃO'), AGORA); moverCard(g('agFora'), f, etapa(est, f.nome, 'AGENDADO'), AGORA);
  const p = { de: '2026-10-25', ate: '2026-11-02', por: 'criacao' as const };
  assert.deepEqual(recortar(f, est.atribuicoes, p, 'v1').map((a) => a.cardId).sort(), ['agFora', 'negFora', 'topoDentro'], 'V1: só recorta o topo');
  assert.deepEqual(recortar(f, est.atribuicoes, p, 'v2').map((a) => a.cardId).sort(), ['negFora', 'topoDentro', 'topoFora'], 'V2: recorta todas as colunas, EXCETO Em aberto (o topo) e Em negociação');
  assert.deepEqual(recortar(f, est.atribuicoes, { de: '2026-11-02', ate: '2026-11-02', por: 'agendamento' }, 'v2').map((a) => a.cardId).sort(), ['agFora', 'negFora', 'topoDentro', 'topoFora'], 'agendamento = entrada em Agendado; Em aberto e Em negociação sempre aparecem');
});
teste('valor negociado substitui o valor; estrelas por faixa de valor; cadência estourada', () => {
  const est = novoEstado(); const f = funilDestino(est, 'orcamento', AGORA); ingerir(est, f, [snap('a', undefined, 500)], em('2026-10-28'));
  const a = est.atribuicoes[0];
  assert.equal(valorExibido(a, undefined), 500); assert.equal(valorExibido(a, { valorNegociado: 0 }), 0, 'zero é válido'); assert.equal(valorExibido(a, { valorNegociado: 350 }), 350);
  assert.deepEqual([estrelas(100, f.valorEstrela), estrelas(300, f.valorEstrela), estrelas(900, f.valorEstrela), estrelas(5000, f.valorEstrela)], [1, 2, 3, 5]);
  assert.equal(atrasado(a, f, AGORA), true, 'topo com cadência 1 dia, parado há 5');
  assert.equal(atrasado(a, f, em('2026-10-28', '12:00')), false);
});
teste('relatório: movimentação exclui a entrada, autor vem do histórico e convertido conta só quem está lá hoje', () => {
  const est = novoEstado(); const f = funilDestino(est, 'orcamento', AGORA);
  ingerir(est, f, [snap('a', undefined, 1000), snap('b', undefined, 400), snap('c', undefined, 300)], em('2026-10-30'));
  const g = (id: string) => est.atribuicoes.find((a) => a.cardId === id)!; const E = (l: string) => etapa(est, f.nome, l);
  const d = em('2026-11-01', '10:00');
  moverCard(g('a'), f, E('EM NEGOCIAÇÃO'), d, { por: 'Ana' }); moverCard(g('a'), f, E('AGENDADO'), d, { por: 'Ana' }); moverCard(g('a'), f, E('CONVERTIDO ATIVO'), d, { por: 'Ana' });
  moverCard(g('b'), f, E('EM NEGOCIAÇÃO'), d, { por: 'Bruno' }); moverCard(g('b'), f, E('Descarte'), d, { por: 'Bruno' });
  moverCard(g('c'), f, E('PRIMEIRO CONTATO'), d);
  est.extras['a'] = { valorNegociado: 900 };
  const r = relatorio(est, [f], '2026-10-31', '2026-11-02');
  assert.equal(r.kpis.movimentos, 6, 'entradas iniciais não contam'); assert.equal(r.kpis.convertidos, 1); assert.equal(r.kpis.ativo.valor, 900, 'valor negociado vale');
  const ana = r.produtividade.find((l) => l.usuario === 'Ana')!, bruno = r.produtividade.find((l) => l.usuario === 'Bruno')!;
  assert.deepEqual([ana.emAbertoParaNegociacao, ana.negociacaoParaAgendado, ana.agendadoParaConvertido, ana.convertidosAtivos, ana.valorConvertido, ana.participacao], [1, 1, 1, 1, 900, 100]);
  assert.deepEqual([bruno.semRetornoDescarte, bruno.valorConvertido, bruno.taxaConversao], [1, 0, 0]);
  assert.ok(r.produtividade.some((l) => l.usuario === 'sem autor'), 'sem nome = "sem autor"');
  moverCard(g('a'), f, E('Descarte'), AGORA, { por: 'Ana' });
  assert.equal(relatorio(est, [f], '2026-10-31', '2026-11-02').kpis.convertidos, 0, 'saiu da coluna de convertido: não conta');
});
teste('painel executivo calcula sem quebrar, com e sem dados', () => {
  const est = novoEstado(); const f = funilDestino(est, 'orcamento', AGORA);
  const vazio = painelExecutivo(est, f, 30, AGORA); assert.equal(vazio.kpis.pipeline.n, 0); assert.equal(vazio.kpis.conversao.taxa, null);
  ingerir(est, f, Array.from({ length: 12 }, (_, i) => snap(`c${i}`, `2026-10-${10 + i}T12:00:00Z`, 400 + i * 50)), em('2026-10-25'));
  est.atribuicoes.slice(0, 6).forEach((a, i) => { moverCard(a, f, etapa(est, f.nome, 'EM NEGOCIAÇÃO'), em('2026-10-28'), { por: 'Ana' }); moverCard(a, f, etapa(est, f.nome, i < 4 ? 'CONVERTIDO ATIVO' : 'Descarte'), em('2026-10-30'), { por: 'Ana' }); });
  const p = painelExecutivo(est, f, 30, AGORA);
  assert.equal(p.kpis.receita.ativo.n, 4); assert.equal(p.kpis.pipeline.n, 6);
  assert.ok(p.etapas.find((e) => e.etapa === 'EM NEGOCIAÇÃO')!.peso !== null, 'peso com 6 resolvidos');
  assert.ok(!JSON.stringify(p).includes('NaN') && !JSON.stringify(p).includes('undefined'));
  assert.equal(diaBRT('2026-11-02T01:00:00Z'), '2026-11-01', 'fuso -3');
});

// ---------------------------------------------------------------- combo no No-show: um card só
const ag = (id: string, nome: string, proc: string, valor: number, dataHora = '2026-11-01T08:00:00-03:00', unidade = 'CLINEX GUAMÁ', prof = 'Dra. Ana') => ({ agendamentoId: id, status: 'faltou', dataHora, paciente: { nome }, unidade: { nome: unidade }, procedimentos: [{ nome: proc }], valorTotal: valor, profissional: { nome: prof } }) as never;
teste('combo (vários serviços, mesmo paciente, unidade e horário) vira UM card com tudo somado', () => {
  const r = snapsDeAgendamentos([ag('a3', 'Maria Souza', 'Hemograma', 30), ag('a1', 'MARIA  SOUZA', 'Ultrassom', 90), ag('a2', 'Maria Souza', 'Glicemia', 20)]);
  assert.equal(r.length, 1);
  assert.equal(r[0].id, 'a1', 'o menor id do grupo');
  assert.deepEqual(r[0].agendamentoIds, ['a1', 'a2', 'a3']);
  assert.deepEqual(r[0].itens.sort(), ['Glicemia', 'Hemograma', 'Ultrassom']);
  assert.equal(r[0].valor, 140);
  assert.ok(r[0].subtitulo!.includes('Ultrassom') && r[0].subtitulo!.includes('Dra. Ana'));
});
teste('não junta pacientes, unidades ou horários diferentes', () => {
  const r = snapsDeAgendamentos([ag('a1', 'Maria', 'USG', 10), ag('a2', 'Maria', 'RX', 10, '2026-11-01T09:00:00-03:00'), ag('a3', 'Maria', 'TC', 10, '2026-11-01T08:00:00-03:00', 'CLINEX NAZARÉ'), ag('a4', 'João', 'USG', 10), ag('a5', 'Sem nome', 'X', 5), ag('a6', 'Sem nome', 'Y', 5)]);
  assert.equal(r.length, 6);
});
teste('rotina repetida não duplica: o combo continua um card só', () => {
  const est = novoEstado(), fn = funilDestino(est, 'agendamento', AGORA);
  const lote = [ag('a1', 'Maria', 'Ultrassom', 90), ag('a2', 'Maria', 'Glicemia', 20)];
  const r1 = ingerir(est, fn, snapsDeAgendamentos(lote, est.atribuicoes.map((a) => a.originSnapshot)), AGORA);
  assert.equal(r1.criados, 1);
  const r2 = ingerir(est, fn, snapsDeAgendamentos(lote, est.atribuicoes.map((a) => a.originSnapshot)), AGORA);
  assert.equal(r2.criados, 0); assert.equal(est.atribuicoes.length, 1);
  // um dos serviços volta sozinho numa janela seguinte: já está dentro do card, não vira outro
  const r3 = ingerir(est, fn, snapsDeAgendamentos([ag('a2', 'Maria', 'Glicemia', 20)], est.atribuicoes.map((a) => a.originSnapshot)), AGORA);
  assert.equal(r3.criados, 0); assert.equal(est.atribuicoes.length, 1);
});
teste('serviço do combo que só aparece depois entra no card (se ainda está na 1ª coluna)', () => {
  const est = novoEstado(), fn = funilDestino(est, 'agendamento', AGORA);
  ingerir(est, fn, snapsDeAgendamentos([ag('a2', 'Maria', 'Glicemia', 20)], []), AGORA);
  const r = ingerir(est, fn, snapsDeAgendamentos([ag('a1', 'Maria', 'Ultrassom', 90), ag('a2', 'Maria', 'Glicemia', 20)], est.atribuicoes.map((a) => a.originSnapshot)), AGORA);
  assert.equal(r.criados, 0); assert.equal(est.atribuicoes.length, 1);
  assert.equal(est.atribuicoes[0].cardId, 'a2', 'mantém o id do card que já existia');
  assert.equal(est.atribuicoes[0].ultimoSnapshot.valor, 110); assert.equal(est.atribuicoes[0].ultimoSnapshot.itens.length, 2);
});
teste('cards antigos já separados não são mexidos (nunca conta o mesmo valor duas vezes)', () => {
  const est = novoEstado(), fn = funilDestino(est, 'agendamento', AGORA);
  ingerir(est, fn, [snapDeAgendamento(ag('a1', 'Maria', 'Ultrassom', 90)), snapDeAgendamento(ag('a2', 'Maria', 'Glicemia', 20))], AGORA);
  const r = ingerir(est, fn, snapsDeAgendamentos([ag('a1', 'Maria', 'Ultrassom', 90), ag('a2', 'Maria', 'Glicemia', 20)], est.atribuicoes.map((a) => a.originSnapshot)), AGORA);
  assert.equal(r.criados, 0); assert.equal(est.atribuicoes.length, 2);
  assert.deepEqual(est.atribuicoes.map((a) => a.ultimoSnapshot.valor).sort(), [20, 90]);
});
teste('etiqueta "Mensagem enviada": só conta WhatsApp (IA, CRM ou registrado pela equipe); ligação e lead sem contato não contam', () => {
  const l = criarLead({ nome: 'Maria', telefone: '91981628017', valor: 300 }, em('2026-11-02', '09:00'));
  const ev = (id: string, quando: string, extra: Record<string, unknown>) => l.eventos.push({ id, quando, tipo: 'contato', texto: 'x', ...extra } as never);
  assert.equal(mensagemDoLead(undefined), null); assert.equal(mensagemDoLead(l), null);
  ev('a', '2026-11-02T13:00:00Z', { canal: 'ligacao' }); assert.equal(mensagemDoLead(l), null, 'ligação não é mensagem');
  ev('b', '2026-11-02T14:00:00Z', { canal: 'whatsapp', msg: 1, auto: true, texto: 'WhatsApp · modelo primeiro_contato (pt_BR) para +55*******7777' });
  const m = mensagemDoLead(l)!; assert.equal(m.n, 1); assert.equal(m.msg, 1); assert.equal(m.porIA, true); assert.equal(m.peloCrm, true); assert.equal(m.ultima, '2026-11-02T14:00:00Z');
  ev('c', '2026-11-02T15:00:00Z', { canal: 'whatsapp', texto: 'Mandei pelo meu WhatsApp' });
  const m2 = mensagemDoLead(l)!; assert.equal(m2.n, 2); assert.equal(m2.porIA, false); assert.equal(m2.peloCrm, false, 'a última foi registrada pela equipe'); assert.equal(m2.ultima, '2026-11-02T15:00:00Z');
});
teste('conferência Pipelines x Fluxo: nomes de coluna viram etapa do Fluxo; alinhar move só cards de etapas de trabalho e é idempotente', () => {
  assert.equal(itemDaEtapa('EM ABERTO'), 'aberto'); assert.equal(itemDaEtapa('PRIMEIRO CONTATO'), 'primeiro'); assert.equal(itemDaEtapa('RETORNO PERSONALIZADO'), 'retorno'); assert.equal(itemDaEtapa('EM NEGOCIAÇÃO'), 'negociacao');
  assert.equal(itemDaEtapa('CONVERTIDO - ORGANICO'), 'organico'); assert.equal(itemDaEtapa('CONVERTIDO ATIVO'), 'ativo'); assert.equal(itemDaEtapa('Sem retorno'), 'semretorno'); assert.equal(itemDaEtapa('Descarte'), 'descarte'); assert.equal(itemDaEtapa('Outra'), null);
  const est = novoEstado(); const f = funilDestino(est, 'orcamento', AGORA); ingerir(est, f, [snap('a'), snap('b'), snap('c')], AGORA);
  const l = criarLead({ nome: 'Maria', telefone: '91981628017', valor: 300, d0: '2026-11-01' }, AGORA); l.cardId = 'a';
  const estado = { pipelines: est, leads: [l] } as never;
  const r0 = conferir(estado, AGORA); assert.equal(r0.totais.pipeline, 3); assert.equal(r0.totais.fluxo, 1);
  assert.equal(r0.linhas.find((x) => x.item === 'aberto')!.semLead, 2, 'dois cards sem lead');
  assert.equal(r0.semPar.filter((x) => x.tipo === 'card_sem_lead').length, 2, 'os dois cards sem lead aparecem na lista, com nome');
  const solto = criarLead({ nome: 'Solto', telefone: '91981628018', valor: 100 }, AGORA); const removido = criarLead({ nome: 'Removido', telefone: '91981628019', valor: 100 }, AGORA); removido.cardId = 'c';
  est.atribuicoes.find((x) => x.cardId === 'c')!.caseStatus = 'removido'; (estado as unknown as { leads: unknown[] }).leads.push(solto, removido);
  const r00 = conferir(estado, AGORA); const sp = (n: string) => r00.semPar.find((x) => x.nome === n)!;
  assert.equal(sp('Solto').tipo, 'lead_sem_card'); assert.match(sp('Solto').motivo, /à mão/); assert.match(sp('Removido').motivo, /removido do funil/);
  (estado as unknown as { leads: unknown[] }).leads.splice(1, 2);
  const alvo = etapa(est, f.nome, 'DESCONTO'); moverCard(est.atribuicoes.find((a) => a.cardId === 'a')!, f, alvo, AGORA, { por: 'teste', manual: true });
  const r1 = conferir(estado, AGORA); const d = r1.divergencias.find((x) => x.leadId === l.id);
  if (d) { assert.equal(d.pipeline, 'Desconto'); assert.equal(d.alinhavel, d.fluxo !== 'Em aberto'); }
  const al = alinharCardsAoFluxo(estado, AGORA, 'Conferência (Fluxo)'); const al2 = alinharCardsAoFluxo(estado, AGORA, 'Conferência (Fluxo)');
  assert.equal(al2.movidos, 0, 'segunda vez não move nada'); assert.ok(al.movidos <= 1);
  assert.ok(conferir(estado, AGORA).divergencias.every((x) => !x.alinhavel), 'depois de alinhar não sobra nada alinhável');
});
teste('re-sincronizar com o orçamento sem lista de serviços não apaga os serviços que o card já tinha', () => {
  const est = novoEstado(); const f = funilDestino(est, 'orcamento', AGORA);
  ingerir(est, f, [snap('a')], AGORA); assert.deepEqual(est.atribuicoes[0].ultimoSnapshot.itens, ['Ultrassom']);
  ingerir(est, f, [snap('a', '2026-11-01T12:00:00Z', 500, { itens: [], subtitulo: '' })], AGORA);
  assert.deepEqual(est.atribuicoes[0].ultimoSnapshot.itens, ['Ultrassom']);
  ingerir(est, f, [snap('a', '2026-11-01T12:00:00Z', 500, { itens: ['Raio X'] })], AGORA);
  assert.deepEqual(est.atribuicoes[0].ultimoSnapshot.itens, ['Raio X'], 'lista nova válida substitui');
});
teste('serviços do orçamento: aceita item em texto simples ou em objeto, e repõe os que um card congelado perdeu', () => {
  const base = { orcamentoId: 'o1', status: 'aberto', criadoEm: '2026-11-01T12:00:00Z', paciente: { nome: 'Ana' } };
  assert.deepEqual(snapDeOrcamento({ ...base, itens: ['Ultrassom', ' Raio X '] } as never).itens, ['Ultrassom', 'Raio X'], 'texto simples (formato atual do Clinilink)');
  assert.deepEqual(snapDeOrcamento({ ...base, itens: [{ nome: 'Ultrassom' }, { servico: 'Raio X' }, {}] } as never).itens, ['Ultrassom', 'Raio X'], 'objeto');
  const est = novoEstado(); const f = funilDestino(est, 'orcamento', AGORA);
  ingerir(est, f, [snap('a', '2026-11-01T12:00:00Z', 500, { itens: [] })], AGORA);
  const a = est.atribuicoes[0]; a.stageId = etapa(est, f.nome, 'PRIMEIRO CONTATO'); assert.deepEqual(a.ultimoSnapshot.itens, []);
  ingerir(est, f, [snap('a', '2026-11-01T12:00:00Z', 500, { itens: ['Ultrassom'], subtitulo: 'Ultrassom' })], AGORA);
  assert.deepEqual(a.ultimoSnapshot.itens, ['Ultrassom'], 'card fora do topo sem serviços volta a ter');
  ingerir(est, f, [snap('a', '2026-11-01T12:00:00Z', 500, { itens: ['Outro'] })], AGORA);
  assert.deepEqual(a.ultimoSnapshot.itens, ['Ultrassom'], 'quem já tem serviços continua congelado');
});
teste('reparo de serviços: acha os cards sem itens, limita a 60 dias e repõe só os serviços (sem criar nem mover)', () => {
  const est = novoEstado(); const f = funilDestino(est, 'orcamento', AGORA);
  ingerir(est, f, [snap('velho', '2026-09-01T12:00:00Z', 500, { itens: [] }), snap('novo', '2026-10-30T12:00:00Z', 500, { itens: [] }), snap('ok')], AGORA);
  const falta = cardsSemServicos(est, f, AGORA)!;
  assert.deepEqual([...falta.ids].sort(), ['novo', 'velho']); assert.equal(falta.de, '2026-09-03', 'no máximo 60 dias atrás');
  const antes = est.atribuicoes.length;
  const n = reporServicos(est, f, [snap('velho', '2026-09-01T12:00:00Z', 500, { itens: ['Raio X'], subtitulo: 'Raio X' }), snap('outro', '2026-10-30T12:00:00Z', 500, { itens: ['X'] })]);
  assert.equal(n, 1); assert.equal(est.atribuicoes.length, antes, 'não cria card');
  assert.deepEqual(est.atribuicoes.find((a) => a.cardId === 'velho')!.ultimoSnapshot.itens, ['Raio X']); assert.deepEqual([...cardsSemServicos(est, f, AGORA)!.ids], ['novo']);
});
teste('histórico de contatos do card: envio por modelo vira dados organizados (sem id técnico do WhatsApp)', () => {
  const l = criarLead({ nome: 'Maria', telefone: '91981628017', valor: 300 }, AGORA); l.cardId = 'card-ct'; estadoCrm.leads.push(l);
  try {
    l.eventos.push({ id: 'e1', quando: '2026-11-19T15:50:00Z', tipo: 'contato', canal: 'whatsapp', msg: 1, auto: true, texto: 'WhatsApp · modelo primeiro_contato (pt_BR) para +55*******7332 · id wamid.HBgMNTU5MTgzMDU3MzMyFQIAERgS\nNome do paciente: Maria\nAtendente: Karla\nExame ou consulta: exame de ultrassom' } as never);
    l.eventos.push({ id: 'e2', quando: '2026-11-19T16:00:00Z', tipo: 'contato', canal: 'ligacao', texto: 'Ligou e caiu na caixa postal' } as never);
    const [a, b] = contatosDoLead('card-ct');
    assert.equal(a.modelo, 'primeiro_contato'); assert.equal(a.para, '+55*******7332'); assert.equal(a.msg, 1); assert.equal(a.porIA, true); assert.equal(a.tipo, 'Mandou WhatsApp');
    assert.deepEqual(a.campos, [{ rotulo: 'Nome do paciente', valor: 'Maria' }, { rotulo: 'Atendente', valor: 'Karla' }, { rotulo: 'Exame ou consulta', valor: 'exame de ultrassom' }]);
    assert.ok(!JSON.stringify(a).includes('wamid'), 'o id técnico não aparece');
    assert.equal(b.tipo, 'Ligou'); assert.equal(b.observacao, 'Ligou e caiu na caixa postal'); assert.equal(b.modelo, undefined);
  } finally { estadoCrm.leads.splice(estadoCrm.leads.indexOf(l), 1); }
});
teste('Fluxo e Pipelines sempre iguais: o último a mudar vale, sozinho, sem botão', () => {
  const est = novoEstado(); const f = funilDestino(est, 'orcamento', AGORA); ingerir(est, f, [snap('a')], AGORA);
  const l = criarLead({ nome: 'Maria', telefone: '91981628017', valor: 300, d0: '2026-11-01' }, AGORA); l.cardId = 'a';
  const estado = { pipelines: est, leads: [l] } as never; const card = () => est.atribuicoes.find((x) => x.cardId === 'a')!;
  const col = () => f.stages.find((e) => e.id === card().stageId)!.label;
  const igual = (t: Date, msg: string) => { assert.deepEqual(conferir(estado, t).divergencias, [], msg); };
  alinharCardsELeads(estado, AGORA); igual(AGORA, 'recém-criado'); assert.equal(col(), 'EM ABERTO');
  // 1) o contato é registrado no lead -> o card vai sozinho para Primeiro contato
  const t1 = em('2026-11-02', '10:00'); aplicar(l, { tipo: 'contato', canal: 'whatsapp', naoFoiRecepcao: true, passo: 'primeiro' } as Acao, t1);
  assert.equal(vistaDoLead(l, t1).item, 'primeiro'); alinharCardsELeads(estado, t1); assert.equal(col(), 'PRIMEIRO CONTATO'); igual(t1, 'depois do contato');
  // 2) a equipe arrasta o card para Desconto -> o Fluxo passa a mostrar o lead em Desconto
  const t2 = em('2026-11-02', '11:00'); moverCard(card(), f, etapa(est, f.nome, 'DESCONTO'), t2, { por: 'Vanuza', manual: true });
  alinharCardsELeads(estado, em('2026-11-02', '11:01')); assert.equal(vistaDoLead(l, em('2026-11-02', '11:01')).item, 'desconto'); assert.equal(col(), 'DESCONTO'); igual(em('2026-11-02', '11:01'), 'depois de arrastar o card');
  alinharCardsELeads(estado, em('2026-11-02', '11:02')); assert.equal(col(), 'DESCONTO', 'continua onde a equipe deixou');
  // 3) o lead se mexe de novo (o paciente responde) -> o card acompanha o lead
  const t3 = em('2026-11-02', '12:00'); aplicar(l, { tipo: 'resposta' } as Acao, t3);
  alinharCardsELeads(estado, t3); igual(t3, 'depois da resposta do paciente'); assert.equal(col(), 'EM NEGOCIAÇÃO');
  // 4) o tempo passa e o item do lead muda sozinho (sem evento): o card acompanha, em qualquer dia
  for (const d of ['2026-11-03', '2026-11-05', '2026-11-06', '2026-11-09', '2026-11-12']) { const t = em(d, '10:00'); alinharCardsELeads(estado, t); igual(t, 'dia ' + d); }
  // 5) "Mudar status" para Em aberto: o card volta para a primeira coluna
  aplicar(l, { tipo: 'status', para: 'aberto' } as Acao, em('2026-11-12', '11:00')); alinharCardsELeads(estado, em('2026-11-12', '11:01')); assert.equal(col(), 'EM ABERTO'); igual(em('2026-11-12', '11:01'), 'depois de Mudar status');
});
teste('No-show: quem faltou ontem vira lead para a IA convidar a reagendar, sem entrar nas contas do Fluxo de Orçamentos', () => {
  const est = novoEstado(); const f = funilDestino(est, 'agendamento', AGORA); const T = em('2026-11-02', '10:00');
  const tel = { contato: '91981628017' };
  ingerir(est, f, [snap('n1', '2026-11-01T14:00:00-03:00', 300, tel), snap('n2', '2026-10-28T14:00:00-03:00', 300, tel), snap('n3', '2026-11-01T14:00:00-03:00', 300), snap('n4', '2026-11-01T15:00:00-03:00', 300, tel)], AGORA);
  moverCard(est.atribuicoes.find((a) => a.cardId === 'n4')!, f, etapa(est, 'No-show', 'Retomada 1'), T, { por: 'Vanuza', manual: true });
  const estado = { pipelines: est, leads: [] as never[] } as never as { pipelines: EstadoFunis; leads: ReturnType<typeof criarLead>[] };
  const r = leadsDosNoShow(estado as never, T);
  assert.equal(r.criados, 1, 'só n1: n2 faltou há dias, n3 sem telefone, n4 já trabalhado pela equipe'); assert.equal(r.ignorados, 1);
  assert.equal(leadsDosNoShow(estado as never, T).criados, 0, 'idempotente');
  const l = estado.leads[0]; assert.equal(l.cardId, 'n1'); assert.equal(l.fonte, 'noshow'); assert.equal(l.status, 'negociacao'); assert.ok(l.noShow);
  const px = vistaDoLead(l, T).proximo!; assert.equal(px.passo.id, 'noshow'); assert.equal(px.situacao, 'hoje', 'a mensagem vale no dia seguinte à falta');
  // não mexe nas contas do Fluxo × Pipelines de Orçamentos nem move o card do No-show
  const cf = conferir(estado as never, T); assert.equal(cf.totais.fluxo, 0); assert.deepEqual(cf.semPar, []);
  alinharCardsELeads(estado as never, T); assert.equal(est.atribuicoes.find((a) => a.cardId === 'n1')!.stageId, f.stages[0].id);
  // a IA enxerga o lead e está pronta para enviar a Msg 10
  const av = avaliarLead(estado as never, l, T, { ignorarLista: true }); assert.ok(av, 'tem passo automático'); assert.equal(av!.tipo, 'pronto', JSON.stringify(av)); assert.equal((av as { msg: number }).msg, 10);
  // no dia anterior à falta+1 ele só espera; depois do dia certo passa a atrasado e a IA não age
  assert.equal(vistaDoLead(l, em('2026-11-01', '10:00')).proximo!.situacao, 'futura'); assert.equal(vistaDoLead(l, em('2026-11-03', '10:00')).proximo!.situacao, 'atrasada');
});
console.log(`${ok} testes passaram.`);
