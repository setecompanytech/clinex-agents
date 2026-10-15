import { createInterface } from 'node:readline';
import { responder } from './agents/receptivo/script/engine.js';
import { fonteSimulada } from './agents/receptivo/script/catalog.js';
import { fonteClinilink } from './agents/receptivo/script/clinilinkFonte.js';
import { amigavel } from './lib/humanizer.js';
import { env } from './lib/env.js';

// Simulador local: npm run simular   (digite como o paciente; "sair" encerra, "novo" recomeça)
// Usa Clinilink real se CLINILINK_API_KEY existir (somente leitura); GPT se OPENAI_API_KEY existir.
const fonte = env.clinilinkKey ? fonteClinilink : fonteSimulada;
const ctx = () => ({ now: new Date(), nome: process.env.SIM_NOME ?? '', tz: env.timezone, telefone: process.env.SIM_TEL ?? '5591981628017' });
let textos: string[] = [];
let fila: Promise<void> = Promise.resolve();

const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: 'Paciente> ' });
console.log(`Simulador da Amanda. Fonte: ${fonte.tipo}${env.openaiKey ? ' + GPT' : ''}. Digite como o paciente.\n`);
rl.prompt();
rl.on('line', (linha) => {
  fila = fila.then(async () => {
    const l = linha.trim();
    if (l === 'sair') return rl.close();
    if (l === 'novo') { textos = []; console.log('(conversa reiniciada)\n'); return rl.prompt(); }
    if (l) {
      textos.push(l);
      try {
        const r = await responder(textos, ctx(), fonte);
        const texto = r && !r.handoff?.urgente ? await amigavel(r.reply, { tag: '[sim]' }) : r?.reply;
        console.log(`\n${env.agentTitle.split('*').join('')}\n${texto}\n${r?.handoff ? `[transfere para a equipe: ${r.handoff.motivo}]\n` : ''}`);
      } catch (e) { console.log('ERRO:', (e as Error).message); }
    }
    rl.prompt();
  });
});
