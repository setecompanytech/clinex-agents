// JavaScript do CRM (navegador), parte 3: telas Hoje, Funil, Leads, Mensagens e Regras.
// Dentro dele não usar crases nem "dollar-chave".
export const telas = String.raw`
/* ------------------------------------------------------------------ utilidades de tela */
function rotuloPasso(px) {
  var p = px.passo;
  var dia = (p.fase !== 'especial' && p.dia !== undefined && p.dia !== null) ? 'D' + p.dia + ' · ' : '';
  return dia + p.rotulo;
}
function textoVence(px) {
  if (px.situacao === 'atrasada') return 'atrasado ' + px.atraso + ' ' + plural(px.atraso, 'dia', 'dias');
  if (px.situacao === 'hoje') return 'vence hoje';
  return 'vence ' + dBR(px.vence);
}
function ctxMsg(l) {
  var ctx = { atendente: S.eu };
  if (l.agendamento) { ctx.data = dBRfull(l.agendamento.data); if (l.agendamento.exame) ctx.exame = l.agendamento.exame; }
  return ctx;
}
function janelaAberta() { var t = horaBelem(); return t.h >= M.LIMITES.janelaInicioH && t.h < M.LIMITES.janelaFimH; }
function filtrarLeads(lista) {
  var q = S.q.trim().toLowerCase();
  return lista.filter(function (l) {
    if (S.fStatus && l.status !== S.fStatus) return false;
    if (S.fAtend && (l.atendente || '') !== S.fAtend) return false;
    if (!q) return true;
    return (l.nome + ' ' + l.telefone + ' ' + (l.exame || '') + ' ' + (l.origem || '')).toLowerCase().indexOf(q) >= 0;
  });
}
function barraBusca(opcoes) {
  var busca = h('input', { type: 'search', class: 'in', placeholder: 'Buscar por nome, telefone ou exame', value: S.q, 'aria-label': 'Buscar leads' });
  var t = null;
  busca.addEventListener('input', function () { S.q = busca.value; clearTimeout(t); t = setTimeout(function () { comFoco(function () { desenhar(true); }); }, 180); });
  var atend = h('select', { class: 'in', 'aria-label': 'Responsável', onchange: function (e) { S.fAtend = e.target.value; desenhar(true); } }, [h('option', { value: '', text: 'Todos os responsáveis' })].concat(listaAtendentes().map(function (a) { return h('option', { value: a, text: a, selected: S.fAtend === a ? 'selected' : null }); })));
  var cont = [h('div', { class: 'busca' }, [ico('search', 16), busca]), atend];
  if (opcoes && opcoes.status) {
    cont.push(h('select', { class: 'in', 'aria-label': 'Etapa', onchange: function (e) { S.fStatus = e.target.value; desenhar(true); } }, [h('option', { value: '', text: 'Todas as etapas' })].concat(Object.keys(ST).map(function (k) { return h('option', { value: k, text: ST[k], selected: S.fStatus === k ? 'selected' : null }); }))));
  }
  return h('div', { class: 'filtros' }, cont);
}
function listaAtendentes() {
  var s = {}; (S.D ? S.D.atendentes : []).forEach(function (a) { s[a] = 1; });
  (S.D ? S.D.leads : []).forEach(function (l) { if (l.atendente) s[l.atendente] = 1; });
  return Object.keys(s).sort();
}

/* ------------------------------------------------------------------ HOJE (a tela em si fica em hoje.ts; aqui o cartão de tarefa) */
function kpi(rotulo, valor, nota, cls) {
  return h('div', { class: 'kpi ' + (cls || '') }, [h('span', { class: 'kpi-r', text: rotulo }), h('b', { class: 'kpi-v', text: String(valor) }), nota ? h('small', { text: nota }) : null]);
}
function boasVindas() {
  return h('div', { class: 'cartao boas' }, [
    h('h2', { text: 'Seu CRM está vazio' }),
    h('p', { text: 'Cadastre o primeiro lead, importe uma planilha ou carregue leads de exemplo para ver o CRM funcionando (os exemplos podem ser apagados depois).' }),
    h('div', { class: 'boas-b' }, [
      botao('Novo lead', 'pri', function () { dialogoNovoLead(); }, 'plus'),
      botao('Importar planilha (CSV)', '', function () { dialogoImportar(); }, 'upload'),
      botao('Carregar leads de exemplo', '', function () { api('POST', '/exemplos').then(function (r) { aviso(r.criados + ' leads de exemplo criados.', 'ok'); carregar(); }); }, 'bolt')
    ])
  ]);
}

/* ------------------------------------------------------------------ FUNIL (kanban) */
var COLUNAS = [
  { id: 'aberto', r: 'Em aberto', lim: 'limite 1 dia' }, { id: 'sem_retorno', r: 'Sem retorno', lim: 'limite 10 dias' }, { id: 'negociacao', r: 'Em negociação', lim: 'limite 15 dias' },
  { id: 'agendado', r: 'Agendado', lim: 'confirmação automática' }, { id: 'convertido_ativo', r: 'Convertido ativo', lim: 'compareceu e pagou' }
];
function cartaoLead(l) {
  var px = l.v.proximo, tags = [];
  tags.push(h('span', { class: 'dia-b', title: 'Dia da cadência', text: 'D' + l.v.dia }));
  if (px) tags.push(pill(px.passo.rotulo + ' · ' + textoVence(px), 'pl-' + px.situacao));
  if (l.v.limite && l.v.limite.excedido) tags.push(pill('limite excedido', 'pl-atrasada'));
  if (l.status === 'negociacao' && l.retornoData) tags.push(pill('retorno ' + dBR(l.retornoData), 'pl-canal'));
  if (l.status === 'agendado' && l.agendamento) tags.push(pill('agendado ' + dBR(l.agendamento.data), 'pl-canal'));
  if (l.status === 'descarte' && l.descarte) tags.push(pill(l.descarte.motivo, 'pl-motivo'));
  var c = h('article', { class: 'lcard' + (px && px.prioridade === 1 && px.situacao !== 'futura' ? ' p1' : ''), tabindex: '0' }, [
    h('div', { class: 'lcard-t' }, [avatar(l.nome), h('div', null, [h('b', { text: l.nome }), h('small', { text: l.exame || 'sem exame' })]), h('span', { class: 'lcard-v', text: brl(l.valor) })]),
    h('div', { class: 'lcard-tags' }, tags),
    l.atendente ? h('small', { class: 'lcard-a', text: l.atendente }) : null
  ]);
  c.addEventListener('click', function () { abrirLead(l.id); });
  c.addEventListener('keydown', function (e) { if (e.key === 'Enter') abrirLead(l.id); });
  return c;
}
function colunaFunil(def, lista) {
  var valor = 0; lista.forEach(function (l) { valor += l.valor; });
  return h('section', { class: 'col col-' + def.id }, [
    h('header', null, [h('div', null, [h('b', { text: def.r }), h('small', { text: def.lim || '' })]), h('span', { class: 'col-n', text: String(lista.length) })]),
    h('div', { class: 'col-v', text: brl(valor) }),
    h('div', { class: 'col-c' }, lista.length ? lista.slice(0, 60).map(cartaoLead).concat(lista.length > 60 ? [h('p', { class: 'vazio-linha', text: '+ ' + (lista.length - 60) + ' leads (use a busca)' })] : []) : [h('p', { class: 'vazio-linha', text: 'Nenhum lead' })])
  ]);
}
function telaFunil() {
  var tabs = h('div', { class: 'tabs-an', role: 'tablist' }, [['quadro', 'Quadro'], ['pipeline', 'Pipeline e automações']].map(function (t) {
    return h('button', { type: 'button', role: 'tab', class: 'tab-an', 'aria-selected': String(S.fnTab === t[0]), text: t[1], onclick: function () { S.fnTab = t[0]; gravarLS('crm-fntab', t[0]); desenhar(true); } });
  }));
  if (S.fnTab === 'pipeline') return pipelineTela(tabs);
  var q = quadroFunil(); q.insertBefore(tabs, q.children[1]); return q;
}
function quadroFunil() {
  var D = S.D, R = D.resumo;
  var todos = filtrarLeads(D.leads);
  var por = function (s) { return todos.filter(function (l) { return l.status === s; }); };
  var mot = Object.keys(R.motivos).map(function (k) { return [k, R.motivos[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
  return h('div', { class: 'tela' }, [
    cabecalhoTela('Funil', 'Todos os leads por etapa. Clique em um lead para ver o próximo passo, registrar contato e o histórico.', h('div', { class: 'tela-ac' }, [botao('Novo lead', 'pri', function () { dialogoNovoLead(); }, 'plus')])),
    h('div', { class: 'kpis' }, [
      kpi('Leads no total', R.total, 'todos os tempos'),
      kpi('Valor em andamento', brl(R.valorEmAberto), 'orçamentos abertos'),
      kpi('Valor convertido', brl(R.valorConvertido), 'compareceu e pagou', 'ok'),
      kpi('Taxa de conversão', (R.taxaConversao).toFixed(0).replace('.', ',') + '%', 'convertidos entre os encerrados')
    ]),
    barraBusca(),
    h('div', { class: 'kanban' }, COLUNAS.map(function (c) { return colunaFunil(c, por(c.id)); })),
    h('div', { class: 'kanban sec2' }, [
      colunaFunil({ id: 'convertido_organico', r: 'Convertido orgânico', lim: 'já foi à recepção: não entrar em contato' }, por('convertido_organico')),
      colunaFunil({ id: 'descarte', r: 'Descarte', lim: 'sempre com motivo · reativação em 30 a 60 dias' }, por('descarte')),
      h('section', { class: 'col col-motivos' }, [
        h('header', null, [h('div', null, [h('b', { text: 'Motivos de descarte' }), h('small', { text: 'de todos os descartes' })])]),
        h('div', { class: 'col-c' }, mot.length ? mot.map(function (m) { var max = mot[0][1]; return h('div', { class: 'mot' }, [h('span', { text: m[0] }), h('i', null, h('u', { style: 'width:' + Math.round(m[1] / max * 100) + '%' })), h('b', { text: String(m[1]) })]); }) : [h('p', { class: 'vazio-linha', text: 'Nenhum descarte ainda.' })])
      ])
    ])
  ]);
}

/* ------------------------------------------------------------------ LEADS (tabela) */
var ORDEM_L = { k: 'd0', d: -1 };
function telaLeads() {
  var lista = filtrarLeads(S.D.leads).slice();
  var chave = {
    nome: function (l) { return l.nome.toLowerCase(); }, valor: function (l) { return l.valor; }, d0: function (l) { return l.d0; },
    etapa: function (l) { return ST[l.status]; }, passo: function (l) { return l.v.proximo ? l.v.proximo.vence : '9999'; }
  }[ORDEM_L.k];
  lista.sort(function (a, b) { var x = chave(a), y = chave(b); return (x < y ? -1 : x > y ? 1 : 0) * ORDEM_L.d; });
  var cab = function (rot, k) {
    return h('th', { scope: 'col', 'aria-sort': ORDEM_L.k === k ? (ORDEM_L.d > 0 ? 'ascending' : 'descending') : 'none' }, h('button', { type: 'button', class: 'th-b', onclick: function () { ORDEM_L = { k: k, d: ORDEM_L.k === k ? -ORDEM_L.d : (k === 'valor' || k === 'd0' ? -1 : 1) }; desenhar(true); } }, [rot, ORDEM_L.k === k ? h('i', { text: ORDEM_L.d > 0 ? '↑' : '↓' }) : null]));
  };
  var linhas = lista.slice(0, 300).map(function (l) {
    var px = l.v.proximo;
    var tr = h('tr', { class: 'clic', tabindex: '0' }, [
      h('td', null, h('div', { class: 'cel-quem' }, [avatar(l.nome), h('div', null, [h('b', { text: l.nome }), h('small', { text: l.telefone })])])),
      h('td', { text: l.exame || '–' }), h('td', { text: l.unidade || '–' }), h('td', { class: 'num', text: brl(l.valor) }), h('td', null, chipStatus(l.status)),
      h('td', null, px ? h('div', { class: 'prox-passo' }, [h('span', { class: 'prox-t' }, [h('span', { class: 'dia-b', text: px.passo.fase === 'especial' ? '!' : 'D' + px.passo.dia }), ' ', px.passo.rotulo]), pill(textoVence(px), 'pl-' + px.situacao)]) : h('span', { class: 'mut', text: '–' })),
      h('td', { text: l.atendente || '–' }), h('td', { text: dBR(l.d0) }), h('td', { class: 'mut', text: l.ultimoContato ? qDiaHora(l.ultimoContato) : 'sem contato' })
    ]);
    tr.addEventListener('click', function () { abrirLead(l.id); });
    tr.addEventListener('keydown', function (e) { if (e.key === 'Enter') abrirLead(l.id); });
    return tr;
  });
  return h('div', { class: 'tela' }, [
    cabecalhoTela('Leads', lista.length + ' ' + plural(lista.length, 'lead', 'leads') + ' na lista.', h('div', { class: 'tela-ac' }, [
      botao('Exportar CSV', '', function () { window.location.href = '/painel/crm/api/exportar.csv'; }, 'download'),
      botao('Importar CSV', '', function () { dialogoImportar(); }, 'upload'),
      botao('Novo lead', 'pri', function () { dialogoNovoLead(); }, 'plus')
    ])),
    barraBusca({ status: true }),
    h('div', { class: 'cartao tab-cartao' }, lista.length ? h('div', { class: 'tbl-w' }, h('table', { class: 'tbl' }, [
      h('thead', null, h('tr', null, [cab('Lead', 'nome'), h('th', { scope: 'col', text: 'Exame' }), h('th', { scope: 'col', text: 'Unidade' }), cab('Valor', 'valor'), cab('Etapa', 'etapa'), cab('Próximo passo', 'passo'), h('th', { scope: 'col', text: 'Responsável' }), cab('D0', 'd0'), h('th', { scope: 'col', text: 'Último contato' })])),
      h('tbody', null, linhas)
    ])) : vazio('Nenhum lead encontrado', 'Ajuste a busca ou cadastre um novo lead.'))
  ]);
}

/* ------------------------------------------------------------------ MENSAGENS */
function telaMensagens() {
  var chips = [{ id: 'todas', rotulo: 'Todas (11)' }].concat(M.GRUPOS_MSG.map(function (g) { return { id: g.id, rotulo: g.rotulo }; }));
  var barra = h('div', { class: 'chips-f', role: 'group', 'aria-label': 'Filtrar mensagens' }, chips.map(function (c) {
    return h('button', { class: 'chip-f', type: 'button', 'aria-pressed': String(S.msgGrupo === c.id), onclick: function () { S.msgGrupo = c.id; desenhar(true); }, text: c.rotulo });
  }));
  var lista = M.MENSAGENS.filter(function (m) { return S.msgGrupo === 'todas' || m.grupo === S.msgGrupo; });
  return h('div', { class: 'tela' }, [
    cabecalhoTela('Mensagens prontas', 'As 11 mensagens do guia. Copie e troque o que está entre [colchetes]. Dentro de cada lead, a mensagem do passo já vem preenchida, e os botões de resposta rápida (↩) registram a resposta.'),
    barra,
    h('div', { class: 'msgs' }, lista.map(function (m) { return msgCard(m, { verEtapa: true }); })),
    h('div', { class: 'cartao' }, [
      h('h3', { class: 'h3', text: 'Como escrever para vender' }),
      h('div', { class: 'dicas' }, M.DICAS_VENDA.map(function (d) { return h('div', { class: 'dica' }, [h('span', { class: 'dica-ck', 'aria-hidden': 'true' }, ico('check', 16)), h('div', null, [h('b', { text: d.titulo + ': ' }), d.texto])]); }))
    ])
  ]);
}

/* ------------------------------------------------------------------ REGRAS */
function telaRegras() {
  var L = M.LIMITES;
  var auto = [
    'No D3, quem não respondeu ao primeiro contato vai sozinho para Sem retorno, com a nova tentativa às 11:30 (Msg 2).',
    'No D8, quem não respondeu ao encerramento (D7) é descartado sozinho, com o motivo "Sem retorno".',
    'Os passos (D1, D3, D4, D7...) viram tarefas na tela Hoje no dia certo, já na ordem de prioridade: 1º no show, 2º leads novos em aberto.',
    'A confirmação do agendamento é registrada automaticamente.',
    'Passou a data do agendamento sem resultado: o lead sobe para a 1ª prioridade para conferir se compareceu.',
    'Entre 30 e 60 dias depois do descarte, a reativação (Msg 11) entra na fila.',
    'Orçamento acima de R$ 500: o primeiro contato só conta como feito com WhatsApp e ligação.',
    'Em aberto, Sem retorno e Em negociação mostram alerta quando passam do limite de dias.'
  ];
  var naoFaz = [
    'Não envia mensagens sozinho: copia o texto ou abre a conversa no WhatsApp para você enviar.',
    'Não descobre sozinho que o paciente respondeu: você registra a resposta (ou o botão de resposta rápida).'
  ];
  return h('div', { class: 'tela' }, [
    cabecalhoTela('Regras do atendimento', 'O que o sistema cobra e o que ele faz sozinho.'),
    bannerPrioridade(),
    h('div', { class: 'regras4' }, M.REGRAS_OURO.map(function (r) {
      return h('article', { class: 'regra4' }, [h('span', { class: 'rg-n', text: String(r.n) }), h('h3', { text: r.titulo }), h('p', { class: 'r-doc', text: r.texto }), h('p', { class: 'r-sis' }, [h('b', { text: 'No sistema: ' }), r.aplicada])]);
    })),
    h('div', { class: 'duas' }, [
      h('div', { class: 'cartao' }, [h('h3', { class: 'h3', text: 'O que o sistema faz sozinho' }), h('ul', { class: 'lista-o' }, auto.map(function (t) { return h('li', { text: t }); })), h('h3', { class: 'h3 m', text: 'O que ele não faz' }), h('ul', { class: 'lista-o neg' }, naoFaz.map(function (t) { return h('li', { text: t }); }))]),
      h('div', { class: 'cartao' }, [
        h('h3', { class: 'h3', text: 'Prazos e limites' }),
        tabelaSimples(['Regra', 'Valor'], [
          ['Limite em Em aberto', L.aberto + ' dia'], ['Limite em Sem retorno', L.sem_retorno + ' dias'], ['Limite em Em negociação', L.negociacao + ' dias'],
          ['Tentativas por dia (por lead)', 'máx. ' + L.tentativasPorDia], ['Horário de contato', L.janelaInicioH + 'h às ' + L.janelaFimH + 'h, sem exceção'],
          ['Ligação obrigatória a partir de', 'orçamento acima de ' + brl(L.ligacaoAcimaDe)], ['Janela de reativação', L.reativacaoMinDias + ' a ' + L.reativacaoMaxDias + ' dias após o descarte']
        ]),
        h('h3', { class: 'h3 m', text: 'Motivos de descarte' }), h('div', { class: 'chips' }, M.MOTIVOS_DESCARTE.map(function (m) { return pill(m, 'pl-motivo'); })),
        h('h3', { class: 'h3 m', text: 'Glossário' }), h('dl', { class: 'glossario' }, M.GLOSSARIO.map(function (g) { return [h('dt', { text: g.termo }), h('dd', { text: g.texto })]; }))
      ])
    ])
  ]);
}
function tabelaSimples(cols, linhas) {
  return h('div', { class: 'tbl-w' }, h('table', { class: 'tbl peq' }, [h('thead', null, h('tr', null, cols.map(function (c) { return h('th', { scope: 'col', text: c }); }))), h('tbody', null, linhas.map(function (l) { return h('tr', null, l.map(function (c) { return h('td', { text: c }); })); }))]));
}
`;
