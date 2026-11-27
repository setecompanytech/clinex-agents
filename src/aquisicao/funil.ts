import { funilPorTelefones, type AgendamentoFunil } from '../integrations/clinilink.js';
import { listarCampanhas, lerEventos, type Campanha, type EventoAq } from './campanhas.js';

/**
 * Monta o funil de cada campanha. Do nosso lado (aquisicao_eventos): cliques, visitas ao site e leads. Do Clinilink, ao vivo,
 * pelo telefone de cada lead: agendamentos criados depois que ele chegou, O.S. paga (e a operadora do caixa) e atendimento.
 * Atribuição: um agendamento conta para o lead da campanha mais recente que chegou ATÉ ele ser criado (2 h de folga, para o
 * agendamento feito na mesma conversa) e no máximo JANELA_DIAS depois.
 */
const JANELA_DIAS = 60;
const FOLGA_MS = 2 * 3_600_000;
const TZ = 'America/Belem';

const diaBelem = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
/** Mesma chave de telefone da API do Clinilink (api_telefone_chave): só dígitos, sem 55, celular antigo ganha o 9. */
export function chaveTel(t: string | null | undefined): string {
  let s = String(t ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if ((s.length === 12 || s.length === 13) && s.startsWith('55')) s = s.slice(2);
  if (s.length === 10 && '6789'.includes(s[2])) s = `${s.slice(0, 2)}9${s.slice(2)}`;
  return s;
}
const mascarar = (t: string | null) => { const s = chaveTel(t); return s.length >= 10 ? `(${s.slice(0, 2)}) •••••-${s.slice(-4)}` : '—'; };

export type Etapa = 'conversa' | 'agendou' | 'cancelou' | 'pagou' | 'atendido';
export type LeadFunil = {
  campanha: string; quando: string; contato: string | null; paciente: string | null; telefone: string; origem: string; por: string; atendimento: string | null;
  etapa: Etapa; receita: number; operadoras: string[]; medicos: string[];
  agendamentos: { dataHora: string; criadoEm: string; status: string; unidade: string | null; profissional: string | null; especialidade: string | null; procedimentos: string[]; valor: number; pelaAmanda: boolean; os: { numero: string; status: string; valorPago: number; operadora: string | null; pagaEm: string | null }[] }[];
};
export type Parte = { rotulo: string; n: number; valor?: number };
export type PassoFunil = { id: string; rotulo: string; n: number; sub?: string; partes?: Parte[] };
export type Metricas = {
  cliques: number; cliquesRastreados: number; cliquesInformados: number; visitasSite: number; cliquesSite: number; cliquesSiteParaWhats: number; diretoWhats: number;
  leads: number; leadsSite: number; leadsWhats: number; agendaram: number; cancelaram: number; pagaram: number; atendidos: number; receita: number;
  investimento: number; cpl: number | null; custoAgendamento: number | null; cac: number | null; roas: number | null; conversao: number | null;
};
export type ResultadoCampanha = { campanha: Campanha; metricas: Metricas; passos: PassoFunil[]; leads: LeadFunil[] };
export type Resultado = { campanhas: ResultadoCampanha[]; clinilink: { ok: boolean; erro?: string; atualizadoEm: string } };

let cacheClinilink: { chave: string; em: number; dados: AgendamentoFunil[] } | null = null;
async function doClinilink(telefones: string[], desde: string): Promise<AgendamentoFunil[]> {
  if (!telefones.length) return [];
  const chave = `${desde}|${telefones.slice().sort().join(',')}`;
  if (cacheClinilink && cacheClinilink.chave === chave && Date.now() - cacheClinilink.em < 60_000) return cacheClinilink.dados;
  const dados = await funilPorTelefones(telefones, desde);
  cacheClinilink = { chave, em: Date.now(), dados };
  return dados;
}

const div = (a: number, b: number) => (b > 0 ? a / b : null);
const ordemEtapa: Etapa[] = ['conversa', 'cancelou', 'agendou', 'pagou', 'atendido'];

export async function montarFunil(): Promise<Resultado> {
  const campanhas = await listarCampanhas(true);
  if (!campanhas.length) return { campanhas: [], clinilink: { ok: true, atualizadoEm: new Date().toISOString() } };
  const desdeCampanhas = campanhas.map((c) => c.inicio).sort()[0];
  // as conversas de anúncio do funil GERAL (campanha 'ads:...') ficam fora das campanhas
  const eventos = (await lerEventos({ t: `gte.${desdeCampanhas}T00:00:00-03:00` })).filter((e) => !e.campanha.startsWith('ads:'));
  const leadsEv = eventos.filter((e) => e.etapa === 'lead' && e.telefone);

  // Clinilink: um pedido só, com todos os telefones, desde o lead mais antigo
  let ags: AgendamentoFunil[] = [], erro: string | undefined;
  const telefones = [...new Set(leadsEv.map((e) => e.telefone!))];
  if (telefones.length) {
    const desde = diaBelem(leadsEv.map((e) => e.t).sort()[0]);
    try { ags = await doClinilink(telefones, desde); } catch (e) { erro = (e as Error).message; }
  }

  return calcularFunil(campanhas, eventos, ags, erro);
}

/** Parte pura (testável): junta campanhas, eventos e agendamentos do Clinilink no funil de cada campanha. */
export function calcularFunil(campanhas: Campanha[], eventos: EventoAq[], ags: AgendamentoFunil[], erro?: string): Resultado {
  const leadsEv = eventos.filter((e) => e.etapa === 'lead' && e.telefone);
  // atribuição: cada agendamento vai para o lead mais recente (de qualquer campanha) que chegou até ele ser criado
  const leadsPorTel = new Map<string, EventoAq[]>();
  for (const e of leadsEv) { const k = chaveTel(e.telefone); leadsPorTel.set(k, [...(leadsPorTel.get(k) ?? []), e]); }
  const agsDoLead = new Map<number, AgendamentoFunil[]>();
  for (const a of ags) {
    const criado = Date.parse(a.criadoEm);
    const candidatos = (leadsPorTel.get(chaveTel(a.telefone)) ?? []).filter((l) => Date.parse(l.t) - FOLGA_MS <= criado && criado - Date.parse(l.t) <= JANELA_DIAS * 86_400_000);
    if (!candidatos.length) continue;
    const dono = candidatos.reduce((x, y) => (Date.parse(y.t) > Date.parse(x.t) ? y : x));
    agsDoLead.set(dono.id, [...(agsDoLead.get(dono.id) ?? []), a]);
  }

  const resultado: ResultadoCampanha[] = campanhas.map((c) => {
    const ev = eventos.filter((e) => e.campanha === c.id);
    const cliques = ev.filter((e) => e.etapa === 'clique');
    const cliquesAnuncio = cliques.filter((e) => e.dados?.via !== 'site');
    const cliquesSite = cliquesAnuncio.filter((e) => e.dados?.destino === 'site').length;
    const cliquesDiretoWhats = cliquesAnuncio.filter((e) => e.dados?.destino === 'wa').length;
    const cliquesSiteParaWhats = cliques.filter((e) => e.dados?.via === 'site').length;
    const visitasSite = ev.filter((e) => e.etapa === 'site').length;

    const leads: LeadFunil[] = ev.filter((e) => e.etapa === 'lead').map((l) => {
      const meus = (agsDoLead.get(l.id) ?? []).sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
      const osVistas = new Set<string>();
      let receita = 0;
      const operadoras = new Set<string>(), medicos = new Set<string>();
      let pagou = false, atendido = false, agendou = false;
      for (const a of meus) {
        if (a.status !== 'cancelado') agendou = true;
        if (a.status === 'atendido') { atendido = true; if (a.profissional?.nome) medicos.add(`${a.profissional.nome}${a.profissional.especialidade ? ` - ${a.profissional.especialidade}` : ''}`); }
        if (a.status === 'quitado') pagou = true;
        for (const o of a.os ?? []) {
          if (o.status === 'paga' || o.valorPago > 0) { pagou = true; if (o.operadora) operadoras.add(o.operadora); }
          if (!osVistas.has(o.id)) { osVistas.add(o.id); receita += Number(o.valorPago) || 0; }
        }
      }
      const etapa: Etapa = atendido ? 'atendido' : pagou ? 'pagou' : agendou ? 'agendou' : meus.length ? 'cancelou' : 'conversa';
      return {
        campanha: c.id, quando: l.t, contato: l.contato, paciente: meus[0]?.paciente?.nome ?? null, telefone: mascarar(l.telefone), origem: String(l.dados?.origem ?? 'whatsapp'), por: String(l.dados?.por ?? 'codigo'), atendimento: l.atendimento,
        etapa, receita, operadoras: [...operadoras], medicos: [...medicos],
        agendamentos: meus.map((a) => ({ dataHora: a.dataHora, criadoEm: a.criadoEm, status: a.status, unidade: a.unidade, profissional: a.profissional?.nome ?? null, especialidade: a.profissional?.especialidade ?? null, procedimentos: a.procedimentos ?? [], valor: Number(a.valor) || 0, pelaAmanda: a.pelaAmanda, os: (a.os ?? []).map((o) => ({ numero: o.numero, status: o.status, valorPago: Number(o.valorPago) || 0, operadora: o.operadora, pagaEm: o.pagaEm })) })),
      };
    }).sort((a, b) => b.quando.localeCompare(a.quando));

    const conta = (f: (l: LeadFunil) => boolean) => leads.filter(f).length;
    const chegou = (e: Etapa) => (l: LeadFunil) => ordemEtapa.indexOf(l.etapa) >= ordemEtapa.indexOf(e);
    const agendaram = conta(chegou('agendou')), pagaram = conta(chegou('pagou')), atendidos = conta((l) => l.etapa === 'atendido');
    const cancelaram = conta((l) => l.etapa === 'cancelou');
    const receita = leads.reduce((s, l) => s + l.receita, 0);
    const leadsSite = conta((l) => l.origem === 'site');
    const leadsWhats = leads.length - leadsSite;
    const diretoWhats = Math.max(cliquesDiretoWhats, leadsWhats);
    const acessoSite = Math.max(visitasSite, visitasSite ? 0 : cliquesSite, leadsSite);
    const investimento = Number(c.investimento) || 0;
    const informados = Number(c.cliquesInformados) || 0;
    const cliquesContados = cliquesAnuncio.length + informados;
    // quem chegou ao site ou ao WhatsApp clicou em algum lugar: a etapa 1 nunca fica menor que a 2 (ex.: anúncio sem o link rastreado)
    const cliquesTotal = Math.max(cliquesContados, acessoSite + diretoWhats);

    const agrupar = (lista: string[][]) => { const m = new Map<string, number>(); for (const xs of lista) for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1); return [...m.entries()].map(([rotulo, n]) => ({ rotulo, n })).sort((a, b) => b.n - a.n); };
    const porOperadora = (() => { const m = new Map<string, { n: number; valor: number }>(); for (const l of leads) for (const a of l.agendamentos) for (const o of a.os) if (o.valorPago > 0 || o.status === 'paga') { const k = o.operadora || 'Sem operadora registrada'; const x = m.get(k) ?? { n: 0, valor: 0 }; x.n++; x.valor += o.valorPago; m.set(k, x); } return [...m.entries()].map(([rotulo, x]) => ({ rotulo, n: x.n, valor: x.valor })).sort((a, b) => b.n - a.n); })();

    const metricas: Metricas = {
      cliques: cliquesTotal, cliquesRastreados: cliquesAnuncio.length, cliquesInformados: informados, visitasSite, cliquesSite, cliquesSiteParaWhats, diretoWhats,
      leads: leads.length, leadsSite, leadsWhats, agendaram, cancelaram, pagaram, atendidos, receita, investimento,
      cpl: div(investimento, leads.length), custoAgendamento: div(investimento, agendaram), cac: div(investimento, pagaram), roas: div(receita, investimento), conversao: div(pagaram * 100, leads.length),
    };
    const passos: PassoFunil[] = [
      { id: 'clique', rotulo: 'Clicou no anúncio', n: cliquesTotal, sub: `${cliquesAnuncio.length} pelo link rastreado${informados ? ` + ${informados} informados do gerenciador de anúncios` : ''}${cliquesTotal > cliquesContados ? `; no mínimo ${cliquesTotal}, porque ${acessoSite + diretoWhats} chegaram ao site ou ao WhatsApp` : ''}` },
      { id: 'acesso', rotulo: 'Acessou o site ou foi direto ao WhatsApp', n: acessoSite + diretoWhats, partes: [{ rotulo: 'Acessou o site', n: acessoSite }, { rotulo: 'Direto no WhatsApp', n: diretoWhats }], sub: cliquesSiteParaWhats ? `${cliquesSiteParaWhats} clicaram no WhatsApp a partir do site` : undefined },
      { id: 'lead', rotulo: `Caiu no atendimento (etiqueta ADS - ${c.nome})`, n: leads.length, partes: [{ rotulo: 'Vindo do site', n: leadsSite }, { rotulo: 'Direto do anúncio', n: leadsWhats }] },
      { id: 'agendou', rotulo: 'Agendou no Clinilink', n: agendaram, sub: cancelaram ? `${cancelaram} agendaram e cancelaram (fora da conta)` : undefined },
      { id: 'pagou', rotulo: 'Pagou na clínica (O.S. paga)', n: pagaram, partes: porOperadora },
      { id: 'atendido', rotulo: 'Atendido pelo médico', n: atendidos, partes: agrupar(leads.map((l) => l.medicos)) },
    ];
    return { campanha: c, metricas, passos, leads };
  });

  return { campanhas: resultado, clinilink: { ok: !erro, erro, atualizadoEm: new Date().toISOString() } };
}
