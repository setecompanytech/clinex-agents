/**
 * Estrutura de página do design system (menu lateral, topo, tema) para os módulos fora do CRM.
 * O CRM monta o próprio menu; aqui os módulos declaram só o `data-modulo` e o `data-ativo` no <body> e este código
 * constrói o resto. Dentro dos textos de JS não usar crases nem "dollar-chave".
 */

export const shellCss = `
/* ---- barra de filtros, interruptor e campos de apoio (usados fora do CRM) */
.barra-f{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end}
.campo-b{display:flex;flex-direction:column;gap:4px;font-size:11.5px;color:var(--mut);font-weight:650}
.barra-f .in{width:auto;min-width:200px}
.sw{width:42px;height:24px;border-radius:12px;border:1px solid var(--line2);background:var(--card2);position:relative;flex:none;cursor:pointer;transition:background .2s}
.sw i{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:var(--mut);transition:transform .2s,background .2s}
.sw.on{background:color-mix(in srgb,var(--ok) 35%,transparent);border-color:var(--ok)}.sw.on i{transform:translateX(18px);background:var(--ok)}
.au-lig{display:flex;align-items:center;gap:10px;font-weight:600;font-size:14px}
/* ---- estrutura dos módulos: topo com trilha, menu com módulos */
.topo.dupla{justify-content:space-between;align-items:center;gap:16px}
.crumbs{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--mut);min-width:0;white-space:nowrap}
.crumbs a:hover{color:var(--ink)}.crumbs b{color:var(--ink);font-weight:700;overflow:hidden;text-overflow:ellipsis}.crumbs i{font-style:normal;opacity:.5}
.side-f{margin-top:0}
.modo-pill{display:inline-flex;align-items:center;gap:8px;padding:5px 12px;border-radius:999px;font-size:12px;font-weight:700;border:1px solid var(--line);background:var(--card)}
.modo-pill i{width:8px;height:8px;border-radius:50%;background:var(--ok);box-shadow:0 0 10px var(--ok)}
.modo-pill.sombra i{background:var(--warn);box-shadow:0 0 10px var(--warn)}.modo-pill.off i{background:var(--bad);box-shadow:0 0 10px var(--bad)}
@media (max-width:1180px){.app{grid-template-columns:72px minmax(0,1fr)}.side .logo span,.nav-i .nav-r,.nav-cap,.side-m a span,.side-f{display:none}.nav-i{justify-content:center;padding:11px}.side-m a{justify-content:center}}
@media (max-width:760px){.app{grid-template-columns:1fr}.side{position:fixed;inset:auto 0 0 0;height:auto;z-index:40;flex-direction:row;padding:6px 8px;border-right:0;border-top:1px solid var(--line)}.side .logo,.side-m,.nav-cap{display:none}#nav{flex-direction:row;flex:1;justify-content:space-around}.nav-i{padding:8px;flex:1}.nav-i[aria-current="page"]::before{display:none}.corpo{padding-bottom:60px}.crumbs{display:none}.topo.dupla{justify-content:flex-end}}
`;

