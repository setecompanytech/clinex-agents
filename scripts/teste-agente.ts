/**
 * Teste do AGENTE inteiro contra uma Inovstar SIMULADA (histórico, envio, transferência, transcrição).
 * Cobre: mensagem de transferência enviada como texto normal, retomada de conversa na fila da equipe,
 * leitura do texto das mensagens ENVIADAS ({ body }), áudio sob demanda. Rodar: npx tsx scripts/teste-agente.ts
 */
import http from 'node:http';

type Chamada = { metodo: string; caminho: string; corpo: any };
let historico: any[] = [];
let chamadas: Chamada[] = [];
let transcricao: { text: string | null; status: string } = { text: null, status: 'failed' };

const server = http.createServer((req, res) => {
  let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => {
    const url = new URL(req.url!, 'http://x');
    const corpo = raw ? JSON.parse(raw) : undefined;
    const j = (body: unknown) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.method === 'GET' && /\/history$/.test(url.pathname)) return j({ data: { messages: historico } });
    chamadas.push({ metodo: req.method!, caminho: url.pathname, corpo });
    if (/\/transcribe$/.test(url.pathname)) return j({ success: true, data: { transcription: transcricao } });
    return j({ success: true });
  });
});
await new Promise<void>((ok) => server.listen(0, ok));
Object.assign(process.env, {
  INOVSTAR_BASE_URL: `http://127.0.0.1:${(server.address() as any).port}`, INOVSTAR_TOKEN: 'teste', ALLOWED_NUMBERS: '+5591900000000',
  AGENT_SECTOR_ID: 'AI', HUMAN_SECTOR_ID: 'HUM', DEBOUNCE_MS: '0', REPLY_DELAY_MIN_MS: '0', REPLY_DELAY_MAX_MS: '0',
  AGENT_TITLE: '*Amanda (IA) - Nova*', AUTO_REPLY: 'true', AGENT_MODE: 'scripted',
});
for (const k of ['OPENAI_API_KEY', 'CLINILINK_API_KEY', 'CLINILINK_API_KEY_ESCRITA', 'ANTHROPIC_API_KEY']) delete process.env[k]; // fonte simulada, sem GPT
const { handleIncoming, montarTurnos } = await import('../src/agents/receptivo/agent.js');

// ---------- montagem do histórico no formato REAL da Inovstar ----------
let n = 0;
const ts = () => new Date(Date.now() - (1000 - n++) * 1000).toISOString();
const msg = (direction: 'in' | 'out', type: string, text: any) => ({ id: `m${n}`, direction, type, text, timestamp: ts(), status: direction === 'out' ? 'delivered' : 'delivered' });
const eu = (t: string) => msg('in', 'text', { text: t });
const amanda = (t: string) => msg('out', 'text', { body: `*Amanda (IA) - Nova*\n${t}` }); // mensagem ENVIADA: { body }
const sistema = (t: string) => msg('in', 'system', { text: t });
const evento = (m: any, sectorId = 'AI', isAssigned = false) => ({
  deliveryId: 'd', messageId: m.id, attendanceId: 'att1', channelId: 'c', to: '+5591900000000', type: m.type, text: null,
  sectorId, isAssigned, isGroup: false, attendanceInfo: '{}', contactName: 'Teste',
});
async function roda(msgs: any[], sectorId = 'AI', isAssigned = false) {
  historico = msgs; chamadas = [];
  await handleIncoming(evento(msgs[msgs.length - 1], sectorId, isAssigned));
  return chamadas;
}
const textos = (c: Chamada[]) => c.filter((x) => x.caminho.endsWith('/send/text')).map((x) => x.corpo.text as string);
const transfs = (c: Chamada[]) => c.filter((x) => x.caminho.endsWith('/transfer'));

let falhas = 0;
const confere = (nome: string, ok: boolean, detalhe = '') => { if (!ok) falhas++; console.log(`${ok ? 'OK  ' : 'FALHOU'} ${nome}${detalhe ? ` -> ${detalhe}` : ''}`); };

