# Roteiro de testes da Amanda, de ponta a ponta

Escrito para: Giovanny, para testar a Amanda no WhatsApp com vários cenários em 10 fluxos.

## Antes de começar

- **Só números autorizados recebem resposta.** De outro número ela fica quieta (isso também é um teste: o fluxo 10).
- **Ela espera cerca de 30 segundos** depois da sua última mensagem para responder (para você terminar de escrever). Emergência e crise respondem em poucos segundos.
- **Agendamento e cadastro são REAIS.** Se você chegar até o "sim" final, a Amanda grava no Clinilink. Use um paciente de teste e cancele depois no Clinilink (ela não cancela). Para testar sem gravar, pare antes do último "sim" ou responda "não" quando ela perguntar se o paciente é aquele.
- Os logs de cada resposta ficam em `/painel/logs` (mostra o que o paciente disse, a etapa, o texto do roteiro, se o GPT foi usado e se transferiu).
- Cada fluxo tem uma lista de cenários: **você manda** → **o que esperar**. Os horários, médicos e preços mudam com a agenda real.

### O que conferir em TODA mensagem dela

1. Sem emoji, sem travessão, sem asterisco.
2. No máximo uma pergunta por mensagem.
3. Tom de conversa de WhatsApp ("pra", "tá", "né"), poucas vírgulas, sem "Fechado" nem "Combinado".
4. Médicos sempre com título: "a Dra. Fernanda", "o Dr. Armando".
5. Preço sempre o do Clinilink (campo preço). **Nunca "R$ 0,00".** Se não tiver preço, ela não cita e diz que a equipe confirma.
6. Ela não repete a mesma pergunta em silêncio: se não entendeu, pergunta de outro jeito.
7. Nada de promessa que não existe e nenhum dado inventado (data, médico, valor).

---

## Fluxo 1. Caminho feliz (consulta)

| # | Você manda | Esperado |
|---|---|---|
| 1.1 | "oi" | "Oi [nome], [bom dia/boa tarde/boa noite]! Aqui é a Amanda, da Clinex. Me conta o que você precisa?" |
| 1.2 | "quero agendar cardiologia" | Confirma o serviço: "Ah, então é consulta ... né?" (ou "Entendi, você quer ..., é isso?") |
| 1.3 | "sim" | "Tenho sim! No Guamá com a Dra. ... e no Telégrafo com ..." + preço "A consulta é R$ ..." + "Qual dos dois fica melhor pra você?" |
| 1.4 | "Guamá" | "Consegui estes aqui:" com até 4 opções numeradas (dia da semana, dia, período, "a partir das Xh", médico se houver mais de um) |
| 1.5 | "2" | Resumo "Beleza, então fica ... por ordem de chegada ..." e **já induz o pix**, sem perguntar antes: "Pra agilizar o seu atendimento na recepção, o melhor é antecipar o pagamento por pix, o valor é R$ ...:" + a chave sozinha ("Chave pix: ...", fácil de copiar) + "Quando pagar, me manda o comprovante aqui ... Se preferir pagar na recepção ou por link de crédito, é só me falar." (três balões) |
| 1.6 | "na recepção" (ou "não", "prefiro pagar lá") | "Sem problema nenhum o pagamento fica pra recepção no dia do atendimento. Me passa o CPF do paciente pra eu reservar?" |
| 1.7 | CPF de paciente que já existe | "Achei aqui o cadastro de [Nome]. É esse mesmo o paciente?" (só o nome, nenhum outro dado) |
| 1.8 | "sim" | Mensagens separadas: "Agendamento confirmado! Deu tudo certo, [nome]." + o **modelo da clínica** (Paciente, Profissional, Procedimento, Data, Clínica, Endereço, Telefone, WhatsApp, Valor particular, Formas de pagamento; veja o Fluxo 14) + "Se puder, chega cedinho ... Quer aproveitar e agendar mais algum exame ou consulta?" |

Variações para fazer o mesmo caminho:
- 1.9 Serviço que só tem **uma unidade**: ela não pergunta a unidade, já mostra os horários.
- 1.10 Exame (ex.: ultrassom ou teste ergométrico) em vez de consulta: texto "O exame é R$ ...".
- 1.11 Serviço **sem preço** cadastrado: ela não cita valor; se você perguntar "quanto custa?", diz que a equipe confirma.
- 1.12 Responder "sim" de outros jeitos na confirmação: "isso", "pode ser", "beleza", "fechou", "uhum", "com certeza", "bora", "demorou". Todos confirmam.
- 1.13 Recusar de outros jeitos: "não", "negativo", "nada disso", "errado", "não é isso". Ela diz "Sem problema. Qual consulta ou exame você precisa?" e recomeça.

## Fluxo 2. Pedir o serviço de jeitos diferentes

