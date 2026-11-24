import { estadoAtivo, travaCurta } from '../lib/estado.js';
import { atualizarLeadsDoBanco, bancoFora, estado, gravarAntesDeResponder, pronto, salvar, tentarVoltarAoBanco } from './banco.js';
import { diaDoInstante, hojeDe, horaDe } from './motor.js';
import { MENSAGENS, PASSOS } from './modelo.js';
import type { Janela } from './periodo.js';
import type { Rodada } from './disparo-auto-tipos.js';
import { GATILHOS_AUTO, NOMES_DIA, configAuto, enviadosPelaIAHoje, fila, modoDisparoAuto, rodarDisparoAuto } from './ia-disparo.js';
import { registrarResposta, ROTULO_INTENCAO, type RespostaRecebida } from './rastreio.js';
import { alinharCardsELeads } from './sincroniaCardLead.js';
import { chaveFone, ehEnvio, statusDisparo } from './whatsapp.js';

/** Liga o motor da IA (puro) ao CRM de verdade: banco, trava entre instâncias e gravação a cada envio. */

let emAndamento = false;

/** Uma rodada, sem nunca haver duas ao mesmo tempo (nem na mesma instância, nem em instâncias diferentes da Vercel). */
export async function rodarAgora(): Promise<{ rodada?: Rodada; pulou?: string }> {
  await pronto();
  await tentarVoltarAoBanco();
  if (bancoFora()) return { pulou: 'O banco não respondeu: a rodada foi adiada para não agir sobre dados não lidos.' };
  if (emAndamento) return { pulou: 'Já há uma rodada em andamento.' };
  emAndamento = true;
  try {
    if (estadoAtivo() && !(await travaCurta('crm:disparo-auto:trava', 4 * 60_000))) return { pulou: 'Já há uma rodada em andamento.' };
    await atualizarLeadsDoBanco(); // parte do que o banco tem agora: outra instância pode ter enviado ou pausado
    const rodada = await rodarDisparoAuto(estado, new Date(), { gravar: async () => { salvar(); await gravarAntesDeResponder(); } });
    // o que a IA fez (contato enviado) já leva o card para a coluna certa, sem esperar alguém abrir a tela
    if (rodada.enviados > 0) { const s = alinharCardsELeads(estado, new Date()); if (s.leads + s.cards) { salvar(); await gravarAntesDeResponder(); } }
    return { rodada };
  } finally { emAndamento = false; }
}

/** Resposta do paciente que chegou pelo webhook da Inovstar. Só registra; nunca responde. */
export async function registrarRespostaWhatsApp(r: RespostaRecebida) {
  await pronto();
  if (bancoFora()) return { registrado: false, motivo: 'banco fora do ar' };
  // o webhook recebe TODA mensagem de paciente (inclusive as do agente receptivo): só mexe no banco se o telefone for de um lead do CRM
  const chave = chaveFone(r.telefone);
  if (!estado.leads.some((l) => chaveFone(l.telefone) === chave)) return { registrado: false, motivo: 'telefone não é de nenhum lead do CRM' };
  await atualizarLeadsDoBanco();
  const res = registrarResposta(estado, r, new Date());
  if (res.registrado) { alinharCardsELeads(estado, new Date()); salvar(); await gravarAntesDeResponder(); } // a resposta do paciente também move o card
  return res;
}

