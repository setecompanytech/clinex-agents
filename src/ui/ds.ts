import { parte_abas, parte_agente, parte_avisos, parte_base, parte_dados, parte_menu, parte_modais, parte_tabelas } from './design.js';
import { cliente } from './cliente.js';
import { componentes } from './componentes.js';
import { agenteFlutuante } from './agenteFlutuante.js';
import { graficos } from './graficos.js';
import { graficos2 } from './graficos2.js';
import { graficos3 } from './graficos3.js';
import { graficos4 } from './graficos4.js';
import { shellCss, shellJs } from './shell.js';
import { selectModerno } from './selectModerno.js';
import { dataModerna } from './dataModerna.js';

/**
 * Design system do Clinex, servido para os módulos que não são o CRM (Hub, Agente receptivo).
 *   /painel/ds.css  tokens claro/escuro, estrutura, controles, cartões, KPIs, gráficos, tabelas, modais, avisos
 *   /painel/ds.js   helpers de DOM, ícones, avisos, modais, gráficos SVG e a montagem do menu/topo/tema
 * O CRM usa as mesmas partes de CSS (src/ui/design.ts) e a mesma biblioteca de gráficos, então a aparência é idêntica.
 */
export const dsCss = [parte_base, parte_menu, parte_tabelas, parte_modais, parte_avisos, parte_dados, parte_abas, parte_agente, shellCss].join('\n');
export const dsJs = [cliente, graficos, graficos2, graficos3, graficos4, componentes, shellJs, agenteFlutuante, selectModerno, dataModerna].join('\n');

/** CSP das páginas que usam o design system (o CSS e o JS vêm do próprio servidor). */
export const DS_CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export type PaginaModulo = { titulo: string; modulo: 'receptivo' | 'geral'; ativo: string; main: string; css?: string; scripts: string[]; bodyClass?: string; depois?: string; agente?: boolean };

const META = {
  receptivo: { tag: 'AGENTE', rotulo: 'Telas do agente receptivo', rodape: 'Amanda · recepcionista virtual' },
  geral: { tag: 'PAINEL', rotulo: 'Painel geral', rodape: 'Clinex · painel interno' },
} as const;

/** Página de um módulo: menu lateral, topo com trilha e tema, e o <main> da tela. */
export function paginaModulo(p: PaginaModulo): string {
  const meta = META[p.modulo];
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex, nofollow"><link rel="icon" href="data:,">
<title>Clinex · ${p.titulo}</title>
<link rel="stylesheet" href="/painel/ds.css">
${p.css ? `<style>${p.css}</style>` : ''}</head>
<body data-modulo="${p.modulo}" data-ativo="${p.ativo}"${p.agente === false ? '' : ` data-agente="/painel/${p.modulo}/agente"`}${p.bodyClass ? ` class="${p.bodyClass}"` : ''}>
<div class="app">
  <aside class="side">
    <div class="logo"><b>clinex</b><span>${meta.tag}</span></div>
    <nav id="nav" aria-label="${meta.rotulo}"></nav>
    <div class="side-f" id="side-f">${meta.rodape}</div>
  </aside>
  <div class="corpo">
    <header class="topo dupla"><div id="topo-esq" class="crumbs"></div><div id="topo-dir"></div></header>
    <div id="erro-js" role="alert" style="display:none"></div>
    ${p.main}
  </div>
</div>
${p.depois ?? ''}
<script src="/painel/ds.js"></script>
${p.scripts.map((s) => `<script src="${s}"></script>`).join('\n')}
</body></html>`;
}
