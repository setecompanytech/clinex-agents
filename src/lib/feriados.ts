/**
 * Feriados NACIONAIS (valem em todos os estados). REGRA DA CLÍNICA (19/11/2026): a Clinex não funciona nesses dias.
 * Fixos: Lei 662/1949, Lei 6.802/1980 (N. Sra. Aparecida), Lei 14.759/2023 (Consciência Negra, 20/11).
 * Móvel: Sexta-feira Santa (2 dias antes da Páscoa).
 * Carnaval e Corpus Christi são ponto facultativo (não entram); dia a mais em que a clínica fecha (feriado local, emenda):
 * FERIADOS_EXTRAS="2027-02-08:Carnaval,2027-02-09:Carnaval".
 */
export type Feriado = { ymd: string; nome: string };

const FIXOS: [string, string][] = [
  ['01-01', 'Confraternização Universal (Ano-Novo)'],
  ['04-21', 'Tiradentes'],
  ['05-01', 'Dia do Trabalho'],
  ['09-07', 'Independência do Brasil'],
  ['10-12', 'Nossa Senhora Aparecida'],
  ['11-02', 'Finados'],
  ['11-15', 'Proclamação da República'],
  ['11-20', 'Dia Nacional de Zumbi e da Consciência Negra'],
  ['12-25', 'Natal'],
];

const somaDias = (ymd: string, n: number) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
function pascoa(ano: number): string {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function extras(): Feriado[] {
  return (process.env.FERIADOS_EXTRAS ?? '').split(',').map((x) => x.trim()).filter(Boolean).flatMap((x) => {
    const [ymd, ...nome] = x.split(':');
    return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? [{ ymd, nome: nome.join(':').trim() || 'Feriado' }] : [];
  });
}

export function feriadosDoAno(ano: number): Feriado[] {
  const lista: Feriado[] = [...FIXOS.map(([md, nome]) => ({ ymd: `${ano}-${md}`, nome })), { ymd: somaDias(pascoa(ano), -2), nome: 'Sexta-feira Santa (Paixão de Cristo)' }];
  for (const x of extras()) if (x.ymd.startsWith(`${ano}-`) && !lista.some((f) => f.ymd === x.ymd)) lista.push(x);
  return lista.sort((a, b) => a.ymd.localeCompare(b.ymd));
}

/** Nome do feriado nacional nesse dia (YYYY-MM-DD), ou undefined se for dia normal. */
export function feriadoEm(ymd: string): string | undefined {
  return feriadosDoAno(Number(ymd.slice(0, 4))).find((f) => f.ymd === ymd)?.nome;
}

/** Feriados de `hoje` (inclusive) até `dias` depois. */
export function proximosFeriados(hoje: string, dias = 120): Feriado[] {
  const fim = somaDias(hoje, dias);
  const anos = [...new Set([Number(hoje.slice(0, 4)), Number(fim.slice(0, 4))])];
  return anos.flatMap(feriadosDoAno).filter((f) => f.ymd >= hoje && f.ymd <= fim);
}

/** Próximo dia em que a clínica atende depois de `ymd` (pula domingo e feriado; sábado atende). */
export function proximoDiaDeAtendimento(ymd: string): string {
  let d = somaDias(ymd, 1);
  for (let i = 0; i < 10 && (new Date(`${d}T12:00:00Z`).getUTCDay() === 0 || feriadoEm(d)); i++) d = somaDias(d, 1);
  return d;
}
