/**
 * Fonte ÚNICA do desenho do fluxo do agente receptivo (painel /painel) — Fluxo v2.
 * Descreve o ROTEIRO de conversa da Amanda (sem IA decidindo), com dados reais do Clinilink (somente leitura)
 * e a camada de GPT que só reescreve o tom. Tudo aqui é texto estático derivado do código:
 * script/engine.ts, script/catalog.ts, script/clinilinkFonte.ts, lib/humanizer.ts, agent.ts, webhooks.ts.
 * NUNCA coloque aqui segredos, tokens, IDs de atendimento/setor ou dados de pacientes.
 * Se o comportamento do agente mudar, atualize este arquivo para o painel continuar fiel.
 */

export type Kind = 'gatilho' | 'trava' | 'etapa' | 'clinilink' | 'gpt' | 'alerta' | 'acao' | 'info' | 'fim';
export type Tone = 'ok' | 'ignorado' | 'erro' | 'sombra';

export type FlowNode = {
  id: string;
  kind: Kind;
  /** número do passo (passos principais) ou código do ramo (A1, G1, R1); finais não têm */
  step?: number | string;
  /** faixa (fase) a que o nó pertence */
  band: string;
  title: string;
  /** frase curta exibida no cartão */
  subtitle: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  /** só para kind "fim": cor do final */
  tone?: Tone;
  /** mostra o aviso de que esse passo depende de outro sistema e pode dar erro técnico */
  canFail?: boolean;
  detail: {
    oQueFaz: string;
    regra: string;
    exemplo: string;
    seFalhar: string;
    tecnico?: string;
    /** abre o bloco "Detalhe técnico" já expandido */
    tecnicoAberto?: boolean;
  };
};

export type FlowEdge = {
  from: string;
  to: string;
  fromSide: 'l' | 'r' | 't' | 'b';
  toSide: 'l' | 'r' | 't' | 'b';
  label?: string;
  /** main = caminho normal; stop = encerra em silêncio; alert = ramo de alerta (transfere); gpt = camada GPT */
  style?: 'main' | 'stop' | 'alert' | 'gpt';
  /** poly = linha em ângulos retos passando pelos pontos de "via" */
  route?: 'poly';
  via?: [number, number][];
  /** posição do rótulo ao longo da seta (0 a 1), padrão 0.5 */
  labelAt?: number;
  /** posição exata do rótulo (tem prioridade sobre labelAt) */
  labelXY?: [number, number];
};

export type FlowBand = { id: string; title: string; subtitle: string; x: number; y: number; w: number; h: number; faixa?: 'alerta' | 'gpt' | 'regras' };

type Conversa = { de: 'paciente' | 'amanda' | 'nota'; texto: string; etapa?: string };

// ------------------------------------------------------------------ geometria
const NW = 250; // largura padrão do cartão
const NH = 108; // altura padrão do cartão
const PY = 148; // distância vertical entre cartões
const Y0 = 20; // y do primeiro cartão de uma faixa

const P1 = 0, P1W = 730;
const P2 = P1 + P1W + 30, P2W = 310;
const P3 = P2 + P2W + 30, P3W = 710;
const P4 = P3 + P3W + 30, P4W = 310;
const P5 = P4 + P4W + 30, P5W = 310;
const P6 = P5 + P5W + 30, P6W = 310;
const P7 = P6 + P6W + 30, P7W = 310;
const P8 = P7 + P7W + 30, P8W = 710;
const MAIN_BOTTOM = 620; // fundo das faixas principais (p2 a p8)

const nx = (bandX: number) => bandX + 30; // x do cartão da coluna esquerda
const rx = (bandX: number) => bandX + 30 + 400; // x do cartão da coluna direita (faixas largas)
const row = (i: number) => Y0 + i * PY;

// faixa de ramos de alerta (fica abaixo das fases 2 a 8)
const LANE_Y = 650, LANE_H = 298;
const AY = 800; // y dos cartões de alerta
const AW = 230; // largura dos cartões de alerta
const AX = [P2 + 30, P2 + 30 + 260, P2 + 30 + 520, P2 + 30 + 780, P2 + 30 + 1040, P6 + 30]; // A1..A6

// faixa do GPT (abaixo do alerta, à esquerda)
const GPT_Y = 990, GPT_H = 396;
const GY0 = GPT_Y + 90;
const GX = [30, 360, 690, 1020, 1350, 1680];

// faixa de regras (à direita da faixa de alertas)
const RUL_X = P6 + P6W + 30 + 30; // alinhado com a fase 7
const RUL_Y = LANE_Y;
const RUL_W = P8 + P8W - RUL_X;

