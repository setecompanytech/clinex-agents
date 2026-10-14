/**
 * Fonte ÚNICA do desenho do fluxo do agente receptivo (painel /painel).
 * Tudo aqui é texto estático derivado do código (agent.ts, prompt.ts, inovstar.ts, webhooks.ts, env.ts).
 * NUNCA coloque aqui segredos, tokens, IDs de atendimento/setor ou dados de pacientes.
 * Se o comportamento do agente mudar, atualize este arquivo para o painel continuar fiel.
 */

export type Kind = 'gatilho' | 'trava' | 'leitura' | 'ia' | 'acao' | 'fim';
export type Tone = 'ok' | 'ignorado' | 'erro' | 'sombra';

export type FlowNode = {
  id: string;
  kind: Kind;
  /** número do passo (só passos principais; finais não têm) */
  step?: number;
  title: string;
  /** frase curta exibida no cartão */
  subtitle: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  /** só para kind "fim": cor do final */
  tone?: Tone;
  /** mostra o aviso de que esse passo pode dar erro técnico */
  canFail?: boolean;
  detail: {
    oQueFaz: string;
    regra: string;
    exemplo: string;
    seFalhar: string;
    tecnico?: string;
  };
};

export type FlowEdge = {
  from: string;
  to: string;
  fromSide: 'l' | 'r' | 't' | 'b';
  toSide: 'l' | 'r' | 't' | 'b';
  label?: string;
  /** main = caminho normal; stop = caminho que encerra sem responder */
  style?: 'main' | 'stop';
  /** wrap = contorna por baixo (passagem de uma fase para a próxima) */
  route?: 'wrap';
  /** posição do rótulo ao longo da seta (0 a 1), padrão 0.5 */
  labelAt?: number;
};

export type FlowBand = { id: string; title: string; subtitle: string; x: number; y: number; w: number; h: number };

