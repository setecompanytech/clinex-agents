// JavaScript do CRM (navegador): aba "Respostas e fila" do IA Manager. Dados de /painel/crm/api/disparo-auto (src/crm/disparo-auto-servico.ts).
// Dentro dele não usar crases nem "dollar-chave".
export const ia = String.raw`
var IA_C = {};
var IA_ST = { pronto: ['Pronta para enviar', 'pl-ok'], espera: ['Aguardando o horário', 'pl-hoje'], pulado: ['Não envia', 'pl-atrasada'] };

function pedirIA() {
  var k = perChave(), c = IA_C[k];
  if (c && Date.now() - c.t < 20000) return c.d;
  if (!c || !c.carregando) {
    IA_C[k] = { t: c ? c.t : 0, d: c ? c.d : null, carregando: true };
    api('GET', '/disparo-auto?' + perQs()).then(function (d) { IA_C[k] = { t: Date.now(), d: d, carregando: false }; if (S.aba === 'iamanager') desenhar(true); })
      .catch(function (e) { IA_C[k] = { t: Date.now(), d: c ? c.d : null, carregando: false }; aviso('Não consegui carregar a IA de disparo: ' + e.message, 'erro'); });
  }
  return c ? c.d : null;
}
function kpisIA(D) {
  var p = D.periodo;
  return h('div', { class: 'kpis2 seis' }, [
    kpi2({ rotulo: 'Enviadas pela IA', valor: nf0.format(p.enviadosIA), sub: 'hoje: ' + D.hoje.enviadosIA }),
    kpi2({ rotulo: 'Simuladas (sombra)', valor: nf0.format(p.simulados), sub: 'hoje: ' + D.hoje.simulados }),
    kpi2({ rotulo: 'Enviadas pela equipe', valor: nf0.format(p.enviadosEquipe), sub: 'disparos manuais' }),
    kpi2({ rotulo: 'Respostas', valor: nf0.format(p.respostas), sub: 'hoje: ' + D.hoje.respostas }),
    kpi2({ rotulo: 'Taxa de resposta', valor: p.taxaResposta === null ? '–' : String(p.taxaResposta).replace('.', ',') + '%', sub: 'respostas ÷ envios' }),
    kpi2({ rotulo: 'Respostas rastreadas', valor: nf0.format(p.respostasRastreadas), sub: 'com texto e intenção' })
  ]);
}
function listaRespostasIA(D) {
  var filtro = IA_C.filtro || '';
  var chips = h('div', { class: 'chips-f', role: 'group', 'aria-label': 'Filtrar respostas' }, [{ intencao: '', rotulo: 'Todas', n: D.respostas.length }].concat(D.porIntencao).map(function (x) {
    return h('button', { class: 'chip-f', type: 'button', 'aria-pressed': String(filtro === x.intencao), text: x.rotulo + ' (' + x.n + ')', onclick: function () { IA_C.filtro = x.intencao; desenhar(true); } });
  }));
  var itens = D.respostas.filter(function (r) { return !filtro || r.intencao === filtro; });
  var corpo = itens.length ? h('div', { class: 'ia-resp' }, itens.slice(0, 60).map(function (r) {
    return h('button', { type: 'button', class: 'ia-r', onclick: function () { abrirLead(r.leadId); } }, [
      avatar(r.nome),
      h('div', { class: 'ia-r-c' }, [
        h('div', { class: 'ia-r-t' }, [h('b', { text: r.nome }), h('span', { class: 'mut peq', text: qDiaHora(r.quando) + (r.msg ? ' · respondeu à Msg ' + r.msg : '') })]),
        h('p', { text: r.texto ? '“' + r.texto + '”' : 'Sem texto' })
      ]),
      pill(r.rotulo, r.intencao === 'sem_interesse' ? 'pl-atrasada' : r.intencao === 'agendar' || r.intencao === 'ainda_quer' ? 'pl-ok' : 'pl-hoje')
    ]);
  })) : vazio('Nenhuma resposta no período', 'Quando um paciente responder a um disparo, a resposta aparece aqui, com o que ele quis dizer.');
  return blocoCartao('Respostas dos pacientes', 'Tudo o que foi respondido depois de um disparo, da mais recente para a mais antiga.', h('div', null, [chips, corpo]), 7);
}
function filaIA(D) {
  var linhas = D.fila.length ? h('div', { class: 'tabela-w' }, h('table', { class: 'tabela fv-tab' }, [
    h('thead', null, h('tr', null, ['Lead', 'Passo', 'Situação'].map(function (t) { return h('th', { scope: 'col', text: t }); }))),
    h('tbody', null, D.fila.slice(0, 40).map(function (x) {
      var st = IA_ST[x.situacao];
      return h('tr', { class: 'clic', tabindex: '0', onclick: function () { abrirLead(x.leadId); } }, [
        h('td', null, h('b', { text: x.nome })), h('td', { text: 'Msg ' + x.msg + ' · ' + x.passo + (x.hora ? ' · ' + x.hora : '') }),
        h('td', null, [pill(st[0], st[1]), x.motivo ? h('small', { class: 'mut', text: ' ' + x.motivo }) : null])
      ]);
    }))
  ])) : vazio('Nada para a IA agora', 'Só entram aqui os leads com um passo automático vencendo hoje.');
  return blocoCartao('Fila de agora', 'Quem a IA enviaria agora, na ordem do guia, e quem ficou de fora e por quê.', linhas, 5);
}
function mensagensIA(D) {
  if (!D.porMensagem.length) return null;
  var max = Math.max.apply(null, D.porMensagem.map(function (m) { return m.enviadas; }).concat([1]));
  return blocoCartao('Resposta por mensagem', 'Quantas vezes cada mensagem foi enviada e respondida no período.', barras(D.porMensagem.map(function (m) {
    return { rotulo: 'Msg ' + m.n + ' · ' + m.titulo, valor: m.enviadas, texto: m.enviadas + ' env · ' + m.respostas + ' resp', extra: m.taxa === null ? '–' : String(m.taxa).replace('.', ',') + '%', cor: 'var(--g1)' };
  }), { max: max, vazio: 'Sem envios' }), 5);
}
/** Conteúdo da aba "Respostas e fila" (o cabeçalho, o Power e as abas ficam no IA Manager). */
function corpoIA() {
  var D = pedirIA();
  if (!D) return esqueleto();
  return h('div', { class: 'hoje' }, [kpisIA(D),
    h('div', { class: 'g12' }, [listaRespostasIA(D), h('div', { class: 'col-dir sp5' }, [filaIA(D), mensagensIA(D)])])
  ]);
}
`;
