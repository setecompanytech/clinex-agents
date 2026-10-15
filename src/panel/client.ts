// JavaScript do painel (roda no navegador). Embutido como string para funcionar no bundle da Vercel.
// REGRAS deste arquivo: sem crases e sem "${" dentro do texto abaixo (é um template literal String.raw).
export const clientJs = String.raw`
(function () {
  'use strict';
  var NODE_W = 250, NODE_H = 108;
  var KIND_LABEL = {};
  var flow = null;
  var nodesById = {};
  var bandsById = {};
  var nodeEls = {};
  var edgeEls = [];
  var view = { x: 0, y: 0, k: 1 };
  var lastFit = null;
  var selected = null;
  var spotlight = null;
  var tab = 'mapa';
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
  function store(key, val) { try { if (val == null) return localStorage.getItem(key); localStorage.setItem(key, val); } catch (e) {} return null; }

  /* ------------------------------------------------------------------ tema */
  function applyTheme(t, persist) {
    document.documentElement.setAttribute('data-theme', t);
    var b = document.getElementById('btnTheme');
    if (b) b.textContent = t === 'dark' ? 'Tema claro' : 'Tema escuro';
    if (persist) store('painel-theme', t);
  }
  (function initTheme() {
    var t = store('painel-theme');
    if (!t) t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    applyTheme(t, false);
    document.getElementById('btnTheme').addEventListener('click', function () {
      applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', true);
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
  function fitRect(r, pad, maxK, left) {
    lastFit = { r: r, pad: pad, maxK: maxK, left: left };
    var W = usableWidth(), H = vp.clientHeight;
    pad = pad == null ? 40 : pad;
    var k = Math.min((W - pad * 2) / r.w, (H - pad * 2) / r.h, maxK || 1.1);
    k = clamp(k, 0.1, 2);
    view.k = k;
    view.x = left ? (pad - r.x * k) : ((W - r.w * k) / 2 - r.x * k);
    view.y = (H - r.h * k) / 2 - r.y * k;
    animate(true);
    applyView();
  }
  function zoomAt(cx, cy, factor) {
    var nk = clamp(view.k * factor, 0.1, 2.2);
    var f = nk / view.k;
    view.x = cx - (cx - view.x) * f;
    view.y = cy - (cy - view.y) * f;
    view.k = nk;
    applyView();
  }
  function bboxOfBands(ids) {
    var x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
    flow.bands.forEach(function (b) {
      if (ids && ids.indexOf(b.id) < 0) return;
      x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y);
      x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h);
    });
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  function fitAll() { fitRect(bboxOfBands(null), 24, 1); }
  function focusNode(id) {
    var n = nodesById[id];
    if (!n) return;
    var b = box(n), W = usableWidth(), H = vp.clientHeight;
    var k = Math.max(0.85, Math.min(view.k, 1.1));
    view.k = k;
    view.x = W / 2 - (b.x + b.w / 2) * k;
    view.y = H / 2 - (b.y + b.h / 2) * k;
    animate(true);
    applyView();
  }

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
  /* linha em ângulos retos passando pelos pontos "via" */
  function polyPath(a, via, b, t) {
    var raw = [a];
    (via || []).forEach(function (v) { raw.push({ x: v[0], y: v[1] }); });
    raw.push(b);
    var pts = [raw[0]];
    for (var i = 1; i < raw.length; i++) {
      var p = pts[pts.length - 1];
      if (Math.hypot(raw[i].x - p.x, raw[i].y - p.y) > 0.5) pts.push(raw[i]);
    }
    var total = 0, segs = [];
    for (var j = 1; j < pts.length; j++) { var l = Math.hypot(pts[j].x - pts[j - 1].x, pts[j].y - pts[j - 1].y); segs.push(l); total += l; }
    var want = total * t, acc = 0, mid = pts[0];
    for (var s = 0; s < segs.length; s++) {
      if (acc + segs[s] >= want) {
        var f = segs[s] ? (want - acc) / segs[s] : 0;
        mid = { x: pts[s].x + (pts[s + 1].x - pts[s].x) * f, y: pts[s].y + (pts[s + 1].y - pts[s].y) * f };
        break;
      }
      acc += segs[s];
    }
    return { d: roundedPath(pts, 14), mid: mid };
  }

  /* ------------------------------------------------------------------ desenho */
  function buildBands() {
    flow.bands.forEach(function (b) {
      var d = el('div', 'band' + (b.faixa ? ' band-' + b.faixa : ''));
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
    ['main', 'stop', 'alert', 'gpt', 'hl'].forEach(function (name) {
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
      var g = e.route === 'poly' ? polyPath(pa, e.via, pb, t) : bezierPath(pa, e.fromSide, pb, e.toSide, t);
      var style = e.style || 'main';
      var path = svg('path', { d: g.d, 'class': 'edge edge-' + style, 'marker-end': 'url(#arrow-' + style + ')' });
      s.appendChild(path);
      var lab = null;
      if (e.label) {
        lab = el('div', 'edgeLabel' + (style !== 'main' ? ' ' + style : ''), e.label);
        var lx = e.labelXY ? e.labelXY[0] : g.mid.x, ly = e.labelXY ? e.labelXY[1] : g.mid.y;
        lab.style.left = lx + 'px'; lab.style.top = ly + 'px';
        world.appendChild(lab);
      }
      edgeEls.push({ e: e, path: path, label: lab, style: style });
    });
  }
  function stepText(n) {
    if (typeof n.step === 'number') return 'Passo ' + n.step;
    if (!n.step) return '';
    var c = String(n.step).charAt(0);
    return (c === 'A' ? 'Alerta ' : c === 'G' ? 'GPT ' : c === 'R' ? 'Regra ' : '') + n.step;
  }
  function buildNodes() {
    flow.nodes.forEach(function (n) {
      var w = n.w || NODE_W, h = n.h || NODE_H;
      var d = el('div', 'node k-' + n.kind + (n.tone ? ' tone-' + n.tone : '') + (n.kind === 'fim' ? ' end' : ''));
      d.setAttribute('data-id', n.id);
      d.setAttribute('role', 'button');
      d.setAttribute('tabindex', '0');
      d.setAttribute('aria-label', (n.step ? stepText(n) + ': ' : '') + n.title);
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
    if (sy < m + 10) dy = m + 10 - sy; else if (ey > H - m) dy = H - m - ey;
    if (dx || dy) { view.x += dx; view.y += dy; animate(true); applyView(); }
  }
  function selectNode(id, focus) {
    var n = nodesById[id];
    if (!n) return;
    setSelected(id);
    renderPanel(n);
    openPanel();
    if (focus) focusNode(id); else ensureVisible(n);
  }
  function renderPanel(n) {
    var body = document.getElementById('panelBody');
    body.textContent = '';
    var chip = el('div', 'chipRow');
    var kc = el('span', 'chip k-' + n.kind, KIND_LABEL[n.kind] || n.kind);
    chip.appendChild(kc);
    if (n.step) chip.appendChild(el('span', 'stepTag', stepText(n)));
    var bd = bandsById[n.band];
    if (bd) chip.appendChild(el('span', 'phaseTag', bd.title));
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
      if (d.tecnicoAberto) det.open = true;
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
    body.appendChild(el('p', 'panelLead', 'Estas são as opções técnicas que mudam o comportamento do agente sem alterar o código. Quem altera é o time de TI (variáveis de ambiente). O painel mostra só o nome e o efeito, nunca os valores. O texto das mensagens e as etapas da conversa só mudam alterando o código.'));
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
      var btn = el('button', 'phaseBtn' + (b.faixa === 'alerta' ? ' alerta' : b.faixa === 'gpt' ? ' gpt' : ''), b.title.length > 30 ? b.title.split(' (')[0] : b.title);
      btn.type = 'button';
      btn.title = b.subtitle;
      btn.addEventListener('click', function () { setTab('mapa'); fitRect({ x: b.x, y: b.y, w: b.w, h: b.h }, 30, 1); });
      nav.appendChild(btn);
    });
  }

  /* ------------------------------------------------------------------ resumo */
  function buildResumo() {
    var r = flow.resumo, box1 = document.getElementById('resumo');
    box1.textContent = '';
    function bloco(cls, titulo) { var d = el('div', cls); d.appendChild(el('h2', null, titulo)); box1.appendChild(d); return d; }
    var o = bloco('obj', 'Objetivo do agente'); o.appendChild(el('p', null, r.objetivo));
    var f = bloco('faz', 'O que faz hoje'); var ul = el('ul'); r.faz.forEach(function (t) { ul.appendChild(el('li', null, t)); }); f.appendChild(ul);
    var nf = bloco('naofaz', 'O que ainda não faz'); var ul2 = el('ul'); r.naoFaz.forEach(function (t) { ul2.appendChild(el('li', null, t)); }); nf.appendChild(ul2);
    var m = bloco('modo', 'Modo atual'); m.appendChild(el('p', null, r.modo));
  }
  function setResumo(show) {
    document.getElementById('resumo').classList.toggle('hide', !show);
    document.getElementById('btnResumo').textContent = show ? 'Ocultar resumo' : 'Mostrar resumo';
    store('painel-resumo', show ? '1' : '0');
    if (lastFit && tab === 'mapa') fitRect(lastFit.r, lastFit.pad, lastFit.maxK, lastFit.left);
  }

  /* ------------------------------------------------------------------ exemplo de conversa */
  function buildChat(conv, forPrint) {
    var chat = el('div', forPrint ? 'chat pgChat' : 'chat');
    conv.mensagens.forEach(function (m) {
      if (m.de === 'nota') { chat.appendChild(el('div', 'note', m.texto)); return; }
      var wrap = el('div', 'msg ' + m.de);
      wrap.appendChild(el('div', 'who', m.de === 'amanda' ? 'Amanda' : 'Paciente'));
      wrap.appendChild(el('div', 'bubble', m.texto));
      var n = m.etapa && nodesById[m.etapa];
      if (n && !forPrint) {
        var b = el('button', 'etapaLink', 'Etapa: ' + (n.step ? stepText(n) + ' · ' : '') + n.title);
        b.type = 'button';
        b.addEventListener('click', function () { setTab('mapa'); selectNode(n.id, true); });
        wrap.appendChild(b);
      }
      chat.appendChild(wrap);
    });
    return chat;
  }
  function showConversa(id) {
    var side = document.getElementById('convSide'), main = document.getElementById('convMain');
    var picks = side.querySelectorAll('.convPick');
    for (var i = 0; i < picks.length; i++) picks[i].classList.toggle('on', picks[i].getAttribute('data-id') === id);
    var conv = flow.conversas.filter(function (c) { return c.id === id; })[0];
    main.textContent = '';
    var head = el('div', 'convHead');
    head.appendChild(el('h2', null, conv.titulo));
    head.appendChild(el('p', null, conv.descricao));
    main.appendChild(head);
    main.appendChild(buildChat(conv, false));
    main.appendChild(el('div', 'convFoot', 'As mensagens da Amanda são o texto do roteiro. Na prática, o GPT pode ajustar o tom (sem mudar valores, datas, horários, unidades nem a pergunta), exceto nas mensagens de emergência e crise. Nomes, CPF e telefone são inventados. Clique em "Etapa" para ver essa etapa no mapa.'));
    main.scrollTop = 0;
  }
  function buildConversas() {
    var side = document.getElementById('convSide');
    side.textContent = '';
    side.appendChild(el('h2', null, 'Conversas de exemplo'));
    flow.conversas.forEach(function (c) {
      var b = el('button', 'convPick', c.titulo);
      b.type = 'button';
      b.setAttribute('data-id', c.id);
      b.addEventListener('click', function () { showConversa(c.id); });
      side.appendChild(b);
    });
    showConversa(flow.conversas[0].id);
  }

  /* ------------------------------------------------------------------ abas */
  function setTab(t) {
    tab = t;
    var conv = t === 'conversa';
    document.getElementById('convView').classList.toggle('on', conv);
    document.getElementById('tabMapa').classList.toggle('on', !conv);
    document.getElementById('tabConversa').classList.toggle('on', conv);
    document.getElementById('legend').parentNode.style.display = conv ? 'none' : '';
    document.getElementById('phases').style.display = conv ? 'none' : '';
    document.getElementById('btnFit').style.display = conv ? 'none' : '';
    vp.style.visibility = conv ? 'hidden' : '';
    if (conv) closePanel();
    else if (lastFit && !panel.classList.contains('open')) applyView();
  }

  /* ------------------------------------------------------------------ impressão / PDF */
  var printReady = false, themeBefore = null;
  function orderedNodes() { return flow.nodes.slice(); }
  var mapSeq = 0;
  function mapPage(root, titulo, ids) {
    var pre = 'pm' + (mapSeq++) + '-';
    var r = bboxOfBands(ids);
    var k = Math.min(1040 / r.w, 610 / r.h);
    var page = el('section', 'pgPage');
    page.appendChild(el('h2', 'pgH2', titulo));
    var clip = el('div', 'mapClip');
    clip.style.width = Math.round(r.w * k) + 'px';
    clip.style.height = Math.round(r.h * k) + 'px';
    var clone = world.cloneNode(true);
    clone.removeAttribute('id');
    clone.className = 'worldClone';
    clone.style.transition = 'none';
    clone.style.transform = 'translate(' + (-r.x * k) + 'px,' + (-r.y * k) + 'px) scale(' + k + ')';
    var junk = clone.querySelectorAll('.sel,.dim,.hl');
    for (var i = 0; i < junk.length; i++) { junk[i].classList.remove('sel'); junk[i].classList.remove('dim'); junk[i].classList.remove('hl'); }
    // marcadores com ids próprios (o original fica escondido na impressão e não desenharia as pontas das setas)
    var mk = clone.querySelectorAll('marker');
    for (var m = 0; m < mk.length; m++) mk[m].id = pre + mk[m].id;
    var ed = clone.querySelectorAll('path.edge');
    for (var q = 0; q < ed.length; q++) {
      var me = ed[q].getAttribute('marker-end') || '';
      ed[q].setAttribute('marker-end', me.replace('url(#', 'url(#' + pre));
    }
    clip.appendChild(clone);
    page.appendChild(clip);
    root.appendChild(page);
  }
  function preparePrint() {
    if (printReady || !flow) return;
    printReady = true;
    themeBefore = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', 'light');
    var root = document.getElementById('printRoot');
    root.textContent = '';
    // capa + resumo
    var cover = el('section', 'pgPage');
    cover.appendChild(el('h1', 'pgTitle', flow.titulo));
    cover.appendChild(el('p', 'pgMeta', flow.versao + ' · ' + flow.data));
    var g = el('div', 'pgSummary');
    var c1 = el('div'); c1.appendChild(el('h3', null, 'Objetivo do agente')); c1.appendChild(el('p', null, flow.resumo.objetivo));
    var c1b = el('div'); c1b.appendChild(el('h3', null, 'Modo atual')); c1b.appendChild(el('p', null, flow.resumo.modo)); c1.appendChild(c1b);
    var c2 = el('div'); c2.appendChild(el('h3', null, 'O que faz hoje')); var u2 = el('ul'); flow.resumo.faz.forEach(function (t) { u2.appendChild(el('li', null, t)); }); c2.appendChild(u2);
    var c3 = el('div'); c3.appendChild(el('h3', null, 'O que ainda não faz')); var u3 = el('ul'); flow.resumo.naoFaz.forEach(function (t) { u3.appendChild(el('li', null, t)); }); c3.appendChild(u3);
    g.appendChild(c1); g.appendChild(c2); g.appendChild(c3);
    cover.appendChild(g);
    var cl = el('p', 'pgMeta', 'Legenda de cores: ' + flow.kinds.map(function (k) { return k.nome; }).join(' · ') + '.');
    cl.style.marginTop = '12px';
    cover.appendChild(cl);
    root.appendChild(cover);
    // mapa: visão geral e por partes
    mapPage(root, 'Mapa: visão geral', null);
    [['p1', 'p2'], ['p3', 'p4'], ['p5', 'p6'], ['p7', 'p8'], ['alertas'], ['gpt'], ['regras']].forEach(function (ids) {
      mapPage(root, 'Mapa: ' + ids.map(function (i) { return bandsById[i].title; }).join('  |  '), ids);
    });
    // detalhamento de cada passo
    var det = el('section', 'pgPage');
    det.appendChild(el('h2', 'pgH2', 'Detalhe de cada passo'));
    var grid = el('div', 'detGrid');
    orderedNodes().forEach(function (n) {
      var d = el('div', 'det k-' + n.kind);
      d.appendChild(el('h4', null, (n.step ? stepText(n) + ' · ' : '') + n.title));
      var bd = bandsById[n.band];
      d.appendChild(el('div', 'ph', (bd ? bd.title + ' · ' : '') + (KIND_LABEL[n.kind] || n.kind)));
      [['O que faz', n.detail.oQueFaz], ['A regra exata', n.detail.regra], ['Exemplo', n.detail.exemplo], ['Se falhar', n.detail.seFalhar], ['Detalhe técnico', n.detail.tecnico]].forEach(function (p) {
        if (!p[1]) return;
        d.appendChild(el('b', null, p[0]));
        d.appendChild(el('span', null, p[1]));
      });
      grid.appendChild(d);
    });
    det.appendChild(grid);
    root.appendChild(det);
    // conversas de exemplo
    var cv = el('section', 'pgPage');
    cv.appendChild(el('h2', 'pgH2', 'Exemplos de conversa'));
    var cg = el('div', 'detGrid');
    flow.conversas.forEach(function (c) {
      var w = el('div', 'detCv');
      w.appendChild(el('h4', null, c.titulo));
      w.appendChild(el('p', 'pgMeta', c.descricao));
      w.appendChild(buildChat(c, true));
      cg.appendChild(w);
    });
    cv.appendChild(cg);
    root.appendChild(cv);
  }
  function cleanupPrint() {
    if (!printReady) return;
    printReady = false;
    document.getElementById('printRoot').textContent = '';
    if (themeBefore) document.documentElement.setAttribute('data-theme', themeBefore);
  }
  window.addEventListener('beforeprint', preparePrint);
  window.addEventListener('afterprint', cleanupPrint);
  window.__painelPrepararImpressao = preparePrint;

  /* ------------------------------------------------------------------ início */
  function start() {
    flow.kinds.forEach(function (k) { KIND_LABEL[k.id] = k.nome; });
    flow.nodes.forEach(function (n) { nodesById[n.id] = n; });
    flow.bands.forEach(function (b) { bandsById[b.id] = b; });
    document.getElementById('title').textContent = flow.titulo;
    document.querySelector('h1').title = flow.subtitulo;
    document.getElementById('verTag').textContent = flow.versao;
    document.getElementById('verDate').textContent = 'atualizado em ' + flow.data;
    buildChrome();
    buildBands();
    buildEdges();
    buildNodes();
    buildResumo();
    buildConversas();
    var saved = store('painel-resumo');
    var show = saved === '1' || (saved !== '0' && window.innerWidth > 760);
    document.getElementById('resumo').classList.toggle('hide', !show);
    document.getElementById('btnResumo').textContent = show ? 'Ocultar resumo' : 'Mostrar resumo';
    document.getElementById('btnResumo').addEventListener('click', function () { setResumo(document.getElementById('resumo').classList.contains('hide')); });
    document.getElementById('btnFit').addEventListener('click', fitAll);
    document.getElementById('btnConfig').addEventListener('click', function () { setTab('mapa'); renderConfig(); });
    document.getElementById('btnClose').addEventListener('click', closePanel);
    document.getElementById('btnPrint').addEventListener('click', function () { preparePrint(); setTimeout(function () { window.print(); }, 60); });
    document.getElementById('tabMapa').addEventListener('click', function () { setTab('mapa'); });
    document.getElementById('tabConversa').addEventListener('click', function () { setTab('conversa'); });
    function centerZoom(f) { zoomAt(usableWidth() / 2, vp.clientHeight / 2, f); }
    document.getElementById('zoomIn').addEventListener('click', function () { animate(true); centerZoom(1.25); });
    document.getElementById('zoomOut').addEventListener('click', function () { animate(true); centerZoom(0.8); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closePanel();
      else if (tab !== 'mapa') return;
      else if (e.key === '+' || e.key === '=') { animate(true); centerZoom(1.25); }
      else if (e.key === '-') { animate(true); centerZoom(0.8); }
      else if (e.key === '0') fitAll();
    });
    window.addEventListener('resize', applyView);
    fitRect(bboxOfBands(window.innerWidth > 760 ? ['p1', 'p2', 'p3'] : ['p1']), 24, 1, true);
    document.getElementById('loading').style.display = 'none';
    window.__painel = { fit: function (ids) { fitRect(bboxOfBands(ids), 24, 1); }, select: function (id) { selectNode(id, true); }, tab: setTab, fitAll: fitAll };
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
