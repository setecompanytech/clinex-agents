import { randomUUID } from 'node:crypto';
import type { Estado } from './banco.js';
import { aplicar, automatizar, criarLead, hojeDe, proximoPasso, soDigitos, somaDias, type Lead } from './motor.js';
import { MENSAGENS } from './modelo.js';
import { anotarNoHistorico, avaliarLead, checagens, configAuto } from './ia-disparo.js';
import { paraE164Brasil } from '../integrations/inovstar.js';
import { env } from '../lib/env.js';
import { DisparoError, chaveFone, disparoAtivo, enviarModelo } from './whatsapp.js';

/**
 * Laboratório do "Modo Simulação" do IA Manager: leads FICTÍCIOS que o gerente cria para ver a IA trabalhando de ponta a ponta
 * (decide, escolhe a mensagem, preenche as variáveis e "envia"), em qualquer dia e hora, sem tocar em paciente real.
 *
 * Os leads de teste ficam guardados à parte (estado.disparoAuto.simulacao), NUNCA em estado.leads: não aparecem em Hoje, Funil,
 * Análises, Time nem em nenhum número do CRM, e nada sai para o WhatsApp. São avaliados pelas MESMAS checagens da IA de verdade.
 */

export const LIMITE_LAB = 12;
/** Lead de teste: guarda se o número foi informado (pode receber de verdade) e a última mensagem que a IA "enviou" na simulação. */
/** Uma linha do log do lead de teste: o que a IA decidiu (simulação) ou o que aconteceu num envio de verdade (aceito ou recusado e por quê). */
export type LogLab = { quando: string; simulado: string; tipo: 'simulacao' | 'envio'; ok: boolean; titulo: string; detalhe: string; dica?: string; msg?: number; modelo?: string; mensagemId?: string };
type LeadLab = Lead & { log?: LogLab[]; enviosOk?: number; telefoneInformado?: boolean; ultima?: { modelo: string; parametros: string[]; msg: number; passo: string } };
/** Só estes números recebem mensagem de verdade a partir do laboratório: os de teste (DISPARO_NUMEROS) e os de SIMULACAO_NUMEROS. DISPARO_LIBERADO NÃO vale aqui: paciente real nunca recebe pela simulação. */
export type NumeroTeste = { numero: string; quem: string; quando: string };
export const LIMITE_NUMEROS = 10;
const numerosDoAmbiente = () => [...(process.env.DISPARO_NUMEROS ?? '').split(','), ...(process.env.SIMULACAO_NUMEROS ?? '').split(',')].map((n) => n.trim()).filter(Boolean);
export const numerosDaTela = (estado: Estado): NumeroTeste[] => estado.disparoAuto?.simulacao?.numeros ?? [];
export const numeroDeTeste = (estado: Estado, tel: string) => [...numerosDoAmbiente(), ...numerosDaTela(estado).map((n) => n.numero)].some((n) => chaveFone(n) === chaveFone(tel));
export type TipoLab = 'orcamento' | 'noshow';

const erroLab = (m: string, status = 400) => new DisparoError('lab', m, status);
const anotar = (l: Lead, agoraSim: Date, e: Omit<LogLab, 'quando' | 'simulado'>) => { const x = l as LeadLab; x.log = [{ quando: new Date().toISOString(), simulado: agoraSim.toISOString(), ...e }, ...(x.log ?? [])].slice(0, 40); };
/** O que a pessoa pode fazer a respeito de cada recusa. */
function dicaDoErro(e: DisparoError): string | undefined {
  if (e.codigo === 'desligado') return 'O envio de WhatsApp está desligado neste ambiente. No Vercel, defina DISPARO_WHATSAPP=true e faça um redeploy.';
  if (e.codigo === 'config') return 'Falta o token da Inovstar (INOVSTAR_TOKEN) neste ambiente.';
  if (e.codigo === 'envio') return 'A Inovstar recusou o pedido. Causas comuns: modelo (template) não aprovado ou com variáveis diferentes das cadastradas, número sem WhatsApp, ou canal da Inovstar desconectado. O motivo dela está acima.';
  if (e.codigo === 'telefone') return 'Confira o número: DDD + número com 9 dígitos.';
  if (e.codigo === 'lab' && e.status === 403) return 'Clique em "Liberar este número" (no cartão do lead ou na lista de números liberados). Não precisa mexer no Vercel.';
  if (e.codigo === 'lab') return 'Passos: 1) informe o número ao criar o lead; 2) rode a IA; 3) envie.';
  return undefined;
}
const leadsDe = (estado: Estado): Lead[] => estado.disparoAuto?.simulacao?.leads ?? [];
const guardar = (estado: Estado, leads: Lead[]) => { estado.disparoAuto = { ...(estado.disparoAuto ?? { modo: 'desligado' }), simulacao: { ...(estado.disparoAuto?.simulacao ?? {}), leads } }; };

