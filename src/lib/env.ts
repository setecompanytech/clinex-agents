export const env = {
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? '',
  anthropicBase: (process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com').replace(/\/+$/, ''),
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
  debounceMs: Number(process.env.DEBOUNCE_MS ?? 15000),
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
  agentTitle: process.env.AGENT_TITLE ?? '*Amanda:*',
  // títulos usados antes: as mensagens antigas na conversa continuam sendo reconhecidas como da Amanda
  agentTitlesAntigos: ['*Amanda S. (Clinex):*', '*Amanda (IA) - Nova*'], // 24/11/2026: o título virou só "Amanda"
  timezone: process.env.CLINIC_TZ ?? 'America/Sao_Paulo',
  // 'scripted' = roteiro fixo, sem IA (padrão) | 'claude' = modelo de linguagem (precisa de ANTHROPIC_API_KEY)
  mode: (process.env.AGENT_MODE ?? 'scripted') as 'scripted' | 'claude' | 'ia',
  // Amanda IA (o modelo conduz a conversa e usa as ferramentas do Clinilink). AGENT_MODE=ia liga para todos; AGENTE_IA_NUMEROS liga so
  // para esses telefones (piloto), os demais seguem no roteiro.
  iaNumeros: (process.env.AGENTE_IA_NUMEROS ?? '').split(',').map((n) => n.trim()).filter(Boolean),
  // modelo da Amanda IA: com ANTHROPIC_API_KEY usa o Claude (AGENT_MODEL); sem ela, a OpenAI com este modelo
  iaModeloOpenai: process.env.IA_MODEL_OPENAI ?? 'gpt-4.1',
  /** Modelo barato para o começo da conversa (antes de mostrar horários). 'off' = sempre o IA_MODEL_OPENAI. */
  iaModeloOpenaiLeve: process.env.IA_MODEL_OPENAI_LEVE ?? 'gpt-4.1-mini',
  // Consulta de agenda no Clinilink (somente leitura). Sem chave => catálogo simulado.
  clinilinkBase: process.env.CLINILINK_BASE_URL ?? 'https://lista-unilab-clinex.onrender.com',
  clinilinkKey: process.env.CLINILINK_API_KEY ?? '',
  // Chave de ESCRITA (perfil rw), usada só para cadastrar paciente e reservar. Sem ela, usa a chave acima (que pode ser só leitura).
  clinilinkWriteKey: process.env.CLINILINK_API_KEY_ESCRITA || process.env.CLINILINK_API_KEY || '',
  // Humanizador de mensagens (GPT). Sem chave => textos do roteiro como estão.
  // Chat do Agente Clinex com controle do sistema (modo conversa): Claude com ferramentas; voz: OpenAI (transcrição e fala)
  agenteChatModelo: process.env.AGENTE_CHAT_MODELO ?? 'claude-opus-5-5',
  agenteChatEsforco: (process.env.AGENTE_CHAT_ESFORCO ?? 'low') as 'low' | 'medium' | 'high',
  vozTranscricaoModelo: process.env.VOZ_TRANSCRICAO_MODELO ?? 'gpt-4o-mini-transcribe',
  vozFalaModelo: process.env.VOZ_FALA_MODELO ?? 'gpt-4o-mini-tts',
  openaiBase: (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, ''),
  vozFalaVoz: process.env.VOZ_FALA_VOZ ?? 'nova',
  openaiKey: process.env.OPENAI_API_KEY ?? '',
  openaiModel: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
  // modelo que LÊ imagens difíceis (pedido médico escrito à mão): mais capaz que o de texto
  openaiVisionModel: process.env.OPENAI_VISION_MODEL ?? 'gpt-4o',
  // chave pix para o pagamento antecipado e nome que deve aparecer como recebedor no comprovante
  pixKey: process.env.PIX_KEY ?? 'clinicaclinex@gmail.com',
  // HORÁRIO COMERCIAL (regra de 16/11/2026): dentro dele a Amanda agenda, NÃO manda a confirmação ao paciente (vai como nota interna),
  // pergunta a forma de pagamento e passa para a equipe. Fora dele, segue o fluxo completo. Dias: 0=domingo ... 6=sábado.
  comercialInicio: process.env.HORARIO_COMERCIAL_INICIO ?? '07:00',
  comercialFim: process.env.HORARIO_COMERCIAL_FIM ?? '17:00',
  comercialDias: (process.env.HORARIO_COMERCIAL_DIAS ?? '1,2,3,4,5,6').split(',').map((d) => Number(d.trim())).filter((d) => d >= 0 && d <= 6),
  // CNPJ(s) da conta que recebe o pix (separados por vírgula): comprovante que mostra o CNPJ de destino em vez da chave (ex.: Stone)
  pixCnpjs: (process.env.PIX_CNPJ ?? '22065464000132').split(',').map((x) => x.replace(/\D/g, '')).filter((x) => x.length === 14),
  // horário de atendimento da equipe, como a Amanda informa (o mesmo da resposta automática da clínica)
  clinicHorario: process.env.CLINIC_HORARIO ?? 'Funcionamos de segunda a sexta, das 07h às 12h e das 14h às 17h, e aos sábados, das 07h às 10h30, nas duas unidades (Guamá e Telégrafo).',
  // REGRA DA CLÍNICA (24/11/2026): horários de coleta, eletrocardiograma e raio-X por unidade (a Amanda informa quando precisar)
  clinicHorarioSetores: process.env.CLINIC_HORARIO_SETORES ?? [
    'Coleta de exames no Guamá: das 07h às 11h (para os exames que precisam de jejum).',
    'Coleta de exames no Telégrafo: das 07h às 10h30 para todas as coletas; só o PCCU (preventivo) e a coleta de secreção podem ser feitos à tarde.',
    'Eletrocardiograma e Raio-X no Guamá: só pela manhã, de segunda a sexta das 08h às 11h30 e aos sábados das 07h às 10h30.',
    'Eletrocardiograma no Telégrafo: de segunda a sexta das 07h às 11h30 e das 14h às 16h30; aos sábados das 07h às 10h30.',
  ].join('\n'),
  // palavras (separadas por vírgula) que identificam o recebedor no comprovante; basta uma aparecer no nome ou na chave
  pixRecebedor: process.env.PIX_RECEBEDOR ?? 'clinex',
  clinicName: process.env.CLINIC_NAME ?? 'Clínica',
  // base de conhecimento em texto (serviços, convênios, endereço, horários...). Sem banco: vem do env/arquivo.
  knowledge: process.env.CLINIC_KNOWLEDGE ?? '',
  persona: process.env.CLINIC_PERSONA ?? '',
};
