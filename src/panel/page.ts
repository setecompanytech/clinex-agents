import { paginaModulo } from '../ui/ds.js';

// Página do Fluxo da Amanda no design system do Clinex (menu lateral, topo, tema, cartões de vidro). O mapa, o zoom, o
// painel de detalhes e a conversa de exemplo continuam sendo montados por client.ts; aqui só ficam o HTML e o visual.
// REGRAS deste arquivo: sem crases, sem "dollar-chave" e sem barra invertida dentro dos textos (são template literals).

const css = `
/* as cores semânticas do fluxo são os mesmos tokens do design system */
:root{
  --gatilho:var(--g5); --trava:var(--g4); --etapa:var(--c-aberto); --clinilink:var(--g1); --gpt:var(--ag3); --alerta:var(--bad);
  --acao:var(--ok); --info:var(--g6); --fim:var(--g6);
  --edge-stop:var(--warn); --edge-alert:var(--bad); --edge-gpt:var(--ag3); --edge-hl:var(--cy);
  --border:var(--line); --text:var(--ink); --muted:var(--mut); --panel:var(--solid); --sel:var(--cy); --label-bg:var(--solid2);
  --band:color-mix(in srgb,var(--ink) 3%,transparent); --bandBorder:var(--line);
  --chat-bg:color-mix(in srgb,var(--solid) 60%,transparent);
}
html,body{height:100%}
body{overflow:hidden}
.app{height:100vh;min-height:0}
.corpo{display:flex;flex-direction:column;height:100vh;min-height:0}
.topo{position:static}

/* ---- cabeçalho da página */
.fx-cab{padding:14px 28px 10px;display:flex;flex-direction:column;gap:10px;z-index:5}
.fx-cab .tela-h{align-items:center}
.fx-cab .tela-h>div:first-child{flex:1 1 460px;min-width:0}
.fx-cab .tela-h p{font-size:13px;margin-top:4px;max-width:72ch;color:var(--mut)}
.fx-cab .btn{padding:6px 12px;font-size:13px}
.fx-cab .tela-ac{flex:none}
.fx-eyebrow{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px}
.verTag{font:800 10.5px ui-monospace,Consolas,monospace;letter-spacing:.1em;text-transform:uppercase;padding:3px 10px;border-radius:999px;color:var(--cy);border:1px solid color-mix(in srgb,var(--cy) 40%,transparent);background:color-mix(in srgb,var(--cy) 9%,transparent);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.verDate{font-size:12px;color:var(--mut)}
.fx-cab .tela-h h1{font-size:26px}
.fx-barra{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
#tabs{display:inline-flex;gap:2px;padding:3px;border:1px solid var(--line);background:var(--card);border-radius:12px}
.tab{border:0;background:transparent;border-radius:9px;padding:7px 16px;color:var(--ink2);font-weight:650;font-size:13px;transition:background .15s,color .15s}
.tab:hover{color:var(--ink)}
.tab.on{background:var(--solid2);color:var(--ink);box-shadow:0 0 0 1px var(--line2)}
#legend,#phases{display:flex;gap:7px;flex-wrap:nowrap;align-items:center;overflow-x:auto;scrollbar-width:none;min-width:0}
#legend::-webkit-scrollbar,#phases::-webkit-scrollbar{display:none}
#phases{flex:1 1 300px}
.legendItem,.phaseBtn,.legendWarn{flex:none;white-space:nowrap}
.legendItem{display:inline-flex;align-items:center;gap:7px;padding:3px 11px 3px 8px;border-radius:999px;background:var(--card);border:1px solid var(--line);font-size:12px;font-weight:600;color:var(--c);transition:transform .12s,border-color .15s,background .15s}
.legendItem:hover{transform:translateY(-1px);border-color:var(--c)}
.legendItem .dot{width:9px;height:9px;border-radius:50%;background:var(--c);box-shadow:0 0 9px var(--c)}
.legendItem span:last-child{color:var(--ink)}
.legendItem.on{border-color:var(--c);background:color-mix(in srgb,var(--c) 14%,var(--card))}
.legendWarn{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--mut);margin-left:4px}
.phaseBtn{padding:4px 11px;border-radius:999px;border:1px solid var(--line);background:transparent;font-size:12px;font-weight:600;color:var(--ink2);transition:color .15s,border-color .15s,background .15s}
.phaseBtn:hover{color:var(--ink);border-color:var(--line2);background:var(--card)}
.phaseBtn.alerta{color:var(--alerta)}.phaseBtn.gpt{color:var(--gpt)}
.k-gatilho{--c:var(--gatilho)}.k-trava{--c:var(--trava)}.k-etapa{--c:var(--etapa)}.k-clinilink{--c:var(--clinilink)}.k-gpt{--c:var(--gpt)}
.k-alerta{--c:var(--alerta)}.k-acao{--c:var(--acao)}.k-info{--c:var(--info)}.k-fim{--c:var(--fim)}
.fx-leg{min-width:0}
#btnResumo.on{border-color:var(--cy);color:var(--cy)}

/* ---- área do mapa */
.fx-main{position:relative;flex:1;min-height:0;border-top:1px solid var(--line)}
#viewport{position:absolute;inset:0;overflow:hidden;touch-action:none;cursor:grab;user-select:none;-webkit-user-select:none;
  background-image:radial-gradient(circle,color-mix(in srgb,var(--ink) 16%,transparent) 1.2px,transparent 1.5px);background-size:var(--gs,28px) var(--gs,28px)}
#viewport::after{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 40%,transparent 55%,color-mix(in srgb,var(--bg) 70%,transparent))}
#viewport.grabbing{cursor:grabbing}
#world,.worldClone{position:absolute;left:0;top:0;transform-origin:0 0}
#world{will-change:transform}
#world.anim{transition:transform .45s cubic-bezier(.2,.7,.2,1)}
.band{position:absolute;border:1px solid var(--line);background:var(--band);border-radius:22px;pointer-events:none;backdrop-filter:blur(2px)}
.band-alerta{border-color:color-mix(in srgb,var(--alerta) 55%,var(--line));background:color-mix(in srgb,var(--alerta) 5%,transparent);border-style:dashed}
.band-gpt{border-color:color-mix(in srgb,var(--gpt) 55%,var(--line));background:color-mix(in srgb,var(--gpt) 5%,transparent);border-style:dashed}
.band-regras{border-color:color-mix(in srgb,var(--info) 55%,var(--line));background:color-mix(in srgb,var(--info) 6%,transparent)}
.bandTitle{position:absolute;left:22px;top:14px;right:16px;font:800 17px "Segoe UI Variable Display","Segoe UI",system-ui;letter-spacing:-.02em;color:var(--ink)}
.band-alerta .bandSub{right:auto;max-width:215px}
.band-alerta .bandTitle{color:var(--alerta)}.band-gpt .bandTitle{color:var(--gpt)}
.bandSub{position:absolute;left:22px;top:38px;right:16px;font-size:12.5px;color:var(--mut);line-height:1.3}
svg.edges{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}
.edge{fill:none;stroke:var(--edge);stroke-width:2;stroke-linecap:round;opacity:.85}
.edge-stop{stroke:var(--edge-stop);stroke-dasharray:6 5}
.edge-alert{stroke:var(--edge-alert);stroke-width:2.2}
.edge-gpt{stroke:var(--edge-gpt)}
.edge.hl{stroke:var(--edge-hl);stroke-width:3;stroke-dasharray:9 7;opacity:1;animation:fluxoDash 1s linear infinite;filter:drop-shadow(0 0 5px var(--edge-hl))}
@keyframes fluxoDash{to{stroke-dashoffset:-32}}
.edge.dim{opacity:.15}
.arrow-main{fill:var(--edge)}.arrow-stop{fill:var(--edge-stop)}.arrow-alert{fill:var(--edge-alert)}.arrow-gpt{fill:var(--edge-gpt)}.arrow-hl{fill:var(--edge-hl)}
.edgeLabel{position:absolute;transform:translate(-50%,-50%);padding:2px 10px;border-radius:999px;font-size:11.5px;font-weight:650;background:var(--label-bg);border:1px solid var(--line2);color:var(--ink2);white-space:nowrap;pointer-events:none}
.edgeLabel.stop{color:var(--edge-stop);border-color:color-mix(in srgb,var(--edge-stop) 50%,var(--line))}
.edgeLabel.alert{color:var(--edge-alert);border-color:color-mix(in srgb,var(--edge-alert) 55%,var(--line))}
.edgeLabel.gpt{color:var(--edge-gpt);border-color:color-mix(in srgb,var(--edge-gpt) 50%,var(--line))}
.edgeLabel.hl{color:var(--edge-hl);border-color:var(--edge-hl)}
.edgeLabel.dim{opacity:.15}

.node{position:absolute;background:linear-gradient(180deg,var(--card2),var(--card));border:1px solid var(--line);border-left:4px solid var(--c);border-radius:14px;padding:9px 12px 8px 12px;
  box-shadow:var(--shadow);cursor:pointer;overflow:hidden;backdrop-filter:blur(10px);transition:box-shadow .18s,border-color .18s,opacity .2s,transform .18s}
.node::before{content:"";position:absolute;left:0;top:0;bottom:0;width:70px;background:linear-gradient(90deg,color-mix(in srgb,var(--c) 16%,transparent),transparent);pointer-events:none}
.node:hover{border-color:color-mix(in srgb,var(--c) 70%,var(--line));transform:translateY(-2px);box-shadow:0 14px 36px color-mix(in srgb,var(--c) 24%,transparent),var(--shadow)}
.node:focus-visible{outline:2px solid var(--cy);outline-offset:2px}
.node.sel{border-color:var(--cy);border-left-color:var(--c);box-shadow:0 0 0 3px color-mix(in srgb,var(--cy) 30%,transparent),0 14px 40px color-mix(in srgb,var(--cy) 20%,transparent)}
/* o design system tem uma classe .sel (selo dos insights); aqui .sel só marca o passo selecionado */
.node.sel{display:block;align-items:normal;gap:0;font:inherit;letter-spacing:normal;text-transform:none;color:inherit}
.node.end.sel{display:flex}
.node.dim{opacity:.2}
.node.k-alerta{background:linear-gradient(180deg,color-mix(in srgb,var(--alerta) 9%,var(--card2)),var(--card))}
.nodeHead{display:flex;align-items:center;gap:8px;margin-bottom:3px;position:relative}
.badge{min-width:22px;height:22px;padding:0 7px;border-radius:11px;background:var(--c);color:#fff;font:800 11px ui-monospace,Consolas,monospace;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 0 12px color-mix(in srgb,var(--c) 50%,transparent)}
.kindLabel{font:800 10px ui-monospace,Consolas,monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--c);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.warn{margin-left:auto;flex:none;width:18px;height:18px;border-radius:50%;border:1.5px solid var(--trava);color:var(--trava);font-size:11px;font-weight:800;display:inline-flex;align-items:center;justify-content:center}
.legendWarn .warn{margin-left:0}
.nodeTitle{font-weight:700;font-size:13.2px;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;position:relative}
.nodeSub{margin-top:3px;font-size:11.8px;color:var(--mut);line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;position:relative}
.node.end{border-radius:999px;padding:9px 18px;border-left-width:1px;border-width:1.5px;border-color:var(--c);background:color-mix(in srgb,var(--c) 11%,var(--card));display:flex;flex-direction:column;justify-content:center}
.node.end::before{display:none}
.node.end .nodeHead{display:none}
.node.end .nodeTitle{font-size:13px}
.node.end .nodeSub{margin-top:1px;font-size:11.5px}
.node.end.tone-ok{--c:var(--acao)}.node.end.tone-erro{--c:var(--bad)}.node.end.tone-sombra{--c:var(--trava)}

.controls{position:absolute;left:16px;bottom:16px;display:flex;flex-direction:column;gap:8px;align-items:flex-start;z-index:3}
.zoomBox{display:flex;align-items:center;background:var(--nav);backdrop-filter:blur(14px);border:1px solid var(--line2);border-radius:13px;box-shadow:var(--shadow);overflow:hidden}
.zoomBox button{border:0;background:transparent;width:38px;height:36px;font-size:19px;color:var(--ink2)}
.zoomBox button:hover{background:var(--card2);color:var(--ink)}
.zoomBox span{min-width:52px;text-align:center;font:700 12px ui-monospace,Consolas,monospace;color:var(--ink2)}
.hint{font-size:11.5px;color:var(--mut);background:var(--nav);backdrop-filter:blur(12px);padding:5px 11px;border-radius:10px;border:1px solid var(--line);max-width:34ch;line-height:1.35}
#loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--mut);z-index:4;text-align:center;padding:24px}

/* ---- visão geral (resumo) sobre o mapa */
#resumo{position:absolute;left:16px;right:16px;top:14px;z-index:8;max-height:calc(100% - 28px);overflow-y:auto;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:start;gap:14px;padding:18px;border-radius:22px;
  background:color-mix(in srgb,var(--solid) 92%,transparent);backdrop-filter:blur(22px);border:1px solid var(--line2);box-shadow:0 30px 80px rgba(0,0,0,.45);
  transition:opacity .22s,transform .25s cubic-bezier(.2,.7,.2,1)}
#resumo.hide{opacity:0;transform:translateY(-14px);pointer-events:none;visibility:hidden}
#resumo>div{padding:16px 18px;border-radius:16px;border:1px solid var(--line);background:var(--card);animation:entra .4s both}
#resumo>div:nth-child(2){animation-delay:.05s}#resumo>div:nth-child(3){animation-delay:.1s}#resumo>div:nth-child(4){animation-delay:.15s}
#resumo h2{margin:0 0 10px;font:800 11px ui-monospace,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--mut);display:flex;align-items:center;gap:8px}
#resumo h2::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--cy);box-shadow:0 0 10px var(--cy)}
#resumo .faz h2::before{background:var(--acao);box-shadow:0 0 10px var(--acao)}
#resumo .naofaz h2::before{background:var(--alerta);box-shadow:0 0 10px var(--alerta)}
#resumo .modo{border-color:color-mix(in srgb,var(--trava) 45%,var(--line));background:color-mix(in srgb,var(--trava) 8%,var(--card))}
#resumo .modo h2::before{background:var(--trava);box-shadow:0 0 10px var(--trava)}
#resumo p{margin:0;font-size:13.5px;line-height:1.6;color:var(--ink2)}
#resumo ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}
#resumo li{position:relative;padding-left:20px;font-size:13px;line-height:1.5;color:var(--ink2)}
#resumo li::before{content:"";position:absolute;left:3px;top:.6em;width:6px;height:6px;border-radius:50%;background:var(--cy)}
#resumo .faz li::before{background:var(--acao)}#resumo .naofaz li::before{background:var(--alerta)}

/* ---- painel de detalhes do passo */
#panel{position:absolute;top:0;right:0;bottom:0;width:min(480px,100%);background:color-mix(in srgb,var(--solid) 94%,transparent);backdrop-filter:blur(22px);border-left:1px solid var(--line2);
  box-shadow:-24px 0 60px rgba(0,0,0,.4);transform:translateX(102%);transition:transform .3s cubic-bezier(.2,.7,.2,1);display:flex;flex-direction:column;z-index:6}
#panel.open{transform:none}
.panelBar{display:flex;justify-content:flex-end;padding:10px 12px 0}
#btnClose{border:1px solid var(--line);background:var(--card);border-radius:11px;width:34px;height:34px;font-size:19px;line-height:1;color:var(--ink2)}
#btnClose:hover{color:var(--ink);border-color:var(--line2)}
#panelBody{padding:4px 24px 30px;overflow-y:auto;flex:1}
.chipRow{display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap}
.chip{padding:3px 11px;border-radius:999px;font:800 10.5px ui-monospace,Consolas,monospace;letter-spacing:.1em;text-transform:uppercase;background:color-mix(in srgb,var(--c,var(--mut)) 16%,transparent);color:var(--c,var(--mut));border:1px solid color-mix(in srgb,var(--c,var(--mut)) 40%,transparent)}
.stepTag{font-size:12px;color:var(--mut);font-weight:700}.phaseTag{font-size:12px;color:var(--mut)}
.panelTitle{margin:4px 0 6px;font:800 23px/1.2 "Segoe UI Variable Display","Segoe UI",system-ui;letter-spacing:-.025em}
.panelLead{margin:0 0 16px;color:var(--ink2);line-height:1.55}
#panelBody .sec{margin:0 0 12px;padding:13px 15px;background:var(--card);border:1px solid var(--line);border-radius:14px}
#panelBody .sec h3{margin:0 0 5px;font:800 10.5px ui-monospace,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--mut)}
#panelBody .sec p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.55;color:var(--ink2)}
#panelBody .sec.rule{border-left:3px solid var(--cy)}
#panelBody .sec.example p{font-style:italic}
#panelBody .sec.fail{border-left:3px solid var(--trava)}
.links{display:flex;flex-direction:column;gap:6px;margin-top:8px}
.linkBtn{text-align:left;background:var(--card);border:1px solid var(--line);border-radius:11px;padding:8px 12px;font-size:13px;font-weight:600;color:var(--ink);transition:border-color .15s,transform .12s}
.linkBtn:hover{border-color:var(--cy);transform:translateX(2px)}
.tech{font-size:12.5px;color:var(--mut)}.tech summary{cursor:pointer;font-weight:700}
.tech p{margin:8px 0 0;overflow-wrap:anywhere;white-space:pre-wrap;font:12px ui-monospace,Menlo,Consolas,monospace}
.cfg{padding:12px 0;border-bottom:1px solid var(--line)}
.cfg code{font:12.5px ui-monospace,Menlo,Consolas,monospace;background:var(--card2);padding:2px 8px;border-radius:7px;color:var(--cy)}
.cfg p{margin:5px 0 0;color:var(--ink2);line-height:1.5}

/* ---- exemplo de conversa */
#convView{position:absolute;inset:0;background:var(--bg);display:none;z-index:3;overflow:hidden}
#convView.on{display:flex}
#convSide{width:290px;flex:none;border-right:1px solid var(--line);background:var(--nav);backdrop-filter:blur(14px);overflow-y:auto;padding:16px 12px}
#convSide h2{margin:0 0 10px;font:800 10.5px ui-monospace,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--mut);padding:0 4px}
.convPick{display:block;width:100%;text-align:left;margin:0 0 6px;padding:10px 12px;border-radius:12px;background:var(--card);border:1px solid var(--line);font-size:13px;font-weight:650;color:var(--ink2);transition:border-color .15s,background .15s,transform .12s}
.convPick:hover{border-color:var(--line2);color:var(--ink);transform:translateX(2px)}
.convPick.on{border-color:var(--cy);background:color-mix(in srgb,var(--cy) 10%,var(--card));color:var(--ink);box-shadow:0 0 0 1px var(--cy) inset}
#convMain{flex:1;overflow-y:auto;padding:22px 26px 44px}
.convHead{max-width:740px;margin:0 auto 14px}
.convHead h2{margin:0 0 4px;font:800 21px "Segoe UI Variable Display","Segoe UI",system-ui;letter-spacing:-.02em}
.convHead p{margin:0;color:var(--mut);font-size:13.5px}
.chat{max-width:740px;margin:0 auto;background:var(--chat-bg);border:1px solid var(--line);border-radius:22px;padding:18px 18px 22px;display:flex;flex-direction:column;gap:10px;box-shadow:var(--shadow)}
.msg{max-width:84%;display:flex;flex-direction:column;gap:4px;animation:entra .35s both}
.msg.paciente{align-self:flex-end;align-items:flex-end}
.msg.amanda{align-self:flex-start}
.bubble{padding:10px 14px;border-radius:16px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;line-height:1.5}
.msg.paciente .bubble{background:linear-gradient(135deg,var(--acc),var(--acc2));color:#fff;border-bottom-right-radius:5px;box-shadow:0 6px 18px color-mix(in srgb,var(--acc) 30%,transparent)}
.msg.amanda .bubble{background:var(--card2);border:1px solid var(--line);border-bottom-left-radius:5px}
.who{font:800 10px ui-monospace,Consolas,monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--mut)}
.etapaLink{border:0;background:transparent;padding:0;font-size:11.5px;font-weight:650;color:var(--cy);text-align:left}
.etapaLink:hover{text-decoration:underline}
.note{align-self:center;max-width:92%;text-align:center;font-size:12px;color:var(--ink2);background:color-mix(in srgb,var(--clinilink) 9%,transparent);border:1px dashed color-mix(in srgb,var(--clinilink) 50%,var(--line));border-radius:12px;padding:7px 12px}
.convFoot{max-width:740px;margin:12px auto 0;font-size:12px;color:var(--mut)}

#printRoot{display:none}

@media (max-width:1100px){#resumo{grid-template-columns:1fr}}
@media (max-width:760px){
  .fx-cab{padding:14px 14px 10px}.fx-cab .tela-h h1{font-size:22px}.fx-cab .tela-h p{display:none}
  .tela-ac .btn span{display:none}
  #legend,#phases{flex-wrap:nowrap;overflow-x:auto;width:100%;padding-bottom:2px}
  .legendItem,.legendWarn,.phaseBtn{white-space:nowrap;flex:none}
  #resumo{left:8px;right:8px;top:8px}
  #panel{top:auto;width:100%;height:64%;border-left:0;border-top:1px solid var(--line2);border-radius:20px 20px 0 0;transform:translateY(102%)}
  #panel.open{transform:none}
  .hint{display:none}.controls{bottom:10px;left:10px}
  body.panelOpen .controls{display:none}
  #convView.on{flex-direction:column}
  #convSide{width:100%;border-right:0;border-bottom:1px solid var(--line);max-height:30%}
  .msg{max-width:94%}
}
@media (prefers-reduced-motion:reduce){#world.anim,#panel,.node,#resumo{transition:none}.edge.hl{animation:none}}

/* ---- impressão: paisagem, fundo claro, mapa dividido em páginas legíveis */
@media print{
  @page{size:A4 landscape;margin:8mm}
  html,body{height:auto;overflow:visible;background:#fff;color:#111;display:block}
  body::before,body::after{display:none}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .app{display:none!important}
  #printRoot{display:block}
  .pgTitle{font-size:22px;margin:0 0 4px}
  .pgMeta{color:#444;font-size:12px;margin:0 0 10px}
  .pgPage{break-after:page;page-break-after:always}
  .pgPage:last-child{break-after:auto;page-break-after:auto}
  .pgH2{font-size:15px;margin:0 0 6px;color:#111}
  .pgSummary{display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:10px 18px;font-size:12.5px;line-height:1.4}
  .pgSummary h3{margin:0 0 3px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#555}
  .pgSummary p,.pgSummary ul{margin:0}.pgSummary ul{padding-left:16px}
  .mapClip{position:relative;overflow:hidden;border:1px solid #cfd3dc;border-radius:8px;background:#fff}
  .mapClip .node,.mapClip .band,.mapClip .edgeLabel{box-shadow:none;backdrop-filter:none}
  .mapClip .node{transition:none;transform:none;background:#fff}
  .mapClip .node::before{display:none}
  .mapClip .band{background:transparent}
  .mapClip .node.dim,.mapClip .edge.dim{opacity:1}
  .mapClip .edge.hl{animation:none;filter:none}
  .detGrid{columns:2;column-gap:20px}
  .det{break-inside:avoid;page-break-inside:avoid;border:1px solid #cfd3dc;border-left:4px solid var(--c,#555);border-radius:6px;padding:6px 9px;margin:0 0 8px;font-size:10.5px;line-height:1.35;background:#fff}
  .det h4{margin:0;font-size:12px}
  .det .ph{color:#555;font-size:10px;margin:0 0 3px}
  .det b{font-size:9.5px;letter-spacing:.05em;text-transform:uppercase;color:#555;display:block;margin-top:3px}
  .det span{white-space:pre-wrap;overflow-wrap:anywhere}
  .detCv{break-inside:avoid;margin:0 0 14px}
  .detCv h4{margin:0 0 4px;font-size:13px}
  .pgChat .msg{max-width:88%}
  .pgChat{background:#f3f1ea;border:1px solid #d8d4c8;border-radius:10px;padding:8px;display:flex;flex-direction:column;gap:5px;font-size:11px}
  .pgChat .bubble{font-size:11px;padding:5px 9px;box-shadow:none}
  .pgChat .etapaLink{display:none}
}
`;

