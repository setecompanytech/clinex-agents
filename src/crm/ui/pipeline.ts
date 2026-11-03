/** Funil > Pipeline e automações (cliente): visão do pipeline, lista de automações, editor com simulação e atividade. Sem backticks nem dólar-chave aqui dentro. */
export const pipeline = String.raw`
/* ------------------------------------------------------------------ pipeline e automações */
var AU_COR = { aberto: 'var(--c-aberto)', sem_retorno: 'var(--c-sem)', negociacao: 'var(--c-neg)', agendado: 'var(--c-agend)', convertido: 'var(--c-ativo)', descarte: 'var(--c-desc)' };
var AU_ETAPAS = [
  { id: 'aberto', r: 'Em aberto', st: ['aberto'] }, { id: 'sem_retorno', r: 'Sem retorno', st: ['sem_retorno'] },
  { id: 'negociacao', r: 'Em negociação', st: ['negociacao'] }, { id: 'agendado', r: 'Agendado', st: ['agendado'] },
  { id: 'convertido', r: 'Convertido', st: ['convertido_ativo', 'convertido_organico'] }, { id: 'descarte', r: 'Descarte', st: ['descarte'] }
];
var AU_GATILHOS = [
  ['parado_etapa', 'Lead parado numa etapa'], ['sem_contato', 'Sem contato há alguns dias'], ['lead_novo', 'Lead novo (ainda em aberto)'],
  ['agendamento_proximo', 'Consulta se aproximando'], ['no_show', 'No show sem remarcação']
];
var AU_ACOES = [['mover', 'Mover de etapa'], ['descartar', 'Descartar com motivo'], ['atribuir', 'Atribuir responsável'], ['etiqueta', 'Aplicar etiqueta'], ['nota', 'Registrar nota'], ['alerta', 'Avisar a equipe (alerta)']];

function auPlural(n, a, b) { return n + ' ' + (n === 1 ? a : b); }
function auQuando(iso) {
  if (!iso) return 'nunca';
  var d = new Date(iso), p = function (n) { return (n < 10 ? '0' : '') + n; };
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}
function auGatilhoTxt(g) {
  switch (g.tipo) {
    case 'parado_etapa': return 'o lead está há ' + auPlural(g.dias, 'dia', 'dias') + ' em ' + ST[g.etapa];
    case 'sem_contato': return 'não há contato há ' + auPlural(g.dias, 'dia', 'dias');
    case 'lead_novo': return g.dias === 0 ? 'o lead acabou de entrar (Em aberto)' : 'o lead entrou há ' + auPlural(g.dias, 'dia', 'dias') + ' e segue em aberto';
    case 'agendamento_proximo': return g.dias === 0 ? 'a consulta é hoje' : 'a consulta é em ' + auPlural(g.dias, 'dia', 'dias');
    case 'no_show': return g.dias === 0 ? 'o paciente faltou (no show)' : 'o no show está sem remarcação há ' + auPlural(g.dias, 'dia', 'dias');
    case 'builtin_sem_resposta': return 'o paciente não responde ao 1º contato (nova tentativa no D' + g.dia + ')';
    case 'builtin_descarte': return auPlural(g.dias, 'dia', 'dias') + ' depois do encerramento (D7) sem resposta';
  }
  return '';
}
function auAcaoTxt(a) {
  switch (a.tipo) {
    case 'mover': return 'mover para ' + (a.para === 'sem_retorno' ? 'Sem retorno' : 'Em negociação');
    case 'descartar': return 'descartar (motivo: ' + a.motivo + ')';
    case 'atribuir': return 'atribuir a ' + (a.atendente || '…');
    case 'etiqueta': return 'etiquetar "' + (a.texto || '…') + '"';
    case 'nota': return 'registrar nota';
    case 'alerta': return 'avisar a equipe';
  }
  return '';
}
function auFiltrosChips(f) {
  var c = [];
  if (f.unidade) c.push('Unidade ' + f.unidade);
  if (f.atendente) c.push('Responsável ' + f.atendente);
  if (f.valorMin !== undefined) c.push('Valor ≥ ' + brl(f.valorMin));
  if (f.valorMax !== undefined) c.push('Valor ≤ ' + brl(f.valorMax));
  return c;
}
function auEtapaDe(r) {
  var g = r.gatilho;
  if (g.tipo === 'builtin_sem_resposta' || g.tipo === 'lead_novo') return 'aberto';
  if (g.tipo === 'builtin_descarte') return 'sem_retorno';
  if (g.tipo === 'parado_etapa') return g.etapa;
  if (g.tipo === 'agendamento_proximo') return 'agendado';
  if (g.tipo === 'no_show') return 'negociacao';
  return 'todas';
}

/* ---- dados */
function pedirAutomacoes(forcar) {
  if (S.AUcarregando) return;
  if (S.AU && !S.AUstale && !forcar) return;
  if (S.AUerro && !S.AU && !forcar) return;
  S.AUcarregando = true;
  api('GET', '/automacoes').then(function (d) { S.AU = d; S.AUstale = false; S.AUcarregando = false; S.AUerro = null; if (S.aba === 'funil' && S.fnTab === 'pipeline') desenhar(true); })
    .catch(function (e) { S.AUcarregando = false; S.AUerro = e.message; if (S.aba === 'funil') desenhar(true); });
}
function auRecarregar() { S.AUstale = true; return carregar().then(function () { pedirAutomacoes(true); }); }

/* ---- tela */
function pipelineTela(tabs) {
  var cab = cabecalhoTela('Funil', 'Todo o caminho do lead em um só lugar: etapas, cadência do guia e as automações que movem, etiquetam e avisam sozinhas.', h('div', { class: 'tela-ac' }, [
    botao('Modelos', '', function () { auModelos(); }, 'list'),
    botao('Executar agora', '', function () { auExecutarAgora(); }, 'bolt'),
    botao('Nova automação', 'pri', function () { auEditor(null, null); }, 'plus')
  ]));
  pedirAutomacoes();
  if (!S.AU) return h('div', { class: 'tela' }, [cab, tabs, S.AUerro ? h('div', { class: 'cartao boas' }, [h('h2', { text: 'Não consegui carregar as automações' }), h('p', { class: 'mut', text: S.AUerro }), botao('Tentar de novo', 'pri', function () { S.AUerro = null; pedirAutomacoes(true); desenhar(true); })]) : h('div', { class: 'it-carrega' }, [h('i'), h('i'), h('i')])]);
  var A = S.AU, regras = A.regras;
  var ativas = regras.filter(function (r) { return r.ativa; }).length;
  var exec = 0, pend = 0; regras.forEach(function (r) { exec += r.execucoes; pend += r.pendentes || 0; });
  var ultima = A.log[0];
  return h('div', { class: 'tela' }, [cab, tabs,
    h('div', { class: 'kpis' }, [
      kpi2({ rotulo: 'Automações ativas', valor: ativas + ' de ' + regras.length, sub: regras.filter(function (r) { return !r.builtin; }).length + ' criadas pela equipe' }),
      kpi2({ rotulo: 'Disparos no total', valor: String(exec), sub: 'desde que foram criadas' }),
      kpi2({ rotulo: 'Aguardando disparo', valor: String(pend), sub: pend ? 'leads que já cumprem alguma regra' : 'nenhum lead pendente', tom: pend ? 'atencao' : '' }),
      kpi2({ rotulo: 'Último disparo', valor: ultima ? auQuando(ultima.quando) : '–', sub: ultima ? ultima.regraNome : 'ainda sem atividade' })
    ]),
    auPipeline(regras),
    h('section', { class: 'au-sec' }, [
      h('div', { class: 'sec-t' }, [h('h2', { text: 'Automações' }), h('p', { text: 'Ligue, desligue e edite. As duas do guia só aceitam ajuste de prazo; as suas aceitam tudo.' })]),
      h('div', { class: 'au-grid' }, regras.map(auCartao))
    ]),
    auAtividade(A.log)
  ]);
}

function auExecutarAgora() {
  api('POST', '/automacoes/executar', {}).then(function (d) {
    S.AU = d; S.AUstale = false;
    aviso(d.alteracoes ? d.alteracoes + (d.alteracoes === 1 ? ' alteração aplicada.' : ' alterações aplicadas.') : 'Tudo em dia: nenhuma automação tinha o que fazer agora.', d.alteracoes ? 'ok' : 'info');
    return carregar();
  }).catch(function (e) { aviso(e.message, 'erro'); });
}

/* ---- pipeline visual */
function auPipeline(regras) {
  var leads = S.D.leads;
  var cards = AU_ETAPAS.map(function (et, i) {
    var ls = leads.filter(function (l) { return et.st.indexOf(l.status) >= 0; });
    var valor = 0; ls.forEach(function (l) { valor += l.valor; });
    var estourados = ls.filter(function (l) { return l.v.limite && l.v.limite.excedido; }).length;
    var lim = M.LIMITES[et.id];
    var passos = M.PASSOS.filter(function (p) { return p.fase === et.id && p.dia !== undefined && !p.decisao; });
    var das = regras.filter(function (r) { return auEtapaDe(r) === et.id; });
    var chipsAu = das.map(function (r) {
      return h('button', { type: 'button', class: 'au-chip' + (r.ativa ? '' : ' off') + (r.builtin ? ' guia' : ''), title: r.nome + (r.ativa ? '' : ' (desligada)'), onclick: function () { auEditor(r, null); } }, [ico('bolt', 12), r.nome]);
    });
    return h('div', { class: 'pp-cel' }, [
      h('article', { class: 'pp-etapa', style: '--ec:' + AU_COR[et.id] }, [
        h('header', null, [h('b', { text: et.r }), h('span', { class: 'pp-n', text: String(ls.length) })]),
        h('div', { class: 'pp-v', text: brl(valor) }),
        lim ? h('div', { class: 'pp-lim' + (estourados ? ' ruim' : '') }, [ico('clock', 13), 'Prazo ' + lim + (lim === 1 ? ' dia' : ' dias') + (estourados ? ' · ' + estourados + ' estourado' + (estourados === 1 ? '' : 's') : '')]) : et.id === 'descarte' ? h('div', { class: 'pp-lim' }, [ico('clock', 13), 'Reativar em 30 a 60 dias']) : null,
        passos.length ? h('div', { class: 'pp-sec' }, [h('small', { text: 'Cadência do guia' }), h('div', { class: 'pp-passos' }, passos.map(function (p) { return h('span', { class: 'pp-passo', title: p.desc }, [h('b', { text: 'D' + p.dia }), p.rotulo]); }))]) : null,
        h('div', { class: 'pp-sec' }, [h('small', { text: 'Automações' }), h('div', { class: 'pp-auts' }, chipsAu.length ? chipsAu : [h('span', { class: 'pp-vazio', text: 'Nenhuma' })])]),
        et.id !== 'convertido' && et.id !== 'descarte' ? h('button', { type: 'button', class: 'pp-add', onclick: function () { auEditor(null, { nome: '', gatilho: { tipo: 'parado_etapa', etapa: et.id === 'agendado' ? 'agendado' : et.id, dias: 3 }, filtros: {}, acoes: [{ tipo: 'etiqueta', texto: '' }] }); } }, [ico('plus', 13), 'Automação aqui']) : null
      ]),
      i < AU_ETAPAS.length - 2 ? h('span', { class: 'pp-seta', 'aria-hidden': 'true' }, ico('arrow', 18)) : null
    ]);
  });
  return h('section', { class: 'au-sec' }, [
    h('div', { class: 'sec-t' }, [h('h2', { text: 'Pipeline' }), h('p', { text: 'Cada etapa com seus leads, o prazo do guia, a cadência e as automações que atuam nela. Clique numa automação para editar.' })]),
    h('div', { class: 'pp-trilho' }, cards)
  ]);
}

/* ---- cartão de automação */
function auCartao(r) {
  var chips = auFiltrosChips(r.filtros || {});
  var pendTxt = r.builtin ? null : (!r.ativa ? null : (r.pendentes ? r.pendentes + (r.pendentes === 1 ? ' lead aguarda' : ' leads aguardam') : 'ninguém aguardando'));
  var sw = h('button', { type: 'button', class: 'sw' + (r.ativa ? ' on' : ''), role: 'switch', 'aria-checked': String(r.ativa), 'aria-label': (r.ativa ? 'Desligar ' : 'Ligar ') + r.nome, onclick: function () {
    var corpo = { nome: r.nome, descricao: r.descricao, ativa: !r.ativa, gatilho: r.gatilho, filtros: r.filtros, acoes: r.acoes };
    api('PUT', '/automacoes/' + r.id, corpo).then(function () { aviso(r.nome + (r.ativa ? ' desligada.' : ' ligada.'), 'ok'); return auRecarregar(); }).catch(function (e) { aviso(e.message, 'erro'); });
  } }, h('i'));
  return h('article', { class: 'au-card' + (r.ativa ? '' : ' off') }, [
    h('header', null, [h('div', null, [h('b', { text: r.nome }), r.builtin ? h('span', { class: 'au-guia', text: 'DO GUIA' }) : null]), sw]),
    h('div', { class: 'au-frase' }, [
      h('div', null, [h('em', { text: 'QUANDO' }), h('span', { text: auGatilhoTxt(r.gatilho) })]),
      chips.length ? h('div', null, [h('em', { text: 'SE' }), h('span', null, chips.map(function (c) { return h('i', { class: 'au-f', text: c }); }))]) : null,
      h('div', null, [h('em', { text: 'ENTÃO' }), h('span', null, r.acoes.map(function (a) { return h('i', { class: 'au-a', text: auAcaoTxt(a) }); }))])
    ]),
    h('footer', null, [
      h('span', { class: 'au-meta', text: r.execucoes + (r.execucoes === 1 ? ' disparo' : ' disparos') + (r.ultima ? ' · último ' + auQuando(r.ultima) : '') + (pendTxt ? ' · ' + pendTxt : '') }),
      h('div', { class: 'au-bt' }, [
        h('button', { type: 'button', class: 'btn peq-b', onclick: function () { auEditor(r, null); } }, [ico('edit', 14), 'Editar']),
        r.builtin ? null : h('button', { type: 'button', class: 'btn peq-b', onclick: function () { auEditor(null, { nome: r.nome + ' (cópia)', descricao: r.descricao, gatilho: r.gatilho, filtros: r.filtros, acoes: r.acoes }); } }, [ico('copy', 14), 'Duplicar']),
        r.builtin ? null : h('button', { type: 'button', class: 'btn peq-b', onclick: function () { auExcluir(r); } }, [ico('x', 14), 'Excluir'])
      ])
    ])
  ]);
}
function auExcluir(r) {
  confirmar({ titulo: 'Excluir automação?', texto: 'A automação "' + r.nome + '" deixa de existir. O que ela já fez nos leads continua registrado na linha do tempo deles.', sim: 'Excluir', perigo: true, aoSim: function () {
    api('DELETE', '/automacoes/' + r.id).then(function () { aviso('Automação excluída.', 'ok'); return auRecarregar(); }).catch(function (e) { aviso(e.message, 'erro'); });
  } });
}

/* ---- atividade */
function auAtividade(log) {
  var ver = S.auLogTudo ? log : log.slice(0, 12);
  return h('section', { class: 'au-sec' }, [
    h('div', { class: 'sec-t' }, [h('h2', { text: 'Atividade recente' }), h('p', { text: 'O que as automações fizeram nos leads. Clique no lead para ver a linha do tempo.' })]),
    log.length ? h('div', { class: 'cartao au-log' }, [h('ul', null, ver.map(function (g) {
      return h('li', null, [h('span', { class: 'au-t', text: auQuando(g.quando) }), h('b', { text: g.regraNome }), h('button', { type: 'button', class: 'au-lk', text: g.leadNome, onclick: function () { abrirLead(g.leadId); } }), h('span', { class: 'au-r', text: g.resumo })]);
    })), log.length > 12 ? h('button', { type: 'button', class: 'btn peq-b', text: S.auLogTudo ? 'Mostrar menos' : 'Mostrar tudo (' + log.length + ')', onclick: function () { S.auLogTudo = !S.auLogTudo; desenhar(true); } }) : null]) : h('div', { class: 'cartao' }, vazio('Ainda não houve disparos', 'Quando uma automação agir sobre um lead, aparece aqui.'))
  ]);
}

/* ---- modelos */
function auModelos() {
  var m = modal({ titulo: 'Modelos de automação', sub: 'Comece por um modelo e ajuste antes de salvar.', largura: 860, corpo: [
    h('div', { class: 'au-modelos' }, S.AU.modelos.map(function (md) {
      return h('button', { type: 'button', class: 'au-modelo', onclick: function () { m.fechar(); auEditor(null, md); } }, [
        h('b', { text: md.nome }), h('p', { text: md.descricao }),
        h('div', { class: 'au-frase peq' }, [h('div', null, [h('em', { text: 'QUANDO' }), h('span', { text: auGatilhoTxt(md.gatilho) })]), h('div', null, [h('em', { text: 'ENTÃO' }), h('span', null, md.acoes.map(function (a) { return h('i', { class: 'au-a', text: auAcaoTxt(a) }); }))])])
      ]);
    }))
  ] });
}

/* ---- editor */
function auSel(opcoes, valor, fn, rotulo) {
  var s = h('select', { class: 'in', 'aria-label': rotulo || null, onchange: function (e) { fn(e.target.value); } }, opcoes.map(function (o) { return h('option', { value: o[0], text: o[1], selected: String(o[0]) === String(valor) }); }));
  return s;
}
function auNum(valor, min, max, fn, rotulo) {
  return h('input', { class: 'in au-num', type: 'number', min: String(min), max: String(max), value: String(valor), 'aria-label': rotulo || null, oninput: function (e) { fn(e.target.value === '' ? '' : Number(e.target.value)); } });
}

function auEditor(regra, pre) {
  var builtin = !!(regra && regra.builtin);
  var base = regra || pre || {};
  var E = JSON.parse(JSON.stringify({ nome: base.nome || '', descricao: base.descricao || '', ativa: regra ? regra.ativa : true, gatilho: base.gatilho || { tipo: 'parado_etapa', etapa: 'negociacao', dias: 3 }, filtros: base.filtros || {}, acoes: base.acoes && base.acoes.length ? base.acoes : [{ tipo: 'etiqueta', texto: '' }] }));
  var A = S.AU;
  var unidades = A.unidades.length ? A.unidades : unidadesConhecidas();
  var atendentes = A.atendentes;
  var secG = h('div', { class: 'au-bloco' }), secA = h('div', { class: 'au-bloco' }), sim = h('div', { class: 'au-sim' });
  var frase = h('p', { class: 'au-previa' });
  var timer = null, erro = h('p', { class: 'callout aviso', style: 'display:none' });

  function payload() {
    var f = {};
    if (E.filtros.unidade) f.unidade = E.filtros.unidade;
    if (E.filtros.atendente) f.atendente = E.filtros.atendente;
    if (E.filtros.valorMin !== undefined && E.filtros.valorMin !== '') f.valorMin = E.filtros.valorMin;
    if (E.filtros.valorMax !== undefined && E.filtros.valorMax !== '') f.valorMax = E.filtros.valorMax;
    return { nome: E.nome, descricao: E.descricao, ativa: E.ativa, gatilho: E.gatilho, filtros: f, acoes: E.acoes };
  }
  /* a simulação só olha quem seria afetado: campos de texto ainda vazios não devem impedi-la */
  function payloadSim() {
    var p = payload();
    p.nome = p.nome || 'simulação';
    p.acoes = p.acoes.map(function (a) { var c = JSON.parse(JSON.stringify(a)); if (c.tipo === 'atribuir' && !c.atendente) c.atendente = 'x'; if ((c.tipo === 'etiqueta' || c.tipo === 'nota' || c.tipo === 'alerta') && !c.texto) c.texto = 'x'; return c; });
    return p;
  }
  function atualizar() {
    var p = payload();
    frase.textContent = builtin ? '' : 'Quando ' + auGatilhoTxt(E.gatilho) + (auFiltrosChips(p.filtros).length ? ', e ' + auFiltrosChips(p.filtros).join(' · ').toLowerCase() : '') + ', então ' + E.acoes.map(auAcaoTxt).join(' e ') + '.';
    if (builtin) return;
    clearTimeout(timer);
    timer = setTimeout(function () {
      api('POST', '/automacoes/simular', payloadSim()).then(function (r) {
        limpar(sim);
        sim.appendChild(h('div', { class: 'au-sim-n' }, [h('b', { text: String(r.total) }), h('span', { text: r.total === 1 ? 'lead seria afetado agora' : 'leads seriam afetados agora' })]));
        sim.appendChild(h('small', { text: r.total ? brl(r.valor) + ' em orçamentos. Nada muda até você salvar e a automação estar ligada.' : 'Nenhum lead cumpre estas condições hoje. Ela passa a valer para os próximos.' }));
        if (r.amostra.length) sim.appendChild(h('div', { class: 'au-amostra' }, r.amostra.map(function (q) { return h('button', { type: 'button', class: 'lm', onclick: function () { abrirLead(q.id); } }, [avatar(q.nome), h('span', null, [h('b', { text: q.nome }), h('small', { text: ST[q.etapa] + ' · ' + brl(q.valor) })])]); })));
      }).catch(function (e) { limpar(sim); sim.appendChild(h('small', { class: 'mut', text: e.message })); });
    }, 350);
  }

  function desenharGatilho() {
    limpar(secG);
    if (builtin) {
      var g = E.gatilho;
      secG.appendChild(h('p', { class: 'mut', text: regra.descricao }));
      secG.appendChild(g.tipo === 'builtin_sem_resposta'
        ? campo('Dia da nova tentativa (D)', auNum(g.dia, 1, 5, function (v) { g.dia = v; atualizar(); }, 'Dia da nova tentativa'), 'O guia usa D2: contatou em Em aberto, sem resposta até o D2, vai para Sem retorno.')
        : campo('Dias depois do encerramento', auNum(g.dias, 1, 5, function (v) { g.dias = v; atualizar(); }, 'Dias depois do encerramento'), 'O guia usa 1 dia: no D8, sem resposta ao aviso do D7, o lead é descartado.'));
      return;
    }
    var g2 = E.gatilho;
    var linha = [auSel(AU_GATILHOS, g2.tipo, function (v) {
      var dias = { parado_etapa: 3, sem_contato: 4, lead_novo: 0, agendamento_proximo: 1, no_show: 2 }[v];
      E.gatilho = v === 'parado_etapa' ? { tipo: v, etapa: 'negociacao', dias: dias } : { tipo: v, dias: dias };
      desenharGatilho(); atualizar();
    }, 'Gatilho')];
    secG.appendChild(h('div', { class: 'au-linha' }, linha));
    var par = [];
    if (g2.tipo === 'parado_etapa') par.push(campo('Etapa', auSel([['aberto', 'Em aberto'], ['sem_retorno', 'Sem retorno'], ['negociacao', 'Em negociação'], ['agendado', 'Agendado']], g2.etapa, function (v) { g2.etapa = v; atualizar(); }, 'Etapa')));
    var rot = { parado_etapa: 'Há quantos dias', sem_contato: 'Sem contato há (dias)', lead_novo: 'Entrou há (dias, 0 = hoje)', agendamento_proximo: 'Faltam (dias, 0 = hoje)', no_show: 'No show há (dias, 0 = na hora)' }[g2.tipo];
    par.push(campo(rot, auNum(g2.dias, g2.tipo === 'parado_etapa' || g2.tipo === 'sem_contato' ? 1 : 0, 90, function (v) { g2.dias = v; atualizar(); }, rot)));
    secG.appendChild(h('div', { class: 'au-linha' }, par));
    secG.appendChild(h('h5', { text: 'Só para leads que...' }));
    secG.appendChild(h('div', { class: 'au-linha' }, [
      campo('Unidade', auSel([['', 'Todas']].concat(unidades.map(function (u) { return [u, u]; })), E.filtros.unidade || '', function (v) { E.filtros.unidade = v || undefined; atualizar(); }, 'Unidade')),
      campo('Responsável', auSel([['', 'Todos']].concat(atendentes.map(function (u) { return [u, u]; })), E.filtros.atendente || '', function (v) { E.filtros.atendente = v || undefined; atualizar(); }, 'Responsável')),
      campo('Valor mínimo (R$)', h('input', { class: 'in au-num', type: 'number', min: '0', placeholder: 'sem mínimo', value: E.filtros.valorMin !== undefined ? String(E.filtros.valorMin) : null, oninput: function (e) { E.filtros.valorMin = e.target.value === '' ? undefined : Number(e.target.value); atualizar(); } })),
      campo('Valor máximo (R$)', h('input', { class: 'in au-num', type: 'number', min: '0', placeholder: 'sem máximo', value: E.filtros.valorMax !== undefined ? String(E.filtros.valorMax) : null, oninput: function (e) { E.filtros.valorMax = e.target.value === '' ? undefined : Number(e.target.value); atualizar(); } }))
    ]));
  }

  function desenharAcoes() {
    limpar(secA);
    if (builtin) { secA.appendChild(h('p', { class: 'mut', text: 'A ação desta automação é fixa: ' + regra.acoes.map(auAcaoTxt).join(' e ') + '.' })); return; }
    E.acoes.forEach(function (a, i) {
      var campos = [];
      if (a.tipo === 'mover') campos.push(auSel([['sem_retorno', 'Sem retorno'], ['negociacao', 'Em negociação']], a.para || 'sem_retorno', function (v) { a.para = v; atualizar(); }, 'Mover para'));
      if (a.tipo === 'descartar') campos.push(auSel(A.motivos.map(function (m) { return [m, m]; }), a.motivo || A.motivos[0], function (v) { a.motivo = v; atualizar(); }, 'Motivo'));
      if (a.tipo === 'atribuir') campos.push(auSel([['', 'Escolha…']].concat(atendentes.map(function (u) { return [u, u]; })), a.atendente || '', function (v) { a.atendente = v; atualizar(); }, 'Responsável'));
      if (a.tipo === 'etiqueta') campos.push(h('input', { class: 'in', maxlength: '30', placeholder: 'Ex.: Esfriando', value: a.texto || null, 'aria-label': 'Etiqueta', oninput: function (e) { a.texto = e.target.value; atualizar(); } }));
      if (a.tipo === 'nota' || a.tipo === 'alerta') campos.push(h('input', { class: 'in', maxlength: '300', placeholder: 'Use [Nome], [Valor] e [Exame]', value: a.texto || null, 'aria-label': 'Texto', oninput: function (e) { a.texto = e.target.value; atualizar(); } }));
      if (a.tipo === 'mover' && !a.para) a.para = 'sem_retorno';
      if (a.tipo === 'descartar' && !a.motivo) a.motivo = A.motivos[0];
      secA.appendChild(h('div', { class: 'au-acao' }, [
        h('span', { class: 'au-ord', text: String(i + 1) }),
        auSel(AU_ACOES, a.tipo, function (v) { var n = { tipo: v }; if (v === 'mover') n.para = 'sem_retorno'; if (v === 'descartar') n.motivo = A.motivos[0]; E.acoes[i] = n; desenharAcoes(); atualizar(); }, 'Tipo da ação'),
        h('div', { class: 'au-acao-c' }, campos),
        h('button', { type: 'button', class: 'ic-btn', 'aria-label': 'Subir', disabled: i === 0, onclick: function () { var t = E.acoes[i - 1]; E.acoes[i - 1] = E.acoes[i]; E.acoes[i] = t; desenharAcoes(); atualizar(); } }, h('span', { text: '↑' })),
        h('button', { type: 'button', class: 'ic-btn', 'aria-label': 'Remover ação', disabled: E.acoes.length === 1, onclick: function () { E.acoes.splice(i, 1); desenharAcoes(); atualizar(); } }, ico('x', 14))
      ]));
    });
    if (E.acoes.length < 4) secA.appendChild(h('button', { type: 'button', class: 'btn peq-b', onclick: function () { E.acoes.push({ tipo: 'nota', texto: '' }); desenharAcoes(); atualizar(); } }, [ico('plus', 14), 'Adicionar ação']));
  }

  var nome = h('input', { class: 'in', maxlength: '80', placeholder: 'Ex.: Orçamento alto parado', value: E.nome || null, 'aria-label': 'Nome da automação', disabled: builtin, oninput: function (e) { E.nome = e.target.value; atualizar(); } });
  var ativa = h('label', { class: 'au-lig' }, [h('input', { type: 'checkbox', checked: E.ativa, onchange: function (e) { E.ativa = e.target.checked; } }), h('span', { text: 'Ligada (começa a valer assim que salvar)' })]);
  desenharGatilho(); desenharAcoes(); atualizar();

  var m = modal({
    titulo: builtin ? 'Automação do guia' : regra ? 'Editar automação' : 'Nova automação', sub: builtin ? regra.nome : 'Defina quando ela dispara, para quem vale e o que faz.', largura: 1040, classe: 'au-modal',
    corpo: [h('div', { class: 'au-editor' }, [
      h('div', { class: 'au-form' }, [
        campo('Nome', nome),
        h('section', null, [h('h4', { class: 'au-h', text: builtin ? 'Ajuste' : '1. Quando' }), secG]),
        h('section', null, [h('h4', { class: 'au-h', text: builtin ? 'O que faz' : '2. Então' }), secA]),
        ativa, frase, erro
      ]),
      builtin ? h('aside', { class: 'au-lado' }, [h('h4', { class: 'au-h', text: 'Como funciona' }), h('p', { class: 'mut', text: 'Esta automação vem do Guia de Atendimento do Lead e roda sozinha a cada 10 minutos e sempre que a tela é aberta. Você pode ligar, desligar e ajustar o prazo. Para voltar ao que o guia manda, use "Restaurar padrão".' }), regra.execucoes ? h('p', { class: 'mut', text: 'Já disparou ' + auPlural(regra.execucoes, 'vez', 'vezes') + (regra.ultima ? ', a última em ' + auQuando(regra.ultima) : '') + '.' }) : null])
        : h('aside', { class: 'au-lado' }, [h('h4', { class: 'au-h', text: 'Simulação ao vivo' }), sim])
    ])],
    rodape: [
      builtin ? h('button', { class: 'btn', type: 'button', onclick: function () { api('POST', '/automacoes/' + regra.id + '/restaurar', {}).then(function () { m.fechar(); aviso('Padrão do guia restaurado.', 'ok'); return auRecarregar(); }).catch(function (e) { aviso(e.message, 'erro'); }); }, text: 'Restaurar padrão' }) : null,
      h('button', { class: 'btn', type: 'button', onclick: function () { m.fechar(); }, text: 'Cancelar' }),
      h('button', { class: 'btn pri', type: 'button', onclick: function () {
        erro.style.display = 'none';
        var req = regra ? api('PUT', '/automacoes/' + regra.id, payload()) : api('POST', '/automacoes', payload());
        req.then(function () { m.fechar(); aviso(regra ? 'Automação atualizada.' : 'Automação criada.', 'ok'); return auRecarregar(); })
          .catch(function (e) { erro.textContent = e.message; erro.style.display = 'block'; });
      }, text: regra ? 'Salvar alterações' : 'Criar automação' })
    ]
  });
  setTimeout(function () { if (!builtin) nome.focus(); }, 80);
}
`;
