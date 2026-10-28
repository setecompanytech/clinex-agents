/**
 * Tipos da "fonte de agenda" + FONTE SIMULADA.
 * A fonte simulada usa valores de EXEMPLO (médicos, preços, datas e pacientes inventados). Nada vem do
 * Clinilink. A fonte real fica em clinilinkFonte.ts e é escolhida quando CLINILINK_API_KEY existe.
 */
export type Periodo = 'manhã' | 'tarde';
export type Unidade = { id?: string; nome: string; profissionais?: string[]; precoPix?: number; nomeBruto?: string; endereco?: string; telefone?: string };

/** Um serviço de dentro de um combo (o `preco` já é o preço NO combo; `avulso` é o preço do mesmo serviço fora do combo). */
export type ItemDeCombo = { id: string; nome: string; curto: string; preco?: number; avulso?: number; categoria?: string };
/** O combo inteiro: os itens e as ETAPAS em que ele é agendado (um item por etapa; os exames de laboratório juntos numa coleta só). */
export type ComboInfo = { id: string; nome: string; rotulo: string; total?: number; economia?: number; temRetorno: boolean; itens: ItemDeCombo[]; etapas: string[][] };
/** Um exame do orçamento: o serviço do Clinilink que casa com o que está no pedido médico, com o preço de cada unidade. */
export type ItemExame = { id: string; nome: string; nomeBruto: string; categoria?: string; precos: Record<string, number>; pedido: string };
/** Orçamento de exames em andamento (o paciente manda o pedido médico em foto ou escreve os nomes). */
export type Orcamento = {
  fase: 'coletando' | 'confirmando' | 'fechado'; // coletando: espera o pedido | confirmando: mostrou os exames e os valores e espera o "é isso" | fechado: confirmou, ela ofereceu agendar a coleta
  itens: ItemExame[]; naoAchados: string[]; origem: 'foto' | 'texto'; tent: number; pediuNomes: boolean; ilegivel?: boolean;
};
/** Escolhe, para cada nome do pedido, o(s) exame(s) do catálogo que ele é (IA; sempre validado). Cada resposta é uma lista de ids do catálogo. */
export type EscolherExames = (p: { nomes: string[]; catalogo: { id: string; nome: string }[] }) => Promise<string[][] | null>;
/** Um combo oferecido a quem pediu um serviço que faz parte dele. */
export type OfertaCombo = { id: string; rotulo: string; total: number; economia: number; texto: string };

export type Servico = {
  id: string;
  nome: string; // nome do cadastro: "Cardiologia", "Consulta Cardiologia"
  frase: string; // como falar em uma frase: "consulta de Cardiologia"
  tipo: 'consulta' | 'exame';
  unidades: Unidade[]; // unidades COM agenda, cada uma com os médicos que atendem
  precoTexto: string; // "A consulta custa R$ 200,00, no dinheiro ou Pix." ('' se não houver valor)
  viaSintoma?: boolean; // o paciente descreveu um sintoma em vez de pedir o serviço
  profissional?: { id: string; nome: string }; // o paciente pediu um profissional específico: a agenda é só dela(e)
  nomeBruto?: string; // como o procedimento está cadastrado ("HOLTER 24H"), para a mensagem de confirmação
  preparo?: string; // orientação de preparo/atendimento cadastrada no Clinilink (só se for um texto útil)
  categoria?: string; // categoria do procedimento no Clinilink (LABORATORIAL, ULTRASSONOGRAFIA...)
  detalhe?: string; // texto a mais depois do resumo das unidades (combo: o que está incluso)
  combo?: { id: string; nome: string; itens: { id: string; nome: string; lab?: boolean }[]; ancoraId: string; semCombo?: boolean }; // semCombo: vários exames agendados juntos que NÃO são de um combo (o agendamento não leva comboId)
  // // uma ETAPA do combo com vários serviços (exames de laboratório): o horário é o da âncora, os outros entram no mesmo dia
  pacote?: ComboInfo; // o COMBO inteiro, escolhido pelo paciente: o roteiro o transforma em etapas (cada uma vira um serviço normal, agendado em sequência)
};

