/**
 * Teste da reserva de ponta a ponta contra um Clinilink SIMULADO (segue o contrato do INOVSTAR_API.md).
 * Não toca em nenhum sistema real. Rodar: npx tsx scripts/teste-reserva.ts
 */
import http from 'node:http';

type Posts = { rota: string; corpo: any }[];
const posts: Posts = [];
let modo: { ocupados: number; agendamento?: 'ok' | 'duplicado' | '500' | 'ocupado-sempre'; cpfDuplicado?: boolean; somenteLeitura?: boolean } = { ocupados: 0 };

const U_GUAMA = '11111111-1111-4111-8111-111111111111';
const U_TELEGRAFO = '99999999-9999-4999-8999-999999999999';
const PROC = '22222222-2222-4222-8222-222222222222';
const PROC2 = '23232323-2323-4232-8232-232323232323';
const MEDICO = '33333333-3333-4333-8333-333333333333';
const P_REB = '51515151-5151-4515-8515-515151515151'; // REBECCA SILVA MOURA (Ginecologia, só no Guamá)
const P_REBECA = '52525252-5252-4525-8525-525252525252'; // REBECA COSTA LIMA (Cardiologia, sem agenda aberta)
const PROC3 = '24242424-2424-4242-8242-242424242424';
const PROC_USG = '25252525-2525-4252-8252-252525252525';
const AGENDA = '44444444-4444-4444-8444-444444444444';
const dia = (n: number) => { const d = new Date(Date.now() + n * 86400000); return d.toISOString().slice(0, 10); };
const mk = (data: string, hora: string, inicio: string, prof = { id: MEDICO, nome: "MEDICA TESTE DA SILVA" }) => ({
  data, hora, dataHora: `${data}T${hora}:00-03:00`, agendaId: AGENDA, agendaNome: "Agenda Guamá", agendaHoraInicio: inicio, duracaoMinutos: 30,
  profissional: prof, unidade: { id: U_GUAMA, nome: "CLINEX GUAMÁ" },
});
/** amanhã de manhã (3 horários, os primeiros podem estar "ocupados") e depois de amanhã à tarde (2 horários) */
const horarios = (ini: string, fim: string, profId?: string, unidadeId?: string) => {
  if (profId === P_REBECA) return []; // sem agenda aberta
  if (profId === P_REB) return unidadeId === U_TELEGRAFO ? [] : [...["10:00", "10:30"].map((h) => mk(dia(3), h, "10:00", { id: P_REB, nome: "REBECCA SILVA MOURA" }))].filter((h) => h.data >= ini && h.data <= fim);
  return [
    ...["08:00", "08:30", "09:00"].slice(modo.ocupados).map((h) => mk(dia(1), h, "08:00")),
    ...["13:30", "14:00"].map((h) => mk(dia(2), h, "13:00")),
  ].filter((h) => h.data >= ini && h.data <= fim);
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url!, 'http://x');
  let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => {
    const j = (code: number, body: unknown) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    const corpo = raw ? JSON.parse(raw) : undefined;
    const p = url.pathname;
    if (req.method === 'GET') {
      if (p.endsWith('/clinicas')) return j(200, { ok: true, clinicas: [{ id: U_GUAMA, nome: 'CLINEX GUAMÁ' }, { id: U_TELEGRAFO, nome: 'CLINEX TELEGRAFO' }] });
      if (p.endsWith('/procedimentos')) {
        const b = url.searchParams.get('busca') ?? '';
        const consulta = (id: string, nome: string) => ({ id, nome, categoria: 'Consulta', preco: 100, precoDinheiro: 100 });
        const lista = /zzz|qqq|rebec|zuleide|xavier|silva|pix/i.test(b) || /^ultrassom$/i.test(b) ? []
          : /usg|ultrassonografia/i.test(b) ? [{ id: PROC_USG, nome: 'USG ABDOME TOTAL', categoria: 'Exames', preco: 150, precoDinheiro: 150 }]
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
      if (p.endsWith('/agenda')) return j(200, { ok: true, horarios: horarios(url.searchParams.get('dataInicial') ?? '0000', url.searchParams.get('dataFinal') ?? '9999', url.searchParams.get('profissionalId') ?? undefined, url.searchParams.get('unidadeId') ?? undefined) });
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

const { responder, MARCA_AGENDADO } = await import('../src/agents/receptivo/script/engine.js');
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
  confere('6 sem horário livre no momento de reservar: transfere', Boolean(r.handoff) || /não há vaga|não encontrei/.test(r.reply), r.reply.replace(/\n/g, ' | '));
}

// 7) erro 500 na reserva: resultado incerto, NÃO repete o POST
reset({ ocupados: 0, agendamento: '500' });
r = await conversa([...base, '52998224725', 'sim']);
confere('7 erro 500: transfere com aviso de conferir', Boolean(r.handoff) && /CONFERIR/.test(r.handoff!.motivo) && !r.reply.includes(MARCA_AGENDADO), r.handoff?.motivo.slice(0, 90));
confere('7 não repetiu o POST', nPost('/agendamentos') === 1, `tentativas=${nPost('/agendamentos')}`);

// 8) mesmo serviço no mesmo dia
reset({ ocupados: 0, agendamento: 'duplicado' });
r = await conversa([...base, '52998224725', 'sim']);
confere('8 serviço duplicado no dia: transfere', Boolean(r.handoff) && /já tem esse atendimento/.test(r.reply), r.reply);

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
confere('12 mensagens juntas: mostra o resumo e pergunta a unidade', /tem agenda nestas unidades/.test(r.reply) && /Guamá com/.test(r.reply) && /Telégrafo com/.test(r.reply) && /qual unidade|Para qual unidade/i.test(r.reply) && !/Para eu seguir/.test(r.reply), r.reply.replace(/\n/g, ' | '));
confere('12 guardou o "amanhã" que ele já tinha dito', r.state.data === dia(1), String(r.state.data));

// 13) "oi" + pedido juntos: a saudação não pode se perder
reset({ ocupados: 0 });
r = await responder([['oi', 'quero agendar ginecologista']], ctx, fonteClinilink) as any;
confere('13 "oi" + pedido juntos: ainda cumprimenta', /^(Bom dia|Boa tarde|Boa noite)(, \p{L}+)?! Sou a Amanda/u.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 90));

// 14) CPF + "sim" juntos: o "sim" não confirma um nome que ele nunca viu (e nada é gravado)
reset({ ocupados: 0 });
r = await responder([...base.map((x) => [x]), ['52998224725', 'sim']], ctx, fonteClinilink) as any;
confere('14 CPF + sim juntos: mostra o nome para confirmar e NÃO reserva', /Encontrei o cadastro/.test(r.reply) && posts.length === 0, `${r.reply.replace(/\n/g, ' | ')} | POSTs=${posts.length}`);

// 15) "sim" e "obrigada" juntos na confirmação do paciente: a reserva acontece (uma vez)
reset({ ocupados: 0 });
r = await responder([...base.map((x) => [x]), ['52998224725'], ['sim', 'obrigada']], ctx, fonteClinilink) as any;
confere('15 "sim" + "obrigada" juntos: reservou uma vez', nPost('/agendamentos') === 1, `agendamentos=${nPost('/agendamentos')}`);

// 16) falhas ANTES de uma transferência não contaminam a conversa nova (bug: "Olá" já era transferido)
reset({ ocupados: 0 });
r = await responder([['boa tarde, quero uma consulta'], ['ola, quero marcar uma consulta'], ['Olá'], ['quero agendar ginecologista']], ctx, fonteClinilink) as any;
confere('16 depois de uma transferência a jornada recomeça', !r.handoff && /agendar consulta Ginecologia|consulta Ginecologia/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 110));
r = await responder([['boa tarde, quero uma consulta'], ['ola, quero marcar uma consulta'], ['Olá']], ctx, fonteClinilink) as any;
confere('16 "Olá" depois da transferência só cumprimenta', !r.handoff && /Como posso te ajudar|Qual consulta/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 110));

