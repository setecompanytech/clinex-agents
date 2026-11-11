import { Router } from 'express';
import { painelAuth } from '../lib/painel-auth.js';
import { env } from '../lib/env.js';
import { estado, infoArmazenamento } from '../crm/banco.js';
import { clinilinkConfigurado } from '../crm/clinilink.js';
import { estadoArmazem } from '../bi/armazem.js';
import { supabaseConfigurado } from '../lib/supabase.js';
import { dsCss, dsJs } from '../ui/ds.js';

/**
 * Serve o design system compartilhado (/painel/ds.css e /painel/ds.js, públicos: só CSS e JS de tela, sem dados) e o
 * status do sistema (/painel/status, protegido). A tela inicial e o login ficam em src/geral.
 * Não expõe nenhum segredo: o status só diz se cada integração está configurada ou não.
 */
const router = Router();

router.get('/ds.css', (_req, res) => { res.setHeader('Cache-Control', 'public, max-age=120'); res.type('text/css; charset=utf-8').send(dsCss); });
router.get('/ds.js', (_req, res) => { res.setHeader('Cache-Control', 'public, max-age=120'); res.type('application/javascript; charset=utf-8').send(dsJs); });

router.get('/status', painelAuth, (_req, res) => {
  const arm = infoArmazenamento();
  const bi = estadoArmazem();
  const pl = estado.pipelines;
  const agora = Date.now();
  // cards fora da cadência: dias na coluna maior que a cadência (conta simples, sem trazer as regras para o hub)
  let fora = 0;
  for (const a of pl.atribuicoes) {
    if (a.caseStatus !== 'aberto') continue;
    const f = pl.funis.find((x) => x.id === a.funilId); const e = f?.stages.find((s) => s.id === a.stageId);
    if (e?.cadenciaDias && !/convert|perd|descart|sem retorno|recuper|agendad/i.test(e.label) && (agora - Date.parse(a.enteredAt)) / 86_400_000 > e.cadenciaDias) fora++;
  }
  res.json({
    crm: { cards: pl.atribuicoes.filter((a) => a.caseStatus !== 'removido').length, leads: estado.leads.length, foraDaCadencia: fora },
    agente: { modo: env.mode === 'claude' ? 'Claude' : 'Roteiro', eventos: bi.eventosEmMemoria, resposta: env.autoReply ? 'automática' : 'só sombra' },
    sistema: [
      { nome: 'Banco de dados', ok: arm.destino === 'supabase' && !arm.erro, aviso: arm.destino !== 'supabase', detalhe: arm.destino === 'supabase' ? 'Supabase' : arm.destino === 'arquivo' ? 'arquivo local' : 'memória' },
      { nome: 'Clinilink (leitura)', ok: clinilinkConfigurado(), detalhe: clinilinkConfigurado() ? 'conectado' : 'sem chave' },
      { nome: 'WhatsApp', ok: Boolean(env.inovstarToken), detalhe: env.inovstarToken ? 'conectado' : 'sem token' },
      { nome: 'Amanda', ok: env.autoReply, aviso: !env.autoReply, detalhe: env.autoReply ? 'respondendo' : 'modo sombra (não envia)' },
      { nome: 'IA', ok: Boolean(env.anthropicKey || env.openaiKey), aviso: !(env.anthropicKey || env.openaiKey), detalhe: env.anthropicKey ? 'Claude' : env.openaiKey ? 'GPT (tom)' : 'sem chave' },
      { nome: 'Supabase', ok: supabaseConfigurado(), aviso: !supabaseConfigurado(), detalhe: supabaseConfigurado() ? 'configurado' : 'não configurado' },
    ],
  });
});

// endereços antigos (antes de existir a tela inicial)
router.get('/logs', painelAuth, (_req, res) => res.redirect(301, '/painel/receptivo/logs'));

export default router;
