/**
 * Modelo dos funis do CRM, igual ao documento "pipelines-crm-tecnico" (seção 3): `pipelines`, `pipeline_card_assignments`
 * e o enriquecimento do lead (`lead_extras`, `lead_followups`, `lead_contact_history`). Os nomes são os mesmos em
 * camelCase para a migração futura para o Supabase ser um mapeamento 1 para 1 (ver docs/supabase-schema-crm.sql).
 */

export type Dimensao = 'orcamento' | 'agendamento' | 'lead';

/** Uma coluna do funil. A 1ª posição do array é o topo de funil. Ganho/perda são reconhecidos pelo RÓTULO (classeDaEtapa). */
export type Etapa = { id: string; label: string; color: string; cadenciaDias?: number; posX?: number; posY?: number };

export type RegraAuto = {
  id: string; deStageId: string; paraStageId: string;
  tipo: 'apos_horas' | 'horario_diario' | 'horario_semanal';
  horas?: number; horario?: string; diaSemana?: number;
};

export type Funil = {
  id: string; nome: string; dimensao: Dimensao;
  unidadeId?: string | null;
  statusPermitidos: string[];
  dataInicial?: string; dataFinal?: string;
  filtroEspecialidade?: string; filtroServico?: string;
  /** cortes de valor (R$) para 1 a 5 estrelas: [2ª, 3ª, 4ª, 5ª estrela] */
  valorEstrela?: number[];
  stages: Etapa[];
  /** colunas excluídas: ficam só para o histórico e os relatórios continuarem legíveis */
  removidas?: Etapa[];
  automacoes: RegraAuto[];
  ultimaIngestaoDia?: string;
  /** funil escondido na tela (ex.: Leads WhatsApp) */
  oculto?: boolean;
  criadoEm: string;
};

/** O card como chegou (CPF é omitido de propósito). */
export type CardSnap = {
  id: string; codigo?: string; paciente: string; contato?: string; subtitulo?: string; valor: number; itens: string[];
  criadoEm: string; unidade?: string; status: string; convenio?: string; origem?: string; prioridade?: string; observacao?: string;
  /** Combo: ids de todos os agendamentos do Clinilink que este card agrupa (um por serviço, no mesmo horário). Só existe em card agrupado. */
  agendamentoIds?: string[];
};

/** Registros antigos usam `para` no lugar de `stageId`; o helper stageIdDoHistorico() aceita os dois. */
export type Mov = { stageId?: string; para?: string; em: string; manual: boolean; por?: string };

export type CaseStatus = 'aberto' | 'recuperado' | 'removido';
export type Atribuicao = {
  funilId: string; cardId: string; stageId: string;
  enteredAt: string; manual: boolean; historico: Mov[];
  originSnapshot: CardSnap; ultimoSnapshot: CardSnap; originStatus: string;
  caseStatus: CaseStatus; recoveredAt?: string;
};

/** lead_extras: chave só card_id (compartilhado entre funis) */
export type Extras = { responsavel?: string; observacoesCrm?: string; proximoContato?: string; valorNegociado?: number; valorNegociadoPor?: string; valorNegociadoEm?: string };
export type Followup = { id: string; cardId: string; data: string; hora?: string; descricao: string; resultado?: string; proximaData?: string };
/** lead_contact_history: não é histórico de etapa */
export type Contato = { id: string; cardId: string; data: string; tipo: string; observacao?: string };

export type Rotina = { ultimaExecucao?: string; ultimoDia?: string; resultado?: unknown; erro?: string };

export type EstadoFunis = {
  funis: Funil[];
  atribuicoes: Atribuicao[];
  extras: Record<string, Extras>;
  followups: Followup[];
  contatos: Contato[];
  rotina: Rotina;
};

export class FunilError extends Error {
  constructor(public codigo: string, mensagem: string) { super(mensagem); }
}
