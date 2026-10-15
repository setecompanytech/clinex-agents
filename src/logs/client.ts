/**
 * JavaScript do navegador da página de logs, guardado como texto puro (String.raw), sem template
 * literals dentro: só concatenação.
 */
export const clientJs = String.raw`(function () {
  var estado = { eventos: [], aberto: null };
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var hora = function (iso) { try { return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Belem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch (e) { return iso || ''; } };
  var NOMES = { clinilink: 'Clinilink', inovstar: 'Inovstar', gpt: 'GPT', resposta: 'Resposta', ignorado: 'Ignorado', erro: 'Erro' };

  function resumo(e) {
    if (e.evt === 'clinilink') {
      if (e.cache) return 'Reaproveitou consulta recente (' + esc(e.recurso) + ')';
      var r = e.retorno || {}; var partes = [];
      Object.keys(r).forEach(function (k) { var v = r[k]; partes.push(v && v.total != null ? v.total + ' ' + k : (v && v.encontrados != null ? v.encontrados + ' ' + k : k)); });
      return esc((e.metodo || 'GET') + ' ' + String(e.caminho || '').replace('/v1/agendamento/', '')) + ' · ' + esc(e.status || 'sem resposta') + ' · ' + esc(e.ms || 0) + ' ms' + (partes.length ? ' · ' + esc(partes.join(', ')) : '') + (e.ok === false ? ' · <b>falhou</b>' + (e.erro ? ': ' + esc(e.erro) : '') : '');
    }
    if (e.evt === 'inovstar') return esc(e.metodo + ' ' + e.caminho) + ' · ' + esc(e.status) + ' · ' + esc(e.ms) + ' ms';
    if (e.evt === 'gpt') return 'Tom amigável: <b>' + esc(e.status) + '</b>' + (e.motivo ? ' (' + esc(e.motivo) + ')' : '') + (e.ms ? ' · ' + esc(e.ms) + ' ms' : '');
    if (e.evt === 'resposta') return 'Etapa: <b>' + esc(e.etapa) + '</b>' + (e.transferiu ? ' · transferiu' : '') + '<br><span class="mut">Paciente:</span> ' + esc(e.paciente_disse) + '<br><span class="mut">Amanda:</span> ' + esc(e.enviado);
    if (e.evt === 'ignorado') return esc(e.motivo);
    return esc(e.mensagem || e.motivo || '');
  }

  function filtrados() {
    var tipo = $('f-tipo').value; var at = $('f-at').value.trim().toLowerCase(); var so = $('f-erro').checked;
    return estado.eventos.filter(function (e) {
      if (tipo && e.evt !== tipo) return false;
      if (at && String(e.atendimento || '').toLowerCase().indexOf(at) < 0) return false;
      if (so && !(e.ok === false || e.evt === 'erro' || e.gpt === 'falhou' || e.status === 'falhou' || e.status === 'rejeitado')) return false;
      return true;
    });
  }

  function cartoes() {
    var ev = estado.eventos;
    var cl = ev.filter(function (e) { return e.evt === 'clinilink' && !e.cache; });
    var falhas = cl.filter(function (e) { return e.ok === false; }).length;
    var ms = cl.length ? Math.round(cl.reduce(function (a, e) { return a + (e.ms || 0); }, 0) / cl.length) : 0;
    var resp = ev.filter(function (e) { return e.evt === 'resposta'; }).length;
    var gpt = ev.filter(function (e) { return e.evt === 'gpt'; });
    var usado = gpt.filter(function (e) { return e.status === 'usado'; }).length;
    var html = '';
    [['Consultas ao Clinilink', cl.length], ['Falhas no Clinilink', falhas], ['Tempo médio Clinilink', ms + ' ms'], ['Respostas da Amanda', resp], ['Tom amigável usado', usado + ' de ' + gpt.length]].forEach(function (c) {
      html += '<div class="card"><div class="n">' + esc(c[1]) + '</div><div class="l">' + esc(c[0]) + '</div></div>';
    });
    $('cards').innerHTML = html;
  }

  function tabela() {
    var lista = filtrados(); var html = '';
    lista.forEach(function (e, i) {
      var id = String(e.atendimento || '');
      html += '<tr class="lin" data-i="' + i + '"><td>' + esc(hora(e.t)) + '</td><td class="mono">' + esc(id ? id.slice(-6) : '') + '</td><td><span class="b b-' + esc(e.evt) + '">' + esc(NOMES[e.evt] || e.evt) + '</span></td><td>' + resumo(e) + '</td></tr>';
      if (estado.aberto === i) html += '<tr class="det"><td colspan="4"><pre>' + esc(JSON.stringify(e, null, 2)) + '</pre></td></tr>';
    });
    $('corpo').innerHTML = html || '<tr><td colspan="4" class="mut">Nenhum evento nesta janela. Mande uma mensagem de teste e atualize.</td></tr>';
    $('cont').textContent = lista.length + ' de ' + estado.eventos.length + ' eventos';
    Array.prototype.forEach.call(document.querySelectorAll('tr.lin'), function (tr) {
      tr.onclick = function () { var i = Number(tr.getAttribute('data-i')); estado.aberto = estado.aberto === i ? null : i; tabela(); };
    });
  }

  function carregar() {
    $('estado').textContent = 'Atualizando…';
    fetch('/painel/logs/data.json?min=' + encodeURIComponent($('f-min').value), { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        estado.eventos = j.eventos || []; estado.aberto = null;
        $('aviso').style.display = j.erro || j.configurado === false ? 'block' : 'none';
        $('aviso').textContent = j.configurado === false ? 'Logs ainda não conectados: falta configurar o token da Vercel (LOGS_VERCEL_TOKEN).' : (j.erro || '');
        cartoes(); tabela();
        $('estado').textContent = 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Belem' });
      })
      .catch(function () { $('estado').textContent = 'Falha ao atualizar'; });
  }

  ['f-tipo', 'f-at', 'f-erro'].forEach(function (id) { $(id).oninput = tabela; $(id).onchange = tabela; });
  $('f-min').onchange = carregar; $('btn').onclick = carregar;
  $('auto').onchange = function () { if (window.__t) clearInterval(window.__t); if ($('auto').checked) window.__t = setInterval(carregar, 15000); };
  carregar();
})();`;
