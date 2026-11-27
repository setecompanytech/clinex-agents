// Placar das conversas que vieram de ANÚNCIO (Facebook/Instagram/WhatsApp), com a etiqueta "AD - ..." de cada uma e se a pessoa
// tem agendamento no Clinilink (pelo telefone do WhatsApp, agendamento marcado para depois do contato). Só leitura.
//   npx tsx --env-file=.env scripts/placar-anuncios.ts [horas=24 | AAAA-MM-DD]
import { etiquetaDoAnuncio } from '../src/aquisicao/anuncios.js';
import { chaveTel } from '../src/aquisicao/funil.js';
import { listarEtiquetas } from '../src/integrations/inovstar.js';

const ARG = process.argv[2] ?? '24';
const desde = /^\d{4}-\d{2}-\d{2}$/.test(ARG) ? Date.parse(`${ARG}T00:00:00-03:00`) : Date.now() - Number(ARG) * 3_600_000;
const HORAS = Math.ceil((Date.now() - desde) / 3_600_000);
const base = (process.env.INOVSTAR_BASE_URL ?? 'https://gateway.inovstar.com') + '/api';
const H = { Authorization: `Bearer ${process.env.INOVSTAR_TOKEN}` };
const painel = 'https://clinex-agentes-ia.vercel.app';
const CLINILINK = (process.env.CLINILINK_BASE_URL ?? 'https://lista-unilab-clinex.onrender.com').replace(/\/+$/, '');
const CHAVE_CL = process.env.CLINILINK_API_KEY ?? '';