// 17) jeito de falar dos áudios transcritos (frases longas, pontuação, números por extenso)
reset({ ocupados: 0 });
r = await responder([['Oi, bom dia! Eu queria marcar uma consulta com a ginecologista, por favor.'], ['Isso mesmo.'], ['Guamá.']], ctx, fonteClinilink) as any;
confere('17 áudio: pedido longo, confirmação e unidade falados', /Tenho estas opções|Para .* tenho/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 120));
r = await responder([['Oi, bom dia! Eu queria marcar uma consulta com a ginecologista, por favor.'], ['Isso mesmo.'], ['Guamá.'], ['Pode ser a segunda opção.']], ctx, fonteClinilink) as any;
confere('17 áudio: "a segunda opção" escolhe a 2ª da lista (não é segunda-feira)', /pagamento/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 120));
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
const img = (id: string) => `[[midia:image:${id}]]`;
const resp = async (turnos: (string | string[])[], c: any = ctxPix) => (await responder(turnos, c, fonteClinilink)) as any;

// P1) depois de escolher o horário, a pergunta é a forma de pagamento (e não o CPF)
reset({ ocupados: 0 });
r = await resp(base0.map((x) => [x]));
confere('P1 depois do horário vem a pergunta de pagamento (pix ou link de crédito)', /antecipar o pagamento por pix ou link de crédito\?/.test(r.reply) && !/CPF/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(-120));

