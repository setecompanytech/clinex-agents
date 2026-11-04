/**
 * O processo comercial da Clinex, transcrito do "Guia de Atendimento do Lead" (4 páginas).
 * É a fonte ÚNICA: o motor de regras (motor.ts) lê os passos daqui e a tela lê tudo daqui (vai como JSON para o navegador).
 * Para mudar o processo (um dia, uma mensagem, um limite), é só mexer neste arquivo.
 */

import { GRADE_NOSHOW, ITENS_NOSHOW, MAPA_NOSHOW, REGRAS_NOSHOW } from './modelo-noshow.js';

export type Fase = 'aberto' | 'sem_retorno' | 'negociacao';
export type Canal = 'whatsapp' | 'ligacao';
export type Status = 'aberto' | 'sem_retorno' | 'negociacao' | 'agendado' | 'convertido_ativo' | 'convertido_organico' | 'descarte';

export const MOTIVOS_DESCARTE = ['Preço', 'Outro lugar', 'Desistiu', 'Plano', 'Sem retorno', 'Outro'] as const;

/** Regras de ouro e limites numéricos (página 2). */
export const LIMITES = {
  aberto: 1, // dias
  sem_retorno: 10,
  negociacao: 15,
  tentativasPorDia: 2,
  janelaInicioH: 8,
  janelaFimH: 19,
  ligacaoAcimaDe: 500, // R$
  reativacaoMinDias: 30,
  reativacaoMaxDias: 60,
} as const;

export type PassoDef = {
  id: string;
  fase: Fase | 'especial';
  rotulo: string;
  /** dia da cadência (D#) contado do D0 do lead (aberto/sem retorno) ou do D0 da negociação */
  dia?: number;
  msg?: number;
  canais: Canal[];
  desc: string;
  /** id do item do guia (fluxo/calendário) que explica este passo */
  item: string;
  /** passo que é uma decisão da pessoa, não uma mensagem */
  decisao?: boolean;
};

export const PASSOS: PassoDef[] = [
  { id: 'primeiro', fase: 'aberto', rotulo: 'Primeiro contato', dia: 1, msg: 1, canais: ['whatsapp', 'ligacao'], desc: '1º horário do dia · ligação se acima de R$ 500', item: 'primeiro' },
  { id: 'tentativa', fase: 'sem_retorno', rotulo: 'Nova tentativa', dia: 2, msg: 2, canais: ['ligacao', 'whatsapp'], desc: 'outro horário', item: 'tentativa' },
  { id: 'desconto', fase: 'sem_retorno', rotulo: 'Desconto', dia: 3, msg: 3, canais: ['whatsapp'], desc: '10% ou 5%, conforme o orçamento', item: 'desconto' },
  { id: 'encerramento', fase: 'sem_retorno', rotulo: 'Encerramento', dia: 7, msg: 4, canais: ['whatsapp'], desc: 'avisa que vai encerrar', item: 'semretorno' },
  { id: 'orcamento', fase: 'negociacao', rotulo: 'Orçamento', dia: 0, msg: 5, canais: ['whatsapp'], desc: '+ 2 opções de horário', item: 'neg0' },
  { id: 'followup', fase: 'negociacao', rotulo: 'Follow-up', dia: 1, msg: 6, canais: ['whatsapp'], desc: 'viu o orçamento? oferecer horário', item: 'neg1' },
  { id: 'objecao', fase: 'negociacao', rotulo: 'Tratar a objeção', dia: 3, msg: 7, canais: ['whatsapp'], desc: 'preço · data · plano · preparo', item: 'neg3' },
  { id: 'ultima', fase: 'negociacao', rotulo: 'Última oferta', dia: 7, msg: 8, canais: ['whatsapp'], desc: 'validade + agenda', item: 'neg7' },
  { id: 'descarte_neg', fase: 'negociacao', rotulo: 'Descarte', dia: 8, canais: [], desc: 'sem resposta, com motivo', item: 'descarte', decisao: true },
  // passos de exceção (fora da cadência por dias)
  { id: 'noshow', fase: 'especial', rotulo: 'No show', msg: 10, canais: ['whatsapp'], desc: 'reagendar quem faltou', item: 'agendado' },
  { id: 'retorno', fase: 'especial', rotulo: 'Retorno personalizado', msg: 9, canais: ['whatsapp'], desc: 'na data combinada', item: 'retorno' },
  { id: 'reativacao', fase: 'especial', rotulo: 'Reativação', msg: 11, canais: ['whatsapp'], desc: '30 a 60 dias depois do descarte', item: 'reativacao' },
  { id: 'comparecimento', fase: 'especial', rotulo: 'Conferir comparecimento', canais: [], desc: 'compareceu e pagou, ou faltou?', item: 'agendado', decisao: true },
];

