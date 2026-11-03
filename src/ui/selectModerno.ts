/**
 * Listas suspensas modernas (navegador). Troca o menu nativo do sistema operacional por um menu do design system,
 * sem trocar o <select>: ele continua na tela, com o mesmo layout, o mesmo value e os mesmos eventos input/change.
 * Funciona para selects criados a qualquer momento (os eventos são delegados no document).
 * Não usar em um select: data-nativo (mantém o menu do sistema), multiple e size maior que 1 já são ignorados.
 * Dentro do texto não usar crases nem "dollar-chave".
 */
export const selectModerno = String.raw`
(function () {
  var aberto = null;
  var NS = 'http://www.w3.org/2000/svg';

  function alvo(el) { return !!el && el.tagName === 'SELECT' && !el.multiple && !(el.size > 1) && !el.disabled && !el.hasAttribute('data-nativo'); }
  function icoOk() {
    var s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2.6'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(NS, 'path'); p.setAttribute('d', 'M5 12.5l4.5 4.5L19 7.5'); s.appendChild(p); return s;
  }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; }

  function fechar(foco) {
    if (!aberto) return;
    var a = aberto; aberto = null;
    a.sel.setAttribute('aria-expanded', 'false');
    a.menu.classList.add('saindo');
    setTimeout(function () { if (a.menu.parentNode) a.menu.parentNode.removeChild(a.menu); }, 120);
    if (foco) a.sel.focus();
  }

  function posicionar() {
    if (!aberto) return;
    var r = aberto.sel.getBoundingClientRect(), m = aberto.menu;
    var vw = window.innerWidth, vh = window.innerHeight;
    m.style.minWidth = Math.max(r.width, 160) + 'px';
    m.style.maxWidth = Math.min(440, vw - 16) + 'px';
    var abaixo = vh - r.bottom - 12, acima = r.top - 12;
    var h = Math.min(m.scrollHeight, 320);
    var emCima = h > abaixo && acima > abaixo;
    var espaco = Math.max(120, Math.min(320, emCima ? acima : abaixo));
    m.style.maxHeight = espaco + 'px';
    var alt = Math.min(m.offsetHeight, espaco);
    m.style.top = Math.max(8, emCima ? r.top - alt - 6 : r.bottom + 6) + 'px';
    var l = Math.min(r.left, vw - m.offsetWidth - 8);
    m.style.left = Math.max(8, l) + 'px';
    m.classList.toggle('acima', emCima);
  }

  function visiveis() { return aberto.itens.filter(function (i) { return !i.oculto && !i.desab; }); }
  function destacar(i, rolar) {
    if (!aberto) return;
    aberto.itens.forEach(function (x) { x.el.classList.remove('ativo'); });
    aberto.ativo = i;
    if (i) { i.el.classList.add('ativo'); if (rolar !== false) i.el.scrollIntoView({ block: 'nearest' }); }
  }
  function mover(delta) {
    var v = visiveis(); if (!v.length) return;
    var k = aberto.ativo ? v.indexOf(aberto.ativo) : -1;
    destacar(v[Math.max(0, Math.min(v.length - 1, k + delta))]);
  }
  function escolher(it) {
    if (!aberto || !it || it.desab) return;
    var sel = aberto.sel, mudou = sel.selectedIndex !== it.idx;
    fechar(true);
    if (mudou) {
      sel.selectedIndex = it.idx;
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function abrir(sel) {
    if (aberto && aberto.sel === sel) { fechar(true); return; }
    fechar(false);
    var menu = el('div', 'sel-menu'); menu.setAttribute('role', 'listbox');
    var lista = el('div', 'sel-lista');
    var itens = [];
    function add(op, grupo) {
      var vazio = op.value === '' && op.index === 0;
      var e = el('div', 'sel-op' + (vazio ? ' sel-vazio' : '') + (grupo ? ' dentro' : ''));
      e.setAttribute('role', 'option');
      e.setAttribute('aria-selected', String(op.selected));
      if (op.disabled) e.setAttribute('aria-disabled', 'true');
      e.appendChild(el('span', 'sel-t', op.textContent));
      if (op.selected) e.appendChild(icoOk());
      var it = { el: e, idx: op.index, desab: op.disabled, texto: op.textContent.toLowerCase(), oculto: false };
      e.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
      e.addEventListener('click', function () { escolher(it); });
      e.addEventListener('mousemove', function () { if (!it.desab && aberto && aberto.ativo !== it) destacar(it, false); });
      itens.push(it); lista.appendChild(e);
    }
    Array.prototype.forEach.call(sel.children, function (c) {
      if (c.tagName === 'OPTGROUP') { lista.appendChild(el('div', 'sel-grp', c.label)); Array.prototype.forEach.call(c.children, function (o) { add(o, true); }); }
      else if (c.tagName === 'OPTION') add(c, false);
    });
    var busca = null;
    if (itens.length > 10) {
      busca = document.createElement('input'); busca.type = 'search'; busca.placeholder = 'Buscar…'; busca.setAttribute('aria-label', 'Buscar na lista'); busca.autocomplete = 'off';
      var cx = el('div', 'sel-busca'); cx.appendChild(busca); menu.appendChild(cx);
      busca.addEventListener('input', function () {
        var q = busca.value.trim().toLowerCase(), algum = false;
        itens.forEach(function (i) { i.oculto = !!q && i.texto.indexOf(q) < 0; i.el.style.display = i.oculto ? 'none' : ''; if (!i.oculto) algum = true; });
        if (aberto.nada) aberto.nada.style.display = algum ? 'none' : '';
        var v = visiveis(); destacar(v[0] || null);
      });
    }
    var nada = el('div', 'sel-nada', 'Nada encontrado'); nada.style.display = 'none';
    menu.appendChild(lista); menu.appendChild(nada);
    document.body.appendChild(menu);
    sel.setAttribute('aria-expanded', 'true');
    aberto = { sel: sel, menu: menu, itens: itens, ativo: null, buffer: '', tempo: 0, busca: busca, nada: nada };
    posicionar();
    var atual = itens.filter(function (i) { return i.idx === sel.selectedIndex; })[0] || visiveis()[0];
    destacar(atual || null);
    if (busca) busca.focus();
  }

  document.addEventListener('mousedown', function (e) {
    if (e.button === 0 && alvo(e.target)) { e.preventDefault(); e.target.focus(); abrir(e.target); return; }
    if (aberto && !aberto.menu.contains(e.target)) fechar(false);
  }, true);

  document.addEventListener('keydown', function (e) {
    if (!aberto) {
      if (alvo(e.target) && (e.key === 'Enter' || e.key === ' ' || e.key === 'F4' || (e.altKey && e.key === 'ArrowDown'))) { e.preventDefault(); abrir(e.target); }
      return;
    }
    var k = e.key;
    if (k === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); fechar(true); return; }
    if (k === 'Tab') { fechar(false); return; }
    if (k === 'ArrowDown') { e.preventDefault(); mover(1); return; }
    if (k === 'ArrowUp') { e.preventDefault(); mover(-1); return; }
    if (k === 'Home') { e.preventDefault(); var v = visiveis(); destacar(v[0]); return; }
    if (k === 'End') { e.preventDefault(); var w = visiveis(); destacar(w[w.length - 1]); return; }
    if (k === 'Enter' || (k === ' ' && !aberto.busca)) { e.preventDefault(); e.stopImmediatePropagation(); escolher(aberto.ativo); return; }
    if (!aberto.busca && k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var agora = Date.now();
      aberto.buffer = (agora - aberto.tempo < 700 ? aberto.buffer : '') + k.toLowerCase(); aberto.tempo = agora;
      var ach = visiveis().filter(function (i) { return i.texto.indexOf(aberto.buffer) === 0; })[0];
      if (ach) destacar(ach);
    }
  }, true);

  window.addEventListener('scroll', function (e) { if (aberto && !aberto.menu.contains(e.target)) posicionar(); }, true);
  window.addEventListener('resize', function () { if (aberto && !document.body.contains(aberto.sel)) fechar(false); else posicionar(); });
})();
`;
