import { Router, type Request } from 'express';
import { exigirEscrita, exigirModulo, painelAuth } from '../lib/painel-auth.js';
import { sbFaltantes, supabaseConfigurado } from '../lib/supabase.js';
import { DS_CSP } from '../ui/ds.js';
import { codigoValido, gerarCodigo, listarCampanhas, MENSAGEM_PADRAO, novaId, NUMERO_WHATSAPP, salvarCampanha, SITE_PADRAO, T_CAMPANHAS, T_EVENTOS, textoWhats, type Campanha, type Canal, type StatusCampanha } from './campanhas.js';
import { montarFunil } from './funil.js';
import { funilClienteJs, paginaFunil } from './ui.js';

/**
 * Painel > Agente receptivo > Funil de aquisição (/painel/receptivo/funil).
 *   /              a tela              /app.js        o comportamento
 *   /dados.json    campanhas + funil   POST /campanhas, PUT /campanhas/:id
 */
const router = Router();
router.use(painelAuth, exigirModulo('agente'), exigirEscrita);

const base = (req: Request) => `${String(req.headers['x-forwarded-proto'] ?? req.protocol).split(',')[0]}://${req.headers['x-forwarded-host'] ?? req.get('host')}`;

router.get('/', (_req, res) => {
  res.setHeader('Content-Security-Policy', DS_CSP);
  res.type('text/html; charset=utf-8').send(paginaFunil);
});
router.get('/app.js', (_req, res) => res.type('application/javascript; charset=utf-8').send(funilClienteJs));

router.get('/dados.json', async (req, res) => {
  const config = { base: base(req), numeroWhatsApp: NUMERO_WHATSAPP, site: SITE_PADRAO, mensagemPadrao: MENSAGEM_PADRAO };
  if (!supabaseConfigurado()) return res.json({ config, aviso: 'semBanco', campanhas: [] });
  try {
    const faltam = await sbFaltantes([T_CAMPANHAS, T_EVENTOS]);
    if (faltam.length) return res.json({ config, aviso: 'semTabelas', faltam, campanhas: [] });
    const r = await montarFunil();
    res.json({
      config, clinilink: r.clinilink,
      campanhas: r.campanhas.map((x) => ({ ...x, links: {
        site: `${config.base}/c/${x.campanha.codigo}?d=site`,
        whatsapp: `${config.base}/c/${x.campanha.codigo}?d=wa`,
        mensagemAnuncio: textoWhats(x.campanha),
      } })),
    });
  } catch (e) {
    console.error('[aquisicao] falha ao montar o funil:', (e as Error).message);
    res.status(500).json({ erro: 'funil', mensagem: `Não consegui montar o funil: ${(e as Error).message}` });
  }
});

const CANAIS: Canal[] = ['meta', 'google', 'tiktok', 'outro'];
const STATUS: StatusCampanha[] = ['ativa', 'pausada', 'encerrada'];
const DIA = /^\d{4}-\d{2}-\d{2}$/;
const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Belem' }).format(new Date());

