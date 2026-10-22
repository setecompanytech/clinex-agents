/**
 * Teste do AGENTE inteiro contra uma Inovstar SIMULADA (histórico, envio, transferência, transcrição).
 * Cobre: mensagem de transferência enviada como texto normal, retomada de conversa na fila da equipe,
 * leitura do texto das mensagens ENVIADAS ({ body }), áudio sob demanda. Rodar: npx tsx scripts/teste-agente.ts
 */
import http from 'node:http';

type Chamada = { metodo: string; caminho: string; corpo: any };
let historico: any[] = [];
let historicoDepois: any[] | null = null;
let leituras = 0;
let chamadas: Chamada[] = [];
let transcricao: { text: string | null; status: string } = { text: null, status: 'failed' };

const server = http.createServer((req, res) => {
  let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => {
    const url = new URL(req.url!, 'http://x');
    const corpo = raw ? JSON.parse(raw) : undefined;
    const j = (body: unknown) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    // historicoDepois: a partir da 2ª leitura (a conferência feita antes de enviar) o paciente já escreveu de novo
    if (req.method === 'GET' && /\/history$/.test(url.pathname)) { leituras++; return j({ data: { messages: historicoDepois && leituras > 1 ? historicoDepois : historico } }); }
    chamadas.push({ metodo: req.method!, caminho: url.pathname, corpo });
    if (/\/transcribe$/.test(url.pathname)) return j({ success: true, data: { transcription: transcricao } });
    return j({ success: true });
  });
});
await new Promise<void>((ok) => server.listen(0, ok));
Object.assign(process.env, {
  INOVSTAR_BASE_URL: `http://127.0.0.1:${(server.address() as any).port}`, INOVSTAR_TOKEN: 'teste', ALLOWED_NUMBERS: '+5591900000000',
  AGENT_SECTOR_ID: 'AI', HUMAN_SECTOR_ID: 'HUM', DEBOUNCE_MS: '0', REPLY_DELAY_MIN_MS: '0', REPLY_DELAY_MAX_MS: '0',
  AGENT_TITLE: '*Amanda S. (Clinex):*', AUTO_REPLY: 'true', AGENT_MODE: 'scripted',
});
for (const k of ['OPENAI_API_KEY', 'CLINILINK_API_KEY', 'CLINILINK_API_KEY_ESCRITA', 'ANTHROPIC_API_KEY']) delete process.env[k]; // fonte simulada, sem GPT
const { handleIncoming, montarTurnos } = await import('../src/agents/receptivo/agent.js');

// ---------- montagem do histórico no formato REAL da Inovstar ----------
let n = 0;
const ts = () => new Date(Date.now() - (1000 - n++) * 1000).toISOString();
const msg = (direction: 'in' | 'out', type: string, text: any) => ({ id: `m${n}`, direction, type, text, timestamp: ts(), status: direction === 'out' ? 'delivered' : 'delivered' });
const eu = (t: string) => msg('in', 'text', { text: t });
const amanda = (t: string) => msg('out', 'text', { body: `*Amanda S. (Clinex):*\n${t}` }); // mensagem ENVIADA: { body }
const sistema = (t: string) => msg('in', 'system', { text: t });
const evento = (m: any, sectorId = 'AI', isAssigned = false) => ({
  deliveryId: 'd', messageId: m.id, attendanceId: 'att1', channelId: 'c', to: '+5591900000000', type: m.type, text: null,
  sectorId, isAssigned, isGroup: false, attendanceInfo: '{}', contactName: 'Teste',
});
async function roda(msgs: any[], sectorId = 'AI', isAssigned = false) {
  historico = msgs; chamadas = []; leituras = 0;
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
  eu('1'), amanda('Show, então fica consulta ... Pra gerar o agendamento, me manda por favor os dados do paciente: ...'),
  eu('52998224725'), amanda('Achei aqui o cadastro de Maria da Silva Exemplo. É esse mesmo o paciente?'),
  eu('sim'), amanda('Como você prefere pagar? Dá pra antecipar o pagamento por pix, pagar na recepção ou por link de crédito.'),
];

