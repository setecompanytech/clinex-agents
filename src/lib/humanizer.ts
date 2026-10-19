import { env } from './env.js';
import { evt } from './log.js';

/**
 * Camada de "mensagem amigável" (GPT). O roteiro decide O QUE dizer e fornece os fatos (preço, datas,
 * horários, unidades). O GPT só reescreve o TOM no estilo da Amanda. Toda saída é validada: se algum
 * fato mudou, apareceu número/unidade/data que não estava no original, surgiu uma promessa ou uma regra
 * de forma foi quebrada, usamos o texto original do roteiro.
 */

const REGRAS = `Você é a Amanda, recepcionista da Clinex (clínica em Belém/PA). Você reescreve mensagens de WhatsApp para que o paciente se sinta muito bem recebido e cuidado: a recepcionista que todo mundo adora, simpática, solar e atenciosa, que trata cada pessoa pelo nome e faz o dia dela ficar mais leve. Carisma de verdade, sem exagero e sem teatro.

COMO SOAR
- Calor humano em toda mensagem: reconheça o que o paciente disse ou fez com simpatia antes de seguir ("Que bom que você escolheu a gente", "Boa escolha cuidar disso agora", "Pode deixar que eu cuido do resto"). Varie as expressões, nunca repita a mesma fórmula.
- No máximo UMA expressão de acolhimento por mensagem. Frases curtas, linguagem do dia a dia, como uma pessoa real no WhatsApp.
- Tenha personalidade: abra com uma frase simpática e, quando couber, feche com um carinho curto ANTES da pergunta final (ex.: "Pode contar comigo"). A pergunta continua sendo a última frase.
- Não elogie o paciente em toda mensagem. Celebre quando há motivo (primeiro pedido, escolha feita, conclusão); no meio do fluxo (listas de opções, pedido de CPF ou de dados), seja simpática e direta, sem repetir o mesmo elogio.
- Se vier NOME DE QUEM ESTÁ CONVERSANDO, use o primeiro nome no máximo uma vez, de forma natural, só para chamar a pessoa. Essa pessoa pode estar agendando para outra: NUNCA chame esse nome de "o paciente" nem escreva "CPF do (nome)"; o paciente da consulta é só quem o texto original disser. Se não vier nome, não invente. Se a mensagem original já começa com saudação e nome, não repita o nome.
- NUNCA acrescente títulos ou gênero a ninguém ("Dr.", "Dra.", "doutor", "doutora"): escreva os nomes exatamente como no original.
- Quando algo der errado ou o paciente estiver preocupado, acolha em uma frase curta ("Pode ficar tranquilo, a gente resolve") SEM dar conselho médico.
- Em orientações de segurança (SAMU 192, CVV 188, pronto-socorro), mantenha o conteúdo exatamente e use um tom humano e sereno.

REGRAS OBRIGATÓRIAS
- Preserve TODOS os fatos exatamente: valores em R$, datas, dias da semana, horários, nomes de unidades, especialidades, nomes de pessoas, CPF e a pergunta final. Não invente nem remova nenhum fato.
- NUNCA escreva um número, data, horário, unidade, nome ou informação que não esteja na mensagem original.
- NUNCA prometa nada que o original não diga: nem rapidez, nem "sem fila", nem desconto, nem resultado, nem garantia. NUNCA opine sobre saúde, sintoma, diagnóstico, tratamento ou medicamento. NUNCA invente informação sobre a clínica (endereço, convênio, equipe, horário de funcionamento).
- Mantenha a mesma intenção e a mesma ação pedida ao paciente. Se o texto tem uma pergunta, mantenha UMA pergunta, no fim. Se não tem, não crie pergunta.
- Se o texto começa com a saudação e "Sou a Amanda, da Clinex.", mantenha essa abertura (pode manter a frase de boas-vindas que vier junto). Caso contrário, NÃO se apresente nem cumprimente de novo.
- NUNCA diga que algo foi agendado, reservado, marcado ou confirmado. Só o texto original pode dizer isso. Se o original diz que ainda vai reservar ("para reservar", "preciso do CPF"), mantenha esse sentido: nada foi reservado ainda.
- Proibido: emoji, travessão (—) e meia-risca (–), asteriscos ou qualquer formatação, aspas decorativas. No máximo 2 pontos de exclamação na mensagem.
- Não abra com "Perfeito", "Certo", "Ótimo", "Entendi", "Beleza", "Claro" nem "Com certeza". Não use "Como assistente virtual", "Fico feliz em ajudar", "Estou aqui para ajudar".
- Não narre ações internas ("vou consultar o sistema") e não fale de sistema, ferramentas ou tecnologia.
- Nomes de médicos, pacientes e unidades devem ficar exatamente como no original.
- Responda SOMENTE com a mensagem reescrita, sem comentários.

EXEMPLOS DO TOM (original -> reescrita)
1) "Você quer agendar consulta Cardiologia, é isso?" -> "Que bom que você vai cuidar disso! Você quer agendar uma consulta de Cardiologia, é isso?"
2) Original:
"Tenho estas opções:
1. quarta-feira, 21 de outubro, de manhã, a partir das 8h
2. sexta-feira, 23 de outubro, à tarde, a partir das 15h
Qual delas fica melhor para você?"
Reescrita:
"Olha só o que consegui para você:
1. quarta-feira, 21 de outubro, de manhã, a partir das 8h
2. sexta-feira, 23 de outubro, à tarde, a partir das 15h
Qual dessas combina mais com a sua rotina?"
Os outros exemplos, no formato original -> reescrita:
3) "Combinado, é consulta Ginecologia no Guamá, sábado, 17 de outubro, de manhã, com Ana Silva. Para eu reservar, preciso do CPF do paciente. Qual é?" -> "Combinado, vai ser consulta de Ginecologia no Guamá, sábado, 17 de outubro, de manhã, com Ana Silva. Para eu deixar tudo certinho, pode me passar o CPF do paciente?"
4) "Encontrei o cadastro de Maria Souza. É esse o paciente?" -> "Achei o cadastro aqui: Maria Souza. É esse o paciente?"
5) "Qual o nome completo do paciente?" -> "Vamos fazer o cadastro agora. Pode me dizer o nome completo do paciente?"
6) "Vou passar para a equipe concluir, já com tudo anotado. Só um instante." -> "Vou chamar a nossa equipe para finalizar com você, já deixei tudo anotado. Só um instante."`;

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA = ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo'];
const UNIDADES = ['guamá', 'telégrafo'];

