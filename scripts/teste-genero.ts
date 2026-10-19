/**
 * Tratamento dos médicos: "a Dra. Fernanda", "o Dr. Armando". Rodar: npx tsx scripts/teste-genero.ts
 * Sem chave da OpenAI: só as regras (lista de nomes e terminações). Nome em dúvida fica sem título, nunca chuta o gênero.
 */
process.env.LOG_QUIET = '1';
// o modelo é simulado: nenhuma chamada real à OpenAI
process.env.OPENAI_API_KEY = 'chave-de-teste';
let resposta: { status: number; corpo: unknown } = { status: 200, corpo: {} };
const chamadas: string[] = [];
globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
  chamadas.push(String(init?.body ?? ''));
  return new Response(JSON.stringify(resposta.corpo), { status: resposta.status, headers: { 'content-type': 'application/json' } });
}) as typeof fetch;
const { exibir, exibirLista, generoSync, nomeCurto, prepararGeneros } = await import('../src/lib/genero.js');

let falhas = 0;
const confere = (nome: string, ok: boolean, detalhe = '') => { if (!ok) falhas++; console.log(`${ok ? 'OK  ' : 'FALHOU'} ${nome}${detalhe ? ` -> ${detalhe}` : ''}`); };
const igual = (nome: string, obtido: unknown, esperado: unknown) => confere(nome, JSON.stringify(obtido) === JSON.stringify(esperado), `obtido ${JSON.stringify(obtido)}${JSON.stringify(obtido) === JSON.stringify(esperado) ? '' : `, esperado ${JSON.stringify(esperado)}`}`);

// mulheres, com artigo e sem
igual('mulher pelo nome', exibir('FERNANDA BASTOS'), 'Dra. Fernanda');
igual('mulher com artigo', exibir('Fernanda Bastos', { artigo: true }), 'a Dra. Fernanda');
for (const n of ['Giovanna Pontes Moura', 'Ebenezaide Nascimento Perdigão', 'Liduina Costa Pinto', 'Rebecca Silva Moura', 'Rebeca Costa Lima', 'Emanuelly Souza', 'Thaís Almeida', 'Vanuza Reis']) {
  confere(`feminino: ${n}`, generoSync(n) === 'F', String(generoSync(n)));
}
// homens
igual('homem pelo nome', exibir('ARMANDO SOUZA'), 'Dr. Armando');
igual('homem com artigo', exibir('Armando Souza', { artigo: true }), 'o Dr. Armando');
for (const n of ['Giovanny Valente', 'Renato Gonçalves', 'Matheus Lima', 'Carlos Almeida', 'Luiz Henrique Costa', 'José Maria Souza', 'João Pedro', 'Elias Santos', 'Nicolas Prado']) {
  confere(`masculino: ${n}`, generoSync(n) === 'M', String(generoSync(n)));
}
// nome composto
igual('Ana Clara é um nome só', nomeCurto('ANA CLARA SOUZA'), 'Ana Clara');
igual('Maria Eduarda: título com o nome composto', exibir('Maria Eduarda Lima'), 'Dra. Maria Eduarda');
igual('José Carlos (composto masculino)', nomeCurto('JOSÉ CARLOS RIBEIRO'), 'José Carlos');
igual('nome simples com acento', nomeCurto('JOÃO PEDRO SILVA'), 'João Pedro');
// em dúvida: só o nome, sem artigo e sem título (nunca chuta)
igual('nome em dúvida: sem título', exibir('Xyzk Souza'), 'Xyzk');
igual('nome em dúvida: sem artigo', exibir('Xyzk Souza', { artigo: true }), 'Xyzk');
igual('Josias (termina em "as"): sem título', exibir('Josias Lima'), 'Josias');
// dois com o mesmo primeiro nome: nome completo (dois primeiros) para ninguém se confundir
igual('mesmo primeiro nome: mostra mais do nome', exibirLista(['Maria Souza', 'Maria Lima'], { artigo: true }), ['a Dra. Maria Souza', 'a Dra. Maria Lima']);
igual('primeiros nomes diferentes: só o primeiro', exibirLista(['Fernanda Bastos', 'Armando Souza'], { artigo: true }), ['a Dra. Fernanda', 'o Dr. Armando']);
igual('lista vazia', exibirLista([]), []);
// nomes que NÃO estão nas listas são confirmados com o modelo (uma vez só por nome); "não sei" fica sem título
resposta = { status: 200, corpo: { choices: [{ message: { content: JSON.stringify({ Kayque: 'M', xyzk: null, Anelise: 'F' }) } }] } };
igual('antes da confirmação, "Kayque" sem palpite pela terminação', generoSync('Kayque Silva'), undefined);
await prepararGeneros(['Kayque Silva', 'Xyzk Souza', 'Anelise Prado', undefined, 'Fernanda Bastos']);
igual('o modelo diz que Kayque é homem', exibir('Kayque Silva', { artigo: true }), 'o Dr. Kayque');
igual('o modelo diz que Anelise é mulher', exibir('Anelise Prado'), 'Dra. Anelise');
igual('o modelo não sabe: sem título', exibir('Xyzk Souza'), 'Xyzk');
const antes = chamadas.length;
await prepararGeneros(['Kayque Silva', 'Xyzk Souza', 'Fernanda Bastos']);
igual('nomes já resolvidos e nomes das listas não chamam o modelo de novo', chamadas.length, antes);
// o modelo corrige o palpite pela terminação (nome de homem que termina em "a")
resposta = { status: 200, corpo: { choices: [{ message: { content: JSON.stringify({ Nikita: 'M' }) } }] } };
igual('antes: terminação em "a" sugere mulher', generoSync('Nikita Souza'), 'F');
await prepararGeneros(['Nikita Souza']);
igual('depois: vale o que o modelo confirmou', exibir('Nikita Souza'), 'Dr. Nikita');
// falha do modelo: segue pelo palpite da terminação e não quebra
resposta = { status: 500, corpo: { error: 'falhou' } };
await prepararGeneros(['Lorena Prado', 'Zuleica Lima']);
igual('falha do modelo: nenhum erro e o palpite continua valendo', exibir('Zuleica Lima'), 'Dra. Zuleica');
const depoisDaFalha = chamadas.length;
await prepararGeneros(['Marilene Castro']);
igual('depois de uma falha, não insiste por um tempo (não atrasa a conversa)', chamadas.length, depoisDaFalha);

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTRATAMENTO DOS MÉDICOS OK');
process.exit(falhas ? 1 : 0);
