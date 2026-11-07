/**
 * Testa o fluxo do No-show (src/crm/modelo-noshow.ts + src/crm/noshow.ts). Rodar: npx tsx scripts/teste-noshow-crm.ts
 */
import assert from 'node:assert/strict';
import { GRADE_NOSHOW, ITENS_NOSHOW, MAPA_NOSHOW, REGRAS_NOSHOW, ETAPA_DO_ITEM } from '../src/crm/modelo-noshow.js';
import { MENSAGENS, MODELO } from '../src/crm/modelo.js';
import { analisarNoShow, chaveDaEtapa, dadosNoShow, funilNoShow } from '../src/crm/noshow.js';
import { funisPadrao } from '../src/crm/pipeline/regras.js';
import type { Atribuicao, CardSnap, EstadoFunis } from '../src/crm/pipeline/tipos.js';

let ok = 0;
const teste = (nome: string, fn: () => void) => { try { fn(); ok++; console.log(`  ok  ${nome}`); } catch (e) { console.error(`FALHOU  ${nome}\n        ${(e as Error).message}`); process.exitCode = 1; } };

const AGORA = new Date('2026-03-20T12:00:00-03:00');
const dia = (n: number, h = 10) => new Date(new Date(`2026-03-20T${String(h).padStart(2, '0')}:00:00-03:00`).getTime() - n * 86_400_000).toISOString();
const ids = new Set(MODELO.ITENS.map((i) => i.id));

teste('ids dos itens do No-show são únicos e não colidem com o fluxo de leads', () => {
  const nos = ITENS_NOSHOW.map((i) => i.id);
  assert.equal(new Set(nos).size, nos.length);
  assert.ok(nos.every((i) => i.startsWith('ns-')));
  assert.equal(MODELO.ITENS.length, new Set(MODELO.ITENS.map((i) => i.id)).size, 'ids únicos na lista inteira');
  assert.ok(ITENS_NOSHOW.every((i) => i.fluxo === 'noshow'));
});
teste('toda saída, passo, cadência, mensagem e regra aponta para algo que existe', () => {
  for (const it of ITENS_NOSHOW) {
    for (const s of it.saidas ?? []) assert.ok(ids.has(s.para), `${it.id} → ${s.para}`);
    for (const c of it.cadencia ?? []) assert.ok(ids.has(c), `${it.id} cadência ${c}`);
    if (it.pai) assert.ok(ids.has(it.pai), `${it.id} pai ${it.pai}`);
    for (const m of it.msgs ?? []) assert.ok(MENSAGENS.some((x) => x.n === m), `${it.id} mensagem ${m}`);
    for (const r of it.regras ?? []) assert.ok(REGRAS_NOSHOW.some((x) => x.n === r), `${it.id} regra ${r}`);
    assert.ok(it.id in ETAPA_DO_ITEM, `${it.id} sem etapa de análise`);
  }
});
teste('mapa: nós e arestas consistentes, sem nó fora da tela', () => {
  const nos = new Map(MAPA_NOSHOW.nos.map((n) => [n.id, n]));
  assert.equal(nos.size, MAPA_NOSHOW.nos.length);
  for (const n of MAPA_NOSHOW.nos) {
    assert.ok(ids.has(n.id), `nó ${n.id} sem item`);
    assert.ok(n.x >= 0 && n.y >= 0 && n.x + n.w <= MAPA_NOSHOW.w && n.y + n.h <= MAPA_NOSHOW.h, `nó ${n.id} fora do quadro`);
  }
  for (const a of MAPA_NOSHOW.arestas) { assert.ok(nos.has(a.de) && nos.has(a.para), `aresta ${a.id}`); }
  for (const a of MAPA_NOSHOW.nos) for (const b of MAPA_NOSHOW.nos) if (a.id < b.id) assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `nós ${a.id} e ${b.id} se sobrepõem`);
});
teste('calendário: todo item citado existe', () => {
  for (const l of GRADE_NOSHOW.linhas) {
    assert.ok(ids.has(l.item));
    for (const c of Object.values(l.celulas ?? {})) assert.ok(ids.has(c.id), c.id);
    for (const r of l.bloco?.ramos ?? []) assert.ok(ids.has(r.item), r.item);
    for (const d of Object.keys(l.celulas ?? {})) assert.ok(GRADE_NOSHOW.dias.includes(d), d);
  }
});
teste('o texto do guia do fluxo de leads continua separado (itens e regras de ouro)', () => {
  assert.ok(MODELO.NOSHOW.REGRAS.length === 4 && MODELO.NOSHOW.MAPA.nos.length === 9);
  assert.ok(MODELO.ITENS.some((i) => i.id === 'negociacao' && !i.fluxo));
});

