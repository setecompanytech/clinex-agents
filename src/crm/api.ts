import { Router, json } from 'express';
import { estado, infoArmazenamento, pronto, salvar } from './banco.js';
import { aplicar, automatizar, criarLead, hojeDe, RegraError, resumo, soDigitos, tarefasDoDia, vistaDoLead, type Acao, type Lead, type NovoLead } from './motor.js';
import { gerarExemplos } from './exemplos.js';
import { leadsDosOrcamentos } from './leadsOrcamento.js';
import { DisparoError, enviarModelo, MODELOS as MODELOS_WA, modelosParaLead, statusDisparo } from './whatsapp.js';
import { analisarHoje } from './analise.js';
import { analisarTempo, type Periodo } from './tempo.js';
import { analisarExecutivo, meuReport } from './executivo.js';
import { analisarEtapa } from './etapa.js';
import { analisarNoShow, dadosNoShow } from './noshow.js';
import { pipelines } from './pipeline/api.js';
import { atrasado as cardAtrasado, valorExibido as valorDoCard, visiveis as cardsVisiveis } from './pipeline/regras.js';
import { FunilError } from './pipeline/tipos.js';
import { cfgDeRegras, logDoGuia, MODELOS, regrasPadrao, rodarRegras, simular, validarRegra, type Regra } from './automacoes.js';
import { MOTIVOS_DESCARTE } from './modelo.js';
import { responsaveis } from '../lib/usuarios.js';
import { agenteComIA, alertasDoAgente, responderAgente } from './agente.js';

/**
 * API do CRM (JSON), montada em /painel/crm/api. Toda regra do guia mora no motor; aqui só entra, valida e salva.
 * Mesma senha do painel (o roteador pai já exige PAINEL_PASSWORD).
 */
const router = Router();
router.use(json({ limit: '2mb' }));
router.use(async (_req, _res, next) => { await pronto(); next(); });

const achar = (id: string) => estado.leads.find((l) => l.id === id);

/** Aplica o que o guia faz sozinho com o tempo em todos os leads. */
function automatizarTodos(agora: Date) {
  let mudou = 0;
  const antes = new Map(estado.leads.map((l) => [l.id, l.status as string]));
  const cfg = cfgDeRegras(estado.automacoes);
  for (const l of estado.leads) mudou += automatizar(l, agora, cfg);
  const log = [...logDoGuia(antes, estado.leads, estado.automacoes, agora), ...rodarRegras(estado.leads, estado.automacoes, agora)];
  if (log.length) { estado.logAuto = [...log.reverse(), ...estado.logAuto].slice(0, 300); mudou += log.length; }
  if (mudou) salvar();
  return mudou;
}
setInterval(() => { try { automatizarTodos(new Date()); } catch (e) { console.error('[crm] automação falhou:', (e as Error).message); } }, 10 * 60_000).unref();

const resumoDoLead = (l: Lead, agora: Date) => {
  const { eventos, ...resto } = l;
  const ultimo = eventos[eventos.length - 1];
  const contatos = eventos.filter((e) => e.tipo === 'contato');
  return { ...resto, v: vistaDoLead(l, agora), nContatos: contatos.length, ultimoContato: contatos.at(-1)?.quando, ultimo: ultimo ? { quando: ultimo.quando, texto: ultimo.texto, tipo: ultimo.tipo } : undefined };
};

router.get('/estado', (_req, res) => {
  const agora = new Date();
  if (leadsDosOrcamentos(estado, agora).criados) salvar(); // orçamentos do Clinilink ainda sem lead (inclusive os que já estavam nos funis)
  automatizarTodos(agora);
  const leads = estado.leads.map((l) => resumoDoLead(l, agora));
  const tarefas = tarefasDoDia(estado.leads, agora);
  const vistas = new Map(leads.map((l) => [l.id, l.v]));
  const contagens: Record<string, number> = {};
  for (const l of leads) contagens[l.v.item] = (contagens[l.v.item] ?? 0) + 1;
  res.json({
    agora: agora.toISOString(), hoje: hojeDe(agora), atendentes: responsaveis(estado.atendentes), armazenamento: infoArmazenamento(),
    leads, tarefas, contagens, resumo: resumo(estado.leads, agora), analise: analisarHoje(estado.leads, agora, tarefas, vistas),
  });
});

