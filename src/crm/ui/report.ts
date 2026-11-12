// JavaScript do CRM (navegador): aba "Meu Report" (performance individual para a diretoria). Dados de /painel/crm/api/meu-report.
// Dentro dele não usar crases nem "dollar-chave".
export const report = String.raw`
function nomeReport() { var n = nomesResponsaveis(); return S.repNome && n.indexOf(S.repNome) >= 0 ? S.repNome : (S.eu && n.indexOf(S.eu) >= 0 ? S.eu : (n[0] || '')); }
function pedirReport(nome) {
  var k = perChave() + '|' + nome;
  if (S.RPfresh[k] || S.RPcarregando[k] || !nome) return;
  S.RPcarregando[k] = true;
  api('GET', '/meu-report?' + perQs() + '&nome=' + encodeURIComponent(nome)).then(function (r) { S.RP[k] = r; S.RPfresh[k] = true; S.RPcarregando[k] = false; if (S.aba === 'analises') desenhar(true); })
    .catch(function (e) { S.RPcarregando[k] = false; aviso('Não consegui montar o report: ' + e.message, 'erro'); });
}
function dataHoraAgora() { return new Date().toLocaleString('pt-BR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }); }
function textoReport(R) {
  var L = ['REPORT DE PERFORMANCE · ' + R.nome.toUpperCase(), 'Período: ' + dBRfull(R.ini) + ' a ' + dBRfull(R.hoje) + ' (' + R.dias + ' dias) · gerado em ' + dataHoraAgora(), ''];
  R.resumo.forEach(function (s) { L.push('• ' + s); });
  L.push('', 'Indicadores:',
    '- Receita convertida: ' + brl2(R.atual.receita) + ' (' + R.atual.convertidos + ' conversões)',
    '- Conversão dos leads recebidos: ' + pct(R.atual.conversao),
    '- Contatos: ' + R.atual.contatos + ' · respostas: ' + R.atual.respostas + ' (' + pct(R.atual.taxaResposta) + ')',
    '- Carteira ativa: ' + R.carteira.n + ' leads, ' + brl2(R.carteira.valor) + ', ' + R.carteira.atrasadas + ' com passo atrasado');
  return L.join('\n');
}
function barraReport(R) {
  var nomes = nomesResponsaveis();
  var sel = h('select', { class: 'in', 'aria-label': 'Responsável', onchange: function (e) { S.repNome = e.target.value; desenhar(true); } }, nomes.map(function (n) { return h('option', { value: n, text: n, selected: n === R.nome ? 'selected' : null }); }));
  return h('div', { class: 'rep-bar no-print' }, [
    h('label', { class: 'rep-sel' }, [h('span', { text: 'Responsável' }), sel]),
    h('div', { class: 'tela-ac' }, [botao('Copiar resumo', '', function () { copiar(textoReport(R), 'Resumo copiado.'); }, 'copy'), botao('Imprimir / salvar em PDF', 'pri', function () { window.print(); }, 'download')])
  ]);
}
function kpiR(rotulo, valor, delta, sub, serie, cor) { return kpi2({ rotulo: rotulo, valor: valor, delta: delta, sub: sub, serie: serie, cor: cor }); }

function blocoPosicao(R) {
  var rk = R.ranking;
  var mini = function (titulo, p, fmtv) {
    var max = Math.max.apply(null, p.valores.map(function (v) { return v.valor; }).concat([1]));
    return h('div', { class: 'pos' }, [
      h('div', { class: 'pos-h' }, [h('b', { text: titulo }), h('span', { class: 'pill pl-selo', text: p.pos ? p.pos + 'º de ' + p.de : '–' })]),
      barras(p.valores.map(function (v) { return { rotulo: v.nome, valor: v.valor, texto: fmtv(v.valor), cor: v.nome === R.nome ? 'var(--acc)' : 'var(--g6)' }; }), { max: max })
    ]);
  };
  return blocoCartao('Posição na equipe', 'Onde ' + R.nome + ' fica entre os responsáveis no período. Em destaque, a própria pessoa.', h('div', { class: 'pos-g' }, [
    mini('Receita convertida', rk.receita, brlCompacto), mini('Convertidos', rk.convertidos, nf0.format), mini('Contatos feitos', rk.contatos, nf0.format), mini('Conversão', rk.conversao, function (v) { return pct(v); })
  ]), 12, null, 'sec-posicao');
}

function heroReport(R) {
  var rk = R.ranking, a = R.atual, tot = soma(R.equipe.map(function (e) { return e.receita; })) || 1, fatia = a.receita / tot * 100;
  var chip = function (rot, p) { return p.pos ? h('span', { class: 'rk-chip' }, [h('b', { text: p.pos + 'º' }), 'de ' + p.de + ' em ' + rot]) : null; };
  var fm = [brl, function (v) { return pct(v); }, nf0.format, function (v) { return pct(v); }, nf0.format, function (v) { return nf1.format(v) + ' d'; }];
  return h('section', { class: 'rep-hero' }, [
    h('div', null, [
      h('div', { class: 'rep-id' }, [
        anel({ titulo: '', tam: 96, pct: fatia, centro: iniciais(R.nome), sub: '', cor: 'var(--acc)', dica: { titulo: R.nome, linhas: [{ valor: brl(a.receita), rotulo: pct(fatia) + ' da receita da equipe' }] } }),
        h('div', null, [h('small', { class: 'cx-eyebrow', text: 'REPORT DE PERFORMANCE' }), h('h2', { text: R.nome }), h('p', { text: dBRfull(R.ini) + ' a ' + dBRfull(R.hoje) + ' · ' + R.dias + ' ' + plural(R.dias, 'dia', 'dias') })])
      ]),
      h('div', { class: 'rk-chips' }, [chip('receita', rk.receita), chip('conversões', rk.convertidos), chip('contatos', rk.contatos), chip('conversão', rk.conversao)]),
      h('div', { class: 'rep-brief' }, [h('small', { text: 'RESUMO PARA A DIRETORIA' }), h('ul', { class: 'resumo-l' }, R.resumo.map(function (t) { return h('li', { text: t }); }))])
    ]),
    h('div', { class: 'rep-r' }, [
      h('small', { class: 'cx-eyebrow', text: 'VOCÊ × EQUIPE' }),
      radar({ eixos: R.radar, nome: R.nome, fmt: fm, cor: 'var(--acc)', aria: 'Radar de performance de ' + R.nome }),
      h('div', { class: 'legenda' }, [h('span', null, [h('i', { class: 'bl', style: 'background:var(--acc)' }), R.nome]), h('span', null, [h('i', { class: 'bl', style: 'background:var(--g6)' }), 'Média da equipe']), h('span', { class: 'mut', text: '100% = o melhor da equipe' })])
    ])
  ]);
}
function corpoReport() {
  var nome = nomeReport();
  if (!nome) return vazio('Cadastre um responsável para gerar o report.');
  pedirReport(nome);
  var R = S.RP[perChave() + '|' + nome];
  if (!R) return esqueleto();
  var a = R.atual, p = R.anterior, m = R.media, s = R.series;
  var eq = function (v, f) { return v === null || v === undefined ? 'sem média da equipe' : 'Equipe: ' + f(v); };
  var kpis = h('div', { class: 'kpis2 oito' }, [
    kpiR('Receita convertida', brl2(a.receita), dltP(a.receita, p.receita, { bom: 'sobe', vs: 'vs. anterior' }), eq(m.receita, brl), s.receita, 'var(--g3)'),
    kpiR('Convertidos', nf0.format(a.convertidos), dltP(a.convertidos, p.convertidos, { bom: 'sobe' }), eq(m.convertidos, nf1.format), s.convertidos, 'var(--g3)'),
    kpiR('Conversão', pct(a.conversao), dltP(a.conversao, p.conversao, { pp: true, bom: 'sobe' }), eq(m.conversao, pct), null),
    kpiR('Ciclo mediano', a.velocidade === null ? '–' : nf1.format(a.velocidade) + ' d', dltP(a.velocidade, p.velocidade, { bom: 'desce' }), eq(m.velocidade, function (v) { return nf1.format(v) + ' d'; }), null),
    kpiR('Contatos feitos', nf0.format(a.contatos), dltP(a.contatos, p.contatos, { bom: 'sobe' }), eq(m.contatos, nf1.format), s.contatos, 'var(--g6)'),
    kpiR('Taxa de resposta', pct(a.taxaResposta), dltP(a.taxaResposta, p.taxaResposta, { pp: true, bom: 'sobe' }), eq(m.taxaResposta, pct), s.respostas, 'var(--g1)'),
    kpiR('Agendamentos', nf0.format(a.agendamentos), dltP(a.agendamentos, p.agendamentos, { bom: 'sobe' }), a.recebidos + ' leads recebidos no período', s.agendamentos, 'var(--g2)'),
    kpiR('Carteira ativa', brl2(R.carteira.n ? R.carteira.valor : 0), null, R.carteira.n + ' leads · ' + R.carteira.atrasadas + ' atrasados · ' + R.carteira.foraDoLimite + ' fora do limite', null)
  ]);
  var evolucao = h('div', { class: 'g12' }, [
    blocoCartao('Atividade ao longo do período', 'Contatos feitos, respostas e agendamentos de ' + R.nome + '.', composto({
      rotulos: R.rotulos, titulos: R.titulos, altura: 240, aria: 'Atividade do responsável',
      colunas: [{ nome: 'Contatos', cor: 'var(--g6)', valores: s.contatos }], linhas: [{ nome: 'Respostas', cor: 'var(--g1)', valores: s.respostas }, { nome: 'Agendamentos', cor: 'var(--g2)', valores: s.agendamentos }]
    }), 8),
    blocoCartao('Receita convertida', (R.semanal ? 'Por semana.' : 'Por dia.'), colunas({ valores: s.receita, rotulos: R.rotulos, rotuloCada: Math.max(1, Math.ceil(R.rotulos.length / 6)), altura: 240, cor: 'var(--g3)', aria: 'Receita convertida por data', dica: function (i) { return { titulo: R.titulos[i], linhas: [{ valor: brl(s.receita[i]), rotulo: 'convertido' }, { valor: String(s.convertidos[i]), rotulo: 'conversões' }] }; } }), 4, destaqueNum(brlCompacto(a.receita), 'no período'))
  ]);
  var F = R.funil;
  var funilCart = blocoCartao('Funil dos leads recebidos', 'Dos leads que chegaram para ' + R.nome + ' no período, até onde foram.', barras(F.map(function (f, i) { return { rotulo: f.etapa, valor: f.n, texto: nf0.format(f.n), extra: pct(f.pct) + (i && f.perda > 0 ? '  ·  −' + nf0.format(f.perda) + '%' : ''), cor: ['var(--f0)', 'var(--f1)', 'var(--f2)', 'var(--f3)', 'var(--f4)'][i] }; }), { max: F[0].n || 1, alta: true, vazio: 'Nenhum lead recebido no período.' }), 5);
  var C = R.carteira;
  var carteiraCart = blocoCartao('Carteira ativa por etapa', C.n + ' leads em andamento, ' + brl(C.valor) + '.', barras(C.porEtapa.map(function (e) { return { rotulo: e.etapa, valor: e.n, texto: String(e.n), extra: brlCompacto(e.valor), cor: 'var(--c-aberto)' }; }), { vazio: 'Carteira vazia.' }), 4);
  var agingCart = blocoCartao('Tempo parado na etapa', 'Leads da carteira por dias na etapa atual.', colunas({ valores: C.aging.map(function (x) { return x.n; }), rotulos: C.aging.map(function (x) { return x.rotulo.replace(' dias', 'd').replace(' dia', 'd'); }), altura: 190, cor: 'var(--ag3)', aria: 'Leads da carteira por tempo na etapa', dica: function (i) { return { titulo: C.aging[i].rotulo, linhas: [{ valor: String(C.aging[i].n), rotulo: 'leads' }] }; } }), 3);
  var cores = ['var(--g2)', 'var(--g5)', 'var(--g1)', 'var(--g4)', 'var(--g3)', 'var(--g6)'];
  var descCart = blocoCartao('Descartes por motivo', 'Leads de ' + R.nome + ' descartados no período.', rosca(R.descartes.map(function (d, i) { return { rotulo: d.motivo, valor: d.n, cor: cores[i % cores.length], extra: brl(d.valor) }; }), { centro: 'descartes', vazio: 'Nenhum descarte no período.' }), 4);
  var tot = soma(R.mensagens.map(function (x) { return x.enviadas; })), resp = soma(R.mensagens.map(function (x) { return x.respostas; }));
  var msgCart = blocoCartao('Mensagens usadas e resposta', 'Taxa de resposta em até 72 h de cada mensagem que ' + R.nome + ' enviou.', R.mensagens.length ? h('div', null, [barras(R.mensagens.map(function (x) { return { rotulo: 'Msg ' + x.n + ' · ' + x.titulo, valor: x.taxa || 0, texto: pct(x.taxa), extra: x.enviadas + ' env.', cor: 'var(--g1)' }; }), { max: 100 }), h('p', { class: 'mut peq', text: 'Média: ' + pct(tot ? resp / tot * 100 : null) + ' · ' + tot + ' envios' })]) : vazio('Nenhum contato com mensagem no período.'), 8);
  var totHeat = soma(R.heat.map(soma));
  var heatCart = blocoCartao('Quando ' + R.nome + ' faz contato', 'Contatos por dia da semana e hora.', totHeat ? mapaCalor(R.heat, { unidade: 'contatos' }) : vazio('Sem contatos no período.'), 8);
  var ns = R.noshow;
  var nsCart = blocoCartao('No-show recuperados', 'Pacientes que faltaram e voltaram a comparecer.', h('div', null, [statsCaixa([['ENTRARAM', String(ns.entraram)], ['RECUPERADOS', ns.recuperados + (ns.pct !== null ? ' · ' + nf0.format(ns.pct) + '%' : ''), 'verde']]), ns.valorRecuperado ? h('p', { class: 'mut peq', text: brl2(ns.valorRecuperado) + ' recuperados em orçamentos.' }) : h('p', { class: 'mut peq', text: 'Nenhum recuperado no período.' })]), 4);
  return [
    barraReport(R),
    h('div', { class: 'print-only print-h' }, [h('h2', { text: 'Report de performance · ' + R.nome }), h('p', { text: 'Período de ' + dBRfull(R.ini) + ' a ' + dBRfull(R.hoje) + ' (' + R.dias + ' dias) · gerado em ' + dataHoraAgora() + ' · Clinex CRM' })]),
    heroReport(R), kpis, blocoPosicao(R), evolucao,
    h('div', { class: 'g12' }, [funilCart, carteiraCart, agingCart]),
    h('div', { class: 'g12' }, [heatCart, nsCart]),
    h('div', { class: 'g12' }, [descCart, msgCart]),
    h('p', { class: 'rodape-n', text: 'Resultado (receita, conversão, carteira) vem dos leads sob a responsabilidade de ' + R.nome + '. Atividade (contatos, respostas, agendamentos) vem das ações registradas por ' + R.nome + '. Todos os dados saem dos registros do CRM.' })
  ];
}
`;
