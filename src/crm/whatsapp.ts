import { env } from '../lib/env.js';
import { paraE164Brasil, sendTemplate } from '../integrations/inovstar.js';
import { aplicar, automatizar, hojeDe, vistaDoLead, type Lead } from './motor.js';
import type { Estado } from './banco.js';
import type { CardSnap } from './pipeline/tipos.js';

/**
 * Disparo de WhatsApp pelo CRM, por MODELO aprovado na Meta (a empresa escreve primeiro, então texto livre não vale).
 * Mesmo contrato do app antigo: POST /api/whatsapp/send/template da Inovstar, só corpo, variáveis posicionais.
 * A Inovstar não lista modelos: cada um é cadastrado aqui com nome e IDIOMA EXATOS da aprovação (recuperacao_2 foi aprovado como "en").
 *
 * Travas (o envio é para pacientes reais):
 *  - desligado por padrão: precisa de DISPARO_WHATSAPP=true;
 *  - só para os números de ALLOWED_NUMBERS enquanto DISPARO_LIBERADO não for "true";
 *  - respeita as regras de contato do guia (janela de horário, tentativas por dia, "já foi à recepção?");
 *  - no máximo DISPARO_LIMITE_DIA envios por dia (padrão 100) e o mesmo modelo não volta ao mesmo lead em 24 h.
 */

export class DisparoError extends Error {
  constructor(public codigo: string, mensagem: string, public status = 422) { super(mensagem); }
}

type Variavel = { id: string; rotulo: string; padrao: (l: Lead, card?: CardSnap) => string };
/** `msg` = número da mensagem do guia que o modelo leva (a tela já escolhe o modelo do passo do lead). */
export type Modelo = { id: string; idioma: string; titulo: string; msg?: number; variaveis: Variavel[] };