router.get('/analise', (req, res) => {
  const dias = Number(req.query.dias);
  const periodo = (dias === 14 || dias === 90 ? dias : 30) as Periodo;
  const agora = new Date();
  automatizarTodos(agora);
  const tarefas = tarefasDoDia(estado.leads, agora);
  const vistas = new Map(estado.leads.map((l) => [l.id, vistaDoLead(l, agora)]));
  res.json(analisarTempo(estado.leads, agora, periodo, tarefas, vistas));
});

/** Visão executiva (receita, previsão, alertas, fila de decisão, no-show, envelhecimento, unidades...) */
router.get('/executivo', (req, res) => {
  const dias = Number(req.query.dias);
  const periodo = (dias === 14 || dias === 90 ? dias : 30) as Periodo;
  const unidade = typeof req.query.unidade === 'string' && req.query.unidade ? req.query.unidade : null;
  const agora = new Date();
  automatizarTodos(agora);
  const tarefas = tarefasDoDia(estado.leads, agora);
  const vistas = new Map(estado.leads.map((l) => [l.id, vistaDoLead(l, agora)]));
  res.json(analisarExecutivo(estado.leads, agora, periodo, unidade, tarefas, vistas));
});

/** Meu Report: performance individual de um responsável, pronta para a diretoria */
router.get('/meu-report', (req, res) => {
  const dias = Number(req.query.dias);
  const periodo = (dias === 14 || dias === 90 ? dias : 30) as Periodo;
  const nome = typeof req.query.nome === 'string' && req.query.nome ? req.query.nome : 'Sem responsável';
  const agora = new Date();
  automatizarTodos(agora);
  const tarefas = tarefasDoDia(estado.leads, agora);
  const vistas = new Map(estado.leads.map((l) => [l.id, vistaDoLead(l, agora)]));
  res.json(meuReport(estado.leads, agora, periodo, nome, tarefas, vistas));
});

/** Automações do pipeline: ver, criar, editar, simular e executar */
const dadosAutomacoes = (agora: Date) => ({
  regras: estado.automacoes.map((r) => ({ ...r, pendentes: r.builtin || !r.ativa ? null : simular(estado.leads, r, agora).total })),
  log: estado.logAuto.slice(0, 80), modelos: MODELOS, motivos: MOTIVOS_DESCARTE,
  atendentes: responsaveis(estado.atendentes), unidades: [...new Set(estado.leads.map((l) => l.unidade).filter(Boolean))].sort(),
});
router.get('/automacoes', (_req, res) => { const agora = new Date(); automatizarTodos(agora); res.json(dadosAutomacoes(agora)); });
router.post('/automacoes/simular', (req, res) => {
  const base = validarRegra({ nome: 'simulação', ...(req.body ?? {}) });
  const r: Regra = { id: '__sim', criadaEm: '', execucoes: 0, ...base };
  res.json(simular(estado.leads, r, new Date()));
});
router.post('/automacoes/executar', (_req, res) => { const n = automatizarTodos(new Date()); res.json({ alteracoes: n, ...dadosAutomacoes(new Date()) }); });
router.post('/automacoes', (req, res) => {
  const base = validarRegra(req.body);
  if (estado.automacoes.filter((r) => !r.builtin).length >= 40) throw new RegraError('limite', 'Limite de 40 automações criadas.');
  const r: Regra = { id: Math.random().toString(36).slice(2, 10), criadaEm: new Date().toISOString(), execucoes: 0, ...base };
  estado.automacoes.push(r); salvar(); res.status(201).json(r);
});
router.put('/automacoes/:id', (req, res) => {
  const r = estado.automacoes.find((x) => x.id === req.params.id);
  if (!r) { res.status(404).json({ erro: 'automacao', mensagem: 'Automação não encontrada.' }); return; }
  Object.assign(r, validarRegra(req.body, r)); salvar(); res.json(r);
});
router.post('/automacoes/:id/restaurar', (req, res) => {
  const i = estado.automacoes.findIndex((x) => x.id === req.params.id && x.builtin);
  if (i < 0) { res.status(404).json({ erro: 'automacao', mensagem: 'Só as automações do guia podem ser restauradas.' }); return; }
  const padrao = regrasPadrao(new Date()).find((p) => p.id === req.params.id)!;
  estado.automacoes[i] = { ...padrao, execucoes: estado.automacoes[i].execucoes, ultima: estado.automacoes[i].ultima, criadaEm: estado.automacoes[i].criadaEm };
  salvar(); res.json(estado.automacoes[i]);
});
router.delete('/automacoes/:id', (req, res) => {
  const r = estado.automacoes.find((x) => x.id === req.params.id);
  if (!r) { res.status(404).json({ erro: 'automacao', mensagem: 'Automação não encontrada.' }); return; }
  if (r.builtin) throw new RegraError('guia', 'As automações do guia não podem ser excluídas; desligue se não quiser usar.');
  estado.automacoes = estado.automacoes.filter((x) => x.id !== r.id); salvar(); res.json({ ok: true });
});

