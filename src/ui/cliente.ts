// Biblioteca de navegador do design system do Clinex: helpers de DOM, ícones, formatação, avisos (toast), modais e peças
// visuais. Mesma base do CRM. Dentro do texto não usar crases nem "dollar-chave".
export const cliente = String.raw`
var NS = 'http://www.w3.org/2000/svg';
function put(el, attrs) {
  for (var k in attrs) {
    var v = attrs[k];
    if (v === null || v === undefined || v === false) continue;
    if (k === 'text') el.textContent = v;
    else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
}
function kids(el, c) {
  if (c === null || c === undefined || c === false) return;
  if (Array.isArray(c)) { c.forEach(function (x) { kids(el, x); }); return; }
  el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
}
function h(tag, attrs, c) { var el = document.createElement(tag); put(el, attrs || {}); kids(el, c); return el; }
function sv(tag, attrs, c) { var el = document.createElementNS(NS, tag); put(el, attrs || {}); kids(el, c); return el; }
function limpar(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

/* ------------------------------------------------------------------ ícones */
var ICO = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  funil: 'M4 5h5v14H4zM10 5h5v9h-5zM16 5h4v6h-4z',
  users: 'M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM4 21c0-4 3.5-6 8-6s8 2 8 6',
  flow: 'M4 4h6v5H4zM14 4h6v5h-6zM9 15h6v5H9zM7 9v2a2 2 0 0 0 2 2h0M17 9v2a2 2 0 0 1-2 2h0M12 13v2',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  message: 'M4 5h16v11H9l-5 4z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  plus: 'M12 5v14M5 12h14',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  check: 'M5 12l5 5 9-10',
  x: 'M6 6l12 12M18 6L6 18',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  clock: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  alert: 'M12 4l9 16H3zM12 10v4M12 17v.5',
  bolt: 'M13 2L5 14h6l-1 8 8-12h-6z',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  upload: 'M12 16V5M7 9l5-5 5 5M5 20h14',
  edit: 'M4 20h4L19 9l-4-4L4 16z',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  back: 'M15 5l-7 7 7 7',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 21c0-4 3-6 7-6s7 2 7 6',
  lock: 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3',
  chart: 'M3 20h18M6 20v-7M11 20V6M16 20v-10M21 20V9',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z'
};
function ico(nome, tam) {
  return sv('svg', { viewBox: '0 0 24 24', width: tam || 18, height: tam || 18, class: 'ico', 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, sv('path', { d: ICO[nome] || ICO.star }));
}

/* ------------------------------------------------------------------ formatação */
var BRLF = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
function brl(v) { return BRLF.format(v || 0); }
function dBR(d) { return d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '–'; }
function dBRfull(d) { return d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '–'; }
var TZ = 'America/Belem';
function qDia(iso) { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: TZ }); }
function qHora(iso) { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ }); }
function qDiaHora(iso) { return qDia(iso) + ' ' + qHora(iso); }
function primeiroNome(n) { var p = String(n || '').trim().split(/\s+/)[0] || ''; return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(); }
function iniciais(n) { var p = String(n || '').trim().split(/\s+/); return ((p[0] || '').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase(); }
function plural(n, a, b) { return n === 1 ? a : b; }
function soma(a) { var t = 0; for (var i = 0; i < a.length; i++) t += a[i]; return t; }
/* número que sobe até o valor final (respeita "reduzir movimento") */
function contar(el, alvo, fmt) {
  if (semMovimento || !alvo) { el.textContent = fmt(alvo); return; }
  var t0 = performance.now(), dur = 900;
  function passo(t) {
    var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(alvo * e);
    if (p < 1) requestAnimationFrame(passo); else el.textContent = fmt(alvo);
  }
  requestAnimationFrame(passo);
}
function horaBelem() { var p = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ }).formatToParts(new Date()); var o = {}; p.forEach(function (x) { o[x.type] = x.value; }); return { h: parseInt(o.hour, 10) % 24, m: parseInt(o.minute, 10) }; }
function lerLS(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function gravarLS(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* segue sem lembrar */ } }
var semMovimento = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;


/* ------------------------------------------------------------------ avisos (toast) */
var toasts = null;
function aviso(texto, tipo) {
  if (!toasts) { toasts = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(toasts); }
  var t = h('div', { class: 'toast t-' + (tipo || 'info') }, [h('i', { 'aria-hidden': 'true' }), h('span', { text: texto })]);
  toasts.appendChild(t);
  setTimeout(function () { t.classList.add('sai'); setTimeout(function () { t.remove(); }, 300); }, tipo === 'erro' ? 6500 : 3200);
}


/* ------------------------------------------------------------------ modais e gaveta */
var pilha = [];
function modal(o) {
  var fundo = h('div', { class: 'm-fundo ' + (o.gaveta ? 'm-gaveta' : ''), onclick: function (e) { if (e.target === fundo) ctrl.fechar(); } });
  var topo = h('header', { class: 'm-topo' }, [
    h('div', { class: 'm-titulos' }, o.cabecalho || [h('h2', { text: o.titulo || '' }), o.sub ? h('p', { text: o.sub }) : null]),
    h('button', { class: 'ic-btn', type: 'button', 'aria-label': 'Fechar', onclick: function () { ctrl.fechar(); } }, ico('x'))
  ]);
  var corpo = h('div', { class: 'm-corpo' }, o.corpo);
  var caixa = h('div', { class: 'm-caixa ' + (o.classe || ''), role: 'dialog', 'aria-modal': 'true', style: o.largura ? 'max-width:' + o.largura + 'px' : null }, [topo, corpo, o.rodape ? h('footer', { class: 'm-rodape' }, o.rodape) : null]);
  fundo.appendChild(caixa);
  var antes = document.activeElement;
  var ctrl = {
    el: caixa, corpo: corpo, topo: topo, fundo: fundo,
    fechar: function () {
      var i = pilha.indexOf(ctrl); if (i < 0) return;
      pilha.splice(i, 1);
      fundo.classList.add('saindo');
      setTimeout(function () { fundo.remove(); }, semMovimento ? 0 : 180);
      if (!pilha.length) document.body.classList.remove('trava');
      if (o.aoFechar) o.aoFechar();
      if (antes && antes.focus && document.body.contains(antes)) antes.focus();
    }
  };
  pilha.push(ctrl);
  document.body.appendChild(fundo);
  document.body.classList.add('trava');
  var foco = caixa.querySelector('[autofocus],input,textarea,select') || topo.querySelector('button');
  if (foco) setTimeout(function () { foco.focus(); }, 30);
  return ctrl;
}
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && pilha.length) { var t = pilha[pilha.length - 1]; if (t.escapa !== false) t.fechar(); }
});

/* pergunta simples com botões; devolve a escolha por callback */
function confirmar(o) {
  var m = modal({
    titulo: o.titulo, sub: o.sub, largura: 460, classe: 'peq',
    corpo: o.corpo || h('p', { class: 'texto', text: o.texto || '' }),
    rodape: [
      h('button', { class: 'btn', type: 'button', onclick: function () { m.fechar(); if (o.aoNao) o.aoNao(); }, text: o.nao || 'Cancelar' }),
      h('button', { class: 'btn pri' + (o.perigo ? ' perigo' : ''), type: 'button', onclick: function () { m.fechar(); o.aoSim(); }, text: o.sim || 'Confirmar' })
    ]
  });
  return m;
}


function pill(texto, cls) { return h('span', { class: 'pill ' + (cls || ''), text: texto }); }
function secao(titulo, conteudo, extra) { return h('section', { class: 'sec' }, [h('h4', null, [titulo, extra || null]), conteudo]); }
function vazio(texto, sub) { return h('div', { class: 'vazio' }, [h('b', { text: texto }), sub ? h('span', { text: sub }) : null]); }
function avatar(nome) { return h('span', { class: 'avatar', text: iniciais(nome), 'aria-hidden': 'true' }); }
function botao(texto, cls, fn, icone) { return h('button', { class: 'btn ' + (cls || ''), type: 'button', onclick: fn }, [icone ? ico(icone, 16) : null, texto]); }
function campo(rotulo, el, dica) { return h('label', { class: 'campo-f' }, [h('span', { text: rotulo }), el, dica ? h('small', { text: dica }) : null]); }
`;
