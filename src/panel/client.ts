// JavaScript do painel (roda no navegador). Embutido como string para funcionar no bundle da Vercel.
// REGRAS deste arquivo: sem crases e sem "${" dentro do texto abaixo (é um template literal String.raw).
export const clientJs = String.raw`
(function () {
  'use strict';
  var NODE_W = 260, NODE_H = 112;
  var KIND_LABEL = {};
  var flow = null;
  var nodesById = {};
  var nodeEls = {};
  var edgeEls = [];
  var view = { x: 0, y: 0, k: 1 };
  var selected = null;
  var spotlight = null;
  var vp = document.getElementById('viewport');
  var world = document.getElementById('world');
  var panel = document.getElementById('panel');
  var SVGNS = 'http://www.w3.org/2000/svg';

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function svg(tag, attrs) {
    var e = document.createElementNS(SVGNS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* ------------------------------------------------------------------ tema */
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    var b = document.getElementById('btnTheme');
    if (b) b.textContent = t === 'dark' ? 'Tema claro' : 'Tema escuro';
  }
  (function initTheme() {
    var t = null;
    try { t = localStorage.getItem('painel-theme'); } catch (e) {}
    if (!t) t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    applyTheme(t);
    document.getElementById('btnTheme').addEventListener('click', function () {
      var n = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(n);
      try { localStorage.setItem('painel-theme', n); } catch (e) {}
    });
  })();

  /* ------------------------------------------------------------------ vista (zoom / arrastar) */
  function applyView() {
    world.style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.k + ')';
    vp.style.setProperty('--grid', Math.max(12, 28 * view.k) + 'px');
    vp.style.backgroundPosition = view.x + 'px ' + view.y + 'px';
    var z = document.getElementById('zoomPct');
    if (z) z.textContent = Math.round(view.k * 100) + '%';
  }
  function animate(on) {
    world.classList.toggle('anim', !!on);
    if (on) setTimeout(function () { world.classList.remove('anim'); }, 420);
  }
  function usableWidth() {
    var w = vp.clientWidth;
    if (panel.classList.contains('open') && window.innerWidth > 760) w -= panel.offsetWidth;
    return Math.max(200, w);
  }
  function fitRect(r, pad, maxK) {
    var W = usableWidth(), H = vp.clientHeight;
    pad = pad == null ? 40 : pad;
    var k = Math.min((W - pad * 2) / r.w, (H - pad * 2) / r.h, maxK || 1.1);
    k = clamp(k, 0.12, 2);
    view.k = k;
    view.x = (W - r.w * k) / 2 - r.x * k;
    view.y = (H - r.h * k) / 2 - r.y * k;
    animate(true);
    applyView();
  }
  function zoomAt(cx, cy, factor) {
    var nk = clamp(view.k * factor, 0.12, 2.2);
    var f = nk / view.k;
    view.x = cx - (cx - view.x) * f;
    view.y = cy - (cy - view.y) * f;
    view.k = nk;
    applyView();
  }
  function bboxOfBands(ids) {
    var x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
    flow.bands.forEach(function (b) {
      if (ids.indexOf(b.id) < 0) return;
      x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y);
      x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h);
    });
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  function fitAll() { fitRect(bboxOfBands(flow.bands.map(function (b) { return b.id; })), 24, 1); }

  var pointers = {};
  var drag = null;
  var pinch = null;
  vp.addEventListener('pointerdown', function (e) {
    if (e.target.closest && e.target.closest('.noPan')) return;
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pointers);
    if (ids.length === 1) {
      drag = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false, node: e.target.closest ? e.target.closest('.node') : null };
    } else if (ids.length === 2) {
      var a = pointers[ids[0]], b = pointers[ids[1]];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k };
      if (drag) drag.moved = true;
    }
  });
  vp.addEventListener('pointermove', function (e) {
    if (!pointers[e.pointerId]) return;
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pointers);
    if (ids.length === 2 && pinch) {
      var a = pointers[ids[0]], b = pointers[ids[1]];
      var d = Math.hypot(a.x - b.x, a.y - b.y);
      var r = vp.getBoundingClientRect();
      var cx = (a.x + b.x) / 2 - r.left, cy = (a.y + b.y) / 2 - r.top;
      zoomAt(cx, cy, (pinch.k * d / pinch.d) / view.k);
      return;
    }
    if (!drag) return;
    var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) > 5) {
      drag.moved = true;
      vp.classList.add('grabbing');
      try { vp.setPointerCapture(e.pointerId); } catch (err) {}
    }
    if (drag.moved) {
      view.x = drag.vx + dx;
      view.y = drag.vy + dy;
      applyView();
    }
  });
  function endPointer(e) {
    if (!pointers[e.pointerId]) return;
    delete pointers[e.pointerId];
    if (Object.keys(pointers).length < 2) pinch = null;
    if (drag && Object.keys(pointers).length === 0) {
      if (!drag.moved) {
        if (drag.node) selectNode(drag.node.getAttribute('data-id'));
        else if (e.type === 'pointerup') closePanel();
      }
      drag = null;
      vp.classList.remove('grabbing');
    }
  }
  vp.addEventListener('pointerup', endPointer);
  vp.addEventListener('pointercancel', endPointer);
  vp.addEventListener('wheel', function (e) {
    e.preventDefault();
    var r = vp.getBoundingClientRect();
    var dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0016)));
  }, { passive: false });

  /* ------------------------------------------------------------------ geometria das setas */
  function box(n) { return { x: n.x, y: n.y, w: n.w || NODE_W, h: n.h || NODE_H }; }
  function port(n, side) {
    var b = box(n);
    if (side === 'l') return { x: b.x, y: b.y + b.h / 2 };
    if (side === 'r') return { x: b.x + b.w, y: b.y + b.h / 2 };
    if (side === 't') return { x: b.x + b.w / 2, y: b.y };
    return { x: b.x + b.w / 2, y: b.y + b.h };
  }
  function dirOf(side) {
    if (side === 'l') return { x: -1, y: 0 };
    if (side === 'r') return { x: 1, y: 0 };
    if (side === 't') return { x: 0, y: -1 };
    return { x: 0, y: 1 };
  }
  function bezierPath(a, as, b, bs, t) {
    var da = dirOf(as), db = dirOf(bs);
    var dist = Math.hypot(b.x - a.x, b.y - a.y);
    var d = clamp(dist * 0.45, 40, 160);
    var c1 = { x: a.x + da.x * d, y: a.y + da.y * d };
    var c2 = { x: b.x + db.x * d, y: b.y + db.y * d };
    function at(u) {
      var m = 1 - u;
      return {
        x: m * m * m * a.x + 3 * m * m * u * c1.x + 3 * m * u * u * c2.x + u * u * u * b.x,
        y: m * m * m * a.y + 3 * m * m * u * c1.y + 3 * m * u * u * c2.y + u * u * u * b.y
      };
    }
    return {
      d: 'M' + a.x + ',' + a.y + ' C' + c1.x + ',' + c1.y + ' ' + c2.x + ',' + c2.y + ' ' + b.x + ',' + b.y,
      mid: at(t)
    };
  }
  function roundedPath(pts, r) {
    var d = 'M' + pts[0].x + ',' + pts[0].y;
    for (var i = 1; i < pts.length - 1; i++) {
      var p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
      var l1 = Math.hypot(p1.x - p0.x, p1.y - p0.y), l2 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      var rr = Math.min(r, l1 / 2, l2 / 2);
      var a = { x: p1.x - (p1.x - p0.x) / l1 * rr, y: p1.y - (p1.y - p0.y) / l1 * rr };
      var b = { x: p1.x + (p2.x - p1.x) / l2 * rr, y: p1.y + (p2.y - p1.y) / l2 * rr };
      d += ' L' + a.x + ',' + a.y + ' Q' + p1.x + ',' + p1.y + ' ' + b.x + ',' + b.y;
    }
    var last = pts[pts.length - 1];
    return d + ' L' + last.x + ',' + last.y;
  }
  function wrapPath(a, b, t) {
    var yLow = a.y + 44;
    var xv = b.x - 36;
    var pts = [a, { x: a.x, y: yLow }, { x: xv, y: yLow }, { x: xv, y: b.y }, b];
    var span = xv - a.x;
    return { d: roundedPath(pts, 16), mid: { x: a.x + span * t, y: yLow } };
  }

  /* ------------------------------------------------------------------ desenho */
  function buildBands() {
    flow.bands.forEach(function (b) {
      var d = el('div', 'band');
      d.style.left = b.x + 'px'; d.style.top = b.y + 'px';
      d.style.width = b.w + 'px'; d.style.height = b.h + 'px';
      d.appendChild(el('div', 'bandTitle', b.title));
      d.appendChild(el('div', 'bandSub', b.subtitle));
      world.appendChild(d);
    });
  }
  function buildEdges() {
    var s = svg('svg', { 'class': 'edges', width: 1, height: 1 });
    var defs = svg('defs', {});
    ['main', 'stop', 'hl'].forEach(function (name) {
      var m = svg('marker', { id: 'arrow-' + name, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 8, markerHeight: 8, orient: 'auto-start-reverse' });
      m.appendChild(svg('path', { d: 'M0,0 L10,5 L0,10 z', 'class': 'arrow-' + name }));
      defs.appendChild(m);
    });
    s.appendChild(defs);
    world.appendChild(s);
    flow.edges.forEach(function (e) {
      var a = nodesById[e.from], b = nodesById[e.to];
      var pa = port(a, e.fromSide), pb = port(b, e.toSide);
      var t = e.labelAt == null ? 0.5 : e.labelAt;
      var g = e.route === 'wrap' ? wrapPath(pa, pb, t) : bezierPath(pa, e.fromSide, pb, e.toSide, t);
      var style = e.style || 'main';
      var path = svg('path', { d: g.d, 'class': 'edge edge-' + style, 'marker-end': 'url(#arrow-' + style + ')' });
      s.appendChild(path);
      var lab = null;
      if (e.label) {
        lab = el('div', 'edgeLabel' + (style === 'stop' ? ' stop' : ''), e.label);
        lab.style.left = g.mid.x + 'px'; lab.style.top = g.mid.y + 'px';
        world.appendChild(lab);
      }
      edgeEls.push({ e: e, path: path, label: lab, style: style });
    });
  }
  function buildNodes() {
    flow.nodes.forEach(function (n) {
      var w = n.w || NODE_W, h = n.h || NODE_H;
      var d = el('div', 'node k-' + n.kind + (n.tone ? ' tone-' + n.tone : '') + (n.kind === 'fim' ? ' end' : ''));
      d.setAttribute('data-id', n.id);
      d.setAttribute('role', 'button');
      d.setAttribute('tabindex', '0');
      d.setAttribute('aria-label', (n.step ? 'Passo ' + n.step + ': ' : '') + n.title);
      d.style.left = n.x + 'px'; d.style.top = n.y + 'px';
      d.style.width = w + 'px'; d.style.height = h + 'px';
      var head = el('div', 'nodeHead');
      if (n.step) head.appendChild(el('span', 'badge', String(n.step)));
      head.appendChild(el('span', 'kindLabel', KIND_LABEL[n.kind] || n.kind));
      if (n.canFail) {
        var w2 = el('span', 'warn', '!');
        w2.title = 'Este passo depende de outro sistema e pode dar erro técnico (aparece só no log).';
        head.appendChild(w2);
      }
      d.appendChild(head);
      d.appendChild(el('div', 'nodeTitle', n.title));
      d.appendChild(el('div', 'nodeSub', n.subtitle));
      d.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); selectNode(n.id); }
      });
      world.appendChild(d);
      nodeEls[n.id] = d;
    });
  }

  /* ------------------------------------------------------------------ painel lateral */
  function section(parent, title, text, cls) {
    var s = el('section', 'sec ' + (cls || ''));
    s.appendChild(el('h3', null, title));
    s.appendChild(el('p', null, text));
    parent.appendChild(s);
  }
  function openPanel() { panel.classList.add('open'); panel.setAttribute('aria-hidden', 'false'); document.body.classList.add('panelOpen'); }
  function closePanel() {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('panelOpen');
    setSelected(null);
  }
  function setSelected(id) {
    selected = id;
    Object.keys(nodeEls).forEach(function (k) { nodeEls[k].classList.toggle('sel', k === id); });
    edgeEls.forEach(function (x) {
      var on = id && (x.e.from === id || x.e.to === id);
      x.path.classList.toggle('hl', !!on);
      x.path.setAttribute('marker-end', 'url(#arrow-' + (on ? 'hl' : x.style) + ')');
      if (x.label) x.label.classList.toggle('hl', !!on);
    });
  }
  function ensureVisible(n) {
    var W = usableWidth(), H = vp.clientHeight;
    var b = box(n);
    var sx = b.x * view.k + view.x, sy = b.y * view.k + view.y;
    var ex = sx + b.w * view.k, ey = sy + b.h * view.k;
    var dx = 0, dy = 0, m = 30;
    if (sx < m) dx = m - sx; else if (ex > W - m) dx = W - m - ex;
    if (sy < m + 50) dy = m + 50 - sy; else if (ey > H - m) dy = H - m - ey;
    if (dx || dy) { view.x += dx; view.y += dy; animate(true); applyView(); }
  }
  function selectNode(id) {
    var n = nodesById[id];
    if (!n) return;
    setSelected(id);
    renderPanel(n);
    openPanel();
    ensureVisible(n);
  }
  function renderPanel(n) {
    var body = document.getElementById('panelBody');
    body.textContent = '';
    var chip = el('div', 'chipRow');
    var kc = el('span', 'chip k-' + n.kind, KIND_LABEL[n.kind] || n.kind);
    chip.appendChild(kc);
    if (n.step) chip.appendChild(el('span', 'stepTag', 'Passo ' + n.step));
    body.appendChild(chip);
    body.appendChild(el('h2', 'panelTitle', n.title));
    body.appendChild(el('p', 'panelLead', n.subtitle));
    var d = n.detail;
    section(body, 'O que faz', d.oQueFaz);
    section(body, 'A regra exata', d.regra, 'rule');
    section(body, 'Exemplo', d.exemplo, 'example');
    section(body, 'Se falhar', d.seFalhar, 'fail');

    var outs = flow.edges.filter(function (e) { return e.from === n.id; });
    var ins = flow.edges.filter(function (e) { return e.to === n.id; });
    function links(title, list, key) {
      if (!list.length) return;
      var s = el('section', 'sec');
      s.appendChild(el('h3', null, title));
      var ul = el('div', 'links');
      list.forEach(function (e) {
        var t = nodesById[e[key]];
        var b = el('button', 'linkBtn');
        b.type = 'button';
        var lbl = e.label ? e.label + ' → ' : '';
        b.textContent = lbl + t.title;
        b.addEventListener('click', function () { selectNode(t.id); });
        ul.appendChild(b);
      });
      s.appendChild(ul);
      body.appendChild(s);
    }
    links('Para onde vai depois', outs, 'to');
    links('Vem de', ins, 'from');

    if (d.tecnico) {
      var det = el('details', 'tech');
      det.appendChild(el('summary', null, 'Detalhe técnico (para o time de TI)'));
      det.appendChild(el('p', null, d.tecnico));
      body.appendChild(det);
    }
    body.scrollTop = 0;
  }
  function renderConfig() {
    setSelected(null);
    var body = document.getElementById('panelBody');
    body.textContent = '';
    body.appendChild(el('div', 'chipRow')).appendChild(el('span', 'chip', 'Configurações'));
    body.appendChild(el('h2', 'panelTitle', 'O que dá para ajustar'));
    body.appendChild(el('p', 'panelLead', 'Estas são as opções que mudam o comportamento do agente. Quem altera é o time de TI (variáveis de ambiente). O painel mostra só o nome e o efeito, nunca os valores.'));
    var list = el('div', 'cfgList');
    flow.configuracoes.forEach(function (c) {
      var row = el('div', 'cfg');
      row.appendChild(el('code', null, c.nome));
      row.appendChild(el('p', null, c.efeito));
      list.appendChild(row);
    });
    body.appendChild(list);
    openPanel();
  }

  /* ------------------------------------------------------------------ legenda e navegação */
  function applySpotlight() {
    Object.keys(nodeEls).forEach(function (k) {
      var n = nodesById[k];
      nodeEls[k].classList.toggle('dim', !!spotlight && n.kind !== spotlight);
    });
    var chips = document.querySelectorAll('.legendItem');
    for (var i = 0; i < chips.length; i++) {
      chips[i].classList.toggle('on', chips[i].getAttribute('data-kind') === spotlight);
    }
    edgeEls.forEach(function (x) {
      x.path.classList.toggle('dim', !!spotlight);
      if (x.label) x.label.classList.toggle('dim', !!spotlight);
    });
  }
  function buildChrome() {
    var legend = document.getElementById('legend');
    flow.kinds.forEach(function (k) {
      KIND_LABEL[k.id] = k.nome;
      var b = el('button', 'legendItem k-' + k.id);
      b.type = 'button';
      b.setAttribute('data-kind', k.id);
      b.title = k.descricao + ' (clique para destacar)';
      b.appendChild(el('span', 'dot'));
      b.appendChild(el('span', null, k.nome));
      b.addEventListener('click', function () { spotlight = spotlight === k.id ? null : k.id; applySpotlight(); });
      legend.appendChild(b);
    });
    var w = el('span', 'legendWarn');
    w.appendChild(el('span', 'warn', '!'));
    w.appendChild(el('span', null, 'pode dar erro técnico'));
    legend.appendChild(w);

    var nav = document.getElementById('phases');
    flow.bands.forEach(function (b) {
      var btn = el('button', 'phaseBtn', b.title);
      btn.type = 'button';
      btn.addEventListener('click', function () { fitRect({ x: b.x, y: b.y, w: b.w, h: b.h }, 30, 1); });
      nav.appendChild(btn);
    });
  }

  /* ------------------------------------------------------------------ início */
  function start() {
    flow.kinds.forEach(function (k) { KIND_LABEL[k.id] = k.nome; });
    flow.nodes.forEach(function (n) { nodesById[n.id] = n; });
    document.getElementById('title').textContent = flow.titulo;
    document.getElementById('subtitle').textContent = flow.subtitulo;
    buildChrome();
    buildBands();
    buildEdges();
    buildNodes();
    document.getElementById('btnFit').addEventListener('click', fitAll);
    document.getElementById('btnConfig').addEventListener('click', renderConfig);
    document.getElementById('btnClose').addEventListener('click', closePanel);
    function centerZoom(f) { zoomAt(usableWidth() / 2, vp.clientHeight / 2, f); }
    document.getElementById('zoomIn').addEventListener('click', function () { animate(true); centerZoom(1.25); });
    document.getElementById('zoomOut').addEventListener('click', function () { animate(true); centerZoom(0.8); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closePanel();
      else if (e.key === '+' || e.key === '=') { animate(true); centerZoom(1.25); }
      else if (e.key === '-') { animate(true); centerZoom(0.8); }
      else if (e.key === '0') fitAll();
    });
    window.addEventListener('resize', applyView);
    fitRect(bboxOfBands(['p1', 'p2']), 24, 1);
    document.getElementById('loading').style.display = 'none';
  }

  fetch('/painel/flow.json', { credentials: 'same-origin', cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (j) { flow = j; start(); })
    .catch(function (err) {
      var l = document.getElementById('loading');
      l.textContent = 'Não foi possível carregar o fluxo (' + err.message + '). Recarregue a página.';
    });
})();
`;
