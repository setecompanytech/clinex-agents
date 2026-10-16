import type { Comprovante } from '../../../lib/comprovante.js';
import { env } from '../../../lib/env.js';
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
const linhaSlot = (s: Slot, comMedico: boolean) => `${fmtData(s.ymd)}, ${periodoTxt(s.turno)}, a partir das ${hora(s.inicio)}${comMedico && s.profissional ? `, com ${s.profissional}` : ''}`;
const numerada = (slots: Slot[], comMedico: boolean) => slots.map((s, i) => `${i + 1}. ${linhaSlot(s, comMedico)}`).join('\n');

const SEMANA: [RegExp, number][] = [[/domingo/, 0], [/segunda/, 1], [/terca/, 2], [/quarta/, 3], [/quinta/, 4], [/sexta/, 5], [/sabado/, 6]];

function lerData(t: string, ctx: Ctx): string | undefined {
  const h = hoje(ctx);
  if (/depois de amanha/.test(t)) return addDias(h.ymd, 2);
  if (/amanha/.test(t)) return addDias(h.ymd, 1);
  if (/\bhoje\b/.test(t)) return h.ymd;
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
const lerTurno = (t: string): Periodo | 'noite' | undefined => (/(^|[^a-z])(manha|cedo)([^a-z]|$)/.test(t) ? 'manhã' : /tarde/.test(t) ? 'tarde' : /noite/.test(t) ? 'noite' : undefined);

// ---------- detectores ----------
const EMERGENCIA = /dor (forte )?no peito|falta de ar|nao consigo respirar|desmai|convuls|sangramento (intenso|forte)|avc|infarto|rigidez (de|na) nuca|fraqueza (subita|de um lado)|fala (travada|enrolada)/;
const CRISE = /suicid|me matar|tirar minha vida|acabar com minha vida|nao quero mais viver|me machucar|autolesao/;
const HUMANO = /atendente|humano|pessoa de verdade|falar com alguem|falar com uma pessoa|(falar|conversar|chamar|passar).{0,15}(recepcao|recepcionista)/;
const SIM = /^(sim|s|pode|pode sim|pode reservar|quero|quero sim|ok|isso|isso mesmo|e isso|e isso mesmo|exato|confirmo|confirma|fechado|combinado|bora|claro|por favor|pode ser|ta bom|tudo bem|correto|certo|esse mesmo|sou eu)\b/;
const RETOMAR = /\b(retom\w*|continu\w*|dar continuidade|voltei|ainda quero|onde (a gente )?parou|de onde paramos|seguir com (o|meu) agendamento)\b/;
const NAO = /^(nao|n|nao quero|nao obrigad|nao e|outro|outra|prefiro outro|prefiro outra|errado)\b/;
const SO_CUMPRIMENTO = /^(oi+|ola|ola+ boa|e ai|ei|bom dia|boa tarde|boa noite|teste|ola teste|agente de ia|amanda|atendimento|tudo bem\??|oie)[\s!.,?]*(teste|amanda|tudo bem\??)?[\s!.,?]*$/;

const cpfDoTexto = (t: string): string | undefined => {
  const m = t.match(/\b(\d{3})\.?(\d{3})\.?(\d{3})-?(\d{2})\b/);
  if (m) return m.slice(1).join('');
  const d = t.replace(/\D/g, ''); // "123 456 789 09", "123,456,789,09" (áudio transcrito)
  return d.length === 11 ? d : undefined;
};

/** Escolha numa lista: "2", "opção 2", "o primeiro", "a terceira", "o último", "dois". -1 = não é uma escolha. */
function lerEscolha(t: string, total: number): number {
  const porOpcao = /\b(opcao|alternativa|numero)\b/.test(t);
  const FILL = '(?:(?:a|o|essa|esse|de|quero|opcao|alternativa|numero)\\s+)*';
  const dig = t.match(new RegExp(`^\\s*${FILL}(\\d)\\b(?![/.-]\\d)`));
  if (dig) return Number(dig[1]) - 1;
  if (/\bultim[oa]\b/.test(t)) return total - 1;
  const ord: [RegExp, number][] = [[/\bprimeir[oa]\b/, 0], [/\bterceir[oa]\b/, 2], [/\bquint[oa]\b/, 4]];
  // "segunda" e "quarta" também são dias da semana: só valem como posição quando vêm com "opção/número"
  if (porOpcao) ord.push([/\bsegund[oa]\b/, 1], [/\bquart[oa]\b/, 3]);
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

const AGRADECE = new Set(['muito', 'obrigado', 'obrigada', 'brigado', 'brigada', 'valeu', 'vlw', 'show', 'perfeito', 'beleza', 'blz', 'ok', 'okay', 'certo', 'combinado', 'ta', 'bom', 'tudo', 'bem', 'otimo', 'excelente', 'maravilha', 'legal', 'massa', 'top', 'demais', 'mesmo', 'viu', 'entao', 'grato', 'grata', 'agradeco', 'deus', 'abencoe', 'gracas', 'obg', 'obgd', 'tmj', 'flw', 'falou', 'abraco', 'abracos', 'ate', 'logo', 'mais', 'tchau', 'amanha', 'vejo', 'voces', 'vcs', 'dia', 'tarde', 'noite', 'te', 'a', 'o', 'de']);
const soAgradecimento = (t: string) => {
  if (t && !/[a-z0-9]/.test(t)) return true; // só emoji (joinha, mãos juntas...)
  const w = t.split(/[^a-z]+/).filter(Boolean);
  return w.length > 0 && w.length <= 10 && w.every((x) => AGRADECE.has(x));
};
const NAO_MAIS = /\b(so isso|era so isso|e so isso|so era isso|nada mais|mais nada|nao preciso|nao precisa|nao,? obrigad[oa]|por hoje|por enquanto|tudo certo|pode encerrar|tchau|ate (mais|logo|breve))\b|^(nao|n)[\s!.,]*$/;
const SO_SIM = /^(sim|s|quero|quero sim|claro|pode|pode sim|gostaria|preciso|isso|uhum|aham|por favor|queria|tenho sim|tenho)[\s!.,]*$/;

export const TXT_MAIS = 'Imagina, foi um prazer! Posso te ajudar com mais alguma coisa?';
export const TXT_ADEUS = 'Por nada, foi um prazer te atender! Tenha um ótimo dia e cuide-se bem.';
export type Pos = 'confirmado' | 'perguntou_mais' | 'encerrou';

/**
 * Logo depois de um agendamento concluído: "obrigado" -> pergunta se pode ajudar em mais algo; "era só isso" -> despede;
 * "quero outro" -> segue normal; depois da despedida, novo agradecimento não recebe resposta.
 */
function posAgendamento(pos: Pos, t: string): { reply: string; pos?: Pos } | 'seguir' | 'silencio' {
  if (NAO_MAIS.test(t)) return pos === 'encerrou' ? 'silencio' : { reply: TXT_ADEUS, pos: 'encerrou' };
  if (SO_SIM.test(t)) return pos === 'encerrou' ? 'seguir' : { reply: 'Que bom! Me conta: qual consulta ou exame você gostaria de agendar?' };
  if (soAgradecimento(t)) {
    if (pos === 'confirmado') return { reply: TXT_MAIS, pos: 'perguntou_mais' };
    if (pos === 'perguntou_mais') return { reply: TXT_ADEUS, pos: 'encerrou' };
    return 'silencio';
  }
  return 'seguir';
}

// ---------- núcleo ----------
export async function step(prev: State, texto: string, ctx: Ctx, fonte: Fonte, n = 0): Promise<Result> {
  // depois de uma jornada concluída, uma nova mensagem abre outra jornada (mantém a saudação já feita)
  const s: State = prev.fim ? { ...novoEstado(), saudou: true } : { ...prev, cad: { ...prev.cad } };
  const base = prev.fim ? s : prev;
  const t = norm(texto.replace(TOKEN_MIDIA, ' '));
  const h = hoje(ctx);
  const nome = ctx.nome;
  const nomeOk = /^[\p{L}]{2,20}$/u.test(nome ?? '') ? nome : '';
  const abertura = s.saudou ? '' : `${SAUDACAO(h.hora)}${nomeOk ? `, ${nomeOk}` : ''}! Sou a Amanda, da Clinex. Que bom ter você por aqui!`;
  const out = (reply: string, handoff?: Handoff): Result => { s.saudou = true; return { state: s, reply, handoff }; };
  const comAbertura = (txt: string) => (abertura ? `${abertura}\n${txt}` : txt);
  const partes: string[] = [];
  if (abertura) partes.push(abertura);
  const dizer = (...txt: string[]) => out([...partes, ...txt].join(abertura && partes.length === 1 && txt.length === 1 && !txt[0].includes('\n') ? ' ' : '\n'));
  const reiniciaDepoisDoServico = () => {
    s.confirmPerguntado = false; s.servicoConfirmado = false; s.unidadesInformadas = false; s.unidade = undefined;
    s.lista = undefined; s.data = undefined; s.turno = undefined; s.slot = undefined; s.cpf = undefined;
    s.paciente = undefined; s.pacienteConfirmado = false; s.cad = {};
    s.pagPerguntado = false; s.pagamento = undefined; s.pixEnviado = false; s.pagFinal = false; s.compTent = 0; s.comprovante = undefined; s.pagoPix = undefined; s.transacoes = undefined;
  };

  // 1) segurança primeiro
  if (CRISE.test(t)) {
    return out(`Sinto muito que você esteja passando por isso${nome ? `, ${nome}` : ''}. Vou te colocar agora com alguém da nossa equipe para te ajudar. Se precisar conversar com alguém neste momento, o CVV atende 24 horas pelo 188, a ligação é gratuita. Você não precisa passar por isso sozinho.`, { motivo: 'PRIORIDADE: urgente. Paciente relatou possível crise de saúde mental.', urgente: true });
  }
  if (EMERGENCIA.test(t)) {
    return out(`${nome ? `${nome}, pelo` : 'Pelo'} que você descreveu, isso precisa de avaliação imediata. Por favor, procure agora o pronto-socorro mais próximo ou ligue 192. A Clinex faz atendimento agendado e não é o lugar certo para uma urgência. Fico à disposição depois, tá bem?`, { motivo: 'PRIORIDADE: urgente. Possível emergência clínica relatada pelo paciente.', urgente: true });
  }
  if (HUMANO.test(t)) {
    return out(comAbertura('Claro, vou te passar para alguém da nossa equipe. Só um instante.'), { motivo: 'Paciente pediu atendimento humano.' });
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
  if (midia && !aguardandoComprovante && !t) return out(comAbertura('Recebi o arquivo, mas por aqui só consigo ler texto e áudio. Pode me responder escrevendo?'));

  // 2) serviço: escolha entre opções pendentes, ou descoberta na fonte
  // o paciente voltou para retomar um atendimento que ficou pela metade (e não citou o serviço)
  if (!s.servico && !s.opcoes && RETOMAR.test(t) && !RAIZES.some((x) => x.re.test(t))) {
    return out(comAbertura('Que bom que você voltou! Vamos retomar o seu agendamento. Qual consulta ou exame você precisa?'));
  }
  let mudouServico = false;
  const aplicar = (d: Awaited<ReturnType<Fonte['descobrir']>>): Result | undefined => {
    if (!d) return undefined;
    if ('semAgenda' in d) return out(comAbertura(`No momento não há vagas abertas para ${d.semAgenda}. Vou pedir para a equipe conferir e te retornar.`), { motivo: `Sem vagas abertas na agenda para ${d.semAgenda}.` });
    if ('opcoes' in d) { s.opcoes = d.opcoes; s.servico = undefined; return undefined; }
    if (d.servico.id !== s.servico?.id) { s.servico = d.servico; s.opcoes = undefined; reiniciaDepoisDoServico(); mudouServico = true; }
    return undefined;
  };
  if (!s.slot) {
    if (s.opcoes && !s.servico) {
      const idx = lerEscolha(t, s.opcoes.length);
      const escolhida = s.opcoes[idx] ?? s.opcoes.find((o) => norm(o.nome).split(/\s+/).filter((w) => w.length > 3).some((w) => t.includes(w)));
      if (escolhida) { const r = aplicar(await fonte.resolver(escolhida.id)); if (r) return r; }
    } else {
      const r = aplicar(await fonte.descobrir(t, !s.servico));
      if (r) return r;
    }
  }

  // 3) sem serviço: recepção
  if (!s.servico) {
    if (s.opcoes) {
      const lista = s.opcoes.map((o, i) => `${i + 1}. ${o.nome}`).join('\n');
      return out(comAbertura(`Encontrei estas opções:\n${lista}\nQual delas você precisa?`));
    }
    // o paciente voltou para retomar um atendimento que ficou pela metade
    if (RETOMAR.test(t)) return out(comAbertura('Que bom que você voltou! Vamos retomar o seu agendamento. Qual consulta ou exame você precisa?'));
    const cumprimento = SO_CUMPRIMENTO.test(t);
    if (!cumprimento && !NAO.test(t)) s.falhas += 1;
    if (s.falhas >= 2) return out(comAbertura('Vou passar você para alguém da nossa equipe continuar o atendimento. Só um instante.'), { motivo: 'Não foi possível identificar o serviço pedido pelo paciente.' });
    if (!s.saudou && cumprimento) return out(`${abertura} Como posso te ajudar?`);
    if (cumprimento) return out('Qual consulta ou exame você precisa?');
    if (NAO.test(t) && prev.confirmPerguntado === false && base.servico === undefined && s.saudou && !abertura) return out('Sem problema. Qual consulta ou exame você precisa?');
    return out(comAbertura('Não consegui identificar o serviço. Me diz o nome da especialidade ou do exame, por exemplo cardiologia, dermatologia ou ultrassom.'));
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
      const dAd = lerData(t, ctx); const tAd = lerTurno(t);
      if (dAd) s.data = dAd;
      if (tAd && tAd !== 'noite') s.turno = tAd;
      const seguranca = sv.viaSintoma ? ' Se a dor estiver forte ou vier com falta de ar, procure agora o pronto-socorro mais próximo ou ligue 192.' : '';
      const pergunta = s.confirmPerguntado && prev.confirmPerguntado && !mudouServico
        ? pick([`Só para confirmar: você precisa de ${sv.frase}, certo?`, `Você quer agendar ${sv.frase}?`], n)
        : sv.viaSintoma ? `Pelo que você contou, o serviço indicado é ${sv.frase}.${seguranca} É isso que você precisa?` : `Você quer agendar ${sv.frase}, é isso?`;
      return dizer(pergunta);
    }
  }

  // 5) a partir daqui o serviço está confirmado; extrai unidade, dia e período citados
  let aviso = '';
  if (!s.slot) {
    const nomesUn = await fonte.nomesUnidades();
    const unCitada = nomesUn.find((u) => t.includes(norm(u)));
    if (unCitada) {
      const ok = sv.unidades.find((u) => norm(u.nome) === norm(unCitada));
      if (ok) s.unidade = ok;
      else aviso = `${cap(sv.frase)} não tem agenda no ${unCitada}.`;
    }
    if (!s.unidade && sv.unidades.length > 1 && /tanto faz|qualquer|a mais proxima|o mais proximo/.test(t)) s.unidade = sv.unidades[0];
    if (!s.unidade && sv.unidades.length === 1) s.unidade = sv.unidades[0];
    const escolhaLista = s.lista?.length ? lerEscolha(t, s.lista.length) : -1; // "a segunda opção" não é um dia da semana
    const tn = lerTurno(t); const d = escolhaLista >= 0 ? undefined : lerData(t, ctx);
    if (d) { s.data = d; s.lista = undefined; }
    if (tn === 'noite') aviso = aviso || 'Nosso atendimento é pela manhã e à tarde.';
    else if (tn && escolhaLista < 0) { s.turno = tn; s.lista = undefined; }
  }

  // 6) informa as unidades com agenda (e o médico de cada uma) antes de perguntar qualquer coisa
  if (!s.unidadesInformadas) {
    s.unidadesInformadas = true;
    const medicos = (u: Unidade) => (u.profissionais?.length ? ` com ${u.profissionais.join(' e ')}` : '');
    const preco = sv.precoTexto ? ` ${sv.precoTexto}` : '';
    // uma unidade: frase corrida. Várias: uma por linha, para os médicos de cada unidade não se misturarem.
    partes.push(sv.unidades.length === 1
      ? `${cap(sv.frase)} tem agenda no ${sv.unidades[0].nome}${medicos(sv.unidades[0])}.${preco}`
      : [`${cap(sv.frase)} tem agenda nestas unidades:`, ...sv.unidades.map((u) => `${u.nome}${medicos(u)}`), ...(preco ? [preco.trim()] : [])].join('\n'));
  }
  if (aviso) partes.push(aviso);
  if (!s.unidade) return dizer(base.unidadesInformadas ? `Para eu seguir, qual unidade você prefere: ${sv.unidades.map((u) => u.nome).join(' ou ')}?` : 'Para qual unidade você prefere?');
  const un = s.unidade;
  const comMedico = (un.profissionais?.length ?? 0) > 1;

  // 7) dia e período: o paciente escolhe da lista (número) ou diz a data
  if (!s.slot) {
    // resposta por número a uma lista anterior
    if (s.lista && s.lista.length && !s.slot) {
      const idx = lerEscolha(t, s.lista.length);
      if (idx >= 0 && s.lista[idx]) { s.slot = s.lista[idx]; s.data = s.slot.ymd; s.turno = s.slot.turno; s.lista = undefined; }
    }
  }
  if (!s.slot) {
    const alternativas = async (de: string, filtro?: Periodo) => {
      const todas = await fonte.proximas(sv, un, de, 8);
      return (filtro ? todas.filter((x) => x.turno === filtro) : todas).slice(0, 4);
    };
    if (s.data) {
      const doDia = await fonte.periodos(sv, un, s.data);
      const certos = s.turno ? doDia.filter((x) => x.turno === s.turno) : doDia;
      if (certos.length === 1) { s.slot = certos[0]; s.turno = certos[0].turno; s.lista = undefined; }
      else if (certos.length > 1) {
        s.lista = certos;
        return dizer(`Para ${fmtData(s.data)} tenho:\n${numerada(certos, comMedico)}\nQual fica melhor para você?`);
      } else {
        const pedido = `${fmtData(s.data)}${s.turno ? ` ${periodoTxt(s.turno)}` : ''}`;
        const alt = await alternativas(s.data, s.turno);
        s.data = undefined; s.turno = undefined;
        if (alt.length === 0) return out([...partes, 'Para essa data não encontrei vaga e, no momento, não vejo outras datas abertas. Vou pedir para a equipe conferir e te retornar.'].join('\n'), { motivo: `Sem vagas para ${sv.nome} no ${un.nome}.` });
        s.lista = alt;
        return dizer(`Para ${pedido} não há vaga. Tenho:\n${numerada(alt, comMedico)}\nQual fica melhor para você?`);
      }
    } else {
      const alt = await alternativas(addDias(h.ymd, 1), s.turno);
      if (alt.length === 0) return out([...partes, 'No momento não vejo vagas abertas. Vou pedir para a equipe conferir e te retornar.'].join('\n'), { motivo: `Sem vagas para ${sv.nome} no ${un.nome}.` });
      s.lista = alt;
      return dizer(`Tenho estas opções:\n${numerada(alt, comMedico)}\nQual delas fica melhor para você? Se preferir outro dia, é só me dizer.`);
    }
  }
  const slot = s.slot!;
  const resumoVaga = `${sv.frase} no ${un.nome}, ${fmtData(slot.ymd)}, ${periodoTxt(slot.turno)}, a partir das ${hora(slot.inicio)}, por ordem de chegada${slot.profissional ? `, com ${slot.profissional}` : ''}`;

  // 7b) forma de pagamento: pix (espera o comprovante), link de crédito (equipe envia) ou pagar na recepção
  const valorPix = un.precoPix;
  const pedirCpf = (pre: string) => dizer(`${pre} Para eu reservar, preciso do CPF do paciente. Qual é?`);
  const pixMsg = `Combinado! Segue a chave pix para o pagamento${valorPix ? ` de ${reais(valorPix)}` : ''}:\n\n${MARCA_PIX} ${env.pixKey}\n\nAssim que pagar, é só me enviar o comprovante por aqui que eu sigo com o seu agendamento.`;
  const deLink = () => out('Combinado! Vou pedir para a equipe te enviar o link de pagamento e concluir o agendamento, já com tudo anotado. Só um instante.', { motivo: `Paciente quer pagar por link de crédito: enviar o link e concluir o agendamento. Vaga: ${resumoVaga}. Agendamento AINDA NÃO feito.` });
  let preCpf = '';
  if (!s.pagFinal) {
    if (!s.pagPerguntado) {
      s.pagPerguntado = true;
      s.pagamento = lerPagamento(t); // se ele já adiantou a forma de pagamento, não pergunta de novo
      if (!s.pagamento) return dizer(`${pick(['Fechado', 'Combinado'], n)}, é ${resumoVaga}. Para agilizar o seu atendimento na recepção, gostaria de ${MARCA_PAGAMENTO} por pix ou link de crédito?`);
    } else if (!s.pagamento) {
      const f = lerPagamento(t);
      if (!f) {
        s.compTent += 1;
        if (s.compTent >= 3) return out('Vou passar para a equipe combinar o pagamento com você, já com tudo anotado. Só um instante.', { motivo: `Paciente não definiu a forma de pagamento. Vaga: ${resumoVaga}. Agendamento AINDA NÃO feito.` });
        return dizer('Prefere pagar por pix, por link de crédito ou na recepção, no dia do atendimento?');
      }
      s.pagamento = f;
      s.compTent = 0;
    } else if (aguardandoComprovante) {
      // já mandamos a chave pix: só seguimos com o comprovante, ou se ele desistir do pix
      const aEquipeComp = (aviso: string, motivo: string) => out(`${aviso} Vou pedir para a equipe conferir, já com tudo anotado. Só um instante.`, { motivo: `${motivo} Vaga: ${resumoVaga}. Agendamento AINDA NÃO feito.` });
      const falta = valorPix ? Math.max(0, valorPix - (s.pagoPix ?? 0)) : 0;
      if (RECEPCAO.test(t)) { s.pagamento = 'recepcao'; }
      else if (LINK.test(t) && !PIX.test(t)) { s.pagamento = 'link'; }
      else if (midia) {
        if (!ctx.lerComprovante) return aEquipeComp('Recebi o seu comprovante.', 'Comprovante de pix recebido, mas a leitura automática está indisponível: conferir a imagem.');
        const c = await ctx.lerComprovante(midia[2]).catch(() => null);
        const nova = (msg: string, motivo: string) => {
          s.compTent += 1;
          if (s.compTent >= 3) return aEquipeComp('Não estou conseguindo conferir o comprovante.', `Comprovante não pôde ser conferido após ${s.compTent} tentativas (${motivo}).`);
          return dizer(msg);
        };
        if (!c || c.tipo === 'ilegivel') return nova('Desculpa, não consegui ler essa imagem. Pode enviar de novo, de preferência o print do comprovante com o valor e a data visíveis?', 'imagem ilegível');
        if (c.tipo === 'outro') return nova('Essa imagem não parece ser um comprovante de pix. Pode enviar o comprovante do pagamento?', 'imagem que não é comprovante');
        if (c.status && c.status !== 'concluido') return nova('O comprovante não mostra o pagamento como concluído. Pode enviar o comprovante depois que o pix for efetuado?', `status ${c.status}`);
        if (!c.data) return nova('Não consegui ver a data no comprovante. Pode enviar o print completo, com valor e data?', 'sem data');
        if (c.data < addDias(h.ymd, -1) || c.data > h.ymd) return nova(`Esse comprovante é de ${fmtData(c.data)}. Preciso do comprovante do pagamento de hoje. Pode enviar o correto?`, `comprovante de ${c.data}`);
        if (c.valor == null) return nova('Não consegui ver o valor no comprovante. Pode enviar o print completo, com valor e data?', 'sem valor');
        const alvo = norm(`${c.destinatario ?? ''} ${c.chave ?? ''}`);
        if (alvo.trim() && ![...env.pixRecebedor.split(','), env.pixKey].some((k) => k.trim() && alvo.includes(norm(k)))) return aEquipeComp('O comprovante mostra um recebedor diferente do nosso.', `ATENÇÃO: comprovante com recebedor "${c.destinatario ?? c.chave}", diferente da chave ${env.pixKey}.`);
        // o mesmo comprovante não conta duas vezes
        if (c.transacao && (s.transacoes ?? []).includes(c.transacao)) return nova('Esse comprovante eu já recebi. Se tiver outro pagamento, é só me enviar.', 'comprovante repetido');
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
        preCpf = 'Pagamento confirmado, muito obrigada!';
      }
      else if (/pagu|fiz o pix|transferi|ja fiz|efetuei|enviei|mandei/.test(t)) return dizer('Que bom! Me envia o comprovante (foto ou print) para eu conferir e seguir com o seu agendamento.');
      else if (/chave|copia e cola|qr|valor|quanto/.test(t) || (s.pagoPix && (PIX.test(t) || /agora|restante|diferenca|falta/.test(t)))) return dizer(`Aqui está!\n${MARCA_PIX} ${env.pixKey}${valorPix ? `\nValor${s.pagoPix ? ' que falta' : ''}: ${reais(falta || valorPix)}` : ''}\nQuando pagar, me envia o comprovante por aqui, tá bom?`);
      else if (s.pagoPix) {
        s.compTent += 1;
        if (s.compTent >= 3) return aEquipeComp('Vou passar para a equipe combinar o restante do pagamento com você.', `Pagou ${reais(s.pagoPix)} por pix e não definiu como pagar o restante (${reais(falta)}).`);
        return dizer(`Ainda faltam ${reais(falta)}. Prefere pagar o restante agora por pix ou deixar para pagar na recepção?`);
      }
      else return dizer('Estou aguardando o comprovante do pix para seguir com o seu agendamento, tá bom? Se preferir pagar na recepção, é só me avisar.');
    }
    if (!s.pagFinal) {
      if (s.pagamento === 'link') return deLink();
      if (s.pagamento === 'recepcao') {
        s.pagFinal = true;
        if (s.pagoPix) { // pagou uma parte por pix: o resto fica para a recepção
          const resto = valorPix ? Math.max(0, valorPix - s.pagoPix) : 0;
          s.comprovante = { valor: s.pagoPix, data: s.comprovante?.data ?? h.ymd, nota: `Pix antecipado PARCIAL de ${reais(s.pagoPix)} (comprovante lido pela IA; CONFERIR no extrato)${resto ? `. Saldo de ${reais(resto)} a pagar na recepção` : ''}` };
          preCpf = `Combinado, ${resto ? `o restante, ${reais(resto)}, fica` : 'o restante fica'} para a recepção, no dia do atendimento.`;
        } else preCpf = 'Sem problema, o pagamento fica para a recepção, no dia do atendimento.';
      }
      else if (s.pagamento === 'pix') {
        if (!s.pixEnviado) { s.pixEnviado = true; return dizer(pixMsg); }
      }
    }
    if (s.pagFinal) return pedirCpf(preCpf);
    return dizer('Estou aguardando o comprovante do pix para seguir com o agendamento.');
  }

  // 8) CPF
  const slotAntes = Boolean(base.slot && base.pagFinal);
  if (!s.cpf) {
    const cpf = slotAntes ? cpfDoTexto(t) : undefined;
    if (cpf) s.cpf = cpf;
    else if (slotAntes && /\d{2,}/.test(t)) return dizer('Não consegui ler o CPF. Pode me enviar os 11 números?');
    else return dizer(`${pick(['Fechado', 'Combinado'], n)}, é ${resumoVaga}. Para eu reservar, preciso do CPF do paciente. Qual é?`);
  }

  // 9) consulta o paciente por CPF
  const acabouDeConsultar = s.paciente === undefined;
  if (s.paciente === undefined) {
    s.paciente = await fonte.paciente(s.cpf);
    if (s.paciente) return dizer(`Encontrei o cadastro de ${titulo(s.paciente.nome)}. É esse o paciente?`);
    return dizer('Não encontrei esse CPF no cadastro. Vou fazer o cadastro agora. Qual o nome completo do paciente?');
  }
  if (s.paciente && !s.pacienteConfirmado) {
    if (SIM.test(t)) s.pacienteConfirmado = true;
    else if (NAO.test(t)) { s.cpf = undefined; s.paciente = undefined; return dizer('Sem problema. Pode conferir o CPF e me enviar de novo?'); }
    else return dizer(`Esse cadastro é de ${titulo(s.paciente.nome)}. É esse o paciente?`);
  }

  // 10) CPF novo: coleta o cadastro, um dado por mensagem
  if (s.paciente === null) {
    const c = s.cad;
    if (!acabouDeConsultar) {
      if (!c.nome) { const m = limparNome(texto); if (/^[\p{L}' ]{5,80}$/u.test(m) && m.includes(' ') && !SIM.test(t) && !NAO.test(t)) c.nome = titulo(m); }
      else if (!c.nascimento) { const nsc = lerNascimento(texto); if (nsc) c.nascimento = nsc; }
      else if (!c.sexo) { if (/fem|mulher/.test(t)) c.sexo = 'feminino'; else if (/masc|homem/.test(t)) c.sexo = 'masculino'; }
      else if (!c.telefone) {
        const dig = texto.replace(/\D/g, '');
        if (c.pediuTelefone && dig.length >= 10 && dig.length <= 13) c.telefone = dig;
        else if (!c.pediuTelefone) { /* ainda vai perguntar */ }
        else if (SIM.test(t) && ctx.telefone) c.telefone = ctx.telefone.replace(/\D/g, '');
      }
    }
    if (!c.nome) return dizer(!acabouDeConsultar ? 'Preciso do nome completo do paciente, como está no documento. Qual é?' : 'Qual o nome completo do paciente?');
    if (!c.nascimento) return dizer(`Anotado, ${c.nome.split(' ')[0]}. Qual a data de nascimento? Pode ser no formato dia/mês/ano.`);
    if (!c.sexo) return dizer('O cadastro pede o sexo do paciente: feminino ou masculino?');
    if (!c.telefone) {
      const primeira = !c.pediuTelefone; c.pediuTelefone = true;
      return dizer(primeira ? 'Posso usar este número do WhatsApp como contato do paciente?' : 'Qual o telefone com DDD para contato?');
    }
  }

  // 11) conclui
  s.fim = true;
  const quem = s.paciente ? titulo(s.paciente.nome) : s.cad.nome ?? '';
  if (fonte.tipo === 'clinilink') {
    const novo = s.paciente ? `Paciente já cadastrado (${titulo(s.paciente.nome)}, id ${s.paciente.id ?? '?'}).` : `CADASTRAR paciente novo: ${s.cad.nome}, nascimento ${s.cad.nascimento ? fmtNasc(s.cad.nascimento) : '?'}, sexo ${s.cad.sexo}, telefone ${s.cad.telefone}, CPF ${s.cpf}.`;
    const aEquipe = (aviso: string, motivo: string) => out(`${aviso} Vou passar para a equipe concluir, já com tudo anotado. Só um instante.`, { motivo });

    if (!ctx.efetivar) return out('Fechado. Vou concluir a sua reserva, só um instante.'); // reprocessamento: nunca grava

    const r = await fonte.reservar!({
      servico: sv, unidade: un, slot, cpf: s.cpf!,
      pacienteId: s.paciente?.id,
      observacao: ['Agendado pela Amanda (IA) via WhatsApp', s.comprovante?.nota ?? (s.pagamento === 'recepcao' ? 'Pagamento na recepção' : '')].filter(Boolean).join('. '),
      cadastro: s.paciente ? undefined : { nome: s.cad.nome!, nascimento: s.cad.nascimento!, sexo: s.cad.sexo!, telefone: s.cad.telefone! },
    });
    if (r.ok) {
      const med = r.profissional ?? slot.profissional;
      const primeiro = quem.split(' ')[0];
      return out(`${MARCA_AGENDADO}! Deu tudo certo. ${s.paciente ? '' : `Cadastro de ${quem} feito. `}Ficou assim${primeiro ? ` para ${primeiro}` : ''}: ${sv.frase} no ${un.nome}, ${fmtData(slot.ymd)}, ${periodoTxt(slot.turno)}${med ? `, com ${med}` : ''}. O atendimento é por ordem de chegada, a partir das ${hora(r.hora)}, e recomendamos chegar cedinho. Estamos te esperando com carinho!`);
    }
    const extra = r.cadastrou ? ' O cadastro do paciente FOI criado.' : '';
    if (r.incerto) return aEquipe('Não consegui confirmar a reserva agora.', `ATENÇÃO: a reserva pode ou não ter sido gravada (${r.codigo}). CONFERIR no Clinilink antes de refazer. Vaga: ${resumoVaga}. ${novo}${extra}`);
    if (r.codigo === 'SEM_VAGA_AGORA' || r.codigo === 'HORARIO_OCUPADO') return aEquipe('Essa vaga acabou de ser preenchida.', `Vaga ocupada na hora de reservar (${r.codigo}). Oferecer outro horário. Pedido: ${resumoVaga}. ${novo}${extra}`);
    if (r.codigo === 'SERVICO_DUPLICADO_NO_DIA') return aEquipe('Vi que este paciente já tem esse atendimento marcado para o mesmo dia.', `Reserva recusada: ${r.codigo}. Conferir o agendamento existente. Pedido: ${resumoVaga}. ${novo}${extra}`);
    return aEquipe('Não consegui concluir a reserva.', `Reserva recusada pelo Clinilink (${r.codigo}: ${r.motivo}). Pedido: ${resumoVaga}. ${novo}${extra}`);
  }
  return out(`${s.paciente ? '' : `Cadastro de ${quem} feito. `}Sua vaga de ${sv.frase} está confirmada para ${fmtData(slot.ymd)}, na unidade ${un.nome}${slot.profissional ? `, com ${slot.profissional}` : ''}. Os atendimentos começam às ${hora(slot.inicio)}, por ordem de chegada. Recomendamos chegar cedo.\n(${MARCA_FIM} de verdade.)`);
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
