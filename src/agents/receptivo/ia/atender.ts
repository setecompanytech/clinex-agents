/**
 * Amanda IA: monta a conversa (os dois lados), a memória do atendimento e o prompt; o modelo responde usando as ferramentas.
 * Devolve o texto a enviar e o que fazer depois (transferir, encerrar). Quem envia é o agent.ts.
 */
import type { Comprovante } from '../../../lib/comprovante.js';
import type { PedidoLido } from '../../../lib/pedidoMedico.js';
import { env } from '../../../lib/env.js';
import { describe, textoRoteiro, type InovstarMessage } from '../../../integrations/inovstar.js';
import type { Fonte } from '../script/catalog.js';
import { unidadesDaClinica } from '../script/clinilinkFonte.js';
import { pensar, type Msg, type Resposta } from './cerebro.js';
import { evt } from '../../../lib/log.js';
import { DESPEDIDA, memoriaNova, type Contexto, type MemoriaIA } from './ferramentas.js';
import { promptAmanda, type Unidades } from './prompt.js';

export type Atendimento = {
  texto: string;
  handoff?: { motivo: string; urgente?: boolean };
  encerrar: boolean;
  agendou: boolean;
  mem: MemoriaIA;
  resposta: Resposta;
};

let unidadesCache: { em: number; v: Unidades } | undefined;
async function unidades(): Promise<Unidades> {
  if (unidadesCache && Date.now() - unidadesCache.em < 3600_000) return unidadesCache.v;
  const v = env.clinilinkKey ? await unidadesDaClinica().catch(() => []) : [{ nome: 'Guamá' }, { nome: 'Telégrafo' }];
  if (v.length) unidadesCache = { em: Date.now(), v };
  return v;
}

/** A conversa como o modelo lê: paciente = user; Amanda e equipe = assistant (a equipe marcada). Últimas 12 h, até 40 mensagens. */
export function conversaParaModelo(history: InovstarMessage[], titulos: string[], desde = Date.now() - 12 * 3600_000): Msg[] {
  const out: Msg[] = [];
  const recentes = history.filter((m) => +new Date(m.createdAt) > desde && m.type !== 'system' && m.status !== 'whisper' && !m.isWhisper).slice(-40);
  for (const m of recentes) {
    let txt: string | null;
    if (m.direction === 'in') {
      txt = textoRoteiro(m);
      if (txt) txt = txt.replace(/\[\[midia:(image|document):[^\]]+\]\]/g, (_x, tipo) => (tipo === 'image' ? '[o paciente enviou uma imagem]' : '[o paciente enviou um arquivo]'));
      else txt = describe(m);
    } else {
      txt = describe(m);
      if (txt) {
        const daAmanda = titulos.some((t) => txt!.includes(t));
        txt = txt.replace(/^\*[^*\n]+\*\s*/, '');
        if (!daAmanda) txt = `[mensagem da equipe/automação da clínica] ${txt}`;
      }
    }
    if (!txt?.trim()) continue;
    const role: Msg['role'] = m.direction === 'in' ? 'user' : 'assistant';
    const prev = out[out.length - 1];
    if (prev && prev.role === role) prev.content += `\n${txt}`;
    else out.push({ role, content: txt });
  }
  while (out[0]?.role === 'assistant') out.shift();
  return out;
}

/** Acabamento do texto do modelo: valores em negrito (WhatsApp), sem markdown de outros apps, sem linhas em branco demais. */
export function acabamento(t: string): string {
  return t.trim()
    .replace(/\*\*([^*\n]+)\*\*/g, '*$1*') // **x** -> *x*
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/(?<![*\d.,])(R\$ ?\d{1,3}(?:\.\d{3})*,\d{2})(?![*\d])/g, '*$1*')
    .replace(/\n{3,}/g, '\n\n');
}

/** Palavras que podem vir com maiúscula logo depois do nome do médico e não são sobrenome ("Dra. Camila Atende no Guamá"). */
const DEPOIS_DO_NOME = new Set('atende atendem faz fazem no na nos nas em e ou tambem esta tem que para pra pelo pela com hoje amanha segunda terca quarta quinta sexta sabado domingo de da do as os a o tudo ok sim nao pode'.split(' '));
/** O paciente pediu orçamento (regra da clínica: vai para o atendimento principal). Pergunta de preço de UM serviço não conta. */
const PEDIU_ORCAMENTO = /\borcament\w*|\borcar\b|quanto (fica|ficam|sai|saem|da|dao|custa|custam) (esses|estes|os|todos os|meus) exames|valor(es)? (dos|desses|destes|de todos os) exames/;
const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * TRAVA DE VERACIDADE: todo médico (Dr./Dra. Nome) e todo valor em R$ da resposta tem de ter vindo do Clinilink (ferramentas desta resposta
 * ou memória do atendimento). Nome citado pelo próprio paciente também vale (ela pode dizer "não achei a Dra. X").
 * Caso real: depois de a ferramenta devolver Camila, Jean e Emanuelly a R$ 90,00, ela escreveu "Dra. Ana Carolina", "Dr. Bruno" e R$ 120,00.
 */
