import { Router } from 'express';
import { painelAuth } from '../lib/painel-auth.js';
import { env } from '../lib/env.js';
import { estado, infoArmazenamento } from '../crm/banco.js';
import { clinilinkConfigurado } from '../crm/clinilink.js';
import { estadoArmazem } from '../bi/armazem.js';
import { supabaseConfigurado } from '../lib/supabase.js';
import { DS_CSP, dsCss, dsJs } from '../ui/ds.js';

/**
 * Tela inicial do painel (GET /painel): escolhe o módulo e mostra o estado do sistema.
 * Também serve o design system compartilhado (/painel/ds.css e /painel/ds.js) usado pelo Agente receptivo.
 * Não expõe nenhum segredo: o status só diz se cada integração está configurada ou não.
 */
const router = Router();

const css = `
body{display:block}
.hub{max-width:1080px;margin:0 auto;padding:30px 24px 60px;display:flex;flex-direction:column;gap:34px;min-height:100vh}
.hub-top{display:flex;align-items:center;justify-content:space-between;gap:16px}
.hub-top .logo{padding:0}.hub-top .logo b{font-size:30px}
.hub-eyebrow{font:700 11.5px ui-monospace,Consolas,monospace;letter-spacing:.16em;text-transform:uppercase;color:var(--cy)}
.hub h1{font:800 clamp(32px,5vw,46px)/1.05 "Segoe UI Variable Display","Segoe UI",system-ui;letter-spacing:-.04em;margin:8px 0 10px}
.hub h1 em{font-style:normal;background:linear-gradient(100deg,var(--acc),var(--acc2));-webkit-background-clip:text;background-clip:text;color:transparent}
.hub-sub{color:var(--ink2);font-size:16px;max-width:60ch;line-height:1.6}
.mods{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:18px}
.mod{--mc:var(--acc);position:relative;display:flex;flex-direction:column;gap:18px;padding:26px 26px 22px;border-radius:24px;border:1px solid var(--line);background:linear-gradient(160deg,color-mix(in srgb,var(--mc) 9%,var(--card2)),var(--card));box-shadow:var(--shadow);overflow:hidden;animation:entra .55s both;transition:transform .25s cubic-bezier(.2,.8,.2,1),border-color .2s,box-shadow .25s}
.mod:nth-child(2){animation-delay:.08s;--mc:var(--cy)}
.mod::before{content:"";position:absolute;inset:0;background:radial-gradient(420px 220px at var(--mx,85%) var(--my,-10%),color-mix(in srgb,var(--mc) 28%,transparent),transparent 70%);opacity:.55;transition:opacity .3s;pointer-events:none}
.mod::after{content:"";position:absolute;left:-60%;top:0;width:45%;height:100%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.09),transparent);transform:skewX(-18deg);transition:left .7s ease;pointer-events:none}
.mod:hover{transform:translateY(-5px);border-color:color-mix(in srgb,var(--mc) 60%,transparent);box-shadow:0 22px 60px color-mix(in srgb,var(--mc) 22%,transparent),var(--shadow)}
.mod:hover::before{opacity:1}.mod:hover::after{left:120%}
.mod-ic{width:56px;height:56px;border-radius:17px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,var(--mc),color-mix(in srgb,var(--mc) 55%,var(--acc2)));box-shadow:0 10px 30px color-mix(in srgb,var(--mc) 40%,transparent);position:relative;z-index:1}
.mod:nth-child(2) .mod-ic{color:#04141a}
.mod-t{position:relative;z-index:1}.mod-t b{display:block;font:800 25px/1.15 "Segoe UI Variable Display","Segoe UI";letter-spacing:-.03em}.mod-t span{display:block;margin-top:6px;color:var(--ink2);line-height:1.55}
.mod-st{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;position:relative;z-index:1}
.mod-st div{padding:10px 12px;border-radius:14px;background:color-mix(in srgb,var(--solid) 55%,transparent);border:1px solid var(--line)}
.mod-st b{display:block;font:800 21px/1.1 "Segoe UI Variable Display","Segoe UI";letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.mod-st span{display:block;margin-top:2px;font-size:11.5px;color:var(--mut)}
.mod-st .skel{height:52px;border-radius:14px}
.mod-go{display:inline-flex;align-items:center;gap:8px;font-weight:700;color:var(--ink);position:relative;z-index:1}
.mod-go svg{transition:transform .25s}.mod:hover .mod-go svg{transform:translateX(6px)}
.sis{display:flex;flex-direction:column;gap:12px}
.sis h2{font:800 11.5px ui-monospace,Consolas,monospace;letter-spacing:.16em;text-transform:uppercase;color:var(--mut)}
.sis-l{display:flex;flex-wrap:wrap;gap:10px}
.sis-i{display:inline-flex;align-items:center;gap:10px;padding:9px 15px;border-radius:14px;border:1px solid var(--line);background:var(--card);font-size:13px;animation:entra .5s both}
.sis-i i{width:9px;height:9px;border-radius:50%;background:var(--ok);box-shadow:0 0 10px var(--ok);flex:none}
.sis-i.aviso i{background:var(--warn);box-shadow:0 0 10px var(--warn)}.sis-i.off i{background:var(--bad);box-shadow:0 0 10px var(--bad)}
.sis-i b{font-weight:700}.sis-i span{color:var(--mut)}
.hub-rodape{margin-top:auto;color:var(--mut);font-size:12px;text-align:center}
@media (prefers-reduced-motion:reduce){.mod,.sis-i{animation:none}.mod::after{display:none}}
`;