// conversa até o pagamento (fonte simulada): serviço, unidade, vaga nº 1 e pergunta de pagamento
const ate_o_pagamento = () => [
  eu('oi'), amanda('Boa tarde! Sou a Amanda, da Clinex.'),
  eu('quero agendar cardiologia'), amanda('(?:Ah, então é|Entendi, você quer|Só pra confirmar: é|Então é) consulta de Cardiologia, é isso?'),
  eu('sim'), amanda('Consulta de Cardiologia tem agenda nestas unidades...'),
  eu('guama'), amanda('Tenho estas opções: 1. ...'),
  eu('1'), amanda('Fechado, é consulta ... Para agilizar o seu atendimento na recepção, gostaria de antecipar o pagamento por pix ou link de crédito?'),
];

// A1) transferência: a mensagem ao paciente vai como TEXTO NORMAL, antes da transferência, e a transferência não leva `message`
n = 0;
let c = await roda([eu('oi'), amanda('Boa tarde! Sou a Amanda, da Clinex.'), eu('quero falar com um atendente')]);
confere('A1 pediu atendente: envia o aviso como texto normal ANTES de transferir', c.length === 2 && c[0].caminho.endsWith('/send/text') && /equipe/.test(c[0].corpo.text) && c[1].caminho.endsWith('/transfer'), c.map((x) => x.caminho.split('/').slice(-2).join('/')).join(' -> '));
confere('A1 a transferência vai para o setor da equipe, com o motivo e SEM mensagem anexada', transfs(c)[0]?.corpo.toSectorId === 'HUM' && /atendimento humano/.test(transfs(c)[0]?.corpo.reason) && !('message' in transfs(c)[0].corpo), JSON.stringify(transfs(c)[0]?.corpo).slice(0, 120));

// A2) o texto das mensagens ENVIADAS ({ body }) é lido: depois do agendamento, "obrigado" é entendido
n = 0;
c = await roda([eu('quero agendar'), amanda('Agendamento confirmado! Deu tudo certo. Ficou assim para Renato: consulta Cardiologia no Guamá...'), eu('obrigado')]);
confere('A2 "obrigado" depois da confirmação: pergunta se pode ajudar em mais algo', /mais alguma coisa/.test(textos(c)[0] ?? '') && transfs(c).length === 0, textos(c)[0]);
n = 0;
c = await roda([eu('quero agendar'), amanda('Agendamento confirmado! Deu tudo certo.'), eu('obrigado'), amanda('Imagina, foi um prazer! Posso te ajudar com mais alguma coisa?'), eu('era só isso')]);
confere('A2 "era só isso": agradece e deseja um ótimo dia', /Tenha um ótimo dia/.test(textos(c)[0] ?? ''), textos(c)[0]);
n = 0;
c = await roda([eu('quero agendar'), amanda('Agendamento confirmado! Deu tudo certo.'), eu('obrigado'), amanda('Imagina, foi um prazer! Posso te ajudar com mais alguma coisa?'), eu('era só isso'), amanda('Por nada, foi um prazer te atender! Tenha um ótimo dia e cuide-se bem.'), eu('obrigada!')]);
confere('A2 agradecimento depois da despedida: a Amanda fica em silêncio', c.length === 0, `chamadas=${c.length}`);

// A3) RETOMAR: a Amanda transferiu (comprovante/vaga/etc.), o paciente volta a escrever na fila da equipe -> ela volta e continua
n = 0;
const base = ate_o_pagamento();
c = await roda([...base, eu('link de crédito'), amanda('Combinado! Vou pedir para a equipe te enviar o link de pagamento...'), sistema('Transferido pela API para o setor Principal'), eu('na verdade vou pagar no pix')], 'HUM');
confere('A3 paciente volta na fila da equipe: a conversa é devolvida para a Amanda ANTES de responder', transfs(c)[0]?.corpo.toSectorId === 'AI' && !('message' in transfs(c)[0].corpo) && c.findIndex((x) => x.caminho.endsWith('/transfer')) < c.findIndex((x) => x.caminho.endsWith('/send/text')), c.map((x) => x.caminho.split('/').slice(-1)[0]).join(' -> '));
confere('A3 e continua de onde parou: manda a chave pix (em balões: a chave fica sozinha, para copiar)', /Chave pix:/.test(textos(c).join('\n')) && textos(c).length === 3 && /^Chave pix:/m.test(textos(c)[1] ?? '') && /Amanda \(IA\)/.test(textos(c)[0] ?? '') && !/Amanda \(IA\)/.test(textos(c)[1] ?? ''), textos(c).join(' | ').replace(/\n/g, ' ').slice(0, 160));

