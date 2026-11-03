/** Aba Pipelines (cliente), parte 2: detalhe do card (com o guia de atendimento por cima) e configuração do funil. Sem backticks nem dólar-chave aqui dentro. */
export const funis2 = String.raw`
/* ------------------------------------------------------------------ detalhe do card */
var FV_TABS_CARD = [['resumo', 'Resumo'], ['historico', 'Histórico'], ['followups', 'Follow-ups'], ['contatos', 'Contatos e guia']];
var FV_MSG_POR_ETAPA = [[/primeiro contato|em aberto/, 1], [/nova tentativa/, 2], [/desconto/, 3], [/retorno personalizado/, 9], [/em negociacao/, 5], [/no-show|retomada/, 10], [/sem retorno/, 4], [/descarte|perdido/, 11]];

function fvMsgDaEtapa(label) {
  var n = fvNorm(label);
  for (var i = 0; i < FV_MSG_POR_ETAPA.length; i++) if (FV_MSG_POR_ETAPA[i][0].test(n)) return msgDef(FV_MSG_POR_ETAPA[i][1]);
  return null;
}
function fvPassosDaEtapa(label) {
  var n = fvNorm(label), fase = /em aberto|primeiro/.test(n) ? 'aberto' : /nova tentativa|desconto|sem retorno/.test(n) ? 'sem_retorno' : /negociacao/.test(n) ? 'negociacao' : null;
  return fase ? M.PASSOS.filter(function (p) { return p.fase === fase && p.dia !== undefined && !p.decisao; }) : [];
}

function fvAbrirCard(cardId) {
  var estado = { aba: 'resumo', D: null };
  var corpo = h('div', { class: 'fv-dr' });
  var barra = h('div', { class: 'it-abas', role: 'tablist' });
  var botoes = {};
  var m = modal({ gaveta: true, cabecalho: [h('h2', { text: 'Carregando…' })], corpo: [barra, corpo], largura: 860, classe: 'fv-drawer' });
  FV_TABS_CARD.forEach(function (t) {
    botoes[t[0]] = h('button', { type: 'button', role: 'tab', class: 'it-aba', 'aria-selected': 'false', text: t[1], onclick: function () { estado.aba = t[0]; pintar(); } });
    barra.appendChild(botoes[t[0]]);
  });
  function carregar_() {
    return api('GET', '/pipelines/card/' + cardId).then(function (D) { estado.D = D; pintar(); }).catch(function (e) { limpar(corpo); corpo.appendChild(vazio('Não consegui abrir o card', e.message)); });
  }
  function recarregar() { return carregar_().then(function () { return fvRecarregarCards(); }); }
  function pintar() {
    var D = estado.D; if (!D) return;
    var a = D.atribuicoes.filter(function (x) { return x.funilId === FV.id; })[0] || D.atribuicoes[0];
    var etapa = fvEtapa(a, a.stageId) || { label: '?' };
    var tit = m.topo.querySelector('.m-titulos'); limpar(tit);
    kids(tit, [h('h2', null, [a.snap.paciente]), h('p', null, [a.funil + ' · ', h('b', { text: etapa.label }), ' desde ' + fvQuando(a.enteredAt)])]);
    FV_TABS_CARD.forEach(function (t) { botoes[t[0]].setAttribute('aria-selected', String(t[0] === estado.aba)); });
    limpar(corpo);
    var fn = { resumo: fvAbaResumo, historico: fvAbaHistorico, followups: fvAbaFollowups, contatos: fvAbaContatos }[estado.aba];
    kids(corpo, fn(D, a, etapa, recarregar, m));
  }
  carregar_();
}

function fvLinha(r, v) { return h('div', { class: 'fv-kv' }, [h('span', { text: r }), h('b', { text: v === undefined || v === null || v === '' ? '–' : String(v) })]); }

function fvAbaResumo(D, a, etapa, recarregar, m) {
  var s = a.snap, x = D.extras, F = a;
  var vNeg = h('input', { class: 'in', type: 'number', min: '0', step: '0.01', placeholder: 'sem valor negociado', value: x.valorNegociado !== undefined ? String(x.valorNegociado) : null, 'aria-label': 'Valor negociado' });
  var resp = h('input', { class: 'in', list: 'fv-resp', value: x.responsavel || null, placeholder: 'Quem atende este paciente', 'aria-label': 'Responsável' });
  var prox = h('input', { class: 'in', type: 'date', value: x.proximoContato || null, 'aria-label': 'Próximo contato' });
  var obs = h('textarea', { class: 'in', rows: '3', placeholder: 'Anotações internas do CRM', 'aria-label': 'Observações do CRM' }); obs.value = x.observacoesCrm || '';
  var destinos = a.stages.filter(function (e, i) { return i > 0 && e.id !== a.stageId; });
  var sel = h('select', { class: 'in', 'aria-label': 'Mover para' }, [h('option', { value: '', text: 'Mover para…' })].concat(destinos.map(function (e) { return h('option', { value: e.id, text: e.label }); })));
  return [
    h('datalist', { id: 'fv-resp' }, (FV.atend || []).map(function (n) { return h('option', { value: n }); })),
    h('div', { class: 'fv-dr-grid' }, [
      h('section', null, [h('h4', { class: 'au-h', text: 'Do Clinilink (congelado)' }),
        fvLinha('Código', s.codigo), fvLinha('Unidade', s.unidade), fvLinha('Criado em', s.criadoEm ? dBRfull(s.criadoEm.slice(0, 10)) : null), fvLinha('Status no Clinilink', s.status),
        fvLinha('Valor do orçamento', brl(a.originSnapshot.valor)), fvLinha('Telefone', s.contato), fvLinha('Convênio', s.convenio), fvLinha('Origem', s.origem), fvLinha('Prioridade', s.prioridade),
        s.itens && s.itens.length ? h('div', { class: 'fv-kv col' }, [h('span', { text: 'Itens' }), h('ul', { class: 'lista-o' }, s.itens.map(function (i) { return h('li', { text: i }); }))]) : null,
        s.observacao ? h('div', { class: 'fv-kv col' }, [h('span', { text: 'Observação' }), h('p', { text: s.observacao })]) : null
      ]),
      h('section', null, [h('h4', { class: 'au-h', text: 'Trabalho no CRM' }),
        campo('Valor negociado (R$)', vNeg, 'Substitui o valor do Clinilink no kanban. Zero é válido.'), campo('Responsável', resp), campo('Próximo contato', prox), campo('Observações do CRM', obs),
        botao('Salvar', 'pri', function () {
          api('PUT', '/pipelines/extras/' + s.id, { valorNegociado: vNeg.value === '' ? null : Number(vNeg.value), responsavel: resp.value, proximoContato: prox.value, observacoesCrm: obs.value, por: S.eu || undefined })
            .then(function () { aviso('Card atualizado.', 'ok'); return recarregar(); }).catch(function (e) { aviso(e.message, 'erro'); });
        }),
        h('h4', { class: 'au-h', style: 'margin-top:18px', text: 'Mover de coluna' }),
        h('div', { class: 'au-linha' }, [sel, botao('Mover', '', function () {
          if (!sel.value) return;
          api('POST', '/pipelines/' + a.funilId + '/cards/' + s.id + '/mover', { stageId: sel.value, por: S.eu || undefined }).then(function () { aviso('Card movido.', 'ok'); return recarregar(); }).catch(function (e) { aviso(e.message, 'erro'); });
        })]),
        h('p', { class: 'mut peq', text: 'Um card não volta para a primeira coluna depois de sair dela.' }),
        botao('Remover do funil', '', function () {
          confirmar({ titulo: 'Remover este card?', texto: 'O card some do funil e não volta mais, nem pela rotina do Clinilink. O histórico fica guardado.', sim: 'Remover', perigo: true, aoSim: function () {
            api('POST', '/pipelines/' + a.funilId + '/cards/' + s.id + '/remover', { por: S.eu || undefined }).then(function () { m.fechar(); aviso('Card removido.', 'ok'); return fvRecarregarCards(); }).catch(function (e) { aviso(e.message, 'erro'); });
          } });
        }, 'x')
      ])
    ])
  ];
}

function fvAbaHistorico(D, a) {
  var h_ = a.historico, linhas = [];
  for (var i = h_.length - 1; i >= 0; i--) {
    var m = h_[i], e = fvEtapa(a, m.stageId) || { label: 'Coluna excluída', color: '#6c7390' };
    var prox = h_[i + 1] ? new Date(h_[i + 1].em).getTime() : Date.now();
    var dias = Math.max(0, Math.round((prox - new Date(m.em).getTime()) / 86400000));
    linhas.push(h('li', { style: '--ec:' + e.color }, [
      h('i', { class: 'fv-ponto' }),
      h('div', null, [h('b', { text: i === 0 ? 'Entrou em ' + e.label : 'Foi para ' + e.label }),
        h('small', { text: fvQuando(m.em) + ' · ' + (m.por ? 'por ' + m.por : m.manual ? 'sem autor' : 'automático / rotina') + (i === h_.length - 1 ? ' · está aqui há ' + dias + ' dia(s)' : ' · ficou ' + dias + ' dia(s)') })])
    ]));
  }
  return [h('ul', { class: 'fv-tl' }, linhas), h('p', { class: 'mut peq', text: 'Mostra também colunas que já foram excluídas do funil, para o histórico continuar completo.' })];
}

function fvAbaFollowups(D, a, etapa, recarregar) {
  var cid = a.snap.id, v = { data: fvSoma(fvHoje(), 1), hora: '', descricao: '', resultado: '', proximaData: '' };
  var erro = h('p', { class: 'callout aviso', style: 'display:none' });
  var form = h('div', { class: 'fv-form' }, [
    h('div', { class: 'au-linha' }, [campo('Data', h('input', { class: 'in', type: 'date', value: v.data, onchange: function (e) { v.data = e.target.value; } })), campo('Hora', h('input', { class: 'in', type: 'time', onchange: function (e) { v.hora = e.target.value; } }))]),
    campo('O que combinar', h('input', { class: 'in', maxlength: '500', oninput: function (e) { v.descricao = e.target.value; } })),
    campo('Resultado (depois de feito)', h('input', { class: 'in', maxlength: '300', oninput: function (e) { v.resultado = e.target.value; } })),
    campo('Próxima data', h('input', { class: 'in', type: 'date', onchange: function (e) { v.proximaData = e.target.value; } })), erro,
    botao('Adicionar follow-up', 'pri', function () { api('POST', '/pipelines/followups/' + cid, v).then(function () { aviso('Follow-up criado.', 'ok'); return recarregar(); }).catch(function (e) { erro.textContent = e.message; erro.style.display = 'block'; }); }, 'plus')
  ]);
  var lista = D.followups.length ? h('ul', { class: 'fv-lista' }, D.followups.map(function (f) {
    return h('li', null, [h('div', null, [h('b', { text: dBRfull(f.data) + (f.hora ? ' ' + f.hora : '') }), h('p', { text: f.descricao }), f.resultado ? h('small', { text: 'Resultado: ' + f.resultado }) : null, f.proximaData ? h('small', { text: ' · próxima: ' + dBRfull(f.proximaData) }) : null]),
      h('button', { type: 'button', class: 'ic-btn', 'aria-label': 'Excluir follow-up', onclick: function () { api('DELETE', '/pipelines/followups/' + f.id).then(recarregar); } }, ico('x', 14))]);
  })) : vazio('Nenhum follow-up ainda');
  return [h('div', { class: 'fv-dr-grid' }, [h('section', null, [h('h4', { class: 'au-h', text: 'Novo follow-up' }), form]), h('section', null, [h('h4', { class: 'au-h', text: 'Agendados e feitos' }), lista])])];
}

/* contatos + o guia de atendimento por cima do card */
function fvAbaContatos(D, a, etapa, recarregar) {
  var s = a.snap, lead = { nome: s.paciente, valor: a.valor, exame: (s.itens && s.itens[0]) || '' };
  var msg = fvMsgDaEtapa(etapa.label), passos = fvPassosDaEtapa(etapa.label);
  var texto = msg ? preencher(msg.corpo, lead, { atendente: S.eu || '' }) : '';
  var hojeDia = fvHoje();
  var hojeN = D.contatos.filter(function (c) { return (c.tipo === 'Mandou WhatsApp' || c.tipo === 'Ligou') && new Date(new Date(c.data).getTime() - 3 * 3600000).toISOString().slice(0, 10) === hojeDia; }).length;
  var ab = janelaAberta(), tent = M.LIMITES.tentativasPorDia;
  var confirma = h('input', { type: 'checkbox', id: 'fv-rec' });
  var tipo = 'Mandou WhatsApp', obsC = h('input', { class: 'in', maxlength: '500', placeholder: 'Observação (opcional)', 'aria-label': 'Observação do contato' });
  var erro = h('p', { class: 'callout aviso', style: 'display:none' });
  var tipos = h('div', { class: 'seg', role: 'group' }, ['Mandou WhatsApp', 'Ligou', 'Respondeu', 'Outro'].map(function (t) {
    return h('button', { type: 'button', 'aria-pressed': String(t === tipo), text: t, onclick: function (e) { tipo = t; Array.prototype.forEach.call(e.target.parentNode.children, function (b) { b.setAttribute('aria-pressed', String(b.textContent === t)); }); } });
  }));
  var guia = h('section', { class: 'fv-guia' }, [
    h('h4', { class: 'au-h', text: 'Guia de atendimento para esta coluna' }),
    h('div', { class: 'chips' }, [
      pill(ab ? 'Contato liberado agora' : 'Fora do horário (' + M.LIMITES.janelaInicioH + 'h às ' + M.LIMITES.janelaFimH + 'h)', ab ? 'pl-ok' : 'pl-atrasada'),
      pill('Tentativas hoje: ' + hojeN + '/' + tent, hojeN >= tent ? 'pl-atrasada' : ''),
      etapa.cadenciaDias ? pill('Cadência da coluna: ' + etapa.cadenciaDias + ' dia(s)', a.atrasado ? 'pl-atrasada' : '') : null
    ]),
    passos.length ? h('div', { class: 'pp-passos', style: 'margin-top:8px' }, passos.map(function (p) { return h('span', { class: 'pp-passo', title: p.desc }, [h('b', { text: 'D' + p.dia }), p.rotulo]); })) : null,
    msg ? h('div', { class: 'fv-msg' }, [h('b', { text: 'Mensagem ' + msg.n + ': ' + msg.titulo }), h('pre', { text: texto }),
      faltantes(texto).length ? h('p', { class: 'mut peq', text: 'Complete antes de enviar: ' + faltantes(texto).join(', ') }) : null,
      h('div', { class: 'au-linha' }, [botao('Copiar', '', function () { copiar(texto); }, 'copy'), s.contato ? h('a', { class: 'btn', href: linkWA(s.contato, texto), target: '_blank', rel: 'noopener noreferrer' }, [ico('message', 16), 'Abrir no WhatsApp']) : null])
    ]) : h('p', { class: 'mut', text: 'Esta coluna não tem uma mensagem-modelo do guia.' })
  ]);
  var regis = h('section', null, [
    h('h4', { class: 'au-h', text: 'Registrar contato' }), tipos, obsC,
    h('label', { class: 'au-lig' }, [confirma, h('span', { text: 'Confirmei que o paciente ainda não foi à recepção' })]), erro,
    botao('Registrar', 'pri', function () {
      api('POST', '/pipelines/contatos/' + s.id, { tipo: tipo, observacao: obsC.value, naoFoiRecepcao: confirma.checked }).then(function () { aviso('Contato registrado.', 'ok'); return recarregar(); })
        .catch(function (e) { erro.textContent = e.message; erro.style.display = 'block'; });
    }, 'check'),
    h('p', { class: 'mut peq', text: 'Regras de ouro: confirmar a recepção, contatos só das 8h às 19h e no máximo 2 tentativas por dia. Mandar a mensagem de fato é feito no WhatsApp; aqui fica o registro.' })
  ]);
  var lista = D.contatos.length ? h('ul', { class: 'fv-lista' }, D.contatos.map(function (c) { return h('li', null, [h('div', null, [h('b', { text: c.tipo }), h('small', { text: ' · ' + fvQuando(c.data) }), c.observacao ? h('p', { text: c.observacao }) : null])]); })) : vazio('Nenhum contato registrado');
  return [h('div', { class: 'fv-dr-grid' }, [h('div', { class: 'fv-col-dr' }, [guia, regis]), h('section', null, [h('h4', { class: 'au-h', text: 'Histórico de contatos' }), lista])])];
}

/* ------------------------------------------------------------------ configurar funil */
function fvConfig() {
  var F0 = FV.dados.funil;
  var E = JSON.parse(JSON.stringify({ nome: F0.nome, stages: F0.stages, automacoes: F0.automacoes, oculto: !!F0.oculto, valorEstrela: F0.valorEstrela && F0.valorEstrela.length === 4 ? F0.valorEstrela : [300, 800, 1500, 3000] }));
  var destinos = {};
  var secE = h('div', { class: 'fv-cfg-l' }), secA = h('div', { class: 'au-bloco' });
  var erro = h('p', { class: 'callout aviso', style: 'display:none' });
  function contagem(id) { return FV.dados.cards.filter(function (c) { return c.stageId === id; }).length; }
  function removidas() { return F0.stages.filter(function (s) { return !E.stages.some(function (n) { return n.id === s.id; }); }); }

  function pintarEtapas() {
    limpar(secE);
    E.stages.forEach(function (e, i) {
      var topo = i === 0;
      secE.appendChild(h('div', { class: 'fv-cfg-e' }, [
        h('input', { type: 'color', value: e.color, 'aria-label': 'Cor', onchange: function (ev) { e.color = ev.target.value.toUpperCase(); } }),
        h('input', { class: 'in', value: e.label, maxlength: '60', 'aria-label': 'Nome da coluna', oninput: function (ev) { e.label = ev.target.value; } }),
        h('input', { class: 'in au-num', type: 'number', min: '1', max: '365', placeholder: 'SLA (dias)', title: 'Cadência da coluna em dias (alerta de atraso no card)', value: e.cadenciaDias ? String(e.cadenciaDias) : null, 'aria-label': 'Cadência em dias', oninput: function (ev) { e.cadenciaDias = ev.target.value === '' ? undefined : Number(ev.target.value); } }),
        h('button', { type: 'button', class: 'ic-btn', disabled: i <= 1, 'aria-label': 'Subir', onclick: function () { var t = E.stages[i - 1]; E.stages[i - 1] = E.stages[i]; E.stages[i] = t; pintarTudo(); } }, h('span', { text: '↑' })),
        h('button', { type: 'button', class: 'ic-btn', disabled: topo || i === E.stages.length - 1, 'aria-label': 'Descer', onclick: function () { var t = E.stages[i + 1]; E.stages[i + 1] = E.stages[i]; E.stages[i] = t; pintarTudo(); } }, h('span', { text: '↓' })),
        h('button', { type: 'button', class: 'ic-btn btn-rm', disabled: topo || E.stages.length === 1, 'aria-label': 'Excluir coluna', onclick: function () { E.stages.splice(i, 1); pintarTudo(); } }, ico('x', 14))
      ]));
      if (topo) secE.lastChild.appendChild(h('span', { class: 'fv-topo-sel', text: 'entrada' }));
    });
    secE.appendChild(botao('Adicionar coluna', '', function () { E.stages.push({ id: '', label: 'Nova coluna', color: '#6C7390' }); pintarTudo(); }, 'plus'));
    removidas().forEach(function (e) {
      var n = contagem(e.id);
      if (!n) return;
      var outros = E.stages.slice(1);
      if (!destinos[e.id] || !outros.some(function (o) { return o.id === destinos[e.id]; })) destinos[e.id] = outros.length ? outros[0].id : '';
      secE.appendChild(h('div', { class: 'callout aviso' }, [h('b', { text: 'A coluna "' + e.label + '" tem ' + n + ' cards.' }), h('div', { class: 'au-linha' }, [h('span', { text: 'Mover para:' }), h('select', { class: 'in', onchange: function (ev) { destinos[e.id] = ev.target.value; } }, outros.map(function (o) { return h('option', { value: o.id, text: o.label, selected: destinos[e.id] === o.id }); }))])]));
    });
  }
  function pintarAuto() {
    limpar(secA);
    var topo = E.stages[0];
    E.automacoes.forEach(function (r, i) {
      r.deStageId = topo.id || r.deStageId;
      var par = [];
      if (r.tipo === 'apos_horas') par.push(campo('Depois de (horas)', h('input', { class: 'in au-num', type: 'number', min: '1', value: String(r.horas || ''), oninput: function (ev) { r.horas = Number(ev.target.value); } })));
      else par.push(campo('Horário', h('input', { class: 'in', type: 'time', value: r.horario || '', onchange: function (ev) { r.horario = ev.target.value; } })));
      if (r.tipo === 'horario_semanal') par.push(campo('Dia da semana', h('select', { class: 'in', onchange: function (ev) { r.diaSemana = Number(ev.target.value); } }, ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map(function (d, k) { return h('option', { value: String(k), text: d, selected: r.diaSemana === k }); }))));
      secA.appendChild(h('div', { class: 'fv-cfg-a' }, [
        h('div', { class: 'fv-cfg-a-h' }, [h('b', { text: 'Automação ' + (i + 1) }),
          h('button', { type: 'button', class: 'ic-btn btn-rm', title: 'Remover esta automação', 'aria-label': 'Remover a automação ' + (i + 1), onclick: function () { E.automacoes.splice(i, 1); pintarAuto(); } }, ico('x', 15))]),
        h('div', { class: 'au-linha' }, [
          campo('Tipo', auSel([['apos_horas', 'Após X horas'], ['horario_diario', 'Todo dia em um horário'], ['horario_semanal', 'Toda semana em um dia e horário']], r.tipo, function (v) { r.tipo = v; if (v === 'apos_horas' && !r.horas) r.horas = 24; if (v !== 'apos_horas' && !r.horario) r.horario = '08:00'; if (v === 'horario_semanal' && r.diaSemana === undefined) r.diaSemana = 1; pintarAuto(); })),
          campo('Mover de', h('input', { class: 'in', value: topo.label, disabled: true })),
          campo('Para', auSel(E.stages.slice(1).map(function (e) { return [e.id, e.label]; }), r.paraStageId, function (v) { r.paraStageId = v; }))
        ]),
        h('div', { class: 'au-linha' }, par)
      ]));
    });
    secA.appendChild(botao('Adicionar automação', '', function () { E.automacoes.push({ tipo: 'apos_horas', deStageId: topo.id, paraStageId: (E.stages[1] || {}).id, horas: 24 }); pintarAuto(); }, 'plus'));
    if (!E.automacoes.length) secA.appendChild(h('p', { class: 'mut peq', text: 'Sem automações. Elas movem sozinhas cards que ficaram na primeira coluna (o servidor aplica a cada minuto).' }));
  }
  function pintarTudo() { pintarEtapas(); pintarAuto(); }
  pintarTudo();
  var est = E.valorEstrela;
  var estrelasEl = h('div', { class: 'au-linha' }, [1, 2, 3, 4].map(function (k) { return campo('A partir de (' + (k + 1) + ' ★)', h('input', { class: 'in au-num', type: 'number', min: '0', value: String(est[k - 1]), oninput: function (ev) { est[k - 1] = Number(ev.target.value); } })); }));
  var m = modal({
    titulo: 'Configurar funil', sub: F0.nome, largura: 920, classe: 'au-modal',
    corpo: [
      campo('Nome do funil', h('input', { class: 'in', value: E.nome, maxlength: '80', oninput: function (ev) { E.nome = ev.target.value; } })),
      h('section', null, [h('h4', { class: 'au-h', text: 'Colunas' }), secE,
        h('p', { class: 'mut peq', text: 'A primeira coluna é a entrada do funil e não pode ser movida. Ganho e perda são reconhecidos pelo NOME da coluna (convertido, perdido, descarte, sem retorno, recuperado): renomear muda os números dos relatórios.' })]),
      h('section', null, [h('h4', { class: 'au-h', text: 'Automações de avanço' }), secA]),
      h('section', null, [h('h4', { class: 'au-h', text: 'Estrelas por valor' }), estrelasEl]),
      h('label', { class: 'au-lig' }, [h('input', { type: 'checkbox', checked: E.oculto, onchange: function (ev) { E.oculto = ev.target.checked; } }), h('span', { text: 'Esconder este funil da lista' })]), erro
    ],
    rodape: [h('button', { class: 'btn', type: 'button', onclick: function () { m.fechar(); }, text: 'Cancelar' }), h('button', { class: 'btn pri', type: 'button', text: 'Salvar configuração', onclick: function () {
      erro.style.display = 'none';
      api('PUT', '/pipelines/' + F0.id, { nome: E.nome, stages: E.stages, destinos: destinos, automacoes: E.automacoes, oculto: E.oculto, valorEstrela: E.valorEstrela, por: S.eu || undefined })
        .then(function () { m.fechar(); aviso('Funil atualizado.', 'ok'); return fvAtualizar(); }).catch(function (e) { erro.textContent = e.message; erro.style.display = 'block'; });
    } })]
  });
}
`;
