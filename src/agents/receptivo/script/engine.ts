import type { Comprovante } from '../../../lib/comprovante.js';
import { env } from '../../../lib/env.js';
import { exibir, exibirLista, prepararGeneros } from '../../../lib/genero.js';
import { RAIZES, type Fonte, type PacienteInfo, type Periodo, type Servico, type Slot, type Unidade } from './catalog.js';

/**
 * Motor de conversa por roteiro. O estado é recalculado a cada mensagem reprocessando as mensagens do
 * paciente em ordem (sem banco). Os FATOS (unidades, médicos, preço, datas, paciente) vêm da fonte.
 *
 * Fluxo:
 *  1 recepção -> 2 paciente diz o que precisa (serviço direto ou sintoma) -> 3 IA sugere o serviço e o paciente confirma
 *  -> 4 IA consulta a agenda e informa as unidades que têm o serviço, com o médico de cada uma, e pergunta qual
 *  -> 5 paciente escolhe a unidade (e talvez já o dia) -> 6 IA lista datas e turnos com vaga (início da agenda)
 *  -> 7 paciente escolhe -> 8 IA pede o CPF -> 9 IA consulta o paciente e mostra o nome para confirmar
 *  -> 10 se o CPF não existe: coleta o cadastro (nome, nascimento, sexo, telefone) -> 11 conclui.
 * Estilo Amanda v7.3: sem emoji, sem travessão, sem asterisco, uma pergunta por mensagem.
 */

export type Cadastro = { nome?: string; nascimento?: string; sexo?: 'feminino' | 'masculino'; telefone?: string; pediuTelefone?: boolean };

export type State = {
  saudou: boolean;
  servico?: Servico;
  opcoes?: { id: string; nome: string }[];
  confirmPerguntado: boolean;
  servicoConfirmado: boolean;
  unidadesInformadas: boolean;
  unidade?: Unidade;
  lista?: Slot[]; // datas oferecidas (o paciente pode responder pelo número)
  data?: string;
  turno?: Periodo;
  slot?: Slot;
  cpf?: string;
  paciente?: PacienteInfo | null; // undefined = ainda não consultado; null = não existe
  pacienteConfirmado: boolean;
  cad: Cadastro;
  falhas: number;
  fim: boolean;
  pagPerguntado: boolean;
  pagamento?: 'pix' | 'link' | 'recepcao';
  pixEnviado: boolean;
  pagFinal: boolean; // forma de pagamento resolvida (comprovante conferido, pagamento na recepção ou desistência do pix)
  compTent: number; // respostas/comprovantes que não serviram
  comprovante?: { valor: number; data: string; nota: string };
  rapido?: boolean; // pediu "o mais rápido possível" antes de ver a lista: escolhe o primeiro horário quando chegar a hora
  apartir?: string; // pediu "semana que vem", "depois do dia 25"...: a lista de horários começa nessa data
  ofereceuEquipe?: string; // serviço pedido que não foi encontrado: ela ofereceu chamar a equipe e espera a resposta
  preUnidade?: string; // unidade citada antes de o serviço ser conhecido (aplicada quando ele for)
  pagPref?: 'pix' | 'link' | 'recepcao'; // forma de pagamento adiantada pelo paciente, antes de a pergunta ser feita
  pagoPix?: number; // soma dos comprovantes já conferidos (o paciente pode pagar em mais de um pix)
  transacoes?: string[]; // ids de transação já contados, para o mesmo comprovante não valer duas vezes
  pos?: Pos; // logo depois de um agendamento concluído
};

/**
 * `efetivar` é calculado pelo `responder`: só a ÚLTIMA mensagem pode gravar, porque o roteiro reprocessa a
 * conversa inteira a cada mensagem e uma gravação nas anteriores duplicaria o agendamento.
 */
export type Ctx = {
  now: Date; nome: string; tz: string; telefone?: string; efetivar?: boolean;
  pos?: Pos; // estado da conversa logo depois de um agendamento (o agente deduz da última mensagem enviada)
  lerComprovante?: (idMensagem: string) => Promise<Comprovante | null>; // lê a imagem do comprovante
  /** Intérprete de apoio (IA): quando as regras não entendem a resposta do paciente à lista de horários, tenta entender. Sempre validado. */
  interpretar?: (p: { texto: string; lista: Slot[]; hoje: string }) => Promise<(IntLista & { indice?: number | null; turno?: 'manhã' | 'tarde' | null }) | null>;
};
export type Handoff = { motivo: string; urgente?: boolean };
export type Result = {
  state: State; reply: string; handoff?: Handoff; silencio?: boolean;
  aposHandoffDuro?: boolean; // a conversa já passou por uma transferência que a Amanda NÃO deve desfazer (pediu humano, urgência)
};

/** Etapa legível da conversa, para o painel de logs. */
export function etapa(s: State, handoff?: Handoff): string {
  if (handoff?.urgente) return 'segurança (emergência/crise)';
  if (handoff) return 'transferida para a equipe';
  if (s.fim) return 'concluída';
  if (!s.servico) return s.opcoes ? 'escolhendo entre opções de serviço' : 'recepção / entendendo o serviço';
  if (!s.servicoConfirmado) return 'confirmando o serviço';
  if (!s.unidade) return 'escolhendo a unidade';
  if (!s.slot) return 'escolhendo data e turno';
  if (!s.pagFinal) return s.pagamento === 'pix' && s.pixEnviado ? 'aguardando o comprovante do pix' : 'escolhendo a forma de pagamento';
  if (!s.cpf) return 'pedindo o CPF';
  if (s.paciente === undefined) return 'consultando o paciente';
  if (s.paciente === null) return 'cadastro do paciente novo';
  return 'confirmando o paciente';
}

/** Marcas na mensagem final; o agente abre uma jornada nova depois delas. */
export const MARCA_FIM = 'Simulação: nada foi agendado';
export const MARCA_AGENDADO = 'Agendamento confirmado';
export const MARCA_MAIS = 'Posso te ajudar com mais alguma coisa';
export const MARCA_ADEUS = 'Tenha um ótimo dia';
export const MARCA_PIX = 'Chave pix:';
export const MARCA_PAGAMENTO = 'antecipar o pagamento';
export const MARCAS_FIM = [MARCA_FIM, MARCA_AGENDADO, MARCA_MAIS, MARCA_ADEUS];
/** Mensagens com texto exato (valores, chave, marcas): não passam pelo GPT. */
export const SEM_GPT = [MARCA_AGENDADO, MARCA_MAIS, MARCA_ADEUS, MARCA_PIX, MARCA_PAGAMENTO];
/** Textos que o Giovanny aprovou palavra por palavra (unidades, horários, "o mais rápido", comprovante, aviso de segurança do sintoma): também não passam pelo GPT. */
SEM_GPT.push('Tenho sim!', 'Consegui estes aqui', 'O mais rápido que tenho é', 'O último que tenho é', 'Não to conseguindo ler esse comprovante', 'Recebi o seu comprovante', 'Pelo que você contou');

