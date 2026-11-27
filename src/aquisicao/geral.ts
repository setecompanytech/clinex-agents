import { funilPorTelefones, listAgendamentosPeriodo, listClinicas, type AgendamentoFunil } from '../integrations/clinilink.js';
import { getHistory, type InovstarMessage } from '../integrations/inovstar.js';
import { sbAtualizar, sbLer, supabaseConfigurado } from '../lib/supabase.js';
import { travaCurta } from '../lib/estado.js';
import { evt } from '../lib/log.js';
import { gravarEvento, T_EVENTOS, type EventoAq } from './campanhas.js';
import { chaveTel } from './funil.js';
import type { AdReferral } from './anuncios.js';

/**
 * FUNIL GERAL DE AQUISIÇÃO (pedido do usuário em 27/11/2026): todas as conversas que vieram de ANÚNCIO da Meta (as etiquetas "AD - ..."
 * da Inovstar), separado das campanhas do painel. Etapas: veio do anúncio (qual anúncio) e mandou mensagem -> agendou / não agendou
 * -> pagou na clínica -> foi atendido pelo médico.
 *   - cada conversa de anúncio vira uma linha em aquisicao_eventos (etapa 'lead', campanha 'ads:<id do anúncio>'), gravada pelo
 *     webhook na hora da 1ª mensagem (e as antigas, pelo scripts/importar-anuncios.ts);
 *   - "agendou" = a mensagem de CONFIRMAÇÃO (Paciente / Procedimento / Data) enviada no WhatsApp, procurada em segundo plano a cada
 *     10 min (sincronizarConfirmacoes) e guardada na linha; ou um agendamento no Clinilink com o mesmo telefone;
 *   - pagou / atendido: Clinilink ao vivo (rota /v1/agendamento/funil; se ela não responder, a lista de agendamentos das unidades).
 */
export const PREFIXO = 'ads:';

export type Confirmacao = { em: string; servico: string; data: string; quem: string };
const texto = (m: { text?: unknown }) => String(typeof m.text === 'object' && m.text ? ((m.text as { text?: string; body?: string }).text ?? (m.text as { body?: string }).body ?? '') : (m.text ?? ''));
export const ehConfirmacao = (t: string) => /Procedimento:/i.test(t) && /(Data:|📆)/.test(t) && /Paciente:/i.test(t) && !/Or[çc]amento N/i.test(t);
/** A 1ª mensagem de confirmação ENVIADA ao paciente (nota interna não conta) depois de `desde`. */
export function confirmacaoNasMensagens(msgs: InovstarMessage[], desde: string): Confirmacao | undefined {
  for (const o of msgs) {
    if (o.direction !== 'out' || o.isWhisper || (o as { isPrivate?: boolean }).isPrivate) continue;
    const t = texto(o);
    if (!ehConfirmacao(t) || String(o.createdAt) < desde) continue;
    return {
      em: String(o.createdAt), servico: (t.match(/Procedimento:\s*([^\n]+)/i)?.[1] ?? '').replace(/\*/g, '').trim(), data: t.match(/Data:\s*\**\s*(\d{2}\/\d{2}(?:\/\d{4})?)/i)?.[1] ?? '',
      quem: /^\*?_?Amanda/i.test(t) ? 'Amanda' : (t.match(/^\*_?([^*:_\n]+):/)?.[1]?.trim() ?? 'equipe'),
    };
  }
  return undefined;
}

/** Webhook: a conversa veio de anúncio -> grava (uma vez por telefone por anúncio). */
export async function registrarConversaDeAnuncio(p: { ad: AdReferral; telefone: string; atendimento: string; contato?: string | null; etiqueta?: string; quando?: string }) {
  if (!supabaseConfigurado()) return false;
  const tel = chaveTel(p.telefone);
  const id = p.ad.sourceId || 'sem-id';
  return gravarEvento({
    campanha: `${PREFIXO}${id}`, etapa: 'lead', chave: `${PREFIXO}${tel}:${id}`, telefone: tel, atendimento: p.atendimento, contato: p.contato ?? null, t: p.quando,
    dados: { titulo: p.ad.headline ?? '(sem título)', origem: p.ad.source ?? null, anuncio: id, url: p.ad.sourceUrl ?? null, etiqueta: p.etiqueta ?? null },
  });
}

