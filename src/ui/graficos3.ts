// JavaScript do CRM (navegador): gráfico de bolhas da visão executiva (volume x conversão, com quadrantes). Usa tooltip/responsivo de graficos.ts.
// Dentro dele não usar crases nem "dollar-chave".
export const graficos3 = String.raw`
/* ------------------------------------------------------------------ bolhas: volume x conversão, tamanho = receita */
function bolhas(o) {
  var pontos = o.pontos;
  if (!pontos.length) return vazio(o.vazio || 'Sem dados no período.');
  return responsivo(function (W) {
    var H = 300, m = { l: 52, r: 24, t: 18, b: 44 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
    var xmax = 0, ymax = 0, rmax = 0;
    pontos.forEach(function (p) { if (p.x > xmax) xmax = p.x; if (p.y > ymax) ymax = p.y; if (p.r > rmax) rmax = p.r; });
    var bx = bonito(Math.max(xmax * 1.15, 4)), by = ymax > 50 ? { max: 100, passo: 25 } : bonito(Math.max(ymax * 1.25, 8));
    var x = function (v) { return m.l + v / bx.max * iw; }, y = function (v) { return m.t + ih - v / by.max * ih; };
    var g = [];
    for (var v = 0; v <= by.max + 0.0001; v += by.passo) {
      g.push(sv('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: 'grade' }));
      g.push(sv('text', { x: m.l - 8, y: y(v) + 4, class: 'eixo', 'text-anchor': 'end', text: nf0.format(v) + (o.yPct ? '%' : '') }));
    }
    for (var u = 0; u <= bx.max + 0.0001; u += bx.passo) {
      g.push(sv('line', { x1: x(u), x2: x(u), y1: m.t, y2: m.t + ih, class: 'grade vert' }));
      g.push(sv('text', { x: x(u), y: H - 22, class: 'eixo', 'text-anchor': 'middle', text: nf0.format(u) }));
    }
    if (o.quadrantes && pontos.length > 1) {
      var mx = soma(pontos.map(function (p) { return p.x; })) / pontos.length, my = soma(pontos.map(function (p) { return p.y; })) / pontos.length;
      g.push(sv('line', { x1: x(mx), x2: x(mx), y1: m.t, y2: m.t + ih, class: 'media-l' }));
      g.push(sv('line', { x1: m.l, x2: W - m.r, y1: y(my), y2: y(my), class: 'media-l' }));
      g.push(sv('text', { x: W - m.r - 6, y: m.t + 14, class: 'quad-t', 'text-anchor': 'end', text: 'ESCALAR' }));
      g.push(sv('text', { x: m.l + 6, y: m.t + 14, class: 'quad-t', text: 'POTENCIAL' }));
      g.push(sv('text', { x: W - m.r - 6, y: m.t + ih - 6, class: 'quad-t', 'text-anchor': 'end', text: 'CORRIGIR' }));
      g.push(sv('text', { x: m.l + 6, y: m.t + ih - 6, class: 'quad-t', text: 'OBSERVAR' }));
    }
    g.push(sv('text', { x: m.l + iw / 2, y: H - 4, class: 'eixo', 'text-anchor': 'middle', text: o.rotuloX || 'Volume' }));
    g.push(sv('text', { x: 12, y: m.t + ih / 2, class: 'eixo', 'text-anchor': 'middle', transform: 'rotate(-90 12 ' + (m.t + ih / 2) + ')', text: o.rotuloY || 'Conversão' }));
    pontos.forEach(function (p) {
      var r = 11 + Math.sqrt(rmax > 0 ? p.r / rmax : 0) * 24;
      var c = sv('circle', { cx: x(p.x), cy: y(p.y), r: r, style: 'fill:color-mix(in srgb,' + o.cor + ' 62%,transparent);stroke:' + o.cor + ';stroke-width:2', class: 'bolha' });
      ligarTip(c, function () { return { titulo: p.nome, linhas: o.dica ? o.dica(p) : [{ valor: nf0.format(p.x), rotulo: 'volume' }, { valor: pct(p.y), rotulo: 'conversão' }, { valor: brl(p.r), rotulo: 'receita' }] }; });
      g.push(c);
      g.push(sv('text', { x: x(p.x), y: y(p.y) - r - 6, class: 'rot-pico', 'text-anchor': 'middle', text: p.nome }));
    });
    return sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, class: 'svg-chart enter', role: 'img', 'aria-label': o.aria || 'Gráfico de bolhas' }, g);
  }, 300);
}
`;