export const shellJs = String.raw`
/* ------------------------------------------------------------------ módulos, menu e tema */
ICO.sun = 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4';
ICO.refresh = 'M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5';
ICO.print = 'M7 8V3h10v5M7 17H4v-7h16v7h-3M7 14h10v7H7z';
ICO.chat = 'M4 5h16v11H9l-5 4zM8 9h8M8 12h5';
ICO.eye = 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z';
ICO.gear = 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 12l2-1-2-3-2 .5a7 7 0 0 0-1.5-1L15 5h-4l-.5 2.5a7 7 0 0 0-1.5 1L7 8l-2 3 2 1a7 7 0 0 0 0 2l-2 1 2 3 2-.5a7 7 0 0 0 1.5 1L11 21h4l.5-2.5a7 7 0 0 0 1.5-1l2 .5 2-3-2-1a7 7 0 0 0 0-2z';
ICO.fit = 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5';
ICO.zoomin = 'M12 5v14M5 12h14';
ICO.zoomout = 'M5 12h14';
ICO.robot = 'M5 8h14v10H5zM12 8V4M9 13h.01M15 13h.01M9 17h6';
ICO.server = 'M4 5h16v5H4zM4 14h16v5H4zM7 7.5h.01M7 16.5h.01';
ICO.pulse = 'M3 12h4l2-6 4 12 2-6h6';
ICO.globe = 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18';

var DS_MODULOS = {
  receptivo: {
    tag: 'AGENTE', nome: 'Agente receptivo', rota: '/painel/receptivo',
    itens: [['fluxo', 'Fluxo da Amanda', 'flow', '/painel/receptivo'], ['bi', 'Inteligência (BI)', 'chart', '/painel/receptivo/bi'], ['logs', 'Logs', 'list', '/painel/receptivo/logs']]
  }
};
var DS_ATALHOS = [['Início', 'home', '/painel'], ['CRM', 'funil', '/painel/crm'], ['Agente receptivo', 'bolt', '/painel/receptivo']];

function dsTemaAtual() { return document.documentElement.getAttribute('data-theme') || (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'); }
function dsTemaAplicar(t, gravar) {
  document.documentElement.setAttribute('data-theme', t);
  if (gravar) gravarLS('clinex-tema', t);
  var b = document.getElementById('btn-tema');
  if (b) { limpar(b); b.appendChild(ico(t === 'dark' ? 'sun' : 'moon', 18)); b.title = t === 'dark' ? 'Tema claro' : 'Tema escuro'; b.setAttribute('aria-label', b.title); }
  if (typeof dsAoMudarTema === 'function') dsAoMudarTema(t);
}
function dsTemaIniciar() {
  var t = lerLS('clinex-tema') || lerLS('crm-tema') || lerLS('painel-theme') || lerLS('bi-tema');
  if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
}

function dsMontarShell() {
  var corpo = document.body, mod = DS_MODULOS[corpo.getAttribute('data-modulo')], ativo = corpo.getAttribute('data-ativo');
  dsTemaIniciar();
  var nav = document.getElementById('nav');
  var item = null;
  if (mod && nav) {
    mod.itens.forEach(function (i) {
      if (i[0] === ativo) item = i;
      var a = h('a', { class: 'nav-i', href: i[3], 'data-aba': i[0], 'aria-current': i[0] === ativo ? 'page' : 'false', title: i[1] }, [ico(i[2], 20), h('span', { class: 'nav-r', text: i[1] })]);
      nav.appendChild(a);
    });
  }
  var lado = document.querySelector('.side');
  if (lado) {
    var atalhos = h('div', { class: 'side-m' }, [h('div', { class: 'nav-cap', text: 'Módulos' })].concat(DS_ATALHOS.filter(function (x) { return !(mod && x[2] === mod.rota); }).map(function (x) {
      return h('a', { href: x[2], title: x[0] }, [ico(x[1], 17), h('span', { text: x[0] })]);
    })));
    lado.insertBefore(atalhos, document.getElementById('side-f'));
  }
  var esq = document.getElementById('topo-esq');
  if (esq && mod) kids(esq, [h('a', { href: '/painel', text: 'Clinex' }), h('i', { text: '/' }), h('a', { href: mod.rota, text: mod.nome }), item ? [h('i', { text: '/' }), h('b', { text: item[1] })] : null]);
  var dir = document.getElementById('topo-dir');
  if (dir) dir.appendChild(h('button', { class: 'ic-btn', id: 'btn-tema', type: 'button', onclick: function () { dsTemaAplicar(dsTemaAtual() === 'dark' ? 'light' : 'dark', true); } }));
  dsTemaAplicar(dsTemaAtual(), false);
  window.addEventListener('error', function (e) {
    if (/ResizeObserver/.test(e.message || '')) return;
    var er = document.getElementById('erro-js');
    if (er) { er.textContent = 'Erro na tela: ' + (e.message || 'desconhecido') + (e.lineno ? ' (linha ' + e.lineno + ')' : ''); er.style.display = 'block'; }
  });
}
function abrirLead() { /* os gráficos do CRM podem chamar isto; fora do CRM não há lead para abrir */ }
dsMontarShell();
`;
