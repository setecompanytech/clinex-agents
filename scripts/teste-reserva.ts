/**
 * Teste da reserva de ponta a ponta contra um Clinilink SIMULADO (segue o contrato do INOVSTAR_API.md).
 * Não toca em nenhum sistema real. Rodar: npx tsx scripts/teste-reserva.ts
 */
import http from 'node:http';

type Posts = { rota: string; corpo: any }[];
const posts: Posts = [];
let modo: { ocupados: number; agendamento?: 'ok' | 'duplicado' | '500' | 'ocupado-sempre'; cpfDuplicado?: boolean; somenteLeitura?: boolean; falhaNoPost?: number } = { ocupados: 0 };

const U_GUAMA = '11111111-1111-4111-8111-111111111111';
const U_TELEGRAFO = '99999999-9999-4999-8999-999999999999';
const PROC = '22222222-2222-4222-8222-222222222222';
const PROC2 = '23232323-2323-4232-8232-232323232323';
const MEDICO = '33333333-3333-4333-8333-333333333333';
const P_REB = '51515151-5151-4515-8515-515151515151'; // REBECCA SILVA MOURA (Ginecologia, só no Guamá)
const P_LIDUINA = '54545454-5454-4545-8545-545454545454'; // atende a tarde de depois de amanhã
const P_REBECA = '52525252-5252-4525-8525-525252525252'; // REBECA COSTA LIMA (Cardiologia, sem agenda aberta)
const PROC3 = '24242424-2424-4242-8242-242424242424';
const PROC_USG = '25252525-2525-4252-8252-252525252525';
const PREPARO_LONGO = 'PREPARO PARA O EXAME\n\nJejum: manter jejum de 8 horas antes do exame.\n\nVéspera:\n• Evite alimentos gordurosos.\n• Não mascar chiclete.';
const AGENDA = '44444444-4444-4444-8444-444444444444';
// combos do Clinilink simulado: consulta (agenda principal), eletrocardiograma (MESMA agenda da consulta), USG (outra agenda), coleta (outra agenda)
const PROC_RETORNO = '46464646-4646-4464-8464-464646464646';
const PROC_ECG = '43434343-4343-4434-8434-434343434343';
const PROC_USGC = '45454545-4545-4454-8454-454545454545';
const PROC_HEMO = '41414141-4141-4414-8414-414141414141';
const PROC_GLIC = '42424242-4242-4424-8424-424242424242';
const AGENDA_COLETA = '55555555-5555-4555-8555-5555555555aa';
const AGENDA_USGC = '55555555-5555-4555-8555-5555555555bb';
const COMBOS = [
  { id: 'c0000001-0000-4000-8000-000000000001', nome: 'FEMININO 1', servicos: [
    { id: PROC, nome: 'CONSULTA GINECOLOGIA', preco: 80, categoriaNome: 'GINECOLOGIA' }, { id: PROC_RETORNO, nome: 'CONSULTA GINECOLOGIA - RETORNO', preco: 0, categoriaNome: 'GINECOLOGIA' },
    { id: PROC_USGC, nome: 'USG TRANSVAGINAL', preco: 70, categoriaNome: 'ULTRASSONOGRAFIA' }, { id: PROC_HEMO, nome: 'HEMOGRAMA COMPLETO', preco: 10, categoriaNome: 'LABORATORIAL' }] },
  { id: 'c0000001-0000-4000-8000-000000000002', nome: 'FEMININO 2', servicos: [
    { id: PROC, nome: 'CONSULTA GINECOLOGIA', preco: 80, categoriaNome: 'GINECOLOGIA' }, { id: PROC_RETORNO, nome: 'CONSULTA GINECOLOGIA - RETORNO', preco: 0, categoriaNome: 'GINECOLOGIA' }, { id: PROC_ECG, nome: 'ELETROCARDIOGRAMA', preco: 30, categoriaNome: 'METODOS GRAFICOS' }] },
  { id: 'c0000001-0000-4000-8000-000000000003', nome: 'CHECK UP 10', servicos: [{ id: PROC_HEMO, nome: 'HEMOGRAMA COMPLETO', preco: 10, categoriaNome: 'LABORATORIAL' }, { id: PROC_GLIC, nome: 'GLICEMIA EM JEJUM', preco: 7, categoriaNome: 'LABORATORIAL' }] },
  { id: 'c0000001-0000-4000-8000-000000000004', nome: 'INFANTIL 1', servicos: [{ id: PROC2, nome: 'CONSULTA DERMATOLOGIA', preco: 85, categoriaNome: 'DERMATOLOGIA' }, { id: '40000000-0000-4000-8000-000000000001', nome: 'TESTE RAPIDO HIV', preco: 5, categoriaNome: 'LABORATORIAL' }] },
];
/** Quantos agendamentos cada serviço teve (o Clinilink simulado devolve isso em GET /agendamentos): o teste de alergia é o mais procurado dos exames. */
const DEMANDA_PADRAO: Record<string, number> = {
  '33333333-3434-4343-8343-343434343434': 60, // TESTE DE ALERGIA
  '25252525-2525-4252-8252-252525252525': 40, // USG ABDOME TOTAL
  '31313131-3131-4313-8313-313131313131': 15, // TESTE ERGOMETRICO
  '28282828-2828-4282-8282-282828282828': 8, // TESTE DE ESFORCO COM ECG
  '22222222-2222-4222-8222-222222222222': 50, // CONSULTA GINECOLOGIA
  '23232323-2323-4232-8232-232323232323': 25, // CONSULTA DERMATOLOGIA
  '24242424-2424-4242-8242-242424242424': 10, // CONSULTA CARDIOLOGIA
};
const dia = (n: number) => { const d = new Date(Date.now() + n * 86400000); return d.toISOString().slice(0, 10); };
const mk = (data: string, hora: string, inicio: string, prof = { id: MEDICO, nome: "MEDICA TESTE DA SILVA" }) => ({
  data, hora, dataHora: `${data}T${hora}:00-03:00`, agendaId: AGENDA, agendaNome: "Agenda Guamá", agendaHoraInicio: inicio, duracaoMinutos: 30,
  profissional: prof, unidade: { id: U_GUAMA, nome: "CLINEX GUAMÁ" },
});
/** amanhã de manhã (3 horários, os primeiros podem estar "ocupados") e depois de amanhã à tarde (2 horários) */
const horarios = (ini: string, fim: string, profId?: string, unidadeId?: string) => {
  if (profId === P_REBECA) return []; // sem agenda aberta
  const procAg = (globalThis as any).__procAgenda ?? '';
  if (procAg === PROC_HEMO || procAg === PROC_GLIC) { // coleta: outra agenda, por ordem de chegada, amanhã e depois de amanhã a partir das 07:00
    const col = { id: '99999999-9999-4999-8999-999999999999', nome: 'COLETA' };
    return [dia(1), dia(2), dia(5)].flatMap((d) => ['07:00', '07:20'].map((h) => ({ ...mk(d, h, '07:00', col), agendaId: AGENDA_COLETA, agendaNome: 'Coleta' }))).filter((h) => h.data >= ini && h.data <= fim);
  }
  if (procAg === PROC_USGC) { // USG do combo: outra agenda; só amanhã e daqui a 5 dias (depois de amanhã NÃO tem: o combo não fecha nesse dia)
    const usg = { id: '98989898-9898-4898-8898-989898989898', nome: 'LUIS USG TESTE' };
    return [dia(1), dia(5)].flatMap((d) => ['10:00', '10:30'].map((h) => ({ ...mk(d, h, '10:00', usg), agendaId: AGENDA_USGC, agendaNome: 'USG' }))).filter((h) => h.data >= ini && h.data <= fim);
  }
  if ((globalThis as any).__procAgenda?.startsWith('40000000-')) return []; // teste rápido de laboratório: sem agenda
  const semAmanhaNoGuama = (hs: any[]) => ((globalThis as any).__dicaUnidade && unidadeId === U_GUAMA ? hs.filter((h) => h.data !== dia(1)) : hs);
  if (profId === P_REB) return unidadeId === U_TELEGRAFO ? [] : [...["10:00", "10:30"].map((h) => mk(dia(3), h, "10:00", { id: P_REB, nome: "REBECCA SILVA MOURA" }))].filter((h) => h.data >= ini && h.data <= fim);
  return semAmanhaNoGuama([
    ...["08:00", "08:30", "09:00"].slice(modo.ocupados).map((h) => mk(dia(1), h, "08:00")),
    ...["13:30", "14:00"].map((h) => mk(dia(2), h, "13:00", { id: P_LIDUINA, nome: "LIDUINA COSTA PINTO" })),
    ...["08:00"].map((h) => mk(dia(5), h, "08:00")), ...["13:30"].map((h) => mk(dia(8), h, "13:00", { id: P_LIDUINA, nome: "LIDUINA COSTA PINTO" })),
    ...["08:00"].map((h) => mk(dia(12), h, "08:00")), ...["13:30"].map((h) => mk(dia(15), h, "13:00", { id: P_LIDUINA, nome: "LIDUINA COSTA PINTO" })),
  ].filter((h) => h.data >= ini && h.data <= fim));
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url!, 'http://x');
  let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => {
    const j = (code: number, body: unknown) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    const corpo = raw ? JSON.parse(raw) : undefined;
    const p = url.pathname;
    if (req.method === 'GET') {
      if (p.endsWith('/combos')) return j(200, { ok: true, combos: COMBOS });
      if (p.endsWith('/clinicas')) return j(200, { ok: true, clinicas: [{ id: U_GUAMA, nome: 'CLINEX GUAMÁ', endereco: 'Av. José Bonifácio, 2426', telefone: '91991434370' }, { id: U_TELEGRAFO, nome: 'CLINEX TELEGRAFO', endereco: 'Travessa Coronel Luís Bentes 170A-Telegrafo', telefone: '91984320406' }] });
      if (p.endsWith('/procedimentos')) {
        const b = url.searchParams.get('busca') ?? '';
        const un = url.searchParams.get('unidadeId');
        if (b === '') {
          const c = (id: string, nome: string, categoria = 'Consulta', preco = 100) => ({ id, nome, categoria, preco, precoDinheiro: un === U_GUAMA ? 0 : 999, preparo: id === PROC_USG ? PREPARO_LONGO : id.startsWith('31313131') ? 'NO MÁXIMO ATÉ 70 ANOS' : id.startsWith('26262626') ? '0' : null });
          return j(200, { ok: true, procedimentos: [
            c(PROC, 'CONSULTA GINECOLOGIA'), c(PROC2, 'CONSULTA DERMATOLOGIA'), c(PROC3, 'CONSULTA CARDIOLOGIA'), c(PROC_USG, 'USG ABDOME TOTAL', 'Exames', 150),
            c('26262626-2626-4262-8262-262626262626', 'ERGOMETRIA', 'Exames', 120), c('27272727-2727-4272-8272-272727272727', 'CONSULTA FONOAUDIOLOGIA'),
            c('28282828-2828-4282-8282-282828282828', 'TESTE DE ESFORCO COM ECG', 'Exames', 120), c('29292929-2929-4292-8292-292929292929', 'CONSULTA SEMVALOR', 'Consulta', 0),
            ...['DENGUE IGG', 'DENGUE IGM', 'DENGUE ANTIGENO', 'COVID', 'HIV', 'SIFILIS', 'HEPATITE B', 'HEPATITE C', 'H PYLORI', 'INFLUENZA', 'ZIKA', 'CHIKUNGUNYA', 'MALARIA', 'TOXOPLASMOSE', 'ROTAVIRUS', 'STREPTOCOCO', 'LATEX', 'COOMBS', 'HCG', 'TROPONINA'].map((n, i) => c(`40000000-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`, `TESTE RAPIDO ${n}`, 'Laboratório', 30)),
            c('41414141-4141-4414-8414-414141414141', 'HEMOGRAMA COMPLETO', 'Laboratório', 15), c('42424242-4242-4424-8424-424242424242', 'GLICOSE', 'Laboratório', 10),
            ...((globalThis as any).__avulsosCombos ? [c(PROC_USGC, 'USG TRANSVAGINAL', 'Exames', 90), c(PROC_ECG, 'ELETROCARDIOGRAMA', 'Exames', 40)] : []), // com o preço avulso de todos os itens o combo passa a mostrar a economia (e a ser sugerido)
            c('31313131-3131-4313-8313-313131313131', 'TESTE ERGOMETRICO', 'Exames', 140), c('32323232-3232-4323-8323-323232323232', 'TESTE RAPIDO DE GRAVIDEZ', 'Exames', 40), c('33333333-3434-4343-8343-343434343434', 'TESTE DE ALERGIA', 'Exames', 90),
          ] });
        }
        // procedimentos "estranhos" do cadastro: a busca real é por pedaço do nome, sem acento
        const sem = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const extras = [{ id: '31313131-3131-4313-8313-313131313131', nome: 'TESTE ERGOMETRICO', categoria: 'Exames' }, { id: '26262626-2626-4262-8262-262626262626', nome: 'ERGOMETRIA', categoria: 'Exames' }, { id: '27272727-2727-4272-8272-272727272727', nome: 'CONSULTA FONOAUDIOLOGIA', categoria: 'Consulta' }, { id: '28282828-2828-4282-8282-282828282828', nome: 'TESTE DE ESFORCO COM ECG', categoria: 'Exames' }]
          .filter((x) => b.length >= 4 && sem(x.nome).includes(sem(b))).map((x) => ({ ...x, preco: 120, precoDinheiro: un === U_GUAMA ? 0 : 999, preparo: x.id === PROC_USG ? PREPARO_LONGO : x.id.startsWith('31313131') ? 'NO MÁXIMO ATÉ 70 ANOS' : null })); // precoDinheiro ZERADO no Guamá e 999 no outro: nunca pode aparecer
        if (extras.length) return j(200, { ok: true, procedimentos: extras });
        if (/ergometrico|fonoaudiologo|audiom|hemoglob|glicada/i.test(b)) return j(200, { ok: true, procedimentos: [] });
        if (/semvalor/i.test(b)) return j(200, { ok: true, procedimentos: [{ id: '29292929-2929-4292-8292-292929292929', nome: 'CONSULTA SEMVALOR', categoria: 'Consulta', preco: 0, precoDinheiro: 0 }] });
        const consulta = (id: string, nome: string) => ({ id, nome, categoria: 'Consulta', preco: 100, precoDinheiro: un === U_GUAMA ? 0 : 100 });
        const lista = /zzz|qqq|rebec|zuleide|xavier|silva|pix/i.test(b) || /^ultrassom$/i.test(b) ? []
          : /usg|ultrassonografia/i.test(b) ? [{ id: PROC_USG, nome: 'USG ABDOME TOTAL', categoria: 'Exames', preco: 150, precoDinheiro: 150, preparo: PREPARO_LONGO }]
          : /dermat/i.test(b) ? [consulta(PROC2, 'CONSULTA DERMATOLOGIA')]
          : /cardio/i.test(b) ? [consulta(PROC3, 'CONSULTA CARDIOLOGIA')]
          : [consulta(PROC, 'CONSULTA GINECOLOGIA')];
        return j(200, { ok: true, procedimentos: lista });
      }
      if (p.endsWith('/profissionais')) {
        const un = url.searchParams.get('unidadeId'); const proc = url.searchParams.get('procedimentoId');
        const todos = [
          { id: MEDICO, nome: 'MEDICA TESTE DA SILVA', especialidade: 'Ginecologia', un: [U_GUAMA, U_TELEGRAFO], procs: [PROC] },
          { id: P_REB, nome: 'REBECCA SILVA MOURA', especialidade: 'Ginecologia', un: [U_GUAMA], procs: [PROC] },
          { id: P_REBECA, nome: 'REBECA COSTA LIMA', especialidade: 'Cardiologia', un: [U_GUAMA, U_TELEGRAFO], procs: [PROC3] },
        ].filter((x) => (!un || x.un.includes(un)) && (!proc || x.procs.includes(proc))).map(({ id, nome, especialidade }) => ({ id, nome, especialidade, conselho: 'CRM' }));
        return j(200, { ok: true, profissionais: todos });
      }
      if (p.endsWith('/agenda')) { (globalThis as any).__procAgenda = url.searchParams.get('procedimentoId') ?? ''; }
      if (p.endsWith('/agenda')) return j(200, { ok: true, horarios: horarios(url.searchParams.get('dataInicial') ?? '0000', url.searchParams.get('dataFinal') ?? '9999', url.searchParams.get('profissionalId') ?? undefined, url.searchParams.get('unidadeId') ?? undefined) });
      if (p.endsWith('/agendamentos')) {
        // lista de agendamentos já feitos (só para contar a demanda por serviço); 1 em cada 10 está cancelado e não conta
        // um dia só (dataInicial = dataFinal): o agendamento que o paciente de teste já tem (serve para explicar a recusa por duplicidade)
        const existente = (globalThis as any).__existente as { data: string; hora: string; inicio: string } | undefined;
        if (existente && url.searchParams.get('dataInicial') === url.searchParams.get('dataFinal')) {
          const aqui = url.searchParams.get('unidadeId') === U_GUAMA && url.searchParams.get('dataInicial') === existente.data;
          return j(200, { ok: true, total: aqui ? 1 : 0, limite: 500, offset: 0, agendamentos: aqui ? [{ agendamentoId: 'ex1', status: 'agendado', dataHora: `${existente.data}T${existente.hora}:00-03:00`, agendaHoraInicio: existente.inicio, paciente: { id: '55555555-5555-4555-8555-555555555555', nome: 'MARIA EXEMPLO', telefone: '000' }, profissional: { id: MEDICO, nome: 'MEDICA TESTE DA SILVA' }, unidade: { id: U_GUAMA, nome: 'CLINEX GUAMÁ' }, procedimentos: [{ id: PROC, nome: 'CONSULTA GINECOLOGIA' }] }] : [] });
        }
        const dem: Record<string, number> = (globalThis as any).__demanda ?? DEMANDA_PADRAO;
        const ags: any[] = [];
        for (const [id, n] of Object.entries(dem)) for (let i = 0; i < n; i++) ags.push({ agendamentoId: `a${ags.length}`, status: i % 10 === 0 ? 'cancelado' : 'agendado', paciente: { nome: 'PACIENTE DE TESTE', telefone: '000' }, procedimentos: [{ id, nome: 'x' }] });
        const off = Number(url.searchParams.get('offset') ?? 0); const lim = Number(url.searchParams.get('limite') ?? 100);
        return j(200, { ok: true, total: ags.length, limite: lim, offset: off, agendamentos: ags.slice(off, off + lim) });
      }
      if (p.endsWith('/pacientes')) return j(200, { ok: true, pacientes: url.searchParams.get('cpf') === '52998224725' ? [{ id: '55555555-5555-4555-8555-555555555555', nome: 'MARIA EXEMPLO' }] : [] });
    }
    if (req.method === 'POST') {
      posts.push({ rota: p, corpo });
      if (modo.somenteLeitura) return j(403, { ok: false, erro: 'SOMENTE_LEITURA', mensagem: 'Esta credencial é somente leitura.' });
      if (p.endsWith('/pacientes')) {
        if (modo.cpfDuplicado) return j(409, { ok: false, erro: 'CPF_DUPLICADO', mensagem: 'Já existe', pacienteExistente: { id: '66666666-6666-4666-8666-666666666666', nome: 'JA EXISTE' } });
        return j(201, { ok: true, paciente: { id: '77777777-7777-4777-8777-777777777777', nome: corpo.nome } });
      }
      if (p.endsWith('/agendamentos')) {
        const n = posts.filter((x) => x.rota.endsWith('/agendamentos')).length;
        if (modo.falhaNoPost === n) return j(409, { ok: false, erro: 'HORARIO_OCUPADO', mensagem: 'ocupado (teste: falha no POST ' + n + ')' });
        if (modo.agendamento === '500') return j(500, { ok: false, erro: 'ERRO_INTERNO' });
        if (modo.agendamento === 'duplicado') return j(409, { ok: false, erro: 'SERVICO_DUPLICADO_NO_DIA', mensagem: 'dup' });
        if (modo.agendamento === 'ocupado-sempre' || (modo.ocupados === 0 && n === 1 && modo.agendamento === undefined && (globalThis as any).__ocupaPrimeiro)) return j(409, { ok: false, erro: 'HORARIO_OCUPADO', mensagem: 'ocupado' });
        return j(201, { ok: true, agendamentoId: '88888888-8888-4888-8888-888888888888', status: 'agendado', dataHora: corpo.dataHora, profissional: { id: MEDICO, nome: 'MEDICA TESTE DA SILVA' }, valorTotal: 100 });
      }
    }
    j(404, { ok: false, erro: 'NAO_ENCONTRADO' });
  });
});
await new Promise<void>((ok) => server.listen(0, ok));
process.env.CLINILINK_BASE_URL = `http://127.0.0.1:${(server.address() as any).port}`;
process.env.CLINILINK_API_KEY = 'chave-de-teste';
process.env.LOG_QUIET = '1';

const { responder, MARCA_AGENDADO, MARCAS_FIM, SEM_GPT, estadoDepoisDaResposta, etapa } = await import('../src/agents/receptivo/script/engine.js');
const { fonteClinilink } = await import('../src/agents/receptivo/script/clinilinkFonte.js');
const ctx = { now: new Date(), nome: 'Teste', tz: 'America/Sao_Paulo', telefone: '5591999990000' };

let falhas = 0;
const confere = (nome: string, ok: boolean, detalhe = '') => { if (!ok) falhas++; console.log(`${ok ? 'OK  ' : 'FALHOU'} ${nome}${detalhe ? ` -> ${detalhe}` : ''}`); };
const nPost = (fim: string) => posts.filter((x) => x.rota.endsWith(fim)).length;

/** Como o agente real: a cada mensagem, reprocessa a conversa inteira até ali. */
async function conversa(textos: (string | string[])[], c = ctx) {
  let r;
  for (let i = 1; i <= textos.length; i++) r = await responder(textos.slice(0, i), c, fonteClinilink);
  return r!;
}
const reset = (m: typeof modo) => { posts.length = 0; modo = m; (globalThis as any).__ocupaPrimeiro = false; };
/** conversa até o pagamento resolvido ("na recepção"): o próximo passo é o CPF */
const base = ['oi', 'quero agendar ginecologista', 'sim', 'guama amanhã', 'na recepção'];

// 1) paciente NOVO, jornada completa, com reprocessamento a cada mensagem
reset({ ocupados: 0 });
let r = await conversa([...base, '12345678909', 'Joana Teste Souza', '10/05/1990', 'feminino', 'sim']);
confere('1 paciente novo: confirma o agendamento', r.reply.startsWith(MARCA_AGENDADO) && !r.handoff, r.reply.replace(/\n/g, ' | '));
confere('1 cadastrou UMA vez', nPost('/pacientes') === 1, `POST pacientes = ${nPost('/pacientes')}`);
confere('1 agendou UMA vez (sem duplicar no reprocessamento)', nPost('/agendamentos') === 1, `POST agendamentos = ${nPost('/agendamentos')}`);
const ag = posts.find((x) => x.rota.endsWith('/agendamentos'))!.corpo;
confere('1 pegou o PRIMEIRO horário livre real (08:00)', ag.dataHora.includes('T08:00'), ag.dataHora);
confere('1 mandou ids reais e o procedimento', ag.agendaId === AGENDA && ag.profissionalId === MEDICO && ag.unidadeId === U_GUAMA && ag.procedimentos[0] === PROC && ag.pacienteId === '77777777-7777-4777-8777-777777777777');
const cad = posts.find((x) => x.rota.endsWith('/pacientes'))!.corpo;
confere('1 cadastro com nascimento ISO, sexo e CPF', cad.dataNascimento === '1990-05-10' && cad.sexo === 'feminino' && cad.cpf === '12345678909' && cad.nome === 'Joana Teste Souza', JSON.stringify({ ...cad, cpf: '***', nome: '***' }));

// 2) paciente que JÁ EXISTE: não cadastra
reset({ ocupados: 0 });
r = await conversa([...base, '52998224725', 'sim']);
confere('2 paciente existente: agendou sem cadastrar', r.reply.startsWith(MARCA_AGENDADO) && nPost('/pacientes') === 0 && nPost('/agendamentos') === 1, `pacientes=${nPost('/pacientes')} agendamentos=${nPost('/agendamentos')}`);

// 3) NÃO grava antes do fim: parado no CPF e na confirmação do paciente
reset({ ocupados: 0 });
await conversa([...base, '52998224725']);
confere('3 antes de confirmar o paciente: nenhuma gravação', posts.length === 0, `POSTs = ${posts.length}`);

// 4) primeiro horário ocupado: tenta o próximo
reset({ ocupados: 0 }); (globalThis as any).__ocupaPrimeiro = true;
r = await conversa([...base, '52998224725', 'sim']);
confere('4 horário ocupado: tentou o seguinte e confirmou', r.reply.startsWith(MARCA_AGENDADO) && nPost('/agendamentos') === 2, `tentativas=${nPost('/agendamentos')}`);

// 5) todos ocupados: passa para a equipe, sem inventar confirmação
reset({ ocupados: 0, agendamento: 'ocupado-sempre' });
r = await conversa([...base, '52998224725', 'sim']);
confere('5 vaga perdida: transfere e NÃO diz que agendou', Boolean(r.handoff) && !r.reply.includes(MARCA_AGENDADO) && /preenchida/.test(r.reply), r.reply);
confere('5 no máximo 3 tentativas', nPost('/agendamentos') <= 3, `tentativas=${nPost('/agendamentos')}`);

// 6) a agenda esvaziou entre a escolha e a reserva
reset({ ocupados: 0 });
{
  const antes = fonteClinilink.reservar!;
  modo.ocupados = 3; // agenda "fresca" sem horários
  r = await conversa([...base.slice(0, 3), 'amanhã no guama'].length ? [...base, '52998224725', 'sim'] : []);
  void antes;
  confere('6 sem horário livre no momento de reservar: transfere', Boolean(r.handoff) || /não há vaga|não encontrei|não tenho vaga|não vejo vagas/.test(r.reply), r.reply.replace(/\n/g, ' | '));
}

// 7) erro 500 na reserva: resultado incerto, NÃO repete o POST
reset({ ocupados: 0, agendamento: '500' });
r = await conversa([...base, '52998224725', 'sim']);
confere('7 erro 500: transfere com aviso de conferir', Boolean(r.handoff) && /CONFERIR/.test(r.handoff!.motivo) && !r.reply.includes(MARCA_AGENDADO), r.handoff?.motivo.slice(0, 90));
confere('7 não repetiu o POST', nPost('/agendamentos') === 1, `tentativas=${nPost('/agendamentos')}`);

// 8) mesmo serviço no mesmo dia
reset({ ocupados: 0, agendamento: 'duplicado' });
r = await conversa([...base, '52998224725', 'sim']);
confere('8 serviço duplicado no dia: NÃO transfere, explica e espera o paciente decidir', !r.handoff && /Vi que esse paciente já tem/.test(r.reply) && /manter esse que já está marcado, marcar mais um em outro dia ou remarcar/.test(r.reply) && r.state.dup !== undefined && r.state.fim === false, r.reply.replace(/\n/g, ' | '));

