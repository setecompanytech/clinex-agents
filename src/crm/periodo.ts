import { diffDias, hojeDe, somaDias } from './motor.js';

/**
 * Janela de datas das análises: de/ate são dias (aaaa-mm-dd, fuso de Belém), os dois incluídos. É o que o filtro de
 * período da tela manda (atalhos como "Últimos 30 dias" e datas escolhidas no calendário viram sempre de/ate).
 * As funções de análise aceitam também um número de dias (últimos N dias terminando hoje), como antes.
 */
export type Janela = { de: string; ate: string; dias: number };

export const MAX_DIAS_JANELA = 366;
const DIA_OK = /^\d{4}-\d{2}-\d{2}$/;
const diaValido = (v: unknown): v is string => typeof v === 'string' && DIA_OK.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
/** Como falar do período nos textos das análises ("nos últimos 30 dias", "hoje", "de 04/10/2026 a 13/10/2026"). */
export function fraseJanela(j: Janela, hojeReal: string): { quando: string; Quando: string } {
  const q = j.ate === hojeReal ? (j.dias === 1 ? 'hoje' : `nos últimos ${j.dias} dias`) : j.de === j.ate ? `em ${br(j.de)}` : `de ${br(j.de)} a ${br(j.ate)}`;
  return { quando: q, Quando: q.charAt(0).toUpperCase() + q.slice(1) };
}

/** Últimos `dias` dias terminando em `ate` (hoje, por padrão). */
export function ultimosDias(dias: number, agora: Date, ate = hojeDe(agora)): Janela {
  const n = Number.isInteger(dias) && dias >= 1 ? Math.min(dias, MAX_DIAS_JANELA) : 30;
  return { de: somaDias(ate, -(n - 1)), ate, dias: n };
}

/** Aceita a janela pronta ou um número de dias. */
export function janela(p: number | Janela | undefined, agora: Date): Janela {
  if (p && typeof p === 'object') return p;
  return ultimosDias(Number(p), agora);
}

/** Lê ?de=aaaa-mm-dd&ate=aaaa-mm-dd (ou o antigo ?dias=N). Nunca passa de hoje nem de 366 dias; datas trocadas são corrigidas. */
export function janelaDaQuery(q: Record<string, unknown>, agora: Date): Janela {
  const hoje = hojeDe(agora);
  const de = diaValido(q.de) ? q.de : undefined, ate = diaValido(q.ate) ? q.ate : undefined;
  if (!de && !ate) return ultimosDias(Number(q.dias), agora);
  let fim = ate ?? hoje; if (fim > hoje) fim = hoje;
  let ini = de ?? somaDias(fim, -29); if (ini > fim) [ini, fim] = [fim, ini];
  if (diffDias(ini, fim) + 1 > MAX_DIAS_JANELA) ini = somaDias(fim, -(MAX_DIAS_JANELA - 1));
  return { de: ini, ate: fim, dias: diffDias(ini, fim) + 1 };
}
