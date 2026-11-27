import { randomUUID } from 'node:crypto';
import { env } from '../lib/env.js';
import type { Sessao } from '../lib/painel-auth.js';
import type { Estado } from './banco.js';
import { aplicar, automatizar, criarLead, hojeDe, horaDe, soDigitos, tarefasDoDia, vistaDoLead, type Acao, type Lead } from './motor.js';
import { MENSAGENS, MOTIVOS_DESCARTE, PASSOS, REGRAS_OURO } from './modelo.js';
import { analisarExecutivo, analisarTime, detalhePessoa } from './executivo.js';
import { janela, ultimosDias, type Janela } from './periodo.js';
import { alertasDoAgente } from './agente.js';
import { atribuirResponsaveis } from './sincroniaCardLead.js';
import { configAuto, definirModoDisparoAuto, salvarConfigAuto, validarConfigAuto } from './ia-disparo.js';
import { dadosManager } from './disparo-auto-servico.js';
import { DisparoError, MODELOS, enviarModelo, modelosParaLead } from './whatsapp.js';

/**
 * Chat do Agente Clinex com CONTROLE do sistema (modo conversa por texto ou voz).
 *
 * O Claude conversa e usa ferramentas. Três regras de segurança, todas aplicadas AQUI no servidor (nunca só na tela):
 *  1. Permissão por perfil: cada ferramenta exige uma permissão. Sem ela, o chat recusa e explica (a recusa volta para o modelo como
 *     erro, e ele avisa quem pediu). Vale tanto para propor quanto para executar uma ação.
 *  2. Toda ação que MUDA algo (criar lead, registrar contato, ligar a IA, enviar WhatsApp...) NÃO é executada pelo modelo: vira um
 *     cartão de confirmação e só roda quando a pessoa clica em Confirmar (executarAcao, que confere a permissão de novo).
 *  3. Os dados vêm só das ferramentas (dados reais do CRM): o modelo não inventa número.
 */

// ------------------------------------------------------------------------------------------------ permissões

export type Permissao = 'consultar' | 'consultar_equipe' | 'alterar_leads' | 'enviar_whatsapp' | 'ia_ver' | 'ia_alterar';
export const ROTULO_PERMISSAO: Record<Permissao, string> = {
  consultar: 'consultar leads, tarefas e regras', consultar_equipe: 'ver indicadores e desempenho da equipe', alterar_leads: 'criar e alterar leads',
  enviar_whatsapp: 'enviar WhatsApp', ia_ver: 'ver a IA de disparo', ia_alterar: 'alterar a IA de disparo (Power, gatilhos e limites)',
};
export const PERFIL_ROTULO: Record<string, string> = { admin: 'Administrador', gestor: 'Gestor', atendente: 'Atendente', leitura: 'Somente leitura' };

export function permissoesDe(s: Sessao | undefined | null): Set<Permissao> {
  if (!s || (!s.master && s.perfil !== 'admin' && !s.modulos.includes('crm'))) return new Set();
  const base: Permissao[] = ['consultar'];
  if (s.master || s.perfil === 'admin' || s.perfil === 'gestor') return new Set<Permissao>([...base, 'consultar_equipe', 'alterar_leads', 'enviar_whatsapp', 'ia_ver', 'ia_alterar']);
  if (s.perfil === 'atendente') return new Set<Permissao>([...base, 'alterar_leads', 'enviar_whatsapp']);
  return new Set(base);
}

export class ErroAgente extends Error {
  constructor(public codigo: string, mensagem: string, public status = 400) { super(mensagem); }
}
const negado = (s: Sessao | undefined, p: Permissao) => new ErroAgente('permissao', `Sem permissão: o perfil ${PERFIL_ROTULO[s?.perfil ?? ''] ?? 'desta conta'} não pode ${ROTULO_PERMISSAO[p]}. Peça a um ${p === 'ia_alterar' || p === 'ia_ver' || p === 'consultar_equipe' ? 'gestor ou administrador' : 'administrador'} para liberar ou fazer isso.`, 403);

// ------------------------------------------------------------------------------------------------ tipos

export type Contexto = { estado: Estado; agora: Date; sessao: Sessao | undefined; salvar: () => void };
export type AcaoPendente = { id: string; ferramenta: string; args: Record<string, unknown>; titulo: string; resumo: string[]; risco: 'baixo' | 'alto' };
export type Artefato = { id: string; tipo: 'documento' | 'planilha' | 'painel' | 'mensagem'; titulo: string; conteudo?: string; colunas?: string[]; linhas?: (string | number)[][]; html?: string };
export type ItemLead = { leadId: string; titulo: string; sub: string };
export type RespostaChat = { texto: string; acoes: AcaoPendente[]; artefatos: Artefato[]; itens: ItemLead[]; navegar: { tipo: 'tela' | 'lead'; valor: string; rotulo: string } | null; fonte: 'claude' | 'regras'; sugestoes: string[] };

type Args = Record<string, unknown>;