// 9) CPF já existe no cadastro na hora de cadastrar (corrida): usa o existente
reset({ ocupados: 0, cpfDuplicado: true });
r = await conversa([...base, '12345678909', 'Joana Teste Souza', '10/05/1990', 'feminino', 'sim']);
confere('9 CPF_DUPLICADO: usa o paciente existente', r.reply.startsWith(MARCA_AGENDADO) && posts.find((x) => x.rota.endsWith('/agendamentos'))!.corpo.pacienteId === '66666666-6666-4666-8666-666666666666');

// 10) credencial somente leitura: o Clinilink recusa, a Amanda NÃO diz que agendou e passa para a equipe
reset({ ocupados: 0, somenteLeitura: true });
r = await conversa([...base, '52998224725', 'sim']);
confere('10 chave somente leitura: transfere e NÃO confirma', Boolean(r.handoff) && !r.reply.includes(MARCA_AGENDADO) && /SOMENTE_LEITURA/.test(r.handoff!.motivo), r.handoff?.motivo.slice(0, 80));
confere('10 só uma tentativa de gravar', posts.length === 1, `POSTs=${posts.length}`);

// 11) depois de agendar, uma mensagem nova abre jornada nova (não regrava)
reset({ ocupados: 0 });
r = await conversa([...base, '52998224725', 'sim', 'obrigada']);
confere('11 mensagem depois do fim não regrava', nPost('/agendamentos') === 1, `agendamentos=${nPost('/agendamentos')} | ${r.reply.replace(/\n/g, ' | ').slice(0, 80)}`);

// 12) o paciente manda "isso" e "pra amanhã" quase juntos: o resumo de unidades e médicos NÃO pode sumir
reset({ ocupados: 0 });
r = await responder([['quero agendar ginecologista'], ['isso', 'pra amanhã']], ctx, fonteClinilink) as any;
confere('12 mensagens juntas: mostra o resumo e, como ele já disse o dia, os horários desse dia nas duas unidades (sem perguntar a unidade antes)', /Tenho sim!/.test(r.reply) && /Guamá com a Dra\./.test(r.reply) && /Telégrafo com a Dra\./.test(r.reply) && /^1\. Guamá, /m.test(r.reply) && /^2\. Telégrafo, /m.test(r.reply) && !/Qual dos dois/.test(r.reply), r.reply.replace(/\n/g, ' | '));
confere('12 guardou o "amanhã" que ele já tinha dito', r.state.data === dia(1), String(r.state.data));

// 13) "oi" + pedido juntos: a saudação não pode se perder
reset({ ocupados: 0 });
r = await responder([['oi', 'quero agendar ginecologista']], ctx, fonteClinilink) as any;
confere('13 "oi" + pedido juntos: ainda cumprimenta', /^Oi( \p{L}+)?, (bom dia|boa tarde|boa noite)! Aqui é a Amanda/u.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 90));

// 14) CPF + "sim" juntos: o "sim" não confirma um nome que ele nunca viu (e nada é gravado)
reset({ ocupados: 0 });
r = await responder([...base.map((x) => [x]), ['52998224725', 'sim']], ctx, fonteClinilink) as any;
confere('14 CPF + sim juntos: mostra o nome para confirmar e NÃO reserva', /Achei aqui o cadastro/.test(r.reply) && posts.length === 0, `${r.reply.replace(/\n/g, ' | ')} | POSTs=${posts.length}`);

// 15) "sim" e "obrigada" juntos na confirmação do paciente: a reserva acontece (uma vez)
reset({ ocupados: 0 });
r = await responder([...base.map((x) => [x]), ['52998224725'], ['sim', 'obrigada']], ctx, fonteClinilink) as any;
confere('15 "sim" + "obrigada" juntos: reservou uma vez', nPost('/agendamentos') === 1, `agendamentos=${nPost('/agendamentos')}`);

// 16) falhas ANTES de uma transferência não contaminam a conversa nova (bug: "Olá" já era transferido)
reset({ ocupados: 0 });
r = await responder([['boa tarde, quero uma consulta'], ['ola, quero marcar uma consulta'], ['Olá'], ['quero agendar ginecologista']], ctx, fonteClinilink) as any;
confere('16 depois de uma transferência a jornada recomeça', !r.handoff && /agendar consulta Ginecologia|consulta Ginecologia/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 110));
r = await responder([['boa tarde, quero uma consulta'], ['ola, quero marcar uma consulta'], ['Olá']], ctx, fonteClinilink) as any;
confere('16 "Olá" depois de pedir uma consulta sem dizer qual: não transfere e segue com as opções', !r.handoff && /Me conta o que você precisa|Qual consulta|consultas mais procuradas/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 110));

// 17) jeito de falar dos áudios transcritos (frases longas, pontuação, números por extenso)
reset({ ocupados: 0 });
r = await responder([['Oi, bom dia! Eu queria marcar uma consulta com a ginecologista, por favor.'], ['Isso mesmo.'], ['Guamá.']], ctx, fonteClinilink) as any;
confere('17 áudio: pedido longo, confirmação e unidade falados', /Consegui estes aqui|Pra .* tenho/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 120));
r = await responder([['Oi, bom dia! Eu queria marcar uma consulta com a ginecologista, por favor.'], ['Isso mesmo.'], ['Guamá.'], ['Pode ser a segunda opção.']], ctx, fonteClinilink) as any;
confere('17 áudio: "a segunda opção" escolhe a 2ª da lista (não é segunda-feira)', /dados do paciente/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 120));
reset({ ocupados: 0 });
r = await responder([...base.map((x) => [x]), ['O meu CPF é 123 456 789 09.'], ['Meu nome é Joana Teste Souza.'], ['Nasci em 10 de maio de 1990.'], ['Sou mulher.'], ['Pode sim.']], ctx, fonteClinilink) as any;
confere('17 áudio: CPF espaçado, nome com "meu nome é", nascimento por extenso, "sou mulher" -> agenda', r.reply.startsWith(MARCA_AGENDADO) && nPost('/agendamentos') === 1, r.reply.replace(/\n/g, ' | ').slice(0, 100));
const cad17 = posts.find((x) => x.rota.endsWith('/pacientes'))?.corpo;
confere('17 cadastro certo: nome limpo, 1990-05-10, feminino', cad17?.nome === 'Joana Teste Souza' && cad17?.dataNascimento === '1990-05-10' && cad17?.sexo === 'feminino' && cad17?.cpf === '12345678909', JSON.stringify({ nome: cad17?.nome, nasc: cad17?.dataNascimento, sexo: cad17?.sexo }));

// ===================== pagamento (pix / link / recepção) =====================
const hojeSP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const comprovantes: Record<string, any> = {
  'img-ok': { tipo: 'comprovante', valor: 100, data: hojeSP, destinatario: 'CLINEX SERVICOS MEDICOS LTDA', status: 'concluido' },
  'img-maior': { tipo: 'comprovante', valor: 120, data: hojeSP, destinatario: 'CLINEX', status: 'concluido' },
  'img-menor': { tipo: 'comprovante', valor: 50, data: hojeSP, destinatario: 'CLINEX', status: 'concluido' },
  'img-outro-recebedor': { tipo: 'comprovante', valor: 100, data: hojeSP, destinatario: 'FULANO DE TAL', status: 'concluido' },
  'img-antigo': { tipo: 'comprovante', valor: 100, data: '2026-01-10', destinatario: 'CLINEX', status: 'concluido' },
  'img-agendado': { tipo: 'comprovante', valor: 100, data: hojeSP, destinatario: 'CLINEX', status: 'agendado' },
  'img-foto': { tipo: 'outro' },
};
const ctxPix = { ...ctx, lerComprovante: async (id: string) => comprovantes[id] ?? { tipo: 'ilegivel' } };
const base0 = ['oi', 'quero agendar ginecologista', 'sim', 'guama amanhã'];
const baseP = [...base0, '52998224725', 'sim']; // serviço, dia, dados do paciente (já cadastrado) e confirmação do nome: a próxima pergunta é a forma de pagamento
const img = (id: string) => `[[midia:image:${id}]]`;
const resp = async (turnos: (string | string[])[], c: any = ctxPix) => (await responder(turnos, c, fonteClinilink)) as any;

// P1) depois de escolher o horário: confirma o que ficou combinado e já pede os dados do paciente; só depois dos dados vem a forma de pagamento
reset({ ocupados: 0 });
r = await resp(base0.map((x) => [x]));
confere('P1 assim que o horário é escolhido: resumo (dia, médica...) e, em outra mensagem, o pedido dos dados (nome, nascimento, telefone, CPF); nada de pix ainda', /Show, então fica consulta Ginecologia no Guamá/.test(r.reply) && /Pra gerar o agendamento, me manda por favor os dados do paciente:\n• Nome completo\n• Data de nascimento\n• Telefone para contato \(pode ser esse número do WhatsApp\)\n• CPF$/.test(r.reply) && !/Chave pix/.test(r.reply) && !r.state.pagPerguntado && !r.state.pixEnviado, r.reply.replace(/\n/g, ' | ').slice(0, 330));
r = await resp(baseP.map((x) => [x]));
confere('P1 com os dados completos (paciente já cadastrado, nome confirmado): pergunta como ele prefere pagar, oferecendo o pix com o valor', /^Como você prefere pagar\? Dá pra antecipar o pagamento por pix \(o valor é R\$ 100,00\), que agiliza o seu atendimento na recepção, pagar na recepção, no dia do atendimento, ou por link de crédito\.$/.test(r.reply) && !/Chave pix/.test(r.reply) && r.state.pagPerguntado === true && !r.state.pixEnviado, r.reply.replace(/\n/g, ' | '));

// P2) "na recepção" não é pedido de atendente; segue para o CPF e registra na observação
reset({ ocupados: 0 });
r = await resp([...base0, 'vou pagar na recepção'].map((x) => [x]));
confere('P2 "na recepção" dito antes dos dados fica anotado e segue para o CPF (não transfere)', !r.handoff && /CPF/.test(r.reply) && /recepção/.test(r.reply) && r.state.pagPref === 'recepcao', r.reply.replace(/\n/g, ' | ').slice(0, 110));
r = await resp([...base0, 'na recepção', '52998224725', 'sim'].map((x) => [x]));
confere('P2 agendou e a observação diz "Pagamento na recepção"', r.reply.startsWith(MARCA_AGENDADO) && /Pagamento na recepção/.test(posts.find((x) => x.rota.endsWith('/agendamentos'))!.corpo.observacao), posts.find((x) => x.rota.endsWith('/agendamentos'))?.corpo.observacao);
reset({ ocupados: 0 });
r = await resp([...baseP, 'na recepção'].map((x) => [x]));
confere('P2 respondendo "na recepção" à pergunta do pagamento: agenda (sem pix, sem pedir nada de novo)', r.reply.startsWith(MARCA_AGENDADO) && nPost('/agendamentos') === 1 && /Pagamento na recepção/.test(posts.find((x) => x.rota.endsWith('/agendamentos'))!.corpo.observacao), r.reply.slice(0, 60));

// P3) pix: só sai a chave quando ele escolhe pix; manda a chave e o valor, e ESPERA o comprovante (nada de reserva antes)
reset({ ocupados: 0 });
r = await resp([...baseP, 'pix'].map((x) => [x]));
confere('P3 pix: envia a chave com o valor e pede o comprovante', /Chave pix: clinicaclinex@gmail\.com/.test(r.reply) && /R\$ 100,00/.test(r.reply) && /comprovante/.test(r.reply) && posts.length === 0, r.reply.replace(/\n/g, ' | '));
r = await resp([...baseP, 'pix', 'já paguei'].map((x) => [x]));
confere('P3 "já paguei" sem imagem: pede o comprovante', /Me manda o comprovante/.test(r.reply) && !/CPF/.test(r.reply), r.reply);
r = await resp([...baseP, 'pix', 'e aí, tudo bem?', 'qual o endereço?'].map((x) => [x]));
confere('P3 outras mensagens: continua esperando o comprovante, sem avançar', /aguardando o comprovante/.test(r.reply) && !/CPF/.test(r.reply) && posts.length === 0, r.reply);
r = await resp([...baseP, 'pix', 'qual a chave mesmo?'].map((x) => [x]));
confere('P3 pediu a chave de novo: reenvia', /Chave pix: clinicaclinex@gmail\.com/.test(r.reply), r.reply.replace(/\n/g, ' | '));

// P4) pix + comprovante certo: os dados já foram dados, então o comprovante conferido fecha o agendamento (e a confirmação mostra que foi pago)
reset({ ocupados: 0 });
r = await resp([...baseP, 'pix', img('img-ok')].map((x) => [x]));
confere('P4 comprovante certo: agenda na hora e a confirmação mostra "PAGO NO PIX"', r.reply.startsWith(MARCA_AGENDADO) && /Formas de pagamento: PAGO NO PIX \(comprovante recebido\)/.test(r.reply) && nPost('/agendamentos') === 1, r.reply.replace(/\n/g, ' | ').slice(0, 120));
confere('P4 registra o comprovante na observação do agendamento', /Pix antecipado: R\$ 100,00/.test(posts.find((x) => x.rota.endsWith('/agendamentos'))!.corpo.observacao), posts.find((x) => x.rota.endsWith('/agendamentos'))?.corpo.observacao);
reset({ ocupados: 0 });
r = await resp([...baseP, 'pix', img('img-maior')].map((x) => [x]));
confere('P4 valor maior que o da consulta é aceito', r.reply.startsWith(MARCA_AGENDADO) && /PAGO NO PIX/.test(r.reply));

// P5) comprovantes que NÃO servem
for (const [id, esperado, nome] of [
  ['img-foto', /não parece ser um comprovante/, 'imagem que não é comprovante'],
  ['img-antigo', /Preciso do comprovante do pagamento de hoje/, 'comprovante antigo'],
  ['img-agendado', /não mostra o pagamento como concluído/, 'pix só agendado'],
  ['desconhecida', /Não to conseguindo ler esse comprovante/, 'imagem ilegível'],
] as const) {
  reset({ ocupados: 0 });
  r = await resp([...baseP, 'pix', img(id)].map((x) => [x]));
  confere(`P5 ${nome}: pede outro comprovante e não avança`, esperado.test(r.reply) && !r.handoff && nPost('/agendamentos') === 0, r.reply.slice(0, 90));
}
r = await resp([...baseP, 'pix', img('img-outro-recebedor')].map((x) => [x]));
confere('P5 recebedor diferente: transfere para a equipe', Boolean(r.handoff) && /recebedor/.test(r.handoff.motivo), r.handoff?.motivo.slice(0, 100));
r = await resp([...baseP, 'pix', img('img-foto'), img('img-foto'), img('img-foto')].map((x) => [x]));
confere('P5 três imagens que não servem: transfere', Boolean(r.handoff), r.reply);
r = await resp([...baseP, 'pix', img('img-ok')].map((x) => [x]), { ...ctx });
confere('P5 sem leitura automática: transfere para conferir a imagem', Boolean(r.handoff) && /conferir a imagem/.test(r.handoff.motivo), r.handoff?.motivo.slice(0, 100));

// P6) desistiu do pix e quer só agendar: agenda sem comprovante, pagando na recepção
reset({ ocupados: 0 });
r = await resp([...baseP, 'pix', 'não vou pagar no pix, só quero agendar'].map((x) => [x]));
confere('P6 desistiu do pix: agenda sem comprovante (paga na recepção)', !r.handoff && r.reply.startsWith(MARCA_AGENDADO) && /Pagamento na recepção/.test(posts.find((x) => x.rota.endsWith('/agendamentos'))!.corpo.observacao), r.reply.slice(0, 60));

// P7) link de crédito vai para a equipe (com os dados do paciente); "não" a antecipar vai para a recepção; resposta solta pergunta de novo
reset({ ocupados: 0 });
r = await resp([...baseP, 'link de crédito'].map((x) => [x]));
confere('P7 link de crédito: passa para a equipe com a vaga e os dados do paciente anotados', Boolean(r.handoff) && /link de crédito/.test(r.handoff.motivo) && /AINDA NÃO feito/.test(r.handoff.motivo) && /Paciente já cadastrado \(Maria Exemplo/.test(r.handoff.motivo), r.handoff?.motivo.slice(0, 200));
r = await resp([...baseP, 'não'].map((x) => [x]));
confere('P7 "não" a antecipar: paga na recepção e agenda', !r.handoff && r.reply.startsWith(MARCA_AGENDADO), r.reply.slice(0, 80));
r = await resp([...baseP, 'hmm, deixa eu ver'].map((x) => [x]));
confere('P7 resposta solta à pergunta do pagamento: pergunta de novo, oferecendo as três formas', /Você prefere pagar por pix, link de crédito ou lá na recepção, no dia\?/.test(r.reply) && !r.handoff, r.reply);
r = await resp([...baseP, 'pix', 'hmm, deixa eu ver'].map((x) => [x]));
confere('P7 resposta solta depois da chave: segue esperando o comprovante, lembrando que pode pagar na recepção', /aguardando o comprovante do pix/.test(r.reply) && /pagar na recepção/.test(r.reply) && !r.handoff, r.reply);
r = await resp([...base0.slice(0, 3), 'guama amanhã, vou pagar no pix', '52998224725', 'sim'].map((x) => [x]));
confere('P7 já adiantou "no pix": depois dos dados não repete a pergunta, manda a chave', /Chave pix:/.test(r.reply) && !/Como você prefere pagar/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 90));

// P8) imagem fora da hora do comprovante: explica que só lê texto e áudio
reset({ ocupados: 0 });
r = await resp([...base0.slice(0, 2), img('img-foto')].map((x) => [x]));
confere('P8 imagem fora do pagamento: pede para escrever', /só leio texto e áudio/.test(r.reply), r.reply);

// ===================== depois do agendamento =====================
const pos = async (p: any, turnos: (string | string[])[]) => (await responder(turnos, { ...ctx, pos: p }, fonteClinilink)) as any;
let q = await pos('confirmado', [['obrigado']]);
confere('Q1 "obrigado" depois do agendamento: pergunta se pode ajudar em mais algo', /Posso te ajudar com mais alguma coisa\?/.test(q.reply) && !q.handoff, q.reply);
q = await pos('confirmado', [['Obrigada, valeu!']]);
confere('Q1 outro agradecimento também', /mais alguma coisa/.test(q.reply), q.reply);
q = await pos('confirmado', [['👍']]);
confere('Q1 só um emoji de joinha conta como agradecimento', /mais alguma coisa/.test(q.reply), q.reply);
q = await pos('perguntou_mais', [['não, era só isso, obrigado']]);
confere('Q2 "era só isso": agradece e deseja um ótimo dia', /Tenha um ótimo dia/.test(q.reply) && !q.handoff, q.reply);
q = await pos('perguntou_mais', [['não']]);
confere('Q2 "não": despede', /Tenha um ótimo dia/.test(q.reply), q.reply);
q = await pos('perguntou_mais', [['obrigado']]);
confere('Q2 só "obrigado" à pergunta de mais algo: despede', /Tenha um ótimo dia/.test(q.reply), q.reply);
q = await pos('perguntou_mais', [['sim']]);
confere('Q3 "sim": pergunta o que quer agendar', /qual consulta ou exame você quer agendar/i.test(q.reply), q.reply);
q = await pos('perguntou_mais', [['sim'], ['quero agendar ginecologista']]);
confere('Q3 depois do "sim", o pedido segue o fluxo normal', /consulta Ginecologia/.test(q.reply) && !/Aqui é a Amanda/.test(q.reply), q.reply);
q = await pos('confirmado', [['quero marcar outra consulta de ginecologia']]);
confere('Q3 "quero marcar outra consulta" já começa o novo agendamento', /consulta Ginecologia/.test(q.reply), q.reply);
q = await pos('confirmado', [['obrigado', 'era só isso']]);
confere('Q4 "obrigado" + "era só isso" juntos: só a despedida', /Tenha um ótimo dia/.test(q.reply), q.reply);
q = await pos('encerrou', [['obrigado']]);
confere('Q5 agradecimento depois da despedida: sem resposta', q.silencio === true && q.reply === '', JSON.stringify({ silencio: q.silencio, reply: q.reply }));
q = await pos('encerrou', [['tchau']]);
confere('Q5 "tchau" depois da despedida: sem resposta', q.silencio === true, JSON.stringify({ silencio: q.silencio }));
q = await pos('encerrou', [['quero marcar uma consulta de ginecologia']]);
confere('Q5 pedido novo depois da despedida: atende normalmente', /consulta Ginecologia/.test(q.reply), q.reply);
q = await pos('confirmado', [['preciso de um atendente']]);
confere('Q6 pedido de atendente depois do agendamento continua valendo', Boolean(q.handoff), q.reply);

// ===================== pagamento parcial e retomada =====================
Object.assign(comprovantes, {
  'img-meio': { tipo: 'comprovante', valor: 50, data: hojeSP, destinatario: 'CLINEX', status: 'concluido', transacao: 'E111' },
  'img-meio-de-novo': { tipo: 'comprovante', valor: 50, data: hojeSP, destinatario: 'CLINEX', status: 'concluido', transacao: 'E111' },
  'img-resto': { tipo: 'comprovante', valor: 50, data: hojeSP, destinatario: 'CLINEX', status: 'concluido', transacao: 'E222' },
});

// R1) pagou menos: soma, explica a diferença e oferece o restante por pix ou na recepção (não vai direto para a equipe)
reset({ ocupados: 0 });
r = await resp([...baseP, 'pix', img('img-meio')].map((x) => [x]));
confere('R1 valor menor: reconhece o que pagou, diz quanto falta e oferece escolher', !r.handoff && /Recebi o seu comprovante de R\$ 50,00/.test(r.reply) && /faltam R\$ 50,00/.test(r.reply) && /restante agora por pix ou deixar para pagar na recepção/.test(r.reply) && posts.length === 0, r.reply);
r = await resp([...baseP, 'pix', img('img-meio'), 'deixa o resto para pagar na recepção'].map((x) => [x]));
confere('R1 resto na recepção: agenda e a confirmação mostra o que foi pago no pix e que o restante fica na recepção', !r.handoff && r.reply.startsWith(MARCA_AGENDADO) && /Formas de pagamento: PAGO R\$ 50,00 NO PIX \(comprovante recebido\); o restante na recepção/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 200));
r = await resp([...baseP, 'pix', img('img-meio'), 'deixa o resto para pagar na recepção'].map((x) => [x]));
const obsParcial = posts.find((x) => x.rota.endsWith('/agendamentos'))?.corpo.observacao ?? '';
confere('R1 agenda e a observação avisa: pix parcial + saldo na recepção', r.reply.startsWith(MARCA_AGENDADO) && /PARCIAL de R\$ 50,00/.test(obsParcial) && /Saldo de R\$ 50,00 a pagar na recepção/.test(obsParcial), obsParcial);

// R2) paga o resto por pix: os comprovantes somam
reset({ ocupados: 0 });
r = await resp([...baseP, 'pix', img('img-meio'), 'vou pagar o resto agora no pix'].map((x) => [x]));
confere('R2 resto por pix: manda a chave com o valor que falta', /Chave pix:/.test(r.reply) && /Valor que falta: R\$ 50,00/.test(r.reply), r.reply.replace(/\n/g, ' | '));
r = await resp([...baseP, 'pix', img('img-meio'), 'pix', img('img-resto')].map((x) => [x]));
confere('R2 segundo comprovante completa o valor: agenda e a confirmação mostra "PAGO NO PIX"', r.reply.startsWith(MARCA_AGENDADO) && /Formas de pagamento: PAGO NO PIX \(comprovante recebido\)/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 160));
r = await resp([...baseP, 'pix', img('img-meio'), 'pix', img('img-resto')].map((x) => [x]));
confere('R2 observação registra o total e que foram dois comprovantes', /Pix antecipado: R\$ 100,00 .*mais de um comprovante/.test(posts.find((x) => x.rota.endsWith('/agendamentos'))?.corpo.observacao ?? ''), posts.find((x) => x.rota.endsWith('/agendamentos'))?.corpo.observacao);

// R3) o mesmo comprovante não conta duas vezes
reset({ ocupados: 0 });
r = await resp([...baseP, 'pix', img('img-meio'), img('img-meio-de-novo')].map((x) => [x]));
confere('R3 comprovante repetido: avisa que já recebeu e não soma de novo', /já recebi/.test(r.reply) && !/Recebi o seu comprovante, muito obrigada/.test(r.reply), r.reply);

// R4) indecisão: depois de 3 respostas soltas passa para a equipe; pedir atendente também
r = await resp([...baseP, 'pix', img('img-meio'), 'hmm', 'não sei', 'talvez'].map((x) => [x]));
confere('R4 sem decidir o restante: passa para a equipe com o valor anotado', Boolean(r.handoff) && /não definiu como pagar o restante/.test(r.handoff.motivo), r.handoff?.motivo.slice(0, 90));
r = await resp([...baseP, 'pix', img('img-meio'), 'quero falar com um atendente'].map((x) => [x]));
confere('R4 pediu atendente: transfere', Boolean(r.handoff));

// ===================== retomar depois de uma transferência =====================
// T1) transferência "branda" (comprovante com problema, vaga, falha): o paciente volta e a conversa CONTINUA de onde parou
reset({ ocupados: 0 });
r = await resp([...baseP, 'pix', img('img-foto'), img('img-foto'), img('img-foto'), 'ja paguei'].map((x) => [x]));
confere('T1 volta depois de transferência branda: continua esperando o comprovante', !r.handoff && /Me manda o comprovante/.test(r.reply) && r.aposHandoffDuro === false, r.reply);
r = await resp([...baseP, 'pix', img('img-foto'), img('img-foto'), img('img-foto'), img('img-ok')].map((x) => [x]));
confere('T1 e o comprovante certo depois da transferência é aceito (e agenda)', r.reply.startsWith(MARCA_AGENDADO), r.reply.slice(0, 80));
r = await resp([...baseP, 'link de crédito', 'melhor, vou pagar no pix'].map((x) => [x]));
confere('T1 depois do link de crédito a equipe assume: a Amanda NÃO retoma sozinha (nem para mandar o pix)', r.aposHandoffDuro === true, String(r.aposHandoffDuro));
r = await resp([['boa tarde, quero uma consulta'], ['ola, quero marcar uma consulta'], ['Olá']]);
confere('T1 "Olá" depois de pedir uma consulta sem dizer qual: não transfere e segue com as opções', !r.handoff && /Me conta o que você precisa|Qual consulta|consultas mais procuradas/.test(r.reply), r.reply);
// T2) transferência "dura" (o paciente pediu um humano): a Amanda não retoma sozinha
r = await resp([['oi'], ['quero falar com um atendente'], ['??']]);
confere('T2 pediu atendente e voltou a escrever: a Amanda não retoma', r.aposHandoffDuro === true, String(r.aposHandoffDuro));
r = await resp([['estou com dor no peito e falta de ar'], ['ok']]);
confere('T2 urgência: a Amanda não retoma', r.aposHandoffDuro === true, String(r.aposHandoffDuro));
// T3) quer retomar um atendimento antigo
r = await resp([['Voltei, quero retomar meu agendamento']]);
confere('T3 "quero retomar meu agendamento": acolhe e pergunta o que precisa', !r.handoff && /retomar o seu agendamento/.test(r.reply) && /Qual consulta ou exame/.test(r.reply), r.reply);

