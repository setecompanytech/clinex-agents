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
.side nav{flex:1}
.modo-pill{display:inline-flex;align-items:center;gap:8px;padding:5px 12px;border-radius:999px;font-size:12px;font-weight:700;border:1px solid var(--line);background:var(--card)}
.modo-pill i{width:8px;height:8px;border-radius:50%;background:var(--ok);box-shadow:0 0 10px var(--ok)}
.modo-pill.sombra i{background:var(--warn);box-shadow:0 0 10px var(--warn)}.modo-pill.off i{background:var(--bad);box-shadow:0 0 10px var(--bad)}
#topo-dir{display:flex;align-items:center;gap:10px}
.u-chip{display:inline-flex;align-items:center;gap:9px;height:36px;padding:0 12px 0 4px;border:1px solid var(--line);background:var(--card);border-radius:12px;color:var(--ink);font-weight:650;font-size:13px;max-width:200px}
.u-chip:hover{border-color:var(--line2)}.u-chip .avatar{width:28px;height:28px;border-radius:9px;font-size:11px}
.u-chip .u-nome{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.u-menu{position:absolute;right:0;top:44px;z-index:60;min-width:250px;padding:8px;border-radius:16px;border:1px solid var(--line2);background:var(--solid2);box-shadow:var(--shadow);animation:entra .18s both}
.u-menu .u-id{padding:10px 12px 12px;border-bottom:1px solid var(--line);margin-bottom:6px}.u-menu .u-id b{display:block;font-size:14px}.u-menu .u-id span{display:block;color:var(--mut);font-size:12px;margin-top:2px;overflow-wrap:anywhere}
.u-menu .u-id .pill{margin-top:8px}
.u-menu button{display:flex;align-items:center;gap:10px;width:100%;padding:9px 12px;border:0;background:transparent;border-radius:10px;color:var(--ink2);font-weight:600;font-size:13.5px;text-align:left}
.u-menu button:hover{background:var(--card2);color:var(--ink)}
.u-wrap{position:relative}
@media (max-width:760px){.u-chip .u-nome{display:none}.u-chip{padding:0 4px}}
@media (max-width:1180px){.app{grid-template-columns:72px minmax(0,1fr)}.side .logo span,.nav-i .nav-r,.nav-cap,.side-m a span,.side-f{display:none}.nav-i{justify-content:center;padding:11px}.side-m a{justify-content:center}}
@media (max-width:760px){.app{grid-template-columns:1fr}.side{position:fixed;inset:auto 0 0 0;height:auto;z-index:40;flex-direction:row;padding:6px 8px;border-right:0;border-top:1px solid var(--line)}.side .logo,.side-m,.nav-cap{display:none}#nav{flex-direction:row;flex:1;justify-content:space-around}.nav-i{padding:8px;flex:1}.nav-i[aria-current="page"]::before{display:none}.corpo{padding-bottom:60px}.crumbs{display:none}.topo.dupla{justify-content:flex-end}}
`;

export const shellJs = String.raw`
/* ------------------------------------------------------------------ módulos, menu e tema */
ICO.sun = 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4';
ICO.refresh = 'M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5';
ICO.print = 'M7 8V3h10v5M7 17H4v-7h16v7h-3M7 14h10v7H7z';
ICO.chat = 'M4 5h16v11H9l-5 4zM8 9h8M8 12h5';
ICO.spark = 'M12 3l1.9 5.4L19 10.3l-5.1 1.9L12 17.6l-1.9-5.4L5 10.3l5.1-1.9zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z';
ICO.eye ='M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z';
ICO.gear = 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 12l2-1-2-3-2 .5a7 7 0 0 0-1.5-1L15 5h-4l-.5 2.5a7 7 0 0 0-1.5 1L7 8l-2 3 2 1a7 7 0 0 0 0 2l-2 1 2 3 2-.5a7 7 0 0 0 1.5 1L11 21h4l.5-2.5a7 7 0 0 0 1.5-1l2 .5 2-3-2-1a7 7 0 0 0 0-2z';
ICO.fit = 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5';
ICO.zoomin = 'M12 5v14M5 12h14';
ICO.zoomout = 'M5 12h14';
ICO.robot = 'M5 8h14v10H5zM12 8V4M9 13h.01M15 13h.01M9 17h6';
ICO.server = 'M4 5h16v5H4zM4 14h16v5H4zM7 7.5h.01M7 16.5h.01';
ICO.pulse = 'M3 12h4l2-6 4 12 2-6h6';
ICO.globe = 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18';

var DS_MODULOS = {
  geral: {
    tag: 'PAINEL', nome: 'Painel geral', rota: '/painel', semModulo: true,
    itens: [['geral', 'Visão geral', 'home', '/painel'], ['crm', 'CRM', 'funil', '/painel/crm', 'crm'], ['agente', 'Agente receptivo', 'robot', '/painel/receptivo', 'agente'], ['usuarios', 'Usuários', 'users', '/painel/usuarios', 'admin'], ['assistente', 'Agente Clinex', 'spark', '/painel/assistente', 'crm']]
  },
  receptivo: {
    tag: 'AGENTE', nome: 'Agente receptivo', rota: '/painel/receptivo',
    itens: [['fluxo', 'Fluxo da Amanda', 'flow', '/painel/receptivo'], ['bi', 'Inteligência (BI)', 'chart', '/painel/receptivo/bi'], ['logs', 'Logs', 'list', '/painel/receptivo/logs']]
  }
};
var DS_ATALHOS = [['Início', 'home', '/painel'], ['CRM', 'funil', '/painel/crm', 'crm'], ['Agente receptivo', 'bolt', '/painel/receptivo', 'agente'], ['Usuários', 'users', '/painel/usuarios', 'admin'], ['Agente Clinex', 'spark', '/painel/assistente', 'crm']];
var DS_PERFIS = { admin: 'Administrador', gestor: 'Gestor', atendente: 'Atendente', leitura: 'Somente leitura' };

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
      var a = h('a', { class: 'nav-i' + (i[0] === 'assistente' ? ' nav-ia' : ''), href: i[3], 'data-aba': i[0], 'data-req': i[4] || null, 'aria-current': i[0] === ativo ? 'page' : 'false', title: i[1] }, [ico(i[2], 20), h('span', { class: 'nav-r', text: i[1] })]);
      nav.appendChild(a);
    });
  }
  var lado = document.querySelector('.side');
  if (lado && !(mod && mod.semModulo)) {
    var atalhos = h('div', { class: 'side-m' }, [h('div', { class: 'nav-cap', text: 'Módulos' })].concat(DS_ATALHOS.filter(function (x) { return !(mod && x[2] === mod.rota); }).map(function (x) {
      return h('a', { href: x[2], class: x[2] === '/painel/assistente' ? 'ia-link' : null, title: x[0], 'data-req': x[3] || null }, [ico(x[1], 17), h('span', { text: x[0] })]);
    })));
    lado.insertBefore(atalhos, document.getElementById('side-f'));
  }
  if (lado) lado.appendChild(h('button', { class: 'side-sair', type: 'button', title: 'Sair do painel', 'aria-label': 'Sair do painel', onclick: dsSair }, [ico('back', 17), h('span', { text: 'Sair' })]));
  var esq = document.getElementById('topo-esq');
  if (esq && mod) kids(esq, [h('a', { href: '/painel', text: 'Clinex' }), h('i', { text: '/' }), mod.semModulo ? null : [h('a', { href: mod.rota, text: mod.nome }), h('i', { text: '/' })], item ? h('b', { text: item[1] }) : null]);
  var dir = document.getElementById('topo-dir');
  if (dir) dir.appendChild(h('button', { class: 'ic-btn', id: 'btn-tema', type: 'button', onclick: function () { dsTemaAplicar(dsTemaAtual() === 'dark' ? 'light' : 'dark', true); } }));
  dsTemaAplicar(dsTemaAtual(), false);
  if (mod) dsCarregarEu();
  window.addEventListener('error', function (e) {
    if (/ResizeObserver/.test(e.message || '')) return;
    var er = document.getElementById('erro-js');
    if (er) { er.textContent = 'Erro na tela: ' + (e.message || 'desconhecido') + (e.lineno ? ' (linha ' + e.lineno + ')' : ''); er.style.display = 'block'; }
  });
}
/* ------------------------------------------------------------------ quem está logado: menu do usuário, módulos liberados, sessão que expira */
(function () {
  var f0 = window.fetch;
  if (!f0) return;
  window.fetch = function () {
    return f0.apply(this, arguments).then(function (r) {
      if (r.status === 401 && location.pathname.indexOf('/painel/login') !== 0) location.href = '/painel/login?next=' + encodeURIComponent(location.pathname + location.search);
      return r;
    });
  };
})();
function dsPodeVer(eu, req) {
  if (!req) return true;
  if (eu.master || eu.perfil === 'admin') return true;
  return req !== 'admin' && eu.modulos.indexOf(req) >= 0;
}
function dsCarregarEu() {
  fetch('/painel/eu', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (eu) {
    if (!eu) return;
    window.EU = eu;
    Array.prototype.forEach.call(document.querySelectorAll('[data-req]'), function (a) { if (!dsPodeVer(eu, a.getAttribute('data-req'))) a.style.display = 'none'; });
    dsChipUsuario(eu);
    document.dispatchEvent(new CustomEvent('clinex-eu', { detail: eu }));
  }).catch(function () { /* sem a identificação o menu fica completo, mas o servidor continua barrando */ });
}
function dsSair() {
  fetch('/painel/sair', { method: 'POST', credentials: 'same-origin' }).then(function () { location.href = '/painel/login'; }).catch(function () { location.href = '/painel/login'; });
}
function dsAlterarSenha() {
  var atual = h('input', { class: 'in', type: 'password', autocomplete: 'current-password', autofocus: 'autofocus' });
  var nova = h('input', { class: 'in', type: 'password', autocomplete: 'new-password' });
  var conf = h('input', { class: 'in', type: 'password', autocomplete: 'new-password' });
  var erro = h('p', { role: 'alert', style: 'color:var(--bad);font-size:13px;min-height:18px' });
  var m;
  function salvar() {
    erro.textContent = '';
    if (nova.value.length < 8) { erro.textContent = 'A nova senha precisa ter pelo menos 8 caracteres.'; return; }
    if (nova.value !== conf.value) { erro.textContent = 'A confirmação não confere com a nova senha.'; return; }
    fetch('/painel/api/eu/senha', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ atual: atual.value, nova: nova.value }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) { if (!x.ok) { erro.textContent = x.j.mensagem || 'Não consegui trocar a senha.'; return; } m.fechar(); aviso('Senha alterada. As outras sessões foram encerradas.', 'ok'); })
      .catch(function () { erro.textContent = 'Sem conexão com o servidor.'; });
  }
  m = modal({
    titulo: 'Alterar minha senha', sub: 'Depois da troca, os outros aparelhos precisam entrar de novo.', largura: 440, classe: 'peq',
    corpo: h('div', { style: 'display:flex;flex-direction:column;gap:12px' }, [campo('Senha atual', atual), campo('Nova senha', nova, 'Pelo menos 8 caracteres.'), campo('Repita a nova senha', conf), erro]),
    rodape: [botao('Cancelar', '', function () { m.fechar(); }), botao('Salvar senha', 'pri', salvar)]
  });
  [atual, nova, conf].forEach(function (i) { i.addEventListener('keydown', function (e) { if (e.key === 'Enter') salvar(); }); });
}
function dsChipUsuario(eu) {
  var dir = document.getElementById('topo-dir'); if (!dir || document.getElementById('u-chip')) return;
  var menu = null;
  function fechar() { if (menu) { menu.remove(); menu = null; btn.setAttribute('aria-expanded', 'false'); } }
  var btn = h('button', { class: 'u-chip', id: 'u-chip', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', title: eu.nome }, [avatar(eu.nome), h('span', { class: 'u-nome', text: eu.nome })]);
  var wrap = h('div', { class: 'u-wrap' }, btn);
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (menu) { fechar(); return; }
    menu = h('div', { class: 'u-menu', role: 'menu' }, [
      h('div', { class: 'u-id' }, [h('b', { text: eu.nome }), h('span', { text: eu.master ? 'Acesso mestre (senha do servidor)' : eu.email }), pill(DS_PERFIS[eu.perfil] || eu.perfil)]),
      eu.master ? null : h('button', { type: 'button', role: 'menuitem', onclick: function () { fechar(); dsAlterarSenha(); } }, [ico('lock', 16), 'Alterar minha senha']),
      h('button', { type: 'button', role: 'menuitem', onclick: dsSair }, [ico('back', 16), 'Sair'])
    ]);
    wrap.appendChild(menu); btn.setAttribute('aria-expanded', 'true');
  });
  document.addEventListener('click', function (e) { if (menu && !menu.contains(e.target)) fechar(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fechar(); });
  dir.insertBefore(wrap, dir.firstChild);
}

function abrirLead() { /* os gráficos do CRM podem chamar isto; fora do CRM não há lead para abrir */ }
dsMontarShell();
`;
