import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { estado, salvar } from '../crm/banco.js';

/**
 * Contas do painel (gestão de usuários). Guardadas no mesmo armazenamento do CRM (arquivo local ou Supabase, tabela
 * painel_usuarios). Senha só como hash scrypt com sal; nunca volta para a tela. O acesso mestre (PAINEL_PASSWORD)
 * continua existindo como administrador de emergência e NÃO é uma conta desta lista.
 */

export type Perfil = 'admin' | 'gestor' | 'atendente' | 'leitura';
export type Modulo = 'crm' | 'agente';
export type Usuario = {
  id: string; nome: string; email: string; perfil: Perfil; modulos: Modulo[]; ativo: boolean;
  senha: string; sessaoVersao: number; criadoEm: string; criadoPor?: string; ultimoAcesso?: string;
};
export type UsuarioPublico = Omit<Usuario, 'senha'>;

export const PERFIS: Record<Perfil, { rotulo: string; descricao: string }> = {
  admin: { rotulo: 'Administrador', descricao: 'Acessa tudo e gerencia usuários.' },
  gestor: { rotulo: 'Gestor', descricao: 'Vê e edita os módulos liberados; não gerencia usuários.' },
  atendente: { rotulo: 'Atendente', descricao: 'Trabalha nos módulos liberados (leads, cards, contatos).' },
  leitura: { rotulo: 'Somente leitura', descricao: 'Vê os módulos liberados, sem alterar nada.' },
};
export const MODULOS: Modulo[] = ['crm', 'agente'];

export class UsuarioError extends Error {
  constructor(public codigo: string, mensagem: string) { super(mensagem); }
}

// ------------------------------------------------------------------------------------------------ senha

const SENHA_MIN = 8;
export function hashSenha(senha: string): string {
  const sal = randomBytes(16);
  return `scrypt$${sal.toString('hex')}$${scryptSync(senha, sal, 32).toString('hex')}`;
}
export function confereSenha(senha: string, guardado: string): boolean {
  const [tipo, sal, hash] = guardado.split('$');
  if (tipo !== 'scrypt' || !sal || !hash) return false;
  const esperado = Buffer.from(hash, 'hex');
  const obtido = scryptSync(senha, Buffer.from(sal, 'hex'), esperado.length);
  return esperado.length === obtido.length && timingSafeEqual(esperado, obtido);
}
export function validarSenha(senha: unknown): string {
  const s = String(senha ?? '');
  if (s.length < SENHA_MIN) throw new UsuarioError('senha', `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`);
  if (s.length > 128) throw new UsuarioError('senha', 'A senha é longa demais (máximo de 128 caracteres).');
  return s;
}
/** Senha temporária legível (sem 0/O/1/l). Mostrada uma única vez ao administrador. */
export function senhaTemporaria(): string {
  const alfabeto = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const b = randomBytes(12);
  return Array.from(b, (x) => alfabeto[x % alfabeto.length]).join('');
}

// ------------------------------------------------------------------------------------------------ cadastro

const lista = () => estado.usuarios;

/** Backup local das contas (.data/usuarios.json, fora do git): garante que nenhuma conta se perde mesmo se a tabela do Supabase ainda não existir. */
const BACKUP = process.env.USUARIOS_ARQUIVO || '.data/usuarios.json';
const COM_DISCO = !process.env.VERCEL && process.env.CRM_PERSISTIR !== 'false';
function gravar() {
  salvar();
  if (!COM_DISCO) return;
  try { mkdirSync(dirname(BACKUP), { recursive: true }); writeFileSync(`${BACKUP}.tmp`, JSON.stringify(estado.usuarios), 'utf8'); renameSync(`${BACKUP}.tmp`, BACKUP); }
  catch (e) { console.error(`[usuarios] não consegui gravar o backup: ${(e as Error).message}`); }
}
/** Chamado na subida: se não veio nenhuma conta do armazenamento principal, usa o backup local. */
export function restaurarBackup() {
  if (!COM_DISCO || estado.usuarios.length) return;
  try {
    const l = JSON.parse(readFileSync(BACKUP, 'utf8')) as Usuario[];
    if (Array.isArray(l) && l.length) { estado.usuarios = l; salvar(); console.log(`[usuarios] ${l.length} conta(s) restaurada(s) do backup local.`); }
  } catch { /* sem backup ainda */ }
}
/** Responsáveis do CRM: os nomes cadastrados à mão mais os usuários ativos que têm o CRM liberado. */
export const responsaveis = (manuais: string[]): string[] => [...new Set([...manuais, ...lista().filter((u) => u.ativo && (u.perfil === 'admin' || u.modulos.includes('crm'))).map((u) => u.nome)])];
export const normalizaEmail = (e: unknown) => String(e ?? '').trim().toLowerCase();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const publico = ({ senha: _s, ...resto }: Usuario): UsuarioPublico => resto;
export const listar = (): UsuarioPublico[] => lista().map(publico).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
export const achar = (id: string) => lista().find((u) => u.id === id);
export const acharPorEmail = (email: string) => lista().find((u) => u.email === normalizaEmail(email));
const adminsAtivos = (exceto?: string) => lista().filter((u) => u.perfil === 'admin' && u.ativo && u.id !== exceto).length;

