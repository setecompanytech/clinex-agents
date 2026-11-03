/** Agente flutuante do CRM (cliente): botão no canto, painel de conversa, alertas proativos. Sem backticks nem dólar-chave aqui dentro. */
export const agente = String.raw`
/* ------------------------------------------------------------------ agente flutuante */
var AG = { aberto: false, aba: 'conversa', alertas: [], ia: false, msgs: [], enviando: false, vistos: {}, descartados: {}, iniciou: false, botao: null, painel: null, lista: null, entrada: null, listaAl: null, selo: null, chips: null, abaBtns: {}, primeiraCarga: true };
try { AG.descartados = JSON.parse(lerLS('crm-ag-desc') || '{}') || {}; } catch (e) { AG.descartados = {}; }

function agNegrito(el, texto) {
  texto.split(/\*\*/).forEach(function (parte, i) {
    if (!parte) return;
    el.appendChild(i % 2 ? h('strong', { text: parte }) : document.createTextNode(parte));
  });
}
function agTexto(texto) {
  var box = h('div', { class: 'ag-txt' });
  String(texto || '').split('\n').forEach(function (linha) {
    if (!linha.trim()) { box.appendChild(h('div', { class: 'ag-gap' })); return; }
    var p = h('div', { class: 'ag-p' }); agNegrito(p, linha); box.appendChild(p);
  });
  return box;
}
function agLeadLinha(id, sub, tag) {
  var l = S.D && S.D.leads.filter(function (x) { return x.id === id; })[0];
  return h('button', { class: 'ag-lead', type: 'button', onclick: function () { agFecharEmTela(); abrirLead(id); } }, [
    h('span', { class: 'ag-lead-n' }, [h('b', { text: l ? l.nome : 'Lead' }), h('small', { text: sub || (l ? (l.exame || 'sem exame') + ' · ' + brl(l.valor) : '') })]),
    tag ? h('em', { class: 'ag-tag', text: tag }) : null, ico('arrow', 14)
  ]);
}
function agFecharEmTela() { AG.aberto = false; AG.painel.classList.remove('on'); AG.botao.setAttribute('aria-expanded', 'false'); AG.botao.classList.remove('aberto'); }

function agMsgEl(m) {
  var el = h('div', { class: 'ag-msg ' + (m.papel === 'user' ? 'eu' : 'ag') });
  if (m.papel === 'user') { el.appendChild(h('div', { class: 'ag-bolha', text: m.texto })); return el; }
  var b = h('div', { class: 'ag-bolha' }, [agTexto(m.texto)]);
  if (m.itens && m.itens.length) b.appendChild(h('div', { class: 'ag-itens' }, m.itens.map(function (i) { return agLeadLinha(i.leadId, i.sub, i.tag); })));
  el.appendChild(b);
  if (m.sugestoes && m.sugestoes.length) el.appendChild(h('div', { class: 'ag-sug' }, m.sugestoes.map(function (s) { return h('button', { type: 'button', class: 'ag-chip', text: s, onclick: function () { agPerguntar(s); } }); })));
  return el;
}
function agRolar() { if (AG.lista) AG.lista.scrollTop = AG.lista.scrollHeight; }
function agAdicionar(m) { AG.msgs.push(m); AG.lista.appendChild(agMsgEl(m)); agRolar(); }

function agPerguntar(texto) {
  texto = String(texto || '').trim();
  if (!texto || AG.enviando) return;
  if (AG.aba !== 'conversa') agAba('conversa');
  // as sugestões da resposta anterior já cumpriram o papel
  Array.prototype.forEach.call(AG.lista.querySelectorAll('.ag-sug'), function (n) { n.remove(); });
  agAdicionar({ papel: 'user', texto: texto });
  AG.entrada.value = ''; AG.enviando = true;
  var pensando = h('div', { class: 'ag-msg ag' }, [h('div', { class: 'ag-bolha ag-pensa', 'aria-label': 'Digitando' }, [h('i'), h('i'), h('i')])]);
  AG.lista.appendChild(pensando); agRolar();
  var historico = AG.msgs.slice(0, -1).slice(-8).map(function (m) { return { papel: m.papel, texto: m.texto }; });
  api('POST', '/agente', { pergunta: texto, eu: S.eu || '', historico: historico }).then(function (r) {
    pensando.remove(); AG.enviando = false;
    agAdicionar({ papel: 'agent', texto: r.texto, itens: r.itens, sugestoes: r.sugestoes, fonte: r.fonte });
  }).catch(function (e) {
    pensando.remove(); AG.enviando = false;
    agAdicionar({ papel: 'agent', texto: 'Não consegui responder agora: ' + e.message, sugestoes: ['Tentar de novo'] });
  });
}

/* ---- alertas */
function agVisiveis() { return AG.alertas.filter(function (a) { return !AG.descartados[a.id]; }); }
function agAtualizarSelo() {
  var v = agVisiveis(); var novos = v.filter(function (a) { return !AG.vistos[a.id]; });
  var risco = v.some(function (a) { return a.nivel === 'risco'; });
  if (AG.selo) { AG.selo.textContent = novos.length ? String(novos.length) : ''; AG.selo.style.display = novos.length ? 'flex' : 'none'; }
  if (AG.botao) { AG.botao.classList.toggle('risco', risco && novos.length > 0); AG.botao.classList.toggle('alerta', novos.length > 0); }
  if (AG.abaBtns.alertas) { limpar(AG.abaBtns.alertas); AG.abaBtns.alertas.appendChild(document.createTextNode('Alertas')); if (v.length) AG.abaBtns.alertas.appendChild(h('span', { class: 'ag-n' + (risco ? ' r' : ''), text: String(v.length) })); }
}
function agDesenharAlertas() {
  if (!AG.listaAl) return;
  limpar(AG.listaAl);
  var v = agVisiveis();
  if (!v.length) {
    AG.listaAl.appendChild(h('div', { class: 'ag-vazio' }, [ico('shield', 30), h('b', { text: 'Tudo em ordem' }), h('span', { text: 'Nenhum alerta agora. Eu aviso aqui assim que algo precisar de atenção.' })]));
    return;
  }
  v.forEach(function (a) {
    var corpo = h('div', { class: 'ag-al-corpo' }, [h('b', { text: a.titulo }), h('p', { text: a.texto })]);
    var leads = h('div', { class: 'ag-al-leads' });
    (a.leadIds || []).slice(0, 5).forEach(function (id) { leads.appendChild(agLeadLinha(id)); });
    if ((a.leadIds || []).length > 5) leads.appendChild(h('div', { class: 'ag-mais', text: '+ ' + (a.leadIds.length - 5) + ' outros' }));
    var acoes = h('div', { class: 'ag-al-ac' }, [
      a.aba ? h('button', { type: 'button', class: 'ag-mini', text: 'Abrir a tela', onclick: function () { agFecharEmTela(); ir(a.aba); } }) : null,
      h('button', { type: 'button', class: 'ag-mini', text: 'Perguntar ao agente', onclick: function () { agPerguntar('Me explique: ' + a.titulo); } }),
      h('button', { type: 'button', class: 'ag-mini mudo', text: 'Dispensar', onclick: function () { AG.descartados[a.id] = 1; gravarLS('crm-ag-desc', JSON.stringify(AG.descartados)); agAtualizarSelo(); agDesenharAlertas(); } })
    ]);
    AG.listaAl.appendChild(h('div', { class: 'ag-al n-' + a.nivel }, [h('span', { class: 'ag-al-ic' }, [ico(a.nivel === 'info' ? 'clock' : 'alert', 18)]), corpo, leads, acoes]));
  });
}
function agMarcarVistos() { agVisiveis().forEach(function (a) { AG.vistos[a.id] = 1; }); agAtualizarSelo(); }

function agBuscarAlertas() {
  return api('GET', '/agente/alertas?eu=' + encodeURIComponent(S.eu || '')).then(function (r) {
    var antes = AG.vistos; AG.ia = !!r.ia; AG.alertas = r.alertas || [];
    // limpa dispensas de alertas que já não existem (o contador do id muda quando a situação muda)
    var ids = {}; AG.alertas.forEach(function (a) { ids[a.id] = 1; });
    Object.keys(AG.descartados).forEach(function (k) { if (!ids[k]) delete AG.descartados[k]; });
    gravarLS('crm-ag-desc', JSON.stringify(AG.descartados));
    var novos = agVisiveis().filter(function (a) { return !antes[a.id] && a.nivel !== 'info'; });
    if (AG.aberto && AG.aba === 'alertas') agMarcarVistos();
    if (novos.length && !AG.aberto) {
      var m = novos[0];
      aviso('Agente: ' + m.titulo, m.nivel === 'risco' ? 'erro' : 'info');
    }
    if (AG.status) AG.status.textContent = AG.ia ? 'Online · IA Claude' : 'Online · modo regras';
    agAtualizarSelo(); agDesenharAlertas();
  }).catch(function () {});
}

/* ---- painel */
function agAba(qual) {
  AG.aba = qual;
  ['conversa', 'alertas'].forEach(function (k) {
    AG.abaBtns[k].setAttribute('aria-selected', k === qual ? 'true' : 'false'); AG.abaBtns[k].classList.toggle('on', k === qual);
  });
  AG.painel.querySelector('.ag-conversa').style.display = qual === 'conversa' ? 'flex' : 'none';
  AG.listaAl.style.display = qual === 'alertas' ? 'flex' : 'none';
  if (qual === 'alertas') { agDesenharAlertas(); agMarcarVistos(); } else if (AG.aberto) setTimeout(function () { AG.entrada.focus(); }, 30);
}
function agAlternar(abrir) {
  AG.aberto = abrir === undefined ? !AG.aberto : abrir;
  AG.painel.classList.toggle('on', AG.aberto);
  AG.botao.setAttribute('aria-expanded', AG.aberto ? 'true' : 'false');
  AG.botao.classList.toggle('aberto', AG.aberto);
  if (AG.aberto) {
    if (!AG.msgs.length) agBoasVindas();
    if (AG.aba === 'alertas') agMarcarVistos();
    else setTimeout(function () { AG.entrada.focus(); }, 60);
  } else AG.botao.focus();
}
function agBoasVindas() {
  var v = agVisiveis().filter(function (a) { return a.nivel !== 'info'; });
  var nome = S.eu ? ', ' + S.eu : '';
  var txt = 'Oi' + nome + '! Sou o agente do CRM. Respondo sobre leads, fila do dia, números e regras do guia, e aviso quando algo precisa de atenção.';
  if (v.length) txt += '\n\nAgora: **' + v[0].titulo + '**' + (v.length > 1 ? ' (e mais ' + (v.length - 1) + ' ' + (v.length - 1 === 1 ? 'alerta' : 'alertas') + ')' : '') + '.';
  agAdicionar({ papel: 'agent', texto: txt, sugestoes: ['O que eu faço agora?', 'Quais tarefas estão atrasadas?', 'Como está a conversão?', 'Quais as regras de ouro?'] });
}
function agConstruir() {
  if (AG.iniciou) return; AG.iniciou = true;
  AG.selo = h('span', { class: 'ag-selo', style: 'display:none' });
  AG.botao = h('button', { class: 'ag-fab', type: 'button', 'aria-label': 'Abrir o agente do CRM', 'aria-expanded': 'false', 'aria-controls': 'ag-painel', onclick: function () { agAlternar(); } }, [
    h('span', { class: 'ag-fab-ic' }, [ico('bolt', 24)]), h('span', { class: 'ag-fab-x' }, [ico('x', 22)]), AG.selo
  ]);
  AG.status = h('small', { text: 'Conectando…' });
  var cab = h('div', { class: 'ag-cab' }, [
    h('span', { class: 'ag-av' }, [ico('bolt', 20)]),
    h('div', { class: 'ag-cab-t' }, [h('b', { text: 'Agente Clinex' }), AG.status]),
    h('button', { type: 'button', class: 'ag-ic', 'aria-label': 'Limpar a conversa', title: 'Limpar a conversa', onclick: function () { AG.msgs = []; limpar(AG.lista); agBoasVindas(); } }, [ico('edit', 16)]),
    h('button', { type: 'button', class: 'ag-ic', 'aria-label': 'Fechar o agente', onclick: function () { agAlternar(false); } }, [ico('x', 18)])
  ]);
  AG.abaBtns.conversa = h('button', { type: 'button', role: 'tab', class: 'ag-aba on', 'aria-selected': 'true', text: 'Conversa', onclick: function () { agAba('conversa'); } });
  AG.abaBtns.alertas = h('button', { type: 'button', role: 'tab', class: 'ag-aba', 'aria-selected': 'false', text: 'Alertas', onclick: function () { agAba('alertas'); } });
  AG.lista = h('div', { class: 'ag-lista', role: 'log', 'aria-live': 'polite' });
  AG.entrada = h('input', { class: 'in ag-in', type: 'text', maxlength: '500', placeholder: 'Pergunte qualquer coisa…', 'aria-label': 'Pergunta ao agente', autocomplete: 'off', onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); agPerguntar(AG.entrada.value); } } });
  var enviar = h('button', { type: 'button', class: 'ag-env', 'aria-label': 'Enviar', onclick: function () { agPerguntar(AG.entrada.value); } }, [ico('arrow', 18)]);
  var conversa = h('div', { class: 'ag-conversa' }, [AG.lista, h('div', { class: 'ag-rod' }, [AG.entrada, enviar])]);
  AG.listaAl = h('div', { class: 'ag-alertas', style: 'display:none' });
  AG.painel = h('section', { class: 'ag-painel', id: 'ag-painel', role: 'dialog', 'aria-label': 'Agente do CRM' }, [cab, h('div', { class: 'ag-abas', role: 'tablist' }, [AG.abaBtns.conversa, AG.abaBtns.alertas]), conversa, AG.listaAl]);
  document.body.appendChild(AG.painel); document.body.appendChild(AG.botao);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && AG.aberto && !pilha.length) agAlternar(false); }, true);
  agBuscarAlertas();
  setInterval(function () { if (document.visibilityState === 'visible') agBuscarAlertas(); }, 60000);
}
`;
