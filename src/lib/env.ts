export const env = {
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? '',
  model: process.env.AGENT_MODEL ?? 'claude-sonnet-5-5',
  inovstarBase: process.env.INOVSTAR_BASE_URL ?? 'https://gateway.inovstar.com',
  inovstarToken: process.env.INOVSTAR_TOKEN ?? '', // inovstar_<64 hex>, um por empresa
  webhookSecret: process.env.INOVSTAR_WEBHOOK_SECRET ?? '', // "signing token" configurado no webhook
  // Whitelist de telefones (separados por vírgula). VAZIO = o agente não atende ninguém.
  allowedNumbers: (process.env.ALLOWED_NUMBERS ?? '').split(',').map((n) => n.trim()).filter(Boolean),
  // Setor onde a IA atende (opcional). Se definido, conversas fora dele são ignoradas.
  agentSectorId: process.env.AGENT_SECTOR_ID ?? '',
  // Setor para onde a IA devolve a conversa ao transferir (opcional; sem ele só avisa o paciente).
  humanSectorId: process.env.HUMAN_SECTOR_ID ?? '',
  // false = modo sombra: lê, decide e só loga a resposta, sem enviar nem transferir.
  autoReply: (process.env.AUTO_REPLY ?? 'true') !== 'false',
  // espera antes de responder, para agrupar mensagens picadas do paciente
  debounceMs: Number(process.env.DEBOUNCE_MS ?? 4000),
  testReply: process.env.TEST_REPLY ?? 'Olá! Aqui é o assistente virtual da Clinex. Recebi sua mensagem e a equipe já vai te responder. (teste)',
  // título que abre toda mensagem enviada (negrito no WhatsApp com asteriscos). Vazio = sem título.
  agentTitle: process.env.AGENT_TITLE ?? '*AMANDA IA - Teste*',
  timezone: process.env.CLINIC_TZ ?? 'America/Sao_Paulo',
  // 'scripted' = roteiro fixo, sem IA (padrão) | 'claude' = modelo de linguagem (precisa de ANTHROPIC_API_KEY)
  mode: (process.env.AGENT_MODE ?? 'scripted') as 'scripted' | 'claude',
  clinicName: process.env.CLINIC_NAME ?? 'Clínica',
  // base de conhecimento em texto (serviços, convênios, endereço, horários...). Sem banco: vem do env/arquivo.
  knowledge: process.env.CLINIC_KNOWLEDGE ?? '',
  persona: process.env.CLINIC_PERSONA ?? '',
};