// ---- análise com cards sintéticos
const funis = funisPadrao(AGORA);
const f = funis.find((x) => x.dimensao === 'agendamento')!;
const st = (rotulo: string) => f.stages.find((s) => chaveDaEtapa(s.label) === chaveDaEtapa(rotulo))!.id;
const snap = (id: string, nome: string, valor: number, unidade = 'Guamá'): CardSnap => ({ id, paciente: nome, valor, itens: [], criadoEm: dia(10), status: 'faltou', unidade });
function card(id: string, nome: string, valor: number, trilha: [string, number][], extra: Partial<Atribuicao> = {}): Atribuicao {
  const historico = trilha.map(([r, d]) => ({ stageId: st(r), em: dia(d), manual: false }));
  const ult = trilha[trilha.length - 1];
  return { funilId: f.id, cardId: id, stageId: st(ult[0]), enteredAt: dia(ult[1]), manual: false, historico, originSnapshot: snap(id, nome, valor), ultimoSnapshot: snap(id, nome, valor), originStatus: 'faltou', caseStatus: 'aberto', ...extra };
}
const est: EstadoFunis = {
  funis, rotina: {}, extras: { c1: { responsavel: 'Amanda' } }, followups: [],
  atribuicoes: [
    card('c1', 'Ana', 900, [['No-show', 3]]),                                                    // no-show há 3 dias (estourou o limite de 1)
    card('c2', 'Bia', 400, [['No-show', 1]]),                                                    // no-show há 1 dia
    card('c3', 'Cris', 1200, [['No-show', 6], ['Retomada 1', 5]]),                               // retomada há 5 dias
    card('c4', 'Dani', 300, [['No-show', 9], ['Retomada 1', 8], ['Agendado', 6]]),               // remarcou
    card('c5', 'Eva', 700, [['No-show', 12], ['Retomada 1', 11], ['Sem Retorno', 9], ['Perdido', 2]]),
    card('c6', 'Flor', 500, [['No-show', 8], ['Retomada 1', 7], ['Recuperado', 6]]),            // fechou direto
    card('c7', 'Gi', 250, [['No-show', 4]], { caseStatus: 'removido' }),                         // removido não conta
  ],
  contatos: [
    { id: 'k1', cardId: 'c3', data: dia(5, 11), tipo: 'Mandou WhatsApp' }, { id: 'k2', cardId: 'c4', data: dia(8, 9), tipo: 'Mandou WhatsApp' }, { id: 'k3', cardId: 'c4', data: dia(8, 15), tipo: 'Respondeu' },
    { id: 'k4', cardId: 'c6', data: dia(7, 9), tipo: 'Ligou' }, { id: 'k5', cardId: 'c6', data: dia(7, 10), tipo: 'Respondeu' }, { id: 'k6', cardId: 'c5', data: dia(11, 9), tipo: 'Mandou WhatsApp' },
    { id: 'k7', cardId: 'c3', data: dia(4, 9), tipo: 'Mandou WhatsApp' }, { id: 'k8', cardId: 'c3', data: dia(3, 9), tipo: 'Ligou' },
  ],
};

