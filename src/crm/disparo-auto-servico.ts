import { estadoAtivo, travaCurta } from '../lib/estado.js';
import { atualizarLeadsDoBanco, bancoFora, estado, gravarAntesDeResponder, pronto, salvar, tentarVoltarAoBanco } from './banco.js';
import { diaDoInstante, hojeDe } from './motor.js';
import { MENSAGENS } from './modelo.js';
import type { Janela } from './periodo.js';
import type { Rodada } from './disparo-auto-tipos.js';
import { fila, modoDisparoAuto, rodarDisparoAuto } from './ia-disparo.js';
import { registrarResposta, ROTULO_INTENCAO, type RespostaRecebida } from './rastreio.js';
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
  if (res.registrado) { salvar(); await gravarAntesDeResponder(); }
  return res;
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
