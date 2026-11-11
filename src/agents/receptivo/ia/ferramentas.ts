/**
 * Amanda IA: as FERRAMENTAS que o modelo usa. O modelo conduz a conversa; as regras da clínica ficam aqui, em código, e ele não tem como
 * desobedecer: só existe horário que veio do Clinilink (por id), exame só de manhã (a fonte já filtra), nada de horário que já passou,
 * cadastro só com nome, nascimento e sexo (CPF opcional), agendamento só de horário oferecido e conferido de novo na hora de gravar.
 */
import type { Comprovante } from '../../../lib/comprovante.js';
import type { PedidoLido } from '../../../lib/pedidoMedico.js';
import { exibir, exibirLista, prepararGeneros } from '../../../lib/genero.js';
import { escolherExames } from '../../../lib/interpretarExames.js';
import { env } from '../../../lib/env.js';
import { evt } from '../../../lib/log.js';
import type { Descoberta, Fonte, ItemExame, Servico, Slot, Unidade } from '../script/catalog.js';
import { cpfValido, mensagemConfirmacao, soTelefone } from '../script/engine.js';

export type SlotGuardado = { servicoId: string; unidade: string; slot: Slot };
export type MemoriaIA = {
  v: 1;
  servicos: Record<string, Servico>;
  slots: Record<string, SlotGuardado>;
  proxSlot: number;
  paciente?: { id?: string; nome: string; nascimento?: string };
  orcamento?: { itens: ItemExame[] };
  agendados: { servicoId: string; ymd: string; resumo: string }[];
  /** combos em andamento: o serviço de cada etapa (para agendar uma de cada vez) */
  etapas?: Record<string, { combo: string; etapa: number; rotulo: string }>;
  ate?: string;
  transferiu?: boolean; // a IA passou a conversa para a equipe
  pix?: { valor?: number; transacao?: string; em: string }; // comprovante de pix conferido (só com ele o agendamento pago por pix é gravado)
  combosVistos?: string[];
  combosOferecidos?: { combo: string; total: string; economia: string }[]; // combos já citados (o valor deles é dado real) // serviços cujos combos já foram consultados (a sugestão é feita uma vez só)
};
export const memoriaNova = (): MemoriaIA => ({ v: 1, servicos: {}, slots: {}, proxSlot: 1, agendados: [] });

export type Contexto = {
  fonte: Fonte;
  mem: MemoriaIA;
  telefone: string; // WhatsApp do paciente
  agora: Date;
  lerComprovante?: () => Promise<Comprovante | null>; // a última imagem da conversa, lida como comprovante
  ultimaDoPaciente?: string; // a última mensagem do paciente (sem acento, minúscula)
  pedidoOrcamento?: boolean; // o paciente pediu ORÇAMENTO: regra da clínica, vai para o atendimento principal (a IA não monta)
  lerPedidos?: () => Promise<(PedidoLido | null)[]>; // TODAS as imagens recentes do paciente, cada uma lida como pedido médico (álbum de fotos)
  /** preenchidos pelas ferramentas: o que o código faz depois da resposta */
  saida: { confirmacoes: string[]; handoff?: { motivo: string; urgente?: boolean }; encerrar?: boolean; usadas: string[]; dados?: string[] /* resultados das ferramentas nesta resposta */ };
};

