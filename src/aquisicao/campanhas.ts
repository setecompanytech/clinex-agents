import { createHash, randomUUID } from 'node:crypto';
import { sbGravar, sbInserirNovos, sbLer, supabaseConfigurado } from '../lib/supabase.js';
import { contatoDoAtendimento, criarEtiqueta, empresaDoContato, etiquetarContato, listarEtiquetas, type MessageReceivedEvent } from '../integrations/inovstar.js';
import { evt } from '../lib/log.js';

/**
 * Funil de aquisição (pedido do usuário em 25/11/2026): campanhas de anúncio acompanhadas de ponta a ponta.
 *   clique no anúncio (link rastreado /c/CODIGO) -> site ou direto no WhatsApp -> conversa com o código (lead, etiqueta
 *   "ADS - CAMPANHA" na Inovstar) -> agendou / pagou (operadora do caixa) / foi atendido (médico e especialidade) no Clinilink.
 * Tabelas no Supabase do painel: docs/supabase-aquisicao.sql.
 */

export const T_CAMPANHAS = 'aquisicao_campanhas';
export const T_EVENTOS = 'aquisicao_eventos';
export const NUMERO_WHATSAPP = process.env.CLINIC_WHATSAPP_NUMERO ?? '5591991434370'; // o mesmo dos botões do site
export const SITE_PADRAO = process.env.CLINIC_SITE_URL ?? 'https://www.clinex.com.br';

export type Canal = 'meta' | 'google' | 'tiktok' | 'outro';
export type StatusCampanha = 'ativa' | 'pausada' | 'encerrada';
export type Campanha = {
  id: string;
  nome: string;
  codigo: string; // vai na mensagem do WhatsApp: "(ref: CODIGO)"
  canal: Canal;
  status: StatusCampanha;
  inicio: string; // AAAA-MM-DD
  fim?: string;
  investimento?: number; // R$ gastos no anúncio (informado)
  cliquesInformados?: number; // cliques que o gerenciador de anúncios mostra e o link não vê (anúncio direto pro WhatsApp)
  urlSite?: string; // página de destino quando o anúncio leva ao site
  mensagem?: string; // texto que já vem escrito no WhatsApp (o código é acrescentado no fim)
  frases?: string[]; // anúncio direto pro WhatsApp sem o código: frase da mensagem pronta do anúncio que identifica a campanha
  observacao?: string;
  criadoEm: string;
  criadoPor?: string;
};
export type EventoAq = { id: number; t: string; campanha: string; etapa: 'clique' | 'site' | 'lead'; chave: string | null; telefone: string | null; atendimento: string | null; contato: string | null; dados: Record<string, unknown> };

export const MENSAGEM_PADRAO = 'Olá! Vi o anúncio da Clinex e quero mais informações.';
export const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Código curto a partir do nome: letras e números, até 8, sem repetir os que já existem. */
export function gerarCodigo(nome: string, existentes: string[]): string {
  const base = semAcento(nome).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  let c = (base.length > 1 ? base.map((p) => (/^\d+$/.test(p) ? p : p[0])).join('') : (base[0] ?? 'ADS')).slice(0, 8);
  if (c.length < 3) c = (base.join('') + 'ADS').slice(0, 6);
  const usados = new Set(existentes.map((x) => x.toUpperCase()));
  let n = 2, cand = c;
  while (usados.has(cand)) cand = `${c.slice(0, 7)}${n++}`;
  return cand;
}
export const codigoValido = (c: string) => /^[A-Z0-9]{3,12}$/.test(c);

/** Texto que vai no WhatsApp (link rastreado): a mensagem e o código no fim; vindo do site, "-SITE" marca a origem. */
export const textoWhats = (c: Campanha, viaSite = false, base?: string) => {
  // o texto do site pode já trazer a marcação dele, "(Ref.: meta / CAMPANHA)": sai, para não ficarem duas
  const doSite = (base ?? '').replace(/\s*\(Ref\.?:[^)]*\)\s*$/i, '').trim();
  return `${doSite || (c.mensagem || MENSAGEM_PADRAO).trim()} (ref: ${c.codigo}${viaSite ? '-SITE' : ''})`;
};

// ------------------------------------------------------------------------------------------------ leitura e gravação
let cache: { em: number; lista: Campanha[]; falhou?: boolean } | null = null;
export async function listarCampanhas(fresco = false): Promise<Campanha[]> {
  if (!supabaseConfigurado()) return [];
  if (!fresco && cache && Date.now() - cache.em < (cache.falhou ? 300_000 : 60_000)) return cache.lista;
  let linhas: { id: string; dados: Campanha }[];
  try { linhas = await sbLer<{ id: string; dados: Campanha }>(T_CAMPANHAS, { ordem: 'id' }); }
  catch (e) {
    if (fresco) throw e;
    // tabela ainda não criada (docs/supabase-aquisicao.sql) ou banco fora: o webhook não tenta de novo a cada mensagem
    if (!cache?.falhou) console.warn('[aquisicao] não li as campanhas:', (e as Error).message);
    cache = { em: Date.now(), lista: [], falhou: true };
    return [];
  }
  const lista = linhas.map((l) => ({ ...l.dados, id: l.id })).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  cache = { em: Date.now(), lista };
  return lista;
}
export async function salvarCampanha(c: Campanha) {
  await sbGravar(T_CAMPANHAS, [{ id: c.id, dados: c }], 'id');
  cache = null;
}
export const novaId = () => randomUUID();
export async function campanhaPorCodigo(codigo: string): Promise<Campanha | undefined> {
  const c = codigo.toUpperCase();
  return (await listarCampanhas()).find((x) => x.codigo === c);
}

