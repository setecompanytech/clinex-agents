-- Funil de aquisição (painel da Amanda > Funil de aquisição), 25/11/2026.
-- Rode no SQL Editor do Supabase DO PAINEL (o mesmo das tabelas crm_* e agente_eventos). Pode rodar mais de uma vez.
--
-- aquisicao_campanhas: cada campanha de anúncio (nome, código, canal, links, investimento...). O objeto inteiro em jsonb.
-- aquisicao_eventos:   o que acontece com a campanha do nosso lado:
--   clique -> alguém clicou no link rastreado do anúncio (/c/CODIGO), para o site ou direto para o WhatsApp
--   site   -> o site da Clinex abriu vindo da campanha (um por visitante por dia)
--   lead   -> a pessoa chegou no WhatsApp com o código da campanha na mensagem (um por telefone por campanha)
-- O resto do funil (agendou, pagou, foi atendido) é lido ao vivo do Clinilink pelo telefone do lead: não fica aqui.
-- O telefone fica gravado SÓ no lead (é a ligação com o Clinilink). Cliques e visitas não guardam IP nem telefone.

create table if not exists public.aquisicao_campanhas (
  id text primary key,
  dados jsonb not null,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.aquisicao_eventos (
  id bigint generated always as identity primary key,
  t timestamptz not null default now(),
  campanha text not null,
  etapa text not null check (etapa in ('clique', 'site', 'lead')),
  chave text unique,      -- tira duplicado: lead = 'lead:<campanha>:<telefone>'; site = 'site:<campanha>:<visitante>:<dia>'; clique = por visitante a cada 10 min
  telefone text,          -- só no lead
  atendimento text,       -- só no lead (atendimento da Inovstar)
  contato text,           -- só no lead (nome do contato no WhatsApp)
  dados jsonb not null default '{}'::jsonb
);
create index if not exists idx_aquisicao_eventos_campanha on public.aquisicao_eventos (campanha, etapa, t);
create index if not exists idx_aquisicao_eventos_t on public.aquisicao_eventos (t);

-- mesmo padrão das tabelas crm_*: o servidor usa a service_role (ignora RLS); usuário logado do Supabase pode ler/gravar
create or replace function public.aquisicao_tocar() returns trigger language plpgsql as $f$
begin new.atualizado_em = now(); return new; end $f$;
drop trigger if exists aquisicao_tocar on public.aquisicao_campanhas;
create trigger aquisicao_tocar before update on public.aquisicao_campanhas for each row execute function public.aquisicao_tocar();

alter table public.aquisicao_campanhas enable row level security;
alter table public.aquisicao_eventos enable row level security;
drop policy if exists "autenticados" on public.aquisicao_campanhas;
create policy "autenticados" on public.aquisicao_campanhas for all to authenticated using (true) with check (true);
drop policy if exists "autenticados" on public.aquisicao_eventos;
create policy "autenticados" on public.aquisicao_eventos for all to authenticated using (true) with check (true);
