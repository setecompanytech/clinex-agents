/**
 * Extras do Agente Clinex em tela cheia: cartões de confirmação das ações, artefatos (documento, planilha, painel, mensagem),
 * voz (gravar e falar) e o MODO CONVERSA (tela imersiva, mãos livres). O JS entra dentro do mesmo fechamento de assistente.ts
 * (usa E, el, h, ico, chamar, salvar...). Dentro dos textos de JS não usar crases nem "dollar-chave".
 */

export const assistenteExtrasCss = `
/* ---- cartões de ação (confirmar antes de mudar o sistema) */
.as-acao{margin-top:14px;max-width:560px;border-radius:18px;border:1px solid color-mix(in srgb,var(--cy) 40%,var(--line));background:linear-gradient(160deg,color-mix(in srgb,var(--cy) 9%,var(--card)),var(--card));overflow:hidden;animation:asEntra .4s both}
.as-acao.alto{border-color:color-mix(in srgb,var(--warn) 60%,var(--line));background:linear-gradient(160deg,color-mix(in srgb,var(--warn) 10%,var(--card)),var(--card))}
.as-acao.feito{border-color:color-mix(in srgb,var(--ok) 55%,var(--line))}.as-acao.erro{border-color:color-mix(in srgb,var(--bad) 55%,var(--line))}.as-acao.cancelado{opacity:.6}
.as-acao-h{display:flex;align-items:center;gap:10px;padding:13px 16px 6px}.as-acao-h b{flex:1;font-size:15px}
.as-acao-i{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;background:color-mix(in srgb,var(--cy) 18%,transparent);color:var(--cy)}.as-acao.alto .as-acao-i{background:color-mix(in srgb,var(--warn) 20%,transparent);color:var(--warn)}.as-acao.feito .as-acao-i{background:color-mix(in srgb,var(--ok) 20%,transparent);color:var(--ok)}.as-acao.erro .as-acao-i{background:color-mix(in srgb,var(--bad) 20%,transparent);color:var(--bad)}
.as-risco{font:800 10px ui-monospace,Consolas,monospace;letter-spacing:.1em;text-transform:uppercase;padding:3px 9px;border-radius:999px;color:var(--warn);border:1px solid color-mix(in srgb,var(--warn) 55%,transparent)}
.as-acao ul{list-style:none;margin:0;padding:4px 16px 10px;display:flex;flex-direction:column;gap:3px;font-size:13.5px;color:var(--ink2)}
.as-acao li:before{content:"";display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--mut);margin-right:9px;vertical-align:middle}
.as-acao-f{display:flex;align-items:center;gap:10px;padding:10px 16px 14px;flex-wrap:wrap}.as-acao-f .st{font-size:13px;color:var(--ink2)}.as-acao.feito .st{color:var(--ok)}.as-acao.erro .st{color:var(--bad)}
.as-btn{display:inline-flex;align-items:center;gap:7px;padding:8px 16px;border-radius:11px;border:1px solid var(--line2);background:var(--card2);color:var(--ink);font-weight:700;font-size:13.5px;cursor:pointer;transition:transform .15s,border-color .2s,background .2s}.as-btn:hover:not(:disabled){border-color:var(--cy);transform:translateY(-1px)}.as-btn:disabled{opacity:.55;cursor:wait}
.as-btn.pri{border:0;color:#fff;background:linear-gradient(135deg,var(--acc),var(--acc2));box-shadow:var(--glow)}.as-btn.pri:hover:not(:disabled){filter:brightness(1.1)}
.as-gira{width:15px;height:15px;border-radius:50%;border:2px solid var(--line2);border-top-color:var(--cy);animation:asGira .8s linear infinite}@keyframes asGira{to{transform:rotate(360deg)}}
/* ---- cartões de artefato e o painel de leitura */
.as-arts{display:flex;flex-direction:column;gap:8px;margin-top:14px;max-width:560px}
.as-art-c{display:flex;align-items:center;gap:13px;width:100%;padding:12px 14px;border-radius:16px;border:1px solid var(--line);background:var(--card);color:var(--ink);text-align:left;cursor:pointer;transition:transform .2s,border-color .2s,background .2s;animation:asEntra .4s both}
.as-art-c:hover{border-color:var(--cy);transform:translateX(4px);background:var(--card2)}
.as-art-ic{flex:none;width:42px;height:42px;border-radius:13px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,var(--acc),var(--acc2));box-shadow:var(--glow)}
.as-art-c.planilha .as-art-ic{background:linear-gradient(135deg,#14b87a,#2dd4a8)}.as-art-c.painel .as-art-ic{background:linear-gradient(135deg,#4cc9f0,#7c5cff)}.as-art-c.mensagem .as-art-ic{background:linear-gradient(135deg,#25d366,#128c7e)}
.as-art-c b{display:block;font-size:14.5px}.as-art-c small{color:var(--mut);font-size:12px}.as-art-c>span:nth-child(2){flex:1;min-width:0}.as-art-c>svg{color:var(--mut)}
.as-pan{position:fixed;inset:0;z-index:90;display:flex;justify-content:flex-end;background:rgba(4,6,12,.62);backdrop-filter:blur(5px);animation:asFade .25s both}@keyframes asFade{from{opacity:0}}
.as-pan-c{display:flex;flex-direction:column;width:min(980px,100vw);height:100%;background:var(--solid);border-left:1px solid var(--line2);box-shadow:-30px 0 80px rgba(0,0,0,.5);animation:asPainel .35s cubic-bezier(.2,.8,.2,1) both}@keyframes asPainel{from{transform:translateX(60px);opacity:0}}
.as-pan-h{display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid var(--line);flex-wrap:wrap}.as-pan-h .as-art-ic{width:38px;height:38px;border-radius:12px}.as-pan-t{flex:1;min-width:160px}.as-pan-t b{display:block;font-size:16px}.as-pan-t small{color:var(--mut);font-size:12px}
.as-pan-ac{display:flex;gap:8px;flex-wrap:wrap}.as-pan-b{flex:1;min-height:0;overflow:auto;padding:26px 30px 40px}
.as-doc{max-width:760px;margin:0 auto;font-size:15.5px;line-height:1.75;color:var(--ink)}.as-doc h2{font-size:26px;margin:0 0 14px;letter-spacing:-.02em}.as-doc h3{font-size:19px;margin:26px 0 8px}.as-doc h4,.as-doc h5{font-size:16px;margin:20px 0 6px}.as-doc p{margin:0 0 12px}.as-doc ul,.as-doc ol{margin:0 0 14px;padding-left:22px}.as-doc li{margin:3px 0}.as-doc blockquote{margin:12px 0;padding:8px 16px;border-left:3px solid var(--cy);background:var(--card);border-radius:0 10px 10px 0;color:var(--ink2)}.as-doc hr{border:0;border-top:1px solid var(--line);margin:22px 0}.as-doc code{font:13px ui-monospace,Consolas,monospace;background:var(--card2);padding:1px 6px;border-radius:6px}
.as-doc table,.as-plan table{width:100%;border-collapse:collapse;margin:12px 0 18px;font-size:14px}.as-doc th,.as-doc td,.as-plan th,.as-plan td{padding:8px 12px;border-bottom:1px solid var(--line);text-align:left}.as-doc th,.as-plan th{font-weight:700;color:var(--ink);background:var(--card)}
.as-plan{overflow:auto;border:1px solid var(--line);border-radius:14px}.as-plan table{margin:0;white-space:nowrap}.as-plan th{position:sticky;top:0;z-index:1}.as-plan tr:nth-child(even) td{background:color-mix(in srgb,var(--card) 55%,transparent)}.as-plan td.n{text-align:right;font-variant-numeric:tabular-nums}
.as-plan-n{color:var(--mut);font-size:12.5px;margin:10px 2px 0}
.as-pan-ifr{width:100%;height:100%;min-height:560px;border:1px solid var(--line);border-radius:14px;background:#fff}
.as-msg-zap{max-width:520px;margin:0 auto;padding:18px;border-radius:18px;background:#0b141a;background-image:radial-gradient(rgba(255,255,255,.04) 1px,transparent 1px);background-size:14px 14px}.as-msg-zap p{margin:0;padding:11px 14px 8px;border-radius:0 14px 14px 14px;background:#202c33;color:#e9edef;font-size:15px;line-height:1.55;white-space:pre-wrap}
/* ---- voz: microfone, alto-falante e Modo conversa */
.as-mic{position:relative;flex:none;width:42px;height:42px;border-radius:13px;border:1px solid var(--line2);background:var(--card2);color:var(--ink2);display:grid;place-items:center;cursor:pointer;transition:transform .15s,border-color .2s,color .2s}.as-mic:hover{border-color:var(--cy);color:var(--cy)}
.as-mic.rec{border-color:var(--bad);color:#fff;background:var(--bad);animation:asRec 1.3s ease-out infinite}.as-mic.trans{border-color:var(--cy);color:var(--cy)}.as-mic.trans svg{display:none}.as-mic.trans:after{content:"";width:16px;height:16px;border-radius:50%;border:2px solid var(--line2);border-top-color:var(--cy);animation:asGira .8s linear infinite}
@keyframes asRec{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--bad) 60%,transparent)}100%{box-shadow:0 0 0 14px transparent}}
.as-gravando{display:none;align-items:center;gap:10px;margin:0 4px 8px;padding:8px 14px;border-radius:12px;background:color-mix(in srgb,var(--bad) 10%,var(--card));border:1px solid color-mix(in srgb,var(--bad) 40%,var(--line));font-size:13px;color:var(--ink2)}.as-gravando.on{display:flex}.as-gravando i{width:9px;height:9px;border-radius:50%;background:var(--bad);animation:asVivo 1s infinite}.as-gravando .niv{flex:1;height:6px;border-radius:9px;background:var(--line);overflow:hidden}.as-gravando .niv b{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--cy),var(--bad));transition:width .08s}
.as-ic.falando{color:var(--ok)}.as-topo-ac{display:flex;gap:8px;align-items:center}.as-chip-b{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 13px;border-radius:11px;border:1px solid var(--line);background:var(--card);color:var(--ink2);font-weight:700;font-size:13px;cursor:pointer;transition:all .2s}.as-chip-b:hover{border-color:var(--cy);color:var(--ink)}.as-chip-b.on{border-color:var(--ok);color:var(--ok);background:color-mix(in srgb,var(--ok) 10%,var(--card))}
.as-chip-b.conv{border:0;color:#fff;background:linear-gradient(135deg,var(--acc),var(--acc2));box-shadow:var(--glow)}.as-chip-b.conv:hover{filter:brightness(1.1)}
.as-perm{margin:14px auto 0;max-width:560px;font-size:12.5px;line-height:1.55;color:var(--mut);text-align:center}.as-perm b{color:var(--ink2)}
.cv{position:fixed;inset:0;z-index:100;display:flex;flex-direction:column;color:var(--ink);background:radial-gradient(1200px 700px at 50% 30%,color-mix(in srgb,var(--cvc,var(--cy)) 14%,#060913),#04060c 70%);animation:asFade .35s both;overflow:hidden}
.cv-top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 26px;position:relative;z-index:2}.cv-top b{font:800 12px ui-monospace,Consolas,monospace;letter-spacing:.2em;color:var(--mut)}.cv-top .as-btn{background:rgba(255,255,255,.06)}
.cv-meio{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;padding:0 24px;position:relative;z-index:1;text-align:center}
.cv-orbe{position:relative;width:min(290px,60vw);aspect-ratio:1;border:0;background:none;padding:0;cursor:pointer;color:var(--cvc,var(--cy));border-radius:50%;display:grid;place-items:center;--n:0}.cv-orbe:focus-visible{outline:3px solid var(--cy);outline-offset:8px}
.cv-nucleo{position:relative;z-index:2;width:58%;aspect-ratio:1;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 28%,rgba(255,255,255,.18),transparent 55%),linear-gradient(160deg,#10172a,#05070f);border:2px solid var(--cvc,var(--cy));box-shadow:0 0 0 8px color-mix(in srgb,var(--cvc,var(--cy)) 12%,transparent),0 0 60px color-mix(in srgb,var(--cvc,var(--cy)) 45%,transparent),inset 0 0 30px color-mix(in srgb,var(--cvc,var(--cy)) 18%,transparent);transform:scale(calc(1 + var(--n)*.16));transition:transform .09s linear,border-color .4s,box-shadow .4s}
.cv-nucleo svg{filter:drop-shadow(0 0 10px color-mix(in srgb,var(--cvc,var(--cy)) 70%,transparent))}
.cv-anel{position:absolute;inset:0;border-radius:50%;border:2px dashed color-mix(in srgb,var(--cvc,var(--cy)) 40%,transparent);animation:mgSpin 26s linear infinite}.cv-anel.b{inset:9%;border-style:solid;border-width:1px;border-color:color-mix(in srgb,var(--cvc,var(--cy)) 24%,transparent);animation-duration:38s;animation-direction:reverse}
@keyframes mgSpin{to{transform:rotate(360deg)}}
.cv-onda{position:absolute;inset:16%;border-radius:50%;border:2px solid var(--cvc,var(--cy));opacity:0}
.cv.falando .cv-onda{animation:cvOnda 2.6s ease-out infinite}.cv.falando .cv-onda.o2{animation-delay:.85s}.cv.falando .cv-onda.o3{animation-delay:1.7s}.cv.ouvindo .cv-onda{animation:cvOnda 3.4s ease-out infinite}.cv.ouvindo .cv-onda.o2{animation-delay:1.1s}.cv.ouvindo .cv-onda.o3{animation-delay:2.2s}
@keyframes cvOnda{0%{opacity:.6;transform:scale(.7)}100%{opacity:0;transform:scale(1.5)}}
.cv.pensando .cv-anel{animation-duration:3s}.cv.pensando .cv-nucleo{animation:cvPensa 1.4s ease-in-out infinite}@keyframes cvPensa{50%{transform:scale(.94)}}
.cv.ocioso .cv-nucleo{opacity:.8}
.cv-est{font:800 12px ui-monospace,Consolas,monospace;letter-spacing:.22em;color:var(--cvc,var(--cy));text-transform:uppercase}
.cv-fala{max-width:760px;min-height:92px;display:flex;flex-direction:column;gap:10px}.cv-u{font-size:17px;color:var(--mut)}.cv-a{font-size:21px;line-height:1.5;font-weight:600;letter-spacing:-.01em}
.cv-extra{display:flex;flex-direction:column;gap:10px;align-items:center;width:min(580px,92vw);max-height:30vh;overflow:auto;text-align:left}.cv-extra .as-acao,.cv-extra .as-arts{margin-top:0;width:100%}
.cv-base{display:flex;align-items:center;justify-content:center;gap:14px;padding:16px 26px 28px;position:relative;z-index:2;flex-wrap:wrap}.cv-base .as-btn{background:rgba(255,255,255,.06)}.cv-base .as-btn.on{border-color:var(--ok);color:var(--ok)}
.cv-dica{color:var(--mut);font-size:12.5px;text-align:center;padding-bottom:6px}
@media(max-width:760px){.as-pan-b{padding:18px 16px 30px}.as-topo-ac .as-chip-b span{display:none}.cv-a{font-size:18px}}
@media (prefers-reduced-motion:reduce){.cv *,.as-mic,.as-pan-c{animation:none!important;transition:none!important}}
`;

