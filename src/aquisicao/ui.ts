import { paginaModulo } from '../ui/ds.js';

// Tela do Funil de aquisição (Agente receptivo). Usa os helpers globais do design system (h, ico, modal, barras, kpi2...).
// REGRAS: dentro dos textos não usar crases nem "dollar-chave" (são template literals).

const css = `
#app,#app-geral{display:flex;flex-direction:column;gap:18px;transition:opacity .25s}
#app.carregando,#app-geral.carregando{opacity:.55;pointer-events:none}
.fn-visoes{align-self:flex-start}
.fn-barra{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.c-azul{color:#1d4ed8}.c-verde{color:#15803d}.c-verm{color:#b91c1c}
[data-theme="dark"] .c-azul{color:#60a5fa}[data-theme="dark"] .c-verde{color:#4ade80}[data-theme="dark"] .c-verm{color:#f87171}
.fn-total td{border-top:2px solid var(--line2)}
#avisos{display:flex;flex-direction:column;gap:8px}#avisos:empty{display:none}#avisos .faixa{margin:0}
.meta{font-size:12.5px;color:var(--mut);margin-top:-8px}
.fn-dot{display:inline-block;width:8px;height:8px;border-radius:50%;flex:none}
.fn-nome b{display:block}.fn-nome small{color:var(--mut);font-size:12px}
.fn-cod{font:600 12.5px ui-monospace,Consolas,monospace;background:var(--card2);border:1px solid var(--line);border-radius:8px;padding:8px 10px;word-break:break-all;flex:1;min-width:0}
.fn-links{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.fn-link{display:flex;flex-direction:column;gap:6px;border:1px solid var(--line);border-radius:14px;padding:12px 14px;background:var(--card)}
.fn-link>span{font-size:12.5px;font-weight:700;color:var(--ink2)}.fn-link small{color:var(--mut);font-size:12px;line-height:1.45}
.fn-link .fn-l{display:flex;gap:8px;align-items:center}
.fn-det{display:flex;flex-direction:column;gap:6px;margin-top:10px;font-size:12.5px;color:var(--ink2)}
.fn-det div{display:flex;gap:8px;flex-wrap:wrap;align-items:baseline}.fn-det b{color:var(--ink)}.fn-det em{font-style:normal;color:var(--mut)}
.fn-g2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.fn-sec{display:flex;flex-direction:column;gap:10px;margin-bottom:22px}
.fn-sec>h3{font:800 15px "Segoe UI Variable Display","Segoe UI",system-ui;letter-spacing:-.01em}
.fn-sec>p{font-size:12.5px;color:var(--mut);margin-top:-6px}
.fn-ag{border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin-bottom:8px;font-size:13px;display:flex;flex-direction:column;gap:4px}
.fn-ag small{color:var(--mut)}
.fn-sql{font:12px ui-monospace,Consolas,monospace;color:var(--ink2)}
.fn-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
.fn-kpis .kpi-v{font-size:24px}
.fn-barras .bar-row{grid-template-columns:minmax(110px,36%) minmax(0,1fr) 96px}
.fn-barras.valor .bar-row{grid-template-columns:minmax(110px,36%) minmax(0,1fr) 150px}
.fn-nome{min-width:170px}
@media (max-width:760px){.fn-links,.fn-g2{grid-template-columns:1fr}}
`;

const refresh = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v5h-5"/></svg>';
const main = `
<main id="main"><div class="tela">
  <header class="tela-h">
    <div><h1>Funil de aquisição</h1><p>Quem veio dos anúncios até a consulta: mensagem, agendamento, pagamento e atendimento pelo médico. Visão geral de todos os anúncios ou por campanha.</p></div>
    <div class="tela-ac">
      <button class="btn" id="btn-atualizar" type="button" aria-label="Atualizar">${refresh}<span>Atualizar</span></button>
      <button class="btn pri" id="btn-nova" type="button">+ Nova campanha</button>
    </div>
  </header>
  <div class="seg fn-visoes" role="group" aria-label="Visão">
    <button type="button" data-visao="geral" aria-pressed="true">Visão geral (anúncios)</button>
    <button type="button" data-visao="campanhas" aria-pressed="false">Por campanha</button>
  </div>
  <div class="meta" id="meta" aria-live="polite">Carregando…</div>
  <div id="avisos"></div>
  <div id="app-geral"></div>
  <div id="app"></div>
</div></main>`;

export const paginaFunil = paginaModulo({ titulo: 'Funil de aquisição', modulo: 'receptivo', ativo: 'funil', main, css, scripts: ['/painel/receptivo/funil/app.js'] });

