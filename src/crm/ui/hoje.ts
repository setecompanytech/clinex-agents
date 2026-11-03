// JavaScript do CRM (navegador): tela Hoje, a visão operacional do dia. Os números vêm de S.D.analise (src/crm/analise.ts).
// Dentro dele não usar crases nem "dollar-chave".
export const hoje = String.raw`
var COR_STATUS = { aberto: 'var(--c-aberto)', sem_retorno: 'var(--c-sem)', negociacao: 'var(--c-neg)', agendado: 'var(--c-agend)' };
var GLIFO_N = { critico: '◆', atencao: '▲', info: '■', bom: '●' };
var ROTULO_N = { critico: 'Crítico', atencao: 'Atenção', info: 'Informativo', bom: 'Positivo' };
/* cor fixa de cada entidade em TODOS os gráficos do CRM */
var COR = { novos: 'var(--g5)', contatos: 'var(--g6)', respostas: 'var(--g1)', agendamentos: 'var(--g2)', convertidos: 'var(--g3)', descartados: 'var(--bad)' };

function saudacao() { var t = horaBelem(); return t.h < 12 ? 'Bom dia' : t.h < 18 ? 'Boa tarde' : 'Boa noite'; }
function dataExtenso(dia) { return new Date(dia + 'T12:00:00-03:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }); }
function dataCurta(dia) { return new Date(dia + 'T12:00:00-03:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: TZ }); }
function b(t) { return h('b', { text: t }); }
function semNulos(arr) { var ult = 0; return arr.map(function (v) { if (v !== null && v !== undefined) ult = v; return ult; }); }

/* variação em relação ao período anterior (cor = direção x se subir é bom) */
function dlt(atual, ant, o) {
  o = o || {};
  if (atual === null || atual === undefined || ant === null || ant === undefined) return h('span', { class: 'dlt neutro', text: 'sem base anterior' });
  var dif, txt;
  if (o.pp) { dif = atual - ant; txt = (dif >= 0 ? '+' : '−') + nf1.format(Math.abs(dif)) + ' p.p.'; }
  else if (ant === 0) { dif = atual > 0 ? 1 : 0; txt = atual > 0 ? 'novo' : '0%'; }
  else { dif = (atual - ant) / ant * 100; txt = (dif >= 0 ? '+' : '−') + (Math.abs(dif) > 999 ? '999%+' : nf0.format(Math.abs(dif)) + '%'); }
  var igual = Math.abs(dif) < 0.05;
  var cls = !o.bom || igual ? 'neutro' : ((dif > 0) === (o.bom === 'sobe') ? 'bom' : 'ruim');
  return h('span', { class: 'dlt ' + cls, title: 'Comparado ao período anterior, de mesmo tamanho' }, [h('i', { 'aria-hidden': 'true', text: igual ? '■' : dif > 0 ? '▲' : '▼' }), txt, h('em', { text: ' ' + (o.vs || 'vs. anterior') })]);
}

function kpi2(o) {
  return h('div', { class: 'kpi2 ' + (o.tom || '') }, [
    h('div', { class: 'kpi2-h' }, [h('span', { class: 'kpi-r', text: o.rotulo }), o.serie ? spark(o.serie, o.cor || 'var(--g1)', 72, 26) : null]),
    h('b', { class: 'kpi-v', text: o.valor }),
    o.delta || null,
    o.sub ? h('small', { class: 'kpi2-s', text: o.sub }) : null
  ]);
}

/* cartão de gráfico: título, uma linha de contexto e (opcional) um número-resumo à direita */
function blocoCartao(titulo, sub, corpo, span, destaque, id) {
  return h('section', { class: 'cartao sp' + span, id: id || null }, [
    h('header', { class: 'card-h' }, [h('div', null, [h('h3', { text: titulo }), sub ? h('p', { text: sub }) : null]), destaque || null]),
    h('div', { class: 'card-b' }, corpo)
  ]);
}
function destaqueNum(valor, rotulo) { return h('div', { class: 'dest' }, [h('b', { text: valor }), h('small', { text: rotulo })]); }

function abrirLista(titulo, ids) {
  var ls = ids.map(lead).filter(Boolean);
  modal({
    titulo: titulo, sub: ls.length + ' ' + plural(ls.length, 'lead', 'leads'), largura: 560, classe: 'peq',
    corpo: h('div', { class: 'leads-mini' }, ls.slice(0, 60).map(function (l) {
      return h('button', { class: 'lm', type: 'button', onclick: function () { if (pilha.length) pilha[pilha.length - 1].fechar(); abrirLead(l.id); } }, [avatar(l.nome), h('span', null, [h('b', { text: l.nome }), h('small', { text: (l.exame || 'sem exame') + ' · ' + brl(l.valor) + ' · ' + ST[l.status] })]), l.v.proximo ? pill(textoVence(l.v.proximo), 'pl-' + l.v.proximo.situacao) : null]);
    }))
  });
}

/* ------------------------------------------------------------------ topo */
function heroHoje(A) {
  var P = A.progresso, K = A.kpis, tm = horaBelem();
  var passou = Math.min(1, Math.max(0, (tm.h + tm.m / 60 - M.LIMITES.janelaInicioH) / (M.LIMITES.janelaFimH - M.LIMITES.janelaInicioH)));
  var restantes = P.horasRestantes;
  var frase = [
    b(P.pendentes + ' ' + plural(P.pendentes, 'tarefa', 'tarefas')), ' na fila', P.atrasadas ? [', ', b(P.atrasadas + ' ' + plural(P.atrasadas, 'atrasada', 'atrasadas'))] : ', todas em dia', '. ',
    b(brlCompacto(K.pipelineValor)), ' em andamento', K.riscoValor ? [', ', b(brlCompacto(K.riscoValor)), ' em risco'] : '', '.'
  ];
  return h('section', { class: 'hh' }, [
    h('div', { class: 'hh-t' }, [h('small', { class: 'hh-data', text: dataExtenso(A.hoje) }), h('h1', { text: saudacao() + (S.eu ? ', ' + primeiroNome(S.eu) : '') }), h('p', { class: 'hh-frase' }, frase)]),
    h('div', { class: 'hh-aneis' }, [
      anel({ titulo: 'Progresso do dia', tam: 104, pct: P.pct, centro: P.feitas + '/' + (P.feitas + P.pendentes), sub: 'tarefas', cor: 'var(--g3)', dica: { titulo: 'Progresso do dia', linhas: [{ valor: String(P.feitas), rotulo: 'concluídas hoje' }, { valor: String(P.pendentes), rotulo: 'ainda na fila' }, { valor: String(P.atrasadas), rotulo: 'delas atrasadas' }] } }),
      anel({ titulo: 'Janela de contato', tam: 104, pct: passou * 100, centro: restantes > 0 ? nf1.format(restantes) + ' h' : 'fechada', sub: restantes > 0 ? 'restantes' : '', cor: 'var(--g1)', dica: { titulo: 'Janela de contato', linhas: [{ valor: M.LIMITES.janelaInicioH + 'h às ' + M.LIMITES.janelaFimH + 'h', rotulo: 'horário permitido' }, { valor: P.ritmoPorHora === null ? '–' : nf1.format(P.ritmoPorHora), rotulo: 'tarefas por hora para zerar a fila' }] } })
    ])
  ]);
}

function gradeKpisHoje(A) {
  var K = A.kpis;
  return h('div', { class: 'kpis2' }, [
    kpi2({ rotulo: 'Tarefas hoje', valor: String(A.progresso.pendentes), sub: A.progresso.atrasadas ? A.progresso.atrasadas + ' atrasadas' : 'todas em dia', tom: A.progresso.atrasadas ? 'bad' : '' }),
    kpi2({ rotulo: 'Leads novos hoje', valor: String(K.novosHoje), delta: dlt(K.novos7, K.novos7Ant, { bom: 'sobe', vs: 'em 7 dias' }), serie: K.serieNovos, cor: COR.novos }),
    kpi2({ rotulo: 'Taxa de resposta', valor: pct(K.respostaTaxa), delta: dlt(K.respostaTaxa, K.respostaTaxaAnt, { pp: true, bom: 'sobe' }), serie: K.serieRespostas, cor: COR.respostas }),
    kpi2({ rotulo: 'Conversão (30 dias)', valor: pct(K.conversao), delta: dlt(K.conversao, K.conversaoAnt, { pp: true, bom: 'sobe' }), serie: K.serieConv, cor: COR.convertidos }),
    kpi2({ rotulo: 'Pipeline', valor: brlCompacto(K.pipelineValor), sub: K.pipelineN + ' ' + plural(K.pipelineN, 'lead ativo', 'leads ativos') })
  ]);
}

/* ------------------------------------------------------------------ fila do dia (compacta) */
function linhaTarefa(t) {
  var l = lead(t.leadId); if (!l) return null;
  var p = passoDef(t.passoId), px = l.v.proximo;
  var extra = [];
  if (px && px.faltaLigacao) extra.push(pill('falta a ligação', 'pl-atrasada'));
  else if (p.id === 'primeiro' && l.valor > M.LIMITES.ligacaoAcimaDe) extra.push(pill('+ ligação', 'pl-canal'));
  var r = h('article', { class: 'tarefa pr' + t.prioridade + (t.situacao === 'atrasada' ? ' atrasada' : '') }, [
    h('div', { class: 'tarefa-passo' }, [h('span', { class: 'dia-b', text: p.fase === 'especial' ? '!' : 'D' + p.dia }), h('b', { text: p.rotulo }), pill(textoVence(px || t), 'pl-' + t.situacao)].concat(extra)),
    h('div', { class: 'tarefa-quem' }, [avatar(l.nome), h('div', null, [h('b', { text: l.nome }), h('small', { text: (l.exame || 'sem exame') + ' · ' + brl(l.valor) })])]),
    h('div', { class: 'tarefa-acoes' }, [
      botao(p.decisao ? 'Decidir' : 'Contatar', 'pri', function (e) { e.stopPropagation(); abrirLead(l.id); }),
      h('a', { class: 'btn ic-only', href: linkWA(l.telefone, ''), target: '_blank', rel: 'noopener', title: 'Abrir conversa no WhatsApp', onclick: function (e) { e.stopPropagation(); } }, ico('message', 16))
    ])
  ]);
  r.addEventListener('click', function () { abrirLead(l.id); });
  return r;
}
function secaoFila() {
  var D = S.D;
  var tarefas = D.tarefas.filter(function (t) { if (S.hojeAtend === 'eu' && S.eu) { var l = lead(t.leadId); return l && l.atendente === S.eu; } return true; });
  var grupos = [[1, '1º', 'No show e comparecimentos'], [2, '2º', 'Leads novos em aberto'], [3, '3º', 'Demais tarefas']];
  var LIM = 8, total = tarefas.length, cabem = S.filaTudo ? total : Math.min(total, LIM), usadas = 0;
  var corpo = grupos.map(function (g) {
    var ls = tarefas.filter(function (t) { return t.prioridade === g[0]; });
    var fatia = ls.slice(0, Math.max(0, cabem - usadas));
    usadas += fatia.length;
    if (!fatia.length) return null;
    return h('div', { class: 'grupo' }, [h('h4', null, [h('span', { class: 'g-num', text: g[1] }), g[2], h('em', { text: fatia.length < ls.length ? fatia.length + ' de ' + ls.length : String(ls.length) })]), h('div', { class: 'tarefas' }, fatia.map(linhaTarefa))]);
  });
  if (total > LIM) corpo.push(h('button', { class: 'btn ver-mais', type: 'button', onclick: function () { S.filaTudo = !S.filaTudo; desenhar(true); }, text: S.filaTudo ? 'Mostrar só as primeiras ' + LIM : 'Mostrar todas as ' + total + ' tarefas' }));
  var eu = S.eu ? h('div', { class: 'seg', role: 'group', 'aria-label': 'De quem' }, [
    h('button', { type: 'button', 'aria-pressed': String(S.hojeAtend === 'todos'), onclick: function () { S.hojeAtend = 'todos'; desenhar(true); }, text: 'Todos' }),
    h('button', { type: 'button', 'aria-pressed': String(S.hojeAtend === 'eu'), onclick: function () { S.hojeAtend = 'eu'; desenhar(true); }, text: 'Só os meus' })
  ]) : null;
  return blocoCartao('Fila do dia', 'Na ordem de prioridade do guia. Clique em uma tarefa para ver a mensagem pronta.', tarefas.length ? h('div', { class: 'fila-l' }, corpo) : vazio('Nada pendente por hoje.', 'Quando um passo da cadência vencer, ele aparece aqui.'), 8, eu, 'sec-fila');
}

/* ------------------------------------------------------------------ lateral: radar enxuto e próximos dias */
function radarCompacto(A) {
  var top = A.insights.slice(0, 4);
  var linhas = top.map(function (i) {
    return h('button', { class: 'rd n-' + i.nivel, type: 'button', onclick: function () { if (i.acao && i.acao.leadId) abrirLead(i.acao.leadId); else if (i.acao && i.acao.leadIds) abrirLista(i.titulo, i.acao.leadIds); else abrirTodosInsights(A); } }, [
      h('span', { class: 'sel s-' + i.nivel }, [h('i', { 'aria-hidden': 'true', text: GLIFO_N[i.nivel] }), ROTULO_N[i.nivel]]), h('b', { text: i.titulo }), i.metrica ? h('small', { text: i.metrica }) : null
    ]);
  });
  var mais = A.insights.length > 4 ? h('button', { class: 'mini', type: 'button', onclick: function () { abrirTodosInsights(A); } }, ['Ver todos (' + A.insights.length + ')', ico('arrow', 13)]) : null;
  return blocoCartao('Radar', 'O que pede atenção agora.', h('div', { class: 'rd-l' }, linhas.length ? linhas : [vazio('Nada para destacar.')]), 4, mais, 'sec-radar');
}
function abrirTodosInsights(A) {
  modal({
    titulo: 'Radar de inteligência', sub: 'Do mais urgente ao menos, calculado dos seus dados.', largura: 720,
    corpo: h('div', { class: 'radar' }, A.insights.map(function (i) {
      var btn = i.acao ? h('button', { class: 'mini', type: 'button', onclick: function () { if (pilha.length) pilha[pilha.length - 1].fechar(); if (i.acao.leadId) abrirLead(i.acao.leadId); else if (i.acao.leadIds) abrirLista(i.titulo, i.acao.leadIds); } }, [i.acao.rotulo, ico('arrow', 13)]) : null;
      return h('article', { class: 'ins n-' + i.nivel }, [h('div', { class: 'ins-h' }, [h('span', { class: 'sel s-' + i.nivel }, [h('i', { 'aria-hidden': 'true', text: GLIFO_N[i.nivel] }), ROTULO_N[i.nivel]]), i.metrica ? h('b', { class: 'ins-m', text: i.metrica }) : null]), h('h4', { text: i.titulo }), h('p', { text: i.texto }), btn]);
    }))
  });
}
function cartaoProximos(A) {
  var P = A.proximos, tem = P.some(function (p) { return p.n > 0; });
  return blocoCartao('Próximos 7 dias', 'Passos que vencem, para planejar a equipe.', tem ? colunas({
    valores: P.map(function (p) { return p.n; }), rotulos: P.map(function (p) { return dataCurta(p.dia).replace('.', '').slice(0, 3); }), altura: 170, cor: 'var(--g1)', aria: 'Passos por dia nos próximos 7 dias',
    dica: function (i) { return { titulo: dataCurta(P[i].dia), linhas: [{ valor: String(P[i].n), rotulo: plural(P[i].n, 'passo', 'passos') }, { valor: brl(P[i].valor), rotulo: 'em orçamentos' }], nota: P[i].nomes.join(', ') + (P[i].n > P[i].nomes.length ? ' e mais' : '') }; }
  }) : vazio('Nada vence nos próximos 7 dias.'), 4, null, 'sec-proximos');
}

/* ------------------------------------------------------------------ gráficos do dia */
function cartaoAtividade(A) {
  var T = A.atividade;
  var titulos = T.dias.map(function (d, i) { return dataCurta(d) + (i === T.dias.length - 1 ? ' (hoje, em andamento)' : ''); });
  var rot = T.dias.map(function (d) { return d.slice(8, 10) + '/' + d.slice(5, 7); });
  return blocoCartao('Atividade dos últimos 14 dias', 'Contatos feitos, respostas e leads novos por dia.', composto({
    rotulos: rot, titulos: titulos, aria: 'Contatos, respostas e leads novos por dia', altura: 230,
    colunas: [{ nome: 'Contatos', cor: COR.contatos, valores: T.contatos }],
    linhas: [{ nome: 'Respostas', cor: COR.respostas, valores: T.respostas }, { nome: 'Leads novos', cor: COR.novos, valores: T.novos }],
    extras: [{ nome: 'Agendamentos', cor: COR.agendamentos, valores: T.agendamentos }, { nome: 'Convertidos', cor: COR.convertidos, valores: T.convertidos }, { nome: 'Descartes', cor: COR.descartados, valores: T.descartes }]
  }), 8, h('button', { class: 'mini', type: 'button', onclick: function () { ir('analises'); } }, ['Ver análises completas', ico('arrow', 13)]), 'sec-atividade');
}
function cartaoPipelineHoje(A) {
  var maxN = Math.max.apply(null, A.pipeline.map(function (p) { return p.n; }).concat([1]));
  var linhas = A.pipeline.map(function (p) {
    return { rotulo: ST[p.status], valor: p.n, texto: String(p.n), extra: brlCompacto(p.valor), cor: COR_STATUS[p.status],
      dica: { titulo: ST[p.status], linhas: [{ valor: String(p.n), rotulo: 'leads' }, { valor: brl(p.valor), rotulo: 'em orçamentos' }, { valor: String(p.atrasados), rotulo: 'com passo atrasado' }, { valor: String(p.excedidos), rotulo: 'fora do limite de dias' }] } };
  });
  return blocoCartao('Pipeline agora', 'Leads ativos por etapa.', barras(linhas, { max: maxN, alta: true, vazio: 'Nenhum lead ativo.' }), 4, null, 'sec-pipeline');
}

/* ------------------------------------------------------------------ montagem */
function telaHoje() {
  var D = S.D, A = D.analise;
  if (!D.leads.length) return h('div', { class: 'tela' }, [cabecalhoTela('Hoje', 'A visão do dia de atendimento.'), boasVindas()]);
  return h('div', { class: 'tela hoje' }, [
    heroHoje(A), gradeKpisHoje(A),
    h('div', { class: 'g12' }, [secaoFila(), h('div', { class: 'col-dir sp4' }, [radarCompacto(A), cartaoProximos(A)])]),
    h('div', { class: 'g12' }, [cartaoAtividade(A), cartaoPipelineHoje(A)])
  ]);
}
`;
