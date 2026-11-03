import { paginaModulo } from '../../ui/ds.js';

// Página do BI do agente no design system do Clinex (menu lateral, topo, tema, cartões de vidro). Os blocos e gráficos
// continuam sendo montados por app.ts e charts.ts; aqui ficam só o HTML e o visual, sobre os mesmos tokens do CRM.
// REGRAS deste arquivo: sem crases, sem "dollar-chave" e sem barra invertida dentro dos textos (são template literals).

const css = `
/* os nomes de cor do BI são aliases dos tokens do design system */
:root{
  --surface:var(--solid); --surface-2:var(--solid2); --ink-2:var(--ink2); --muted:var(--mut); --accent:var(--acc);
  --s1:var(--g1); --s2:var(--g2); --s3:var(--g3);
  --o1:var(--f0); --o2:var(--f1); --o3:var(--f2); --o4:var(--f3); --o5:var(--ag3); --o6:var(--ag4); --o7:var(--acc);
  --heat-lo:color-mix(in srgb,var(--cy) 9%,var(--solid)); --heat-hi:var(--cy);
  --s1-suave:color-mix(in srgb,var(--s1) 42%,var(--solid));
  --st-bom:var(--ok); --st-atencao:var(--warn); --st-serio:var(--acc2); --st-critico:var(--bad); --neutro:var(--mut);
}
.bi-cab .tela-ac{align-items:center}
.meta{font-size:12.5px;color:var(--muted);margin-top:-10px}
#avisos{display:flex;flex-direction:column;gap:8px}
#avisos:empty{display:none}
#avisos .faixa{margin:0}
.f-demo{background:color-mix(in srgb,var(--s1) 9%,var(--solid))}
#app{display:flex;flex-direction:column;gap:22px;transition:opacity .25s}
#app.carregando{opacity:.55;pointer-events:none}
.grade-12{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:16px}
.s4{grid-column:span 4}.s5{grid-column:span 5}.s6{grid-column:span 6}.s7{grid-column:span 7}.s8{grid-column:span 8}.s12{grid-column:span 12}
.card{display:flex;flex-direction:column;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:20px 22px;min-width:0;box-shadow:var(--shadow);backdrop-filter:blur(14px);animation:entra .45s both}
.card-b{flex:1;min-width:0}
.sub-t{display:block;font:800 11px ui-monospace,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin:22px 0 8px}

/* ---- KPIs */
.kpi-grid{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:16px}
.hero{position:relative;overflow:hidden;display:flex;flex-direction:column;padding:26px 28px;border-radius:24px;border:1px solid color-mix(in srgb,var(--s3) 38%,var(--line));
  background:linear-gradient(150deg,color-mix(in srgb,var(--s3) 20%,var(--solid2)),var(--card) 68%);box-shadow:var(--shadow);animation:entra .5s both}
.hero::after{content:"";position:absolute;right:-70px;top:-70px;width:260px;height:260px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--s3) 34%,transparent),transparent 70%);pointer-events:none}
.hero>*{position:relative;z-index:1}
.hero-r{font-size:13.5px;font-weight:650;color:var(--ink-2)}
.hero-n{font:800 88px/1 "Segoe UI Variable Display","Segoe UI",system-ui;letter-spacing:-.05em;margin:12px 0 10px;font-variant-numeric:tabular-nums;background:linear-gradient(100deg,var(--ink),color-mix(in srgb,var(--s3) 70%,var(--ink)));-webkit-background-clip:text;background-clip:text;color:transparent}
.hero-f{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.hero-s{color:var(--muted);font-size:12.5px}
.hero-sp{margin:18px 0 12px;flex:1;min-height:64px}
.hero-sp svg{width:100%;height:64px}
.hero-p{font-size:13.5px;color:var(--ink-2);max-width:46ch;line-height:1.55}
.tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.tile{position:relative;overflow:hidden;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px 18px;display:flex;flex-direction:column;gap:6px;box-shadow:var(--shadow);animation:entra .5s both;transition:transform .18s,border-color .18s}
.tile:hover{transform:translateY(-2px);border-color:var(--line2)}
.tile::after{content:"";position:absolute;right:-24px;top:-24px;width:92px;height:92px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--cy) 20%,transparent),transparent 70%);pointer-events:none}
.tile-r{font-size:12.5px;color:var(--muted);font-weight:650}
.tile-n{font:800 32px/1.1 "Segoe UI Variable Display","Segoe UI",system-ui;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.tile-f{display:flex;justify-content:space-between;align-items:flex-end;gap:8px;margin-top:auto;min-height:34px}
.tile-nota{font-size:12px;color:var(--muted)}
.spark{width:110px;height:32px;flex:none}

/* ---- leitura automática */
.bloco-h h2{font:800 20px "Segoe UI Variable Display","Segoe UI",system-ui;letter-spacing:-.02em}
.bloco-h p{font-size:13px;color:var(--muted);margin-top:2px}
.insights{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr));gap:14px;margin-top:14px}
.insight{position:relative;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px 18px 16px 20px;box-shadow:var(--shadow);animation:entra .5s both;overflow:hidden;transition:transform .18s,border-color .18s}
.insight:hover{transform:translateY(-2px);border-color:var(--line2)}
.insight::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--neutro)}
.insight.n-critico::before{background:var(--st-critico);box-shadow:0 0 14px var(--st-critico)}.insight.n-atencao::before{background:var(--st-atencao)}.insight.n-bom::before{background:var(--st-bom)}.insight.n-info::before{background:var(--s1)}
.insight-h{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px}
.insight-m{font:700 12.5px ui-monospace,Consolas,monospace;color:var(--ink-2)}
.insight h4{font:700 14.5px/1.3 "Segoe UI Variable Display","Segoe UI",system-ui;margin-bottom:4px}
.insight p{font-size:13px;color:var(--ink-2);line-height:1.55}

/* ---- selos */
.chip{--c:var(--neutro);display:inline-flex;align-items:center;gap:6px;padding:2px 10px 2px 8px;border-radius:999px;font-size:11.5px;font-weight:700;white-space:nowrap;color:var(--c);background:color-mix(in srgb,var(--c) 12%,transparent);border:1px solid color-mix(in srgb,var(--c) 38%,transparent)}
.chip i{font-style:normal;font-size:9px}
.c-bom{--c:var(--st-bom)}.c-atencao{--c:var(--st-atencao)}.c-critico{--c:var(--st-critico)}.c-info{--c:var(--s1)}.c-neutro{--c:var(--neutro)}

/* ---- peças dos cartões */
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-top:18px}
.stats div{background:color-mix(in srgb,var(--solid) 55%,transparent);border:1px solid var(--line);border-radius:14px;padding:10px 12px}
.stats b{display:block;font:800 19px "Segoe UI Variable Display","Segoe UI";letter-spacing:-.02em}
.stats span{font-size:12px;color:var(--muted)}
.tbl-w{overflow-x:auto}
.tbl td.obs{color:var(--muted);max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.medidor{display:flex;align-items:center;gap:10px;min-width:150px}
.medidor-t{flex:1;height:8px;border-radius:4px;background:color-mix(in srgb,var(--ink) 8%,transparent);overflow:hidden}
.medidor-f{height:100%;border-radius:4px;transform-origin:left;animation:cresce .7s cubic-bezier(.2,.7,.2,1) both}
.medidor b{font-size:12.5px;min-width:46px;text-align:right}
.lista{display:flex;flex-direction:column}
.item{padding:10px 0;border-bottom:1px solid var(--line)}
.item:last-child{border-bottom:0}
.item-h{display:flex;gap:10px;align-items:center;margin-bottom:4px;font-size:12.5px}
.item p{font-size:13px;color:var(--ink-2);word-break:break-word}

/* ---- gaveta da conversa */
.gaveta-fundo{position:fixed;inset:0;z-index:60;background:rgba(3,4,10,.6);backdrop-filter:blur(6px);display:flex;justify-content:flex-end;animation:fade .2s both}
.gaveta{width:min(580px,100%);height:100%;overflow:auto;background:color-mix(in srgb,var(--solid) 94%,transparent);backdrop-filter:blur(22px);border-left:1px solid var(--line2);padding:22px 24px 32px;animation:gav .3s cubic-bezier(.2,.8,.2,1) both}
@keyframes gav{from{transform:translateX(40px);opacity:0}to{transform:none;opacity:1}}
.gaveta header{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;margin-bottom:16px}
.gaveta header h3{font:800 19px "Segoe UI Variable Display","Segoe UI";letter-spacing:-.02em}
.gaveta header p{font-size:12.5px;color:var(--muted)}
.aviso-i{background:color-mix(in srgb,var(--s1) 10%,var(--solid));border:1px solid color-mix(in srgb,var(--s1) 30%,var(--line));border-radius:12px;padding:9px 13px;font-size:12.5px;margin-bottom:12px}
.conversa{display:flex;flex-direction:column;gap:18px;margin-bottom:16px}
.turno{display:flex;flex-direction:column;gap:6px}
.bolha{max-width:88%;padding:10px 14px;border-radius:16px;font-size:13.5px;line-height:1.5}
.bolha small{display:block;font:800 10px ui-monospace,Consolas,monospace;letter-spacing:.1em;text-transform:uppercase;opacity:.75;margin-bottom:3px}
.bolha p{white-space:pre-wrap;word-break:break-word}
.bolha.pac{align-self:flex-start;background:var(--card2);border:1px solid var(--line);border-bottom-left-radius:5px}
.bolha.ama{align-self:flex-end;background:linear-gradient(135deg,var(--acc),var(--acc2));color:#fff;border-bottom-right-radius:5px;box-shadow:0 6px 18px color-mix(in srgb,var(--acc) 28%,transparent)}
.tags{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}
.tag{font-size:11.5px;color:var(--muted);background:var(--card);border:1px solid var(--line);border-radius:8px;padding:2px 9px}
.tag.t-alerta{color:var(--ink);background:color-mix(in srgb,var(--st-atencao) 16%,var(--solid));border-color:color-mix(in srgb,var(--st-atencao) 45%,var(--line))}

.vazio-grande{text-align:center;padding:56px 28px;display:flex;flex-direction:column;gap:12px;align-items:center}
.vazio-grande h2{font:800 24px "Segoe UI Variable Display","Segoe UI"}
.vazio-grande p{color:var(--ink-2);max-width:60ch;line-height:1.6}
.btn-p{margin-top:8px;border:0;background:linear-gradient(135deg,var(--acc),var(--acc2));color:#fff;font-weight:700;padding:10px 20px;border-radius:12px;box-shadow:var(--glow);transition:transform .12s,filter .15s}
.btn-p:hover{filter:brightness(1.08);transform:translateY(-1px)}
.rodape{font-size:12px;color:var(--muted);text-align:center}

@media (max-width:1100px){
  .s4,.s5,.s6,.s7,.s8{grid-column:span 12}
  .kpi-grid{grid-template-columns:1fr}
  .tiles{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media (max-width:640px){
  .hero-n{font-size:64px}
  .tiles{gap:12px}
  .card{padding:16px}
  .bar-row{grid-template-columns:minmax(90px,40%) minmax(0,1fr) auto;gap:8px}
}
@media (prefers-reduced-motion:reduce){.card,.tile,.insight,.hero,.gaveta,.gaveta-fundo,.medidor-f{animation:none!important}#app{transition:none}}
`;

