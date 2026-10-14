-- Uma linha por clínica atendida pelos agentes
create table if not exists clinics (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  -- base de conhecimento em texto livre: serviços, convênios, endereço, horários, preços liberados
  knowledge text not null default '',
  -- instruções extras de tom/regras da clínica
  persona text not null default '',
  -- false = modo sombra (gera resposta mas não envia)
  auto_reply boolean not null default true,
  business_hours jsonb,
  created_at timestamptz not null default now()
);

-- Mensagens processadas (idempotência do webhook + histórico do agente)
create table if not exists agent_messages (
  id bigserial primary key,
  clinic_id uuid not null references clinics(id),
  chat_id text not null,
  external_id text,                       -- id da mensagem na Inovstar
  role text not null check (role in ('patient','agent','human','system')),
  content text not null,
  sent boolean not null default false,    -- agent: foi enviada de fato?
  created_at timestamptz not null default now(),
  unique (clinic_id, external_id)
);
create index if not exists agent_messages_chat_idx on agent_messages (clinic_id, chat_id, created_at);

-- Estado por conversa: quando humano assume, o agente se cala
create table if not exists agent_chats (
  clinic_id uuid not null references clinics(id),
  chat_id text not null,
  patient_name text,
  patient_phone text,
  handoff boolean not null default false,
  handoff_reason text,
  updated_at timestamptz not null default now(),
  primary key (clinic_id, chat_id)
);
