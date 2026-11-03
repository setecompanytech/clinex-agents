/**
 * Testa as regras dos funis do documento "pipelines-crm-tecnico" (src/crm/pipeline). Rodar: npx tsx scripts/teste-funis-crm.ts
 */
import assert from 'node:assert/strict';
import { funilDestino, ingerir, janelaDoPedido, janelaPadrao, snapDeAgendamento, snapDeOrcamento } from '../src/crm/pipeline/ingestao.js';
import { painelExecutivo, relatorio } from '../src/crm/pipeline/metricas.js';
import { aplicarAutomacoes, atrasado, classeDaEtapa, diaBRT, estrelas, funisPadrao, moverCard, recortar, validarAutomacoes, validarConfig, valorExibido } from '../src/crm/pipeline/regras.js';
import { FunilError, type CardSnap, type EstadoFunis } from '../src/crm/pipeline/tipos.js';

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
console.log(`${ok} testes passaram.`);
