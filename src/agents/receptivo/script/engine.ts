import type { Fonte, PacienteInfo, Periodo, Servico, Slot, Unidade } from './catalog.js';

/**
 * Motor de conversa por roteiro. O estado é recalculado a cada mensagem reprocessando as mensagens do
 * paciente em ordem (sem banco). Os FATOS (unidades, médicos, preço, datas, paciente) vêm da fonte.
 *
 * Fluxo:
 *  1 recepção -> 2 paciente diz o que precisa (serviço direto ou sintoma) -> 3 IA sugere o serviço e o paciente confirma
 *  -> 4 IA consulta a agenda e informa as unidades que têm o serviço, com o médico de cada uma, e pergunta qual
 *  -> 5 paciente escolhe a unidade (e talvez já o dia) -> 6 IA lista datas e turnos com vaga (início da agenda)
 *  -> 7 paciente escolhe -> 8 IA pede o CPF -> 9 IA consulta o paciente e mostra o nome para confirmar
 *  -> 10 se o CPF não existe: coleta o cadastro (nome, nascimento, sexo, telefone) -> 11 conclui.
 * Estilo Amanda v7.3: sem emoji, sem travessão, sem asterisco, uma pergunta por mensagem.
 */

export type Cadastro = { nome?: string; nascimento?: string; sexo?: 'feminino' | 'masculino'; telefone?: string; pediuTelefone?: boolean };

export type State = {
  saudou: boolean;
  servico?: Servico;
  opcoes?: { id: string; nome: string }[];
  confirmPerguntado: boolean;
  servicoConfirmado: boolean;
  unidadesInformadas: boolean;
  unidade?: Unidade;
  lista?: Slot[]; // datas oferecidas (o paciente pode responder pelo número)
  data?: string;
  turno?: Periodo;
  slot?: Slot;
  cpf?: string;
  paciente?: PacienteInfo | null; // undefined = ainda não consultado; null = não existe
  pacienteConfirmado: boolean;
  cad: Cadastro;
  falhas: number;
  fim: boolean;
};

/**
 * `efetivar` é calculado pelo `responder`: só a ÚLTIMA mensagem pode gravar, porque o roteiro reprocessa a
 * conversa inteira a cada mensagem e uma gravação nas anteriores duplicaria o agendamento.
 */
export type Ctx = { now: Date; nome: string; tz: string; telefone?: string; efetivar?: boolean };
export type Handoff = { motivo: string; urgente?: boolean };
export type Result = { state: State; reply: string; handoff?: Handoff };

/** Etapa legível da conversa, para o painel de logs. */
export function etapa(s: State, handoff?: Handoff): string {
  if (handoff?.urgente) return 'segurança (emergência/crise)';
  if (handoff) return 'transferida para a equipe';
  if (s.fim) return 'concluída';
  if (!s.servico) return s.opcoes ? 'escolhendo entre opções de serviço' : 'recepção / entendendo o serviço';
  if (!s.servicoConfirmado) return 'confirmando o serviço';
  if (!s.unidade) return 'escolhendo a unidade';
  if (!s.slot) return 'escolhendo data e turno';
  if (!s.cpf) return 'pedindo o CPF';
  if (s.paciente === undefined) return 'consultando o paciente';
  if (s.paciente === null) return 'cadastro do paciente novo';
  return 'confirmando o paciente';
}

/** Marcas na mensagem final; o agente abre uma jornada nova depois delas. */
export const MARCA_FIM = 'Simulação: nada foi agendado';
export const MARCA_AGENDADO = 'Agendamento confirmado';
export const MARCAS_FIM = [MARCA_FIM, MARCA_AGENDADO];

