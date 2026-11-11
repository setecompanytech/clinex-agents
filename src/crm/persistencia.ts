import { sbApagar, sbGravar, sbLer } from '../lib/supabase.js';
import type { Estado } from './banco.js';
import { migrarGuia, type Regra, type LogAuto } from './automacoes.js';
import type { Lead } from './motor.js';
import type { Usuario } from '../lib/usuarios.js';
import type { Atribuicao, CardSnap, Contato, Etapa, Extras, Followup, Funil, RegraAuto } from './pipeline/tipos.js';

/**
 * Persistência do CRM no Supabase. O resto do CRM continua mexendo no objeto `estado` em memória e chamando salvar();
 * aqui a gente compara com o que já está no banco e grava SÓ o que mudou (por linha). Tabelas do documento
 * (pipelines, pipeline_card_assignments, lead_extras, lead_followups, lead_contact_history) seguem os nomes e colunas
 * de docs/supabase-schema-crm.sql; o que o documento não cobre (leads do guia, automações, log, config) usa tabelas
 * `crm_*` com o objeto inteiro em jsonb.
 */

type Linha = Record<string, unknown>;
type Col<T> = {
  tabela: string; chave: string[]; ordem: string; opcional?: boolean;
  lista: (e: Estado) => T[]; definir: (e: Estado, xs: T[]) => void;
  paraLinha: (x: T) => Linha; deLinha: (r: Linha) => T;
};

const nulo = <T>(v: T | undefined | null) => (v === undefined ? null : v);
const iso = (v: unknown) => (v ? new Date(String(v)).toISOString() : undefined);
const dia = (v: unknown) => (v ? String(v).slice(0, 10) : undefined);
const semNulos = <T extends object>(o: T): T => { for (const k of Object.keys(o)) if ((o as Record<string, unknown>)[k] == null) delete (o as Record<string, unknown>)[k]; return o; };

const funis: Col<Funil> = {
  tabela: 'pipelines', chave: ['id'], ordem: 'id',
  lista: (e) => e.pipelines.funis, definir: (e, xs) => { e.pipelines.funis = xs; },
  paraLinha: (f) => ({
    id: f.id, nome: f.nome, dimensao: f.dimensao, unidade_id: nulo(f.unidadeId), status_permitidos: f.statusPermitidos,
    data_inicial: nulo(f.dataInicial), data_final: nulo(f.dataFinal), filtro_especialidade: nulo(f.filtroEspecialidade), filtro_servico: nulo(f.filtroServico),
    valor_estrela: nulo(f.valorEstrela), stages: f.stages, automacoes: f.automacoes, ultima_ingestao_dia: nulo(f.ultimaIngestaoDia),
    removidas: f.removidas ?? [], oculto: !!f.oculto, criado_em: f.criadoEm,
  }),
  deLinha: (r) => semNulos({
    id: r.id as string, nome: r.nome as string, dimensao: r.dimensao as Funil['dimensao'], unidadeId: nulo(r.unidade_id as string | null),
    statusPermitidos: (r.status_permitidos as string[]) ?? [], dataInicial: dia(r.data_inicial), dataFinal: dia(r.data_final),
    filtroEspecialidade: r.filtro_especialidade as string | undefined, filtroServico: r.filtro_servico as string | undefined,
    valorEstrela: r.valor_estrela as number[] | undefined, stages: (r.stages as Etapa[]) ?? [], automacoes: (r.automacoes as RegraAuto[]) ?? [],
    ultimaIngestaoDia: dia(r.ultima_ingestao_dia), removidas: ((r.removidas as Etapa[]) ?? []).length ? (r.removidas as Etapa[]) : undefined, oculto: r.oculto ? true : undefined,
    criadoEm: iso(r.criado_em) ?? new Date().toISOString(),
  }) as Funil,
};