/** Em segundo plano (de carona no webhook, no máximo a cada 10 min): procura a confirmação das conversas de anúncio dos últimos 30 dias. */
export async function sincronizarConfirmacoes(max = 25): Promise<number> {
  if (!supabaseConfigurado() || !(await travaCurta('aquisicao:sync-confirmacoes', 10 * 60_000))) return 0;
  const desde = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const leads = (await sbLer<EventoAq>(T_EVENTOS, { filtro: { campanha: `like.${PREFIXO}*`, etapa: 'eq.lead', t: `gte.${desde}` }, ordem: 'id' }))
    .filter((l) => l.atendimento && !(l.dados as { confirmacao?: unknown }).confirmacao)
    // quem foi conferido há menos de 1 h espera a vez; os mais antigos sem conferência primeiro
    .filter((l) => !(l.dados as { conferidoEm?: string }).conferidoEm || Date.now() - Date.parse(String((l.dados as { conferidoEm?: string }).conferidoEm)) > 3_600_000)
    .sort((a, b) => String((a.dados as { conferidoEm?: string }).conferidoEm ?? '').localeCompare(String((b.dados as { conferidoEm?: string }).conferidoEm ?? '')))
    .slice(0, max);
  let achou = 0;
  for (const l of leads) {
    try {
      const { messages } = await getHistory(l.atendimento!, 50, true);
      const conf = confirmacaoNasMensagens(messages, l.t);
      if (conf) achou++;
      await sbAtualizar(T_EVENTOS, { id: `eq.${l.id}` }, { dados: { ...l.dados, conferidoEm: new Date().toISOString(), ...(conf ? { confirmacao: conf } : {}) } });
    } catch { /* tenta de novo na próxima rodada */ }
  }
  if (leads.length) evt('aquisicao', { sync: 'confirmacoes', conferidas: leads.length, achou });
  return achou;
}

/**
 * Importação das conversas de anúncio que aconteceram ANTES do funil geral existir (rota protegida, em lotes).
 * Só GRAVA no funil (com a confirmação, se já houver): não aplica etiqueta na Inovstar.
 */
export async function importarConversasDeAnuncio(ids: string[]): Promise<{ gravadas: number; jaExistiam: number; semAnuncio: number; falhas: number }> {
  const r = { gravadas: 0, jaExistiam: 0, semAnuncio: 0, falhas: 0 };
  for (const id of ids) {
    try {
      const { messages } = await getHistory(id, 50, true);
      const m = messages.find((x) => x.direction === 'in' && (x as { adReferral?: AdReferral }).adReferral) as (InovstarMessage & { adReferral: AdReferral; contact?: { waId?: string; name?: string } }) | undefined;
      if (!m) { r.semAnuncio++; continue; }
      const tel = chaveTel(String(m.contact?.waId ?? '').split('@')[0]);
      if (tel.length < 10) { r.falhas++; continue; }
      const idAd = m.adReferral.sourceId || 'sem-id';
      const conf = confirmacaoNasMensagens(messages, String(m.createdAt));
      const nova = await gravarEvento({
        campanha: `${PREFIXO}${idAd}`, etapa: 'lead', chave: `${PREFIXO}${tel}:${idAd}`, telefone: tel, atendimento: id, contato: m.contact?.name ?? null, t: String(m.createdAt),
        dados: { titulo: m.adReferral.headline ?? '(sem título)', origem: m.adReferral.source ?? null, anuncio: idAd, url: m.adReferral.sourceUrl ?? null, etiqueta: null, importado: true, conferidoEm: new Date().toISOString(), ...(conf ? { confirmacao: conf } : {}) },
      });
      if (nova) r.gravadas++; else r.jaExistiam++;
    } catch { r.falhas++; }
  }
  cache = null;
  return r;
}

