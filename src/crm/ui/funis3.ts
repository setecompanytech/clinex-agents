/** Aba Pipelines (cliente), parte 3: log de movimentações, relatório de produtividade e painel executivo dos funis. Sem backticks nem dólar-chave aqui dentro. */
export const funis3 = String.raw`
/* ------------------------------------------------------------------ período compartilhado (log e relatório) */
function fvPeriodoBarra(refazer) {
  if (!FV.rde) { FV.rate = fvHoje(); FV.rde = fvSoma(FV.rate, -29); }
  return h('div', { class: 'fv-filtros' }, [
    h('label', { class: 'fv-f' }, [h('span', { text: 'De' }), h('input', { class: 'in', type: 'date', value: FV.rde, onchange: function (e) { FV.rde = e.target.value; refazer(); } })]),
    h('label', { class: 'fv-f' }, [h('span', { text: 'Até' }), h('input', { class: 'in', type: 'date', value: FV.rate, onchange: function (e) { FV.rate = e.target.value; refazer(); } })]),
    h('div', { class: 'seg', role: 'group', 'aria-label': 'Atalhos' }, [[7, '7 dias'], [30, '30 dias'], [90, '90 dias']].map(function (p) {
      return h('button', { type: 'button', text: p[1], 'aria-pressed': 'false', onclick: function () { FV.rate = fvHoje(); FV.rde = fvSoma(FV.rate, -(p[0] - 1)); refazer(); } });
    }))
  ]);
}
function fvPedir(chave, caminho, refazer) {
  var k = chave + '|' + caminho;
  if (FV[chave] && FV[chave].k === k) return FV[chave].d;
  if (FV[chave + 'Car'] === k) return null;
  FV[chave + 'Car'] = k;
  api('GET', caminho).then(function (d) { FV[chave] = { k: k, d: d }; FV[chave + 'Car'] = null; if (S.aba === 'pipelines') desenhar(true); })
    .catch(function (e) { FV[chave] = { k: k, d: { erro: e.message } }; FV[chave + 'Car'] = null; if (S.aba === 'pipelines') desenhar(true); });
  return null;
}
function fvRefazer() { FV.REL = null; FV.LOG = null; desenhar(true); }
function fvCarregando() { return h('div', { class: 'it-carrega' }, [h('i'), h('i'), h('i')]); }

/* ------------------------------------------------------------------ log de movimentações */
function fvLog() {
  var barra = fvPeriodoBarra(fvRefazer);
  var d = fvPedir('LOG', '/pipelines/log/dados?funilId=' + FV.id + '&de=' + FV.rde + '&ate=' + FV.rate, fvRefazer);
  if (!d) return [barra, fvCarregando()];
  if (d.erro) return [barra, vazio('Não consegui carregar o log', d.erro)];
  return [barra, h('section', { class: 'cartao' }, [
    h('header', { class: 'card-h' }, [h('div', null, [h('h3', { text: 'Log de movimentações' }), h('p', { text: d.total + ' movimentações no período' + (d.total > d.movimentos.length ? ' (mostrando as ' + d.movimentos.length + ' mais recentes)' : '') + '. A entrada inicial do card não conta.' })])]),
    d.movimentos.length ? h('div', { class: 'tabela-w' }, [h('table', { class: 'tabela fv-tab' }, [
      h('thead', null, h('tr', null, ['Quando', 'Paciente', 'De', 'Para', 'Quem moveu', 'Valor'].map(function (t) { return h('th', { scope: 'col', text: t }); }))),
      h('tbody', null, d.movimentos.map(function (m) {
        return h('tr', { class: 'clic', tabindex: '0', onclick: function () { fvAbrirCard(m.cardId); } }, [h('td', { text: fvQuando(m.em) }), h('td', null, h('b', { text: m.paciente })), h('td', { text: m.de }), h('td', null, h('b', { text: m.para })), h('td', { text: m.por }), h('td', { class: 'num', text: brl(m.valor) })]);
      }))
    ])]) : vazio('Nenhuma movimentação no período')
  ])];
}

/* ------------------------------------------------------------------ relatório de produtividade */
function fvRelatorio() {
  var barra = fvPeriodoBarra(fvRefazer);
  var d = fvPedir('REL', '/pipelines/relatorio/dados?funilId=' + FV.id + '&de=' + FV.rde + '&ate=' + FV.rate, fvRefazer);
  if (!d) return [barra, fvCarregando()];
  if (d.erro) return [barra, vazio('Não consegui carregar o relatório', d.erro)];
  var K = d.kpis, linhas = d.produtividade;
  var dias = Object.keys(d.porDia).sort();
  var todos = []; var c = FV.rde; while (c <= FV.rate && todos.length < 400) { todos.push(c); c = fvSoma(c, 1); }
  var kp = h('div', { class: 'kpis' }, [
    kpi2({ rotulo: 'Movimentações', valor: String(K.movimentos), sub: K.cardsMovidos + ' cards diferentes' }),
    kpi2({ rotulo: 'Convertidos', valor: String(K.convertidos), sub: K.ativo.n + ' ativos · ' + K.organico.n + ' orgânicos', tom: K.convertidos ? '' : '' }),
    kpi2({ rotulo: 'Valor convertido', valor: brl(K.valorConvertido), sub: brl(K.ativo.valor) + ' ativo · ' + brl(K.organico.valor) + ' orgânico' }),
    kpi2({ rotulo: 'Pessoas movendo cards', valor: String(linhas.filter(function (l) { return l.movimentos > 0; }).length), sub: 'incluindo "sem autor"' })
  ]);
  var tabela = linhas.length ? h('div', { class: 'tabela-w' }, [h('table', { class: 'tabela fv-tab' }, [
    h('thead', null, h('tr', null, ['Usuário', 'Em aberto → Em negociação', 'Em negociação → Agendado', 'Agendado → Convertido ativo', 'Sem retorno / descarte', 'Taxa de conversão ativa', 'Valor convertido', 'Participação'].map(function (t) { return h('th', { scope: 'col', text: t }); }))),
    h('tbody', null, linhas.map(function (l) {
      return h('tr', null, [h('td', null, [avatar(l.usuario), ' ', h('b', { text: l.usuario })]), h('td', { class: 'num', text: String(l.emAbertoParaNegociacao) }), h('td', { class: 'num', text: String(l.negociacaoParaAgendado) }), h('td', { class: 'num', text: String(l.agendadoParaConvertido) }), h('td', { class: 'num', text: String(l.semRetornoDescarte) }),
        h('td', { class: 'num', text: l.taxaConversao === null ? '–' : pct(l.taxaConversao) }), h('td', { class: 'num', text: brl(l.valorConvertido) }), h('td', { class: 'num' }, l.participacao === null ? '–' : [h('span', { text: pct(l.participacao) + ' ' }), h('i', { class: 'fv-barra' }, h('u', { style: 'width:' + l.participacao + '%' }))])]);
    }))
  ])]) : vazio('Sem movimentações no período');
  return [barra,
    h('div', { class: 'no-print fv-acoes' }, [botao('Imprimir / PDF', '', function () { window.print(); }, 'download')]), kp,
    h('div', { class: 'g12' }, [
      blocoCartao('Produtividade por usuário', 'Autor = quem moveu o card (não o responsável). Cada lead conta uma vez por pessoa por coluna em Sem retorno/descarte. Valor convertido = só Convertido ativo.', tabela, 12),
      blocoCartao('Movimentações por dia', 'Quantas movimentações a equipe fez a cada dia.', K.movimentos === 0 ? vazio('Nenhuma movimentação no período') : colunas({ valores: todos.map(function (x) { return d.porDia[x] || 0; }), rotulos: todos.map(function (x) { return x.slice(8, 10) + '/' + x.slice(5, 7); }), rotuloCada: Math.max(1, Math.round(todos.length / 10)), altura: 200, cor: 'var(--g5)', aria: 'Movimentações por dia', dica: function (i) { return { titulo: dBRfull(todos[i]), linhas: [{ valor: String(d.porDia[todos[i]] || 0), rotulo: 'movimentações' }] }; } }), 6),
      blocoCartao('De onde saíram, para onde foram', 'Todas as transições do período, da mais frequente para a menos.', d.fluxo.length ? h('div', { class: 'fv-fluxo' }, d.fluxo.slice(0, 60).map(function (f) { return h('div', null, [h('span', { text: f.de }), ico('arrow', 12), h('b', { text: f.para }), h('em', { text: String(f.n) })]); })) : vazio('Sem transições'), 6)
    ])
  ];
}

/* ------------------------------------------------------------------ painel executivo */
function fvExecutivo() {
  var dias = S.dias;
  var d = fvPedir('EXE', '/pipelines/' + FV.id + '/executivo?dias=' + dias, null);
  var barra = h('div', { class: 'fv-filtros' }, [h('div', { class: 'seg', role: 'group', 'aria-label': 'Período' }, [14, 30, 90].map(function (x) { return h('button', { type: 'button', 'aria-pressed': String(S.dias === x), text: x + ' dias', onclick: function () { S.dias = x; gravarLS('crm-dias', String(x)); FV.EXE = null; desenhar(true); } }); }))]);
  if (!d) return [barra, fvCarregando()];
  if (d.erro) return [barra, vazio('Não consegui carregar o painel', d.erro)];
  var K = d.kpis, r = K.receita;
  var kp = h('div', { class: 'kpis' }, [
    kpi2({ rotulo: 'Receita convertida', valor: brl(r.valor), delta: dlt(r.valor, r.anterior, { bom: 'sobe' }), sub: r.n + ' cards · ' + brlCompacto(r.ativo.valor) + ' ativo · ' + brlCompacto(r.organico.valor) + ' orgânico', serie: d.serie.receita, cor: 'var(--g3)' }),
    kpi2({ rotulo: 'Pipeline em aberto', valor: brl(K.pipeline.valor), sub: K.pipeline.n + ' cards em andamento' }),
    kpi2({ rotulo: 'Previsão ponderada', valor: brl(K.previsao.valor), sub: 'valor × taxa histórica por coluna' }),
    kpi2({ rotulo: 'Conversão', valor: K.conversao.taxa === null ? '–' : pct(K.conversao.taxa), sub: K.conversao.convertidos + ' conversões ÷ ' + K.conversao.entradas + ' entradas no período', delta: dlt(K.conversao.entradas, K.conversao.entradasAnt, { bom: 'sobe', vs: 'entradas' }) }),
    kpi2({ rotulo: 'Velocidade de venda', valor: K.velocidade.mediana === null ? '–' : String(K.velocidade.mediana).replace('.', ',') + ' d', sub: 'mediana da criação à conversão (' + K.velocidade.n + ' casos)' })
  ]);
  var alertas = d.alertas.length ? h('div', { class: 'fv-alertas' }, d.alertas.map(function (a) { return h('div', { class: 'au-previa n-' + a.nivel }, [h('b', { text: a.titulo }), h('p', { text: a.texto })]); })) : null;
  var funil = d.funil_.filter(function (x) { return x.n > 0; });
  var degrausItens = funil.map(function (x) { return { rotulo: x.etapa, n: x.n, valor: x.valor, cor: x.color, extra: brlCompacto(x.valor), dica: [{ valor: x.n + ' cards', rotulo: brl(x.valor) }] }; });
  var cores = ['var(--g1)', 'var(--g5)', 'var(--g4)', 'var(--g3)'];
  var tabela = h('div', { class: 'tabela-w' }, [h('table', { class: 'tabela fv-tab' }, [
    h('thead', null, h('tr', null, ['Coluna', 'Cards', 'Valor', 'Média na coluna', 'Cadência', 'Fora da cadência', 'Taxa de ganho', 'Previsto'].map(function (t) { return h('th', { scope: 'col', text: t }); }))),
    h('tbody', null, d.etapas.filter(function (e) { return e.classe === 'aberto' || e.classe === 'agendado'; }).map(function (e) {
      return h('tr', null, [h('td', null, [h('i', { class: 'fv-dot', style: 'background:' + e.color }), h('b', { text: e.etapa })]), h('td', { class: 'num', text: String(e.n) }), h('td', { class: 'num', text: brl(e.valor) }), h('td', { class: 'num', text: e.mediaDias === null ? '–' : String(e.mediaDias).replace('.', ',') + ' d' }), h('td', { class: 'num', text: e.cadenciaDias ? e.cadenciaDias + ' d' : '–' }), h('td', { class: 'num' + (e.atrasados ? ' ruim' : ''), text: String(e.atrasados) }), h('td', { class: 'num', text: e.peso === null ? 'sem amostra' : e.peso + '%' }), h('td', { class: 'num', text: e.peso === null ? '–' : brl(e.previsto) })]);
    }))
  ])]);
  return [barra, alertas, kp,
    h('div', { class: 'g12' }, [
      blocoCartao('Receita convertida por dia', 'Valor dos cards que entraram em uma coluna de convertido.', r.valor === 0 ? vazio('Nenhuma conversão no período', 'Quando um card entrar em uma coluna de convertido, o valor aparece aqui.') : colunas({ valores: d.serie.receita, rotulos: d.serie.rotulos.map(function (x) { return x.slice(8, 10) + '/' + x.slice(5, 7); }), rotuloCada: Math.max(1, Math.round(d.serie.rotulos.length / 10)), altura: 210, cor: 'var(--g3)', aria: 'Receita por dia', dica: function (i) { return { titulo: dBRfull(d.serie.rotulos[i]), linhas: [{ valor: brl(d.serie.receita[i]), rotulo: 'convertido' }] }; } }), 7, destaqueNum(brlCompacto(r.valor), 'no período')),
      blocoCartao('Funil agora', 'Cards por coluna. A largura é o volume.', degraus({ itens: degrausItens, aria: 'Funil de cards por coluna' }), 5),
      blocoCartao('Envelhecimento', 'Há quanto tempo os cards em andamento estão na coluna atual.', barras(d.idade.map(function (b, i) { return { rotulo: b.rotulo, valor: b.n, texto: String(b.n), extra: brlCompacto(b.valor), cor: i === 3 ? 'var(--bad)' : i === 2 ? 'var(--warn)' : 'var(--g1)' }; })), 5),
      blocoCartao('Atividade por login', 'Movimentações feitas no período.', barras(d.atividade.slice(0, 8).map(function (a, i) { return { rotulo: a.usuario, valor: a.n, cor: cores[i % cores.length] }; }), { vazio: 'Nenhuma movimentação no período.' }), 7),
      blocoCartao('Colunas em andamento', 'Previsão = valor dos cards × taxa de ganho histórica da coluna (mínimo de 5 cards resolvidos; abaixo disso fica sem amostra).', tabela, 12)
    ])
  ];
}
`;
