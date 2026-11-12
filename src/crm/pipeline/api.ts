import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { estado, salvar } from '../banco.js';
import { clinilinkConfigurado } from '../clinilink.js';
import { aplicarAutomacoes, atrasado, diaBRT, diasNaEtapa, diffDia, estrelas, funisPadrao, moverCard, recortar, somaDia, validarAutomacoes, validarConfig, valorExibido, visiveis, type FiltroPor, type Recorte } from './regras.js';
import { sincronizar } from './ingestao.js';
import { leadsDosOrcamentos } from '../leadsOrcamento.js';
import { alinharCardsELeads } from '../sincroniaCardLead.js';
import { logMovimentacoes, painelExecutivo, relatorio } from './metricas.js';
import { janelaDaQuery } from '../periodo.js';
import { FunilError, type Atribuicao, type Dimensao, type Funil } from './tipos.js';
import { responsaveis } from '../../lib/usuarios.js';

/**
 * API dos funis (montada em /painel/crm/api/pipelines). Segue o documento "pipelines-crm-tecnico".
 * Erros de regra viram 422 {erro, mensagem} (tratados no router do CRM).
 */
export const pipelines = Router();
const P = () => estado.pipelines;
const achar = (id: string) => { const f = P().funis.find((x) => x.id === id); if (!f) throw new FunilError('funil', 'Funil não encontrado.'); return f; };
const atrib = (funilId: string, cardId: string) => { const a = P().atribuicoes.find((x) => x.funilId === funilId && x.cardId === cardId); if (!a) throw new FunilError('card', 'Card não encontrado neste funil.'); return a; };
const txt = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

// ------------------------------------------------------------------------------------------------ rotina e automações (servidor)

let sincronizando = false;
export async function rodarSincronizacao(pedido?: unknown) {
  if (sincronizando) throw new FunilError('ocupado', 'Já existe uma sincronização em andamento.');
  sincronizando = true;
  try { const agora = new Date(); const r = await sincronizar(P(), agora, pedido); leadsDosOrcamentos(estado, agora); alinharCardsELeads(estado, agora); salvar(); return r; } finally { sincronizando = false; }
}
export function rodarAutomacoesDosFunis(agora: Date) {
  let n = 0;
  for (const f of P().funis) n += aplicarAutomacoes(f, P().atribuicoes, agora);
  if (n) salvar();
  return n;
}
/** 03:00 de Brasília: roda uma vez por dia (e na subida, se ainda não rodou hoje). Desligue com CRM_ROTINA=false. */
function tique() {
  const agora = new Date();
  try { rodarAutomacoesDosFunis(agora); } catch (e) { console.error('[crm] automações dos funis falharam:', (e as Error).message); }
  const hora = new Date(agora.getTime() - 3 * 3_600_000).getUTCHours();
  if (hora >= 3 && P().rotina.ultimoDia !== diaBRT(agora) && clinilinkConfigurado() && !sincronizando) {
    rodarSincronizacao().then((r) => console.log(`[crm] rotina Clinilink: orçamentos +${r.orcamentos?.criados ?? 0}, no-show +${r.agendamentos?.criados ?? 0}${r.erros.length ? ` (erros: ${r.erros.join(' | ')})` : ''}`)).catch((e) => console.error('[crm] rotina Clinilink falhou:', (e as Error).message));
  }
}
// Na Vercel a rotina é do Cron (/cron/crm): um relógio por instância sincronizava antes de a instância ler o banco.
if (process.env.CRM_ROTINA !== 'false' && !process.env.VERCEL) setInterval(tique, 60_000).unref();

// ------------------------------------------------------------------------------------------------ funis

const resumoFunil = (f: Funil) => {
  const cards = visiveis(f, P().atribuicoes);
  return { ...f, total: cards.length };
};