const refresh = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v5h-5"/></svg>';

const main = `
<main id="main"><div class="tela">
  <header class="tela-h bi-cab">
    <div><h1>Inteligência do agente receptivo</h1><p>Tudo o que a Amanda faz nas conversas, medido: conversão, autonomia, gargalos e a saúde das integrações.</p></div>
    <div class="tela-ac">
      <div class="seg" role="group" aria-label="Período">
        <button type="button" data-periodo="24h" aria-pressed="false">24 h</button>
        <button type="button" data-periodo="7d" aria-pressed="false">7 dias</button>
        <button type="button" data-periodo="30d" aria-pressed="false">30 dias</button>
      </div>
      <div class="seg" role="group" aria-label="Fonte dos dados">
        <button type="button" data-fonte="real" aria-pressed="false">Dados reais</button>
        <button type="button" data-fonte="demo" aria-pressed="false">Demonstração</button>
      </div>
      <button class="btn" id="btn-atualizar" type="button" aria-label="Atualizar">${refresh}<span>Atualizar</span></button>
    </div>
  </header>
  <div class="meta" id="meta" aria-live="polite">Carregando…</div>
  <div id="avisos"></div>
  <div id="app"></div>
</div></main>`;

export const pagina = paginaModulo({ titulo: 'BI do agente', modulo: 'receptivo', ativo: 'bi', main, css, scripts: ['/painel/receptivo/bi/app.js'] });
