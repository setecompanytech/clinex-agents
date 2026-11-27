// JavaScript do CRM (navegador): página "IA Manager", o painel de controle da IA de disparo. Dados de /painel/crm/api/ia-manager.
// Dentro dele não usar crases nem "dollar-chave".
export const manager = String.raw`
var MG = { logM: null, detAbertos: {}, labVistos: {}, aba: 'controle', d: null, c: null, base: null, car: false, t: 0, erro: '', salvando: false, entrou: false, lab: null, labCar: false, labQ: '', labRes: null, labNovo: null, novoNum: '', lf: { liberar: false, telefone: '', nome: '', tipo: 'orcamento', valor: '400', unidade: '', dias: 1, exame: 'Ultrassom', atendente: '' } };
var MG_PAL = ['#4cc9f0', '#a78bfa', '#f5b942', '#fb7185', '#2ee6a6'];
var MG_DIAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'], MG_DIAS_L = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
var MG_TXT = {
  desligado: ['IA desligada', 'Nada é enviado sozinho. Todos os disparos voltam a ser manuais, pela equipe.'],
  simulacao: ['Modo simulação', 'A IA trabalha só com leads fictícios que você cria no laboratório, mais abaixo. Nenhum paciente real é avaliado e nada é enviado.'],
  sombra: ['Observando em modo sombra', 'A IA decide e anota o que enviaria, sem enviar nada. Ideal para conferir antes de liberar.'],
  ligado: ['IA ligada e disparando', 'Envia sozinha, no horário de cada gatilho, sempre sob as travas do guia.']
};
var mgClone = function (o) { return JSON.parse(JSON.stringify(o)); };
function mgSujo() { return !!(MG.c && MG.base) && JSON.stringify(MG.c) !== JSON.stringify(MG.base); }

/* Repinta SÓ as seções que mudaram (o Power, as partículas e os anéis não reiniciam). A página inteira só é refeita ao trocar de modo ou de aba. */
var MG_SECOES = { linha: function () { return mgLinha(MG.d); }, gat: function () { return mgGatilhos(MG.d); }, glob: function () { return mgGlobais(MG.d); }, lab: function () { return mgSimulador(MG.d); }, hist: function () { return mgHistorico(MG.d); }, barra: function () { return mgBarraSalvar(); } };
function mgRepintar(chaves) {
  var tela = document.querySelector('.tela.mg');
  if (!tela || S.aba !== 'iamanager' || MG.aba !== 'controle' || !MG.d || !MG.c) { desenhar(true); return; }
  chaves.forEach(function (k) {
    var novo = MG_SECOES[k](), velho = tela.querySelector('[data-mg="' + k + '"]');
    if (novo) {
      novo.setAttribute('data-mg', k); novo.classList.remove('mg-sec'); Array.prototype.forEach.call(novo.querySelectorAll('.mg-sec'), function (n) { n.classList.remove('mg-sec'); });
      if (k === 'barra' && velho) novo.classList.add('fixa'); /* a barra só "entra" quando aparece, não a cada clique */
    }
    if (velho && novo) velho.replaceWith(novo); else if (velho) velho.remove(); else if (novo) tela.appendChild(novo);
  });
}
/* o que a tela mostra, sem os campos que só mudam com o relógio: serve para não redesenhar (e reiniciar as animações) à toa */
function mgAssina(d) {
  var x = Object.assign({}, d); delete x.agoraBrt; delete x.minutosDesdeUltimaRodada; x.proximo = { tipo: d.proximo.tipo, gatilho: d.proximo.gatilho, hora: d.proximo.hora };
  try { return JSON.stringify(x); } catch (e) { return String(Math.random()); }
}
function mgPedir(forcar, silencioso, urgente) {
  if (MG.car || MG.pend) return;
  if (!forcar && MG.d && Date.now() - MG.t < 15000) return;
  MG.car = true;
  api('GET', '/ia-manager').then(function (d) {
    var ass = mgAssina(d), mudou = ass !== MG.ass || Date.now() - (MG.tDes || 0) > 300000; /* sem mudança de verdade: só o relógio muda, e isso se atualiza a cada 5 min */
    MG.d = d; MG.t = Date.now(); MG.car = false;
    if (!mgSujo()) { MG.c = mgClone(d.config); MG.base = mgClone(d.config); }
    if (mudou && MG.ass && !urgente && !silencioso && ocupado()) return; /* a pessoa está mexendo: guarda os dados e só refaz a tela quando ela parar */
    if (silencioso && MG.d.modo === MG.modoTela) { MG.ass = ass; return; } /* confirmação de fundo de algo que a tela já mostra: não redesenha */
    if (S.aba === 'iamanager' && mudou) { MG.ass = ass; MG.tDes = Date.now(); MG.modoTela = d.modo; desenhar(true); }
  }).catch(function (e) { MG.car = false; MG.t = Date.now(); aviso('Não consegui carregar o IA Manager: ' + e.message, 'erro'); });
}
setInterval(function () { if (S.aba === 'iamanager' && document.visibilityState === 'visible' && !digitando() && !ocupado()) mgPedir(true); }, 20000);

/* ------------------------------------------------------------------ Power e modos */
function mgDefinirModo(modo) {
  if (modo === 'ligado' && !window.confirm('Ligar o envio automático? A IA vai mandar mensagens REAIS para pacientes, sozinha, no horário de cada gatilho. Você pode desligar a qualquer momento no botão Power.')) return;
  /* a tela muda NA HORA (o servidor grava no banco antes de responder e isso demora); se der erro, volta ao que era */
  if (MG.pend || !MG.d) return;
  var antes = MG.d.modo;
  MG.d.modo = modo; MG.modoTela = modo; MG.pend = modo; if (modo === 'simulacao') { MG.lab = null; MG.labRes = null; }
  desenhar(true);
  api('PUT', '/disparo-auto', { modo: modo }).then(function () {
    MG.pend = null;
    aviso(modo === 'desligado' ? 'IA desligada.' : modo === 'simulacao' ? 'Modo simulação: a IA só trabalha com leads de teste.' : modo === 'sombra' ? 'IA em modo sombra: nada será enviado.' : 'IA ligada.', 'ok');
    IA_C = {}; var tl = document.querySelector('.tela.mg'); if (tl) tl.classList.remove('mg-pend'); MG.t = 0; mgPedir(true, true);
  }).catch(function (e) { MG.pend = null; MG.d.modo = antes; MG.modoTela = antes; aviso(e.message, 'erro'); desenhar(true); });
}
function mgPower(D) {
  if (D.forcadoPeloAmbiente) { aviso('A IA está travada em desligada pelo ambiente (DISPARO_AUTO=desligado).', 'erro'); return; }
  if (D.modo === 'desligado') { var ult = lerLS('crm-ia-modo'); mgDefinirModo(ult === 'ligado' || ult === 'sombra' ? ult : 'simulacao'); }
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
    h('span', { class: 'mg-nucleo' }, [mgSvgPower(), h('b', { text: modo === 'ligado' ? 'LIGADA' : modo === 'simulacao' ? 'SIMULAÇÃO' : modo === 'sombra' ? 'SOMBRA' : 'DESLIGADA' })])
  ]);
  var seg = h('div', { class: 'mg-modos', role: 'group', 'aria-label': 'Modo de operação' }, [['simulacao', 'Modo simulação', 'leads fictícios'], ['sombra', 'Modo sombra', 'só observa'], ['ligado', 'Ligada', 'envia de verdade']].map(function (m) {
    return h('button', { type: 'button', class: 'mg-modo' + (D.modo === m[0] ? ' on' : ''), 'aria-pressed': String(D.modo === m[0]), disabled: D.forcadoPeloAmbiente, title: D.modo === m[0] ? 'Clique de novo para desligar a IA' : 'Mudar para ' + m[1], onclick: function () { mgDefinirModo(D.modo === m[0] ? 'desligado' : m[0]); } }, [h('b', { text: m[1] }), h('small', { text: D.modo === m[0] ? 'toque p/ desligar' : m[2] })]);
  }));
  var min = D.minutosDesdeUltimaRodada, bat = 'off', batT = 'Ainda não rodou';
  if (min !== null) { batT = 'Última rodada há ' + (min < 1 ? 'menos de 1 min' : min + ' min'); bat = !ativo ? 'off' : min <= 20 ? 'ok' : min <= 60 ? 'at' : 'ruim'; }
  var real = modo === 'sombra' || modo === 'ligado', sim = modo === 'simulacao';
  var alertaAgend = real && D.agoraBrt.minutos >= D.config.janela.inicio * 60 && D.agoraBrt.minutos < D.config.janela.fim * 60 && (min === null || min > 60);
  var p = D.proximo, prox;
  if (!ativo) prox = ['Sem disparos programados', 'Ligue a IA para ela voltar a trabalhar.'];
  else if (sim) prox = ['Laboratório pronto', 'Crie leads de teste e rode a IA em qualquer dia e horário, logo abaixo.'];
  else if (p.tipo === 'agora') prox = ['Pronta para enviar agora', p.gatilho + ' · assim que o agendador chamar a próxima rodada'];
  else if (p.tipo === 'hoje') prox = ['Próximo disparo em ' + (p.minutos >= 60 ? Math.floor(p.minutos / 60) + 'h' + (p.minutos % 60 ? String(p.minutos % 60).padStart(2, '0') : '') : p.minutos + ' min'), p.gatilho + ' às ' + p.hora];
  else if (p.tipo === 'amanha') prox = ['Nada mais para hoje', 'Próximo gatilho: ' + p.gatilho + ' amanhã às ' + p.hora];
  else prox = ['Nenhum gatilho ligado', 'Ligue pelo menos um gatilho abaixo.'];
  var avisos = [];
  if (D.forcadoPeloAmbiente) avisos.push(h('span', { class: 'mg-av ruim', text: 'Travada pelo ambiente (DISPARO_AUTO=desligado)' }));
  if (sim) avisos.push(h('span', { class: 'mg-av sim', text: 'Nenhum paciente real é avaliado' }));
  else if (!D.disparo.ativo) avisos.push(h('span', { class: 'mg-av at', text: 'WhatsApp desligado neste ambiente (DISPARO_WHATSAPP)' }));
  else if (D.disparo.restrito) avisos.push(h('span', { class: 'mg-av at', text: 'Fase de testes: só números de teste recebem' }));
  var lim = D.hoje.limiteDia;
  var anel = h('div', { class: 'mg-prog', style: '--p:' + Math.min(100, Math.round(D.hoje.enviadosIA / Math.max(1, lim) * 100)) }, [h('div', null, [h('b', { text: nf0.format(D.hoje.enviadosIA) }), h('small', { text: 'de ' + nf0.format(lim) })])]);
  return h('section', { class: 'mg-hero mg-sec', style: '--i:0' }, [
    h('div', { class: 'mg-part', 'aria-hidden': 'true' }, MG_PART.map(function (q) { return h('i', { style: 'left:' + q[0] + '%;top:' + q[1] + '%;animation-delay:' + q[2] + 's' }); })),
    h('div', { class: 'mg-hero-e' }, [orbe, seg]),
    h('div', { class: 'mg-hero-d' }, [
      h('div', { class: 'mg-hero-t' }, [h('small', { class: 'mg-eyebrow', text: 'CENTRO DE COMANDO · ' + D.agoraBrt.dia.toUpperCase() + ' ' + D.agoraBrt.hora }), h('h2', { text: t[0] }), h('p', { text: t[1] })]),
      h('div', { class: 'mg-estado' }, [
        sim ? h('span', { class: 'mg-bat sim' }, [h('i'), 'Só leads de teste']) : h('span', { class: 'mg-bat ' + bat }, [h('i'), batT]),
        h('span', { class: 'mg-prox' }, [h('b', { text: prox[0] }), h('small', { text: prox[1] })])
      ].concat(avisos)),
      alertaAgend ? h('p', { class: 'callout aviso', text: 'Nenhuma rodada nos últimos minutos. A IA só trabalha quando um agendador chama /cron/disparo: confirme com a equipe técnica que ele está configurado.' }) : null,
      h('div', { class: 'mg-conts' }, [
        h('div', { class: 'mg-c mg-c-prog' }, [h('small', { text: 'Enviadas hoje' }), anel, h('span', { text: 'limite diário' })]),
        mgContador('Na fila agora', D.hoje.fila, 'prontas para enviar', D.hoje.fila ? 'quente' : ''),
        mgContador('Respostas hoje', D.hoje.respostas, 'rastreadas', ''),
        mgContador('Simuladas hoje', D.hoje.simulados, 'modo sombra', '')
      ]),
      h('div', { class: 'mg-acoes' }, sim ? [botao('Ir ao laboratório', 'pri', function () { var el = document.getElementById('mg-lab'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 'arrow')] : ativo ? [botao('Rodar agora', 'pri', function (e) { var b = e.currentTarget; b.setAttribute('disabled', 'true'); api('POST', '/disparo-auto/rodar').then(function (r) { IA_C = {}; if (r.pulou) aviso(r.pulou, 'erro'); else aviso('Rodada feita: ' + r.rodada.enviados + ' enviadas, ' + r.rodada.sombra + ' simuladas, ' + r.rodada.erros + ' com erro.', 'ok'); MG.t = 0; mgPedir(true, false, true); }).catch(function (er) { aviso(er.message, 'erro'); b.removeAttribute('disabled'); }); }, 'bolt')] : [])
    ])
  ]);
}

/* ------------------------------------------------------------------ linha do tempo do dia */
var MG_QUEM = {
  primeiro: function (g) { return 'Para quem fez um orçamento ontem e ainda não recebeu nenhum contato. A IA manda a mensagem de primeiro contato.'; },
  tentativa: function (g) { return 'Para quem ficou 3 dias sem responder. A IA pergunta de novo, citando o prazo "' + (g.prazo || 'esta semana') + '".'; },
  desconto: function (g) { return 'Para quem está há 4 dias sem responder (só leads). A IA oferece ' + (g.desconto || '10%') + ' de desconto.'; },
  encerramento: function (g) { return 'Para quem está há 7 dias sem responder. A IA manda a mensagem de encerramento do atendimento.'; },
  noshow: function (g) { return 'Para quem faltou à consulta. A IA convida a reagendar, no dia seguinte à falta.'; }
};
function mgDuracao(min) { return min >= 60 ? Math.floor(min / 60) + 'h' + (min % 60 ? String(min % 60).padStart(2, '0') : '') : min + ' min'; }
function mgLinha(D) {
  var C = MG.c, hm = function (s) { return Number(s.slice(0, 2)) * 60 + Number(s.slice(3)); };
  var agoraMin = D.agoraBrt.minutos, iaIni = C.janela.inicio * 60, iaFim = C.janela.fim * 60;
  var hora = function (m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  var pausaHoje = C.pausas.filter(function (x) { return D.agoraBrt.hoje >= x.de && D.agoraBrt.hoje <= x.ate; })[0];
  var dow = new Date(D.agoraBrt.hoje + 'T12:00:00Z').getUTCDay(), diaOk = C.diasSemana.indexOf(dow) >= 0;
  var fechado = !!pausaHoje || !diaOk, naJanela = !fechado && agoraMin >= iaIni && agoraMin < iaFim;
  var ligados = D.gatilhos.filter(function (g) { return C.gatilhos[g.id].ativo; }).length;
  var frase;
  if (pausaHoje) frase = ['pausa', 'Hoje a IA não envia nada: ' + (pausaHoje.motivo ? pausaHoje.motivo : 'pausa programada') + '.'];
  else if (!diaOk) frase = ['pausa', 'Hoje (' + D.agoraBrt.dia + ') a IA não envia nada: o dia está desligado nos ajustes.'];
  else if (!ligados) frase = ['pausa', 'Todos os gatilhos estão desligados: a IA não envia nada.'];
  else if (naJanela) frase = ['ok', 'A IA pode enviar agora. A janela fecha às ' + C.janela.fim + 'h (daqui a ' + mgDuracao(iaFim - agoraMin) + ').'];
  else if (agoraMin < iaIni) frase = ['espera', 'A IA ainda não pode enviar. A janela abre às ' + C.janela.inicio + 'h (daqui a ' + mgDuracao(iaIni - agoraMin) + ').'];
  else frase = ['espera', 'A janela de hoje já fechou às ' + C.janela.fim + 'h. A IA volta a enviar amanhã.'];
  var real = D.modo === 'sombra' || D.modo === 'ligado';

  var itens = [{ m: iaIni, w: 0, tipo: 'abre' }, { m: agoraMin, w: 1, tipo: 'agora' }, { m: iaFim, w: 3, tipo: 'fecha' }];
  D.gatilhos.forEach(function (g, i) { var gc = C.gatilhos[g.id]; itens.push({ m: Math.max(hm(gc.hora), iaIni), w: 2, tipo: 'g', g: g, gc: gc, i: i }); });
  itens.sort(function (a, b) { return a.m - b.m || a.w - b.w; });

  var linhas = itens.map(function (it, k) {
    var base = 'mg-dia-r' + (it.m <= agoraMin ? ' p' : '') + ' ' + 'mg-dia-' + it.tipo;
    var estilo = '--k:' + k;
    if (it.tipo === 'abre') return h('div', { class: base, style: estilo }, [h('b', { class: 'mg-dia-h', text: hora(it.m) }), h('i', { class: 'mg-dia-no' }), h('div', { class: 'mg-dia-s' }, [h('b', { text: 'A janela da IA abre' }), h('small', { text: 'A partir daqui a IA pode enviar.' })])]);
    if (it.tipo === 'fecha') return h('div', { class: base, style: estilo }, [h('b', { class: 'mg-dia-h', text: hora(it.m) }), h('i', { class: 'mg-dia-no' }), h('div', { class: 'mg-dia-s' }, [h('b', { text: 'A janela da IA fecha' }), h('small', { text: 'Depois disso a IA não envia mais nada até o dia seguinte.' })])]);
    if (it.tipo === 'agora') return h('div', { class: base + (fechado ? ' off' : ''), style: estilo }, [h('b', { class: 'mg-dia-h', text: hora(agoraMin) }), h('i', { class: 'mg-dia-no' }), h('div', { class: 'mg-dia-ag' }, [h('i'), h('b', { text: 'AGORA' }), h('span', { text: D.agoraBrt.dia + ', ' + mgDm(D.agoraBrt.hoje) })])]);
    var g = it.g, gc = it.gc, f = g.fila, cor = MG_PAL[it.i % MG_PAL.length], horaCfg = hm(gc.hora);
    var chip;
    if (!gc.ativo) chip = ['off', 'Gatilho desligado'];
    else if (fechado) chip = ['off', 'Hoje não envia'];
    else if (horaCfg >= iaFim) chip = ['off', 'Depois do fechamento: nunca envia'];
    else if (it.m <= agoraMin) chip = ['ok', 'Já passou do horário'];
    else chip = ['espera', 'Falta ' + mgDuracao(it.m - agoraMin)];
    var nota = gc.ativo && !fechado && horaCfg < iaIni ? 'O horário do gatilho (' + gc.hora + ') é antes da janela da IA: ela envia a partir das ' + hora(iaIni) + '.' : '';
    var stat = function (rot, n, cls, dica) { return h('div', { class: 'mg-dia-k ' + cls, title: dica }, [h('b', { text: nf0.format(n) }), h('small', { text: rot })]); };
    var rotPronto = D.modo === 'desligado' ? 'prontos (IA desligada)' : D.modo === 'simulacao' ? 'prontos (simulação)' : 'prontos para a IA enviar';
    var stats = [stat('enviados hoje', g.enviadosHoje, 'env', 'Mensagens deste passo que a IA já enviou hoje'), stat(rotPronto, f.prontos, 'pro', 'Leads que cumprem todas as regras agora: saem na próxima rodada da IA'), stat('esperando o horário', f.esperando, 'esp', 'Leads deste passo que ainda não chegaram no horário'), stat('fora das regras', f.pulados, 'fora', 'Leads que a IA não envia: atrasados, sem telefone, fora das condições...')];
    if (D.modo === 'sombra') stats.splice(1, 0, stat('simulados hoje', g.simuladosHoje, 'sim', 'Em modo sombra: o que a IA teria enviado'));
    return h('div', { class: base + (gc.ativo && !fechado ? '' : ' off'), style: estilo + ';--gc:' + cor }, [
      h('b', { class: 'mg-dia-h', text: hora(it.m) }), h('i', { class: 'mg-dia-no' }),
      h('article', { class: 'mg-dia-c' }, [
        h('header', null, [h('span', { class: 'mg-dia-num', text: String(g.msg) }), h('div', { class: 'mg-dia-t' }, [h('b', { text: g.rotulo }), h('small', { text: 'Mensagem ' + g.msg })]), h('span', { class: 'mg-dia-chip ' + chip[0], text: chip[1] })]),
        h('p', { class: 'mg-dia-q', text: MG_QUEM[g.id](gc) }),
        nota ? h('p', { class: 'mg-dia-nota', text: nota }) : null,
        gc.ativo ? (g.enviadosHoje + g.simuladosHoje + f.prontos + f.esperando + f.pulados === 0 ? h('p', { class: 'mg-dia-vazio', text: 'Nenhum lead neste passo hoje.' }) : h('div', { class: 'mg-dia-ks' }, stats)) : null,
        gc.ativo && f.pulados && g.motivos.length ? h('p', { class: 'mg-dia-mot' }, [h('b', { text: 'Por que ficam de fora: ' }), g.motivos[0].motivo + (g.motivos.length > 1 ? ' e outros motivos' : '')]) : null
      ])
    ]);
  });
  return h('section', { class: 'mg-sec mg-linha', style: '--i:1' }, [
    h('header', { class: 'mg-sh' }, [h('div', null, [h('h3', { text: 'O que a IA faz hoje' }), h('p', { text: 'A agenda do dia na ordem das horas: o que a IA envia, a que horas e para quem. O que já passou fica mais apagado.' })])]),
    h('div', { class: 'mg-ag-frase f-' + frase[0] }, [h('i'), frase[1]]),
    h('div', { class: 'mg-dia' }, linhas)
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
function mgMudar(fn) { fn(); MG.erro = ''; mgRepintar(['linha', 'gat', 'glob', 'barra']); }
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
  var A = C.antigos, N = D.antigos || { naFila: 0, enviadosHoje: 0 };
  var cartaoAntigos = h('article', { class: 'mg-cx mg-cx-l mg-sec', style: '--i:9' }, [
    h('header', { class: 'mg-cx-h' }, [h('div', null, [h('h4', { text: 'Base antiga (orçamentos parados em Em aberto)' }), h('p', { class: 'mut peq', text: 'Orçamentos sem nenhum contato, cujo dia já passou. A IA manda só a primeira mensagem, dos mais recentes para os mais antigos, de segunda a sexta. Antes de enviar, confere no Clinilink se o orçamento continua em aberto e se o paciente já não agendou. Os próximos contatos ficam com a equipe.' })]), mgSwitch(A.ativo, function (v) { mgMudar(function () { A.ativo = v; }); }, 'Disparar para a base antiga')]),
    A.ativo ? h('div', null, [
      h('div', { class: 'mg-linha-c' }, [h('label', { text: 'Máximo por dia' }), mgStepper(A.porDia, 1, 200, 5, function (v) { mgMudar(function () { A.porDia = v; }); }, 'envios', 'Base antiga: máximo por dia')]),
      h('div', { class: 'mg-linha-c' }, [h('label', { text: 'Orçamentos de até' }), mgStepper(A.dias, 2, 60, 5, function (v) { mgMudar(function () { A.dias = v; }); }, 'dias atrás', 'Base antiga: até quantos dias')]),
      h('div', { class: 'mg-linha-c' }, [h('label', { text: 'Começa às' }), mgStepper(A.inicio, 8, 18, 1, function (v) { mgMudar(function () { A.inicio = v; if (A.fim <= v) A.fim = v + 1; }); }, 'h', 'Base antiga: hora de início')]),
      h('div', { class: 'mg-linha-c' }, [h('label', { text: 'Termina às' }), mgStepper(A.fim, 9, 19, 1, function (v) { mgMudar(function () { A.fim = v; if (A.inicio >= v) A.inicio = v - 1; }); }, 'h', 'Base antiga: hora de fim')]),
      h('p', { class: 'mut peq', text: 'Agora: ' + N.naFila + ' na fila da base antiga · ' + N.enviadosHoje + ' enviadas hoje. Os números mudam depois de salvar. Saem até 5 por rodada.' })
    ]) : h('p', { class: 'mut peq', text: 'Desligada: orçamento atrasado fica só com a equipe.' })
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
    h('div', { class: 'mg-chips' }, ['A IA só envia entre 8h e 19h', 'No máximo 2 contatos por dia por lead', 'Antes de cada contato: o paciente já foi à recepção?', 'O mesmo modelo não volta ao mesmo lead em 24 h', 'Orçamento acima de R$ 500: o 1º contato exige também a ligação', 'Passo atrasado: só uma pessoa decide (menos a base antiga, se ligada)'].map(function (t) { return h('span', { class: 'mg-regra' }, [ico('lock', 12), t]); }))
  ]);
  return h('section', { class: 'mg-bloco' }, [
    h('header', { class: 'mg-sh mg-sec', style: '--i:6' }, [h('div', null, [h('h3', { text: 'Ajustes gerais' }), h('p', { text: 'Janela de envio, dias da semana, limites, pausas e o disjuntor de segurança.' })])]),
    h('div', { class: 'mg-duas' }, [cartaoJanela, cartaoLimites]), cartaoAntigos, cartaoPausas, fixas
  ]);
}

/* ------------------------------------------------------------------ laboratório do Modo Simulação */
var MG_NOMES = ['Maria Teste', 'João Teste', 'Ana Teste', 'Pedro Teste', 'Lúcia Teste', 'Carlos Teste', 'Rita Teste', 'Paulo Teste'];
var MG_EXEMPLOS = [
  { r: 'Orçamento de ontem', d: '1º contato, às 8h30', e: { tipo: 'orcamento', dias: 1, valor: 400 } },
  { r: 'Orçamento alto', d: 'R$ 1.200, de ontem', e: { tipo: 'orcamento', dias: 1, valor: 1200 } },
  { r: 'Orçamento de hoje', d: 'o 1º contato só vence amanhã', e: { tipo: 'orcamento', dias: 0, valor: 300 } },
  { r: 'Faltou à consulta', d: 'No-show · Msg 10', e: { tipo: 'noshow', dias: 0, valor: 250 } }
];
function mgDm(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : ''; }
function mgRelogioPadrao(D) { return D.agoraBrt.hoje + 'T' + D.agoraBrt.hora; }
function mgSomaDiaRel(q, n) { var d = new Date(q.slice(0, 10) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) + q.slice(10); }
function mgRelogioTxt(q) { var d = new Date(q.slice(0, 10) + 'T12:00:00Z'); return MG_DIAS_L[d.getUTCDay()] + ', ' + mgDm(q.slice(0, 10)) + ' · ' + q.slice(11, 16); }
var MG_LAB_SEQ = 0;
function mgLabRepintar() { mgRepintar(['lab']); mgLogRepintar(); }
function mgLabCarregar() {
  if (MG.labCar) return;
  MG.labCar = true;
  api('GET', '/ia-manager/lab?quando=' + encodeURIComponent(MG.labQ)).then(function (r) { MG.lab = r; MG.labCar = false; if (document.querySelector('[data-mg="lab"]')) mgLabRepintar(); else if (S.aba === 'iamanager') desenhar(true); })
    .catch(function (e) { MG.labCar = false; MG.lab = MG.lab || { leads: [], limite: 12 }; aviso(e.message, 'erro'); });
}
/* ações do laboratório: o botão mostra "fazendo…" na hora, só a seção do laboratório é repintada */
function mgLabAcao(tipo, metodo, caminho, corpo, ok) {
  if (MG.labOcupado) return;
  MG.labOcupado = tipo; mgLabRepintar();
  api(metodo, caminho, corpo).then(function (r) { MG.labOcupado = ''; ok(r); mgLabRepintar(); }).catch(function (e) { MG.labOcupado = ''; aviso(e.message, 'erro'); mgLabRepintar(); });
}
/* mudar o relógio: o texto e os botões mudam NA HORA; as decisões dos leads atualizam quando o servidor responder (respostas antigas são ignoradas) */
function mgLabRelogio(q) {
  MG.labQ = q; MG.labRes = null; var meu = ++MG_LAB_SEQ; MG.labAtual = true; mgLabRepintar();
  api('GET', '/ia-manager/lab?quando=' + encodeURIComponent(q)).then(function (r) { if (meu !== MG_LAB_SEQ) return; MG.lab = r; MG.labAtual = false; mgLabRepintar(); })
    .catch(function (e) { if (meu !== MG_LAB_SEQ) return; MG.labAtual = false; aviso(e.message, 'erro'); mgLabRepintar(); });
}
function mgLabAdicionar(extra) {
  var f = Object.assign({}, MG.lf, extra || {}), n = MG.lab ? MG.lab.leads.length : 0;
  if (!String(f.nome || '').trim()) f.nome = MG_NOMES[n % MG_NOMES.length];
  mgLabAcao('add', 'POST', '/ia-manager/lab/leads', { nome: f.nome, telefone: f.telefone, liberar: !!f.liberar && !!String(f.telefone || '').trim(), tipo: f.tipo, valor: f.valor, unidade: f.unidade, diasAtras: f.dias, exame: f.exame, atendente: f.atendente, quando: MG.labQ }, function (r) { MG.lab = r; MG.labRes = null; MG.lf.nome = ''; aviso('Lead de teste criado.', 'ok'); });
}
function mgLabRodar() {
  mgLabAcao('rodar', 'POST', '/ia-manager/lab/rodar', { quando: MG.labQ }, function (r) {
    MG.lab = r.lab; MG.labRes = r.resultados; MG.labNovo = Date.now();
    var n = r.resultados.filter(function (x) { return x.resultado === 'enviaria'; }).length;
    aviso(n ? 'A IA enviaria ' + n + (n === 1 ? ' mensagem' : ' mensagens') + ' agora (simulado, nada saiu).' : 'A IA não enviaria nada neste horário.', n ? 'ok' : 'aviso');
  });
}
/* remover e limpar: some da tela na hora; se o servidor falhar, recarrega o que realmente existe */
/* manda de verdade a última mensagem simulada para o número que a pessoa digitou */
function mgLabEnviar(l) {
  if (MG.labOcupado) return;
  var de = l.enviosOk > 0;
  if (!window.confirm((de ? 'Enviar DE NOVO' : 'Enviar') + ' a Msg ' + (l.ultimaMsg || '') + ' DE VERDADE pelo WhatsApp para ' + l.telefone + '. Continuar?')) return;
  MG.labOcupado = 'env'; mgLabRepintar();
  api('POST', '/ia-manager/lab/leads/' + encodeURIComponent(l.id) + '/enviar', { quando: MG.labQ }).then(function (r) {
    MG.labOcupado = ''; MG.lab = r.lab; mgLabRepintar();
    aviso('A Inovstar aceitou o envio para ' + l.telefone + '. Se não chegar no WhatsApp, abra "Ver log".', 'ok');
  }).catch(function (e) {
    /* a recusa foi gravada no log do lead: busca de novo e abre o log para mostrar o porquê */
    MG.labOcupado = ''; aviso(e.message, 'erro');
    api('GET', '/ia-manager/lab?quando=' + encodeURIComponent(MG.labQ)).then(function (r) { MG.lab = r; mgLabRepintar(); mgLogAbrir(l.id); }).catch(function () { mgLabRepintar(); });
  });
}
/* ---- log do lead de teste: o que a IA decidiu e o que aconteceu em cada envio, com a razão e o que fazer */
function mgLogDoLead(id) { return MG.lab ? MG.lab.leads.filter(function (x) { return x.id === id; })[0] : null; }
function mgLogHora(iso) { return qDiaHora(iso); }
function mgLogTexto(l) {
  return ['Log do lead de teste ' + l.nome + ' (' + (l.telefoneInformado ? l.telefone : 'sem número') + ')'].concat(l.log.map(function (e) {
    return '[' + mgLogHora(e.quando) + ' | relógio simulado ' + mgLogHora(e.simulado) + '] ' + (e.tipo === 'envio' ? 'ENVIO REAL' : 'SIMULAÇÃO') + ' ' + (e.ok ? 'OK' : 'FALHA') + ': ' + e.titulo + ' - ' + e.detalhe + (e.dica ? ' | ' + e.dica : '');
  })).join('\n');
}
function mgLogCorpo(l) {
  var d = l.diagnostico || {};
  var ck = function (ok, rot, det, extra) { return h('li', { class: ok ? 'ok' : 'nao' }, [h('i', { 'aria-hidden': 'true', text: ok ? '✓' : '✕' }), h('div', null, [h('b', { text: rot }), h('small', { text: det }), extra || null])]); };
  var podeEnviar = l.telefoneInformado && l.podeEnviar && l.numeroLiberado;
  var acoes = h('div', { class: 'mg-log-ac' }, [
    l.telefoneInformado ? (function () { var b = botao(l.enviosOk > 0 ? 'Enviar novamente' : 'Enviar no WhatsApp', 'pri', function () { mgLabEnviar(l); }, 'message'); if (!podeEnviar || MG.labOcupado) b.setAttribute('disabled', 'true'); return b; })() : null,
    botao('Copiar log', '', function () { var t = mgLogTexto(l); if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { aviso('Log copiado.', 'ok'); }, function () { aviso('Não consegui copiar.', 'erro'); }); else aviso('Seu navegador não deixou copiar.', 'erro'); }, 'copy')
  ]);
  var lista = l.log.length ? h('ol', { class: 'mg-log-l' }, l.log.map(function (e) {
    var cls = e.tipo === 'envio' ? (e.ok ? 'ok' : 'nao') : (e.ok ? 'sim-ok' : 'sim');
    return h('li', { class: 'mg-log-i ' + cls }, [
      h('i', { class: 'mg-log-p', 'aria-hidden': 'true', text: e.tipo === 'envio' ? (e.ok ? '✓' : '✕') : (e.ok ? '✓' : '◷') }),
      h('div', { class: 'mg-log-c' }, [
        h('div', { class: 'mg-log-t' }, [h('b', { text: e.titulo }), h('span', { class: 'mg-log-tag ' + (e.tipo === 'envio' ? 'real' : ''), text: e.tipo === 'envio' ? 'ENVIO REAL' : 'SIMULAÇÃO' }), e.msg ? h('span', { class: 'mg-log-tag', text: 'Msg ' + e.msg }) : null]),
        h('small', { class: 'mg-log-h', text: mgLogHora(e.quando) + ' · relógio simulado ' + mgLogHora(e.simulado) }),
        h('p', { text: e.detalhe }),
        e.dica ? h('p', { class: 'mg-log-dica', text: e.dica }) : null
      ])
    ]);
  })) : vazio('Ainda não há registros', 'Rode a IA neste horário ou envie a mensagem: cada tentativa aparece aqui, com o motivo.');
  return [
    h('h4', { class: 'mg-log-sub', text: 'Pré-requisitos do envio de verdade' }),
    h('ul', { class: 'mg-log-dg' }, [
      ck(!!d.whatsappLigado, 'WhatsApp ligado neste ambiente', d.whatsappLigado ? 'DISPARO_WHATSAPP está ligado.' : 'Desligado. No Vercel, defina DISPARO_WHATSAPP=true e faça um redeploy.'),
      ck(!!d.token, 'Token da Inovstar configurado', d.token ? 'INOVSTAR_TOKEN presente.' : 'Falta o INOVSTAR_TOKEN neste ambiente.'),
      ck(!!d.numeroInformado, 'Número informado no lead de teste', d.numeroInformado ? l.telefone : 'Este lead não tem número: crie outro com o seu número.'),
      ck(!!d.numeroLiberado, 'Número liberado para teste', d.numeroLiberado ? 'Liberado: pode receber mensagem de teste de verdade.' : 'Ainda não liberado. Libere aqui mesmo, sem mexer no Vercel.', !d.numeroLiberado && d.numeroInformado ? h('button', { type: 'button', class: 'btn pri mg-lib-b', onclick: function () { mgLiberar(l.telefone); } }, 'Liberar este número') : null),
      ck(!!l.podeEnviar, 'Mensagem escolhida pela IA', l.podeEnviar ? 'Msg ' + l.ultimaMsg + ' pronta para enviar.' : 'Rode a IA neste horário primeiro: ela decide qual mensagem sai.')
    ]), acoes,
    h('h4', { class: 'mg-log-sub', text: 'Registros (do mais novo para o mais antigo)' }), lista
  ];
}
function mgLogAbrir(id) {
  var l = mgLogDoLead(id); if (!l) return;
  if (MG.logM) MG.logM.fechar();
  var m = modal({ cabecalho: [h('h2', { text: 'Log · ' + l.nome }), h('p', { text: l.telefoneInformado ? 'Número do teste: ' + l.telefone : 'Lead só simulado (sem número)' })], corpo: mgLogCorpo(l), largura: 780, classe: 'mg-log-m', aoFechar: function () { MG.logM = null; } });
  m.logId = id; MG.logM = m;
}
function mgLogRepintar() {
  if (!MG.logM) return;
  var l = mgLogDoLead(MG.logM.logId); if (!l) { MG.logM.fechar(); return; }
  var rolou = MG.logM.corpo.scrollTop; limpar(MG.logM.corpo); kids(MG.logM.corpo, mgLogCorpo(l)); MG.logM.corpo.scrollTop = rolou;
}
/* números que podem receber mensagem de teste DE VERDADE: liberados aqui mesmo (sem mexer no Vercel); os do Vercel aparecem com cadeado */
function mgLiberar(numero) {
  if (!window.confirm('Liberar ' + numero + ' para receber mensagens de teste DE VERDADE pelo WhatsApp? Use só números seus ou da equipe.')) return Promise.resolve();
  return api('POST', '/ia-manager/lab/numeros', { numero: numero, quando: MG.labQ }).then(function (r) { MG.lab = r; MG.novoNum = ''; mgLabRepintar(); aviso('Número liberado para teste.', 'ok'); }).catch(function (e) { aviso(e.message, 'erro'); });
}
function mgBloquear(numero) {
  if (!window.confirm('Tirar ' + numero + ' da lista de números de teste?')) return;
  api('DELETE', '/ia-manager/lab/numeros/' + encodeURIComponent(numero) + '?quando=' + encodeURIComponent(MG.labQ)).then(function (r) { MG.lab = r; mgLabRepintar(); aviso('Número removido da lista de teste.', 'ok'); }).catch(function (e) { aviso(e.message, 'erro'); });
}
function mgLabChk() {
  var i = h('input', { type: 'checkbox', id: 'mg-lib' }); i.checked = !!MG.lf.liberar;
  i.addEventListener('change', function () { MG.lf.liberar = i.checked; });
  return h('label', { class: 'mg-chk', for: 'mg-lib' }, [i, h('span', { text: 'Este número é meu ou da equipe: liberar para receber a mensagem de teste de verdade' })]);
}
function mgLabNumeros() {
  var nums = MG.lab && MG.lab.numeros ? MG.lab.numeros : [];
  var chips = nums.length ? nums.map(function (n) {
    return h('span', { class: 'mg-num' + (n.origem === 'ambiente' ? ' amb' : ''), title: n.origem === 'ambiente' ? 'Liberado pelo Vercel (só sai por lá)' : 'Liberado por ' + n.quem + (n.quando ? ' em ' + qDiaHora(n.quando) : '') }, [
      n.origem === 'ambiente' ? ico('lock', 12) : null, n.numero,
      n.origem === 'tela' ? h('button', { type: 'button', class: 'mg-num-x', 'aria-label': 'Remover ' + n.numero, onclick: function () { mgBloquear(n.numero); } }, ico('x', 11)) : null
    ]);
  }) : [h('small', { class: 'mut', text: 'Nenhum número liberado ainda: a simulação não envia nada de verdade.' })];
  var inp = h('input', { class: 'in', type: 'tel', inputmode: 'tel', maxlength: '20', placeholder: '(91) 98888-7777', 'aria-label': 'Número para liberar', autocomplete: 'off' }); inp.value = MG.novoNum;
  inp.addEventListener('input', function () { MG.novoNum = inp.value; });
  inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); if (MG.novoNum.trim()) mgLiberar(MG.novoNum); } });
  return h('div', { class: 'mg-nums' }, [h('small', { class: 'mg-nums-t', text: 'NÚMEROS LIBERADOS PARA TESTE DE VERDADE' }), h('div', { class: 'mg-nums-c' }, chips),
    h('div', { class: 'mg-nums-a' }, [inp, botao('Liberar', '', function () { if (MG.novoNum.trim()) mgLiberar(MG.novoNum); else aviso('Digite o número com DDD.', 'aviso'); }, 'check')])]);
}
function mgLabRemover(id) {
  if (!MG.lab) return;
  MG.lab.leads = MG.lab.leads.filter(function (x) { return x.id !== id; }); MG.labRes = null; mgLabRepintar();
  api('DELETE', '/ia-manager/lab/leads/' + encodeURIComponent(id) + '?quando=' + encodeURIComponent(MG.labQ)).then(function (r) { MG.lab = r; mgLabRepintar(); })
    .catch(function (e) { aviso(e.message, 'erro'); MG.labCar = false; mgLabCarregar(); });
}
function mgLabLimpar() {
  if (!window.confirm('Remover todos os leads de teste?')) return;
  if (MG.lab) MG.lab.leads = []; MG.labRes = null; mgLabRepintar();
  api('DELETE', '/ia-manager/lab?quando=' + encodeURIComponent(MG.labQ)).then(function (r) { MG.lab = r; mgLabRepintar(); })
    .catch(function (e) { aviso(e.message, 'erro'); MG.labCar = false; mgLabCarregar(); });
}
/* botão em andamento: fica apagado e mostra o giro, para o clique nunca parecer que "não fez nada" */
function mgOcupavel(b, tipo) { if (MG.labOcupado) { b.setAttribute('disabled', 'true'); if (MG.labOcupado === tipo) { b.classList.add('ocupado'); b.insertBefore(h('i', { class: 'mg-gira' }), b.firstChild); } } return b; }
function mgLabCampo(rotulo, el, cls) { return h('div', { class: 'mg-campo ' + (cls || '') }, [h('label', { text: rotulo }), el]); }
function mgLabForm(D) {
  var nome = h('input', { class: 'in', type: 'text', maxlength: '60', placeholder: 'Ex.: Maria Teste', 'aria-label': 'Nome do lead de teste' }); nome.value = MG.lf.nome;
  nome.addEventListener('input', function () { MG.lf.nome = nome.value; });
  var tel = h('input', { class: 'in', type: 'tel', inputmode: 'tel', maxlength: '20', placeholder: '(91) 98888-7777', 'aria-label': 'Telefone do lead de teste', autocomplete: 'off' }); tel.value = MG.lf.telefone;
  tel.addEventListener('input', function () { MG.lf.telefone = tel.value; });
  var valor = h('input', { class: 'in', type: 'number', min: '0', step: '50', 'aria-label': 'Valor do orçamento' }); valor.value = MG.lf.valor;
  valor.addEventListener('input', function () { MG.lf.valor = valor.value; });
  var un = h('select', { class: 'in', 'aria-label': 'Unidade' }, [h('option', { value: '', text: 'Sem unidade' })].concat(D.unidades.map(function (u) { return h('option', { value: u, text: u }); })));
  un.value = MG.lf.unidade; un.addEventListener('change', function () { MG.lf.unidade = un.value; });
  var tipo = h('div', { class: 'mg-seg', role: 'group', 'aria-label': 'Tipo do lead de teste' }, [['orcamento', 'Orçamento'], ['noshow', 'Faltou (No-show)']].map(function (t) {
    return h('button', { type: 'button', class: MG.lf.tipo === t[0] ? 'on' : '', 'aria-pressed': String(MG.lf.tipo === t[0]), text: t[1], onclick: function () { MG.lf.tipo = t[0]; if (t[0] === 'noshow') MG.lf.dias = 0; mgLabRepintar(); } });
  }));
  var cheio = !!MG.lab && MG.lab.leads.length >= MG.lab.limite;
  return h('article', { class: 'mg-cx mg-lab-f' }, [
    h('h4', { text: 'Novo lead de teste' }), h('p', { class: 'mut peq', text: 'Um paciente fictício. Ele só existe aqui: não aparece no CRM e nunca recebe mensagem.' }),
    mgLabCampo('Nome', nome), mgLabCampo('Telefone com DDD (opcional)', tel), h('p', { class: 'mut peq mg-tel-d', text: 'Sem número, o lead é só simulado. Com o SEU número, dá para receber a mensagem de verdade no WhatsApp depois de rodar a IA.' }), mgLabChk(), mgLabCampo('Tipo', tipo),
    h('div', { class: 'mg-lab-2' }, [mgLabCampo('Valor do orçamento (R$)', valor), mgLabCampo('Unidade', un)]),
    MG.lf.tipo === 'orcamento' ? mgLabCampo('Orçamento feito há', mgStepper(MG.lf.dias, 0, 30, 1, function (v) { MG.lf.dias = v; mgLabRepintar(); }, MG.lf.dias === 1 ? 'dia' : 'dias', 'Dias desde o orçamento')) : null,
    mgOcupavel(botao(cheio ? 'Limite de ' + MG.lab.limite + ' leads' : MG.labOcupado === 'add' ? 'Adicionando…' : 'Adicionar lead de teste', 'pri', function () { if (!cheio && !MG.labOcupado) mgLabAdicionar(); }, MG.labOcupado === 'add' ? null : 'plus'), 'add'),
    mgLabNumeros(),
    h('div', { class: 'mg-lab-ex' }, [h('small', { text: 'OU COMECE POR UM EXEMPLO' })].concat(MG_EXEMPLOS.map(function (x) {
      return h('button', { type: 'button', class: 'mg-ex', disabled: cheio || !!MG.labOcupado, onclick: function () { if (!MG.labOcupado) mgLabAdicionar(x.e); } }, [h('b', { text: x.r }), h('small', { text: x.d })]);
    })))
  ]);
}
function mgLabRelogioUi(D) {
  var q = MG.labQ, resumo = MG.labRes ? MG.labRes.filter(function (x) { return x.resultado === 'enviaria'; }).length : null;
  var inp = h('input', { class: 'in mg-rel-i', type: 'datetime-local', 'aria-label': 'Data e hora simuladas' }); inp.value = q;
  inp.addEventListener('change', function () { if (inp.value) mgLabRelogio(inp.value); });
  var chips = Object.keys(MG.c.gatilhos).filter(function (id) { return MG.c.gatilhos[id].ativo; }).map(function (id) {
    var g = D.gatilhos.filter(function (x) { return x.id === id; })[0], hora = MG.c.gatilhos[id].hora;
    return h('button', { type: 'button', class: 'mg-chip' + (q.slice(11, 16) === hora ? ' on' : ''), title: 'Ir para o horário do gatilho ' + g.rotulo, onclick: function () { mgLabRelogio(q.slice(0, 11) + hora); } }, [h('b', { text: hora }), ' ' + g.rotulo]);
  });
  var noLab = MG.lab ? MG.lab.leads.length : 0;
  return h('article', { class: 'mg-cx mg-rel' }, [
    h('div', { class: 'mg-rel-t' }, [h('div', null, [h('small', { class: 'mg-eyebrow', text: 'RELÓGIO SIMULADO' }), h('b', { class: 'mg-rel-v', text: mgRelogioTxt(q) })]), h('div', { class: 'mg-rel-b' }, [
      h('button', { type: 'button', class: 'btn', onclick: function () { mgLabRelogio(mgSomaDiaRel(q, -1)); } }, '− 1 dia'),
      h('button', { type: 'button', class: 'btn', onclick: function () { mgLabRelogio(mgSomaDiaRel(q, 1)); } }, '+ 1 dia'),
      h('button', { type: 'button', class: 'btn', onclick: function () { mgLabRelogio(mgRelogioPadrao(D)); } }, 'Agora')
    ])]),
    h('div', { class: 'mg-rel-c' }, [mgLabCampo('Data e hora (horário de Belém)', inp), mgLabCampo('Pular para o horário de um gatilho', h('div', { class: 'mg-chips' }, chips.length ? chips : [h('small', { class: 'mut', text: 'Nenhum gatilho ligado' })]))]),
    h('div', { class: 'mg-rel-r' }, [
      mgOcupavel(botao(MG.labOcupado === 'rodar' ? 'Rodando…' : 'Rodar a IA neste horário', 'pri', function () { if (!MG.labOcupado && noLab) mgLabRodar(); }, MG.labOcupado === 'rodar' ? null : 'bolt'), 'rodar'),
      noLab ? botao('Limpar tudo', '', mgLabLimpar, 'x') : null,
      resumo !== null ? h('span', { class: 'mg-rel-res ' + (resumo ? 'ok' : '') }, resumo ? 'Na última rodada, a IA enviaria ' + resumo + (resumo === 1 ? ' mensagem' : ' mensagens') : 'Na última rodada, a IA não enviaria nada') : (noLab ? null : h('span', { class: 'mut peq', text: 'Crie um lead de teste para rodar a IA.' }))
    ])
  ]);
}
/* "ver detalhes" que lembra se estava aberto: continua aberto depois de qualquer atualização da tela */
function mgDetalhes(chave, titulo, corpo) {
  var d = h('details', { class: 'mg-det', open: !!MG.detAbertos[chave] }, [h('summary', { text: titulo }), corpo]);
  d.addEventListener('toggle', function () { MG.detAbertos[chave] = d.open; });
  return d;
}
function mgLabCartao(l) {
  var dec = l.decisao;
  var res = (MG.labRes || []).filter(function (x) { return x.leadId === l.id; })[0];
  var novo = !!res && res.resultado === 'enviaria';
  var cls = novo ? 'ok' : !dec ? 'nada' : dec.tipo === 'pronto' ? 'ok' : dec.tipo === 'espera' ? 'espera' : 'nao';
  var rot = novo ? 'IA enviou agora (simulado)' : !dec ? 'Nada para a IA agora' : dec.tipo === 'pronto' ? 'Pronta para enviar' : dec.tipo === 'espera' ? 'Aguardando' : 'Não envia';
  var msgs = l.mensagens.map(function (m, i) {
    return h('div', { class: 'mg-lab-m' + (novo && i === l.mensagens.length - 1 ? ' novo' : '') }, [
      h('small', { text: qDiaHora(m.quando) + ' · Msg ' + m.msg + ' · IA (simulado)' }),
      h('div', { class: 'wa-bolha' }, [h('p', null, m.texto.split('\n').map(function (t, k) { return [k ? h('br') : null, t]; })), h('small', { class: 'wa-hora', text: 'simulado' })])
    ]);
  });
  var checks = l.checks.map(function (c) { return h('li', { class: 'mg-ck ' + (c.ok ? 'ok' : c.falha === 'espera' ? 'espera' : 'nao') }, [h('i', { 'aria-hidden': 'true', text: c.ok ? '✓' : c.falha === 'espera' ? '⏳' : '✕' }), h('div', null, [h('b', { text: c.rotulo }), h('small', { text: c.detalhe })])]); });
  var primeira = !MG.labVistos[l.id]; MG.labVistos[l.id] = 1;
  return h('article', { class: 'mg-lc ' + cls + (novo ? ' novo' : '') + (primeira ? ' entra' : '') }, [
    h('header', { class: 'mg-lc-h' }, [avatar(l.nome), h('div', { class: 'mg-lc-n' }, [h('b', { text: l.nome }), h('small', { text: (l.tipo === 'noshow' ? 'No-show' : 'Orçamento de ' + mgDm(l.d0)) + ' · ' + brl(l.valor) + (l.unidade ? ' · ' + l.unidade : '') + (l.telefoneInformado ? ' · ' + l.telefone : '') })]),
      h('button', { type: 'button', class: 'ic-btn', 'aria-label': 'Remover ' + l.nome, title: 'Remover este lead de teste', onclick: function () { mgLabRemover(l.id); } }, ico('x', 14))]),
    h('div', { class: 'mg-lc-d' }, [h('span', { class: 'mg-lc-p', text: rot }), h('span', { class: 'mg-lc-m', text: novo ? 'A IA enviou a Msg ' + res.msg + ' (simulado). ' : (dec ? dec.motivo : (l.proximo ? '' : 'Sem passo pendente: as regras do guia movem o lead com o passar dos dias.')) })]),
    h('div', { class: 'mg-zap' }, [
      l.telefoneInformado ? (function () { var bz = mgOcupavel(botao(l.enviosOk > 0 ? 'Enviar novamente' : 'Enviar no WhatsApp', '', function () { mgLabEnviar(l); }, 'message'), 'env'); if (!l.podeEnviar || !l.numeroLiberado) bz.setAttribute('disabled', 'true'); return bz; })() : null,
      l.telefoneInformado && !l.numeroLiberado ? botao('Liberar este número', 'pri', function () { mgLiberar(l.telefone); }, 'check') : null,
      botao('Ver log' + (l.log && l.log.length ? ' (' + l.log.length + ')' : ''), '', function () { mgLogAbrir(l.id); }, 'list'),
      h('small', { class: 'mut', text: !l.telefoneInformado ? 'Sem número: só simulado. Crie um lead com o seu número para receber a mensagem de verdade.' : !l.podeEnviar ? 'Rode a IA primeiro: ela decide qual mensagem sai.' : !l.numeroLiberado ? 'Este número ainda não está liberado para teste: clique em "Liberar este número" (não precisa mexer no Vercel).' : l.enviosOk > 0 ? 'Já enviado ' + l.enviosOk + 'x. Se não chegou, abra o log.' : 'Manda a mensagem acima de verdade para ' + l.telefone + '.' })
    ]),
    l.proximo ? h('p', { class: 'mut peq', text: 'Próximo passo do guia: ' + l.proximo.passo + (l.proximo.msg ? ' (Msg ' + l.proximo.msg + ')' : '') + ', vence ' + mgDm(l.proximo.vence) + '.' }) : null,
    msgs.length ? h('div', { class: 'mg-lab-wa' }, msgs) : null,
    checks.length ? mgDetalhes(l.id, 'Ver as ' + checks.length + ' checagens desta decisão', h('ul', { class: 'mg-cks' }, checks)) : null
  ]);
}
function mgLab(D) {
  if (!MG.labQ) MG.labQ = mgRelogioPadrao(D);
  if (!MG.lab) mgLabCarregar();
  var leads = MG.lab ? MG.lab.leads : [];
  var lista = !MG.lab ? h('div', { class: 'it-carrega' }, [h('i'), h('i'), h('i')]) : leads.length || MG.labOcupado === 'add' ? h('div', { class: 'mg-lc-g' }, (MG.labOcupado === 'add' ? [h('article', { class: 'mg-lc criando', 'aria-busy': 'true' }, [h('i'), h('i'), h('i')])] : []).concat(leads.map(mgLabCartao))) : h('div', { class: 'mg-lab-vazio' }, [h('b', { text: 'O laboratório está vazio' }), h('p', { text: 'Crie um lead de teste ao lado (ou escolha um exemplo), ajuste o relógio e clique em "Rodar a IA neste horário" para ver a IA decidir, escolher a mensagem e preencher as variáveis.' })]);
  return h('section', { class: 'mg-bloco mg-labo', id: 'mg-lab' }, [
    h('header', { class: 'mg-sh mg-sec', style: '--i:11' }, [h('div', null, [h('h3', { text: 'Laboratório de simulação' }), h('p', { text: 'A IA trabalhando de ponta a ponta com pacientes fictícios, no dia e na hora que você escolher. Usa a configuração salva e as mesmas regras da IA de verdade.' })]), h('span', { class: 'mg-badge', text: 'MODO SIMULAÇÃO' })]),
    h('div', { class: 'mg-lab-g mg-sec', style: '--i:12' }, [mgLabForm(D), h('div', { class: 'mg-lab-d' + (MG.labAtual ? ' atualizando' : '') }, [mgLabRelogioUi(D), lista])])
  ]);
}
function mgSimulador(D) {
  if (D.modo === 'simulacao') return mgLab(D);
  var cta = h('article', { class: 'mg-cx mg-cx-l mg-sec mg-cta', style: '--i:11' }, [
    h('div', null, [h('h4', { text: 'Quer testar com um paciente fictício?' }), h('p', { class: 'mut', text: 'O Modo Simulação abre um laboratório: você cria leads de teste, escolhe o dia e a hora e vê a IA decidir, escolher a mensagem e "enviar", sem tocar em nenhum paciente real.' })]),
    botao('Ativar Modo simulação', 'pri', function () { if (D.modo === 'desligado' || window.confirm('Trocar para o Modo simulação? Enquanto estiver nele, a IA não trabalha nos leads reais.')) mgDefinirModo('simulacao'); }, 'bolt')
  ]);
  return h('div', { class: 'mg-bloco' }, [cta]);
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
  MG.salvando = true; MG.erro = ''; mgRepintar(['barra']);
  api('PUT', '/ia-manager', { config: MG.c }).then(function (d) {
    MG.d = d; MG.t = Date.now(); MG.c = mgClone(d.config); MG.base = mgClone(d.config); MG.salvando = false; MG.salvou = true;
    aviso('Configuração da IA salva.', 'ok'); mgRepintar(['linha', 'gat', 'glob', 'hist', 'barra']); setTimeout(function () { MG.salvou = false; }, 1500);
  }).catch(function (e) { MG.salvando = false; MG.erro = e.message; mgRepintar(['barra']); });
}
function mgBarraSalvar() {
  var sujo = mgSujo();
  if (!sujo && !MG.salvou) return null;
  return h('div', { class: 'mg-barra' + (MG.erro ? ' erro' : '') + (MG.salvou && !sujo ? ' salvo' : ''), role: 'region', 'aria-label': 'Alterações da IA' }, [
    h('div', { class: 'mg-barra-t' }, [h('i', { 'aria-hidden': 'true' }), h('div', null, [h('b', { text: MG.salvou && !sujo ? 'Salvo!' : 'Você tem alterações não salvas' }), MG.erro ? h('small', { text: MG.erro }) : h('small', { text: 'As mudanças só valem para a IA depois de salvar.' })])]),
    sujo ? h('div', { class: 'mg-barra-b' }, [botao('Descartar', '', function () { MG.c = mgClone(MG.base); MG.erro = ''; mgRepintar(['linha', 'gat', 'glob', 'barra']); }), botao(MG.salvando ? 'Salvando…' : 'Salvar alterações', 'pri', function () { if (!MG.salvando) mgSalvar(); }, 'check')]) : null
  ]);
}
function telaIAManager() {
  mgPedir(false);
  var cab = cabecalhoTela('IA Manager', 'O centro de controle da IA de disparo: Power, horário de cada gatilho, condições, parâmetros e limites, e tudo o que os pacientes responderam. O guia continua mandando: a IA só pode estreitar as regras, nunca ampliar.');
  var abas = h('div', { class: 'tabs-an', role: 'tablist' }, [['controle', 'Controle'], ['respostas', 'Respostas e fila'], ['performance', 'IA Performance']].map(function (t) {
    return h('button', { type: 'button', role: 'tab', class: 'tab-an', 'aria-selected': String(MG.aba === t[0]), text: t[1], onclick: function () { MG.aba = t[0]; desenhar(); } });
  }));
  if (MG.aba === 'respostas') return h('div', { class: 'tela mg' }, [cab, abas, corpoIA(), mgBarraSalvar()]);
  if (MG.aba === 'performance') return h('div', { class: 'tela mg' }, [cab, abas, corpoIAPerf(), mgBarraSalvar()]);
  if (!MG.d || !MG.c) return h('div', { class: 'tela mg' }, [cab, abas, esqueleto()]);
  MG.animar = !MG.entrou; MG.entrou = true;
  var sec = function (k, el) { if (el) el.setAttribute('data-mg', k); return el; };
  var pagina = h('div', { class: 'tela mg' + (MG.animar ? ' mg-anim' : '') + (MG.pend ? ' mg-pend' : '') + ' mg-' + MG.d.modo }, [cab, abas, mgHero(MG.d), sec('linha', mgLinha(MG.d)), sec('gat', mgGatilhos(MG.d)), sec('glob', mgGlobais(MG.d)), sec('lab', mgSimulador(MG.d)), sec('hist', mgHistorico(MG.d)), sec('barra', mgBarraSalvar())]);
  if (MG.animar) setTimeout(function () { var t = document.querySelector('.tela.mg'); if (t) t.classList.remove('mg-anim'); }, 2600);
  return pagina;
}
`;