router.use('/pipelines', pipelines);

/** Fluxo do No-show: quantos cards há em cada etapa agora (números do mapa) e quem são */
router.get('/noshow', (_req, res) => { res.json(dadosNoShow(estado.pipelines, new Date())); });

/** Análise de uma etapa do fluxo (modal do card clicado) */
router.get('/etapa/:id', (req, res) => {
  const dias = Number(req.query.dias);
  const periodo = (dias === 14 || dias === 90 ? dias : 30) as Periodo;
  const agora = new Date();
  if (req.params.id.startsWith('ns-')) { // etapas do fluxo do No-show: vêm dos cards do funil
    const n = analisarNoShow(estado.pipelines, agora, req.params.id, periodo);
    if (!n) { res.status(404).json({ erro: 'etapa', mensagem: 'Etapa desconhecida ou funil No-show não encontrado.' }); return; }
    res.json(n); return;
  }
  automatizarTodos(agora);
  const vistas = new Map(estado.leads.map((l) => [l.id, vistaDoLead(l, agora)]));
  const r = analisarEtapa(estado.leads, agora, req.params.id, periodo, vistas);
  if (!r) { res.status(404).json({ erro: 'etapa', mensagem: 'Etapa desconhecida.' }); return; }
  res.json(r);
});

/** Agente flutuante: alertas proativos e perguntas em linguagem natural */
router.get('/agente/alertas', (req, res) => {
  const agora = new Date();
  automatizarTodos(agora);
  const eu = typeof req.query.eu === 'string' ? req.query.eu.slice(0, 60) : '';
  // alertas disparados hoje por automações criadas pela equipe
  const hoje = hojeDe(agora);
  const porRegra = new Map<string, { nome: string; ids: string[]; textos: string[] }>();
  for (const g of estado.logAuto) {
    if (!g.alerta || hojeDe(new Date(g.quando)) !== hoje) continue;
    const x = porRegra.get(g.regraId) ?? { nome: g.regraNome, ids: [], textos: [] };
    x.ids.push(g.leadId); x.textos.push(g.resumo.replace(/^.*?(?:alerta|mensagem pronta): /, '')); porRegra.set(g.regraId, x);
  }
  const deAutomacao = [...porRegra].map(([id, x]) => ({ id: `auto:${id}:${hoje}:${x.ids.length}`, nivel: 'atencao' as const, titulo: `Automação: ${x.nome}`, texto: x.textos[0] + (x.ids.length > 1 ? ` (+${x.ids.length - 1} ${x.ids.length === 2 ? 'lead' : 'leads'})` : ''), leadIds: x.ids, aba: 'funil' }));
  // cards dos funis do Clinilink que estouraram a cadência da coluna (o guia por cima do pipeline)
  const deFunis = estado.pipelines.funis.filter((f) => !f.oculto).flatMap((f) => {
    const fora = cardsVisiveis(f, estado.pipelines.atribuicoes).filter((a) => cardAtrasado(a, f, agora));
    if (!fora.length) return [];
    const valor = fora.reduce((s, a) => s + valorDoCard(a, estado.pipelines.extras[a.cardId]), 0);
    return [{ id: `cadencia:${f.id}:${hoje}:${fora.length}`, nivel: (fora.length >= 20 ? 'risco' : 'atencao') as 'risco' | 'atencao', titulo: `${fora.length} cards fora da cadência em ${f.nome}`, texto: `${Math.round(valor).toLocaleString('pt-BR')} em orçamentos esperam ação além do prazo da coluna.`, leadIds: [] as string[], aba: 'pipelines' }];
  });
  res.json({ ia: agenteComIA(), alertas: [...alertasDoAgente(estado.leads, agora, eu), ...deFunis, ...deAutomacao] });
});
router.post('/agente', async (req, res) => {
  const b = (req.body ?? {}) as { pergunta?: unknown; eu?: unknown; historico?: unknown };
  const pergunta = typeof b.pergunta === 'string' ? b.pergunta.slice(0, 500) : '';
  const eu = typeof b.eu === 'string' ? b.eu.slice(0, 60) : '';
  const historico = (Array.isArray(b.historico) ? b.historico : []).slice(-8)
    .filter((m): m is { papel: 'user' | 'agent'; texto: string } => !!m && typeof m === 'object' && (m.papel === 'user' || m.papel === 'agent') && typeof m.texto === 'string');
  const agora = new Date();
  automatizarTodos(agora);
  res.json(await responderAgente(estado.leads, agora, pergunta, eu, historico));
});

