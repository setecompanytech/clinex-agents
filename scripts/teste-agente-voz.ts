/**
 * Voz do Agente Clinex (transcrição e fala) e o chamado REAL do SDK da Anthropic, contra servidores FALSOS locais.
 * Nada aqui chama a OpenAI nem a Anthropic de verdade. Rodar: npx tsx scripts/teste-agente-voz.ts
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

const vistos: { url: string; headers: Record<string, string | string[] | undefined>; corpo: Buffer }[] = [];
let respostasAnthropic: any[] = [];
const servidor = createServer((req, res) => {
  const partes: Buffer[] = []; req.on('data', (d) => partes.push(d)).on('end', () => {
    const corpo = Buffer.concat(partes); vistos.push({ url: req.url!, headers: req.headers, corpo });
    if (req.url === '/oai/audio/transcriptions') return void res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ text: ' abrir os leads atrasados ' }));
    if (req.url === '/oai/audio/speech') return void res.writeHead(200, { 'content-type': 'audio/mpeg' }).end(Buffer.from('ID3-audio-falso'));
    if (req.url === '/oai-erro/audio/speech') return void res.writeHead(401, { 'content-type': 'application/json' }).end('{}');
    if (req.url?.startsWith('/v1/messages')) {
      const r = respostasAnthropic.shift();
      return void res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 }, ...r }));
    }
    res.writeHead(404).end('{}');
  });
});
await new Promise<void>((r) => servidor.listen(0, r));
const porta = (servidor.address() as { port: number }).port;
process.env.OPENAI_API_KEY = 'chave-openai-falsa'; process.env.OPENAI_BASE_URL = `http://127.0.0.1:${porta}/oai`;
process.env.ANTHROPIC_API_KEY = 'chave-anthropic-falsa'; process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${porta}`;

const { transcrever, falar, vozDisponivel } = await import('../src/crm/agente-voz.js');
const { conversar, _definirCliente } = await import('../src/crm/agente-chat.js');
const { criarLead, somaDias } = await import('../src/crm/motor.js');
const { regrasPadrao } = await import('../src/crm/automacoes.js');
const { funisPadrao } = await import('../src/crm/pipeline/regras.js');
const { env } = await import('../src/lib/env.js');

let ok = 0;
async function teste(nome: string, fn: () => void | Promise<void>) {
  try { await fn(); ok++; console.log('  ok  ' + nome); }
  catch (e) { process.exitCode = 1; console.log('FALHOU  ' + nome + '\n        ' + (e as Error).message.split('\n').join('\n        ')); }
}

await teste('voz disponível quando há chave da OpenAI', () => assert.deepEqual(vozDisponivel(), { transcrever: true, falar: true }));
await teste('transcrever: envia o áudio como arquivo, modelo, português e dica de vocabulário; devolve o texto limpo', async () => {
  vistos.length = 0;
  const texto = await transcrever(Buffer.alloc(4000, 1), 'audio/webm;codecs=opus');
  assert.equal(texto, 'abrir os leads atrasados');
  const v = vistos[0]; assert.equal(v.url, '/oai/audio/transcriptions'); assert.equal(v.headers.authorization, 'Bearer chave-openai-falsa'); assert.match(String(v.headers['content-type']), /^multipart\/form-data/);
  const corpo = v.corpo.toString('latin1');
  assert.match(corpo, /name="file"; filename="fala\.webm"/); assert.match(corpo, /name="model"\r\n\r\ngpt-4o-mini-transcribe/); assert.match(corpo, /name="language"\r\n\r\npt/); assert.match(corpo, /name="prompt"[\s\S]*no-show/);
});
await teste('transcrever: áudio vazio ou curto demais é recusado antes de gastar a API; mp4/ogg ganham a extensão certa', async () => {
  vistos.length = 0;
  await assert.rejects(() => transcrever(Buffer.alloc(10), 'audio/webm'), /Não ouvi nada/); assert.equal(vistos.length, 0);
  await transcrever(Buffer.alloc(2000), 'audio/mp4'); assert.match(vistos[0].corpo.toString('latin1'), /filename="fala\.mp4"/);
  await transcrever(Buffer.alloc(2000), 'audio/ogg;codecs=opus'); assert.match(vistos[1].corpo.toString('latin1'), /filename="fala\.ogg"/);
});
await teste('falar: tira o markdown, manda modelo/voz/instruções e devolve o MP3', async () => {
  vistos.length = 0;
  const mp3 = await falar('**Atenção:** você tem 3 leads\n\n# atrasados | hoje');
  assert.equal(mp3.toString(), 'ID3-audio-falso');
  const j = JSON.parse(vistos[0].corpo.toString()); assert.equal(j.model, 'gpt-4o-mini-tts'); assert.equal(j.voice, 'nova'); assert.equal(j.response_format, 'mp3'); assert.match(j.instructions, /português do Brasil/);
  assert.equal(j.input, 'Atenção: você tem 3 leads atrasados hoje'); assert.doesNotMatch(j.input, /[*#|]/);
  assert.ok(JSON.parse((vistos.at(-1)!.corpo.toString())).input.length <= 1200);
  await assert.rejects(() => falar('  **  '), /Nada para falar/);
  await falar('x'.repeat(5000)); assert.equal(JSON.parse(vistos.at(-1)!.corpo.toString()).input.length, 1200);
});
await teste('falar: erro da OpenAI vira mensagem clara (sem vazar nada) e sem chave a voz fica indisponível', async () => {
  const antes = env.openaiBase; (env as any).openaiBase = `http://127.0.0.1:${porta}/oai-erro`;
  await assert.rejects(() => falar('oi'), (e: any) => e.codigo === 'voz' && e.status === 502 && /Não consegui gerar a voz/.test(e.message) && !/chave/i.test(e.message));
  (env as any).openaiBase = antes;
  const k = env.openaiKey; (env as any).openaiKey = ''; assert.deepEqual(vozDisponivel(), { transcrever: false, falar: false });
  await assert.rejects(() => falar('oi'), (e: any) => e.status === 503); await assert.rejects(() => transcrever(Buffer.alloc(2000), 'audio/webm'), (e: any) => e.status === 503); (env as any).openaiKey = k;
});

await teste('SDK real da Anthropic: o pedido sai com chave, modelo, esforço, ferramentas e histórico certos; o laço de ferramentas fecha', async () => {
  _definirCliente(null); vistos.length = 0;
  const AGORA = new Date('2026-11-09T12:00:00Z'), HOJE = '2026-11-09';
  const estado: any = { versao: 1, atendentes: [], leads: [], usuarios: [], automacoes: regrasPadrao(AGORA), logAuto: [], pipelines: { funis: funisPadrao(AGORA), atribuicoes: [], extras: {}, followups: [], contatos: [], rotina: {} } };
  estado.leads.push(criarLead({ nome: 'MARIA SILVA', telefone: '91988887777', valor: 900, unidade: 'CLINEX GUAMÁ', exame: 'Ultrassom', atendente: 'Carla', d0: somaDias(HOJE, -1) } as never, AGORA));
  respostasAnthropic = [
    { content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'tool_use', id: 'tu_1', name: 'buscar_leads', input: { texto: 'maria' } }], stop_reason: 'tool_use' },
    { content: [{ type: 'text', text: 'Achei a Maria, R$ 900.' }], stop_reason: 'end_turn' },
  ];
  const r = await conversar({ estado, agora: AGORA, sessao: { id: 'u', nome: 'Rubens', email: 'r@x', perfil: 'gestor', modulos: ['crm'] }, salvar: () => {} }, 'cadê a Maria?', [{ papel: 'user', texto: 'oi' }, { papel: 'agent', texto: 'olá' }]);
  assert.equal(r.texto, 'Achei a Maria, R$ 900.'); assert.equal(r.itens[0]?.titulo, 'MARIA SILVA');
  const chamadas = vistos.filter((v) => v.url.startsWith('/v1/messages')); assert.equal(chamadas.length, 2);
  assert.equal(chamadas[0].headers.authorization, 'Bearer chave-anthropic-falsa');
  const p1 = JSON.parse(chamadas[0].corpo.toString());
  assert.equal(p1.model, 'claude-opus-5-5'); assert.deepEqual(p1.output_config, { effort: 'low' }); assert.ok(p1.max_tokens >= 2048); assert.ok(p1.tools.length >= 10);
  assert.ok(p1.tools.every((t: any) => t.name && t.description && t.input_schema?.type === 'object')); assert.equal(p1.thinking, undefined, 'o pensamento é do próprio modelo: não mandar thinking');
  assert.deepEqual(p1.messages.map((m: any) => m.role), ['user', 'assistant', 'user']);
  const p2 = JSON.parse(chamadas[1].corpo.toString()), ult = p2.messages.at(-1), pen = p2.messages.at(-2);
  assert.equal(ult.role, 'user'); assert.equal(ult.content[0].type, 'tool_result'); assert.equal(ult.content[0].tool_use_id, 'tu_1'); assert.match(ult.content[0].content, /MARIA SILVA/);
  assert.equal(pen.role, 'assistant'); assert.deepEqual(pen.content.map((b: any) => b.type), ['thinking', 'tool_use'], 'o bloco de pensamento volta intacto na mesma volta da conversa');
});

console.log(`\n${ok} testes passaram${process.exitCode ? ', COM FALHAS' : ''}.`);
servidor.close(); process.exit(process.exitCode ?? 0);
