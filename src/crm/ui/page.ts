// HTML + CSS do CRM, embutidos como string (sem build, sem dependências externas, sem fontes remotas).
// Escuro por padrão (segue o sistema); o botão do topo alterna e lembra a escolha.

import { parte_abas, parte_agente, parte_avisos, parte_base, parte_dados, parte_menu, parte_modais, parte_tabelas } from '../../ui/design.js';

export const css = `
${parte_base}
${parte_menu}

/* ---- Funil */
.filtros{display:flex;gap:10px;flex-wrap:wrap}
#sec-decisao .filtros{margin-bottom:16px}
.busca{display:flex;align-items:center;gap:8px;flex:1;min-width:240px;border:1px solid var(--line2);background:color-mix(in srgb,var(--solid) 70%,transparent);border-radius:12px;padding:0 12px;color:var(--mut)}
.busca input{border:0;background:transparent;outline:0;padding:10px 0;flex:1;color:var(--ink)}
.filtros select.in{width:auto;min-width:180px}
.kanban{display:grid;grid-template-columns:repeat(5,minmax(215px,1fr));gap:14px;overflow-x:auto;padding-bottom:8px;scroll-snap-type:x proximity}
.kanban.sec2{grid-template-columns:repeat(3,minmax(240px,1fr))}
.col{scroll-snap-align:start;border:1px solid var(--line);border-radius:18px;background:linear-gradient(180deg,var(--card),transparent);display:flex;flex-direction:column;min-height:240px;max-height:72vh;--c:var(--mut);border-top:3px solid var(--c)}
.col-aberto{--c:var(--c-aberto)}.col-sem_retorno{--c:var(--c-sem)}.col-negociacao{--c:var(--c-neg)}.col-agendado{--c:var(--c-agend)}.col-convertido_ativo{--c:var(--c-ativo)}.col-convertido_organico{--c:var(--c-org)}.col-descarte{--c:var(--c-desc)}
.col header{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;padding:14px 16px 4px}
.col header b{font:700 15px "Segoe UI Variable Display","Segoe UI"}.col header small{display:block;color:var(--mut);font-size:11.5px}
.col-n{font:800 12px ui-monospace,Consolas,monospace;border-radius:999px;padding:2px 10px;background:color-mix(in srgb,var(--c) 22%,transparent);color:var(--ink)}
.col-v{padding:0 16px 8px;font:600 12.5px ui-monospace,Consolas,monospace;color:var(--mut)}
.col-c{display:flex;flex-direction:column;gap:9px;padding:4px 12px 14px;overflow-y:auto;overflow-x:hidden}
.lcard{border:1px solid var(--line);border-radius:14px;padding:11px 12px;background:var(--solid);cursor:pointer;display:flex;flex-direction:column;gap:8px;transition:transform .12s,border-color .12s}
.lcard:hover{transform:translateY(-2px);border-color:var(--line2)}
.lcard.p1{border-color:color-mix(in srgb,var(--acc) 60%,transparent);box-shadow:0 0 18px color-mix(in srgb,var(--acc) 22%,transparent)}
.lcard{min-width:0;overflow:hidden;flex-shrink:0}
.lcard-t{display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px}.lcard-t>div{min-width:105px;flex:1}.lcard-t b,.lcard-t small{display:block;overflow-wrap:break-word}.lcard-t small{color:var(--mut);font-size:11.5px;margin-top:1px}
.lcard-v{font:700 12.5px ui-monospace,Consolas,monospace;color:var(--ink2);white-space:nowrap;margin-left:auto}
.lcard-tags{display:flex;flex-wrap:wrap;gap:6px}.lcard-tags>*{max-width:100%}.lcard-tags .pill{white-space:normal;line-height:1.3;text-align:left}.lcard-a{color:var(--mut);font-size:11.5px}
.mot{display:grid;grid-template-columns:90px 1fr 26px;gap:10px;align-items:center;font-size:13px}
.mot i{height:8px;border-radius:5px;background:var(--line);overflow:hidden}.mot u{display:block;height:100%;background:linear-gradient(90deg,var(--acc),var(--acc2));border-radius:5px}
.mot b{text-align:right;font-variant-numeric:tabular-nums}

${parte_tabelas}
/* ---- Mensagens */
.chips-f{display:flex;gap:8px;flex-wrap:wrap}
.chip-f{border:1px solid var(--line);background:var(--card);border-radius:999px;padding:6px 15px;font-weight:600;font-size:13px;color:var(--ink2)}
.chip-f[aria-pressed="true"]{background:linear-gradient(135deg,var(--acc),var(--acc2));color:#fff;border-color:transparent;box-shadow:var(--glow)}
.msgs{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(340px,100%),1fr));gap:16px}
.msg{border:1px solid var(--line);border-radius:18px;overflow:hidden;background:var(--solid);box-shadow:var(--shadow);--m:#2d3050;display:flex;flex-direction:column}
.msg.pisca{animation:pisca 1.6s ease}
.per-barra{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:10px 12px;margin:0 0 14px}
.hh.hh-crm{display:flex;flex-direction:column;align-items:stretch;gap:18px;padding:4px 2px 0}.hh-topo{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.hh-topo .per-barra{margin:0}.hh-corpo{display:flex;justify-content:space-between;align-items:center;gap:28px;flex-wrap:wrap}.hh-corpo .hh-t h1{margin-top:0}
.tm-tbl{font-size:13px}.tm-tbl th,.tm-tbl td{padding-left:9px;padding-right:9px}.tm-tbl th{font-size:10.5px;letter-spacing:.04em;white-space:nowrap}.tm-tbl td:first-child{min-width:150px}.tm-tbl td.num{white-space:nowrap}.tm-tbl td.num .dlt{display:block;margin-top:2px;font-size:11px}.tm-barra{display:block;height:3px;border-radius:3px;margin-top:5px;background:var(--cy);opacity:.75;min-width:2px}.tm-tbl tfoot td{border-top:1px solid var(--line2,var(--line));background:color-mix(in srgb,var(--ink) 5%,transparent);font-weight:700}.tm-tbl .th-seta{font-style:normal;font-size:9px;margin-left:4px}
.eq-rec{display:block;margin-top:2px;color:var(--ok);font-weight:600}.tm-tbl td.num small{display:block;font-size:11px}
.eq-t.clic{cursor:pointer;transition:border-color .15s,transform .15s,box-shadow .15s}.eq-t.clic:hover,.eq-t.clic:focus-visible{border-color:var(--cy);transform:translateY(-1px);box-shadow:0 6px 22px rgba(0,0,0,.25)}
.m-caixa.pessoa .m-corpo{padding:18px 22px 22px}.ps{display:flex;flex-direction:column;gap:16px}.ps-cab{display:flex;align-items:center;gap:14px}.ps-cab .avatar{width:46px;height:46px;font-size:16px}.ps-cab h2{margin:0}.ps-cab p{margin:2px 0 0;color:var(--mut);font-size:13px}
.ps-chips{display:flex;flex-wrap:wrap;gap:8px}.ps-chip{padding:5px 12px;border-radius:99px;font-size:12.5px;font-weight:600;border:1px solid var(--line);background:color-mix(in srgb,var(--ink) 5%,transparent);color:var(--ink2)}.ps-chip.ok{color:var(--ok);border-color:color-mix(in srgb,var(--ok) 40%,transparent);background:color-mix(in srgb,var(--ok) 10%,transparent)}.ps-chip.ruim{color:var(--bad);border-color:color-mix(in srgb,var(--bad) 40%,transparent);background:color-mix(in srgb,var(--bad) 10%,transparent)}
.ps-linha{display:flex;flex-direction:column;gap:2px;max-height:520px;overflow:auto;padding-right:4px}.ps-ev{display:flex;gap:12px;align-items:flex-start;text-align:left;width:100%;padding:10px 8px;border:0;border-bottom:1px solid var(--line);background:transparent;color:inherit;cursor:pointer;border-radius:10px}.ps-ev:hover{background:color-mix(in srgb,var(--cy) 8%,transparent)}.ps-pt{flex:none;width:10px;height:10px;border-radius:50%;margin-top:6px}.ps-ev-c{flex:1;min-width:0}.ps-ev-t{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}.ps-ev p{margin:3px 0 0;font-size:13px;color:var(--ink2);overflow-wrap:anywhere}.ps-rodape{justify-content:flex-end}
.ia-cab{display:flex;flex-direction:column;gap:14px}.ia-modos{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.ia-modo{display:flex;flex-direction:column;gap:6px;text-align:left;padding:14px 16px;border-radius:16px;border:1px solid var(--line);background:color-mix(in srgb,var(--ink) 4%,transparent);color:var(--ink);cursor:pointer;transition:border-color .15s,box-shadow .15s}.ia-modo b{font-size:15px}.ia-modo small{color:var(--mut);font-size:12.5px;line-height:1.4}.ia-modo:hover:not(:disabled){border-color:var(--cy)}
.ia-modo.on{border-color:var(--cy);box-shadow:0 0 0 3px color-mix(in srgb,var(--cy) 20%,transparent);background:color-mix(in srgb,var(--cy) 8%,transparent)}.ia-modo.on.ia-ligado{border-color:var(--ok);box-shadow:0 0 0 3px color-mix(in srgb,var(--ok) 22%,transparent);background:color-mix(in srgb,var(--ok) 9%,transparent)}.ia-modo:disabled{opacity:.4;cursor:not-allowed}
.ia-resp{display:flex;flex-direction:column;gap:8px;margin-top:12px}.ia-r{display:flex;align-items:flex-start;gap:12px;text-align:left;padding:12px 14px;border-radius:14px;border:1px solid var(--line);background:color-mix(in srgb,var(--ink) 3%,transparent);color:inherit;cursor:pointer;width:100%}.ia-r:hover{border-color:var(--cy)}.ia-r-c{flex:1;min-width:0}.ia-r-t{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}.ia-r p{margin:4px 0 0;font-size:13.5px;overflow-wrap:anywhere}.ia-pul{margin-top:12px}
@media(max-width:760px){.ia-modos{grid-template-columns:1fr}}
.tela-h:has(.tela-dir)>div:first-child{flex:1 1 260px;min-width:0}.tela-dir{flex:0 1 auto;display:flex;flex-direction:column;align-items:flex-end;gap:10px;min-width:0;max-width:100%}.tela-dir .per-barra{margin:0}.tela-dir .tela-ac{justify-content:flex-end}.per-esq,.per-dir{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px}.per-dir{justify-content:flex-end}
.per-trig{display:flex;align-items:center;gap:10px;height:42px;padding:0 14px 0 12px;border-radius:12px;border:1px solid var(--line);background:color-mix(in srgb,var(--ink) 6%,transparent);color:var(--ink);cursor:pointer;text-align:left;transition:border-color .15s,box-shadow .15s}.per-trig:hover,.per-trig[aria-expanded="true"]{border-color:var(--cy);box-shadow:0 0 0 3px color-mix(in srgb,var(--cy) 18%,transparent)}
.per-trig svg{color:var(--cy);flex:none}.per-t{display:flex;flex-wrap:wrap;align-items:baseline;gap:0 8px;line-height:1.2}.per-t b{font-size:13.5px}.per-t small{color:var(--mut);font-size:12px}.per-seta{color:var(--mut);font-size:12px;margin-left:4px}.per-trig.mini{height:38px;padding:0 12px 0 10px}
.per-atalhos{display:flex;align-items:center;gap:2px;height:42px;padding:3px;border-radius:12px;border:1px solid var(--line);background:color-mix(in srgb,var(--ink) 6%,transparent)}.per-chip{height:34px;border:0;background:transparent;color:var(--ink2);font:600 13px inherit;padding:0 13px;border-radius:9px;cursor:pointer}.per-chip:hover{background:color-mix(in srgb,var(--ink) 8%,transparent)}.per-chip[aria-pressed="true"]{background:var(--cy);color:#04141a}
.per-campo{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--mut);white-space:nowrap}.per-campo .in{min-width:150px;height:42px;border-radius:12px}
.per-cmp{display:flex;align-items:center;gap:9px;cursor:pointer;font-size:12.5px;color:var(--ink2)}.per-cmp input{position:absolute;opacity:0;pointer-events:none}.per-cmp small{display:block;color:var(--mut);font-size:11px}.per-sw{position:relative;width:34px;height:20px;border-radius:20px;background:color-mix(in srgb,var(--ink) 18%,transparent);transition:background .15s;flex:none}.per-sw:after{content:"";position:absolute;top:3px;left:3px;width:14px;height:14px;border-radius:50%;background:#fff;transition:transform .15s}.per-cmp input:checked+.per-sw{background:var(--cy)}.per-cmp input:checked+.per-sw:after{transform:translateX(14px)}.per-cmp input:focus-visible+.per-sw{box-shadow:0 0 0 3px color-mix(in srgb,var(--cy) 35%,transparent)}
.per-info{color:var(--mut);font-size:12px;max-width:340px;text-align:right;line-height:1.35}
.per-fundo{position:fixed;inset:0;z-index:2000;background:rgba(3,6,12,.45)}
.per-pop{position:fixed;display:flex;max-width:calc(100vw - 24px);border-radius:20px;border:1px solid var(--line2,var(--line));background:var(--solid);box-shadow:0 24px 60px rgba(0,0,0,.5);overflow:hidden}
.per-lado{display:flex;flex-direction:column;gap:2px;min-width:168px;padding:14px 10px;border-right:1px solid var(--line);background:color-mix(in srgb,var(--ink) 4%,transparent)}.per-lado-t{padding:0 10px 6px;color:var(--mut);font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.per-op{border:0;background:transparent;color:var(--ink2);text-align:left;font:500 13.5px inherit;padding:8px 10px;border-radius:9px;cursor:pointer}.per-op:hover{background:color-mix(in srgb,var(--ink) 8%,transparent)}.per-op[aria-pressed="true"]{background:color-mix(in srgb,var(--cy) 18%,transparent);color:var(--ink);font-weight:700}
.per-meio{display:flex;flex-direction:column;gap:12px;padding:16px 18px 14px;min-width:0}
.per-datas{display:flex;align-items:flex-end;gap:10px}.per-datas label{display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--mut);font-weight:700;letter-spacing:.05em;text-transform:uppercase;flex:1}.per-datas .in{text-transform:none;letter-spacing:0;font-weight:600;font-size:14px}.per-datas i{color:var(--mut);padding-bottom:10px;font-style:normal}
.per-cals{position:relative;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px}.per-nav-l{position:absolute;left:0;right:0;top:-2px;display:flex;justify-content:space-between;pointer-events:none;z-index:1}
.per-nav{pointer-events:auto;width:28px;height:28px;border-radius:9px;border:1px solid var(--line);background:var(--card2);color:var(--ink);font-size:18px;line-height:1;cursor:pointer}.per-nav:hover:not(:disabled){border-color:var(--cy)}.per-nav:disabled{opacity:.3;cursor:default}
.per-mes{min-width:224px}.per-mes-t{display:block;text-align:center;font-size:14px;margin:0 0 8px;line-height:28px}
.per-grade{display:grid;grid-template-columns:repeat(7,1fr);row-gap:2px}.per-sem{text-align:center;color:var(--mut);font-size:11px;font-weight:700;padding:4px 0}
.per-d{position:relative;height:32px;border:0;background:transparent;color:var(--ink);font:500 13px inherit;cursor:pointer;border-radius:0}.per-d:hover:not(:disabled){background:color-mix(in srgb,var(--cy) 20%,transparent);border-radius:9px}.per-d:disabled{color:var(--mut);opacity:.35;cursor:default}
.per-d.per-meio-d{background:color-mix(in srgb,var(--cy) 16%,transparent)}.per-d.per-ini,.per-d.per-fim{background:var(--cy);color:#04141a;font-weight:800}.per-d.per-ini{border-radius:9px 0 0 9px}.per-d.per-fim{border-radius:0 9px 9px 0}.per-d.per-ini.per-fim{border-radius:9px}.per-d.per-hj:not(.per-ini):not(.per-fim){box-shadow:inset 0 0 0 1.5px var(--cy);border-radius:9px}
.per-res{font-size:13px;color:var(--ink2)}.per-res b{color:var(--ink)}.per-erro{color:var(--warn);font-size:12px;min-height:0}.per-erro:empty{display:none}
.per-rodape{display:flex;justify-content:flex-end;gap:10px;padding-top:4px}
.it-tool .per-trig{margin-left:10px}
.hoje-per{display:flex;flex-direction:column;gap:12px;margin:6px 0 4px}
.msg-perf{display:flex;align-items:center;flex-wrap:wrap;gap:6px 16px;margin:0 0 12px;padding:8px 12px;border-radius:12px;font-size:12.5px;color:var(--ink2);background:color-mix(in srgb,var(--cy) 9%,transparent);border:1px solid color-mix(in srgb,var(--cy) 22%,transparent)}.msg-perf svg{color:var(--cy)}.msg-perf b{color:var(--ink)}.msg-perf-t{margin-left:auto}.msg-perf.vazio,.msg-perf.carrega{background:transparent;border-color:var(--line);color:var(--mut)}
.auto-per{display:flex;flex-direction:column;gap:10px}.auto-per-g{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}.auto-per-i{display:flex;align-items:baseline;gap:10px;padding:12px 14px;border-radius:14px;background:color-mix(in srgb,var(--ink) 5%,transparent);border:1px solid var(--line)}.auto-per-i b{font-size:22px;font-variant-numeric:tabular-nums}.auto-per-i span{font-size:13px;color:var(--ink2)}
@media(max-width:760px){.tela-dir{align-items:stretch;width:100%}.per-barra{flex-direction:column;align-items:stretch}.per-dir{justify-content:flex-start}.per-info{text-align:left;max-width:none}.per-atalhos{overflow-x:auto}.per-pop{left:0!important;right:0;top:auto!important;bottom:0;max-width:none;border-radius:20px 20px 0 0;flex-direction:column;max-height:92vh;overflow:auto}.per-lado{flex-direction:row;flex-wrap:wrap;min-width:0;border-right:0;border-bottom:1px solid var(--line)}.per-lado-t{display:none}.per-cals{grid-template-columns:1fr}.per-cals .per-mes:nth-of-type(2){display:none}}
.wa-grade{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:32px;align-items:start}.wa-form{min-width:0;display:flex;flex-direction:column;gap:16px}
.wa-aviso{margin:0;padding:10px 14px;border-radius:12px;font-size:13px;line-height:1.4;color:var(--warn);background:color-mix(in srgb,var(--warn) 10%,transparent);border:1px solid color-mix(in srgb,var(--warn) 30%,transparent)}
.wa-sec{display:flex;flex-direction:column;gap:12px;padding:16px;border-radius:16px;background:color-mix(in srgb,var(--ink) 4%,transparent);border:1px solid color-mix(in srgb,var(--ink) 8%,transparent)}
.wa-sec-t{display:flex;align-items:center;gap:10px}.wa-sec-t i{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-style:normal;font-size:12px;font-weight:700;background:var(--cy);color:#04141a}.wa-sec-t b{font-size:14px}.wa-sec-t small{margin-left:auto;color:var(--mut);font-size:12px}
.wa-lang{margin-left:auto;font-size:11px;font-weight:700;letter-spacing:.04em;padding:3px 9px;border-radius:99px;color:var(--mut);border:1px solid color-mix(in srgb,var(--ink) 15%,transparent)}.wa-lang-en{color:var(--warn)}
.wa-form .wa-vars{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:0}
.wa-f{display:flex;flex-direction:column;gap:6px;min-width:0}.wa-f-r{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--mut)}.wa-f-r em{min-width:18px;height:18px;border-radius:6px;display:grid;place-items:center;font-style:normal;font-size:11px;font-weight:700;background:color-mix(in srgb,var(--ink) 10%,transparent);color:var(--ink)}
.wa-nota{margin:-4px 0 0;font-size:12px;color:var(--mut)}
.wa-rodape{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding-top:4px}.wa-conf{display:flex;align-items:center;gap:10px;font-size:13px;line-height:1.35;cursor:pointer;flex:1 1 260px}.wa-conf input{flex:none;width:18px;height:18px}.wa-acoes{display:flex;gap:10px}
.wa-lado{position:sticky;top:0;display:flex;flex-direction:column;align-items:center;gap:10px}.wa-lado-t{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}.wa-lado-n{font-size:12px;color:var(--mut)}.wa-chat{width:100%}
.wa-fone{padding:9px;border-radius:38px;background:linear-gradient(160deg,#2b3240,#10141b);box-shadow:0 18px 40px rgba(0,0,0,.45),inset 0 0 0 1px rgba(255,255,255,.08)}
.wa-tela{border-radius:30px;overflow:hidden;background:#0b141a;display:flex;flex-direction:column;min-height:470px}
.wa-topo{display:flex;align-items:center;gap:10px;padding:14px 14px 12px;background:#1f2c34;color:#e9edef}.wa-volta{font-size:26px;line-height:1;color:#8696a0;margin-right:-2px}.wa-av{width:38px;height:38px;flex:none;border-radius:50%;background:#fff url(/painel/crm/logo.jpg) center/contain no-repeat;box-shadow:0 0 0 1px rgba(255,255,255,.15)}.wa-quem{display:flex;flex-direction:column;min-width:0}.wa-quem b{display:flex;align-items:center;gap:6px;font-size:15px}.wa-quem small{color:#8696a0;font-size:12px}.wa-ver{display:inline-grid;place-items:center;width:15px;height:15px;border-radius:50%;background:#00a884;color:#fff;font-size:10px;text-decoration:none}
.wa-fundo{flex:1;padding:14px 12px 18px;display:flex;flex-direction:column;gap:6px;background-color:#0b141a;background-image:radial-gradient(rgba(255,255,255,.045) 1px,transparent 1.5px);background-size:18px 18px}
.wa-dia{align-self:center;font-size:11px;font-weight:600;letter-spacing:.05em;color:#8696a0;background:#182229;padding:4px 11px;border-radius:8px;margin-bottom:6px}
.wa-bolha{position:relative;align-self:flex-start;max-width:90%;background:#202c33;color:#e9edef;border-radius:0 12px 12px 12px;padding:9px 11px 6px;font-size:14px;line-height:1.45;box-shadow:0 1px 1px rgba(0,0,0,.35)}.wa-bolha:before{content:"";position:absolute;top:0;left:-7px;border-top:0 solid transparent;border-right:8px solid #202c33;border-bottom:10px solid transparent}.wa-bolha p{margin:0;overflow-wrap:anywhere}
.wa-v{color:#7ee2c8;background:rgba(0,168,132,.16);border-radius:5px;padding:0 3px;font-weight:600}.wa-vazio{color:#f5c26b;background:rgba(245,194,107,.14);border-radius:5px;padding:0 3px}.wa-hora{display:block;text-align:right;color:#8696a0;font-size:11px;margin-top:2px}
.wa-botoes{display:flex;flex-direction:column;gap:4px;align-self:flex-start;width:90%}.wa-botoes span{display:flex;align-items:center;justify-content:center;gap:7px;background:#202c33;color:#53bdeb;border-radius:10px;padding:9px 10px;font-size:13.5px;font-weight:600;box-shadow:0 1px 1px rgba(0,0,0,.35)}.wa-botoes em{font-style:normal;font-size:15px}
.wa-barra{padding:9px 12px 14px;background:#0b141a}.wa-barra span{display:block;padding:10px 16px;border-radius:99px;background:#202c33;color:#6b7c85;font-size:14px}
@media(max-width:900px){.wa-grade{grid-template-columns:1fr}.wa-lado{position:static}.wa-form .wa-vars{grid-template-columns:1fr}}
@keyframes pisca{0%,100%{box-shadow:var(--shadow)}30%{box-shadow:0 0 0 3px var(--cy),0 0 40px var(--cy)}}
.g-aberto{--m:linear-gradient(135deg,#2d3050,#1b1d33)}.g-sem_retorno{--m:linear-gradient(135deg,#62667f,#464a63)}.g-negociacao{--m:linear-gradient(135deg,#ff1f4a,#c40030)}
.g-retorno{--m:linear-gradient(135deg,#ff6a86,#d93c5e)}.g-agendado{--m:linear-gradient(135deg,#b5002a,#7c001c)}.g-reativacao{--m:linear-gradient(135deg,#7d8299,#5b6079)}
.msg header{background:var(--m);color:#fff;padding:12px 16px;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px 10px}.msg header>div:first-child{flex:1 1 150px;min-width:0}
.msg header b{display:flex;align-items:center;gap:9px;font-size:13.5px;letter-spacing:.04em}.msg header small{display:block;opacity:.82;font-size:12px;margin-top:1px}
.msg-n{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:8px;background:rgba(255,255,255,.22);font:800 12px ui-monospace,Consolas,monospace}
.msg-acoes{display:flex;flex-wrap:wrap;align-items:center;gap:6px;flex:none;max-width:100%}.msg-acoes .mini,.mini{white-space:nowrap}
.msg header .mini{background:rgba(255,255,255,.16);color:#fff;border-color:rgba(255,255,255,.28)}
.msg-c{padding:14px 16px;display:flex;flex-direction:column;gap:10px}
.msg-t{display:flex;flex-direction:column;gap:8px;font-size:13.5px;line-height:1.55}
.msg-nota{font-size:12.5px;color:var(--mut);font-style:italic}
.msg-v{padding:12px 16px;border-top:1px dashed var(--line2);display:flex;flex-direction:column;gap:8px}.msg-v>b{font:800 11px ui-monospace,Consolas,monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--acc)}
.rapidos{display:flex;flex-wrap:wrap;gap:7px;margin-top:2px}
.rapido{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line2);border-radius:999px;padding:4px 12px;font-size:12.5px;font-weight:600;background:var(--card);color:var(--ink)}
.rapido i{font-style:normal;color:var(--acc);font-weight:800}
.rapidos.clic .rapido{cursor:pointer}.rapidos.clic .rapido:hover{border-color:var(--acc);background:color-mix(in srgb,var(--acc) 12%,transparent)}
.dicas{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr));gap:12px}
.dica{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border-radius:14px;background:var(--card);border:1px solid var(--line)}
.dica-ck{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:color-mix(in srgb,var(--ok) 20%,transparent);color:var(--ok);flex:none}

/* ---- Regras */
.regras4{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(250px,100%),1fr));gap:14px}
.regra4{border:1px solid var(--line);border-radius:18px;padding:18px;background:linear-gradient(180deg,var(--card2),var(--card));box-shadow:var(--shadow);display:flex;flex-direction:column;gap:8px}
.rg-n,.rm-n{display:inline-grid;place-items:center;width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--acc),var(--acc2));color:#fff;font:800 14px ui-monospace,Consolas,monospace;flex:none;box-shadow:var(--glow)}
.regra4 h3{font:700 16px "Segoe UI Variable Display","Segoe UI"}.r-doc{color:var(--ink2)}.r-sis{font-size:13px;color:var(--mut);border-top:1px solid var(--line);padding-top:9px;margin-top:2px}.r-sis b{color:var(--cy)}
.duas{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(380px,100%),1fr));gap:16px}
.lista-o{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:9px}
.lista-o li{position:relative;padding-left:24px;color:var(--ink2)}
.lista-o li::before{content:"";position:absolute;left:3px;top:.55em;width:9px;height:9px;border-radius:3px;background:var(--ok);box-shadow:0 0 8px var(--ok)}
.lista-o.neg li::before{background:var(--warn);box-shadow:0 0 8px var(--warn)}
.glossario{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:0}.glossario dt{font:700 12.5px ui-monospace,Consolas,monospace;color:var(--cy)}.glossario dd{margin:0;color:var(--ink2)}
.regras-grade{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
.rg{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border-radius:14px;background:var(--card);border:1px solid var(--line)}.rg p{color:var(--mut);font-size:13px}

/* ---- Fluxo */
.fluxo-cartao{padding:14px}
.mapa-wrap{position:relative;width:100%;overflow:hidden}
.mapa{position:relative;transform-origin:0 0}
.mapa-svg{position:absolute;inset:0;pointer-events:none;overflow:visible}
.edge{fill:none;stroke-width:2;transition:opacity .2s,stroke-width .2s}
.e-av{stroke:var(--edge)}
.e-ex{stroke:var(--bad);stroke-dasharray:7 6;animation:fluxo 1.1s linear infinite}
@keyframes fluxo{to{stroke-dashoffset:-26}}
.seta-av{fill:var(--edge)}.seta-ex{fill:var(--bad)}
.edge-r{fill:var(--ink2);font:600 12px "Segoe UI","Segoe UI Variable Text",system-ui;paint-order:stroke;stroke:var(--bg);stroke-width:5px;stroke-linejoin:round}
.edge-r.ex{fill:var(--bad)}
.fluxo-dot{fill:var(--cy);filter:drop-shadow(0 0 5px var(--cy))}.fluxo-dot.ex{fill:var(--bad);filter:drop-shadow(0 0 5px var(--bad))}
.mapa[data-foco] .edge,.mapa[data-foco] .edge-r,.mapa[data-foco] .fluxo-dot{opacity:.12}
.mapa[data-foco] .edge.rel,.mapa[data-foco] .edge-r.rel,.mapa[data-foco] .fluxo-dot.rel{opacity:1}
.mapa[data-foco] .edge.rel{stroke-width:3.2}
.no{position:absolute;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;text-align:center;border:1px solid var(--line2);border-radius:18px;padding:10px 12px;color:#fff;transition:transform .18s,box-shadow .2s,opacity .2s;overflow:visible}
.no:hover,.no:focus-visible{transform:translateY(-3px) scale(1.025);z-index:5}
.no.apaga{opacity:.28}
.no-t{font:800 15px/1.15 "Segoe UI Variable Display","Segoe UI",system-ui;letter-spacing:.01em}
.no-s{font-size:12.5px;line-height:1.3;opacity:.9}
.no-pill{display:inline-block;margin-top:2px;background:#fff;color:#14172b;border-radius:999px;padding:2px 14px;font:800 12px "Segoe UI",system-ui}
.no-selo{background:var(--acc);color:#fff;border-radius:999px;padding:3px 14px;font:800 12px "Segoe UI",system-ui;letter-spacing:.04em;box-shadow:0 0 18px color-mix(in srgb,var(--acc) 60%,transparent)}
.no-n{position:absolute;top:-10px;right:-10px;min-width:26px;height:26px;display:grid;place-items:center;padding:0 7px;border-radius:999px;background:var(--cy);color:#04141a;font:800 12.5px ui-monospace,Consolas,monospace;box-shadow:0 0 0 3px var(--bg),0 0 16px var(--cy)}
.no-ck{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:var(--ok);color:#04140d;box-shadow:0 0 22px var(--ok)}
.no-dark{background:linear-gradient(160deg,#2f3354,#1a1c31);border-color:#454a7a}.no-dark:hover{box-shadow:0 0 30px rgba(95,124,255,.35)}
.no-slate{background:linear-gradient(160deg,#646883,#464a63);border-color:#7b8099}.no-slate:hover{box-shadow:0 0 30px rgba(141,147,180,.4)}
.no-hot{background:linear-gradient(160deg,#ff2a52,#c20030);border-color:#ff6c8a;box-shadow:0 0 34px rgba(255,45,85,.35)}.no-hot:hover{box-shadow:0 0 46px rgba(255,45,85,.6)}
.no-deep{background:linear-gradient(160deg,#b8002b,#7a001b);border-color:#e0405f}.no-deep:hover{box-shadow:0 0 34px rgba(224,64,95,.45)}
.no-soft{background:color-mix(in srgb,var(--acc) 15%,var(--solid));border-color:color-mix(in srgb,var(--acc) 55%,transparent);color:var(--ink)}
.no-ghost{background:var(--card2);border-color:var(--line2);color:var(--ink)}
.no-outline,.no-outline-red,.no-win,.no-dashed{background:color-mix(in srgb,var(--solid) 80%,transparent);color:var(--ink);border-width:2px}
.no-outline{border-color:var(--ink2)}.no-outline-red{border-color:var(--acc)}.no-win{border-color:var(--ok);box-shadow:0 0 26px color-mix(in srgb,var(--ok) 30%,transparent)}.no-dashed{border-style:dashed;border-color:var(--line2)}
.leg-mapa{position:absolute;border:1px solid var(--line);border-radius:16px;background:var(--card);padding:12px 18px;display:flex;flex-direction:column;justify-content:center;gap:6px;font-size:12.5px;color:var(--ink2)}
.leg-mapa div{display:flex;align-items:center;gap:10px}.leg-mapa p{color:var(--mut);font-size:12px}
.l-av,.l-ex{display:inline-block;width:38px;height:0;border-top:2.5px solid var(--edge);margin-left:6px}.l-ex{border-top:2.5px dashed var(--bad)}
.fluxo-lista{display:flex;flex-direction:column;gap:10px}
.fl{display:flex;align-items:center;gap:12px;text-align:left;border:1px solid var(--line2);border-radius:16px;padding:13px 16px;color:#fff}
.fl span:first-child{flex:1}.fl small{display:block;opacity:.85}
.fl.no-outline,.fl.no-outline-red,.fl.no-win,.fl.no-dashed,.fl.no-soft,.fl.no-ghost{color:var(--ink)}
.fl .no-n{position:static}

/* ---- Calendário */
.cal-w{overflow-x:auto;padding:6px 4px 10px}
.cal{display:grid;grid-template-columns:150px repeat(6,minmax(136px,1fr));gap:10px;min-width:1000px}
.cal-h{display:grid;place-items:center;height:42px;border-radius:12px;background:linear-gradient(160deg,#2f3354,#1a1c31);color:#fff;font:800 16px ui-monospace,Consolas,monospace;letter-spacing:.04em;border:1px solid #454a7a}
.cal-h.fim{background:linear-gradient(160deg,#6e7391,#505470);opacity:.85}.cal-h.vaz{background:transparent;border-color:transparent}
.cal-l{display:flex;flex-direction:column;justify-content:center;gap:4px;border:1px solid var(--line2);border-radius:16px;padding:14px;color:#fff;text-align:left;min-height:130px}
.cal-l b{font:800 14px "Segoe UI Variable Display","Segoe UI";letter-spacing:.02em}.cal-l small{opacity:.85;font-size:12px}
.r-aberto.cal-l{background:linear-gradient(160deg,#2f3354,#1a1c31)}.r-sem_retorno.cal-l{background:linear-gradient(160deg,#646883,#464a63)}.r-negociacao.cal-l{background:linear-gradient(160deg,#ff2a52,#c20030)}
.cel{position:relative;border-radius:16px;padding:12px;min-height:130px;border:1px solid var(--line);background:color-mix(in srgb,var(--solid) 55%,transparent);display:flex;flex-direction:column;gap:6px;text-align:left}
.cel.vaz{border-style:dashed;opacity:.5;background:transparent}
.cel.on{cursor:pointer;background:linear-gradient(180deg,var(--card2),var(--card));border-left:3px solid var(--rc,var(--c-sem));transition:transform .15s,box-shadow .15s}
.cel.on:hover{transform:translateY(-3px);box-shadow:var(--shadow)}
.cel.r-aberto{--rc:var(--c-aberto)}.cel.r-sem_retorno{--rc:var(--c-sem)}.cel.r-negociacao{--rc:var(--c-neg)}
/* calendário do No-show */
.r-ns_noshow.cal-l{background:linear-gradient(160deg,#2f3354,#1a1c31)}.r-ns_retomada.cal-l{background:linear-gradient(160deg,#ff2a52,#c20030)}.r-ns_semretorno.cal-l{background:linear-gradient(160deg,#646883,#464a63)}.r-ns_agendado.cal-l{background:linear-gradient(160deg,#b8002b,#7a001b)}
.cel.r-ns_noshow{--rc:var(--c-neg)}.cel.r-ns_semretorno{--rc:var(--c-sem)}
.cal-l{position:relative}.cal-l .cel-n{top:-9px;right:-9px}
.cal-selo{align-self:flex-start;background:var(--acc);color:#fff;border-radius:999px;padding:2px 10px;font:800 10.5px "Segoe UI",system-ui;letter-spacing:.03em;margin-bottom:4px}
.cel.ns-bloco{justify-content:center;gap:12px;background:color-mix(in srgb,var(--acc) 9%,var(--solid));border:1px solid color-mix(in srgb,var(--acc) 22%,var(--line))}
.ns-bt{font:700 13px "Segoe UI Variable Display","Segoe UI"}
.ns-ramos{display:flex;flex-direction:column;gap:8px}
.ns-ramo{display:grid;grid-template-columns:minmax(0,1fr) 18px minmax(0,.9fr);gap:8px;align-items:center}
.ns-r,.ns-d{border:0;border-radius:999px;padding:6px 14px;font:700 12.5px "Segoe UI",system-ui;text-align:left;cursor:pointer;min-width:0;transition:transform .15s,box-shadow .15s}
.ns-r{background:linear-gradient(135deg,#2f3354,#1a1c31);color:#fff}.ns-r:hover,.ns-d:hover{transform:translateY(-1px);box-shadow:var(--shadow)}
.ns-tr{display:inline-flex;justify-content:center;color:var(--mut)}
.ns-d{text-align:center;color:#fff}.ns-d-agendado{background:linear-gradient(135deg,#b8002b,#7a001b)}.ns-d-recuperado{background:var(--card);color:var(--ink);border:2px solid var(--ok)}.ns-d-perdido{background:var(--card2);color:var(--ink);border:1px solid var(--line2)}.ns-d-semretorno{background:linear-gradient(135deg,#646883,#464a63)}.ns-d-noshow{background:linear-gradient(135deg,#2f3354,#1a1c31)}
.cel.ns-h .ns-ramos{flex-direction:row;flex-wrap:wrap;gap:10px 26px}.cel.ns-h .ns-ramo{grid-template-columns:auto 18px auto}.cel.ns-h .ns-bt{font-size:14px}
.cal-ns .cel.ns-bloco{min-height:0}
.cel.fim{opacity:.8}
.cel b{font:700 14px "Segoe UI Variable Display","Segoe UI"}.cel small{color:var(--mut);font-size:12.5px;line-height:1.35}
.cel-canais{display:flex;gap:5px;flex-wrap:wrap}.canal-t{border-radius:999px;padding:1px 9px;font:700 10.5px "Segoe UI",system-ui;background:color-mix(in srgb,var(--ink) 85%,transparent);color:var(--bg)}
.cel .pill{align-self:flex-start;margin-top:auto}
.cel-n{position:absolute;top:-9px;right:-9px;min-width:26px;height:26px;display:grid;place-items:center;padding:0 7px;border-radius:999px;background:var(--cy);color:#04141a;font:800 12.5px ui-monospace,Consolas,monospace;box-shadow:0 0 0 3px var(--bg),0 0 14px var(--cy)}
.cel-n.at{background:var(--bad);color:#fff;box-shadow:0 0 0 3px var(--bg),0 0 14px var(--bad)}
.cel.depois{border:1px solid var(--line);background:color-mix(in srgb,var(--solid) 55%,transparent);justify-content:center;gap:12px}
.ramo{display:flex;align-items:center;gap:8px;flex-wrap:nowrap}
.ramo-b{border:0;border-radius:999px;padding:5px 16px;font:700 12.5px "Segoe UI",system-ui;color:#fff}
.ramo-b.r1{background:linear-gradient(135deg,#2f3354,#1a1c31)}.ramo-b.r2{background:linear-gradient(135deg,#646883,#464a63)}.ramo-b.neg{background:linear-gradient(135deg,#ff2a52,#c20030)}.ramo-b.sr{background:linear-gradient(135deg,#646883,#464a63)}
.ramo-nota{font-size:11.5px;line-height:1.2;color:var(--mut);flex:1;min-width:0}.ramo-seta{color:var(--mut);display:inline-flex}

${parte_modais}
/* ---- gaveta do lead */
.lead-cab{display:flex;align-items:center;gap:14px}.lead-cab>div{min-width:0;flex:1}.lead-cab h2{font-size:21px}.lead-cab p{margin:0;color:var(--ink2);font-size:13.5px}
.lead-acoes-topo{display:flex;gap:10px;flex-wrap:wrap}
.faixa-r{display:flex;flex-direction:column;gap:10px}
.proximo{border:1px solid var(--line2);border-radius:18px;padding:16px 18px;background:linear-gradient(180deg,var(--card2),var(--card))}
.proximo.p1{border-color:color-mix(in srgb,var(--acc) 60%,transparent);box-shadow:0 0 30px color-mix(in srgb,var(--acc) 18%,transparent)}
.proximo>div,.proximo>p{margin-top:0}.proximo .chips{margin-bottom:8px}
.proximo .in.area{margin:10px 0 8px}
.proximo .linha-b{margin-top:10px}
.texto{color:var(--ink2);margin-bottom:10px}
.linha-b{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.linha-b.centro{justify-content:center}
.falta{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12.5px;color:var(--ink2)}.ok-t{color:var(--ok);font-weight:600}
.proximo .seg{margin-bottom:8px}.fila-ac{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:flex-end}
.hist{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:0}
.ev{display:flex;gap:12px;padding:10px 0;position:relative}
.ev::before{content:"";position:absolute;left:13px;top:34px;bottom:-4px;width:1px;background:var(--line)}
.ev:last-child::before{display:none}
.ev-i{display:grid;place-items:center;width:27px;height:27px;border-radius:9px;background:var(--card2);border:1px solid var(--line2);color:var(--ink2);flex:none}
.ev-contato .ev-i{color:var(--cy);border-color:color-mix(in srgb,var(--cy) 45%,transparent)}
.ev-descarte .ev-i{color:var(--bad)}.ev-automacao .ev-i{color:var(--warn)}.ev-comparecimento .ev-i,.ev-resposta .ev-i{color:var(--ok)}
.ev p{font-size:13.5px;color:var(--ink);word-break:break-word;white-space:pre-wrap}.ev small{color:var(--mut)}
.gate{text-align:center;display:flex;flex-direction:column;align-items:center;gap:6px;padding:8px 0 6px;color:var(--cy)}
.gate h3{font:800 19px "Segoe UI Variable Display","Segoe UI";color:var(--ink)}.gate p{font:700 22px "Segoe UI Variable Display","Segoe UI";color:var(--ink)}.gate small{color:var(--mut)}
.canais{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.canal-o{display:flex;flex-direction:column;align-items:center;gap:4px;border:1px solid var(--line2);border-radius:16px;padding:16px;background:var(--card);color:var(--ink2)}
.canal-o[aria-pressed="true"]{border-color:var(--cy);background:color-mix(in srgb,var(--cy) 12%,transparent);color:var(--ink);box-shadow:0 0 22px color-mix(in srgb,var(--cy) 22%,transparent)}
.canal-o small{color:var(--cy)}
.motivos{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.motivo-o{border:1px solid var(--line2);border-radius:13px;padding:12px;background:var(--card);font-weight:650}
.motivo-o[aria-pressed="true"]{border-color:var(--acc);background:color-mix(in srgb,var(--acc) 16%,transparent);box-shadow:var(--glow)}

${parte_avisos}
/* ---- pipelines (funis do documento) */
.fv-filtros{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}.fv-filtros>.in[type="search"]{flex:1 1 260px;min-width:200px}.fv-filtros>select.in,.fv-f .in{width:auto;min-width:150px}.fv-filtros>select.in{flex:0 1 210px}
.fv-f{display:flex;flex-direction:column;gap:5px;font-size:11.5px;color:var(--mut);font-weight:650}
.fv-resumo{display:flex;flex-wrap:wrap;gap:6px 26px;align-items:center;font-size:13px;color:var(--ink2)}
.fv-resumo b{font:800 18px "Segoe UI Variable Display","Segoe UI";color:var(--ink)}.fv-resumo .ruim b{color:var(--bad)}
.fv-rot{display:inline-flex;gap:6px;align-items:center;color:var(--mut);font-size:12.5px;margin-left:auto}.fv-rot.ruim{color:var(--bad)}
.fv-quadro{display:flex;gap:12px;overflow-x:auto;padding:2px 2px 14px;align-items:stretch;scroll-snap-type:x proximity}
.fv-col{flex:0 0 268px;scroll-snap-align:start;display:flex;flex-direction:column;border:1px solid var(--line);border-top:3px solid var(--ec);border-radius:16px;background:linear-gradient(180deg,color-mix(in srgb,var(--ec) 7%,var(--card2)),var(--card));max-height:calc(100vh - 250px);min-height:220px;transition:box-shadow .15s,border-color .15s}
.fv-col.alvo{border-color:var(--ec);box-shadow:0 0 0 2px color-mix(in srgb,var(--ec) 55%,transparent),0 12px 34px color-mix(in srgb,var(--ec) 25%,transparent)}
.fv-col>header{padding:12px 13px 8px}
.fv-col-t{display:flex;align-items:center;justify-content:space-between;gap:8px}.fv-col-t b{font-size:13.5px;letter-spacing:.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fv-n{min-width:24px;height:22px;border-radius:11px;padding:0 7px;display:grid;place-items:center;font-weight:800;font-size:12px;background:var(--ec);color:#fff;flex:none}
.fv-col-v{display:flex;justify-content:space-between;gap:8px;margin-top:3px;font-size:12px;color:var(--mut)}
.fv-sla{display:inline-flex;gap:4px;align-items:center}.fv-sla.ruim{color:var(--bad);font-weight:700}
.fv-col-c{display:flex;flex-direction:column;gap:8px;padding:4px 10px 12px;overflow-y:auto;flex:1;min-height:90px}
.fv-vazia{color:var(--mut);font-size:12.5px;text-align:center;padding:18px 0;margin:0}
.fv-card{display:flex;flex-direction:column;gap:6px;padding:10px 11px;border-radius:12px;border:1px solid var(--line);background:var(--solid);cursor:grab;transition:transform .12s,border-color .12s,box-shadow .12s}
.fv-card:hover,.fv-card:focus-visible{border-color:var(--ec);transform:translateY(-1px);box-shadow:0 8px 22px rgba(0,0,0,.28)}
.fv-card.arrasta{opacity:.4;cursor:grabbing}.fv-card.atrasado{border-left:3px solid var(--bad)}
.fv-card-t{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.fv-card-t b{font-size:13.5px;line-height:1.3;overflow-wrap:anywhere}
.fv-est{font-size:12px;letter-spacing:1px;white-space:nowrap}.fv-est b{color:var(--warn);font-weight:400}.fv-est i{font-style:normal;color:var(--line2)}
.fv-sub{margin:0;color:var(--ink2);font-size:12px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.fv-card-v{display:flex;align-items:center;gap:8px}.fv-card-v b{font:800 15px "Segoe UI Variable Display","Segoe UI"}
.fv-neg{font-size:10.5px;font-weight:700;padding:1px 7px;border-radius:7px;background:color-mix(in srgb,var(--ok) 18%,transparent);color:var(--ok)}
.fv-tags{display:flex;flex-wrap:wrap;gap:5px}.fv-tag{font-size:10.5px;padding:1px 7px;border-radius:7px;background:var(--card);border:1px solid var(--line);color:var(--ink2)}
.fv-tag.un{color:var(--cy)}.fv-tag.st{color:var(--warn);border-color:color-mix(in srgb,var(--warn) 45%,transparent)}
.fv-card-r{display:flex;align-items:center;justify-content:space-between;gap:8px}.fv-desde{font-size:11px;color:var(--mut)}
.avatar.peq{width:22px;height:22px;font-size:10px}
.fv-atraso{display:flex;gap:5px;align-items:center;font-size:11px;font-weight:700;color:var(--bad)}
.fv-dr{display:flex;flex-direction:column;gap:16px;padding-top:6px}
.fv-dr-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:26px;align-items:start}
.fv-col-dr{display:flex;flex-direction:column;gap:22px;min-width:0}
.fv-kv{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid var(--line);font-size:13px}.fv-kv span{color:var(--mut)}.fv-kv b{text-align:right;overflow-wrap:anywhere}.fv-kv.fv-kv-v{flex-direction:column;justify-content:flex-start;align-items:stretch;gap:6px}
.fv-obs{margin-top:10px;padding:10px 12px;border-radius:12px;background:color-mix(in srgb,var(--ink) 5%,transparent);border:1px solid var(--line)}.fv-obs span{display:block;margin-bottom:4px;color:var(--mut);font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}.fv-obs p{margin:0;font-size:13px;line-height:1.45;overflow-wrap:anywhere}
.fv-form{display:flex;flex-direction:column;gap:10px}
/* ritmo vertical nas gavetas e janelas: campos, botões e textos nunca ficam colados */
.fv-dr-grid>section>*+*,.fv-col-dr>section>*+*{margin-top:12px}
.fv-dr-grid>section>h4+*,.fv-col-dr>section>h4+*,.fv-dr-grid>section>.fv-kv+.fv-kv{margin-top:0}
.m-caixa.lead .sec>*+*{margin-top:10px}
.m-caixa.lead .sec>h4+*,.m-caixa.lead .sec>.grade-f+*{margin-top:0}
.fv-cfg-e .ic-btn{width:30px;height:30px}
.fv-tl{list-style:none;margin:0;padding:0 0 0 12px;display:flex;flex-direction:column;border-left:2px solid var(--line)}
.fv-tl li{position:relative;padding:0 0 18px 18px;display:flex}.fv-tl .fv-ponto{position:absolute;left:-8px;top:3px;width:12px;height:12px;border-radius:50%;background:var(--ec);box-shadow:0 0 0 3px var(--solid)}
.fv-tl b{display:block;font-size:14px}.fv-tl small{color:var(--mut)}
.fv-lista{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}.fv-lista li{display:flex;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:12px;border:1px solid var(--line);background:var(--card)}.fv-lista p{margin:3px 0;font-size:13px}.fv-lista small{color:var(--mut)}
.fv-guia{padding:14px;border-radius:16px;border:1px solid color-mix(in srgb,var(--warn) 40%,transparent);background:color-mix(in srgb,var(--warn) 6%,transparent)}
.fv-msg{margin-top:12px;display:flex;flex-direction:column;gap:8px}.fv-msg pre{margin:0;white-space:pre-wrap;font:inherit;font-size:13px;line-height:1.5;padding:10px 12px;border-radius:12px;background:var(--solid);border:1px solid var(--line)}
.fv-cfg-l{display:flex;flex-direction:column;gap:8px}
.fv-cfg-e{display:grid;grid-template-columns:38px minmax(0,1fr) 110px 30px 30px 30px;gap:8px;align-items:center}.fv-cfg-e input[type=color]{width:36px;height:34px;border:1px solid var(--line2);border-radius:9px;background:transparent;padding:2px}
.fv-topo-sel{grid-column:2;font:800 10px ui-monospace,Consolas,monospace;letter-spacing:.12em;color:var(--mut);margin-top:-4px}
.fv-cfg-a{padding:12px;border-radius:14px;border:1px solid var(--line);background:var(--card);display:flex;flex-direction:column;gap:10px}
.fv-cfg-a-h{display:flex;align-items:center;justify-content:space-between;gap:10px}
.fv-cfg-a-h b{font:800 11px ui-monospace,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--mut)}
.fv-cfg-a-h .ic-btn{width:30px;height:30px;border-radius:9px}
.ic-btn.btn-rm{transition:color .15s,border-color .15s,background .15s}
.ic-btn.btn-rm:hover:not(:disabled),.ic-btn.btn-rm:focus-visible:not(:disabled){color:var(--bad);border-color:color-mix(in srgb,var(--bad) 50%,transparent);background:color-mix(in srgb,var(--bad) 10%,transparent)}
.ic-btn.btn-rm:disabled{opacity:.4;cursor:not-allowed}
.fv-opc{display:flex;gap:12px;align-items:flex-start;padding:10px 12px;border-radius:12px;border:1px solid var(--line);background:var(--card);cursor:pointer}.fv-opc b{display:block}.fv-opc small{color:var(--mut)}
.fv-sync-o{display:flex;flex-direction:column;gap:8px}.fv-sync-c{margin-top:10px}.fv-sync-s{margin-top:10px}
.fv-acoes{display:flex;justify-content:flex-end}
.fv-barra{display:inline-block;width:70px;height:6px;border-radius:3px;background:var(--line);vertical-align:middle;overflow:hidden}.fv-barra u{display:block;height:100%;background:var(--g3);text-decoration:none}
.fv-fluxo{display:flex;flex-direction:column;max-height:300px;overflow:auto}.fv-fluxo>div{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--line);font-size:13px}.fv-fluxo em{margin-left:auto;font-style:normal;font-weight:800}
.fv-alertas{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr));gap:10px}.fv-alertas .au-previa b{display:block}.fv-alertas p{margin:3px 0 0;font-size:13px}
.fv-alertas .n-risco{border-color:color-mix(in srgb,var(--bad) 50%,transparent);background:color-mix(in srgb,var(--bad) 8%,transparent)}.fv-alertas .n-atencao{border-color:color-mix(in srgb,var(--warn) 50%,transparent);background:color-mix(in srgb,var(--warn) 8%,transparent)}
.fv-tab th,.fv-tab td{padding:10px 12px;text-align:left}.fv-tab th{white-space:normal;vertical-align:bottom;font-size:12px;line-height:1.3}.fv-tab td.num,.fv-tab th:not(:first-child){text-align:right}
.fv-dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:8px}
.m-gaveta .m-caixa.fv-drawer{max-width:880px}
td.ruim{color:var(--bad);font-weight:800}
@media (max-width:900px){.fv-dr-grid{grid-template-columns:1fr}.fv-cfg-e{grid-template-columns:34px minmax(0,1fr) 80px 28px 28px 28px}.fv-col{flex-basis:84vw}}
@media print{.fv-filtros,.tabs-an,.tela-ac{display:none!important}}

/* ---- funil: pipeline e automações */
.au-sec{display:flex;flex-direction:column;gap:14px}
.pp-trilho{display:flex;flex-wrap:wrap;gap:10px 0;align-items:stretch}
.pp-cel{display:flex;align-items:center;flex:1 1 0;min-width:168px}
.pp-etapa{flex:1;align-self:stretch;display:flex;flex-direction:column;gap:9px;padding:14px 14px 12px;border-radius:16px;border:1px solid var(--line);border-top:3px solid var(--ec);background:linear-gradient(180deg,color-mix(in srgb,var(--ec) 9%,var(--card2)),var(--card))}
.pp-etapa header{display:flex;align-items:center;justify-content:space-between;gap:8px}.pp-etapa header b{font-size:15px}
.pp-n{min-width:26px;height:26px;border-radius:13px;padding:0 8px;display:grid;place-items:center;font-weight:800;font-size:13px;background:var(--ec);color:#fff}
.pp-v{font:800 20px "Segoe UI Variable Display","Segoe UI";letter-spacing:-.02em}
.pp-lim{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--mut)}.pp-lim.ruim{color:var(--bad);font-weight:700}
.pp-sec small{display:block;font:800 10px ui-monospace,Consolas,monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--mut);margin-bottom:5px}
.pp-passos,.pp-auts{display:flex;flex-wrap:wrap;gap:5px}
.pp-passo{display:inline-flex;gap:6px;align-items:center;padding:3px 8px;border-radius:8px;font-size:11.5px;background:var(--card);border:1px solid var(--line);color:var(--ink2)}.pp-passo b{color:var(--ec,var(--cy));font-family:ui-monospace,Consolas,monospace}
.pp-vazio{font-size:12px;color:var(--mut)}
.pp-seta{color:var(--mut);padding:0 4px;flex:none}
.wa-vars{display:grid;gap:10px;margin:12px 0}.check-l{display:flex;gap:10px;align-items:flex-start;margin:14px 0 8px;font-size:13px;line-height:1.4;cursor:pointer}.check-l input{margin-top:3px;flex:none}
.pp-cel:not(:last-child)>.pp-etapa:last-child{margin-right:14px}
.pp-add{align-self:flex-start;margin-top:auto;display:inline-flex;gap:6px;align-items:center;border:1px dashed var(--line2);background:transparent;color:var(--ink2);border-radius:9px;padding:5px 10px;font-size:12px;font-weight:650;cursor:pointer}.pp-add:hover{border-color:var(--cy);color:var(--cy)}
.au-chip{display:inline-flex;align-items:center;gap:5px;max-width:100%;padding:4px 9px;border-radius:9px;border:1px solid color-mix(in srgb,var(--cy) 45%,transparent);background:color-mix(in srgb,var(--cy) 10%,transparent);color:var(--ink);font-size:11.5px;font-weight:650;cursor:pointer;text-align:left}
.au-chip:hover{background:color-mix(in srgb,var(--cy) 20%,transparent)}.au-chip.guia{border-color:color-mix(in srgb,var(--warn) 50%,transparent);background:color-mix(in srgb,var(--warn) 10%,transparent)}.au-chip.off{opacity:.5;border-style:dashed}
.au-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(440px,100%),1fr));gap:14px}
.au-card{display:flex;flex-direction:column;gap:12px;padding:16px 18px;border-radius:18px;border:1px solid var(--line);background:linear-gradient(180deg,var(--card2),var(--card))}
.au-card.off{opacity:.65}
.au-card>header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.au-card>header b{font-size:15px;line-height:1.3}
.au-guia{margin-left:8px;font:800 9.5px ui-monospace,Consolas,monospace;letter-spacing:.12em;padding:2px 7px;border-radius:6px;background:color-mix(in srgb,var(--warn) 18%,transparent);color:var(--warn);vertical-align:middle}
.au-frase{display:flex;flex-direction:column;gap:7px}.au-frase>div{display:grid;grid-template-columns:62px 1fr;gap:10px;align-items:baseline;font-size:13.5px;line-height:1.5}
.au-frase em{font:800 10px ui-monospace,Consolas,monospace;letter-spacing:.12em;font-style:normal;color:var(--mut)}
.au-frase span{display:flex;flex-wrap:wrap;gap:5px}
.au-frase .au-f,.au-frase .au-a{font-style:normal;padding:2px 9px;border-radius:8px;font-size:12.5px;background:var(--card);border:1px solid var(--line)}.au-frase .au-a{border-color:color-mix(in srgb,var(--acc) 40%,transparent);background:color-mix(in srgb,var(--acc) 9%,transparent)}
.au-frase.peq>div{font-size:12.5px}
.au-card>footer{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:auto;padding-top:10px;border-top:1px solid var(--line)}
.au-meta{font-size:12px;color:var(--mut)}.au-bt{display:flex;gap:6px;flex-wrap:wrap}
.peq-b{padding:5px 11px;font-size:12.5px}
.sw{width:42px;height:24px;border-radius:12px;border:1px solid var(--line2);background:var(--card2);position:relative;flex:none;cursor:pointer;transition:background .2s}
.sw i{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:var(--mut);transition:transform .2s,background .2s}
.sw.on{background:color-mix(in srgb,var(--ok) 35%,transparent);border-color:var(--ok)}.sw.on i{transform:translateX(18px);background:var(--ok)}
.au-log ul{list-style:none;margin:0 0 10px;padding:0;display:flex;flex-direction:column}
.au-log li{display:grid;grid-template-columns:96px minmax(160px,1.2fr) minmax(120px,1fr) 2fr;gap:12px;align-items:center;padding:9px 0;border-bottom:1px solid var(--line);font-size:13px}.au-log li:last-child{border-bottom:0}
.au-t{color:var(--mut);font-family:ui-monospace,Consolas,monospace;font-size:12px}.au-r{color:var(--ink2)}
.au-lk{border:0;background:transparent;color:var(--cy);font-weight:700;text-align:left;cursor:pointer;padding:0;font-size:13px}.au-lk:hover{text-decoration:underline}
.au-modelos{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(360px,100%),1fr));gap:12px}
.au-modelo{display:flex;flex-direction:column;gap:8px;text-align:left;padding:14px 16px;border-radius:16px;border:1px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer;font:inherit}.au-modelo:hover{border-color:var(--cy);background:var(--card2)}
.au-modelo p{color:var(--ink2);font-size:13px;margin:0}
.m-caixa.au-modal{max-width:min(1040px,96vw)}
.au-editor{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(min(250px,100%),1fr);gap:24px;align-items:start}
.au-form{display:flex;flex-direction:column;gap:18px;min-width:0}
.au-h{font:800 11.5px ui-monospace,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--mut);margin:0 0 10px}
.au-bloco{display:flex;flex-direction:column;gap:12px}.au-bloco h5{margin:6px 0 0;font-size:13px;color:var(--ink2)}
.au-linha{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.au-linha.dois{grid-template-columns:repeat(2,minmax(0,1fr))}
.au-num{max-width:none}
.au-acao{display:grid;grid-template-columns:26px 190px minmax(0,1fr) 40px 40px;gap:8px;align-items:center}
.au-acao .ic-btn{width:40px;height:40px;padding:0}
.au-acao-c{min-width:0}.au-acao-c .in{width:100%}
.au-acao.msg{grid-template-columns:26px minmax(0,1fr) 40px 40px;align-items:start}.au-acao.msg .au-ord{margin-top:8px}.au-acao.msg .au-acao-c{grid-column:2/-1;grid-row:2}
.au-ord{width:24px;height:24px;border-radius:8px;display:grid;place-items:center;font:800 12px ui-monospace,Consolas,monospace;background:var(--card2);border:1px solid var(--line2)}
.au-lig{display:flex;align-items:center;gap:10px;font-weight:600;font-size:14px}
.au-previa{padding:12px 14px;border-radius:12px;background:color-mix(in srgb,var(--cy) 8%,transparent);border:1px solid color-mix(in srgb,var(--cy) 30%,transparent);font-size:13.5px;line-height:1.55}.au-previa:empty{display:none}
.au-lado{position:sticky;top:0;padding:16px;border-radius:16px;border:1px solid var(--line);background:var(--card)}
.au-sim{display:flex;flex-direction:column;gap:8px}.au-sim-n{display:flex;align-items:baseline;gap:8px}.au-sim-n b{font:800 34px "Segoe UI Variable Display","Segoe UI"}.au-sim small{color:var(--mut);line-height:1.5}
.au-amostra{display:flex;flex-direction:column;gap:6px;margin-top:6px;max-height:260px;overflow:auto}
@media (max-width:900px){.au-editor{grid-template-columns:1fr}.au-acao{grid-template-columns:26px 1fr 40px 40px}.au-acao-c{grid-column:2/-1}.au-lado{position:static}.au-grid{grid-template-columns:1fr}.au-log li{grid-template-columns:1fr;gap:2px}.pp-seta{display:none}}

/* ---- modal de etapa: largo, com abas */
.m-caixa.larga{max-width:min(1180px,96vw);height:min(880px,92vh)}
.m-caixa.larga .m-corpo{flex:1;min-height:0}
.it-abas{position:sticky;top:-18px;z-index:5;display:flex;gap:4px;margin:-18px -22px 0;padding:10px 22px 0;background:var(--solid);border-bottom:1px solid var(--line)}
.it-aba{display:flex;align-items:center;gap:8px;border:0;background:transparent;color:var(--mut);font-weight:700;font-size:14px;padding:10px 16px;border-bottom:2px solid transparent;margin-bottom:-1px;cursor:pointer}
.it-aba:hover{color:var(--ink)}
.it-aba[aria-selected="true"]{color:var(--ink);border-bottom-color:var(--tc,var(--acc))}
.it-aba[aria-selected="true"] .ico{color:var(--tc,var(--acc))}
.it-host{display:flex;flex-direction:column;gap:18px;animation:sobe .25s both}
.it-det{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:26px;align-items:start}
.it-col{display:flex;flex-direction:column;gap:18px;min-width:0}
.it-auto{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.it-au-c{display:flex;flex-direction:column;gap:12px;min-width:0;padding:18px;border-radius:16px;border:1px solid color-mix(in srgb,var(--cy) 30%,var(--line));background:color-mix(in srgb,var(--cy) 5%,var(--card))}
.it-au-c header{display:flex;align-items:center;gap:10px}
.it-au-c header .ico{color:var(--cy);flex:none}
.it-au-c h4{margin:0;font-size:15px}
.it-au-c>p{margin:0;color:var(--ink2);font-size:13px;line-height:1.5}
.it-au-l{display:flex;flex-direction:column;gap:8px;margin:0;padding:0;list-style:none}
.it-au-l li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;align-items:center;padding:10px 12px;border-radius:12px;border:1px solid var(--line);background:var(--card)}
.it-au-l li b{font-size:13.5px;min-width:0;overflow-wrap:anywhere}
.it-au-l li small{grid-column:1;color:var(--mut);line-height:1.45;min-width:0}
.it-au-l li .btn{grid-column:2;grid-row:1/span 2;align-self:center}
.it-au-vazio{margin:0;padding:12px 14px;border-radius:12px;border:1px dashed var(--line2);color:var(--mut);font-size:13px}
.it-au-guia{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;color:var(--ink2)}
.it-au-c>.btn{align-self:flex-start;margin-top:auto}
.au-msg{display:flex;flex-direction:column;gap:8px;min-width:0}
.au-msg-ta{width:100%;resize:vertical;min-height:120px;line-height:1.5}
.au-msg-campos{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12.5px;color:var(--mut)}
.au-msg-chip{border:1px solid var(--line2);background:var(--card2);color:var(--ink);border-radius:999px;padding:4px 10px;font:700 12px ui-monospace,Consolas,monospace;cursor:pointer}.au-msg-chip:hover{border-color:var(--cy)}
.au-msg-previa{padding:10px 12px;border-radius:12px;border:1px solid var(--line);background:var(--card);display:flex;flex-direction:column;gap:4px}.au-msg-previa small{color:var(--mut);font-weight:700}.au-msg-previa p{margin:0;font-size:13.5px;line-height:1.55;white-space:normal;overflow-wrap:anywhere}
@media (max-width:900px){.it-auto{grid-template-columns:1fr}}
.it-tool{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;color:var(--mut);font-size:13px;font-weight:600}
.it-kpis{grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}
.it-grid{gap:16px}
.it-cont{display:flex;gap:26px;align-items:center;flex-wrap:wrap}.it-cont>*:first-child{flex:1;min-width:200px}
.it-carrega{display:flex;gap:7px;justify-content:center;padding:80px 0}.it-carrega i{width:10px;height:10px;border-radius:50%;background:var(--tc,var(--acc));animation:agPonto 1s infinite}.it-carrega i:nth-child(2){animation-delay:.15s}.it-carrega i:nth-child(3){animation-delay:.3s}
.it-capa{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 22px;border-radius:18px;border:1px solid var(--line2);background:linear-gradient(120deg,color-mix(in srgb,var(--tc,var(--acc)) 16%,var(--solid2)),var(--solid2))}
.it-capa small{font:800 11px ui-monospace,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--mut)}
.it-capa h3{font:800 24px/1.2 "Segoe UI Variable Display","Segoe UI";letter-spacing:-.02em;margin-top:4px}
.it-saude{display:inline-flex;align-items:center;gap:9px;padding:8px 16px;border-radius:20px;font-weight:800;font-size:13.5px;background:var(--card2);border:1px solid var(--line2)}
.it-saude i{width:10px;height:10px;border-radius:50%;background:var(--ok);box-shadow:0 0 12px var(--ok)}
.t-atencao .it-saude i{background:var(--warn);box-shadow:0 0 12px var(--warn)}.t-risco .it-saude i{background:var(--bad);box-shadow:0 0 12px var(--bad);animation:agPonto 1.2s infinite}
.it-hist-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:26px;align-items:start}
.it-historia{display:flex;flex-direction:column;gap:6px;position:relative}
.it-cap{display:grid;grid-template-columns:38px 1fr;gap:14px;padding:16px 0;border-bottom:1px solid var(--line)}.it-cap:last-child{border-bottom:0}
.it-cap-n{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;font:800 14px ui-monospace,Consolas,monospace;color:#fff;background:linear-gradient(135deg,var(--tc,var(--acc)),var(--acc2))}
.it-cap h4{font:800 16px "Segoe UI Variable Display","Segoe UI";margin-bottom:5px}
.it-cap p{font-size:15px;line-height:1.7;color:var(--ink2)}.it-cap p strong{color:var(--ink)}
.it-cards{display:flex;flex-direction:column;gap:10px;position:sticky;top:56px}
.it-cards-t{font:800 11.5px ui-monospace,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--mut)}
.it-ins{padding:13px 15px;border-radius:14px;border:1px solid var(--line);border-left:3px solid var(--cy);background:var(--card)}
.it-ins em{font:800 10.5px ui-monospace,Consolas,monospace;letter-spacing:.12em;text-transform:uppercase;font-style:normal;color:var(--cy)}
.it-ins b{display:block;margin-top:3px;font-size:14.5px}.it-ins p{margin-top:3px;font-size:13px;line-height:1.5;color:var(--ink2)}
.it-ins.n-risco{border-left-color:var(--bad)}.it-ins.n-risco em{color:var(--bad)}
.it-ins.n-atencao{border-left-color:var(--warn)}.it-ins.n-atencao em{color:var(--warn)}
.it-ins.n-bom{border-left-color:var(--ok)}.it-ins.n-bom em{color:var(--ok)}
@media (max-width:900px){.it-det,.it-hist-grid{grid-template-columns:1fr}.it-grid>*{grid-column:span 12!important}.it-cards{position:static}.m-caixa.larga{height:94vh}}

${parte_agente}
${parte_dados}
/* ---- Análises: abas, visão executiva e Meu Report */
${parte_abas}
.sub-t{display:block;font:700 10.5px ui-monospace,Consolas,monospace;letter-spacing:.12em;color:var(--mut);margin:12px 0 4px}
.grade.vert{stroke-dasharray:2 4}
.bolha{transition:filter .15s}.bolha:hover{filter:brightness(1.15)}
.kpis2.oito{grid-template-columns:repeat(4,minmax(0,1fr))}
.rep-bar{display:flex;justify-content:space-between;align-items:flex-end;gap:14px;flex-wrap:wrap}
.rep-sel{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;color:var(--mut)}.rep-sel select{min-width:220px}
.resumo-dir{border-left:4px solid var(--acc)}
.resumo-l{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:9px}
.resumo-l li{position:relative;padding-left:20px;font-size:14.5px;line-height:1.6;color:var(--ink2)}
.resumo-l li::before{content:"";position:absolute;left:3px;top:.65em;width:8px;height:8px;border-radius:50%;background:var(--acc)}
.pos-g{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:22px}
.pos-h{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px}.pos-h b{font-size:13.5px}
.print-only{display:none}
@media print{
  :root,:root[data-theme="dark"],:root[data-theme="light"]{color-scheme:light;--bg:#fff;--solid:#fff;--solid2:#f6f6f6;--card:#fff;--card2:#f4f4f4;--ink:#111;--ink2:#333;--mut:#666;--line:#d8d8d8;--line2:#bbb;--shadow:none;--cy:#0097b8;--ok:#0a9d67;--warn:#c97800;--bad:#d3173d;--acc:#d3173d;--g1:#0097b8;--g2:#e0501c;--g3:#0a9d67;--g4:#c97800;--g5:#6a4ff0;--g6:#6b7194;--c-aberto:#3d5af0;--ag0:#0097b8;--ag1:#2a86d6;--ag2:#6a4ff0;--ag3:#b13fc0;--ag4:#d3173d}
  body{background:#fff!important;min-height:0}body::before,body::after{display:none}
  .side,.topo,.no-print,.tabs-an,.tela-ac,.toasts,.tip{display:none!important}
  .app{display:block}main{padding:0;max-width:none}
  .tela-h{display:none}
  .print-only{display:block}.print-h{margin-bottom:6px}.print-h h2{font-size:22px}.print-h p{color:#555;font-size:12px}
  .cartao,.kpi2,.al,.exe-kpis{break-inside:avoid;box-shadow:none;animation:none;background:#fff}
  .g12{gap:10px}.hoje{gap:12px}
  .svg-chart.enter,.bar-f{animation:none}
}

.prior{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:11px 18px;border-radius:14px;background:linear-gradient(90deg,color-mix(in srgb,var(--acc) 26%,transparent),color-mix(in srgb,var(--acc) 6%,transparent));border:1px solid color-mix(in srgb,var(--acc) 45%,transparent)}
.prior b:first-of-type{font:800 12px ui-monospace,Consolas,monospace;letter-spacing:.14em;color:var(--acc)}
.prior span b{color:var(--acc)}

.stat2{display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--line);border-radius:14px;margin-bottom:14px;overflow:hidden}
.stat2>div{padding:10px 14px;display:flex;flex-direction:column;gap:2px}.stat2>div+div{border-left:1px solid var(--line)}
.stat2 small{font:700 10.5px ui-monospace,Consolas,monospace;letter-spacing:.1em;color:var(--mut)}.stat2 b{font-size:20px}.stat2 b.verde{color:var(--ok)}

/* ---- Cockpit executivo (identidade própria: malha de gradientes, vidro, números grandes) */
.exe{display:flex;flex-direction:column;gap:20px}
.modo-exe .cartao{border-radius:26px;background:linear-gradient(155deg,color-mix(in srgb,var(--card2) 94%,transparent),color-mix(in srgb,var(--card) 62%,transparent));border:1px solid var(--line);box-shadow:var(--shadow);position:relative;overflow:hidden}
.modo-exe .cartao::before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(420px 150px at 0% 0%,color-mix(in srgb,var(--g5) 10%,transparent),transparent 70%)}
.modo-exe .cartao>*{position:relative}
.cx-eyebrow{font:700 11px ui-monospace,Consolas,monospace;letter-spacing:.16em;color:var(--cy);text-transform:uppercase}
.cx-hero{position:relative;display:grid;grid-template-columns:minmax(0,1.45fr) minmax(0,1fr);gap:30px;padding:32px 34px;border-radius:32px;border:1px solid var(--line2);overflow:hidden;box-shadow:var(--shadow);
  background:radial-gradient(900px 380px at 0% -10%,color-mix(in srgb,var(--g3) 28%,transparent),transparent 62%),radial-gradient(700px 420px at 100% 8%,color-mix(in srgb,var(--g5) 28%,transparent),transparent 62%),radial-gradient(560px 360px at 55% 125%,color-mix(in srgb,var(--g1) 20%,transparent),transparent 62%),var(--solid)}
.cx-hero>*{position:relative;min-width:0}
.cx-num{font:800 clamp(44px,6vw,78px)/1 "Segoe UI Variable Display","Segoe UI",system-ui;letter-spacing:-.045em;margin:10px 0 12px;font-variant-numeric:tabular-nums;background:linear-gradient(100deg,var(--ink) 35%,color-mix(in srgb,var(--ink) 35%,var(--g1)));-webkit-background-clip:text;background-clip:text;color:transparent}
.cx-sub{display:flex;gap:12px;align-items:center;flex-wrap:wrap;color:var(--ink2);font-size:14px}
.cx-pill{display:inline-flex;gap:6px;align-items:center;border-radius:999px;padding:4px 13px;font-weight:700;font-size:12.5px;border:1px solid var(--line2);background:var(--card)}
.cx-pill i{font-style:normal;font-size:9px}
.cx-pill.bom{color:var(--ok);border-color:color-mix(in srgb,var(--ok) 50%,transparent);background:color-mix(in srgb,var(--ok) 13%,transparent)}
.cx-pill.ruim{color:var(--bad);border-color:color-mix(in srgb,var(--bad) 50%,transparent);background:color-mix(in srgb,var(--bad) 13%,transparent)}
.cx-mix{margin-top:18px}.cx-mix .stack{height:12px}
.cx-mix-l{display:flex;flex-wrap:wrap;gap:6px 24px;margin-top:10px;font-size:13px;color:var(--ink2)}
.cx-mix-l span{display:inline-flex;align-items:center;gap:7px}.cx-mix-l i{width:9px;height:9px;border-radius:3px}.cx-mix-l b{color:var(--ink)}.cx-mix-l em{font-style:normal;color:var(--mut)}
.cx-curva{margin-top:12px}
.cx-r{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-content:center}
.cx-tile{border:1px solid var(--line);border-radius:22px;padding:18px 20px;background:color-mix(in srgb,var(--solid) 58%,transparent);backdrop-filter:blur(10px);display:flex;flex-direction:column;gap:4px;justify-content:center;min-height:150px}
.cx-tile small{font:700 10.5px ui-monospace,Consolas,monospace;letter-spacing:.12em;color:var(--mut)}
.cx-tile b{font:800 25px/1.1 "Segoe UI Variable Display","Segoe UI";letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.cx-tile span{color:var(--ink2);font-size:12.5px}.cx-tile em{font-style:normal;color:var(--mut);font-size:12.5px}
.med{display:flex;flex-direction:column;align-items:center;gap:2px;border:1px solid var(--line);border-radius:22px;padding:12px 8px 10px;background:color-mix(in srgb,var(--solid) 58%,transparent);backdrop-filter:blur(10px)}
.med-s{position:relative}.med-s svg{display:block;overflow:visible}.med-t{stroke:color-mix(in srgb,var(--ink) 10%,transparent)}
.med-c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;padding-top:4px}
.med-c b{font:800 22px "Segoe UI Variable Display","Segoe UI";letter-spacing:-.02em}.med-c small{color:var(--mut);font-size:11px}
.med-r{font-size:12px;font-weight:700;color:var(--ink2);margin-top:-6px}
.briefing{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.brief{position:relative;border:1px solid var(--line);border-radius:24px;padding:20px 22px;background:linear-gradient(160deg,var(--card2),var(--card));display:flex;flex-direction:column;gap:8px;overflow:hidden}
.brief::before{content:"";position:absolute;left:0;right:0;top:0;height:3px;background:linear-gradient(90deg,var(--bc),transparent)}
.brief::after{content:"";position:absolute;right:-40px;top:-40px;width:140px;height:140px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--bc) 18%,transparent),transparent 70%);pointer-events:none}
.b-risco{--bc:var(--bad)}.b-atencao{--bc:var(--warn)}.b-info{--bc:var(--cy)}
.brief-h{display:flex;align-items:center;gap:12px}
.brief-i{display:grid;place-items:center;width:36px;height:36px;border-radius:12px;background:color-mix(in srgb,var(--bc) 18%,transparent);color:var(--bc);font-size:14px;flex:none}
.brief-h small{display:block;font:700 10.5px ui-monospace,Consolas,monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--bc)}
.al-tag{font:700 10px ui-monospace,Consolas,monospace;letter-spacing:.08em;color:var(--mut)}
.brief h4{font:700 17px/1.3 "Segoe UI Variable Display","Segoe UI";letter-spacing:-.01em}.brief p{font-size:13px;color:var(--ink2);line-height:1.5}
.brief-m{margin-top:2px}.brief-m>div{height:6px;border-radius:4px;background:color-mix(in srgb,var(--ink) 8%,transparent);overflow:hidden}
.brief-m i{display:block;height:100%;border-radius:4px;background:linear-gradient(90deg,var(--bc),color-mix(in srgb,var(--bc) 45%,transparent))}
.brief-m small{display:block;margin-top:5px;color:var(--mut);font-size:11.5px}
.brief-b{align-self:flex-start;margin-top:4px;border-color:color-mix(in srgb,var(--bc) 55%,transparent)}
.brief-a{color:var(--ink)!important}
.sankey .sk-l{fill:none;opacity:.5;animation:skIn .9s cubic-bezier(.2,.8,.2,1) both;transition:opacity .2s}
@keyframes skIn{from{opacity:0}to{opacity:.5}}
.sankey.foco .sk-l{opacity:.12}.sankey.foco .sk-l.on{opacity:.9}
.sk-n{transition:filter .2s}.sk-n:hover{filter:brightness(1.2)}
.sk-t{fill:var(--ink);font:700 12.5px "Segoe UI",system-ui;paint-order:stroke;stroke:var(--solid);stroke-width:4px;stroke-linejoin:round}
.sk-v{fill:var(--ink2);font:600 11.5px ui-monospace,Consolas,monospace;paint-order:stroke;stroke:var(--solid);stroke-width:4px;stroke-linejoin:round}
.share{margin-bottom:14px}.share .stack{height:14px}.share small{display:block;margin-top:6px;color:var(--mut);font-size:11.5px}
.race{display:flex;flex-direction:column;gap:10px}
.race-r{display:grid;grid-template-columns:20px 36px minmax(0,1fr);gap:10px;align-items:center;padding:4px 6px;margin:0 -6px;border-radius:12px}.race-r:hover{background:var(--card2)}
.race-n{font:800 13px ui-monospace,Consolas,monospace;color:var(--mut);text-align:center}
.race-t{display:flex;justify-content:space-between;gap:10px;font-size:13px;margin-bottom:4px}.race-t span{color:var(--ink2);font-variant-numeric:tabular-nums}
.race-f{height:9px;border-radius:5px;background:color-mix(in srgb,var(--ink) 7%,transparent);overflow:hidden}.race-f i{display:block;height:100%;border-radius:5px;animation:cresce .8s cubic-bezier(.2,.7,.2,1) both;transform-origin:left}
.lanes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.lane{border:1px solid var(--line);border-top:3px solid var(--lc);border-radius:20px;background:color-mix(in srgb,var(--solid) 42%,transparent);display:flex;flex-direction:column;min-width:0}
.lane header{display:flex;align-items:center;gap:12px;padding:14px 16px 8px}
.lane-i{display:grid;place-items:center;width:30px;height:30px;border-radius:10px;background:color-mix(in srgb,var(--lc) 18%,transparent);color:var(--lc);font-size:12px;flex:none}
.lane header b{font-size:14px}.lane header small{display:block;color:var(--mut);font-size:11.5px}
.lane-n{margin-left:auto;text-align:right}.lane-n b{font:800 22px/1 "Segoe UI Variable Display","Segoe UI"}.lane-n small{display:block}
.lane-l{display:flex;flex-direction:column;gap:8px;padding:6px 12px 14px}
.lc{border:1px solid var(--line);border-radius:14px;padding:11px 13px;background:var(--solid);cursor:pointer;display:flex;flex-direction:column;gap:7px;transition:border-color .15s,transform .15s}
.lc:hover,.lc:focus-visible{border-color:var(--lc);transform:translateY(-2px)}
.lc-t{display:flex;align-items:center;gap:10px}.lc-t>div{min-width:0;flex:1}.lc-t b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13.5px}.lc-t small{display:block;color:var(--mut);font-size:11px;text-transform:uppercase;letter-spacing:.04em}.lc-t strong{font:800 14px ui-monospace,Consolas,monospace}
.lc .avatar{width:30px;height:30px;border-radius:10px;font-size:11px}
.lc-m{display:flex;gap:8px;align-items:center;font-size:11.5px}.lc-e{color:var(--ink2)}.lc-p{margin-left:auto;border-radius:999px;padding:1px 9px;background:color-mix(in srgb,var(--lc) 14%,transparent);color:var(--lc);font-weight:700}
.lc-a{display:flex;gap:6px;align-items:center;color:var(--ink2);font-size:12px}
.lane-mais{align-self:center}
.bul{display:flex;flex-direction:column;gap:16px;margin-bottom:12px}
.bul-r{padding:4px 8px;margin:0 -8px;border-radius:12px}.bul-r:hover{background:var(--card2)}
.bul-h{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:6px;font-size:13px}
.bul-w{font:700 11.5px ui-monospace,Consolas,monospace;color:var(--c-aberto)}.bul-w.sem{color:var(--mut)}
.bul-b{position:relative;height:16px}.bul-b i{position:absolute;left:0;top:0;bottom:0;border-radius:8px}
.bul-b .fan{background:color-mix(in srgb,var(--c-aberto) 22%,transparent)}.bul-b .esp{background:linear-gradient(90deg,var(--c-aberto),var(--g5));box-shadow:0 0 14px color-mix(in srgb,var(--c-aberto) 50%,transparent)}
.bul-v{margin-top:5px;font-size:12.5px;color:var(--mut)}.bul-v b{color:var(--ink)}
.degrau{transition:filter .2s,opacity .2s}.degrau:hover{filter:brightness(1.18)}
.dg-r{fill:var(--ink2);font:600 12.5px "Segoe UI",system-ui}.dg-n{fill:#fff;font:800 15px "Segoe UI",system-ui;pointer-events:none}.dg-v{fill:var(--ink2);font:600 12px ui-monospace,Consolas,monospace}
.ponto{cursor:pointer;transition:filter .15s}.ponto:hover{filter:brightness(1.3) drop-shadow(0 0 6px currentColor)}
.tm{transition:filter .2s}.tm:hover{filter:brightness(1.18)}.tm-t{fill:#fff;font:700 13px "Segoe UI",system-ui;pointer-events:none}.tm-v{fill:rgba(255,255,255,.92);font:600 12px ui-monospace,Consolas,monospace;pointer-events:none}
.ns-top{display:flex;align-items:center;gap:18px;margin-bottom:16px;flex-wrap:wrap}
.ns-v small{display:block;font:700 10.5px ui-monospace,Consolas,monospace;letter-spacing:.12em;color:var(--mut)}.ns-v b{font:800 26px/1.15 "Segoe UI Variable Display","Segoe UI";letter-spacing:-.03em}.ns-v em{display:block;font-style:normal;color:var(--mut);font-size:12.5px}
.stepper{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.st{position:relative;border:1px solid var(--line);border-radius:16px;padding:12px 14px;background:color-mix(in srgb,var(--solid) 55%,transparent);display:flex;flex-direction:column;gap:1px;overflow:hidden}
.st::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--sc)}
.st i{position:absolute;right:10px;top:10px;width:8px;height:8px;border-radius:50%;background:var(--sc);box-shadow:0 0 10px var(--sc)}
.st b{font:800 22px "Segoe UI Variable Display","Segoe UI"}.st small{color:var(--ink2);font-size:12px}.st em{font-style:normal;color:var(--mut);font-size:11.5px}
.quad-t{fill:var(--mut);font:700 10.5px ui-monospace,Consolas,monospace;letter-spacing:.1em;opacity:.8}
.media-l{stroke:var(--line2);stroke-width:1.2;stroke-dasharray:5 5}
.calor-nota{margin-top:10px;padding:9px 14px;border-radius:12px;background:var(--card2);font-size:12.5px;color:var(--ink2)}
.notas2{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}.notas2 p{flex:1;min-width:200px;padding:9px 14px;border-radius:12px;background:var(--card2);font-size:12.5px;color:var(--ink2)}.notas2 p.ruim b{color:var(--bad)}
.eq-g{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(280px,100%),1fr));gap:14px}
.eq-t{display:flex;align-items:center;gap:16px;border:1px solid var(--line);border-radius:22px;padding:16px 18px;background:color-mix(in srgb,var(--solid) 52%,transparent)}
.eq-t .anel-c b{font-size:17px}
.eq-i{min-width:0;flex:1;display:flex;flex-direction:column;gap:3px}.eq-i b{font-size:14.5px}.eq-i strong{font:800 20px "Segoe UI Variable Display","Segoe UI";letter-spacing:-.02em;color:var(--ok)}.eq-i small{color:var(--mut);font-size:11.5px;line-height:1.4}
.eq-mov{height:6px;border-radius:4px;background:color-mix(in srgb,var(--ink) 8%,transparent);overflow:hidden;margin:3px 0}.eq-mov i{display:block;height:100%;border-radius:4px;background:linear-gradient(90deg,var(--g1),var(--g5))}
.rd-anel{fill:none;stroke:var(--line);stroke-width:1}.rd-e{fill:var(--ink2);font:600 12px "Segoe UI",system-ui}
.rep-hero{position:relative;display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:28px;padding:30px 34px;border-radius:32px;border:1px solid var(--line2);overflow:hidden;box-shadow:var(--shadow);
  background:radial-gradient(800px 340px at 0% -10%,color-mix(in srgb,var(--acc) 26%,transparent),transparent 62%),radial-gradient(700px 400px at 100% 20%,color-mix(in srgb,var(--g5) 24%,transparent),transparent 62%),var(--solid)}
.rep-hero>*{position:relative;min-width:0}
.rep-id{display:flex;align-items:center;gap:20px}.rep-id h2{font:800 34px/1.1 "Segoe UI Variable Display","Segoe UI";letter-spacing:-.035em;margin:4px 0}.rep-id p{color:var(--ink2);font-size:13.5px}
.rk-chips{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}
.rk-chip{display:inline-flex;gap:7px;align-items:baseline;border:1px solid var(--line2);background:var(--card);border-radius:999px;padding:5px 14px;font-size:12.5px;color:var(--ink2)}.rk-chip b{font:800 15px "Segoe UI Variable Display","Segoe UI";color:var(--ink)}
.rep-brief small{display:block;font:700 10.5px ui-monospace,Consolas,monospace;letter-spacing:.14em;color:var(--mut);margin-bottom:8px}
.rep-r{display:flex;flex-direction:column;align-items:center;gap:4px}.rep-r .legenda{justify-content:center;margin:0}


/* ---- responsivo */
@media (max-width:1280px){.kpis2{grid-template-columns:repeat(3,minmax(0,1fr))}.kpis2.oito{grid-template-columns:repeat(2,minmax(0,1fr))}.exe-kpis{grid-template-columns:repeat(4,minmax(0,1fr))}.exe-hero{grid-column:1 / -1}.exe-c:nth-child(2){border-left:0}.pos-g{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:1180px){.cx-hero,.rep-hero{grid-template-columns:1fr}.briefing,.lanes{grid-template-columns:1fr}.stepper{grid-template-columns:repeat(2,minmax(0,1fr))}.hh{grid-template-columns:1fr}.app{grid-template-columns:72px minmax(0,1fr)}.sp3,.sp4,.sp5,.sp6,.sp7,.sp8{grid-column:span 12}.radar{grid-template-columns:1fr}.alertas{grid-template-columns:1fr}.dest-l{grid-template-columns:1fr}.podio{grid-template-columns:1fr}.prev-r{grid-template-columns:1fr}.nav-r,.logo span,.side-f{display:none}.nav-i{justify-content:center;padding:12px}.nav-b{position:absolute;top:2px;right:2px;padding:0 6px}.logo{justify-content:center}.nav-i[aria-current="page"]::before{left:-14px}}
@media (max-width:820px){
  .kpis2{grid-template-columns:repeat(2,minmax(0,1fr))}.hh{padding:20px}.hh h1{font-size:30px}.ancoras{top:56px}
  .app{grid-template-columns:1fr}
  .side{position:fixed;inset:auto 0 0 0;top:auto;height:64px;flex-direction:row;padding:6px 10px;z-index:40;border-right:0;border-top:1px solid var(--line);gap:0}
  .logo{display:none}#nav{flex-direction:row;flex:1;justify-content:space-around}.nav-i{padding:8px;flex:1}.nav-i[aria-current="page"]::before{display:none}
  main{padding:18px 16px 96px}.topo{padding:10px 16px}.busca-b{min-width:0;flex:1}.busca-b kbd,.janela{display:none}
  .tarefa{grid-template-columns:1fr;gap:10px}.grade-f{grid-template-columns:1fr}.motivos{grid-template-columns:repeat(2,1fr)}
  .m-fundo{padding:0;align-items:flex-end}.m-caixa{max-height:94vh;border-radius:22px 22px 0 0}.m-gaveta .m-caixa{height:94vh;border-radius:22px 22px 0 0}
  .kanban,.kanban.sec2{grid-template-columns:repeat(5,82vw)}.kanban.sec2{grid-template-columns:repeat(3,82vw)}
  .tela-h h1{font-size:25px}
}
/* ===== IA Manager (mg-) ===== */
.mg{display:flex;flex-direction:column;gap:26px;padding-bottom:90px}
.mg-resp{display:flex;flex-direction:column;gap:22px}.mg-resp>.g12{margin:0}.mg-sec{opacity:1}.mg-anim .mg-sec{animation:mgRise .6s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i,0)*70ms)}
@keyframes mgRise{from{opacity:0;transform:translateY(18px) scale(.985)}to{opacity:1;transform:none}}
.mg-hero{position:relative;overflow:hidden;display:grid;grid-template-columns:minmax(260px,330px) 1fr;gap:34px;align-items:center;padding:34px 38px;border-radius:26px;border:1px solid var(--line);background:radial-gradient(900px 380px at 12% 0%,var(--mgh,rgba(76,201,240,.16)),transparent 60%),linear-gradient(160deg,var(--card2),var(--card));box-shadow:var(--shadow);--mgc:#ff5d6c;--mgh:rgba(255,93,108,.16)}
.mg-sombra .mg-hero{--mgc:#f5b942;--mgh:rgba(245,185,66,.18)}.mg-ligado .mg-hero{--mgc:#2ee6a6;--mgh:rgba(46,230,166,.2)}
.mg-part{position:absolute;inset:0;pointer-events:none}.mg-part i{position:absolute;width:5px;height:5px;border-radius:50%;background:var(--mgc);opacity:0;animation:mgFloat 7s ease-in-out infinite;pointer-events:none}.mg-desligado .mg-part i{animation-duration:12s}
@keyframes mgFloat{0%{opacity:0;transform:translateY(24px) scale(.6)}30%{opacity:.7}100%{opacity:0;transform:translateY(-70px) scale(1.3)}}
.mg-hero-e{display:flex;flex-direction:column;align-items:center;gap:22px;position:relative;z-index:1}
.mg-orbe{position:relative;width:200px;height:200px;border:0;background:none;padding:0;cursor:pointer;color:var(--mgc);display:grid;place-items:center;border-radius:50%;transition:transform .25s cubic-bezier(.2,.8,.2,1)}
.mg-orbe:hover{transform:scale(1.045)}.mg-orbe:active{transform:scale(.96)}.mg-orbe:focus-visible{outline:3px solid var(--cy);outline-offset:6px}
.mg-nucleo{position:relative;z-index:2;width:140px;height:140px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:radial-gradient(circle at 35% 28%,rgba(255,255,255,.14),transparent 55%),linear-gradient(160deg,var(--card2),var(--bg));border:2px solid var(--mgc);box-shadow:0 0 0 6px color-mix(in srgb,var(--mgc) 12%,transparent),0 0 38px color-mix(in srgb,var(--mgc) 38%,transparent),inset 0 0 22px color-mix(in srgb,var(--mgc) 16%,transparent);transition:border-color .4s,box-shadow .4s}
.mg-nucleo b{font:800 11px ui-monospace,Consolas,monospace;letter-spacing:.2em;color:var(--mgc)}
.mg-nucleo svg{filter:drop-shadow(0 0 8px color-mix(in srgb,var(--mgc) 60%,transparent))}
.mg-desligado .mg-nucleo{box-shadow:0 0 0 6px color-mix(in srgb,var(--mgc) 8%,transparent),inset 0 0 22px rgba(0,0,0,.25);animation:mgBreathe 4s ease-in-out infinite}
@keyframes mgBreathe{50%{transform:scale(.97);opacity:.85}}
.mg-anel{position:absolute;inset:0;border-radius:50%;border:2px dashed color-mix(in srgb,var(--mgc) 45%,transparent);animation:mgSpin 22s linear infinite}.mg-anel.a2{inset:14px;border-style:solid;border-width:1px;border-color:color-mix(in srgb,var(--mgc) 25%,transparent);animation-duration:34s;animation-direction:reverse}
@keyframes mgSpin{to{transform:rotate(360deg)}}
.mg-onda{position:absolute;inset:22px;border-radius:50%;border:2px solid var(--mgc);opacity:0}
.mg-ligado .mg-onda{animation:mgOnda 3.2s ease-out infinite}.mg-onda.o2{animation-delay:1.05s!important}.mg-onda.o3{animation-delay:2.1s!important}
@keyframes mgOnda{0%{opacity:.65;transform:scale(.72)}100%{opacity:0;transform:scale(1.42)}}
.mg-varre{position:absolute;inset:6px;border-radius:50%;opacity:0;background:conic-gradient(from 0deg,transparent 0 78%,color-mix(in srgb,var(--mgc) 55%,transparent) 100%);-webkit-mask:radial-gradient(circle,transparent 62%,#000 63%);mask:radial-gradient(circle,transparent 62%,#000 63%)}
.mg-sombra .mg-varre{opacity:1;animation:mgSpin 3.4s linear infinite}
.mg-modos{display:grid;grid-template-columns:1fr 1fr;gap:6px;width:100%;max-width:300px;padding:5px;border-radius:16px;background:var(--bg);border:1px solid var(--line)}
.mg-modo{border:0;background:none;border-radius:12px;padding:9px 10px;display:flex;flex-direction:column;gap:1px;align-items:center;color:var(--mut);cursor:pointer;transition:background .25s,color .25s,box-shadow .25s}
.mg-modo b{font-size:13px}.mg-modo small{font-size:11px;opacity:.8}.mg-modo:hover:not(:disabled):not(.on){background:var(--card);color:var(--ink)}.mg-modo:disabled{opacity:.45;cursor:not-allowed}
.mg-modo.on{background:color-mix(in srgb,var(--mgc) 16%,var(--card));color:var(--ink);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--mgc) 60%,transparent)}
.mg-hero-d{position:relative;z-index:1;display:flex;flex-direction:column;gap:18px;min-width:0}
.mg-eyebrow{font:700 11px ui-monospace,Consolas,monospace;letter-spacing:.16em;color:var(--mgc)}
.mg-hero-t h2{font-size:30px;line-height:1.15;margin:6px 0 6px;letter-spacing:-.02em}.mg-hero-t p{color:var(--mut);max-width:60ch;font-size:14.5px}
.mg-estado{display:flex;flex-wrap:wrap;gap:10px}
.mg-bat,.mg-prox,.mg-av{display:inline-flex;align-items:center;gap:9px;padding:8px 14px;border-radius:999px;border:1px solid var(--line);background:var(--bg);font-size:13px;font-weight:600}
.mg-prox{flex-direction:column;align-items:flex-start;gap:0;border-radius:14px;padding:7px 14px}.mg-prox small{font-weight:500;color:var(--mut);font-size:12px}
.mg-bat i{width:9px;height:9px;border-radius:50%;background:#6b7a90}.mg-bat.ok i{background:var(--ok);animation:mgBeat 1.4s ease-in-out infinite}.mg-bat.at i{background:var(--warn)}.mg-bat.ruim i{background:var(--bad);animation:mgBeat .8s ease-in-out infinite}
@keyframes mgBeat{0%,100%{box-shadow:0 0 0 0 color-mix(in srgb,currentColor 0%,transparent)}50%{box-shadow:0 0 0 6px rgba(46,230,166,.0);transform:scale(1.3)}}
.mg-bat.ok i{box-shadow:0 0 10px var(--ok)}
.mg-av.at{color:var(--warn);border-color:color-mix(in srgb,var(--warn) 40%,var(--line))}.mg-av.ruim{color:var(--bad);border-color:color-mix(in srgb,var(--bad) 40%,var(--line))}
.mg-conts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.mg-c{display:flex;flex-direction:column;gap:3px;padding:14px 16px;border-radius:16px;background:color-mix(in srgb,var(--bg) 70%,transparent);border:1px solid var(--line)}
.mg-c small{font:700 10.5px ui-monospace,Consolas,monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--mut)}.mg-c .mg-cn{font-size:30px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}.mg-c span{font-size:12px;color:var(--mut)}.mg-c.quente .mg-cn{color:var(--mgc)}
.mg-c-prog{flex-direction:row;flex-wrap:wrap;align-items:center;gap:4px 12px}.mg-c-prog small{width:100%}
.mg-prog{--p:0;position:relative;width:78px;height:78px;display:grid;place-items:center;flex:none;text-align:center}
.mg-prog:before{content:"";position:absolute;inset:0;border-radius:50%;background:conic-gradient(var(--mgc) calc(var(--p)*1%),color-mix(in srgb,var(--line2) 55%,transparent) 0);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 7px),#000 calc(100% - 6px));mask:radial-gradient(farthest-side,transparent calc(100% - 7px),#000 calc(100% - 6px))}
.mg-prog b{position:relative;display:block;font-size:19px;line-height:1;font-variant-numeric:tabular-nums}.mg-c .mg-prog small{position:relative;display:block;margin-top:3px;font:600 10.5px "Segoe UI",system-ui,sans-serif;letter-spacing:0;text-transform:none;color:var(--mut)}
.mg-acoes{display:flex;gap:10px}
.mg-sh{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:14px}.mg-sh h3{font-size:20px;letter-spacing:-.01em}.mg-sh p{color:var(--mut);font-size:13.5px;max-width:70ch;margin-top:3px}
.mg-bloco{display:flex;flex-direction:column}
@keyframes mgPing{0%{box-shadow:0 0 0 0 rgba(251,113,133,.6)}100%{box-shadow:0 0 0 12px rgba(251,113,133,0)}}
.mg-grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:16px}
.mg-g{position:relative;display:flex;flex-direction:column;gap:14px;padding:18px;border-radius:20px;border:1px solid var(--line);background:linear-gradient(180deg,var(--card2),var(--card));overflow:hidden;transition:transform .25s,border-color .25s,box-shadow .25s,opacity .3s}
.mg-g:before{content:"";position:absolute;inset:0 0 auto 0;height:3px;background:var(--gc);box-shadow:0 0 18px var(--gc)}
.mg-g:hover{transform:translateY(-3px);border-color:color-mix(in srgb,var(--gc) 50%,var(--line));box-shadow:0 14px 36px rgba(0,0,0,.28)}
.mg-g.off{opacity:.62}.mg-g.off:before{background:var(--line2);box-shadow:none}.mg-g.mudou{border-color:var(--warn)}.mg-g.mudou:after{content:"editado";position:absolute;top:12px;right:64px;font:700 10px ui-monospace,Consolas,monospace;letter-spacing:.1em;color:var(--warn);text-transform:uppercase}
.mg-g-h{display:flex;align-items:center;gap:12px}.mg-g-n{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;font:800 17px ui-monospace,Consolas,monospace;color:var(--gc);background:color-mix(in srgb,var(--gc) 14%,transparent);border:1px solid color-mix(in srgb,var(--gc) 40%,transparent);flex:none}
.mg-g-t{flex:1;min-width:0}.mg-g-t b{display:block;font-size:16px}.mg-g-t small{color:var(--mut);font-size:12px;display:block}
.mg-sw{position:relative;width:48px;height:28px;flex:none;cursor:pointer}.mg-sw input{position:absolute;inset:0;opacity:0;cursor:pointer;margin:0;z-index:1}.mg-sw i{position:absolute;inset:0;border-radius:99px;background:var(--line2);transition:background .3s,box-shadow .3s}.mg-sw i:after{content:"";position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.35);transition:transform .3s cubic-bezier(.3,1.4,.5,1)}.mg-sw.on i{background:var(--ok);box-shadow:0 0 14px rgba(46,230,166,.45)}.mg-sw.on i:after{transform:translateX(20px)}.mg-sw input:focus-visible+i{outline:3px solid var(--cy);outline-offset:2px}
.mg-g-corpo{display:flex;flex-direction:column;gap:13px}.mg-campo{display:flex;flex-direction:column;gap:6px}.mg-campo>label,.mg-rot{font:700 10.5px ui-monospace,Consolas,monospace;letter-spacing:.09em;text-transform:uppercase;color:var(--mut)}
.mg-hora-l{display:flex;align-items:center;gap:12px}.mg-hora-l small{color:var(--mut);font-size:12px}.mg-hora{width:auto!important;font:800 22px ui-monospace,Consolas,monospace!important;padding:8px 12px!important;color:var(--gc)}
.mg-lnk{border:0;background:none;color:var(--cy);font-size:12px;font-weight:600;cursor:pointer;padding:0}.mg-lnk:hover{text-decoration:underline}
.mg-par{display:flex;gap:10px;flex-wrap:wrap}.mg-par span{display:flex;align-items:center;gap:7px;font-size:13px;color:var(--mut)}.mg-in{width:110px!important;padding:7px 10px!important}
.mg-seg{display:inline-flex;padding:3px;border-radius:12px;background:var(--bg);border:1px solid var(--line);align-self:flex-start}.mg-seg button{border:0;background:none;color:var(--mut);padding:6px 14px;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;transition:background .2s,color .2s}.mg-seg button.on{background:var(--gc,var(--cy));color:#0b1018}.mg-seg button:hover:not(.on){color:var(--ink)}
.mg-chips{display:flex;flex-wrap:wrap;gap:6px}.mg-chip{border:1px solid var(--line);background:var(--bg);color:var(--mut);padding:5px 11px;border-radius:999px;font-size:12px;font-weight:600;cursor:pointer;transition:all .2s}.mg-chip:hover{color:var(--ink);border-color:var(--line2)}.mg-chip.on{color:var(--ink);background:color-mix(in srgb,var(--gc,var(--cy)) 20%,var(--bg));border-color:var(--gc,var(--cy))}
.mg-g-f{display:flex;flex-direction:column;gap:8px;padding-top:12px;border-top:1px dashed var(--line)}.mg-fila{display:flex;height:7px;border-radius:9px;overflow:hidden;background:var(--bg)}.mg-fila i{display:block;transition:width .6s cubic-bezier(.2,.8,.2,1)}.mg-fila .p{background:var(--ok)}.mg-fila .e{background:var(--warn)}.mg-fila .x{background:var(--line2)}
.mg-g-st{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--mut)}.mg-g-st b{color:var(--ink)}.mg-g-st .dir{margin-left:auto}
.mg-mot{list-style:none;margin:0;padding:0;font-size:12px;color:var(--mut);display:flex;flex-direction:column;gap:2px}.mg-mot b{color:var(--ink)}
.mg-duas{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-bottom:16px}
.mg-cx{display:flex;flex-direction:column;gap:12px;padding:20px;border-radius:20px;border:1px solid var(--line);background:linear-gradient(180deg,var(--card2),var(--card));min-width:0}.mg-cx-l{margin-bottom:16px}.mg-cx h4{font-size:16px}.mg-cx-h{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
.peq{font-size:12.5px}
.mg-jan{display:flex;flex-direction:column;gap:8px}.mg-jan-v{font-size:26px;font-weight:800;letter-spacing:-.02em;color:var(--cy)}.mg-jan-b{position:relative;height:30px}.mg-jan-t{position:absolute;left:0;right:0;top:12px;height:6px;border-radius:9px;background:var(--bg);border:1px solid var(--line)}.mg-jan-t i{position:absolute;top:0;bottom:0;border-radius:9px;background:linear-gradient(90deg,var(--cy),#a78bfa);box-shadow:0 0 12px rgba(76,201,240,.5)}
.mg-jan-b input{position:absolute;left:0;width:100%;top:3px;margin:0;background:none;pointer-events:none;-webkit-appearance:none;appearance:none;height:24px}.mg-jan-b input::-webkit-slider-thumb{pointer-events:auto;-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:#fff;border:3px solid var(--cy);box-shadow:0 2px 8px rgba(0,0,0,.4);cursor:grab}.mg-jan-b input::-moz-range-thumb{pointer-events:auto;width:16px;height:16px;border-radius:50%;background:#fff;border:3px solid var(--cy);cursor:grab}.mg-jan-b input::-webkit-slider-runnable-track{background:none}.mg-jan-b input::-moz-range-track{background:none}
.mg-jan-e{display:flex;justify-content:space-between;font-size:11px;color:var(--mut)}
.mg-dias{display:flex;gap:7px}.mg-dias button{width:40px;height:40px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--mut);font-weight:800;cursor:pointer;transition:all .2s}.mg-dias button.on{background:linear-gradient(160deg,var(--cy),#a78bfa);color:#0b1018;border-color:transparent;box-shadow:0 4px 14px rgba(76,201,240,.35)}.mg-dias button:hover:not(.on){border-color:var(--cy);color:var(--ink)}
.mg-linha-c{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.mg-linha-c label{font-size:13.5px;font-weight:600}.mg-disj small{display:block;color:var(--mut);font-size:12px;font-weight:400;max-width:34ch}
.mg-step{display:flex;align-items:center;gap:6px}.mg-step button{width:30px;height:30px;border-radius:9px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font-size:17px;cursor:pointer}.mg-step button:hover{border-color:var(--cy)}.mg-step .mg-in{width:76px!important;text-align:center}.mg-step small{color:var(--mut);font-size:12px}
.mg-pausas{display:flex;flex-direction:column;gap:10px}.mg-pausa{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;background:var(--bg);border:1px solid var(--line);animation:mgRise .4s both}.mg-pausa em{color:var(--mut);font-style:normal;font-size:13px}.mg-pausa .mg-in{width:auto!important}.mg-pausa .mg-in[type=text]{flex:1 1 180px}.mg-pausa-i{color:var(--warn)}
.mg-regra{display:inline-flex;align-items:center;gap:7px;padding:6px 12px;border-radius:999px;background:var(--bg);border:1px solid var(--line);font-size:12.5px;color:var(--ink2)}
.mg-busca-w{position:relative}.mg-busca{width:100%!important}.mg-achados{display:flex;flex-direction:column;margin-top:8px;border:1px solid var(--line);border-radius:14px;overflow:hidden}.mg-achados button{display:flex;align-items:center;gap:12px;padding:9px 14px;border:0;background:var(--bg);color:var(--ink);text-align:left;cursor:pointer}.mg-achados button+button{border-top:1px solid var(--line)}.mg-achados button:hover{background:var(--card)}.mg-achados small{display:block;color:var(--mut);font-size:12px}
.mg-sim-d{padding:26px 0;text-align:center}.mg-sim-v{display:flex;flex-direction:column;gap:16px}.mg-vered{padding:16px 18px;border-radius:16px;border:1px solid var(--line);display:flex;flex-direction:column;gap:2px;animation:mgRise .4s both}.mg-vered b{font-size:18px}.mg-vered small{color:var(--mut);font-size:13px}.mg-vered.ok{background:rgba(46,230,166,.1);border-color:rgba(46,230,166,.5)}.mg-vered.ok b{color:var(--ok)}.mg-vered.espera{background:rgba(245,185,66,.1);border-color:rgba(245,185,66,.5)}.mg-vered.espera b{color:var(--warn)}.mg-vered.nao{background:rgba(251,113,133,.1);border-color:rgba(251,113,133,.5)}.mg-vered.nao b{color:var(--bad)}
.mg-sim-g{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:20px;align-items:start}.mg-cks{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:7px}
.mg-ck{display:flex;gap:11px;align-items:flex-start;padding:9px 12px;border-radius:12px;background:var(--bg);border:1px solid var(--line);animation:mgSlide .45s cubic-bezier(.2,.8,.2,1) both}@keyframes mgSlide{from{opacity:0;transform:translateX(-14px)}}
.mg-ck>i{flex:none;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-style:normal;font-weight:800;font-size:13px}.mg-ck.ok>i{background:rgba(46,230,166,.2);color:var(--ok)}.mg-ck.nao>i{background:rgba(251,113,133,.2);color:var(--bad)}.mg-ck.espera>i{background:rgba(245,185,66,.2);color:var(--warn)}.mg-ck b{font-size:13.5px;display:block}.mg-ck small{color:var(--mut);font-size:12px}
.mg-sim-m{display:flex;flex-direction:column;gap:8px;padding:16px;border-radius:16px;background:#0b141a;background-image:radial-gradient(rgba(255,255,255,.04) 1px,transparent 1px);background-size:14px 14px}.mg-sim-m>small{color:#8696a0;font-size:11.5px}.mg-sim-m .wa-bolha{margin-left:7px}
.mg-hist{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:0}.mg-hist li{display:flex;gap:12px;padding:10px 0;position:relative}.mg-hist li+li{border-top:1px solid var(--line)}.mg-hist li>i{flex:none;width:10px;height:10px;border-radius:50%;background:var(--cy);margin-top:5px;box-shadow:0 0 10px var(--cy)}.mg-hist b{display:block;font-size:13px}.mg-hist span{font-size:13px;color:var(--ink2)}.mg-hist small{display:block;color:var(--mut);font-size:11.5px}
.mg-barra{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:40;display:flex;align-items:center;gap:18px;padding:12px 14px 12px 20px;border-radius:20px;background:rgba(18,22,32,.92);backdrop-filter:blur(14px);border:1px solid var(--warn);box-shadow:0 18px 50px rgba(0,0,0,.5),0 0 28px rgba(245,185,66,.2);animation:mgBarra .5s cubic-bezier(.3,1.4,.5,1) both;max-width:calc(100vw - 24px);color:#eef2f8}
@keyframes mgBarra{from{opacity:0;transform:translate(-50%,40px)}}
.mg-barra-t{display:flex;align-items:center;gap:12px}.mg-barra-t i{width:10px;height:10px;border-radius:50%;background:var(--warn);animation:mgPing 1.6s infinite}.mg-barra-t b{display:block;font-size:14px}.mg-barra-t small{display:block;font-size:12px;color:#aab4c4;max-width:46ch}.mg-barra.erro{border-color:var(--bad)}.mg-barra.erro small{color:var(--bad)}.mg-barra.salvo{border-color:var(--ok)}.mg-barra.salvo i{background:var(--ok)}.mg-barra-b{display:flex;gap:8px;flex:none}
@media(max-width:1000px){.mg-hero{grid-template-columns:1fr;padding:26px 20px}.mg-conts{grid-template-columns:repeat(2,minmax(0,1fr))}.mg-duas,.mg-sim-g{grid-template-columns:1fr}.mg-barra{flex-direction:column;align-items:stretch;gap:10px;bottom:84px}}
@media(prefers-reduced-motion:reduce){.mg *,.mg-barra{animation:none!important;transition:none!important}}
/* ===== IA Manager: Modo Simulação e laboratório ===== */
.mg-simulacao .mg-hero{--mgc:#4cc9f0;--mgh:rgba(76,201,240,.22)}
.mg-simulacao .mg-onda{animation:mgOnda 4.6s ease-out infinite}.mg-simulacao .mg-onda.o2{animation-delay:1.5s!important}.mg-simulacao .mg-onda.o3{animation-delay:3s!important}
.mg-simulacao .mg-varre{opacity:1;animation:mgSpin 2.6s linear infinite}
.mg-desligado .mg-nucleo{box-shadow:0 0 0 6px color-mix(in srgb,var(--mgc) 14%,transparent),0 0 30px color-mix(in srgb,var(--mgc) 22%,transparent),inset 0 0 22px color-mix(in srgb,var(--mgc) 10%,transparent)}
.mg-bat.sim i{background:#4cc9f0;box-shadow:0 0 10px #4cc9f0;animation:mgBeat 1.8s ease-in-out infinite}
.mg-av.sim{color:#4cc9f0;border-color:color-mix(in srgb,#4cc9f0 45%,var(--line))}
.mg-hero{grid-template-columns:minmax(300px,390px) 1fr}
.mg-modos{grid-template-columns:repeat(3,minmax(0,1fr));max-width:390px}.mg-modo{padding:9px 6px}.mg-modo b{font-size:12.5px;text-align:center}.mg-modo small{font-size:10.5px}
.mg-badge{font:800 11px ui-monospace,Consolas,monospace;letter-spacing:.14em;color:#4cc9f0;border:1px solid color-mix(in srgb,#4cc9f0 55%,transparent);background:rgba(76,201,240,.1);padding:6px 12px;border-radius:999px;box-shadow:0 0 16px rgba(76,201,240,.25);animation:mgBadge 2.4s ease-in-out infinite}
@keyframes mgBadge{50%{box-shadow:0 0 26px rgba(76,201,240,.5)}}
.mg-cta{flex-direction:row;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap;background:linear-gradient(120deg,rgba(76,201,240,.1),transparent 70%),var(--card)}.mg-cta h4{margin-bottom:4px}.mg-cta p{max-width:62ch}
.mg-lab-g{display:grid;grid-template-columns:minmax(300px,360px) minmax(0,1fr);gap:16px;align-items:start}
.mg-lab-f{border-color:color-mix(in srgb,#4cc9f0 35%,var(--line));position:sticky;top:84px}
.mg-lab-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.mg-lab-f .in{width:100%}
.mg-lab-ex{display:flex;flex-direction:column;gap:6px;padding-top:12px;border-top:1px dashed var(--line)}.mg-lab-ex>small{font:700 10.5px ui-monospace,Consolas,monospace;letter-spacing:.1em;color:var(--mut)}
.mg-ex{display:flex;flex-direction:column;align-items:flex-start;gap:1px;padding:9px 12px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--ink);cursor:pointer;text-align:left;transition:border-color .2s,transform .2s,background .2s}.mg-ex:hover:not(:disabled){border-color:#4cc9f0;transform:translateX(3px);background:rgba(76,201,240,.07)}.mg-ex:disabled{opacity:.45;cursor:not-allowed}.mg-ex b{font-size:13px}.mg-ex small{font-size:11.5px;color:var(--mut)}
.mg-lab-d{display:flex;flex-direction:column;gap:16px;min-width:0}
.mg-rel{border-color:color-mix(in srgb,#4cc9f0 35%,var(--line));background:linear-gradient(160deg,rgba(76,201,240,.08),transparent 60%),var(--card)}
.mg-rel-t{display:flex;justify-content:space-between;align-items:flex-end;gap:14px;flex-wrap:wrap}.mg-rel-t .mg-eyebrow{color:#4cc9f0;display:block}.mg-rel-v{display:block;font-size:26px;letter-spacing:-.02em;text-transform:capitalize;margin-top:4px;font-variant-numeric:tabular-nums}
.mg-rel-b{display:flex;gap:8px;flex-wrap:wrap}.mg-rel-c{display:grid;grid-template-columns:minmax(220px,260px) 1fr;gap:14px;align-items:start}.mg-rel-i{width:100%}
.mg-rel-r{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.mg-rel-res{font-size:13px;color:var(--mut);font-weight:600}.mg-rel-res.ok{color:var(--ok)}
.mg-chip b{font:700 11.5px ui-monospace,Consolas,monospace}
.mg-lc-g{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:14px}
.mg-lc{display:flex;flex-direction:column;gap:11px;padding:16px;border-radius:18px;border:1px solid var(--line);background:linear-gradient(180deg,var(--card2),var(--card));position:relative;overflow:hidden;--lc:var(--line2);animation:mgRise .5s cubic-bezier(.2,.8,.2,1) both;min-width:0}
.mg-lc:before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--lc)}
.mg-lc.ok{--lc:var(--ok)}.mg-lc.espera{--lc:var(--warn)}.mg-lc.nao{--lc:var(--bad)}.mg-lc.novo{box-shadow:0 0 0 1px var(--ok),0 0 30px rgba(46,230,166,.22);animation:mgRise .5s both,mgGlow 1.8s ease-out}
@keyframes mgGlow{0%{box-shadow:0 0 0 2px var(--ok),0 0 46px rgba(46,230,166,.55)}}
.mg-lc-h{display:flex;align-items:center;gap:11px}.mg-lc-n{flex:1;min-width:0}.mg-lc-n b{display:block}.mg-lc-n small{color:var(--mut);font-size:12px}
.mg-lc-d{display:flex;flex-direction:column;gap:3px}.mg-lc-p{align-self:flex-start;font:800 10.5px ui-monospace,Consolas,monospace;letter-spacing:.09em;text-transform:uppercase;padding:3px 10px;border-radius:999px;color:var(--lc);background:color-mix(in srgb,var(--lc) 14%,transparent);border:1px solid color-mix(in srgb,var(--lc) 45%,transparent)}.mg-lc-m{font-size:13px;color:var(--ink2)}
.mg-lab-wa{display:flex;flex-direction:column;gap:10px;padding:12px;border-radius:14px;background:#0b141a;background-image:radial-gradient(rgba(255,255,255,.04) 1px,transparent 1px);background-size:14px 14px}
.mg-lab-m{display:flex;flex-direction:column;gap:5px}.mg-lab-m>small{color:#8696a0;font-size:11px}.mg-lab-m .wa-bolha{margin-left:7px;max-width:100%}.mg-lab-m.novo{animation:mgSlide .7s cubic-bezier(.2,.8,.2,1) both}
.mg-det{border-top:1px dashed var(--line);padding-top:9px}.mg-det summary{cursor:pointer;color:var(--cy);font-size:12.5px;font-weight:600;list-style:none}.mg-det summary::-webkit-details-marker{display:none}.mg-det summary:before{content:"▸ ";display:inline-block;transition:transform .2s}.mg-det[open] summary:before{transform:rotate(90deg)}.mg-det .mg-cks{margin-top:9px}
.mg-lab-vazio{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;padding:44px 24px;border:1px dashed color-mix(in srgb,#4cc9f0 40%,var(--line));border-radius:18px;background:rgba(76,201,240,.04)}.mg-lab-vazio b{font-size:16px}.mg-lab-vazio p{color:var(--mut);max-width:52ch;font-size:13.5px}
@media(max-width:1000px){.mg-hero{grid-template-columns:1fr}.mg-lab-g{grid-template-columns:1fr}.mg-lab-f{position:static}.mg-rel-c{grid-template-columns:1fr}.mg-lc-g{grid-template-columns:1fr}}
/* ===== IA Manager: agenda de hoje (raias) ===== */
.mg-linha{padding:24px 26px 22px;border-radius:22px;border:1px solid var(--line);background:linear-gradient(180deg,var(--card),transparent)}
.mg-leg{display:flex;flex-wrap:wrap;gap:8px 16px;font-size:12px;color:var(--mut);align-items:center}.mg-leg span{display:inline-flex;align-items:center;gap:7px}.mg-leg span:before{content:"";display:inline-block;flex:none}
.mg-leg .p:before{width:11px;height:11px;border-radius:50%;background:#fff;box-shadow:0 0 0 3px rgba(255,255,255,.18)}.mg-leg .b:before{width:24px;height:9px;border-radius:6px;background:linear-gradient(90deg,var(--cy),#a78bfa)}.mg-leg .f:before{width:20px;height:9px;border-radius:3px;background:repeating-linear-gradient(135deg,var(--line2) 0 3px,transparent 3px 6px);border:1px solid var(--line)}.mg-leg .a:before{width:3px;height:14px;border-radius:2px;background:var(--bad);box-shadow:0 0 8px var(--bad)}
.mg-ag-frase{display:flex;align-items:center;gap:11px;margin:2px 0 18px;padding:11px 16px;border-radius:14px;border:1px solid var(--line);background:var(--bg);font-size:14px;font-weight:600}
.mg-ag-frase i{width:10px;height:10px;border-radius:50%;flex:none;background:var(--mut)}.mg-ag-frase.f-ok{border-color:color-mix(in srgb,var(--ok) 45%,var(--line));background:linear-gradient(90deg,rgba(46,230,166,.1),transparent)}.mg-ag-frase.f-ok i{background:var(--ok);box-shadow:0 0 10px var(--ok);animation:mgBeat 1.6s ease-in-out infinite}.mg-ag-frase.f-espera i{background:var(--warn)}.mg-ag-frase.f-pausa{border-color:color-mix(in srgb,var(--bad) 40%,var(--line))}.mg-ag-frase.f-pausa i{background:var(--bad)}
.mg-ag-w{overflow-x:auto;padding:30px 0 6px}
.mg-ag{display:grid;grid-template-columns:200px minmax(520px,1fr) 230px;gap:0 14px;min-width:960px}
.mg-ag-sp{height:32px}
.mg-ag-n,.mg-ag-s{height:60px;display:flex;align-items:center;gap:11px;min-width:0}
.mg-ag-n .mg-ag-num{flex:none;width:34px;height:34px;border-radius:11px;display:grid;place-items:center;font:800 15px ui-monospace,Consolas,monospace;color:var(--gc);background:color-mix(in srgb,var(--gc) 14%,transparent);border:1px solid color-mix(in srgb,var(--gc) 45%,transparent)}
.mg-ag-n b{display:block;font-size:14px}.mg-ag-n small{display:block;color:var(--mut);font-size:11.5px}.mg-ag-n.off{opacity:.5}
.mg-ag-area{position:relative;border-radius:16px;background:var(--bg);border:1px solid var(--line)}
.mg-ag-eixo{position:relative;height:32px;border-bottom:1px solid var(--line)}
.mg-ag-hr{position:absolute;top:0;bottom:0;width:1px}.mg-ag-eixo .mg-ag-hr:before{content:"";position:absolute;left:0;bottom:0;width:1px;height:6px;background:var(--line2)}.mg-ag-eixo .mg-ag-hr.g:before{height:10px}.mg-ag-eixo em{position:absolute;top:7px;left:0;transform:translateX(-50%);font:700 11px ui-monospace,Consolas,monospace;color:var(--mut);font-style:normal}
.mg-ag-linhas{position:absolute;inset:0;pointer-events:none}.mg-ag-linhas .mg-ag-hr{background:rgba(255,255,255,.045)}.mg-ag-linhas .mg-ag-hr.g{background:rgba(255,255,255,.08)}
.mg-ag-fora.e{border-radius:15px 0 0 15px}.mg-ag-fora.d{border-radius:0 15px 15px 0}.mg-ag-fora{position:absolute;top:0;bottom:0;background:repeating-linear-gradient(135deg,rgba(255,255,255,.05) 0 4px,transparent 4px 9px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.03)}
.mg-ag-jan{position:absolute;top:0;height:32px;display:flex;align-items:center;justify-content:center;pointer-events:none}.mg-ag-jan:after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;background:linear-gradient(90deg,var(--cy),#a78bfa);box-shadow:0 0 12px rgba(76,201,240,.6)}
.mg-ag-l{position:relative;height:60px;border-bottom:1px solid rgba(255,255,255,.04)}.mg-ag-l:last-of-type{border-bottom:0}
.mg-ag-bar{position:absolute;top:21px;height:18px;border-radius:10px;background:color-mix(in srgb,var(--gc) 22%,transparent);border:1px solid color-mix(in srgb,var(--gc) 55%,transparent);overflow:hidden;transform-origin:left center}
.mg-anim .mg-ag-bar{animation:mgGrow .9s var(--d,500ms) cubic-bezier(.2,.8,.2,1) both}
@keyframes mgGrow{from{transform:scaleX(0);opacity:0}}
.mg-ag-feito{position:absolute;left:0;top:0;bottom:0;border-radius:10px 0 0 10px;background:linear-gradient(90deg,color-mix(in srgb,var(--gc) 70%,transparent),var(--gc))}
.mg-ag-feito.vivo{background-image:repeating-linear-gradient(115deg,rgba(255,255,255,.28) 0 8px,transparent 8px 16px),linear-gradient(90deg,color-mix(in srgb,var(--gc) 70%,transparent),var(--gc));background-size:32px 100%,100% 100%;animation:mgFlui 1.2s linear infinite;box-shadow:0 0 18px var(--gc)}
@keyframes mgFlui{to{background-position:32px 0,0 0}}
.mg-ag-pino{position:absolute;top:0;bottom:0;width:0;z-index:2}.mg-anim .mg-ag-pino{animation:mgPino .6s var(--d,350ms) cubic-bezier(.3,1.5,.5,1) both}
@keyframes mgPino{from{opacity:0;transform:scale(.3)}}
.mg-ag-pino i{position:absolute;left:-8px;top:22px;width:16px;height:16px;border-radius:50%;background:#fff;border:4px solid var(--gc);box-shadow:0 0 0 4px color-mix(in srgb,var(--gc) 20%,transparent),0 0 16px var(--gc)}
.mg-ag-pino b{position:absolute;left:0;top:3px;transform:translateX(-50%);font:800 12px ui-monospace,Consolas,monospace;color:var(--ink);background:var(--card2);border:1px solid color-mix(in srgb,var(--gc) 60%,var(--line));padding:1px 7px;border-radius:8px;white-space:nowrap}
.mg-ag-pino.pulsa i{animation:mgOndaPino 1.8s ease-out infinite}@keyframes mgOndaPino{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--gc) 70%,transparent),0 0 16px var(--gc)}100%{box-shadow:0 0 0 14px transparent,0 0 16px var(--gc)}}
.mg-ag-pino.off i{background:var(--line2);border-color:var(--line2);box-shadow:none}.mg-ag-pino.off b{opacity:.5}
.mg-ag-l.off{filter:grayscale(1);opacity:.55}.mg-ag-desl{position:absolute;left:14px;top:21px;font-size:12px;color:var(--mut);font-style:italic}
.mg-ag-agora{position:absolute;top:-6px;bottom:0;width:2px;margin-left:-1px;background:var(--bad);box-shadow:0 0 14px var(--bad);z-index:4}.mg-anim .mg-ag-agora{animation:mgDesce .8s .9s cubic-bezier(.2,.8,.2,1) both}@keyframes mgDesce{from{transform:scaleY(0);transform-origin:top}}
.mg-ag-agora em{position:absolute;top:-24px;left:50%;transform:translateX(-50%);background:var(--bad);color:#fff;font:700 11px ui-monospace,Consolas,monospace;padding:2px 8px;border-radius:8px;font-style:normal;white-space:nowrap}
.mg-ag-agora i{position:absolute;bottom:-2px;left:-5px;width:12px;height:12px;border-radius:50%;background:var(--bad);animation:mgPing 1.8s infinite}
.mg-ag-s{flex-direction:column;align-items:flex-start;justify-content:center;gap:2px}.mg-ag-s b{display:inline-flex;align-items:center;gap:8px;font-size:13.5px}.mg-ag-s b i{width:9px;height:9px;border-radius:50%;background:var(--mut);flex:none}.mg-ag-s small{color:var(--mut);font-size:11px;white-space:nowrap}.mg-ag-s{overflow:hidden}
.mg-ag-s.st-pronto b{color:var(--ok)}.mg-ag-s.st-pronto b i{background:var(--ok);box-shadow:0 0 10px var(--ok);animation:mgBeat 1.4s ease-in-out infinite}.mg-ag-s.st-env b{color:var(--cy)}.mg-ag-s.st-env b i{background:var(--cy)}.mg-ag-s.st-espera b{color:var(--warn)}.mg-ag-s.st-espera b i{background:var(--warn)}.mg-ag-s.st-off{opacity:.5}.mg-ag-s.st-vazio b{color:var(--mut)}
@media(max-width:1000px){.mg-linha{padding:18px 14px}}
`;

export const pagina = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="data:,">
<title>Clinex · CRM</title>
<style>${css}</style></head><body>
<div class="app">
  <aside class="side">
    <div class="logo"><b>clinex</b><span>CRM</span></div>
    <nav id="nav" aria-label="Telas do CRM"></nav>
    <div class="side-f">Guia de Atendimento do Lead</div>
  </aside>
  <div class="corpo">
    <header class="topo"><div id="topo-dir"></div></header>
    <div id="erro-js" role="alert"></div>
    <main id="main" tabindex="-1"><p class="mut">Carregando o CRM…</p></main>
  </div>
</div>
<script src="/painel/crm/app.js"></script>
</body></html>`;
