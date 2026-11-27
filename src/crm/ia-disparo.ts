import { paraE164Brasil } from '../integrations/inovstar.js';
import { aplicar, diaDoInstante, diffDias, hojeDe, horaDe, proximoPasso, type Lead } from './motor.js';
import { LIMITES, PASSOS, type PassoDef } from './modelo.js';
import type { Estado } from './banco.js';
import { ANTIGOS_POR_RODADA, antigosPadrao, enviadosAntigosHoje, motivoForaDaBase, recebeuPelaBaseAntiga, type Conferidor } from './base-antiga.js';
import type { ConfigAuto, DetalheRodada, DisparoAutoCfg, GatilhoCfg, ModoAuto, PausaCfg, Rodada } from './disparo-auto-tipos.js';
import { DisparoError, MODELOS, checarEnvio, disparoAtivo, ehEnvio, enviarModelo, modelosParaLead } from './whatsapp.js';

/**
 * IA de disparo: o agente ATIVO do CRM. Faz sozinha os envios da cadência do guia, no horário de cada passo, sem ninguém clicar.
 * (O agente receptivo, Amanda, é outro sistema e não entra aqui.)
 *
 * O que ela envia: só passos com mensagem pronta e todas as variáveis conhecidas (1º contato, nova tentativa, desconto,
 * encerramento e no-show), no DIA em que vencem e a partir do horário do gatilho. Passo atrasado não é enviado sozinho: a
 * cadência já passou e a decisão é de uma pessoa (exceção, se ligada: a base antiga, ver base-antiga.ts). Cada envio passa pelas MESMAS travas do envio manual (checarEnvio:
 * janela 8h às 19h, 2 contatos por dia, já foi à recepção, mesmo modelo 24 h, limite do dia, lista de teste).
 *
 * Tudo que o gerente ajusta (IA Manager) fica em ConfigAuto: liga/desliga de cada gatilho, horário, condições (valor, unidades),
 * parâmetros da mensagem, janela e dias da semana, pausas (feriados), limites e o disjuntor. O guia só pode ser ESTREITADO:
 * nunca dá para enviar fora de 8h às 19h.
 *
 * Modos (guardados no CRM, por quem tem acesso): desligado, simulacao (só leads fictícios do laboratório, ver ia-laboratorio.ts), sombra (decide e anota o que enviaria, sem enviar) e ligado.
 * DISPARO_AUTO=desligado no ambiente força desligado, qualquer que seja o modo.
 */

/** Passos que a IA pode enviar sozinha (todos têm hora no guia e um modelo aprovado), na ordem da cadência. */
export const GATILHOS_AUTO = ['primeiro', 'tentativa', 'desconto', 'encerramento', 'noshow'] as const;
export const PASSOS_AUTO = new Set<string>(GATILHOS_AUTO);
export const ehHora = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

// ------------------------------------------------------------------------------------------------ configuração

export function configPadrao(): ConfigAuto {
  const gatilhos: Record<string, GatilhoCfg> = {};
  for (const id of GATILHOS_AUTO) {
    const p = PASSOS.find((x) => x.id === id)!;
    gatilhos[id] = { ativo: true, hora: p.hora ?? '08:30', ...(id === 'desconto' ? { desconto: '10%' as const } : {}), ...(id === 'tentativa' ? { prazo: 'esta semana' as const } : {}) };
  }
  return {
    janela: { inicio: LIMITES.janelaInicioH, fim: LIMITES.janelaFimH }, diasSemana: [0, 1, 2, 3, 4, 5, 6],
    limites: { porRodada: Number(process.env.DISPARO_AUTO_POR_RODADA) || 20, porDia: 1000 },
    pausas: [], antigos: antigosPadrao(), disjuntor: { ativo: true, erros: 3 }, gatilhos, historico: [],
  };
}

const ehDia = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const num = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined);

