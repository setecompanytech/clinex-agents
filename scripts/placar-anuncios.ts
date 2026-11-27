// Placar das conversas que vieram de ANÚNCIO (Facebook/Instagram) e da etiqueta "AD - ..." de cada uma. Só leitura.
//   npx tsx --env-file=.env scripts/placar-anuncios.ts [horas=24]
import { etiquetaDoAnuncio } from '../src/aquisicao/anuncios.js';
import { listarEtiquetas } from '../src/integrations/inovstar.js';

const HORAS = Number(process.argv[2] ?? 24);
const base = (process.env.INOVSTAR_BASE_URL ?? 'https://gateway.inovstar.com') + '/api';
const H = { Authorization: `Bearer ${process.env.INOVSTAR_TOKEN}` };
const painel = 'https://clinex-agentes-ia.vercel.app';
/** fetch com até 4 tentativas (a Inovstar derruba conexões de vez em quando: ECONNRESET) */
async function pega(url: string, init?: RequestInit): Promise<any> {
  for (let i = 1; ; i++) {
    try { await new Promise((ok) => setTimeout(ok, 120)); const r = await fetch(url, init); if (r.status === 429 || r.status >= 500) throw new Error(String(r.status)); return await r.json(); }
    catch (e) { if (i >= 5) return { falhou: true }; await new Promise((ok) => setTimeout(ok, 1500 * i)); }
  }
}
const hora = (t: string) => new Date(t).toLocaleString('pt-BR', { timeZone: 'America/Belem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const r = await fetch(painel + '/painel/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: painel }, body: JSON.stringify({ login: 'mestre', senha: process.env.PAINEL_PASSWORD }) });
const ck = (r.headers.get('set-cookie') || '').split(';')[0];
const periodo = HORAS <= 24 ? '24h' : HORAS <= 168 ? '7d' : '30d';
const c: any = await pega(`${painel}/painel/receptivo/bi/conversas.json?periodo=${periodo}`, { headers: { cookie: ck } });
const desde = Date.now() - HORAS * 3_600_000;
const etiquetas = await listarEtiquetas('6a74bd8e844ff91efceb1c47');
const ids = new Set(etiquetas.filter((e) => /^\s*ads?\s*[-–:]/i.test(e.name)).map((e) => e._id));

type Linha = { quando: string; nome: string; origem: string; titulo: string; esperada: string; aplicada: string[]; semContato?: boolean };
const linhas: Linha[] = [];
for (const x of (c.conversas || []).filter((x: any) => (x.inicio ?? 0) >= desde)) {
  const j: any = await pega(`${base}/attendance/${x.id}/history?limit=50`, { headers: H });
  const m = (j.data?.messages ?? []).find((m: any) => m.direction === 'in' && m.adReferral);
  if (!m) continue;
  const ad = m.adReferral;
  const contato: any = await pega(`${base}/contacts/${j.data.attendance?.contact?.id ?? m.contact?.id}`, { headers: H });
  const aplicada = (contato.data?.labels ?? []).filter((l: any) => ids.has(l._id) || /^\s*ads?\s*[-–:]/i.test(l.name)).map((l: any) => l.name);
  linhas.push({ quando: m.timestamp, nome: String(contato.data?.name ?? m.contact?.name ?? '').split(' ')[0] || '—', origem: ad.source ?? '?', titulo: ad.headline ?? '(sem título)', esperada: etiquetaDoAnuncio(ad, etiquetas)?.name ?? 'AD - OUTROS', aplicada, semContato: !contato.data });
}
linhas.sort((a, b) => a.quando.localeCompare(b.quando));

console.log(`PLACAR DE ANÚNCIOS — últimas ${HORAS} h (${linhas.length} conversa(s) vinda(s) de anúncio)\n`);
const porEtq = new Map<string, number>();
for (const l of linhas) porEtq.set(l.esperada, (porEtq.get(l.esperada) ?? 0) + 1);
for (const [e, n] of [...porEtq.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${e}`);
const comEtiqueta = linhas.filter((l) => l.aplicada.length).length, semLer = linhas.filter((l) => l.semContato).length;
console.log(`
  com etiqueta AD: ${comEtiqueta} de ${linhas.length}${semLer ? ` (${semLer} contato(s) não lido(s))` : ''}
`);
for (const l of linhas) console.log(`  ${hora(l.quando)}  ${l.nome.padEnd(12)} ${l.origem.padEnd(9)} ${l.titulo.slice(0, 38).padEnd(38)}  ${l.semContato ? '? não consegui ler o contato' : l.aplicada.length ? '✔ ' + l.aplicada.join(', ') + (l.aplicada.includes(l.esperada) ? '' : ' (esperada: ' + l.esperada + ')') : '✘ sem etiqueta (esperada: ' + l.esperada + ')'}`);
