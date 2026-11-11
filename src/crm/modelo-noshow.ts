/**
 * O fluxo do No-show, transcrito do "Guia de Atendimento do Lead" (páginas 1 e 5, fluxo do No-show): orçamentos de pacientes que faltaram ao agendamento.
 * Segue o mesmo formato do fluxo de leads (modelo.ts): itens clicáveis (modais), mapa, calendário D0-D8 e regras de ouro.
 * Os ids começam com "ns-" para nunca colidir com os do fluxo de leads. Os números vêm dos cards do funil "No-show".
 */
import type { Aresta, Item, NoMapa } from './modelo.js';

const MOTIVOS = ['Preço', 'Outro lugar', 'Desistiu', 'Plano', 'Sem retorno', 'Outro'];

export const REGRAS_NOSHOW: { n: number; titulo: string; texto: string; aplicada: string }[] = [
  { n: 1, titulo: 'Já voltou e pagou?', texto: 'Mover para Recuperado. Não entrar em contato.', aplicada: 'Antes de cada contato, confira se o paciente já voltou e pagou. Se sim, o card vai para Recuperado e nenhum contato é feito.' },
  { n: 2, titulo: 'Máx. 2 tentativas por dia', texto: 'Sempre entre 8h e 19h. Sem exceção.', aplicada: 'No máximo 2 contatos por dia para o mesmo paciente, sempre entre 8h e 19h. Vale para todas as etapas do No-show.' },
  { n: 3, titulo: 'Registre tudo no card', texto: 'Data, canal e resultado de cada tentativa.', aplicada: 'Cada tentativa fica registrada no card, com data, canal e resultado.' },
  { n: 4, titulo: 'Perdido sempre com motivo', texto: 'Preço, outro lugar, desistiu, plano, sem retorno ou outro.', aplicada: 'Nenhum card vai para Perdido sem um dos 6 motivos. No D8 sem resposta, o motivo é "Sem retorno".' },
];