/** Tudo da tela "IA Manager": o painel de controle da IA (Power, gatilhos, horários, condições, janela, limites, pausas, histórico). */
export function dadosManager(agora: Date) {
  const cfg = configAuto(estado), modo = modoDisparoAuto(estado), hoje = hojeDe(agora), t = horaDe(agora), minAgora = t.h * 60 + t.m;
  const itens = fila(estado, agora, { ignorarLista: true }, cfg);
  const ultima = estado.disparoAuto?.ultimaRodada ?? null;
  const gatilhos = GATILHOS_AUTO.map((id) => {
    const p = PASSOS.find((x) => x.id === id)!, g = cfg.gatilhos[id], meus = itens.filter((x) => x.av.passo.id === id);
    const motivos = new Map<string, number>(); for (const x of meus) if (x.av.tipo === 'pulado') motivos.set(x.av.motivo, (motivos.get(x.av.motivo) ?? 0) + 1);
    let enviadosHoje = 0, simuladosHoje = 0, respostasHoje = 0;
    for (const l of estado.leads) for (const e of l.eventos) {
      if (diaDoInstante(e.quando) !== hoje) continue;
      if (e.tipo === 'contato' && e.auto === true && e.passo === id && ehEnvio(e.texto)) enviadosHoje++;
      else if (e.tipo === 'nota' && e.texto.startsWith('IA (sombra)') && e.texto.includes(`Msg ${p.msg} `)) simuladosHoje++;
      else if (e.tipo === 'resposta' && e.msgId && e.msg === p.msg) respostasHoje++;
    }
    const msg = MENSAGENS.find((m) => m.n === p.msg);
    return {
      id, rotulo: p.rotulo, msg: p.msg, quando: msg?.quando ?? p.desc, desc: p.desc, horaGuia: p.hora, ...g,
      fila: { prontos: meus.filter((x) => x.av.tipo === 'pronto').length, esperando: meus.filter((x) => x.av.tipo === 'espera').length, pulados: meus.filter((x) => x.av.tipo === 'pulado').length },
      motivos: [...motivos].map(([motivo, n]) => ({ motivo, n })).sort((a, b) => b.n - a.n).slice(0, 3), enviadosHoje, simuladosHoje, respostasHoje,
    };
  });
  // próximo disparo: agora (tem lead pronto), hoje (algum gatilho ligado com lead esperando o horário) ou o primeiro de amanhã
  let proximo: { tipo: 'agora' | 'hoje' | 'amanha' | 'nenhum'; gatilho?: string; hora?: string; minutos?: number } = { tipo: 'nenhum' };
  const ativos = gatilhos.filter((g) => g.ativo);
  const pronto = ativos.find((g) => g.fila.prontos > 0);
  if (pronto) proximo = { tipo: 'agora', gatilho: pronto.rotulo, hora: pronto.hora, minutos: 0 };
  else {
    const futuros = ativos.filter((g) => g.fila.esperando > 0 && Number(g.hora.slice(0, 2)) * 60 + Number(g.hora.slice(3)) > minAgora).sort((a, b) => a.hora.localeCompare(b.hora));
    if (futuros[0]) proximo = { tipo: 'hoje', gatilho: futuros[0].rotulo, hora: futuros[0].hora, minutos: Number(futuros[0].hora.slice(0, 2)) * 60 + Number(futuros[0].hora.slice(3)) - minAgora };
    else if (ativos.length) { const a = [...ativos].sort((x, y) => x.hora.localeCompare(y.hora))[0]; proximo = { tipo: 'amanha', gatilho: a.rotulo, hora: a.hora }; }
  }
  const respostasHoje = gatilhos.reduce((s, g) => s + g.respostasHoje, 0);
  return {
    modo, forcadoPeloAmbiente: process.env.DISPARO_AUTO === 'desligado', alteradoPor: estado.disparoAuto?.alteradoPor, alteradoEm: estado.disparoAuto?.alteradoEm,
    config: cfg, guia: { inicio: 8, fim: 19 }, disparo: statusDisparo(estado, agora), ultimaRodada: ultima,
    agoraBrt: { hora: String(t.h).padStart(2, '0') + ':' + String(t.m).padStart(2, '0'), dia: NOMES_DIA[new Date(`${hoje}T12:00:00Z`).getUTCDay()], minutos: minAgora, hoje },
    hoje: { enviadosIA: enviadosPelaIAHoje(estado, agora), limiteDia: Math.min(cfg.limites.porDia, statusDisparo(estado, agora).limiteDia), simulados: gatilhos.reduce((s, g) => s + g.simuladosHoje, 0), respostas: respostasHoje, fila: itens.filter((x) => x.av.tipo === 'pronto').length },
    gatilhos, proximo, unidades: [...new Map(estado.leads.map((l) => (l.unidade ?? '').trim()).filter(Boolean).sort().map((u) => [u.toUpperCase(), u] as const)).values()],
    minutosDesdeUltimaRodada: ultima ? Math.round((agora.getTime() - Date.parse(ultima.quando)) / 60_000) : null,
  };
}

