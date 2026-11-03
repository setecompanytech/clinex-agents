// JavaScript do BI, parte 2: gráficos. Cores sempre por variável CSS (--s1..--s3, --o1..--o7, --heat-*),
// assim o tema claro/escuro troca sem redesenhar. Não usar crases nem "dollar-chave" aqui dentro.
export const charts = String.raw`
function bonito(max) {
  if (max <= 0) return { max: 4, passo: 1 };
  var bruto = max / 4, mag = Math.pow(10, Math.floor(Math.log10(bruto))), f = bruto / mag;
  var passo = Math.max(1, (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag);
  return { max: Math.ceil(max / passo) * passo, passo: passo };
}

/* Minigráfico de tendência: linha 2px, lavagem de 12% e ponto final com anel da cor da superfície. */
function spark(vals, cor, W, H) {
  W = W || 120; H = H || 34;
  var p = 4, n = vals.length;
  if (n < 2) return h('span');
  var max = Math.max.apply(null, vals.concat([1]));
  var x = function (i) { return p + i * (W - 2 * p) / (n - 1); };
  var y = function (v) { return H - p - (v / max) * (H - 2 * p); };
  var d = vals.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); }).join(' ');
  var area = d + ' L' + x(n - 1).toFixed(1) + ' ' + (H - p) + ' L' + x(0).toFixed(1) + ' ' + (H - p) + ' Z';
  return sv('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'spark', 'aria-hidden': 'true' }, [
    sv('path', { d: area, style: 'fill:' + cor + ';opacity:.12' }),
    sv('path', { d: d, style: 'fill:none;stroke:' + cor + ';stroke-width:2;stroke-linejoin:round;stroke-linecap:round' }),
    sv('circle', { cx: x(n - 1), cy: y(vals[n - 1]), r: 3.5, style: 'fill:' + cor + ';stroke:var(--surface);stroke-width:2' })
  ]);
}

function legenda(series) {
  return h('div', { class: 'legenda' }, series.map(function (s) {
    return h('span', null, [h('i', { style: 'background:' + s.cor }), s.nome]);
  }));
}

/* Linhas no tempo: cursor vertical que gruda no ponto mais próximo e um tooltip com TODAS as séries. */
function graficoLinhas(o) {
  var box = responsivo(function (W) {
    var H = 250, m = { l: 40, r: 16, t: 14, b: 30 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b, n = o.rotulos.length;
    var max = 0;
    o.series.forEach(function (s) { s.valores.forEach(function (v) { if (v > max) max = v; }); });
    var bn = bonito(max);
    var x = function (i) { return m.l + (n <= 1 ? iw / 2 : i * iw / (n - 1)); };
    var y = function (v) { return m.t + ih - (v / bn.max) * ih; };
    var g = [];
    for (var v = 0; v <= bn.max + 0.0001; v += bn.passo) {
      g.push(sv('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: 'grade' }));
      g.push(sv('text', { x: m.l - 8, y: y(v) + 4, class: 'eixo', 'text-anchor': 'end', text: fmtN(v) }));
    }
    var cada = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 62))));
    for (var i = 0; i < n; i += cada) g.push(sv('text', { x: x(i), y: H - 8, class: 'eixo', 'text-anchor': 'middle', text: o.rotulos[i] }));
    o.series.forEach(function (s) {
      var d = s.valores.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); }).join(' ');
      if (s.area) g.push(sv('path', { d: d + ' L' + x(n - 1) + ' ' + y(0) + ' L' + x(0) + ' ' + y(0) + ' Z', style: 'fill:' + s.cor + ';opacity:.10' }));
      g.push(sv('path', { d: d, style: 'fill:none;stroke:' + s.cor + ';stroke-width:2;stroke-linejoin:round;stroke-linecap:round' }));
      g.push(sv('circle', { cx: x(n - 1), cy: y(s.valores[n - 1]), r: 4, style: 'fill:' + s.cor + ';stroke:var(--surface);stroke-width:2' }));
    });
    var cur = sv('g', { style: 'display:none;pointer-events:none' }, [sv('line', { y1: m.t, y2: m.t + ih, class: 'cursor' })]);
    var pts = o.series.map(function (s) { var c = sv('circle', { r: 4.5, style: 'fill:' + s.cor + ';stroke:var(--surface);stroke-width:2' }); cur.appendChild(c); return c; });
    var alvo = sv('rect', { x: m.l, y: m.t, width: iw, height: ih, style: 'fill:transparent', tabindex: '0', 'aria-label': 'Gráfico de linhas: passe o mouse para ver os valores' });
    function ir(cx, cy, el) {
      var r = el.getBoundingClientRect();
      var i = Math.max(0, Math.min(n - 1, Math.round(((cx - r.left) / r.width * iw) / (iw / Math.max(1, n - 1)))));
      var xx = x(i);
      cur.style.display = '';
      cur.firstChild.setAttribute('x1', xx); cur.firstChild.setAttribute('x2', xx);
      o.series.forEach(function (s, k) { pts[k].setAttribute('cx', xx); pts[k].setAttribute('cy', y(s.valores[i])); });
      mostrarTip(cx, cy, {
        titulo: (o.titulos || o.rotulos)[i],
        linhas: o.series.map(function (s) { return { cor: s.cor, valor: fmtN(s.valores[i]), rotulo: s.nome }; })
      });
    }
    alvo.addEventListener('pointermove', function (e) { ir(e.clientX, e.clientY, alvo); });
    alvo.addEventListener('pointerleave', function () { cur.style.display = 'none'; esconderTip(); });
    return sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, class: 'svg-chart enter', role: 'img', 'aria-label': o.aria || 'Gráfico de linhas' }, [g, cur, alvo]);
  }, 250);
  return h('div', null, [o.series.length > 1 ? legenda(o.series) : null, box]);
}

/* Colunas: largura no máximo 24px, canto de cima arredondado (4px), base reta; só o pico leva o número. */
function graficoColunas(o) {
  return responsivo(function (W) {
    var H = o.altura || 190, m = { l: 34, r: 8, t: 22, b: 26 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b, n = o.valores.length;
    var max = Math.max.apply(null, o.valores.concat([1]));
    var bn = bonito(max), banda = iw / n, bw = Math.max(4, Math.min(24, banda - 4));
    var y = function (v) { return m.t + ih - (v / bn.max) * ih; };
    var g = [];
    for (var v = 0; v <= bn.max + 0.0001; v += bn.passo) {
      g.push(sv('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: 'grade' }));
      g.push(sv('text', { x: m.l - 6, y: y(v) + 4, class: 'eixo', 'text-anchor': 'end', text: fmtN(v) }));
    }
    var pico = o.valores.indexOf(max);
    o.valores.forEach(function (val, i) {
      var x0 = m.l + banda * i + (banda - bw) / 2, hh = Math.max(0, ih - (y(val) - m.t)), top = y(val), r = Math.min(4, hh, bw / 2);
      if (val > 0) {
        var d = 'M' + x0 + ' ' + (top + hh) + ' L' + x0 + ' ' + (top + r) + ' Q' + x0 + ' ' + top + ' ' + (x0 + r) + ' ' + top +
          ' L' + (x0 + bw - r) + ' ' + top + ' Q' + (x0 + bw) + ' ' + top + ' ' + (x0 + bw) + ' ' + (top + r) + ' L' + (x0 + bw) + ' ' + (top + hh) + ' Z';
        g.push(sv('path', { d: d, class: 'col', style: 'fill:' + (i === pico ? 'var(--s1)' : 'var(--s1-suave)') }));
      }
      if (o.rotuloCada && i % o.rotuloCada === 0) g.push(sv('text', { x: x0 + bw / 2, y: H - 8, class: 'eixo', 'text-anchor': 'middle', text: o.rotulos[i] }));
      else if (!o.rotuloCada) g.push(sv('text', { x: x0 + bw / 2, y: H - 8, class: 'eixo', 'text-anchor': 'middle', text: o.rotulos[i] }));
      var hit = sv('rect', { x: m.l + banda * i, y: m.t, width: banda, height: ih, style: 'fill:transparent' });
      ligarTip(hit, function () { return o.dica(i); });
      g.push(hit);
    });
    if (max > 0) g.push(sv('text', { x: m.l + banda * pico + banda / 2, y: y(max) - 7, class: 'rot-pico', 'text-anchor': 'middle', text: fmtN(max) }));
    return sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, class: 'svg-chart enter', role: 'img', 'aria-label': o.aria || 'Gráfico de colunas' }, g);
  }, o.altura || 190);
}

/* Mapa de calor dia da semana x hora: rampa de UMA cor (azul), claro = pouco, escuro = muito. */
var DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
var DIAS_LONGOS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
function mapaCalor(calor) {
  var ordem = [1, 2, 3, 4, 5, 6, 0];
  var max = 1;
  calor.forEach(function (l) { l.forEach(function (v) { if (v > max) max = v; }); });
  var box = responsivo(function (W) {
    var ml = 38, mt = 4, cw = (W - ml - 4) / 24, ch = 26, H = mt + ordem.length * ch + 24, g = [];
    ordem.forEach(function (d, r) {
      g.push(sv('text', { x: ml - 8, y: mt + r * ch + ch / 2 + 4, class: 'eixo', 'text-anchor': 'end', text: DIAS[d] }));
      for (var hr = 0; hr < 24; hr++) {
        (function (d, hr, r) {
          var v = calor[d][hr];
          var cel = sv('rect', {
            x: ml + hr * cw + 1, y: mt + r * ch + 1, width: Math.max(2, cw - 2), height: ch - 2, rx: 4,
            style: v > 0 ? 'fill:color-mix(in oklab, var(--heat-hi) ' + Math.round(14 + 86 * Math.sqrt(v / max)) + '%, var(--heat-lo))' : 'fill:var(--surface-2)'
          });
          ligarTip(cel, function () { return { titulo: DIAS_LONGOS[d] + ', ' + String(hr).padStart(2, '0') + 'h', linhas: [{ valor: nf0.format(v), rotulo: v === 1 ? 'conversa iniciada' : 'conversas iniciadas' }] }; });
          g.push(cel);
        })(d, hr, r);
      }
    });
    for (var k = 0; k < 24; k += 3) g.push(sv('text', { x: ml + k * cw + cw / 2, y: H - 6, class: 'eixo', 'text-anchor': 'middle', text: String(k).padStart(2, '0') + 'h' }));
    return sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, class: 'svg-chart enter', role: 'img', 'aria-label': 'Mapa de calor das conversas por dia da semana e hora' }, g);
  }, 220);
  var esc = h('div', { class: 'escala' }, [h('span', { text: 'menos' }), h('i'), h('span', { text: 'mais' })]);
  return h('div', null, [box, esc]);
}

/* Barras horizontais (HTML): marca fina, ponta arredondada, valor na ponta e dica ao passar o mouse. */
function barras(linhas, o) {
  o = o || {};
  if (!linhas.length) return vazio(o.vazio || 'Sem dados no período.');
  var max = o.max || Math.max.apply(null, linhas.map(function (l) { return l.valor; }).concat([1]));
  return h('div', { class: 'bars' + (o.alta ? ' alta' : '') }, linhas.map(function (l) {
    var pct = l.valor > 0 ? Math.max(1.5, l.valor / max * 100) : 0;
    var row = h('div', { class: 'bar-row' }, [
      h('div', { class: 'bar-l', title: l.rotulo, text: l.rotulo }),
      h('div', { class: 'bar-t' }, h('div', { class: 'bar-f', style: 'width:' + pct + '%;background:' + (l.cor || o.cor || 'var(--s1)') })),
      h('div', { class: 'bar-v' }, [h('b', { text: l.texto !== undefined ? l.texto : fmtN(l.valor) }), l.extra ? h('span', { text: l.extra }) : null])
    ]);
    ligarTip(row, function () { return l.dica || { titulo: l.rotulo, linhas: [{ valor: fmtN(l.valor), rotulo: l.sub || '' }] }; });
    return row;
  }));
}

/* Barra 100% empilhada: segmentos separados por 2px da cor da superfície, legenda com valor (nunca só cor). */
function empilhada(partes) {
  var total = soma(partes.map(function (p) { return p.valor; }));
  if (!total) return vazio('Sem dados no período.');
  var barra = h('div', { class: 'stack' }, partes.filter(function (p) { return p.valor > 0; }).map(function (p) {
    var seg = h('div', { class: 'stack-s', style: 'flex:' + p.valor + ';background:' + p.cor });
    ligarTip(seg, function () { return { titulo: p.rotulo, linhas: [{ cor: p.cor, valor: nf0.format(p.valor), rotulo: fmtP(p.valor / total * 100) }] }; });
    return seg;
  }));
  var leg = h('div', { class: 'stack-l' }, partes.map(function (p) {
    return h('div', null, [h('i', { style: 'background:' + p.cor }), h('span', { text: p.rotulo }), h('b', { text: nf0.format(p.valor) }), h('em', { text: fmtP(p.valor / total * 100) })]);
  }));
  return h('div', null, [barra, leg]);
}
`;
