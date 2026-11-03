/**
 * Calendário e seletor de hora modernos (navegador). Trocam o popup nativo de input type=date e type=time por um painel
 * do design system, sem trocar o <input>: ele continua na tela, com o mesmo value (aaaa-mm-dd / hh:mm), min, max e os
 * mesmos eventos input/change. Os eventos são delegados no document, então vale para campos criados a qualquer momento.
 * Quem quiser o popup do sistema em um campo marca data-nativo. A digitação pelo teclado (Tab até o campo) continua igual.
 * Dentro do texto não usar crases nem "dollar-chave".
 */
export const dataModerna = String.raw`
(function () {
  var ap = null;
  var NS = 'http://www.w3.org/2000/svg';
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var MES_C = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  var SEMANA_L = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; }
  function icone(d) {
    var s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', '16'); s.setAttribute('height', '16'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2.2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); s.appendChild(p); return s;
  }
  function botao(cls, rotulo, d, fn) {
    var b = el('button', cls); b.type = 'button'; b.setAttribute('aria-label', rotulo); b.title = rotulo; b.appendChild(icone(d));
    b.addEventListener('mousedown', function (e) { e.preventDefault(); }); b.addEventListener('click', fn); return b;
  }
  function alvo(e) { return !!e && e.tagName === 'INPUT' && (e.type === 'date' || e.type === 'time') && !e.disabled && !e.readOnly && !e.hasAttribute('data-nativo'); }

  /* ---------------------------------------------------------------- datas (sempre em UTC puro: sem fuso e sem horário de verão) */
  function hojeISO() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Belem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  function agoraHM() { var p = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Belem', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()); return p.replace(/^24/, '00'); }
  function lerData(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? { a: +m[1], m: +m[2] - 1, d: +m[3] } : null; }
  function iso(o) { return o.a + '-' + pad(o.m + 1) + '-' + pad(o.d); }
  function utc(a, m, d) { return new Date(Date.UTC(a, m, d)); }
  function somaDias(o, n) { var t = utc(o.a, o.m, o.d + n); return { a: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate() }; }
  function somaMeses(o, n) { var t = utc(o.a, o.m + n, 1); var max = utc(t.getUTCFullYear(), t.getUTCMonth() + 1, 0).getUTCDate(); return { a: t.getUTCFullYear(), m: t.getUTCMonth(), d: Math.min(o.d, max) }; }
  function permitido(inp, s) { return !(inp.min && s < inp.min) && !(inp.max && s > inp.max); }

  /* ---------------------------------------------------------------- abrir, fechar, posicionar */
  function fechar(foco) {
    if (!ap) return;
    var a = ap; ap = null;
    a.inp.setAttribute('aria-expanded', 'false');
    a.menu.classList.add('saindo');
    setTimeout(function () { if (a.menu.parentNode) a.menu.parentNode.removeChild(a.menu); }, 120);
    if (foco) a.inp.focus();
  }
  function posicionar() {
    if (!ap) return;
    var r = ap.inp.getBoundingClientRect(), m = ap.menu, vw = window.innerWidth, vh = window.innerHeight;
    var h = m.offsetHeight, w = m.offsetWidth;
    var emCima = vh - r.bottom - 12 < h && r.top - 12 > vh - r.bottom - 12;
    var top = emCima ? r.top - h - 6 : r.bottom + 6;
    m.style.top = Math.max(8, Math.min(top, vh - h - 8)) + 'px';
    m.style.left = Math.max(8, Math.min(r.left, vw - w - 8)) + 'px';
    m.classList.toggle('acima', emCima);
  }
  function emitir(inp) {
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /* ---------------------------------------------------------------- calendário */
  function abrirData(inp) {
    var sel = lerData(inp.value), hoje = lerData(hojeISO());
    var base = sel || hoje;
    var st = { vista: 'dias', mes: { a: base.a, m: base.m }, foco: { a: base.a, m: base.m, d: base.d }, anos: base.a - (base.a % 12) };
    var menu = el('div', 'dp-menu'); menu.setAttribute('role', 'dialog'); menu.setAttribute('aria-label', 'Escolher a data');
    document.body.appendChild(menu);
    ap = { inp: inp, menu: menu, tipo: 'data', st: st, desenhar: desenhar, hoje: hoje };
    inp.setAttribute('aria-expanded', 'true');

    function escolher(o) {
      var s = iso(o); if (!permitido(inp, s)) return;
      var mudou = inp.value !== s;
      fechar(true);
      if (mudou) { inp.value = s; emitir(inp); }
    }
    function limpar() { var mudou = inp.value !== ''; fechar(true); if (mudou) { inp.value = ''; emitir(inp); } }

    function cabecalho(titulo, anterior, proximo, clique) {
      var c = el('div', 'dp-topo');
      c.appendChild(botao('dp-nav', 'Anterior', 'M15 6l-6 6 6 6', anterior));
      var t = el('button', 'dp-titulo', titulo); t.type = 'button'; t.addEventListener('mousedown', function (e) { e.preventDefault(); }); t.addEventListener('click', clique);
      c.appendChild(t);
      c.appendChild(botao('dp-nav', 'Próximo', 'M9 6l6 6-6 6', proximo));
      return c;
    }
    function desenhar() {
      while (menu.firstChild) menu.removeChild(menu.firstChild);
      if (st.vista === 'dias') {
        menu.appendChild(cabecalho(MESES[st.mes.m].charAt(0).toUpperCase() + MESES[st.mes.m].slice(1) + ' de ' + st.mes.a, function () { st.mes = somaMeses({ a: st.mes.a, m: st.mes.m, d: 1 }, -1); st.foco = { a: st.mes.a, m: st.mes.m, d: Math.min(st.foco.d, 28) }; desenhar(); posicionar(); },
          function () { st.mes = somaMeses({ a: st.mes.a, m: st.mes.m, d: 1 }, 1); st.foco = { a: st.mes.a, m: st.mes.m, d: Math.min(st.foco.d, 28) }; desenhar(); posicionar(); }, function () { st.vista = 'meses'; desenhar(); posicionar(); }));
        var sem = el('div', 'dp-sem'); SEMANA.forEach(function (d, i) { var s = el('span', null, d); s.title = SEMANA_L[i]; sem.appendChild(s); }); menu.appendChild(sem);
        var grade = el('div', 'dp-grade'); grade.setAttribute('role', 'grid');
        var ini = somaDias({ a: st.mes.a, m: st.mes.m, d: 1 }, -utc(st.mes.a, st.mes.m, 1).getUTCDay());
        for (var i = 0; i < 42; i++) {
          (function (o) {
            var s = iso(o), fora = o.m !== st.mes.m, ok = permitido(inp, s);
            var b = el('button', 'dp-dia' + (fora ? ' dp-fora' : '') + (s === iso(hoje) ? ' dp-hoje' : '') + (inp.value === s ? ' dp-sel' : '') + (!ok ? ' dp-off' : '') + (iso(st.foco) === s ? ' dp-foco' : ''), String(o.d));
            b.type = 'button'; b.setAttribute('role', 'gridcell'); b.setAttribute('aria-selected', String(inp.value === s)); b.title = SEMANA_L[utc(o.a, o.m, o.d).getUTCDay()] + ', ' + o.d + ' de ' + MESES[o.m] + ' de ' + o.a;
            if (!ok) b.disabled = true;
            b.addEventListener('mousedown', function (e) { e.preventDefault(); });
            b.addEventListener('click', function () { escolher(o); });
            grade.appendChild(b);
          })(somaDias(ini, i));
        }
        menu.appendChild(grade);
      } else if (st.vista === 'meses') {
        menu.appendChild(cabecalho(String(st.mes.a), function () { st.mes.a--; desenhar(); }, function () { st.mes.a++; desenhar(); }, function () { st.vista = 'anos'; st.anos = st.mes.a - (st.mes.a % 12); desenhar(); }));
        var gm = el('div', 'dp-grade3');
        MES_C.forEach(function (n, k) {
          var b = el('button', 'dp-mes' + (k === hoje.m && st.mes.a === hoje.a ? ' dp-hoje' : '') + (sel && sel.m === k && sel.a === st.mes.a ? ' dp-sel' : ''), n); b.type = 'button';
          b.addEventListener('mousedown', function (e) { e.preventDefault(); });
          b.addEventListener('click', function () { st.mes.m = k; st.foco = { a: st.mes.a, m: k, d: Math.min(st.foco.d, 28) }; st.vista = 'dias'; desenhar(); posicionar(); });
          gm.appendChild(b);
        });
        menu.appendChild(gm);
      } else {
        menu.appendChild(cabecalho(st.anos + ' – ' + (st.anos + 11), function () { st.anos -= 12; desenhar(); }, function () { st.anos += 12; desenhar(); }, function () { st.vista = 'meses'; desenhar(); }));
        var ga = el('div', 'dp-grade3');
        for (var y = st.anos; y < st.anos + 12; y++) {
          (function (ano) {
            var b = el('button', 'dp-mes' + (ano === hoje.a ? ' dp-hoje' : '') + (sel && sel.a === ano ? ' dp-sel' : ''), String(ano)); b.type = 'button';
            b.addEventListener('mousedown', function (e) { e.preventDefault(); });
            b.addEventListener('click', function () { st.mes.a = ano; st.vista = 'meses'; desenhar(); });
            ga.appendChild(b);
          })(y);
        }
        menu.appendChild(ga);
      }
      var rod = el('div', 'dp-rod');
      var bh = el('button', 'dp-acao', 'Hoje'); bh.type = 'button'; bh.disabled = !permitido(inp, iso(hoje));
      bh.addEventListener('mousedown', function (e) { e.preventDefault(); }); bh.addEventListener('click', function () { escolher(hoje); });
      var bl = el('button', 'dp-acao suave', 'Limpar'); bl.type = 'button';
      bl.addEventListener('mousedown', function (e) { e.preventDefault(); }); bl.addEventListener('click', limpar);
      rod.appendChild(bh); rod.appendChild(bl); menu.appendChild(rod);
    }
    ap.escolher = escolher;
    desenhar(); posicionar();
  }

  /* ---------------------------------------------------------------- hora */
  function abrirHora(inp) {
    var m0 = /^(\d{2}):(\d{2})$/.exec(inp.value || '');
    var st = { h: m0 ? +m0[1] : null, mi: m0 ? +m0[2] : null, col: 'h' };
    var menu = el('div', 'dp-menu tp'); menu.setAttribute('role', 'dialog'); menu.setAttribute('aria-label', 'Escolher a hora');
    document.body.appendChild(menu);
    ap = { inp: inp, menu: menu, tipo: 'hora', st: st, desenhar: desenhar };
    inp.setAttribute('aria-expanded', 'true');
    function gravar() {
      var h = st.h === null ? 0 : st.h, mi = st.mi === null ? 0 : st.mi;
      var v = pad(h) + ':' + pad(mi);
      if (inp.min && v < inp.min || inp.max && v > inp.max) return;
      if (inp.value !== v) { inp.value = v; emitir(inp); }
    }
    function coluna(titulo, valores, atual, tipo) {
      var c = el('div', 'tp-col'); c.appendChild(el('div', 'tp-tit', titulo));
      var l = el('div', 'tp-lista'); l.setAttribute('role', 'listbox'); l.setAttribute('aria-label', titulo);
      valores.forEach(function (v) {
        var b = el('button', 'tp-i' + (v === atual ? ' dp-sel' : '') + (st.col === tipo && v === atual ? ' dp-foco' : ''), pad(v)); b.type = 'button'; b.setAttribute('role', 'option'); b.setAttribute('aria-selected', String(v === atual));
        b.addEventListener('mousedown', function (e) { e.preventDefault(); });
        b.addEventListener('click', function () { if (tipo === 'h') { st.h = v; if (st.mi === null) st.mi = 0; st.col = 'm'; } else { st.mi = v; if (st.h === null) st.h = 0; } gravar(); if (tipo === 'm') fechar(true); else desenhar(); });
        l.appendChild(b);
      });
      c.appendChild(l); return c;
    }
    function desenhar() {
      while (menu.firstChild) menu.removeChild(menu.firstChild);
      var cols = el('div', 'tp-cols');
      var horas = []; for (var h = 0; h < 24; h++) horas.push(h);
      var mins = []; for (var k = 0; k < 60; k += 5) mins.push(k);
      if (st.mi !== null && mins.indexOf(st.mi) < 0) { mins.push(st.mi); mins.sort(function (a, b) { return a - b; }); }
      cols.appendChild(coluna('Hora', horas, st.h, 'h')); cols.appendChild(coluna('Minuto', mins, st.mi, 'm'));
      menu.appendChild(cols);
      var rod = el('div', 'dp-rod');
      var bn = el('button', 'dp-acao', 'Agora'); bn.type = 'button';
      bn.addEventListener('mousedown', function (e) { e.preventDefault(); });
      bn.addEventListener('click', function () { var p = agoraHM().split(':'); st.h = +p[0]; st.mi = +p[1]; gravar(); fechar(true); });
      var bl = el('button', 'dp-acao suave', 'Limpar'); bl.type = 'button';
      bl.addEventListener('mousedown', function (e) { e.preventDefault(); });
      bl.addEventListener('click', function () { var mudou = inp.value !== ''; fechar(true); if (mudou) { inp.value = ''; emitir(inp); } });
      rod.appendChild(bn); rod.appendChild(bl); menu.appendChild(rod);
      var sel = menu.querySelectorAll('.tp-i.dp-sel'); Array.prototype.forEach.call(sel, function (b) { b.parentNode.scrollTop = b.offsetTop - b.parentNode.clientHeight / 2 + b.offsetHeight / 2; });
    }
    desenhar(); posicionar();
  }

  function abrir(inp) {
    if (ap && ap.inp === inp) { fechar(true); return; }
    fechar(false);
    if (inp.type === 'date') abrirData(inp); else abrirHora(inp);
  }

  /* ---------------------------------------------------------------- teclado dentro do calendário */
  function tecladoData(e) {
    var st = ap.st, k = e.key;
    if (st.vista !== 'dias') return false;
    var passo = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[k];
    if (passo !== undefined) { st.foco = somaDias(st.foco, passo); st.mes = { a: st.foco.a, m: st.foco.m }; ap.desenhar(); return true; }
    if (k === 'PageUp' || k === 'PageDown') { st.foco = somaMeses(st.foco, k === 'PageUp' ? -1 : 1); st.mes = { a: st.foco.a, m: st.foco.m }; ap.desenhar(); return true; }
    if (k === 'Home' || k === 'End') { st.foco = { a: st.foco.a, m: st.foco.m, d: k === 'Home' ? 1 : utc(st.foco.a, st.foco.m + 1, 0).getUTCDate() }; ap.desenhar(); return true; }
    if (k === 'Enter' || k === ' ') { ap.escolher(st.foco); return true; }
    return false;
  }
  function tecladoHora(e) {
    var st = ap.st, k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowRight') { st.col = st.col === 'h' ? 'm' : 'h'; ap.desenhar(); return true; }
    if (k === 'ArrowUp' || k === 'ArrowDown') {
      var d = k === 'ArrowUp' ? -1 : 1;
      if (st.col === 'h') st.h = ((st.h === null ? (d > 0 ? -1 : 0) : st.h) + d + 24) % 24; else st.mi = (((st.mi === null ? (d > 0 ? -5 : 0) : st.mi) + d * 5) + 60) % 60;
      if (st.h === null) st.h = 0; if (st.mi === null) st.mi = 0;
      var v = pad(st.h) + ':' + pad(st.mi); if (ap.inp.value !== v) { ap.inp.value = v; emitir(ap.inp); }
      ap.desenhar(); return true;
    }
    if (k === 'Enter') { fechar(true); return true; }
    return false;
  }

  document.addEventListener('mousedown', function (e) {
    if (e.button === 0 && alvo(e.target)) { e.preventDefault(); e.target.focus(); abrir(e.target); return; }
    if (ap && !ap.menu.contains(e.target)) fechar(false);
  }, true);

  document.addEventListener('keydown', function (e) {
    if (!ap) {
      if (alvo(e.target) && (e.key === 'F4' || (e.altKey && e.key === 'ArrowDown') || e.key === ' ')) { e.preventDefault(); abrir(e.target); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); fechar(true); return; }
    if (e.key === 'Tab') { fechar(false); return; }
    var tratou = ap.tipo === 'data' ? tecladoData(e) : tecladoHora(e);
    if (tratou) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  window.addEventListener('scroll', function (e) { if (ap && !ap.menu.contains(e.target)) posicionar(); }, true);
  window.addEventListener('resize', function () { if (ap && !document.body.contains(ap.inp)) fechar(false); else posicionar(); });
})();
`;
