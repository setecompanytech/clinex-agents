// JavaScript do CRM (navegador): aba "Time" de Análises, todos os vendedores lado a lado. Dados de /painel/crm/api/time (analisarTime em src/crm/executivo.ts).
// Dentro dele não usar crases nem "dollar-chave".
export const timeUi = String.raw`
var TM_C = {};
var TM_ORD = { k: 'receita', d: -1 };
var TM_PAL = ['var(--g1)', 'var(--g5)', 'var(--g3)', 'var(--g4)', 'var(--g2)', 'var(--g6)', 'var(--ag2)', 'var(--ag3)'];

function pedirTime() {
  var k = perChave(), c = TM_C[k];
  if (c && (c.carregando || Date.now() - c.t < 30000)) return c.d;
  TM_C[k] = { t: c ? c.t : 0, d: c ? c.d : null, carregando: true };
  api('GET', '/time?' + perQs()).then(function (d) { TM_C[k] = { t: Date.now(), d: d, carregando: false }; if (S.aba === 'analises') desenhar(true); })
    .catch(function (e) { TM_C[k] = { t: Date.now(), d: c ? c.d : null, carregando: false }; aviso('Não consegui calcular o time: ' + e.message, 'erro'); });
  return c ? c.d : null;
}
function tmMini(v, ant) {
  if (!perComparar() || ant === null || ant === undefined || !(ant > 0)) return null;
  var d = Math.round((v - ant) / ant * 100);
  return h('span', { class: 'dlt ' + (d === 0 ? 'neutro' : d > 0 ? 'bom' : 'ruim'), title: 'Contra o período anterior' }, [h('i', { 'aria-hidden': 'true', text: d === 0 ? '■' : d > 0 ? '▲' : '▼' }), (d > 0 ? '+' : d < 0 ? '−' : '') + Math.abs(d) + '%']);
}
function tmPct(v) { return v === null || v === undefined ? '–' : pct(v); }
function tmDias(v) { return v === null || v === undefined ? '–' : nf1.format(v) + ' d'; }

function kpisTime(D) {
  var a = D.totais.atual, p = D.totais.anterior, s = D.series.total, iaN = soma(D.series.ia.contatos);
  var vs = function (v, ant, o) { return dltP(v, ant, o); };
  return h('div', { class: 'kpis2 seis' }, [
    kpi2({ rotulo: 'Receita convertida', valor: brlCompacto(a.receita), delta: vs(a.receita, p.receita, { bom: 'sobe' }), sub: a.ticket ? 'ticket médio ' + brl(a.ticket) : 'sem conversões', serie: s.receita, cor: COR.convertidos }),
    kpi2({ rotulo: 'Convertidos', valor: nf0.format(a.convertidos), delta: vs(a.convertidos, p.convertidos, { bom: 'sobe' }), sub: a.ciclo === null ? null : 'ciclo de ' + nf1.format(a.ciclo) + ' d', serie: s.convertidos, cor: COR.convertidos }),
    kpi2({ rotulo: 'Leads recebidos', valor: nf0.format(a.recebidos), delta: vs(a.recebidos, p.recebidos, { bom: 'sobe' }), sub: a.semContato ? a.semContato + ' ainda sem contato' : 'todos contatados', serie: s.recebidos, cor: COR.novos }),
    kpi2({ rotulo: 'Contatos feitos', valor: nf0.format(a.contatos), delta: vs(a.contatos, p.contatos, { bom: 'sobe' }), sub: iaN ? iaN + ' pela IA de disparo' : 'pela equipe', serie: s.contatos, cor: COR.contatos }),
    kpi2({ rotulo: 'Taxa de resposta', valor: tmPct(a.taxaResposta), delta: vs(a.taxaResposta, p.taxaResposta, { pp: true, bom: 'sobe' }), sub: a.respostas + ' respostas', serie: s.respostas, cor: COR.respostas }),
    kpi2({ rotulo: 'Conversão', valor: tmPct(a.conversao), delta: vs(a.conversao, p.conversao, { pp: true, bom: 'sobe' }), sub: a.primeiroContato === null ? null : '1º contato em ' + nf1.format(a.primeiroContato) + ' d' })
  ]);
}

var TM_COLS = [
  { k: 'recebidos', r: 'Recebidos', f: function (e) { return nf0.format(e.recebidos); }, t: 'Leads que entraram para a pessoa no período' },
  { k: 'contatos', r: 'Contatos', f: function (e) { return nf0.format(e.contatos); }, t: 'Contatos que a pessoa fez' },
  { k: 'taxaResposta', r: 'Resposta', f: function (e) { return tmPct(e.taxaResposta); }, t: 'Respostas ÷ contatos' },
  { k: 'agendamentos', r: 'Agend.', f: function (e) { return nf0.format(e.agendamentos); }, t: 'Agendamentos feitos' },
  { k: 'convertidos', r: 'Convertidos', f: function (e) { return nf0.format(e.convertidos); }, t: 'Compareceu e pagou, ou já foi à recepção' },
  { k: 'conversao', r: 'Conversão', f: function (e) { return tmPct(e.conversao); }, t: 'Dos leads recebidos, quantos converteram' },
  { k: 'receita', r: 'Receita', f: function (e) { return [h('b', { text: brl(e.receita) }), tmMini(e.receita, e.anterior.receita)]; }, t: 'Valor convertido no período' },
  { k: 'ticket', r: 'Ticket', f: function (e) { return e.ticket === null ? '–' : brl(e.ticket); }, t: 'Receita ÷ convertidos' },
  { k: 'primeiroContato', r: '1º contato', f: function (e) { return tmDias(e.primeiroContato); }, t: 'Mediana de dias entre o lead entrar e o primeiro contato (menos é melhor)', menor: true },
  { k: 'ciclo', r: 'Ciclo', f: function (e) { return tmDias(e.ciclo); }, t: 'Mediana de dias da entrada até converter (menos é melhor)', menor: true },
  { k: 'carteiraN', r: 'Carteira', f: function (e) { return e.carteira.n + ' · ' + brlCompacto(e.carteira.valor); }, t: 'Leads ativos agora e o valor deles', v: function (e) { return e.carteira.n; } },
  { k: 'atrasadas', r: 'Atrasados', f: function (e) { return e.carteira.atrasadas ? h('span', { class: 'pill pl-atrasada', text: String(e.carteira.atrasadas) }) : '0'; }, t: 'Passos da carteira com a data vencida', v: function (e) { return e.carteira.atrasadas; }, menor: true }
];
function tmValor(e, c) { return c.v ? c.v(e) : e[c.k]; }
function tabelaTime(D) {
  var col = TM_COLS.filter(function (c) { return c.k === TM_ORD.k; })[0];
  var lista = D.equipe.slice().sort(function (a, b) {
    var x = col ? tmValor(a, col) : a[TM_ORD.k], y = col ? tmValor(b, col) : b[TM_ORD.k];
    if (x === null || x === undefined) x = TM_ORD.d > 0 ? Infinity : -Infinity;
    if (y === null || y === undefined) y = TM_ORD.d > 0 ? Infinity : -Infinity;
    return (x < y ? -1 : x > y ? 1 : 0) * TM_ORD.d || a.nome.localeCompare(b.nome);
  });
  var maxR = Math.max.apply(null, D.equipe.map(function (e) { return e.receita; }).concat([1]));
  var cab = h('tr', null, [h('th', { scope: 'col', text: 'Vendedor' })].concat(TM_COLS.map(function (c) {
    var on = TM_ORD.k === c.k;
    return h('th', { scope: 'col', title: c.t, 'aria-sort': on ? (TM_ORD.d > 0 ? 'ascending' : 'descending') : 'none' }, h('button', { type: 'button', class: 'th-b', onclick: function () { TM_ORD = { k: c.k, d: on ? -TM_ORD.d : (c.menor ? 1 : -1) }; desenhar(true); } }, [c.r, on ? h('i', { class: 'th-seta', text: TM_ORD.d > 0 ? '▲' : '▼', 'aria-hidden': 'true' }) : null]));
  })));
  var linhas = lista.map(function (e, i) {
    var tr = h('tr', { class: 'clic', tabindex: '0', title: 'Abrir o Meu Report de ' + e.nome }, [
      h('td', null, h('div', { class: 'cel-quem' }, [avatar(e.nome), h('div', null, [h('b', { text: e.nome }), h('i', { class: 'tm-barra', style: 'width:' + Math.round(e.receita / maxR * 100) + '%', 'aria-hidden': 'true' })])]))
    ].concat(TM_COLS.map(function (c) { return h('td', { class: 'num' }, c.f(e)); })));
    var abrir = function () { S.repNome = e.nome; S.anTab = 'report'; gravarLS('crm-antab', 'report'); desenhar(true); window.scrollTo(0, 0); };
    tr.addEventListener('click', abrir); tr.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') abrir(); });
    return tr;
  });
  var t = D.totais.atual;
  var rodape = h('tr', { class: 'tm-total' }, [h('td', null, h('b', { text: 'Time todo' })),
    h('td', { class: 'num', text: nf0.format(t.recebidos) }), h('td', { class: 'num', text: nf0.format(t.contatos) }), h('td', { class: 'num', text: tmPct(t.taxaResposta) }), h('td', { class: 'num', text: nf0.format(t.agendamentos) }),
    h('td', { class: 'num', text: nf0.format(t.convertidos) }), h('td', { class: 'num', text: tmPct(t.conversao) }), h('td', { class: 'num' }, [h('b', { text: brl(t.receita) }), tmMini(t.receita, D.totais.anterior.receita)]),
    h('td', { class: 'num', text: t.ticket === null ? '–' : brl(t.ticket) }), h('td', { class: 'num', text: tmDias(t.primeiroContato) }), h('td', { class: 'num', text: tmDias(t.ciclo) }),
    h('td', { class: 'num', text: soma(D.equipe.map(function (e) { return e.carteira.n; })) + ' · ' + brlCompacto(soma(D.equipe.map(function (e) { return e.carteira.valor; }))) }),
    h('td', { class: 'num', text: String(soma(D.equipe.map(function (e) { return e.carteira.atrasadas; }))) })]);
  return blocoCartao('Desempenho de cada vendedor', 'Clique no título de uma coluna para ordenar e na linha de uma pessoa para abrir o Meu Report dela. A barra mostra a fatia de receita.',
    h('div', { class: 'tbl-w' }, h('table', { class: 'tbl tm-tbl' }, [h('thead', null, cab), h('tbody', null, linhas), h('tfoot', null, rodape)])), 12);
}

function tmCor(D, nome) { var i = D.series.principais.indexOf(nome); return TM_PAL[(i < 0 ? 0 : i) % TM_PAL.length]; }
function tmSeries(D, campo) { return D.series.principais.map(function (n) { return { nome: n, cor: tmCor(D, n), valores: D.series.pessoas[n][campo] }; }); }
function tmCartoes(D) {
  var comReceita = D.equipe.filter(function (e) { return e.receita > 0; });
  var maxR = Math.max.apply(null, D.equipe.map(function (e) { return e.receita; }).concat([1]));
  var r = [];
  r.push(blocoCartao('Receita por vendedor', 'Valor convertido por responsável no período.', comReceita.length ? barras(D.equipe.filter(function (e) { return e.receita > 0; }).map(function (e) {
    return { rotulo: e.nome, valor: e.receita, texto: brl(e.receita), extra: e.convertidos + ' ' + plural(e.convertidos, 'conversão', 'conversões'), cor: tmCor(D, e.nome) };
  }), { max: maxR }) : vazio('Nenhuma conversão no período.'), 5));
  r.push(blocoCartao('Evolução da receita', 'Receita convertida de cada vendedor ' + sufixo(D) + '.', soma(D.series.total.receita) ? linhasTempo({ rotulos: D.rotulos, titulos: D.titulos, altura: 260, fmt: brlCompacto, aria: 'Receita por vendedor ao longo do tempo', series: tmSeries(D, 'receita') }) : vazio('Nenhuma conversão no período.'), 7));
  var outrosC = D.series.total.contatos.map(function (v, i) { var ps = 0; D.series.principais.forEach(function (n) { ps += D.series.pessoas[n].contatos[i]; }); return Math.max(0, v - ps - D.series.ia.contatos[i]); });
  var serCont = tmSeries(D, 'contatos').concat([{ nome: 'IA de disparo', cor: 'var(--cy)', valores: D.series.ia.contatos }]);
  if (soma(outrosC)) serCont.push({ nome: 'Outros', cor: 'var(--g6)', valores: outrosC });
  r.push(blocoCartao('Atendimento ao longo do tempo', 'Contatos feitos ' + sufixo(D) + ', por quem fez. A IA de disparo aparece à parte.', soma(D.series.total.contatos) ? areaEmpilhada({ rotulos: D.rotulos, titulos: D.titulos, altura: 270, aria: 'Contatos por vendedor ao longo do tempo', series: serCont }) : vazio('Nenhum contato no período.'), 7));
  r.push(blocoCartao('Conversão por vendedor', 'Dos leads que cada um recebeu no período, quantos converteram.', barras(D.equipe.filter(function (e) { return e.recebidos > 0; }).sort(function (a, b) { return (b.conversao || 0) - (a.conversao || 0); }).map(function (e) {
    return { rotulo: e.nome, valor: e.conversao || 0, texto: tmPct(e.conversao), extra: e.recebidos + ' ' + plural(e.recebidos, 'lead', 'leads'), cor: tmCor(D, e.nome) };
  }), { max: 100, vazio: 'Nenhum lead recebido no período.' }), 5));
  r.push(blocoCartao('Leads recebidos e convertidos', 'Entradas (colunas) e conversões (linha) do time, ' + sufixo(D) + '.', composto({ rotulos: D.rotulos, titulos: D.titulos, altura: 240, aria: 'Leads recebidos e convertidos', colunas: [{ nome: 'Leads recebidos', cor: COR.novos, valores: D.series.total.recebidos }], linhas: [{ nome: 'Convertidos', cor: COR.convertidos, valores: D.series.total.convertidos }] }), 6));
  r.push(blocoCartao('Respostas e agendamentos', 'O que o atendimento do time gerou, ' + sufixo(D) + '.', linhasTempo({ rotulos: D.rotulos, titulos: D.titulos, altura: 240, aria: 'Respostas e agendamentos ao longo do tempo', series: [{ nome: 'Respostas', cor: COR.respostas, valores: D.series.total.respostas }, { nome: 'Agendamentos', cor: COR.agendamentos, valores: D.series.total.agendamentos }] }), 6));
  var heatTotal = soma(D.heat.map(soma));
  r.push(blocoCartao('Quando o time contata', 'Contatos por dia da semana e hora. Mais escuro, mais contatos.', heatTotal ? mapaCalor(D.heat) : vazio('Nenhum contato no período.'), 7));
  var F = D.funil, cor = ['var(--f0)', 'var(--f1)', 'var(--f2)', 'var(--f3)', 'var(--f4)'];
  r.push(blocoCartao('Funil do time', 'Leads que entraram no período e até onde chegaram.', barras(F.map(function (f, i) { return { rotulo: f.etapa, valor: f.n, texto: nf0.format(f.n), cor: cor[i], extra: pct(f.pct) + (i && f.perda > 0 ? '  ·  −' + nf0.format(f.perda) + '%' : '') }; }), { max: F[0].n || 1, alta: true, vazio: 'Sem leads no período.' }), 5));
  var maxCart = Math.max.apply(null, D.equipe.map(function (e) { return e.carteira.n; }).concat([1]));
  r.push(blocoCartao('Carteira de agora', 'Leads ativos de cada vendedor e quantos têm passo atrasado.', barras(D.equipe.filter(function (e) { return e.carteira.n > 0; }).map(function (e) {
    return { rotulo: e.nome, valor: e.carteira.n, texto: e.carteira.n + ' · ' + brlCompacto(e.carteira.valor), extra: e.carteira.atrasadas ? e.carteira.atrasadas + ' atrasados' : 'em dia', cor: e.carteira.atrasadas ? 'var(--bad)' : tmCor(D, e.nome) };
  }), { max: maxCart, vazio: 'Nenhum lead ativo.' }), 6));
  var comPC = D.equipe.filter(function (e) { return e.primeiroContato !== null; });
  var maxPC = Math.max.apply(null, comPC.map(function (e) { return e.primeiroContato; }).concat([1]));
  r.push(blocoCartao('Dias até o primeiro contato', 'Mediana entre o lead entrar e o primeiro contato. Quanto menos, melhor.', barras(comPC.sort(function (a, b) { return a.primeiroContato - b.primeiroContato; }).map(function (e) {
    return { rotulo: e.nome, valor: e.primeiroContato, texto: tmDias(e.primeiroContato), extra: e.semContato ? e.semContato + ' sem contato' : '', cor: e.primeiroContato > 2 ? 'var(--warn)' : tmCor(D, e.nome) };
  }), { max: maxPC, vazio: 'Nenhum lead contatado no período.' }), 6));
  var maxU = Math.max.apply(null, D.unidades.map(function (u) { return u.receita; }).concat([1]));
  r.push(blocoCartao('Por unidade', 'Receita convertida e conversão de cada unidade.', barras(D.unidades.map(function (u, i) { return { rotulo: u.nome, valor: u.receita, texto: brl(u.receita), extra: tmPct(u.conversao) + ' de conversão', cor: TM_PAL[i % TM_PAL.length] }; }), { max: maxU, vazio: 'Sem dados por unidade.' }), 6));
  var maxM = Math.max.apply(null, D.mensagens.map(function (m) { return m.enviadas; }).concat([1]));
  r.push(blocoCartao('Mensagens do time', 'Quantas vezes cada mensagem foi enviada e a taxa de resposta.', barras(D.mensagens.map(function (m) { return { rotulo: 'Msg ' + m.n + ' · ' + m.titulo, valor: m.enviadas, texto: m.enviadas + ' env · ' + m.respostas + ' resp', extra: tmPct(m.taxa), cor: 'var(--g1)' }; }), { max: maxM, vazio: 'Nenhuma mensagem enviada.' }), 6));
  return r;
}
function corpoTime() {
  var D = pedirTime();
  if (!D) return esqueleto();
  if (!D.equipe.length) return vazio('Nenhum responsável ainda', 'Quando os leads tiverem responsável, a performance de cada um aparece aqui.');
  var pares = tmCartoes(D);
  var grade = [];
  for (var i = 0; i < pares.length; i += 2) grade.push(h('div', { class: 'g12' }, pares.slice(i, i + 2)));
  return [destaques(D), kpisTime(D), tabelaTime(D)].concat(grade);
}
`;