export const novoEstado = (): State => ({
  saudou: false, confirmPerguntado: false, servicoConfirmado: false, unidadesInformadas: false,
  pacienteConfirmado: false, cad: {}, falhas: 0, fim: false,
});

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const SAUDACAO = (h: number) => (h >= 5 && h < 12 ? 'Bom dia' : h >= 12 && h < 18 ? 'Boa tarde' : 'Boa noite');
const cap = (s: string) => s.charAt(0).toLocaleUpperCase('pt-BR') + s.slice(1);
const titulo = (s: string) => s.toLocaleLowerCase('pt-BR').replace(/(^|[\s'-])(\p{L})/gu, (_m, a, b) => a + b.toLocaleUpperCase('pt-BR')).replace(/\b(De|Da|Do|Dos|Das|E)\b/g, (x) => x.toLowerCase());

// ---------- datas (fuso da clínica) ----------
function hoje(ctx: Ctx) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: ctx.tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(ctx.now).map((x) => [x.type, x.value]));
  return { ymd: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour) % 24 };
}
const toDate = (ymd: string) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const addDias = (ymd: string, n: number) => { const d = toDate(ymd); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diaSemana = (ymd: string) => toDate(ymd).getUTCDay(); // 0 = domingo
const fmtData = (ymd: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(toDate(ymd));
const hora = (hhmm: string) => { const [h, m] = hhmm.split(':'); return m === '00' ? `${Number(h)}h` : `${Number(h)}h${m}`; };
const periodoTxt = (t: Periodo) => (t === 'manhã' ? 'de manhã' : 'à tarde');
const linhaSlot = (s: Slot, comMedico: boolean) => `${fmtData(s.ymd)}, ${periodoTxt(s.turno)}, a partir das ${hora(s.inicio)}${comMedico && s.profissional ? `, com ${s.profissional}` : ''}`;
const numerada = (slots: Slot[], comMedico: boolean) => slots.map((s, i) => `${i + 1}. ${linhaSlot(s, comMedico)}`).join('\n');

const SEMANA: [RegExp, number][] = [[/domingo/, 0], [/segunda/, 1], [/terca/, 2], [/quarta/, 3], [/quinta/, 4], [/sexta/, 5], [/sabado/, 6]];

function lerData(t: string, ctx: Ctx): string | undefined {
  const h = hoje(ctx);
  if (/depois de amanha/.test(t)) return addDias(h.ymd, 2);
  if (/amanha/.test(t)) return addDias(h.ymd, 1);
  if (/\bhoje\b/.test(t)) return h.ymd;
  for (const [re, dow] of SEMANA) {
    if (re.test(t)) { let n = (dow - diaSemana(h.ymd) + 7) % 7; if (n === 0) n = 7; return addDias(h.ymd, n); }
  }
  const dm = t.match(/\b(\d{1,2})[\/.-](\d{1,2})\b/) ?? t.match(/\bdia (\d{1,2})\b/);
  if (dm) {
    const dia = Number(dm[1]); const mes = dm[2] ? Number(dm[2]) : Number(h.ymd.slice(5, 7));
    if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12) {
      let ano = Number(h.ymd.slice(0, 4)); let ymd = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
      if (ymd < h.ymd) { ano += 1; ymd = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`; }
      return ymd;
    }
  }
  return undefined;
}
const lerTurno = (t: string): Periodo | 'noite' | undefined => (/(^|[^a-z])(manha|cedo)([^a-z]|$)/.test(t) ? 'manhã' : /tarde/.test(t) ? 'tarde' : /noite/.test(t) ? 'noite' : undefined);

// ---------- detectores ----------
const EMERGENCIA = /dor (forte )?no peito|falta de ar|nao consigo respirar|desmai|convuls|sangramento (intenso|forte)|avc|infarto|rigidez (de|na) nuca|fraqueza (subita|de um lado)|fala (travada|enrolada)/;
const CRISE = /suicid|me matar|tirar minha vida|acabar com minha vida|nao quero mais viver|me machucar|autolesao/;
const HUMANO = /atendente|humano|pessoa de verdade|falar com alguem|falar com uma pessoa|recepcao/;
const SIM = /^(sim|s|pode|pode sim|pode reservar|quero|quero sim|ok|isso|isso mesmo|e isso|e isso mesmo|exato|confirmo|confirma|fechado|combinado|bora|claro|por favor|pode ser|ta bom|tudo bem|correto|certo|esse mesmo|sou eu)\b/;
const NAO = /^(nao|n|nao quero|nao obrigad|nao e|outro|outra|prefiro outro|prefiro outra|errado)\b/;
const SO_CUMPRIMENTO = /^(oi+|ola|ola+ boa|e ai|ei|bom dia|boa tarde|boa noite|teste|ola teste|agente de ia|amanda|atendimento|tudo bem\??|oie)[\s!.,?]*(teste|amanda|tudo bem\??)?[\s!.,?]*$/;

const cpfDoTexto = (t: string): string | undefined => { const m = t.match(/\b(\d{3})\.?(\d{3})\.?(\d{3})-?(\d{2})\b/); return m ? m.slice(1).join('') : undefined; };
const pick = <T,>(arr: T[], n: number) => arr[n % arr.length];

function lerNascimento(t: string): string | undefined {
  const m = t.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})\b/);
  if (!m) return undefined;
  const [d, mo, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(a, mo - 1, d));
  if (a < 1900 || a > new Date().getUTCFullYear() || dt.getUTCDate() !== d || dt.getUTCMonth() !== mo - 1) return undefined;
  return `${a}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
const fmtNasc = (iso: string) => iso.split('-').reverse().join('/');

// ---------- núcleo ----------
export async function step(prev: State, texto: string, ctx: Ctx, fonte: Fonte, n = 0): Promise<Result> {
  // depois de uma jornada concluída, uma nova mensagem abre outra jornada (mantém a saudação já feita)
  const s: State = prev.fim ? { ...novoEstado(), saudou: true } : { ...prev, cad: { ...prev.cad } };
  const base = prev.fim ? s : prev;
  const t = norm(texto);
  const h = hoje(ctx);
  const nome = ctx.nome;
  const abertura = s.saudou ? '' : `${SAUDACAO(h.hora)}! Sou a Amanda, da Clinex.`;
  const out = (reply: string, handoff?: Handoff): Result => { s.saudou = true; return { state: s, reply, handoff }; };
  const comAbertura = (txt: string) => (abertura ? `${abertura}\n${txt}` : txt);
  const partes: string[] = [];
  if (abertura) partes.push(abertura);
  const dizer = (...txt: string[]) => out([...partes, ...txt].join(abertura && partes.length === 1 && txt.length === 1 && !txt[0].includes('\n') ? ' ' : '\n'));
  const reiniciaDepoisDoServico = () => {
    s.confirmPerguntado = false; s.servicoConfirmado = false; s.unidadesInformadas = false; s.unidade = undefined;
    s.lista = undefined; s.data = undefined; s.turno = undefined; s.slot = undefined; s.cpf = undefined;
    s.paciente = undefined; s.pacienteConfirmado = false; s.cad = {};
  };

  // 1) segurança primeiro
  if (CRISE.test(t)) {
    return out(`Sinto muito que você esteja passando por isso${nome ? `, ${nome}` : ''}. Vou te colocar agora com alguém da nossa equipe para te ajudar. Se precisar conversar com alguém neste momento, o CVV atende 24 horas pelo 188, a ligação é gratuita. Você não precisa passar por isso sozinho.`, { motivo: 'PRIORIDADE: urgente. Paciente relatou possível crise de saúde mental.', urgente: true });
  }
  if (EMERGENCIA.test(t)) {
    return out(`${nome ? `${nome}, pelo` : 'Pelo'} que você descreveu, isso precisa de avaliação imediata. Por favor, procure agora o pronto-socorro mais próximo ou ligue 192. A Clinex faz atendimento agendado e não é o lugar certo para uma urgência. Fico à disposição depois, tá bem?`, { motivo: 'PRIORIDADE: urgente. Possível emergência clínica relatada pelo paciente.', urgente: true });
  }
  if (HUMANO.test(t)) {
    return out(comAbertura('Claro, vou te passar para alguém da nossa equipe. Só um instante.'), { motivo: 'Paciente pediu atendimento humano.' });
  }

  // 2) serviço: escolha entre opções pendentes, ou descoberta na fonte
  let mudouServico = false;
  const aplicar = (d: Awaited<ReturnType<Fonte['descobrir']>>): Result | undefined => {
    if (!d) return undefined;
    if ('semAgenda' in d) return out(comAbertura(`No momento não há vagas abertas para ${d.semAgenda}. Vou pedir para a equipe conferir e te retornar.`), { motivo: `Sem vagas abertas na agenda para ${d.semAgenda}.` });
    if ('opcoes' in d) { s.opcoes = d.opcoes; s.servico = undefined; return undefined; }
    if (d.servico.id !== s.servico?.id) { s.servico = d.servico; s.opcoes = undefined; reiniciaDepoisDoServico(); mudouServico = true; }
    return undefined;
  };
  if (!s.slot) {
    if (s.opcoes && !s.servico) {
      const idx = Number((t.match(/^\s*(\d)\b/) ?? [])[1]) - 1;
      const escolhida = s.opcoes[idx] ?? s.opcoes.find((o) => norm(o.nome).split(/\s+/).filter((w) => w.length > 3).some((w) => t.includes(w)));
      if (escolhida) { const r = aplicar(await fonte.resolver(escolhida.id)); if (r) return r; }
    } else {
      const r = aplicar(await fonte.descobrir(t, !s.servico));
      if (r) return r;
    }
  }

  // 3) sem serviço: recepção
  if (!s.servico) {
    if (s.opcoes) {
      const lista = s.opcoes.map((o, i) => `${i + 1}. ${o.nome}`).join('\n');
      return out(comAbertura(`Encontrei estas opções:\n${lista}\nQual delas você precisa?`));
    }
    const cumprimento = SO_CUMPRIMENTO.test(t);
    if (!cumprimento && !NAO.test(t)) s.falhas += 1;
    if (s.falhas >= 2) return out(comAbertura('Vou passar você para alguém da nossa equipe continuar o atendimento. Só um instante.'), { motivo: 'Não foi possível identificar o serviço pedido pelo paciente.' });
    if (!s.saudou && cumprimento) return out(`${abertura} Como posso te ajudar?`);
    if (cumprimento) return out('Qual consulta ou exame você precisa?');
    if (NAO.test(t) && prev.confirmPerguntado === false && base.servico === undefined && s.saudou && !abertura) return out('Sem problema. Qual consulta ou exame você precisa?');
    return out(comAbertura('Não consegui identificar o serviço. Me diz o nome da especialidade ou do exame, por exemplo cardiologia, dermatologia ou ultrassom.'));
  }
  const sv = s.servico;

  // 4) sugere o serviço e espera a confirmação do paciente
  if (!s.servicoConfirmado) {
    // já perguntamos antes e o serviço não mudou nesta mensagem: o paciente está respondendo
    if (s.confirmPerguntado && !mudouServico) {
      if (SIM.test(t)) { s.servicoConfirmado = true; }
      else if (NAO.test(t)) { s.servico = undefined; s.opcoes = undefined; reiniciaDepoisDoServico(); return out('Sem problema. Qual consulta ou exame você precisa?'); }
    }
    if (!s.servicoConfirmado) {
      s.confirmPerguntado = true;
      // guarda desde já o que o paciente adiantou (unidade, dia, período) para não perguntar de novo
      const unAdiantada = (await fonte.nomesUnidades()).find((u) => t.includes(norm(u)));
      if (unAdiantada) { const u = sv.unidades.find((x) => norm(x.nome) === norm(unAdiantada)); if (u) s.unidade = u; }
      const dAd = lerData(t, ctx); const tAd = lerTurno(t);
      if (dAd) s.data = dAd;
      if (tAd && tAd !== 'noite') s.turno = tAd;
      const seguranca = sv.viaSintoma ? ' Se a dor estiver forte ou vier com falta de ar, procure agora o pronto-socorro mais próximo ou ligue 192.' : '';
      const pergunta = s.confirmPerguntado && prev.confirmPerguntado && !mudouServico
        ? pick([`Só para confirmar: você precisa de ${sv.frase}, certo?`, `Você quer agendar ${sv.frase}?`], n)
        : sv.viaSintoma ? `Pelo que você contou, o serviço indicado é ${sv.frase}.${seguranca} É isso que você precisa?` : `Você quer agendar ${sv.frase}, é isso?`;
      return dizer(pergunta);
    }
  }

  // 5) a partir daqui o serviço está confirmado; extrai unidade, dia e período citados
  let aviso = '';
  if (!s.slot) {
    const nomesUn = await fonte.nomesUnidades();
    const unCitada = nomesUn.find((u) => t.includes(norm(u)));
    if (unCitada) {
      const ok = sv.unidades.find((u) => norm(u.nome) === norm(unCitada));
      if (ok) s.unidade = ok;
      else aviso = `${cap(sv.frase)} não tem agenda no ${unCitada}.`;
    }
    if (!s.unidade && sv.unidades.length > 1 && /tanto faz|qualquer|a mais proxima|o mais proximo/.test(t)) s.unidade = sv.unidades[0];
    if (!s.unidade && sv.unidades.length === 1) s.unidade = sv.unidades[0];
    const tn = lerTurno(t); const d = lerData(t, ctx);
    if (d) { s.data = d; s.lista = undefined; }
    if (tn === 'noite') aviso = aviso || 'Nosso atendimento é pela manhã e à tarde.';
    else if (tn) { s.turno = tn; s.lista = undefined; }
  }

  // 6) informa as unidades com agenda (e o médico de cada uma) antes de perguntar qualquer coisa
  if (!s.unidadesInformadas) {
    s.unidadesInformadas = true;
    const medicos = (u: Unidade) => (u.profissionais?.length ? ` com ${u.profissionais.join(' e ')}` : '');
    const preco = sv.precoTexto ? ` ${sv.precoTexto}` : '';
    // uma unidade: frase corrida. Várias: uma por linha, para os médicos de cada unidade não se misturarem.
    partes.push(sv.unidades.length === 1
      ? `${cap(sv.frase)} tem agenda no ${sv.unidades[0].nome}${medicos(sv.unidades[0])}.${preco}`
      : [`${cap(sv.frase)} tem agenda nestas unidades:`, ...sv.unidades.map((u) => `${u.nome}${medicos(u)}`), ...(preco ? [preco.trim()] : [])].join('\n'));
  }
  if (aviso) partes.push(aviso);
  if (!s.unidade) return dizer(base.unidadesInformadas ? `Para eu seguir, qual unidade você prefere: ${sv.unidades.map((u) => u.nome).join(' ou ')}?` : 'Para qual unidade você prefere?');
  const un = s.unidade;
  const comMedico = (un.profissionais?.length ?? 0) > 1;

  // 7) dia e período: o paciente escolhe da lista (número) ou diz a data
  if (!s.slot) {
    // resposta por número a uma lista anterior
    if (s.lista && s.lista.length && !s.slot && !lerData(t, ctx)) {
      const num = Number((t.match(/^\s*(\d)\b/) ?? [])[1]);
      const idx = num ? num - 1 : /primeir/.test(t) ? 0 : /ultim/.test(t) ? s.lista.length - 1 : -1;
      if (idx >= 0 && s.lista[idx]) { s.slot = s.lista[idx]; s.data = s.slot.ymd; s.turno = s.slot.turno; s.lista = undefined; }
    }
  }
  if (!s.slot) {
    const alternativas = async (de: string, filtro?: Periodo) => {
      const todas = await fonte.proximas(sv, un, de, 8);
      return (filtro ? todas.filter((x) => x.turno === filtro) : todas).slice(0, 4);
    };
    if (s.data) {
      const doDia = await fonte.periodos(sv, un, s.data);
      const certos = s.turno ? doDia.filter((x) => x.turno === s.turno) : doDia;
      if (certos.length === 1) { s.slot = certos[0]; s.turno = certos[0].turno; s.lista = undefined; }
      else if (certos.length > 1) {
        s.lista = certos;
        return dizer(`Para ${fmtData(s.data)} tenho:\n${numerada(certos, comMedico)}\nQual fica melhor para você?`);
      } else {
        const pedido = `${fmtData(s.data)}${s.turno ? ` ${periodoTxt(s.turno)}` : ''}`;
        const alt = await alternativas(s.data, s.turno);
        s.data = undefined; s.turno = undefined;
        if (alt.length === 0) return out([...partes, 'Para essa data não encontrei vaga e, no momento, não vejo outras datas abertas. Vou pedir para a equipe conferir e te retornar.'].join('\n'), { motivo: `Sem vagas para ${sv.nome} no ${un.nome}.` });
        s.lista = alt;
        return dizer(`Para ${pedido} não há vaga. Tenho:\n${numerada(alt, comMedico)}\nQual fica melhor para você?`);
      }
    } else {
      const alt = await alternativas(addDias(h.ymd, 1), s.turno);
      if (alt.length === 0) return out([...partes, 'No momento não vejo vagas abertas. Vou pedir para a equipe conferir e te retornar.'].join('\n'), { motivo: `Sem vagas para ${sv.nome} no ${un.nome}.` });
      s.lista = alt;
      return dizer(`Tenho estas opções:\n${numerada(alt, comMedico)}\nQual delas fica melhor para você? Se preferir outro dia, é só me dizer.`);
    }
  }
  const slot = s.slot!;
  const resumoVaga = `${sv.frase} no ${un.nome}, ${fmtData(slot.ymd)}, ${periodoTxt(slot.turno)}, a partir das ${hora(slot.inicio)}, por ordem de chegada${slot.profissional ? `, com ${slot.profissional}` : ''}`;

  // 8) CPF
  const slotAntes = Boolean(base.slot);
  if (!s.cpf) {
    const cpf = slotAntes ? cpfDoTexto(t) : undefined;
    if (cpf) s.cpf = cpf;
    else if (slotAntes && /\d{2,}/.test(t)) return dizer('Não consegui ler o CPF. Pode me enviar os 11 números?');
    else return dizer(`${pick(['Fechado', 'Combinado'], n)}, é ${resumoVaga}. Para eu reservar, preciso do CPF do paciente. Qual é?`);
  }

  // 9) consulta o paciente por CPF
  const acabouDeConsultar = s.paciente === undefined;
  if (s.paciente === undefined) {
    s.paciente = await fonte.paciente(s.cpf);
    if (s.paciente) return dizer(`Encontrei o cadastro de ${titulo(s.paciente.nome)}. É esse o paciente?`);
    return dizer('Não encontrei esse CPF no cadastro. Vou fazer o cadastro agora. Qual o nome completo do paciente?');
  }
  if (s.paciente && !s.pacienteConfirmado) {
    if (SIM.test(t)) s.pacienteConfirmado = true;
    else if (NAO.test(t)) { s.cpf = undefined; s.paciente = undefined; return dizer('Sem problema. Pode conferir o CPF e me enviar de novo?'); }
    else return dizer(`Esse cadastro é de ${titulo(s.paciente.nome)}. É esse o paciente?`);
  }

  // 10) CPF novo: coleta o cadastro, um dado por mensagem
  if (s.paciente === null) {
    const c = s.cad;
    if (!acabouDeConsultar) {
      if (!c.nome) { const m = texto.trim(); if (/^[\p{L}' ]{5,80}$/u.test(m) && m.includes(' ') && !SIM.test(t) && !NAO.test(t)) c.nome = titulo(m); }
      else if (!c.nascimento) { const nsc = lerNascimento(texto); if (nsc) c.nascimento = nsc; }
      else if (!c.sexo) { if (/fem|mulher/.test(t)) c.sexo = 'feminino'; else if (/masc|homem/.test(t)) c.sexo = 'masculino'; }
      else if (!c.telefone) {
        const dig = texto.replace(/\D/g, '');
        if (c.pediuTelefone && dig.length >= 10 && dig.length <= 13) c.telefone = dig;
        else if (!c.pediuTelefone) { /* ainda vai perguntar */ }
        else if (SIM.test(t) && ctx.telefone) c.telefone = ctx.telefone.replace(/\D/g, '');
      }
    }
    if (!c.nome) return dizer(!acabouDeConsultar ? 'Preciso do nome completo do paciente, como está no documento. Qual é?' : 'Qual o nome completo do paciente?');
    if (!c.nascimento) return dizer(`Anotado, ${c.nome.split(' ')[0]}. Qual a data de nascimento? Pode ser no formato dia/mês/ano.`);
    if (!c.sexo) return dizer('O cadastro pede o sexo do paciente: feminino ou masculino?');
    if (!c.telefone) {
      const primeira = !c.pediuTelefone; c.pediuTelefone = true;
      return dizer(primeira ? 'Posso usar este número do WhatsApp como contato do paciente?' : 'Qual o telefone com DDD para contato?');
    }
  }

  // 11) conclui
  s.fim = true;
  const quem = s.paciente ? titulo(s.paciente.nome) : s.cad.nome ?? '';
  if (fonte.tipo === 'clinilink') {
    const novo = s.paciente ? `Paciente já cadastrado (${titulo(s.paciente.nome)}, id ${s.paciente.id ?? '?'}).` : `CADASTRAR paciente novo: ${s.cad.nome}, nascimento ${s.cad.nascimento ? fmtNasc(s.cad.nascimento) : '?'}, sexo ${s.cad.sexo}, telefone ${s.cad.telefone}, CPF ${s.cpf}.`;
    const aEquipe = (aviso: string, motivo: string) => out(`${aviso} Vou passar para a equipe concluir, já com tudo anotado. Só um instante.`, { motivo });

    if (!ctx.efetivar) return out('Fechado. Vou concluir a sua reserva, só um instante.'); // reprocessamento: nunca grava

    const r = await fonte.reservar!({
      servico: sv, unidade: un, slot, cpf: s.cpf!,
      pacienteId: s.paciente?.id,
      cadastro: s.paciente ? undefined : { nome: s.cad.nome!, nascimento: s.cad.nascimento!, sexo: s.cad.sexo!, telefone: s.cad.telefone! },
    });
    if (r.ok) {
      const med = r.profissional ?? slot.profissional;
      return out(`${MARCA_AGENDADO}! ${s.paciente ? '' : `Cadastro de ${quem} feito. `}${cap(sv.frase)} no ${un.nome}, ${fmtData(slot.ymd)}, ${periodoTxt(slot.turno)}${med ? `, com ${med}` : ''}. O atendimento é por ordem de chegada, a partir das ${hora(r.hora)}. Recomendamos chegar cedo.`);
    }
    const extra = r.cadastrou ? ' O cadastro do paciente FOI criado.' : '';
    if (r.incerto) return aEquipe('Não consegui confirmar a reserva agora.', `ATENÇÃO: a reserva pode ou não ter sido gravada (${r.codigo}). CONFERIR no Clinilink antes de refazer. Vaga: ${resumoVaga}. ${novo}${extra}`);
    if (r.codigo === 'SEM_VAGA_AGORA' || r.codigo === 'HORARIO_OCUPADO') return aEquipe('Essa vaga acabou de ser preenchida.', `Vaga ocupada na hora de reservar (${r.codigo}). Oferecer outro horário. Pedido: ${resumoVaga}. ${novo}${extra}`);
    if (r.codigo === 'SERVICO_DUPLICADO_NO_DIA') return aEquipe('Vi que este paciente já tem esse atendimento marcado para o mesmo dia.', `Reserva recusada: ${r.codigo}. Conferir o agendamento existente. Pedido: ${resumoVaga}. ${novo}${extra}`);
    return aEquipe('Não consegui concluir a reserva.', `Reserva recusada pelo Clinilink (${r.codigo}: ${r.motivo}). Pedido: ${resumoVaga}. ${novo}${extra}`);
  }
  return out(`${s.paciente ? '' : `Cadastro de ${quem} feito. `}Sua vaga de ${sv.frase} está confirmada para ${fmtData(slot.ymd)}, na unidade ${un.nome}${slot.profissional ? `, com ${slot.profissional}` : ''}. Os atendimentos começam às ${hora(slot.inicio)}, por ordem de chegada. Recomendamos chegar cedo.\n(${MARCA_FIM} de verdade.)`);
}

/**
 * Reprocessa as mensagens do paciente, na ordem, e devolve o resultado da última.
 * `turnos`: cada item são as mensagens que o paciente mandou entre duas respostas da Amanda. Quando ele manda
 * várias de uma vez ("isso" + "pra amanhã"), só a ÚLTIMA recebe resposta; a resposta calculada para as anteriores
 * nunca chega ao paciente. Por isso o que ela "informou" (saudação, resumo de unidades, nome do paciente para
 * confirmar) é desfeito: senão a Amanda pularia o resumo, ou aceitaria um "sim" a uma pergunta que ele não viu.
 * Só o último turno pode gravar no Clinilink (os anteriores já foram respondidos de verdade).
 */
export async function responder(entrada: (string | string[])[], ctx: Ctx, fonte: Fonte): Promise<Result | undefined> {
  const turnos = entrada.map((x) => (Array.isArray(x) ? x : [x]));
  let state = novoEstado();
  let last: Result | undefined;
  let i = 0;
  for (let t = 0; t < turnos.length; t++) {
    const msgs = turnos[t];
    for (let j = 0; j < msgs.length; j++) {
      const antes = { saudou: state.saudou, unidadesInformadas: state.unidadesInformadas };
      last = await step(state, msgs[j], { ...ctx, efetivar: t === turnos.length - 1 }, fonte, i++);
      state = last.state;
      // no último turno, quem encerra a jornada ou transfere já é a resposta que o paciente vai receber
      if (t === turnos.length - 1 && (last.handoff || last.state.fim)) return last;
      if (j < msgs.length - 1) { // resposta descartada: desfaz o que ela marcou como dito
        state.saudou = antes.saudou;
        state.unidadesInformadas = antes.unidadesInformadas;
        if (state.paciente && !state.pacienteConfirmado) state.paciente = undefined; // o nome nunca foi mostrado
      }
    }
  }
  return last;
}
