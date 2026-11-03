// Design system do Clinex (CSS): tokens claro/escuro, estrutura (menu lateral, topo), controles, cartões, KPIs, gráficos, tabelas,
// modais e avisos. É a mesma base do CRM; as telas do Agente Receptivo usam exatamente estas partes (ver src/ui/ds.ts).
// REGRA: dentro dos textos abaixo não usar crases nem "dollar-chave" (exceto os dois tokens do :root).
const TOKENS_ESCURO = `
  color-scheme: dark;
  --bg:#05060b; --bg2:#0a0c15; --card:rgba(255,255,255,.045); --card2:rgba(255,255,255,.075); --solid:#0e1120; --solid2:#151932;
  --ink:#f1f3fb; --ink2:#b7bdd3; --mut:#7e86a3; --line:rgba(255,255,255,.09); --line2:rgba(255,255,255,.18);
  --acc:#ff2d55; --acc2:#ff6a3d; --cy:#3ee6ff; --ok:#19d38c; --warn:#ffb020; --bad:#ff4d6d;
  --edge:#8f9cf0; --glow:0 0 0 1px rgba(255,45,85,.55),0 8px 28px rgba(255,45,85,.32);
  --shadow:0 12px 44px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.06);
  --grid:rgba(255,255,255,.035); --nav:rgba(8,10,20,.72);
  --c-aberto:#5f7cff; --c-sem:#8d93b4; --c-neg:#ff2d55; --c-agend:#ff6a3d; --c-ativo:#19d38c; --c-org:#3ee6ff; --c-desc:#6c7390;
  --g1:#3ee6ff; --g2:#ff7a3d; --g3:#19d38c; --g4:#ffb020; --g5:#a58bff; --g6:#7c849f;
  --f0:#3ee6ff; --f1:#4fb6ff; --f2:#6a8cff; --f3:#8a6dff; --f4:#19d38c;
  --ag0:#3ee6ff; --ag1:#56a6ff; --ag2:#8a6dff; --ag3:#cf5bd9; --ag4:#ff4d6d;
`;
const TOKENS_CLARO = `
  color-scheme: light;
  --bg:#f2f3f8; --bg2:#e9ebf3; --card:rgba(255,255,255,.82); --card2:#fff; --solid:#ffffff; --solid2:#eef0f8;
  --ink:#141829; --ink2:#454c68; --mut:#6c7390; --line:rgba(20,24,41,.1); --line2:rgba(20,24,41,.22);
  --acc:#e4002b; --acc2:#ff5a2e; --cy:#0097b8; --ok:#0a9d67; --warn:#c97800; --bad:#d3173d;
  --edge:#4b55a8; --glow:0 0 0 1px rgba(228,0,43,.4),0 8px 24px rgba(228,0,43,.22);
  --shadow:0 10px 34px rgba(30,36,70,.1),inset 0 1px 0 rgba(255,255,255,.9);
  --grid:rgba(20,24,41,.045); --nav:rgba(255,255,255,.8);
  --c-aberto:#3d5af0; --c-sem:#6b7194; --c-neg:#e4002b; --c-agend:#e0501c; --c-ativo:#0a9d67; --c-org:#0097b8; --c-desc:#8a90ab;
  --g1:#0097b8; --g2:#e0501c; --g3:#0a9d67; --g4:#c97800; --g5:#6a4ff0; --g6:#6b7194;
  --f0:#0097b8; --f1:#2a86d6; --f2:#4057e6; --f3:#6a4ff0; --f4:#0a9d67;
  --ag0:#0097b8; --ag1:#2a86d6; --ag2:#6a4ff0; --ag3:#b13fc0; --ag4:#d3173d;
`;

