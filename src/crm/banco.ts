import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Lead } from './motor.js';
import type { Usuario } from '../lib/usuarios.js';
import { migrarGuia, regrasPadrao, type LogAuto, type Regra } from './automacoes.js';
import { funisPadrao } from './pipeline/regras.js';
import type { EstadoFunis } from './pipeline/tipos.js';
import { supabaseConfigurado } from '../lib/supabase.js';
import type { DisparoAutoCfg } from './disparo-auto-tipos.js';
import { agendarGravacao, atualizarLeads, atualizarUsuarios, carregarDoBanco, erroDoBanco, esvaziar } from './persistencia.js';

/**
 * Armazenamento do CRM: um arquivo JSON (.data/crm.json, fora do git) mantido em memória e regravado de forma
 * atômica (arquivo temporário + rename) a cada mudança. Serve para um servidor de uma instância só, que é o caso
 * de hoje. Na Vercel o disco é só leitura: lá o CRM funciona só na memória da instância e a tela avisa.
 * CRM_ARQUIVO muda o local; CRM_PERSISTIR=false desliga a gravação.
 */
export type Estado = { versao: 1; atendentes: string[]; leads: Lead[]; automacoes: Regra[]; logAuto: LogAuto[]; pipelines: EstadoFunis; usuarios: Usuario[]; disparoAuto?: DisparoAutoCfg };

const ARQUIVO = process.env.CRM_ARQUIVO || '.data/crm.json';
/** Com SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY o banco é o Supabase (CRM_ARMAZENAMENTO=arquivo força o arquivo). */
export const USA_BANCO = supabaseConfigurado() && process.env.CRM_ARMAZENAMENTO !== 'arquivo';
const USA_ARQUIVO = !process.env.VERCEL && process.env.CRM_PERSISTIR !== 'false';
export const PERSISTENTE = USA_BANCO || USA_ARQUIVO;
/** Se o Supabase estiver fora do ar na subida, o servidor segue no arquivo (sem escrever no banco) e a tela avisa. */
let bancoIndisponivel = false;
let ultimaTentativa = 0;
let voltando: Promise<void> | null = null;

export const estado: Estado = { usuarios: [], versao: 1, atendentes: [], leads: [], automacoes: regrasPadrao(new Date()), logAuto: [], pipelines: { funis: funisPadrao(new Date()), atribuicoes: [], extras: {}, followups: [], contatos: [], rotina: {} } };
let fila: Promise<unknown> = Promise.resolve();
let pastaOk = false;
let ultimoErro: string | null = null;

async function carregarArquivo() {
  if (!USA_ARQUIVO) return;
  try {
    const dados = JSON.parse(await readFile(ARQUIVO, 'utf8')) as Partial<Estado>;
    estado.atendentes = Array.isArray(dados.atendentes) ? dados.atendentes : [];
    estado.leads = Array.isArray(dados.leads) ? dados.leads : [];
    estado.logAuto = Array.isArray(dados.logAuto) ? dados.logAuto : [];
    estado.usuarios = Array.isArray(dados.usuarios) ? dados.usuarios : [];
    const pl = dados.pipelines;
    if (pl && Array.isArray(pl.funis) && pl.funis.length) {
      estado.pipelines = { funis: pl.funis, atribuicoes: Array.isArray(pl.atribuicoes) ? pl.atribuicoes : [], extras: pl.extras ?? {}, followups: Array.isArray(pl.followups) ? pl.followups : [], contatos: Array.isArray(pl.contatos) ? pl.contatos : [], rotina: pl.rotina ?? {} };
    }
    // as duas automações do guia sempre existem; as da equipe vêm do arquivo
    const salvas = Array.isArray(dados.automacoes) ? dados.automacoes : [];
    const padrao = regrasPadrao(new Date());
    estado.automacoes = [...padrao.map((p) => salvas.find((s) => s.id === p.id) ?? p), ...salvas.filter((s) => !s.builtin)];
    migrarGuia(estado.automacoes);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      ultimoErro = `Não consegui ler ${ARQUIVO}: ${(e as Error).message}`;
      console.error(`[crm] ${ultimoErro}`);
    }
  }
}
async function carregar() {
  await carregarArquivo();
  if (!USA_BANCO) return;
  try {
    const n = await carregarDoBanco(estado);
    if (n === 0) {
      // banco vazio: o que veio do arquivo (ou os padrões) é enviado de uma vez
      await esvaziar(estado);
      console.log(`[crm] Supabase vazio: ${estado.leads.length} leads, ${estado.pipelines.atribuicoes.length} cards e ${estado.pipelines.funis.length} funis enviados.`);
    } else console.log(`[crm] Supabase: ${n} linhas carregadas.`);
  } catch (e) {
    bancoIndisponivel = true; ultimaTentativa = Date.now();
    ultimoErro = `Supabase indisponível (${(e as Error).message}). Usando o arquivo local, sem gravar no banco.`;
    console.error(`[crm] ${ultimoErro}`);
  }
}
async function carregarTudo() {
  await carregar();
  // contas do painel: se o banco ainda não tem a tabela (ou veio vazia), volta do backup local
  const { restaurarBackup } = await import('../lib/usuarios.js');
  restaurarBackup();
}
const carregado = carregarTudo();
export const pronto = () => carregado;