// ===================== dúvidas no meio do fluxo =====================
const um = (txt: string) => [txt];
const ate3 = ['oi', 'quero agendar ginecologista', 'sim']; // parou na pergunta da unidade
reset({ ocupados: 0 });
r = await resp([['qual o horário de atendimento de vocês?']]);
confere('F1 sem serviço: responde o horário e pergunta o que ele precisa (sem contar como "não entendi")', /segunda a sexta, das 7h às 17h/.test(r.reply) && /Posso te ajudar a agendar sim/.test(r.reply) && !r.handoff && r.state.falhas === 0, r.reply.replace(/\n/g, ' | ').slice(0, 170));
r = await resp([['quanto custa a consulta de ginecologia?']]);
confere('F2 valor + serviço na mesma frase: informa o valor e confirma o serviço', /A consulta é R\$ 100,00/.test(r.reply) && /(?:Ah, então é|Entendi, você quer|Só pra confirmar: é|Então é) consulta Ginecologia/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 170));
r = await resp([...ate3.map(um), um('qual o endereço de vocês?')]);
confere('F3 endereço no meio do fluxo: manda o endereço das duas unidades (aprovado pela clínica) e RETOMA a pergunta da unidade', /Guamá: Endereço: Av. José Bonifácio, 2426 - Guamá, Belém - PA, 66063-075/.test(r.reply) && /Telégrafo: Travessa Coronel Luís Bentes/.test(r.reply) && /Qual dos dois você prefere/.test(r.reply) && !/equipe/.test(r.reply) && !r.handoff, r.reply.replace(/\n/g, ' | ').slice(0, 220));
r = await resp([...baseP, 'pix', 'qual o valor?'].map(um));
confere('F4 "qual o valor?" depois da chave pix: responde o valor e reenvia a chave', /R\$ 100,00/.test(r.reply) && /Chave pix: clinicaclinex@gmail\.com/.test(r.reply) && !r.handoff, r.reply.replace(/\n/g, ' | ').slice(0, 200));
r = await resp([...baseP, 'pix', 'qual o valor?'].map(um));
confere('F5 valor esperando o comprovante: reenvia a chave com o valor (sem duplicar resposta)', /^Aqui está!/.test(r.reply) && /Chave pix:/.test(r.reply), r.reply.replace(/\n/g, ' | '));
r = await resp([...ate3.map(um), um('??')]);
confere('F6 "??" no meio do fluxo: "Estou aqui" e repete a pergunta pendente', /^Tô aqui!/.test(r.reply) && /Qual dos dois você prefere/.test(r.reply), r.reply.replace(/\n/g, ' | '));
r = await resp([...base.map(um), um('qual o endereço?')]);
confere('F7 dúvida no pedido do CPF: responde o endereço e volta a pedir o CPF', /Av. José Bonifácio/.test(r.reply) && /CPF do paciente/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 200));
r = await resp([...base.map(um), um('12345678909'), um('qual o endereço de vocês')]);
confere('F8 dúvida (sem "?") na hora do nome: NÃO vira o nome do paciente', r.state.cad?.nome === undefined && /nome completo/.test(r.reply) && /Av. José Bonifácio/.test(r.reply), `${r.state.cad?.nome} | ${r.reply.replace(/\n/g, ' | ').slice(0, 150)}`);
r = await resp([...ate3.map(um), um('qual o endereço?'), um('pode chamar alguém da equipe')]);
confere('F9 depois do endereço, "pode chamar alguém da equipe" transfere', Boolean(r.handoff), r.reply);
r = await resp([...ate3.map(um), um('quais médicos atendem?')]);
confere('F10 "quais médicos atendem?": mostra os médicos de cada unidade e volta à pergunta', /Dra\. Medica/.test(r.reply) && /Qual dos dois você prefere/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 220));
r = await resp([...baseP, 'pix', 'aceita cartão de crédito?'].map(um));
confere('F11 "aceita cartão?": explica as formas de pagamento (o que a clínica aceita na recepção) e segue esperando o comprovante; não vira escolha de link nem transfere', !r.handoff && /Na recepção, no dia, aceitamos pix, cartão de crédito e débito e dinheiro/.test(r.reply) && /aguardando o comprovante/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 260));
r = await resp([['funciona sábado?'], ['quero agendar ginecologista']]);
confere('F12 dúvida e depois o pedido: o fluxo segue normalmente', /(?:Ah, então é|Entendi, você quer|Só pra confirmar: é|Então é) consulta Ginecologia/.test(r.reply) && !r.handoff, r.reply.slice(0, 100));

// ===================== mudou de ideia =====================
r = await resp([...base0.map(um), um('prefiro o Telégrafo')]);
confere('C1 trocou de unidade depois de escolher o horário: ajusta e mostra novas opções', /Sem problema, vamos ajustar|Tranquilo, a gente ajusta/.test(r.reply) && r.state.unidade?.nome === 'Telégrafo' && !r.state.slot && !r.handoff, r.reply.replace(/\n/g, ' | ').slice(0, 160));
r = await resp([...base0.map(um), um('prefiro o Telégrafo'), um('1')]);
confere('C1 e ao escolher o novo horário, mostra o resumo da nova unidade e pede os dados do paciente', /Telégrafo/.test(r.reply) && /Show, então fica|Beleza, então fica/.test(r.reply) && /me manda por favor os dados do paciente/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(-230));
r = await resp([...baseP, 'prefiro o Telégrafo', '1'].map(um));
confere('C1 com os dados já dados, trocar de unidade antes do pagamento refaz o horário e volta direto para a pergunta do pagamento', /Telégrafo/.test(r.reply) && /Como você prefere pagar/.test(r.reply) && !/dados do paciente/.test(r.reply) && r.state.cpf === '52998224725', r.reply.replace(/\n/g, ' | ').slice(-250));
r = await resp([...base0.map(um), um('queria outro dia')]);
confere('C2 "queria outro dia": volta a oferecer datas', /Sem problema, vamos ajustar|Tranquilo, a gente ajusta/.test(r.reply) && /Consegui estes aqui|tenho/.test(r.reply) && !r.state.slot, r.reply.replace(/\n/g, ' | ').slice(0, 140));
r = await resp([...baseP, 'pix', 'outro dia eu pago'].map(um));
confere('C3 esperando o pix, "outro dia eu pago" NÃO troca o horário', !/vamos ajustar/.test(r.reply) && Boolean(r.state.slot), r.reply.slice(0, 110));
r = await resp([...base0.map(um), um('na verdade quero dermatologia')]);
confere('C4 trocou de serviço depois de escolher o horário: recomeça pelo novo serviço', /consulta Dermatologia/i.test(r.reply) && !r.state.slot && !r.handoff, r.reply.slice(0, 120));
r = await resp([...base.map(um), um('52998224725'), um('prefiro outro dia')]);
confere('C5 depois do CPF (o pagamento ainda não foi fechado), "prefiro outro dia" ajusta o horário e mantém os dados do paciente', /vamos ajustar|a gente ajusta/.test(r.reply) && !r.state.slot && r.state.cpf === '52998224725', r.reply.slice(0, 110));

// ===================== CPF =====================
const { cpfValido } = await import('../src/agents/receptivo/script/engine.js');
confere('V0 cpfValido: aceita os válidos e recusa os errados', cpfValido('03185344286') && cpfValido('529.982.247-25') && !cpfValido('11122233344') && !cpfValido('11111111111') && !cpfValido('123'), '');
r = await resp([...base.map(um), um('11122233344')]);
confere('V1 CPF com dígito errado: pede para conferir e não consulta o paciente', /número do CPF escapou/.test(r.reply) && !r.state.cpf, r.reply);
r = await resp([...base.map(um), um('111.111.111-11')]);
confere('V2 CPF com todos os dígitos iguais: recusa', /número do CPF escapou/.test(r.reply), r.reply.slice(0, 60));
r = await resp([...base.map(um), um('11122233344'), um('52998224725')]);
confere('V3 depois de corrigir, segue normalmente', /Achei aqui o cadastro/.test(r.reply), r.reply);

// ===================== profissional pelo nome, sinônimos, sem transferir sozinha =====================
const dd = async (turnos: (string | string[])[]) => (await responder(turnos.map((x) => (Array.isArray(x) ? x : [x])), ctxPix, fonteClinilink)) as any;

// D1) "quero agendar com a dra Rebecca": acha a profissional pelo nome e o serviço dela, em vez de procurar "rebecca" como exame
reset({ ocupados: 0 });
r = await dd(['Quero agendar uma consulta com a dra Rebecca']);
confere('D1 acha a profissional pelo nome e confirma o atendimento dela', /consulta Ginecologia com a Dra\. Rebecca/.test(r.reply) && r.state.servico?.profissional?.id === P_REB && !r.handoff, r.reply.replace(/\n/g, ' | ').slice(0, 200));
r = await dd(['Quero agendar uma consulta com a dra Rebecca amanhã de manhã']);
confere('D1 nome seguido de dia/período: acha a pessoa e guarda o que ele adiantou', r.state.servico?.profissional?.id === P_REB && r.state.turno === 'manhã' && Boolean(r.state.data), JSON.stringify({ prof: r.state.servico?.profissional?.nome, turno: r.state.turno, data: r.state.data }));
r = await dd(['quero consulta com o dr xavier']);
confere('D1 doutor que não existe: diz que não achou e pede mais um dado (NÃO transfere)', /Não achei Xavier entre os profissionais/.test(r.reply) && !r.handoff, r.reply);

// D2) o atendimento inteiro com a profissional escolhida: só a agenda dela, e a reserva vai com o id dela
posts.length = 0;
r = await dd(['Quero agendar uma consulta com a dra Rebecca', 'sim']);
confere('D2 depois do "sim": mostra só as unidades e os horários dela, sem repetir o nome', /Tenho sim! No Guamá\./.test(r.reply) && !/No Guamá com a Dra\. Rebecca/.test(r.reply) && /Consegui estes aqui/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 260));
confere('D2 os horários oferecidos são os dela (Rebecca) e o preço aparece', /A consulta é R\$ 100,00/.test(r.reply), '');
r = await dd(['Quero agendar uma consulta com a dra Rebecca', 'sim', '1', 'na recepção', '52998224725', 'sim']);
const agD = posts.find((x) => x.rota.endsWith('/agendamentos'))?.corpo;
confere('D2 reserva gravada com o id da profissional pedida', r.reply.startsWith(MARCA_AGENDADO) && agD?.profissionalId === P_REB && /Dra\. Rebecca/.test(r.reply), `${agD?.profissionalId} | ${r.reply.slice(0, 120)}`);

// D3) nome parecido (rebeca ~ rebecca) e quem não tem horário: oferece a especialidade com outros profissionais
r = await dd(['quero uma consulta com a doutora rebeca']);
confere('D3 profissional sem horários: avisa e oferece a especialidade com outros profissionais (NÃO transfere)', /não tem horário aberto/.test(r.reply) && /Cardiologia/.test(r.reply) && /(né|é isso)\?/.test(r.reply) && !r.handoff && !r.state.servico?.profissional, r.reply.replace(/\n/g, ' | ').slice(0, 240));

// D4) vários parecidos: pergunta qual
r = await dd(['quero agendar com a dra silva']);
confere('D4 duas pessoas com o mesmo sobrenome: lista as opções com a especialidade', /Achei estas opções/.test(r.reply) && /Dra\. Medica \(Ginecologia\)/.test(r.reply) && /Dra\. Rebecca \(Ginecologia\)/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 220));
r = await dd(['quero agendar com a dra silva', '2']);
confere('D4 escolhendo pelo número, segue com a pessoa escolhida', /consulta Ginecologia com a Dra\. Rebecca/.test(r.reply) && r.state.servico?.profissional?.id === P_REB, r.reply.slice(0, 120));

// D5) falar "com cardiologista" não é nome de pessoa
r = await dd(['quero uma consulta com cardiologista']);
confere('D5 "com cardiologista" segue o fluxo de especialidade', /(?:Ah, então é|Entendi, você quer|Só pra confirmar: é|Então é) consulta Cardiologia/.test(r.reply) && !r.state.servico?.profissional, r.reply.slice(0, 100));

// D6) ultrassom -> USG -> ultrassonografia
r = await dd(['quero fazer um ultrassom']);
confere('D6 "ultrassom" acha o exame cadastrado como USG', /Usg Abdome Total/i.test(r.reply) && !/Não consegui/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 140));
r = await dd(['preciso de uma ultrassonografia']);
confere('D6 "ultrassonografia" também', /Usg Abdome Total/i.test(r.reply), r.reply.slice(0, 100));

// D7) não transfere sozinha por não entender
r = await dd(['zzzzz']);
confere('D7 1ª vez sem entender: pede de novo e já sugere dizer o nome do médico', /não peguei qual é o serviço/.test(r.reply) && /nome do médico também/.test(r.reply) && !r.handoff, r.reply);
r = await dd(['zzzzz', 'qqqqq', 'zzzzz qqqqq', 'qqqqq']);
confere('D7 mesmo depois de várias vezes: NÃO transfere, lembra que pode chamar a equipe', !r.handoff && /Ainda não consegui entender/.test(r.reply) && /falar com a equipe é só me pedir/.test(r.reply), r.reply.slice(0, 160));
r = await dd(['zzzzz', 'qqqqq', 'quero falar com a equipe']);
confere('D7 e se ele pedir a equipe, transfere', Boolean(r.handoff), r.reply);
r = await dd(['zzzzz', 'qqqqq', 'quero agendar ginecologista']);
confere('D7 depois de não entender, consegue pedir de outro jeito e o fluxo segue', /(?:Ah, então é|Entendi, você quer|Só pra confirmar: é|Então é) consulta Ginecologia/.test(r.reply), r.reply.slice(0, 100));

// ===================== serviços com nome parecido / não encontrados =====================
// N1) "teste ergométrico" mas o cadastro chama de ERGOMETRIA: acha pelo radical
r = await dd(['Quero fazer um teste ergométrico']);
confere('N1 "teste ergométrico" vai direto ao serviço de nome igual (Teste Ergometrico)', /(?:Ah, então é|Entendi, você quer|Só pra confirmar: é|Então é) Teste Ergometrico/.test(r.reply) && !/Não achei|Não encontrei|Não peguei/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 170));
r = await dd(['queria um teste de esforço']);
confere('N1 "teste de esforço" chega ao Teste de Esforço com ECG', /(?:Ah, então é|Entendi, você quer|Só pra confirmar: é|Então é) Teste de Esforco Com Ecg/i.test(r.reply) && !/Não achei|Não encontrei/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 200));
// N2) palavra solta que não é uma raiz conhecida: tenta o radical ("fonoaudiologo" -> "fonoaudiol")
r = await dd(['quero marcar com fonoaudiologo']);
confere('N2 palavra parecida: "fonoaudiologo" acha Fonoaudiologia pelo radical', /Fonoaudiologia/.test(r.reply) && !/Não achei|Não encontrei/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 150));
// N3) não existe de jeito nenhum: diz com franqueza, oferece a equipe e só transfere se ele aceitar
r = await dd(['Quero fazer uma audiometria amanhã de manhã']);
confere('N3 dia e período ditos junto com o serviço não entram no nome do serviço procurado', /Não achei audiometria pra agendar por aqui/.test(r.reply) && !/amanha|manha/i.test(r.state.ofereceuEquipe ?? ''), `${r.state.ofereceuEquipe} | ${r.reply.replace(/\n/g, ' | ').slice(0, 140)}`);
r = await dd(['Quero fazer uma audiometria']);
confere('N3 serviço não encontrado: avisa e OFERECE a equipe (não transfere sozinha)', /Não achei audiometria pra agendar por aqui/.test(r.reply) && /Quer que eu chame alguém da equipe/.test(r.reply) && !r.handoff && r.state.ofereceuEquipe === 'audiometria', r.reply.replace(/\n/g, ' | ').slice(0, 220));
r = await dd(['Quero fazer uma audiometria', 'sim']);
confere('N3 "sim": transfere com o motivo certo para a equipe conferir o cadastro', Boolean(r.handoff) && /audiometria/.test(r.handoff.motivo) && /Agendamento via chatbot/.test(r.handoff.motivo), r.handoff?.motivo.slice(0, 120));
r = await dd(['Quero fazer uma audiometria', 'não']);
confere('N3 "não": volta a perguntar o que ele precisa', !r.handoff && /Qual outra consulta ou exame/.test(r.reply), r.reply);
r = await dd(['Quero fazer uma audiometria', 'então quero ginecologista']);
confere('N3 muda de pedido depois do aviso: o fluxo segue normalmente', /(?:Ah, então é|Entendi, você quer|Só pra confirmar: é|Então é) consulta Ginecologia/.test(r.reply) && !r.handoff && !r.state.ofereceuEquipe, r.reply.slice(0, 100));
r = await dd(['quero fazer um exame de hemoglobina glicada']);
confere('N3 exame fora das raízes conhecidas também recebe o aviso com o nome que ele disse', /Não achei hemoglobina glicada/.test(r.reply) && !r.handoff, r.reply.slice(0, 120));
r = await dd(['preciso de uma informação']);
confere('N3 pedido de informação não vira "serviço não encontrado"', !/Não achei|Não encontrei/.test(r.reply), r.reply.slice(0, 120));

// ===================== PREÇO: sempre `preco`, nunca `precoDinheiro`, nunca "R$ 0,00" =====================
const todasAsRespostas = async (turnos: string[]) => { const rs: string[] = []; for (let i = 1; i <= turnos.length; i++) rs.push(((await responder(turnos.slice(0, i).map((x) => [x]), ctxPix, fonteClinilink)) as any).reply); return rs.join('\n---\n'); };
// $1) o caso real: preco 140 / precoDinheiro 0 em uma unidade e 999 na outra -> tem que dizer R$ 100,00 (o preco), sempre
reset({ ocupados: 0 });
let txt = await todasAsRespostas(['oi', 'quero agendar ginecologista', 'sim']);
confere('$1 preço dito = campo preco (R$ 100,00), ignorando precoDinheiro zerado', /A consulta é R\$ 100,00\./.test(txt) && !/R\$ 0,00|R\$ 999,00/.test(txt), txt.replace(/\n/g, ' | ').slice(-200));
txt = await todasAsRespostas(['quero fazer um teste de esforço', 'sim']);
confere('$1 exame com precoDinheiro 0 no Guamá e 999 no outro: fala o preço (R$ 120,00) e NUNCA R$ 0,00 nem R$ 999,00', /O exame é R\$ 120,00\./.test(txt) && !/R\$ 0,00|R\$ 999,00/.test(txt), txt.replace(/\n/g, ' | ').slice(-230));
// $2) o pix usa o preco
r = await dd(['oi', 'quero agendar ginecologista', 'sim', 'guama amanhã', '52998224725', 'sim']);
confere('$2 valor do pix = preco (R$ 100,00)', /o valor é R\$ 100,00/.test(r.reply) && !/R\$ 0,00/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 120));
// $3) sem preço cadastrado (zero): não cita valor, não inventa; se perguntarem, a equipe confirma; pix não confere sozinho
txt = await todasAsRespostas(['quero agendar consulta semvalor', 'sim']);
confere('$3 preço zero: a resposta NÃO tem valor nenhum nem "R$ 0,00"', !/R\$/.test(txt), txt.replace(/\n/g, ' | ').slice(-160));
r = await dd(['quero agendar consulta semvalor', 'sim', 'qual o valor?']);
confere('$3 preço zero e o paciente pergunta o valor: diz que a equipe confirma (sem "zero")', /equipe confirme certinho/.test(r.reply) && !/R\$/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 200));
r = await dd(['quero agendar consulta semvalor', 'sim', 'guama', '1', '52998224725', 'sim', 'pix', img('img-ok')]);
confere('$3 preço zero + comprovante de pix: não confere valor sozinha, passa para a equipe conferir', Boolean(r.handoff) && /valor do serviço não está definido/.test(r.handoff.motivo), r.handoff?.motivo.slice(0, 110));

// ===================== similaridade: "teste ergo", "só teste", erro de digitação =====================
r = await dd(['Quero agendar um teste ergo']);
confere('S1 "teste ergo" (abreviado): acha "Teste Ergometrico" e confirma', /(?:Ah, então é|Entendi, você quer|Só pra confirmar: é|Então é) Teste Ergometrico/.test(r.reply) && !/Não peguei|Não achei|Não encontrei/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 170));
r = await dd(['teste']);
confere('S2 só "teste": sugere os serviços PRINCIPAIS com agenda (ergométrico entre eles), sem os testes rápidos de laboratório', /Achei estas opções/.test(r.reply) && /Teste Ergometrico/.test(r.reply) && /Teste de Esforco/i.test(r.reply) && !/Dengue|Rapido (Dengue|Covid|Hiv)|Coombs|Troponina/i.test(r.reply) && !r.handoff, r.reply.replace(/\n/g, ' | ').slice(0, 260));
r = await dd(['teste', '2']);
confere('S2 escolhendo uma das sugestões pelo número, segue o fluxo', /(?:Ah, então é|Entendi, você quer|Só pra confirmar: é|Então é) (Teste Ergometrico|Teste Rapido de Gravidez|Teste de Alergia|Teste de Esforco Com Ecg)/i.test(r.reply) && !/Dengue/i.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 130));
r = await dd(['quero um teste ergometrio']);
confere('S3 erro de digitação ("ergometrio"): acha Teste Ergometrico', /(?:Ah, então é|Entendi, você quer|Só pra confirmar: é|Então é) Teste Ergometrico/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 150));
r = await dd(['preciso fazer um teste alergia']);
confere('S3 "teste alergia" (palavras do nome fora de ordem/sem "de"): acha Teste De Alergia', /(?:Ah, então é|Entendi, você quer|Só pra confirmar: é|Então é) Teste de Alergia/i.test(r.reply), r.reply.slice(0, 120));
r = await dd(['quero fazer um exame de gravidez']);
confere('S4 "exame de gravidez": acha o Teste Rápido de Gravidez pelo nome parecido', /Gravidez/.test(r.reply) && !/Não achei|Não encontrei|Não peguei/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 140));
r = await dd(['oi']);
confere('S5 "oi" continua sendo só um cumprimento (não dispara busca)', /Me conta o que você precisa/.test(r.reply) && !/Achei estas|(?:Ah, então é|Entendi, você quer|Só pra confirmar: é|Então é)/.test(r.reply), r.reply);
r = await dd(['quero agendar zzzzz']);
confere('S6 nada parecido: diz que não encontrou e oferece a equipe', /Não achei zzzzz/.test(r.reply) && /chame alguém/.test(r.reply) && !r.handoff, r.reply.replace(/\n/g, ' | ').slice(0, 160));

// ===================== busca inteligente (catálogo grande, troca de letras, opções pendentes) =====================
r = await dd(['teste ergoemtrico']);
confere('I1 letras trocadas ("ergoemtrico"): acha Teste Ergometrico, não um teste qualquer', /(?:Ah, então é|Entendi, você quer|Só pra confirmar: é|Então é) Teste Ergometrico/.test(r.reply) && !/Dengue/i.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(-110));
r = await dd(['teste ergonmetrico']);
confere('I1 letra a mais ("ergonmetrico"): acha Teste Ergometrico', /(?:Ah, então é|Entendi, você quer|Só pra confirmar: é|Então é) Teste Ergometrico/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(-110));
r = await dd(['Quero agendar teste']);
confere('I2 "Quero agendar teste": as 5 sugestões incluem o ergométrico e NENHUM teste rápido de laboratório sem agenda', /Teste Ergometrico/.test(r.reply) && !/Dengue|Hiv|Sifilis|Covid|Troponina|Coombs/i.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 300));
r = await dd(['Quero agendar teste', 'Teste ergométrico']);
confere('I3 com opções na tela, um pedido NOVO ("Teste ergométrico") não vira "a primeira opção"', /(?:Ah, então é|Entendi, você quer|Só pra confirmar: é|Então é) Teste Ergometrico/.test(r.reply) && !/Dengue/i.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 140));
r = await dd(['Quero agendar teste', 'o segundo']);
confere('I3 escolher pela posição ("o segundo") continua funcionando', /(?:Ah, então é|Entendi, você quer|Só pra confirmar: é|Então é)/.test(r.reply) && !/Achei estas opções/.test(r.reply), r.reply.slice(0, 120));
r = await dd(['Quero agendar teste', 'esforço']);
confere('I3 escolher pelo nome de uma das opções ("esforço") também', /(?:Ah, então é|Entendi, você quer|Só pra confirmar: é|Então é) Teste de Esforco/i.test(r.reply), r.reply.slice(0, 120));
r = await dd(['Quero agendar teste', 'nao, quero consulta de dermatologia']);
confere('I3 e trocar de assunto com opções pendentes ("quero dermatologia") funciona', /(?:Ah, então é|Entendi, você quer|Só pra confirmar: é|Então é) consulta Dermatologia/i.test(r.reply), r.reply.slice(0, 120));

// ===================== datas e posições: "quinta", "quinta 22", "com a Liduina" (a conversa NÃO pode repetir a pergunta) =====================
const { lerData, lerEscolha } = await import('../src/agents/receptivo/script/engine.js');
const seg = { now: new Date('2026-10-19T15:00:00Z'), nome: '', tz: 'America/Sao_Paulo' }; // segunda-feira, 19/10/2026
for (const [txt, esp] of [['quinta', '2026-10-22'], ['quinta 22', '2026-10-22'], ['quinta-feira dia 29', '2026-10-29'], ['terca 27', '2026-10-27'], ['sexta 2', '2026-11-02'], ['quarta', '2026-10-21'], ['segunda', '2026-10-26'], ['dia 25', '2026-10-25'], ['25/10', '2026-10-25'], ['amanha', '2026-10-20']] as [string, string][]) {
  const got = lerData(txt, seg);
  confere(`K0 lerData("${txt}") = ${esp}`, got === esp, String(got));
}
for (const [txt, total, esp] of [['quinta', 4, -1], ['quinta 22', 4, -1], ['quarta', 4, -1], ['segunda', 4, -1], ['a quinta opcao', 5, 4], ['opcao quinta', 5, 4], ['o quinto', 5, 4], ['o quarto', 5, 3], ['o segundo', 3, 1], ['a primeira', 3, 0], ['2', 3, 1], ['terca', 3, -1], ['22 de outubro', 3, -1]] as [string, number, number][]) {
  const got = lerEscolha(txt, total);
  confere(`K0 lerEscolha("${txt}", ${total}) = ${esp}`, got === esp, String(got));
}

