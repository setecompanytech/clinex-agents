/**
 * IA em tela cheia (/painel/assistente): o mesmo agente do CRM, num chat completo (conversas guardadas no navegador,
 * lista de conversas, campo que cresce, respostas com links para os leads), com fundo animado, abertura com digitação,
 * cartões que reagem ao mouse e resposta que aparece palavra por palavra. Dentro dos textos de JS não usar crases nem "dollar-chave".
 */

export const assistenteCss = `
main#main{max-width:none;margin:0;padding:0;height:calc(100vh - 62px);display:block}
.as-wrap{display:grid;grid-template-columns:272px minmax(0,1fr);height:100%;min-height:0}
.as-lado{display:flex;flex-direction:column;gap:12px;min-height:0;padding:16px 12px;border-right:1px solid var(--line);background:color-mix(in srgb,var(--solid) 70%,transparent)}
.as-nova{position:relative;overflow:hidden;display:flex;align-items:center;gap:10px;width:100%;padding:11px 14px;border-radius:14px;border:1px solid var(--line2);background:var(--card);color:var(--ink);font-weight:700;font-size:14px;cursor:pointer;transition:border-color .2s,transform .2s}
.as-nova:hover{border-color:var(--cy);transform:translateY(-1px)}
.as-nova svg{transition:transform .35s}.as-nova:hover svg{transform:rotate(90deg)}
.as-cap{font:800 11px ui-monospace,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--mut);padding:6px 8px 0}
.as-hist{display:flex;flex-direction:column;gap:2px;overflow-y:auto;min-height:0;flex:1;scrollbar-width:thin}
.as-it{display:flex;align-items:center;gap:4px;border-radius:11px;color:var(--ink2);animation:asEntra .35s both}
.as-it:hover,.as-it.on{background:var(--card2);color:var(--ink)}
.as-it.on{box-shadow:inset 2px 0 0 var(--cy)}
.as-it>button:first-child{flex:1;min-width:0;text-align:left;padding:9px 10px;border:0;background:transparent;color:inherit;font-size:13.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
.as-it .as-x{width:28px;height:28px;margin-right:4px;border:0;border-radius:8px;background:transparent;color:var(--mut);display:grid;place-items:center;opacity:0;cursor:pointer}
.as-it:hover .as-x,.as-it:focus-within .as-x{opacity:1}.as-x:hover{background:color-mix(in srgb,var(--bad) 18%,transparent);color:var(--bad)}
.as-vazio-h{padding:10px;color:var(--mut);font-size:13px;line-height:1.5}

.as-chat{position:relative;overflow:hidden;display:flex;flex-direction:column;min-width:0;min-height:0}
.as-chat>*{position:relative;z-index:1}
/* fundo vivo: aurora que deriva + partículas que sobem */
.as-fundo{position:absolute!important;inset:0;z-index:0!important;pointer-events:none;overflow:hidden}
.as-aurora{position:absolute;border-radius:50%;filter:blur(70px);opacity:.5;will-change:transform}
.as-aurora.a{width:520px;height:520px;left:-120px;top:-140px;background:radial-gradient(circle,color-mix(in srgb,var(--acc) 70%,transparent),transparent 68%);animation:asDeriva 18s ease-in-out infinite}
.as-aurora.b{width:560px;height:560px;right:-160px;top:18%;background:radial-gradient(circle,color-mix(in srgb,var(--cy) 55%,transparent),transparent 68%);animation:asDeriva 23s ease-in-out -6s infinite reverse}
.as-aurora.c{width:480px;height:480px;left:30%;bottom:-220px;background:radial-gradient(circle,color-mix(in srgb,var(--acc2) 55%,transparent),transparent 68%);animation:asDeriva 27s ease-in-out -11s infinite}
.as-part{position:absolute;bottom:-12px;border-radius:50%;background:var(--cy);opacity:0;animation:asPart linear infinite}
@keyframes asDeriva{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(70px,50px) scale(1.12)}66%{transform:translate(-40px,90px) scale(.94)}}
@keyframes asPart{0%{transform:translateY(0) scale(.6);opacity:0}15%{opacity:.7}100%{transform:translateY(-105vh) scale(1.1);opacity:0}}

.as-topo{display:flex;align-items:center;gap:12px;padding:12px 22px;border-bottom:1px solid var(--line);background:color-mix(in srgb,var(--bg) 55%,transparent);backdrop-filter:blur(14px)}
.as-topo h1{font-size:16px;margin:0;font-weight:750;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.as-topo small{display:flex;align-items:center;gap:7px;color:var(--mut);font-size:12px;margin-top:1px}
.as-topo small i{width:7px;height:7px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 0 var(--ok);animation:asVivo 2s infinite}
@keyframes asVivo{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--ok) 60%,transparent)}70%,100%{box-shadow:0 0 0 8px transparent}}
.as-topo>div{min-width:0;flex:1}
.as-menu{display:none;width:38px;height:38px;border-radius:11px;border:1px solid var(--line);background:var(--card);color:var(--ink);place-items:center;cursor:pointer;flex:none}
.as-msgs{flex:1;min-height:0;overflow-y:auto;scroll-behavior:smooth}
.as-col{max-width:820px;margin:0 auto;padding:28px 22px 12px;display:flex;flex-direction:column;gap:26px}

/* mensagens */
.as-m{display:flex;gap:14px;min-width:0}
.as-m.eu{justify-content:flex-end;animation:asDireita .35s cubic-bezier(.2,.8,.2,1) both}
.as-m.ag{animation:asEsquerda .35s cubic-bezier(.2,.8,.2,1) both}
.as-m.eu .as-b{max-width:78%;padding:11px 16px;border-radius:20px 20px 6px 20px;background:linear-gradient(135deg,var(--acc),var(--acc2));color:#fff;font-size:15px;line-height:1.55;overflow-wrap:anywhere;white-space:pre-wrap;box-shadow:0 8px 26px -10px var(--acc)}
.as-av{position:relative;width:34px;height:34px;border-radius:11px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,var(--acc),var(--acc2));box-shadow:var(--glow);flex:none;margin-top:2px}
.as-av svg{animation:iaFaisca 3.2s ease-in-out infinite}
.as-av.pensa::before{content:"";position:absolute;inset:-4px;border-radius:14px;background:conic-gradient(from 0deg,transparent 0 30%,var(--cy) 65%,var(--acc) 90%,transparent);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 2px));mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 2px));animation:agGira 1.2s linear infinite}
.as-m.ag .as-b{flex:1;min-width:0;font-size:15px;line-height:1.65;padding-top:4px}
.as-b .ag-gap{height:10px}.as-b .ag-p strong{color:var(--ink)}
.as-w{display:inline-block;white-space:pre-wrap;animation:asPalavra .38s cubic-bezier(.2,.8,.2,1) both}
.as-depois{animation:asEntra .45s cubic-bezier(.2,.8,.2,1) both}
.as-itens{display:flex;flex-direction:column;gap:6px;margin-top:14px;max-width:560px}
.as-lead{display:flex;align-items:center;gap:10px;padding:10px 13px;border-radius:13px;border:1px solid var(--line);background:var(--card);color:var(--ink);text-decoration:none;font-size:14px;transition:border-color .2s,transform .2s,background .2s}
.as-lead:hover{border-color:var(--cy);background:var(--card2);transform:translateX(4px)}
.as-lead span{flex:1;min-width:0;display:flex;flex-direction:column}.as-lead b{font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.as-lead small{color:var(--mut);font-size:12.5px}
.as-lead em{font-style:normal;font-size:11px;font-weight:700;padding:2px 8px;border-radius:8px;background:color-mix(in srgb,var(--warn) 18%,transparent);color:var(--warn);flex:none}
.as-acoes{display:flex;gap:4px;margin-top:10px}
.as-ic{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 10px;border:0;border-radius:9px;background:transparent;color:var(--mut);font-size:12.5px;font-weight:650;cursor:pointer}
.as-ic:hover{background:var(--card2);color:var(--ink)}
.as-sug{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.as-chip{border:1px solid var(--line2);background:transparent;color:var(--ink2);border-radius:999px;padding:8px 14px;font-size:13.5px;font-weight:600;cursor:pointer;transition:border-color .2s,color .2s,transform .2s,box-shadow .2s}
.as-chip:hover{border-color:var(--cy);color:var(--cy);transform:translateY(-2px);box-shadow:0 8px 20px -10px var(--cy)}
.as-pensando{display:flex;align-items:center;gap:12px;padding:8px 0}
.as-pensando span{font-size:14px;font-weight:650;background:linear-gradient(90deg,var(--mut),var(--ink),var(--cy),var(--mut));background-size:200% 100%;background-repeat:repeat-x;-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;animation:asBrilha 1.8s linear infinite}
.as-pensando i{width:7px;height:7px;border-radius:50%;background:var(--cy);animation:agPonto 1s infinite}.as-pensando i:nth-of-type(2){animation-delay:.15s}.as-pensando i:nth-of-type(3){animation-delay:.3s}
@keyframes asBrilha{to{background-position:200% 0}}

/* abertura */
.as-ini{display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;padding:min(8vh,64px) 0 6px}
.as-logo{position:relative;width:72px;height:72px;border-radius:24px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,var(--acc),var(--acc2));box-shadow:0 0 40px -4px var(--acc);animation:asFlutua 4.5s ease-in-out infinite}
.as-logo svg{animation:iaFaisca 2.8s ease-in-out infinite;filter:drop-shadow(0 0 8px rgba(255,255,255,.7))}
.as-logo::before{content:"";position:absolute;inset:-7px;border-radius:29px;background:conic-gradient(from 0deg,transparent 0 30%,var(--cy) 60%,var(--acc) 85%,transparent 100%);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 2px));mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 2px));animation:agGira 3.4s linear infinite}
.as-logo::after{content:"";position:absolute;inset:0;border-radius:24px;border:2px solid var(--cy);opacity:0;animation:agOnda 2.8s ease-out infinite}
.as-orbita{position:absolute;inset:-26px;animation:agGira 9s linear infinite;pointer-events:none}
.as-orbita i{position:absolute;width:7px;height:7px;border-radius:50%;background:var(--cy);box-shadow:0 0 10px var(--cy)}
.as-orbita i:nth-child(1){top:0;left:50%}.as-orbita i:nth-child(2){bottom:6px;left:12px;width:5px;height:5px;background:var(--acc);box-shadow:0 0 10px var(--acc)}.as-orbita i:nth-child(3){right:2px;top:62%;width:4px;height:4px;background:#fff}
@keyframes asFlutua{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
.as-ini h2{font-size:clamp(28px,4.4vw,38px);margin:16px 0 0;letter-spacing:-.025em;background:linear-gradient(90deg,var(--ink),var(--cy),var(--acc),var(--ink));background-size:200% 100%;background-repeat:repeat-x;-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;animation:asBrilha 7s linear infinite,asEntra .7s .1s both}
.as-ini p{margin:0;color:var(--ink2);font-size:16px;min-height:26px;animation:asEntra .7s .25s both}
.as-ini p::after{content:"";display:inline-block;width:2px;height:1.05em;margin-left:3px;vertical-align:-2px;background:var(--cy);animation:asCursor 1s steps(1) infinite}
@keyframes asCursor{50%{opacity:0}}
.as-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;width:100%;margin-top:22px;text-align:left}
.as-card{--mx:50%;--my:50%;position:relative;overflow:hidden;display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border-radius:16px;border:1px solid var(--line);background:color-mix(in srgb,var(--card) 88%,transparent);backdrop-filter:blur(6px);color:var(--ink);cursor:pointer;font:inherit;text-align:left;transition:border-color .2s,transform .2s;animation:asEntra .55s cubic-bezier(.2,.8,.2,1) both}
.as-card::before{content:"";position:absolute;inset:0;background:radial-gradient(240px circle at var(--mx) var(--my),color-mix(in srgb,var(--cy) 22%,transparent),transparent 70%);opacity:0;transition:opacity .25s;pointer-events:none}
.as-card:hover{border-color:var(--cy);transform:translateY(-3px)}.as-card:hover::before{opacity:1}
.as-card>*{position:relative}
.as-card .as-ci{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;flex:none;color:var(--cy);background:color-mix(in srgb,var(--cy) 13%,transparent);transition:transform .3s}
.as-card:hover .as-ci{transform:rotate(-8deg) scale(1.1)}
.as-card b{display:block;font-size:14px}.as-card small{display:block;color:var(--mut);font-size:12.5px;line-height:1.4;margin-top:2px}
.as-card.al{border-color:color-mix(in srgb,var(--warn) 45%,var(--line))}.as-card.al .as-ci{color:var(--warn);background:color-mix(in srgb,var(--warn) 15%,transparent)}
.as-card.al.r{border-color:color-mix(in srgb,var(--bad) 55%,var(--line))}.as-card.al.r .as-ci{color:var(--bad);background:color-mix(in srgb,var(--bad) 15%,transparent);animation:asPulsa 1.8s ease-in-out infinite}
@keyframes asPulsa{50%{box-shadow:0 0 0 7px transparent;transform:scale(1.08)}0%,100%{box-shadow:0 0 0 0 color-mix(in srgb,var(--bad) 45%,transparent)}}

/* campo de mensagem */
.as-comp{padding:8px 22px 18px}
.as-caixa{position:relative;max-width:820px;margin:0 auto;display:flex;align-items:flex-end;gap:10px;padding:10px 10px 10px 18px;border-radius:24px;border:1px solid var(--line2);background:color-mix(in srgb,var(--card) 92%,transparent);backdrop-filter:blur(10px);box-shadow:0 6px 30px rgba(0,0,0,.18);transition:border-color .2s,box-shadow .2s}
.as-caixa:focus-within{border-color:var(--cy);animation:asFoco 2.6s ease-in-out infinite}
@keyframes asFoco{0%,100%{box-shadow:0 6px 30px rgba(0,0,0,.18),0 0 0 0 color-mix(in srgb,var(--cy) 0%,transparent)}50%{box-shadow:0 6px 34px rgba(0,0,0,.2),0 0 26px -2px color-mix(in srgb,var(--cy) 45%,transparent)}}
.as-caixa textarea{flex:1;min-width:0;border:0;outline:0;resize:none;background:transparent;color:var(--ink);font:inherit;font-size:15.5px;line-height:1.5;max-height:200px;padding:7px 0}
.as-env{width:40px;height:40px;border:0;border-radius:14px;background:linear-gradient(135deg,var(--acc),var(--acc2));color:#fff;display:grid;place-items:center;cursor:pointer;flex:none;transition:transform .2s,opacity .2s,box-shadow .2s;opacity:.55}
.as-env svg{transition:transform .25s}
.as-env.pronto{opacity:1;box-shadow:0 8px 22px -6px var(--acc);animation:asPop .35s}
.as-env.pronto:hover{transform:scale(1.08)}.as-env.pronto:hover svg{transform:translateX(3px)}
.as-env:disabled{opacity:.35;cursor:default;box-shadow:none}
@keyframes asPop{0%{transform:scale(.8)}60%{transform:scale(1.14)}100%{transform:scale(1)}}
.as-nota{max-width:820px;margin:8px auto 0;text-align:center;color:var(--mut);font-size:12px}

@keyframes asEntra{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}
@keyframes asDireita{from{opacity:0;transform:translateX(26px) scale(.96)}to{opacity:1;transform:none}}
@keyframes asEsquerda{from{opacity:0;transform:translateX(-18px)}to{opacity:1;transform:none}}
@keyframes asPalavra{from{opacity:0;transform:translateY(6px);filter:blur(4px)}to{opacity:1;transform:none;filter:none}}
@media (max-width:900px){
  .as-wrap{grid-template-columns:1fr;position:relative}
  .as-lado{position:absolute;z-index:20;inset:0 auto 0 0;width:min(300px,86vw);background:var(--solid);transform:translateX(-102%);transition:transform .2s;box-shadow:var(--shadow)}
  .as-wrap.abre .as-lado{transform:none}
  .as-menu{display:grid}.as-cards{grid-template-columns:1fr}.as-topo{padding:10px 14px}.as-comp{padding:8px 12px 14px}.as-col{padding:20px 14px 8px}
  main#main{height:calc(100vh - 62px - 60px)}
}
@media (prefers-reduced-motion:reduce){.as-wrap *,.as-wrap *::before,.as-wrap *::after{animation:none!important;transition:none!important}.as-w{opacity:1!important}.as-part{display:none}}
@media print{.as-lado,.as-comp,.as-fundo{display:none}}
`;