- 2.1 "preciso de um cardiologista", "queria uma consulta com cardio", "marcar cardiologia" → reconhece a Cardiologia.
- 2.2 Sintoma leve: "estou com palpitação" → "Pelo que você contou, o serviço indicado é ..." com o **aviso do pronto-socorro/192**, e pergunta se é isso.
- 2.3 "ultrassom", "usg", "ultrassonografia" → mesmo serviço, ela acha pelo nome parecido.
- 2.4 "teste ergo", "ergometrio", "ergoemtrico", "teste de esforço" → acha o Teste Ergométrico (aceita abreviação e erro de digitação).
- 2.5 Só "teste" → sugere os serviços principais **com agenda** (o ergométrico entre eles) em lista numerada. Responder "2" ou o nome de um deles segue o fluxo.
- 2.6 Com a lista de sugestões na tela, pedir outra coisa ("quero dermatologia") → ela atende o pedido novo, não vira "a primeira opção".
- 2.7 "exame de gravidez" → acha o teste de gravidez.
- 2.8 "quero marcar uma consulta" (sem dizer qual) → mostra "Estas são as consultas mais procuradas que tenho com agenda:" (até 6, numeradas) e pergunta "Qual delas você precisa? Se for outra, me diz o nome." Responder "2" ou o nome segue o fluxo.
- 2.8a "bom dia, preciso agendar um exame" (sem dizer qual) → "Estes são os exames mais procurados que tenho com agenda:" com até 6 exames **com agenda aberta** e variedade (laboratório, imagem, métodos gráficos...), os mais agendados primeiro. Nenhum exame sem horário aparece. Depois: "2", o nome do exame, ou "de sangue".
- 2.8b "consulta ou exame" (os dois tipos) → ela pergunta "Qual consulta ou exame você precisa?" sem escolher um tipo sozinha.
- 2.8c "só um ultrassom" / "teste" (vários parecidos) → sugere primeiro o que a clínica mais agenda e que tem horário.
- 2.8d Pedidos que as regras não pegam, mas a IA entende pelo contexto: "quero ver meu coração", "estou com tontura", "preciso de um raio x do joelho", "estou com unha encravada". Ela busca no Clinilink o que entendeu e **sempre confirma** ("Ah, então é ..., né?"). Queixa de saúde vem com o aviso do pronto-socorro/192.
- 2.8e Contexto: "preciso agendar um exame" e depois "de sangue" ou "daqueles de hemograma" → entende como exame de sangue.
- 2.8f "quero remarcar" / "preciso cancelar minha consulta" → "Claro! Pra remarcar ou cancelar eu chamo alguém da equipe pra te ajudar." e transfere (não procura "remarcar" como serviço).
- 2.9 "blablabla" → 1ª vez: "Hmm não peguei qual é o serviço. Me diz a especialidade ou o exame? Pode ser o nome do médico também." 2ª vez: lembra que você pode pedir a equipe. **Ela não transfere sozinha.**
- 2.10 Serviço que não existe/não está liberado ("audiometria") → "Não achei ... pra agendar por aqui. Quer que eu chame alguém da equipe?" Responda "sim" (transfere) e, em outro teste, "não" (volta a perguntar o serviço).
- 2.11 Dia e período junto com o serviço que não existe ("audiometria amanhã de manhã") → o aviso cita só "audiometria".
- 2.12 Áudio falando o pedido ("quero marcar uma consulta de ginecologia") → ela entende pela transcrição. Áudio sem transcrição → "Não consegui ouvir esse áudio. Escreve pra mim ou manda de novo?"
- 2.13 Só uma foto/arquivo → "Recebi o arquivo, mas só leio texto e áudio por aqui. Pode me escrever?"

## Fluxo 3. Pedir um médico pelo nome

- 3.1 "quero com a dra Rebecca" → acha a médica, confirma "consulta ... com a Dra. Rebecca", e depois só mostra os horários dela.
- 3.2 Nome com erro de uma letra ("rebeca" para "rebecca") → ainda acha.
- 3.3 Só o sobrenome → acha se for único; se houver mais de uma pessoa parecida, lista as opções com a especialidade ("1. Dra. ... (Ginecologia)") e você escolhe pelo número.
- 3.4 Médica que existe mas **sem horário aberto** → avisa e oferece a mesma especialidade com outros profissionais (não transfere).
- 3.5 Médico que não existe ("dr Xavier") → "Não achei ... entre os profissionais que têm agenda aberta. Pode me dizer o sobrenome ou a especialidade?" (não transfere).
- 3.6 Pedir o médico **depois de ver os horários** ("na verdade quero com a dra Rebecca") → "Beleza, vou olhar os horários com a Dra. ..." e mostra só os dela, **sem confirmar o serviço de novo** e mantendo a unidade.
- 3.7 Pedir a médica **depois de escolher o horário e antes do CPF** → ela ajusta ("Sem problema, vamos ajustar.") e refaz os horários dela.
- 3.8 Com a lista na tela, "com a Fernanda" / "com o Armando" (alguém que aparece na lista) → fica só com os horários dessa pessoa; se for um só, já escolhe.
- 3.9 "quinta 22 com a Fernanda" → vale o dia e a médica juntos.
- 3.10 Conferir o **Dr./Dra.**: homem aparece como "o Dr.", mulher como "a Dra.". Se aparecer algum nome sem título, anote o nome (é um nome que ela não soube classificar).

## Fluxo 4. Escolher o dia e o horário (o jeito de falar)

Com a lista de horários na tela:

- 4.1 Número: "2", "opção 2", "o segundo", "a terceira", "dois".
- 4.2 "a quarta opção" e "o último" → escolhem pela posição. "quinta" sozinho é **dia da semana**, não a quinta opção.
- 4.3 Dia da semana: "quinta", "sábado de manhã".
- 4.4 Dia do mês: "22", "dia 22", "quinta 22", "22 de outubro".
- 4.5 "amanhã", "depois de amanhã", "hoje".
- 4.6 Pressa: "o mais rápido possível", "a próxima", "qualquer um", "tanto faz", "o que tiver", "o primeiro disponível", "o mais cedo". → "O mais rápido que tenho é ... Já separo esse pra você." e já pergunta o pagamento.
- 4.7 "o último".
- 4.8 Período: "de tarde", "o mais rápido de manhã".
- 4.9 Hora: "às 15h" (se não existir: "Não tenho horário às 15h. Mas consegui estes aqui:" com o que há).
- 4.10 "outro dia", "tem mais opções?", "nenhum desses serve" → "Sem problema. Tenho também:" com datas **depois** das que estavam na tela.
- 4.11 "semana que vem", "mês que vem", "depois do dia 25", "a partir de segunda", "daqui a 2 dias" → lista começando dessa data.
- 4.12 "até amanhã", "essa semana" → só o que existe até lá.
- 4.13 Dia sem vaga ("domingo") → "Pra domingo ... não tenho vaga. Mas consegui estes aqui:" com os mais próximos (antes ou depois).
- 4.14 Resposta que ela não entende ("sei lá") → "Não peguei qual horário você quer. Pode ser o número, o dia ou "o mais rápido"?" com a lista de novo. Não fica repetindo a mesma frase em silêncio.
- 4.15 Dizer "sim" quando só há UMA opção na tela → escolhe aquela.
- 4.16 Por áudio: "pode ser na quinta de manhã" → mesmo resultado do texto.

## Fluxo 5. Misturar tudo (a ordem que o paciente quiser)