// a lista de horários na tela e o paciente responde com dia da semana, dia do mês ou o nome da médica
const nomeSemana = (ymd: string) => ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'][new Date(`${ymd}T12:00:00Z`).getUTCDay()];
const ateLista = ['oi', 'quero agendar ginecologista', 'sim', 'guama'];
reset({ ocupados: 0 });
r = await dd(ateLista);
confere('K1 ponto de partida: a lista de horários aparece com as duas médicas', /Consegui estes aqui/.test(r.reply) && /Dra\. Liduina/.test(r.reply) && Boolean(r.state.lista?.length), r.reply.replace(/\n/g, ' | ').slice(-230));
const diaDoMes = Number(dia(2).slice(8));
r = await dd([...ateLista, `${nomeSemana(dia(2))}`]);
confere('K1 responder só o dia da semana escolhe aquele dia (não repete a lista)', /me manda por favor os dados do paciente/.test(r.reply) && !/Consegui estes aqui/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(-190));
r = await dd([...ateLista, `${nomeSemana(dia(2))} ${diaDoMes}`]);
confere('K1 "dia da semana + número" ("quinta 22") escolhe aquele dia', /me manda por favor os dados do paciente/.test(r.reply) && !/Consegui estes aqui/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(-190));
r = await dd([...ateLista, `${nomeSemana(dia(2))} ${diaDoMes} com o armando`]);
confere('K1 e com um nome que não é de nenhum médico ("com o armando") a data vale e a conversa segue', /me manda por favor os dados do paciente/.test(r.reply) && !/Consegui estes aqui/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(-190));
r = await dd([...ateLista, 'quero com a liduina']);
confere('K2 citar a médica da lista: fica só com os horários dela (um só escolhe; vários mostra os dela)', /Dra\. Liduina/.test(r.reply) && (/me manda por favor os dados do paciente/.test(r.reply) || (/Com a Dra\. Liduina tenho/.test(r.reply) && !/Dra\. Medica/.test(r.reply))), r.reply.replace(/\n/g, ' | ').slice(-230));
r = await dd([...ateLista, 'o primeiro']);
confere('K2 "o primeiro" continua escolhendo a posição 1', /me manda por favor os dados do paciente/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(-120));
// o mesmo pedido 3 vezes não pode dar a mesma resposta 3 vezes: depois de entender, a conversa AVANÇA
const resp1 = (await dd([...ateLista, `${nomeSemana(dia(2))} ${diaDoMes}`])).reply;
const resp2 = (await dd([...ateLista, `${nomeSemana(dia(2))} ${diaDoMes}`, 'pode agendar'])).reply;
confere('K3 depois de escolher o dia, a pergunta seguinte é DIFERENTE (não fica repetindo a lista)', !/Consegui estes aqui/.test(resp1) && !/Consegui estes aqui/.test(resp2), resp2.replace(/\n/g, ' | ').slice(0, 140));

// ===================== escolha do horário: "o mais rápido possível", "a próxima", só o dia... =====================
const { lerIntencao } = await import('../src/agents/receptivo/script/engine.js');
const sem = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const seg19 = { now: new Date('2026-10-19T15:00:00Z'), nome: '', tz: 'America/Sao_Paulo' }; // segunda-feira, 19/10/2026

const casos: [string, number, Record<string, unknown>][] = [
  ['o mais rápido possível', 3, { primeiro: true }], ['a próxima', 3, { primeiro: true }], ['o próximo', 3, { primeiro: true }],
  ['o primeiro disponível', 3, { primeiro: true }], ['qualquer um', 3, { primeiro: true }], ['qualquer', 3, { primeiro: true }], ['tanto faz', 3, { primeiro: true }],
  ['o que tiver', 3, { primeiro: true }], ['o que você tiver', 3, { primeiro: true }], ['o mais cedo', 3, { primeiro: true }], ['pode ser o mais próximo', 3, { primeiro: true }],
  ['quanto antes', 3, { primeiro: true }], ['assim que possível', 3, { primeiro: true }], ['o mais breve', 3, { primeiro: true }], ['urgente', 3, { primeiro: true }],
  ['o último', 3, { ultimo: true }], ['o mais tarde', 3, { ultimo: true }], ['o mais longe', 3, { ultimo: true }],
  ['semana que vem', 3, { apartir: '2026-10-26' }], ['a próxima semana', 3, { apartir: '2026-10-26' }], ['mês que vem', 3, { apartir: '2026-11-01' }],
  ['depois do dia 25', 3, { apartir: '2026-10-26' }], ['a partir do dia 25', 3, { apartir: '2026-10-25' }], ['a partir de quinta', 3, { apartir: '2026-10-22' }], ['depois de quinta', 3, { apartir: '2026-10-23' }],
  ['até dia 25', 3, { ate: '2026-10-25' }], ['antes do dia 25', 3, { ate: '2026-10-24' }], ['essa semana', 3, { ate: '2026-10-25' }], ['até amanhã', 3, { ate: '2026-10-20' }],
  ['daqui a 2 dias', 3, { apartir: '2026-10-21' }], ['daqui a uma semana', 3, { apartir: '2026-10-26' }], ['em 3 dias', 3, { apartir: '2026-10-22' }],
  ['outro dia', 2, { mais: true }], ['tem outras datas?', 2, { mais: true }], ['nenhum desses', 2, { mais: true }], ['mais opções', 2, { mais: true }], ['não posso nesses dias', 2, { mais: true }],
  ['às 15h', 3, { hora: 15 }], ['as 8', 3, { hora: 8 }], ['15:00', 3, { hora: 15 }], ['o das 8h', 3, { hora: 8 }],
  ['sim', 1, { sim: true }],
];
for (const [txt, tam, esp] of casos) {
  const got: any = lerIntencao(sem(txt), seg19, tam) ?? {};
  const ok = Object.entries(esp).every(([k, v]) => got[k] === v) && (esp.primeiro === true || !got.primeiro);
  confere(`H0 "${txt}" -> ${JSON.stringify(esp)}`, ok, JSON.stringify(got));
}
confere('H0 "outro dia" sem lista na tela não é "mais opções"', !(lerIntencao('outro dia', seg19, 0) as any)?.mais, '');
confere('H0 "sim" com 3 opções na tela não escolhe sozinho', !(lerIntencao('sim', seg19, 3) as any)?.sim, '');
confere('H0 "a próxima semana" NÃO vira "o mais rápido"', !(lerIntencao('a proxima semana', seg19, 3) as any)?.primeiro, JSON.stringify(lerIntencao('a proxima semana', seg19, 3)));

// conversa: a lista na tela e o jeito de responder
reset({ ocupados: 0 });
const ateLista2 = ['oi', 'quero agendar ginecologista', 'sim', 'guama'];
r = await dd(ateLista2);
confere('H1 ponto de partida: a lista tem 4 opções', (r.state.lista?.length ?? 0) >= 3, String(r.state.lista?.length));
const primeiroSlot = r.state.lista?.[0];
const ultimoSlot = r.state.lista?.[r.state.lista.length - 1];
for (const frase of ['o mais rápido possível', 'a próxima', 'o próximo', 'qualquer um', 'tanto faz', 'o que tiver', 'o primeiro disponível', 'o mais cedo', 'quanto antes', 'pode ser o mais rápido']) {
  const x = await dd([...ateLista2, frase]);
  confere(`H1 "${frase}" escolhe o primeiro horário e a conversa AVANÇA`, x.state.slot?.ymd === primeiroSlot?.ymd && x.state.slot?.turno === primeiroSlot?.turno && /me manda por favor os dados do paciente/.test(x.reply) && !/Consegui estes aqui/.test(x.reply), `${x.state.slot?.ymd} | ${x.reply.replace(/\n/g, ' | ').slice(-70)}`);
}
for (const frase of ['o último', 'o mais tarde', 'o mais longe']) {
  const x = await dd([...ateLista2, frase]);
  confere(`H1 "${frase}" escolhe o último da lista`, x.state.slot?.ymd === ultimoSlot?.ymd && /me manda por favor os dados do paciente/.test(x.reply), `${x.state.slot?.ymd} vs ${ultimoSlot?.ymd}`);
}
// só o dia (número solto, "dia N", "N de outubro")
const diaN = Number(String(r.state.lista?.[2]?.ymd).slice(8)); // 3ª opção
for (const frase of [String(diaN), `dia ${diaN}`, `o dia ${diaN}`, `${diaN} de outubro`]) {
  const x = await dd([...ateLista2, frase]);
  confere(`H2 só o dia: "${frase}" escolhe aquele dia`, x.state.slot?.ymd === r.state.lista?.[2]?.ymd && /me manda por favor os dados do paciente/.test(x.reply), `${x.state.slot?.ymd}`);
}
// outro dia: mostra opções DEPOIS das que estavam na tela (não repete a lista)
let x = await dd([...ateLista2, 'outro dia']);
confere('H3 "outro dia": mostra datas DEPOIS das que estavam na tela (não repete)', /Sem problema\. Tenho também/.test(x.reply) && (x.state.lista?.[0]?.ymd ?? '') > (ultimoSlot?.ymd ?? '9'), `${x.state.lista?.[0]?.ymd} > ${ultimoSlot?.ymd} | ${x.reply.replace(/\n/g, ' | ').slice(0, 120)}`);
x = await dd([...ateLista2, 'tem mais opções?']);
confere('H3 "tem mais opções?" também', /Sem problema\. Tenho também/.test(x.reply), x.reply.slice(0, 80));
x = await dd([...ateLista2, 'nenhum desses serve']);
confere('H3 "nenhum desses serve" também', /Sem problema\. Tenho também/.test(x.reply), x.reply.slice(0, 80));
// a partir de uma data / semana que vem
x = await dd([...ateLista2, `depois do dia ${Number(String(r.state.lista?.[0]?.ymd).slice(8))}`]);
confere('H4 "depois do dia N": só horários depois dessa data', /A partir de/.test(x.reply) && (x.state.lista ?? []).every((l: any) => l.ymd > (r.state.lista?.[0]?.ymd ?? '')), JSON.stringify((x.state.lista ?? []).map((l: any) => l.ymd)));
x = await dd([...ateLista2, 'semana que vem']);
confere('H4 "semana que vem": lista a partir da próxima segunda', /A partir de/.test(x.reply) || x.state.slot, x.reply.replace(/\n/g, ' | ').slice(0, 100));
x = await dd([...ateLista2, 'semana que vem o mais rápido']);
confere('H4 "semana que vem, o mais rápido" já escolhe o primeiro horário daquela semana', Boolean(x.state.slot) && /me manda por favor os dados do paciente/.test(x.reply), x.reply.replace(/\n/g, ' | ').slice(-90));
// período junto
x = await dd([...ateLista2, 'o mais rápido de manhã']);
confere('H5 "o mais rápido de manhã" escolhe o primeiro horário da MANHÃ', x.state.slot?.turno === 'manhã' && /me manda por favor os dados do paciente/.test(x.reply), `${x.state.slot?.turno}`);
x = await dd([...ateLista2, 'o mais rápido à tarde']);
confere('H5 "o mais rápido à tarde" escolhe o primeiro horário da TARDE', x.state.slot?.turno === 'tarde' && /me manda por favor os dados do paciente/.test(x.reply), `${x.state.slot?.turno}`);
// hora
x = await dd([...ateLista2, 'às 13h']);
confere('H5 "às 13h": só os horários que começam às 13h (um só escolhe; vários mostra esses)', x.state.slot ? x.state.slot.inicio.startsWith('13') : ((x.state.lista ?? []).length > 0 && (x.state.lista ?? []).every((l: any) => l.inicio.startsWith('13'))), `${x.state.slot?.inicio} | ${JSON.stringify((x.state.lista ?? []).map((l: any) => l.inicio))}`);
x = await dd([...ateLista2, 'às 4h da madrugada']);
confere('H5 hora que não existe: diz que não tem e mostra o que existe (sem repetir em silêncio)', /Não tenho horário às 4h/.test(x.reply) && /Mas consegui estes aqui/.test(x.reply), x.reply.replace(/\n/g, ' | ').slice(0, 120));
x = await dd([...ateLista2, 'até amanhã']);
confere('H5 "até amanhã": só o que existe até amanhã', (x.state.slot ? x.state.slot.ymd <= dia(1) : (x.state.lista ?? []).every((l: any) => l.ymd <= dia(1))) && !/Não peguei qual horário/.test(x.reply), x.reply.replace(/\n/g, ' | ').slice(0, 120));
// antes da lista: "o mais rápido" já na hora da unidade ou do pedido
x = await dd(['oi', 'quero agendar ginecologista', 'sim', 'guama o mais rápido possível']);
confere('H6 "guamá, o mais rápido possível" na mesma frase: unidade e primeiro horário, direto para o pagamento', x.state.unidade?.nome === 'Guamá' && Boolean(x.state.slot) && /me manda por favor os dados do paciente/.test(x.reply), x.reply.replace(/\n/g, ' | ').slice(-90));
x = await dd(['oi', 'quero agendar ginecologista', 'sim', 'o mais rápido possível']);
confere('H6 só "o mais rápido possível" na pergunta da unidade: escolhe a unidade com o horário mais cedo e já o horário', Boolean(x.state.unidade) && Boolean(x.state.slot) && /me manda por favor os dados do paciente/.test(x.reply), x.reply.replace(/\n/g, ' | ').slice(-90));
x = await dd(['oi', 'quero agendar ginecologista', 'sim', 'tanto faz']);
confere('H6 "tanto faz" na pergunta da unidade também', Boolean(x.state.unidade) && Boolean(x.state.slot), x.reply.replace(/\n/g, ' | ').slice(-90));
x = await dd(['quero agendar ginecologista o mais rápido possível', 'sim']);
confere('H6 o pedido "o mais rápido" feito junto com o serviço NÃO se perde até a hora dos horários', x.state.rapido === true, String(x.state.rapido));
x = await dd(['quero agendar ginecologista o mais rápido possível', 'sim', 'guama']);
confere('H6 e na hora dos horários já escolhe o primeiro', Boolean(x.state.slot) && /me manda por favor os dados do paciente/.test(x.reply), x.reply.replace(/\n/g, ' | ').slice(-90));

// não entendeu: NUNCA repete a lista em silêncio; pergunta de outro jeito, e o intérprete de apoio (IA) pode entender
x = await dd([...ateLista2, 'hmm deixa eu pensar']);
confere('H7 resposta que as regras não entendem: pede esclarecimento (não repete a lista em silêncio)', /Não peguei qual horário você quer/.test(x.reply) && /1\./.test(x.reply), x.reply.replace(/\n/g, ' | ').slice(0, 150));
const comIA = (resposta: any) => ({ ...ctxPix, interpretar: async () => resposta });
x = (await responder([...ateLista2, 'aquele do meio'].map((z) => [z]), comIA({ indice: 1 }), fonteClinilink)) as any;
confere('H7 intérprete de apoio ("aquele do meio" -> opção 2): escolhe a opção certa', x.state.slot?.ymd === r.state.lista?.[1]?.ymd && /me manda por favor os dados do paciente/.test(x.reply), `${x.state.slot?.ymd}`);
x = (await responder([...ateLista2, 'prefiro o final do mês'].map((z) => [z]), comIA({ ultimo: true }), fonteClinilink)) as any;
confere('H7 intérprete devolvendo "último": usa o último da lista', x.state.slot?.ymd === ultimoSlot?.ymd, `${x.state.slot?.ymd}`);
x = (await responder([...ateLista2, 'sei lá'].map((z) => [z]), comIA({ indice: 99 }), fonteClinilink)) as any;
confere('H7 intérprete com índice inválido (99) é ignorado: não escolhe nada e pede esclarecimento', !x.state.slot && /Não peguei qual horário/.test(x.reply), x.reply.slice(0, 70));
x = (await responder([...ateLista2, 'sei lá'].map((z) => [z]), comIA({ apartir: '1999-01-01' }), fonteClinilink)) as any;
confere('H7 intérprete com data passada é ignorado', !x.state.slot, '');
x = (await responder([...ateLista2, 'sei lá'].map((z) => [z]), comIA(null), fonteClinilink)) as any;
confere('H7 sem resposta do intérprete: pede esclarecimento', /Não peguei qual horário/.test(x.reply), x.reply.slice(0, 70));

// sim / não no jeito de falar (confirmação do serviço)
for (const frase of ['pode agendar', 'isso aí', 'isso ai', 'beleza', 'uhum', 'aham', 'fechou', 'com certeza', 'siiim', 'positivo', 'exatamente', 'pode marcar', 'é isso mesmo', 'tá certo', 'blz', 'demorou']) {
  const y = await dd(['oi', 'quero agendar ginecologista', frase]);
  confere(`H8 confirmar o serviço com "${frase}"`, y.state.servicoConfirmado === true, `${y.state.servicoConfirmado}`);
}
for (const frase of ['negativo', 'nada disso', 'nope', 'não é isso', 'errado', 'não era isso', 'incorreto']) {
  const y = await dd(['oi', 'quero agendar ginecologista', frase]);
  confere(`H8 recusar o serviço com "${frase}"`, y.state.servicoConfirmado !== true && /Sem problema/.test(y.reply), y.reply.slice(0, 60));
}

// ---- ordem livre: o paciente adianta o que quiser, em qualquer ponto, e ela guarda e segue ----
reset({ ocupados: 0 });
const turnosDe = async (msgs: string[]) => (await responder(msgs.map((z) => [z]), ctx, fonteClinilink)) as any;
let o = await turnosDe(['oi, quero marcar amanhã de manhã']);
confere('O1 dia e período ANTES do serviço: anota e pergunta o serviço (não diz "não entendi")', /Anotei .* de manhã\./.test(o.reply) && /Qual consulta ou exame você precisa\?/.test(o.reply) && o.state.data === dia(1) && o.state.turno === 'manhã' && o.state.falhas === 0, o.reply.replace(/\n/g, ' | '));
o = await turnosDe(['oi, quero marcar amanhã de manhã', 'ginecologia']);
confere('O1 depois do serviço, o dia e o período continuam valendo', /(Ah, então é|Entendi, você quer) consulta Ginecologia/.test(o.reply) && o.state.data === dia(1) && o.state.turno === 'manhã', `${o.state.data} ${o.state.turno} | ${o.reply.slice(0, 80)}`);
o = await turnosDe(['oi, quero marcar amanhã de manhã', 'ginecologia', 'sim', 'guama']);
confere('O1 chega direto ao resumo do horário (sem listar tudo de novo) e já pede os dados do paciente', o.state.slot?.ymd === dia(1) && /Beleza, então fica|Show, então fica/.test(o.reply) && /me manda por favor os dados do paciente/.test(o.reply), o.reply.replace(/\n/g, ' | ').slice(0, 260));
confere('O1 resumo no jeito de falar: "na <dia> (<número>)", com Dra. e sem "Fechado"', /no Guamá (na|no) \p{L}+ \(\d{1,2}(\/\d{1,2})?\) de manhã a partir das 8h por ordem de chegada com a Dra\. Medica/u.test(o.reply) && !/Fechado|Combinado/.test(o.reply), o.reply.replace(/\n/g, ' | ').slice(0, 260));

o = await turnosDe(['oi, quero marcar lá no guamá']);
confere('O2 unidade ANTES do serviço: anota', /Anotei no Guamá\./.test(o.reply) && o.state.preUnidade === 'Guamá', o.reply.replace(/\n/g, ' | '));
o = await turnosDe(['oi, quero marcar lá no guamá', 'cardiologia', 'sim']);
confere('O2 a unidade vale para o serviço escolhido depois: não pergunta de novo', o.state.unidade?.nome === 'Guamá' && !/Qual dos dois/.test(o.reply), `${o.state.unidade?.nome} | ${o.reply.replace(/\n/g, ' | ').slice(0, 160)}`);

o = await turnosDe(['oi', 'quero agendar ginecologista', 'sim', 'guama', 'na verdade quero com a dra rebecca']);
confere('O3 pediu a médica pelo nome DEPOIS de ver os horários: mesma consulta, só dela, sem confirmar de novo', o.state.servico?.profissional?.id === P_REB && o.state.servicoConfirmado === true && o.state.unidade?.nome === 'Guamá' && !/(Ah, então é|Entendi, você quer)/.test(o.reply), `${o.state.servico?.profissional?.nome} | ${o.reply.replace(/\n/g, ' | ').slice(0, 220)}`);
confere('O3 e mostra os horários dela, com Dra.', /Dra\. Rebecca/.test(o.reply) && /10h|10:00/.test(o.reply) && /Qual desses|Esse horário fica bom|Beleza, então fica|O mais rápido/.test(o.reply), o.reply.replace(/\n/g, ' | ').slice(0, 260));

o = await turnosDe(['oi, quero ginecologia, meu cpf é 529.982.247-25']);
confere('O4 CPF dito cedo fica guardado', o.state.cpf === '52998224725', String(o.state.cpf));
o = await turnosDe(['oi, quero ginecologia, meu cpf é 529.982.247-25', 'sim', 'guama amanhã']);
confere('O4 chegando a hora dos dados, ela NÃO pergunta o CPF de novo: mostra o resumo e já o paciente', /Achei aqui o cadastro de Maria Exemplo/.test(o.reply) && !/CPF do paciente/.test(o.reply), o.reply.replace(/\n/g, ' | ').slice(0, 240));
o = await turnosDe(['oi, quero ginecologia, meu cpf é 529.982.247-25', 'sim', 'guama amanhã', 'na recepção', 'sim']);
confere('O4 e conclui a reserva depois do "sim"', o.reply.startsWith(MARCA_AGENDADO), o.reply.replace(/\n/g, ' | ').slice(0, 120));

o = await turnosDe(['oi, quero ginecologia e vou pagar na recepção']);
confere('O5 forma de pagamento dita cedo fica guardada', o.state.pagPref === 'recepcao', String(o.state.pagPref));
o = await turnosDe(['oi, quero ginecologia e vou pagar na recepção', 'sim', 'guama amanhã']);
confere('O5 forma de pagamento dita cedo: mostra o resumo e pede os dados do paciente (o pix não é empurrado)', !/Chave pix/.test(o.reply) && /Beleza, então fica|Show, então fica/.test(o.reply) && /me manda por favor os dados do paciente/.test(o.reply), o.reply.replace(/\n/g, ' | ').slice(0, 300));
o = await turnosDe(['oi, quero ginecologia e vou pagar na recepção', 'sim', 'guama amanhã', '52998224725', 'sim']);
confere('O5 e depois dos dados NÃO pergunta o pagamento de novo: agenda (paga na recepção)', o.reply.startsWith(MARCA_AGENDADO) && !/Como você prefere pagar/.test(o.reply), o.reply.replace(/\n/g, ' | ').slice(0, 120));

o = await turnosDe(['boa tarde, quero agendar ginecologia']);
confere('O6 "boa tarde" é saudação: não vira período da tarde', o.state.turno === undefined, String(o.state.turno));
o = await turnosDe(['oi', 'quero ginecologia', 'sim', 'guama', 'o mais cedo possível']);
confere('O6 "o mais cedo possível" é o primeiro horário, não "de manhã"', o.state.slot !== undefined && /O mais rápido que tenho é/.test(o.reply), o.reply.replace(/\n/g, ' | ').slice(0, 220));
confere('O6 "o mais rápido": frase corrida, com Dra., fechando com "Já separo esse pra você" e o pedido dos dados do paciente', /O mais rápido que tenho é \p{L}+ dia \d{1,2} de manhã a partir das 8h com a Dra\. Medica\. Já separo esse pra você\./u.test(o.reply) && /me manda por favor os dados do paciente/.test(o.reply), o.reply.replace(/\n/g, ' | ').slice(0, 260));

o = await turnosDe(['oi, quero marcar uma consulta']);
confere('O7 quer marcar uma consulta e não disse qual: mostra as consultas com agenda (não pergunta no escuro)', /Estas são as consultas mais procuradas que tenho com agenda:/.test(o.reply) && /1\. Consulta/.test(o.reply) && /Qual delas você precisa\? Se for outra, me diz o nome\./.test(o.reply) && !/Hmm|Não peguei/.test(o.reply) && !o.handoff && Boolean(o.state.opcoes?.length), o.reply.replace(/\n/g, ' | '));

o = await turnosDe(['oi', 'quero agendar ginecologista', 'sim']);
confere('O8 médicos com Dr./Dra. e "Tenho sim!" ao informar as unidades', /Tenho sim! No Guamá com a Dra\. Medica e a Dra\. Liduina, e no Telégrafo com a Dra\. Medica e a Dra\. Liduina\./.test(o.reply) && /A consulta é R\$ 100,00\./.test(o.reply) && /Qual dos dois fica melhor pra você\?/.test(o.reply), o.reply.replace(/\n/g, ' | ').slice(0, 260));
o = await turnosDe(['oi', 'quero agendar ginecologista', 'sim', 'guama', '1']);
confere('O8 o resumo não traz "Fechado" nem "Combinado" e já vem o pedido dos dados do paciente', /me manda por favor os dados do paciente/.test(o.reply) && !/Fechado|Combinado/.test(o.reply), o.reply.replace(/\n/g, ' | ').slice(-260));

// ---- inteligência na hora de sugerir: o que a clínica mais agenda e tem agenda vem primeiro ----
reset({ ocupados: 0 });
let m = await turnosDe(['bom dia, preciso agendar um exame']);
confere('M1 "preciso agendar um exame": mostra os exames mais procurados COM agenda (não pergunta no escuro)', /Estes são os exames mais procurados que tenho com agenda:/.test(m.reply) && /Qual deles você precisa\? Se for outro, me diz o nome\./.test(m.reply) && !m.handoff && (m.state.opcoes?.length ?? 0) >= 3, m.reply.replace(/\n/g, ' | ').slice(0, 330));
confere('M1 o mais agendado vem primeiro (teste de alergia: 54 agendamentos), depois o ultrassom', /1\. Teste de Alergia/i.test(m.reply) && /2\. Usg Abdome Total/i.test(m.reply), (m.state.opcoes ?? []).map((x: any) => x.nome).join(' | '));
confere('M1 serviço sem agenda (teste rápido de laboratório) NUNCA entra na lista', !/Rapido (Dengue|Covid|Hiv)|Coombs|Troponina/i.test(m.reply), '');
m = await turnosDe(['bom dia, preciso agendar um exame', '1']);
confere('M1 escolher pelo número segue o fluxo com o serviço escolhido', /(Ah, então é|Entendi, você quer|Só pra confirmar: é|Então é) Teste de Alergia/i.test(m.reply) && m.state.servico?.id === '33333333-3434-4343-8343-343434343434', m.reply.replace(/\n/g, ' | ').slice(0, 160));
m = await turnosDe(['quero marcar uma consulta']);
confere('M2 consultas: a mais agendada vem primeiro (ginecologia), depois dermatologia e cardiologia', /1\. Consulta Ginecologia/.test(m.reply) && m.reply.indexOf('Consulta Dermatologia') < m.reply.indexOf('Consulta Cardiologia'), (m.state.opcoes ?? []).map((x: any) => x.nome).join(' | '));
m = await turnosDe(['oi, quero remarcar minha consulta']);
confere('M3 remarcar/cancelar não é busca de serviço: chama a equipe', !/mais procuradas|Não achei/.test(m.reply) && Boolean(m.handoff) && /remarcar ou cancelar/.test(m.handoff.motivo), m.reply.replace(/\n/g, ' | ').slice(0, 140));
m = await turnosDe(['quero agendar uma consulta ou exame']);
confere('M3 "consulta ou exame" (os dois tipos) não escolhe um tipo sozinha', !/mais procuradas/.test(m.reply), m.reply.replace(/\n/g, ' | ').slice(0, 140));
m = await turnosDe(['quero fazer um ultrassom']);
confere('M4 pedido vago "ultrassom" (vários parecidos): o mais agendado e com agenda vem primeiro', /Usg Abdome Total/i.test(m.reply) || /Usg Abdome Total/i.test((m.state.servico?.nome ?? '')), m.reply.replace(/\n/g, ' | ').slice(0, 160));
// sem dados de demanda (o Clinilink não devolveu a lista): volta para a regra dos serviços principais, sem quebrar
(globalThis as any).__demanda = {};
m = await turnosDe(['quero marcar um exame']);
confere('M5 sem demanda no Clinilink: ainda sugere, pela regra dos serviços principais', /exames mais procurados/.test(m.reply) && (m.state.opcoes?.length ?? 0) >= 3, m.reply.replace(/\n/g, ' | ').slice(0, 200));
(globalThis as any).__demanda = undefined;