// ------------------------------------------------------------------------------------------------ mensagens (páginas 3 e 4)

export type Variante = { rotulo: string; corpo: string; botoes: string[] };
export type Mensagem = { n: number; titulo: string; quando: string; item: string; grupo: string; corpo: string; botoes: string[]; nota?: string; variantes?: Variante[] };

export const MENSAGENS: Mensagem[] = [
  { n: 1, titulo: 'Primeiro contato', quando: 'Em aberto · D1', item: 'primeiro', grupo: 'aberto',
    corpo: 'Olá, [Nome]! Aqui é [Atendente], da Clinex 😊\n\nVi que você tem interesse em [exame ou consulta]. Gostaria de agendar com a gente?\n\nPosso te enviar as opções de valor e horário agora?',
    botoes: ['Agendar', 'Ver valor e horário', 'Não tenho interesse'] },
  { n: 2, titulo: 'Nova tentativa', quando: 'Sem retorno · D2', item: 'tentativa', grupo: 'sem_retorno',
    corpo: 'Oi, [Nome]! Tentei entrar em contato com você, mas não consegui retorno.\n\n[Seu exame ou consulta] ainda pode ser feito [hoje / esta semana / este mês]. Quer que eu te envie valor e horários?',
    botoes: ['Agendar', 'Ver valor e horário', 'Não tenho interesse'] },
  { n: 3, titulo: 'Desconto', quando: 'Sem retorno · D3', item: 'desconto', grupo: 'sem_retorno',
    corpo: '[Nome], estamos com uma condição especial de [10% ou 5%] de desconto para [seu exame ou consulta].\n\nPagando via Pix, o seu orçamento de [valor] fica por apenas [valor]. Posso te ajudar a garantir seu agendamento com esse desconto?',
    botoes: ['Agendar', 'Esclarecer dúvida', 'Não tenho interesse'] },
  { n: 4, titulo: 'Encerramento', quando: 'Sem retorno · D7', item: 'semretorno', grupo: 'sem_retorno',
    corpo: '[Nome], vou encerrar seu atendimento por aqui para não te incomodar.\n\nSe ainda precisar do [exame], é só responder esta mensagem que retomamos na hora. A Clinex fica à disposição 💙',
    botoes: ['Ainda quero o exame', 'Já fiz o exame', 'Não tenho interesse'] },
  { n: 5, titulo: 'Orçamento', quando: 'Em negociação · D0', item: 'neg0', grupo: 'negociacao',
    corpo: '[Nome], aqui é da Clinex. Passando para lembrar que o orçamento [de exames ou combo] que conversamos continua disponível.\n\nSe quiser, posso te ajudar a agendar ou esclarecer alguma dúvida.',
    botoes: ['Agendar', 'Ver valor e horário', 'Não tenho interesse'] },
  { n: 6, titulo: 'Follow-up', quando: 'Em negociação · D1', item: 'neg1', grupo: 'negociacao',
    corpo: 'Oi, [Nome]! Conseguiu ver o orçamento do seu [exame]?\n\nAinda tenho [dia] às [hora] livre. Quer que eu reserve para você?',
    botoes: ['Pode reservar', 'Tenho uma dúvida', 'Não tenho interesse'] },
  { n: 7, titulo: 'Tratar a objeção', quando: 'Em negociação · D3', item: 'neg3', grupo: 'negociacao',
    nota: 'Comece pela pergunta e responda conforme a objeção.',
    corpo: '[Nome], ficou alguma dúvida sobre o orçamento? Me conta o que está pesando que eu te ajudo a encontrar o melhor caminho.',
    botoes: ['Preço', 'Data ou horário', 'Plano ou preparo'],
    variantes: [
      { rotulo: 'Se for preço', corpo: 'Entendo, [Nome]. Consegui uma condição para você: [condição]. Assim você já resolve seu exame. Posso reservar?', botoes: ['Pode reservar', 'Falar com atendente', 'Não tenho interesse'] },
      { rotulo: 'Se for data', corpo: 'Sem problema! Qual dia fica melhor para você? Tenho também [outras opções de horário].', botoes: ['Manhã', 'Tarde', 'Outro dia'] },
      { rotulo: 'Se for preparo', corpo: 'O preparo é simples: te envio tudo por escrito e tiro qualquer dúvida por aqui.\n\n[preparo].', botoes: ['Entendi, agendar', 'Esclarecer dúvida', 'Não tenho interesse'] },
    ] },
  { n: 8, titulo: 'Última oferta', quando: 'Em negociação · D7', item: 'neg7', grupo: 'negociacao',
    corpo: '[Nome], seu orçamento [exame] vale até [data] e a agenda desta semana está fechando.\n\nAinda consigo te encaixar [dia] às [hora]. Posso confirmar?',
    botoes: ['Pode confirmar', 'Outro horário', 'Não tenho interesse'] },
  { n: 9, titulo: 'Na data combinada', quando: 'Retorno personalizado', item: 'retorno', grupo: 'retorno',
    corpo: 'Oi, [Nome]! Como combinamos, estou passando hoje para retomar [seu orçamento de exames ou consultas].\n\nTenho [dia] às [hora] ou [dia] às [hora]. Qual fica melhor?',
    botoes: ['1º horário', '2º horário', 'Outro horário'] },
  { n: 10, titulo: 'No show', quando: 'Agendado', item: 'agendado', grupo: 'agendado',
    corpo: 'Olá, [Nome]! Aqui é da Clinex.\n\nNotamos que você não compareceu ao [exame] agendado para [data]. Sem problemas! Se quiser, podemos combinar uma nova data que funcione melhor para você.',
    botoes: ['Reagendar', 'Esclarecer dúvida', 'Não tenho interesse'] },
  { n: 11, titulo: 'Reativação', quando: '30 a 60 dias após o descarte', item: 'reativacao', grupo: 'reativacao',
    corpo: 'Oi, [Nome]! Aqui é da Clinex.\n\nAinda precisa fazer o [exame]? Neste mês temos [condição da campanha].\n\nQuer que eu veja um horário para você?',
    botoes: ['Quero agendar', 'Saber mais', 'Agora não'] },
];