// ------------------------------------------------------------------------------------------------ datas
const tz = () => env.timezone;
const ymdDe = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const hmDe = (d: Date) => new Intl.DateTimeFormat('pt-BR', { timeZone: tz(), hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
const somaDias = (ymd: string, n: number) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export function dataFalada(ymd: string, hoje: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  const base = `${SEMANA[d.getUTCDay()]}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
  return ymd === hoje ? `hoje (${base})` : ymd === somaDias(hoje, 1) ? `amanhã (${base})` : base;
}
const horaFalada = (hm: string) => { const [h, m] = hm.slice(0, 5).split(':'); return m === '00' ? `${Number(h)}h` : `${Number(h)}h${m}`; };
const reais = (v: number) => `R$ ${v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Data de nascimento no formato do Clinilink (AAAA-MM-DD). Aceita 08/07/1999, 8/7/1999, 08-07-1999, 08.07.99 e 1999-07-08.
 * Caso real: a IA mandava "08/07/1999" e o Clinilink recusava o cadastro (DATA_INVALIDA); a busca por nome + nascimento nunca achava ninguém.
 */
export function isoNascimento(v: unknown): string | undefined {
  const t = String(v ?? '').trim();
  let d: number, m: number, a: number;
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const br = t.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/);
  if (iso) { a = +iso[1]; m = +iso[2]; d = +iso[3]; }
  else if (br) { d = +br[1]; m = +br[2]; a = +br[3]; if (br[3].length === 2) a += a > (new Date().getFullYear() % 100) ? 1900 : 2000; }
  else return undefined;
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return undefined;
  if (a < 1900 || dt.getTime() > Date.now()) return undefined;
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Horário que já passou (ou cujo período já está no fim) nunca é oferecido nem agendado. */
function jaPassou(sl: Slot, agora: Date): boolean {
  const hoje = ymdDe(agora);
  if (sl.ymd < hoje) return true;
  if (sl.ymd > hoje) return false;
  const hm = hmDe(agora);
  if (sl.turno === 'manhã' && hm >= '11:00') return true;
  if (hm >= '17:00') return true;
  // atendimento por ordem de chegada: o período já começou há mais de 1 h, não oferece
  const [h, m] = sl.inicio.split(':').map(Number);
  const [ha, ma] = hm.split(':').map(Number);
  return ha * 60 + ma > h * 60 + m + 60;
}

// ------------------------------------------------------------------------------------------------ como o modelo vê um serviço
/** Profissional de TESTE cadastrado no Clinilink ("... (teste Sistema Não Agenda)"): nunca aparece nem é agendado. */
const ehTeste = (n?: string) => /\bteste\b|n[aã]o agenda/i.test(n ?? '');
function nomesMedicos(nomes: string[]): string[] { return exibirLista(nomes.filter((n) => n && !ehTeste(n))); }

async function resumoServico(sv: Servico, c: Contexto) {
  c.mem.servicos[sv.id] = sv;
  await prepararGeneros(sv.unidades.flatMap((u) => [...(u.profissionais ?? []), ...(u.porServico ?? []).flatMap((x) => x.profissionais)]));
  return {
    servico_id: sv.id,
    nome: sv.frase,
    tipo: sv.tipo,
    profissional_escolhido: sv.profissional ? exibir(sv.profissional.nome) : undefined,
    preco: sv.precoTexto || 'sem valor cadastrado (não informe valor; a equipe confirma)',
    unidades: sv.unidades.map((u) => ({
      unidade: u.nome,
      profissionais: nomesMedicos(u.profissionais ?? []),
      ...(u.porServico?.length ? { quem_faz_cada_servico: u.porServico.map((x) => ({ servico: x.nome, profissionais: nomesMedicos(x.profissionais) })) } : {}),
      ...(u.precoPix && sv.combo ? { valor_nesta_unidade: reais(u.precoPix) } : {}),
    })),
    ...(sv.detalhe ? { detalhe: sv.detalhe } : {}),
    ...(sv.preparo ? { preparo: sv.preparo } : {}),
    ...(sv.pacote ? { combo: { etapas: sv.pacote.etapas.map((ids, i) => ({ etapa: i + 1, itens: ids.map((id) => sv.pacote!.itens.find((x) => x.id === id)?.nome).filter(Boolean) })), observacao: 'Combo: NÃO tem unidades nem profissionais próprios aqui. NUNCA cite médico ou unidade do combo antes de chamar etapa_do_combo (cada etapa devolve as unidades e os profissionais reais dela). Para agendar, chame etapa_do_combo(etapa 1), mostre as unidades/profissionais que ela devolver e siga etapa por etapa.' } } : {}),
    ...(sv.unidades.length === 0 && !sv.pacote ? { aviso: 'sem unidade com agenda aberta' } : {}),
  };
}

async function descobertaParaModelo(d: Descoberta, c: Contexto): Promise<unknown> {
  if (!d) return { resultado: 'nao_encontrado', orientacao: 'Não achei esse serviço no catálogo. Pergunte ao paciente como está escrito no pedido médico ou ofereça passar para a equipe. Nunca diga que a clínica não faz.' };
  if ('servico' in d) return { resultado: 'servico', ...(await resumoServico(d.servico, c)) };
  if ('opcoes' in d) return { resultado: 'varias_opcoes', opcoes: d.opcoes.map((o) => ({ servico_id: o.id, nome: o.nome })), orientacao: 'Pergunte ao paciente qual delas (liste em linhas curtas). Depois use abrir_servico com o servico_id escolhido.' };
  if ('semAgenda' in d) return { resultado: 'sem_agenda', servico: d.semAgenda, orientacao: 'Existe, mas sem vaga aberta agora. Ofereça passar para a equipe verificar.' };
  if ('naoAchouServico' in d) return { resultado: 'nao_encontrado', pedido: d.naoAchouServico, orientacao: 'Não está disponível para agendamento por aqui. Ofereça passar para a equipe.' };
  if ('naoAchouProfissional' in d) return { resultado: 'profissional_nao_encontrado', nome: d.naoAchouProfissional };
  if ('semAgendaProfissional' in d) return { resultado: 'profissional_sem_agenda', nome: d.semAgendaProfissional.nome, alternativa: d.semAgendaProfissional.alternativa ? await resumoServico(d.semAgendaProfissional.alternativa, c) : undefined };
  if ('servicoExterno' in d) return { resultado: 'servico_externo', servico: d.servicoExterno, orientacao: 'Esse serviço é com a equipe (não é agendado por aqui). Use transferir_para_humano.' };
  if ('pedirPedido' in d) return { resultado: 'exames_de_laboratorio', orientacao: 'Pergunte quais exames (pode mandar a foto do pedido médico ou escrever os nomes). Se a pessoa não souber, use sugerir_exames.' };
  return { resultado: 'nao_encontrado' };
}

/**
 * O serviço aberto faz parte de algum combo que sai mais em conta? Anexa ao resultado (uma vez por serviço, no máximo 6 s de espera)
 * para a Amanda citar o combo logo depois do valor. Caso real: o paciente pediu a consulta e só soube do combo porque perguntou.
 */
async function comCombos(r: any, c: Contexto): Promise<unknown> {
  if (r?.resultado !== 'servico' || r.combo || !c.fonte.combosComServico) return r;
  const sv = c.mem.servicos[r.servico_id];
  if (!sv || sv.pacote || sv.combo) return r;
  const vistos = (c.mem.combosVistos ??= []);
  if (vistos.includes(sv.id)) return r;
  vistos.push(sv.id);
  const cs = await Promise.race([c.fonte.combosComServico(sv).catch(() => []), new Promise<[]>((ok) => setTimeout(() => ok([]), 6000))]);
  if (!cs.length) return r;
  (c.mem.combosOferecidos ??= []).push(...cs.slice(0, 2).map((x) => ({ combo: x.rotulo, total: reais(x.total), economia: reais(x.economia) })));
  return {
    ...r,
    combos_que_incluem_este_servico: cs.slice(0, 2).map((x) => ({ servico_id: `combo:${x.id}`, combo: x.rotulo, total: reais(x.total), economia: reais(x.economia), inclui: x.texto })),
    orientacao_combo: 'Cite o combo UMA vez, numa linha curta logo depois do valor (nome, o que inclui de forma resumida, valor e economia em negrito), sem insistir, e termine com a pergunta normal da unidade. Se o paciente quiser o combo, abra com abrir_servico(servico_id do combo); se recusar, siga só com o serviço.',
  };
}

/** Despedida ou "não preciso de mais nada" (o atendimento só é finalizado com isso). */
export const DESPEDIDA = /\b(so isso|era (so )?isso|e (so )?isso|mais nada|nada mais|nao (preciso|precisa|quero) (de )?mais|tchau|ate (mais|logo|amanha|breve)|valeu|obrigad[oa]|brigad[oa]|agradec\w*|grat[oa]|tenha um bom|bom dia pra voce|flw|falou)\b/;

const acharServico = async (id: string, c: Contexto): Promise<Servico | undefined> => {
  if (c.mem.servicos[id]) return c.mem.servicos[id];
  const d = await c.fonte.resolver(id).catch(() => undefined);
  if (d && 'servico' in d) { c.mem.servicos[id] = d.servico; return d.servico; }
  return undefined;
};
const acharUnidade = (sv: Servico, nome?: string): Unidade | undefined => {
  if (!nome) return sv.unidades.length === 1 ? sv.unidades[0] : undefined;
  const n = norm(nome).replace(/^(unidade|clinex)\s+/, '');
  return sv.unidades.find((u) => norm(u.nome) === n) ?? sv.unidades.find((u) => norm(u.nome).includes(n) || n.includes(norm(u.nome)));
};

// ------------------------------------------------------------------------------------------------ definições (JSON schema)
type Def = { name: string; description: string; parameters: Record<string, unknown> };
const obj = (props: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties: props, required, additionalProperties: false });
const str = (description: string) => ({ type: 'string', description });

export const DEFINICOES: Def[] = [
  { name: 'buscar_servico', description: 'Procura no Clinilink um serviço (consulta, exame, especialidade, combo) ou um profissional pelo nome. Use o que o paciente pediu, de forma limpa (ex.: "ultrassom obstétrica", "consulta ginecologia", "dra camila", "combo feminino", "ultrassom"). Devolve o serviço com unidades, profissionais e preço, ou opções para o paciente escolher.', parameters: obj({ pedido: str('o serviço ou profissional pedido') }, ['pedido']) },
  { name: 'abrir_servico', description: 'Abre um serviço pelo servico_id (de uma lista de opções devolvida antes).', parameters: obj({ servico_id: str('servico_id') }, ['servico_id']) },
  { name: 'servico_com_profissional', description: 'Quando o paciente escolhe um profissional de um serviço já aberto: devolve o mesmo serviço só com a agenda dele.', parameters: obj({ servico_id: str('servico_id'), profissional: str('nome do profissional como aparece na lista') }, ['servico_id', 'profissional']) },
  { name: 'ver_horarios', description: 'Horários com vaga de um serviço numa unidade. Cada horário vem com horario_id. O atendimento é por ordem de chegada: o horário é a hora em que o atendimento começa naquele período. Sem data: os próximos dias. Com data: só aquele dia.', parameters: obj({ servico_id: str('servico_id'), unidade: str('nome da unidade'), data: str('AAAA-MM-DD (opcional)'), a_partir_de: str('AAAA-MM-DD (opcional)'), turno: { type: 'string', enum: ['manhã', 'tarde'], description: 'opcional' }, profissional: str('opcional: só os horários deste profissional') }, ['servico_id', 'unidade']) },
  { name: 'buscar_paciente', description: 'Procura o cadastro do paciente: pelo CPF (se ele mandou) ou por nome completo + data de nascimento (procura pelo telefone desta conversa). Só mostre ao paciente o NOME encontrado, nunca outros dados.', parameters: obj({ cpf: str('11 dígitos (opcional)'), nome_completo: str('opcional'), nascimento: str('DD/MM/AAAA (opcional)') }) },
  { name: 'agendar', description: 'Grava o agendamento de um horario_id oferecido. Paciente já encontrado: só confirme que é ele. Paciente novo: precisa de nome completo, data de nascimento e sexo (CPF é opcional). O telefone de contato do paciente é obrigatório: peça (para o próprio paciente, ofereça este WhatsApp; para outra pessoa, o telefone dela). Só chame depois de o paciente confirmar o horário E dizer como vai pagar (na recepção ou pix). Pix: só depois de conferir_comprovante confirmar o comprovante.', parameters: obj({ horario_id: str('horario_id escolhido'), nome_completo: str('nome completo do paciente'), nascimento: str('DD/MM/AAAA'), sexo: { type: 'string', enum: ['feminino', 'masculino'] }, cpf: str('opcional'), telefone: str('telefone de contato do PACIENTE, com DDD, que ele informou ou confirmou na conversa (se disse que pode ser este WhatsApp, use o número do WhatsApp desta conversa)'), pagamento: { type: 'string', enum: ['recepcao', 'pix'], description: 'como o PACIENTE disse que vai pagar (pergunte antes; nunca presuma)' } }, ['horario_id', 'nome_completo', 'nascimento', 'telefone', 'pagamento']) },
  { name: 'orcar_exames', description: 'Monta o orçamento de exames (de laboratório ou outros) a partir dos nomes que o paciente escreveu ou que vieram do pedido médico. Devolve cada exame com o valor por unidade.', parameters: obj({ exames: { type: 'array', items: { type: 'string' }, description: 'nomes dos exames' } }, ['exames']) },
  { name: 'ler_pedido_medico', description: 'Lê a última foto que o paciente mandou como pedido médico e devolve os exames escritos nela.', parameters: obj({}) },
  { name: 'agendar_coleta', description: 'Depois do orçamento de exames, prepara o agendamento da coleta de todos os exames do orçamento juntos (devolve um servico_id para ver_horarios).', parameters: obj({}) },
  { name: 'sugerir_exames', description: 'Os exames de laboratório mais procurados e os combos de exames, para quem não sabe quais fazer.', parameters: obj({}) },
  { name: 'combos_do_servico', description: 'Combos que incluem o serviço e saem mais em conta. Só ofereça se fizer sentido, sem empurrar.', parameters: obj({ servico_id: str('servico_id') }, ['servico_id']) },
  { name: 'etapa_do_combo', description: 'Prepara uma etapa de um combo escolhido para agendar (devolve um servico_id para ver_horarios). Agende uma etapa de cada vez.', parameters: obj({ servico_id: str('servico_id do combo'), etapa: { type: 'integer', description: 'número da etapa (1, 2, ...)' } }, ['servico_id', 'etapa']) },
  { name: 'conferir_comprovante', description: 'Confere a última imagem enviada como comprovante de pix (valor e recebedor).', parameters: obj({}) },
  { name: 'transferir_para_humano', description: 'Passa a conversa para a equipe. Use para: resultado de exame, remarcar, cancelar, documentos, reclamação, convênio, serviço externo, pedido de falar com atendente, urgência, ou quando você não conseguir resolver. Escreva antes, na sua resposta, uma frase curta avisando o paciente.', parameters: obj({ motivo: str('resumo para a equipe: quem é, o que quer, o que já foi feito'), urgente: { type: 'boolean' } }, ['motivo']) },
  { name: 'encerrar_atendimento', description: 'SÓ quando o paciente se despedir ou disser que não precisa de mais nada ("só isso", "obrigado, tchau"). Nunca por conta própria, nunca logo depois de um agendamento sem o paciente se despedir. Encerra e finaliza o atendimento (escreva a despedida na resposta).', parameters: obj({}) },
];

// ------------------------------------------------------------------------------------------------ execução
export async function executar(nome: string, args: any, c: Contexto): Promise<unknown> {
  c.saida.usadas.push(nome);
  const f = c.fonte;
  const hoje = ymdDe(c.agora);
  try {
    switch (nome) {
      case 'buscar_servico': {
        const t = norm(String(args.pedido ?? ''));
        if (!t) return { erro: 'pedido vazio' };
        return comCombos(await descobertaParaModelo(await f.descobrir(t, true), c), c);
      }
      case 'abrir_servico': {
        const d = await f.resolver(String(args.servico_id));
        return comCombos(await descobertaParaModelo(d, c), c);
      }
      case 'servico_com_profissional': {
        const sv = await acharServico(String(args.servico_id), c);
        if (!sv) return { erro: 'servico_id desconhecido: use buscar_servico' };
        const nomes = [...new Set(sv.unidades.flatMap((u) => u.profissionais ?? []))];
        const alvo = norm(String(args.profissional).replace(/^(dra?\.?|doutora?)\s+/i, ''));
        const real = nomes.find((n) => norm(n) === alvo) ?? nomes.find((n) => norm(n).includes(alvo) || norm(exibir(n)).includes(alvo));
        if (!real) return { erro: 'esse profissional não atende este serviço', profissionais_do_servico: nomesMedicos(nomes) };
        const com = await f.comProfissional?.(sv, real);
        if (!com) return { erro: 'não consegui abrir a agenda desse profissional' };
        return { resultado: 'servico', ...(await resumoServico(com, c)) };
      }
      case 'ver_horarios': {
        const sv = await acharServico(String(args.servico_id), c);
        if (!sv) return { erro: 'servico_id desconhecido: use buscar_servico' };
        const un = acharUnidade(sv, args.unidade);
        if (!un) return { erro: 'unidade sem agenda para este serviço', unidades_com_agenda: sv.unidades.map((u) => u.nome) };
        const de = args.data ? String(args.data) : args.a_partir_de && String(args.a_partir_de) > hoje ? String(args.a_partir_de) : hoje;
        const ate = args.data ? String(args.data) : somaDias(de, 21);
        let lista = f.horariosPorProfissional ? await f.horariosPorProfissional(sv, un, de, ate) : await f.proximas(sv, un, de, 12);
        lista = lista.filter((s) => !jaPassou(s, c.agora) && !ehTeste(s.profissionalBruto) && !ehTeste(s.profissional));
        if (args.turno) lista = lista.filter((s) => s.turno === args.turno);
        if (args.profissional) { const p = norm(String(args.profissional).replace(/^(dra?\.?|doutora?)\s+/i, '')); lista = lista.filter((s) => s.profissional && (norm(s.profissional).includes(p) || norm(exibir(s.profissional)).includes(p))); }
        const total = lista.length;
        lista = lista.slice(0, 6);
        await prepararGeneros(lista.map((s) => s.profissional));
        if (lista.length === 0) return { horarios: [], orientacao: args.data ? 'Sem vaga nesse dia. Ofereça os próximos dias (chame ver_horarios sem data).' : 'Sem vaga nos próximos 21 dias nesta unidade. Ofereça outra unidade ou passar para a equipe.' };
        return {
          servico: sv.frase, unidade: un.nome, total_encontrado: total,
          horarios: lista.map((s) => {
            const id = `H${c.mem.proxSlot++}`;
            c.mem.slots[id] = { servicoId: sv.id, unidade: un.nome, slot: s };
            return { horario_id: id, dia: dataFalada(s.ymd, hoje), data: s.ymd, periodo: s.turno, a_partir_das: horaFalada(s.inicio), profissional: s.profissional ? exibir(s.profissional) : undefined };
          }),
          lembrete: 'Atendimento por ordem de chegada: diga "a partir das Xh". Não invente horários fora desta lista.',
        };
      }
      case 'buscar_paciente': {
        const cpf = String(args.cpf ?? '').replace(/\D/g, '');
        if (cpf) {
          if (!cpfValido(cpf)) return { erro: 'CPF inválido: peça para conferir os números' };
          const p = await f.paciente(cpf);
          if (p) { c.mem.paciente = { id: p.id, nome: p.nome }; return { encontrado: true, nome: p.nome, orientacao: 'Pergunte se é esse o paciente (mostre só o nome).' }; }
          return { encontrado: false, orientacao: 'Sem cadastro com esse CPF: siga com nome completo, nascimento e sexo para cadastrar.' };
        }
        if (args.nome_completo && args.nascimento && f.pacientePorDados) {
          const nascIso = isoNascimento(args.nascimento);
          if (!nascIso) return { erro: 'data de nascimento inválida: peça para conferir (dia/mês/ano)' };
          const p = await f.pacientePorDados({ nome: String(args.nome_completo), nascimento: nascIso, telefones: [soTelefone(c.telefone)] });
          if (p) { c.mem.paciente = { id: p.id, nome: p.nome, nascimento: nascIso }; return { encontrado: true, nome: p.nome }; }
          return { encontrado: false, orientacao: 'Paciente novo: o cadastro é feito no agendamento (precisa do sexo).' };
        }
        return { erro: 'mande o CPF, ou nome completo e nascimento' };
      }
      case 'agendar': {
        const g = c.mem.slots[String(args.horario_id)];
        if (!g) return { erro: 'horario_id desconhecido: use ver_horarios e ofereça os horários ao paciente' };
        const sv = await acharServico(g.servicoId, c);
        const un = sv && acharUnidade(sv, g.unidade);
        if (!sv || !un) return { erro: 'serviço ou unidade não encontrados: busque de novo' };
        if (jaPassou(g.slot, c.agora)) return { erro: 'esse horário já passou: ofereça outro' };
        if (c.mem.agendados.some((a) => a.servicoId === sv.id && a.ymd === g.slot.ymd)) return { erro: 'já agendado nesta conversa (não agende de novo)' };
        if (!f.reservar) return { erro: 'agendamento indisponível: transfira para a equipe' };
        // REGRA DA CLÍNICA: pagamento por pix só reserva DEPOIS do comprovante conferido
        if (args.pagamento === 'pix' && !c.mem.pix) {
          return { erro: `PIX: ainda não há comprovante conferido. NÃO agende. Passe a chave pix (${env.pixKey}) e o valor, peça o comprovante e, quando ele mandar a imagem, chame conferir_comprovante. Só depois chame agendar.` };
        }
        // forma de pagamento é pergunta obrigatória (caso real: agendou sem perguntar); o código não presume "recepção"
        if (args.pagamento !== 'recepcao' && args.pagamento !== 'pix') return { erro: 'falta a forma de pagamento: pergunte ao paciente se prefere pagar na recepção no dia (pix, cartão de crédito e débito ou dinheiro) ou adiantar por pix aqui na conversa. NÃO agende antes da resposta.' };
        const nomeCompleto = String(args.nome_completo ?? '').trim().replace(/\s+/g, ' ');
        const nasc = isoNascimento(args.nascimento) ?? '';
        const conhecido = c.mem.paciente?.id && norm(c.mem.paciente.nome) === norm(nomeCompleto) ? c.mem.paciente : undefined;
        if (!conhecido) {
          if (nomeCompleto.split(' ').length < 2) return { erro: 'preciso do nome completo (nome e sobrenome)' };
          if (!nasc) return { erro: 'data de nascimento inválida: peça para o paciente conferir (dia/mês/ano)' };
          if (!args.sexo) return { erro: 'preciso do sexo do paciente (feminino ou masculino) para o cadastro: pergunte com respeito' };
          // paciente pode já existir pelo telefone + nome + nascimento
          const achado = f.pacientePorDados ? await f.pacientePorDados({ nome: nomeCompleto, nascimento: nasc, telefones: [soTelefone(c.telefone)] }).catch(() => null) : null;
          if (achado) c.mem.paciente = { id: achado.id, nome: achado.nome, nascimento: nasc };
        }
        const pac = conhecido ?? (c.mem.paciente && norm(c.mem.paciente.nome) === norm(nomeCompleto) ? c.mem.paciente : undefined);
        const cpf = String(args.cpf ?? '').replace(/\D/g, '');
        // telefone de contato: o informado (agendamento para outra pessoa) ou o WhatsApp desta conversa; sempre DDD + número, sem o 55
        // telefone de contato do paciente: obrigatório e confirmado na conversa (regra da clínica); sempre DDD + número, sem o 55
        let telInformado = args.telefone ? soTelefone(String(args.telefone)) : '';
        if (!telInformado) return { erro: 'falta o telefone de contato do paciente: peça (para o próprio paciente, pergunte se pode ser este WhatsApp; para outra pessoa, o telefone dela). NÃO agende antes.' };
        // sem DDD ("98596-3941"): usa o DDD do WhatsApp desta conversa, sem pedir de novo ao paciente (caso real: ela pediu o DDD de volta)
        if (/^\d{8,9}$/.test(telInformado)) telInformado = soTelefone(c.telefone).slice(0, 2) + telInformado;
        if (!/^\d{10,11}$/.test(telInformado)) return { erro: 'telefone incompleto: peça o número de novo (com DDD, ex.: 91 98888-7777)' };
        const telefone = telInformado;
        const r = await f.reservar({
          servico: sv, unidade: un, slot: g.slot, cpf: cpf && cpfValido(cpf) ? cpf : undefined,
          pacienteId: pac?.id,
          cadastro: pac?.id ? undefined : { nome: nomeCompleto, nascimento: nasc, sexo: args.sexo, telefone },
          observacao: ['Agendado pela Amanda (IA) via WhatsApp', args.pagamento === 'pix' ? `Pago por pix${c.mem.pix?.valor ? ` (R$ ${c.mem.pix.valor.toFixed(2).replace('.', ',')})` : ''}, comprovante recebido no WhatsApp` : 'Pagamento na recepção'].join('. '),
          comboId: sv.combo?.id,
        });
        if (!r.ok) {
          evt('erro', { mensagem: `IA agendar: ${r.codigo} ${r.motivo}`.slice(0, 200) });
          if (r.incerto) { c.saida.handoff = { motivo: `ATENÇÃO: a reserva pode ou não ter sido gravada (${r.codigo}). Conferir no Clinilink: ${sv.frase} no ${un.nome}, ${g.slot.ymd} ${g.slot.turno}, paciente ${nomeCompleto}.` }; return { erro: 'não deu para confirmar a gravação; a equipe vai conferir. Avise o paciente.' }; }
          if (r.codigo === 'SERVICO_DUPLICADO_NO_DIA') return { erro: 'o paciente já tem este serviço agendado neste dia. Explique e pergunte se quer outro dia.' };
          if (r.codigo === 'SEM_VAGA_AGORA' || r.codigo === 'HORARIO_OCUPADO') return { erro: 'a vaga acabou de ser preenchida: ofereça outro horário (ver_horarios).' };
          return { erro: `o sistema recusou (${r.codigo}: ${r.motivo.slice(0, 120)}). Se for um dado do paciente, peça para conferir; senão, passe para a equipe.` };
        }
        const quem = pac?.nome ?? nomeCompleto;
        c.mem.paciente = { id: r.pacienteId ?? pac?.id, nome: quem, nascimento: nasc || pac?.nascimento };
        c.mem.agendados.push({ servicoId: sv.id, ymd: g.slot.ymd, resumo: `${sv.frase} no ${un.nome}, ${dataFalada(g.slot.ymd, hoje)}, ${g.slot.turno}` });
        await prepararGeneros([r.profissional]);
        const pagoPix = args.pagamento === 'pix' ? c.mem.pix?.valor : undefined;
        if (args.pagamento === 'pix') c.mem.pix = undefined; // um comprovante vale para UM agendamento
        c.saida.confirmacoes.push(mensagemConfirmacao({ paciente: quem, novoCadastro: r.cadastrou, servico: sv, unidade: un, ymd: g.slot.ymd, hora: r.hora, profissionalBruto: r.profissionalBruto ?? g.slot.profissionalBruto, valor: un.precoPix, pagoPix, primeiroNome: quem.split(' ')[0], linhas: r.linhas, extra: r.extra }));
        return { ok: true, orientacao: 'Agendado. A mensagem oficial de confirmação (com todos os dados) é enviada automaticamente logo depois da sua resposta: NÃO repita os dados. Escreva no máximo uma frase curta (ou nada) e, se for pix, a chave pix.' + '' };
      }
      case 'orcar_exames': {
        const nomes: string[] = Array.isArray(args.exames) ? args.exames.map(String).filter(Boolean) : [];
        if (!nomes.length || !f.casarExames) return { erro: 'sem exames' };
        // REGRA DA CLÍNICA: pedido de orçamento é com o atendimento principal (a IA não monta nem passa os valores)
        if (c.pedidoOrcamento) return { erro: 'PEDIDO DE ORÇAMENTO: regra da clínica, quem faz é o atendimento principal. NÃO passe valores. Chame transferir_para_humano com o motivo "Orçamento: ' + nomes.join(', ') + '" e avise o paciente numa frase curta que a equipe já vai passar o orçamento.' };
        const r = await f.casarExames(nomes, escolherExames);
        const ant = c.mem.orcamento?.itens ?? [];
        const itens = [...ant, ...r.itens.filter((i) => !ant.some((a) => a.id === i.id))];
        c.mem.orcamento = { itens };
        const unidades = [...new Set(itens.flatMap((i) => Object.keys(i.precos)))];
        const dica = f.dicaDeCombo ? await f.dicaDeCombo(itens, itens.reduce((s, i) => s + (Object.values(i.precos)[0] ?? 0), 0)).catch(() => undefined) : undefined;
        return {
          exames: itens.map((i) => ({ exame: i.nome, valores: Object.fromEntries(Object.entries(i.precos).map(([u, v]) => [u, reais(v)])) })),
          total_por_unidade: Object.fromEntries(unidades.map((u) => [u, reais(itens.reduce((s, i) => s + (i.precos[u] ?? 0), 0))])),
          nao_encontrados: r.naoAchados, externos_com_a_equipe: r.externos, ...(dica ? { dica_de_combo: dica } : {}),
          orientacao: 'Mostre um exame por linha com o valor e o total. Depois pergunte se quer agendar a coleta (agendar_coleta).',
        };
      }
      case 'ler_pedido_medico': {
        // o paciente pode mandar várias fotos (álbum: cada página do pedido numa foto): lê todas e junta os exames, sem repetir
        const lidos = (await c.lerPedidos?.()) ?? [];
        const pedidos = lidos.filter((p): p is PedidoLido => Boolean(p && p.tipo === 'pedido' && p.exames.length));
        const vistos = new Set<string>(); const exames: string[] = [];
        for (const p of pedidos) for (const e of p.exames) { const k = norm(e); if (!vistos.has(k)) { vistos.add(k); exames.push(e); } }
        if (!exames.length) return { erro: lidos.length ? `não consegui ler ${lidos.length > 1 ? 'as fotos' : 'a foto'} do pedido: peça uma foto mais nítida ou os nomes dos exames` : 'não há foto de pedido na conversa' };
        return { fotos_lidas: pedidos.length, fotos_recebidas: lidos.length, exames, incerto: pedidos.some((p) => p.incerto) || pedidos.length < lidos.length, orientacao: `Li ${pedidos.length} de ${lidos.length} foto(s). Agora chame orcar_exames com TODOS esses nomes.` + (pedidos.length < lidos.length ? ' Avise que alguma foto não deu para ler e peça para reenviar essa.' : '') };
      }
      case 'agendar_coleta': {
        const itens = c.mem.orcamento?.itens ?? [];
        if (!itens.length || !f.servicoDeExames) return { erro: 'faça o orçamento antes (orcar_exames)' };
        const sv = await f.servicoDeExames(itens);
        if ('semAgenda' in sv) return { erro: `sem agenda de coleta para: ${sv.semAgenda}. Passe para a equipe.` };
        return { resultado: 'servico', ...(await resumoServico(sv, c)) };
      }
      case 'sugerir_exames': {
        const s = await f.sugestoesDeExames?.();
        if (!s) return { erro: 'indisponível' };
        return { mais_procurados: s.exames.slice(0, 8).map((e) => e.nome), combos: s.combos.slice(0, 5) };
      }
      case 'combos_do_servico': {
        const sv = await acharServico(String(args.servico_id), c);
        if (!sv || !f.combosComServico) return { combos: [] };
        const cs = await Promise.race([f.combosComServico(sv), new Promise<[]>((ok) => setTimeout(() => ok([]), 6000))]);
        return { combos: cs.slice(0, 3).map((x) => ({ servico_id: `combo:${x.id}`, combo: x.rotulo, total: reais(x.total), economia: reais(x.economia), descricao: x.texto })) };
      }
      case 'etapa_do_combo': {
        const sv = await acharServico(String(args.servico_id), c);
        const pac = sv?.pacote;
        if (!pac || !f.etapaDoCombo) return { erro: 'não é um combo (abra com buscar_servico/abrir_servico)' };
        const n = Number(args.etapa) - 1;
        const ids = pac.etapas[n];
        if (!ids) return { erro: `o combo tem ${pac.etapas.length} etapas` };
        const itens = ids.map((id) => pac.itens.find((i) => i.id === id)).filter((x): x is NonNullable<typeof x> => Boolean(x));
        const et = await f.etapaDoCombo({ id: pac.id, rotulo: pac.rotulo, total: pac.total }, itens);
        if ('semAgenda' in et) return { erro: `sem agenda para esta etapa (${et.semAgenda}). Siga para a próxima ou passe para a equipe.` };
        return { resultado: 'servico', etapa: n + 1, de: pac.etapas.length, ...(await resumoServico(et, c)) };
      }
      case 'conferir_comprovante': {
        const cp = await c.lerComprovante?.();
        if (!cp || cp.tipo !== 'comprovante') return { erro: 'a imagem não parece um comprovante de pix' };
        const receb = env.pixRecebedor.split(',').map((x) => norm(x)).filter(Boolean);
        const okReceb = receb.some((r) => norm(`${cp.destinatario ?? ''} ${cp.chave ?? ''}`).includes(r)) || norm(cp.chave ?? '') === norm(env.pixKey);
        const valido = okReceb && cp.status !== 'falhou' && cp.status !== 'agendado';
        if (valido) c.mem.pix = { valor: cp.valor ?? undefined, transacao: cp.transacao ?? undefined, em: new Date().toISOString() };
        return { valor: cp.valor != null ? reais(cp.valor) : 'não legível', recebedor_confere: okReceb, status: cp.status ?? 'desconhecido', orientacao: valido ? 'Comprovante conferido: agora chame agendar com pagamento pix (com os dados do paciente) para reservar.' : !okReceb ? 'O recebedor não parece ser a clínica: peça para conferir, sem acusar. Não agende.' : 'O pix não aparece como concluído (agendado ou falhou): peça o comprovante do pix já feito. Não agende.' };
      }
      case 'transferir_para_humano': {
        c.saida.handoff = { motivo: String(args.motivo ?? 'pedido do paciente'), urgente: Boolean(args.urgente) };
        return { ok: true, orientacao: 'A conversa vai para a equipe depois da sua resposta. Escreva uma frase curta avisando o paciente.' };
      }
      case 'encerrar_atendimento': {
        // o atendimento é FINALIZADO na Inovstar: só com despedida clara do paciente (caso real: encerrou quando ele respondeu "na recepção")
        if (!DESPEDIDA.test(c.ultimaDoPaciente ?? '')) return { erro: 'o paciente não se despediu: NÃO encerre. Responda normalmente o que ele disse.' };
        c.saida.encerrar = true;
        return { ok: true };
      }
      default:
        return { erro: `ferramenta desconhecida: ${nome}` };
    }
  } catch (e) {
    evt('erro', { mensagem: `IA ferramenta ${nome}: ${(e as Error).message}`.slice(0, 200) });
    return { erro: 'falha ao consultar o sistema agora. Tente de novo uma vez; se falhar, passe para a equipe.' };
  }
}
