import { INICIO_PERIODO, SERVICOS, type Periodo, type Servico, type Unidade } from './catalog.js';

/**
 * Motor de conversa por roteiro (sem IA). É uma função PURA: o estado é recalculado a cada mensagem
 * reprocessando as mensagens do paciente em ordem, então não precisa de banco.
 *
 * Fluxo: recepcionar -> serviço -> consulta de unidades (agenda) + preço -> unidade -> dia/período
 *        -> oferta da vaga -> aceite -> CPF -> confirmação (simulada).
 * Estilo segue a Amanda v7.3: sem emoji, sem travessão, sem asterisco, uma pergunta por mensagem.
 */

export type State = {
  saudou: boolean;
  servico?: Servico;
  unidade?: Unidade;
  data?: string; // YYYY-MM-DD
  turno?: Periodo;
  precoInformado: boolean;
  ofertado: boolean;
  aceitou: boolean;
  cpf?: string;
  falhas: number;
  fim: boolean;
};

export type Ctx = { now: Date; nome: string; tz: string };
export type Handoff = { motivo: string; urgente?: boolean };
export type Result = { state: State; reply: string; handoff?: Handoff };

/** Marca presente na mensagem final; o agente usa para abrir uma conversa nova depois dela. */
export const MARCA_FIM = 'Simulação: nada foi agendado';

export const novoEstado = (): State => ({ saudou: false, precoInformado: false, ofertado: false, aceitou: false, falhas: 0, fim: false });

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const SAUDACAO = (h: number) => (h >= 5 && h < 12 ? 'Bom dia' : h >= 12 && h < 18 ? 'Boa tarde' : 'Boa noite');

