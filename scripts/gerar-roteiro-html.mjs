/**
 * Gera docs/roteiro-de-testes-amanda.html a partir do markdown, com marcação de resultado por cenário (fica salva no navegador).
 * Rodar: node scripts/gerar-roteiro-html.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origem = path.join(raiz, 'docs', 'roteiro-de-testes-amanda.md');
const destino = path.join(raiz, 'docs', 'roteiro-de-testes-amanda.html');
const linhas = fs.readFileSync(origem, 'utf8').replace(/\r\n/g, '\n').split('\n');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const NUM = /^(\d+\.\d+[a-z]?)\s+(.*)$/;

const botao = (id) => `<button class="st" type="button" data-id="${id}" title="Clique: pendente, ok, falhou" aria-label="Resultado do cenário ${id}"></button>`;

let html = ''; let titulo = 'Roteiro de testes da Amanda'; let aberto = false; let fluxoAtual = '';
const fechaFluxo = () => { if (aberto) { html += '</div></details>\n'; aberto = false; } };

for (let i = 0; i < linhas.length; i++) {
  const l = linhas[i];
  if (!l.trim()) continue;
  let m;
  if ((m = l.match(/^# (.*)/))) { titulo = m[1]; continue; }
  if ((m = l.match(/^## (.*)/))) {
    fechaFluxo();
    const nome = m[1]; fluxoAtual = slug(nome);
    if (/^Fluxo \d+/.test(nome)) { html += `<details class="fluxo" id="${fluxoAtual}" open><summary><span class="nome">${inline(nome)}</span><span class="cont" data-fluxo="${fluxoAtual}"></span></summary><div class="corpo">\n`; aberto = true; }
    else html += `<h2>${inline(nome)}</h2>\n`;
    continue;
  }
  if ((m = l.match(/^### (.*)/))) { html += `<h3>${inline(m[1])}</h3>\n`; continue; }
  if (/^---\s*$/.test(l)) { continue; }
  if (l.startsWith('|')) {
    const bloco = [];
    while (i < linhas.length && linhas[i].startsWith('|')) bloco.push(linhas[i++]);
    i--;
    const cel = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    const [cab, , ...rows] = bloco;
    html += '<table><thead><tr>' + cel(cab).map((c, k) => `<th>${k === 0 ? 'Resultado' : ''}${k === 0 ? ' / ' : ''}${inline(c)}</th>`).join('') + '</tr></thead><tbody>';
    for (const r of rows) {
      const c = cel(r); const n = c[0].match(/^\d+\.\d+[a-z]?$/) ? c[0] : null;
      html += `<tr${n ? ` class="cenario" data-id="${n}" data-fluxo="${fluxoAtual}"` : ''}>` + c.map((x, k) => (k === 0 && n ? `<td class="id">${botao(n)}<span>${esc(n)}</span></td>` : `<td>${inline(x)}</td>`)).join('') + '</tr>';
    }
    html += '</tbody></table>\n';
    continue;
  }
  if (/^(- |\d+\. )/.test(l)) {
    const ordenada = /^\d+\. /.test(l);
    const itens = [];
    while (i < linhas.length && /^(- |\d+\. )/.test(linhas[i])) itens.push(linhas[i++].replace(/^(- |\d+\. )/, ''));
    i--;
    html += ordenada ? '<ol>' : '<ul>';
    for (const it of itens) {
      const n = it.match(NUM);
      if (n && !ordenada) html += `<li class="cenario" data-id="${n[1]}" data-fluxo="${fluxoAtual}">${botao(n[1])}<span class="id">${esc(n[1])}</span><span class="txt">${inline(n[2])}</span></li>`;
      else html += `<li>${inline(it)}</li>`;
    }
    html += ordenada ? '</ol>\n' : '</ul>\n';
    continue;
  }
  // parágrafo
  const par = [l];
  while (i + 1 < linhas.length && linhas[i + 1].trim() && !/^(#|\||- |\d+\. |---)/.test(linhas[i + 1])) par.push(linhas[++i]);
  html += `<p>${inline(par.join(' '))}</p>\n`;
}
fechaFluxo();

const pagina = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<style>
:root { --bg:#f6f7f9; --card:#fff; --tx:#1d2733; --mut:#5d6b7a; --bd:#dde2e8; --ac:#0b6b4f; --ok:#1a8a4a; --no:#c62828; --pend:#9aa5b1; --cd:#eef1f4; }
@media (prefers-color-scheme: dark) { :root { --bg:#12171d; --card:#1a2129; --tx:#e6ebf0; --mut:#9aa8b6; --bd:#2a343f; --ac:#4cc79a; --ok:#4cc77e; --no:#ff7a7a; --pend:#5f6c79; --cd:#232c36; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--tx); font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
header { position:sticky; top:0; z-index:5; background:var(--card); border-bottom:1px solid var(--bd); padding:12px 16px; }
header .in { max-width:980px; margin:0 auto; display:flex; flex-wrap:wrap; gap:10px 16px; align-items:center; }
header h1 { font-size:18px; margin:0; flex:1 1 260px; }
.prog { flex:1 1 220px; min-width:200px; }
.barra { height:8px; background:var(--cd); border-radius:99px; overflow:hidden; display:flex; }
.barra i { display:block; height:100%; } .barra .ok { background:var(--ok); } .barra .no { background:var(--no); }
.prog small { color:var(--mut); }
.acoes { display:flex; flex-wrap:wrap; gap:8px; }
.acoes button { font:inherit; font-size:14px; padding:6px 10px; border:1px solid var(--bd); background:var(--card); color:var(--tx); border-radius:8px; cursor:pointer; }
.acoes button:hover { border-color:var(--ac); }
main { max-width:980px; margin:0 auto; padding:16px; }
h2 { font-size:20px; margin:28px 0 8px; } h3 { font-size:17px; margin:18px 0 6px; }
p, ul, ol { margin:8px 0; } ul, ol { padding-left:22px; }
code { background:var(--cd); padding:1px 5px; border-radius:5px; font-size:.92em; }
details.fluxo { background:var(--card); border:1px solid var(--bd); border-radius:12px; margin:14px 0; }
details.fluxo > summary { cursor:pointer; list-style:none; padding:12px 16px; display:flex; justify-content:space-between; gap:12px; font-weight:650; font-size:18px; }
details.fluxo > summary::-webkit-details-marker { display:none; }
details.fluxo > summary::before { content:"▸"; margin-right:8px; color:var(--mut); transition:transform .15s; display:inline-block; }
details.fluxo[open] > summary::before { transform:rotate(90deg); }
summary .nome { flex:1; } summary .cont { font-weight:500; font-size:14px; color:var(--mut); white-space:nowrap; }
.corpo { padding:0 16px 14px; }
ul { list-style:none; padding-left:0; }
li.cenario { display:flex; gap:10px; align-items:flex-start; padding:8px 0; border-top:1px solid var(--bd); }
li.cenario:first-child { border-top:0; }
li.cenario .id, td.id span { font-variant-numeric:tabular-nums; color:var(--mut); font-weight:600; min-width:34px; }
li.cenario .txt { flex:1; }
table { width:100%; border-collapse:collapse; margin:10px 0; font-size:15px; }
th, td { text-align:left; vertical-align:top; padding:8px 10px; border-top:1px solid var(--bd); }
th { color:var(--mut); font-weight:600; font-size:13px; border-top:0; }
td.id { white-space:nowrap; }
.st { width:26px; height:26px; border-radius:7px; border:2px solid var(--pend); background:transparent; cursor:pointer; flex:none; vertical-align:middle; margin-right:8px; position:relative; }
.st[data-v="ok"] { border-color:var(--ok); background:var(--ok); } .st[data-v="ok"]::after { content:"✓"; color:#fff; font-weight:800; position:absolute; inset:0; display:grid; place-items:center; }
.st[data-v="no"] { border-color:var(--no); background:var(--no); } .st[data-v="no"]::after { content:"✕"; color:#fff; font-weight:800; position:absolute; inset:0; display:grid; place-items:center; }
.cenario[data-v="ok"] { opacity:.62; } .cenario[data-v="no"] { background:color-mix(in srgb, var(--no) 10%, transparent); }
body.so-pendentes .cenario[data-v="ok"] { display:none; }
.dica { color:var(--mut); font-size:14px; }
@media (max-width:640px) { table, thead, tbody, tr, td, th { display:block; } thead { display:none; } tr.cenario { padding:8px 0; border-top:1px solid var(--bd); } td { border:0; padding:2px 0; } }
@media print { header { position:static; } .acoes { display:none; } details.fluxo { break-inside:avoid-page; } }
</style>
</head>
<body>
<header><div class="in">
  <h1>${esc(titulo)}</h1>
  <div class="prog"><div class="barra"><i class="ok"></i><i class="no"></i></div><small id="resumo"></small></div>
  <div class="acoes">
    <button id="so">Só pendentes</button>
    <button id="abrir">Abrir tudo</button>
    <button id="fechar">Fechar tudo</button>
    <button id="limpar">Limpar marcações</button>
  </div>
</div></header>
<main>
<p class="dica">Clique no quadrado de cada cenário: uma vez = ✓ passou, duas = ✕ falhou, três = pendente. As marcações ficam salvas neste navegador. Para me passar o resultado, copie o número dos que falharam (botão abaixo).</p>
${html}
<p><button id="copiar" class="acoes" style="font:inherit;padding:8px 12px;border:1px solid var(--bd);border-radius:8px;background:var(--card);color:var(--tx);cursor:pointer">Copiar números dos que falharam</button> <span id="copiado" class="dica"></span></p>
</main>
<script>
(function () {
  var CHAVE = 'roteiro-amanda-v1';
  var estado = {};
  try { estado = JSON.parse(localStorage.getItem(CHAVE) || '{}') || {}; } catch (e) { estado = {}; }
  var salvar = function () { try { localStorage.setItem(CHAVE, JSON.stringify(estado)); } catch (e) {} };
  var cenarios = [].slice.call(document.querySelectorAll('.cenario'));
  function pinta() {
    var ok = 0, no = 0;
    cenarios.forEach(function (c) {
      var v = estado[c.dataset.id] || '';
      if (v) c.dataset.v = v; else delete c.dataset.v;
      var b = c.querySelector('.st'); if (b) { if (v) b.dataset.v = v; else delete b.dataset.v; }
      if (v === 'ok') ok++; if (v === 'no') no++;
    });
    var t = cenarios.length;
    document.querySelector('.barra .ok').style.width = (t ? ok / t * 100 : 0) + '%';
    document.querySelector('.barra .no').style.width = (t ? no / t * 100 : 0) + '%';
    document.getElementById('resumo').textContent = ok + ' passaram, ' + no + ' falharam, ' + (t - ok - no) + ' pendentes de ' + t;
    [].forEach.call(document.querySelectorAll('.cont'), function (el) {
      var f = el.dataset.fluxo; var d = cenarios.filter(function (c) { return c.dataset.fluxo === f; });
      var o = d.filter(function (c) { return estado[c.dataset.id] === 'ok'; }).length;
      var n = d.filter(function (c) { return estado[c.dataset.id] === 'no'; }).length;
      el.textContent = o + '/' + d.length + (n ? ' · ' + n + ' falhou' : '');
    });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.st'); if (!b) return;
    var id = b.dataset.id, v = estado[id] || '';
    var prox = v === '' ? 'ok' : v === 'ok' ? 'no' : '';
    if (prox) estado[id] = prox; else delete estado[id];
    salvar(); pinta();
  });
  document.getElementById('so').onclick = function () { document.body.classList.toggle('so-pendentes'); this.textContent = document.body.classList.contains('so-pendentes') ? 'Mostrar todos' : 'Só pendentes'; };
  document.getElementById('abrir').onclick = function () { [].forEach.call(document.querySelectorAll('details.fluxo'), function (d) { d.open = true; }); };
  document.getElementById('fechar').onclick = function () { [].forEach.call(document.querySelectorAll('details.fluxo'), function (d) { d.open = false; }); };
  document.getElementById('limpar').onclick = function () { if (confirm('Apagar todas as marcações?')) { estado = {}; salvar(); pinta(); } };
  document.getElementById('copiar').onclick = function () {
    var f = cenarios.filter(function (c) { return estado[c.dataset.id] === 'no'; }).map(function (c) { return c.dataset.id; });
    var txt = f.length ? 'Falharam: ' + f.join(', ') : 'Nenhum cenário falhou.';
    var fim = function () { document.getElementById('copiado').textContent = txt; };
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(fim, fim); else fim();
  };
  pinta();
})();
</script>
</body>
</html>
`;
fs.writeFileSync(destino, pagina);
console.log(`ok: ${destino} (${(pagina.match(/class="cenario"/g) || []).length} cenários)`);
