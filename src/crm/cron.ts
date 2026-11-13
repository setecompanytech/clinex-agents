import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { atualizarLeadsDoBanco, bancoFora, estado, pronto, tentarVoltarAoBanco } from './banco.js';
import { clinilinkConfigurado } from './clinilink.js';
import { esvaziar } from './persistencia.js';
import { rodarAgora } from './disparo-auto-servico.js';
import { rodarAutomacoesDosFunis, rodarSincronizacao } from './pipeline/api.js';

/**
 * Rotina diária do CRM para a Vercel (Vercel Cron, ver vercel.json). Em serverless não há processo ligado às 03:00,
 * então a Vercel chama esta rota com "Authorization: Bearer <CRON_SECRET>". Sem CRON_SECRET a rota fica fechada.
 * Espera a gravação no Supabase terminar antes de responder: depois da resposta a função pode ser congelada.
 */
export const cron = Router();

const igual = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/**
 * GET /cron/disparo: uma rodada da IA de disparo (Bearer CRON_SECRET, o mesmo da rotina do Clinilink). Quem chama define de
 * quanto em quanto tempo (Vercel Cron, GitHub Actions, outro agendador): a rodada é segura para repetir, tem trava para nunca
 * haver duas ao mesmo tempo, só envia no horário de contato e passa pelas mesmas travas do envio manual.
 */
cron.get('/disparo', (req, res, next) => {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return void res.status(503).json({ erro: 'cron', mensagem: 'CRON_SECRET não está configurado.' });
  if (!igual(String(req.headers.authorization ?? ''), `Bearer ${segredo}`)) return void res.status(401).json({ erro: 'auth' });
  rodarAgora().then((r) => {
    if (r.rodada) console.log(`[disparo-auto] modo ${r.rodada.modo}: enviados ${r.rodada.enviados}, sombra ${r.rodada.sombra}, erros ${r.rodada.erros}, avaliados ${r.rodada.avaliados}`);
    res.json(r);
  }).catch(next);
});

cron.get('/crm', (req, res, next) => {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return void res.status(503).json({ erro: 'cron', mensagem: 'CRON_SECRET não está configurado.' });
  if (!igual(String(req.headers.authorization ?? ''), `Bearer ${segredo}`)) return void res.status(401).json({ erro: 'auth' });
  if (!clinilinkConfigurado()) return void res.status(503).json({ erro: 'clinilink', mensagem: 'CRM_CLINILINK_API_KEY não está configurada.' });
  (async () => {
    await pronto();
    await tentarVoltarAoBanco();
    await atualizarLeadsDoBanco(); // a rotina (e as automações dos funis) parte do que o banco tem agora, não da memória desta instância
    if (bancoFora()) return void res.status(503).json({ erro: 'banco', mensagem: 'O banco não respondeu: a rotina foi adiada para não gravar sobre dados não lidos.' });
    const automacoes = rodarAutomacoesDosFunis(new Date());
    const r = await rodarSincronizacao();
    await esvaziar(estado);
    const falhou = r.erros.length > 0 && !r.orcamentos && !r.agendamentos;
    console.log(`[cron] orçamentos +${r.orcamentos?.criados ?? 0}, no-show +${r.agendamentos?.criados ?? 0}, automações ${automacoes}${r.erros.length ? ` (erros: ${r.erros.join(' | ')})` : ''}`);
    res.status(falhou ? 502 : 200).json({ ...r, automacoes });
  })().catch(next);
});
