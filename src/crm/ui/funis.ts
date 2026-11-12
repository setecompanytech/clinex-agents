/** Aba Pipelines (cliente), parte 1: estado, kanban com arrastar e soltar, filtros e sincronização com o Clinilink. Sem backticks nem dólar-chave aqui dentro. */
export const funis = String.raw`
/* ------------------------------------------------------------------ Pipelines (funis do documento) */
var FV = {
  lista: null, rotina: null, clinilink: false, atend: [], id: lerLS('crm-fv-id') || '', dados: null, carregando: false, erro: null,
  sub: ['kanban', 'log', 'relatorio', 'executivo'].indexOf(lerLS('crm-fv-sub')) >= 0 ? lerLS('crm-fv-sub') : 'kanban',
  f: { modo: 'v2', por: 'criacao', de: '', ate: '', unidade: '', responsavel: '', q: '', estrelas: 0 },
  mais: {}, drag: null, REL: null, LOG: null, EXE: null, rde: '', rate: '', ctl: 0
};
var FV_SUBS = [['kanban', 'Kanban'], ['log', 'Log de movimentações'], ['relatorio', 'Relatório'], ['executivo', 'Painel executivo']];

function fvTopo() { return FV.dados ? FV.dados.funil.stages[0].id : null; }
function fvFunil() { return FV.dados ? FV.dados.funil : null; }
function fvEtapa(f, id) {
  var l = (f.stages || []).concat(f.removidas || []);
  for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
  return null;
}
function fvNorm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function fvClasse(label) {
  var n = fvNorm(label);
  if (/convert/.test(n)) return /organ/.test(n) ? 'ganho' : 'ganho';
  if (/perd|descart|sem retorno/.test(n)) return 'perda';
  if (/recuper/.test(n)) return 'ganho';
  return 'aberto';
}
function fvHoje() { var d = new Date(Date.now() - 3 * 3600000); return d.toISOString().slice(0, 10); }
function fvSoma(dia, n) { var d = new Date(dia + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function fvQuando(iso) { return iso ? qDia(iso) + ' ' + qHora(iso) : '–'; }
function fvUnidadeCurta(u) { return String(u || '').replace(/^CLINEX\s+/i, '').toLowerCase().replace(/(^|\s)\S/g, function (c) { return c.toUpperCase(); }); }
function fvEstrelas(n) { var s = ''; for (var i = 0; i < 5; i++) s += i < n ? '★' : '☆'; return s; }

/* ---- dados */
function fvQuery() {
  var f = FV.f, q = ['modo=' + f.modo, 'por=' + f.por];
  if (f.de) q.push('de=' + f.de);
  if (f.ate) q.push('ate=' + f.ate);
  if (f.unidade) q.push('unidade=' + encodeURIComponent(f.unidade));
  if (f.responsavel) q.push('responsavel=' + encodeURIComponent(f.responsavel));
  if (f.q) q.push('q=' + encodeURIComponent(f.q));
  return q.join('&');
}
function fvCarregarLista() {
  return api('GET', '/pipelines').then(function (d) {
    FV.lista = d.funis; FV.rotina = d.rotina; FV.clinilink = d.clinilink; FV.atend = d.atendentes || [];
    var visiveis = d.funis.filter(function (f) { return !f.oculto; });
    if (!d.funis.some(function (f) { return f.id === FV.id; })) FV.id = (visiveis[0] || d.funis[0]).id;
    return d;
  });
}
function fvCarregarCards() {
  if (!FV.id) return Promise.resolve();
  var meu = ++FV.ctl;
  FV.carregando = true;
  return api('GET', '/pipelines/' + FV.id + '/cards?' + fvQuery()).then(function (d) {
    if (meu !== FV.ctl) return;
    FV.dados = d; FV.carregando = false; FV.erro = null; S.FVstale = false;
  }).catch(function (e) { if (meu !== FV.ctl) return; FV.carregando = false; FV.erro = e.message; });
}
function fvAtualizar() {
  return fvCarregarLista().then(fvCarregarCards).then(function () { if (S.aba === 'pipelines') desenhar(true); }).catch(function (e) { FV.erro = e.message; FV.carregando = false; if (S.aba === 'pipelines') desenhar(true); });
}
/* Troca só o resumo e as colunas do kanban, sem refazer a tela (cabeçalho e filtros ficam como estão: nada pisca e o campo de busca não perde o cursor).
   Devolve false se a tela não está no formato esperado (carregando, outra aba): aí quem chamou redesenha tudo. */
function fvRepintarKanban() {
  if (S.aba !== 'pipelines' || FV.sub !== 'kanban' || !FV.dados) return false;
  var tela = raiz.querySelector('.tela'), resumo = tela && tela.querySelector(':scope > .fv-resumo');
  if (!resumo) return false;
  var quadroAntigo = tela.querySelector(':scope > .fv-quadro'), rolagem = quadroAntigo ? quadroAntigo.scrollLeft : 0;
  var novos = fvKanban().slice(1); /* o 1º item são os filtros, que continuam os mesmos */
  var velhos = Array.prototype.slice.call(tela.children), i = velhos.indexOf(resumo);
  velhos.slice(i).forEach(function (el) { tela.removeChild(el); });
  novos.forEach(function (el) { tela.appendChild(el); });
  var q = tela.querySelector(':scope > .fv-quadro'); if (q) q.scrollLeft = rolagem;
  return true;
}
function fvRecarregarCards() { return fvCarregarCards().then(function () { if (S.aba !== 'pipelines') return; if (!fvRepintarKanban()) comFoco(function () { desenhar(true); }); }); }

/* ---- tela */
function telaPipelines() {
  if (!FV.lista && !FV.carregando) { FV.carregando = true; fvAtualizar(); }
  else if (S.FVstale && !FV.carregando && FV.lista) { FV.carregando = true; fvAtualizar(); }
  var cab = cabecalhoTela('Pipelines', 'Os funis do Clinilink com colunas, histórico e relatórios. O guia de atendimento entra por cima de cada card.', h('div', { class: 'tela-ac' }, FV.lista ? [
    h('select', { class: 'in', 'aria-label': 'Funil', onchange: function (e) { FV.id = e.target.value; gravarLS('crm-fv-id', FV.id); FV.dados = null; FV.mais = {}; FV.REL = null; FV.LOG = null; FV.EXE = null; fvRecarregarCards(); desenhar(true); } },
      FV.lista.map(function (f) { return h('option', { value: f.id, text: f.nome + ' (' + f.total + ')', selected: f.id === FV.id }); })),
    botao('Sincronizar Clinilink', '', function () { fvDialogoSync(); }, 'bolt'),
    botao('Configurar funil', '', function () { fvConfig(); }, 'edit'),
    FV.dados && FV.dados.funil.dimensao === 'lead' ? botao('Novo card', 'pri', function () { fvNovoCard(); }, 'plus') : null
  ] : []));
  var tabs = h('div', { class: 'tabs-an', role: 'tablist' }, FV_SUBS.map(function (t) {
    return h('button', { type: 'button', role: 'tab', class: 'tab-an', 'aria-selected': String(FV.sub === t[0]), text: t[1], onclick: function () { FV.sub = t[0]; gravarLS('crm-fv-sub', t[0]); desenhar(true); } });
  }));
  if (FV.erro && !FV.dados) return h('div', { class: 'tela' }, [cab, h('div', { class: 'cartao boas' }, [h('h2', { text: 'Não consegui carregar os funis' }), h('p', { class: 'mut', text: FV.erro }), botao('Tentar de novo', 'pri', function () { FV.erro = null; FV.lista = null; desenhar(); })])]);
  if (!FV.lista || !FV.dados) return h('div', { class: 'tela' }, [cab, h('div', { class: 'it-carrega' }, [h('i'), h('i'), h('i')])]);
  var corpo = FV.sub === 'kanban' ? fvKanban() : FV.sub === 'log' ? fvLog() : FV.sub === 'relatorio' ? fvRelatorio() : fvExecutivo();
  return h('div', { class: 'tela' }, [cab, tabs].concat(corpo));
}

/* ---- filtros do kanban */
function fvFiltros() {
  var f = FV.f, D = FV.dados;
  function aplicar() { clearTimeout(FV.tq); FV.tq = setTimeout(function () { fvRecarregarCards(); }, 320); }
  var busca = h('input', { class: 'in', type: 'search', placeholder: 'Buscar paciente, telefone, código, item, valor…', value: f.q || null, 'aria-label': 'Buscar', oninput: function (e) { f.q = e.target.value; aplicar(); } });
  var por = h('div', { class: 'seg', role: 'group', 'aria-label': 'Filtrar período por' }, [['criacao', 'Criação'], ['agendamento', 'Agendamento'], ['conversao', 'Conversão']].map(function (p) {
    return h('button', { type: 'button', 'aria-pressed': String(f.por === p[0]), text: p[1], onclick: function () { f.por = p[0]; if (f.de || f.ate) fvRecarregarCards(); desenhar(true); } });
  }));
  var modo = h('div', { class: 'seg', role: 'group', 'aria-label': 'Recorte', title: 'V2: o período recorta todas as colunas, exceto Em aberto e Em negociação, que sempre mostram tudo. V1: o período só recorta a 1ª coluna.' }, [['v2', 'V2'], ['v1', 'V1']].map(function (p) {
    return h('button', { type: 'button', 'aria-pressed': String(f.modo === p[0]), text: p[1], onclick: function () { f.modo = p[0]; if (f.de || f.ate) fvRecarregarCards(); desenhar(true); } });
  }));
  var temFiltro = f.de || f.ate || f.unidade || f.responsavel || f.q || f.estrelas;
  return h('div', { class: 'fv-filtros' }, [
    busca,
    h('label', { class: 'fv-f' }, [h('span', { text: 'Filtrar por' }), por]),
    h('label', { class: 'fv-f' }, [h('span', { text: 'De' }), h('input', { class: 'in', type: 'date', value: f.de || null, onchange: function (e) { f.de = e.target.value; fvRecarregarCards(); } })]),
    h('label', { class: 'fv-f' }, [h('span', { text: 'Até' }), h('input', { class: 'in', type: 'date', value: f.ate || null, onchange: function (e) { f.ate = e.target.value; fvRecarregarCards(); } })]),
    h('label', { class: 'fv-f' }, [h('span', { text: 'Recorte' }), modo]),
    h('select', { class: 'in', 'aria-label': 'Unidade', onchange: function (e) { f.unidade = e.target.value; fvRecarregarCards(); } }, [h('option', { value: '', text: 'Todas as unidades' })].concat(D.unidades.map(function (u) { return h('option', { value: u, text: u, selected: f.unidade === u }); }))),
    h('select', { class: 'in', 'aria-label': 'Responsável', onchange: function (e) { f.responsavel = e.target.value; fvRecarregarCards(); } }, [h('option', { value: '', text: 'Todos os responsáveis' })].concat(D.responsaveis.map(function (u) { return h('option', { value: u, text: u, selected: f.responsavel === u }); }))),
    h('select', { class: 'in', 'aria-label': 'Estrelas', onchange: function (e) { f.estrelas = Number(e.target.value); desenhar(true); } }, [h('option', { value: '0', text: 'Todas as estrelas' })].concat([1, 2, 3, 4, 5].map(function (n) { return h('option', { value: String(n), text: fvEstrelas(n), selected: f.estrelas === n }); }))),
    temFiltro ? botao('Limpar', '', function () { FV.f = { modo: f.modo, por: 'criacao', de: '', ate: '', unidade: '', responsavel: '', q: '', estrelas: 0 }; fvRecarregarCards(); desenhar(true); }, 'x') : null
  ]);
}

/* ---- kanban */
function fvCardsDaEtapa(id) {
  var e = FV.f.estrelas;
  return FV.dados.cards.filter(function (c) { return c.stageId === id && (!e || c.estrelas === e); });
}
function fvKanban() {
  var D = FV.dados, F = D.funil, rot = FV.rotina || {};
  var todos = FV.dados.cards.filter(function (c) { return !FV.f.estrelas || c.estrelas === FV.f.estrelas; });
  var valor = soma(todos.map(function (c) { return c.valor; })), atras = todos.filter(function (c) { return c.atrasado; }).length;
  var res = rot.resultado || {};
  var rotTxt = rot.ultimaExecucao ? 'Última sincronização: ' + fvQuando(rot.ultimaExecucao) + (res.orcamentos ? ' · +' + res.orcamentos.criados + ' orçamentos' : '') + (res.agendamentos ? ' · +' + res.agendamentos.criados + ' no-show' : '') : 'Ainda não sincronizou com o Clinilink. A rotina roda sozinha às 03:00.';
  var faixa = h('div', { class: 'fv-resumo' }, [
    h('div', null, [h('b', { text: String(todos.length) }), h('span', { text: ' cards' + (todos.length !== D.total ? ' (de ' + D.total + ')' : '') })]),
    h('div', null, [h('b', { text: brl(valor) }), h('span', { text: ' em orçamentos' })]),
    h('div', { class: atras ? 'ruim' : '' }, [h('b', { text: String(atras) }), h('span', { text: ' fora da cadência' })]),
    h('div', { class: 'fv-rot' + (rot.erro ? ' ruim' : '') }, [ico('clock', 14), rot.erro ? 'Última rotina com erro: ' + rot.erro : rotTxt])
  ]);
  var cols = F.stages.map(function (e, i) { return fvColuna(e, i === 0); });
  if (!D.total) return [fvFiltros(), faixa, h('div', { class: 'cartao boas' }, [h('h2', { text: 'Este funil ainda não tem cards' }), h('p', { class: 'mut', text: F.dimensao === 'lead' ? 'Use "Novo card" para cadastrar um lead.' : 'Os cards chegam pela rotina diária do Clinilink (03:00). Para trazer agora, use "Sincronizar Clinilink".' }), F.dimensao === 'lead' ? null : botao('Sincronizar Clinilink', 'pri', function () { fvDialogoSync(); }, 'bolt')])];
  return [fvFiltros(), faixa, h('div', { class: 'fv-quadro', role: 'list' }, cols)];
}
function fvColuna(e, ehTopo) {
  var F = FV.dados.funil;
  var cs = fvCardsDaEtapa(e.id), total = soma(cs.map(function (c) { return c.valor; }));
  var lim = FV.mais[e.id] || 40;
  var atras = cs.filter(function (c) { return c.atrasado; }).length;
  var col = h('section', { class: 'fv-col', role: 'listitem', style: '--ec:' + e.color, 'data-etapa': e.id }, [
    h('header', null, [
      h('div', { class: 'fv-col-t' }, [h('b', { text: e.label, title: e.label }), h('span', { class: 'fv-n', text: String(cs.length) })]),
      h('div', { class: 'fv-col-v' }, [h('span', { text: brl(total) }), e.cadenciaDias ? h('span', { class: 'fv-sla' + (atras ? ' ruim' : ''), title: 'Cadência da coluna: ' + e.cadenciaDias + ' dia(s)' }, [ico('clock', 11), e.cadenciaDias + 'd' + (atras ? ' · ' + atras + ' fora' : '')]) : null])
    ]),
    h('div', { class: 'fv-col-c' }, cs.slice(0, lim).map(fvCartao).concat(cs.length > lim ? [h('button', { type: 'button', class: 'btn peq-b', text: 'Mostrar mais (' + (cs.length - lim) + ')', onclick: function () { FV.mais[e.id] = lim + 60; desenhar(true); } })] : cs.length ? [] : [h('p', { class: 'fv-vazia', text: 'Nenhum card' })]))
  ]);
  col.addEventListener('dragover', function (ev) { if (!FV.drag) return; ev.preventDefault(); col.classList.add('alvo'); });
  col.addEventListener('dragleave', function (ev) { if (!col.contains(ev.relatedTarget)) col.classList.remove('alvo'); });
  col.addEventListener('drop', function (ev) { ev.preventDefault(); col.classList.remove('alvo'); if (FV.drag) { var d = FV.drag; FV.drag = null; fvMover(d, e.id); } });
  return col;
}
function fvCartao(c) {
  var s = c.snap, F = FV.dados.funil;
  var permitido = F.statusPermitidos.indexOf(s.status) >= 0;
  var el = h('article', { class: 'fv-card' + (c.atrasado ? ' atrasado' : ''), draggable: 'true', tabindex: '0', role: 'button', 'aria-label': 'Abrir ' + s.paciente, 'data-card': c.cardId }, [
    h('div', { class: 'fv-card-t' }, [h('b', { text: s.paciente }), h('span', { class: 'fv-est', title: c.estrelas + ' de 5 estrelas' }, [h('b', { text: '★★★★★'.slice(0, c.estrelas) }), h('i', { text: '★★★★★'.slice(c.estrelas) })])]),
    s.subtitulo ? h('p', { class: 'fv-sub', text: s.subtitulo }) : null,
    h('div', { class: 'fv-card-v' }, [h('b', { text: brl(c.valor) }), c.valorNegociado !== null ? h('span', { class: 'fv-neg', title: 'Valor negociado (substitui o do Clinilink)', text: 'negociado' }) : null]),
    h('div', { class: 'fv-tags' }, [
      s.codigo ? h('span', { class: 'fv-tag', text: '#' + s.codigo }) : null,
      s.unidade ? h('span', { class: 'fv-tag un', text: fvUnidadeCurta(s.unidade) }) : null,
      !permitido ? h('span', { class: 'fv-tag st', title: 'Status atual no Clinilink', text: s.status }) : null
    ]),
    h('div', { class: 'fv-card-r' }, [
      h('span', { class: 'fv-desde', title: 'Entrou na coluna em ' + fvQuando(c.enteredAt), text: 'desde ' + fvQuando(c.enteredAt) }),
      c.responsavel ? h('span', { class: 'avatar peq', title: c.responsavel, text: iniciais(c.responsavel) }) : null
    ]),
    c.atrasado ? h('div', { class: 'fv-atraso' }, [ico('alert', 12), c.diasNaEtapa + ' dias na coluna (cadência de ' + (fvEtapa(F, c.stageId) || {}).cadenciaDias + ')']) : null
  ]);
  el.addEventListener('click', function () { fvAbrirCard(c.cardId); });
  el.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') fvAbrirCard(c.cardId); });
  el.addEventListener('dragstart', function (ev) { FV.drag = { cardId: c.cardId, de: c.stageId }; el.classList.add('arrasta'); try { ev.dataTransfer.setData('text/plain', c.cardId); ev.dataTransfer.effectAllowed = 'move'; } catch (e) { /* segue */ } });
  el.addEventListener('dragend', function () { el.classList.remove('arrasta'); setTimeout(function () { FV.drag = null; }, 0); });
  return el;
}

/* ---- mover (atualização otimista) */
function fvMover(d, paraId) {
  var F = FV.dados.funil;
  if (d.de === paraId) return;
  if (paraId === F.stages[0].id) { aviso('Um card não volta para a primeira coluna depois de sair dela.', 'erro'); return; }
  var card = null; FV.dados.cards.forEach(function (c) { if (c.cardId === d.cardId) card = c; });
  if (!card) return;
  var antes = { stageId: card.stageId, enteredAt: card.enteredAt, manual: card.manual, diasNaEtapa: card.diasNaEtapa, atrasado: card.atrasado };
  card.stageId = paraId; card.enteredAt = new Date().toISOString(); card.manual = true; card.diasNaEtapa = 0; card.atrasado = false;
  desenhar(true);
  api('POST', '/pipelines/' + F.id + '/cards/' + d.cardId + '/mover', { stageId: paraId, por: S.eu || undefined }).then(function (r) {
    for (var k in r) card[k] = r[k];
    aviso(card.snap.paciente + ' → ' + (fvEtapa(F, paraId) || {}).label, 'ok'); desenhar(true);
  }).catch(function (e) { for (var k in antes) card[k] = antes[k]; aviso(e.message, 'erro'); desenhar(true); });
}

/* ---- sincronização com o Clinilink */
function fvDialogoSync() {
  var modo = 'padrao', dia = fvSoma(fvHoje(), -1), de = fvSoma(fvHoje(), -30), ate = fvSoma(fvHoje(), -1);
  var campos = h('div', { class: 'fv-sync-c' });
  var saida = h('div', { class: 'fv-sync-s' });
  function pintar() {
    limpar(campos);
    if (modo === 'dia') campos.appendChild(campo('Dia', h('input', { class: 'in', type: 'date', value: dia, max: fvHoje(), onchange: function (e) { dia = e.target.value; } })));
    if (modo === 'periodo') campos.appendChild(h('div', { class: 'au-linha' }, [campo('De', h('input', { class: 'in', type: 'date', value: de, max: fvHoje(), onchange: function (e) { de = e.target.value; } })), campo('Até', h('input', { class: 'in', type: 'date', value: ate, max: fvHoje(), onchange: function (e) { ate = e.target.value; } }), 'Máximo de 60 dias (regra do documento).')]));
  }
  var opcoes = h('div', { class: 'fv-sync-o', role: 'radiogroup' }, [
    ['padrao', 'Rotina diária', 'Anteontem e ontem. É o que o servidor faz sozinho às 03:00.'],
    ['dia', 'Um dia específico', 'Útil para trazer um dia que a rotina perdeu.'],
    ['periodo', 'Carga inicial / período', 'Até 60 dias de uma vez. Cards que já existem nunca são alterados.']
  ].map(function (o) {
    var b = h('label', { class: 'fv-opc' }, [h('input', { type: 'radio', name: 'fvsync', checked: o[0] === 'padrao', onchange: function () { modo = o[0]; pintar(); } }), h('span', null, [h('b', { text: o[1] }), h('small', { text: o[2] })])]);
    return b;
  }));
  pintar();
  var enviar = h('button', { class: 'btn pri', type: 'button', text: 'Sincronizar agora' });
  var m = modal({
    titulo: 'Sincronizar com o Clinilink', sub: 'Só leitura. Orçamentos abertos vão para o funil de Orçamentos e as faltas para o No-show, sempre na primeira coluna.', largura: 620,
    corpo: [FV.clinilink ? null : h('p', { class: 'callout aviso', text: 'A chave do Clinilink (CRM_CLINILINK_API_KEY) não está configurada no servidor.' }), opcoes, campos, saida],
    rodape: [h('button', { class: 'btn', type: 'button', onclick: function () { m.fechar(); }, text: 'Fechar' }), enviar]
  });
  enviar.addEventListener('click', function () {
    var corpo = modo === 'dia' ? { dia: dia } : modo === 'periodo' ? { de: de, ate: ate } : {};
    enviar.disabled = true; enviar.textContent = 'Buscando… (o servidor pode demorar até 1 minuto para acordar)';
    limpar(saida);
    api('POST', '/pipelines/sincronizar', corpo).then(function (r) {
      var linhas = [];
      if (r.orcamentos) linhas.push('Orçamentos: ' + r.orcamentos.buscados + ' buscados, ' + r.orcamentos.criados + ' novos, ' + r.orcamentos.ignorados + ' já existiam' + (r.orcamentos.atualizados ? ' (' + r.orcamentos.atualizados + ' atualizados)' : '') + '.');
      if (r.agendamentos) linhas.push('No-show: ' + r.agendamentos.buscados + ' buscados, ' + r.agendamentos.criados + ' novos, ' + r.agendamentos.ignorados + ' já existiam.');
      r.erros.forEach(function (x) { linhas.push('Erro: ' + x); });
      saida.appendChild(h('div', { class: 'callout' + (r.erros.length ? ' aviso' : '') }, [h('b', { text: 'Período ' + dBRfull(r.janela.de) + ' a ' + dBRfull(r.janela.ate) }), h('div', null, linhas.map(function (l) { return h('p', { text: l }); }))]));
      enviar.disabled = false; enviar.textContent = 'Sincronizar de novo';
      FV.REL = null; FV.LOG = null; FV.EXE = null;
      fvAtualizar();
    }).catch(function (e) { saida.appendChild(h('p', { class: 'callout aviso', text: e.message })); enviar.disabled = false; enviar.textContent = 'Tentar de novo'; });
  });
}

/* ---- novo card (só funil de leads) */
function fvNovoCard() {
  var v = { paciente: '', contato: '', valor: '', unidade: '', observacao: '' };
  var erro = h('p', { class: 'callout aviso', style: 'display:none' });
  var inp = function (k, rot, tipo, extra) { return campo(rot, h('input', { class: 'in', type: tipo || 'text', placeholder: extra || null, oninput: function (e) { v[k] = e.target.value; } })); };
  var m = modal({
    titulo: 'Novo card', sub: 'Neste funil a tela cria cards. Em Orçamentos e No-show eles só chegam pela rotina do Clinilink.', largura: 520,
    corpo: [inp('paciente', 'Nome'), inp('contato', 'Telefone', 'tel', 'DDD + número'), inp('valor', 'Valor (R$)', 'number'), inp('unidade', 'Unidade'), campo('Observação', h('textarea', { class: 'in', rows: '3', oninput: function (e) { v.observacao = e.target.value; } })), erro],
    rodape: [h('button', { class: 'btn', type: 'button', onclick: function () { m.fechar(); }, text: 'Cancelar' }), h('button', { class: 'btn pri', type: 'button', text: 'Criar card', onclick: function () {
      api('POST', '/pipelines/' + FV.id + '/cards', { paciente: v.paciente, contato: v.contato, valor: Number(v.valor) || 0, unidade: v.unidade, observacao: v.observacao, por: S.eu || undefined }).then(function () { m.fechar(); aviso('Card criado.', 'ok'); return fvAtualizar(); }).catch(function (e) { erro.textContent = e.message; erro.style.display = 'block'; });
    } })]
  });
}
`;