// ---- o Claude, por HTTP (mesma chamada que o resto do projeto faz; sem pacote extra, que já quebrou o build no Vercel)
type EsquemaTool = { type: 'object'; properties: Record<string, unknown>; required: string[] };
type ToolDef = { name: string; description: string; input_schema: EsquemaTool };
type Bloco = { type: string; text?: string; id?: string; name?: string; input?: unknown; [k: string]: unknown };
type ResultadoTool = { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };
type Msg = { role: 'user' | 'assistant'; content: string | Bloco[] | ResultadoTool[] };
type RespostaApi = { content: Bloco[]; stop_reason: string | null };
export type ClienteLLM = { messages: { create(p: Record<string, unknown>): Promise<RespostaApi> } };
type Ferramenta = {
  nome: string; descricao: string; schema: EsquemaTool;
  tipo: 'leitura' | 'acao' | 'artefato' | 'navegar'; perm: Permissao;
  /** leitura/navegar/artefato: roda direto. acao: roda só na confirmação. */
  exec: (c: Contexto, a: Args, saida: Saida) => unknown | Promise<unknown>;
  /** ação: o que a pessoa vai ler no cartão de confirmação */
  cartao?: (c: Contexto, a: Args) => { titulo: string; resumo: string[]; risco?: 'baixo' | 'alto' };
};
type Saida = { itens: ItemLead[]; artefatos: Artefato[]; navegar: RespostaChat['navegar'] };