// ---- interpretação do pedido por IA (simulada): entende o contexto e o roteiro busca no Clinilink ----
const comPedido = (fn: (p: { texto: string; anteriores: string[] }) => any) => ({ ...ctx, interpretarPedido: async (p: { texto: string; anteriores: string[] }) => fn(p) });
let chamadasIA: { texto: string; anteriores: string[] }[] = [];
const viaIA = async (msgs: string[], resp: any) => { chamadasIA = []; return (await responder(msgs.map((z) => [z]), comPedido((p) => { chamadasIA.push(p); return resp; }), fonteClinilink)) as any; };
m = await viaIA(['oi, estou com unha encravada e doendo'], { quer: 'agendar', tipo: 'consulta', termo: 'dermatologia', sintoma: true });
confere('I1 o intérprete acha a especialidade pelo sintoma e o roteiro CONFIRMA com aviso de segurança', /Pelo que você contou, o serviço indicado é consulta Dermatologia/.test(m.reply) && /192/.test(m.reply) && m.state.servico?.viaSintoma === true, m.reply.replace(/\n/g, ' | ').slice(0, 230));
m = await viaIA(['preciso fazer uma coisa aí'], { quer: 'agendar', tipo: 'exame', termo: null, sintoma: false });
confere('I2 só entendeu que é um exame: mostra os exames mais procurados', /exames mais procurados/.test(m.reply), m.reply.replace(/\n/g, ' | ').slice(0, 120));
m = await viaIA(['queria escutar melhor'], { quer: 'agendar', tipo: 'exame', termo: 'audiometria', sintoma: false });
confere('I3 termo que o Clinilink não tem: diz que não achou e oferece a equipe (usa o termo entendido)', /Não achei audiometria pra agendar por aqui/.test(m.reply) && /chame alguém da equipe/.test(m.reply), m.reply.replace(/\n/g, ' | ').slice(0, 200));
m = await viaIA(['tenho sentido muita tontura ultimamente'], { quer: 'duvida', tipo: null, termo: 'dermatologia', sintoma: true });
confere('I10 queixa de saúde (o modelo pode marcar como "dúvida") também vira pedido de consulta, com aviso de segurança', /Pelo que você contou, o serviço indicado é consulta Dermatologia/.test(m.reply) && /192/.test(m.reply), m.reply.replace(/\n/g, ' | ').slice(0, 200));
m = await viaIA(['quanto tempo demora o resultado?'], { quer: 'duvida', tipo: null, termo: null, sintoma: false });
confere('I4 era só uma dúvida: o intérprete não inventa serviço', !m.state.servico && !m.state.opcoes, m.reply.replace(/\n/g, ' | ').slice(0, 140));
m = await viaIA(['obrigado'], { quer: 'agendar', tipo: 'exame', termo: 'ultrassom', sintoma: false });
confere('I5 agradecimento e "sim/não" nem chegam a chamar o intérprete', chamadasIA.length === 0, `chamadas: ${chamadasIA.length}`);
m = await viaIA(['preciso agendar um exame', 'daqueles de sangue'], { quer: 'agendar', tipo: 'exame', termo: 'ginecologia', sintoma: false });
confere('I6 o intérprete recebe o CONTEXTO (mensagens anteriores do paciente) e a busca usa o que ele entendeu', chamadasIA.some((c) => c.texto === 'daqueles de sangue' && c.anteriores.includes('preciso agendar um exame')) && /Ginecologia/.test(m.reply), JSON.stringify(chamadasIA.map((c) => c.anteriores)));
m = await viaIA(['quero marcar uma consulta de ginecologia'], { quer: 'agendar', tipo: 'consulta', termo: 'dermatologia', sintoma: false });
confere('I7 se as regras já entendem o pedido, o intérprete nem é chamado (e não muda o resultado)', chamadasIA.length === 0 && /Ginecologia/.test(m.reply), `${chamadasIA.length} chamadas | ${m.reply.replace(/\n/g, ' | ').slice(0, 80)}`);
m = await turnosDe(['preciso resolver um problema na pele']);
confere('I8 sem o intérprete (sem chave da OpenAI) o roteiro segue como antes, sem quebrar', !m.handoff && Boolean(m.reply), m.reply.replace(/\n/g, ' | ').slice(0, 100));
const falha = async () => { throw new Error('OpenAI fora do ar'); };
m = (await responder([['preciso resolver um problema na pele']], { ...ctx, interpretarPedido: falha as any }, fonteClinilink)) as any;
confere('I9 intérprete que dá erro: o roteiro segue sem ele', !m.handoff && Boolean(m.reply), m.reply.replace(/\n/g, ' | ').slice(0, 100));

// ---- o paciente já tem o atendimento no dia: ela explica QUAL e espera o que ele quer (nunca recomeça a conversa) ----
const dupCtx = { ...ctx, duplicadoNosTurnos: [6] }; // o turno 6 ("sim") foi o que bateu na duplicidade
const siga = async (msgs: string[], c: any = dupCtx) => (await responder([...base, '52998224725', 'sim', ...msgs].map((z) => [z]), c, fonteClinilink)) as any;
const { _limparCache } = await import('../src/integrations/clinilink.js');
_limparCache();
reset({ ocupados: 0, agendamento: 'duplicado' });
(globalThis as any).__existente = { data: dia(1), hora: '08:30', inicio: '08:00' };
let u = await siga([]);
confere('U1 a recusa por duplicidade explica QUAL agendamento já existe (dia, unidade, período, hora, médica)', /Vi que esse paciente já tem consulta Ginecologia marcado pra \p{L}+ dia \d{1,2} no Guamá de manhã a partir das 8h com a Dra\. Medica\./u.test(u.reply) && !u.handoff, u.reply.replace(/\n/g, ' | '));
confere('U1 e pergunta o que ele prefere (manter, mais um em outro dia ou remarcar), esperando a resposta', /O que você prefere: manter esse que já está marcado, marcar mais um em outro dia ou remarcar esse que já está agendado\?/.test(u.reply) && u.state.dup?.ymd === dia(1) && u.state.fim === false, JSON.stringify(u.state.dup));
const postsAntes = nPost('/agendamentos');
u = await siga(['ja ta agendado teste ergometrico então?']);
confere('U2 a pergunta "já tá agendado?" é respondida NO CONTEXTO ("Isso mesmo!" + o agendamento + as opções), sem reiniciar o fluxo', /^Isso mesmo! Vi que esse paciente já tem consulta Ginecologia marcado pra/.test(u.reply) && !/(Ah, então é|Entendi, você quer|Só pra confirmar|Então é)/.test(u.reply) && /manter esse que já está marcado/.test(u.reply) && !u.handoff && u.state.dup?.tent === 1, u.reply.replace(/\n/g, ' | ').slice(0, 220));
u = await siga(['pode manter']);
confere('U3 "pode manter": fica o que já existe, pergunta se precisa de mais algo e NÃO grava nada', /fica mantido o que já está marcado/.test(u.reply) && /Posso te ajudar com mais alguma coisa/.test(u.reply) && !u.handoff && nPost('/agendamentos') === postsAntes, u.reply.replace(/\n/g, ' | '));
u = await siga(['quero remarcar esse']);
confere('U4 "remarcar": chama a equipe com o agendamento que já existe anotado e a Amanda não retoma sozinha', Boolean(u.handoff) && /REMARCAR/.test(u.handoff.motivo) && /Ginecologia/.test(u.handoff.motivo) && /8h/.test(u.handoff.motivo) && u.handoff.duro === true && /remarcar esse agendamento/.test(u.reply), (u.handoff?.motivo ?? '').slice(0, 200));
confere('U4 nada novo foi gravado', nPost('/agendamentos') === postsAntes, `${nPost('/agendamentos')} vs ${postsAntes}`);
u = await siga(['quero remarcar esse', 'obrigado']);
confere('U4 depois da transferência para remarcar, a Amanda NÃO retoma (a equipe assume)', u.aposHandoffDuro === true, String(u.aposHandoffDuro));
modo.agendamento = undefined; // a partir daqui o Clinilink aceita
u = await siga(['quero marcar mais um em outro dia']);
confere('U5 "marcar mais um em outro dia": mostra os horários SEM o dia que já está ocupado', /Beleza, vamos marcar mais um em outro dia\./.test(u.reply) && /Consegui estes aqui/.test(u.reply) && (u.state.lista ?? []).length > 0 && (u.state.lista ?? []).every((x: any) => x.ymd !== dia(1)) && u.state.diasBloqueados?.includes(dia(1)), u.reply.replace(/\n/g, ' | ').slice(0, 200));
u = await siga(['quero marcar mais um em outro dia', '1']);
confere('U5 escolhendo um horário novo, reserva de verdade (em outro dia)', u.reply.startsWith(MARCA_AGENDADO) && posts.filter((x) => x.rota.endsWith('/agendamentos')).slice(-1)[0]?.corpo.dataHora.slice(0, 10) !== dia(1), u.reply.replace(/\n/g, ' | ').slice(0, 160));
u = await siga(['quero mudar o dia']);
confere('U6 "mudar o dia" é ambíguo: pergunta se remarca o que existe ou marca mais um (não grava nada sem querer)', /remarcar o que já está agendado pra esse outro dia ou marcar mais um além dele\?/.test(u.reply) && !u.handoff && u.state.dup?.esclareceu === true, u.reply.replace(/\n/g, ' | '));
u = await siga(['quero mudar o dia', 'remarcar o que já tenho']);
confere('U6 respondendo "remarcar": chama a equipe', Boolean(u.handoff) && /REMARCAR/.test(u.handoff.motivo), u.reply.replace(/\n/g, ' | ').slice(0, 120));
u = await siga(['quero mudar o dia', 'mais um além desse']);
confere('U6 respondendo "mais um": mostra outros horários', /Consegui estes aqui/.test(u.reply) && (u.state.lista ?? []).every((x: any) => x.ymd !== dia(1)), u.reply.replace(/\n/g, ' | ').slice(0, 120));
u = await siga(['hmm', 'sei lá', 'não sei']);
confere('U7 três respostas que não dizem nada: chama a equipe (não fica em loop)', Boolean(u.handoff) && /não deixou claro/.test(u.handoff.motivo), u.reply.replace(/\n/g, ' | ').slice(0, 140));
// o Clinilink não devolve o agendamento existente (só o aviso do dia)
(globalThis as any).__existente = undefined;
_limparCache();
reset({ ocupados: 0, agendamento: 'duplicado' });
u = await siga([]);
confere('U8 sem achar o agendamento existente: avisa só do dia e mantém a pergunta', /Vi que esse paciente já tem esse atendimento marcado pro mesmo dia \(\p{L}+ dia \d{1,2}\)\./u.test(u.reply) && /O que você prefere/.test(u.reply) && !u.handoff, u.reply.replace(/\n/g, ' | '));
// outras recusas da reserva: a equipe assume e a Amanda não retoma sozinha (o estado da reserva se perde)
reset({ ocupados: 0, agendamento: 'ocupado-sempre' });
u = (await responder([...base, '52998224725', 'sim'].map((z) => [z]), ctx, fonteClinilink)) as any;
confere('U9 vaga ocupada na hora de reservar: transfere e é transferência "dura" (sem retomar)', Boolean(u.handoff) && u.handoff.duro === true, u.reply.replace(/\n/g, ' | ').slice(0, 120));
// combo: ainda não é com a Amanda
reset({ ocupados: 0 });
u = await turnosDe(['oi, quero agendar um combo']);
confere('U10 "quero agendar um combo": não transfere nem procura "combo" como serviço: mostra os tipos de combo que existem', !u.handoff && /Claro! Tenho combos de:/.test(u.reply) && /1\. Feminino/.test(u.reply) && /Infantil/.test(u.reply) && !/Não achei/.test(u.reply), u.reply.replace(/\n/g, ' | ').slice(0, 200));

// ---- ler o contexto antes de responder ----
reset({ ocupados: 0 });
type ChamadaCtx = { conversa: any[]; mensagem: string; fatos: string; perguntaPendente: string };
let chamadasCtx: ChamadaCtx[] = [];
const comContexto = (resp: any, extra: any = {}) => ({ ...ctx, ...extra, contexto: async (p: ChamadaCtx) => { chamadasCtx.push(p); return resp; } });
const conversaEx = [{ de: 'paciente', texto: 'quero agendar ginecologista' }, { de: 'amanda', texto: 'Tenho sim! No Guamá ... Qual dos dois fica melhor pra você?' }];
const viaCtx = async (msgs: string[], resp: any, extra: any = {}) => { chamadasCtx = []; return (await responder(msgs.map((z) => [z]), comContexto(resp, { conversa: conversaEx, ...extra }), fonteClinilink)) as any; };
let k = await viaCtx(['oi', 'quero agendar ginecologista', 'sim', 'e se eu não puder ir nesse dia depois?'], { tipo: 'pergunta', resposta: 'Se precisar mudar é só me avisar por aqui.' });
confere('C1 mensagem que não responde à pergunta pendente: o leitor de contexto responde E a pergunta pendente continua', /^Se precisar mudar é só me avisar por aqui\.\nQual dos dois você prefere/.test(k.reply) || /Se precisar mudar é só me avisar por aqui\.\n[\s\S]*Qual dos dois/.test(k.reply), k.reply.replace(/\n/g, ' | ').slice(0, 220));
confere('C1 ele recebe a conversa dos dois lados, os fatos verificados e a pergunta pendente', chamadasCtx.length === 1 && chamadasCtx[0].conversa.some((x) => x.de === 'amanda') && /Serviço em andamento: consulta Ginecologia \(o paciente já confirmou que é esse\)/.test(chamadasCtx[0].fatos) && /Valor: A consulta é R\$ 100,00\./.test(chamadasCtx[0].fatos) && /Situação: o agendamento ainda NÃO foi feito; etapa atual: escolhendo a unidade/.test(chamadasCtx[0].fatos) && /Qual dos dois/.test(chamadasCtx[0].perguntaPendente), JSON.stringify(chamadasCtx[0]?.fatos ?? '').slice(0, 300));
confere('C1 e o estado NÃO avança por causa da pergunta (ainda espera a unidade)', !k.state.unidade && k.state.servicoConfirmado === true, `unidade=${k.state.unidade?.nome}`);
k = await viaCtx(['oi', 'quero agendar ginecologista', 'sim', 'guama'], { tipo: 'pergunta', resposta: 'não deveria aparecer' });
confere('C2 a mensagem era a resposta esperada (unidade): o leitor de contexto nem é chamado', chamadasCtx.length === 0 && !/não deveria aparecer/.test(k.reply), `${chamadasCtx.length} chamadas`);
k = await viaCtx(['oi', 'quero agendar ginecologista', 'sim', 'quanto custa a consulta?'], { tipo: 'pergunta', resposta: 'não deveria aparecer' });
confere('C3 dúvida que o roteiro já responde (valor): o leitor de contexto não é chamado', chamadasCtx.length === 0 && /R\$ 100,00/.test(k.reply), `${chamadasCtx.length} chamadas`);
k = await viaCtx(['oi', 'quero agendar ginecologista', 'sim', 'hmm será que eu consigo vir?'], { tipo: 'resposta', resposta: 'texto qualquer' });
confere('C4 se o modelo diz que é "resposta" (não pergunta), a resposta do roteiro segue como estava', !/texto qualquer/.test(k.reply) && /Qual dos dois/.test(k.reply), k.reply.replace(/\n/g, ' | ').slice(0, 160));
k = await viaCtx(['oi', 'quero agendar ginecologista', 'sim', 'hmm será que eu consigo vir?'], null);
confere('C4 sem resposta do modelo: segue como antes, sem quebrar', /Qual dos dois/.test(k.reply) && !k.handoff, k.reply.replace(/\n/g, ' | ').slice(0, 160));
k = await viaCtx(['oi', 'quero agendar ginecologista', 'hmm será que eu consigo vir?', 'sim'], { tipo: 'pergunta', resposta: 'x' });
confere('C5 só a ÚLTIMA mensagem chama o leitor (o reprocessamento das anteriores não)', chamadasCtx.length === 0, `${chamadasCtx.length} chamadas`);
k = await viaCtx(['bom dia quero ver como funciona isso'], { tipo: 'pergunta', resposta: 'Eu ajudo a agendar consultas e exames aqui.' }, { interpretarPedido: async () => ({ quer: 'duvida', tipo: null, termo: null, sintoma: false }) });
confere('C6 primeira mensagem sem serviço: a resposta entra DEPOIS da saudação e antes da pergunta', /^Oi Teste, (bom dia|boa tarde|boa noite)! Aqui é a Amanda, da Clinex\.\nEu ajudo a agendar consultas e exames aqui\.\n/.test(k.reply), k.reply.replace(/\n/g, ' | ').slice(0, 200));
// "já tá agendado?" depois de um agendamento confirmado: responde com o que foi confirmado e não recomeça
const CONF = 'Ficou consulta Ginecologia no Guamá na terça, dia 20 de outubro, de manhã com a Dra. Medica. É por ordem de chegada a partir das 8h então vale chegar cedinho. Estamos te esperando com carinho!';
k = (await responder([['ja ta agendado teste ergometrico então?']], { ...ctx, confirmacao: CONF, pos: 'confirmado' }, fonteClinilink)) as any;
confere('C7 "já tá agendado?" depois da confirmação: responde "Está sim, confirmado!" com os dados e NÃO recomeça a conversa', k.reply === `Está sim, confirmado! Olha como ficou:

${CONF}` && !k.state.servico && !k.state.opcoes, k.reply.replace(/\n/g, ' | ').slice(0, 200));
k = (await responder([['ja ta agendado teste ergometrico então?'], ['obrigado']], { ...ctx, confirmacao: CONF, pos: 'confirmado' }, fonteClinilink)) as any;
confere('C7 e o "obrigado" seguinte continua funcionando (pergunta se precisa de mais algo)', /Posso te ajudar com mais alguma coisa/.test(k.reply), k.reply.replace(/\n/g, ' | ').slice(0, 120));
k = (await responder([['quanto tempo depois das 8h eu posso chegar?']], { ...ctx, confirmacao: CONF }, fonteClinilink)) as any;
confere('C7 pergunta que não é "já está agendado" não usa a confirmação', !/Está sim, confirmado/.test(k.reply), k.reply.replace(/\n/g, ' | ').slice(0, 100));
k = (await responder([['ja ta agendado teste ergometrico então?']], { ...ctx }, fonteClinilink)) as any;
confere('C7 sem confirmação recente no histórico: segue o roteiro normal (não inventa que está agendado)', !/Está sim, confirmado/.test(k.reply), k.reply.replace(/\n/g, ' | ').slice(0, 100));
for (const frase of ['então está agendado?', 'ja foi marcado?', 'ta marcado mesmo?', 'deu certo?', 'ficou confirmado?', 'qual o horário mesmo?']) {
  k = (await responder([[frase]], { ...ctx, confirmacao: CONF }, fonteClinilink)) as any;
  confere(`C7 "${frase}" é pergunta sobre o agendamento`, /^Está sim, confirmado!/.test(k.reply), k.reply.slice(0, 50));
}
// o intérprete do pedido também recebe a conversa dos dois lados
chamadasIA = [];
await responder([['preciso agendar um exame'], ['daqueles de sangue']].map((x) => x), { ...ctx, conversa: [{ de: 'paciente', texto: 'preciso agendar um exame' }, { de: 'amanda', texto: 'Estes são os exames mais procurados: 1. Hemograma' }], interpretarPedido: async (p: any) => { chamadasIA.push(p); return null; } }, fonteClinilink);
confere('C8 o intérprete do pedido recebe a CONVERSA (inclui a última pergunta da Amanda)', chamadasIA.some((c: any) => (c.conversa ?? []).some((x: any) => x.de === 'amanda')), JSON.stringify(chamadasIA.map((c: any) => (c.conversa ?? []).length)));

// ---- pagamento: pix induzido, dúvidas respondidas e link de crédito com a equipe ----
reset({ ocupados: 0 });
let pg = await turnosDe(['oi', 'quero agendar ginecologista', 'sim', 'guama amanhã']);
confere('PG1 horário escolhido: resumo e o pedido dos dados do paciente, em dois balões', pg.reply.split(/\n\n/).length === 2 && /^Beleza|^Show/.test(pg.reply) && /^Pra gerar o agendamento, me manda por favor os dados do paciente:/.test(pg.reply.split(/\n\n/)[1]), JSON.stringify(pg.reply.split(/\n\n/).map((x: string) => x.slice(0, 50))));
pg = await turnosDe(['oi', 'quero agendar ginecologista', 'sim', 'guama amanhã', '52998224725', 'sim', 'pix']);
confere('PG1 escolheu pix (depois dos dados): a chave em três balões (texto, chave sozinha, instrução)', pg.reply.split(/\n\n/).length === 3 && /^Show! A chave pix é essa, o valor é R\$ 100,00:$/.test(pg.reply.split(/\n\n/)[0]) && /^Chave pix: /.test(pg.reply.split(/\n\n/)[1]) && /comprovante/.test(pg.reply.split(/\n\n/)[2]), JSON.stringify(pg.reply.split(/\n\n/).map((x: string) => x.slice(0, 50))));
pg = await turnosDe(['oi', 'quero agendar ginecologista', 'sim', 'guama amanhã', '52998224725', 'sim', 'link de crédito']);
confere('PG2 pediu link de crédito: vai para o atendimento do time (transferência dura, sem a Amanda retomar) com a vaga anotada', Boolean(pg.handoff) && pg.handoff.duro === true && /link de crédito/.test(pg.handoff.motivo) && /AINDA NÃO feito/.test(pg.handoff.motivo) && /Vou passar pra equipe te enviar o link de pagamento/.test(pg.reply), pg.reply.replace(/\n/g, ' | ').slice(0, 160));
pg = await turnosDe(['oi', 'quero agendar ginecologista', 'sim', 'guama amanhã', '52998224725', 'sim', 'vou pagar com cartão de crédito']);
confere('PG2 "vou pagar com cartão de crédito" também vai para a equipe (link)', Boolean(pg.handoff) && pg.handoff.duro === true, pg.reply.replace(/\n/g, ' | ').slice(0, 120));
pg = await turnosDe(['oi', 'quero agendar ginecologista', 'sim', 'guama amanhã', '52998224725', 'sim', 'pix', 'não']);
confere('PG3 "não" depois da chave: paga na recepção e agenda', !pg.handoff && pg.reply.startsWith(MARCA_AGENDADO), pg.reply.replace(/\n/g, ' | ').slice(0, 160));
pg = await turnosDe(['oi, quero ginecologia e vou pagar na recepção', 'sim', 'guama amanhã']);
confere('PG4 quem já disse que paga na recepção NÃO é empurrado para o pix (só vêm o resumo e o pedido dos dados)', !/Chave pix/.test(pg.reply) && !/antecipar o pagamento/.test(pg.reply) && /me manda por favor os dados do paciente/.test(pg.reply), pg.reply.replace(/\n/g, ' | ').slice(0, 160));
// serviço sem valor definido: não dá para induzir o pix (a equipe confirma o valor)
pg = await turnosDe(['oi', 'quero agendar consulta semvalor', 'sim', 'guama amanhã', '52998224725', 'sim']);
confere('PG5 serviço sem valor cadastrado: depois dos dados pergunta a forma de pagamento sem citar valor', !/Chave pix/.test(pg.reply) && /^Como você prefere pagar: por pix, link de crédito ou na recepção, no dia do atendimento\?$/.test(pg.reply) && !/R\$ 0/.test(pg.reply), pg.reply.replace(/\n/g, ' | ').slice(-200));
// dúvidas: o leitor de contexto tem os fatos de pagamento; o que não sabe, deixa com a equipe (não inventa)
chamadasCtx = [];
pg = (await responder(['oi', 'quero agendar ginecologista', 'sim', 'guama amanhã', '52998224725', 'sim', 'pix', 'esse pix é seguro mesmo?'].map((z) => [z]), comContexto({ tipo: 'pergunta', resposta: null }, { conversa: conversaEx }), fonteClinilink)) as any;
confere('PG6 dúvida que os fatos não respondem: não inventa, deixa com a equipe e continua esperando o comprovante', /^Essa eu prefiro confirmar direitinho antes de te responder/.test(pg.reply) && !/a equipe confirme/.test(pg.reply) && /aguardando o comprovante/.test(pg.reply) && !pg.handoff, pg.reply.replace(/\n/g, ' | ').slice(0, 260));
confere('PG6 e o leitor recebeu os fatos de pagamento (formas aceitas, pix opcional, link com a equipe, ordem de chegada)', chamadasCtx.length === 1 && /dá pra pagar por pix, cartão de crédito e débito ou dinheiro em espécie/.test(chamadasCtx[0].fatos) && /Antecipar por pix é opcional/.test(chamadasCtx[0].fatos) && /link de crédito é combinado com a equipe/.test(chamadasCtx[0].fatos) && /ordem de chegada/.test(chamadasCtx[0].fatos), (chamadasCtx[0]?.fatos ?? '').slice(0, 200));
pg = (await responder(['oi', 'quero agendar ginecologista', 'sim', 'guama amanhã', '52998224725', 'sim', 'pix', 'preciso pagar agora?'].map((z) => [z]), comContexto({ tipo: 'pergunta', resposta: 'Não precisa, antecipar por pix é opcional.' }, { conversa: conversaEx }), fonteClinilink)) as any;
confere('PG7 dúvida respondida com os fatos ("preciso pagar agora?") + segue esperando o comprovante', /^Não precisa, antecipar por pix é opcional\./.test(pg.reply) && /aguardando o comprovante/.test(pg.reply), pg.reply.replace(/\n/g, ' | ').slice(0, 200));

