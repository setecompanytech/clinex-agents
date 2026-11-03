/**
 * Confere se o Supabase está pronto para o CRM e o Agente Receptivo: credenciais, tabelas e contagens.
 * Não grava nada. Rodar: npm run supabase:verificar
 */
import { TABELAS_CRM } from '../src/crm/persistencia.js';
import { sbLer, sbFaltantes, supabaseConfigurado, SupabaseError } from '../src/lib/supabase.js';

const TODAS = [...TABELAS_CRM, 'agente_eventos', 'leads_inovstar', 'lead_mensagens'];
if (!supabaseConfigurado()) { console.error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY não estão preenchidas no .env.'); process.exit(1); }
try {
  const faltam = await sbFaltantes(TODAS);
  if (faltam.length) {
    console.error(`Credenciais OK, mas faltam ${faltam.length} tabela(s): ${faltam.join(', ')}`);
    console.error('Rode o conteúdo de docs/supabase-schema-crm.sql no SQL Editor do Supabase e confira se terminou sem erro.');
    process.exit(2);
  }
  console.log('Supabase pronto. Linhas por tabela:');
  for (const t of TODAS) console.log(`  ${t.padEnd(28)} ${(await sbLer(t, { max: 100000 })).length}`);
} catch (e) {
  console.error(e instanceof SupabaseError ? `Falhou (${e.codigo}): ${e.message}` : (e as Error).message);
  process.exit(1);
}