export const flow = {
  titulo: 'Fluxo da Amanda (agente receptivo)',
  subtitulo: 'Como a Amanda conduz a conversa com o paciente no WhatsApp, etapa por etapa. Somente visualização.',
  versao: 'Fluxo v3 · roteiro + Clinilink + GPT · reserva real no Clinilink · voz natural e ordem livre',
  data: '2026-10-16',

  resumo: {
    titulo: 'Em uma frase',
    objetivo:
      'A Amanda é a recepcionista virtual da Clinex no WhatsApp. Ela conduz a conversa por etapas, com um roteiro fixo (nenhuma inteligência artificial decide o que fazer): entende o que o paciente precisa, mostra unidades, médicos, preço e datas reais, identifica o paciente pelo CPF e deixa tudo pronto para a equipe concluir.',
    faz: [
      'Entende o serviço pedido, ou sugere um pelo sintoma, sempre com a confirmação do paciente',
      'Consulta no Clinilink as unidades com agenda, o médico de cada uma, o preço e as datas com vaga',
      'Identifica o paciente pelo CPF e mostra só o nome para ele confirmar',
      'Coleta o cadastro de quem é novo: nome, nascimento, sexo e telefone',
      'Depois de escolher o horário, pergunta a forma de pagamento: pix (manda a chave e espera o comprovante), link de crédito (equipe) ou na recepção',
      'Lê a imagem do comprovante de pix e confere valor, data, recebedor e se foi concluído; se não servir, pede outro ou chama a equipe',
      'Reserva o horário livre no Clinilink e cadastra o paciente novo, de verdade',
      'Depois do agendamento: "obrigado" -> pergunta se pode ajudar em mais algo; "era só isso" -> agradece e deseja um ótimo dia; novo pedido -> atende',
      'Fala como uma pessoa no WhatsApp ("pra", "tá", "né"), sem emoji e com poucas vírgulas, e trata os médicos por Dr. ou Dra. ("a Dra. Fernanda", "o Dr. Armando"); se não tiver certeza do gênero pelo nome, usa só o nome',
      'Segue a ordem que o paciente quiser: ele pode dizer o dia, o período, a unidade, a forma de pagamento, o CPF ou o nome do médico em qualquer momento (até antes de dizer o serviço), e ela guarda e não pergunta de novo. Se pede a médica depois de ver os horários, ela mantém a consulta e refaz só os horários dela',
      'Pedido genérico ("preciso agendar um exame", "quero marcar uma consulta"): em vez de perguntar no escuro, mostra os exames ou as consultas MAIS PROCURADOS que têm agenda aberta (até 6, com variedade: laboratório, imagem, métodos gráficos...)',
      'Sugere primeiro o que a clínica mais agenda: conta os agendamentos dos últimos 30 dias de cada serviço (só a contagem; nenhum dado de paciente é guardado) e só mostra o que tem horário aberto. Vale também quando o pedido tem vários serviços parecidos ("ultrassom", "teste")',
      'Quando as regras não entendem o pedido ("quero ver meu coração", "estou com tontura", "de sangue" depois de "preciso de um exame"), um modelo de IA interpreta com o contexto da conversa e devolve só o termo de busca; quem procura no Clinilink e decide o que mostrar é o roteiro. Queixa de saúde vira sugestão de consulta com aviso de segurança, sempre com confirmação do paciente',
      'Parece digitado: cada resposta espera o tempo de alguém ler e escrever aquele texto (mais longa, mais demora; entre 1,5 e 12 s por balão), e parágrafos separados por linha em branco saem em balões separados (a chave pix vai sozinha, para copiar). Emergência e crise não esperam',
      'Remarcar ou cancelar: ainda não é com ela; chama a equipe na hora',
      'Entende áudio: pede a transcrição à Inovstar e entende frases faladas',
      'Procura profissional pelo nome: "quero com a dra Rebecca" -> acha a pessoa (aceita erro de uma letra), o atendimento dela e mostra só a agenda dela. Se há mais de uma parecida, pergunta qual; se ela não tem horário, oferece a especialidade com outros profissionais; se não existe, pede o sobrenome ou a especialidade',
      'Entende os nomes do mesmo exame (ultrassom, USG, ultrassonografia) e procura no catálogo inteiro do Clinilink por nome igual ou parecido: aceita abreviação ("teste ergo"), erro de digitação ("ergometrio") e palavras fora de ordem. Aceita também letras trocadas ("ergoemtrico"). Se o pedido é vago (só "teste"), mostra até 5 sugestões para o paciente escolher, só de serviços COM AGENDA aberta e com os principais na frente (o ergométrico passa na frente de teste rápido de laboratório); se há um vencedor claro, segue com ele. Com opções na tela, um pedido novo ("teste ergométrico") é tratado como pedido novo, e não como a primeira opção. Quando o paciente diz "exame" ou "teste", o nome exato do serviço ganha da especialidade ("exame de gravidez" vai ao teste de gravidez, e não à consulta de ginecologia)',
      'Se o serviço pedido não aparece no Clinilink (o Clinilink só entrega ao chatbot o que está marcado como "Agendamento via chatbot"), ela diz com franqueza e oferece chamar a equipe; só transfere se o paciente aceitar',
      'Retoma sozinha: se ela transferiu (comprovante com problema, falha, vaga) e o paciente volta a escrever antes de um atendente assumir, a conversa volta para ela e continua de onde parou. Se o paciente pediu um humano ou foi urgência, ela não retoma',
      'Responde dúvidas no meio da conversa (horário de atendimento, valor, formas de pagamento, médicos e unidades) e volta para a pergunta em que estava. O que ela não sabe com segurança (endereço, convênio, preparo) ela deixa para a equipe, sem inventar',
      'Entende o jeito de falar na hora de escolher o horário, com a lista na tela ou antes dela: "o mais rápido possível", "a próxima", "qualquer um", "tanto faz", "o que tiver", "o último", só o dia ("22", "dia 22", "quinta 22"), "outro dia", "tem mais opções?", "semana que vem", "mês que vem", "depois do dia 25", "até amanhã", "daqui a 2 dias", "às 15h" e combinações ("o mais rápido de manhã"). "Tanto faz" na pergunta da unidade escolhe a unidade com o horário mais cedo. Quando as regras não entendem, um intérprete de apoio (IA) tenta, com tudo validado; se ainda assim não entender, ela pergunta de outro jeito em vez de repetir a lista',
      'Entende como o paciente escolhe o horário: "o segundo", "a quinta opção", "quinta" (dia da semana), "quinta 22" (dia da semana mais o dia do mês) e "com a Fernanda" (escolhe pelo médico que aparece na lista). "Quinta", "quarta" e "segunda" valem como dia da semana, não como posição na lista',
      'Se o paciente muda de ideia antes de informar o CPF (outro dia, outra unidade, outro serviço), ela ajusta e segue, sem recomeçar',
      'Confere os dígitos do CPF antes de consultar o paciente (CPF digitado errado não chega ao cadastro)',
      'Pagamento parcial: soma os comprovantes, diz quanto falta e deixa o paciente escolher entre pagar o resto por pix ou na recepção',
      'O aviso ao paciente antes de uma transferência vai como mensagem normal (a mensagem anexada à transferência não chegava ao paciente)',
      'Passa a conversa para a equipe (setor Principal) com tudo anotado quando a reserva falha',
      'Reconhece emergência, crise emocional e pedido de atendente, e transfere na hora',
    ],
    naoFaz: [
      'Se a chave do Clinilink não tiver permissão de escrita, o Clinilink recusa e ela passa para a equipe, sem dizer que agendou',
      'Não confirma o pix no banco: só lê o comprovante enviado pelo paciente (a observação do agendamento manda a recepção conferir no extrato)',
      'Não dá diagnóstico, não interpreta exame e não orienta medicamento',
      'Não inventa dados: se o Clinilink não responde, passa para a equipe',
      'Só atende telefones autorizados e conversas do setor Agente IA',
      'Remarcação, cancelamento e resultado de exame ainda não têm etapa própria',
    ],
    modo: 'RESERVA REAL: a Amanda cadastra o paciente novo e reserva o horário no Clinilink. Fase de testes: só atende os números autorizados, e as mensagens saem com um título de identificação.',
  },

  kinds: [
    { id: 'gatilho', nome: 'Entrada', descricao: 'O que dá a partida: um aviso chega.' },
    { id: 'trava', nome: 'Trava', descricao: 'Uma conferência. Se não passar, o agente fica quieto ou desvia.' },
    { id: 'etapa', nome: 'Etapa da conversa', descricao: 'Um passo do roteiro: a Amanda fala ou espera o paciente.' },
    { id: 'clinilink', nome: 'Consulta ao Clinilink', descricao: 'Busca e grava dados reais no sistema da clínica (reserva e cadastro de paciente novo).' },
    { id: 'gpt', nome: 'GPT (tom)', descricao: 'A camada que só reescreve o tom da mensagem.' },
    { id: 'alerta', nome: 'Alerta / transfere', descricao: 'Ramo de exceção: a Amanda sai do roteiro e passa para a equipe.' },
    { id: 'acao', nome: 'Ação', descricao: 'O agente faz algo de verdade (envia, transfere).' },
    { id: 'info', nome: 'Informação', descricao: 'Explicação sobre onde ficam as regras.' },
    { id: 'fim', nome: 'Final', descricao: 'Onde o caminho termina.' },
  ],

  bands: [
    { id: 'p1', title: '1 · Chegada e travas', subtitle: 'A mensagem chega e o agente confere se pode responder', x: P1, y: -70, w: P1W, h: 840 },
    { id: 'p2', title: '2 · Recepção', subtitle: 'Segurança primeiro, depois a saudação pelo horário', x: P2, y: -70, w: P2W, h: MAIN_BOTTOM + 70 },
    { id: 'p3', title: '3 · O que o paciente precisa', subtitle: 'Pede o serviço direto ou descreve um sintoma; o paciente confirma', x: P3, y: -70, w: P3W, h: MAIN_BOTTOM + 70 },
    { id: 'p4', title: '4 · Agenda no Clinilink', subtitle: 'Unidades com agenda, médicos e preço reais', x: P4, y: -70, w: P4W, h: MAIN_BOTTOM + 70 },
    { id: 'p5', title: '5 · Unidade, dia e turno', subtitle: 'Datas e turnos reais, por ordem de chegada', x: P5, y: -70, w: P5W, h: MAIN_BOTTOM + 70 },
    { id: 'p6', title: '6 · Identificação', subtitle: 'CPF, consulta do paciente e confirmação do nome', x: P6, y: -70, w: P6W, h: MAIN_BOTTOM + 70 },
    { id: 'p7', title: '7 · Cadastro novo', subtitle: 'Só quando o CPF não existe: um dado por mensagem', x: P7, y: -70, w: P7W, h: MAIN_BOTTOM + 70 },
    { id: 'p8', title: '8 · Conclusão', subtitle: 'Hoje: passa para a equipe com tudo anotado', x: P8, y: -70, w: P8W, h: MAIN_BOTTOM + 70 },
    { id: 'alertas', title: 'Ramos de alerta', subtitle: 'Valem em qualquer etapa; a Amanda sai do roteiro e passa para a equipe', x: P2, y: LANE_Y, w: AX[5] + AW + 30 - P2, h: LANE_H, faixa: 'alerta' },
    { id: 'gpt', title: 'Mensagem amigável (GPT)', subtitle: 'O roteiro decide o conteúdo; o GPT só reescreve o tom. Vale para toda resposta das fases 2 a 8.', x: P1, y: GPT_Y, w: GX[5] + NW + 30, h: GPT_H, faixa: 'gpt' },
    { id: 'regras', title: 'Onde ficam as regras e quem pode mudar', subtitle: 'Tudo está no código do projeto; não há banco de dados', x: RUL_X, y: RUL_Y, w: RUL_W, h: 376, faixa: 'regras' },
  ] as FlowBand[],

  nodes: [
    // ================================================================ 1 · CHEGADA E TRAVAS
    {
      id: 'chega', kind: 'gatilho', step: 1, band: 'p1', x: nx(P1), y: row(0),
      title: 'Mensagem chega e a senha é conferida',
      subtitle: 'A Inovstar avisa o agente; sem a senha certa ninguém é atendido',
      detail: {
        oQueFaz: 'Quando um paciente manda mensagem no WhatsApp da clínica, a Inovstar (a plataforma de atendimento) avisa o agente. O agente confere se o aviso é mesmo da Inovstar, pela senha que vem junto, e responde "ok" na hora. O resto do trabalho acontece depois.',
        regra: 'O aviso precisa ser do tipo "mensagem recebida", de entrada (do paciente para a clínica) e ligado a um atendimento. Passa se trouxer a senha combinada no endereço ou a assinatura digital correta. Sem isso, o agente recusa (erro 401) e não lê nada. Reenvios antigos da fila da Inovstar que chegam sem a senha recebem "ok" sem serem processados, só para destravar a fila. A Inovstar exige resposta em até 5 segundos, por isso o agente responde "ok" primeiro e trabalha em segundo plano.',
        exemplo: 'O paciente escreve: "Oi, bom dia! Preciso de um cardiologista". A Inovstar avisa o agente com a senha certa e o agente aceita o aviso.',
        seFalhar: 'Aviso sem senha válida: recusado (401), nada é lido e nada é enviado ao paciente. Se a senha configurada estiver errada, ninguém é atendido; isso fica registrado no log.',
        tecnico: 'POST /webhooks/inovstar em src/routes/webhooks.ts (hasValidKey, verifySignature). parseMessageReceived() em src/integrations/inovstar.ts. Segredo: INOVSTAR_WEBHOOK_SECRET. O trabalho roda em segundo plano com waitUntil(handleIncoming(...)).',
      },
    },
    {
      id: 's401', kind: 'fim', tone: 'erro', band: 'p1', x: nx(P1) + 410, y: row(0) + 14, w: 250, h: 80,
      title: 'Recusado (401)', subtitle: 'Aviso sem senha válida',
      detail: {
        oQueFaz: 'O agente recusa o aviso e não faz mais nada com ele.',
        regra: 'Resposta HTTP 401 "não autorizado". Nada é lido, nada é enviado ao paciente.',
        exemplo: 'Alguém tenta chamar o endereço do agente sem a senha: recebe 401.',
        seFalhar: 'Não há o que falhar: é o final do caminho. Só fica uma linha no log.',
      },
    },
    {
      id: 'numero', kind: 'trava', step: 2, band: 'p1', x: nx(P1), y: row(1),
      title: 'Só atende número autorizado',
      subtitle: 'Na fase de testes, uma lista fixa de telefones; nunca grupos',
      detail: {
        oQueFaz: 'Na fase de testes, o agente só conversa com telefones de uma lista autorizada pela clínica. Grupos de WhatsApp são sempre ignorados.',
        regra: 'O telefone do paciente é comparado com a lista autorizada ignorando o +55 e a diferença do nono dígito (vale o DDD mais os 8 últimos dígitos). Se a lista estiver vazia, o agente não atende ninguém. Mensagem de grupo: ignorada.',
        exemplo: 'Um telefone que está na lista manda "oi": segue. Um telefone fora da lista manda "oi": o agente fica em silêncio e a equipe atende normalmente.',
        seFalhar: 'Fica em silêncio (nada é enviado) e registra no log "fora da lista" ou "grupo".',
        tecnico: 'isAllowed() e phoneKey() em src/agents/receptivo/agent.ts. Variável ALLOWED_NUMBERS (vazia = não atende ninguém).',
      },
    },
    {
      id: 'ign_num', kind: 'fim', tone: 'ignorado', band: 'p1', x: nx(P1) + 410, y: row(1) + 14, w: 250, h: 80,
      title: 'Ignorado em silêncio', subtitle: 'Número fora da lista, ou grupo',
      detail: {
        oQueFaz: 'Encerra sem fazer nada.',
        regra: 'O telefone não está na lista autorizada, ou a mensagem veio de um grupo. O agente não responde.',
        exemplo: 'Um número de fora da lista de testes manda "oi".',
        seFalhar: 'Sem falha possível.',
      },
    },
    {
      id: 'setor', kind: 'trava', step: 3, band: 'p1', x: nx(P1), y: row(2),
      title: 'Só no setor Agente IA, sem atendente',
      subtitle: 'Se uma pessoa da equipe já assumiu, o agente não interfere',
      detail: {
        oQueFaz: 'O agente só atua em conversas que estão no setor "Agente IA" e que ainda não têm uma pessoa da equipe atendendo.',
        regra: 'Se a conversa já tem atendente humano atribuído, o agente não responde. Se a conversa está em outro setor, também não. Conversa que está só na fila (sem dono) conta como sem atendente. Quando o agente transfere, a conversa vai para o setor Principal e sai do alcance dele.',
        exemplo: 'Conversa no setor Agente IA, sem atendente: segue. Conversa em que uma atendente da recepção já assumiu: o agente não interfere.',
        seFalhar: 'Fica em silêncio e registra no log "já tem atendente" ou "setor diferente".',
        tecnico: 'ev.isAssigned e ev.sectorId em src/agents/receptivo/agent.ts. Variável AGENT_SECTOR_ID (os códigos de setor não aparecem neste painel).',
      },
    },
    {
      id: 'ign_setor', kind: 'fim', tone: 'ignorado', band: 'p1', x: nx(P1) + 410, y: row(2) + 14, w: 250, h: 80,
      title: 'Ignorado em silêncio', subtitle: 'Outro setor, ou já tem atendente humano',
      detail: {
        oQueFaz: 'Encerra sem fazer nada.',
        regra: 'A conversa não está no setor Agente IA, ou uma pessoa da equipe já assumiu.',
        exemplo: 'A atendente Carla já está conversando com o paciente: o agente não entra.',
        seFalhar: 'Sem falha possível.',
      },
    },
    {
      id: 'espera', kind: 'etapa', step: 4, band: 'p1', x: nx(P1), y: row(3), canFail: true,
      title: 'Espera 30 segundos e lê o histórico',
      subtitle: 'Junta mensagens picadas e lê a conversa na Inovstar',
      detail: {
        oQueFaz: 'O agente espera o paciente terminar de digitar (muita gente manda várias mensagens curtas) e então lê o histórico da conversa na Inovstar.',
        regra: 'Espera 30 segundos depois da mensagem do paciente (para ele terminar de escrever: "quero tal coisa" e, logo depois, "mais isso" viram um pedido só) e busca as últimas 30 mensagens do atendimento. Emergência e crise não esperam: respondem em poucos segundos. Se chegar outra mensagem durante a espera, a espera recomeça a partir dela. Não existe banco de dados: o histórico da própria Inovstar é a memória do agente. Áudios entram como texto: a Inovstar só transcreve sob demanda, então a Amanda pede a transcrição de cada áudio da conversa (síncrono, leva alguns segundos). Áudio que não pôde ser transcrito, imagem ou arquivo sem texto não contam como "não entendi": ela pede para o paciente escrever ou mandar de novo. Frases faladas são entendidas ("o terceiro horário", "10 de maio de 1990", "meu nome é Joana Silva", CPF falado com espaços).',
        exemplo: 'O paciente manda "oi", "tudo bem?" e "preciso de cardiologista" em 3 segundos. O agente espera, lê as três e responde uma vez só.',
        seFalhar: 'Se a Inovstar não entregar o histórico, o agente não consegue seguir e nada é enviado; o erro fica no log e a equipe vê a conversa normalmente.',
        tecnico: 'sleep(env.debounceMs) e getHistory() em src/agents/receptivo/agent.ts e src/integrations/inovstar.ts (GET do histórico do atendimento). Variável DEBOUNCE_MS (padrão 30000).',
      },
    },
    {
      id: 'ultima', kind: 'trava', step: 5, band: 'p1', x: nx(P1), y: row(4),
      title: 'Só responde à última mensagem',
      subtitle: 'Evita responder duas vezes ou uma mensagem que ficou para trás',
      detail: {
        oQueFaz: 'Evita responder duas vezes, ou responder uma mensagem que já ficou para trás.',
        regra: 'Só continua se a mensagem que gerou o aviso for a mais recente do paciente. Se chegou outra depois, é o aviso dela que vai responder. Também não responde se a última mensagem da conversa já for de saída (alguém da equipe, ou o próprio agente, já respondeu).',
        exemplo: 'O paciente manda "oi" e, 2 segundos depois, "quero cardiologia". O aviso do "oi" é ignorado; o do "quero cardiologia" é quem responde.',
        seFalhar: 'Fica em silêncio e registra no log o motivo ("chegou mensagem mais nova" ou "última mensagem já é de saída").',
        tecnico: 'Comparação de lastIn._id com ev.messageId e checagem de last.direction em src/agents/receptivo/agent.ts.',
      },
    },
    {
      id: 'ign_ultima', kind: 'fim', tone: 'ignorado', band: 'p1', x: nx(P1) + 410, y: row(4) + 14, w: 250, h: 80,
      title: 'Ignorado em silêncio', subtitle: 'Chegou mensagem mais nova, ou já foi respondida',
      detail: {
        oQueFaz: 'Encerra sem fazer nada.',
        regra: 'Há uma mensagem mais nova do paciente (que vai gerar a própria resposta), ou alguém já respondeu depois da última mensagem do paciente.',
        exemplo: 'O paciente mandou duas mensagens seguidas: só a segunda gera resposta.',
        seFalhar: 'Sem falha possível.',
      },
    },

    // ================================================================ 2 · RECEPÇÃO
    {
      id: 'jornada', kind: 'etapa', step: 6, band: 'p2', x: nx(P2), y: row(0),
      title: 'Roteiro relê a conversa do paciente',
      subtitle: 'Sem banco: refaz o caminho a partir do que o paciente já disse',
      detail: {
        oQueFaz: 'O roteiro não guarda memória própria. A cada mensagem, ele relê tudo o que o paciente disse nesta conversa, em ordem, e descobre em que etapa a conversa está.',
        regra: 'Considera só as mensagens do paciente das últimas 12 horas e depois do fim da última jornada concluída. Na versão de simulação, a mensagem final marca o fim da jornada, e a próxima mensagem do paciente abre uma jornada nova (sem repetir a saudação). O modo padrão é o roteiro por etapas, sem IA decidindo.',
        exemplo: 'Se o paciente já disse "cardiologia", "sim" e "Guamá", ao receber a terceira mensagem o roteiro refaz as três e sabe que falta escolher o dia.',
        seFalhar: 'Sem falha própria. Se o Clinilink falhar durante a releitura, vale o ramo de alerta "Falha ao consultar o Clinilink".',
        tecnico: 'responder() e step() em src/agents/receptivo/script/engine.ts. Filtro das mensagens (modo scripted, janela de 12 h) em src/agents/receptivo/agent.ts. Variável AGENT_MODE (scripted é o padrão).',
      },
    },
    {
      id: 'triagem', kind: 'trava', step: 7, band: 'p2', x: nx(P2), y: row(1),
      title: 'Triagem de segurança, em toda mensagem',
      subtitle: 'Antes de tudo: crise emocional, emergência, pedido de atendente',
      detail: {
        oQueFaz: 'A cada mensagem do paciente, antes de qualquer etapa, o roteiro procura sinais de crise emocional, de emergência clínica ou um pedido para falar com uma pessoa.',
        regra: 'Ordem de verificação: 1) crise emocional, 2) emergência clínica, 3) pedido de atendente. Se qualquer uma for encontrada, a conversa sai do roteiro normal e segue o ramo de alerta correspondente (linhas vermelhas, na faixa de baixo). As palavras reconhecidas estão descritas em cada ramo. Se nada for encontrado, a conversa segue para a saudação e as etapas.',
        exemplo: 'Paciente: "estou com dor forte no peito" -> emergência: orienta o pronto-socorro e o 192, e transfere. Paciente: "quero cardiologia" -> nenhum alerta, segue o roteiro.',
        seFalhar: 'Sem falha técnica: é uma checagem de palavras feita dentro do próprio roteiro, sem consultar nenhum sistema.',
        tecnico: 'Expressões CRISE, EMERGENCIA e HUMANO no começo de step() em src/agents/receptivo/script/engine.ts.',
      },
    },
    {
      id: 'saudacao', kind: 'etapa', step: 8, band: 'p2', x: nx(P2), y: row(2),
      title: 'Saudação pelo horário de Belém',
      subtitle: '"Oi, bom dia! Aqui é a Amanda, da Clinex."',
      detail: {
        oQueFaz: 'Na primeira resposta da conversa, a Amanda se apresenta com a saudação do horário e já responde ao pedido na mesma mensagem.',
        regra: '"Bom dia" das 5h00 às 11h59. "Boa tarde" das 12h00 às 17h59. "Boa noite" das 18h00 às 4h59 (hora de Belém, que é a hora de Brasília, fuso da clínica). Formato: "Oi [nome], [saudação]! Aqui é a Amanda, da Clinex." seguido, na mesma mensagem, da resposta ao pedido. Se o paciente só cumprimentou (oi, olá, bom dia, teste...), ela completa com "Me conta o que você precisa?". Depois da primeira resposta não repete a saudação nem se apresenta de novo.',
        exemplo: 'Paciente: "Oi" (às 9h30)\nAmanda: "Oi, bom dia! Aqui é a Amanda, da Clinex. Me conta o que você precisa?"',
        seFalhar: 'Sem falha técnica.',
        tecnico: 'SAUDACAO() e a variável "abertura" em src/agents/receptivo/script/engine.ts. Fuso: CLINIC_TZ (padrão America/Sao_Paulo). Regras de estilo da Amanda: docs/amanda-prompt-v7.3.md.',
      },
    },

    // ================================================================ 3 · O QUE O PACIENTE PRECISA
    {
      id: 'entende', kind: 'etapa', step: 9, band: 'p3', x: nx(P3), y: row(0), canFail: true,
      title: 'Entende o que o paciente precisa',
      subtitle: 'Pediu o serviço direto, ou descreveu um sintoma',
      detail: {
        oQueFaz: 'O roteiro procura, na mensagem do paciente, o nome de uma especialidade, de um exame ou um sintoma conhecido, e descobre qual serviço da clínica atende o pedido.',
        regra: 'Palavras que a Amanda reconhece (acentos e maiúsculas não importam):\n- Endocrinologia: endocrino, diabetes, tireoide, hormônio\n- Cardiologia: cardio, coração, palpitação, arritmia, pressão alta\n- Dermatologia: derma, pele, acne, mancha, coceira\n- Ginecologia: gineco, menstruação, preventivo, gravidez\n- Ortopedia: ortopedista, osso, joelho, coluna, fratura, dor nas costas\n- Pediatria: pediatra, criança, meu filho, minha filha, bebê\n- Ultrassom: ultrassom, usg, ecografia\nCom a agenda real do Clinilink, se a palavra não estiver na lista, a Amanda ainda tenta achar no cadastro de procedimentos da clínica uma palavra do pedido com 5 letras ou mais. Hoje, o caso "descreveu um sintoma" (dor, aperto, palpitação, pressão, arritmia) existe para Cardiologia: nele a Amanda sugere o serviço em vez de afirmar, e inclui o aviso de segurança.',
        exemplo: 'Paciente: "Oi, bom dia! Preciso de um cardiologista" -> serviço reconhecido: consulta de Cardiologia.\nPaciente: "estou com dor no coração" -> sintoma reconhecido: a Amanda sugere a consulta de Cardiologia.',
        seFalhar: 'Se não reconhecer nada, segue para "Pede o serviço de novo" (na segunda vez seguida passa para a equipe). Se o Clinilink não responder à busca, vale o ramo "Falha ao consultar o Clinilink".',
        tecnico: 'RAIZES em src/agents/receptivo/script/catalog.ts (palavras e sintomas). descobrir() em src/agents/receptivo/script/clinilinkFonte.ts (busca real) ou no catálogo simulado de exemplo, quando não há chave do Clinilink.',
      },
    },
    {
      id: 'opcoes', kind: 'etapa', band: 'p3', x: rx(P3), y: row(0),
      title: 'Vários parecidos: pergunta qual',
      subtitle: 'Só com a agenda real: mais de um item combina com o pedido',
      detail: {
        oQueFaz: 'Quando o pedido combina com mais de um item do cadastro da clínica, a Amanda lista as opções numeradas e pergunta qual o paciente precisa.',
        regra: 'Mostra até 4 opções empatadas, numeradas. O paciente responde pelo número (1, 2...) ou citando uma palavra do nome. Depois disso a Amanda segue para a sugestão do serviço. O sistema prefere "consulta" e descarta "retorno" quando há dúvida.',
        exemplo: 'Amanda: "Achei estas opções:\n1. Consulta Cardiologia\n2. Ecocardiograma\nQual delas você precisa?"',
        seFalhar: 'Se a resposta não bater com nenhuma opção, a lista é mostrada de novo.',
        tecnico: 'Retorno "opcoes" de descobrir() em clinilinkFonte.ts e o bloco de opções de step() em engine.ts.',
      },
    },
    {
      id: 'sugere', kind: 'etapa', step: 10, band: 'p3', x: nx(P3), y: row(1),
      title: 'Amanda sugere o serviço',
      subtitle: 'Em caso de dor, com aviso de segurança',
      detail: {
        oQueFaz: 'A Amanda diz qual serviço entendeu e pergunta se é isso mesmo. O paciente sempre confirma antes de a conversa avançar.',
        regra: 'Pediu o serviço direto: "Ah, então é [serviço], né?" (ou "Entendi, você quer [serviço], é isso?"; ela alterna). Se a consulta é com uma médica ou um médico pedido pelo nome, a frase diz "com a Dra. Fulana" ou "com o Dr. Fulano"\nDescreveu um sintoma: "Pelo que você contou, o serviço indicado é [serviço]. Se a dor estiver forte ou vier com falta de ar, procure agora o pronto-socorro mais próximo ou ligue 192. É isso que você precisa?"\nA Amanda nunca dá diagnóstico: só indica o tipo de consulta. Se o paciente já citou unidade, dia ou turno, ela guarda para não perguntar de novo.',
        exemplo: 'Amanda: "Oi, bom dia! Aqui é a Amanda, da Clinex. Ah, então é consulta de Cardiologia, né?"\n\nCom sintoma:\nAmanda: "Pelo que você contou, o serviço indicado é consulta de Cardiologia. Se a dor estiver forte ou vier com falta de ar, procure agora o pronto-socorro mais próximo ou ligue 192. É isso que você precisa?"',
        seFalhar: 'Sem falha técnica. Se o paciente responder algo que não é sim nem não, a Amanda repete a pergunta de outro jeito.',
        tecnico: 'Bloco "sugere o serviço" de step() em src/agents/receptivo/script/engine.ts (campo viaSintoma).',
      },
    },
    {
      id: 'confirma', kind: 'etapa', step: 11, band: 'p3', x: nx(P3), y: row(2),
      title: 'Paciente confirma? (sim ou não)',
      subtitle: 'Só avança com o "sim" do paciente',
      detail: {
        oQueFaz: 'A conversa só segue depois que o paciente confirma que é aquele serviço mesmo.',
        regra: 'Sim (sim, pode, quero, isso mesmo, ok, claro, fechado, combinado, certo, por favor...): segue para a consulta da agenda.\nNão (não, outro, outra, errado...): a Amanda diz "Sem problema. Qual consulta ou exame você precisa?" e volta a perguntar o serviço.\nOutra resposta: ela repete a pergunta, por exemplo "Só para confirmar: você precisa de consulta de Cardiologia, certo?".',
        exemplo: 'Paciente: "sim, é isso" -> segue para a consulta da agenda.\nPaciente: "não" -> Amanda: "Sem problema. Qual consulta ou exame você precisa?"',
        seFalhar: 'Sem falha técnica.',
        tecnico: 'Expressões SIM e NAO e o bloco de confirmação de step() em engine.ts.',
      },
    },
    {
      id: 'repete', kind: 'etapa', band: 'p3', x: rx(P3), y: row(2),
      title: 'Pede o serviço de novo',
      subtitle: 'Não entendeu, ou o paciente disse "não". Ela insiste, sem transferir sozinha',
      detail: {
        oQueFaz: 'Quando o paciente escreve algo que não indica nenhum serviço conhecido, ou diz que o serviço sugerido não é o que quer, a Amanda pede de novo o nome da especialidade ou do exame.',
        regra: 'Mensagem sem serviço reconhecido (e que não seja só um cumprimento): conta 1 falha e a Amanda diz "Hmm não peguei qual é o serviço. Me diz a especialidade ou o exame? Pode ser o nome do médico também." Na segunda falha ela NÃO transfere: pede de outro jeito (especialidade, exame ou nome do médico) e lembra que, se preferir, é só pedir a equipe. Quem diz que quer agendar mas não diz o quê ("quero marcar uma consulta") ouve "Claro! Qual consulta ou exame você precisa?". Quem adianta o dia, o período, a unidade ou a forma de pagamento antes do serviço ("quero marcar amanhã de manhã") ouve "Anotei amanhã de manhã. Qual consulta ou exame você precisa?" e o que disse fica guardado. Cumprimentos simples (oi, bom dia, teste) não contam como falha. Se o paciente disse "não" à sugestão, ela diz "Sem problema. Qual consulta ou exame você precisa?" e recomeça esta fase.',
        exemplo: 'Paciente: "blablabla"\nAmanda: "Oi, bom dia! Aqui é a Amanda, da Clinex.\nHmm não peguei qual é o serviço. Me diz a especialidade ou o exame? Pode ser o nome do médico também."',
        seFalhar: 'Ela segue pedindo de outro jeito; só vai para a equipe se o paciente pedir.',
        tecnico: 'Contador s.falhas em step() de src/agents/receptivo/script/engine.ts.',
      },
    },

    // ================================================================ 4 · AGENDA NO CLINILINK
    {
      id: 'agenda', kind: 'clinilink', step: 12, band: 'p4', x: nx(P4), y: row(0), canFail: true,
      title: 'Consulta a agenda no Clinilink',
      subtitle: 'Quais unidades têm agenda do serviço, e com quais médicos',
      detail: {
        oQueFaz: 'A Amanda consulta o Clinilink (o sistema da clínica) para descobrir em quais unidades existe agenda para o serviço confirmado e quais médicos atendem em cada uma.',
        regra: 'Para cada unidade, o roteiro olha a agenda dos próximos 30 dias. Só entra na lista a unidade que tem agenda confirmada para aquele serviço nesse período. Os médicos vêm da própria agenda (até 3 por unidade). Se nenhuma unidade tiver agenda, o roteiro encerra com o ramo "Sem vagas". A consulta é somente leitura: o agente só olha, não grava nada no Clinilink. As respostas ficam guardadas por 2 a 10 minutos para não sobrecarregar o sistema.',
        exemplo: 'Serviço: consulta de Cardiologia. O Guamá tem agenda (Carlos Almeida) e o Telégrafo tem agenda (Mariana Souza), então os dois são citados. Se o Telégrafo não tivesse agenda do serviço, não seria citado.',
        seFalhar: 'Clinilink fora do ar ou lento (até 25 segundos por tentativa, com uma nova tentativa): o agente NÃO inventa nada. Avisa o paciente e passa para a equipe (ramo "Falha ao consultar o Clinilink").',
        tecnico: 'montar() em src/agents/receptivo/script/clinilinkFonte.ts. listAgenda() em src/integrations/clinilink.ts (somente GET, memória de 2 min). Sem a chave do Clinilink o agente usa um catálogo SIMULADO de exemplo.',
      },
    },
    {
      id: 'preco', kind: 'clinilink', step: 13, band: 'p4', x: nx(P4), y: row(1),
      title: 'Pega o preço real do cadastro',
      subtitle: 'Se não houver valor, a Amanda não cita preço',
      detail: {
        oQueFaz: 'O valor da consulta ou do exame vem do cadastro do Clinilink; nunca é escrito à mão no roteiro (na versão real).',
        regra: 'Valor igual em todas as unidades com agenda: uma frase só ("A consulta é R$ 200,00."). Valor diferente entre unidades: uma frase por unidade ("No Guamá a consulta é ..."). O valor é SEMPRE o campo "preço" do Clinilink; o campo "preço no dinheiro" não é usado. Preço zero ou vazio é tratado como "sem valor": a Amanda nunca escreve "R$ 0,00", não cita preço, e se o paciente perguntar diz que a equipe confirma o valor. Para exame, a frase começa com "O exame é".',
        exemplo: '"A consulta é R$ 200,00."',
        seFalhar: 'Sem valor no cadastro, o preço simplesmente não é citado. Nunca se inventa um valor.',
        tecnico: 'Bloco de preço em montar(), src/agents/receptivo/script/clinilinkFonte.ts (usa só o campo preco; zero ou vazio = sem valor).',
      },
    },
    {
      id: 'informa', kind: 'etapa', step: 14, band: 'p4', x: nx(P4), y: row(2),
      title: 'Informa unidades, médicos e preço',
      subtitle: 'Uma unidade por linha, com o médico de cada uma',
      detail: {
        oQueFaz: 'A Amanda conta ao paciente onde há agenda, com qual médico, quanto custa, e já pergunta a unidade.',
        regra: 'Começa com "Tenho sim!" e conta, numa frase só, onde há agenda e com quem, sempre com Dr./Dra. ("No Guamá com o Dr. Carlos e no Telégrafo com a Dra. Mariana."), depois o preço e a pergunta "Qual dos dois fica melhor pra você?".\nUma unidade só: a mesma frase, sem a pergunta, e na mesma mensagem já segue para as datas. Se o paciente já disse a unidade, ela fala só dela.\nO Dr. ou a Dra. vem do primeiro nome do médico (lista de nomes brasileiros e terminação; nomes raros são confirmados por um modelo de linguagem). Se houver dúvida, usa só o nome, sem título: ela nunca chuta o gênero.\nEssa informação é dada uma vez só, na primeira vez que a Amanda chega aqui.',
        exemplo: 'Amanda: "Tenho sim! No Guamá com o Dr. Carlos e no Telégrafo com a Dra. Mariana. A consulta é R$ 200,00.\nQual dos dois fica melhor pra você?"',
        seFalhar: 'Sem falha própria.',
        tecnico: 'Bloco "informa as unidades" de step() em engine.ts.',
      },
    },

    // ================================================================ 5 · UNIDADE, DIA E TURNO
    {
      id: 'unidade', kind: 'etapa', step: 15, band: 'p5', x: nx(P5), y: row(0),
      title: 'Paciente escolhe a unidade',
      subtitle: 'Ou a Amanda assume, quando só uma tem agenda',
      detail: {
        oQueFaz: 'O paciente diz em qual unidade prefere ser atendido.',
        regra: 'Se só uma unidade tem agenda, ela é escolhida automaticamente. Com várias, o paciente digita o nome da unidade (também vale já adiantar isso na primeira mensagem, mesmo antes de dizer o serviço: "quero marcar lá no Guamá"). "Tanto faz" ou "qualquer uma" escolhe a unidade com o horário mais cedo. Se o paciente pedir uma unidade sem agenda do serviço, a Amanda avisa que ali não há agenda e pergunta de novo: "Qual dos dois você prefere: Guamá ou Telégrafo?".',
        exemplo: 'Paciente: "Guamá"',
        seFalhar: 'Sem falha técnica. Enquanto a unidade não for escolhida, a Amanda repete a pergunta.',
        tecnico: 'Bloco de unidade de step() em engine.ts; nomes das unidades vêm do Clinilink (nomesUnidades() em clinilinkFonte.ts).',
      },
    },
    {
      id: 'datas', kind: 'clinilink', step: 16, band: 'p5', x: nx(P5), y: row(1), canFail: true,
      title: 'Busca datas e turnos com vaga',
      subtitle: 'Só horários que existem de verdade na agenda',
      detail: {
        oQueFaz: 'A Amanda consulta no Clinilink os dias e turnos (manhã ou tarde) em que a unidade escolhida tem vaga para o serviço.',
        regra: 'Sem dia pedido: busca a partir de amanhã, olha as 3 próximas semanas e oferece até 4 períodos. Se o paciente já falou o dia (hoje, amanhã, depois de amanhã, dia da semana, 15/10 ou "dia 15") e/ou o turno (manhã ou tarde), busca exatamente isso. Cada período é um bloco por ordem de chegada, com o horário em que a agenda abre. Se o paciente pedir à noite, a Amanda avisa: "Nosso atendimento é pela manhã e à tarde."',
        exemplo: 'Para o Guamá, a partir de amanhã: quinta de manhã (agenda abre às 7h), quinta à tarde (13h), sexta de manhã, sexta à tarde.',
        seFalhar: 'Nenhuma data aberta: ramo "Sem vagas". Clinilink fora do ar: ramo "Falha ao consultar o Clinilink".',
        tecnico: 'periodos() e proximas() em clinilinkFonte.ts; agrupar() cria um período por dia e turno (manhã = agenda que abre antes das 12h). listAgenda() em src/integrations/clinilink.ts (somente GET).',
      },
    },
    {
      id: 'lista', kind: 'etapa', step: 17, band: 'p5', x: nx(P5), y: row(2),
      title: 'Mostra datas e turnos numerados',
      subtitle: 'Com o horário de início da agenda (ordem de chegada)',
      detail: {
        oQueFaz: 'A Amanda mostra as opções numeradas para o paciente escolher.',
        regra: 'Formato: "N. Quinta, dia 22, de manhã, a partir das 8h" (o mês só aparece quando é em outro mês). O horário é o de abertura da agenda: o atendimento é por ordem de chegada, não é um horário marcado. Quando a unidade tem mais de um médico, a linha termina com ", com a Dra. [médica]" (ou "com o Dr. [médico]"). A mensagem abre com "Consegui estes aqui:" e fecha com uma pergunta só: "Qual desses fica bom pra você? Se quiser outro dia, me fala que eu vejo."',
        exemplo: 'Amanda: "Consegui estes aqui:\n1. Quinta, dia 15, de manhã, a partir das 7h\n2. Quinta, dia 15, à tarde, a partir das 13h\n3. Sexta, dia 16, de manhã, a partir das 7h\n4. Sexta, dia 16, à tarde, a partir das 13h\nQual desses fica bom pra você? Se quiser outro dia, me fala que eu vejo."',
        seFalhar: 'Sem falha própria.',
        tecnico: 'numerada() e linhaSlot() em engine.ts.',
      },
    },
    {
      id: 'escolhe', kind: 'etapa', step: 18, band: 'p5', x: nx(P5), y: row(3),
      title: 'Paciente escolhe o dia e o turno',
      subtitle: 'Pelo número da lista, ou digitando o dia',
      detail: {
        oQueFaz: 'O paciente escolhe uma das opções, ou pede outro dia.',
        regra: 'Responde pelo número da lista (1, 2, 3...), por "primeira" ou "última", ou digitando o dia (hoje, amanhã, segunda, 20/10) e o turno. Se naquele dia só há um turno com vaga, ele é escolhido sozinho. Se há dois, a Amanda lista os dois. Se não há vaga no dia pedido: "Para segunda-feira, 19 de outubro de manhã não há vaga. Tenho:" e mostra as próximas 4 opções. Se nem isso existir, vai para o ramo "Sem vagas".',
        exemplo: 'Paciente: "2"\nou\nPaciente: "segunda de manhã"\nAmanda: "Para segunda-feira, 19 de outubro de manhã não há vaga. Tenho:\n1. terça-feira, 20 de outubro, de manhã, a partir das 7h\n..."',
        seFalhar: 'Sem vaga em nenhuma data: ramo "Sem vagas". Resposta que não bate com a lista: a Amanda mostra as opções de novo.',
        tecnico: 'Blocos de "dia e período" em step() (engine.ts): lerData(), lerTurno() e alternativas().',
      },
    },

    // ================================================================ 6 · IDENTIFICAÇÃO
    {
      id: 'cpf', kind: 'etapa', step: 19, band: 'p6', x: nx(P6), y: row(0),
      title: 'Pede o CPF do paciente',
      subtitle: 'Resume a vaga escolhida e pede o CPF',
      detail: {
        oQueFaz: 'Com a vaga escolhida, a Amanda repete o resumo e pede o CPF do paciente.',
        regra: 'Depois do pagamento ela pede o CPF: "Me passa o CPF do paciente pra eu reservar?" (depois de um comprovante: "Recebi o seu comprovante, muito obrigada! Agora pra eu fazer a reserva pode me passar o CPF do paciente?"). Antes disso vem o resumo do horário ("Beleza, então fica consulta de Cardiologia no Guamá na quinta (15) à tarde a partir das 13h por ordem de chegada com o Dr. Carlos.") e a pergunta do pagamento. Se o paciente já tiver dito o CPF antes ("meu cpf é ..."), ela guarda e não pergunta de novo. O CPF é lido com ou sem pontos e traço. Se vier um número que não parece um CPF: "Não consegui ler o CPF. Pode me mandar os 11 números?" Se o CPF tem número errado: "Acho que algum número do CPF escapou, dá uma olhadinha e me manda de novo os 11 números?"',
        exemplo: 'Amanda: "Beleza, então fica consulta de Cardiologia no Guamá na quinta (15) à tarde a partir das 13h por ordem de chegada com o Dr. Carlos.\nPra agilizar o seu atendimento na recepção, você quer antecipar o pagamento por pix ou link de crédito?"\nPaciente: "na recepção"\nAmanda: "Sem problema nenhum o pagamento fica pra recepção no dia do atendimento. Me passa o CPF do paciente pra eu reservar?"',
        seFalhar: 'Sem falha técnica. A Amanda repete o pedido até receber 11 números.',
        tecnico: 'cpfDoTexto() e o bloco "CPF" de step() em engine.ts.',
      },
    },
    {
      id: 'consultacpf', kind: 'clinilink', step: 20, band: 'p6', x: nx(P6), y: row(1), canFail: true,
      title: 'Consulta o paciente no Clinilink',
      subtitle: 'Procura o cadastro pelo CPF (somente leitura)',
      detail: {
        oQueFaz: 'A Amanda procura o CPF no cadastro de pacientes do Clinilink.',
        regra: 'CPF encontrado: segue para a confirmação do nome. CPF não encontrado: segue para o cadastro de paciente novo. É dado pessoal: a consulta não fica guardada em memória e o CPF aparece mascarado nos registros (log) do agente.',
        exemplo: 'CPF 123.456.789-00 (fictício) não encontrado\nAmanda: "Não encontrei esse CPF no cadastro. Vou fazer o cadastro agora. Qual o nome completo do paciente?"',
        seFalhar: 'Clinilink fora do ar: o agente não inventa. Avisa e passa para a equipe (ramo "Falha ao consultar o Clinilink").',
        tecnico: 'paciente() em clinilinkFonte.ts e getPacientePorCpf() em src/integrations/clinilink.ts (sem cache). Máscara do CPF no log: agent.ts.',
      },
    },
    {
      id: 'confirmanome', kind: 'etapa', step: 21, band: 'p6', x: nx(P6), y: row(2),
      title: 'Mostra só o nome e pede confirmação',
      subtitle: 'Nenhum outro dado do paciente é mostrado',
      detail: {
        oQueFaz: 'Para ter certeza de que o CPF é da pessoa certa, a Amanda mostra apenas o nome encontrado e pergunta se é aquele paciente.',
        regra: '"Achei aqui o cadastro de [Nome]. É esse mesmo o paciente?" Nenhum outro dado (CPF, nascimento, telefone) é mostrado. Sim: segue para a conclusão. Não: "Sem problema. Dá uma conferida no CPF e me manda de novo?" e volta a pedir o CPF. Outra resposta: repete a pergunta com o nome.',
        exemplo: 'Amanda: "Achei aqui o cadastro de Maria da Silva Exemplo. É esse mesmo o paciente?"\nPaciente: "sim"',
        seFalhar: 'Sem falha técnica.',
        tecnico: 'Bloco "paciente encontrado" de step() em engine.ts.',
      },
    },

    // ================================================================ 7 · CADASTRO NOVO
    {
      id: 'cad_nome', kind: 'etapa', step: 22, band: 'p7', x: nx(P7), y: row(0),
      title: 'Pede o nome completo',
      subtitle: 'Como está no documento',
      detail: {
        oQueFaz: 'Quando o CPF não existe no Clinilink, a Amanda começa o cadastro pedindo o nome completo.',
        regra: 'Aceita texto só com letras e pelo menos duas palavras. O nome é guardado com iniciais maiúsculas. Se a resposta não parecer um nome completo: "Preciso do nome completo do paciente, como está no documento. Qual é?" Um dado por mensagem.',
        exemplo: 'Amanda: "Qual o nome completo do paciente?"\nPaciente: "João Pereira Exemplo"',
        seFalhar: 'A Amanda repete o pedido; não avança sem o nome.',
        tecnico: 'Bloco "cadastro" de step() em engine.ts (campo cad.nome).',
      },
    },
    {
      id: 'cad_nasc', kind: 'etapa', step: 23, band: 'p7', x: nx(P7), y: row(1),
      title: 'Pede a data de nascimento',
      subtitle: 'No formato dia/mês/ano',
      detail: {
        oQueFaz: 'Pede a data de nascimento do paciente.',
        regra: '"Prazer, [primeiro nome]! E a data de nascimento? Pode ser dia/mês/ano." A data precisa existir (31/02 é recusado) e o ano ficar entre 1900 e o ano atual.',
        exemplo: 'Amanda: "Prazer, João! E a data de nascimento? Pode ser dia/mês/ano."\nPaciente: "10/05/1985"',
        seFalhar: 'Data inválida: a Amanda repete a pergunta.',
        tecnico: 'lerNascimento() em engine.ts.',
      },
    },
    {
      id: 'cad_sexo', kind: 'etapa', step: 24, band: 'p7', x: nx(P7), y: row(2),
      title: 'Pede o sexo do paciente',
      subtitle: 'Feminino ou masculino',
      detail: {
        oQueFaz: 'Pede o sexo do paciente, que o cadastro exige.',
        regra: '"O cadastro pede o sexo do paciente: feminino ou masculino?" Entende feminino ou mulher, masculino ou homem.',
        exemplo: 'Amanda: "O cadastro pede o sexo do paciente: feminino ou masculino?"\nPaciente: "masculino"',
        seFalhar: 'Resposta que não indica nenhuma das duas: a Amanda repete a pergunta.',
        tecnico: 'Bloco "cadastro" de step() em engine.ts (campo cad.sexo).',
      },
    },
    {
      id: 'cad_tel', kind: 'etapa', step: 25, band: 'p7', x: nx(P7), y: row(3),
      title: 'Pede o telefone de contato',
      subtitle: 'Pode usar o número do próprio WhatsApp',
      detail: {
        oQueFaz: 'Pede um telefone de contato para o cadastro.',
        regra: 'Primeiro pergunta: "Posso usar este número do WhatsApp como contato do paciente?" Se o paciente disser sim, usa o número da própria conversa. Se não, ou se mandar outro número: "Qual o telefone com DDD para contato?" (aceita de 10 a 13 dígitos).',
        exemplo: 'Amanda: "Posso usar este número do WhatsApp como contato do paciente?"\nPaciente: "sim"',
        seFalhar: 'Número inválido: a Amanda repete o pedido.',
        tecnico: 'Bloco "cadastro" de step() em engine.ts (campo cad.telefone, usa ctx.telefone).',
      },
    },

    // ================================================================ 8 · CONCLUSÃO
    {
      id: 'conclui', kind: 'etapa', step: 26, band: 'p8', x: nx(P8), y: row(0),
      title: 'Todas as informações coletadas',
      subtitle: 'Reserva de verdade; se falhar, passa para a equipe',
      detail: {
        oQueFaz: 'A Amanda já tem a vaga escolhida e o paciente (existente ou novo). Falta só concluir.',
        regra: 'A Amanda consulta a agenda de novo, sem memória guardada, e pega o PRIMEIRO horário livre do período escolhido, com o mesmo médico que informou ao paciente. Se o paciente é novo, cadastra antes. Só diz "Agendamento confirmado" depois que o Clinilink responde que gravou. Se alguém ocupou o horário no meio do caminho, tenta o próximo livre (até 3). A gravação só acontece na ÚLTIMA mensagem da conversa e nunca é repetida sozinha, para não duplicar. Se a chave do Clinilink só tiver permissão de leitura, o Clinilink recusa e a Amanda passa para a equipe. Na simulação (sem chave do Clinilink), mostra uma confirmação de teste.',
        exemplo: 'Reservado: "Agendamento confirmado! Deu tudo certo, Maria. Ficou consulta de Ginecologia no Guamá na sexta, dia 16 de outubro, de manhã com a Dra. [médica]. É por ordem de chegada a partir das 8h então vale chegar cedinho. Estamos te esperando com carinho!"\nSe falhar: "Não consegui concluir a reserva. Vou chamar alguém da equipe pra concluir. Já deixei tudo anotado. Só um instante."',
        seFalhar: 'Vaga ocupada, serviço já marcado para o mesmo dia, cadastro recusado, erro do Clinilink ou resposta que não chegou: a Amanda NÃO diz que agendou, avisa o paciente e passa para a equipe com o motivo. Quando não dá para saber se gravou (erro 500 ou sem resposta), o resumo manda CONFERIR no Clinilink antes de refazer.',
        tecnico: 'Bloco "conclui" de step() em engine.ts e reservar() em clinilinkFonte.ts. Gravação: criarPaciente() e criarAgendamento() em src/integrations/clinilink.ts (POST sem repetição). Teste: npx tsx scripts/teste-reserva.ts.',
      },
    },
    {
      id: 'equipe', kind: 'acao', step: 27, band: 'p8', x: nx(P8), y: row(1),
      title: 'Passa para a equipe (setor Principal)',
      subtitle: 'Reserva que falhou: tudo anotado',
      detail: {
        oQueFaz: 'A Amanda avisa o paciente e transfere a conversa para a equipe humana, com um resumo para o atendente.',
        regra: 'Mensagem ao paciente: "[o que aconteceu]. Vou chamar alguém da equipe pra concluir. Já deixei tudo anotado. Só um instante." A conversa é transferida para o setor Principal com um resumo para o atendente: a vaga escolhida (serviço, unidade, dia, turno e médico), se o paciente já existe (nome) ou os dados a cadastrar (nome, nascimento, sexo, telefone, CPF), e o aviso de que a reserva e o cadastro ainda NÃO foram feitos. Se o setor Principal não estiver configurado, o agente só avisa o paciente.',
        exemplo: 'Resumo para a equipe (em resumo): "Paciente escolheu a vaga: consulta de Cardiologia no Guamá, quinta-feira, 15 de outubro, à tarde, a partir das 13h, com Carlos Almeida. CADASTRAR paciente novo: [nome, nascimento, sexo, telefone, CPF]. Reserva e cadastro ainda NÃO feitos (agente em modo leitura)."',
        seFalhar: 'Se a Inovstar recusar a transferência, o erro vai para o log; a conversa continua visível na fila para a equipe.',
        tecnico: 'Retorno com "handoff" em step() (engine.ts) e transferToSector() em src/integrations/inovstar.ts. Variável HUMAN_SECTOR_ID.',
      },
    },
    {
      id: 'fim_equipe', kind: 'fim', tone: 'ok', band: 'p8', x: nx(P8), y: row(2) + 14, w: 250, h: 80,
      title: 'Equipe assume', subtitle: 'Conversa no setor Principal',
      detail: {
        oQueFaz: 'Final do caminho de hoje: a conversa passa a ser atendida por uma pessoa da equipe.',
        regra: 'A conversa muda para o setor Principal e sai do alcance do agente. A equipe vê o resumo e conclui a reserva (e o cadastro, se for paciente novo) no Clinilink.',
        exemplo: 'A atendente abre a conversa e já encontra vaga, paciente e dados anotados.',
        seFalhar: 'Sem falha própria.',
      },
    },
    {
      id: 'sim_msg', kind: 'etapa', band: 'p8', x: rx(P8), y: row(0),
      title: 'Versão de simulação: confirma de teste',
      subtitle: 'Só sem a chave do Clinilink; nada é agendado de verdade',
      detail: {
        oQueFaz: 'Na versão de simulação, a Amanda mostra como seria a confirmação, deixando claro que é um teste.',
        regra: 'Só existe quando o agente roda sem a chave do Clinilink (agenda de exemplo). Mensagem: "[Cadastro de X feito.] Sua vaga de [serviço] está confirmada para [dia], na unidade [unidade], com [médico]. Os atendimentos começam às [hora], por ordem de chegada. Recomendamos chegar cedo." e, em seguida, a linha "(Simulação: nada foi agendado de verdade.)". Depois dessa mensagem, uma nova conversa começa do zero, sem repetir a saudação.',
        exemplo: 'Amanda: "Sua vaga de consulta de Cardiologia está confirmada para quinta-feira, 15 de outubro, na unidade Guamá, com Carlos Almeida. Os atendimentos começam às 13h, por ordem de chegada. Recomendamos chegar cedo.\n(Simulação: nada foi agendado de verdade.)"',
        seFalhar: 'Sem falha técnica.',
        tecnico: 'Retorno final de step() para fonte "simulado" e constante MARCA_FIM em src/agents/receptivo/script/engine.ts.',
      },
    },
    {
      id: 'fim_sim', kind: 'fim', tone: 'sombra', band: 'p8', x: rx(P8), y: row(1) + 14, w: 250, h: 80,
      title: 'Fim da simulação', subtitle: 'Nada foi agendado de verdade',
      detail: {
        oQueFaz: 'Final do caminho da versão de teste.',
        regra: 'A jornada termina na mensagem com "(Simulação: nada foi agendado de verdade.)". Uma nova mensagem do paciente abre outra conversa.',
        exemplo: 'Usado apenas em demonstrações sem a chave do Clinilink.',
        seFalhar: 'Sem falha própria.',
      },
    },

    // ================================================================ RAMOS DE ALERTA
    {
      id: 'a_crise', kind: 'alerta', step: 'A1', band: 'alertas', x: AX[0], y: AY, w: AW,
      title: 'Crise emocional',
      subtitle: 'CVV 188 e transfere na hora (urgente)',
      detail: {
        oQueFaz: 'Se o paciente fala em se machucar ou em tirar a própria vida, a Amanda para o roteiro, indica o CVV (188) e passa a conversa para a equipe com prioridade.',
        regra: 'Expressões reconhecidas: suicídio, me matar, tirar minha vida, acabar com minha vida, não quero mais viver, me machucar, autolesão. É a primeira checagem de toda mensagem, em qualquer etapa. A transferência é marcada como PRIORIDADE urgente. Esta mensagem NUNCA passa pelo GPT: sai exatamente como está escrita.',
        exemplo: 'Paciente: "não quero mais viver"\nAmanda: "Sinto muito que você esteja passando por isso. Vou te colocar agora com alguém da nossa equipe para te ajudar. Se precisar conversar com alguém neste momento, o CVV atende 24 horas pelo 188, a ligação é gratuita. Você não precisa passar por isso sozinho."\n(Se o nome do paciente for conhecido, ele aparece depois de "passando por isso".)',
        seFalhar: 'Sem falha técnica (é checagem de palavras). Se a transferência falhar, o paciente já recebeu a mensagem e o erro fica no log.',
        tecnico: 'Expressão CRISE e primeiro bloco de step() em engine.ts. Mensagens urgentes não passam por amigavel() (agent.ts: r.handoff?.urgente).',
      },
    },
    {
      id: 'a_emerg', kind: 'alerta', step: 'A2', band: 'alertas', x: AX[1], y: AY, w: AW,
      title: 'Emergência clínica',
      subtitle: 'Orienta o pronto-socorro e o 192; transfere (urgente)',
      detail: {
        oQueFaz: 'Se o paciente descreve algo que parece emergência, a Amanda para o roteiro, orienta procurar o pronto-socorro ou ligar para o 192 (SAMU) e passa a conversa para a equipe com prioridade.',
        regra: 'Expressões reconhecidas: dor (forte) no peito, falta de ar, não consigo respirar, desmaio, convulsão, sangramento intenso ou forte, AVC, infarto, rigidez na nuca, fraqueza súbita ou de um lado, fala travada ou enrolada. Vale em qualquer etapa. A transferência é marcada como PRIORIDADE urgente. Esta mensagem NUNCA passa pelo GPT.',
        exemplo: 'Paciente: "estou com dor forte no peito"\nAmanda: "Pelo que você descreveu, isso precisa de avaliação imediata. Por favor, procure agora o pronto-socorro mais próximo ou ligue 192. A Clinex faz atendimento agendado e não é o lugar certo para uma urgência. Fico à disposição depois, tá bem?"',
        seFalhar: 'Sem falha técnica (é checagem de palavras).',
        tecnico: 'Expressão EMERGENCIA em step() (engine.ts). Mensagens urgentes não passam por amigavel().',
      },
    },
    {
      id: 'a_humano', kind: 'alerta', step: 'A3', band: 'alertas', x: AX[2], y: AY, w: AW,
      title: 'Pediu atendente humano',
      subtitle: 'Respeita o pedido e transfere',
      detail: {
        oQueFaz: 'Se o paciente pede para falar com uma pessoa, a Amanda não insiste: passa a conversa para a equipe.',
        regra: 'Expressões reconhecidas: atendente, humano, pessoa de verdade, falar com alguém, falar com uma pessoa, recepção. Vale em qualquer etapa. Mensagem: "Claro! Vou chamar alguém da equipe pra te ajudar. Só um instante." (se for a primeira resposta, vem depois da saudação). Esta mensagem passa pelo GPT, como as demais.',
        exemplo: 'Paciente: "quero falar com uma atendente"\nAmanda: "Oi, bom dia! Aqui é a Amanda, da Clinex.\nClaro! Vou chamar alguém da equipe pra te ajudar. Só um instante."',
        seFalhar: 'Sem falha técnica.',
        tecnico: 'Expressão HUMANO em step() (engine.ts).',
      },
    },
    {
      id: 'a_naoentendeu', kind: 'alerta', step: 'A4', band: 'alertas', x: AX[3], y: AY, w: AW,
      title: 'Não entendeu o serviço (sem transferir)',
      subtitle: 'Insiste e oferece a equipe, mas não transfere sozinha',
      detail: {
        oQueFaz: 'Se, depois de pedir duas vezes, a Amanda ainda não entendeu qual serviço o paciente quer, ela continua ajudando: sugere dizer a especialidade, o exame ou o nome do médico, e lembra que a equipe está a um pedido de distância. Ela não transfere sozinha.',
        regra: 'Cada mensagem sem serviço reconhecido (que não seja só um cumprimento) conta uma falha. Na segunda: "Ainda não consegui identificar o que você precisa. Pode me dizer a especialidade, o nome do exame ou o nome do médico ou da médica? Se preferir falar com a nossa equipe, é só me pedir." Se o paciente pedir a equipe, aí sim ela transfere.',
        exemplo: 'Paciente: "blablabla" (1ª falha: ela pede o nome da especialidade)\nPaciente: "xyz qualquer coisa" (2ª falha)\nAmanda: "Ainda não consegui identificar o que você precisa. Pode me dizer a especialidade, o nome do exame ou o nome do médico ou da médica? Se preferir falar com a nossa equipe, é só me pedir."',
        seFalhar: 'Sem falha técnica.',
        tecnico: 'Contador s.falhas em step() (engine.ts).',
      },
    },
    {
      id: 'a_semvagas', kind: 'alerta', step: 'A5', band: 'alertas', x: AX[4], y: AY, w: AW,
      title: 'Sem vagas',
      subtitle: 'Pede para a equipe conferir e retornar',
      detail: {
        oQueFaz: 'Se o serviço não tem agenda aberta, a Amanda não promete nada: avisa e passa para a equipe.',
        regra: 'Três situações, três mensagens:\n- Serviço sem nenhuma vaga aberta: "No momento não há vagas abertas para [serviço]. Vou pedir para a equipe conferir e te retornar."\n- Unidade escolhida sem nenhuma data: "No momento não vejo vagas abertas. Vou pedir para a equipe conferir e te retornar."\n- Dia pedido sem vaga e sem outras datas: "Para essa data não encontrei vaga e, no momento, não vejo outras datas abertas. Vou pedir para a equipe conferir e te retornar."',
        exemplo: 'Paciente: "preciso de ultrassom" (sem agenda aberta)\nAmanda: "Oi, bom dia! Aqui é a Amanda, da Clinex.\nPoxa, no momento não tenho vaga aberta pra Ultrassom. Vou chamar alguém da equipe pra conferir e te retornar."',
        seFalhar: 'Sem falha técnica.',
        tecnico: 'Retorno "semAgenda" de descobrir() e blocos de datas em step() (engine.ts).',
      },
    },
    {
      id: 'a_falha', kind: 'alerta', step: 'A6', band: 'alertas', x: AX[5], y: AY, w: AW, canFail: true,
      title: 'Falha ao consultar o Clinilink',
      subtitle: 'Não inventa dado: passa para a equipe',
      detail: {
        oQueFaz: 'Se o Clinilink estiver fora do ar ou lento demais, a Amanda não chuta unidades, médicos, preços ou datas: avisa e passa para a equipe.',
        regra: 'Qualquer erro numa consulta ao Clinilink (agenda, preço, datas, paciente) interrompe o roteiro. Mensagem: "Estou com dificuldade para consultar a agenda agora. Vou pedir para a equipe te ajudar, só um instante." A equipe recebe o aviso "Falha ao consultar o Clinilink" com o motivo técnico. Cada consulta espera até 25 segundos e tenta uma segunda vez antes de desistir.',
        exemplo: 'Amanda: "Estou com dificuldade para consultar a agenda agora. Vou pedir para a equipe te ajudar, só um instante."',
        seFalhar: 'Este já é o plano B. Se a transferência também falhar, o erro fica no log e a conversa continua visível na fila.',
        tecnico: 'try/catch em torno de responder() em src/agents/receptivo/agent.ts. get() com timeout e nova tentativa em src/integrations/clinilink.ts.',
      },
    },

    // ================================================================ GPT
    {
      id: 'g_texto', kind: 'etapa', step: 'G1', band: 'gpt', x: GX[0], y: GY0,
      title: 'Roteiro escreve o texto-base',
      subtitle: 'Tem todos os fatos certos: preço, datas, unidades',
      detail: {
        oQueFaz: 'Toda resposta da Amanda nasce no roteiro, com os fatos exatos (valores, datas, horários, unidades, médicos, perguntas).',
        regra: 'O roteiro decide o conteúdo e a ordem da conversa. O GPT nunca decide o que dizer nem consulta dados: só recebe um texto pronto e reescreve o tom, se as regras permitirem.',
        exemplo: 'Texto-base: "Ah, então é consulta de Cardiologia, né?"',
        seFalhar: 'Sem falha própria.',
        tecnico: 'Retorno de responder() em src/agents/receptivo/agent.ts (r.reply).',
      },
    },
    {
      id: 'g_urg', kind: 'trava', step: 'G2', band: 'gpt', x: GX[1], y: GY0,
      title: 'É emergência ou crise?',
      subtitle: 'Essas mensagens NUNCA passam pelo GPT',
      detail: {
        oQueFaz: 'Protege as mensagens de segurança: elas saem exatamente como foram escritas.',
        regra: 'Se a transferência é urgente (emergência clínica ou crise emocional), a mensagem vai direto para o envio, sem o GPT. Também saem sem o GPT os textos aprovados palavra por palavra (unidades "Tenho sim!", lista de horários "Consegui estes aqui", "O mais rápido que tenho é", resumo com a pergunta do pagamento, chave pix, comprovante, aviso do sintoma e a confirmação do agendamento). As outras mensagens passam pelo GPT. Se não houver chave do GPT configurada, nenhuma mensagem passa por ele.',
        exemplo: 'A mensagem do CVV 188 e a do 192 são sempre as do roteiro, palavra por palavra.',
        seFalhar: 'Sem falha própria.',
        tecnico: 'Linha "const texto = r.handoff?.urgente ? r.reply : await amigavel(...)" em src/agents/receptivo/agent.ts.',
      },
    },
    {
      id: 'g_gpt', kind: 'gpt', step: 'G3', band: 'gpt', x: GX[2], y: GY0, canFail: true,
      title: 'GPT reescreve só o tom',
      subtitle: 'Caloroso e direto, sem mudar nenhum fato',
      detail: {
        oQueFaz: 'O GPT deixa a mensagem com cara de atendente atenciosa, sem mudar o conteúdo.',
        regra: 'Regras de estilo que o GPT recebe:\n- Preservar todos os fatos: valores em R$, datas, dias da semana, horários, nomes de unidades, especialidades, nomes de pessoas e a pergunta final\n- Manter a mesma ação e UMA pergunta só, no fim (se não havia pergunta, não criar)\n- Manter a abertura "Aqui é a Amanda, da Clinex." quando existir; fora disso, não se apresentar nem cumprimentar de novo\n- Voz natural de WhatsApp ("pra", "tá", "né"), frases curtas e poucas vírgulas; o texto do roteiro já está no tom certo, então mudar pouco\n- Manter exatamente o nome do serviço e os nomes e títulos dos médicos (a Dra. Fernanda, o Dr. Armando); nunca acrescentar título nem trocar o gênero\n- Proibido: emoji, travessão, asterisco, aspas decorativas\n- Não ACRESCENTAR uma abertura com Perfeito, Certo, Ótimo, Entendi, Beleza, Claro, Com certeza (se o roteiro já abre assim, mantém)\n- Não falar de sistema, ferramentas ou tecnologia\nUsa o modelo configurado (padrão gpt-4o-mini) com limite de 15 segundos.',
        exemplo: 'Texto-base: "Ah, então é consulta de Cardiologia, né?"\nPossível reescrita: "Ah, então é consulta de Cardiologia mesmo, né?" (só vale se passar na validação; o nome do serviço não pode mudar)',
        seFalhar: 'Se o GPT demorar mais de 15 segundos, der erro, ou não houver chave configurada, a Amanda usa o texto original do roteiro. Nada trava.',
        tecnico: 'amigavel() e REGRAS em src/lib/humanizer.ts. Variáveis OPENAI_API_KEY e OPENAI_MODEL.',
      },
    },
    {
      id: 'g_valida', kind: 'trava', step: 'G4', band: 'gpt', x: GX[3], y: GY0,
      title: 'Validação da reescrita',
      subtitle: 'Mudou valor, data, horário, unidade ou a pergunta? Descarta',
      detail: {
        oQueFaz: 'Confere se a reescrita manteve todos os fatos e o estilo. Se qualquer item falhar, o sistema descarta o GPT e usa o texto original.',
        regra: 'O sistema descarta a reescrita se:\n- faltar qualquer número do original (preços, datas, horas, números da lista, CPF), mês, dia da semana, nome de unidade (Guamá, Telégrafo), o nome Amanda, a saudação, "ordem de chegada", SAMU, CVV, "simulação", "CPF" ou "equipe"\n- a pergunta mudar (virar mais de uma, ou criar pergunta que não existia)\n- aparecer emoji, travessão, meia-risca ou asterisco\n- abrir com Perfeito, Certo, Ótimo, Entendi, Beleza, Claro ou Com certeza\n- ficar longa demais (mais de 2 vezes o original, mais 60 letras) ou vazia\nObservação: nomes de pessoas (paciente e médicos) são protegidos pela instrução dada ao GPT; a conferência automática cobre os itens acima.',
        exemplo: 'Original: "A consulta é R$ 200,00." Reescrita: "A consulta sai por R$ 180,00." -> descartada (o valor mudou). A Amanda envia o original.',
        seFalhar: 'Qualquer reprovação (ou erro) cai no texto original do roteiro. O motivo fica no log do agente.',
        tecnico: 'validar() e fatos() em src/lib/humanizer.ts.',
      },
    },
    {
      id: 'g_ok', kind: 'gpt', step: 'G5', band: 'gpt', x: GX[4], y: GY0,
      title: 'Usa a mensagem amigável',
      subtitle: 'Passou na validação',
      detail: {
        oQueFaz: 'A reescrita do GPT, aprovada na validação, vira a mensagem enviada.',
        regra: 'Só chega aqui o texto que manteve todos os fatos e o estilo.',
        exemplo: '"Oi, bom dia! Aqui é a Amanda, da Clinex. Ah, então é consulta de Cardiologia, né?"',
        seFalhar: 'Sem falha própria.',
        tecnico: 'Retorno de amigavel() quando validar() devolve null (humanizer.ts).',
      },
    },
    {
      id: 'g_orig', kind: 'acao', step: 'G6', band: 'gpt', x: GX[4], y: GY0 + PY,
      title: 'Usa o texto original do roteiro',
      subtitle: 'Reprovou, demorou, deu erro, ou sem chave',
      detail: {
        oQueFaz: 'O plano B: o texto do roteiro, sem reescrita.',
        regra: 'Acontece quando a validação reprova, o GPT demora mais de 15 segundos, dá erro, ou não há chave do GPT. O paciente recebe a mensagem do roteiro, que já está correta.',
        exemplo: '"Ah, então é consulta de Cardiologia, né?"',
        seFalhar: 'Sem falha possível: é o texto que o roteiro já produziu.',
        tecnico: 'return texto em amigavel() (humanizer.ts).',
      },
    },
    {
      id: 'g_envia', kind: 'acao', step: 'G7', band: 'gpt', x: GX[5], y: GY0 + PY / 2,
      title: 'Envia ao paciente ou transfere',
      subtitle: 'Mensagem com título de identificação no topo',
      detail: {
        oQueFaz: 'Entrega a mensagem pelo WhatsApp e, nos ramos de transferência, move a conversa para a equipe.',
        regra: 'Toda mensagem sai com um título de identificação na primeira linha (configurável por AGENT_TITLE; o padrão no código é "Amanda (IA) - Nova"). Quando há transferência e o setor Principal está configurado, o atendimento é movido para esse setor levando a mensagem ao paciente e o resumo para a equipe. Sem setor configurado, só avisa o paciente. Em modo sombra (AUTO_REPLY desligado), nada é enviado: só vai para o log.',
        exemplo: 'Amanda (IA) - Nova\nOi, bom dia! Aqui é a Amanda, da Clinex. Me conta o que você precisa?',
        seFalhar: 'Se a Inovstar recusar o envio, o erro fica no log e o paciente fica sem resposta automática; a conversa continua visível para a equipe.',
        tecnico: 'withTitle(), sendText() e transferToSector() em src/agents/receptivo/agent.ts e src/integrations/inovstar.ts. Variáveis AGENT_TITLE, HUMAN_SECTOR_ID, AUTO_REPLY.',
      },
    },

    // ================================================================ REGRAS: ONDE FICAM E QUEM MUDA
    {
      id: 'r_codigo', kind: 'info', step: 'R1', band: 'regras', x: RUL_X + 30, y: RUL_Y + 90,
      title: 'As regras estão no código',
      subtitle: 'Projeto clinex-agents, num repositório git com histórico de mudanças',
      detail: {
        oQueFaz: 'Todo o comportamento da Amanda (etapas, palavras que reconhece, textos das mensagens, travas e transferências) está escrito no código do projeto "clinex-agents".',
        regra: 'O código fica num repositório git: cada mudança é registrada com data, autor e descrição, e pode ser consultada ou desfeita. O que o agente faz hoje é exatamente o que está no código publicado.',
        exemplo: 'Quer trocar a frase "Vou passar para a equipe concluir a sua reserva"? É uma mudança de texto no código do roteiro.',
        seFalhar: 'Uma mudança com erro pode ser desfeita voltando ao registro anterior do repositório.',
        tecnico: 'Repositório clinex-agents (Express + TypeScript, publicado na Vercel).',
      },
    },
    {
      id: 'r_semdb', kind: 'info', step: 'R2', band: 'regras', x: RUL_X + 30 + 310, y: RUL_Y + 90,
      title: 'Não há banco de dados',
      subtitle: 'A conversa vive na Inovstar; os dados vêm do Clinilink na hora',
      detail: {
        oQueFaz: 'O agente não grava nada em banco de dados próprio.',
        regra: 'O histórico da conversa vem da Inovstar a cada mensagem. Unidades, médicos, preços, datas e pacientes são lidos do Clinilink no momento da conversa (somente leitura); agenda e preços ficam guardados na memória por poucos minutos, e a consulta de pacientes nunca é guardada. Este painel também não lê banco nenhum: é um desenho estático, mantido junto do código, que não contém dados de pacientes.',
        exemplo: 'Reiniciar o agente não apaga nada: a "memória" da conversa é o histórico da própria Inovstar.',
        seFalhar: 'Sem falha própria.',
        tecnico: 'Sem banco: estado recalculado em step() a cada mensagem (engine.ts). Cache em memória (memo) em src/integrations/clinilink.ts.',
      },
    },
    {
      id: 'r_mudar', kind: 'info', step: 'R3', band: 'regras', x: RUL_X + 30 + 620, y: RUL_Y + 90,
      title: 'Mudar uma regra exige desenvolvimento e publicação',
      subtitle: 'Altera o código, testa e publica',
      detail: {
        oQueFaz: 'Explica quem pode mudar o comportamento da Amanda e como.',
        regra: 'Qualquer mudança (um texto, uma palavra reconhecida, uma trava, a hora da saudação) exige alterar o código, testar e publicar de novo (deploy na Vercel). Não existe tela de configuração para o texto das mensagens. O que se ajusta sem mexer no código são só opções técnicas (variáveis de ambiente), listadas no botão "Configurações": telefones autorizados, setores, tempo de espera, título da mensagem e chaves de acesso. Este painel precisa ser atualizado junto com a regra, para continuar fiel.',
        exemplo: 'Trocar "Beleza" por outra palavra: o desenvolvimento muda o texto no roteiro, testa e publica. Liberar mais um telefone para testes: ajuste técnico da lista autorizada, sem mudar código.',
        seFalhar: 'Se uma publicação sair com problema, volta-se à versão anterior pelo histórico do repositório.',
        tecnico: 'Fluxo de trabalho: editar o código, rodar npx tsc --noEmit, publicar (git push e deploy na Vercel).',
      },
    },
    {
      id: 'r_tecnico', kind: 'info', step: 'R4', band: 'regras', x: RUL_X + 30, y: RUL_Y + 90 + PY, w: 870,
      title: 'Detalhe técnico: arquivos-fonte das regras',
      subtitle: 'Para o time de desenvolvimento (clique para ver a lista)',
      detail: {
        oQueFaz: 'Lista dos arquivos onde cada parte do fluxo está definida. Serve de mapa para o time de desenvolvimento.',
        regra: 'Cada etapa deste desenho aponta, em "Detalhe técnico", para o arquivo e a função onde está a regra. A lista completa está logo abaixo, no bloco "Detalhe técnico".',
        exemplo: 'Para mudar o texto de uma pergunta da conversa: engine.ts. Para mudar uma palavra que a Amanda reconhece: catalog.ts (RAIZES) ou engine.ts (expressões de alerta).',
        seFalhar: 'Sem falha própria.',
        tecnicoAberto: true,
        tecnico: 'src/agents/receptivo/script/engine.ts: o roteiro (etapas, regras, textos, alertas)\nsrc/agents/receptivo/script/catalog.ts: palavras e sintomas reconhecidos (RAIZES) e catálogo simulado de exemplo\nsrc/agents/receptivo/script/clinilinkFonte.ts: consulta real ao Clinilink (unidades, médicos, preço, períodos, paciente por CPF)\nsrc/lib/humanizer.ts: camada GPT e validação da reescrita\nsrc/agents/receptivo/agent.ts: travas (número, setor, atendente, última mensagem), espera de 4 s, modos, transferência e falha do Clinilink\nsrc/routes/webhooks.ts: entrada dos avisos da Inovstar e conferência da senha\nsrc/integrations/inovstar.ts: histórico, envio e transferência de conversa\nsrc/integrations/clinilink.ts: cliente somente leitura (GET) do Clinilink\ndocs/amanda-prompt-v7.3.md: regras de estilo da Amanda que o roteiro segue\nsrc/panel/: este painel (flow.ts = dados do desenho, page.ts = página, client.ts = comportamento, router.ts = senha)',
      },
    },
  ] as FlowNode[],

  edges: [] as FlowEdge[],

  /** Configurações que mudam o comportamento (apenas nomes e explicação; nunca valores). */
  configuracoes: [
    { nome: 'AGENT_MODE', efeito: 'scripted = roteiro por etapas, sem IA decidindo (padrão e modo atual).' },
    { nome: 'ALLOWED_NUMBERS', efeito: 'Telefones que o agente pode atender. Vazio = não atende ninguém.' },
    { nome: 'AGENT_SECTOR_ID', efeito: 'Setor onde o agente atende. Conversas de outros setores são ignoradas. Vazio = trava desligada.' },
    { nome: 'HUMAN_SECTOR_ID', efeito: 'Setor humano (Principal) para onde o agente transfere. Vazio = só avisa o paciente, sem mover a conversa.' },
    { nome: 'AUTO_REPLY', efeito: 'false = modo sombra (só registra no log, não envia nem transfere). Padrão: ligado.' },
    { nome: 'REPLY_DELAY_MIN_MS / REPLY_DELAY_MAX_MS', efeito: 'A resposta só sai entre 5 e 10 segundos depois da mensagem do paciente, para parecer digitada (o tempo já gasto conta). Mensagens de emergência e crise não esperam. Padrão: 5000 e 10000; 0 desliga.' },
    { nome: 'DEBOUNCE_MS', efeito: 'Quanto o agente espera depois da mensagem do paciente, para agrupar mensagens seguidas. Padrão: 30000 (30 segundos). Emergência e crise respondem em poucos segundos.' },
    { nome: 'AGENT_TITLE', efeito: 'Título em negrito que abre toda mensagem enviada pelo agente. Vazio = sem título.' },
    { nome: 'CLINIC_TZ', efeito: 'Fuso usado na saudação e nas datas. Padrão: America/Sao_Paulo (mesma hora de Belém).' },
    { nome: 'CLINILINK_API_KEY', efeito: 'Chave do Clinilink para CONSULTAR (agenda, preços, pacientes); perfil só de leitura basta. Sem ela, o agente usa o catálogo simulado de exemplo.' },
    { nome: 'CLINIC_HORARIO', efeito: 'Frase com o horário de atendimento da equipe que a Amanda informa quando perguntam. Padrão: segunda a sexta, das 7h às 17h, e sábados das 7h às 11h (o mesmo da resposta automática da clínica).' },
    { nome: 'PIX_KEY', efeito: 'Chave pix que a Amanda envia para o pagamento antecipado. Padrão: clinicaclinex@gmail.com.' },
    { nome: 'PIX_RECEBEDOR', efeito: 'Palavras (separadas por vírgula) que identificam o recebedor no comprovante, no nome ou na chave. Basta uma aparecer. Padrão: clinex. Se o recebedor do comprovante não bater, a conversa vai para a equipe.' },
    { nome: 'CLINILINK_API_KEY_ESCRITA', efeito: 'Chave do Clinilink com perfil de escrita ("rw"), usada somente para cadastrar paciente novo e reservar. Se faltar, usa CLINILINK_API_KEY; com chave só de leitura a reserva é recusada e a conversa vai para a equipe.' },
    { nome: 'OPENAI_API_KEY', efeito: 'Chave do GPT que reescreve o tom. Sem ela, as mensagens saem como o roteiro escreveu.' },
    { nome: 'OPENAI_MODEL', efeito: 'Qual modelo do GPT reescreve o tom. Padrão: gpt-4o-mini.' },
    { nome: 'INOVSTAR_WEBHOOK_SECRET', efeito: 'Senha que confirma que o aviso veio da Inovstar.' },
  ],

  /** Conversas de exemplo, copiadas das respostas reais do roteiro (nomes, CPF e telefone inventados). */
  conversas: [
    {
      id: 'principal',
      titulo: 'Caminho completo (paciente novo)',
      descricao: 'Pede cardiologista, escolhe unidade e data, paga na recepção, informa um CPF novo, faz o cadastro e a reserva é gravada no Clinilink. Exemplo numa quarta-feira, 14 de outubro, às 9h30 (hora de Belém).',
      mensagens: [
        { de: 'paciente', texto: 'Oi, bom dia! Preciso de um cardiologista', etapa: 'entende' },
        { de: 'amanda', texto: 'Oi, bom dia! Aqui é a Amanda, da Clinex. Ah, então é consulta de Cardiologia, né?', etapa: 'sugere' },
        { de: 'paciente', texto: 'sim, é isso', etapa: 'confirma' },
        { de: 'nota', texto: 'Nos bastidores, a Amanda consulta o Clinilink: unidades com agenda, médico de cada uma e preço.', etapa: 'agenda' },
        { de: 'amanda', texto: 'Tenho sim! No Guamá com o Dr. Carlos e no Telégrafo com a Dra. Mariana. A consulta é R$ 200,00.\nQual dos dois fica melhor pra você?', etapa: 'informa' },
        { de: 'paciente', texto: 'Guamá', etapa: 'unidade' },
        { de: 'nota', texto: 'Nos bastidores, a Amanda busca no Clinilink os dias e turnos com vaga a partir de amanhã.', etapa: 'datas' },
        { de: 'amanda', texto: 'Consegui estes aqui:\n1. Quinta, dia 15, de manhã, a partir das 7h\n2. Quinta, dia 15, à tarde, a partir das 13h\n3. Sexta, dia 16, de manhã, a partir das 7h\n4. Sexta, dia 16, à tarde, a partir das 13h\nQual desses fica bom pra você? Se quiser outro dia, me fala que eu vejo.', etapa: 'lista' },
        { de: 'paciente', texto: '2', etapa: 'escolhe' },
        { de: 'amanda', texto: 'Beleza, então fica consulta de Cardiologia no Guamá na quinta (15) à tarde a partir das 13h por ordem de chegada com o Dr. Carlos.\nPra agilizar o seu atendimento na recepção, você quer antecipar o pagamento por pix ou link de crédito?', etapa: 'escolhe' },
        { de: 'paciente', texto: 'na recepção', etapa: 'cpf' },
        { de: 'amanda', texto: 'Sem problema nenhum o pagamento fica pra recepção no dia do atendimento. Me passa o CPF do paciente pra eu reservar?', etapa: 'cpf' },
        { de: 'paciente', texto: '123.456.789-00 (CPF fictício)', etapa: 'consultacpf' },
        { de: 'nota', texto: 'Nos bastidores, a Amanda procura o CPF no Clinilink e não encontra.', etapa: 'consultacpf' },
        { de: 'amanda', texto: 'Esse CPF ainda não tá no cadastro, vou fazer agora. Qual o nome completo do paciente?', etapa: 'cad_nome' },
        { de: 'paciente', texto: 'João Pereira Exemplo', etapa: 'cad_nome' },
        { de: 'amanda', texto: 'Prazer, João! E a data de nascimento? Pode ser dia/mês/ano.', etapa: 'cad_nasc' },
        { de: 'paciente', texto: '10/05/1985', etapa: 'cad_nasc' },
        { de: 'amanda', texto: 'O cadastro pede o sexo: feminino ou masculino?', etapa: 'cad_sexo' },
        { de: 'paciente', texto: 'masculino', etapa: 'cad_sexo' },
        { de: 'amanda', texto: 'E esse número do WhatsApp, posso usar de contato?', etapa: 'cad_tel' },
        { de: 'paciente', texto: 'sim', etapa: 'cad_tel' },
        { de: 'nota', texto: 'Nos bastidores, a Amanda cadastra o paciente novo e reserva o horário de verdade no Clinilink.', etapa: 'conclui' },
        { de: 'amanda', texto: 'Agendamento confirmado! Deu tudo certo, João. Cadastro de João Pereira Exemplo feito. Ficou consulta de Cardiologia no Guamá na quinta, dia 15 de outubro, à tarde com o Dr. Carlos. É por ordem de chegada a partir das 13h então vale chegar cedinho. Estamos te esperando com carinho!', etapa: 'conclui' },
      ],
    },
    {
      id: 'cpfexiste',
      titulo: 'CPF já cadastrado',
      descricao: 'Paciente já existe: a Amanda mostra só o nome para confirmar e conclui a reserva. O paciente escolheu o dia digitando "quinta de manhã".',
      mensagens: [
        { de: 'paciente', texto: 'quero cardiologia', etapa: 'entende' },
        { de: 'amanda', texto: 'Oi, bom dia! Aqui é a Amanda, da Clinex. Entendi, você quer consulta de Cardiologia, é isso?', etapa: 'sugere' },
        { de: 'paciente', texto: 'sim', etapa: 'confirma' },
        { de: 'amanda', texto: 'Tenho sim! No Guamá com o Dr. Carlos e no Telégrafo com a Dra. Mariana. A consulta é R$ 200,00.\nQual dos dois fica melhor pra você?', etapa: 'informa' },
        { de: 'paciente', texto: 'Telégrafo', etapa: 'unidade' },
        { de: 'amanda', texto: 'Consegui estes aqui:\n1. Quinta, dia 15, de manhã, a partir das 7h\n2. Quinta, dia 15, à tarde, a partir das 13h\n3. Sábado, dia 17, de manhã, a partir das 7h\n4. Terça, dia 20, de manhã, a partir das 7h\nQual desses fica bom pra você? Se quiser outro dia, me fala que eu vejo.', etapa: 'lista' },
        { de: 'paciente', texto: 'quinta de manhã', etapa: 'escolhe' },
        { de: 'amanda', texto: 'Show, então fica consulta de Cardiologia no Telégrafo na quinta (15) de manhã a partir das 7h por ordem de chegada com a Dra. Mariana.\nPra agilizar o seu atendimento na recepção, você quer antecipar o pagamento por pix ou link de crédito?', etapa: 'escolhe' },
        { de: 'paciente', texto: 'prefiro pagar lá', etapa: 'cpf' },
        { de: 'amanda', texto: 'Sem problema nenhum o pagamento fica pra recepção no dia do atendimento. Me passa o CPF do paciente pra eu reservar?', etapa: 'cpf' },
        { de: 'paciente', texto: '111.222.333-44 (CPF fictício)', etapa: 'consultacpf' },
        { de: 'amanda', texto: 'Achei aqui o cadastro de Maria da Silva Exemplo. É esse mesmo o paciente?', etapa: 'confirmanome' },
        { de: 'paciente', texto: 'sim', etapa: 'confirmanome' },
        { de: 'amanda', texto: 'Agendamento confirmado! Deu tudo certo, Maria. Ficou consulta de Cardiologia no Telégrafo na quinta, dia 15 de outubro, de manhã com a Dra. Mariana. É por ordem de chegada a partir das 7h então vale chegar cedinho. Estamos te esperando com carinho!', etapa: 'conclui' },
      ],
    },
    {
      id: 'ordemlivre',
      titulo: 'Misturando a ordem (dia, médica e CPF antes da hora)',
      descricao: 'O paciente não segue o roteiro: diz o dia e o período antes do serviço, pede a médica pelo nome depois de ver os horários e já manda o CPF. A Amanda guarda cada coisa e segue, sem perguntar de novo.',
      mensagens: [
        { de: 'paciente', texto: 'quero marcar amanhã de manhã, meu cpf é 111.222.333-44 (CPF fictício)', etapa: 'entende' },
        { de: 'amanda', texto: 'Oi, bom dia! Aqui é a Amanda, da Clinex.\nAnotei quinta dia 15 de manhã. Qual consulta ou exame você precisa?', etapa: 'repete' },
        { de: 'paciente', texto: 'cardiologia', etapa: 'entende' },
        { de: 'amanda', texto: 'Ah, então é consulta de Cardiologia, né?', etapa: 'sugere' },
        { de: 'paciente', texto: 'sim, no guamá', etapa: 'confirma' },
        { de: 'amanda', texto: 'Tenho sim! No Guamá com o Dr. Carlos e a Dra. Beatriz. A consulta é R$ 200,00.\nPra quinta dia 15 tenho:\n1. Quinta, dia 15, de manhã, a partir das 7h, com o Dr. Carlos\n2. Quinta, dia 15, de manhã, a partir das 8h, com a Dra. Beatriz\nQual desses fica bom pra você?', etapa: 'lista' },
        { de: 'paciente', texto: 'na verdade quero com a dra beatriz', etapa: 'escolhe' },
        { de: 'amanda', texto: 'Beleza, vou olhar os horários com a Dra. Beatriz.\nTenho sim! No Guamá. A consulta é R$ 200,00.\nBeleza, então fica consulta de Cardiologia com a Dra. Beatriz no Guamá na quinta (15) de manhã a partir das 8h por ordem de chegada.\nPra agilizar o seu atendimento na recepção, você quer antecipar o pagamento por pix ou link de crédito?', etapa: 'escolhe' },
        { de: 'paciente', texto: 'na recepção', etapa: 'cpf' },
        { de: 'amanda', texto: 'Sem problema nenhum o pagamento fica pra recepção no dia do atendimento.\nAchei aqui o cadastro de Maria da Silva Exemplo. É esse mesmo o paciente?', etapa: 'confirmanome' },
      ],
    },
    {
      id: 'sintoma',
      titulo: 'Pediu por sintoma (dor no coração)',
      descricao: 'O paciente descreve o sintoma. A Amanda sugere o serviço, inclui o aviso de segurança e espera a confirmação.',
      mensagens: [
        { de: 'paciente', texto: 'estou com dor no coração', etapa: 'entende' },
        { de: 'amanda', texto: 'Oi, bom dia! Aqui é a Amanda, da Clinex. Pelo que você contou, o serviço indicado é consulta de Cardiologia. Se a dor estiver forte ou vier com falta de ar, procure agora o pronto-socorro mais próximo ou ligue 192. É isso que você precisa?', etapa: 'sugere' },
      ],
    },
    {
      id: 'emergencia',
      titulo: 'Emergência clínica',
      descricao: 'Sinal de emergência: a Amanda para o roteiro, orienta o pronto-socorro e transfere. Esta mensagem não passa pelo GPT.',
      mensagens: [
        { de: 'paciente', texto: 'estou com dor forte no peito', etapa: 'triagem' },
        { de: 'amanda', texto: 'Pelo que você descreveu, isso precisa de avaliação imediata. Por favor, procure agora o pronto-socorro mais próximo ou ligue 192. A Clinex faz atendimento agendado e não é o lugar certo para uma urgência. Fico à disposição depois, tá bem?', etapa: 'a_emerg' },
        { de: 'nota', texto: 'Nos bastidores, a conversa é transferida para a equipe com a marca PRIORIDADE urgente.', etapa: 'a_emerg' },
      ],
    },
    {
      id: 'humano',
      titulo: 'Pediu atendente humano',
      descricao: 'A Amanda respeita o pedido e passa para a equipe.',
      mensagens: [
        { de: 'paciente', texto: 'quero falar com uma atendente', etapa: 'triagem' },
        { de: 'amanda', texto: 'Oi, bom dia! Aqui é a Amanda, da Clinex.\nClaro! Vou chamar alguém da equipe pra te ajudar. Só um instante.', etapa: 'a_humano' },
      ],
    },
    {
      id: 'naoentendeu',
      titulo: 'Não entendeu o serviço (2 vezes)',
      descricao: 'Na primeira vez a Amanda orienta; na segunda, insiste e lembra que pode chamar a equipe (não transfere sozinha).',
      mensagens: [
        { de: 'paciente', texto: 'blablabla', etapa: 'entende' },
        { de: 'amanda', texto: 'Oi, bom dia! Aqui é a Amanda, da Clinex.\nHmm não peguei qual é o serviço. Me diz a especialidade ou o exame? Pode ser o nome do médico também.', etapa: 'repete' },
        { de: 'paciente', texto: 'xyz qualquer coisa', etapa: 'entende' },
        { de: 'amanda', texto: 'Ainda não consegui entender o que você precisa. Pode me dizer a especialidade (cardiologia, dermatologia, ginecologia, ultrassom...) o nome do exame ou o nome do médico? Se preferir falar com a equipe é só me pedir.', etapa: 'a_naoentendeu' },
      ],
    },
    {
      id: 'semvagadia',
      titulo: 'Sem vaga no dia pedido',
      descricao: 'O paciente pede um dia sem agenda: a Amanda mostra as próximas opções reais.',
      mensagens: [
        { de: 'paciente', texto: 'segunda de manhã (no Telégrafo, depois de escolher o serviço e a unidade)', etapa: 'escolhe' },
        { de: 'amanda', texto: 'Pra segunda dia 19 de manhã não tenho vaga. Mas consegui estes aqui:\n1. Terça, dia 20, de manhã, a partir das 7h\n2. Quinta, dia 22, de manhã, a partir das 7h\n3. Sábado, dia 24, de manhã, a partir das 7h\n4. Terça, dia 27, de manhã, a partir das 7h\nQual desses fica bom pra você?', etapa: 'escolhe' },
      ],
    },
    {
      id: 'cpfnaoconfere',
      titulo: 'CPF não confere',
      descricao: 'O paciente diz que o nome mostrado não é o dele: a Amanda pede o CPF de novo.',
      mensagens: [
        { de: 'amanda', texto: 'Achei aqui o cadastro de Maria da Silva Exemplo. É esse mesmo o paciente?', etapa: 'confirmanome' },
        { de: 'paciente', texto: 'não', etapa: 'confirmanome' },
        { de: 'amanda', texto: 'Sem problema. Dá uma conferida no CPF e me manda de novo?', etapa: 'cpf' },
      ],
    },
  ] as { id: string; titulo: string; descricao: string; mensagens: Conversa[] }[],
};

