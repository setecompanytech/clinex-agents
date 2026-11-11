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
import { memoriaNova, type Contexto, type MemoriaIA } from './ferramentas.js';
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
  const system = promptAmanda({ agora, nomeContato: p.nomeContato, primeiraResposta, mem, unidades: await unidades(), hoje });
  const c: Contexto = { fonte: p.fonte, mem, telefone: p.telefone, agora, lerComprovante: p.lerComprovante, lerPedidos: p.lerPedidos, saida: { confirmacoes: [], usadas: [] } };
  let resposta = await pensar(system, conversa, c);
  // conferência: médico ou valor que não veio do Clinilink -> refaz UMA vez, obrigando a consultar; se insistir, não envia o inventado
  const doPaciente = conversa.filter((m) => m.role === 'user').map((m) => m.content).join('\n');
  const fontesDe = () => [...(c.saida.dados ?? []), JSON.stringify({ servicos: mem.servicos, slots: mem.slots, orcamento: mem.orcamento, combos: mem.combosOferecidos, paciente: mem.paciente })];
  let ruins = c.saida.confirmacoes.length ? [] : inventados(resposta.texto, fontesDe(), doPaciente);
  if (ruins.length) {
    evt('erro', { mensagem: 'IA: resposta com dado que não veio do Clinilink (refazendo)', itens: ruins, rascunho: resposta.texto.slice(0, 400) });
    const correcao: Msg[] = [...conversa, { role: 'assistant', content: resposta.texto }, { role: 'user', content: '[CHECAGEM INTERNA DO SISTEMA, não é o paciente] Sua última resposta citou ' + ruins.join(', ') + ', que NÃO veio das ferramentas. Isso é proibido. Consulte agora as ferramentas (buscar_servico, servico_com_profissional, ver_horarios, orcar_exames) e reescreva a resposta ao paciente usando SOMENTE os profissionais e valores que elas devolverem. Não mencione esta checagem.' }];
    resposta = await pensar(system, correcao, c);
    ruins = inventados(resposta.texto, fontesDe(), doPaciente);
    if (ruins.length) {
      evt('erro', { mensagem: 'IA: insistiu em dado que não veio do Clinilink; resposta bloqueada', itens: ruins, rascunho: resposta.texto.slice(0, 400) });
      resposta = { ...resposta, texto: 'Deixa eu confirmar essa informação certinho no sistema. Vou chamar alguém da equipe pra te passar os dados corretos, só um instante.' };
      c.saida.handoff = { motivo: 'Amanda IA bloqueada pela trava de veracidade (citou profissional ou valor que não veio do Clinilink: ' + ruins.join(', ') + '). Conferir o pedido do paciente e responder.' };
    }
  }
  let texto = acabamento(resposta.texto);
  // agendou: a confirmação oficial já traz tudo; do texto do modelo só fica o que for do pix (chave/comprovante), nunca o resumo repetido
  if (c.saida.confirmacoes.length) texto = [...c.saida.confirmacoes, /\bpix\b/i.test(texto) ? texto : ''].filter(Boolean).join('\n\n');
  if (!texto && c.saida.handoff) texto = 'Vou passar pra alguém da equipe te ajudar com isso. Só um instante.';
  if (!texto) return null;
  return { texto, handoff: c.saida.handoff, encerrar: Boolean(c.saida.encerrar), agendou: c.saida.confirmacoes.length > 0, mem, resposta };
}
