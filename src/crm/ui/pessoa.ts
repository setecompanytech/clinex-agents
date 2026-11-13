// JavaScript do CRM (navegador): modal grande com tudo sobre uma pessoa (abre ao clicar em "Atividade por login").
// Dados de /painel/crm/api/pessoa (detalhePessoa em src/crm/executivo.ts).
// Dentro dele não usar crases nem "dollar-chave".
export const pessoaUi = String.raw`
var PS_TIPO = { contato: 'Contato', resposta: 'Resposta', agendamento: 'Agendamento', retorno: 'Retorno', descarte: 'Descarte', comparecimento: 'Comparecimento', recepcao: 'Recepção', etapa: 'Mudança de etapa', nota: 'Anotação' };
var PS_COR_TIPO = { contato: 'var(--g6)', resposta: 'var(--g1)', agendamento: 'var(--g2)', retorno: 'var(--g4)', descarte: 'var(--bad)', comparecimento: 'var(--g3)', recepcao: 'var(--g3)', etapa: 'var(--g5)', nota: 'var(--mut)' };

function abrirPessoa(nome) {
  var m = modal({
    cabecalho: [h('div', { class: 'ps-cab' }, [avatar(nome), h('div', null, [h('h2', { text: nome }), h('p', { text: 'De ' + dBRfull(perJanela().de) + ' a ' + dBRfull(perJanela().ate) + ' · tudo o que esta pessoa fez e entregou no período' })])])],
    corpo: h('div', { class: 'ps' }, esqueleto()), largura: 1240, classe: 'pessoa larga'
  });
  api('GET', '/pessoa?' + perQs() + '&nome=' + encodeURIComponent(nome)).then(function (P) {
    limpar(m.corpo); kids(m.corpo, h('div', { class: 'ps' }, corpoPessoa(P, nome, m)));
  }).catch(function (e) { limpar(m.corpo); kids(m.corpo, h('p', { class: 'callout aviso', text: 'Não consegui carregar os detalhes: ' + e.message })); });
}

function psChip(texto, cls) { return h('span', { class: 'ps-chip ' + (cls || ''), text: texto }); }
function psTabela(cols, linhas, aoClicar) {
  return h('div', { class: 'tbl-w' }, h('table', { class: 'tbl peq' }, [
    h('thead', null, h('tr', null, cols.map(function (c) { return h('th', { scope: 'col', text: c }); }))),
    h('tbody', null, linhas.map(function (l) {
      var tr = h('tr', { class: aoClicar ? 'clic' : '', tabindex: aoClicar ? '0' : null }, l.celulas.map(function (c, i) { return h('td', { class: i === 0 ? '' : 'num' }, c); }));
      if (aoClicar) { tr.addEventListener('click', function () { aoClicar(l); }); tr.addEventListener('keydown', function (e) { if (e.key === 'Enter') aoClicar(l); }); }
      return tr;
    }))
  ]));
}

function corpoPessoa(P, nome, m) {
  var a = P.atual, p = P.anterior, s = P.series, md = P.media, rk = P.ranking;
  var irLead = function (l) { m.fechar(); abrirLead(l.leadId); };
  var vs = function (v, ant, o) { return dltP(v, ant, o); };
  var out = [];

  // ---- posição no time e o essencial
  var chips = [];
  [['receita', 'em receita'], ['convertidos', 'em conversões'], ['contatos', 'em contatos'], ['conversao', 'em conversão']].forEach(function (c) {
    var r = rk[c[0]]; if (r && r.de > 1 && r.pos > 0) chips.push(psChip(r.pos + 'º ' + c[1] + ' de ' + r.de, r.pos === 1 ? 'ok' : ''));
  });
  chips.push(psChip('Dono de ' + P.donoDeLeads + ' ' + plural(P.donoDeLeads, 'lead', 'leads')));
  chips.push(psChip('Carteira: ' + P.carteira.n + ' ' + plural(P.carteira.n, 'lead', 'leads') + ' · ' + brlCompacto(P.carteira.valor)));
  if (P.carteira.atrasadas) chips.push(psChip(P.carteira.atrasadas + ' ' + plural(P.carteira.atrasadas, 'passo atrasado', 'passos atrasados'), 'ruim'));
  if (P.carteira.foraDoLimite) chips.push(psChip(P.carteira.foraDoLimite + ' fora do limite de dias', 'ruim'));
  out.push(h('div', { class: 'ps-chips' }, chips));

  out.push(h('div', { class: 'kpis2 seis' }, [
    kpi2({ rotulo: 'Receita convertida', valor: brlCompacto(a.receita), delta: vs(a.receita, p.receita, { bom: 'sobe' }), sub: md.receita !== null && md.receita !== undefined ? 'média do time ' + brlCompacto(md.receita) : null, serie: s.receita, cor: COR.convertidos }),
    kpi2({ rotulo: 'Convertidos', valor: nf0.format(a.convertidos), delta: vs(a.convertidos, p.convertidos, { bom: 'sobe' }), sub: a.velocidade === null ? null : 'ciclo de ' + nf1.format(a.velocidade) + ' d', serie: s.convertidos, cor: COR.convertidos }),
    kpi2({ rotulo: 'Leads recebidos', valor: nf0.format(a.recebidos), delta: vs(a.recebidos, p.recebidos, { bom: 'sobe' }), serie: s.recebidos, cor: COR.novos }),
    kpi2({ rotulo: 'Contatos feitos', valor: nf0.format(a.contatos), delta: vs(a.contatos, p.contatos, { bom: 'sobe' }), sub: md.contatos !== null && md.contatos !== undefined ? 'média do time ' + nf0.format(md.contatos) : null, serie: s.contatos, cor: COR.contatos }),
    kpi2({ rotulo: 'Taxa de resposta', valor: pct(a.taxaResposta), delta: vs(a.taxaResposta, p.taxaResposta, { pp: true, bom: 'sobe' }), sub: a.respostas + ' respostas', serie: s.respostas, cor: COR.respostas }),
    kpi2({ rotulo: 'Conversão', valor: pct(a.conversao), delta: vs(a.conversao, p.conversao, { pp: true, bom: 'sobe' }), sub: md.conversao !== null && md.conversao !== undefined ? 'média do time ' + pct(md.conversao) : null })
  ]));

  if (P.resumo && P.resumo.length) out.push(h('section', { class: 'cartao' }, [h('header', { class: 'card-h' }, [h('div', null, [h('h3', { text: 'Em resumo' }), h('p', { text: 'Frases prontas, com os números do período.' })])]), h('ul', { class: 'dest-l' }, P.resumo.map(function (t) { return h('li', { class: 'dl-info' }, [h('i', { 'aria-hidden': 'true' }), t]); }))]));

  // ---- evolução e atividade
  var suf = P.semanal ? 'por semana' : 'por dia';
  out.push(h('div', { class: 'g12' }, [
    blocoCartao('Evolução da receita', 'Valor convertido ' + suf + '.', soma(s.receita) ? linhasTempo({ rotulos: P.rotulos, titulos: P.titulos, altura: 230, area: true, fmt: brlCompacto, aria: 'Receita ao longo do tempo', series: [{ nome: 'Receita', cor: COR.convertidos, valores: s.receita }] }) : vazio('Nenhuma conversão no período.'), 6),
    blocoCartao('Atendimento ao longo do tempo', 'Contatos (colunas), respostas e agendamentos (linhas), ' + suf + '.', soma(s.contatos) || soma(s.respostas) ? composto({ rotulos: P.rotulos, titulos: P.titulos, altura: 230, aria: 'Atendimento ao longo do tempo', colunas: [{ nome: 'Contatos', cor: COR.contatos, valores: s.contatos }], linhas: [{ nome: 'Respostas', cor: COR.respostas, valores: s.respostas }, { nome: 'Agendamentos', cor: COR.agendamentos, valores: s.agendamentos }] }) : vazio('Nenhuma atividade no período.'), 6)
  ]));

  // ---- funil e horários
  var cor = ['var(--f0)', 'var(--f1)', 'var(--f2)', 'var(--f3)', 'var(--f4)'];
  out.push(h('div', { class: 'g12' }, [
    blocoCartao('Funil dos leads recebidos', 'Até onde chegaram os leads que entraram para ' + nome.split(' ')[0] + ' no período.', barras(P.funil.map(function (f, i) { return { rotulo: f.etapa, valor: f.n, texto: nf0.format(f.n), cor: cor[i], extra: pct(f.pct) + (i && f.perda > 0 ? '  ·  −' + nf0.format(f.perda) + '%' : '') }; }), { max: P.funil[0].n || 1, alta: true, vazio: 'Sem leads recebidos no período.' }), 5),
    blocoCartao('Quando contata', 'Contatos por dia da semana e hora. Mais escuro, mais contatos.', soma(P.heat.map(soma)) ? mapaCalor(P.heat) : vazio('Nenhum contato no período.'), 7)
  ]));

  // ---- o que fez e a carteira
  var maxMov = Math.max.apply(null, P.movimentos.porTipo.map(function (x) { return x.n; }).concat([1]));
  var maxEt = Math.max.apply(null, P.carteira.porEtapa.map(function (x) { return x.n; }).concat([1]));
  out.push(h('div', { class: 'g12' }, [
    blocoCartao('O que fez', P.movimentos.total + ' ' + plural(P.movimentos.total, 'movimentação', 'movimentações') + ' no período, por tipo.', barras(P.movimentos.porTipo.map(function (x) { return { rotulo: PS_TIPO[x.tipo] || x.tipo, valor: x.n, texto: String(x.n), cor: PS_COR_TIPO[x.tipo] || 'var(--g1)' }; }), { max: maxMov, vazio: 'Nenhuma movimentação no período.' }), 5),
    blocoCartao('Carteira por etapa', 'Leads ativos de ' + nome.split(' ')[0] + ' agora, em cada etapa.', barras(P.carteira.porEtapa.map(function (x, i) { return { rotulo: x.etapa, valor: x.n, texto: x.n + ' · ' + brlCompacto(x.valor), cor: CORES_CAT[i % CORES_CAT.length] }; }), { max: maxEt, vazio: 'Nenhum lead ativo.' }), 7)
  ]));

  // ---- mensagens, no-show e descartes
  var maxMs = Math.max.apply(null, P.mensagens.map(function (x) { return x.enviadas; }).concat([1])), maxD = Math.max.apply(null, P.descartes.map(function (x) { return x.n; }).concat([1]));
  var ns = P.noshow;
  out.push(h('div', { class: 'g12' }, [
    blocoCartao('Mensagens usadas', 'Quantas vezes cada mensagem do guia foi enviada e a taxa de resposta.', barras(P.mensagens.map(function (x) { return { rotulo: 'Msg ' + x.n + ' · ' + x.titulo, valor: x.enviadas, texto: x.enviadas + ' env · ' + x.respostas + ' resp', extra: pct(x.taxa), cor: 'var(--g1)' }; }), { max: maxMs, vazio: 'Nenhuma mensagem enviada com mensagem do guia.' }), 5),
    blocoCartao('No-show e descartes', ns.entraram ? 'Recuperou ' + ns.recuperados + ' de ' + ns.entraram + ' no-shows (' + brl(ns.valorRecuperado) + ').' : 'Nenhum no-show nos leads dela no período.', barras(P.descartes.map(function (x) { return { rotulo: x.motivo, valor: x.n, texto: x.n + ' · ' + brlCompacto(x.valor), cor: 'var(--bad)' }; }), { max: maxD, vazio: 'Nenhum descarte no período.' }), 7)
  ]));

  // ---- listas lead a lead
  out.push(blocoCartao('Convertidos no período', P.convertidos.length + ' ' + plural(P.convertidos.length, 'conversão', 'conversões') + ' · ' + brl(a.receita) + '. Clique para abrir o lead.', P.convertidos.length ? psTabela(['Paciente', 'Tipo', 'Valor', 'Dia', 'Ciclo', 'Unidade'], P.convertidos.map(function (c) {
    return { leadId: c.leadId, celulas: [h('b', { text: c.nome }), c.tipo === 'ativo' ? pill('Compareceu e pagou', 'pl-ok') : pill('Já foi à recepção', 'pl-hoje'), brl(c.valor), dBRfull(c.dia), c.ciclo + ' d', c.unidade] };
  }), irLead) : vazio('Nenhuma conversão no período.'), 12));

  out.push(blocoCartao('Carteira de agora', P.carteiraLeads.length ? 'Os ' + P.carteiraLeads.length + ' leads ativos mais urgentes (atrasados primeiro, depois o maior valor). Clique para abrir.' : 'Nenhum lead ativo na carteira.', P.carteiraLeads.length ? psTabela(['Paciente', 'Etapa', 'Próximo passo', 'Situação', 'Dias na etapa', 'Valor'], P.carteiraLeads.map(function (c) {
    return { leadId: c.leadId, celulas: [h('b', { text: c.nome }), c.etapa, c.proximo || '–', c.situacao === 'atrasada' ? pill('atrasado ' + c.atraso + ' d', 'pl-atrasada') : c.situacao === 'hoje' ? pill('vence hoje', 'pl-hoje') : c.situacao ? pill('no prazo', 'pl-ok') : '–', String(c.diasNaEtapa) + (c.foraDoLimite ? ' · fora do limite' : ''), brl(c.valor)] };
  }), irLead) : vazio('Sem leads ativos.'), 12));

  out.push(blocoCartao('Atividade recente', P.atividadeTotal ? 'Os ' + P.atividade.length + ' movimentos mais recentes de ' + P.atividadeTotal + ' no período. Clique para abrir o lead.' : 'Nenhum movimento no período.', P.atividade.length ? h('div', { class: 'ps-linha' }, P.atividade.map(function (e) {
    var b = h('button', { type: 'button', class: 'ps-ev', onclick: function () { irLead({ leadId: e.leadId }); } }, [
      h('i', { class: 'ps-pt', style: 'background:' + (PS_COR_TIPO[e.tipo] || 'var(--g1)'), 'aria-hidden': 'true' }),
      h('div', { class: 'ps-ev-c' }, [h('div', { class: 'ps-ev-t' }, [h('b', { text: e.lead }), h('span', { class: 'mut peq', text: PS_TIPO[e.tipo] + ' · ' + qDiaHora(e.quando) + (e.auto ? ' · automático' : '') })]), h('p', { text: e.texto })])
    ]);
    return b;
  })) : vazio('Nenhum movimento no período.'), 12));

  out.push(h('div', { class: 'linha-b ps-rodape' }, [
    botao('Abrir o Meu Report', 'pri', function () { m.fechar(); S.repNome = nome; S.anTab = 'report'; gravarLS('crm-antab', 'report'); if (S.aba !== 'analises') ir('analises'); else desenhar(true); window.scrollTo(0, 0); }, 'chart'),
    botao('Fechar', '', function () { m.fechar(); })
  ]));
  return out;
}
`;
