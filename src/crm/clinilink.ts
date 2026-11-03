/**
 * Cliente do Clinilink para o CRM (SOMENTE LEITURA, rotas /v1/crm/*, chave CRM_CLINILINK_API_KEY).
 * Não usa a chave do agente receptivo (CLINILINK_API_KEY) nem as rotas de agendamento com escrita.
 * Segue docs/integracao-clinilink: paginação limite<=500 + offset até atingir `total`; o plano free do Render pode
 * levar ~1 min para acordar, por isso o tempo de espera é longo e há uma nova tentativa.
 */

export type Unidade = { id: string; nome: string };
export type PacienteCrm = { id?: string; nome: string; telefone?: string; cpf?: string };
export type OrcamentoCrm = {
  orcamentoId: string; codigo?: string; status: string; criadoEm: string; unidade?: Unidade; paciente: PacienteCrm;
  solicitante?: string; valorBruto?: number; desconto?: number; valorLiquido?: number; itens?: { nome?: string; [k: string]: unknown }[];
  convenio?: string; origem?: string; prioridade?: string; observacao?: string;
};
export type AgendamentoCrm = {
  agendamentoId: string; status: string; dataHora: string; agendaHoraInicio?: string; paciente: PacienteCrm;
  profissional?: { id?: string; nome?: string }; unidade?: Unidade; procedimentos?: { id?: string; nome: string }[]; valorTotal?: number; observacao?: string;
};
export type Catalogo = { especialidades: string[]; servicos: string[] };

export class ClinilinkError extends Error {
  constructor(public codigo: string, mensagem: string) { super(mensagem); }
}

const base = () => (process.env.CRM_CLINILINK_BASE_URL || 'https://lista-unilab-clinex.onrender.com').replace(/\/+$/, '');
export const clinilinkConfigurado = () => Boolean(process.env.CRM_CLINILINK_API_KEY);

const PAGINA = 500;
const MAX_PAGINAS = 60;
const ESPERA_MS = 90_000;

async function get<T>(caminho: string, params: Record<string, string | number | undefined>): Promise<T> {
  const chave = process.env.CRM_CLINILINK_API_KEY;
  if (!chave) throw new ClinilinkError('config', 'CRM_CLINILINK_API_KEY não está configurada no .env.');
  const url = new URL(base() + caminho);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  let ultimo: Error = new ClinilinkError('rede', 'Não consegui falar com o Clinilink.');
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ESPERA_MS);
    try {
      const res = await fetch(url, { headers: { 'x-api-key': chave, accept: 'application/json' }, signal: ctl.signal });
      const corpo = (await res.json().catch(() => ({}))) as { ok?: boolean; erro?: string; mensagem?: string };
      if (res.ok && corpo.ok !== false) return corpo as T;
      const erro = new ClinilinkError(corpo.erro || `http_${res.status}`, corpo.mensagem || `O Clinilink respondeu ${res.status}.`);
      if (res.status < 500) throw erro; // 4xx (chave errada, parâmetro inválido): repetir não adianta
      ultimo = erro;
    } catch (e) {
      if (e instanceof ClinilinkError && !e.codigo.startsWith('http_5')) throw e;
      ultimo = (e as Error).name === 'AbortError' ? new ClinilinkError('tempo', 'O Clinilink demorou demais para responder (o servidor pode estar acordando).') : (e as Error);
    } finally { clearTimeout(t); }
  }
  throw ultimo;
}

async function paginado<T>(caminho: string, campo: string, params: Record<string, string | number | undefined>): Promise<T[]> {
  const todos: T[] = [];
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const r = await get<Record<string, unknown> & { total?: number }>(caminho, { ...params, limite: PAGINA, offset: p * PAGINA });
    const lote = (r[campo] as T[] | undefined) ?? [];
    todos.push(...lote);
    if (!lote.length || todos.length >= (r.total ?? 0)) break;
  }
  return todos;
}

export type FiltroOrcamentos = { unidadeId?: string; dataInicial?: string; dataFinal?: string; status?: string; especialidade?: string; servico?: string };
export const orcamentos = (f: FiltroOrcamentos = {}) => paginado<OrcamentoCrm>('/v1/crm/orcamentos', 'orcamentos', { ...f });

/** `unidadeId` e `dataInicial` são obrigatórios na API: uma chamada por unidade. */
export type FiltroAgendamentos = { unidadeId: string; dataInicial: string; dataFinal?: string; status?: string };
export const agendamentos = (f: FiltroAgendamentos) => paginado<AgendamentoCrm>('/v1/crm/agendamentos', 'agendamentos', { ...f });

export const catalogo = () => get<Catalogo & { ok: boolean }>('/v1/crm/catalogo-servicos', {}).then(({ especialidades, servicos }) => ({ especialidades, servicos }));
