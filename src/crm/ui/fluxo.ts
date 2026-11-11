// JavaScript do CRM (navegador), parte 2: fluxo clicável, modal de cada etapa, calendário D0-D8 e cartão de mensagem.
// Dentro dele não usar crases nem "dollar-chave".
export const fluxo = String.raw`
var DIAS_COL = ['D0', 'D1', 'D2', 'D3', 'D4', 'D7', 'D8'];
var HIST_ITEM = [];
var itemModal = null;

/* ------------------------------------------------------------------ cartão de mensagem (Mensagens e modais) */
function botoesRapidos(lista) {
  return h('div', { class: 'rapidos' }, lista.map(function (b) { return h('span', { class: 'rapido' }, [h('i', { 'aria-hidden': 'true', text: '↩' }), b]); }));
}
function msgCard(m, o) {
  o = o || {};
  var corpo = h('div', { class: 'msg-c' }, [
    m.nota ? h('p', { class: 'msg-nota', text: m.nota }) : null,
    h('div', { class: 'msg-t' }, m.corpo.split('\n\n').map(function (p) { return h('p', null, textoComCampos(p)); })),
    botoesRapidos(m.botoes)
  ]);
  var variantes = (m.variantes || []).map(function (v) {
    return h('div', { class: 'msg-v' }, [
      h('b', { text: v.rotulo }),
      h('div', { class: 'msg-t' }, v.corpo.split('\n\n').map(function (p) { return h('p', null, textoComCampos(p)); })),
      botoesRapidos(v.botoes)
    ]);
  });
  var tudo = m.corpo + (m.variantes || []).map(function (v) { return '\n\n' + v.rotulo.toUpperCase() + '\n' + v.corpo; }).join('');
  return h('article', { class: 'msg g-' + m.grupo, id: 'msg-' + m.n }, [
    h('header', null, [
      h('div', null, [h('b', null, [h('span', { class: 'msg-n', text: String(m.n) }), m.titulo.toUpperCase()]), h('small', { text: m.quando })]),
      h('div', { class: 'msg-acoes' }, [
        m.situacao ? h('span', { class: 'pill ' + (m.situacao === 'aprovada' ? 'pl-ok' : 'pl-hoje'), title: m.situacao === 'aprovada' ? 'Mensagem aprovada: pode enviar.' : 'Mensagem ainda pendente de aprovação.', text: m.situacao === 'aprovada' ? 'Aprovada' : 'Pendente' }) : null,
        h('button', { class: 'mini', type: 'button', title: 'Copiar o texto com os campos [entre colchetes]', onclick: function () { copiar(m.variantes ? tudo : m.corpo); } }, [ico('copy', 14), 'Copiar']),
        o.verEtapa ? h('button', { class: 'mini', type: 'button', onclick: function () { abrirItem(m.item); } }, [ico('flow', 14), 'Ver etapa']) : null
      ])
    ]),
    corpo, variantes
  ]);
}

/* ------------------------------------------------------------------ modal de um card do fluxo */
function entradasDe(id) {
  var out = [];
  M.ITENS.forEach(function (it) { (it.saidas || []).forEach(function (s) { if (s.para === id) out.push({ de: it.id, rotulo: s.rotulo, excecao: s.excecao }); }); });
  return out;
}
function leadsDoItem(id) {
  if (!S.D) return [];
  return S.D.leads.filter(function (l) {
    if (l.v.item === id) return true;
    var it = itemDef(id);
    return it && it.tipo === 'passo' && l.v.proximo && l.v.proximo.passo.item === id && l.status === 'negociacao';
  });
}
function diasTira(dias) {
  return h('div', { class: 'tira' }, DIAS_COL.map(function (d) {
    return h('span', { class: 'tira-d' + ((dias || []).indexOf(d) >= 0 ? ' on' : '') + (d === 'D8' ? ' fim' : ''), text: d });
  }));
}
function linkItem(id, rotulo, excecao) {
  var it = itemDef(id);
  return h('button', { class: 'lk' + (excecao ? ' ex' : ''), type: 'button', onclick: function () { mostrarItem(id, true); } }, [
    h('span', { class: 'lk-r', text: rotulo }), ico('arrow', 14), h('b', { text: it ? it.titulo : id })
  ]);
}

/* ------------------------------------------------------------------ automação e template de mensagem da etapa (dentro do modal) */
var AU_ETAPA_ITEM = { lead: 'aberto', aberto: 'aberto', primeiro: 'aberto', tentativa: 'sem_retorno', desconto: 'sem_retorno', semretorno: 'sem_retorno', negociacao: 'negociacao', retorno: 'negociacao', agendado: 'agendado' };
function auEtapaDoItem(it) { return AU_ETAPA_ITEM[it.id] || (it.pai && AU_ETAPA_ITEM[it.pai]) || null; }
/* mensagens do guia da etapa: as do próprio card e as dos passos dela (a Msg 1 mora no passo "Primeiro contato", por exemplo) */
function msgsDaEtapa(it) {
  var ns = [];
  function pega(x) { (x.msgs || []).forEach(function (n) { if (ns.indexOf(n) < 0) ns.push(n); }); }
  pega(it);
  (it.cadencia || []).forEach(function (pid) { var p = itemDef(pid); if (p) pega(p); });
  M.ITENS.forEach(function (x) { if (x.pai === it.id) pega(x); });
  // "Em aberto" não tem texto próprio: a mensagem dela é a do primeiro contato, que é para onde ela leva
  if (!ns.length) (it.saidas || []).forEach(function (s) { var d = itemDef(s.para); if (d && !s.excecao && d.tipo !== 'regra' && !ns.length) pega(d); });
  return ns.map(function (n) { return msgDef(n); }).filter(function (m) { return !!m; });
}
/* itens do No-show: o gatilho que faz sentido para cada etapa e quais automações já existentes pertencem a ela (valem para os leads com no-show do CRM) */
function auAlvoNS(it) {
  var id = it.tipo === 'passo' ? it.pai : it.id;
  if (id === 'ns-noshow' || id === 'ns-retomada') return { gat: { tipo: 'no_show', dias: id === 'ns-noshow' ? 0 : 2 }, aqui: true, casa: function (r) { return r.gatilho.tipo === 'no_show'; } };
  if (id === 'ns-semretorno') return { gat: { tipo: 'parado_etapa', etapa: 'sem_retorno', dias: 3 }, aqui: true, casa: function (r) { return auEtapaDe(r) === 'sem_retorno'; } };
  if (id === 'ns-agendado') return { gat: { tipo: 'agendamento_proximo', dias: 1 }, aqui: true, casa: function (r) { return auEtapaDe(r) === 'agendado'; } };
  return { gat: { tipo: 'sem_contato', dias: 4 }, aqui: false, casa: function (r) { return auEtapaDe(r) === 'todas'; } };
}
function auPresetItem(it, comMensagem) {
  var et = auEtapaDoItem(it), g, ns = it.fluxo === 'noshow' ? auAlvoNS(it) : null;
  if (ns) g = ns.gat;
  else if (it.id === 'lead') g = { tipo: 'lead_novo', dias: 0 };
  else if (et) g = { tipo: 'parado_etapa', etapa: et, dias: M.LIMITES[et] || 3 };
  else g = { tipo: 'sem_contato', dias: 4 };
  var msg = msgsDaEtapa(it)[0] || null;
  var texto = msg ? msg.corpo.replace(/\[(seu )?exame( ou consulta)?\]/gi, '[Exame]').slice(0, 1000) : '';
  var p = { nome: '', gatilho: g, filtros: {}, acoes: [{ tipo: 'etiqueta', texto: '' }] };
  if (comMensagem) {
    p.nome = 'Mensagem: ' + it.titulo;
    p.acoes = [{ tipo: 'mensagem', texto: texto }];
    p.titulo = 'Novo template de mensagem';
    p.sub = 'Escreva a mensagem e diga quando ela deve ficar pronta para o lead. ' + (msg ? 'O texto abaixo veio da mensagem ' + msg.n + ' do guia: ajuste como quiser.' : '');
  } else { p.titulo = 'Nova automação'; p.sub = 'Para ' + it.titulo + '. Defina quando ela dispara, para quem vale e o que faz.'; }
  return p;
}
function blocoAutomacao(it) {
  var host = h('div', { class: 'it-auto' });
  var et = auEtapaDoItem(it);
  var guia = msgsDaEtapa(it);
  function linha(r) {
    return h('li', null, [
      h('b', { text: r.nome }),
      h('small', null, [r.ativa ? 'Ligada' : 'Desligada', ' · quando ' + auGatilhoTxt(r.gatilho)]),
      h('button', { class: 'btn peq-b', type: 'button', onclick: function () { auEditor(r, null); } }, [ico('edit', 14), 'Editar'])
    ]);
  }
  function pintar() {
    limpar(host);
    if (!S.AU) { host.appendChild(h('div', { class: 'it-carrega' }, [h('i'), h('i'), h('i')])); return; }
    var ns = it.fluxo === 'noshow' ? auAlvoNS(it) : null;
    var regras = S.AU.regras.filter(function (r) { return ns ? ns.casa(r) : it.id === 'lead' ? r.gatilho.tipo === 'lead_novo' : auEtapaDe(r) === (et || 'todas'); });
    var comMsg = regras.filter(function (r) { return r.acoes.some(function (a) { return a.tipo === 'mensagem'; }); });
    var semMsg = regras.filter(function (r) { return comMsg.indexOf(r) < 0; });
    var aqui = !!(et || it.id === 'lead' || (ns && ns.aqui)), onde = aqui ? 'nesta etapa' : 'em qualquer etapa';
    host.appendChild(h('section', { class: 'it-au-c' }, [
      h('header', null, [ico('bolt', 18), h('h4', { text: 'Automações ' + (aqui ? 'desta etapa' : 'gerais') })]),
      h('p', { text: 'Mova, etiquete, atribua ou avise a equipe sozinho quando um lead cumprir uma condição ' + onde + '.' }),
      it.fluxo === 'noshow' ? h('p', { class: 'mut peq', text: 'Valem para os leads com no-show registrado no CRM. As colunas do funil No-show do Clinilink têm as automações próprias, em Pipelines.' }) : null,
      semMsg.length ? h('ul', { class: 'it-au-l' }, semMsg.map(linha)) : h('p', { class: 'it-au-vazio', text: 'Nenhuma automação criada ' + onde + ' ainda.' }),
      botao('Criar automação', 'pri', function () { auEditor(null, auPresetItem(it, false)); }, 'plus')
    ]));
    host.appendChild(h('section', { class: 'it-au-c' }, [
      h('header', null, [ico('message', 18), h('h4', { text: 'Template de mensagem' })]),
      h('p', { text: 'Crie um texto pronto, com [Nome], [Valor] e [Exame]. Quando a condição acontecer, ele fica preenchido no lead para a equipe copiar e enviar.' }),
      guia.length ? h('div', { class: 'it-au-guia' }, [h('span', { text: 'Do guia:' })].concat(guia.map(function (m) { return pill('Mensagem ' + m.n + ' · ' + m.titulo, 'pl-msg'); }))) : null,
      comMsg.length ? h('ul', { class: 'it-au-l' }, comMsg.map(linha)) : h('p', { class: 'it-au-vazio', text: 'Nenhum template próprio ' + onde + ' ainda.' }),
      botao('Criar template de mensagem', 'pri', function () { auEditor(null, auPresetItem(it, true)); }, 'message')
    ]));
  }
  pintar();
  setTimeout(function () { if (itemModal) itemModal.refAuto = pintar; }, 0);
  if (!S.AU || S.AUstale) {
    api('GET', '/automacoes').then(function (d) { S.AU = d; S.AUstale = false; S.AUerro = null; pintar(); })
      .catch(function (e) { limpar(host); host.appendChild(vazio('Não consegui carregar as automações', e.message)); });
  }
  return host;
}

function corpoItem(it) {
  var C = [];
  var chips = [];
  if (it.num) chips.push(pill('Etapa ' + it.num.replace('.', ''), 'pl-num'));
  if (it.selo) chips.push(pill(it.selo, 'pl-selo'));
  if (it.limite) chips.push(pill('Limite: ' + it.limite, 'pl-lim'));
  (it.canais || []).forEach(function (c) { chips.push(pill(c, 'pl-canal')); });
  if (chips.length) C.push(h('div', { class: 'chips' }, chips));
  C.push(h('p', { class: 'resumo', text: it.resumo }));
  if (it.dias && it.dias.length) C.push(secao('Em que dias acontece', diasTira(it.dias)));
  C.push(blocoAutomacao(it));
  var Topo = C; C = []; var Dir = [];
  if (it.fazer && it.fazer.length) C.push(secao('Como fazer', h('ul', { class: 'lista-o' }, it.fazer.map(function (f) { return h('li', { text: f }); }))));
  if (it.cadencia) {
    C.push(secao('Cadência desta etapa', h('div', { class: 'cad' }, it.cadencia.map(function (pid) {
      var p = itemDef(pid);
      var dia = (p.dias || [''])[0];
      return h('button', { class: 'cad-p', type: 'button', onclick: function () { mostrarItem(pid, true); } }, [h('b', { text: dia }), h('span', { text: p.titulo }), h('small', { text: p.sub })]);
    }))));
  }
  (it.extra || []).forEach(function (x) { C.push(h('div', { class: 'callout' }, [h('b', { text: x.titulo }), h('p', { text: x.texto })])); });
  if (it.motivos) C.push(secao('Motivos de descarte', h('div', { class: 'chips' }, it.motivos.map(function (m) { return pill(m, 'pl-motivo'); }))));
  if (it.msgs && it.msgs.length) {
    C.push(secao(it.msgs.length > 1 ? 'Mensagens prontas' : 'Mensagem pronta', h('div', { class: 'msgs-modal' }, it.msgs.map(function (n) { return msgCard(msgDef(n)); }))));
  }
  if (it.pai) Dir.push(secao('Faz parte de', h('div', { class: 'lks' }, linkItem(it.pai, 'Etapa'))));
  var saidas = (it.saidas || []);
  if (saidas.length) Dir.push(secao('Para onde vai', h('div', { class: 'lks' }, saidas.map(function (s) { return linkItem(s.para, s.rotulo, s.excecao); }))));
  var ent = entradasDe(it.id);
  if (ent.length) Dir.push(secao('De onde vem', h('div', { class: 'lks' }, ent.map(function (e) { return linkItem(e.de, e.rotulo, e.excecao); }))));
  if (it.regras && it.regras.length) {
    Dir.push(secao('Regras de ouro que valem aqui', h('div', { class: 'regras-mini' }, it.regras.map(function (n) {
      var r = (it.fluxo === 'noshow' ? M.NOSHOW.REGRAS : M.REGRAS_OURO)[n - 1];
      return h('div', { class: 'rm' }, [h('span', { class: 'rm-n', text: String(r.n) }), h('div', null, [h('b', { text: r.titulo }), h('p', { text: r.texto })])]);
    }))));
  }
  if (it.fluxo === 'noshow') { var secN = cardsNS(it); if (secN) Dir.push(secN); }
  var ls = leadsDoItem(it.id);
  if (S.D && it.tipo !== 'regra' && it.id !== 'lead' && it.fluxo !== 'noshow') {
    Dir.push(secao('Leads aqui agora', ls.length ? h('div', { class: 'leads-mini' }, ls.slice(0, 40).map(function (l) {
      return h('button', { class: 'lm', type: 'button', onclick: function () { abrirLead(l.id); } }, [avatar(l.nome), h('span', null, [h('b', { text: l.nome }), h('small', { text: (l.exame || 'sem exame') + ' · ' + brl(l.valor) })]), l.v.proximo ? pill(l.v.proximo.situacao === 'atrasada' ? 'atrasado ' + l.v.proximo.atraso + 'd' : l.v.proximo.situacao === 'hoje' ? 'hoje' : 'D' + dBR(l.v.proximo.vence), 'pl-' + l.v.proximo.situacao) : null]);
    })) : vazio('Nenhum lead nesta etapa agora.'), h('span', { class: 'cont', text: String(ls.length) })));
  }
  return Topo.concat([h('div', { class: 'it-det' }, [h('div', { class: 'it-col' }, C), h('div', { class: 'it-col' }, Dir)])]);
}

function cabecalhoItem(it) {
  return [h('h2', null, [it.num ? h('span', { class: 'm-num', text: it.num }) : null, it.titulo]), h('p', { text: it.sub })];
}

function mostrarItem(id, empilhar) {
  var it = itemDef(id); if (!it) return;
  if (empilhar && itemModal) { var atual = itemModal.itemId; if (atual) HIST_ITEM.push(atual); }
  if (!itemModal) {
    HIST_ITEM = [];
    itemModal = modal({ cabecalho: cabecalhoItem(it), corpo: montarItem(it), largura: 1180, classe: 'item larga t-' + it.tipo, aoFechar: function () { itemModal = null; HIST_ITEM = []; history.replaceState(null, '', '#' + S.aba); } });
  } else {
    limpar(itemModal.corpo); kids(itemModal.corpo, montarItem(it));
    var tit = itemModal.topo.querySelector('.m-titulos'); limpar(tit); kids(tit, cabecalhoItem(it));
    itemModal.el.className = 'm-caixa item larga t-' + it.tipo;
    itemModal.corpo.scrollTop = 0;
  }
  itemModal.itemId = id;
  var antigo = itemModal.topo.querySelector('.voltar-i'); if (antigo) antigo.remove();
  if (HIST_ITEM.length) itemModal.topo.insertBefore(h('button', { class: 'ic-btn voltar-i', type: 'button', 'aria-label': 'Voltar', onclick: function () { var ant = HIST_ITEM.pop(); mostrarItem(ant, false); } }, ico('back')), itemModal.topo.firstChild);
  var u = location.hash.split('/')[0]; history.replaceState(null, '', u + '/' + id);
}
function abrirItem(id) { if (itemModal) itemModal.fechar(); itemModal = null; HIST_ITEM = []; mostrarItem(id, false); }

/* ------------------------------------------------------------------ mapa do fluxo */
function ordemLista() { return ['lead', 'antes', 'organico', 'aberto', 'primeiro', 'tentativa', 'desconto', 'semretorno', 'negociacao', 'retorno', 'agendado', 'ativo', 'descarte', 'reativacao']; }

function textoMultilinha(s) { return String(s || '').split('\n').map(function (l, i) { return [i ? h('br') : null, l]; }); }

function nodoMapa(no, cont) {
  var n = (cont && cont[no.id]) || 0;
  var b = h('button', { class: 'no no-' + no.estilo, type: 'button', style: 'left:' + no.x + 'px;top:' + no.y + 'px;width:' + no.w + 'px;height:' + no.h + 'px', 'data-id': no.id, 'aria-label': no.titulo + (n ? ', ' + n + ' leads' : '') }, [
    no.estilo === 'win' ? h('span', { class: 'no-ck', 'aria-hidden': 'true' }, ico('check', 22)) : null,
    no.selo ? h('span', { class: 'no-selo', text: no.selo }) : null,
    h('span', { class: 'no-t', text: no.titulo }),
    no.sub ? h('span', { class: 'no-s' }, textoMultilinha(no.sub)) : null,
    no.pill ? h('span', { class: 'no-pill', text: no.pill }) : null,
    n ? h('span', { class: 'no-n', title: n + ' ' + plural(n, 'lead', 'leads') + ' aqui agora', text: String(n) }) : null
  ]);
  b.addEventListener('click', function () { abrirItem(no.id); });
  return b;
}

function arestasSvg(MP, W, H) {
  var defs = sv('defs', null, [
    sv('marker', { id: 'seta', viewBox: '0 0 10 10', refX: '8', refY: '5', markerWidth: '9', markerHeight: '9', orient: 'auto-start-reverse' }, sv('path', { d: 'M1 1l8 4-8 4z', class: 'seta-av' })),
    sv('marker', { id: 'seta-ex', viewBox: '0 0 10 10', refX: '8', refY: '5', markerWidth: '9', markerHeight: '9', orient: 'auto-start-reverse' }, sv('path', { d: 'M1 1l8 4-8 4z', class: 'seta-ex' }))
  ]);
  var g = [];
  MP.arestas.forEach(function (a) {
    var cls = 'edge ' + (a.excecao ? 'e-ex' : 'e-av');
    g.push(sv('path', { id: 'p-' + a.id, d: a.d, class: cls, 'data-de': a.de, 'data-para': a.para, 'marker-end': 'url(#' + (a.excecao ? 'seta-ex' : 'seta') + ')' }));
    if (a.rotulo) {
      var linhas = a.rotulo.split('\n');
      g.push(sv('text', { x: a.lx, y: a.ly, class: 'edge-r' + (a.excecao ? ' ex' : ''), 'text-anchor': a.ancora || 'middle', 'data-de': a.de, 'data-para': a.para },
        linhas.map(function (t, i) { return sv('tspan', { x: a.lx, dy: i ? '1.15em' : '0', text: t }); })));
    }
    if (!semMovimento) {
      g.push(sv('circle', { r: '3', class: 'fluxo-dot' + (a.excecao ? ' ex' : ''), 'data-de': a.de, 'data-para': a.para }, [
        sv('animateMotion', { dur: (3.4 + (a.id.length % 4) * 0.5) + 's', repeatCount: 'indefinite', begin: (a.id.length % 5) * 0.4 + 's' }, sv('mpath', { href: '#p-' + a.id }))
      ]));
    }
  });
  return sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, class: 'mapa-svg', 'aria-hidden': 'true' }, [defs, g]);
}

function legendaMapa() {
  return h('div', { class: 'leg-mapa', style: 'left:596px;top:532px;width:411px;height:73px' }, [
    h('div', null, [h('i', { class: 'l-av' }), 'avanço no funil', h('i', { class: 'l-ex' }), 'voltou ou exceção']),
    h('p', null, [h('b', { text: 'D0' }), ' = dia em que o lead entra · ', h('b', { text: 'Msg' }), ' = mensagem pronta (aba Mensagens)'])
  ]);
}

function mapaFluxo(MP, cont, legenda) {
  MP = MP || M.MAPA; cont = cont || (S.D ? S.D.contagens : {}); legenda = legenda || legendaMapa();
  var wrap = h('div', { class: 'mapa-wrap' });
  var mapa = h('div', { class: 'mapa', style: 'width:' + MP.w + 'px;height:' + MP.h + 'px' }, [arestasSvg(MP, MP.w, MP.h), MP.nos.map(function (no) { return nodoMapa(no, cont); }), legenda]);
  wrap.appendChild(mapa);
  function ajustar() {
    var k = Math.min(1.18, wrap.clientWidth / MP.w);
    if (!k || !isFinite(k)) return;
    mapa.style.transform = 'scale(' + k + ')';
    wrap.style.height = Math.ceil(MP.h * k) + 'px';
  }
  var raf = 0;
  new ResizeObserver(function () { cancelAnimationFrame(raf); raf = requestAnimationFrame(ajustar); }).observe(wrap);
  // ao passar o mouse num card: destaca as ligações dele e apaga o resto
  mapa.addEventListener('pointerover', function (e) {
    var no = e.target.closest ? e.target.closest('.no') : null;
    if (!no) return;
    var id = no.getAttribute('data-id');
    mapa.setAttribute('data-foco', id);
    mapa.querySelectorAll('[data-de]').forEach(function (el) { el.classList.toggle('rel', el.getAttribute('data-de') === id || el.getAttribute('data-para') === id); });
    mapa.querySelectorAll('.no').forEach(function (n) {
      var nid = n.getAttribute('data-id');
      var lig = nid === id || MP.arestas.some(function (a) { return (a.de === id && a.para === nid) || (a.para === id && a.de === nid); });
      n.classList.toggle('apaga', !lig);
    });
  });
  mapa.addEventListener('pointerout', function (e) {
    if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.no')) return;
    mapa.removeAttribute('data-foco');
    mapa.querySelectorAll('.rel,.apaga').forEach(function (el) { el.classList.remove('rel'); el.classList.remove('apaga'); });
  });
  return wrap;
}

function listaFluxo(ordem, MP, cont) {
  ordem = ordem || ordemLista(); MP = MP || M.MAPA; cont = cont || (S.D ? S.D.contagens : {});
  return h('div', { class: 'fluxo-lista' }, ordem.map(function (id) {
    var it = itemDef(id), no = MP.nos.filter(function (n) { return n.id === id; })[0], n = cont[id] || 0;
    return h('button', { class: 'fl no-' + (no ? no.estilo : 'dark'), type: 'button', onclick: function () { abrirItem(id); } }, [
      h('span', null, [h('b', { text: (no ? no.titulo : it.titulo) }), h('small', { text: it.sub })]),
      n ? h('span', { class: 'no-n', text: String(n) }) : null, ico('arrow', 16)
    ]);
  }));
}

function abasFluxo() {
  return h('div', { class: 'tabs-an', role: 'tablist' }, [['leads', 'Leads'], ['noshow', 'No-show']].map(function (t) {
    return h('button', { type: 'button', role: 'tab', class: 'tab-an', 'aria-selected': String(S.fluxoTab === t[0]), text: t[1], onclick: function () { S.fluxoTab = t[0]; gravarLS('crm-flxtab', t[0]); desenhar(); } });
  }));
}
function alternaFluxo() {
  return h('div', { class: 'seg', role: 'group', 'aria-label': 'Como ver o fluxo' }, [
    h('button', { type: 'button', 'aria-pressed': String(S.fluxoVista === 'mapa'), onclick: function () { S.fluxoVista = 'mapa'; desenhar(); } }, 'Mapa'),
    h('button', { type: 'button', 'aria-pressed': String(S.fluxoVista === 'lista'), onclick: function () { S.fluxoVista = 'lista'; desenhar(); } }, 'Lista')
  ]);
}

function telaFluxo() {
  if (S.fluxoTab === 'noshow') return telaFluxoNS();
  var estreito = window.matchMedia && matchMedia('(max-width: 820px)').matches;
  if (S.fluxoVista === null) S.fluxoVista = estreito ? 'lista' : 'mapa';
  var cont = h('div', { class: 'fluxo-corpo' });
  cont.appendChild(S.fluxoVista === 'mapa' ? mapaFluxo() : listaFluxo());
  return h('div', { class: 'tela' }, [
    cabecalhoTela('Fluxo de atendimento', 'O caminho do lead, do primeiro contato até a conversão. Clique em qualquer card para ver tudo sobre a etapa. O número no canto é quantos leads estão ali agora.', alternaFluxo()),
    abasFluxo(),
    bannerPrioridade(),
    h('div', { class: 'cartao fluxo-cartao' }, cont)
  ]);
}

/* ------------------------------------------------------------------ fluxo do No-show (aba dentro de Fluxo) */
function pedirNoShow() {
  if (S.NScarregando) return;
  S.NScarregando = true;
  api('GET', '/noshow').then(function (d) {
    S.NS = d; S.NSt = Date.now(); S.NScarregando = false; S.NSerro = null;
    if (S.aba === 'fluxo' && S.fluxoTab === 'noshow') desenhar(true);
    var aberto = itemModal && itemModal.itemId && itemDef(itemModal.itemId);
    if (aberto && aberto.fluxo === 'noshow' && (S.itAba || 'detalhes') === 'detalhes') { var rolou = itemModal.corpo.scrollTop; mostrarItem(itemModal.itemId); itemModal.corpo.scrollTop = rolou; }
  }).catch(function (e) { S.NScarregando = false; S.NSt = Date.now(); S.NSerro = e.message; if (S.aba === 'fluxo' && S.fluxoTab === 'noshow') desenhar(true); });
}
function ordemListaNS() { return ['ns-faltou', 'ns-noshow', 'ns-retomada', 'ns-agendado', 'ns-semretorno', 'ns-perdido', 'ns-recuperado', 'ns-antes', 'ns-mover']; }
function legendaNS() {
  return h('div', { class: 'leg-mapa', style: 'left:636px;top:543px;width:430px;height:74px' }, [
    h('div', null, [h('i', { class: 'l-av' }), 'avanço no funil', h('i', { class: 'l-ex' }), 'atalho ou exceção']),
    h('p', null, [h('b', { text: 'D0' }), ' = dia em que o paciente faltou'])
  ]);
}
function regrasNS() { return M.NOSHOW.REGRAS; }

/* cards do funil No-show que estão numa etapa agora (modal da etapa); os passos mostram os da etapa a que pertencem */
function cardsNS(it) {
  var alvo = it.tipo === 'passo' ? it.pai : it.id;
  if (['ns-faltou', 'ns-antes', 'ns-mover'].indexOf(alvo) >= 0) return null;
  if (!S.NS && !S.NScarregando) pedirNoShow();
  var ls = (S.NS && S.NS.cards && S.NS.cards[alvo]) || [], tot = (S.NS && S.NS.contagens && S.NS.contagens[alvo]) || 0;
  return secao('Cards aqui agora', ls.length ? h('div', { class: 'leads-mini' }, ls.map(function (c) {
    return h('button', { class: 'lm', type: 'button', onclick: function () { fvAbrirCard(c.id); } }, [avatar(c.nome), h('span', null, [h('b', { text: c.nome }), h('small', { text: (c.unidade ? fvUnidadeCurta(c.unidade) + ' · ' : '') + brl(c.valor) })]), pill(c.dias + (c.dias === 1 ? ' dia' : ' dias'), 'pl-num')]);
  })) : vazio(S.NS ? (S.NS.funilId ? 'Nenhum card nesta etapa agora.' : 'O funil No-show não existe nos Pipelines.') : 'Carregando…'), h('span', { class: 'cont', text: String(tot) }));
}

function celulaNS(ln, dia, c, row, j) {
  var it = itemDef(c.id);
  return h('button', { class: 'cel on r-' + ln.id + (dia === 'D8' ? ' fim' : ''), type: 'button', style: 'grid-row:' + row + ';grid-column:' + (j + 2), onclick: function () { abrirItem(c.id); } }, [
    (it.canais || []).length ? h('div', { class: 'cel-canais' }, it.canais.map(function (x) { return h('span', { class: 'canal-t', text: x }); })) : null,
    h('b', { text: dia === 'D8' ? 'PERDIDO' : it.titulo }),
    h('small', { text: c.sub || it.sub }),
    it.hora ? h('span', { class: 'pill pl-hoje', text: 'Às ' + it.hora }) : null,
    (it.msgs && it.msgs.length === 1) ? h('span', { class: 'pill pl-msg', text: 'Msg ' + it.msgs[0] }) : null
  ]);
}
function blocoNS(ln, row, de, ate) {
  var B = ln.bloco;
  return h('div', { class: 'cel ns-bloco' + (B.ramos.length <= 2 ? ' ns-h' : ''), style: 'grid-row:' + row + ';grid-column:' + (de + 2) + ' / span ' + (ate - de + 1) }, [
    h('b', { class: 'ns-bt', text: B.titulo }),
    h('div', { class: 'ns-ramos' }, B.ramos.map(function (r) {
      return h('div', { class: 'ns-ramo' }, [
        h('button', { class: 'ns-r', type: 'button', onclick: function () { abrirItem(ln.item); }, text: r.rotulo }),
        h('span', { class: 'ns-tr', 'aria-hidden': 'true' }, ico('arrow', 16)),
        h('button', { class: 'ns-d ns-d-' + r.tom, type: 'button', onclick: function () { abrirItem(r.item); }, text: r.destino })
      ]);
    }))
  ]);
}
function calendarioNS() {
  var G = M.NOSHOW.GRADE;
  var topo = [h('div', { class: 'cal-h vaz' })].concat(G.dias.map(function (d) { return h('div', { class: 'cal-h' + (d === 'D8' ? ' fim' : ''), text: d === 'D0' ? 'D0 · falta' : d }); }));
  var itens = [];
  G.linhas.forEach(function (ln, i) {
    var row = i + 2, n = (S.NS && S.NS.contagens && S.NS.contagens[ln.item]) || 0;
    itens.push(h('button', { class: 'cal-l r-' + ln.id, type: 'button', style: 'grid-row:' + row, onclick: function () { abrirItem(ln.item); } }, [
      ln.selo ? h('span', { class: 'cal-selo', text: ln.selo }) : null, h('b', { text: ln.rotulo }), h('small', { text: ln.limite }),
      n ? h('span', { class: 'cel-n', title: n + ' ' + plural(n, 'card', 'cards') + ' aqui agora', text: String(n) }) : null
    ]));
    G.dias.forEach(function (d, j) { var c = (ln.celulas || {})[d]; if (c) itens.push(celulaNS(ln, d, c, row, j)); });
    if (ln.bloco) itens.push(blocoNS(ln, row, G.dias.indexOf(ln.bloco.de), G.dias.indexOf(ln.bloco.ate)));
  });
  return h('div', { class: 'cal-w' }, h('div', { class: 'cal cal-ns' }, topo.concat(itens)));
}

/* faltas do dia anterior, por paciente e por agendamento: separado do número acumulado do mapa */
function faltasOntemNS() {
  var F = S.NS && S.NS.faltas; if (!F) return null;
  var d = F.dia.slice(8, 10) + '/' + F.dia.slice(5, 7);
  var un = (F.porUnidade || []).map(function (u) { return fvUnidadeCurta(u.unidade) + ': ' + u.pacientes + ' ' + plural(u.pacientes, 'paciente', 'pacientes') + ' (' + u.agendamentos + ' ' + plural(u.agendamentos, 'falta', 'faltas') + ')'; }).join('  ·  ');
  return h('div', { class: 'cartao' }, [
    h('h3', { class: 'h3', text: 'Faltas de ontem (' + d + ')' }),
    h('p', null, [h('b', { text: F.pacientes + ' ' + plural(F.pacientes, 'paciente', 'pacientes') }), ' · ' + F.agendamentos + ' ' + plural(F.agendamentos, 'agendamento com falta', 'agendamentos com falta')]),
    un ? h('p', { class: 'mut peq', text: un }) : null,
    h('p', { class: 'mut peq', text: 'O mesmo paciente com mais de um horário no dia conta uma vez em pacientes e uma vez por horário em agendamentos. Os números no mapa abaixo são outra coisa: quantos cards estão em cada etapa agora, somando todos os dias.' })
  ]);
}
function telaFluxoNS() {
  if (!S.NScarregando && (!S.NS || Date.now() - (S.NSt || 0) > 30000)) pedirNoShow();
  var estreito = window.matchMedia && matchMedia('(max-width: 820px)').matches;
  if (S.fluxoVista === null) S.fluxoVista = estreito ? 'lista' : 'mapa';
  var cont = S.NS ? S.NS.contagens : {};
  var corpo = h('div', { class: 'fluxo-corpo' });
  corpo.appendChild(S.fluxoVista === 'mapa' ? mapaFluxo(M.NOSHOW.MAPA, cont, legendaNS()) : listaFluxo(ordemListaNS(), M.NOSHOW.MAPA, cont));
  var sem = S.NS && !S.NS.funilId ? h('div', { class: 'faixa f-aviso' }, [ico('alert', 16), 'O funil "No-show" ainda não existe em Pipelines, então o mapa fica sem números. As etapas e os modais funcionam normalmente.']) : S.NSerro ? h('div', { class: 'faixa f-aviso' }, [ico('alert', 16), 'Não consegui carregar os números do No-show: ' + S.NSerro]) : null;
  return h('div', { class: 'tela' }, [
    cabecalhoTela('Fluxo do No-show', 'Orçamentos de pacientes que faltaram ao agendamento. Clique em qualquer card para ver tudo sobre a etapa. O número no canto é quantos cards do funil No-show estão ali agora, somando todos os dias.', alternaFluxo()),
    abasFluxo(),
    h('div', { class: 'prior' }, [ico('bolt', 16), h('b', { text: 'PRIORIDADE DO DIA' }), h('span', { text: 'No-show primeiro, às 08:30 (primeiras horas do dia)' })]),
    sem,
    faltasOntemNS(),
    h('div', { class: 'cartao fluxo-cartao' }, corpo),
    h('div', { class: 'cartao' }, [h('h3', { class: 'h3', text: 'O que fazer em cada dia' }), h('p', { class: 'mut peq', text: 'A cadência do D0 ao D8, a partir do dia em que o paciente faltou. Clique em qualquer card ou resposta para ver a etapa.' }), calendarioNS()]),
    h('div', { class: 'cartao' }, [h('h3', { class: 'h3', text: 'Regras de ouro' }), regrasGrade(regrasNS())])
  ]);
}

/* ------------------------------------------------------------------ calendário D0-D8 */
function contarCelula(linhaId, itemId) {
  if (!S.D) return { n: 0, atraso: 0 };
  var n = 0, atraso = 0;
  S.D.leads.forEach(function (l) {
    var p = l.v.proximo;
    if (!p || p.passo.fase !== linhaId || p.passo.item !== itemId) return;
    n++; if (p.situacao === 'atrasada') atraso++;
  });
  return { n: n, atraso: atraso };
}
function celulaGrade(linha, dia) {
  var c = linha.celulas[dia];
  if (!c) return h('div', { class: 'cel vaz' });
  var it = itemDef(c.id), n = contarCelula(linha.id, c.id);
  return h('button', { class: 'cel on r-' + linha.id + (dia === 'D8' ? ' fim' : ''), type: 'button', onclick: function () { abrirItem(c.id); } }, [
    (it.canais || []).length ? h('div', { class: 'cel-canais' }, it.canais.map(function (x) { return h('span', { class: 'canal-t', text: x }); })) : null,
    h('b', { text: dia === 'D8' ? 'DESCARTE' : it.titulo }),
    h('small', { text: c.sub || it.sub }),
    it.hora ? h('span', { class: 'pill pl-hoje', text: 'Às ' + it.hora }) : null,
    (it.msgs && it.msgs.length === 1) ? h('span', { class: 'pill pl-msg', text: 'Msg ' + it.msgs[0] }) : null,
    n.n ? h('span', { class: 'cel-n' + (n.atraso ? ' at' : ''), title: n.n + ' ' + plural(n.n, 'lead', 'leads') + (n.atraso ? ' (' + n.atraso + ' atrasados)' : ''), text: String(n.n) }) : null
  ]);
}
function telaCalendario() {
  var G = M.GRADE;
  var topo = [h('div', { class: 'cal-h vaz' })].concat(G.dias.map(function (d) { return h('div', { class: 'cal-h' + (d === 'D8' ? ' fim' : ''), text: d }); }));
  var linhas = [];
  G.linhas.forEach(function (ln, i) {
    linhas.push(h('button', { class: 'cal-l r-' + ln.id, type: 'button', style: 'grid-row:' + (i + 2), onclick: function () { abrirItem(ln.item); } }, [h('b', { text: ln.rotulo }), h('small', { text: ln.limite })]));
    G.dias.forEach(function (d, j) {
      if (ln.depois && j >= 2 && j <= 4) return; // o bloco "Depois do 1º contato" ocupa D2 a D7
      var c = celulaGrade(ln, d); c.style.gridRow = String(i + 2); c.style.gridColumn = String(j + 2);
      linhas.push(c);
    });
    if (ln.depois) {
      var d = ln.depois;
      linhas.push(h('div', { class: 'cel depois', style: 'grid-row:' + (i + 2) + ';grid-column:4 / span 3' }, [
        h('small', { text: d.titulo }),
        h('div', { class: 'ramo' }, [h('button', { class: 'ramo-b r1', type: 'button', onclick: function () { abrirItem('negociacao'); }, text: 'Respondeu' }), h('span', { class: 'ramo-seta', 'aria-hidden': 'true' }, ico('arrow', 20)), h('button', { class: 'ramo-b neg', type: 'button', onclick: function () { abrirItem('negociacao'); }, text: 'EM NEGOCIAÇÃO' })]),
        h('div', { class: 'ramo' }, [h('button', { class: 'ramo-b r2', type: 'button', onclick: function () { abrirItem('primeiro'); }, text: 'Não respondeu' }), h('span', { class: 'ramo-nota', text: 'Nova tentativa no D3 às 11:30 · Msg 2' }), h('span', { class: 'ramo-seta', 'aria-hidden': 'true' }, ico('arrow', 20)), h('button', { class: 'ramo-b sr', type: 'button', onclick: function () { abrirItem('tentativa'); }, text: 'SEM RETORNO' })])
      ]));
    }
  });
  return h('div', { class: 'tela' }, [
    cabecalhoTela('O que fazer em cada dia', 'A cadência do D0 ao D8. O número em cada card é quantos leads têm aquele passo para fazer; em vermelho, quando há atrasados. Clique para ver a etapa.'),
    bannerPrioridade(),
    h('div', { class: 'cartao' }, h('div', { class: 'cal-w' }, h('div', { class: 'cal' }, topo.concat(linhas)))),
    h('div', { class: 'cartao' }, [h('h3', { class: 'h3', text: 'Regras de ouro' }), regrasGrade()])
  ]);
}
function regrasGrade(lista) {
  return h('div', { class: 'regras-grade' }, (lista || M.REGRAS_OURO).map(function (r) {
    return h('div', { class: 'rg' }, [h('span', { class: 'rg-n', text: String(r.n) }), h('div', null, [h('b', { text: r.titulo }), h('p', { text: r.texto })])]);
  }));
}
function bannerPrioridade() {
  return h('div', { class: 'prior' }, [ico('bolt', 16), h('b', { text: 'PRIORIDADE DO DIA' }), h('span', null, [h('b', { text: '1º ' }), M.PRIORIDADE_DO_DIA[0], ' · ', h('b', { text: '2º ' }), M.PRIORIDADE_DO_DIA[1]])]);
}
function cabecalhoTela(titulo, sub, acao) {
  return h('header', { class: 'tela-h' }, [h('div', null, [h('h1', { text: titulo }), sub ? h('p', { text: sub }) : null]), acao || null]);
}
`;