- 5.1 Tudo na primeira mensagem: "boa tarde, quero uma consulta de ginecologia amanhã de manhã no Guamá, pago na recepção" → confirma o serviço; depois do "sim" vai direto ao resumo do horário e ao CPF, **sem perguntar unidade, dia e pagamento de novo**.
- 5.2 Dia e período antes do serviço: "quero marcar amanhã de manhã" → "Anotei [dia] de manhã. Qual consulta ou exame você precisa?" Depois "cardiologia" → o dia e o período continuam valendo.
- 5.3 "quero a quinta" (só o dia) → anota e pergunta o serviço.
- 5.4 Unidade antes do serviço: "quero marcar lá no Guamá" → "Anotei no Guamá." Depois do serviço ela não pergunta a unidade.
- 5.5 Unidade sem agenda do serviço ("no Telégrafo", mas só tem no Guamá) → avisa que ali não tem agenda e mostra onde tem.
- 5.6 Pagamento antes da hora: "quero ginecologia e vou pagar na recepção" → na hora do pagamento ela só confirma e pede o CPF.
- 5.7 CPF antes da hora: "quero ginecologia, meu cpf é 529.982.247-25" → na hora do CPF ela **não pergunta de novo** e já mostra o nome do paciente.
- 5.8 "boa tarde" ou "boa noite" no começo **não** vira período do dia.
- 5.9 "o mais cedo possível" não vira "de manhã", vira o primeiro horário.
- 5.10 "quero fazer um teste ergométrico o mais rápido possível" → acha o Teste Ergométrico (a palavra "rápido" não puxa "Teste Rápido de Gravidez").
- 5.11 Mudar de ideia **antes de dar o CPF**: trocar o serviço ("na verdade quero dermatologia"), a unidade ("prefiro o Telégrafo"), o dia ("outro dia") ou o médico. Ela ajusta e segue, sem recomeçar.
- 5.12 Depois de dar o CPF, mudar de ideia: observe o que acontece e me diga (esse caso ainda não tem tratamento especial).

## Fluxo 6. Pagamento

- 6.1 Assim que você escolhe o horário, ela manda o pix sem você pedir: "Pra agilizar o seu atendimento na recepção, o melhor é antecipar o pagamento por pix, o valor é R$ ...:" + "Chave pix: ..." + pede o comprovante. Quem já disse antes que paga na recepção (ou por link) **não** é empurrado para o pix. Serviço sem valor cadastrado: ela não induz o pix e pergunta a forma de pagamento.
- 6.2 Mandar um **comprovante certo** (hoje, valor igual ao da consulta, recebedor da Clinex) → "Recebi o seu comprovante, muito obrigada! Agora pra eu fazer a reserva pode me passar o CPF do paciente?"
- 6.3 Comprovante com **valor maior** → aceita.
- 6.4 Comprovante com **valor menor** → "Recebi o seu comprovante de R$ X. O valor é R$ Y, então ainda faltam R$ Z. Prefere pagar o restante agora por pix ou deixar para pagar na recepção?" Mande um segundo comprovante que complete (confirma) ou responda "na recepção" (o resto fica pra recepção).
- 6.5 Comprovante **de outro dia** (ontem, dias atrás, meses atrás) → "Esse comprovante é de [dia], então deve ser de outro atendimento. Preciso do comprovante do pagamento de hoje, feito pra esse agendamento. Pode me mandar o correto?" (só vale o comprovante feito depois que você começou o pedido; conversa que atravessa a meia-noite vale).
- 6.5b Comprovante **de hoje, mas de antes da conversa** (ex.: pago às 9h05 e você começou a falar às 15h): "Esse comprovante é de hoje às 9h05, antes da nossa conversa começar, então deve ser de outro atendimento. Pra esse agendamento preciso do pagamento feito agora, depois do seu pedido. Pode me mandar o correto? Se preferir, também dá pra pagar na recepção." Pago até 10 min antes do seu primeiro "oi" ainda vale; comprovante sem horário visível vale; comprovante com data de amanhã: pede conferir.
- 6.6 **Mesmo comprovante duas vezes** → "Esse comprovante eu já recebi..." e não soma de novo.
- 6.7 Comprovante para **outra pessoa/chave** → avisa que o recebedor é diferente e chama a equipe.
- 6.8 Imagem que **não é comprovante** (uma foto qualquer) → pede o comprovante. Imagem ilegível → "Não to conseguindo ler esse comprovante, pode me mandar de novo?"
- 6.9 Três imagens que não servem → chama a equipe.
- 6.10 "já paguei" sem imagem → pede o comprovante. Outra mensagem qualquer enquanto espera → "Tô aguardando o comprovante do pix ..." (sem avançar).
- 6.11 "qual a chave?" / "me manda o qr" enquanto espera → reenvia a chave.
- 6.12 Depois de receber a chave, "na verdade pago na recepção" → segue sem pix.
- 6.13 "link de crédito" / "vou pagar com cartão de crédito" → "Combinado! Vou passar pra equipe te enviar o link de pagamento e concluir o agendamento." e **vai para o atendimento do time** com a vaga anotada. Se você escrever depois, a Amanda fica quieta (a equipe assume). Não termina o agendamento sozinha.
- 6.14 Resposta solta depois da chave ("hum", "ok") → "Tô aguardando o comprovante do pix pra seguir com o seu agendamento, tá? Se preferir pagar na recepção é só me avisar."
- 6.15 "não quero antecipar", "pago lá", "depois eu pago", "só quero agendar" → recepção.
- 6.16 "aceita cartão?" / "posso pagar no cartão?" depois da chave → explica ("Na recepção, no dia, aceitamos pix, cartão de crédito e débito e dinheiro") e segue esperando o comprovante. **Não** vira escolha de link nem transfere.
- 6.17 Dúvidas sobre o pagamento, em linguagem solta: "preciso pagar agora?", "se eu não pagar perco a vaga?", "o pix é obrigatório?" → responde com o que a clínica informa (antecipar por pix é opcional e serve para agilizar; dá para pagar na recepção, no dia) e segue esperando o comprovante.
- 6.18 Dúvidas que ela não tem como saber: "esse pix é seguro?", "posso parcelar em quantas vezes?" → não inventa: "Essa eu prefiro confirmar direitinho antes de te responder, pra não te passar nada errado. Se quiser, é só me pedir que eu chamo alguém da recepção pra te ajudar." e continua esperando o comprovante.
- 6.19 "quanto é mesmo?" / "qual o valor?" depois da chave → responde o valor e reenvia a chave.
- 6.20 Depois da chave, "queria outro dia" / "mudar o horário" → ela troca o horário e manda o pix de novo, já com o novo horário. "Outro dia eu pago" **não** troca o horário.

