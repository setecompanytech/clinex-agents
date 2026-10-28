import type { Comprovante } from '../../../lib/comprovante.js';
import type { PedidoLido } from '../../../lib/pedidoMedico.js';
import { env } from '../../../lib/env.js';
import { exibir, exibirLista, generoConfirmado, prepararGeneros } from '../../../lib/genero.js';
import type { PedidoInterpretado } from '../../../lib/interpretarPedido.js';
import type { MensagemConversa, RespostaContextual } from '../../../lib/contexto.js';
import { RAIZES, rotuloDaEtapa, type AgendamentoExistente, type ComboInfo, type EscolherExames, type Fonte, type ItemDeCombo, type ItemExame, type OfertaCombo, type Orcamento, type PacienteInfo, type Periodo, type ResultadoReserva, type Servico, type Slot, type Unidade } from './catalog.js';

/**
 * Motor de conversa por roteiro. O estado é recalculado a cada mensagem reprocessando as mensagens do
 * paciente em ordem (sem banco). Os FATOS (unidades, médicos, preço, datas, paciente) vêm da fonte.
 *
 * Fluxo:
 *  1 recepção -> 2 paciente diz o que precisa (serviço direto ou sintoma) -> 3 IA sugere o serviço e o paciente confirma
 *  -> 4 IA consulta a agenda e informa as unidades que têm o serviço, com o médico de cada uma, e pergunta qual
 *  -> 5 paciente escolhe a unidade (e talvez já o dia) -> 6 IA lista datas e turnos com vaga (início da agenda)
 *  -> 7 paciente escolhe -> 8 IA resume e pede os dados (nome, nascimento, telefone, CPF; em qualquer ordem) -> 9 IA consulta o paciente
 *  e mostra o nome para confirmar -> 10 se o CPF não existe: pede o que falta do cadastro (o cadastro só é criado no fim)
 *  -> 11 IA pergunta a forma de pagamento (pix manda a chave e espera o comprovante) -> 12 conclui: cadastra se novo e agenda.
 * Estilo Amanda v7.3: sem emoji, sem travessão, sem asterisco, uma pergunta por mensagem.
 */

export type Cadastro = { nome?: string; nascimento?: string; sexo?: 'feminino' | 'masculino'; telefone?: string; pediuTelefone?: boolean };

/** Uma etapa do combo: um serviço (ou os exames de laboratório juntos). */
export type EtapaCombo = { itens: ItemDeCombo[]; estado: 'pendente' | 'feita' | 'pulada' | 'sem-agenda' | 'ja-tinha' };
/** O que já ficou agendado numa etapa (para a mensagem de confirmação do fim). */
export type FeitoCombo = { rotulo: string; frase: string; nomeBruto?: string; unidade: Unidade; ymd: string; turno: Periodo; hora: string; profissionalBruto?: string; linhas?: string[]; extra?: string; valor?: number; preparo?: string };
/** Combo em andamento: agendado em etapas, uma de cada vez. O serviço da etapa atual é o `servico` da conversa. */
export type ComboAndamento = {
  id: string; rotulo: string; total?: number; economia?: number; temRetorno: boolean;
  ordem: string[]; // ids dos serviços na ordem do combo (ao juntar opções, os serviços ficam nessa ordem)
  etapas: EtapaCombo[]; atual: number;
  perguntando?: boolean; // ela perguntou se o paciente quer agendar a próxima etapa agora e espera a resposta
  tent: number; // respostas que não responderam essa pergunta
  feitos: FeitoCombo[]; cadastrou?: boolean; unidadePref?: string; diaPref?: string;
};

export type State = {
  saudou: boolean;
  servico?: Servico;
  opcoes?: { id: string; nome: string }[];
  opcoesTexto?: { intro: string; pergunta: string }; // texto próprio da lista (pedido genérico: "Estes são os exames mais procurados...")
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
  ate?: string; // pediu "essa semana", "até dia 25"...: só vale horário até essa data (senão ela diz que não tem e mostra o mais próximo)
  ofereceuEquipe?: string; // serviço pedido que não foi encontrado: ela ofereceu chamar a equipe e espera a resposta
  preUnidade?: string; // unidade citada antes de o serviço ser conhecido (aplicada quando ele for)
  pagPref?: 'pix' | 'link' | 'recepcao'; // forma de pagamento adiantada pelo paciente, antes de a pergunta ser feita
  querAgenda?: boolean; // o paciente perguntou pela agenda ("quando tem agenda?"): os horários vêm na mesma resposta
  listaMista?: boolean; // a lista na tela mistura horários de mais de uma unidade (cada item diz a unidade; escolher um define a unidade)
  pagoPix?: number; // soma dos comprovantes já conferidos (o paciente pode pagar em mais de um pix)
  transacoes?: string[]; // ids de transação já contados, para o mesmo comprovante não valer duas vezes
  pos?: Pos; // logo depois de um agendamento concluído
  /** O Clinilink recusou porque o paciente já tem esse serviço no dia: ela avisou e espera o que ele quer (manter, marcar mais um em outro dia ou remarcar). */
  dup?: { ymd: string; unidade: string; servicoId: string; tent: number; esclareceu?: boolean };
  diasBloqueados?: string[]; // dias que não devem mais ser oferecidos (o dia do agendamento que já existe)
  combo?: ComboAndamento; // agendando um combo, etapa por etapa
  ofertaCombo?: { opcoes: OfertaCombo[]; vezes: number }; // ela sugeriu combos que incluem o serviço e espera a resposta
  comboOferecido?: boolean; // a sugestão de combos já foi feita nesta jornada (uma vez só)
  desde?: string; // a lista de horários da etapa seguinte do combo começa nesse dia (o dia da etapa anterior)
  orcamento?: Orcamento; // orçamento de exames em andamento (pedido médico em foto ou os nomes dos exames)
  examesDoPedido?: boolean; // o serviço da conversa são os exames de um orçamento aprovado (não volta ao orçamento)
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
  /** Intérprete do pedido (IA): quando as regras não acham o serviço, entende o que o paciente quis dizer (com o contexto) e devolve um termo de busca. Sempre validado. */
  interpretarPedido?: (p: { texto: string; anteriores: string[]; conversa?: MensagemConversa[] }) => Promise<PedidoInterpretado | null>;
  /** A conversa lida antes de responder: as últimas mensagens dos DOIS lados (inclui a última pergunta da Amanda). */
  conversa?: MensagemConversa[];
  /** Trecho "Ficou ..." da última confirmação de agendamento (até 24 h): serve para responder "já tá agendado?" sem recomeçar a conversa. */
  confirmacao?: string;
  /** Leitor de contexto (IA): a mensagem não respondeu à pergunta pendente; lê a conversa e responde só com os fatos verificados. */
  contexto?: (p: { conversa: MensagemConversa[]; mensagem: string; fatos: string; perguntaPendente: string }) => Promise<RespostaContextual | null>;
  ultima?: boolean; // é a última mensagem da última rodada (só ela recebe resposta de verdade)
  anteriores?: string[]; // o que o paciente já tinha dito nesta jornada (contexto para o intérprete)
  /** Reprocessamento: a resposta que a Amanda deu a ESTA mensagem foi o aviso de "já tem esse atendimento no dia" (o agente deduz do histórico). */
  duplicadoAqui?: boolean;
  duplicadoNosTurnos?: number[]; // índices dos turnos cuja resposta foi esse aviso
  /** Lê a foto de um pedido médico (id da mensagem): os nomes dos exames pedidos. */
  lerPedido?: (idMensagem: string) => Promise<PedidoLido | null>;
  /** IA que casa os nomes do pedido com os exames do catálogo (sempre validada). */
  casarExames?: EscolherExames;
  inicioJornada?: Date; // quando o paciente começou este pedido (primeira mensagem da jornada): comprovante feito antes disso é de outro atendimento
};
/** `duro`: depois desta transferência a Amanda NÃO retoma sozinha (a equipe assume), como no pedido de atendente humano. */
export type Handoff = { motivo: string; urgente?: boolean; duro?: boolean };
export type Result = {
  state: State; reply: string; handoff?: Handoff; silencio?: boolean;
  aposHandoffDuro?: boolean; // a conversa já passou por uma transferência que a Amanda NÃO deve desfazer (pediu humano, urgência)
  faq?: boolean; // a resposta já traz a resposta a uma dúvida (horário, valor...)
  direta?: boolean; // o roteiro respondeu exatamente o que o paciente disse (ex.: "já pode deixar pago?"): a camada de contexto não entra
  passos?: number; // quantas mensagens do paciente já foram processadas na conversa (varia as frases; vai junto com o estado guardado)
};

/** Etapa legível da conversa, para o painel de logs. */
export function etapa(s: State, handoff?: Handoff): string {
  if (handoff?.urgente) return 'segurança (emergência/crise)';
  if (handoff) return 'transferida para a equipe';
  if (s.fim) return 'concluída';
  if (s.orcamento) return s.orcamento.fase === 'coletando' ? 'orçamento: esperando o pedido médico' : s.orcamento.fase === 'confirmando' ? 'orçamento: confirmando os exames' : 'orçamento: oferecendo a coleta';
  if (s.ofertaCombo) return 'escolhendo entre os combos sugeridos';
  if (s.combo?.perguntando) return 'combo: decidindo a próxima etapa';
  if (!s.servico) return s.opcoes ? 'escolhendo entre opções de serviço' : 'recepção / entendendo o serviço';
  if (!s.servicoConfirmado) return 'confirmando o serviço';
  if (!s.unidade) return 'escolhendo a unidade';
  if (!s.slot) return 'escolhendo data e turno';
  if (!s.cpf) return 'pedindo o CPF';
  if (s.paciente === undefined) return 'consultando o paciente';
  if (s.paciente === null && !(s.cad.nome && s.cad.nascimento && s.cad.telefone && s.cad.sexo)) return 'cadastro do paciente novo';
  if (s.paciente && !s.pacienteConfirmado) return 'confirmando o paciente';
  if (!s.pagFinal) return s.pagamento === 'pix' && s.pixEnviado ? 'aguardando o comprovante do pix' : 'escolhendo a forma de pagamento';
  return 'concluindo o agendamento';
}

/** Marcas na mensagem final; o agente abre uma jornada nova depois delas. */
export const MARCA_FIM = 'Simulação: nada foi agendado';
export const MARCA_AGENDADO = 'Agendamento confirmado';
export const MARCA_MAIS = 'Posso te ajudar com mais alguma coisa';
export const MARCA_ADEUS = 'Tenha um ótimo dia';
export const MARCA_PIX = 'Chave pix:';
export const MARCA_PAGAMENTO = 'antecipar o pagamento';
/** Aviso de que o paciente já tem o atendimento no dia: o agente reconhece essa mensagem no histórico para a conversa continuar do mesmo ponto. */
export const MARCA_DUP = 'Vi que esse paciente já tem';
export const MARCAS_FIM = [MARCA_FIM, MARCA_AGENDADO, MARCA_MAIS, MARCA_ADEUS];
/** Mensagens com texto exato (valores, chave, marcas): não passam pelo GPT. */
export const SEM_GPT = [MARCA_AGENDADO, MARCA_MAIS, MARCA_ADEUS, MARCA_PIX, MARCA_PAGAMENTO];
/** Textos que o Giovanny aprovou palavra por palavra (unidades, horários, "o mais rápido", comprovante, aviso de segurança do sintoma): também não passam pelo GPT. */
SEM_GPT.push('encontrei estes exames', 'Anotei estes exames', 'Total: R$', 'Total no ', 'total dos exames', 'foto do pedido médico', 'não entraram na soma', 'não entrou na soma', 'combo', 'Combo', MARCA_DUP, 'Está sim, confirmado!', 'Tenho sim!', 'Consegui estes aqui', 'Esses são os horários que tenho', 'Guamá: Endereço:', 'Travessa Coronel Luís Bentes com a Rua do Úna', 'Claro! Tenho estes combos', 'Claro! Tenho combos de', ' inclui: ', 'me manda por favor os dados do paciente', 'Como você prefere pagar', 'O mais rápido que tenho é', 'O último que tenho é', 'Não to conseguindo ler esse comprovante', 'Recebi o seu comprovante', 'Pelo que você contou');

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
/** Data e minutos do dia, no fuso da clínica, de um instante. */
function noFuso(tz: string, d: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d).map((x) => [x.type, x.value]));
  return { ymd: `${p.year}-${p.month}-${p.day}`, min: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}
