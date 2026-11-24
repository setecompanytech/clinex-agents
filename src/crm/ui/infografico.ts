// JavaScript do CRM (navegador): o "!" de cada gráfico. Um clique abre uma janela que explica o que o gráfico mostra, como ler,
// de onde vem o número e como ele é calculado. O texto de cada gráfico fica em INFO, procurado pelo título do cartão (blocoCartao).
// Dentro dele não usar crases nem "dollar-chave".
export const infoUi = String.raw`
var INFO = {};
var INFO_ORIGEM_LEADS = 'Os leads do CRM: cada orçamento aberto do Clinilink vira um lead (mais os cadastrados à mão). O histórico de cada lead guarda os contatos, respostas, agendamentos, comparecimentos e descartes, e é dele que sai o número. Nada é estimado.';
var INFO_ORIGEM_CARDS = 'Os cards dos Pipelines (orçamentos abertos e faltas vindos do Clinilink). Cada movimento de coluna fica no histórico do card, com quem fez e quando.';
var INFO_ORIGEM_IA = 'Os contatos de WhatsApp enviados pela IA de disparo (marcados como automáticos no histórico do lead) e o que aconteceu depois com cada paciente: respostas, agendamentos, comparecimentos e cards recuperados. Só entram envios reais (nada de simulação ou sombra).';
var INFO_REGRA_IA = 'Uma mensagem conta como respondida se o paciente respondeu em até 72 horas e antes da próxima mensagem da IA. Agendamento e conversão são da IA quando acontecem em até 14 dias depois de uma mensagem dela; o crédito vai para a última mensagem da IA antes do resultado.';

function I(titulos, o, c, f, a) { titulos.forEach(function (t) { INFO[infoChave(t)] = { o: o, c: c, f: f, a: a }; }); }
function infoChave(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function infoDe(titulo) {
  var k = infoChave(titulo);
  if (INFO[k]) return INFO[k];
  if (/^quando .+ faz contato$/.test(k)) return INFO[infoChave('Quando contata')];
  var achou = null;
  Object.keys(INFO).forEach(function (x) { if (!achou && k.indexOf(x) === 0) achou = INFO[x]; });
  return achou;
}

/* ---------------------------------------------------------------- IA Performance */
I(['Receita recuperada'],
  'O dinheiro que a IA trouxe de volta no período: pacientes que pagaram depois de uma mensagem dela.',
  'O número grande é o total. Ao lado, ele se divide em orçamentos recuperados, no-show recuperado e o que ainda está a receber (agendado pela IA, sem pagamento). A variação compara com o período anterior de mesmo tamanho.',
  INFO_ORIGEM_IA + ' Receita recuperada soma quem compareceu e pagou depois de uma mensagem da IA e os no-show que a equipe levou para Recuperado depois do convite. Cada paciente conta uma vez, pelo valor do orçamento (ou do card).',
  INFO_REGRA_IA + ' O A receber é o valor de quem a IA agendou e ainda não pagou: pode virar receita ou não.');
I(['Mensagens, respostas e conversões'],
  'Quantas mensagens a IA enviou, quantas tiveram resposta e quantos pacientes converteram, dia a dia.',
  'A distância entre a linha de enviadas e a de respostas é o que ficou sem resposta. A linha verde, bem mais baixa, são os pacientes que compareceram e pagaram. Procure dias em que as respostas sobem junto com os envios e dias em que sobem sem os envios (respostas de mensagens de dias anteriores).',
  INFO_ORIGEM_IA + ' Cada ponto é um dia (ou uma semana, quando o período passa de 31 dias). Enviadas são contadas no dia do envio; respostas, no dia do envio da mensagem que foi respondida; convertidos, no dia em que o paciente compareceu e pagou.',
  INFO_REGRA_IA + ' Dias sem envio aparecem como zero.');
I(['Taxa de resposta'],
  'De cada 100 mensagens da IA, quantas receberam resposta, ao longo do tempo.',
  'Quanto mais alta, mais os pacientes reagem. Oscilações em dias com poucos envios são normais: olhe a tendência, não um ponto isolado.',
  INFO_ORIGEM_IA + ' Cálculo de cada ponto: mensagens respondidas ÷ mensagens enviadas naquele dia (ou semana).',
  'Pontos sem nenhum envio ficam sem valor (a linha se interrompe). ' + INFO_REGRA_IA);
I(['Agendamentos e conversões'],
  'O que aconteceu depois das mensagens da IA: pacientes que agendaram e pacientes que compareceram e pagaram.',
  'Cada coluna laranja é um paciente que agendou; a verde, um que converteu. Compare os dois: a distância entre eles é o que agendou e ainda não compareceu ou não pagou.',
  INFO_ORIGEM_IA + ' Agendamento = evento de agendamento do lead; conversão = Compareceu e pagou. Cada paciente conta uma vez por tipo, no dia em que o evento aconteceu.',
  INFO_REGRA_IA);
I(['Receita recuperada ao longo do período'],
  'A receita recuperada pela IA somando dia a dia: a curva só sobe.',
  'Degraus mostram dias em que alguém pagou; trechos retos são dias sem receita nova. A inclinação mostra o ritmo. O valor ao passar o mouse traz o acumulado e o do dia.',
  INFO_ORIGEM_IA + ' O valor de cada paciente é o do orçamento (ou do card de no-show) e entra no dia em que ele pagou ou em que a equipe levou o card para Recuperado.',
  'É receita ligada a uma mensagem da IA, não receita causada só por ela: a equipe também pode ter atendido o paciente. O card Receita recuperada mostra quantos foram sem contato da equipe no meio.');
I(['Funil dos pacientes alcançados'],
  'Até onde chegaram os pacientes que receberam a primeira mensagem da IA no período.',
  'Cada degrau é uma etapa: alcançados, responderam, agendaram, converteram. A porcentagem é sobre os alcançados. Quedas bruscas indicam onde se perde mais gente.',
  INFO_ORIGEM_IA + ' É uma coorte: pacientes cuja primeira mensagem da IA caiu no período, vistos até hoje. Embaixo: quantos estão em negociação agora, quantos foram descartados e quantos pediram para parar de receber.',
  'Pacientes alcançados nos últimos dias ainda não tiveram tempo de agendar ou converter, então o funil de períodos recentes tende a parecer pior do que será.');
I(['Performance em cada etapa da cadência', 'Taxa de resposta por etapa', 'Resultado por etapa'],
  'Como cada mensagem da cadência do guia (Primeiro contato, Nova tentativa, Desconto, Encerramento, No-show) se saiu.',
  'Compare as linhas: a mensagem com mais resposta e a que mais leva a agendamento e conversão nem sempre são a mesma. A coluna 1ª resposta é o tempo mediano que o paciente leva para responder.',
  INFO_ORIGEM_IA + ' Cada mensagem pertence a um passo da cadência. Taxa = respondidas ÷ enviadas do passo; agendamentos, conversões e receita são creditados ao passo da última mensagem da IA antes do resultado.',
  INFO_REGRA_IA + ' Etapas com poucos envios têm taxas instáveis.');
I(['Quando a IA envia'],
  'Em que dia da semana e hora a IA mais enviou.',
  'Quanto mais clara a célula, mais envios. Mostra o horário real dos disparos, que segue o horário de cada gatilho no Controle e a janela de 8h às 19h.',
  INFO_ORIGEM_IA + ' Cada célula soma os envios do período naquele dia da semana e hora (horário de Brasília).',
  'Mostra volume, não resultado. Para saber o que rende, veja os dois gráficos ao lado.');
I(['Resposta por horário de envio', 'Resposta por dia da semana'],
  'A taxa de resposta conforme a hora, ou o dia da semana, em que a mensagem saiu.',
  'Barras mais altas são os horários, ou dias, em que o paciente mais responde. Use para ajustar o horário de cada gatilho no Controle.',
  INFO_ORIGEM_IA + ' Cálculo: mensagens respondidas ÷ enviadas naquela hora (ou dia). Passe o mouse para ver os números absolutos.',
  'Horários com poucos envios dão taxas enganosas (3 respostas em 4 envios é 75%). Confie mais nas barras com bastante volume.');
I(['Quanto tempo o paciente leva para responder'],
  'Quanto tempo passa entre a mensagem da IA e a primeira resposta do paciente.',
  'Barras à esquerda são respostas rápidas. Se a maioria está em horas ou dias, a mensagem chega num momento ruim para o paciente.',
  INFO_ORIGEM_IA + ' Tempo = horário da primeira resposta menos o horário do envio, só das mensagens que tiveram resposta.',
  'Só conta quem respondeu: quem nunca respondeu não aparece aqui.');
I(['O que os pacientes respondem'],
  'A intenção das respostas dos pacientes às mensagens da IA.',
  'Quer agendar e Pediu valor ou horário são intenção de compra; Tem dúvida pede atendimento da equipe; Sem interesse e Já fez o exame encerram o caso. Cada cor é sempre a mesma intenção.',
  INFO_ORIGEM_IA + ' A intenção é lida do botão de resposta rápida que o paciente tocou ou, se escreveu, das palavras do texto.',
  'A leitura do texto livre é automática e pode errar em mensagens ambíguas. Respostas sem intenção reconhecida entram em Outra resposta.');
I(['Envios da IA por unidade'],
  'O volume de mensagens da IA em cada unidade e como cada uma respondeu.',
  'Barra = envios; ao lado, a taxa de resposta e os agendamentos. Uma unidade com muito envio e pouca resposta merece revisão do texto, do horário ou da base de telefones.',
  INFO_ORIGEM_IA + ' A unidade é a do lead (vinda do orçamento no Clinilink).',
  'Leads sem unidade aparecem como Sem unidade.');
I(['Por valor do orçamento'],
  'Se a IA funciona melhor em orçamentos pequenos ou grandes.',
  'Compare a taxa de resposta entre as faixas de valor. Se cai nas faixas altas, orçamentos grandes podem pedir contato da equipe em vez da IA.',
  INFO_ORIGEM_IA + ' O valor é o do orçamento do lead. Faixas: até R$ 200, de 200 a 500, de 500 a 1.000 e acima de 1.000.',
  'Faixas com poucos envios têm taxa instável.');
I(['Recuperação de no-show pela IA'],
  'O resultado do convite que a IA faz para reagendar quem faltou.',
  'Siga da esquerda para a direita: convites enviados, responderam, reagendaram, compareceram e a receita recuperada.',
  INFO_ORIGEM_IA + ' A IA convida no dia seguinte à falta (Msg 10). Reagendou = evento de agendamento depois do convite; recuperado = o card do no-show foi levado para Recuperado ou o paciente compareceu e pagou.',
  'Só entram faltas de ontem ou de hoje: a IA não convida quem faltou há mais tempo. Cada paciente conta uma vez.');
I(['Pediram algo à IA e esperam a equipe'],
  'Pacientes que responderam à IA querendo agendar, saber o valor ou tirar dúvida e que ninguém da equipe atendeu ainda.',
  'É uma lista de trabalho: quanto mais antigo o pedido, mais urgente. Clique em uma linha para abrir o lead.',
  INFO_ORIGEM_IA + ' Entram respostas dos últimos 7 dias, de leads ainda abertos, sem nenhum contato da equipe nem agendamento depois da resposta.',
  'Sai da lista assim que a equipe contata o paciente ou agenda.');
I(['O que os números dizem'],
  'Frases automáticas que resumem o período: o que está funcionando e o que pede atenção.',
  'Leia como pontos de partida. Verde é bom sinal, amarelo é atenção. Cada frase tem os números por trás nos gráficos da aba.',
  'Regras fixas sobre os mesmos números da aba (melhor mensagem, melhor horário, pedidos sem atendimento, pedidos para parar etc.). Só aparece o que tem volume suficiente para ter base.',
  'Não é uma análise de causa: mostra o que aconteceu, não por quê.');
I(['Mensagens por semana', 'Taxa de resposta por semana'],
  'O volume de envios, ou a taxa de resposta, da IA semana a semana desde o primeiro envio.',
  'Veja a tendência: a taxa de resposta está melhorando com o tempo? O volume cresceu junto?',
  INFO_ORIGEM_IA + ' Não depende do período escolhido no topo: sempre mostra toda a história da IA.',
  'A semana mais recente pode estar incompleta.');
I(['Receita recuperada desde o primeiro envio', 'Agendamentos e conversões acumulados'],
  'Tudo o que a IA já trouxe, somando semana a semana desde o primeiro envio.',
  'Curvas que só sobem. A inclinação mostra o ritmo; trechos mais retos, semanas fracas.',
  INFO_ORIGEM_IA + ' Não depende do período escolhido no topo.',
  INFO_REGRA_IA);

/* ---------------------------------------------------------------- Análises: Evolução */
I(['Entradas e saídas de leads'],
  'Quantos leads entraram por dia e como saíram do funil (convertidos, descartados).',
  'Colunas = entradas. Linhas = saídas. Se as entradas superam as saídas por muito tempo, o funil está acumulando leads.',
  INFO_ORIGEM_LEADS + ' Entrada = dia do D0 do lead. Convertido = Compareceu e pagou. Descartado = descarte com motivo.',
  'Mostra eventos do dia, não o saldo. Para o saldo, veja o Pipeline em andamento.');
I(['Dinheiro convertido x perdido'],
  'O valor dos orçamentos que viraram paciente comparado ao dos que foram descartados.',
  'Compare as duas linhas. Perdido acima de convertido por vários dias indica um período ruim.',
  INFO_ORIGEM_LEADS + ' Convertido = valor do lead no dia em que compareceu e pagou. Perdido = valor do lead no dia do descarte.',
  'O valor é o do orçamento no CRM, não necessariamente o que foi pago.');
I(['Taxas ao longo do tempo'],
  'Três taxas do comercial no tempo: resposta, agendamento e conversão.',
  'Cada linha é uma taxa de 0 a 100%. Suba = melhor. Use o mouse para ver o valor de cada dia.',
  INFO_ORIGEM_LEADS + ' Resposta = respostas ÷ contatos. Agendamento = agendamentos ÷ leads contatados. Conversão = convertidos ÷ encerrados (convertidos + descartados). Nos períodos curtos cada ponto usa uma janela móvel de 7 dias para suavizar; acima de 30 dias, é semana a semana.',
  'Uma taxa acima de 100% (mais respostas do que contatos na janela, por exemplo) é desenhada no teto do gráfico; o valor real aparece ao passar o mouse.');
I(['Quanto tempo leva até converter'],
  'O tempo médio, em dias, entre o lead entrar e o paciente comparecer e pagar.',
  'Quanto menor, mais rápido o ciclo. Subidas indicam fechamento mais lento.',
  INFO_ORIGEM_LEADS + ' Para cada paciente que converteu, dias do D0 até o comparecimento; a linha é a média dos que converteram em cada ponto.',
  'Pontos sem nenhuma conversão ficam sem valor. Poucas conversões dão médias instáveis.');
I(['Pipeline em andamento, etapa por etapa'],
  'Quantos leads estavam em cada etapa do funil ao fim de cada dia ou semana.',
  'A altura total é o pipeline ativo. O que cresce é acúmulo; o que encolhe é fluxo saindo da etapa.',
  INFO_ORIGEM_LEADS + ' O estado de cada lead em cada dia é reconstruído dos eventos dele (entrada, etapas, agendamento, comparecimento, descarte).',
  'Mostra o passado reconstruído do histórico, então leads antigos sem eventos completos podem aparecer só a partir de quando o CRM os registrou.');
I(['Funil por semana de entrada'],
  'De cada 100 leads que entraram numa semana, quantos chegaram a cada etapa.',
  'Cada linha é uma etapa (contatados, responderam, agendaram, compareceram). Linhas que caem de uma semana para outra indicam piora do aproveitamento.',
  INFO_ORIGEM_LEADS + ' Coorte por semana de entrada (D0). Cada etapa = o lead teve o evento correspondente em algum momento, até hoje.',
  'As semanas mais recentes ainda estão amadurecendo: os leads não tiveram tempo de chegar às etapas finais.');
I(['Funil do período', 'Funil do time', 'Funil dos leads recebidos'],
  'Os leads que entraram no período e até onde chegaram.',
  'Cada degrau é uma etapa; a porcentagem é sobre os leads que entraram. Quedas grandes mostram onde o funil perde gente.',
  INFO_ORIGEM_LEADS + ' Coorte: leads com entrada (D0) no período, vistos até hoje. Etapas: contatado, respondeu, agendou, compareceu e pagou.',
  'Leads recentes ainda não tiveram tempo de avançar, então períodos curtos parecem piores do que serão.');
I(['De onde vêm os leads'],
  'A origem dos leads (canal ou campanha) e quanto cada origem converte.',
  'Barras maiores são as origens com mais volume. Compare o volume com a conversão: uma origem pequena que converte bem pode valer mais.',
  INFO_ORIGEM_LEADS + ' A origem é o campo Origem do lead (vem do orçamento no Clinilink ou do cadastro).',
  'Leads sem origem informada aparecem juntos em Sem origem.');
I(['Exames mais procurados'],
  'Os exames que mais geram leads no período.',
  'Barras maiores são os exames que mais aparecem nos orçamentos.',
  INFO_ORIGEM_LEADS + ' O exame é o primeiro item do orçamento do lead.',
  'Orçamentos com vários exames contam pelo primeiro item.');
I(['Há quanto tempo estão parados', 'Tempo parado na etapa', 'Envelhecimento', 'Há quanto tempo estão aqui'],
  'Há quantos dias cada lead, ou card, está parado na etapa em que se encontra.',
  'Faixas à direita (mais dias) são os casos que esfriaram. Priorize-os: quanto mais tempo parado, menor a chance de fechar.',
  INFO_ORIGEM_LEADS + ' Dias na etapa = hoje menos o dia em que o lead entrou na etapa atual. Só leads ativos.',
  'O limite de dias de cada etapa vem do guia de atendimento; passar do limite é sinal de atraso.');
I(['Por que perdemos leads', 'Por que saem por descarte', 'Descartes por motivo'],
  'Os motivos de descarte dos leads.',
  'A maior fatia é a principal razão de perda. É onde vale agir: preço alto pede condição, sem retorno pede mais tentativas.',
  INFO_ORIGEM_LEADS + ' O motivo é escolhido por quem descartou (Preço, Outro lugar, Desistiu, Plano, Sem retorno, Outro) ou é Sem retorno quando o guia descarta sozinho.',
  'Leads descartados sem motivo registrado entram em Outro.');
I(['Qual mensagem funciona melhor', 'Mensagens do time', 'Mensagens usadas', 'Mensagens usadas e resposta', 'Resposta por mensagem'],
  'Quantas vezes cada mensagem do guia foi enviada e qual percentual teve resposta.',
  'Compare a taxa de resposta entre as mensagens. Verde é a melhor e vermelho a que menos responde (com 5 envios ou mais).',
  INFO_ORIGEM_LEADS + ' Para cada mensagem enviada (WhatsApp), verifica se o paciente respondeu em até 72 horas. Taxa = respondidas ÷ enviadas.',
  'Mensagens com poucos envios têm taxa instável. A mesma regra vale para envios feitos pela equipe e pela IA.');
I(['Quando os pacientes respondem'],
  'Em que dia da semana e hora os pacientes mais respondem.',
  'Quanto mais escura a célula, mais respostas. Mostra os melhores momentos para o paciente ver a mensagem.',
  INFO_ORIGEM_LEADS + ' Cada célula conta as respostas do período naquele dia da semana e hora (horário de Brasília).',
  'Mostra o horário da resposta, não o do envio. Para a taxa por horário de envio, veja a aba IA Performance.');
I(['Quando contata', 'Quando o time contata'],
  'Em que dia da semana e hora os contatos são feitos.',
  'Quanto mais escura a célula, mais contatos. Mostra se o atendimento está concentrado em poucos horários.',
  INFO_ORIGEM_LEADS + ' Cada célula conta os contatos (WhatsApp ou ligação) do período naquele dia da semana e hora.',
  'Mostra volume, não resultado.');
I(['Pipeline por faixa de valor'],
  'Os leads ativos agora, separados por tamanho do orçamento.',
  'Mostra onde está o dinheiro do pipeline: muitos leads pequenos ou poucos grandes.',
  INFO_ORIGEM_LEADS + ' Soma dos leads ativos (aberto, sem retorno, negociação, agendado) em cada faixa de valor.',
  'É uma foto de hoje, não depende do período.');
I(['Valor em andamento', 'Pipeline agora'],
  'O valor, ou a quantidade, de leads ativos hoje em cada etapa.',
  'Etapas muito cheias indicam gargalo; etapas vazias, falta de entrada.',
  INFO_ORIGEM_LEADS + ' Soma dos orçamentos dos leads ativos na etapa atual.',
  'É uma foto de hoje, não depende do período.');
I(['Leads ativos', 'Passos atrasados', 'Convertidos', 'Conversão'],
  'Um comparativo entre os responsáveis em um indicador.',
  'Barras maiores são quem tem mais naquele indicador. Para Passos atrasados, menos é melhor.',
  INFO_ORIGEM_LEADS + ' Leads ativos e atrasados são de hoje; convertidos e conversão consideram o período. Conversão = convertidos ÷ (convertidos + descartados).',
  'O responsável é o campo Responsável do lead.');

/* ---------------------------------------------------------------- Visão executiva */
I(['Pipeline em degraus'],
  'Quantos orçamentos estão em cada etapa agora e quanto dinheiro eles representam.',
  'A largura do degrau é o volume. À direita estão o valor e a chance histórica de ganho dessa etapa.',
  INFO_ORIGEM_LEADS + ' A chance é a taxa real de ganho observada no histórico dos leads que passaram pela etapa, com o tamanho da amostra à vista.',
  'Etapas com poucas observações têm chance pouco confiável.');
I(['Previsão de fechamento'],
  'Quanto do dinheiro em aberto deve fechar, pela taxa histórica de cada etapa.',
  'Barra clara: valor em aberto. Barra cheia: o esperado. A diferença é o que a história diz que se perde.',
  INFO_ORIGEM_LEADS + ' Previsão = valor de cada lead × taxa de ganho histórica da etapa em que ele está. Ganho = Convertido ativo ou orgânico.',
  'É probabilidade, não promessa. Etapas com amostra pequena distorcem a previsão.');
I(['Mapa do dinheiro'],
  'O dinheiro dividido em o que está na mesa (por etapa), o que virou receita e o que se perdeu.',
  'A área de cada bloco é proporcional ao valor. Verde é o convertido no período, vermelho o perdido, e as demais cores são as etapas em aberto. Abaixo, a maior concentração de dinheiro aberto e quanto já passou do tempo esperado na etapa.',
  INFO_ORIGEM_LEADS + ' Cada bloco soma o valor dos orçamentos: leads ativos por etapa, convertidos e descartados no período.',
  'Valores são os dos orçamentos no CRM, não necessariamente o que foi pago.');
I(['Para onde foi o dinheiro'],
  'O destino dos orçamentos dos leads recebidos no período: se responderam e o que são hoje.',
  'Siga as faixas da esquerda para a direita. A espessura é o valor em R$. Faixas largas até Convertido mostram onde o dinheiro virou receita.',
  INFO_ORIGEM_LEADS + ' Cada lead recebido no período entra com o valor do orçamento, passando por respondeu ou não e pela situação atual.',
  'Leads recentes ainda não tiveram tempo de chegar ao destino final.');
I(['Quadro de decisão'],
  'Cada orçamento em andamento, separado pelo risco de esfriar.',
  'Comece pelos cards de risco: ordenados por valor e tempo sem movimentação, são os que mais pedem uma decisão agora. Clique para abrir o lead.',
  INFO_ORIGEM_LEADS + ' Risco = passou do limite de dias da etapa no guia, ou o passo está atrasado há 2 dias ou mais. Atenção = passo atrasado ou menos de 2 dias de folga. Oportunidade = o resto. A ordem usa o valor do orçamento, com peso maior para Risco e Atenção.',
  'É uma fila de prioridade, não uma previsão.');
I(['Quem está parado, e há quanto tempo'],
  'Cada card como uma bolha, na linha da sua etapa e na posição dos dias sem avanço.',
  'Bolhas mais à direita estão mais tempo paradas. O tamanho é o valor: bolhas grandes à direita são o maior risco.',
  INFO_ORIGEM_LEADS + ' Dias sem avanço = hoje menos o último movimento do lead.',
  'Clique em uma bolha para abrir o lead.');
I(['Ritmo de entrada e conversão'],
  'Os leads por data de entrada e a etapa em que cada grupo está hoje.',
  'Cada coluna é um dia (ou semana) de entrada, e as cores mostram em que etapa esses leads estão agora.',
  INFO_ORIGEM_LEADS,
  'Dias recentes ainda estão em etapas iniciais.');
I(['Unidades em quadrantes'],
  'As unidades comparadas por volume e resultado.',
  'Cada bolha é uma unidade. O tamanho é o valor convertido (ou recuperado). As linhas tracejadas são as médias: acima e à direita é o melhor quadrante.',
  INFO_ORIGEM_LEADS + ' Volume = leads recebidos; resultado = conversão (ou recuperação de no-show).',
  'Unidades pequenas têm resultado instável.');
I(['Quem mais converteu', 'Receita por vendedor', 'Conversão por vendedor', 'Desempenho de cada vendedor', 'Atividade por login'],
  'O resultado de cada pessoa do time no período.',
  'Compare as pessoas pelo mesmo indicador. A barra mostra a fatia da receita do time. Clique em uma pessoa para abrir tudo sobre ela.',
  INFO_ORIGEM_LEADS + ' A receita é atribuída ao responsável do lead; a atividade por login conta os movimentos registrados por cada usuário.',
  'Quem recebe mais leads tende a converter mais: compare também a conversão e o ticket. A IA CRM aparece como mais uma linha, em vermelho: as mensagens são os WhatsApp enviados por ela, a resposta vale em até 72 horas e o agendamento ou a conversão é creditado à última mensagem dela antes do resultado (em até 14 dias, sem contato da equipe depois). Por isso a receita dela também aparece nos vendedores responsáveis e não é somada ao Time todo. Carteira, ciclo e movimentos de cards não se aplicam a ela.');
I(['Recuperação de no-show', 'No-show recuperado', 'No-show recuperados', 'No-show e descartes'],
  'O caminho de quem faltou: da falta até voltar a comparecer.',
  'Mostra quantos faltantes entraram, quantos foram trabalhados e quantos voltaram. Valor recuperado é o dos cards levados para Recuperado.',
  INFO_ORIGEM_CARDS + ' Faltas vêm do Clinilink (agendamentos com falta). Recuperado = a equipe levou o card para a coluna Recuperado.',
  'A IA CRM aparece em vermelho, com os convites de reagendamento que enviou e os faltantes que voltaram depois deles. O detalhe da IA está na aba IA Performance.');

/* ---------------------------------------------------------------- Time, pessoa, Meu Report */
I(['Atendimento ao longo do tempo', 'Atividade ao longo do período', 'Respostas e agendamentos', 'Atividade dos últimos 14 dias'],
  'O trabalho de contato do time, ou da pessoa, no tempo: contatos, respostas e agendamentos.',
  'Colunas = contatos. Linhas = respostas e agendamentos. Se os contatos sobem e o resto não, o contato está rendendo menos.',
  INFO_ORIGEM_LEADS + ' Cada ponto conta os eventos de contato, resposta e agendamento do dia (ou semana).',
  'A IA de disparo aparece à parte em alguns gráficos.');
I(['Evolução da receita', 'Receita convertida', 'Receita convertida por dia'],
  'O valor convertido, dia a dia.',
  'Mostra o ritmo da receita: degraus altos são dias com muitas conversões.',
  INFO_ORIGEM_LEADS + ' Valor convertido = valor do lead no dia em que compareceu e pagou (Convertido ativo).',
  'Valor é o do orçamento no CRM.');
I(['Carteira de agora', 'Carteira por etapa', 'Carteira ativa por etapa'],
  'Os leads ativos de cada pessoa, ou da pessoa por etapa.',
  'Mostra a carga de trabalho. Muitos leads com passo atrasado indicam sobrecarga.',
  INFO_ORIGEM_LEADS + ' Só leads ativos, hoje.',
  'É uma foto de hoje, não depende do período.');
I(['Posição na equipe'],
  'Onde a pessoa fica entre os responsáveis em quatro indicadores do período: receita convertida, convertidos, contatos feitos e conversão.',
  'Em cada gráfico, a barra em destaque é a pessoa e as cinzas são os colegas. Barra maior é melhor. O selo mostra a posição, por exemplo 2º de 5.',
  INFO_ORIGEM_LEADS,
  'Compare com cuidado entre pessoas com carteiras de tamanhos diferentes.');
I(['Dias até o primeiro contato'],
  'Quanto tempo o lead espera pelo primeiro contato.',
  'Menos é melhor. A mediana evita que um caso muito atrasado distorça o número.',
  INFO_ORIGEM_LEADS + ' Mediana dos dias entre o D0 do lead e o primeiro contato registrado.',
  'Leads sem nenhum contato ainda não entram na conta.');
I(['Cards avançados de etapa'],
  'Quantas vezes cada pessoa do time levou um card para a próxima etapa do funil, no período.',
  'Barra maior = mais cards avançados. Cada linha mostra quantos foram para a etapa imediatamente seguinte, quantos pularam etapas e quantos voltaram. Passe o mouse para ver também os que foram para descarte ou perda.',
  INFO_ORIGEM_CARDS + ' Para cada movimento de coluna registrado por uma pessoa, compara a coluna de origem com a de destino na ordem do funil: destino logo depois da origem = etapa seguinte; mais adiante = pulou etapas; antes = voltou; coluna de perda (descarte, sem retorno, perdido) = perda. O número principal soma etapa seguinte e pulou etapas.',
  'As pessoas contam pelos cards que arrastaram. A IA CRM aparece em vermelho com os cards que se moveram sozinhos logo depois de uma mensagem dela (o card acompanha o lead). Outros movimentos automáticos do sistema não entram em ninguém. Vale para os funis de Orçamentos e de No-show juntos, e depende do período escolhido no topo.');
I(['Leads recebidos e convertidos', 'Movimentos ao longo do tempo', 'Movimentos no Pipelines', 'Movimentações por dia', 'Produtividade por usuário', 'Mensagens do time'],
  'O volume de trabalho, entradas e conversões, ou de movimentações de cards, no tempo ou por pessoa.',
  'Compare pessoas e dias. Movimentar mais não significa converter mais: veja junto com a receita.',
  INFO_ORIGEM_CARDS + ' Cada movimento de coluna registrado por uma pessoa conta como uma movimentação.',
  'Os cards que se movem sozinhos logo depois de uma mensagem da IA aparecem na linha vermelha IA CRM, e não como trabalho da equipe.');
I(['Por unidade'],
  'A receita convertida e a conversão de cada unidade.',
  'Compare as unidades pelo valor e pela taxa.',
  INFO_ORIGEM_LEADS + ' A unidade é a do lead (vinda do orçamento no Clinilink).',
  'Unidades com poucos leads têm taxa instável.');
I(['Convertidos no período', 'O que fez', 'Para onde moveu', 'Mensagens usadas', 'Atividade recente'],
  'O detalhe do que a pessoa fez no período.',
  'É uma lista ou resumo para conferir a atividade da pessoa.',
  INFO_ORIGEM_LEADS,
  'Depende do período escolhido no topo.');

/* ---------------------------------------------------------------- Etapa */
I(['Entradas e saídas', 'Entrada de leads'],
  'Quem entrou na etapa e quem saiu dela, no tempo.',
  'Se entram mais do que saem, a etapa acumula.',
  INFO_ORIGEM_LEADS + ' Entrada = o lead passou a estar na etapa; saída = deixou de estar.',
  'Cada ponto é um dia (ou semana).');
I(['Contatos desta etapa'],
  'Os contatos feitos nesta etapa, por canal, e quantos leads contatados responderam.',
  'Compare WhatsApp e ligação, e a taxa de resposta.',
  INFO_ORIGEM_LEADS,
  'Só conta contatos feitos enquanto o lead estava na etapa.');
I(['Para onde vão'],
  'O destino de quem saiu da etapa.',
  'Mostra o que acontece depois: avançam, convertem ou caem.',
  INFO_ORIGEM_LEADS,
  'Só conta quem já saiu da etapa.');
I(['Maiores orçamentos aqui', 'Valor por responsável', 'Valor por unidade'],
  'Onde está o dinheiro desta etapa.',
  'Mostra os maiores orçamentos, e como o valor se divide entre responsáveis e unidades. Clique para abrir o lead.',
  INFO_ORIGEM_LEADS + ' Orçamentos dos leads que estão na etapa agora.',
  'É uma foto de hoje.');

/* ---------------------------------------------------------------- Pipelines */
I(['Funil agora'],
  'A quantidade de cards em cada coluna do funil, agora.',
  'A largura é o volume. Colunas largas no início e estreitas no fim são o funil normal.',
  INFO_ORIGEM_CARDS,
  'É uma foto de hoje, e respeita o funil escolhido.');
I(['Colunas em andamento'],
  'Os cards ainda abertos em cada coluna e quanto se espera ganhar deles.',
  'A previsão mostra o valor esperado por coluna.',
  INFO_ORIGEM_CARDS + ' Previsão = valor dos cards × taxa de ganho histórica da coluna.',
  'Precisa de pelo menos 5 cards já resolvidos na coluna; abaixo disso fica sem amostra.');
I(['De onde saíram, para onde foram'],
  'Todas as transições de cards entre colunas no período.',
  'Das mais frequentes para as menos frequentes.',
  INFO_ORIGEM_CARDS,
  'Conta movimentos, não cards: um card que andou duas colunas conta duas vezes.');

/* ---------------------------------------------------------------- Hoje e IA */
I(['Radar'],
  'O que pede atenção agora no comercial.',
  'Cada item é um alerta com a ação sugerida. Críticos primeiro.',
  INFO_ORIGEM_LEADS + ' Regras fixas sobre prazos, valores parados, quedas de conversão e atrasos.',
  'É uma foto de hoje.');
I(['Fila do dia', 'Próximos 7 dias'],
  'Os passos de atendimento que vencem hoje, ou nos próximos dias.',
  'Ordem do guia: no-show primeiro, depois leads novos, depois o maior valor.',
  INFO_ORIGEM_LEADS + ' Cada lead tem o seu próximo passo pela cadência do guia.',
  'Passos atrasados aparecem separados dos que vencem hoje.');
I(['Fila de agora'],
  'Quem a IA enviaria agora, e quem ficou de fora e por quê.',
  'Os prontos são os que a próxima rodada envia. Os de fora trazem o motivo.',
  INFO_ORIGEM_LEADS + ' A fila aplica todas as regras do guia e do IA Manager: passo que vence hoje, horário do gatilho, janela, limites e telefone.',
  'A IA só age em passo que vence hoje; passo atrasado fica para a equipe.');
I(['Respostas dos pacientes'],
  'Tudo o que os pacientes responderam depois de um disparo.',
  'Da mais recente para a mais antiga, com a intenção de cada resposta.',
  INFO_ORIGEM_IA,
  'A intenção é lida automaticamente e pode errar em textos ambíguos.');

/* ---------------------------------------------------------------- o botão e a janela */
function botaoInfo(titulo) {
  if (!infoDe(titulo)) return null;
  return h('button', { type: 'button', class: 'inf-b', 'aria-label': 'Como ler este gráfico: ' + titulo, title: 'Como ler este gráfico', onclick: function (e) { e.stopPropagation(); abrirInfo(titulo); }, text: '!' });
}
function abrirInfo(titulo) {
  var d = infoDe(titulo); if (!d) return;
  var sec = function (t, txt) { return h('section', { class: 'inf-s' }, [h('h4', { text: t }), h('p', { text: txt })]); };
  modal({ titulo: titulo, sub: 'Como ler este gráfico', largura: 560, classe: 'inf-m', corpo: [
    sec('O que mostra', d.o), sec('Como analisar', d.c), sec('De onde vem o número e como é calculado', d.f), sec('Atenção', d.a)
  ] });
}
`;