export type Descoberta =
  | { servico: Servico }
  | { opcoes: { id: string; nome: string }[]; intro?: string; pergunta?: string } // mais de um procedimento parecido: perguntar qual (intro/pergunta: texto próprio, ex.: pedido genérico de exame)
  | { semAgenda: string } // existe, mas sem vaga aberta
  | { naoAchouServico: string } // o paciente pediu um serviço conhecido/claro e ele não está liberado para agendamento (ou tem outro nome no cadastro)
  | { naoAchouProfissional: string } // o paciente pediu uma pessoa pelo nome e não há ninguém assim com agenda
  | { semAgendaProfissional: { nome: string; alternativa?: Servico } } // a pessoa existe, mas sem horários abertos (alternativa = mesma especialidade, outros profissionais)
  | { servicoExterno: string } // o paciente pediu um serviço EXTERNO (tomografia, ressonância...): a equipe atende, a Amanda não agenda
  | { pedirPedido: true } // pedido genérico de exame (de sangue, laboratório, coleta...): o paciente manda o pedido médico (foto ou nomes) e a Amanda monta o orçamento
  | undefined; // não achou

/** Um período de atendimento (ordem de chegada) numa data. `inicio` = hora em que a agenda abre. */
export type Slot = { ymd: string; turno: Periodo; inicio: string; profissional?: string; profissionalId?: string; profissionalBruto?: string; unidade?: string /* só nas listas que misturam unidades */ };
export type PacienteInfo = { id?: string; nome: string };
export type AgendamentoExistente = { unidade: string; hora?: string; periodo?: Periodo; profissional?: string };

export type PedidoReserva = {
  servico: Servico; unidade: Unidade; slot: Slot; cpf: string;
  pacienteId?: string; // paciente já cadastrado
  cadastro?: { nome: string; nascimento: string; sexo: 'feminino' | 'masculino'; telefone: string }; // paciente novo
  observacao?: string; // gravada no agendamento (forma de pagamento, comprovante)
  comboId?: string; // o serviço faz parte de um combo (o Clinilink liga o agendamento ao combo)
};
export type ResultadoReserva =
  | { ok: true; profissional?: string; profissionalBruto?: string; hora: string; cadastrou: boolean; pacienteId?: string; linhas?: string[]; extra?: string }
  | { ok: false; codigo: string; motivo: string; incerto?: boolean; cadastrou?: boolean };

export interface Fonte {
  tipo: 'simulado' | 'clinilink';
  /** Só a fonte real: pré-carrega unidades e catálogo para a primeira consulta não esperar o Clinilink "acordar". */
  aquecer?(): Promise<void>;
  /** Só a fonte real implementa: cadastra (se novo) e reserva o horário livre. */
  reservar?(pedido: PedidoReserva): Promise<ResultadoReserva>;
  nomesUnidades(): Promise<string[]>;
  /** `buscando` = ainda não há serviço na conversa (permite busca por palavra solta). */
  /** `forte`: só aceita um serviço claramente citado (raiz conhecida ou palavra do nome); sem o palpite por palavras soltas. Usado quando já há serviço em andamento. */
  descobrir(textoNormalizado: string, buscando: boolean, forte?: boolean): Promise<Descoberta>;
  resolver(id: string): Promise<Descoberta>;
  /** Períodos com vaga em uma data. */
  periodos(sv: Servico, un: Unidade, ymd: string): Promise<Slot[]>;
  /** Próximos períodos com vaga a partir de uma data (inclusive). */
  proximas(sv: Servico, un: Unidade, deYmd: string, max: number): Promise<Slot[]>;
  /** O paciente já tem este serviço marcado neste dia (o Clinilink recusa duplicado no dia)? Devolve os dados do agendamento que já existe, ou null. */
  agendamentoExistente?(sv: Servico, ymd: string, pacienteId?: string): Promise<AgendamentoExistente | null>;
  /** Paciente por CPF (11 dígitos); null se não existir. */
  paciente(cpf: string): Promise<PacienteInfo | null>;
  /** Só a fonte real: combos que incluem o serviço e saem mais em conta (para sugerir a quem pediu só o serviço). */
  combosComServico?(sv: Servico): Promise<OfertaCombo[]>;
  /** Só a fonte real: acha no Clinilink (serviços de categoria laboratorial/laboratório ou exames) os exames escritos no pedido. */
  casarExames?(nomes: string[], escolher?: EscolherExames): Promise<{ itens: ItemExame[]; naoAchados: string[]; externos: string[] }>;
  /** Só a fonte real: o serviço para agendar a coleta de vários exames do orçamento num agendamento só. */
  servicoDeExames?(itens: ItemExame[]): Promise<Servico | { semAgenda: string }>;
  /** Só a fonte real: um combo que inclui TODOS esses exames e sai por menos que a soma (dica para o orçamento). */
  dicaDeCombo?(itens: ItemExame[], soma: number): Promise<string | undefined>;
  /** Só a fonte real: o serviço de UMA etapa do combo (um item, ou os exames de laboratório juntos), com as unidades que têm agenda. */
  etapaDoCombo?(combo: { id: string; rotulo: string; total?: number }, itens: ItemDeCombo[]): Promise<Servico | { semAgenda: string }>;
}