const ic = (d: string) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const I = {
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 12l2-1-2-3-2 .5a7 7 0 0 0-1.5-1L15 5h-4l-.5 2.5a7 7 0 0 0-1.5 1L7 8l-2 3 2 1a7 7 0 0 0 0 2l-2 1 2 3 2-.5a7 7 0 0 0 1.5 1L11 21h4l.5-2.5a7 7 0 0 0 1.5-1l2 .5 2-3-2-1a7 7 0 0 0 0-2z',
  print: 'M7 8V3h10v5M7 17H4v-7h16v7h-3M7 14h10v7H7z',
};

const main = `
<section class="fx-cab">
  <div class="tela-h">
    <div>
      <div class="fx-eyebrow"><span class="verTag" id="verTag"></span><span class="verDate" id="verDate"></span><span class="modo-pill sombra" title="Esta tela só mostra o fluxo; não altera o agente"><i></i>somente visualização</span></div>
      <h1 id="title">Fluxo da Amanda</h1>
      <p>Cada passo da conversa, as regras que valem e o que acontece quando algo falha. Clique num passo para ver os detalhes.</p>
    </div>
    <div class="tela-ac">
      <button class="btn" id="btnResumo" type="button">${ic(I.eye)}<span>Visão geral</span></button>
      <button class="btn" id="btnFit" type="button">${ic(I.fit)}<span>Ver tudo</span></button>
      <button class="btn" id="btnConfig" type="button">${ic(I.gear)}<span>Configurações</span></button>
      <button class="btn pri" id="btnPrint" type="button">${ic(I.print)}<span>Imprimir / PDF</span></button>
    </div>
  </div>
  <div class="fx-barra">
    <div id="tabs" role="tablist">
      <button class="tab on" id="tabMapa" type="button" role="tab">Mapa do fluxo</button>
      <button class="tab" id="tabConversa" type="button" role="tab">Exemplo de conversa</button>
    </div>
    <div id="phases" aria-label="Ir para uma fase"></div>
  </div>
  <div class="fx-leg"><div id="legend" aria-label="Legenda de cores"></div></div>
</section>
<div class="fx-main" role="main">
  <section id="resumo" class="hide" aria-label="Visão geral do agente"></section>
  <div id="viewport">
    <div id="world"></div>
    <div id="loading">Carregando o fluxo...</div>
    <div class="controls noPan">
      <div class="zoomBox"><button id="zoomOut" type="button" aria-label="Diminuir zoom">−</button><span id="zoomPct">100%</span><button id="zoomIn" type="button" aria-label="Aumentar zoom">+</button></div>
      <div class="hint">Arraste para mover, role para dar zoom e clique num passo para ver as regras.</div>
    </div>
  </div>
  <div id="convView" aria-label="Exemplo de conversa">
    <div id="convSide"></div>
    <div id="convMain"></div>
  </div>
  <aside id="panel" aria-hidden="true" aria-label="Detalhes do passo">
    <div class="panelBar"><button id="btnClose" type="button" aria-label="Fechar">×</button></div>
    <div id="panelBody"></div>
  </aside>
</div>`;

export const pageHtml = paginaModulo({
  titulo: 'Fluxo da Amanda', modulo: 'receptivo', ativo: 'fluxo', main, css, scripts: ['/painel/receptivo/app.js'], depois: '<div id="printRoot"></div>',
});
