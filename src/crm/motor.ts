import { randomUUID } from 'node:crypto';
import { LIMITES, MOTIVOS_DESCARTE, PASSOS, type Canal, type PassoDef, type Status } from './modelo.js';

/**
 * Motor do CRM: aplica o "Guia de Atendimento do Lead" aos leads.
 * Função pura sobre os dados (recebe `agora` de fora, não lê relógio nem disco), por isso é testável (scripts/teste-crm.ts).
 * Dias sempre no fuso de Belém (UTC-3, sem horário de verão), como o resto do painel.
 */

export class RegraError extends Error {
  constructor(public codigo: string, mensagem: string) { super(mensagem); }
}
const erro = (codigo: string, msg: string) => new RegraError(codigo, msg);

// ------------------------------------------------------------------------------------------------ datas

const FUSO_MS = -3 * 3_600_000;
export const hojeDe = (agora: Date) => new Date(agora.getTime() + FUSO_MS).toISOString().slice(0, 10);
export const horaDe = (agora: Date) => { const d = new Date(agora.getTime() + FUSO_MS); return { h: d.getUTCHours(), m: d.getUTCMinutes() }; };
export const diaDoInstante = (iso: string) => hojeDe(new Date(iso));
export const somaDias = (dia: string, n: number) => { const d = new Date(`${dia}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** b - a, em dias */
export const diffDias = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const maxDia = (a: string, b: string) => (a >= b ? a : b);
const DIA_OK = /^\d{4}-\d{2}-\d{2}$/;

// ------------------------------------------------------------------------------------------------ tipos

export type TipoEvento = 'criado' | 'contato' | 'resposta' | 'etapa' | 'agendamento' | 'retorno' | 'descarte' | 'nota' | 'automacao' | 'edicao' | 'recepcao' | 'comparecimento';
/**
 * Este evento é uma CONVERSÃO ATIVA (compareceu e pagou)? Vale o registro feito pelo guia ("Compareceu e pagou…") e também o do
 * card do Pipelines: quando alguém move o card para "Convertido ativo", o lead acompanha e grava "Acompanhou o funil de
 * Orçamentos…" como comparecimento. As análises precisam contar os dois, senão a conversão feita no Pipelines some dos números.
 */
export const ehConversaoAtiva = (e: { tipo: string; texto: string }) => e.tipo === 'comparecimento' && (/^Compareceu/.test(e.texto) || /^Acompanhou o funil/.test(e.texto));

export type EventoLead = {
  id: string; quando: string; tipo: TipoEvento; texto: string; atendente?: string; canal?: Canal; msg?: number; passo?: string; fase?: string; auto?: boolean;
  /** resposta do paciente: o que ele quis dizer (agendar, valor_horario, duvida, sem_interesse, ja_fez, ainda_quer, reagendar, outro) e o id da mensagem na Inovstar (para não registrar duas vezes) */
  intencao?: string; msgId?: string;
  /** o que o paciente escreveu (ou o texto do botão), como veio */
  resp?: string;
};

export type Lead = {
  id: string; nome: string; telefone: string; exame: string; valor: number;
  origem?: string; unidade?: string; atendente?: string; obs?: string; demo?: boolean;
  /** pediu para não receber mais mensagens: a IA de disparo nunca mais escreve para este lead */
  semDisparoAuto?: boolean;
  /** card do funil de Orçamentos (Clinilink) que originou este lead, quando veio de lá */
  cardId?: string; fonte?: 'clinilink';
  criadoEm: string;
  /** D0: dia em que o lead entrou */
  d0: string;
  status: Status;
  statusDesde: string;
  /** identifica a passagem atual por uma fase; os contatos registrados nela contam para os passos dela */
  faseId: string;
  seqFase: number;
  negD0?: string;
  pulados: string[];
  retornoData?: string;
  noShow?: boolean;
  agendamento?: { data: string; hora?: string; exame?: string };
  descarte?: { motivo: string; quando: string; auto?: boolean; de: Status };
  reativacaoTentada?: string;
  /** etiquetas aplicadas por automações ou pela equipe */
  etiquetas?: string[];
  /** automações já aplicadas neste lead (chave regra:fase) para não repetir */
  autoRegras?: Record<string, string>;
  eventos: EventoLead[];
};

export type NovoLead = { nome: string; telefone: string; exame?: string; valor?: number; origem?: string; unidade?: string; atendente?: string; obs?: string; demo?: boolean; d0?: string };

const TERMINAIS: Status[] = ['convertido_ativo', 'convertido_organico'];
const ABERTOS: Status[] = ['aberto', 'sem_retorno', 'negociacao'];
export const ehTerminal = (s: Status) => TERMINAIS.includes(s);

// ------------------------------------------------------------------------------------------------ criação e fases

export const soDigitos = (t: string) => String(t ?? '').replace(/\D/g, '');

function evento(lead: Lead, agora: Date, e: Omit<EventoLead, 'id' | 'quando'>) {
  lead.eventos.push({ id: randomUUID().slice(0, 8), quando: agora.toISOString(), fase: lead.faseId, ...e });
}

export function criarLead(n: NovoLead, agora: Date): Lead {
  const nome = String(n.nome ?? '').trim();
  const telefone = soDigitos(n.telefone);
  if (!nome) throw erro('dados', 'Informe o nome do lead.');
  if (telefone.length < 10) throw erro('dados', 'Informe o telefone com DDD.');
  const valor = Number(n.valor ?? 0);
  if (!Number.isFinite(valor) || valor < 0) throw erro('dados', 'Valor do orçamento inválido.');
  const hoje = n.d0 && DIA_OK.test(n.d0) ? n.d0 : hojeDe(agora);
  const lead: Lead = {
    id: randomUUID().slice(0, 8), nome, telefone, exame: String(n.exame ?? '').trim(), valor,
    origem: n.origem?.trim() || undefined, unidade: n.unidade?.trim() || undefined, atendente: n.atendente?.trim() || undefined, obs: n.obs?.trim() || undefined, demo: n.demo || undefined,
    criadoEm: agora.toISOString(), d0: hoje, status: 'aberto', statusDesde: hoje, faseId: `aberto:${hoje}:1`, seqFase: 1, pulados: [], eventos: [],
  };
  evento(lead, agora, { tipo: 'criado', texto: `Lead entrou (D0 = ${hoje}).`, atendente: lead.atendente });
  return lead;
}

function entrar(lead: Lead, status: Status, dia: string, extra: { pulados?: string[]; noShow?: boolean } = {}) {
  lead.status = status;
  lead.statusDesde = dia;
  lead.seqFase += 1;
  lead.faseId = `${status}:${dia}:${lead.seqFase}`;
  lead.pulados = extra.pulados ?? [];
  lead.noShow = extra.noShow || undefined;
  lead.retornoData = undefined;
  if (status === 'negociacao') lead.negD0 = dia;
}

// ------------------------------------------------------------------------------------------------ passos da cadência

const passosDaFase = (lead: Lead): PassoDef[] => (ABERTOS.includes(lead.status) ? PASSOS.filter((p) => p.fase === lead.status) : []);
const baseDia = (lead: Lead, p: PassoDef) => (p.fase === 'negociacao' ? lead.negD0 ?? lead.statusDesde : lead.d0);
const contatosDoPasso = (lead: Lead, id: string) => lead.eventos.filter((e) => e.tipo === 'contato' && e.passo === id && e.fase === lead.faseId);

export const exigeLigacao = (lead: Lead, p: PassoDef) => p.id === 'primeiro' && lead.valor > LIMITES.ligacaoAcimaDe;

function passoFeito(lead: Lead, p: PassoDef): boolean {
  if (p.decisao) return false;
  const c = contatosDoPasso(lead, p.id);
  if (exigeLigacao(lead, p)) return c.some((e) => e.canal === 'whatsapp') && c.some((e) => e.canal === 'ligacao');
  return c.length > 0;
}

export type Situacao = 'atrasada' | 'hoje' | 'futura';
export type Proximo = { passo: PassoDef; vence: string; situacao: Situacao; atraso: number; prioridade: 1 | 2 | 3; faltaLigacao?: boolean };

function situacaoDe(vence: string, hoje: string): { situacao: Situacao; atraso: number } {
  const d = diffDias(vence, hoje);
  return { situacao: d > 0 ? 'atrasada' : d === 0 ? 'hoje' : 'futura', atraso: Math.max(0, d) };
}
const passoPorId = (id: string) => PASSOS.find((p) => p.id === id)!;

export function proximoPasso(lead: Lead, hoje: string): Proximo | null {
  const mk = (passo: PassoDef, vence: string, prioridade: 1 | 2 | 3): Proximo => ({ passo, vence, ...situacaoDe(vence, hoje), prioridade, faltaLigacao: exigeLigacao(lead, passo) && contatosDoPasso(lead, passo.id).some((e) => e.canal === 'whatsapp') && !contatosDoPasso(lead, passo.id).some((e) => e.canal === 'ligacao') });
  switch (lead.status) {
    case 'aberto':
    case 'sem_retorno':
    case 'negociacao': {
      if (lead.status === 'negociacao' && lead.noShow) return mk(passoPorId('noshow'), lead.statusDesde, 1);
      if (lead.status === 'negociacao' && lead.retornoData) return mk(passoPorId('retorno'), lead.retornoData, 3);
      for (const p of passosDaFase(lead)) {
        if (lead.pulados.includes(p.id) || passoFeito(lead, p)) continue;
        const vence = maxDia(somaDias(baseDia(lead, p), p.dia ?? 0), lead.statusDesde);
        return mk(p, vence, p.id === 'primeiro' ? 2 : 3);
      }
      return null;
    }
    case 'agendado':
      return lead.agendamento ? mk(passoPorId('comparecimento'), lead.agendamento.data, 1) : null;
    case 'descarte': {
      if (lead.reativacaoTentada || !lead.descarte) return null;
      const ini = somaDias(lead.descarte.quando, LIMITES.reativacaoMinDias);
      const fim = somaDias(lead.descarte.quando, LIMITES.reativacaoMaxDias);
      if (hoje > fim) return null; // janela encerrada
      const p = mk(passoPorId('reativacao'), ini, 3);
      // dentro da janela de 30 a 60 dias a tarefa vale "hoje" (não está atrasada: a janela ainda está aberta)
      return hoje >= ini ? { ...p, situacao: 'hoje', atraso: 0 } : p;
    }
    default:
      return null;
  }
}

/** Em que card do fluxo o lead está agora (para a contagem no mapa e no calendário). */
export function itemDoLead(lead: Lead, hoje: string): string {
  switch (lead.status) {
    case 'aberto': return passoFeito(lead, passoPorId('primeiro')) ? 'primeiro' : 'aberto';
    case 'sem_retorno': {
      const p = proximoPasso(lead, hoje);
      return p ? passoPorId(p.passo.id).item : 'semretorno';
    }
    case 'negociacao': return lead.retornoData ? 'retorno' : 'negociacao';
    case 'agendado': return 'agendado';
    case 'convertido_ativo': return 'ativo';
    case 'convertido_organico': return 'organico';
    case 'descarte': return lead.reativacaoTentada ? 'reativacao' : 'descarte';
  }
}

// ------------------------------------------------------------------------------------------------ regras de ouro no contato

export function tentativasHoje(lead: Lead, hoje: string) {
  return lead.eventos.filter((e) => e.tipo === 'contato' && diaDoInstante(e.quando) === hoje).length;
}

export function podeContatar(lead: Lead, agora: Date): { ok: boolean; motivo?: string } {
  if (ehTerminal(lead.status)) return { ok: false, motivo: 'Este lead já converteu: não entre em contato.' };
  const hoje = hojeDe(agora);
  const { h } = horaDe(agora);
  if (h < LIMITES.janelaInicioH || h >= LIMITES.janelaFimH) return { ok: false, motivo: `Contatos só entre ${LIMITES.janelaInicioH}h e ${LIMITES.janelaFimH}h. Sem exceção.` };
  if (tentativasHoje(lead, hoje) >= LIMITES.tentativasPorDia) return { ok: false, motivo: `Máximo de ${LIMITES.tentativasPorDia} tentativas por dia já atingido para este lead.` };
  if (lead.status === 'descarte') {
    const p = proximoPasso(lead, hoje);
    if (!p || p.situacao === 'futura') return { ok: false, motivo: 'Lead descartado: só a reativação (30 a 60 dias depois) permite novo contato.' };
  }
  return { ok: true };
}

// ------------------------------------------------------------------------------------------------ ações

export type Acao =
  | { tipo: 'contato'; canal: Canal; naoFoiRecepcao: boolean; passo?: string; msg?: number; texto?: string; atendente?: string; auto?: boolean }
  | { tipo: 'resposta'; botao?: string; atendente?: string; texto?: string; intencao?: string; msgId?: string; msg?: number; soRegistrar?: boolean }
  | { tipo: 'agendou'; data: string; hora?: string; exame?: string; atendente?: string }
  | { tipo: 'retorno'; data: string; atendente?: string }
  | { tipo: 'parou'; atendente?: string }
  | { tipo: 'compareceu'; atendente?: string }
  | { tipo: 'noshow'; atendente?: string }
  | { tipo: 'descartar'; motivo: string; atendente?: string }
  | { tipo: 'recepcao'; atendente?: string }
  | { tipo: 'nota'; texto: string; atendente?: string }
  | { tipo: 'editar'; campos: Partial<Pick<Lead, 'nome' | 'telefone' | 'exame' | 'valor' | 'origem' | 'unidade' | 'atendente' | 'obs'>>; atendente?: string };

export function aplicar(lead: Lead, a: Acao, agora: Date): void {
  const hoje = hojeDe(agora);
  const por = a.atendente;
  const ev = (e: Omit<EventoLead, 'id' | 'quando'>) => evento(lead, agora, { atendente: por, ...e });

  switch (a.tipo) {
    case 'contato': {
      if (a.naoFoiRecepcao !== true) throw erro('recepcao', 'Antes de cada contato: confirme se o paciente já foi à recepção. Se foi, não entre em contato.');
      const pc = podeContatar(lead, agora);
      if (!pc.ok) throw erro('regra', pc.motivo!);
      if (a.canal !== 'whatsapp' && a.canal !== 'ligacao') throw erro('dados', 'Informe o canal: WhatsApp ou ligação.');
      let passo: string | undefined;
      if (a.passo) {
        const prox = proximoPasso(lead, hoje);
        if (!prox || prox.passo.id !== a.passo) throw erro('passo', 'Este não é o passo atual do lead.');
        if (prox.passo.decisao) throw erro('passo', 'Este passo é uma decisão, não um contato.');
        if (prox.situacao === 'futura') throw erro('passo', `Este passo só vence em ${prox.vence}.`);
        passo = prox.passo.id;
      }
      const def = passo ? passoPorId(passo) : undefined;
      ev({ tipo: 'contato', canal: a.canal, msg: a.msg ?? def?.msg, passo, auto: a.auto || undefined, texto: a.texto?.trim().slice(0, 1500) || `${a.canal === 'whatsapp' ? 'WhatsApp' : 'Ligação'}${def ? ` · ${def.rotulo}` : ' · contato livre'}` });
      if (passo === 'noshow') lead.noShow = undefined;
      if (passo === 'retorno') lead.retornoData = undefined;
      if (passo === 'reativacao') lead.reativacaoTentada = hoje;
      return;
    }
    case 'resposta': {
      if (ehTerminal(lead.status)) throw erro('estado', 'Este lead já converteu.');
      const botao = a.botao ? ` (botão: ${a.botao})` : '';
      const citado = a.texto ? `: “${a.texto.replace(/\s+/g, ' ').trim().slice(0, 300)}”` : '';
      const extra = { intencao: a.intencao, msgId: a.msgId, msg: a.msg, resp: a.texto ? a.texto.slice(0, 500) : undefined };
      if (a.soRegistrar) { ev({ tipo: 'resposta', texto: `O paciente respondeu${botao}${citado}.`, ...extra }); return; }
      if (lead.status === 'aberto' || lead.status === 'sem_retorno') {
        ev({ tipo: 'resposta', texto: `O paciente respondeu${botao}${citado}. Segue para Em negociação.`, ...extra });
        entrar(lead, 'negociacao', hoje);
        ev({ tipo: 'etapa', texto: 'Entrou em Em negociação (D0 da negociação).' });
      } else if (lead.status === 'descarte') {
        if (!lead.reativacaoTentada) throw erro('estado', 'Lead descartado: só responde depois da reativação.');
        ev({ tipo: 'resposta', texto: `O paciente respondeu à reativação${botao}${citado}. Volta para Em negociação.`, ...extra });
        lead.descarte = undefined;
        entrar(lead, 'negociacao', hoje);
        ev({ tipo: 'etapa', texto: 'Reativado: voltou para Em negociação.' });
      } else {
        ev({ tipo: 'resposta', texto: `O paciente respondeu${botao}${citado}.`, ...extra });
      }
      return;
    }
    case 'agendou': {
      if (ehTerminal(lead.status) || lead.status === 'agendado') throw erro('estado', 'Este lead não pode ser agendado agora.');
      if (!DIA_OK.test(a.data ?? '')) throw erro('dados', 'Informe a data do agendamento.');
      if (a.data < hoje) throw erro('dados', 'A data do agendamento não pode ser no passado.');
      const de = lead.status;
      lead.descarte = undefined;
      entrar(lead, 'agendado', hoje);
      lead.agendamento = { data: a.data, hora: a.hora?.trim() || undefined, exame: a.exame?.trim() || lead.exame || undefined };
      evento(lead, agora, { atendente: por, tipo: 'agendamento', texto: `Agendou para ${a.data}${a.hora ? ` às ${a.hora}` : ''}${lead.agendamento.exame ? ` · ${lead.agendamento.exame}` : ''} (vinha de ${de}).` });
      evento(lead, agora, { tipo: 'automacao', auto: true, texto: 'Confirmação automática registrada.' });
      return;
    }
    case 'retorno': {
      if (lead.status !== 'negociacao') throw erro('estado', 'Retorno personalizado só existe em Em negociação.');
      if (!DIA_OK.test(a.data ?? '') || a.data < hoje) throw erro('dados', 'Informe a data combinada (hoje ou depois).');
      lead.retornoData = a.data;
      ev({ tipo: 'retorno', texto: `Deu uma data: retorno personalizado em ${a.data} (mensagem 9).` });
      return;
    }
    case 'parou': {
      if (lead.status !== 'negociacao') throw erro('estado', '"Parou de responder" vale para leads Em negociação.');
      entrar(lead, 'sem_retorno', hoje, { pulados: ['tentativa', 'desconto'] });
      ev({ tipo: 'etapa', texto: 'Parou de responder: foi para Sem retorno (próximo passo: Encerramento).' });
      return;
    }
    case 'compareceu': {
      if (lead.status !== 'agendado') throw erro('estado', 'Só leads Agendados podem ser marcados como compareceu.');
      entrar(lead, 'convertido_ativo', hoje);
      ev({ tipo: 'comparecimento', texto: 'Compareceu e pagou: Convertido ativo.' });
      return;
    }
    case 'noshow': {
      if (lead.status !== 'agendado') throw erro('estado', 'Só leads Agendados podem ter no show.');
      entrar(lead, 'negociacao', hoje, { pulados: ['orcamento'], noShow: true });
      ev({ tipo: 'comparecimento', texto: 'No show: voltou para Em negociação. Enviar a mensagem 10 (1ª prioridade do dia).' });
      return;
    }
    case 'descartar': {
      if (!ABERTOS.includes(lead.status)) throw erro('estado', lead.status === 'agendado' ? 'Lead agendado: registre o comparecimento ou o no show antes.' : 'Este lead não pode ser descartado agora.');
      if (!(MOTIVOS_DESCARTE as readonly string[]).includes(a.motivo)) throw erro('motivo', 'Descarte sempre com motivo: escolha Preço, Outro lugar, Desistiu, Plano, Sem retorno ou Outro.');
      const de = lead.status;
      entrar(lead, 'descarte', hoje);
      lead.descarte = { motivo: a.motivo, quando: hoje, de };
      lead.reativacaoTentada = undefined;
      ev({ tipo: 'descarte', texto: `Descartado. Motivo: ${a.motivo}.` });
      return;
    }
    case 'recepcao': {
      if (ehTerminal(lead.status)) throw erro('estado', 'Este lead já converteu.');
      lead.descarte = undefined;
      entrar(lead, 'convertido_organico', hoje);
      ev({ tipo: 'recepcao', texto: 'O paciente já foi à recepção: Convertido orgânico. Não entrar em contato.' });
      return;
    }
    case 'nota': {
      const t = a.texto?.trim();
      if (!t) throw erro('dados', 'Escreva a anotação.');
      ev({ tipo: 'nota', texto: t.slice(0, 1500) });
      return;
    }
    case 'editar': {
      const c = a.campos ?? {};
      const mudou: string[] = [];
      if (c.nome !== undefined) { const v = String(c.nome).trim(); if (!v) throw erro('dados', 'O nome não pode ficar vazio.'); lead.nome = v; mudou.push('nome'); }
      if (c.telefone !== undefined) { const v = soDigitos(c.telefone); if (v.length < 10) throw erro('dados', 'Telefone inválido.'); lead.telefone = v; mudou.push('telefone'); }
      if (c.exame !== undefined) { lead.exame = String(c.exame).trim(); mudou.push('exame'); }
      if (c.valor !== undefined) { const v = Number(c.valor); if (!Number.isFinite(v) || v < 0) throw erro('dados', 'Valor inválido.'); lead.valor = v; mudou.push('valor'); }
      if (c.origem !== undefined) { lead.origem = String(c.origem).trim() || undefined; mudou.push('origem'); }
      if (c.unidade !== undefined) { lead.unidade = String(c.unidade).trim() || undefined; mudou.push('unidade'); }
      if (c.atendente !== undefined) { lead.atendente = String(c.atendente).trim() || undefined; mudou.push('atendente'); }
      if (c.obs !== undefined) { lead.obs = String(c.obs).trim() || undefined; mudou.push('observação'); }
      if (mudou.length) ev({ tipo: 'edicao', texto: `Editou: ${mudou.join(', ')}.` });
      return;
    }
  }
}

// ------------------------------------------------------------------------------------------------ automações do tempo

/** Aplica o que o guia faz sozinho com o passar dos dias. Idempotente. Devolve quantas mudanças fez. */
/** Parâmetros das duas automações do próprio guia (editáveis na tela de automações). Padrão = o guia. */
export type CfgAuto = { semResposta: { ativa: boolean; dia: number }; descarteD8: { ativa: boolean; dias: number } };
export const CFG_PADRAO: CfgAuto = { semResposta: { ativa: true, dia: 3 }, descarteD8: { ativa: true, dias: 1 } };

export function automatizar(lead: Lead, agora: Date, cfg: CfgAuto = CFG_PADRAO): number {
  const hoje = hojeDe(agora);
  let mudou = 0;
  // Em aberto: contatou e não respondeu até o D3 -> segue para Sem retorno (nova tentativa no D3, às 11:30)
  if (cfg.semResposta.ativa && lead.status === 'aberto' && passoFeito(lead, passoPorId('primeiro'))) {
    const ultimo = contatosDoPasso(lead, 'primeiro').map((e) => diaDoInstante(e.quando)).sort().pop()!;
    const quando = maxDia(somaDias(lead.d0, cfg.semResposta.dia), somaDias(ultimo, 1));
    if (hoje >= quando) {
      entrar(lead, 'sem_retorno', quando);
      evento(lead, agora, { tipo: 'automacao', auto: true, texto: `Sem resposta ao primeiro contato: foi para Sem retorno (nova tentativa no D${cfg.semResposta.dia}).` });
      mudou++;
    }
  }
  // Sem retorno: depois do encerramento (D7), no D8 descarta com o motivo "Sem retorno"
  if (cfg.descarteD8.ativa && lead.status === 'sem_retorno' && passoFeito(lead, passoPorId('encerramento'))) {
    const dia = contatosDoPasso(lead, 'encerramento').map((e) => diaDoInstante(e.quando)).sort().pop()!;
    if (diffDias(dia, hoje) >= cfg.descarteD8.dias) {
      const de = lead.status;
      entrar(lead, 'descarte', somaDias(dia, cfg.descarteD8.dias));
      lead.descarte = { motivo: 'Sem retorno', quando: somaDias(dia, cfg.descarteD8.dias), auto: true, de };
      evento(lead, agora, { tipo: 'descarte', auto: true, texto: 'D8 sem resposta ao encerramento: descartado automaticamente. Motivo: Sem retorno.' });
      mudou++;
    }
  }
  return mudou;
}

// ------------------------------------------------------------------------------------------------ ações das automações criadas pela equipe

export type AcaoAuto =
  | { tipo: 'mover'; para: 'sem_retorno' | 'negociacao' }
  | { tipo: 'descartar'; motivo: string }
  | { tipo: 'atribuir'; atendente: string }
  | { tipo: 'etiqueta'; texto: string }
  | { tipo: 'nota'; texto: string }
  | { tipo: 'alerta'; texto: string }
  | { tipo: 'mensagem'; texto: string };

const preencherTexto = (t: string, l: Lead) => t.replace(/\[Nome\]/g, l.nome.split(' ')[0]).replace(/\[Valor\]/g, `R$ ${Math.round(l.valor)}`).replace(/\[Exame\]/g, l.exame || 'exame').replace(/\[Atendente\]/g, l.atendente || '[Atendente]');

/** Executa UMA ação de uma automação num lead. Lança RegraError se a ação não cabe no estado atual do lead. */
export function executarAcaoAuto(lead: Lead, a: AcaoAuto, agora: Date, nomeRegra: string): string {
  const hoje = hojeDe(agora);
  const rot = `Automação "${nomeRegra}"`;
  switch (a.tipo) {
    case 'mover': {
      if (!ABERTOS.includes(lead.status) || lead.status === a.para) throw erro('estado', 'O lead não pode ser movido para essa etapa agora.');
      const de = lead.status;
      entrar(lead, a.para, hoje);
      if (a.para === 'sem_retorno') evento(lead, agora, { tipo: 'automacao', auto: true, texto: `${rot}: foi para Sem retorno (vinha de ${de}).` });
      else evento(lead, agora, { tipo: 'etapa', auto: true, texto: `${rot}: entrou em Em negociação (vinha de ${de}).` });
      return `movido para ${a.para === 'sem_retorno' ? 'Sem retorno' : 'Em negociação'}`;
    }
    case 'descartar': {
      if (!ABERTOS.includes(lead.status)) throw erro('estado', 'Este lead não pode ser descartado agora.');
      if (!(MOTIVOS_DESCARTE as readonly string[]).includes(a.motivo)) throw erro('motivo', 'Descarte sempre com motivo válido.');
      const de = lead.status;
      entrar(lead, 'descarte', hoje);
      lead.descarte = { motivo: a.motivo, quando: hoje, auto: true, de };
      lead.reativacaoTentada = undefined;
      evento(lead, agora, { tipo: 'descarte', auto: true, texto: `${rot}: descartado. Motivo: ${a.motivo}.` });
      return `descartado (${a.motivo})`;
    }
    case 'atribuir': {
      if (!a.atendente.trim()) throw erro('dados', 'Informe o responsável.');
      lead.atendente = a.atendente.trim();
      evento(lead, agora, { tipo: 'nota', auto: true, atendente: lead.atendente, texto: `${rot}: responsável passou a ser ${lead.atendente}.` });
      return `atribuído a ${lead.atendente}`;
    }
    case 'etiqueta': {
      const t = a.texto.trim().slice(0, 30);
      if (!t) throw erro('dados', 'Informe a etiqueta.');
      lead.etiquetas = [...new Set([...(lead.etiquetas ?? []), t])];
      evento(lead, agora, { tipo: 'nota', auto: true, texto: `${rot}: etiqueta "${t}".` });
      return `etiqueta "${t}"`;
    }
    case 'nota':
    case 'alerta': {
      const t = preencherTexto(a.texto.trim().slice(0, 300), lead);
      if (!t) throw erro('dados', 'Informe o texto.');
      evento(lead, agora, { tipo: 'nota', auto: true, texto: `${rot}${a.tipo === 'alerta' ? ' (alerta)' : ''}: ${t}` });
      return a.tipo === 'alerta' ? `alerta: ${t}` : 'nota registrada';
    }
    case 'mensagem': {
      const t = preencherTexto(a.texto.trim().slice(0, 1000), lead);
      if (!t) throw erro('dados', 'Escreva o texto da mensagem.');
      evento(lead, agora, { tipo: 'nota', auto: true, texto: `${rot} (mensagem pronta para enviar): ${t}` });
      return `mensagem pronta: ${t}`;
    }
  }
}

// ------------------------------------------------------------------------------------------------ visões para a tela

export type Vista = {
  item: string;
  /** dia atual da cadência do lead (D#) */
  dia: number;
  proximo: (Proximo & { msg?: number }) | null;
  limite: { dias: number; usados: number; excedido: boolean } | null;
  tentativasHoje: number;
  contato: { ok: boolean; motivo?: string };
  reativacao?: { inicio: string; fim: string; situacao: 'aguardando' | 'aberta' | 'encerrada' };
};

export function vistaDoLead(lead: Lead, agora: Date): Vista {
  const hoje = hojeDe(agora);
  const proximo = proximoPasso(lead, hoje);
  let limite: Vista['limite'] = null;
  if (lead.status === 'aberto') { const u = diffDias(lead.d0, hoje); limite = { dias: LIMITES.aberto, usados: u, excedido: u > LIMITES.aberto }; }
  else if (lead.status === 'sem_retorno') { const u = diffDias(lead.statusDesde, hoje); limite = { dias: LIMITES.sem_retorno, usados: u, excedido: u > LIMITES.sem_retorno }; }
  else if (lead.status === 'negociacao') { const u = diffDias(lead.statusDesde, hoje); limite = { dias: LIMITES.negociacao, usados: u, excedido: u > LIMITES.negociacao }; }
  const dia = lead.status === 'negociacao' ? diffDias(lead.negD0 ?? lead.statusDesde, hoje) : diffDias(lead.d0, hoje);
  let reativacao: Vista['reativacao'];
  if (lead.status === 'descarte' && lead.descarte) {
    const inicio = somaDias(lead.descarte.quando, LIMITES.reativacaoMinDias);
    const fim = somaDias(lead.descarte.quando, LIMITES.reativacaoMaxDias);
    reativacao = { inicio, fim, situacao: hoje < inicio ? 'aguardando' : hoje <= fim ? 'aberta' : 'encerrada' };
  }
  return { item: itemDoLead(lead, hoje), dia, proximo: proximo ? { ...proximo, msg: proximo.passo.msg } : null, limite, tentativasHoje: tentativasHoje(lead, hoje), contato: podeContatar(lead, agora), reativacao };
}

export type Tarefa = { leadId: string; passoId: string; vence: string; situacao: Situacao; atraso: number; prioridade: 1 | 2 | 3 };

/** A fila do dia: só o que venceu (hoje ou atrasado), ordenada por prioridade: 1º No show, 2º leads novos em aberto, depois o resto. */
export function tarefasDoDia(leads: Lead[], agora: Date): Tarefa[] {
  const hoje = hojeDe(agora);
  const out: (Tarefa & { valor: number })[] = [];
  for (const l of leads) {
    const p = proximoPasso(l, hoje);
    if (!p || p.situacao === 'futura') continue;
    out.push({ leadId: l.id, passoId: p.passo.id, vence: p.vence, situacao: p.situacao, atraso: p.atraso, prioridade: p.prioridade, valor: l.valor });
  }
  return out.sort((a, b) => a.prioridade - b.prioridade || b.atraso - a.atraso || b.valor - a.valor).map(({ valor: _v, ...t }) => t);
}

export function resumo(leads: Lead[], agora: Date) {
  const hoje = hojeDe(agora);
  const porStatus: Record<string, number> = {};
  const motivos: Record<string, number> = {};
  const porDia: Record<string, number> = {};
  for (const l of leads) {
    porStatus[l.status] = (porStatus[l.status] ?? 0) + 1;
    for (const e of l.eventos) {
      if (e.tipo === 'descarte') { const m = /Motivo: ([^.]+)\./.exec(e.texto)?.[1]; if (m) motivos[m] = (motivos[m] ?? 0) + 1; }
      if (e.tipo === 'contato') { const d = diaDoInstante(e.quando); porDia[d] = (porDia[d] ?? 0) + 1; }
    }
  }
  const dias14: { dia: string; contatos: number }[] = [];
  for (let i = 13; i >= 0; i--) { const d = somaDias(hoje, -i); dias14.push({ dia: d, contatos: porDia[d] ?? 0 }); }
  const total = leads.length;
  const ativos = porStatus.convertido_ativo ?? 0;
  const organicos = porStatus.convertido_organico ?? 0;
  const descartados = porStatus.descarte ?? 0;
  const encerrados = ativos + organicos + descartados;
  return {
    total, porStatus, motivos, dias14,
    taxaConversao: encerrados ? ((ativos + organicos) / encerrados) * 100 : 0,
    valorEmAberto: leads.filter((l) => ABERTOS.includes(l.status) || l.status === 'agendado').reduce((s, l) => s + l.valor, 0),
    valorConvertido: leads.filter((l) => l.status === 'convertido_ativo').reduce((s, l) => s + l.valor, 0),
  };
}

/**
 * Leva o lead para um status porque o card do funil de Orçamentos foi para a etapa correspondente (e vice-versa).
 * Não confere as regras do guia (compareceu só depois de agendado etc.): o card já foi movido por uma pessoa, então o lead só acompanha.
 */
export function acompanharCard(lead: Lead, alvo: Status, agora: Date, etapa: string): boolean {
  if (lead.status === alvo) return false;
  const hoje = hojeDe(agora);
  const de = lead.status;
  const nota = `Acompanhou o funil de Orçamentos: o card foi para "${etapa}".`;
  entrar(lead, alvo, hoje);
  if (alvo === 'agendado') lead.agendamento = { data: hoje, exame: lead.exame || undefined };
  if (alvo === 'descarte') lead.descarte = { motivo: /sem retorno/i.test(etapa) ? 'Sem retorno' : 'Outro', quando: hoje, de, auto: true };
  else lead.descarte = undefined;
  const tipo: TipoEvento = alvo === 'convertido_ativo' ? 'comparecimento' : alvo === 'convertido_organico' ? 'recepcao' : alvo === 'descarte' ? 'descarte' : alvo === 'agendado' ? 'agendamento' : 'etapa';
  evento(lead, agora, { tipo, texto: nota, auto: true });
  return true;
}
