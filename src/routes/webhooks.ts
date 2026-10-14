import { Router, type Request } from 'express';
import { waitUntil } from '@vercel/functions';
import { env } from '../lib/env.js';
import { parseMessageReceived, verifySignature } from '../integrations/inovstar.js';
import { handleIncoming } from '../agents/receptivo/agent.js';

const router = Router();

const hasValidKey = (key: unknown) => Boolean(env.webhookSecret) && key === env.webhookSecret;

// POST /webhooks/inovstar — evento MESSAGE_RECEIVED. A Inovstar exige 2xx em até 5s.
router.post('/inovstar', (req: Request & { rawBody?: Buffer }, res) => {
  // Autenticação: assinatura HMAC (se a Inovstar enviar) OU ?key=<segredo> na URL do webhook.
  const sig = req.header('x-inovstar-signature');
  const ok = hasValidKey(req.query.key) || (sig ? verifySignature(req.rawBody, sig) : false);
  if (!ok) return res.status(401).json({ error: 'não autorizado' });
  const ev = parseMessageReceived(req.body);
  if (!ev) return res.json({ ignored: true });

  waitUntil(handleIncoming(ev).catch((e) => console.error('agente falhou', e)));
  res.json({ ok: true });
});

export default router;