/** Tudo da tela "IA de disparo": modo, rodada, fila de agora, números do período e as respostas dos pacientes. */
export function dadosDisparoAuto(agora: Date, j: Janela) {
  const hoje = hojeDe(agora);
  const naJanela = (q: string) => { const d = diaDoInstante(q); return d >= j.de && d <= j.ate; };
  const total = { enviadosIA: 0, enviadosEquipe: 0, simulados: 0, respostas: 0, respostasRastreadas: 0 };
  const hojeN = { enviadosIA: 0, simulados: 0, respostas: 0 };
  const porIntencao: Record<string, number> = {};
  const porMsg = new Map<number, { env: number; resp: number }>();
  const recentes: { leadId: string; nome: string; texto: string; intencao: string; rotulo: string; quando: string; msg?: number; status: string }[] = [];
  const m = (n: number) => porMsg.get(n) ?? porMsg.set(n, { env: 0, resp: 0 }).get(n)!;
  for (const l of estado.leads) {
    for (const e of l.eventos) {
      const dia = diaDoInstante(e.quando), hoje_ = dia === hoje, dentro = naJanela(e.quando);
      if (e.tipo === 'contato' && ehEnvio(e.texto)) {
        if (e.auto) { if (hoje_) hojeN.enviadosIA++; if (dentro) total.enviadosIA++; } else if (dentro) total.enviadosEquipe++;
        if (dentro && e.msg) m(e.msg).env++;
      } else if (e.tipo === 'nota' && e.texto.startsWith('IA (sombra)')) { if (hoje_) hojeN.simulados++; if (dentro) total.simulados++; }
      else if (e.tipo === 'resposta') {
        if (hoje_) hojeN.respostas++;
        if (!dentro) continue;
        total.respostas++;
        if (e.msg) m(e.msg).resp++;
        if (e.msgId || e.intencao) {
          total.respostasRastreadas++;
          const k = e.intencao ?? 'outro'; porIntencao[k] = (porIntencao[k] ?? 0) + 1;
          recentes.push({ leadId: l.id, nome: l.nome, texto: e.resp ?? '',intencao: k, rotulo: ROTULO_INTENCAO[k as keyof typeof ROTULO_INTENCAO] ?? k, quando: e.quando, msg: e.msg, status: l.status });
        }
      }
    }
  }
  recentes.sort((a, b) => b.quando.localeCompare(a.quando));
  const modo = modoDisparoAuto(estado);
  const filaAgora = fila(estado, agora, { ignorarLista: true }).slice(0, 120).map(({ lead, av }) => ({
    leadId: lead.id, nome: lead.nome, valor: lead.valor, passo: av.passo.rotulo, msg: av.passo.msg, hora: av.passo.hora,
    situacao: av.tipo, motivo: av.tipo === 'pronto' ? undefined : av.motivo,
  }));
  return {
    modo, forcadoPeloAmbiente: process.env.DISPARO_AUTO === 'desligado', alteradoPor: estado.disparoAuto?.alteradoPor, alteradoEm: estado.disparoAuto?.alteradoEm,
    ultimaRodada: estado.disparoAuto?.ultimaRodada ?? null, disparo: statusDisparo(estado, agora),
    periodo: { de: j.de, ate: j.ate, dias: j.dias, ...total, taxaResposta: total.enviadosIA + total.enviadosEquipe ? Math.round(total.respostas / (total.enviadosIA + total.enviadosEquipe) * 1000) / 10 : null },
    hoje: hojeN, porIntencao: Object.entries(porIntencao).map(([intencao, n]) => ({ intencao, rotulo: ROTULO_INTENCAO[intencao as keyof typeof ROTULO_INTENCAO] ?? intencao, n })).sort((a, b) => b.n - a.n),
    porMensagem: [...porMsg].map(([n, x]) => ({ n, titulo: MENSAGENS.find((k) => k.n === n)?.titulo ?? `Mensagem ${n}`, enviadas: x.env, respostas: x.resp, taxa: x.env ? Math.round(x.resp / x.env * 1000) / 10 : null })).sort((a, b) => a.n - b.n),
    respostas: recentes.slice(0, 100), fila: filaAgora,
  };
}