## Fluxo 7. CPF, paciente e cadastro

- 7.1 CPF com pontos e traço, só números, com espaços ("123 456 789 09") e falado em áudio.
- 7.2 CPF com um dígito errado → "Acho que algum número do CPF escapou, dá uma olhadinha e me manda de novo os 11 números?" Não consulta o cadastro.
- 7.3 CPF com todos os dígitos iguais (111.111.111-11) → recusa do mesmo jeito.
- 7.4 Texto com número que não parece CPF ("12") → "Não consegui ler o CPF. Pode me mandar os 11 números?"
- 7.5 Paciente existe e você diz "não é esse" → "Sem problema. Dá uma conferida no CPF e me manda de novo?" e volta ao CPF.
- 7.6 Responder outra coisa quando ela mostra o nome → repete a pergunta com o nome.
- 7.7 **CPF novo (cadastro), um dado por mensagem:** "Esse CPF ainda não tá no cadastro, vou fazer agora. Qual o nome completo do paciente?" → nome → "Prazer, [nome]! E a data de nascimento?" → nascimento → "O cadastro pede o sexo: feminino ou masculino?" → "E esse número do WhatsApp, posso usar de contato?"
- 7.8 Nome com enfeite ("meu nome é Joana Souza", "me chamo Joana Souza") → ela limpa e usa só o nome.
- 7.9 Nascimento: "10/05/1990", "10-05-1990", "10 de maio de 1990" (aceita); "31/02/1990" ou ano futuro (recusa e pergunta de novo).
- 7.10 Sexo: "feminino", "mulher", "sou mulher", "masculino", "homem".
- 7.11 Telefone: "sim" usa o número do WhatsApp; ou digitar outro com DDD.
- 7.12 Agendar **para outra pessoa**: o nome do seu WhatsApp é diferente do paciente. Ela nunca chama você de "o paciente" e o nome que vale é o do cadastro do CPF.
- 7.13 Tentar agendar **o mesmo serviço, no mesmo dia, para o mesmo paciente** de novo → ela NÃO transfere: explica qual agendamento já existe e espera a sua decisão (veja o fluxo 11).

## Fluxo 8. Dúvidas no meio da conversa

Faça cada uma em etapas diferentes (antes do serviço, na unidade, nos horários, no pagamento, no CPF). Ela responde e **volta para a pergunta em que estava**:

- 8.1 "qual o horário de atendimento?", "abre sábado?" → horário da clínica.
- 8.2 "quanto custa?", "qual o valor da consulta de ginecologia?" → valor (e, sem serviço, pergunta qual).
- 8.3 "quais as formas de pagamento?", "aceita cartão?", "posso parcelar?"
- 8.4 "quais médicos atendem?", "quais unidades vocês têm?"
- 8.5 "qual o endereço?", "como chego aí?", "onde fica?" → manda o endereço aprovado pela clínica, **uma mensagem para cada unidade**: "Guamá: Endereço: Av. José Bonifácio, 2426 - Guamá, Belém - PA, 66063-075" com o link do mapa (https://share.google/VHM9fHMaWIUZujkl3) e "Telégrafo: Travessa Coronel Luís Bentes com a Rua do Úna, nº 170A, no bairro do Telégrafo, em Belém (PA)." Depois volta para a pergunta em que estava. Se você citar a unidade ("endereço do Telégrafo?"), manda só a dela, **sem escolher essa unidade** para o agendamento. Se você já escolheu a unidade, manda a dela. Nunca "a equipe passa".
- 8.6 "vocês atendem Unimed?" (convênio) → a equipe confirma, não inventa.
- 8.7 "preciso de jejum?", "o que levar?" → a equipe orienta.
- 8.8 "??", "oi?", "tá aí?", "alguém aí?" → "Tô aqui!" e repete a pergunta pendente.
- 8.9 Dúvida junto com o pedido: "quanto custa a consulta de ginecologia?" → valor e confirma o serviço na mesma mensagem.
- 8.10 Dúvida **e depois** o pedido: o fluxo segue normal.

## Fluxo 9. Segurança e equipe

- 9.1 "estou com dor forte no peito" / "falta de ar" / "acho que estou tendo um infarto" → orienta pronto-socorro e 192, **transfere**, responde em poucos segundos.
- 9.2 "não quero mais viver" → acolhe, cita o CVV 188, transfere na hora.
- 9.3 Emergência **no meio** do agendamento (na lista de horários, no pagamento) → mesma resposta.
- 9.4 "quero falar com uma atendente" / "pessoa de verdade" / "chama a recepção" → "Claro! Vou chamar alguém da equipe pra te ajudar." e transfere. Depois disso ela **não retoma sozinha** se você voltar a escrever.
- 9.5 Pedir atendente em várias etapas (serviço, lista, pagamento, CPF).
- 9.6 Transferência que NÃO foi pedida por você (link de crédito, comprovante com problema, serviço não encontrado que você aceitou passar): depois, se você voltar a escrever **antes de um atendente assumir**, a Amanda retoma de onde parou.
- 9.7 Serviço **sem nenhuma vaga** aberta → "Poxa, no momento não tenho vaga aberta pra ..." e chama a equipe.
- 9.8 Escrever no meio de uma conversa que um **atendente humano já assumiu** → ela fica quieta.
- 9.9 Se você tiver como simular o Clinilink fora do ar: ela diz "Tô com dificuldade pra consultar a agenda agora" e chama a equipe, sem inventar horário.

## Fluxo 10. Depois do agendamento e comportamento da conversa

- 10.1 Logo depois de "Agendamento confirmado", mandar "obrigado" → "Imagina, foi um prazer! Posso te ajudar com mais alguma coisa?" (**não** abre um pedido novo).
- 10.2 Responder "era só isso" / "não, obrigado" → "Por nada! Foi um prazer te atender. Tenha um ótimo dia e se cuida, tá?"
- 10.3 Mandar "valeu" ou 👍 **depois da despedida** → ela fica em silêncio.
- 10.4 Depois do "obrigado" dela, responder "sim, quero marcar outro" → "Que bom! Me conta qual consulta ou exame você quer agendar." e o novo agendamento começa do zero.
- 10.5 Depois da confirmação, já pedir outro serviço ("quero marcar dermatologia") → começa o novo fluxo sem apresentação de novo.
- 10.6 Voltar depois de um tempo: "voltei, quero continuar o agendamento" → "Que bom que você voltou! Vamos retomar o seu agendamento. Qual consulta ou exame você precisa?"
- 10.7 **Mensagens picadas**: mande 3 mensagens seguidas em menos de 30 segundos ("oi", "quero ginecologia", "pra amanhã"). Ela deve responder **uma vez só**, considerando as três. Se você mandar mais uma mensagem **enquanto ela está "digitando"** a resposta, essa resposta não sai (já estaria desatualizada): ela espera mais 30 s e responde uma vez, lendo tudo. Se a mensagem nova vier mais de 30 s depois da anterior, ela responde a anterior primeiro (e depois a nova).
- 10.8 Corrigir no meio da frase ("quinta... não, sexta mesmo"): observe qual dia ela entende e me diga (esse caso não tem tratamento próprio).
- 10.9 Só emoji (👍) no meio do fluxo: observe a reação (não deve travar nem reiniciar).
- 10.10 Escrever de um número **não autorizado** → nenhuma resposta.
- 10.11 Conversa que ficou parada **no meio** por horas ou dias e você escreve de novo: observe se ela retoma de onde parou ou recomeça, e me diga qual das duas você prefere. Depois de um agendamento concluído, uma mensagem nova abre uma jornada nova, sem se apresentar de novo.
- 10.13 **Parece digitado:** uma resposta curta ("Claro! Qual consulta ou exame você precisa?") chega depois de uns 2 a 5 s; uma lista de horários (resposta grande) demora bem mais (até uns 12 s). Cronometre uma curta e uma longa: a longa tem que demorar visivelmente mais. (Isso vem depois da espera de cerca de 30 s para agrupar suas mensagens.)
- 10.14 **Balões:** quando a resposta tem uma dúvida respondida + a pergunta do fluxo (ex.: "qual o horário de atendimento?" no meio do agendamento), chegam **dois balões** separados, cada um com seu tempo. O pix chega em **três balões** (a chave fica sozinha, fácil de copiar). Só o primeiro balão leva o título "Amanda S. (Clinex):".
- 10.17 **Atualização do sistema no meio da conversa** (com o estado guardado ativo): se eu atualizar a Amanda enquanto você está numa etapa (ex.: já no pagamento), ela continua da mesma etapa e **não volta** para a escolha do serviço. Peça para eu avisar quando fizer a atualização e continue a mesma conversa.
- 10.15 Emergência e crise **não** esperam esse tempo: respondem em poucos segundos.
- 10.16 Demora total: do seu "oi" até a resposta, no primeiro contato do dia, deve ficar perto de 35 a 45 s (30 s de espera + digitação). Se passar de 1 minuto, me avise o horário (o Clinilink pode ter demorado a "acordar").
- 10.12 Primeira mensagem com nome do WhatsApp esquisito (emoji, número): ela não usa o nome na saudação ("Oi, boa tarde! Aqui é a Amanda...").

---

## Fluxo 11. Remarcação e agendamento repetido no mesmo dia

**Atenção:** estes testes gravam de verdade. Use um paciente de teste que **já tenha** o serviço marcado no dia que você vai escolher (ou faça um agendamento e repita o mesmo logo depois). O que a Amanda faz sozinha hoje: explicar o agendamento que já existe e esperar a sua decisão. **Remarcar de fato ainda é com a equipe** (ela transfere com tudo anotado).

| # | Você manda | Esperado |
|---|---|---|
| 11.1 | Faça o fluxo completo até o "sim" final com um paciente que **já tem** aquele serviço naquele dia | Ela NÃO transfere. Responde: "Vi que esse paciente já tem [serviço] marcado pra [dia] no [unidade] [período] a partir das [hora] com [Dr./Dra.]." e pergunta "O que você prefere: manter esse que já está marcado, marcar mais um em outro dia ou remarcar esse que já está agendado?" |
| 11.2 | "já tá agendado teste ergométrico então?" (ou "então já está marcado?") | Responde **no contexto**: "Isso mesmo! Vi que esse paciente já tem ..." e repete as opções. **Nunca** pode voltar a "Ah, então é Teste Ergométrico, né?" nem recomeçar o fluxo. |
| 11.3 | "pode manter" / "deixa assim" / "era só pra conferir" | "Combinado, fica mantido o que já está marcado. Posso te ajudar com mais alguma coisa?" Nada é gravado. Depois "obrigado" → despedida. |
| 11.4 | "quero remarcar" / "preciso trocar esse" | "Combinado! Vou chamar alguém da equipe pra remarcar esse agendamento." e transfere, com a anotação REMARCAR (serviço, dia, unidade, hora e médico do agendamento que já existe). Nada novo é gravado. Se você escrever de novo, a Amanda fica quieta (a equipe assume). |
| 11.5 | "quero marcar mais um em outro dia" | "Beleza, vamos marcar mais um em outro dia." + lista de horários **sem o dia que já está ocupado**. Escolher um número **reserva de verdade** (grava!) |
| 11.6 | "quero mudar o dia" (ambíguo) | "Você quer remarcar o que já está agendado pra esse outro dia ou marcar mais um além dele?" Depois: "remarcar o que já tenho" → equipe; "mais um além desse" → lista de outros dias. Ela não grava nada antes de entender. |
| 11.7 | Responder "hmm", "sei lá", "não sei" (3 vezes) | Repete o agendamento e as opções; na terceira chama a equipe (não fica em loop). |
| 11.8 | Perguntar outra coisa no meio ("que horas é?", "com quem é?") | Responde com o agendamento que já existe e repete as opções. Não reinicia a conversa. |
| 11.9 | Sem estar no meio de um agendamento: "quero remarcar minha consulta", "preciso cancelar" | "Claro! Pra remarcar ou cancelar eu chamo alguém da equipe pra te ajudar." e transfere (ela ainda não remarca nem cancela sozinha). |
| 11.10 | Se o Clinilink recusar a reserva por outro motivo (vaga ocupada, erro) | Ela avisa, transfere com tudo anotado e **não retoma sozinha** se você escrever depois (antes, ela recomeçava a conversa do zero). |
| 11.11 | Depois de decidir "mais um em outro dia", mudar de ideia: "na verdade pode manter o primeiro" | Observe: ela deve entender e manter (me diga o que acontece). |

## Fluxo 12. Agendamento de combo

**Hoje a Amanda ainda não agenda combos.** O Clinilink tem combos (por exemplo "check-up feminino", com vários serviços e um preço próprio) e a API já permite reservar um serviço de cada vez com o combo, mas o fluxo da Amanda **ainda não foi construído**. Estes testes servem para você conferir o que acontece hoje e para eu desenhar o fluxo certo.

- 12.1 "quero agendar um combo" / "tem pacote de check-up?" → hoje: "Os combos eu ainda não consigo agendar por aqui. Vou chamar alguém da equipe pra te ajudar com isso." e transfere (não procura "combo" como se fosse um exame).
- 12.2 "quais combos vocês têm?" → hoje também chama a equipe. Anote o que você esperava que ela respondesse (lista de combos, preços, o que inclui).
- 12.3 Depois da transferência, escreva de novo: ela fica quieta (a equipe assume).
- 12.4 **Para o fluxo futuro**, anote como você quer que seja: ela lista os combos disponíveis e o que cada um inclui? Mostra o preço do combo? Agenda todos os serviços no mesmo dia, em dias diferentes, ou pergunta? Como lida quando um dos serviços não tem agenda? Cobra tudo junto no pix?
- 12.5 (PENDENTE DE DESENVOLVIMENTO) "quero o check-up feminino" → mostra o combo (serviços e valor), pergunta unidade e dia, reserva cada serviço do combo e confirma tudo numa mensagem.
- 12.6 (PENDENTE DE DESENVOLVIMENTO) Combo com um serviço sem horário: avisa qual falta e oferece outro dia ou a equipe.

## Fluxo 13. Ler o contexto da conversa

Antes de responder, a Amanda lê a conversa inteira (os dois lados e a pergunta que ficou pendente). Quando a sua mensagem não responde à pergunta dela, ela responde ao que você perguntou, **usando só o que já sabe do agendamento**, e depois repete a pergunta pendente. O que ela não sabe, ela não inventa.

| # | Você manda | Esperado |
|---|---|---|
| 13.1 | Depois de "Agendamento confirmado": "já tá agendado teste ergométrico então?" | "Está sim, confirmado! Olha como ficou:" e, em mensagem separada, o mesmo modelo da clínica que foi enviado na confirmação (Paciente, Profissional, Procedimento, Data ...). **Nunca** "Ah, então é Teste Ergométrico, né?". Depois "obrigado" → "Posso te ajudar com mais alguma coisa?" |
| 13.2 | Variações depois da confirmação: "então está marcado?", "deu certo?", "ficou confirmado?", "qual o horário mesmo?" | Mesma resposta (os dados do que foi confirmado). |
| 13.3 | No meio do agendamento (ela perguntou a unidade ou o pagamento): "então já tá agendado?" | "Ainda não está agendado. [o que falta]" + repete a pergunta pendente. Nunca diz que está agendado antes de estar. |
| 13.4 | "quanto é mesmo?" / "e o valor?" | O valor do serviço + repete a pergunta pendente. |
| 13.5 | "com quem vai ser?" / "qual a unidade mesmo?" / "e o horário?" | Responde com o que já foi escolhido + repete a pergunta pendente. |
| 13.6 | Perguntas que ela não tem como saber: "quanto tempo dura a consulta?", "precisa de jejum?", "tem estacionamento?" | Não inventa nada. Segue com a pergunta pendente (ou oferece a equipe). Anote se a resposta ficou estranha. |
| 13.7 | "a doutora é boa?" | Não opina nem elogia. Segue o fluxo. |
| 13.8 | Desabafo: "tô com medo de ir" | Segue o fluxo, sem frase de robô ("estou aqui pra ajudar"). Me diga o que você esperava que ela dissesse. |
| 13.9 | Logo no começo: "como funciona isso?" | Só responde se der com o que sabe; senão, "Me conta o que você precisa". Nunca "Não achei funciona pra agendar". |
| 13.10 | "preciso agendar um exame" → (lista) → "daqueles de sangue" | Entende no contexto (exame de sangue) e procura no Clinilink. |
| 13.11 | Em qualquer ponto do fluxo, pergunte algo sobre o que ela acabou de dizer ("como assim?", "isso é o quê?") | Responde no contexto e repete a pergunta. Nunca reinicia o fluxo. |
| 13.12 | Depois de dois ou três minutos parado, volte com "e aí?" | Ela retoma de onde parou (não se apresenta de novo, não recomeça). |

**O que nunca pode acontecer:** voltar para "Ah, então é ..., né?" quando você perguntou algo sobre o que já foi dito; repetir a lista de horários sem necessidade; se apresentar de novo no meio da conversa; dizer que algo está agendado sem estar.

## Fluxo 14. Confirmação no modelo da clínica e sugestões (várias mensagens)

Depois que o agendamento é gravado no Clinilink, a confirmação sai **em mensagens separadas**, cada uma com a sua pausa de digitação. O modelo da clínica leva os dados reais da unidade escolhida e do procedimento. Emoji e negrito (`*POR ORDEM DE CHEGADA*`) existem **só** nesse modelo; no resto da conversa continua sem emoji.

| # | Você faz | Esperado |
|---|---|---|
| 14.1 | Agende uma consulta até o fim (paciente que já existe) | 3 mensagens: (1) "Agendamento confirmado! Deu tudo certo, [nome]."; (2) o modelo da clínica; (3) "Se puder, chega cedinho, que o atendimento é por ordem de chegada. Quer aproveitar e agendar mais algum exame ou consulta?" Só a primeira leva o título "Amanda S. (Clinex):". |
| 14.2 | Confira linha por linha o modelo | `Paciente:` nome do cadastro. `Profissional:` Dr./Dra. + nome (ou o nome da sala, ex.: ".SALA DE EXAMES"). `Procedimento:` NOME DO PROCEDIMENTO - profissional. `📆 Data:` dd/mm/aaaa a partir de HH:MM *POR ORDEM DE CHEGADA*. `🏥 Clínica:` CLINEX + unidade. `📍 Endereço:`, `☎ Telefone:` e `📲 WhatsApp:` da unidade escolhida. `Valor particular:` o preço do Clinilink (nunca R$ 0,00; sem preço, "a confirmar na recepção"). |
| 14.3 | Agende no Guamá e depois no Telégrafo | O endereço e o telefone mudam conforme a unidade. |
| 14.4 | Paciente **novo** (cadastro feito na conversa) | A primeira mensagem diz "Cadastro de [nome completo] feito." |
| 14.5 | Pague o pix na conversa (comprovante certo), depois conclua o agendamento | `Formas de pagamento: PAGO NO PIX (comprovante recebido)` (em vez da lista de formas). |
| 14.6 | Pague só uma parte no pix e deixe o resto pra recepção | `Formas de pagamento: PAGO R$ X NO PIX (comprovante recebido); o restante na recepção`. |
| 14.7 | Escolha "na recepção" (sem pix) | `Formas de pagamento: CARTÃO DE DÉBITO, CREDITO (VISA E MASTER), DINHEIRO, PIX`. |
| 14.8 | Agende um exame que tem **orientação cadastrada** no Clinilink (ex.: teste ergométrico: "NO MÁXIMO ATÉ 70 ANOS") | Já na informação das unidades, uma mensagem separada: "Uma orientação importante pra esse atendimento: ...". Na confirmação, de novo, em mensagem própria entre o modelo e a sugestão. Procedimento sem orientação: nada é inventado. |
| 14.9 | Peça um serviço em que a **outra unidade** tem vaga mais cedo | Depois da lista de horários, em mensagem separada: "Se for mais fácil, no [outra unidade] tenho [dia] ..., mais cedo que esses. Se quiser, é só me dizer que eu mostro os horários de lá." Responda "pode ser o Telégrafo" → mostra os horários de lá. Sem vaga mais cedo, ela não sugere nada. |
| 14.10 | Peça, em outro agendamento, "já tá agendado?" | Veja o 13.1: ela repete o modelo da clínica, sem recomeçar. |

**Limite conhecido:** a Amanda não gera OS nem faturamento (o Clinilink não tem essa função na API de parceiros). Quando você pagou o pix na conversa, a confirmação **mostra** "PAGO NO PIX", mas a baixa financeira continua com a recepção.

## Fluxo 15. Pedir a agenda e "um/uma" no começo da frase

A Amanda não faz o paciente esperar outra mensagem para ver os horários: quando ele pergunta pela agenda, ela mostra os horários na mesma resposta. E "um/uma/dois" no começo de uma frase é artigo, não é o número da opção.

| # | Você manda | Esperado |
|---|---|---|
| 15.1 | "boa tarde quero agendar uma consulta" e depois "um teste ergo" | Lista das consultas mais procuradas e, em seguida, "Ah, então é Teste Ergométrico, né?". **Nunca** "consulta Ginecologista" (que é a opção 1 da lista). |
| 15.2 | Com a lista de consultas na tela: "uma consulta de cardiologia" | Entende como pedido novo (Cardiologia), não como a opção 1. |
| 15.3 | Com a lista na tela: só "1", "um", "o dois", "opção três" | Escolhe a posição certa. |
| 15.4 | Serviço com duas unidades: "quando tem agenda?" (ou "tem horário?", "tem vaga?", "quais as datas disponíveis?") | Na mesma resposta: o resumo (unidades, médicos, preço) **e** "Consegui estes aqui:" com os próximos horários das duas unidades, cada item dizendo a unidade. Sem "Qual dos dois fica melhor?". Termina com "Se preferir uma unidade ou outro dia, é só me falar." |
| 15.5 | Pediu a agenda já no começo ("tem agenda de ginecologista?") e depois confirma o serviço com "sim" | Resumo e lista de horários chegam juntos (em mensagens separadas). |
| 15.6 | Com a lista mista na tela, responda "2" | Fica com o horário e a unidade do item 2 e segue para o pix. |
| 15.7 | Com a lista mista na tela, responda "Guamá" (ou "telégrafo") | Mostra só os horários dessa unidade, sem o nome da unidade em cada item. |
| 15.8 | Com a lista mista na tela, responda "amanhã" | Horários de amanhã nas unidades (cada item com a unidade). Sem vaga amanhã: "Pra amanhã não tenho vaga. Mas consegui estes aqui:". |
| 15.9 | Já escolhida a unidade e com a lista de horários na tela: "quando tem agenda?" | "Esses são os horários que tenho no [unidade]:" e a mesma lista. **Nunca** "Tenho também:" (outras datas) e **nunca** "Essa eu prefiro confirmar...". |
| 15.10 | Só "quero agendar ginecologista" e "sim" (sem pedir agenda nem dia) | Continua como antes: resumo e "Qual dos dois fica melhor pra você?". |
| 15.11 | "quero ginecologista amanhã de manhã" e "sim" | Como disse o dia e o período, mostra amanhã de manhã nas duas unidades (sem perguntar a unidade antes). |

**O que nunca pode acontecer:** responder pergunta de agenda com "a equipe confirma" ou "chamo alguém". A Amanda é quem atende: se ela tem o horário, mostra.

## Fluxo 16. Do jeito que os pacientes escrevem no dia a dia (baseado em duas conversas reais das atendentes)

Frases de pacientes reais, com erro de digitação, gíria e várias mensagens seguidas. A Amanda tem que se comportar como a atendente: escolher o serviço certo sem perguntar o óbvio, responder o que foi perguntado e seguir.

| # | Você manda | Esperado |
|---|---|---|
| 16.1 | "Crônico geral" (erro de "clínico geral") | "Ah, então é Clinico Geral Consulta, né?" (uma só, **sem** lista com duas opções iguais). |
| 16.2 | "Meu bem vocês teriam disponibilidade para essa semana de consulta com a ginecologista" | Confirma "consulta Ginecologista" (**sem** "Retorno" na lista). Depois do "sim": se não houver vaga essa semana, "Pra essa semana não tenho horário. Mas consegui estes aqui:". |
| 16.3 | "Quero fazer uma ultrassom transvaginal" | Confirma "Usg Transvaginal" (a simples, R$ 90), **sem** listar "com Doppler", "folículos", "colo uterino". Se você pedir "com doppler", aí sim. |
| 16.4 | Com a Ginecologista confirmada ou com a lista de horários na tela: "E a transvaginal?" | Troca para a transvaginal e segue (não responde "essa eu prefiro confirmar" nem repete a lista da Gineco). |
| 16.5 | "Qual o valor?" no meio da conversa | Diz o valor do serviço e retoma. |
| 16.6 | "Tem algum preparado? Eu to no final da minha menstruação" | Se o procedimento tem **preparo cadastrado no Clinilink**, manda o preparo; senão, "Sobre preparo eu prefiro confirmar direitinho pra não te orientar errado. Se quiser, é só me pedir que eu chamo alguém da recepção pra te passar." (sem "a equipe"). |
| 16.7 | Procedimento com preparo cadastrado no Clinilink em várias linhas (jejum, véspera...) | Depois do resumo das unidades e do preço, o preparo vai como **mensagem própria, com as linhas do cadastro**, sem "Uma orientação importante" na frente (preparo curto, de uma linha, leva essa frase). O mesmo texto vem depois da confirmação. A Amanda **não tem textos de preparo próprios**: só usa o que está no Clinilink. |
| 16.8 | "Tem horário hoje?" (durante o dia) | Mostra os horários de **hoje** que ainda restam ("hoje, à tarde, a partir das 16h"). Sem vaga hoje: "Pra hoje não tenho vaga. Mas consegui estes aqui:". As listas normais também já começam por hoje. |
| 16.9 | No pagamento, "Já pode deixar pago?" | "Pode sim! Aqui está a chave:" + chave + valor. |
| 16.10 | No pagamento, "Meu bem não quer enviar" (o pix não vai) | "Sem problema! Se o pix não quiser enviar, você pode pagar na recepção, no dia do atendimento, ou eu chamo alguém pra te mandar um link de pagamento." |
| 16.11 | "Eu pago assim que chegar aí" / "Mas pode deixar agendado" | Entende como pagar na recepção e segue para o CPF. |
| 16.12 | Depois do CPF novo, mandar numa rajada: nome, telefone, CPF (ou qualquer ordem, ou um por vez) | Anota tudo, o sexo sai do primeiro nome (Joana = feminino; nome que ela não conhece, ela pergunta) e só pede o que falta: "Falta só a data de nascimento." |
| 16.13 | "um minuto, já vou mandar" no meio dos dados | Não vira nome do paciente. |
| 16.14 | CPF que já existe, mesmo mandando nome e telefone antes | Mostra só o nome para confirmar (não pede nascimento nem telefone). |
| 16.15 | Com a lista de opções na tela, "vou pagar na recepção" ou "hoje" | Não procura serviço nessa frase (antes achava "Retenção" em "recepção"); anota e repete a pergunta. |
| 16.16 | "Silmara EMANUELE Sousa da Silva" (só o nome, como a paciente responde ao "me diga seu nome completo e o que você gostaria") | "Prazer, Silmara! Me conta o que você precisa?" (frases de pedido como "consulta marcada anterior" ou "quero marcar" **não** viram nome). |
| 16.17 | "Eu queria realizar um exame de sangue ainda hoje" | Lista os **exames de laboratório mais procurados com agenda** (Hemograma, Glicemia, Urina...) e pergunta qual. **Nunca** "Sangue Oculto". Depois de "Sangue" sozinho, a lista continua. "Sangue oculto" (específico) não vira a lista. |
| 16.18 | Com um serviço pendente de confirmação: "Posso fazer agora pela manhã?" | Continua no mesmo serviço (antes virava "consulta Ortopedista", porque "posso" tem "osso") e entende **hoje de manhã**. |
| 16.19 | "quanto custa uma transvaginal?" (valor + serviço na mesma frase) | Diz o valor ("O exame é R$ 90,00.") e confirma o serviço. "Quanto custa?" sem serviço pede qual consulta ou exame, sem "essa eu prefiro confirmar". |
| 16.20 | "Solicitar Orçamento" | "Claro! Me diz qual consulta ou exame você quer o valor. Se for pedido médico, pode digitar o nome dos exames que eu vejo um por um." |
| 16.21 | Serviço cujo "profissional" no Clinilink é uma sala ("Coleta", "Exames", ".SALA DE EXAMES") | Não aparece "com Coleta" nem "com Exames" (só médicos aparecem). No modelo da confirmação, o Profissional continua como está no cadastro. |

**Ainda não faz (conversas reais mostram que os pacientes pedem):** combos ("Quanto tá um combo?", "AGENDAR III"); gerar o recibo/OS em PDF depois do pagamento; mandar só o horário mais próximo em vez de lista (hoje manda até 4 opções).

## Como me passar o resultado

Para cada cenário que falhar ou ficar estranho, me mande o número (ex.: **4.10**), o que você escreveu e o que ela respondeu (print ou texto). Se puder, cole também a linha do `/painel/logs`. Assim eu corrijo e acrescento o caso nos testes automáticos.
