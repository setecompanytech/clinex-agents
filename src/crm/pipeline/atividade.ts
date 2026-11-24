import { ehPessoa } from '../sincroniaCardLead.js';
import { classeDaEtapa, diaBRT, etapaHist, valorExibido } from './regras.js';
import type { EstadoFunis } from './tipos.js';

/**
 * Movimentos de cards do Pipelines feitos por pessoas. O funil de No-show não tem lead por trás (o card é o próprio caso),
 * então quem trabalha só nele não deixa nenhum evento em lead: sem isto essas pessoas não apareciam em nenhuma análise.
 * Ignora o primeiro registro do histórico (a entrada do card) e movimentos do sistema ("CRM (lead)", IA...).
 */
/** Para onde o card foi em relação à coluna de onde saiu: a etapa seguinte, pulou etapas, voltou, foi para uma coluna de perda (descarte, sem retorno, perdido) ou ficou na mesma ordem. */
export type Sentido = 'proxima' | 'saltou' | 'voltou' | 'perdeu' | 'outro';
export type MovCard = { sentido: Sentido; de: string; quando: string; dia: string; por: string; funil: string; dimensao: string; para: string; classe: string; paciente: string; valor: number; cardId: string; unidade?: string };

export function movimentosDeCards(est: EstadoFunis, de: string, ate: string, unidade?: string | null): MovCard[] {
  const out: MovCard[] = [];
  const funis = new Map(est.funis.map((f) => [f.id, f]));
  for (const a of est.atribuicoes) {
    const f = funis.get(a.funilId); if (!f) continue;
    if (unidade && (a.ultimoSnapshot.unidade ?? '').trim() !== unidade) continue;
    for (let i = 1; i < a.historico.length; i++) {
      const m = a.historico[i];
      if (!ehPessoa(m.por)) continue;
      const dia = diaBRT(m.em); if (dia < de || dia > ate) continue;
      const e = etapaHist(f, (m.stageId ?? m.para) as string);
      const ant = a.historico[i - 1], oId = (ant?.stageId ?? ant?.para) as string | undefined, o = oId ? etapaHist(f, oId) : undefined;
      const iO = oId ? f.stages.findIndex((s) => s.id === oId) : -1, iD = f.stages.findIndex((s) => s.id === ((m.stageId ?? m.para) as string));
      const classe = classeDaEtapa(e?.label ?? '');
      const sentido: Sentido = classe === 'perda' ? 'perdeu' : iO < 0 || iD < 0 || iO === iD ? 'outro' : iD === iO + 1 ? 'proxima' : iD > iO ? 'saltou' : 'voltou';
      out.push({ sentido, de: o?.label ?? '?', quando: m.em, dia, por: m.por!.trim(), funil: f.nome, dimensao: f.dimensao, para: e?.label ?? '?', classe: classeDaEtapa(e?.label ?? ''), paciente: a.ultimoSnapshot.paciente, valor: valorExibido(a, est.extras[a.cardId]), cardId: a.cardId, unidade: a.ultimoSnapshot.unidade });
    }
  }
  return out.sort((x, y) => y.quando.localeCompare(x.quando));
}

/** Resumo por pessoa: quantos movimentos, no-shows trabalhados/recuperados e o valor recuperado. */
export function resumoPorPessoa(movs: MovCard[]) {
  const por = new Map<string, { movimentos: number; noshow: number; recuperados: number; valorRecuperado: number; proxima: number; saltou: number; voltou: number; perdeu: number; destinos: Map<string, number> }>();
  for (const m of movs) {
    const x = por.get(m.por) ?? { movimentos: 0, noshow: 0, recuperados: 0, valorRecuperado: 0, proxima: 0, saltou: 0, voltou: 0, perdeu: 0, destinos: new Map() };
    x.movimentos++; if (m.sentido !== 'outro') x[m.sentido]++; x.destinos.set(m.para, (x.destinos.get(m.para) ?? 0) + 1);
    if (m.dimensao === 'agendamento') { x.noshow++; if (m.classe === 'recuperado') { x.recuperados++; x.valorRecuperado += m.valor; } }
    por.set(m.por, x);
  }
  return por;
}