export const ITENS_NOSHOW: Item[] = [
  { id: 'ns-faltou', fluxo: 'noshow', tipo: 'entrada', titulo: 'Paciente faltou', sub: 'No-show · D0, o dia da falta', dias: ['D0'],
    resumo: 'É onde o fluxo começa: o paciente tinha um agendamento com orçamento e não compareceu. O dia da falta é o D0, e é dele que contam os prazos do No-show (D1, D3, D7 e D8).',
    fazer: ['O card chega sozinho na coluna No-show, vindo do Clinilink, no dia da falta.', 'Antes de qualquer contato, confira se o paciente já voltou e pagou.'],
    saidas: [{ rotulo: 'Entra no No-show', para: 'ns-noshow' }], regras: [1] },
  { id: 'ns-noshow', fluxo: 'noshow', tipo: 'negociacao', num: '1.', titulo: 'No-show', sub: 'Entra no dia da falta', selo: 'PRIORIDADE Nº 1', limite: '1 dia', hora: '08:30', dias: ['D0', 'D1'], canais: ['WhatsApp'], msgs: [10],
    resumo: 'Primeira coluna do fluxo e prioridade nº 1 do dia: o card entra no dia da falta e o limite é de 1 dia. No D1, às 08:30 (primeiras horas do dia), é feito o contato de remarcação e o card vai para Retomada 1.',
    fazer: ['Trate os no-shows antes de qualquer outra coisa, às 08:30, nas primeiras horas do dia.', 'Antes de contatar, confira se o paciente já voltou e pagou: se sim, mova para Recuperado e não entre em contato.', 'No D1, às 08:30, envie a mensagem de remarcação pelo WhatsApp (mensagem 10).', 'Registre o contato no card e mova para Retomada 1.'],
    cadencia: ['ns-d0', 'ns-d1'],
    saidas: [{ rotulo: 'D1', para: 'ns-retomada' }], regras: [1, 2, 3] },
  { id: 'ns-retomada', fluxo: 'noshow', tipo: 'negociacao', num: '2.', titulo: 'Retomada 1', sub: 'D1 às 08:30 · mensagem para remarcar a falta', limite: '1 dia', hora: '08:30', dias: ['D1', 'D2'], canais: ['WhatsApp'], msgs: [10],
    resumo: 'Depois do contato de remarcação, o card espera a resposta por 1 dia. O que o paciente responder decide para onde o card vai: remarcou, fechou e pagou, não quer remarcar ou não respondeu em 1 dia.',
    fazer: ['Aguarde a resposta por 1 dia.', 'Mova o card conforme a resposta: Remarcou → Agendado · Fechou e pagou → Recuperado · Não quer remarcar → Perdido, com motivo · Não respondeu em 1 dia → Sem retorno (D3).', 'Registre data, canal e resultado de cada tentativa.'],
    extra: [{ titulo: 'Mover o card conforme a resposta', texto: 'Remarcou: Agendado. Fechou e pagou: Recuperado. Não quer remarcar: Perdido + motivo. Não respondeu em 1 dia: Sem retorno · D3.' }],
    saidas: [{ rotulo: 'Remarcou', para: 'ns-agendado' }, { rotulo: 'Não quer remarcar', para: 'ns-perdido' }, { rotulo: 'Não respondeu · 1 dia', para: 'ns-semretorno' }, { rotulo: 'Fechou e pagou direto', para: 'ns-recuperado', excecao: true }], regras: [1, 2, 3, 4] },
  { id: 'ns-agendado', fluxo: 'noshow', tipo: 'agendado', num: '3.', titulo: 'Agendado', sub: 'No-show · remarcou nova data', limite: 'Cadência: 10 dias',
    resumo: 'O paciente remarcou. O card fica em Agendado, com cadência de 10 dias. Na nova data: se compareceu e pagou, vai para Recuperado; se faltou de novo, volta para No-show, até o paciente desistir.',
    fazer: ['Confirme a nova data com o paciente.', 'Na nova data, confira o comparecimento.', 'Compareceu e pagou: mova para Recuperado.', 'Faltou de novo: o card volta para No-show e o fluxo recomeça, até o paciente desistir.'],
    saidas: [{ rotulo: 'Compareceu e pagou', para: 'ns-recuperado' }, { rotulo: 'Faltou de novo · volta para No-show', para: 'ns-noshow', excecao: true }], regras: [2, 3] },
  { id: 'ns-perdido', fluxo: 'noshow', tipo: 'descarte', titulo: 'Perdido', sub: 'Desistiu ou não respondeu', dias: ['D8'], motivos: MOTIVOS,
    resumo: 'Fim do caminho sem recuperação: o paciente desistiu ou não respondeu. Perdido é sempre com motivo: preço, outro lugar, desistiu, plano, sem retorno ou outro.',
    extra: [{ titulo: 'Vindo de Retomada 1', texto: 'Não quer remarcar: perdido, com o motivo que o paciente deu.' }, { titulo: 'Vindo de Sem retorno', texto: 'No D8, sem resposta: perdido, com o motivo "Sem retorno".' }], regras: [4] },
  { id: 'ns-semretorno', fluxo: 'noshow', tipo: 'sem_retorno', titulo: 'Sem retorno', sub: 'D3 nova tentativa · D7 encerramento', limite: 'Até o D8', dias: ['D3', 'D7', 'D8'], msgs: [2, 4],
    resumo: 'Quem não respondeu à retomada em 1 dia entra em Sem retorno: no D3, às 11:30, nova tentativa (ligação e WhatsApp, em outro horário); no D7, às 16:00, o aviso de encerramento. No D8, sem resposta, vai para Perdido com o motivo "Sem retorno". O desconto é só do fluxo do Lead.',
    fazer: ['D3, às 11:30: nova tentativa em outro horário, por ligação e WhatsApp (mensagem 2).', 'D7, às 16:00: avise que vai encerrar (mensagem 4).', 'D8: sem resposta, mova para Perdido com o motivo "Sem retorno".', 'Respondeu? Mova o card conforme a resposta.'],
    cadencia: ['ns-t3', 'ns-t7', 'ns-perdido'],
    saidas: [{ rotulo: 'D8 · motivo: sem retorno', para: 'ns-perdido' }, { rotulo: 'Respondeu e remarcou', para: 'ns-agendado', excecao: true }, { rotulo: 'Respondeu e pagou', para: 'ns-recuperado', excecao: true }], regras: [1, 2, 3, 4] },
  { id: 'ns-recuperado', fluxo: 'noshow', tipo: 'ativo', titulo: 'Recuperado', sub: 'Fechou e pagou', resumo: 'Fim do funil: o paciente que faltou voltou, fechou e pagou. O orçamento foi recuperado.', regras: [1] },
  { id: 'ns-antes', fluxo: 'noshow', tipo: 'regra', titulo: 'Antes de cada contato', sub: 'O paciente já voltou e pagou?',
    resumo: 'Toda vez, antes de entrar em contato, confira se o paciente já voltou e pagou. Se sim, mova o card para Recuperado e não entre em contato.',
    saidas: [{ rotulo: 'Sim', para: 'ns-mover', excecao: true }], regras: [1] },
  { id: 'ns-mover', fluxo: 'noshow', tipo: 'organico', titulo: 'Mover para Recuperado', sub: 'Não entrar em contato', resumo: 'O paciente já voltou e pagou: mova o card para Recuperado e não entre em contato.', regras: [1] },
  // passos do calendário (células da página 2 do PDF)
  { id: 'ns-d0', fluxo: 'noshow', tipo: 'passo', titulo: 'Card entra no No-show', sub: 'Paciente não compareceu', dias: ['D0'], pai: 'ns-noshow', limite: 'No-show: 1 dia',
    resumo: 'No D0, o dia da falta, o card entra na coluna No-show porque o paciente não compareceu ao agendamento.', fazer: ['Confira que o paciente realmente faltou.', 'O card já entra como prioridade nº 1 do dia.'] },
  { id: 'ns-d1', fluxo: 'noshow', tipo: 'passo', titulo: 'Contato de remarcação', sub: 'Primeiras horas do dia · mover para Retomada 1', hora: '08:30', dias: ['D1'], canais: ['WhatsApp'], msgs: [10], pai: 'ns-noshow', limite: 'No-show: 1 dia',
    resumo: 'No D1, às 08:30 (primeiras horas do dia), mande a mensagem para remarcar a falta e mova o card para Retomada 1.', fazer: ['Envie a mensagem 10 pelo WhatsApp às 08:30, nas primeiras horas do dia.', 'Mova o card para Retomada 1.', 'Registre data, canal e resultado.'] },
  { id: 'ns-t3', fluxo: 'noshow', tipo: 'passo', titulo: 'Nova tentativa', sub: 'outro horário', hora: '11:30', dias: ['D3'], canais: ['Ligação', 'WhatsApp'], msgs: [2], pai: 'ns-semretorno', limite: 'Sem retorno: até o D8',
    resumo: 'No D3, às 11:30, quem não respondeu à retomada recebe uma nova tentativa, em outro horário, por ligação e WhatsApp. O D3 é o mesmo do fluxo do Lead.', fazer: ['Tente em outro horário, às 11:30.', 'Ligação e WhatsApp.', 'Envie a mensagem 2.'] },
  { id: 'ns-t7', fluxo: 'noshow', tipo: 'passo', titulo: 'Encerramento', sub: 'avisa que vai encerrar', hora: '16:00', dias: ['D7'], canais: ['WhatsApp'], msgs: [4], pai: 'ns-semretorno', limite: 'Sem retorno: até o D8',
    resumo: 'No D7, às 16:00, o paciente que continua sem responder recebe o aviso de encerramento. No D8, sem resposta, o card vai para Perdido.', fazer: ['Avise que vai encerrar o atendimento.', 'Deixe claro que, se ainda precisar, é só responder.', 'Envie a mensagem 4.'] },
];

