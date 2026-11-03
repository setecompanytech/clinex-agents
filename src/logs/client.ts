/**
 * JavaScript do navegador da tela de Logs do agente (roda sobre o design system: /painel/ds.js).
 * Guardado como texto puro (String.raw), sem template literals dentro: só concatenação.
 */
export const clientJs = String.raw`(function () {
  var estado = { eventos: [], aberto: null, minutos: Number(lerLS('logs-min')) || 60, tipo: '', at: '', so: false, auto: false, fonte: '', atualizado: '' };
  var timer = null;
  var raiz = document.getElementById('main');
  var NOMES = { clinilink: 'Clinilink', inovstar: 'Inovstar', gpt: 'Tom (GPT)', resposta: 'Resposta', ignorado: 'Ignorado', erro: 'Erro', webhook: 'Webhook', transferencia: 'Transferência' };
  var COR = { clinilink: 'var(--g1)', inovstar: 'var(--warn)', gpt: 'var(--g5)', resposta: 'var(--ok)', ignorado: 'var(--mut)', erro: 'var(--bad)', webhook: 'var(--c-aberto)', transferencia: 'var(--acc2)' };
  var JANELAS = [[30, '30 min'], [60, '1 h'], [180, '3 h'], [720, '12 h'], [1440, '24 h']];
  var hora = function (iso) { try { return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Belem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch (e) { return iso || ''; } };

  function resumo(e) {
    if (e.evt === 'clinilink') {
      if (e.cache) return ['Reaproveitou consulta recente (' + e.recurso + ')'];
      var r = e.retorno || {}, partes = [];
      Object.keys(r).forEach(function (k) { var v = r[k]; partes.push(v && v.total != null ? v.total + ' ' + k : (v && v.encontrados != null ? v.encontrados + ' ' + k : k)); });
      return [(e.metodo || 'GET') + ' ' + String(e.caminho || '').replace('/v1/agendamento/', '') + ' · ' + (e.status || 'sem resposta') + ' · ' + (e.ms || 0) + ' ms' + (partes.length ? ' · ' + partes.join(', ') : ''), e.ok === false ? h('b', { class: 'lg-bad', text: ' · falhou' + (e.erro ? ': ' + e.erro : '') }) : null];
    }
    if (e.evt === 'inovstar') return [e.metodo + ' ' + e.caminho + ' · ' + e.status + ' · ' + e.ms + ' ms'];
    if (e.evt === 'gpt') return ['Tom amigável: ', h('b', { text: String(e.status) }), (e.motivo ? ' (' + e.motivo + ')' : '') + (e.ms ? ' · ' + e.ms + ' ms' : '')];
    if (e.evt === 'resposta') return [h('div', null, ['Etapa: ', h('b', { text: String(e.etapa) }), e.transferiu ? ' · transferiu' : '']), h('div', { class: 'lg-fala' }, [h('span', { text: 'Paciente' }), String(e.paciente_disse == null ? '' : e.paciente_disse)]), h('div', { class: 'lg-fala amanda' }, [h('span', { text: 'Amanda' }), String(e.enviado == null ? '' : e.enviado)])];
    if (e.evt === 'ignorado') return [String(e.motivo || '')];
    return [String(e.mensagem || e.motivo || '')];
  }
  function problema(e) { return e.ok === false || e.evt === 'erro' || e.gpt === 'falhou' || e.status === 'falhou' || e.status === 'rejeitado'; }

  function filtrados() {
    var at = estado.at.trim().toLowerCase();
    return estado.eventos.filter(function (e) {
      if (estado.tipo && e.evt !== estado.tipo) return false;
      if (at && String(e.atendimento || '').toLowerCase().indexOf(at) < 0) return false;
      if (estado.so && !problema(e)) return false;
      return true;
    });
  }

  function kpis() {
    var ev = estado.eventos;
    var cl = ev.filter(function (e) { return e.evt === 'clinilink' && !e.cache; });
    var falhas = cl.filter(function (e) { return e.ok === false; }).length;
    var ms = cl.length ? Math.round(cl.reduce(function (a, e) { return a + (e.ms || 0); }, 0) / cl.length) : 0;
    var resp = ev.filter(function (e) { return e.evt === 'resposta'; }).length;
    var gpt = ev.filter(function (e) { return e.evt === 'gpt'; });
    var usado = gpt.filter(function (e) { return e.status === 'usado'; }).length;
    return h('div', { class: 'kpis' }, [
      kpi2({ rotulo: 'Consultas ao Clinilink', valor: nf0.format(cl.length), sub: 'sem contar as reaproveitadas' }),
      kpi2({ rotulo: 'Falhas no Clinilink', valor: nf0.format(falhas), tom: falhas ? 'bad' : '', sub: cl.length ? pct(falhas / cl.length * 100) + ' das consultas' : 'sem consultas' }),
      kpi2({ rotulo: 'Tempo médio do Clinilink', valor: ms >= 1000 ? nf1.format(ms / 1000) + ' s' : nf0.format(ms) + ' ms', sub: 'por consulta' }),
      kpi2({ rotulo: 'Respostas da Amanda', valor: nf0.format(resp), sub: 'no período' }),
      kpi2({ rotulo: 'Tom amigável usado', valor: usado + ' de ' + gpt.length, sub: gpt.length ? pct(usado / gpt.length * 100) + ' das respostas' : 'sem respostas' })
    ]);
  }

  function filtros() {
    var tipos = [['', 'Todos']].concat(Object.keys(NOMES).filter(function (k) { return estado.eventos.some(function (e) { return e.evt === k; }); }).map(function (k) { return [k, NOMES[k]]; }));
    return h('div', { class: 'barra-f' }, [
      h('label', { class: 'campo-b' }, [h('span', { text: 'Período' }), h('div', { class: 'seg', role: 'group', 'aria-label': 'Período' }, JANELAS.map(function (j) { return h('button', { type: 'button', 'aria-pressed': String(estado.minutos === j[0]), text: j[1], onclick: function () { estado.minutos = j[0]; gravarLS('logs-min', String(j[0])); carregar(); } }); }))]),
      h('label', { class: 'campo-b' }, [h('span', { text: 'Tipo' }), h('div', { class: 'seg', role: 'group', 'aria-label': 'Tipo de evento' }, tipos.map(function (t) { return h('button', { type: 'button', 'aria-pressed': String(estado.tipo === t[0]), text: t[1], onclick: function () { estado.tipo = t[0]; estado.aberto = null; desenhar(); } }); }))]),
      h('label', { class: 'campo-b' }, [h('span', { text: 'Atendimento' }), h('input', { class: 'in', type: 'search', placeholder: 'últimos caracteres do id', value: estado.at || null, 'aria-label': 'Atendimento', oninput: function (e) { estado.at = e.target.value; clearTimeout(estado.tq); estado.tq = setTimeout(desenhar, 250); } })]),
      h('button', { type: 'button', class: 'btn' + (estado.so ? ' pri' : ''), onclick: function () { estado.so = !estado.so; estado.aberto = null; desenhar(); } }, [ico('alert', 16), 'Só problemas'])
    ]);
  }

  function linha(e, i) {
    var id = String(e.atendimento || '');
    var aberta = estado.aberto === i;
    var cor = COR[e.evt] || 'var(--mut)';
    var tr = h('tr', { class: 'clic' + (problema(e) ? ' lg-prob' : ''), tabindex: '0', 'aria-expanded': String(aberta), onclick: function () { estado.aberto = aberta ? null : i; desenhar(); }, onkeydown: function (ev) { if (ev.key === 'Enter') { estado.aberto = aberta ? null : i; desenhar(); } } }, [
      h('td', { class: 'num', text: hora(e.t) }),
      h('td', { class: 'num', text: id ? id.slice(-6) : '–' }),
      h('td', null, h('span', { class: 'pill lg-tipo', style: '--tc:' + cor }, [h('i'), NOMES[e.evt] || e.evt])),
      h('td', { class: 'lg-res' }, resumo(e))
    ]);
    var out = [tr];
    if (aberta) out.push(h('tr', { class: 'lg-det' }, h('td', { colspan: '4' }, h('pre', { text: JSON.stringify(e, null, 2) }))));
    return out;
  }

  function desenhar() {
    var y = window.scrollY;
    limpar(raiz);
    var lista = filtrados();
    kids(raiz, h('div', { class: 'tela' }, [
      h('header', { class: 'tela-h' }, [
        h('div', null, [h('h1', { text: 'Logs do agente' }), h('p', { text: 'Cada consulta ao Clinilink, Inovstar e GPT e cada resposta da Amanda. CPF, telefone e nascimento são mascarados e o paciente aparece só pelo primeiro nome.' })]),
        h('div', { class: 'tela-ac' }, [
          h('label', { class: 'au-lig' }, [h('button', { type: 'button', class: 'sw' + (estado.auto ? ' on' : ''), role: 'switch', 'aria-checked': String(estado.auto), 'aria-label': 'Atualizar a cada 15 segundos', onclick: function () { estado.auto = !estado.auto; clearInterval(timer); if (estado.auto) timer = setInterval(carregar, 15000); desenhar(); } }, h('i')), h('span', { text: 'a cada 15 s' })]),
          h('button', { type: 'button', class: 'btn pri', onclick: carregar }, [ico('refresh', 16), 'Atualizar'])
        ])
      ]),
      estado.aviso ? h('div', { class: 'faixa f-aviso' }, [ico('alert', 16), estado.aviso]) : null,
      kpis(), filtros(),
      h('section', { class: 'cartao tab-cartao' }, [
        h('header', { class: 'card-h', style: 'padding:14px 16px 0' }, [h('div', null, [h('h3', { text: 'Eventos' }), h('p', { text: lista.length + ' de ' + estado.eventos.length + ' eventos' + (estado.fonte ? ' · fonte: ' + estado.fonte : '') + (estado.atualizado ? ' · atualizado às ' + estado.atualizado : '') + '. Clique numa linha para ver o registro completo.' })])]),
        lista.length ? h('div', { class: 'tbl-w' }, h('table', { class: 'tbl' }, [
          h('thead', null, h('tr', null, ['Hora (Belém)', 'Atendimento', 'Tipo', 'O que aconteceu'].map(function (t) { return h('th', { scope: 'col', text: t }); }))),
          h('tbody', null, [].concat.apply([], lista.map(linha)))
        ])) : h('div', { class: 'vazio' }, [ico('list', 30), h('b', { text: 'Nenhum evento nesta janela' }), h('span', { text: 'Mande uma mensagem de teste para a Amanda ou aumente o período, e atualize.' })])
      ])
    ]));
    window.scrollTo(0, y);
  }

  function carregar() {
    fetch('/painel/receptivo/logs/data.json?min=' + encodeURIComponent(estado.minutos), { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        estado.eventos = j.eventos || []; estado.aberto = null; estado.fonte = j.fonte || '';
        estado.aviso = j.erro || (j.configurado === false ? 'Ainda não há fonte de eventos: configure o Supabase ou o token da Vercel (LOGS_VERCEL_TOKEN).' : '');
        estado.atualizado = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Belem' });
        desenhar();
      })
      .catch(function () { estado.aviso = 'Falha ao atualizar os logs.'; desenhar(); });
  }
  desenhar();
  carregar();
})();`;
