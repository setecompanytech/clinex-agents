/**
 * Testa a Visão executiva e o Meu Report (src/crm/executivo.ts). Rodar: npx tsx scripts/teste-executivo-crm.ts
 */
import assert from 'node:assert/strict';
import { analisarExecutivo, analisarTime, meuReport } from '../src/crm/executivo.js';
import { gerarExemplos } from '../src/crm/exemplos.js';
import { analisarTempo, transicoes } from '../src/crm/tempo.js';
import { acompanharCard, aplicar, criarLead, hojeDe, somaDias, tarefasDoDia, vistaDoLead, type Lead, type NovoLead } from '../src/crm/motor.js';

let ok = 0;
const teste = (nome: string, fn: () => void) => { try { fn(); ok++; console.log(`  ok  ${nome}`); } catch (e) { console.error(`FALHOU  ${nome}\n        ${(e as Error).message}`); process.exitCode = 1; } };
const em = (dia: string, h = '10:00') => new Date(`${dia}T${h}:00-03:00`);
const AGORA = em('2026-03-20', '09:30');
const HOJE = hojeDe(AGORA);
const dia = (n: number) => somaDias(HOJE, -n);
const ctx = (leads: Lead[]) => ({ tarefas: tarefasDoDia(leads, AGORA), vistas: new Map(leads.map((l) => [l.id, vistaDoLead(l, AGORA)])) });
const exec = (leads: Lead[], d: 14 | 30 | 90 = 14, unidade: string | null = null) => { const c = ctx(leads); return analisarExecutivo(leads, AGORA, d, unidade, c.tarefas, c.vistas); };
const report = (leads: Lead[], nome: string, d: 14 | 30 | 90 = 14) => { const c = ctx(leads); return meuReport(leads, AGORA, d, nome, c.tarefas, c.vistas); };
const novo = (nome: string, d0: string, valor: number, extra: Partial<NovoLead>) => criarLead({ nome, telefone: '91900000000', valor, d0, exame: 'ultrassom', origem: 'Instagram', ...extra }, em(d0, '09:00'));
const contato = (l: Lead, d: string, passo?: string, h = '10:00') => aplicar(l, { tipo: 'contato', canal: 'whatsapp', naoFoiRecepcao: true, passo }, em(d, h));

// A: Guamá/Amanda converteu (R$ 300). B: Guamá/Bruno descartado (R$ 800). C: Telégrafo/Amanda lead de hoje (R$ 200).
// D: Telégrafo/Bruno orgânico (R$ 500). E: Guamá/Amanda faltou e reagendou (R$ 400). F: Telégrafo/Carla faltou e foi recuperada (R$ 600).
const A = novo('Ana', dia(6), 300, { unidade: 'Guamá', atendente: 'Amanda' }); contato(A, dia(5), 'primeiro'); aplicar(A, { tipo: 'resposta' }, em(dia(5), '11:30')); aplicar(A, { tipo: 'agendou', data: dia(3) }, em(dia(4))); aplicar(A, { tipo: 'compareceu' }, em(dia(3), '18:00'));
const B = novo('Bia', dia(10), 800, { unidade: 'Guamá', atendente: 'Bruno' }); contato(B, dia(9), 'primeiro'); aplicar(B, { tipo: 'descartar', motivo: 'Preço' }, em(dia(2), '17:00'));
const C = novo('Caio', HOJE, 200, { unidade: 'Telégrafo', atendente: 'Amanda' });
const D = novo('Davi', dia(4), 500, { unidade: 'Telégrafo', atendente: 'Bruno' }); aplicar(D, { tipo: 'recepcao' }, em(dia(1)));
const E = novo('Eva', dia(8), 400, { unidade: 'Guamá', atendente: 'Amanda' }); aplicar(E, { tipo: 'resposta' }, em(dia(7))); aplicar(E, { tipo: 'agendou', data: dia(5) }, em(dia(7))); aplicar(E, { tipo: 'noshow' }, em(dia(5), '18:00')); contato(E, dia(4), 'noshow'); aplicar(E, { tipo: 'agendou', data: dia(1) }, em(dia(4), '11:00'));
const F = novo('Fabio', dia(8), 600, { unidade: 'Telégrafo', atendente: 'Carla' }); aplicar(F, { tipo: 'resposta' }, em(dia(7))); aplicar(F, { tipo: 'agendou', data: dia(5) }, em(dia(7))); aplicar(F, { tipo: 'noshow' }, em(dia(5), '18:00')); contato(F, dia(4), 'noshow'); aplicar(F, { tipo: 'agendou', data: dia(2) }, em(dia(4), '11:00')); aplicar(F, { tipo: 'compareceu' }, em(dia(2), '18:00'));
const TODOS = [A, B, C, D, E, F];