teste('rótulos das colunas viram etapas', () => {
  assert.equal(chaveDaEtapa('No-show'), 'noshow'); assert.equal(chaveDaEtapa('Retomada 1'), 'retomada'); assert.equal(chaveDaEtapa('Sem Retorno'), 'semretorno');
  assert.equal(chaveDaEtapa('Perdido'), 'perdido'); assert.equal(chaveDaEtapa('Recuperado'), 'recuperado'); assert.equal(chaveDaEtapa('Agendado'), 'agendado');
  assert.equal(funilNoShow(est)?.id, f.id);
});
teste('mapa: conta só os cards visíveis de cada etapa e lista os de maior valor primeiro', () => {
  const d = dadosNoShow(est, AGORA);
  assert.equal(d.total, 6); assert.deepEqual(d.contagens, { 'ns-noshow': 2, 'ns-retomada': 1, 'ns-agendado': 1, 'ns-perdido': 1, 'ns-recuperado': 1 });
  assert.equal((d.cards['ns-noshow'] as { nome: string }[])[0].nome, 'Ana');
  assert.equal(d.valor, 900 + 400 + 1200 + 300 + 700 + 500);
});
teste('sem o funil No-show nada quebra', () => {
  const d = dadosNoShow({ ...est, funis: [] }, AGORA);
  assert.equal(d.total, 0); assert.equal(analisarNoShow({ ...est, funis: [] }, AGORA, 'ns-noshow', 30), null);
});
teste('análise do No-show: quem está lá, prazo estourado, para onde foram e tempo', () => {
  const r = analisarNoShow(est, AGORA, 'ns-noshow', 30)!;
  assert.equal(r.agora.n, 2); assert.equal(r.agora.valor, 1300); assert.equal(r.agora.estourados, 1); assert.equal(r.agora.quase, 1);
  assert.equal(r.fluxo.entradas, 6); assert.equal(r.fluxo.saidas, 4);
  assert.equal(r.fluxo.destinos[0].rotulo, 'Retomada 1'); assert.equal(r.fluxo.destinos[0].n, 4);
  assert.equal(r.agora.porAtendente.find((x) => x.nome === 'Amanda')?.n, 1);
  assert.equal(r.agora.topValor[0].card, true);
  assert.ok(r.historia.length >= 2 && r.insights.length >= 1);
  assert.ok(!/\bleads?\b/i.test([...r.historia, ...r.insights].map((x) => `${x.titulo} ${x.texto}`).join(' ')), 'a narrativa fala em cards, não em leads');
  assert.ok(/\bcards?\b/.test(r.historia[0].texto));
  // o contato de remarcação sai no No-show, no dia em que o card muda de coluna (k1, k2, k4 e k6)
  assert.equal(r.contatos.tem, true); assert.equal(r.contatos.total, 4); assert.equal(r.contatos.whatsapp, 3); assert.equal(r.contatos.ligacao, 1);
  assert.equal(r.contatos.leads, 4); assert.equal(r.contatos.responderam, 2); assert.equal(r.contatos.taxaResposta, 50);
});
teste('análise da Retomada 1: destinos, perdas separadas e contatos com resposta', () => {
  const r = analisarNoShow(est, AGORA, 'ns-retomada', 30)!;
  assert.equal(r.agora.n, 1); assert.equal(r.fluxo.saidas, 3);
  assert.equal(r.fluxo.avancaram, 2, 'Agendado e Recuperado'); assert.equal(r.fluxo.descartaram, 1, 'Sem Retorno conta como perda');
  // só o que aconteceu DEPOIS de o card entrar na Retomada (c3, k7 e k8): o do dia da troca ficou com o No-show
  assert.equal(r.contatos.total, 2); assert.equal(r.contatos.whatsapp, 1); assert.equal(r.contatos.ligacao, 1);
});
teste('passos analisam a etapa deles e a entrada conta os cards que chegaram', () => {
  assert.equal(analisarNoShow(est, AGORA, 'ns-t3', 30)!.agora.n, 0);
  assert.equal(analisarNoShow(est, AGORA, 'ns-d1', 30)!.agora.n, 2);
  const e = analisarNoShow(est, AGORA, 'ns-faltou', 30)!;
  assert.equal(e.item.entrada, true); assert.equal(e.fluxo.entradas, 6); assert.equal(e.agora.n, 0); assert.equal(e.origem[0].nome, 'Guamá');
});
teste('período maior vira semanas e item desconhecido devolve nulo', () => {
  const r = analisarNoShow(est, AGORA, 'ns-noshow', 90)!;
  assert.equal(r.semanal, true); assert.equal(r.rotulos.length, 13);
  assert.equal(analisarNoShow(est, AGORA, 'ns-inexistente', 30), null);
});

console.log(`${ok} testes passaram.`);