// ------------------------------------------------------------------------------------------------ o funil
export type LeadGeral = {
  quando: string; contato: string | null; telefone: string; origem: string | null; titulo: string; anuncio: string; etiqueta: string | null; atendimento: string | null;
  agendou: boolean; confirmacao?: Confirmacao; agendamento?: { data: string; servico: string; profissional?: string; especialidade?: string | null; unidade?: string | null; status: string };
  pagou: boolean; atendido: boolean; valorPago: number; operadora?: string | null;
};
export type LinhaAnuncio = { titulo: string; anuncio: string; etiqueta: string | null; origens: Record<string, number>; pessoas: number; agendaram: number; naoAgendaram: number; pagaram: number; atendidos: number; receita: number; conversao: number | null };
export type FunilGeral = { desde: string; geradoEm: string; fonteClinilink: 'funil' | 'lista' | 'indisponivel'; avisoClinilink?: string; total: { pessoas: number; agendaram: number; naoAgendaram: number; pagaram: number; atendidos: number; receita: number }; anuncios: LinhaAnuncio[]; leads: LeadGeral[] };

const mascarar = (t: string) => (t.length >= 10 ? `(${t.slice(0, 2)}) •••••-${t.slice(-4)}` : '—');
const diaBelem = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Belem' }).format(new Date(iso));
const somaDias = (ymd: string, n: number) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

type AgNorm = { telefone: string; quando: string; status: string; servico: string; profissional?: string; especialidade?: string | null; unidade?: string | null; pago: number; operadora?: string | null; temOsPaga: boolean };
let cache: { chave: string; em: number; dados: FunilGeral } | null = null;

/** Agendamentos do Clinilink para os telefones: rota do funil (com O.S. e operadora); se não responder, a lista das unidades (sem O.S.). */
async function agendamentosDoClinilink(telefones: string[], desde: string): Promise<{ ags: AgNorm[]; fonte: FunilGeral['fonteClinilink']; aviso?: string }> {
  if (!telefones.length) return { ags: [], fonte: 'funil' };
  try {
    const r: AgendamentoFunil[] = await funilPorTelefones(telefones, desde);
    return {
      fonte: 'funil',
      ags: r.map((a) => {
        const pagas = (a.os ?? []).filter((o) => o.status === 'paga' || o.valorPago > 0);
        return { telefone: chaveTel(a.telefone), quando: a.dataHora, status: a.status, servico: (a.procedimentos ?? []).join(' + '), profissional: a.profissional?.nome, especialidade: a.profissional?.especialidade, unidade: a.unidade, pago: pagas.reduce((s, o) => s + (Number(o.valorPago) || 0), 0), operadora: pagas[0]?.operadora ?? null, temOsPaga: pagas.length > 0 };
      }),
    };
  } catch (e) {
    const aviso = `A consulta completa do Clinilink não respondeu (${(e as Error).message.slice(0, 80)}): pagou/atendido vêm do status do agendamento, sem O.S. e sem operadora.`;
    try {
      const alvo = new Set(telefones.map(chaveTel));
      const ags: AgNorm[] = [];
      for (const u of await listClinicas()) {
        for (const a of await listAgendamentosPeriodo(u.id, desde, somaDias(desde, 59))) {
          const t = chaveTel(a.paciente?.telefone);
          if (!alvo.has(t)) continue;
          ags.push({ telefone: t, quando: a.dataHora, status: a.status, servico: (a.procedimentos ?? []).map((p) => p.nome).join(' + '), profissional: a.profissional?.nome, especialidade: null, unidade: a.unidade?.nome ?? u.nome, pago: ['quitado', 'checkin', 'atendido'].includes(a.status) ? Number(a.valorTotal) || 0 : 0, operadora: null, temOsPaga: ['quitado', 'checkin', 'atendido'].includes(a.status) });
        }
      }
      return { ags, fonte: 'lista', aviso };
    } catch (e2) { return { ags: [], fonte: 'indisponivel', aviso: `O Clinilink não respondeu (${(e2 as Error).message.slice(0, 80)}): só a confirmação no WhatsApp conta como agendado.` }; }
  }
}