// P2) "na recepção" não é pedido de atendente; segue para o CPF e registra na observação
reset({ ocupados: 0 });
r = await resp([...base0, 'vou pagar na recepção'].map((x) => [x]));
confere('P2 "na recepção" segue para o CPF (não transfere)', !r.handoff && /CPF/.test(r.reply) && /recepção/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 110));
r = await resp([...base0, 'na recepção', '52998224725', 'sim'].map((x) => [x]));
confere('P2 agendou e a observação diz "Pagamento na recepção"', r.reply.startsWith(MARCA_AGENDADO) && /Pagamento na recepção/.test(posts.find((x) => x.rota.endsWith('/agendamentos'))!.corpo.observacao), posts.find((x) => x.rota.endsWith('/agendamentos'))?.corpo.observacao);

// P3) pix: manda a chave e o valor, e ESPERA o comprovante (nada de CPF nem reserva)
reset({ ocupados: 0 });
r = await resp([...base0, 'pix'].map((x) => [x]));
confere('P3 pix: envia a chave com o valor e pede o comprovante', /Chave pix: clinicaclinex@gmail\.com/.test(r.reply) && /R\$ 100,00/.test(r.reply) && /comprovante/.test(r.reply), r.reply.replace(/\n/g, ' | '));
r = await resp([...base0, 'pix', 'já paguei'].map((x) => [x]));
confere('P3 "já paguei" sem imagem: pede o comprovante', /Me envia o comprovante/.test(r.reply) && !/CPF/.test(r.reply), r.reply);
r = await resp([...base0, 'pix', 'e aí, tudo bem?', 'qual o endereço?'].map((x) => [x]));
confere('P3 outras mensagens: continua esperando o comprovante, sem avançar', /aguardando o comprovante/.test(r.reply) && !/CPF/.test(r.reply) && posts.length === 0, r.reply);
r = await resp([...base0, 'pix', 'qual a chave mesmo?'].map((x) => [x]));
confere('P3 pediu a chave de novo: reenvia', /Chave pix: clinicaclinex@gmail\.com/.test(r.reply), r.reply.replace(/\n/g, ' | '));

// P4) pix + comprovante certo: confirma o pagamento, pede o CPF, e só então reserva
reset({ ocupados: 0 });
r = await resp([...base0, 'pix', img('img-ok')].map((x) => [x]));
confere('P4 comprovante certo: confirma o pagamento e pede o CPF', /Pagamento confirmado/.test(r.reply) && /CPF/.test(r.reply) && posts.length === 0, r.reply.replace(/\n/g, ' | '));
r = await resp([...base0, 'pix', img('img-ok'), '52998224725', 'sim'].map((x) => [x]));
confere('P4 agenda depois do pix e registra o comprovante na observação', r.reply.startsWith(MARCA_AGENDADO) && /Pix antecipado: R\$ 100,00/.test(posts.find((x) => x.rota.endsWith('/agendamentos'))!.corpo.observacao), posts.find((x) => x.rota.endsWith('/agendamentos'))?.corpo.observacao);
reset({ ocupados: 0 });
r = await resp([...base0, 'pix', img('img-maior')].map((x) => [x]));
confere('P4 valor maior que o da consulta é aceito', /Pagamento confirmado/.test(r.reply));

