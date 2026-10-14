# clinex-agents

Backend dos agentes de IA da Clinex. Primeiro agente: **receptivo** (WhatsApp da clínica via Inovstar). Sem banco de dados.

## Fluxo
1. A Inovstar chama `POST /webhooks/inovstar` a cada `MESSAGE_RECEIVED` (assinatura HMAC validada).
2. O agente só atua se o atendimento está no setor `AGENT_SECTOR_ID` e sem atendente atribuído.
3. Espera `DEBOUNCE_MS`, lê o histórico (`GET /attendance/{id}/history`) e gera a resposta com Claude.
4. Responde por `POST /whatsapp/send/text`, ou transfere (`PUT /attendance/{id}/transfer`) para `HUMAN_SECTOR_ID`
   avisando o paciente na mesma chamada.

O estado (quem está com a conversa) é o próprio setor/atendente na Inovstar: ao transferir para o setor humano,
o agente sai de cena naquela conversa.

## Setup
1. Na Inovstar: criar setor da IA e setor humano; gerar a chave de API; criar webhook para
   `https://<host>/webhooks/inovstar` com evento `MESSAGE_RECEIVED` e um signing token.
2. Preencher o `.env` (ver `.env.example`). Comece com `AUTO_REPLY=false` (modo sombra) e veja os logs.
3. `npm i && npm run dev`.
