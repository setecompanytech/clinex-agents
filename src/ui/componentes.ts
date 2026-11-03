// Componentes de dados do design system (navegador): variação, KPI, cartão de gráfico. Mesma base do Hoje/Análises do CRM.
// Dentro do texto não usar crases nem "dollar-chave".
export const componentes = String.raw`
var COR = { novos: 'var(--g5)', contatos: 'var(--g6)', respostas: 'var(--g1)', agendamentos: 'var(--g2)', convertidos: 'var(--g3)', descartados: 'var(--bad)' };

/* variação em relação ao período anterior (cor = direção x se subir é bom) */
function dlt(atual, ant, o) {
  o = o || {};
  if (atual === null || atual === undefined || ant === null || ant === undefined) return h('span', { class: 'dlt neutro', text: 'sem base anterior' });
  var dif, txt;
  if (o.pp) { dif = atual - ant; txt = (dif >= 0 ? '+' : '−') + nf1.format(Math.abs(dif)) + ' p.p.'; }
  else if (ant === 0) { dif = atual > 0 ? 1 : 0; txt = atual > 0 ? 'novo' : '0%'; }
  else { dif = (atual - ant) / ant * 100; txt = (dif >= 0 ? '+' : '−') + (Math.abs(dif) > 999 ? '999%+' : nf0.format(Math.abs(dif)) + '%'); }
  var igual = Math.abs(dif) < 0.05;
  var cls = !o.bom || igual ? 'neutro' : ((dif > 0) === (o.bom === 'sobe') ? 'bom' : 'ruim');
  return h('span', { class: 'dlt ' + cls, title: 'Comparado ao período anterior, de mesmo tamanho' }, [h('i', { 'aria-hidden': 'true', text: igual ? '■' : dif > 0 ? '▲' : '▼' }), txt, h('em', { text: ' ' + (o.vs || 'vs. anterior') })]);
}

function kpi2(o) {
  return h('div', { class: 'kpi2 ' + (o.tom || '') }, [
    h('div', { class: 'kpi2-h' }, [h('span', { class: 'kpi-r', text: o.rotulo }), o.serie ? spark(o.serie, o.cor || 'var(--g1)', 72, 26) : null]),
    h('b', { class: 'kpi-v', text: o.valor }),
    o.delta || null,
    o.sub ? h('small', { class: 'kpi2-s', text: o.sub }) : null
  ]);
}

/* cartão de gráfico: título, uma linha de contexto e (opcional) um número-resumo à direita */
function blocoCartao(titulo, sub, corpo, span, destaque, id) {
  return h('section', { class: 'cartao sp' + span, id: id || null }, [
    h('header', { class: 'card-h' }, [h('div', null, [h('h3', { text: titulo }), sub ? h('p', { text: sub }) : null]), destaque || null]),
    h('div', { class: 'card-b' }, corpo)
  ]);
}
function destaqueNum(valor, rotulo) { return h('div', { class: 'dest' }, [h('b', { text: valor }), h('small', { text: rotulo })]); }

`;
