import { Router } from 'express';
import { painelAuth } from '../lib/painel-auth.js';
import { montarBI, PERIODOS, type Fonte, type Periodo } from './fonte.js';
import { base } from './ui/base.js';
import { charts } from './ui/charts.js';
import { app } from './ui/app.js';
import { pagina } from './ui/page.js';
import { DS_CSP } from '../ui/ds.js';

/**
 * BI do agente receptivo (GET /painel/receptivo/bi). Só LÊ os eventos que o agente já registra (src/lib/log.ts):
 * não altera nada do agente. Mesma senha do painel (PAINEL_PASSWORD).
 *   /painel/receptivo/bi                                         a tela
 *   /painel/receptivo/bi/dados.json?periodo=24h|7d|30d&fonte=real|demo
 */
const router = Router();
router.use(painelAuth);

// o CSS e o JS do design system vêm do próprio servidor (/painel/ds.css e /painel/ds.js)
const CSP = DS_CSP;
const clientJs = `(function () {\n'use strict';\n${base}\n${charts}\n${app}\n})();`;

router.get('/', (_req, res) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.type('text/html; charset=utf-8').send(pagina);
});

router.get('/app.js', (_req, res) => res.type('application/javascript; charset=utf-8').send(clientJs));

router.get('/dados.json', async (req, res) => {
  const periodo = (String(req.query.periodo) in PERIODOS ? String(req.query.periodo) : '7d') as Periodo;
  const fonte: Fonte = req.query.fonte === 'demo' ? 'demo' : 'real';
  try {
    res.json(await montarBI(periodo, fonte));
  } catch (e) {
    console.error('[bi] falha ao montar os dados:', (e as Error).message);
    res.status(500).json({ erro: 'Falha ao montar o BI.' });
  }
});

export default router;