/** Quanto antes do pedido do paciente o pagamento ainda vale (ele pode ter pago e só então escrito; relógios de banco e de WhatsApp diferem um pouco). */
const TOLERANCIA_COMPROVANTE_MIN = 10;
const toDate = (ymd: string) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const addDias = (ymd: string, n: number) => { const d = toDate(ymd); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diaSemana = (ymd: string) => toDate(ymd).getUTCDay(); // 0 = domingo
const fmtData = (ymd: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(toDate(ymd));
const hora = (hhmm: string) => { const [h, m] = hhmm.split(':'); return m === '00' ? `${Number(h)}h` : `${Number(h)}h${m}`; };
const periodoTxt = (t: Periodo) => (t === 'manhã' ? 'de manhã' : 'à tarde');
const NOMES_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEM_CURTA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
/** "quinta, dia 22" (ou "quinta, dia 5 de novembro" quando é em outro mês). `ref` = hoje. */
const dataCurta = (ymd: string, ref: string) => { if (ymd === ref) return 'hoje'; const d = toDate(ymd); return `${SEM_CURTA[d.getUTCDay()]}, dia ${d.getUTCDate()}${ymd.slice(0, 7) === ref.slice(0, 7) ? '' : ` de ${NOMES_MES[d.getUTCMonth()]}`}`; };
/** "quinta (22)" / "terça (3/11)": para o resumo. */
const dataResumo = (ymd: string, ref: string) => { if (ymd === ref) return 'hoje'; const d = toDate(ymd); return `${SEM_CURTA[d.getUTCDay()]} (${d.getUTCDate()}${ymd.slice(0, 7) === ref.slice(0, 7) ? '' : `/${d.getUTCMonth() + 1}`})`; };
/** "quinta dia 22": para frase corrida, sem vírgula. */
const dataFalada = (ymd: string, ref: string) => dataCurta(ymd, ref).replace(',', '');
/** "na quinta (22)" / "no sábado (24)": para o resumo falado. */
const diaResumo = (ymd: string, ref: string) => ymd === ref ? 'hoje' : `${[0, 6].includes(toDate(ymd).getUTCDay()) ? 'no' : 'na'} ${dataResumo(ymd, ref)}`;
/** "quinta, dia 22 de outubro": sempre com o mês, para a confirmação final não deixar dúvida. */
const dataLonga = (ymd: string) => { const d = toDate(ymd); return `${SEM_CURTA[d.getUTCDay()]}, dia ${d.getUTCDate()} de ${NOMES_MES[d.getUTCMonth()]}`; };
/** Nomes de médicos na conversa: "a Dra. Fernanda" / "o Dr. Armando" (nome completo só se dois tiverem o mesmo primeiro nome). */
const nomesExib = (nomes: (string | undefined)[]) => { const u = [...new Set(nomes.filter((x): x is string => Boolean(x)))]; const ex = exibirLista(u, { artigo: true }); return new Map(u.map((n, i) => [n, ex[i]])); };
/** "a Dra. Fernanda e o Dr. Armando". */
const juntar = (itens: string[]) => (itens.length <= 1 ? (itens[0] ?? '') : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`);
/** Uma lista de horários com um item só vira pergunta de sim ou não ("Esse horário fica bom?"), como a atendente faz. */
const fechoLista = (n: number) => (n === 1 ? 'Esse horário fica bom pra você?' : 'Qual desses fica bom pra você?');
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
  if (/\bhoje\b|\bagora (pela|de|a|na|no|mesmo)\b/.test(t)) return h.ymd;
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
/** Emergência ou crise: a Amanda não espera os 15 s de agrupamento de mensagens para responder. */
export const ehUrgencia = (texto: unknown) => { if (typeof texto !== 'string') return false; const t = norm(texto); return EMERGENCIA.test(t) || CRISE.test(t); };
const HUMANO = /atendente|humano|pessoa de verdade|falar com alguem|falar com uma pessoa|(falar|conversar|chamar|chama|passar|passa|pedir|quero|pode chamar).{0,20}(recepcao|recepcionista|equipe)/;
const SIM = /^(s+i+m+|s|pode|pode (sim|reservar|agendar|marcar|confirmar|fazer|seguir|continuar|ser)|quero|quero sim|ok|okay|isso|isso (mesmo|ai|a)|e isso|e isso mesmo|e esse|e esse mesmo|esse (mesmo|ai)|ele mesmo|ela mesma|exato|exatamente|confirmo|confirma|confirmado|fechado|fechou|combinado|bora|vamos|vamo|vai la|manda ver|claro|claro que sim|mas claro|com certeza|por favor|ta bom|ta certo|ta otimo|ta|tudo bem|correto|certo|certinho|perfeito|otimo|beleza|blz|demorou|uhum|aham|u+h+u+m+|positivo|afirmativo|yes|sim senhora|sim senhor|sou eu|sou eu mesmo)\b/;
const RETOMAR = /\b(retom\w*|continu\w*|dar continuidade|voltei|ainda quero|onde (a gente )?parou|de onde paramos|seguir com (o|meu) agendamento)\b/;
const NAO = /^(nao|n|nope|nao quero|nao obrigad|nao e|nao era|nao eh|nao mesmo|nao senhora|nao senhor|negativo|nada disso|nem|nenhum|nenhuma|errado|errei|incorreto|ta errado|de jeito nenhum|jamais|outro|outra|prefiro outro|prefiro outra)\b/;
/**
 * Palavras de conversa, pagamento, dia, período e agenda: uma mensagem feita só delas ("na recepção", "hoje", "meu bem não quer enviar",
 * "eu pago assim que chegar aí") NÃO traz nome de serviço, então não se procura serviço nela (a busca por parecido achava "Retenção" em "recepção").
 */
const PALAVRAS_DE_CONVERSA = new Set(('pagar pago pagamento pagando pix recepcao clinica link credito debito cartao dinheiro hoje amanha manha tarde noite semana proxima proximo proximos dias '
  + 'quero queria vamos posso podemos pode deixa deixar deixe agendado agendar marcar marcado marcada assim chegar chegando chego chegou meu minha bem nao quer querer enviar mandar manda tentar '
  + 'tenho tinha quando depois antes ainda agora entao tudo obrigado obrigada favor mais muito esse essa este esta aqui tambem claro gostaria estou seria ficar fica fico ficou horario horarios '
  + 'vaga vagas agenda disponivel disponibilidade consegue conseguir mesmo isso aquele desse unidade unidades dia essa semana pessoal gente moca moco doutor doutora senhora senhor segunda terca quarta '
  + 'quinta sexta sabado domingo lado outro outra outros outras algum alguma qualquer tanto faz primeiro ultimo cedo rapido possivel depois eles ela ele nosso nossa vezes vez uns umas fazer realizar fazendo fazem venho vindo posso poderia ainda mesmo coisa tipo').split(' '));
function semNomeDeServico(t: string, unidades: string[] = []): boolean {
  const resto = norm(t).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !PALAVRAS_DE_CONVERSA.has(w) && !unidades.some((u) => w === norm(u)));
  return resto.length === 0;
}
/** Palavras curtas e do dia a dia que mostram que a frase NÃO é um nome ("um minuto", "já vou mandar", "pode ser esse"). */
const NAO_E_NOME = new Set('sim nao nem pix oi ola bom boa dia tchau vou vai ver tem ter pra por que cpf rg telefone nascimento nome completo data whatsapp numero esse essa este esta isso aguarda aguarde espera espere minuto minutinho momento segundo mande mando enviar enviei mandei comprovante paciente tambem ainda agora entao tudo obrigado obrigada favor claro certo combinado pode ser fica ficar manda mandar segue seguindo aqui consulta consultas exame exames medico medica doutor doutora resultado resultados laudo atestado receita orcamento valor preco quanto custa marcar agendar remarcar cancelar sangue urina fezes hemograma ultrassom usg raio tomografia ressonancia mamografia eletrocardiograma ecocardiograma endoscopia colonoscopia papanicolau preventivo realizar fazer'.split(' '));
/** Orientação de preparo longa (várias linhas ou texto grande) vai como mensagem própria, do jeito que está cadastrada no Clinilink; a curta leva uma frase de abertura. */
const preparoLongo = (p: string) => p.includes('\n') || p.length > 160;
/** A mensagem tem cara de nome de pessoa ("Silmara Emanuele Sousa da Silva"): 2+ palavras de letras, sem palavra de conversa, de pedido ou de exame. */
function pareceNome(txt: string, tn: string): boolean {
  if (/[?\d]/.test(txt)) return false;
  const m = limparNome(txt);
  const toks = m.split(/\s+/).filter(Boolean);
  const proibida = toks.some((w) => { const x = norm(w); return NAO_E_NOME.has(x) || (x.length > 3 && PALAVRAS_DE_CONVERSA.has(x)); });
  return /^[\p{L}' ]{5,80}$/u.test(m) && toks.length >= 2 && toks.filter((w) => w.length >= 3).length >= 2 && !proibida && !SIM.test(tn) && !NAO.test(tn);
}
const SO_CUMPRIMENTO =/^(oi+|ola|ola+ boa|e ai|ei|bom dia|boa tarde|boa noite|teste|ola teste|agente de ia|amanda|atendimento|tudo bem\??|oie)[\s!.,?]*(teste|amanda|tudo bem\??)?[\s!.,?]*$/;

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
  // "um", "uma", "dois"... só valem como posição quando são a resposta inteira ("dois", "o dois", "quero a uma", "opção um"): no começo de uma
  // frase são artigo/quantidade ("um teste ergo", "uma consulta de cardiologia", "dois exames") e não escolhem a opção 1 ou 2
  const w = t.match(new RegExp(`^\\s*${FILL}(um|uma|dois|duas|tres|quatro|cinco)(?:\\s+(?:por favor|pfv|pf|mesmo|ai|ok|fechado|fechou|beleza|obrigad[oa]))*\\s*[.!]*\\s*$`)) ?? t.match(/\b(?:opcao|alternativa|numero)\s+(um|uma|dois|duas|tres|quatro|cinco)\b/);
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

const RECEPCAO = /nao (quero|vou|precisa|preciso|pretendo)( mais)?( de)? (pagar|antecipar|adiantar)|(so|apenas|somente)( quero| queria| preciso)? agendar|pagar (la|na recepcao|na clinica|na hora|no dia|depois|presencial)|pago (la|na recepcao|na clinica|na hora|no dia|depois)|\bna recepcao\b|\bna clinica\b|presencial|pessoalmente|\bdinheiro\b|\bdebito\b|depois eu pago|na hora que chegar|pag(o|ar|aria|arei) (assim que|quando|ao) (chegar|chego|eu chegar)|pago (ai|aqui)\b|(pode )?deix(a|ar|e) (so )?(agendado|marcado|reservado)\b/;
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
/** Os dados do paciente, pedidos de uma vez assim que o serviço e o dia estão definidos (como a atendente faz). */
const PEDIDO_DADOS = 'Pra gerar o agendamento, me manda por favor os dados do paciente:\n• Nome completo\n• Data de nascimento\n• Telefone para contato (pode ser esse número do WhatsApp)\n• CPF';
/** Forma de pagamento dita com todas as letras (sem tratar "não" como resposta). */
function lerPagamentoFirme(t: string): 'pix' | 'link' | 'recepcao' | undefined {
  if (RECEPCAO.test(t)) return 'recepcao';
  if (PIX.test(t)) return 'pix';
  if (LINK.test(t)) return 'link';
  return undefined;
}
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
  ['preparo', /\b(jejum|preparo|preparad[oa]s?|preparacao|preparar|o que levar|preciso levar|levar (algum |algum outro )?(exame|documento|documentos)|que documentos?)\b/],
];
/** "??", "tá aí?", "tem alguém?": o paciente só está chamando. */
const PING = /^(\?+|oi+\s*\?+|ola\s*\?+|alo\s*\??|ta ai\s*\??|tem alguem( ai)?\s*\??|cade\s*\??|voce (esta|ta) ai\s*\??|e entao\s*\??|ei\s*\??|hello\s*\??)[\s!.?]*$/;
const PING_SAUDACAO = /^(oi+|ola|bom dia|boa tarde|boa noite)[\s!.?]*$/;
function detectaFaq(t: string, emAtendimento: boolean): Faq | undefined {
  if (PING.test(t) || (emAtendimento && PING_SAUDACAO.test(t))) return 'ping';
  return FAQ.find(([, re]) => re.test(t))?.[0];
}
/**
 * Pergunta ou pedido sobre a AGENDA ("quando tem agenda?", "tem horário?", "quais as datas disponíveis?", "tem vaga?"). É o paciente pedindo os
 * horários: o roteiro mostra a agenda na mesma resposta (sem esperar outra mensagem) e a camada de contexto não entra (não é dúvida sem resposta).
 */
export const QUER_AGENDA = /(?<!\b(?:minha|meu|nossa|nosso)\s)\b(agenda|agendas|disponibilidade)\b|\b(quando|quais|qual|que dias?|tem|tinha|existe|ha|mostr\w+|manda\w*|pass\w+|ver|veja)\b[^.?!]{0,30}\b(horarios?|vagas?|datas?|disponiv\w+|proxim\w+)\b|\b(horarios?|vagas?|datas?)\s+(disponiv\w+|livres?|abertas?)\b/;
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

/** Endereços aprovados pela clínica, palavra por palavra (não passam pelo GPT). O primeiro tem o link do mapa. */
const ENDERECOS: { re: RegExp; texto: string }[] = [
  { re: /guama/, texto: 'Guamá: Endereço: Av. José Bonifácio, 2426 - Guamá, Belém - PA, 66063-075\nhttps://share.google/VHM9fHMaWIUZujkl3' },
  { re: /telegrafo/, texto: 'Telégrafo: Travessa Coronel Luís Bentes com a Rua do Úna, nº 170A, no bairro do Telégrafo, em Belém (PA).' },
];
/** O endereço da unidade que o paciente citou; senão o da unidade que ele já escolheu; senão o das duas (uma mensagem para cada). */
export function textoEnderecos(t: string, unidadeEscolhida?: string): string {
  const citadas = ENDERECOS.filter((e) => e.re.test(t));
  const doEscolhido = unidadeEscolhida ? ENDERECOS.filter((e) => e.re.test(norm(unidadeEscolhida))) : [];
  return (citadas.length ? citadas : doEscolhido.length ? doEscolhido : ENDERECOS).map((e) => e.texto).join('\n\n');
}
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

// ---------- paciente que já tem o atendimento no dia ----------
const DUP_PERGUNTA = 'O que você prefere: manter esse que já está marcado, marcar mais um em outro dia ou remarcar esse que já está agendado?';
const DUP_MANTER = /\b(manter|mantem|mantenha|mantenho|deixa (assim|como (esta|ta))|pode deixar|esta bom|ta bom|era so (isso|pra confirmar|para confirmar)|so (queria|quero) (conferir|confirmar|saber)|nao precisa|esse mesmo|fica esse|fica assim)\b/;
const DUP_NOVO = /\b(mais um|mais uma|outro agendamento|novo agendamento|marcar outro|agendar outro|marcar outra|alem (desse|dele|do que)|tambem|dois|duas)\b/;
const DUP_REMARCAR = /\b(remarc\w*|reagend\w*|trocar|troca|alterar|altera|adiar|antecipar|transferir|passar (ele|esse|o) pra|mudar (o agendamento|esse|ele|aquele))\b/;
const DUP_DIA = /\b(outro dia|outra data|outro horario|mudar (o )?dia|mudar a data|dia diferente|trocar o dia)\b/;
const DUP_CONFIRMA = /\b(ja|entao)\b.*\b(agendad\w*|marcad\w*)\b|\b(esta|ta|ficou) (agendad|marcad)\w*/;

// ---------- orçamento de exames ----------
/** Não tem o pedido médico ("não tenho", "esqueci o pedido"). */
const ORC_SEM_PEDIDO = /\b(nao tenho( o)?( pedido)?|sem (o )?pedido|perdi( o pedido)?|esqueci( o pedido)?|nao (to|estou) com (o )?pedido|nao tenho aqui)\b/;
/** Tirar exames da lista ("tira a glicose", "sem o colesterol", "não quero o 2"). */
const ORC_REMOVER = /\b(tira\w*|retira\w*|remove\w*|exclui\w*|desconsidera\w*|sem|nao (quero|vou fazer|preciso)( d[oa]s?)?)\b/;
/** Desistir do orçamento. */
const ORC_DESISTIR = /\b(cancela\w*|deixa (pra la|assim|quieto)|esquece|nao quero (mais )?(o )?(orcamento|fazer))\b/;
/** Falar de combo no meio do orçamento: a conversa segue pelo fluxo de combos. */
const ORC_COMBO = /\bcombo\b|\bcheck ?-?up\b/;
/** Palavras que sozinhas NÃO são nome de exame ("são vários", "segue o pedido", "esses mesmos"). */
const SO_CONVERSA_EXAMES = new Set(('sao varios varias alguns algumas uns umas todos todas esses esse essas essa mesmo mesma isso estes estas aqui segue seguem anexo foto pedido medico medica exames exame quero queria preciso fazer mais tambem dois duas tres alguma coisa tudo '
  + 'ola bom dia tarde noite obrigado obrigada favor pode ser claro sim nao ok certo ta tudo bem sei lembro nome nomes escrever mandar manda mando enviar envio enviei lista tenho vou ver depois agora hoje amanha laboratorio laboratoriais sangue coleta orcamento valor valores quanto custa total soma').split(' '));
/** Os nomes de exames escritos numa mensagem: um por linha, por vírgula, ponto e vírgula, marcador ou "+". ("hemograma e glicemia" fica junto: quem acha o exame separa.) */
export function extrairNomesExames(texto: string): string[] {
  const t = texto.replace(TOKEN_MIDIA, ' ').replace(/^\s*(oi|ola|bom dia|boa tarde|boa noite)[,!.\s]+/i, '')
    .replace(/^\s*(quero|queria|preciso|gostaria)\s+(de\s+)?(fazer|realizar)?\s*/i, '').replace(/^\s*(os exames\s+)?(s[aã]o|seguem?|segue|exames?:)\s+/i, '');
  return t.split(/[\n,;•]+|\s+\+\s+/).map((c) => c.replace(/^(?:\s*(?:e|mais|tamb[eé]m|tbm|al[eé]m disso|ainda|falta|faltou|quero|queria|preciso|fazer|fazer o|o|a|os|as|um|uma)\b[\s,]*)+/i, '').trim()).filter((c) => norm(c).split(/[^a-z0-9]+/).some((w) => (w.length >= 3 || /\d/.test(w)) && !SO_CONVERSA_EXAMES.has(w) && !PALAVRAS_DE_CONVERSA.has(w)));
}
const arred2 = (n: number) => Math.round(n * 100) / 100;
/** O preço de um exame: o mesmo valor nas unidades (um só), ou o de cada unidade. */
const precoDoItem = (i: ItemExame): string => {
  const v = Object.entries(i.precos);
  if (v.length === 0) return 'valor a confirmar com a equipe';
  if (new Set(v.map(([, p]) => p)).size === 1) return reais(v[0][1]);
  return v.map(([u, p]) => `${reais(p)} no ${u}`).join(' e ');
};
/** A soma dos exames: um total só quando é igual em todas as unidades; senão um por unidade (só das unidades em que todos os exames têm valor). */
function totaisDoOrcamento(itens: ItemExame[]) {
  const comPreco = itens.filter((i) => Object.keys(i.precos).length > 0);
  const semPreco = itens.filter((i) => Object.keys(i.precos).length === 0);
  const unidades = [...new Set(comPreco.flatMap((i) => Object.keys(i.precos)))];
  const completas = unidades.filter((u) => comPreco.every((i) => typeof i.precos[u] === 'number'));
  const porUnidade = completas.map((u) => ({ u, total: arred2(comPreco.reduce((a, i) => a + i.precos[u], 0)) })).filter((x) => x.total > 0);
  const unico = porUnidade.length > 0 && new Set(porUnidade.map((x) => x.total)).size === 1 && porUnidade.length === unidades.length ? porUnidade[0].total : undefined;
  const soma = porUnidade.length ? Math.min(...porUnidade.map((x) => x.total)) : undefined;
  return { semPreco, porUnidade, unico, soma };
}

// ---------- combo ----------
/** Depois de agendar uma etapa do combo: o paciente não quer agendar a próxima agora ("depois", "por enquanto", "só isso", "agora não"). */
const COMBO_PARAR = /\b(deixa(r)? (assim|pra depois|para depois|por hoje|pra outro dia|para outro dia)|fica (assim|pra depois|para depois)|por hoje|so (isso|esse|essa|esses|essas)|por enquanto|agora nao|nao (quero|vou|preciso)|nao (posso|da|consigo) (agora|hoje|mais)|ja (chega|basta|esta bom|ta bom)|outra hora|outro momento|depois (eu )?(vejo|marco|agendo|volto|chamo)|encerr\w+)\b/;
/** O paciente recusou os combos sugeridos e quer só o serviço ("só a consulta", "sem combo", "não quero combo", "avulso"). */
const COMBO_RECUSA = /\b(so|apenas|somente)\b|\bsem combo\b|\bavulso\b|\bnao (quero|preciso|vou|precisa)\b|\bnenhum\b|\bmesmo\b/;
/** Perguntas sobre os combos sugeridos: ela mostra a lista de novo. */
const COMBO_DUVIDA = /\b(combo|combos|inclui|incluso|economi\w*|desconto|diferenca|vale a pena|como funciona)\b/;
/** Desistir do combo ("sem combo", "deixa o combo", "só a consulta mesmo"). */
const COMBO_DESISTIR = /\b(sem (o )?combo|nao quero (mais )?(o |esse )?combo|deixa (o )?combo|cancela (o )?combo|esquece (o )?combo|(so|apenas|somente) (a|o) (consulta|exame))\b/;
/** A resposta do paciente à lista de combos sugeridos: o combo escolhido (número ou nome) ou as versões em dúvida ("cardio 2" tem três: holter, mapa, ergométrico). */
function escolherOferta(t: string, opcoes: OfertaCombo[]): { escolha?: OfertaCombo; duvida: OfertaCombo[] } {
  const idx = lerEscolha(t, opcoes.length);
  if (idx >= 0 && opcoes[idx]) return { escolha: opcoes[idx], duvida: [] };
  const simples = (o: OfertaCombo) => norm(o.rotulo).replace(/\s*\(.*?\)/g, '').replace(/[^a-z0-9 ]/g, '').trim();
  const porNome = opcoes.filter((o) => new RegExp(`\\b${simples(o).replace(/ /g, ' ?')}\\b`).test(t));
  const refinado = porNome.length > 1 ? porNome.filter((o) => (norm(o.rotulo).match(/\((.*?)\)/)?.[1] ?? '').split(/[^a-z0-9]+/).filter(Boolean).every((w) => t.includes(w))) : porNome;
  if (refinado.length === 1) return { escolha: refinado[0], duvida: [] };
  return { duvida: porNome.length > 1 ? porNome : [] };
}

/** "Vi que esse paciente já tem consulta X marcado pra quinta dia 22 no Guamá de manhã a partir das 8h com a Dra. Y." (ou, sem achar o agendamento, só o dia). */
function textoDuplicado(sv: Servico, ymd: string, ref: string, ex: AgendamentoExistente | null): string {
  if (!ex) return `${MARCA_DUP} esse atendimento marcado pro mesmo dia (${dataFalada(ymd, ref)}).`;
  return `${MARCA_DUP} ${sv.frase} marcado pra ${dataFalada(ymd, ref)} no ${ex.unidade}${ex.periodo ? ` ${periodoTxt(ex.periodo)}` : ''}${ex.hora ? ` a partir das ${hora(ex.hora)}` : ''}${ex.profissional && !sv.profissional ? ` com ${exibir(ex.profissional, { artigo: true })}` : ''}.`;
}

// ---------- mensagem de confirmação do agendamento (modelo da clínica) ----------
export const FORMAS_PAGAMENTO = 'CARTÃO DE DÉBITO, CREDITO (VISA E MASTER), DINHEIRO, PIX';

/** Profissional no modelo: sala/agenda ("SALA DE EXAMES") do jeito cadastrado; pessoa com o nome completo e Dr./Dra. (sem título se o gênero não for certo). */
function profissionalNoModelo(bruto?: string): string {
  const b = (bruto ?? '').trim();
  if (!b) return '';
  if (b.startsWith('.') || /\bsala\b/i.test(b) || /^(coleta|exames?|laborat\w*|recepc\w*|triagem|ultrassom|usg)\b/i.test(b)) return b; // agenda de sala/setor, não pessoa
  return exibir(b, { curto: titulo(b) });
}

/**
 * Confirmação depois da reserva feita de verdade: primeiro o aviso (é ele que marca o fim da jornada), depois o modelo da clínica com os
 * dados do agendamento, depois as orientações do atendimento (se houver) e uma sugestão. Cada parágrafo vai como uma mensagem.
 * "Formas de pagamento" vira "PAGO NO PIX" quando o comprovante foi recebido na conversa.
 */
/** "Formas de pagamento" do modelo: o que a clínica aceita, ou PAGO NO PIX (inteiro ou em parte) quando o comprovante foi recebido. */
function formasDePagamento(pagoPix: number | undefined, valor: number | undefined): string {
  const pago = pagoPix ?? 0;
  return pago <= 0 ? FORMAS_PAGAMENTO
    : valor && pago + 0.005 < valor ? `PAGO ${reais(pago)} NO PIX (comprovante recebido); o restante na recepção`
    : 'PAGO NO PIX (comprovante recebido)';
}
/** O modelo de confirmação da clínica para UM agendamento (as linhas que a recepção escreve). */
function modeloDaClinica(p: { paciente: string; profissional: string; procedimento: string; unidade: Unidade; ymd: string; hora?: string; valor?: number; formas: string; rotuloValor?: string }): string {
  const hora = (p.hora ?? '').slice(0, 5);
  const u = p.unidade;
  return [
    `Paciente: ${p.paciente}`,
    ...(p.profissional ? [`Profissional: ${p.profissional}`] : []),
    `Procedimento: ${p.procedimento}`,
    `📆 Data: ${fmtNasc(p.ymd)}${hora ? ` a partir de ${hora}` : ''} *POR ORDEM DE CHEGADA*`,
    `🏥 Clínica: ${u.nomeBruto ?? `CLINEX ${u.nome.toLocaleUpperCase('pt-BR')}`}`,
    ...(u.endereco ? [`📍 Endereço: ${u.endereco}`] : []),
    ...(u.telefone ? [`☎ Telefone: ${u.telefone}`, `📲 WhatsApp: ${u.telefone}`] : []),
    `${p.rotuloValor ?? 'Valor particular'}: ${p.valor ? reais(p.valor) : 'a confirmar na recepção'}`,
    `Formas de pagamento: ${p.formas}`,
  ].join('\n');
}

/**
 * Confirmação do COMBO, no fim: o aviso (é ele que marca o fim da jornada), o modelo da clínica de cada etapa agendada (o valor é o do serviço dentro do
 * combo), as orientações, o que ficou pendente e o fecho. Etapa que não foi agendada não entra nos modelos: aparece como pendente.
 */
export function mensagemConfirmacaoCombo(p: { paciente: string; primeiroNome?: string; combo: ComboAndamento; pagoPix?: number }): string {
  const c = p.combo;
  const nomeDe = (e: EtapaCombo) => rotuloDaEtapa(e.itens);
  const completo = c.etapas.length > 0 && c.etapas.every((e) => e.estado === 'feita');
  const modelos = c.feitos.map((f) => {
    const prof = profissionalNoModelo(f.profissionalBruto);
    const proc = f.linhas?.length ? f.linhas.join(', ') : `${f.nomeBruto ?? f.rotulo.toLocaleUpperCase('pt-BR')}${prof ? ` - ${prof}` : ''}`;
    return modeloDaClinica({ paciente: p.paciente, profissional: f.linhas?.length ? '' : prof, procedimento: `${proc} (COMBO ${c.rotulo.toLocaleUpperCase('pt-BR')})`, unidade: f.unidade, ymd: f.ymd, hora: f.hora, valor: f.valor, formas: formasDePagamento(p.pagoPix, c.total), rotuloValor: 'Valor no combo' });
  });
  const pendentes = c.etapas.filter((e) => e.estado === 'pendente' || e.estado === 'pulada');
  const semAgenda = c.etapas.filter((e) => e.estado === 'sem-agenda');
  const jaTinha = c.etapas.filter((e) => e.estado === 'ja-tinha');
  return [
    `${MARCA_AGENDADO}! Deu tudo certo${p.primeiroNome ? `, ${p.primeiroNome}` : ''}.${c.cadastrou ? ` Cadastro de ${p.paciente} feito.` : ''}${modelos.length > 1 ? ` Seguem os agendamentos do combo ${c.rotulo}:` : ''}`,
    ...modelos,
    ...c.feitos.filter((f) => f.extra).map((f) => f.extra!),
    ...c.feitos.filter((f) => f.preparo).map((f) => (preparoLongo(f.preparo!) ? f.preparo! : `Uma orientação importante pro seu atendimento (${f.rotulo}): ${f.preparo}`)),
    ...(jaTinha.length ? [`${juntar(jaTinha.map(nomeDe))} já estava agendado, então ficou como estava.`] : []),
    ...(semAgenda.length ? [`Pra ${juntar(semAgenda.map(nomeDe))} não tinha vaga aberta agora. A equipe vai te ajudar com isso.`] : []),
    ...(pendentes.length ? [`Ficou pendente no combo: ${juntar(pendentes.map(nomeDe))}. Quando quiser agendar é só me chamar que a gente continua.`] : []),
    ...(completo && c.total ? [`O combo ${c.rotulo} fechou em ${reais(c.total)}${c.economia ? `, uma economia de ${reais(c.economia)}` : ''}.`] : []),
    `Se puder, chega cedinho, que o atendimento é por ordem de chegada. Quer aproveitar e agendar mais algum exame ou consulta?`,
  ].join('\n\n');
}

export function mensagemConfirmacao(p: { paciente: string; novoCadastro: boolean; servico: Servico; unidade: Unidade; ymd: string; hora?: string; profissionalBruto?: string; valor?: number; pagoPix?: number; primeiroNome?: string; linhas?: string[]; extra?: string }): string {
  const prof = profissionalNoModelo(p.profissionalBruto);
  // etapa com vários exames: cada serviço agendado, com o profissional (ou a sala) do cadastro, como a atendente escreve
  const proc = p.linhas?.length ? p.linhas.join(', ') : `${p.servico.nomeBruto ?? p.servico.nome.toLocaleUpperCase('pt-BR')}${prof ? ` - ${prof}` : ''}`;
  const modelo = modeloDaClinica({ paciente: p.paciente, profissional: prof, procedimento: proc, unidade: p.unidade, ymd: p.ymd, hora: p.hora, valor: p.valor, formas: formasDePagamento(p.pagoPix, p.valor) });
  return [
    `${MARCA_AGENDADO}! Deu tudo certo${p.primeiroNome ? `, ${p.primeiroNome}` : ''}.${p.novoCadastro ? ` Cadastro de ${p.paciente} feito.` : ''}`,
    modelo,
    ...(p.extra ? [p.extra] : []),
    ...(p.servico.preparo ? [preparoLongo(p.servico.preparo) ? p.servico.preparo : `Uma orientação importante pro seu atendimento: ${p.servico.preparo}`] : []),
    'Se puder, chega cedinho, que o atendimento é por ordem de chegada. Quer aproveitar e agendar mais algum exame ou consulta?',
  ].join('\n\n');
}

// ---------- leitor de contexto ----------
/** "já tá agendado?", "então está marcado?", "deu certo?": pergunta sobre o agendamento, não um pedido novo. */
const STATUS_Q = /\b(ja|entao)\b.{0,30}\b(agendad\w*|marcad\w*|confirmad\w*)\b|\b(esta|ta|foi|ficou) (mesmo )?(agendad|marcad|confirmad)\w*|\bdeu certo\b|\bqual (e )?(o )?(horario|dia)\b.{0,20}\b(mesmo|ficou)\b/;

/** O que falta, por etapa, para responder "já tá agendado?" no meio do fluxo. */
const FALTA_DA_ETAPA: Record<string, string> = {
  'confirmando o serviço': 'falta você confirmar o serviço',
  'escolhendo a unidade': 'falta escolher a unidade',
  'escolhendo data e turno': 'falta escolher o dia e o horário',
  'escolhendo a forma de pagamento': 'falta combinar a forma de pagamento',
  'aguardando o comprovante do pix': 'tô só esperando o comprovante do pix',
  'pedindo o CPF': 'faltam os dados do paciente (nome, data de nascimento, telefone e CPF)',
  'cadastro do paciente novo': 'falta terminar o cadastro do paciente',
  'confirmando o paciente': 'falta você confirmar se o cadastro é do paciente',
};
/** A mensagem tem cara de dúvida (interrogação ou começa como pergunta)? */
const EH_PERGUNTA = /\?|^(como|quanto|qual|quais|quando|onde|por ?que|posso|pode|preciso|precisa|tem|tenho|da pra|e se|sera|aceita|existe|vai|vou|devo|isso)\b/;

/** O que mudou nesta mensagem? Se nada avançou, o paciente não respondeu à pergunta pendente. */
const marcaDeProgresso = (x: State) => JSON.stringify([
  x.servico?.id, x.servico?.profissional?.id, x.servicoConfirmado, x.confirmPerguntado, x.unidadesInformadas, x.opcoes?.length ?? 0, x.unidade?.nome, x.lista?.length ?? 0,
  x.slot ? `${x.slot.ymd}${x.slot.inicio}` : null, x.pagPerguntado, x.pagamento, x.pagFinal, x.pixEnviado, x.pagoPix, x.cpf,
  x.paciente === undefined ? 'u' : x.paciente === null ? 'n' : x.paciente.nome, x.pacienteConfirmado, x.cad, x.dup?.tent, x.dup?.esclareceu,
  x.ofereceuEquipe, x.data, x.turno, x.rapido, x.apartir, x.ate,
  x.combo ? [x.combo.atual, x.combo.perguntando ?? false, x.combo.tent, x.combo.feitos.length, x.combo.etapas.map((e) => e.estado)] : null, x.ofertaCombo ? x.ofertaCombo.vezes : null, x.comboOferecido ?? false,
  x.orcamento ? [x.orcamento.fase, x.orcamento.itens.length, x.orcamento.naoAchados.length, x.orcamento.tent, x.orcamento.pediuNomes] : null,
]);

/** Os fatos VERIFICADOS da conversa (só o que o roteiro já sabe), de onde o leitor de contexto pode tirar a resposta. */
export function fatosDoEstado(s: State, ref: string, confirmacao?: string): string {
  const L: string[] = [];
  const sv = s.servico;
  if (sv) {
    L.push(`Serviço em andamento: ${sv.frase}${s.servicoConfirmado ? ' (o paciente já confirmou que é esse)' : ' (ainda não confirmado pelo paciente)'}`);
    if (sv.precoTexto) L.push(`Valor: ${sv.precoTexto}`);
    L.push(`Onde tem agenda: ${textoUnidades(sv, 'duvida')}`);
  }
  if (s.combo) {
    const c = s.combo;
    L.push(`Combo em andamento: ${c.rotulo}${c.total ? ` (${reais(c.total)}${c.economia ? `, economia de ${reais(c.economia)}` : ''})` : ''}. Já agendado: ${c.feitos.map((f) => `${f.rotulo} em ${dataFalada(f.ymd, ref)}`).join('; ') || 'nada ainda'}. Falta agendar: ${c.etapas.filter((e) => e.estado === 'pendente').map((e) => rotuloDaEtapa(e.itens)).join(', ') || 'nada'}`);
  }
  if (s.orcamento) L.push(`Orçamento de exames em andamento (${s.orcamento.fase}): ${s.orcamento.itens.map((i) => i.nome).join(', ') || 'nenhum exame ainda'}`);
  if (s.unidade) L.push(`Unidade escolhida: ${s.unidade.nome}`);
  if (s.slot) L.push(`Horário escolhido: ${slotFalado(s.slot, true, ref)}`);
  if (s.pagFinal) L.push(s.pagoPix ? `Pagamento: o comprovante de ${reais(s.pagoPix)} já foi recebido` : 'Pagamento: fica para a recepção, no dia do atendimento');
  else if (s.pagamento === 'pix') L.push('Pagamento: por pix, esperando o comprovante');
  if (s.dup) L.push(`O paciente já tem esse atendimento marcado no dia ${dataFalada(s.dup.ymd, ref)} (nenhum outro foi feito agora)`);
  if (confirmacao) L.push(`Último agendamento já confirmado: ${confirmacao}`);
  // o que a clínica informa sobre pagamento e atendimento (para responder dúvidas sem inventar)
  L.push('Pagamento: dá pra pagar por pix, cartão de crédito e débito ou dinheiro em espécie. Antecipar por pix é opcional e serve para agilizar o atendimento na recepção; também dá pra pagar na recepção, no dia do atendimento. Pagamento por link de crédito é combinado com a equipe, que envia o link.');
  L.push('O atendimento é por ordem de chegada: o horário informado é a hora em que a agenda abre, não um horário marcado individual.');
  if (env.clinicHorario) L.push(`Horário de funcionamento da clínica: ${env.clinicHorario}`);
  L.push(s.dup ? 'Situação: o paciente já tem esse atendimento marcado; ela espera ele decidir o que fazer'
    : s.combo?.feitos.length ? 'Situação: o combo está sendo agendado etapa por etapa; o que consta como "Já agendado" está confirmado no sistema'
    : sv ? `Situação: o agendamento ainda NÃO foi feito; etapa atual: ${etapa(s)}`
    : 'Situação: ainda não foi pedido nenhum serviço nesta conversa');
  return L.join('\n');
}

/**
 * Passo da conversa + leitor de contexto. Se a mensagem NÃO fez a conversa avançar (não respondeu à pergunta pendente) e não é uma
 * dúvida que o roteiro já responde, um modelo lê a conversa inteira e responde só com os fatos verificados; a pergunta pendente vem depois.
 */
export async function step(prev: State, texto: string, ctx: Ctx, fonte: Fonte, n = 0): Promise<Result> {
  const r = await stepBase(prev, texto, ctx, fonte, n);
  if (!ctx.ultima || r.handoff || r.silencio || !r.reply || r.state.fim || r.faq || r.direta) return r;
  const t = norm(texto.replace(TOKEN_MIDIA, ' '));
  if (t.length < 6 || SIM.test(t) || NAO.test(t) || SO_CUMPRIMENTO.test(t) || soAgradecimento(t) || TOKEN_MIDIA.test(texto)) return r;
  if (QUER_AGENDA.test(t)) return r; // pergunta pela agenda: o roteiro responde com os horários (a camada de contexto não entra)
  if (marcaDeProgresso(prev.fim ? novoEstado() : prev) !== marcaDeProgresso(r.state)) return r; // a conversa avançou: a mensagem era a resposta esperada
  const antes = (extra: string): Result => {
    const ab = r.reply.match(/^Oi[^\n]*Aqui é a Amanda, da Clinex\./); // a resposta entra depois da saudação de abertura
    return { ...r, reply: ab ? `${ab[0]}\n${extra}${r.reply.slice(ab[0].length).replace(/^[ \n]/, '\n')}` : `${extra}\n${r.reply}` };
  };
  // "já tá agendado?" no meio do fluxo: a resposta é conhecida (o que falta), sem depender de modelo
  if (STATUS_Q.test(t) && r.state.servico) return antes(`Ainda não está agendado${FALTA_DA_ETAPA[etapa(r.state)] ? `, ${FALTA_DA_ETAPA[etapa(r.state)]}` : ''}.`);
  if (!ctx.contexto) return r;
  const c = await ctx.contexto({ conversa: ctx.conversa ?? [], mensagem: texto.replace(TOKEN_MIDIA, ' ').trim(), fatos: fatosDoEstado(r.state, hoje(ctx).ymd, ctx.confirmacao), perguntaPendente: r.reply }).catch(() => null);
  // dúvida de verdade (tem "?" ou começa como pergunta) que os fatos não respondem: não inventa e deixa com a equipe; segue a pergunta pendente.
  // (uma resposta que o roteiro não entendeu, como "daqueles de sangue", não é dúvida: não recebe essa frase)
  if (c && EH_PERGUNTA.test(t) && ((c.tipo === 'pergunta' && !c.resposta) || (c.tipo === 'comentario' && texto.includes('?')))) {
    return antes('Essa eu prefiro confirmar direitinho antes de te responder, pra não te passar nada errado. Se quiser, é só me pedir que eu chamo alguém da recepção pra te ajudar.');
  }
  if (!c?.resposta || c.tipo !== 'pergunta') return r; // só responde PERGUNTA com fatos; desabafo e conversa solta seguem o roteiro
  return antes(c.resposta);
}

// ---------- núcleo ----------
async function stepBase(prev: State, texto: string, ctx: Ctx, fonte: Fonte, n = 0): Promise<Result> {
  // depois de uma jornada concluída, uma nova mensagem abre outra jornada (mantém a saudação já feita)
  const s: State = prev.fim ? { ...novoEstado(), saudou: true } : { ...prev, cad: { ...prev.cad }, combo: prev.combo ? structuredClone(prev.combo) : undefined, ofertaCombo: prev.ofertaCombo ? structuredClone(prev.ofertaCombo) : undefined, orcamento: prev.orcamento ? structuredClone(prev.orcamento) : undefined };
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
        if (s.combo?.total && !esperandoPix()) { const c = s.combo; const txt = `O combo ${c.rotulo} é ${reais(c.total!)}${c.economia ? `, você economiza ${reais(c.economia)}` : ''}.`; return reply.includes(txt) ? '' : txt; }
        if (!sv || esperandoPix()) return '';
        // sem preço cadastrado: não inventa nem fala "zero"; a equipe confirma
        if (!sv.precoTexto) return `O valor desse atendimento eu prefiro que a equipe confirme certinho pra você.${EQUIPE}`;
        return reply.includes(sv.precoTexto) ? '' : sv.precoTexto;
      case 'pagto': return reply.includes(MARCA_PAGAMENTO) ? '' : 'Dá pra antecipar por pix (eu te passo a chave) ou por link de crédito. Na recepção, no dia, aceitamos pix, cartão de crédito e débito e dinheiro.';
      case 'medicos':
      case 'unidades': {
        if (!sv) return faq === 'unidades' && nomesUnFaq.length ? `Temos as unidades ${nomesUnFaq.join(' e ')}.` : '';
        if (reply.includes(MARCA_UNIDADES)) return '';
        return textoUnidades(sv, 'duvida');
      }
      // o que eu não sei com segurança, não invento: a equipe confirma
      case 'endereco': return textoEnderecos(t, s.unidade?.nome);
      case 'convenio': return `Sobre convênios a equipe confirma direitinho pra você e assim ninguém te passa informação errada.${EQUIPE}`;
      case 'preparo': {
        if (sv?.preparo) return reply.includes(sv.preparo) ? '' : preparoLongo(sv.preparo) ? sv.preparo : `Sobre o preparo: ${sv.preparo}`;
        return 'Sobre preparo eu prefiro confirmar direitinho pra não te orientar errado. Se quiser, é só me pedir que eu chamo alguém da recepção pra te passar.';
      }
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
  const out = (reply: string, handoff?: Handoff): Result => { s.saudou = true; const resp = handoff ? reply : comFaq(reply); return { state: s, reply: resp, handoff, faq: resp !== reply }; };
  const comAbertura = (txt: string) => (abertura ? `${abertura}\n${txt}` : txt);
  const partes: string[] = [];
  if (abertura) partes.push(abertura);
  const dizer = (...txt: string[]) => out([...partes, ...txt].join(abertura && partes.length === 1 && txt.length === 1 && !txt[0].includes('\n') ? ' ' : '\n'));
  let mudouServico = false;

  // ---------- combo: agendado em etapas, uma de cada vez ----------
  const nomeEtapa = (e: EtapaCombo) => rotuloDaEtapa(e.itens);
  const pendentesDoCombo = (c: ComboAndamento) => c.etapas.map((e, i) => ({ e, i })).filter((x) => x.e.estado === 'pendente');
  /**
   * Abre a etapa `k`: o serviço dela passa a ser o da conversa (na unidade da etapa anterior, se ela atender lá; os horários começam no dia da anterior).
   * `primeira`: o que o paciente adiantou (dia, período, "o mais rápido") ainda vale. false = a etapa não tem agenda aberta.
   */
  const abrirEtapa = async (k: number, primeira = false): Promise<boolean> => {
    const c = s.combo!;
    const sv2 = await fonte.etapaDoCombo!({ id: c.id, rotulo: c.rotulo, total: c.total }, c.etapas[k].itens);
    if ('semAgenda' in sv2) { c.etapas[k].estado = 'sem-agenda'; return false; }
    const pref = c.unidadePref ?? s.unidade?.nome;
    c.atual = k;
    s.servico = sv2; s.opcoes = undefined; s.servicoConfirmado = true; s.confirmPerguntado = true; s.unidadesInformadas = false;
    s.unidade = pref ? sv2.unidades.find((u) => norm(u.nome) === norm(pref)) : undefined;
    s.lista = undefined; s.listaMista = false; s.slot = undefined; s.dup = undefined;
    if (!primeira) { s.data = undefined; s.turno = undefined; s.rapido = undefined; s.apartir = undefined; s.ate = undefined; s.desde = c.diaPref; }
    mudouServico = true;
    return true;
  };
  /** Para a equipe, em qualquer transferência no meio do combo: onde ele parou (o que já foi agendado e o que falta). */
  const notaCombo = () => {
    const c = s.combo;
    if (!c) return '';
    const feitos = c.feitos.map((f) => `${f.rotulo} (${fmtNasc(f.ymd)} ${f.hora}, ${f.unidade.nome})`).join('; ') || 'nada ainda';
    return `COMBO ${c.rotulo} (etapa ${c.atual + 1} de ${c.etapas.length}: ${nomeEtapa(c.etapas[c.atual])}). Já agendado: ${feitos}. Pendente: ${c.etapas.filter((e) => e.estado === 'pendente').map(nomeEtapa).join(', ') || 'nada'}`;
  };
  /** As opções ainda pendentes, numeradas, e a pergunta de quais o paciente quer agendar agora (uma, várias juntas ou todas). */
  const perguntaProxima = (c: ComboAndamento) => {
    const falta = pendentesDoCombo(c);
    if (falta.length === 1 && c.feitos.length > 0) return `Falta só ${nomeEtapa(falta[0].e)} no combo. Quer agendar agora?`;
    const lista = falta.map((x, k) => `${k + 1}. ${nomeEtapa(x.e)}`).join('\n');
    return c.feitos.length === 0
      ? `Os itens do combo são:\n${lista}\nQuais você quer agendar agora? Pode ser um, vários juntos (ex.: 1 e 3) ou todos. Se preferir, eu sigo começando por ${nomeEtapa(c.etapas[c.atual])}.`
      : `Ainda falta no combo:\n${lista}\nQuer agendar algum agora? Pode ser um, vários juntos ou todos. Se preferir parar por aqui, é só falar.`;
  };
  /** Acabou (tudo agendado ou o paciente parou): manda a confirmação de cada agendamento do combo. Etapa sem agenda aberta avisa a equipe. */
  const finalizaCombo = async (): Promise<Result> => {
    const c = s.combo!;
    c.perguntando = false; s.fim = true;
    if (c.feitos.length === 0) return out(`Combinado, não fiz nenhum agendamento novo. ${MARCA_MAIS}?`); // (o paciente já tinha tudo marcado ou desistiu)
    await prepararGeneros(c.feitos.map((f) => f.profissionalBruto));
    const quem = s.paciente ? titulo(s.paciente.nome) : s.cad.nome ?? '';
    const reply = mensagemConfirmacaoCombo({ paciente: quem, primeiroNome: quem.split(' ')[0], combo: c, pagoPix: s.pagoPix });
    const semAgenda = c.etapas.filter((e) => e.estado === 'sem-agenda');
    if (semAgenda.length) return out(reply, { motivo: `COMBO ${c.rotulo}: sem vaga aberta para ${juntar(semAgenda.map(nomeEtapa))}. Já agendado: ${c.feitos.map((f) => `${f.rotulo} (${fmtNasc(f.ymd)} ${f.hora}, ${f.unidade.nome})`).join('; ') || 'nada'}. Paciente: ${quem}. Agendar o que faltou.` });
    return out(reply);
  };
  /** Terminou uma etapa: abre a próxima com agenda e pergunta o que o paciente quer agendar agora; sem próxima, fecha o combo. */
  const seguirCombo = async (aviso: string): Promise<Result> => {
    const c = s.combo!;
    for (const x of pendentesDoCombo(c)) {
      if (await abrirEtapa(x.i)) { c.perguntando = true; c.tent = 0; s.fim = false; return out(`${aviso}\n\n${perguntaProxima(c)}`); }
    }
    return finalizaCombo();
  };
  /**
   * O combo foi escolhido: mostra o preço e o que inclui e pergunta quais itens o paciente quer agendar agora (um, vários juntos ou todos; por padrão
   * ela segue a ordem do combo no Clinilink, ou começa pelo serviço que o levou ao combo). Combo de uma opção só vai direto para a unidade e o dia.
   */
  const iniciaCombo = async (vehicle: Servico, primeiroSv?: Servico): Promise<Result | undefined> => {
    const pacote = vehicle.pacote;
    if (!pacote || !fonte.etapaDoCombo) return undefined;
    const etapas: EtapaCombo[] = pacote.etapas.map((ids) => ({ itens: ids.map((id) => pacote.itens.find((i) => i.id === id)).filter((x): x is ItemDeCombo => Boolean(x)), estado: 'pendente' as const })).filter((e) => e.itens.length > 0);
    s.combo = { id: pacote.id, rotulo: pacote.rotulo, total: pacote.total, economia: pacote.economia, temRetorno: pacote.temRetorno, ordem: pacote.itens.map((i) => i.id), etapas, atual: 0, tent: 0, feitos: [] };
    let ini = 0;
    if (primeiroSv) {
      const chave = (x: string) => [...new Set(norm(x).split(/[^a-z0-9]+/).filter((w) => w.length > 2))].sort().join(' ');
      const k = etapas.findIndex((e) => e.itens.some((i) => i.id === primeiroSv.id || chave(i.nome) === chave(primeiroSv.nomeBruto ?? primeiroSv.nome)));
      if (k >= 0) ini = k;
    }
    for (const k of [ini, ...etapas.map((_, i) => i).filter((i) => i !== ini)]) {
      if (!(await abrirEtapa(k, true))) continue;
      const c = s.combo!;
      if (vehicle.precoTexto) partes.push(vehicle.precoTexto);
      if (vehicle.detalhe) partes.push(`\n${vehicle.detalhe}`);
      if (pendentesDoCombo(c).length === 1) {
        partes.push(`\n${etapas[k].itens.length > 1 ? 'Os exames do combo ficam todos no mesmo dia.' : `É um agendamento só: ${nomeEtapa(etapas[k])}.`}\n`);
        return undefined;
      }
      c.perguntando = true;
      return dizer(`\n${perguntaProxima(c)}`);
    }
    s.combo = undefined; s.servico = undefined;
    return out(comAbertura(`Poxa, no momento não tenho vaga aberta pra o combo ${pacote.rotulo}. Vou chamar alguém da equipe pra conferir e te retornar.`), { motivo: `Sem vagas abertas para o combo ${pacote.rotulo}.` });
  };
  /** Posições (em `c.etapas`) das opções pendentes que o paciente citou pelo nome ("a consulta", "o ultrassom e o eletro"). */
  const etapasCitadas = (tt: string, c: ComboAndamento): number[] => {
    const GENERICAS = new Set(['consulta', 'exame', 'exames', 'teste', 'completo', 'total', 'geral']);
    const palavras = new Set(tt.split(/[^a-z0-9]+/).filter(Boolean));
    if (/\bultrasson\w*|\bultrassom\b/.test(tt)) palavras.add('usg');
    const pend = pendentesDoCombo(c);
    const achadas = new Set<number>();
    for (const x of pend) {
      const dela = [...new Set(x.e.itens.flatMap((i) => norm(i.curto).split(/[^a-z0-9]+/)).filter((w) => w.length >= 3 && !GENERICAS.has(w)))];
      if (dela.some((w) => palavras.has(w) || [...palavras].some((k) => k.length >= 5 && w.startsWith(k)))) achadas.add(x.i);
    }
    if (/\bconsulta\b/.test(tt)) { const cs = pend.filter((x) => x.e.itens.some((i) => /^consulta\b/.test(norm(i.nome)))); if (cs.length === 1) achadas.add(cs[0].i); }
    if (/\b(laborat\w*|coleta|sangue)\b/.test(tt)) { const ls = pend.filter((x) => x.e.itens.some((i) => /laborat/i.test(i.categoria ?? ''))); if (ls.length === 1) achadas.add(ls[0].i); }
    return [...achadas].sort((a, b) => a - b);
  };
  /** O que o paciente escolheu entre as opções pendentes: todas, pelos números ("1 e 3"), pelo nome ou "o primeiro". Posições em `c.etapas`; undefined = não escolheu. */
  const lerSelecao = (tt: string, c: ComboAndamento): number[] | undefined => {
    const pend = pendentesDoCombo(c);
    if (pend.length === 0) return undefined;
    if (/\b(todos|todas)\b|\btudo (junto|de uma vez|isso|agora)\b|\b(quero|pode ser|vamos de|marca) tudo\b|^\s*tudo[\s!.]*$/.test(tt) || (pend.length === 2 && /\b(os dois|as duas|ambos|ambas|os 2)\b/.test(tt))) return pend.map((x) => x.i);
    const palavras = tt.split(/[^a-z0-9]+/).filter(Boolean);
    const nums = palavras.filter((w) => /^[1-9]$/.test(w));
    const LIGACAO = new Set(['o', 'a', 'os', 'as', 'item', 'itens', 'numero', 'numeros', 'opcao', 'opcoes', 'quero', 'queria', 'pode', 'ser', 'so', 'apenas', 'somente', 'agendar', 'marcar', 'e', 'com', 'mais', 'junto', 'juntos', 'tambem', 'agora', 'vamos', 'sim', 'por', 'favor', 'pfv']);
    if (nums.length && palavras.every((w) => /^[1-9]$/.test(w) || LIGACAO.has(w))) {
      const pos = [...new Set(nums.map((n) => Number(n) - 1))].filter((k) => k < pend.length);
      if (pos.length) return pos.map((k) => pend[k].i);
    }
    const citadas = etapasCitadas(tt, c);
    if (citadas.length) return citadas;
    const o = lerEscolha(tt, pend.length);
    return o >= 0 && o < pend.length ? [pend[o].i] : undefined;
  };
  /**
   * Abre o que o paciente escolheu: uma opção, ou VÁRIAS juntas num agendamento só (o mesmo dia; o que a mesma agenda atende vai no mesmo horário).
   * Se os itens não têm dia em comum, volta a oferecer um de cada vez. false = a opção escolhida não tem agenda.
   */
  const escolherEtapas = async (idxs: number[], primeira: boolean): Promise<boolean> => {
    const c = s.combo!;
    const ord = [...new Set(idxs)].sort((a, b) => a - b);
    if (ord.length === 1) return ord[0] === c.atual && s.servico ? true : abrirEtapa(ord[0], primeira);
    const original = structuredClone(c.etapas);
    const ordem = c.ordem ?? [];
    const uniao = ord.flatMap((i) => c.etapas[i].itens).sort((a, b) => ordem.indexOf(a.id) - ordem.indexOf(b.id));
    const nova: EtapaCombo[] = []; let pos = -1;
    c.etapas.forEach((e, i) => { if (!ord.includes(i)) nova.push(e); else if (pos < 0) { pos = nova.length; nova.push({ itens: uniao, estado: 'pendente' }); } });
    c.etapas = nova;
    if (await abrirEtapa(pos, primeira)) { partes.push(`Beleza, vamos agendar ${nomeEtapa(c.etapas[pos])} juntos, no mesmo dia.`); return true; }
    c.etapas = original;
    partes.push('Esses itens não têm um dia em comum na agenda, então a gente agenda um de cada vez.');
    return abrirEtapa(ord[0], primeira);
  };
  // ---------- orçamento de exames: o paciente manda o pedido médico (foto ou nomes), ela acha os exames no Clinilink, mostra os valores e a soma ----------
  const PEDIR_PEDIDO = 'Claro! Pra eu te passar o valor certinho, me manda uma foto do pedido médico. Se não tiver o pedido, pode me escrever o nome dos exames, em uma mensagem ou em várias.';
  const novoOrcamento = (): Orcamento => ({ fase: 'coletando', itens: [], naoAchados: [], origem: 'texto', tent: 0, pediuNomes: false });
  const dir = (r: Result): Result => ({ ...r, direta: true }); // resposta exata ao que o paciente disse: a camada de contexto não entra
  const perguntaOrcamento = (o: Orcamento) => (o.fase === 'coletando' ? (o.pediuNomes ? 'Me escreve o nome de cada exame que você precisa, pode ser em várias mensagens. Se tiver o pedido médico, a foto também serve.' : PEDIR_PEDIDO)
    : o.fase === 'confirmando' ? 'São esses mesmos? Se faltar algum ou tiver algum a mais, é só me avisar.' : 'Quer que eu já agende a coleta desses exames?');
  /** A lista dos exames com o valor de cada um, a soma, o que não foi achado e a dica de combo (se houver), terminando na pergunta de confirmação. */
  const textoOrcamento = async (o: Orcamento, intro?: string): Promise<string> => {
    const t = totaisDoOrcamento(o.itens);
    const total = t.unico !== undefined ? `Total: ${reais(t.unico)}` : t.porUnidade.map((x) => `Total no ${x.u}: ${reais(x.total)}`).join('\n');
    const lista = [intro ?? (o.origem === 'foto' ? 'Li o pedido e encontrei estes exames:' : 'Anotei estes exames:'), ...o.itens.map((i) => `• ${i.nome}: ${precoDoItem(i)}`), ...(total ? ['', total] : [])].join('\n');
    const partesO = [lista];
    if (t.semPreco.length) partesO.push(`${juntar(t.semPreco.map((i) => i.nome))} ${t.semPreco.length > 1 ? 'estão' : 'está'} sem valor cadastrado, então ${t.semPreco.length > 1 ? 'esses não entraram' : 'esse não entrou'} na soma e a equipe confirma o preço.`);
    if (o.naoAchados.length || o.ilegivel) partesO.push(`${o.naoAchados.length ? `Não achei no sistema: ${juntar(o.naoAchados)}. ${o.naoAchados.length > 1 ? 'Esses não entraram' : 'Esse não entrou'} na soma e a equipe pode conferir pra você.` : ''}${o.ilegivel ? `${o.naoAchados.length ? ' ' : ''}Tem trecho do pedido que eu não consegui ler.` : ''}`);
    const dica = t.soma !== undefined && o.itens.length >= 2 ? await fonte.dicaDeCombo?.(o.itens, t.soma).catch(() => undefined) : undefined;
    if (dica) partesO.push(dica);
    partesO.push(perguntaOrcamento({ ...o, fase: 'confirmando' }));
    return partesO.join('\n\n');
  };
  /** Casa os nomes com o Clinilink, junta aos exames já anotados e mostra a lista para o paciente confirmar. */
  const adicionarExames = async (nomes: string[], origem: 'foto' | 'texto', ilegivel = false): Promise<Result> => {
    const o = s.orcamento!;
    const r = await fonte.casarExames!(nomes, ctx.casarExames);
    if (r.externos.length) {
      // serviço EXTERNO no pedido: a equipe atende. Vai para a linha de atendimento principal e a Amanda não retoma sozinha.
      const achados = [...o.itens, ...r.itens].map((i) => i.nome);
      return out(`Nesse pedido tem ${r.externos.length > 1 ? 'exames' : 'exame'} de serviço externo (${juntar(r.externos)}), que a nossa equipe atende direto. Vou te encaminhar pra nossa linha de atendimento principal e o time continua com você por lá. Já deixei tudo anotado. Só um instante.`,
        { duro: true, motivo: `Orçamento de exames: o pedido do paciente tem serviço(s) EXTERNO(S): ${r.externos.join('; ').slice(0, 300)}. Exames da clínica que a Amanda achou: ${achados.join(', ').slice(0, 300) || 'nenhum'}. Não achados: ${[...o.naoAchados, ...r.naoAchados].join('; ').slice(0, 200) || 'nenhum'}. Atender o paciente (orçamento e agendamento).` });
    }
    for (const it of r.itens) if (!o.itens.some((x) => x.id === it.id)) o.itens.push(it);
    for (const n of r.naoAchados) if (!o.naoAchados.includes(n)) o.naoAchados.push(n);
    if (origem === 'foto') o.origem = 'foto';
    o.ilegivel = o.ilegivel || ilegivel;
    if (o.itens.length === 0) {
      o.tent += 1;
      if (origem === 'foto') return out(`Li o pedido, mas não achei ${o.naoAchados.length > 1 ? 'esses exames' : 'esse exame'} aqui no sistema (${juntar(o.naoAchados)}). Vou chamar alguém da equipe pra te ajudar com o orçamento. Já deixei tudo anotado. Só um instante.`, { motivo: `Orçamento de exames: li o pedido do paciente mas nenhum exame foi achado no Clinilink. Exames lidos: ${o.naoAchados.join('; ').slice(0, 400)}. Conferir se a clínica faz e passar o orçamento.` });
      if (o.tent >= 2) return out('Não consegui achar esses exames aqui no sistema. Vou chamar alguém da equipe pra te ajudar com o orçamento. Já deixei tudo anotado. Só um instante.', { motivo: `Orçamento de exames: nenhum dos exames do paciente foi achado no Clinilink (${o.naoAchados.join('; ').slice(0, 300)}). Conferir o pedido e passar o orçamento.` });
      return dir(out(`Não achei ${o.naoAchados.length > 1 ? 'esses exames' : 'esse exame'} aqui no sistema (${juntar(o.naoAchados)}). Pode me mandar o nome de outro jeito, ou uma foto mais nítida do pedido?`));
    }
    o.tent = 0; o.fase = 'confirmando';
    return dir(out(await textoOrcamento(o)));
  };
  /** Quais exames da lista o paciente citou ("a glicose", "o 2"). */
  const examesCitados = (tt: string, o: Orcamento): ItemExame[] => {
    const palavras = new Set(tt.split(/[^a-z0-9]+/).filter(Boolean));
    const porNumero = [...palavras].filter((w) => /^\d{1,2}$/.test(w)).map((w) => o.itens[Number(w) - 1]).filter(Boolean);
    const porNome = o.itens.filter((i) => tokensDoNome(i.nome + ' ' + i.pedido).some((w) => palavras.has(w) || [...palavras].some((k) => k.length >= 5 && w.startsWith(k))));
    return [...new Set([...porNumero, ...porNome])];
  };
  const tokensDoNome = (n: string) => [...new Set(norm(n).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !['dos', 'das', 'com', 'para', 'exame'].includes(w)))];
  /** O orçamento em andamento: devolve a resposta, ou undefined quando a conversa deve seguir pelo fluxo normal (agendar a coleta, combo). */
  const rodaOrcamento = async (): Promise<Result | undefined> => {
    const o = s.orcamento!;
    // foto do pedido médico
    if (midia) {
      const lido = await ctx.lerPedido?.(midia[2]).catch(() => null);
      if (!lido || lido.tipo === 'ilegivel') {
        o.tent += 1;
        if (o.tent >= 3) return out('Não to conseguindo ler as fotos. Vou chamar alguém da equipe pra te ajudar com o orçamento. Já deixei tudo anotado. Só um instante.', { motivo: 'Orçamento de exames: a foto do pedido médico não pôde ser lida (3 tentativas). Ler o pedido e passar o orçamento.' });
        return dir(dizer('Não consegui ler essa foto. Pode mandar de novo, bem de frente, com boa luz e o pedido inteiro? Se preferir, me escreve o nome dos exames.'));
      }
      if (lido.tipo === 'outro') return dir(dizer('Hmm essa imagem não parece ser um pedido de exames. Pode me mandar a foto do pedido médico, ou escrever o nome dos exames?'));
      return adicionarExames(lido.exames, 'foto', lido.incerto);
    }
    if (ORC_DESISTIR.test(t)) { s.orcamento = undefined; s.fim = true; return out(`Combinado, deixamos o orçamento de lado. ${MARCA_MAIS}?`); }
    if (ORC_COMBO.test(t)) { s.orcamento = undefined; return undefined; } // "quero o check up 10": segue o fluxo de combos
    if (faq && !SIM.test(t)) return dizer(perguntaOrcamento(o)); // dúvida: a resposta dela vem antes (prefixo) e a pergunta continua valendo
    const semSim = texto.replace(TOKEN_MIDIA, ' ').replace(/^\s*(sim|isso|pode|ok|certo|esses?( mesmo)?|e)[,.!\s]+(e |mas |tamb[eé]m )?/i, '');
    const nomes = extrairNomesExames(texto);
    if (o.fase === 'coletando') {
      if (ORC_SEM_PEDIDO.test(t) && !o.pediuNomes) { o.pediuNomes = true; return dir(dizer('Sem problema! Se puder, me escreve o nome dos exames que você precisa fazer. Pode mandar tudo numa mensagem ou em várias.')); }
      if (nomes.length === 0) {
        o.tent += 1;
        if (/\b(nao sei|nao lembro|nao tenho (nada|como))\b/.test(t) || o.tent >= 3) return out('Sem problema, vou chamar alguém da equipe pra te ajudar com o orçamento. Já deixei tudo anotado. Só um instante.', { motivo: 'Orçamento de exames: o paciente não tem o pedido médico nem os nomes dos exames. Ajudar a montar o orçamento.' });
        return dir(dizer(perguntaOrcamento(o)));
      }
      return adicionarExames(nomes, 'texto');
    }
    if (o.fase === 'confirmando') {
      const tirar = ORC_REMOVER.test(t) ? examesCitados(t, o) : [];
      if (tirar.length) {
        o.itens = o.itens.filter((i) => !tirar.includes(i));
        if (o.itens.length === 0) { o.fase = 'coletando'; return dir(dizer('Tirei. Agora não sobrou nenhum exame na lista. Me manda o pedido médico ou o nome dos exames de novo?')); }
        return dir(out(await textoOrcamento(o, `Tirei ${juntar(tirar.map((i) => i.nome))}. Fica assim:`)));
      }
      const nomesExtras = extrairNomesExames(semSim);
      if (SIM.test(t) && nomesExtras.length === 0) return fecharOrcamento();
      if (NAO.test(t) && nomesExtras.length === 0) return dir(dizer('Sem problema. O que você quer ajustar? Pode me mandar o nome do exame que faltou, ou dizer qual eu tiro da lista.'));
      if (nomesExtras.length) return adicionarExames(nomesExtras, 'texto');
      o.tent += 1;
      if (o.tent >= 3) return out('Vou chamar alguém da equipe pra conferir o orçamento com você. Já deixei tudo anotado. Só um instante.', { motivo: `Orçamento de exames: o paciente não confirmou a lista (${o.itens.map((i) => i.nome).join(', ').slice(0, 300)}).` });
      return dir(dizer(perguntaOrcamento(o)));
    }
    // fase 'fechado': ela já passou o total e perguntou se agenda a coleta
    if (NAO.test(t) || soAgradecimento(t) || NAO_MAIS.test(t)) { s.orcamento = undefined; s.fim = true; return out(`Combinado! Qualquer coisa é só me chamar. ${MARCA_MAIS}?`); }
    if (SIM.test(t) || /\b(agenda|agendar|marcar|marca|coleta|quero)\b/.test(t)) return agendarExames();
    if (nomes.length) return adicionarExames(nomes, 'texto');
    return dir(dizer(perguntaOrcamento(o)));
  };
  /** "Sim, são esses": passa o total e oferece agendar a coleta. */
  const fecharOrcamento = (): Result => {
    const o = s.orcamento!; o.fase = 'fechado'; o.tent = 0;
    const t = totaisDoOrcamento(o.itens);
    const total = t.unico !== undefined ? `fica em ${reais(t.unico)}` : t.porUnidade.length ? `fica em ${t.porUnidade.map((x) => `${reais(x.total)} no ${x.u}`).join(' e ')}` : 'a equipe confirma na hora';
    return dir(out(`Perfeito! O total dos exames ${total}. Quer que eu já agende a coleta?`));
  };
  /** "Quero agendar a coleta": os exames viram UM serviço (mesmo dia, mesma agenda no mesmo horário) e a conversa segue por unidade, dia, dados e pagamento. */
  const agendarExames = async (): Promise<Result | undefined> => {
    const o = s.orcamento!;
    const sv2 = await fonte.servicoDeExames!(o.itens);
    if ('semAgenda' in sv2) return out('Poxa, pra agendar a coleta desses exames eu vou chamar alguém da equipe pra conferir a agenda. Já deixei tudo anotado. Só um instante.', { motivo: `Orçamento de exames aprovado pelo paciente, mas sem agenda aberta para: ${o.itens.map((i) => i.nome).join(', ').slice(0, 300)}. Agendar a coleta manualmente.` });
    s.orcamento = undefined; s.examesDoPedido = true; s.comboOferecido = true;
    s.servico = sv2; s.opcoes = undefined; s.servicoConfirmado = true; s.confirmPerguntado = true; s.unidadesInformadas = false; s.unidade = undefined;
    s.lista = undefined; s.slot = undefined; s.dup = undefined;
    mudouServico = true;
    partes.push('Beleza, vamos agendar a coleta.');
    return undefined;
  };
  /**
   * Serviço novo ou trocado: refaz unidade, dia e pagamento. O paciente (CPF, cadastro) é o mesmo e fica. Se ainda não havia serviço
   * (`primeiraVez`), o que ele adiantou (dia, período, "o mais rápido") fica para valer no serviço que acabou de ser entendido.
   */
  const reiniciaDepoisDoServico = (primeiraVez = false) => {
    const adiantado = primeiraVez ? { data: s.data, turno: s.turno, rapido: s.rapido, apartir: s.apartir, ate: s.ate } : {};
    s.confirmPerguntado = false; s.servicoConfirmado = false; s.unidadesInformadas = false; s.unidade = undefined;
    s.lista = undefined; s.data = undefined; s.turno = undefined; s.slot = undefined; s.rapido = undefined; s.apartir = undefined; s.ate = undefined;
    if (!primeiraVez) s.preUnidade = undefined;
    s.pagPerguntado = false; s.pagamento = undefined; s.pixEnviado = false; s.pagFinal = false; s.compTent = 0; s.comprovante = undefined; s.pagoPix = undefined; s.transacoes = undefined;
    Object.assign(s, adiantado);
  };
  /** O horário mudou e nada foi pago ainda: o pagamento recomeça (a Amanda induz o pix de novo, já com o novo horário). */
  const refazPagamento = () => { if (!s.pagFinal && !s.pagoPix) { s.pagamento = undefined; s.pixEnviado = false; s.pagPerguntado = false; s.comprovante = undefined; } };
  /**
   * Dados do paciente que chegam em qualquer ordem (e às vezes todos de uma vez): nascimento, telefone, nome e sexo. O CPF é lido à parte.
   * "algo": a mensagem trouxe algum dado (então não é "CPF ilegível"); "telefone": o número da mensagem era um telefone, não um CPF.
   */
  const capturaDados = (txt: string, tn: string): { algo: boolean; telefone: boolean } => {
    const c = s.cad; const r = { algo: false, telefone: false };
    if (!c.nascimento) { const nsc = lerNascimento(txt); if (nsc) { c.nascimento = nsc; r.algo = true; } }
    const dig = txt.replace(/\D/g, '');
    const soNumero = /^[\d\s().+-]+$/.test(txt.trim());
    // telefone: 10 a 13 dígitos; CPF válido não conta; 11 dígitos só como celular (o terceiro dígito é 9) ou se já falta só ele
    if (!c.telefone && soNumero && dig.length >= 10 && dig.length <= 13 && !(dig.length === 11 && cpfValido(dig)) && (dig.length !== 11 || dig[2] === '9' || Boolean(s.cpf))) { c.telefone = dig; r.algo = true; r.telefone = true; }
    if (!c.nome && !/[?\d]/.test(txt)) {
      const m = limparNome(txt);
      const toks = m.split(/\s+/).filter(Boolean);
      const proibida = toks.some((w) => { const x = norm(w); return NAO_E_NOME.has(x) || (x.length > 3 && PALAVRAS_DE_CONVERSA.has(x)); });
      if (/^[\p{L}' ]{5,80}$/u.test(m) && toks.length >= 2 && toks.filter((w) => w.length >= 3).length >= 2 && !proibida && !SIM.test(tn) && !NAO.test(tn) && !faq) { c.nome = titulo(m); r.algo = true; }
    }
    if (!c.sexo) { if (/\b(feminino|mulher)\b/.test(tn)) { c.sexo = 'feminino'; r.algo = true; } else if (/\b(masculino|homem)\b/.test(tn)) { c.sexo = 'masculino'; r.algo = true; } }
    return r;
  };
  /** Guarda o que o paciente adiantou antes de dizer o serviço (dia, período, unidade, "o mais rápido", forma de pagamento). Devolve o que anotou ('' = nada). */
  const guardaAdiantado = async (): Promise<string> => {
    if (faq) return '';
    const un = (await fonte.nomesUnidades()).find((u) => t.includes(norm(u)));
    if (un) s.preUnidade = un;
    const it = lerIntencao(t, ctx);
    if (it?.primeiro) s.rapido = true;
    if (it?.apartir) s.apartir = it.apartir;
    if (it?.ate) s.ate = it.ate;
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
    return out(comAbertura('Claro! Vou chamar alguém da equipe pra te ajudar. Só um instante.'), { motivo: `Paciente pediu atendimento humano.${s.combo ? ` ${notaCombo()}.` : ''}` });
  }

  // 1a) "já tá agendado?" depois de um agendamento confirmado: responde com o que foi confirmado, em vez de tratar como pedido novo
  if (ctx.confirmacao && !s.servico && !s.opcoes && STATUS_Q.test(t)) return out(`Está sim, confirmado! Olha como ficou:\n\n${ctx.confirmacao}`);

  // 1b) logo depois de um agendamento concluído: agradecimento, "só isso" ou novo pedido
  if (s.pos) {
    const p = posAgendamento(s.pos, t);
    if (p === 'silencio') { s.saudou = true; return { state: s, reply: '', silencio: true }; }
    if (p !== 'seguir') { s.pos = p.pos; return out(p.reply); }
    s.pos = undefined;
  }

  // 1d) ela acabou de avisar que o paciente já tem esse atendimento no dia: a conversa CONTINUA daqui e espera o que ele quer
  // (manter, marcar mais um em outro dia ou remarcar o que já está agendado). Nunca recomeça o fluxo.
  if (s.dup && s.servico) {
    const d = s.dup; const svD = s.servico;
    const ex = await fonte.agendamentoExistente?.(svD, d.ymd, s.paciente?.id).catch(() => null) ?? null;
    if (ex?.profissional) await prepararGeneros([ex.profissional]);
    const detalhe = textoDuplicado(svD, d.ymd, h.ymd, ex);
    const paraEquipe = (aviso: string, extra: string, acao = 'remarcar esse agendamento') => {
      s.dup = undefined; s.fim = true;
      return out(`${aviso} Vou chamar alguém da equipe pra ${acao}. Já deixei tudo anotado. Só um instante.`, {
        duro: true,
        motivo: `REMARCAR: ${s.paciente ? titulo(s.paciente.nome) : 'o paciente'} já tem ${svD.frase} em ${fmtData(d.ymd)}${ex ? ` (${ex.unidade}${ex.hora ? `, a partir das ${hora(ex.hora)}` : ''}${ex.profissional ? `, com ${ex.profissional}` : ''})` : ''}. ${extra} Nenhum agendamento novo foi feito. Mensagem dele: "${texto.replace(TOKEN_MIDIA, ' ').trim().slice(0, 200)}".`,
      });
    };
    if (DUP_MANTER.test(t) && !DUP_NOVO.test(t) && !DUP_REMARCAR.test(t)) {
      s.dup = undefined;
      // combo: o que o paciente já tinha marcado conta como feito; ela segue para a próxima etapa
      if (s.combo) { s.fim = false; s.combo.etapas[s.combo.atual].estado = 'ja-tinha'; return seguirCombo('Combinado, esse que já está marcado fica como está.'); }
      s.fim = true;
      return out('Combinado, fica mantido o que já está marcado. Posso te ajudar com mais alguma coisa?');
    }
    if (DUP_NOVO.test(t)) {
      // marcar MAIS UM em outro dia: segue o fluxo normal (lista de horários), sem oferecer o dia que já está ocupado
      s.dup = undefined; s.diasBloqueados = [...(s.diasBloqueados ?? []), d.ymd];
      s.slot = undefined; s.lista = undefined; s.data = undefined; s.turno = undefined; s.rapido = undefined; s.apartir = undefined; s.ate = undefined; s.fim = false;
      partes.push('Beleza, vamos marcar mais um em outro dia.');
    } else if (DUP_REMARCAR.test(t)) {
      return paraEquipe('Combinado!', 'O paciente quer remarcar o agendamento que já existe.');
    } else if (DUP_DIA.test(t) || lerData(t, ctx)) {
      // "outro dia" pode ser remarcar o que já existe OU marcar mais um: pergunta, para não gravar um agendamento a mais sem querer
      if (d.esclareceu) return paraEquipe('Combinado!', 'O paciente quer mudar o dia (não ficou claro se remarca o existente ou marca mais um).');
      s.dup = { ...d, esclareceu: true };
      return out('Você quer remarcar o que já está agendado pra esse outro dia ou marcar mais um além dele?');
    } else {
      // pergunta ("já tá agendado então?") ou resposta que não é uma das três opções: responde no contexto e repete as opções
      s.dup = { ...d, tent: d.tent + 1 };
      if (s.dup.tent >= 3) return paraEquipe('Combinado!', 'O paciente não deixou claro o que quer fazer com o agendamento que já existe.', 'te ajudar com esse agendamento');
      return out(`${DUP_CONFIRMA.test(t) ? 'Isso mesmo! ' : ''}${detalhe}\n${DUP_PERGUNTA}`);
    }
  }

  // 1c) imagem/arquivo: só interessa como comprovante de pix, quando estamos esperando um
  const midia = texto.match(TOKEN_MIDIA);
  const aguardandoComprovante = s.pagamento === 'pix' && s.pixEnviado && !s.pagFinal && Boolean(s.slot);
  // foto de pedido médico: lida quando não estamos esperando um comprovante e o paciente ainda não escolheu o horário (ou já está num orçamento)
  const podePedido = Boolean(midia && !aguardandoComprovante && ctx.lerPedido && fonte.casarExames && (!s.slot || s.orcamento));
  if (midia && !aguardandoComprovante && !podePedido && !t) return out(comAbertura('Recebi o arquivo, mas só leio texto e áudio por aqui. Pode me escrever?'));

  // 1g) orçamento de exames em andamento (ou foto de pedido médico): o paciente confirma a lista, tira ou acrescenta exames, e aprova o valor
  if (s.orcamento || podePedido) {
    if (!s.orcamento) { s.orcamento = novoOrcamento(); s.servico = undefined; s.opcoes = undefined; }
    const ro = await rodaOrcamento();
    if (ro) return ro;
  }

  // 2) serviço: escolha entre opções pendentes, ou descoberta na fonte
  // o paciente voltou para retomar um atendimento que ficou pela metade (e não citou o serviço)
  if (!s.servico && !s.opcoes && RETOMAR.test(t) && !RAIZES.some((x) => x.re.test(t))) {
    return out(comAbertura('Que bom que você voltou! Vamos retomar o seu agendamento. Qual consulta ou exame você precisa?'));
  }
  // CPF dito antes da hora ("meu cpf é ..."): guarda, para não perguntar de novo quando chegar a vez dele
  if (!s.cpf && !faq && !base.slot && (/\bcpf\b/.test(t) || /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/.test(t))) { const c = cpfDoTexto(t); if (c && cpfValido(c)) s.cpf = c; }
  // o que o paciente adiantou antes de dizer o serviço (dia, período, unidade, "o mais rápido", forma de pagamento) fica guardado
  // remarcar ou cancelar ainda não é com a Amanda: em vez de procurar "remarcar" como se fosse um serviço, chama a equipe
  if (!s.servico && !s.opcoes && /\b(remarc\w*|reagend\w*|desmarc\w*|cancel\w*)\b/.test(t)) {
    return out(comAbertura('Claro! Pra remarcar ou cancelar eu chamo alguém da equipe pra te ajudar. Só um instante.'), { motivo: 'Paciente quer remarcar ou cancelar um agendamento (a Amanda ainda não faz isso). Mensagem: ' + texto.replace(TOKEN_MIDIA, ' ').trim().slice(0, 200) });
  }
  // combo/pacote: com o Clinilink, a Amanda mostra os combos e agenda (descobrir/reservar da fonte). Na fonte simulada (sem combos), chama a equipe
  if (fonte.tipo !== 'clinilink' && !s.servico && !s.opcoes && /\b(combos?|pacotes?)\b/.test(t)) {
    return out(comAbertura('Os combos eu ainda não consigo agendar por aqui. Vou chamar alguém da equipe pra te ajudar com isso. Só um instante.'), { duro: true, motivo: 'Paciente quer agendar um combo/pacote (a Amanda ainda não agenda combos). Mensagem: ' + texto.replace(TOKEN_MIDIA, ' ').trim().slice(0, 200) });
  }
  if (!faq && QUER_AGENDA.test(t)) s.querAgenda = true; // pediu a agenda: assim que houver serviço, os horários já vêm junto
  const adiantou = !s.servico ? await guardaAdiantado() : ''; // com a lista de opções na tela também: o que ele adiantar (dia, unidade, pagamento) fica anotado
  /** As regras não acharam o serviço: o intérprete (IA) entende o pedido no contexto da conversa e o roteiro procura o termo no Clinilink. */
  const entenderPedido = async (): Promise<Awaited<ReturnType<Fonte['descobrir']>> | 'nao'> => {
    if (!ctx.interpretarPedido || faq || t.length < 3 || SIM.test(t) || NAO.test(t) || soAgradecimento(t) || SO_CUMPRIMENTO.test(t)) return undefined;
    const ia = await ctx.interpretarPedido({ texto: texto.replace(TOKEN_MIDIA, ' ').trim(), anteriores: ctx.anteriores ?? [], conversa: ctx.conversa }).catch(() => null);
    if (!ia) return undefined;
    if (ia.quer !== 'agendar' && !(ia.sintoma && ia.termo)) return 'nao'; // o modelo leu e NÃO é pedido de agendar (queixa de saúde conta como pedido de consulta)
    let d = ia.termo ? await fonte.descobrir(ia.termo, true) : undefined;
    // nada com esse termo: pelo menos o tipo (exame ou consulta) -> mostra os mais procurados
    if (!d && ia.tipo) d = await fonte.descobrir(ia.tipo === 'exame' ? 'quero marcar um exame' : 'quero marcar uma consulta', true);
    if (d && 'servico' in d && ia.sintoma) d = { servico: { ...d.servico, viaSintoma: true } };
    return d;
  };
  const aplicar = (d: Awaited<ReturnType<Fonte['descobrir']>>): Result | undefined => {
    if (!d) return undefined;
    // pedido genérico de exame ('exame de sangue', 'coleta', 'tenho o pedido do médico'): começa o orçamento (a pergunta do pedido sai depois do passo 2)
    if ('pedirPedido' in d) { if (!s.servico && fonte.casarExames) { s.orcamento = novoOrcamento(); s.opcoes = undefined; } return undefined; }
    if ('semAgenda' in d) return out(comAbertura(`Poxa, no momento não tenho vaga aberta pra ${d.semAgenda}. Vou chamar alguém da equipe pra conferir e te retornar.`), { motivo: `Sem vagas abertas na agenda para ${d.semAgenda}.` });
    // serviço pedido e não encontrado: diz com franqueza e oferece a equipe (só transfere se ele aceitar)
    if ('servicoExterno' in d) {
      if (s.servico) return undefined;
      return out(comAbertura(`${cap(d.servicoExterno)} é um serviço externo, que a nossa equipe atende direto. Vou te encaminhar pra nossa linha de atendimento principal e o time continua com você por lá. Já deixei tudo anotado. Só um instante.`), { duro: true, motivo: `Paciente quer ${d.servicoExterno}, serviço EXTERNO (a Amanda não agenda). Encaminhado para a linha de atendimento principal. Mensagem: ${texto.replace(TOKEN_MIDIA, ' ').trim().slice(0, 200)}` });
    }
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
    if ('opcoes' in d) { s.opcoes = d.opcoes; s.opcoesTexto = d.intro && d.pergunta ? { intro: d.intro, pergunta: d.pergunta } : undefined; s.servico = undefined; return undefined; }
    const atual = s.servico;
    if (atual && d.servico.id === atual.id && d.servico.profissional && d.servico.profissional.id !== atual.profissional?.id) {
      // a mesma consulta, agora com a médica ou o médico que ele pediu pelo nome: mantém o que já foi combinado e refaz só os horários
      const nomeUn = s.unidade?.nome;
      s.ofereceuEquipe = undefined; s.servico = d.servico; s.opcoes = undefined; mudouServico = true;
      s.unidadesInformadas = false; s.lista = undefined; s.slot = undefined; s.data = undefined; s.turno = undefined;
      s.unidade = nomeUn ? d.servico.unidades.find((u) => norm(u.nome) === norm(nomeUn)) : undefined;
      refazPagamento();
      partes.push(`Beleza, vou olhar os horários com ${exibir(d.servico.profissional.nome, { artigo: true })}.`);
    } else if (d.servico.id !== atual?.id || d.servico.profissional?.id !== atual?.profissional?.id) {
      const primeira = !atual;
      s.ofereceuEquipe = undefined; s.servico = d.servico; s.opcoes = undefined; reiniciaDepoisDoServico(primeira); mudouServico = true;
    }
    return undefined;
  };
  // 1f) desistiu do combo ("sem combo", "só a consulta"): antes de agendar qualquer etapa, volta ao começo; com etapas já agendadas, fecha o combo
  if (s.combo && COMBO_DESISTIR.test(t)) {
    if (s.combo.feitos.length) return finalizaCombo();
    s.combo = undefined; s.servico = undefined; s.opcoes = undefined; reiniciaDepoisDoServico();
    return out(comAbertura('Sem problema, deixamos o combo de lado. Qual consulta ou exame você precisa?'));
  }
  // a mensagem não responde à lista de combos sugerida (é outro pedido, outro serviço...): a sugestão cai e a mensagem segue o fluxo normal
  if (s.ofertaCombo) {
    const resp = escolherOferta(t, s.ofertaCombo.opcoes);
    if (!resp.escolha && resp.duvida.length === 0 && !faq && !SIM.test(t) && !NAO.test(t) && !COMBO_RECUSA.test(t) && !COMBO_DUVIDA.test(t)) s.ofertaCombo = undefined;
  }

  // 1e) combo: ela perguntou quais itens o paciente quer agendar agora. Um número, vários ("1 e 3"), "todos" ou o nome do item escolhe o que agendar (vários itens
  // entram no mesmo agendamento); "sim" (ou já dizendo unidade, dia ou período) segue com a sugestão dela; "depois" fecha o combo com o que já foi agendado.
  if (s.combo?.perguntando) {
    const c = s.combo; const inicio = c.feitos.length === 0;
    if (faq && !SIM.test(t)) return dizer(perguntaProxima(c)); // dúvida: a resposta dela vem antes (prefixo) e a pergunta continua valendo
    if (COMBO_PARAR.test(t)) return finalizaCombo();
    const sel = lerSelecao(t, c);
    const positivo = SIM.test(t) || /\b(quero|vamos|bora|pode|agora|tanto faz|na ordem|segue|seguir)\b/.test(t);
    if (sel === undefined && !positivo && (NAO.test(t) || /^(depois|mais tarde)[\s!.,]*$/.test(t))) return finalizaCombo();
    const nomesUnG = await fonte.nomesUnidades();
    const temInfo = Boolean(lerData(t, ctx) || lerTurno(t) || lerIntencao(t, ctx) || nomesUnG.some((u) => t.includes(norm(u))));
    if (sel === undefined && !positivo && !temInfo) {
      c.tent += 1;
      if (c.tent >= 3) return finalizaCombo();
      return dizer(perguntaProxima(c));
    }
    if (sel !== undefined) {
      const nomeEscolhido = nomeEtapa(c.etapas[sel[0]]);
      if (!(await escolherEtapas(sel, inicio))) return seguirCombo(`Pra ${nomeEscolhido} não tenho vaga aberta agora, a equipe te ajuda com isso depois.`);
    }
    c.perguntando = false; c.tent = 0;
  }

  // 2a) vários exames pelo nome na mesma mensagem ("hemograma, glicose e colesterol"): orçamento com todos (só quando as regras acham 2 ou mais, sem dúvida)
  if (!s.servico && !s.opcoes && !s.orcamento && !s.combo && !s.slot && fonte.casarExames && !faq && !midia && /\b(exames?|fazer|realizar|quero|queria|preciso|gostaria|orcamento|valor|quanto)\b/.test(t)) {
    const nomesM = extrairNomesExames(texto);
    if (nomesM.length >= 2 || (nomesM.length === 1 && / e /.test(nomesM[0]))) {
      const previa = await fonte.casarExames(nomesM).catch(() => undefined);
      if (previa && previa.itens.length >= 2 && previa.naoAchados.length === 0) { s.orcamento = novoOrcamento(); return adicionarExames(nomesM, 'texto'); }
    }
  }

  // 2b) mudou de ideia antes de informar o CPF: outro serviço, outra unidade ou outro dia/horário. Ajusta e segue, sem recomeçar.
  if (s.servico && s.slot && !s.pagFinal) {
    let trocou = false;
    if (!s.combo && (RAIZES.some((x) => x.re.test(t)) || PEDE_PESSOA.test(t))) {
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
      const outroDia = TROCA_DIA.test(t) && !(esperandoPix() && /\b(pag\w*|pix|comprovante|transfer\w*)\b/.test(t)); // "outro dia eu pago" não troca o horário
      if (outraUn || outroDia) {
        if (outraUn) {
          s.unidade = outraUn;
          if (!s.pagFinal) { s.pagamento = undefined; s.pixEnviado = false; s.pagoPix = undefined; s.transacoes = undefined; s.comprovante = undefined; } // o valor pode ser outro na outra unidade
        }
        s.slot = undefined; s.lista = undefined; s.data = undefined; s.turno = undefined;
        refazPagamento(); // o pix vai de novo, já com o novo horário
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
        const soConversa = semNomeDeServico(t, await fonte.nomesUnidades()); // "na recepção", "hoje", "meu bem não quer enviar": não tem nome de serviço, não procura
        const novo = soConversa ? undefined : await fonte.descobrir(tBusca, !faq && !(SO_CUMPRIMENTO.test(t) && !/\bteste\b/.test(t)));
        if (novo && ('servico' in novo || 'opcoes' in novo || 'semAgendaProfissional' in novo)) { const r = aplicar(novo); if (r) return r; }
        else {
          const GENERICAS = new Set(['teste', 'exame', 'consulta', 'rapido', 'total']);
          escolhida = s.opcoes.find((o) => norm(o.nome).split(/[^a-z]+/).filter((w) => w.length > 3 && !GENERICAS.has(w)).some((w) => t.includes(w)));
          if (!escolhida && novo) { const r = aplicar(novo); if (r) return r; }
          if (!escolhida && !novo && !soConversa) { const ia = await entenderPedido(); const r = aplicar(ia === 'nao' ? undefined : ia); if (r) return r; }
        }
      }
      if (escolhida) { const r = aplicar(await fonte.resolver(escolhida.id)); if (r) return r; }
    } else if (s.combo && !s.ofertaCombo) {
      // dentro do combo não se procura outro serviço: só vale o paciente citar outro item do combo ("a consulta primeiro" troca; "e o ultrassom também" junta)
      const c = s.combo;
      const citadas = etapasCitadas(t, c).filter((i) => i !== c.atual);
      if (citadas.length && !SIM.test(t)) {
        const juntos = /\b(tambem|junto|juntos|alem|mais)\b/.test(t);
        const nomeEscolhido = nomeEtapa(c.etapas[citadas[0]]);
        if (!(await escolherEtapas(juntos ? [c.atual, ...citadas] : citadas, true))) return seguirCombo(`Pra ${nomeEscolhido} não tenho vaga aberta agora, a equipe te ajuda com isso depois.`);
        if (!juntos && citadas.length === 1) partes.push(`Beleza, vamos de ${nomeEtapa(c.etapas[c.atual])} agora.`);
      }
    } else if (!s.ofertaCombo) {
      // dúvida ("funciona sábado?", "qual o horário de atendimento?"): sem busca solta por palavras, para não "achar" um serviço sem querer
      const soSaudacao = SO_CUMPRIMENTO.test(t) && !/\bteste\b/.test(t); // "oi", "bom dia": não procura serviço; "teste" pode ser o começo de "teste ergométrico"
      // o serviço já foi entendido mas ainda não confirmado, e ele diz outra coisa ("e a transvaginal?", "na verdade quero ergo"): é outro pedido
      const nomesUnBusca = await fonte.nomesUnidades();
      const soConversa = semNomeDeServico(t, nomesUnBusca); // só pagamento/dia/unidade/conversa: sem nome de serviço, não procura
      const emConfirmacao = Boolean(s.servico) && (!s.servicoConfirmado || !s.slot) && !SIM.test(t) && !semNomeDeServico(t.replace(NAO, ''), nomesUnBusca) && lerEscolha(t, s.lista?.length ?? 0) < 0; // "não" sozinho não traz serviço novo; "não, quero ergo" traz
      const buscar = (!s.servico || emConfirmacao) && (!faq || (faq === 'preco' && !s.servico)) && !soSaudacao && !soConversa;
      let achou = await fonte.descobrir(tBusca, buscar, Boolean(s.servico) || Boolean(faq)); // com serviço em andamento ou dúvida na frase: só serviço claramente citado
      // as regras não acharam, ou só concluíram "não achei" com as palavras soltas da frase ("coisa", "pé"): o intérprete entende o pedido primeiro
      if ((!achou || 'naoAchouServico' in achou) && buscar) {
        const ia = await entenderPedido();
        if (ia === 'nao') { if (achou && 'naoAchouServico' in achou) achou = undefined; } // não era pedido de serviço: "não achei X" feito com palavras soltas da frase não vale
        else if (ia) achou = ia;
      }
      const r = aplicar(achou);
      if (r) return r;
    }
  }

  // 2c) o paciente escolheu um combo: ele vira etapas (a primeira passa a ser o serviço da conversa)
  if (s.servico?.pacote && !s.combo) { const r = await iniciaCombo(s.servico); if (r) return r; }

  // 2d') serviço de categoria EXTERNA no catálogo (ex.: colonoscopia): a equipe atende, a Amanda não agenda
  if (s.servico && !s.combo && /extern/i.test(s.servico.categoria ?? '') && mudouServico) {
    const ext = s.servico.frase;
    return out(comAbertura(`${cap(ext)} é um serviço externo, que a nossa equipe atende direto. Vou te encaminhar pra nossa linha de atendimento principal e o time continua com você por lá. Já deixei tudo anotado. Só um instante.`), { duro: true, motivo: `Paciente quer ${ext}, serviço EXTERNO (categoria externa no Clinilink; a Amanda não agenda). Encaminhado para a linha de atendimento principal.` });
  }

  // 2d) orçamento de exames: começou agora (pedido genérico de exame: ela pede o pedido médico) ou o serviço pedido pelo nome é um exame de laboratório (já anota e mostra o valor)
  if (s.orcamento && !base.orcamento && !s.servico) return dir(out(comAbertura(PEDIR_PEDIDO)));
  if (!s.orcamento && !s.combo && !s.examesDoPedido && fonte.casarExames && s.servico && /laborat/i.test(s.servico.categoria ?? '') && mudouServico) {
    const nomeExame = s.servico.nomeBruto ?? s.servico.nome;
    s.servico = undefined; s.opcoes = undefined; reiniciaDepoisDoServico(true); s.orcamento = novoOrcamento();
    return adicionarExames([nomeExame], 'texto');
  }

  // 3) sem serviço: recepção
  if (!s.servico) {
    if (s.opcoes) {
      const lista = s.opcoes.map((o, i) => `${i + 1}. ${o.nome}`).join('\n');
      if (s.opcoesTexto) return out(comAbertura(`${s.opcoesTexto.intro}\n${lista}\n${s.opcoesTexto.pergunta}`));
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
    if (faq) return { ...out(comAbertura(faq === 'preco' ? 'Pra te passar o valor certinho preciso saber qual consulta ou exame você quer. Qual é?' : faq === 'ping' ? 'Qual consulta ou exame você precisa?' : 'Posso te ajudar a agendar sim. Qual consulta ou exame você precisa?')), direta: true };
    // o paciente voltou para retomar um atendimento que ficou pela metade
    if (RETOMAR.test(t)) return out(comAbertura('Que bom que você voltou! Vamos retomar o seu agendamento. Qual consulta ou exame você precisa?'));
    // adiantou o dia, o período, a unidade ou a forma de pagamento antes de dizer o serviço: anota e pergunta o serviço
    if (adiantou) return out(comAbertura(`${adiantou} Qual consulta ou exame você precisa?`));
    // mandou só o nome (a atendente pede "nome completo e o que você gostaria"): cumprimenta e pergunta o que ele precisa
    if (!SO_CUMPRIMENTO.test(t) && pareceNome(texto, t)) return out(comAbertura(`Prazer, ${titulo(limparNome(texto)).split(' ')[0]}! Me conta o que você precisa?`));
    // pediu orçamento sem dizer o quê
    if (/\b(orcamento|orcar|cotacao)\b/.test(t)) return out(comAbertura('Claro! Me diz qual consulta ou exame você quer o valor. Se for pedido médico, pode digitar o nome dos exames que eu vejo um por um.'));
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
  let sv = s.servico; // let: o serviço vira a primeira etapa quando o paciente escolhe um combo sugerido

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
      if (iAd?.ate) s.ate = iAd.ate;
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

  // 4b) o serviço faz parte de combos que saem mais em conta: ela sugere (uma vez só, mostrando quanto o paciente economiza) e trata a resposta
  const soOServico = sv.tipo === 'consulta' ? 'a consulta' : 'o exame';
  const textoOferta = (lista: OfertaCombo[], intro = `${sv.precoTexto ? `${sv.precoTexto} ` : ''}Tenho combos que incluem ${sv.frase} e saem mais em conta:`) =>
    `${intro}\n${lista.map((o, i) => `${i + 1}. ${o.texto}`).join('\n')}\nQuer agendar algum desses combos ou só ${soOServico}?`;
  if (s.ofertaCombo) {
    const of = s.ofertaCombo;
    const { escolha: escolhida, duvida } = escolherOferta(t, of.opcoes);
    const escolha = escolhida ?? (SIM.test(t) && of.opcoes.length === 1 ? of.opcoes[0] : undefined);
    if (escolha) {
      s.ofertaCombo = undefined;
      const d = await fonte.resolver(`combo:${escolha.id}`);
      if (d && 'servico' in d && d.servico.pacote) { const r = await iniciaCombo(d.servico, sv); if (r) return r; sv = s.servico ?? sv; }
      // não deu para abrir o combo: segue com o serviço que ele pediu
    } else if (duvida.length > 1) {
      return dizer(`Esse combo tem mais de uma versão. Qual você prefere?\n${duvida.map((o) => `${of.opcoes.indexOf(o) + 1}. ${o.texto}`).join('\n')}`);
    } else if (faq || COMBO_DUVIDA.test(t)) {
      of.vezes += 1;
      if (of.vezes <= 3) return dizer(textoOferta(of.opcoes, 'Os combos que incluem esse serviço são:'));
      s.ofertaCombo = undefined;
    } else if (SIM.test(t)) {
      return dizer(`Qual combo você prefere? Pode ser o número, ou me diz que quer só ${soOServico}.`);
    } else {
      s.ofertaCombo = undefined; // recusou ou seguiu com outro assunto (unidade, dia...): continua só com o serviço, sem insistir
      if (COMBO_RECUSA.test(t) || NAO.test(t)) partes.push(`Sem problema, vamos só com ${sv.frase}.`);
    }
  } else if (!s.comboOferecido && !s.combo && fonte.combosComServico && !sv.viaSintoma && !sv.profissional && !sv.pacote && !sv.combo && !/\bretorno\b/.test(norm(sv.nome))) {
    s.comboOferecido = true;
    const ofertas = await fonte.combosComServico(sv).catch(() => [] as OfertaCombo[]);
    if (ofertas.length) { s.ofertaCombo = { opcoes: ofertas, vezes: 1 }; return dizer(textoOferta(ofertas)); }
  }

  // 5) a partir daqui o serviço está confirmado; extrai unidade, dia e período citados
  let aviso = '';
  let intencao: IntLista | undefined; // o que o paciente quer fazer com os horários (lido no passo 5, aplicado no passo 7)
  let entendeuHorario = false; // alguma coisa da resposta foi entendida (unidade, posição, data, período, intenção)
  if (!s.slot) {
    const nomesUn = await fonte.nomesUnidades();
    const unCitada = faq === 'endereco' ? undefined : nomesUn.find((u) => t.includes(norm(u))); // "qual o endereço do Telégrafo?" pergunta, não escolhe a unidade
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
    if (intencao?.ate && !s.lista?.length) s.ate = intencao.ate;
    // sem preferência de unidade ("tanto faz", "a que tiver mais cedo"): a unidade com o horário mais próximo
    if (!s.unidade && sv.unidades.length > 1 && (intencao?.primeiro || /tanto faz|qualquer|a mais proxima|o mais proximo/.test(t))) {
      const cand = await Promise.all(sv.unidades.map(async (u) => ({ u, p: (await fonte.proximas(sv, u, s.apartir ?? h.ymd, 1))[0] })));
      const melhor = cand.filter((x) => x.p).sort((a, b) => (a.p!.ymd + a.p!.inicio).localeCompare(b.p!.ymd + b.p!.inicio))[0];
      s.unidade = melhor?.u ?? sv.unidades[0];
    }
    if (!s.unidade && sv.unidades.length === 1) s.unidade = sv.unidades[0];
    const posicao = s.lista?.length ? (lerEscolha(t, s.lista.length) >= 0 ? lerEscolha(t, s.lista.length) : s.lista.length === 1 && s.listaMista && SIM.test(t) ? 0 : -1) : -1;
    const escolhaLista = posicao >= 0 && posicao < (s.lista?.length ?? 0) ? posicao : -1; // posição que não existe na lista não é escolha
    // a lista da tela misturava unidades: escolher um item define a unidade; dizer a unidade (ou "tanto faz") descarta a mistura e refaz a lista dela
    if (s.listaMista) {
      if (escolhaLista >= 0) {
        const uEscolhida = sv.unidades.find((u) => norm(u.nome) === norm(s.lista![escolhaLista].unidade ?? ''));
        if (uEscolhida) s.unidade = uEscolhida;
        s.listaMista = false;
      } else if (s.unidade) { s.lista = undefined; s.listaMista = false; }
    }
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
    // combo: o que está incluso (e que o retorno não custa), em mensagem separada, logo depois do preço
    if (sv.detalhe) partes.push(`\n${sv.detalhe}`);
    // orientação cadastrada para o atendimento (ex.: restrição de idade, preparo): avisa já aqui, em mensagem separada, antes de ele escolher o horário
    if (sv.preparo) partes.push(`\n${preparoLongo(sv.preparo) ? sv.preparo : `Uma orientação importante pra esse atendimento: ${sv.preparo}`}`);
  }
  if (!s.unidade) {
    // perguntou pela agenda (ou já disse o dia/período): em vez de só perguntar a unidade, já mostra os próximos horários de todas as unidades
    if (sv.unidades.length > 1 && (s.querAgenda || s.data || s.turno || s.apartir || s.ate)) {
      const turnoPedido = s.turno;
      const ateData = s.ate;
      let comLimite = true; // o "até" (essa semana...) vale na primeira busca; se não houver nada, mostra o mais próximo
      const livre = (x: Slot) => !s.diasBloqueados?.includes(x.ymd) && (!turnoPedido || x.turno === turnoPedido) && (!comLimite || !ateData || x.ymd <= ateData);
      const buscar = async (u: Unidade, doDia?: string): Promise<Slot[]> =>
        (doDia ? await fonte.periodos(sv, u, doDia) : await fonte.proximas(sv, u, s.apartir ?? h.ymd, 8)).filter(livre).map((x) => ({ ...x, unidade: u.nome }));
      let porUnidade = await Promise.all(sv.unidades.map((u) => buscar(u, s.data)));
      let titulo = 'Consegui estes aqui:';
      if (s.data && porUnidade.every((l) => l.length === 0)) {
        // sem vaga na data pedida: diz isso e mostra o que existe
        titulo = `Pra ${dataFalada(s.data, h.ymd)}${turnoPedido ? ` ${periodoTxt(turnoPedido)}` : ''} não tenho vaga. Mas consegui estes aqui:`;
        s.data = undefined; s.turno = undefined;
        porUnidade = await Promise.all(sv.unidades.map((u) => buscar(u)));
      }
      if (ateData && !s.data && porUnidade.every((l) => l.length === 0)) {
        comLimite = false;
        titulo = `Pra ${ateData === addDias(h.ymd, (7 - diaSemana(h.ymd)) % 7) ? 'essa semana' : `até ${dataFalada(ateData, h.ymd)}`} não tenho horário. Mas consegui estes aqui:`;
        porUnidade = await Promise.all(sv.unidades.map((u) => buscar(u)));
      }
      const fila = porUnidade.map((l) => [...l].sort((a, b) => (a.ymd + a.inicio).localeCompare(b.ymd + b.inicio)));
      const escolhidos: Slot[] = [];
      for (let i = 0; escolhidos.length < 4 && fila.some((l) => i < l.length); i++) for (const l of fila) if (i < l.length && escolhidos.length < 4) escolhidos.push(l[i]); // um de cada unidade por vez
      if (escolhidos.length > 0) {
        escolhidos.sort((a, b) => (a.ymd + a.inicio).localeCompare(b.ymd + b.inicio));
        await prepararGeneros(escolhidos.map((x) => x.profissional));
        const nomes = nomesExib(escolhidos.map((x) => x.profissional));
        const linhas = escolhidos.map((x, i) => `${i + 1}. ${x.unidade}, ${dataCurta(x.ymd, h.ymd)}, ${periodoTxt(x.turno)}, a partir das ${hora(x.inicio)}${x.profissional ? `, com ${nomes.get(x.profissional)}` : ''}`).join('\n');
        s.lista = escolhidos; s.listaMista = true;
        return dizer(`${partes.length ? '\n' : ''}${titulo}\n${linhas}\n${fechoLista(escolhidos.length)} Se preferir uma unidade ou outro dia, é só me falar.`);
      }
    }
    const quais = sv.unidades.length === 2 ? 'dos dois' : 'deles';
    return dizer(base.unidadesInformadas ? `Qual ${quais} você prefere: ${sv.unidades.map((u) => u.nome).join(' ou ')}?` : `Qual ${quais} fica melhor pra você?`);
  }
  const un = s.unidade;
  const comMedico = (un.profissionais?.length ?? 0) > 1;
  // a lista que estava na tela só vale se o serviço/médico não mudou nesta mensagem (senão ela já foi refeita)
  const listaAnterior = mudouServico ? undefined : base.lista;

  // 7) dia e período: o paciente escolhe da lista (número) ou diz a data
  const naoBloqueado = (x: { ymd: string }) => !s.diasBloqueados?.includes(x.ymd); // dia do agendamento que já existe: não oferece de novo
  const alternativas = async (de: string, filtro?: Periodo) => {
    const todas = (await fonte.proximas(sv, un, de, 12)).filter(naoBloqueado);
    await prepararGeneros(todas.map((x) => x.profissional));
    return (filtro ? todas.filter((x) => x.turno === filtro) : todas).slice(0, 4);
  };
  /** Sugestão proativa: se a OUTRA unidade tem vaga mais cedo que a lista mostrada, avisa (o paciente pode trocar de unidade só dizendo o nome). */
  const dicaOutraUnidade = async (lista: Slot[]): Promise<string> => {
    if (sv.unidades.length < 2 || lista.length === 0) return '';
    let melhor: { u: Unidade; x: Slot } | undefined;
    for (const o of sv.unidades.filter((u) => u.nome !== un.nome)) {
      const x = (await fonte.proximas(sv, o, h.ymd, 3).catch(() => [] as Slot[])).filter(naoBloqueado)[0];
      if (x && (!melhor || x.ymd + x.inicio < melhor.x.ymd + melhor.x.inicio)) melhor = { u: o, x };
    }
    if (!melhor || melhor.x.ymd + melhor.x.inicio >= lista[0].ymd + lista[0].inicio) return '';
    await prepararGeneros([melhor.x.profissional]);
    return `Se for mais fácil, no ${melhor.u.nome} tenho ${slotFalado(melhor.x, false, h.ymd)}, mais cedo que esses. Se quiser, é só me dizer que eu mostro os horários de lá.`;
  };
  let escolhaDireta = ''; // "o mais rápido que tenho é ...": ela escolheu o horário pelo pedido do paciente (não por número)
  const escolher = (x: Slot, direta = '') => { s.slot = x; s.data = x.ymd; s.turno = x.turno; s.lista = undefined; s.rapido = undefined; s.apartir = undefined; s.ate = undefined; escolhaDireta = direta; };
  /** Aplica o que o paciente quer fazer com os horários: escolhe o mais rápido/último, filtra (até uma data, período, hora) ou mostra outras opções. */
  const aplicarIntencao = async (it: IntLista): Promise<Result | undefined> => {
    const tp = lerTurno(t); const turnoPedido = tp && tp !== 'noite' ? tp : s.turno;
    const naTela = s.lista?.length ? s.lista : undefined;
    let pool: Slot[];
    if (naTela && !it.apartir && !it.mais) pool = [...naTela];
    else pool = await fonte.proximas(sv, un, it.apartir ?? (it.mais && naTela ? addDias(naTela[naTela.length - 1].ymd, 1) : (s.apartir ?? h.ymd)), 12);
    pool = pool.filter(naoBloqueado);
    await prepararGeneros(pool.map((x) => x.profissional));
    if (it.ate) pool = pool.filter((x) => x.ymd <= it.ate!);
    if (turnoPedido) pool = pool.filter((x) => x.turno === turnoPedido);
    if (it.hora != null) pool = pool.filter((x) => [it.hora!, it.hora! + 12].includes(horaCheia(x.inicio)));
    if (pool.length === 0) {
      // nada com esse pedido: diz o que pediu e mostra o que existe
      const pediu = [it.ate ? (it.ate === addDias(h.ymd, (7 - diaSemana(h.ymd)) % 7) ? 'essa semana' : `até ${dataFalada(it.ate, h.ymd)}`) : '', turnoPedido ? periodoTxt(turnoPedido) : '', it.hora != null ? `às ${it.hora}h` : ''].filter(Boolean).join(' ');
      const alt = await alternativas(it.apartir ?? s.apartir ?? h.ymd);
      if (alt.length === 0) return out([...partes, 'No momento não vejo vagas abertas. Vou chamar alguém da equipe pra conferir e te retornar.'].join('\n'), { motivo: `Sem vagas para ${sv.nome} no ${un.nome}.` });
      s.lista = alt;
      return dizer(`${pediu ? `Não tenho horário ${pediu}. ` : ''}Mas consegui estes aqui:\n${numerada(alt, comMedico, h.ymd)}\n${fechoLista(alt.length)}`);
    }
    if (it.primeiro || (s.rapido && !naTela)) { escolher(pool[0], `O mais rápido que tenho é ${slotFalado(pool[0], !sv.profissional, h.ymd)}. Já separo esse pra você.`); return undefined; }
    if (it.ultimo && naTela) { const u = pool[pool.length - 1]; escolher(u, `O último que tenho é ${slotFalado(u, !sv.profissional, h.ymd)}. Já separo esse pra você.`); return undefined; }
    if (it.sim && naTela?.length === 1) { escolher(naTela[0]); return undefined; }
    if (pool.length === 1) { escolher(pool[0]); return undefined; }
    s.lista = pool.slice(0, 4);
    const intro = it.mais ? 'Sem problema. Tenho também:' : it.apartir ? `A partir de ${dataFalada(it.apartir, h.ymd)} tenho:` : it.ate ? `Até ${dataFalada(it.ate, h.ymd)} tenho:` : 'Consegui estes aqui:';
    return dizer(`${intro}\n${numerada(s.lista, comMedico, h.ymd)}\n${fechoLista(s.lista.length)}`);
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
          else { s.lista = dela; return dizer(`Com ${exibir(med, { artigo: true })} tenho:\n${numerada(dela, false, h.ymd)}\n${fechoLista(dela.length)}`); }
        }
      }
    }
    // "o mais rápido possível", "a próxima", "outro dia", "semana que vem", "depois do dia 25", "às 15h"... (com ou sem lista na tela)
    if (!s.slot && !s.data && (intencao || s.rapido || s.apartir || s.ate)) { const rr = await aplicarIntencao(intencao ?? (s.ate ? { ate: s.ate } : {})); if (rr) return rr; }
    // "quando tem agenda?", "tem horário?" com a lista na tela: é o pedido dos horários, então mostra a lista de novo (não vira "outras opções")
    if (!s.slot && listaAnterior?.length && !entendeuHorario && !faq && QUER_AGENDA.test(t)) {
      s.lista = listaAnterior;
      return dizer(`Esses são os horários que tenho no ${un.nome}:\n${numerada(listaAnterior, comMedico, h.ymd)}\n${fechoLista(listaAnterior.length)} Se quiser ver outro dia, é só me falar.`);
    }
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
      const doDia = (await fonte.periodos(sv, un, s.data)).filter(naoBloqueado);
      await prepararGeneros(doDia.map((x) => x.profissional));
      let certos = s.turno ? doDia.filter((x) => x.turno === s.turno) : doDia;
      const medDia = medicoDaLista(t, certos); // "quinta 22 com a Fernanda"
      if (medDia) certos = certos.filter((x) => x.profissional === medDia);
      if (certos.length === 1) { s.slot = certos[0]; s.turno = certos[0].turno; s.lista = undefined; }
      else if (certos.length > 1) {
        s.lista = certos;
        return dizer(`Pra ${dataFalada(s.data, h.ymd)} tenho:\n${numerada(certos, comMedico, h.ymd)}\n${fechoLista(certos.length)}`);
      } else {
        const pedido = `${dataFalada(s.data, h.ymd)}${s.turno ? ` ${periodoTxt(s.turno)}` : ''}`;
        // sem vaga nessa data: mostra o que existe depois dela (no período pedido, depois em qualquer período) e, se não houver nada depois, o que existe a partir de amanhã
        let alt: Slot[] = [];
        for (const [de, filtro] of [[s.data, s.turno], [s.data, undefined], [h.ymd, s.turno], [h.ymd, undefined]] as [string, Periodo | undefined][]) {
          alt = await alternativas(de, filtro);
          if (alt.length) break;
        }
        s.data = undefined; s.turno = undefined;
        if (alt.length === 0) return out([...partes, 'Pra essa data não achei vaga e no momento não vejo outras datas abertas. Vou chamar alguém da equipe pra conferir e te retornar.'].join('\n'), { motivo: `Sem vagas para ${sv.nome} no ${un.nome}.` });
        s.lista = alt;
        return dizer(`Pra ${pedido} não tenho vaga. Mas consegui estes aqui:\n${numerada(alt, comMedico, h.ymd)}\n${fechoLista(alt.length)}`);
      }
    } else {
      // a lista já estava na tela e eu não entendi a resposta: pergunta de outro jeito, em vez de repetir a lista em silêncio
      if (listaAnterior?.length && !entendeuHorario) {
        s.lista = listaAnterior;
        return dizer(`Não peguei qual horário você quer. Pode ser o número, o dia ou "o mais rápido"?\n${numerada(listaAnterior, comMedico, h.ymd)}`);
      }
      const alt = await alternativas(s.desde && s.desde > h.ymd ? s.desde : h.ymd, s.turno);
      if (alt.length === 0) return out([...partes, 'No momento não vejo vagas abertas. Vou chamar alguém da equipe pra conferir e te retornar.'].join('\n'), { motivo: `Sem vagas para ${sv.nome} no ${un.nome}.` });
      s.lista = alt;
      const dica = await dicaOutraUnidade(alt); // sugestão: a outra unidade tem vaga mais cedo (mensagem separada, antes da pergunta)
      return dizer(`Consegui estes aqui:\n${numerada(alt, comMedico, h.ymd)}${dica ? `\n\n${dica}\n\n` : '\n'}${fechoLista(alt.length)} Se quiser outro dia me fala que eu vejo.`);
    }
  }
  const slot = s.slot!;
  await prepararGeneros([slot.profissional]);
  // para a equipe (motivo da transferência): nome completo e data com mês
  const resumoVaga = `${sv.frase} no ${un.nome}, ${fmtData(slot.ymd)}, ${periodoTxt(slot.turno)}, a partir das ${hora(slot.inicio)}, por ordem de chegada${slot.profissional ? `, com ${slot.profissional}` : ''}${s.combo ? `. ${notaCombo()}` : ''}`;
  // para o paciente: jeito de falar, com Dr./Dra.
  const resumoFalado = `${sv.frase} no ${un.nome} ${diaResumo(slot.ymd, h.ymd)} ${periodoTxt(slot.turno)} a partir das ${hora(slot.inicio)} por ordem de chegada${slot.profissional && !sv.profissional ? ` com ${exibir(slot.profissional, { artigo: true })}` : ''}`;

  // 7c) forma de pagamento (DEPOIS dos dados): ela pergunta como prefere pagar; pix manda a chave e espera o comprovante, link de crédito vai para o time, recepção segue
  const valorPix = un.precoPix;
  const valorDe = s.combo ? 'o valor do combo' : 'o valor'; // dentro do combo o pix cobre o combo inteiro
  let induziuPix = false;
  const pixMsg = () => `${induziuPix
    ? `Pra agilizar o seu atendimento na recepção, o melhor é ${MARCA_PAGAMENTO} por pix${valorPix ? `, ${valorDe} é ${reais(valorPix)}` : ''}:`
    : `Show! A chave pix é essa${valorPix ? `, ${valorDe} é ${reais(valorPix)}` : ''}:`}\n\n${MARCA_PIX} ${env.pixKey}\n\nQuando pagar, me manda o comprovante aqui que eu já sigo com o seu agendamento, tá?${induziuPix ? ' Se preferir pagar na recepção ou por link de crédito, é só me falar.' : ''}`;
  // link de pagamento: a equipe assume (envia o link e conclui). A Amanda não retoma sozinha depois.
  const deLink = () => out('Combinado! Vou passar pra equipe te enviar o link de pagamento e concluir o agendamento. Já deixei tudo anotado. Só um instante.', { duro: true, motivo: `Paciente quer pagar por link de crédito: enviar o link e concluir o agendamento. Vaga: ${resumoVaga}. ${dadosParaEquipe()} Agendamento AINDA NÃO feito.` });
  // 7b) dados do paciente ANTES do pagamento: nome completo, nascimento, telefone e CPF, em qualquer ordem, numa mensagem só ou em várias.
  // Depois: paciente que já existe é puxado do Clinilink (confirma só o nome); paciente novo é cadastrado no fim, junto com o agendamento.
  const pedirCpf = (pre: string) => dizer(!pre ? PERG_CPF : `${pre} ${pre.startsWith('Recebi') ? PERG_CPF_APOS : PERG_CPF}`);
  /** Quem é o paciente, para o time (link de crédito, falha): já cadastrado, ou os dados para cadastrar. */
  const dadosParaEquipe = () => (s.paciente ? `Paciente já cadastrado (${titulo(s.paciente.nome)}, id ${s.paciente.id ?? '?'}).` : s.cpf ? `CADASTRAR paciente novo: ${s.cad.nome ?? '(nome pendente)'}, nascimento ${s.cad.nascimento ? fmtNasc(s.cad.nascimento) : '?'}, sexo ${s.cad.sexo ?? '?'}, telefone ${s.cad.telefone ?? '?'}, CPF ${s.cpf}.` : '');
  const resumoDoHorario = escolhaDireta || `${pick(['Beleza', 'Show'], n)}, então fica ${resumoFalado}.`;
  const primeiraVezNoSlot = !base.slot; // este é o turno em que o horário foi escolhido
  let resumoDito = false;
  const dizResumo = () => { if (!resumoDito) { partes.push(resumoDoHorario); resumoDito = true; } }; // o resumo do que ficou combinado sai uma vez só, junto da primeira resposta depois do horário
  const emDados = Boolean(base.slot); // depois do horário escolhido, o que o paciente manda é lido como dado dele (também vale para conversas em andamento de antes desta ordem)
  if (primeiraVezNoSlot && !faq) { const pa = pagamentoAdiantado(t); if (pa) s.pagPref = pa; } // "guamá amanhã, vou pagar no pix": a forma de pagamento já vem na frase do horário
  const anotado = emDados ? capturaDados(texto, t) : { algo: false, telefone: false };
  // a forma de pagamento dita no meio dos dados fica anotada (a pergunta do pagamento só vem depois dos dados)
  let ackPagto = '';
  if (emDados && !anotado.algo && !faq) {
    const pf = lerPagamentoFirme(t);
    if (pf) { s.pagPref = pf; ackPagto = pf === 'recepcao' ? 'Sem problema nenhum o pagamento fica pra recepção no dia do atendimento.' : pf === 'pix' ? 'Beleza, o pagamento vai ser por pix.' : 'Combinado, o pagamento vai ser por link de crédito.'; }
  }
  if (!s.cpf) {
    const cpf = emDados && !anotado.telefone ? cpfDoTexto(t) : undefined;
    if (cpf && !cpfValido(cpf)) return dizer('Acho que algum número do CPF escapou, dá uma olhadinha e me manda de novo os 11 números?');
    if (cpf) s.cpf = cpf;
    else if (primeiraVezNoSlot) { dizResumo(); return dizer(`\n${PEDIDO_DADOS}`); } // confirma o que ficou combinado e já pede os dados
    else if (anotado.algo) return dizer('Anotei! Me passa também o CPF do paciente?');
    else if (emDados && /\d{2,}/.test(t)) return dizer('Não consegui ler o CPF. Pode me mandar os 11 números?');
    else return pedirCpf(ackPagto);
  }

  if (primeiraVezNoSlot) dizResumo(); // CPF dito antes do horário: o resumo vem junto da confirmação do paciente (ou do que falta)
  // 9) consulta o paciente por CPF
  const acabouDeConsultar = s.paciente === undefined;
  if (s.paciente === undefined) {
    s.paciente = await fonte.paciente(s.cpf);
    if (s.paciente) return dizer(`Achei aqui o cadastro de ${titulo(s.paciente.nome)}. É esse mesmo o paciente?`);
    // CPF novo: segue para o passo 10, que pede de uma vez tudo o que ainda falta (ele pode já ter mandado nome, nascimento e telefone)
  }
  if (s.paciente && !s.pacienteConfirmado) {
    if (SIM.test(t)) s.pacienteConfirmado = true;
    else if (NAO.test(t)) { s.cpf = undefined; s.paciente = undefined; return dizer('Sem problema. Dá uma conferida no CPF e me manda de novo?'); }
    else return dizer(`Esse cadastro é de ${titulo(s.paciente.nome)}. É esse mesmo o paciente?`);
  }

  // 10) CPF novo: o cadastro (nome, nascimento, telefone) é pedido de uma vez e vale em qualquer ordem; o sexo sai do primeiro nome quando ele é conhecido
  if (s.paciente === null) {
    const c = s.cad;
    // "pode ser esse número": usa o WhatsApp do paciente
    if (!acabouDeConsultar && c.pediuTelefone && !c.telefone && ctx.telefone && !anotado.telefone && (SIM.test(t) || /\b(esse|este|mesmo|whats\w*)\b/.test(t))) c.telefone = ctx.telefone.replace(/\D/g, '');
    if (c.nome && !c.sexo) {
      await prepararGeneros([c.nome]);
      const g = generoConfirmado(c.nome);
      if (g) c.sexo = g === 'F' ? 'feminino' : 'masculino';
    }
    const faltam: string[] = [];
    if (!c.nome) faltam.push('o nome completo do paciente');
    if (!c.nascimento) faltam.push('a data de nascimento');
    if (!c.telefone) faltam.push('o telefone com DDD');
    if (c.nome && !c.sexo) faltam.push('se o paciente é do sexo feminino ou masculino');
    if (faltam.length) {
      const pedeTelefone = !c.telefone;
      if (pedeTelefone) c.pediuTelefone = true;
      const dica = pedeTelefone ? ' (se for esse mesmo número do WhatsApp, é só me avisar)' : '';
      if (acabouDeConsultar) return dizer(`Esse CPF ainda não tá no cadastro, vou fazer agora. Me manda ${juntar(faltam)}${dica}.`);
      return dizer(`${faltam.length > 1 ? 'Faltam' : 'Falta'} só ${juntar(faltam)}${dica}.`);
    }
  }

  if (!s.pagFinal) {
    if (!s.pagPerguntado) {
      s.pagPerguntado = true;
      // se ele já disse como quer pagar (junto dos dados ou antes), não pergunta de novo; "aceita cartão?" é pergunta, não escolha
      s.pagamento = faq === 'pagto' ? undefined : (lerPagamentoFirme(t) ?? s.pagPref);
      if (primeiraVezNoSlot) dizResumo(); // dados já completos na mesma mensagem do horário: mostra o que ficou combinado
      // ainda não disse: pergunta como prefere pagar (o pix só sai se ele escolher pix)
      if (!s.pagamento) return dizer(valorPix
        ? `Como você prefere pagar? Dá pra ${MARCA_PAGAMENTO} por pix (${valorDe} é ${reais(valorPix)}), que agiliza o seu atendimento na recepção, pagar na recepção, no dia do atendimento, ou por link de crédito.`
        : 'Como você prefere pagar: por pix, link de crédito ou na recepção, no dia do atendimento?');
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
      if (faq === 'pagto') { /* dúvida sobre pagamento ("aceita cartão?"): é pergunta, não escolha */ }
      else if (RECEPCAO.test(t) || (!s.pagoPix && /^(nao|n|nao quero|nao vou|nao obrigad[oa])[\s!.,]*$/.test(t))) { s.pagamento = 'recepcao'; } // só "não" (sem pagamento parcial): paga na recepção
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
        // o comprovante tem que ser DESTE atendimento: de hoje e feito depois que o paciente começou o pedido. De outro dia, ou de bem antes da
        // conversa, é pagamento de outro atendimento: ela explica isso em vez de só recusar.
        const ini = ctx.inicioJornada ? noFuso(ctx.tz, ctx.inicioJornada) : undefined;
        if (c.data > h.ymd) return nova(`Esse comprovante está com a data de ${dataFalada(c.data, h.ymd)}. Preciso do comprovante do pagamento de hoje. Pode me mandar o correto?`, `comprovante com data futura (${c.data})`);
        if (c.data < (ini?.ymd ?? addDias(h.ymd, -1))) return nova(`Esse comprovante é de ${dataFalada(c.data, h.ymd)}, então deve ser de outro atendimento. Preciso do comprovante do pagamento de hoje, feito pra esse agendamento. Pode me mandar o correto?`, `comprovante de outro dia (${c.data})`);
        if (ini && c.data === ini.ymd && c.hora) {
          const [hh, mm] = c.hora.split(':').map(Number);
          if (hh * 60 + mm < ini.min - TOLERANCIA_COMPROVANTE_MIN) return nova(`Esse comprovante é de hoje às ${hora(c.hora)}, antes da nossa conversa começar, então deve ser de outro atendimento. Pra esse agendamento preciso do pagamento feito agora, depois do seu pedido. Pode me mandar o correto? Se preferir, também dá pra pagar na recepção.`, `comprovante de hoje às ${c.hora}, antes do pedido do paciente (${String(Math.floor(ini.min / 60)).padStart(2, '0')}:${String(ini.min % 60).padStart(2, '0')})`);
        }
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
        s.comprovante = { valor: total, data: c.data, nota: `Pix antecipado: ${reais(total)} (${fmtNasc(c.data)}${c.hora ? ` ${c.hora}` : ''}${s.pagoPix ? ', mais de um comprovante' : ''}) lido pela IA${alvo.trim() ? '' : ', recebedor não identificado'}; CONFERIR no extrato` };
        s.pagoPix = total;
        s.pagFinal = true;
      }
      else if (/\bdeixa(r)? pago\b|\b(posso|quero|vou|queria|gostaria de) pagar (agora|ja)\b|\bpago agora\b/.test(t)) return { ...dizer(`Pode sim! Aqui está a chave:\n${MARCA_PIX} ${env.pixKey}${valorPix ? `\nValor${s.pagoPix ? ' que falta' : ''}: ${reais(falta || valorPix)}` : ''}\nQuando pagar, me manda o comprovante aqui, tá?`), direta: true };
      else if (/nao (quer|esta|ta|consigo|vai|deu|foi) (enviar|mandar|passar|funcionar|fazer|pagar|certo)|deu erro|nao abre|nao carrega|problema (no|com o) (pix|app|aplicativo)/.test(t)) return { ...dizer('Sem problema! Se o pix não quiser enviar, você pode pagar na recepção, no dia do atendimento, ou eu chamo alguém pra te mandar um link de pagamento. O que fica melhor pra você?'), direta: true };
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
        }
      }
      else if (s.pagamento === 'pix') {
        if (!s.pixEnviado) { s.pixEnviado = true; return dizer(pixMsg()); }
      }
    }
    if (!s.pagFinal) return dizer('Tô aguardando o comprovante do pix pra seguir com o agendamento.');
  }

  // 11) conclui
  s.fim = true;
  const quem = s.paciente ? titulo(s.paciente.nome) : s.cad.nome ?? '';
  if (fonte.tipo === 'clinilink') {
    const novo = (s.paciente ? `Paciente já cadastrado (${titulo(s.paciente.nome)}, id ${s.paciente.id ?? '?'}).` : `CADASTRAR paciente novo: ${s.cad.nome}, nascimento ${s.cad.nascimento ? fmtNasc(s.cad.nascimento) : '?'}, sexo ${s.cad.sexo}, telefone ${s.cad.telefone}, CPF ${s.cpf}.`);
    const aEquipe = (aviso: string, motivo: string) => out(`${aviso} Vou chamar alguém da equipe pra concluir. Já deixei tudo anotado. Só um instante.`, { motivo, duro: true });
    /** Uma etapa do combo agendada: guarda o que ficou marcado, avisa o paciente e abre a próxima (ou fecha o combo). */
    const etapaFeita = async (r: Extract<ResultadoReserva, { ok: true }> | undefined): Promise<Result> => {
      const c = s.combo!; const e = c.etapas[c.atual];
      e.estado = 'feita';
      if (r?.cadastrou) c.cadastrou = true;
      if (r?.pacienteId && !s.paciente) { s.paciente = { id: r.pacienteId, nome: s.cad.nome ?? '' }; s.pacienteConfirmado = true; } // as próximas etapas usam o cadastro que acabou de ser criado
      const med = r?.profissional ?? slot.profissional;
      await prepararGeneros([med]);
      const hr = r?.hora ?? slot.inicio;
      const valor = e.itens.every((i) => i.preco) ? Math.round(e.itens.reduce((a, i) => a + (i.preco ?? 0), 0) * 100) / 100 : undefined;
      c.feitos.push({ rotulo: nomeEtapa(e), frase: sv.frase, nomeBruto: sv.nomeBruto, unidade: un, ymd: slot.ymd, turno: slot.turno, hora: hr, profissionalBruto: r?.profissionalBruto ?? slot.profissionalBruto, linhas: r?.linhas, extra: r?.extra, valor, preparo: sv.preparo });
      c.unidadePref = un.nome; c.diaPref = slot.ymd;
      return seguirCombo(`Pronto! Reservei ${sv.frase} no ${un.nome} ${diaResumo(slot.ymd, h.ymd)} ${periodoTxt(slot.turno)} a partir das ${hora(hr)} por ordem de chegada${med && !sv.profissional ? ` com ${exibir(med, { artigo: true })}` : ''}.${r?.extra ? ` ${r.extra}` : ''}`);
    };

    if (!ctx.efetivar) { // reprocessamento: nunca grava
      // a resposta que ela deu a esta mensagem foi o aviso de "já tem esse atendimento no dia": o estado segue daqui, sem recomeçar a conversa
      if (ctx.duplicadoAqui) { s.fim = false; s.dup = { ymd: slot.ymd, unidade: un.nome, servicoId: sv.id, tent: 0 }; return out('Beleza, vou concluir a sua reserva. Só um instante.'); }
      // combo: a etapa foi gravada de verdade quando essa mensagem foi respondida; o estado segue como se tivesse gravado (a resposta daqui não vai ao paciente)
      if (s.combo) return etapaFeita(undefined);
      return out('Beleza, vou concluir a sua reserva. Só um instante.');
    }

    const r = await fonte.reservar!({
      servico: sv, unidade: un, slot, cpf: s.cpf!,
      pacienteId: s.paciente?.id,
      observacao: [s.combo ? `Combo ${s.combo.rotulo} (etapa ${s.combo.atual + 1} de ${s.combo.etapas.length}: ${nomeEtapa(s.combo.etapas[s.combo.atual])})` : '', 'Agendado pela Amanda (IA) via WhatsApp', s.comprovante?.nota ?? (s.pagamento === 'recepcao' ? 'Pagamento na recepção' : '')].filter(Boolean).join('. '),
      cadastro: s.paciente ? undefined : { nome: s.cad.nome!, nascimento: s.cad.nascimento!, sexo: s.cad.sexo!, telefone: s.cad.telefone! },
      comboId: s.combo?.id,
    });
    if (r.ok && s.combo) return etapaFeita(r);
    if (r.ok) {
      const med = r.profissional ?? slot.profissional;
      await prepararGeneros([med]);
      const primeiro = quem.split(' ')[0];
      // mensagem de confirmação no modelo da clínica (dados reais do Clinilink) + orientações e uma sugestão, em mensagens separadas
      return out(mensagemConfirmacao({
        paciente: quem, novoCadastro: !s.paciente, servico: sv, unidade: un, ymd: slot.ymd, hora: r.hora,
        profissionalBruto: r.profissionalBruto ?? slot.profissionalBruto ?? med, valor: un.precoPix, pagoPix: s.pagoPix, primeiroNome: primeiro, linhas: r.linhas, extra: r.extra,
      }));
    }
    const extra = r.cadastrou ? ' O cadastro do paciente FOI criado.' : '';
    if (r.incerto) return aEquipe('Não consegui confirmar a reserva agora.', `ATENÇÃO: a reserva pode ou não ter sido gravada (${r.codigo}). CONFERIR no Clinilink antes de refazer. Vaga: ${resumoVaga}. ${novo}${extra}`);
    if (r.codigo === 'SEM_VAGA_AGORA' || r.codigo === 'HORARIO_OCUPADO') return aEquipe('Essa vaga acabou de ser preenchida.', `Vaga ocupada na hora de reservar (${r.codigo}). Oferecer outro horário. Pedido: ${resumoVaga}. ${novo}${extra}`);
    if (r.codigo === 'SERVICO_DUPLICADO_NO_DIA') {
      // o paciente já tem esse atendimento no dia: ela explica QUAL agendamento já existe e ESPERA o que ele quer (manter, mais um em outro dia, remarcar)
      s.fim = false; s.dup = { ymd: slot.ymd, unidade: un.nome, servicoId: sv.id, tent: 0 };
      const ex = await fonte.agendamentoExistente?.(sv, slot.ymd, s.paciente?.id).catch(() => null) ?? null;
      if (ex?.profissional) await prepararGeneros([ex.profissional]);
      return out(`${textoDuplicado(sv, slot.ymd, h.ymd, ex)}\n${DUP_PERGUNTA}`);
    }
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
/** A transferência foi a pedido do paciente (humano), urgência ou marcada como definitiva: a Amanda não retoma sozinha. */
export const handoffDuro = (h: Handoff) => Boolean(h.urgente) || Boolean(h.duro) || /atendimento humano/i.test(h.motivo);
/**
 * O estado que fica guardado depois de uma resposta ENVIADA: o mesmo ajuste que o reprocessamento faz antes do turno seguinte
 * (transferência dura recomeça a conversa; as outras seguem de onde pararam, com as tentativas zeradas).
 */
export function estadoDepoisDaResposta(r: Result): State {
  const s = r.state;
  if (!r.handoff) return s;
  return handoffDuro(r.handoff) ? { ...novoEstado(), saudou: true } : { ...s, falhas: 0, compTent: 0, pagamento: s.pagamento === 'link' ? undefined : s.pagamento };
}

/**
 * `inicial`: o estado guardado depois da última resposta enviada. Com ele, só as mensagens NOVAS entram em `entrada` e a conversa continua
 * exatamente de onde parou (sem reinterpretar tudo do zero, o que muda de resposta quando o código, a agenda ou a data mudaram no meio).
 */
export async function responder(entrada: (string | string[])[], ctx: Ctx, fonte: Fonte, inicial?: { state: State; aposHandoffDuro?: boolean; passos?: number }): Promise<Result | undefined> {
  const turnos = entrada.map((x) => (Array.isArray(x) ? x : [x]));
  let state: State = inicial ? { ...inicial.state, cad: { ...inicial.state.cad } } : novoEstado();
  if (!inicial && ctx.pos) state = { ...state, saudou: true, pos: ctx.pos }; // a conversa já começou: logo depois de um agendamento
  let last: Result | undefined;
  const vistas: string[] = []; // mensagens do paciente já processadas (contexto para o intérprete do pedido)
  let i = inicial?.passos ?? 0;
  let aposHandoffDuro = Boolean(inicial?.aposHandoffDuro);
  for (let t = 0; t < turnos.length; t++) {
    const msgs = turnos[t];
    for (let j = 0; j < msgs.length; j++) {
      const antes = { saudou: state.saudou, unidadesInformadas: state.unidadesInformadas, ofertaCombo: state.ofertaCombo, comboOferecido: state.comboOferecido };
      last = await step(state, msgs[j], { ...ctx, efetivar: t === turnos.length - 1, anteriores: vistas.slice(-3), duplicadoAqui: (ctx.duplicadoNosTurnos ?? []).includes(t) && j === msgs.length - 1, ultima: t === turnos.length - 1 && j === msgs.length - 1 }, fonte, i++);
      vistas.push(msgs[j].replace(TOKEN_MIDIA, ' ').trim());
      state = last.state;
      // no último turno, quem encerra a jornada ou transfere já é a resposta que o paciente vai receber
      if (t === turnos.length - 1 && (last.handoff || last.state.fim)) return { ...last, aposHandoffDuro, passos: i };
      // transferência numa resposta que JÁ foi enviada. Se o paciente pediu um humano (ou foi urgência), o que vier
      // depois é jornada nova e a Amanda não retoma sozinha. Nos demais casos (comprovante, vaga, falha do sistema...)
      // a conversa CONTINUA de onde parou quando o paciente volta a escrever, com as tentativas zeradas.
      if (last.handoff && j === msgs.length - 1) {
        aposHandoffDuro = handoffDuro(last.handoff);
        state = estadoDepoisDaResposta(last);
      }
      if (j < msgs.length - 1) { // resposta descartada: desfaz o que ela marcou como dito
        state.saudou = antes.saudou;
        state.unidadesInformadas = antes.unidadesInformadas;
        if (state.ofertaCombo && !antes.ofertaCombo) { state.ofertaCombo = undefined; state.comboOferecido = antes.comboOferecido; } // a sugestão de combos nunca foi vista: ela volta a ser feita na próxima resposta
        if (state.paciente && !state.pacienteConfirmado) state.paciente = undefined; // o nome nunca foi mostrado
      }
    }
  }
  return last && { ...last, aposHandoffDuro, passos: i };
}