/** O texto da mensagem como o paciente receberia: o corpo do guia com os [campos] trocados pelos parâmetros, na ordem. */
export function textoDaMensagem(msg: number, parametros: string[]): { msg: number; texto: string; botoes: string[] } | null {
  const m = MENSAGENS.find((x) => x.n === msg);
  if (!m) return null;
  let i = 0;
  return { msg: m.n, texto: m.corpo.replace(/\[[^\]]*\]/g, (c) => parametros[i++] ?? c), botoes: m.botoes ?? [] };
}

/** "2026-11-13T08:30" (horário de Belém) vira o instante. Sem valor válido, vale agora. */
export function instanteDoRelogio(v: unknown, agora = new Date()): Date {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return agora;
  const d = new Date(`${v}:00-03:00`);
  return Number.isNaN(d.getTime()) ? agora : d;
}

export type EntradaLab = { liberar?: unknown; telefone?: unknown; nome?: unknown; valor?: unknown; unidade?: unknown; exame?: unknown; atendente?: unknown; tipo?: unknown; diasAtras?: unknown };

/** Libera um número para receber de verdade as mensagens de teste do laboratório (sem mexer no Vercel). Fica no histórico da IA: quem liberou e quando. */
export function liberarNumeroTeste(estado: Estado, numero: unknown, quem: string, agora: Date): NumeroTeste {
  const n = soDigitos(String(numero ?? '').slice(0, 30));
  if (!n || !paraE164Brasil(n)) throw erroLab('Número inválido: use DDD + número, por exemplo (91) 98888-7777.');
  if (numeroDeTeste(estado, n)) throw erroLab('Este número já está liberado para teste.', 409);
  if (numerosDaTela(estado).length >= LIMITE_NUMEROS) throw erroLab(`Você já liberou ${LIMITE_NUMEROS} números. Remova algum para liberar outro.`, 409);
  const novo = { numero: n, quem, quando: agora.toISOString() };
  estado.disparoAuto = { ...(estado.disparoAuto ?? { modo: 'desligado' }), simulacao: { leads: leadsDe(estado), numeros: [...numerosDaTela(estado), novo] } };
  anotarNoHistorico(estado, quem, `Número de teste liberado: final ${n.slice(-4)}`, agora);
  return novo;
}
export function bloquearNumeroTeste(estado: Estado, numero: unknown, quem: string, agora: Date): boolean {
  const k = chaveFone(String(numero ?? '')), todos = numerosDaTela(estado), resto = todos.filter((x) => chaveFone(x.numero) !== k);
  if (resto.length === todos.length) return false;
  estado.disparoAuto = { ...(estado.disparoAuto ?? { modo: 'desligado' }), simulacao: { leads: leadsDe(estado), numeros: resto } };
  anotarNoHistorico(estado, quem, `Número de teste removido: final ${String(numero).slice(-4)}`, agora);
  return true;
}

export function criarLeadLab(estado: Estado, e: EntradaLab, agora: Date, quem = 'painel'): Lead {
  const atuais = leadsDe(estado);
  if (atuais.length >= LIMITE_LAB) throw erroLab(`O laboratório comporta ${LIMITE_LAB} leads de teste. Remova algum para criar outro.`, 409);
  const nome = String(e.nome ?? '').trim();
  if (!nome) throw erroLab('Dê um nome ao lead de teste.');
  if (nome.length > 60) throw erroLab('O nome do lead de teste pode ter no máximo 60 letras.');
  const valor = e.valor === undefined || e.valor === null || e.valor === '' ? 0 : Number(e.valor);
  if (!Number.isFinite(valor) || valor < 0 || valor > 1_000_000) throw erroLab('Valor do orçamento inválido.');
  const diasAtras = e.diasAtras === undefined || e.diasAtras === '' ? 1 : Number(e.diasAtras);
  if (!Number.isInteger(diasAtras) || diasAtras < 0 || diasAtras > 30) throw erroLab('A idade do orçamento vai de 0 a 30 dias.');
  const tipo: TipoLab = e.tipo === 'noshow' ? 'noshow' : 'orcamento';
  const hoje = hojeDe(agora);
  // sem número: fictício (formato válido, nunca usado). Com número: é o que a pessoa digitou (o seu, para receber a mensagem de verdade)
  const informado = soDigitos(String(e.telefone ?? '').slice(0, 30));
  if (informado && !paraE164Brasil(informado)) throw erroLab('Telefone inválido: use DDD + número, por exemplo (91) 98888-7777.');
  const telefone = informado || `9199${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`;
  const lead = criarLead({ nome, telefone, valor, exame: String(e.exame ?? '').trim().slice(0, 60) || 'Ultrassom', unidade: String(e.unidade ?? '').trim().slice(0, 60) || undefined, atendente: String(e.atendente ?? '').trim().slice(0, 40) || undefined, origem: 'Simulação', d0: somaDias(hoje, -diasAtras) }, agora);
  lead.id = `sim-${randomUUID().slice(0, 6)}`; if (informado) (lead as LeadLab).telefoneInformado = true;
  if (tipo === 'noshow') {
    lead.status = 'negociacao'; lead.noShow = true; lead.pulados = ['orcamento']; lead.statusDesde = hoje; lead.faseId = `negociacao:${hoje}:1`;
  }
  guardar(estado, [...atuais, lead]);
  if (informado && e.liberar === true && !numeroDeTeste(estado, informado)) liberarNumeroTeste(estado, informado, quem, agora);
  return lead;
}

