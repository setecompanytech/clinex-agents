/**
 * Agente flutuante do design system (navegador): botão animado no canto, painel de conversa e aba de alertas.
 * Cada módulo só diz onde está o seu agente: <body data-agente="/painel/receptivo/agente">. O servidor devolve
 * {titulo, subtitulo, ia, sugestoes, alertas} em GET <base>/alertas e responde perguntas em POST <base>.
 * Itens e alertas apontam para telas por "href" (links normais). Dentro do texto não usar crases nem "dollar-chave".
 */
export const agenteFlutuante = String.raw`
/* ------------------------------------------------------------------ agente flutuante (design system) */
var DSA = { base: '', aberto: false, aba: 'conversa', alertas: [], ia: false, titulo: 'Agente', sub: '', sugestoes: [], msgs: [], enviando: false, vistos: {}, descartados: {}, botao: null, painel: null, lista: null, entrada: null, listaAl: null, selo: null, status: null, abaBtns: {}, tema: '' };

function dsaChave() { return 'ag-desc:' + DSA.base; }
function dsaJson(metodo, url, corpo) {
  return fetch(url, { method: metodo, credentials: 'same-origin', cache: 'no-store', headers: corpo !== undefined ? { 'Content-Type': 'application/json' } : undefined, body: corpo !== undefined ? JSON.stringify(corpo) : undefined })
    .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.mensagem || ('O servidor respondeu ' + r.status)); return j; }); });
}
function dsaNegrito(el, texto) {
  texto.split(/\*\*/).forEach(function (parte, i) { if (!parte) return; el.appendChild(i % 2 ? h('strong', { text: parte }) : document.createTextNode(parte)); });
}
function dsaTexto(texto) {
  var box = h('div', { class: 'ag-txt' });
  String(texto || '').split('\n').forEach(function (linha) {
    if (!linha.trim()) { box.appendChild(h('div', { class: 'ag-gap' })); return; }
    var p = h('div', { class: 'ag-p' }); dsaNegrito(p, linha); box.appendChild(p);
  });
  return box;
}
function dsaLink(i) {
  return h('a', { class: 'ag-lead', href: i.href || '#', onclick: function () { if (window.innerWidth < 760) dsaAlternar(false); } }, [
    h('span', { class: 'ag-lead-n' }, [h('b', { text: i.titulo }), i.sub ? h('small', { text: i.sub }) : null]),
    i.tag ? h('em', { class: 'ag-tag', text: i.tag }) : null, ico('arrow', 14)
  ]);
}
function dsaMsgEl(m) {
  var el = h('div', { class: 'ag-msg ' + (m.papel === 'user' ? 'eu' : 'ag') });
  if (m.papel === 'user') { el.appendChild(h('div', { class: 'ag-bolha', text: m.texto })); return el; }
  var b = h('div', { class: 'ag-bolha' }, [dsaTexto(m.texto)]);
  if (m.itens && m.itens.length) b.appendChild(h('div', { class: 'ag-itens' }, m.itens.map(dsaLink)));
  el.appendChild(b);
  if (m.sugestoes && m.sugestoes.length) el.appendChild(h('div', { class: 'ag-sug' }, m.sugestoes.map(function (s) { return h('button', { type: 'button', class: 'ag-chip', text: s, onclick: function () { dsaPerguntar(s); } }); })));
  return el;
}
function dsaRolar() { if (DSA.lista) DSA.lista.scrollTop = DSA.lista.scrollHeight; }
function dsaAdicionar(m) { DSA.msgs.push(m); DSA.lista.appendChild(dsaMsgEl(m)); dsaRolar(); }

function dsaPerguntar(texto) {
  texto = String(texto || '').trim();
  if (!texto || DSA.enviando) return;
  if (DSA.aba !== 'conversa') dsaAba('conversa');
  Array.prototype.forEach.call(DSA.lista.querySelectorAll('.ag-sug'), function (n) { n.remove(); });
  dsaAdicionar({ papel: 'user', texto: texto });
  DSA.entrada.value = ''; DSA.enviando = true;
  var pensando = h('div', { class: 'ag-msg ag' }, [h('div', { class: 'ag-bolha ag-pensa', 'aria-label': 'Digitando' }, [h('i'), h('i'), h('i')])]);
  DSA.lista.appendChild(pensando); dsaRolar();
  var historico = DSA.msgs.slice(0, -1).slice(-8).map(function (m) { return { papel: m.papel, texto: m.texto }; });
  dsaJson('POST', DSA.base, { pergunta: texto, historico: historico, pagina: location.pathname }).then(function (r) {
    pensando.remove(); DSA.enviando = false;
    dsaAdicionar({ papel: 'agent', texto: r.texto, itens: r.itens, sugestoes: r.sugestoes, fonte: r.fonte });
  }).catch(function (e) {
    pensando.remove(); DSA.enviando = false;
    dsaAdicionar({ papel: 'agent', texto: 'Não consegui responder agora: ' + e.message, sugestoes: ['Tentar de novo'] });
  });
}

/* ---- alertas */
function dsaVisiveis() { return DSA.alertas.filter(function (a) { return !DSA.descartados[a.id]; }); }
function dsaSelo() {
  var v = dsaVisiveis(), novos = v.filter(function (a) { return !DSA.vistos[a.id]; }), risco = v.some(function (a) { return a.nivel === 'risco'; });
  if (DSA.selo) { DSA.selo.textContent = novos.length ? String(novos.length) : ''; DSA.selo.style.display = novos.length ? 'flex' : 'none'; }
  if (DSA.botao) { DSA.botao.classList.toggle('risco', risco && novos.length > 0); DSA.botao.classList.toggle('alerta', novos.length > 0); }
  if (DSA.abaBtns.alertas) { limpar(DSA.abaBtns.alertas); DSA.abaBtns.alertas.appendChild(document.createTextNode('Alertas')); if (v.length) DSA.abaBtns.alertas.appendChild(h('span', { class: 'ag-n' + (risco ? ' r' : ''), text: String(v.length) })); }
}
function dsaDesenharAlertas() {
  if (!DSA.listaAl) return;
  limpar(DSA.listaAl);
  var v = dsaVisiveis();
  if (!v.length) { DSA.listaAl.appendChild(h('div', { class: 'ag-vazio' }, [ico('shield', 30), h('b', { text: 'Tudo em ordem' }), h('span', { text: 'Nenhum alerta agora. Eu aviso aqui assim que algo precisar de atenção.' })])); return; }
  v.forEach(function (a) {
    var itens = h('div', { class: 'ag-al-leads' });
    (a.itens || []).slice(0, 4).forEach(function (i) { itens.appendChild(dsaLink(i)); });
    var acoes = h('div', { class: 'ag-al-ac' }, (a.acoes || []).map(function (x) { return h('a', { class: 'ag-mini', href: x.href, text: x.texto }); }).concat([
      h('button', { type: 'button', class: 'ag-mini', text: 'Perguntar ao agente', onclick: function () { dsaPerguntar('Me explique: ' + a.titulo); } }),
      h('button', { type: 'button', class: 'ag-mini mudo', text: 'Dispensar', onclick: function () { DSA.descartados[a.id] = 1; gravarLS(dsaChave(), JSON.stringify(DSA.descartados)); dsaSelo(); dsaDesenharAlertas(); } })
    ]));
    DSA.listaAl.appendChild(h('div', { class: 'ag-al n-' + a.nivel }, [h('span', { class: 'ag-al-ic' }, [ico(a.nivel === 'info' ? 'clock' : 'alert', 18)]), h('div', { class: 'ag-al-corpo' }, [h('b', { text: a.titulo }), h('p', { text: a.texto })]), itens, acoes]));
  });
}
function dsaMarcarVistos() { dsaVisiveis().forEach(function (a) { DSA.vistos[a.id] = 1; }); dsaSelo(); }

function dsaBuscar() {
  return dsaJson('GET', DSA.base + '/alertas').then(function (r) {
    var antes = DSA.vistos;
    DSA.ia = !!r.ia; DSA.alertas = r.alertas || []; DSA.sugestoes = r.sugestoes || DSA.sugestoes;
    if (r.titulo) { DSA.titulo = r.titulo; DSA.sub = r.subtitulo || ''; var t = document.getElementById('ag-titulo'); if (t) t.textContent = DSA.titulo; }
    var ids = {}; DSA.alertas.forEach(function (a) { ids[a.id] = 1; });
    Object.keys(DSA.descartados).forEach(function (k) { if (!ids[k]) delete DSA.descartados[k]; });
    gravarLS(dsaChave(), JSON.stringify(DSA.descartados));
    var novos = dsaVisiveis().filter(function (a) { return !antes[a.id] && a.nivel !== 'info'; });
    if (DSA.aberto && DSA.aba === 'alertas') dsaMarcarVistos();
    if (novos.length && !DSA.aberto) aviso('Agente: ' + novos[0].titulo, novos[0].nivel === 'risco' ? 'erro' : 'info');
    if (DSA.status) DSA.status.textContent = DSA.ia ? 'Online · IA Claude' : 'Online · modo regras';
    dsaSelo(); dsaDesenharAlertas();
  }).catch(function () { if (DSA.status) DSA.status.textContent = 'Sem conexão'; });
}

/* ---- painel */
function dsaAba(qual) {
  DSA.aba = qual;
  ['conversa', 'alertas'].forEach(function (k) { DSA.abaBtns[k].setAttribute('aria-selected', k === qual ? 'true' : 'false'); DSA.abaBtns[k].classList.toggle('on', k === qual); });
  DSA.painel.querySelector('.ag-conversa').style.display = qual === 'conversa' ? 'flex' : 'none';
  DSA.listaAl.style.display = qual === 'alertas' ? 'flex' : 'none';
  if (qual === 'alertas') { dsaDesenharAlertas(); dsaMarcarVistos(); } else if (DSA.aberto) setTimeout(function () { DSA.entrada.focus(); }, 30);
}
function dsaBoasVindas() {
  dsaJson('POST', DSA.base, { pergunta: '', pagina: location.pathname }).then(function (r) {
    if (DSA.msgs.length) return;
    dsaAdicionar({ papel: 'agent', texto: r.texto, itens: r.itens, sugestoes: r.sugestoes && r.sugestoes.length ? r.sugestoes : DSA.sugestoes });
  }).catch(function () { if (!DSA.msgs.length) dsaAdicionar({ papel: 'agent', texto: 'Oi! Pergunte sobre o fluxo, os números ou os logs da Amanda.', sugestoes: DSA.sugestoes }); });
}
function dsaAlternar(abrir) {
  DSA.aberto = abrir === undefined ? !DSA.aberto : abrir;
  DSA.painel.classList.toggle('on', DSA.aberto);
  DSA.botao.setAttribute('aria-expanded', DSA.aberto ? 'true' : 'false');
  DSA.botao.classList.toggle('aberto', DSA.aberto);
  if (DSA.aberto) {
    if (!DSA.msgs.length) dsaBoasVindas();
    if (DSA.aba === 'alertas') dsaMarcarVistos(); else setTimeout(function () { DSA.entrada.focus(); }, 60);
  } else DSA.botao.focus();
}
function dsaIniciar() {
  DSA.base = document.body.getAttribute('data-agente');
  if (!DSA.base) return;
  try { DSA.descartados = JSON.parse(lerLS(dsaChave()) || '{}') || {}; } catch (e) { DSA.descartados = {}; }
  DSA.selo = h('span', { class: 'ag-selo', style: 'display:none' });
  DSA.botao = h('button', { class: 'ag-fab', type: 'button', 'aria-label': 'Abrir o agente', 'aria-expanded': 'false', 'aria-controls': 'ag-painel', onclick: function () { dsaAlternar(); } }, [
    h('span', { class: 'ag-fab-ic' }, [ico('robot', 24)]), h('span', { class: 'ag-fab-x' }, [ico('x', 22)]), DSA.selo
  ]);
  DSA.status = h('small', { text: 'Conectando…' });
  var cab = h('div', { class: 'ag-cab' }, [
    h('span', { class: 'ag-av' }, [ico('robot', 20)]),
    h('div', { class: 'ag-cab-t' }, [h('b', { id: 'ag-titulo', text: DSA.titulo }), DSA.status]),
    h('button', { type: 'button', class: 'ag-ic', 'aria-label': 'Limpar a conversa', title: 'Limpar a conversa', onclick: function () { DSA.msgs = []; limpar(DSA.lista); dsaBoasVindas(); } }, [ico('edit', 16)]),
    h('button', { type: 'button', class: 'ag-ic', 'aria-label': 'Fechar o agente', onclick: function () { dsaAlternar(false); } }, [ico('x', 18)])
  ]);
  DSA.abaBtns.conversa = h('button', { type: 'button', role: 'tab', class: 'ag-aba on', 'aria-selected': 'true', text: 'Conversa', onclick: function () { dsaAba('conversa'); } });
  DSA.abaBtns.alertas = h('button', { type: 'button', role: 'tab', class: 'ag-aba', 'aria-selected': 'false', text: 'Alertas', onclick: function () { dsaAba('alertas'); } });
  DSA.lista = h('div', { class: 'ag-lista', role: 'log', 'aria-live': 'polite' });
  DSA.entrada = h('input', { class: 'in ag-in', type: 'text', maxlength: '500', placeholder: 'Pergunte qualquer coisa…', 'aria-label': 'Pergunta ao agente', autocomplete: 'off', onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); dsaPerguntar(DSA.entrada.value); } } });
  var enviar = h('button', { type: 'button', class: 'ag-env', 'aria-label': 'Enviar', onclick: function () { dsaPerguntar(DSA.entrada.value); } }, [ico('arrow', 18)]);
  DSA.listaAl = h('div', { class: 'ag-alertas', style: 'display:none' });
  DSA.painel = h('section', { class: 'ag-painel', id: 'ag-painel', role: 'dialog', 'aria-label': 'Agente' }, [cab, h('div', { class: 'ag-abas', role: 'tablist' }, [DSA.abaBtns.conversa, DSA.abaBtns.alertas]), h('div', { class: 'ag-conversa' }, [DSA.lista, h('div', { class: 'ag-rod' }, [DSA.entrada, enviar])]), DSA.listaAl]);
  document.body.appendChild(DSA.painel); document.body.appendChild(DSA.botao);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && DSA.aberto && !(typeof pilha !== 'undefined' && pilha.length)) dsaAlternar(false); }, true);
  dsaBuscar();
  setInterval(function () { if (document.visibilityState === 'visible') dsaBuscar(); }, 60000);
}
if (document.body.getAttribute('data-agente')) dsaIniciar();
`;