export const flow = {
  titulo: 'Fluxo do agente receptivo',
  subtitulo: 'Como o agente de IA atende o WhatsApp da clínica, passo a passo. Somente visualização.',
  kinds: [
    { id: 'gatilho', nome: 'Gatilho', descricao: 'O que dá a partida: um evento chega.' },
    { id: 'trava', nome: 'Trava', descricao: 'Uma conferência. Se não passar, o agente fica quieto ou recusa.' },
    { id: 'leitura', nome: 'Leitura', descricao: 'O agente espera ou lê informações da conversa.' },
    { id: 'ia', nome: 'IA', descricao: 'A inteligência artificial pensa e decide.' },
    { id: 'acao', nome: 'Ação', descricao: 'O agente faz algo de verdade (envia, transfere).' },
    { id: 'fim', nome: 'Fim', descricao: 'Onde o caminho termina.' },
  ],
  bands: [
    { id: 'p1', title: '1 · Chegada da mensagem', subtitle: 'A Inovstar avisa e o agente confere o aviso', x: -30, y: -70, w: 655, h: 720 },
    { id: 'p2', title: '2 · Travas de segurança', subtitle: 'Só atende quem e onde deve', x: 660, y: -70, w: 660, h: 720 },
    { id: 'p3', title: '3 · Espera e leitura', subtitle: 'Lê a conversa e vê se ainda precisa responder', x: 1360, y: -70, w: 660, h: 870 },
    { id: 'p4', title: '4 · A IA pensa', subtitle: 'Escreve a resposta ou decide passar para a equipe', x: 2050, y: -70, w: 660, h: 700 },
    { id: 'p5', title: '5 · Ação', subtitle: 'Envia a mensagem ou transfere a conversa', x: 2740, y: -70, w: 1080, h: 830 },
    { id: 'p6', title: 'Regras do prompt', subtitle: 'O que a IA obedece sempre (vale dentro do passo "Claude escreve a resposta")', x: 2050, y: 680, w: 660, h: 400 },
  ] as FlowBand[],

  nodes: [
    // ---------------------------------------------------------------- 1 · CHEGADA
    {
      id: 'webhook', kind: 'gatilho', step: 1, x: 0, y: 0,
      title: 'Mensagem chega do WhatsApp',
      subtitle: 'A Inovstar avisa o agente (evento MESSAGE_RECEIVED)',
      detail: {
        oQueFaz: 'Toda vez que um paciente manda mensagem no WhatsApp da clínica, a Inovstar (a plataforma de atendimento) manda um aviso para o agente. Esse aviso se chama MESSAGE_RECEIVED.',
        regra: 'O aviso chega no endereço /webhooks/inovstar. A Inovstar exige que o agente responda "ok" em até 5 segundos, por isso o agente responde rápido e faz o trabalho pesado depois (passo 4).',
        exemplo: 'Paciente escreve: "Oi, vocês fazem ultrassom?"',
        seFalhar: 'Se o agente estiver fora do ar ou demorar mais de 5 segundos, a Inovstar tenta reenviar o aviso mais tarde. O paciente não recebe nada do agente nesse intervalo, mas a conversa continua visível para a equipe.',
        tecnico: 'POST /webhooks/inovstar — src/routes/webhooks.ts',
      },
    },
    {
      id: 'auth', kind: 'trava', step: 2, x: 0, y: 150,
      title: 'O aviso é mesmo da Inovstar?',
      subtitle: 'Confere a senha do aviso (?key= ou assinatura)',
      detail: {
        oQueFaz: 'Confere se o aviso veio de verdade da Inovstar e não de alguém mal-intencionado tentando fazer o agente falar.',
        regra: 'Passa se acontecer UMA destas duas coisas: (a) o endereço do aviso traz "?key=" com o segredo combinado; ou (b) o aviso vem com a assinatura digital correta no cabeçalho X-InovStar-Signature. Se nenhuma das duas vale, o agente responde 401 ("não autorizado") e para. EXCEÇÃO: reenvios antigos da fila da Inovstar (tentativa 2 ou mais) que chegam SEM "?key=" recebem 200 de "baixa" sem serem processados, só para destravar a fila deles.',
        exemplo: 'Aviso com ".../webhooks/inovstar?key=••••" → passa. Aviso sem chave e sem assinatura → recusado com 401.',
        seFalhar: 'Se a chave configurada na Inovstar estiver errada, TODAS as mensagens são recusadas e o agente não atende ninguém. O log registra "401: key=ausente/errada, assinatura=sim/não, tentativa=..." para ajudar a achar o problema.',
        tecnico: 'Variável INOVSTAR_WEBHOOK_SECRET; assinatura HMAC-SHA256 do corpo, comparada em tempo constante.',
      },
    },
    {
      id: 'f401', kind: 'fim', tone: 'erro', x: 400, y: 70, w: 210, h: 72,
      title: 'Recusado (401)',
      subtitle: 'Aviso sem senha válida',
      detail: {
        oQueFaz: 'O agente recusa o aviso e não faz mais nada com ele.',
        regra: 'Resposta HTTP 401 "não autorizado". Nada é lido, nada é enviado ao paciente.',
        exemplo: 'Alguém tenta chamar o endereço do agente sem a chave: recebe 401.',
        seFalhar: 'Não há o que falhar aqui: é o final do caminho. Só fica uma linha no log.',
      },
    },
    {
      id: 'fdrain', kind: 'fim', tone: 'ignorado', x: 400, y: 215, w: 210, h: 72,
      title: 'Baixa em reenvio antigo',
      subtitle: 'Responde 200 sem processar',
      detail: {
        oQueFaz: 'Dá "baixa" nos avisos antigos que a Inovstar ficou reenviando, para a fila deles andar.',
        regra: 'Vale só quando o aviso NÃO traz "?key=" E é a tentativa 2 ou mais. Responde 200 {drained:true} e não processa a mensagem.',
        exemplo: 'Aviso velho que ficou preso na fila da Inovstar, reenviado pela 3ª vez, sem chave na URL.',
        seFalhar: 'Sem falha possível. Esse caminho existe justamente para evitar que um aviso preso trave os seguintes.',
      },
    },
    {
      id: 'filtro', kind: 'trava', step: 3, x: 0, y: 300,
      title: 'É uma mensagem de paciente?',
      subtitle: 'Ignora outros tipos de aviso',
      detail: {
        oQueFaz: 'Separa o que é mensagem recebida de um paciente do resto dos avisos da Inovstar.',
        regra: 'Só continua se o aviso for do tipo MESSAGE_RECEIVED, com direção "entrada" (paciente para a clínica) e ligado a um atendimento. Mensagens enviadas pela própria clínica e outros tipos de aviso (entregue, lido, etc.) são ignorados.',
        exemplo: 'Ignora: uma mensagem que a atendente acabou de enviar; um aviso de "mensagem lida".',
        seFalhar: 'Responde 200 {ignored:true} e termina. Nada é enviado ao paciente.',
        tecnico: 'parseMessageReceived() — src/integrations/inovstar.ts',
      },
    },
    {
      id: 'fign0', kind: 'fim', tone: 'ignorado', x: 400, y: 330, w: 210, h: 72,
      title: 'Ignorado (200)',
      subtitle: 'Não era mensagem de paciente',
      detail: {
        oQueFaz: 'Encerra sem fazer nada.',
        regra: 'O aviso era de outro tipo ou foi enviado pela própria clínica. O agente responde 200 {ignored:true}.',
        exemplo: 'Aviso de "mensagem entregue".',
        seFalhar: 'Sem falha possível.',
      },
    },
    {
      id: 'ok200', kind: 'acao', step: 4, x: 0, y: 450,
      title: 'Responde "ok" e continua o trabalho',
      subtitle: 'Libera a Inovstar na hora e continua trabalhando',
      detail: {
        oQueFaz: 'Devolve "ok" para a Inovstar imediatamente e continua o atendimento por trás dos panos.',
        regra: 'Responde 200 {ok:true} dentro do limite de 5 segundos e deixa todo o resto (esperar, ler, pensar, responder) rodando em segundo plano. Daqui em diante o paciente ainda não recebeu nada.',
        exemplo: 'A Inovstar recebe "ok" em milissegundos; o agente começa a preparar a resposta.',
        seFalhar: 'Se algo der errado no segundo plano, a Inovstar já recebeu o "ok" e NÃO reenvia. O erro fica apenas no log ("agente falhou") e o paciente fica sem resposta automática.',
        tecnico: 'waitUntil(handleIncoming(...)) — src/routes/webhooks.ts',
      },
      canFail: true,
    },

    // ---------------------------------------------------------------- 2 · TRAVAS
    {
      id: 'white', kind: 'trava', step: 5, x: 680, y: 0,
      title: 'O número está liberado?',
      subtitle: 'Lista de telefones permitidos (fase de testes)',
      detail: {
        oQueFaz: 'Durante a fase de testes, o agente só atende telefones que estão numa lista liberada.',
        regra: 'Compara o telefone do paciente com a lista ALLOWED_NUMBERS usando só o DDD + os 8 últimos dígitos (por isso +55 e o nono dígito não atrapalham). Se a lista estiver VAZIA, o agente não atende ninguém.',
        exemplo: 'Lista com 91 98162-8017: o paciente +55 (91) 98162-8017 passa; qualquer outro número é ignorado.',
        seFalhar: 'Número fora da lista: o agente fica em silêncio (o paciente não recebe nada) e a conversa segue normal com a equipe. Log: "ignorado: número ... fora da whitelist".',
        tecnico: 'Variável ALLOWED_NUMBERS (telefones separados por vírgula).',
      },
    },
    {
      id: 'group', kind: 'trava', step: 6, x: 680, y: 150,
      title: 'É conversa de grupo?',
      subtitle: 'O agente não atende grupos',
      detail: {
        oQueFaz: 'Evita que o agente responda em grupos de WhatsApp.',
        regra: 'Se a mensagem veio de um grupo (tem um autor dentro do grupo), o agente ignora. Só atende conversas individuais.',
        exemplo: 'Mensagem em um grupo de pacientes ou de funcionários: ignorada.',
        seFalhar: 'Fica em silêncio. Log: "ignorado: grupo".',
      },
    },
    {
      id: 'human', kind: 'trava', step: 7, x: 680, y: 300,
      title: 'Já tem atendente humano?',
      subtitle: 'Se um humano assumiu, a IA não atrapalha',
      detail: {
        oQueFaz: 'Respeita o trabalho da equipe: se uma pessoa já está cuidando da conversa, a IA não se mete.',
        regra: 'Se o atendimento tem um atendente atribuído, o agente ignora. EXCEÇÃO: atendimento na fila (status "pending", por exemplo recém transferido para um setor) conta como SEM dono, mesmo que ainda mostre o nome de quem iniciou ou transferiu.',
        exemplo: 'A Juliana assumiu o atendimento do paciente: a IA não responde mais nessa conversa. Conversa parada na fila: a IA pode responder.',
        seFalhar: 'Fica em silêncio. Log: "ignorado: atendimento já tem atendente humano" com o status do atendimento.',
        tecnico: 'isAssigned = (atendente atribuído) e status diferente de "pending".',
      },
    },
    {
      id: 'sector', kind: 'trava', step: 8, x: 680, y: 450,
      title: 'Está no setor da IA?',
      subtitle: 'Só atende o setor "Agente IA"',
      detail: {
        oQueFaz: 'Garante que a IA só atenda conversas que estão no setor dela na Inovstar.',
        regra: 'Se AGENT_SECTOR_ID estiver preenchido, a IA só atende atendimentos desse setor (o setor "Agente IA"). Se estiver vazio, esta trava fica desligada. Quando a IA transfere uma conversa para o setor humano, ela sai do setor da IA e o agente deixa de responder nela. É assim que o "estado" é guardado: não existe banco de dados, quem sabe de quem é a conversa é a própria Inovstar.',
        exemplo: 'Conversa que está no setor "Principal" (humano): a IA ignora. Conversa no setor "Agente IA": a IA atende.',
        seFalhar: 'Fica em silêncio. Log: "ignorado: setor ... != setor da IA".',
        tecnico: 'Variável AGENT_SECTOR_ID (opcional).',
      },
    },
    {
      id: 'fign', kind: 'fim', tone: 'ignorado', x: 1090, y: 210, w: 210, h: 72,
      title: 'Ignorado em silêncio',
      subtitle: 'O paciente não recebe nada da IA',
      detail: {
        oQueFaz: 'O agente simplesmente não responde.',
        regra: 'Acontece quando alguma trava não passou (número fora da lista, grupo, já tem atendente humano ou outro setor). O motivo é gravado no log do sistema.',
        exemplo: 'Log: "[atendimento] ignorado: grupo".',
        seFalhar: 'Sem falha possível. A conversa segue normal na Inovstar, com a equipe.',
      },
    },

    // ---------------------------------------------------------------- 3 · LEITURA
    {
      id: 'debounce', kind: 'leitura', step: 9, x: 1380, y: 0,
      title: 'Espera o paciente terminar de escrever',
      subtitle: 'Pausa curta (DEBOUNCE_MS, padrão 4 segundos)',
      detail: {
        oQueFaz: 'Dá um tempinho para o paciente terminar de digitar antes do agente responder.',
        regra: 'Espera DEBOUNCE_MS milissegundos (padrão 4000 = 4 segundos). Se o paciente mandar várias mensagens picadas, só a ÚLTIMA vai disparar uma resposta (veja o passo 11).',
        exemplo: 'Paciente manda: "Oi" / "tudo bem?" / "queria saber de exame" em poucos segundos. O agente responde uma vez só, depois da última.',
        seFalhar: 'Sem falha possível. Só deixa a resposta alguns segundos mais lenta, de propósito.',
        tecnico: 'Variável DEBOUNCE_MS.',
      },
    },
    {
      id: 'hist', kind: 'leitura', step: 10, x: 1380, y: 150, canFail: true,
      title: 'Lê o histórico da conversa',
      subtitle: 'Busca as últimas mensagens na Inovstar',
      detail: {
        oQueFaz: 'Lê a conversa para entender o contexto: o que o paciente já disse e o que já foi respondido.',
        regra: 'Busca as últimas 30 mensagens do atendimento, em ordem de horário. Entende texto, áudio (usa a transcrição), respostas de botão e legenda de foto/arquivo. Notas internas da equipe (sussurros) e mensagens do sistema são descartadas, a IA não as vê.',
        exemplo: 'Histórico lido: [paciente] "Oi" → [clínica] "Olá! Como posso ajudar?" → [paciente] "Quero saber se fazem ultrassom".',
        seFalhar: 'Se a Inovstar não responder, o agente desiste dessa mensagem e registra "agente falhou" no log. O paciente fica sem resposta automática, mas a equipe continua vendo a conversa.',
        tecnico: 'GET /attendance/{id}/history?limit=30&lightweight=true',
      },
    },
    {
      id: 'nova', kind: 'trava', step: 11, x: 1380, y: 300,
      title: 'Chegou mensagem mais nova?',
      subtitle: 'Só a última mensagem do paciente responde',
      detail: {
        oQueFaz: 'Evita responder duas vezes quando o paciente manda várias mensagens seguidas.',
        regra: 'Se a última mensagem do paciente no histórico NÃO é a que disparou este aviso, o agente desiste: o aviso da mensagem mais nova é quem vai responder, já com tudo lido.',
        exemplo: 'Paciente mandou "Oi" e, 2 segundos depois, "queria um orçamento". O aviso do "Oi" desiste; o do "queria um orçamento" responde.',
        seFalhar: 'Fica em silêncio nesse aviso (o outro aviso cuida da resposta). Log: "chegou mensagem mais nova".',
      },
    },
    {
      id: 'saida', kind: 'trava', step: 12, x: 1380, y: 450,
      title: 'Alguém já respondeu?',
      subtitle: 'Evita responder em cima de outra resposta',
      detail: {
        oQueFaz: 'Impede resposta duplicada quando uma pessoa (ou outro robô) já respondeu.',
        regra: 'Se a última mensagem da conversa é de SAÍDA (enviada pela clínica: humano, robô ou o próprio agente) e não é nota interna, o agente não responde de novo.',
        exemplo: 'O paciente perguntou e, enquanto o agente esperava, uma atendente já respondeu: a IA fica quieta.',
        seFalhar: 'Fica em silêncio. Log: "última mensagem já é de saída".',
      },
    },
    {
      id: 'turnos', kind: 'trava', step: 13, x: 1380, y: 600,
      title: 'Há uma pergunta do paciente para responder?',
      subtitle: 'Monta a conversa e confere a última fala',
      detail: {
        oQueFaz: 'Organiza a conversa como um diálogo (paciente e assistente) e confere se realmente há algo do paciente esperando resposta.',
        regra: 'Junta mensagens seguidas do mesmo lado em uma só, tira do começo qualquer fala da "assistente" e exige que a ÚLTIMA fala seja do paciente. Se não houver nenhuma fala do paciente para responder, o agente desiste.',
        exemplo: 'Conversa [paciente] "Bom dia" + [paciente] "Tem vaga hoje?" vira uma única fala do paciente: "Bom dia / Tem vaga hoje?".',
        seFalhar: 'Fica em silêncio. Log: "sem turno do paciente para responder".',
        tecnico: 'describe() transforma cada mensagem em texto; mídia sem texto vira "[tipo]".',
      },
    },
    {
      id: 'fign2', kind: 'fim', tone: 'ignorado', x: 1790, y: 420, w: 210, h: 72,
      title: 'Ignorado: nada a responder',
      subtitle: 'Outra mensagem ou outra pessoa cuida',
      detail: {
        oQueFaz: 'O agente não responde porque não há o que responder agora.',
        regra: 'Acontece quando chegou mensagem mais nova, quando alguém já respondeu, ou quando não há fala do paciente esperando resposta.',
        exemplo: 'Log: "[atendimento] ignorado: última mensagem já é de saída (text); não duplica".',
        seFalhar: 'Sem falha possível. Nada é enviado.',
      },
    },

    // ---------------------------------------------------------------- 4 · IA
    {
      id: 'chave', kind: 'trava', step: 14, x: 2072, y: 0,
      title: 'A IA está ligada?',
      subtitle: 'Existe chave da Anthropic (Claude)?',
      detail: {
        oQueFaz: 'Decide entre responder de verdade com IA ou apenas fazer um teste com texto fixo.',
        regra: 'Se existe a chave ANTHROPIC_API_KEY, usa o Claude. Se a chave está vazia, entra em MODO TESTE: não chama a IA, só prova que o caminho todo funciona (receber, ler, enviar).',
        exemplo: 'Ambiente de testes sem chave: sempre a mesma resposta fixa. Produção com chave: resposta feita pela IA.',
        seFalhar: 'Não falha: é só uma conferência de configuração.',
        tecnico: 'Variável ANTHROPIC_API_KEY (o painel nunca mostra o valor).',
      },
    },
    {
      id: 'teste', kind: 'ia', x: 2372, y: 0,
      title: 'Modo teste: texto fixo',
      subtitle: 'Sem IA, responde sempre o mesmo texto',
      detail: {
        oQueFaz: 'Usa um texto pronto no lugar da resposta da IA, só para validar o encanamento.',
        regra: 'A resposta é o texto de TEST_REPLY. O agente também registra no log quantos turnos leu e a última fala do paciente.',
        exemplo: 'Padrão: "Olá! Aqui é o assistente virtual da Clinex. Recebi sua mensagem e a equipe já vai te responder. (teste)"',
        seFalhar: 'Sem falha própria: a falha, se houver, acontece no envio (passo 19).',
        tecnico: 'Variável TEST_REPLY.',
      },
    },
    {
      id: 'claude', kind: 'ia', step: 15, x: 2072, y: 150, canFail: true,
      title: 'Claude escreve a resposta',
      subtitle: 'A IA lê a conversa e as regras do prompt',
      detail: {
        oQueFaz: 'Envia a conversa para o Claude (IA da Anthropic), junto com as instruções da clínica, e recebe de volta uma resposta pronta ou a decisão de passar para a equipe.',
        regra: 'O Claude recebe: (1) as regras do prompt (veja o bloco "Regras do prompt"), (2) o nome da clínica, a persona e a BASE DE CONHECIMENTO, e (3) a conversa. Ele só pode responder com base nessa base de conhecimento. Se base de conhecimento estiver vazia, ele transfere qualquer dúvida. Limite de ~600 tokens por resposta (mensagens curtas). Ele pode devolver texto OU acionar a ferramenta "transferir_para_humano" (com um resumo e a mensagem de aviso ao paciente).',
        exemplo: 'Paciente: "Quanto custa a ressonância?" → se o preço não está na base: "Vou confirmar esse valor com a nossa equipe e já te retorno!" e transfere para a equipe.',
        seFalhar: 'Se a chamada à IA der erro (chave inválida, serviço fora do ar, etc.), o agente registra "agente falhou" no log e o paciente fica sem resposta automática.',
        tecnico: 'POST api.anthropic.com/v1/messages — modelo AGENT_MODEL (padrão claude-sonnet-5-5); instruções em src/agents/receptivo/prompt.ts; dados da clínica em CLINIC_NAME, CLINIC_PERSONA e CLINIC_KNOWLEDGE.',
      },
    },
    {
      id: 'ramo', kind: 'ia', step: 16, x: 2072, y: 300,
      title: 'O que a IA decidiu?',
      subtitle: 'Responder, passar para a equipe ou nada',
      detail: {
        oQueFaz: 'Lê o que a IA devolveu e escolhe o caminho.',
        regra: 'Se a IA acionou "transferir_para_humano" → vai para a transferência (usa a mensagem de aviso da IA; se ela veio vazia, usa o texto). Senão, se ela escreveu texto → responde por texto. Se não devolveu nada → o agente não faz nada.',
        exemplo: 'Texto: "Temos atendimento de segunda a sexta. Quer que eu ajude com algo mais?". Transferência: motivo "Maria quer remarcar a consulta de quinta".',
        seFalhar: 'Se a IA não devolver texto nem transferência, o agente ignora (log: "modelo não devolveu texto").',
      },
    },
    {
      id: 'vazio', kind: 'fim', tone: 'ignorado', x: 2097, y: 480, w: 210, h: 72,
      title: 'Ignorado: IA sem texto',
      subtitle: 'O modelo não devolveu nada',
      detail: {
        oQueFaz: 'Encerra sem responder.',
        regra: 'Acontece quando a IA não devolve texto nem pede transferência.',
        exemplo: 'Log: "ignorado: modelo não devolveu texto".',
        seFalhar: 'Sem falha possível. O paciente não recebe nada e a conversa segue com a equipe.',
      },
    },

    // ---------------------------------------------------------------- 5 · AÇÃO
    {
      id: 'sombra_txt', kind: 'trava', step: 17, x: 2780, y: 300,
      title: 'Modo sombra ligado?',
      subtitle: 'AUTO_REPLY=false só registra no log',
      detail: {
        oQueFaz: 'Chave de segurança para testar o agente sem que ele fale de verdade com o paciente.',
        regra: 'Com AUTO_REPLY=false (MODO SOMBRA) o agente lê, decide e escreve a resposta, mas só a registra no log: NÃO envia nada e NÃO transfere. Com AUTO_REPLY ligado (o padrão), envia de verdade.',
        exemplo: 'Na primeira semana, deixe em modo sombra, leia os logs e confira se as respostas estão boas antes de liberar para o paciente.',
        seFalhar: 'Sem falha possível. Em modo sombra, a única coisa visível é o log: "resposta -> ...".',
        tecnico: 'Variável AUTO_REPLY (false = modo sombra). A mesma regra vale para o texto e para a transferência.',
      },
    },
    {
      id: 'sombra_tr', kind: 'trava', step: 18, x: 2780, y: 450,
      title: 'Modo sombra ligado?',
      subtitle: 'Mesma regra, agora para a transferência',
      detail: {
        oQueFaz: 'A mesma chave de segurança do passo anterior, aplicada à transferência.',
        regra: 'Com AUTO_REPLY=false o agente só registra no log o que transferiria ("transferir -> motivo | mensagem") e não toca na conversa. Com AUTO_REPLY ligado, executa a transferência.',
        exemplo: 'Em modo sombra, o log mostra: "transferir -> Maria quer remarcar a consulta | ...", mas nada muda na Inovstar.',
        seFalhar: 'Sem falha possível.',
        tecnico: 'Variável AUTO_REPLY.',
      },
    },
    {
      id: 'send', kind: 'acao', step: 19, x: 3200, y: 150, canFail: true,
      title: 'Envia a resposta ao paciente',
      subtitle: 'Mensagem de texto pelo WhatsApp',
      detail: {
        oQueFaz: 'Manda a resposta para o paciente no WhatsApp, dentro da mesma conversa.',
        regra: 'Toda mensagem do agente começa com um título em negrito (AGENT_TITLE, por padrão "AMANDA IA - Teste") numa linha própria, para o paciente e a equipe saberem que é a IA falando. Cada envio carrega um código único ligado à mensagem do paciente ("agente-receptivo-<id da mensagem>"), que impede a Inovstar de enviar a mesma resposta duas vezes.',
        exemplo: '*AMANDA IA - Teste*\nOlá! Posso te ajudar com informações sobre nossos exames. Qual exame você procura?',
        seFalhar: 'Se o envio falhar, o erro vai para o log ("agente falhou") e o paciente não recebe a resposta. O agente não tenta de novo sozinho; a próxima mensagem do paciente dispara um novo ciclo.',
        tecnico: 'POST /whatsapp/send/text. Título: variável AGENT_TITLE (vazio = sem título).',
      },
    },
    {
      id: 'transfer', kind: 'acao', step: 20, x: 3200, y: 450, canFail: true,
      title: 'Transfere para a equipe (setor Principal)',
      subtitle: 'Avisa o paciente e passa a conversa para a fila humana',
      detail: {
        oQueFaz: 'Entrega a conversa para a equipe humana e avisa o paciente na mesma ação.',
        regra: 'Move o atendimento para o setor humano (HUMAN_SECTOR_ID, o setor Principal) levando um RESUMO para o atendente (quem é, o que quer, o que já foi dito; até 500 caracteres) e a mensagem de aviso ao paciente, que também começa com o título da IA. Depois disso a conversa sai do setor da IA e o agente para de responder nela.',
        exemplo: 'Aviso ao paciente: "*AMANDA IA - Teste*\nMaria, vou passar você para a nossa equipe que cuida de remarcações. Em instantes alguém te responde!". Resumo ao atendente: "Maria quer remarcar a consulta de quinta."',
        seFalhar: 'Se a transferência falhar, o erro vai para o log e NADA muda: a conversa continua no setor da IA e o paciente não recebe o aviso. Vale conferir o log.',
        tecnico: 'PUT /attendance/{id}/transfer com setor de destino, motivo e mensagem. Variável HUMAN_SECTOR_ID.',
      },
    },
    {
      id: 'fallback', kind: 'acao', step: 21, x: 3200, y: 600, canFail: true,
      title: 'Sem setor configurado: só avisa',
      subtitle: 'Manda o aviso, mas a conversa não muda de lugar',
      detail: {
        oQueFaz: 'Plano B quando o setor humano não foi configurado.',
        regra: 'Se HUMAN_SECTOR_ID estiver vazio, o agente só envia a mensagem de aviso ao paciente (com o título da IA). A conversa NÃO é movida de setor, então a IA continua atendendo as próximas mensagens do paciente. O resumo para o atendente fica só no log.',
        exemplo: 'O paciente pediu um humano; recebe "vou passar para a equipe", mas na prática a IA ainda responderá se ele escrever de novo.',
        seFalhar: 'Mesmo comportamento do envio: o erro vai para o log e o paciente não recebe o aviso.',
        tecnico: 'POST /whatsapp/send/text (porque HUMAN_SECTOR_ID está vazio).',
      },
    },
    {
      id: 'fshadow', kind: 'fim', tone: 'sombra', x: 3200, y: 330, w: 210, h: 72,
      title: 'Modo sombra: só registra',
      subtitle: 'Nada foi enviado nem transferido',
      detail: {
        oQueFaz: 'O agente pensou e decidiu, mas só guardou no log.',
        regra: 'Acontece quando AUTO_REPLY=false. O texto da resposta ou o motivo da transferência aparece apenas no log do sistema.',
        exemplo: 'Log: "[atendimento] resposta -> Olá! Posso te ajudar..."',
        seFalhar: 'Sem falha possível. É o modo seguro para testar.',
      },
    },
    {
      id: 'fok', kind: 'fim', tone: 'ok', x: 3560, y: 160, w: 210, h: 72,
      title: 'Paciente recebeu a resposta',
      subtitle: 'Fim do ciclo desta mensagem',
      detail: {
        oQueFaz: 'A resposta chegou no WhatsApp do paciente.',
        regra: 'A conversa continua no setor da IA. Se o paciente responder, tudo recomeça no passo 1.',
        exemplo: 'O paciente vê a mensagem da IA e responde com uma nova pergunta.',
        seFalhar: 'Sem falha: final feliz.',
      },
    },
    {
      id: 'fhand', kind: 'fim', tone: 'ok', x: 3560, y: 460, w: 210, h: 72,
      title: 'Conversa foi para a equipe',
      subtitle: 'Cai na fila do setor humano',
      detail: {
        oQueFaz: 'A equipe humana assume a partir daqui.',
        regra: 'A conversa aparece na fila do setor Principal com o resumo do motivo. A IA não responde mais nela, porque saiu do setor da IA.',
        exemplo: 'A atendente abre a fila do Principal e vê: "Maria quer remarcar a consulta de quinta".',
        seFalhar: 'Sem falha: final feliz.',
      },
    },
    {
      id: 'fcont', kind: 'fim', tone: 'erro', x: 3560, y: 610, w: 210, h: 72,
      title: 'Paciente avisado, IA continua',
      subtitle: 'Conversa não saiu do setor da IA',
      detail: {
        oQueFaz: 'Mostra a consequência do plano B: o paciente foi avisado, mas a conversa não mudou de lugar.',
        regra: 'Sem HUMAN_SECTOR_ID a conversa continua no setor da IA e sem atendente, então o agente pode responder a próxima mensagem. Configure o setor humano para a transferência valer de verdade.',
        exemplo: 'O paciente escreve de novo e a IA responde, mesmo tendo dito que passaria para a equipe.',
        seFalhar: 'Não é uma falha técnica, é uma configuração incompleta.',
      },
    },

    // ---------------------------------------------------------------- REGRAS DO PROMPT
    {
      id: 'r_inventar', kind: 'ia', x: 2080, y: 760, w: 290, h: 84,
      title: 'Nunca inventar nada',
      subtitle: 'Preço, horário, convênio, preparo e endereço: só o que está na base',
      detail: {
        oQueFaz: 'Impede a IA de "chutar" informações importantes.',
        regra: 'A IA NUNCA inventa preços, horários, convênios, preparos ou endereços. Só usa a base de conhecimento. Se a informação não estiver lá, diz que vai confirmar com a equipe e usa a ferramenta de transferência.',
        exemplo: 'Paciente: "Quanto custa o hemograma?" (preço fora da base) → "Vou confirmar esse valor com a nossa equipe e já te respondo!" + transferência.',
        seFalhar: 'Se a base de conhecimento estiver incompleta, a IA transfere mais conversas do que o ideal. Completar a base reduz as transferências.',
        tecnico: 'src/agents/receptivo/prompt.ts',
      },
    },
    {
      id: 'r_urgencia', kind: 'ia', x: 2390, y: 760, w: 290, h: 84,
      title: 'Urgência: SAMU 192 e equipe',
      subtitle: 'Dor forte, falta de ar: orienta pronto-socorro e transfere',
      detail: {
        oQueFaz: 'Protege o paciente em situação de risco.',
        regra: 'Em caso de urgência ou emergência (dor forte, falta de ar, etc.), a IA orienta procurar um pronto-socorro ou ligar para o SAMU 192 e TRANSFERE a conversa para a equipe.',
        exemplo: '"Sinto muito que você esteja assim. Isso pode ser urgente: procure um pronto-socorro ou ligue para o SAMU 192 agora. Já avisei nossa equipe."',
        seFalhar: 'A IA depende de reconhecer a urgência no texto. Casos ambíguos podem passar; por isso a equipe deve acompanhar a fila.',
        tecnico: 'src/agents/receptivo/prompt.ts',
      },
    },
    {
      id: 'r_diag', kind: 'ia', x: 2080, y: 860, w: 290, h: 84,
      title: 'Sem diagnóstico nem remédio',
      subtitle: 'Não interpreta exame nem orienta medicação',
      detail: {
        oQueFaz: 'Mantém a IA dentro do que ela pode fazer com segurança.',
        regra: 'A IA nunca dá diagnóstico, nunca interpreta resultado de exame e nunca orienta medicação.',
        exemplo: 'Paciente: "Meu exame deu alterado, o que é isso?" → a IA explica que quem pode orientar é a equipe/médico e encaminha.',
        seFalhar: 'Sem falha técnica. Se a IA escorregar, o texto aparece no histórico e pode ser corrigido ajustando o prompt.',
        tecnico: 'src/agents/receptivo/prompt.ts',
      },
    },
    {
      id: 'r_humano', kind: 'ia', x: 2390, y: 860, w: 290, h: 84,
      title: 'Agendar, remarcar, cancelar, reclamar, resultado: equipe',
      subtitle: 'Coleta o nome e o que a pessoa quer, e transfere',
      detail: {
        oQueFaz: 'Define o que a IA NÃO resolve sozinha.',
        regra: 'Para agendar, remarcar, cancelar, reclamar, pedir resultado ou qualquer coisa fora do que ela consegue resolver: a IA coleta o nome e o que a pessoa deseja e usa a transferência com um resumo claro para o atendente.',
        exemplo: 'Paciente: "Quero marcar uma consulta" → a IA pergunta o nome e o que precisa, e transfere: "Carlos quer marcar consulta de cardiologia".',
        seFalhar: 'Sem falha técnica. Se a IA tentar resolver algo dessa lista sozinha, vale reforçar a regra no prompt.',
        tecnico: 'Ferramenta transferir_para_humano (motivo + mensagem ao paciente).',
      },
    },
    {
      id: 'r_pedido', kind: 'ia', x: 2080, y: 960, w: 290, h: 84,
      title: 'Pediu uma pessoa: transfere já',
      subtitle: 'Pedido explícito de falar com humano',
      detail: {
        oQueFaz: 'Respeita o desejo do paciente de falar com uma pessoa.',
        regra: 'Se o paciente pedir explicitamente para falar com um humano, a IA transfere imediatamente, sem insistir em continuar.',
        exemplo: 'Paciente: "Quero falar com uma atendente." → transferência imediata.',
        seFalhar: 'Sem falha técnica.',
        tecnico: 'src/agents/receptivo/prompt.ts',
      },
    },
    {
      id: 'r_estilo', kind: 'ia', x: 2390, y: 960, w: 290, h: 84,
      title: 'Estilo e sigilo',
      subtitle: 'Cordial, curta, uma pergunta por vez, sem revelar instruções',
      detail: {
        oQueFaz: 'Define o jeito de falar da IA.',
        regra: 'Português do Brasil, cordial e objetiva, mensagens curtas estilo WhatsApp, sem listas longas, no máximo um emoji ocasional, uma pergunta por vez. Nunca revela que existem instruções internas.',
        exemplo: '"Oi! Posso te ajudar com isso. Você já tem pedido médico?"',
        seFalhar: 'Sem falha técnica. O tom pode ser ajustado em CLINIC_PERSONA.',
        tecnico: 'src/agents/receptivo/prompt.ts; instruções extras da clínica em CLINIC_PERSONA.',
      },
    },
  ] as FlowNode[],

  edges: [
    // 1 · chegada
    { from: 'webhook', to: 'auth', fromSide: 'b', toSide: 't' },
    { from: 'auth', to: 'filtro', fromSide: 'b', toSide: 't', label: 'senha ok' },
    { from: 'auth', to: 'f401', fromSide: 'r', toSide: 'l', style: 'stop', label: 'sem senha válida', labelAt: 0.45 },
    { from: 'auth', to: 'fdrain', fromSide: 'r', toSide: 'l', style: 'stop', label: 'reenvio antigo sem ?key=', labelAt: 0.5 },
    { from: 'filtro', to: 'ok200', fromSide: 'b', toSide: 't', label: 'é do paciente' },
    { from: 'filtro', to: 'fign0', fromSide: 'r', toSide: 'l', style: 'stop', label: 'outro tipo de aviso' },
    { from: 'ok200', to: 'white', fromSide: 'b', toSide: 'l', route: 'wrap', labelAt: 0.3 },
    // 2 · travas
    { from: 'white', to: 'group', fromSide: 'b', toSide: 't', label: 'liberado' },
    { from: 'group', to: 'human', fromSide: 'b', toSide: 't', label: 'não é grupo' },
    { from: 'human', to: 'sector', fromSide: 'b', toSide: 't', label: 'sem atendente' },
    { from: 'white', to: 'fign', fromSide: 'r', toSide: 'l', style: 'stop', label: 'fora da lista', labelAt: 0.4 },
    { from: 'group', to: 'fign', fromSide: 'r', toSide: 'l', style: 'stop', label: 'é grupo', labelAt: 0.4 },
    { from: 'human', to: 'fign', fromSide: 'r', toSide: 'l', style: 'stop', label: 'tem atendente', labelAt: 0.4 },
    { from: 'sector', to: 'fign', fromSide: 'r', toSide: 'l', style: 'stop', label: 'outro setor', labelAt: 0.4 },
    { from: 'sector', to: 'debounce', fromSide: 'b', toSide: 'l', route: 'wrap', label: 'setor da IA', labelAt: 0.3 },
    // 3 · leitura
    { from: 'debounce', to: 'hist', fromSide: 'b', toSide: 't' },
    { from: 'hist', to: 'nova', fromSide: 'b', toSide: 't' },
    { from: 'nova', to: 'saida', fromSide: 'b', toSide: 't', label: 'é a mais nova' },
    { from: 'saida', to: 'turnos', fromSide: 'b', toSide: 't', label: 'ninguém respondeu' },
    { from: 'nova', to: 'fign2', fromSide: 'r', toSide: 'l', style: 'stop', label: 'tem mais nova', labelAt: 0.4 },
    { from: 'saida', to: 'fign2', fromSide: 'r', toSide: 'l', style: 'stop', label: 'já respondida', labelAt: 0.4 },
    { from: 'turnos', to: 'fign2', fromSide: 'r', toSide: 'l', style: 'stop', label: 'sem pergunta', labelAt: 0.4 },
    { from: 'turnos', to: 'chave', fromSide: 'b', toSide: 'l', route: 'wrap', label: 'há pergunta', labelAt: 0.3 },
    // 4 · IA
    { from: 'chave', to: 'claude', fromSide: 'b', toSide: 't', label: 'com chave' },
    { from: 'chave', to: 'teste', fromSide: 'r', toSide: 'l', label: 'sem chave' },
    { from: 'claude', to: 'ramo', fromSide: 'b', toSide: 't' },
    { from: 'ramo', to: 'vazio', fromSide: 'b', toSide: 't', style: 'stop', label: 'nada' },
    { from: 'ramo', to: 'sombra_txt', fromSide: 'r', toSide: 'l', label: 'texto', labelAt: 0.5 },
    { from: 'ramo', to: 'sombra_tr', fromSide: 'r', toSide: 'l', label: 'transferir_para_humano', labelAt: 0.55 },
    { from: 'teste', to: 'sombra_txt', fromSide: 'b', toSide: 't' },
    // 5 · ação
    { from: 'sombra_txt', to: 'send', fromSide: 'r', toSide: 'l', label: 'normal', labelAt: 0.5 },
    { from: 'sombra_txt', to: 'fshadow', fromSide: 'r', toSide: 'l', style: 'stop', label: 'modo sombra', labelAt: 0.45 },
    { from: 'sombra_tr', to: 'transfer', fromSide: 'r', toSide: 'l', label: 'normal + setor', labelAt: 0.5 },
    { from: 'sombra_tr', to: 'fallback', fromSide: 'r', toSide: 'l', label: 'normal, sem setor', labelAt: 0.5 },
    { from: 'sombra_tr', to: 'fshadow', fromSide: 'r', toSide: 'l', style: 'stop', label: 'modo sombra', labelAt: 0.45 },
    { from: 'send', to: 'fok', fromSide: 'r', toSide: 'l' },
    { from: 'transfer', to: 'fhand', fromSide: 'r', toSide: 'l' },
    { from: 'fallback', to: 'fcont', fromSide: 'r', toSide: 'l' },
  ] as FlowEdge[],

  /** Configurações que mudam o comportamento (apenas nomes e explicação; nunca valores). */
  configuracoes: [
    { nome: 'ALLOWED_NUMBERS', efeito: 'Telefones que o agente pode atender. Vazio = não atende ninguém.' },
    { nome: 'AGENT_SECTOR_ID', efeito: 'Setor onde a IA atende. Conversas de outros setores são ignoradas. Vazio = trava desligada.' },
    { nome: 'HUMAN_SECTOR_ID', efeito: 'Setor humano (Principal) para onde a IA transfere. Vazio = só avisa o paciente, sem mover a conversa.' },
    { nome: 'AUTO_REPLY', efeito: 'false = modo sombra (só registra no log). Padrão: ligado.' },
    { nome: 'DEBOUNCE_MS', efeito: 'Quanto o agente espera antes de responder. Padrão: 4000 (4 segundos).' },
    { nome: 'ANTHROPIC_API_KEY', efeito: 'Chave da IA (Claude). Vazia = modo teste com texto fixo.' },
    { nome: 'AGENT_MODEL', efeito: 'Qual modelo de IA responde. Padrão: claude-sonnet-5-5.' },
    { nome: 'TEST_REPLY', efeito: 'Texto fixo usado no modo teste.' },
    { nome: 'AGENT_TITLE', efeito: 'Título em negrito que abre toda mensagem enviada pelo agente. Vazio = sem título.' },
    { nome: 'CLINIC_NAME / CLINIC_PERSONA', efeito: 'Nome da clínica e instruções de tom de voz usadas pela IA.' },
    { nome: 'CLINIC_KNOWLEDGE', efeito: 'Base de conhecimento (serviços, convênios, endereço, horários). A IA só responde com base nela.' },
    { nome: 'INOVSTAR_WEBHOOK_SECRET', efeito: 'Segredo que confirma que o aviso veio da Inovstar.' },
  ],
};

export type Flow = typeof flow;
