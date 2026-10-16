import { env } from './env.js';
import { evt } from './log.js';

/**
 * Camada de "mensagem amigável" (GPT). O roteiro decide O QUE dizer e fornece os fatos (preço, datas,
 * horários, unidades). O GPT só reescreve o TOM no estilo da Amanda. Toda saída é validada: se algum
 * fato mudou ou uma regra de forma foi quebrada, usamos o texto original do roteiro.
 */

const REGRAS = `Você reescreve mensagens de WhatsApp da Amanda, recepcionista da Clinex (clínica em Belém/PA), para soarem como uma atendente brasileira atenciosa.

REGRAS OBRIGATÓRIAS
- Preserve TODOS os fatos exatamente: valores em R$, datas, dias da semana, horários, nomes de unidades, especialidades, nomes de pessoas e a pergunta final. Não invente nem remova nenhum fato.
- Mantenha a mesma intenção e a mesma ação pedida ao paciente. Se o texto tem uma pergunta, mantenha UMA pergunta, no fim. Se não tem, não crie pergunta.
- Se o texto começa com a saudação e "Sou a Amanda, da Clinex.", mantenha exatamente essa abertura. Caso contrário, NÃO se apresente nem cumprimente de novo.
- Tom caloroso, simples e direto, como no WhatsApp: frases curtas, no máximo 3 frases por parágrafo. Pode juntar ou reordenar frases para ficar natural, sem perder fatos.
- Proibido: emoji, travessão (—) e meia-risca (–), asteriscos ou qualquer formatação, aspas decorativas.
- Não abra com "Perfeito", "Certo", "Ótimo", "Entendi", "Beleza", "Claro" nem "Com certeza". Não use "Como assistente virtual", "Fico feliz em ajudar", "Estou aqui para ajudar".
- Não narre ações internas ("vou consultar o sistema") e não fale de sistema, ferramentas ou tecnologia.
- Se a mensagem passa orientação de segurança (SAMU 192, CVV 188, pronto-socorro), não altere o conteúdo.
- NUNCA diga que algo foi agendado, reservado, marcado ou confirmado. Só o texto original pode dizer isso. Se o original diz que ainda vai reservar ("para reservar", "preciso do CPF"), mantenha esse sentido: nada foi reservado ainda.
- NUNCA acrescente apresentação ("Sou a Amanda", "Aqui é a Amanda") nem saudação ("Bom dia", "Boa tarde", "Boa noite") que o texto original não tenha.
- Nomes de médicos, pacientes e unidades devem ficar exatamente como no original.
- Responda SOMENTE com a mensagem reescrita, sem comentários.`;

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA = ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo'];

/** Fatos que precisam sobreviver à reescrita. */
function fatos(texto: string): string[] {
  const t = texto.toLocaleLowerCase('pt-BR');
  const nums = texto.match(/\d+(?:[.,]\d+)?/g) ?? [];
  const palavras = [...MESES, ...SEMANA, 'guamá', 'telégrafo', 'amanda', 'bom dia', 'boa tarde', 'boa noite', 'ordem de chegada', 'samu', 'cvv', 'simulação', 'cpf', 'equipe'].filter((p) => t.includes(p));
  return [...nums, ...palavras];
}

export function validar(original: string, novo: string, protegidos: string[] = []): string | null {
  if (!novo.trim()) return 'vazio';
  // o GPT não pode inventar apresentação, saudação nem dizer que algo foi reservado
  if (!/sou a amanda|aqui [eé] a amanda/i.test(original) && /sou a amanda|aqui [eé] a amanda|meu nome [eé] amanda/i.test(novo)) return 'apresentação indevida';
  if (!/bom dia|boa tarde|boa noite/i.test(original) && /bom dia|boa tarde|boa noite/i.test(novo)) return 'saudação indevida';
  if (!/(agendad|reservad|marcad|confirmad)/i.test(original) && /(agendad|reservad|marcad|confirmad)/i.test(novo)) return 'afirmou reserva/agendamento';
  for (const nome of protegidos) if (nome && !novo.toLocaleLowerCase('pt-BR').includes(nome.toLocaleLowerCase('pt-BR'))) return `nome alterado: ${nome}`;
  if (/[—–*]/.test(novo)) return 'travessão ou asterisco';
  if (/\p{Extended_Pictographic}/u.test(novo)) return 'emoji';
  if (novo.length > original.length * 2 + 60) return 'longo demais';
  const lo = novo.toLocaleLowerCase('pt-BR');
  for (const f of fatos(original)) if (!lo.includes(f.toLocaleLowerCase('pt-BR'))) return `fato ausente: ${f}`;
  const q = (s: string) => (s.match(/\?/g) ?? []).length;
  if (q(original) > 0 && q(novo) !== 1 && q(original) === 1) return 'perguntas diferentes';
  if (q(original) === 0 && q(novo) > 0) return 'criou pergunta';
  if (/^(perfeito|certo|ótimo|otimo|entendi|beleza|claro|com certeza)\b/i.test(novo.trim())) return 'abertura proibida';
  return null;
}

export type ResultadoGpt = { texto: string; status: 'usado' | 'rejeitado' | 'falhou' | 'desligado'; motivo?: string; ms?: number };

export async function amigavelDetalhado(texto: string, protegidos: string[] = []): Promise<ResultadoGpt> {
  if (!env.openaiKey) return { texto, status: 'desligado' };
  const t0 = Date.now();
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.openaiModel, temperature: 0.3, max_tokens: 500,
        messages: [{ role: 'system', content: REGRAS }, { role: 'user', content: texto }],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j: any = await res.json();
    const novo: string = (j.choices?.[0]?.message?.content ?? '').trim();
    const erro = validar(texto, novo, protegidos);
    const ms = Date.now() - t0;
    if (erro) { const r: ResultadoGpt = { texto, status: 'rejeitado', motivo: erro, ms }; evt('gpt', { status: r.status, motivo: erro, ms, original: texto, reescrito: novo }); return r; }
    evt('gpt', { status: 'usado', ms, original: texto, reescrito: novo, tokens: j.usage?.total_tokens });
    return { texto: novo, status: 'usado', ms };
  } catch (e) {
    const motivo = (e as Error).message;
    evt('gpt', { status: 'falhou', motivo, ms: Date.now() - t0, original: texto });
    return { texto, status: 'falhou', motivo, ms: Date.now() - t0 };
  }
}

/** Compatível com o uso anterior: devolve só o texto final. */
export async function amigavel(texto: string, _opts: { tag?: string } = {}): Promise<string> {
  return (await amigavelDetalhado(texto)).texto;
}
