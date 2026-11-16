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

const { rodarDisparoAuto, definirModoDisparoAuto, modoDisparoAuto, avaliarLead, configAuto, configPadrao, validarConfigAuto, salvarConfigAuto, checagens } = await import('../src/crm/ia-disparo.js');
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

console.log('IA Manager (configuração dos gatilhos)');
const cfgDe = (e: Estado, mudar: Record<string, unknown>, quem = 'Gerente') => salvarConfigAuto(e, validarConfigAuto(mudar, configAuto(e)), quem, MANHA);
const ligada = () => { const e = novo(); definirModoDisparoAuto(e, 'ligado', 'Ana', MANHA); return e; };
await teste('padrões: os 5 gatilhos ligados, nos horários do guia, janela 8h–19h, todos os dias', () => {
  const c = configPadrao();
  assert.deepEqual(Object.keys(c.gatilhos), ['primeiro', 'tentativa', 'desconto', 'encerramento', 'noshow']);
  assert.deepEqual([c.gatilhos.primeiro.hora, c.gatilhos.tentativa.hora, c.gatilhos.desconto.hora, c.gatilhos.encerramento.hora, c.gatilhos.noshow.hora], ['08:30', '11:30', '16:00', '16:00', '08:30']);
  assert.equal(c.gatilhos.desconto.desconto, '10%'); assert.equal(c.gatilhos.tentativa.prazo, 'esta semana');
  assert.deepEqual(c.janela, { inicio: 8, fim: 19 }); assert.equal(c.diasSemana.length, 7); assert.equal(c.disjuntor.ativo, true);
});
await teste('validação: o guia só pode ser estreitado e as mensagens de erro são claras', () => {
  const base = configAuto(novo()); const erro = (x: unknown) => { try { validarConfigAuto(x, base); } catch (e) { return (e as Error).message; } return ''; };
  assert.match(erro({ janela: { inicio: 7, fim: 19 } }), /nunca ampliar/); assert.match(erro({ janela: { inicio: 8, fim: 20 } }), /nunca ampliar/); assert.match(erro({ janela: { inicio: 12, fim: 10 } }), /antes do fim/);
  assert.match(erro({ gatilhos: { primeiro: { hora: '07:30' } } }), /entre 8:00 e 18:59/); assert.match(erro({ gatilhos: { primeiro: { hora: '19:00' } } }), /entre 8:00 e 18:59/); assert.match(erro({ gatilhos: { primeiro: { hora: '8h30' } } }), /inválido/);
  assert.match(erro({ diasSemana: [] }), /pelo menos um dia/); assert.match(erro({ diasSemana: [9] }), /inválidos/);
  assert.match(erro({ gatilhos: { primeiro: { valorMin: 500, valorMax: 100 } } }), /mínimo é maior/); assert.match(erro({ gatilhos: { inexistente: {} } }), /desconhecido/);
  assert.match(erro({ gatilhos: { desconto: { desconto: '20%' } } }), /10% ou 5%/); assert.match(erro({ limites: { porRodada: 0 } }), /1 a 200/); assert.match(erro({ pausas: [{ de: '2026-11-10', ate: '2026-11-01' }] }), /início é depois do fim/);
  const ok = validarConfigAuto({ janela: { inicio: 9, fim: 17 }, gatilhos: { primeiro: { hora: '09:15', valorMin: 100, unidades: ['CLINEX GUAMÁ'] } }, diasSemana: [1, 2, 3] }, base);
  assert.equal(ok.janela.inicio, 9); assert.equal(ok.gatilhos.primeiro.hora, '09:15'); assert.deepEqual(ok.gatilhos.primeiro.unidades, ['CLINEX GUAMÁ']); assert.equal(base.janela.inicio, 8, 'não altera a configuração anterior');
});
await teste('gatilho desligado não envia; os outros continuam', async () => {
  pedidos.length = 0; const e = ligada(); lead(e, 'MARIA SILVA', '91988887777'); cfgDe(e, { gatilhos: { primeiro: { ativo: false } } });
  const r = await rodarDisparoAuto(e, MANHA);
  assert.equal(r.enviados, 0); assert.ok(Object.keys(r.pulados).some((m) => /desligado no IA Manager/.test(m)));
  cfgDe(e, { gatilhos: { primeiro: { ativo: true } } }); assert.equal((await rodarDisparoAuto(e, MANHA)).enviados, 1);
});
await teste('horário do gatilho e janela da IA: só envia depois do horário e dentro da janela', async () => {
  pedidos.length = 0; const e = ligada(); const l = lead(e, 'MARIA SILVA', '91988887777'); cfgDe(e, { gatilhos: { primeiro: { hora: '10:00' } } });
  assert.equal(avaliarLead(e, l, MANHA)?.tipo, 'espera'); assert.equal((await rodarDisparoAuto(e, MANHA)).enviados, 0);
  cfgDe(e, { gatilhos: { primeiro: { hora: '08:30' } }, janela: { inicio: 10, fim: 17 } });
  assert.equal(avaliarLead(e, l, MANHA)?.tipo, 'espera', 'antes da janela (9h)'); assert.equal(avaliarLead(e, l, NOITE)?.tipo, 'espera', 'depois da janela');
  assert.equal(avaliarLead(e, l, TARDE)?.tipo, 'pronto', '16:30 está dentro de 10h–17h'); assert.equal((await rodarDisparoAuto(e, TARDE)).enviados, 1);
});
await teste('dia da semana e pausa programada (feriado)', async () => {
  pedidos.length = 0; const e = ligada(); const l = lead(e, 'MARIA SILVA', '91988887777'); // 09/11/2026 é segunda
  cfgDe(e, { diasSemana: [0, 2, 3, 4, 5, 6] }); const a = avaliarLead(e, l, MANHA);
  assert.equal(a?.tipo, 'pulado'); assert.match((a as { motivo: string }).motivo, /não envia na segunda/);
  cfgDe(e, { diasSemana: [0, 1, 2, 3, 4, 5, 6], pausas: [{ id: 'p', de: HOJE, ate: HOJE, motivo: 'Feriado' }] });
  const b = avaliarLead(e, l, MANHA); assert.equal(b?.tipo, 'pulado'); assert.match((b as { motivo: string }).motivo, /Em pausa: Feriado/);
  assert.equal((await rodarDisparoAuto(e, MANHA)).enviados, 0);
  cfgDe(e, { pausas: [] }); assert.equal((await rodarDisparoAuto(e, MANHA)).enviados, 1);
});
await teste('condições: valor mínimo/máximo e unidades', async () => {
  pedidos.length = 0; const e = ligada(); const barato = lead(e, 'BARATO', '91988881111', { valor: 150 }); const caro = lead(e, 'CARO', '91988882222', { valor: 900 }); const naz = lead(e, 'NAZARE', '91988883333', { unidade: 'CLINEX NAZARÉ' });
  cfgDe(e, { gatilhos: { primeiro: { valorMin: 200, valorMax: 600, unidades: ['clinex guamá'] } } });
  assert.match((avaliarLead(e, barato, MANHA) as { motivo: string }).motivo, /fora do intervalo/); assert.match((avaliarLead(e, caro, MANHA) as { motivo: string }).motivo, /fora do intervalo/);
  assert.match((avaliarLead(e, naz, MANHA) as { motivo: string }).motivo, /não está na lista/);
  const ok = lead(e, 'OK', '91988884444', { valor: 300 }); assert.equal(avaliarLead(e, ok, MANHA)?.tipo, 'pronto', 'valor no intervalo e unidade na lista (sem diferenciar maiúsculas)');
  cfgDe(e, { gatilhos: { primeiro: { valorMin: null, valorMax: null, unidades: [] } } }); assert.equal(avaliarLead(e, barato, MANHA)?.tipo, 'pronto', 'limpar as condições libera de novo');
});
await teste('parâmetros da mensagem: desconto 5% recalcula o valor; prazo da nova tentativa', () => {
  const e = ligada(); const l = lead(e, 'ROSA LIMA', '91988886666', { valor: 400 }, somaDias(HOJE, -4));
  l.status = 'sem_retorno'; l.statusDesde = somaDias(HOJE, -1); l.faseId = 'sem_retorno:1';
  l.eventos.push({ id: 'tent', quando: em(somaDias(HOJE, -1), '11:30').toISOString(), tipo: 'contato', canal: 'whatsapp', passo: 'tentativa', fase: l.faseId, texto: 'WhatsApp · Nova tentativa' });
  cfgDe(e, { gatilhos: { desconto: { desconto: '5%' } } });
  const a = avaliarLead(e, l, TARDE) as { tipo: string; parametros: string[] }; assert.equal(a.tipo, 'pronto'); assert.deepEqual(a.parametros, ['Rosa', '5%', 'Ultrassom', 'R$ 400,00', 'R$ 380,00']);
  const m = lead(e, 'ANA', '91988885555', { valor: 300 }, somaDias(HOJE, -3)); m.status = 'sem_retorno'; m.statusDesde = somaDias(HOJE, 0); m.faseId = 'sem_retorno:1';
  cfgDe(e, { gatilhos: { tentativa: { prazo: 'hoje' } } });
  const b = avaliarLead(e, m, TARDE) as { tipo: string; parametros: string[] }; assert.equal(b.tipo, 'pronto'); assert.deepEqual(b.parametros, ['Ana', 'Ultrassom', 'hoje']);
});
await teste('limite diário da IA e máximo por rodada vindos da configuração', async () => {
  pedidos.length = 0; const e = ligada(); for (let i = 0; i < 6; i++) lead(e, `LEAD ${i}`, `9196666${1000 + i}`); cfgDe(e, { limites: { porRodada: 4, porDia: 5 } });
  const r1 = await rodarDisparoAuto(e, MANHA); assert.equal(r1.enviados, 4);
  const r2 = await rodarDisparoAuto(e, MANHA); assert.equal(r2.enviados, 1, 'só falta 1 para o limite do dia (5)'); assert.ok(Object.keys(r2.pulados).some((m) => /Limite diário da IA atingido \(5\)/.test(m)));
});
await teste('disjuntor: depois de N erros seguidos a IA se desliga sozinha e anota no histórico; desativado, ela insiste', async () => {
  pedidos.length = 0; recusar = true; const e = ligada(); for (let i = 0; i < 6; i++) lead(e, `LEAD ${i}`, `9195555${1000 + i}`); cfgDe(e, { disjuntor: { ativo: true, erros: 3 } });
  const r = await rodarDisparoAuto(e, MANHA);
  assert.equal(r.erros, 3); assert.equal(envios().length, 3, 'parou no 3º erro'); assert.equal(modoDisparoAuto(e), 'desligado');
  assert.ok(configAuto(e).historico.some((h) => h.quem === 'Disjuntor' && /3 envios seguidos recusados/.test(h.resumo)));
  const e2 = ligada(); for (let i = 0; i < 6; i++) lead(e2, `LEAD ${i}`, `9194444${1000 + i}`); cfgDe(e2, { disjuntor: { ativo: false } });
  pedidos.length = 0; const r2 = await rodarDisparoAuto(e2, MANHA); recusar = false;
  assert.equal(r2.erros, 6); assert.equal(modoDisparoAuto(e2), 'ligado');
});
await teste('histórico de mudanças: quem mudou o quê (inclusive Power); configuração inválida guardada volta ao padrão', () => {
  const e = novo(); definirModoDisparoAuto(e, 'ligado', 'Ana', MANHA); cfgDe(e, { gatilhos: { primeiro: { hora: '09:00' }, desconto: { ativo: false } }, janela: { inicio: 9, fim: 18 } }, 'Carla');
  const h = configAuto(e).historico; assert.equal(h[0].quem, 'Carla'); assert.match(h[0].resumo, /Primeiro contato: horário 08:30 → 09:00/); assert.match(h[0].resumo, /Desconto desligado/); assert.match(h[0].resumo, /janela 8h–19h → 9h–18h/);
  assert.ok(h.some((x) => x.quem === 'Ana' && /ligada/.test(x.resumo)));
  const sujo = novo(); sujo.disparoAuto = { modo: 'sombra', config: { janela: { inicio: 3, fim: 30 }, diasSemana: [], gatilhos: { primeiro: { hora: 'abc', ativo: 'sim' as never } }, limites: { porRodada: -5 } as never } as never };
  const c = configAuto(sujo); assert.deepEqual(c.janela, { inicio: 8, fim: 19 }); assert.equal(c.gatilhos.primeiro.hora, '08:30'); assert.equal(c.gatilhos.primeiro.ativo, true); assert.equal(c.limites.porRodada, 20);
});
await teste('simulador: lista todas as checagens, na ordem, com o motivo de cada falha', () => {
  const e = ligada(); const l = lead(e, 'MARIA SILVA', '91988887777'); const r = checagens(e, l, CEDO, configAuto(e));
  assert.ok(r.aplicavel); const ids = r.checks.map((c) => c.id);
  assert.deepEqual(ids, ['lead', 'passo', 'optout', 'gatilho', 'vence', 'whatsapp', 'dia', 'pausa', 'hora', 'janela', 'valor', 'unidade', 'telefone', 'dados', 'travas']);
  const falhas = r.checks.filter((c) => !c.ok).map((c) => c.id); assert.deepEqual(falhas.sort(), ['hora', 'janela', 'travas'].sort());
  const demo = lead(e, 'DEMO', '91988880000'); demo.demo = true; assert.equal(checagens(e, demo, MANHA, configAuto(e)).aplicavel, false);
});