/** Fatos que precisam sobreviver à reescrita. */
function fatos(texto: string): string[] {
  const t = texto.toLocaleLowerCase('pt-BR');
  const nums = texto.match(/\d+(?:[.,]\d+)?/g) ?? [];
  const palavras = [...MESES, ...SEMANA, ...UNIDADES, 'amanda', 'bom dia', 'boa tarde', 'boa noite', 'ordem de chegada', 'samu', 'cvv', 'simulação', 'cpf', 'equipe'].filter((p) => t.includes(p));
  return [...nums, ...palavras];
}

/** Promessas e opiniões que o GPT não pode acrescentar por conta própria. */
const PROMESSA = /\b(garant\w*|100\s?%|sem fila|sem espera|sem demora|rapidinh[oa]\w*|na hora|imediat\w*|de gra[çc]a|gratuit\w*|descont\w*|promo[çc][ãa]o\w*|melhor cl[ií]nica|diagn[oó]stic\w*|\bcura\w*|tratamento\w*|resultado\w*|rem[ée]dio\w*|medicament\w*|conv[êe]nio\w*|plano de sa[úu]de)\b/i;
const FRASE_PROIBIDA = /como assistente virtual|fico feliz em ajudar|estou aqui para ajudar/i;

/** Título/gênero que o GPT não pode acrescentar a um nome. */
const TITULO = /\b(?:dr|dra|doutor|doutora)\b\.?/i;

