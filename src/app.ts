import express from 'express';
import webhooks from './routes/webhooks.js';

const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/healthz', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));
app.use('/webhooks', webhooks);

export default app;
