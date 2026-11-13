// JavaScript do CRM (navegador): tela "IA de disparo". Dados de /painel/crm/api/disparo-auto (src/crm/disparo-auto-servico.ts).
// Dentro dele não usar crases nem "dollar-chave".
export const ia = String.raw`
var IA_C = {};
var IA_MODOS = [
  { id: 'desligado', r: 'Desligada', d: 'Não faz nada. Os disparos voltam a ser todos manuais.' },
  { id: 'sombra', r: 'Modo sombra', d: 'Decide e anota o que enviaria, sem enviar nada. Para conferir os números antes de liberar.' },
  { id: 'ligado', r: 'Ligada', d: 'Envia de verdade, sozinha, no horário de cada passo, sob as travas do disparo.' }
];
var IA_ST = { pronto: ['Pronta para enviar', 'pl-ok'], espera: ['Aguardando o horário', 'pl-hoje'], pulado: ['Não envia', 'pl-atrasada'] };

function pedirIA() {
  var k = perChave(), c = IA_C[k];
  if (c && Date.now() - c.t < 20000) return c.d;
  if (!c || !c.carregando) {
    IA_C[k] = { t: c ? c.t : 0, d: c ? c.d : null, carregando: true };
    api('GET', '/disparo-auto?' + perQs()).then(function (d) { IA_C[k] = { t: Date.now(), d: d, carregando: false }; if (S.aba === 'ia') desenhar(true); })
      .catch(function (e) { IA_C[k] = { t: Date.now(), d: c ? c.d : null, carregando: false }; aviso('Não consegui carregar a IA de disparo: ' + e.message, 'erro'); });
  }
  return c ? c.d : null;
}
function trocarModoIA(modo) {
  if (modo === 'ligado' && !window.confirm('Ligar o envio automático? A IA vai passar a mandar mensagens REAIS para pacientes, sozinha, no horário de cada passo da cadência. Você pode pausar a qualquer momento.')) return;
  api('PUT', '/disparo-auto', { modo: modo }).then(function () { IA_C = {}; aviso(modo === 'desligado' ? 'IA desligada.' : modo === 'sombra' ? 'IA em modo sombra: nada será enviado.' : 'IA ligada.', 'ok'); desenhar(true); })
    .catch(function (e) { aviso(e.message, 'erro'); });
}
function rodarIAAgora(btn) {
  btn.setAttribute('disabled', 'true');
  api('POST', '/disparo-auto/rodar').then(function (r) {
    IA_C = {};
    if (r.pulou) aviso(r.pulou, 'erro');
    else aviso('Rodada feita: ' + r.rodada.enviados + ' enviadas, ' + r.rodada.sombra + ' simuladas, ' + r.rodada.erros + ' com erro.', 'ok');
    desenhar(true);
  }).catch(function (e) { aviso(e.message, 'erro'); btn.removeAttribute('disabled'); });
}
function cartaoModoIA(D) {
  var botoes = IA_MODOS.map(function (m) {
    var on = D.modo === m.id;
    return h('button', { type: 'button', class: 'ia-modo' + (on ? ' on' : '') + ' ia-' + m.id, 'aria-pressed': String(on), disabled: D.forcadoPeloAmbiente && m.id !== 'desligado', onclick: function () { if (!on) trocarModoIA(m.id); } }, [h('b', { text: m.r }), h('small', { text: m.d })]);
  });
  var avisos = [];
  if (D.forcadoPeloAmbiente) avisos.push(h('p', { class: 'callout aviso', text: 'A IA está travada em "desligada" pelo ambiente (DISPARO_AUTO=desligado).' }));
  if (!D.disparo.ativo) avisos.push(h('p', { class: 'callout aviso', text: 'O envio de WhatsApp está desligado neste ambiente (DISPARO_WHATSAPP). No modo ligado a IA não envia nada.' }));
  else if (D.disparo.restrito && D.modo === 'ligado') avisos.push(h('p', { class: 'callout aviso', text: 'Fase de testes: só os números de teste recebem. Para liberar para todos, o administrador ativa DISPARO_LIBERADO.' }));
  var quem = D.alteradoPor ? 'Modo definido por ' + D.alteradoPor + ' em ' + qDiaHora(D.alteradoEm) + '.' : 'Ninguém mudou o modo ainda.';
  return h('section', { class: 'cartao ia-cab' }, [
    h('header', { class: 'card-h' }, [h('div', null, [h('h3', { text: 'Como a IA está agora' }), h('p', { text: quem })])]),
    h('div', { class: 'ia-modos' }, botoes), avisos.length ? h('div', null, avisos) : null
  ]);
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
function rodadaIA(D) {
  var r = D.ultimaRodada;
  if (!r) return blocoCartao('Última rodada', 'A IA ainda não rodou.', vazio('Sem rodadas ainda', 'Quando o agendador chamar a IA (ou você clicar em "Rodar agora"), o resultado aparece aqui.'), 5);
  var pul = Object.keys(r.pulados).map(function (k) { return [k, r.pulados[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
  return blocoCartao('Última rodada', qDiaHora(r.quando) + ' · modo ' + (r.modo === 'ligado' ? 'ligada' : r.modo === 'sombra' ? 'sombra' : 'desligada'), h('div', null, [
    h('div', { class: 'stat2' }, [h('div', null, [h('small', { text: 'Avaliados' }), h('b', { text: String(r.avaliados) })]), h('div', null, [h('small', { text: 'Enviados' }), h('b', { class: r.enviados ? 'ok' : '', text: String(r.enviados) })]), h('div', null, [h('small', { text: 'Simulados' }), h('b', { text: String(r.sombra) })]), h('div', null, [h('small', { text: 'Erros' }), h('b', { class: r.erros ? 'ruim' : '', text: String(r.erros) })])]),
    pul.length ? h('ul', { class: 'lista-o ia-pul' }, pul.slice(0, 8).map(function (p) { return h('li', null, [h('b', { text: p[1] + ' ' }), p[0]]); })) : null
  ]), 5);
}
function mensagensIA(D) {
  if (!D.porMensagem.length) return null;
  var max = Math.max.apply(null, D.porMensagem.map(function (m) { return m.enviadas; }).concat([1]));
  return blocoCartao('Resposta por mensagem', 'Quantas vezes cada mensagem foi enviada e respondida no período.', barras(D.porMensagem.map(function (m) {
    return { rotulo: 'Msg ' + m.n + ' · ' + m.titulo, valor: m.enviadas, texto: m.enviadas + ' env · ' + m.respostas + ' resp', extra: m.taxa === null ? '–' : String(m.taxa).replace('.', ',') + '%', cor: 'var(--g1)' };
  }), { max: max, vazio: 'Sem envios' }), 5);
}
function telaIA() {
  var D = pedirIA();
  var cab = cabecalhoTela('IA de disparo', 'A IA envia sozinha as mensagens da cadência e registra tudo o que o paciente responde. Ela só escreve, não conversa: quem responde ao paciente é a equipe.', h('div', { class: 'tela-ac' }, [
    D && D.modo !== 'desligado' ? botao('Rodar agora', '', function (e) { rodarIAAgora(e.currentTarget); }, 'bolt') : null
  ]));
  if (!D) return h('div', { class: 'tela' }, [cab, esqueleto()]);
  return h('div', { class: 'tela hoje' }, [cab, cartaoModoIA(D), kpisIA(D),
    h('div', { class: 'g12' }, [listaRespostasIA(D), h('div', { class: 'col-dir sp5' }, [filaIA(D), rodadaIA(D), mensagensIA(D)])])
  ]);
}
`;