export const parte_base = `
:root{${TOKENS_ESCURO}}
@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){${TOKENS_CLARO}}}
:root[data-theme="light"]{${TOKENS_CLARO}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 "Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif;min-height:100vh;overflow-x:hidden}
body::before{content:"";position:fixed;inset:0;z-index:-2;pointer-events:none;
  background:radial-gradient(900px 520px at 6% -8%,color-mix(in srgb,var(--acc) 22%,transparent),transparent 62%),radial-gradient(800px 520px at 98% 4%,color-mix(in srgb,var(--cy) 14%,transparent),transparent 60%),radial-gradient(700px 600px at 60% 110%,color-mix(in srgb,#6a5cff 14%,transparent),transparent 62%)}
body::after{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);background-size:46px 46px;-webkit-mask-image:radial-gradient(ellipse at 50% 0%,#000 8%,transparent 72%);mask-image:radial-gradient(ellipse at 50% 0%,#000 8%,transparent 72%)}
body.trava{overflow:hidden}
button,input,select,textarea{font:inherit;color:inherit}
button{cursor:pointer}
h1,h2,h3,h4,p{margin:0}
a{color:inherit;text-decoration:none}
:focus-visible{outline:2px solid var(--cy);outline-offset:2px;border-radius:8px}
.mut{color:var(--mut)}.peq{font-size:12.5px}
.ico{flex:none}
mark.campo{background:color-mix(in srgb,var(--acc) 22%,transparent);color:var(--ink);border-radius:5px;padding:0 4px;font-weight:600}
kbd{font:600 10.5px ui-monospace,Consolas,monospace;border:1px solid var(--line2);border-radius:6px;padding:1px 6px;color:var(--mut)}

/* ---- estrutura */
.app{display:grid;grid-template-columns:232px minmax(0,1fr);min-height:100vh}
.side{position:sticky;top:0;height:100vh;padding:20px 14px;display:flex;flex-direction:column;gap:22px;background:var(--nav);backdrop-filter:blur(18px);border-right:1px solid var(--line)}
.logo{display:flex;align-items:center;gap:8px;padding:2px 8px}
.logo b{font:italic 800 25px/1 "Segoe UI Variable Display","Segoe UI",system-ui;letter-spacing:-.04em;padding:0 .2em 0 .04em;margin-right:-.05em;display:inline-block;background:linear-gradient(100deg,var(--acc),var(--acc2));-webkit-background-clip:text;background-clip:text;color:transparent}
.logo span{font:700 10.5px ui-monospace,Consolas,monospace;letter-spacing:.14em;border:1px solid var(--line2);border-radius:6px;padding:2px 7px;color:var(--ink2)}
#nav{display:flex;flex-direction:column;gap:4px}
.nav-i{display:flex;align-items:center;gap:12px;width:100%;border:0;background:transparent;color:var(--ink2);padding:10px 12px;border-radius:12px;font-weight:600;font-size:14px;text-align:left;position:relative;transition:background .15s,color .15s}
.nav-i:hover{background:var(--card);color:var(--ink)}
.nav-i[aria-current="page"]{background:linear-gradient(90deg,color-mix(in srgb,var(--acc) 22%,transparent),transparent);color:var(--ink)}
.nav-i[aria-current="page"]::before{content:"";position:absolute;left:-14px;top:9px;bottom:9px;width:3px;border-radius:0 3px 3px 0;background:var(--acc);box-shadow:0 0 12px var(--acc)}
.nav-b{margin-left:auto;background:var(--acc);color:#fff;font:700 11px ui-monospace,Consolas,monospace;border-radius:999px;padding:1px 8px}
.side-f{margin-top:auto;font-size:11.5px;color:var(--mut);padding:0 8px}
.corpo{min-width:0}
.topo{position:sticky;top:0;z-index:30;display:flex;justify-content:flex-end;padding:12px 28px;background:color-mix(in srgb,var(--bg) 70%,transparent);backdrop-filter:blur(16px);border-bottom:1px solid var(--line)}
#topo-dir{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:flex-end}
.busca-b{display:flex;align-items:center;gap:10px;min-width:230px;border:1px solid var(--line);background:var(--card);border-radius:12px;padding:8px 12px;color:var(--mut)}
.busca-b:hover{border-color:var(--line2)}.busca-b span{flex:1;text-align:left}
.janela{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:999px;padding:6px 13px;font-size:12.5px;font-weight:600;background:var(--card)}
.janela i{width:8px;height:8px;border-radius:50%;background:var(--ok);box-shadow:0 0 10px var(--ok)}
.janela.off i{background:var(--bad);box-shadow:0 0 10px var(--bad)}
main{padding:26px 28px 60px;max-width:1500px;margin:0 auto}
#erro-js{display:none;margin:12px 28px 0;padding:10px 14px;border-radius:12px;background:color-mix(in srgb,var(--bad) 18%,var(--solid));border:1px solid var(--bad)}

/* ---- controles */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:1px solid var(--line2);background:var(--card);border-radius:12px;padding:8px 15px;font-weight:600;font-size:13.5px;color:var(--ink);transition:transform .12s,background .15s,border-color .15s,box-shadow .15s;white-space:nowrap}
.btn:hover{background:var(--card2);transform:translateY(-1px)}
.btn[disabled]{opacity:.45;pointer-events:none}
.btn.pri{border-color:transparent;background:linear-gradient(135deg,var(--acc),var(--acc2));color:#fff;box-shadow:var(--glow)}
.btn.pri:hover{filter:brightness(1.08)}
.btn.ok{border-color:transparent;background:linear-gradient(135deg,#0fbf7e,#19d38c);color:#04140d}
.btn.perigo{border-color:color-mix(in srgb,var(--bad) 55%,transparent);color:var(--bad)}
.btn.pri.perigo{background:linear-gradient(135deg,#d3173d,#ff4d6d);color:#fff}
.btn.ic-only{padding:8px 10px}
.ic-btn{width:36px;height:36px;display:grid;place-items:center;border:1px solid var(--line);background:var(--card);border-radius:11px;color:var(--ink2)}
.ic-btn:hover{color:var(--ink);border-color:var(--line2)}
.in{width:100%;border:1px solid var(--line2);background:color-mix(in srgb,var(--solid) 70%,transparent);border-radius:11px;padding:9px 12px;color:var(--ink)}
.in:focus{outline:0;border-color:var(--cy);box-shadow:0 0 0 3px color-mix(in srgb,var(--cy) 22%,transparent)}
select.in{padding-right:28px}
.in.area{resize:vertical;line-height:1.55}
.in.grande{font-size:17px;padding:13px 16px}
.in.eu{width:auto;min-width:150px}
.seg{display:inline-flex;gap:2px;padding:3px;border:1px solid var(--line);background:var(--card);border-radius:12px}
.seg button{border:0;background:transparent;border-radius:9px;padding:6px 14px;color:var(--ink2);font-weight:600;font-size:13px}
.seg button[aria-pressed="true"]{background:var(--solid2);color:var(--ink);box-shadow:0 0 0 1px var(--line2)}
.seg.peq button{padding:4px 11px;font-size:12.5px}
.mini{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:var(--card);border-radius:9px;padding:4px 10px;font-size:12px;font-weight:600;color:var(--ink2)}
.mini:hover{color:var(--ink);border-color:var(--line2)}
.campo-f{display:flex;flex-direction:column;gap:5px;font-size:12.5px;color:var(--ink2);font-weight:600}
.campo-f small{font-weight:400;color:var(--mut)}
.grade-f{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:12px}

/* ---- telas */
.tela{display:flex;flex-direction:column;gap:20px;animation:entra .45s both}
@keyframes entra{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.tela,.m-caixa,.toast{animation:none!important}.fluxo-dot{display:none}.e-ex{animation:none!important}}
.tela-h{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;flex-wrap:wrap}
.tela-h h1{font:800 30px/1.1 "Segoe UI Variable Display","Segoe UI",system-ui;letter-spacing:-.03em}
.tela-h p{color:var(--ink2);max-width:78ch;margin-top:6px}
.tela-ac{display:flex;gap:10px;flex-wrap:wrap}
.cartao{background:linear-gradient(180deg,var(--card2),var(--card));border:1px solid var(--line);border-radius:20px;box-shadow:var(--shadow);padding:20px 22px;backdrop-filter:blur(14px)}
.cartao.boas{text-align:center;padding:54px 24px}
.boas h2{font:800 24px "Segoe UI Variable Display","Segoe UI";margin-bottom:8px}.boas p{color:var(--ink2);max-width:60ch;margin:0 auto 22px}
.boas-b{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.h3{font:700 16px "Segoe UI Variable Display","Segoe UI";margin-bottom:12px}.h3.m{margin-top:22px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px}
.kpi{border:1px solid var(--line);border-radius:18px;padding:15px 18px;background:linear-gradient(180deg,var(--card2),var(--card));box-shadow:var(--shadow);display:flex;flex-direction:column;gap:2px;position:relative;overflow:hidden}
.kpi::after{content:"";position:absolute;right:-20px;top:-20px;width:90px;height:90px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--cy) 22%,transparent),transparent 70%)}
.kpi.alerta::after{background:radial-gradient(circle,color-mix(in srgb,var(--bad) 30%,transparent),transparent 70%)}
.kpi.ok::after{background:radial-gradient(circle,color-mix(in srgb,var(--ok) 28%,transparent),transparent 70%)}
.kpi-r{font-size:12px;color:var(--mut);font-weight:600;letter-spacing:.02em}
.kpi-v{font:800 31px/1.1 "Segoe UI Variable Display","Segoe UI";letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.kpi small{color:var(--mut);font-size:12px}
.vazio-linha{color:var(--mut);padding:14px 4px;font-size:13px}
.vazio{display:flex;flex-direction:column;align-items:center;gap:4px;padding:34px;color:var(--mut);text-align:center}.vazio b{color:var(--ink2)}

/* ---- pílulas, chips, avatar */
.pill{display:inline-flex;align-items:center;gap:6px;padding:2px 10px;border-radius:999px;font-size:11.5px;font-weight:650;background:var(--card2);border:1px solid var(--line);color:var(--ink2);white-space:nowrap}
.pl-hoje{color:var(--warn);border-color:color-mix(in srgb,var(--warn) 45%,transparent);background:color-mix(in srgb,var(--warn) 12%,transparent)}
.pl-atrasada{color:var(--bad);border-color:color-mix(in srgb,var(--bad) 50%,transparent);background:color-mix(in srgb,var(--bad) 12%,transparent)}
.pl-futura{color:var(--ink2)}
.pl-ok{color:var(--ok);border-color:color-mix(in srgb,var(--ok) 45%,transparent);background:color-mix(in srgb,var(--ok) 12%,transparent)}
.pl-canal{color:var(--cy);border-color:color-mix(in srgb,var(--cy) 40%,transparent);background:color-mix(in srgb,var(--cy) 9%,transparent)}
.pl-msg{color:var(--acc);border-color:color-mix(in srgb,var(--acc) 45%,transparent);background:color-mix(in srgb,var(--acc) 10%,transparent)}
.pl-motivo{background:color-mix(in srgb,var(--ink) 8%,transparent)}
.pl-selo{background:var(--acc);border-color:transparent;color:#fff;font-weight:800;letter-spacing:.03em}
.pl-dia{font-family:ui-monospace,Consolas,monospace}
.dia-b{display:inline-grid;place-items:center;min-width:30px;height:22px;padding:0 6px;border-radius:7px;font:700 11.5px ui-monospace,Consolas,monospace;background:color-mix(in srgb,var(--cy) 14%,transparent);color:var(--cy);border:1px solid color-mix(in srgb,var(--cy) 35%,transparent)}
.chips{display:flex;flex-wrap:wrap;gap:7px}
.chip{display:inline-flex;align-items:center;gap:7px;padding:3px 11px 3px 9px;border-radius:999px;font-size:12px;font-weight:700;border:1px solid var(--line2);--c:var(--mut);background:color-mix(in srgb,var(--c) 14%,transparent)}
.chip i{width:8px;height:8px;border-radius:50%;background:var(--c);box-shadow:0 0 8px var(--c)}
.st-aberto{--c:var(--c-aberto)}.st-sem_retorno{--c:var(--c-sem)}.st-negociacao{--c:var(--c-neg)}.st-agendado{--c:var(--c-agend)}.st-convertido_ativo{--c:var(--c-ativo)}.st-convertido_organico{--c:var(--c-org)}.st-descarte{--c:var(--c-desc)}
.avatar{display:inline-grid;place-items:center;width:36px;height:36px;border-radius:12px;flex:none;font:800 12.5px "Segoe UI Variable Display","Segoe UI";color:#fff;background:linear-gradient(135deg,#3a3f78,#1c1f3d);border:1px solid var(--line2)}
`;

