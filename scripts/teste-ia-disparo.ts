/**
 * IA de disparo (src/crm/ia-disparo.ts) e rastreio das respostas (src/crm/rastreio.ts) contra uma Inovstar FALSA.
 * Nada aqui chama o serviço real nem manda mensagem a ninguém. Rodar: npx tsx scripts/teste-ia-disparo.ts
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

const pedidos: { caminho: string; corpo: any }[] = [];
let recusar = false;
const servidor = createServer((req, res) => {
  let txt = ''; req.on('data', (d) => { txt += d; }).on('end', () => {
    pedidos.push({ caminho: req.url!, corpo: txt ? JSON.parse(txt) : undefined });
    const j = (s: number, o: unknown) => res.writeHead(s, { 'content-type': 'application/json' }).end(JSON.stringify(o));
    if (req.url === '/api/company') return j(200, { companies: [{ _id: 'emp1' }] });
    if (req.url === '/api/channels/company/emp1') return j(200, { success: true, data: [{ _id: 'waba', type: 'whatsCloud', status: 'connected' }] });
    if (req.url === '/api/whatsapp/send/template') return recusar ? j(400, { error: { message: 'recusado' } }) : j(200, { data: { whatsappMessageId: `wamid.${pedidos.length}` } });
    j(404, {});
  });
});
await new Promise<void>((r) => servidor.listen(0, r));
process.env.INOVSTAR_BASE_URL = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
process.env.INOVSTAR_TOKEN = 'token-de-teste';
process.env.DISPARO_WHATSAPP = 'true'; process.env.DISPARO_LIBERADO = 'true';
delete process.env.DISPARO_LIMITE_DIA; delete process.env.DISPARO_AUTO; delete process.env.DISPARO_NUMEROS;

const { rodarDisparoAuto, definirModoDisparoAuto, modoDisparoAuto, avaliarLead } = await import('../src/crm/ia-disparo.js');
const { classificarResposta, registrarResposta } = await import('../src/crm/rastreio.js');
const { criarLead, aplicar, somaDias, hojeDe } = await import('../src/crm/motor.js');
const { regrasPadrao } = await import('../src/crm/automacoes.js');
const { funisPadrao } = await import('../src/crm/pipeline/regras.js');
type Estado = import('../src/crm/banco.js').Estado;

const em = (dia: string, h: string) => new Date(`${dia}T${h}:00-03:00`);
const HOJE = '2026-11-09';
const MANHA = em(HOJE, '09:00'), CEDO = em(HOJE, '07:00'), TARDE = em(HOJE, '16:30'), NOITE = em(HOJE, '20:00');
const novo = (): Estado => ({ versao: 1, atendentes: [], leads: [], usuarios: [], automacoes: regrasPadrao(MANHA), logAuto: [], pipelines: { funis: funisPadrao(MANHA), atribuicoes: [], extras: {}, followups: [], contatos: [], rotina: {} } });
// d0 = ontem: o 1º contato (D1) vence hoje às 08:30
const lead = (e: Estado, nome: string, tel: string, extra: Record<string, unknown> = {}, d0 = somaDias(HOJE, -1)) => { const l = criarLead({ nome, telefone: tel, valor: 300, unidade: 'CLINEX GUAMÁ', exame: 'Ultrassom', atendente: 'Carla', d0, ...extra } as never, em(d0, '10:00')); e.leads.push(l); return l; };
const envios = () => pedidos.filter((p) => p.caminho === '/api/whatsapp/send/template');

let ok = 0;
const teste = async (nome: string, fn: () => Promise<void> | void) => { try { await fn(); ok++; console.log(`  ok  ${nome}`); } catch (e) { console.error(`FALHOU  ${nome}\n        ${(e as Error).message}`); process.exitCode = 1; } };

console.log('Modos');
await teste('começa desligada; a variável DISPARO_AUTO=desligado força desligada mesmo com o modo ligado', () => {
  const e = novo();
  assert.equal(modoDisparoAuto(e), 'desligado');
  definirModoDisparoAuto(e, 'ligado', 'Ana', MANHA); assert.equal(modoDisparoAuto(e), 'ligado'); assert.equal(e.disparoAuto?.alteradoPor, 'Ana');
  process.env.DISPARO_AUTO = 'desligado'; assert.equal(modoDisparoAuto(e), 'desligado'); delete process.env.DISPARO_AUTO;
  assert.throws(() => definirModoDisparoAuto(e, 'maluco' as never, 'Ana', MANHA));
});
await teste('desligada: não envia nada', async () => {
  pedidos.length = 0; const e = novo(); lead(e, 'MARIA SILVA', '91988887777');
  const r = await rodarDisparoAuto(e, MANHA);
  assert.equal(r.enviados, 0); assert.equal(envios().length, 0); assert.equal(r.modo, 'desligado');
});

console.log('Modo sombra');
await teste('sombra: anota o que enviaria, não envia e não conta como contato', async () => {
  pedidos.length = 0; const e = novo(); const l = lead(e, 'MARIA SILVA', '91988887777');
  definirModoDisparoAuto(e, 'sombra', 'Ana', MANHA);
  const r = await rodarDisparoAuto(e, MANHA);
  assert.equal(r.sombra, 1); assert.equal(r.enviados, 0); assert.equal(envios().length, 0);
  assert.ok(l.eventos.some((x) => x.tipo === 'nota' && x.texto.startsWith('IA (sombra): enviaria a Msg 1')));
  assert.equal(l.eventos.some((x) => x.tipo === 'contato'), false, 'sombra não registra contato');
  await rodarDisparoAuto(e, MANHA);
  assert.equal(l.eventos.filter((x) => x.texto.startsWith('IA (sombra)')).length, 1, 'não repete a anotação no mesmo dia');
});

console.log('Modo ligado');
await teste('envia o 1º contato sozinha, com o modelo e as variáveis certas, marcado como automático', async () => {
  pedidos.length = 0; const e = novo(); const l = lead(e, 'MARIA SILVA', '91988887777');
  definirModoDisparoAuto(e, 'ligado', 'Ana', MANHA);
  const gravou: number[] = [];
  const r = await rodarDisparoAuto(e, MANHA, { gravar: async () => { gravou.push(1); } });
  assert.equal(r.enviados, 1); assert.equal(envios().length, 1); assert.ok(gravou.length >= 1, 'gravou depois do envio');
  const t = envios()[0].corpo.template;
  assert.equal(t.name, 'primeiro_contato'); assert.deepEqual(t.components[0].parameters.map((p: { text: string }) => p.text), ['Maria', 'Carla', 'Ultrassom']);
  const c = l.eventos.find((x) => x.tipo === 'contato')!;
  assert.equal(c.auto, true); assert.equal(c.msg, 1); assert.equal(c.passo, 'primeiro'); assert.equal(c.atendente, 'IA');
});
await teste('rodar de novo não envia duas vezes', async () => {
  pedidos.length = 0; const e = novo(); lead(e, 'MARIA SILVA', '91988887777'); definirModoDisparoAuto(e, 'ligado', 'Ana', MANHA);
  await rodarDisparoAuto(e, MANHA); const r2 = await rodarDisparoAuto(e, MANHA);
  assert.equal(envios().length, 1); assert.equal(r2.enviados, 0);
});
await teste('espera o horário do passo (08:30) e a janela de contato (8h às 19h)', async () => {
  pedidos.length = 0; const e = novo(); lead(e, 'MARIA SILVA', '91988887777'); definirModoDisparoAuto(e, 'ligado', 'Ana', CEDO);
  const r = await rodarDisparoAuto(e, CEDO);
  assert.equal(r.enviados, 0); assert.ok(Object.keys(r.pulados).some((m) => /Aguardando o horário do passo \(08:30\)/.test(m)));
  const r2 = await rodarDisparoAuto(e, NOITE);
  assert.equal(r2.enviados, 0, 'à noite não envia');
  assert.equal(envios().length, 0);
});
await teste('passo atrasado NÃO é enviado sozinho (a cadência já passou)', async () => {
  pedidos.length = 0; const e = novo(); lead(e, 'ANTIGO', '91988880000', {}, somaDias(HOJE, -5)); definirModoDisparoAuto(e, 'ligado', 'Ana', MANHA);
  const r = await rodarDisparoAuto(e, MANHA);
  assert.equal(r.enviados, 0); assert.ok(Object.keys(r.pulados).some((m) => /atrasado/i.test(m)));
});
await teste('quem pediu para não receber mensagens nunca recebe; lead de exemplo também não', async () => {
  pedidos.length = 0; const e = novo(); const a = lead(e, 'A', '91988881111'); a.semDisparoAuto = true; const b = lead(e, 'B', '91988882222'); b.demo = true;
  definirModoDisparoAuto(e, 'ligado', 'Ana', MANHA);
  const r = await rodarDisparoAuto(e, MANHA);
  assert.equal(r.enviados, 0); assert.equal(envios().length, 0);
});
await teste('respeita as travas do envio manual: telefone inválido, já foi à recepção e limite do dia', async () => {
  pedidos.length = 0; const e = novo(); lead(e, 'SEM FONE', '91988880001').telefone = '123'; const rec = lead(e, 'RECEPCAO', '91988883333');
  aplicar(rec, { tipo: 'recepcao' }, MANHA); // virou convertido orgânico: encerrado
  definirModoDisparoAuto(e, 'ligado', 'Ana', MANHA);
  const r = await rodarDisparoAuto(e, MANHA);
  assert.equal(r.enviados, 0);
  process.env.DISPARO_LIMITE_DIA = '2';
  const e2 = novo(); for (let i = 0; i < 5; i++) lead(e2, `LEAD ${i}`, `9198888${1000 + i}`); definirModoDisparoAuto(e2, 'ligado', 'Ana', MANHA);
  pedidos.length = 0; const r2 = await rodarDisparoAuto(e2, MANHA);
  assert.equal(r2.enviados, 2, 'para no limite do dia'); assert.equal(envios().length, 2);
  delete process.env.DISPARO_LIMITE_DIA;
});
await teste('máximo por rodada: o resto fica para a próxima', async () => {
  pedidos.length = 0; const e = novo(); for (let i = 0; i < 5; i++) lead(e, `LEAD ${i}`, `9197777${1000 + i}`); definirModoDisparoAuto(e, 'ligado', 'Ana', MANHA);
  const r = await rodarDisparoAuto(e, MANHA, { max: 3 });
  assert.equal(r.enviados, 3);
  const r2 = await rodarDisparoAuto(e, MANHA, { max: 3 });
  assert.equal(r2.enviados, 2); assert.equal(envios().length, 5);
});
await teste('a Inovstar recusa: conta erro, o lead não fica marcado como contatado e a rodada segue', async () => {
  pedidos.length = 0; recusar = true; const e = novo(); const l = lead(e, 'MARIA', '91988884444'); definirModoDisparoAuto(e, 'ligado', 'Ana', MANHA);
  const r = await rodarDisparoAuto(e, MANHA);
  recusar = false;
  assert.equal(r.erros, 1); assert.equal(r.enviados, 0); assert.equal(l.eventos.some((x) => x.tipo === 'contato'), false);
});
await teste('com DISPARO_WHATSAPP desligado no ambiente não envia e avisa', async () => {
  pedidos.length = 0; process.env.DISPARO_WHATSAPP = 'false'; const e = novo(); lead(e, 'MARIA', '91988885555'); definirModoDisparoAuto(e, 'ligado', 'Ana', MANHA);
  const r = await rodarDisparoAuto(e, MANHA); process.env.DISPARO_WHATSAPP = 'true';
  assert.equal(r.enviados, 0); assert.ok(Object.keys(r.pulados).some((m) => /DISPARO_WHATSAPP/.test(m)));
});
await teste('mensagens seguintes da cadência: desconto (D4, 16h) com os 5 dados; só depois do horário', async () => {
  pedidos.length = 0; const e = novo();
  // sem retorno desde D3; D4 (desconto) vence hoje às 16:00
  const l = lead(e, 'ROSA LIMA', '91988886666', { valor: 400 }, somaDias(HOJE, -4));
  l.status = 'sem_retorno'; l.statusDesde = somaDias(HOJE, -1); l.faseId = 'sem_retorno:1';
  l.eventos.push({ id: 'tent', quando: em(somaDias(HOJE, -1), '11:30').toISOString(), tipo: 'contato', canal: 'whatsapp', passo: 'tentativa', fase: l.faseId, texto: 'WhatsApp · Nova tentativa' }); // a nova tentativa (D3) já foi feita
  definirModoDisparoAuto(e, 'ligado', 'Ana', MANHA);
  const cedo = avaliarLead(e, l, MANHA); assert.equal(cedo?.tipo, 'espera', 'de manhã ainda espera as 16:00');
  const r = await rodarDisparoAuto(e, TARDE);
  assert.equal(r.enviados, 1); const t = envios()[0].corpo.template;
  assert.equal(t.name, 'desconto_d4'); assert.deepEqual(t.components[0].parameters.map((p: { text: string }) => p.text), ['Rosa', '10%', 'Ultrassom', 'R$ 400,00', 'R$ 360,00']);
});

console.log('Rastreio das respostas');
await teste('classifica botões e texto livre', () => {
  const c = (t: string | null) => classificarResposta(t).intencao;
  assert.equal(c('Agendar'), 'agendar'); assert.equal(c('Ver valor e horário'), 'valor_horario'); assert.equal(c('Não tenho interesse'), 'sem_interesse');
  assert.equal(c('Esclarecer dúvida'), 'duvida'); assert.equal(c('Ainda quero o exame'), 'ainda_quer'); assert.equal(c('Já fiz o exame'), 'ja_fez');
  assert.equal(c('Quanto custa?'), 'valor_horario'); assert.equal(c('sim'), 'agendar'); assert.equal(c('Quero marcar pra quinta'), 'agendar');
  assert.equal(c('preciso levar pedido médico?'), 'duvida'); assert.equal(c('já fiz em outro lugar'), 'sem_interesse'); assert.equal(c('Vocês aceitam o meu plano'), 'duvida');
  assert.equal(c(null), 'outro'); assert.equal(c('bom dia'), 'outro');
  assert.equal(classificarResposta('pare de me mandar mensagem').parar, true); assert.equal(classificarResposta('Não tenho interesse').parar, false);
});
await teste('resposta a um disparo vira evento no lead certo, com texto, intenção e a mensagem respondida; quem estava em aberto vai para negociação', async () => {
  pedidos.length = 0; const e = novo(); const l = lead(e, 'MARIA SILVA', '91988887777'); const outra = lead(e, 'OUTRA PESSOA', '91955550000');
  definirModoDisparoAuto(e, 'ligado', 'Ana', MANHA); await rodarDisparoAuto(e, MANHA);
  const r = registrarResposta(e, { telefone: '+5591988887777', texto: 'Quanto custa o ultrassom?', tipo: 'text', messageId: 'm1' }, em(HOJE, '09:20'));
  assert.equal(r.registrado, true); assert.equal(r.leadId, l.id); assert.equal(r.intencao, 'valor_horario');
  const ev = l.eventos.find((x) => x.tipo === 'resposta')!;
  assert.equal(ev.resp, 'Quanto custa o ultrassom?'); assert.equal(ev.intencao, 'valor_horario'); assert.equal(ev.msg, 1); assert.equal(ev.msgId, 'm1');
  assert.equal(l.status, 'negociacao', 'seguiu a regra do guia');
  assert.equal(outra.eventos.some((x) => x.tipo === 'resposta'), false);
  assert.equal(l.eventos.filter((x) => x.tipo === 'resposta').length, 1, 'um único evento de resposta (as análises não contam dobrado)');
});
await teste('não registra a mesma mensagem duas vezes, nem resposta de quem nunca recebeu disparo', async () => {
  pedidos.length = 0; const e = novo(); const l = lead(e, 'MARIA SILVA', '91988887777'); definirModoDisparoAuto(e, 'ligado', 'Ana', MANHA); await rodarDisparoAuto(e, MANHA);
  assert.equal(registrarResposta(e, { telefone: '91988887777', texto: 'oi', messageId: 'm9' }, MANHA).registrado, true);
  assert.equal(registrarResposta(e, { telefone: '91988887777', texto: 'oi', messageId: 'm9' }, MANHA).registrado, false, 'reenvio do webhook');
  assert.equal(registrarResposta(e, { telefone: '91911112222', texto: 'oi', messageId: 'x' }, MANHA).registrado, false, 'telefone sem disparo');
  assert.equal(l.eventos.filter((x) => x.tipo === 'resposta').length, 1);
});
await teste('"não tenho interesse" só registra (descartar é decisão de uma pessoa); "pare" bloqueia novos disparos', async () => {
  pedidos.length = 0; const e = novo(); const l = lead(e, 'MARIA SILVA', '91988887777'); definirModoDisparoAuto(e, 'ligado', 'Ana', MANHA); await rodarDisparoAuto(e, MANHA);
  registrarResposta(e, { telefone: '91988887777', texto: 'Não tenho interesse', messageId: 'a' }, MANHA);
  assert.equal(l.status, 'aberto', 'não moveu'); assert.equal(l.eventos.find((x) => x.tipo === 'resposta')?.intencao, 'sem_interesse'); assert.equal(l.semDisparoAuto, undefined);
  registrarResposta(e, { telefone: '91988887777', texto: 'por favor pare de me mandar mensagem', messageId: 'b' }, MANHA);
  assert.equal(l.semDisparoAuto, true);
  const l2 = lead(e, 'OUTRA', '91988889999'); l2.semDisparoAuto = true;
  assert.equal(avaliarLead(e, l2, MANHA)?.tipo, 'pulado');
});
await teste('áudio e imagem (sem texto) também são registrados', async () => {
  pedidos.length = 0; const e = novo(); const l = lead(e, 'MARIA SILVA', '91988887777'); definirModoDisparoAuto(e, 'ligado', 'Ana', MANHA); await rodarDisparoAuto(e, MANHA);
  registrarResposta(e, { telefone: '91988887777', texto: null, tipo: 'audio', messageId: 'au1' }, MANHA);
  assert.equal(l.eventos.find((x) => x.tipo === 'resposta')?.resp, '[áudio]');
});
await teste('resposta depois de 14 dias do disparo não é atribuída', async () => {
  pedidos.length = 0; const e = novo(); lead(e, 'MARIA SILVA', '91988887777'); definirModoDisparoAuto(e, 'ligado', 'Ana', MANHA); await rodarDisparoAuto(e, MANHA);
  assert.equal(registrarResposta(e, { telefone: '91988887777', texto: 'oi', messageId: 'tarde' }, em(somaDias(HOJE, 20), '10:00')).registrado, false);
});
void hojeDe;

console.log(`\n${ok} testes passaram${process.exitCode ? ', COM FALHAS' : ''}.`);
servidor.close(); process.exit(process.exitCode ?? 0);