/** fetch com tentativas (a Inovstar derruba conexões de vez em quando: ECONNRESET; o Render pode estar acordando) */
async function pega(url: string, init?: RequestInit): Promise<any> {
  for (let i = 1; ; i++) {
    try { await new Promise((ok) => setTimeout(ok, 120)); const r = await fetch(url, init); if (r.status === 429 || r.status >= 500) throw new Error(String(r.status)); return await r.json(); }
    catch { if (i >= 5) return { falhou: true }; await new Promise((ok) => setTimeout(ok, 1500 * i)); }
  }
}
const TZ = 'America/Belem';
const hora = (t: string) => new Date(t).toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const dia = (t: number) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(t));
const somaDias = (ymd: string, n: number) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// ---------------------------------------------------------------- conversas vindas de anúncio
const r = await fetch(painel + '/painel/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: painel }, body: JSON.stringify({ login: 'mestre', senha: process.env.PAINEL_PASSWORD }) });
const ck = (r.headers.get('set-cookie') || '').split(';')[0];
const periodo = HORAS <= 24 ? '24h' : HORAS <= 168 ? '7d' : '30d';
const c: any = await pega(`${painel}/painel/receptivo/bi/conversas.json?periodo=${periodo}`, { headers: { cookie: ck } });
const etiquetas = await listarEtiquetas('6a74bd8e844ff91efceb1c47');
const ids = new Set(etiquetas.filter((e) => /^\s*ads?\s*[-–:]/i.test(e.name)).map((e) => e._id));

type Ag = { dataHora: string; status: string; servico: string; unidade: string };
type Linha = { quando: string; nome: string; origem: string; titulo: string; esperada: string; aplicada: string[]; semContato?: boolean; tel: string; ags: Ag[] };
const linhas: Linha[] = [];
const vistos = new Set<string>();
for (const x of (c.conversas || []).filter((x: any) => (x.inicio ?? 0) >= desde)) {
  const j: any = await pega(`${base}/attendance/${x.id}/history?limit=50`, { headers: H }); // acima de 50 a Inovstar não devolve o contato
  const m = (j.data?.messages ?? []).find((m: any) => m.direction === 'in' && m.adReferral);
  if (!m) continue;
  const ad = m.adReferral;
  const contato: any = await pega(`${base}/contacts/${j.data.attendance?.contact?.id ?? m.contact?.id}`, { headers: H });
  const tel = chaveTel(String(contato.data?.waId ?? m.contact?.waId ?? '').split('@')[0]);
  if (vistos.has(`${tel}|${ad.headline}`)) continue; // a mesma pessoa voltou pelo mesmo anúncio: conta uma vez
  vistos.add(`${tel}|${ad.headline}`);
  const aplicada = (contato.data?.labels ?? []).filter((l: any) => ids.has(l._id) || /^\s*ads?\s*[-–:]/i.test(l.name)).map((l: any) => l.name);
  linhas.push({ quando: m.timestamp, nome: String(contato.data?.name ?? m.contact?.name ?? '').split(' ')[0] || '—', origem: ad.source ?? '?', titulo: ad.headline ?? '(sem título)', esperada: etiquetaDoAnuncio(ad, etiquetas)?.name ?? 'AD - OUTROS', aplicada, semContato: !contato.data, tel, ags: [] });
}
linhas.sort((a, b) => a.quando.localeCompare(b.quando));

// ---------------------------------------------------------------- agendamentos no Clinilink (das duas unidades), cruzados pelo telefone
let erroCl = '';
if (CHAVE_CL && linhas.length) {
  const cl: any = await pega(`${CLINILINK}/v1/agendamento/clinicas`, { headers: { 'x-api-key': CHAVE_CL } });
  const ini = dia(desde), fim = somaDias(ini, 59);
  const porTel = new Map<string, Ag[]>();
  for (const u of cl.clinicas ?? []) {
    for (const status of ['', 'cancelado']) {
      for (let offset = 0; offset < 6000; offset += 500) {
        const q = new URLSearchParams({ unidadeId: u.id, dataInicial: ini, dataFinal: fim, limite: '500', offset: String(offset), ...(status ? { status } : {}) });
        const a: any = await pega(`${CLINILINK}/v1/agendamento/agendamentos?${q}`, { headers: { 'x-api-key': CHAVE_CL } });
        if (!a.ok) { erroCl = a.mensagem ?? a.erro ?? 'sem resposta'; break; }
        for (const g of a.agendamentos ?? []) {
          const k = chaveTel(g.paciente?.telefone);
          if (k.length < 10) continue;
          porTel.set(k, [...(porTel.get(k) ?? []), { dataHora: g.dataHora, status: g.status, servico: (g.procedimentos ?? []).map((p: any) => p.nome).join(' + ') || '?', unidade: String(u.nome ?? '').replace(/^CLINEX\s*/i, '') }]);
        }
        if ((a.agendamentos ?? []).length < 500) break;
      }
    }
  }
  for (const l of linhas) l.ags = (porTel.get(l.tel) ?? []).filter((g) => g.dataHora >= l.quando.slice(0, 10)).sort((a, b) => a.dataHora.localeCompare(b.dataHora));
}

// ---------------------------------------------------------------- saída
const agendaram = linhas.filter((l) => l.ags.some((g) => g.status !== 'cancelado'));
console.log(`PLACAR DE ANÚNCIOS — desde ${hora(new Date(desde).toISOString())} (${linhas.length} pessoa(s) vinda(s) de anúncio)\n`);
const porEtq = new Map<string, { n: number; ag: number }>();
for (const l of linhas) { const v = porEtq.get(l.esperada) ?? { n: 0, ag: 0 }; v.n++; if (agendaram.includes(l)) v.ag++; porEtq.set(l.esperada, v); }
console.log('  etiqueta            pessoas  agendaram');
for (const [e, v] of [...porEtq.entries()].sort((a, b) => b[1].n - a[1].n)) console.log(`  ${e.padEnd(18)}  ${String(v.n).padStart(7)}  ${String(v.ag).padStart(9)}`);
const comEtiqueta = linhas.filter((l) => l.aplicada.length).length;
console.log(`\n  com etiqueta AD: ${comEtiqueta} de ${linhas.length} · agendaram no Clinilink: ${agendaram.length} de ${linhas.length}${erroCl ? ` · ATENÇÃO Clinilink: ${erroCl}` : ''}\n`);
const etq = (l: Linha) => (l.semContato ? '? contato' : l.aplicada.length ? (l.aplicada.includes(l.esperada) ? '✔ ' : '≠ ') + l.aplicada.join(', ') : '✘ sem etiqueta');
const agTxt = (l: Linha) => { const g = l.ags.find((x) => x.status !== 'cancelado') ?? l.ags[0]; return g ? `${g.status === 'cancelado' ? '✘ cancelou ' : '✔ '}${hora(g.dataHora).slice(0, 5)} ${g.servico.slice(0, 34)} (${g.unidade})${l.ags.length > 1 ? ` +${l.ags.length - 1}` : ''}` : '—'; };
for (const l of linhas) console.log(`  ${hora(l.quando)}  ${l.nome.slice(0, 11).padEnd(11)} ${l.origem.padEnd(9)} ${l.titulo.slice(0, 34).padEnd(34)} ${etq(l).padEnd(22)} ${agTxt(l)}`);
