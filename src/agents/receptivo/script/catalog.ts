/**
 * CATÁLOGO DE SIMULAÇÃO. Serviços, unidades, preços e horários abaixo são VALORES DE EXEMPLO para
 * testar o fluxo de conversa. Nada aqui vem do Clinilink. Quando a integração real existir, esta
 * consulta é trocada por lista_unidades / lista_procedimentos / lista_horarios.
 */
export type Unidade = 'Guamá' | 'Telégrafo';

export type Servico = {
  id: string;
  nome: string; // como aparece na conversa ("Cardiologia")
  tipo: 'consulta' | 'exame';
  palavras: RegExp; // aplicado ao texto normalizado (sem acento, minúsculo)
  unidades: Unidade[]; // unidades onde há agenda (resultado da "consulta de agenda")
  preco: string;
  retornoDias?: number; // só consulta com direito a retorno
};

export const SERVICOS: Servico[] = [
  { id: 'endocrino', nome: 'Endocrinologia', tipo: 'consulta', palavras: /endocrin|diabetes|tireoide|hormonio/, unidades: ['Guamá'], preco: 'R$ 250,00', retornoDias: 30 },
  { id: 'cardio', nome: 'Cardiologia', tipo: 'consulta', palavras: /cardio|coracao/, unidades: ['Guamá', 'Telégrafo'], preco: 'R$ 200,00', retornoDias: 30 },
  { id: 'dermato', nome: 'Dermatologia', tipo: 'consulta', palavras: /derma|pele/, unidades: ['Guamá', 'Telégrafo'], preco: 'R$ 180,00', retornoDias: 30 },
  { id: 'gineco', nome: 'Ginecologia', tipo: 'consulta', palavras: /gineco/, unidades: ['Telégrafo'], preco: 'R$ 180,00', retornoDias: 30 },
  { id: 'orto', nome: 'Ortopedia', tipo: 'consulta', palavras: /ortoped|osso/, unidades: ['Guamá'], preco: 'R$ 200,00', retornoDias: 30 },
  { id: 'pediatria', nome: 'Pediatria', tipo: 'consulta', palavras: /pediatr|crianca/, unidades: ['Guamá', 'Telégrafo'], preco: 'R$ 160,00', retornoDias: 30 },
  { id: 'ultrassom', nome: 'Ultrassom', tipo: 'exame', palavras: /ultrassom|ultrasson|usg|ecografia/, unidades: ['Guamá', 'Telégrafo'], preco: 'R$ 120,00' },
];

export type Periodo = 'manhã' | 'tarde';

/** Início do período (ordem de chegada). Sábado só pela manhã; domingo fechado. */
export const INICIO_PERIODO: Record<Periodo, string> = { manhã: '07:00', tarde: '13:00' };