// ------------------------------------------------------------------------------------------------ mapa (página 1 do PDF)

export const MAPA_NOSHOW = {
  w: 1240, h: 640,
  nos: [
    { id: 'ns-faltou', x: 20, y: 202, w: 121, h: 83, estilo: 'outline', titulo: 'PACIENTE FALTOU', sub: 'D0' },
    { id: 'ns-noshow', x: 188, y: 179, w: 178, h: 130, estilo: 'dark', titulo: '1. NO-SHOW', selo: 'PRIORIDADE Nº 1', sub: 'Entra no dia da falta\nLimite: 1 dia' },
    { id: 'ns-retomada', x: 421, y: 179, w: 214, h: 130, estilo: 'hot', titulo: '2. RETOMADA 1', sub: 'DIA 01 ÀS 08:30\nPrimeiras horas do dia:\nmensagem para remarcar a falta', pill: 'Msg 10 · Faltoso no-show' },
    { id: 'ns-agendado', x: 750, y: 48, w: 213, h: 111, estilo: 'deep', titulo: '3. AGENDADO', sub: 'Remarcou nova data\nCadência: 10 dias' },
    { id: 'ns-recuperado', x: 1049, y: 48, w: 184, h: 111, estilo: 'win', titulo: 'RECUPERADO', sub: 'Fechou e pagou' },
    { id: 'ns-perdido', x: 750, y: 197, w: 213, h: 111, estilo: 'ghost', titulo: 'PERDIDO', sub: 'Desistiu ou não respondeu\nSempre com motivo' },
    { id: 'ns-semretorno', x: 750, y: 347, w: 213, h: 128, estilo: 'slate', titulo: 'SEM RETORNO', sub: 'D3 às 11:30 nova tentativa\nD7 às 16:00 encerramento', pill: 'Respondeu? Mover conforme resposta' },
    { id: 'ns-antes', x: 20, y: 545, w: 280, h: 73, estilo: 'dashed', titulo: 'ANTES DE CADA CONTATO', sub: 'O paciente já voltou e pagou?' },
    { id: 'ns-mover', x: 356, y: 545, w: 233, h: 73, estilo: 'outline-red', titulo: 'MOVER PARA RECUPERADO', sub: 'Não entrar em contato' },
  ] as NoMapa[],
  arestas: [
    { id: 'n1', de: 'ns-faltou', para: 'ns-noshow', d: 'M141 244 H188' },
    { id: 'n2', de: 'ns-noshow', para: 'ns-retomada', d: 'M366 244 H421', rotulo: 'D1', lx: 393, ly: 232, ancora: 'middle' },
    { id: 'n3', de: 'ns-retomada', para: 'ns-agendado', d: 'M635 244 H655 V103 H750', rotulo: 'Remarcou', lx: 663, ly: 91, ancora: 'start' },
    { id: 'n4', de: 'ns-retomada', para: 'ns-perdido', d: 'M635 244 H655 V252 H750', rotulo: 'Não quer\nremarcar', lx: 663, ly: 226, ancora: 'start' },
    { id: 'n5', de: 'ns-retomada', para: 'ns-semretorno', d: 'M635 244 H655 V411 H750', rotulo: 'Não respondeu\nem 1 dia · D3', lx: 663, ly: 389, ancora: 'start' },
    { id: 'n6', de: 'ns-agendado', para: 'ns-recuperado', d: 'M963 103 H1049', rotulo: 'Compareceu\ne pagou', lx: 1006, ly: 78, ancora: 'middle' },
    { id: 'n7', de: 'ns-semretorno', para: 'ns-perdido', d: 'M856 347 V308', rotulo: 'D8 · motivo: sem retorno', lx: 866, ly: 332, ancora: 'start' },
    { id: 'n8', de: 'ns-agendado', para: 'ns-noshow', d: 'M856 48 V22 H277 V179', rotulo: 'Faltou de novo: volta para No-show até desistir', lx: 289, ly: 14, ancora: 'start', excecao: true },
    { id: 'n9', de: 'ns-retomada', para: 'ns-recuperado', d: 'M529 309 V500 H1141 V159', rotulo: 'Fechou e pagou direto', lx: 543, ly: 492, ancora: 'start', excecao: true },
    { id: 'n10', de: 'ns-antes', para: 'ns-mover', d: 'M300 581 H356', rotulo: 'Sim', lx: 328, ly: 569, ancora: 'middle', excecao: true },
  ] as Aresta[],
};

