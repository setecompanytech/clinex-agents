// Teste do funil de aquisição (sem banco, sem Clinilink): dados fictícios.  npx tsx scripts/teste-funil.ts
import { calcularFunil, chaveTel } from '../src/aquisicao/funil.js';
import { campanhaDaMensagem, gerarCodigo, textoWhats, type Campanha, type EventoAq } from '../src/aquisicao/campanhas.js';
import type { AgendamentoFunil } from '../src/integrations/clinilink.js';

let falhas = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? 'OK    ' : 'FALHOU'} ${m}`); if (!c) falhas++; };

const camp = (id: string, nome: string, codigo: string, extra: Partial<Campanha> = {}): Campanha => ({ id, nome, codigo, canal: 'meta', status: 'ativa', inicio: '2026-11-20', criadoEm: '2026-11-20T10:00:00Z', ...extra });
const A = camp('a', 'Check-up Novembro', 'CKNOV', { investimento: 300, cliquesInformados: 40, frases: ['Quero o check-up completo por R$ 99'] });
const B = camp('b', 'Cardio Instagram', 'CARD');

// códigos e mensagem
ok(gerarCodigo('Check-up Novembro 2026', []) === 'CUN2026', 'código pelo nome');
ok(gerarCodigo('Cardio', ['CARDIO']) === 'CARDIO2', 'código repetido ganha número');
ok(textoWhats(A) === 'Olá! Vi o anúncio da Clinex e quero mais informações. (ref: CKNOV)', 'mensagem com o código');
ok(textoWhats(A, true, 'Olá! Vim pelo site') === 'Olá! Vim pelo site (ref: CKNOV-SITE)', 'mensagem vinda do site');
ok(campanhaDaMensagem('Olá! Vim pelo site (ref: CKNOV-SITE)', [A, B])?.origem === 'site', 'detecta o código do site');
ok(campanhaDaMensagem('oi (ref: card)', [A, B])?.campanha.id === 'b', 'detecta código em minúscula');
ok(campanhaDaMensagem('Quero o check-up completo por R$ 99', [A, B])?.por === 'frase', 'detecta pela frase do anúncio');
ok(campanhaDaMensagem('ref: XYZ123 quero consulta', [A, B]) === null, 'código desconhecido não vira lead');
ok(chaveTel('+55 (91) 8888-7777') === '91988887777' && chaveTel('5591988887777') === '91988887777', 'chave de telefone igual à do Clinilink');

let id = 0;
const ev = (campanha: string, etapa: EventoAq['etapa'], t: string, extra: Partial<EventoAq> = {}): EventoAq => ({ id: ++id, t, campanha, etapa, chave: null, telefone: null, atendimento: null, contato: null, dados: {}, ...extra });
const eventos: EventoAq[] = [
  ev('a', 'clique', '2026-11-21T10:00:00Z', { dados: { destino: 'site', via: 'anuncio' } }),
  ev('a', 'clique', '2026-11-21T10:01:00Z', { dados: { destino: 'site', via: 'anuncio' } }),
  ev('a', 'clique', '2026-11-21T10:02:00Z', { dados: { destino: 'wa', via: 'anuncio' } }),
  ev('a', 'clique', '2026-11-21T10:05:00Z', { dados: { destino: 'wa', via: 'site' } }),
  ev('a', 'site', '2026-11-21T10:00:05Z'),
  ev('a', 'site', '2026-11-21T10:01:05Z'),
  // leads: Maria (site, agendou+pagou+atendida), João (direto, só conversou), Ana (direto, agendou e cancelou)
  ev('a', 'lead', '2026-11-21T10:06:00Z', { telefone: '5591988887777', contato: 'Maria', dados: { origem: 'site', por: 'codigo' } }),
  ev('a', 'lead', '2026-11-21T11:00:00Z', { telefone: '5591977776666', contato: 'João', dados: { origem: 'whatsapp', por: 'codigo' } }),
  ev('a', 'lead', '2026-11-22T09:00:00Z', { telefone: '5591966665555', contato: 'Ana', dados: { origem: 'whatsapp', por: 'frase' } }),
  // a mesma Maria chega depois pela campanha B: o agendamento de 25/11 é da B (último toque)
  ev('b', 'lead', '2026-11-25T08:00:00Z', { telefone: '5591988887777', contato: 'Maria', dados: { origem: 'whatsapp', por: 'codigo' } }),
];
const ag = (telefone: string, criadoEm: string, status: string, extra: Partial<AgendamentoFunil> = {}): AgendamentoFunil => ({
  telefone, agendamentoId: `ag-${++id}`, criadoEm, dataHora: criadoEm, status, checkinEm: null, pelaAmanda: true, paciente: { id: 'p', nome: 'MARIA TESTE' }, unidade: 'CLINEX GUAMÁ',
  profissional: { id: 'm', nome: 'EBENEZAIDE PERDIGÃO', especialidade: 'Cardiologista' }, procedimentos: ['CONSULTA CARDIOLOGIA'], valor: 150, os: [], ...extra,
});
const ags: AgendamentoFunil[] = [
  ag('91988887777', '2026-11-21T10:20:00Z', 'atendido', { os: [{ id: 'os1', numero: 'OS-1', status: 'paga', total: 150, valorPago: 150, pagaEm: '2026-11-22T12:00:00Z', formas: ['pix'], operadora: 'JÉSSICA' }] }),
  ag('91966665555', '2026-11-22T09:10:00Z', 'cancelado'),
  ag('91988887777', '2026-11-25T08:10:00Z', 'agendado', { os: [{ id: 'os2', numero: 'OS-2', status: 'aberta', total: 90, valorPago: 0, pagaEm: null, formas: [], operadora: null }] }),
  ag('91955554444', '2026-11-22T09:10:00Z', 'atendido'), // telefone que não é lead: fora
  ag('91977776666', '2026-11-20T09:00:00Z', 'agendado'), // antes do João chegar: fora
];

const r = calcularFunil([A, B], eventos, ags);
const ra = r.campanhas.find((x) => x.campanha.id === 'a')!, rb = r.campanhas.find((x) => x.campanha.id === 'b')!;
const m = ra.metricas;
ok(m.cliques === 43 && m.cliquesRastreados === 3 && m.cliquesInformados === 40, `cliques = 3 rastreados + 40 informados (${m.cliques})`);
ok(m.visitasSite === 2 && m.cliquesSiteParaWhats === 1, 'visitas ao site e clique no WhatsApp do site');
ok(m.leads === 3 && m.leadsSite === 1 && m.leadsWhats === 2, 'leads por origem');
ok(m.diretoWhats === 2, `direto no WhatsApp = max(cliques diretos 1, leads diretos 2) (${m.diretoWhats})`);
ok(m.agendaram === 1 && m.cancelaram === 1, `agendaram 1 (Maria), cancelou 1 (Ana) (${m.agendaram}/${m.cancelaram})`);
ok(m.pagaram === 1 && m.atendidos === 1 && m.receita === 150, 'pagou e atendida, receita 150');
ok(m.cpl === 100 && m.roas === 0.5, `custo por lead 100 e retorno 0,5x (${m.cpl}/${m.roas})`);
ok(ra.passos[4].partes?.[0]?.rotulo === 'JÉSSICA' && ra.passos[4].partes?.[0]?.valor === 150, 'pagou por operadora do caixa');
ok(ra.passos[5].partes?.[0]?.rotulo === 'EBENEZAIDE PERDIGÃO - Cardiologista', 'atendido por médico - especialidade');
ok(rb.metricas.leads === 1 && rb.metricas.agendaram === 1 && rb.metricas.pagaram === 0, 'campanha B: agendamento de 25/11 atribuído ao último toque');
ok(ra.leads.find((l) => l.contato === 'João')?.etapa === 'conversa', 'agendamento anterior ao lead não conta');
ok(ra.leads.every((l) => /^\(\d{2}\) •••••-\d{4}$/.test(l.telefone)), 'telefone mascarado na tela');
ok(!r.campanhas.some((x) => x.leads.some((l) => l.agendamentos.some((a) => a.status === 'atendido' && a.criadoEm.startsWith('2026-11-22')))), 'telefone que não é lead fica fora');

console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo certo');
process.exit(falhas ? 1 : 0);