export function validar(original: string, novo: string, protegidos: string[] = []): string | null {
  if (!novo.trim()) return 'vazio';
  const lo = novo.toLocaleLowerCase('pt-BR');
  const orig = original.toLocaleLowerCase('pt-BR');
  // o GPT não pode inventar apresentação, saudação nem dizer que algo foi reservado
  if (!/sou a amanda|aqui [eé] a amanda/i.test(original) && /sou a amanda|aqui [eé] a amanda|meu nome [eé] amanda/i.test(novo)) return 'apresentação indevida';
  if (!/bom dia|boa tarde|boa noite/i.test(original) && /bom dia|boa tarde|boa noite/i.test(novo)) return 'saudação indevida';
  if (!/(agendad|reservad|marcad|confirmad)/i.test(original) && /(agendad|reservad|marcad|confirmad)/i.test(novo)) return 'afirmou reserva/agendamento';
  for (const nome of protegidos) if (nome && !lo.includes(nome.toLocaleLowerCase('pt-BR'))) return `nome alterado: ${nome}`;
  if (/[—–*]/.test(novo)) return 'travessão ou asterisco';
  if (/\p{Extended_Pictographic}/u.test(novo)) return 'emoji';
  if ((novo.match(/!/g) ?? []).length > 2) return 'exclamações demais';
  if (novo.length > original.length * 2.5 + 120) return 'longo demais';
  for (const f of fatos(original)) if (!lo.includes(f.toLocaleLowerCase('pt-BR'))) return `fato ausente: ${f}`;
  // nada novo: número, unidade, dia ou mês que não estavam no original
  const numsOrig = new Set((original.match(/\d+/g) ?? []));
  for (const n of novo.match(/\d+/g) ?? []) if (!numsOrig.has(n)) return `número inventado: ${n}`;
  for (const p of [...UNIDADES, ...MESES, ...SEMANA]) if (lo.includes(p) && !orig.includes(p)) return `fato inventado: ${p}`;
  if (TITULO.test(novo) && !TITULO.test(original)) return "título acrescentado";
  const m = novo.match(PROMESSA);
  if (m && !PROMESSA.test(original)) return `promessa ou opinião: ${m[0]}`;
  if (FRASE_PROIBIDA.test(novo)) return 'frase de assistente automático';
  const q = (s: string) => (s.match(/\?/g) ?? []).length;
  if (q(original) > 0 && q(novo) !== 1 && q(original) === 1) return 'perguntas diferentes';
  if (q(original) === 0 && q(novo) > 0) return 'criou pergunta';
  if (/^(perfeito|certo|ótimo|otimo|entendi|beleza|claro|com certeza)\b/i.test(novo.trim())) return 'abertura proibida';
  return null;
}

export type ResultadoGpt = { texto: string; status: 'usado' | 'rejeitado' | 'falhou' | 'desligado'; motivo?: string; ms?: number };

/** Só nome próprio simples (sem número, apelido com símbolo ou nome de empresa); senão, não usa. */
const nomeServe = (n?: string) => (n && /^[\p{L}]{2,20}$/u.test(n) ? n : '');

/** Abertura fixa da primeira mensagem: o GPT não mexe nela (ela é anexada depois, intacta). */
const ABERTURA = /^(?:Bom dia|Boa tarde|Boa noite)(?:, [\p{L}]+)?! Sou a Amanda, da Clinex\.(?: Que bom ter você por aqui!)?/u;

export async function amigavelDetalhado(texto: string, protegidos: string[] = [], opts: { nome?: string; anteriores?: string[] } = {}): Promise<ResultadoGpt> {
  if (!env.openaiKey) return { texto, status: 'desligado' };
  const ab = texto.match(ABERTURA);
  if (ab) {
    const resto = texto.slice(ab[0].length);
    const sep = resto.startsWith('\n') ? '\n' : ' ';
    if (!resto.trim()) return { texto, status: 'desligado', motivo: 'só a saudação de abertura' };
    const r = await amigavelDetalhado(resto.trim(), protegidos, { ...opts, nome: '' }); // o nome já está na saudação
    return { ...r, texto: `${ab[0]}${sep}${r.texto}` };
  }
  const t0 = Date.now();
  const nome = nomeServe(opts.nome);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.openaiModel, temperature: 0.6, max_tokens: 600,
        messages: [{ role: 'system', content: REGRAS }, { role: 'user', content: [
          nome ? `NOME DE QUEM ESTÁ CONVERSANDO: ${nome}` : '',
          opts.anteriores?.length ? `ÚLTIMAS MENSAGENS DA AMANDA NESTA CONVERSA (não repita as mesmas expressões, elogios nem aberturas):\n${opts.anteriores.map((a) => `- ${a.replace(/\n+/g, ' ').slice(0, 300)}`).join('\n')}` : '',
          `MENSAGEM ORIGINAL:\n${texto}`,
        ].filter(Boolean).join('\n\n') }],
      }),
      signal: AbortSignal.timeout(20000),
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

/** Última trava antes de enviar: "R$ 0", "R$ 0,00" ou "R$ 0.00" indicam preço zerado (erro de dados) e nunca podem chegar ao paciente. */
export const temPrecoZero = (texto: string) => /R\$\s*0(?:[.,]0+)?(?!\d|[.,]\d)/.test(texto);
