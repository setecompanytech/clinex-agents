/** Abas do modal de etapa do fluxo (cliente): Detalhes, Painel (gráficos) e Insights (narrativa). Sem backticks nem dólar-chave aqui dentro. */
export const etapa = String.raw`
/* ------------------------------------------------------------------ modal da etapa: abas */
var ETc = {};
var COR_ST = { aberto: 'var(--c-aberto)', sem_retorno: 'var(--c-sem)', negociacao: 'var(--c-neg)', agendado: 'var(--c-agend)', convertido_ativo: 'var(--c-ativo)', convertido_organico: 'var(--c-org)', descarte: 'var(--c-desc)' };

function pedirEtapa(id) {
  var k = id + '|' + S.dias, c = ETc[k];
  if (c && Date.now() - c.t < 15000) return Promise.resolve(c.E);
  return api('GET', '/etapa/' + id + '?dias=' + S.dias).then(function (E) { ETc[k] = { t: Date.now(), E: E }; return E; });
}

function montarItem(it) {
  var host = h('div', { class: 'it-host' });
  var defs = [['detalhes', 'Detalhes', 'list'], ['painel', 'Painel', 'chart'], ['insights', 'Insights', 'bolt']];
  var botoes = {};
  var barra = h('div', { class: 'it-abas', role: 'tablist' });
  function mostrar(id) {
    S.itAba = id;
    defs.forEach(function (d) { botoes[d[0]].setAttribute('aria-selected', d[0] === id ? 'true' : 'false'); });
    limpar(host);
    if (itemModal) itemModal.corpo.scrollTop = 0;
    if (id === 'detalhes') { kids(host, corpoItem(it)); return; }
    host.appendChild(h('div', { class: 'it-carrega' }, [h('i'), h('i'), h('i')]));
    pedirEtapa(it.id).then(function (E) {
      if (S.itAba !== id || !itemModal || itemModal.itemId !== it.id) return;
      limpar(host);
      kids(host, id === 'painel' ? painelEtapa(it, E, function () { mostrar(id); }) : insightsEtapa(it, E, function () { mostrar(id); }));
    }).catch(function (e) { limpar(host); host.appendChild(vazio('Não consegui carregar a análise', e.message)); });
  }
  defs.forEach(function (d) {
    botoes[d[0]] = h('button', { type: 'button', role: 'tab', class: 'it-aba', 'aria-selected': 'false', onclick: function () { mostrar(d[0]); } }, [ico(d[2], 16), d[1]]);
    barra.appendChild(botoes[d[0]]);
  });
  mostrar(S.itAba && ['detalhes', 'painel', 'insights'].indexOf(S.itAba) >= 0 ? S.itAba : 'detalhes');
  return [barra, host];
}

function periodoEtapa(refazer) {
  return h('div', { class: 'it-tool' }, [
    h('span', { text: 'Período analisado' }),
    h('div', { class: 'seg', role: 'group', 'aria-label': 'Período' }, [14, 30, 90].map(function (d) {
      return h('button', { type: 'button', 'aria-pressed': String(S.dias === d), text: d + ' dias', onclick: function () { S.dias = d; gravarLS('crm-dias', String(d)); refazer(); } });
    }))
  ]);
}

/* ------------------------------------------------------------------ aba Painel */
function painelEtapa(it, E, refazer) {
  var A = E.agora, F = E.fluxo, C = E.contatos, nov = E.item.id === 'lead';
  var kp = [];
  if (nov) {
    var med = Math.round(F.entradas / E.dias * 10) / 10;
    kp.push(kpi2({ rotulo: 'Leads que entraram', valor: String(F.entradas), delta: dlt(F.entradas, F.entradasAnt, { bom: 'sobe' }), serie: F.serie.entradas, cor: COR.novos }));
    kp.push(kpi2({ rotulo: 'Média por dia', valor: String(med).replace('.', ','), sub: 'nos últimos ' + E.dias + ' dias' }));
    kp.push(kpi2({ rotulo: 'Origem principal', valor: E.origem[0] ? E.origem[0].nome : '–', sub: E.origem[0] ? E.origem[0].n + ' leads' : 'sem dados' }));
  } else {
    kp.push(kpi2({ rotulo: 'Aqui agora', valor: String(A.n), sub: brl(A.valor) + ' em orçamentos', tom: A.estourados ? 'risco' : '' }));
    kp.push(kpi2({ rotulo: 'Entraram', valor: String(F.entradas), delta: dlt(F.entradas, F.entradasAnt, { bom: 'sobe' }), serie: F.serie.entradas, cor: COR.novos }));
    kp.push(kpi2({ rotulo: 'Saíram', valor: String(F.saidas), sub: F.avancaram + ' avançaram · ' + F.descartaram + ' descartados', serie: F.serie.saidas, cor: COR.convertidos }));
    kp.push(kpi2({ rotulo: 'Taxa de avanço', valor: F.taxaAvanco === null ? '–' : F.taxaAvanco + '%', sub: F.taxaAvanco === null ? 'sem saídas ainda' : 'de quem sai da etapa', tom: F.taxaAvanco !== null && F.taxaAvanco < 40 ? 'risco' : '' }));
    kp.push(kpi2({ rotulo: 'Tempo médio na etapa', valor: F.tempoMedio === null ? '–' : String(F.tempoMedio).replace('.', ',') + ' d', sub: E.item.limiteDias ? 'limite do guia: ' + E.item.limiteDias + ' d' : 'sem limite fixo', tom: E.item.limiteDias && F.tempoMedio > E.item.limiteDias ? 'risco' : '' }));
    if (C.tem) kp.push(kpi2({ rotulo: 'Taxa de resposta', valor: C.taxaResposta === null ? '–' : C.taxaResposta + '%', sub: C.total + ' contatos no período' }));
  }
  var cartoes = [];
  var sufixoT = E.semanal ? 'por semana' : 'por dia';
  var linhas = [{ nome: 'Saíram da etapa', cor: COR.convertidos, valores: F.serie.saidas }];
  if (C.tem && C.total) linhas.push({ nome: 'Contatos feitos', cor: COR.contatos, valores: C.serie });
  cartoes.push(blocoCartao(nov ? 'Entrada de leads' : 'Entradas e saídas', (nov ? 'Leads novos ' : 'Quem entrou na etapa (colunas) e quem saiu (linhas), ') + sufixoT + '.', composto({
    rotulos: E.rotulos, titulos: E.titulos, altura: 250, aria: 'Entradas e saídas da etapa',
    colunas: [{ nome: 'Entraram', cor: COR.novos, valores: F.serie.entradas }], linhas: nov ? [] : linhas
  }), nov ? 12 : 8, destaqueNum(F.entradas + (nov ? '' : ' → ' + F.saidas), nov ? 'leads no período' : 'entraram → saíram')));
  if (nov) {
    cartoes.push(blocoCartao('De onde vêm os leads', 'Origem dos leads que entraram no período.', barras(E.origem.map(function (o, i) { return { rotulo: o.nome, valor: o.n, cor: ['var(--g1)', 'var(--g5)', 'var(--g4)', 'var(--g3)', 'var(--g2)'][i % 5] }; }), { vazio: 'Nenhum lead entrou no período.' }), 12));
  } else {
    if (F.destinos.length) cartoes.push(blocoCartao('Para onde vão', F.destinosHistorico ? 'Ninguém saiu no período; mostrando o histórico.' : 'Destino de quem saiu da etapa no período.', rosca(F.destinos.map(function (d) { return { rotulo: d.rotulo, valor: d.n, cor: COR_ST[d.status] || 'var(--g6)' }; }), { centro: 'saídas' }), 4));
    else cartoes.push(blocoCartao('Para onde vão', 'Destino de quem saiu da etapa.', vazio('Ninguém saiu desta etapa ainda.'), 4));
    if (A.n) {
      var lim = E.item.limiteDias;
      cartoes.push(blocoCartao('Há quanto tempo estão aqui', lim ? 'Leads por tempo na etapa. O guia dá ' + lim + ' dia' + (lim === 1 ? '' : 's') + ' de limite.' : 'Leads por tempo na etapa.', barras(A.faixas.map(function (f, i) { return { rotulo: f.rotulo, valor: f.n, texto: String(f.n), extra: brl(f.valor), cor: i >= 4 ? 'var(--bad)' : i === 3 ? 'var(--warn)' : 'var(--g1)' }; }), { max: Math.max.apply(null, A.faixas.map(function (f) { return f.n; }).concat([1])) }), 6, destaqueNum(String(A.estourados + A.quase), 'perto ou acima do prazo')));
      cartoes.push(blocoCartao('Valor por unidade', 'Orçamentos que estão nesta etapa agora.', barras(A.porUnidade.map(function (u) { return { rotulo: u.nome, valor: u.valor, texto: brlCompacto(u.valor), extra: u.n + (u.n === 1 ? ' lead' : ' leads'), cor: 'var(--g5)' }; })), 6));
      cartoes.push(blocoCartao('Valor por responsável', 'Quem está com os orçamentos desta etapa.', barras(A.porAtendente.map(function (u) { return { rotulo: u.nome, valor: u.valor, texto: brlCompacto(u.valor), extra: u.n + (u.n === 1 ? ' lead' : ' leads'), cor: 'var(--g4)' }; })), 6));
      cartoes.push(blocoCartao('Maiores orçamentos aqui', 'Onde está o dinheiro desta etapa. Clique para abrir o lead.', h('div', { class: 'leads-mini' }, A.topValor.map(function (l) {
        return h('button', { class: 'lm', type: 'button', onclick: function () { abrirLead(l.id); } }, [avatar(l.nome), h('span', null, [h('b', { text: l.nome }), h('small', { text: l.dias + (l.dias === 1 ? ' dia' : ' dias') + ' na etapa' })]), pill(brl(l.valor), 'pl-num')]);
      })), 6));
    }
    if (C.tem && C.total) {
      cartoes.push(blocoCartao('Contatos desta etapa', 'Por canal, e quantos leads contatados aqui responderam.', h('div', { class: 'it-cont' }, [
        empilhada([{ rotulo: 'WhatsApp', valor: C.whatsapp, cor: 'var(--g3)' }, { rotulo: 'Ligação', valor: C.ligacao, cor: 'var(--g2)' }]),
        C.taxaResposta !== null ? anel({ pct: C.taxaResposta, titulo: 'Responderam', centro: C.taxaResposta + '%', sub: C.responderam + ' de ' + C.leads, cor: 'var(--g1)', tam: 120 }) : h('p', { class: 'mut peq', text: 'Poucos leads contatados para medir resposta (mínimo 3).' })
      ]), 6));
    }
    if (E.motivos.length) {
      var cores = ['var(--g2)', 'var(--g5)', 'var(--g4)', 'var(--g1)', 'var(--g3)', 'var(--g6)'];
      cartoes.push(blocoCartao('Por que saem por descarte', 'Motivos dos descartes que nasceram nesta etapa (histórico).', rosca(E.motivos.map(function (m, i) { return { rotulo: m.motivo, valor: m.n, cor: cores[i % cores.length], extra: brl(m.valor) + ' em orçamentos' }; }), { centro: 'descartes' }), 6));
    }
  }
  return [periodoEtapa(refazer), h('div', { class: 'kpis it-kpis' }, kp), h('div', { class: 'g12 it-grid' }, cartoes)];
}

/* ------------------------------------------------------------------ aba Insights (narrativa) */
function insightsEtapa(it, E, refazer) {
  var tons = { risco: 'Risco', atencao: 'Atenção', bom: 'Bom sinal', info: 'Informação' };
  var pior = E.insights[0] ? E.insights[0].tom : 'info';
  var saude = pior === 'risco' ? ['Crítica', 'risco'] : pior === 'atencao' ? ['Pede atenção', 'atencao'] : ['Saudável', 'bom'];
  var capa = h('div', { class: 'it-capa t-' + saude[1] }, [
    h('div', null, [h('small', { text: 'Leitura da etapa' }), h('h3', { text: it.titulo })]),
    h('span', { class: 'it-saude' }, [h('i'), saude[0]])
  ]);
  var historia = h('div', { class: 'it-historia' }, E.historia.map(function (c, i) {
    var p = h('p'); agNegrito(p, c.texto);
    return h('article', { class: 'it-cap' }, [h('span', { class: 'it-cap-n', text: String(i + 1) }), h('div', null, [h('h4', { text: c.titulo }), p])]);
  }));
  var cards = h('div', { class: 'it-cards' }, [h('h4', { class: 'it-cards-t', text: 'Em resumo' })].concat(E.insights.map(function (x) {
    return h('div', { class: 'it-ins n-' + x.tom }, [h('em', { text: tons[x.tom] }), h('b', { text: x.titulo }), h('p', { text: x.texto })]);
  })));
  return [periodoEtapa(refazer), capa, h('div', { class: 'it-hist-grid' }, [historia, cards]), h('p', { class: 'mut peq', text: 'Texto gerado a partir dos números reais do CRM no período escolhido. Nada é estimado.' })];
}
`;
