// Confere o "digitando": resposta grande demora mais, resposta de segurança não espera, parágrafos viram balões.
// Rodar: npx tsx scripts/teste-atraso.ts
process.env.INOVSTAR_TOKEN ??= 'x';
const { pareceDigitando, tempoDeDigitacao, dividirEmBaloes } = await import('../src/agents/receptivo/agent.js');

let ok = true;
const confere = (nome: string, cond: boolean, detalhe = '') => { if (!cond) ok = false; console.log(`${cond ? 'OK  ' : 'FALHOU'} ${nome}${detalhe ? ` -> ${detalhe}` : ''}`); };
const media = (f: () => number, n = 200) => Array.from({ length: n }, f).reduce((a, b) => a + b, 0) / n;

const curto = 'Claro! Qual consulta ou exame você precisa?';
const medio = 'Tenho sim! No Guamá com a Dra. Giovanna e a Dra. Ebenezaide, e no Telégrafo com a Dra. Ebenezaide. A consulta é R$ 150,00.\nQual dos dois fica melhor pra você?';
const longo = `Consegui estes aqui:\n${Array.from({ length: 4 }, (_, i) => `${i + 1}. Quinta, dia ${22 + i}, de manhã, a partir das 8h, com a Dra. Fernanda`).join('\n')}\nQual desses fica bom pra você? Se quiser outro dia, me fala que eu vejo.`;
const enorme = 'x'.repeat(2000);

const tc = media(() => tempoDeDigitacao(curto, true));
const tm = media(() => tempoDeDigitacao(medio, true));
const tl = media(() => tempoDeDigitacao(longo, true));
console.log(`médias: curto (${curto.length} car.) ${(tc / 1000).toFixed(1)} s | médio (${medio.length}) ${(tm / 1000).toFixed(1)} s | longo (${longo.length}) ${(tl / 1000).toFixed(1)} s`);
confere('resposta curta: alguns segundos (de 1,5 a 6 s)', tc >= 1500 && tc <= 6000);
confere('resposta maior demora mais que a curta', tm > tc && tl > tm);
confere('nunca passa do máximo por balão (12 s)', Array.from({ length: 200 }, () => tempoDeDigitacao(enorme, true)).every((x) => x <= 12000));
confere('nunca menos que o mínimo (1,5 s)', Array.from({ length: 200 }, () => tempoDeDigitacao('ok', false)).every((x) => x >= 1500));
confere('o tempo varia (não é cronometrado)', new Set(Array.from({ length: 30 }, () => tempoDeDigitacao(medio, true))).size > 10);

// espera de verdade
let t = Date.now(); await pareceDigitando(Date.now(), false, curto, true); let ms = Date.now() - t;
confere('espera real da resposta curta', ms >= 1400 && ms <= 6200, `${(ms / 1000).toFixed(1)} s`);
t = Date.now(); await pareceDigitando(Date.now(), true, longo, true); ms = Date.now() - t;
confere('emergência/crise não espera', ms < 100, `${ms} ms`);
t = Date.now(); await pareceDigitando(Date.now() - 108_000, false, longo, true); ms = Date.now() - t;
confere('perto do limite de 120 s da função: não espera (a resposta tem que sair)', ms < 100, `${ms} ms`);

// balões
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
confere('texto sem linha em branco: um balão só', eq(dividirEmBaloes(longo), [longo]));
confere('resposta da dúvida e pergunta do fluxo: dois balões', eq(dividirEmBaloes('Nosso horário é de segunda a sexta.\n\nQual dos dois fica melhor pra você?'), ['Nosso horário é de segunda a sexta.', 'Qual dos dois fica melhor pra você?']));
confere('pix: três balões (a chave fica sozinha para copiar)', eq(dividirEmBaloes('Show! A chave pix é essa, o valor é R$ 100,00:\n\nChave pix: x@y.com\n\nQuando pagar, me manda o comprovante aqui, tá?'), ['Show! A chave pix é essa, o valor é R$ 100,00:', 'Chave pix: x@y.com', 'Quando pagar, me manda o comprovante aqui, tá?']));
confere('mais de três parágrafos: os últimos se juntam', dividirEmBaloes('a\n\nb\n\nc\n\nd').length === 3 && dividirEmBaloes('a\n\nb\n\nc\n\nd')[2] === 'c\nd');
confere('texto vazio não quebra', dividirEmBaloes('').length === 1);

console.log(ok ? '\nOK' : '\nFALHOU'); process.exit(ok ? 0 : 1);
