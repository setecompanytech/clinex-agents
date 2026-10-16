/**
 * Teste da reserva de ponta a ponta contra um Clinilink SIMULADO (segue o contrato do INOVSTAR_API.md).
 * Não toca em nenhum sistema real. Rodar: npx tsx scripts/teste-reserva.ts
 */
import http from 'node:http';

type Posts = { rota: string; corpo: any }[];
const posts: Posts = [];
let modo: { ocupados: number; agendamento?: 'ok' | 'duplicado' | '500' | 'ocupado-sempre'; cpfDuplicado?: boolean; somenteLeitura?: boolean } = { ocupados: 0 };

const U_GUAMA = '11111111-1111-4111-8111-111111111111';
const PROC = '22222222-2222-4222-8222-222222222222';
const MEDICO = '33333333-3333-4333-8333-333333333333';
const AGENDA = '44444444-4444-4444-8444-444444444444';
const dia = (n: number) => { const d = new Date(Date.now() + n * 86400000); return d.toISOString().slice(0, 10); };
const horarios = () => ['08:00', '08:30', '09:00'].map((hora) => ({
  data: dia(1), hora, dataHora: `${dia(1)}T${hora}:00-03:00`, agendaId: AGENDA, agendaNome: 'Manhã Guamá', agendaHoraInicio: '08:00', duracaoMinutos: 30,
  profissional: { id: MEDICO, nome: 'MEDICA TESTE DA SILVA' }, unidade: { id: U_GUAMA, nome: 'CLINEX GUAMÁ' },
}));