/** A configuração em vigor: o que o gerente guardou por cima dos padrões (o que faltar ou estiver inválido volta ao padrão). */
export function configAuto(estado: Estado): ConfigAuto {
  const p = configPadrao(), g = (estado.disparoAuto?.config ?? {}) as Partial<ConfigAuto>;
  const gat: Record<string, GatilhoCfg> = {};
  for (const id of GATILHOS_AUTO) {
    const d = p.gatilhos[id], x = (g.gatilhos?.[id] ?? {}) as Partial<GatilhoCfg>;
    gat[id] = {
      ativo: typeof x.ativo === 'boolean' ? x.ativo : d.ativo, hora: ehHora(x.hora) ? x.hora : d.hora,
      ...(num(x.valorMin, 0, 1e7) !== undefined ? { valorMin: x.valorMin } : {}), ...(num(x.valorMax, 0, 1e7) !== undefined ? { valorMax: x.valorMax } : {}),
      ...(Array.isArray(x.unidades) && x.unidades.length ? { unidades: x.unidades.filter((u) => typeof u === 'string') } : {}),
      ...(id === 'desconto' ? { desconto: x.desconto === '5%' ? '5%' as const : '10%' as const } : {}),
      ...(id === 'tentativa' ? { prazo: x.prazo === 'hoje' || x.prazo === 'este mês' ? x.prazo : 'esta semana' as const } : {}),
    };
  }
  const j = g.janela;
  const a = (g.antigos ?? {}) as Partial<ConfigAuto['antigos']>, inicio = num(a.inicio, 8, 18) ?? p.antigos.inicio, fim = num(a.fim, 9, 19) ?? p.antigos.fim;
  const antigos = { ativo: a.ativo === true, porDia: num(a.porDia, 1, 200) ?? p.antigos.porDia, dias: num(a.dias, 2, 60) ?? p.antigos.dias, ...(inicio < fim ? { inicio, fim } : { inicio: p.antigos.inicio, fim: p.antigos.fim }) };
  return {
    antigos,
    janela: j && num(j.inicio, p.janela.inicio, 18) !== undefined && num(j.fim, 9, p.janela.fim) !== undefined && j.inicio < j.fim ? { inicio: j.inicio, fim: j.fim } : p.janela,
    diasSemana: Array.isArray(g.diasSemana) ? [...new Set(g.diasSemana.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : p.diasSemana,
    limites: { porRodada: num(g.limites?.porRodada, 1, 200) ?? p.limites.porRodada, porDia: num(g.limites?.porDia, 1, 5000) ?? p.limites.porDia },
    pausas: Array.isArray(g.pausas) ? g.pausas.filter((x) => x && ehDia(x.de) && ehDia(x.ate) && x.de <= x.ate).map((x) => ({ id: String(x.id ?? x.de), de: x.de, ate: x.ate, motivo: String(x.motivo ?? '').slice(0, 80) })) : [],
    disjuntor: { ativo: typeof g.disjuntor?.ativo === 'boolean' ? g.disjuntor.ativo : true, erros: num(g.disjuntor?.erros, 1, 20) ?? p.disjuntor.erros },
    gatilhos: gat, historico: Array.isArray(g.historico) ? g.historico.slice(0, 40) : [],
  };
}

const erroConfig = (m: string) => new DisparoError('config', m, 400);
/** Valida o que veio da tela e devolve a configuração completa e normalizada. Lança DisparoError com a mensagem pronta para a tela. */
export function validarConfigAuto(entrada: unknown, atual: ConfigAuto): ConfigAuto {
  if (!entrada || typeof entrada !== 'object') throw erroConfig('Configuração inválida.');
  const e = entrada as Partial<ConfigAuto>, out: ConfigAuto = JSON.parse(JSON.stringify(atual));
  if (e.janela) {
    const { inicio, fim } = e.janela;
    if (!Number.isInteger(inicio) || !Number.isInteger(fim)) throw erroConfig('A janela precisa de horas inteiras.');
    if (inicio < LIMITES.janelaInicioH || fim > LIMITES.janelaFimH) throw erroConfig(`O guia só permite contato entre ${LIMITES.janelaInicioH}h e ${LIMITES.janelaFimH}h: a IA pode estreitar a janela, nunca ampliar.`);
    if (inicio >= fim) throw erroConfig('O início da janela precisa ser antes do fim.');
    out.janela = { inicio, fim };
  }
  if (e.diasSemana) {
    if (!Array.isArray(e.diasSemana) || e.diasSemana.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw erroConfig('Dias da semana inválidos.');
    if (!e.diasSemana.length) throw erroConfig('Deixe pelo menos um dia da semana ligado (para pausar tudo, use o botão Power).');
    out.diasSemana = [...new Set(e.diasSemana)].sort();
  }
  if (e.limites) {
    if (e.limites.porRodada !== undefined) { const v = num(e.limites.porRodada, 1, 200); if (v === undefined) throw erroConfig('O máximo por rodada vai de 1 a 200.'); out.limites.porRodada = v; }
    if (e.limites.porDia !== undefined) { const v = num(e.limites.porDia, 1, 5000); if (v === undefined) throw erroConfig('O máximo por dia vai de 1 a 5000.'); out.limites.porDia = v; }
  }
  if (e.pausas) {
    if (!Array.isArray(e.pausas) || e.pausas.length > 40) throw erroConfig('Pausas inválidas (no máximo 40).');
    out.pausas = e.pausas.map((x: PausaCfg, i) => {
      if (!ehDia(x?.de) || !ehDia(x?.ate)) throw erroConfig(`Pausa ${i + 1}: informe as datas de início e fim.`);
      if (x.de > x.ate) throw erroConfig(`Pausa ${i + 1}: o início é depois do fim.`);
      return { id: String(x.id || `${x.de}-${i}`), de: x.de, ate: x.ate, motivo: String(x.motivo ?? '').trim().slice(0, 80) };
    });
  }
  if (e.antigos) {
    const x = e.antigos, o = out.antigos;
    if (x.ativo !== undefined) o.ativo = !!x.ativo;
    if (x.porDia !== undefined) { const v = num(x.porDia, 1, 200); if (v === undefined) throw erroConfig('Base antiga: de 1 a 200 envios por dia.'); o.porDia = v; }
    if (x.dias !== undefined) { const v = num(x.dias, 2, 60); if (v === undefined) throw erroConfig('Base antiga: orçamentos de 2 a 60 dias atrás.'); o.dias = v; }
    if (x.inicio !== undefined) o.inicio = x.inicio;
    if (x.fim !== undefined) o.fim = x.fim;
    if (!Number.isInteger(o.inicio) || !Number.isInteger(o.fim) || o.inicio < LIMITES.janelaInicioH || o.fim > LIMITES.janelaFimH || o.inicio >= o.fim) throw erroConfig(`Base antiga: o horário precisa ficar entre ${LIMITES.janelaInicioH}h e ${LIMITES.janelaFimH}h, com o início antes do fim.`);
  }
  if (e.disjuntor) {
    if (e.disjuntor.ativo !== undefined) out.disjuntor.ativo = !!e.disjuntor.ativo;
    if (e.disjuntor.erros !== undefined) { const v = num(e.disjuntor.erros, 1, 20); if (v === undefined) throw erroConfig('O disjuntor aceita de 1 a 20 erros seguidos.'); out.disjuntor.erros = v; }
  }
  if (e.gatilhos) {
    for (const [id, x] of Object.entries(e.gatilhos)) {
      if (!PASSOS_AUTO.has(id)) throw erroConfig(`Gatilho desconhecido: ${id}.`);
      const g = out.gatilhos[id], nome = PASSOS.find((p) => p.id === id)!.rotulo;
      if (x.ativo !== undefined) g.ativo = !!x.ativo;
      if (x.hora !== undefined) {
        if (!ehHora(x.hora)) throw erroConfig(`${nome}: horário inválido (use HH:MM).`);
        const h = Number(x.hora.slice(0, 2));
        if (h < LIMITES.janelaInicioH || h >= LIMITES.janelaFimH) throw erroConfig(`${nome}: o horário precisa ficar entre ${LIMITES.janelaInicioH}:00 e ${LIMITES.janelaFimH - 1}:59 (regra do guia).`);
        g.hora = x.hora;
      }
      for (const k of ['valorMin', 'valorMax'] as const) {
        if (!(k in x)) continue;
        if (x[k] === undefined || x[k] === null || (x[k] as unknown) === '') delete g[k];
        else { const v = num(x[k], 0, 1e7); if (v === undefined) throw erroConfig(`${nome}: valor inválido.`); g[k] = v; }
      }
      if (g.valorMin !== undefined && g.valorMax !== undefined && g.valorMin > g.valorMax) throw erroConfig(`${nome}: o valor mínimo é maior que o máximo.`);
      if ('unidades' in x) { const u = Array.isArray(x.unidades) ? x.unidades.filter((n) => typeof n === 'string' && n.trim()).map((n) => n.trim()) : []; if (u.length) g.unidades = u; else delete g.unidades; }
      if (id === 'desconto' && x.desconto !== undefined) { if (x.desconto !== '10%' && x.desconto !== '5%') throw erroConfig('Desconto: escolha 10% ou 5%.'); g.desconto = x.desconto; }
      if (id === 'tentativa' && x.prazo !== undefined) { if (!['hoje', 'esta semana', 'este mês'].includes(x.prazo)) throw erroConfig('Prazo inválido.'); g.prazo = x.prazo; }
    }
  }
  return out;
}

/** Descreve o que mudou, em português, para o histórico da tela. */
export function resumoDaMudanca(antes: ConfigAuto, depois: ConfigAuto): string {
  const m: string[] = [];
  for (const id of GATILHOS_AUTO) {
    const a = antes.gatilhos[id], d = depois.gatilhos[id], nome = PASSOS.find((p) => p.id === id)!.rotulo;
    if (a.ativo !== d.ativo) m.push(`${nome} ${d.ativo ? 'ligado' : 'desligado'}`);
    if (a.hora !== d.hora) m.push(`${nome}: horário ${a.hora} → ${d.hora}`);
    if (JSON.stringify([a.valorMin, a.valorMax, a.unidades]) !== JSON.stringify([d.valorMin, d.valorMax, d.unidades])) m.push(`${nome}: condições alteradas`);
    if (a.desconto !== d.desconto) m.push(`${nome}: desconto ${d.desconto}`);
    if (a.prazo !== d.prazo) m.push(`${nome}: prazo "${d.prazo}"`);
  }
  if (antes.janela.inicio !== depois.janela.inicio || antes.janela.fim !== depois.janela.fim) m.push(`janela ${antes.janela.inicio}h–${antes.janela.fim}h → ${depois.janela.inicio}h–${depois.janela.fim}h`);
  if (JSON.stringify(antes.diasSemana) !== JSON.stringify(depois.diasSemana)) m.push('dias da semana alterados');
  if (antes.limites.porRodada !== depois.limites.porRodada || antes.limites.porDia !== depois.limites.porDia) m.push(`limites: ${depois.limites.porRodada} por rodada, ${depois.limites.porDia} por dia`);
  if (JSON.stringify(antes.pausas) !== JSON.stringify(depois.pausas)) m.push(`pausas: ${depois.pausas.length}`);
  if (JSON.stringify(antes.antigos) !== JSON.stringify(depois.antigos)) m.push(depois.antigos.ativo ? `base antiga ligada: ${depois.antigos.porDia} por dia, orçamentos de até ${depois.antigos.dias} dias, ${depois.antigos.inicio}h–${depois.antigos.fim}h` : 'base antiga desligada');
  if (JSON.stringify(antes.disjuntor) !== JSON.stringify(depois.disjuntor)) m.push(`disjuntor ${depois.disjuntor.ativo ? `em ${depois.disjuntor.erros} erros` : 'desligado'}`);
  return m.join(' · ');
}

/** Guarda a configuração nova (já validada) e anota quem mudou o quê. Devolve a configuração salva. */
export function salvarConfigAuto(estado: Estado, nova: ConfigAuto, quem: string, agora: Date): ConfigAuto {
  const antes = configAuto(estado), resumo = resumoDaMudanca(antes, nova);
  const historico = resumo ? [{ quando: agora.toISOString(), quem, resumo }, ...antes.historico].slice(0, 40) : antes.historico;
  estado.disparoAuto = { ...(estado.disparoAuto ?? { modo: 'desligado' }), config: { ...nova, historico } };
  return configAuto(estado);
}
export function anotarNoHistorico(estado: Estado, quem: string, resumo: string, agora: Date) {
  const c = configAuto(estado);
  estado.disparoAuto = { ...(estado.disparoAuto ?? { modo: 'desligado' }), config: { ...c, historico: [{ quando: agora.toISOString(), quem, resumo }, ...c.historico].slice(0, 40) } };
}

// ------------------------------------------------------------------------------------------------ modos

export const modoDisparoAuto = (estado: Estado): ModoAuto => {
  if (process.env.DISPARO_AUTO === 'desligado') return 'desligado';
  return estado.disparoAuto?.modo ?? 'desligado';
};

export function definirModoDisparoAuto(estado: Estado, modo: ModoAuto, quem: string, agora: Date): DisparoAutoCfg {
  if (!['desligado', 'simulacao', 'sombra', 'ligado'].includes(modo)) throw new DisparoError('modo', 'Modo inválido.', 400);
  const antes = estado.disparoAuto?.modo ?? 'desligado';
  estado.disparoAuto = { ...(estado.disparoAuto ?? { modo }), modo, alteradoPor: quem, alteradoEm: agora.toISOString() };
  if (antes !== modo) anotarNoHistorico(estado, quem, `IA ${modo === 'desligado' ? 'desligada' : modo === 'simulacao' ? 'em modo simulação' : modo === 'sombra' ? 'em modo sombra' : 'ligada'}`, agora);
  return estado.disparoAuto;
}

// ------------------------------------------------------------------------------------------------ avaliação de um lead

export type Check = { id: string; rotulo: string; ok: boolean; detalhe: string; falha?: 'espera' | 'pulado' };
export type Avaliacao =
  | { tipo: 'pronto'; passo: PassoDef; modelo: string; parametros: string[]; msg: number; antigo?: boolean }
  | { tipo: 'espera'; motivo: string; passo: PassoDef; antigo?: boolean }
  | { tipo: 'pulado'; motivo: string; passo: PassoDef; antigo?: boolean };

const minutos = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const diaDaSemana = (dia: string) => new Date(`${dia}T12:00:00Z`).getUTCDay();
const reais = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const NOMES_DIA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/**
 * Todas as checagens que decidem se a IA envia ao lead agora, na ordem. Uma fonte só: a rodada usa a primeira que falha e o
 * simulador da tela mostra a lista inteira. aplicavel=false: o lead não tem passo automático (nada a dizer sobre ele).
 */
export function checagens(estado: Estado, l: Lead, agora: Date, cfg: ConfigAuto, opcoes: { ignorarLista?: boolean } = {}) {
  const checks: Check[] = [];
  const add = (id: string, rotulo: string, ok: boolean, detalhe: string, falha?: 'espera' | 'pulado') => { checks.push({ id, rotulo, ok, detalhe, ...(ok ? {} : { falha: falha ?? 'pulado' }) }); return ok; };
  const hoje = hojeDe(agora), t = horaDe(agora);
  const sai = (extra: Partial<{ passo: PassoDef; modelo: string; parametros: string[]; msg: number; aplicavel: boolean; antigo: boolean }> = {}) => ({ checks, aplicavel: true, ...extra });
  if (l.demo) { add('lead', 'Lead real', false, 'Lead de exemplo: a IA nunca envia'); return { checks, aplicavel: false as const }; }
  // contato que veio do popup do WhatsApp do site: a pessoa já está indo para o WhatsApp; o primeiro contato é da equipe, nunca da IA de disparo
  if (l.fonte === 'site') { add('lead', 'Lead real', false, 'Lead do site (popup do WhatsApp): a equipe faz o primeiro contato, a IA não envia'); return { checks, aplicavel: false as const }; }
  add('lead', 'Lead real', true, 'Lead do CRM');
  const px = proximoPasso(l, hoje);
  if (!px) { add('passo', 'Tem um passo da cadência', false, 'Sem próximo passo (lead encerrado ou fora da cadência)'); return { checks, aplicavel: false as const }; }
  const passo = px.passo, msg = passo.msg, modelo = MODELOS.find((m) => m.msg === msg);
  if (!PASSOS_AUTO.has(passo.id) || !msg || !modelo) { add('passo', 'Passo que a IA envia', false, `O próximo passo (${passo.rotulo}) é manual`); return { checks, aplicavel: false as const }; }
  add('passo', 'Passo que a IA envia', true, `${passo.rotulo} · Msg ${msg}`);
  const g = cfg.gatilhos[passo.id];
  add('optout', 'Aceita receber mensagens', !l.semDisparoAuto, l.semDisparoAuto ? 'Pediu para não receber mensagens' : 'Não pediu para parar');
  add('gatilho', 'Gatilho ligado', g.ativo, g.ativo ? `${passo.rotulo} está ligado` : `${passo.rotulo} está desligado no IA Manager`);
  if (px.situacao === 'futura') { add('vence', 'Passo vence hoje', false, `Só vence em ${px.vence}`, 'espera'); return { checks, aplicavel: false as const, passo, modelo: modelo.id, msg }; }
  const atrasadoAberto = px.situacao === 'atrasada' && passo.id === 'primeiro' && cfg.antigos.ativo;
  const foraDaBase = atrasadoAberto ? motivoForaDaBase(estado, l, hoje, cfg.antigos) : null;
  const antigo = atrasadoAberto && !foraDaBase;
  if (passo.id !== 'noshow' && recebeuPelaBaseAntiga(l)) add('vence', 'Passo vence hoje', false, 'Base antiga: a IA manda só a primeira mensagem, a equipe acompanha');
  else if (antigo) add('vence', 'Passo vence hoje (ou base antiga)', true, `Base antiga: orçamento de ${diffDias(l.d0, hoje)} dias atrás`);
  else add('vence', 'Passo vence hoje', px.situacao === 'hoje', px.situacao === 'hoje' ? 'Vence hoje' : foraDaBase ?? 'Passo atrasado: só uma pessoa decide');
  const jaEnviado = l.eventos.some((e) => e.tipo === 'contato' && e.passo === passo.id && e.fase === l.faseId && e.canal === 'whatsapp');
  add('whatsapp', 'WhatsApp deste passo ainda não enviado', !jaEnviado, jaEnviado ? 'WhatsApp deste passo já foi enviado' : 'Ainda não enviado');
  const dow = diaDaSemana(hoje);
  add('dia', 'Dia da semana permitido', cfg.diasSemana.includes(dow), cfg.diasSemana.includes(dow) ? `A IA envia na ${NOMES_DIA[dow]}` : `A IA não envia na ${NOMES_DIA[dow]}`);
  const pausa = cfg.pausas.find((x) => hoje >= x.de && hoje <= x.ate);
  add('pausa', 'Sem pausa programada', !pausa, pausa ? `Em pausa${pausa.motivo ? `: ${pausa.motivo}` : ''}` : 'Nenhuma pausa hoje');
  const hh = g.hora, chegou = t.h * 60 + t.m >= minutos(hh);
  if (antigo) {
    const a = cfg.antigos, noHorario = dow >= 1 && dow <= 5 && t.h >= a.inicio && t.h < a.fim, cota = enviadosAntigosHoje(estado, hoje) < a.porDia;
    add('hora', 'Horário da base antiga', noHorario, noHorario ? `Segunda a sexta, ${a.inicio}h às ${a.fim}h` : `Base antiga: só de segunda a sexta, das ${a.inicio}h às ${a.fim}h`, 'espera');
    add('cota', 'Cota do dia da base antiga', cota, cota ? `Até ${a.porDia} por dia` : `Base antiga: os ${a.porDia} de hoje já saíram`, 'espera');
  } else add('hora', 'Chegou o horário do gatilho', chegou, chegou ? `Depois das ${hh}` : `Aguardando o horário do passo (${hh})`, 'espera');
  const dentro = t.h >= cfg.janela.inicio && t.h < cfg.janela.fim;
  add('janela', 'Dentro da janela da IA', dentro, dentro ? `Agora está entre ${cfg.janela.inicio}h e ${cfg.janela.fim}h` : `Fora da janela da IA (${cfg.janela.inicio}h–${cfg.janela.fim}h)`, 'espera');
  const vOk = (g.valorMin === undefined || l.valor >= g.valorMin) && (g.valorMax === undefined || l.valor <= g.valorMax);
  add('valor', 'Valor dentro da condição', vOk, vOk ? (g.valorMin !== undefined || g.valorMax !== undefined ? `${reais(l.valor)} está no intervalo` : 'Sem restrição de valor') : `${reais(l.valor)} fora do intervalo (${g.valorMin !== undefined ? 'mín. ' + reais(g.valorMin) : ''}${g.valorMin !== undefined && g.valorMax !== undefined ? ' · ' : ''}${g.valorMax !== undefined ? 'máx. ' + reais(g.valorMax) : ''})`);
  const uOk = !g.unidades?.length || g.unidades.some((u) => norm(u) === norm(l.unidade ?? ''));
  add('unidade', 'Unidade permitida', uOk, uOk ? (g.unidades?.length ? `${l.unidade} está na lista` : 'Todas as unidades') : `${l.unidade || 'Sem unidade'} não está na lista (${g.unidades!.join(', ')})`);
  const tel = !!paraE164Brasil(l.telefone);
  add('telefone', 'Telefone válido', tel, tel ? 'Telefone com DDD' : 'Telefone inválido');
  // variáveis do texto: o padrão do lead, com os parâmetros que o gerente escolheu
  const v = modelosParaLead(estado, l).find((m) => m.id === modelo.id)!;
  const pct = g.desconto === '5%' ? 5 : 10;
  const parametros = v.variaveis.map((x) => {
    if (x.id === 'atendente' && !x.valor) return 'a equipe';
    if (x.id === 'desconto') return g.desconto ?? '10%';
    if (x.id === 'prazo') return g.prazo ?? 'esta semana';
    if (x.id === 'valorComDesconto') return reais(Math.round(l.valor * (100 - pct)) / 100);
    return x.valor.trim();
  });
  const faltam = v.variaveis.filter((x, i) => !parametros[i]).map((x) => x.rotulo);
  add('dados', 'Dados da mensagem completos', !faltam.length, faltam.length ? `Faltam dados: ${faltam.join(', ')}` : 'Todas as variáveis preenchidas');
  const bloqueio = checarEnvio(estado, l, modelo.id, agora, { ignorarLista: opcoes.ignorarLista });
  add('travas', 'Travas do envio (guia e limites)', !bloqueio, bloqueio ? bloqueio.message : 'Passa nas travas do guia');
  return sai({ passo, modelo: modelo.id, parametros, msg, antigo });
}

/** O que fazer com este lead agora. null = não tem passo automático (nada a dizer sobre ele). */
export function avaliarLead(estado: Estado, l: Lead, agora: Date, opcoes: { ignorarLista?: boolean } = {}, cfg = configAuto(estado)): Avaliacao | null {
  const r = checagens(estado, l, agora, cfg, opcoes);
  if (!r.aplicavel || !('passo' in r) || !r.passo) return null;
  const falhou = r.checks.find((c) => !c.ok);
  const antigo = 'antigo' in r && r.antigo === true ? true : undefined;
  if (falhou) return { tipo: falhou.falha === 'espera' ? 'espera' : 'pulado', motivo: falhou.detalhe, passo: r.passo, antigo };
  return { tipo: 'pronto', passo: r.passo, modelo: r.modelo!, parametros: r.parametros!, msg: r.msg!, antigo };
}

/** Quem a IA enviaria agora, na ordem do guia (no show primeiro, depois leads novos, depois o maior valor), mais quem ficou de fora e por quê. */
export function fila(estado: Estado, agora: Date, opcoes: { ignorarLista?: boolean } = {}, cfg = configAuto(estado)) {
  const hoje = hojeDe(agora);
  const itens: { lead: Lead; av: Avaliacao; prioridade: number }[] = [];
  for (const l of estado.leads) {
    const av = avaliarLead(estado, l, agora, opcoes, cfg);
    if (av) itens.push({ lead: l, av, prioridade: av.antigo ? 4 : proximoPasso(l, hoje)?.prioridade ?? 3 });
  }
  itens.sort((a, b) => a.prioridade - b.prioridade || (a.prioridade === 4 ? b.lead.d0.localeCompare(a.lead.d0) : 0) || b.lead.valor - a.lead.valor);
  return itens;
}

// ------------------------------------------------------------------------------------------------ a rodada

/** Códigos que param a rodada inteira (nada adianta tentar o próximo lead). */
const PARA_TUDO = new Set(['desligado', 'config', 'limite']);

export type OpcoesRodada = {
  modo?: ModoAuto;
  max?: number;
  /** chamado depois de cada envio: o chamador grava no banco antes do próximo (outra instância não pode ver o lead sem o envio) */
  gravar?: () => Promise<void>;
  /** base antiga: diz por que NÃO enviar a este lead (conferência no Clinilink). Sem ele, nada da base antiga é enviado de verdade. */
  conferirAntigo?: Conferidor;
};

/** Quantos envios a IA já fez hoje (todos os gatilhos). */
export function enviadosPelaIAHoje(estado: Estado, agora: Date): number {
  const hoje = hojeDe(agora);
  return estado.leads.reduce((s, l) => s + l.eventos.filter((e) => e.tipo === 'contato' && e.auto === true && ehEnvio(e.texto) && diaDoInstante(e.quando) === hoje).length, 0);
}

/** Uma rodada da IA. Quem chama (cron, botão "rodar agora") cuida de travar para não haver duas ao mesmo tempo. */
export async function rodarDisparoAuto(estado: Estado, agora: Date, opcoes: OpcoesRodada = {}): Promise<Rodada> {
  const modo = opcoes.modo ?? modoDisparoAuto(estado), cfg = configAuto(estado);
  const r: Rodada = { quando: agora.toISOString(), modo, avaliados: 0, enviados: 0, sombra: 0, erros: 0, pulados: {}, detalhes: [] };
  const conta = (m: string) => { r.pulados[m] = (r.pulados[m] ?? 0) + 1; };
  const grava = async () => { estado.disparoAuto = { ...(estado.disparoAuto ?? { modo: 'desligado' }), ultimaRodada: r }; if (opcoes.gravar) await opcoes.gravar(); };
  if (modo === 'desligado') { r.pulados['IA desligada'] = 1; await grava(); return r; }
  if (modo === 'simulacao') { r.pulados['Modo simulação: a IA só trabalha nos leads de teste do laboratório'] = 1; return r; } // não avalia nem grava nada: paciente real fica intocado
  if (modo === 'ligado' && !disparoAtivo()) { r.pulados['O disparo de WhatsApp está desligado neste ambiente (DISPARO_WHATSAPP)'] = 1; await grava(); return r; }

  const hoje = hojeDe(agora), max = opcoes.max ?? cfg.limites.porRodada;
  const jaHoje = enviadosPelaIAHoje(estado, agora);
  const itens = fila(estado, agora, { ignorarLista: modo === 'sombra' }, cfg);
  let feitos = 0, errosSeguidos = 0, antigosNaRodada = 0;
  const antigosHoje = enviadosAntigosHoje(estado, hoje);
  for (const { lead, av } of itens) {
    r.avaliados++;
    const base = { leadId: lead.id, nome: lead.nome, passo: av.passo.rotulo, msg: av.passo.msg };
    if (av.tipo !== 'pronto') { conta(av.motivo); if (r.detalhes.length < 60) r.detalhes.push({ ...base, resultado: 'pulado', motivo: av.motivo }); continue; }
    if (feitos >= max) { conta(`Fica para a próxima rodada (máximo de ${max} por rodada)`); continue; }
    if (modo === 'ligado' && jaHoje + r.enviados >= cfg.limites.porDia) { conta(`Limite diário da IA atingido (${cfg.limites.porDia})`); continue; }
    if (av.antigo) {
      if (antigosNaRodada >= ANTIGOS_POR_RODADA) { conta(`Base antiga: fica para a próxima rodada (${ANTIGOS_POR_RODADA} por vez)`); continue; }
      if (antigosHoje + antigosNaRodada >= cfg.antigos.porDia) { conta(`Base antiga: os ${cfg.antigos.porDia} de hoje já saíram`); continue; }
      const motivo = modo !== 'ligado' ? null : opcoes.conferirAntigo ? opcoes.conferirAntigo(lead) : 'Base antiga: não foi possível conferir no Clinilink, nada enviado';
      if (motivo) { conta(motivo); if (r.detalhes.length < 60) r.detalhes.push({ ...base, resultado: 'pulado', motivo }); continue; }
    }
    const det: DetalheRodada = { ...base, modelo: av.modelo, variaveis: av.parametros, resultado: 'sombra' };
    if (modo === 'sombra') {
      const sinal = `IA (sombra): enviaria a Msg ${av.msg} `;
      const jaAnotou = lead.eventos.some((e) => e.tipo === 'nota' && e.texto.startsWith(sinal) && diaDoInstante(e.quando) === hoje);
      if (!jaAnotou) aplicar(lead, { tipo: 'nota', texto: `${sinal}(${av.passo.rotulo}, modelo ${av.modelo}) agora, sem enviar. Variáveis: ${av.parametros.join(' | ')}`, atendente: 'IA' }, agora);
      r.sombra++; feitos++; if (av.antigo) antigosNaRodada++; r.detalhes.length < 60 && r.detalhes.push(det);
      continue;
    }
    try {
      await enviarModelo(estado, lead, { modelo: av.modelo, parametros: av.parametros, passo: av.passo.id, msg: av.msg, atendente: 'IA', auto: true }, agora);
      r.enviados++; feitos++; errosSeguidos = 0; det.resultado = 'enviado'; if (av.antigo) antigosNaRodada++;
      if (opcoes.gravar) await opcoes.gravar(); // o envio vai para o banco antes do próximo
    } catch (e) {
      const cod = e instanceof DisparoError ? e.codigo : 'erro';
      det.resultado = cod === 'envio' || cod === 'erro' ? 'erro' : 'pulado'; det.motivo = (e as Error).message;
      if (det.resultado === 'erro') { r.erros++; errosSeguidos++; } else conta(det.motivo);
      if (r.detalhes.length < 60) r.detalhes.push(det);
      if (cfg.disjuntor.ativo && errosSeguidos >= cfg.disjuntor.erros) {
        // disjuntor: a Inovstar está recusando em sequência, melhor parar do que insistir com pacientes reais
        estado.disparoAuto = { ...(estado.disparoAuto ?? { modo: 'desligado' }), modo: 'desligado', alteradoPor: 'Disjuntor', alteradoEm: agora.toISOString() };
        anotarNoHistorico(estado, 'Disjuntor', `IA desligada sozinha: ${errosSeguidos} envios seguidos recusados`, agora);
        conta(`Disjuntor: a IA se desligou depois de ${errosSeguidos} erros seguidos`);
        break;
      }
      if (PARA_TUDO.has(cod)) break;
      continue;
    }
    if (r.detalhes.length < 60) r.detalhes.push(det);
  }
  await grava();
  return r;
}