router.get('/leads/:id', (req, res) => {
  const l = achar(req.params.id);
  if (!l) return res.status(404).json({ erro: 'nao_encontrado', mensagem: 'Lead não encontrado.' });
  res.json({ ...l, v: vistaDoLead(l, new Date()) });
});

router.post('/leads', (req, res) => {
  const b = (req.body ?? {}) as NovoLead & { forcar?: boolean };
  const agora = new Date();
  const lead = criarLead(b, agora);
  const dup = estado.leads.find((x) => soDigitos(x.telefone) === lead.telefone && x.status !== 'convertido_ativo' && x.status !== 'convertido_organico' && x.status !== 'descarte');
  if (dup && !b.forcar) return res.status(409).json({ erro: 'duplicado', mensagem: `Já existe um lead ativo com este telefone: ${dup.nome}.`, id: dup.id });
  estado.leads.unshift(lead);
  salvar();
  res.status(201).json({ ...lead, v: vistaDoLead(lead, agora) });
});

router.post('/leads/importar', (req, res) => {
  const linhas = Array.isArray(req.body?.linhas) ? (req.body.linhas as NovoLead[]) : [];
  const atendente = typeof req.body?.atendente === 'string' ? req.body.atendente : undefined;
  const agora = new Date();
  const criados: string[] = [];
  const ignorados: { linha: number; motivo: string }[] = [];
  const telefones = new Set(estado.leads.filter((l) => l.status !== 'convertido_ativo' && l.status !== 'convertido_organico' && l.status !== 'descarte').map((l) => soDigitos(l.telefone)));
  linhas.slice(0, 2000).forEach((n, i) => {
    try {
      const lead = criarLead({ ...n, atendente: n.atendente || atendente }, agora);
      if (telefones.has(lead.telefone)) throw new RegraError('duplicado', 'Telefone já cadastrado em um lead ativo.');
      telefones.add(lead.telefone);
      estado.leads.unshift(lead);
      criados.push(lead.id);
    } catch (e) { ignorados.push({ linha: i + 1, motivo: (e as Error).message }); }
  });
  if (criados.length) salvar();
  res.json({ criados: criados.length, ignorados });
});

router.post('/leads/:id/acao', (req, res) => {
  const l = achar(req.params.id);
  if (!l) return res.status(404).json({ erro: 'nao_encontrado', mensagem: 'Lead não encontrado.' });
  const agora = new Date();
  const acao = req.body as Acao;
  if (!acao || typeof acao.tipo !== 'string') return res.status(400).json({ erro: 'dados', mensagem: 'Ação inválida.' });
  aplicar(l, acao, agora);
  automatizar(l, agora);
  salvar();
  res.json({ ...l, v: vistaDoLead(l, agora) });
});