export const parte_tabelas = `
/* ---- Leads (tabela) */
.tab-cartao{padding:6px}
.tbl-w{overflow-x:auto}.tbl{width:100%;border-collapse:collapse;font-size:13.5px}
.tbl th{text-align:left;padding:12px 14px;font-size:11.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--mut);font-weight:700;border-bottom:1px solid var(--line);white-space:nowrap}
.th-b{border:0;background:transparent;font:inherit;letter-spacing:inherit;text-transform:inherit;color:inherit;display:inline-flex;gap:5px;padding:0}
.th-b i{font-style:normal;color:var(--acc)}
.tbl td{padding:11px 14px;border-bottom:1px solid var(--line);vertical-align:middle}
.tbl tbody tr:last-child td{border-bottom:0}
.tbl tr.clic{cursor:pointer}.tbl tr.clic:hover,.tbl tr.clic:focus-visible{background:var(--card2)}
.tbl td.num{font:600 13px ui-monospace,Consolas,monospace;white-space:nowrap}
.tbl.peq td,.tbl.peq th{padding:8px 10px;font-size:13px}
.cel-quem{display:flex;align-items:center;gap:11px;min-width:190px}

`;

export const parte_modais = `
/* ---- modais */
.m-fundo{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(3,4,10,.62);backdrop-filter:blur(7px);animation:fade .18s both}
.m-fundo.saindo{opacity:0;transition:opacity .18s}
@keyframes fade{from{opacity:0}to{opacity:1}}
.m-caixa{width:100%;max-width:640px;max-height:92vh;display:flex;flex-direction:column;border-radius:22px;border:1px solid var(--line2);background:linear-gradient(180deg,color-mix(in srgb,var(--solid2) 96%,transparent),var(--solid));box-shadow:0 30px 90px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.04) inset;animation:sobe .28s cubic-bezier(.2,.8,.2,1) both;overflow:hidden}
@keyframes sobe{from{opacity:0;transform:translateY(18px) scale(.98)}to{opacity:1;transform:none}}
.m-topo{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;padding:20px 22px 14px;border-bottom:1px solid var(--line)}
.m-titulos{flex:1;min-width:0}.m-titulos h2{font:800 22px/1.2 "Segoe UI Variable Display","Segoe UI";letter-spacing:-.02em;display:flex;align-items:center;gap:10px}
.m-titulos p{color:var(--ink2);margin-top:3px}
.m-num{display:inline-grid;place-items:center;min-width:34px;height:34px;border-radius:11px;background:linear-gradient(135deg,var(--acc),var(--acc2));color:#fff;font:800 15px ui-monospace,Consolas,monospace;padding:0 8px;box-shadow:var(--glow)}
.m-corpo{padding:18px 22px 24px;overflow-y:auto;display:flex;flex-direction:column;gap:18px}
.m-rodape{display:flex;gap:10px;justify-content:flex-end;padding:14px 22px;border-top:1px solid var(--line);flex-wrap:wrap}
.m-caixa.peq .m-corpo{gap:14px}
.m-gaveta{justify-content:flex-end;padding:0}
.m-gaveta .m-caixa{max-width:780px;height:100vh;max-height:100vh;border-radius:22px 0 0 22px;animation:gav .3s cubic-bezier(.2,.8,.2,1) both}
@keyframes gav{from{transform:translateX(40px);opacity:0}to{transform:none;opacity:1}}
.m-caixa.item{border-top:3px solid var(--tc,var(--acc))}
.t-aberto{--tc:var(--c-aberto)}.t-sem_retorno{--tc:var(--c-sem)}.t-negociacao,.t-passo{--tc:var(--c-neg)}.t-agendado{--tc:var(--c-agend)}.t-ativo,.t-organico{--tc:var(--c-ativo)}.t-retorno{--tc:#ff6a86}.t-descarte{--tc:var(--c-desc)}.t-reativacao{--tc:var(--c-sem)}
.m-caixa.paleta{max-width:640px;align-self:flex-start;margin-top:10vh}
.m-caixa.paleta .m-topo{display:none}
.m-caixa.paleta .m-corpo{padding:14px}
.pal-l{display:flex;flex-direction:column;gap:2px;max-height:52vh;overflow-y:auto;margin-top:4px}
.pal-g{font:700 10.5px ui-monospace,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--mut);padding:10px 8px 4px}
.pal-i{display:flex;align-items:center;gap:12px;border:0;background:transparent;text-align:left;padding:9px 10px;border-radius:11px;color:var(--ink)}
.pal-i small{display:block;color:var(--mut)}.pal-i[aria-selected="true"],.pal-i:hover{background:var(--card2)}
.resumo{font-size:15.5px;color:var(--ink2);line-height:1.6}
.sec h4{font:800 11.5px ui-monospace,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--mut);margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:10px}
.sec-d{display:inline-flex;align-items:center;gap:8px;text-transform:none;letter-spacing:0;font:700 13px "Segoe UI",system-ui;color:var(--ink)}
.cont{font:700 11px ui-monospace,Consolas,monospace;color:var(--cy);letter-spacing:0}
.tira{display:flex;gap:8px;flex-wrap:wrap}
.tira-d{display:grid;place-items:center;min-width:48px;height:36px;border-radius:11px;border:1px solid var(--line);font:700 13.5px ui-monospace,Consolas,monospace;color:var(--mut)}
.tira-d.on{background:linear-gradient(135deg,var(--acc),var(--acc2));color:#fff;border-color:transparent;box-shadow:var(--glow)}.tira-d.fim{border-style:dashed}
.cad{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}
.cad-p{display:flex;flex-direction:column;gap:2px;text-align:left;border:1px solid var(--line);border-radius:14px;padding:11px 12px;background:var(--card)}
.cad-p:hover{border-color:var(--acc);transform:translateY(-2px)}.cad-p b{font:800 15px ui-monospace,Consolas,monospace;color:var(--acc)}.cad-p small{color:var(--mut)}
.callout{border-radius:14px;padding:12px 15px;background:color-mix(in srgb,var(--cy) 8%,transparent);border:1px solid color-mix(in srgb,var(--cy) 28%,transparent)}
.callout b{display:block;margin-bottom:2px}.callout p{color:var(--ink2)}
.callout.aviso{background:color-mix(in srgb,var(--warn) 12%,transparent);border-color:color-mix(in srgb,var(--warn) 45%,transparent);color:var(--ink)}
p.callout{margin:0}
.msgs-modal{display:flex;flex-direction:column;gap:14px}
.lks{display:flex;flex-direction:column;gap:8px}
.lk{display:flex;align-items:center;gap:10px;border:1px solid var(--line2);border-radius:13px;padding:9px 14px;background:var(--card);text-align:left}
.lk:hover{border-color:var(--cy);transform:translateX(3px)}.lk.ex{border-style:dashed;border-color:color-mix(in srgb,var(--bad) 55%,transparent)}
.lk-r{color:var(--mut);font-size:12.5px;min-width:140px}.lk b{font-weight:700}
.regras-mini{display:flex;flex-direction:column;gap:10px}.rm{display:flex;gap:12px;align-items:flex-start}.rm p{color:var(--mut);font-size:13px}.rm-n{width:26px;height:26px;font-size:12px}
.leads-mini{display:flex;flex-direction:column;gap:6px}
.lm{display:flex;align-items:center;gap:12px;text-align:left;border:1px solid var(--line);border-radius:13px;padding:8px 12px;background:var(--card)}.lm>span:nth-child(2){flex:1;min-width:0}.lm b{display:block}.lm small{color:var(--mut)}
.lm:hover{border-color:var(--line2)}

`;