// ------------------------------------------------------------------------------------------------ utilidades

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
const texto = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const numero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);
const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const fone = (t: string) => { const d = soDigitos(t); return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}` : t; };
const achar = (c: Contexto, id: unknown) => { const l = c.estado.leads.find((x) => x.id === texto(id, 40)); if (!l) throw new ErroAgente('nao_encontrado', 'Lead não encontrado. Busque o lead de novo para pegar o id certo.', 404); return l; };
const ABERTOS = ['aberto', 'sem_retorno', 'negociacao'];
const ROTULO_STATUS: Record<string, string> = { aberto: 'Em aberto', sem_retorno: 'Sem retorno', negociacao: 'Negociação', agendado: 'Agendado', convertido_ativo: 'Convertido ativo', convertido_organico: 'Convertido orgânico', descarte: 'Descartado' };

function periodoDe(a: Args, agora: Date): Janela {
  const p = texto(a.periodo, 20) || '30d', hoje = hojeDe(agora);
  if (p === 'hoje') return ultimosDias(1, agora);
  if (p === '7d') return ultimosDias(7, agora);
  if (p === '90d') return ultimosDias(90, agora);
  if (p === 'mes') { const de = `${hoje.slice(0, 8)}01`; return janela({ de, ate: hoje, dias: Number(hoje.slice(8)) }, agora); }
  return ultimosDias(30, agora);
}
const resumoLead = (c: Contexto, l: Lead) => {
  const v = vistaDoLead(l, c.agora), px = v.proximo;
  return { id: l.id, nome: l.nome, telefone: fone(l.telefone), exame: l.exame, valor: l.valor, unidade: l.unidade ?? '', status: ROTULO_STATUS[l.status] ?? l.status, responsavel: l.atendente ?? '', criadoEm: l.d0,
    proximoPasso: px ? { passo: PASSOS.find((p) => p.id === px.passo.id)?.rotulo ?? px.passo.id, vence: px.vence, situacao: px.situacao, diasAtraso: px.atraso } : null };
};
const itemDe = (c: Contexto, l: Lead): ItemLead => { const r = resumoLead(c, l); return { leadId: l.id, titulo: l.nome, sub: `${l.exame || 'sem exame'} · ${BRL.format(l.valor)} · ${r.proximoPasso ? `${r.proximoPasso.passo} (${r.proximoPasso.situacao})` : r.status}` }; };
const NOME_TELA: Record<string, string> = { hoje: 'Hoje', pipelines: 'Pipelines', analises: 'Análises', funil: 'Funil', leads: 'Leads', fluxo: 'Fluxo', calendario: 'Calendário', mensagens: 'Mensagens', iamanager: 'IA Manager', regras: 'Regras' };
const MAX_JSON = 14_000;
const enxuto = (o: unknown) => { const s = JSON.stringify(o); return s.length > MAX_JSON ? s.slice(0, MAX_JSON) + '…(cortado: refine a busca ou o período)' : s; };

// ------------------------------------------------------------------------------------------------ ferramentas

const obj = (properties: Record<string, unknown>, required: string[] = []): EsquemaTool => ({ type: 'object', properties, required });
const PERIODO = { type: 'string', enum: ['hoje', '7d', '30d', '90d', 'mes'], description: 'Período da análise (padrão 30d).' };

const FERRAMENTAS: Ferramenta[] = [
  { nome: 'resumo_do_dia', tipo: 'leitura', perm: 'consultar', descricao: 'A fila do dia (tarefas que vencem hoje ou estão atrasadas, por prioridade) e os alertas do CRM. Use para "o que eu faço agora".', schema: obj({}),
    exec: (c, _a, s) => {
      const me = c.sessao && !c.sessao.master && c.estado.leads.some((l) => l.atendente === c.sessao!.nome) ? c.estado.leads.filter((l) => l.atendente === c.sessao!.nome) : c.estado.leads;
      const t = tarefasDoDia(me, c.agora), porId = new Map(me.map((l) => [l.id, l]));
      const topo = t.slice(0, 12).map((x) => { const l = porId.get(x.leadId)!; s.itens.push(itemDe(c, l)); return { lead: l.nome, leadId: l.id, passo: PASSOS.find((p) => p.id === x.passoId)?.rotulo ?? x.passoId, situacao: x.situacao, diasAtraso: x.atraso, prioridade: x.prioridade, valor: l.valor }; });
      return { total: t.length, noShow: t.filter((x) => x.prioridade === 1).length, leadsNovos: t.filter((x) => x.prioridade === 2).length, atrasadas: t.filter((x) => x.situacao === 'atrasada').length, topo, alertas: alertasDoAgente(c.estado.leads, c.agora, c.sessao?.master ? '' : c.sessao?.nome ?? '').map((a) => ({ nivel: a.nivel, titulo: a.titulo })) };
    } },
  { nome: 'buscar_leads', tipo: 'leitura', perm: 'consultar', descricao: 'Busca leads por nome/telefone/exame, status, responsável ou unidade. Devolve no máximo 25, dos maiores valores. Para saber mais de um lead, use detalhe_lead.',
    schema: obj({ texto: { type: 'string', description: 'Parte do nome, telefone ou exame' }, status: { type: 'string', enum: ['aberto', 'sem_retorno', 'negociacao', 'agendado', 'convertido_ativo', 'convertido_organico', 'descarte', 'ativos'], description: '"ativos" = em aberto, sem retorno e negociação' }, responsavel: { type: 'string' }, unidade: { type: 'string' }, atrasados: { type: 'boolean', description: 'Só quem tem passo atrasado' }, limite: { type: 'integer', minimum: 1, maximum: 25 } }),
    exec: (c, a, s) => {
      const q = norm(texto(a.texto)), st = texto(a.status, 30), resp = norm(texto(a.responsavel, 60)), un = norm(texto(a.unidade, 60)), lim = Math.min(25, Math.max(1, Math.round(numero(a.limite) ?? 10)));
      let lista = c.estado.leads.filter((l) => !l.demo);
      if (q) lista = lista.filter((l) => norm(`${l.nome} ${l.exame}`).includes(q) || soDigitos(l.telefone).includes(soDigitos(q) || '§'));
      if (st === 'ativos') lista = lista.filter((l) => ABERTOS.includes(l.status)); else if (st) lista = lista.filter((l) => l.status === st);
      if (resp) lista = lista.filter((l) => norm(l.atendente ?? '').includes(resp));
      if (un) lista = lista.filter((l) => norm(l.unidade ?? '').includes(un));
      if (a.atrasados === true) lista = lista.filter((l) => vistaDoLead(l, c.agora).proximo?.situacao === 'atrasada');
      const total = lista.length, top = lista.sort((x, y) => y.valor - x.valor).slice(0, lim);
      top.forEach((l) => s.itens.push(itemDe(c, l)));
      return { total, mostrando: top.length, leads: top.map((l) => resumoLead(c, l)) };
    } },
  { nome: 'detalhe_lead', tipo: 'leitura', perm: 'consultar', descricao: 'Tudo sobre UM lead: dados, próximo passo, contatos e eventos recentes.', schema: obj({ lead_id: { type: 'string' } }, ['lead_id']),
    exec: (c, a, s) => { const l = achar(c, a.lead_id); s.itens.push(itemDe(c, l)); return { ...resumoLead(c, l), origem: l.origem, obs: l.obs, tentativasHoje: vistaDoLead(l, c.agora).tentativasHoje, contatoLiberado: vistaDoLead(l, c.agora).contato, eventos: l.eventos.slice(-12).map((e) => ({ quando: e.quando, tipo: e.tipo, texto: e.texto.slice(0, 160), por: e.atendente })) }; } },
  { nome: 'indicadores', tipo: 'leitura', perm: 'consultar_equipe', descricao: 'Indicadores executivos do período: receita, pipeline, previsão, conversão, velocidade, etapas do funil, no-show e dinheiro parado.',
    schema: obj({ periodo: PERIODO, unidade: { type: 'string', description: 'Filtrar por unidade (opcional)' } }),
    exec: (c, a) => {
      const hoje = c.agora, tarefas = tarefasDoDia(c.estado.leads, hoje), vistas = new Map(c.estado.leads.map((l) => [l.id, vistaDoLead(l, hoje)]));
      const r = analisarExecutivo(c.estado.leads, hoje, periodoDe(a, hoje), texto(a.unidade, 60) || null, tarefas, vistas, c.estado.pipelines) as unknown as Record<string, unknown>;
      return { periodo: { de: r.de, ate: r.ate }, kpis: r.kpis, pipelineEtapas: r.pipelineEtapas, ganhoEtapas: r.ganhoEtapas, dinheiro: r.dinheiro, noshow: r.noshow, atividade: r.atividade, ranking: r.ranking };
    } },
  { nome: 'desempenho_equipe', tipo: 'leitura', perm: 'consultar_equipe', descricao: 'Desempenho do time no período (vendas, conversões, contatos por pessoa). Com "pessoa", o detalhe de uma pessoa.',
    schema: obj({ periodo: PERIODO, pessoa: { type: 'string', description: 'Nome do vendedor/atendente (opcional)' } }),
    exec: (c, a) => {
      const hoje = c.agora, tarefas = tarefasDoDia(c.estado.leads, hoje), vistas = new Map(c.estado.leads.map((l) => [l.id, vistaDoLead(l, hoje)])), per = periodoDe(a, hoje), pessoa = texto(a.pessoa, 60);
      if (pessoa) { const nome = c.estado.atendentes.concat(c.estado.leads.map((l) => l.atendente ?? '')).find((n) => n && norm(n).includes(norm(pessoa))) ?? pessoa; const d = detalhePessoa(c.estado.leads, hoje, per, nome, tarefas, vistas, c.estado.pipelines) as unknown as Record<string, unknown>; return { pessoa: nome, ...Object.fromEntries(Object.entries(d).filter(([, v]) => JSON.stringify(v).length < 5000)) }; }
      const r = analisarTime(c.estado.leads, hoje, per, tarefas, vistas, c.estado.pipelines) as unknown as Record<string, unknown>;
      return { totais: r.totais, equipe: r.equipe, destaques: r.destaques, funil: r.funil, semResponsavel: r.semResponsavel };
    } },
  { nome: 'regras_do_guia', tipo: 'leitura', perm: 'consultar', descricao: 'As regras de ouro, a cadência (passos e horários) e os textos das mensagens do Guia de Atendimento do Lead.', schema: obj({}),
    exec: () => ({ regrasDeOuro: REGRAS_OURO.map((r) => ({ n: r.n, titulo: r.titulo, texto: r.texto })), cadencia: PASSOS.map((p) => ({ passo: p.rotulo, dia: p.dia, hora: p.hora, mensagem: p.msg, quando: p.desc })), mensagens: MENSAGENS.map((m) => ({ n: m.n, titulo: m.titulo, quando: m.quando, texto: m.corpo })), motivosDeDescarte: MOTIVOS_DESCARTE }) },
  { nome: 'status_da_ia', tipo: 'leitura', perm: 'ia_ver', descricao: 'Estado atual da IA de disparo (IA Manager): modo (desligado/simulação/sombra/ligado), gatilhos e horários, janela, limites, pausas, fila e envios de hoje.', schema: obj({}),
    exec: (c) => { const d = dadosManager(c.agora); return { modo: d.modo, forcadoPeloAmbiente: d.forcadoPeloAmbiente, agora: d.agoraBrt, hoje: d.hoje, proximo: d.proximo, janela: d.config.janela, diasSemana: d.config.diasSemana, limites: d.config.limites, pausas: d.config.pausas, disjuntor: d.config.disjuntor, gatilhos: d.gatilhos.map((g) => ({ id: g.id, nome: g.rotulo, ativo: g.ativo, hora: g.hora, desconto: g.desconto, prazo: g.prazo, valorMin: g.valorMin, valorMax: g.valorMax, unidades: g.unidades, fila: g.fila, enviadosHoje: g.enviadosHoje, respostasHoje: g.respostasHoje })), ultimaRodada: d.ultimaRodada ? { quando: d.ultimaRodada.quando, enviados: d.ultimaRodada.enviados, sombra: d.ultimaRodada.sombra, erros: d.ultimaRodada.erros } : null }; } },
  { nome: 'abrir', tipo: 'navegar', perm: 'consultar', descricao: 'Abre uma tela do CRM ou um lead para a pessoa (não altera nada). Telas: hoje, pipelines, analises, funil, leads, fluxo, calendario, mensagens, iamanager, regras.', schema: obj({ tela: { type: 'string', enum: ['hoje', 'pipelines', 'analises', 'funil', 'leads', 'fluxo', 'calendario', 'mensagens', 'iamanager', 'regras'] }, lead_id: { type: 'string', description: 'Se informado, abre este lead' } }),
    exec: (c, a, s) => { if (texto(a.lead_id)) { const l = achar(c, a.lead_id); s.navegar = { tipo: 'lead', valor: l.id, rotulo: `Abrir ${l.nome}` }; return `Vou abrir o lead ${l.nome}.`; } const t = texto(a.tela, 30) || 'hoje', nome = NOME_TELA[t] ?? t; s.navegar = { tipo: 'tela', valor: t, rotulo: `Abrir ${nome}` }; return `Vou abrir a tela ${nome}.`; } },
  { nome: 'criar_artefato', tipo: 'artefato', perm: 'consultar', descricao: 'Cria um artefato para a pessoa ver, copiar ou baixar. Use SÓ com dados obtidos nas ferramentas. tipo=documento: relatório/ata/plano em Markdown (títulos #, listas -, **negrito**, tabelas |). tipo=planilha: colunas + linhas (abre no Excel). tipo=painel: página HTML autocontida com gráficos (CSS/SVG/JS inline; pode usar Chart.js de https://cdnjs.cloudflare.com; sem outros recursos externos). tipo=mensagem: texto pronto de WhatsApp ou roteiro de ligação.',
    schema: obj({ tipo: { type: 'string', enum: ['documento', 'planilha', 'painel', 'mensagem'] }, titulo: { type: 'string' }, conteudo: { type: 'string', description: 'Markdown (documento) ou texto (mensagem)' }, colunas: { type: 'array', items: { type: 'string' } }, linhas: { type: 'array', items: { type: 'array', items: { type: ['string', 'number'] } } }, html: { type: 'string', description: 'HTML completo do painel' } }, ['tipo', 'titulo']),
    exec: (_c, a, s) => {
      const tipo = texto(a.tipo, 20) as Artefato['tipo'], titulo = texto(a.titulo, 120) || 'Sem título';
      if (!['documento', 'planilha', 'painel', 'mensagem'].includes(tipo)) throw new ErroAgente('dados', 'Tipo de artefato inválido.');
      const art: Artefato = { id: randomUUID().slice(0, 8), tipo, titulo };
      if (tipo === 'documento' || tipo === 'mensagem') { art.conteudo = String(a.conteudo ?? '').slice(0, 60_000); if (!art.conteudo.trim()) throw new ErroAgente('dados', 'O conteúdo do artefato veio vazio.'); }
      else if (tipo === 'planilha') {
        const cols = Array.isArray(a.colunas) ? a.colunas.map((x) => String(x).slice(0, 60)).slice(0, 30) : [];
        const lin = Array.isArray(a.linhas) ? a.linhas.slice(0, 5000).map((r) => (Array.isArray(r) ? r.slice(0, cols.length || 30).map((x) => (typeof x === 'number' ? x : String(x ?? '').slice(0, 300))) : [])) : [];
        if (!cols.length) throw new ErroAgente('dados', 'A planilha precisa de colunas.');
        art.colunas = cols; art.linhas = lin;
      } else { art.html = String(a.html ?? '').slice(0, 250_000); if (!/<\w+/.test(art.html)) throw new ErroAgente('dados', 'O painel veio sem HTML.'); }
      s.artefatos.push(art);
      return `Artefato "${titulo}" criado e mostrado à pessoa. Não repita o conteúdo inteiro no chat: resuma em uma ou duas frases.`;
    } },

  // ---- ações (só rodam depois da confirmação)
  { nome: 'criar_lead', tipo: 'acao', perm: 'alterar_leads', descricao: 'Cria um lead novo (orçamento) no CRM. Exige nome e telefone com DDD. A pessoa confirma antes.', schema: obj({ nome: { type: 'string' }, telefone: { type: 'string' }, exame: { type: 'string' }, valor: { type: 'number' }, unidade: { type: 'string' }, atendente: { type: 'string' }, origem: { type: 'string' }, obs: { type: 'string' } }, ['nome', 'telefone']),
    cartao: (_c, a) => ({ titulo: 'Criar lead', resumo: [`Nome: ${texto(a.nome, 80)}`, `Telefone: ${fone(texto(a.telefone, 30))}`, ...(texto(a.exame) ? [`Exame: ${texto(a.exame)}`] : []), ...(numero(a.valor) !== undefined ? [`Valor: ${BRL.format(numero(a.valor)!)}`] : []), ...(texto(a.unidade) ? [`Unidade: ${texto(a.unidade)}`] : []), ...(texto(a.atendente) ? [`Responsável: ${texto(a.atendente)}`] : [])] }),
    exec: (c, a, s) => {
      const lead = criarLead({ nome: texto(a.nome, 80), telefone: texto(a.telefone, 30), exame: texto(a.exame, 80), valor: numero(a.valor), unidade: texto(a.unidade, 60) || undefined, atendente: texto(a.atendente, 60) || undefined, origem: texto(a.origem, 60) || 'Agente Clinex', obs: texto(a.obs, 500) || undefined }, c.agora);
      const dup = c.estado.leads.find((x) => soDigitos(x.telefone) === lead.telefone && ABERTOS.concat('agendado').includes(x.status));
      if (dup) throw new ErroAgente('duplicado', `Já existe um lead ativo com este telefone: ${dup.nome}.`, 409);
      c.estado.leads.unshift(lead); automatizar(lead, c.agora); c.salvar(); s.itens.push(itemDe(c, lead));
      return `Lead ${lead.nome} criado.`;
    } },
  { nome: 'registrar_contato', tipo: 'acao', perm: 'alterar_leads', descricao: 'Registra no lead um contato JÁ FEITO por ligação, WhatsApp ou presencial (não envia nada). Antes, pergunte se o paciente já foi à recepção: se sim, não registre contato.', schema: obj({ lead_id: { type: 'string' }, canal: { type: 'string', enum: ['ligacao', 'whatsapp', 'presencial'] }, resultado: { type: 'string', description: 'O que aconteceu na conversa' }, paciente_ja_foi_a_recepcao: { type: 'boolean' } }, ['lead_id', 'canal', 'paciente_ja_foi_a_recepcao']),
    cartao: (c, a) => ({ titulo: 'Registrar contato', resumo: [`Lead: ${achar(c, a.lead_id).nome}`, `Canal: ${texto(a.canal, 20)}`, ...(texto(a.resultado) ? [`Resultado: ${texto(a.resultado, 200)}`] : [])] }),
    exec: (c, a) => acaoNoLead(c, a, { tipo: 'contato', canal: (['ligacao', 'whatsapp', 'presencial'].includes(texto(a.canal)) ? texto(a.canal) : 'ligacao') as 'ligacao', naoFoiRecepcao: a.paciente_ja_foi_a_recepcao === false, texto: texto(a.resultado, 400) || undefined, atendente: c.sessao?.nome }, 'Contato registrado.') },
  { nome: 'atualizar_lead', tipo: 'acao', perm: 'alterar_leads', descricao: 'Muda a situação de um lead: agendou (data AAAA-MM-DD, hora, exame), compareceu, noshow, retorno (data), parou, descartar (motivo), nota (texto) ou editar (campos nome/telefone/exame/valor/unidade/atendente/obs).',
    schema: obj({ lead_id: { type: 'string' }, acao: { type: 'string', enum: ['agendou', 'compareceu', 'noshow', 'retorno', 'parou', 'descartar', 'nota', 'editar'] }, data: { type: 'string' }, hora: { type: 'string' }, exame: { type: 'string' }, motivo: { type: 'string', enum: [...MOTIVOS_DESCARTE] }, texto: { type: 'string' }, campos: { type: 'object' } }, ['lead_id', 'acao']),
    cartao: (c, a) => ({ titulo: `Atualizar lead: ${texto(a.acao, 20)}`, resumo: [`Lead: ${achar(c, a.lead_id).nome}`, ...['data', 'hora', 'exame', 'motivo', 'texto'].filter((k) => texto(a[k])).map((k) => `${k}: ${texto(a[k], 160)}`), ...(a.campos && typeof a.campos === 'object' ? Object.entries(a.campos as Args).map(([k, v]) => `${k} → ${String(v).slice(0, 80)}`) : [])] }),
    exec: (c, a) => {
      const t = texto(a.acao, 20), por = c.sessao?.nome; let ac: Acao;
      if (t === 'agendou') ac = { tipo: 'agendou', data: texto(a.data, 10), hora: texto(a.hora, 5) || undefined, exame: texto(a.exame, 80) || undefined, atendente: por };
      else if (t === 'retorno') ac = { tipo: 'retorno', data: texto(a.data, 10), atendente: por };
      else if (t === 'descartar') ac = { tipo: 'descartar', motivo: texto(a.motivo, 30), atendente: por };
      else if (t === 'nota') ac = { tipo: 'nota', texto: texto(a.texto, 600), atendente: por };
      else if (t === 'editar') { const cp = (a.campos && typeof a.campos === 'object' ? a.campos : {}) as Args, campos: Record<string, string | number> = {}; for (const k of ['nome', 'telefone', 'exame', 'unidade', 'atendente', 'obs', 'origem']) if (typeof cp[k] === 'string') campos[k] = String(cp[k]).slice(0, 200); if (numero(cp.valor) !== undefined) campos.valor = numero(cp.valor)!; ac = { tipo: 'editar', campos: campos as never, atendente: por }; }
      else if (['compareceu', 'noshow', 'parou'].includes(t)) ac = { tipo: t as 'parou', atendente: por };
      else throw new ErroAgente('dados', 'Ação inválida.');
      return acaoNoLead(c, a, ac, 'Lead atualizado.');
    } },
  { nome: 'enviar_whatsapp', tipo: 'acao', perm: 'enviar_whatsapp', descricao: 'ENVIA de verdade um modelo de WhatsApp aprovado a um lead (passa por todas as travas do guia: 2 contatos por dia, já foi à recepção...). Modelos: ' + MODELOS.map((m) => `${m.id} (Msg ${m.msg})`).join(', ') + '. As variáveis são preenchidas com os dados do lead.', schema: obj({ lead_id: { type: 'string' }, modelo: { type: 'string', enum: MODELOS.map((m) => m.id) } }, ['lead_id', 'modelo']),
    cartao: (c, a) => { const l = achar(c, a.lead_id), m = modelosParaLead(c.estado, l).find((x) => x.id === a.modelo); if (!m) throw new ErroAgente('dados', 'Modelo desconhecido.'); return { titulo: 'Enviar WhatsApp', risco: 'alto', resumo: [`Para: ${l.nome} (${fone(l.telefone)})`, `Modelo: ${m.titulo} · Msg ${m.msg}`, ...m.variaveis.map((v) => `${v.rotulo}: ${v.valor || '(vazio)'}`), 'A mensagem sai de verdade para o paciente.'] }; },
    exec: async (c, a, s) => {
      const l = achar(c, a.lead_id), m = modelosParaLead(c.estado, l).find((x) => x.id === a.modelo); if (!m) throw new ErroAgente('dados', 'Modelo desconhecido.');
      try { await enviarModelo(c.estado, l, { modelo: m.id, parametros: m.variaveis.map((v) => v.valor), msg: m.msg, atendente: c.sessao?.nome }, c.agora); }
      catch (e) { if (e instanceof DisparoError) throw new ErroAgente(e.codigo, e.message, e.status); throw e; }
      c.salvar(); s.itens.push(itemDe(c, l)); return `WhatsApp enviado para ${l.nome}.`;
    } },
  { nome: 'ia_definir_modo', tipo: 'acao', perm: 'ia_alterar', descricao: 'Muda o modo da IA de disparo (botão Power do IA Manager): desligado, simulacao (só leads fictícios), sombra (anota o que enviaria, sem enviar) ou ligado (ENVIA mensagens reais sozinha).', schema: obj({ modo: { type: 'string', enum: ['desligado', 'simulacao', 'sombra', 'ligado'] } }, ['modo']),
    cartao: (c, a) => { const modo = texto(a.modo, 20); return { titulo: 'Mudar o modo da IA de disparo', risco: modo === 'ligado' ? 'alto' : 'baixo', resumo: [`Modo atual: ${configModo(c)}`, `Novo modo: ${modo}`, ...(modo === 'ligado' ? ['A IA passa a enviar mensagens REAIS para pacientes, sozinha, no horário de cada gatilho.'] : [])] }; },
    exec: (c, a) => { const modo = texto(a.modo, 20) as 'ligado'; try { definirModoDisparoAuto(c.estado, modo, c.sessao?.nome ?? 'Agente Clinex', c.agora); } catch (e) { if (e instanceof DisparoError) throw new ErroAgente(e.codigo, e.message, e.status); throw e; } c.salvar(); return `IA de disparo agora em modo ${modo}.`; } },
  { nome: 'ia_ajustar', tipo: 'acao', perm: 'ia_alterar', descricao: 'Ajusta a IA de disparo (IA Manager): ligar/desligar um gatilho, horário (HH:MM entre 08:00 e 18:59), desconto (10%/5%), prazo, valor mínimo/máximo, janela de envio (início/fim em horas inteiras, dentro de 8–19), dias da semana (0=domingo…6=sábado), limites por rodada e por dia. O guia só pode ser estreitado, nunca ampliado.',
    schema: obj({ gatilho: { type: 'string', enum: ['primeiro', 'tentativa', 'desconto', 'encerramento', 'noshow'] }, ativo: { type: 'boolean' }, hora: { type: 'string' }, desconto: { type: 'string', enum: ['10%', '5%'] }, prazo: { type: 'string', enum: ['hoje', 'esta semana', 'este mês'] }, valor_min: { type: ['number', 'null'] }, valor_max: { type: ['number', 'null'] }, janela_inicio: { type: 'integer' }, janela_fim: { type: 'integer' }, dias_semana: { type: 'array', items: { type: 'integer' } }, limite_por_rodada: { type: 'integer' }, limite_por_dia: { type: 'integer' } }),
    cartao: (_c, a) => ({ titulo: 'Ajustar a IA de disparo', resumo: Object.entries(a).filter(([, v]) => v !== undefined).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${Array.isArray(v) ? v.join(', ') : String(v)}`) }),
    exec: (c, a) => {
      const mudanca: Record<string, unknown> = {}, g: Record<string, unknown> = {};
      if (a.gatilho) { for (const [de, para] of [['ativo', 'ativo'], ['hora', 'hora'], ['desconto', 'desconto'], ['prazo', 'prazo'], ['valor_min', 'valorMin'], ['valor_max', 'valorMax']] as const) if (a[de] !== undefined) g[para] = a[de]; mudanca.gatilhos = { [texto(a.gatilho, 20)]: g }; }
      else if (['ativo', 'hora', 'desconto', 'prazo', 'valor_min', 'valor_max'].some((k) => a[k] !== undefined)) throw new ErroAgente('dados', 'Diga qual gatilho ajustar.');
      if (numero(a.janela_inicio) !== undefined || numero(a.janela_fim) !== undefined) { const atual = configAuto(c.estado).janela; mudanca.janela = { inicio: numero(a.janela_inicio) ?? atual.inicio, fim: numero(a.janela_fim) ?? atual.fim }; }
      if (Array.isArray(a.dias_semana)) mudanca.diasSemana = a.dias_semana;
      if (numero(a.limite_por_rodada) !== undefined || numero(a.limite_por_dia) !== undefined) mudanca.limites = { ...(numero(a.limite_por_rodada) !== undefined ? { porRodada: numero(a.limite_por_rodada) } : {}), ...(numero(a.limite_por_dia) !== undefined ? { porDia: numero(a.limite_por_dia) } : {}) };
      if (!Object.keys(mudanca).length) throw new ErroAgente('dados', 'Nada para ajustar.');
      try { salvarConfigAuto(c.estado, validarConfigAuto(mudanca, configAuto(c.estado)), `${c.sessao?.nome ?? 'Agente Clinex'} (chat)`, c.agora); } catch (e) { if (e instanceof DisparoError) throw new ErroAgente(e.codigo, e.message, e.status); throw e; }
      c.salvar(); return 'IA de disparo ajustada.';
    } },
];
const configModo = (c: Contexto) => c.estado.disparoAuto?.modo ?? 'desligado';

