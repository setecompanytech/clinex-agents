/**
 * Telas do painel geral: login, visão geral (dashboard) e gestão de usuários. Rodam sobre o design system
 * (/painel/ds.css e /painel/ds.js). Os textos de JS ficam em String.raw: sem crases e sem "dollar-chave" aqui dentro.
 */

// ------------------------------------------------------------------------------------------------ login

export const loginCss = `
body{display:block;overflow-x:hidden}
@property --lg-ang{syntax:"<angle>";inherits:false;initial-value:0deg}
#lg-fundo{position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none}
.lg-aurora{position:fixed;inset:-25%;z-index:0;pointer-events:none;filter:blur(40px);opacity:.9}
.lg-aurora i{position:absolute;border-radius:50%;mix-blend-mode:screen;will-change:transform}
.lg-aurora i:nth-child(1){width:46vmax;height:46vmax;left:-8%;top:-12%;background:radial-gradient(circle,color-mix(in srgb,var(--acc) 42%,transparent),transparent 68%);animation:lgFlutua1 22s ease-in-out infinite alternate}
.lg-aurora i:nth-child(2){width:40vmax;height:40vmax;right:-6%;bottom:-14%;background:radial-gradient(circle,color-mix(in srgb,var(--cy) 36%,transparent),transparent 68%);animation:lgFlutua2 26s ease-in-out infinite alternate}
.lg-aurora i:nth-child(3){width:30vmax;height:30vmax;left:38%;top:30%;background:radial-gradient(circle,color-mix(in srgb,var(--acc2) 26%,transparent),transparent 70%);animation:lgFlutua3 30s ease-in-out infinite alternate}
@keyframes lgFlutua1{to{transform:translate(18vmax,10vmax) scale(1.15)}}
@keyframes lgFlutua2{to{transform:translate(-14vmax,-12vmax) scale(1.2)}}
@keyframes lgFlutua3{to{transform:translate(-12vmax,8vmax) scale(.85)}}
.lg-grade{position:fixed;inset:0;z-index:0;pointer-events:none;opacity:.5;background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);background-size:56px 56px;-webkit-mask-image:radial-gradient(ellipse 70% 60% at 50% 45%,#000 20%,transparent 75%);mask-image:radial-gradient(ellipse 70% 60% at 50% 45%,#000 20%,transparent 75%);animation:lgGrade 40s linear infinite}
@keyframes lgGrade{to{background-position:56px 56px,56px 56px}}
.lg-tema{position:fixed;top:18px;right:18px;z-index:5}
.lg-pg{position:relative;z-index:2;min-height:100vh;display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr);gap:clamp(24px,5vw,80px);align-items:center;max-width:1240px;margin:0 auto;padding:40px clamp(20px,4vw,56px)}
/* ---- painel de marca */
.lg-hero{display:flex;flex-direction:column;gap:26px;min-width:0}
.lg-logo{display:inline-flex;align-items:center;gap:14px;animation:lgSobe .7s both}
.lg-logo b{font:800 40px/1 "Segoe UI Variable Display","Segoe UI",system-ui;letter-spacing:-.045em;background:linear-gradient(100deg,var(--ink),color-mix(in srgb,var(--acc) 70%,var(--ink)));-webkit-background-clip:text;background-clip:text;color:transparent}
.lg-logo span{font:700 10.5px ui-monospace,Consolas,monospace;letter-spacing:.18em;padding:5px 10px;border-radius:999px;border:1px solid var(--line2);color:var(--cy);background:color-mix(in srgb,var(--cy) 8%,transparent)}
.lg-hero h1{font:800 clamp(34px,4.6vw,58px)/1.04 "Segoe UI Variable Display","Segoe UI",system-ui;letter-spacing:-.045em;animation:lgSobe .8s .08s both}
.lg-hero h1 em{font-style:normal;background:linear-gradient(100deg,var(--acc),var(--acc2) 45%,var(--cy));background-size:220% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:lgBrilho 7s ease-in-out infinite}
@keyframes lgBrilho{50%{background-position:100% 0}}
.lg-hero>p{color:var(--ink2);font-size:16.5px;line-height:1.6;max-width:52ch;animation:lgSobe .8s .16s both}
.lg-feat{display:flex;flex-direction:column;gap:12px;margin-top:4px}
.lg-feat>div{--fc:var(--acc);display:flex;align-items:center;gap:14px;padding:12px 16px;border-radius:16px;border:1px solid var(--line);background:color-mix(in srgb,var(--card) 70%,transparent);backdrop-filter:blur(10px);max-width:470px;animation:lgSobe .8s both;transition:transform .25s cubic-bezier(.2,.8,.2,1),border-color .25s}
.lg-feat>div:nth-child(1){animation-delay:.28s}.lg-feat>div:nth-child(2){--fc:var(--cy);animation-delay:.38s}.lg-feat>div:nth-child(3){--fc:var(--acc2);animation-delay:.48s}
.lg-feat>div:hover{transform:translateX(6px);border-color:color-mix(in srgb,var(--fc) 55%,transparent)}
.lg-feat .lg-ic{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;flex:none;color:#fff;background:linear-gradient(135deg,var(--fc),color-mix(in srgb,var(--fc) 50%,var(--acc2)));box-shadow:0 8px 24px color-mix(in srgb,var(--fc) 38%,transparent)}
.lg-feat b{display:block;font-size:14.5px}.lg-feat small{display:block;color:var(--mut);font-size:12.5px;margin-top:2px}
.lg-term{display:flex;align-items:center;gap:10px;font:600 13px ui-monospace,Consolas,monospace;color:var(--ink2);min-height:22px;animation:lgSobe .8s .6s both}
.lg-term i{width:8px;height:8px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 0 var(--ok);animation:lgPulsa 2.2s infinite;flex:none}
.lg-term .lg-cursor{display:inline-block;width:8px;height:15px;background:var(--cy);margin-left:2px;vertical-align:-2px;animation:lgPisca 1s steps(1) infinite}
@keyframes lgPulsa{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--ok) 60%,transparent)}70%,100%{box-shadow:0 0 0 12px transparent}}
@keyframes lgPisca{50%{opacity:0}}
@keyframes lgSobe{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}
/* ---- cartão de entrada */
.lg-lado{display:flex;justify-content:center;perspective:1200px}
.lg-cartao{position:relative;width:min(430px,100%);padding:38px 34px 30px;border-radius:28px;background:linear-gradient(170deg,color-mix(in srgb,var(--card2) 92%,transparent),color-mix(in srgb,var(--card) 88%,transparent));backdrop-filter:blur(22px) saturate(1.3);box-shadow:0 30px 90px rgba(0,0,0,.35),0 0 0 1px var(--line);animation:lgEntra .9s .1s cubic-bezier(.2,.8,.2,1) both;transform-style:preserve-3d;transition:transform .25s ease-out,opacity .5s,filter .5s}
.lg-cartao::before{content:"";position:absolute;inset:-1.5px;border-radius:29.5px;padding:1.5px;pointer-events:none;background:conic-gradient(from var(--lg-ang),transparent 0 55%,var(--acc) 72%,var(--acc2) 82%,var(--cy) 92%,transparent 100%);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0);animation:lgGira 7s linear infinite}
.lg-cartao::after{content:"";position:absolute;inset:0;border-radius:28px;pointer-events:none;background:radial-gradient(420px 220px at var(--mx,50%) var(--my,0%),color-mix(in srgb,var(--acc) 14%,transparent),transparent 70%);opacity:.9}
@keyframes lgGira{to{--lg-ang:360deg}}
@keyframes lgEntra{from{opacity:0;transform:translateY(30px) scale(.96) rotateX(6deg)}to{opacity:1;transform:none}}
.lg-cartao>*{position:relative;z-index:1}
.lg-cartao h2{font:800 27px/1.15 "Segoe UI Variable Display","Segoe UI",system-ui;letter-spacing:-.035em;margin-bottom:6px}
.lg-sub{color:var(--ink2);font-size:14px;line-height:1.5;margin-bottom:24px}
.lg-form{display:flex;flex-direction:column;gap:16px}
.lg-campo{display:flex;flex-direction:column;gap:7px;font-size:12.5px;font-weight:650;color:var(--ink2)}
.lg-in{position:relative;display:flex;align-items:center}
.lg-in>svg{position:absolute;left:14px;color:var(--mut);pointer-events:none;transition:color .2s,transform .2s}
.lg-in .in{height:48px;padding:0 14px 0 44px;border-radius:14px;font-size:15px;transition:border-color .2s,box-shadow .25s,background .2s}
.lg-in .in:focus{outline:0;border-color:var(--cy);box-shadow:0 0 0 4px color-mix(in srgb,var(--cy) 18%,transparent),0 0 24px color-mix(in srgb,var(--cy) 22%,transparent)}
.lg-in:focus-within>svg{color:var(--cy);transform:scale(1.12)}
.lg-sen .in{padding-right:82px}
.lg-ver{position:absolute;right:7px;top:50%;transform:translateY(-50%);border:0;background:transparent;color:var(--mut);font-weight:700;font-size:12px;padding:7px 11px;border-radius:9px;transition:color .2s,background .2s}
.lg-ver:hover{color:var(--ink);background:var(--card2)}
.lg-erro{min-height:18px;margin:-4px 0;color:var(--bad);font-size:13px;font-weight:600;line-height:1.4}
.lg-caps{display:none;align-items:center;gap:6px;color:var(--warn);font-size:12px;font-weight:650;margin-top:-6px}
.lg-caps.on{display:flex}
.lg-ok{position:relative;overflow:hidden;height:50px;font-size:15.5px;border-radius:15px;letter-spacing:.01em;transition:transform .2s,filter .2s,box-shadow .3s}
.lg-ok::after{content:"";position:absolute;top:0;left:-70%;width:45%;height:100%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.34),transparent);transform:skewX(-20deg);animation:lgVarre 4.2s 1.4s ease-in-out infinite}
@keyframes lgVarre{0%{left:-70%}30%,100%{left:130%}}
.lg-ok:hover{transform:translateY(-2px);box-shadow:0 14px 40px color-mix(in srgb,var(--acc) 45%,transparent)}
.lg-ok:active{transform:translateY(0) scale(.99)}
.lg-ok[disabled]{cursor:progress;filter:saturate(.8)}
.lg-ok .lg-gira{display:none;width:18px;height:18px;border-radius:50%;border:2.5px solid rgba(255,255,255,.35);border-top-color:#fff;animation:lgRoda .7s linear infinite}
.lg-ok.carregando .lg-gira{display:inline-block}
@keyframes lgRoda{to{transform:rotate(360deg)}}
.lg-seg{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:20px;color:var(--mut);font-size:12px}
.lg-seg svg{color:var(--ok)}
.lg-nota{margin-top:10px;color:var(--mut);font-size:12px;line-height:1.5;text-align:center}
/* ---- erro e sucesso */
.lg-erra .lg-cartao{animation:lgTreme .5s cubic-bezier(.36,.07,.19,.97) both}
@keyframes lgTreme{10%,90%{transform:translateX(-2px)}20%,80%{transform:translateX(4px)}30%,50%,70%{transform:translateX(-8px)}40%,60%{transform:translateX(8px)}}
.lg-saindo .lg-cartao{opacity:0;transform:scale(1.06) translateY(-10px);filter:blur(10px);pointer-events:none}
.lg-saindo .lg-hero{opacity:0;transform:translateX(-30px);transition:opacity .5s,transform .6s}
.lg-onda{position:fixed;left:50%;top:50%;width:20px;height:20px;margin:-10px;border-radius:50%;z-index:9;pointer-events:none;background:radial-gradient(circle,color-mix(in srgb,var(--acc) 55%,transparent),color-mix(in srgb,var(--cy) 35%,transparent) 50%,transparent 70%);animation:lgOnda .8s ease-out forwards}
@keyframes lgOnda{to{transform:scale(160);opacity:0}}
@media (max-width:960px){.lg-pg{grid-template-columns:1fr;gap:0;padding-top:28px}.lg-hero{display:none}.lg-cartao{margin:0 auto}}
@media (max-width:480px){.lg-cartao{padding:30px 22px 24px}}
@media (prefers-reduced-motion:reduce){.lg-aurora i,.lg-grade,.lg-cartao::before,.lg-ok::after,.lg-hero h1 em,.lg-term i{animation:none}.lg-cartao,.lg-logo,.lg-hero h1,.lg-hero>p,.lg-feat div,.lg-term{animation-duration:.01s}}
`;