const NOME_MINUSCULO = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
export const nomeBonito = (n: string) => n.toLowerCase().split(/\s+/).filter(Boolean).map((p, i) => (i > 0 && NOME_MINUSCULO.has(p) ? p : p[0].toUpperCase() + p.slice(1))).join(' ');
const empresa = (l: Lead) => (l.unidade ? `Clinex ${nomeBonito(l.unidade.replace(/^clinex\s+/i, ''))}` : 'Clinex');
const reais = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const itens = (l: Lead, c?: CardSnap) => (c?.itens.length ? c.itens.join(', ') : l.exame || '—');
/** dia da falta (data do agendamento do card, no fuso de Belém) como dd/mm/aaaa; vazio se o lead não veio de um card */
const dataDaFalta = (_l: Lead, c?: CardSnap) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(c?.criadoEm ?? ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
/** guia, mensagem 3: 10% ou 5% conforme o orçamento. O padrão é 10%; a tela deixa trocar antes de enviar. */
const comDesconto = (l: Lead) => reais(Math.round(l.valor * 0.9 * 100) / 100);

const V = {
  nome: { id: 'nome', rotulo: 'Nome do paciente', padrao: (l: Lead) => nomeBonito(l.nome) },
  empresa: { id: 'empresa', rotulo: 'Clínica / unidade', padrao: empresa },
  valor: { id: 'valor', rotulo: 'Valor', padrao: (l: Lead) => reais(l.valor) },
  itens: { id: 'itens', rotulo: 'Itens do orçamento', padrao: itens },
  solicitante: { id: 'solicitante', rotulo: 'Solicitante', padrao: (l: Lead, c?: CardSnap) => c?.subtitulo || '—' },
  exame: { id: 'exame', rotulo: 'Exame ou consulta', padrao: itens },
  atendente: { id: 'atendente', rotulo: 'Atendente', padrao: (l: Lead) => (l.atendente ? nomeBonito(l.atendente) : '') },
  prazo: { id: 'prazo', rotulo: 'Prazo (hoje / esta semana / este mês)', padrao: () => 'esta semana' },
  desconto: { id: 'desconto', rotulo: 'Desconto (10% ou 5%)', padrao: () => '10%' },
  valorComDesconto: { id: 'valorComDesconto', rotulo: 'Valor com desconto', padrao: comDesconto },
  dataFalta: { id: 'dataFalta', rotulo: 'Data da falta', padrao: dataDaFalta },
  dia1: { id: 'dia1', rotulo: '1º dia oferecido', padrao: () => '' }, hora1: { id: 'hora1', rotulo: '1º horário', padrao: () => '' },
  dia2: { id: 'dia2', rotulo: '2º dia oferecido', padrao: () => '' }, hora2: { id: 'hora2', rotulo: '2º horário', padrao: () => '' },
  campanha: { id: 'campanha', rotulo: 'Condição da campanha do mês', padrao: () => '' },
} satisfies Record<string, Variavel>;

/** A ordem das variáveis TEM que bater com {{1}}, {{2}}... do modelo aprovado na Meta. */
/**
 * Modelos que existem no WhatsApp Manager da Clinex (conferido em 10/11/2026). O idioma é o do cadastro na Meta, que não
 * precisa ser o do texto: faltoso_no_show, reativacao, follow_up e recuperacao_2 foram cadastrados como "English" (en).
 * As variáveis dos modelos do guia seguem a ordem dos campos [entre colchetes] de cada mensagem do guia; a tela mostra
 * cada uma antes do envio e o envio só vai para os números de teste até a liberação.
 */
export const MODELOS: Modelo[] = [
  { id: 'primeiro_contato', idioma: 'pt_BR', titulo: 'Primeiro contato', msg: 1, variaveis: [V.nome, V.atendente, V.exame] },
  { id: 'nova_tentativa_d3', idioma: 'pt_BR', titulo: 'Nova tentativa (D3)', msg: 2, variaveis: [V.nome, V.exame, V.prazo] },
  { id: 'desconto_d4', idioma: 'pt_BR', titulo: 'Desconto (D4)', msg: 3, variaveis: [V.nome, V.desconto, V.exame, V.valor, V.valorComDesconto] },
  { id: 'encerramento_d7', idioma: 'pt_BR', titulo: 'Encerramento (D7)', msg: 4, variaveis: [V.nome, V.exame] },
  { id: 'retorno_personalizado', idioma: 'pt_BR', titulo: 'Retorno personalizado', msg: 9, variaveis: [V.nome, V.exame, V.dia1, V.hora1, V.dia2, V.hora2] },
  { id: 'faltoso_no_show', idioma: 'en', titulo: 'No show', msg: 10, variaveis: [V.nome, V.exame, V.dataFalta] },
  { id: 'reativacao', idioma: 'en', titulo: 'Reativação', msg: 11, variaveis: [V.nome, V.exame, V.campanha] },
  { id: 'follow_up', idioma: 'en', titulo: 'Follow-up', variaveis: [V.nome, V.itens] },
  { id: 'recuperacao_2', idioma: 'en', titulo: 'Recuperação 2', variaveis: [V.nome, V.empresa, V.valor] },
];

// ------------------------------------------------------------------------------------------------ configuração e travas

const chaveFone = (v: string) => { let n = v.replace(/\D/g, ''); if (n.length >= 12 && n.startsWith('55')) n = n.slice(2); return n.slice(0, 2) + n.slice(-8); };
export const disparoAtivo = () => process.env.DISPARO_WHATSAPP === 'true';
export const disparoLiberado = () => process.env.DISPARO_LIBERADO === 'true';
export const limiteDia = () => Number(process.env.DISPARO_LIMITE_DIA) || 100;
const numeroPermitido = (tel: string) => disparoLiberado() || env.allowedNumbers.some((a) => chaveFone(a) === chaveFone(tel));
const MARCA = 'WhatsApp · modelo ';
const ehEnvio = (t: string) => t.startsWith(MARCA);

export function enviadosHoje(estado: Estado, agora: Date): number {
  const hoje = hojeDe(agora);
  return estado.leads.reduce((s, l) => s + l.eventos.filter((e) => e.tipo === 'contato' && ehEnvio(e.texto) && hojeDe(new Date(e.quando)) === hoje).length, 0);
}

export function statusDisparo(estado: Estado, agora: Date) {
  return { ativo: disparoAtivo(), restrito: !disparoLiberado(), numerosLiberados: env.allowedNumbers.length, limiteDia: limiteDia(), enviadosHoje: enviadosHoje(estado, agora) };
}

const cardDoLead = (estado: Estado, l: Lead) => (l.cardId ? estado.pipelines.atribuicoes.find((a) => a.cardId === l.cardId)?.originSnapshot : undefined);

/** Variáveis já preenchidas com os dados do lead (a tela deixa editar antes de enviar). */
export function modelosParaLead(estado: Estado, l: Lead) {
  const card = cardDoLead(estado, l);
  return MODELOS.map((m) => ({ id: m.id, idioma: m.idioma, titulo: m.titulo, msg: m.msg, variaveis: m.variaveis.map((v) => ({ id: v.id, rotulo: v.rotulo, valor: v.padrao(l, card) })) }));
}

const mascarar = (e164: string) => `${e164.slice(0, 3)}${'*'.repeat(Math.max(0, e164.length - 7))}${e164.slice(-4)}`;
const motivoDaInovstar = (e: Error) => {
  const corpo = e.message.replace(/^Inovstar [A-Z]+ \S+ -> \d+: /, '');
  try { const j = JSON.parse(corpo) as { error?: { message?: string } | string; message?: string }; return (typeof j.error === 'object' ? j.error?.message : j.error) ?? j.message ?? corpo; } catch { return corpo; }
};

export type PedidoEnvio = { modelo: string; parametros?: unknown; passo?: string; msg?: number; atendente?: string };

/** Valida tudo, envia e registra o contato no lead. Lança DisparoError com mensagem pronta para a tela. */
export async function enviarModelo(estado: Estado, l: Lead, p: PedidoEnvio, agora: Date): Promise<{ lead: Lead; mensagemId?: string }> {
  if (!disparoAtivo()) throw new DisparoError('desligado', 'O disparo de WhatsApp está desligado neste ambiente (DISPARO_WHATSAPP).', 403);
  if (!env.inovstarToken) throw new DisparoError('config', 'O envio de WhatsApp não está configurado neste ambiente.', 503);
  const modelo = MODELOS.find((m) => m.id === p.modelo);
  if (!modelo) throw new DisparoError('modelo', 'Modelo desconhecido.', 400);
  const params = Array.isArray(p.parametros) ? p.parametros.map((x) => String(x ?? '').trim()) : [];
  if (params.length !== modelo.variaveis.length || params.some((x) => !x)) throw new DisparoError('parametros', `Preencha as ${modelo.variaveis.length} variáveis do modelo (${modelo.variaveis.map((v) => v.rotulo).join(', ')}).`, 400);
  if (l.status === 'convertido_ativo' || l.status === 'convertido_organico' || l.status === 'descarte') throw new DisparoError('estado', 'Este lead já foi encerrado: não dá para enviar mensagem.', 409);

  const to = paraE164Brasil(l.telefone);
  if (!to) throw new DisparoError('telefone', 'Telefone inválido: confira o número do lead (DDD + número).', 400);
  if (!numeroPermitido(l.telefone)) throw new DisparoError('fora_da_lista', 'Este número não está liberado para disparo (fase de testes: só os números de ALLOWED_NUMBERS).', 403);

  const vista = vistaDoLead(l, agora).contato;
  if (!vista.ok) throw new DisparoError('regra', vista.motivo ?? 'Fora das regras de contato.', 409);
  const marca = `${MARCA}${modelo.id}`;
  if (l.eventos.some((e) => e.tipo === 'contato' && e.texto.startsWith(marca) && agora.getTime() - Date.parse(e.quando) < 24 * 3_600_000)) throw new DisparoError('duplicado', 'Este modelo já foi enviado a este lead nas últimas 24 horas.', 409);
  if (enviadosHoje(estado, agora) >= limiteDia()) throw new DisparoError('limite', `Limite de ${limiteDia()} envios por dia atingido.`, 429);

  let r: { messageId?: string };
  try { r = await sendTemplate({ to, nome: modelo.id, idioma: modelo.idioma, parametros: params, clientMessageId: `clinex-crm-${l.id}-${modelo.id}-${agora.getTime()}` }); }
  catch (e) { throw new DisparoError('envio', `O WhatsApp recusou o envio: ${motivoDaInovstar(e as Error)}`, 502); }

  // o envio já aconteceu: se o registro do contato não couber nas regras, vira nota (nunca fica sem rastro)
  const texto = `${marca} (${modelo.idioma}) para ${mascarar(to)}${r.messageId ? ` · id ${r.messageId}` : ''}\n${modelo.variaveis.map((v, i) => `${v.rotulo}: ${params[i]}`).join('\n')}`;
  try { aplicar(l, { tipo: 'contato', canal: 'whatsapp', naoFoiRecepcao: true, passo: p.passo, msg: p.msg, texto, atendente: p.atendente }, agora); }
  catch { aplicar(l, { tipo: 'nota', texto, atendente: p.atendente }, agora); }
  automatizar(l, agora);
  return { lead: l, mensagemId: r.messageId };
}