pipelines.get('/', (_req, res) => {
  // ordem estável (o banco devolve por id): Orçamentos, No-show, Leads e, dentro do tipo, do mais antigo ao mais novo
  const ordemTipo = { orcamento: 0, agendamento: 1, lead: 2 };
  const ordenados = [...P().funis].sort((x, y) => ordemTipo[x.dimensao] - ordemTipo[y.dimensao] || x.criadoEm.localeCompare(y.criadoEm) || x.nome.localeCompare(y.nome));
  res.json({ funis: ordenados.map(resumoFunil), rotina: P().rotina, clinilink: clinilinkConfigurado(), atendentes: responsaveis(estado.atendentes) });
});

pipelines.post('/', (req, res) => {
  const b = req.body ?? {};
  const nome = txt(b.nome, 80); if (!nome) throw new FunilError('config', 'Dê um nome ao funil.');
  const dimensao = b.dimensao as Dimensao; if (!['orcamento', 'agendamento', 'lead'].includes(dimensao)) throw new FunilError('config', 'Escolha a dimensão do funil.');
  const modelo = funisPadrao(new Date()).find((f) => f.dimensao === dimensao)!;
  const stages = validarConfig({ ...modelo, stages: [] }, Array.isArray(b.stages) && b.stages.length ? b.stages : modelo.stages, [], {}).stages;
  const f: Funil = { ...modelo, id: randomUUID(), nome, stages, automacoes: [], oculto: false, criadoEm: new Date().toISOString() };
  P().funis.push(f); salvar(); res.status(201).json(resumoFunil(f));
});

/** Configuração (colunas, automações, filtros). Excluir coluna com cards exige destino; os cards vão por `destinos`. */
pipelines.put('/:id', (req, res) => {
  const f = achar(req.params.id); const b = req.body ?? {};
  const agora = new Date();
  const { stages, mover } = Array.isArray(b.stages) ? validarConfig(f, b.stages, P().atribuicoes, b.destinos ?? {}) : { stages: f.stages, mover: [] as [string, string][] };
  const automacoes = b.automacoes !== undefined ? validarAutomacoes(b.automacoes, stages) : f.automacoes.filter((r) => stages.some((s) => s.id === r.deStageId) && stages.some((s) => s.id === r.paraStageId));
  for (const [de, para] of mover) for (const a of P().atribuicoes) if (a.funilId === f.id && a.stageId === de) moverCard(a, { ...f, stages }, para, agora, { manual: true, por: txt(b.por, 60) || undefined });
  if (b.nome !== undefined) { const n = txt(b.nome, 80); if (!n) throw new FunilError('config', 'O funil precisa de um nome.'); f.nome = n; }
  if (b.oculto !== undefined) f.oculto = !!b.oculto;
  if (b.unidadeId !== undefined) f.unidadeId = txt(b.unidadeId, 60) || null;
  if (Array.isArray(b.valorEstrela)) { const c = b.valorEstrela.map(Number); if (c.length !== 4 || c.some((x: number) => !Number.isFinite(x) || x < 0) || c.some((x: number, i: number) => i && x < c[i - 1])) throw new FunilError('config', 'Estrelas: informe 4 valores crescentes.'); f.valorEstrela = c; }
  const saiu = f.stages.filter((s) => !stages.some((n) => n.id === s.id));
  if (saiu.length) f.removidas = [...(f.removidas ?? []).filter((r) => !saiu.some((s) => s.id === r.id)), ...saiu];
  f.stages = stages; f.automacoes = automacoes;
  salvar(); res.json(resumoFunil(f));
});

// ------------------------------------------------------------------------------------------------ cards

const dto = (a: Atribuicao, f: Funil, agora: Date) => {
  const x = P().extras[a.cardId];
  const v = valorExibido(a, x);
  return {
    cardId: a.cardId, stageId: a.stageId, enteredAt: a.enteredAt, manual: a.manual, caseStatus: a.caseStatus, diasNaEtapa: diasNaEtapa(a, agora), atrasado: atrasado(a, f, agora),
    snap: a.ultimoSnapshot, valor: v, valorNegociado: x?.valorNegociado ?? null, estrelas: estrelas(v, f.valorEstrela), responsavel: x?.responsavel ?? null, proximoContato: x?.proximoContato ?? null, nMov: a.historico.length - 1,
  };
};

