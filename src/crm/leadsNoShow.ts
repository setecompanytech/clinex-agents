import type { Estado } from './banco.js';
import { criarLead } from './motor.js';
import { diaBRT, somaDia, topo } from './pipeline/regras.js';

/**
 * Os faltantes do Clinilink (cards do funil No-show) precisam virar leads do guia para a IA de disparo conseguir convidá-los a
 * reagendar (o passo "No show", Msg 10, vale no dia seguinte à falta). O lead nasce uma vez por card (`cardId`, id fixo a partir do
 * card), só para quem ainda está na primeira coluna (a equipe não trabalhou) e faltou ontem ou hoje: quem faltou antes já passou do
 * dia certo, e a IA nunca age em passo atrasado. É só criação; nunca apaga nem mexe no card.
 * Estes leads (`fonte: 'noshow'`) ficam fora do Fluxo × Pipelines de Orçamentos: o card deles é do funil No-show.
 */
export const idDoLeadNoShow = (cardId: string) => `ns${cardId.replace(/[^0-9a-z]/gi, '').slice(0, 10).toLowerCase()}`;

export function leadsDosNoShow(estado: Estado, agora: Date): { criados: number; ignorados: number } {
  const funil = estado.pipelines.funis.find((f) => f.dimensao === 'agendamento');
  if (!funil) return { criados: 0, ignorados: 0 };
  const hoje = diaBRT(agora);
  const jaTem = new Set(estado.leads.map((l) => l.cardId).filter(Boolean));
  const novos = [];
  let ignorados = 0;
  for (const a of estado.pipelines.atribuicoes) {
    if (a.funilId !== funil.id || a.caseStatus !== 'aberto' || a.stageId !== topo(funil).id || jaTem.has(a.cardId)) continue;
    const s = a.originSnapshot;
    const t = Date.parse(s.criadoEm);
    if (Number.isNaN(t)) continue;
    const falta = diaBRT(s.criadoEm), vale = somaDia(falta, 1);
    if (vale < hoje) continue; // faltou antes de ontem: o dia da mensagem já passou
    try {
      const lead = criarLead({
        nome: s.paciente, telefone: s.contato ?? '', valor: s.valor, unidade: s.unidade,
        exame: s.itens[0] || s.subtitulo || 'Consulta',
        obs: ['No show', s.codigo ? `Código ${s.codigo}` : '', s.observacao ?? ''].filter(Boolean).join(' · '),
        d0: falta,
      }, agora);
      lead.id = idDoLeadNoShow(a.cardId); lead.cardId = a.cardId; lead.fonte = 'noshow';
      // Em negociação, "No show" como próximo passo, valendo no dia seguinte à falta (o guia manda a Msg 10 nesse dia)
      lead.status = 'negociacao'; lead.statusDesde = vale; lead.seqFase = 1; lead.faseId = `negociacao:${vale}:1`;
      lead.pulados = ['orcamento']; lead.noShow = true; lead.negD0 = vale;
      novos.push(lead);
    } catch { ignorados++; } // sem telefone válido: continua só no funil
  }
  estado.leads.unshift(...novos);
  return { criados: novos.length, ignorados };
}
