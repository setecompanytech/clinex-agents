import express from 'express';
import webhooks from './routes/webhooks.js';
import painel from './panel/router.js';
import logsRouter from './logs/router.js';

const app = express();
// guarda o corpo cru: a assinatura HMAC da Inovstar é calculada sobre ele
app.use(express.json({ limit: '2mb', verify: (req, _res, buf) => ((req as any).rawBody = buf) }));

app.get('/healthz', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));
app.use('/webhooks', webhooks);
app.use('/painel/logs', logsRouter); // antes do /painel para ter prioridade
app.use('/painel', painel);

export default app;