pipelines.get('/:id/cards', (req, res) => {
  const f = achar(req.params.id); const agora = new Date();
  const q = req.query as Record<string, string | undefined>;
  const por = (['criacao', 'agendamento', 'conversao'].includes(q.por ?? '') ? q.por : 'criacao') as FiltroPor;
  const modo = (q.modo === 'v1' ? 'v1' : 'v2') as Recorte;
  let lista = recortar(f, visiveis(f, P().atribuicoes), { de: /^\d{4}-\d{2}-\d{2}$/.test(q.de ?? '') ? q.de : undefined, ate: /^\d{4}-\d{2}-\d{2}$/.test(q.ate ?? '') ? q.ate : undefined, por }, modo);
  if (q.unidade) lista = lista.filter((a) => (a.ultimoSnapshot.unidade ?? '') === q.unidade);
  if (q.responsavel) lista = lista.filter((a) => (P().extras[a.cardId]?.responsavel ?? '') === q.responsavel);
  if (q.q) {
    const t = q.q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    lista = lista.filter((a) => { const s = a.ultimoSnapshot; const x = P().extras[a.cardId]; return [s.paciente, s.contato, s.codigo, s.itens.join(' '), s.observacao, x?.observacoesCrm, String(valorExibido(a, x))].join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(t); });
  }
  const cards = lista.map((a) => dto(a, f, agora));
  const unidades = [...new Set(visiveis(f, P().atribuicoes).map((a) => a.ultimoSnapshot.unidade).filter(Boolean))].sort();
  const responsaveis = [...new Set(Object.values(P().extras).map((x) => x.responsavel).filter(Boolean))].sort();
  res.json({ funil: resumoFunil(f), cards, unidades, responsaveis, total: visiveis(f, P().atribuicoes).length });
});

pipelines.post('/:id/cards/:cardId/mover', (req, res) => {
  const f = achar(req.params.id); const a = atrib(f.id, req.params.cardId);
  moverCard(a, f, String(req.body?.stageId ?? ''), new Date(), { por: txt(req.body?.por, 60) || undefined, manual: true });
  alinharCardsELeads(estado, new Date()); // o lead desse orçamento acompanha o card
  salvar(); res.json(dto(a, f, new Date()));
});
pipelines.post('/:id/cards/:cardId/remover', (req, res) => {
  const f = achar(req.params.id); const a = atrib(f.id, req.params.cardId);
  a.caseStatus = 'removido'; a.historico.push({ stageId: a.stageId, em: new Date().toISOString(), manual: true, por: txt(req.body?.por, 60) || undefined });
  salvar(); res.json({ ok: true });
});
/** A tela só cria cards no funil de leads; Orçamento e No-show só recebem cards pela rotina. */
pipelines.post('/:id/cards', (req, res) => {
  const f = achar(req.params.id);
  if (f.dimensao !== 'lead') throw new FunilError('rotina', 'Neste funil os cards só chegam pela rotina diária do Clinilink.');
  const b = req.body ?? {}; const paciente = txt(b.paciente, 120); if (!paciente) throw new FunilError('dados', 'Informe o nome.');
  const agora = new Date(); const valor = Number(b.valor ?? 0);
  const snap = { id: randomUUID(), paciente, contato: txt(b.contato, 30) || undefined, valor: Number.isFinite(valor) && valor >= 0 ? valor : 0, itens: Array.isArray(b.itens) ? b.itens.map((i: unknown) => txt(i, 80)).filter(Boolean) : [], criadoEm: agora.toISOString(), unidade: txt(b.unidade, 60) || undefined, status: 'novo_lead', observacao: txt(b.observacao, 500) || undefined };
  const a: Atribuicao = { funilId: f.id, cardId: snap.id, stageId: f.stages[0].id, enteredAt: agora.toISOString(), manual: true, historico: [{ stageId: f.stages[0].id, em: agora.toISOString(), manual: true, por: txt(b.por, 60) || undefined }], originSnapshot: snap, ultimoSnapshot: snap, originStatus: snap.status, caseStatus: 'aberto' };
  P().atribuicoes.push(a); salvar(); res.status(201).json(dto(a, f, agora));
});