// P5) comprovantes que NÃO servem
for (const [id, esperado, nome] of [
  ['img-foto', /não parece ser um comprovante/, 'imagem que não é comprovante'],
  ['img-antigo', /Preciso do comprovante do pagamento de hoje/, 'comprovante antigo'],
  ['img-agendado', /não mostra o pagamento como concluído/, 'pix só agendado'],
  ['desconhecida', /não consegui ler essa imagem/, 'imagem ilegível'],
] as const) {
  reset({ ocupados: 0 });
  r = await resp([...base0, 'pix', img(id)].map((x) => [x]));
  confere(`P5 ${nome}: pede outro comprovante e não avança`, esperado.test(r.reply) && !r.handoff && !/CPF/.test(r.reply), r.reply.slice(0, 90));
}
r = await resp([...base0, 'pix', img('img-outro-recebedor')].map((x) => [x]));
confere('P5 recebedor diferente: transfere para a equipe', Boolean(r.handoff) && /recebedor/.test(r.handoff.motivo), r.handoff?.motivo.slice(0, 100));
r = await resp([...base0, 'pix', img('img-foto'), img('img-foto'), img('img-foto')].map((x) => [x]));
confere('P5 três imagens que não servem: transfere', Boolean(r.handoff), r.reply);
r = await resp([...base0, 'pix', img('img-ok')].map((x) => [x]), { ...ctx });
confere('P5 sem leitura automática: transfere para conferir a imagem', Boolean(r.handoff) && /conferir a imagem/.test(r.handoff.motivo), r.handoff?.motivo.slice(0, 100));

// P6) desistiu do pix e quer só agendar: segue sem comprovante
reset({ ocupados: 0 });
r = await resp([...base0, 'pix', 'não vou pagar no pix, só quero agendar'].map((x) => [x]));
confere('P6 desistiu do pix: segue para o CPF', !r.handoff && /CPF/.test(r.reply) && /recepção/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 110));
r = await resp([...base0, 'pix', 'não vou pagar no pix, só quero agendar', '52998224725', 'sim'].map((x) => [x]));
confere('P6 desistiu do pix: agenda sem comprovante', r.reply.startsWith(MARCA_AGENDADO), r.reply.slice(0, 50));

// P7) link de crédito vai para a equipe; "não" a antecipar vai para a recepção; resposta solta pergunta de novo
reset({ ocupados: 0 });
r = await resp([...base0, 'link de crédito'].map((x) => [x]));
confere('P7 link de crédito: passa para a equipe com a vaga anotada', Boolean(r.handoff) && /link de crédito/.test(r.handoff.motivo) && /AINDA NÃO feito/.test(r.handoff.motivo), r.handoff?.motivo.slice(0, 80));
r = await resp([...base0, 'não'].map((x) => [x]));
confere('P7 "não" a antecipar: paga na recepção e segue', !r.handoff && /CPF/.test(r.reply), r.reply.slice(0, 80));
r = await resp([...base0, 'hmm, deixa eu ver'].map((x) => [x]));
confere('P7 resposta solta: pergunta de novo a forma de pagamento', /pix, por link de crédito ou na recepção/.test(r.reply), r.reply);
r = await resp([...base0.slice(0, 3), 'guama amanhã, vou pagar no pix'].map((x) => [x]));
confere('P7 já adiantou "no pix": não repete a pergunta, manda a chave', /Chave pix:/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 90));

// P8) imagem fora da hora do comprovante: explica que só lê texto e áudio
reset({ ocupados: 0 });
r = await resp([...base0.slice(0, 2), img('img-foto')].map((x) => [x]));
confere('P8 imagem fora do pagamento: pede para escrever', /só consigo ler texto e áudio/.test(r.reply), r.reply);

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
confere('Q3 "sim": pergunta o que quer agendar', /qual consulta ou exame você gostaria de agendar\?/i.test(q.reply), q.reply);
q = await pos('perguntou_mais', [['sim'], ['quero agendar ginecologista']]);
confere('Q3 depois do "sim", o pedido segue o fluxo normal', /agendar consulta Ginecologia/.test(q.reply) && !/^(Bom dia|Boa tarde|Boa noite)/.test(q.reply), q.reply);
q = await pos('confirmado', [['quero marcar outra consulta de ginecologia']]);
confere('Q3 "quero marcar outra consulta" já começa o novo agendamento', /agendar consulta Ginecologia/.test(q.reply), q.reply);
q = await pos('confirmado', [['obrigado', 'era só isso']]);
confere('Q4 "obrigado" + "era só isso" juntos: só a despedida', /Tenha um ótimo dia/.test(q.reply), q.reply);
q = await pos('encerrou', [['obrigado']]);
confere('Q5 agradecimento depois da despedida: sem resposta', q.silencio === true && q.reply === '', JSON.stringify({ silencio: q.silencio, reply: q.reply }));
q = await pos('encerrou', [['tchau']]);
confere('Q5 "tchau" depois da despedida: sem resposta', q.silencio === true, JSON.stringify({ silencio: q.silencio }));
q = await pos('encerrou', [['quero marcar uma consulta de ginecologia']]);
confere('Q5 pedido novo depois da despedida: atende normalmente', /agendar consulta Ginecologia/.test(q.reply), q.reply);
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
r = await resp([...base0, 'pix', img('img-meio')].map((x) => [x]));
confere('R1 valor menor: reconhece o que pagou, diz quanto falta e oferece escolher', !r.handoff && /Recebi o seu comprovante de R\$ 50,00/.test(r.reply) && /faltam R\$ 50,00/.test(r.reply) && /restante agora por pix ou deixar para pagar na recepção/.test(r.reply) && posts.length === 0, r.reply);
r = await resp([...base0, 'pix', img('img-meio'), 'deixa o resto para pagar na recepção'].map((x) => [x]));
confere('R1 resto na recepção: segue para o CPF', !r.handoff && /o restante, R\$ 50,00, fica para a recepção/.test(r.reply) && /CPF/.test(r.reply), r.reply);
r = await resp([...base0, 'pix', img('img-meio'), 'deixa o resto para pagar na recepção', '52998224725', 'sim'].map((x) => [x]));
const obsParcial = posts.find((x) => x.rota.endsWith('/agendamentos'))?.corpo.observacao ?? '';
confere('R1 agenda e a observação avisa: pix parcial + saldo na recepção', r.reply.startsWith(MARCA_AGENDADO) && /PARCIAL de R\$ 50,00/.test(obsParcial) && /Saldo de R\$ 50,00 a pagar na recepção/.test(obsParcial), obsParcial);