export const funilClienteJs = String.raw`(function () {
'use strict';
var FN = { d: null, aberta: null };
var R2 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
var N0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
var N1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
function reais(v) { return v === null || v === undefined ? '–' : R2.format(v); }
function inteiro(v) { return v === null || v === undefined ? '–' : N0.format(v); }
function porc(a, b) { return b > 0 ? N1.format(a / b * 100) + '%' : '–'; }
function vezes(v) { return v === null || v === undefined ? '–' : N1.format(v) + 'x'; }
function hojeISO() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Belem' }).format(new Date()); }
var CANAL = { meta: 'Meta (Facebook/Instagram)', google: 'Google', tiktok: 'TikTok', outro: 'Outro' };
var STATUS = { ativa: ['Ativa', 'var(--ok)'], pausada: ['Pausada', 'var(--warn)'], encerrada: ['Encerrada', 'var(--mut)'] };
var ETAPA = { conversa: ['Só conversou', 'var(--mut)'], cancelou: ['Agendou e cancelou', 'var(--bad)'], agendou: ['Agendou', 'var(--g2)'], pagou: ['Pagou', 'var(--g3)'], atendido: ['Atendido', 'var(--ok)'] };
function marca(par) { return h('span', { class: 'pill' }, [h('i', { class: 'fn-dot', style: 'background:' + par[1], 'aria-hidden': 'true' }), par[0]]); }

function api(metodo, url, corpo) {
  return fetch(url, { method: metodo, credentials: 'same-origin', cache: 'no-store', headers: corpo ? { 'Content-Type': 'application/json' } : {}, body: corpo ? JSON.stringify(corpo) : undefined })
    .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.mensagem || ('O servidor respondeu ' + r.status)); return j; }); });
}
function copiar(t) {
  var ok = function () { aviso('Copiado.', 'ok'); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, function () { prompt('Copie:', t); });
  else prompt('Copie:', t);
}
function acharCampanha(id) { return (FN.d && FN.d.campanhas || []).filter(function (x) { return x.campanha.id === id; })[0]; }

function carregar() {
  var meta = document.getElementById('meta'), app = document.getElementById('app');
  meta.textContent = 'Carregando…'; app.classList.add('carregando');
  return api('GET', '/painel/receptivo/funil/dados.json')
    .then(function (d) { FN.d = d; desenhar(); })
    .catch(function (e) { meta.textContent = 'Não consegui carregar: ' + e.message; })
    .then(function () { app.classList.remove('carregando'); });
}

/* ------------------------------------------------------------------ lista */
function faixaSql(d) {
  if (d.aviso === 'semBanco') return h('div', { class: 'faixa' }, [ico('alert', 16), h('span', { text: 'O painel está sem o Supabase configurado: o funil de aquisição precisa dele para guardar as campanhas.' })]);
  return h('div', { class: 'faixa' }, [ico('alert', 16), h('div', null, [
    h('b', { text: 'Falta criar as tabelas do funil no Supabase do painel. ' }),
    h('span', { text: 'Rode uma vez no SQL Editor o arquivo docs/supabase-aquisicao.sql do clinex-agents (faltam: ' + (d.faltam || []).join(', ') + ').' })
  ])]);
}
function totais(lista) {
  var t = { investimento: 0, cliques: 0, leads: 0, agendaram: 0, pagaram: 0, atendidos: 0, receita: 0 };
  lista.forEach(function (x) { var m = x.metricas; for (var k in t) t[k] += m[k] || 0; });
  return t;
}
function desenhar() {
  var d = FN.d, app = limpar(document.getElementById('app')), avisos = limpar(document.getElementById('avisos')), meta = document.getElementById('meta');
  if (d.aviso) { avisos.appendChild(faixaSql(d)); meta.textContent = ''; return; }
  if (d.clinilink && !d.clinilink.ok) avisos.appendChild(h('div', { class: 'faixa' }, [ico('alert', 16), h('span', { text: 'O Clinilink não respondeu agora (' + (d.clinilink.erro || 'erro') + '): agendou, pagou e atendido aparecem zerados até ele voltar.' })]));
  meta.textContent = d.campanhas.length + ' ' + plural(d.campanhas.length, 'campanha', 'campanhas') + ' · atualizado às ' + qHora(d.clinilink ? d.clinilink.atualizadoEm : new Date().toISOString());
  if (!d.campanhas.length) {
    app.appendChild(h('section', { class: 'cartao' }, vazio('Nenhuma campanha ainda.', 'Crie a primeira em "+ Nova campanha": o painel gera o link do anúncio e a mensagem com o código da campanha.')));
    return;
  }
  var t = totais(d.campanhas);
  app.appendChild(h('div', { class: 'kpis fn-kpis' }, [
    kpi2({ rotulo: 'Investimento', valor: reais(t.investimento), sub: 'soma das campanhas' }),
    kpi2({ rotulo: 'Leads no WhatsApp', valor: inteiro(t.leads), sub: 'custo por lead ' + (t.leads ? reais(t.investimento / t.leads) : '–') }),
    kpi2({ rotulo: 'Agendaram', valor: inteiro(t.agendaram), sub: porc(t.agendaram, t.leads) + ' dos leads' }),
    kpi2({ rotulo: 'Pagaram', valor: inteiro(t.pagaram), sub: porc(t.pagaram, t.leads) + ' dos leads' }),
    kpi2({ rotulo: 'Atendidos', valor: inteiro(t.atendidos), sub: porc(t.atendidos, t.leads) + ' dos leads' }),
    kpi2({ rotulo: 'Receita', valor: reais(t.receita), sub: 'retorno ' + (t.investimento ? vezes(t.receita / t.investimento) : '–') })
  ]));
  var linhas = d.campanhas.map(function (x) {
    var c = x.campanha, m = x.metricas;
    var tr = h('tr', { class: 'clic', tabindex: '0', onclick: function () { abrirCampanha(c.id); }, onkeydown: function (e) { if (e.key === 'Enter') abrirCampanha(c.id); } }, [
      h('td', null, h('div', { class: 'fn-nome' }, [h('b', { text: c.nome }), h('small', { text: c.codigo + ' · ' + (CANAL[c.canal] || c.canal).split(' (')[0] + ' · desde ' + dBRfull(c.inicio) })])),
      h('td', null, marca(STATUS[c.status] || [c.status, 'var(--mut)'])),
      h('td', { class: 'num', text: reais(m.investimento) }),
      h('td', { class: 'num', text: inteiro(m.cliques) }),
      h('td', { class: 'num', text: inteiro(m.leads) }),
      h('td', { class: 'num', text: inteiro(m.agendaram) }),
      h('td', { class: 'num', text: inteiro(m.pagaram) }),
      h('td', { class: 'num', text: inteiro(m.atendidos) }),
      h('td', { class: 'num', text: reais(m.receita) }),
      h('td', { class: 'num', text: reais(m.cpl) }),
      h('td', { class: 'num', text: vezes(m.roas) })
    ]);
    return tr;
  });
  var tabela = h('div', { class: 'tbl-w' }, h('table', { class: 'tbl' }, [
    h('thead', null, h('tr', null, ['Campanha', 'Situação', 'Investimento', 'Cliques', 'Leads', 'Agendaram', 'Pagaram', 'Atendidos', 'Receita', 'Custo/lead', 'Retorno'].map(function (x) { return h('th', { scope: 'col', text: x }); }))),
    h('tbody', null, linhas)
  ]));
  app.appendChild(h('div', { class: 'g12' }, blocoCartao('Campanhas', 'Clique numa campanha para ver o funil, os leads e os links do anúncio.', tabela, 12)));
}

/* ------------------------------------------------------------------ detalhe da campanha */
function graficoFunil(x) {
  var p = x.passos;
  var linhas = p.map(function (s, i) {
    var ant = i > 0 ? p[i - 1].n : null;
    var dicaLinhas = [{ valor: inteiro(s.n), rotulo: i === 0 ? 'cliques' : 'pessoas' }];
    if (i > 0) dicaLinhas.push({ valor: porc(s.n, ant), rotulo: 'da etapa anterior' });
    (s.partes || []).slice(0, 6).forEach(function (pt) { dicaLinhas.push({ valor: inteiro(pt.n), rotulo: pt.rotulo }); });
    return { rotulo: (i + 1) + '. ' + s.rotulo, valor: s.n, texto: inteiro(s.n), extra: i === 0 ? '' : porc(s.n, ant), dica: { titulo: s.rotulo, linhas: dicaLinhas, nota: s.sub || null } };
  });
  var det = h('div', { class: 'fn-det' }, p.filter(function (s) { return (s.partes && s.partes.length && s.id !== 'pagou' && s.id !== 'atendido') || s.sub; }).map(function (s) {
    return h('div', null, [h('b', { text: s.rotulo + ':' }),
      h('span', { text: (s.id !== 'pagou' && s.id !== 'atendido' ? (s.partes || []) : []).map(function (pt) { return pt.rotulo + ' ' + inteiro(pt.n); }).join(' · ') }),
      s.sub ? h('em', { text: s.sub }) : null]);
  }));
  return [h('div', { class: 'fn-barras' }, barras(linhas, { alta: true, cor: 'var(--g1)' })), det];
}
function quebra(partes, vazioTxt, comValor) {
  if (!partes || !partes.length) return vazio(vazioTxt);
  return h('div', { class: 'fn-barras' + (comValor ? ' valor' : '') }, barras(partes.map(function (pt) { return { rotulo: pt.rotulo, valor: pt.n, texto: inteiro(pt.n), extra: comValor ? reais(pt.valor) : '', dica: { titulo: pt.rotulo, linhas: [{ valor: inteiro(pt.n), rotulo: comValor ? 'O.S. pagas' : 'pacientes' }].concat(comValor ? [{ valor: reais(pt.valor), rotulo: 'recebido' }] : []) } }; }), { cor: 'var(--g1)' }));
}
function blocoLink(titulo, texto, ajuda) {
  return h('div', { class: 'fn-link' }, [h('span', { text: titulo }), h('div', { class: 'fn-l' }, [h('code', { class: 'fn-cod', text: texto }), botao('Copiar', '', function () { copiar(texto); }, 'copy')]), ajuda ? h('small', { text: ajuda }) : null]);
}
function tabelaLeads(leads) {
  if (!leads.length) return vazio('Nenhum lead ainda.', 'O lead aparece quando a pessoa chega no WhatsApp com o código da campanha na mensagem.');
  return h('div', { class: 'tbl-w' }, h('table', { class: 'tbl peq' }, [
    h('thead', null, h('tr', null, ['Chegou', 'Contato', 'Telefone', 'Veio por', 'Etapa', 'Médico', 'Operadora', 'Receita'].map(function (x) { return h('th', { scope: 'col', text: x }); }))),
    h('tbody', null, leads.map(function (l) {
      return h('tr', { class: 'clic', tabindex: '0', onclick: function () { abrirLead(l); }, onkeydown: function (e) { if (e.key === 'Enter') abrirLead(l); } }, [
        h('td', { class: 'num', text: qDiaHora(l.quando) }),
        h('td', null, h('div', { class: 'fn-nome' }, [h('b', { text: l.paciente || l.contato || 'Sem nome' }), l.paciente && l.contato && l.contato !== l.paciente ? h('small', { text: 'WhatsApp: ' + l.contato }) : null])),
        h('td', { class: 'num', text: l.telefone }),
        h('td', { text: l.origem === 'site' ? 'Site' : 'Anúncio' }),
        h('td', null, marca(ETAPA[l.etapa] || [l.etapa, 'var(--mut)'])),
        h('td', { text: l.medicos.join(', ') || '–' }),
        h('td', { text: l.operadoras.join(', ') || '–' }),
        h('td', { class: 'num', text: l.receita ? reais(l.receita) : '–' })
      ]);
    }))
  ]));
}
function abrirLead(l) {
  var corpo = [h('p', { class: 'texto', text: 'Chegou em ' + qDiaHora(l.quando) + ' pelo ' + (l.origem === 'site' ? 'site' : 'anúncio') + (l.por === 'frase' ? ' (reconhecido pela frase do anúncio)' : '') + '. Telefone ' + l.telefone + '.' })];
  if (!l.agendamentos.length) corpo.push(vazio('Ainda sem agendamento no Clinilink.', 'Conta como agendado quando aparece um agendamento criado depois que a pessoa chegou (até 60 dias).'));
  l.agendamentos.forEach(function (a) {
    corpo.push(h('div', { class: 'fn-ag' }, [
      h('b', { text: (a.procedimentos.join(', ') || 'Agendamento') + ' · ' + qDiaHora(a.dataHora) }),
      h('span', { text: (a.profissional ? a.profissional + (a.especialidade ? ' - ' + a.especialidade : '') : 'Sem profissional') + (a.unidade ? ' · ' + a.unidade : '') + ' · situação: ' + a.status + (a.pelaAmanda ? ' · agendado pela Amanda' : '') }),
      a.os.length ? a.os.map(function (o) { return h('small', { text: 'O.S. ' + o.numero + ': ' + o.status + (o.valorPago ? ' · pago ' + reais(o.valorPago) : '') + (o.operadora ? ' · operadora do caixa: ' + o.operadora : '') + (o.pagaEm ? ' · em ' + qDiaHora(o.pagaEm) : '') }); }) : h('small', { text: 'Sem O.S. ainda.' })
    ]));
  });
  modal({ titulo: l.paciente || l.contato || 'Lead', sub: (ETAPA[l.etapa] || [l.etapa])[0], largura: 640, corpo: corpo });
}
function mudarStatus(c, status, m) {
  api('PUT', '/painel/receptivo/funil/campanhas/' + c.id, { status: status })
    .then(function () { aviso('Campanha ' + (STATUS[status] || [status])[0].toLowerCase() + '.', 'ok'); m.fechar(); return carregar(); })
    .then(function () { abrirCampanha(c.id); })
    .catch(function (e) { aviso(e.message, 'erro'); });
}
function abrirCampanha(id) {
  var x = acharCampanha(id); if (!x) return;
  var c = x.campanha, mt = x.metricas, cfg = FN.d.config;
  var corpo = [
    h('div', { class: 'kpis fn-kpis' }, [
      kpi2({ rotulo: 'Investimento', valor: reais(mt.investimento) }),
      kpi2({ rotulo: 'Custo por lead', valor: reais(mt.cpl) }),
      kpi2({ rotulo: 'Custo por agendamento', valor: reais(mt.custoAgendamento) }),
      kpi2({ rotulo: 'Custo por paciente que pagou', valor: reais(mt.cac) }),
      kpi2({ rotulo: 'Receita', valor: reais(mt.receita), sub: 'retorno ' + vezes(mt.roas) })
    ]),
    h('section', { class: 'fn-sec' }, [h('h3', { text: 'Funil da campanha' }), h('p', { text: 'Cada barra é uma etapa; à direita, quantos passaram da etapa anterior. Passe o mouse para ver o detalhe.' })].concat(graficoFunil(x))),
    h('div', { class: 'fn-g2 fn-sec' }, [
      h('div', null, [h('h3', { text: 'Pagou na clínica, por operadora do caixa', style: 'font:800 15px system-ui;margin-bottom:8px' }), quebra((x.passos[4] || {}).partes, 'Nenhuma O.S. paga ainda.', true)]),
      h('div', null, [h('h3', { text: 'Atendido, por médico e especialidade', style: 'font:800 15px system-ui;margin-bottom:8px' }), quebra((x.passos[5] || {}).partes, 'Nenhum atendimento ainda.', false)])
    ]),
    h('section', { class: 'fn-sec' }, [h('h3', { text: 'Leads (' + x.leads.length + ')' }), h('p', { text: 'Quem chegou no WhatsApp com o código desta campanha. Clique para ver os agendamentos e as O.S.' }), tabelaLeads(x.leads)]),
    h('section', { class: 'fn-sec' }, [h('h3', { text: 'Links e mensagem do anúncio' }), h('p', { text: 'Use estes links no anúncio: é por eles que o clique, o site e o WhatsApp ficam ligados à campanha.' }),
      h('div', { class: 'fn-links' }, [
        blocoLink('Anúncio que leva ao SITE', x.links.site, 'Abre ' + (c.urlSite || cfg.site) + ' marcado com a campanha; os botões de WhatsApp do site levam o código junto.'),
        blocoLink('Anúncio que leva direto ao WHATSAPP', x.links.whatsapp, 'Abre o WhatsApp da Clinex (' + cfg.numeroWhatsApp + ') com a mensagem pronta e o código.'),
        blocoLink('Mensagem pronta (anúncio de mensagem do Meta, sem link)', x.links.mensagemAnuncio, 'Cole como mensagem pré-preenchida no gerenciador de anúncios: o código no fim liga a conversa à campanha. Informe os cliques do gerenciador em Editar.'),
        blocoLink('Script do site (já instalado no site da Clinex)', '<script src="' + cfg.base + '/c/site.js" defer></script>', 'Vai uma vez em todas as páginas do site: confirma a visita e passa o código para os botões de WhatsApp.')
      ])])
  ];
  var rodape = [botao('Editar', '', function () { m.fechar(); formCampanha(c); }, 'edit')];
  if (c.status !== 'ativa') rodape.push(botao('Reativar', '', function () { mudarStatus(c, 'ativa', m); }));
  if (c.status === 'ativa') rodape.push(botao('Pausar', '', function () { mudarStatus(c, 'pausada', m); }));
  if (c.status !== 'encerrada') rodape.push(botao('Encerrar', 'perigo', function () { confirmar({ titulo: 'Encerrar a campanha?', texto: 'Os links continuam funcionando e o histórico fica guardado; ela só sai das ativas.', sim: 'Encerrar', perigo: true, aoSim: function () { mudarStatus(c, 'encerrada', m); } }); }));
  var m = modal({ gaveta: true, largura: 1040, corpo: corpo, rodape: rodape, aoFechar: function () { FN.aberta = null; },
    cabecalho: [h('h2', { text: c.nome }), h('p', null, [marca(STATUS[c.status] || [c.status, 'var(--mut)']), ' ', h('span', { class: 'pill', text: 'Código ' + c.codigo }), ' ', h('span', { class: 'pill', text: CANAL[c.canal] || c.canal }), ' ', 'de ' + dBRfull(c.inicio) + (c.fim ? ' até ' + dBRfull(c.fim) : ' (sem data de fim)')])] });
  FN.aberta = c.id;
}

/* ------------------------------------------------------------------ criar / editar */
function formCampanha(c) {
  var editar = !!c; c = c || {};
  var cfg = FN.d && FN.d.config || {};
  function entrada(tipo, valor, extra) { var el = h('input', Object.assign({ class: 'in', type: tipo }, extra || {})); el.value = valor === undefined || valor === null ? '' : valor; return el; }
  function caixa(valor, linhas, extra) { var el = h('textarea', Object.assign({ class: 'in', rows: linhas }, extra || {})); el.value = valor || ''; return el; }
  var canal = h('select', { class: 'in' }, Object.keys(CANAL).map(function (k) { return h('option', { value: k, text: CANAL[k] }); }));
  canal.value = c.canal || 'meta';
  var f = {
    nome: entrada('text', c.nome, { maxlength: 60, autofocus: true, placeholder: 'Ex.: Check-up Novembro Instagram' }),
    codigo: entrada('text', c.codigo, { maxlength: 12, placeholder: 'gerado pelo nome', disabled: editar ? true : null, style: 'text-transform:uppercase' }),
    inicio: entrada('date', c.inicio || hojeISO()),
    fim: entrada('date', c.fim),
    investimento: entrada('number', c.investimento, { min: 0, step: '0.01', placeholder: '0,00' }),
    cliquesInformados: entrada('number', c.cliquesInformados, { min: 0, step: '1', placeholder: '0' }),
    urlSite: entrada('url', c.urlSite, { placeholder: cfg.site || 'https://' }),
    mensagem: caixa(c.mensagem, 2, { maxlength: 200, placeholder: cfg.mensagemPadrao || '' }),
    frases: caixa((c.frases || []).join('\n'), 2, { placeholder: 'Ex.: Quero o check-up completo por R$ 99' }),
    observacao: caixa(c.observacao, 2, { maxlength: 500 })
  };
  function salvar() {
    var corpo = { nome: f.nome.value, canal: canal.value, inicio: f.inicio.value, fim: f.fim.value, investimento: f.investimento.value, cliquesInformados: f.cliquesInformados.value, urlSite: f.urlSite.value, mensagem: f.mensagem.value, frases: f.frases.value, observacao: f.observacao.value };
    if (!editar) corpo.codigo = f.codigo.value;
    btn.disabled = true;
    api(editar ? 'PUT' : 'POST', '/painel/receptivo/funil/campanhas' + (editar ? '/' + c.id : ''), corpo)
      .then(function (r) { aviso(editar ? 'Campanha salva.' : 'Campanha criada. Use os links dela no anúncio.', 'ok'); m.fechar(); return carregar().then(function () { abrirCampanha(r.campanha.id); }); })
      .catch(function (e) { aviso(e.message, 'erro'); btn.disabled = false; });
  }
  var btn = botao(editar ? 'Salvar' : 'Criar campanha', 'pri', salvar);
  var m = modal({
    titulo: editar ? 'Editar campanha' : 'Nova campanha', sub: editar ? 'O código não muda: ele já está nos anúncios publicados.' : 'Depois de criar, o painel mostra os links e a mensagem para colocar no anúncio.', largura: 760,
    corpo: [
      h('div', { class: 'grade-f' }, [
        campo('Nome da campanha', f.nome), campo('Canal', canal),
        campo('Código', f.codigo, editar ? 'Fixo depois de criado.' : 'Vai no fim da mensagem do WhatsApp: (ref: CÓDIGO). Vazio = gerado pelo nome.'),
        campo('Investimento no anúncio (R$)', f.investimento, 'Pode atualizar ao longo da campanha.'),
        campo('Início', f.inicio), campo('Fim (opcional)', f.fim),
        campo('Cliques informados pelo gerenciador', f.cliquesInformados, 'Só para anúncio que abre o WhatsApp direto, sem o nosso link.'),
        campo('Página do site', f.urlSite, 'Para onde vai o anúncio de site. Vazio = página inicial.')
      ]),
      campo('Mensagem que já vem escrita no WhatsApp', f.mensagem, 'O código é acrescentado no fim automaticamente.'),
      campo('Frases da mensagem pronta do anúncio (uma por linha, opcional)', f.frases, 'Para anúncio de mensagem do Meta sem o código: uma frase (12 letras ou mais) que identifica a campanha.'),
      campo('Observação', f.observacao)
    ],
    rodape: [botao('Cancelar', '', function () { m.fechar(); }), btn]
  });
}

/* ------------------------------------------------------------------ VISÃO GERAL: todas as conversas que vieram de anúncio da Meta */
var GER = { d: null, dias: 7 };
try { GER.dias = Number(localStorage.getItem('fn-geral-dias')) || 7; } catch (e) {}
function desdeDias(n) { var d = new Date(Date.now() - (n - 1) * 864e5); return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Belem' }).format(d); }
var ORIGEM = { facebook: 'Facebook', instagram: 'Instagram', whatsapp: 'WhatsApp (Status)' };
function cor(cls, txt) { return h('b', { class: cls, text: txt }); }

function carregarGeral() {
  var meta = document.getElementById('meta'), app = document.getElementById('app-geral');
  meta.textContent = 'Carregando…'; app.classList.add('carregando');
  return api('GET', '/painel/receptivo/funil/geral.json?desde=' + desdeDias(GER.dias))
    .then(function (d) { GER.d = d; desenharGeral(); })
    .catch(function (e) { meta.textContent = 'Não consegui carregar: ' + e.message; })
    .then(function () { app.classList.remove('carregando'); });
}
function desenharGeral() {
  var d = GER.d, app = limpar(document.getElementById('app-geral')), meta = document.getElementById('meta');
  if (d.aviso) { app.appendChild(h('div', { class: 'faixa' }, [ico('alert', 16), h('span', { text: 'O painel está sem o Supabase configurado.' })])); meta.textContent = ''; return; }
  meta.textContent = 'Desde ' + dBRfull(d.desde) + ' · atualizado às ' + qHora(d.geradoEm) + ' · conta como agendado quem recebeu a mensagem de confirmação no WhatsApp ou tem agendamento no Clinilink com o mesmo telefone';
  var periodo = h('div', { class: 'seg', role: 'group', 'aria-label': 'Período' }, [7, 30, 90].map(function (n) {
    return h('button', { type: 'button', 'aria-pressed': GER.dias === n ? 'true' : 'false', text: n + ' dias', onclick: function () { GER.dias = n; try { localStorage.setItem('fn-geral-dias', String(n)); } catch (e) {} carregarGeral(); } });
  }));
  app.appendChild(h('div', { class: 'fn-barra' }, [periodo]));
  if (d.avisoClinilink) app.appendChild(h('div', { class: 'faixa' }, [ico('alert', 16), h('span', { text: d.avisoClinilink })]));
  var t = d.total;
  if (!t.pessoas) { app.appendChild(h('section', { class: 'cartao' }, vazio('Nenhuma conversa de anúncio neste período.', 'Toda conversa que chega pelo anúncio da Meta (Facebook, Instagram, Status) aparece aqui com a etiqueta AD da Inovstar.'))); return; }
  app.appendChild(h('div', { class: 'kpis fn-kpis' }, [
    kpi2({ rotulo: 'Vieram de anúncio e mandaram mensagem', valor: inteiro(t.pessoas), sub: d.anuncios.length + ' anúncio(s)' }),
    kpi2({ rotulo: 'Agendaram', valor: inteiro(t.agendaram), sub: porc(t.agendaram, t.pessoas) + ' de conversão' }),
    kpi2({ rotulo: 'Não agendaram', valor: inteiro(t.naoAgendaram), sub: porc(t.naoAgendaram, t.pessoas) + ' das conversas' }),
    kpi2({ rotulo: 'Pagaram na clínica', valor: inteiro(t.pagaram), sub: porc(t.pagaram, t.agendaram) + ' de quem agendou' }),
    kpi2({ rotulo: 'Atendidos pelo médico', valor: inteiro(t.atendidos), sub: porc(t.atendidos, t.agendaram) + ' de quem agendou' }),
    kpi2({ rotulo: 'Receita', valor: reais(t.receita), sub: 'O.S. pagas no Clinilink' })
  ]));
  var passos = [
    ['1. Vieram do anúncio e mandaram mensagem', t.pessoas, 'pessoas'],
    ['2. Agendaram', t.agendaram, 'agendaram'],
    ['3. Pagaram na clínica', t.pagaram, 'pagaram'],
    ['4. Atendidos pelo médico', t.atendidos, 'atendidos']
  ];
  var linhasFunil = passos.map(function (p, i) {
    var ant = i ? passos[i - 1][1] : null;
    return { rotulo: p[0], valor: p[1], texto: inteiro(p[1]), extra: i ? porc(p[1], ant) : '', dica: { titulo: p[0], linhas: [{ valor: inteiro(p[1]), rotulo: p[2] }].concat(i ? [{ valor: porc(p[1], ant), rotulo: 'da etapa anterior' }] : []) } };
  });
  app.appendChild(h('div', { class: 'g12' }, blocoCartao('Funil geral dos anúncios', 'Quem veio do anúncio até a consulta. Não agendaram: ' + inteiro(t.naoAgendaram) + ' (' + porc(t.naoAgendaram, t.pessoas) + ').',
    h('div', { class: 'fn-barras' }, barras(linhasFunil, { alta: true, cor: 'var(--g1)' })), 12)));

  var linhas = d.anuncios.map(function (a) {
    var origens = Object.keys(a.origens).map(function (o) { return (ORIGEM[o] || o) + ' ' + a.origens[o]; }).join(' · ');
    return h('tr', { class: 'clic', tabindex: '0', onclick: function () { abrirAnuncio(a); }, onkeydown: function (e) { if (e.key === 'Enter') abrirAnuncio(a); } }, [
      h('td', null, h('div', { class: 'fn-nome' }, [h('b', { text: a.titulo }), h('small', { text: (a.etiqueta || 'sem etiqueta') + (origens ? ' · ' + origens : '') })])),
      h('td', { class: 'num' }, cor('c-azul', inteiro(a.pessoas))),
      h('td', { class: 'num' }, cor('c-verde', inteiro(a.agendaram))),
      h('td', { class: 'num' }, cor('c-verm', inteiro(a.naoAgendaram))),
      h('td', { class: 'num' }, h('b', { text: a.conversao === null ? '–' : N0.format(a.conversao) + '%' })),
      h('td', { class: 'num', text: inteiro(a.pagaram) }),
      h('td', { class: 'num', text: inteiro(a.atendidos) }),
      h('td', { class: 'num', text: a.receita ? reais(a.receita) : '–' })
    ]);
  });
  linhas.push(h('tr', { class: 'fn-total' }, [
    h('td', null, h('b', { text: 'Total' })),
    h('td', { class: 'num' }, cor('c-azul', inteiro(t.pessoas))),
    h('td', { class: 'num' }, cor('c-verde', inteiro(t.agendaram))),
    h('td', { class: 'num' }, cor('c-verm', inteiro(t.naoAgendaram))),
    h('td', { class: 'num' }, h('b', { text: porc(t.agendaram, t.pessoas) })),
    h('td', { class: 'num', text: inteiro(t.pagaram) }),
    h('td', { class: 'num', text: inteiro(t.atendidos) }),
    h('td', { class: 'num', text: t.receita ? reais(t.receita) : '–' })
  ]));
  var tabela = h('div', { class: 'tbl-w' }, h('table', { class: 'tbl' }, [
    h('thead', null, h('tr', null, ['Anúncio', 'Mandaram mensagem', 'Agendaram', 'Não agendaram', 'Conversão', 'Pagaram', 'Atendidos', 'Receita'].map(function (x) { return h('th', { scope: 'col', text: x }); }))),
    h('tbody', null, linhas)
  ]));
  app.appendChild(h('div', { class: 'g12' }, blocoCartao('Por anúncio', 'Clique num anúncio para ver cada pessoa: quando chegou, se agendou, pagou e foi atendida.', tabela, 12)));
}
function abrirAnuncio(a) {
  var leads = (GER.d.leads || []).filter(function (l) { return l.titulo === a.titulo; });
  var corpo = h('div', { class: 'tbl-w' }, h('table', { class: 'tbl peq' }, [
    h('thead', null, h('tr', null, ['Chegou', 'Contato', 'Telefone', 'Veio por', 'Agendou?', 'Pagou', 'Atendido'].map(function (x) { return h('th', { scope: 'col', text: x }); }))),
    h('tbody', null, leads.map(function (l) {
      var ag = l.confirmacao ? 'Sim · ' + (l.confirmacao.data || '') + ' ' + (l.confirmacao.servico || '').slice(0, 40) + ' (confirmado por ' + l.confirmacao.quem + ')'
        : l.agendamento ? 'Sim · ' + qDia(l.agendamento.data) + ' ' + (l.agendamento.servico || '').slice(0, 40) + ' (Clinilink)' : 'Não';
      return h('tr', null, [
        h('td', { class: 'num', text: qDiaHora(l.quando) }),
        h('td', { text: l.contato || '—' }),
        h('td', { class: 'num', text: l.telefone }),
        h('td', { text: ORIGEM[l.origem] || l.origem || '—' }),
        h('td', null, cor(l.agendou ? 'c-verde' : 'c-verm', ag)),
        h('td', { text: l.pagou ? 'Sim' + (l.valorPago ? ' · ' + reais(l.valorPago) : '') + (l.operadora ? ' · ' + l.operadora : '') : '—' }),
        h('td', { text: l.atendido ? 'Sim' + (l.agendamento && l.agendamento.profissional ? ' · ' + l.agendamento.profissional + (l.agendamento.especialidade ? ' - ' + l.agendamento.especialidade : '') : '') : '—' })
      ]);
    }))
  ]));
  modal({ titulo: a.titulo, sub: inteiro(a.pessoas) + ' mandaram mensagem · ' + inteiro(a.agendaram) + ' agendaram (' + (a.conversao === null ? '–' : N0.format(a.conversao) + '%') + ') · ' + (a.etiqueta || 'sem etiqueta'), largura: 1100, gaveta: true, corpo: corpo });
}

/* ------------------------------------------------------------------ troca de visão */
var VISAO = 'geral';
try { VISAO = localStorage.getItem('fn-visao') || 'geral'; } catch (e) {}
function mostrarVisao(v) {
  VISAO = v; try { localStorage.setItem('fn-visao', v); } catch (e) {}
  document.querySelectorAll('[data-visao]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-visao') === v ? 'true' : 'false'); });
  document.getElementById('app-geral').style.display = v === 'geral' ? '' : 'none';
  document.getElementById('app').style.display = v === 'geral' ? 'none' : '';
  document.getElementById('avisos').style.display = v === 'geral' ? 'none' : '';
  document.getElementById('btn-nova').style.display = v === 'geral' ? 'none' : '';
  return v === 'geral' ? carregarGeral() : carregar();
}
document.querySelectorAll('[data-visao]').forEach(function (b) { b.addEventListener('click', function () { mostrarVisao(b.getAttribute('data-visao')); }); });
document.getElementById('btn-atualizar').addEventListener('click', function () { return VISAO === 'geral' ? carregarGeral() : carregar(); });
document.getElementById('btn-nova').addEventListener('click', function () { if (FN.d && FN.d.aviso) { aviso('Antes, crie as tabelas do funil no Supabase (veja o aviso).', 'erro'); return; } formCampanha(null); });
mostrarVisao(VISAO);
})();
`;
