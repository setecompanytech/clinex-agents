import { appendFile, mkdir, readFile, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { aoEvento } from '../lib/log.js';
import { sbApagar, sbInserir, sbLer, sbVazia, supabaseConfigurado } from '../lib/supabase.js';
import type { Evento } from '../logs/vercel.js';

/**
 * Memória de eventos do BI do Agente Receptivo. Recebe cada evento (já mascarado em src/lib/log.ts).
 *  - Com SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY: grava na tabela `agente_eventos` (funciona também na Vercel,
 *    onde o disco é só leitura) e lê de lá. A memória vira só um cache do banco, atualizado a cada poucos segundos.
 *    BI_ARMAZENAMENTO=arquivo força o modo antigo.
 *  - Sem Supabase: memória + arquivo .data/eventos.jsonl (fora da Vercel).
 * Retenção de 90 dias nos dois modos.
 */
const ARQUIVO = process.env.BI_ARQUIVO || '.data/eventos.jsonl';
const PODE_ARQUIVO = !process.env.VERCEL && process.env.BI_PERSISTIR !== 'false';
/** Se o Supabase não responder na subida (ou faltar tabela), o BI segue no arquivo local: nenhum evento se perde. */
let USA_BANCO = supabaseConfigurado() && process.env.BI_ARMAZENAMENTO !== 'arquivo';
let PERSISTIR = !USA_BANCO && PODE_ARQUIVO;
const RETENCAO_MS = 90 * 24 * 3_600_000;
const MAX_MEMORIA = 60_000;
const TABELA = 'agente_eventos';
const ATUALIZA_A_CADA_MS = 5_000;

let memoria: Evento[] = [];
let fila: Promise<unknown> = Promise.resolve();
let pastaOk = false;
let avisouErro = false;
let erroBanco: string | null = null;

// ------------------------------------------------------------------------------------------------ modo arquivo

function gravarArquivo(e: Evento) {
  fila = fila
    .then(async () => {
      if (!pastaOk) { await mkdir(dirname(ARQUIVO), { recursive: true }); pastaOk = true; }
      await appendFile(ARQUIVO, JSON.stringify(e) + '\n', 'utf8');
    })
    .catch((err) => {
      if (avisouErro) return;
      avisouErro = true;
      console.error(`[bi] não consegui gravar ${ARQUIVO}: ${(err as Error).message}`);
    });
}

async function lerArquivo(): Promise<Evento[]> {
  const corte = Date.now() - RETENCAO_MS;
  const lidos: Evento[] = [];
  try {
    for (const linha of (await readFile(ARQUIVO, 'utf8')).split('\n')) {
      if (!linha) continue;
      try {
        const e = JSON.parse(linha) as Evento;
        if (e?.evt && Date.parse(e.t) >= corte) lidos.push(e);
      } catch { /* linha cortada por queda de energia */ }
    }
  } catch { /* arquivo ainda não existe */ }
  return lidos;
}

/** Se outro processo acrescentou eventos ao arquivo (ex.: scripts/bi-importar-vercel.ts), traz para a memória sem duplicar. */
let mtimeVisto = 0; let recarregouEm = 0;
async function recarregarSeMudou() {
  if (!PERSISTIR || Date.now() - recarregouEm < ATUALIZA_A_CADA_MS) return;
  recarregouEm = Date.now();
  try {
    const m = (await stat(ARQUIVO)).mtimeMs;
    if (m === mtimeVisto) return;
    mtimeVisto = m;
    const doArquivo = await lerArquivo();
    const vistos = new Set(memoria.map((e) => JSON.stringify(e)));
    const novos = doArquivo.filter((e) => !vistos.has(JSON.stringify(e)));
    if (novos.length) memoria = [...memoria, ...novos].sort((a, b) => Date.parse(a.t) - Date.parse(b.t)).slice(-MAX_MEMORIA);
  } catch { /* arquivo ainda não existe */ }
}

// ------------------------------------------------------------------------------------------------ modo Supabase

const linhaDe = (e: Evento) => ({ t: e.t, evt: e.evt, atendimento: (e as { atendimento?: string }).atendimento ?? null, dados: e });
let pendentes: Evento[] = [];
let enviando = false;
let ultimoT = '';

/** Envia o que acumulou (várias mensagens ao mesmo tempo viram um lote só). Se falhar, tenta de novo no próximo evento. */
function enviar() {
  if (enviando || !pendentes.length) return;
  enviando = true;
  const lote = pendentes.splice(0, 500);
  sbInserir(TABELA, lote.map(linhaDe))
    .then(() => { erroBanco = null; })
    .catch((err) => {
      pendentes = [...lote, ...pendentes].slice(-5000); // devolve ao início da fila, com teto
      erroBanco = (err as Error).message;
      if (!avisouErro) { avisouErro = true; console.error(`[bi] não consegui gravar no Supabase: ${erroBanco}`); }
    })
    .finally(() => { enviando = false; if (pendentes.length && !erroBanco) setTimeout(enviar, 0); });
}

async function carregarDoBanco() {
  const corte = new Date(Date.now() - RETENCAO_MS).toISOString();
  // migração única: tabela vazia e arquivo antigo existente
  if (await sbVazia(TABELA)) {
    const antigos = await lerArquivo();
    if (antigos.length) { await sbInserir(TABELA, antigos.map(linhaDe)); console.log(`[bi] ${antigos.length} eventos do arquivo enviados ao Supabase.`); }
  }
  // os mais recentes primeiro (limite), depois inverte para ficar em ordem de tempo
  const linhas = await sbLer<{ dados: Evento; t: string }>(TABELA, { filtro: { t: `gte.${corte}` }, ordem: 't.desc', max: MAX_MEMORIA });
  memoria = linhas.reverse().map((l) => l.dados);
  ultimoT = linhas.length ? new Date(linhas[linhas.length - 1].t).toISOString() : corte;
  sbApagar(TABELA, { t: `lt.${corte}` }).catch(() => { /* limpeza é só higiene */ });
}

let atualizadoEm = 0;
let atualizando: Promise<void> | null = null;
/** Traz os eventos novos do banco (de qualquer instância, inclusive de outras da Vercel). */
function atualizar(): Promise<void> {
  if (Date.now() - atualizadoEm < ATUALIZA_A_CADA_MS) return Promise.resolve();
  if (atualizando) return atualizando;
  atualizando = (async () => {
    try {
      const novos = await sbLer<{ dados: Evento; t: string }>(TABELA, { filtro: { t: `gt.${ultimoT}` }, ordem: 't.asc', max: MAX_MEMORIA });
      if (novos.length) {
        memoria = [...memoria, ...novos.map((l) => l.dados)];
        if (memoria.length > MAX_MEMORIA) memoria = memoria.slice(-Math.floor(MAX_MEMORIA * 0.9));
        ultimoT = new Date(novos[novos.length - 1].t).toISOString();
      }
      atualizadoEm = Date.now(); erroBanco = null;
    } catch (err) { erroBanco = (err as Error).message; }
    finally { atualizando = null; }
  })();
  return atualizando;
}

// ------------------------------------------------------------------------------------------------ comum

function guardar(e: Record<string, unknown>) {
  if (e.app !== 'amanda' || typeof e.evt !== 'string' || typeof e.t !== 'string') return;
  if (USA_BANCO) { pendentes.push(e as Evento); enviar(); return; } // no banco ele volta pela atualização, sem duplicar
  memoria.push(e as Evento);
  if (memoria.length > MAX_MEMORIA) memoria = memoria.slice(-Math.floor(MAX_MEMORIA * 0.9));
  if (PERSISTIR) gravarArquivo(e as Evento);
}

async function carregar() {
  if (USA_BANCO) {
    try { await carregarDoBanco(); atualizadoEm = Date.now(); }
    catch (err) {
      erroBanco = (err as Error).message;
      console.error(`[bi] Supabase indisponível (${erroBanco}). Usando o arquivo local.`);
      USA_BANCO = false; PERSISTIR = PODE_ARQUIVO;
      if (PERSISTIR) memoria = [...(await lerArquivo()).slice(-MAX_MEMORIA), ...memoria];
      // eventos que chegaram enquanto o banco ainda estava sendo testado não podem se perder
      for (const e of pendentes.splice(0)) { memoria.push(e); if (PERSISTIR) gravarArquivo(e); }
    }
    return;
  }
  if (!PERSISTIR) return;
  memoria = [...(await lerArquivo()).slice(-MAX_MEMORIA), ...memoria];
}

const carregado = carregar();
aoEvento(guardar);
if (USA_BANCO) setInterval(() => { if (!USA_BANCO) return; sbApagar(TABELA, { t: `lt.${new Date(Date.now() - RETENCAO_MS).toISOString()}` }).catch(() => { /* higiene */ }); }, 24 * 3_600_000).unref();

export async function eventosDaMemoria(desdeMs: number): Promise<Evento[]> {
  await carregado;
  if (USA_BANCO) await atualizar(); else await recarregarSeMudou();
  const base = memoria.filter((e) => Date.parse(e.t) >= desdeMs);
  // eventos ainda a caminho do banco também contam (senão sumiriam por alguns segundos)
  return USA_BANCO ? [...base, ...pendentes.filter((e) => Date.parse(e.t) >= desdeMs)] : base;
}

export const estadoArmazem = () => ({
  persistente: USA_BANCO || PERSISTIR, destino: USA_BANCO ? 'supabase' : PERSISTIR ? 'arquivo' : 'memoria',
  arquivo: PERSISTIR ? ARQUIVO : null, eventosEmMemoria: memoria.length, pendentes: pendentes.length, erro: erroBanco,
});
