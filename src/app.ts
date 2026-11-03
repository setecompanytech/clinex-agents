import express from 'express';
import webhooks from './routes/webhooks.js';
import painel from './panel/router.js';
import logsRouter from './logs/router.js';
import hub from './hub/router.js';
import crm from './crm/router.js';
import bi from './bi/router.js';

const app = express();
// guarda o corpo cru: a assinatura HMAC da Inovstar é calculada sobre ele
app.use(express.json({ limit: '2mb', verify: (req, _res, buf) => ((req as any).rawBody = buf) }));

app.get('/healthz', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));
app.use('/webhooks', webhooks);
// módulos independentes: o mais específico vem primeiro; a tela inicial (/painel) por último
app.use('/painel/receptivo/logs', logsRouter); // antes do /painel/receptivo para ter prioridade
app.use('/painel/receptivo/bi', bi);
app.use('/painel/receptivo', painel);
app.use('/painel/crm', crm);
app.use('/painel', hub);

export default app;