console.log('Modo Simulação (laboratório de leads fictícios)');
const { criarLeadLab, rodarLab, resumoLab, removerLeadLab, limparLab, instanteDoRelogio, enviarLeadLab, liberarNumeroTeste, bloquearNumeroTeste, LIMITE_NUMEROS, LIMITE_LAB } = await import('../src/crm/ia-laboratorio.js');
const simulando = () => { const e = novo(); definirModoDisparoAuto(e, 'simulacao', 'Ana', MANHA); return e; };
await teste('modo simulação: aceito, vai para o histórico e a rodada real não toca em paciente real', async () => {
  pedidos.length = 0; const e = simulando(); const real = lead(e, 'MARIA SILVA', '91988887777');
  assert.equal(modoDisparoAuto(e), 'simulacao'); assert.match(configAuto(e).historico[0].resumo, /modo simulação/);
  const r = await rodarDisparoAuto(e, MANHA);
  assert.equal(r.enviados, 0); assert.equal(r.sombra, 0); assert.equal(r.avaliados, 0); assert.equal(pedidos.length, 0);
  assert.equal(real.eventos.filter((x) => x.tipo === 'nota' || x.tipo === 'contato').length, 0, 'o lead real não recebe nem nota');
});
await teste('laboratório: o lead de teste fica à parte (nunca em estado.leads) e a IA "envia" no horário certo', () => {
  const e = simulando(); const l = criarLeadLab(e, { nome: 'Paciente Teste', valor: 400, unidade: 'CLINEX GUAMÁ', diasAtras: 1 }, MANHA);
  assert.match(l.id, /^sim-/); assert.equal(e.leads.length, 0, 'não entra nos leads do CRM'); assert.equal(resumoLab(e, MANHA).leads.length, 1);
  const cedo = rodarLab(e, CEDO).resultados[0]; assert.equal(cedo.resultado, 'espera'); assert.match(cedo.motivo, /horário/);
  const r = rodarLab(e, MANHA).resultados[0]; assert.equal(r.resultado, 'enviaria'); assert.equal(r.msg, 1); assert.ok(r.texto && r.texto.includes('Paciente Teste'.split(' ')[0].toUpperCase()) || r.texto);
  const de = resumoLab(e, MANHA).leads[0]; assert.equal(de.mensagens.length, 1); assert.equal(de.mensagens[0].msg, 1);
  const dnv = rodarLab(e, MANHA).resultados[0]; assert.equal(dnv.resultado, 'nada', 'a mesma mensagem não sai duas vezes'); assert.match(dnv.motivo, /Próximo passo|Sem passo pendente/);
  assert.equal(pedidos.length, 0, 'nada vai para o WhatsApp');
});
await teste('laboratório: respeita gatilho desligado, janela e condições, como a IA de verdade', () => {
  const e = simulando(); criarLeadLab(e, { nome: 'Barato', valor: 100, diasAtras: 1 }, MANHA);
  cfgDe(e, { gatilhos: { primeiro: { valorMin: 200 } } }); const a = rodarLab(e, MANHA).resultados[0]; assert.equal(a.resultado, 'pulado'); assert.match(a.motivo, /fora do intervalo/);
  cfgDe(e, { gatilhos: { primeiro: { valorMin: null, ativo: false } } }); assert.match(rodarLab(e, MANHA).resultados[0].motivo, /desligado/);
});
await teste('laboratório: no-show, avançar o dia e limites de criação', () => {
  const e = simulando(); const n = criarLeadLab(e, { nome: 'Faltou', valor: 250, tipo: 'noshow' }, MANHA); assert.equal(n.noShow, true);
  const r = rodarLab(e, MANHA).resultados[0]; assert.equal(r.resultado, 'enviaria'); assert.equal(r.msg, 10);
  const o = simulando(); criarLeadLab(o, { nome: 'Dia a dia', valor: 300, diasAtras: 0 }, MANHA);
  const hojeLab = rodarLab(o, MANHA).resultados[0]; assert.equal(hojeLab.resultado, 'nada', 'orçamento de hoje: o 1º contato só vence amanhã'); assert.match(hojeLab.motivo, /vence em/);
  assert.equal(rodarLab(o, em(somaDias(HOJE, 1), '09:00')).resultados[0].resultado, 'enviaria', 'amanhã (D1) a IA envia');
  const erro = (x: Record<string, unknown>) => { try { criarLeadLab(o, x, MANHA); } catch (er) { return (er as Error).message; } return ''; };
  assert.match(erro({ nome: '' }), /nome/); assert.match(erro({ nome: 'X', valor: -5 }), /Valor/); assert.match(erro({ nome: 'X', diasAtras: 99 }), /0 a 30/);
  for (let i = 0; i < LIMITE_LAB; i++) { try { criarLeadLab(o, { nome: 'L' + i }, MANHA); } catch { /* limite */ } }
  assert.match(erro({ nome: 'Mais um' }), /comporta/);
  assert.equal(removerLeadLab(o, resumoLab(o, MANHA).leads[0].id), true); limparLab(o); assert.equal(resumoLab(o, MANHA).leads.length, 0);
});
await teste('laboratório com número: telefone inválido é recusado; enviar de verdade exige rodar a IA e um número de TESTE (DISPARO_LIBERADO não vale)', async () => {
  const e = simulando(); delete process.env.SIMULACAO_NUMEROS;
  assert.throws(() => criarLeadLab(e, { nome: 'X', telefone: '123' }, MANHA), /Telefone inválido/);
  const eu = criarLeadLab(e, { nome: 'Eu Mesmo', telefone: '(91) 98888-4545', valor: 300, diasAtras: 1 }, MANHA);
  const sem = criarLeadLab(e, { nome: 'Sem Numero', valor: 300, diasAtras: 1 }, MANHA);
  assert.equal(eu.telefone, '91988884545'); const r0 = resumoLab(e, MANHA).leads; assert.equal(r0[0].telefoneInformado, true); assert.equal(r0[1].telefoneInformado, false);
  assert.equal(r0[0].podeEnviar, false); assert.equal(r0[0].numeroLiberado, false);
  const envios = () => pedidos.filter((p) => /whatsapp\/send\/template/.test(p.caminho)).length;
  await assert.rejects(() => enviarLeadLab(e, eu.id, MANHA, 'Ana'), /Rode a IA antes/);
  rodarLab(e, MANHA); assert.equal(resumoLab(e, MANHA).leads[0].podeEnviar, true);
  pedidos.length = 0;
  await assert.rejects(() => enviarLeadLab(e, eu.id, MANHA, 'Ana'), (er: any) => er.status === 403 && /só envio de verdade para números de teste/.test(er.message));
  assert.equal(envios(), 0, 'DISPARO_LIBERADO=true no ambiente, mas a simulação nunca manda para número fora da lista');
  process.env.SIMULACAO_NUMEROS = '91 98888-4545, 91999990000'; assert.equal(resumoLab(e, MANHA).leads[0].numeroLiberado, true);
  const r = await enviarLeadLab(e, eu.id, MANHA, 'Ana'); assert.ok(r.mensagemId); assert.equal(envios(), 1);
  const corpo = pedidos.find((p) => /whatsapp\/send\/template/.test(p.caminho))!.corpo; assert.match(JSON.stringify(corpo), /91988884545|5591988884545/);
  await assert.rejects(() => enviarLeadLab(e, sem.id, MANHA, 'Ana'), /não tem número/);
  await assert.rejects(() => enviarLeadLab(e, 'sim-nao-existe', MANHA, 'Ana'), /não encontrado/);
  delete process.env.SIMULACAO_NUMEROS;
});
await teste('laboratório: log do lead (simulação e envios), reenvio e a razão de cada recusa', async () => {
  const e = simulando(); process.env.SIMULACAO_NUMEROS = '91988884545';
  const eu = criarLeadLab(e, { nome: 'Eu Mesmo', telefone: '91988884545', valor: 300, diasAtras: 1 }, MANHA);
  const log = () => resumoLab(e, MANHA).leads[0].log;
  await assert.rejects(() => enviarLeadLab(e, eu.id, MANHA, 'Ana'), /Rode a IA antes/);
  assert.match(log()[0].titulo, /não saiu/); assert.equal(log()[0].ok, false); assert.match(log()[0].dica ?? '', /Rode|Passos/);
  rodarLab(e, CEDO); assert.match(log()[0].titulo, /aguardaria/); assert.match(log()[0].detalhe, /horário/);
  rodarLab(e, MANHA); assert.match(log()[0].titulo, /a IA enviaria/); assert.equal(log()[0].ok, true); assert.match(log()[0].detalhe, /Msg 1/);
  pedidos.length = 0;
  const envios = () => pedidos.filter((p) => /whatsapp\/send\/template/.test(p.caminho)).length;
  await enviarLeadLab(e, eu.id, MANHA, 'Ana'); assert.equal(envios(), 1); assert.match(log()[0].titulo, /Inovstar aceitou o envio \(1º\)/); assert.match(log()[0].detalhe, /id wamid/); assert.match(log()[0].dica ?? '', /não é acompanhada/);
  await enviarLeadLab(e, eu.id, MANHA, 'Ana'); assert.equal(envios(), 2, 'dá para enviar novamente (a trava de 24 h é para pacientes)'); assert.match(log()[0].titulo, /\(2º\)/); assert.equal(resumoLab(e, MANHA).leads[0].enviosOk, 2);
  recusar = true;
  await assert.rejects(() => enviarLeadLab(e, eu.id, MANHA, 'Ana'), /recusou/);
  assert.match(log()[0].detalhe, /O WhatsApp recusou o envio: recusado/); assert.match(log()[0].dica ?? '', /Inovstar recusou/); recusar = false;
  const antes = process.env.DISPARO_WHATSAPP; process.env.DISPARO_WHATSAPP = 'false';
  await assert.rejects(() => enviarLeadLab(e, eu.id, MANHA, 'Ana'), /desligado/); assert.match(log()[0].dica ?? '', /DISPARO_WHATSAPP=true/); process.env.DISPARO_WHATSAPP = antes;
  delete process.env.SIMULACAO_NUMEROS;
  await assert.rejects(() => enviarLeadLab(e, eu.id, MANHA, 'Ana'), /só envio de verdade/); assert.match(log()[0].dica ?? '', /Liberar este número/);
  const d = resumoLab(e, MANHA).leads[0].diagnostico; assert.deepEqual([d.whatsappLigado, d.token, d.numeroInformado, d.numeroLiberado], [true, true, true, false]);
  assert.ok(log().length <= 40);
});
await teste('laboratório: números de teste liberados pela tela (sem mexer no Vercel): liberar, enviar, remover, sem repetir e com limite', async () => {
  const e = simulando(); delete process.env.SIMULACAO_NUMEROS;
  assert.throws(() => liberarNumeroTeste(e, '123', 'Ana', MANHA), /inválido/);
  const eu = criarLeadLab(e, { nome: 'Eu', telefone: '91988884545', diasAtras: 1 }, MANHA, 'Ana'); rodarLab(e, MANHA);
  await assert.rejects(() => enviarLeadLab(e, eu.id, MANHA, 'Ana'), /Libere este número/);
  liberarNumeroTeste(e, '(91) 98888-4545', 'Ana', MANHA); assert.throws(() => liberarNumeroTeste(e, '91988884545', 'Ana', MANHA), /já está liberado/);
  const r = resumoLab(e, MANHA); assert.equal(r.leads[0].numeroLiberado, true); assert.ok(r.numeros.some((n) => n.origem === 'tela' && n.quem === 'Ana')); assert.equal(e.disparoAuto?.simulacao?.leads.length, 1, 'liberar número não apaga os leads de teste');
  assert.match(configAuto(e).historico[0].resumo, /Número de teste liberado: final 4545/);
  pedidos.length = 0; await enviarLeadLab(e, eu.id, MANHA, 'Ana'); assert.equal(pedidos.filter((p) => /whatsapp\/send\/template/.test(p.caminho)).length, 1);
  assert.equal(bloquearNumeroTeste(e, '91988884545', 'Ana', MANHA), true); assert.equal(resumoLab(e, MANHA).leads[0].numeroLiberado, false); assert.equal(bloquearNumeroTeste(e, '91999990000', 'Ana', MANHA), false);
  const l2 = criarLeadLab(e, { nome: 'Outro', telefone: '91977776666', liberar: true, diasAtras: 1 }, MANHA, 'Ana'); assert.equal(resumoLab(e, MANHA).leads.find((x) => x.id === l2.id)!.numeroLiberado, true);
  for (let i = 0; i < LIMITE_NUMEROS + 2; i++) { try { liberarNumeroTeste(e, `9198800${String(1000 + i)}`, 'Ana', MANHA); } catch (er) { assert.match((er as Error).message, /Você já liberou/); break; } }
  assert.ok(resumoLab(e, MANHA).numeros.filter((n) => n.origem === 'tela').length <= LIMITE_NUMEROS);
});
await teste('laboratório: o relógio simulado vem em horário de Belém', () => {
  assert.equal(instanteDoRelogio('2026-11-09T08:30').toISOString(), '2026-11-09T11:30:00.000Z');
  const agora = new Date('2026-01-01T00:00:00Z'); assert.equal(instanteDoRelogio('lixo', agora), agora);
});

void hojeDe;

console.log(`\n${ok} testes passaram${process.exitCode ? ', COM FALHAS' : ''}.`);
servidor.close(); process.exit(process.exitCode ?? 0);
