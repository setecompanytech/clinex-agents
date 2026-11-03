// JavaScript do BI (roda no navegador), parte 1: helpers, formatação, tooltip e componentes de cartão.
// Embutido como string (sem build, sem arquivos estáticos). Não usar crases nem "dollar-chave" aqui dentro.
export const base = String.raw`
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

/* ------------------------------------------------------------------ formatação */
var nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
var nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
function vazioNum(v) { return v === null || v === undefined || (typeof v === 'number' && isNaN(v)); }
function fmtN(v) {
  if (vazioNum(v)) return '–';
  var a = Math.abs(v);
  if (a >= 1e6) return nf1.format(v / 1e6) + ' mi';
  if (a >= 1e4) return nf1.format(v / 1e3) + ' mil';
  return nf0.format(v);
}
function fmtP(v) { return vazioNum(v) ? '–' : nf1.format(v) + '%'; }
function fmtMs(v) { if (vazioNum(v)) return '–'; return v >= 1000 ? nf1.format(v / 1000) + ' s' : nf0.format(v) + ' ms'; }
function fmtMin(v) {
  if (vazioNum(v)) return '–';
  if (v < 1) return nf0.format(Math.round(v * 60)) + ' s';
  if (v < 60) return nf1.format(v) + ' min';
  return nf1.format(v / 60) + ' h';
}
var TZ = 'America/Belem';
function fmtHora(t) { return new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ }); }
function fmtDia(t) { return new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: TZ }); }
function fmtDiaHora(t) { return fmtDia(t) + ' ' + fmtHora(t); }
function soma(a) { return a.reduce(function (x, y) { return x + y; }, 0); }

function lerLS(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function gravarLS(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sem armazenamento: segue sem lembrar */ } }
var semMovimento = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ tooltip (um só para a página) */
var tipEl = null;
function tipo() {
  if (!tipEl) { tipEl = h('div', { class: 'tip', role: 'tooltip' }); document.body.appendChild(tipEl); }
  return tipEl;
}
function mostrarTip(x, y, d) {
  var el = tipo();
  el.textContent = '';
  if (d.titulo) el.appendChild(h('div', { class: 'tip-t', text: d.titulo }));
  (d.linhas || []).forEach(function (l) {
    el.appendChild(h('div', { class: 'tip-r' }, [
      l.cor ? h('i', { class: 'tip-k', style: 'background:' + l.cor }) : null,
      h('b', { text: l.valor }),
      l.rotulo ? h('span', { text: l.rotulo }) : null
    ]));
  });
  if (d.nota) el.appendChild(h('div', { class: 'tip-n', text: d.nota }));
  el.classList.add('on');
  var w = el.offsetWidth, hh = el.offsetHeight, nx = x + 14, ny = y + 14;
  if (nx + w > window.innerWidth - 8) nx = x - w - 14;
  if (ny + hh > window.innerHeight - 8) ny = y - hh - 14;
  el.style.left = Math.max(8, nx) + 'px';
  el.style.top = Math.max(8, ny) + 'px';
}
function esconderTip() { if (tipEl) tipEl.classList.remove('on'); }
function ligarTip(el, fn) {
  el.setAttribute('tabindex', '0');
  el.addEventListener('pointermove', function (e) { mostrarTip(e.clientX, e.clientY, fn()); });
  el.addEventListener('pointerleave', esconderTip);
  el.addEventListener('focus', function () { var r = el.getBoundingClientRect(); mostrarTip(r.left + r.width / 2, r.top, fn()); });
  el.addEventListener('blur', esconderTip);
}

/* ------------------------------------------------------------------ gráfico que acompanha a largura do cartão */
function responsivo(desenhar, altura) {
  var box = h('div', { class: 'chart', style: altura ? 'min-height:' + altura + 'px' : null });
  var ultimo = 0;
  new ResizeObserver(function () {
    var w = Math.floor(box.clientWidth);
    if (!w || w === ultimo) return;
    ultimo = w;
    box.textContent = '';
    box.appendChild(desenhar(w));
  }).observe(box);
  return box;
}

/* ------------------------------------------------------------------ peças visuais */
var GLIFO = { bom: '●', atencao: '▲', critico: '◆', info: '■', neutro: '○' };
function chip(nivel, texto) { return h('span', { class: 'chip c-' + nivel }, [h('i', { 'aria-hidden': 'true', text: GLIFO[nivel] }), texto]); }
var STATUS = {
  agendada: ['bom', 'Agendada'], finalizada: ['info', 'Finalizada'], transferida: ['atencao', 'Transferida'],
  emergencia: ['critico', 'Emergência'], abandonada: ['neutro', 'Sem resposta'], andamento: ['info', 'Em andamento']
};
function chipStatus(s) { var x = STATUS[s] || ['neutro', s]; return chip(x[0], x[1]); }
function vazio(msg) { return h('div', { class: 'vazio', text: msg }); }

function tabelaHtml(cols, linhas) {
  return h('div', { class: 'tbl-w' }, h('table', { class: 'tbl' }, [
    h('thead', null, h('tr', null, cols.map(function (c) { return h('th', { scope: 'col', text: c }); }))),
    h('tbody', null, linhas.map(function (l) { return h('tr', null, l.map(function (c) { return h('td', { text: c === null || c === undefined ? '–' : String(c) }); })); }))
  ]));
}

/* Cartão: título, subtítulo e, quando há tabela equivalente, o botão que alterna gráfico/tabela. */
function cartao(o) {
  var corpo = h('div', { class: 'card-b' }, o.corpo);
  var verTabela = false, btn = null;
  if (o.tabela) {
    btn = h('button', {
      class: 'mini', type: 'button', 'aria-pressed': 'false', text: 'Tabela',
      onclick: function () {
        verTabela = !verTabela;
        btn.setAttribute('aria-pressed', verTabela ? 'true' : 'false');
        btn.textContent = verTabela ? 'Gráfico' : 'Tabela';
        corpo.textContent = '';
        corpo.appendChild(verTabela ? tabelaHtml(o.tabela.cols, o.tabela.linhas) : o.corpo);
      }
    });
  }
  return h('section', { class: 'card ' + (o.span || 's12') }, [
    h('header', { class: 'card-h' }, [
      h('div', null, [h('h3', { text: o.titulo }), o.sub ? h('p', { text: o.sub }) : null]),
      btn
    ]),
    corpo
  ]);
}

function contar(el, alvo, fmt) {
  if (semMovimento || vazioNum(alvo) || alvo === 0) { el.textContent = fmt(alvo); return; }
  var t0 = performance.now(), dur = 650;
  function passo(t) {
    var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(alvo * e);
    if (p < 1) requestAnimationFrame(passo); else el.textContent = fmt(alvo);
  }
  requestAnimationFrame(passo);
}
`;