function acaoNoLead(c: Contexto, a: Args, ac: Acao, ok: string) {
  const l = achar(c, a.lead_id);
  if (ac.tipo === 'contato' && !ac.naoFoiRecepcao) throw new ErroAgente('regra', 'Regra de ouro 1: se o paciente já foi à recepção, não entre em contato. Ele deve ser marcado como Convertido Orgânico.', 409);
  aplicar(l, ac, c.agora); automatizar(l, c.agora); atribuirResponsaveis(c.estado); c.salvar();
  return ok;
}

export const NOMES_FERRAMENTAS = FERRAMENTAS.map((f) => f.nome);
const porNome = new Map(FERRAMENTAS.map((f) => [f.nome, f]));
const vazia = (): Saida => ({ itens: [], artefatos: [], navegar: null });

/** Executa uma ação JÁ CONFIRMADA pela pessoa (chamada pela rota de confirmação). Confere a permissão de novo. */
export async function executarAcao(c: Contexto, nome: string, args: Args): Promise<{ resumo: string; itens: ItemLead[] }> {
  const f = porNome.get(nome);
  if (!f || f.tipo !== 'acao') throw new ErroAgente('dados', 'Ação desconhecida.', 400);
  if (!permissoesDe(c.sessao).has(f.perm)) throw negado(c.sessao, f.perm);
  const s = vazia();
  try { return { resumo: String(await f.exec(c, args, s)), itens: s.itens }; }
  catch (e) { if (e instanceof ErroAgente) throw e; const m = (e as Error).message; throw new ErroAgente((e as { codigo?: string }).codigo ?? 'erro', m, 422); }
}

