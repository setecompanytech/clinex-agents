import { env } from './env.js';
import { evt } from './log.js';

/**
 * Tratamento dos médicos na conversa: "a Dra. Fernanda", "o Dr. Armando".
 * O Clinilink não informa o gênero, então ele é deduzido do primeiro nome: lista de nomes brasileiros comuns, depois a
 * terminação, e só nos nomes que ficarem em dúvida um modelo responde (o resultado fica guardado). Se ainda houver dúvida,
 * a Amanda usa só o nome, sem artigo e sem título: nunca chuta o gênero de ninguém.
 */
export type Genero = 'F' | 'M';

const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const FEMININOS = new Set(('maria ana francisca antonia adriana juliana marcia fernanda patricia aline sandra camila amanda bruna jessica leticia julia luciana vanessa mariana gabriela rafaela beatriz larissa carolina daniela renata simone viviane tatiane tatiana priscila fabiana cristiane cristina claudia sonia silvia rosana rosangela raimunda joana lucia luzia helena isabel isabela isabella laura luana luiza luisa manuela natalia paula paloma raquel rebeca rebecca regina roberta sabrina samara sara sarah talita thais tais valentina valeria vera vitoria yasmin yara zilda zuleide adalgisa liduina maiana taissa emanuelly emanuele emanuelle ebenezaide giovanna giovana giulia geovana geisa gisele graciele ingrid iris irene ivone jaqueline janaina jane jeane joyce kelly keila kamila karina karen katia lais lara leila lena lidia livia lorena lourdes lucilene luciene magda marta michele milena mirian miriam monica nadia nayara neusa nilza noemi odete olivia pamela poliana rita rosa rosilene rute sheila silene solange suelen tamires telma tereza teresa vilma viviana wanda ester ruth raphaela rafaella michelle nicole stephanie stefany stefanie evelyn eveline elisa elaine eliane elisangela edna eunice fatima flavia francine gleice glaucia heloisa heloise ines jacira jandira jessyca juliete kauane lavinia leidiane leonor lilian lillian lorraine luma mayara mayra melissa mirella nara nina pietra rosane roseli sueli suzana susana tania thaina thaisa valdete valquiria veronica yanka zelia').split(/\s+/));
const MASCULINOS = new Set(('jose joao antonio francisco carlos paulo pedro lucas luiz luis marcos luan gabriel rafael daniel marcelo bruno eduardo felipe filipe rodrigo manoel manuel ricardo fernando roberto fabio fabricio leonardo gustavo guilherme henrique diego thiago tiago vinicius vitor victor andre alexandre alan alex alberto armando arthur artur augusto benedito caio cesar claudio cleber davi david denis douglas edson edgar elias emerson enzo ernesto fabiano flavio geraldo gilberto giovanni giovanny helio heitor hugo igor ivan jair jeferson jonas jorge julio kleber leandro leonel lourenco luciano mario mateus matheus mauricio miguel murilo natan nelson nicolas norberto osvaldo otavio patrick raul reinaldo renan renato rogerio ronaldo sergio silvio tadeu valdir valter wagner walter wellington wesley wilson yago luca joshua noah jean jhonatan jonathan gael samuel ismael israel abel adao adriano agnaldo aldo amilton anderson anselmo ary breno cassio celso cleiton cristiano dante deivid dimas dionisio edivaldo edmilson elton emanuel emmanuel erick erik evandro fausto felix fred gerson gilson glauco guto haroldo heber humberto iago ivo jackson jadson jefferson joel josue juliano kaique kaue lauro lazaro levi lucio marlon moises nilton olavo orlando pablo rian ruan rubens rui salvador saulo sebastiao severino tales tarcisio ulisses valmir vando vicente walmir washington willian william xavier yuri zeca').split(/\s+/));
/** Terminações que, mesmo fora da lista, indicam feminino ("Emanuelly", "Ebenezaide", "Liduina"). */
const FIM_FEMININO = /(elly|ely|aide|ine|ice|ete|ana|ena|ina|ila|ela|ara|ora|iza|isa|ssa|ia|ya|a)$/;
const SEGUNDO_NOME = new Set('clara paula carolina luiza luisa julia beatriz eduarda fernanda victor vitor pedro paulo carlos henrique augusto antonio miguel lucas gabriel guilherme alberto francisco roberto claudia cristina helena lucia aparecida gabrielle manuela rita cecilia isabel luiz'.split(' '));
const PRIMEIRO_COMPOSTO = new Set('ana maria joao jose luiz luis'.split(' '));

const cache = new Map<string, Genero | null>();
let semModeloAte = 0; // depois de uma falha do modelo, não tenta de novo até esse instante

const primeiroToken = (nome: string) => sem(nome).split(/\s+/)[0] ?? '';

