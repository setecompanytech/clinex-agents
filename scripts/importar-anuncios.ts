// Importa para o FUNIL GERAL as conversas de anúncio que aconteceram antes dele existir (rota protegida, em lotes de 30).
//   npx tsx --env-file=.env scripts/importar-anuncios.ts [AAAA-MM-DD=7 dias atrás]
const painel = process.env.PAINEL_URL ?? 'https://clinex-agentes-ia.vercel.app';
const desde = /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2] ?? '') ? Date.parse(`${process.argv[2]}T00:00:00-03:00`) : Date.now() - 7 * 86_400_000;
const r = await fetch(painel + '/painel/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: painel }, body: JSON.stringify({ login: 'mestre', senha: process.env.PAINEL_PASSWORD }) });
const ck = (r.headers.get('set-cookie') || '').split(';')[0];
const periodo = Date.now() - desde <= 86_400_000 ? '24h' : Date.now() - desde <= 7 * 86_400_000 ? '7d' : '30d';
const c: any = await (await fetch(`${painel}/painel/receptivo/bi/conversas.json?periodo=${periodo}`, { headers: { cookie: ck } })).json();
const ids: string[] = (c.conversas || []).filter((x: any) => (x.inicio ?? 0) >= desde).map((x: any) => x.id);
console.log(`${ids.length} atendimento(s) para conferir desde ${new Date(desde).toLocaleString('pt-BR', { timeZone: 'America/Belem' })}`);
const soma = { gravadas: 0, jaExistiam: 0, semAnuncio: 0, falhas: 0 };
for (let i = 0; i < ids.length; i += 30) {
  let j: any = {};
  for (let t = 1; t <= 3; t++) {
    try {
      const res = await fetch(`${painel}/painel/receptivo/funil/importar-anuncios`, { method: 'POST', headers: { cookie: ck, 'content-type': 'application/json', origin: painel }, body: JSON.stringify({ ids: ids.slice(i, i + 30) }) });
      j = await res.json(); if (j.ok) break;
    } catch { /* tenta de novo */ }
    await new Promise((ok) => setTimeout(ok, 3000 * t));
  }
  for (const k of Object.keys(soma) as (keyof typeof soma)[]) soma[k] += Number(j[k] ?? 0);
  process.stdout.write(`  lote ${i / 30 + 1}: ${JSON.stringify({ gravadas: j.gravadas, jaExistiam: j.jaExistiam, semAnuncio: j.semAnuncio, falhas: j.falhas, erro: j.mensagem })}\n`);
}
console.log('total:', soma);
