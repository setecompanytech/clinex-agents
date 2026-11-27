import type { Estado } from './banco.js';
import type { AntigosCfg } from './disparo-auto-tipos.js';
import { agendamentos, clinilinkConfigurado, orcamentos } from './clinilink.js';
import { diaDoInstante, diffDias, type Lead } from './motor.js';
import { UNIDADES_CLINEX } from './pipeline/ingestao.js';
import { diaBRT, somaDia, topo } from './pipeline/regras.js';
import { chaveFone } from './whatsapp.js';

/**
 * Base antiga: orçamentos que ficaram em Em aberto sem nenhum contato e cujo dia do primeiro contato já passou. Por padrão a IA
 * não toca neles (passo atrasado é decisão de pessoa). Com a opção LIGADA no IA Manager (pedido da clínica), ela manda SÓ a
 * primeira mensagem, em quantidade limitada por dia, dos mais recentes para os mais antigos. Os passos seguintes (nova tentativa,
 * desconto, encerramento) ficam com a equipe: como os prazos já venceram, a IA mandaria tudo quase de uma vez.
 */
export const antigosPadrao = (): AntigosCfg => ({ ativo: false, porDia: 30, dias: 30, inicio: 9, fim: 16 });
/** Blocos pequenos: a cota do dia sai aos poucos, para a equipe conseguir responder. */
export const ANTIGOS_POR_RODADA = 5;

/** O primeiro contato da IA saiu depois do dia certo (que é o dia seguinte ao orçamento): foi um envio da base antiga. */
const envioAntigo = (l: Lead, e: Lead['eventos'][number]) => e.tipo === 'contato' && e.auto === true && e.passo === 'primeiro' && diffDias(l.d0, diaDoInstante(e.quando)) >= 2;
export const recebeuPelaBaseAntiga = (l: Lead) => l.eventos.some((e) => envioAntigo(l, e));
export const enviadosAntigosHoje = (estado: Estado, hoje: string) => estado.leads.reduce((s, l) => s + l.eventos.filter((e) => envioAntigo(l, e) && diaDoInstante(e.quando) === hoje).length, 0);

const mexido = (l: Lead) => l.eventos.some((e) => e.tipo === 'contato' || e.tipo === 'resposta');
const EM_ANDAMENTO = new Set<string>(['agendado', 'convertido_ativo', 'convertido_organico']);

/** Por que este lead atrasado em Em aberto NÃO entra na base antiga (null = entra). */
export function motivoForaDaBase(estado: Estado, l: Lead, hoje: string, cfg: AntigosCfg): string | null {
  if (diffDias(l.d0, hoje) > cfg.dias) return `Passo atrasado: orçamento com mais de ${cfg.dias} dias, fora da base antiga`;
  if (l.fonte === 'noshow' || l.status !== 'aberto') return 'Passo atrasado: só uma pessoa decide';
  if (mexido(l)) return 'Base antiga: o paciente já teve contato';
  const card = l.cardId ? estado.pipelines.atribuicoes.find((a) => a.cardId === l.cardId) : undefined;
  const funil = card && estado.pipelines.funis.find((f) => f.id === card.funilId);
  if (card && funil && (card.caseStatus !== 'aberto' || card.stageId !== topo(funil).id)) return 'Base antiga: a equipe já moveu o card';
  const fim = l.telefone.slice(-4), chave = chaveFone(l.telefone);
  if (estado.leads.some((o) => o.id !== l.id && o.telefone.slice(-4) === fim && chaveFone(o.telefone) === chave && (mexido(o) || EM_ANDAMENTO.has(o.status)))) return 'Base antiga: o paciente já está em atendimento em outro registro';
  return null;
}

// ------------------------------------------------------------------------------------------------ conferência no Clinilink

export type Conferidor = (l: Lead) => string | null;
let cache: { em: number; dias: number; conferir: Conferidor } | null = null;

/**
 * Antes de mandar para um orçamento antigo, confere no Clinilink (só leitura) se ele continua em aberto e se o paciente já não
 * agendou (é o "já foi à recepção?" para quem ficou semanas parado). Se o Clinilink não responder, devolve undefined e a IA
 * não envia nada da base antiga nessa rodada.
 */
export async function conferidorDaBaseAntiga(dias: number, agora: Date): Promise<Conferidor | undefined> {
  if (cache && cache.dias === dias && agora.getTime() - cache.em < 20 * 60_000) return cache.conferir;
  if (!clinilinkConfigurado()) return undefined;
  const hoje = diaBRT(agora), de = somaDia(hoje, -(dias + 1));
  const busca = (async () => {
    const [orc, ags] = await Promise.all([
      orcamentos({ status: 'aberto', dataInicial: de, dataFinal: hoje }),
      Promise.all(UNIDADES_CLINEX.map((u) => agendamentos({ unidadeId: u.id, dataInicial: de, dataFinal: somaDia(hoje, 60) }))),
    ]);
    return montarConferidor(orc.map((o) => o.orcamentoId), ags.flat().map((a) => ({ telefone: a.paciente?.telefone, quando: a.dataHora })));
  })();
  let relogio: NodeJS.Timeout | undefined;
  const limite = new Promise<undefined>((ok) => { relogio = setTimeout(() => ok(undefined), 45_000); });
  try {
    const conferir = await Promise.race([busca, limite]);
    if (conferir) cache = { em: agora.getTime(), dias, conferir };
    return conferir;
  } catch (e) {
    console.error('[disparo-auto] base antiga: o Clinilink não respondeu à conferência:', (e as Error).message);
    return undefined;
  } finally { clearTimeout(relogio); busca.catch(() => {}); }
}

export function montarConferidor(orcamentosAbertos: string[], marcados: { telefone?: string; quando: string }[]): Conferidor {
  const abertos = new Set(orcamentosAbertos), ultimo = new Map<string, string>();
  for (const a of marcados) {
    if (!a.telefone || Number.isNaN(Date.parse(a.quando))) continue;
    const k = chaveFone(a.telefone), dia = diaBRT(a.quando);
    if (dia > (ultimo.get(k) ?? '')) ultimo.set(k, dia);
  }
  return (l) => {
    if (l.fonte === 'clinilink' && l.cardId && !abertos.has(l.cardId)) return 'Base antiga: o orçamento não está mais em aberto no Clinilink';
    if ((ultimo.get(chaveFone(l.telefone)) ?? '') >= l.d0) return 'Base antiga: o paciente já tem agendamento no Clinilink';
    return null;
  };
}