export function inventados(texto: string, fontes: string[], doPaciente: string): string[] {
  const base = semAcento(fontes.join(' \n '));
  const pac = semAcento(doPaciente);
  const ruins: string[] = [];
  const tem = (alvo: string, txt: string) => new RegExp('(^|[^a-z])' + alvo + '([^a-z]|$)').test(txt);
  for (const m of texto.matchAll(/\b(?:Dra?\.?|Doutora?)[ \t]+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõçü]+)(?:[ \t]+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõçü]+))?/g)) {
    const n1 = semAcento(m[1]); const n2 = m[2] && !DEPOIS_DO_NOME.has(semAcento(m[2])) ? semAcento(m[2]) : '';
    // nome composto ("Ana Carolina"): os dois nomes juntos têm de existir ("Ana Clara" não autoriza "Ana Carolina")
    const ok = n2 ? tem(n1 + ' ' + n2, base) || tem(n1 + ' ' + n2, pac) : tem(n1, base) || tem(n1, pac);
    if (!ok) ruins.push(m[0]);
  }
  for (const m of texto.matchAll(/R\$\s?(\d{1,3}(?:\.\d{3})*,\d{2})/g)) {
    const v = m[1];
    const num = Number(v.replace(/\./g, '').replace(',', '.'));
    const comoTexto = new RegExp('r\\$\\s?' + v.replace(/\./g, '\\.'));
    const comoNumero = new RegExp('[:\\[,]\\s*' + String(num).replace('.', '\\.') + '(?![\\d.])');
    if (num > 0 && !comoTexto.test(base) && !comoNumero.test(base)) ruins.push(m[0]);
  }
  // horários: "a partir das 8h30", "às 14h" -> a hora tem de estar num horário que o Clinilink devolveu (ou no horário de funcionamento da clínica)
  const horaNaBase = (h: number, mi: string) => {
    const hh = String(h).padStart(2, '0');
    return base.includes(hh + ':' + mi) || base.includes('"' + h + 'h' + (mi === '00' ? '' : mi) + '"') || tem(h + 'h' + (mi === '00' ? '' : mi), base);
  };
  for (const m of texto.matchAll(/\b(\d{1,2})h(\d{2})?\b/g)) {
    const h = Number(m[1]); const mi = m[2] ?? '00';
    if (h > 23) continue;
    if (!horaNaBase(h, mi) && !tem(m[0].toLowerCase(), pac)) ruins.push(m[0]);
  }
  // datas: "12 de novembro" -> o dia tem de estar num horário oferecido (ou ter sido dito pelo paciente)
  const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  for (const m of semAcento(texto).matchAll(/\b(\d{1,2}) de (janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/g)) {
    const mes = String(MESES.indexOf(m[2]) + 1).padStart(2, '0'); const dia = m[1].padStart(2, '0');
    if (!base.includes('-' + mes + '-' + dia) && !base.includes(m[0]) && !pac.includes(m[0]) && !tem(dia + '/' + mes, pac)) ruins.push(m[0]);
  }
  // unidade: "unidade X" / "no X" com nome que não é unidade da clínica
  for (const m of texto.matchAll(/\bunidades?\s+(?:do |da |de )?\*?([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõçü]+)/g)) {
    if (!tem(semAcento(m[1]), base)) ruins.push(m[0]);
  }
  // médico citado sem título: "com a Camila", "com o Jean"
  for (const m of texto.matchAll(/\bcom (?:a|o) ([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõçü]+)/g)) {
    const n = semAcento(m[1]);
    if (/^(dra?|doutora?|clinex|equipe|unidade)$/.test(n)) continue;
    if (!tem(n, base) && !tem(n, pac)) ruins.push(m[0]);
  }
  return [...new Set(ruins)];
}

