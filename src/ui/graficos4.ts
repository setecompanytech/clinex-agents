// JavaScript do CRM (navegador): gráficos do cockpit executivo (medidor, área com gradiente, Sankey, funil em degraus, raias, treemap, radar).
// Usa tooltip, responsivo e bonito de graficos.ts. Dentro dele não usar crases nem "dollar-chave".
export const graficos4 = String.raw`
var uidG = 0;
function novoId(p) { uidG++; return p + uidG; }
function gradiente(id, c1, c2, vertical) {
  return sv('linearGradient', { id: id, x1: '0', y1: '0', x2: vertical ? '0' : '1', y2: vertical ? '1' : '0' }, [sv('stop', { offset: '0%', 'stop-color': c1 }), sv('stop', { offset: '100%', 'stop-color': c2 })]);
}

/* ------------------------------------------------------------------ medidor radial de 270 graus */
function medidor(o) {
  var T = o.tam || 148, esp = 12, r = (T - esp) / 2 - 2, c = 2 * Math.PI * r, arco = c * 0.75, v = Math.max(0, Math.min(100, o.pct || 0));
  var id = novoId('gm');
  var prog = sv('circle', { cx: T / 2, cy: T / 2, r: r, fill: 'none', 'stroke-width': esp, 'stroke-linecap': 'round', transform: 'rotate(135 ' + T / 2 + ' ' + T / 2 + ')', style: 'stroke:url(#' + id + ');transition:stroke-dasharray 1.1s cubic-bezier(.2,.8,.2,1);filter:drop-shadow(0 0 7px ' + (o.cor2 || o.cor1) + ')', 'stroke-dasharray': semMovimento ? (arco * v / 100) + ' ' + c : '0 ' + c });
  if (!semMovimento) requestAnimationFrame(function () { requestAnimationFrame(function () { prog.setAttribute('stroke-dasharray', (arco * v / 100) + ' ' + c); }); });
  var el = h('div', { class: 'med', role: 'img', 'aria-label': o.rotulo + ': ' + o.centro }, [
    h('div', { class: 'med-s', style: 'width:' + T + 'px;height:' + T + 'px' }, [
      sv('svg', { viewBox: '0 0 ' + T + ' ' + T, width: T, height: T, 'aria-hidden': 'true' }, [sv('defs', null, gradiente(id, o.cor1, o.cor2 || o.cor1)), sv('circle', { cx: T / 2, cy: T / 2, r: r, fill: 'none', 'stroke-width': esp, 'stroke-linecap': 'round', transform: 'rotate(135 ' + T / 2 + ' ' + T / 2 + ')', class: 'med-t', 'stroke-dasharray': arco + ' ' + c }), prog]),
      h('div', { class: 'med-c' }, [h('b', { text: o.centro }), o.sub ? h('small', { text: o.sub }) : null])
    ]),
    h('span', { class: 'med-r', text: o.rotulo })
  ]);
  if (o.dica) ligarTip(el, function () { return o.dica; });
  return el;
}

/* ------------------------------------------------------------------ área com gradiente (ex.: receita acumulada) */
function areaGradiente(o) {
  var fmt = o.fmt || compacto;
  return responsivo(function (W) {
    var H = o.altura || 170, m = { l: 8, r: 8, t: 14, b: 24 }, iw = W - m.l - m.r, ih = H - m.t - m.b, n = o.valores.length;
    var max = Math.max.apply(null, o.valores.concat([1])) * 1.08;
    var x = function (i) { return m.l + (n <= 1 ? iw / 2 : i * iw / (n - 1)); }, y = function (v) { return m.t + ih - v / max * ih; };
    var id = novoId('ag'), idL = novoId('al');
    var d = o.valores.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); }).join(' ');
    var g = [sv('defs', null, [gradiente(id, o.cor, 'transparent', true), gradiente(idL, o.cor2 || o.cor, o.cor)])];
    [0.33, 0.66, 1].forEach(function (k) { g.push(sv('line', { x1: m.l, x2: W - m.r, y1: y(max * k / 1.08), y2: y(max * k / 1.08), class: 'grade' })); });
    g.push(sv('path', { d: d + ' L' + x(n - 1) + ' ' + y(0) + ' L' + x(0) + ' ' + y(0) + ' Z', style: 'fill:url(#' + id + ');opacity:.5' }));
    g.push(sv('path', { d: d, style: 'fill:none;stroke:url(#' + idL + ');stroke-width:3;stroke-linejoin:round;stroke-linecap:round;filter:drop-shadow(0 0 6px ' + o.cor + ')' }));
    g.push(sv('circle', { cx: x(n - 1), cy: y(o.valores[n - 1]), r: 5, style: 'fill:' + o.cor + ';stroke:var(--solid);stroke-width:2.5;filter:drop-shadow(0 0 8px ' + o.cor + ')' }));
    var cada = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 70))));
    for (var i = 0; i < n; i += cada) g.push(sv('text', { x: x(i), y: H - 6, class: 'eixo', 'text-anchor': i === 0 ? 'start' : 'middle', text: o.rotulos[i] }));
    var cur = sv('g', { style: 'display:none;pointer-events:none' }, [sv('line', { y1: m.t, y2: m.t + ih, class: 'cursor' }), sv('circle', { r: 5, style: 'fill:' + o.cor + ';stroke:var(--solid);stroke-width:2.5' })]);
    var alvo = sv('rect', { x: m.l, y: m.t, width: iw, height: ih, style: 'fill:transparent' });
    alvo.addEventListener('pointermove', function (e) {
      var r = alvo.getBoundingClientRect(), i = n <= 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width * iw) / (iw / (n - 1)))));
      cur.style.display = ''; cur.firstChild.setAttribute('x1', x(i)); cur.firstChild.setAttribute('x2', x(i)); cur.lastChild.setAttribute('cx', x(i)); cur.lastChild.setAttribute('cy', y(o.valores[i]));
      mostrarTip(e.clientX, e.clientY, { titulo: (o.titulos || o.rotulos)[i], linhas: [{ cor: o.cor, valor: fmt(o.valores[i]), rotulo: o.nomeAcum || 'acumulado' }].concat(o.porPonto ? [{ valor: fmt(o.porPonto[i]), rotulo: o.nomePonto || 'no período' }] : []) });
    });
    alvo.addEventListener('pointerleave', function () { cur.style.display = 'none'; esconderTip(); });
    return sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, class: 'svg-chart enter', role: 'img', 'aria-label': o.aria || 'Evolução acumulada' }, [g, cur, alvo]);
  }, o.altura || 170);
}

/* ------------------------------------------------------------------ Sankey: de onde veio e para onde foi o dinheiro */
function sankey(o) {
  var nos = o.nos, links = o.links.filter(function (l) { return l.valor > 0; });
  if (!links.length) return vazio('Sem leads recebidos no período.');
  return responsivo(function (W) {
    var H = o.altura || 320, padX = 10, padY = 14, nw = 16, padR = W < 700 ? 110 : 170, gap = 16;
    var iw = W - padX - padR, xs = [padX, padX + (iw - nw) / 2, padX + iw - nw];
    var idx = {}; nos.forEach(function (n, i) { idx[n.id] = i; n.val = 0; n.out = 0; n.inn = 0; n.outN = 0; n.innN = 0; });
    links.forEach(function (l) { nos[idx[l.de]].out += l.valor; nos[idx[l.para]].inn += l.valor; nos[idx[l.de]].outN += l.n; nos[idx[l.para]].innN += l.n; });
    nos.forEach(function (n) { n.val = Math.max(n.out, n.inn); var q = Math.max(n.outN, n.innN); n.qtd = q ? q + (q === 1 ? ' lead' : ' leads') : ''; });
    var cols = [0, 1, 2].map(function (c) { return nos.filter(function (n) { return n.col === c && n.val > 0; }); });
    var escala = Infinity;
    cols.forEach(function (ns) { if (!ns.length) return; var tot = soma(ns.map(function (n) { return n.val; })); escala = Math.min(escala, (H - 2 * padY - gap * (ns.length - 1)) / tot); });
    cols.forEach(function (ns, c) {
      var alt = soma(ns.map(function (n) { return n.val * escala; })) + gap * Math.max(0, ns.length - 1), y = (H - alt) / 2;
      ns.forEach(function (n) { n.x = xs[c]; n.h = Math.max(4, n.val * escala); n.y = y; n.cy = 0; n.ci = 0; y += n.h + gap; });
    });
    var g = [], defs = sv('defs'), grupo = sv('g');
    var ordemPara = function (a, b) { return nos[idx[a.para]].y - nos[idx[b.para]].y; }, ordemDe = function (a, b) { return nos[idx[a.de]].y - nos[idx[b.de]].y; };
    var porDe = links.slice().sort(ordemPara);
    var paths = [];
    nos.forEach(function (n) { n.sai = 0; n.ent = 0; });
    var comOrdem = links.slice().sort(function (a, b) { return nos[idx[a.de]].col - nos[idx[b.de]].col || nos[idx[a.de]].y - nos[idx[b.de]].y || nos[idx[a.para]].y - nos[idx[b.para]].y; });
    var entrando = links.slice().sort(ordemDe);
    var posEnt = {}; entrando.forEach(function (l) { var t = nos[idx[l.para]]; posEnt[l.de + '>' + l.para] = t.y + t.ent; t.ent += l.valor * escala; });
    comOrdem.forEach(function (l, i) {
      var s = nos[idx[l.de]], t = nos[idx[l.para]], w = Math.max(2, l.valor * escala), y1 = s.y + s.sai + w / 2, y2 = posEnt[l.de + '>' + l.para] + w / 2;
      s.sai += l.valor * escala;
      var x1 = s.x + nw, x2 = t.x, xm = (x1 + x2) / 2, id = novoId('sk');
      defs.appendChild(sv('linearGradient', { id: id, gradientUnits: 'userSpaceOnUse', x1: x1, y1: 0, x2: x2, y2: 0 }, [sv('stop', { offset: '0%', 'stop-color': o.cores[s.id] }), sv('stop', { offset: '100%', 'stop-color': o.cores[t.id] })]));
      var p = sv('path', { d: 'M' + x1 + ' ' + y1 + ' C' + xm + ' ' + y1 + ',' + xm + ' ' + y2 + ',' + x2 + ' ' + y2, class: 'sk-l', 'data-de': l.de, 'data-para': l.para, style: 'stroke:url(#' + id + ');stroke-width:' + w + 'px;animation-delay:' + (i * 60) + 'ms' });
      ligarTip(p, function () { return { titulo: s.rotulo + ' → ' + t.rotulo, linhas: [{ valor: brl(l.valor), rotulo: 'em orçamentos' }, { valor: String(l.n), rotulo: l.n === 1 ? 'lead' : 'leads' }, { valor: pct(l.valor / o.total * 100), rotulo: 'do total recebido' }] }; });
      paths.push(p);
    });
    g.push(defs); paths.forEach(function (p) { grupo.appendChild(p); }); g.push(grupo);
    nos.forEach(function (n) {
      if (!(n.val > 0)) return;
      var r = sv('rect', { x: n.x, y: n.y, width: nw, height: n.h, rx: 5, class: 'sk-n', style: 'fill:' + o.cores[n.id] });
      ligarTip(r, function () { return { titulo: n.rotulo, linhas: [{ valor: brl(n.val), rotulo: 'em orçamentos' }, { valor: n.qtd, rotulo: '' }].filter(function (x) { return x.valor; }) }; });
      g.push(r);
      var direita = n.col === 2, tx = direita ? n.x + nw + 10 : n.x + nw + 8;
      g.push(sv('text', { x: tx, y: n.y + n.h / 2 - 2, class: 'sk-t', 'text-anchor': 'start', text: n.rotulo }));
      g.push(sv('text', { x: tx, y: n.y + n.h / 2 + 13, class: 'sk-v', 'text-anchor': 'start', text: brlCompacto(n.val) + (n.qtd ? ' · ' + n.qtd : '') }));
    });
    var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, class: 'svg-chart sankey', role: 'img', 'aria-label': o.aria || 'Fluxo do dinheiro' }, g);
    // realça o caminho ao passar o mouse
    grupo.addEventListener('pointerover', function (e) { var p = e.target; if (p.classList && p.classList.contains('sk-l')) { svg.classList.add('foco'); p.classList.add('on'); } });
    grupo.addEventListener('pointerout', function (e) { var p = e.target; if (p.classList) p.classList.remove('on'); svg.classList.remove('foco'); });
    return svg;
  }, o.altura || 320);
}

/* ------------------------------------------------------------------ degraus: uma barra centralizada por etapa, com a largura do volume */
function degraus(o) {
  var it = o.itens;
  if (!it.length) return vazio('Sem dados.');
  return responsivo(function (W) {
    var hh = 40, gap = 6, mL = W < 560 ? 118 : 170, mR = W < 560 ? 70 : 150, H = it.length * (hh + gap), iw = W - mL - mR, cx = mL + iw / 2;
    var max = Math.max.apply(null, it.map(function (i) { return i.n; }).concat([1]));
    var wd = it.map(function (i) { return Math.max(0.06, i.n / max) * iw; });
    var g = [];
    it.forEach(function (i, k) {
      var y = k * (hh + gap), top = wd[k];
      var pol = sv('rect', { x: cx - top / 2, y: y, width: top, height: hh, rx: 12, style: 'fill:' + i.cor + ';opacity:.92', class: 'degrau' });
      ligarTip(pol, function () { return { titulo: i.rotulo, linhas: i.dica || [{ valor: String(i.n), rotulo: 'leads' }, { valor: brl(i.valor), rotulo: 'em orçamentos' }] }; });
      g.push(pol);
      g.push(sv('text', { x: mL - 12, y: y + hh / 2 + 4, 'text-anchor': 'end', class: 'dg-r', text: i.rotulo }));
      g.push(sv('text', { x: cx, y: y + hh / 2 + 5, 'text-anchor': 'middle', class: 'dg-n', text: String(i.n) }));
      g.push(sv('text', { x: W - mR + 12, y: y + hh / 2 + 4, 'text-anchor': 'start', class: 'dg-v', text: (i.extra || brlCompacto(i.valor)) }));
    });
    return sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, class: 'svg-chart enter', role: 'img', 'aria-label': o.aria || 'Funil em degraus' }, g);
  }, o.itens.length * 46);
}

/* ------------------------------------------------------------------ raias: cada card é uma bolha na linha da sua etapa, posicionada pelos dias parados */
function raias(o) {
  var pts = o.pontos;
  if (!pts.length) return vazio(o.vazio || 'Nenhum card parado.');
  var etapas = o.etapas.filter(function (e) { return pts.some(function (p) { return p.etapa === e; }); });
  return responsivo(function (W) {
    var lh = 52, mL = W < 560 ? 96 : 150, mR = 14, mT = 30, mB = 28, H = mT + etapas.length * lh + mB, iw = W - mL - mR;
    var maxD = Math.max(14, Math.max.apply(null, pts.map(function (p) { return p.dias; }))), x = function (d) { return mL + d / (maxD + 1) * iw; };
    var vmax = Math.max.apply(null, pts.map(function (p) { return p.valor; }).concat([1]));
    var faixas = [[0, 2.5, 'var(--ag0)', '0–2 dias'], [2.5, 5.5, 'var(--ag1)', '3–5'], [5.5, 10.5, 'var(--ag3)', '6–10'], [10.5, maxD + 1, 'var(--ag4)', '+10 dias']];
    var cor = function (d) { return d <= 2 ? 'var(--ag0)' : d <= 5 ? 'var(--ag1)' : d <= 10 ? 'var(--ag3)' : 'var(--ag4)'; };
    var g = [];
    faixas.forEach(function (f) {
      g.push(sv('rect', { x: x(f[0]), y: mT - 6, width: Math.max(0, x(f[1]) - x(f[0])), height: etapas.length * lh + 6, style: 'fill:color-mix(in srgb,' + f[2] + ' 9%,transparent)' }));
      g.push(sv('text', { x: x(f[0]) + 6, y: mT - 12, class: 'eixo', text: f[3] }));
    });
    etapas.forEach(function (e, k) {
      var cy = mT + k * lh + lh / 2;
      g.push(sv('line', { x1: mL, x2: W - mR, y1: cy + lh / 2, y2: cy + lh / 2, class: 'grade' }));
      g.push(sv('text', { x: mL - 12, y: cy + 4, 'text-anchor': 'end', class: 'dg-r', text: e }));
      var doLane = pts.filter(function (p) { return p.etapa === e; }).sort(function (a, b) { return a.dias - b.dias || b.valor - a.valor; });
      var colocados = [];
      doLane.forEach(function (p) {
        var r = 5 + Math.sqrt(p.valor / vmax) * 9, px = x(p.dias + 0.5), off = 0, k2 = 0;
        var livre = function (oy) { return colocados.every(function (c) { var dx = c.x - px, dy = c.y - (cy + oy); return Math.sqrt(dx * dx + dy * dy) >= c.r + r + 1; }); };
        while (!livre(off) && k2 < 14) { k2++; off = (k2 % 2 ? 1 : -1) * Math.ceil(k2 / 2) * (r + 2) * 0.9; }
        off = Math.max(-lh / 2 + r + 2, Math.min(lh / 2 - r - 2, off));
        colocados.push({ x: px, y: cy + off, r: r });
        var c = sv('circle', { cx: px, cy: cy + off, r: r, class: 'ponto', style: 'fill:color-mix(in srgb,' + cor(p.dias) + ' 70%,transparent);stroke:' + cor(p.dias) + ';stroke-width:1.5' });
        ligarTip(c, function () { return { titulo: p.nome, linhas: [{ valor: p.dias + ' d', rotulo: 'parado em ' + e }, { valor: brl(p.valor), rotulo: 'em orçamento' }], nota: 'Clique para abrir o card' }; });
        c.addEventListener('click', function () { abrirLead(p.id); });
        g.push(c);
      });
    });
    for (var d = 0; d <= maxD; d += 2) g.push(sv('text', { x: x(d + 0.5), y: H - 8, class: 'eixo', 'text-anchor': 'middle', text: d + 'd' }));
    return sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, class: 'svg-chart enter', role: 'img', 'aria-label': o.aria || 'Cards por tempo parado' }, g);
  }, 60 + etapas.length * 52);
}

/* ------------------------------------------------------------------ treemap (área = valor) */
function treemap(o) {
  var itens = o.itens.filter(function (i) { return i.valor > 0; }).sort(function (a, b) { return b.valor - a.valor; });
  if (!itens.length) return vazio('Sem valores.');
  var total = soma(itens.map(function (i) { return i.valor; }));
  return responsivo(function (W) {
    var H = o.altura || 270, rects = [];
    (function lay(lista, x, y, w, hgt) {
      if (!lista.length) return;
      if (lista.length === 1) { rects.push({ i: lista[0], x: x, y: y, w: w, h: hgt }); return; }
      var tot = soma(lista.map(function (i) { return i.valor; })), acc = 0, k = 0;
      while (k < lista.length - 1 && acc + lista[k].valor / 2 < tot / 2) { acc += lista[k].valor; k++; }
      if (k === 0) k = 1; var a = lista.slice(0, k), b = lista.slice(k), fa = soma(a.map(function (i) { return i.valor; })) / tot;
      if (w >= hgt) { lay(a, x, y, w * fa, hgt); lay(b, x + w * fa, y, w * (1 - fa), hgt); } else { lay(a, x, y, w, hgt * fa); lay(b, x, y + hgt * fa, w, hgt * (1 - fa)); }
    })(itens, 0, 0, W, H);
    var g = [];
    rects.forEach(function (r) {
      var it = r.i, pad = 2;
      var rc = sv('rect', { x: r.x + pad, y: r.y + pad, width: Math.max(0, r.w - pad * 2), height: Math.max(0, r.h - pad * 2), rx: 10, class: 'tm', style: 'fill:color-mix(in srgb,' + it.cor + ' 78%,transparent);stroke:' + it.cor + ';stroke-width:1.5' });
      ligarTip(rc, function () { return { titulo: it.rotulo, linhas: [{ cor: it.cor, valor: brl(it.valor), rotulo: pct(it.valor / total * 100) + ' do total' }].concat(it.extra ? [{ valor: it.extra, rotulo: '' }] : []) }; });
      g.push(rc);
      if (r.w > 84 && r.h > 40) {
        g.push(sv('text', { x: r.x + 14, y: r.y + 26, class: 'tm-t', text: it.rotulo }));
        g.push(sv('text', { x: r.x + 14, y: r.y + 46, class: 'tm-v', text: brlCompacto(it.valor) }));
      }
    });
    return sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, class: 'svg-chart enter', role: 'img', 'aria-label': o.aria || 'Mapa de áreas do dinheiro' }, g);
  }, o.altura || 270);
}

/* ------------------------------------------------------------------ radar: a pessoa contra a média e o melhor da equipe */
function radar(o) {
  var eixos = o.eixos, n = eixos.length;
  var norm = function (v, e) {
    if (v === null || v === undefined) return 0;
    if (e.invertido) return v > 0 && e.melhor > 0 ? Math.min(100, e.melhor / v * 100) : 0;
    return e.melhor > 0 ? Math.min(100, v / e.melhor * 100) : 0;
  };
  return responsivo(function (W) {
    var T = Math.min(W, 380), H = T, cx = W / 2, cy = H / 2 + 4, R = T / 2 - 56;
    var pt = function (i, pct100) { var a = -Math.PI / 2 + i * 2 * Math.PI / n, r = R * pct100 / 100; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
    var g = [];
    [25, 50, 75, 100].forEach(function (k) { g.push(sv('polygon', { points: eixos.map(function (_, i) { return pt(i, k).join(','); }).join(' '), class: 'rd-anel' })); });
    eixos.forEach(function (e, i) {
      var p = pt(i, 100), q = pt(i, 118);
      g.push(sv('line', { x1: cx, y1: cy, x2: p[0], y2: p[1], class: 'grade' }));
      g.push(sv('text', { x: q[0], y: q[1] + 4, class: 'rd-e', 'text-anchor': Math.abs(q[0] - cx) < 6 ? 'middle' : q[0] > cx ? 'start' : 'end', text: e.eixo }));
    });
    var poli = function (f, cor, preen) { return sv('polygon', { points: eixos.map(function (e, i) { return pt(i, norm(f(e), e)).join(','); }).join(' '), style: 'fill:' + cor + ';fill-opacity:' + preen + ';stroke:' + cor + ';stroke-width:2.2;stroke-linejoin:round' }); };
    g.push(poli(function (e) { return e.media; }, 'var(--g6)', 0.18));
    g.push(poli(function (e) { return e.valor; }, o.cor || 'var(--acc)', 0.28));
    eixos.forEach(function (e, i) {
      var p = pt(i, norm(e.valor, e)), c = sv('circle', { cx: p[0], cy: p[1], r: 5, style: 'fill:' + (o.cor || 'var(--acc)') + ';stroke:var(--solid);stroke-width:2' });
      ligarTip(c, function () { var f = o.fmt[i] || nf1.format; return { titulo: e.eixo, linhas: [{ cor: o.cor || 'var(--acc)', valor: e.valor === null || e.valor === undefined ? '–' : f(e.valor), rotulo: o.nome }, { cor: 'var(--g6)', valor: e.media === null ? '–' : f(e.media), rotulo: 'média da equipe' }, { valor: e.melhor ? f(e.melhor) : '–', rotulo: 'melhor da equipe' }], nota: e.invertido ? 'Aqui, menos dias é melhor.' : '' }; });
      g.push(c);
    });
    return sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, class: 'svg-chart enter', role: 'img', 'aria-label': o.aria || 'Radar de performance' }, g);
  }, 340);
}
`;
