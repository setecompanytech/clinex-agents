import { contatoDoAtendimento, criarEtiqueta, empresaDoContato, etiquetarContato, getHistory, listarEtiquetas, type Etiqueta, type MessageReceivedEvent } from '../integrations/inovstar.js';
import { travaCurta } from '../lib/estado.js';
import { evt } from '../lib/log.js';
import { registrarConversaDeAnuncio } from './geral.js';

/**
 * Conversas que vieram de ANÚNCIO (Click-to-WhatsApp do Facebook/Instagram), pedido do usuário em 27/11/2026: a Inovstar mostra
 * "Anúncio do Facebook" na conversa e entrega na 1ª mensagem do paciente o campo `adReferral` (origem, id do anúncio, título, texto).
 * A equipe criou as etiquetas "AD - CARDIO", "AD - Checkp10", "AD - DERMATO", "AD - UROLOGIA"...: a conversa ganha a etiqueta
 * cujo nome combina com o TÍTULO do anúncio (senão, com o texto). Sem etiqueta que combine: "AD - OUTROS" (criada na 1ª vez).
 * Roda no webhook para toda conversa (mesmo as que a Amanda não atende), uma vez por atendimento. Nunca atrapalha o atendimento.
 */
export type AdReferral = { source?: string; sourceType?: string; sourceId?: string; sourceUrl?: string; headline?: string; body?: string; ctwaClid?: string };

const ETIQUETA_SEM_PAR = process.env.ANUNCIO_ETIQUETA_PADRAO ?? 'AD - OUTROS';
const chave = (s: string | undefined) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const ehEtiquetaDeAnuncio = (nome: string) => /^\s*ads?\s*[-–:]/i.test(nome);
const sufixo = (nome: string) => nome.replace(/^\s*ads?\s*[-–:]\s*/i, '');

/**
 * Qual etiqueta "AD - ..." combina com o anúncio: cada pedaço do nome da etiqueta precisa aparecer no título (letras: as 5 primeiras,
 * para "DERMATO" casar com "Dermatologista" e "UROLOGIA" com "Urologista"; números: inteiros, para "Checkp10" exigir o 10).
 * Título primeiro; sem par, o texto do anúncio. Mais de uma: a de nome mais longo (mais específica).
 */
export function etiquetaDoAnuncio(ad: AdReferral, etiquetas: Etiqueta[]): Etiqueta | undefined {
  const candidatas = etiquetas.filter((e) => ehEtiquetaDeAnuncio(e.name) && chave(sufixo(e.name)) !== chave(sufixo(ETIQUETA_SEM_PAR)));
  const casa = (e: Etiqueta, alvo: string) => {
    const partes = chave(sufixo(e.name)).match(/[a-z]+|\d+/g) ?? [];
    return partes.length > 0 && partes.every((p) => alvo.includes(/^\d+$/.test(p) ? p : p.slice(0, Math.min(5, p.length))));
  };
  for (const alvo of [chave(ad.headline), chave(ad.body)]) {
    if (!alvo) continue;
    const ok = candidatas.filter((e) => casa(e, alvo)).sort((a, b) => chave(b.name).length - chave(a.name).length);
    if (ok[0]) return ok[0];
  }
  return undefined;
}

let empresa: string | undefined = process.env.INOVSTAR_COMPANY_ID || undefined;
let cacheEtiquetas: { em: number; lista: Etiqueta[] } | null = null;
async function etiquetas(contactId: string): Promise<Etiqueta[]> {
  if (cacheEtiquetas && Date.now() - cacheEtiquetas.em < 10 * 60_000) return cacheEtiquetas.lista;
  empresa ??= await empresaDoContato(contactId);
  if (!empresa) throw new Error('empresa do contato não encontrada');
  cacheEtiquetas = { em: Date.now(), lista: await listarEtiquetas(empresa) };
  return cacheEtiquetas.lista;
}

/** Webhook: se a conversa veio de anúncio, aplica a etiqueta "AD - ..." no contato (uma vez por atendimento). */
export async function etiquetarSeVeioDeAnuncio(ev: MessageReceivedEvent): Promise<void> {
  if (ev.isGroup) return;
  // uma conferência por atendimento (3 dias); sem Redis não confere (não vale buscar o histórico a cada mensagem)
  if (!ev.adReferral && !(await travaCurta(`anuncio:${ev.attendanceId}`, 3 * 86_400_000))) return;
  let ad = ev.adReferral as AdReferral | undefined;
  let contactId = ev.contactId;
  if (!ad) {
    const { messages } = await getHistory(ev.attendanceId, 10);
    const m = messages.find((x) => x.direction === 'in' && (x as { adReferral?: AdReferral }).adReferral);
    ad = (m as { adReferral?: AdReferral } | undefined)?.adReferral;
  } else if (!(await travaCurta(`anuncio:${ev.attendanceId}`, 3 * 86_400_000))) return; // já etiquetado por outra mensagem deste atendimento
  if (!ad || (ad.sourceType && ad.sourceType !== 'ad')) return;
  contactId ??= await contatoDoAtendimento(ev.attendanceId);
  if (!contactId) { evt('erro', { mensagem: 'anúncio: contato sem id, não etiquetei' }); return; }
  let etiqueta: string | undefined, erro: string | undefined;
  try {
    const lista = await etiquetas(contactId);
    let e = etiquetaDoAnuncio(ad, lista) ?? lista.find((x) => chave(x.name) === chave(ETIQUETA_SEM_PAR));
    if (!e) { e = await criarEtiqueta(empresa!, ETIQUETA_SEM_PAR, '#0B3D91'); cacheEtiquetas = null; }
    await etiquetarContato(contactId, [e._id]);
    etiqueta = e.name;
  } catch (x) { erro = (x as Error).message.slice(0, 200); }
  // funil geral de aquisição: a conversa de anúncio fica gravada (uma vez por telefone por anúncio)
  await registrarConversaDeAnuncio({ ad, telefone: ev.to, atendimento: ev.attendanceId, contato: ev.contactName ?? null, etiqueta }).catch((x) => { erro = `${erro ? `${erro}; ` : ''}gravar: ${(x as Error).message.slice(0, 120)}`; });
  evt('anuncio', { origem: ad.source ?? null, anuncio: ad.sourceId ?? null, titulo: (ad.headline ?? '').slice(0, 80), etiqueta: etiqueta ?? null, erro: erro ?? null });
}
