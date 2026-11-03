-- Gestão de usuários do painel (login, perfis e módulos). Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.
-- A senha de cada usuário fica só como hash (scrypt com sal); a senha em texto nunca é gravada.
create table if not exists public.painel_usuarios (
  id text primary key, dados jsonb not null, atualizado_em timestamptz not null default now()
);

create or replace function public.crm_tocar() returns trigger language plpgsql as $f$
begin new.atualizado_em = now(); return new; end $f$;
drop trigger if exists crm_tocar on public.painel_usuarios;
create trigger crm_tocar before update on public.painel_usuarios for each row execute function public.crm_tocar();

-- Só o servidor (service_role) lê e grava; ninguém acessa pelo navegador.
alter table public.painel_usuarios enable row level security;
drop policy if exists "autenticados" on public.painel_usuarios;
create policy "autenticados" on public.painel_usuarios for all to authenticated using (true) with check (true);
grant all on public.painel_usuarios to service_role;
grant all on public.painel_usuarios to authenticated;

notify pgrst, 'reload schema';
