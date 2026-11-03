/**
 * Testa as análises da tela Hoje do CRM (src/crm/analise.ts) com cenários de resultado conhecido.
 * Rodar: npx tsx scripts/teste-analise-crm.ts
 */
import assert from 'node:assert/strict';
import { analisarHoje } from '../src/crm/analise.js';
import { gerarExemplos } from '../src/crm/exemplos.js';
import { aplicar, criarLead, hojeDe, somaDias, tarefasDoDia, vistaDoLead, type Lead } from '../src/crm/motor.js';

let ok = 0;
const teste = (nome: string, fn: () => void) => { try { fn(); ok++; console.log(`  ok  ${nome}`); } catch (e) { console.error(`FALHOU  ${nome}\n        ${(e as Error).message}`); process.exitCode = 1; } };
const em = (dia: string, h = '10:00') => new Date(`${dia}T${h}:00-03:00`);
const AGORA = em('2026-03-20', '09:30');
const HOJE = hojeDe(AGORA);
const dia = (n: number) => somaDias(HOJE, -n);
const analisar = (leads: Lead[]) => {
  const ts = tarefasDoDia(leads, AGORA);
  return analisarHoje(leads, AGORA, ts, new Map(leads.map((l) => [l.id, vistaDoLead(l, AGORA)])));
};
const novo = (nome: string, d0: string, valor = 300, extra: object = {}) => criarLead({ nome, telefone: '91900000000'.slice(0, 11 - nome.length % 2), valor, d0, exame: 'ultrassom', origem: 'Instagram', atendente: 'Amanda', ...extra }, em(d0, '09:00'));
const contato = (l: Lead, d: string, passo: string, h = '10:00') => aplicar(l, { tipo: 'contato', canal: 'whatsapp', naoFoiRecepcao: true, passo }, em(d, h));

// A: contatou, respondeu, agendou, compareceu. B: contatou e não respondeu, depois descartou. C: lead novo de hoje.
const A = novo('Ana', dia(6)); contato(A, dia(5), 'primeiro'); aplicar(A, { tipo: 'resposta' }, em(dia(5), '11:30')); aplicar(A, { tipo: 'agendou', data: dia(3) }, em(dia(4))); aplicar(A, { tipo: 'compareceu' }, em(dia(3), '18:00'));
const B = novo('Bia', dia(10), 800, { origem: 'Google', atendente: 'Bruno' }); contato(B, dia(9), 'primeiro', '09:00'); aplicar(B, { tipo: 'contato', canal: 'ligacao', naoFoiRecepcao: true, passo: 'primeiro' }, em(dia(9), '09:30'));
aplicar(B, { tipo: 'resposta' }, em(dia(8), '14:00')); aplicar(B, { tipo: 'descartar', motivo: 'Preço' }, em(dia(2), '17:00'));
const C = novo('Caio', HOJE, 200);