// A1) transferência: a mensagem ao paciente vai como TEXTO NORMAL, antes da transferência, e a transferência não leva `message`
n = 0;
let c = await roda([eu('oi'), amanda('Boa tarde! Sou a Amanda, da Clinex.'), eu('quero falar com um atendente')]);
confere('A1 pediu atendente: envia o aviso como texto normal ANTES de transferir', c.length === 2 && c[0].caminho.endsWith('/send/text') && /equipe/.test(c[0].corpo.text) && c[1].caminho.endsWith('/transfer'), c.map((x) => x.caminho.split('/').slice(-2).join('/')).join(' -> '));
confere('A1 a transferência vai para o setor da equipe, com o motivo e SEM mensagem anexada', transfs(c)[0]?.corpo.toSectorId === 'HUM' && /atendimento humano/.test(transfs(c)[0]?.corpo.reason) && !('message' in transfs(c)[0].corpo), JSON.stringify(transfs(c)[0]?.corpo).slice(0, 120));

// A1b) o paciente escreve de novo ENQUANTO a resposta é preparada/"digitada": a resposta (já desatualizada) não sai; a mensagem nova responde
n = 0;
{
  const antes = [eu('oi'), amanda('Boa tarde! Sou a Amanda, da Clinex.'), eu('quero agendar')];
  historicoDepois = [...antes, eu('cardiologia')];
  c = await roda(antes);
  confere('A1b chegou mensagem nova antes de enviar: a resposta antiga NÃO é enviada', c.length === 0, `chamadas=${c.map((x) => x.caminho.split('/').slice(-2).join('/')).join(' -> ')}`);
  const antesH = [eu('oi'), amanda('Boa tarde! Sou a Amanda, da Clinex.'), eu('quero falar com um atendente')];
  historicoDepois = [...antesH, eu('espera')];
  c = await roda(antesH);
  confere('A1b e a transferência para a equipe também espera (a conversa é reprocessada pela mensagem nova)', c.length === 0, `chamadas=${c.length}`);
  historicoDepois = null; // sem mensagem nova: responde normalmente
  c = await roda(antesH);
  confere('A1b sem mensagem nova: responde e transfere como antes', c.length === 2 && c[0].caminho.endsWith('/send/text') && c[1].caminho.endsWith('/transfer'), `chamadas=${c.length}`);
}

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
const foto = { id: 'img-a3', direction: 'in', type: 'image', text: null, timestamp: ts(), status: 'delivered' }; // comprovante (sem leitura automática no teste: vai para a equipe conferir)
c = await roda([...base, eu('pix'), amanda('Show! A chave pix é essa.'), foto, amanda('Recebi o seu comprovante. Vou pedir pra equipe conferir. Já deixei tudo anotado. Só um instante.'), sistema('Transferido pela API para o setor Principal'), eu('já paguei o pix')], 'HUM');
confere('A3 paciente volta na fila da equipe: a conversa é devolvida para a Amanda ANTES de responder', transfs(c)[0]?.corpo.toSectorId === 'AI' && !('message' in transfs(c)[0].corpo) && c.findIndex((x) => x.caminho.endsWith('/transfer')) < c.findIndex((x) => x.caminho.endsWith('/send/text')), c.map((x) => x.caminho.split('/').slice(-1)[0]).join(' -> '));
confere('A3 e continua de onde parou: pede o comprovante do pix (já tinha recebido a chave)', /comprovante/.test(textos(c).join('\n')) && !/Chave pix:/.test(textos(c).join('\n')), textos(c).join(' | ').replace(/\n/g, ' ').slice(0, 160));
confere('A3 a mensagem enviada abre com o título "*Amanda S. (Clinex):*" na primeira linha', textos(c).length > 0 && textos(c).every((t) => t.startsWith('*Amanda S. (Clinex):*\n') || !t.includes('*Amanda')) && textos(c)[0].startsWith('*Amanda S. (Clinex):*\n'), textos(c)[0]?.slice(0, 40));
// A3a) mensagens antigas da Amanda, com o título de antes ("Amanda (IA) - Nova"), continuam sendo dela
n = 0;
c = await roda([...ate_o_pagamento().map((m: any) => (m.direction === 'out' ? msg('out', 'text', { body: String(m.text?.body ?? '').replace('*Amanda S. (Clinex):*', '*Amanda (IA) - Nova*') }) : m)), eu('pix'), msg('out', 'text', { body: '*Amanda (IA) - Nova*\nShow! A chave pix é essa.' }), foto, msg('out', 'text', { body: '*Amanda (IA) - Nova*\nRecebi o seu comprovante. Vou pedir pra equipe conferir.' }), sistema('Transferido pela API para o setor Principal'), eu('já paguei o pix')], 'HUM');
confere('A3a título antigo na conversa: a Amanda ainda reconhece como dela e retoma na fila da equipe', transfs(c)[0]?.corpo.toSectorId === 'AI', c.map((x) => x.caminho.split('/').slice(-1)[0]).join(' -> '));
// A3b) link de crédito: a equipe assume e a Amanda NÃO retoma sozinha
c = await roda([...base, eu('link de crédito'), amanda('Combinado! Vou passar pra equipe te enviar o link de pagamento...'), sistema('Transferido pela API para o setor Principal'), eu('na verdade vou pagar no pix')], 'HUM');
confere('A3b link de crédito: depois da transferência para o time, se o paciente escreve a Amanda fica quieta (o time responde)', c.length === 0, `chamadas=${c.length}`);

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
    h('in', 'quero agendar cardiologia'), h('out', '*Amanda S. (Clinex):*\nAh, então é consulta Cardiologia, né?'), h('in', 'sim'),
    h('out', 'nota interna do time', { isWhisper: true }), h('in', 'x', { type: 'system', text: 'Transferido para o setor' }),
    h('out', '*Amanda S. (Clinex):*\nAgendamento confirmado! Deu tudo certo, Renato.', { minutosAtras: 5 }),
    h('out', 'Paciente: Renato Teste\nProfissional: Dra. Fernanda\nProcedimento: CONSULTA CARDIOLOGIA - Dra. Fernanda\n📆 Data: 22/10/2026 a partir de 08:00 *POR ORDEM DE CHEGADA*\n🏥 Clínica: CLINEX GUAMÁ', { minutosAtras: 5 }),
    h('out', 'Se puder, chega cedinho, que o atendimento é por ordem de chegada. Quer aproveitar e agendar mais algum exame ou consulta?', { minutosAtras: 5 }),
  ];
  const { conversa, confirmacao } = lerConversa(hist);
  confere('L1 lê os dois lados, sem o título da Amanda, sem nota interna e sem evento do sistema', conversa.length === 6 && conversa[1].de === 'amanda' && conversa[1].texto === 'Ah, então é consulta Cardiologia, né?' && !conversa.some((m) => /nota interna|Transferido/.test(m.texto)), JSON.stringify(conversa.map((m) => `${m.de}: ${m.texto.slice(0, 30)}`)));
  confere('L2 pega o balão com o modelo da clínica (Paciente...Procedimento...), sem o título, da última confirmação (até 24 h)', confirmacao?.startsWith('Paciente: Renato Teste') === true && /CLINEX GUAMÁ$/.test(confirmacao ?? '') && !/Agendamento confirmado/.test(confirmacao ?? ''), confirmacao?.slice(0, 60));
  const velha = [h('out', 'Paciente: X\nProfissional: Y\nProcedimento: Z', { minutosAtras: 60 * 30 })];
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

