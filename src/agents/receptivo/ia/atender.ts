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
  const resposta = await pensar(system, conversa, c);
  let texto = acabamento(resposta.texto);
  // agendou: a confirmação oficial já traz tudo; do texto do modelo só fica o que for do pix (chave/comprovante), nunca o resumo repetido
  if (c.saida.confirmacoes.length) texto = [...c.saida.confirmacoes, /\bpix\b/i.test(texto) ? texto : ''].filter(Boolean).join('\n\n');
  if (!texto && c.saida.handoff) texto = 'Vou passar pra alguém da equipe te ajudar com isso. Só um instante.';
  if (!texto) return null;
  return { texto, handoff: c.saida.handoff, encerrar: Boolean(c.saida.encerrar), agendou: c.saida.confirmacoes.length > 0, mem, resposta };
}