console.log('Visão executiva');
teste('receita convertida separa ativo (compareceu e pagou) de orgânico (já foi à recepção)', () => {
  const k = exec(TODOS).kpis.receita;
  assert.equal(k.ativo.valor, 900); assert.equal(k.ativo.n, 2);   // A (300) + F (600)
  assert.equal(k.organico.valor, 500); assert.equal(k.organico.n, 1); // D
  assert.equal(k.valor, 1400); assert.equal(k.n, 3);
});
teste('pipeline em aberto = leads ativos (Caio aberto + Eva agendada)', () => {
  const p = exec(TODOS).kpis.pipeline;
  assert.equal(p.n, 2); assert.equal(p.valor, 600);
  assert.equal(p.multiplo, 0.4); // 600 / 1400
});
teste('conversão por coorte: 3 convertidos de 6 recebidos', () => {
  const c = exec(TODOS).kpis.conversao;
  assert.equal(c.recebidos, 6); assert.equal(c.convertidos, 3); assert.equal(c.taxa, 50);
});
teste('velocidade de venda = mediana dos dias até ganhar', () => {
  const v = exec(TODOS).kpis.velocidade;
  assert.equal(v.n, 3);
  // A: dia(6)->dia(3) = 3 · D: dia(4)->dia(1) = 3 · F: dia(8)->dia(2) = 6  => mediana 3
  assert.equal(v.mediana, 3);
});
teste('quem mais converteu: ranking por valor, pelo responsável do lead', () => {
  const r = exec(TODOS).ranking;
  assert.deepEqual(r.map((x) => [x.nome, x.valor, x.n]), [['Carla', 600, 1], ['Bruno', 500, 1], ['Amanda', 300, 1]]);
});
teste('funil de recuperação de no-show: 2 entraram, 1 recuperado', () => {
  const n = exec(TODOS).noshow;
  assert.equal(n.entraram, 2); assert.equal(n.recuperados, 1); assert.equal(n.pctRecuperacao, 50); assert.equal(n.valorRecuperado, 600);
  const por = Object.fromEntries(n.etapas.map((e) => [e.etapa, e.n]));
  assert.equal(por['Recuperado'], 1); assert.equal(por['Agendado'], 1); assert.equal(por['No-show'], 0);
});
teste('filtro por unidade recalcula tudo só com aquela unidade', () => {
  const g = exec(TODOS, 14, 'Guamá');
  assert.equal(g.kpis.receita.valor, 300); // só a Ana
  assert.equal(g.kpis.pipeline.n, 1);      // só a Eva
  assert.equal(g.noshow.entraram, 1);
  assert.deepEqual(g.unidades, ['Guamá', 'Telégrafo']); // a lista de unidades não some ao filtrar
});
teste('fila de decisão traz só leads ativos, com prioridade e dias parados', () => {
  const f = exec(TODOS).fila;
  assert.deepEqual(f.map((x) => x.nome).sort(), ['Caio', 'Eva']);
  for (const x of f) { assert.ok(['Risco', 'Atenção', 'Oportunidade'].includes(x.prioridade)); assert.ok(x.parado >= 0); }
  assert.equal(f.find((x) => x.nome === 'Eva')!.etapa, 'Agendado');
});
teste('ritmo por data de entrada soma os leads recebidos', () => {
  const r = exec(TODOS).ritmo;
  assert.equal(r.todos.reduce((s, v) => s + v, 0), 6);
  assert.equal(r.ativo.reduce((s, v) => s + v, 0), 2); assert.equal(r.organico.reduce((s, v) => s + v, 0), 1);
});
teste('unidades: volume x conversão ignora o filtro e compara todas', () => {
  const b = exec(TODOS, 14, 'Guamá').unidadesBolhas.orcamentos;
  assert.deepEqual(b.map((x) => x.nome).sort(), ['Guamá', 'Telégrafo']);
  const t = b.find((x) => x.nome === 'Telégrafo')!;
  assert.equal(t.volume, 3); assert.equal(t.convertidos, 2); // C (aberto), D (orgânico), F (ativo)
});
teste('previsão ponderada só usa peso quando há amostra suficiente (mín. 5 leads resolvidos)', () => {
  const p = exec(TODOS);
  assert.ok(p.previsaoEtapas.every((e) => e.peso === null)); // 6 leads: amostra pequena, sem peso inventado
  assert.equal(p.kpis.previsao.valor, 0);
});
teste('alerta de risco aparece quando há orçamento perto de estourar o prazo', () => {
  const a = exec(TODOS).alertas;
  assert.ok(a.length >= 1);
  assert.ok(['risco', 'atencao', 'info'].includes(a[0].nivel));
});

