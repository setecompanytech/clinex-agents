import { env } from './env.js';

/** Hora atual no fuso da clínica (padrão America/Sao_Paulo; Belém tem o mesmo horário). */
export function nowParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('pt-BR', {
    timeZone: env.timezone, hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'long', day: '2-digit', month: 'long',
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  const hour = Number(p.hour) % 24;
  return { hour, minute: p.minute, weekday: p.weekday, day: p.day, month: p.month };
}

/** Bom dia: 05h–11h59 · Boa tarde: 12h–17h59 · Boa noite: 18h–04h59. */
export function greeting(date = new Date()): 'Bom dia' | 'Boa tarde' | 'Boa noite' {
  const { hour } = nowParts(date);
  if (hour >= 5 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** "Giovanny Valente" -> "Giovanny"; ignora nomes que são só número/telefone. */
export function firstName(full?: string): string {
  const w = (full ?? '').trim().split(/\s+/)[0] ?? '';
  if (!w || /\d/.test(w) || w.length < 2) return '';
  return w.charAt(0).toLocaleUpperCase('pt-BR') + w.slice(1).toLocaleLowerCase('pt-BR');
}

/** Escolha estável (mesma mensagem => mesma variação) para não parecer robô repetindo a mesma frase. */
const pick = <T>(arr: T[], seed: string) => arr[[...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % arr.length];

/** Primeira resposta da conversa (usada no modo teste, sem IA). */
export function welcomeMessage(nome: string, seed: string, date = new Date()): string {
  const g = greeting(date);
  const n = nome ? `, ${nome}` : '';
  return pick([
    `${g}${n}! 😊 Aqui é a Amanda, da Clinex. Que bom ter você por aqui! Me conta, como posso te ajudar hoje?`,
    `${g}${n}! Tudo bem? Eu sou a Amanda, assistente virtual da Clinex. Posso te ajudar com agendamentos, exames e informações. Sobre o que você gostaria de falar?`,
    `${g}${n}! Seja muito bem-vindo(a) à Clinex 💙 Eu sou a Amanda e vou cuidar do seu atendimento. Em que posso te ajudar?`,
  ], seed);
}

/** Respostas seguintes (sem repetir a saudação). */
export function followUpMessage(nome: string, seed: string): string {
  const n = nome ? `, ${nome}` : '';
  return pick([
    `Obrigada pela mensagem${n}! Já estou vendo isso por aqui e te retorno em instantes 😊`,
    `Entendi${n}! Deixa comigo, já vou verificar e te respondo rapidinho.`,
    `Perfeito${n}, recebi aqui! Só um momento que já te ajudo com isso 💙`,
  ], seed);
}