export async function atenderComIA(p: {
  history: InovstarMessage[];
  titulos: string[];
  telefone: string;
  nomeContato: string;
  fonte: Fonte;
  memoria: MemoriaIA | null;
  lerComprovante?: () => Promise<Comprovante | null>;
  lerPedidos?: () => Promise<(PedidoLido | null)[]>;
  agora?: Date;
}): Promise<Atendimento | null> {
  const agora = p.agora ?? new Date();
  const conversa = conversaParaModelo(p.history, p.titulos);
  while (conversa.length && conversa[conversa.length - 1].role === 'assistant') conversa.pop(); // a mensagem nova chegou antes da última resposta
  if (!conversa.length) return null;
  const mem = p.memoria?.v === 1 ? p.memoria : memoriaNova();
  const primeiraResposta = !p.history.some((m) => m.direction === 'out' && p.titulos.some((t) => m.text?.includes(t)));
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: env.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
  const listaUnidades = await unidades();
  const telWa = p.telefone.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  const system = promptAmanda({ agora, nomeContato: p.nomeContato, telefone: telWa.length === 11 ? `(${telWa.slice(0, 2)}) ${telWa.slice(2, 7)}-${telWa.slice(7)}` : telWa, primeiraResposta, mem, unidades: listaUnidades, hoje });
  const c: Contexto = { fonte: p.fonte, mem, telefone: p.telefone, agora, lerComprovante: p.lerComprovante, lerPedidos: p.lerPedidos, ultimaDoPaciente: semAcento(conversa.filter((m) => m.role === 'user').slice(-1)[0]?.content ?? ''), pedidoOrcamento: PEDIU_ORCAMENTO.test(conversa.filter((m) => m.role === 'user').slice(-4).map((m) => semAcento(m.content)).join(' \n ')), saida: { confirmacoes: [], usadas: [] } };
  let resposta = await pensar(system, conversa, c);
  // conferência: médico ou valor que não veio do Clinilink -> refaz UMA vez, obrigando a consultar; se insistir, não envia o inventado
  const doPaciente = conversa.filter((m) => m.role === 'user').map((m) => m.content).join('\n');
  const fontesDe = () => [...(c.saida.dados ?? []), JSON.stringify(listaUnidades), env.clinicHorario, env.clinicName, 'Clinex', JSON.stringify({ servicos: mem.servicos, slots: mem.slots, orcamento: mem.orcamento, combos: mem.combosOferecidos, paciente: mem.paciente })];
  const agendouSemAgendar = (t: string) => !c.saida.confirmacoes.length && !mem.agendados.length && /\b(ficou|esta|está|foi|ja esta|já está) (agendad|marcad|confirmad|reservad)\w*|\bagendamento (feito|confirmado|realizado)\b/i.test(t);
  // "encontrei o cadastro" sem ter procurado (caso real: disse que achou a Joana sem chamar buscar_paciente)
  const cadastroInventado = (t: string) => /(?<!n[aã]o )\b(encontrei|achei|localizei)\b.{0,20}\bcadastro\b/i.test(t) && !mem.paciente?.id && !(c.saida.dados ?? []).some((d) => d.includes('"encontrado":true'));
  const temCombo = Object.values(mem.servicos).some((x) => x.pacote || x.combo) || Boolean(mem.combosOferecidos?.length) || Boolean(Object.keys(mem.etapas ?? {}).length) || (c.saida.dados ?? []).some((d) => /combo/i.test(d)) || /\bcombo\b/i.test(doPaciente);
  const regras = (t: string) => [...(/\bcombo\b/i.test(t) && !temCombo ? ['"combo" sem combo nesta conversa (não cite combo que não existe no atendimento)'] : []), ...(/\b(ja |já )?te retorno\b|\bvou te retornar\b|\bte dou um retorno\b/i.test(t) ? ['"te retorno" (você não retorna depois: se a equipe vai continuar, diga que a equipe vai mandar e transfira)'] : []),...(agendouSemAgendar(t) ? ['"agendado" sem ter agendado (o agendamento só existe depois da ferramenta agendar dar certo; diga que vai reservar e peça o que falta)'] : []), ...(cadastroInventado(t) ? ['"encontrei o cadastro" sem ter consultado (chame buscar_paciente antes de dizer que achou)'] : [])];
  let ruins = c.saida.confirmacoes.length ? [] : [...inventados(resposta.texto, fontesDe(), doPaciente), ...regras(resposta.texto)];
  if (ruins.length) {
    evt('erro', { mensagem: 'IA: resposta com dado que não veio do Clinilink (refazendo)', itens: ruins, rascunho: resposta.texto.slice(0, 400) });
    const correcao: Msg[] = [...conversa, { role: 'assistant', content: resposta.texto }, { role: 'user', content: '[CHECAGEM INTERNA DO SISTEMA, não é o paciente] Sua última resposta citou ' + ruins.join(', ') + ', que NÃO veio das ferramentas. Isso é proibido. Consulte agora as ferramentas (buscar_servico, servico_com_profissional, ver_horarios, buscar_paciente, orcar_exames) e reescreva a resposta ao paciente usando SOMENTE os profissionais e valores que elas devolverem. Não mencione esta checagem.' }];
    resposta = await pensar(system, correcao, c);
    ruins = [...inventados(resposta.texto, fontesDe(), doPaciente), ...regras(resposta.texto)];
    if (ruins.length) {
      evt('erro', { mensagem: 'IA: insistiu em dado que não veio do Clinilink; resposta bloqueada', itens: ruins, rascunho: resposta.texto.slice(0, 400) });
      resposta = { ...resposta, texto: 'Deixa eu confirmar essa informação certinho no sistema. Vou chamar alguém da equipe pra te passar os dados corretos, só um instante.' };
      c.saida.handoff = { motivo: 'Amanda IA bloqueada pela trava de veracidade (citou profissional ou valor que não veio do Clinilink: ' + ruins.join(', ') + '). Conferir o pedido do paciente e responder.' };
    }
  }
  let texto = acabamento(resposta.texto);
  // agendou: a confirmação oficial já traz tudo; do texto do modelo só fica o que for do pix (chave/comprovante), nunca o resumo repetido
  // depois de agendar, a confirmação oficial já traz tudo (inclusive a próxima etapa do combo); do texto do modelo só fica o do pix
  if (c.saida.confirmacoes.length) texto = [...c.saida.confirmacoes, /\bpix\b/i.test(texto) ? texto : ''].filter(Boolean).join('\n\n');
  if (!c.saida.encerrar && !c.saida.handoff && !c.saida.confirmacoes.length && DESPEDIDA.test(c.ultimaDoPaciente ?? '') && /\b(qualquer coisa|estou a disposicao|estou à disposição|e so chamar|é só chamar|ate (mais|logo)|até (mais|logo)|boa sorte|tenha um (otimo|ótimo|bom))\b/i.test(texto) && !/\?\s*$/.test(texto)) c.saida.encerrar = true;
  // foto IMPRESSA lida e valores informados: a conversa vai para a equipe montar o orçamento (regra da clínica)
  if (mem.fotoOrcamento && !c.saida.handoff && /R\$\s?\d/.test(texto)) {
    mem.fotoOrcamento = false;
    c.saida.handoff = { motivo: `Orçamento a partir de foto (texto impresso). A Amanda já informou os valores da tabela; montar o orçamento. Resumo enviado ao paciente: ${texto.replace(/\s+/g, ' ').slice(0, 700)}` };
    // a conversa vai para a equipe: tira a pergunta final ("quer agendar a coleta?") e a frase solta sobre a equipe, e fecha com o aviso certo
    texto = texto.split(/\n{2,}/).filter((p) => !/\?\s*$/.test(p.trim()) && !/\bequipe\b/i.test(p)).join('\n\n').trim();
    texto += '\n\nAgora a nossa equipe vai montar o seu orçamento e já te chama por aqui.';
  }
  // 2 tentativas sem entender/ler e a terceira igual: passa para a equipe (caso real: 4 vezes "não consegui ler a foto")
  const NAO_ENTENDI = /n[aã]o consegui (ler|identificar|entender|ouvir)/i;
  if (!c.saida.handoff && NAO_ENTENDI.test(texto) && conversa.filter((m) => m.role === 'assistant').slice(-2).filter((m) => NAO_ENTENDI.test(m.content)).length >= 2) {
    texto = 'Pra não te fazer perder tempo, vou passar pra alguém da equipe te ajudar com isso. Só um instante.';
    c.saida.handoff = { motivo: 'A Amanda não conseguiu entender o pedido depois de 2 tentativas (foto/áudio/mensagem). Ver a conversa e atender.' };
  }
  if (!texto && c.saida.handoff) texto = 'Vou passar pra alguém da equipe te ajudar com isso. Só um instante.';
  if (!texto) return null;
  return { texto, handoff: c.saida.handoff, encerrar: Boolean(c.saida.encerrar), agendou: c.saida.confirmacoes.length > 0, mem, resposta };
}