// R2) paga o resto por pix: os comprovantes somam
reset({ ocupados: 0 });
r = await resp([...base0, 'pix', img('img-meio'), 'vou pagar o resto agora no pix'].map((x) => [x]));
confere('R2 resto por pix: manda a chave com o valor que falta', /Chave pix:/.test(r.reply) && /Valor que falta: R\$ 50,00/.test(r.reply), r.reply.replace(/\n/g, ' | '));
r = await resp([...base0, 'pix', img('img-meio'), 'pix', img('img-resto')].map((x) => [x]));
confere('R2 segundo comprovante completa o valor: confirma o pagamento', /Pagamento confirmado/.test(r.reply) && /CPF/.test(r.reply), r.reply);
r = await resp([...base0, 'pix', img('img-meio'), 'pix', img('img-resto'), '52998224725', 'sim'].map((x) => [x]));
confere('R2 observação registra o total e que foram dois comprovantes', /Pix antecipado: R\$ 100,00 .*mais de um comprovante/.test(posts.find((x) => x.rota.endsWith('/agendamentos'))?.corpo.observacao ?? ''), posts.find((x) => x.rota.endsWith('/agendamentos'))?.corpo.observacao);

// R3) o mesmo comprovante não conta duas vezes
reset({ ocupados: 0 });
r = await resp([...base0, 'pix', img('img-meio'), img('img-meio-de-novo')].map((x) => [x]));
confere('R3 comprovante repetido: avisa que já recebeu e não soma de novo', /já recebi/.test(r.reply) && !/Pagamento confirmado/.test(r.reply), r.reply);

// R4) indecisão: depois de 3 respostas soltas passa para a equipe; pedir atendente também
r = await resp([...base0, 'pix', img('img-meio'), 'hmm', 'não sei', 'talvez'].map((x) => [x]));
confere('R4 sem decidir o restante: passa para a equipe com o valor anotado', Boolean(r.handoff) && /não definiu como pagar o restante/.test(r.handoff.motivo), r.handoff?.motivo.slice(0, 90));
r = await resp([...base0, 'pix', img('img-meio'), 'quero falar com um atendente'].map((x) => [x]));
confere('R4 pediu atendente: transfere', Boolean(r.handoff));

