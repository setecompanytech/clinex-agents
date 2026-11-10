import { paginaModulo } from '../../ui/ds.js';
import { css as cssBi } from './page.js';

// Monitor de conversas (GET /painel/receptivo/bi/conversas): cada conversa que a Amanda atendeu no período, separada em com êxito,
// sem êxito e em andamento, atualizando sozinha. Os dados são os mesmos eventos do BI (src/lib/log.ts, já mascarados).
// REGRAS deste arquivo: o JavaScript do navegador fica em String.raw, sem crases e sem "dollar-chave" dentro dele.

const css = `${cssBi}
.mon-res{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(170px,100%),1fr));gap:12px;margin-bottom:14px}
.mon-res button{all:unset;cursor:pointer;display:block;border:1px solid var(--line);border-radius:16px;padding:14px 16px;background:var(--card)}
.mon-res button[aria-pressed="true"]{border-color:var(--acc);box-shadow:0 0 0 2px color-mix(in srgb,var(--acc) 30%,transparent)}
.mon-res button:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.mon-res small{display:block;font:800 10.5px ui-monospace,Consolas,monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.mon-res b{display:block;font:800 28px/1.15 "Segoe UI Variable Display","Segoe UI",system-ui;margin-top:4px}
.mon-res span{display:block;color:var(--muted);font-size:12.5px;margin-top:2px}
.mon-res .g-exito b{color:var(--ok,#1f9d55)}.mon-res .g-sem b{color:var(--bad,#d64545)}.mon-res .g-andamento b{color:var(--acc)}
.mon-busca{width:100%;max-width:360px;border:1px solid var(--line);border-radius:12px;padding:9px 12px;background:var(--card);color:var(--ink);font:inherit}
.mon-1a{max-width:320px;color:var(--ink-2)}
.mon-mot{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
.mon-mot span{border:1px solid var(--line);border-radius:999px;padding:5px 12px;font-size:12.5px;background:var(--card)}
.mon-mot b{margin-right:6px}
.fx{border:1px solid var(--line);border-radius:16px;background:var(--card);padding:16px 18px;margin-bottom:14px;position:relative}
.fx-cab{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start;justify-content:space-between;margin-bottom:6px}
.fx-cab h2{font:800 16px/1.3 "Segoe UI Variable Display","Segoe UI",system-ui;margin:0}
.fx-cab p{margin:2px 0 0;color:var(--mut);font-size:12.5px}
.fx svg{display:block;width:100%;height:auto;overflow:visible}
.fx svg text{fill:var(--ink);font:600 12px "Segoe UI",system-ui}
.fx svg text.fx-n{font:800 15px "Segoe UI Variable Display","Segoe UI",system-ui}
.fx svg text.fx-m{fill:var(--mut);font-weight:500;font-size:11.5px}
.fx-fita{opacity:.28;transition:opacity .12s}
.fx-fita:hover,.fx-fita:focus{opacity:.55;outline:none}
.fx-no{cursor:default}
.fx-leg{display:flex;flex-wrap:wrap;gap:14px;font-size:12.5px;color:var(--ink2);margin-top:6px}
.fx-leg span{display:inline-flex;align-items:center;gap:6px}
.fx-leg i{width:10px;height:10px;border-radius:3px;display:inline-block}
.fx-alerta{margin-top:10px;display:grid;gap:6px}
.fx-alerta div{border-left:3px solid var(--warn);padding:6px 10px;background:color-mix(in srgb,var(--warn) 9%,transparent);border-radius:0 10px 10px 0;font-size:13px}
.fx-alerta div.ok{border-color:var(--ok);background:color-mix(in srgb,var(--ok) 9%,transparent)}
.fx-dica{position:absolute;pointer-events:none;background:var(--solid,#111);color:var(--ink);border:1px solid var(--line);border-radius:10px;padding:7px 10px;font-size:12.5px;box-shadow:0 6px 18px rgba(0,0,0,.18);max-width:260px;z-index:5}
.fx details{margin-top:10px}.fx summary{cursor:pointer;color:var(--mut);font-size:12.5px}
`;

