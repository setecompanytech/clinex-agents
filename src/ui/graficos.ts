// JavaScript do CRM (navegador), parte de gráficos: tooltip, anel de progresso, minigráfico, barras, colunas, linhas, empilhada.
// Cores por variável CSS (--g1..--g5), então o tema claro/escuro troca sem redesenhar. Dentro dele não usar crases nem "dollar-chave".
export const graficos = String.raw`
/* ------------------------------------------------------------------ tooltip (um só para a página) */
var tipEl = null;
function tipo() { if (!tipEl) { tipEl = h('div', { class: 'tip', role: 'tooltip' }); document.body.appendChild(tipEl); } return tipEl; }
function mostrarTip(x, y, d) {
  var el = tipo(); limpar(el);
  if (d.titulo) el.appendChild(h('div', { class: 'tip-t', text: d.titulo }));
  (d.linhas || []).forEach(function (l) {
    el.appendChild(h('div', { class: 'tip-r' }, [l.cor ? h('i', { class: 'tip-k', style: 'background:' + l.cor }) : null, h('b', { text: l.valor }), l.rotulo ? h('span', { text: l.rotulo }) : null]));
  });
  if (d.nota) el.appendChild(h('div', { class: 'tip-n', text: d.nota }));
  el.classList.add('on');
  var w = el.offsetWidth, hh = el.offsetHeight, nx = x + 14, ny = y + 14;
  if (nx + w > window.innerWidth - 8) nx = x - w - 14;
  if (ny + hh > window.innerHeight - 8) ny = y - hh - 14;
  el.style.left = Math.max(8, nx) + 'px'; el.style.top = Math.max(8, ny) + 'px';
}
function esconderTip() { if (tipEl) tipEl.classList.remove('on'); }
function ligarTip(el, fn) {
  el.setAttribute('tabindex', '0');
  el.addEventListener('pointermove', function (e) { mostrarTip(e.clientX, e.clientY, fn()); });
  el.addEventListener('pointerleave', esconderTip);
  el.addEventListener('focus', function () { var r = el.getBoundingClientRect(); mostrarTip(r.left + r.width / 2, r.top, fn()); });
  el.addEventListener('blur', esconderTip);
}
function responsivo(desenhar, altura) {
  var box = h('div', { class: 'chart', style: altura ? 'min-height:' + altura + 'px' : null });
  var ultimo = 0, raf = 0;
  new ResizeObserver(function () {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(function () {
      var w = Math.floor(box.clientWidth);
      if (!w || w === ultimo) return;
      ultimo = w; limpar(box); box.appendChild(desenhar(w));
    });
  }).observe(box);
  return box;
}
function bonito(max) {
  if (max <= 0) return { max: 4, passo: 1 };
  var bruto = max / 4, mag = Math.pow(10, Math.floor(Math.log10(bruto))), f = bruto / mag;
  var passo = Math.max(1, (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag);
  return { max: Math.ceil(max / passo) * passo, passo: passo };
}
var nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
var nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
function pct(v) { return v === null || v === undefined ? '–' : nf1.format(v) + '%'; }
function compacto(v) { var a = Math.abs(v); if (a >= 1e6) return nf1.format(v / 1e6) + ' mi'; if (a >= 1e4) return nf1.format(v / 1e3) + ' mil'; return nf0.format(v); }
function brlCompacto(v) { var a = Math.abs(v); if (a >= 1e6) return 'R$ ' + nf1.format(v / 1e6) + ' mi'; if (a >= 1e4) return 'R$ ' + nf1.format(v / 1e3) + ' mil'; return brl(v); }

/* ------------------------------------------------------------------ minigráfico de tendência */
function spark(vals, cor, W, H) {
  W = W || 110; H = H || 32;
  var p = 4, n = vals.length;
  if (n < 2) return h('span');
  var max = Math.max.apply(null, vals.concat([1]));
  var x = function (i) { return p + i * (W - 2 * p) / (n - 1); };
  var y = function (v) { return H - p - (v / max) * (H - 2 * p); };
  var d = vals.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); }).join(' ');
  var area = d + ' L' + x(n - 1).toFixed(1) + ' ' + (H - p) + ' L' + x(0).toFixed(1) + ' ' + (H - p) + ' Z';
  return sv('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'spark', 'aria-hidden': 'true' }, [
    sv('path', { d: area, style: 'fill:' + cor + ';opacity:.14' }),
    sv('path', { d: d, style: 'fill:none;stroke:' + cor + ';stroke-width:2;stroke-linejoin:round;stroke-linecap:round' }),
    sv('circle', { cx: x(n - 1), cy: y(vals[n - 1]), r: 3.4, style: 'fill:' + cor + ';stroke:var(--solid);stroke-width:2' })
  ]);
}

/* ------------------------------------------------------------------ anel de progresso */
function anel(o) {
  var T = o.tam || 132, esp = 11, r = (T - esp) / 2, c = 2 * Math.PI * r;
  var v = Math.max(0, Math.min(100, o.pct || 0));
  var arco = sv('circle', { cx: T / 2, cy: T / 2, r: r, fill: 'none', 'stroke-width': esp, 'stroke-linecap': 'round', style: 'stroke:' + (o.cor || 'var(--g1)') + ';transition:stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)', 'stroke-dasharray': c, 'stroke-dashoffset': semMovimento ? c * (1 - v / 100) : c, transform: 'rotate(-90 ' + T / 2 + ' ' + T / 2 + ')' });
  if (!semMovimento) requestAnimationFrame(function () { requestAnimationFrame(function () { arco.setAttribute('stroke-dashoffset', c * (1 - v / 100)); }); });
  var el = h('div', { class: 'anel', role: 'img', 'aria-label': o.titulo + ': ' + (o.centro || v + '%') }, [
    h('div', { class: 'anel-s', style: 'width:' + T + 'px;height:' + T + 'px' }, [
      sv('svg', { viewBox: '0 0 ' + T + ' ' + T, width: T, height: T, 'aria-hidden': 'true' }, [sv('circle', { cx: T / 2, cy: T / 2, r: r, fill: 'none', 'stroke-width': esp, class: 'anel-t' }), arco]),
      h('div', { class: 'anel-c' }, [h('b', { text: o.centro !== undefined ? o.centro : Math.round(v) + '%' }), o.sub ? h('small', { text: o.sub }) : null])
    ]),
    h('span', { class: 'anel-r', text: o.titulo })
  ]);
  if (o.dica) ligarTip(el, function () { return o.dica; });
  return el;
}

/* ------------------------------------------------------------------ barras horizontais (HTML) */
function barras(linhas, o) {
  o = o || {};
  if (!linhas.length) return vazio(o.vazio || 'Sem dados ainda.');
  var max = o.max || Math.max.apply(null, linhas.map(function (l) { return l.valor; }).concat([1]));
  return h('div', { class: 'bars' + (o.alta ? ' alta' : '') }, linhas.map(function (l) {
    var p = l.valor > 0 ? Math.max(1.5, l.valor / max * 100) : 0;
    var row = h('div', { class: 'bar-row' }, [
      h('div', { class: 'bar-l', title: l.rotulo, text: l.rotulo }),
      h('div', { class: 'bar-t' }, h('div', { class: 'bar-f', style: 'width:' + p + '%;background:' + (l.cor || o.cor || 'var(--g1)') })),
      h('div', { class: 'bar-v' }, [h('b', { text: l.texto !== undefined ? l.texto : compacto(l.valor) }), l.extra ? h('span', { text: l.extra }) : null])
    ]);
    ligarTip(row, function () { return l.dica || { titulo: l.rotulo, linhas: [{ valor: compacto(l.valor), rotulo: l.sub || '' }] }; });
    return row;
  }));
}

/* ------------------------------------------------------------------ barra 100% empilhada */
function empilhada(partes, opc) {
  var total = 0; partes.forEach(function (p) { total += p.valor; });
  if (!total) return vazio('Sem dados.');
  var barra = h('div', { class: 'stack' }, partes.filter(function (p) { return p.valor > 0; }).map(function (p) {
    var seg = h('div', { class: 'stack-s', style: 'flex:' + p.valor + ';background:' + p.cor });
    ligarTip(seg, function () { return { titulo: p.rotulo, linhas: [{ cor: p.cor, valor: nf0.format(p.valor), rotulo: pct(p.valor / total * 100) }] }; });
    return seg;
  }));
  if (opc && opc.semLegenda) return barra;
  return h('div', null, [barra, h('div', { class: 'stack-l' }, partes.map(function (p) {
    return h('div', null, [h('i', { style: 'background:' + p.cor }), h('span', { text: p.rotulo }), h('b', { text: nf0.format(p.valor) }), h('em', { text: pct(p.valor / total * 100) })]);
  }))]);
}

/* ------------------------------------------------------------------ colunas simples (uma série) */
function colunas(o) {
  return responsivo(function (W) {
    var H = o.altura || 190, m = { l: 34, r: 8, t: 22, b: 26 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b, n = o.valores.length;
    var max = Math.max.apply(null, o.valores.concat([1])), bn = bonito(max), banda = iw / n, bw = Math.max(4, Math.min(24, banda - 4));
    var y = function (v) { return m.t + ih - (v / bn.max) * ih; };
    var g = [];
    for (var v = 0; v <= bn.max + 0.0001; v += bn.passo) {
      g.push(sv('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: 'grade' }));
      g.push(sv('text', { x: m.l - 6, y: y(v) + 4, class: 'eixo', 'text-anchor': 'end', text: compacto(v) }));
    }
    var pico = max > 0 ? o.valores.indexOf(max) : -1;
    o.valores.forEach(function (val, i) {
      var x0 = m.l + banda * i + (banda - bw) / 2, hh = Math.max(0, ih - (y(val) - m.t)), top = y(val), r = Math.min(4, hh, bw / 2);
      if (val > 0) {
        var d = 'M' + x0 + ' ' + (top + hh) + ' L' + x0 + ' ' + (top + r) + ' Q' + x0 + ' ' + top + ' ' + (x0 + r) + ' ' + top + ' L' + (x0 + bw - r) + ' ' + top + ' Q' + (x0 + bw) + ' ' + top + ' ' + (x0 + bw) + ' ' + (top + r) + ' L' + (x0 + bw) + ' ' + (top + hh) + ' Z';
        g.push(sv('path', { d: d, class: 'col', style: 'fill:' + (i === pico ? (o.cor || 'var(--g1)') : 'color-mix(in srgb,' + (o.cor || 'var(--g1)') + ' 45%,transparent)') }));
      }
      if (!o.rotuloCada || i % o.rotuloCada === 0) g.push(sv('text', { x: x0 + bw / 2, y: H - 8, class: 'eixo', 'text-anchor': 'middle', text: o.rotulos[i] }));
      var hit = sv('rect', { x: m.l + banda * i, y: m.t, width: banda, height: ih, style: 'fill:transparent' });
      ligarTip(hit, function () { return o.dica(i); });
      g.push(hit);
    });
    if (max > 0) g.push(sv('text', { x: m.l + banda * pico + banda / 2, y: y(max) - 7, class: 'rot-pico', 'text-anchor': 'middle', text: compacto(max) }));
    return sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, class: 'svg-chart enter', role: 'img', 'aria-label': o.aria || 'Gráfico de colunas' }, g);
  }, o.altura || 190);
}

/* ------------------------------------------------------------------ composto: colunas + linhas no mesmo eixo, cursor e tooltip com todas as séries */
function composto(o) {
  var box = responsivo(function (W) {
    var H = o.altura || 250, m = { l: 38, r: 14, t: 14, b: 30 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b, n = o.rotulos.length;
    var max = 0;
    (o.colunas || []).concat(o.linhas || []).forEach(function (s) { s.valores.forEach(function (v) { if (v > max) max = v; }); });
    var bn = bonito(max), banda = iw / n;
    var x = function (i) { return m.l + banda * i + banda / 2; };
    var y = function (v) { return m.t + ih - (v / bn.max) * ih; };
    var g = [];
    for (var v = 0; v <= bn.max + 0.0001; v += bn.passo) {
      g.push(sv('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: 'grade' }));
      g.push(sv('text', { x: m.l - 8, y: y(v) + 4, class: 'eixo', 'text-anchor': 'end', text: compacto(v) }));
    }
    var cada = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 52))));
    for (var i = 0; i < n; i += cada) g.push(sv('text', { x: x(i), y: H - 8, class: 'eixo', 'text-anchor': 'middle', text: o.rotulos[i] }));
    (o.colunas || []).forEach(function (s) {
      var bw = Math.max(4, Math.min(22, banda - 5));
      s.valores.forEach(function (val, i) {
        if (!val) return;
        var top = y(val), hh = m.t + ih - top, r = Math.min(4, hh, bw / 2), x0 = x(i) - bw / 2;
        g.push(sv('path', { d: 'M' + x0 + ' ' + (top + hh) + ' L' + x0 + ' ' + (top + r) + ' Q' + x0 + ' ' + top + ' ' + (x0 + r) + ' ' + top + ' L' + (x0 + bw - r) + ' ' + top + ' Q' + (x0 + bw) + ' ' + top + ' ' + (x0 + bw) + ' ' + (top + r) + ' L' + (x0 + bw) + ' ' + (top + hh) + ' Z', style: 'fill:color-mix(in srgb,' + s.cor + ' 55%,transparent)' }));
      });
    });
    (o.linhas || []).forEach(function (s) {
      var d = s.valores.map(function (val, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(val).toFixed(1); }).join(' ');
      g.push(sv('path', { d: d, style: 'fill:none;stroke:' + s.cor + ';stroke-width:2.2;stroke-linejoin:round;stroke-linecap:round' }));
      g.push(sv('circle', { cx: x(n - 1), cy: y(s.valores[n - 1]), r: 4, style: 'fill:' + s.cor + ';stroke:var(--solid);stroke-width:2' }));
    });
    var cur = sv('g', { style: 'display:none;pointer-events:none' }, [sv('line', { y1: m.t, y2: m.t + ih, class: 'cursor' })]);
    var alvo = sv('rect', { x: m.l, y: m.t, width: iw, height: ih, style: 'fill:transparent' });
    function ir(cx, cy) {
      var r = alvo.getBoundingClientRect();
      var i = Math.max(0, Math.min(n - 1, Math.floor((cx - r.left) / r.width * n)));
      cur.style.display = ''; cur.firstChild.setAttribute('x1', x(i)); cur.firstChild.setAttribute('x2', x(i));
      var todas = (o.colunas || []).concat(o.linhas || []).concat(o.extras || []);
      mostrarTip(cx, cy, { titulo: (o.titulos || o.rotulos)[i], linhas: todas.map(function (s) { return { cor: s.cor, valor: compacto(s.valores[i]), rotulo: s.nome }; }) });
    }
    alvo.addEventListener('pointermove', function (e) { ir(e.clientX, e.clientY); });
    alvo.addEventListener('pointerleave', function () { cur.style.display = 'none'; esconderTip(); });
    return sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, class: 'svg-chart enter', role: 'img', 'aria-label': o.aria || 'Gráfico' }, [g, cur, alvo]);
  }, o.altura || 250);
  var leg = (o.colunas || []).map(function (s) { return { nome: s.nome, cor: s.cor, bloco: true }; }).concat((o.linhas || []).map(function (s) { return { nome: s.nome, cor: s.cor }; }));
  return h('div', null, [h('div', { class: 'legenda' }, leg.map(function (s) { return h('span', null, [h('i', { class: s.bloco ? 'bl' : '', style: 'background:' + s.cor }), s.nome]); })), box]);
}
`;
