// HTML + CSS do painel, embutidos como string (sem arquivos estáticos, sem build step, sem dependências externas).
export const pageHtml = `<!doctype html>
<html lang="pt-BR" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>Fluxo do Agente</title>
<style>
:root {
  --bg: #f4f5f8; --grid: #d9dce5; --card: #ffffff; --card2: #f7f8fb; --text: #1b2030; --muted: #5d6579;
  --border: #dfe2ea; --shadow: 0 1px 2px rgba(20,25,45,.06), 0 6px 18px rgba(20,25,45,.07);
  --edge: #8b93a8; --edge-stop: #c08a2e; --edge-hl: #3b5bdb; --band: rgba(255,255,255,.55); --bandBorder: #dfe2ea;
  --gatilho: #7c4dff; --trava: #d9880b; --leitura: #0b8fd1; --ia: #d6336c; --acao: #0f9d6e; --fim: #5f6b85;
  --panel: #ffffff; --sel: #3b5bdb; --label-bg: #ffffff;
}
:root[data-theme="dark"] {
  --bg: #0f121a; --grid: #232838; --card: #1a1f2c; --card2: #202638; --text: #e8ebf3; --muted: #9aa3ba;
  --border: #2c3348; --shadow: 0 1px 2px rgba(0,0,0,.4), 0 8px 22px rgba(0,0,0,.35);
  --edge: #6f7894; --edge-stop: #d9a441; --edge-hl: #7f9bff; --band: rgba(255,255,255,.03); --bandBorder: #272d41;
  --gatilho: #a58bff; --trava: #f0a73a; --leitura: #4cb5f0; --ia: #f06595; --acao: #3ed39b; --fim: #97a3c2;
  --panel: #171b27; --sel: #7f9bff; --label-bg: #1a1f2c;
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
  padding: 12px 16px 10px; background: var(--card); border-bottom: 1px solid var(--border);
  display: flex; flex-direction: column; gap: 10px; z-index: 5;
}
.top { display: flex; align-items: flex-start; gap: 12px; justify-content: space-between; flex-wrap: wrap; }
h1 { margin: 0; font-size: 18px; letter-spacing: -.01em; }
.sub { margin: 2px 0 0; color: var(--muted); font-size: 13px; max-width: 70ch; }
.badgeView { display: inline-block; margin-left: 8px; padding: 1px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; background: var(--card2); color: var(--muted); border: 1px solid var(--border); vertical-align: 2px; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.btn { background: var(--card2); border: 1px solid var(--border); padding: 6px 12px; border-radius: 8px; font-size: 13px; }
.btn:hover { border-color: var(--sel); }
.row { display: flex; gap: 14px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
#legend, #phases { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.legendItem { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px 3px 8px; border-radius: 999px; background: var(--card2); border: 1px solid var(--border); font-size: 12px; }
.legendItem .dot { width: 10px; height: 10px; border-radius: 50%; background: currentColor; }
.legendItem.on { border-color: currentColor; box-shadow: 0 0 0 1px currentColor inset; }
.legendItem span:last-child { color: var(--text); }
.legendWarn { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); margin-left: 6px; }
.phaseBtn { padding: 3px 10px; border-radius: 6px; border: 1px solid var(--border); background: transparent; font-size: 12px; color: var(--muted); }
.phaseBtn:hover { color: var(--text); border-color: var(--sel); }
.k-gatilho { --c: var(--gatilho); } .k-trava { --c: var(--trava); } .k-leitura { --c: var(--leitura); }
.k-ia { --c: var(--ia); } .k-acao { --c: var(--acao); } .k-fim { --c: var(--fim); }
.legendItem { color: var(--c); }

main { position: relative; flex: 1; min-height: 0; }
#viewport {
  position: absolute; inset: 0; overflow: hidden; touch-action: none; cursor: grab; user-select: none; -webkit-user-select: none;
  background-image: radial-gradient(circle, var(--grid) 1.2px, transparent 1.4px); background-size: var(--grid, 28px) var(--grid, 28px);
}
#viewport.grabbing { cursor: grabbing; }
#world { position: absolute; left: 0; top: 0; transform-origin: 0 0; will-change: transform; }
#world.anim { transition: transform .4s cubic-bezier(.2,.7,.2,1); }
.band { position: absolute; border: 1px solid var(--bandBorder); background: var(--band); border-radius: 18px; pointer-events: none; }
.bandTitle { position: absolute; left: 22px; top: 14px; font-weight: 700; font-size: 17px; letter-spacing: -.01em; color: var(--text); opacity: .85; }
.bandSub { position: absolute; left: 22px; top: 38px; font-size: 12.5px; color: var(--muted); max-width: 90%; }
svg.edges { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
.edge { fill: none; stroke: var(--edge); stroke-width: 2; }
.edge-stop { stroke: var(--edge-stop); stroke-dasharray: 6 5; }
.edge.hl { stroke: var(--edge-hl); stroke-width: 3; stroke-dasharray: none; }
.edge.dim { opacity: .2; }
.arrow-main { fill: var(--edge); } .arrow-stop { fill: var(--edge-stop); } .arrow-hl { fill: var(--edge-hl); }
.edgeLabel {
  position: absolute; transform: translate(-50%, -50%); padding: 1px 8px; border-radius: 999px; font-size: 11.5px; font-weight: 600;
  background: var(--label-bg); border: 1px solid var(--border); color: var(--muted); white-space: nowrap; pointer-events: none;
}
.edgeLabel.stop { color: var(--edge-stop); border-color: color-mix(in srgb, var(--edge-stop) 45%, var(--border)); }
.edgeLabel.hl { color: var(--edge-hl); border-color: var(--edge-hl); }
.edgeLabel.dim { opacity: .2; }

.node {
  position: absolute; background: var(--card); border: 1px solid var(--border); border-left: 5px solid var(--c);
  border-radius: 12px; padding: 9px 12px 8px 11px; box-shadow: var(--shadow); cursor: pointer; overflow: hidden;
  transition: box-shadow .15s, border-color .15s, opacity .2s, transform .15s;
}
.node:hover { border-color: var(--c); transform: translateY(-1px); }
.node:focus-visible { outline: 2px solid var(--sel); outline-offset: 2px; }
.node.sel { border-color: var(--sel); border-left-color: var(--c); box-shadow: 0 0 0 3px color-mix(in srgb, var(--sel) 30%, transparent), var(--shadow); }
.node.dim { opacity: .22; }
.nodeHead { display: flex; align-items: center; gap: 7px; margin-bottom: 3px; }
.badge { min-width: 20px; height: 20px; padding: 0 5px; border-radius: 10px; background: var(--c); color: #fff; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
:root[data-theme="dark"] .badge { color: #0f121a; }
.kindLabel { font-size: 10.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--c); }
.warn { margin-left: auto; width: 17px; height: 17px; border-radius: 50%; border: 1.5px solid var(--trava); color: var(--trava); font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; line-height: 1; }
.legendWarn .warn { margin-left: 0; }
.nodeTitle { font-weight: 650; font-size: 13.5px; line-height: 1.25; }
.nodeSub { margin-top: 3px; font-size: 12px; color: var(--muted); line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.node.end { border-radius: 999px; padding: 8px 16px 8px 16px; border-left-width: 1px; border-width: 1.5px; border-color: var(--c); background: color-mix(in srgb, var(--c) 9%, var(--card)); display: flex; flex-direction: column; justify-content: center; }
.node.end .nodeHead { display: none; }
.node.end .nodeTitle { font-size: 13px; }
.node.end .nodeSub { margin-top: 1px; font-size: 11.5px; -webkit-line-clamp: 1; }
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
  position: absolute; top: 0; right: 0; bottom: 0; width: min(440px, 100%); background: var(--panel); border-left: 1px solid var(--border);
  box-shadow: -10px 0 30px rgba(10,15,30,.12); transform: translateX(102%); transition: transform .28s cubic-bezier(.2,.7,.2,1);
  display: flex; flex-direction: column; z-index: 6;
}
#panel.open { transform: none; }
.panelBar { display: flex; justify-content: flex-end; padding: 8px 10px 0; }
#btnClose { border: 0; background: var(--card2); border-radius: 8px; width: 32px; height: 32px; font-size: 18px; line-height: 1; }
#panelBody { padding: 4px 22px 28px; overflow-y: auto; flex: 1; }
.chipRow { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
.chip { padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; background: color-mix(in srgb, var(--c, var(--muted)) 16%, transparent); color: var(--c, var(--muted)); }
.stepTag { font-size: 12px; color: var(--muted); font-weight: 600; }
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
.tech summary { cursor: pointer; }
.tech p { margin: 6px 0 0; overflow-wrap: anywhere; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; }
.cfg { padding: 10px 0; border-bottom: 1px solid var(--border); }
.cfg code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12.5px; background: var(--card2); padding: 1px 6px; border-radius: 5px; }
.cfg p { margin: 4px 0 0; color: var(--muted); }

@media (max-width: 760px) {
  header { padding: 10px 12px 8px; }
  h1 { font-size: 16px; }
  .sub { display: none; }
  #legend { flex-wrap: nowrap; overflow-x: auto; width: 100%; padding-bottom: 2px; }
  .legendItem, .legendWarn { white-space: nowrap; flex: none; }
  #phases { flex-wrap: nowrap; overflow-x: auto; width: 100%; padding-bottom: 2px; }
  .phaseBtn { white-space: nowrap; }
  #panel { top: auto; width: 100%; height: 62%; border-left: 0; border-top: 1px solid var(--border); border-radius: 16px 16px 0 0; transform: translateY(102%); box-shadow: 0 -10px 30px rgba(10,15,30,.18); }
  #panel.open { transform: none; }
  .hint { display: none; }
  .controls { bottom: 10px; left: 10px; }
  body.panelOpen .controls { display: none; }
}
@media (prefers-reduced-motion: reduce) { #world.anim, #panel, .node { transition: none; } }
</style>
</head>
<body>
<header>
  <div class="top">
    <div>
      <h1><span id="title">Fluxo do agente</span><span class="badgeView">somente visualização</span></h1>
      <p class="sub" id="subtitle"></p>
    </div>
    <div class="actions">
      <button class="btn" id="btnFit" type="button">Ver tudo</button>
      <button class="btn" id="btnConfig" type="button">Configurações</button>
      <button class="btn" id="btnTheme" type="button">Tema escuro</button>
    </div>
  </div>
  <div class="row">
    <div id="legend" aria-label="Legenda de cores"></div>
    <div id="phases" aria-label="Ir para uma fase"></div>
  </div>
</header>
<main>
  <div id="viewport">
    <div id="world"></div>
    <div id="loading">Carregando o fluxo...</div>
    <div class="controls noPan">
      <div class="zoomBox"><button id="zoomOut" type="button" aria-label="Diminuir zoom">−</button><span id="zoomPct">100%</span><button id="zoomIn" type="button" aria-label="Aumentar zoom">+</button></div>
      <div class="hint">Arraste para mover, role para dar zoom e clique num passo para ver os detalhes.</div>
    </div>
  </div>
  <aside id="panel" aria-hidden="true" aria-label="Detalhes do passo">
    <div class="panelBar"><button id="btnClose" type="button" aria-label="Fechar">×</button></div>
    <div id="panelBody"></div>
  </aside>
</main>
<script src="/painel/app.js"></script>
</body>
</html>`;