// ------------------------------------------------------------------------------------------------ detalhe do card (extras, follow-ups, contatos)

pipelines.get('/card/:cardId', (req, res) => {
  const id = req.params.cardId;
  const atribs = P().atribuicoes.filter((a) => a.cardId === id);
  if (!atribs.length) throw new FunilError('card', 'Card não encontrado.');
  const agora = new Date();
  res.json({
    atribuicoes: atribs.map((a) => { const f = P().funis.find((x) => x.id === a.funilId)!; return { funilId: f.id, funil: f.nome, stages: f.stages, removidas: f.removidas ?? [], ...dto(a, f, agora), historico: a.historico.map((m) => ({ ...m, stageId: m.stageId ?? m.para })), originSnapshot: a.originSnapshot }; }),
    extras: P().extras[id] ?? {}, followups: P().followups.filter((x) => x.cardId === id).sort((a, b) => (b.data + (b.hora ?? '')).localeCompare(a.data + (a.hora ?? ''))),
    contatos: P().contatos.filter((x) => x.cardId === id).sort((a, b) => b.data.localeCompare(a.data)),
  });
});

pipelines.put('/extras/:cardId', (req, res) => {
  const id = req.params.cardId; if (!P().atribuicoes.some((a) => a.cardId === id)) throw new FunilError('card', 'Card não encontrado.');
  const b = req.body ?? {}; const x = P().extras[id] ?? {}; const por = txt(b.por, 60) || undefined; const agora = new Date().toISOString();
  if (b.responsavel !== undefined) x.responsavel = txt(b.responsavel, 60) || undefined;
  if (b.observacoesCrm !== undefined) x.observacoesCrm = txt(b.observacoesCrm, 2000) || undefined;
  if (b.proximoContato !== undefined) { if (b.proximoContato && !/^\d{4}-\d{2}-\d{2}$/.test(b.proximoContato)) throw new FunilError('dados', 'Data do próximo contato inválida.'); x.proximoContato = b.proximoContato || undefined; }
  if (b.valorNegociado !== undefined) {
    const v = b.valorNegociado === null || b.valorNegociado === '' ? undefined : Number(b.valorNegociado);
    if (v !== undefined && (!Number.isFinite(v) || v < 0)) throw new FunilError('dados', 'Valor negociado inválido.');
    // autor e data só mudam se o valor mudar (zero é válido)
    if (v !== x.valorNegociado) { x.valorNegociado = v; x.valorNegociadoPor = v === undefined ? undefined : por; x.valorNegociadoEm = v === undefined ? undefined : agora; }
  }
  P().extras[id] = x; salvar(); res.json(x);
});

