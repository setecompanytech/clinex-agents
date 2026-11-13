// JavaScript do BI, parte 3: monta a página com os dados de /painel/receptivo/bi/dados.json.
// Todo texto vindo dos dados entra por textContent (nunca innerHTML). Não usar crases nem "dollar-chave" aqui dentro.
export const app = String.raw`
var estado = { periodo: lerLS('bi-periodo') || '7d', fonte: lerLS('bi-fonte') || 'real' };
if (['24h', '7d', '30d'].indexOf(estado.periodo) < 0) estado.periodo = '7d';
if (['real', 'demo'].indexOf(estado.fonte) < 0) estado.fonte = 'real';
/* o endereço manda: /painel/receptivo/bi?fonte=demo&periodo=30d (bom para compartilhar a mesma vista) */
(function () {
  var q = new URLSearchParams(location.search);
  if (['24h', '7d', '30d'].indexOf(q.get('periodo')) >= 0) estado.periodo = q.get('periodo');
  if (['real', 'demo'].indexOf(q.get('fonte')) >= 0) estado.fonte = q.get('fonte');
})();
var raiz = document.getElementById('app');
var metaEl = document.getElementById('meta');
var avisosEl = document.getElementById('avisos');
var ultimoBI = null;

/* ------------------------------------------------------------------ pequenos blocos */
function delta(atual, ant, o) {
  if (ant === null || ant === undefined) return h('span', { class: 'dlt neutro', text: 'sem período anterior' });
  var dif, txt;
  if (o.pp) { dif = atual - ant; txt = (dif >= 0 ? '+' : '−') + nf1.format(Math.abs(dif)) + ' p.p.'; }
  else if (ant === 0) { dif = atual > 0 ? 1 : 0; txt = atual > 0 ? 'novo' : '0%'; }
  else { dif = (atual - ant) / ant * 100; txt = (dif >= 0 ? '+' : '−') + nf0.format(Math.abs(dif)) + '%'; }
  var igual = Math.abs(dif) < 0.05;
  var cls = !o.bom || igual ? 'neutro' : ((dif > 0) === (o.bom === 'sobe') ? 'bom' : 'ruim');
  return h('span', { class: 'dlt ' + cls, title: 'Comparado ao período anterior, de mesmo tamanho' }, [
    h('i', { 'aria-hidden': 'true', text: igual ? '■' : dif > 0 ? '▲' : '▼' }), txt, h('em', { text: ' vs. anterior' })
  ]);
}

function tile(o) {
  var v = h('div', { class: 'tile-n' });
  contar(v, o.valor, o.fmt);
  return h('div', { class: 'tile' }, [
    h('div', { class: 'tile-r', text: o.rotulo }),
    v,
    h('div', { class: 'tile-f' }, [o.delta, o.spark]),
    o.nota ? h('div', { class: 'tile-nota', text: o.nota }) : null
  ]);
}

function stats(itens) {
  return h('div', { class: 'stats' }, itens.map(function (i) {
    return h('div', null, [h('b', { text: i.valor }), h('span', { text: i.rotulo })]);
  }));
}

/* ------------------------------------------------------------------ seções */
function secaoKpis(bi) {
  var k = bi.kpis.atual, a = bi.kpis.anterior;
  var S = bi.serie;
  var conv = S.map(function (s) { return s.conversas; });
  var ag = S.map(function (s) { return s.agendamentos; });
  var tr = S.map(function (s) { return s.transferencias; });
  var convPct = S.map(function (s) { return s.conversas ? Math.min(100, s.agendamentos / s.conversas * 100) : 0; });
  var autPct = S.map(function (s) { return s.conversas ? Math.max(0, 100 - s.transferencias / s.conversas * 100) : 0; });
  var heroN = h('div', { class: 'hero-n' });
  contar(heroN, k.agendamentos, fmtN);
  var hero = h('section', { class: 'hero' }, [
    h('div', { class: 'hero-r', text: 'Agendamentos feitos pela Amanda' }),
    heroN,
    h('div', { class: 'hero-f' }, [delta(k.agendamentos, a && a.agendamentos, { bom: 'sobe' }), h('span', { class: 'hero-s', text: bi.periodo.rotulo })]),
    h('div', { class: 'hero-sp' }, spark(ag, 'var(--s3)', 320, 64)),
    h('p', { class: 'hero-p', text: fmtP(k.conversao) + ' das ' + fmtN(k.conversas) + ' conversas viraram agendamento, sem ninguém da equipe digitar.' })
  ]);
  var grade = h('div', { class: 'tiles' }, [
    tile({ rotulo: 'Conversas', valor: k.conversas, fmt: fmtN, delta: delta(k.conversas, a && a.conversas, { bom: 'sobe' }), spark: spark(conv, 'var(--s1)') }),
    tile({ rotulo: 'Taxa de conversão', valor: k.conversao, fmt: fmtP, delta: delta(k.conversao, a && a.conversao, { pp: true, bom: 'sobe' }), spark: spark(convPct, 'var(--s3)'), nota: 'conversas que viraram agendamento' }),
    tile({ rotulo: 'Autonomia', valor: k.autonomia, fmt: fmtP, delta: delta(k.autonomia, a && a.autonomia, { pp: true, bom: 'sobe' }), spark: spark(autPct, 'var(--s1)'), nota: 'resolvidas sem chamar a equipe' }),
    tile({ rotulo: 'Transferências', valor: k.transferencias, fmt: fmtN, delta: delta(k.transferencias, a && a.transferencias, { bom: 'desce' }), spark: spark(tr, 'var(--s2)'), nota: 'foram para a equipe humana' }),
    tile({ rotulo: 'Mensagens por conversa', valor: k.mensagens, fmt: function (v) { return nf1.format(v); }, delta: delta(k.mensagens, a && a.mensagens, {}), nota: 'respostas da Amanda, em média' }),
    tile({ rotulo: 'Duração típica', valor: k.duracaoMin, fmt: fmtMin, delta: delta(k.duracaoMin, a && a.duracaoMin, {}), nota: 'mediana, da 1ª à última mensagem' })
  ]);
  return h('div', { class: 'kpi-grid' }, [hero, grade]);
}

function secaoInsights(bi) {
  var rotulos = { critico: 'Crítico', atencao: 'Atenção', info: 'Informativo', bom: 'Positivo' };
  return h('section', { class: 'bloco' }, [
    h('div', { class: 'bloco-h' }, [h('h2', { text: 'O que os dados estão dizendo' }), h('p', { text: 'Leitura automática do período, do mais urgente ao menos.' })]),
    h('div', { class: 'insights' }, bi.insights.map(function (i) {
      return h('article', { class: 'insight n-' + i.nivel }, [
        h('div', { class: 'insight-h' }, [chip(i.nivel, rotulos[i.nivel]), i.metrica ? h('span', { class: 'insight-m', text: i.metrica }) : null]),
        h('h4', { text: i.titulo }),
        h('p', { text: i.texto })
      ]);
    }))
  ]);
}

function cartaoFunil(bi) {
  var f = bi.funil, base = f[0].chegaram;
  var linhas = f.map(function (e, i) {
    var dl = [{ valor: nf0.format(e.chegaram), rotulo: 'conversas chegaram aqui' }, { valor: fmtP(e.pct), rotulo: 'do total que começou' }];
    if (i > 0) dl.push({ valor: (e.perdaPct > 0 ? '−' : '') + nf0.format(e.perdaPct) + '%', rotulo: 'perdidas desde a etapa anterior' });
    return {
      rotulo: e.etapa, valor: e.chegaram, texto: nf0.format(e.chegaram), cor: 'var(--o' + (i + 1) + ')',
      extra: fmtP(e.pct) + (i > 0 && e.perdaPct > 0 ? '  ·  −' + nf0.format(e.perdaPct) + '%' : ''),
      dica: { titulo: e.etapa, linhas: dl }
    };
  });
  return cartao({
    titulo: 'Funil de conversão', span: 's7',
    sub: 'Quantas conversas chegaram a cada etapa do agendamento (Amanda IA e roteiro). Ao lado: o % do total e a perda em relação à etapa anterior.',
    corpo: barras(linhas, { max: base, alta: true, vazio: 'Sem conversas no período.' }),
    tabela: { cols: ['Etapa', 'Conversas', '% do início', 'Perda vs. anterior'], linhas: f.map(function (e, i) { return [e.etapa, e.chegaram, fmtP(e.pct), i ? fmtP(e.perdaPct) : '–']; }) }
  });
}

function cartaoResultado(bi) {
  var nomes = { agendada: 'Agendada', finalizada: 'Finalizada sem agendar', transferida: 'Transferida para a equipe', emergencia: 'Emergência / crise', abandonada: 'Sem resposta do paciente (2 h+)', andamento: 'Em andamento' };
  var total = soma(bi.status.map(function (s) { return s.n; }));
  var corpo = h('div', null, [
    barras(bi.status.map(function (s) { return { rotulo: nomes[s.nome] || s.nome, valor: s.n, extra: fmtP(total ? s.n / total * 100 : 0), sub: 'conversas' }; }), { vazio: 'Sem conversas no período.' }),
    bi.paradas.length ? h('h4', { class: 'sub-t', text: 'Onde as sem resposta pararam' }) : null,
    bi.paradas.length ? barras(bi.paradas.map(function (s) { return { rotulo: s.nome, valor: s.n, sub: 'conversas pararam aqui', cor: 'var(--s2)' }; })) : null
  ]);
  return cartao({
    titulo: 'Como as conversas terminam', span: 's5', sub: 'Resultado final de cada conversa iniciada no período.', corpo: corpo,
    tabela: { cols: ['Resultado', 'Conversas'], linhas: bi.status.map(function (s) { return [nomes[s.nome] || s.nome, s.n]; }) }
  });
}

function cartaoVolume(bi) {
  var S = bi.serie;
  var titulos = S.map(function (s) {
    var d = new Date(s.t);
    var dia = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: TZ });
    var ultimo = s.t === S[S.length - 1].t;
    return (bi.periodo.porHora ? dia + ' · ' + s.rotulo : dia) + (ultimo ? ' (em andamento, parcial)' : '');
  });
  return cartao({
    titulo: 'Volume ao longo do tempo', span: 's8',
    sub: bi.periodo.porHora ? 'Por hora.' : 'Por dia.',
    corpo: graficoLinhas({
      rotulos: S.map(function (s) { return s.rotulo; }), titulos: titulos, aria: 'Conversas, agendamentos e transferências ao longo do tempo',
      series: [
        { nome: 'Conversas', cor: 'var(--s1)', valores: S.map(function (s) { return s.conversas; }), area: true },
        { nome: 'Agendamentos', cor: 'var(--s3)', valores: S.map(function (s) { return s.agendamentos; }) },
        { nome: 'Transferências', cor: 'var(--s2)', valores: S.map(function (s) { return s.transferencias; }) }
      ]
    }),
    tabela: { cols: ['Quando', 'Conversas', 'Agendamentos', 'Transferências'], linhas: S.map(function (s, i) { return [titulos[i], s.conversas, s.agendamentos, s.transferencias]; }) }
  });
}

function cartaoHoras(bi) {
  var rot = bi.horas.map(function (_, i) { return String(i).padStart(2, '0'); });
  return cartao({
    titulo: 'Quando os pacientes chamam', span: 's4', sub: 'Conversas iniciadas por hora do dia (horário de Belém).',
    corpo: graficoColunas({
      valores: bi.horas, rotulos: rot, rotuloCada: 3, aria: 'Conversas por hora do dia',
      dica: function (i) { return { titulo: 'Das ' + rot[i] + 'h às ' + String((i + 1) % 24).padStart(2, '0') + 'h', linhas: [{ valor: nf0.format(bi.horas[i]), rotulo: 'conversas' }] }; }
    }),
    tabela: { cols: ['Hora', 'Conversas'], linhas: bi.horas.map(function (v, i) { return [rot[i] + 'h', v]; }) }
  });
}

function cartaoCalor(bi) {
  var ordem = [1, 2, 3, 4, 5, 6, 0], nomes = DIAS;
  return cartao({
    titulo: 'Mapa de calor da semana', span: 's8', sub: 'Dia da semana por hora: onde a procura se concentra. Mais escuro = mais conversas.',
    corpo: mapaCalor(bi.calor),
    tabela: { cols: ['Dia'].concat(['00h-05h', '06h-11h', '12h-17h', '18h-23h']), linhas: ordem.map(function (d) {
      var c = bi.calor[d]; return [nomes[d], soma(c.slice(0, 6)), soma(c.slice(6, 12)), soma(c.slice(12, 18)), soma(c.slice(18, 24))];
    }) }
  });
}

function cartaoMsgs(bi) {
  return cartao({
    titulo: 'Mensagens por conversa', span: 's4', sub: 'Quantas respostas a Amanda precisou dar. Muitas = conversa difícil.',
    corpo: graficoColunas({
      valores: bi.msgsDist.map(function (m) { return m.n; }), rotulos: bi.msgsDist.map(function (m) { return m.faixa; }), altura: 190, aria: 'Distribuição de mensagens por conversa',
      dica: function (i) { return { titulo: bi.msgsDist[i].faixa + ' mensagens', linhas: [{ valor: nf0.format(bi.msgsDist[i].n), rotulo: 'conversas' }] }; }
    }),
    tabela: { cols: ['Mensagens', 'Conversas'], linhas: bi.msgsDist.map(function (m) { return [m.faixa, m.n]; }) }
  });
}

function cartaoTransferencias(bi) {
  var t = bi.transferencias;
  var corpo = h('div', null, [
    barras(t.categorias.map(function (c) { return { rotulo: c.nome, valor: c.n, extra: fmtP(t.total ? c.n / t.total * 100 : 0), sub: 'transferências', cor: 'var(--s2)' }; }), { vazio: 'Nenhuma transferência no período.' }),
    t.porEtapa.length ? h('h4', { class: 'sub-t', text: 'Em que etapa o paciente estava' }) : null,
    t.porEtapa.length ? barras(t.porEtapa.map(function (c) { return { rotulo: c.nome, valor: c.n, sub: 'transferências', cor: 'var(--s2)' }; })) : null
  ]);
  return cartao({
    titulo: 'Por que a Amanda chama a equipe', span: 's6', sub: fmtN(t.total) + ' transferências no período.', corpo: corpo,
    tabela: { cols: ['Motivo', 'Transferências'], linhas: t.categorias.map(function (c) { return [c.nome, c.n]; }) }
  });
}

function cartaoMotivos(bi) {
  var t = bi.transferencias;
  return cartao({
    titulo: 'Motivos registrados (texto real)', span: 's6', sub: 'O que a Amanda escreveu para a equipe ao transferir.',
    corpo: barras(t.motivos.map(function (c) { return { rotulo: c.nome, valor: c.n, sub: 'vezes', cor: 'var(--s2)' }; }), { vazio: 'Nenhuma transferência no período.' }),
    tabela: { cols: ['Motivo', 'Vezes'], linhas: t.motivos.map(function (c) { return [c.nome, c.n]; }) }
  });
}

function cartaoDemanda(bi) {
  var d = bi.demanda;
  return [
    cartao({
      titulo: 'Pediram e a Amanda não achou', span: 's6', sub: 'Serviços sem correspondência no Clinilink: demanda que está escapando.',
      corpo: barras(d.naoEncontrados.map(function (x) { return { rotulo: x.nome, valor: x.n, sub: 'buscas sem resultado', cor: 'var(--s2)' }; }), { vazio: 'Nenhuma busca ficou sem resultado.' }),
      tabela: { cols: ['Termo', 'Buscas'], linhas: d.naoEncontrados.map(function (x) { return [x.nome, x.n]; }) }
    }),
    cartao({
      titulo: 'O que os pacientes mais citam', span: 's6', sub: 'Palavras mais frequentes na primeira mensagem (sem palavras comuns).',
      corpo: barras(d.termos.map(function (x) { return { rotulo: x.nome, valor: x.n, sub: 'conversas citaram' }; }), { vazio: 'Poucos dados para extrair termos.' }),
      tabela: { cols: ['Palavra', 'Conversas'], linhas: d.termos.map(function (x) { return [x.nome, x.n]; }) }
    })
  ];
}

function situacao(i) {
  if (i.chamadas === 0) return chip('neutro', 'Sem uso');
  var ok = i.okPct === null ? 100 : i.okPct;
  if (ok < 95) return chip('critico', 'Instável');
  if (ok < 99 || (i.p95 !== null && i.p95 > 4000)) return chip('atencao', 'Atenção');
  return chip('bom', 'Saudável');
}
function medidor(pct) {
  var cor = pct === null ? 'var(--neutro)' : pct >= 99 ? 'var(--st-bom)' : pct >= 95 ? 'var(--st-atencao)' : 'var(--st-critico)';
  return h('div', { class: 'medidor' }, [h('div', { class: 'medidor-t' }, h('div', { class: 'medidor-f', style: 'width:' + (pct === null ? 0 : pct) + '%;background:' + cor })), h('b', { text: fmtP(pct) })]);
}

function cartaoIntegracoes(bi) {
  var cab = ['Integração', 'Chamadas', 'Sucesso', 'Típico (p50)', 'Lento (p95)', 'Situação'];
  var linhas = bi.integracoes.map(function (i) {
    return h('tr', null, [
      h('th', { scope: 'row', text: i.nome }),
      h('td', { text: nf0.format(i.chamadas) + (i.cache ? '  (+' + nf0.format(i.cache) + ' em cache)' : '') }),
      h('td', null, medidor(i.okPct)),
      h('td', { text: fmtMs(i.p50) }), h('td', { text: fmtMs(i.p95) }),
      h('td', null, situacao(i))
    ]);
  });
  var tabela = bi.integracoes.length ? h('div', { class: 'tbl-w' }, h('table', { class: 'tbl' }, [
    h('thead', null, h('tr', null, cab.map(function (c) { return h('th', { scope: 'col', text: c }); }))), h('tbody', null, linhas)
  ])) : vazio('Nenhuma chamada a integrações no período.');
  var erros = [];
  bi.integracoes.forEach(function (i) { i.erros.forEach(function (e) { erros.push({ rotulo: i.nome + ': ' + e.nome, valor: e.n, sub: 'vezes', cor: 'var(--st-critico)' }); }); });
  var det = bi.detalhes.map(function (d) { return [d.origem, d.rotulo, d.n, d.falhas, fmtMs(d.p50), fmtMs(d.p95)]; });
  var corpo = h('div', null, [
    tabela,
    erros.length ? h('h4', { class: 'sub-t', text: 'Erros mais comuns' }) : null,
    erros.length ? barras(erros.slice(0, 6)) : null,
    det.length ? h('h4', { class: 'sub-t', text: 'Por endpoint' }) : null,
    det.length ? tabelaHtml(['Sistema', 'Endpoint', 'Chamadas', 'Falhas', 'p50', 'p95'], det) : null
  ]);
  return cartao({ titulo: 'Saúde das integrações', span: 's12', sub: 'Clinilink, Inovstar, GPT e leitura de comprovante: taxa de sucesso e velocidade. Se algo trava aqui, a Amanda trava para o paciente.', corpo: corpo });
}

function cartaoGpt(bi) {
  var g = bi.gpt;
  var nomes = { ia: 'Escrita pela Amanda IA', usado: 'Roteiro antigo: reescrita usada', desligado: 'Roteiro antigo: texto fixo', rejeitado: 'Roteiro antigo: rejeitada', falhou: 'GPT falhou' };
  var cores = { ia: 'var(--o2)', usado: 'var(--s1)', desligado: 'var(--neutro)', rejeitado: 'var(--st-atencao)', falhou: 'var(--st-critico)' };
  var partes = g.respostas.map(function (r) { return { rotulo: nomes[r.nome] || r.nome, valor: r.n, cor: cores[r.nome] || 'var(--neutro)' }; });
  var corpo = h('div', null, [
    empilhada(partes),
    stats([{ valor: fmtN(g.tokens), rotulo: 'tokens gastos' }, { valor: fmtMs(g.msMedio), rotulo: 'tempo médio da reescrita' }, { valor: fmtN(g.chamadas), rotulo: 'chamadas ao GPT' }]),
    g.rejeicoes.length ? h('h4', { class: 'sub-t', text: 'Por que foram rejeitadas' }) : null,
    g.rejeicoes.length ? barras(g.rejeicoes.map(function (x) { return { rotulo: x.nome, valor: x.n, sub: 'vezes', cor: 'var(--st-atencao)' }; })) : null
  ]);
  return cartao({
    titulo: 'Tom da mensagem (GPT)', span: 's6', sub: 'Como cada resposta chegou ao paciente.', corpo: corpo,
    tabela: { cols: ['Situação', 'Respostas'], linhas: partes.map(function (p) { return [p.rotulo, p.valor]; }) }
  });
}

function cartaoCobertura(bi) {
  var c = bi.cobertura;
  var corpo = h('div', null, [
    stats([
      { valor: fmtN(c.atendimentos), rotulo: 'atendimentos que chegaram' },
      { valor: fmtN(c.comIA), rotulo: 'com a Amanda' },
      { valor: c.pct === null ? '–' : fmtP(c.pct), rotulo: 'de cobertura' }
    ]),
    c.motivos.length ? h('h4', { class: 'sub-t', text: 'Por que ela não entrou nos outros' }) : null,
    barras(c.motivos.map(function (x) { return { rotulo: x.nome, valor: x.n, extra: fmtP(c.atendimentos ? x.n / c.atendimentos * 100 : 0), sub: 'atendimentos', cor: 'var(--s2)' }; }), { vazio: 'A Amanda entrou em todos os atendimentos do período.' }),
    c.atendentes.length ? h('h4', { class: 'sub-t', text: 'Atendente que já estava na conversa' }) : null,
    c.atendentes.length ? barras(c.atendentes.map(function (x) { return { rotulo: x.nome, valor: x.n, sub: 'atendimentos' }; })) : null
  ]);
  return cartao({
    titulo: 'Cobertura da Amanda', span: 's6', sub: 'De todos os atendimentos que chegaram pelo WhatsApp, em quantos a Amanda entrou.', corpo: corpo,
    tabela: { cols: ['Motivo de não entrar', 'Atendimentos'], linhas: c.motivos.map(function (x) { return [x.nome, x.n]; }) }
  });
}

function cartaoIA(bi) {
  var a = bi.ia;
  var nomesF = { buscar_servico: 'Buscar serviço', abrir_servico: 'Abrir opção', servico_com_profissional: 'Escolher médico', ver_horarios: 'Ver horários', buscar_paciente: 'Buscar paciente', agendar: 'Agendar', orcar_exames: 'Orçar exames', ler_pedido_medico: 'Ler foto', agendar_coleta: 'Agendar coleta', sugerir_exames: 'Sugerir exames', combos_do_servico: 'Combos do serviço', etapa_do_combo: 'Etapa do combo', conferir_comprovante: 'Conferir comprovante', transferir_para_humano: 'Transferir para a equipe', encerrar_atendimento: 'Encerrar atendimento' };
  var corpo = h('div', null, [
    stats([
      { valor: fmtN(a.conversas), rotulo: 'conversas com a IA' },
      { valor: fmtN(a.agendadas), rotulo: 'agendaram' },
      { valor: fmtMs(a.msP50), rotulo: 'tempo típico para responder' },
      { valor: fmtMs(a.msP95), rotulo: 'resposta mais lenta (p95)' }
    ]),
    stats([
      { valor: fmtN(a.trava.refeitas), rotulo: 'respostas refeitas pela trava' },
      { valor: fmtN(a.trava.bloqueadas), rotulo: 'bloqueadas pela trava' },
      { valor: fmtN(a.lembretes), rotulo: 'lembretes de inatividade' },
      { valor: fmtN(a.finalizados), rotulo: 'atendimentos finalizados' },
      { valor: fmtN(a.os.geradas) + (a.os.falhas ? ' (' + a.os.falhas + ' falha)' : ''), rotulo: 'O.S. geradas (pix)' }
    ]),
    a.ferramentas.length ? h('h4', { class: 'sub-t', text: 'O que ela mais consulta e faz' }) : null,
    barras(a.ferramentas.map(function (f) { return { rotulo: nomesF[f.nome] || f.nome, valor: f.n, extra: f.erros ? f.erros + ' recusadas' : '', sub: 'usos', cor: f.erros / f.n >= 0.3 ? 'var(--st-atencao)' : 'var(--s1)' }; }), { vazio: 'A Amanda IA não atendeu no período.' })
  ]);
  return cartao({
    titulo: 'Amanda IA por dentro', span: 's6', sub: 'Velocidade, ferramentas usadas e quantas vezes as regras da clínica e a trava de veracidade agiram.' + (a.modelos[0] ? ' Modelo: ' + a.modelos.map(function (m) { return m.nome; }).join(', ') + '.' : ''), corpo: corpo,
    tabela: { cols: ['Ferramenta', 'Usos', 'Recusadas', 'Típico'], linhas: a.ferramentas.map(function (f) { return [nomesF[f.nome] || f.nome, f.n, f.erros, fmtMs(f.p50)]; }) }
  });
}

function cartaoComprovantes(bi) {
  var c = bi.comprovantes, it = bi.interpretador;
  var corpo = h('div', null, [
    barras(c.status.map(function (s) { return { rotulo: s.nome, valor: s.n, sub: 'comprovantes', cor: s.nome === 'erro de leitura' ? 'var(--st-critico)' : 'var(--s1)' }; }), { vazio: 'Nenhum comprovante lido no período.' }),
    stats([
      { valor: fmtN(c.total), rotulo: 'comprovantes lidos' }, { valor: fmtMs(c.msMedio), rotulo: 'tempo médio de leitura' },
      { valor: fmtN(it.chamadas), rotulo: 'ajudas do intérprete de IA' }, { valor: it.chamadas ? fmtP(it.entendeu / it.chamadas * 100) : '–', rotulo: 'entendidas pelo intérprete' }
    ])
  ]);
  return cartao({
    titulo: 'Comprovantes de pix e intérprete de IA', span: 's6', sub: 'Leitura da imagem do comprovante e entendimento de respostas livres.', corpo: corpo,
    tabela: { cols: ['Situação', 'Comprovantes'], linhas: c.status.map(function (s) { return [s.nome, s.n]; }) }
  });
}

var ORIGENS = { erro: 'Erro', clinilink: 'Clinilink', inovstar: 'Inovstar', gpt: 'GPT', comprovante: 'Comprovante' };
function cartaoFalhas(bi) {
  var corpo = bi.falhas.length ? h('div', { class: 'lista' }, bi.falhas.map(function (f) {
    return h('div', { class: 'item' }, [
      h('div', { class: 'item-h' }, [chip('critico', ORIGENS[f.origem] || f.origem), h('span', { class: 'mut', text: fmtDiaHora(f.t) + (f.atendimento ? ' · #' + f.atendimento : '') })]),
      h('p', { text: f.mensagem })
    ]);
  })) : vazio('Nenhuma falha registrada no período.');
  return cartao({
    titulo: 'Falhas recentes', span: 's7', sub: 'Erros do agente e chamadas que falharam, da mais nova para a mais antiga.', corpo: corpo,
    tabela: bi.falhas.length ? { cols: ['Quando', 'Origem', 'Mensagem'], linhas: bi.falhas.map(function (f) { return [fmtDiaHora(f.t), ORIGENS[f.origem] || f.origem, f.mensagem]; }) } : null
  });
}

function cartaoIgnorados(bi) {
  return cartao({
    titulo: 'Mensagens que a Amanda ignorou', span: 's5', sub: 'Cada mensagem recebida em que ela não respondeu, agrupada pelo motivo.',
    corpo: barras(bi.ignorados.map(function (x) { return { rotulo: x.nome, valor: x.n, sub: 'vezes' }; }), { vazio: 'Nada foi ignorado no período.' }),
    tabela: { cols: ['Motivo', 'Vezes'], linhas: bi.ignorados.map(function (x) { return [x.nome, x.n]; }) }
  });
}

/* ------------------------------------------------------------------ conversas e detalhe */
var gaveta = null, retorno = null;
function fecharGaveta() {
  if (!gaveta) return;
  gaveta.remove(); gaveta = null;
  document.body.classList.remove('sem-rolagem');
  if (retorno && retorno.focus) retorno.focus();
}
function abrirGaveta(c, origem) {
  fecharGaveta();
  retorno = origem;
  var fechar = h('button', { class: 'mini', type: 'button', text: 'Fechar', onclick: fecharGaveta });
  var bolhas = c.turnos.map(function (t) {
    var tags = [h('span', { class: 'tag', text: t.etapa })];
    if (t.gpt) tags.push(h('span', { class: 'tag', text: 'GPT: ' + t.gpt }));
    if (t.transferiu) tags.push(h('span', { class: 'tag t-alerta', text: 'Transferiu' + (t.motivo ? ': ' + t.motivo : '') }));
    return h('div', { class: 'turno' }, [
      t.paciente ? h('div', { class: 'bolha pac' }, [h('small', { text: 'Paciente · ' + fmtHora(t.t) }), h('p', { text: t.paciente })]) : null,
      h('div', { class: 'bolha ama' }, [h('small', { text: 'Amanda' }), h('p', { text: t.amanda })]),
      h('div', { class: 'tags' }, tags)
    ]);
  });
  gaveta = h('div', { class: 'gaveta-fundo', onclick: function (e) { if (e.target === gaveta) fecharGaveta(); } },
    h('aside', { class: 'gaveta', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Detalhe da conversa' }, [
      h('header', null, [
        h('div', null, [h('h3', { text: 'Conversa #' + c.id }), h('p', { text: fmtDiaHora(c.inicio) + ' · ' + c.mensagens + ' mensagens · ' + fmtMin(c.duracaoMin) })]),
        chipStatus(c.status), fechar
      ]),
      c.simulada ? h('div', { class: 'aviso-i', text: 'Conversa de simulação: nada foi agendado de verdade.' }) : null,
      h('div', { class: 'conversa' }, bolhas),
      h('p', { class: 'mut peq', text: 'Telefone, CPF e datas de nascimento são mascarados antes de qualquer registro.' })
    ]));
  document.body.appendChild(gaveta);
  document.body.classList.add('sem-rolagem');
  fechar.focus();
}
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fecharGaveta(); });

function cartaoConversas(bi) {
  var linhas = bi.conversas.map(function (c) {
    var tr = h('tr', { class: 'clic', tabindex: '0', onclick: function () { abrirGaveta(c, tr); }, onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirGaveta(c, tr); } } }, [
      h('td', null, chipStatus(c.status)),
      h('td', { text: '#' + c.id }),
      h('td', { text: fmtDiaHora(c.inicio) }),
      h('td', { text: String(c.mensagens) }),
      h('td', { text: c.etapaFinal || '–' }),
      h('td', { text: fmtMin(c.duracaoMin) }),
      h('td', { class: 'obs', text: c.motivo || (c.problemas ? c.problemas + ' falha(s) no caminho' : '') })
    ]);
    return tr;
  });
  var corpo = bi.conversas.length ? h('div', { class: 'tbl-w' }, h('table', { class: 'tbl' }, [
    h('thead', null, h('tr', null, ['Resultado', 'Atendimento', 'Início', 'Msgs', 'Etapa final', 'Duração', 'Observação'].map(function (c) { return h('th', { scope: 'col', text: c }); }))),
    h('tbody', null, linhas)
  ])) : vazio('Sem conversas no período.');
  return cartao({ titulo: 'Conversas recentes', span: 's12', sub: 'As ' + bi.conversas.length + ' mais recentes. Clique em uma linha para ler a conversa inteira.', corpo: corpo });
}

/* ------------------------------------------------------------------ página */
function secaoGrade(cards) { return h('div', { class: 'grade-12' }, cards); }

function vazioReal() {
  return h('section', { class: 'card s12 vazio-grande' }, [
    h('h2', { text: 'Ainda não há dados reais para mostrar' }),
    h('p', { text: 'O BI lê os eventos que a Amanda registra a cada conversa (resposta, etapa, GPT, Clinilink, Inovstar, comprovante, erros). Assim que chegarem mensagens de pacientes por este servidor, os números aparecem aqui e o histórico fica salvo no banco de dados (Supabase).' }),
    h('p', { text: 'Quer ver como a tela fica cheia? Use a demonstração (dados simulados, claramente identificados).' }),
    h('button', { class: 'btn-p', type: 'button', text: 'Ver demonstração', onclick: function () { trocarFonte('demo'); } })
  ]);
}

function desenhar(bi) {
  ultimoBI = bi;
  raiz.textContent = '';
  avisosEl.textContent = '';
  var f = bi.fonte;
  if (f.tipo === 'demo') avisosEl.appendChild(h('div', { class: 'faixa f-demo' }, [chip('info', 'Demonstração'), 'Todos os números abaixo são simulados. Nada aqui veio de pacientes reais.']));
  if (f.modoSombra) avisosEl.appendChild(h('div', { class: 'faixa f-aviso' }, [chip('atencao', 'Modo sombra'), 'A Amanda está registrando respostas, mas não as está enviando (AUTO_REPLY desligado).']));
  f.avisos.forEach(function (a) { avisosEl.appendChild(h('div', { class: 'faixa f-aviso' }, [chip('atencao', 'Aviso'), a])); });
  metaEl.textContent = 'Atualizado às ' + fmtHora(bi.geradoEm) + '  ·  ' + nf0.format(f.eventos) + ' eventos analisados  ·  ' + f.origens.join(' + ');

  if (f.tipo === 'real' && f.eventos === 0 && bi.conversas.length === 0) { raiz.appendChild(secaoGrade([vazioReal()])); return; }

  raiz.appendChild(secaoKpis(bi));
  raiz.appendChild(secaoInsights(bi));
  raiz.appendChild(secaoGrade([cartaoFunil(bi), cartaoResultado(bi)]));
  if (bi.cobertura && bi.ia) raiz.appendChild(secaoGrade([cartaoCobertura(bi), cartaoIA(bi)]));
  raiz.appendChild(secaoGrade([cartaoVolume(bi), cartaoHoras(bi)]));
  raiz.appendChild(secaoGrade([cartaoCalor(bi), cartaoMsgs(bi)]));
  raiz.appendChild(secaoGrade([cartaoTransferencias(bi), cartaoMotivos(bi)]));
  raiz.appendChild(secaoGrade(cartaoDemanda(bi)));
  raiz.appendChild(secaoGrade([cartaoIntegracoes(bi)]));
  raiz.appendChild(secaoGrade([cartaoGpt(bi), cartaoComprovantes(bi)]));
  raiz.appendChild(secaoGrade([cartaoFalhas(bi), cartaoIgnorados(bi)]));
  raiz.appendChild(secaoGrade([cartaoConversas(bi)]));
  raiz.appendChild(h('p', { class: 'rodape', text: 'Dados pessoais (CPF, telefone, nascimento) são mascarados na origem. Percentuais com poucas conversas oscilam muito. Horários no fuso de Belém.' }));
}

function erroTela(e) {
  raiz.textContent = '';
  raiz.appendChild(secaoGrade([h('section', { class: 'card s12 vazio-grande' }, [h('h2', { text: 'Não consegui carregar os dados' }), h('p', { text: String(e && e.message ? e.message : e) }), h('button', { class: 'btn-p', type: 'button', text: 'Tentar de novo', onclick: carregar })])]));
}

function carregar() {
  raiz.classList.add('carregando');
  return fetch('/painel/receptivo/bi/dados.json?periodo=' + estado.periodo + '&fonte=' + estado.fonte, { credentials: 'same-origin', cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error('O servidor respondeu ' + r.status); return r.json(); })
    .then(function (bi) { raiz.classList.remove('carregando'); desenhar(bi); })
    .catch(function (e) { raiz.classList.remove('carregando'); erroTela(e); });
}

/* ------------------------------------------------------------------ controles */
function marcar(attr, valor) {
  document.querySelectorAll('[' + attr + ']').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute(attr) === valor ? 'true' : 'false'); });
}
function trocarFonte(v) { estado.fonte = v; gravarLS('bi-fonte', v); marcar('data-fonte', v); carregar(); }
document.querySelectorAll('[data-periodo]').forEach(function (b) {
  b.addEventListener('click', function () { estado.periodo = b.getAttribute('data-periodo'); gravarLS('bi-periodo', estado.periodo); marcar('data-periodo', estado.periodo); carregar(); });
});
document.querySelectorAll('[data-fonte]').forEach(function (b) { b.addEventListener('click', function () { trocarFonte(b.getAttribute('data-fonte')); }); });
document.getElementById('btn-atualizar').addEventListener('click', carregar);
/* o tema é do design system (botão no topo da página, chave "clinex-tema") */
marcar('data-periodo', estado.periodo);
marcar('data-fonte', estado.fonte);
setInterval(function () { if (document.visibilityState === 'visible' && estado.fonte === 'real' && !gaveta) carregar(); }, 60000);
carregar();
`;
