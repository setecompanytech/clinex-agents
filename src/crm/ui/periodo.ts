// JavaScript do CRM (navegador): filtro de período. Uma barra no topo de todas as páginas, com atalhos, calendário de intervalo,
// datas digitadas e comparação com o período anterior. Cada página guarda o seu período (no navegador) e as telas o leem daqui.
// Dentro dele não usar crases nem "dollar-chave".
export const periodoUi = String.raw`
var PER_PRESETS = [
  { id: 'hoje', r: 'Hoje' }, { id: 'ontem', r: 'Ontem' }, { id: '7d', r: 'Últimos 7 dias' }, { id: '14d', r: 'Últimos 14 dias' },
  { id: '30d', r: 'Últimos 30 dias' }, { id: '90d', r: 'Últimos 90 dias' }, { id: 'mes', r: 'Este mês' }, { id: 'mes_ant', r: 'Mês passado' },
  { id: 'trim', r: 'Este trimestre' }, { id: 'ano', r: 'Este ano' }, { id: 'tudo', r: 'Todo o período' }
];
/* período inicial de cada página: as de análise partem de 30 dias; as de lista mostram tudo até a pessoa filtrar */
var PER_PADRAO = { hoje: '30d', pipelines: 'tudo', analises: '30d', funil: 'tudo', leads: 'tudo', fluxo: '30d', calendario: 'tudo', mensagens: '30d', ia: '7d', regras: '30d' };
var PER_CAMPOS = [['entrada', 'Entrada do lead'], ['contato', 'Último contato'], ['agendamento', 'Agendamento']];
var PER_MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
var PER = {};
var PER_POP = null;

function perHoje() { return new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10); }
function perSoma(dia, n) { var d = new Date(dia + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function perDiff(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }
function perDiaOk(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v; }
function perCalc(id) {
  var hj = perHoje(), s = perSoma;
  if (id === 'hoje') return [hj, hj];
  if (id === 'ontem') return [s(hj, -1), s(hj, -1)];
  if (id === '7d') return [s(hj, -6), hj];
  if (id === '14d') return [s(hj, -13), hj];
  if (id === '30d') return [s(hj, -29), hj];
  if (id === '90d') return [s(hj, -89), hj];
  if (id === 'mes') return [hj.slice(0, 8) + '01', hj];
  if (id === 'mes_ant') { var ult = s(hj.slice(0, 8) + '01', -1); return [ult.slice(0, 8) + '01', ult]; }
  if (id === 'trim') { var q = Math.floor((Number(hj.slice(5, 7)) - 1) / 3) * 3 + 1; return [hj.slice(0, 5) + (q < 10 ? '0' : '') + q + '-01', hj]; }
  if (id === 'ano') return [hj.slice(0, 4) + '-01-01', hj];
  return ['', ''];
}
function perRotuloPreset(id) { var p = PER_PRESETS.filter(function (x) { return x.id === id; })[0]; return p ? p.r : 'Personalizado'; }
function perNormal(p) { if (p.id !== 'custom') { var c = perCalc(p.id); p.de = c[0]; p.ate = c[1]; } p.cmp = p.cmp !== false; p.dia = perHoje(); return p; }
function perLer(aba) {
  var bruto = lerLS('crm-per-' + aba), p = null;
  try { p = bruto ? JSON.parse(bruto) : null; } catch (e) { p = null; }
  var valido = p && (p.id === 'custom' ? perDiaOk(p.de) && perDiaOk(p.ate) && p.de <= p.ate : PER_PRESETS.some(function (x) { return x.id === p.id; }));
  return perNormal(valido ? { id: p.id, de: p.de, ate: p.ate, cmp: p.cmp } : { id: PER_PADRAO[aba] || '30d', cmp: true });
}
function perGet(aba) {
  aba = aba || S.aba;
  if (!PER[aba] || PER[aba].dia !== perHoje()) PER[aba] = perLer(aba); /* "Últimos 30 dias" acompanha o calendário quando vira o dia */
  return PER[aba];
}
function perSalvar(aba, p) {
  PER[aba] = perNormal({ id: p.id, de: p.de, ate: p.ate, cmp: p.cmp });
  gravarLS('crm-per-' + aba, JSON.stringify({ id: PER[aba].id, de: PER[aba].de, ate: PER[aba].ate, cmp: PER[aba].cmp }));
}
/* janela concreta para o servidor e para os cálculos: "Todo o período" vira os últimos 366 dias nas análises */
function perJanela(aba) {
  var p = perGet(aba), hj = perHoje();
  if (p.id === 'tudo') return { de: perSoma(hj, -365), ate: hj };
  var ate = p.ate > hj ? hj : p.ate;
  return { de: p.de > ate ? ate : p.de, ate: ate };
}
function perQs(aba) { var j = perJanela(aba); return 'de=' + j.de + '&ate=' + j.ate; }
function perChave(aba) { var j = perJanela(aba); return j.de + '|' + j.ate; }
function perDias(aba) { var j = perJanela(aba); return perDiff(j.de, j.ate) + 1; }
function perAnterior(aba) { var j = perJanela(aba), n = perDias(aba); return { de: perSoma(j.de, -n), ate: perSoma(j.de, -1) }; }
function perComparar() { return true; }
function perFiltrando(aba) { return perGet(aba).id !== 'tudo'; }
function perDentro(dia, aba) {
  var p = perGet(aba); if (p.id === 'tudo') return true;
  if (!dia) return false; dia = String(dia).slice(0, 10);
  return dia >= p.de && dia <= p.ate;
}
function perTexto(aba) {
  var p = perGet(aba); if (p.id === 'tudo') return 'sem limite de datas';
  return p.de === p.ate ? dBRfull(p.de) : dBRfull(p.de) + ' a ' + dBRfull(p.ate);
}
function perCampo() { var c = lerLS('crm-per-campo'); return PER_CAMPOS.some(function (x) { return x[0] === c; }) ? c : 'entrada'; }
/* o lead entra no período pela data escolhida (Funil e Leads deixam trocar; nas outras páginas vale a entrada) */
function perNoLead(l, aba) {
  aba = aba || S.aba;
  if (!perFiltrando(aba)) return true;
  var campo = aba === 'funil' || aba === 'leads' ? perCampo() : 'entrada';
  var dia = campo === 'contato' ? l.ultimoContato : campo === 'agendamento' ? (l.agendamento && l.agendamento.data) : l.d0;
  return perDentro(dia, aba);
}

/* variação contra o período anterior: some quando a comparação está desligada na barra */
function dltP(a, b, o) { return perComparar() ? dlt(a, b, o) : null; }

/* o que cada página faz quando o período muda */
function perSincPipelines() {
  var p = perGet('pipelines'), de = p.id === 'tudo' ? '' : p.de, ate = p.id === 'tudo' ? '' : p.ate;
  var mudou = FV.f.de !== de || FV.f.ate !== ate;
  FV.f.de = de; FV.f.ate = ate;
  return mudou;
}
function perAplicar(aba, p) {
  perSalvar(aba, p);
  if (aba === 'pipelines') {
    FV.EXE = null; FV.REL = null; FV.LOG = null;
    var mudou = perSincPipelines();
    desenhar(true);
    if (mudou && FV.dados) fvRecarregarCards();
    return;
  }
  desenhar(true);
}

/* ------------------------------------------------------------------ barra */
function barraPeriodo() {
  var aba = S.aba, p = perGet(aba), n = perDias(aba);
  var trig = h('button', { type: 'button', class: 'per-trig', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', title: 'Escolher o período', onclick: function () { abrirPeriodo(trig, aba); } }, [
    ico('calendar', 18),
    h('span', { class: 'per-t' }, [h('b', { text: p.id === 'custom' ? 'Personalizado' : perRotuloPreset(p.id) }), h('small', { text: perTexto(aba) + (p.id === 'custom' ? ' · ' + n + ' ' + plural(n, 'dia', 'dias') : '') })]),
    h('span', { class: 'per-seta', 'aria-hidden': 'true', text: '▾' })
  ]);
  var atalhos = h('div', { class: 'per-atalhos', role: 'group', 'aria-label': 'Atalhos de período' }, [['hoje', 'Hoje'], ['7d', '7 dias'], ['30d', '30 dias'], ['mes', 'Este mês'], ['tudo', 'Tudo']].map(function (a) {
    return h('button', { type: 'button', class: 'per-chip', 'aria-pressed': String(p.id === a[0]), text: a[1], onclick: function () { perAplicar(aba, { id: a[0], cmp: p.cmp }); } });
  }));
  var extras = [];
  if (aba === 'funil' || aba === 'leads') {
    extras.push(h('label', { class: 'per-campo' }, [h('span', { text: 'Pela data de' }), h('select', { class: 'in', 'aria-label': 'Data considerada', onchange: function (e) { gravarLS('crm-per-campo', e.target.value); desenhar(true); } }, PER_CAMPOS.map(function (c) { return h('option', { value: c[0], text: c[1], selected: perCampo() === c[0] }); }))]));
  }
  return h('div', { class: 'per-barra', role: 'region', 'aria-label': 'Filtro de período' }, extras.concat([trig, atalhos]));
}

/* ------------------------------------------------------------------ painel com calendário */
function perFechar() {
  if (!PER_POP) return;
  document.removeEventListener('keydown', PER_POP.tecla, true);
  if (PER_POP.el.parentNode) PER_POP.el.parentNode.removeChild(PER_POP.el);
  var an = PER_POP.ancora; PER_POP = null;
  if (an) { an.setAttribute('aria-expanded', 'false'); try { an.focus(); } catch (e) { /* segue */ } }
}
function perMes(ym, hj) {
  var ano = Number(ym.slice(0, 4)), mes = Number(ym.slice(5, 7)) - 1;
  var dow = new Date(Date.UTC(ano, mes, 1)).getUTCDay(), ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate(), cel = [];
  ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].forEach(function (d) { cel.push(h('span', { class: 'per-sem', text: d })); });
  for (var i = 0; i < dow; i++) cel.push(h('span', { class: 'per-vz' }));
  for (var d = 1; d <= ultimo; d++) {
    var dia = ym + '-' + (d < 10 ? '0' : '') + d;
    cel.push(h('button', { type: 'button', class: 'per-d', 'data-dia': dia, text: String(d), disabled: dia > hj, 'aria-label': dBRfull(dia) }));
  }
  return h('div', { class: 'per-mes' }, [h('b', { class: 'per-mes-t', text: PER_MESES[mes] + ' ' + ano }), h('div', { class: 'per-grade' }, cel)]);
}
function perParse(txt) {
  var m = /^\s*(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})\s*$/.exec(txt || '');
  if (!m) return '';
  var a = m[3].length === 2 ? '20' + m[3] : m[3], iso = a + '-' + (m[2].length < 2 ? '0' : '') + m[2] + '-' + (m[1].length < 2 ? '0' : '') + m[1];
  return perDiaOk(iso) ? iso : '';
}
function abrirPeriodo(ancora, aba, depois) {
  perFechar();
  var p = perGet(aba), hj = perHoje();
  var T = { id: p.id, de: p.id === 'tudo' ? '' : p.de, ate: p.id === 'tudo' ? '' : p.ate, mes: (p.id === 'tudo' ? hj : p.de).slice(0, 7), hover: '' };
  var cals = h('div', { class: 'per-cals' }), resumo = h('div', { class: 'per-res' }), erro = h('small', { class: 'per-erro' });
  var inDe = h('input', { class: 'in', type: 'text', inputmode: 'numeric', placeholder: 'dd/mm/aaaa', maxlength: '10', 'aria-label': 'Data inicial' });
  var inAte = h('input', { class: 'in', type: 'text', inputmode: 'numeric', placeholder: 'dd/mm/aaaa', maxlength: '10', 'aria-label': 'Data final' });
  var aplicar = h('button', { type: 'button', class: 'btn pri', text: 'Aplicar' });
  function soma1(ym, n) { var a = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) - 1 + n; a += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return a + '-' + (m + 1 < 10 ? '0' : '') + (m + 1); }
  if (soma1(T.mes, 1) > hj.slice(0, 7)) T.mes = soma1(hj.slice(0, 7), -1); /* nunca abre num mês só de futuro */
  function pintar() {
    var a = T.de, b = T.ate || (T.de && T.hover && T.hover >= T.de ? T.hover : '');
    Array.prototype.forEach.call(cals.querySelectorAll('.per-d'), function (el) {
      var d = el.getAttribute('data-dia'), dentro = a && b && d >= a && d <= b;
      el.className = 'per-d' + (dentro ? ' per-meio-d' : '') + (d === a ? ' per-ini' : '') + (b && d === b ? ' per-fim' : '') + (d === hj ? ' per-hj' : '');
    });
    inDe.value = T.de ? dBRfull(T.de) : ''; inAte.value = T.ate ? dBRfull(T.ate) : '';
    Array.prototype.forEach.call(raizPop.querySelectorAll('.per-op'), function (el) { el.setAttribute('aria-pressed', String(el.getAttribute('data-id') === T.id)); });
    var tudo = T.id === 'tudo', n = T.de && T.ate ? perDiff(T.de, T.ate) + 1 : 0;
    limpar(resumo);
    kids(resumo, tudo ? [h('b', { text: 'Todo o período' }), ' · sem limite de datas (as análises usam os últimos 366 dias)'] : T.de && T.ate ? [h('b', { text: n + ' ' + plural(n, 'dia', 'dias') }), ' · ' + dBRfull(T.de) + ' a ' + dBRfull(T.ate)] : T.de ? 'Agora escolha a data final' : 'Escolha a data inicial no calendário');
    var longo = n > 366 && (aba === 'analises' || aba === 'hoje' || aba === 'fluxo' || aba === 'mensagens' || aba === 'regras' || aba === 'pipelines');
    erro.textContent = longo ? 'As análises calculam no máximo 366 dias: o excedente (mais antigo) será ignorado.' : '';
    if (tudo || (T.de && T.ate)) aplicar.removeAttribute('disabled'); else aplicar.setAttribute('disabled', 'true');
  }
  function desenharMeses() {
    limpar(cals);
    var antes = h('button', { type: 'button', class: 'per-nav', 'aria-label': 'Mês anterior', text: '‹', onclick: function () { T.mes = soma1(T.mes, -1); desenharMeses(); } });
    var depois = h('button', { type: 'button', class: 'per-nav', 'aria-label': 'Próximo mês', text: '›', onclick: function () { T.mes = soma1(T.mes, 1); desenharMeses(); } });
    if (soma1(T.mes, 1) >= hj.slice(0, 7)) depois.setAttribute('disabled', 'true');
    kids(cals, [h('div', { class: 'per-nav-l' }, [antes, depois]), perMes(T.mes, hj), perMes(soma1(T.mes, 1), hj)]);
    pintar();
  }
  function escolher(dia) {
    T.id = 'custom';
    if (!T.de || T.ate) { T.de = dia; T.ate = ''; T.hover = ''; }
    else if (dia < T.de) { T.ate = T.de; T.de = dia; }
    else T.ate = dia;
    pintar();
  }
  cals.addEventListener('click', function (e) { var b = e.target.closest ? e.target.closest('.per-d') : null; if (b && !b.disabled) escolher(b.getAttribute('data-dia')); });
  cals.addEventListener('mouseover', function (e) { var b = e.target.closest ? e.target.closest('.per-d') : null; if (b && T.de && !T.ate && T.hover !== b.getAttribute('data-dia')) { T.hover = b.getAttribute('data-dia'); pintar(); } });
  cals.addEventListener('mouseleave', function () { if (T.hover) { T.hover = ''; pintar(); } });
  function digitado(qual) {
    var v = perParse((qual === 'de' ? inDe : inAte).value);
    if (!v || v > hj) { pintar(); return; }
    T.id = 'custom'; T[qual] = v;
    if (T.de && T.ate && T.de > T.ate) { var x = T.de; T.de = T.ate; T.ate = x; }
    T.mes = (T.de || v).slice(0, 7); if (soma1(T.mes, 1) > hj.slice(0, 7)) T.mes = soma1(hj.slice(0, 7), -1);
    desenharMeses();
  }
  inDe.addEventListener('change', function () { digitado('de'); }); inAte.addEventListener('change', function () { digitado('ate'); });
  var lista = h('div', { class: 'per-lado' }, [h('small', { class: 'per-lado-t', text: 'Atalhos' })].concat(PER_PRESETS.map(function (x) {
    return h('button', { type: 'button', class: 'per-op', 'data-id': x.id, text: x.r, onclick: function () {
      var c = perCalc(x.id); T.id = x.id; T.de = c[0]; T.ate = c[1]; T.hover = '';
      T.mes = (T.de || hj).slice(0, 7); if (soma1(T.mes, 1) > hj.slice(0, 7)) T.mes = soma1(hj.slice(0, 7), -1);
      desenharMeses();
    } });
  })));
  aplicar.addEventListener('click', function () {
    var id = T.id, de = T.de, ate = T.ate;
    perFechar();
    perAplicar(aba, { id: id, de: de, ate: ate, cmp: perGet(aba).cmp });
    if (depois) depois();
  });
  var raizPop = h('div', { class: 'per-pop', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Escolher o período' }, [
    lista,
    h('div', { class: 'per-meio' }, [
      h('div', { class: 'per-datas' }, [h('label', null, [h('span', { text: 'De' }), inDe]), h('i', { 'aria-hidden': 'true', text: '→' }), h('label', null, [h('span', { text: 'Até' }), inAte])]),
      cals, resumo, erro,
      h('div', { class: 'per-rodape' }, [h('button', { type: 'button', class: 'btn', text: 'Cancelar', onclick: function () { perFechar(); } }), aplicar])
    ])
  ]);
  var fundo = h('div', { class: 'per-fundo', onclick: function () { perFechar(); } }, raizPop);
  raizPop.addEventListener('click', function (e) { e.stopPropagation(); });
  function tecla(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); perFechar(); } }
  document.addEventListener('keydown', tecla, true);
  document.body.appendChild(fundo);
  PER_POP = { el: fundo, tecla: tecla, ancora: ancora };
  ancora.setAttribute('aria-expanded', 'true');
  /* posição: embaixo do botão (alinhada à esquerda); em tela estreita vira uma folha na base */
  var r = ancora.getBoundingClientRect();
  if (window.innerWidth > 760) { raizPop.style.top = Math.min(r.bottom + 8, window.innerHeight - 480) + 'px'; raizPop.style.left = Math.max(12, Math.min(r.left, window.innerWidth - 740)) + 'px'; }
  desenharMeses();
  var primeiro = lista.querySelector('.per-op[aria-pressed="true"]') || lista.querySelector('.per-op'); if (primeiro) primeiro.focus();
}
`;
