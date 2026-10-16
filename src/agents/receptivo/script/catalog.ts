/**
 * Tipos da "fonte de agenda" + FONTE SIMULADA.
 * A fonte simulada usa valores de EXEMPLO (médicos, preços, datas e pacientes inventados). Nada vem do
 * Clinilink. A fonte real fica em clinilinkFonte.ts e é escolhida quando CLINILINK_API_KEY existe.
 */
export type Periodo = 'manhã' | 'tarde';
export type Unidade = { id?: string; nome: string; profissionais?: string[] };

export type Servico = {
  id: string;
  nome: string; // nome do cadastro: "Cardiologia", "Consulta Cardiologia"
  frase: string; // como falar em uma frase: "consulta de Cardiologia"
  tipo: 'consulta' | 'exame';
  unidades: Unidade[]; // unidades COM agenda, cada uma com os médicos que atendem
  precoTexto: string; // "A consulta custa R$ 200,00, no dinheiro ou Pix." ('' se não houver valor)
  viaSintoma?: boolean; // o paciente descreveu um sintoma em vez de pedir o serviço
};

export type Descoberta =
  | { servico: Servico }
  | { opcoes: { id: string; nome: string }[] } // mais de um procedimento parecido: perguntar qual
  | { semAgenda: string } // existe, mas sem vaga aberta
  | undefined; // não achou

/** Um período de atendimento (ordem de chegada) numa data. `inicio` = hora em que a agenda abre. */
export type Slot = { ymd: string; turno: Periodo; inicio: string; profissional?: string; profissionalId?: string };
export type PacienteInfo = { id?: string; nome: string };

export type PedidoReserva = {
  servico: Servico; unidade: Unidade; slot: Slot; cpf: string;
  pacienteId?: string; // paciente já cadastrado
  cadastro?: { nome: string; nascimento: string; sexo: 'feminino' | 'masculino'; telefone: string }; // paciente novo
};
export type ResultadoReserva =
  | { ok: true; profissional?: string; hora: string; cadastrou: boolean }
  | { ok: false; codigo: string; motivo: string; incerto?: boolean; cadastrou?: boolean };

export interface Fonte {
  tipo: 'simulado' | 'clinilink';
  /** Só a fonte real implementa: cadastra (se novo) e reserva o horário livre. */
  reservar?(pedido: PedidoReserva): Promise<ResultadoReserva>;
  nomesUnidades(): Promise<string[]>;
  /** `buscando` = ainda não há serviço na conversa (permite busca por palavra solta). */
  descobrir(textoNormalizado: string, buscando: boolean): Promise<Descoberta>;
  resolver(id: string): Promise<Descoberta>;
  /** Períodos com vaga em uma data. */
  periodos(sv: Servico, un: Unidade, ymd: string): Promise<Slot[]>;
  /** Próximos períodos com vaga a partir de uma data (inclusive). */
  proximas(sv: Servico, un: Unidade, deYmd: string, max: number): Promise<Slot[]>;
  /** Paciente por CPF (11 dígitos); null se não existir. */
  paciente(cpf: string): Promise<PacienteInfo | null>;
}

/** Raízes de busca: nome popular OU sintoma -> termo no catálogo. */
export const RAIZES: { re: RegExp; busca: string; sintoma?: RegExp }[] = [
  { re: /endocrin|diabetes|tireoide|hormonio/, busca: 'endocrin' },
  { re: /cardio|coracao|palpita|arritmia|pressao alta/, busca: 'cardio', sintoma: /dor|sinto|palpita|aperto|pressao|arritmia/ },
  { re: /derma|pele|acne|mancha|coceira/, busca: 'dermato' },
  { re: /gineco|menstrua|preventivo|gravid/, busca: 'gineco' },
  { re: /ortoped|osso|joelho|coluna|fratura|dor nas costas/, busca: 'ortoped' },
  { re: /pediatr|crianca|meu filho|minha filha|bebe/, busca: 'pediatr' },
  { re: /ultrassom|ultrasson|usg|ecografia/, busca: 'ultrassom' },
];

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
const PACIENTES_SIM: Record<string, string> = { '11122233344': 'Maria da Silva Exemplo' };

const addDias = (ymd: string, n: number) => { const [y, m, d] = ymd.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d)); dt.setUTCDate(dt.getUTCDate() + n); return dt.toISOString().slice(0, 10); };
const dow = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay();

const simServico = (x: Sim): Servico => ({
  id: x.id, nome: x.nome, tipo: x.tipo,
  frase: x.tipo === 'consulta' ? `consulta de ${x.nome}` : `exame de ${x.nome}`,
  unidades: x.unidades.map((nome) => ({ nome, profissionais: [PROF[nome]] })),
  precoTexto: x.tipo === 'consulta'
    ? `A consulta custa ${x.preco}, no dinheiro ou Pix${x.retornoDias ? `, e dá direito a retorno em até ${x.retornoDias} dias` : ''}.`
    : `O exame custa ${x.preco}, no dinheiro ou Pix.`,
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