const server = http.createServer((req, res) => {
  const url = new URL(req.url!, 'http://x');
  let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => {
    const j = (code: number, body: unknown) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    const corpo = raw ? JSON.parse(raw) : undefined;
    const p = url.pathname;
    if (req.method === 'GET') {
      if (p.endsWith('/clinicas')) return j(200, { ok: true, clinicas: [{ id: U_GUAMA, nome: 'CLINEX GUAMÁ' }] });
      if (p.endsWith('/procedimentos')) return j(200, { ok: true, procedimentos: [{ id: PROC, nome: 'CONSULTA GINECOLOGIA', categoria: 'Consulta', preco: 100, precoDinheiro: 100 }] });
      if (p.endsWith('/agenda')) return j(200, { ok: true, horarios: horarios().slice(modo.ocupados) });
      if (p.endsWith('/pacientes')) return j(200, { ok: true, pacientes: url.searchParams.get('cpf') === '11122233344' ? [{ id: '55555555-5555-4555-8555-555555555555', nome: 'MARIA EXEMPLO' }] : [] });
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
async function conversa(textos: string[], c = ctx) {
  let r;
  for (let i = 1; i <= textos.length; i++) r = await responder(textos.slice(0, i), c, fonteClinilink);
  return r!;
}
const reset = (m: typeof modo) => { posts.length = 0; modo = m; (globalThis as any).__ocupaPrimeiro = false; };
const base = ['oi', 'quero agendar ginecologista', 'sim', 'guama amanhã'];

// 1) paciente NOVO, jornada completa, com reprocessamento a cada mensagem
reset({ ocupados: 0 });
let r = await conversa([...base, '99988877766', 'Joana Teste Souza', '10/05/1990', 'feminino', 'sim']);
confere('1 paciente novo: confirma o agendamento', r.reply.startsWith(MARCA_AGENDADO) && !r.handoff, r.reply.replace(/\n/g, ' | '));
confere('1 cadastrou UMA vez', nPost('/pacientes') === 1, `POST pacientes = ${nPost('/pacientes')}`);
confere('1 agendou UMA vez (sem duplicar no reprocessamento)', nPost('/agendamentos') === 1, `POST agendamentos = ${nPost('/agendamentos')}`);
const ag = posts.find((x) => x.rota.endsWith('/agendamentos'))!.corpo;
confere('1 pegou o PRIMEIRO horário livre real (08:00)', ag.dataHora.includes('T08:00'), ag.dataHora);
confere('1 mandou ids reais e o procedimento', ag.agendaId === AGENDA && ag.profissionalId === MEDICO && ag.unidadeId === U_GUAMA && ag.procedimentos[0] === PROC && ag.pacienteId === '77777777-7777-4777-8777-777777777777');
const cad = posts.find((x) => x.rota.endsWith('/pacientes'))!.corpo;
confere('1 cadastro com nascimento ISO, sexo e CPF', cad.dataNascimento === '1990-05-10' && cad.sexo === 'feminino' && cad.cpf === '99988877766' && cad.nome === 'Joana Teste Souza', JSON.stringify({ ...cad, cpf: '***', nome: '***' }));

// 2) paciente que JÁ EXISTE: não cadastra
reset({ ocupados: 0 });
r = await conversa([...base, '11122233344', 'sim']);
confere('2 paciente existente: agendou sem cadastrar', r.reply.startsWith(MARCA_AGENDADO) && nPost('/pacientes') === 0 && nPost('/agendamentos') === 1, `pacientes=${nPost('/pacientes')} agendamentos=${nPost('/agendamentos')}`);

// 3) NÃO grava antes do fim: parado no CPF e na confirmação do paciente
reset({ ocupados: 0 });
await conversa([...base, '11122233344']);
confere('3 antes de confirmar o paciente: nenhuma gravação', posts.length === 0, `POSTs = ${posts.length}`);

// 4) primeiro horário ocupado: tenta o próximo
reset({ ocupados: 0 }); (globalThis as any).__ocupaPrimeiro = true;
r = await conversa([...base, '11122233344', 'sim']);
confere('4 horário ocupado: tentou o seguinte e confirmou', r.reply.startsWith(MARCA_AGENDADO) && nPost('/agendamentos') === 2, `tentativas=${nPost('/agendamentos')}`);

// 5) todos ocupados: passa para a equipe, sem inventar confirmação
reset({ ocupados: 0, agendamento: 'ocupado-sempre' });
r = await conversa([...base, '11122233344', 'sim']);
confere('5 vaga perdida: transfere e NÃO diz que agendou', Boolean(r.handoff) && !r.reply.includes(MARCA_AGENDADO) && /preenchida/.test(r.reply), r.reply);
confere('5 no máximo 3 tentativas', nPost('/agendamentos') <= 3, `tentativas=${nPost('/agendamentos')}`);

// 6) a agenda esvaziou entre a escolha e a reserva
reset({ ocupados: 0 });
{
  const antes = fonteClinilink.reservar!;
  modo.ocupados = 3; // agenda "fresca" sem horários
  r = await conversa([...base.slice(0, 3), 'amanhã no guama'].length ? [...base, '11122233344', 'sim'] : []);
  void antes;
  confere('6 sem horário livre no momento de reservar: transfere', Boolean(r.handoff) || /não há vaga|não encontrei/.test(r.reply), r.reply.replace(/\n/g, ' | '));
}

// 7) erro 500 na reserva: resultado incerto, NÃO repete o POST
reset({ ocupados: 0, agendamento: '500' });
r = await conversa([...base, '11122233344', 'sim']);
confere('7 erro 500: transfere com aviso de conferir', Boolean(r.handoff) && /CONFERIR/.test(r.handoff!.motivo) && !r.reply.includes(MARCA_AGENDADO), r.handoff?.motivo.slice(0, 90));
confere('7 não repetiu o POST', nPost('/agendamentos') === 1, `tentativas=${nPost('/agendamentos')}`);

// 8) mesmo serviço no mesmo dia
reset({ ocupados: 0, agendamento: 'duplicado' });
r = await conversa([...base, '11122233344', 'sim']);
confere('8 serviço duplicado no dia: transfere', Boolean(r.handoff) && /já tem esse atendimento/.test(r.reply), r.reply);

// 9) CPF já existe no cadastro na hora de cadastrar (corrida): usa o existente
reset({ ocupados: 0, cpfDuplicado: true });
r = await conversa([...base, '99988877766', 'Joana Teste Souza', '10/05/1990', 'feminino', 'sim']);
confere('9 CPF_DUPLICADO: usa o paciente existente', r.reply.startsWith(MARCA_AGENDADO) && posts.find((x) => x.rota.endsWith('/agendamentos'))!.corpo.pacienteId === '66666666-6666-4666-8666-666666666666');

// 10) credencial somente leitura: o Clinilink recusa, a Amanda NÃO diz que agendou e passa para a equipe
reset({ ocupados: 0, somenteLeitura: true });
r = await conversa([...base, '11122233344', 'sim']);
confere('10 chave somente leitura: transfere e NÃO confirma', Boolean(r.handoff) && !r.reply.includes(MARCA_AGENDADO) && /SOMENTE_LEITURA/.test(r.handoff!.motivo), r.handoff?.motivo.slice(0, 80));
confere('10 só uma tentativa de gravar', posts.length === 1, `POSTs=${posts.length}`);

// 11) depois de agendar, uma mensagem nova abre jornada nova (não regrava)
reset({ ocupados: 0 });
r = await conversa([...base, '11122233344', 'sim', 'obrigada']);
confere('11 mensagem depois do fim não regrava', nPost('/agendamentos') === 1, `agendamentos=${nPost('/agendamentos')} | ${r.reply.replace(/\n/g, ' | ').slice(0, 80)}`);

server.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTODOS OS CENÁRIOS PASSARAM');
process.exit(falhas ? 1 : 0);
