/**
 * Tipos da "fonte de agenda" + FONTE SIMULADA.
 * A fonte simulada usa valores de EXEMPLO (nada vem do Clinilink). A fonte real fica em
 * clinilinkFonte.ts e é escolhida quando CLINILINK_API_KEY está configurada.
 */
export type Periodo = 'manhã' | 'tarde';
export type Unidade = { id?: string; nome: string };

export type Servico = {
  id: string;
  nome: string; // "Cardiologia", "Consulta Cardiológica"...
  tipo: 'consulta' | 'exame';
  unidades: Unidade[]; // unidades COM agenda (resultado da consulta de agenda)
  precoTexto: string; // frase pronta, ex.: "A consulta custa R$ 200,00, no dinheiro ou Pix." ('' se não houver valor)
};

export type Descoberta =
  | { servico: Servico }
  | { opcoes: { id: string; nome: string }[] } // mais de um procedimento parecido: perguntar qual
  | { semAgenda: string } // existe, mas sem vaga aberta
  | undefined; // não achou

export type Vaga =
  | { ok: true; inicio: string; profissional?: string }
  | { ok: false; alternativas: { ymd: string; turno: Periodo; inicio: string }[] };

export interface Fonte {
  tipo: 'simulado' | 'clinilink';
  nomesUnidades(): Promise<string[]>;
  /** `buscando` = ainda não há serviço na conversa (permite busca por palavra solta). */
  descobrir(textoNormalizado: string, buscando: boolean): Promise<Descoberta>;
  resolver(id: string): Promise<Descoberta>;
  vaga(sv: Servico, un: Unidade, ymd: string, turno: Periodo): Promise<Vaga>;
}

/** Raízes de busca (nome popular -> termo no catálogo). Vale para a fonte real e a simulada. */
export const RAIZES: { re: RegExp; busca: string }[] = [
  { re: /endocrin|diabetes|tireoide|hormonio/, busca: 'endocrin' },
  { re: /cardio|coracao/, busca: 'cardio' },
  { re: /derma|pele/, busca: 'dermato' },
  { re: /gineco/, busca: 'gineco' },
  { re: /ortoped|osso/, busca: 'ortoped' },
  { re: /pediatr|crianca/, busca: 'pediatr' },
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
const INICIO_SIM: Record<Periodo, string> = { manhã: '07:00', tarde: '13:00' };

const simServico = (x: Sim): Servico => ({
  id: x.id, nome: x.nome, tipo: x.tipo, unidades: x.unidades.map((nome) => ({ nome })),
  precoTexto: x.tipo === 'consulta'
    ? `A consulta custa ${x.preco}, no dinheiro ou Pix${x.retornoDias ? `, e dá direito a retorno em até ${x.retornoDias} dias` : ''}.`
    : `O exame custa ${x.preco}, no dinheiro ou Pix.`,
});

export const fonteSimulada: Fonte = {
  tipo: 'simulado',
  async nomesUnidades() { return ['Guamá', 'Telégrafo']; },
  async descobrir(t) {
    const raiz = RAIZES.find((r) => r.re.test(t));
    const x = raiz && SIM.find((s) => s.busca === raiz.busca);
    return x ? { servico: simServico(x) } : undefined;
  },
  async resolver(id) { const x = SIM.find((s) => s.id === id); return x ? { servico: simServico(x) } : undefined; },
  async vaga(_sv, _un, _ymd, turno) { return { ok: true, inicio: INICIO_SIM[turno] }; },
};