/** Raízes de busca: nome popular OU sintoma -> termo no catálogo. */
// `alt`: outros nomes com que o mesmo serviço aparece no cadastro (ex.: ultrassom -> USG -> ultrassonografia)
// `nome`: como falar do serviço quando ele não é encontrado
export const RAIZES: { re: RegExp; busca: string; alt?: string[]; sintoma?: RegExp; nome?: string }[] = [
  { re: /endocrin|diabetes|tireoide|hormonio/, busca: 'endocrin' },
  { re: /cardio|coracao|palpita|arritmia|pressao alta/, busca: 'cardio', sintoma: /dor|sinto|palpita|aperto|pressao|arritmia/ },
  { re: /derma|pele|acne|mancha|coceira/, busca: 'dermato' },
  { re: /gineco|menstrua|preventivo|gravid/, busca: 'gineco' },
  { re: /ortoped|osso|joelho|coluna|fratura|dor nas costas/, busca: 'ortoped' },
  { re: /pediatr|crianca|meu filho|minha filha|bebe/, busca: 'pediatr' },
  { re: /ultrassom|ultrasson|usg|ecografia/, busca: 'ultrassom', alt: ['usg', 'ultrassonografia'], nome: 'ultrassom' },
  { re: /clinic[oa] geral|clinico|medic[oa] geral|generalista/, busca: 'clinico geral', nome: 'consulta com clínico geral' },
  // exames e especialidades: o cadastro pode chamar de outro jeito (o radical e os nomes alternativos cobrem)
  { re: /ergometr|teste de esforco|esteira/, busca: 'ergometr', alt: ['esforco'], nome: 'teste ergométrico' },
  { re: /eletrocardio|\becg\b|\beletro\b/, busca: 'eletrocardio', alt: ['ecg'], nome: 'eletrocardiograma' },
  { re: /ecocardio|eco cardio|ecodoppler/, busca: 'ecocardio', alt: ['eco'], nome: 'ecocardiograma' },
  { re: /holter/, busca: 'holter', nome: 'holter' },
  { re: /\bmapa\b|pressao 24/, busca: 'mapa', nome: 'MAPA' },
  { re: /raio ?x|\brx\b|radiograf/, busca: 'raio', alt: ['rx', 'radiograf'], nome: 'raio-x' },
  { re: /tomograf/, busca: 'tomograf', nome: 'tomografia' },
  { re: /resson/, busca: 'resson', nome: 'ressonância' },
  { re: /mamograf/, busca: 'mamograf', nome: 'mamografia' },
  { re: /densitom/, busca: 'densitom', nome: 'densitometria' },
  { re: /endoscop/, busca: 'endosc', nome: 'endoscopia' },
  { re: /colonoscop/, busca: 'colonosc', nome: 'colonoscopia' },
  { re: /audiom/, busca: 'audiom', nome: 'audiometria' },
  { re: /espirom/, busca: 'espirom', nome: 'espirometria' },
  { re: /neurolog/, busca: 'neurolog', nome: 'neurologia' },
  { re: /oftalm|oculista|exame de vista/, busca: 'oftalm', nome: 'oftalmologia' },
  { re: /otorrino/, busca: 'otorrino', nome: 'otorrinolaringologia' },
  { re: /urolog/, busca: 'urolog', nome: 'urologia' },
  { re: /psiquiatr/, busca: 'psiquiatr', nome: 'psiquiatria' },
  { re: /psicolog/, busca: 'psicolog', nome: 'psicologia' },
  { re: /nutri/, busca: 'nutri', nome: 'nutrição' },
  { re: /fisioterap/, busca: 'fisioterap', nome: 'fisioterapia' },
  { re: /gastroenter|\bgastro\b/, busca: 'gastro', nome: 'gastroenterologia' },
  { re: /reumatolog/, busca: 'reumato', nome: 'reumatologia' },
  { re: /pneumolog/, busca: 'pneumo', nome: 'pneumologia' },
  { re: /geriatr/, busca: 'geriatr', nome: 'geriatria' },
  { re: /vascular|angiolog/, busca: 'vascular', nome: 'cirurgia vascular' },
];
// as raízes valem a partir do começo da palavra: "posso" não é "osso" (ortopedia) e "dor" não está em "corredor"
for (const r of RAIZES) {
  r.re = new RegExp(`\\b(?:${r.re.source})`, r.re.flags);
  if (r.sintoma) r.sintoma = new RegExp(`\\b(?:${r.sintoma.source})`, r.sintoma.flags);
}

