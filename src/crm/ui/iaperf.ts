// JavaScript do CRM (navegador): aba "IA Performance" do IA Manager. Dados de /painel/crm/api/disparo-auto/performance (analisarIAPerformance em src/crm/ia-performance.ts).
// Dentro dele não usar crases nem "dollar-chave".
export const iaPerfUi = String.raw`
var IP_C = {};
var IP_DOW = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

function pedirIAPerf() {
  var k = perChave('iamanager'), c = IP_C[k];
  if (c && (c.carregando || Date.now() - c.t < 30000)) return c.d;
  IP_C[k] = { t: c ? c.t : 0, d: c ? c.d : null, carregando: true };
  api('GET', '/disparo-auto/performance?' + perQs('iamanager')).then(function (d) { IP_C[k] = { t: Date.now(), d: d, carregando: false }; if (S.aba === 'iamanager' && MG.aba === 'performance') desenhar(true); })
    .catch(function (e) { IP_C[k] = { t: Date.now(), d: c ? c.d : null, carregando: false }; aviso('Não consegui calcular a performance da IA: ' + e.message, 'erro'); });
  return c ? c.d : null;
}
function ipPct(v) { return v === null || v === undefined ? '–' : nf1.format(v) + '%'; }
function ipDur(min) {
  if (min === null || min === undefined) return '–';
  if (min < 1) return 'menos de 1 min';
  if (min < 60) return Math.round(min) + ' min';
  if (min < 1440) return nf1.format(min / 60) + ' h';
  return nf1.format(min / 1440) + ' d';
}
function ipAcum(a) { var s = 0; return a.map(function (v) { s += v; return s; }); }
function ipSufixo(D) { return D.periodo.semanal ? 'por semana' : 'por dia'; }

function ipKpis(D) {
  var a = D.atual, p = D.anterior, s = D.serie, f = D.funil;
  var convAlc = f.alcancados ? Math.round(f.converteram / f.alcancados * 1000) / 10 : null;
  return h('div', { class: 'kpis2 seis' }, [
    kpi2({ rotulo: 'Mensagens enviadas', valor: nf0.format(a.enviadas), delta: dltP(a.enviadas, p.enviadas, { bom: 'sobe' }), sub: nf0.format(a.leads) + ' ' + plural(a.leads, 'paciente alcançado', 'pacientes alcançados'), serie: s.enviadas, cor: COR.contatos }),
    kpi2({ rotulo: 'Taxa de resposta', valor: ipPct(a.taxaResposta), delta: dltP(a.taxaResposta, p.taxaResposta, { pp: true, bom: 'sobe' }), sub: a.respostas + ' ' + plural(a.respostas, 'resposta', 'respostas') + ' · 1ª em ' + ipDur(a.tempoResposta), serie: semNulos(s.taxaResposta), cor: COR.respostas }),
    kpi2({ rotulo: 'Agendamentos pela IA', valor: nf0.format(a.agendamentos), delta: dltP(a.agendamentos, p.agendamentos, { bom: 'sobe' }), sub: a.agSozinha + ' sem contato da equipe no meio', serie: s.agendamentos, cor: COR.agendamentos }),
    kpi2({ rotulo: 'Conversões', valor: nf0.format(a.conversoes), delta: dltP(a.conversoes, p.conversoes, { bom: 'sobe' }), sub: 'compareceram e pagaram', serie: s.conversoes, cor: COR.convertidos }),
    kpi2({ rotulo: 'Receita recuperada', valor: brlCompacto(D.receita.total), delta: dltP(D.receita.total, D.receita.anterior, { bom: 'sobe' }), sub: D.receita.pacientes ? D.receita.pacientes + ' ' + plural(D.receita.pacientes, 'paciente recuperado', 'pacientes recuperados') + ' · ticket ' + brl(D.receita.ticket || 0) : 'nenhum paciente recuperado no período', serie: s.receita, cor: COR.convertidos }),
    kpi2({ rotulo: 'Conversão dos alcançados', valor: ipPct(convAlc), sub: f.converteram + ' de ' + f.alcancados + ' ' + plural(f.alcancados, 'paciente', 'pacientes'), cor: COR.convertidos })
  ]);
}

function ipRecuperada(D) {
  var R = D.receita, tot = R.total;
  var parte = function (rotulo, dica, valor, n, cor) {
    return h('div', { class: 'ip-rec-p' }, [h('i', { style: 'background:' + cor, 'aria-hidden': 'true' }), h('div', null, [h('small', { text: rotulo }), h('b', { text: brl(valor) }), h('span', { text: n + ' ' + plural(n, 'paciente', 'pacientes') + ' · ' + dica })])]);
  };
  var barra = tot > 0 ? empilhada([{ rotulo: 'Orçamentos', valor: R.orcamentos.valor, cor: COR.convertidos }, { rotulo: 'No-show', valor: R.noshow.valor, cor: COR.agendamentos }], { semLegenda: true }) : null;
  var esq = h('div', { class: 'ip-rec-n' }, [
    h('small', { text: 'Receita recuperada pela IA' }),
    h('b', { text: brl(tot) }),
    perComparar() ? dlt(tot, R.anterior, { bom: 'sobe' }) : null,
    h('span', { text: R.pacientes ? R.pacientes + ' ' + plural(R.pacientes, 'paciente pagou', 'pacientes pagaram') + ' depois de uma mensagem da IA' + (R.ticket ? ' · ticket médio ' + brl(R.ticket) : '') : 'Nenhum paciente pagou depois de uma mensagem da IA neste período.' }),
    barra
  ]);
  var dir = h('div', { class: 'ip-rec-d' }, [
    parte('Orçamentos recuperados', 'compareceram e pagaram', R.orcamentos.valor, R.orcamentos.n, COR.convertidos),
    parte('No-show recuperado', 'faltaram e voltaram', R.noshow.valor, R.noshow.n, COR.agendamentos),
    parte('A receber', 'agendados pela IA, ainda não pagaram', R.aReceber.valor, R.aReceber.n, 'var(--g5)')
  ]);
  return blocoCartao('Receita recuperada', 'O dinheiro que a IA trouxe de volta no período: pacientes que pagaram depois de uma mensagem dela (orçamentos e faltas). Cada paciente conta uma vez.',
    h('div', { class: 'ip-rec' }, [esq, dir, h('p', { class: 'mut peq ip-rec-t', text: 'Desde o primeiro envio: ' + brl(R.totalDesdeOComeco) + ' recuperados (' + R.pacientesDesdeOComeco + ' ' + plural(R.pacientesDesdeOComeco, 'paciente', 'pacientes') + ').' })]), 12);
}

function ipInsights(D) {
  if (!D.insights.length) return null;
  var tons = { bom: 'pl-ok', atencao: 'pl-atrasada', info: '' };
  return blocoCartao('O que os números dizem', 'Leitura automática do período. Só aparece o que tem base nos envios de verdade.',
    h('div', { class: 'ip-ins' }, D.insights.map(function (x) {
      return h('div', { class: 'ip-in ip-' + x.tom }, [h('i', { 'aria-hidden': 'true' }), h('div', null, [h('b', { text: x.titulo }), h('span', { text: x.texto })])]);
    })), 12);
}

function ipEvolucao(D) {
  var s = D.serie, r = [];
  r.push(blocoCartao('Mensagens, respostas e conversões', 'Envios da IA, quantas tiveram resposta do paciente em até ' + D.regras.respostaHoras + ' h e quantos pacientes converteram (compareceram e pagaram), ' + ipSufixo(D) + '.',
    linhasTempo({ rotulos: s.rotulos, titulos: s.titulos, altura: 250, area: true, aria: 'Mensagens enviadas, respostas e conversões ao longo do tempo', series: [{ nome: 'Enviadas', cor: COR.contatos, valores: s.enviadas }, { nome: 'Responderam', cor: COR.respostas, valores: s.respostas }, { nome: 'Convertidos', cor: COR.convertidos, valores: s.conversoes }] }), 8));
  r.push(blocoCartao('Taxa de resposta', 'Respostas ÷ envios de cada ponto.',
    soma(s.enviadas) ? linhasTempo({ rotulos: s.rotulos, titulos: s.titulos, altura: 250, pct: true, fmt: ipPct, aria: 'Taxa de resposta ao longo do tempo', series: [{ nome: 'Taxa de resposta', cor: COR.respostas, valores: s.taxaResposta }] }) : vazio('Sem envios no período.'), 4));
  r.push(blocoCartao('Agendamentos e conversões', 'O que aconteceu depois de uma mensagem da IA (até ' + D.regras.resultadoDias + ' dias antes), ' + ipSufixo(D) + '.',
    soma(s.agendamentos) + soma(s.conversoes) ? colunasAgrupadas({ rotulos: s.rotulos, titulos: s.titulos, altura: 250, aria: 'Agendamentos e conversões atribuídos à IA', series: [{ nome: 'Agendamentos', cor: COR.agendamentos, valores: s.agendamentos }, { nome: 'Conversões', cor: COR.convertidos, valores: s.conversoes }] }) : vazio('Nenhum agendamento nem conversão atribuído à IA no período.'), 6));
  var ac = ipAcum(s.receita);
  r.push(blocoCartao('Receita recuperada ao longo do período', 'Valor dos pacientes que pagaram depois de uma mensagem da IA, somando dia a dia.',
    soma(s.receita) ? areaGradiente({ valores: ac, rotulos: s.rotulos, titulos: s.titulos, cor: 'var(--g3)', fmt: brlCompacto, altura: 250, nomeAcum: 'acumulado', porPonto: s.receita, aria: 'Receita recuperada acumulada' }) : vazio('Nenhuma receita recuperada pela IA no período.'), 6, destaqueNum(brl(D.receita.total), 'no período')));
  return r;
}

function ipFunil(D) {
  var f = D.funil, base = f.alcancados;
  var rel = function (n) { return base ? Math.round(n / base * 100) + '%' : ''; };
  var itens = [
    { rotulo: 'Alcançados pela IA', n: f.alcancados, cor: COR.contatos, extra: '100%', dica: [{ valor: String(f.alcancados), rotulo: 'pacientes com mensagem da IA' }] },
    { rotulo: 'Responderam', n: f.responderam, cor: COR.respostas, extra: rel(f.responderam), dica: [{ valor: String(f.responderam), rotulo: 'responderam a uma mensagem' }] },
    { rotulo: 'Agendaram', n: f.agendaram, cor: COR.agendamentos, extra: rel(f.agendaram), dica: [{ valor: String(f.agendaram), rotulo: 'agendaram depois do contato' }] },
    { rotulo: 'Converteram', n: f.converteram, cor: COR.convertidos, extra: rel(f.converteram), dica: [{ valor: String(f.converteram), rotulo: 'compareceram e pagaram' }, { valor: brl(f.receita), rotulo: 'em receita' }] }
  ];
  var notas = h('div', { class: 'ip-notas' }, [
    h('span', null, [h('b', { text: String(f.emNegociacao) }), ' em negociação agora']),
    h('span', null, [h('b', { text: String(f.descartados) }), ' ' + plural(f.descartados, 'descartado', 'descartados')]),
    h('span', { class: f.pediramParar ? 'ip-alerta' : '' }, [h('b', { text: String(f.pediramParar) }), ' ' + plural(f.pediramParar, 'pediu', 'pediram') + ' para parar de receber'])
  ]);
  return blocoCartao('Funil dos pacientes alcançados', 'Dos pacientes que receberam a primeira mensagem da IA no período, até onde chegaram (hoje).', h('div', null, [degraus({ itens: itens, aria: 'Funil da IA: alcançados, responderam, agendaram, converteram' }), notas]), 6);
}

function ipEtapas(D) {
  var r = {};
  var pp = D.porPasso;
  var cabecas = ['Etapa', 'Enviadas', 'Respostas', 'Taxa', 'Agend.', 'Conversões', 'Receita', '1ª resposta'];
  var linhas = pp.map(function (e) {
    return h('tr', null, [h('td', null, h('b', { text: e.rotulo })), h('td', { class: 'num', text: nf0.format(e.enviadas) }), h('td', { class: 'num', text: nf0.format(e.respostas) }), h('td', { class: 'num' }, h('b', { text: ipPct(e.taxaResposta) })),
      h('td', { class: 'num', text: nf0.format(e.agendamentos) }), h('td', { class: 'num', text: nf0.format(e.conversoes) }), h('td', { class: 'num', text: e.receita ? brl(e.receita) : '–' }), h('td', { class: 'num', text: ipDur(e.tempoResposta) })]);
  });
  r.tabela = (blocoCartao('Performance em cada etapa da cadência', 'Cada linha é uma mensagem da cadência do guia. Agendamentos e conversões são creditados à última mensagem da IA antes do resultado.',
    pp.length ? h('div', { class: 'tbl-w' }, h('table', { class: 'tbl' }, [h('thead', null, h('tr', null, cabecas.map(function (c, i) { return h('th', { scope: 'col', class: i ? 'num' : '', text: c }); }))), h('tbody', null, linhas)])) : vazio('Sem envios no período.'), 12));
  r.taxa = (blocoCartao('Taxa de resposta por etapa', 'Qual mensagem mais faz o paciente responder.',
    barras(pp.filter(function (e) { return e.enviadas > 0; }).map(function (e) { return { rotulo: e.rotulo, valor: e.taxaResposta || 0, texto: ipPct(e.taxaResposta), extra: e.enviadas + ' ' + plural(e.enviadas, 'envio', 'envios'), cor: COR.respostas, dica: { titulo: e.rotulo, linhas: [{ valor: ipPct(e.taxaResposta), rotulo: 'de resposta' }, { valor: e.respostas + ' de ' + e.enviadas, rotulo: 'envios' }] } }; }), { max: 100, vazio: 'Sem envios no período.' }), 6));
  r.resultado = (blocoCartao('Resultado por etapa', 'Agendamentos e conversões creditados a cada mensagem.',
    pp.some(function (e) { return e.agendamentos || e.conversoes; }) ? colunasAgrupadas({ rotulos: pp.map(function (e) { return e.rotulo; }), altura: 230, aria: 'Agendamentos e conversões por etapa', series: [{ nome: 'Agendamentos', cor: COR.agendamentos, valores: pp.map(function (e) { return e.agendamentos; }) }, { nome: 'Conversões', cor: COR.convertidos, valores: pp.map(function (e) { return e.conversoes; }) }] }) : vazio('Nenhum resultado atribuído no período.'), 6));
  return r;
}

function ipQuando(D) {
  var r = [];
  r.push(blocoCartao('Quando a IA envia', 'Volume de envios por dia da semana e hora (horário de Brasília).', soma(D.horas.map(function (x) { return x.enviadas; })) ? mapaCalor(D.calor, { unidade: 'envios' }) : vazio('Sem envios no período.'), 6));
  var hs = D.horas;
  r.push(blocoCartao('Resposta por horário de envio', 'Taxa de resposta conforme a hora em que a mensagem saiu.',
    hs.length ? colunas({ valores: hs.map(function (x) { return x.taxa || 0; }), rotulos: hs.map(function (x) { return String(x.hora).padStart(2, '0') + 'h'; }), cor: COR.respostas, altura: 230, aria: 'Taxa de resposta por hora de envio', dica: function (i) { var x = hs[i]; return { titulo: String(x.hora).padStart(2, '0') + 'h', linhas: [{ cor: COR.respostas, valor: ipPct(x.taxa), rotulo: 'de resposta' }, { valor: x.respostas + ' de ' + x.enviadas, rotulo: 'envios' }] }; } }) : vazio('Sem envios no período.'), 8));
  var dw = D.semana.filter(function (x) { return x.enviadas > 0; });
  r.push(blocoCartao('Resposta por dia da semana', 'Em que dia a mensagem rende mais.',
    dw.length ? colunas({ valores: dw.map(function (x) { return x.taxa || 0; }), rotulos: dw.map(function (x) { return IP_DOW[x.dow].slice(0, 3); }), cor: COR.respostas, altura: 210, aria: 'Taxa de resposta por dia da semana', dica: function (i) { var x = dw[i]; return { titulo: IP_DOW[x.dow], linhas: [{ cor: COR.respostas, valor: ipPct(x.taxa), rotulo: 'de resposta' }, { valor: x.respostas + ' de ' + x.enviadas, rotulo: 'envios' }] }; } }) : vazio('Sem envios no período.'), 4));
  var tf = D.tempoFaixas, totalT = soma(tf.map(function (x) { return x.n; }));
  r.push(blocoCartao('Quanto tempo o paciente leva para responder', 'Tempo entre a mensagem da IA e a primeira resposta.',
    totalT ? colunas({ valores: tf.map(function (x) { return x.n; }), rotulos: tf.map(function (x) { return x.rotulo; }), cor: COR.respostas, altura: 210, aria: 'Tempo até a resposta', dica: function (i) { return { titulo: tf[i].rotulo, linhas: [{ cor: COR.respostas, valor: String(tf[i].n), rotulo: pct(tf[i].n / totalT * 100) + ' das respostas' }] }; } }) : vazio('Nenhuma resposta no período.'), 6));
  /* a cor é da intenção (não da posição): sem interesse é sempre vermelho, agendar sempre verde */
  var COR_INT = { agendar: 'var(--g3)', valor_horario: 'var(--g1)', duvida: 'var(--g4)', ainda_quer: 'var(--g2)', reagendar: 'var(--g5)', ja_fez: 'var(--g6)', sem_interesse: 'var(--bad)', outro: 'var(--mut)' };
  r.push(blocoCartao('O que os pacientes respondem', 'Intenção de cada resposta, lida do botão ou do texto.',
    D.intencoes.length ? rosca(D.intencoes.map(function (x, i) { return { rotulo: x.rotulo, valor: x.n, cor: COR_INT[x.id] || 'var(--mut)' }; }), { vazio: 'Nenhuma resposta no período.' }) : vazio('Nenhuma resposta no período.'), 6));
  return r;
}

function ipSegmentos(D) {
  var r = [];
  r.push(blocoCartao('Envios da IA por unidade', 'Envios da IA e taxa de resposta em cada unidade.',
    barras(D.porUnidade.map(function (u) { return { rotulo: u.unidade, valor: u.enviadas, texto: nf0.format(u.enviadas), extra: ipPct(u.taxaResposta) + ' resp. · ' + u.agendamentos + ' agend.', cor: COR.contatos, dica: { titulo: u.unidade, linhas: [{ valor: nf0.format(u.enviadas), rotulo: 'envios' }, { valor: ipPct(u.taxaResposta), rotulo: 'de resposta' }, { valor: String(u.agendamentos), rotulo: 'agendamentos' }, { valor: brl(u.receita), rotulo: 'em receita' }] } }; }), { vazio: 'Sem envios no período.' }), 6));
  r.push(blocoCartao('Por valor do orçamento', 'A IA funciona melhor em orçamentos maiores ou menores?',
    barras(D.porValor.map(function (x) { return { rotulo: x.rotulo, valor: x.taxaResposta || 0, texto: ipPct(x.taxaResposta), extra: x.enviadas + ' envios · ' + x.agendamentos + ' agend.', cor: COR.respostas }; }), { max: 100, vazio: 'Sem envios no período.' }), 6));
  return r;
}

function ipNoShow(D) {
  var n = D.noshow;
  var kp = h('div', { class: 'kpis2' }, [
    kpi2({ rotulo: 'Convites enviados', valor: nf0.format(n.enviadas), sub: 'Msg 10 · reagendar quem faltou', cor: COR.contatos }),
    kpi2({ rotulo: 'Responderam', valor: ipPct(n.taxaResposta), sub: n.respostas + ' ' + plural(n.respostas, 'resposta', 'respostas'), cor: COR.respostas }),
    kpi2({ rotulo: 'Reagendaram', valor: nf0.format(n.reagendados), sub: 'depois do convite da IA', cor: COR.agendamentos }),
    kpi2({ rotulo: 'Compareceram', valor: nf0.format(n.compareceram), sub: 'e pagaram', cor: COR.convertidos }),
    kpi2({ rotulo: 'Receita recuperada', valor: brlCompacto(n.valorRecuperado), sub: n.recuperadosNoPipeline + ' ' + plural(n.recuperadosNoPipeline, 'paciente recuperado', 'pacientes recuperados'), cor: COR.convertidos })
  ]);
  return blocoCartao('Recuperação de no-show pela IA', 'A IA convida quem faltou a reagendar, no dia seguinte à falta.', kp, 12);
}

function ipEsperando(D) {
  if (!D.esperando.length) return null;
  var lista = h('div', { class: 'ip-esp' }, D.esperando.map(function (x) {
    return h('button', { type: 'button', class: 'ip-esp-i', onclick: function () { abrirLead(x.leadId); } }, [
      h('span', { class: 'ip-esp-n' }, [h('b', { text: x.nome }), h('small', { text: x.intencao + (x.texto ? ' · "' + x.texto + '"' : '') })]),
      h('span', { class: 'ip-esp-v', text: brlCompacto(x.valor) }),
      h('span', { class: 'pill ' + (x.horas >= 24 ? 'pl-atrasada' : ''), text: 'há ' + (x.horas >= 24 ? Math.floor(x.horas / 24) + ' d' : x.horas + ' h') })
    ]);
  }));
  return blocoCartao('Pediram algo à IA e esperam a equipe', 'Responderam querendo agendar, saber o valor ou tirar dúvida, e ninguém da equipe falou com eles depois. Clique para abrir o lead.', lista, 12, destaqueNum(String(D.totalEsperando), 'aguardando'));
}

function ipHistorico(D) {
  var H = D.desdeOComeco, r = [];
  var ate = D.primeiroEnvio ? 'desde ' + dBRfull(D.primeiroEnvio) : '';
  r.push(blocoCartao('Receita recuperada desde o primeiro envio', 'Tudo o que a IA já trouxe de volta, semana a semana ' + ate + ' (não depende do período escolhido).',
    areaGradiente({ valores: H.acumReceita, rotulos: H.rotulos, cor: 'var(--g3)', fmt: brlCompacto, altura: 210, nomeAcum: 'receita recuperada', porPonto: H.receita, aria: 'Receita recuperada acumulada desde o primeiro envio' }), 6, destaqueNum(brlCompacto(D.receita.totalDesdeOComeco), 'recuperada')));
  r.push(blocoCartao('Agendamentos e conversões acumulados', 'Quanto a IA já trouxe, somando semana a semana.',
    linhasTempo({ rotulos: H.rotulos, altura: 210, area: true, aria: 'Agendamentos e conversões acumulados', series: [{ nome: 'Agendamentos', cor: COR.agendamentos, valores: H.acumAgendamentos }, { nome: 'Conversões', cor: COR.convertidos, valores: H.acumConversoes }] }), 6));
  r.push(blocoCartao('Mensagens por semana', 'Volume de envios da IA, semana a semana.', colunas({ valores: H.enviadas, rotulos: H.rotulos, cor: COR.contatos, altura: 200, rotuloCada: Math.max(1, Math.ceil(H.rotulos.length / 12)), aria: 'Mensagens enviadas por semana', dica: function (i) { return { titulo: 'Semana até ' + H.rotulos[i], linhas: [{ cor: COR.contatos, valor: nf0.format(H.enviadas[i]), rotulo: 'envios' }, { valor: ipPct(H.taxaResposta[i]), rotulo: 'de resposta' }] }; } }), 6));
  r.push(blocoCartao('Taxa de resposta por semana', 'A IA está melhorando com o tempo?', linhasTempo({ rotulos: H.rotulos, altura: 200, pct: true, fmt: ipPct, aria: 'Taxa de resposta por semana', series: [{ nome: 'Taxa de resposta', cor: COR.respostas, valores: H.taxaResposta }] }), 6));
  return r;
}

function ipRegras(D) {
  return h('p', { class: 'mut peq ip-regras', text: 'Como contamos: uma mensagem conta como respondida se o paciente respondeu em até ' + D.regras.respostaHoras + ' horas e antes da próxima mensagem da IA. Receita recuperada é o valor de quem pagou depois de uma mensagem da IA (compareceu e pagou, ou o no-show que a equipe levou para Recuperado depois do convite). Agendamento e conversão são da IA quando acontecem em até ' + D.regras.resultadoDias + ' dias depois de uma mensagem dela, e o crédito vai para a última mensagem antes do resultado. "Sem contato da equipe" quer dizer que ninguém da equipe contatou o paciente nesse intervalo. Só entram envios feitos pela IA de verdade (nada de simulação nem sombra).' });
}

function corpoIAPerf() {
  var D = pedirIAPerf();
  if (!D) return esqueleto();
  if (!D.temDados) return vazio('A IA ainda não enviou nenhuma mensagem', 'Assim que ela ligada começar a enviar, os resultados aparecem aqui: respostas, agendamentos, conversões, recuperação de no-show e o desempenho de cada etapa.');
  var blocos = [ipKpis(D), h('div', { class: 'g12' }, [ipRecuperada(D)]), ipInsights(D)];
  var et = ipEtapas(D), q = ipQuando(D);
  var grupos = [ipEvolucao(D), [ipFunil(D), et.taxa, et.tabela, et.resultado, q[0], q[1], q[2], q[3], q[4]], ipSegmentos(D), [ipNoShow(D), ipEsperando(D)], ipHistorico(D)];
  var cards = [];
  grupos.forEach(function (g) { g.forEach(function (c) { if (c) cards.push(c); }); });
  return h('div', { class: 'ip' }, [blocos[0], blocos[1], blocos[2], h('div', { class: 'g12' }, cards), ipRegras(D)]);
}
`;