export const parte_avisos = `
/* ---- avisos */
.faixa{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:18px;padding:11px 16px;border-radius:14px;border:1px solid var(--line2);background:var(--card);font-size:13px}
.f-aviso{background:color-mix(in srgb,var(--warn) 12%,transparent);border-color:color-mix(in srgb,var(--warn) 45%,transparent)}.f-erro{background:color-mix(in srgb,var(--bad) 14%,transparent);border-color:var(--bad)}
.toasts{position:fixed;right:20px;bottom:20px;z-index:120;display:flex;flex-direction:column;gap:10px;max-width:min(420px,calc(100vw - 40px))}
.toast{display:flex;gap:11px;align-items:flex-start;padding:12px 16px;border-radius:14px;background:var(--solid2);border:1px solid var(--line2);box-shadow:0 14px 44px rgba(0,0,0,.5);animation:sobe .25s both;font-weight:550}
.toast.sai{opacity:0;transform:translateX(20px);transition:all .3s}
.toast i{width:9px;height:9px;border-radius:50%;margin-top:6px;flex:none;background:var(--cy);box-shadow:0 0 10px var(--cy)}
.t-ok i{background:var(--ok);box-shadow:0 0 10px var(--ok)}.t-erro{border-color:color-mix(in srgb,var(--bad) 60%,transparent)}.t-erro i{background:var(--bad);box-shadow:0 0 10px var(--bad)}

`;