// ------------------------- FONTE SIMULADA -------------------------
type Sim = { id: string; nome: string; tipo: 'consulta' | 'exame'; busca: string; unidades: string[]; preco: string; retornoDias?: number };
const SIM: Sim[] = [
  { id: 'endocrino', nome: 'Endocrinologia', tipo: 'consulta', busca: 'endocrin', unidades: ['Guamá'], preco: 'R$ 250,00', retornoDias: 30 },
  { id: 'cardio', nome: 'Cardiologia', tipo: 'consulta', busca: 'cardio', unidades: ['Guamá', 'Telégrafo'], preco: 'R$ 200,00', retornoDias: 30 },
  { id: 'dermato', nome: 'Dermatologia', tipo: 'consulta', busca: 'dermato', unidades: ['Guamá', 'Telégrafo'], preco: 'R$ 180,00', retornoDias: 30 },
  { id: 'gineco', nome: 'Ginecologia', tipo: 'consulta', busca: 'gineco', unidades: ['Telégrafo'], preco: 'R$ 180,00', retornoDias: 30 },
  { id: 'orto', nome: 'Ortopedia', tipo: 'consulta', busca: 'ortoped', unidades: ['Guamá'], preco: 'R$ 200,00', retornoDias: 30 },
  { id: 'pediatria', nome: 'Pediatria', tipo: 'consulta', busca: 'pediatr', unidades: ['Guamá', 'Telégrafo'], preco: 'R$ 160,00', retornoDias: 30 },
  { id: 'ultrassom', nome: 'Ultrassom', tipo: 'exame', busca: 'ultrassom', unidades: ['Guamá', 'Telégrafo'], preco: 'R$ 120,00' },
];
/** Médicos de exemplo por unidade e dias de atendimento (0 = domingo). Telégrafo atende menos dias. */
const PROF: Record<string, string> = { 'Guamá': 'Carlos Almeida', 'Telégrafo': 'Mariana Souza' };
const DIAS: Record<string, number[]> = { 'Guamá': [1, 2, 3, 4, 5, 6], 'Telégrafo': [2, 4, 6] };
const INICIO_SIM: Record<Periodo, string> = { manhã: '07:00', tarde: '13:00' };
/** CPF de exemplo que "existe" no cadastro simulado. */
const PACIENTES_SIM: Record<string, string> = { '52998224725': 'Maria da Silva Exemplo' };

