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
  // espera depois da mensagem do paciente, para ele terminar de escrever ("quero tal coisa" + "mais isso" viram um pedido só)
  debounceMs: Number(process.env.DEBOUNCE_MS ?? 30000),
  // Redis (Upstash, REST) para guardar o estado da conversa entre as mensagens. Vazio = reprocessa a conversa inteira a cada mensagem.
  // A integração da Vercel cria KV_REST_API_URL/KV_REST_API_TOKEN; também aceita os nomes da própria Upstash.
  redisUrl: process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? '',
  redisToken: process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? '',
  // "Digitando": cada balão de resposta espera o tempo de uma pessoa ler e escrever aquele texto (~TYPING_MS_PER_CHAR por caractere),
  // nunca menos que MIN nem mais que MAX por balão. MAX = 0 desliga a espera.
  replyDelayMinMs: Number(process.env.REPLY_DELAY_MIN_MS ?? 1500),
  replyDelayMaxMs: Number(process.env.REPLY_DELAY_MAX_MS ?? 12000),
  typingMsPerChar: Number(process.env.TYPING_MS_PER_CHAR ?? 40),
  testReply: process.env.TEST_REPLY ?? 'Olá! Aqui é o assistente virtual da Clinex. Recebi sua mensagem e a equipe já vai te responder. (teste)',
  // título que abre toda mensagem enviada (negrito no WhatsApp com asteriscos). Vazio = sem título.
  agentTitle: process.env.AGENT_TITLE ?? '*Amanda S. (Clinex):*',
  // títulos usados antes: as mensagens antigas na conversa continuam sendo reconhecidas como da Amanda
  agentTitlesAntigos: ['*Amanda (IA) - Nova*'],
  timezone: process.env.CLINIC_TZ ?? 'America/Sao_Paulo',
  // 'scripted' = roteiro fixo, sem IA (padrão) | 'claude' = modelo de linguagem (precisa de ANTHROPIC_API_KEY)
  mode: (process.env.AGENT_MODE ?? 'scripted') as 'scripted' | 'claude',
  // Consulta de agenda no Clinilink (somente leitura). Sem chave => catálogo simulado.
  clinilinkBase: process.env.CLINILINK_BASE_URL ?? 'https://lista-unilab-clinex.onrender.com',
  clinilinkKey: process.env.CLINILINK_API_KEY ?? '',
  // Chave de ESCRITA (perfil rw), usada só para cadastrar paciente e reservar. Sem ela, usa a chave acima (que pode ser só leitura).
  clinilinkWriteKey: process.env.CLINILINK_API_KEY_ESCRITA || process.env.CLINILINK_API_KEY || '',
  // Humanizador de mensagens (GPT). Sem chave => textos do roteiro como estão.
  openaiKey: process.env.OPENAI_API_KEY ?? '',
  openaiModel: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
  // chave pix para o pagamento antecipado e nome que deve aparecer como recebedor no comprovante
  pixKey: process.env.PIX_KEY ?? 'clinicaclinex@gmail.com',
  // horário de atendimento da equipe, como a Amanda informa (o mesmo da resposta automática da clínica)
  clinicHorario: process.env.CLINIC_HORARIO ?? 'Nosso horário de atendimento é de segunda a sexta, das 7h às 17h, e aos sábados das 7h às 11h.',
  // palavras (separadas por vírgula) que identificam o recebedor no comprovante; basta uma aparecer no nome ou na chave
  pixRecebedor: process.env.PIX_RECEBEDOR ?? 'clinex',
  clinicName: process.env.CLINIC_NAME ?? 'Clínica',
  // base de conhecimento em texto (serviços, convênios, endereço, horários...). Sem banco: vem do env/arquivo.
  knowledge: process.env.CLINIC_KNOWLEDGE ?? '',
  persona: process.env.CLINIC_PERSONA ?? '',
};