export function removerLeadLab(estado: Estado, id: string): boolean {
  const atuais = leadsDe(estado);
  if (!atuais.some((l) => l.id === id)) return false;
  guardar(estado, atuais.filter((l) => l.id !== id));
  return true;
}
export const limparLab = (estado: Estado) => guardar(estado, []);

/** Manda DE VERDADE a última mensagem simulada ao número que a pessoa informou (pode repetir quantas vezes quiser). Só para números de teste. Tudo, inclusive recusas, vai para o log do lead. */
export async function enviarLeadLab(estado: Estado, id: string, agora: Date, quem: string): Promise<{ mensagemId?: string }> {
  const l = leadsDe(estado).find((x) => x.id === id) as LeadLab | undefined;
  if (!l) throw erroLab('Lead de teste não encontrado.', 404);
  try {
    if (!l.telefoneInformado) throw erroLab('Este lead de teste não tem número. Crie um lead com o seu número para receber a mensagem de verdade.');
    if (!l.ultima) throw erroLab('Rode a IA antes: ela decide qual mensagem sai, e só então dá para enviar essa mensagem de verdade.');
    if (!numeroDeTeste(estado, l.telefone)) throw erroLab('Por segurança, só envio de verdade para números de teste. Libere este número no laboratório (botão "Liberar este número").', 403);
    const u = l.ultima, r = await enviarModelo(estado, l, { modelo: u.modelo, parametros: u.parametros, passo: u.passo, msg: u.msg, atendente: `Simulação (${quem})`, ignorarLista: true, teste: true }, agora);
    l.enviosOk = (l.enviosOk ?? 0) + 1;
    anotar(l, agora, { tipo: 'envio', ok: true, titulo: `Inovstar aceitou o envio (${l.enviosOk}º)`, detalhe: `Msg ${u.msg} · modelo ${u.modelo} · para ${l.telefone}${r.mensagemId ? ` · id ${r.mensagemId}` : ''} · pedido por ${quem}`, dica: 'Aceito quer dizer que a Inovstar recebeu o pedido. A entrega no WhatsApp não é acompanhada aqui: se não chegar, confira se o número tem WhatsApp e o status desta mensagem no painel da Inovstar (use o id acima).', msg: u.msg, modelo: u.modelo, mensagemId: r.mensagemId });
    guardar(estado, leadsDe(estado));
    return { mensagemId: r.mensagemId };
  } catch (e) {
    if (e instanceof DisparoError) {
      anotar(l, agora, { tipo: 'envio', ok: false, titulo: 'O envio não saiu', detalhe: e.message, dica: dicaDoErro(e), msg: l.ultima?.msg, modelo: l.ultima?.modelo });
      guardar(estado, leadsDe(estado));
    }
    throw e;
  }
}

export type ResultadoLab = { leadId: string; nome: string; passo: string | null; msg?: number; resultado: 'enviaria' | 'espera' | 'pulado' | 'nada'; motivo: string; texto?: string };

