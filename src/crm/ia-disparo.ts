import { paraE164Brasil } from '../integrations/inovstar.js';
import { aplicar, diaDoInstante, hojeDe, horaDe, proximoPasso, vistaDoLead, type Lead } from './motor.js';
import type { PassoDef } from './modelo.js';
import type { Estado } from './banco.js';
import type { DetalheRodada, DisparoAutoCfg, ModoAuto, Rodada } from './disparo-auto-tipos.js';
import { DisparoError, MODELOS, checarEnvio, disparoAtivo, enviarModelo, modelosParaLead } from './whatsapp.js';

/**
 * IA de disparo: o agente ATIVO do CRM. Faz sozinha os envios da cadência do guia, no horário de cada passo, sem ninguém clicar.
 * (O agente receptivo, Amanda, é outro sistema e não entra aqui.)
 *
 * O que ela envia: só passos com mensagem pronta e todas as variáveis conhecidas (1º contato, nova tentativa, desconto,
 * encerramento e no-show), no DIA em que vencem e a partir do horário do passo. Passo atrasado não é enviado sozinho: a
 * cadência já passou e a decisão é de uma pessoa. Cada envio passa pelas MESMAS travas do envio manual (checarEnvio:
 * janela 8h às 19h, 2 contatos por dia, já foi à recepção, mesmo modelo 24 h, limite do dia, lista de teste).
 *
 * Modos (guardados no CRM, por quem tem acesso): desligado, sombra (decide e anota o que enviaria, sem enviar) e ligado.
 * DISPARO_AUTO=desligado no ambiente força desligado, qualquer que seja o modo.
 */

/** Passos que a IA pode enviar sozinha (todos têm hora no guia e um modelo aprovado). */
export const PASSOS_AUTO = new Set(['primeiro', 'tentativa', 'desconto', 'encerramento', 'noshow']);
const porRodada = () => Number(process.env.DISPARO_AUTO_POR_RODADA) || 20;

export const modoDisparoAuto = (estado: Estado): ModoAuto => {
  if (process.env.DISPARO_AUTO === 'desligado') return 'desligado';
  return estado.disparoAuto?.modo ?? 'desligado';
};

export function definirModoDisparoAuto(estado: Estado, modo: ModoAuto, quem: string, agora: Date): DisparoAutoCfg {
  if (!['desligado', 'sombra', 'ligado'].includes(modo)) throw new DisparoError('modo', 'Modo inválido.', 400);
  estado.disparoAuto = { ...(estado.disparoAuto ?? { modo }), modo, alteradoPor: quem, alteradoEm: agora.toISOString() };
  return estado.disparoAuto;
}

type Avaliacao =
  | { tipo: 'pronto'; passo: PassoDef; modelo: string; parametros: string[]; msg: number }
  | { tipo: 'espera'; motivo: string; passo: PassoDef }
  | { tipo: 'pulado'; motivo: string; passo: PassoDef };

const minutos = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

/** O que fazer com este lead agora. null = não tem passo automático (nada a dizer sobre ele). */
export function avaliarLead(estado: Estado, l: Lead, agora: Date, opcoes: { ignorarLista?: boolean } = {}): Avaliacao | null {
  if (l.demo) return null;
  const hoje = hojeDe(agora);
  const px = proximoPasso(l, hoje);
  if (!px || !PASSOS_AUTO.has(px.passo.id) || px.situacao === 'futura') return null;
  const passo = px.passo, msg = passo.msg;
  const modelo = MODELOS.find((m) => m.msg === msg);
  if (!msg || !modelo) return null;
  if (l.semDisparoAuto) return { tipo: 'pulado', motivo: 'Pediu para não receber mensagens', passo };
  if (px.situacao === 'atrasada') return { tipo: 'pulado', motivo: 'Passo atrasado: só uma pessoa decide', passo };
  // WhatsApp deste passo já enviado (por quem for): a ligação que falta, quando há, é de uma pessoa
  if (l.eventos.some((e) => e.tipo === 'contato' && e.passo === passo.id && e.fase === l.faseId && e.canal === 'whatsapp')) return { tipo: 'pulado', motivo: 'WhatsApp deste passo já foi enviado', passo };
  const hh = passo.hora ?? '08:30', t = horaDe(agora);
  if (t.h * 60 + t.m < minutos(hh)) return { tipo: 'espera', motivo: `Aguardando o horário do passo (${hh})`, passo };
  if (!paraE164Brasil(l.telefone)) return { tipo: 'pulado', motivo: 'Telefone inválido', passo };
  const v = modelosParaLead(estado, l).find((m) => m.id === modelo.id)!;
  const parametros = v.variaveis.map((x) => (x.id === 'atendente' && !x.valor ? 'a equipe' : x.valor.trim()));
  const faltam = v.variaveis.filter((x, i) => !parametros[i]).map((x) => x.rotulo);
  if (faltam.length) return { tipo: 'pulado', motivo: `Faltam dados: ${faltam.join(', ')}`, passo };
  const bloqueio = checarEnvio(estado, l, modelo.id, agora, { ignorarLista: opcoes.ignorarLista });
  if (bloqueio) return { tipo: 'pulado', motivo: bloqueio.message, passo };
  return { tipo: 'pronto', passo, modelo: modelo.id, parametros, msg };
}