// A4) pediu um humano: a Amanda NÃO retoma
n = 0;
c = await roda([eu('oi'), amanda('Boa tarde! Sou a Amanda, da Clinex.'), eu('quero falar com um atendente'), amanda('Claro, vou te passar para alguém da nossa equipe.'), sistema('Transferido pela API para o setor Principal'), eu('??')], 'HUM');
confere('A4 pediu atendente e voltou a escrever: a Amanda não retoma', c.length === 0, `chamadas=${c.length}`);

// A5) conversa da fila da equipe que NÃO é da Amanda, ou com atendente: não mexe
n = 0;
c = await roda([eu('oi, preciso de informação'), sistema('Transferido para o setor Principal por MARIA'), eu('alguém aí?')], 'HUM');
confere('A5 fila da equipe sem nenhuma fala da Amanda: não mexe', c.length === 0, `chamadas=${c.length}`);
n = 0;
c = await roda([...ate_o_pagamento(), eu('pix')], 'HUM', true);
confere('A5 com atendente humano atribuído: não mexe', c.length === 0, `chamadas=${c.length}`);

// A6) o aviso de "Transferido para o setor Agente IA" por uma PESSOA reinicia a jornada (falhas antigas não contam)
n = 0;
c = await roda([eu('boa tarde, quero uma consulta'), amanda('Não consegui identificar o serviço.'), eu('ola, quero marcar uma consulta'), sistema('Transferido para o setor Agente IA por ARMANDO'), eu('Olá')]);
confere('A6 depois de uma transferência feita por pessoa, "Olá" só cumprimenta', textos(c).length === 1 && transfs(c).length === 0 && /Me conta o que você precisa|Qual consulta/.test(textos(c)[0]), textos(c)[0]);

// A7) uma mensagem de SISTEMA depois da mensagem do paciente não impede a resposta
n = 0;
c = await roda([eu('oi'), amanda('Boa tarde! Sou a Amanda, da Clinex.'), eu('quero agendar cardiologia')]);
const m7 = [...historico]; m7.push(sistema('Transferido pela API para o setor Agente IA'));
historico = m7; chamadas = [];
await handleIncoming(evento(m7[m7.length - 2], 'AI'));
confere('A7 mensagem de sistema chegando depois não faz a Amanda desistir de responder', textos(chamadas).length === 1, `respostas=${textos(chamadas).length}`);

// A8) áudio: a Amanda pede a transcrição (sob demanda) e usa o texto
n = 0;
transcricao = { text: 'Oi, eu queria marcar uma consulta de cardiologia, por favor.', status: 'done' };
const audio = { id: 'aud1', direction: 'in', type: 'audio', text: null, timestamp: ts(), status: 'delivered' };
c = await roda([audio]);
confere('A8 áudio sem transcrição: pede a transcrição e responde ao que foi dito', c.some((x) => /\/message\/aud1\/transcribe$/.test(x.caminho)) && /Cardiolog/i.test(textos(c)[0] ?? ''), textos(c)[0]);
transcricao = { text: null, status: 'failed' };
c = await roda([{ ...audio, id: 'aud2' }]);
confere('A8 áudio que não pôde ser transcrito: pede para escrever e não transfere', /Não consegui ouvir esse áudio/.test(textos(c)[0] ?? '') && transfs(c).length === 0, textos(c)[0]);