export const parte_dados = `
/* ---- Hoje e Análises (visual limpo: cartões planos, o gráfico é o protagonista) */
.hoje{gap:24px}
.hh{display:flex;justify-content:space-between;align-items:center;gap:28px;flex-wrap:wrap;padding:4px 2px 0}
.hh-data{font:700 11.5px ui-monospace,Consolas,monospace;letter-spacing:.16em;text-transform:uppercase;color:var(--cy)}
.hh h1{font:800 34px/1.1 "Segoe UI Variable Display","Segoe UI",system-ui;letter-spacing:-.035em;margin:4px 0 8px}
.hh-frase{font-size:16px;color:var(--ink2);max-width:62ch;line-height:1.6}.hh-frase b{color:var(--ink)}
.hh-aneis{display:flex;gap:26px}
.anel{display:flex;flex-direction:column;align-items:center;gap:8px}
.anel-s{position:relative}.anel-s svg{display:block}
.anel-t{stroke:color-mix(in srgb,var(--ink) 10%,transparent)}
.anel-c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none}
.anel-c b{font:800 19px "Segoe UI Variable Display","Segoe UI";letter-spacing:-.02em}.anel-c small{color:var(--mut);font-size:10.5px}
.anel-r{font-size:11.5px;font-weight:650;color:var(--ink2)}
.kpis2{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px}.kpis2.seis{grid-template-columns:repeat(6,minmax(0,1fr))}
.kpi2{border:1px solid var(--line);border-radius:16px;padding:14px 16px;background:var(--card);display:flex;flex-direction:column;gap:4px;min-width:0}
.kpi2 .kpi-v{font:800 26px/1.1 "Segoe UI Variable Display","Segoe UI";letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.kpi2.bad .kpi-v{color:var(--bad)}
.kpi2-h{display:flex;justify-content:space-between;align-items:center;gap:8px;min-height:26px}
.ver-mais{align-self:center;margin-top:2px}
.kpi2-s{color:var(--mut);font-size:12px;line-height:1.35}
.spark{width:72px;height:26px;flex:none}
.dlt{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;white-space:nowrap}
.dlt i{font-style:normal;font-size:9px}.dlt em{font-style:normal;font-weight:450;color:var(--mut)}
.dlt.bom i{color:var(--ok)}.dlt.ruim i{color:var(--bad)}.dlt.neutro i,.dlt.neutro{color:var(--mut)}
.g12{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:16px;align-items:stretch}
.sp3{grid-column:span 3}.sp4{grid-column:span 4}.sp5{grid-column:span 5}.sp6{grid-column:span 6}.sp7{grid-column:span 7}.sp8{grid-column:span 8}.sp12{grid-column:span 12}
.cartao{display:flex;flex-direction:column;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:20px 22px;box-shadow:none;min-width:0;animation:entra .45s both}
.card-h{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin-bottom:14px}
.card-h h3{font:700 15.5px "Segoe UI Variable Display","Segoe UI";letter-spacing:-.01em}.card-h p{font-size:12.5px;color:var(--mut);margin-top:3px;max-width:62ch;line-height:1.45}
.card-b{flex:1;min-width:0}
.dest{text-align:right;flex:none}.dest b{display:block;font:800 21px/1.1 "Segoe UI Variable Display","Segoe UI";letter-spacing:-.02em;white-space:nowrap}.dest small{color:var(--mut);font-size:11.5px}
.sec-t{margin-top:12px}.sec-t h2{font:800 20px "Segoe UI Variable Display","Segoe UI";letter-spacing:-.02em}.sec-t p{color:var(--mut);font-size:13px;margin-top:2px}
.col-dir{display:flex;flex-direction:column;gap:16px}
.dest-card{padding:16px 22px}
.dest-l{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 32px}
.dest-l li{display:flex;gap:11px;font-size:13.5px;color:var(--ink2);line-height:1.5}
.dest-l i{width:8px;height:8px;border-radius:50%;margin-top:7px;flex:none;background:var(--cy)}
.dl-bom i{background:var(--ok)}.dl-atencao i{background:var(--warn)}
.fila-l{display:flex;flex-direction:column;gap:18px}
.grupo h4{display:flex;align-items:center;gap:10px;font:700 12.5px "Segoe UI",system-ui;color:var(--ink2);margin-bottom:8px}
.grupo h4 em{font-style:normal;font:700 11px ui-monospace,Consolas,monospace;color:var(--mut);border:1px solid var(--line);border-radius:999px;padding:0 8px}
.g-num{display:inline-grid;place-items:center;min-width:26px;height:22px;border-radius:7px;background:var(--acc);color:#fff;font:800 11.5px ui-monospace,Consolas,monospace;padding:0 6px}
.tarefas{display:flex;flex-direction:column;gap:6px}
.tarefa{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr) auto;gap:14px;align-items:center;border:1px solid var(--line);border-left:3px solid var(--c-sem);border-radius:12px;padding:9px 12px;background:var(--solid);cursor:pointer;transition:border-color .15s,transform .15s}
.tarefa:hover{border-color:var(--line2);transform:translateY(-1px)}
.tarefa.pr1{border-left-color:var(--acc)}.tarefa.pr2{border-left-color:var(--c-aberto)}.tarefa.pr3{border-left-color:var(--c-sem)}
.tarefa-passo{display:flex;flex-wrap:wrap;align-items:center;gap:7px;min-width:0}
.tarefa-quem{display:flex;align-items:center;gap:10px;min-width:0}
.tarefa-quem b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tarefa-quem small{display:block;color:var(--mut);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tarefa-acoes{display:flex;gap:6px;align-items:center}
.tarefa .avatar{width:30px;height:30px;border-radius:10px;font-size:11px}
.rd-l{display:flex;flex-direction:column;gap:8px}
.rd{display:flex;flex-direction:column;gap:3px;text-align:left;border:1px solid var(--line);border-left:3px solid var(--nc,var(--mut));border-radius:12px;padding:10px 12px;background:var(--solid);color:var(--ink)}
.rd:hover{border-color:var(--line2)}
.rd.n-critico{--nc:var(--bad)}.rd.n-atencao{--nc:var(--warn)}.rd.n-info{--nc:var(--cy)}.rd.n-bom{--nc:var(--ok)}
.rd b{font-size:13px;line-height:1.35}.rd small{color:var(--mut);font-size:12px}
.radar{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.ins{border:1px solid var(--line);border-left:3px solid var(--nc,var(--mut));border-radius:14px;padding:13px 15px;background:var(--card);display:flex;flex-direction:column;gap:6px}
.ins.n-critico{--nc:var(--bad)}.ins.n-atencao{--nc:var(--warn)}.ins.n-info{--nc:var(--cy)}.ins.n-bom{--nc:var(--ok)}
.ins-h{display:flex;justify-content:space-between;align-items:center;gap:8px}
.sel{display:inline-flex;align-items:center;gap:6px;font:700 10.5px ui-monospace,Consolas,monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--nc,var(--mut))}
.sel i{font-style:normal;font-size:9px}.s-critico{color:var(--bad)}.s-atencao{color:var(--warn)}.s-info{color:var(--cy)}.s-bom{color:var(--ok)}
.ins-m{font:700 12.5px ui-monospace,Consolas,monospace;color:var(--ink2)}
.ins h4{font:700 14.5px/1.3 "Segoe UI Variable Display","Segoe UI"}.ins p{font-size:13px;color:var(--ink2);line-height:1.5}
.ins .mini{align-self:flex-start;margin-top:4px}
.rodape-n{font-size:12px;color:var(--mut);text-align:center;margin-top:4px}
.aging{display:flex;flex-direction:column;gap:16px}.aging-l{display:grid;grid-template-columns:112px minmax(0,1fr);gap:12px;align-items:center}.aging-r{font-size:13px;color:var(--ink2)}
.aging+.legenda{margin:18px 0 0}
.carregando-an{display:grid;gap:16px}.skel{height:170px;border-radius:18px;background:linear-gradient(90deg,var(--card),var(--card2),var(--card));background-size:200% 100%;animation:brilho 1.3s linear infinite}
@keyframes brilho{to{background-position:-200% 0}}
.rosca{display:flex;align-items:center;gap:22px;flex-wrap:wrap}
.rosca-s{position:relative;flex:none}.rosca-s svg{display:block}
.rosca-c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none}
.rosca-c b{font:800 24px "Segoe UI Variable Display","Segoe UI"}.rosca-c small{color:var(--mut);font-size:11px}
.rosca-l{display:flex;flex-direction:column;gap:7px;flex:1;min-width:150px}.rosca-l div{display:flex;align-items:center;gap:9px;font-size:13px}
.rosca-l i{width:10px;height:10px;border-radius:3px;flex:none}.rosca-l span{flex:1;color:var(--ink2)}.rosca-l em{font-style:normal;color:var(--mut);width:52px;text-align:right}
.escala{display:flex;align-items:center;gap:8px;justify-content:flex-end;font-size:11.5px;color:var(--mut);margin-top:8px}
.escala i{width:110px;height:8px;border-radius:4px;background:linear-gradient(90deg,color-mix(in srgb,var(--g1) 14%,var(--solid)),var(--g1))}

/* ---- gráficos */
.chart{width:100%}.svg-chart{display:block;overflow:visible}.enter{animation:entra .5s both}
.grade{stroke:var(--line);stroke-width:1}
.eixo{fill:var(--mut);font-size:11px;font-variant-numeric:tabular-nums}
.cursor{stroke:var(--line2);stroke-width:1}
.rot-pico{fill:var(--ink);font-size:11px;font-weight:700}
.col{transition:filter .15s}.col:hover{filter:brightness(1.15)}
.legenda{display:flex;flex-wrap:wrap;gap:6px 18px;margin-bottom:8px;font-size:12.5px;color:var(--ink2)}
.legenda span{display:inline-flex;align-items:center;gap:7px}.legenda i{width:16px;height:3px;border-radius:2px;display:inline-block}.legenda i.bl{width:10px;height:10px;border-radius:3px}
.bars{display:flex;flex-direction:column;gap:2px}
.bar-row{display:grid;grid-template-columns:minmax(110px,34%) minmax(0,1fr) auto;gap:12px;align-items:center;padding:6px 8px;margin:0 -8px;border-radius:10px}
.bar-row:hover,.bar-row:focus-visible{background:var(--card2)}
.bar-l{font-size:13px;color:var(--ink2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar-t{height:10px;border-radius:0 5px 5px 0;background:color-mix(in srgb,var(--ink) 7%,transparent)}
.bar-f{height:100%;border-radius:0 4px 4px 0;transform-origin:left;animation:cresce .7s cubic-bezier(.2,.7,.2,1) both}
@keyframes cresce{from{transform:scaleX(0)}to{transform:none}}
@media (prefers-reduced-motion:reduce){.bar-f,.enter{animation:none}}
.bars.alta .bar-row{padding:9px 8px}.bars.alta .bar-t{height:20px}
.bar-v{display:flex;align-items:baseline;gap:8px;font-variant-numeric:tabular-nums;white-space:pre}.bar-v b{font-weight:700;font-size:13.5px}.bar-v span{color:var(--mut);font-size:12px}
.stack{display:flex;gap:2px;height:18px}.stack-s{border-radius:3px;min-width:3px}
.stack-s:first-child{border-radius:6px 3px 3px 6px}.stack-s:last-child{border-radius:3px 6px 6px 3px}.stack-s:only-child{border-radius:6px}
.stack-l{display:flex;flex-direction:column;gap:6px;margin-top:12px}.stack-l div{display:flex;align-items:center;gap:9px;font-size:13px}
.stack-l i{width:10px;height:10px;border-radius:3px;flex:none}.stack-l span{flex:1;color:var(--ink2)}.stack-l em{font-style:normal;color:var(--mut);width:56px;text-align:right}
.tip{position:fixed;z-index:130;left:0;top:0;pointer-events:none;opacity:0;transition:opacity .1s;background:var(--solid2);color:var(--ink);border:1px solid var(--line2);border-radius:12px;padding:9px 12px;box-shadow:0 10px 32px rgba(0,0,0,.45);font-size:12.5px;max-width:300px}
.tip.on{opacity:1}.tip-t{font-weight:700;margin-bottom:5px}.tip-r{display:flex;align-items:center;gap:8px;line-height:1.7}.tip-r b{font-variant-numeric:tabular-nums}.tip-r span{color:var(--mut)}
.tip-k{width:14px;height:3px;border-radius:2px;display:inline-block}.tip-n{margin-top:4px;color:var(--mut)}

`;

export const parte_abas = `
.tela-ac select.in{width:auto;min-width:190px}
.tabs-an{display:flex;gap:4px;border-bottom:1px solid var(--line);margin-top:-6px}
.tab-an{border:0;background:transparent;padding:10px 18px;font-weight:650;font-size:14px;color:var(--mut);border-bottom:2px solid transparent;margin-bottom:-1px}
.tab-an:hover{color:var(--ink)}
.tab-an[aria-selected="true"]{color:var(--ink);border-bottom-color:var(--acc)}
`;

// Atalhos entre módulos no menu lateral (usados no CRM e no Agente receptivo).
export const parte_menu = `
.nav-cap{font:800 10px ui-monospace,Consolas,monospace;letter-spacing:.16em;text-transform:uppercase;color:var(--mut);padding:0 12px;margin:2px 0 -2px}
.side-m{display:flex;flex-direction:column;gap:2px;margin-top:auto}
.side-m a{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:10px;font-size:13px;font-weight:600;color:var(--ink2)}
.side-m a:hover{background:var(--card);color:var(--ink)}
`;
