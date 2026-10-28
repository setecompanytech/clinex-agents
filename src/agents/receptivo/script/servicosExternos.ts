/**
 * Serviços EXTERNOS: a clínica atende, mas não são agendados pela Amanda (tomografia, ressonância, ecocardiograma...). No Clinilink eles existem como
 * "serviço externo", mas não aparecem na lista que a API entrega ao chatbot; por isso são reconhecidos também pelo NOME que o paciente escreve ou
 * que está no pedido médico. Quando o paciente pede um deles, a Amanda o encaminha para a linha de atendimento principal (a equipe atende) e NÃO retoma a conversa.
 *
 * Para acrescentar um serviço externo, inclua aqui uma palavra ou expressão (minúscula, sem acento; "tc" vale como palavra inteira).
 * Um exame que a clínica faz sozinha e que casa com o nome inteiro no catálogo (ex.: "Tempo de coagulação (TC)") nunca é tratado como externo.
 */
export const SERVICOS_EXTERNOS: string[] = [
  'tomografia', 'tomografo', 'tc', 'angiotomografia', 'ressonancia', 'rm', 'rnm', 'angioressonancia', 'ecocardiograma', 'eco cardio', 'ecodoppler',
  'cintilografia', 'pet ct', 'pet scan', 'colonoscopia', 'retossigmoidoscopia', 'densitometria', 'mamografia', 'arteriografia', 'angiografia',
];

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const REGEX = () => new RegExp(`\\b(?:${SERVICOS_EXTERNOS.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, ' ?')).join('|')})\\b`);

/** O nome (do pedido ou da mensagem do paciente) é de um serviço externo? */
export const ehServicoExterno = (nome: string): boolean => REGEX().test(norm(nome));
