/**
 * Testa o motor do CRM contra o "Guia de Atendimento do Lead". Rodar: npx tsx scripts/teste-crm.ts
 * Cada cenário descreve uma regra do documento; se uma falhar, o processo sai com erro.
 */
import assert from 'node:assert/strict';
import { aplicar, automatizar, criarLead, proximoPasso, RegraError, tarefasDoDia, vistaDoLead, hojeDe, somaDias, type Acao, type Lead } from '../src/crm/motor.js';

let ok = 0;
const teste = (nome: string, fn: () => void) => {
  try { fn(); ok++; console.log(`  ok  ${nome}`); } catch (e) { console.error(`FALHOU  ${nome}\n        ${(e as Error).message}`); process.exitCode = 1; }
};
const quando = (dia: string, hora = '10:00') => new Date(`${dia}T${hora}:00-03:00`);
const D0 = '2026-03-02'; // segunda-feira
const dia = (n: number) => somaDias(D0, n);
const novo = (valor = 300) => criarLead({ nome: 'Maria Souza', telefone: '91981628017', exame: 'ultrassom', valor }, quando(D0, '09:00'));
const contato = (l: Lead, d: string, passo?: string, canal: 'whatsapp' | 'ligacao' = 'whatsapp', hora = '10:00') =>
  aplicar(l, { tipo: 'contato', canal, naoFoiRecepcao: true, passo } as Acao, quando(d, hora));
const roda = (l: Lead, d: string, hora = '10:00') => automatizar(l, quando(d, hora));
const falha = (fn: () => void, codigo?: string) => {
  assert.throws(fn, (e) => e instanceof RegraError && (!codigo || e.codigo === codigo));
};
const prox = (l: Lead, d: string) => proximoPasso(l, d);