const atribuicoes: Col<Atribuicao> = {
  tabela: 'pipeline_card_assignments', chave: ['pipeline_id', 'card_id'], ordem: 'card_id',
  lista: (e) => e.pipelines.atribuicoes, definir: (e, xs) => { e.pipelines.atribuicoes = xs; },
  paraLinha: (a) => ({
    pipeline_id: a.funilId, card_id: a.cardId, stage_id: a.stageId, entered_at: a.enteredAt, manual: a.manual, historico: a.historico,
    origin_snapshot: a.originSnapshot, ultimo_snapshot: a.ultimoSnapshot, origin_status: a.originStatus, case_status: a.caseStatus, recovered_at: nulo(a.recoveredAt),
  }),
  deLinha: (r) => semNulos({
    funilId: r.pipeline_id as string, cardId: r.card_id as string, stageId: r.stage_id as string, enteredAt: iso(r.entered_at)!, manual: !!r.manual,
    historico: ((r.historico as Atribuicao['historico']) ?? []).map((m) => ({ ...m, em: iso(m.em) ?? m.em })), originSnapshot: r.origin_snapshot as CardSnap, ultimoSnapshot: r.ultimo_snapshot as CardSnap,
    originStatus: (r.origin_status as string) ?? '', caseStatus: r.case_status as Atribuicao['caseStatus'], recoveredAt: iso(r.recovered_at),
  }) as Atribuicao,
};

type ExtrasLinha = Extras & { cardId: string };
const extras: Col<ExtrasLinha> = {
  tabela: 'lead_extras', chave: ['card_id'], ordem: 'card_id',
  lista: (e) => Object.entries(e.pipelines.extras).map(([cardId, x]) => ({ cardId, ...x })),
  definir: (e, xs) => { e.pipelines.extras = Object.fromEntries(xs.map(({ cardId, ...x }) => [cardId, x])); },
  paraLinha: (x) => ({ card_id: x.cardId, responsavel: nulo(x.responsavel), observacoes_crm: nulo(x.observacoesCrm), proximo_contato: nulo(x.proximoContato), valor_negociado: nulo(x.valorNegociado), valor_negociado_por: nulo(x.valorNegociadoPor), valor_negociado_em: nulo(x.valorNegociadoEm) }),
  deLinha: (r) => semNulos({ cardId: r.card_id as string, responsavel: r.responsavel as string | undefined, observacoesCrm: r.observacoes_crm as string | undefined, proximoContato: dia(r.proximo_contato), valorNegociado: r.valor_negociado === null || r.valor_negociado === undefined ? undefined : Number(r.valor_negociado), valorNegociadoPor: r.valor_negociado_por as string | undefined, valorNegociadoEm: iso(r.valor_negociado_em) }) as ExtrasLinha,
};

const followups: Col<Followup> = {
  tabela: 'lead_followups', chave: ['id'], ordem: 'id',
  lista: (e) => e.pipelines.followups, definir: (e, xs) => { e.pipelines.followups = xs; },
  paraLinha: (f) => ({ id: f.id, card_id: f.cardId, data: f.data, hora: nulo(f.hora), descricao: f.descricao, resultado: nulo(f.resultado), proxima_data: nulo(f.proximaData) }),
  deLinha: (r) => semNulos({ id: r.id as string, cardId: r.card_id as string, data: dia(r.data)!, hora: r.hora as string | undefined, descricao: (r.descricao as string) ?? '', resultado: r.resultado as string | undefined, proximaData: dia(r.proxima_data) }) as Followup,
};

const contatos: Col<Contato> = {
  tabela: 'lead_contact_history', chave: ['id'], ordem: 'id',
  lista: (e) => e.pipelines.contatos, definir: (e, xs) => { e.pipelines.contatos = xs; },
  paraLinha: (c) => ({ id: c.id, card_id: c.cardId, data: c.data, tipo: c.tipo, observacao: nulo(c.observacao) }),
  deLinha: (r) => semNulos({ id: r.id as string, cardId: r.card_id as string, data: iso(r.data)!, tipo: r.tipo as string, observacao: r.observacao as string | undefined }) as Contato,
};

/** Objeto inteiro em jsonb: leads do guia, automações do guia/equipe e o log de automações. */
function docs<T extends { id: string }>(tabela: string, get: (e: Estado) => T[], set: (e: Estado, xs: T[]) => void, ordem = 'id'): Col<T> {
  return { tabela, chave: ['id'], ordem, lista: get, definir: set, paraLinha: (x) => ({ id: x.id, dados: x }), deLinha: (r) => r.dados as T };
}
const leads = docs<Lead>('crm_leads', (e) => e.leads, (e, xs) => { e.leads = xs; });
const automacoes = docs<Regra>('crm_automacoes', (e) => e.automacoes, (e, xs) => { e.automacoes = xs; });
const usuarios: Col<Usuario> = { ...docs<Usuario>('painel_usuarios', (e) => e.usuarios, (e, xs) => { e.usuarios = xs; }), opcional: true };
const logAuto = docs<LogAuto>('crm_log_auto', (e) => e.logAuto, (e, xs) => { e.logAuto = xs.sort((a, b) => b.quando.localeCompare(a.quando)); });