// ===================== retomar depois de uma transferência =====================
// T1) transferência "branda" (comprovante com problema, vaga, falha): o paciente volta e a conversa CONTINUA de onde parou
reset({ ocupados: 0 });
r = await resp([...base0, 'pix', img('img-foto'), img('img-foto'), img('img-foto'), 'ja paguei'].map((x) => [x]));
confere('T1 volta depois de transferência branda: continua esperando o comprovante', !r.handoff && /Me envia o comprovante/.test(r.reply) && r.aposHandoffDuro === false, r.reply);
r = await resp([...base0, 'pix', img('img-foto'), img('img-foto'), img('img-foto'), img('img-ok')].map((x) => [x]));
confere('T1 e o comprovante certo depois da transferência é aceito', /Pagamento confirmado/.test(r.reply), r.reply);
r = await resp([...base0, 'link de crédito', 'melhor, vou pagar no pix'].map((x) => [x]));
confere('T1 mudou de ideia depois do link de crédito: manda a chave pix', /Chave pix:/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 100));
r = await resp([['boa tarde, quero uma consulta'], ['ola, quero marcar uma consulta'], ['Olá']]);
confere('T1 falhas antigas não contaminam: "Olá" só cumprimenta', !r.handoff && /Como posso te ajudar|Qual consulta/.test(r.reply), r.reply);
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
confere('F1 sem serviço: responde o horário e pergunta o que ele precisa (sem contar como "não entendi")', /segunda a sexta, das 7h às 17h/.test(r.reply) && /Posso te ajudar com um agendamento/.test(r.reply) && !r.handoff && r.state.falhas === 0, r.reply.replace(/\n/g, ' | ').slice(0, 170));
r = await resp([['quanto custa a consulta de ginecologia?']]);
confere('F2 valor + serviço na mesma frase: informa o valor e confirma o serviço', /A consulta custa R\$ 100,00/.test(r.reply) && /Você quer agendar consulta Ginecologia/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 170));
r = await resp([...ate3.map(um), um('qual o endereço de vocês?')]);
confere('F3 endereço no meio do fluxo: não inventa, oferece a equipe e RETOMA a pergunta da unidade', /equipe te passe certinho/.test(r.reply) && /qual unidade você prefere/.test(r.reply) && !r.handoff, r.reply.replace(/\n/g, ' | ').slice(0, 220));
r = await resp([...base0.map(um), um('qual o valor?')]);
confere('F4 valor na pergunta de pagamento: informa e volta a perguntar a forma de pagamento', /A consulta custa R\$ 100,00/.test(r.reply) && /Prefere pagar por pix, por link de crédito ou na recepção/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 200));
r = await resp([...base0, 'pix', 'qual o valor?'].map(um));
confere('F5 valor esperando o comprovante: reenvia a chave com o valor (sem duplicar resposta)', /^Aqui está!/.test(r.reply) && /Chave pix:/.test(r.reply), r.reply.replace(/\n/g, ' | '));
r = await resp([...ate3.map(um), um('??')]);
confere('F6 "??" no meio do fluxo: "Estou aqui" e repete a pergunta pendente', /^Estou aqui, sim!/.test(r.reply) && /qual unidade você prefere/.test(r.reply), r.reply.replace(/\n/g, ' | '));
r = await resp([...base.map(um), um('qual o endereço?')]);
confere('F7 dúvida no pedido do CPF: responde e volta a pedir o CPF', /equipe/.test(r.reply) && /CPF do paciente/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 200));
r = await resp([...base.map(um), um('12345678909'), um('qual o endereço de vocês')]);
confere('F8 dúvida (sem "?") na hora do nome: NÃO vira o nome do paciente', r.state.cad?.nome === undefined && /nome completo/.test(r.reply) && /equipe/.test(r.reply), `${r.state.cad?.nome} | ${r.reply.replace(/\n/g, ' | ').slice(0, 150)}`);
r = await resp([...ate3.map(um), um('qual o endereço?'), um('pode chamar alguém da equipe')]);
confere('F9 depois da dúvida que ela não sabe, "pode chamar alguém da equipe" transfere', Boolean(r.handoff), r.reply);
r = await resp([...ate3.map(um), um('quais médicos atendem?')]);
confere('F10 "quais médicos atendem?": mostra os médicos de cada unidade e volta à pergunta', /Medica Teste da Silva/.test(r.reply) && /qual unidade você prefere/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 220));
r = await resp([...base0.map(um), um('aceita cartão de crédito?')]);
confere('F11 "aceita cartão?": explica as formas de pagamento e volta a perguntar (não conta como escolha nem transfere)', !r.handoff && /pix \(eu te envio a chave\) ou link de crédito, ou pagar na recepção/.test(r.reply) && /Prefere pagar por pix/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 220));
r = await resp([['funciona sábado?'], ['quero agendar ginecologista']]);
confere('F12 dúvida e depois o pedido: o fluxo segue normalmente', /Você quer agendar consulta Ginecologia/.test(r.reply) && !r.handoff, r.reply.slice(0, 100));

