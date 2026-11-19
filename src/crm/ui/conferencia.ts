// JavaScript do CRM (navegador): conferência Pipelines × Fluxo. Dados de /painel/crm/api/conferencia (src/crm/conferencia.ts).
// Dentro dele não usar crases nem "dollar-chave".
export const conferenciaUi = String.raw`
var CF = { d: null, car: false, t: 0, btns: [] };
function cfPedir(forcar) {
  if (CF.car) return Promise.resolve(CF.d);
  if (!forcar && CF.d && Date.now() - CF.t < 60000) return Promise.resolve(CF.d);
  CF.car = true;
  return api('GET', '/conferencia').then(function (d) { CF.d = d; CF.t = Date.now(); CF.car = false; cfAtualizarBotoes(); return d; }).catch(function (e) { CF.car = false; throw e; });
}
function cfRotuloBotao() { var n = CF.d ? CF.d.totais.divergentes : null; return 'Conferir com ' + (S.aba === 'pipelines' ? 'o Fluxo' : 'os Pipelines') + (n ? ' · ' + n + ' diferentes' : ''); }
function cfAtualizarBotoes() { CF.btns = CF.btns.filter(function (b) { return b.isConnected; }); CF.btns.forEach(function (b) { var s = b.querySelector('.cf-rot'); if (s) s.textContent = cfRotuloBotao(); b.classList.toggle('cf-dif-b', !!(CF.d && CF.d.totais.divergentes)); }); }
/* botão para o cabeçalho do Fluxo e dos Pipelines: mostra quantos cards/leads estão contados de forma diferente */
function cfBotao() {
  var b = h('button', { class: 'btn', type: 'button', title: 'O Fluxo conta leads pelo guia e o Pipelines conta cards pela coluna. Veja onde os números diferem e por quê.', onclick: function () { abrirConferencia(); } }, [ico('chart', 16), h('span', { class: 'cf-rot', text: cfRotuloBotao() })]);
  CF.btns.push(b); cfPedir(false).catch(function () { /* o botão continua funcionando */ });
  return b;
}
function cfChips(l) {
  var c = [];
  if (l.semCard) c.push(l.semCard + (l.semCard === 1 ? ' lead sem card' : ' leads sem card'));
  if (l.semLead) c.push(l.semLead + (l.semLead === 1 ? ' card sem lead' : ' cards sem lead'));
  if (l.cardEmOutra) c.push(l.cardEmOutra + (l.cardEmOutra === 1 ? ' lead com o card em outra coluna' : ' leads com o card em outra coluna'));
  if (l.leadEmOutro) c.push(l.leadEmOutro + (l.leadEmOutro === 1 ? ' card cujo lead está em outra etapa' : ' cards cujos leads estão em outra etapa'));
  return c;
}
function cfCorpo(d, m) {
  if (!d.funil) return [vazio('Não há funil de orçamentos nos Pipelines', 'Quando o funil existir, a conferência aparece aqui.')];
  var t = d.totais, dif = t.fluxo - t.pipeline;
  var resumo = h('div', { class: 'cf-resumo' }, [
    h('div', null, [h('b', { text: nf0.format(t.fluxo) }), h('span', { text: 'leads no Fluxo' })]),
    h('div', null, [h('b', { text: nf0.format(t.pipeline) }), h('span', { text: 'cards nos Pipelines (' + d.funil + ')' })]),
    h('div', { class: t.divergentes ? 'cf-av' : 'cf-bom' }, [h('b', { text: nf0.format(t.divergentes) }), h('span', { text: 'leads com o card em outra coluna' })])
  ]);
  var linhas = d.linhas.map(function (l) {
    var diff = l.pipeline - l.fluxo, chips = cfChips(l);
    return h('tr', { class: diff === 0 && !chips.length ? 'cf-ok' : '' }, [
      h('th', { scope: 'row', text: l.rotulo }), h('td', { class: 'n', text: nf0.format(l.fluxo) }), h('td', { class: 'n', text: nf0.format(l.pipeline) }),
      h('td', { class: 'n ' + (diff === 0 ? 'cf-bom' : 'cf-av'), text: diff === 0 ? '=' : (diff > 0 ? '+' : '') + nf0.format(diff) }),
      h('td', null, chips.length ? chips.map(function (c) { return h('span', { class: 'cf-chip', text: c }); }) : [h('span', { class: 'mut', text: l.fluxo || l.pipeline ? 'batem por completo' : '—' })])
    ]);
  });
  var tabela = h('div', { class: 'cf-tab' }, h('table', null, [
    h('thead', null, h('tr', null, ['Etapa', 'Fluxo (leads)', 'Pipelines (cards)', 'Diferença', 'Por que diferem'].map(function (x, i) { return h('th', { scope: 'col', class: i >= 1 && i <= 3 ? 'n' : '', text: x }); }))),
    h('tbody', null, linhas)
  ]));
  var nota = h('p', { class: 'mut cf-nota', text: 'O Fluxo conta cada lead pela etapa do guia; o Pipelines conta cada card pela coluna onde ele está. Os números só batem quando o card está na coluna que o guia manda. Leads sem card e cards sem lead também entram na diferença.' });
  var topo = [resumo, nota, tabela];
  var semPar = cfSemPar(d);
  if (!d.divergencias.length) return topo.concat([h('div', { class: 'cf-tudo' }, [ico('check', 18), 'Todos os leads que têm card estão na mesma etapa nos dois lados.'])], semPar);
  var acao = h('div', { class: 'cf-acao' }, [
    t.alinhaveis ? botao('Alinhar ' + t.alinhaveis + (t.alinhaveis === 1 ? ' card ao Fluxo' : ' cards ao Fluxo'), 'pri', function (e) { cfAlinhar(m, e.currentTarget, t.alinhaveis); }, 'check') : null,
    h('p', { class: 'mut', text: t.alinhaveis ? 'Move esses cards para a coluna que o Fluxo mostra. Fica registrado no histórico do card ("Conferência (Fluxo)"). Cards em colunas de status (agendado, convertido, descarte) seguem a sincronização automática.' : 'Nenhum destes cards pode ser movido automaticamente; o motivo está em cada linha.' })
  ]);
  var lista = h('ul', { class: 'cf-lista' }, d.divergencias.slice(0, 120).map(function (x) {
    var bAli = x.alinhavel ? botao('Levar o card para ' + x.fluxo, '', function (e) { cfAlinharUm(m, x, e.currentTarget); }, 'arrow') : null;
    var bLead = x.statusSugerido ? botao('Mudar o lead para onde o card está', '', function () { cfMudarLead(m, x); }, 'edit') : null;
    return h('li', { class: 'cf-it' }, [
      h('button', { type: 'button', class: 'cf-li', title: x.motivo || '', onclick: function () { abrirLead(x.leadId); } }, [
        h('span', { class: 'cf-n' }, [h('b', { text: x.nome }), h('small', { text: 'Fluxo: ' + x.fluxo + '  ·  Pipelines: ' + x.pipeline + (x.motivo ? '  ·  ' + x.motivo : '') })])
      ]),
      h('div', { class: 'cf-ac' }, [bAli, bLead])
    ]);
  }));
  return topo.concat([acao, h('h4', { class: 'cf-sub', text: 'Quem está diferente' + (d.divergencias.length >= 120 ? ' (primeiros 120)' : '') }), lista], semPar);
}
/* quem não tem par do outro lado: lead sem card visível e card sem lead (explica a diferença de contagem entre as telas) */
function cfSemPar(d) {
  var l = d.semPar || [];
  if (!l.length) return [];
  var lead = l.filter(function (x) { return x.tipo === 'lead_sem_card'; }), card = l.filter(function (x) { return x.tipo === 'card_sem_lead'; });
  function bloco(titulo, lista) {
    if (!lista.length) return null;
    return h('div', null, [h('h4', { class: 'cf-sub', text: titulo + ' (' + lista.length + (lista.length >= 300 ? '+' : '') + ')' }), h('ul', { class: 'cf-lista' }, lista.slice(0, 120).map(function (x) {
      return h('li', null, h('button', { type: 'button', class: 'cf-li', title: x.motivo, onclick: function () { if (x.leadId) abrirLead(x.leadId); else if (x.cardId) fvAbrirCard(x.cardId); } }, [
        h('span', { class: 'cf-n' }, [h('b', { text: x.nome }), h('small', { text: (x.tipo === 'lead_sem_card' ? 'Fluxo: ' : 'Pipelines: ') + x.etapa + '  ·  ' + x.motivo })]),
        h('em', { class: 'cf-nao', text: 'sem par' })
      ]));
    }))]);
  }
  return [bloco('Leads do Fluxo sem card nos Pipelines', lead), bloco('Cards dos Pipelines sem lead no Fluxo', card)];
}
/* ação de uma linha: levar só este card para a coluna do Fluxo */
function cfAlinharUm(m, x, btn) {
  btn.setAttribute('disabled', 'true');
  api('POST', '/conferencia/alinhar', { leadId: x.leadId }).then(function (r) {
    CF.d = r.conferencia; CF.t = Date.now(); cfAtualizarBotoes();
    if (typeof FV !== 'undefined') { FV.dados = null; }
    aviso(r.movidos ? 'Card de ' + x.nome + ' levado para ' + x.fluxo + '.' : 'Este card não pôde ser movido.', r.movidos ? 'ok' : 'aviso');
    limpar(m.corpo); kids(m.corpo, cfCorpo(CF.d, m));
    carregar(true).catch(function () { /* a tela se atualiza na próxima */ });
  }).catch(function (e) { aviso(e.message, 'erro'); btn.removeAttribute('disabled'); });
}
/* ação de uma linha: mudar o lead para o status que combina com a coluna do card (abre o Mudar status já preenchido) */
function cfMudarLead(m, x) {
  api('GET', '/leads/' + x.leadId).then(function (l) {
    dialogoMudarStatus(l, x.statusSugerido, function () {
      cfPedir(true).then(function (d) { limpar(m.corpo); kids(m.corpo, cfCorpo(d, m)); });
    });
  }).catch(function (e) { aviso(e.message, 'erro'); });
}
function cfAlinhar(m, btn, n) {
  if (!window.confirm('Mover ' + n + (n === 1 ? ' card' : ' cards') + ' para a coluna que o Fluxo mostra? Isso muda a posição deles nos Pipelines e fica no histórico dos cards.')) return;
  btn.setAttribute('disabled', 'true'); btn.textContent = 'Alinhando…';
  api('POST', '/conferencia/alinhar', {}).then(function (r) {
    CF.d = r.conferencia; CF.t = Date.now(); cfAtualizarBotoes();
    if (typeof FV !== 'undefined') { FV.dados = null; }
    aviso(r.movidos + (r.movidos === 1 ? ' card alinhado ao Fluxo.' : ' cards alinhados ao Fluxo.') + (r.ignorados.length ? ' ' + r.ignorados.length + ' não puderam ser movidos.' : ''), r.movidos ? 'ok' : 'aviso');
    limpar(m.corpo); kids(m.corpo, cfCorpo(CF.d, m));
    carregar(true).catch(function () { /* a tela se atualiza na próxima */ });
  }).catch(function (e) { aviso(e.message, 'erro'); btn.removeAttribute('disabled'); btn.textContent = 'Alinhar ao Fluxo'; });
}
function abrirConferencia() {
  var m = modal({ cabecalho: [h('h2', { text: 'Conferência: Pipelines × Fluxo' }), h('p', { text: 'Onde os números do Fluxo e dos Pipelines diferem, e por quê.' })], corpo: [h('div', { class: 'it-carrega' }, [h('i'), h('i'), h('i')])], largura: 1040, classe: 'cf-m' });
  cfPedir(true).then(function (d) { limpar(m.corpo); kids(m.corpo, cfCorpo(d, m)); }).catch(function (e) { limpar(m.corpo); kids(m.corpo, [vazio('Não consegui conferir agora', e.message)]); });
}
`;
