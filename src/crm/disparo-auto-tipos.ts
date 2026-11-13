/** Tipos da IA de disparo (agente ATIVO do CRM). Não tem nada a ver com o agente receptivo (Amanda). */

/** desligado: não faz nada. sombra: decide e registra o que enviaria, sem enviar. ligado: envia de verdade (ainda sob as travas do disparo). */
export type ModoAuto = 'desligado' | 'sombra' | 'ligado';

export type DetalheRodada = {
  leadId: string; nome: string; passo: string; msg?: number; modelo?: string;
  resultado: 'enviado' | 'sombra' | 'pulado' | 'erro'; motivo?: string; variaveis?: string[];
};

export type Rodada = {
  quando: string; modo: ModoAuto;
  /** leads com passo automático avaliados nesta rodada */
  avaliados: number;
  enviados: number; sombra: number; erros: number;
  /** por que não enviou: motivo -> quantos leads */
  pulados: Record<string, number>;
  detalhes: DetalheRodada[];
};

export type DisparoAutoCfg = { modo: ModoAuto; alteradoPor?: string; alteradoEm?: string; ultimaRodada?: Rodada };
