import type { Evento } from '../logs/vercel.js';

/**
 * Dados SIMULADOS para conhecer o BI antes de haver histórico real. Nada aqui vem de pacientes:
 * é gerado por uma sequência aleatória fixa (mesma semente, mesma história) e a tela avisa que é demonstração.
 */
const HORA = 3_600_000;
const DIA = 24 * HORA;

function semente(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SERVICOS = [
  ['ultrassom', 'ultrassonografia', 0.17], ['hemograma', 'exame de sangue', 0.13], ['cardiologista', 'consulta com cardiologista', 0.12],
  ['dermatologista', 'consulta com dermatologista', 0.1], ['raio x', 'raio x', 0.08], ['ecocardiograma', 'ecocardiograma', 0.07],
  ['ortopedista', 'consulta com ortopedista', 0.08], ['ginecologista', 'consulta com ginecologista', 0.09], ['ressonância', 'ressonância magnética', 0.04],
  ['eletrocardiograma', 'eletrocardiograma', 0.06], ['tomografia', 'tomografia', 0.03], ['fonoaudiólogo', 'fonoaudiologia', 0.03],
] as const;
const NAO_ENCONTRADOS = ['densitometria', 'fisioterapia pélvica', 'acupuntura', 'check-up executivo', 'holter 24h', 'mapa pressão'];
const UNIDADES = ['Unidade Nazaré', 'Unidade Batista Campos', 'Unidade Marco', 'Unidade Ananindeua'];
const ABERTURAS = ['Oi, bom dia! Queria marcar', 'Boa tarde, preciso de', 'Olá, gostaria de agendar', 'oi, tem horário pra', 'Boa noite! Vocês fazem', 'Queria saber o valor de'];
const MOTIVOS: [string, number][] = [
  ['O paciente pediu para falar com um atendente.', 0.42], ['Falha ao consultar o Clinilink: tempo esgotado', 0.14], ['O paciente quer remarcar uma consulta (ainda sem etapa própria).', 0.17],
  ['Comprovante de pix sem valor igual ao do procedimento. Conferir no extrato.', 0.12], ['Dúvida sobre convênio/plano de saúde.', 0.1],
  ['BLOQUEIO DE SEGURANÇA: a resposta continha preço "R$ 0,00". Conferir o preço do procedimento no Clinilink.', 0.05],
];

// peso de cada hora do dia (hora local) e de cada dia da semana (0 = domingo)
const PESO_HORA = [0.5, 0.3, 0.2, 0.2, 0.3, 0.8, 1.6, 3.2, 5.4, 6.8, 6.6, 5.6, 4.6, 5.0, 6.0, 5.8, 4.8, 4.2, 3.6, 3.4, 3.0, 2.2, 1.4, 0.8];
const PESO_DIA = [0.45, 1.0, 1.05, 1.0, 0.98, 0.92, 0.6];

type Rng = () => number;
const escolha = <T>(r: Rng, pares: readonly (readonly [T, number])[] | [T, number][]): T => {
  const total = pares.reduce((s, p) => s + p[1], 0);
  let x = r() * total;
  for (const [v, p] of pares) { x -= p; if (x <= 0) return v; }
  return pares[pares.length - 1][0];
};
const lognormal = (r: Rng, mediana: number, dispersao: number) => Math.round(mediana * Math.exp((r() + r() + r() - 1.5) * dispersao));

function jornada(r: Rng, t0: number, id: string, tendencia: number): Evento[] {
  const out: Evento[] = [];
  let t = t0;
  const emit = (evt: string, d: Record<string, unknown>) => out.push({ app: 'amanda', t: new Date(t).toISOString(), evt, atendimento: id, ...d } as Evento);

  const [termo, nomeServ] = escolha(r, SERVICOS.map((s) => [[s[0], s[1]] as const, s[2]] as const));
  const naoAchou = r() < 0.045;
  const unidade = UNIDADES[Math.floor(r() * UNIDADES.length)];
  const pedido = naoAchou ? NAO_ENCONTRADOS[Math.floor(r() * NAO_ENCONTRADOS.length)] : termo;
  const disse = [ABERTURAS[Math.floor(r() * ABERTURAS.length)] + ' ' + pedido];

  // probabilidade de seguir em cada etapa (melhora de leve com o tempo: "tendencia" vai de 0 a 1)
  const sobe = 0.04 * tendencia;
  const cont = [0.95 + sobe / 2, 0.96, 0.92 + sobe, 0.88 + sobe, 0.9 + sobe / 2, 0.86 + sobe, 0.98];
  const etapas = ['recepção / entendendo o serviço', 'confirmando o serviço', 'escolhendo a unidade', 'escolhendo data e turno', 'pedindo os dados do paciente', 'confirmando o paciente', 'escolhendo a forma de pagamento'];
  const falas = [
    () => disse[0], () => 'isso mesmo', () => unidade.replace('Unidade ', ''), () => ['o mais rápido', 'quinta de manhã', 'a segunda opção', 'sexta à tarde'][Math.floor(r() * 4)],
    () => '123.456.789-00', () => 'sim, sou eu', () => (r() < 0.6 ? 'pix' : 'no balcão mesmo'),
  ];
  const respostas = [
    () => `Oi! Aqui é a Amanda, da Clinex. Você quer agendar ${nomeServ}, é isso?`, () => `Tenho sim! Qual unidade fica melhor pra você?`,
    () => `Consegui estes aqui na ${unidade}. Qual prefere?`, () => `Perfeito. Me passa o seu CPF pra eu achar o seu cadastro?`,
    () => `Achei aqui o cadastro. Esse é o seu nome?`, () => `Como prefere pagar: pix pra garantir o horário ou na recepção?`, () => `Agendamento confirmado! Te espero na ${unidade}.`,
  ];

  const gastos = (k: number) => lognormal(r, k === 3 ? 22_000 : k === 6 ? 160_000 : 35_000, 0.9);
  let transf: { motivo: string; urgente: boolean } | null = null;
  const urgenciaNoInicio = r() < 0.004;

  for (let i = 0; i < 7; i++) {
    t += i === 0 ? 0 : Math.max(8_000, gastos(i));
    const eUltimo = i === 6;
    // consultas ao Clinilink nas etapas que precisam de dado real
    if (i === 0 || i === 2 || i === 3 || i === 4 || eUltimo) {
      const lento = r() < 0.025;
      const caminho = i === 0 ? '/procedimentos' : i === 2 ? '/unidades' : i === 3 ? '/agenda/horarios' : i === 4 ? '/pacientes' : '/agendamentos';
      const falhou = r() < (lento ? 0.35 : 0.012) * (1 - 0.5 * tendencia + 0.5);
      emit('clinilink', { metodo: eUltimo ? 'POST' : 'GET', caminho, status: falhou ? 504 : 200, ms: lento ? lognormal(r, 6500, 0.5) : lognormal(r, eUltimo ? 900 : 520, 0.9), ok: !falhou, erro: falhou ? 'tempo esgotado' : undefined, tentativa: 1 });
      if (r() < 0.2) emit('clinilink', { cache: true, recurso: 'unidades' });
      if (falhou && r() < 0.6) { transf = { motivo: 'Falha ao consultar o Clinilink: tempo esgotado', urgente: false }; }
    }
    if (i === 0 && naoAchou) { emit('servico_nao_encontrado', { termo: pedido, tentativas: [] }); transf = transf ?? { motivo: 'O serviço pedido não foi encontrado no catálogo.', urgente: false }; }
    if (i === 0 && urgenciaNoInicio) transf = { motivo: 'URGÊNCIA: paciente relatou dor no peito.', urgente: true };
    if (i === 3 && r() < 0.08) emit('interpretar', { indice: r() < 0.8 ? 1 : null, ms: lognormal(r, 1400, 0.5) });
    if (i === 6 && r() < 0.5) { // pix: lê o comprovante
      const ruim = r() < 0.16;
      emit('comprovante', { tipo: 'pix', valor: 180, data: 'hoje', status: ruim ? 'ilegível' : 'concluído', ms: lognormal(r, 2600, 0.5) });
      if (ruim && r() < 0.5) transf = transf ?? { motivo: 'Comprovante de pix sem valor igual ao do procedimento. Conferir no extrato.', urgente: false };
    }
    if (!transf && r() < 0.016) transf = { motivo: escolha(r, MOTIVOS), urgente: false };
    if (!transf && i >= 1 && r() < 0.02) transf = { motivo: 'O paciente pediu para falar com um atendente.', urgente: false };

    const roteiro = respostas[i]();
    const gptQ = r();
    const gptStatus = eUltimo ? 'desligado' : gptQ < 0.82 ? 'usado' : gptQ < 0.9 ? 'desligado' : gptQ < 0.975 ? 'rejeitado' : 'falhou';
    if (gptStatus === 'usado') emit('gpt', { status: 'usado', ms: lognormal(r, 1150, 0.5), tokens: 220 + Math.floor(r() * 260) });
    else if (gptStatus === 'rejeitado') emit('gpt', { status: 'rejeitado', motivo: escolha(r, [['trocou um número do roteiro', 0.5], ['ficou longo demais', 0.3], ['mudou a unidade', 0.2]]), ms: lognormal(r, 1200, 0.4) });
    else if (gptStatus === 'falhou') emit('gpt', { status: 'falhou', motivo: 'timeout', ms: 8000 });
    const envioOk = r() > 0.004;
    emit('inovstar', { metodo: 'POST', caminho: '/messages', status: envioOk ? 200 : 502, ms: lognormal(r, 240, 0.6), ok: envioOk });

    emit('resposta', {
      fonte: 'clinilink', etapa: transf ? (transf.urgente ? 'segurança (emergência/crise)' : 'transferida para a equipe') : eUltimo ? 'concluída' : etapas[Math.min(i + 1, 6)],
      mensagens_na_jornada: i + 1, paciente_disse: falas[i](), roteiro, enviado: `*Amanda | Clinex*\n${roteiro}`, gpt: gptStatus,
      retomou_da_fila: false, transferiu: Boolean(transf), motivo_transferencia: transf?.motivo, enviou_de_verdade: true,
    });
    if (transf) return out;
    if (r() > cont[i]) return out; // o paciente parou de responder
  }
  return out;
}

/** Gera `dias` dias de história terminando em `ate`. */
export function gerarDemo(ate: number, dias = 70): Evento[] {
  const eventos: Evento[] = [];
  const inicio = ate - dias * DIA;
  let seq = 0;
  for (let d = 0; d < dias; d++) {
    const dia0 = Math.floor((inicio + d * DIA) / DIA) * DIA;
    const r = semente(7000 + d);
    const dow = new Date(dia0 - 3 * HORA).getUTCDay();
    const tendencia = d / dias;
    const alvo = Math.round((24 + 16 * tendencia) * PESO_DIA[dow] * (0.85 + r() * 0.3));
    for (let h = 0; h < 24; h++) {
      const n = Math.round((alvo * PESO_HORA[h]) / PESO_HORA.reduce((a, b) => a + b, 0) + (r() - 0.5));
      for (let i = 0; i < Math.max(0, n); i++) {
        const t0 = dia0 + (h + 3) * HORA + Math.floor(r() * HORA); // hora local -> UTC
        if (t0 > ate - 20_000) continue;
        const id = `demo${String(++seq).padStart(6, '0')}`;
        for (const e of jornada(r, t0, id, tendencia)) if (Date.parse(e.t) <= ate) eventos.push(e);
      }
    }
  }
  eventos.push({ app: 'amanda', t: new Date(ate - 5 * HORA).toISOString(), evt: 'erro', mensagem: 'transcrição falhou: áudio sem fala' } as Evento);
  for (let i = 0; i < 6; i++) eventos.push({ app: 'amanda', t: new Date(ate - (i + 2) * 7 * HORA).toISOString(), evt: 'ignorado', motivo: i % 3 ? 'mensagem de grupo' : 'atendimento já estava no setor de destino' } as Evento);
  return eventos.sort((a, b) => a.t.localeCompare(b.t));
}