// S) estado guardado (Redis): a conversa continua de onde parou, mesmo que a releitura das mensagens antigas desse outro resultado
{
  const { env: envAg } = await import('../src/lib/env.js');
  const { lerEstado } = await import('../src/lib/estado.js');
  const loja = new Map<string, string>();
  let redisFora = false;
  const comandos: string[][] = [];
  const redis = http.createServer((req, res) => {
    let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => {
      const cmd = JSON.parse(raw) as string[]; comandos.push(cmd);
      if (redisFora) { res.writeHead(500, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: 'fora do ar' })); }
      let result: unknown = null;
      if (cmd[0] === 'GET') result = loja.get(cmd[1]) ?? null;
      else if (cmd[0] === 'SET') { loja.set(cmd[1], cmd[2]); result = 'OK'; }
      else if (cmd[0] === 'DEL') { result = loja.delete(cmd[1]) ? 1 : 0; }
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ result }));
    });
  });
  await new Promise<void>((ok) => redis.listen(0, ok));
  const redisUrl = `http://127.0.0.1:${(redis.address() as any).port}`;
  envAg.redisUrl = redisUrl; envAg.redisToken = 'tok';
  const chave = 'amanda:estado:att1';

  // S1) a primeira resposta guarda o estado (jornada = 1ª mensagem do paciente; ate = última respondida)
  n = 0; loja.clear();
  const m1 = eu('oi'); const m2 = eu('quero agendar cardiologia');
  c = await roda([m1, m2]);
  const g1 = await lerEstado('att1');
  confere('S1 respondeu e guardou o estado (1ª mensagem da jornada, última respondida, serviço entendido)', textos(c).length > 0 && g1?.jornada === m1.id && g1?.ate === m2.id && /Cardiologia/i.test((g1?.state as any)?.servico?.frase ?? '') && g1?.duro === false, JSON.stringify({ j: g1?.jornada, ate: g1?.ate, sv: (g1?.state as any)?.servico?.frase }));
  const ttl = comandos.find((x) => x[0] === 'SET');
  confere('S1 o estado tem prazo (24 h) para não ficar guardado', ttl?.[3] === 'EX' && Number(ttl?.[4]) === 86400, JSON.stringify(ttl?.slice(3)));

  // S2) a releitura das mensagens antigas daria OUTRO serviço (o código/dado mudou no meio), mas o estado guardado manda
  const m2mudada = { ...m2, text: { text: 'quero agendar ginecologista' } };
  c = await roda([m1, m2mudada, amanda('Entendi, você quer consulta de Cardiologia, é isso?'), eu('sim')]);
  const g2 = await lerEstado('att1');
  confere('S2 continua do estado guardado (Cardiologia), sem reinterpretar a mensagem antiga (agora lida como ginecologia)', textos(c).length > 0 && /Cardiologia/i.test((g2?.state as any)?.servico?.frase ?? '') && !/Ginecolog/i.test((g2?.state as any)?.servico?.frase ?? '') && (g2?.state as any)?.servicoConfirmado === true, JSON.stringify({ sv: (g2?.state as any)?.servico?.frase, conf: (g2?.state as any)?.servicoConfirmado }));
  confere('S2 o estado avançou para a mensagem respondida agora', g2?.ate !== g1?.ate && g2?.jornada === m1.id, `${g1?.ate} -> ${g2?.ate}`);

  // S3) sem o estado guardado (ou outra jornada), reprocessa tudo como antes
  loja.clear();
  c = await roda([m1, m2mudada, amanda('Entendi, você quer consulta de Cardiologia, é isso?'), eu('sim')]);
  const g3 = await lerEstado('att1');
  confere('S3 sem estado guardado: reprocessa a jornada (aqui a mensagem mudada vale: ginecologia) e guarda o novo estado', /Ginecolog/i.test((g3?.state as any)?.servico?.frase ?? ''), (g3?.state as any)?.servico?.frase);
  n = 0;
  const outra1 = eu('bom dia'); const outra2 = eu('quero agendar dermatologia');
  c = await roda([outra1, outra2]);
  const g4 = await lerEstado('att1');
  confere('S3 outra jornada (primeira mensagem diferente): o estado antigo não vale', g4?.jornada === outra1.id && /Dermato/i.test((g4?.state as any)?.servico?.frase ?? ''), JSON.stringify({ j: g4?.jornada, sv: (g4?.state as any)?.servico?.frase }));

  // S4) o Redis fora do ar não derruba nada: responde reprocessando
  redisFora = true; n = 0;
  c = await roda([eu('oi'), eu('quero agendar cardiologia')]);
  confere('S4 Redis fora do ar: ela responde do mesmo jeito (reprocessando a conversa)', textos(c).length > 0 && /Cardiologia/i.test(textos(c).join(' ')), `${textos(c).length} mensagens`);
  redisFora = false;

  // S5) transferência dura (pediu humano): o estado guardado lembra, e na fila da equipe ela NÃO retoma
  n = 0; loja.clear();
  const h1 = eu('oi'); const h2 = amanda('Boa tarde! Sou a Amanda, da Clinex.'); const h3 = eu('quero falar com um atendente');
  c = await roda([h1, h2, h3]);
  const g5 = await lerEstado('att1');
  confere('S5 pediu atendente: transferiu e o estado guardado marca a transferência dura', transfs(c).length === 1 && g5?.duro === true, `duro=${g5?.duro}`);
  c = await roda([h1, h2, h3, amanda('Claro, vou te passar para alguém da nossa equipe.'), sistema('Transferido pela API para o setor Principal'), eu('??')], 'HUM');
  confere('S5 depois, na fila da equipe, a Amanda não retoma (com estado guardado)', c.length === 0, `chamadas=${c.length}`);

  // S6) chegou mensagem nova enquanto respondia: a resposta não sai e o estado NÃO avança
  n = 0; loja.clear();
  const k1 = eu('oi'); const k2 = eu('quero agendar cardiologia');
  historicoDepois = [k1, k2, eu('na verdade é dermatologia')];
  c = await roda([k1, k2]);
  historicoDepois = null;
  confere('S6 resposta cancelada por mensagem nova: nada enviado e nada guardado', c.length === 0 && (await lerEstado('att1')) === null, `chamadas=${c.length}`);

  // S7) uma conversa inteira, passo a passo (com as respostas reais dela no histórico): com o estado guardado e reprocessando, as respostas são as mesmas
  const falas = ['oi', 'quero agendar cardiologia', 'sim', 'guama', '1', 'na recepção', '52998224725', 'sim'];
  const porModo: Record<string, string[]> = { redis: [], replay: [] };
  for (const modo of ['redis', 'replay']) {
    n = 0; loja.clear(); comandos.length = 0;
    envAg.redisUrl = modo === 'redis' ? redisUrl : '';
    const hist: any[] = [];
    for (const f of falas) {
      hist.push(eu(f));
      const cc = await roda([...hist]);
      const ditos = textos(cc);
      porModo[modo].push(ditos.join(' || '));
      for (const tx of ditos) hist.push(amanda(tx.replace(/^\*[^*\n]+\*\n/, '')));
    }
    if (modo === 'redis') confere('S7 o estado foi guardado a cada resposta enviada (e apagado no fim, quando concluiu)', comandos.filter((x) => x[0] === 'SET').length >= 5, `SET=${comandos.filter((x) => x[0] === 'SET').length} DEL=${comandos.filter((x) => x[0] === 'DEL').length}`);
  }
  const iguais = porModo.redis.map((x, i) => x === porModo.replay[i]);
  confere('S7 conversa completa: cada resposta com estado guardado é IGUAL à do reprocessamento', iguais.every(Boolean) && porModo.redis.every((x) => x.length > 0), iguais.map((x, i) => (x ? '' : `passo ${i + 1} difere: [${porModo.redis[i].slice(0, 90)}] x [${porModo.replay[i].slice(0, 90)}]`)).filter(Boolean).join(' ; ') || `${porModo.redis.length} passos iguais`);

  envAg.redisUrl = ''; envAg.redisToken = '';
  redis.close();
}


server.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTODOS OS CENÁRIOS DO AGENTE PASSARAM');
process.exit(falhas ? 1 : 0);