teste('fluxo do dinheiro: recebidos -> responderam ou não -> resultado, com R$ e contagem', () => {
  const f = exec(TODOS).fluxo;
  assert.equal(f.totalValor, 2800); assert.equal(f.totalN, 6);
  const v = (de: string, para: string) => f.links.find((l) => l.de === de && l.para === para);
  assert.equal(v('rec', 'resp')!.valor, 1300);      // Ana 300 + Eva 400 + Fabio 600
  assert.equal(v('rec', 'semresp')!.valor, 1500);   // Bia 800 + Caio 200 + Davi 500
  assert.equal(v('resp', 'ativo')!.valor, 900);     // Ana + Fabio
  assert.equal(v('resp', 'andamento')!.valor, 400); // Eva (reagendada)
  assert.equal(v('semresp', 'descartado')!.valor, 800);
  assert.equal(v('semresp', 'organico')!.valor, 500); // converteu sem resposta no CRM: já foi à recepção
  assert.equal(v('semresp', 'andamento')!.valor, 200);
  // conservação: tudo o que entra em uma coluna sai dela
  const saiDe = (id: string) => f.links.filter((l) => l.de === id).reduce((s, l) => s + l.valor, 0);
  const entraEm = (id: string) => f.links.filter((l) => l.para === id).reduce((s, l) => s + l.valor, 0);
  assert.equal(saiDe('rec'), f.totalValor); assert.equal(saiDe('resp'), entraEm('resp')); assert.equal(saiDe('semresp'), entraEm('semresp'));
});
teste('receita acumulada: cresce só quando alguém converte e termina no total do período', () => {
  const r = exec(TODOS).receitaSerie;
  assert.equal(r.acumulado.length, 14);
  assert.equal(r.acumulado[13], 1400);
  for (let i = 1; i < 14; i++) assert.ok(r.acumulado[i] >= r.acumulado[i - 1]);
  assert.equal(r.porPonto[10], 300); assert.equal(r.porPonto[11], 600); assert.equal(r.porPonto[12], 500);
});
teste('envelhecimento por card: um ponto por lead ativo e por no-show em aberto', () => {
  const e = exec(TODOS).envelhecimento.pontos;
  assert.deepEqual(e.orcamentos.map((p) => p.nome).sort(), ['Caio', 'Eva']);
  assert.deepEqual(e.noshow.map((p) => p.nome), ['Eva']);
  for (const p of [...e.orcamentos, ...e.noshow]) { assert.ok(p.dias >= 0 && p.valor > 0 && p.id); }
});
teste('alertas de risco informam o valor em jogo', () => {
  const a = exec(TODOS).alertas.filter((x) => x.leadIds);
  for (const x of a) assert.ok((x.valor ?? 0) > 0);
});