// ------------------------------------------------------------------------------------------------ o modelo

function promptDoSistema(c: Contexto, voz: boolean): string {
  const t = horaDe(c.agora), perms = [...permissoesDe(c.sessao)];
  const negadas = (Object.keys(ROTULO_PERMISSAO) as Permissao[]).filter((p) => !perms.includes(p));
  return `Você é o Agente Clinex, o assistente do CRM de uma rede de clínicas de diagnóstico. Fala português do Brasil, direto e cordial, sem enrolação.
Hoje é ${hojeDe(c.agora)}, ${String(t.h).padStart(2, '0')}:${String(t.m).padStart(2, '0')} (horário de Belém). Você está falando com ${c.sessao?.nome ?? 'um usuário'}, perfil ${PERFIL_ROTULO[c.sessao?.perfil ?? ''] ?? 'desconhecido'}.
Este perfil PODE: ${perms.map((p) => ROTULO_PERMISSAO[p]).join('; ') || 'nada'}.${negadas.length ? ` NÃO pode: ${negadas.map((p) => ROTULO_PERMISSAO[p]).join('; ')}. Se pedirem algo disso, avise com clareza que o perfil não tem permissão (sem chamar a ferramenta) e diga quem pode fazer.` : ''}

Como trabalhar:
- Todo número, nome, valor ou data vem das ferramentas (dados reais do CRM). Nunca invente. Se faltar dado, consulte; se não der, diga que não sabe.
- As ferramentas de ação (criar lead, registrar contato, atualizar lead, enviar WhatsApp, IA de disparo) NÃO executam: elas mostram um cartão e a pessoa confirma. Depois de chamar uma, diga em uma frase o que propôs e peça para confirmar no cartão. Nunca diga que já fez.
- Se um pedido de ação estiver ambíguo (qual lead? qual telefone?), pergunte antes. Para achar o lead, busque primeiro e use o id exato.
- Se uma ferramenta devolver "Sem permissão", explique isso à pessoa com as suas palavras.
- Documentos, planilhas, painéis e mensagens: use criar_artefato com dados reais já consultados, e depois resuma em uma ou duas frases o que ficou pronto.
- Use "abrir" quando a pessoa pedir para ver uma tela ou um lead.
${voz ? '- MODO VOZ: sua resposta será FALADA. Máximo de 3 frases curtas, sem markdown, sem listas, sem tabelas, sem emojis. Diga valores por extenso natural ("quatro mil e cem reais"). Para detalhes longos, crie um artefato e diga que deixou na tela.' : '- Respostas curtas e escaneáveis; **negrito** só no que importa.'}`;
}