/**
 * Gênero pelo primeiro nome, sem chamar ninguém. undefined = não sei.
 * Nome que está nas listas vale direto. Nome fora das listas: se um modelo já respondeu (e ficou guardado), vale a resposta dele
 * (inclusive "não sei"); senão, só a terminação, que é um palpite razoável.
 */
export function generoSync(nomeCompleto: string): Genero | undefined {
  const p = primeiroToken(nomeCompleto);
  if (!p) return undefined;
  if (FEMININOS.has(p)) return 'F';
  if (MASCULINOS.has(p)) return 'M';
  const c = cache.get(p);
  if (c !== undefined) return c ?? undefined;
  if (/o$/.test(p) || /(os|or|ao)$/.test(p)) return 'M';
  if (FIM_FEMININO.test(p) && p.length >= 4) return 'F';
  return undefined;
}

/** O nome está nas listas de nomes conhecidos? Se não está, a terminação é só um palpite e vale confirmar. */
const conhecido = (p: string) => FEMININOS.has(p) || MASCULINOS.has(p);

/**
 * Confirma, uma vez por nome, os que NÃO estão nas listas (o resultado fica guardado): o modelo diz mulher, homem ou "não sei", e o
 * "não sei" deixa a pessoa sem título em vez de chutar. Sem chave ou com falha: fica o palpite pela terminação.
 */
export async function prepararGeneros(nomes: (string | undefined)[]): Promise<void> {
  const duvidosos = [...new Set(nomes.filter((n): n is string => Boolean(n)).map(primeiroToken).filter((p) => p && !conhecido(p) && !cache.has(p)))].slice(0, 12);
  if (duvidosos.length === 0 || !env.openaiKey || Date.now() < semModeloAte) return;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.openaiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: env.openaiModel, temperature: 0, max_tokens: 200, response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: `Para cada primeiro nome brasileiro abaixo, responda se é nome de mulher ("F") ou de homem ("M"). Se não tiver certeza, use null. Responda SOMENTE um JSON {"nome": "F"|"M"|null}.\nNomes: ${duvidosos.join(', ')}` }],
      }),
      signal: AbortSignal.timeout(6000),
    });
    const body: any = await res.json().catch(() => null);
    const conteudo = body?.choices?.[0]?.message?.content;
    if (!res.ok || typeof conteudo !== 'string') throw new Error(`resposta inválida (${res.status})`);
    const bruto = JSON.parse(conteudo) as Record<string, unknown>;
    const j = new Map(Object.entries(bruto).map(([k, v]) => [sem(k), v])); // a chave pode voltar com maiúscula ou acento
    for (const p of duvidosos) { const v = j.get(p); cache.set(p, v === 'F' || v === 'M' ? v : null); }
    evt('genero', { resolvidos: duvidosos.length });
  } catch (e) {
    // falhou: segue pelo palpite da terminação e não insiste por 1 minuto (não atrasa a conversa)
    semModeloAte = Date.now() + 60_000;
    evt('genero_falhou', { motivo: (e as Error).message });
  }
}

/** "Fernanda" (ou "Ana Clara" quando o nome é composto). */
export function nomeCurto(nomeCompleto: string): string {
  const w = nomeCompleto.trim().split(/\s+/);
  const cap = (x: string) => x.charAt(0).toLocaleUpperCase('pt-BR') + x.slice(1).toLocaleLowerCase('pt-BR');
  if (w.length > 1 && PRIMEIRO_COMPOSTO.has(sem(w[0])) && SEGUNDO_NOME.has(sem(w[1]))) return `${cap(w[0])} ${cap(w[1])}`;
  return cap(w[0] ?? '');
}

/** "a Dra. Fernanda" / "o Dr. Armando" (com artigo) ou "Dra. Fernanda" / "Dr. Armando". Gênero incerto: só o nome, sem artigo e sem título. */
export function exibir(nomeCompleto: string, opts: { artigo?: boolean; curto?: string } = {}): string {
  const curto = opts.curto ?? nomeCurto(nomeCompleto);
  const g = generoSync(nomeCompleto);
  if (g === 'F') return `${opts.artigo ? 'a ' : ''}Dra. ${curto}`;
  if (g === 'M') return `${opts.artigo ? 'o ' : ''}Dr. ${curto}`;
  return curto;
}

/** Vários nomes de uma vez: se dois têm o mesmo primeiro nome, usa o nome completo desses dois para ninguém se confundir. */
export function exibirLista(nomes: string[], opts: { artigo?: boolean } = {}): string[] {
  const curtos = nomes.map(nomeCurto);
  const repetido = (c: string) => curtos.filter((x) => x === c).length > 1;
  return nomes.map((n, i) => exibir(n, { ...opts, curto: repetido(curtos[i]) ? n.trim().split(/\s+/).slice(0, 2).join(' ') : curtos[i] }));
}

/** Para o log e testes: esquece o que foi guardado. */
export const _limparCacheGenero = () => cache.clear();
