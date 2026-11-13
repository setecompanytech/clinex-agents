import { Router } from 'express';
import { exigirEscrita, exigirModulo, painelAuth } from '../lib/painel-auth.js';
import api from './api.js';
import { MODELO } from './modelo.js';
import { LOGO_CLINEX } from './ui/logo.js';
import { base } from './ui/base.js';
import { periodoUi } from './ui/periodo.js';
import { ia } from './ui/ia.js';
import { timeUi } from './ui/time.js';
import { pessoaUi } from './ui/pessoa.js';
import { graficos } from '../ui/graficos.js';
import { graficos2 } from '../ui/graficos2.js';
import { graficos3 } from '../ui/graficos3.js';
import { graficos4 } from '../ui/graficos4.js';
import { fluxo } from './ui/fluxo.js';
import { etapa } from './ui/etapa.js';
import { pipeline } from './ui/pipeline.js';
import { funis } from './ui/funis.js';
import { funis2 } from './ui/funis2.js';
import { funis3 } from './ui/funis3.js';
import { telas } from './ui/telas.js';
import { hoje } from './ui/hoje.js';
import { analises } from './ui/analises.js';
import { executivo } from './ui/executivo.js';
import { report } from './ui/report.js';
import { leadUi } from './ui/lead.js';
import { agente } from './ui/agente.js';
import { app } from './ui/app.js';
import { selectModerno } from '../ui/selectModerno.js';
import { dataModerna } from '../ui/dataModerna.js';
import { pagina } from './ui/page.js';

/**
 * CRM (GET /painel/crm): leads, funil, fila do dia, fluxo clicável, calendário D0-D8, mensagens e regras do
 * "Guia de Atendimento do Lead". Independente do agente receptivo: não importa nada de src/panel, src/logs,
 * src/bi nem src/agents. Mesma senha do painel (PAINEL_PASSWORD).
 *   /painel/crm            a tela
 *   /painel/crm/app.js     o JavaScript da tela (o modelo do processo vai embutido)
 *   /painel/crm/api/...    a API (api.ts)
 */
const router = Router();
router.use(painelAuth, exigirModulo('crm'));

const CSP = "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const clientJs = `(function () {\n'use strict';\nvar M = ${JSON.stringify(MODELO)};\n${base}\n${periodoUi}\n${graficos}\n${graficos2}\n${graficos3}\n${graficos4}\n${fluxo}\n${etapa}\n${pipeline}\n${funis}\n${funis2}\n${funis3}\n${telas}\n${hoje}\n${analises}\n${executivo}\n${timeUi}\n${pessoaUi}\n${report}\n${ia}\n${leadUi}\n${agente}\n${selectModerno}\n${dataModerna}\n${app}\n})();`;

router.use('/api', exigirEscrita, api);

router.get('/', (_req, res) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.type('text/html; charset=utf-8').send(pagina);
});
router.get('/app.js', (_req, res) => res.type('application/javascript; charset=utf-8').send(clientJs));
router.get('/logo.jpg', (_req, res) => res.type('image/jpeg').set('Cache-Control', 'public, max-age=86400').send(LOGO_CLINEX));

export default router;
