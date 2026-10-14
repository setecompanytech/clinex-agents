import { Router, type Request } from 'express';
import { waitUntil } from '@vercel/functions';
import { parseMessageReceived, verifySignature } from '../integrations/inovstar.js';
import { handleIncoming } from '../agents/receptivo/agent.js';

const router = Router();

// POST /webhooks/inovstar — evento MESSAGE_RECEIVED. A Inovstar exige 2xx em até 5s.
router.post('/inovstar', (req: Request & { rawBody?: Buffer }, res) => {
  if (!verifySignature(req.rawBody, req.header('x-inovstar-signature'))) {
    return res.status(401).json({ error: 'assinatura inválida' });
  }
  const ev = parseMessageReceived(req.body);
  if (!ev) return res.json({ ignored: true });

  waitUntil(handleIncoming(ev).catch((e) => console.error('agente falhou', e)));
  res.json({ ok: true });
});

export default router;
