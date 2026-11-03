import { Router } from 'express';
import { exigirEscrita, exigirModulo, painelAuth } from '../lib/painel-auth.js';
import { flow } from './flow.js';
import { pageHtml } from './page.js';
import { clientJs } from './client.js';
import { DS_CSP } from '../ui/ds.js';
import { alertasDoAgente, assistenteComIA, responderAssistente, sugestoesDoAssistente } from './assistente.js';

/**
 * Painel somente-leitura do fluxo do agente (GET /painel).
 * Protegido pelo login do painel (conta com o módulo Agente receptivo ou acesso mestre PAINEL_PASSWORD).
 * Não lê banco, não lê dados de pacientes e não expõe nenhuma variável de ambiente.
 */
const router = Router();

router.use(painelAuth, exigirModulo('agente'), exigirEscrita);

// o CSS e o JS do design system vêm do próprio servidor (/painel/ds.css e /painel/ds.js)
const CSP = DS_CSP;

router.get('/', (_req, res) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.type('text/html; charset=utf-8').send(pageHtml);
});

router.get('/app.js', (_req, res) => {
  res.type('application/javascript; charset=utf-8').send(clientJs);
});

/** Assistente flutuante: alertas e perguntas em linguagem natural (também usado pelas telas de BI e Logs). */
router.get('/agente/alertas', (_req, res, next) => {
  alertasDoAgente()
    .then((alertas) => res.json({ titulo: 'Assistente da Amanda', subtitulo: 'Fluxo, números e logs do agente receptivo', ia: assistenteComIA(), sugestoes: sugestoesDoAssistente(), alertas }))
    .catch(next); // Express 4 não captura rejeição de rota assíncrona
});
router.post('/agente', (req, res, next) => {
  const b = (req.body ?? {}) as { pergunta?: unknown; historico?: unknown };
  const pergunta = typeof b.pergunta === 'string' ? b.pergunta.slice(0, 500) : '';
  const historico = (Array.isArray(b.historico) ? b.historico : []).slice(-8)
    .filter((m): m is { papel: 'user' | 'agent'; texto: string } => !!m && typeof m === 'object' && (m.papel === 'user' || m.papel === 'agent') && typeof m.texto === 'string');
  responderAssistente(pergunta, historico).then((r) => res.json(r)).catch(next);
});

router.get('/flow.json', (_req, res) => {
  res.json(flow);
});

export default router;