export const assistenteExtrasJs = String.raw`
  /* ================= extras: ações, artefatos, voz e Modo conversa ================= */
  var BT = String.fromCharCode(96);
  ICO.mic = ICO.mic || 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3M9 21h6';
  ICO.volume = ICO.volume || 'M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12';
  ICO.stop = ICO.stop || 'M7 7h10v10H7z';
  ICO.download = ICO.download || 'M12 4v11M7 11l5 5 5-5M5 20h14';
  ICO.doc = ICO.doc || 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6';
  ICO.tabela = ICO.tabela || 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14';
  ICO.grafico = ICO.grafico || 'M4 20V10M10 20V4M16 20v-7M22 20H2';
  ICO.fones = ICO.fones || 'M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v5H5a1 1 0 0 1-1-1zM20 15h-3v5h2a1 1 0 0 0 1-1z';
  ICO.ok = ICO.ok || 'M5 12l5 5L20 7';
  ICO.fechar = ICO.fechar || 'M6 6l12 12M18 6L6 18';
  ICO.escudo = ICO.escudo || 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z';
  var URL_API = '/painel/crm/api/agente';
  var DESTINO_TELA = function (t) { return '/painel/crm#' + encodeURIComponent(t); };
  var DESTINO_LEAD = function (id) { return '/painel/crm#leads/lead-' + encodeURIComponent(id); };
  E.voz = { transcrever: false, falar: false }; E.perfil = ''; E.perms = []; E.ia = false;
  E.falar = lerLS('clinex-as-falar') === '1';

  function baixar(nome, tipo, conteudo) {
    var url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
    var a = h('a', { href: url, download: nome, style: 'display:none' }); document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }
  function copiarTexto(t, msg) {
    var fim = function () { aviso(msg || 'Copiado.', 'ok'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(fim, function () { aviso('Não consegui copiar.', 'erro'); }); else fim();
  }
  function slug(t) { return String(t || 'artefato').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'artefato'; }
  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  /* ---- markdown seguro: tudo é escapado antes de virar HTML */
  function mdInline(t) {
    return esc(t).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>').replace(new RegExp(BT + '([^' + BT + ']+)' + BT, 'g'), '<code>$1</code>');
  }
  function mdCelulas(l) { return l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) { return c.trim(); }); }
  function mdHtml(md) {
    var L = String(md || '').replace(/\r/g, '').split('\n'), out = [], i = 0, lista = null, m;
    function fecha() { if (lista) { out.push('</' + lista + '>'); lista = null; } }
    while (i < L.length) {
      var l = L[i];
      if (/^\s*$/.test(l)) { fecha(); i++; continue; }
      if ((m = /^(#{1,4})\s+(.*)$/.exec(l))) { fecha(); var n = m[1].length + 1; out.push('<h' + n + '>' + mdInline(m[2]) + '</h' + n + '>'); i++; continue; }
      if (/^\s*[-*]\s+/.test(l)) { if (lista !== 'ul') { fecha(); out.push('<ul>'); lista = 'ul'; } out.push('<li>' + mdInline(l.replace(/^\s*[-*]\s+/, '')) + '</li>'); i++; continue; }
      if (/^\s*\d+[.)]\s+/.test(l)) { if (lista !== 'ol') { fecha(); out.push('<ol>'); lista = 'ol'; } out.push('<li>' + mdInline(l.replace(/^\s*\d+[.)]\s+/, '')) + '</li>'); i++; continue; }
      if (/^\s*---+\s*$/.test(l)) { fecha(); out.push('<hr>'); i++; continue; }
      if (/^\s*>/.test(l)) { fecha(); out.push('<blockquote>' + mdInline(l.replace(/^\s*>\s?/, '')) + '</blockquote>'); i++; continue; }
      if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < L.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(L[i + 1]) && L[i + 1].indexOf('-') >= 0) {
        fecha(); var cab = mdCelulas(l), linhas = []; i += 2;
        while (i < L.length && /^\s*\|/.test(L[i])) { linhas.push(mdCelulas(L[i])); i++; }
        out.push('<table><thead><tr>' + cab.map(function (c) { return '<th>' + mdInline(c) + '</th>'; }).join('') + '</tr></thead><tbody>' + linhas.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + mdInline(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>');
        continue;
      }
      fecha(); out.push('<p>' + mdInline(l) + '</p>'); i++;
    }
    fecha(); return out.join('');
  }
  function paginaHtml(titulo, corpo) {
    return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(titulo) + '</title><style>body{font:16px/1.7 "Segoe UI",system-ui,sans-serif;color:#1a2233;max-width:780px;margin:40px auto;padding:0 22px}h2{font-size:28px;letter-spacing:-.02em}h3{margin-top:28px}table{border-collapse:collapse;width:100%;margin:14px 0}th,td{border-bottom:1px solid #d9e0ec;padding:8px 12px;text-align:left}th{background:#f2f5fa}blockquote{border-left:3px solid #4cc9f0;margin:12px 0;padding:6px 16px;background:#f6f9fd}code{background:#eef2f8;padding:1px 6px;border-radius:5px}footer{margin-top:40px;color:#7a869a;font-size:12px}@media print{body{margin:0}}</style></head><body>' + corpo + '<footer>Gerado pelo Agente Clinex em ' + new Date().toLocaleString('pt-BR') + '</footer></body></html>';
  }
  function csvDe(a) {
    function cel(v) { var s = typeof v === 'number' ? String(v).replace('.', ',') : String(v == null ? '' : v); if (/[";\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"'; return s; }
    return '﻿' + [a.colunas].concat(a.linhas || []).map(function (r) { return r.map(cel).join(';'); }).join('\r\n');
  }
  function tsvDe(a) { return [a.colunas].concat(a.linhas || []).map(function (r) { return r.map(function (v) { return String(v == null ? '' : v).replace(/[\t\n\r]+/g, ' '); }).join('\t'); }).join('\n'); }

  /* ---- cartão de confirmação de ação */
  function cartaoAcao(a) {
    var box = h('div');
    function pinta() {
      var est = a.estado || 'pendente';
      box.className = 'as-acao ' + est + (a.risco === 'alto' ? ' alto' : '');
      limpar(box);
      box.appendChild(h('div', { class: 'as-acao-h' }, [h('span', { class: 'as-acao-i' }, ico(est === 'feito' ? 'ok' : est === 'erro' ? 'fechar' : a.risco === 'alto' ? 'escudo' : 'bolt', 17)), h('b', { text: a.titulo }), a.risco === 'alto' && est === 'pendente' ? h('span', { class: 'as-risco', text: 'Atenção' }) : null]));
      box.appendChild(h('ul', null, a.resumo.map(function (t) { return h('li', { text: t }); })));
      var f = h('div', { class: 'as-acao-f' });
      if (est === 'pendente' || est === 'erro') {
        if (est === 'erro') f.appendChild(h('span', { class: 'st', text: a.erro || 'Não consegui executar.' }));
        f.appendChild(h('button', { type: 'button', class: 'as-btn pri', onclick: function () { confirmarAcao(a, pinta); } }, [ico('ok', 16), est === 'erro' ? 'Tentar de novo' : 'Confirmar']));
        f.appendChild(h('button', { type: 'button', class: 'as-btn', onclick: function () { a.estado = 'cancelado'; salvar(); pinta(); } }, 'Cancelar'));
      } else if (est === 'executando') { f.appendChild(h('i', { class: 'as-gira' })); f.appendChild(h('span', { class: 'st', text: 'Executando…' })); }
      else if (est === 'feito') f.appendChild(h('span', { class: 'st', text: a.resultado || 'Feito.' }));
      else f.appendChild(h('span', { class: 'st', text: 'Cancelado. Nada foi alterado.' }));
      box.appendChild(f);
    }
    pinta(); a._pinta = pinta; return box;
  }
  function confirmarAcao(a, pinta) {
    if (a.estado === 'executando' || a.estado === 'feito') return Promise.resolve();
    a.estado = 'executando'; pinta();
    return chamar('POST', URL_API + '/executar', { ferramenta: a.ferramenta, args: a.args }).then(function (r) {
      a.estado = 'feito'; a.resultado = r.resumo; delete a.erro;
      var c = conversa(); if (c) { c.msgs.push({ papel: 'agent', texto: 'Feito: ' + r.resumo, itens: r.itens, sistema: true }); }
      salvar(); pinta(); if (!E.cv) desenhar();
      return r;
    }).catch(function (e) { a.estado = 'erro'; a.erro = e.message; salvar(); pinta(); });
  }
  function cartoesAcao(m, corpo, depois) { (m.acoes || []).forEach(function (a) { corpo.appendChild(depois(cartaoAcao(a), 0.25)); }); }
  function pendentes() { var c = conversa(); var r = []; if (!c) return r; c.msgs.forEach(function (m) { (m.acoes || []).forEach(function (a) { if ((a.estado || 'pendente') === 'pendente') r.push(a); }); }); return r; }

  /* ---- artefatos */
  var ROT_ART = { documento: 'Documento', planilha: 'Planilha', painel: 'Painel interativo', mensagem: 'Mensagem pronta' };
  var ICO_ART = { documento: 'doc', planilha: 'tabela', painel: 'grafico', mensagem: 'chat' };
  function subArt(a) { return ROT_ART[a.tipo] + (a.tipo === 'planilha' ? ' · ' + (a.linhas || []).length + ' linhas, ' + (a.colunas || []).length + ' colunas' : ''); }
  function cartaoArtefato(a) {
    return h('button', { type: 'button', class: 'as-art-c ' + a.tipo, onclick: function () { abrirArtefato(a); } }, [h('span', { class: 'as-art-ic' }, ico(ICO_ART[a.tipo] || 'doc', 20)), h('span', null, [h('b', { text: a.titulo }), h('small', { text: subArt(a) + ' · toque para abrir' })]), ico('arrow', 16)]);
  }
  function cartoesArtefato(m, corpo, depois) { if (m.artefatos && m.artefatos.length) corpo.appendChild(depois(h('div', { class: 'as-arts' }, m.artefatos.map(cartaoArtefato)), 0.3)); }
  function abrirArtefato(a) {
    var antes = document.activeElement, corpo = h('div', { class: 'as-pan-b' }), ac = h('div', { class: 'as-pan-ac' });
    var btn = function (rot, icone, fn) { return h('button', { type: 'button', class: 'as-btn', onclick: fn }, [ico(icone, 15), rot]); };
    if (a.tipo === 'documento') {
      var art = h('article', { class: 'as-doc' }); art.innerHTML = mdHtml(a.conteudo); corpo.appendChild(art);
      ac.appendChild(btn('Copiar', 'copy', function () { copiarTexto(a.conteudo, 'Documento copiado.'); }));
      ac.appendChild(btn('Baixar HTML', 'download', function () { baixar(slug(a.titulo) + '.html', 'text/html;charset=utf-8', paginaHtml(a.titulo, mdHtml(a.conteudo))); }));
      ac.appendChild(btn('Imprimir / PDF', 'print', function () { var w = window.open('', '_blank'); if (!w) { aviso('Libere as janelas pop-up para imprimir.', 'erro'); return; } w.document.write(paginaHtml(a.titulo, mdHtml(a.conteudo))); w.document.close(); setTimeout(function () { w.focus(); w.print(); }, 400); }));
    } else if (a.tipo === 'planilha') {
      var tb = h('table', null, [h('thead', null, h('tr', null, a.colunas.map(function (c) { return h('th', { text: c }); }))), h('tbody', null, (a.linhas || []).slice(0, 300).map(function (r) { return h('tr', null, r.map(function (v) { return h('td', { class: typeof v === 'number' ? 'n' : '', text: typeof v === 'number' ? v.toLocaleString('pt-BR') : v }); })); }))]);
      corpo.appendChild(h('div', { class: 'as-plan' }, tb));
      if ((a.linhas || []).length > 300) corpo.appendChild(h('p', { class: 'as-plan-n', text: 'Mostrando 300 de ' + a.linhas.length + ' linhas. O arquivo baixado tem todas.' }));
      ac.appendChild(btn('Baixar CSV (Excel)', 'download', function () { baixar(slug(a.titulo) + '.csv', 'text/csv;charset=utf-8', csvDe(a)); }));
      ac.appendChild(btn('Copiar para colar no Excel', 'copy', function () { copiarTexto(tsvDe(a), 'Tabela copiada: é só colar no Excel ou no Google Planilhas.'); }));
    } else if (a.tipo === 'painel') {
      var ifr = h('iframe', { class: 'as-pan-ifr', sandbox: 'allow-scripts', title: a.titulo, referrerpolicy: 'no-referrer', src: '/painel/assistente/painel' });
      ifr.addEventListener('load', function () { try { ifr.contentWindow.postMessage({ html: a.html }, '*'); } catch (e) { /* segue */ } });
      corpo.appendChild(ifr);
      ac.appendChild(btn('Baixar HTML', 'download', function () { baixar(slug(a.titulo) + '.html', 'text/html;charset=utf-8', a.html); }));
    } else {
      corpo.appendChild(h('div', { class: 'as-msg-zap' }, h('p', { text: a.conteudo })));
      ac.appendChild(btn('Copiar mensagem', 'copy', function () { copiarTexto(a.conteudo, 'Mensagem copiada.'); }));
    }
    var fechar = function () { document.removeEventListener('keydown', tecla); pan.remove(); if (antes && antes.focus) antes.focus(); };
    var tecla = function (e) { if (e.key === 'Escape') { e.stopPropagation(); fechar(); } };
    var bFechar = h('button', { type: 'button', class: 'as-btn', 'aria-label': 'Fechar', onclick: fechar }, [ico('fechar', 15), 'Fechar']);
    ac.appendChild(bFechar);
    var pan = h('div', { class: 'as-pan', role: 'dialog', 'aria-modal': 'true', 'aria-label': a.titulo, onclick: function (e) { if (e.target === pan) fechar(); } }, h('div', { class: 'as-pan-c' }, [
      h('header', { class: 'as-pan-h' }, [h('span', { class: 'as-art-ic' }, ico(ICO_ART[a.tipo] || 'doc', 19)), h('div', { class: 'as-pan-t' }, [h('b', { text: a.titulo }), h('small', { text: subArt(a) })]), ac]), corpo
    ]));
    document.body.appendChild(pan); document.addEventListener('keydown', tecla, true); bFechar.focus();
  }

  function botaoNavegar(n) {
    var href = n.tipo === 'lead' ? DESTINO_LEAD(n.valor) : DESTINO_TELA(n.valor);
    return h('a', { class: 'as-btn pri', href: href, style: 'margin-top:14px;text-decoration:none' }, [ico('arrow', 15), n.rotulo || 'Abrir']);
  }

  /* ---- voz: ouvir (gravar e transcrever) e falar */
  var V = { audio: null, stream: null, cancelar: null, ctx: null };
  function mimeGravacao() { var c = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']; for (var i = 0; i < c.length; i++) { if (window.MediaRecorder && MediaRecorder.isTypeSupported(c[i])) return c[i]; } return ''; }
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  function podeOuvir() { return !!((E.voz.transcrever && navigator.mediaDevices && window.MediaRecorder) || SR); }

  /** Ouve a pessoa e devolve o texto. opc: { auto (para sozinho no silêncio), onNivel(0..1), onParcial(texto), semFala (ms sem voz para desistir) } -> { promessa, parar(), cancelar() } */
  function ouvir(opc) {
    opc = opc || {};
    var pedido = null, cancelou = false; /* parar/cancelar antes de o microfone abrir: vale assim que abrir */
    var ctl = { parar: function (m) { pedido = { m: m === true }; }, cancelar: function () { cancelou = true; } };
    if (E.voz.transcrever && navigator.mediaDevices && window.MediaRecorder) {
      var parado = false, cancelado = false, manual = false, partes = [], mr = null, raf = 0, timerMax = 0;
      ctl.promessa = navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then(function (stream) {
        return new Promise(function (resolve, reject) {
          V.stream = stream;
          var tipo = mimeGravacao(); mr = tipo ? new MediaRecorder(stream, { mimeType: tipo }) : new MediaRecorder(stream);
          var AC = window.AudioContext || window.webkitAudioContext, ac = AC ? new AC() : null, an = null, buf = null;
          if (ac) { an = ac.createAnalyser(); an.fftSize = 1024; ac.createMediaStreamSource(stream).connect(an); buf = new Uint8Array(an.fftSize); }
          var comecou = Date.now(), falou = false, ultimaVoz = 0, voz0 = 0;
          var temFala = function () { return falou || (manual && Date.now() - comecou > 1200); }; /* parar na mão vale como "eu falei": só o silêncio total é descartado */
          function encerrar() { cancelAnimationFrame(raf); clearTimeout(timerMax); stream.getTracks().forEach(function (t) { t.stop(); }); if (ac) { try { ac.close(); } catch (e) { /* segue */ } } V.stream = null; }
          mr.ondataavailable = function (ev) { if (ev.data && ev.data.size) partes.push(ev.data); };
          mr.onstop = function () { encerrar(); if (cancelado) { resolve(''); return; } var blob = new Blob(partes, { type: mr.mimeType || tipo || 'audio/webm' }); if (!temFala() && opc.auto) { resolve(''); return; } resolve(blob); };
          mr.onerror = function () { encerrar(); reject(new Error('Não consegui gravar o áudio.')); };
          ctl.parar = function (naMao) { if (naMao === true) manual = true; if (!parado && mr.state !== 'inactive') { parado = true; mr.stop(); } };
          ctl.cancelar = function () { cancelado = true; ctl.parar(); };
          function laco() {
            if (parado) return;
            if (an) {
              an.getByteTimeDomainData(buf); var soma = 0; for (var i = 0; i < buf.length; i++) { var v = (buf[i] - 128) / 128; soma += v * v; }
              var rms = Math.sqrt(soma / buf.length), nivel = Math.min(1, rms * 5), agora = Date.now();
              if (opc.onNivel) opc.onNivel(nivel);
              if (rms > 0.03) { if (!voz0) voz0 = agora; if (agora - voz0 > 220) { falou = true; ultimaVoz = agora; } } else voz0 = 0;
              if (opc.auto) {
                if (falou && agora - ultimaVoz > 1400) { ctl.parar(); return; }
                if (!falou && agora - comecou > (opc.semFala || 9000)) { ctl.parar(); return; }
              }
            }
            raf = requestAnimationFrame(laco);
          }
          mr.start(250); laco();
          if (cancelou) ctl.cancelar(); else if (pedido) ctl.parar(pedido.m);
          timerMax = setTimeout(function () { ctl.parar(); }, 60000);
        });
      }).then(function (blob) {
        if (!blob) return '';
        return fetch(URL_API + '/voz/transcrever', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': blob.type || 'audio/webm' }, body: blob })
          .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.mensagem || 'Não consegui transcrever.'); return j.texto || ''; }); });
      }).catch(function (e) { if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) throw new Error('O navegador bloqueou o microfone. Libere o acesso no cadeado da barra de endereço.'); if (e && e.name === 'NotFoundError') throw new Error('Não encontrei um microfone neste computador.'); throw e; });
      return ctl;
    }
    if (SR) { // plano B: reconhecimento do próprio navegador
      var rec = new SR(); rec.lang = 'pt-BR'; rec.interimResults = true; rec.continuous = false; var final = '';
      ctl.promessa = new Promise(function (resolve, reject) {
        rec.onresult = function (ev) { var t = ''; for (var i = 0; i < ev.results.length; i++) { t += ev.results[i][0].transcript; if (ev.results[i].isFinal) final = t; } if (opc.onParcial) opc.onParcial(t); if (opc.onNivel) opc.onNivel(0.5); };
        rec.onerror = function (ev) { if (ev.error === 'no-speech' || ev.error === 'aborted') resolve(''); else reject(new Error(ev.error === 'not-allowed' ? 'O navegador bloqueou o microfone.' : 'Não consegui ouvir (' + ev.error + ').')); };
        rec.onend = function () { resolve(final); };
        try { rec.start(); } catch (e) { reject(e); }
      });
      ctl.parar = function () { try { rec.stop(); } catch (e) { /* segue */ } }; ctl.cancelar = function () { final = ''; try { rec.abort(); } catch (e) { /* segue */ } };
      return ctl;
    }
    ctl.promessa = Promise.reject(new Error('Este navegador não consegue gravar áudio.')); return ctl;
  }

  function pararFala() { if (V.audio) { try { V.audio.pause(); } catch (e) { /* segue */ } V.audio = null; } if (window.speechSynthesis) speechSynthesis.cancel(); document.querySelectorAll('.as-ic.falando').forEach(function (b) { b.classList.remove('falando'); }); }
  function limpoParaFala(t) { return String(t || '').replace(/\*\*/g, '').replace(/[#>*|]/g, ' ').replace(/\s+/g, ' ').trim(); }
  /** Fala o texto. Resolve quando termina (ou se algo falhar). */
  function falarTexto(texto, opc) {
    opc = opc || {}; pararFala();
    var t = limpoParaFala(texto); if (!t) return Promise.resolve();
    var navegador = function () {
      return new Promise(function (resolve) {
        if (!window.speechSynthesis) { resolve(); return; }
        var u = new SpeechSynthesisUtterance(t.slice(0, 600)); u.lang = 'pt-BR'; u.rate = 1.03;
        var vs = speechSynthesis.getVoices().filter(function (v) { return /pt[-_]BR/i.test(v.lang); }); if (vs[0]) u.voice = vs[0];
        u.onend = resolve; u.onerror = resolve; if (opc.aoIniciar) opc.aoIniciar(); speechSynthesis.speak(u);
      });
    };
    if (!E.voz.falar) return navegador();
    return fetch(URL_API + '/voz/falar', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto: t }) })
      .then(function (r) { if (!r.ok) throw new Error('voz'); return r.blob(); })
      .then(function (blob) {
        return new Promise(function (resolve) {
          var url = URL.createObjectURL(blob), au = new Audio(url); V.audio = au;
          var fim = function () { URL.revokeObjectURL(url); if (V.audio === au) V.audio = null; resolve(); };
          au.onended = fim; au.onerror = fim; au.onpause = function () { if (au.ended || au.currentTime === 0 || !V.audio) fim(); };
          if (opc.aoIniciar) opc.aoIniciar();
          au.play().catch(function () { fim(); });
        });
      }).catch(function () { return navegador(); });
  }

  /* ---- microfone do campo de mensagem: grava, transcreve e envia */
  function criarMic() {
    var estado = 'ocioso', ctl = null, ini = 0, tick = 0;
    var barra = h('div', { class: 'as-gravando', role: 'status' }, [h('i'), h('span', { text: 'Ouvindo… fale e fique em silêncio para enviar' }), h('span', { class: 'niv' }, h('b'))]);
    var tempo = barra.children[1], nivel = barra.querySelector('.niv b');
    var btn = h('button', { type: 'button', class: 'as-mic', 'aria-label': 'Falar com a IA', title: 'Falar com a IA (clique, fale e fique em silêncio para enviar)' }, ico('mic', 20));
    function fim() { estado = 'ocioso'; clearInterval(tick); btn.className = 'as-mic'; barra.classList.remove('on'); }
    btn.addEventListener('click', function () {
      if (E.cv) return;
      if (estado === 'gravando') { ctl.parar(true); return; }
      if (estado !== 'ocioso' || E.enviando) return;
      if (!podeOuvir()) { aviso('Este navegador não consegue gravar áudio. Use o Chrome ou o Edge.', 'erro'); return; }
      pararFala(); estado = 'gravando'; ini = Date.now(); btn.classList.add('rec'); barra.classList.add('on'); btn.title = 'Parar e enviar';
      tick = setInterval(function () { tempo.textContent = 'Ouvindo… ' + Math.floor((Date.now() - ini) / 1000) + 's · fale e fique em silêncio para enviar'; }, 500);
      ctl = ouvir({ auto: true, semFala: 8000, onNivel: function (n) { nivel.style.width = Math.round(n * 100) + '%'; }, onParcial: function (t) { el.campo.value = t; ajustar(); } });
      ctl.promessa.then(function (t) { estado = 'trans'; btn.className = 'as-mic trans'; barra.classList.remove('on'); return t; })
        .then(function (t) { fim(); t = String(t || '').trim(); if (!t) { aviso('Não ouvi nada. Tente de novo.', 'aviso'); return; } perguntar(t, { porVoz: true }); })
        .catch(function (e) { fim(); aviso(e.message, 'erro'); });
    });
    return { btn: btn, barra: barra };
  }

  /* ---- botões do topo, nota de permissões e capacidades do servidor */
  var PERM_TODAS = { consultar: 'consultar leads, tarefas e regras', consultar_equipe: 'ver indicadores e desempenho da equipe', alterar_leads: 'criar e alterar leads', enviar_whatsapp: 'enviar WhatsApp', ia_ver: 'ver a IA de disparo', ia_alterar: 'alterar a IA de disparo' };
  function notaPermissoes() {
    if (!E.perfil) return null;
    var tem = {}; E.perms.forEach(function (p) { tem[p.id] = 1; });
    var nao = Object.keys(PERM_TODAS).filter(function (k) { return !tem[k]; }).map(function (k) { return PERM_TODAS[k]; });
    return h('p', { class: 'as-perm' }, ['Seu perfil é ', h('b', { text: E.perfil }), '. Eu só faço o que ele permite' + (nao.length ? ' e aviso quando pedirem algo fora disso (' + nao.join(', ') + ').' : '.') + ' Qualquer mudança no sistema só acontece depois do seu Confirmar.']);
  }
  function criarTopoAc() {
    var bVoz = h('button', { type: 'button', class: 'as-chip-b' + (E.falar ? ' on' : ''), 'aria-pressed': String(E.falar), title: 'Ler as respostas em voz alta' }, [ico('volume', 15), h('span', { text: 'Voz' })]);
    bVoz.addEventListener('click', function () { E.falar = !E.falar; gravarLS('clinex-as-falar', E.falar ? '1' : '0'); bVoz.classList.toggle('on', E.falar); bVoz.setAttribute('aria-pressed', String(E.falar)); if (!E.falar) pararFala(); aviso(E.falar ? 'As respostas serão lidas em voz alta.' : 'Voz desligada.', 'ok'); });
    var bConv = h('button', { type: 'button', class: 'as-chip-b conv', title: 'Conversar por voz, de mãos livres', onclick: abrirConversa }, [ico('fones', 15), h('span', { text: 'Modo conversa' })]);
    return h('div', { class: 'as-topo-ac' }, [bVoz, bConv]);
  }
  function carregarCapacidades() {
    return chamar('GET', URL_API + '/chat').then(function (r) { E.ia = !!r.ia; E.perfil = r.perfil || ''; E.perms = r.permissoes || []; E.voz = r.voz || E.voz; }).catch(function () { /* segue sem as capacidades */ });
  }

  /* ---- Modo conversa: tela imersiva, mãos livres */
  var CV_TXT = { ocioso: 'Toque no círculo para falar', ouvindo: 'Ouvindo', pensando: 'Pensando', falando: 'Falando' };
  var CV_COR = { ocioso: '#6b7a90', ouvindo: '#4cc9f0', pensando: '#a78bfa', falando: '#2ee6a6' };
  function abrirConversa() {
    if (E.cv) return;
    if (!podeOuvir()) { aviso('Este navegador não consegue gravar áudio. Use o Chrome ou o Edge para o Modo conversa.', 'erro'); return; }
    var cv = { estado: 'ocioso', ctl: null, continuo: true, vazios: 0, vivo: true, seq: 0 };
    E.cv = cv; pararFala();
    var est = h('div', { class: 'cv-est', role: 'status', 'aria-live': 'polite' });
    var uTxt = h('div', { class: 'cv-u' }), aTxt = h('div', { class: 'cv-a' }), extra = h('div', { class: 'cv-extra' });
    var orbe = h('button', { type: 'button', class: 'cv-orbe', 'aria-label': 'Falar ou interromper' }, [h('i', { class: 'cv-anel' }), h('i', { class: 'cv-anel b' }), h('i', { class: 'cv-onda' }), h('i', { class: 'cv-onda o2' }), h('i', { class: 'cv-onda o3' }), h('span', { class: 'cv-nucleo' }, ico('mic', 56))]);
    var bCont = h('button', { type: 'button', class: 'as-btn on', 'aria-pressed': 'true' }, [ico('fones', 15), 'Mãos livres: ligado']);
    var bFim = h('button', { type: 'button', class: 'as-btn', onclick: sair }, [ico('fechar', 15), 'Encerrar']);
    var raiz2 = h('div', { class: 'cv ocioso', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Modo conversa' }, [
      h('div', { class: 'cv-top' }, [h('b', { text: 'MODO CONVERSA · AGENTE CLINEX' }), h('span', { class: 'mut', style: 'font-size:12.5px', text: (E.perfil ? 'Perfil: ' + E.perfil : '') })]),
      h('div', { class: 'cv-meio' }, [orbe, est, h('div', { class: 'cv-fala' }, [uTxt, aTxt]), extra]),
      h('div', { class: 'cv-base' }, [bCont, bFim]),
      h('p', { class: 'cv-dica', text: 'Diga, por exemplo: "o que eu faço agora?", "monte uma planilha dos leads atrasados" ou "confirma" para aprovar uma ação. Esc encerra.' })
    ]);
    function mudar(s) {
      if (!cv.vivo) return; cv.estado = s; raiz2.className = 'cv ' + s; raiz2.style.setProperty('--cvc', CV_COR[s]);
      est.textContent = CV_TXT[s]; if (s !== 'ouvindo') orbe.style.setProperty('--n', '0');
    }
    function pintaExtra(m) {
      limpar(extra); if (!m) return;
      (m.acoes || []).forEach(function (a) { extra.appendChild(cartaoAcao(a)); });
      if (m.artefatos && m.artefatos.length) extra.appendChild(h('div', { class: 'as-arts' }, m.artefatos.map(cartaoArtefato)));
      if (m.navegar) extra.appendChild(botaoNavegar(m.navegar));
    }
    function sair() { cv.vivo = false; if (cv.ctl) cv.ctl.cancelar(); pararFala(); document.removeEventListener('keydown', tecla); raiz2.remove(); E.cv = null; desenhar(); setTimeout(function () { el.campo.focus(); }, 30); }
    function tecla(e) { if (e.key === 'Escape' && !document.querySelector('.as-pan')) { e.preventDefault(); sair(); } }
    function escutar() {
      if (!cv.vivo) return; var meu = ++cv.seq; mudar('ouvindo');
      cv.ctl = ouvir({ auto: true, semFala: 9000, onNivel: function (n) { if (cv.estado === 'ouvindo') orbe.style.setProperty('--n', n.toFixed(2)); }, onParcial: function (t) { uTxt.textContent = '“' + t + '”'; } });
      cv.ctl.promessa.then(function (t) {
        if (!cv.vivo || meu !== cv.seq) return; t = String(t || '').trim();
        if (!t) { cv.vazios++; if (cv.vazios >= 2 || !cv.continuo) { mudar('ocioso'); return; } escutar(); return; }
        cv.vazios = 0; uTxt.textContent = '“' + t + '”'; return tratar(t);
      }).catch(function (e) { if (!cv.vivo) return; mudar('ocioso'); aTxt.textContent = e.message; });
    }
    function dizer(t) { aTxt.textContent = t; mudar('falando'); return falarTexto(t).then(function () { if (cv.vivo && cv.estado === 'falando') { if (cv.continuo) escutar(); else mudar('ocioso'); } }); }
    var SIM = /^\s*(sim|confirmo|confirmar|confirma|confirmado|pode (fazer|confirmar|criar|mandar|registrar)|manda|faz|isso( mesmo)?|ok|certo|beleza|claro)\b/i, NAO = /^\s*(n[aã]o|cancela|cancelar|deixa( pra l[aá])?|esquece|desiste)\b/i;
    function tratar(t) {
      var pend = pendentes();
      if (pend.length && NAO.test(t)) { pend.forEach(function (a) { a.estado = 'cancelado'; if (a._pinta) a._pinta(); }); salvar(); return dizer('Cancelado. Não alterei nada.'); }
      if (pend.length && SIM.test(t)) {
        var a = pend[pend.length - 1];
        if (a.risco === 'alto') return dizer('Essa ação é sensível. Toque em Confirmar na tela para eu executar.');
        mudar('pensando'); return confirmarAcao(a, a._pinta || function () {}).then(function () { return dizer(a.estado === 'feito' ? 'Pronto. ' + String(a.resultado || '').replace(/^Feito: /, '') : 'Não consegui: ' + (a.erro || 'houve um erro') + '.'); });
      }
      mudar('pensando'); aTxt.textContent = '';
      return perguntar(t, { porVoz: true, conversa: true }).then(function (r) {
        if (!cv.vivo) return; var resp = r && r.resp; if (!resp) { return dizer('Não consegui responder agora.'); }
        pintaExtra(resp); return dizer(resp.texto);
      });
    }
    orbe.addEventListener('click', function () { if (cv.estado === 'falando') { pararFala(); escutar(); } else if (cv.estado === 'ouvindo') { cv.ctl.parar(true); } else if (cv.estado === 'ocioso') { cv.vazios = 0; escutar(); } });
    bCont.addEventListener('click', function () { cv.continuo = !cv.continuo; bCont.classList.toggle('on', cv.continuo); bCont.setAttribute('aria-pressed', String(cv.continuo)); bCont.lastChild.textContent = 'Mãos livres: ' + (cv.continuo ? 'ligado' : 'desligado'); });
    document.body.appendChild(raiz2); document.addEventListener('keydown', tecla); mudar('ocioso'); orbe.focus();
    var pend0 = pendentes(); if (pend0.length) pintaExtra({ acoes: pend0 });
    var ola = saudacao() + (E.nome && !E.master ? ', ' + primeiroNome(E.nome) : '') + '! Pode falar.';
    setTimeout(function () { if (cv.vivo) { aTxt.textContent = ola; escutar(); } }, 350);
  }
`;