console.log('Fluxo principal: Em aberto -> Primeiro contato -> Sem retorno -> descarte automático');
teste('lead entra em Em aberto e o primeiro contato vence no D1', () => {
  const l = novo();
  assert.equal(l.status, 'aberto');
  const p = prox(l, D0)!;
  assert.equal(p.passo.id, 'primeiro');
  assert.equal(p.vence, dia(1));
  assert.equal(p.situacao, 'futura');
  assert.equal(prox(l, dia(1))!.situacao, 'hoje');
  assert.equal(prox(l, dia(2))!.situacao, 'atrasada');
});
teste('não deixa registrar o passo antes do vencimento', () => { falha(() => contato(novo(), D0, 'primeiro'), 'passo'); });
teste('contato exige a pergunta "já foi à recepção?" (regra de ouro 1)', () => {
  const l = novo();
  falha(() => aplicar(l, { tipo: 'contato', canal: 'whatsapp', naoFoiRecepcao: false, passo: 'primeiro' }, quando(dia(1))), 'recepcao');
});
teste('"já foi à recepção" vira Convertido orgânico e bloqueia contato', () => {
  const l = novo();
  aplicar(l, { tipo: 'recepcao' }, quando(dia(1)));
  assert.equal(l.status, 'convertido_organico');
  falha(() => contato(l, dia(1)), 'regra');
});
teste('só contata entre 8h e 19h (regra de ouro 2)', () => {
  const l = novo();
  falha(() => contato(l, dia(1), 'primeiro', 'whatsapp', '07:59'), 'regra');
  falha(() => contato(l, dia(1), 'primeiro', 'whatsapp', '19:00'), 'regra');
  falha(() => contato(l, dia(1), 'primeiro', 'whatsapp', '23:30'), 'regra');
  contato(l, dia(1), 'primeiro', 'whatsapp', '08:00');
});
teste('máximo de 2 tentativas por dia (regra de ouro 2)', () => {
  const l = novo();
  contato(l, dia(1), 'primeiro', 'whatsapp', '08:30');
  contato(l, dia(1), undefined, 'ligacao', '09:00');
  falha(() => contato(l, dia(1), undefined, 'whatsapp', '09:30'), 'regra');
  contato(l, dia(2), undefined, 'whatsapp', '09:30'); // no dia seguinte volta a valer
});
teste('cada tentativa fica registrada com data, canal e mensagem (regra de ouro 3)', () => {
  const l = novo();
  contato(l, dia(1), 'primeiro', 'whatsapp');
  const e = l.eventos.filter((x) => x.tipo === 'contato');
  assert.equal(e.length, 1);
  assert.equal(e[0].canal, 'whatsapp');
  assert.equal(e[0].msg, 1);
  assert.equal(e[0].passo, 'primeiro');
});
teste('orçamento acima de R$ 500: o primeiro contato exige WhatsApp E ligação', () => {
  const l = novo(800);
  contato(l, dia(1), 'primeiro', 'whatsapp', '08:30');
  const p = prox(l, dia(1))!;
  assert.equal(p.passo.id, 'primeiro');
  assert.equal(p.faltaLigacao, true);
  contato(l, dia(1), 'primeiro', 'ligacao', '09:00');
  assert.equal(prox(l, dia(1)), null);
});
teste('orçamento de R$ 500 ou menos: basta um contato', () => {
  const l = novo(500);
  contato(l, dia(1), 'primeiro');
  assert.equal(prox(l, dia(1)), null);
});
teste('sem resposta ao primeiro contato, no D3 vai para Sem retorno com Nova tentativa (11:30)', () => {
  const l = novo();
  contato(l, dia(1), 'primeiro');
  assert.equal(roda(l, dia(1)), 0);
  assert.equal(roda(l, dia(2)), 0, 'no D2 ainda aguarda');
  assert.equal(l.status, 'aberto');
  assert.equal(roda(l, dia(3)), 1);
  assert.equal(l.status, 'sem_retorno');
  const p = prox(l, dia(3))!;
  assert.equal(p.passo.id, 'tentativa');
  assert.equal(p.passo.hora, '11:30');
  assert.equal(p.vence, dia(3));
  assert.equal(p.situacao, 'hoje');
});
teste('Sem retorno: D3 nova tentativa (11:30), D4 desconto (16:00), D7 encerramento (16:00), D8 descarte automático com motivo "Sem retorno"', () => {
  const l = novo();
  contato(l, dia(1), 'primeiro'); roda(l, dia(3));
  contato(l, dia(3), 'tentativa', 'ligacao');
  assert.equal(prox(l, dia(3))!.passo.id, 'desconto');
  assert.equal(prox(l, dia(3))!.situacao, 'futura'); // o desconto só vence no D4
  const d4 = prox(l, dia(4))!; assert.equal(d4.passo.id, 'desconto'); assert.equal(d4.passo.msg, 3); assert.equal(d4.passo.hora, '16:00');
  contato(l, dia(4), 'desconto');
  assert.equal(prox(l, dia(5))!.passo.id, 'encerramento');
  assert.equal(prox(l, dia(5))!.situacao, 'futura');
  assert.equal(prox(l, dia(7))!.situacao, 'hoje');
  contato(l, dia(7), 'encerramento');
  assert.equal(roda(l, dia(7)), 0);
  assert.equal(l.status, 'sem_retorno');
  assert.equal(roda(l, dia(8)), 1);
  assert.equal(l.status, 'descarte');
  assert.equal(l.descarte!.motivo, 'Sem retorno');
  assert.equal(l.descarte!.auto, true);
});
teste('idempotente: rodar as automações de novo não muda nada', () => {
  const l = novo();
  contato(l, dia(1), 'primeiro'); roda(l, dia(3));
  const antes = JSON.stringify(l);
  assert.equal(roda(l, dia(3)), 0);
  assert.equal(JSON.stringify(l), antes);
});