export const loginHtml = (css: string) => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow"><link rel="icon" href="data:,">
<title>Clinex · Entrar</title>
<link rel="stylesheet" href="/painel/ds.css"><style>${css}</style></head><body>
<canvas id="lg-fundo" aria-hidden="true"></canvas>
<div class="lg-aurora" aria-hidden="true"><i></i><i></i><i></i></div>
<div class="lg-grade" aria-hidden="true"></div>
<div id="topo-dir" class="lg-tema"></div>
<div class="lg-pg">
  <section class="lg-hero" id="lg-hero" aria-label="Sobre o painel"></section>
  <div class="lg-lado"><main class="lg-cartao" id="login" aria-live="polite"></main></div>
</div>
<script src="/painel/ds.js"></script>
<script src="/painel/login.js"></script>
</body></html>`;

export const loginJs = String.raw`(function () {
  var corpo = document.body;
  var raiz = document.getElementById('login');
  var hero = document.getElementById('lg-hero');
  var destino = new URLSearchParams(location.search).get('next') || '/painel';
  var reduz = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------- fundo: rede de partículas que reage ao mouse */
  (function fundo() {
    var cv = document.getElementById('lg-fundo'), cx = cv.getContext('2d');
    var W = 0, H = 0, dpr = 1, pts = [], mouse = { x: -999, y: -999 }, cor1 = '255,59,92', cor2 = '34,211,238', quadro = 0, rodando = true;
    function rgb(v, padrao) {
      var s = getComputedStyle(document.documentElement).getPropertyValue(v).trim();
      var m = /^#([0-9a-f]{6})$/i.exec(s); if (m) return parseInt(m[1].slice(0, 2), 16) + ',' + parseInt(m[1].slice(2, 4), 16) + ',' + parseInt(m[1].slice(4, 6), 16);
      var r = /(\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(s); return r ? r[1] + ',' + r[2] + ',' + r[3] : padrao;
    }
    function cores() { cor1 = rgb('--acc', cor1); cor2 = rgb('--cy', cor2); }
    function medir() {
      dpr = Math.min(window.devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
      cv.width = W * dpr; cv.height = H * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.min(110, Math.round(W * H / 15000)); pts = [];
      for (var i = 0; i < n; i++) pts.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35, r: Math.random() * 1.6 + .8, c: Math.random() < .35 ? 2 : 1 });
    }
    function desenhar() {
      cx.clearRect(0, 0, W, H);
      var L = 150;
      for (var i = 0; i < pts.length; i++) {
        var a = pts[i];
        if (!reduz) {
          a.x += a.vx; a.y += a.vy;
          if (a.x < -10) a.x = W + 10; else if (a.x > W + 10) a.x = -10;
          if (a.y < -10) a.y = H + 10; else if (a.y > H + 10) a.y = -10;
          var dx = a.x - mouse.x, dy = a.y - mouse.y, dd = dx * dx + dy * dy;
          if (dd < 22000) { var f = (1 - dd / 22000) * .6; a.x += dx / Math.sqrt(dd + 1) * f; a.y += dy / Math.sqrt(dd + 1) * f; }
        }
        for (var j = i + 1; j < pts.length; j++) {
          var b = pts[j], ex = a.x - b.x, ey = a.y - b.y, d2 = ex * ex + ey * ey;
          if (d2 < L * L) { var al = (1 - Math.sqrt(d2) / L) * .38; cx.strokeStyle = 'rgba(' + (a.c === 2 ? cor2 : cor1) + ',' + al.toFixed(3) + ')'; cx.lineWidth = .8; cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(b.x, b.y); cx.stroke(); }
        }
        var mx = a.x - mouse.x, my = a.y - mouse.y, md = mx * mx + my * my;
        if (md < 30000) { cx.strokeStyle = 'rgba(' + cor2 + ',' + ((1 - md / 30000) * .55).toFixed(3) + ')'; cx.lineWidth = .9; cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(mouse.x, mouse.y); cx.stroke(); }
        cx.fillStyle = 'rgba(' + (a.c === 2 ? cor2 : cor1) + ',.85)'; cx.beginPath(); cx.arc(a.x, a.y, a.r, 0, 6.2832); cx.fill();
      }
    }
    function laco() {
      if (!rodando) return;
      if ((quadro++ % 90) === 0) cores();
      desenhar(); if (!reduz) requestAnimationFrame(laco);
    }
    addEventListener('resize', function () { medir(); if (reduz) desenhar(); });
    addEventListener('pointermove', function (e) { mouse.x = e.clientX; mouse.y = e.clientY; });
    addEventListener('pointerleave', function () { mouse.x = mouse.y = -999; });
    document.addEventListener('visibilitychange', function () { rodando = !document.hidden; if (rodando) laco(); });
    medir(); cores(); laco();
  })();

  /* ---------------------------------------------------------------- painel de marca */
  var FRASES = ['leads, funis e cadência de atendimento', 'a Amanda atendendo no WhatsApp', 'indicadores de CRM e agente em um painel', 'acesso por perfil e por módulo'];
  var termTxt = h('span');
  var term = h('div', { class: 'lg-term', 'aria-hidden': 'true' }, [h('i'), h('span', { text: '> ' }), termTxt, h('span', { class: 'lg-cursor' })]);
  (function digitar() {
    var k = 0, pos = 0, apagando = false;
    function passo() {
      var f = FRASES[k];
      if (reduz) { termTxt.textContent = f; return; }
      if (!apagando) { pos++; termTxt.textContent = f.slice(0, pos); if (pos >= f.length) { apagando = true; return void setTimeout(passo, 1900); } setTimeout(passo, 38); }
      else { pos -= 2; termTxt.textContent = f.slice(0, Math.max(pos, 0)); if (pos <= 0) { apagando = false; k = (k + 1) % FRASES.length; return void setTimeout(passo, 320); } setTimeout(passo, 16); }
    }
    setTimeout(passo, 900);
  })();
  function feat(icone, titulo, sub) { return h('div', null, [h('span', { class: 'lg-ic' }, ico(icone, 21)), h('div', null, [h('b', { text: titulo }), h('small', { text: sub })])]); }
  kids(hero, [
    h('div', { class: 'lg-logo' }, [h('b', { text: 'clinex' }), h('span', { text: 'PAINEL' })]),
    h('h1', null, ['Tudo da clínica,', h('br'), h('em', { text: 'em um só lugar' })]),
    h('p', { text: 'CRM, Agente receptivo e a gestão de usuários numa única plataforma, rápida, segura e feita para a rotina da recepção.' }),
    h('div', { class: 'lg-feat' }, [
      feat('funil', 'CRM', 'Leads, funis do Clinilink e fila do dia'),
      feat('robot', 'Agente receptivo', 'Amanda no WhatsApp, fluxo e indicadores'),
      feat('users', 'Equipe e permissões', 'Perfis e módulos para cada pessoa')
    ]),
    term
  ]);

  /* ---------------------------------------------------------------- cartão: brilho que segue o mouse e leve inclinação */
  var lado = raiz.parentNode;
  if (!reduz) {
    lado.addEventListener('pointermove', function (e) {
      var r = raiz.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      raiz.style.setProperty('--mx', (x * 100) + '%'); raiz.style.setProperty('--my', (y * 100) + '%');
      raiz.style.transform = 'rotateY(' + ((x - .5) * 5).toFixed(2) + 'deg) rotateX(' + ((.5 - y) * 4).toFixed(2) + 'deg)';
    });
    lado.addEventListener('pointerleave', function () { raiz.style.transform = ''; });
  }

  /* ---------------------------------------------------------------- formulário */
  function entrada(icone, el, extra) { return h('div', { class: 'lg-in' + (extra ? ' ' + extra : '') }, [ico(icone, 18), el]); }
  var login = h('input', { class: 'in', type: 'text', id: 'lg-login', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', placeholder: 'voce@clinica.com', autofocus: 'autofocus' });
  var senha = h('input', { class: 'in', type: 'password', id: 'lg-senha', autocomplete: 'current-password', placeholder: 'Sua senha' });
  var ver = h('button', { class: 'lg-ver', type: 'button', 'aria-label': 'Mostrar a senha', text: 'mostrar' });
  var caps = h('div', { class: 'lg-caps', role: 'status' }, [ico('alert', 14), 'Caps Lock está ligado']);
  var erro = h('p', { class: 'lg-erro', role: 'alert' });
  var gira = h('span', { class: 'lg-gira', 'aria-hidden': 'true' });
  var rotulo = h('span', { text: 'Entrar' });
  var ok = h('button', { class: 'btn pri lg-ok', type: 'submit' }, [gira, rotulo]);
  ver.addEventListener('click', function () { var mostra = senha.type === 'password'; senha.type = mostra ? 'text' : 'password'; ver.textContent = mostra ? 'ocultar' : 'mostrar'; });
  senha.addEventListener('keyup', function (e) { if (e.getModifierState) caps.classList.toggle('on', e.getModifierState('CapsLock')); });
  senha.addEventListener('blur', function () { caps.classList.remove('on'); });
  var senhaBox = entrada('lock', senha, 'lg-sen'); senhaBox.appendChild(ver);
  var form = h('form', { class: 'lg-form', novalidate: 'novalidate' }, [
    h('label', { class: 'lg-campo' }, [h('span', { text: 'E-mail' }), entrada('user', login)]),
    h('label', { class: 'lg-campo' }, [h('span', { text: 'Senha' }), senhaBox]),
    caps, erro, ok
  ]);
  function falhou(msg) {
    erro.textContent = msg; ok.disabled = false; ok.classList.remove('carregando'); rotulo.textContent = 'Entrar';
    corpo.classList.remove('lg-erra'); void corpo.offsetWidth; corpo.classList.add('lg-erra');
  }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    erro.textContent = '';
    if (!login.value.trim() || !senha.value) { falhou('Informe o e-mail e a senha.'); return; }
    ok.disabled = true; ok.classList.add('carregando'); rotulo.textContent = 'Entrando…';
    fetch('/painel/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: login.value, senha: senha.value, next: destino }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok) { falhou(x.j.mensagem || 'Não consegui entrar.'); senha.value = ''; senha.focus(); return; }
        rotulo.textContent = 'Pronto!'; ok.classList.remove('carregando');
        corpo.appendChild(h('div', { class: 'lg-onda' })); corpo.classList.add('lg-saindo');
        setTimeout(function () { location.href = x.j.next || '/painel'; }, reduz ? 50 : 700);
      })
      .catch(function () { falhou('Sem conexão com o servidor. Tente de novo.'); });
  });
  kids(raiz, [
    h('h2', { text: 'Bem-vindo de volta' }),
    h('p', { class: 'lg-sub', text: 'Entre com o seu e-mail e a senha para abrir o painel.' }),
    form,
    h('div', { class: 'lg-seg' }, [ico('shield', 14), 'Conexão protegida · sessão de 12 horas']),
    h('p', { class: 'lg-nota', text: 'Esqueceu a senha? Peça a um administrador para redefinir.' })
  ]);
})();
`;

// ------------------------------------------------------------------------------------------------ visão geral

export const geralCss = `
#main{display:flex;flex-direction:column;gap:22px}
#main.carregando{opacity:.55;pointer-events:none;transition:opacity .2s}
.gr-sec{display:flex;flex-direction:column;gap:14px}
.gr-sec-h{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.gr-sec-h h2{font:800 11.5px ui-monospace,Consolas,monospace;letter-spacing:.16em;text-transform:uppercase;color:var(--mut);display:flex;align-items:center;gap:10px}
.gr-sec-h h2 i{width:9px;height:9px;border-radius:3px;background:var(--mc,var(--acc));box-shadow:0 0 10px var(--mc,var(--acc))}
.gr-sec-h a{display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:13px;color:var(--ink2)}.gr-sec-h a:hover{color:var(--ink)}
.gr-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px}
.gr-alertas{display:flex;flex-direction:column;gap:2px}
.gr-al{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:start;padding:11px 4px;border-bottom:1px solid var(--line)}
.gr-al:last-child{border-bottom:0}
.gr-al i{width:9px;height:9px;border-radius:50%;margin-top:6px;background:var(--mut)}
.gr-al.risco i{background:var(--bad);box-shadow:0 0 10px var(--bad)}.gr-al.atencao i{background:var(--warn);box-shadow:0 0 10px var(--warn)}
.gr-al b{display:block;font-size:14px}.gr-al span{display:block;color:var(--ink2);font-size:13px;margin-top:2px;line-height:1.45}
.gr-al .gr-tags{display:flex;gap:6px;align-items:center}
.gr-al a.btn{padding:5px 11px;font-size:12.5px}
.gr-ok{display:flex;align-items:center;gap:12px;color:var(--ink2)}.gr-ok i{width:10px;height:10px;border-radius:50%;background:var(--ok);box-shadow:0 0 12px var(--ok)}
.gr-enc{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:14px}
.gr-enc div{padding:12px 14px;border:1px solid var(--line);border-radius:14px;background:var(--card)}
.gr-enc b{display:block;font:800 22px/1.1 "Segoe UI Variable Display","Segoe UI";font-variant-numeric:tabular-nums}.gr-enc span{display:block;margin-top:3px;color:var(--mut);font-size:12px}
.gr-nota{margin-top:12px;color:var(--mut);font-size:12.5px;line-height:1.55}
.gr-sis{display:flex;flex-wrap:wrap;gap:10px}
.gr-vazio-ag{padding:26px;text-align:center;color:var(--ink2)}.gr-vazio-ag b{display:block;color:var(--ink);margin-bottom:4px}
@media (max-width:1100px){.gr-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:760px){.gr-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.gr-enc{grid-template-columns:1fr}.g12>.cartao{grid-column:span 12!important}.gr-al{grid-template-columns:auto 1fr}.gr-al .gr-tags{grid-column:2}}
`;

export const geralJs = String.raw`(function () {
  var raiz = document.getElementById('main');
  var dias = Number(lerLS('geral-dias')) === 30 ? 30 : 7;
  var exemplo = false;
  var tit = h('h1', { text: 'Olá' });
  document.addEventListener('clinex-eu', function (e) {
    var u = e.detail;
    tit.textContent = u.master ? 'Olá!' : 'Olá, ' + (primeiroNome(u.nome) || u.nome);
  });

  function seg() {
    var b7 = h('button', { type: 'button', 'aria-pressed': String(dias === 7), text: '7 dias' });
    var b30 = h('button', { type: 'button', 'aria-pressed': String(dias === 30), text: '30 dias' });
    function troca(n) { if (n === dias) return; dias = n; gravarLS('geral-dias', String(n)); b7.setAttribute('aria-pressed', String(n === 7)); b30.setAttribute('aria-pressed', String(n === 30)); carregar(); }
    b7.addEventListener('click', function () { troca(7); }); b30.addEventListener('click', function () { troca(30); });
    return h('div', { class: 'seg', role: 'group', 'aria-label': 'Período' }, [b7, b30]);
  }
  var ult = h('span', { class: 'mut', style: 'font-size:12.5px' });
  var btnExemplo = h('button', { class: 'btn', type: 'button', 'aria-pressed': 'false', title: 'Mostra os indicadores do agente com dados simulados, para ver como o painel fica com a Amanda atendendo', text: 'Dados de exemplo do agente' });
  btnExemplo.addEventListener('click', function () { exemplo = !exemplo; btnExemplo.setAttribute('aria-pressed', String(exemplo)); btnExemplo.classList.toggle('pri', exemplo); carregar(); });
  var cab = h('header', { class: 'tela-h' }, [
    h('div', null, [tit, h('p', { id: 'gr-sub', text: 'CRM e Agente receptivo no mesmo lugar: o que mudou, o que precisa de atenção e onde agir.' })]),
    h('div', { class: 'tela-ac' }, [ult, seg(), btnExemplo, botao('Atualizar', '', function () { carregar(); }, 'refresh')])
  ]);
  var corpo = h('div', { id: 'gr-corpo', style: 'display:flex;flex-direction:column;gap:22px' }, h('div', { class: 'skel', style: 'height:300px;border-radius:20px' }));
  kids(limpar(raiz), [cab, corpo]);

  function carregar() {
    raiz.classList.add('carregando');
    fetch('/painel/api/geral?dias=' + dias + (exemplo ? '&fonte=demo' : ''), { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then(function (d) { desenhar(d); ult.textContent = 'atualizado às ' + qHora(d.geradoEm); })
      .catch(function (e) { limpar(corpo); corpo.appendChild(vazio('Não consegui carregar o painel.', String(e.message || e))); })
      .then(function () { raiz.classList.remove('carregando'); });
  }

  function secao(titulo, cor, link, textoLink, filhos) {
    return h('section', { class: 'gr-sec', style: '--mc:' + cor }, [
      h('div', { class: 'gr-sec-h' }, [h('h2', null, [h('i'), titulo, /Agente|conversam/.test(titulo) && exemplo ? pill('dados de exemplo') : null]), link ? h('a', { href: link }, [textoLink, ico('arrow', 15)]) : null]),
      filhos
    ]);
  }

  function blocoAlertas(d) {
    var ls = d.alertas;
    var corpoA = ls.length ? h('div', { class: 'gr-alertas' }, ls.map(function (a) {
      return h('div', { class: 'gr-al ' + a.nivel }, [
        h('i', { 'aria-hidden': 'true' }),
        h('div', null, [h('b', { text: a.titulo }), h('span', { text: a.texto })]),
        h('div', { class: 'gr-tags' }, [pill(a.origem), h('a', { class: 'btn', href: a.href }, 'Abrir')])
      ]);
    })) : h('div', { class: 'gr-ok' }, [h('i'), h('span', { text: 'Nada pedindo atenção agora, nem no CRM nem no Agente receptivo.' })]);
    return blocoCartao('Precisa de atenção', ls.length ? (d.totalAlertas > ls.length ? 'Os ' + ls.length + ' mais importantes de ' + d.totalAlertas + '.' : 'Do mais urgente para o menos urgente.') : 'Tudo em ordem.', corpoA, 12, ls.length ? destaqueNum(String(d.totalAlertas), plural(d.totalAlertas, 'alerta', 'alertas')) : null);
  }

  function blocoCrm(d) {
    var c = d.crm, s = c.serie, rot = s.rotulos.map(dBR);
    var kp = h('div', { class: 'gr-kpis' }, [
      kpi2({ rotulo: 'Receita convertida', valor: brl(c.receita.valor), delta: dlt(c.receita.valor, c.receita.anterior, { bom: 'sobe' }), serie: s.receita, cor: 'var(--g3)' }),
      kpi2({ rotulo: 'Em negociação', valor: brl(c.pipeline.valor), sub: c.pipeline.n + ' ' + plural(c.pipeline.n, 'card aberto', 'cards abertos') }),
      kpi2({ rotulo: 'Previsão', valor: brl(c.previsao), sub: 'pelo histórico de cada etapa' }),
      kpi2({ rotulo: 'Conversão', valor: c.conversao.taxa === null ? '–' : pct(c.conversao.taxa), delta: dlt(c.conversao.entradas, c.conversao.entradasAnt, { bom: 'sobe', vs: 'entradas' }), sub: c.conversao.convertidos + ' de ' + c.conversao.entradas + ' novos' }),
      kpi2({ rotulo: 'Fora da cadência', valor: String(c.foraDaCadencia), tom: c.foraDaCadencia ? 'bad' : '', sub: c.tarefasHoje + ' ' + plural(c.tarefasHoje, 'tarefa', 'tarefas') + ' no guia hoje' })
    ]);
    var acum = [], t = 0; s.receita.forEach(function (v) { t += v; acum.push(t); });
    var curva = blocoCartao('Receita convertida', 'Orçamentos que viraram paciente, dia a dia (soma de todos os funis).', !t ? vazio('Nenhum orçamento converteu neste período.', 'Quando um card chegar a uma coluna de convertido, a curva aparece aqui.') : areaGradiente({
      rotulos: rot, titulos: s.rotulos.map(dBRfull), valores: acum, porPonto: s.receita, fmt: brl, cor: 'var(--g3)', cor2: 'var(--g1)', altura: 200,
      nomeAcum: 'receita acumulada', nomePonto: 'convertido no dia', aria: 'Receita convertida acumulada'
    }), 7, destaqueNum(brlCompacto(t), 'no período'));
    var funis = blocoCartao('Funis em andamento', 'Valor aberto em cada funil do Clinilink.', barras(c.funis.map(function (f) {
      return { rotulo: f.nome, valor: f.valor, texto: brlCompacto(f.valor), extra: f.abertos + ' abertos', sub: f.atrasados ? f.atrasados + ' fora da cadência' : 'dentro da cadência', cor: f.atrasados ? 'var(--warn)' : 'var(--g1)' };
    }), { vazio: 'Nenhum funil ativo.' }), 5);
    return secao('CRM', 'var(--acc)', '/painel/crm', 'Abrir o CRM', [kp, h('div', { class: 'g12' }, [curva, funis])]);
  }

  function blocoAgente(d) {
    var a = d.agente;
    if (d.erroAgente) return secao('Agente receptivo', 'var(--cy)', '/painel/receptivo', 'Abrir o agente', blocoCartao('Indicadores indisponíveis', 'Não consegui ler os eventos do BI agora.', h('p', { class: 'mut', text: d.erroAgente }), 12));
    var k = a.kpis.atual, p = a.kpis.anterior, s = a.serie;
    var kp = h('div', { class: 'gr-kpis' }, [
      kpi2({ rotulo: 'Conversas', valor: nf0.format(k.conversas), delta: dlt(k.conversas, p && p.conversas, { bom: 'sobe' }), serie: s.conversas, cor: 'var(--g1)' }),
      kpi2({ rotulo: 'Agendamentos', valor: nf0.format(k.agendamentos), delta: dlt(k.agendamentos, p && p.agendamentos, { bom: 'sobe' }), serie: s.agendamentos, cor: 'var(--g2)' }),
      kpi2({ rotulo: 'Conversa em agenda', valor: pct(k.conversao), delta: dlt(k.conversao, p && p.conversao, { bom: 'sobe', pp: true }), sub: 'conversas que terminaram agendadas' }),
      kpi2({ rotulo: 'Autonomia', valor: pct(k.autonomia), delta: dlt(k.autonomia, p && p.autonomia, { bom: 'sobe', pp: true }), sub: 'resolvidas sem a equipe' }),
      kpi2({ rotulo: 'Transferências', valor: nf0.format(k.transferencias), delta: dlt(k.transferencias, p && p.transferencias, { bom: 'desce' }), serie: s.transferencias, cor: 'var(--g4)' })
    ]);
    if (a.vazio) {
      return secao('Agente receptivo', 'var(--cy)', '/painel/receptivo', 'Abrir o agente', [
        h('div', { class: 'cartao gr-vazio-ag' }, [h('b', { text: 'Ainda sem conversas registradas neste período.' }), h('span', { text: 'Quando a Amanda atender, os indicadores aparecem aqui. Modo ' + a.modo + ', ' + (a.respondendo ? 'respondendo os pacientes.' : 'em sombra (lê e decide, mas não envia).') })])
      ]);
    }
    var funil = blocoCartao('Funil de atendimento', 'De cada conversa, quantas chegaram a cada etapa.', barras(a.funil.map(function (e) {
      return { rotulo: e.etapa, valor: e.chegaram, extra: pct(e.pct), sub: 'conversas chegaram aqui' };
    }), { vazio: 'Sem conversas no período.' }), 5);
    var integ = blocoCartao('Integrações da Amanda', 'Quanto das chamadas deu certo e quanto demorou (p95).', h('div', { class: 'tbl-w' }, h('table', { class: 'tbl peq' }, [
      h('thead', null, h('tr', null, ['Serviço', 'Chamadas', 'Sucesso', 'p95'].map(function (x, i) { return h('th', { text: x, style: i ? 'text-align:right' : null }); }))),
      h('tbody', null, a.integracoes.map(function (i) {
        return h('tr', null, [h('td', { text: i.nome }), h('td', { class: 'num', style: 'text-align:right', text: nf0.format(i.chamadas) }),
          h('td', { class: 'num', style: 'text-align:right' }, h('span', { style: 'color:' + (i.okPct >= 98 ? 'var(--ok)' : i.okPct >= 90 ? 'var(--warn)' : 'var(--bad)'), text: pct(i.okPct) })),
          h('td', { class: 'num', style: 'text-align:right', text: nf0.format(i.p95) + ' ms' })]);
      }))
    ])), 7);
    return secao('Agente receptivo', 'var(--cy)', '/painel/receptivo', 'Abrir o agente', [kp, h('div', { class: 'g12' }, [funil, integ])]);
  }

  function blocoEncontro(d) {
    var e = d.encontro, c = d.crm.serie, a = d.agente.serie, rot = c.rotulos.map(dBR);
    var graf = composto({
      rotulos: rot, titulos: c.rotulos.map(dBRfull), altura: 250, aria: 'Conversas da Amanda e novos cards do CRM por dia',
      colunas: [{ nome: 'Conversas da Amanda', cor: 'var(--g1)', valores: a.conversas }],
      linhas: [{ nome: 'Agendamentos da Amanda', cor: 'var(--g2)', valores: a.agendamentos }, { nome: 'Novos cards no CRM', cor: 'var(--g5)', valores: c.novos }]
    });
    var corpoE = h('div', null, [
      graf,
      h('div', { class: 'gr-enc' }, [
        h('div', null, [h('b', { text: nf0.format(e.agendamentosAmanda) }), h('span', { text: 'agendamentos fechados pela Amanda' })]),
        h('div', null, [h('b', { text: nf0.format(e.novosCards) }), h('span', { text: 'novos orçamentos entrando nos funis' })]),
        h('div', null, [h('b', { text: nf0.format(e.convertidosCrm) }), h('span', { text: 'orçamentos convertidos pelo CRM (' + brlCompacto(e.receitaCrm) + ')' })])
      ]),
      h('p', { class: 'gr-nota', text: e.nota })
    ]);
    return secao('Onde os dois conversam', 'var(--acc2)', null, '', blocoCartao('Agente receptivo x CRM, dia a dia', 'A Amanda traz pacientes para a agenda; o CRM trabalha os orçamentos que não fecharam. Mesmo calendário, mesmo Clinilink.', corpoE, 12));
  }

  function blocoSistema(d) {
    var s = d.sistema;
    return h('div', { class: 'gr-sis' }, [
      h('span', { class: 'modo-pill ' + (s.erro ? 'off' : '') }, [h('i'), 'Dados em ' + s.armazenamento + (s.erro ? ' (com erro de gravação)' : '')]),
      d.agente ? h('span', { class: 'modo-pill ' + (d.agente.respondendo ? '' : 'sombra') }, [h('i'), 'Amanda ' + (d.agente.respondendo ? 'respondendo' : 'em modo sombra') + ' · ' + d.agente.modo]) : null
    ]);
  }

  function desenhar(d) {
    limpar(corpo);
    if (!d.acesso.crm && !d.acesso.agente) { corpo.appendChild(vazio('Nenhum módulo liberado para o seu usuário.', 'Peça a um administrador para liberar o CRM ou o Agente receptivo.')); return; }
    var blocos = [];
    blocos.push(h('div', { class: 'g12' }, blocoAlertas(d)));
    if (d.crm) blocos.push(blocoCrm(d));
    if (d.agente || d.erroAgente) blocos.push(blocoAgente(d));
    if (d.encontro && d.agente && !d.agente.vazio) blocos.push(blocoEncontro(d));
    blocos.push(blocoSistema(d));
    kids(corpo, blocos);
  }
  carregar();
})();
`;

// ------------------------------------------------------------------------------------------------ gestão de usuários

export const usuariosCss = `
#main{display:flex;flex-direction:column;gap:20px}
#us-corpo{display:flex;flex-direction:column;gap:20px}
#us-corpo>.faixa{margin-bottom:0}
.us-perfis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.us-perfis div{padding:12px 14px;border:1px solid var(--line);border-radius:14px;background:var(--card)}
.us-perfis b{display:block;font-size:13.5px}.us-perfis span{display:block;margin-top:3px;color:var(--mut);font-size:12px;line-height:1.45}
.us-quem{display:flex;align-items:center;gap:12px;min-width:0}.us-quem b{display:block}.us-quem small{display:block;color:var(--mut);overflow:hidden;text-overflow:ellipsis}
.us-acoes{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}
.us-acoes .btn{padding:5px 11px;font-size:12.5px}
.us-mods{display:flex;gap:6px;flex-wrap:wrap}
tr.us-off td{opacity:.55}
.us-form{display:flex;flex-direction:column;gap:14px}
.us-chk{display:flex;gap:18px;flex-wrap:wrap;padding:6px 0}
.us-chk label{display:inline-flex;align-items:center;gap:8px;font-weight:600;font-size:13.5px;color:var(--ink)}
.us-chk input{width:17px;height:17px;accent-color:var(--acc)}
.us-erro{min-height:18px;color:var(--bad);font-size:13px;font-weight:600}
.us-senha{display:flex;align-items:center;gap:10px;padding:14px 16px;border-radius:14px;border:1px dashed var(--line2);background:var(--solid)}
.us-senha code{flex:1;font:700 20px ui-monospace,Consolas,monospace;letter-spacing:.06em;user-select:all;overflow-wrap:anywhere}
@media (max-width:1000px){.us-perfis{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:560px){.us-perfis{grid-template-columns:1fr}}
`;

export const usuariosJs = String.raw`(function () {
  var raiz = document.getElementById('main');
  var D = { usuarios: [], perfis: {}, eu: '', tabelaAusente: false };
  var corpo = h('div', { id: 'us-corpo' });
  limpar(raiz);
  var novo = botao('Novo usuário', 'pri', function () { formulario(null); }, 'plus');
  kids(raiz, [
    h('header', { class: 'tela-h' }, [
      h('div', null, [h('h1', { text: 'Usuários' }), h('p', { text: 'Quem entra no painel, com qual perfil e quais módulos (CRM e Agente receptivo). Só administradores veem esta tela.' })]),
      h('div', { class: 'tela-ac' }, novo)
    ]),
    corpo
  ]);

  function api(metodo, url, body) {
    return fetch(url, { method: metodo, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.mensagem || 'Falhou (' + r.status + ')'); return j; }); });
  }
  function carregar() {
    return api('GET', '/painel/api/usuarios').then(function (j) { D = j; desenhar(); }).catch(function (e) { limpar(corpo); corpo.appendChild(vazio('Não consegui carregar os usuários.', e.message)); });
  }
  var quando = function (iso) { return iso ? qDiaHora(iso) : 'nunca entrou'; };
  var NOME_MOD = { crm: 'CRM', agente: 'Agente receptivo' };

  function desenhar() {
    var filhos = [];
    if (D.tabelaAusente) {
      filhos.push(h('div', { class: 'faixa' }, [ico('alert', 16), h('span', { text: 'A tabela painel_usuarios ainda não existe no Supabase. As contas estão sendo guardadas no arquivo local do servidor; rode o SQL de docs/supabase-schema-crm.sql para guardá-las também no banco.' })]));
    }
    filhos.push(h('div', { class: 'us-perfis' }, Object.keys(D.perfis).map(function (p) { return h('div', null, [h('b', { text: D.perfis[p].rotulo }), h('span', { text: D.perfis[p].descricao })]); })));
    var linhas = D.usuarios.map(function (u) {
      var eu = u.id === D.eu;
      return h('tr', { class: u.ativo ? '' : 'us-off' }, [
        h('td', null, h('div', { class: 'us-quem' }, [avatar(u.nome), h('div', null, [h('b', { text: u.nome + (eu ? ' (você)' : '') }), h('small', { text: u.email })])])),
        h('td', null, pill(D.perfis[u.perfil] ? D.perfis[u.perfil].rotulo : u.perfil)),
        h('td', null, h('div', { class: 'us-mods' }, u.modulos.map(function (m) { return pill(NOME_MOD[m] || m); }))),
        h('td', { class: 'mut', text: quando(u.ultimoAcesso) }),
        h('td', null, pill(u.ativo ? 'Ativo' : 'Desativado', u.ativo ? 'ok' : '')),
        h('td', null, h('div', { class: 'us-acoes' }, [
          botao('Editar', '', function () { formulario(u); }),
          botao('Redefinir senha', '', function () { redefinir(u); }),
          eu ? null : botao(u.ativo ? 'Desativar' : 'Ativar', '', function () { alternar(u); }),
          eu ? null : botao('Excluir', '', function () { excluir(u); })
        ]))
      ]);
    });
    filhos.push(h('section', { class: 'cartao tab-cartao' }, [
      h('div', { class: 'tbl-w' }, h('table', { class: 'tbl' }, [
        h('thead', null, h('tr', null, ['Usuário', 'Perfil', 'Módulos', 'Último acesso', 'Situação', ''].map(function (x) { return h('th', { text: x }); }))),
        h('tbody', null, linhas.length ? linhas : h('tr', null, h('td', { colspan: '6' }, vazio('Nenhum usuário ainda.', 'Crie o primeiro com o botão Novo usuário.'))))
      ]))
    ]));
    kids(limpar(corpo), filhos);
  }

  function mostrarSenha(titulo, nome, senha) {
    var cod = h('code', { text: senha });
    var m = modal({
      titulo: titulo, sub: 'Mostrada uma única vez. Envie para ' + nome + ' por um canal seguro; a pessoa pode trocar depois, no menu do usuário.', largura: 520, classe: 'peq',
      corpo: h('div', { class: 'us-senha' }, [cod, botao('Copiar', '', function () {
        if (navigator.clipboard) navigator.clipboard.writeText(senha).then(function () { aviso('Senha copiada.', 'ok'); }, function () { aviso('Não consegui copiar; selecione e copie.', 'erro'); });
      }, 'copy')]),
      rodape: [botao('Já anotei', 'pri', function () { m.fechar(); })]
    });
  }

  function formulario(u) {
    var nome = h('input', { class: 'in', type: 'text', value: u ? u.nome : '', maxlength: '80', autofocus: 'autofocus' });
    var email = h('input', { class: 'in', type: 'email', value: u ? u.email : '', autocomplete: 'off' });
    var perfil = h('select', { class: 'in' }, Object.keys(D.perfis).map(function (p) { return h('option', { value: p, text: D.perfis[p].rotulo + ' · ' + D.perfis[p].descricao }); }));
    perfil.value = u ? u.perfil : 'atendente';
    var caixas = {};
    var chk = h('div', { class: 'us-chk' }, ['crm', 'agente'].map(function (m) {
      var i = h('input', { type: 'checkbox' }); i.checked = u ? u.modulos.indexOf(m) >= 0 : m === 'crm'; caixas[m] = i;
      return h('label', null, [i, NOME_MOD[m]]);
    }));
    var dicaMod = h('small', { text: '' });
    function ajusta() { var adm = perfil.value === 'admin'; ['crm', 'agente'].forEach(function (m) { caixas[m].disabled = adm; if (adm) caixas[m].checked = true; }); dicaMod.textContent = adm ? 'Administrador acessa todos os módulos.' : ''; }
    perfil.addEventListener('change', ajusta); ajusta();
    var senha = h('input', { class: 'in', type: 'text', autocomplete: 'off', placeholder: 'Deixe em branco para gerar uma senha temporária' });
    var erro = h('p', { class: 'us-erro', role: 'alert' });
    var m;
    function salvar() {
      erro.textContent = '';
      var corpoReq = { nome: nome.value, email: email.value, perfil: perfil.value, modulos: ['crm', 'agente'].filter(function (x) { return caixas[x].checked; }) };
      if (!u && senha.value) corpoReq.senha = senha.value;
      api(u ? 'PUT' : 'POST', '/painel/api/usuarios' + (u ? '/' + u.id : ''), corpoReq).then(function (j) {
        m.fechar(); aviso(u ? 'Usuário atualizado.' : 'Usuário criado.', 'ok');
        carregar().then(function () { if (j.senhaTemporaria) mostrarSenha('Senha temporária de ' + j.usuario.nome, j.usuario.nome, j.senhaTemporaria); });
      }).catch(function (e) { erro.textContent = e.message; });
    }
    m = modal({
      titulo: u ? 'Editar usuário' : 'Novo usuário', largura: 560,
      corpo: h('div', { class: 'us-form' }, [campo('Nome', nome), campo('E-mail (é o login)', email), campo('Perfil', perfil), campo('Módulos liberados', chk, ''), dicaMod, u ? null : campo('Senha inicial', senha, 'Pelo menos 8 caracteres.'), erro]),
      rodape: [botao('Cancelar', '', function () { m.fechar(); }), botao(u ? 'Salvar' : 'Criar usuário', 'pri', salvar)]
    });
  }

  function redefinir(u) {
    var senha = h('input', { class: 'in', type: 'text', autocomplete: 'off', placeholder: 'Deixe em branco para gerar uma senha temporária' });
    var erro = h('p', { class: 'us-erro', role: 'alert' });
    var m;
    function salvar() {
      erro.textContent = '';
      api('POST', '/painel/api/usuarios/' + u.id + '/senha', senha.value ? { senha: senha.value } : {}).then(function (j) {
        m.fechar(); carregar();
        if (j.senhaTemporaria) mostrarSenha('Nova senha de ' + u.nome, u.nome, j.senhaTemporaria); else aviso('Senha de ' + u.nome + ' alterada.', 'ok');
      }).catch(function (e) { erro.textContent = e.message; });
    }
    m = modal({
      titulo: 'Redefinir a senha de ' + u.nome, largura: 480,
      corpo: h('div', { class: 'us-form' }, [campo('Nova senha', senha, 'Pelo menos 8 caracteres. Em branco, o sistema gera uma temporária. As sessões abertas dessa pessoa serão encerradas.'), erro]),
      rodape: [botao('Cancelar', '', function () { m.fechar(); }), botao('Salvar nova senha', 'pri', salvar)]
    });
  }
  function alternar(u) {
    var desativar = u.ativo;
    confirmar({
      titulo: (desativar ? 'Desativar ' : 'Ativar ') + u.nome + '?', texto: desativar ? 'A pessoa perde o acesso agora. Os dados e o histórico dela continuam no sistema.' : 'A pessoa volta a poder entrar com o e-mail e a senha dela.', sim: desativar ? 'Desativar' : 'Ativar', perigo: desativar,
      aoSim: function () { api('PUT', '/painel/api/usuarios/' + u.id, { ativo: !u.ativo }).then(function () { aviso(desativar ? 'Usuário desativado.' : 'Usuário ativado.', 'ok'); carregar(); }).catch(function (e) { aviso(e.message, 'erro'); }); }
    });
  }
  function excluir(u) {
    confirmar({
      titulo: 'Excluir ' + u.nome + '?', texto: 'O usuário é removido de vez. Para só bloquear o acesso, prefira desativar.', sim: 'Excluir', perigo: true,
      aoSim: function () { api('DELETE', '/painel/api/usuarios/' + u.id).then(function () { aviso('Usuário excluído.', 'ok'); carregar(); }).catch(function (e) { aviso(e.message, 'erro'); }); }
    });
  }
  carregar();
})();
`;