// ---- confirmação no modelo da clínica, com dados reais; sugestões e várias mensagens ----
reset({ ocupados: 0 });
let cf: any = await responder(['oi', 'quero agendar ginecologista', 'sim', 'guama amanhã', 'na recepção', '12345678909', 'Joana Teste Souza', '10/05/1990', 'feminino', 'sim'].map((x) => [x]), ctx, fonteClinilink);
const bol = cf.reply.split(/\n\n/);
const d1 = dia(1).split('-').reverse().join('/');
confere('CF1 a confirmação vem em mensagens separadas: aviso, modelo da clínica e sugestão', bol.length === 3 && /^Agendamento confirmado! Deu tudo certo, Joana\. Cadastro de Joana Teste Souza feito\.$/.test(bol[0]) && /^Se puder, chega cedinho, que o atendimento é por ordem de chegada\. Quer aproveitar e agendar mais algum exame ou consulta\?$/.test(bol[2]), JSON.stringify(bol.map((x: string) => x.slice(0, 40))));
confere('CF1 só o primeiro balão leva "Agendamento confirmado" (marca do fim da jornada); os outros não', bol[0].includes(MARCA_AGENDADO) && !bol.slice(1).some((x: string) => /Agendamento confirmado|Posso te ajudar com mais alguma coisa|Tenha um ótimo dia/.test(x)), '');
confere('CF2 modelo da clínica: Paciente, Profissional, Procedimento, Data (dd/mm/aaaa, a partir de HH:MM, por ordem de chegada), Clínica, Endereço, Telefone, WhatsApp, Valor e Formas de pagamento', bol[1] === [
  'Paciente: Joana Teste Souza',
  'Profissional: Dra. Medica Teste da Silva',
  'Procedimento: CONSULTA GINECOLOGIA - Dra. Medica Teste da Silva',
  `📆 Data: ${d1} a partir de 08:00 *POR ORDEM DE CHEGADA*`,
  '🏥 Clínica: CLINEX GUAMÁ',
  '📍 Endereço: Av. José Bonifácio, 2426',
  '☎ Telefone: 91991434370',
  '📲 WhatsApp: 91991434370',
  'Valor particular: R$ 100,00',
  'Formas de pagamento: CARTÃO DE DÉBITO, CREDITO (VISA E MASTER), DINHEIRO, PIX',
].join('\n'), bol[1]);
cf = await responder(['oi', 'quero agendar ginecologista', 'sim', 'telegrafo amanhã', 'na recepção', '52998224725', 'sim'].map((x) => [x]), ctx, fonteClinilink);
confere('CF3 outra unidade: endereço e telefone são os DESSA unidade (Telégrafo), nome do paciente do cadastro', /🏥 Clínica: CLINEX TELEGRAFO/.test(cf.reply) && /📍 Endereço: Travessa Coronel Luís Bentes 170A-Telegrafo/.test(cf.reply) && /☎ Telefone: 91984320406/.test(cf.reply) && /Paciente: Maria Exemplo/.test(cf.reply) && !/Cadastro de/.test(cf.reply), cf.reply.split(/\n\n/)[1]?.slice(0, 200));
// pagou o pix na conversa: a forma de pagamento mostra que foi pago
reset({ ocupados: 0 });
cf = await resp([...baseP, 'pix', img('img-ok')].map((x) => [x]));
confere('CF4 pagou o pix na conversa (comprovante conferido): "Formas de pagamento: PAGO NO PIX (comprovante recebido)"', cf.reply.startsWith(MARCA_AGENDADO) && /Formas de pagamento: PAGO NO PIX \(comprovante recebido\)$/m.test(cf.reply) && !/CARTÃO DE DÉBITO/.test(cf.reply), cf.reply.split(/\n\n/)[1]?.split('\n').slice(-2).join(' | '));
cf = await resp([...baseP, 'pix', img('img-meio'), 'na recepção'].map((x) => [x]));
confere('CF4 pagou só uma parte: mostra quanto foi pago no pix e que o restante fica na recepção', /Formas de pagamento: PAGO R\$ 50,00 NO PIX \(comprovante recebido\); o restante na recepção/.test(cf.reply), cf.reply.split(/\n\n/)[1]?.split('\n').slice(-1)[0]);
// orientação cadastrada (preparo) vem antes de escolher o horário E na confirmação
reset({ ocupados: 0 });
cf = await turnosDe(['oi', 'quero fazer um teste ergometrico', 'sim']);
confere('CF5 serviço com orientação cadastrada: avisa já na informação das unidades, em mensagem separada (antes de escolher o horário)', /Tenho sim!/.test(cf.reply) && /\n\nUma orientação importante pra esse atendimento: NO MÁXIMO ATÉ 70 ANOS(\n|$)/.test(cf.reply), cf.reply.replace(/\n/g, ' | ').slice(0, 260));
cf = await turnosDe(['oi', 'quero fazer um teste ergometrico', 'sim', 'guama amanhã', 'na recepção', '52998224725', 'sim']);
confere('CF5 e repete a orientação na confirmação (mensagem própria entre o modelo e a sugestão)', cf.reply.split(/\n\n/).length === 4 && /^Uma orientação importante pro seu atendimento: NO MÁXIMO ATÉ 70 ANOS$/.test(cf.reply.split(/\n\n/)[2]) && /Procedimento: TESTE ERGOMETRICO - /.test(cf.reply), cf.reply.split(/\n\n/).map((x: string) => x.slice(0, 40)).join(' | '));
cf = await turnosDe(['oi', 'quero agendar ginecologista', 'sim', 'guama']);
confere('CF5 serviço sem orientação (ou com "0" no cadastro): nada de orientação inventada', !/orientação importante/.test(cf.reply), '');
// sugestão proativa: a outra unidade tem vaga mais cedo
(globalThis as any).__dicaUnidade = true;
_limparCache(); // a agenda fica em memória por 2 min: refaz com o Guamá sem o dia de amanhã
reset({ ocupados: 0 });
cf = await turnosDe(['oi', 'quero agendar ginecologista', 'sim', 'guama']);
const bolD = cf.reply.split(/\n\n/);
confere('SG1 a outra unidade tem vaga mais cedo: sugere, em mensagem separada, antes da pergunta', bolD.length === 3 && /^Consegui estes aqui:/.test(bolD[0]) && /^Se for mais fácil, no Telégrafo tenho \p{L}+ dia \d{1,2} de manhã a partir das 8h, mais cedo que esses\. Se quiser, é só me dizer que eu mostro os horários de lá\.$/u.test(bolD[1]) && /^Qual desses fica bom pra você\?/.test(bolD[2]), JSON.stringify(bolD.map((x: string) => x.slice(0, 50))));
cf = await turnosDe(['oi', 'quero agendar ginecologista', 'sim', 'guama', 'pode ser o telégrafo']);
confere('SG1 aceitando a sugestão ("pode ser o telégrafo"), ela mostra os horários de lá (começando pelo mais cedo)', cf.state.unidade?.nome === 'Telégrafo' && /Consegui estes aqui/.test(cf.reply) && cf.state.lista?.[0]?.ymd === dia(1), `${cf.state.unidade?.nome} ${cf.state.lista?.[0]?.ymd} | ${cf.reply.replace(/\n/g, ' | ').slice(0, 100)}`);
(globalThis as any).__dicaUnidade = false;
_limparCache();
reset({ ocupados: 0 });
cf = await turnosDe(['oi', 'quero agendar ginecologista', 'sim', 'guama']);
confere('SG2 sem vaga mais cedo na outra unidade: sem sugestão (uma mensagem só)', !/Se for mais fácil/.test(cf.reply) && cf.reply.split(/\n\n/).length === 1, '');
// "já tá agendado?" com o modelo da clínica
const CONF_MODELO = ['Paciente: Renato Giovanny Valente Gonçalves', 'Profissional: Dra. Ebenezaide Nascimento Perdigão', 'Procedimento: TESTE ERGOMÉTRICO - Dra. Ebenezaide Nascimento Perdigão', '📆 Data: 28/10/2026 a partir de 08:00 *POR ORDEM DE CHEGADA*', '🏥 Clínica: CLINEX GUAMÁ'].join('\n');
cf = (await responder([['ja ta agendado teste ergometrico então?']], { ...ctx, confirmacao: CONF_MODELO, pos: 'confirmado' }, fonteClinilink)) as any;
confere('CF6 "já tá agendado?" depois da confirmação: "Está sim, confirmado! Olha como ficou:" + o modelo da clínica, em mensagens separadas', cf.reply === `Está sim, confirmado! Olha como ficou:\n\n${CONF_MODELO}` && cf.reply.split(/\n\n/).length === 2, cf.reply.slice(0, 120));


// ---- "Um teste ergo" não é a opção 1; pergunta pela agenda traz os horários na mesma resposta ----
const { QUER_AGENDA } = await import('../src/agents/receptivo/script/engine.js');
confere('AG1 "um/uma/dois" no começo de uma frase é artigo, não escolhe a opção', lerEscolha('um teste ergo', 6) === -1 && lerEscolha('uma consulta de cardiologia', 6) === -1 && lerEscolha('dois exames de sangue', 6) === -1, '');
confere('AG1 mas sozinho (ou com "o/a", "opção", "por favor") continua escolhendo', lerEscolha('um', 6) === 0 && lerEscolha('o dois', 6) === 1 && lerEscolha('opcao tres', 6) === 2 && lerEscolha('quero a uma por favor', 6) === 0 && lerEscolha('2', 6) === 1, '');
reset({ ocupados: 0 });
cf = await turnosDe(['oi', 'quero agendar uma consulta']);
confere('AG2 pedido genérico ("uma consulta"): lista das consultas mais procuradas', cf.state.opcoes?.length > 1 && !cf.state.servico, JSON.stringify(cf.state.opcoes?.map((o: any) => o.nome)));
cf = await turnosDe(['oi', 'quero agendar uma consulta', 'Um teste ergo']);
confere('AG2 depois da lista, "Um teste ergo" é pedido NOVO (Teste Ergométrico), não a opção 1 da lista', /ergom/i.test(cf.state.servico?.frase ?? '') && /Teste Ergom/.test(cf.reply) && !/Ginecolog/.test(cf.reply), `${cf.state.servico?.frase} | ${cf.reply.replace(/\n/g, ' | ').slice(0, 120)}`);
confere('AG3 QUER_AGENDA pega os pedidos de agenda', ['quando tem agenda', 'tem agenda pra cardiologia?', 'tem horario?', 'quais as datas disponiveis', 'tem vaga essa semana', 'me manda os horarios', 'agenda'].every((x) => QUER_AGENDA.test(x)), ['quando tem agenda', 'tem horario?', 'quais as datas disponiveis', 'tem vaga essa semana', 'me manda os horarios', 'agenda'].filter((x) => !QUER_AGENDA.test(x)).join(' | '));
confere('AG3 e não pega o resto da conversa', ['quero agendar cardiologia', 'vou olhar minha agenda', 'meu nascimento e 10/05/1990', 'sim', 'na recepcao', 'quero marcar um exame'].every((x) => !QUER_AGENDA.test(x)), ['quero agendar cardiologia', 'vou olhar minha agenda', 'meu nascimento e 10/05/1990', 'sim', 'na recepcao', 'quero marcar um exame'].filter((x) => QUER_AGENDA.test(x)).join(' | '));
// perguntou pela agenda (duas unidades): o resumo e os horários das DUAS unidades vêm na mesma resposta
reset({ ocupados: 0 });
cf = await turnosDe(['oi', 'quero agendar ginecologista', 'sim', 'quando tem agenda?']);
const blAg = cf.reply.split(/\n\n/);
confere('AG4 "quando tem agenda?" (sem unidade escolhida): já mostra os horários das duas unidades, sem perguntar "qual dos dois"', /^Consegui estes aqui:/.test(cf.reply) && /^\d\. Guamá, /m.test(cf.reply) && /^\d\. Telégrafo, /m.test(cf.reply) && !/Qual dos dois/.test(cf.reply) && cf.state.listaMista === true && !cf.state.unidade, cf.reply.replace(/\n/g, ' | ').slice(0, 260));
confere('AG4 cada item diz a unidade, o dia, o período, a hora e a médica; a pergunta final deixa trocar de unidade ou de dia', /^1\. \p{L}+, \p{L}+, dia \d{1,2}, (de manhã|à tarde), a partir das \d{1,2}h/mu.test(cf.reply) && /Se preferir uma unidade ou outro dia, é só me falar\.$/.test(cf.reply), cf.reply.split('\n')[1]);
confere('AG4 sem "equipe" na resposta (a Amanda é quem atende)', !/equipe/i.test(cf.reply), '');
const itensAg: any[] = cf.state.lista;
cf = await turnosDe(['oi', 'quero agendar ginecologista', 'sim', 'quando tem agenda?', '2']);
confere('AG5 escolher o item "2" da lista mista define a unidade e o horário daquele item, e segue pedindo os dados do paciente', cf.state.unidade?.nome === itensAg[1].unidade && cf.state.slot?.ymd === itensAg[1].ymd && cf.state.slot?.inicio === itensAg[1].inicio && /dados do paciente/i.test(cf.reply) && cf.state.listaMista === false, `${cf.state.unidade?.nome} ${cf.state.slot?.ymd} ${cf.state.slot?.inicio}`);
cf = await turnosDe(['oi', 'quero agendar ginecologista', 'sim', 'quando tem agenda?', 'telégrafo']);
confere('AG6 dizer a unidade com a lista mista na tela: refaz a lista só dessa unidade (sem repetir a unidade em cada item)', cf.state.unidade?.nome === 'Telégrafo' && cf.state.listaMista === false && /^Consegui estes aqui:/.test(cf.reply) && !/^\d\. Telégrafo, /m.test(cf.reply) && /^1\. /m.test(cf.reply), cf.reply.replace(/\n/g, ' | ').slice(0, 160));
cf = await turnosDe(['oi', 'quero agendar ginecologista', 'sim', 'quando tem agenda?', 'amanhã']);
confere('AG7 dizer só o dia com a lista mista: mostra os horários desse dia nas unidades (cada item com a unidade)', cf.state.data === dia(1) && /^\d\. (Guamá|Telégrafo), /m.test(cf.reply) && cf.state.listaMista === true && cf.state.lista?.every((x: any) => x.ymd === dia(1)), cf.reply.replace(/\n/g, ' | ').slice(0, 200));
// sem sinal de agenda, o jeito de antes: resume as unidades e pergunta qual
cf = await turnosDe(['oi', 'quero agendar ginecologista', 'sim']);
confere('AG8 sem pedir agenda nem dia: resume unidades e preço e pergunta a unidade (sem lista)', /Tenho sim!/.test(cf.reply) && /Qual dos dois fica melhor/.test(cf.reply) && !/Consegui estes aqui/.test(cf.reply), cf.reply.replace(/\n/g, ' | ').slice(0, 160));
// pediu a agenda já no primeiro pedido: depois do "sim", resumo + horários na mesma resposta (duas mensagens)
cf = await turnosDe(['oi', 'tem agenda de ginecologista?', 'sim']);
confere('AG9 "tem agenda de ginecologista?" + "sim": resumo (unidades e preço) e a lista de horários na MESMA resposta, em mensagens separadas', /^Tenho sim!/.test(cf.reply) && cf.reply.split(/\n\n/).length >= 2 && /\n\nConsegui estes aqui:\n1\. /.test(cf.reply) && !/Qual dos dois/.test(cf.reply), cf.reply.split(/\n\n/).map((x: string) => x.slice(0, 30)).join(' | '));
// uma unidade só: o horário já vinha junto (não muda)
// lista na tela e "quando tem agenda?": repete a lista (não vira "outras opções") e não chama a camada de contexto
chamadasCtx = [];
k = await viaCtx(['oi', 'quero agendar ginecologista', 'sim', 'guama', 'quando tem agenda?'], { tipo: 'pergunta', resposta: null });
confere('AG10 com a lista na tela, "quando tem agenda?" repete os horários ("Esses são os horários que tenho no Guamá:"), sem "Tenho também" nem frase de equipe', /^Esses são os horários que tenho no Guamá:\n1\. /.test(k.reply) && !/Tenho também|equipe|Essa eu prefiro/.test(k.reply) && chamadasCtx.length === 0, k.reply.replace(/\n/g, ' | ').slice(0, 200));
confere('AG10 e a mesma lista continua valendo (escolher "1" funciona depois)', k.state.lista?.length >= 1 && !k.state.slot, '');
// a frase de "não sei" não pode aparecer quando é pergunta de agenda, mesmo que o leitor de contexto diga que não tem resposta
k = await viaCtx(['oi', 'quero agendar ginecologista', 'sim', 'quando tem agenda?'], { tipo: 'pergunta', resposta: null });
confere('AG11 pergunta de agenda sem unidade: o leitor de contexto nem é chamado e a resposta é a lista', chamadasCtx.length === 0 && /^Consegui estes aqui:/.test(k.reply) && !/Essa eu prefiro/.test(k.reply), `${chamadasCtx.length} chamadas | ${k.reply.slice(0, 60)}`);

// ---- comprovante: de hoje e feito DEPOIS do pedido do paciente; senão é de outro atendimento ----
const ontemSP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() - 24 * 3600 * 1000));
const amanhaSP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + 24 * 3600 * 1000));
const compBase = { tipo: 'comprovante', valor: 100, destinatario: 'CLINEX SERVICOS MEDICOS LTDA', status: 'concluido' };
Object.assign(comprovantes, {
  'cp-antes': { ...compBase, data: hojeSP, hora: '09:05' },
  'cp-depois': { ...compBase, data: hojeSP, hora: '15:20' },
  'cp-quase': { ...compBase, data: hojeSP, hora: '14:55' },
  'cp-bem-antes': { ...compBase, data: hojeSP, hora: '14:40' },
  'cp-sem-hora': { ...compBase, data: hojeSP },
  'cp-ontem': { ...compBase, data: ontemSP, hora: '23:50' },
  'cp-futuro': { ...compBase, data: amanhaSP, hora: '10:00' },
});
// o pedido do paciente começou hoje às 15:00 (horário de Belém/São Paulo)
const ctxCp = { ...ctxPix, inicioJornada: new Date(`${hojeSP}T15:00:00-03:00`) };
const compResp = async (id: string) => { reset({ ocupados: 0 }); return (await resp([...baseP, 'pix', img(id)].map((x) => [x]), ctxCp)) as any; };
r = await compResp('cp-antes');
confere('CP1 pago hoje às 9h05, e o pedido começou às 15h: é de outro atendimento (explica e pede o de agora, sem avançar)', /Esse comprovante é de hoje às 9h05, antes da nossa conversa começar, então deve ser de outro atendimento/.test(r.reply) && /pagamento feito agora/.test(r.reply) && /pagar na recepção/.test(r.reply) && !r.handoff && !/CPF/.test(r.reply), r.reply.slice(0, 160));
r = await compResp('cp-bem-antes');
confere('CP2 pago 20 min antes do pedido: também é de outro atendimento', /antes da nossa conversa começar/.test(r.reply) && !/CPF/.test(r.reply), r.reply.slice(0, 100));
r = await compResp('cp-quase');
confere('CP3 pago 5 min antes do pedido (pagou e só então escreveu): aceita, dentro da tolerância de 10 min', r.reply.startsWith(MARCA_AGENDADO) && /PAGO NO PIX/.test(r.reply), r.reply.slice(0, 100));
r = await compResp('cp-depois');
confere('CP4 pago depois do pedido: aceita (e agenda)', r.reply.startsWith(MARCA_AGENDADO), r.reply.slice(0, 100));
r = await compResp('cp-sem-hora');
confere('CP5 comprovante de hoje sem horário visível: aceita (não tem como comparar o horário)', r.reply.startsWith(MARCA_AGENDADO), r.reply.slice(0, 100));
r = await compResp('cp-ontem');
confere('CP6 comprovante de ontem (mesmo às 23h50): é de outro atendimento, de outro dia', /Esse comprovante é de .+, então deve ser de outro atendimento\. Preciso do comprovante do pagamento de hoje, feito pra esse agendamento/.test(r.reply) && !/CPF/.test(r.reply), r.reply.slice(0, 140));
r = await compResp('cp-futuro');
confere('CP7 comprovante com data de amanhã: pede conferir e o de hoje', /Esse comprovante está com a data de .+\. Preciso do comprovante do pagamento de hoje/.test(r.reply) && !/outro atendimento/.test(r.reply), r.reply.slice(0, 140));
r = await compResp('img-antigo');
confere('CP8 comprovante de meses atrás: diz que é de outro atendimento', /então deve ser de outro atendimento/.test(r.reply), r.reply.slice(0, 140));
// a jornada começou ontem à noite e o paciente pagou ontem à noite, depois do pedido: vale
{
  const ctxMadrugada = { ...ctxPix, inicioJornada: new Date(`${ontemSP}T23:30:00-03:00`) };
  reset({ ocupados: 0 });
  r = (await resp([...baseP, 'pix', img('cp-ontem')].map((x) => [x]), ctxMadrugada)) as any;
  confere('CP9 pedido feito ontem às 23h30 e pago ontem às 23h50 (conversa que passou da meia-noite): aceita', r.reply.startsWith(MARCA_AGENDADO), r.reply.slice(0, 100));
}
// o horário do comprovante vai na observação do agendamento (a recepção confere no extrato)
reset({ ocupados: 0 });
r = (await resp([...baseP, 'pix', img('cp-depois')].map((x) => [x]), ctxCp)) as any;
confere('CP10 a observação do agendamento leva o dia e a hora do comprovante', /Pix antecipado: R\$ 100,00 \(\d{2}\/\d{2}\/\d{4} 15:20\)/.test(posts.find((x) => x.rota.endsWith('/agendamentos'))?.corpo?.observacao ?? ''), posts.find((x) => x.rota.endsWith('/agendamentos'))?.corpo?.observacao ?? '(sem agendamento)');

// ---- endereço: texto aprovado pela clínica (Guamá com o link do mapa; Telégrafo) ----
const END_GUAMA = 'Guamá: Endereço: Av. José Bonifácio, 2426 - Guamá, Belém - PA, 66063-075\nhttps://share.google/VHM9fHMaWIUZujkl3';
const END_TELEGRAFO = 'Telégrafo: Travessa Coronel Luís Bentes com a Rua do Úna, nº 170A, no bairro do Telégrafo, em Belém (PA).';
const { SEM_GPT: SEM_GPT_LISTA } = await import('../src/agents/receptivo/script/engine.js');
reset({ ocupados: 0 });
r = (await resp([['qual o endereço de vocês?']])) as any;
confere('EN1 pediu o endereço de cara: manda os dois endereços, cada um numa mensagem, e pergunta o que ele precisa', r.reply.includes(`${END_GUAMA}\n\n${END_TELEGRAFO}\n\n`) && /Qual consulta ou exame você precisa/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 330));
r = (await resp([['onde fica o Guamá?']])) as any;
confere('EN2 pediu o do Guamá: manda só o do Guamá (com o link)', r.reply.includes(END_GUAMA) && !/Telégrafo: Travessa/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 200));
r = (await resp([['como chego na unidade do telégrafo?']])) as any;
confere('EN3 pediu o do Telégrafo: manda só o do Telégrafo', r.reply.includes(END_TELEGRAFO) && !/Guamá: Endereço/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 200));
r = (await resp([...ate3.map(um), um('guamá'), um('qual o endereço?')])) as any;
confere('EN4 já escolheu o Guamá e pergunta o endereço: manda o do Guamá (a unidade dele) e continua o agendamento', r.reply.startsWith(END_GUAMA) && !/Telégrafo: Travessa/.test(r.reply) && /Qual desses fica bom pra você|Consegui estes aqui|horário/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 260));
r = (await resp([...ate3.map(um), um('qual o endereço do telégrafo?')])) as any;
confere('EN5 pergunta o do Telégrafo antes de escolher a unidade: manda o do Telégrafo e retoma a pergunta', r.reply.startsWith(END_TELEGRAFO) && /Qual dos dois/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 240));
confere('EN6 o texto do endereço nunca passa pelo GPT (aprovado palavra por palavra)', SEM_GPT_LISTA.some((x: string) => r.reply.includes(x)), '');

