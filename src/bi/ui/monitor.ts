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
  var cs = d.conversas || [];
  var n = { todas: cs.length, exito: 0, sem: 0, andamento: 0 };
  cs.forEach(function (c) { n[grupoDe(c.status)]++; });
  var fechadas = n.exito + n.sem;
  raiz.appendChild(h('div', { class: 'mon-res', role: 'group', 'aria-label': 'Filtrar por resultado' }, GRUPOS.map(function (g) {
    var pct = g[0] === 'exito' || g[0] === 'sem' ? (fechadas ? Math.round(n[g[0]] / fechadas * 100) + '% das que terminaram' : g[2]) : g[2];
    return h('button', { type: 'button', class: 'g-' + g[0], 'aria-pressed': MON.filtro === g[0] ? 'true' : 'false', onclick: function () { MON.filtro = g[0]; gravarLS('mon-filtro', g[0]); desenharMon(); } },
      [h('small', { text: g[1] }), h('b', { text: String(n[g[0]]) }), h('span', { text: pct })]);
  })));
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