// ===================== mudou de ideia =====================
r = await resp([...base0.map(um), um('prefiro o Telégrafo')]);
confere('C1 trocou de unidade depois de escolher o horário: ajusta e mostra novas opções', /Sem problema, vamos ajustar/.test(r.reply) && r.state.unidade?.nome === 'Telégrafo' && !r.state.slot && !r.handoff, r.reply.replace(/\n/g, ' | ').slice(0, 160));
r = await resp([...base0.map(um), um('prefiro o Telégrafo'), um('1')]);
confere('C1 e ao escolher o novo horário, pergunta o pagamento de novo (já com o novo horário)', /Telégrafo/.test(r.reply) && /antecipar o pagamento por pix ou link de crédito\?/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(-170));
r = await resp([...base0.map(um), um('queria outro dia')]);
confere('C2 "queria outro dia": volta a oferecer datas', /Sem problema, vamos ajustar/.test(r.reply) && /Tenho estas opções|tenho/.test(r.reply) && !r.state.slot, r.reply.replace(/\n/g, ' | ').slice(0, 140));
r = await resp([...base0, 'pix', 'outro dia eu pago'].map(um));
confere('C3 esperando o pix, "outro dia eu pago" NÃO troca o horário', !/vamos ajustar/.test(r.reply) && Boolean(r.state.slot), r.reply.slice(0, 110));
r = await resp([...base0.map(um), um('na verdade quero dermatologia')]);
confere('C4 trocou de serviço depois de escolher o horário: recomeça pelo novo serviço', /consulta Dermatologia/i.test(r.reply) && !r.state.slot && !r.handoff, r.reply.slice(0, 120));
r = await resp([...base.map(um), um('52998224725'), um('prefiro outro dia')]);
confere('C5 depois do CPF, "prefiro outro dia" não bagunça o fluxo', !/vamos ajustar/.test(r.reply) && Boolean(r.state.slot), r.reply.slice(0, 110));

// ===================== CPF =====================
const { cpfValido } = await import('../src/agents/receptivo/script/engine.js');
confere('V0 cpfValido: aceita os válidos e recusa os errados', cpfValido('03185344286') && cpfValido('529.982.247-25') && !cpfValido('11122233344') && !cpfValido('11111111111') && !cpfValido('123'), '');
r = await resp([...base.map(um), um('11122233344')]);
confere('V1 CPF com dígito errado: pede para conferir e não consulta o paciente', /não parece estar correto/.test(r.reply) && !r.state.cpf, r.reply);
r = await resp([...base.map(um), um('111.111.111-11')]);
confere('V2 CPF com todos os dígitos iguais: recusa', /não parece estar correto/.test(r.reply), r.reply.slice(0, 60));
r = await resp([...base.map(um), um('11122233344'), um('52998224725')]);
confere('V3 depois de corrigir, segue normalmente', /Encontrei o cadastro/.test(r.reply), r.reply);

// ===================== profissional pelo nome, sinônimos, sem transferir sozinha =====================
const dd = async (turnos: (string | string[])[]) => (await responder(turnos.map((x) => (Array.isArray(x) ? x : [x])), ctxPix, fonteClinilink)) as any;

// D1) "quero agendar com a dra Rebecca": acha a profissional pelo nome e o serviço dela, em vez de procurar "rebecca" como exame
reset({ ocupados: 0 });
r = await dd(['Quero agendar uma consulta com a dra Rebecca']);
confere('D1 acha a profissional pelo nome e confirma o atendimento dela', /consulta Ginecologia com Rebecca Silva Moura, é isso\?/.test(r.reply) && r.state.servico?.profissional?.id === P_REB && !r.handoff, r.reply.replace(/\n/g, ' | ').slice(0, 200));
r = await dd(['Quero agendar uma consulta com a dra Rebecca amanhã de manhã']);
confere('D1 nome seguido de dia/período: acha a pessoa e guarda o que ele adiantou', r.state.servico?.profissional?.id === P_REB && r.state.turno === 'manhã' && Boolean(r.state.data), JSON.stringify({ prof: r.state.servico?.profissional?.nome, turno: r.state.turno, data: r.state.data }));
r = await dd(['quero consulta com o dr xavier']);
confere('D1 doutor que não existe: diz que não achou e pede mais um dado (NÃO transfere)', /Não encontrei Xavier entre os nossos profissionais/.test(r.reply) && !r.handoff, r.reply);