/** Uma rodada simulada no instante escolhido: avalia cada lead de teste e, onde a IA enviaria, registra o "envio" no próprio lead de teste. */
export function rodarLab(estado: Estado, agora: Date): { quando: string; resultados: ResultadoLab[] } {
  const cfg = configAuto(estado), resultados: ResultadoLab[] = [];
  let feitos = 0;
  for (const l of leadsDe(estado)) {
    automatizar(l, agora); // as regras do guia movem o lead com o passar dos dias (no CRM de verdade isso roda sozinho)
    const av = avaliarLead(estado, l, agora, { ignorarLista: true }, cfg);
    if (!av) {
      const px = proximoPasso(l, hojeDe(agora)), motivo = px ? `Nada para a IA agora. Próximo passo: ${px.passo.rotulo}, ${px.situacao === 'futura' ? `vence em ${px.vence.split('-').reverse().join('/')}` : px.passo.msg ? 'vence hoje' : 'passo manual'}` : 'Sem passo pendente agora: as regras do guia movem o lead com o passar dos dias';
      resultados.push({ leadId: l.id, nome: l.nome, passo: px?.passo.rotulo ?? null, resultado: 'nada', motivo });
      anotar(l, agora, { tipo: 'simulacao', ok: false, titulo: 'Rodada: nada para a IA neste horário', detalhe: motivo });
      continue;
    }
    const base = { leadId: l.id, nome: l.nome, passo: av.passo.rotulo, msg: av.passo.msg };
    if (av.tipo !== 'pronto') { resultados.push({ ...base, resultado: av.tipo, motivo: av.motivo }); anotar(l, agora, { tipo: 'simulacao', ok: false, titulo: av.tipo === 'espera' ? 'Rodada: a IA aguardaria' : 'Rodada: a IA não enviaria', detalhe: av.motivo, msg: av.passo.msg }); continue; }
    if (feitos >= cfg.limites.porRodada) { resultados.push({ ...base, resultado: 'espera', motivo: `Fica para a próxima rodada (máximo de ${cfg.limites.porRodada} por rodada)` }); continue; }
    const m = textoDaMensagem(av.msg, av.parametros);
    const texto = `Simulação · modelo ${av.modelo}\n${m?.texto ?? ''}`;
    try { aplicar(l, { tipo: 'contato', canal: 'whatsapp', naoFoiRecepcao: true, passo: av.passo.id, msg: av.msg, texto, atendente: 'IA', auto: true }, agora); }
    catch (e) { resultados.push({ ...base, resultado: 'pulado', motivo: (e as Error).message }); anotar(l, agora, { tipo: 'simulacao', ok: false, titulo: 'Rodada: a IA não conseguiu registrar o envio', detalhe: (e as Error).message, msg: av.msg }); continue; }
    (l as LeadLab).ultima = { modelo: av.modelo, parametros: av.parametros, msg: av.msg, passo: av.passo.id };
    automatizar(l, agora); // como no envio de verdade
    feitos++;
    anotar(l, agora, { tipo: 'simulacao', ok: true, titulo: 'Rodada: a IA enviaria (simulado, nada saiu)', detalhe: `Msg ${av.msg} · modelo ${av.modelo}. Variáveis: ${av.parametros.join(' | ')}`, msg: av.msg, modelo: av.modelo });
    resultados.push({ ...base, resultado: 'enviaria', motivo: 'Todas as condições atendidas', texto: m?.texto });
  }
  guardar(estado, leadsDe(estado)); // força a gravação do que mudou nos leads de teste
  return { quando: agora.toISOString(), resultados };
}

/** O laboratório como a tela mostra, no instante escolhido. */
export function resumoLab(estado: Estado, agora: Date) {
  const cfg = configAuto(estado), hoje = hojeDe(agora);
  return {
    quando: agora.toISOString(), limite: LIMITE_LAB,
    numeros: [...numerosDoAmbiente().map((n) => ({ numero: n, quem: 'Vercel (ambiente)', quando: '', origem: 'ambiente' })), ...numerosDaTela(estado).map((n) => ({ ...n, origem: 'tela' }))],
    leads: leadsDe(estado).map((l) => {
      const px = proximoPasso(l, hoje), av = avaliarLead(estado, l, agora, { ignorarLista: true }, cfg), r = checagens(estado, l, agora, cfg, { ignorarLista: true });
      return {
        log: (l as LeadLab).log ?? [], enviosOk: (l as LeadLab).enviosOk ?? 0, diagnostico: { whatsappLigado: disparoAtivo(), token: Boolean(env.inovstarToken), numeroInformado: !!(l as LeadLab).telefoneInformado, numeroLiberado: !!(l as LeadLab).telefoneInformado && numeroDeTeste(estado, l.telefone) },
        id: l.id, nome: l.nome, telefone: l.telefone, telefoneInformado: !!(l as LeadLab).telefoneInformado, podeEnviar: !!(l as LeadLab).ultima, ultimaMsg: (l as LeadLab).ultima?.msg ?? null, numeroLiberado: !!(l as LeadLab).telefoneInformado && numeroDeTeste(estado, l.telefone), valor: l.valor, unidade: l.unidade ?? '', exame: l.exame, atendente: l.atendente ?? '', tipo: l.noShow ? 'noshow' : 'orcamento', d0: l.d0, status: l.status,
        proximo: px ? { passo: px.passo.rotulo, msg: px.passo.msg ?? null, vence: px.vence, situacao: px.situacao } : null,
        decisao: av ? { tipo: av.tipo, motivo: av.tipo === 'pronto' ? 'Todas as condições atendidas' : av.motivo } : null,
        checks: r.checks,
        mensagens: l.eventos.filter((e) => e.tipo === 'contato' && e.auto === true).map((e) => ({ quando: e.quando, msg: e.msg ?? null, passo: e.passo ?? '', texto: e.texto.split('\n').slice(1).join('\n') })),
      };
    }),
  };
}
