# Roteiro de testes da Amanda, de ponta a ponta

Escrito para: Giovanny, para testar a Amanda no WhatsApp com vários cenários em 10 fluxos.

## Antes de começar

- **Só números autorizados recebem resposta.** De outro número ela fica quieta (isso também é um teste: o fluxo 10).
- **Para ligar a Amanda em uma conversa não precisa mais mover para o setor Agente IA:** basta o contato ter a etiqueta **Amanda** na Inovstar (a etiqueta é do contato, vale para todos os atendimentos dele). O número também precisa estar autorizado.
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
| 1.5 | "2" | Resumo "Beleza, então fica ... por ordem de chegada ..." + "Pra agilizar o seu atendimento na recepção, você quer antecipar o pagamento por pix ou link de crédito?" |
| 1.6 | "na recepção" | "Sem problema nenhum o pagamento fica pra recepção no dia do atendimento. Me passa o CPF do paciente pra eu reservar?" |
| 1.7 | CPF de paciente que já existe | "Achei aqui o cadastro de [Nome]. É esse mesmo o paciente?" (só o nome, nenhum outro dado) |
| 1.8 | "sim" | "Agendamento confirmado! Deu tudo certo ..." com serviço, unidade, dia, período, médico com Dr./Dra. e "por ordem de chegada" |

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
- 2.8 "quero marcar uma consulta" (sem dizer qual) → "Claro! Qual consulta ou exame você precisa?" (sem dizer que não entendeu).
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

- 6.1 "pix" → "Show! A chave pix é essa, o valor é R$ ...:" + "Chave pix: ..." + pede o comprovante.
- 6.2 Mandar um **comprovante certo** (hoje, valor igual ao da consulta, recebedor da Clinex) → "Recebi o seu comprovante, muito obrigada! Agora pra eu fazer a reserva pode me passar o CPF do paciente?"
- 6.3 Comprovante com **valor maior** → aceita.
- 6.4 Comprovante com **valor menor** → "Recebi o seu comprovante de R$ X. O valor é R$ Y, então ainda faltam R$ Z. Prefere pagar o restante agora por pix ou deixar para pagar na recepção?" Mande um segundo comprovante que complete (confirma) ou responda "na recepção" (o resto fica pra recepção).
- 6.5 Comprovante **de dias atrás** → pede o de hoje.
- 6.6 **Mesmo comprovante duas vezes** → "Esse comprovante eu já recebi..." e não soma de novo.
- 6.7 Comprovante para **outra pessoa/chave** → avisa que o recebedor é diferente e chama a equipe.
- 6.8 Imagem que **não é comprovante** (uma foto qualquer) → pede o comprovante. Imagem ilegível → "Não to conseguindo ler esse comprovante, pode me mandar de novo?"
- 6.9 Três imagens que não servem → chama a equipe.
- 6.10 "já paguei" sem imagem → pede o comprovante. Outra mensagem qualquer enquanto espera → "Tô aguardando o comprovante do pix ..." (sem avançar).
- 6.11 "qual a chave?" / "me manda o qr" enquanto espera → reenvia a chave.
- 6.12 Depois de receber a chave, "na verdade pago na recepção" → segue sem pix.
- 6.13 "link" / "crédito" / "cartão" → chama a equipe para mandar o link (não termina o agendamento sozinha).
- 6.14 Resposta solta à pergunta do pagamento ("hum") → "Você prefere pagar por pix, link de crédito ou lá na recepção, no dia?" Na terceira vez chama a equipe.
- 6.15 "não quero antecipar", "pago lá", "depois eu pago", "só quero agendar" → recepção.
- 6.16 "aceita cartão?" na pergunta do pagamento → explica as formas e **volta a perguntar** (não conta como escolha).

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
- 7.13 Tentar agendar **o mesmo serviço, no mesmo dia, para o mesmo paciente** de novo → "Vi que este paciente já tem esse atendimento marcado pro mesmo dia." e chama a equipe.

## Fluxo 8. Dúvidas no meio da conversa

Faça cada uma em etapas diferentes (antes do serviço, na unidade, nos horários, no pagamento, no CPF). Ela responde e **volta para a pergunta em que estava**:

- 8.1 "qual o horário de atendimento?", "abre sábado?" → horário da clínica.
- 8.2 "quanto custa?", "qual o valor da consulta de ginecologia?" → valor (e, sem serviço, pergunta qual).
- 8.3 "quais as formas de pagamento?", "aceita cartão?", "posso parcelar?"
- 8.4 "quais médicos atendem?", "quais unidades vocês têm?"
- 8.5 "qual o endereço?", "como chego aí?" → não inventa: a equipe passa. Oferece chamar.
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
- 10.7 **Mensagens picadas**: mande 3 mensagens seguidas em menos de 30 segundos ("oi", "quero ginecologia", "pra amanhã"). Ela deve responder **uma vez só**, considerando as três.
- 10.8 Corrigir no meio da frase ("quinta... não, sexta mesmo"): observe qual dia ela entende e me diga (esse caso não tem tratamento próprio).
- 10.9 Só emoji (👍) no meio do fluxo: observe a reação (não deve travar nem reiniciar).
- 10.10 Escrever de um número **não autorizado** → nenhuma resposta.
- 10.11 Conversa que ficou parada **no meio** por horas ou dias e você escreve de novo: observe se ela retoma de onde parou ou recomeça, e me diga qual das duas você prefere. Depois de um agendamento concluído, uma mensagem nova abre uma jornada nova, sem se apresentar de novo.
- 10.12 Primeira mensagem com nome do WhatsApp esquisito (emoji, número): ela não usa o nome na saudação ("Oi, boa tarde! Aqui é a Amanda...").

---

## Como me passar o resultado

Para cada cenário que falhar ou ficar estranho, me mande o número (ex.: **4.10**), o que você escreveu e o que ela respondeu (print ou texto). Se puder, cole também a linha do `/painel/logs`. Assim eu corrijo e acrescento o caso nos testes automáticos.