const main = `
<main id="main"><div class="tela">
  <header class="tela-h bi-cab">
    <div><h1>Conversas monitoradas</h1><p>Cada conversa que a Amanda atendeu: quais deram certo, quais não deram e quais ainda estão acontecendo.</p></div>
    <div class="tela-ac">
      <div class="seg" role="group" aria-label="Período">
        <button type="button" data-periodo="24h" aria-pressed="false">24 h</button>
        <button type="button" data-periodo="7d" aria-pressed="false">7 dias</button>
        <button type="button" data-periodo="30d" aria-pressed="false">30 dias</button>
      </div>
      <button class="btn" id="btn-atualizar" type="button">Atualizar</button>
    </div>
  </header>
  <div class="meta" id="meta" aria-live="polite">Carregando…</div>
  <div id="avisos"></div>
  <div id="app"></div>
</div></main>`;

export const paginaMonitor = paginaModulo({ titulo: 'Conversas monitoradas', modulo: 'receptivo', ativo: 'conversas', main, css, scripts: ['/painel/receptivo/bi/conversas.js'] });

export const monitorJs = String.raw`
var MON = { periodo: lerLS('mon-periodo') || '24h', filtro: lerLS('mon-filtro') || 'todas', busca: '', dados: null };
if (['24h', '7d', '30d'].indexOf(MON.periodo) < 0) MON.periodo = '24h';
var GRUPOS = [['todas', 'Todas', 'no período'], ['exito', 'Com êxito', 'agendou ou concluiu'], ['sem', 'Sem êxito', 'transferiu ou parou de responder'], ['andamento', 'Em andamento', 'conversa aberta agora']];
function grupoDe(s) { return s === 'agendada' || s === 'finalizada' ? 'exito' : s === 'andamento' ? 'andamento' : 'sem'; }
function haQuanto(t) {
  var m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'agora' : m < 60 ? 'há ' + m + ' min' : m < 1440 ? 'há ' + Math.round(m / 60) + ' h' : fmtDiaHora(t);
}
function cortarFrase(t, n) { if (t.length <= n) return t; var i = t.lastIndexOf(' ', n); return t.slice(0, i > 20 ? i : n).replace(/[ ,.;(]+$/, '') + '…'; }
function porque(c) {
  if (c.status === 'abandonada') return 'Parou de responder em: ' + (c.etapa || '?');
  if (c.motivo) return c.motivo;
  if (c.problemas) return c.problemas + ' falha(s) no caminho';
  return '';
}

// ---------------------------------------------------------------- leadflow: até onde as conversas chegam, onde param e onde vão para a equipe
if (['todos', 'ia', 'roteiro'].indexOf(lerLS('mon-motor') || 'todos') < 0) gravarLS('mon-motor', 'todos');
MON.motor = lerLS('mon-motor') || 'todos';
var ESTAGIOS = ['Entrou em contato', 'Serviço identificado', 'Horários oferecidos', 'Dados do paciente', 'Agendou'];
var SAIDAS = [['equipe', 'passaram para a equipe', 'var(--warn)', 'passou para a equipe'], ['parou', 'pararam ou encerraram sem agendar', 'var(--bad)', 'parou ou encerrou sem agendar'], ['andamento', 'ainda em andamento', 'var(--mut)', 'ainda em andamento']];
function saidaDe(c) { return c.status === 'transferida' || c.status === 'emergencia' ? 'equipe' : c.status === 'andamento' ? 'andamento' : 'parou'; }
function svgEl(tag, at, filhos) {
  var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.keys(at || {}).forEach(function (k) { if (at[k] != null) e.setAttribute(k, at[k]); });
  (filhos || []).forEach(function (f) { if (f) e.appendChild(typeof f === 'string' ? document.createTextNode(f) : f); });
  return e;
}
function pctDe(a, b) { return b ? Math.round(a / b * 100) + '%' : '0%'; }
function calcFluxo(cs) {
  var chegou = [0, 0, 0, 0, 0];
  var sai = [0, 1, 2, 3].map(function () { return { equipe: 0, parou: 0, andamento: 0 }; });
  cs.forEach(function (c) {
    var e = c.status === 'agendada' ? 4 : Math.max(0, Math.min(3, c.estagio || 0));
    for (var i = 0; i <= e; i++) chegou[i]++;
    if (e < 4) sai[e][saidaDe(c)]++;
  });
  return { chegou: chegou, sai: sai };
}
function faixa(x1, a1, x2, a2, t) {
  var m = (x1 + x2) / 2;
  return 'M' + x1 + ' ' + a1 + ' C' + m + ' ' + a1 + ' ' + m + ' ' + a2 + ' ' + x2 + ' ' + a2 + ' L' + x2 + ' ' + (a2 + t) + ' C' + m + ' ' + (a2 + t) + ' ' + m + ' ' + (a1 + t) + ' ' + x1 + ' ' + (a1 + t) + ' Z';
}
function desenharFluxo(cs) {
  var caixa = h('section', { class: 'fx', 'aria-label': 'Fluxo das conversas' });
  var seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Quem atendeu' }, [['todos', 'Todas'], ['ia', 'Amanda IA'], ['roteiro', 'Roteiro antigo']].map(function (o) {
    return h('button', { type: 'button', text: o[1], 'aria-pressed': MON.motor === o[0] ? 'true' : 'false', onclick: function () { MON.motor = o[0]; gravarLS('mon-motor', o[0]); desenharMon(); } });
  }));
  caixa.appendChild(h('div', { class: 'fx-cab' }, [
    h('div', null, [h('h2', { text: 'Fluxo das conversas' }), h('p', { text: 'Até onde cada conversa chegou no caminho do agendamento, onde parou e onde passou para a equipe.' })]),
    seg
  ]));
  var f = calcFluxo(cs); var total = f.chegou[0];
  if (!total) { caixa.appendChild(vazio('Nenhuma conversa neste filtro no período.')); return caixa; }

  var W = 1000, X0 = 4, NW = 14, Y0 = 50, ALT = 180, GAP = 3, k = ALT / total;
  var passo = (W - 230 - X0) / 4;
  var xs = [0, 1, 2, 3, 4].map(function (i) { return X0 + i * passo; });
  var hN = f.chegou.map(function (n) { return n ? Math.max(3, n * k) : 0; });
  var saidas = []; var Hmax = Y0 + ALT + 20;
  f.sai.forEach(function (s, i) {
    var y = Y0 + hN[i + 1] + 28; var ly = 0; var lista = [];
    SAIDAS.forEach(function (sd) {
      var n = s[sd[0]]; if (!n) return;
      var hh = Math.max(3, n * k);
      ly = Math.max(y + 11, ly + 16);
      lista.push({ tipo: sd[0], rot: n === 1 ? sd[3] : sd[1], cor: sd[2], n: n, y: y, h: hh, ly: ly });
      y += hh + GAP;
    });
    saidas.push(lista); Hmax = Math.max(Hmax, y + 8, ly + 10);
  });

  var dica = h('div', { class: 'fx-dica', hidden: true });
  function mostrar(ev, txt) {
    var r = caixa.getBoundingClientRect();
    dica.textContent = txt; dica.hidden = false;
    var x = ev.clientX - r.left + 14, y = ev.clientY - r.top + 14;
    if (x + 270 > r.width) x = ev.clientX - r.left - 270;
    dica.style.left = x + 'px'; dica.style.top = y + 'px';
  }
  function esconder() { dica.hidden = true; }
  function comDica(el, txt) {
    el.setAttribute('tabindex', '0'); el.setAttribute('aria-label', txt);
    el.addEventListener('mousemove', function (e) { mostrar(e, txt); });
    el.addEventListener('mouseleave', esconder);
    el.addEventListener('focus', function () { var b = el.getBoundingClientRect(); mostrar({ clientX: b.left + b.width / 2, clientY: b.top }, txt); });
    el.addEventListener('blur', esconder);
    el.appendChild(svgEl('title', {}, [txt]));
    return el;
  }

  var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + Math.ceil(Hmax), role: 'img', 'aria-label': 'Fluxo: ' + ESTAGIOS.map(function (e, i) { return e + ' ' + f.chegou[i]; }).join(', ') });
  // faixas (atrás dos nós)
  for (var i = 0; i < 4; i++) {
    var x1 = xs[i] + NW, x2 = xs[i + 1], cur = Y0;
    var cont = f.chegou[i + 1];
    if (cont) {
      var t = Math.max(1.5, cont * k);
      svg.appendChild(comDica(svgEl('path', { class: 'fx-fita', d: faixa(x1, cur, x2, Y0, t), fill: i === 3 ? 'var(--ok)' : 'var(--cy)' }),
        ESTAGIOS[i] + ' → ' + ESTAGIOS[i + 1] + ': ' + cont + ' de ' + f.chegou[i] + ' (' + pctDe(cont, f.chegou[i]) + ') seguiram'));
      cur += t;
    }
    saidas[i].forEach(function (s) {
      var t2 = Math.max(1.5, s.n * k);
      svg.appendChild(comDica(svgEl('path', { class: 'fx-fita', d: faixa(x1, cur, x2, s.y, t2), fill: s.cor }),
        'Em "' + ESTAGIOS[i] + '": ' + s.n + ' ' + s.rot + ' (' + pctDe(s.n, f.chegou[i]) + ' de quem chegou aqui)'));
      cur += t2;
    });
  }
  // nós e rótulos das etapas
  ESTAGIOS.forEach(function (nome, i) {
    var n = f.chegou[i];
    svg.appendChild(svgEl('text', { x: xs[i], y: Y0 - 28, class: 'fx-m' }, [nome]));
    svg.appendChild(svgEl('text', { x: xs[i], y: Y0 - 10, class: 'fx-n' }, [String(n) + (i ? '  ·  ' + pctDe(n, total) : '')]));
    if (n) svg.appendChild(comDica(svgEl('rect', { class: 'fx-no', x: xs[i], y: Y0, width: NW, height: hN[i], rx: 4, fill: i === 4 ? 'var(--ok)' : 'var(--cy)' }),
      nome + ': ' + n + ' conversa(s), ' + pctDe(n, total) + ' do total'));
  });
  // saídas: quem parou em cada etapa
  saidas.forEach(function (lista, i) {
    lista.forEach(function (s) {
      svg.appendChild(comDica(svgEl('rect', { class: 'fx-no', x: xs[i + 1], y: s.y, width: NW, height: s.h, rx: 3, fill: s.cor }),
        'Saíram em "' + ESTAGIOS[i] + '": ' + s.n + ' ' + s.rot));
      svg.appendChild(svgEl('text', { x: xs[i + 1] + NW + 6, y: s.ly, class: 'fx-m' }, [s.n + ' ' + s.rot]));
    });
  });
  caixa.appendChild(svg);
  caixa.appendChild(dica);
  caixa.appendChild(h('div', { class: 'fx-leg' }, [
    h('span', null, [h('i', { style: 'background:var(--cy)' }), 'Seguiram no caminho']),
    h('span', null, [h('i', { style: 'background:var(--ok)' }), 'Agendou']),
    h('span', null, [h('i', { style: 'background:var(--warn)' }), 'Passou para a equipe (transbordo)']),
    h('span', null, [h('i', { style: 'background:var(--bad)' }), 'Parou ou encerrou sem agendar']),
    h('span', null, [h('i', { style: 'background:var(--mut)' }), 'Em andamento'])
  ]));

  // onde precisa de atenção
  var alertas = [];
  alertas.push(h('div', { class: 'ok', text: 'Agendou: ' + f.chegou[4] + ' de ' + total + ' conversas (' + pctDe(f.chegou[4], total) + ').' }));
  var pior = -1, piorTaxa = 0;
  for (var j = 0; j < 4; j++) { if (f.chegou[j] < 2) continue; var tx = (f.chegou[j] - f.chegou[j + 1] - f.sai[j].andamento) / f.chegou[j]; if (tx > piorTaxa) { piorTaxa = tx; pior = j; } }
  if (pior >= 0 && piorTaxa > 0) {
    var sp = f.sai[pior];
    alertas.push(h('div', { text: 'Precisa de atenção: em "' + ESTAGIOS[pior] + '" é onde mais se perde. ' + (sp.equipe + sp.parou) + ' de ' + f.chegou[pior] + ' (' + Math.round(piorTaxa * 100) + '%) não seguiram para "' + ESTAGIOS[pior + 1] + '": ' + sp.equipe + ' foram para a equipe e ' + sp.parou + ' pararam.' }));
  }
  var eq = f.sai.reduce(function (a, s) { return a + s.equipe; }, 0);
  if (eq) {
    var onde = 0; f.sai.forEach(function (s, i2) { if (s.equipe > f.sai[onde].equipe) onde = i2; });
    alertas.push(h('div', { text: 'Transbordo para a equipe: ' + eq + ' conversa(s) (' + pctDe(eq, total) + '), a maioria em "' + ESTAGIOS[onde] + '". Os motivos aparecem logo abaixo.' }));
  }
  caixa.appendChild(h('div', { class: 'fx-alerta' }, alertas));

  // a mesma informação em tabela
  var linhas = ESTAGIOS.map(function (nome, i2) {
    var s = f.sai[i2] || { equipe: '–', parou: '–', andamento: '–' };
    return h('tr', null, [nome, String(f.chegou[i2]), pctDe(f.chegou[i2], total), i2 < 4 ? String(f.chegou[i2 + 1]) : '–', String(s.equipe), String(s.parou), String(s.andamento)].map(function (v, c) { return h(c ? 'td' : 'th', c ? { text: v } : { scope: 'row', text: v }); }));
  });
  caixa.appendChild(h('details', null, [h('summary', { text: 'Ver em tabela' }), h('div', { class: 'tbl-w' }, h('table', { class: 'tbl' }, [
    h('thead', null, h('tr', null, ['Etapa', 'Chegaram', '% do total', 'Seguiram', 'Equipe', 'Pararam', 'Em andamento'].map(function (t3) { return h('th', { scope: 'col', text: t3 }); }))),
    h('tbody', null, linhas)
  ]))]));
  return caixa;
}

var gavetaMon = null, voltaMon = null;
function fecharGavetaMon() { if (!gavetaMon) return; gavetaMon.remove(); gavetaMon = null; document.body.classList.remove('sem-rolagem'); if (voltaMon && voltaMon.focus) voltaMon.focus(); }
function abrirConversa(c, origem) {
  fecharGavetaMon(); voltaMon = origem;
  var fechar = h('button', { class: 'mini', type: 'button', text: 'Fechar', onclick: fecharGavetaMon });
  var corpo = h('div', { class: 'conversa' }, h('p', { class: 'mut', text: 'Carregando a conversa…' }));
  gavetaMon = h('div', { class: 'gaveta-fundo', onclick: function (e) { if (e.target === gavetaMon) fecharGavetaMon(); } },
    h('aside', { class: 'gaveta', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Conversa' }, [
      h('header', null, [
        h('div', null, [h('h3', { text: 'Atendimento #' + c.curto }), h('p', { text: fmtDiaHora(c.inicio) + ' · ' + c.mensagens + ' mensagens · id ' + c.id })]),
        chipStatus(c.status), fechar
      ]),
      porque(c) ? h('div', { class: 'aviso-i', text: porque(c) }) : null,
      corpo,
      h('p', { class: 'mut peq', text: 'Telefone, CPF e datas de nascimento são mascarados antes de qualquer registro. Para achar a conversa na Inovstar, use o id do atendimento.' })
    ]));
  document.body.appendChild(gavetaMon); document.body.classList.add('sem-rolagem'); fechar.focus();
  fetch('/painel/receptivo/bi/conversas.json?periodo=' + MON.periodo + '&id=' + encodeURIComponent(c.id), { credentials: 'same-origin', cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error('O servidor respondeu ' + r.status); return r.json(); })
    .then(function (d) {
      corpo.textContent = '';
      (d.turnos || []).forEach(function (t) {
        var tags = [h('span', { class: 'tag', text: t.etapa })];
        if (t.transferiu) tags.push(h('span', { class: 'tag t-alerta', text: 'Transferiu' + (t.motivo ? ': ' + t.motivo : '') }));
        corpo.appendChild(h('div', { class: 'turno' }, [
          t.paciente ? h('div', { class: 'bolha pac' }, [h('small', { text: 'Paciente · ' + fmtHora(t.t) }), h('p', { text: t.paciente })]) : null,
          h('div', { class: 'bolha ama' }, [h('small', { text: 'Amanda' }), h('p', { text: t.amanda })]),
          h('div', { class: 'tags' }, tags)
        ]));
      });
      if (!d.turnos || !d.turnos.length) corpo.appendChild(vazio('Sem mensagens registradas.'));
    })
    .catch(function (e) { corpo.textContent = ''; corpo.appendChild(vazio('Não consegui abrir a conversa: ' + e.message)); });
}
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fecharGavetaMon(); });

function desenharMon() {
  var d = MON.dados; var raiz = document.getElementById('app'); raiz.textContent = '';
  var meta = document.getElementById('meta');
  meta.textContent = 'Atualizado às ' + fmtHora(d.geradoEm) + ' · ' + (d.origens || []).join(' + ') + ' · atualiza sozinho a cada 30 s';
  var avisos = document.getElementById('avisos'); avisos.textContent = '';
  (d.avisos || []).forEach(function (a) { avisos.appendChild(h('div', { class: 'faixa' }, [chip('atencao', 'Atenção'), a])); });
  var cs = (d.conversas || []).filter(function (c) { return MON.motor === 'todos' || (c.motor || 'roteiro') === MON.motor; });
  var n = { todas: cs.length, exito: 0, sem: 0, andamento: 0 };
  cs.forEach(function (c) { n[grupoDe(c.status)]++; });
  var fechadas = n.exito + n.sem;
  raiz.appendChild(h('div', { class: 'mon-res', role: 'group', 'aria-label': 'Filtrar por resultado' }, GRUPOS.map(function (g) {
    var pct = g[0] === 'exito' || g[0] === 'sem' ? (fechadas ? Math.round(n[g[0]] / fechadas * 100) + '% das que terminaram' : g[2]) : g[2];
    return h('button', { type: 'button', class: 'g-' + g[0], 'aria-pressed': MON.filtro === g[0] ? 'true' : 'false', onclick: function () { MON.filtro = g[0]; gravarLS('mon-filtro', g[0]); desenharMon(); } },
      [h('small', { text: g[1] }), h('b', { text: String(n[g[0]]) }), h('span', { text: pct })]);
  })));
  raiz.appendChild(desenharFluxo(cs));
  // por que não deram certo
  var mot = {};
  cs.filter(function (c) { return grupoDe(c.status) === 'sem'; }).forEach(function (c) {
    var k = c.status === 'abandonada' ? 'Parou de responder' : c.status === 'emergencia' ? 'Emergência (encaminhada)' : cortarFrase((c.motivo || 'Transferida').split(':')[0], 70);
    mot[k] = (mot[k] || 0) + 1;
  });
  var motivos = Object.keys(mot).sort(function (a, b) { return mot[b] - mot[a]; }).slice(0, 6);
  if (motivos.length && MON.filtro !== 'exito' && MON.filtro !== 'andamento') {
    raiz.appendChild(h('div', { class: 'mon-mot', 'aria-label': 'Por que não deram certo' }, motivos.map(function (k) { return h('span', null, [h('b', { text: String(mot[k]) }), k]); })));
  }
  var busca = h('input', { class: 'mon-busca', type: 'search', placeholder: 'Procurar por id, etapa ou o que o paciente disse', value: MON.busca, 'aria-label': 'Procurar conversa' });
  busca.addEventListener('input', function () { MON.busca = busca.value; desenharTabela(); });
  raiz.appendChild(h('div', { style: 'margin-bottom:12px' }, busca));
  var lugar = h('div'); raiz.appendChild(lugar);
  function desenharTabela() {
    lugar.textContent = '';
    var q = MON.busca.trim().toLowerCase();
    var lista = cs.filter(function (c) { return (MON.filtro === 'todas' || grupoDe(c.status) === MON.filtro) && (!q || (c.id + ' ' + c.etapa + ' ' + c.primeira + ' ' + porque(c)).toLowerCase().indexOf(q) >= 0); });
    if (!lista.length) { lugar.appendChild(vazio(cs.length ? 'Nenhuma conversa com esse filtro.' : 'Nenhuma conversa no período. Assim que a Amanda atender alguém, aparece aqui.')); return; }
    var linhas = lista.map(function (c) {
      var tr = h('tr', { class: 'clic', tabindex: '0', onclick: function () { abrirConversa(c, tr); }, onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirConversa(c, tr); } } }, [
        h('td', null, chipStatus(c.status)),
        h('td', { text: '#' + c.curto }),
        h('td', { class: 'mon-1a', text: c.primeira || '–' }),
        h('td', { text: fmtDiaHora(c.inicio) }),
        h('td', { text: haQuanto(c.fim) }),
        h('td', { text: c.etapa || '–' }),
        h('td', { text: String(c.mensagens) }),
        h('td', { class: 'obs', text: porque(c) })
      ]);
      return tr;
    });
    lugar.appendChild(h('div', { class: 'tbl-w' }, h('table', { class: 'tbl' }, [
      h('thead', null, h('tr', null, ['Resultado', 'Atendimento', 'Primeira mensagem', 'Começou', 'Última atividade', 'Onde está / parou', 'Msgs', 'Por quê'].map(function (t) { return h('th', { scope: 'col', text: t }); }))),
      h('tbody', null, linhas)
    ])));
  }
  desenharTabela();
}
function carregarMon() {
  var meta = document.getElementById('meta');
  return fetch('/painel/receptivo/bi/conversas.json?periodo=' + MON.periodo, { credentials: 'same-origin', cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error('O servidor respondeu ' + r.status); return r.json(); })
    .then(function (d) { MON.dados = d; desenharMon(); })
    .catch(function (e) { meta.textContent = 'Não consegui carregar as conversas: ' + e.message; });
}
function marcarPeriodo() { document.querySelectorAll('[data-periodo]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-periodo') === MON.periodo ? 'true' : 'false'); }); }
document.querySelectorAll('[data-periodo]').forEach(function (b) { b.addEventListener('click', function () { MON.periodo = b.getAttribute('data-periodo'); gravarLS('mon-periodo', MON.periodo); marcarPeriodo(); carregarMon(); }); });
document.getElementById('btn-atualizar').addEventListener('click', carregarMon);
marcarPeriodo();
carregarMon();
setInterval(function () { if (document.visibilityState === 'visible' && !gavetaMon) carregarMon(); }, 30000);
`;