pipelines.post('/followups/:cardId', (req, res) => {
  const b = req.body ?? {}; const cardId = req.params.cardId;
  if (!P().atribuicoes.some((a) => a.cardId === cardId)) throw new FunilError('card', 'Card não encontrado.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.data ?? '')) throw new FunilError('dados', 'Informe a data do follow-up.');
  const descricao = txt(b.descricao, 500); if (!descricao) throw new FunilError('dados', 'Descreva o follow-up.');
  const f = { id: randomUUID(), cardId, data: b.data, hora: txt(b.hora, 5) || undefined, descricao, resultado: txt(b.resultado, 300) || undefined, proximaData: /^\d{4}-\d{2}-\d{2}$/.test(b.proximaData ?? '') ? b.proximaData : undefined };
  P().followups.push(f); salvar(); res.status(201).json(f);
});
pipelines.delete('/followups/:id', (req, res) => { P().followups = P().followups.filter((x) => x.id !== req.params.id); salvar(); res.json({ ok: true }); });

/** Registro de contato. As regras de ouro do guia valem aqui: confirmar a recepção, 8h-19h e no máximo 2 tentativas por dia. */
const TIPOS_CONTATO = ['Mandou WhatsApp', 'Ligou', 'Respondeu', 'Outro'];
pipelines.post('/contatos/:cardId', (req, res) => {
  const b = req.body ?? {}; const cardId = req.params.cardId; const agora = new Date();
  if (!P().atribuicoes.some((a) => a.cardId === cardId)) throw new FunilError('card', 'Card não encontrado.');
  const tipo = TIPOS_CONTATO.includes(b.tipo) ? b.tipo : null; if (!tipo) throw new FunilError('dados', 'Escolha o tipo de contato.');
  if (tipo === 'Mandou WhatsApp' || tipo === 'Ligou') {
    if (b.naoFoiRecepcao !== true) throw new FunilError('recepcao', 'Antes de cada contato: confirme se o paciente já foi à recepção. Se foi, não entre em contato.');
    const hora = new Date(agora.getTime() - 3 * 3_600_000).getUTCHours();
    if (hora < 8 || hora >= 19) throw new FunilError('janela', 'Contatos só entre 8h e 19h (horário de Belém). Sem exceção.');
    const hoje = diaBRT(agora);
    const feitos = P().contatos.filter((c) => c.cardId === cardId && (c.tipo === 'Mandou WhatsApp' || c.tipo === 'Ligou') && diaBRT(c.data) === hoje).length;
    if (feitos >= 2) throw new FunilError('tentativas', 'Máximo de 2 tentativas por dia já atingido para este paciente.');
  }
  const c = { id: randomUUID(), cardId, data: agora.toISOString(), tipo, observacao: txt(b.observacao, 500) || undefined };
  P().contatos.push(c); salvar(); res.status(201).json(c);
});

// ------------------------------------------------------------------------------------------------ sincronização, log, relatório e painel

pipelines.post('/sincronizar', (req, res, next) => {
  rodarSincronizacao(req.body)
    .then((r) => { const falhou = r.erros.length > 0 && !r.orcamentos && !r.agendamentos; res.status(falhou ? 502 : 200).json({ ...r, ...(falhou ? { erro: 'clinilink', mensagem: String(r.erros[0]) } : {}), rotina: P().rotina }); })
    .catch(next); // Express 4 não captura rejeição de rota assíncrona
});

const janela = (q: Record<string, unknown>) => {
  const hoje = diaBRT(new Date());
  const ok = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
  const ate = ok(q.ate) ? q.ate : hoje; const de = ok(q.de) ? q.de : somaDia(ate, -29);
  if (de > ate) throw new FunilError('janela', 'A data inicial é depois da final.');
  if (diffDia(de, ate) > 400) throw new FunilError('janela', 'Período grande demais (máximo 400 dias).');
  return { de, ate };
};
const funisDoPedido = (id: unknown) => (typeof id === 'string' && id ? [achar(id)] : P().funis);

pipelines.get('/relatorio/dados', (req, res) => { const { de, ate } = janela(req.query); res.json(relatorio(P(), funisDoPedido(req.query.funilId), de, ate)); });
pipelines.get('/log/dados', (req, res) => { const { de, ate } = janela(req.query); res.json(logMovimentacoes(P(), funisDoPedido(req.query.funilId), de, ate)); });
pipelines.get('/:id/executivo', (req, res) => {
  res.json(painelExecutivo(P(), achar(req.params.id), janelaDaQuery(req.query, new Date()), new Date()));
});