function textoDe(content: Bloco[]) { return content.filter((b) => b.type === 'text').map((b) => String(b.text ?? '')).join('\n').trim(); }

export type Historico = { papel: 'user' | 'agent'; texto: string }[];
let clienteCache: ClienteLLM | null = null;
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clienteHttp = (): ClienteLLM => ({ messages: { create: async (p) => {
  for (let tentativa = 0; ; tentativa++) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 100_000);
    try {
      const r = await fetch(`${env.anthropicBase}/v1/messages`, { method: 'POST', signal: ctl.signal, headers: { 'x-api-key': env.anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify(p) });
      if (r.ok) return (await r.json()) as RespostaApi;
      if (tentativa === 0 && (r.status === 429 || r.status >= 500)) { await espera(900); continue; }
      console.error('[agente-chat] a Anthropic respondeu', r.status, (await r.text().catch(() => '')).slice(0, 300)); // vai para o log do servidor (sem a chave)
      throw new ErroAgente('ia', 'Não consegui falar com a IA agora. Tente de novo em instantes.', 502);
    } catch (e) { if (e instanceof ErroAgente) throw e; if (tentativa === 0) { await espera(900); continue; } throw new ErroAgente('ia', 'Não consegui falar com a IA agora. Tente de novo em instantes.', 502); }
    finally { clearTimeout(t); }
  }
} } });
const cliente = () => (clienteCache ??= clienteHttp());
/** Para os testes: troca o cliente por um falso. */
export const _definirCliente = (c: ClienteLLM | null) => { clienteCache = c; };

