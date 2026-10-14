import express from 'express';
import webhooks from './routes/webhooks.js';

const app = express();
// guarda o corpo cru: a assinatura HMAC da Inovstar é calculada sobre ele
app.use(express.json({ limit: '2mb', verify: (req, _res, buf) => ((req as any).rawBody = buf) }));

app.get('/healthz', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));
app.use('/webhooks', webhooks);

export default app;