/**
 * Banco que falhou na subida: tenta de novo (no máximo a cada 10 s) em vez de ficar só na memória para sempre.
 * Espera até 8 s pelo resultado; se ainda estiver tentando, segue e a próxima requisição vê o desfecho.
 */
export function tentarVoltarAoBanco(): Promise<void> {
  if (!bancoIndisponivel || !USA_BANCO) return Promise.resolve();
  if (!voltando && Date.now() - ultimaTentativa >= 10_000) {
    voltando = (async () => {
      try {
        const n = await carregarDoBanco(estado);
        if (n === 0) await esvaziar(estado);
        bancoIndisponivel = false; ultimoErro = null;
        console.log(`[crm] Supabase voltou: ${n} linhas carregadas.`);
      } catch (e) {
        ultimoErro = `Supabase indisponível (${(e as Error).message}). Sem gravar no banco por enquanto; tentando de novo.`;
        console.error(`[crm] ${ultimoErro}`);
      } finally { ultimaTentativa = Date.now(); voltando = null; }
    })();
  }
  return voltando ? Promise.race([voltando, new Promise<void>((r) => { setTimeout(r, 8_000).unref(); })]) : Promise.resolve();
}
/** Com banco configurado mas fora do ar, as escritas só iriam para a memória e se perderiam: o painel recusa em vez de fingir que salvou. */
export const bancoFora = () => USA_BANCO && bancoIndisponivel;

/** Serverless (Vercel): várias instâncias e a função congela depois da resposta, então a memória não é confiável entre requisições. */
const SERVERLESS_COM_BANCO = () => Boolean(process.env.VERCEL) && USA_BANCO && !bancoIndisponivel;

/** Antes de olhar as contas (login, sessão, lista): traz do banco as que outras instâncias criaram. */
export async function atualizarContas(ttlMs?: number) {
  if (!process.env.VERCEL || !USA_BANCO) return;
  await carregado;
  if (bancoIndisponivel) return tentarVoltarAoBanco();
  await atualizarUsuarios(estado, ttlMs);
}

/** Antes de cada chamada da API: traz do banco os leads que outras instâncias da Vercel mexeram (sem isto, cada uma mostra a sua versão). */
export async function atualizarLeadsDoBanco() {
  if (!process.env.VERCEL || !USA_BANCO) return;
  await carregado;
  if (bancoIndisponivel) return;
  await atualizarLeads(estado);
}

/** Na resposta de uma escrita, espera o Supabase confirmar antes de devolver ao navegador (a função pode congelar logo depois). */
export async function gravarAntesDeResponder() {
  if (SERVERLESS_COM_BANCO()) await esvaziar(estado);
}

/** Chame depois de qualquer mudança em `estado`. */
export function salvar() {
  if (USA_BANCO && !bancoIndisponivel) { agendarGravacao(estado); return; }
  if (!USA_ARQUIVO) return;
  const texto = JSON.stringify(estado);
  fila = fila
    .then(async () => {
      if (!pastaOk) { await mkdir(dirname(ARQUIVO), { recursive: true }); pastaOk = true; }
      const tmp = `${ARQUIVO}.tmp`;
      await writeFile(tmp, texto, 'utf8');
      await rename(tmp, ARQUIVO);
      ultimoErro = null;
    })
    .catch((e) => {
      ultimoErro = `Não consegui gravar ${ARQUIVO}: ${(e as Error).message}`;
      console.error(`[crm] ${ultimoErro}`);
    });
}

export const infoArmazenamento = () => ({
  persistente: PERSISTENTE, destino: USA_BANCO && !bancoIndisponivel ? 'supabase' : USA_ARQUIVO ? 'arquivo' : 'memoria',
  arquivo: USA_ARQUIVO ? ARQUIVO : null, erro: erroDoBanco() ?? ultimoErro,
});