export const GRUPOS_MSG: { id: string; rotulo: string }[] = [
  { id: 'aberto', rotulo: 'Em aberto' }, { id: 'sem_retorno', rotulo: 'Sem retorno' }, { id: 'negociacao', rotulo: 'Em negociação' },
  { id: 'retorno', rotulo: 'Retorno personalizado' }, { id: 'agendado', rotulo: 'Agendado' }, { id: 'reativacao', rotulo: 'Reativação' },
];

export const DICAS_VENDA: { titulo: string; texto: string }[] = [
  { titulo: 'Chame pelo nome', texto: 'Sempre. Gera proximidade.' },
  { titulo: 'Ofereça 2 horários', texto: '"Terça 8h ou quarta 10h?" Nunca "quando você pode?"' },
  { titulo: 'Termine com uma pergunta', texto: 'Fácil de responder: sim, não ou um horário.' },
  { titulo: 'Responda em minutos', texto: 'Lead quente fecha rápido. Lead frio fecha com outra clínica.' },
  { titulo: 'Mostre o valor', texto: 'Qualidade, tudo no mesmo lugar e preço justo.' },
  { titulo: 'Use os botões', texto: 'O paciente responde com um toque e o descarte já sai com motivo.' },
];

export const REGRAS_OURO: { n: number; titulo: string; texto: string; aplicada: string }[] = [
  { n: 1, titulo: 'Já foi à recepção?', texto: 'Se sim: Convertido Orgânico. Não entrar em contato.', aplicada: 'Antes de registrar qualquer contato o sistema pergunta. Se o paciente já foi à recepção, o lead vira Convertido orgânico e nenhum contato é feito.' },
  { n: 2, titulo: 'Máx. 2 tentativas por dia', texto: 'Sempre entre 8h e 19h. Sem exceção.', aplicada: 'O sistema bloqueia o 3º contato do dia para o mesmo lead e qualquer contato fora das 8h às 19h. Não existe botão para furar a regra.' },
  { n: 3, titulo: 'Registre tudo no card', texto: 'Data, canal e resultado de cada tentativa.', aplicada: 'Cada tentativa vira uma linha na linha do tempo do lead, com data, hora, canal, mensagem usada e quem fez.' },
  { n: 4, titulo: 'Descarte sempre com motivo', texto: 'Preço, outro lugar, desistiu, plano, sem retorno ou outro.', aplicada: 'Nenhum lead é descartado sem escolher um dos 6 motivos. O descarte automático do D8 em Sem retorno já sai com o motivo "Sem retorno".' },
];