console.log('Em negociação');
teste('respondeu: vai para Em negociação e o Orçamento (Msg 5) vence hoje', () => {
  const l = novo();
  contato(l, dia(1), 'primeiro');
  aplicar(l, { tipo: 'resposta', botao: 'Ver valor e horário' }, quando(dia(1), '11:00'));
  assert.equal(l.status, 'negociacao');
  const p = prox(l, dia(1))!;
  assert.equal(p.passo.id, 'orcamento');
  assert.equal(p.passo.msg, 5);
  assert.equal(p.situacao, 'hoje');
});
teste('cadência D0 orçamento, D1 follow-up, D3 objeção, D7 última oferta, D8 descarte (decisão)', () => {
  const l = novo();
  aplicar(l, { tipo: 'resposta' }, quando(dia(1)));
  const n0 = dia(1);
  const seq: [number, string, number | undefined][] = [[0, 'orcamento', 5], [1, 'followup', 6], [3, 'objecao', 7], [7, 'ultima', 8]];
  for (const [d, id, msg] of seq) {
    const p = prox(l, somaDias(n0, d))!;
    assert.equal(p.passo.id, id); assert.equal(p.passo.msg, msg); assert.equal(p.vence, somaDias(n0, d));
    contato(l, somaDias(n0, d), id);
  }
  const fim = prox(l, somaDias(n0, 8))!;
  assert.equal(fim.passo.id, 'descarte_neg');
  assert.equal(fim.passo.decisao, true);
  falha(() => aplicar(l, { tipo: 'contato', canal: 'whatsapp', naoFoiRecepcao: true, passo: 'descarte_neg' }, quando(somaDias(n0, 8))), 'passo');
});
teste('descarte sempre com motivo (regra de ouro 4)', () => {
  const l = novo();
  aplicar(l, { tipo: 'resposta' }, quando(dia(1)));
  falha(() => aplicar(l, { tipo: 'descartar', motivo: '' }, quando(dia(9))), 'motivo');
  falha(() => aplicar(l, { tipo: 'descartar', motivo: 'Porque sim' }, quando(dia(9))), 'motivo');
  for (const m of ['Preço', 'Outro lugar', 'Desistiu', 'Plano', 'Sem retorno', 'Outro']) {
    const x = novo(); aplicar(x, { tipo: 'resposta' }, quando(dia(1)));
    aplicar(x, { tipo: 'descartar', motivo: m }, quando(dia(9)));
    assert.equal(x.descarte!.motivo, m);
  }
});
teste('"deu uma data": retorno personalizado com a Msg 9 na data combinada', () => {
  const l = novo();
  aplicar(l, { tipo: 'resposta' }, quando(dia(1)));
  aplicar(l, { tipo: 'retorno', data: dia(5) }, quando(dia(1)));
  assert.equal(vistaDoLead(l, quando(dia(1))).item, 'retorno');
  const p = prox(l, dia(1))!;
  assert.equal(p.passo.id, 'retorno'); assert.equal(p.passo.msg, 9); assert.equal(p.situacao, 'futura');
  assert.equal(prox(l, dia(5))!.situacao, 'hoje');
  contato(l, dia(5), 'retorno');
  assert.equal(l.retornoData, undefined);
  assert.notEqual(prox(l, dia(5))?.passo.id, 'retorno');
});
teste('"parou de responder": vai para Sem retorno e segue para o Encerramento (Msg 4)', () => {
  const l = novo();
  aplicar(l, { tipo: 'resposta' }, quando(dia(1)));
  aplicar(l, { tipo: 'parou' }, quando(dia(4)));
  assert.equal(l.status, 'sem_retorno');
  const p = prox(l, dia(4))!;
  assert.equal(p.passo.id, 'encerramento');
  assert.equal(p.passo.msg, 4);
});

console.log('Agendado, no show e conversão');
teste('agendou: vai para Agendado com confirmação automática e não aceita data no passado', () => {
  const l = novo();
  aplicar(l, { tipo: 'resposta' }, quando(dia(1)));
  falha(() => aplicar(l, { tipo: 'agendou', data: dia(0) }, quando(dia(1))), 'dados');
  aplicar(l, { tipo: 'agendou', data: dia(4), hora: '09:00' }, quando(dia(1)));
  assert.equal(l.status, 'agendado');
  assert.ok(l.eventos.some((e) => e.tipo === 'automacao' && /Confirmação automática/.test(e.texto)));
  assert.equal(prox(l, dia(2))!.passo.id, 'comparecimento');
  assert.equal(prox(l, dia(2))!.situacao, 'futura'); // só vence no dia do agendamento
});
teste('compareceu e pagou: Convertido ativo', () => {
  const l = novo();
  aplicar(l, { tipo: 'resposta' }, quando(dia(1)));
  aplicar(l, { tipo: 'agendou', data: dia(4) }, quando(dia(1)));
  assert.equal(prox(l, dia(4))!.passo.id, 'comparecimento');
  aplicar(l, { tipo: 'compareceu' }, quando(dia(4)));
  assert.equal(l.status, 'convertido_ativo');
  falha(() => contato(l, dia(5)), 'regra');
});
teste('no show: volta para Em negociação, Msg 10, 1ª prioridade; depois segue o follow-up', () => {
  const l = novo();
  aplicar(l, { tipo: 'resposta' }, quando(dia(1)));
  aplicar(l, { tipo: 'agendou', data: dia(4) }, quando(dia(1)));
  aplicar(l, { tipo: 'noshow' }, quando(dia(4), '18:00'));
  assert.equal(l.status, 'negociacao');
  const p = prox(l, dia(4))!;
  assert.equal(p.passo.id, 'noshow'); assert.equal(p.passo.msg, 10); assert.equal(p.prioridade, 1);
  contato(l, dia(5), 'noshow');
  assert.equal(prox(l, dia(5))!.passo.id, 'followup');
});
teste('agendado não pode ser descartado direto', () => {
  const l = novo();
  aplicar(l, { tipo: 'resposta' }, quando(dia(1)));
  aplicar(l, { tipo: 'agendou', data: dia(4) }, quando(dia(1)));
  falha(() => aplicar(l, { tipo: 'descartar', motivo: 'Desistiu' }, quando(dia(2))), 'estado');
});

