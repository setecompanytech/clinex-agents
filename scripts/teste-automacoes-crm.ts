/**
 * Testa as automações do pipeline (src/crm/automacoes.ts + motor). Rodar: npx tsx scripts/teste-automacoes-crm.ts
 */
import assert from 'node:assert/strict';
import { casa, cfgDeRegras, logDoGuia, MODELOS, regrasPadrao, rodarRegras, simular, validarRegra, type Regra } from '../src/crm/automacoes.js';
import { aplicar, automatizar, criarLead, RegraError, somaDias, type Lead } from '../src/crm/motor.js';
import { transicoes } from '../src/crm/tempo.js';

let ok = 0;
const teste = (nome: string, fn: () => void) => { try { fn(); ok++; console.log(`  ok  ${nome}`); } catch (e) { console.error(`FALHOU  ${nome}\n        ${(e as Error).message}`); process.exitCode = 1; } };
const em = (dia: string, h = '10:00') => new Date(`${dia}T${h}:00-03:00`);
const HOJE = '2026-03-20';
const AGORA = em(HOJE, '09:30');
const dia = (n: number) => somaDias(HOJE, -n);
const novo = (nome: string, d0: string, valor = 300, extra: Partial<Lead> = {}) => Object.assign(criarLead({ nome, telefone: '91900000000', valor, d0, exame: 'ultrassom', unidade: 'Guamá', atendente: 'Amanda' }, em(d0, '09:00')), extra);
const mk = (b: object): Regra => ({ id: 'r1', criadaEm: AGORA.toISOString(), execucoes: 0, ...validarRegra({ nome: 'teste', ...b }) });
const erroDe = (fn: () => void) => { try { fn(); } catch (e) { return e instanceof RegraError ? e.message : `ERRO INESPERADO ${(e as Error).message}`; } return null; };
const contatou = (l: Lead, d: string) => aplicar(l, { tipo: 'contato', canal: 'whatsapp', naoFoiRecepcao: true, passo: 'primeiro' }, em(d));

