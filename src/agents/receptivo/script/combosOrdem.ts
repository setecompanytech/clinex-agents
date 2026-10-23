/**
 * Ordem em que os serviços de cada combo são oferecidos ao paciente. Por padrão vale a ordem da lista de serviços do combo no Clinilink.
 * Para ajustar um combo, escreva aqui: a chave é o nome do combo em minúsculo e sem acento ("gastro 1"); o valor é uma lista de
 * pedaços dos nomes dos serviços, na ordem desejada (basta um pedaço que identifique o serviço). Serviço que não aparece na lista vai para o fim,
 * na ordem original. Combo que não está aqui segue a ordem do Clinilink.
 *
 * Exemplo: 'gastro 1': ['endoscopia', 'consulta gastro'],
 */
export const ORDEM_DOS_COMBOS: Record<string, string[]> = {};

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Os serviços do combo na ordem desejada (a do Clinilink, a não ser que o combo tenha uma ordem própria em `ORDEM_DOS_COMBOS`). */
export function ordenarItens<T extends { nome: string }>(nomeDoCombo: string, itens: T[]): T[] {
  const regra = ORDEM_DOS_COMBOS[norm(nomeDoCombo)];
  if (!regra?.length) return itens;
  const pos = (i: T) => { const k = regra.findIndex((f) => norm(i.nome).includes(norm(f))); return k < 0 ? regra.length : k; };
  return [...itens].sort((a, b) => pos(a) - pos(b));
}
