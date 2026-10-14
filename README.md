# clinex-agents

Backend dos agentes de IA da Clinex. Primeiro agente: **receptivo** (WhatsApp da clínica via Inovstar).

Fluxo: Inovstar → `POST /webhooks/inovstar/:clinicSlug` → agente (Claude) → resposta via Inovstar,
ou `transferir_para_humano`. Quando um humano responde na conversa, o agente se cala nela.

## Setup
1. Rodar `supabase/migrations/001_init.sql` e inserir uma linha em `clinics` (knowledge = base da clínica).
2. Copiar `.env.example` para `.env`.
3. `npm i && npm run dev`.
4. Configurar na Inovstar o webhook: `https://<host>/webhooks/inovstar/<slug>?secret=<INOVSTAR_WEBHOOK_SECRET>`.

## Pendente
- Confirmar com a doc da Inovstar: payload do webhook, endpoint de envio de texto e de transferência (`src/integrations/inovstar.ts`).
- `auto_reply=false` na clínica liga o modo sombra (grava sem enviar).