router.put('/atendentes', (req, res) => {
  const lista: unknown = req.body?.lista;
  if (!Array.isArray(lista)) return res.status(400).json({ erro: 'dados', mensagem: 'Lista inválida.' });
  estado.atendentes = [...new Set(lista.map((x) => String(x).trim()).filter(Boolean))].slice(0, 30);
  salvar();
  res.json({ atendentes: estado.atendentes });
});

router.post('/exemplos', (_req, res) => {
  const agora = new Date();
  const novos = gerarExemplos(agora);
  estado.leads.unshift(...novos);
  const nomes = ['Amanda', 'Bruno', 'Carla'];
  estado.atendentes = [...new Set([...estado.atendentes, ...nomes])];
  salvar();
  res.json({ criados: novos.length });
});

router.delete('/exemplos', (_req, res) => {
  const antes = estado.leads.length;
  estado.leads = estado.leads.filter((l) => !l.demo);
  salvar();
  res.json({ removidos: antes - estado.leads.length });
});

/** Modelos de WhatsApp e o estado das travas; com ?lead=<id> já vêm as variáveis preenchidas com os dados do lead. */
router.get('/whatsapp/modelos', (req, res) => {
  const agora = new Date();
  const l = typeof req.query.lead === 'string' ? achar(req.query.lead) : undefined;
  res.json({ status: statusDisparo(estado, agora), modelos: l ? modelosParaLead(estado, l) : MODELOS_WA.map((m) => ({ id: m.id, idioma: m.idioma, titulo: m.titulo, variaveis: m.variaveis.map((v) => ({ id: v.id, rotulo: v.rotulo, valor: '' })) })) });
});

router.post('/leads/:id/whatsapp', (req, res, next) => {
  const l = achar(req.params.id);
  if (!l) return void res.status(404).json({ erro: 'nao_encontrado', mensagem: 'Lead não encontrado.' });
  const b = (req.body ?? {}) as { modelo?: string; parametros?: unknown; passo?: string; msg?: number };
  const agora = new Date();
  enviarModelo(estado, l, { modelo: String(b.modelo ?? ''), parametros: b.parametros, passo: b.passo, msg: typeof b.msg === 'number' ? b.msg : undefined, atendente: req.sessao?.nome }, agora)
    .then((r) => { salvar(); res.json({ ...r.lead, v: vistaDoLead(r.lead, agora), mensagemId: r.mensagemId }); })
    .catch((e) => { if (e instanceof DisparoError) return void res.status(e.status).json({ erro: e.codigo, mensagem: e.message }); next(e); });
});

router.get('/exportar.csv', (_req, res) => {
  const esc = (v: unknown) => { const t = String(v ?? ''); return /[",;\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const cab = ['nome', 'telefone', 'exame', 'valor', 'origem', 'unidade', 'atendente', 'etapa', 'd0', 'motivo_descarte', 'contatos'];
  const linhas = estado.leads.map((l) => [l.nome, l.telefone, l.exame, l.valor, l.origem, l.unidade, l.atendente, l.status, l.d0, l.descarte?.motivo, l.eventos.filter((e) => e.tipo === 'contato').length].map(esc).join(';'));
  res.setHeader('Content-Disposition', 'attachment; filename="leads-clinex.csv"');
  res.type('text/csv; charset=utf-8').send('﻿' + [cab.join(';'), ...linhas].join('\n'));
});

// erros de regra viram 422 com a mensagem pronta para mostrar na tela
router.use((e: unknown, _req: unknown, res: import('express').Response, _next: unknown) => {
  if (e instanceof FunilError) return res.status(422).json({ erro: e.codigo, mensagem: e.message });
  if (e instanceof RegraError) return res.status(422).json({ erro: e.codigo, mensagem: e.message });
  console.error('[crm] erro:', (e as Error).message);
  res.status(500).json({ erro: 'interno', mensagem: 'Erro interno do CRM.' });
});

export default router;