export const PRIORIDADE_DO_DIA = ['No show', 'Leads novos de orçamento em aberto'];

// ------------------------------------------------------------------------------------------------ itens do guia (modais)

export type Saida = { rotulo: string; para: string; excecao?: boolean };
export type Item = {
  id: string;
  tipo: 'entrada' | 'aberto' | 'sem_retorno' | 'negociacao' | 'agendado' | 'ativo' | 'retorno' | 'descarte' | 'reativacao' | 'regra' | 'organico' | 'passo';
  num?: string;
  titulo: string;
  sub: string;
  selo?: string;
  resumo: string;
  dias?: string[];
  limite?: string;
  canais?: string[];
  fazer?: string[];
  msgs?: number[];
  saidas?: Saida[];
  regras?: number[];
  motivos?: string[];
  cadencia?: string[];
  pai?: string;
  extra?: { titulo: string; texto: string }[];
  /** itens do fluxo do No-show (modelo-noshow.ts); sem isto, o item é do fluxo de leads */
  fluxo?: 'noshow';
};

export const ITENS: Item[] = [
  { id: 'lead', tipo: 'entrada', titulo: 'Lead entra', sub: 'Início do caminho', dias: ['D0'],
    resumo: 'É onde tudo começa. O dia em que o lead entra é o D0, e todos os prazos do guia (D1, D2, D3, D7 e D8) contam a partir dele.',
    fazer: ['Cadastre o lead com nome, telefone, exame ou consulta de interesse e o valor do orçamento.', 'Antes de qualquer contato, confira se o paciente já foi à recepção.'],
    saidas: [{ rotulo: 'Entra em Em aberto', para: 'aberto' }], regras: [1] },
  { id: 'aberto', tipo: 'aberto', num: '1.', titulo: 'Em aberto', sub: '2º Leads novos de orçamento em aberto', selo: '1º NO SHOW', limite: '1 dia', dias: ['D1'],
    resumo: 'Primeira etapa do funil: os leads novos de orçamento em aberto. O limite nesta etapa é de 1 dia, então o primeiro contato acontece no D1.',
    fazer: ['Trate primeiro os no shows do dia, depois os leads novos de orçamento em aberto.', 'Faça o primeiro contato no D1, no 1º horário do dia.'],
    extra: [{ titulo: 'Prioridade do dia', texto: '1º No show · 2º Leads novos de orçamento em aberto.' }],
    saidas: [{ rotulo: 'Primeiro contato', para: 'primeiro' }], regras: [1, 2, 3] },
  { id: 'primeiro', tipo: 'aberto', num: '2.', titulo: 'Primeiro contato', sub: '1º horário do dia · ligação se acima de R$ 500', dias: ['D1'], canais: ['WhatsApp', 'Ligação'], msgs: [1], limite: 'Em aberto: 1 dia',
    resumo: 'O primeiro contato com o lead acontece no D1, no 1º horário do dia, pelo WhatsApp e pela ligação. A ligação é para orçamentos acima de R$ 500.',
    fazer: ['Contate no 1º horário do dia.', 'Envie a mensagem 1 pelo WhatsApp com os botões de resposta rápida.', 'Ligue se o orçamento for acima de R$ 500.', 'Registre data, canal e resultado no card.'],
    extra: [{ titulo: 'Depois do 1º contato', texto: 'Respondeu: o lead vai para Em negociação. Não respondeu: nova tentativa no D2 com a mensagem 2, e o lead segue para Sem retorno.' }],
    saidas: [{ rotulo: 'Respondeu', para: 'negociacao' }, { rotulo: 'Não respondeu', para: 'tentativa' }], regras: [1, 2, 3] },
  { id: 'negociacao', tipo: 'negociacao', num: '3.', titulo: 'Em negociação', sub: 'Respondeu, mas ainda não agendou', limite: '15 dias', msgs: [5, 6, 7, 8], dias: ['D0', 'D1', 'D3', 'D7', 'D8'],
    resumo: 'O lead respondeu, mas ainda não agendou. A cadência usa as mensagens 5 a 8, e o limite nesta etapa é de 15 dias.',
    cadencia: ['neg0', 'neg1', 'neg3', 'neg7', 'descarte'],
    extra: [{ titulo: 'No D8', texto: 'Sem resposta: descarte, sempre com motivo.' }],
    saidas: [{ rotulo: 'Agendou', para: 'agendado' }, { rotulo: 'Deu uma data', para: 'retorno', excecao: true }, { rotulo: 'Parou de responder', para: 'semretorno', excecao: true }, { rotulo: 'D8', para: 'descarte' }], regras: [1, 2, 3, 4] },
  { id: 'agendado', tipo: 'agendado', num: '4.', titulo: 'Agendado', sub: 'Confirmação automática', msgs: [10],
    resumo: 'O lead agendou. A confirmação é automática. No dia, o paciente compareceu e pagou (vira Convertido ativo) ou faltou (no show, que volta para Em negociação com a mensagem 10).',
    fazer: ['Confira o comparecimento no dia do agendamento.', 'Se compareceu e pagou: Convertido ativo.', 'Se faltou: no show, mensagem 10 e volta para Em negociação. É a 1ª prioridade do dia.'],
    saidas: [{ rotulo: 'Compareceu e pagou', para: 'ativo' }, { rotulo: 'No show · Msg 10', para: 'negociacao', excecao: true }], regras: [2, 3] },
  { id: 'ativo', tipo: 'ativo', titulo: 'Convertido ativo', sub: 'Compareceu e pagou', resumo: 'Fim do funil: o paciente compareceu e pagou.' },
  { id: 'retorno', tipo: 'retorno', titulo: 'Retorno personalizado', sub: 'Na data combinada · Msg 9', msgs: [9],
    resumo: 'Quando o lead dá uma data para retomar a conversa, o atendimento volta na data combinada com a mensagem 9, oferecendo dois horários.',
    fazer: ['Registre a data combinada no card.', 'Na data, envie a mensagem 9 com 2 horários.'],
    saidas: [{ rotulo: 'Na data', para: 'negociacao', excecao: true }], regras: [2, 3] },
  { id: 'tentativa', tipo: 'sem_retorno', titulo: 'Nova tentativa', sub: 'Sem retorno · D2', dias: ['D2'], canais: ['Ligação', 'WhatsApp'], msgs: [2], limite: 'Sem retorno: 10 dias',
    resumo: 'No D2, quem não respondeu ao primeiro contato recebe uma nova tentativa, em outro horário, por ligação e WhatsApp.',
    fazer: ['Tente em outro horário.', 'Ligação e WhatsApp.', 'Envie a mensagem 2.'],
    saidas: [{ rotulo: 'Respondeu', para: 'negociacao' }, { rotulo: 'Não respondeu', para: 'desconto' }], regras: [1, 2, 3] },
  { id: 'desconto', tipo: 'sem_retorno', titulo: 'Desconto', sub: 'Sem retorno · D3', dias: ['D3'], canais: ['WhatsApp'], msgs: [3], limite: 'Sem retorno: 10 dias',
    resumo: 'No D3, o lead sem retorno recebe uma condição especial de desconto de 10% ou 5%, conforme o orçamento, pagando via Pix.',
    fazer: ['Ofereça 10% ou 5% de desconto, conforme o orçamento.', 'Pagando via Pix, o orçamento fica com o desconto.', 'Envie a mensagem 3.'],
    saidas: [{ rotulo: 'Respondeu', para: 'negociacao' }, { rotulo: 'Não respondeu', para: 'semretorno' }], regras: [1, 2, 3] },
  { id: 'semretorno', tipo: 'sem_retorno', titulo: 'Sem retorno', sub: 'Encerramento · D7', dias: ['D7'], limite: '10 dias', msgs: [4],
    resumo: 'No D7, o lead que continua sem responder recebe o aviso de encerramento. No D8 ele é descartado, com o motivo "sem retorno".',
    fazer: ['Avise que vai encerrar o atendimento.', 'Deixe claro que, se ainda precisar, é só responder a mensagem para retomar.', 'Envie a mensagem 4.'],
    extra: [{ titulo: 'Como o lead chega aqui', texto: 'Não respondeu ao desconto (D3) ou parou de responder em Em negociação.' }],
    saidas: [{ rotulo: 'D8', para: 'descarte' }, { rotulo: 'Respondeu', para: 'negociacao' }], regras: [1, 2, 3, 4] },
  { id: 'descarte', tipo: 'descarte', titulo: 'Descarte', sub: 'Sempre com motivo', dias: ['D8'], motivos: ['Preço', 'Outro lugar', 'Desistiu', 'Plano', 'Sem retorno', 'Outro'],
    resumo: 'No D8 o lead é descartado, e o descarte sempre tem um motivo. Depois de 30 a 60 dias, ele pode ser reativado.',
    extra: [{ titulo: 'Vindo de Sem retorno', texto: 'Motivo: sem retorno.' }, { titulo: 'Vindo de Em negociação', texto: 'Sem resposta, com motivo.' }],
    saidas: [{ rotulo: 'Reativação · 30 a 60 dias depois', para: 'reativacao', excecao: true }], regras: [4] },
  { id: 'reativacao', tipo: 'reativacao', titulo: 'Reativação', sub: '30 a 60 dias depois · Msg 11', msgs: [11],
    resumo: 'Entre 30 e 60 dias depois do descarte, o lead recebe a mensagem 11 com a condição da campanha do mês.',
    fazer: ['Envie a mensagem 11 entre 30 e 60 dias depois do descarte.', 'Informe a condição da campanha do mês.'], regras: [1, 2, 3],
    saidas: [{ rotulo: 'Respondeu', para: 'negociacao', excecao: true }] },
  { id: 'antes', tipo: 'regra', titulo: 'Antes de cada contato', sub: 'O paciente já foi à recepção?',
    resumo: 'Toda vez, antes de entrar em contato, confira se o paciente já esteve na recepção. Se esteve, não entre em contato.',
    saidas: [{ rotulo: 'Sim', para: 'organico', excecao: true }], regras: [1] },
  { id: 'organico', tipo: 'organico', titulo: 'Convertido orgânico', sub: 'Não entrar em contato', resumo: 'O paciente já foi à recepção: a conversão aconteceu sem a ação do CRM. Não entre em contato.', regras: [1] },
  // passos da cadência de Em negociação (células do calendário)
  { id: 'neg0', tipo: 'passo', titulo: 'Orçamento', sub: '+ 2 opções de horário', dias: ['D0'], msgs: [5], pai: 'negociacao', limite: 'Em negociação: 15 dias',
    resumo: 'No D0 da negociação, envie o orçamento já com 2 opções de horário.', fazer: ['Envie o orçamento.', 'Ofereça 2 opções de horário.', 'Mensagem 5.'] },
  { id: 'neg1', tipo: 'passo', titulo: 'Follow-up', sub: 'viu o orçamento? oferecer horário', dias: ['D1'], msgs: [6], pai: 'negociacao', limite: 'Em negociação: 15 dias',
    resumo: 'No D1, pergunte se o lead viu o orçamento e ofereça um horário.', fazer: ['Pergunte se viu o orçamento.', 'Ofereça um horário livre.', 'Mensagem 6.'] },
  { id: 'neg3', tipo: 'passo', titulo: 'Tratar a objeção', sub: 'preço · data · plano · preparo', dias: ['D3'], msgs: [7], pai: 'negociacao', limite: 'Em negociação: 15 dias',
    resumo: 'No D3, descubra o que está pesando: preço, data, plano ou preparo, e responda conforme a objeção.', fazer: ['Comece pela pergunta (mensagem 7).', 'Conforme o paciente responder: preço, data ou preparo.', 'Use a resposta certa para cada objeção.'] },
  { id: 'neg7', tipo: 'passo', titulo: 'Última oferta', sub: 'validade + agenda', dias: ['D7'], msgs: [8], pai: 'negociacao', limite: 'Em negociação: 15 dias',
    resumo: 'No D7, a última oferta: informe a validade do orçamento e a agenda que está fechando.', fazer: ['Informe até quando vale o orçamento.', 'Mostre que a agenda está fechando e ofereça um horário.', 'Mensagem 8.'] },
];

