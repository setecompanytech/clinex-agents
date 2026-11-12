/**
 * Disparo de WhatsApp por modelo (src/crm/whatsapp.ts + sendTemplate em src/integrations/inovstar.ts) contra uma
 * Inovstar FALSA. Nada aqui chama o serviço real nem manda mensagem a ninguém.
 * Rodar: npx tsx scripts/teste-whatsapp-crm.ts
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

// ---------------------------------------------------------------- Inovstar falsa
type Pedido = { metodo: string; caminho: string; corpo: any; auth?: string };
const pedidos: Pedido[] = [];
let modo: 'ok' | 'recusa' = 'ok';
const servidor = createServer((req, res) => {
  let txt = ''; req.on('data', (d) => { txt += d; }).on('end', () => {
    pedidos.push({ metodo: req.method!, caminho: req.url!, corpo: txt ? JSON.parse(txt) : undefined, auth: req.headers.authorization });
    const j = (s: number, o: unknown) => res.writeHead(s, { 'content-type': 'application/json' }).end(JSON.stringify(o));
    if (req.url === '/api/company') return j(200, { companies: [{ _id: 'emp1' }] });
    if (req.url === '/api/channels/company/emp1') return j(200, { success: true, count: 3, data: [{ _id: 'wabaOff', type: 'whatsCloud', status: 'disconnected' }, { _id: 'outro', type: 'evolution', status: 'connected' }, { _id: 'canal1', type: 'whatsCloud', status: 'connected', name: 'Canal Principal' }] }); // formato real da Inovstar
    if (req.url === '/api/whatsapp/send/template') return modo === 'ok' ? j(200, { data: { whatsappMessageId: 'wamid.ABC' } }) : j(400, { error: { message: 'Template recuperacao_2 does not exist in pt_BR' } });
    j(404, {});
  });
});
await new Promise<void>((r) => servidor.listen(0, r));
process.env.INOVSTAR_BASE_URL = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
process.env.INOVSTAR_TOKEN = 'token-de-teste';
process.env.DISPARO_NUMEROS = '+55 91 98888-7777, 91977776666';
process.env.ALLOWED_NUMBERS = '91955554444'; // lista da Amanda: NÃO vale para o disparo
process.env.DISPARO_WHATSAPP = 'true';
delete process.env.DISPARO_LIBERADO; delete process.env.DISPARO_LIMITE_DIA;

const { paraE164Brasil, esquecerCanal } = await import('../src/integrations/inovstar.js');
const { enviarModelo, DisparoError, modelosParaLead, enviadosHoje, nomeBonito } = await import('../src/crm/whatsapp.js');
const { criarLead } = await import('../src/crm/motor.js');
const { regrasPadrao } = await import('../src/crm/automacoes.js');
const { funisPadrao } = await import('../src/crm/pipeline/regras.js');
type Estado = import('../src/crm/banco.js').Estado;

const AGORA = new Date('2026-11-09T14:00:00Z'); // 11h em Belém, dentro da janela de contato
const novo = (): Estado => ({ versao: 1, atendentes: [], leads: [], usuarios: [], automacoes: regrasPadrao(AGORA), logAuto: [], pipelines: { funis: funisPadrao(AGORA), atribuicoes: [], extras: {}, followups: [], contatos: [], rotina: {} } });
const lead = (e: Estado, nome: string, tel: string, extra: Record<string, unknown> = {}) => { const l = criarLead({ nome, telefone: tel, valor: 380, unidade: 'CLINEX GUAMÁ', exame: 'Ultrassom', d0: '2026-11-08' }, AGORA); Object.assign(l, extra); e.leads.push(l); return l; };
const envios = () => pedidos.filter((p) => p.caminho === '/api/whatsapp/send/template');
const rejeita = async (f: () => Promise<unknown>, codigo: string) => assert.rejects(f, (e: Error) => e instanceof DisparoError && e.codigo === codigo, `deveria falhar com "${codigo}"`);
const P3 = ['Maria Silva', 'Clinex Guamá', 'R$ 380,00'];

let ok = 0;
const teste = async (nome: string, fn: () => Promise<void> | void) => { try { await fn(); ok++; console.log(`  ok  ${nome}`); } catch (e) { console.error(`FALHOU  ${nome}\n        ${(e as Error).message}`); process.exitCode = 1; } };

await teste('telefone: +55 e DDD; 10 ou 11 dígitos; DDD 55 não é confundido com código do país; lixo é recusado', () => {
  assert.equal(paraE164Brasil('(91) 98888-7777'), '+5591988887777');
  assert.equal(paraE164Brasil('+55 91 98888-7777'), '+5591988887777');
  assert.equal(paraE164Brasil('9188887777'), '+559188887777');
  assert.equal(paraE164Brasil('55988887777'), '+5555988887777', 'DDD 55 (RS) com 11 dígitos');
  assert.equal(paraE164Brasil('5555988887777'), '+5555988887777');
  assert.equal(paraE164Brasil('12345'), null); assert.equal(paraE164Brasil(''), null); assert.equal(paraE164Brasil('+1 415 555 2671'), null);
});

await teste('nomes e variáveis padrão vêm do lead (nome bonito, unidade, valor em reais)', () => {
  assert.equal(nomeBonito('TAIS DE PAULA FURTADO DE OLIVEIRA'), 'Tais de Paula Furtado de Oliveira');
  const e = novo(); const l = lead(e, 'MARIA SILVA', '91988887777');
  const m = modelosParaLead(e, l);
  assert.deepEqual(m.find((x) => x.id === 'recuperacao_2')!.variaveis.map((v) => v.valor), ['Maria', 'Clinex Guamá', 'R$ 380,00'], 'só o primeiro nome na saudação');
  assert.equal(m.find((x) => x.id === 'recuperacao_2')!.idioma, 'en', 'recuperacao_2 foi aprovado como "en"');
  assert.equal(m.find((x) => x.id === 'follow_up')!.variaveis[1].valor, 'Ultrassom');
});

await teste('desligado por padrão: não envia e não chama a Inovstar', async () => {
  process.env.DISPARO_WHATSAPP = 'false'; pedidos.length = 0;
  const e = novo(); const l = lead(e, 'MARIA SILVA', '91988887777');
  await rejeita(() => enviarModelo(e, l, { modelo: 'recuperacao_2', parametros: P3 }, AGORA), 'desligado');
  assert.equal(pedidos.length, 0); assert.equal(l.eventos.filter((x) => x.tipo === 'contato').length, 0);
  process.env.DISPARO_WHATSAPP = 'true';
});

await teste('fase de testes: número fora de DISPARO_NUMEROS é recusado (ALLOWED_NUMBERS, da Amanda, não conta); com DISPARO_LIBERADO passa', async () => {
  pedidos.length = 0;
  const e = novo(); const l = lead(e, 'JOANA', '91955554444');
  await rejeita(() => enviarModelo(e, l, { modelo: 'recuperacao_2', parametros: P3 }, AGORA), 'fora_da_lista');
  assert.equal(pedidos.length, 0);
  process.env.DISPARO_LIBERADO = 'true';
  await enviarModelo(e, l, { modelo: 'recuperacao_2', parametros: P3 }, AGORA);
  assert.equal(envios().length, 1);
  delete process.env.DISPARO_LIBERADO;
});

await teste('envio: corpo exato para a Inovstar (canal conectado, +55, BODY posicional) e contato registrado sem expor o número', async () => {
  esquecerCanal(); pedidos.length = 0;
  const e = novo(); const l = lead(e, 'MARIA SILVA', '(91) 98888-7777');
  const r = await enviarModelo(e, l, { modelo: 'recuperacao_2', parametros: P3, atendente: 'Carla' }, AGORA);
  assert.equal(r.mensagemId, 'wamid.ABC');
  const env = envios()[0];
  assert.equal(env.auth, 'Bearer token-de-teste');
  assert.equal(env.corpo.channelId, 'canal1', 'pula o canal desconectado');
  assert.equal(env.corpo.to, '+5591988887777');
  assert.match(env.corpo.clientMessageId, new RegExp(`^clinex-crm-${l.id}-recuperacao_2-\\d+$`));
  assert.deepEqual(env.corpo.template, { name: 'recuperacao_2', language: 'en', components: [{ type: 'BODY', parameters: P3.map((text) => ({ type: 'text', text })) }] });
  const c = l.eventos.filter((x) => x.tipo === 'contato').at(-1)!;
  assert.equal(c.canal, 'whatsapp'); assert.equal(c.atendente, 'Carla');
  assert.ok(c.texto.startsWith('WhatsApp · modelo recuperacao_2 (en)') && c.texto.includes('wamid.ABC') && c.texto.includes('Nome do paciente: Maria Silva'));
  assert.ok(c.texto.includes('7777') && !c.texto.includes('9198888'), 'só os 4 últimos dígitos ficam no histórico');
  assert.equal(enviadosHoje(e, AGORA), 1);
});

await teste('o canal é descoberto uma vez e reaproveitado', async () => {
  pedidos.length = 0;
  const e = novo(); const l = lead(e, 'ANA', '91977776666');
  await enviarModelo(e, l, { modelo: 'follow_up', parametros: ['Ana', 'Ultrassom'] }, AGORA);
  assert.equal(pedidos.filter((p) => p.caminho === '/api/company').length, 0, 'cache de 10 minutos');
  assert.equal(envios()[0].corpo.template.language, 'en', 'follow_up foi cadastrado como English na Meta');
});

await teste('o mesmo modelo não volta ao mesmo lead em 24 h (nem mesmo se a tela mandar de novo)', async () => {
  pedidos.length = 0;
  const e = novo(); const l = lead(e, 'MARIA SILVA', '91988887777');
  await enviarModelo(e, l, { modelo: 'follow_up', parametros: ['Maria', 'Ultrassom'] }, AGORA);
  await rejeita(() => enviarModelo(e, l, { modelo: 'follow_up', parametros: ['Maria', 'Ultrassom'] }, new Date(AGORA.getTime() + 3_600_000)), 'duplicado');
  assert.equal(envios().length, 1);
});

await teste('limite diário: depois de N envios no dia, recusa', async () => {
  process.env.DISPARO_LIMITE_DIA = '1'; pedidos.length = 0;
  const e = novo(); const a = lead(e, 'MARIA SILVA', '91988887777'); const b = lead(e, 'ANA', '91977776666');
  await enviarModelo(e, a, { modelo: 'follow_up', parametros: ['Maria', 'x'] }, AGORA);
  await rejeita(() => enviarModelo(e, b, { modelo: 'follow_up', parametros: ['Ana', 'x'] }, AGORA), 'limite');
  assert.equal(envios().length, 1); delete process.env.DISPARO_LIMITE_DIA;
});

await teste('a Inovstar recusa (modelo ou idioma errado): erro claro e NADA é registrado no lead', async () => {
  modo = 'recusa';
  const e = novo(); const l = lead(e, 'MARIA SILVA', '91988887777');
  await assert.rejects(() => enviarModelo(e, l, { modelo: 'recuperacao_2', parametros: P3 }, AGORA), (x: Error) => x instanceof DisparoError && x.codigo === 'envio' && x.message.includes('does not exist in pt_BR'));
  assert.equal(l.eventos.filter((x) => x.tipo === 'contato').length, 0); assert.equal(enviadosHoje(e, AGORA), 0);
  modo = 'ok';
});

await teste('variáveis: quantidade errada ou vazia é recusada; cada valor vai com no máximo 200 caracteres; modelo desconhecido é recusado', async () => {
  pedidos.length = 0;
  const e = novo(); const l = lead(e, 'MARIA SILVA', '91988887777');
  await rejeita(() => enviarModelo(e, l, { modelo: 'recuperacao_2', parametros: ['só um'] }, AGORA), 'parametros');
  await rejeita(() => enviarModelo(e, l, { modelo: 'recuperacao_2', parametros: ['Maria', ' ', 'R$ 1'] }, AGORA), 'parametros');
  await rejeita(() => enviarModelo(e, l, { modelo: 'inexistente', parametros: [] }, AGORA), 'modelo');
  assert.equal(pedidos.length, 0);
  await enviarModelo(e, l, { modelo: 'follow_up', parametros: ['Maria', 'x'.repeat(500)] }, AGORA);
  assert.equal(envios()[0].corpo.template.components[0].parameters[1].text.length, 200);
});

await teste('lead encerrado ou sem telefone válido não recebe', async () => {
  pedidos.length = 0;
  const e = novo(); const a = lead(e, 'MARIA SILVA', '91988887777', { status: 'descarte' });
  await rejeita(() => enviarModelo(e, a, { modelo: 'follow_up', parametros: ['M', 'x'] }, AGORA), 'estado');
  const b = lead(e, 'ANA', '91977776666'); b.telefone = '123';
  await rejeita(() => enviarModelo(e, b, { modelo: 'follow_up', parametros: ['A', 'x'] }, AGORA), 'telefone');
  assert.equal(pedidos.length, 0);
});

await teste('respeita as regras de contato do guia (fora do horário, não envia)', async () => {
  pedidos.length = 0;
  const e = novo(); const l = lead(e, 'MARIA SILVA', '91988887777');
  await rejeita(() => enviarModelo(e, l, { modelo: 'follow_up', parametros: ['M', 'x'] }, new Date('2026-11-09T04:00:00Z')), 'regra'); // 1h em Belém
  assert.equal(pedidos.length, 0);
});

await teste('modelos do guia: nomes e idiomas do WhatsApp Manager, variáveis padrão e o modelo do passo', () => {
  const e = novo(); const l = lead(e, 'MARIA SILVA', '91988887777'); l.atendente = 'CARLA';
  const m = modelosParaLead(e, l); const de = (id: string) => m.find((x) => x.id === id)!;
  assert.deepEqual(m.map((x) => [x.id, x.idioma]), [
    ['primeiro_contato', 'pt_BR'], ['nova_tentativa_d3', 'pt_BR'], ['desconto_d4', 'pt_BR'], ['encerramento_d7', 'pt_BR'], ['retorno_personalizado', 'pt_BR'],
    ['faltoso_no_show', 'en'], ['reativacao', 'en'], ['follow_up', 'en'], ['recuperacao_2', 'en'],
  ]);
  assert.deepEqual(m.filter((x) => x.msg).map((x) => [x.msg, x.id]), [[1, 'primeiro_contato'], [2, 'nova_tentativa_d3'], [3, 'desconto_d4'], [4, 'encerramento_d7'], [9, 'retorno_personalizado'], [10, 'faltoso_no_show'], [11, 'reativacao']]);
  assert.deepEqual(de('primeiro_contato').variaveis.map((v) => v.valor), ['Maria', 'Carla', 'Ultrassom']);
  assert.deepEqual(de('nova_tentativa_d3').variaveis.map((v) => v.valor), ['Maria', 'Ultrassom', 'esta semana']);
  assert.equal(de('desconto_d4').variaveis.length, 5); assert.equal(de('desconto_d4').variaveis[1].valor, '10%');
  assert.equal(de('desconto_d4').variaveis[4].valor, 'R$ 342,00', '10% sobre R$ 380,00');
  assert.equal(de('encerramento_d7').variaveis.length, 2);
  assert.equal(de('retorno_personalizado').variaveis.length, 6);
  assert.equal(de('faltoso_no_show').variaveis[2].valor, '', 'sem card não há data da falta: a tela pede para preencher');
  assert.equal(de('reativacao').variaveis[2].valor, '', 'a condição da campanha é digitada na hora');
});
await teste('data da falta vem do card (dia do agendamento, em dd/mm/aaaa)', () => {
  const e = novo(); const l = lead(e, 'MARIA SILVA', '91988887777'); l.cardId = 'c1';
  const sn = { id: 'c1', paciente: 'Maria Silva', valor: 0, itens: ['Ultrassom'], criadoEm: '2026-11-09T07:30:00-03:00', status: 'faltou', unidade: 'CLINEX GUAMÁ' } as never;
  e.pipelines.atribuicoes.push({ funilId: 'f', cardId: 'c1', stageId: 's', enteredAt: AGORA.toISOString(), manual: false, historico: [], originSnapshot: sn, ultimoSnapshot: sn, originStatus: 'faltou', caseStatus: 'aberto' } as never);
  assert.equal(modelosParaLead(e, l).find((x) => x.id === 'faltoso_no_show')!.variaveis[2].valor, '09/11/2026');
});
await teste('envio de modelo do guia: nome e idioma certos e número exato de variáveis', async () => {
  pedidos.length = 0;
  const e = novo(); const l = lead(e, 'ANA', '91977776666');
  await rejeita(() => enviarModelo(e, l, { modelo: 'nova_tentativa_d3', parametros: ['Ana', 'Ultrassom'] }, AGORA), 'parametros');
  await enviarModelo(e, l, { modelo: 'nova_tentativa_d3', parametros: ['Ana', 'Ultrassom', 'hoje'] }, AGORA);
  assert.deepEqual(envios()[0].corpo.template, { name: 'nova_tentativa_d3', language: 'pt_BR', components: [{ type: 'BODY', parameters: ['Ana', 'Ultrassom', 'hoje'].map((text) => ({ type: 'text', text })) }] });
  await enviarModelo(e, l, { modelo: 'faltoso_no_show', parametros: ['Ana', 'Ultrassom', '09/11/2026'] }, AGORA);
  assert.equal(envios()[1].corpo.template.name, 'faltoso_no_show'); assert.equal(envios()[1].corpo.template.language, 'en');
});

console.log(`${ok} testes passaram.`);
servidor.close(); process.exit(process.exitCode ?? 0);