console.log('Reativação');
teste('reativação: Msg 11 só entre 30 e 60 dias depois do descarte', () => {
  const l = novo();
  aplicar(l, { tipo: 'resposta' }, quando(dia(1)));
  aplicar(l, { tipo: 'descartar', motivo: 'Preço' }, quando(dia(9)));
  const desc = dia(9);
  assert.equal(prox(l, somaDias(desc, 29))!.situacao, 'futura');
  assert.equal(prox(l, somaDias(desc, 30))!.situacao, 'hoje');
  assert.equal(prox(l, somaDias(desc, 60))!.situacao, 'hoje');
  assert.equal(prox(l, somaDias(desc, 61)), null);
  falha(() => contato(l, somaDias(desc, 10), 'reativacao'), 'regra');
  contato(l, somaDias(desc, 31), 'reativacao');
  assert.equal(l.reativacaoTentada, somaDias(desc, 31));
  aplicar(l, { tipo: 'resposta', botao: 'Quero agendar' }, quando(somaDias(desc, 31), '11:00'));
  assert.equal(l.status, 'negociacao');
});

console.log('Fila do dia e prioridade');
teste('fila: 1º no show, 2º leads novos em aberto, depois as demais', () => {
  const hoje = dia(10);
  const mk = (d0: string, valor = 100): Lead => criarLead({ nome: 'L' + d0 + valor, telefone: '91981628017', valor, d0 }, quando(d0, '09:00'));
  const aberto = mk(dia(9));                       // D1 hoje
  const velho = mk(dia(8));                        // D2 hoje, ainda em aberto sem contato (atrasado)
  const neg = mk(dia(1)); aplicar(neg, { tipo: 'resposta' }, quando(dia(8)));       // negociação com passos vencidos
  const ns = mk(dia(2)); aplicar(ns, { tipo: 'resposta' }, quando(dia(3))); aplicar(ns, { tipo: 'agendou', data: dia(6) }, quando(dia(3))); aplicar(ns, { tipo: 'noshow' }, quando(dia(10)));
  const ordem = tarefasDoDia([neg, aberto, ns, velho], quando(hoje)).map((t) => t.prioridade);
  assert.deepEqual([...ordem].sort(), ordem.slice().sort());
  assert.equal(ordem[0], 1);
  assert.ok(ordem.indexOf(2) < ordem.indexOf(3));
  assert.equal(ordem.filter((p) => p === 1).length, 1);
});
teste('vista do lead mostra limite de dias da etapa e quando está estourado', () => {
  const l = novo();
  assert.equal(vistaDoLead(l, quando(dia(1))).limite!.excedido, false);
  assert.equal(vistaDoLead(l, quando(dia(2))).limite!.excedido, true);
});
teste('dia do fuso: 22h em Belém ainda é o mesmo dia', () => {
  assert.equal(hojeDe(quando('2026-03-02', '22:30')), '2026-03-02');
  assert.equal(hojeDe(quando('2026-03-02', '00:10')), '2026-03-02');
});

console.log(`\n${ok} testes passaram${process.exitCode ? ', COM FALHAS' : ''}.`);
