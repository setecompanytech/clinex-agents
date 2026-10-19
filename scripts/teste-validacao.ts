/** Proteções da camada de tom (GPT): o que NUNCA pode passar. Rodar: npx tsx scripts/teste-validacao.ts */
import { validar } from '../src/lib/humanizer.js';

const orig = 'Fechado, é consulta Cardiologista no Guamá, quarta-feira, 28 de outubro, de manhã, a partir das 8h, por ordem de chegada, com Ebenezaide Nascimento Perdigão. Para eu reservar, preciso do CPF do paciente. Qual é?';
const bom = 'Fechado, vai ser consulta Cardiologista no Guamá, quarta-feira, 28 de outubro, de manhã, a partir das 8h, por ordem de chegada, com Ebenezaide Nascimento Perdigão. Para eu deixar tudo certinho, pode me passar o CPF do paciente?';

let falhas = 0;
const confere = (nome: string, esperado: 'ACEITA' | RegExp, novo: string, original = orig, protegidos: string[] = []) => {
  const r = validar(original, novo, protegidos);
  const ok = esperado === 'ACEITA' ? r === null : r !== null && esperado.test(r);
  if (!ok) falhas++;
  console.log(`${ok ? 'OK  ' : 'FALHOU'} ${nome} -> ${r ?? 'aceita'}`);
};

confere('texto carinhoso e fiel é aceito', 'ACEITA', bom);
confere('acolhimento no começo é aceito', 'ACEITA', `Que bom que você vai cuidar disso! ${bom}`);
confere('título "Dra." acrescentado', /título/, bom.replace('com Ebenezaide', 'com a Dra. Ebenezaide'));
confere('número inventado (horário)', /número inventado/, bom.replace('8h', '8h30'));
confere('dia da semana trocado', /fato inventado|fato ausente/,bom.replace('quarta-feira', 'sexta-feira'));
confere('unidade inventada', /fato inventado|fato ausente/, bom.replace('Guamá', 'Telégrafo'));
confere('valor alterado', /fato ausente|número inventado/, 'Fechado, consulta no Guamá por R$ 99,00. Qual é o CPF do paciente?', 'Fechado, consulta no Guamá por R$ 150,00. Qual é o CPF do paciente?');
confere('promessa de rapidez', /promessa/, `${bom.replace('Qual é?', '')} Atendimento rapidinho, sem fila!`.replace('?', '') + '?');
confere('garantia', /promessa/, bom.replace('Para eu deixar', 'Garanto que vai dar certo. Para eu deixar'));
confere('opinião de saúde', /promessa/, bom.replace('Para eu deixar', 'O tratamento vai te ajudar muito. Para eu deixar'));
confere('afirma que agendou', /afirmou reserva/, bom.replace('vai ser', 'ficou agendada a'));
confere('apresentação que não existia', /apresentação/, `Sou a Amanda. ${bom}`);
confere('saudação que não existia', /saudação/, `Boa tarde! ${bom}`);
confere('emoji', /emoji/, `${bom.replace('?', '')} 😊?`);
confere('travessão', /travessão/, bom.replace('Fechado,', 'Fechado —'));
confere('exclamações demais', /exclamações/, `Que bom! Que alegria! Que dia lindo! ${bom}`);
confere('abertura "Perfeito"', /abertura proibida/, `Perfeito, ${bom}`);
confere('nome de médico alterado', /nome alterado/, bom.replace('Ebenezaide Nascimento Perdigão', 'Ebenezaide Perdigão'), orig, ['Ebenezaide Nascimento Perdigão']);
confere('pergunta a mais', /criou pergunta/, 'Vou passar para a equipe. Pode aguardar?', 'Vou passar para a equipe. Só um instante.');
confere('frase de assistente automático', /assistente automático/, `Estou aqui para ajudar. ${bom}`);

// trava final: preço zerado nunca sai
const { temPrecoZero } = await import('../src/lib/humanizer.js');
for (const [txt, esperado] of [
  ['A consulta custa R$ 0,00.', true], ['O exame custa R$ 0.', true], ['custa R$0,00', true], ['No Guamá, o exame custa R$ 0,00, no dinheiro ou Pix', true],
  ['A consulta custa R$ 140,00.', false], ['A consulta custa R$ 100,00.', false], ['R$ 0,50 de taxa', false], ['R$ 1.200,00', false],
] as [string, boolean][]) {
  const ok = temPrecoZero(txt) === esperado;
  if (!ok) falhas++;
  console.log(`${ok ? 'OK  ' : 'FALHOU'} trava de preço zero: "${txt}" -> ${temPrecoZero(txt) ? 'BLOQUEIA' : 'deixa passar'}`);
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTODAS AS PROTEÇÕES FUNCIONAM');
process.exit(falhas ? 1 : 0);