// ------------------------------------------------------------------------------------------------ mapa do fluxo (página 1)

export type NoMapa = { id: string; x: number; y: number; w: number; h: number; estilo: string; titulo: string; sub?: string; selo?: string; pill?: string; clicavel?: boolean };
export type Aresta = { id: string; de: string; para: string; d: string; rotulo?: string; lx?: number; ly?: number; ancora?: 'start' | 'middle' | 'end'; excecao?: boolean };

export const MAPA = {
  w: 1230, h: 620,
  nos: [
    { id: 'lead', x: 20, y: 170, w: 100, h: 75, estilo: 'outline', titulo: 'LEAD ENTRA' },
    { id: 'aberto', x: 157, y: 133, w: 160, h: 147, estilo: 'dark', titulo: '1. EM ABERTO', selo: '1º NO SHOW', sub: '2º Leads novos de orçamento em aberto' },
    { id: 'primeiro', x: 367, y: 133, w: 160, h: 147, estilo: 'dark', titulo: '2. PRIMEIRO CONTATO', sub: '1º horário do dia\nligação se acima de R$ 500', pill: 'Msg 1' },
    { id: 'negociacao', x: 596, y: 133, w: 192, h: 147, estilo: 'hot', titulo: '3. EM NEGOCIAÇÃO', sub: 'Respondeu, mas\nainda não agendou', pill: 'Mensagens 5 a 8' },
    { id: 'agendado', x: 861, y: 133, w: 134, h: 147, estilo: 'deep', titulo: '4. AGENDADO', sub: 'Confirmação automática' },
    { id: 'ativo', x: 1071, y: 133, w: 138, h: 147, estilo: 'win', titulo: 'CONVERTIDO ATIVO', sub: 'Compareceu e pagou' },
    { id: 'retorno', x: 577, y: 14, w: 229, h: 74, estilo: 'soft', titulo: 'RETORNO PERSONALIZADO', sub: 'Na data combinada · Msg 9' },
    { id: 'tentativa', x: 367, y: 372, w: 160, h: 105, estilo: 'slate', titulo: 'NOVA TENTATIVA', sub: 'Sem retorno · D2', pill: 'Msg 2' },
    { id: 'desconto', x: 596, y: 372, w: 192, h: 105, estilo: 'slate', titulo: 'DESCONTO', sub: 'Sem retorno · D3\n10% ou 5%, conforme o orçamento', pill: 'Msg 3' },
    { id: 'semretorno', x: 861, y: 372, w: 146, h: 105, estilo: 'slate', titulo: 'SEM RETORNO', sub: 'Encerramento · D7', pill: 'Msg 4' },
    { id: 'descarte', x: 1071, y: 372, w: 138, h: 105, estilo: 'ghost', titulo: 'DESCARTE', sub: 'Sempre com motivo' },
    { id: 'antes', x: 20, y: 532, w: 265, h: 73, estilo: 'dashed', titulo: 'ANTES DE CADA CONTATO', sub: 'O paciente já foi à recepção?' },
    { id: 'organico', x: 344, y: 532, w: 211, h: 73, estilo: 'outline-red', titulo: 'CONVERTIDO ORGÂNICO', sub: 'Não entrar em contato' },
    { id: 'reativacao', x: 1071, y: 527, w: 138, h: 83, estilo: 'dashed', titulo: 'REATIVAÇÃO', sub: '30 a 60 dias depois\nMsg 11' },
  ] as NoMapa[],
  arestas: [
    { id: 'e1', de: 'lead', para: 'aberto', d: 'M120 207 H157' },
    { id: 'e2', de: 'aberto', para: 'primeiro', d: 'M317 207 H367' },
    { id: 'e3', de: 'primeiro', para: 'negociacao', d: 'M527 207 H596', rotulo: 'Respondeu', lx: 561, ly: 194, ancora: 'middle' },
    { id: 'e4', de: 'negociacao', para: 'agendado', d: 'M788 207 H861', rotulo: 'Agendou', lx: 825, ly: 194, ancora: 'middle' },
    { id: 'e5', de: 'agendado', para: 'ativo', d: 'M995 207 H1071', rotulo: 'Compareceu\ne pagou', lx: 1033, ly: 176, ancora: 'middle' },
    { id: 'e6', de: 'agendado', para: 'negociacao', d: 'M861 255 H788', rotulo: 'No show\nMsg 10', lx: 825, ly: 273, ancora: 'middle', excecao: true },
    { id: 'e7', de: 'negociacao', para: 'retorno', d: 'M660 133 V88', rotulo: 'Deu uma data', lx: 650, ly: 112, ancora: 'end', excecao: true },
    { id: 'e8', de: 'retorno', para: 'negociacao', d: 'M724 88 V133', rotulo: 'Na data', lx: 734, ly: 112, ancora: 'start', excecao: true },
    { id: 'e9', de: 'primeiro', para: 'tentativa', d: 'M447 280 V372', rotulo: 'Não\nrespondeu', lx: 437, ly: 322, ancora: 'end' },
    { id: 'e10', de: 'tentativa', para: 'negociacao', d: 'M480 372 V310 H628 V280', rotulo: 'Respondeu', lx: 556, ly: 326, ancora: 'middle' },
    { id: 'e11', de: 'desconto', para: 'negociacao', d: 'M692 372 V280', rotulo: 'Respondeu', lx: 702, ly: 356, ancora: 'start' },
    { id: 'e12', de: 'tentativa', para: 'desconto', d: 'M527 425 H596', rotulo: 'Não\nrespondeu', lx: 561, ly: 398, ancora: 'middle' },
    { id: 'e13', de: 'desconto', para: 'semretorno', d: 'M788 425 H861', rotulo: 'Não\nrespondeu', lx: 825, ly: 398, ancora: 'middle' },
    { id: 'e14', de: 'semretorno', para: 'descarte', d: 'M1007 425 H1071', rotulo: 'D8', lx: 1039, ly: 412, ancora: 'middle' },
    { id: 'e15', de: 'negociacao', para: 'descarte', d: 'M776 280 V292 H1140 V372', rotulo: 'D8', lx: 1056, ly: 286, ancora: 'middle' },
    { id: 'e16', de: 'negociacao', para: 'semretorno', d: 'M751 280 V328 H907 V372', rotulo: 'Parou de\nresponder', lx: 914, ly: 346, ancora: 'start', excecao: true },
    { id: 'e17', de: 'descarte', para: 'reativacao', d: 'M1140 477 V527', excecao: true },
    { id: 'e18', de: 'antes', para: 'organico', d: 'M285 568 H344', rotulo: 'Sim', lx: 314, ly: 556, ancora: 'middle', excecao: true },
  ] as Aresta[],
};