export const assistenteJs = String.raw`(function () {
  var raiz = document.getElementById('main');
  var CHAVE = 'clinex-assistente-v1';
  var SUG = [
    ['O que eu faço agora?', 'A fila do dia, na ordem de prioridade', 'bolt'], ['Quais tarefas estão atrasadas?', 'O que já passou do prazo', 'clock'],
    ['Como está a conversão?', 'Números do funil e do período', 'chart'], ['Quais os leads de maior valor em aberto?', 'Onde está o dinheiro agora', 'users'],
    ['Quais as regras de ouro?', 'O que o sistema cobra de cada contato', 'shield'], ['Qual o limite de tentativas por dia?', 'Janela de horário e tentativas', 'calendar']
  ];
  var FRASES = ['Como posso ajudar hoje?', 'Pergunte sobre leads, tarefas e conversão.', 'Peça o resumo do seu dia.', 'Descubra onde está o dinheiro parado.', 'Tire dúvidas sobre as regras de ouro.'];
  var DICAS = ['Pergunte qualquer coisa sobre o CRM…', 'Ex.: quais leads estão atrasados?', 'Ex.: como está a conversão?', 'Ex.: o que eu faço agora?'];
  var calmo = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var E = { conversas: [], atual: null, enviando: false, nome: '', master: true, alertas: [], ia: false, revelar: null };
  try { E.conversas = JSON.parse(lerLS(CHAVE) || '[]') || []; } catch (e) { E.conversas = []; }
  var el = {}, timers = {};

  function salvar() { gravarLS(CHAVE, JSON.stringify(E.conversas.slice(0, 40))); }
  function chamar(metodo, url, corpo) {
    return fetch(url, { method: metodo, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.mensagem || ('O servidor respondeu ' + r.status)); return j; }); });
  }
  function conversa() { return E.conversas.filter(function (c) { return c.id === E.atual; })[0] || null; }
  function saudacao() { var hh = new Date(Date.now() - 3 * 3600000).getUTCHours(); return hh < 12 ? 'Bom dia' : hh < 18 ? 'Boa tarde' : 'Boa noite'; }

  /* ---- texto das respostas: **negrito**, quebras de linha e (nas novas) aparição palavra por palavra */
  function palavras(no, trecho, forte, est) {
    trecho.split(/(\s+)/).forEach(function (t) {
      if (!t) return;
      if (!est || /^\s+$/.test(t)) { no.appendChild(document.createTextNode(t)); return; }
      var s = h('span', { class: 'as-w', style: 'animation-delay:' + (est.i * est.passo).toFixed(3) + 's', text: t }); est.i++;
      no.appendChild(forte ? h('strong', null, s) : s);
    });
  }
  function textoEl(texto, est) {
    var box = h('div');
    String(texto || '').split('\n').forEach(function (linha) {
      if (!linha.trim()) { box.appendChild(h('div', { class: 'ag-gap' })); return; }
      var p = h('div', { class: 'ag-p' });
      linha.split(/\*\*/).forEach(function (parte, i) { if (parte) palavras(p, parte, i % 2 === 1, est); });
      box.appendChild(p);
    });
    return box;
  }

  function msgEl(m, ultima) {
    if (m.papel === 'user') return h('div', { class: 'as-m eu' }, h('div', { class: 'as-b', text: m.texto }));
    var novo = E.revelar === m && !calmo;
    var est = null, atraso = 0;
    if (novo) {
      var n = String(m.texto).split(/\s+/).length; est = { i: 0, passo: Math.min(0.03, 2.2 / Math.max(n, 1)) };
    }
    var corpo = h('div', { class: 'as-b' }, [textoEl(m.texto, est)]);
    if (est) atraso = est.i * est.passo + 0.15;
    var depois = function (no, extra) { if (est) { no.classList.add('as-depois'); no.style.animationDelay = (atraso + (extra || 0)).toFixed(2) + 's'; } return no; };
    if (m.itens && m.itens.length) corpo.appendChild(depois(h('div', { class: 'as-itens' }, m.itens.map(function (i) {
      return h('a', { class: 'as-lead', href: '/painel/crm#leads/lead-' + encodeURIComponent(i.leadId) }, [h('span', null, [h('b', { text: i.titulo || 'Lead' }), h('small', { text: i.sub || '' })]), i.tag ? h('em', { text: i.tag }) : null, ico('arrow', 14)]);
    }))));
    var copiar = h('button', { type: 'button', class: 'as-ic', title: 'Copiar a resposta', onclick: function () {
      var done = function () { aviso('Resposta copiada.', 'ok'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(String(m.texto).replace(/\*\*/g, '')).then(done, function () {}); else done();
    } }, [ico('copy', 14), 'Copiar']);
    corpo.appendChild(depois(h('div', { class: 'as-acoes' }, copiar), 0.1));
    if (ultima && m.sugestoes && m.sugestoes.length) corpo.appendChild(depois(h('div', { class: 'as-sug' }, m.sugestoes.map(function (s) { return h('button', { type: 'button', class: 'as-chip', text: s, onclick: function () { perguntar(s); } }); })), 0.2));
    if (est) acompanhar(atraso + 0.6);
    return h('div', { class: 'as-m ag' }, [h('span', { class: 'as-av' }, ico('spark', 18)), corpo]);
  }
  /* mantém a conversa rolando enquanto a resposta aparece */
  function acompanhar(seg) {
    clearInterval(timers.rolar); var fim = Date.now() + seg * 1000;
    timers.rolar = setInterval(function () { el.msgs.scrollTop = el.msgs.scrollHeight; if (Date.now() > fim) { clearInterval(timers.rolar); E.revelar = null; } }, 90);
  }

  /* ---- abertura */
  function digitar(alvo) {
    clearTimeout(timers.digita); var f = 0, k = 0, apagando = false;
    if (calmo) { alvo.textContent = FRASES[0]; return; }
    (function passo() {
      if (!alvo.isConnected) return;
      var frase = FRASES[f];
      if (!apagando) { k++; alvo.textContent = frase.slice(0, k); if (k >= frase.length) { apagando = true; timers.digita = setTimeout(passo, 2200); return; } timers.digita = setTimeout(passo, 38); }
      else { k--; alvo.textContent = frase.slice(0, k); if (k <= 0) { apagando = false; f = (f + 1) % FRASES.length; timers.digita = setTimeout(passo, 380); return; } timers.digita = setTimeout(passo, 16); }
    })();
  }
  function cartao(ic, titulo, sub, cls, i, fn) {
    var c = h('button', { type: 'button', class: 'as-card' + (cls ? ' ' + cls : ''), style: 'animation-delay:' + (0.35 + i * 0.07).toFixed(2) + 's', onclick: fn }, [h('span', { class: 'as-ci' }, ico(ic, 18)), h('span', null, [h('b', { text: titulo }), h('small', { text: sub })])]);
    c.addEventListener('pointermove', function (e) { var r = c.getBoundingClientRect(); c.style.setProperty('--mx', (e.clientX - r.left) + 'px'); c.style.setProperty('--my', (e.clientY - r.top) + 'px'); });
    return c;
  }
  function inicio() {
    if (!E.pronto) return h('div', { class: 'as-ini' }); // espera o nome e os alertas, para a abertura animar uma vez só
    var nome = E.master || !E.nome ? '' : ', ' + primeiroNome(E.nome);
    var urg = E.alertas.filter(function (a) { return a.nivel !== 'info'; }).slice(0, 2), i = 0;
    var cards = urg.map(function (a) { return cartao('alert', a.titulo, 'Precisa de atenção · toque para entender', 'al' + (a.nivel === 'risco' ? ' r' : ''), i++, function () { perguntar('Me explique: ' + a.titulo); }); })
      .concat(SUG.slice(0, 6 - urg.length).map(function (s) { return cartao(s[2], s[0], s[1], '', i++, function () { perguntar(s[0]); }); }));
    var frase = h('p');
    var logo = h('span', { class: 'as-logo' }, [h('span', { class: 'as-orbita' }, [h('i'), h('i'), h('i')]), ico('spark', 32)]);
    var box = h('div', { class: 'as-ini' }, [logo, h('h2', { text: saudacao() + nome + '!' }), frase, h('div', { class: 'as-cards' }, cards)]);
    setTimeout(function () { digitar(frase); }, 500);
    return box;
  }

  function pensando() {
    var passos = ['Consultando seus leads…', 'Cruzando com as regras do guia…', 'Montando a resposta…'], k = 0;
    var txt = h('span', { text: passos[0] });
    clearInterval(timers.passos); timers.passos = setInterval(function () { k = (k + 1) % passos.length; txt.textContent = passos[k]; }, 1500);
    return h('div', { class: 'as-m ag' }, [h('span', { class: 'as-av pensa' }, ico('spark', 18)), h('div', { class: 'as-pensando', 'aria-label': 'Pensando' }, [txt, h('i'), h('i'), h('i')])]);
  }

  function desenhar(rolar) {
    var c = conversa();
    clearTimeout(timers.digita); clearInterval(timers.passos);
    limpar(el.col);
    if (!c || !c.msgs.length) el.col.appendChild(inicio());
    else c.msgs.forEach(function (m, i) { el.col.appendChild(msgEl(m, i === c.msgs.length - 1 && !E.enviando)); });
    if (E.enviando) el.col.appendChild(pensando());
    el.titulo.textContent = c ? c.titulo : 'Nova conversa';
    limpar(el.status); el.status.appendChild(h('i')); el.status.appendChild(document.createTextNode(E.ia ? 'Online · IA Claude' : 'Online · modo regras'));
    desenharHist();
    if (rolar !== false) setTimeout(function () { el.msgs.scrollTop = el.msgs.scrollHeight; }, 30);
  }
  function desenharHist() {
    limpar(el.hist);
    if (!E.conversas.length) { el.hist.appendChild(h('p', { class: 'as-vazio-h', text: 'Suas conversas aparecem aqui. Elas ficam guardadas só neste navegador.' })); return; }
    E.conversas.forEach(function (c) {
      el.hist.appendChild(h('div', { class: 'as-it' + (c.id === E.atual ? ' on' : '') }, [
        h('button', { type: 'button', title: c.titulo, text: c.titulo, onclick: function () { E.atual = c.id; el.wrap.classList.remove('abre'); desenhar(); } }),
        h('button', { type: 'button', class: 'as-x', 'aria-label': 'Excluir a conversa', title: 'Excluir', onclick: function () {
          E.conversas = E.conversas.filter(function (x) { return x.id !== c.id; }); if (E.atual === c.id) E.atual = null; salvar(); desenhar();
        } }, ico('x', 14))
      ]));
    });
  }

  function nova() { E.atual = null; el.wrap.classList.remove('abre'); desenhar(); setTimeout(function () { el.campo.focus(); }, 30); }

  function perguntar(texto) {
    texto = String(texto || '').trim();
    if (!texto || E.enviando) return;
    var c = conversa();
    if (!c) { c = { id: 'c' + Date.now().toString(36), titulo: texto.length > 42 ? texto.slice(0, 42) + '…' : texto, msgs: [] }; E.conversas.unshift(c); E.atual = c.id; }
    var historico = c.msgs.slice(-8).map(function (m) { return { papel: m.papel, texto: m.texto }; });
    c.msgs.push({ papel: 'user', texto: texto });
    el.campo.value = ''; ajustar(); E.enviando = true; el.env.disabled = true; salvar(); desenhar();
    var comeco = Date.now();
    chamar('POST', '/painel/crm/api/agente', { pergunta: texto, eu: E.master ? '' : E.nome, historico: historico }).then(function (r) {
      return { papel: 'agent', texto: r.texto, itens: r.itens, sugestoes: r.sugestoes };
    }).catch(function (e) {
      return { papel: 'agent', texto: 'Não consegui responder agora: ' + e.message, sugestoes: ['Tentar de novo'] };
    }).then(function (resp) {
      // um respiro mínimo para a animação de "pensando" ser vista, mesmo quando a resposta é instantânea
      setTimeout(function () {
        c.msgs.push(resp); E.revelar = resp; E.enviando = false; el.env.disabled = false; salvar(); desenhar(); el.campo.focus();
      }, calmo ? 0 : Math.max(0, 900 - (Date.now() - comeco)));
    });
  }
  function ajustar() { el.campo.style.height = 'auto'; el.campo.style.height = Math.min(el.campo.scrollHeight, 200) + 'px'; el.env.classList.toggle('pronto', !!el.campo.value.trim() && !E.enviando); }

  /* ---- montagem */
  el.hist = h('div', { class: 'as-hist' });
  el.titulo = h('h1', { text: 'Nova conversa' }); el.status = h('small', { text: 'Conectando…' });
  el.col = h('div', { class: 'as-col', role: 'log', 'aria-live': 'polite' });
  el.msgs = h('div', { class: 'as-msgs' }, el.col);
  el.campo = h('textarea', { rows: '1', maxlength: '500', placeholder: DICAS[0], 'aria-label': 'Mensagem para a IA', onkeydown: function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); perguntar(el.campo.value); } } });
  el.campo.addEventListener('input', ajustar);
  el.env = h('button', { type: 'button', class: 'as-env', 'aria-label': 'Enviar', title: 'Enviar', onclick: function () { perguntar(el.campo.value); } }, ico('arrow', 18));
  el.fundo = h('div', { class: 'as-fundo', 'aria-hidden': 'true' }, [h('i', { class: 'as-aurora a' }), h('i', { class: 'as-aurora b' }), h('i', { class: 'as-aurora c' })]);
  if (!calmo) for (var pi = 0; pi < 22; pi++) {
    var tam = 2 + Math.random() * 3;
    el.fundo.appendChild(h('i', { class: 'as-part', style: 'left:' + (Math.random() * 100).toFixed(1) + '%;width:' + tam.toFixed(1) + 'px;height:' + tam.toFixed(1) + 'px;animation-duration:' + (11 + Math.random() * 16).toFixed(1) + 's;animation-delay:-' + (Math.random() * 20).toFixed(1) + 's' }));
  }
  el.wrap = h('div', { class: 'as-wrap' }, [
    h('aside', { class: 'as-lado', 'aria-label': 'Conversas' }, [
      h('button', { type: 'button', class: 'as-nova', onclick: nova }, [ico('plus', 17), 'Nova conversa']),
      h('div', { class: 'as-cap', text: 'Conversas' }), el.hist
    ]),
    h('section', { class: 'as-chat' }, [
      el.fundo,
      h('header', { class: 'as-topo' }, [
        h('button', { type: 'button', class: 'as-menu', 'aria-label': 'Conversas', onclick: function () { el.wrap.classList.toggle('abre'); } }, ico('list', 18)),
        h('div', null, [el.titulo, el.status])
      ]),
      el.msgs,
      h('div', { class: 'as-comp' }, [
        h('div', { class: 'as-caixa' }, [el.campo, el.env]),
        h('p', { class: 'as-nota', text: 'Enter envia · Shift+Enter quebra a linha. As respostas usam os dados reais do CRM.' })
      ])
    ])
  ]);
  limpar(raiz); raiz.appendChild(el.wrap);
  desenhar(false); ajustar();
  el.campo.focus();
  // a dica do campo troca de tempos em tempos enquanto ele está vazio
  var di = 0; setInterval(function () { if (!el.campo.value && document.activeElement !== el.campo) { di = (di + 1) % DICAS.length; el.campo.placeholder = DICAS[di]; } }, 4000);

  var faltam = 2, liberado = false;
  function liberar() {
    if (liberado) return; liberado = true; E.pronto = true;
    var c = conversa();
    if (!c || !c.msgs.length) desenhar(false); else { limpar(el.status); el.status.appendChild(h('i')); el.status.appendChild(document.createTextNode(E.ia ? 'Online · IA Claude' : 'Online · modo regras')); }
  }
  function um() { faltam--; if (faltam <= 0) liberar(); }
  setTimeout(liberar, 1500); // não prende a tela se algo demorar
  function souEu(eu) { E.master = !!eu.master; E.nome = eu.nome || ''; um(); }
  if (window.EU) souEu(window.EU); else document.addEventListener('clinex-eu', function (ev) { souEu(ev.detail); }, { once: true });
  chamar('GET', '/painel/crm/api/agente/alertas').then(function (r) { E.ia = !!r.ia; E.alertas = r.alertas || []; um(); }).catch(function () { el.status.textContent = 'Sem conexão com o CRM'; um(); });
})();
`;