// ---- dados do paciente em qualquer ordem e de uma vez (como os pacientes mandam no dia a dia) ----
{
  const turnosBase = base.map((x: string) => [x]);
  reset({ ocupados: 0 });
  let d: any = await responder([...turnosBase, ['Joana Teste Souza', '91981990849', '12345678909']], ctx, fonteClinilink);
  confere('DD1 nome + telefone + CPF numa rajada: anota tudo, o sexo sai do nome (Joana) e só pede o que falta (nascimento)', /Esse CPF ainda não tá no cadastro/.test(d.reply) && /Me manda a data de nascimento\./.test(d.reply) && !/nome completo/.test(d.reply) && !/telefone/.test(d.reply) && d.state.cad?.nome === 'Joana Teste Souza' && d.state.cad?.telefone === '91981990849' && d.state.cad?.sexo === 'feminino', `${d.reply.replace(/\n/g, ' | ').slice(0, 160)} | ${JSON.stringify(d.state.cad)}`);
  reset({ ocupados: 0 });
  d = await responder([...turnosBase, ['Joana Teste Souza', '91981990849', '12345678909'], ['10/05/1990']], ctx, fonteClinilink);
  const cadDd = posts.find((x) => x.rota.endsWith('/pacientes'))?.corpo;
  confere('DD2 mandou o nascimento: agenda de verdade e cadastra com os dados da rajada (telefone certo, sexo do nome)', d.reply.startsWith(MARCA_AGENDADO) && /Cadastro de Joana Teste Souza feito\./.test(d.reply) && cadDd?.nome === 'Joana Teste Souza' && cadDd?.dataNascimento === '1990-05-10' && cadDd?.sexo === 'feminino' && String(cadDd?.telefone).endsWith('91981990849') && nPost('/agendamentos') === 1, `${d.reply.slice(0, 80)} | ${JSON.stringify({ ...cadDd, cpf: '***' })}`);
  // em qualquer ordem: nascimento primeiro, depois o nome, depois o telefone formatado, o CPF por último
  reset({ ocupados: 0 });
  d = await responder([...turnosBase, ['02/09/1977'], ['Maria Aparecida Teste'], ['(91) 98199-0849'], ['12345678909']], ctx, fonteClinilink);
  confere('DD3 ordem trocada (nascimento, nome, telefone com máscara, CPF): agenda sem pedir de novo', d.reply.startsWith(MARCA_AGENDADO) && nPost('/agendamentos') === 1, d.reply.replace(/\n/g, ' | ').slice(0, 120));
  reset({ ocupados: 0 });
  d = await responder([...turnosBase, ['Joana Teste Souza']], ctx, fonteClinilink);
  confere('DD4 mandou só o nome antes do CPF: "Anotei!" e pede o CPF (não repete a pergunta como se não tivesse entendido)', /^Anotei! Me passa também o CPF do paciente\?/.test(d.reply) && d.state.cad?.nome === 'Joana Teste Souza', d.reply.slice(0, 90));
  // frases de conversa NÃO viram nome
  reset({ ocupados: 0 });
  d = await responder([...turnosBase, ['um minuto, já vou mandar'], ['pode ser esse número mesmo']], ctx, fonteClinilink);
  confere('DD5 "um minuto, já vou mandar" e "pode ser esse número mesmo" não viram o nome do paciente', !d.state.cad?.nome && !d.state.cad?.telefone, JSON.stringify(d.state.cad));
  // nome fora das listas: o sexo não é chutado, ela pergunta
  reset({ ocupados: 0 });
  d = await responder([...turnosBase, ['Xuxu Teste Souza', '91981990849', '12345678909'], ['10/05/1990']], ctx, fonteClinilink);
  confere('DD6 nome que ela não conhece (Xuxu): não chuta o sexo, pergunta feminino ou masculino', /feminino ou masculino/.test(d.reply) && !d.state.cad?.sexo && nPost('/pacientes') === 0, d.reply.replace(/\n/g, ' | ').slice(0, 140));
  d = await responder([...turnosBase, ['Xuxu Teste Souza', '91981990849', '12345678909'], ['10/05/1990'], ['masculino']], ctx, fonteClinilink);
  confere('DD6 respondendo "masculino": conclui e cadastra com o sexo informado', d.reply.startsWith(MARCA_AGENDADO) && posts.find((x) => x.rota.endsWith('/pacientes'))?.corpo?.sexo === 'masculino', d.reply.slice(0, 80));
  // CPF de paciente que já existe: só o nome para confirmar (não pede nascimento nem telefone), mesmo que ele tenha mandado os outros dados
  reset({ ocupados: 0 });
  d = await responder([...turnosBase, ['Maria Exemplo', '91981990849', '52998224725']], ctx, fonteClinilink);
  confere('DD7 CPF que já tem cadastro: mostra só o nome para confirmar', /Achei aqui o cadastro de Maria Exemplo/.test(d.reply) && !/nascimento|telefone/.test(d.reply), d.reply.slice(0, 100));
  // telefone: "pode ser esse número do WhatsApp" quando ela pediu junto com o resto
  reset({ ocupados: 0 });
  d = await responder([...turnosBase, ['Joana Teste Souza', '10/05/1990', '12345678909']], ctx, fonteClinilink);
  confere('DD8 faltou só o telefone: pede, oferecendo o número do WhatsApp', /Me manda o telefone com DDD \(se for esse mesmo número do WhatsApp, é só me avisar\)\./.test(d.reply), d.reply.replace(/\n/g, ' | ').slice(0, 160));
  d = await responder([...turnosBase, ['Joana Teste Souza', '10/05/1990', '12345678909'], ['pode ser esse mesmo']], ctx, fonteClinilink);
  confere('DD8 "pode ser esse mesmo": usa o WhatsApp do paciente e agenda', d.reply.startsWith(MARCA_AGENDADO) && String(posts.find((x) => x.rota.endsWith('/pacientes'))?.corpo?.telefone).endsWith('999990000'), `${d.reply.slice(0, 60)} | ${posts.find((x) => x.rota.endsWith('/pacientes'))?.corpo?.telefone}`);
}
// ---- hoje, retorno, repetidos e serviço "puro" (como a atendente escolhe) ----
{
  const { canonizar } = await import('../src/agents/receptivo/script/clinilinkFonte.js');
  const nm = (x: string) => x;
  confere('CN1 "Retorno" só vale se ele pediu retorno', JSON.stringify(canonizar(['Consulta Ginecologista', 'Consulta Ginecologista - Retorno'], nm, 'consulta com a ginecologista')) === JSON.stringify(['Consulta Ginecologista']) && canonizar(['Consulta Ginecologista', 'Consulta Ginecologista - Retorno'], nm, 'quero marcar o retorno da ginecologista').length === 2, '');
  confere('CN2 cadastros repetidos com as mesmas palavras em outra ordem viram um só (o primeiro)', JSON.stringify(canonizar(['Clinico Geral Consulta', 'Consulta Clínico Geral'], nm, 'clinico geral')) === JSON.stringify(['Clinico Geral Consulta']), '');
  confere('CN3 o serviço "puro" ganha das versões com qualificador que ele não pediu (USG Transvaginal x com Doppler, folículos...)', JSON.stringify(canonizar(['Usg Transvaginal', 'Usg Transvaginal Com Doppler', 'Usg Transvaginal Para Contagem de Folículos'], nm, 'ultrassom transvaginal')) === JSON.stringify(['Usg Transvaginal']), '');
  confere('CN4 mas se ele pediu o qualificador ("com doppler"), não escolhe o puro', canonizar(['Usg Transvaginal', 'Usg Transvaginal Com Doppler'], nm, 'transvaginal com doppler').length === 2, '');
  confere('CN5 serviços diferentes continuam sendo opções (nada some)', canonizar(['Consulta Cardiologista', 'Consulta Dermatologista'], nm, 'consulta').length === 2, '');
}
// "na recepção", "hoje" e conversa solta NÃO viram busca de serviço (antes "recepção" achava "Retenção")
{
  const { PALAVRAS_TESTE } = { PALAVRAS_TESTE: 1 };
  reset({ ocupados: 0 });
  let q: any = await responder([['quero marcar consulta'], ['vou pagar na recepção']], ctx, fonteClinilink);
  confere('LG1 com a lista de opções na tela, "vou pagar na recepção" não procura serviço (continua nas opções) e anota a forma de pagamento', Boolean(q.state.opcoes) && !q.state.servico && q.state.pagPref === 'recepcao', `${q.state.servico?.frase} | ${q.reply.replace(/\n/g, ' | ').slice(0, 100)}`);
  void PALAVRAS_TESTE;
}
// pagamento: como os pacientes falam
{
  const pixFalas = async (falas: string[]) => { reset({ ocupados: 0 }); return (await resp([...baseP, 'pix', ...falas].map((x) => [x]))) as any; };
  let z = await pixFalas(['Já pode deixar pago?']);
  confere('PX1 "já pode deixar pago?": responde que pode e manda a chave de novo', /^Pode sim! Aqui está a chave:/.test(z.reply) && /Chave pix: clinicaclinex@gmail\.com/.test(z.reply) && !/Essa eu prefiro/.test(z.reply), z.reply.replace(/\n/g, ' | ').slice(0, 160));
  z = await pixFalas(['Meu bem não quer enviar']);
  confere('PX2 "não quer enviar" (o pix falhou): oferece pagar na recepção ou o link, sem repetir "aguardando o comprovante"', /Se o pix não quiser enviar/.test(z.reply) && /recepção/.test(z.reply) && /link/.test(z.reply) && !/aguardando/.test(z.reply) && !z.handoff, z.reply.slice(0, 160));
  z = await pixFalas(['Eu pago assim que chegar aí']);
  confere('PX3 "eu pago assim que chegar aí": paga na recepção e agenda', z.state.pagamento === 'recepcao' && z.reply.startsWith(MARCA_AGENDADO), z.reply.replace(/\n/g, ' | ').slice(0, 140));
  z = await pixFalas(['Mas pode deixar agendado']);
  confere('PX4 "pode deixar agendado": entende como pagar na recepção e agenda', z.state.pagamento === 'recepcao' && z.reply.startsWith(MARCA_AGENDADO), z.reply.replace(/\n/g, ' | ').slice(0, 140));
  // a camada de contexto não entra quando o roteiro já respondeu ("Pode sim!"): antes saía "Essa eu prefiro confirmar..." seguido de "Pode sim!"
  chamadasCtx = [];
  const kz = await viaCtx([...baseP, 'pix', 'Já pode deixar pago?'], { tipo: 'pergunta', resposta: null });
  confere('PX6 "já pode deixar pago?" com a camada de contexto ligada: só "Pode sim!" (sem "Essa eu prefiro confirmar...")', /^Pode sim! Aqui está a chave:/.test(kz.reply) && !/Essa eu prefiro/.test(kz.reply) && chamadasCtx.length === 0, kz.reply.replace(/\n/g, ' | ').slice(0, 140));
  z = await pixFalas(['preciso pagar agora?']);
  confere('PX5 "preciso pagar agora?" continua sendo dúvida (não manda a chave como se fosse "quero pagar")', !/^Pode sim! Aqui está a chave/.test(z.reply) && !z.handoff, z.reply.replace(/\n/g, ' | ').slice(0, 140));
}

// ---- casos reais da Manu e do orçamento: exame de sangue, "agora pela manhã", valor + serviço, só o nome, preparo do Clinilink ----
{
  reset({ ocupados: 0 });
  let m: any = await responder([['Silmara Emanuele Sousa da Silva'], ['Eu queria realizar um exame de sangue ainda hoje']], ctx, fonteClinilink);
  confere('MA1 "exame de sangue" sem dizer qual: mostra os exames de laboratório mais procurados (não adivinha "Sangue Oculto")', /exames de laboratório mais procurados/.test(m.reply) && /Hemograma Completo/.test(m.reply) && /Glicose/.test(m.reply) && !/Oculto/.test(m.reply), m.reply.replace(/\n/g, ' | ').slice(0, 200));
  m = await responder([['Eu queria realizar um exame de sangue ainda hoje'], ['Sangue']], ctx, fonteClinilink);
  confere('MA2 e se ele só responde "Sangue", a lista continua (não vira outro serviço)', Boolean(m.state.opcoes) && !m.state.servico, `${m.state.servico?.frase} | ${m.reply.replace(/\n/g, ' | ').slice(0, 100)}`);
  m = await responder([['exame de sangue'], ['1']], ctx, fonteClinilink);
  confere('MA3 escolhendo o 1 da lista de exames de sangue: confirma o exame', /Hemograma|Glicose/.test(m.state.servico?.frase ?? '') && /Entendi, você quer|Ah, então é|Então é/.test(m.reply), `${m.state.servico?.frase} | ${m.reply.replace(/\n/g, ' | ').slice(0, 100)}`);
  m = await responder([['quero marcar sangue oculto']], ctx, fonteClinilink);
  confere('MA4 exame específico com a palavra sangue não vira a lista genérica', !/exames de laboratório mais procurados/.test(m.reply), m.reply.replace(/\n/g, ' | ').slice(0, 120));
  // serviço em confirmação + "Posso fazer agora pela manhã?": não troca de serviço, entende hoje de manhã
  reset({ ocupados: 0 });
  m = await responder([['quero um teste ergometrico'], ['Posso fazer agora pela manhã ?']], ctx, fonteClinilink);
  confere('MB "Posso fazer agora pela manhã?" com o serviço pendente: continua no Teste Ergométrico (não vira Ortopedista) e guarda hoje de manhã', /Ergom/i.test(m.state.servico?.frase ?? '') && m.state.data === hojeSP && m.state.turno === 'manhã', `${m.state.servico?.frase} | ${m.state.data} ${m.state.turno}`);
  // valor + serviço na mesma frase
  m = await responder([['quanto custa um teste ergo?']], ctx, fonteClinilink);
  confere('MC "quanto custa um teste ergo?": diz o valor e confirma o serviço (antes: "essa eu prefiro confirmar")', /R\$ 140,00/.test(m.reply) && /Ergom/i.test(m.reply) && !/Essa eu prefiro/.test(m.reply), m.reply.replace(/\n/g, ' | ').slice(0, 200));
  // valor sem serviço: a camada de contexto não entra
  chamadasCtx = [];
  const kq = await viaCtx(['quanto custa?'], { tipo: 'pergunta', resposta: null });
  confere('MC2 "quanto custa?" sem serviço: pede qual serviço, sem "Essa eu prefiro confirmar..."', /qual consulta ou exame você quer/.test(kq.reply) && !/Essa eu prefiro/.test(kq.reply) && chamadasCtx.length === 0, kq.reply.replace(/\n/g, ' | ').slice(0, 160));
  // só o nome
  m = await responder([['Silmara EMANUELE Sousa da Silva']], ctx, fonteClinilink);
  confere('MD1 mandou só o nome completo: "Prazer, Silmara! Me conta o que você precisa?"', /Prazer, Silmara! Me conta o que você precisa\?/.test(m.reply), m.reply.replace(/\n/g, ' | ').slice(0, 160));
  m = await responder([['consulta marcada anterior']], ctx, fonteClinilink);
  confere('MD2 frase de pedido não vira nome ("consulta marcada anterior")', !/Prazer/.test(m.reply), m.reply.replace(/\n/g, ' | ').slice(0, 120));
  m = await responder([['quero marcar']], ctx, fonteClinilink);
  confere('MD3 "quero marcar" não vira nome', !/Prazer/.test(m.reply), m.reply.replace(/\n/g, ' | ').slice(0, 120));
  // orçamento
  m = await responder([['Solicitar Orçamento']], ctx, fonteClinilink);
  confere('ME "Solicitar Orçamento": pergunta qual consulta ou exame e oferece digitar o pedido médico', /qual consulta ou exame você quer o valor/.test(m.reply) && /pedido médico/.test(m.reply), m.reply.replace(/\n/g, ' | ').slice(0, 200));
  // preparo cadastrado no Clinilink (várias linhas): mensagem própria, com as quebras de linha, sem a frase de abertura
  reset({ ocupados: 0 });
  m = await responder([['quero uma usg de abdome total'], ['sim']], ctx, fonteClinilink);
  confere('MF1 preparo longo do Clinilink: vem como mensagem própria, com as linhas do cadastro, depois do resumo das unidades', m.reply.includes(`\n\n${PREPARO_LONGO}\n`) || m.reply.includes(`\n\n${PREPARO_LONGO}`), m.reply.replace(/\n/g, ' | ').slice(0, 260));
  confere('MF1 e sem a frase "Uma orientação importante" na frente', !/Uma orientação importante/.test(m.reply), '');
  m = await responder([['quero uma usg de abdome total'], ['sim'], ['tem algum preparo?']], ctx, fonteClinilink);
  confere('MF2 "tem algum preparo?": repete o preparo cadastrado', m.reply.includes('Jejum: manter jejum de 8 horas'), m.reply.replace(/\n/g, ' | ').slice(0, 160));
  const { ehSala } = await import('../src/agents/receptivo/script/clinilinkFonte.js');
  confere('MG sala/setor cadastrado como "profissional" (Coleta, Exames, .SALA DE EXAMES) não é médico; médicos continuam sendo', ['COLETA', 'Exames', '.SALA DE EXAMES', 'LABORATORIO'].every((x) => ehSala(x)) && ['FERNANDA BASTOS', 'Felipe Trindade', 'Dra. Giovanna'].every((x) => !ehSala(x)), '');
}