const addDias = (ymd: string, n: number) => { const [y, m, d] = ymd.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d)); dt.setUTCDate(dt.getUTCDate() + n); return dt.toISOString().slice(0, 10); };
const dow = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay();

const simServico = (x: Sim): Servico => ({
  id: x.id, nome: x.nome, tipo: x.tipo,
  frase: x.tipo === 'consulta' ? `consulta de ${x.nome}` : `exame de ${x.nome}`,
  unidades: x.unidades.map((nome) => ({ nome, profissionais: [PROF[nome]], precoPix: Number(x.preco.replace(/[^\d,]/g, '').replace(',', '.')) })),
  precoTexto: x.tipo === 'consulta'
    ? `A consulta é ${x.preco}, no dinheiro ou Pix${x.retornoDias ? ` e dá direito a retorno em até ${x.retornoDias} dias` : ''}.`
    : `O exame é ${x.preco}, no dinheiro ou Pix.`,
});

function slotsDoDia(un: Unidade, ymd: string): Slot[] {
  const d = dow(ymd);
  if (!DIAS[un.nome]?.includes(d)) return [];
  const prof = PROF[un.nome];
  return d === 6
    ? [{ ymd, turno: 'manhã', inicio: INICIO_SIM.manhã, profissional: prof }]
    : [{ ymd, turno: 'manhã', inicio: INICIO_SIM.manhã, profissional: prof }, { ymd, turno: 'tarde', inicio: INICIO_SIM.tarde, profissional: prof }];
}

export const fonteSimulada: Fonte = {
  tipo: 'simulado',
  async nomesUnidades() { return ['Guamá', 'Telégrafo']; },
  async descobrir(t) {
    const raiz = RAIZES.find((r) => r.re.test(t));
    const x = raiz && SIM.find((s) => s.busca === raiz.busca);
    return x ? { servico: { ...simServico(x), viaSintoma: Boolean(raiz?.sintoma?.test(t)) } } : undefined;
  },
  async resolver(id) { const x = SIM.find((s) => s.id === id); return x ? { servico: simServico(x) } : undefined; },
  async periodos(_sv, un, ymd) { return slotsDoDia(un, ymd); },
  async proximas(_sv, un, de, max) {
    const out: Slot[] = [];
    for (let i = 0; i < 30 && out.length < max; i++) out.push(...slotsDoDia(un, addDias(de, i)));
    return out.slice(0, max);
  },
  async paciente(cpf) { const n = PACIENTES_SIM[cpf]; return n ? { nome: n } : null; },
};

/**
 * Como falar de uma etapa do combo: o nome do serviço; vários serviços juntos viram a lista dos nomes. Muitos exames de laboratório
 * viram "Exames de laboratório (A, B e mais N)" (ou "exames de laboratório (N)" quando vêm junto de outros serviços).
 */
export function rotuloDaEtapa(itens: ItemDeCombo[]): string {
  const ehLab = (i: ItemDeCombo) => /laborat/i.test(i.categoria ?? '');
  const juntar = (n: string[]) => (n.length <= 1 ? (n[0] ?? '') : `${n.slice(0, -1).join(', ')} e ${n[n.length - 1]}`);
  const n = itens.map((i) => i.curto);
  if (n.length <= 3) return juntar(n);
  if (itens.every(ehLab)) return `Exames de laboratório (${n.slice(0, 2).join(', ')} e mais ${n.length - 2})`;
  const labs = itens.filter(ehLab);
  const partes = [...itens.filter((i) => !ehLab(i)).map((i) => i.curto), ...(labs.length ? (labs.length <= 2 ? labs.map((i) => i.curto) : [`exames de laboratório (${labs.length})`]) : [])];
  return partes.length <= 3 ? juntar(partes) : `${partes.slice(0, 3).join(', ')} e mais ${partes.length - 3}`;
}