// D2) o atendimento inteiro com a profissional escolhida: só a agenda dela, e a reserva vai com o id dela
posts.length = 0;
r = await dd(['Quero agendar uma consulta com a dra Rebecca', 'sim']);
confere('D2 depois do "sim": mostra só as unidades e os horários dela, sem repetir o nome', /tem agenda no Guamá\./.test(r.reply) && !/com Rebecca Silva Moura tem agenda no Guamá com/.test(r.reply) && /Tenho estas opções/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 260));
confere('D2 os horários oferecidos são os dela (Rebecca) e o preço aparece', /A consulta custa R\$ 100,00/.test(r.reply), '');
r = await dd(['Quero agendar uma consulta com a dra Rebecca', 'sim', '1', 'na recepção', '52998224725', 'sim']);
const agD = posts.find((x) => x.rota.endsWith('/agendamentos'))?.corpo;
confere('D2 reserva gravada com o id da profissional pedida', r.reply.startsWith(MARCA_AGENDADO) && agD?.profissionalId === P_REB && /Rebecca Silva Moura/.test(r.reply), `${agD?.profissionalId} | ${r.reply.slice(0, 120)}`);

// D3) nome parecido (rebeca ~ rebecca) e quem não tem horário: oferece a especialidade com outros profissionais
r = await dd(['quero uma consulta com a doutora rebeca']);
confere('D3 profissional sem horários: avisa e oferece a especialidade com outros profissionais (NÃO transfere)', /não tem horários abertos/.test(r.reply) && /Cardiologia/.test(r.reply) && /é isso\?/.test(r.reply) && !r.handoff && !r.state.servico?.profissional, r.reply.replace(/\n/g, ' | ').slice(0, 240));

// D4) vários parecidos: pergunta qual
r = await dd(['quero agendar com a dra silva']);
confere('D4 duas pessoas com o mesmo sobrenome: lista as opções com a especialidade', /Encontrei estas opções/.test(r.reply) && /Medica Teste da Silva \(Ginecologia\)/.test(r.reply) && /Rebecca Silva Moura \(Ginecologia\)/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 220));
r = await dd(['quero agendar com a dra silva', '2']);
confere('D4 escolhendo pelo número, segue com a pessoa escolhida', /consulta Ginecologia com Rebecca Silva Moura/.test(r.reply) && r.state.servico?.profissional?.id === P_REB, r.reply.slice(0, 120));

// D5) falar "com cardiologista" não é nome de pessoa
r = await dd(['quero uma consulta com cardiologista']);
confere('D5 "com cardiologista" segue o fluxo de especialidade', /Você quer agendar consulta Cardiologia/.test(r.reply) && !r.state.servico?.profissional, r.reply.slice(0, 100));

// D6) ultrassom -> USG -> ultrassonografia
r = await dd(['quero fazer um ultrassom']);
confere('D6 "ultrassom" acha o exame cadastrado como USG', /Usg Abdome Total/i.test(r.reply) && !/Não consegui/.test(r.reply), r.reply.replace(/\n/g, ' | ').slice(0, 140));
r = await dd(['preciso de uma ultrassonografia']);
confere('D6 "ultrassonografia" também', /Usg Abdome Total/i.test(r.reply), r.reply.slice(0, 100));

// D7) não transfere sozinha por não entender
r = await dd(['zzzzz']);
confere('D7 1ª vez sem entender: pede de novo e já sugere dizer o nome do médico', /Não consegui identificar o serviço/.test(r.reply) && /nome do médico ou da médica/.test(r.reply) && !r.handoff, r.reply);
r = await dd(['zzzzz', 'qqqqq', 'zzzzz qqqqq', 'qqqqq']);
confere('D7 mesmo depois de várias vezes: NÃO transfere, lembra que pode chamar a equipe', !r.handoff && /Ainda não consegui identificar/.test(r.reply) && /falar com a nossa equipe, é só me pedir/.test(r.reply), r.reply.slice(0, 160));
r = await dd(['zzzzz', 'qqqqq', 'quero falar com a equipe']);
confere('D7 e se ele pedir a equipe, transfere', Boolean(r.handoff), r.reply);
r = await dd(['zzzzz', 'qqqqq', 'quero agendar ginecologista']);
confere('D7 depois de não entender, consegue pedir de outro jeito e o fluxo segue', /Você quer agendar consulta Ginecologia/.test(r.reply), r.reply.slice(0, 100));

server.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTODOS OS CENÁRIOS PASSARAM');
process.exit(falhas ? 1 : 0);