// L) a conversa é lida dos DOIS lados antes de responder
{
  const { lerConversa } = await import('../src/agents/receptivo/agent.js');
  const h = (direction: 'in' | 'out', text: string, extra: any = {}) => ({ id: `x${Math.random()}`, _id: `x${Math.random()}`, direction, type: 'text', text, status: 'delivered', createdAt: new Date(Date.now() - (extra.minutosAtras ?? 1) * 60000).toISOString(), ...extra }) as any;
  const hist = [
    h('in', 'quero agendar cardiologia'), h('out', '*Amanda (IA) - Nova*\nAh, então é consulta Cardiologia, né?'), h('in', 'sim'),
    h('out', 'nota interna do time', { isWhisper: true }), h('in', 'x', { type: 'system', text: 'Transferido para o setor' }),
    h('out', '*Amanda (IA) - Nova*\nAgendamento confirmado! Deu tudo certo, Renato. Ficou consulta Cardiologia no Guamá na quinta, dia 22 de outubro, de manhã com a Dra. Fernanda. É por ordem de chegada a partir das 8h então vale chegar cedinho. Estamos te esperando com carinho!', { minutosAtras: 5 }),
  ];
  const { conversa, confirmacao } = lerConversa(hist);
  confere('L1 lê os dois lados, sem o título da Amanda, sem nota interna e sem evento do sistema', conversa.length === 4 && conversa[1].de === 'amanda' && conversa[1].texto === 'Ah, então é consulta Cardiologia, né?' && !conversa.some((m) => /nota interna|Transferido/.test(m.texto)), JSON.stringify(conversa.map((m) => `${m.de}: ${m.texto.slice(0, 30)}`)));
  confere('L2 pega o trecho "Ficou ..." da última confirmação (até 24 h)', confirmacao?.startsWith('Ficou consulta Cardiologia no Guamá') === true && /Estamos te esperando com carinho!$/.test(confirmacao ?? ''), confirmacao?.slice(0, 60));
  const velha = [h('out', 'Agendamento confirmado! Deu tudo certo. Ficou consulta X.', { minutosAtras: 60 * 30 })];
  confere('L3 confirmação de mais de 24 h não vale', lerConversa(velha).confirmacao === undefined);
  const longa = Array.from({ length: 30 }, (_, i) => h(i % 2 ? 'out' : 'in', `mensagem ${i}`));
  confere('L4 guarda só as últimas 12 mensagens', lerConversa(longa).conversa.length === 12 && lerConversa(longa).conversa[11].texto === 'mensagem 29');
  confere('L5 imagem do paciente vira "[imagem]" (sem o código interno)', lerConversa([h('in', '', { type: 'image', text: null, media: {} })]).conversa[0]?.texto === '[imagem]');
}

// D) o aviso "Vi que esse paciente já tem..." marca o turno: a conversa continua dali (não recomeça)
n = 0;
const hD = [eu('oi'), amanda('Oi!'), eu('sim'), amanda('Vi que esse paciente já tem consulta X marcado pra quinta.\nO que você prefere: manter?'), eu('ja ta agendado então?')];
// o histórico chega ao agente já convertido (texto como string, createdAt): faz a mesma conversão do getHistory
const conv = (h: any[]) => h.map((m) => ({ ...m, _id: m.id, text: typeof m.text === 'object' && m.text ? (m.text.text ?? m.text.body ?? null) : (m.text ?? null), createdAt: m.timestamp })) as any;
const td = montarTurnos(conv(hD), -1, 0);
confere('D1 o turno cuja resposta foi o aviso de duplicidade é reconhecido no histórico', JSON.stringify(td.duplicados) === '[1]' && td.turnos.length === 3, JSON.stringify(td));
const hD2 = [eu('oi'), amanda('Oi!'), eu('quero agendar')];
confere('D2 sem o aviso, nenhum turno é marcado', montarTurnos(conv(hD2), -1, 0).duplicados.length === 0);
const hD3 = [eu('oi'), amanda('Vi que esse paciente já tem consulta X marcado pra quinta.'), eu('ok')];
confere('D3 aviso de uma jornada que já terminou (antes do fim) não conta', montarTurnos(conv(hD3), 1, 0).duplicados.length === 0);

server.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTODOS OS CENÁRIOS DO AGENTE PASSARAM');
process.exit(falhas ? 1 : 0);
