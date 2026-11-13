/** Tipos da IA de disparo (agente ATIVO do CRM). Não tem nada a ver com o agente receptivo (Amanda). */

import type { Lead } from './motor.js';

/**
 * desligado: não faz nada. simulacao: só trabalha nos leads FICTÍCIOS do laboratório do IA Manager (nenhum paciente real é avaliado).
 * sombra: decide e registra o que enviaria nos leads reais, sem enviar. ligado: envia de verdade (ainda sob as travas do disparo).
 */
export type ModoAuto = 'desligado' | 'simulacao' | 'sombra' | 'ligado';

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

/** Um gatilho = um passo da cadência do guia que a IA pode enviar sozinha, com o que o gerente pode ajustar. */
export type GatilhoCfg = {
  ativo: boolean;
  /** hora do disparo (HH:MM, entre 08:00 e 18:59): a IA só envia depois dela, no dia em que o passo vence */
  hora: string;
  /** condições: só envia se o lead cumprir todas (vazio = sem restrição) */
  valorMin?: number; valorMax?: number; unidades?: string[];
  /** parâmetros do texto da mensagem (só os gatilhos que têm essa variável) */
  desconto?: '10%' | '5%'; prazo?: 'hoje' | 'esta semana' | 'este mês';
};

export type PausaCfg = { id: string; de: string; ate: string; motivo: string };

/** Configuração da IA. O guia continua mandando: janela de 8h às 19h e 2 contatos por dia por lead não dá para ampliar, só estreitar. */
export type ConfigAuto = {
  janela: { inicio: number; fim: number };
  /** 0 = domingo … 6 = sábado: dias em que a IA pode enviar */
  diasSemana: number[];
  limites: { porRodada: number; porDia: number };
  pausas: PausaCfg[];
  /** disjuntor: se a Inovstar recusar N envios seguidos numa rodada, a IA se desliga sozinha */
  disjuntor: { ativo: boolean; erros: number };
  gatilhos: Record<string, GatilhoCfg>;
  historico: { quando: string; quem: string; resumo: string }[];
};

export type DisparoAutoCfg = { modo: ModoAuto; alteradoPor?: string; alteradoEm?: string; ultimaRodada?: Rodada; config?: Partial<ConfigAuto>; simulacao?: { leads: Lead[] } };
