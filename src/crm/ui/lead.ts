// JavaScript do CRM (navegador), parte 4: gaveta do lead, composer de mensagem, diálogos de ação, novo lead, importar CSV.
// Dentro dele não usar crases nem "dollar-chave".
export const leadUi = String.raw`
var gaveta = null;
var RASC = {}; // rascunho do texto da mensagem por lead e passo (não se perde quando a tela atualiza)

function abrirLead(id) {
  S.leadAberto = id;
  if (gaveta) { var g = gaveta; gaveta = null; g.fechar(); S.leadAberto = id; }
  gaveta = modal({
    gaveta: true, classe: 'lead', largura: 780, cabecalho: [h('h2', { text: 'Carregando…' })], corpo: h('p', { class: 'mut', text: 'Carregando o lead…' }),
    aoFechar: function () { gaveta = null; S.leadAberto = null; history.replaceState(null, '', '#' + S.aba); }
  });
  history.replaceState(null, '', '#' + S.aba + '/lead-' + id);
  atualizarGaveta();
}
function atualizarGaveta() {
  if (!gaveta || !S.leadAberto) return;
  var id = S.leadAberto;
  api('GET', '/leads/' + id).then(function (l) { if (gaveta && S.leadAberto === id) desenharGaveta(l); })
    .catch(function (e) { aviso(e.message, 'erro'); if (gaveta) gaveta.fechar(); });
}

function desenharGaveta(l) {
  var rolagem = gaveta.corpo.scrollTop;
  var wa = linkWA(l.telefone, '');
  var cab = [
    h('div', { class: 'lead-cab' }, [avatar(l.nome), h('div', null, [
      h('h2', { text: l.nome }),
      h('p', null, [(l.exame || 'sem exame informado') + ' · ' + brl(l.valor) + ' · ' + l.telefone])
    ]), chipStatus(l.status)])
  ];
  limpar(gaveta.topo.querySelector('.m-titulos')); kids(gaveta.topo.querySelector('.m-titulos'), cab);
  limpar(gaveta.corpo);
  kids(gaveta.corpo, [
    h('div', { class: 'lead-acoes-topo' }, [
      h('a', { class: 'btn', href: wa, target: '_blank', rel: 'noopener' }, [ico('message', 16), 'WhatsApp']),
      h('a', { class: 'btn', href: 'tel:+55' + l.telefone.replace(/\D/g, '').replace(/^55/, '') }, [ico('phone', 16), 'Ligar'])
    ]),
    faixaRegras(l), blocoProximo(l), blocoRespostas(l), blocoNota(l), blocoHistorico(l), blocoDados(l)
  ]);
  gaveta.corpo.scrollTop = rolagem;
}

function faixaRegras(l) {
  var v = l.v, c = [];
  if (v.limite) c.push(pill('Etapa há ' + v.limite.usados + ' de ' + v.limite.dias + ' ' + plural(v.limite.dias, 'dia', 'dias'), v.limite.excedido ? 'pl-atrasada' : ''));
  c.push(pill('D' + v.dia, 'pl-dia'));
  (l.etiquetas || []).forEach(function (t) { c.push(pill('#' + t, 'pl-canal')); });
  c.push(pill('Tentativas hoje: ' + v.tentativasHoje + '/' + M.LIMITES.tentativasPorDia, v.tentativasHoje >= M.LIMITES.tentativasPorDia ? 'pl-atrasada' : ''));
  c.push(pill(v.contato.ok ? 'Pode contatar agora' : 'Contato bloqueado agora', v.contato.ok ? 'pl-ok' : 'pl-atrasada'));
  if (l.agendamento && l.status === 'agendado') c.push(pill('Agendado: ' + dBRfull(l.agendamento.data) + (l.agendamento.hora ? ' ' + l.agendamento.hora : ''), 'pl-canal'));
  if (l.retornoData) c.push(pill('Retorno em ' + dBRfull(l.retornoData), 'pl-canal'));
  if (l.noShow) c.push(pill('No show: enviar a Msg 10', 'pl-atrasada'));
  if (v.reativacao) c.push(pill('Reativação: ' + dBR(v.reativacao.inicio) + ' a ' + dBR(v.reativacao.fim) + ' (' + v.reativacao.situacao + ')', 'pl-canal'));
  if (l.descarte) c.push(pill('Descartado: ' + l.descarte.motivo, 'pl-motivo'));
  var out = [h('div', { class: 'chips' }, c)];
  if (!v.contato.ok && v.contato.motivo) out.push(h('p', { class: 'callout aviso', text: v.contato.motivo }));
  return h('div', { class: 'faixa-r' }, out);
}

/* ---- próximo passo + composer */
function textoEstado(l) {
  var s = l.status;
  if (s === 'convertido_ativo') return 'Convertido ativo: compareceu e pagou. Nada mais a fazer.';
  if (s === 'convertido_organico') return 'Convertido orgânico: o paciente já foi à recepção. Não entrar em contato.';
  if (s === 'aberto') return 'Primeiro contato já feito. Aguardando resposta: no D3, sem resposta, o lead vai para Sem retorno com a nova tentativa (11:30).';
  if (s === 'sem_retorno') return 'Sem passos pendentes. Se não houver resposta, no D8 o lead é descartado automaticamente (motivo: Sem retorno).';
  if (s === 'agendado') return 'Agendado. Confirmação automática registrada. No dia, registre se compareceu e pagou ou se faltou.';
  if (s === 'descarte') return l.v.reativacao && l.v.reativacao.situacao === 'encerrada' ? 'Descartado. A janela de reativação (30 a 60 dias) já encerrou.' : 'Descartado. A reativação (Msg 11) vale entre 30 e 60 dias depois do descarte.';
  return 'Sem passo pendente agora.';
}

function blocoProximo(l) {
  var px = l.v.proximo;
  var conteudo;
  if (!px) {
    conteudo = [h('p', { class: 'texto', text: textoEstado(l) })];
    if (l.status !== 'convertido_ativo' && l.status !== 'convertido_organico') conteudo.push(botao('Registrar contato avulso', '', function () { dialogoContato(l, null, ''); }, 'message'));
  } else if (px.passo.decisao) {
    conteudo = decisao(l, px);
  } else {
    conteudo = composer(l, px);
  }
  var titulo = px ? (px.passo.decisao ? 'Decisão pendente' : 'Próximo passo') : 'Situação';
  var extra = px ? h('span', { class: 'sec-d' }, [h('span', { class: 'dia-b', text: px.passo.fase === 'especial' ? '!' : 'D' + px.passo.dia }), rotuloPasso(px).replace(/^D\d+ · /, ''), ' ', pill(textoVence(px), 'pl-' + px.situacao)]) : null;
  return h('section', { class: 'sec proximo' + (px && px.prioridade === 1 && px.situacao !== 'futura' ? ' p1' : '') }, [h('h4', null, [titulo, extra]), conteudo]);
}

function decisao(l, px) {
  if (px.passo.id === 'comparecimento') {
    return [
      h('p', { class: 'texto', text: 'O agendamento era em ' + dBRfull(l.agendamento.data) + (l.agendamento.hora ? ' às ' + l.agendamento.hora : '') + '. O paciente compareceu e pagou?' }),
      h('div', { class: 'linha-b' }, [
        botao('Compareceu e pagou', 'pri ok', function () { agir(l.id, { tipo: 'compareceu' }).then(function () { aviso('Convertido ativo!', 'ok'); }); }, 'check'),
        botao('No show (faltou)', 'perigo', function () { agir(l.id, { tipo: 'noshow' }).then(function () { aviso('No show: voltou para Em negociação. Envie a mensagem 10.', 'info'); }); }, 'alert')
      ])
    ];
  }
  return [
    h('p', { class: 'texto', text: 'D8 da negociação: sem resposta. O lead deve ser descartado, sempre com motivo. Se ainda houver conversa, continue com um contato avulso.' }),
    h('div', { class: 'linha-b' }, [botao('Descartar com motivo', 'pri perigo', function () { dialogoDescartar(l, '', 'Sem resposta no D8 da negociação.'); }, 'x'), botao('Contato avulso', '', function () { dialogoContato(l, null, ''); }, 'message')])
  ];
}

function composer(l, px) {
  var p = px.passo, m = msgDef(p.msg);
  var chave = l.id + '|' + p.id;
  var R = RASC[chave] || (RASC[chave] = { i: 0, desconto: 0, texto: null });
  var textos = [{ r: m.variantes ? 'Pergunta' : 'Mensagem', t: m.corpo }].concat((m.variantes || []).map(function (v) { return { r: v.rotulo, t: v.corpo }; }));
  var area = h('textarea', { class: 'in area', rows: 8, 'aria-label': 'Texto da mensagem', spellcheck: 'true' });
  var falta = h('div', { class: 'falta' });
  var desabilitado = px.situacao === 'futura';
  function gerar() {
    var ctx = ctxMsg(l); if (R.desconto) ctx.desconto = R.desconto;
    area.value = R.texto !== null ? R.texto : preencher(textos[R.i].t, l, ctx);
    marcar();
  }
  function marcar() {
    var f = faltantes(area.value);
    limpar(falta);
    if (f.length) kids(falta, [h('span', { text: 'Falta preencher:' }), f.map(function (x) { return h('mark', { class: 'campo', text: x }); })]);
    else kids(falta, [h('span', { class: 'ok-t', text: 'Mensagem completa, pronta para enviar.' })]);
  }
  area.addEventListener('input', function () { R.texto = area.value; marcar(); });
  var seletores = [];
  if (textos.length > 1) {
    seletores.push(h('div', { class: 'seg peq', role: 'group', 'aria-label': 'Qual mensagem' }, textos.map(function (t, i) {
      return h('button', { type: 'button', 'aria-pressed': String(R.i === i), onclick: function () { R.i = i; R.texto = null; desenharGaveta(estadoLead); }, text: t.r });
    })));
  }
  if (p.id === 'desconto') {
    seletores.push(h('div', { class: 'seg peq', role: 'group', 'aria-label': 'Desconto' }, [10, 5].map(function (d) {
      return h('button', { type: 'button', 'aria-pressed': String(R.desconto === d), onclick: function () { R.desconto = d; R.texto = null; desenharGaveta(estadoLead); }, text: d + '% de desconto' });
    })));
    seletores.push(h('small', { class: 'mut', text: 'O guia pede 10% ou 5%, conforme o orçamento: escolha qual vale para este lead.' }));
  }
  var estadoLead = l;
  gerar();
  var canais = p.canais.map(function (c) { return pill(CANAL[c], 'pl-canal'); });
  var avisos = [];
  if (px.faltaLigacao) avisos.push(h('p', { class: 'callout aviso', text: 'O orçamento passa de ' + brl(M.LIMITES.ligacaoAcimaDe) + ': o WhatsApp já foi registrado, falta a ligação para concluir o primeiro contato.' }));
  else if (p.id === 'primeiro' && l.valor > M.LIMITES.ligacaoAcimaDe) avisos.push(h('p', { class: 'callout', text: 'Orçamento acima de ' + brl(M.LIMITES.ligacaoAcimaDe) + ': faça o WhatsApp e também a ligação.' }));
  if (desabilitado) avisos.push(h('p', { class: 'callout', text: 'Este passo vence em ' + dBRfull(px.vence) + '. Dá para ver a mensagem, mas o contato só pode ser registrado a partir desse dia.' }));
  if (p.id === 'noshow') avisos.push(h('p', { class: 'callout aviso', text: 'No show é a 1ª prioridade do dia. Envie a mensagem 10 para reagendar.' }));
  var enviarWA = botao('Enviar WhatsApp', '', function () { dialogoModeloWA(l, px); }, 'bolt');
  var acoes = h('div', { class: 'linha-b' }, [
    botao('Copiar', '', function () { copiar(area.value); }, 'copy'),
    botao('Abrir no WhatsApp', '', function () { window.open(linkWA(l.telefone, area.value), '_blank', 'noopener'); }, 'message'),
    enviarWA,
    botao('Registrar contato', 'pri', function () { dialogoContato(l, px, area.value); }, 'check')
  ]);
  if (desabilitado) { acoes.lastChild.setAttribute('disabled', 'true'); enviarWA.setAttribute('disabled', 'true'); }
  return [
    h('div', { class: 'chips' }, [pill('Mensagem ' + p.msg + ' · ' + m.titulo, 'pl-msg')].concat(canais)),
    p.desc ? h('p', { class: 'mut peq', text: p.desc }) : null,
    avisos, seletores, area, falta, acoes,
    h('p', { class: 'mut peq', text: 'Botões de resposta rápida desta mensagem: ' + (textos.length > 1 ? 'conforme a opção escolhida (veja abaixo, em Resposta do paciente).' : m.botoes.join(' · ')) })
  ];
}

/* ---- respostas e ações */
var CONVERTE_DESCARTE = { 'não tenho interesse': 'Desistiu', 'já fiz o exame': 'Outro lugar' };
function respostaRapida(l, b) {
  var k = b.toLowerCase();
  if (CONVERTE_DESCARTE[k]) return dialogoDescartar(l, CONVERTE_DESCARTE[k], 'O paciente tocou em "' + b + '".');
  if (k === 'agora não' || k === 'falar com atendente') return agir(l.id, { tipo: 'nota', texto: 'O paciente respondeu "' + b + '".' }).then(function () { aviso('Resposta registrada.', 'ok'); });
  agir(l.id, { tipo: 'resposta', botao: b }).then(function () { aviso('Resposta registrada.', 'ok'); });
}
function botoesDaUltima(l) {
  var evs = (l.eventos || []).filter(function (e) { return e.tipo === 'contato' && e.msg; });
  if (!evs.length) return [];
  var m = msgDef(evs[evs.length - 1].msg);
  if (!m) return [];
  var todos = m.botoes.slice();
  (m.variantes || []).forEach(function (v) { v.botoes.forEach(function (b) { if (todos.indexOf(b) < 0) todos.push(b); }); });
  return todos;
}
function blocoRespostas(l) {
  var s = l.status, b = [];
  var ativo = s === 'aberto' || s === 'sem_retorno' || s === 'negociacao';
  if (s === 'agendado') {
    b.push(botao('Compareceu e pagou', 'ok', function () { agir(l.id, { tipo: 'compareceu' }).then(function () { aviso('Convertido ativo!', 'ok'); }); }, 'check'));
    b.push(botao('No show', 'perigo', function () { agir(l.id, { tipo: 'noshow' }).then(function () { aviso('No show: volta para Em negociação.', 'info'); }); }, 'alert'));
  }
  if (ativo || (s === 'descarte' && l.reativacaoTentada)) b.push(botao('Paciente respondeu', '', function () { agir(l.id, { tipo: 'resposta' }).then(function () { aviso('Resposta registrada.', 'ok'); }); }, 'message'));
  if (ativo) b.push(botao('Agendou', 'pri', function () { dialogoAgendou(l); }, 'calendar'));
  if (s === 'negociacao') {
    b.push(botao('Deu uma data', '', function () { dialogoRetorno(l); }, 'clock'));
    b.push(botao('Parou de responder', '', function () { confirmar({ titulo: 'Parou de responder?', texto: 'O lead vai para Sem retorno e segue para o Encerramento (Msg 4).', sim: 'Sim, mover', aoSim: function () { agir(l.id, { tipo: 'parou' }); } }); }, 'arrow'));
  }
  if (ativo) b.push(botao('Descartar', 'perigo', function () { dialogoDescartar(l, '', ''); }, 'x'));
  if (s !== 'convertido_ativo' && s !== 'convertido_organico') b.push(botao('Já foi à recepção', '', function () { confirmar({ titulo: 'O paciente já foi à recepção?', texto: 'O lead vira Convertido orgânico e você não deve entrar em contato.', sim: 'Sim, já foi', aoSim: function () { agir(l.id, { tipo: 'recepcao' }).then(function () { aviso('Convertido orgânico.', 'ok'); }); } }); }, 'shield'));
  var rapidos = botoesDaUltima(l);
  var corpo = [h('div', { class: 'linha-b quebra' }, b)];
  if (rapidos.length && s !== 'convertido_ativo' && s !== 'convertido_organico') {
    corpo.push(h('p', { class: 'mut peq', text: 'O paciente tocou em um botão de resposta rápida da última mensagem? Registre com um clique:' }));
    corpo.push(h('div', { class: 'rapidos clic' }, rapidos.map(function (x) { return h('button', { class: 'rapido', type: 'button', onclick: function () { respostaRapida(l, x); } }, [h('i', { 'aria-hidden': 'true', text: '↩' }), x]); })));
  }
  return secao('Resposta do paciente e ações', corpo);
}

function blocoNota(l) {
  var t = h('textarea', { class: 'in', rows: 2, placeholder: 'Anotação sobre o lead (fica no histórico)', 'aria-label': 'Anotação' });
  return secao('Anotação', [t, h('div', { class: 'linha-b' }, [botao('Salvar anotação', '', function () { if (!t.value.trim()) return; agir(l.id, { tipo: 'nota', texto: t.value }).then(function () { aviso('Anotação salva.', 'ok'); }); }, 'edit')])]);
}

var ICONE_EV = { criado: 'plus', contato: 'message', resposta: 'check', etapa: 'arrow', agendamento: 'calendar', retorno: 'clock', descarte: 'x', nota: 'edit', automacao: 'bolt', edicao: 'edit', recepcao: 'shield', comparecimento: 'check' };
function blocoHistorico(l) {
  var evs = (l.eventos || []).slice().reverse();
  return secao('Histórico (cada tentativa, com data, canal e resultado)', h('ol', { class: 'hist' }, evs.map(function (e) {
    return h('li', { class: 'ev ev-' + e.tipo }, [
      h('span', { class: 'ev-i' }, ico(ICONE_EV[e.tipo] || 'star', 14)),
      h('div', null, [
        h('p', { text: e.texto }),
        h('small', null, [qDiaHora(e.quando), e.atendente ? ' · ' + e.atendente : '', e.auto ? ' · automático' : '', e.canal ? ' · ' + CANAL[e.canal] : '', e.msg ? ' · Msg ' + e.msg : ''])
      ])
    ]);
  })));
}

function blocoDados(l) {
  var f = {
    nome: h('input', { class: 'in', value: l.nome }), telefone: h('input', { class: 'in', value: l.telefone, inputmode: 'tel' }), exame: h('input', { class: 'in', value: l.exame || '' }),
    valor: h('input', { class: 'in', type: 'number', min: '0', step: '1', value: String(l.valor || 0) }), origem: h('input', { class: 'in', value: l.origem || '' }),
    unidade: h('input', { class: 'in', value: l.unidade || '', list: 'lista-unidades' }),
    atendente: h('select', { class: 'in' }, [h('option', { value: '', text: '— sem responsável —' })].concat(listaAtendentes().map(function (a) { return h('option', { value: a, text: a, selected: l.atendente === a ? 'selected' : null }); }))),
    obs: h('textarea', { class: 'in', rows: 2 })
  };
  f.obs.value = l.obs || '';
  return secao('Dados do lead', [
    h('div', { class: 'grade-f' }, [campo('Nome', f.nome), campo('Telefone', f.telefone), campo('Exame ou consulta', f.exame), campo('Valor do orçamento (R$)', f.valor, 'Acima de R$ 500 o primeiro contato exige ligação.'), campo('Origem', f.origem), campo('Unidade', f.unidade), campo('Responsável', f.atendente)]),
    listaUnidades(),
    campo('Observações', f.obs),
    h('p', { class: 'mut peq', text: 'Entrou em ' + dBRfull(l.d0) + ' (D0). Cadastrado em ' + qDiaHora(l.criadoEm) + '.' }),
    h('div', { class: 'linha-b' }, [botao('Salvar dados', '', function () {
      agir(l.id, { tipo: 'editar', campos: { nome: f.nome.value, telefone: f.telefone.value, exame: f.exame.value, valor: Number(f.valor.value), origem: f.origem.value, unidade: f.unidade.value, atendente: f.atendente.value, obs: f.obs.value } }).then(function () { aviso('Dados salvos.', 'ok'); });
    }, 'check')])
  ]);
}

/* ------------------------------------------------------------------ diálogos de ação */
function dialogoContato(l, px, texto) {
  var passo = px ? px.passo : null;
  var canalPadrao = px && px.faltaLigacao ? 'ligacao' : (passo && passo.canais.length ? passo.canais[0] : 'whatsapp');
  var m = modal({ titulo: 'Registrar contato', sub: l.nome + (passo ? ' · ' + rotuloPasso(px) : ' · contato avulso'), largura: 540, classe: 'peq', corpo: h('div') });
  function etapa1() {
    limpar(m.corpo);
    kids(m.corpo, [
      h('div', { class: 'gate' }, [ico('shield', 26), h('h3', { text: 'Antes de cada contato' }), h('p', { text: 'O paciente já foi à recepção?' }), h('small', { text: 'Se já foi, ele virou Convertido orgânico e não se entra em contato.' })]),
      h('div', { class: 'linha-b centro' }, [
        botao('Sim, já foi à recepção', '', function () { agir(l.id, { tipo: 'recepcao' }).then(function () { m.fechar(); aviso('Convertido orgânico. Nenhum contato foi feito.', 'ok'); }); }, 'shield'),
        botao('Não, pode contatar', 'pri', etapa2, 'arrow')
      ])
    ]);
  }
  function etapa2() {
    limpar(m.corpo);
    var canal = canalPadrao;
    var obs = h('textarea', { class: 'in', rows: 3, placeholder: 'Resultado ou observação (opcional)', 'aria-label': 'Observação' });
    var erro = h('div');
    var enviar = botao('Registrar contato', 'pri', registrar, 'check');
    var radios = h('div', { class: 'canais' }, ['whatsapp', 'ligacao'].map(function (c) {
      var rec = passo && passo.canais.indexOf(c) >= 0;
      var b = h('button', { type: 'button', class: 'canal-o', 'aria-pressed': String(canal === c), onclick: function () { canal = c; radios.querySelectorAll('.canal-o').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); validar(); } }, [ico(c === 'whatsapp' ? 'message' : 'phone', 22), h('b', { text: CANAL[c] }), rec ? h('small', { text: 'recomendado' }) : null]);
      return b;
    }));
    function validar() {
      limpar(erro); enviar.removeAttribute('disabled');
      if (!l.v.contato.ok) { kids(erro, h('p', { class: 'callout aviso', text: l.v.contato.motivo })); enviar.setAttribute('disabled', 'true'); return; }
      if (canal === 'whatsapp' && texto && faltantes(texto).length) { kids(erro, h('p', { class: 'callout aviso', text: 'A mensagem ainda tem campos sem preencher: ' + faltantes(texto).join(' ') + '. Volte e complete o texto.' })); enviar.setAttribute('disabled', 'true'); }
    }
    function registrar() {
      var corpoTexto = canal === 'whatsapp' ? (texto || obs.value || '') : (obs.value || '');
      if (canal === 'whatsapp' && obs.value && texto) corpoTexto = texto + '\n[obs: ' + obs.value + ']';
      enviar.setAttribute('disabled', 'true');
      agir(l.id, { tipo: 'contato', canal: canal, naoFoiRecepcao: true, passo: passo ? passo.id : undefined, msg: passo ? passo.msg : undefined, texto: corpoTexto || undefined })
        .then(function () { m.fechar(); aviso('Contato registrado (' + CANAL[canal] + ').', 'ok'); })
        .catch(function () { enviar.removeAttribute('disabled'); });
    }
    kids(m.corpo, [
      h('p', { class: 'texto', text: 'Por onde você fez o contato?' }), radios,
      texto ? h('div', { class: 'linha-b' }, [botao('Abrir WhatsApp com a mensagem', '', function () { window.open(linkWA(l.telefone, texto), '_blank', 'noopener'); }, 'message')]) : null,
      campo('Observação', obs), erro,
      h('p', { class: 'mut peq', text: 'Ficam registrados data, hora, canal, mensagem e quem fez. Regras: máx. ' + M.LIMITES.tentativasPorDia + ' tentativas por dia, só entre ' + M.LIMITES.janelaInicioH + 'h e ' + M.LIMITES.janelaFimH + 'h.' }),
      h('div', { class: 'linha-b' }, [botao('Cancelar', '', function () { m.fechar(); }), enviar])
    ]);
    validar();
  }
  etapa1();
}

/* Envio pelo WhatsApp com modelo aprovado: o que vai para o paciente aparece e é conferido antes de enviar. */
function dialogoModeloWA(l, px) {
  var m = modal({ titulo: 'Enviar WhatsApp por modelo', sub: l.nome + ' · final ' + String(l.telefone).slice(-4), largura: 560, classe: 'peq', corpo: h('div', null, h('p', { class: 'mut', text: 'Carregando os modelos…' })) });
  api('GET', '/whatsapp/modelos?lead=' + encodeURIComponent(l.id)).then(function (r) {
    limpar(m.corpo);
    var st = r.status;
    if (!st.ativo) { kids(m.corpo, [h('p', { class: 'callout aviso', text: 'O disparo pelo WhatsApp está desligado neste ambiente. Peça ao administrador para ativar (variável DISPARO_WHATSAPP).' }), h('div', { class: 'linha-b' }, [botao('Fechar', '', function () { m.fechar(); })])]); return; }
    var doPasso = px && px.passo && px.passo.msg ? r.modelos.filter(function (x) { return x.msg === px.passo.msg; })[0] : null;
    var atual = doPasso || r.modelos[0], campos = [];
    var sel = h('select', { class: 'in', 'aria-label': 'Modelo' }, r.modelos.map(function (x) { return h('option', { value: x.id, selected: x.id === atual.id, text: (x.msg ? 'Msg ' + x.msg + ' · ' : '') + x.titulo + ' (' + x.id + ')' }); }));
    var area = h('div', { class: 'wa-vars' });
    var erro = h('div');
    var ok = h('input', { type: 'checkbox', id: 'wa-ok' });
    var enviar = botao('Enviar agora', 'pri', enviarAgora, 'bolt');
    enviar.setAttribute('disabled', 'true');
    ok.addEventListener('change', function () { if (ok.checked) enviar.removeAttribute('disabled'); else enviar.setAttribute('disabled', 'true'); });
    function desenhar() {
      limpar(area); campos = [];
      atual.variaveis.forEach(function (v, i) {
        var inp = h('input', { class: 'in', type: 'text', maxlength: '200', 'aria-label': v.rotulo }); inp.value = v.valor; if (v.id === 'atendente' && S.eu) inp.value = primeiroNome(S.eu); campos.push(inp);
        kids(area, campo('{{' + (i + 1) + '}} ' + v.rotulo, inp));
      });
    }
    sel.addEventListener('change', function () { atual = r.modelos.filter(function (x) { return x.id === sel.value; })[0]; desenhar(); });
    function enviarAgora() {
      limpar(erro); enviar.setAttribute('disabled', 'true');
      api('POST', '/leads/' + l.id + '/whatsapp', { modelo: atual.id, parametros: campos.map(function (c) { return c.value; }), passo: px ? px.passo.id : undefined, msg: px ? px.passo.msg : undefined })
        .then(function () { return carregar(); })
        .then(function () { m.fechar(); aviso('Mensagem enviada pelo WhatsApp (modelo ' + atual.titulo + ') e contato registrado.', 'ok'); })
        .catch(function (e) { kids(erro, h('p', { class: 'callout aviso', text: e.message })); enviar.removeAttribute('disabled'); });
    }
    desenhar();
    kids(m.corpo, [
      st.restrito ? h('p', { class: 'callout aviso', text: 'Fase de testes: só números liberados recebem. Os demais são recusados.' }) : null,
      campo('Modelo aprovado no WhatsApp', sel, 'Idioma do envio: ' + r.modelos.map(function (x) { return x.id + ' = ' + x.idioma; }).join(', ')),
      area,
      h('p', { class: 'mut peq', text: 'As variáveis entram nesta ordem no texto do modelo ({{1}}, {{2}}…). Hoje: ' + st.enviadosHoje + ' de ' + st.limiteDia + ' envios. O mesmo modelo não volta ao mesmo lead em 24 h.' }),
      h('label', { class: 'check-l' }, [ok, h('span', { text: 'Conferi o paciente e as variáveis. Este texto vai para o WhatsApp dele.' })]),
      erro,
      h('div', { class: 'linha-b' }, [botao('Cancelar', '', function () { m.fechar(); }), enviar])
    ]);
  }).catch(function (e) { limpar(m.corpo); kids(m.corpo, h('p', { class: 'callout aviso', text: e.message })); });
}

function dialogoDescartar(l, preset, motivoTexto) {
  var escolhido = preset || '';
  var erro = h('p', { class: 'callout aviso', style: 'display:none', text: 'Descarte sempre com motivo: escolha um.' });
  var chips = h('div', { class: 'motivos' }, M.MOTIVOS_DESCARTE.map(function (mo) {
    var b = h('button', { type: 'button', class: 'motivo-o', 'aria-pressed': String(escolhido === mo), onclick: function () { escolhido = mo; chips.querySelectorAll('.motivo-o').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); erro.style.display = 'none'; } }, mo);
    return b;
  }));
  var m = modal({
    titulo: 'Descartar ' + primeiroNome(l.nome), sub: 'Descarte sempre com motivo.', largura: 520, classe: 'peq',
    corpo: [motivoTexto ? h('p', { class: 'mut', text: motivoTexto }) : null, chips, erro],
    rodape: [botao('Cancelar', '', function () { m.fechar(); }), botao('Descartar', 'pri perigo', function () {
      if (!escolhido) { erro.style.display = ''; return; }
      agir(l.id, { tipo: 'descartar', motivo: escolhido }).then(function () { m.fechar(); aviso('Lead descartado (' + escolhido + ').', 'ok'); });
    })]
  });
}

function dialogoAgendou(l) {
  var data = h('input', { class: 'in', type: 'date', min: S.D.hoje, value: S.D.hoje, 'aria-label': 'Data' });
  var hora = h('input', { class: 'in', type: 'time', 'aria-label': 'Hora' });
  var exame = h('input', { class: 'in', value: l.exame || '' });
  var m = modal({
    titulo: 'Agendou', sub: l.nome, largura: 480, classe: 'peq',
    corpo: [h('div', { class: 'grade-f' }, [campo('Data', data), campo('Hora', hora)]), campo('Exame ou consulta agendado', exame), h('p', { class: 'mut peq', text: 'A confirmação é automática. No dia, você registra se compareceu e pagou ou se faltou.' })],
    rodape: [botao('Cancelar', '', function () { m.fechar(); }), botao('Confirmar agendamento', 'pri', function () {
      if (!data.value) { aviso('Informe a data do agendamento.', 'erro'); return; }
      agir(l.id, { tipo: 'agendou', data: data.value, hora: hora.value || undefined, exame: exame.value || undefined }).then(function () { m.fechar(); aviso('Agendado! Confirmação automática registrada.', 'ok'); });
    })]
  });
}

function dialogoRetorno(l) {
  var data = h('input', { class: 'in', type: 'date', min: S.D.hoje, 'aria-label': 'Data combinada' });
  var m = modal({
    titulo: 'Deu uma data', sub: 'Retorno personalizado · ' + l.nome, largura: 460, classe: 'peq',
    corpo: [campo('Data combinada para retomar', data), h('p', { class: 'mut peq', text: 'Nessa data o lead entra na fila com a mensagem 9 (2 horários). A cadência da negociação fica em pausa até lá.' })],
    rodape: [botao('Cancelar', '', function () { m.fechar(); }), botao('Combinar retorno', 'pri', function () {
      if (!data.value) { aviso('Informe a data combinada.', 'erro'); return; }
      agir(l.id, { tipo: 'retorno', data: data.value }).then(function () { m.fechar(); aviso('Retorno personalizado combinado.', 'ok'); });
    })]
  });
}

/* ------------------------------------------------------------------ novo lead, importar, responsáveis */
function dialogoNovoLead() {
  var f = {
    nome: h('input', { class: 'in', autofocus: 'true', placeholder: 'Nome do paciente' }), telefone: h('input', { class: 'in', inputmode: 'tel', placeholder: '(91) 98162-8017' }), exame: h('input', { class: 'in', placeholder: 'Ex.: ultrassom abdominal' }),
    valor: h('input', { class: 'in', type: 'number', min: '0', step: '1', placeholder: '0' }), origem: h('input', { class: 'in', placeholder: 'Instagram, indicação, Google…' }),
    unidade: h('input', { class: 'in', placeholder: 'Ex.: Guamá', list: 'lista-unidades' }),
    atendente: h('select', { class: 'in' }, [h('option', { value: '', text: '— sem responsável —' })].concat(listaAtendentes().map(function (a) { return h('option', { value: a, text: a, selected: S.eu === a ? 'selected' : null }); })))
  };
  var m = modal({
    titulo: 'Novo lead', sub: 'Entra em Em aberto. O dia de hoje é o D0 e o primeiro contato fica para o D1.', largura: 560, classe: 'peq',
    corpo: [h('div', { class: 'grade-f' }, [campo('Nome', f.nome), campo('Telefone com DDD', f.telefone), campo('Exame ou consulta de interesse', f.exame), campo('Valor do orçamento (R$)', f.valor), campo('Origem', f.origem), campo('Unidade', f.unidade), campo('Responsável', f.atendente)]), listaUnidades()],
    rodape: [botao('Cancelar', '', function () { m.fechar(); }), botao('Cadastrar lead', 'pri', function () { criar(false); })]
  });
  function criar(forcar) {
    api('POST', '/leads', { nome: f.nome.value, telefone: f.telefone.value, exame: f.exame.value, valor: Number(f.valor.value || 0), origem: f.origem.value, unidade: f.unidade.value, atendente: f.atendente.value || undefined, forcar: forcar })
      .then(function (novo) { m.fechar(); aviso('Lead cadastrado.', 'ok'); carregar().then(function () { abrirLead(novo.id); }); })
      .catch(function (e) {
        if (e.codigo === 'duplicado') confirmar({ titulo: 'Telefone já cadastrado', texto: e.message + ' Cadastrar mesmo assim?', sim: 'Cadastrar mesmo assim', aoSim: function () { criar(true); } });
        else aviso(e.message, 'erro');
      });
  }
}

function splitCSV(linha, d) {
  var out = [], cur = '', asp = false;
  for (var i = 0; i < linha.length; i++) {
    var c = linha.charAt(i);
    if (c === '"') { if (asp && linha.charAt(i + 1) === '"') { cur += '"'; i++; } else asp = !asp; }
    else if (c === d && !asp) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map(function (x) { return x.trim(); });
}
function numero(t) {
  var s = String(t || '').replace(/[^0-9,.\-]/g, '');
  if (!s) return 0;
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  var n = parseFloat(s); return isFinite(n) ? n : 0;
}
function parseCSV(texto) {
  var linhas = texto.replace(/\r/g, '').split('\n').filter(function (x) { return x.trim(); });
  if (!linhas.length) return [];
  var d = linhas[0].split(';').length > linhas[0].split(',').length ? ';' : ',';
  var cab = splitCSV(linhas[0], d).map(function (x) { return x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); });
  var temCab = cab.some(function (x) { return x === 'nome'; });
  var ix = { nome: 0, telefone: 1, exame: 2, valor: 3, origem: 4, unidade: 5 };
  if (temCab) {
    var achar = function (nomes, padrao) { for (var i = 0; i < cab.length; i++) if (nomes.indexOf(cab[i]) >= 0) return i; return padrao; };
    ix = { nome: achar(['nome'], -1), telefone: achar(['telefone', 'celular', 'whatsapp', 'fone'], -1), exame: achar(['exame', 'interesse', 'exame ou consulta', 'procedimento'], -1), valor: achar(['valor', 'orcamento', 'valor do orcamento'], -1), origem: achar(['origem', 'canal'], -1), unidade: achar(['unidade', 'clinica', 'filial'], -1) };
  }
  return linhas.slice(temCab ? 1 : 0).map(function (l) {
    var c = splitCSV(l, d), g = function (k) { return ix[k] >= 0 ? c[ix[k]] || '' : ''; };
    return { nome: g('nome'), telefone: g('telefone'), exame: g('exame'), valor: numero(g('valor')), origem: g('origem'), unidade: g('unidade') };
  });
}
function dialogoImportar() {
  var area = h('textarea', { class: 'in area', rows: 9, placeholder: 'nome;telefone;exame;valor;origem;unidade\nMaria Souza;91981628017;ultrassom;220;Instagram;Guamá', 'aria-label': 'Conteúdo do CSV' });
  var arq = h('input', { type: 'file', accept: '.csv,text/csv,text/plain', class: 'in' });
  var info = h('p', { class: 'mut peq' });
  arq.addEventListener('change', function () { var f = arq.files[0]; if (!f) return; var r = new FileReader(); r.onload = function () { area.value = String(r.result); previa(); }; r.readAsText(f, 'utf-8'); });
  function previa() { var n = parseCSV(area.value).length; info.textContent = n ? n + ' ' + plural(n, 'linha reconhecida', 'linhas reconhecidas') + '.' : ''; }
  area.addEventListener('input', previa);
  var m = modal({
    titulo: 'Importar planilha (CSV)', sub: 'Colunas: nome, telefone, exame, valor, origem, unidade (com ou sem cabeçalho, separado por ; ou ,).', largura: 620, classe: 'peq',
    corpo: [campo('Arquivo CSV', arq), campo('…ou cole aqui', area), info, h('p', { class: 'mut peq', text: 'Telefones repetidos de leads ativos são ignorados. Todos entram em Em aberto com D0 = hoje.' })],
    rodape: [botao('Cancelar', '', function () { m.fechar(); }), botao('Importar', 'pri', function () {
      var linhas = parseCSV(area.value);
      if (!linhas.length) { aviso('Cole ou escolha um arquivo com leads.', 'erro'); return; }
      api('POST', '/leads/importar', { linhas: linhas, atendente: S.eu || undefined }).then(function (r) {
        m.fechar(); aviso(r.criados + ' ' + plural(r.criados, 'lead importado', 'leads importados') + (r.ignorados.length ? ', ' + r.ignorados.length + ' ignorados.' : '.'), r.criados ? 'ok' : 'erro'); carregar();
      }).catch(function (e) { aviso(e.message, 'erro'); });
    })]
  });
}

function dialogoAtendentes() {
  var area = h('textarea', { class: 'in area', rows: 7, 'aria-label': 'Responsáveis, um por linha' });
  area.value = listaAtendentes().join('\n');
  var m = modal({
    titulo: 'Responsáveis', sub: 'Quem atende os leads. Um nome por linha.', largura: 460, classe: 'peq', corpo: [area, h('p', { class: 'mut peq', text: 'O nome de quem está logado entra nas mensagens como [Atendente] e no histórico de cada contato.' })],
    rodape: [botao('Cancelar', '', function () { m.fechar(); }), botao('Salvar', 'pri', function () {
      api('PUT', '/atendentes', { lista: area.value.split('\n') }).then(function () { m.fechar(); aviso('Responsáveis salvos.', 'ok'); carregar(); }).catch(function (e) { aviso(e.message, 'erro'); });
    })]
  });
}
`;
