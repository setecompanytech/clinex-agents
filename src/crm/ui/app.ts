// JavaScript do CRM (navegador), parte 5: estrutura da página (menu, topo), navegação, busca (Ctrl+K) e inicialização.
// Dentro dele não usar crases nem "dollar-chave".
export const app = String.raw`
var ABAS = [
  { id: 'hoje', r: 'Hoje', i: 'home' }, { id: 'pipelines', r: 'Pipelines', i: 'kanban' }, { id: 'analises', r: 'Análises', i: 'chart' }, { id: 'funil', r: 'Funil', i: 'funil' }, { id: 'leads', r: 'Leads', i: 'users' },
  { id: 'fluxo', r: 'Fluxo', i: 'flow' }, { id: 'calendario', r: 'Calendário', i: 'calendar' }, { id: 'mensagens', r: 'Mensagens', i: 'message' }, { id: 'ia', r: 'IA de disparo', i: 'bolt' }, { id: 'regras', r: 'Regras', i: 'shield' }
];
var raiz = document.getElementById('main');
var navEl = document.getElementById('nav');
var topoDir = document.getElementById('topo-dir');
var janelaEl = null, euEl = null;

function telaAtual() {
  switch (S.aba) {
    case 'pipelines': return telaPipelines();
    case 'analises': return telaAnalises();
    case 'funil': return telaFunil();
    case 'leads': return telaLeads();
    case 'fluxo': return telaFluxo();
    case 'calendario': return telaCalendario();
    case 'mensagens': return telaMensagens();
    case 'ia': return telaIA();
    case 'regras': return telaRegras();
    default: return telaHoje();
  }
}
function avisoArmazenamento() {
  var a = S.D.armazenamento;
  if (a.erro) return h('div', { class: 'faixa f-erro' }, [ico('alert', 16), a.erro]);
  if (!a.persistente) return h('div', { class: 'faixa f-aviso' }, [ico('alert', 16), 'Este servidor não grava os dados em disco (por exemplo, a Vercel): o CRM só vale enquanto a instância estiver ligada. Rode o CRM no seu computador ou em um servidor com disco para guardar o histórico.']);
  return null;
}
function desenhar(manter) {
  if (!S.D) return;
  var y = window.scrollY;
  limpar(raiz);
  var tela = telaAtual(), barra = barraPeriodo(), cab = tela && tela.querySelector ? tela.querySelector(':scope > .tela-h') : null;
  if (cab) { /* a barra de período vai para o lado direito do cabeçalho da página, em vez de ocupar uma linha só para ela */
    var dir = h('div', { class: 'tela-dir' }), ac = cab.querySelector(':scope > .tela-ac');
    if (ac) { cab.insertBefore(dir, ac); dir.appendChild(barra); dir.appendChild(ac); } else { cab.appendChild(dir); dir.appendChild(barra); }
    kids(raiz, [avisoArmazenamento(), tela]);
  } else {
    var slot = tela && tela.querySelector ? tela.querySelector('.hh-topo') : null; /* Hoje: o filtro entra na linha da data, no topo do cartão de boas-vindas */
    if (slot) { slot.appendChild(barra); kids(raiz, [avisoArmazenamento(), tela]); } else kids(raiz, [avisoArmazenamento(), barra, tela]);
  }
  navEl.querySelectorAll('.nav-i').forEach(function (b) { b.setAttribute('aria-current', b.getAttribute('data-aba') === S.aba ? 'page' : 'false'); });
  var bd = navEl.querySelector('[data-aba="hoje"] .nav-b');
  if (bd) { var n = S.D.tarefas.length; bd.textContent = n ? String(n) : ''; bd.style.display = n ? '' : 'none'; }
  atualizarTopo();
  if (manter) window.scrollTo(0, y);
}
function ir(aba) {
  perFechar();
  S.aba = aba; history.replaceState(null, '', '#' + aba);
  S.q = ''; S.fStatus = ''; S.fAtend = '';
  desenhar(); window.scrollTo(0, 0);
}

function atualizarTopo() {
  if (janelaEl) {
    var ab = janelaAberta(), t = horaBelem();
    janelaEl.className = 'janela ' + (ab ? 'on' : 'off');
    janelaEl.title = 'Contatos só entre ' + M.LIMITES.janelaInicioH + 'h e ' + M.LIMITES.janelaFimH + 'h (horário de Belém)';
    limpar(janelaEl);
    kids(janelaEl, [h('i', { 'aria-hidden': 'true' }), (ab ? 'Contato liberado' : 'Fora do horário') + ' · ' + String(t.h).padStart(2, '0') + ':' + String(t.m).padStart(2, '0')]);
  }
  if (euEl && S.euInfo) {
    var pode = S.euInfo.master || S.euInfo.perfil === 'admin' || S.euInfo.perfil === 'gestor';
    limpar(euEl);
    kids(euEl, [avatar(S.euInfo.nome), h('span', { class: 'eu-n', text: S.euInfo.nome }),
      pode ? h('button', { class: 'eu-g', type: 'button', title: 'Gerenciar responsáveis', 'aria-label': 'Gerenciar responsáveis', onclick: function () { dialogoAtendentes(); } }, ico('users', 16)) : null]);
    euEl.title = S.euInfo.master ? 'Acesso mestre' : 'Você está usando o CRM como ' + S.euInfo.nome;
  }
}

function construirChrome() {
  ABAS.forEach(function (a) {
    var b = h('button', { class: 'nav-i', type: 'button', 'data-aba': a.id, 'aria-current': 'false', onclick: function () { ir(a.id); } }, [ico(a.i, 20), h('span', { class: 'nav-r', text: a.r }), a.id === 'hoje' ? h('span', { class: 'nav-b', style: 'display:none' }) : null]);
    navEl.appendChild(b);
  });
  var lado = document.querySelector('.side');
  if (lado) {
    ICO.spark = 'M12 3l1.9 5.4L19 10.3l-5.1 1.9L12 17.6l-1.9-5.4L5 10.3l5.1-1.9zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z';
    var atalho = function (rotulo, icone, href) { return h('a', { href: href, title: rotulo, class: href === '/painel/assistente' ? 'ia-link' : null }, [ico(icone, 17), h('span', { text: rotulo })]); };
    lado.insertBefore(h('div', { class: 'side-m' }, [h('div', { class: 'nav-cap', text: 'Módulos' }), atalho('Início', 'home', '/painel'), atalho('Agente receptivo', 'bolt', '/painel/receptivo'), atalho('Agente Clinex', 'spark', '/painel/assistente')]), lado.querySelector('.side-f'));
    lado.appendChild(h('button', { class: 'side-sair', type: 'button', title: 'Sair do painel', 'aria-label': 'Sair do painel', onclick: function () {
      var ir = function () { location.href = '/painel/login'; };
      fetch('/painel/sair', { method: 'POST', credentials: 'same-origin' }).then(ir, ir);
    } }, [ico('back', 17), h('span', { text: 'Sair' })]));
  }
  janelaEl = h('span', { class: 'janela' });
  euEl = h('div', { class: 'eu-chip', 'aria-label': 'Usuário logado' });
  kids(topoDir, [
    h('button', { class: 'busca-b', type: 'button', onclick: paleta, 'aria-label': 'Buscar (Ctrl+K)' }, [ico('search', 16), h('span', { text: 'Buscar…' }), h('kbd', { text: 'Ctrl K' })]),
    janelaEl, euEl,
    h('button', { class: 'btn pri', type: 'button', onclick: function () { dialogoNovoLead(); } }, [ico('plus', 16), 'Novo lead']),
    h('button', { class: 'ic-btn', type: 'button', 'aria-label': 'Alternar tema claro e escuro', onclick: function () {
      var atual = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
      var novo = atual === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', novo); gravarLS('crm-tema', novo);
    } }, ico('moon'))
  ]);
}

/* ------------------------------------------------------------------ busca global (Ctrl+K) */
function semAcento(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function paleta() {
  if (!S.D) return;
  var inp = h('input', { class: 'in grande', placeholder: 'Buscar lead, etapa, mensagem ou tela…', 'aria-label': 'Buscar', autofocus: 'true' });
  var lista = h('div', { class: 'pal-l', role: 'listbox' });
  var m = modal({ titulo: 'Buscar', largura: 640, classe: 'paleta', corpo: [inp, lista] });
  var itens = [], sel = 0;
  function montar() {
    var q = semAcento(inp.value.trim());
    itens = [];
    ABAS.forEach(function (a) { if (!q || semAcento(a.r).indexOf(q) >= 0) itens.push({ g: 'Telas', t: 'Ir para ' + a.r, i: a.i, f: function () { ir(a.id); } }); });
    if (q) {
      S.D.leads.forEach(function (l) { if (itens.length < 40 && semAcento(l.nome + ' ' + l.telefone + ' ' + l.exame).indexOf(q) >= 0) itens.push({ g: 'Leads', t: l.nome, s: ST[l.status] + ' · ' + (l.exame || '') + ' · ' + brl(l.valor), i: 'user', f: function () { abrirLead(l.id); } }); });
      M.ITENS.forEach(function (it) { if (semAcento(it.titulo + ' ' + it.sub + ' ' + it.resumo).indexOf(q) >= 0) itens.push({ g: 'Etapas do fluxo', t: it.titulo, s: it.sub, i: 'flow', f: function () { abrirItem(it.id); } }); });
      M.MENSAGENS.forEach(function (ms) { if (semAcento('mensagem ' + ms.n + ' ' + ms.titulo + ' ' + ms.corpo).indexOf(q) >= 0) itens.push({ g: 'Mensagens', t: 'Mensagem ' + ms.n + ' · ' + ms.titulo, s: ms.quando, i: 'message', f: function () { S.msgGrupo = 'todas'; ir('mensagens'); setTimeout(function () { var el = document.getElementById('msg-' + ms.n); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('pisca'); } }, 60); } }); });
    }
    itens = itens.slice(0, 14);
    if (sel >= itens.length) sel = 0;
    limpar(lista);
    var ult = '';
    itens.forEach(function (it, i) {
      if (it.g !== ult) { lista.appendChild(h('small', { class: 'pal-g', text: it.g })); ult = it.g; }
      lista.appendChild(h('button', { class: 'pal-i', type: 'button', role: 'option', 'aria-selected': String(i === sel), onclick: function () { m.fechar(); it.f(); } }, [ico(it.i, 16), h('span', null, [h('b', { text: it.t }), it.s ? h('small', { text: it.s }) : null])]));
    });
    if (!itens.length) lista.appendChild(h('p', { class: 'vazio-linha', text: 'Nada encontrado.' }));
  }
  inp.addEventListener('input', function () { sel = 0; montar(); });
  inp.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { sel = Math.min(itens.length - 1, sel + 1); montar(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); montar(); e.preventDefault(); }
    else if (e.key === 'Enter' && itens[sel]) { m.fechar(); itens[sel].f(); }
  });
  montar();
}
document.addEventListener('keydown', function (e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (!pilha.length) paleta(); }
});

/* ------------------------------------------------------------------ erros e início */
window.addEventListener('unhandledrejection', function (e) { e.preventDefault(); }); // as ações já mostram a mensagem da regra
window.addEventListener('error', function (e) {
  if (/ResizeObserver/.test(e.message || '')) return; // aviso inofensivo do navegador
  var el = document.getElementById('erro-js');
  if (el) { el.textContent = 'Erro na tela: ' + (e.message || 'desconhecido') + (e.lineno ? ' (linha ' + e.lineno + ')' : ''); el.style.display = 'block'; }
});

/* quem está usando o CRM é quem entrou no painel (o acesso mestre não é uma pessoa: sem filtro "meus") */
function identificar() {
  return fetch('/painel/eu', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (eu) {
    if (!eu) return;
    S.euInfo = eu; S.eu = eu.master ? '' : eu.nome;
  });
}

(function iniciar() {
  var tema = lerLS('crm-tema'); if (tema === 'dark' || tema === 'light') document.documentElement.setAttribute('data-theme', tema);
  construirChrome();
  var hs = location.hash.replace('#', '').split('/');
  if (ABAS.some(function (a) { return a.id === hs[0]; })) S.aba = hs[0];
  if (hs[0] === 'fluxo' && /^ns-/.test(hs[1] || '')) S.fluxoTab = 'noshow';
  identificar().then(function () { return carregar(); }).then(function () {
    agConstruir();
    if (hs[1]) { if (hs[1].indexOf('lead-') === 0) abrirLead(hs[1].slice(5)); else if (itemDef(hs[1])) abrirItem(hs[1]); }
  }).catch(function () { limpar(raiz); raiz.appendChild(h('div', { class: 'cartao boas' }, [h('h2', { text: 'Não consegui carregar o CRM' }), botao('Tentar de novo', 'pri', function () { location.reload(); })])); });
  setInterval(function () { if (document.visibilityState === 'visible' && !pilha.length && !digitando()) carregar().catch(function () {}); else atualizarTopo(); }, 45000);
  setInterval(atualizarTopo, 30000);
})();
`;
