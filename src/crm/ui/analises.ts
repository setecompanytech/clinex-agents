// JavaScript do CRM (navegador): tela Análises, a evolução no tempo. Os números vêm de /painel/crm/api/analise (src/crm/tempo.ts).
// Dentro dele não usar crases nem "dollar-chave".
export const analises = String.raw`
var COR_ETAPA = { aberto: 'var(--c-aberto)', sem_retorno: 'var(--c-sem)', negociacao: 'var(--c-neg)', agendado: 'var(--c-agend)' };

function pedirAnalise(dias) {
  if (S.ANfresh[dias] || S.ANcarregando[dias]) return;
  S.ANcarregando[dias] = true;
  api('GET', '/analise?dias=' + dias).then(function (r) { S.AN[dias] = r; S.ANfresh[dias] = true; S.ANcarregando[dias] = false; if (S.aba === 'analises') desenhar(true); })
    .catch(function (e) { S.ANcarregando[dias] = false; aviso('Não consegui calcular as análises: ' + e.message, 'erro'); });
}

function seletorPeriodo() {
  return h('div', { class: 'seg', role: 'group', 'aria-label': 'Período' }, [14, 30, 90].map(function (d) {
    return h('button', { type: 'button', 'aria-pressed': String(S.dias === d), onclick: function () { S.dias = d; gravarLS('crm-dias', String(d)); pedirAnalise(d); desenhar(true); }, text: d + ' dias' });
  }));
}
function secaoT(titulo, sub) { return h('div', { class: 'sec-t' }, [h('h2', { text: titulo }), sub ? h('p', { text: sub }) : null]); }
function sufixo(T) { return T.semanal ? 'por semana' : 'por dia'; }

function kpiP(T, rotulo, valor, atual, ant, o, serie, cor) {
  return kpi2({ rotulo: rotulo, valor: valor, delta: dlt(atual, ant, { pp: o.pp, bom: o.bom, vs: 'vs. ' + T.dias + ' dias antes' }), serie: serie, cor: cor });
}
function resumoPeriodo(T) {
  var a = T.atual, p = T.anterior, s = T.series;
  return h('div', { class: 'kpis2 seis' }, [
    kpiP(T, 'Leads novos', nf0.format(a.novos), a.novos, p.novos, { bom: 'sobe' }, s.novos, COR.novos),
    kpiP(T, 'Convertidos', nf0.format(a.convertidos), a.convertidos, p.convertidos, { bom: 'sobe' }, s.convertidos, COR.convertidos),
    kpiP(T, 'Conversão', pct(a.taxaConversao), a.taxaConversao, p.taxaConversao, { pp: true, bom: 'sobe' }, semNulos(s.taxas.conversao), COR.convertidos),
    kpiP(T, 'Resposta', pct(a.taxaResposta), a.taxaResposta, p.taxaResposta, { pp: true, bom: 'sobe' }, semNulos(s.taxas.resposta), COR.respostas),
    kpiP(T, 'Valor convertido', brlCompacto(a.valorConvertido), a.valorConvertido, p.valorConvertido, { bom: 'sobe' }, s.valorConv, COR.convertidos),
    kpiP(T, 'Ciclo até converter', a.ciclo === null ? '–' : nf1.format(a.ciclo) + ' d', a.ciclo, p.ciclo, { bom: 'desce' }, semNulos(s.ciclo), 'var(--g4)')
  ]);
}
function destaques(T) {
  return h('section', { class: 'cartao dest-card' }, [
    h('header', { class: 'card-h' }, [h('div', null, [h('h3', { text: 'O que mudou' }), h('p', { text: 'Os últimos ' + T.dias + ' dias comparados com os ' + T.dias + ' anteriores.' })])]),
    h('ul', { class: 'dest-l' }, T.destaques.map(function (d) { return h('li', { class: 'dl-' + d.nivel }, [h('i', { 'aria-hidden': 'true' }), d.texto]); }))
  ]);
}

/* ------------------------------------------------------------------ evolução */
function cartaoPipelineTempo(T) {
  var p = T.series.pipeline, u = T.rotulos.length - 1;
  var total = function (i) { return p.aberto[i] + p.sem_retorno[i] + p.negociacao[i] + p.agendado[i]; };
  var dif = total(u) - total(0);
  return blocoCartao('Pipeline em andamento, etapa por etapa', 'Quantos leads estavam em cada etapa ao fim de cada ' + (T.semanal ? 'semana' : 'dia') + '. O que sobe é acúmulo; o que desce é fluxo saindo.', areaEmpilhada({
    rotulos: T.rotulos, titulos: T.titulos, altura: 270, aria: 'Leads ativos por etapa ao longo do tempo',
    series: [{ nome: 'Em aberto', cor: COR_ETAPA.aberto, valores: p.aberto }, { nome: 'Sem retorno', cor: COR_ETAPA.sem_retorno, valores: p.sem_retorno }, { nome: 'Em negociação', cor: COR_ETAPA.negociacao, valores: p.negociacao }, { nome: 'Agendado', cor: COR_ETAPA.agendado, valores: p.agendado }]
  }), 8, destaqueNum(nf0.format(total(u)) + ' leads', (dif >= 0 ? '+' : '−') + Math.abs(dif) + ' desde o início'));
}
function cartaoValorTempo(T) {
  var v = T.series.pipeline.valor, u = v.length - 1;
  return blocoCartao('Valor em andamento', 'Soma dos orçamentos dos leads ativos.', linhasTempo({
    rotulos: T.rotulos, titulos: T.titulos, altura: 270, area: true, fmt: brlCompacto, aria: 'Valor em orçamentos ativos ao longo do tempo',
    series: [{ nome: 'Valor em andamento', cor: 'var(--g5)', valores: v }]
  }), 4, destaqueNum(brlCompacto(v[u]), 'agora'));
}
function cartaoEntradasSaidas(T) {
  var s = T.series;
  return blocoCartao('Entradas e saídas de leads', 'Leads que entraram (colunas) e como saíram do funil (linhas), ' + sufixo(T) + '.', composto({
    rotulos: T.rotulos, titulos: T.titulos, altura: 250, aria: 'Entradas e saídas de leads',
    colunas: [{ nome: 'Leads novos', cor: COR.novos, valores: s.novos }],
    linhas: [{ nome: 'Convertidos', cor: COR.convertidos, valores: s.convertidos }, { nome: 'Descartados', cor: COR.descartados, valores: s.descartados }],
    extras: [{ nome: 'Orgânicos', cor: 'var(--g4)', valores: s.organicos }]
  }), 6, destaqueNum(soma(s.novos) + ' → ' + soma(s.convertidos), 'novos → convertidos'));
}
function cartaoValorConvPerdido(T) {
  var s = T.series;
  return blocoCartao('Dinheiro convertido x perdido', 'Valor dos orçamentos que viraram paciente e dos que foram descartados, ' + sufixo(T) + '.', colunasAgrupadas({
    rotulos: T.rotulos, titulos: T.titulos, altura: 250, fmt: brlCompacto, aria: 'Valor convertido e perdido',
    series: [{ nome: 'Convertido', cor: COR.convertidos, valores: s.valorConv }, { nome: 'Perdido', cor: COR.descartados, valores: s.valorPerdido }]
  }), 6, destaqueNum(brlCompacto(soma(s.valorConv)), 'convertido no período'));
}
function cartaoTaxas(T) {
  var s = T.series.taxas;
  return blocoCartao('Taxas ao longo do tempo', T.semanal ? 'Resposta, agendamento e conversão, semana a semana.' : 'Resposta, agendamento e conversão, em janela móvel de 7 dias para suavizar o ruído.', linhasTempo({
    rotulos: T.rotulos, titulos: T.titulos, altura: 250, pct: true, fmt: function (v) { return nf0.format(v) + '%'; }, aria: 'Taxas de resposta, agendamento e conversão',
    nota: 'Resposta = respostas ÷ contatos · Agendamento = agendamentos ÷ leads contatados · Conversão = convertidos ÷ encerrados',
    series: [{ nome: 'Resposta', cor: COR.respostas, valores: s.resposta }, { nome: 'Agendamento', cor: COR.agendamentos, valores: s.agendamento }, { nome: 'Conversão', cor: COR.convertidos, valores: s.conversao }]
  }), 7);
}
function cartaoCicloTempo(T) {
  var c = T.series.ciclo, tem = c.some(function (v) { return v !== null; });
  return blocoCartao('Quanto tempo leva até converter', 'Dias médios do D0 até o paciente comparecer e pagar.', tem ? linhasTempo({
    rotulos: T.rotulos, titulos: T.titulos, altura: 250, area: true, fmt: function (v) { return nf1.format(v) + ' d'; }, aria: 'Ciclo médio até converter',
    series: [{ nome: 'Ciclo médio', cor: 'var(--g4)', valores: c }]
  }) : vazio('Ainda sem conversões no período.'), 5);
}
function cartaoCoortes(T) {
  var c = T.coortes;
  var tem = c.some(function (x) { return x.leads > 0; });
  return blocoCartao('Funil por semana de entrada', 'De cada 100 leads que entraram na semana, quantos chegaram a cada etapa. As semanas mais recentes ainda estão amadurecendo.', tem ? linhasTempo({
    rotulos: c.map(function (x) { return x.rotulo; }), titulos: c.map(function (x) { return 'Entraram na semana de ' + x.rotulo + ' (' + x.leads + ' leads)'; }), altura: 260, pct: true, fmt: function (v) { return nf0.format(v) + '%'; }, aria: 'Funil por semana de entrada',
    series: [{ nome: 'Contatados', cor: COR.contatos, valores: c.map(function (x) { return x.contatados; }) }, { nome: 'Responderam', cor: COR.respostas, valores: c.map(function (x) { return x.responderam; }) }, { nome: 'Agendaram', cor: COR.agendamentos, valores: c.map(function (x) { return x.agendaram; }) }, { nome: 'Compareceram', cor: COR.convertidos, valores: c.map(function (x) { return x.compareceram; }) }]
  }) : vazio('Sem leads no período.'), 7);
}
function cartaoFunilPeriodo(T) {
  var F = T.funil, cor = ['var(--f0)', 'var(--f1)', 'var(--f2)', 'var(--f3)', 'var(--f4)'];
  return blocoCartao('Funil do período', 'Leads que entraram nos últimos ' + T.dias + ' dias e até onde chegaram.', barras(F.map(function (f, i) {
    return { rotulo: f.etapa, valor: f.n, texto: nf0.format(f.n), cor: cor[i], extra: pct(f.pct) + (i && f.perda > 0 ? '  ·  −' + nf0.format(f.perda) + '%' : ''), dica: { titulo: f.etapa, linhas: [{ valor: nf0.format(f.n), rotulo: 'leads' }, { valor: pct(f.pct), rotulo: 'do total' }].concat(i ? [{ valor: '−' + nf0.format(f.perda) + '%', rotulo: 'perdidos desde a etapa anterior' }] : []) } };
  }), { max: F[0].n || 1, alta: true, vazio: 'Sem leads no período.' }), 5);
}

/* ------------------------------------------------------------------ comportamento */
function cartaoCalor(T) {
  var total = soma(T.heat.map(soma));
  return blocoCartao('Quando os pacientes respondem', 'Respostas por dia da semana e hora, nos últimos ' + T.dias + ' dias. Mais escuro, mais respostas.', total ? mapaCalor(T.heat) : vazio('Registre as respostas dos pacientes para ver o melhor horário.'), 7);
}
function cartaoMensagensT(T) {
  var lista = T.mensagens, tot = soma(lista.map(function (m) { return m.enviadas; })), resp = soma(lista.map(function (m) { return m.respostas; })), media = tot ? resp / tot * 100 : 0;
  var el = lista.filter(function (m) { return m.enviadas >= 5; });
  var melhor = el.length > 2 ? el.slice().sort(function (a, b) { return b.taxa - a.taxa; })[0] : null, pior = el.length > 2 ? el.slice().sort(function (a, b) { return a.taxa - b.taxa; })[0] : null;
  return blocoCartao('Qual mensagem funciona melhor', 'Taxa de resposta em até 72 h. Verde: a melhor. Vermelho: a que menos responde (com 5+ envios).', lista.length ? h('div', null, [barras(lista.map(function (m) {
    var cor = melhor && m.n === melhor.n ? 'var(--g3)' : pior && m.n === pior.n && pior.n !== melhor.n ? 'var(--bad)' : 'var(--g1)';
    return { rotulo: 'Msg ' + m.n + ' · ' + m.titulo, valor: m.taxa || 0, texto: pct(m.taxa), extra: m.enviadas + ' env.', cor: cor, dica: { titulo: 'Mensagem ' + m.n + ' · ' + m.titulo, linhas: [{ valor: String(m.enviadas), rotulo: 'enviadas' }, { valor: String(m.respostas), rotulo: 'com resposta' }, { valor: pct(m.taxa), rotulo: 'taxa de resposta' }], nota: 'Média geral: ' + pct(media) } };
  }), { max: 100 }), h('p', { class: 'mut peq', text: 'Média: ' + pct(media) + ' · ' + tot + ' envios' })]) : vazio('Sem contatos com mensagem no período.'), 5);
}

/* ------------------------------------------------------------------ composição */
function cartaoDescartesT(T) {
  var cores = ['var(--g2)', 'var(--g5)', 'var(--g1)', 'var(--g4)', 'var(--g3)', 'var(--g6)'];
  return blocoCartao('Por que perdemos leads', 'Motivos de descarte no período.', rosca(T.descartes.map(function (d, i) { return { rotulo: d.motivo, valor: d.n, cor: cores[i % cores.length], extra: brl(d.valor) + ' em orçamentos' }; }), { centro: 'descartes', vazio: 'Nenhum descarte no período.' }), 4);
}
function linhasGrupoT(L) {
  return L.map(function (o) {
    return { rotulo: o.nome, valor: o.leads, texto: nf0.format(o.leads), extra: o.taxa === null ? 'sem encerrados' : 'conv. ' + pct(o.taxa), cor: 'var(--g5)', dica: { titulo: o.nome, linhas: [{ valor: String(o.leads), rotulo: 'leads' }, { valor: String(o.convertidos), rotulo: 'compareceram e pagaram' }, { valor: String(o.descartados), rotulo: 'descartados' }, { valor: pct(o.taxa), rotulo: 'conversão dos encerrados' }, { valor: brl(o.ticket), rotulo: 'ticket médio' }] } };
  });
}
function cartaoOrigemT(T) { return blocoCartao('De onde vêm os leads', 'Volume e conversão por origem.', barras(linhasGrupoT(T.origem), { vazio: 'Informe a origem ao cadastrar os leads.' }), 4); }
function cartaoExamesT(T) { return blocoCartao('Exames mais procurados', 'Os que mais geram leads no período.', barras(linhasGrupoT(T.exames), { vazio: 'Informe o exame ao cadastrar os leads.' }), 4); }
function cartaoFaixas(T) {
  var V = T.valores;
  return blocoCartao('Pipeline por faixa de valor', 'Leads ativos agora, por tamanho do orçamento.', colunas({
    valores: V.map(function (v) { return v.n; }), rotulos: V.map(function (v) { return v.rotulo.replace('Acima de ', '> ').replace('Até ', '≤ ').replace('R$ ', ''); }), altura: 210, cor: 'var(--g5)', aria: 'Leads ativos por faixa de valor',
    dica: function (i) { return { titulo: V[i].rotulo, linhas: [{ valor: String(V[i].n), rotulo: 'leads ativos' }, { valor: brl(V[i].valor), rotulo: 'em orçamentos' }] }; }
  }), 6);
}
function cartaoAging(T) {
  var CORES = ['var(--ag0)', 'var(--ag1)', 'var(--ag2)', 'var(--ag3)', 'var(--ag4)'];
  var vaz = !T.aging.some(function (a) { return a.faixas.some(function (f) { return f.n > 0; }); });
  var linhas = T.aging.map(function (a) {
    return h('div', { class: 'aging-l' }, [h('span', { class: 'aging-r', text: ST[a.status] }), empilhada(a.faixas.map(function (f, i) { return { rotulo: ST[a.status] + ' · ' + f.rotulo, valor: f.n, cor: CORES[i] }; }), { semLegenda: true })]);
  });
  return blocoCartao('Há quanto tempo estão parados', 'Dias de cada lead ativo na etapa atual. Quanto mais quente a cor, mais velho.', vaz ? vazio('Nenhum lead ativo.') : h('div', null, [
    h('div', { class: 'aging' }, linhas),
    h('div', { class: 'legenda' }, T.aging[0].faixas.map(function (f, i) { return h('span', null, [h('i', { class: 'bl', style: 'background:' + CORES[i] }), f.rotulo]); }))
  ]), 6);
}
function miniEquipe(titulo, sub, campo, cor, fmtv) {
  return function (T) {
    var E = T.equipe.slice().sort(function (a, b) { return (b[campo] || 0) - (a[campo] || 0); });
    return blocoCartao(titulo, sub, barras(E.map(function (e) { var v = e[campo] === null ? 0 : e[campo]; return { rotulo: e.nome, valor: v, texto: fmtv ? fmtv(e[campo]) : nf0.format(v), cor: cor, dica: { titulo: e.nome, linhas: [{ valor: nf0.format(e.ativos), rotulo: 'leads ativos' }, { valor: nf0.format(e.atrasados), rotulo: 'com passo atrasado' }, { valor: nf0.format(e.convertidos), rotulo: 'convertidos no período' }, { valor: pct(e.taxa), rotulo: 'conversão' }] } }; }), { vazio: 'Sem leads.' }), 3);
  };
}
var cartaoEqAtivos = miniEquipe('Leads ativos', 'Carga por responsável.', 'ativos', 'var(--g5)');
var cartaoEqAtrasos = miniEquipe('Passos atrasados', 'Leads com tarefa vencida.', 'atrasados', 'var(--bad)');
var cartaoEqConv = miniEquipe('Convertidos', 'No período.', 'convertidos', 'var(--g3)');
var cartaoEqTaxa = miniEquipe('Conversão', 'Dos leads encerrados no período.', 'taxa', 'var(--g1)', function (v) { return pct(v); });

/* ------------------------------------------------------------------ montagem */
function corpoEvolucao() {
  pedirAnalise(S.dias);
  var T = S.AN[S.dias];
  if (!T) return esqueleto();
  return [
    resumoPeriodo(T), destaques(T),
    secaoT('Evolução', 'O pipeline, as entradas e saídas, o dinheiro e as taxas ao longo do tempo.'),
    h('div', { class: 'g12' }, [cartaoPipelineTempo(T), cartaoValorTempo(T)]),
    h('div', { class: 'g12' }, [cartaoEntradasSaidas(T), cartaoValorConvPerdido(T)]),
    h('div', { class: 'g12' }, [cartaoTaxas(T), cartaoCicloTempo(T)]),
    h('div', { class: 'g12' }, [cartaoCoortes(T), cartaoFunilPeriodo(T)]),
    secaoT('Comportamento', 'Quando os pacientes respondem e o que mais funciona.'),
    h('div', { class: 'g12' }, [cartaoCalor(T), cartaoMensagensT(T)]),
    secaoT('Composição', 'De onde vêm os leads, o que procuram e por que os perdemos.'),
    h('div', { class: 'g12' }, [cartaoDescartesT(T), cartaoOrigemT(T), cartaoExamesT(T)]),
    h('div', { class: 'g12' }, [cartaoFaixas(T), cartaoAging(T)]),
    secaoT('Equipe', 'Carga e resultado de cada responsável.'),
    h('div', { class: 'g12' }, [cartaoEqAtivos(T), cartaoEqAtrasos(T), cartaoEqConv(T), cartaoEqTaxa(T)]),
    h('p', { class: 'rodape-n', text: 'Pontos recentes ainda podem mudar: respostas e conversões chegam depois do contato. Percentuais com poucos leads oscilam muito.' })
  ];
}
`;
