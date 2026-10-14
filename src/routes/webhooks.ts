import { Router } from 'express';
import { waitUntil } from '@vercel/functions';
import { env } from '../lib/env.js';
import { parseWebhook } from '../integrations/inovstar.js';
import { handleIncoming } from '../agents/receptivo/agent.js';

const router = Router();

// POST /webhooks/inovstar/:clinicSlug
router.post('/inovstar/:clinicSlug', (req, res) => {
  const secret = req.header('x-webhook-secret') ?? req.query.secret;
  if (env.webhookSecret && secret !== env.webhookSecret) return res.status(401).json({ error: 'unauthorized' });

  console.log('webhook inovstar', JSON.stringify(req.body).slice(0, 2000)); // ajuda a calibrar o parser
  const msg = parseWebhook(req.body);
  if (!msg) return res.json({ ignored: true });

  // Responde rápido; o processamento continua em background (waitUntil na Vercel)
  const job = handleIncoming(String(req.params.clinicSlug), msg).catch((e) => console.error('agente falhou', e));
  waitUntil(job);
  res.json({ ok: true });
});

export default router;