export const novoEstado = (): State => ({
  saudou: false, confirmPerguntado: false, servicoConfirmado: false, unidadesInformadas: false,
  pacienteConfirmado: false, cad: {}, falhas: 0, fim: false,
  pagPerguntado: false, pixEnviado: false, pagFinal: false, compTent: 0,
});

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const SAUDACAO = (h: number) => (h >= 5 && h < 12 ? 'Bom dia' : h >= 12 && h < 18 ? 'Boa tarde' : 'Boa noite');
const cap = (s: string) => s.charAt(0).toLocaleUpperCase('pt-BR') + s.slice(1);
const titulo = (s: string) => s.toLocaleLowerCase('pt-BR').replace(/(^|[\s'-])(\p{L})/gu, (_m, a, b) => a + b.toLocaleUpperCase('pt-BR')).replace(/\b(De|Da|Do|Dos|Das|E)\b/g, (x) => x.toLowerCase());

// ---------- datas (fuso da clínica) ----------
function hoje(ctx: Ctx) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: ctx.tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(ctx.now).map((x) => [x.type, x.value]));
  return { ymd: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour) % 24 };
}
const toDate = (ymd: string) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const addDias = (ymd: string, n: number) => { const d = toDate(ymd); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diaSemana = (ymd: string) => toDate(ymd).getUTCDay(); // 0 = domingo
const fmtData = (ymd: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(toDate(ymd));
const hora = (hhmm: string) => { const [h, m] = hhmm.split(':'); return m === '00' ? `${Number(h)}h` : `${Number(h)}h${m}`; };
const periodoTxt = (t: Periodo) => (t === 'manhã' ? 'de manhã' : 'à tarde');
const NOMES_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEM_CURTA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
/** "quinta, dia 22" (ou "quinta, dia 5 de novembro" quando é em outro mês). `ref` = hoje. */
const dataCurta = (ymd: string, ref: string) => { const d = toDate(ymd); return `${SEM_CURTA[d.getUTCDay()]}, dia ${d.getUTCDate()}${ymd.slice(0, 7) === ref.slice(0, 7) ? '' : ` de ${NOMES_MES[d.getUTCMonth()]}`}`; };
/** "quinta (22)" / "terça (3/11)": para o resumo. */
const dataResumo = (ymd: string, ref: string) => { const d = toDate(ymd); return `${SEM_CURTA[d.getUTCDay()]} (${d.getUTCDate()}${ymd.slice(0, 7) === ref.slice(0, 7) ? '' : `/${d.getUTCMonth() + 1}`})`; };
/** "quinta dia 22": para frase corrida, sem vírgula. */
const dataFalada = (ymd: string, ref: string) => dataCurta(ymd, ref).replace(',', '');
/** "na quinta (22)" / "no sábado (24)": para o resumo falado. */
const diaResumo = (ymd: string, ref: string) => `${[0, 6].includes(toDate(ymd).getUTCDay()) ? 'no' : 'na'} ${dataResumo(ymd, ref)}`;
/** "quinta, dia 22 de outubro": sempre com o mês, para a confirmação final não deixar dúvida. */
const dataLonga = (ymd: string) => { const d = toDate(ymd); return `${SEM_CURTA[d.getUTCDay()]}, dia ${d.getUTCDate()} de ${NOMES_MES[d.getUTCMonth()]}`; };
/** Nomes de médicos na conversa: "a Dra. Fernanda" / "o Dr. Armando" (nome completo só se dois tiverem o mesmo primeiro nome). */
const nomesExib = (nomes: (string | undefined)[]) => { const u = [...new Set(nomes.filter((x): x is string => Boolean(x)))]; const ex = exibirLista(u, { artigo: true }); return new Map(u.map((n, i) => [n, ex[i]])); };
/** "a Dra. Fernanda e o Dr. Armando". */
const juntar = (itens: string[]) => (itens.length <= 1 ? (itens[0] ?? '') : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`);
const numerada = (slots: Slot[], comMedico: boolean, ref: string) => {
  const nomes = nomesExib(slots.map((x) => x.profissional));
  return slots.map((s, i) => `${i + 1}. ${cap(dataCurta(s.ymd, ref))}, ${periodoTxt(s.turno)}, a partir das ${hora(s.inicio)}${comMedico && s.profissional ? `, com ${nomes.get(s.profissional)}` : ''}`).join('\n');
};
/** Um horário numa frase corrida, quase sem vírgula: "quinta dia 22 de manhã a partir das 8h com a Dra. Fernanda". */
const slotFalado = (s: Slot, comMedico: boolean, ref: string) => `${dataFalada(s.ymd, ref)} ${periodoTxt(s.turno)} a partir das ${hora(s.inicio)}${comMedico && s.profissional ? ` com ${exibir(s.profissional, { artigo: true })}` : ''}`;

const SEMANA: [RegExp, number][] = [[/domingo/, 0], [/segunda/, 1], [/terca/, 2], [/quarta/, 3], [/quinta/, 4], [/sexta/, 5], [/sabado/, 6]];

export function lerData(t: string, ctx: Ctx): string | undefined {
  const h = hoje(ctx);
  if (/depois de amanha/.test(t)) return addDias(h.ymd, 2);
  if (/amanha/.test(t)) return addDias(h.ymd, 1);
  if (/\bhoje\b/.test(t)) return h.ymd;
  // "quinta 22", "terça-feira, dia 27": o número é o dia do mês (este mês, ou o próximo se já passou)
  const wn = t.match(/\b(?:segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:-feira)?[\s,.-]*(?:dia\s*)?(\d{1,2})\b(?![\/.-]\d)/);
  if (wn) {
    const dia = Number(wn[1]);
    if (dia >= 1 && dia <= 31) {
      let ano = Number(h.ymd.slice(0, 4)); let mes = Number(h.ymd.slice(5, 7));
      const mk = (a: number, m: number) => `${a}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
      let ymd = mk(ano, mes);
      if (ymd < h.ymd) { mes += 1; if (mes > 12) { mes = 1; ano += 1; } ymd = mk(ano, mes); }
      if (toDate(ymd).getUTCDate() === dia) return ymd; // só se o dia existe naquele mês
    }
  }
  for (const [re, dow] of SEMANA) {
    if (re.test(t)) { let n = (dow - diaSemana(h.ymd) + 7) % 7; if (n === 0) n = 7; return addDias(h.ymd, n); }
  }
  const dm = t.match(/\b(\d{1,2})[\/.-](\d{1,2})\b/) ?? t.match(/\bdia (\d{1,2})\b/);
  if (dm) {
    const dia = Number(dm[1]); const mes = dm[2] ? Number(dm[2]) : Number(h.ymd.slice(5, 7));
    if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12) {
      let ano = Number(h.ymd.slice(0, 4)); let ymd = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
      if (ymd < h.ymd) { ano += 1; ymd = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`; }
      return ymd;
    }
  }
  return undefined;
}
/** O paciente pediu uma pessoa pelo nome ("com a Dra. Fernanda", "com o Armando")? */
const PEDE_PESSOA = /\b(dr|dra|doutor|doutora|medico|medica)\b|\bcom (a|o)\s+[a-z]{3,}/;
const lerTurno = (texto: string): Periodo | 'noite' | undefined => {
  const t = texto.replace(/\b(bom dia|boa tarde|boa noite|mais cedo|cedinho)\b/g, ' '); // saudação e "o mais cedo possível" não dizem o período
  return /(^|[^a-z])(manha|cedo)([^a-z]|$)/.test(t) ? 'manhã' : /tarde/.test(t) ? 'tarde' : /noite/.test(t) ? 'noite' : undefined;
};

// ---------- detectores ----------
const EMERGENCIA = /dor (forte )?no peito|falta de ar|nao consigo respirar|desmai|convuls|sangramento (intenso|forte)|avc|infarto|rigidez (de|na) nuca|fraqueza (subita|de um lado)|fala (travada|enrolada)/;
const CRISE = /suicid|me matar|tirar minha vida|acabar com minha vida|nao quero mais viver|me machucar|autolesao/;
/** Emergência ou crise: a Amanda não espera os 30 s de agrupamento de mensagens para responder. */
export const ehUrgencia = (texto: unknown) => { if (typeof texto !== 'string') return false; const t = norm(texto); return EMERGENCIA.test(t) || CRISE.test(t); };
const HUMANO = /atendente|humano|pessoa de verdade|falar com alguem|falar com uma pessoa|(falar|conversar|chamar|chama|passar|passa|pedir|quero|pode chamar).{0,20}(recepcao|recepcionista|equipe)/;
const SIM = /^(s+i+m+|s|pode|pode (sim|reservar|agendar|marcar|confirmar|fazer|seguir|continuar|ser)|quero|quero sim|ok|okay|isso|isso (mesmo|ai|a)|e isso|e isso mesmo|e esse|e esse mesmo|esse (mesmo|ai)|ele mesmo|ela mesma|exato|exatamente|confirmo|confirma|confirmado|fechado|fechou|combinado|bora|vamos|vamo|vai la|manda ver|claro|claro que sim|mas claro|com certeza|por favor|ta bom|ta certo|ta otimo|ta|tudo bem|correto|certo|certinho|perfeito|otimo|beleza|blz|demorou|uhum|aham|u+h+u+m+|positivo|afirmativo|yes|sim senhora|sim senhor|sou eu|sou eu mesmo)\b/;
const RETOMAR = /\b(retom\w*|continu\w*|dar continuidade|voltei|ainda quero|onde (a gente )?parou|de onde paramos|seguir com (o|meu) agendamento)\b/;
const NAO = /^(nao|n|nope|nao quero|nao obrigad|nao e|nao era|nao eh|nao mesmo|nao senhora|nao senhor|negativo|nada disso|nem|nenhum|nenhuma|errado|errei|incorreto|ta errado|de jeito nenhum|jamais|outro|outra|prefiro outro|prefiro outra)\b/;
const SO_CUMPRIMENTO = /^(oi+|ola|ola+ boa|e ai|ei|bom dia|boa tarde|boa noite|teste|ola teste|agente de ia|amanda|atendimento|tudo bem\??|oie)[\s!.,?]*(teste|amanda|tudo bem\??)?[\s!.,?]*$/;

const cpfDoTexto = (t: string): string | undefined => {
  const m = t.match(/\b(\d{3})\.?(\d{3})\.?(\d{3})-?(\d{2})\b/);
  if (m) return m.slice(1).join('');
  const d = t.replace(/\D/g, ''); // "123 456 789 09", "123,456,789,09" (áudio transcrito)
  return d.length === 11 ? d : undefined;
};

/** Escolha numa lista: "2", "opção 2", "o primeiro", "a terceira", "o último", "dois". -1 = não é uma escolha. */
export function lerEscolha(t: string, total: number): number {
  const porOpcao = /\b(opcao|alternativa|numero)\b/.test(t);
  const FILL = '(?:(?:a|o|essa|esse|de|quero|opcao|alternativa|numero)\\s+)*';
  const dig = t.match(new RegExp(`^\\s*${FILL}(\\d)\\b(?![/.-]\\d)`));
  if (dig) return Number(dig[1]) - 1;
  if (/\bultim[oa]\b/.test(t)) return total - 1;
  const ord: [RegExp, number][] = [[/\bprimeir[oa]\b/, 0], [/\bterceir[oa]\b/, 2], [/\bquinto\b/, 4], [/\bsegundo\b/, 1], [/\bquarto\b/, 3]]; // masculino ("o quinto") não é dia da semana
  // "segunda", "quarta" e "quinta" também são dias da semana: só valem como posição quando vêm com "opção/número"
  if (porOpcao) ord.push([/\bsegund[oa]\b/, 1], [/\bquart[oa]\b/, 3], [/\bquinta\b/, 4]);
  for (const [re, i] of ord) if (re.test(t)) return i;
  const NUM: Record<string, number> = { um: 0, uma: 0, dois: 1, duas: 1, tres: 2, quatro: 3, cinco: 4 };
  const w = t.match(new RegExp(`^\\s*${FILL}(um|uma|dois|duas|tres|quatro|cinco)\\b`)) ?? t.match(/\b(?:opcao|alternativa|numero)\s+(um|uma|dois|duas|tres|quatro|cinco)\b/);
  return w ? NUM[w[1]] : -1;
}
const pick = <T,>(arr: T[], n: number) => arr[n % arr.length];

const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function lerNascimento(t: string): string | undefined {
  const m = t.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})\b/);
  // por extenso (áudio): "10 de maio de 1990"
  const e = norm(t).match(new RegExp(`\\b(\\d{1,2})\\s*(?:de\\s+)?(${MESES.join('|')})\\s*(?:de\\s+)?(\\d{4})\\b`));
  if (!m && !e) return undefined;
  const [d, mo, a] = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [Number(e![1]), MESES.indexOf(e![2]) + 1, Number(e![3])];
  const dt = new Date(Date.UTC(a, mo - 1, d));
  if (a < 1900 || a > new Date().getUTCFullYear() || dt.getUTCDate() !== d || dt.getUTCMonth() !== mo - 1) return undefined;
  return `${a}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
/** "Meu nome é Joana Silva." (áudio) -> "Joana Silva" */
const limparNome = (texto: string) => texto.trim()
  .replace(/^(?:oi|ol[aá]|bom dia|boa tarde|boa noite)[,.!\s]+/i, '')
  .replace(/^(?:o\s+)?(?:meu\s+)?nome(?:\s+completo)?\s+(?:é|e)\s+/i, '')
  .replace(/^(?:me chamo|eu me chamo|eu sou(?:\s+[oa])?|sou(?:\s+[oa])?)\s+/i, '')
  .replace(/[.!,\s]+$/, '');
const fmtNasc = (iso: string) => iso.split('-').reverse().join('/');

// ---------- pagamento e pós-atendimento ----------
const reais = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Mídia enviada pelo paciente chega ao roteiro como [[midia:tipo:id]] (o agente troca a imagem por esta marca). */
export const TOKEN_MIDIA = /\[\[midia:(image|document):([^\]]+)\]\]/;

const RECEPCAO = /nao (quero|vou|precisa|preciso|pretendo)( mais)?( de)? (pagar|antecipar|adiantar)|(so|apenas|somente)( quero| queria| preciso)? agendar|pagar (la|na recepcao|na clinica|na hora|no dia|depois|presencial)|pago (la|na recepcao|na clinica|na hora|no dia|depois)|\bna recepcao\b|\bna clinica\b|presencial|pessoalmente|\bdinheiro\b|\bdebito\b|depois eu pago|na hora que chegar/;
const PIX = /\bpix\b/;
const LINK = /(link|credito|cartao|parcel)/;
/** Forma de pagamento citada pelo paciente; undefined = não deu para entender. */
function lerPagamento(t: string): 'pix' | 'link' | 'recepcao' | undefined {
  if (RECEPCAO.test(t)) return 'recepcao';
  if (PIX.test(t)) return 'pix';
  if (LINK.test(t)) return 'link';
  if (NAO.test(t)) return 'recepcao'; // "não" a "quer antecipar o pagamento?"
  return undefined;
}

/** Forma de pagamento dita ANTES de a pergunta ser feita: só frases claras ("vou pagar na recepção", "quero pagar por pix"), nunca um "não" solto. */
function pagamentoAdiantado(t: string): 'pix' | 'link' | 'recepcao' | undefined {
  if (/\b(pagar|pago|pagamento)\b.{0,25}\b(la|recepcao|clinica|hora|dia|depois|presencial|dinheiro|debito)\b|nao (quero|vou|precisa|preciso|pretendo)( mais)?( de)? (pagar|antecipar|adiantar)|depois eu pago|\bpresencial\b/.test(t)) return 'recepcao';
  if (/\b(pagar|pago|pagamento|antecipar|adiantar|vou|quero|prefiro|pode ser|via|por)\b.{0,15}\bpix\b|\bpix\b.{0,15}\b(pagar|pagamento|antecip)/.test(t)) return 'pix';
  if (/\b(pagar|pago|pagamento|antecipar|adiantar|vou|quero|prefiro|pode ser|via|por)\b.{0,15}\b(link|credito|cartao)\b|\b(link|credito|cartao)\b.{0,15}\b(pagar|pagamento)\b/.test(t)) return 'link';
  return undefined;
}

const AGRADECE = new Set(['muito', 'obrigado', 'obrigada', 'brigado', 'brigada', 'valeu', 'vlw', 'show', 'perfeito', 'beleza', 'blz', 'ok', 'okay', 'certo', 'combinado', 'ta', 'bom', 'tudo', 'bem', 'otimo', 'excelente', 'maravilha', 'legal', 'massa', 'top', 'demais', 'mesmo', 'viu', 'entao', 'grato', 'grata', 'agradeco', 'deus', 'abencoe', 'gracas', 'obg', 'obgd', 'tmj', 'flw', 'falou', 'abraco', 'abracos', 'ate', 'logo', 'mais', 'tchau', 'amanha', 'vejo', 'voces', 'vcs', 'dia', 'tarde', 'noite', 'te', 'a', 'o', 'de']);
const soAgradecimento = (t: string) => {
  if (t && !/[a-z0-9]/.test(t)) return true; // só emoji (joinha, mãos juntas...)
  const w = t.split(/[^a-z]+/).filter(Boolean);
  return w.length > 0 && w.length <= 10 && w.every((x) => AGRADECE.has(x));
};
const NAO_MAIS = /\b(so isso|era so isso|e so isso|so era isso|nada mais|mais nada|nao preciso|nao precisa|nao,? obrigad[oa]|por hoje|por enquanto|tudo certo|pode encerrar|tchau|ate (mais|logo|breve))\b|^(nao|n)[\s!.,]*$/;
const SO_SIM = /^(sim|s|quero|quero sim|claro|pode|pode sim|gostaria|preciso|isso|uhum|aham|por favor|queria|tenho sim|tenho)[\s!.,]*$/;

const PERG_CPF = 'Me passa o CPF do paciente pra eu reservar?';
const PERG_CPF_APOS = 'Agora pra eu fazer a reserva pode me passar o CPF do paciente?';
export const TXT_MAIS ='Imagina, foi um prazer! Posso te ajudar com mais alguma coisa?';
export const TXT_ADEUS = 'Por nada! Foi um prazer te atender. Tenha um ótimo dia e se cuida, tá?';
export type Pos = 'confirmado' | 'perguntou_mais' | 'encerrou';

/**
 * Logo depois de um agendamento concluído: "obrigado" -> pergunta se pode ajudar em mais algo; "era só isso" -> despede;
 * "quero outro" -> segue normal; depois da despedida, novo agradecimento não recebe resposta.
 */
function posAgendamento(pos: Pos, t: string): { reply: string; pos?: Pos } | 'seguir' | 'silencio' {
  if (NAO_MAIS.test(t)) return pos === 'encerrou' ? 'silencio' : { reply: TXT_ADEUS, pos: 'encerrou' };
  if (SO_SIM.test(t)) return pos === 'encerrou' ? 'seguir' : { reply: 'Que bom! Me conta qual consulta ou exame você quer agendar.' };
  if (soAgradecimento(t)) {
    if (pos === 'confirmado') return { reply: TXT_MAIS, pos: 'perguntou_mais' };
    if (pos === 'perguntou_mais') return { reply: TXT_ADEUS, pos: 'encerrou' };
    return 'silencio';
  }
  return 'seguir';
}

// ---------- dúvidas no meio do fluxo ----------
export type Faq = 'horario' | 'preco' | 'pagto' | 'medicos' | 'unidades' | 'endereco' | 'convenio' | 'preparo' | 'ping';
const FAQ: [Faq, RegExp][] = [
  ['horario', /horario de (atendimento|funcionamento)|\b(qual|quais|que)\b.{0,12}\bhorarios?\b.{0,10}\b(atendimento|funcionamento)\b|que horas?.{0,12}\b(abre|abrem|fecha|fecham|funciona|funcionam|atende|atendem)\b|ate que horas|\b(abre|abrem|funciona|funcionam|atende|atendem)\b.{0,12}\b(sabado|domingo|feriado|sabados)\b/],
  ['preco', /\b(quanto (custa|fica|sai|e)|qual (e )?o (valor|preco)|valor da|preco da|qual (e )?a (valor|taxa))\b/],
  ['pagto', /formas? de pagamento|\baceita(m)? (cartao|pix|dinheiro|debito|credito)\b|\b(posso|da pra|da para) (pagar|parcelar)\b|\bparcel/],
  ['medicos', /\b(quais|que|quem)\b.{0,15}\b(medicos?|medicas?|profissionais|doutor\w*|especialistas?)\b|\bquem atende\b/],
  ['unidades', /\b(quais|que|onde)\b.{0,15}\b(unidades?|clinicas?)\b|\bunidades? (voces )?(tem|possuem)\b/],
  ['endereco', /\b(endereco|localizacao|ponto de referencia|como (eu )?(chego|chegar)|onde (fica|ficam|e a|e o|voces ficam))\b/],
  ['convenio', /\b(convenio|convenios|plano de saude|unimed|amil|hapvida|bradesco saude|sulamerica|cassi)\b/],
  ['preparo', /\b(jejum|preparo|o que levar|preciso levar|levar (algum |algum outro )?(exame|documento|documentos)|que documentos?)\b/],
];
/** "??", "tá aí?", "tem alguém?": o paciente só está chamando. */
const PING = /^(\?+|oi+\s*\?+|ola\s*\?+|alo\s*\??|ta ai\s*\??|tem alguem( ai)?\s*\??|cade\s*\??|voce (esta|ta) ai\s*\??|e entao\s*\??|ei\s*\??|hello\s*\??)[\s!.?]*$/;
const PING_SAUDACAO = /^(oi+|ola|bom dia|boa tarde|boa noite)[\s!.?]*$/;
function detectaFaq(t: string, emAtendimento: boolean): Faq | undefined {
  if (PING.test(t) || (emAtendimento && PING_SAUDACAO.test(t))) return 'ping';
  return FAQ.find(([, re]) => re.test(t))?.[0];
}
/** Ordem de prioridade já vem da lista acima. */
const TROCA_DIA = /\b(outro|outra|mudar|trocar|alterar)\s+(o\s+|a\s+)?(dia|data|horario|turno|periodo)\b|\bnao (posso|consigo|da)\s+(nesse|neste|nessa|nesta|no)\s+(dia|data|horario)\b/;

/** CPF com os dois dígitos verificadores corretos (e não todos iguais). */
export function cpfValido(cpf: string): boolean {
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => { let soma = 0; for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i); const r = (soma * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

/** O paciente citou um(a) médico(a) que aparece nos horários ("com a Fernanda", "com o Armando")? Devolve o nome, se for só um. */
function medicoDaLista(t: string, slots: Slot[]): string | undefined {
  const nomes = [...new Set(slots.map((x) => x.profissional).filter((x): x is string => Boolean(x)))];
  const palavras = t.split(/[^a-z]+/).filter((w) => w.length >= 4);
  const achados = nomes.filter((n) => norm(n).split(/\s+/).some((p) => p.length >= 4 && palavras.some((w) => w === p || (w.length >= 5 && p.startsWith(w)))));
  return achados.length === 1 ? achados[0] : undefined;
}

// ---------- escolha do horário: entende o jeito de falar ----------
/** O que o paciente quer fazer com os horários: o mais rápido, o último, outros dias, a partir de uma data, até uma data, uma hora. */
export type IntLista = { primeiro?: boolean; ultimo?: boolean; mais?: boolean; apartir?: string; ate?: string; hora?: number; sim?: boolean };

/** "o mais rápido possível", "a próxima", "qualquer um", "tanto faz", "o que tiver", "o primeiro disponível"... */
const R_PRIMEIRO: RegExp[] = [
  /\bmais (rapid[oa]|cedo|proxim[oa]|perto|breve)\b/, /\b(a|o) proxim[oa]\b(?!\s+(semana|mes))/, /\bproxim[oa] (disponivel|vaga|data|horario|dia)\b/,
  /\bprimeir[oa] (disponivel|vaga|data|horario|dia)\b/, /\bqualquer (um|uma|dia|horario|data|vaga|hora)\b/, /^\s*qualquer\b/, /\btanto faz\b/,
  /\b(o|a) que (voce |vcs )?(tiver|tem|der|estiver|houver)\b/, /\bquanto antes\b/, /\bassim que possivel\b/, /\burgente\b/, /\basap\b/, /\blogo que possivel\b/,
];
export const querPrimeiro = (t: string) => R_PRIMEIRO.some((re) => re.test(t));

const NUM_EXT: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7 };
/** "25" -> data do dia 25 (neste mês, ou no próximo se já passou; só se o dia existe). */
function ymdDoDia(dia: number, hymd: string): string | undefined {
  if (dia < 1 || dia > 31) return undefined;
  let ano = Number(hymd.slice(0, 4)); let mes = Number(hymd.slice(5, 7));
  const mk = (a: number, m: number) => `${a}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  let ymd = mk(ano, mes);
  if (ymd < hymd) { mes += 1; if (mes > 12) { mes = 1; ano += 1; } ymd = mk(ano, mes); }
  return toDate(ymd).getUTCDate() === dia ? ymd : undefined;
}

/**
 * Lê, no texto do paciente, o que ele quer fazer com os horários. `tamanhoLista` = quantas opções estão na tela
 * ("outro dia" só faz sentido com uma lista; "sim" só escolhe quando há uma única opção).
 */
export function lerIntencao(t: string, ctx: Ctx, tamanhoLista = 0): IntLista | undefined {
  const h = hoje(ctx); const dow = diaSemana(h.ymd);
  const r: IntLista = {};
  if (querPrimeiro(t)) r.primeiro = true;
  if (/\b(ultim[oa]|mais (longe|distante|tarde)|a mais longe)\b/.test(t)) r.ultimo = true;
  if (/\b(semana que vem|proxima semana|semana seguinte)\b/.test(t)) r.apartir = addDias(h.ymd, ((1 - dow + 7) % 7) || 7); // próxima segunda
  else if (/\b(mes que vem|proximo mes)\b/.test(t)) { const [a, m] = [Number(h.ymd.slice(0, 4)), Number(h.ymd.slice(5, 7))]; r.apartir = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`; }
  const dsem = (x: string) => { const e = SEMANA.find(([re]) => re.test(x)); return e ? e[1] : undefined; };
  const ap = t.match(/\b(a partir|depois|apos)\s+(?:d[aoe]s?\s+)?(?:dia\s+)?(\d{1,2})\b(?![\/.-]\d)/);
  const apS = t.match(/\b(a partir|depois|apos)\s+(?:d[aoe]s?\s+)?(segunda|terca|quarta|quinta|sexta|sabado|domingo)/);
  if (ap) { const y = ymdDoDia(Number(ap[2]), h.ymd); if (y) r.apartir = ap[1] === 'a partir' ? y : addDias(y, 1); }
  else if (apS) { const d0 = dsem(apS[2]); if (d0 !== undefined) { let n = (d0 - dow + 7) % 7; if (n === 0) n = 7; const y = addDias(h.ymd, n); r.apartir = apS[1] === 'a partir' ? y : addDias(y, 1); } }
  if (/\bate depois de amanha\b/.test(t)) r.ate = addDias(h.ymd, 2);
  else if (/\bate amanha\b/.test(t)) r.ate = addDias(h.ymd, 1);
  else if (/\bate hoje\b/.test(t)) r.ate = h.ymd;
  const at = t.match(/\b(ate|antes d[aoe]s?)\s+(?:o\s+)?(?:dia\s+)?(\d{1,2})\b(?![\/.-]\d)/);
  if (at) { const y = ymdDoDia(Number(at[2]), h.ymd); if (y) r.ate = at[1] === 'ate' ? y : addDias(y, -1); }
  else if (/\b(essa|esta) semana\b/.test(t)) r.ate = addDias(h.ymd, (7 - dow) % 7);
  const dq = t.match(/\b(?:daqui a|daqui|dentro de|em)\s+(\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete)\s+(dias?|semanas?)\b/);
  if (dq) { const nn = /^\d+$/.test(dq[1]) ? Number(dq[1]) : NUM_EXT[dq[1]]; r.apartir = addDias(h.ymd, nn * (dq[2].startsWith('semana') ? 7 : 1)); }
  if (tamanhoLista > 0 && /\b(outr[oa]s?\s*(dias?|datas?|horarios?|opcoes|vagas)?|mais\s+(opcoes|datas|horarios|vagas|dias)|tem mais|nenhum[a]? (desses|dessas|serve)|nao (serve|da|posso))\b/.test(t)) r.mais = true;
  const hr = t.match(/\b(\d{1,2})\s*(?:h\b|horas?\b)/) ?? t.match(/\bas\s+(\d{1,2})\b(?!\s*(?:de|\/))/) ?? t.match(/\b(\d{1,2}):\d{2}\b/);
  if (hr && Number(hr[1]) <= 23) r.hora = Number(hr[1]);
  if (tamanhoLista === 1 && SIM.test(t)) r.sim = true;
  return Object.keys(r).length ? r : undefined;
}
/** Hora cheia do início ("08:00" -> 8). */
const horaCheia = (inicio: string) => Number(inicio.slice(0, 2));

/** Marca do texto que informa as unidades (a dúvida "quais unidades?" não repete o que já foi dito). */
const MARCA_UNIDADES = 'Tenho sim!';
/** Onde e com quem: "Tenho sim! No Guamá com a Dra. Giovanna e a Dra. Ebenezaide, e no Telégrafo com a Dra. Ebenezaide." Os nomes saem com Dr./Dra. */
function textoUnidades(sv: Servico, modo: 'resposta' | 'duvida'): string {
  const exib = nomesExib(sv.unidades.flatMap((u) => u.profissionais ?? []));
  // com profissional pedido pelo nome, a frase do serviço já diz "com a Dra. X": não repete
  const medicos = (u: Unidade) => (!sv.profissional && u.profissionais?.length ? ` com ${juntar(u.profissionais.map((x) => exib.get(x) ?? x))}` : '');
  const trechos = sv.unidades.map((u) => `no ${u.nome}${medicos(u)}`);
  const corpo = trechos.length === 1 ? trechos[0] : trechos.join(sv.unidades.some((u) => medicos(u)) ? ', e ' : ' e ');
  return modo === 'resposta' ? `${MARCA_UNIDADES} ${cap(corpo)}.` : `${cap(sv.frase)} tem agenda ${corpo}.`;
}

// ---------- núcleo ----------
export async function step(prev: State, texto: string, ctx: Ctx, fonte: Fonte, n = 0): Promise<Result> {
  // depois de uma jornada concluída, uma nova mensagem abre outra jornada (mantém a saudação já feita)
  const s: State = prev.fim ? { ...novoEstado(), saudou: true } : { ...prev, cad: { ...prev.cad } };
  const base = prev.fim ? s : prev;
  const t = norm(texto.replace(TOKEN_MIDIA, ' '));
  // para achar o serviço, "o mais rápido possível", "a próxima"... saem do texto (senão "rápido" casa com "Teste Rápido de Gravidez")
  const tBusca = t.replace(/\b(?:o |a )?mais (?:rapid[oa]|cedo|proxim[oa]|perto|breve)(?: possivel)?\b|\b(?:quanto antes|assim que possivel|logo que possivel|a proxima|urgente)\b|\b(?:depois de amanha|amanha|hoje|(?:de|pela|na) manha|(?:de|na|a) tarde|(?:de|na|a) noite|semana que vem|mes que vem)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const h = hoje(ctx);
  const nome = ctx.nome;
  const nomeOk = /^[\p{L}]{2,20}$/u.test(nome ?? '') ? nome : '';
  const abertura = s.saudou ? '' : `Oi${nomeOk ? ` ${nomeOk}` : ''}, ${SAUDACAO(h.hora).toLocaleLowerCase('pt-BR')}! Aqui é a Amanda, da Clinex.`;
  // Dúvida no meio do fluxo (horário, valor, médicos...): a resposta vem ANTES da pergunta que o fluxo já ia fazer,
  // então o paciente tem a informação e a conversa segue do mesmo ponto, sem se perder.
  const faq = detectaFaq(t, Boolean(s.servico));
  const nomesUnFaq = faq === 'unidades' ? await fonte.nomesUnidades() : [];
  const esperandoPix = () => s.pagamento === 'pix' && s.pixEnviado && !s.pagFinal && Boolean(s.slot);
  const prefixoFaq = (reply: string): string => {
    if (!faq) return '';
    const sv = s.servico;
    const EQUIPE = ' Se quiser é só me pedir que eu chamo alguém da equipe.';
    switch (faq) {
      case 'ping': return s.saudou ? 'Tô aqui!' : '';
      case 'horario': return env.clinicHorario;
      case 'preco':
        if (!sv || esperandoPix()) return '';
        // sem preço cadastrado: não inventa nem fala "zero"; a equipe confirma
        if (!sv.precoTexto) return `O valor desse atendimento eu prefiro que a equipe confirme certinho pra você.${EQUIPE}`;
        return reply.includes(sv.precoTexto) ? '' : sv.precoTexto;
      case 'pagto': return esperandoPix() || reply.includes(MARCA_PAGAMENTO) ? '' : 'Dá pra antecipar por pix (eu te passo a chave) ou por link de crédito. Ou então pagar na recepção no dia do atendimento.';
      case 'medicos':
      case 'unidades': {
        if (!sv) return faq === 'unidades' && nomesUnFaq.length ? `Temos as unidades ${nomesUnFaq.join(' e ')}.` : '';
        if (reply.includes(MARCA_UNIDADES)) return '';
        return textoUnidades(sv, 'duvida');
      }
      // o que eu não sei com segurança, não invento: a equipe confirma
      case 'endereco': return `Endereço e como chegar eu prefiro que a equipe te passe certinho pra não te falar nada errado.${EQUIPE}`;
      case 'convenio': return `Sobre convênios a equipe confirma direitinho pra você e assim ninguém te passa informação errada.${EQUIPE}`;
      case 'preparo': return `Sobre preparo e o que levar a equipe te orienta certinho pro seu atendimento.${EQUIPE}`;
    }
  };
  /** Põe a resposta da dúvida depois da saudação de abertura (se houver) e antes do resto. */
  const comFaq = (reply: string): string => {
    const pre = prefixoFaq(reply);
    if (!pre) return reply;
    if (abertura && reply.startsWith(abertura)) {
      const resto = reply.slice(abertura.length);
      return `${abertura}${resto.startsWith('\n') ? '\n' : ' '}${pre}\n\n${resto.trimStart()}`;
    }
    return `${pre}\n\n${reply}`;
  };
  const out = (reply: string, handoff?: Handoff): Result => { s.saudou = true; return { state: s, reply: handoff ? reply : comFaq(reply), handoff }; };
  const comAbertura = (txt: string) => (abertura ? `${abertura}\n${txt}` : txt);
  const partes: string[] = [];
  if (abertura) partes.push(abertura);
  const dizer = (...txt: string[]) => out([...partes, ...txt].join(abertura && partes.length === 1 && txt.length === 1 && !txt[0].includes('\n') ? ' ' : '\n'));
  /**
   * Serviço novo ou trocado: refaz unidade, dia e pagamento. O paciente (CPF, cadastro) é o mesmo e fica. Se ainda não havia serviço
   * (`primeiraVez`), o que ele adiantou (dia, período, "o mais rápido") fica para valer no serviço que acabou de ser entendido.
   */
  const reiniciaDepoisDoServico = (primeiraVez = false) => {
    const adiantado = primeiraVez ? { data: s.data, turno: s.turno, rapido: s.rapido, apartir: s.apartir } : {};
    s.confirmPerguntado = false; s.servicoConfirmado = false; s.unidadesInformadas = false; s.unidade = undefined;
    s.lista = undefined; s.data = undefined; s.turno = undefined; s.slot = undefined; s.rapido = undefined; s.apartir = undefined;
    if (!primeiraVez) s.preUnidade = undefined;
    s.pagPerguntado = false; s.pagamento = undefined; s.pixEnviado = false; s.pagFinal = false; s.compTent = 0; s.comprovante = undefined; s.pagoPix = undefined; s.transacoes = undefined;
    Object.assign(s, adiantado);
  };
  /** Guarda o que o paciente adiantou antes de dizer o serviço (dia, período, unidade, "o mais rápido", forma de pagamento). Devolve o que anotou ('' = nada). */
  const guardaAdiantado = async (): Promise<string> => {
    if (faq) return '';
    const un = (await fonte.nomesUnidades()).find((u) => t.includes(norm(u)));
    if (un) s.preUnidade = un;
    const it = lerIntencao(t, ctx);
    if (it?.primeiro) s.rapido = true;
    if (it?.apartir) s.apartir = it.apartir;
    const d = it ? undefined : lerData(t, ctx);
    if (d) s.data = d;
    const tn = lerTurno(t);
    if (tn && tn !== 'noite') s.turno = tn;
    const pg = pagamentoAdiantado(t); if (pg) s.pagPref = pg;
    const horario = [d ? dataFalada(d, h.ymd) : '', tn && tn !== 'noite' ? periodoTxt(tn) : ''].filter(Boolean).join(' ');
    const anotou = [horario, un ? `no ${un}` : '', it?.primeiro ? 'o horário mais rápido' : '', it?.apartir ? `a partir de ${dataFalada(it.apartir, h.ymd)}` : ''].filter(Boolean);
    return anotou.length ? `Anotei ${juntar(anotou)}.` : pg ? 'Anotado!' : '';
  };

  // 1) segurança primeiro
  if (CRISE.test(t)) {
    return out(`Sinto muito que você esteja passando por isso${nome ? `, ${nome}` : ''}. Vou te colocar agora com alguém da nossa equipe para te ajudar. Se precisar conversar com alguém neste momento, o CVV atende 24 horas pelo 188, a ligação é gratuita. Você não precisa passar por isso sozinho.`, { motivo: 'PRIORIDADE: urgente. Paciente relatou possível crise de saúde mental.', urgente: true });
  }
  if (EMERGENCIA.test(t)) {
    return out(`${nome ? `${nome}, pelo` : 'Pelo'} que você descreveu, isso precisa de avaliação imediata. Por favor, procure agora o pronto-socorro mais próximo ou ligue 192. A Clinex faz atendimento agendado e não é o lugar certo para uma urgência. Fico à disposição depois, tá bem?`, { motivo: 'PRIORIDADE: urgente. Possível emergência clínica relatada pelo paciente.', urgente: true });
  }
  if (HUMANO.test(t)) {
    return out(comAbertura('Claro! Vou chamar alguém da equipe pra te ajudar. Só um instante.'), { motivo: 'Paciente pediu atendimento humano.' });
  }

  // 1b) logo depois de um agendamento concluído: agradecimento, "só isso" ou novo pedido
  if (s.pos) {
    const p = posAgendamento(s.pos, t);
    if (p === 'silencio') { s.saudou = true; return { state: s, reply: '', silencio: true }; }
    if (p !== 'seguir') { s.pos = p.pos; return out(p.reply); }
    s.pos = undefined;
  }

  // 1c) imagem/arquivo: só interessa como comprovante de pix, quando estamos esperando um
  const midia = texto.match(TOKEN_MIDIA);
  const aguardandoComprovante = s.pagamento === 'pix' && s.pixEnviado && !s.pagFinal && Boolean(s.slot);
  if (midia && !aguardandoComprovante && !t) return out(comAbertura('Recebi o arquivo, mas só leio texto e áudio por aqui. Pode me escrever?'));

  // 2) serviço: escolha entre opções pendentes, ou descoberta na fonte
  // o paciente voltou para retomar um atendimento que ficou pela metade (e não citou o serviço)
  if (!s.servico && !s.opcoes && RETOMAR.test(t) && !RAIZES.some((x) => x.re.test(t))) {
    return out(comAbertura('Que bom que você voltou! Vamos retomar o seu agendamento. Qual consulta ou exame você precisa?'));
  }
  // CPF dito antes da hora ("meu cpf é ..."): guarda, para não perguntar de novo quando chegar a vez dele
  if (!s.cpf && !faq && !(base.slot && base.pagFinal) && (/\bcpf\b/.test(t) || /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/.test(t))) { const c = cpfDoTexto(t); if (c && cpfValido(c)) s.cpf = c; }
  // o que o paciente adiantou antes de dizer o serviço (dia, período, unidade, "o mais rápido", forma de pagamento) fica guardado
  const adiantou = !s.servico && !s.opcoes ? await guardaAdiantado() : '';
  let mudouServico = false;
  const aplicar = (d: Awaited<ReturnType<Fonte['descobrir']>>): Result | undefined => {
    if (!d) return undefined;
    if ('semAgenda' in d) return out(comAbertura(`Poxa, no momento não tenho vaga aberta pra ${d.semAgenda}. Vou chamar alguém da equipe pra conferir e te retornar.`), { motivo: `Sem vagas abertas na agenda para ${d.semAgenda}.` });
    // serviço pedido e não encontrado: diz com franqueza e oferece a equipe (só transfere se ele aceitar)
    if ('naoAchouServico' in d) {
      if (s.servico) return undefined; // já está em um atendimento: ignora a menção
      s.ofereceuEquipe = d.naoAchouServico;
      return out(comAbertura(`Não achei ${d.naoAchouServico} pra agendar por aqui. Quer que eu chame alguém da equipe pra te ajudar?`));
    }
    // pediu uma pessoa pelo nome ("com a dra Rebecca") e não há ninguém assim com agenda: não transfere, pede mais um dado
    if ('naoAchouProfissional' in d) return out(comAbertura(`Não achei ${d.naoAchouProfissional} entre os profissionais que têm agenda aberta. Pode me dizer o sobrenome ou a especialidade que você procura?`));
    if ('semAgendaProfissional' in d) {
      const x = d.semAgendaProfissional;
      const quem = cap(exibir(x.nome, { artigo: true }));
      if (x.alternativa) {
        // oferece a mesma especialidade com outros profissionais e segue o fluxo normal (confirmar o serviço)
        const primeira = !s.servico;
        s.servico = x.alternativa; s.opcoes = undefined; reiniciaDepoisDoServico(primeira); mudouServico = true;
        partes.push(`${quem} não tem horário aberto nos próximos dias. Mas tenho ${x.alternativa.frase} com outros profissionais.`);
        return undefined;
      }
      return out(comAbertura(`${quem} não tem horário aberto nos próximos dias. Me diz a especialidade ou o exame que você precisa que eu vejo as outras opções.`));
    }
    if ('opcoes' in d) { s.opcoes = d.opcoes; s.servico = undefined; return undefined; }
    const atual = s.servico;
    if (atual && d.servico.id === atual.id && d.servico.profissional && d.servico.profissional.id !== atual.profissional?.id) {
      // a mesma consulta, agora com a médica ou o médico que ele pediu pelo nome: mantém o que já foi combinado e refaz só os horários
      const nomeUn = s.unidade?.nome;
      s.ofereceuEquipe = undefined; s.servico = d.servico; s.opcoes = undefined; mudouServico = true;
      s.unidadesInformadas = false; s.lista = undefined; s.slot = undefined; s.data = undefined; s.turno = undefined;
      s.unidade = nomeUn ? d.servico.unidades.find((u) => norm(u.nome) === norm(nomeUn)) : undefined;
      if (!s.pagFinal && !s.pagamento) s.pagPerguntado = false;
      partes.push(`Beleza, vou olhar os horários com ${exibir(d.servico.profissional.nome, { artigo: true })}.`);
    } else if (d.servico.id !== atual?.id || d.servico.profissional?.id !== atual?.profissional?.id) {
      const primeira = !atual;
      s.ofereceuEquipe = undefined; s.servico = d.servico; s.opcoes = undefined; reiniciaDepoisDoServico(primeira); mudouServico = true;
    }
    return undefined;
  };
  // 2b) mudou de ideia antes de informar o CPF: outro serviço, outra unidade ou outro dia/horário. Ajusta e segue, sem recomeçar.
  if (s.servico && s.slot && !s.cpf) {
    let trocou = false;
    if (RAIZES.some((x) => x.re.test(t)) || PEDE_PESSOA.test(t)) {
      const d = await fonte.descobrir(tBusca, false);
      // outro serviço, ou o mesmo com a médica/o médico que ele pediu pelo nome
      if (d && 'servico' in d && (d.servico.id !== s.servico.id || (d.servico.profissional && d.servico.profissional.id !== s.servico.profissional?.id))) {
        const r = aplicar(d); if (r) return r; trocou = true;
        partes.push('Sem problema, vamos ajustar.');
      }
    }
    if (!trocou) {
      const outra = (await fonte.nomesUnidades()).find((u) => t.includes(norm(u)) && norm(u) !== norm(s.unidade?.nome ?? ''));
      const outraUn = outra ? s.servico.unidades.find((u) => norm(u.nome) === norm(outra)) : undefined;
      const outroDia = !esperandoPix() && TROCA_DIA.test(t);
      if (outraUn || outroDia) {
        if (outraUn) {
          s.unidade = outraUn;
          if (!s.pagFinal) { s.pagamento = undefined; s.pixEnviado = false; s.pagoPix = undefined; s.transacoes = undefined; s.comprovante = undefined; } // o valor pode ser outro na outra unidade
        }
        s.slot = undefined; s.lista = undefined; s.data = undefined; s.turno = undefined;
        if (!s.pagFinal && !s.pagamento) s.pagPerguntado = false; // pergunta o pagamento de novo, já com o novo horário
        partes.push(pick(['Sem problema, vamos ajustar.', 'Tranquilo, a gente ajusta.'], n));
      }
    }
  }
  if (!s.slot) {
    if (s.opcoes && !s.servico) {
      const idx = lerEscolha(t, s.opcoes.length);
      let escolhida: { id: string; nome: string } | undefined = s.opcoes[idx];
      if (!escolhida) {
        // não foi "1", "2"...: pode ser um pedido NOVO ("teste ergométrico") ou o nome de uma das opções. Pedido novo primeiro:
        // senão a palavra genérica "teste" casaria com a primeira opção ("Dengue Igg, Teste Rápido").
        const novo = await fonte.descobrir(tBusca, !faq && !(SO_CUMPRIMENTO.test(t) && !/\bteste\b/.test(t)));
        if (novo && ('servico' in novo || 'opcoes' in novo || 'semAgendaProfissional' in novo)) { const r = aplicar(novo); if (r) return r; }
        else {
          const GENERICAS = new Set(['teste', 'exame', 'consulta', 'rapido', 'total']);
          escolhida = s.opcoes.find((o) => norm(o.nome).split(/[^a-z]+/).filter((w) => w.length > 3 && !GENERICAS.has(w)).some((w) => t.includes(w)));
          if (!escolhida && novo) { const r = aplicar(novo); if (r) return r; }
        }
      }
      if (escolhida) { const r = aplicar(await fonte.resolver(escolhida.id)); if (r) return r; }
    } else {
      // dúvida ("funciona sábado?", "qual o horário de atendimento?"): sem busca solta por palavras, para não "achar" um serviço sem querer
      const soSaudacao = SO_CUMPRIMENTO.test(t) && !/\bteste\b/.test(t); // "oi", "bom dia": não procura serviço; "teste" pode ser o começo de "teste ergométrico"
      const r = aplicar(await fonte.descobrir(tBusca, !s.servico && !faq && !soSaudacao));
      if (r) return r;
    }
  }

  // 3) sem serviço: recepção
  if (!s.servico) {
    if (s.opcoes) {
      const lista = s.opcoes.map((o, i) => `${i + 1}. ${o.nome}`).join('\n');
      return out(comAbertura(`Achei estas opções:\n${lista}\nQual delas você precisa?${s.opcoes.length >= 5 ? ' Se não for nenhuma dessas me diz o nome completo.' : ''}`));
    }
    // ela ofereceu chamar a equipe para um serviço que não achou: "sim" transfere; "não" volta ao começo
    if (s.ofereceuEquipe) {
      const termo = s.ofereceuEquipe;
      if (SIM.test(t)) return out('Combinado! Vou chamar alguém da equipe pra te ajudar com isso. Já deixei tudo anotado. Só um instante.', { motivo: `Paciente quer agendar "${termo}", que não aparece como disponível para agendamento pelo chatbot. Conferir no Clinilink se o procedimento está liberado ("Agendamento via chatbot") ou agendar manualmente.` });
      s.ofereceuEquipe = undefined;
      if (NAO.test(t)) return out('Sem problema. Qual outra consulta ou exame você precisa?');
    }
    // dúvida ou "??" antes de ter serviço: responde (a resposta entra pelo out) e pergunta o que ele precisa, sem contar como "não entendi"
    if (faq) return out(comAbertura(faq === 'preco' ? 'Pra te passar o valor certinho preciso saber qual consulta ou exame você quer. Qual é?' : faq === 'ping' ? 'Qual consulta ou exame você precisa?' : 'Posso te ajudar a agendar sim. Qual consulta ou exame você precisa?'));
    // o paciente voltou para retomar um atendimento que ficou pela metade
    if (RETOMAR.test(t)) return out(comAbertura('Que bom que você voltou! Vamos retomar o seu agendamento. Qual consulta ou exame você precisa?'));
    // adiantou o dia, o período, a unidade ou a forma de pagamento antes de dizer o serviço: anota e pergunta o serviço
    if (adiantou) return out(comAbertura(`${adiantou} Qual consulta ou exame você precisa?`));
    const cumprimento = SO_CUMPRIMENTO.test(t);
    if (!cumprimento && !NAO.test(t)) s.falhas += 1;
    if (!s.saudou && cumprimento) return out(`${abertura} Me conta o que você precisa?`);
    if (cumprimento) return out('Qual consulta ou exame você precisa?');
    if (NAO.test(t) && prev.confirmPerguntado === false && base.servico === undefined && s.saudou && !abertura) return out('Sem problema. Qual consulta ou exame você precisa?');
    // quer agendar mas não disse o quê: pergunta com simpatia (na terceira vez, lembra que pode chamar a equipe)
    if (s.falhas < 2 && /\b(marcar|agendar|agendamento|marcacao|consulta|exame|atendimento)\b/.test(t)) return out(comAbertura('Claro! Qual consulta ou exame você precisa?'));
    // não transfere sozinha por não entender: pede de outro jeito e, se ele insistir, lembra que pode chamar a equipe
    return out(comAbertura(s.falhas >= 2
      ? 'Ainda não consegui entender o que você precisa. Pode me dizer a especialidade (cardiologia, dermatologia, ginecologia, ultrassom...) o nome do exame ou o nome do médico? Se preferir falar com a equipe é só me pedir.'
      : 'Hmm não peguei qual é o serviço. Me diz a especialidade ou o exame? Pode ser o nome do médico também.'));
  }
  const sv = s.servico;

  // 4) sugere o serviço e espera a confirmação do paciente
  if (!s.servicoConfirmado) {
    // já perguntamos antes e o serviço não mudou nesta mensagem: o paciente está respondendo
    if (s.confirmPerguntado && !mudouServico) {
      if (SIM.test(t)) { s.servicoConfirmado = true; }
      else if (NAO.test(t)) { s.servico = undefined; s.opcoes = undefined; reiniciaDepoisDoServico(); return out('Sem problema. Qual consulta ou exame você precisa?'); }
    }
    if (!s.servicoConfirmado) {
      s.confirmPerguntado = true;
      // guarda desde já o que o paciente adiantou (unidade, dia, período) para não perguntar de novo
      const unAdiantada = (await fonte.nomesUnidades()).find((u) => t.includes(norm(u)));
      if (unAdiantada) { const u = sv.unidades.find((x) => norm(x.nome) === norm(unAdiantada)); if (u) s.unidade = u; }
      const iAd = faq ? undefined : lerIntencao(t, ctx); // "o mais rápido possível", "semana que vem"...: guarda para quando chegar a hora dos horários
      if (iAd?.primeiro) s.rapido = true;
      if (iAd?.apartir) s.apartir = iAd.apartir;
      const dAd = iAd || faq ? undefined : lerData(t, ctx); const tAd = faq ? undefined : lerTurno(t);
      if (dAd) s.data = dAd;
      if (tAd && tAd !== 'noite') s.turno = tAd;
      const pgAd = faq ? undefined : pagamentoAdiantado(t); if (pgAd) s.pagPref = pgAd;
      const seguranca = sv.viaSintoma ? ' Se a dor estiver forte ou vier com falta de ar, procure agora o pronto-socorro mais próximo ou ligue 192.' : '';
      const pergunta = s.confirmPerguntado && prev.confirmPerguntado && !mudouServico
        ? pick([`Só pra confirmar: é ${sv.frase}, né?`, `Então é ${sv.frase}, certo?`], n)
        : sv.viaSintoma ? `Pelo que você contou, o serviço indicado é ${sv.frase}.${seguranca} É isso que você precisa?` : pick([`Ah, então é ${sv.frase}, né?`, `Entendi, você quer ${sv.frase}, é isso?`], n);
      return dizer(pergunta);
    }
  }

  // 5) a partir daqui o serviço está confirmado; extrai unidade, dia e período citados
  let aviso = '';
  let intencao: IntLista | undefined; // o que o paciente quer fazer com os horários (lido no passo 5, aplicado no passo 7)
  let entendeuHorario = false; // alguma coisa da resposta foi entendida (unidade, posição, data, período, intenção)
  if (!s.slot) {
    const nomesUn = await fonte.nomesUnidades();
    const unCitada = nomesUn.find((u) => t.includes(norm(u)));
    if (unCitada) entendeuHorario = true;
    if (unCitada) {
      const ok = sv.unidades.find((u) => norm(u.nome) === norm(unCitada));
      if (ok) s.unidade = ok;
      else aviso = `Pra ${sv.frase} eu não tenho agenda no ${unCitada}.`;
    }
    // unidade citada antes de o serviço ser conhecido
    if (!s.unidade && s.preUnidade) {
      const ok = sv.unidades.find((u) => norm(u.nome) === norm(s.preUnidade!));
      if (ok) s.unidade = ok; else if (!aviso) aviso = `Pra ${sv.frase} eu não tenho agenda no ${s.preUnidade}.`;
      s.preUnidade = undefined;
    }
    // o que ele quer fazer com os horários ("o mais rápido", "semana que vem", "depois do dia 25", "outro dia"...)
    intencao = lerIntencao(t, ctx, s.lista?.length ?? 0);
    if (intencao?.primeiro && !s.lista?.length) s.rapido = true;
    if (intencao?.apartir && !s.lista?.length) s.apartir = intencao.apartir;
    // sem preferência de unidade ("tanto faz", "a que tiver mais cedo"): a unidade com o horário mais próximo
    if (!s.unidade && sv.unidades.length > 1 && (intencao?.primeiro || /tanto faz|qualquer|a mais proxima|o mais proximo/.test(t))) {
      const cand = await Promise.all(sv.unidades.map(async (u) => ({ u, p: (await fonte.proximas(sv, u, s.apartir ?? addDias(h.ymd, 1), 1))[0] })));
      const melhor = cand.filter((x) => x.p).sort((a, b) => (a.p!.ymd + a.p!.inicio).localeCompare(b.p!.ymd + b.p!.inicio))[0];
      s.unidade = melhor?.u ?? sv.unidades[0];
    }
    if (!s.unidade && sv.unidades.length === 1) s.unidade = sv.unidades[0];
    const posicao = s.lista?.length ? lerEscolha(t, s.lista.length) : -1;
    const escolhaLista = posicao >= 0 && posicao < (s.lista?.length ?? 0) ? posicao : -1; // posição que não existe na lista não é escolha
    // "22", "dia 22", "22 de outubro" com a lista na tela: é o dia do mês (um número que não é posição da lista)
    const soDia = s.lista?.length && escolhaLista < 0 && !intencao ? t.match(/^\s*(?:o\s+)?(?:dia\s+)?(\d{1,2})(?:\s+de\s+[a-z]+)?\s*$/) : null;
    const tn = lerTurno(t); const d = escolhaLista >= 0 || intencao ? undefined : (soDia ? ymdDoDia(Number(soDia[1]), h.ymd) : undefined) ?? lerData(t, ctx);
    if (d) { s.data = d; s.lista = undefined; }
    if (tn === 'noite') aviso = aviso || 'A gente atende de manhã e à tarde.';
    else if (tn && escolhaLista < 0 && !intencao) { s.turno = tn; s.lista = undefined; }
    else if (tn && intencao && !s.lista?.length) s.turno = tn; // "o mais rápido de manhã" antes da lista: guarda o período
    if (escolhaLista >= 0 || intencao || d || (tn && tn !== 'noite')) entendeuHorario = true;
  }

  // 6) informa as unidades com agenda (e o médico de cada uma) antes de perguntar qualquer coisa
  await prepararGeneros([...sv.unidades.flatMap((u) => u.profissionais ?? []), sv.profissional?.nome]); // Dr./Dra. dos nomes que vão aparecer
  if (aviso) partes.push(aviso);
  if (!s.unidadesInformadas) {
    s.unidadesInformadas = true;
    // "Tenho sim! No Guamá com a Dra. Giovanna e a Dra. Ebenezaide, e no Telégrafo com a Dra. Ebenezaide. A consulta é R$ 150,00."
    // se ele já escolheu a unidade, fala só dela
    partes.push(`${textoUnidades(s.unidade ? { ...sv, unidades: [s.unidade] } : sv, aviso ? 'duvida' : 'resposta')}${sv.precoTexto ? ` ${sv.precoTexto}` : ''}`);
  }
  if (!s.unidade) {
    const quais = sv.unidades.length === 2 ? 'dos dois' : 'deles';
    return dizer(base.unidadesInformadas ? `Qual ${quais} você prefere: ${sv.unidades.map((u) => u.nome).join(' ou ')}?` : `Qual ${quais} fica melhor pra você?`);
  }
  const un = s.unidade;
  const comMedico = (un.profissionais?.length ?? 0) > 1;
  // a lista que estava na tela só vale se o serviço/médico não mudou nesta mensagem (senão ela já foi refeita)
  const listaAnterior = mudouServico ? undefined : base.lista;

  // 7) dia e período: o paciente escolhe da lista (número) ou diz a data
  const alternativas = async (de: string, filtro?: Periodo) => {
    const todas = await fonte.proximas(sv, un, de, 8);
    await prepararGeneros(todas.map((x) => x.profissional));
    return (filtro ? todas.filter((x) => x.turno === filtro) : todas).slice(0, 4);
  };
  let escolhaDireta = ''; // "o mais rápido que tenho é ...": ela escolheu o horário pelo pedido do paciente (não por número)
  const escolher = (x: Slot, direta = '') => { s.slot = x; s.data = x.ymd; s.turno = x.turno; s.lista = undefined; s.rapido = undefined; s.apartir = undefined; escolhaDireta = direta; };
  /** Aplica o que o paciente quer fazer com os horários: escolhe o mais rápido/último, filtra (até uma data, período, hora) ou mostra outras opções. */
  const aplicarIntencao = async (it: IntLista): Promise<Result | undefined> => {
    const tp = lerTurno(t); const turnoPedido = tp && tp !== 'noite' ? tp : s.turno;
    const naTela = s.lista?.length ? s.lista : undefined;
    let pool: Slot[];
    if (naTela && !it.apartir && !it.mais) pool = [...naTela];
    else pool = await fonte.proximas(sv, un, it.apartir ?? (it.mais && naTela ? addDias(naTela[naTela.length - 1].ymd, 1) : (s.apartir ?? addDias(h.ymd, 1))), 12);
    await prepararGeneros(pool.map((x) => x.profissional));
    if (it.ate) pool = pool.filter((x) => x.ymd <= it.ate!);
    if (turnoPedido) pool = pool.filter((x) => x.turno === turnoPedido);
    if (it.hora != null) pool = pool.filter((x) => [it.hora!, it.hora! + 12].includes(horaCheia(x.inicio)));
    if (pool.length === 0) {
      // nada com esse pedido: diz o que pediu e mostra o que existe
      const pediu = [it.ate ? `até ${dataFalada(it.ate, h.ymd)}` : '', turnoPedido ? periodoTxt(turnoPedido) : '', it.hora != null ? `às ${it.hora}h` : ''].filter(Boolean).join(' ');
      const alt = await alternativas(it.apartir ?? s.apartir ?? addDias(h.ymd, 1));
      if (alt.length === 0) return out([...partes, 'No momento não vejo vagas abertas. Vou chamar alguém da equipe pra conferir e te retornar.'].join('\n'), { motivo: `Sem vagas para ${sv.nome} no ${un.nome}.` });
      s.lista = alt;
      return dizer(`${pediu ? `Não tenho horário ${pediu}. ` : ''}Mas consegui estes aqui:\n${numerada(alt, comMedico, h.ymd)}\nQual desses fica bom pra você?`);
    }
    if (it.primeiro || (s.rapido && !naTela)) { escolher(pool[0], `O mais rápido que tenho é ${slotFalado(pool[0], !sv.profissional, h.ymd)}. Já separo esse pra você.`); return undefined; }
    if (it.ultimo && naTela) { const u = pool[pool.length - 1]; escolher(u, `O último que tenho é ${slotFalado(u, !sv.profissional, h.ymd)}. Já separo esse pra você.`); return undefined; }
    if (it.sim && naTela?.length === 1) { escolher(naTela[0]); return undefined; }
    if (pool.length === 1) { escolher(pool[0]); return undefined; }
    s.lista = pool.slice(0, 4);
    const intro = it.mais ? 'Sem problema. Tenho também:' : it.apartir ? `A partir de ${dataFalada(it.apartir, h.ymd)} tenho:` : it.ate ? `Até ${dataFalada(it.ate, h.ymd)} tenho:` : 'Consegui estes aqui:';
    return dizer(`${intro}\n${numerada(s.lista, comMedico, h.ymd)}\nQual desses fica bom pra você?`);
  };
  if (!s.slot) {
    // resposta por número a uma lista anterior
    if (s.lista && s.lista.length && !s.slot) {
      const idx = lerEscolha(t, s.lista.length);
      if (idx >= 0 && s.lista[idx]) { s.slot = s.lista[idx]; s.data = s.slot.ymd; s.turno = s.slot.turno; s.lista = undefined; }
      else {
        // citou um(a) médico(a) da lista: fica só com os horários dele(a)
        const med = medicoDaLista(t, s.lista);
        if (med) {
          const dela = s.lista.filter((x) => x.profissional === med);
          if (dela.length === 1) { s.slot = dela[0]; s.data = dela[0].ymd; s.turno = dela[0].turno; s.lista = undefined; }
          else { s.lista = dela; return dizer(`Com ${exibir(med, { artigo: true })} tenho:\n${numerada(dela, false, h.ymd)}\nQual desses fica bom pra você?`); }
        }
      }
    }
    // "o mais rápido possível", "a próxima", "outro dia", "semana que vem", "depois do dia 25", "às 15h"... (com ou sem lista na tela)
    if (!s.slot && !s.data && (intencao || s.rapido || s.apartir)) { const rr = await aplicarIntencao(intencao ?? {}); if (rr) return rr; }
    // as regras não entenderam a resposta à lista: o intérprete de apoio (IA) tenta, e tudo que ele devolve é validado
    if (!s.slot && listaAnterior?.length && !entendeuHorario && ctx.interpretar) {
      const ia = await ctx.interpretar({ texto, lista: listaAnterior, hoje: h.ymd }).catch(() => null);
      if (ia) {
        s.lista = listaAnterior;
        const ymdOk = (x?: string) => (x && /^\d{4}-\d{2}-\d{2}$/.test(x) && x >= h.ymd ? x : undefined);
        if (typeof ia.indice === 'number' && ia.indice >= 0 && ia.indice < listaAnterior.length) escolher(listaAnterior[ia.indice]);
        else {
          const it: IntLista = { primeiro: ia.primeiro || undefined, ultimo: ia.ultimo || undefined, mais: ia.mais || undefined, apartir: ymdOk(ia.apartir), ate: ymdOk(ia.ate), hora: typeof ia.hora === 'number' && ia.hora >= 0 && ia.hora <= 23 ? ia.hora : undefined };
          if (ia.turno === 'manhã' || ia.turno === 'tarde') s.turno = ia.turno;
          if (it.primeiro || it.ultimo || it.mais || it.apartir || it.ate || it.hora != null || s.turno) { const rr = await aplicarIntencao(it); if (rr) return rr; }
        }
      }
    }
  }
  if (!s.slot) {
    if (s.data) {
      const doDia = await fonte.periodos(sv, un, s.data);
      await prepararGeneros(doDia.map((x) => x.profissional));
      let certos = s.turno ? doDia.filter((x) => x.turno === s.turno) : doDia;
      const medDia = medicoDaLista(t, certos); // "quinta 22 com a Fernanda"
      if (medDia) certos = certos.filter((x) => x.profissional === medDia);
      if (certos.length === 1) { s.slot = certos[0]; s.turno = certos[0].turno; s.lista = undefined; }
      else if (certos.length > 1) {
        s.lista = certos;
        return dizer(`Pra ${dataFalada(s.data, h.ymd)} tenho:\n${numerada(certos, comMedico, h.ymd)}\nQual desses fica bom pra você?`);
      } else {
        const pedido = `${dataFalada(s.data, h.ymd)}${s.turno ? ` ${periodoTxt(s.turno)}` : ''}`;
        // sem vaga nessa data: mostra o que existe depois dela (no período pedido, depois em qualquer período) e, se não houver nada depois, o que existe a partir de amanhã
        let alt: Slot[] = [];
        for (const [de, filtro] of [[s.data, s.turno], [s.data, undefined], [addDias(h.ymd, 1), s.turno], [addDias(h.ymd, 1), undefined]] as [string, Periodo | undefined][]) {
          alt = await alternativas(de, filtro);
          if (alt.length) break;
        }
        s.data = undefined; s.turno = undefined;
        if (alt.length === 0) return out([...partes, 'Pra essa data não achei vaga e no momento não vejo outras datas abertas. Vou chamar alguém da equipe pra conferir e te retornar.'].join('\n'), { motivo: `Sem vagas para ${sv.nome} no ${un.nome}.` });
        s.lista = alt;
        return dizer(`Pra ${pedido} não tenho vaga. Mas consegui estes aqui:\n${numerada(alt, comMedico, h.ymd)}\nQual desses fica bom pra você?`);
      }
    } else {
      // a lista já estava na tela e eu não entendi a resposta: pergunta de outro jeito, em vez de repetir a lista em silêncio
      if (listaAnterior?.length && !entendeuHorario) {
        s.lista = listaAnterior;
        return dizer(`Não peguei qual horário você quer. Pode ser o número, o dia ou "o mais rápido"?\n${numerada(listaAnterior, comMedico, h.ymd)}`);
      }
      const alt = await alternativas(addDias(h.ymd, 1), s.turno);
      if (alt.length === 0) return out([...partes, 'No momento não vejo vagas abertas. Vou chamar alguém da equipe pra conferir e te retornar.'].join('\n'), { motivo: `Sem vagas para ${sv.nome} no ${un.nome}.` });
      s.lista = alt;
      return dizer(`Consegui estes aqui:\n${numerada(alt, comMedico, h.ymd)}\nQual desses fica bom pra você? Se quiser outro dia me fala que eu vejo.`);
    }
  }
  const slot = s.slot!;
  await prepararGeneros([slot.profissional]);
  // para a equipe (motivo da transferência): nome completo e data com mês
  const resumoVaga = `${sv.frase} no ${un.nome}, ${fmtData(slot.ymd)}, ${periodoTxt(slot.turno)}, a partir das ${hora(slot.inicio)}, por ordem de chegada${slot.profissional ? `, com ${slot.profissional}` : ''}`;
  // para o paciente: jeito de falar, com Dr./Dra.
  const resumoFalado = `${sv.frase} no ${un.nome} ${diaResumo(slot.ymd, h.ymd)} ${periodoTxt(slot.turno)} a partir das ${hora(slot.inicio)} por ordem de chegada${slot.profissional && !sv.profissional ? ` com ${exibir(slot.profissional, { artigo: true })}` : ''}`;

  // 7b) forma de pagamento: pix (espera o comprovante), link de crédito (equipe envia) ou pagar na recepção
  const valorPix = un.precoPix;
  const pedirCpf = (pre: string) => dizer(!pre ? PERG_CPF : `${pre} ${pre.startsWith('Recebi') ? PERG_CPF_APOS : PERG_CPF}`);
  const pixMsg = `Show! A chave pix é essa${valorPix ? `, o valor é ${reais(valorPix)}` : ''}:\n\n${MARCA_PIX} ${env.pixKey}\n\nQuando pagar, me manda o comprovante aqui que eu já sigo com o seu agendamento, tá?`;
  const deLink = () => out('Combinado! Vou pedir pra equipe te enviar o link de pagamento e concluir o agendamento. Já deixei tudo anotado. Só um instante.', { motivo: `Paciente quer pagar por link de crédito: enviar o link e concluir o agendamento. Vaga: ${resumoVaga}. Agendamento AINDA NÃO feito.` });
  let preCpf = '';
  if (!s.pagFinal) {
    if (!s.pagPerguntado) {
      s.pagPerguntado = true;
      // se ele já adiantou a forma de pagamento (agora ou antes), não pergunta de novo; "aceita cartão?" é pergunta, não escolha
      s.pagamento = faq === 'pagto' ? undefined : (lerPagamento(t) ?? s.pagPref);
      const resumo = escolhaDireta || `${pick(['Beleza', 'Show'], n)}, então fica ${resumoFalado}.`;
      if (!s.pagamento) return dizer(resumo, `Pra agilizar o seu atendimento na recepção, você quer ${MARCA_PAGAMENTO} por pix ou link de crédito?`);
      partes.push(resumo); // já escolheu como pagar: mostra o que ficou combinado e segue
    } else if (!s.pagamento) {
      const f = faq === 'pagto' ? undefined : lerPagamento(t);
      if (!f) {
        s.compTent += 1;
        if (s.compTent >= 3) return out('Vou chamar alguém da equipe pra combinar o pagamento com você. Já deixei tudo anotado. Só um instante.', { motivo: `Paciente não definiu a forma de pagamento. Vaga: ${resumoVaga}. Agendamento AINDA NÃO feito.` });
        return dizer('Você prefere pagar por pix, link de crédito ou lá na recepção, no dia?');
      }
      s.pagamento = f;
      s.compTent = 0;
    } else if (aguardandoComprovante) {
      // já mandamos a chave pix: só seguimos com o comprovante, ou se ele desistir do pix
      const aEquipeComp = (aviso: string, motivo: string) => out(`${aviso} Vou pedir pra equipe conferir. Já deixei tudo anotado. Só um instante.`, { motivo: `${motivo} Vaga: ${resumoVaga}. Agendamento AINDA NÃO feito.` });
      const falta = valorPix ? Math.max(0, valorPix - (s.pagoPix ?? 0)) : 0;
      if (RECEPCAO.test(t)) { s.pagamento = 'recepcao'; }
      else if (LINK.test(t) && !PIX.test(t)) { s.pagamento = 'link'; }
      else if (midia) {
        if (!ctx.lerComprovante) return aEquipeComp('Recebi o seu comprovante.', 'Comprovante de pix recebido, mas a leitura automática está indisponível: conferir a imagem.');
        const c = await ctx.lerComprovante(midia[2]).catch(() => null);
        const nova = (msg: string, motivo: string) => {
          s.compTent += 1;
          if (s.compTent >= 3) return aEquipeComp('Não to conseguindo conferir o comprovante.', `Comprovante não pôde ser conferido após ${s.compTent} tentativas (${motivo}).`);
          return dizer(msg);
        };
        if (!c || c.tipo === 'ilegivel') return nova('Não to conseguindo ler esse comprovante, pode me mandar de novo?', 'imagem ilegível');
        if (c.tipo === 'outro') return nova('Hmm essa imagem não parece ser um comprovante de pix. Pode me mandar o comprovante do pagamento?', 'imagem que não é comprovante');
        if (c.status && c.status !== 'concluido') return nova('O comprovante não mostra o pagamento como concluído. Pode me mandar depois que o pix for feito?', `status ${c.status}`);
        if (!c.data) return nova('Não consegui ver a data no comprovante. Pode mandar o print completo com valor e data?', 'sem data');
        if (c.data < addDias(h.ymd, -1) || c.data > h.ymd) return nova(`Esse comprovante é de ${dataFalada(c.data, h.ymd)}. Preciso do comprovante do pagamento de hoje. Pode me mandar o correto?`, `comprovante de ${c.data}`);
        if (c.valor == null) return nova('Não consegui ver o valor no comprovante. Pode mandar o print completo com valor e data?', 'sem valor');
        // sem preço cadastrado no Clinilink não há como conferir o valor pago: a equipe confere
        if (!valorPix) return aEquipeComp('Recebi o seu comprovante.', `Comprovante de ${reais(c.valor)} recebido, mas o valor do serviço não está definido no Clinilink: conferir o valor pago.`);
        const alvo = norm(`${c.destinatario ?? ''} ${c.chave ?? ''}`);
        if (alvo.trim() && ![...env.pixRecebedor.split(','), env.pixKey].some((k) => k.trim() && alvo.includes(norm(k)))) return aEquipeComp('O comprovante mostra um recebedor diferente do nosso.', `ATENÇÃO: comprovante com recebedor "${c.destinatario ?? c.chave}", diferente da chave ${env.pixKey}.`);
        // o mesmo comprovante não conta duas vezes
        if (c.transacao && (s.transacoes ?? []).includes(c.transacao)) return nova('Esse comprovante eu já recebi. Se tiver outro pagamento é só me mandar.', 'comprovante repetido');
        if (c.transacao) s.transacoes = [...(s.transacoes ?? []), c.transacao];
        const total = (s.pagoPix ?? 0) + c.valor;
        // pagou menos que o valor: soma, explica a diferença e deixa escolher (pagar o resto por pix ou na recepção)
        if (valorPix && total + 0.005 < valorPix) {
          const antes = s.pagoPix;
          s.pagoPix = total;
          s.compTent = 0;
          s.comprovante = { valor: total, data: c.data, nota: `Pix antecipado PARCIAL de ${reais(total)} (comprovante lido pela IA; CONFERIR no extrato)` };
          return dizer(`${antes ? `Recebi mais esse comprovante, e o total pago até agora é ${reais(total)}.` : `Recebi o seu comprovante de ${reais(c.valor)}.`} O valor é ${reais(valorPix)}, então ainda faltam ${reais(valorPix - total)}. Prefere pagar o restante agora por pix ou deixar para pagar na recepção?`);
        }
        s.comprovante = { valor: total, data: c.data, nota: `Pix antecipado: ${reais(total)} (${fmtNasc(c.data)}${s.pagoPix ? ', mais de um comprovante' : ''}) lido pela IA${alvo.trim() ? '' : ', recebedor não identificado'}; CONFERIR no extrato` };
        s.pagoPix = total;
        s.pagFinal = true;
        preCpf = 'Recebi o seu comprovante, muito obrigada!';
      }
      else if (/pagu|fiz o pix|transferi|ja fiz|efetuei|enviei|mandei/.test(t)) return dizer('Que bom! Me manda o comprovante (foto ou print) pra eu conferir e seguir com o seu agendamento.');
      else if (/chave|copia e cola|qr|valor|quanto/.test(t) || (s.pagoPix && (PIX.test(t) || /agora|restante|diferenca|falta/.test(t)))) return dizer(`Aqui está!\n${MARCA_PIX} ${env.pixKey}${valorPix ? `\nValor${s.pagoPix ? ' que falta' : ''}: ${reais(falta || valorPix)}` : ''}\nQuando pagar, me manda o comprovante aqui, tá?`);
      else if (s.pagoPix) {
        s.compTent += 1;
        if (s.compTent >= 3) return aEquipeComp('Vou chamar alguém da equipe pra combinar o restante do pagamento com você.', `Pagou ${reais(s.pagoPix)} por pix e não definiu como pagar o restante (${reais(falta)}).`);
        return dizer(`Ainda faltam ${reais(falta)}. Prefere pagar o restante agora por pix ou deixar para pagar na recepção?`);
      }
      else return dizer('Tô aguardando o comprovante do pix pra seguir com o seu agendamento, tá? Se preferir pagar na recepção é só me avisar.');
    }
    if (!s.pagFinal) {
      if (s.pagamento === 'link') return deLink();
      if (s.pagamento === 'recepcao') {
        s.pagFinal = true;
        if (s.pagoPix) { // pagou uma parte por pix: o resto fica para a recepção
          const resto = valorPix ? Math.max(0, valorPix - s.pagoPix) : 0;
          s.comprovante = { valor: s.pagoPix, data: s.comprovante?.data ?? h.ymd, nota: `Pix antecipado PARCIAL de ${reais(s.pagoPix)} (comprovante lido pela IA; CONFERIR no extrato)${resto ? `. Saldo de ${reais(resto)} a pagar na recepção` : ''}` };
          preCpf = `Combinado ${resto ? `o restante de ${reais(resto)} fica` : 'o restante fica'} pra recepção no dia do atendimento.`;
        } else preCpf = 'Sem problema nenhum o pagamento fica pra recepção no dia do atendimento.';
      }
      else if (s.pagamento === 'pix') {
        if (!s.pixEnviado) { s.pixEnviado = true; return dizer(pixMsg); }
      }
    }
    if (s.pagFinal) {
      // o CPF pode ter sido dito antes ("meu cpf é ..."): então já segue para o cadastro, sem perguntar de novo
      if (!s.cpf) return pedirCpf(preCpf);
      if (preCpf) partes.push(preCpf);
    } else return dizer('Tô aguardando o comprovante do pix pra seguir com o agendamento.');
  }

  // 8) CPF
  const slotAntes = Boolean(base.slot && base.pagFinal);
  if (!s.cpf) {
    const cpf = slotAntes ? cpfDoTexto(t) : undefined;
    if (cpf && !cpfValido(cpf)) return dizer('Acho que algum número do CPF escapou, dá uma olhadinha e me manda de novo os 11 números?');
    if (cpf) s.cpf = cpf;
    else if (slotAntes && /\d{2,}/.test(t)) return dizer('Não consegui ler o CPF. Pode me mandar os 11 números?');
    else return dizer(pick([PERG_CPF, 'Qual o CPF do paciente? Preciso dele pra fazer a reserva.'], n));
  }

  // 9) consulta o paciente por CPF
  const acabouDeConsultar = s.paciente === undefined;
  if (s.paciente === undefined) {
    s.paciente = await fonte.paciente(s.cpf);
    if (s.paciente) return dizer(`Achei aqui o cadastro de ${titulo(s.paciente.nome)}. É esse mesmo o paciente?`);
    return dizer('Esse CPF ainda não tá no cadastro, vou fazer agora. Qual o nome completo do paciente?');
  }
  if (s.paciente && !s.pacienteConfirmado) {
    if (SIM.test(t)) s.pacienteConfirmado = true;
    else if (NAO.test(t)) { s.cpf = undefined; s.paciente = undefined; return dizer('Sem problema. Dá uma conferida no CPF e me manda de novo?'); }
    else return dizer(`Esse cadastro é de ${titulo(s.paciente.nome)}. É esse mesmo o paciente?`);
  }

  // 10) CPF novo: coleta o cadastro, um dado por mensagem
  if (s.paciente === null) {
    const c = s.cad;
    if (!acabouDeConsultar) {
      if (!c.nome) { const m = limparNome(texto); if (/^[\p{L}' ]{5,80}$/u.test(m) && m.includes(' ') && !SIM.test(t) && !NAO.test(t) && !faq) c.nome = titulo(m); }
      else if (!c.nascimento) { const nsc = lerNascimento(texto); if (nsc) c.nascimento = nsc; }
      else if (!c.sexo) { if (/fem|mulher/.test(t)) c.sexo = 'feminino'; else if (/masc|homem/.test(t)) c.sexo = 'masculino'; }
      else if (!c.telefone) {
        const dig = texto.replace(/\D/g, '');
        if (c.pediuTelefone && dig.length >= 10 && dig.length <= 13) c.telefone = dig;
        else if (!c.pediuTelefone) { /* ainda vai perguntar */ }
        else if (SIM.test(t) && ctx.telefone) c.telefone = ctx.telefone.replace(/\D/g, '');
      }
    }
    if (!c.nome) return dizer(!acabouDeConsultar ? 'Preciso do nome completo do paciente como está no documento. Qual é?' : 'Qual o nome completo do paciente?');
    if (!c.nascimento) return dizer(`Prazer, ${c.nome.split(' ')[0]}! E a data de nascimento? Pode ser dia/mês/ano.`);
    if (!c.sexo) return dizer('O cadastro pede o sexo: feminino ou masculino?');
    if (!c.telefone) {
      const primeira = !c.pediuTelefone; c.pediuTelefone = true;
      return dizer(primeira ? 'E esse número do WhatsApp, posso usar de contato?' : 'Qual o telefone com DDD pra contato?');
    }
  }

  // 11) conclui
  s.fim = true;
  const quem = s.paciente ? titulo(s.paciente.nome) : s.cad.nome ?? '';
  if (fonte.tipo === 'clinilink') {
    const novo = s.paciente ? `Paciente já cadastrado (${titulo(s.paciente.nome)}, id ${s.paciente.id ?? '?'}).` : `CADASTRAR paciente novo: ${s.cad.nome}, nascimento ${s.cad.nascimento ? fmtNasc(s.cad.nascimento) : '?'}, sexo ${s.cad.sexo}, telefone ${s.cad.telefone}, CPF ${s.cpf}.`;
    const aEquipe = (aviso: string, motivo: string) => out(`${aviso} Vou chamar alguém da equipe pra concluir. Já deixei tudo anotado. Só um instante.`, { motivo });

    if (!ctx.efetivar) return out('Beleza, vou concluir a sua reserva. Só um instante.'); // reprocessamento: nunca grava

    const r = await fonte.reservar!({
      servico: sv, unidade: un, slot, cpf: s.cpf!,
      pacienteId: s.paciente?.id,
      observacao: ['Agendado pela Amanda (IA) via WhatsApp', s.comprovante?.nota ?? (s.pagamento === 'recepcao' ? 'Pagamento na recepção' : '')].filter(Boolean).join('. '),
      cadastro: s.paciente ? undefined : { nome: s.cad.nome!, nascimento: s.cad.nascimento!, sexo: s.cad.sexo!, telefone: s.cad.telefone! },
    });
    if (r.ok) {
      const med = r.profissional ?? slot.profissional;
      await prepararGeneros([med]);
      const primeiro = quem.split(' ')[0];
      const comMed = med && !sv.profissional ? ` com ${exibir(med, { artigo: true })}` : ''; // com profissional pedido pelo nome, a frase do serviço já diz quem é
      return out(`${MARCA_AGENDADO}! Deu tudo certo${primeiro ? `, ${primeiro}` : ''}. ${s.paciente ? '' : `Cadastro de ${quem} feito. `}Ficou ${sv.frase} no ${un.nome} ${[0, 6].includes(toDate(slot.ymd).getUTCDay()) ? 'no' : 'na'} ${dataLonga(slot.ymd)}, ${periodoTxt(slot.turno)}${comMed}. É por ordem de chegada a partir das ${hora(r.hora)} então vale chegar cedinho. Estamos te esperando com carinho!`);
    }
    const extra = r.cadastrou ? ' O cadastro do paciente FOI criado.' : '';
    if (r.incerto) return aEquipe('Não consegui confirmar a reserva agora.', `ATENÇÃO: a reserva pode ou não ter sido gravada (${r.codigo}). CONFERIR no Clinilink antes de refazer. Vaga: ${resumoVaga}. ${novo}${extra}`);
    if (r.codigo === 'SEM_VAGA_AGORA' || r.codigo === 'HORARIO_OCUPADO') return aEquipe('Essa vaga acabou de ser preenchida.', `Vaga ocupada na hora de reservar (${r.codigo}). Oferecer outro horário. Pedido: ${resumoVaga}. ${novo}${extra}`);
    if (r.codigo === 'SERVICO_DUPLICADO_NO_DIA') return aEquipe('Vi que este paciente já tem esse atendimento marcado pro mesmo dia.', `Reserva recusada: ${r.codigo}. Conferir o agendamento existente. Pedido: ${resumoVaga}. ${novo}${extra}`);
    return aEquipe('Não consegui concluir a reserva.', `Reserva recusada pelo Clinilink (${r.codigo}: ${r.motivo}). Pedido: ${resumoVaga}. ${novo}${extra}`);
  }
  return out(`${s.paciente ? '' : `Cadastro de ${quem} feito. `}Sua vaga de ${sv.frase} está confirmada para ${dataLonga(slot.ymd)} no ${un.nome}${slot.profissional && !sv.profissional ? ` com ${exibir(slot.profissional, { artigo: true })}` : ''}. Os atendimentos começam às ${hora(slot.inicio)} por ordem de chegada. Recomendamos chegar cedo.\n(${MARCA_FIM} de verdade.)`);
}

/**
 * Reprocessa as mensagens do paciente, na ordem, e devolve o resultado da última.
 * `turnos`: cada item são as mensagens que o paciente mandou entre duas respostas da Amanda. Quando ele manda
 * várias de uma vez ("isso" + "pra amanhã"), só a ÚLTIMA recebe resposta; a resposta calculada para as anteriores
 * nunca chega ao paciente. Por isso o que ela "informou" (saudação, resumo de unidades, nome do paciente para
 * confirmar) é desfeito: senão a Amanda pularia o resumo, ou aceitaria um "sim" a uma pergunta que ele não viu.
 * Só o último turno pode gravar no Clinilink (os anteriores já foram respondidos de verdade).
 */
export async function responder(entrada: (string | string[])[], ctx: Ctx, fonte: Fonte): Promise<Result | undefined> {
  const turnos = entrada.map((x) => (Array.isArray(x) ? x : [x]));
  let state = novoEstado();
  if (ctx.pos) state = { ...state, saudou: true, pos: ctx.pos }; // a conversa já começou: logo depois de um agendamento
  let last: Result | undefined;
  let i = 0;
  let aposHandoffDuro = false;
  for (let t = 0; t < turnos.length; t++) {
    const msgs = turnos[t];
    for (let j = 0; j < msgs.length; j++) {
      const antes = { saudou: state.saudou, unidadesInformadas: state.unidadesInformadas };
      last = await step(state, msgs[j], { ...ctx, efetivar: t === turnos.length - 1 }, fonte, i++);
      state = last.state;
      // no último turno, quem encerra a jornada ou transfere já é a resposta que o paciente vai receber
      if (t === turnos.length - 1 && (last.handoff || last.state.fim)) return { ...last, aposHandoffDuro };
      // transferência numa resposta que JÁ foi enviada. Se o paciente pediu um humano (ou foi urgência), o que vier
      // depois é jornada nova e a Amanda não retoma sozinha. Nos demais casos (comprovante, vaga, falha do sistema...)
      // a conversa CONTINUA de onde parou quando o paciente volta a escrever, com as tentativas zeradas.
      if (last.handoff && j === msgs.length - 1) {
        const duro = Boolean(last.handoff.urgente) || /atendimento humano/i.test(last.handoff.motivo);
        aposHandoffDuro = duro;
        state = duro ? { ...novoEstado(), saudou: true } : { ...state, falhas: 0, compTent: 0, pagamento: state.pagamento === 'link' ? undefined : state.pagamento };
      }
      if (j < msgs.length - 1) { // resposta descartada: desfaz o que ela marcou como dito
        state.saudou = antes.saudou;
        state.unidadesInformadas = antes.unidadesInformadas;
        if (state.paciente && !state.pacienteConfirmado) state.paciente = undefined; // o nome nunca foi mostrado
      }
    }
  }
  return last && { ...last, aposHandoffDuro };
}