// ------------------------------------------------------------------ setas (usam as posições dos cartões)
const byId: Record<string, FlowNode> = Object.fromEntries(flow.nodes.map((n) => [n.id, n]));
const wOf = (n: FlowNode) => n.w ?? NW;
const hOf = (n: FlowNode) => n.h ?? NH;
const R = (id: string): [number, number] => { const n = byId[id]; return [n.x + wOf(n), n.y + hOf(n) / 2]; };
const L = (id: string): [number, number] => { const n = byId[id]; return [n.x, n.y + hOf(n) / 2]; };
const B = (id: string): [number, number] => { const n = byId[id]; return [n.x + wOf(n) / 2, n.y + hOf(n)]; };
const T = (id: string): [number, number] => { const n = byId[id]; return [n.x + wOf(n) / 2, n.y]; };

const e = (from: string, to: string, fromSide: FlowEdge['fromSide'], toSide: FlowEdge['toSide'], extra: Partial<FlowEdge> = {}): FlowEdge => ({ from, to, fromSide, toSide, ...extra });
const down = (from: string, to: string, label?: string, extra: Partial<FlowEdge> = {}) => e(from, to, 'b', 't', { label, ...extra });
const side = (from: string, to: string, label?: string, extra: Partial<FlowEdge> = {}) => e(from, to, 'r', 'l', { label, ...extra });