teste('guia: sem resposta ao 1º contato vai para Sem retorno no D2 (padrão do guia)', () => {
  const l = novo('A', dia(2)); contatou(l, dia(1));
  assert.equal(automatizar(l, AGORA), 1); assert.equal(l.status, 'sem_retorno');
});
teste('guia editável: prazo da nova tentativa em 3 dias segura o lead mais um dia', () => {
  const regras = regrasPadrao(AGORA); (regras[0].gatilho as { dia: number }).dia = 3;
  const l = novo('A', dia(2)); contatou(l, dia(1));
  assert.equal(automatizar(l, AGORA, cfgDeRegras(regras)), 0); assert.equal(l.status, 'aberto');
  assert.equal(automatizar(l, em(somaDias(HOJE, 1)), cfgDeRegras(regras)), 1);
});
teste('guia desligada: o lead não muda de etapa sozinho', () => {
  const regras = regrasPadrao(AGORA); regras[0].ativa = false;
  const l = novo('A', dia(3)); contatou(l, dia(2));
  assert.equal(automatizar(l, AGORA, cfgDeRegras(regras)), 0); assert.equal(l.status, 'aberto');
});
teste('log do guia registra a movimentação e conta a execução', () => {
  const regras = regrasPadrao(AGORA);
  const l = novo('A', dia(2)); contatou(l, dia(1));
  const antes = new Map([[l.id, l.status as string]]); automatizar(l, AGORA);
  const log = logDoGuia(antes, [l], regras, AGORA);
  assert.equal(log.length, 1); assert.equal(regras[0].execucoes, 1);
});
teste('modelos prontos são todos válidos', () => {
  for (const m of MODELOS) validarRegra({ ...m, acoes: m.acoes.map((a) => (a.tipo === 'atribuir' && !a.atendente ? { ...a, atendente: 'Amanda' } : a)) });
});
teste('validação recusa dados ruins com mensagem clara', () => {
  const base = { nome: 'x', gatilho: { tipo: 'sem_contato', dias: 3 }, acoes: [{ tipo: 'etiqueta', texto: 'x' }] };
  assert.match(erroDe(() => validarRegra({ ...base, nome: '' }))!, /nome/i);
  assert.match(erroDe(() => validarRegra({ ...base, gatilho: { tipo: 'sem_contato', dias: 0 } }))!, /Dias sem contato/);
  assert.match(erroDe(() => validarRegra({ ...base, acoes: [] }))!, /ação/);
  assert.match(erroDe(() => validarRegra({ ...base, acoes: [{ tipo: 'descartar', motivo: 'Chato' }] }))!, /motivo/i);
  assert.match(erroDe(() => validarRegra({ ...base, gatilho: { tipo: 'nada' } }))!, /gatilho/i);
  assert.match(erroDe(() => validarRegra({ ...base, filtros: { valorMin: 900, valorMax: 100 } }))!, /mínimo/);
  assert.match(erroDe(() => validarRegra({ ...base, acoes: [{ tipo: 'descartar', motivo: 'Preço' }, { tipo: 'mover', para: 'sem_retorno' }] }))!, /descartar/);
});
teste('parado na etapa respeita dias, etapa e filtros', () => {
  const r = mk({ gatilho: { tipo: 'parado_etapa', etapa: 'aberto', dias: 3 }, filtros: { valorMin: 500 }, acoes: [{ tipo: 'etiqueta', texto: 'x' }] });
  assert.equal(casa(novo('A', dia(3), 800), r, AGORA), true);
  assert.equal(casa(novo('B', dia(2), 800), r, AGORA), false, 'poucos dias');
  assert.equal(casa(novo('C', dia(5), 100), r, AGORA), false, 'valor abaixo');
  const r2 = mk({ gatilho: { tipo: 'parado_etapa', etapa: 'aberto', dias: 3 }, filtros: { unidade: 'Guamá' }, acoes: [{ tipo: 'nota', texto: 'a' }] });
  assert.equal(casa(novo('D', dia(5), 800, { unidade: 'Nazaré' }), r2, AGORA), false, 'outra unidade');
});
teste('executa ações em ordem, não repete e conta a execução', () => {
  const r = mk({ gatilho: { tipo: 'parado_etapa', etapa: 'aberto', dias: 2 }, acoes: [{ tipo: 'etiqueta', texto: 'Parado' }, { tipo: 'atribuir', atendente: 'Bruno' }, { tipo: 'alerta', texto: '[Nome] com [Valor] parado' }] });
  const l = novo('Maria Souza', dia(3), 900);
  const log = rodarRegras([l], [r], AGORA);
  assert.equal(log.length, 1); assert.equal(log[0].alerta, true);
  assert.deepEqual(l.etiquetas, ['Parado']); assert.equal(l.atendente, 'Bruno');
  assert.ok(l.eventos.some((e) => e.tipo === 'nota' && e.texto.includes('Maria com R$ 900 parado')), 'texto com variáveis');
  assert.equal(r.execucoes, 1);
  assert.equal(rodarRegras([l], [r], em(HOJE, '15:00')).length, 0, 'não repete no mesmo ponto da jornada');
});
teste('template de mensagem: preenche [Nome], [Valor] e [Exame], registra na linha do tempo e conta como aviso', () => {
  const r = mk({ gatilho: { tipo: 'parado_etapa', etapa: 'aberto', dias: 2 }, acoes: [{ tipo: 'mensagem', texto: 'Oi, [Nome]! Seu [Exame] de [Valor] segue reservado.' }] });
  const l = novo('Maria Souza', dia(3), 900);
  const log = rodarRegras([l], [r], AGORA);
  assert.equal(log.length, 1); assert.equal(log[0].alerta, true);
  assert.ok(log[0].resumo.startsWith('mensagem pronta: Oi, Maria! Seu ultrassom de R$ 900'), log[0].resumo);
  assert.ok(l.eventos.some((e) => e.tipo === 'nota' && e.texto.includes('mensagem pronta para enviar') && e.texto.includes('Oi, Maria!')));
  assert.match(erroDe(() => validarRegra({ nome: 'x', gatilho: { tipo: 'sem_contato', dias: 3 }, acoes: [{ tipo: 'mensagem', texto: '   ' }] }))!, /texto do template/);
  assert.equal(validarRegra({ nome: 'x', gatilho: { tipo: 'sem_contato', dias: 3 }, acoes: [{ tipo: 'mensagem', texto: 'a'.repeat(1500) }] }).acoes[0].tipo, 'mensagem');
});
teste('mover para Sem retorno funciona e a linha do tempo reconhece a etapa', () => {
  const r = mk({ gatilho: { tipo: 'parado_etapa', etapa: 'negociacao', dias: 5 }, acoes: [{ tipo: 'mover', para: 'sem_retorno' }] });
  const l = novo('A', dia(8)); aplicar(l, { tipo: 'resposta' }, em(dia(6)));
  rodarRegras([l], [r], AGORA);
  assert.equal(l.status, 'sem_retorno');
  assert.equal(transicoes(l).at(-1)!.status, 'sem_retorno');
});
teste('descartar pela automação grava motivo e etapa de origem', () => {
  const r = mk({ gatilho: { tipo: 'parado_etapa', etapa: 'aberto', dias: 4 }, acoes: [{ tipo: 'descartar', motivo: 'Desistiu' }] });
  const l = novo('A', dia(5)); rodarRegras([l], [r], AGORA);
  assert.equal(l.status, 'descarte'); assert.equal(l.descarte?.motivo, 'Desistiu'); assert.equal(l.descarte?.de, 'aberto'); assert.equal(l.descarte?.auto, true);
  assert.equal(transicoes(l).at(-1)!.status, 'descarte');
});
teste('regra desligada e lead já convertido não disparam', () => {
  const r = mk({ ativa: false, gatilho: { tipo: 'parado_etapa', etapa: 'aberto', dias: 1 }, acoes: [{ tipo: 'nota', texto: 'a' }] });
  const l = novo('A', dia(4)); assert.equal(rodarRegras([l], [r], AGORA).length, 0);
  const org = novo('B', dia(4)); aplicar(org, { tipo: 'recepcao' }, em(dia(3)));
  assert.equal(casa(org, { ...r, ativa: true }, AGORA), false);
});
teste('sem contato, lead novo e agendamento próximo', () => {
  const sc = mk({ gatilho: { tipo: 'sem_contato', dias: 4 }, acoes: [{ tipo: 'etiqueta', texto: 'x' }] });
  const a = novo('A', dia(5)); assert.equal(casa(a, sc, AGORA), true);
  aplicar(a, { tipo: 'contato', canal: 'whatsapp', naoFoiRecepcao: true }, em(dia(1)));
  assert.equal(casa(a, sc, AGORA), false, 'contatou ontem');
  const ln = mk({ gatilho: { tipo: 'lead_novo', dias: 0 }, acoes: [{ tipo: 'etiqueta', texto: 'x' }] });
  assert.equal(casa(novo('B', HOJE), ln, AGORA), true);
  const ag = novo('C', dia(3)); aplicar(ag, { tipo: 'agendou', data: somaDias(HOJE, 1) }, em(dia(2)));
  assert.equal(casa(ag, mk({ gatilho: { tipo: 'agendamento_proximo', dias: 1 }, acoes: [{ tipo: 'nota', texto: 'a' }] }), AGORA), true);
  assert.equal(casa(ag, mk({ gatilho: { tipo: 'agendamento_proximo', dias: 3 }, acoes: [{ tipo: 'nota', texto: 'a' }] }), AGORA), false);
});
teste('simulação conta o que seria afetado sem alterar nada', () => {
  const r = mk({ gatilho: { tipo: 'parado_etapa', etapa: 'aberto', dias: 2 }, acoes: [{ tipo: 'descartar', motivo: 'Preço' }] });
  const ls = [novo('A', dia(3), 400), novo('B', dia(3), 600), novo('C', dia(1), 999)];
  const s = simular(ls, r, AGORA);
  assert.equal(s.total, 2); assert.equal(s.valor, 1000); assert.ok(ls.every((l) => l.status === 'aberto'));
});
teste('automação do guia: só ajusta prazo e liga/desliga; ações não mudam', () => {
  const [b] = regrasPadrao(AGORA);
  const v = validarRegra({ nome: 'outro nome', ativa: false, gatilho: { dia: 4 }, acoes: [{ tipo: 'descartar', motivo: 'Preço' }] }, b);
  assert.equal(v.nome, b.nome); assert.equal(v.ativa, false); assert.deepEqual(v.acoes, b.acoes); assert.equal((v.gatilho as { dia: number }).dia, 4);
  assert.match(erroDe(() => validarRegra({ nome: 'x', gatilho: { dia: 99 } }, b))!, /Dia da nova tentativa/);
});
console.log(`${ok} testes passaram.`);