export async function montarFunilGeral(desde: string): Promise<FunilGeral> {
  const chave = desde;
  if (cache && cache.chave === chave && Date.now() - cache.em < 3 * 60_000) return cache.dados;
  const leads = await sbLer<EventoAq>(T_EVENTOS, { filtro: { campanha: `like.${PREFIXO}*`, etapa: 'eq.lead', t: `gte.${desde}T00:00:00-03:00` }, ordem: 'id' });
  const { ags, fonte, aviso } = await agendamentosDoClinilink([...new Set(leads.map((l) => l.telefone!).filter(Boolean))], desde);
  const porTel = new Map<string, AgNorm[]>();
  for (const a of ags) porTel.set(a.telefone, [...(porTel.get(a.telefone) ?? []), a]);

  const lista: LeadGeral[] = leads.map((l) => {
    const d = l.dados as { titulo?: string; origem?: string; etiqueta?: string; confirmacao?: Confirmacao };
    // agendamento marcado para o dia do contato ou depois, que não foi cancelado (o mais próximo)
    const meus = (porTel.get(chaveTel(l.telefone)) ?? []).filter((a) => a.quando >= diaBelem(l.t)).sort((a, b) => a.quando.localeCompare(b.quando));
    const valido = meus.find((a) => a.status !== 'cancelado');
    const pagos = meus.filter((a) => a.temOsPaga);
    return {
      quando: l.t, contato: l.contato, telefone: mascarar(chaveTel(l.telefone)), origem: d.origem ?? null, titulo: d.titulo ?? '(sem título)', anuncio: l.campanha.slice(PREFIXO.length), etiqueta: d.etiqueta ?? null, atendimento: l.atendimento,
      agendou: Boolean(d.confirmacao || valido), confirmacao: d.confirmacao,
      agendamento: valido ? { data: valido.quando, servico: valido.servico, profissional: valido.profissional, especialidade: valido.especialidade, unidade: valido.unidade, status: valido.status } : undefined,
      pagou: pagos.length > 0, atendido: meus.some((a) => a.status === 'atendido'), valorPago: pagos.reduce((s, a) => s + a.pago, 0), operadora: pagos[0]?.operadora ?? null,
    };
  }).sort((a, b) => b.quando.localeCompare(a.quando));

  const mapa = new Map<string, LinhaAnuncio>();
  for (const l of lista) {
    const k = l.titulo;
    const v = mapa.get(k) ?? { titulo: k, anuncio: l.anuncio, etiqueta: l.etiqueta, origens: {}, pessoas: 0, agendaram: 0, naoAgendaram: 0, pagaram: 0, atendidos: 0, receita: 0, conversao: null };
    v.pessoas++; if (l.agendou) v.agendaram++; else v.naoAgendaram++; if (l.pagou) v.pagaram++; if (l.atendido) v.atendidos++; v.receita += l.valorPago;
    if (l.origem) v.origens[l.origem] = (v.origens[l.origem] ?? 0) + 1;
    if (!v.etiqueta && l.etiqueta) v.etiqueta = l.etiqueta;
    mapa.set(k, v);
  }
  const anuncios = [...mapa.values()].map((v) => ({ ...v, conversao: v.pessoas ? (v.agendaram / v.pessoas) * 100 : null })).sort((a, b) => b.pessoas - a.pessoas);
  const soma = (f: (a: LinhaAnuncio) => number) => anuncios.reduce((s, a) => s + f(a), 0);
  const dados: FunilGeral = {
    desde, geradoEm: new Date().toISOString(), fonteClinilink: fonte, avisoClinilink: aviso,
    total: { pessoas: soma((a) => a.pessoas), agendaram: soma((a) => a.agendaram), naoAgendaram: soma((a) => a.naoAgendaram), pagaram: soma((a) => a.pagaram), atendidos: soma((a) => a.atendidos), receita: soma((a) => a.receita) },
    anuncios, leads: lista,
  };
  cache = { chave, em: Date.now(), dados };
  return dados;
}