// ------------------------------------------------------------------------------------------------ calendário (página 2)

export type CelulaGrade = { id: string; sub?: string };
export const GRADE = {
  dias: ['D0', 'D1', 'D2', 'D3', 'D7', 'D8'],
  linhas: [
    { id: 'aberto', rotulo: 'EM ABERTO', limite: 'Limite: 1 dia', item: 'aberto', celulas: { D1: { id: 'primeiro' } } as Record<string, CelulaGrade>,
      depois: { de: 'D2', ate: 'D7', titulo: 'Depois do 1º contato', ramos: [
        { rotulo: 'Respondeu', destino: 'EM NEGOCIAÇÃO', item: 'negociacao' },
        { rotulo: 'Não respondeu', destino: 'SEM RETORNO', item: 'tentativa', nota: 'Nova tentativa no D2 · Msg 2' },
      ] } },
    { id: 'sem_retorno', rotulo: 'SEM RETORNO', limite: 'Limite: 10 dias', item: 'semretorno',
      celulas: { D2: { id: 'tentativa' }, D3: { id: 'desconto' }, D7: { id: 'semretorno' }, D8: { id: 'descarte', sub: 'motivo: sem retorno' } } as Record<string, CelulaGrade> },
    { id: 'negociacao', rotulo: 'EM NEGOCIAÇÃO', limite: 'Limite: 15 dias', item: 'negociacao',
      celulas: { D0: { id: 'neg0' }, D1: { id: 'neg1' }, D3: { id: 'neg3' }, D7: { id: 'neg7' }, D8: { id: 'descarte', sub: 'sem resposta, com motivo' } } as Record<string, CelulaGrade> },
  ],
};

export const GLOSSARIO = [
  { termo: 'D0', texto: 'Dia em que o lead entra.' },
  { termo: 'Msg', texto: 'Mensagem pronta (veja a aba Mensagens).' },
  { termo: 'Linha contínua', texto: 'Avanço no funil.' },
  { termo: 'Linha tracejada', texto: 'Voltou ou exceção.' },
];

/** Vai inteiro para o navegador. Os itens do No-show entram na mesma lista (ids "ns-"), então busca, modal e links funcionam igual. */
export const MODELO = {
  MOTIVOS_DESCARTE, LIMITES, PASSOS, MENSAGENS, GRUPOS_MSG, DICAS_VENDA, REGRAS_OURO, PRIORIDADE_DO_DIA, ITENS: [...ITENS, ...ITENS_NOSHOW], MAPA, GRADE, GLOSSARIO,
  NOSHOW: { MAPA: MAPA_NOSHOW, GRADE: GRADE_NOSHOW, REGRAS: REGRAS_NOSHOW },
};
