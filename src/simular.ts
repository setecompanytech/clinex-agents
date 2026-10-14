import { createInterface } from 'node:readline';
import { responder } from './agents/receptivo/script/engine.js';

// Simulador local: npm run simular   (digite como o paciente; "sair" encerra, "novo" recomeça)
const ctx = () => ({ now: new Date(), nome: process.env.SIM_NOME ?? '', tz: process.env.CLINIC_TZ ?? 'America/Sao_Paulo' });
let textos: string[] = [];
const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: 'Paciente> ' });
console.log('Simulador da Amanda (roteiro, sem IA). Digite como o paciente.\n');
rl.prompt();
rl.on('line', (linha) => {
  const l = linha.trim();
  if (l === 'sair') return rl.close();
  if (l === 'novo') { textos = []; console.log('(conversa reiniciada)\n'); return rl.prompt(); }
  if (l) {
    textos.push(l);
    const r = responder(textos, ctx());
    console.log(`\nAMANDA IA - Teste\n${r?.reply}\n${r?.handoff ? `[transfere para a equipe: ${r.handoff.motivo}]\n` : ''}`);
  }
  rl.prompt();
});
