// JavaScript do CRM (navegador): gráficos de evolução no tempo. Usa tooltip, responsivo e bonito de graficos.ts.
// Dentro dele não usar crases nem "dollar-chave".
export const graficos2 = String.raw`
function legendaDe(series) {
  return h('div', { class: 'legenda' }, series.map(function (s) { return h('span', null, [h('i', { class: s.bloco ? 'bl' : '', style: 'background:' + s.cor }), s.nome]); }));
}
function margens() { return { l: 44, r: 14, t: 12, b: 30 }; }
function eixoX(g, o, m, W, H, x, n) {
  var cada = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - m.l - m.r) / 54))));
  for (var i = 0; i < n; i += cada) g.push(sv('text', { x: x(i), y: H - 8, class: 'eixo', 'text-anchor': 'middle', text: o.rotulos[i] }));
}
function gradeY(g, bn, m, W, y, fmt) {
  for (var v = 0; v <= bn.max + 0.0001; v += bn.passo) {
    g.push(sv('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: 'grade' }));
    g.push(sv('text', { x: m.l - 8, y: y(v) + 4, class: 'eixo', 'text-anchor': 'end', text: fmt(v) }));
  }
}
/* cursor vertical + tooltip: devolve o retângulo que captura o mouse */
function camadaCursor(m, iw, ih, n, x, montarDica) {
  var cur = sv('g', { style: 'display:none;pointer-events:none' }, [sv('line', { y1: m.t, y2: m.t + ih, class: 'cursor' })]);
  var alvo = sv('rect', { x: m.l, y: m.t, width: iw, height: ih, style: 'fill:transparent' });
  alvo.addEventListener('pointermove', function (e) {
    var r = alvo.getBoundingClientRect();
    var i = n <= 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width * iw) / (iw / (n - 1)))));
    cur.style.display = ''; cur.firstChild.setAttribute('x1', x(i)); cur.firstChild.setAttribute('x2', x(i));
    mostrarTip(e.clientX, e.clientY, montarDica(i));
  });
  alvo.addEventListener('pointerleave', function () { cur.style.display = 'none'; esconderTip(); });
  return [cur, alvo];
}

/* ------------------------------------------------------------------ área empilhada (composição ao longo do tempo) */
function areaEmpilhada(o) {
  var fmt = o.fmt || compacto;
  var box = responsivo(function (W) {
    var H = o.altura || 260, m = margens(), iw = W - m.l - m.r, ih = H - m.t - m.b, n = o.rotulos.length;
    var tot = o.rotulos.map(function (_, i) { var s = 0; o.series.forEach(function (se) { s += se.valores[i]; }); return s; });
    var bn = bonito(Math.max.apply(null, tot.concat([1])));
    var x = function (i) { return m.l + (n <= 1 ? iw / 2 : i * iw / (n - 1)); };
    var y = function (v) { return m.t + ih - v / bn.max * ih; };
    var g = []; gradeY(g, bn, m, W, y, fmt); eixoX(g, o, m, W, H, x, n);
    var base = o.rotulos.map(function () { return 0; });
    o.series.forEach(function (se) {
      var topo = se.valores.map(function (v, i) { return base[i] + v; });
      var ida = topo.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); }).join(' ');
      var volta = base.map(function (v, i) { return 'L' + x(n - 1 - i).toFixed(1) + ' ' + y(base[n - 1 - i]).toFixed(1); }).join(' ');
      g.push(sv('path', { d: ida + ' ' + volta + ' Z', style: 'fill:color-mix(in srgb,' + se.cor + ' 62%,transparent)' }));
      g.push(sv('path', { d: ida, style: 'fill:none;stroke:' + se.cor + ';stroke-width:1.6;stroke-linejoin:round' }));
      base = topo;
    });
    var cam = camadaCursor(m, iw, ih, n, x, function (i) {
      return { titulo: (o.titulos || o.rotulos)[i], linhas: o.series.slice().reverse().map(function (se) { return { cor: se.cor, valor: fmt(se.valores[i]), rotulo: se.nome }; }).concat([{ valor: fmt(tot[i]), rotulo: 'total' }]) };
    });
    return sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, class: 'svg-chart enter', role: 'img', 'aria-label': o.aria || 'Gráfico de áreas' }, [g, cam]);
  }, o.altura || 260);
  return h('div', null, [legendaDe(o.series.map(function (s) { return { nome: s.nome, cor: s.cor, bloco: true }; })), box]);
}

/* ------------------------------------------------------------------ linhas ao longo do tempo (aceita lacunas, % e unidades) */
function linhasTempo(o) {
  var fmt = o.fmt || compacto;
  var box = responsivo(function (W) {
    var H = o.altura || 260, m = margens(), iw = W - m.l - m.r, ih = H - m.t - m.b, n = o.rotulos.length;
    var max = 0; o.series.forEach(function (s) { s.valores.forEach(function (v) { if (v !== null && v !== undefined && v > max) max = v; }); });
    var bn = bonito(max); if (o.pct && bn.max > 100) bn = { max: 100, passo: 25 };
    var x = function (i) { return m.l + (n <= 1 ? iw / 2 : i * iw / (n - 1)); };
    var y = function (v) { return m.t + ih - v / bn.max * ih; };
    var g = []; gradeY(g, bn, m, W, y, fmt); eixoX(g, o, m, W, H, x, n);
    o.series.forEach(function (s, k) {
      var d = '', abre = true, ult = -1;
      s.valores.forEach(function (v, i) { if (v === null || v === undefined) { abre = true; return; } d += (abre ? 'M' : 'L') + x(i).toFixed(1) + ' ' + y(v).toFixed(1) + ' '; abre = false; ult = i; });
      if (!d) return;
      if (k === 0 && o.area) { var pri = s.valores.findIndex(function (v) { return v !== null && v !== undefined; }); if (pri >= 0 && ult >= 0) g.push(sv('path', { d: d + 'L' + x(ult) + ' ' + y(0) + ' L' + x(pri) + ' ' + y(0) + ' Z', style: 'fill:' + s.cor + ';opacity:.1' })); }
      g.push(sv('path', { d: d, style: 'fill:none;stroke:' + s.cor + ';stroke-width:2.2;stroke-linejoin:round;stroke-linecap:round' }));
      if (ult >= 0) g.push(sv('circle', { cx: x(ult), cy: y(s.valores[ult]), r: 4, style: 'fill:' + s.cor + ';stroke:var(--solid);stroke-width:2' }));
    });
    var cam = camadaCursor(m, iw, ih, n, x, function (i) {
      return { titulo: (o.titulos || o.rotulos)[i], linhas: o.series.map(function (s) { var v = s.valores[i]; return { cor: s.cor, valor: v === null || v === undefined ? '–' : fmt(v), rotulo: s.nome }; }), nota: o.nota };
    });
    return sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, class: 'svg-chart enter', role: 'img', 'aria-label': o.aria || 'Gráfico de linhas' }, [g, cam]);
  }, o.altura || 260);
  return h('div', null, [o.series.length > 1 ? legendaDe(o.series) : null, box]);
}

/* ------------------------------------------------------------------ colunas agrupadas (comparar séries lado a lado) */
function colunasAgrupadas(o) {
  var fmt = o.fmt || compacto;
  var box = responsivo(function (W) {
    var H = o.altura || 260, m = margens(), iw = W - m.l - m.r, ih = H - m.t - m.b, n = o.rotulos.length, k = o.series.length;
    var max = 0; o.series.forEach(function (s) { s.valores.forEach(function (v) { if (v > max) max = v; }); });
    var bn = bonito(max), banda = iw / n, bw = Math.max(3, Math.min(16, (banda - 6) / k));
    var y = function (v) { return m.t + ih - v / bn.max * ih; };
    var g = []; gradeY(g, bn, m, W, y, fmt);
    var xc = function (i) { return m.l + banda * i + banda / 2; };
    eixoX(g, o, m, W, H, xc, n);
    o.series.forEach(function (s, j) {
      s.valores.forEach(function (v, i) {
        if (!v) return;
        var x0 = xc(i) - (k * bw) / 2 + j * bw, top = y(v), hh = m.t + ih - top, r = Math.min(3, hh, bw / 2);
        g.push(sv('path', { d: 'M' + x0 + ' ' + (top + hh) + ' L' + x0 + ' ' + (top + r) + ' Q' + x0 + ' ' + top + ' ' + (x0 + r) + ' ' + top + ' L' + (x0 + bw - 1.5 - r) + ' ' + top + ' Q' + (x0 + bw - 1.5) + ' ' + top + ' ' + (x0 + bw - 1.5) + ' ' + (top + r) + ' L' + (x0 + bw - 1.5) + ' ' + (top + hh) + ' Z', style: 'fill:' + s.cor }));
      });
    });
    for (var i = 0; i < n; i++) (function (i) {
      var hit = sv('rect', { x: m.l + banda * i, y: m.t, width: banda, height: ih, style: 'fill:transparent' });
      ligarTip(hit, function () { return { titulo: (o.titulos || o.rotulos)[i], linhas: o.series.map(function (s) { return { cor: s.cor, valor: fmt(s.valores[i]), rotulo: s.nome }; }) }; });
      g.push(hit);
    })(i);
    return sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, class: 'svg-chart enter', role: 'img', 'aria-label': o.aria || 'Gráfico de colunas' }, g);
  }, o.altura || 260);
  return h('div', null, [legendaDe(o.series.map(function (s) { return { nome: s.nome, cor: s.cor, bloco: true }; })), box]);
}

/* ------------------------------------------------------------------ mapa de calor dia da semana x hora */
var SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
var SEMANA_LONGA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
function mapaCalor(grade, o) {
  o = o || {};
  var ordem = [1, 2, 3, 4, 5, 6, 0], h0 = 6, h1 = 22, max = 1;
  grade.forEach(function (l) { l.forEach(function (v) { if (v > max) max = v; }); });
  var box = responsivo(function (W) {
    var ml = 40, mt = 4, nh = h1 - h0 + 1, cw = (W - ml - 4) / nh, ch = 28, H = mt + ordem.length * ch + 24, g = [];
    ordem.forEach(function (d, r) {
      g.push(sv('text', { x: ml - 8, y: mt + r * ch + ch / 2 + 4, class: 'eixo', 'text-anchor': 'end', text: SEMANA[d] }));
      for (var hr = h0; hr <= h1; hr++) (function (d, hr, r) {
        var v = grade[d][hr];
        var cel = sv('rect', { x: ml + (hr - h0) * cw + 1.5, y: mt + r * ch + 1.5, width: Math.max(2, cw - 3), height: ch - 3, rx: 5, style: v > 0 ? 'fill:color-mix(in srgb,var(--g1) ' + Math.round(14 + 86 * Math.sqrt(v / max)) + '%,var(--solid))' : 'fill:color-mix(in srgb,var(--ink) 5%,transparent)' });
        ligarTip(cel, function () { return { titulo: SEMANA_LONGA[d] + ', ' + String(hr).padStart(2, '0') + 'h', linhas: [{ valor: nf0.format(v), rotulo: o.unidade || 'respostas' }] }; });
        g.push(cel);
      })(d, hr, r);
    });
    for (var k = h0; k <= h1; k += 2) g.push(sv('text', { x: ml + (k - h0) * cw + cw / 2, y: H - 6, class: 'eixo', 'text-anchor': 'middle', text: String(k).padStart(2, '0') + 'h' }));
    return sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, class: 'svg-chart enter', role: 'img', 'aria-label': 'Mapa de calor por dia da semana e hora' }, g);
  }, 230);
  return h('div', null, [box, h('div', { class: 'escala' }, [h('span', { text: 'menos' }), h('i'), h('span', { text: 'mais' })])]);
}

/* ------------------------------------------------------------------ rosca (composição de um total) */
function rosca(partes, o) {
  o = o || {};
  var total = soma(partes.map(function (p) { return p.valor; }));
  if (!total) return vazio(o.vazio || 'Sem dados no período.');
  var T = 150, esp = 26, r = (T - esp) / 2, c = 2 * Math.PI * r, acum = 0, arcos = [];
  partes.forEach(function (p) {
    if (p.valor <= 0) return;
    var len = p.valor / total * c;
    var arco = sv('circle', { cx: T / 2, cy: T / 2, r: r, fill: 'none', 'stroke-width': esp, transform: 'rotate(-90 ' + T / 2 + ' ' + T / 2 + ')', 'stroke-dasharray': Math.max(0, len - 2) + ' ' + (c - Math.max(0, len - 2)), 'stroke-dashoffset': -acum, style: 'stroke:' + p.cor });
    ligarTip(arco, function () { return { titulo: p.rotulo, linhas: [{ cor: p.cor, valor: nf0.format(p.valor), rotulo: pct(p.valor / total * 100) }].concat(p.extra ? [{ valor: p.extra, rotulo: '' }] : []) }; });
    acum += len; arcos.push(arco);
  });
  return h('div', { class: 'rosca' }, [
    h('div', { class: 'rosca-s', style: 'width:' + T + 'px;height:' + T + 'px' }, [sv('svg', { viewBox: '0 0 ' + T + ' ' + T, width: T, height: T, role: 'img', 'aria-label': o.aria || 'Composição' }, arcos), h('div', { class: 'rosca-c' }, [h('b', { text: nf0.format(total) }), h('small', { text: o.centro || 'total' })])]),
    h('div', { class: 'rosca-l' }, partes.map(function (p) { return h('div', null, [h('i', { style: 'background:' + p.cor }), h('span', { text: p.rotulo }), h('b', { text: nf0.format(p.valor) }), h('em', { text: pct(p.valor / total * 100) })]); }))
  ]);
}
`;
