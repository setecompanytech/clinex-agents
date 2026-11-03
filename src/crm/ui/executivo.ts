// JavaScript do CRM (navegador): área Análises (abas) e o cockpit da Visão executiva. Dados de /painel/crm/api/executivo (src/crm/executivo.ts).
// Dentro dele não usar crases nem "dollar-chave".
export const executivo = String.raw`
var BRL2 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
function brl2(v) { return BRL2.format(v || 0); }
var COR_ORC = 'var(--c-aberto)', COR_NS = 'var(--warn)';
var CORES_CAT = ['var(--g1)', 'var(--g5)', 'var(--g2)', 'var(--g3)', 'var(--g4)', 'var(--g6)'];
var ABAS_AN = [['executivo', 'Visão executiva'], ['evolucao', 'Evolução'], ['report', 'Meu Report']];
var ETAPAS_ORC = ['Em aberto', 'Primeiro contato', 'Nova tentativa', 'Desconto', 'Sem retorno', 'Retorno personalizado', 'Em negociação', 'Agendado'];
var ETAPAS_NS = ['No-show', 'Retomada', 'Agendado', 'Sem retorno'];

function statsCaixa(itens) { return h('div', { class: 'stat2' }, itens.map(function (i) { return h('div', null, [h('small', { text: i[0] }), h('b', { class: i[2] || '', text: i[1] })]); })); }
function esqueleto() { return h('div', { class: 'carregando-an' }, [h('div', { class: 'skel' }), h('div', { class: 'skel' }), h('div', { class: 'skel' })]); }
function mudarPeriodo(d) { S.dias = d; gravarLS('crm-dias', String(d)); desenhar(true); }

function pedirExec() {
  var k = S.dias + '|' + (S.unidade || '');
  if (S.EXfresh[k] || S.EXcarregando[k]) return;
  S.EXcarregando[k] = true;
  api('GET', '/executivo?dias=' + S.dias + '&unidade=' + encodeURIComponent(S.unidade || '')).then(function (r) { S.EX[k] = r; S.EXfresh[k] = true; S.EXcarregando[k] = false; if (S.aba === 'analises') desenhar(true); })
    .catch(function (e) { S.EXcarregando[k] = false; aviso('Não consegui calcular a visão executiva: ' + e.message, 'erro'); });
}

/* ------------------------------------------------------------------ cabeçalho e abas da área Análises */
function nomesResponsaveis() {
  var l = listaAtendentes().slice();
  if (S.D && S.D.leads.some(function (x) { return !x.atendente; })) l.push('Sem responsável');
  return l;
}
function periodoSeg() {
  return h('div', { class: 'seg', role: 'group', 'aria-label': 'Período' }, [14, 30, 90].map(function (d) {
    return h('button', { type: 'button', 'aria-pressed': String(S.dias === d), onclick: function () { mudarPeriodo(d); }, text: d + ' dias' });
  }));
}
function cabecalhoAnalises() {
  var controles = [];
  if (S.anTab === 'executivo') {
    var un = unidadesConhecidas();
    controles.push(h('select', { class: 'in', 'aria-label': 'Unidade', onchange: function (e) { S.unidade = e.target.value; desenhar(true); } }, [h('option', { value: '', text: 'Todas as unidades' })].concat(un.map(function (u) { return h('option', { value: u, text: u, selected: S.unidade === u ? 'selected' : null }); }))));
  }
  controles.push(periodoSeg());
  controles.push(h('button', { class: 'btn', type: 'button', title: 'Recalcular com os dados mais recentes', onclick: function () { carregar().then(function () { aviso('Dados atualizados.', 'ok'); }); } }, [ico('bolt', 16), 'Atualizar']));
  var sub = S.anTab === 'executivo' ? 'Receita, previsão, riscos e gargalos do comercial. Todos os números vêm do CRM.' : S.anTab === 'evolucao' ? 'Como o atendimento evolui no tempo.' : 'Sua performance individual, pronta para compartilhar com a diretoria.';
  return [
    h('header', { class: 'tela-h' }, [h('div', null, [h('h1', { text: 'Análises' }), h('p', { text: sub })]), h('div', { class: 'tela-ac' }, controles)]),
    h('div', { class: 'tabs-an', role: 'tablist' }, ABAS_AN.map(function (a) {
      return h('button', { class: 'tab-an', type: 'button', role: 'tab', 'aria-selected': String(S.anTab === a[0]), onclick: function () { S.anTab = a[0]; gravarLS('crm-antab', a[0]); desenhar(true); }, text: a[1] });
    }))
  ];
}
function telaAnalises() {
  if (!S.D.leads.length) return h('div', { class: 'tela' }, [cabecalhoTela('Análises', 'A evolução do atendimento no tempo.'), boasVindas()]);
  var corpo = S.anTab === 'report' ? corpoReport() : S.anTab === 'evolucao' ? corpoEvolucao() : corpoExecutivo();
  return h('div', { class: 'tela hoje analises' + (S.anTab === 'executivo' ? ' modo-exe' : S.anTab === 'report' ? ' modo-exe modo-rep' : '') }, [cabecalhoAnalises(), corpo]);
}

/* ------------------------------------------------------------------ cockpit: receita, medidores e fluxo */
function chipDeltaDias(v) {
  if (v === null || v === undefined) return h('span', { class: 'dlt neutro', text: 'sem base anterior' });
  var bom = v < 0;
  return h('span', { class: 'dlt ' + (v === 0 ? 'neutro' : bom ? 'bom' : 'ruim') }, [h('i', { 'aria-hidden': 'true', text: v === 0 ? '■' : v > 0 ? '▲' : '▼' }), (v >= 0 ? '+' : '−') + nf1.format(Math.abs(v)) + ' d', h('em', { text: ' vs. período anterior' })]);
}
function cockpitHero(E) {
  var K = E.kpis, R = K.receita, S2 = E.receitaSerie;
  var num = h('div', { class: 'cx-num' }); contar(num, R.valor, brl2);
  var pilula = R.deltaPct === null ? h('span', { class: 'cx-pill', text: 'sem período anterior para comparar' }) : h('span', { class: 'cx-pill ' + (R.deltaPct >= 0 ? 'bom' : 'ruim') }, [h('i', { 'aria-hidden': 'true', text: R.deltaPct >= 0 ? '▲' : '▼' }), (R.deltaPct >= 0 ? '+' : '−') + (Math.abs(R.deltaPct) > 999 ? '999%+' : nf1.format(Math.abs(R.deltaPct)) + '%') + ' vs. período anterior']);
  var mix = h('div', { class: 'cx-mix' }, [
    empilhada([{ rotulo: 'Convertido ativo', valor: R.ativo.valor, cor: 'var(--g3)' }, { rotulo: 'Convertido orgânico', valor: R.organico.valor, cor: 'var(--g1)' }], { semLegenda: true }),
    h('div', { class: 'cx-mix-l' }, [
      h('span', null, [h('i', { style: 'background:var(--g3)' }), 'Ativo ', h('b', { text: brl2(R.ativo.valor) }), h('em', { text: ' · ' + R.ativo.n + ' · ' + Math.round(R.valor ? R.ativo.valor / R.valor * 100 : 0) + '%' })]),
      h('span', null, [h('i', { style: 'background:var(--g1)' }), 'Orgânico ', h('b', { text: brl2(R.organico.valor) }), h('em', { text: ' · ' + R.organico.n + ' · ' + Math.round(R.valor ? R.organico.valor / R.valor * 100 : 0) + '%' })])
    ])
  ]);
  var esq = h('div', { class: 'cx-l' }, [
    h('small', { class: 'cx-eyebrow', text: 'RECEITA CONVERTIDA · ÚLTIMOS ' + E.dias + ' DIAS · ' + (E.unidade ? E.unidade.toUpperCase() : 'TODAS AS UNIDADES') }),
    num,
    h('div', { class: 'cx-sub' }, [pilula, h('span', { text: R.n + ' ' + plural(R.n, 'orçamento ganho', 'orçamentos ganhos') })]),
    mix,
    h('div', { class: 'cx-curva' }, areaGradiente({ rotulos: S2.rotulos, titulos: S2.titulos, valores: S2.acumulado, porPonto: S2.porPonto, fmt: brl, cor: 'var(--g3)', cor2: 'var(--g1)', altura: 150, nomeAcum: 'receita acumulada', nomePonto: 'convertido no ponto', aria: 'Receita convertida acumulada no período' }))
  ]);
  var pv = K.previsao, cv = K.conversao, vl = K.velocidade, pp = K.pipeline;
  var dir = h('div', { class: 'cx-r' }, [
    medidor({ rotulo: 'Conversão', pct: cv.taxa || 0, centro: pct(cv.taxa), sub: cv.convertidos + ' de ' + cv.recebidos, cor1: 'var(--g1)', cor2: 'var(--g3)', dica: { titulo: 'Conversão', linhas: [{ valor: String(cv.convertidos), rotulo: 'convertidos' }, { valor: String(cv.recebidos), rotulo: 'leads recebidos no período' }, { valor: cv.deltaPP === null ? '–' : (cv.deltaPP >= 0 ? '+' : '−') + nf1.format(Math.abs(cv.deltaPP)) + ' p.p.', rotulo: 'vs. período anterior' }] } }),
    medidor({ rotulo: 'Previsão ponderada', pct: pv.pctDoAberto || 0, centro: brlCompacto(pv.valor), sub: pv.pctDoAberto === null ? '' : pv.pctDoAberto + '% do aberto', cor1: 'var(--g5)', cor2: 'var(--c-aberto)', dica: { titulo: 'Previsão ponderada', linhas: [{ valor: brl2(pv.valor), rotulo: 'valor × taxa histórica por etapa' }, { valor: pv.pctDoAberto === null ? '–' : pv.pctDoAberto + '%', rotulo: 'do valor em aberto' }] } }),
    h('div', { class: 'cx-tile' }, [h('small', { text: 'PIPELINE EM ABERTO' }), h('b', { text: brl2(pp.valor) }), h('span', { text: pp.n + ' ' + plural(pp.n, 'oportunidade ativa', 'oportunidades ativas') }), h('em', { text: pp.multiplo === null ? 'sem receita para comparar' : nf1.format(pp.multiplo) + '× a receita realizada' })]),
    h('div', { class: 'cx-tile' }, [h('small', { text: 'VELOCIDADE DE VENDA' }), h('b', { text: vl.mediana === null ? '–' : nf1.format(vl.mediana) + ' d' }), h('span', { text: 'Mediana até ganhar · ' + vl.n + ' ' + plural(vl.n, 'amostra', 'amostras') }), chipDeltaDias(vl.deltaDias)])
  ]);
  return h('section', { class: 'cx-hero' }, [esq, dir]);
}

function briefing(E) {
  var cfg = { risco: ['◆', 'Risco imediato'], atencao: ['▲', 'Atenção'], info: ['■', 'Informação'] };
  var pipe = E.kpis.pipeline.valor || 1;
  return h('div', { class: 'briefing' }, E.alertas.slice(0, 3).map(function (a) {
    var c = cfg[a.nivel];
    var acao = a.leadIds ? botao(a.acao, 'brief-b', function () { abrirLista(a.titulo, a.leadIds); }, 'arrow') : h('p', { class: 'brief-a' }, [h('b', { text: 'Ação: ' }), a.acao]);
    return h('article', { class: 'brief b-' + a.nivel }, [
      h('div', { class: 'brief-h' }, [h('span', { class: 'brief-i', 'aria-hidden': 'true', text: c[0] }), h('div', null, [h('small', { text: c[1] }), h('span', { class: 'al-tag', text: a.tag })])]),
      h('h4', { text: a.titulo }), h('p', { text: a.texto }),
      a.valor ? h('div', { class: 'brief-m' }, [h('div', null, h('i', { style: 'width:' + Math.min(100, a.valor / pipe * 100) + '%' })), h('small', { text: brl(a.valor) + ' em jogo · ' + nf0.format(Math.min(100, a.valor / pipe * 100)) + '% do pipeline' })]) : null,
      acao
    ]);
  }));
}

function cartaoFluxo(E) {
  var F = E.fluxo;
  var cores = { rec: 'var(--g5)', resp: 'var(--g1)', semresp: 'var(--g6)', ativo: 'var(--g3)', organico: 'var(--f0)', andamento: 'var(--c-aberto)', descartado: 'var(--bad)' };
  return blocoCartao('Para onde foi o dinheiro', 'Os orçamentos dos leads recebidos no período: se responderam e o que são hoje. A espessura é o valor em R$.',
    sankey({ nos: F.nos.map(function (n) { return { id: n.id, col: n.col, rotulo: n.rotulo }; }), links: F.links, cores: cores, total: F.totalValor || 1, altura: 330, aria: 'Fluxo do dinheiro dos leads recebidos' }), 8, destaqueNum(brlCompacto(F.totalValor), F.totalN + ' leads recebidos'), 'sec-fluxo');
}
function cartaoRanking(E) {
  var r = E.ranking, total = soma(r.map(function (p) { return p.valor; })), max = r.length ? r[0].valor : 1;
  var corpo = r.length ? h('div', null, [
    h('div', { class: 'share' }, [empilhada(r.map(function (p, i) { return { rotulo: p.nome, valor: p.valor, cor: CORES_CAT[i % CORES_CAT.length] }; }), { semLegenda: true }), h('small', { text: 'Participação de cada responsável na receita convertida' })]),
    h('div', { class: 'race' }, r.slice(0, 6).map(function (p, i) {
      var row = h('div', { class: 'race-r' }, [
        h('span', { class: 'race-n', text: String(i + 1) }), avatar(p.nome),
        h('div', { class: 'race-b' }, [h('div', { class: 'race-t' }, [h('b', { text: p.nome }), h('span', { text: brl(p.valor) })]), h('div', { class: 'race-f' }, h('i', { style: 'width:' + Math.max(3, p.valor / max * 100) + '%;background:linear-gradient(90deg,' + CORES_CAT[i % CORES_CAT.length] + ',color-mix(in srgb,' + CORES_CAT[i % CORES_CAT.length] + ' 45%,transparent))' }))])
      ]);
      ligarTip(row, function () { return { titulo: p.nome, linhas: [{ valor: brl(p.valor), rotulo: pct(total ? p.valor / total * 100 : 0) + ' da receita' }, { valor: String(p.n), rotulo: plural(p.n, 'conversão', 'conversões') }] }; });
      return row;
    })),
    h('p', { class: 'mut peq', text: 'Pelo campo "Responsável" do lead: quem cuida do lead hoje.' })
  ]) : vazio('Ninguém converteu no período.');
  return blocoCartao('Quem mais converteu', 'Valor convertido por responsável.', corpo, 4, null, 'sec-ranking');
}

/* ------------------------------------------------------------------ quadro de decisão (três faixas por prioridade) */
var LANES = [['Risco', 'var(--bad)', '◆', 'Atrasados ou fora do prazo'], ['Atenção', 'var(--warn)', '▲', 'Perto de estourar o prazo'], ['Oportunidade', 'var(--ok)', '●', 'Em dia, prontos para avançar']];
function quadroDecisao(E) {
  var corpo = h('div', { class: 'lanes' });
  var cont = h('span', { class: 'pill pl-motivo' });
  function montar() {
    var q = semAcento(S.filaQ || ''), total = 0;
    limpar(corpo);
    LANES.forEach(function (ln) {
      var rs = E.fila.filter(function (f) { return f.prioridade === ln[0] && (!q || semAcento(f.nome + ' ' + f.unidade + ' ' + f.etapa).indexOf(q) >= 0); });
      total += rs.length;
      var valor = soma(rs.map(function (f) { return f.valor; })), tudo = S.laneTudo && S.laneTudo[ln[0]], mostra = tudo ? rs : rs.slice(0, 5);
      var lista = h('div', { class: 'lane-l' }, mostra.length ? mostra.map(function (f) {
        var c = h('article', { class: 'lc', tabindex: '0' }, [
          h('div', { class: 'lc-t' }, [avatar(f.nome), h('div', null, [h('b', { text: f.nome }), h('small', { text: f.unidade })]), h('strong', { text: brlCompacto(f.valor) })]),
          h('div', { class: 'lc-m' }, [h('span', { class: 'lc-e', text: f.etapa }), h('span', { class: 'lc-p', title: 'Dias sem movimentação', text: f.parado + 'd parado' })]),
          h('div', { class: 'lc-a' }, [ico('arrow', 13), f.proxima])
        ]);
        c.addEventListener('click', function () { abrirLead(f.id); });
        c.addEventListener('keydown', function (e) { if (e.key === 'Enter') abrirLead(f.id); });
        return c;
      }) : [h('p', { class: 'vazio-linha', text: 'Nenhum card nesta faixa.' })]);
      if (rs.length > 5) lista.appendChild(h('button', { class: 'mini lane-mais', type: 'button', onclick: function () { S.laneTudo = S.laneTudo || {}; S.laneTudo[ln[0]] = !tudo; montar(); }, text: tudo ? 'Mostrar menos' : 'Ver os ' + rs.length + ' cards' }));
      corpo.appendChild(h('section', { class: 'lane', style: '--lc:' + ln[1] }, [
        h('header', null, [h('span', { class: 'lane-i', 'aria-hidden': 'true', text: ln[2] }), h('div', null, [h('b', { text: ln[0] }), h('small', { text: ln[3] })]), h('div', { class: 'lane-n' }, [h('b', { text: String(rs.length) }), h('small', { text: brlCompacto(valor) })])]),
        lista
      ]));
    });
    cont.textContent = total + ' ' + plural(total, 'oportunidade', 'oportunidades');
  }
  var busca = h('input', { class: 'in', type: 'search', placeholder: 'Buscar paciente, unidade ou etapa…', value: S.filaQ || '', 'aria-label': 'Buscar no quadro' });
  busca.addEventListener('input', function () { S.filaQ = busca.value; montar(); });
  montar();
  return blocoCartao('Quadro de decisão', 'Cada card é um orçamento em andamento, separado pelo risco. Ordenado por valor e tempo sem movimentação.', h('div', null, [h('div', { class: 'filtros' }, [busca]), corpo]), 12, cont, 'sec-decisao');
}

/* ------------------------------------------------------------------ ritmo, previsão e pipeline */
function cartaoRitmo(E) {
  var R = E.ritmo;
  return blocoCartao('Ritmo de entrada e conversão', 'Leads por data de entrada e a etapa em que estão hoje.', h('div', null, [
    colunasAgrupadas({ rotulos: R.rotulos, titulos: R.titulos, altura: 200, aria: 'Leads por data de entrada', series: [{ nome: 'Recebidos', cor: COR_ORC, valores: R.todos }, { nome: 'Convertido ativo', cor: 'var(--g3)', valores: R.ativo }, { nome: 'Convertido orgânico', cor: 'var(--g1)', valores: R.organico }] }),
    h('small', { class: 'sub-t', text: 'QUANTO DE CADA DATA JÁ VIROU GANHO' }),
    linhasTempo({ rotulos: R.rotulos, titulos: R.titulos, altura: 130, area: true, pct: true, fmt: function (v) { return nf0.format(v) + '%'; }, aria: 'Participação convertida por data', series: [{ nome: 'Convertidos ÷ recebidos', cor: 'var(--g4)', valores: R.participacao }] })
  ]), 7, null, 'sec-ritmo');
}
function cartaoPrevisao(E) {
  var P = E.previsaoEtapas, maxV = Math.max.apply(null, P.map(function (p) { return p.valor; }).concat([1]));
  return blocoCartao('Previsão de fechamento', 'Barra clara: valor em aberto. Barra cheia: quanto se espera fechar, pela taxa histórica real de cada etapa.', h('div', null, [
    h('div', { class: 'bul' }, P.map(function (p) {
      var row = h('div', { class: 'bul-r' }, [
        h('div', { class: 'bul-h' }, [h('b', { text: p.rotulo }), h('span', { class: 'bul-w' + (p.peso === null ? ' sem' : ''), text: p.peso === null ? 'sem amostra' : nf0.format(p.peso) + '% de chance' })]),
        h('div', { class: 'bul-b' }, [h('i', { class: 'fan', style: 'width:' + Math.max(1.5, p.valor / maxV * 100) + '%' }), h('i', { class: 'esp', style: 'width:' + (p.esperado / maxV * 100) + '%' })]),
        h('div', { class: 'bul-v' }, [h('b', { text: brl(p.esperado) }), h('span', { text: ' de ' + brl(p.valor) + ' · ' + p.n + ' ' + plural(p.n, 'lead', 'leads') })])
      ]);
      ligarTip(row, function () { return { titulo: p.rotulo, linhas: [{ valor: p.n + ' leads', rotulo: brl(p.valor) + ' em aberto' }, { valor: p.peso === null ? '–' : nf1.format(p.peso) + '%', rotulo: 'taxa histórica de conversão' }, { valor: String(p.amostra), rotulo: 'leads resolvidos na amostra' }, { valor: brl(p.esperado), rotulo: 'valor esperado' }], nota: p.peso === null ? 'Menos de 5 leads resolvidos: sem peso, para não inventar número.' : '' }; });
      return row;
    })),
    h('p', { class: 'mut peq', text: 'Ganho = convertido ativo ou orgânico. Etapas com menos de 5 leads resolvidos ficam sem peso.' })
  ]), 5, destaqueNum(brlCompacto(E.kpis.previsao.valor), 'esperado'), 'sec-previsao');
}
function cartaoFunilDegraus(E) {
  var cor = ['var(--f0)', 'var(--f1)', 'var(--f2)', 'var(--f3)', 'var(--f4)', 'var(--c-agend)', 'var(--g2)', 'var(--g3)'];
  var itens = E.pipelineEtapas.filter(function (p) { return p.n > 0; }).map(function (p, i) {
    return { rotulo: p.etapa, n: p.n, valor: p.valor, cor: cor[i % cor.length], extra: brlCompacto(p.valor) + (p.peso !== null ? ' · ' + nf0.format(p.peso) + '%' : ''), dica: [{ valor: p.n + ' leads', rotulo: brl(p.valor) + ' em orçamentos' }].concat(p.peso !== null ? [{ valor: nf0.format(p.peso) + '%', rotulo: 'taxa histórica de conversão' }] : []) };
  });
  return blocoCartao('Pipeline em degraus', 'Quantos orçamentos estão em cada etapa agora. A largura é o volume; à direita, o valor e a chance histórica de ganho.', degraus({ itens: itens, aria: 'Funil de orçamentos por etapa' }), 7, destaqueNum(String(E.kpis.pipeline.n), 'leads ativos'), 'sec-pipe');
}
function cartaoNoShowExec(E) {
  var N = E.noshow, passos = N.etapas;
  var cor = { 'No-show': COR_NS, 'Retomada': 'var(--f1)', 'Agendado': 'var(--g2)', 'Perdido': 'var(--bad)', 'Sem retorno': 'var(--g6)', 'Recuperado': 'var(--g3)' };
  var corpo = N.entraram ? h('div', null, [
    h('div', { class: 'ns-top' }, [
      medidor({ rotulo: 'Recuperação', tam: 120, pct: N.pctRecuperacao || 0, centro: pct(N.pctRecuperacao), sub: N.recuperados + ' de ' + N.entraram, cor1: 'var(--warn)', cor2: 'var(--g3)' }),
      h('div', { class: 'ns-v' }, [h('small', { text: 'RECUPERADO EM ORÇAMENTOS' }), h('b', { text: brl2(N.valorRecuperado) }), h('em', { text: N.entraram + ' ' + plural(N.entraram, 'no-show', 'no-shows') + ' no período' })])
    ]),
    h('div', { class: 'stepper' }, passos.map(function (p) {
      var s = h('div', { class: 'st', style: '--sc:' + cor[p.etapa] }, [h('i', { 'aria-hidden': 'true' }), h('b', { text: String(p.n) }), h('small', { text: p.etapa }), h('em', { text: nf0.format(p.pct) + '%' })]);
      ligarTip(s, function () { return { titulo: p.etapa, linhas: [{ cor: cor[p.etapa], valor: String(p.n), rotulo: nf0.format(p.pct) + '% dos no-shows' }] }; });
      return s;
    }))
  ]) : vazio('Nenhum no-show no período.');
  return blocoCartao('Recuperação de no-show', 'O caminho de quem faltou: da falta até voltar a comparecer.', corpo, 5, null, 'sec-noshow');
}

/* ------------------------------------------------------------------ envelhecimento, unidades e dinheiro */
function cartaoRaias(E) {
  var modo = S.envModo || 'orc', Ev = E.envelhecimento;
  var pontos = modo === 'orc' ? Ev.pontos.orcamentos : Ev.pontos.noshow, crit = modo === 'orc' ? Ev.criticosOrcamentos : Ev.criticosNoshow;
  var alterna = h('div', { class: 'seg peq', role: 'group', 'aria-label': 'Pipeline' }, [['orc', 'Orçamentos'], ['ns', 'No-show']].map(function (m) {
    return h('button', { type: 'button', 'aria-pressed': String(modo === m[0]), onclick: function () { S.envModo = m[0]; desenhar(true); }, text: m[1] });
  }));
  return blocoCartao('Quem está parado, e há quanto tempo', 'Cada bolha é um card, na linha da sua etapa e na posição dos dias sem avanço. O tamanho é o valor. Clique para abrir.', h('div', null, [
    raias({ pontos: pontos, etapas: modo === 'orc' ? ETAPAS_ORC : ETAPAS_NS, vazio: 'Nenhum card parado.' }),
    h('p', { class: 'calor-nota' }, [h('b', { text: crit + ' card(s)' }), ' parados há mais de 10 dias, na faixa mais crítica.'])
  ]), 12, alterna, 'sec-raias');
}
function corEtapa(rotulo) {
  if (rotulo === 'Em aberto' || rotulo === 'Primeiro contato') return 'var(--c-aberto)';
  if (rotulo === 'Nova tentativa' || rotulo === 'Desconto' || rotulo === 'Sem retorno') return 'var(--c-sem)';
  if (rotulo === 'Retorno personalizado' || rotulo === 'Em negociação') return 'var(--c-neg)';
  if (rotulo === 'Agendado') return 'var(--c-agend)';
  if (/Convertido/.test(rotulo)) return 'var(--g3)';
  return 'var(--bad)';
}
function cartaoUnidadesExec(E) {
  var U = E.unidadesBolhas, modo = S.unModo || 'orc';
  var dados = modo === 'orc' ? U.orcamentos : U.noshow, melhor = modo === 'orc' ? U.melhorOrcamentos : U.melhorNoshow;
  var alterna = h('div', { class: 'seg peq', role: 'group', 'aria-label': 'Pipeline' }, [['orc', 'Orçamentos'], ['ns', 'No-show']].map(function (m) {
    return h('button', { type: 'button', 'aria-pressed': String(modo === m[0]), onclick: function () { S.unModo = m[0]; desenhar(true); }, text: m[1] });
  }));
  return blocoCartao('Unidades em quadrantes', 'Volume × ' + (modo === 'orc' ? 'conversão' : 'recuperação') + '. O tamanho é o ' + (modo === 'orc' ? 'valor convertido' : 'valor recuperado') + '. As linhas tracejadas são as médias.', h('div', null, [
    bolhas({ pontos: dados.map(function (d) { return { nome: d.nome, x: d.volume, y: d.taxa, r: d.receita, convertidos: d.convertidos }; }), yPct: true, quadrantes: true, cor: modo === 'orc' ? 'var(--g5)' : COR_NS, rotuloX: modo === 'orc' ? 'Leads recebidos' : 'No-shows', rotuloY: modo === 'orc' ? 'Conversão' : 'Recuperação', aria: 'Unidades: volume e conversão',
      dica: function (p) { return [{ valor: nf0.format(p.x), rotulo: modo === 'orc' ? 'leads recebidos' : 'no-shows' }, { valor: pct(p.y), rotulo: modo === 'orc' ? 'conversão' : 'recuperação' }, { valor: String(p.convertidos), rotulo: modo === 'orc' ? 'convertidos' : 'recuperados' }, { valor: brl(p.r), rotulo: modo === 'orc' ? 'receita convertida' : 'valor recuperado' }]; }, vazio: 'Sem dados de unidades no período. Informe a unidade ao cadastrar os leads.' }),
    melhor ? h('p', { class: 'calor-nota' }, [h('b', { text: melhor.toUpperCase() }), ' combina o melhor volume × conversão no período.']) : null
  ]), 7, alterna, 'sec-unidades');
}
function cartaoDinheiroExec(E) {
  var D = E.dinheiro;
  var itens = D.etapas.filter(function (e) { return e.valor > 0; }).map(function (e) { return { rotulo: e.etapa.replace(' (período)', ''), valor: e.valor, cor: e.tipo === 'ganho' ? 'var(--g3)' : e.tipo === 'perdido' ? 'var(--bad)' : corEtapa(e.etapa), extra: e.tipo === 'ganho' ? 'Convertido no período' : e.tipo === 'perdido' ? 'Descartado no período' : 'Ainda em andamento' }; });
  return blocoCartao('Mapa do dinheiro', 'A área de cada bloco é o valor: o que está na mesa, o que virou receita e o que se perdeu.', h('div', null, [
    treemap({ itens: itens, altura: 290, aria: 'Mapa do dinheiro por etapa' }),
    h('div', { class: 'notas2' }, [
      D.concentracao ? h('p', null, [h('b', { text: 'Maior concentração: ' }), D.concentracao.etapa.toUpperCase() + ' (' + D.concentracao.pct + '% do aberto).']) : null,
      h('p', { class: D.vencidoN ? 'ruim' : '' }, [h('b', { text: brl2(D.vencidoValor) }), ' já passaram do tempo esperado na etapa.'])
    ])
  ]), 5, null, 'sec-dinheiro');
}
function cartaoEquipeTiles(E) {
  var A = E.atividade, totRec = soma(A.map(function (a) { return a.receita; })) || 1, maxM = Math.max.apply(null, A.map(function (a) { return a.movimentos; }).concat([1]));
  return blocoCartao('Atividade por login', 'Movimentações registradas no período e o valor convertido atribuído a cada responsável. O anel é a fatia da receita.', A.length ? h('div', { class: 'eq-g' }, A.map(function (a, i) {
    var t = h('article', { class: 'eq-t' }, [
      anel({ titulo: '', tam: 76, pct: a.receita / totRec * 100, centro: iniciais(a.nome), sub: '', cor: CORES_CAT[i % CORES_CAT.length], dica: { titulo: a.nome, linhas: [{ valor: brl(a.receita), rotulo: pct(a.receita / totRec * 100) + ' da receita' }] } }),
      h('div', { class: 'eq-i' }, [h('b', { text: a.nome }), h('strong', { text: brl(a.receita) }),
        h('div', { class: 'eq-mov' }, [h('i', { style: 'width:' + (a.movimentos / maxM * 100) + '%' })]),
        h('small', { text: a.movimentos + ' movimentações · ' + a.contatos + ' contatos · ' + a.respostas + ' respostas · ' + a.agendamentos + ' agend.' })])
    ]);
    return t;
  })) : vazio('Sem movimentações no período.'), 12, null, 'sec-login');
}

function corpoExecutivo() {
  pedirExec();
  var E = S.EX[S.dias + '|' + (S.unidade || '')];
  if (!E) return esqueleto();
  return h('div', { class: 'exe' }, [
    cockpitHero(E), briefing(E),
    h('div', { class: 'g12' }, [cartaoFluxo(E), cartaoRanking(E)]),
    quadroDecisao(E),
    h('div', { class: 'g12' }, [cartaoRitmo(E), cartaoPrevisao(E)]),
    h('div', { class: 'g12' }, [cartaoFunilDegraus(E), cartaoNoShowExec(E)]),
    cartaoRaias(E),
    h('div', { class: 'g12' }, [cartaoUnidadesExec(E), cartaoDinheiroExec(E)]),
    cartaoEquipeTiles(E),
    h('p', { class: 'rodape-n', text: 'Ganho = convertido ativo (compareceu e pagou) ou orgânico (já foi à recepção). A previsão usa só taxas reais do histórico; etapas com poucos casos ficam sem peso.' })
  ]);
}
`;
