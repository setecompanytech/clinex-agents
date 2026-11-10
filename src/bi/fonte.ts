import { buscarEventos, logsConfigurado, type Evento } from '../logs/vercel.js';
import { estadoArmazem, eventosDaMemoria } from './armazem.js';
import { analisar, construirConversas } from './analise.js';
import { gerarDemo } from './demo.js';

const HORA = 3_600_000;
export const PERIODOS = { '24h': 24 * HORA, '7d': 7 * 24 * HORA, '30d': 30 * 24 * HORA } as const;
const ROTULOS = { '24h': 'últimas 24 horas', '7d': 'últimos 7 dias', '30d': 'últimos 30 dias' } as const;
export type Periodo = keyof typeof PERIODOS;
export type Fonte = 'real' | 'demo';

let demo: { ate: number; eventos: Evento[] } | null = null;
let vercel: { ate: number; eventos: Evento[]; erro?: string } | null = null;

const chave = (e: Evento) => JSON.stringify(e);

async function eventosReais(agora: number, janelaMs: number) {
  const avisos: string[] = [];
  const origens: string[] = [];
  const desde = agora - janelaMs * 2; // o dobro: o período atual + o anterior, para as comparações
  const da = await eventosDaMemoria(desde);
  const arm = estadoArmazem();
  origens.push(arm.destino === 'supabase' ? 'Supabase (histórico completo)' : arm.destino === 'arquivo' ? `arquivo local (${arm.arquivo})` : 'memória do servidor');
  let todos = da;

  if (logsConfigurado()) {
    if (!vercel || agora - vercel.ate > 60_000) {
      const r = await buscarEventos({ minutos: 24 * 60, limite: 1000 });
      vercel = { ate: agora, eventos: r.eventos, erro: r.erro };
    }
    origens.push('logs da Vercel (últimas 24 h)');
    if (vercel.erro) avisos.push(vercel.erro);
    if (vercel.eventos.length >= 1000) avisos.push('A Vercel entrega no máximo 1000 eventos por consulta: em dias movimentados o fim do período pode ficar incompleto.');
    const vistos = new Set(todos.map(chave));
    todos = [...todos, ...vercel.eventos.filter((e) => !vistos.has(chave(e)))];
  } else if (!arm.persistente) {
    avisos.push('Sem histórico: este servidor não grava eventos em disco (está na Vercel ou BI_PERSISTIR=false) e LOGS_VERCEL_TOKEN não está configurado. O BI só enxerga o que aconteceu desde que a instância subiu.');
  }
  return { todos, origens, avisos };
}

export async function montarBI(periodo: Periodo, fonte: Fonte, agora = Date.now()) {
  const janela = PERIODOS[periodo];
  const opcoes = { desde: agora - janela, ate: agora, rotulo: ROTULOS[periodo] };
  if (fonte === 'demo') {
    if (!demo || agora - demo.ate > 30 * 60_000) demo = { ate: agora, eventos: gerarDemo(agora) };
    return analisar(demo.eventos, { ...opcoes, fonte: { tipo: 'demo', origens: ['dados simulados'], avisos: [] } });
  }
  const r = await eventosReais(agora, janela);
  return analisar(r.todos, { ...opcoes, fonte: { tipo: 'real', origens: r.origens, avisos: r.avisos } });
}

/**
 * Monitor de conversas: TODAS as conversas do período (até 500, as mais recentes primeiro), só com o resumo de cada uma.
 * Com `id`, devolve a conversa inteira (as mensagens dos dois lados) para o detalhe.
 */
export async function montarMonitor(periodo: Periodo, id?: string, agora = Date.now()) {
  const janela = PERIODOS[periodo];
  const r = await eventosReais(agora, janela);
  const convs = construirConversas(r.todos, agora).filter((c) => c.fim >= agora - janela).sort((a, b) => b.fim - a.fim);
  if (id) {
    const c = convs.find((x) => x.id === id);
    return { turnos: (c?.turnos ?? []).slice(0, 80).map((t) => ({ t: t.t, paciente: t.paciente.slice(0, 600), amanda: t.amanda.slice(0, 900), etapa: t.etapa, transferiu: t.transferiu, motivo: t.motivo?.slice(0, 240) })) };
  }
  return {
    geradoEm: agora, periodo, origens: r.origens, avisos: r.avisos, total: convs.length,
    conversas: convs.slice(0, 500).map((c) => ({
      id: c.id, curto: c.id.slice(-6), inicio: c.inicio, fim: c.fim, status: c.status, mensagens: c.turnos.length, etapa: c.etapaFinal,
      motivo: c.motivo?.slice(0, 200), problemas: c.problemas, estagio: c.estagio, motor: c.motor, simulada: c.simulada, primeira: (c.turnos.find((t) => t.paciente)?.paciente ?? '').slice(0, 140),
    })),
  };
}