console.log('Meu Report');
teste('radar da pessoa vs. melhor e média da equipe (6 eixos)', () => {
  const r = report(TODOS, 'Amanda').radar;
  assert.deepEqual(r.map((x) => x.eixo), ['Receita', 'Conversão', 'Contatos', 'Resposta', 'Agendamentos', 'Velocidade']);
  const rec = r[0]; assert.equal(rec.valor, 300); assert.equal(rec.melhor, 600); assert.ok(rec.media !== null && rec.media <= rec.melhor);
  assert.equal(r[5].invertido, true);
});
teste('relatório individual: resultado pelo responsável, atividade pelo que a pessoa fez', () => {
  const r = report(TODOS, 'Amanda');
  assert.equal(r.atual.recebidos, 3);            // A, C, E
  assert.equal(r.atual.convertidos, 1);          // A
  assert.equal(r.atual.receita, 300);
  assert.equal(r.atual.contatos, 2);             // A (1º contato) + E (mensagem 10)
  assert.equal(r.atual.respostas, 2);            // A + E
  assert.equal(r.atual.taxaResposta, 100);
  assert.equal(r.ranking.receita.pos, 3); assert.equal(r.ranking.receita.de, 3);
});
teste('carteira ativa e no-show do responsável', () => {
  const r = report(TODOS, 'Amanda');
  assert.equal(r.carteira.n, 2); assert.equal(r.carteira.valor, 600); // Caio + Eva
  assert.equal(r.noshow.entraram, 1); assert.equal(r.noshow.recuperados, 0);
  const c = report(TODOS, 'Carla');
  assert.equal(c.noshow.recuperados, 1); assert.equal(c.noshow.valorRecuperado, 600);
});
teste('séries do relatório têm um ponto por dia e somam o total do período', () => {
  const r = report(TODOS, 'Amanda');
  assert.equal(r.rotulos.length, 14);
  assert.equal(r.series.contatos.reduce((s, v) => s + v, 0), r.atual.contatos);
  assert.equal(r.series.convertidos.reduce((s, v) => s + v, 0), r.atual.convertidos);
  assert.equal(r.series.receita.reduce((s, v) => s + v, 0), r.atual.receita);
});
teste('resumo para a diretoria traz frases com os números reais', () => {
  const r = report(TODOS, 'Amanda');
  assert.ok(r.resumo.length >= 3);
  assert.ok(/Amanda recebeu 3 leads/.test(r.resumo[0]) && /converteu 1/.test(r.resumo[0]));
  assert.ok(r.resumo.some((s) => /3ª posição de 3/.test(s)));
});

console.log('Dados de exemplo');
const demo = gerarExemplos(AGORA);
teste('exemplos têm unidades e a visão executiva fecha as contas', () => {
  const e = exec(demo, 30);
  assert.ok(e.unidades.length >= 2);
  const k = e.kpis;
  assert.equal(k.receita.valor, k.receita.ativo.valor + k.receita.organico.valor);
  assert.equal(k.pipeline.n, demo.filter((l) => ['aberto', 'sem_retorno', 'negociacao', 'agendado'].includes(l.status)).length);
  assert.equal(e.pipelineEtapas.reduce((s, p) => s + p.n, 0), k.pipeline.n);
  assert.equal(e.fila.length, k.pipeline.n);
  const w = e.previsaoEtapas.filter((p) => p.peso !== null);
  assert.ok(w.length > 0 && w.every((p) => p.peso! >= 0 && p.peso! <= 100));
  assert.ok(k.previsao.valor <= k.pipeline.valor);
});
teste('exemplos: envelhecimento soma os leads ativos e todas as unidades aparecem nas bolhas', () => {
  const e = exec(demo, 30);
  const emAberto = e.envelhecimento.orcamentos.reduce((s, r) => s + r.faixas.reduce((x, y) => x + y, 0), 0);
  assert.equal(emAberto, e.kpis.pipeline.n);
  assert.equal(e.unidadesBolhas.orcamentos.length, e.unidades.length);
  assert.ok(e.atividade.length >= 3);
});
teste('exemplos: relatório de cada responsável fecha com o total da equipe', () => {
  const nomes = report(demo, 'Amanda', 30).nomes;
  assert.ok(nomes.length >= 3);
  const soma = nomes.reduce((s, n) => s + report(demo, n, 30).atual.receita, 0);
  assert.equal(soma, exec(demo, 30).kpis.receita.valor);
});


