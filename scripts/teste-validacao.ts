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
// voz nova: abertura do próprio roteiro mantida; título Dr./Dra. do original preservado; serviço e especialidade protegidos
const novo1 = 'Beleza, então fica consulta Cardiologista no Guamá na quinta (22) de manhã a partir das 8h por ordem de chegada com a Dra. Fernanda. Pra agilizar o seu atendimento na recepção, você quer antecipar o pagamento por pix ou link de crédito?';
confere('o roteiro abre com "Beleza": o GPT mantendo a abertura é aceito', 'ACEITA', novo1.replace('Beleza, então fica', 'Beleza, então ficou'), novo1);
confere('o GPT ACRESCENTANDO "Beleza" é barrado', /abertura proibida/, `Beleza, ${novo1}`, novo1.replace('Beleza, então fica', 'Então fica'));
confere('título "a Dra." mantido é aceito', 'ACEITA', novo1.replace('com a Dra. Fernanda', 'com a Dra. Fernanda mesmo'), novo1, ['Dra. Fernanda']);
confere('título "Dra." removido do nome protegido é barrado', /nome alterado/, novo1.replace('a Dra. Fernanda', 'a Fernanda'), novo1, ['Dra. Fernanda']);
confere('o GPT trocando o médico para "Dr." é barrado', /nome alterado/, novo1.replace('a Dra. Fernanda', 'o Dr. Fernanda'), novo1, ['Dra. Fernanda']);
confere('serviço encurtado ("consulta Cardiologista" -> "consulta") é barrado', /nome alterado/, novo1.replace('consulta Cardiologista', 'consulta'), novo1, ['consulta Cardiologista']);
confere('dia da semana curto trocado ("quinta" -> "sexta") é barrado', /fato ausente|fato inventado/, novo1.replace('quinta (22)', 'sexta (22)'), novo1);
confere('dia da semana curto sumiu é barrado', /fato ausente/, novo1.replace('na quinta (22) de manhã', 'de manhã (22)'), novo1);
confere('nome de médico alterado',/nome alterado/, bom.replace('Ebenezaide Nascimento Perdigão', 'Ebenezaide Perdigão'), orig, ['Ebenezaide Nascimento Perdigão']);
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

// urgência não espera a janela de 30 s
const { ehUrgencia } = await import('../src/agents/receptivo/script/engine.js');
for (const [txt, esperado] of [['estou com dor no peito', true], ['to com falta de ar', true], ['quero me matar', true], ['Quero agendar uma consulta', false], ['quinta 22', false]] as [string, boolean][]) {
  const ok = ehUrgencia(txt) === esperado;
  if (!ok) falhas++;
  console.log(`${ok ? 'OK  ' : 'FALHOU'} urgência: "${txt}" -> ${ehUrgencia(txt) ? 'responde na hora' : 'espera a janela'}`);
}

// o texto do webhook pode vir como objeto ({ text } / { body }): nunca pode derrubar o agente (foi o que fez a Amanda não responder em 20/10)
{
  const { parseMessageReceived } = await import('../src/integrations/inovstar.js');
  const evento = (text: unknown) => ({ event: 'MESSAGE_RECEIVED', id: 'd1', data: { id: 'm1', direction: 'in', type: 'text', text, contact: { waId: '5591999990000' }, attendance: { id: 'a1', status: 'pending', sector: { id: 's1' } } } });
  for (const [rotulo, entrada, esperado] of [
    ['texto simples', 'olá boa tarde', 'olá boa tarde'],
    ['objeto { text }', { text: 'quero agendar gastro' }, 'quero agendar gastro'],
    ['objeto { body }', { body: 'quero agendar gastro' }, 'quero agendar gastro'],
    ['objeto sem texto', { caption: 'x' }, null],
    ['sem texto', null, null],
    ['número', 42, null],
  ] as [string, unknown, string | null][]) {
    const ev = parseMessageReceived(evento(entrada));
    const ok = ev !== null && ev.text === esperado;
    if (!ok) falhas++;
    console.log(`${ok ? 'OK  ' : 'FALHOU'} webhook com texto ${rotulo} -> ${JSON.stringify(ev?.text)}`);
  }
  // etiquetas do contato no webhook (data.contact.labels) e do atendimento (data.attendance.tags)
  const comEtiquetas = (contact: unknown, attendance: unknown = {}) => parseMessageReceived({ event: 'MESSAGE_RECEIVED', id: 'd1', data: { id: 'm1', direction: 'in', type: 'text', text: 'oi', contact: { waId: '5591999990000', ...(contact as object) }, attendance: { id: 'a1', status: 'pending', ...(attendance as object) } } });
  for (const [rotulo, ev, esperado] of [
    ['labels do contato', comEtiquetas({ labels: [{ id: '1', name: 'Amanda', color: '#fff' }, { id: '2', name: 'VIP' }] }), ['Amanda', 'VIP']],
    ['sem labels', comEtiquetas({}), []],
    ['labels em formato inesperado', comEtiquetas({ labels: 'Amanda' }), []],
    ['labels como texto simples', comEtiquetas({ labels: ['Amanda'] }), ['Amanda']],
    ['tags do atendimento também valem', comEtiquetas({ labels: [{ name: 'VIP' }] }, { tags: ['Amanda'] }), ['VIP', 'Amanda']],
  ] as [string, ReturnType<typeof parseMessageReceived>, string[]][]) {
    const ok = JSON.stringify(ev?.etiquetas) === JSON.stringify(esperado);
    if (!ok) falhas++;
    console.log(`${ok ? 'OK  ' : 'FALHOU'} etiquetas do webhook: ${rotulo} -> ${JSON.stringify(ev?.etiquetas)}`);
  }
  for (const entrada of [{ text: 'dor no peito' }, null, undefined, 42]) {
    let ok = true; try { ehUrgencia(entrada); } catch { ok = false; }
    if (!ok) falhas++;
    console.log(`${ok ? 'OK  ' : 'FALHOU'} ehUrgencia não quebra com ${JSON.stringify(entrada)}`);
  }
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTODAS AS PROTEÇÕES FUNCIONAM');
process.exit(falhas ? 1 : 0);
