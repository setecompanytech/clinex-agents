-- CRM Clinex: esquema do banco (Supabase / Postgres), conforme "pipelines-crm-tecnico" seção 3.
-- Rode no SQL Editor de um projeto Supabase NOVO. Tipos inferidos do documento: revise antes de produção.
-- O Clinilink é só fonte (leitura): nada aqui escreve de volta nele.

create extension if not exists pgcrypto;

-- 3.1 funis ---------------------------------------------------------------------------------------------------
create table if not exists public.pipelines (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  dimensao text not null check (dimensao in ('orcamento', 'agendamento', 'lead')),
  unidade_id text,                               -- null = todas as unidades
  status_permitidos text[] not null default '{}', -- status externos que fazem o card "pertencer" ao funil
  data_inicial date,
  data_final date,
  filtro_especialidade text,
  filtro_servico text,
  valor_estrela jsonb,                           -- faixa de valor para as estrelas do card
  -- [{ "id": "em-aberto", "label": "EM ABERTO", "color": "#3F8E86", "cadenciaDias": 5, "posX": 0, "posY": 0 }]
  -- A 1ª posição é o topo de funil. Ganho/perda são reconhecidos pelo RÓTULO (convert, perd, descart, sem retorno, recuper).
  stages jsonb not null default '[]',
  -- [{ "deStageId", "paraStageId", "tipo": "apos_horas|horario_diario|horario_semanal", "horas", "horario", "diaSemana" }]
  automacoes jsonb not null default '[]',
  ultima_ingestao_dia date,
  -- extras do CRM (o app Lovable pode ignorar): colunas excluídas (para o histórico seguir legível) e funil escondido
  removidas jsonb not null default '[]',
  oculto boolean not null default false,
  criado_em timestamptz not null default now()
);

-- 3.3 posição de cada card no funil ---------------------------------------------------------------------------
create table if not exists public.pipeline_card_assignments (
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  card_id uuid not null,                         -- = id do orçamento/agendamento no Clinilink, ou id do lead
  stage_id text not null,
  entered_at timestamptz not null default now(), -- quando entrou na coluna atual
  manual boolean not null default false,         -- a última mudança foi humana
  -- [{ "stageId": "...", "em": "2026-11-01T10:00:00Z", "manual": true, "por": "Nome" }]  (registros antigos podem usar "para")
  historico jsonb not null default '[]',
  origin_snapshot jsonb,                         -- card como chegou na criação
  ultimo_snapshot jsonb,                         -- card congelado exibido (só `status` é atualizado depois)
  origin_status text,
  case_status text not null default 'aberto' check (case_status in ('aberto', 'recuperado', 'removido')),
  recovered_at timestamptz,
  primary key (pipeline_id, card_id)
);
alter table public.pipeline_card_assignments replica identity full; -- payload completo em DELETE no realtime
create index if not exists idx_assign_stage on public.pipeline_card_assignments (pipeline_id, stage_id);

-- 3.4 enriquecimento do lead (chave card_id, SEM pipeline_id: compartilhado entre funis) -------------------------
create table if not exists public.lead_extras (
  card_id uuid primary key,
  responsavel text,
  observacoes_crm text,
  proximo_contato date,
  valor_negociado numeric(12, 2),
  valor_negociado_por text,
  valor_negociado_em timestamptz
);
create table if not exists public.lead_followups (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null,
  data date, hora text, descricao text, resultado text, proxima_data date
);
create table if not exists public.lead_contact_history (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null,
  data timestamptz not null default now(),
  tipo text not null,                            -- ex.: "Mandou WhatsApp". Não é histórico de etapa.
  observacao text
);
create index if not exists idx_followups_card on public.lead_followups (card_id);
create index if not exists idx_contatos_card on public.lead_contact_history (card_id);

-- 3.5 WhatsApp (Inovstar) ---------------------------------------------------------------------------------------
create table if not exists public.leads_inovstar (
  id uuid primary key default gen_random_uuid(),
  telefone text not null unique,
  protocolo text,
  status text not null default 'novo_lead',      -- novo_lead, interesse, follow_up_1, convertido
  ultima_mensagem text,
  ultimo_contato_em timestamptz,
  qtd_mensagens integer not null default 0,
  interesse_em timestamptz,
  convertido_em timestamptz,
  valor_particular numeric(12, 2)
);
create table if not exists public.lead_mensagens (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads_inovstar(id) on delete cascade,
  mensagem_id text not null,
  corpo text, direcao text, enviada_em timestamptz,
  unique (lead_id, mensagem_id)
);

-- RLS: ligado em tudo, acesso para usuários autenticados ----------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['pipelines', 'pipeline_card_assignments', 'lead_extras', 'lead_followups', 'lead_contact_history', 'leads_inovstar', 'lead_mensagens']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "autenticados" on public.%I', t);
    execute format('create policy "autenticados" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Realtime: o front escuta mudanças em assignments e pipelines
do $$ begin
  alter publication supabase_realtime add table public.pipelines, public.pipeline_card_assignments;
exception when others then null; -- já estava na publicação
end $$;

-- ==================================================================================================================
-- Sistema completo: guia de atendimento (CRM) e Agente Receptivo
-- ==================================================================================================================

-- Leads do guia de atendimento, automações (as 2 do guia + as da equipe) e o log do que elas fizeram.
-- O objeto inteiro fica em jsonb: o motor de regras trabalha com ele como documento.
create table if not exists public.crm_leads (
  id text primary key, dados jsonb not null, atualizado_em timestamptz not null default now()
);
create table if not exists public.crm_automacoes (
  id text primary key, dados jsonb not null, atualizado_em timestamptz not null default now()
);
create table if not exists public.crm_log_auto (
  id text primary key, dados jsonb not null, atualizado_em timestamptz not null default now()
);
-- Configurações soltas: 'atendentes' (lista de nomes) e 'rotina' (última execução da rotina do Clinilink).
create table if not exists public.crm_config (
  chave text primary key, valor jsonb not null, atualizado_em timestamptz not null default now()
);

-- Agente Receptivo (Amanda): cada evento do agente, já mascarado (sem CPF, telefone ou nascimento). Alimenta o BI.
-- O servidor apaga o que passa de 90 dias. 'dados' guarda o evento completo, como o BI o lê.
create table if not exists public.agente_eventos (
  id bigint generated always as identity primary key,
  t timestamptz not null,
  evt text not null,
  atendimento text,
  dados jsonb not null
);
create index if not exists idx_agente_eventos_t on public.agente_eventos (t);
create index if not exists idx_agente_eventos_atendimento on public.agente_eventos (atendimento, t);

-- atualizado_em automático nas tabelas crm_*
create or replace function public.crm_tocar() returns trigger language plpgsql as $f$
begin new.atualizado_em = now(); return new; end $f$;
do $$
declare t text;
begin
  foreach t in array array['crm_leads', 'crm_automacoes', 'crm_log_auto', 'crm_config']
  loop
    execute format('drop trigger if exists crm_tocar on public.%I', t);
    execute format('create trigger crm_tocar before update on public.%I for each row execute function public.crm_tocar()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "autenticados" on public.%I', t);
    execute format('create policy "autenticados" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
  alter table public.agente_eventos enable row level security;
  drop policy if exists "autenticados" on public.agente_eventos;
  create policy "autenticados" on public.agente_eventos for all to authenticated using (true) with check (true);
end $$;

-- ----- Usuários do painel -----
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


-- Faz a API do Supabase enxergar as tabelas novas imediatamente
notify pgrst, 'reload schema';