export async function conversar(c: Contexto, pergunta: string, historico: Historico, opcoes: { voz?: boolean } = {}): Promise<RespostaChat> {
  const saida = vazia(), acoes: AcaoPendente[] = [];
  const msgs: Msg[] = [];
  for (const m of historico.slice(-10)) { const papel = m.papel === 'user' ? 'user' : 'assistant'; const t = m.texto.slice(0, 1500); if (!t) continue; if (msgs.at(-1)?.role === papel) msgs[msgs.length - 1] = { role: papel, content: t }; else msgs.push({ role: papel, content: t }); }
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (msgs.at(-1)?.role === 'user') msgs.pop();
  msgs.push({ role: 'user', content: pergunta.slice(0, 1500) });
  const perms = permissoesDe(c.sessao);
  const tools: ToolDef[] = FERRAMENTAS.map((f) => ({ name: f.nome, description: f.descricao, input_schema: f.schema }));
  const sistema = promptDoSistema(c, !!opcoes.voz);
  let final = '';
  for (let volta = 0; volta < 7; volta++) {
    const r = await cliente().messages.create({ model: env.agenteChatModelo, max_tokens: 4096, system: sistema, tools, messages: msgs, output_config: { effort: env.agenteChatEsforco } });
    if (r.stop_reason === 'refusal') { final = 'Não consegui ajudar com esse pedido.'; break; }
    msgs.push({ role: 'assistant', content: r.content });
    if (r.stop_reason !== 'tool_use') { final = textoDe(r.content) || (r.stop_reason === 'max_tokens' ? 'A resposta ficou longa demais. Peça de novo, mais específico.' : ''); break; }
    const resultados: ResultadoTool[] = [];
    for (const b of r.content) {
      if (b.type !== 'tool_use') continue;
      const f = porNome.get(String(b.name)), args = (b.input && typeof b.input === 'object' ? b.input : {}) as Args;
      const erro = (m: string): ResultadoTool => ({ type: 'tool_result', tool_use_id: String(b.id), content: m, is_error: true });
      if (!f) { resultados.push(erro('Ferramenta desconhecida.')); continue; }
      if (!perms.has(f.perm)) { resultados.push(erro(negado(c.sessao, f.perm).message)); continue; }
      try {
        if (f.tipo === 'acao') {
          const cartao = f.cartao!(c, args);
          acoes.push({ id: randomUUID().slice(0, 8), ferramenta: f.nome, args, titulo: cartao.titulo, resumo: cartao.resumo, risco: cartao.risco ?? 'baixo' });
          resultados.push({ type: 'tool_result', tool_use_id: String(b.id), content: 'Ação apresentada à pessoa num cartão de confirmação. AINDA NÃO foi executada. Peça para ela confirmar no cartão.' });
        } else resultados.push({ type: 'tool_result', tool_use_id: String(b.id), content: enxuto(await f.exec(c, args, saida)) });
      } catch (e) { resultados.push(erro(e instanceof ErroAgente || e instanceof Error ? e.message : 'Erro inesperado.')); }
    }
    msgs.push({ role: 'user', content: resultados });
  }
  if (!final) final = acoes.length ? 'Preparei o que você pediu. Confirme no cartão abaixo.' : saida.artefatos.length ? 'Pronto, deixei o resultado na tela.' : 'Não consegui concluir. Tente pedir de outro jeito.';
  const vistos = new Set<string>(); const itens = saida.itens.filter((i) => !vistos.has(i.leadId) && vistos.add(i.leadId)).slice(0, 6);
  return { texto: final, acoes, artefatos: saida.artefatos, itens, navegar: saida.navegar, fonte: 'claude', sugestoes: [] };
}