export async function lerEventos(filtro: Record<string, string> = {}): Promise<EventoAq[]> {
  return sbLer<EventoAq>(T_EVENTOS, { filtro, ordem: 'id' });
}

/** Grava um evento sem duplicar (chave única). Devolve true se entrou agora. */
export async function gravarEvento(e: Omit<EventoAq, 'id' | 't'> & { t?: string }): Promise<boolean> {
  if (!supabaseConfigurado()) return false;
  const linha = { t: e.t ?? new Date().toISOString(), campanha: e.campanha, etapa: e.etapa, chave: e.chave, telefone: e.telefone, atendimento: e.atendimento, contato: e.contato, dados: e.dados ?? {} };
  return (await sbInserirNovos(T_EVENTOS, [linha], 'chave')).length > 0;
}

/** Identificador anônimo de quem clicou (não guarda IP): hash do IP + navegador, só para não contar o mesmo clique várias vezes. */
export const visitante = (ip: string, ua: string) => createHash('sha256').update(`${ip}|${ua}|clinex-aq`).digest('hex').slice(0, 16);

// ------------------------------------------------------------------------------------------------ lead no WhatsApp
const REF = /\bref\s*[:.\-]?\s*([A-Z0-9]{3,12})(-SITE)?\b/i;
/** O próprio site da Clinex acrescenta "(Ref.: meta / CAMPANHA)" (utm_source / utm_campaign) nos botões de WhatsApp que ele abre sozinho. */
const REF_DO_SITE = /\(Ref\.?:\s*[^/()\n]*\/\s*([A-Z0-9]{3,12})\s*\)/i;

/** Qual campanha a mensagem traz? Pelo código "(ref: CODIGO)" ou por uma frase da mensagem pronta do anúncio. */
export function campanhaDaMensagem(texto: string, campanhas: Campanha[]): { campanha: Campanha; origem: 'site' | 'whatsapp'; por: 'codigo' | 'frase' } | null {
  const m = texto.match(REF);
  if (m) {
    const c = campanhas.find((x) => x.codigo === m[1].toUpperCase());
    if (c) return { campanha: c, origem: m[2] ? 'site' : 'whatsapp', por: 'codigo' };
  }
  const ms = texto.match(REF_DO_SITE);
  if (ms) {
    const c = campanhas.find((x) => x.codigo === ms[1].toUpperCase());
    if (c) return { campanha: c, origem: 'site', por: 'codigo' };
  }
  const t = semAcento(texto).replace(/\s+/g, ' ');
  for (const c of campanhas) {
    if (c.status === 'encerrada') continue;
    if ((c.frases ?? []).some((f) => { const ff = semAcento(f).replace(/\s+/g, ' ').trim(); return ff.length >= 12 && t.includes(ff); })) return { campanha: c, origem: 'whatsapp', por: 'frase' };
  }
  return null;
}

const soDigitos = (t: string) => t.replace(/\D/g, '');
const etiquetas = new Map<string, string>(); // nome -> id (cache do processo)
let empresa: string | undefined = process.env.INOVSTAR_COMPANY_ID || undefined;

/** "ADS - CAMPANHA" no contato da Inovstar: cria a etiqueta na primeira vez. */
async function etiquetar(contactId: string, campanha: Campanha): Promise<string> {
  const nome = `ADS - ${campanha.nome}`.slice(0, 60);
  let id = etiquetas.get(nome);
  if (!id) {
    empresa ??= await empresaDoContato(contactId);
    if (!empresa) throw new Error('empresa do contato não encontrada');
    const existente = (await listarEtiquetas(empresa)).find((e) => semAcento(e.name).trim() === semAcento(nome).trim());
    id = existente?._id ?? (await criarEtiqueta(empresa, nome))._id;
    if (!id) throw new Error('a Inovstar não devolveu o id da etiqueta');
    etiquetas.set(nome, id);
  }
  await etiquetarContato(contactId, [id]);
  return nome;
}

/**
 * Webhook da Inovstar (toda mensagem recebida, mesmo as que a Amanda não responde): se a mensagem traz o código de uma
 * campanha, registra o lead (uma vez por telefone por campanha) e etiqueta o contato com "ADS - CAMPANHA".
 * Nunca atrapalha o atendimento: qualquer falha só vira log.
 */
export async function registrarLeadDeAnuncio(ev: MessageReceivedEvent): Promise<void> {
  if (!supabaseConfigurado() || ev.isGroup || !ev.text) return;
  if (!REF.test(ev.text) && !REF_DO_SITE.test(ev.text) && !(await listarCampanhas()).some((c) => c.frases?.length)) return; // caminho rápido: nada a procurar
  const achou = campanhaDaMensagem(ev.text, await listarCampanhas());
  if (!achou) return;
  const tel = soDigitos(ev.to);
  const novo = await gravarEvento({
    campanha: achou.campanha.id, etapa: 'lead', chave: `lead:${achou.campanha.id}:${tel}`, telefone: tel, atendimento: ev.attendanceId, contato: ev.contactName ?? null,
    dados: { origem: achou.origem, por: achou.por, codigo: achou.campanha.codigo },
  });
  if (!novo) return; // já era lead desta campanha
  let etiqueta: string | undefined, erro: string | undefined;
  try {
    const contactId = ev.contactId ?? (await contatoDoAtendimento(ev.attendanceId));
    if (contactId) etiqueta = await etiquetar(contactId, achou.campanha); else erro = 'contato sem id';
  } catch (e) { erro = (e as Error).message.slice(0, 200); }
  evt('aquisicao', { campanha: achou.campanha.codigo, origem: achou.origem, por: achou.por, etiqueta: etiqueta ?? null, erro: erro ?? null });
}
