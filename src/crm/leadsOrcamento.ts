import type { Estado } from './banco.js';
import { criarLead } from './motor.js';
import { funilDestino } from './pipeline/ingestao.js';
import { diaBRT } from './pipeline/regras.js';

/**
 * Os orçamentos abertos do Clinilink SÃO os leads do guia de atendimento (paciente com orçamento para fechar).
 * Cada card do funil de Orçamentos vira um lead, para as telas Hoje, Leads e Análises (cadência D1 a D8, tarefas do dia)
 * mostrarem os dados reais. É só criação, nunca apaga nem altera: o lead nasce uma vez por card (`cardId`) e depois
 * é trabalhado normalmente. O id é fixo a partir do card, então duas instâncias criando ao mesmo tempo gravam a mesma linha.
 */
export const idDoLead = (cardId: string) => `ck${cardId.replace(/[^0-9a-z]/gi, '').slice(0, 10).toLowerCase()}`;

export function leadsDosOrcamentos(estado: Estado, agora: Date): { criados: number; ignorados: number } {
  const funil = estado.pipelines.funis.find((f) => f.dimensao === 'orcamento') ? funilDestino(estado.pipelines, 'orcamento', agora) : null;
  if (!funil) return { criados: 0, ignorados: 0 };
  const jaTem = new Set(estado.leads.map((l) => l.cardId).filter(Boolean));
  const novos = [];
  let ignorados = 0;
  for (const a of estado.pipelines.atribuicoes) {
    if (a.funilId !== funil.id || a.caseStatus !== 'aberto' || jaTem.has(a.cardId)) continue;
    const s = a.originSnapshot;
    try {
      const lead = criarLead({
        nome: s.paciente, telefone: s.contato ?? '', valor: s.valor, origem: s.origem, unidade: s.unidade,
        exame: s.itens[0] || s.subtitulo || 'Orçamento',
        obs: [s.codigo ? `Orçamento ${s.codigo}` : '', s.observacao ?? ''].filter(Boolean).join(' · ') || undefined,
        d0: Number.isNaN(Date.parse(s.criadoEm)) ? undefined : diaBRT(s.criadoEm),
      }, agora);
      lead.id = idDoLead(a.cardId); lead.cardId = a.cardId; lead.fonte = 'clinilink';
      novos.push(lead);
    } catch { ignorados++; } // sem telefone válido: continua só no funil
  }
  estado.leads.unshift(...novos);
  return { criados: novos.length, ignorados };
}
