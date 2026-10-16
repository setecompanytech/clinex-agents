// Confere o atraso "digitando": rodar com npx tsx scripts/teste-atraso.ts
process.env.INOVSTAR_TOKEN ??= 'x';
const { pareceDigitando } = await import('../src/agents/receptivo/agent.js');
const medir = async (nome: string, inicioAtras: number, urgente: boolean) => { const t = Date.now(); await pareceDigitando(Date.now() - inicioAtras, urgente); const ms = Date.now() - t; console.log(nome.padEnd(46), `${(ms / 1000).toFixed(1)}s`); return ms; };
let ok = true;
const a: number[] = []; for (let i = 0; i < 3; i++) a.push(await medir('resposta rápida (chegou agora)', 0, false));
ok &&= a.every((x) => x >= 4900 && x <= 10100);
const b = await medir('já passou 4 s (debounce + GPT)', 4000, false); ok &&= b >= 900 && b <= 6100;
const c = await medir('já passou 12 s (Clinilink lento)', 12000, false); ok &&= c < 100;
const d = await medir('emergência/crise', 0, true); ok &&= d < 100;
console.log(ok ? 'OK' : 'FALHOU'); process.exit(ok ? 0 : 1);