console.log('Aba Time (todos os vendedores)');
const time = (leads: Lead[], d: 14 | 30 | 90 | { de: string; ate: string; dias: number } = 14) => { const c = ctx(leads); return analisarTime(leads, AGORA, d, c.tarefas, c.vistas); };
teste('uma linha por responsável, ordenadas por receita, batendo com o Meu Report de cada pessoa', () => {
  const t = time(TODOS);
  assert.deepEqual(t.equipe.map((e) => e.nome).sort(), ['Amanda', 'Bruno', 'Carla']);
  for (let i = 1; i < t.equipe.length; i++) assert.ok(t.equipe[i - 1].receita >= t.equipe[i].receita, 'ordem por receita');
  for (const e of t.equipe) {
    const r = report(TODOS, e.nome).atual;
    assert.equal(e.receita, r.receita, e.nome + ' receita'); assert.equal(e.convertidos, r.convertidos, e.nome + ' convertidos');
    assert.equal(e.contatos, r.contatos, e.nome + ' contatos'); assert.equal(e.recebidos, r.recebidos, e.nome + ' recebidos');
    assert.equal(e.conversao, r.conversao, e.nome + ' conversão'); assert.equal(e.descartes, r.descartes, e.nome + ' descartes');
  }
});
teste('o total do time é a soma das pessoas e as séries somam o total', () => {
  const t = time(TODOS), soma = (x: number[]) => x.reduce((a, b) => a + b, 0);
  assert.equal(t.totais.atual.receita, t.equipe.reduce((a, e) => a + e.receita, 0));
  assert.equal(t.totais.atual.convertidos, t.equipe.reduce((a, e) => a + e.convertidos, 0));
  assert.equal(t.totais.atual.recebidos, t.equipe.reduce((a, e) => a + e.recebidos, 0));
  assert.equal(soma(t.series.total.receita), t.totais.atual.receita); assert.equal(soma(t.series.total.convertidos), t.totais.atual.convertidos);
  assert.equal(soma(t.series.total.contatos), t.totais.atual.contatos); assert.equal(soma(t.series.total.recebidos), t.totais.atual.recebidos);
  for (const n of t.series.principais) assert.equal(soma(t.series.pessoas[n].receita), t.equipe.find((e) => e.nome === n)!.receita, n + ' série = linha');
  assert.equal(t.series.total.contatos.length, t.rotulos.length);
});
teste('o período anterior tem o mesmo tamanho; custom (de/ate) e 90 dias (semanal) funcionam e a carteira reflete o agora', () => {
  const t = time(TODOS);
  assert.ok(t.equipe.some((e) => e.anterior.receita >= 0));
  const c = time(TODOS, { de: dia(10), ate: dia(3), dias: 8 });
  assert.equal(c.dias, 8); assert.equal(c.rotulos.length, 8); assert.equal(c.ate, dia(3));
  const t90 = time(TODOS, 90); assert.equal(t90.semanal, true);
  const amanda = t.equipe.find((e) => e.nome === 'Amanda')!;
  assert.equal(amanda.carteira.n, TODOS.filter((l) => l.atendente === 'Amanda' && ['aberto', 'sem_retorno', 'negociacao', 'agendado'].includes(l.status)).length);
});
teste('lead sem responsável aparece como linha própria e vira alerta; sem dados não quebra', () => {
  const sem = novo('Sem Dono', dia(1), 700, { unidade: 'Guamá' });
  const t = time([...TODOS, sem]);
  assert.ok(t.equipe.some((e) => e.nome === 'Sem responsável')); assert.equal(t.semResponsavel.n, 1); assert.equal(t.semResponsavel.valor, 700);
  assert.ok(t.destaques.some((d) => /sem responsável/.test(d.texto)));
  const vazio = time([]); assert.deepEqual(vazio.equipe, []); assert.ok(vazio.destaques.length >= 1);
  assert.ok(!JSON.stringify(t).includes('NaN') && !JSON.stringify(vazio).includes('NaN'));
});
teste('contatos da IA aparecem à parte e entram no total', () => {
  const l = novo('Ia Teste', dia(1), 300, { unidade: 'Guamá', atendente: 'Amanda' });
  aplicar(l, { tipo: 'contato', canal: 'whatsapp', naoFoiRecepcao: true, atendente: 'IA', auto: true }, em(dia(1), '09:00'));
  const t = time([...TODOS, l]);
  assert.equal(t.series.ia.contatos.reduce((a, b) => a + b, 0), 1);
  assert.ok(t.destaques.some((d) => /IA de disparo/.test(d.texto)));
  assert.equal(t.totais.atual.contatos, time(TODOS).totais.atual.contatos + 1);
});
teste('exemplos do CRM: o time fecha com a visão executiva', () => {
  const t = time(demo, 30);
  assert.equal(t.totais.atual.receita, exec(demo, 30).kpis.receita.valor, 'receita do time = receita da visão executiva');
  assert.ok(t.equipe.length >= 2); assert.ok(t.funil[0].n >= t.funil[4].n);
});