// ------------------------------------------------------------------------------------------------ calendário (página 2 do PDF)

export type RamoNoShow = { rotulo: string; destino: string; item: string; tom: 'agendado' | 'recuperado' | 'perdido' | 'semretorno' | 'noshow' };
export type LinhaNoShow = {
  id: string; rotulo: string; limite: string; item: string; selo?: string;
  celulas?: Record<string, { id: string; sub?: string }>;
  /** bloco que ocupa várias colunas (de..ate) com respostas clicáveis */
  bloco?: { de: string; ate: string; titulo: string; ramos: RamoNoShow[] };
};

export const GRADE_NOSHOW: { dias: string[]; linhas: LinhaNoShow[] } = {
  dias: ['D0', 'D1', 'D3', 'D7', 'D8'],
  linhas: [
    { id: 'ns_noshow', rotulo: 'NO-SHOW', limite: 'Limite: 1 dia', selo: 'Prioridade nº 1', item: 'ns-noshow', celulas: { D0: { id: 'ns-d0' }, D1: { id: 'ns-d1' } } },
    { id: 'ns_retomada', rotulo: 'RETOMADA 1', limite: 'Limite: 1 dia', item: 'ns-retomada', bloco: { de: 'D1', ate: 'D3', titulo: 'Mover o card conforme a resposta:', ramos: [
      { rotulo: 'Remarcou', destino: 'AGENDADO', item: 'ns-agendado', tom: 'agendado' },
      { rotulo: 'Fechou e pagou', destino: 'RECUPERADO', item: 'ns-recuperado', tom: 'recuperado' },
      { rotulo: 'Não quer remarcar', destino: 'PERDIDO + motivo', item: 'ns-perdido', tom: 'perdido' },
      { rotulo: 'Não respondeu em 1 dia', destino: 'SEM RETORNO · D3', item: 'ns-semretorno', tom: 'semretorno' },
    ] } },
    { id: 'ns_semretorno', rotulo: 'SEM RETORNO', limite: 'Respondeu? Mover conforme a resposta', item: 'ns-semretorno', celulas: { D3: { id: 'ns-t3' }, D7: { id: 'ns-t7' }, D8: { id: 'ns-perdido', sub: 'motivo: sem retorno' } } },
    { id: 'ns_agendado', rotulo: 'AGENDADO', limite: 'Cadência: 10 dias', item: 'ns-agendado', bloco: { de: 'D1', ate: 'D8', titulo: 'Na nova data:', ramos: [
      { rotulo: 'Compareceu e pagou', destino: 'RECUPERADO', item: 'ns-recuperado', tom: 'recuperado' },
      { rotulo: 'Faltou de novo, volta para', destino: 'NO-SHOW', item: 'ns-noshow', tom: 'noshow' },
    ] } },
  ],
};

/** Etapa do funil "No-show" (pelo rótulo da coluna) que cada item analisa. Passos analisam a etapa a que pertencem. */
export const ETAPA_DO_ITEM: Record<string, string | null> = {
  'ns-faltou': null, 'ns-noshow': 'noshow', 'ns-d0': 'noshow', 'ns-d1': 'noshow', 'ns-retomada': 'retomada', 'ns-agendado': 'agendado',
  'ns-perdido': 'perdido', 'ns-semretorno': 'semretorno', 'ns-t3': 'semretorno', 'ns-t7': 'semretorno',
  'ns-recuperado': 'recuperado', 'ns-antes': 'recuperado', 'ns-mover': 'recuperado',
};
/** Prazo (dias) de cada etapa, do PDF. */
export const LIMITE_NOSHOW: Record<string, number> = { noshow: 1, retomada: 1, semretorno: 8, agendado: 10 };
/** Item principal de cada etapa (para contar cards e listar quem está lá). */
export const ITEM_DA_ETAPA: Record<string, string> = { noshow: 'ns-noshow', retomada: 'ns-retomada', agendado: 'ns-agendado', perdido: 'ns-perdido', semretorno: 'ns-semretorno', recuperado: 'ns-recuperado' };