const pagina = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow"><link rel="icon" href="data:,">
<title>Clinex · Painel</title>
<link rel="stylesheet" href="/painel/ds.css"><style>${css}</style></head><body>
<main class="hub">
  <header class="hub-top"><div class="logo"><b>clinex</b></div><div id="topo-dir"></div></header>
  <section>
    <div class="hub-eyebrow" id="data"></div>
    <h1>Tudo da clínica, <em>em um só lugar</em></h1>
    <p class="hub-sub">Escolha o módulo. O CRM cuida dos leads, dos funis e da cadência de atendimento; o Agente receptivo é a Amanda no WhatsApp, com fluxo, indicadores e logs.</p>
  </section>
  <section class="mods" id="mods" aria-label="Módulos"></section>
  <section class="sis"><h2>Estado do sistema</h2><div class="sis-l" id="sis"><span class="mut">Verificando…</span></div></section>
  <footer class="hub-rodape">Clinex · painel interno · acesso protegido por senha</footer>
</main>
<script src="/painel/ds.js"></script>
<script src="/painel/hub.js"></script>
</body></html>`;

const hubJs = String.raw`
(function () {
  var DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var d = new Date(Date.now() - 3 * 3600000);
  document.getElementById('data').textContent = DIAS[d.getUTCDay()] + ', ' + d.getUTCDate() + ' de ' + MESES[d.getUTCMonth()];

  /* o botão de tema e a leitura do tema salvo vêm do design system (ds.js) */

  var MOD = [
    { href: '/painel/crm', icone: 'funil', nome: 'CRM', desc: 'Leads, funis do Clinilink, fila do dia, automações, mensagens e relatórios de produtividade.', id: 'crm' },
    { href: '/painel/receptivo', icone: 'robot', nome: 'Agente receptivo', desc: 'A Amanda no WhatsApp: mapa do fluxo, exemplos de conversa, indicadores de BI e logs das consultas.', id: 'agente' }
  ];
  var mods = document.getElementById('mods');
  var stats = {};
  MOD.forEach(function (m) {
    var st = h('div', { class: 'mod-st' }, [h('div', { class: 'skel' }), h('div', { class: 'skel' }), h('div', { class: 'skel' })]);
    stats[m.id] = st;
    var card = h('a', { class: 'mod', href: m.href }, [
      h('span', { class: 'mod-ic' }, ico(m.icone, 28)),
      h('div', { class: 'mod-t' }, [h('b', { text: m.nome }), h('span', { text: m.desc })]),
      st,
      h('span', { class: 'mod-go' }, ['Abrir', ico('arrow', 18)])
    ]);
    card.addEventListener('pointermove', function (e) { var r = card.getBoundingClientRect(); card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%'); card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%'); });
    mods.appendChild(card);
  });

  function stat(valor, rotulo, fmt) {
    var b = h('b', { text: '–' });
    if (typeof valor === 'number') contar(b, valor, fmt || function (v) { return nf0.format(Math.round(v)); }); else b.textContent = valor;
    return h('div', null, [b, h('span', { text: rotulo })]);
  }

  fetch('/painel/status', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (s) {
    limpar(stats.crm); kids(stats.crm, [stat(s.crm.cards, 'cards nos funis'), stat(s.crm.leads, 'leads no guia'), stat(s.crm.foraDaCadencia, 'fora da cadência')]);
    limpar(stats.agente); kids(stats.agente, [stat(s.agente.modo, 'modo da Amanda'), stat(s.agente.eventos, 'eventos no BI'), stat(s.agente.resposta, 'resposta ao paciente')]);
    var l = document.getElementById('sis'); limpar(l);
    s.sistema.forEach(function (i, k) {
      var el = h('div', { class: 'sis-i ' + (i.ok ? '' : i.aviso ? 'aviso' : 'off'), style: 'animation-delay:' + (k * 0.05) + 's' }, [h('i'), h('b', { text: i.nome }), h('span', { text: i.detalhe })]);
      l.appendChild(el);
    });
  }).catch(function () {
    Object.keys(stats).forEach(function (k) { limpar(stats[k]); });
    var l = document.getElementById('sis'); limpar(l); l.appendChild(h('div', { class: 'sis-i off' }, [h('i'), h('b', { text: 'Status' }), h('span', { text: 'não consegui carregar' })]));
  });
})();
`;

router.get('/ds.css', painelAuth, (_req, res) => { res.setHeader('Cache-Control', 'private, max-age=120'); res.type('text/css; charset=utf-8').send(dsCss); });
router.get('/ds.js', painelAuth, (_req, res) => { res.setHeader('Cache-Control', 'private, max-age=120'); res.type('application/javascript; charset=utf-8').send(dsJs); });
router.get('/hub.js', painelAuth, (_req, res) => res.type('application/javascript; charset=utf-8').send(hubJs));

router.get('/status', painelAuth, (_req, res) => {
  const arm = infoArmazenamento();
  const bi = estadoArmazem();
  const pl = estado.pipelines;
  const agora = Date.now();
  // cards fora da cadência: dias na coluna maior que a cadência (conta simples, sem trazer as regras para o hub)
  let fora = 0;
  for (const a of pl.atribuicoes) {
    if (a.caseStatus !== 'aberto') continue;
    const f = pl.funis.find((x) => x.id === a.funilId); const e = f?.stages.find((s) => s.id === a.stageId);
    if (e?.cadenciaDias && !/convert|perd|descart|sem retorno|recuper|agendad/i.test(e.label) && (agora - Date.parse(a.enteredAt)) / 86_400_000 > e.cadenciaDias) fora++;
  }
  res.json({
    crm: { cards: pl.atribuicoes.filter((a) => a.caseStatus !== 'removido').length, leads: estado.leads.length, foraDaCadencia: fora },
    agente: { modo: env.mode === 'claude' ? 'Claude' : 'Roteiro', eventos: bi.eventosEmMemoria, resposta: env.autoReply ? 'automática' : 'só sombra' },
    sistema: [
      { nome: 'Banco de dados', ok: arm.destino === 'supabase' && !arm.erro, aviso: arm.destino !== 'supabase', detalhe: arm.destino === 'supabase' ? 'Supabase' : arm.destino === 'arquivo' ? 'arquivo local' : 'memória' },
      { nome: 'Clinilink (leitura)', ok: clinilinkConfigurado(), detalhe: clinilinkConfigurado() ? 'conectado' : 'sem chave' },
      { nome: 'Inovstar (WhatsApp)', ok: Boolean(env.inovstarToken), detalhe: env.inovstarToken ? 'conectado' : 'sem token' },
      { nome: 'Amanda', ok: env.autoReply, aviso: !env.autoReply, detalhe: env.autoReply ? 'respondendo' : 'modo sombra (não envia)' },
      { nome: 'IA', ok: Boolean(env.anthropicKey || env.openaiKey), aviso: !(env.anthropicKey || env.openaiKey), detalhe: env.anthropicKey ? 'Claude' : env.openaiKey ? 'GPT (tom)' : 'sem chave' },
      { nome: 'Supabase', ok: supabaseConfigurado(), aviso: !supabaseConfigurado(), detalhe: supabaseConfigurado() ? 'configurado' : 'não configurado' },
    ],
  });
});

router.get('/', painelAuth, (_req, res) => {
  res.setHeader('Content-Security-Policy', DS_CSP);
  res.type('text/html; charset=utf-8').send(pagina);
});

// endereços antigos (antes de existir a tela inicial)
router.get('/logs', painelAuth, (_req, res) => res.redirect(301, '/painel/receptivo/logs'));

export default router;
