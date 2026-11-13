import { Router, type Request } from 'express';
import { waitUntil } from '@vercel/functions';
import { env } from '../lib/env.js';
import { parseMessageReceived, verifySignature } from '../integrations/inovstar.js';
import { handleIncoming } from '../agents/receptivo/agent.js';
import { rodarLembretes } from '../agents/receptivo/lembretes.js';
import { registrarRespostaWhatsApp } from '../crm/disparo-auto-servico.js';

const router = Router();

const hasValidKey = (key: unknown) => Boolean(env.webhookSecret) && key === env.webhookSecret;

// POST /webhooks/inovstar — evento MESSAGE_RECEIVED. A Inovstar exige 2xx em até 5s.
router.post('/inovstar', (req: Request & { rawBody?: Buffer }, res) => {
  // Autenticação: assinatura HMAC (se a Inovstar enviar) OU ?key=<segredo> na URL do webhook.
  const sig = req.header('x-inovstar-signature');
  const ok = hasValidKey(req.query.key) || (sig ? verifySignature(req.rawBody, sig) : false);
  if (!ok) {
    // Reenvios da fila antiga (URL sem ?key=): dá baixa com 200 SEM processar, para destravar a fila sequencial.
    if (req.query.key === undefined && Number(req.header('x-inovstar-attempt') ?? 1) > 1) {
      return res.json({ drained: true });
    }
    console.log(`401: key=${req.query.key === undefined ? 'ausente' : 'errada'} assinatura=${sig ? 'sim' : 'não'} tentativa=${req.header('x-inovstar-attempt') ?? '?'} manual=${req.header('x-inovstar-manual-redelivery') ?? 'não'} evento=${req.header('x-inovstar-event') ?? '?'}`);
    return res.status(401).json({ error: 'não autorizado' });
  }
  const ev = parseMessageReceived(req.body);
  if (!ev) return res.json({ ignored: true });

  waitUntil(handleIncoming(ev).catch((e) => console.error('agente falhou', e)));
  // rastreio do CRM: se o telefone recebeu um disparo nosso, a resposta vira evento no lead (só registra, não responde)
  if (!ev.isGroup) waitUntil(registrarRespostaWhatsApp({ telefone: ev.to, texto: ev.text, tipo: ev.type, messageId: ev.messageId, contato: ev.contactName }).catch((e) => console.error('rastreio de resposta falhou', e)));
  // de carona: envia os lembretes de inatividade que já venceram (uma execução por vez, trava no Redis)
  waitUntil(rodarLembretes().catch((e) => console.error('lembretes falharam', e)));
  res.json({ ok: true });
});

export default router;