console.log('Conversão feita no Pipelines (o lead só acompanha o card)');
teste('card movido para Convertido ativo conta como conversão em todas as análises (Tempo, Visão executiva, Time e Meu Report)', () => {
  const l = novo('Via Pipelines', dia(3), 700, { unidade: 'Guamá', atendente: 'Amanda' });
  const antes = { time: time(TODOS).totais.atual, exec: exec(TODOS).kpis.receita, rep: report(TODOS, 'Amanda').atual, tempo: (() => { const c = ctx(TODOS); return analisarTempo(TODOS, AGORA, 14, c.tarefas, c.vistas).atual; })() };
  assert.equal(acompanharCard(l, 'convertido_ativo', em(dia(1)), 'CONVERTIDO ATIVO'), true);
  const c = ctx([...TODOS, l]);
  // o evento que o card deixa NÃO começa com "Compareceu": é justamente o que as análises ignoravam
  assert.ok(l.eventos.some((e) => e.tipo === 'comparecimento' && /^Acompanhou o funil/.test(e.texto)));
  const depois = { time: time([...TODOS, l]).totais.atual, exec: exec([...TODOS, l]).kpis.receita, rep: report([...TODOS, l], 'Amanda').atual, tempo: analisarTempo([...TODOS, l], AGORA, 14, c.tarefas, c.vistas).atual };
  assert.equal(depois.time.convertidos, antes.time.convertidos + 1); assert.equal(depois.time.receita, antes.time.receita + 700);
  assert.equal(depois.exec.n, antes.exec.n + 1); assert.equal(depois.exec.valor, antes.exec.valor + 700);
  assert.equal(depois.rep.convertidos, antes.rep.convertidos + 1); assert.equal(depois.rep.receita, antes.rep.receita + 700);
  assert.equal(depois.tempo.convertidos, antes.tempo.convertidos + 1); assert.equal(depois.tempo.valorConvertido, antes.tempo.valorConvertido + 700);
});
teste('card movido para Em negociação (etapa em maiúsculas) é reconhecido na linha do tempo do lead', () => {
  const l = novo('Neg', dia(5), 300, { unidade: 'Guamá', atendente: 'Amanda' });
  assert.equal(acompanharCard(l, 'negociacao', em(dia(2)), 'EM NEGOCIAÇÃO'), true);
  const tr = transicoes(l);
  assert.equal(tr[tr.length - 1].status, 'negociacao');
});

console.log(`\n${ok} testes passaram${process.exitCode ? ', COM FALHAS' : ''}.`);