console.log('Funil, atividade e conversão');
teste('funil conta quem chegou em cada etapa (3 leads: 2 contatados, 2 responderam, 1 agendou, 1 compareceu)', () => {
  const a = analisar([A, B, C]);
  assert.deepEqual(a.funil.map((f) => f.n), [3, 2, 2, 1, 1]);
  assert.equal(a.funil[0].pct, 100);
  assert.equal(a.funil[1].pct, 66.7);
  assert.equal(a.funil[3].perda, 50);
});
teste('conversão dos últimos 30 dias = convertidos / (convertidos + descartados)', () => {
  const k = analisar([A, B, C]).kpis;
  assert.equal(k.conversao, 50);
  assert.equal(k.convertidoN30, 1);
  assert.equal(k.convertidoValor30, 300);
  assert.equal(k.perdidoN30, 1);
  assert.equal(k.perdidoValor30, 800);
});
teste('ciclo médio = dias do D0 até comparecer', () => {
  const k = analisar([A, B, C]).kpis;
  assert.equal(k.cicloMedio, 3); // D0 dia(6) -> compareceu dia(3)
  assert.equal(k.cicloN, 1);
});
teste('atividade de 14 dias: 14 pontos, novos leads de hoje no último', () => {
  const at = analisar([A, B, C]).atividade;
  assert.equal(at.dias.length, 14);
  assert.equal(at.dias[13], HOJE);
  assert.equal(at.novos[13], 1);
  assert.equal(at.contatos.reduce((s, v) => s + v, 0), 3); // A:1, B:2
  assert.equal(at.convertidos[10], 1); // dia(3)
});
teste('taxa de resposta (14 dias) e de agendamento (30 dias) sobre quem foi contatado', () => {
  const k = analisar([A, B, C]).kpis;
  assert.equal(k.respostaN, 2);
  assert.equal(k.respostaTaxa, 100);
  assert.equal(k.agendTaxa, 50);
});
console.log('Mensagens, descartes, origem e equipe');
teste('desempenho por mensagem: a resposta é atribuída ao último contato antes dela', () => {
  const m = analisar([A, B, C]).mensagens.find((x) => x.n === 1)!;
  assert.equal(m.enviadas, 3);
  assert.equal(m.respostas, 2);
  assert.equal(m.taxa, 66.7);
});
teste('respostas por hora do dia (horário de Belém)', () => {
  const a = analisar([A, B, C]);
  assert.equal(a.respostasPorHora[11], 1);
  assert.equal(a.respostasPorHora[14], 1);
  assert.equal(a.respostasPorHora.reduce((s, v) => s + v, 0), 2);
});
teste('descartes por motivo com o valor perdido', () => {
  const d = analisar([A, B, C]).descartes;
  assert.deepEqual(d, [{ motivo: 'Preço', n: 1, valor: 800 }]);
});
teste('origem e equipe somam os mesmos leads', () => {
  const a = analisar([A, B, C]);
  assert.equal(a.origem.reduce((s, o) => s + o.leads, 0), 3);
  assert.equal(a.equipe.reduce((s, e) => s + e.ativos, 0), 1); // só o C está ativo
  const insta = a.origem.find((o) => o.nome === 'Instagram')!;
  assert.equal(insta.convertidos, 1);
});
console.log('Dados de exemplo (invariantes)');
const demo = gerarExemplos(AGORA);
const ad = analisar(demo);
teste('funil nunca cresce de uma etapa para a seguinte e todo percentual fica entre 0 e 100', () => {
  for (let i = 1; i < ad.funil.length; i++) assert.ok(ad.funil[i].n <= ad.funil[i - 1].n, `${ad.funil[i].etapa} > ${ad.funil[i - 1].etapa}`);
  for (const f of ad.funil) assert.ok(f.pct >= 0 && f.pct <= 100);
});
teste('pipeline soma exatamente os leads ativos', () => {
  const ativos = demo.filter((l) => ['aberto', 'sem_retorno', 'negociacao', 'agendado'].includes(l.status));
  assert.equal(ad.pipeline.reduce((s, p) => s + p.n, 0), ativos.length);
  assert.equal(ad.kpis.pipelineN, ativos.length);
  assert.equal(ad.kpis.pipelineValor, ativos.reduce((s, l) => s + l.valor, 0));
  assert.equal(ad.aging.reduce((s, a) => s + a.faixas.reduce((x, f) => x + f.n, 0), 0), ativos.filter((l) => l.status !== 'agendado').length);
});
teste('taxas dentro de 0-100, insights ordenados por gravidade e fila coerente', () => {
  for (const t of [ad.kpis.respostaTaxa, ad.kpis.agendTaxa, ad.kpis.conversao]) assert.ok(t === null || (t >= 0 && t <= 100));
  const ordem = { critico: 0, atencao: 1, info: 2, bom: 3 } as const;
  for (let i = 1; i < ad.insights.length; i++) assert.ok(ordem[ad.insights[i].nivel] >= ordem[ad.insights[i - 1].nivel]);
  assert.equal(ad.progresso.pendentes, tarefasDoDia(demo, AGORA).length);
  assert.ok(ad.mensagens.every((m) => m.respostas <= m.enviadas));
});
teste('exemplos respeitam as regras de ouro: nenhum contato fora de 8h-19h nem 3 no mesmo dia', () => {
  for (const l of demo) {
    const porDia = new Map<string, number>();
    for (const e of l.eventos.filter((x) => x.tipo === 'contato')) {
      const h = Number(new Date(new Date(e.quando).getTime() - 3 * 3_600_000).toISOString().slice(11, 13));
      assert.ok(h >= 8 && h < 19, `contato às ${h}h`);
      const d = new Date(new Date(e.quando).getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
      porDia.set(d, (porDia.get(d) ?? 0) + 1);
    }
    for (const n of porDia.values()) assert.ok(n <= 2, 'mais de 2 contatos no mesmo dia');
  }
});

console.log(`\n${ok} testes passaram${process.exitCode ? ', COM FALHAS' : ''}.`);
console.log(`(exemplo: ${demo.length} leads, funil ${ad.funil.map((f) => f.n).join(' > ')}, ${ad.insights.length} insights)`);