// ---------- datas (fuso da clínica) ----------
function hoje(ctx: Ctx) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: ctx.tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(ctx.now).map((x) => [x.type, x.value]));
  return { ymd: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour) % 24 };
}
const toDate = (ymd: string) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const toYmd = (d: Date) => d.toISOString().slice(0, 10);
const addDias = (ymd: string, n: number) => { const d = toDate(ymd); d.setUTCDate(d.getUTCDate() + n); return toYmd(d); };
const diaSemana = (ymd: string) => toDate(ymd).getUTCDay(); // 0 = domingo
const fmtData = (ymd: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(toDate(ymd));

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
const SIM = /^(sim|s|pode|pode sim|pode reservar|quero|quero sim|ok|isso|isso mesmo|confirmo|confirma|fechado|combinado|bora|claro|por favor|pode ser|ta bom|tudo bem)\b/;
const NAO = /^(nao|n|nao quero|nao obrigad|outro|outra|prefiro outro|prefiro outra)\b/;
const SO_CUMPRIMENTO = /^(oi+|ola|ola+ boa|e ai|ei|bom dia|boa tarde|boa noite|teste|ola teste|agente de ia|amanda|atendimento|tudo bem\??|oie)[\s!.,?]*(teste|amanda|tudo bem\??)?[\s!.,?]*$/;

const unidadeDoTexto = (t: string): Unidade | undefined => (/guama/.test(t) ? 'Guamá' : /telegrafo/.test(t) ? 'Telégrafo' : undefined);
const cpfDoTexto = (t: string): string | undefined => { const m = t.match(/\b(\d{3})\.?(\d{3})\.?(\d{3})-?(\d{2})\b/); return m ? m.slice(1).join('') : undefined; };

const hora = (hhmm: string) => { const [h, m] = hhmm.split(':'); return m === '00' ? `${Number(h)}h` : `${Number(h)}h${m}`; };
const pick = <T,>(arr: T[], n: number) => arr[n % arr.length];

// ---------- núcleo ----------
export function step(prev: State, texto: string, ctx: Ctx, n = 0): Result {
  // depois de uma jornada concluída, uma nova mensagem abre outra jornada (mantém a saudação já feita)
  const s: State = prev.fim ? { ...novoEstado(), saudou: true } : { ...prev };
  const t = norm(texto);
  const h = hoje(ctx);
  const nome = ctx.nome;
  const abertura = s.saudou ? '' : `${SAUDACAO(h.hora)}! Sou a Amanda, da Clinex.`;
  const junta = (...partes: (string | undefined | false)[]) => partes.filter(Boolean).join(abertura && partes[0] === abertura ? '\n' : ' ');
  const out = (reply: string, handoff?: Handoff): Result => { s.saudou = true; return { state: s, reply, handoff }; };

  // 1) segurança primeiro
  if (CRISE.test(t)) {
    return out(`Sinto muito que você esteja passando por isso${nome ? `, ${nome}` : ''}. Vou te colocar agora com alguém da nossa equipe para te ajudar. Se precisar conversar com alguém neste momento, o CVV atende 24 horas pelo 188, a ligação é gratuita. Você não precisa passar por isso sozinho.`, { motivo: 'PRIORIDADE: urgente. Paciente relatou possível crise de saúde mental.', urgente: true });
  }
  if (EMERGENCIA.test(t)) {
    return out(`${nome ? `${nome}, pelo` : 'Pelo'} que você descreveu, isso precisa de avaliação imediata. Por favor, procure agora o pronto-socorro mais próximo ou ligue 192. A Clinex faz atendimento agendado e não é o lugar certo para uma urgência. Fico à disposição depois, tá bem?`, { motivo: 'PRIORIDADE: urgente. Possível emergência clínica relatada pelo paciente.', urgente: true });
  }
  if (HUMANO.test(t)) {
    return out(junta(abertura, 'Claro, vou te passar para alguém da nossa equipe. Só um instante.'), { motivo: 'Paciente pediu atendimento humano.' });
  }

  // 2) extrai o que a mensagem traz
  const achado = SERVICOS.find((sv) => sv.palavras.test(t));
  if (achado && achado.id !== s.servico?.id) {
    s.servico = achado; s.unidade = achado.unidades.length === 1 ? achado.unidades[0] : undefined;
    s.precoInformado = false; s.ofertado = false; s.aceitou = false; s.data = undefined; s.turno = undefined; s.fim = false;
  }
  const un = unidadeDoTexto(t);
  let avisoUnidade = '';
  if (un && s.servico) {
    if (s.servico.unidades.includes(un)) s.unidade = un;
    else avisoUnidade = `${s.servico.nome} não tem agenda no ${un}, mas está disponível no ${s.servico.unidades[0]}.`;
  }
  if (s.servico && !s.unidade && s.servico.unidades.length > 1 && /tanto faz|qualquer|a mais proxima|o mais proximo/.test(t)) s.unidade = s.servico.unidades[0];

  const tn = lerTurno(t);
  const d = lerData(t, ctx);
  let aviso = avisoUnidade;
  if (s.servico) {
    if (d) { s.data = d; s.ofertado = false; s.aceitou = false; }
    if (tn === 'noite') aviso = aviso || 'Nosso atendimento é pela manhã e à tarde.';
    else if (tn) { s.turno = tn; s.ofertado = false; s.aceitou = false; }
  }
  // regras de agenda do exemplo: domingo fechado, sábado só de manhã, período de hoje já passado
  if (s.data) {
    const dow = diaSemana(s.data);
    if (dow === 0) { aviso = 'Aos domingos não há atendimento.'; s.data = undefined; }
    else if (dow === 6 && s.turno === 'tarde') { aviso = 'Aos sábados atendemos só pela manhã.'; s.turno = 'manhã'; }
    else if (dow === 6 && !s.turno) s.turno = 'manhã';
    else if (s.data === h.ymd && ((s.turno === 'manhã' && h.hora >= 11) || (s.turno === 'tarde' && h.hora >= 17))) { aviso = 'Esse período de hoje já passou.'; s.data = undefined; s.turno = undefined; }
  }
  const cpf = s.aceitou ? cpfDoTexto(t) : undefined;
  if (cpf) s.cpf = cpf;
  if (s.ofertado && !s.aceitou && !d && !tn) {
    if (SIM.test(t)) s.aceitou = true;
    else if (NAO.test(t)) { s.ofertado = false; s.data = undefined; s.turno = undefined; aviso = aviso || 'Sem problema.'; }
  }

  // 3) decide a resposta (uma pergunta por mensagem)
  const sv = s.servico;
  if (!sv) {
    const cumprimento = SO_CUMPRIMENTO.test(t);
    if (!cumprimento) s.falhas += 1;
    if (s.falhas >= 2) return out(junta(abertura, 'Vou passar você para alguém da nossa equipe continuar o atendimento. Só um instante.'), { motivo: 'Não foi possível identificar o serviço pedido pelo paciente.' });
    if (!s.saudou && cumprimento) return out(`${abertura} Como posso te ajudar?`);
    if (cumprimento) return out('Qual consulta ou exame você precisa?');
    return out(junta(abertura, 'Não consegui identificar o serviço. Me diz o nome da especialidade ou do exame, por exemplo cardiologia, dermatologia ou ultrassom.'));
  }

  const precoFrase = sv.tipo === 'consulta'
    ? `A consulta custa ${sv.preco}, no dinheiro ou Pix${sv.retornoDias ? `, e dá direito a retorno em até ${sv.retornoDias} dias` : ''}.`
    : `O exame custa ${sv.preco}, no dinheiro ou Pix.`;

  const partes: string[] = [];
  if (abertura) partes.push(abertura);
  if (aviso) partes.push(aviso);

  // consulta de agenda + unidades + preço, antes de qualquer pergunta de dia ou unidade
  if (!s.precoInformado) {
    s.precoInformado = true;
    partes.push(sv.unidades.length === 1
      ? `${sv.nome} está disponível no ${sv.unidades[0]}. ${precoFrase}`
      : `${sv.nome} está disponível no ${sv.unidades.join(' e no ')}, com o mesmo valor. ${precoFrase}`);
  }

  const pergunta = (txt: string) => out([...partes, txt].join(abertura && partes.length === 1 ? ' ' : '\n'));

  if (!s.unidade) return pergunta(prev.precoInformado && prev.servico?.id === sv.id ? `Para eu seguir, qual unidade você prefere: ${sv.unidades.join(' ou ')}?` : 'Em qual unidade fica melhor para você?');
  if (!s.data && !s.turno) return pergunta('Qual dia e horário ficam melhores para você?');
  if (!s.data) return pergunta('Qual dia fica melhor para você?');
  if (!s.turno) return pergunta(`Para ${fmtData(s.data)}, você prefere de manhã ou à tarde?`);

  if (!s.ofertado) {
    s.ofertado = true;
    return pergunta(`Há vaga de ${sv.nome} no ${s.unidade} em ${fmtData(s.data)}, no período da ${s.turno}. Os atendimentos começam às ${hora(INICIO_PERIODO[s.turno])}, por ordem de chegada. Recomendamos chegar cedo. Posso reservar para você?`);
  }
  if (!s.aceitou) return pergunta(pick(['Posso reservar essa vaga para você?', 'Quer que eu reserve essa vaga?'], n));
  if (!s.cpf) {
    const temDigitos = /\d{2,}/.test(t);
    if (temDigitos) return pergunta('Não consegui ler o CPF. Pode me enviar os 11 números?');
    return pergunta(pick(['Fechado. Para reservar, qual o CPF do paciente?', 'Combinado. Qual o CPF do paciente para eu fazer a reserva?'], n));
  }
  s.fim = true;
  return out(`Sua vaga de ${sv.nome} está confirmada para ${fmtData(s.data)}, na unidade ${s.unidade}. Os atendimentos começam às ${hora(INICIO_PERIODO[s.turno])}, por ordem de chegada. Recomendamos chegar cedo.\n(${MARCA_FIM} de verdade.)`);
}

/** Reprocessa todas as mensagens do paciente, na ordem, e devolve o resultado da última. */
export function responder(textos: string[], ctx: Ctx): Result | undefined {
  let state = novoEstado();
  let last: Result | undefined;
  textos.forEach((tx, i) => { last = step(state, tx, ctx, i); state = last.state; });
  return last;
}