// faixas de aproximação dos alertas (y das linhas horizontais, acima dos cartões de alerta em AY)
const LV = { crise: 738, humano: 750, emerg: 762, naoent: 770, semP4: 756, semP5: 772, falP4: 788, falP6: 772 };
const ax = (i: number) => AX[i] + AW / 2; // centro do cartão de alerta i
const rightOf = (id: string) => R(id)[0];

const edges: FlowEdge[] = [
  // ---- 1 · chegada e travas
  down('chega', 'numero', 'senha ok'),
  side('chega', 's401', 'senha errada', { style: 'stop' }),
  down('numero', 'setor', 'autorizado'),
  side('numero', 'ign_num', 'não está', { style: 'stop' }),
  down('setor', 'espera', 'liberado'),
  side('setor', 'ign_setor', 'não vale', { style: 'stop' }),
  down('espera', 'ultima'),
  side('ultima', 'ign_ultima', 'não é', { style: 'stop' }),
  e('ultima', 'jornada', 'b', 'l', { route: 'poly', via: [[B('ultima')[0], 745], [P2 - 15, 745], [P2 - 15, L('jornada')[1]]], label: 'é a última', labelXY: [B('ultima')[0] + 130, 745] }),

  // ---- 2 · recepção
  down('jornada', 'triagem'),
  down('triagem', 'saudacao', 'nenhum alerta'),
  e('saudacao', 'entende', 'r', 'l'),
  // alertas da triagem (saem juntos, depois se separam)
  e('triagem', 'a_crise', 'r', 't', { style: 'alert', route: 'poly', via: [[rightOf('triagem') + 12, R('triagem')[1]], [rightOf('triagem') + 12, LV.crise], [ax(0), LV.crise]], labelXY: [ax(0) + 62, LV.crise] , label: 'crise' }),
  e('triagem', 'a_emerg', 'r', 't', { style: 'alert', route: 'poly', via: [[rightOf('triagem') + 22, R('triagem')[1]], [rightOf('triagem') + 22, LV.emerg], [ax(1), LV.emerg]], labelXY: [ax(1) - 40, LV.emerg + 0], label: 'emergência' }),
  e('triagem', 'a_humano', 'r', 't', { style: 'alert', route: 'poly', via: [[rightOf('triagem') + 32, R('triagem')[1]], [rightOf('triagem') + 32, LV.humano], [ax(2), LV.humano]], labelXY: [ax(2) - 80, LV.humano], label: 'pediu atendente' }),

  // ---- 3 · o que o paciente precisa
  down('entende', 'sugere', 'reconheceu'),
  side('entende', 'opcoes', 'mais de um'),
  e('entende', 'repete', 'r', 'l', { route: 'poly', via: [[rightOf('entende') + 40, R('entende')[1]], [rightOf('entende') + 40, L('repete')[1]]], label: 'não achou', labelXY: [rightOf('entende') + 40, R('entende')[1] + 70] }),
  e('opcoes', 'sugere', 'b', 'r', { label: 'escolheu' }),
  down('sugere', 'confirma'),
  side('confirma', 'repete', 'não', { labelXY: [rightOf('confirma') + 78, R('confirma')[1]] }),
  e('repete', 'entende', 'r', 't', { route: 'poly', via: [[rightOf('repete') + 16, R('repete')[1]], [rightOf('repete') + 16, 4], [T('entende')[0], 4]], label: 'pergunta de novo', labelXY: [T('entende')[0] + 330, 4] }),
  e('confirma', 'agenda', 'b', 'l', { route: 'poly', via: [[B('confirma')[0], 462], [P4 - 15, 462], [P4 - 15, L('agenda')[1]]], label: 'sim', labelXY: [B('confirma')[0] + 150, 462] }),
  e('repete', 'a_naoentendeu', 'b', 't', { style: 'alert', route: 'poly', via: [[B('repete')[0], LV.naoent], [ax(3), LV.naoent]], label: '2ª vez', labelXY: [B('repete')[0], 620] }),

  // ---- 4 · agenda no Clinilink
  down('agenda', 'preco'),
  down('preco', 'informa'),
  e('informa', 'unidade', 'r', 'l'),
  e('agenda', 'a_semvagas', 'r', 't', { style: 'alert', route: 'poly', via: [[rightOf('agenda') + 12, R('agenda')[1]], [rightOf('agenda') + 12, LV.semP4], [ax(4) - 22, LV.semP4]], label: 'sem agenda', labelXY: [rightOf('agenda') + 12, 560] }),
  e('agenda', 'a_falha', 'r', 't', { style: 'alert', route: 'poly', via: [[rightOf('agenda') + 24, R('agenda')[1]], [rightOf('agenda') + 24, LV.falP4], [ax(5) - 22, LV.falP4]], label: 'Clinilink não responde', labelXY: [rightOf('agenda') + 24 + 150, LV.falP4] }),

  // ---- 5 · unidade, dia e turno
  down('unidade', 'datas'),
  down('datas', 'lista'),
  down('lista', 'escolhe'),
  e('escolhe', 'lista', 'l', 'l', { route: 'poly', via: [[L('escolhe')[0] - 14, L('escolhe')[1]], [L('lista')[0] - 14, L('lista')[1]]], label: 'sem vaga no dia', labelXY: [L('escolhe')[0] - 14, (L('escolhe')[1] + L('lista')[1]) / 2] }),
  e('escolhe', 'cpf', 'r', 'l'),
  e('datas', 'a_semvagas', 'r', 't', { style: 'alert', route: 'poly', via: [[rightOf('datas') + 14, R('datas')[1]], [rightOf('datas') + 14, LV.semP5], [ax(4) + 22, LV.semP5]], label: 'nenhuma data', labelXY: [rightOf('datas') + 14, 444] }),

  // ---- 6 · identificação
  down('cpf', 'consultacpf'),
  down('consultacpf', 'confirmanome', 'achou'),
  e('consultacpf', 'cad_nome', 'r', 'l', { label: 'CPF novo' }),
  e('confirmanome', 'cpf', 'l', 'l', { route: 'poly', via: [[L('confirmanome')[0] - 14, L('confirmanome')[1]], [L('cpf')[0] - 14, L('cpf')[1]]], label: 'não é essa pessoa', labelXY: [L('confirmanome')[0] - 14, 148] }),
  e('confirmanome', 'conclui', 'r', 'l', { route: 'poly', via: [[rightOf('confirmanome') + 22, R('confirmanome')[1]], [rightOf('confirmanome') + 22, 600], [P8 - 22, 600], [P8 - 22, L('conclui')[1]]], label: 'é esse paciente', labelXY: [(rightOf('confirmanome') + P8) / 2, 600] }),
  e('consultacpf', 'a_falha', 'r', 't', { style: 'alert', route: 'poly', via: [[rightOf('consultacpf') + 12, R('consultacpf')[1]], [rightOf('consultacpf') + 12, LV.falP6], [ax(5) + 22, LV.falP6]], label: 'Clinilink não responde', labelXY: [rightOf('consultacpf') + 12, 560] }),

  // ---- 7 · cadastro novo
  down('cad_nome', 'cad_nasc'),
  down('cad_nasc', 'cad_sexo'),
  down('cad_sexo', 'cad_tel'),
  e('cad_tel', 'conclui', 'r', 'l'),

  // ---- 8 · conclusão
  down('conclui', 'equipe', 'modo atual'),
  side('conclui', 'sim_msg', 'só simulação'),
  down('equipe', 'fim_equipe'),
  down('sim_msg', 'fim_sim'),

  // ---- GPT
  side('g_texto', 'g_urg'),
  side('g_urg', 'g_gpt', 'não'),
  side('g_gpt', 'g_valida'),
  side('g_valida', 'g_ok', 'aprovou', { style: 'gpt' }),
  e('g_valida', 'g_orig', 'r', 'l', { label: 'reprovou', style: 'stop' }),
  side('g_ok', 'g_envia', undefined, { style: 'gpt' }),
  e('g_orig', 'g_envia', 'r', 'l'),
  e('g_urg', 'g_envia', 'b', 'b', { style: 'alert', route: 'poly', via: [[B('g_urg')[0], GPT_Y + GPT_H - 28], [B('g_envia')[0], GPT_Y + GPT_H - 28]], label: 'sim: pula o GPT', labelXY: [B('g_urg')[0] + 200, GPT_Y + GPT_H - 28] }),
];

flow.edges = edges;

export type Flow = typeof flow;
