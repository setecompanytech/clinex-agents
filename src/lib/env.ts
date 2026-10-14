export const env = {
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? '',
  model: process.env.AGENT_MODEL ?? 'claude-sonnet-5-5',
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  inovstarBase: process.env.INOVSTAR_BASE_URL ?? 'https://gateway.inovstar.com',
  inovstarToken: process.env.INOVSTAR_TOKEN ?? '',
  webhookSecret: process.env.INOVSTAR_WEBHOOK_SECRET ?? '',
};