/** Quem a IA enviaria agora, na ordem do guia (no show primeiro, depois leads novos, depois o maior valor), mais quem ficou de fora e por quê. */
export function fila(estado: Estado, agora: Date, opcoes: { ignorarLista?: boolean } = {}) {
  const hoje = hojeDe(agora);
  const itens: { lead: Lead; av: Avaliacao; prioridade: number }[] = [];
  for (const l of estado.leads) {
    const av = avaliarLead(estado, l, agora, opcoes);
    if (av) itens.push({ lead: l, av, prioridade: proximoPasso(l, hoje)?.prioridade ?? 3 });
  }
  itens.sort((a, b) => a.prioridade - b.prioridade || b.lead.valor - a.lead.valor);
  return itens;
}

/** Códigos que param a rodada inteira (nada adianta tentar o próximo lead). */
const PARA_TUDO = new Set(['desligado', 'config', 'limite']);

export type OpcoesRodada = {
  modo?: ModoAuto;
  max?: number;
  /** chamado depois de cada envio: o chamador grava no banco antes do próximo (outra instância não pode ver o lead sem o envio) */
  gravar?: () => Promise<void>;
};

/** Uma rodada da IA. Quem chama (cron, botão "rodar agora") cuida de travar para não haver duas ao mesmo tempo. */
export async function rodarDisparoAuto(estado: Estado, agora: Date, opcoes: OpcoesRodada = {}): Promise<Rodada> {
  const modo = opcoes.modo ?? modoDisparoAuto(estado);
  const r: Rodada = { quando: agora.toISOString(), modo, avaliados: 0, enviados: 0, sombra: 0, erros: 0, pulados: {}, detalhes: [] };
  const conta = (m: string) => { r.pulados[m] = (r.pulados[m] ?? 0) + 1; };
  const grava = async () => { estado.disparoAuto = { ...(estado.disparoAuto ?? { modo: 'desligado' }), ultimaRodada: r }; if (opcoes.gravar) await opcoes.gravar(); };
  if (modo === 'desligado') { r.pulados['IA desligada'] = 1; await grava(); return r; }
  if (modo === 'ligado' && !disparoAtivo()) { r.pulados['O disparo de WhatsApp está desligado neste ambiente (DISPARO_WHATSAPP)'] = 1; await grava(); return r; }

  const hoje = hojeDe(agora), max = opcoes.max ?? porRodada();
  const itens = fila(estado, agora, { ignorarLista: modo === 'sombra' });
  let feitos = 0;
  for (const { lead, av } of itens) {
    r.avaliados++;
    const base = { leadId: lead.id, nome: lead.nome, passo: av.passo.rotulo, msg: av.passo.msg };
    if (av.tipo !== 'pronto') { conta(av.motivo); if (r.detalhes.length < 60) r.detalhes.push({ ...base, resultado: 'pulado', motivo: av.motivo }); continue; }
    if (feitos >= max) { conta(`Fica para a próxima rodada (máximo de ${max} por rodada)`); continue; }
    const det: DetalheRodada = { ...base, modelo: av.modelo, variaveis: av.parametros, resultado: 'sombra' };
    if (modo === 'sombra') {
      const sinal = `IA (sombra): enviaria a Msg ${av.msg} `;
      const jaAnotou = lead.eventos.some((e) => e.tipo === 'nota' && e.texto.startsWith(sinal) && diaDoInstante(e.quando) === hoje);
      if (!jaAnotou) aplicar(lead, { tipo: 'nota', texto: `${sinal}(${av.passo.rotulo}, modelo ${av.modelo}) agora, sem enviar. Variáveis: ${av.parametros.join(' | ')}`, atendente: 'IA' }, agora);
      r.sombra++; feitos++; r.detalhes.length < 60 && r.detalhes.push(det);
      continue;
    }
    try {
      await enviarModelo(estado, lead, { modelo: av.modelo, parametros: av.parametros, passo: av.passo.id, msg: av.msg, atendente: 'IA', auto: true }, agora);
      r.enviados++; feitos++; det.resultado = 'enviado';
      if (opcoes.gravar) await opcoes.gravar(); // o envio vai para o banco antes do próximo
    } catch (e) {
      const cod = e instanceof DisparoError ? e.codigo : 'erro';
      det.resultado = cod === 'envio' || cod === 'erro' ? 'erro' : 'pulado'; det.motivo = (e as Error).message;
      if (det.resultado === 'erro') r.erros++; else conta(det.motivo);
      if (PARA_TUDO.has(cod)) { r.detalhes.length < 60 && r.detalhes.push(det); break; }
    }
    if (r.detalhes.length < 60) r.detalhes.push(det);
  }
  await grava();
  return r;
}