function validarDados(d: { nome?: unknown; email?: unknown; perfil?: unknown; modulos?: unknown }, atual?: Usuario) {
  const nome = String(d.nome ?? atual?.nome ?? '').trim().slice(0, 80);
  if (!nome) throw new UsuarioError('nome', 'Informe o nome.');
  const email = d.email !== undefined ? normalizaEmail(d.email) : atual!.email;
  if (!EMAIL.test(email)) throw new UsuarioError('email', 'Informe um e-mail válido.');
  const outro = acharPorEmail(email);
  if (outro && outro.id !== atual?.id) throw new UsuarioError('duplicado', 'Já existe um usuário com este e-mail.');
  const perfil = (d.perfil ?? atual?.perfil) as Perfil;
  if (!(perfil in PERFIS)) throw new UsuarioError('perfil', 'Escolha o perfil.');
  const bruto = Array.isArray(d.modulos) ? d.modulos : atual?.modulos ?? [];
  const modulos = MODULOS.filter((m) => bruto.includes(m));
  if (perfil !== 'admin' && !modulos.length) throw new UsuarioError('modulos', 'Libere pelo menos um módulo (CRM ou Agente receptivo).');
  return { nome, email, perfil, modulos: perfil === 'admin' ? [...MODULOS] : modulos };
}

export function criar(d: { nome?: unknown; email?: unknown; perfil?: unknown; modulos?: unknown; senha?: unknown }, por?: string) {
  const dados = validarDados(d);
  const temporaria = d.senha === undefined || d.senha === '' ? senhaTemporaria() : undefined;
  const senha = temporaria ?? validarSenha(d.senha);
  const u: Usuario = { id: randomUUID(), ...dados, ativo: true, senha: hashSenha(senha), sessaoVersao: 1, criadoEm: new Date().toISOString(), criadoPor: por };
  lista().push(u); gravar();
  return { usuario: publico(u), senhaTemporaria: temporaria };
}

export function atualizar(id: string, d: { nome?: unknown; email?: unknown; perfil?: unknown; modulos?: unknown; ativo?: unknown }) {
  const u = achar(id); if (!u) throw new UsuarioError('inexistente', 'Usuário não encontrado.');
  const dados = validarDados(d, u);
  const ativo = d.ativo === undefined ? u.ativo : Boolean(d.ativo);
  const eraAdmin = u.perfil === 'admin' && u.ativo;
  const seraAdmin = dados.perfil === 'admin' && ativo;
  if (eraAdmin && !seraAdmin && adminsAtivos(u.id) === 0) throw new UsuarioError('ultimo-admin', 'Este é o único administrador ativo. Crie ou promova outro antes.');
  // mudar perfil, módulos, e-mail ou desativar derruba as sessões abertas dessa pessoa
  if (dados.perfil !== u.perfil || dados.email !== u.email || !ativo || JSON.stringify(dados.modulos) !== JSON.stringify(u.modulos)) u.sessaoVersao++;
  Object.assign(u, dados, { ativo });
  gravar();
  return publico(u);
}

export function redefinirSenha(id: string, senha?: unknown) {
  const u = achar(id); if (!u) throw new UsuarioError('inexistente', 'Usuário não encontrado.');
  const temporaria = senha === undefined || senha === '' ? senhaTemporaria() : undefined;
  u.senha = hashSenha(temporaria ?? validarSenha(senha));
  u.sessaoVersao++; gravar();
  return { senhaTemporaria: temporaria };
}

export function alterarMinhaSenha(id: string, atual: unknown, nova: unknown) {
  const u = achar(id); if (!u) throw new UsuarioError('inexistente', 'Usuário não encontrado.');
  if (!confereSenha(String(atual ?? ''), u.senha)) throw new UsuarioError('senha-atual', 'A senha atual não confere.');
  u.senha = hashSenha(validarSenha(nova)); u.sessaoVersao++; gravar();
  return u.sessaoVersao;
}

export function remover(id: string, quem?: string) {
  const u = achar(id); if (!u) throw new UsuarioError('inexistente', 'Usuário não encontrado.');
  if (u.id === quem) throw new UsuarioError('proprio', 'Você não pode excluir o seu próprio usuário.');
  if (u.perfil === 'admin' && u.ativo && adminsAtivos(u.id) === 0) throw new UsuarioError('ultimo-admin', 'Este é o único administrador ativo.');
  estado.usuarios = lista().filter((x) => x.id !== id); gravar();
}

export function registrarAcesso(id: string) {
  const u = achar(id); if (!u) return;
  const agora = Date.now();
  if (!u.ultimoAcesso || agora - Date.parse(u.ultimoAcesso) > 5 * 60_000) { u.ultimoAcesso = new Date(agora).toISOString(); gravar(); }
}

/** Confere e-mail e senha. Faz o cálculo do hash mesmo para e-mail desconhecido (não revela quais e-mails existem pelo tempo). */
/** Por que um login foi recusado (só para o log do servidor; a tela continua dizendo apenas "e-mail ou senha incorretos"). */
export function motivoDaRecusa(email: string, senha: string): 'email_inexistente' | 'senha_errada' | 'conta_desativada' {
  const u = acharPorEmail(email);
  if (!u) return 'email_inexistente';
  if (!confereSenha(senha, u.senha)) return 'senha_errada';
  return u.ativo ? 'senha_errada' : 'conta_desativada';
}
export const totalDeContas = () => lista().length;

export function autenticarConta(email: string, senha: string): Usuario | null {
  const u = acharPorEmail(email);
  const ok = confereSenha(senha, u?.senha ?? 'scrypt$00$00');
  if (!u || !ok || !u.ativo) return null;
  return u;
}
