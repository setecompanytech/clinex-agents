// HTML + CSS do painel, embutidos como string (sem arquivos estáticos, sem build step, sem dependências externas).
// REGRAS deste arquivo: sem crases, sem "${" e sem barra invertida dentro do texto abaixo (é um template literal).
export const pageHtml = `<!doctype html>
<html lang="pt-BR" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>Fluxo da Amanda</title>
<link rel="icon" href="data:,">
<style>
:root {
  --bg: #f4f5f8; --grid: #d9dce5; --card: #ffffff; --card2: #f7f8fb; --text: #1b2030; --muted: #5d6579;
  --border: #dfe2ea; --shadow: 0 1px 2px rgba(20,25,45,.06), 0 6px 18px rgba(20,25,45,.07);
  --edge: #8b93a8; --edge-stop: #c08a2e; --edge-alert: #d62f45; --edge-gpt: #b32bc4; --edge-hl: #3b5bdb;
  --band: rgba(255,255,255,.55); --bandBorder: #dfe2ea;
  --gatilho: #7c4dff; --trava: #d9880b; --etapa: #2f66d9; --clinilink: #08959e; --gpt: #b32bc4; --alerta: #d62f45;
  --acao: #0f9d6e; --info: #5d6b82; --fim: #5f6b85;
  --panel: #ffffff; --sel: #3b5bdb; --label-bg: #ffffff;
  --chat-me: #dcf3e3; --chat-bg: #ece8df;
}
:root[data-theme="dark"] {
  --bg: #0f121a; --grid: #232838; --card: #1a1f2c; --card2: #202638; --text: #e8ebf3; --muted: #9aa3ba;
  --border: #2c3348; --shadow: 0 1px 2px rgba(0,0,0,.4), 0 8px 22px rgba(0,0,0,.35);
  --edge: #6f7894; --edge-stop: #d9a441; --edge-alert: #ff6b7e; --edge-gpt: #e07cf0; --edge-hl: #7f9bff;
  --band: rgba(255,255,255,.03); --bandBorder: #272d41;
  --gatilho: #a58bff; --trava: #f0a73a; --etapa: #6f9bff; --clinilink: #2fc9d1; --gpt: #e07cf0; --alerta: #ff6b7e;
  --acao: #3ed39b; --info: #9db0cc; --fim: #97a3c2;
  --panel: #171b27; --sel: #7f9bff; --label-bg: #1a1f2c;
  --chat-me: #1f4a35; --chat-bg: #161b26;
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body {
  background: var(--bg); color: var(--text); overflow: hidden;
  font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  display: flex; flex-direction: column;
}
button { font: inherit; color: inherit; cursor: pointer; }
header {
  padding: 8px 16px 7px; background: var(--card); border-bottom: 1px solid var(--border);
  display: flex; flex-direction: column; gap: 6px; z-index: 5;
}
.top { display: flex; align-items: center; gap: 12px; justify-content: space-between; flex-wrap: wrap; }
.titleBox { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
h1 { margin: 0; font-size: 18px; letter-spacing: -.01em; }
.sub { margin: 2px 0 0; color: var(--muted); font-size: 13px; max-width: 78ch; }
.badgeView { display: inline-block; margin-left: 8px; white-space: nowrap; padding: 1px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; background: var(--card2); color: var(--muted); border: 1px solid var(--border); vertical-align: 2px; }
.verTag { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 11.5px; font-weight: 700; background: color-mix(in srgb, var(--etapa) 14%, var(--card)); color: var(--etapa); border: 1px solid color-mix(in srgb, var(--etapa) 40%, var(--border)); }
.verDate { font-size: 12px; color: var(--muted); }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.btn { background: var(--card2); border: 1px solid var(--border); padding: 6px 12px; border-radius: 8px; font-size: 13px; }
.btn:hover { border-color: var(--sel); }
.btn.primary { background: var(--sel); color: #fff; border-color: var(--sel); }
:root[data-theme="dark"] .btn.primary { color: #0f121a; }
.row { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
#tabs { display: inline-flex; gap: 4px; padding: 3px; background: var(--card2); border: 1px solid var(--border); border-radius: 10px; }
.tab { border: 0; background: transparent; padding: 5px 14px; border-radius: 7px; font-size: 13px; font-weight: 600; color: var(--muted); }
.tab.on { background: var(--card); color: var(--text); box-shadow: 0 1px 3px rgba(20,25,45,.18); }
#legend, #phases { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.legendItem { display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px 2px 8px; border-radius: 999px; background: var(--card2); border: 1px solid var(--border); font-size: 12px; }
.legendItem .dot { width: 10px; height: 10px; border-radius: 50%; background: currentColor; }
.legendItem.on { border-color: currentColor; box-shadow: 0 0 0 1px currentColor inset; }
.legendItem span:last-child { color: var(--text); }
.legendWarn { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); margin-left: 6px; }
.phaseBtn { padding: 2px 9px; border-radius: 6px; border: 1px solid var(--border); background: transparent; font-size: 11.5px; color: var(--muted); }
.phaseBtn:hover { color: var(--text); border-color: var(--sel); }
.phaseBtn.alerta { color: var(--alerta); }
.phaseBtn.gpt { color: var(--gpt); }
.k-gatilho { --c: var(--gatilho); } .k-trava { --c: var(--trava); } .k-etapa { --c: var(--etapa); }
.k-clinilink { --c: var(--clinilink); } .k-gpt { --c: var(--gpt); } .k-alerta { --c: var(--alerta); }
.k-acao { --c: var(--acao); } .k-info { --c: var(--info); } .k-fim { --c: var(--fim); }
.legendItem { color: var(--c); }

/* resumo */
#resumo { background: var(--card); border-bottom: 1px solid var(--border); padding: 8px 16px 10px; display: grid; grid-template-columns: 1.15fr 1.45fr 1.3fr .9fr; gap: 10px 20px; font-size: 12px; line-height: 1.32; z-index: 4; }
#resumo.hide { display: none; }
#resumo h2 { margin: 0 0 3px; font-size: 11px; letter-spacing: .07em; text-transform: uppercase; color: var(--muted); }
#resumo p { margin: 0; }
#resumo ul { margin: 0; padding-left: 16px; }
#resumo li { margin: 0 0 1px; }
#resumo .faz h2 { color: var(--acao); }
#resumo .naofaz h2 { color: var(--alerta); }
#resumo .modo { background: color-mix(in srgb, var(--trava) 10%, var(--card2)); border: 1px solid color-mix(in srgb, var(--trava) 45%, var(--border)); border-radius: 10px; padding: 8px 10px; align-self: start; }
#resumo .modo h2 { color: var(--trava); }

main { position: relative; flex: 1; min-height: 0; }
#viewport {
  position: absolute; inset: 0; overflow: hidden; touch-action: none; cursor: grab; user-select: none; -webkit-user-select: none;
  background-image: radial-gradient(circle, var(--grid) 1.2px, transparent 1.4px); background-size: var(--grid, 28px) var(--grid, 28px);
}
#viewport.grabbing { cursor: grabbing; }
#world, .worldClone { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
#world { will-change: transform; }
#world.anim { transition: transform .4s cubic-bezier(.2,.7,.2,1); }
.band { position: absolute; border: 1px solid var(--bandBorder); background: var(--band); border-radius: 18px; pointer-events: none; }
.band-alerta { border-color: color-mix(in srgb, var(--alerta) 55%, var(--bandBorder)); background: color-mix(in srgb, var(--alerta) 5%, transparent); }
.band-gpt { border-color: color-mix(in srgb, var(--gpt) 55%, var(--bandBorder)); background: color-mix(in srgb, var(--gpt) 5%, transparent); }
.band-regras { border-color: color-mix(in srgb, var(--info) 55%, var(--bandBorder)); background: color-mix(in srgb, var(--info) 6%, transparent); }
.bandTitle { position: absolute; left: 22px; top: 14px; right: 16px; font-weight: 700; font-size: 17px; letter-spacing: -.01em; color: var(--text); opacity: .9; }
.band-alerta .bandSub { right: auto; max-width: 215px; }
.band-alerta .bandTitle { color: var(--alerta); } .band-gpt .bandTitle { color: var(--gpt); }
.bandSub { position: absolute; left: 22px; top: 38px; right: 16px; font-size: 12.5px; color: var(--muted); line-height: 1.3; }
svg.edges { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
.edge { fill: none; stroke: var(--edge); stroke-width: 2; }
.edge-stop { stroke: var(--edge-stop); stroke-dasharray: 6 5; }
.edge-alert { stroke: var(--edge-alert); stroke-width: 2.2; }
.edge-gpt { stroke: var(--edge-gpt); }
.edge.hl { stroke: var(--edge-hl); stroke-width: 3; stroke-dasharray: none; }
.edge.dim { opacity: .2; }
.arrow-main { fill: var(--edge); } .arrow-stop { fill: var(--edge-stop); } .arrow-alert { fill: var(--edge-alert); } .arrow-gpt { fill: var(--edge-gpt); } .arrow-hl { fill: var(--edge-hl); }
.edgeLabel {
  position: absolute; transform: translate(-50%, -50%); padding: 1px 8px; border-radius: 999px; font-size: 11.5px; font-weight: 600;
  background: var(--label-bg); border: 1px solid var(--border); color: var(--muted); white-space: nowrap; pointer-events: none;
}
.edgeLabel.stop { color: var(--edge-stop); border-color: color-mix(in srgb, var(--edge-stop) 45%, var(--border)); }
.edgeLabel.alert { color: var(--edge-alert); border-color: color-mix(in srgb, var(--edge-alert) 50%, var(--border)); }
.edgeLabel.gpt { color: var(--edge-gpt); border-color: color-mix(in srgb, var(--edge-gpt) 45%, var(--border)); }
.edgeLabel.hl { color: var(--edge-hl); border-color: var(--edge-hl); }
.edgeLabel.dim { opacity: .2; }

.node {
  position: absolute; background: var(--card); border: 1px solid var(--border); border-left: 5px solid var(--c);
  border-radius: 12px; padding: 8px 11px 7px 11px; box-shadow: var(--shadow); cursor: pointer; overflow: hidden;
  transition: box-shadow .15s, border-color .15s, opacity .2s, transform .15s;
}
.node:hover { border-color: var(--c); transform: translateY(-1px); }
.node:focus-visible { outline: 2px solid var(--sel); outline-offset: 2px; }
.node.sel { border-color: var(--sel); border-left-color: var(--c); box-shadow: 0 0 0 3px color-mix(in srgb, var(--sel) 30%, transparent), var(--shadow); }
.node.dim { opacity: .22; }
.node.k-alerta { background: color-mix(in srgb, var(--alerta) 6%, var(--card)); }
.nodeHead { display: flex; align-items: center; gap: 7px; margin-bottom: 2px; }
.badge { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px; background: var(--c); color: #fff; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
:root[data-theme="dark"] .badge { color: #0f121a; }
.kindLabel { font-size: 10.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--c); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.warn { margin-left: auto; flex: none; width: 17px; height: 17px; border-radius: 50%; border: 1.5px solid var(--trava); color: var(--trava); font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; line-height: 1; }
.legendWarn .warn { margin-left: 0; }
.nodeTitle { font-weight: 650; font-size: 13.2px; line-height: 1.22; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.nodeSub { margin-top: 2px; font-size: 11.8px; color: var(--muted); line-height: 1.28; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.node.end { border-radius: 999px; padding: 8px 16px 8px 16px; border-left-width: 1px; border-width: 1.5px; border-color: var(--c); background: color-mix(in srgb, var(--c) 9%, var(--card)); display: flex; flex-direction: column; justify-content: center; }
.node.end .nodeHead { display: none; }
.node.end .nodeTitle { font-size: 13px; }
.node.end .nodeSub { margin-top: 1px; font-size: 11.5px; -webkit-line-clamp: 2; }
.node.end.tone-ok { --c: var(--acao); } .node.end.tone-erro { --c: #d6455d; } .node.end.tone-sombra { --c: var(--trava); }
:root[data-theme="dark"] .node.end.tone-erro { --c: #ff7a8e; }

.controls { position: absolute; left: 14px; bottom: 14px; display: flex; flex-direction: column; gap: 6px; align-items: flex-start; z-index: 3; }
.zoomBox { display: flex; align-items: center; background: var(--card); border: 1px solid var(--border); border-radius: 10px; box-shadow: var(--shadow); overflow: hidden; }
.zoomBox button { border: 0; background: transparent; width: 36px; height: 34px; font-size: 18px; }
.zoomBox button:hover { background: var(--card2); }
.zoomBox span { min-width: 48px; text-align: center; font-size: 12px; color: var(--muted); }
.hint { font-size: 12px; color: var(--muted); background: color-mix(in srgb, var(--card) 85%, transparent); padding: 4px 10px; border-radius: 8px; border: 1px solid var(--border); max-width: 52ch; }
#loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--muted); z-index: 4; text-align: center; padding: 24px; }

#panel {
  position: absolute; top: 0; right: 0; bottom: 0; width: min(460px, 100%); background: var(--panel); border-left: 1px solid var(--border);
  box-shadow: -10px 0 30px rgba(10,15,30,.12); transform: translateX(102%); transition: transform .28s cubic-bezier(.2,.7,.2,1);
  display: flex; flex-direction: column; z-index: 6;
}
#panel.open { transform: none; }
.panelBar { display: flex; justify-content: flex-end; padding: 8px 10px 0; }
#btnClose { border: 0; background: var(--card2); border-radius: 8px; width: 32px; height: 32px; font-size: 18px; line-height: 1; }
#panelBody { padding: 4px 22px 28px; overflow-y: auto; flex: 1; }
.chipRow { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; flex-wrap: wrap; }
.chip { padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; background: color-mix(in srgb, var(--c, var(--muted)) 16%, transparent); color: var(--c, var(--muted)); }
.stepTag { font-size: 12px; color: var(--muted); font-weight: 600; }
.phaseTag { font-size: 12px; color: var(--muted); }
.panelTitle { margin: 4px 0 4px; font-size: 20px; line-height: 1.2; letter-spacing: -.01em; }
.panelLead { margin: 0 0 14px; color: var(--muted); }
.sec { margin: 0 0 14px; padding: 12px 14px; background: var(--card2); border: 1px solid var(--border); border-radius: 10px; }
.sec h3 { margin: 0 0 4px; font-size: 11.5px; letter-spacing: .07em; text-transform: uppercase; color: var(--muted); }
.sec p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.sec.rule { border-left: 4px solid var(--sel); }
.sec.example p { font-style: italic; }
.sec.fail { border-left: 4px solid var(--trava); }
.links { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
.linkBtn { text-align: left; background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; font-size: 13px; }
.linkBtn:hover { border-color: var(--sel); }
.tech { font-size: 12.5px; color: var(--muted); }
.tech summary { cursor: pointer; font-weight: 600; }
.tech p { margin: 6px 0 0; overflow-wrap: anywhere; white-space: pre-wrap; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; }
.cfg { padding: 10px 0; border-bottom: 1px solid var(--border); }
.cfg code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12.5px; background: var(--card2); padding: 1px 6px; border-radius: 5px; }
.cfg p { margin: 4px 0 0; color: var(--muted); }

/* exemplo de conversa */
#convView { position: absolute; inset: 0; background: var(--bg); display: none; z-index: 3; overflow: hidden; }
#convView.on { display: flex; }
#convSide { width: 280px; flex: none; border-right: 1px solid var(--border); background: var(--card); overflow-y: auto; padding: 14px 12px; }
#convSide h2 { margin: 0 0 8px; font-size: 11px; letter-spacing: .07em; text-transform: uppercase; color: var(--muted); }
.convPick { display: block; width: 100%; text-align: left; margin: 0 0 6px; padding: 8px 10px; border-radius: 10px; background: var(--card2); border: 1px solid var(--border); font-size: 13px; font-weight: 600; }
.convPick:hover { border-color: var(--sel); }
.convPick.on { border-color: var(--sel); box-shadow: 0 0 0 1px var(--sel) inset; }
#convMain { flex: 1; overflow-y: auto; padding: 18px 22px 40px; }
.convHead { max-width: 720px; margin: 0 auto 12px; }
.convHead h2 { margin: 0 0 4px; font-size: 18px; }
.convHead p { margin: 0; color: var(--muted); font-size: 13px; }
.chat { max-width: 720px; margin: 0 auto; background: var(--chat-bg); border: 1px solid var(--border); border-radius: 14px; padding: 14px 14px 18px; display: flex; flex-direction: column; gap: 8px; }
.msg { max-width: 82%; display: flex; flex-direction: column; gap: 3px; }
.msg.paciente { align-self: flex-end; align-items: flex-end; }
.msg.amanda { align-self: flex-start; }
.bubble { padding: 8px 12px; border-radius: 12px; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 14px; line-height: 1.4; box-shadow: 0 1px 1px rgba(0,0,0,.08); }
.msg.paciente .bubble { background: var(--chat-me); border-top-right-radius: 3px; }
.msg.amanda .bubble { background: var(--card); border-top-left-radius: 3px; }
.who { font-size: 11px; font-weight: 700; color: var(--muted); letter-spacing: .04em; text-transform: uppercase; }
.etapaLink { border: 0; background: transparent; padding: 0; font-size: 11.5px; color: var(--etapa); text-align: left; text-decoration: underline; }
.note { align-self: center; max-width: 92%; text-align: center; font-size: 12px; color: var(--muted); background: color-mix(in srgb, var(--clinilink) 10%, transparent); border: 1px dashed color-mix(in srgb, var(--clinilink) 45%, var(--border)); border-radius: 10px; padding: 5px 12px; }
.convFoot { max-width: 720px; margin: 10px auto 0; font-size: 12px; color: var(--muted); }

#printRoot { display: none; }

@media (max-width: 1100px) {
  #resumo { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 760px) {
  header { padding: 10px 12px 8px; }
  h1 { font-size: 16px; }
  .sub { display: none; }
  #legend { flex-wrap: nowrap; overflow-x: auto; width: 100%; padding-bottom: 2px; }
  .legendItem, .legendWarn { white-space: nowrap; flex: none; }
  #phases { flex-wrap: nowrap; overflow-x: auto; width: 100%; padding-bottom: 2px; }
  .phaseBtn { white-space: nowrap; flex: none; }
  #resumo { grid-template-columns: 1fr; max-height: 38vh; overflow-y: auto; }
  #panel { top: auto; width: 100%; height: 62%; border-left: 0; border-top: 1px solid var(--border); border-radius: 16px 16px 0 0; transform: translateY(102%); box-shadow: 0 -10px 30px rgba(10,15,30,.18); }
  #panel.open { transform: none; }
  .hint { display: none; }
  .controls { bottom: 10px; left: 10px; }
  body.panelOpen .controls { display: none; }
  #convView.on { flex-direction: column; }
  #convSide { width: 100%; border-right: 0; border-bottom: 1px solid var(--border); max-height: 30%; }
  .msg { max-width: 94%; }
}
@media (prefers-reduced-motion: reduce) { #world.anim, #panel, .node { transition: none; } }

/* impressão: paisagem, fundo claro, mapa dividido em páginas legíveis */
@media print {
  @page { size: A4 landscape; margin: 8mm; }
  html, body { height: auto; overflow: visible; background: #fff; color: #111; display: block; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  header, #resumo, main { display: none !important; }
  #printRoot { display: block; }
  .pgTitle { font-size: 22px; margin: 0 0 4px; }
  .pgMeta { color: #444; font-size: 12px; margin: 0 0 10px; }
  .pgPage { break-after: page; page-break-after: always; }
  .pgPage:last-child { break-after: auto; page-break-after: auto; }
  .pgH2 { font-size: 15px; margin: 0 0 6px; color: #111; }
  .pgSummary { display: grid; grid-template-columns: 1.3fr 1fr 1fr; gap: 10px 18px; font-size: 12.5px; line-height: 1.4; }
  .pgSummary h3 { margin: 0 0 3px; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: #555; }
  .pgSummary p, .pgSummary ul { margin: 0; } .pgSummary ul { padding-left: 16px; }
  .mapClip { position: relative; overflow: hidden; border: 1px solid #cfd3dc; border-radius: 8px; background: #fff; }
  .mapClip .node, .mapClip .band, .mapClip .edgeLabel { box-shadow: none; }
  .mapClip .node { transition: none; transform: none; }
  .mapClip .band { background: transparent; }
  .mapClip .node.dim, .mapClip .edge.dim { opacity: 1; }
  .detGrid { columns: 2; column-gap: 20px; }
  .det { break-inside: avoid; page-break-inside: avoid; border: 1px solid #cfd3dc; border-left: 4px solid var(--c, #555); border-radius: 6px; padding: 6px 9px; margin: 0 0 8px; font-size: 10.5px; line-height: 1.35; }
  .det h4 { margin: 0; font-size: 12px; }
  .det .ph { color: #555; font-size: 10px; margin: 0 0 3px; }
  .det b { font-size: 9.5px; letter-spacing: .05em; text-transform: uppercase; color: #555; display: block; margin-top: 3px; }
  .det span { white-space: pre-wrap; overflow-wrap: anywhere; }
  .detCv { break-inside: avoid; margin: 0 0 14px; }
  .detCv h4 { margin: 0 0 4px; font-size: 13px; }
  .pgChat .msg { max-width: 88%; }
  .pgChat { background: #f3f1ea; border: 1px solid #d8d4c8; border-radius: 10px; padding: 8px; display: flex; flex-direction: column; gap: 5px; font-size: 11px; }
  .pgChat .bubble { font-size: 11px; padding: 5px 9px; box-shadow: none; }
  .pgChat .etapaLink { display: none; }
}
</style>
</head>
<body>
<header>
  <div class="top">
    <div class="titleBox">
      <h1><span id="title">Fluxo da Amanda</span><span class="badgeView">somente visualização</span></h1>
      <span class="verTag" id="verTag"></span><span class="verDate" id="verDate"></span>
    </div>
    <div class="actions">
      <a class="btn" id="btnLogs" href="/painel/logs" style="text-decoration:none;display:inline-flex;align-items:center">Logs</a>
      <button class="btn" id="btnResumo" type="button">Ocultar resumo</button>
      <button class="btn" id="btnFit" type="button">Ver tudo</button>
      <button class="btn" id="btnConfig" type="button">Configurações</button>
      <button class="btn primary" id="btnPrint" type="button">Imprimir / salvar em PDF</button>
      <button class="btn" id="btnTheme" type="button">Tema escuro</button>
    </div>
  </div>
  <div class="row">
    <div id="tabs" role="tablist">
      <button class="tab on" id="tabMapa" type="button" role="tab">Mapa do fluxo</button>
      <button class="tab" id="tabConversa" type="button" role="tab">Exemplo de conversa</button>
    </div>
    <div id="phases" aria-label="Ir para uma fase"></div>
  </div>
  <div class="row"><div id="legend" aria-label="Legenda de cores"></div></div>
</header>
<section id="resumo" aria-label="Resumo do agente"></section>
<main>
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
</main>
<div id="printRoot"></div>
<script src="/painel/app.js"></script>
</body>
</html>`;