// ---- COMBOS: sugerir quando o paciente pede um serviço que está num combo, e agendar o que ele escolher (cada agendamento grava no Clinilink na hora, ligado ao combo) ----
{
  const ID_F1 = 'c0000001-0000-4000-8000-000000000001';
  const ID_F2 = 'c0000001-0000-4000-8000-000000000002';
  const ID_CK = 'c0000001-0000-4000-8000-000000000003';
  const { _limparCache: limparCombos } = await import('../src/integrations/clinilink.js');
  const corposAg = () => posts.filter((x) => x.rota.endsWith('/agendamentos')).map((x) => x.corpo);
  const procs = () => corposAg().map((c: any) => (c.procedimentos ?? []).map((x: string) => x.slice(0, 4)));
  const modelosDe = (txt: string) => (txt.match(/^Paciente: /gm) ?? []).length;
  /** Como o agente com o estado guardado: cada mensagem continua de onde a conversa parou (e cada resposta é uma gravação de verdade). */
  const seq = async (msgs: string[], m: typeof modo = { ocupados: 0 }, estadoInicial?: any) => {
    reset(m);
    let r: any; let est: any = estadoInicial; const falas: string[] = [];
    for (const msg of msgs) {
      r = await responder([[msg]], ctx, fonteClinilink, est ? { state: est } : undefined);
      est = r.handoff ? estadoDepoisDaResposta(r) : r.state;
      falas.push(r.reply);
    }
    return { r, falas, est };
  };
  const nomesDasEtapas = (st: any) => JSON.stringify(st?.combo?.etapas.map((e: any) => e.itens.map((i: any) => i.curto)));
  /** Combo Feminino 1 escolhido pelo nome, item 1 (a consulta, 1º do combo no Clinilink) agendado: unidade, dia, dados, pagamento. */
  const abertura = ['oi', 'quero o combo feminino 1', '1', 'guama amanhã', '52998224725', 'sim', 'na recepção'];
  const semMarcaDeFim = (falas: string[]) => falas.every((f) => !MARCAS_FIM.some((x) => f.includes(x)));

  // sem o preço avulso de todos os itens (USG e eletrocardiograma não estão no catálogo de teste), ela NÃO afirma economia
  (globalThis as any).__avulsosCombos = false; limparCombos(); reset({ ocupados: 0 });
  let k: any = await responder([['Tem combo feminino?']], ctx, fonteClinilink);
  confere('CB0 sem o preço avulso de todos os itens do combo: lista o preço mas não inventa economia', /1\. Feminino 1 \(R\$ 160,00\): /.test(k.reply) && !/economiza/.test(k.reply), k.reply.replace(/\n/g, ' | ').slice(0, 220));
  k = await responder([['oi'], ['quero agendar ginecologista'], ['sim']], ctx, fonteClinilink);
  confere('CB0 e sem economia comprovada não sugere combo: segue direto para a pergunta da unidade', !/combos que incluem/.test(k.reply) && /Qual dos dois/.test(k.reply), k.reply.replace(/\n/g, ' | ').slice(0, 200));

  (globalThis as any).__avulsosCombos = true; limparCombos(); reset({ ocupados: 0 });
  k = await responder([['Tem combo feminino?']], ctx, fonteClinilink);
  confere('CB1 "Tem combo feminino?": lista os combos femininos com preço, ECONOMIA e o que inclui (sem o retorno), sem transferir', !k.handoff && /Claro! Tenho estes combos femininos:/.test(k.reply) && /1\. Feminino 1 \(R\$ 160,00, economiza R\$ 45,00\): Consulta Ginecologia, Usg Transvaginal, Hemograma Completo/.test(k.reply) && /2\. Feminino 2 \(R\$ 110,00, economiza R\$ 30,00\): Consulta Ginecologia, Eletrocardiograma/.test(k.reply) && !/Retorno/i.test(k.reply), k.reply.replace(/\n/g, ' | ').slice(0, 320));
  k = await responder([['Tem combo feminino?'], ['1']], ctx, fonteClinilink);
  confere('CB2 escolheu o combo: mostra preço, economia e o que inclui (e que o retorno é grátis) e pergunta QUAIS itens quer agendar agora (sem pedir confirmação do combo)', !k.handoff && /O combo é R\$ 160,00, você economiza R\$ 45,00\./.test(k.reply) && /O Feminino 1 inclui: Consulta Ginecologia, Usg Transvaginal, Hemograma Completo\. O retorno da consulta está incluso, sem custo\./.test(k.reply) && /Os itens do combo são:\n1\. Consulta Ginecologia\n2\. Usg Transvaginal\n3\. Hemograma Completo\nQuais você quer agendar agora\? Pode ser um, vários juntos \(ex\.: 1 e 3\) ou todos\. Se preferir, eu sigo começando por Consulta Ginecologia\./.test(k.reply) && k.state.combo?.perguntando === true, k.reply.replace(/\n/g, ' | ').slice(0, 520));
  confere('CB2 os itens vêm na ORDEM do combo no Clinilink (consulta, USG, coleta), sem reordenar', nomesDasEtapas(k.state) === JSON.stringify([['Consulta Ginecologia'], ['Usg Transvaginal'], ['Hemograma Completo']]), nomesDasEtapas(k.state));

  // agendar o 1º item: unidade, dia, dados, pagamento e AÍ grava só esse item (ligado ao combo), sem encerrar a conversa
  let s1 = await seq(abertura);
  let ags = corposAg();
  confere('CB3 1º item agendado na hora: UMA gravação (a consulta, amanhã, agenda principal), ligada ao combo', ags.length === 1 && ags[0].comboId === ID_F1 && JSON.stringify(ags[0].procedimentos) === JSON.stringify([PROC]) && ags[0].agendaId === AGENDA && String(ags[0].dataHora).startsWith(dia(1)), JSON.stringify(ags.map((c: any) => [c.comboId?.slice(-2), c.procedimentos?.map((x: string) => x.slice(0, 4)), c.dataHora])));
  confere('CB3 avisa o que foi reservado e mostra o que falta, perguntando o que quer agendar agora', /^Pronto! Reservei consulta Ginecologia no Guamá /.test(s1.r.reply) && /Ainda falta no combo:\n1\. Usg Transvaginal\n2\. Hemograma Completo\nQuer agendar algum agora\? Pode ser um, vários juntos ou todos\./.test(s1.r.reply), s1.r.reply.replace(/\n/g, ' | ').slice(0, 300));
  confere('CB3 a conversa NÃO é encerrada e nenhuma mensagem do meio leva a marca de fim (senão a próxima mensagem abriria outra jornada)', s1.r.state.fim === false && s1.r.state.combo?.perguntando === true && semMarcaDeFim(s1.falas) && !s1.r.handoff && etapa(s1.r.state) === 'combo: decidindo a próxima etapa', `${etapa(s1.r.state)} | fim=${s1.r.state.fim}`);
  confere('CB3 e o paciente existente não foi cadastrado de novo', nPost('/pacientes') === 0);

  // "sim": segue a sugestão (o próximo da ordem), na mesma unidade e a partir do dia do anterior; escolher o horário grava na hora
  s1 = await seq(['sim'], { ocupados: 0 }, s1.est);
  confere('CB4 "sim": mostra os horários do próximo item na mesma unidade, começando no dia do anterior', /^Tenho sim! No Guamá /.test(s1.r.reply) && /Consegui estes aqui:/.test(s1.r.reply) && s1.r.state.servico?.nome === 'Usg Transvaginal' && s1.r.state.lista?.[0]?.ymd === dia(1), s1.r.reply.replace(/\n/g, ' | ').slice(0, 300));
  s1 = await seq(['1'], { ocupados: 0 }, s1.est);
  ags = corposAg();
  confere('CB4 escolheu o horário: grava a USG (outra agenda, mesmo dia), ligada ao combo, e pergunta pelo último item', ags.length === 1 && ags[0].comboId === ID_F1 && JSON.stringify(ags[0].procedimentos) === JSON.stringify([PROC_USGC]) && ags[0].agendaId === AGENDA_USGC && String(ags[0].dataHora).startsWith(dia(1)) && /^Pronto! Reservei Usg Transvaginal /.test(s1.r.reply) && /Falta só Hemograma Completo no combo\. Quer agendar agora\?/.test(s1.r.reply) && !s1.r.state.fim, `${ags.length} POSTs | ${s1.r.reply.replace(/\n/g, ' | ').slice(0, 240)}`);
  s1 = await seq(['sim', '1'], { ocupados: 0 }, s1.est);
  ags = corposAg();
  confere('CB5 último item: grava a coleta e manda a confirmação de TODOS os agendamentos do combo (3 modelos da clínica)', s1.r.reply.startsWith(MARCA_AGENDADO) && s1.r.state.fim === true && ags.length === 1 && JSON.stringify(ags[0].procedimentos) === JSON.stringify([PROC_HEMO]) && ags[0].agendaId === AGENDA_COLETA && ags[0].comboId === ID_F1 && modelosDe(s1.r.reply) === 3 && /\(COMBO FEMININO 1\)/.test(s1.r.reply), `${ags.length} POST | ${modelosDe(s1.r.reply)} modelos`);
  confere('CB5 cada modelo traz o serviço, o profissional ou a sala, o dia e o valor dentro do combo (na ordem em que foram agendados)', /Procedimento: CONSULTA GINECOLOGIA - Dra\. Medica Teste da Silva \(COMBO FEMININO 1\)[\s\S]*Procedimento: USG TRANSVAGINAL - Dr\. Luis Usg Teste \(COMBO FEMININO 1\)[\s\S]*Procedimento: HEMOGRAMA COMPLETO - COLETA \(COMBO FEMININO 1\)/.test(s1.r.reply) && /Valor no combo: R\$ 80,00[\s\S]*Valor no combo: R\$ 70,00[\s\S]*Valor no combo: R\$ 10,00/.test(s1.r.reply), s1.r.reply.split(/\n\n/).map((p: string) => p.split('\n').filter((l) => /^Procedimento|^Valor/.test(l)).join(' / ')).join(' || ').slice(0, 420));
  confere('CB5 fecha dizendo que o combo fechou no preço e quanto o paciente economizou', /O combo Feminino 1 fechou em R\$ 160,00, uma economia de R\$ 45,00\./.test(s1.r.reply) && !/Ficou pendente/.test(s1.r.reply), s1.r.reply.split(/\n\n/).slice(-2).join(' || ').slice(0, 260));
  confere('CB5 o retorno do combo nunca é agendado', !corposAg().some((c: any) => (c.procedimentos ?? []).includes(PROC_RETORNO)));

  // o paciente escolhe o que quer agendar, na ordem que quiser
  s1 = await seq(['oi', 'quero o combo feminino 1', '2']);
  confere('CB6 escolheu só o item 2 (USG) já na lista inicial: começa por ele, sem seguir a ordem', s1.r.state.servico?.id === PROC_USGC && !s1.r.state.combo?.perguntando && /Tenho sim!/.test(s1.r.reply) && corposAg().length === 0, `${s1.r.state.servico?.nome} | ${s1.r.reply.replace(/\n/g, ' | ').slice(0, 160)}`);
  s1 = await seq(['oi', 'quero o combo feminino 1', 'só o hemograma']);
  confere('CB6 escolher pelo nome ("só o hemograma")', s1.r.state.servico?.id === PROC_HEMO && !s1.r.state.combo?.perguntando, `${s1.r.state.servico?.nome}`);
  s1 = await seq([...abertura, 'o hemograma']);
  confere('CB6 depois do 1º item, pode pular a ordem ("o hemograma" antes da USG): abre o hemograma', s1.r.state.servico?.id === PROC_HEMO && !s1.r.state.combo?.perguntando && /Tenho sim!/.test(s1.r.reply), `${s1.r.state.servico?.nome} | ${s1.r.reply.replace(/\n/g, ' | ').slice(0, 160)}`);

  // o paciente para no meio: fecha com o que já foi agendado e avisa o que ficou pendente
  s1 = await seq([...abertura, 'depois eu marco']);
  confere('CB7 "depois eu marco": confirma só o que foi agendado e diz o que ficou pendente (sem cobrar nem insistir)', s1.r.reply.startsWith(MARCA_AGENDADO) && modelosDe(s1.r.reply) === 1 && /Ficou pendente no combo: Usg Transvaginal e Hemograma Completo\./.test(s1.r.reply) && !/fechou em/.test(s1.r.reply) && nPost('/agendamentos') === 1 && s1.r.state.fim === true, s1.r.reply.split(/\n\n/).slice(-2).join(' || ').slice(0, 260));
  // dúvidas no meio: o endereço e o preço do combo são respondidos e a pergunta continua
  s1 = await seq([...abertura, 'qual o endereço do guamá?']);
  confere('CB8 dúvida no meio do combo (endereço): responde e repete a pergunta, sem agendar nada a mais', /^Guamá: Endereço:/.test(s1.r.reply) && /Ainda falta no combo:/.test(s1.r.reply) && nPost('/agendamentos') === 1, s1.r.reply.replace(/\n/g, ' | ').slice(0, 260));
  s1 = await seq([...abertura, 'qual o valor do combo?']);
  confere('CB8 e o preço do combo (não o avulso de um item)', /^O combo Feminino 1 é R\$ 160,00, você economiza R\$ 45,00\./.test(s1.r.reply) && /Ainda falta no combo/.test(s1.r.reply), s1.r.reply.replace(/\n/g, ' | ').slice(0, 260));
  s1 = await seq([...abertura, 'hmm', 'ahn', 'sei lá']);
  confere('CB8 sem resposta clara 3 vezes: não insiste, fecha o combo com o que já foi agendado', s1.r.reply.startsWith(MARCA_AGENDADO) && /Ficou pendente/.test(s1.r.reply) && nPost('/agendamentos') === 1, s1.r.reply.slice(0, 80));

  // VÁRIOS serviços no mesmo agendamento: o que a mesma agenda atende vai junto; o resto entra no mesmo dia em outra agenda
  s1 = await seq(['oi', 'quero o combo feminino 1', '1 e 2']);
  confere('CB9 "1 e 2": junta a consulta e a USG num agendamento só, no mesmo dia, e pergunta a unidade', /^Beleza, vamos agendar Consulta Ginecologia e Usg Transvaginal juntos, no mesmo dia\./.test(s1.r.reply.replace(/^Oi[^\n]*\n/, '')) || /vamos agendar Consulta Ginecologia e Usg Transvaginal juntos, no mesmo dia\./.test(s1.r.reply), s1.r.reply.replace(/\n/g, ' | ').slice(0, 260));
  s1 = await seq(['oi', 'quero o combo feminino 1', '1 e 2', 'guama amanhã', '52998224725', 'sim', 'na recepção']);
  ags = corposAg();
  confere('CB9 grava os dois no mesmo dia (consulta na agenda principal, USG na agenda do ultrassom), os dois ligados ao combo', ags.length === 2 && ags.every((c: any) => c.comboId === ID_F1 && String(c.dataHora).startsWith(dia(1))) && JSON.stringify(ags[0].procedimentos) === JSON.stringify([PROC]) && ags[1].agendaId === AGENDA_USGC, `${ags.length} POSTs | ${JSON.stringify(procs())}`);
  confere('CB9 avisa os dois horários e pergunta pelo que falta', /^Pronto! Reservei Consulta Ginecologia e Usg Transvaginal no Guamá /.test(s1.r.reply) && /Usg Transvaginal fica agendado no mesmo dia, a partir das 10:00, por ordem de chegada\./.test(s1.r.reply) && /Falta só Hemograma Completo no combo\./.test(s1.r.reply), s1.r.reply.replace(/\n/g, ' | ').slice(0, 320));
  s1 = await seq(['oi', 'quero o combo feminino 1', 'todos', 'guama amanhã', '52998224725', 'sim', 'na recepção']);
  ags = corposAg();
  confere('CB10 "todos": o combo inteiro num dia só, 3 gravações (consulta, USG e coleta, cada uma na sua agenda), todas ligadas ao combo', s1.r.reply.startsWith(MARCA_AGENDADO) && ags.length === 3 && ags.every((c: any) => c.comboId === ID_F1 && String(c.dataHora).startsWith(dia(1))) && ags.some((c: any) => c.agendaId === AGENDA && c.procedimentos[0] === PROC) && ags.some((c: any) => c.agendaId === AGENDA_USGC) && ags.some((c: any) => c.agendaId === AGENDA_COLETA), `${ags.length} POSTs | ${JSON.stringify(procs())}`);
  confere('CB10 a confirmação mostra cada serviço agendado (3 modelos), o valor do combo e a economia', /Procedimento: CONSULTA GINECOLOGIA - [^,\n]+, USG TRANSVAGINAL - LUIS USG TESTE, HEMOGRAMA COMPLETO - COLETA \(COMBO FEMININO 1\)/.test(s1.r.reply) && /Valor no combo: R\$ 160,00/.test(s1.r.reply) && /fechou em R\$ 160,00, uma economia de R\$ 45,00/.test(s1.r.reply) && /Usg Transvaginal fica agendado no mesmo dia, a partir das 10:00/.test(s1.r.reply), s1.r.reply.split(/\n\n/).slice(0, 3).join(' || ').slice(0, 420));
  // consulta + eletrocardiograma: a MESMA agenda atende os dois, então vai numa gravação só
  s1 = await seq(['oi', 'quero o feminino 2', 'todos', 'guama amanhã', '52998224725', 'sim', 'na recepção']);
  ags = corposAg();
  confere('CB11 consulta + eletrocardiograma (mesma agenda): UMA gravação com os dois serviços, no mesmo horário, ligada ao combo', s1.r.reply.startsWith(MARCA_AGENDADO) && ags.length === 1 && JSON.stringify(ags[0].procedimentos) === JSON.stringify([PROC, PROC_ECG]) && ags[0].comboId === ID_F2, `${ags.length} POSTs | ${JSON.stringify(procs())}`);
  confere('CB11 e o modelo mostra os dois serviços e o valor do combo (R$ 110,00)', /Procedimento: CONSULTA GINECOLOGIA - [^,\n]+, ELETROCARDIOGRAMA - [^\n]+ \(COMBO FEMININO 2\)/.test(s1.r.reply) && /Valor no combo: R\$ 110,00/.test(s1.r.reply), s1.r.reply.split(/\n\n/)[1]?.slice(0, 260));
  // juntar enquanto escolhe o horário ("e o hemograma também")
  s1 = await seq([...abertura, 'o hemograma e a usg também']);
  confere('CB12 depois do 1º item, citar dois itens pelo nome junta os dois num agendamento só', /vamos agendar Usg Transvaginal e Hemograma Completo juntos, no mesmo dia\./.test(s1.r.reply) && s1.r.state.servico?.combo?.itens.length === 2, `${s1.r.state.servico?.nome} | ${s1.r.reply.replace(/\n/g, ' | ').slice(0, 220)}`);
  // sem dia em comum: volta a um item de cada vez
  s1 = await seq(['oi', 'quero o combo infantil 1', 'todos']);
  confere('CB13 itens sem dia em comum na agenda (um deles não tem agenda): não trava, agenda o que dá e avisa', !s1.r.handoff || /sem vaga|COMBO/.test(s1.r.handoff.motivo), `${s1.r.reply.replace(/\n/g, ' | ').slice(0, 260)}`);

  // etapa de laboratório: todos os exames entram juntos, numa gravação só
  s1 = await seq(['oi', 'quero o check up 10', 'guama amanhã', '52998224725', 'sim', 'na recepção'], { ocupados: 0 });
  ags = corposAg();
  confere('CB14 combo só de exames de laboratório: um agendamento só, uma gravação com os dois exames (agenda da coleta), ligada ao combo', s1.r.reply.startsWith(MARCA_AGENDADO) && ags.length === 1 && ags[0].agendaId === AGENDA_COLETA && JSON.stringify(ags[0].procedimentos) === JSON.stringify([PROC_HEMO, PROC_GLIC]) && ags[0].comboId === ID_CK, `${ags.length} POSTs | ${s1.r.reply.slice(0, 50)}`);
  confere('CB14 diz que os exames ficam no mesmo dia, mostra os dois no modelo, o valor do combo e a economia', /Os exames do combo ficam todos no mesmo dia\./.test(s1.falas[1]) && /Procedimento: HEMOGRAMA COMPLETO - COLETA, GLICEMIA EM JEJUM - COLETA \(COMBO CHECK UP 10\)/.test(s1.r.reply) && /Valor no combo: R\$ 17,00/.test(s1.r.reply) && /fechou em R\$ 17,00, uma economia de R\$ 8,00/.test(s1.r.reply), s1.r.reply.split(/\n\n/)[1]?.slice(0, 260));

  // sugestão: quem pede só um serviço que está em combos vê os combos e quanto economiza
  s1 = await seq(['oi', 'quero agendar ginecologista', 'sim']);
  confere('CB15 pediu só a consulta: depois de confirmar o serviço ela sugere os combos que incluem a consulta, do mais barato, com a economia', !s1.r.handoff && /Tenho combos que incluem consulta Ginecologia e saem mais em conta:/.test(s1.r.reply) && /1\. Feminino 2 \(R\$ 110,00, economiza R\$ 30,00\): Consulta Ginecologia, Eletrocardiograma/.test(s1.r.reply) && /2\. Feminino 1 \(R\$ 160,00, economiza R\$ 45,00\)/.test(s1.r.reply) && /Quer agendar algum desses combos ou só a consulta\?/.test(s1.r.reply) && nPost('/agendamentos') === 0, s1.r.reply.replace(/\n/g, ' | ').slice(0, 360));
  confere('CB15 a sugestão também mostra o preço avulso da consulta, para comparar', /A consulta é R\$ 100,00\. Tenho combos/.test(s1.r.reply), s1.r.reply.slice(0, 120));
  // duas mensagens na mesma rodada (a resposta da 1ª nunca chega ao paciente): a sugestão não pode se perder
  reset({ ocupados: 0 });
  k = await responder([['bom dia'], ['quero agendar uma consulta com ginecologista', 'tem?'], ['sim, quero agendar', 'quando da pra agendar?']], ctx, fonteClinilink);
  confere('CB15 se a sugestão de combos caiu numa resposta que foi descartada (2 mensagens juntas), ela é feita na resposta que vale (não é "gasta" sem o paciente ver)', /Tenho combos que incluem consulta Ginecologia/.test(k.reply) && k.state.ofertaCombo?.opcoes.length === 2, k.reply.replace(/\n/g, ' | ').slice(0, 200));
  s1 = await seq(['oi', 'quero agendar ginecologista', 'sim', 'só a consulta mesmo']);
  confere('CB16 "só a consulta mesmo": segue com a consulta avulsa (sem insistir) e pergunta a unidade', /^Sem problema, vamos só com consulta Ginecologia\./.test(s1.r.reply) && /Qual dos dois/.test(s1.r.reply) && !s1.r.state.combo && !s1.r.state.ofertaCombo, s1.r.reply.replace(/\n/g, ' | ').slice(0, 220));
  s1 = await seq(['oi', 'quero agendar ginecologista', 'sim', 'só a consulta mesmo', 'guama amanhã', '52998224725', 'sim', 'na recepção']);
  ags = corposAg();
  confere('CB16 e a consulta avulsa é agendada como sempre: uma gravação SEM combo, e a jornada fecha', s1.r.reply.startsWith(MARCA_AGENDADO) && ags.length === 1 && !ags[0].comboId && !/COMBO/.test(s1.r.reply), `${ags.length} POST | comboId=${ags[0]?.comboId}`);
  s1 = await seq(['oi', 'quero agendar ginecologista', 'sim', 'sim']);
  confere('CB17 "sim" com mais de um combo na tela: pergunta qual (não escolhe sozinha)', /^Qual combo você prefere\?/.test(s1.r.reply) && !s1.r.state.combo, s1.r.reply.replace(/\n/g, ' | ').slice(0, 200));
  s1 = await seq(['oi', 'quero agendar ginecologista', 'sim', 'o feminino 2']);
  confere('CB18 escolheu o combo sugerido: sugere começar pela consulta que ele pediu (e deixa escolher os outros itens)', /Os itens do combo são:\n1\. Consulta Ginecologia\n2\. Eletrocardiograma\n/.test(s1.r.reply) && /Se preferir, eu sigo começando por Consulta Ginecologia\./.test(s1.r.reply) && s1.r.state.combo?.id === ID_F2, s1.r.reply.replace(/\n/g, ' | ').slice(0, 300));
  s1 = await seq(['oi', 'quero agendar ginecologista', 'sim', 'o feminino 2', 'sim', 'guama amanhã', '52998224725', 'sim', 'na recepção']);
  ags = corposAg();
  confere('CB18 seguindo a sugestão ("sim"): agenda a consulta ligada ao combo e pergunta pelo eletrocardiograma', ags.length === 1 && ags[0].comboId === ID_F2 && JSON.stringify(ags[0].procedimentos) === JSON.stringify([PROC]) && /Falta só Eletrocardiograma no combo\./.test(s1.r.reply), `${JSON.stringify(procs())} | ${s1.r.reply.replace(/\n/g, ' | ').slice(0, 200)}`);
  s1 = await seq(['sim', '1'], { ocupados: 0 }, s1.est);
  confere('CB18 fecha o combo com os dois modelos e a economia', s1.r.reply.startsWith(MARCA_AGENDADO) && modelosDe(s1.r.reply) === 2 && /fechou em R\$ 110,00, uma economia de R\$ 30,00/.test(s1.r.reply) && corposAg().length === 1, s1.r.reply.split(/\n\n/).slice(-2).join(' || ').slice(0, 240));
  s1 = await seq(['oi', 'quero agendar ginecologista', 'sim', 'o feminino 1']);
  confere('CB19 a sugestão aparece uma vez só: escolhido o combo, o fluxo segue (sem sugerir de novo)', !/combos que incluem/.test(s1.r.reply) && !!s1.r.state.combo && s1.r.state.comboOferecido === true, s1.r.reply.replace(/\n/g, ' | ').slice(0, 160));
  // com pix: o valor é o do combo inteiro
  s1 = await seq(['oi', 'quero o combo feminino 1', '1', 'guama amanhã', '52998224725', 'sim', 'pix']);
  confere('CB20 pix no combo: o valor que ela passa é o do combo inteiro (R$ 160,00)', /o valor do combo é R\$ 160,00/.test(s1.r.reply) && /Chave pix:/.test(s1.r.reply) && nPost('/agendamentos') === 0, s1.r.reply.replace(/\n/g, ' | ').slice(0, 220));
  s1 = await seq(['oi', 'quero o combo feminino 1', '1', 'guama amanhã', '52998224725', 'sim']);
  confere('CB20 e a pergunta do pagamento também fala do valor do combo', /o valor do combo é R\$ 160,00/.test(s1.r.reply), s1.r.reply.replace(/\n/g, ' | ').slice(0, 220));

  // um item sem agenda aberta: avisa a equipe no fim, mas o resto é agendado
  s1 = await seq(['oi', 'quero o combo infantil 1', '1', 'guama', '1', '52998224725', 'sim', 'na recepção']);
  confere('CB21 combo em que um item não tem agenda: agenda o que dá, confirma e passa o que faltou para a equipe', s1.r.reply.startsWith(MARCA_AGENDADO) && /Pra Teste Rapido Hiv não tinha vaga aberta agora\. A equipe vai te ajudar com isso\./.test(s1.r.reply) && Boolean(s1.r.handoff) && !s1.r.handoff?.duro && /COMBO Infantil 1: sem vaga aberta para Teste Rapido Hiv/.test(s1.r.handoff?.motivo ?? '') && nPost('/agendamentos') === 1, `${s1.r.handoff?.motivo?.slice(0, 160)} | ${s1.r.reply.slice(0, 100)}`);

  // problemas no meio do combo
  {
    const antes = await seq([...abertura, 'sim', '1', 'sim'], { ocupados: 0 });
    modo = { ocupados: 0, agendamento: 'duplicado' };
    const dup = await seq(['1'], modo, antes.est);
    confere('CB22 o Clinilink recusa um item por já existir no dia: ela explica qual já existe e pergunta o que fazer (sem fechar o combo)', /^Vi que esse paciente já tem/.test(dup.r.reply) && /manter esse que já está marcado/.test(dup.r.reply) && !dup.r.state.fim && !dup.r.handoff, dup.r.reply.replace(/\n/g, ' | ').slice(0, 260));
    const manter = await seq(['pode manter'], { ocupados: 0 }, dup.est);
    confere('CB22 "pode manter": o item conta como já feito e o combo fecha com o resto', manter.r.reply.startsWith(MARCA_AGENDADO) && /Hemograma Completo já estava agendado, então ficou como estava\./.test(manter.r.reply) && modelosDe(manter.r.reply) === 2, manter.r.reply.split(/\n\n/).slice(-3).join(' || ').slice(0, 260));
    modo = { ocupados: 0, agendamento: 'ocupado-sempre' };
    const cheio = await seq(['1'], modo, antes.est);
    confere('CB23 a vaga do item acabou de ser ocupada: passa para a equipe dizendo o que já foi agendado e o que falta no combo', Boolean(cheio.r.handoff) && !cheio.r.reply.startsWith(MARCA_AGENDADO) && /COMBO Feminino 1/.test(cheio.r.handoff?.motivo ?? '') && /Já agendado: Consulta Ginecologia/.test(cheio.r.handoff?.motivo ?? '') && /Usg Transvaginal/.test(cheio.r.handoff?.motivo ?? ''), cheio.r.handoff?.motivo?.slice(0, 300));
    const humano = await seq(['quero falar com uma pessoa'], { ocupados: 0 }, antes.est);
    confere('CB24 pediu atendente no meio do combo: a equipe recebe onde o combo parou', Boolean(humano.r.handoff) && /COMBO Feminino 1/.test(humano.r.handoff?.motivo ?? '') && /Já agendado: Consulta Ginecologia/.test(humano.r.handoff?.motivo ?? ''), humano.r.handoff?.motivo?.slice(0, 260));
  }

  // sem estado guardado (reprocessa a conversa inteira a cada mensagem): os itens já respondidos não regravam e o último grava UMA vez
  reset({ ocupados: 0 });
  const tudo = [...abertura, 'sim', '1', 'sim', '1'];
  k = await responder(tudo.map((x) => [x]), ctx, fonteClinilink);
  confere('CB25 sem Redis (reprocessando tudo): a última mensagem grava só o último item (1 gravação) e a confirmação traz os 3', k.reply.startsWith(MARCA_AGENDADO) && nPost('/agendamentos') === 1 && JSON.stringify(corposAg()[0].procedimentos) === JSON.stringify([PROC_HEMO]) && modelosDe(k.reply) === 3, `${nPost('/agendamentos')} POST | ${modelosDe(k.reply)} modelos`);
  reset({ ocupados: 0 });
  k = await responder(abertura.map((x) => [x]), ctx, fonteClinilink);
  confere('CB25 e no meio do combo a resposta é a mesma pergunta do que falta', /Ainda falta no combo:\n1\. Usg Transvaginal\n2\. Hemograma Completo/.test(k.reply) && nPost('/agendamentos') === 1, k.reply.replace(/\n/g, ' | ').slice(0, 200));

  // sair do combo
  s1 = await seq(['oi', 'quero agendar ginecologista', 'sim', 'na verdade quero um usg']);
  confere('CB26 depois da sugestão de combos, pedir OUTRO serviço: a sugestão cai e o novo pedido é tratado (não fica preso nos combos)', !s1.r.state.ofertaCombo && !s1.r.state.combo && /Usg Abdome Total/.test(s1.r.reply) && /né\?|é isso\?/.test(s1.r.reply), s1.r.reply.replace(/\n/g, ' | ').slice(0, 200));
  s1 = await seq(['oi', 'quero o combo feminino 1', 'sem combo, deixa pra lá']);
  confere('CB27 "sem combo" antes de agendar qualquer item: deixa o combo de lado e pergunta o que ele precisa (nada gravado)', /deixamos o combo de lado\. Qual consulta ou exame você precisa\?/.test(s1.r.reply) && !s1.r.state.combo && !s1.r.state.servico && nPost('/agendamentos') === 0, s1.r.reply.replace(/\n/g, ' | ').slice(0, 200));
  s1 = await seq([...abertura, 'sim', 'deixa o combo, só isso']);
  confere('CB28 desistiu no meio do 2º item: fecha o combo com o 1º e diz o que ficou pendente', s1.r.reply.startsWith(MARCA_AGENDADO) && modelosDe(s1.r.reply) === 1 && /Ficou pendente no combo: Usg Transvaginal e Hemograma Completo\./.test(s1.r.reply) && nPost('/agendamentos') === 1, s1.r.reply.split(/\n\n/).slice(-2).join(' || ').slice(0, 220));
  // o paciente já tinha tudo marcado: nenhum agendamento novo
  s1 = await seq(['oi', 'quero agendar ginecologista', 'sim', 'o feminino 2', 'sim', 'guama amanhã', '52998224725', 'sim', 'na recepção', 'pode manter', 'não'], { ocupados: 0, agendamento: 'duplicado' });
  confere('CB29 combo em que o paciente já tinha o 1º item no dia e ela não gravou nada: fecha dizendo que não fez agendamento novo (sem "Agendamento confirmado")', /Combinado, não fiz nenhum agendamento novo\./.test(s1.r.reply) && !s1.r.reply.startsWith(MARCA_AGENDADO) && s1.r.state.fim === true, s1.r.reply.replace(/\n/g, ' | ').slice(0, 200));

  // as mensagens do combo levam preço, economia, datas e horários: têm texto exato e NÃO passam pela reescrita do GPT
  s1 = await seq([...abertura, 'sim', '1', 'sim', '1']);
  const doCombo = s1.falas.filter((f: string) => /combo|Reservei/.test(f));
  confere('CB30 as mensagens do combo (sugestão, preço, lista de itens, "Reservei...", confirmação final) estão na lista de textos que o GPT não reescreve', doCombo.length >= 5 && doCombo.every((f: string) => SEM_GPT.some((x: string) => f.includes(x))), `${doCombo.length} mensagens | sem proteção: ${doCombo.filter((f: string) => !SEM_GPT.some((x: string) => f.includes(x))).map((f: string) => f.slice(0, 60)).join(' || ')}`);
  s1 = await seq(['oi', 'quero agendar ginecologista', 'sim']);
  confere('CB30 e a sugestão de combos também', SEM_GPT.some((x: string) => s1.r.reply.includes(x)), s1.r.reply.slice(0, 60));

  // combo novo depois de um combo concluído: abre outra jornada
  s1 = await seq(['oi', 'quero o check up 10', 'guama amanhã', '52998224725', 'sim', 'na recepção', 'quero o combo feminino 2']);
  confere('CB31 depois do combo concluído, pedir outro combo abre uma jornada nova (o estado do combo anterior não vaza)', !!s1.r.state.combo && s1.r.state.combo.id === ID_F2 && s1.r.state.combo.feitos.length === 0, `${s1.r.state.combo?.id} | ${s1.r.reply.replace(/\n/g, ' | ').slice(0, 120)}`);

  // a ordem do combo pode ser ajustada por combo (arquivo combosOrdem.ts); sem ajuste, vale a do Clinilink
  const { ORDEM_DOS_COMBOS } = await import('../src/agents/receptivo/script/combosOrdem.js');
  ORDEM_DOS_COMBOS['feminino 1'] = ['hemograma', 'usg', 'consulta'];
  limparCombos(); reset({ ocupados: 0 });
  k = await responder([['quero o combo feminino 1']], ctx, fonteClinilink);
  confere('CB32 ordem própria do combo (combosOrdem.ts): os itens aparecem na ordem definida, e os outros combos seguem a do Clinilink', /1\. Hemograma Completo\n2\. Usg Transvaginal\n3\. Consulta Ginecologia/.test(k.reply) && /começando por Hemograma Completo\./.test(k.reply), k.reply.replace(/\n/g, ' | ').slice(0, 320));
  delete ORDEM_DOS_COMBOS['feminino 1'];

  (globalThis as any).__avulsosCombos = false; limparCombos(); reset({ ocupados: 0 });
}

// ---- ORDEM NOVA: serviço + dia -> resumo -> dados do paciente -> (existente: confirma o nome | novo: cadastro no fim) -> forma de pagamento -> agenda ----
{
  const dadosNovo = ['Joana Teste Souza', '91981990849', '12345678909', '10/05/1990']; // CPF que não existe no Clinilink simulado
  reset({ ocupados: 0 });
  let v: any = await responder([...base0.map((x) => [x]), dadosNovo], ctx, fonteClinilink);
  confere('NV1 paciente NOVO: manda os 4 dados de uma vez; ela não pede o pagamento antes de terminar o cadastro: confirma que vai cadastrar e pergunta como prefere pagar', /Como você prefere pagar/.test(v.reply) && v.state.paciente === null && v.state.cad?.nome === 'Joana Teste Souza' && v.state.cad?.sexo === 'feminino' && nPost('/pacientes') === 0 && nPost('/agendamentos') === 0, `${v.reply.replace(/\n/g, ' | ').slice(0, 200)} | pacientes=${nPost('/pacientes')}`);
  reset({ ocupados: 0 });
  v = await responder([...base0.map((x) => [x]), dadosNovo, ['na recepção']], ctx, fonteClinilink);
  const cadNv = posts.find((x) => x.rota.endsWith('/pacientes'))?.corpo;
  confere('NV2 escolheu o pagamento: AÍ cadastra o paciente e agenda (cadastro só no fim, junto do agendamento)', v.reply.startsWith(MARCA_AGENDADO) && /Cadastro de Joana Teste Souza feito\./.test(v.reply) && cadNv?.nome === 'Joana Teste Souza' && nPost('/pacientes') === 1 && nPost('/agendamentos') === 1, `${v.reply.slice(0, 80)} | ${JSON.stringify({ ...cadNv, cpf: '***' })}`);
  reset({ ocupados: 0 });
  v = await responder([...base0.map((x) => [x]), dadosNovo, ['pix'], [img('img-ok')]], ctxPix, fonteClinilink);
  confere('NV3 paciente novo pagando por pix: manda a chave, confere o comprovante, cadastra e agenda; a confirmação diz "PAGO NO PIX"', v.reply.startsWith(MARCA_AGENDADO) && /PAGO NO PIX/.test(v.reply) && nPost('/pacientes') === 1 && nPost('/agendamentos') === 1, v.reply.replace(/\n/g, ' | ').slice(0, 120));
  // paciente que já existe: só confirma o nome e já pergunta o pagamento
  reset({ ocupados: 0 });
  v = await responder([...base0.map((x) => [x]), ['Maria Exemplo', '91981990849', '52998224725']], ctx, fonteClinilink);
  confere('NV4 paciente que JÁ existe: puxa do Clinilink e confirma só o nome', /Achei aqui o cadastro de Maria Exemplo\. É esse mesmo o paciente\?/.test(v.reply) && nPost('/pacientes') === 0, v.reply.replace(/\n/g, ' | ').slice(0, 160));
  v = await responder([...base0.map((x) => [x]), ['Maria Exemplo', '91981990849', '52998224725'], ['sim']], ctx, fonteClinilink);
  confere('NV4 e com o "sim", segue para a pergunta do pagamento (nada de pedir os dados de novo)', /^Como você prefere pagar\?/.test(v.reply) && !/dados do paciente/.test(v.reply), v.reply.replace(/\n/g, ' | ').slice(0, 160));
  // o dia/horário pode mudar até o pagamento ser resolvido, e os dados do paciente ficam
  v = await responder([...base0.map((x) => [x]), ['52998224725'], ['sim'], ['na verdade prefiro outro dia']], ctx, fonteClinilink);
  confere('NV5 trocou o dia depois dos dados: ela ajusta o horário e mantém os dados do paciente', /vamos ajustar|a gente ajusta/.test(v.reply) && !v.state.slot && v.state.cpf === '52998224725' && v.state.pacienteConfirmado === true, v.reply.replace(/\n/g, ' | ').slice(0, 140));
}

server.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTODOS OS CENÁRIOS PASSARAM');
process.exit(falhas ? 1 : 0);
