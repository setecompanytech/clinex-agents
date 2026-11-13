// JavaScript do CRM (navegador): página "IA Manager", o painel de controle da IA de disparo. Dados de /painel/crm/api/ia-manager.
// Dentro dele não usar crases nem "dollar-chave".
export const manager = String.raw`
var MG = { aba: 'controle', d: null, c: null, base: null, car: false, t: 0, erro: '', salvando: false, entrou: false, simQ: '', sim: null, simCar: false };
var MG_PAL = ['#4cc9f0', '#a78bfa', '#f5b942', '#fb7185', '#2ee6a6'];
var MG_DIAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'], MG_DIAS_L = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
var MG_TXT = {
  desligado: ['IA desligada', 'Nada é enviado sozinho. Todos os disparos voltam a ser manuais, pela equipe.'],
  sombra: ['Observando em modo sombra', 'A IA decide e anota o que enviaria, sem enviar nada. Ideal para conferir antes de liberar.'],
  ligado: ['IA ligada e disparando', 'Envia sozinha, no horário de cada gatilho, sempre sob as travas do guia.']
};
var mgClone = function (o) { return JSON.parse(JSON.stringify(o)); };
function mgSujo() { return !!(MG.c && MG.base) && JSON.stringify(MG.c) !== JSON.stringify(MG.base); }

function mgPedir(forcar) {
  if (MG.car) return;
  if (!forcar && MG.d && Date.now() - MG.t < 15000) return;
  MG.car = true;
  api('GET', '/ia-manager').then(function (d) {
    MG.d = d; MG.t = Date.now(); MG.car = false;
    if (!mgSujo()) { MG.c = mgClone(d.config); MG.base = mgClone(d.config); }
    if (S.aba === 'iamanager') desenhar(true);
  }).catch(function (e) { MG.car = false; MG.t = Date.now(); aviso('Não consegui carregar o IA Manager: ' + e.message, 'erro'); });
}
setInterval(function () { if (S.aba === 'iamanager' && document.visibilityState === 'visible' && !digitando()) mgPedir(true); }, 20000);

/* ------------------------------------------------------------------ Power e modos */
function mgDefinirModo(modo) {
  if (modo === 'ligado' && !window.confirm('Ligar o envio automático? A IA vai mandar mensagens REAIS para pacientes, sozinha, no horário de cada gatilho. Você pode desligar a qualquer momento no botão Power.')) return;
  api('PUT', '/disparo-auto', { modo: modo }).then(function () {
    aviso(modo === 'desligado' ? 'IA desligada.' : modo === 'sombra' ? 'IA em modo sombra: nada será enviado.' : 'IA ligada.', 'ok');
    IA_C = {}; MG.t = 0; mgPedir(true);
  }).catch(function (e) { aviso(e.message, 'erro'); });
}
function mgPower(D) {
  if (D.forcadoPeloAmbiente) { aviso('A IA está travada em desligada pelo ambiente (DISPARO_AUTO=desligado).', 'erro'); return; }
  if (D.modo === 'desligado') mgDefinirModo(lerLS('crm-ia-modo') === 'ligado' ? 'ligado' : 'sombra');
  else { gravarLS('crm-ia-modo', D.modo); mgDefinirModo('desligado'); }
}
function mgSvgPower() {
  return sv('svg', { viewBox: '0 0 24 24', width: 46, height: 46, fill: 'none', stroke: 'currentColor', 'stroke-width': '2.1', 'stroke-linecap': 'round', 'aria-hidden': 'true' }, [sv('path', { d: 'M12 3.2v8.2' }), sv('path', { d: 'M6.6 6.9a8.1 8.1 0 1 0 10.8 0' })]);
}
var MG_PART = [[8, 22, 0], [18, 68, 1.2], [30, 40, 2.4], [44, 80, .6], [58, 18, 1.8], [70, 62, 3], [82, 30, .9], [92, 74, 2.1], [14, 46, 3.4], [64, 88, 1.5], [88, 12, 2.7], [38, 10, 3.8]];

function mgContador(rotulo, valor, sub, cls, fmt) {
  var n = h('b', { class: 'mg-cn', text: '0' });
  if (MG.animar) contar(n, valor, fmt || function (v) { return nf0.format(Math.round(v)); }); else n.textContent = (fmt || function (v) { return nf0.format(Math.round(v)); })(valor);
  return h('div', { class: 'mg-c ' + (cls || '') }, [h('small', { text: rotulo }), n, sub ? h('span', { text: sub }) : null]);
}
function mgHero(D) {
  var modo = D.modo, ativo = modo !== 'desligado', t = MG_TXT[modo];
  var orbe = h('button', { type: 'button', class: 'mg-orbe', 'aria-pressed': String(ativo), 'aria-label': ativo ? 'Desligar a IA' : 'Ligar a IA', title: ativo ? 'Clique para desligar a IA' : 'Clique para ligar a IA', onclick: function () { mgPower(D); } }, [
    h('i', { class: 'mg-anel a1' }), h('i', { class: 'mg-anel a2' }), h('i', { class: 'mg-onda o1' }), h('i', { class: 'mg-onda o2' }), h('i', { class: 'mg-onda o3' }), h('i', { class: 'mg-varre' }),
    h('span', { class: 'mg-nucleo' }, [mgSvgPower(), h('b', { text: modo === 'ligado' ? 'LIGADA' : modo === 'sombra' ? 'SOMBRA' : 'DESLIGADA' })])
  ]);
  var seg = h('div', { class: 'mg-modos', role: 'group', 'aria-label': 'Modo de operação' }, [['sombra', 'Modo sombra', 'só observa'], ['ligado', 'Ligada', 'envia de verdade']].map(function (m) {
    return h('button', { type: 'button', class: 'mg-modo' + (D.modo === m[0] ? ' on' : ''), 'aria-pressed': String(D.modo === m[0]), disabled: D.forcadoPeloAmbiente, onclick: function () { if (D.modo !== m[0]) mgDefinirModo(m[0]); } }, [h('b', { text: m[1] }), h('small', { text: m[2] })]);
  }));
  var min = D.minutosDesdeUltimaRodada, bat = 'off', batT = 'Ainda não rodou';
  if (min !== null) { batT = 'Última rodada há ' + (min < 1 ? 'menos de 1 min' : min + ' min'); bat = !ativo ? 'off' : min <= 20 ? 'ok' : min <= 60 ? 'at' : 'ruim'; }
  var alertaAgend = ativo && D.agoraBrt.minutos >= D.config.janela.inicio * 60 && D.agoraBrt.minutos < D.config.janela.fim * 60 && (min === null || min > 60);
  var p = D.proximo, prox;
  if (!ativo) prox = ['Sem disparos programados', 'Ligue a IA para ela voltar a trabalhar.'];
  else if (p.tipo === 'agora') prox = ['Pronta para enviar agora', p.gatilho + ' · assim que o agendador chamar a próxima rodada'];
  else if (p.tipo === 'hoje') prox = ['Próximo disparo em ' + (p.minutos >= 60 ? Math.floor(p.minutos / 60) + 'h' + (p.minutos % 60 ? String(p.minutos % 60).padStart(2, '0') : '') : p.minutos + ' min'), p.gatilho + ' às ' + p.hora];
  else if (p.tipo === 'amanha') prox = ['Nada mais para hoje', 'Próximo gatilho: ' + p.gatilho + ' amanhã às ' + p.hora];
  else prox = ['Nenhum gatilho ligado', 'Ligue pelo menos um gatilho abaixo.'];
  var avisos = [];
  if (D.forcadoPeloAmbiente) avisos.push(h('span', { class: 'mg-av ruim', text: 'Travada pelo ambiente (DISPARO_AUTO=desligado)' }));
  if (!D.disparo.ativo) avisos.push(h('span', { class: 'mg-av at', text: 'WhatsApp desligado neste ambiente (DISPARO_WHATSAPP)' }));
  else if (D.disparo.restrito) avisos.push(h('span', { class: 'mg-av at', text: 'Fase de testes: só números de teste recebem' }));
  var lim = D.hoje.limiteDia;
  var anel = h('div', { class: 'mg-prog', style: '--p:' + Math.min(100, Math.round(D.hoje.enviadosIA / Math.max(1, lim) * 100)) }, [h('b', { text: nf0.format(D.hoje.enviadosIA) }), h('small', { text: 'de ' + nf0.format(lim) })]);
  return h('section', { class: 'mg-hero mg-sec', style: '--i:0' }, [
    h('div', { class: 'mg-part', 'aria-hidden': 'true' }, MG_PART.map(function (q) { return h('i', { style: 'left:' + q[0] + '%;top:' + q[1] + '%;animation-delay:' + q[2] + 's' }); })),
    h('div', { class: 'mg-hero-e' }, [orbe, seg]),
    h('div', { class: 'mg-hero-d' }, [
      h('div', { class: 'mg-hero-t' }, [h('small', { class: 'mg-eyebrow', text: 'CENTRO DE COMANDO · ' + D.agoraBrt.dia.toUpperCase() + ' ' + D.agoraBrt.hora }), h('h2', { text: t[0] }), h('p', { text: t[1] })]),
      h('div', { class: 'mg-estado' }, [
        h('span', { class: 'mg-bat ' + bat }, [h('i'), batT]),
        h('span', { class: 'mg-prox' }, [h('b', { text: prox[0] }), h('small', { text: prox[1] })])
      ].concat(avisos)),
      alertaAgend ? h('p', { class: 'callout aviso', text: 'Nenhuma rodada nos últimos minutos. A IA só trabalha quando um agendador chama /cron/disparo: confirme com a equipe técnica que ele está configurado.' }) : null,
      h('div', { class: 'mg-conts' }, [
        h('div', { class: 'mg-c mg-c-prog' }, [h('small', { text: 'Enviadas hoje' }), anel, h('span', { text: 'limite diário' })]),
        mgContador('Na fila agora', D.hoje.fila, 'prontas para enviar', D.hoje.fila ? 'quente' : ''),
        mgContador('Respostas hoje', D.hoje.respostas, 'rastreadas', ''),
        mgContador('Simuladas hoje', D.hoje.simulados, 'modo sombra', '')
      ]),
      h('div', { class: 'mg-acoes' }, ativo ? [botao('Rodar agora', 'pri', function (e) { var b = e.currentTarget; b.setAttribute('disabled', 'true'); api('POST', '/disparo-auto/rodar').then(function (r) { IA_C = {}; if (r.pulou) aviso(r.pulou, 'erro'); else aviso('Rodada feita: ' + r.rodada.enviados + ' enviadas, ' + r.rodada.sombra + ' simuladas, ' + r.rodada.erros + ' com erro.', 'ok'); MG.t = 0; mgPedir(true); }).catch(function (er) { aviso(er.message, 'erro'); b.removeAttribute('disabled'); }); }, 'bolt')] : [])
    ])
  ]);
}

/* ------------------------------------------------------------------ linha do tempo do dia */
function mgLinha(D) {
  var C = MG.c, INI = 360, FIM = 1260, pc = function (min) { return Math.max(0, Math.min(100, (min - INI) / (FIM - INI) * 100)); };
  var hm = function (s) { return Number(s.slice(0, 2)) * 60 + Number(s.slice(3)); };
  var trilho = h('div', { class: 'mg-trilho' }, [
    h('div', { class: 'mg-t-guia', style: 'left:' + pc(D.guia.inicio * 60) + '%;width:' + (pc(D.guia.fim * 60) - pc(D.guia.inicio * 60)) + '%', title: 'Regra do guia: contato só entre ' + D.guia.inicio + 'h e ' + D.guia.fim + 'h' }),
    h('div', { class: 'mg-t-ia', style: 'left:' + pc(C.janela.inicio * 60) + '%;width:' + (pc(C.janela.fim * 60) - pc(C.janela.inicio * 60)) + '%', title: 'Janela da IA: ' + C.janela.inicio + 'h às ' + C.janela.fim + 'h' })
  ]);
  var pausaHoje = C.pausas.filter(function (x) { return D.agoraBrt.hoje >= x.de && D.agoraBrt.hoje <= x.ate; })[0];
  var diaOk = C.diasSemana.indexOf(new Date(D.agoraBrt.hoje + 'T12:00:00Z').getUTCDay()) >= 0;
  if (pausaHoje || !diaOk) trilho.appendChild(h('div', { class: 'mg-t-pausa', text: pausaHoje ? 'Em pausa' + (pausaHoje.motivo ? ': ' + pausaHoje.motivo : '') : 'A IA não envia na ' + D.agoraBrt.dia }));
  var ticks = [];
  for (var hh = 6; hh <= 21; hh += (hh % 3 === 0 ? 1 : 1)) ticks.push(h('span', { class: 'mg-tick' + (hh % 3 === 0 ? ' g' : ''), style: 'left:' + pc(hh * 60) + '%' }, hh % 3 === 0 ? h('em', { text: String(hh).padStart(2, '0') + 'h' }) : null));
  var marcadores = [], usados = [];
  D.gatilhos.forEach(function (g, i) {
    var gc = C.gatilhos[g.id], x = pc(hm(gc.hora)), linha = 0;
    while (usados.some(function (u) { return u.l === linha && Math.abs(u.x - x) < 11; })) linha++;
    usados.push({ x: x, l: linha });
    var passou = hm(gc.hora) <= D.agoraBrt.minutos, feito = g.enviadosHoje + g.simuladosHoje > 0;
    marcadores.push(h('div', { class: 'mg-pino' + (gc.ativo ? '' : ' off') + (passou ? ' passou' : ''), style: 'left:' + x + '%;--gc:' + MG_PAL[i] + ';--l:' + linha }, [
      h('div', { class: 'mg-pino-r' }, [h('b', { text: 'Msg ' + g.msg }), h('span', { text: g.rotulo }), h('small', { text: gc.hora + (feito ? ' · ' + g.enviadosHoje + ' env' : g.fila.prontos ? ' · ' + g.fila.prontos + ' prontos' : g.fila.esperando ? ' · ' + g.fila.esperando + ' aguardando' : '') })]),
      h('i', { class: 'mg-pino-h' }), h('i', { class: 'mg-pino-p' })
    ]));
  });
  var agora = h('div', { class: 'mg-agora', style: 'left:' + pc(D.agoraBrt.minutos) + '%' }, [h('em', { text: D.agoraBrt.hora }), h('i')]);
  return h('section', { class: 'mg-sec mg-linha', style: '--i:1' }, [
    h('header', { class: 'mg-sh' }, [h('div', null, [h('h3', { text: 'Agenda de hoje' }), h('p', { text: 'Cada gatilho no seu horário. A faixa clara é a janela do guia (8h às 19h); a brilhante é a janela da IA.' })]), h('div', { class: 'mg-leg' }, [h('span', { class: 'g', text: 'Guia' }), h('span', { class: 'i', text: 'Janela da IA' }), h('span', { class: 'a', text: 'Agora' })])]),
    h('div', { class: 'mg-lin-w' }, [h('div', { class: 'mg-lin' }, [trilho].concat(ticks, marcadores, [agora]))])
  ]);
}

/* ------------------------------------------------------------------ gatilhos */
function mgSwitch(on, aoMudar, rotulo) {
  var i = h('input', { type: 'checkbox', 'aria-label': rotulo }); i.checked = !!on; i.addEventListener('change', function () { aoMudar(i.checked); });
  return h('label', { class: 'mg-sw' + (on ? ' on' : ''), title: rotulo }, [i, h('i', { 'aria-hidden': 'true' })]);
}
function mgSegmento(opcoes, atual, aoMudar, rotulo) {
  return h('div', { class: 'mg-seg', role: 'group', 'aria-label': rotulo }, opcoes.map(function (o) { return h('button', { type: 'button', class: o === atual ? 'on' : '', 'aria-pressed': String(o === atual), text: o, onclick: function () { if (o !== atual) aoMudar(o); } }); }));
}
function mgMudar(fn) { fn(); MG.erro = ''; desenhar(true); }
function mgNum(valor, ph, aoMudar, rotulo) {
  var i = h('input', { class: 'in mg-in', type: 'number', min: '0', step: '10', placeholder: ph, 'aria-label': rotulo });
  i.value = valor === undefined || valor === null ? '' : String(valor);
  i.addEventListener('change', function () { aoMudar(i.value === '' ? null : Number(i.value)); });
  return i;
}
function mgCartaoGatilho(D, g, idx) {
  var c = MG.c.gatilhos[g.id], b = MG.base.gatilhos[g.id], mudou = JSON.stringify(c) !== JSON.stringify(b), cor = MG_PAL[idx % MG_PAL.length];
  var hora = h('input', { class: 'in mg-hora', type: 'time', min: '08:00', max: '18:59', step: '300', 'aria-label': 'Horário do disparo de ' + g.rotulo }); hora.value = c.hora;
  hora.addEventListener('change', function () { if (hora.value) mgMudar(function () { c.hora = hora.value; }); });
  var vistoU = {}; (c.unidades || []).forEach(function (u) { vistoU[u] = 1; });
  var chipsU = [h('button', { type: 'button', class: 'mg-chip' + (!(c.unidades || []).length ? ' on' : ''), text: 'Todas', onclick: function () { mgMudar(function () { delete c.unidades; }); } })].concat(D.unidades.map(function (u) {
    var on = !!vistoU[u];
    return h('button', { type: 'button', class: 'mg-chip' + (on ? ' on' : ''), 'aria-pressed': String(on), text: u.replace(/^CLINEX\s+/i, ''), title: u, onclick: function () { mgMudar(function () { var l = (c.unidades || []).slice(); var k = l.indexOf(u); if (k >= 0) l.splice(k, 1); else l.push(u); if (l.length) c.unidades = l; else delete c.unidades; }); } });
  }));
  var f = g.fila, tot = Math.max(1, f.prontos + f.esperando + f.pulados);
  var params = [];
  if (g.id === 'desconto') params.push(h('div', { class: 'mg-campo' }, [h('label', { text: 'Desconto oferecido' }), mgSegmento(['10%', '5%'], c.desconto || '10%', function (v) { mgMudar(function () { c.desconto = v; }); }, 'Desconto')]));
  if (g.id === 'tentativa') params.push(h('div', { class: 'mg-campo' }, [h('label', { text: 'Prazo citado na mensagem' }), mgSegmento(['hoje', 'esta semana', 'este mês'], c.prazo || 'esta semana', function (v) { mgMudar(function () { c.prazo = v; }); }, 'Prazo')]));
  var el = h('article', { class: 'mg-g mg-sec' + (c.ativo ? '' : ' off') + (mudou ? ' mudou' : ''), style: '--i:' + (idx + 2) + ';--gc:' + cor }, [
    h('header', { class: 'mg-g-h' }, [
      h('span', { class: 'mg-g-n', text: String(g.msg) }),
      h('div', { class: 'mg-g-t' }, [h('b', { text: g.rotulo }), h('small', { text: g.quando })]),
      mgSwitch(c.ativo, function (v) { mgMudar(function () { c.ativo = v; }); }, (c.ativo ? 'Desligar ' : 'Ligar ') + g.rotulo)
    ]),
    h('div', { class: 'mg-g-corpo' }, [
      h('div', { class: 'mg-campo mg-hora-c' }, [h('label', { text: 'Horário do disparo' }), h('div', { class: 'mg-hora-l' }, [hora, c.hora !== g.horaGuia ? h('button', { type: 'button', class: 'mg-lnk', text: 'padrão do guia ' + g.horaGuia, onclick: function () { mgMudar(function () { c.hora = g.horaGuia; }); } }) : h('small', { text: 'horário do guia' })])])
    ].concat(params, [
      h('div', { class: 'mg-campo' }, [h('label', { text: 'Condições: só envia se o lead tiver' }), h('div', { class: 'mg-par' }, [h('span', null, ['valor de ', mgNum(c.valorMin, 'R$ mín.', function (v) { mgMudar(function () { if (v === null) delete c.valorMin; else c.valorMin = v; }); }, 'Valor mínimo')]), h('span', null, ['até ', mgNum(c.valorMax, 'R$ máx.', function (v) { mgMudar(function () { if (v === null) delete c.valorMax; else c.valorMax = v; }); }, 'Valor máximo')])])]),
      h('div', { class: 'mg-campo' }, [h('label', { text: 'Unidades' }), h('div', { class: 'mg-chips' }, chipsU)])
    ])),
    h('footer', { class: 'mg-g-f' }, [
      h('div', { class: 'mg-fila', title: f.prontos + ' prontos · ' + f.esperando + ' aguardando o horário · ' + f.pulados + ' fora das regras' }, [h('i', { class: 'p', style: 'width:' + (f.prontos / tot * 100) + '%' }), h('i', { class: 'e', style: 'width:' + (f.esperando / tot * 100) + '%' }), h('i', { class: 'x', style: 'width:' + (f.pulados / tot * 100) + '%' })]),
      h('div', { class: 'mg-g-st' }, [h('span', null, [h('b', { text: String(f.prontos) }), ' prontos']), h('span', null, [h('b', { text: String(f.esperando) }), ' aguardando']), h('span', null, [h('b', { text: String(f.pulados) }), ' fora']), h('span', { class: 'dir' }, [h('b', { text: String(g.enviadosHoje) }), ' env · ', h('b', { text: String(g.respostasHoje) }), ' resp hoje'])]),
      g.motivos.length ? h('ul', { class: 'mg-mot' }, g.motivos.map(function (m) { return h('li', null, [h('b', { text: m.n + ' ' }), m.motivo]); })) : null
    ])
  ]);
  return el;
}
function mgGatilhos(D) {
  return h('section', { class: 'mg-bloco' }, [
    h('header', { class: 'mg-sh mg-sec', style: '--i:2' }, [h('div', null, [h('h3', { text: 'Gatilhos' }), h('p', { text: 'Cada passo da cadência que a IA pode enviar sozinha. Ligue, mude o horário e defina para quem ela envia. O horário só vale no dia em que o passo vence.' })])]),
    h('div', { class: 'mg-grade' }, D.gatilhos.map(function (g, i) { return mgCartaoGatilho(D, g, i); }))
  ]);
}

/* ------------------------------------------------------------------ ajustes globais */
function mgStepper(valor, min, max, passo, aoMudar, sufixo, rotulo) {
  var i = h('input', { class: 'in mg-in', type: 'number', min: String(min), max: String(max), step: String(passo), 'aria-label': rotulo }); i.value = String(valor);
  i.addEventListener('change', function () { var v = Math.max(min, Math.min(max, Math.round(Number(i.value) || min))); aoMudar(v); });
  return h('div', { class: 'mg-step' }, [h('button', { type: 'button', 'aria-label': 'Diminuir', text: '−', onclick: function () { aoMudar(Math.max(min, valor - passo)); } }), i, h('button', { type: 'button', 'aria-label': 'Aumentar', text: '+', onclick: function () { aoMudar(Math.min(max, valor + passo)); } }), sufixo ? h('small', { text: sufixo }) : null]);
}
function mgGlobais(D) {
  var C = MG.c;
  var rIni = h('input', { type: 'range', min: String(D.guia.inicio), max: String(D.guia.fim - 1), step: '1', 'aria-label': 'Início da janela' }); rIni.value = C.janela.inicio;
  var rFim = h('input', { type: 'range', min: String(D.guia.inicio + 1), max: String(D.guia.fim), step: '1', 'aria-label': 'Fim da janela' }); rFim.value = C.janela.fim;
  var rot = h('b', { class: 'mg-jan-v', text: C.janela.inicio + 'h às ' + C.janela.fim + 'h' });
  var fx = h('i', { style: 'left:' + ((C.janela.inicio - 8) / 11 * 100) + '%;width:' + ((C.janela.fim - C.janela.inicio) / 11 * 100) + '%' });
  var vivo = function () { var a = Number(rIni.value), b = Number(rFim.value); if (a >= b) { if (this === rIni) { a = b - 1; rIni.value = a; } else { b = a + 1; rFim.value = b; } } rot.textContent = a + 'h às ' + b + 'h'; fx.style.left = ((a - 8) / 11 * 100) + '%'; fx.style.width = ((b - a) / 11 * 100) + '%'; };
  rIni.addEventListener('input', vivo); rFim.addEventListener('input', vivo);
  var commit = function () { var a = Number(rIni.value), b = Number(rFim.value); if (a >= b) return; mgMudar(function () { C.janela = { inicio: a, fim: b }; }); };
  rIni.addEventListener('change', commit); rFim.addEventListener('change', commit);
  var dias = h('div', { class: 'mg-dias', role: 'group', 'aria-label': 'Dias da semana' }, MG_DIAS.map(function (d, k) {
    var on = C.diasSemana.indexOf(k) >= 0;
    return h('button', { type: 'button', class: on ? 'on' : '', 'aria-pressed': String(on), title: MG_DIAS_L[k], text: d, onclick: function () { mgMudar(function () { var l = C.diasSemana.slice(), j = l.indexOf(k); if (j >= 0) l.splice(j, 1); else l.push(k); C.diasSemana = l.sort(); }); } });
  }));
  var cartaoJanela = h('article', { class: 'mg-cx mg-sec', style: '--i:7' }, [
    h('h4', { text: 'Janela e dias' }), h('p', { class: 'mut peq', text: 'Quando a IA pode enviar. O guia permite 8h às 19h: aqui só dá para estreitar.' }),
    h('div', { class: 'mg-jan' }, [rot, h('div', { class: 'mg-jan-b' }, [h('div', { class: 'mg-jan-t' }, [fx]), rIni, rFim]), h('div', { class: 'mg-jan-e' }, [h('span', { text: '8h' }), h('span', { text: '19h' })])]),
    h('label', { class: 'mg-rot', text: 'Dias em que envia' }), dias
  ]);
  var cartaoLimites = h('article', { class: 'mg-cx mg-sec', style: '--i:8' }, [
    h('h4', { text: 'Limites e segurança' }), h('p', { class: 'mut peq', text: 'Teto de envios e o disjuntor que desliga a IA se algo der errado.' }),
    h('div', { class: 'mg-linha-c' }, [h('label', { text: 'Máximo por rodada' }), mgStepper(C.limites.porRodada, 1, 200, 5, function (v) { mgMudar(function () { C.limites.porRodada = v; }); }, 'envios', 'Máximo por rodada')]),
    h('div', { class: 'mg-linha-c' }, [h('label', { text: 'Máximo por dia' }), mgStepper(C.limites.porDia, 1, 5000, 50, function (v) { mgMudar(function () { C.limites.porDia = v; }); }, 'envios', 'Máximo por dia')]),
    h('p', { class: 'mut peq', text: 'O limite geral do dia do WhatsApp (' + D.disparo.limiteDia + ') vale para todos os envios, da IA e da equipe, e nunca é ultrapassado.' }),
    h('div', { class: 'mg-linha-c mg-disj' }, [h('div', null, [h('label', { text: 'Disjuntor' }), h('small', { text: 'Desliga a IA sozinha se a Inovstar recusar envios em sequência.' })]), mgSwitch(C.disjuntor.ativo, function (v) { mgMudar(function () { C.disjuntor.ativo = v; }); }, 'Disjuntor')]),
    C.disjuntor.ativo ? h('div', { class: 'mg-linha-c' }, [h('label', { text: 'Desligar depois de' }), mgStepper(C.disjuntor.erros, 1, 20, 1, function (v) { mgMudar(function () { C.disjuntor.erros = v; }); }, 'erros seguidos', 'Erros seguidos')]) : null
  ]);
  var hojeIso = D.agoraBrt.hoje;
  var pausas = h('div', { class: 'mg-pausas' }, C.pausas.length ? C.pausas.map(function (p, k) {
    var de = h('input', { class: 'in mg-in', type: 'date', 'aria-label': 'Início da pausa' }); de.value = p.de; var ate = h('input', { class: 'in mg-in', type: 'date', 'aria-label': 'Fim da pausa' }); ate.value = p.ate;
    var mo = h('input', { class: 'in mg-in', type: 'text', maxlength: '80', placeholder: 'Motivo (ex.: Feriado)', 'aria-label': 'Motivo da pausa' }); mo.value = p.motivo || '';
    de.addEventListener('change', function () { if (de.value) mgMudar(function () { p.de = de.value; if (p.ate < p.de) p.ate = p.de; }); });
    ate.addEventListener('change', function () { if (ate.value) mgMudar(function () { p.ate = ate.value; if (p.de > p.ate) p.de = p.ate; }); });
    mo.addEventListener('change', function () { mgMudar(function () { p.motivo = mo.value.trim(); }); });
    return h('div', { class: 'mg-pausa' }, [h('span', { class: 'mg-pausa-i', 'aria-hidden': 'true', text: '⏸' }), de, h('em', { text: 'até' }), ate, mo, h('button', { type: 'button', class: 'ic-btn', 'aria-label': 'Remover pausa', onclick: function () { mgMudar(function () { C.pausas.splice(k, 1); }); } }, ico('x', 14))]);
  }) : [h('p', { class: 'mut', text: 'Nenhuma pausa programada. Use para feriados, recesso ou qualquer dia em que a IA não deve enviar.' })]);
  var cartaoPausas = h('article', { class: 'mg-cx mg-cx-l mg-sec', style: '--i:9' }, [
    h('header', { class: 'mg-cx-h' }, [h('div', null, [h('h4', { text: 'Pausas programadas' }), h('p', { class: 'mut peq', text: 'Dias em que a IA não envia, mesmo ligada.' })]), botao('Nova pausa', '', function () { mgMudar(function () { C.pausas.push({ id: 'p' + Date.now(), de: hojeIso, ate: hojeIso, motivo: '' }); }); }, 'plus')]),
    pausas
  ]);
  var fixas = h('article', { class: 'mg-cx mg-cx-l mg-sec mg-fixas', style: '--i:10' }, [
    h('h4', { text: 'Regras do guia (fixas)' }), h('p', { class: 'mut peq', text: 'O IA Manager não consegue ampliar nem desligar estas regras: elas valem para todo envio, da IA e da equipe.' }),
    h('div', { class: 'mg-chips' }, ['Contato só entre 8h e 19h', 'No máximo 2 contatos por dia por lead', 'Antes de cada contato: o paciente já foi à recepção?', 'O mesmo modelo não volta ao mesmo lead em 24 h', 'Orçamento acima de R$ 500: o 1º contato exige também a ligação', 'Passo atrasado: só uma pessoa decide'].map(function (t) { return h('span', { class: 'mg-regra' }, [ico('lock', 12), t]); }))
  ]);
  return h('section', { class: 'mg-bloco' }, [
    h('header', { class: 'mg-sh mg-sec', style: '--i:6' }, [h('div', null, [h('h3', { text: 'Ajustes gerais' }), h('p', { text: 'Janela de envio, dias da semana, limites, pausas e o disjuntor de segurança.' })])]),
    h('div', { class: 'mg-duas' }, [cartaoJanela, cartaoLimites]), cartaoPausas, fixas
  ]);
}

/* ------------------------------------------------------------------ simulador */
function mgSimular(id) {
  MG.simCar = true; MG.sim = null; desenhar(true);
  api('GET', '/ia-manager/simular?lead=' + encodeURIComponent(id)).then(function (r) { MG.sim = r; MG.simCar = false; desenhar(true); })
    .catch(function (e) { MG.simCar = false; aviso(e.message, 'erro'); desenhar(true); });
}
function mgSimulador(D) {
  var q = MG.simQ.trim().toLowerCase(), todos = (S.D && S.D.leads) || [];
  var achados = q.length >= 2 ? todos.filter(function (l) { return (l.nome + ' ' + l.telefone).toLowerCase().indexOf(q) >= 0; }).slice(0, 6) : [];
  var busca = h('input', { class: 'in mg-busca', type: 'search', placeholder: 'Buscar um lead por nome ou telefone', 'aria-label': 'Buscar lead para simular', autocomplete: 'off' }); busca.value = MG.simQ;
  busca.addEventListener('input', function () { MG.simQ = busca.value; var pos = busca.selectionStart; desenhar(true); var n = document.querySelector('.mg-busca'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { /* segue */ } } });
  var lista = achados.length ? h('div', { class: 'mg-achados' }, achados.map(function (l) { return h('button', { type: 'button', onclick: function () { MG.simQ = l.nome; mgSimular(l.id); } }, [avatar(l.nome), h('span', null, [h('b', { text: l.nome }), h('small', { text: l.telefone + ' · ' + brl(l.valor) })])]); })) : null;
  var corpo;
  if (MG.simCar) corpo = h('div', { class: 'mg-sim-v' }, [h('div', { class: 'it-carrega' }, [h('i'), h('i'), h('i')])]);
  else if (MG.sim) {
    var S_ = MG.sim, linhas = S_.checks.map(function (c, i) {
      var cls = c.ok ? 'ok' : c.falha === 'espera' ? 'espera' : 'nao';
      return h('li', { class: 'mg-ck ' + cls, style: 'animation-delay:' + (i * 55) + 'ms' }, [h('i', { 'aria-hidden': 'true', text: c.ok ? '✓' : c.falha === 'espera' ? '⏳' : '✕' }), h('div', null, [h('b', { text: c.rotulo }), h('small', { text: c.detalhe })])]);
    });
    var veredito = !S_.aplicavel ? ['neutro', 'A IA não tem um passo automático para este lead', S_.checks.length ? S_.checks[S_.checks.length - 1].detalhe : ''] : S_.enviaria ? ['ok', 'A IA enviaria agora', 'Todas as condições estão atendidas.'] : [S_.primeiraFalha.falha === 'espera' ? 'espera' : 'nao', S_.primeiraFalha.falha === 'espera' ? 'A IA enviaria mais tarde' : 'A IA não enviaria', S_.primeiraFalha.detalhe];
    var msg = S_.mensagem ? h('div', { class: 'mg-sim-m' }, [h('small', { text: 'Mensagem ' + S_.mensagem.msg + ' como o paciente receberia' }), h('div', { class: 'wa-bolha' }, [h('p', null, S_.mensagem.texto.split('\n').map(function (t, i) { return [i ? h('br') : null, t]; })), h('small', { class: 'wa-hora', text: 'agora' })]), h('div', { class: 'wa-botoes' }, S_.mensagem.botoes.map(function (b) { return h('span', null, [h('em', { text: '↩' }), b]); }))]) : null;
    corpo = h('div', { class: 'mg-sim-v' }, [
      h('div', { class: 'mg-vered ' + veredito[0] }, [h('b', { text: veredito[1] }), h('small', { text: veredito[2] })]),
      h('div', { class: 'mg-sim-g' }, [h('ul', { class: 'mg-cks' }, linhas), msg])
    ]);
  } else corpo = h('p', { class: 'mut mg-sim-d', text: 'Escolha um lead para ver, checagem por checagem, se a IA enviaria a mensagem agora e como ela ficaria.' });
  return h('section', { class: 'mg-bloco' }, [
    h('header', { class: 'mg-sh mg-sec', style: '--i:11' }, [h('div', null, [h('h3', { text: 'Simulador' }), h('p', { text: 'Teste as regras com um lead de verdade, sem enviar nada. Usa a configuração salva.' })])]),
    h('article', { class: 'mg-cx mg-cx-l mg-sec', style: '--i:12' }, [h('div', { class: 'mg-busca-w' }, [busca, lista]), corpo])
  ]);
}

/* ------------------------------------------------------------------ histórico e última rodada */
function mgHistorico(D) {
  var hist = D.config.historico || [], r = D.ultimaRodada;
  var pul = r ? Object.keys(r.pulados).map(function (k) { return [k, r.pulados[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 6) : [];
  return h('section', { class: 'mg-bloco' }, [
    h('header', { class: 'mg-sh mg-sec', style: '--i:13' }, [h('div', null, [h('h3', { text: 'Registro' }), h('p', { text: 'Quem mexeu na IA e o que ela decidiu na última rodada.' })])]),
    h('div', { class: 'mg-duas' }, [
      h('article', { class: 'mg-cx mg-sec', style: '--i:14' }, [h('h4', { text: 'Histórico de mudanças' }), hist.length ? h('ul', { class: 'mg-hist' }, hist.slice(0, 12).map(function (x) { return h('li', null, [h('i', { 'aria-hidden': 'true' }), h('div', null, [h('b', { text: x.quem }), h('span', { text: x.resumo }), h('small', { text: qDiaHora(x.quando) })])]); })) : h('p', { class: 'mut', text: 'Nenhuma mudança registrada ainda.' })]),
      h('article', { class: 'mg-cx mg-sec', style: '--i:15' }, [h('h4', { text: 'Última rodada' }), r ? h('div', null, [h('p', { class: 'mut peq', text: qDiaHora(r.quando) + ' · modo ' + (r.modo === 'ligado' ? 'ligada' : r.modo) }), h('div', { class: 'stat2' }, [h('div', null, [h('small', { text: 'Avaliados' }), h('b', { text: String(r.avaliados) })]), h('div', null, [h('small', { text: 'Enviados' }), h('b', { class: r.enviados ? 'ok' : '', text: String(r.enviados) })]), h('div', null, [h('small', { text: 'Simulados' }), h('b', { text: String(r.sombra) })]), h('div', null, [h('small', { text: 'Erros' }), h('b', { class: r.erros ? 'ruim' : '', text: String(r.erros) })])]), pul.length ? h('ul', { class: 'lista-o ia-pul' }, pul.map(function (p) { return h('li', null, [h('b', { text: p[1] + ' ' }), p[0]]); })) : null]) : h('p', { class: 'mut', text: 'A IA ainda não rodou. Quando o agendador chamar (ou você clicar em "Rodar agora"), o resultado aparece aqui.' })])
    ])
  ]);
}

/* ------------------------------------------------------------------ barra de salvar e página */
function mgSalvar() {
  MG.salvando = true; MG.erro = ''; desenhar(true);
  api('PUT', '/ia-manager', { config: MG.c }).then(function (d) {
    MG.d = d; MG.t = Date.now(); MG.c = mgClone(d.config); MG.base = mgClone(d.config); MG.salvando = false; MG.salvou = true;
    aviso('Configuração da IA salva.', 'ok'); desenhar(true); setTimeout(function () { MG.salvou = false; }, 1500);
  }).catch(function (e) { MG.salvando = false; MG.erro = e.message; desenhar(true); });
}
function mgBarraSalvar() {
  var sujo = mgSujo();
  if (!sujo && !MG.salvou) return null;
  return h('div', { class: 'mg-barra' + (MG.erro ? ' erro' : '') + (MG.salvou && !sujo ? ' salvo' : ''), role: 'region', 'aria-label': 'Alterações da IA' }, [
    h('div', { class: 'mg-barra-t' }, [h('i', { 'aria-hidden': 'true' }), h('div', null, [h('b', { text: MG.salvou && !sujo ? 'Salvo!' : 'Você tem alterações não salvas' }), MG.erro ? h('small', { text: MG.erro }) : h('small', { text: 'As mudanças só valem para a IA depois de salvar.' })])]),
    sujo ? h('div', { class: 'mg-barra-b' }, [botao('Descartar', '', function () { MG.c = mgClone(MG.base); MG.erro = ''; desenhar(true); }), botao(MG.salvando ? 'Salvando…' : 'Salvar alterações', 'pri', function () { if (!MG.salvando) mgSalvar(); }, 'check')]) : null
  ]);
}
function telaIAManager() {
  mgPedir(false);
  var cab = cabecalhoTela('IA Manager', 'O centro de controle da IA de disparo: Power, horário de cada gatilho, condições, parâmetros e limites, e tudo o que os pacientes responderam. O guia continua mandando: a IA só pode estreitar as regras, nunca ampliar.');
  var abas = h('div', { class: 'tabs-an', role: 'tablist' }, [['controle', 'Controle'], ['respostas', 'Respostas e fila']].map(function (t) {
    return h('button', { type: 'button', role: 'tab', class: 'tab-an', 'aria-selected': String(MG.aba === t[0]), text: t[1], onclick: function () { MG.aba = t[0]; gravarLS('crm-mgaba', t[0]); desenhar(); } });
  }));
  if (MG.aba === 'respostas') return h('div', { class: 'tela mg' }, [cab, abas, corpoIA(), mgBarraSalvar()]);
  if (!MG.d || !MG.c) return h('div', { class: 'tela mg' }, [cab, abas, esqueleto()]);
  MG.animar = !MG.entrou; MG.entrou = true;
  return h('div', { class: 'tela mg' + (MG.animar ? ' mg-anim' : '') + ' mg-' + MG.d.modo }, [cab, abas, mgHero(MG.d), mgLinha(MG.d), mgGatilhos(MG.d), mgGlobais(MG.d), mgSimulador(MG.d), mgHistorico(MG.d), mgBarraSalvar()]);
}
`;