/** Valida o corpo (criar ou editar). Devolve a campanha pronta ou a mensagem de erro. */
function validar(b: Record<string, unknown>, atual: Campanha | undefined, todas: Campanha[], quem: string): Campanha | string {
  const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  // aceita 1500.5 (campo numérico) e 1.500,50 (digitado à brasileira)
  const num = (v: unknown) => { if (v === '' || v === null || v === undefined) return undefined; const s = String(v).trim(); return Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s); };
  const nome = b.nome !== undefined ? txt(b.nome, 60) : atual?.nome ?? '';
  if (nome.length < 2) return 'Dê um nome à campanha.';
  const canal = (b.canal !== undefined ? b.canal : atual?.canal ?? 'meta') as Canal;
  if (!CANAIS.includes(canal)) return 'Canal inválido.';
  const status = (b.status !== undefined ? b.status : atual?.status ?? 'ativa') as StatusCampanha;
  if (!STATUS.includes(status)) return 'Situação inválida.';
  let codigo = b.codigo !== undefined && String(b.codigo).trim() ? txt(b.codigo, 12).toUpperCase() : atual?.codigo ?? gerarCodigo(nome, todas.map((c) => c.codigo));
  if (!codigoValido(codigo)) return 'O código precisa ter de 3 a 12 letras ou números, sem espaço.';
  if (todas.some((c) => c.codigo === codigo && c.id !== atual?.id)) return `Já existe uma campanha com o código ${codigo}.`;
  if (atual && atual.codigo !== codigo) codigo = atual.codigo; // o código vai nos anúncios já publicados: não muda depois de criado
  const inicio = b.inicio !== undefined ? txt(b.inicio, 10) : atual?.inicio ?? hoje();
  if (!DIA.test(inicio)) return 'Informe a data de início.';
  const fim = b.fim !== undefined ? txt(b.fim, 10) || undefined : atual?.fim;
  if (fim && (!DIA.test(fim) || fim < inicio)) return 'A data de fim precisa ser depois do início.';
  const investimento = b.investimento !== undefined ? num(b.investimento) : atual?.investimento;
  if (investimento !== undefined && (!Number.isFinite(investimento) || investimento < 0)) return 'Investimento inválido.';
  const cliquesInformados = b.cliquesInformados !== undefined ? num(b.cliquesInformados) : atual?.cliquesInformados;
  if (cliquesInformados !== undefined && (!Number.isInteger(cliquesInformados) || cliquesInformados < 0)) return 'Cliques informados precisa ser um número inteiro.';
  const urlSite = b.urlSite !== undefined ? txt(b.urlSite, 300) || undefined : atual?.urlSite;
  if (urlSite) { try { const u = new URL(urlSite); if (!/^https?:$/.test(u.protocol)) throw new Error(); } catch { return 'A página do site precisa ser um endereço completo (https://...).'; } }
  const mensagem = b.mensagem !== undefined ? txt(b.mensagem, 200) || undefined : atual?.mensagem;
  const frases = b.frases !== undefined ? (Array.isArray(b.frases) ? b.frases : String(b.frases ?? '').split('\n')).map((f) => String(f).trim().slice(0, 120)).filter((f) => f.length >= 12).slice(0, 5) : atual?.frases;
  const observacao = b.observacao !== undefined ? txt(b.observacao, 500) || undefined : atual?.observacao;
  return { id: atual?.id ?? novaId(), nome, codigo, canal, status, inicio, fim, investimento, cliquesInformados, urlSite, mensagem, frases, observacao, criadoEm: atual?.criadoEm ?? new Date().toISOString(), criadoPor: atual?.criadoPor ?? quem };
}

router.post('/campanhas', async (req, res) => {
  try {
    const todas = await listarCampanhas(true);
    const c = validar((req.body ?? {}) as Record<string, unknown>, undefined, todas, req.sessao?.nome ?? 'painel');
    if (typeof c === 'string') return res.status(400).json({ erro: 'campo', mensagem: c });
    await salvarCampanha(c);
    res.status(201).json({ ok: true, campanha: c });
  } catch (e) { res.status(500).json({ erro: 'gravar', mensagem: `Não consegui salvar: ${(e as Error).message}` }); }
});

router.put('/campanhas/:id', async (req, res) => {
  try {
    const todas = await listarCampanhas(true);
    const atual = todas.find((c) => c.id === req.params.id);
    if (!atual) return res.status(404).json({ erro: 'nao_encontrada', mensagem: 'Campanha não encontrada.' });
    const c = validar((req.body ?? {}) as Record<string, unknown>, atual, todas, req.sessao?.nome ?? 'painel');
    if (typeof c === 'string') return res.status(400).json({ erro: 'campo', mensagem: c });
    await salvarCampanha(c);
    res.json({ ok: true, campanha: c });
  } catch (e) { res.status(500).json({ erro: 'gravar', mensagem: `Não consegui salvar: ${(e as Error).message}` }); }
});

export default router;
