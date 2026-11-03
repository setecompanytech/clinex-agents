// JavaScript do CRM (navegador), parte 2: fluxo clicável, modal de cada etapa, calendário D0-D8 e cartão de mensagem.
// Dentro dele não usar crases nem "dollar-chave".
export const fluxo = String.raw`
var DIAS_COL = ['D0', 'D1', 'D2', 'D3', 'D7', 'D8'];
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
      var r = M.REGRAS_OURO[n - 1];
      return h('div', { class: 'rm' }, [h('span', { class: 'rm-n', text: String(r.n) }), h('div', null, [h('b', { text: r.titulo }), h('p', { text: r.texto })])]);
    }))));
  }
  var ls = leadsDoItem(it.id);
  if (S.D && it.tipo !== 'regra' && it.id !== 'lead') {
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

function nodoMapa(no) {
  var n = (S.D && S.D.contagens[no.id]) || 0;
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

function arestasSvg(W, H) {
  var defs = sv('defs', null, [
    sv('marker', { id: 'seta', viewBox: '0 0 10 10', refX: '8', refY: '5', markerWidth: '9', markerHeight: '9', orient: 'auto-start-reverse' }, sv('path', { d: 'M1 1l8 4-8 4z', class: 'seta-av' })),
    sv('marker', { id: 'seta-ex', viewBox: '0 0 10 10', refX: '8', refY: '5', markerWidth: '9', markerHeight: '9', orient: 'auto-start-reverse' }, sv('path', { d: 'M1 1l8 4-8 4z', class: 'seta-ex' }))
  ]);
  var g = [];
  M.MAPA.arestas.forEach(function (a) {
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

function mapaFluxo() {
  var wrap = h('div', { class: 'mapa-wrap' });
  var mapa = h('div', { class: 'mapa', style: 'width:' + M.MAPA.w + 'px;height:' + M.MAPA.h + 'px' }, [arestasSvg(M.MAPA.w, M.MAPA.h), M.MAPA.nos.map(nodoMapa), legendaMapa()]);
  wrap.appendChild(mapa);
  function ajustar() {
    var k = Math.min(1.18, wrap.clientWidth / M.MAPA.w);
    if (!k || !isFinite(k)) return;
    mapa.style.transform = 'scale(' + k + ')';
    wrap.style.height = Math.ceil(M.MAPA.h * k) + 'px';
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
      var lig = nid === id || M.MAPA.arestas.some(function (a) { return (a.de === id && a.para === nid) || (a.para === id && a.de === nid); });
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

function listaFluxo() {
  return h('div', { class: 'fluxo-lista' }, ordemLista().map(function (id) {
    var it = itemDef(id), no = M.MAPA.nos.filter(function (n) { return n.id === id; })[0], n = (S.D && S.D.contagens[id]) || 0;
    return h('button', { class: 'fl no-' + (no ? no.estilo : 'dark'), type: 'button', onclick: function () { abrirItem(id); } }, [
      h('span', null, [h('b', { text: (no ? no.titulo : it.titulo) }), h('small', { text: it.sub })]),
      n ? h('span', { class: 'no-n', text: String(n) }) : null, ico('arrow', 16)
    ]);
  }));
}

function telaFluxo() {
  var estreito = window.matchMedia && matchMedia('(max-width: 820px)').matches;
  if (S.fluxoVista === null) S.fluxoVista = estreito ? 'lista' : 'mapa';
  var cont = h('div', { class: 'fluxo-corpo' });
  function montar() { limpar(cont); cont.appendChild(S.fluxoVista === 'mapa' ? mapaFluxo() : listaFluxo()); }
  var alterna = h('div', { class: 'seg', role: 'group', 'aria-label': 'Como ver o fluxo' }, [
    h('button', { type: 'button', 'aria-pressed': String(S.fluxoVista === 'mapa'), onclick: function () { S.fluxoVista = 'mapa'; desenhar(); } }, 'Mapa'),
    h('button', { type: 'button', 'aria-pressed': String(S.fluxoVista === 'lista'), onclick: function () { S.fluxoVista = 'lista'; desenhar(); } }, 'Lista')
  ]);
  montar();
  return h('div', { class: 'tela' }, [
    cabecalhoTela('Fluxo de atendimento', 'O caminho do lead, do primeiro contato até a conversão. Clique em qualquer card para ver tudo sobre a etapa. O número no canto é quantos leads estão ali agora.', alterna),
    bannerPrioridade(),
    h('div', { class: 'cartao fluxo-cartao' }, cont)
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
        h('div', { class: 'ramo' }, [h('button', { class: 'ramo-b r2', type: 'button', onclick: function () { abrirItem('primeiro'); }, text: 'Não respondeu' }), h('span', { class: 'ramo-nota', text: 'Nova tentativa no D2 · Msg 2' }), h('span', { class: 'ramo-seta', 'aria-hidden': 'true' }, ico('arrow', 20)), h('button', { class: 'ramo-b sr', type: 'button', onclick: function () { abrirItem('tentativa'); }, text: 'SEM RETORNO' })])
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
function regrasGrade() {
  return h('div', { class: 'regras-grade' }, M.REGRAS_OURO.map(function (r) {
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