/** Configurações soltas (atendentes e a rotina do Clinilink): uma linha por chave. */
type Cfg = { id: string; valor: unknown };
const config: Col<Cfg> = {
  tabela: 'crm_config', chave: ['chave'], ordem: 'chave',
  lista: (e) => [{ id: 'atendentes', valor: e.atendentes }, { id: 'rotina', valor: e.pipelines.rotina }],
  definir: (e, xs) => { for (const x of xs) { if (x.id === 'atendentes' && Array.isArray(x.valor)) e.atendentes = x.valor as string[]; if (x.id === 'rotina' && x.valor && typeof x.valor === 'object') e.pipelines.rotina = x.valor as Estado['pipelines']['rotina']; } },
  paraLinha: (x) => ({ chave: x.id, valor: x.valor }), deLinha: (r) => ({ id: r.chave as string, valor: r.valor }),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ColAny = Col<any>;
// A ordem importa na gravação (funis antes dos cards, por causa das chaves estrangeiras).
export const COLECOES = [funis, atribuicoes, extras, followups, contatos, leads, automacoes, logAuto, config, usuarios] as unknown as ColAny[];
/** Tabelas opcionais que ainda não existem no Supabase (o servidor segue sem elas e avisa). */
const ausentes = new Set<string>();
export const tabelasAusentes = () => [...ausentes];
const tabelaFaltando = (e: unknown) => /PGRST205|42P01|schema cache|does not exist/i.test(String((e as Error)?.message ?? e));
export const TABELAS_CRM = COLECOES.map((c) => c.tabela);

// ------------------------------------------------------------------------------------------------ diferença

/** O que já está no banco, por tabela: chave -> JSON da linha. */
const noBanco = new Map<string, Map<string, string>>();
/**
 * Verdadeiro depois da primeira leitura completa do banco. Antes disso a memória só tem os funis padrão (com ids novos
 * a cada subida): gravar nessa hora cria um conjunto de funis duplicado e cards repetidos dentro deles.
 */
let baseLida = false;
export const baseJaLida = () => baseLida;
const chaveDe = (c: ColAny, l: Linha) => c.chave.map((k) => String(l[k])).join('|');

/** Lê tudo do banco para dentro de `estado`. Devolve quantas linhas vieram (0 = banco vazio). */
export async function carregarDoBanco(estado: Estado): Promise<number> {
  let total = 0;
  const lidas = new Map<string, Linha[]>();
  for (const c of COLECOES) {
    try { const linhas = await sbLer<Linha>(c.tabela, { ordem: c.ordem }); lidas.set(c.tabela, linhas); total += linhas.length; }
    catch (e) { if (c.opcional && tabelaFaltando(e)) { ausentes.add(c.tabela); lidas.set(c.tabela, []); console.warn(`[crm] a tabela ${c.tabela} ainda não existe no Supabase (rode o SQL de docs/supabase-schema-crm.sql).`); } else throw e; }
  }
  // crm_config tem uma linha fixa só depois da 1ª gravação: banco "vazio" = nenhum funil, lead nem card
  const sinais = ['pipelines', 'pipeline_card_assignments', 'crm_leads', 'crm_automacoes'].reduce((s, t) => s + (lidas.get(t)?.length ?? 0), 0);
  baseLida = true; // só a partir daqui é seguro gravar: o que está na memória já parte do que o banco tem
  if (!sinais) return 0;
  for (const c of COLECOES) {
    const linhas = lidas.get(c.tabela)!;
    // tabela opcional vazia ou inexistente: mantém o que já veio do arquivo ou do backup (e grava depois, se a tabela existir)
    if (c.opcional && !linhas.length) { noBanco.set(c.tabela, new Map()); continue; }
    const objs = linhas.map((r) => c.deLinha(r));
    // funis e automações do guia sempre existem: se o banco ainda não tem, mantém os padrões já em memória
    if (c.tabela === 'pipelines' && !objs.length) continue;
    if (c.tabela === 'crm_automacoes') migrarGuia(objs as Regra[]);
    if (c.tabela === 'crm_automacoes') { const ids = new Set((objs as Regra[]).map((r) => r.id)); for (const r of estado.automacoes) if (r.builtin && !ids.has(r.id)) (objs as Regra[]).push(r); }
    (c.definir as (e: Estado, xs: unknown[]) => void)(estado, objs);
    const m = new Map<string, string>();
    for (const x of (c.lista as (e: Estado) => unknown[])(estado)) { const l = (c.paraLinha as (x: unknown) => Linha)(x); m.set(chaveDe(c, l), JSON.stringify(l)); }
    noBanco.set(c.tabela, m);
  }
  return total;
}

let fila: Promise<unknown> = Promise.resolve();
let timer: NodeJS.Timeout | null = null;
let ultimoErro: string | null = null;
export const erroDoBanco = () => ultimoErro;

/** Grava no banco o que mudou desde a última vez. Uma gravação por vez; se falhar, tenta de novo na próxima. */
export function gravarMudancas(estado: Estado): Promise<unknown> {
  fila = fila.then(async () => {
    if (!baseLida) { console.error('[crm] gravação adiada: o banco ainda não foi lido (evita criar funis duplicados).'); return; }
    try {
      for (const c of COLECOES) {
        if (ausentes.has(c.tabela)) continue;
        const antes = noBanco.get(c.tabela) ?? new Map<string, string>();
        const agora = new Map<string, { l: Linha; s: string }>();
        for (const x of (c.lista as (e: Estado) => unknown[])(estado)) { const l = (c.paraLinha as (x: unknown) => Linha)(x); agora.set(chaveDe(c, l), { l, s: JSON.stringify(l) }); }
        const mudadas = [...agora].filter(([k, v]) => antes.get(k) !== v.s);
        if (mudadas.length) {
          await sbGravar(c.tabela, mudadas.map(([, v]) => v.l), c.chave.join(','));
          for (const [k, v] of mudadas) antes.set(k, v.s);
        }
        const sumiram = [...antes.keys()].filter((k) => !agora.has(k));
        if (sumiram.length) {
          if (c.chave.length === 1) {
            for (let i = 0; i < sumiram.length; i += 100) await sbApagar(c.tabela, { [c.chave[0]]: `in.(${sumiram.slice(i, i + 100).map((k) => `"${k}"`).join(',')})` });
          } else {
            for (const k of sumiram) { const partes = k.split('|'); await sbApagar(c.tabela, Object.fromEntries(c.chave.map((col, i) => [col, `eq.${partes[i]}`]))); }
          }
          for (const k of sumiram) antes.delete(k);
        }
        noBanco.set(c.tabela, antes);
      }
      ultimoErro = null;
    } catch (e) {
      ultimoErro = `Não consegui gravar no Supabase: ${(e as Error).message}`;
      console.error(`[crm] ${ultimoErro}`);
    }
  });
  return fila;
}

/** Agrupa várias chamadas de salvar() seguidas numa só gravação (250 ms). */
export function agendarGravacao(estado: Estado) {
  if (timer) return;
  timer = setTimeout(() => { timer = null; void gravarMudancas(estado); }, 250);
}

/** Espera tudo o que está pendente (usado em testes e no desligamento). */
export async function esvaziar(estado: Estado) { if (timer) { clearTimeout(timer); timer = null; } await gravarMudancas(estado); }

let usuariosLidosEm = 0;
/**
 * Relê as contas do banco. Na Vercel há várias instâncias, cada uma com a sua memória: sem isto, a conta criada numa
 * instância não existe nas outras (e "some" ao atualizar a página). Grava o que está pendente antes, para nunca
 * sobrescrever uma mudança ainda não enviada; se a gravação ou a leitura falhar, mantém o que está na memória.
 */
export async function atualizarUsuarios(estado: Estado, ttlMs = 3000) {
  if (ausentes.has(usuarios.tabela) || Date.now() - usuariosLidosEm < ttlMs) return;
  await esvaziar(estado);
  if (ultimoErro) return;
  try {
    const linhas = await sbLer<Linha>(usuarios.tabela, { ordem: usuarios.ordem });
    estado.usuarios = linhas.map((r) => usuarios.deLinha(r));
    const m = new Map<string, string>();
    for (const x of estado.usuarios) { const l = usuarios.paraLinha(x); m.set(chaveDe(usuarios, l), JSON.stringify(l)); }
    noBanco.set(usuarios.tabela, m);
    usuariosLidosEm = Date.now();
  } catch (e) { console.error(`[usuarios] não consegui reler as contas do banco: ${(e as Error).message}`); }
}

