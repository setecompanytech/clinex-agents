/**
 * Simula conversas com a Amanda IA usando a agenda REAL do Clinilink (só leitura): o agendamento é falso (nada é gravado).
 * Uso: npx tsx --env-file=.env scripts/teste-ia.ts [nome-do-caso]
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import type { InovstarMessage } from '../src/integrations/inovstar.js';
import { atenderComIA } from '../src/agents/receptivo/ia/atender.js';
import type { MemoriaIA } from '../src/agents/receptivo/ia/ferramentas.js';
import { fonteClinilink } from '../src/agents/receptivo/script/clinilinkFonte.js';
import type { Fonte } from '../src/agents/receptivo/script/catalog.js';

const TITULO = '*Amanda S. (Clinex):*';
const fonte: Fonte = {
  ...fonteClinilink,
  async gerarOS(id) { console.log(`   [gerarOS] agendamento=${id}`); return { ok: true, id: "os-teste-1" }; },
  async reservar(p) { console.log(`   [reservar] combo=${p.comboId ?? "-"} itens=${(p.servico.combo?.itens ?? []).map((i) => i.nome).join("+") || "-"} proc=${p.servico.nome} paciente=${p.pacienteId ?? "novo"} cadastro=${JSON.stringify(p.cadastro ?? null)}`); return { ok: true, hora: p.slot.inicio, cadastrou: !p.pacienteId, pacienteId: p.pacienteId ?? 'novo-123', agendamentoId: 'ag-teste-1', profissional: p.slot.profissional, profissionalBruto: p.slot.profissionalBruto }; },
};

const CASOS: Record<string, string[]> = {
  // caso real 18/11: pediu clínico geral e recebeu R$ 90 + combo antes da pergunta "consulta nova ou retorno?"
  clinicoRetorno: ['Bom dia quero fazer uma consulta', 'preciso de clinico geral', 'guama', 'é nova'],
  gineco: ['oi', 'quero agendar ginecologista', 'guamá', 'o primeiro', 'Maria Clara Souza 12/03/1990', 'pode ser esse número mesmo', 'feminino', 'na recepção', 'beleza', 'obrigada, só isso'],
  ultra: ['boa tarde, vocês fazem ultrassom?', 'obstétrica', 'tem pra essa semana?'],
  matheus: ['Oi, quero marcar USG obstétrico', 'telegrafo com a Ana Clara', 'pode ser o primeiro'],
  sangue: ['quero fazer exame de sangue', 'hemograma, glicose e colesterol total', 'quero agendar a coleta'],
  preco: ['quanto custa a consulta com cardiologista?', 'e qual o endereço do guamá?'],
  resultado: ['quero saber o resultado do meu exame de ontem'],
  nomeja: ['oi, sou a Rafaela dos Reis Barros, quero agendar ginecologista', 'guamá', 'o primeiro', '10/04/1992, pode ser esse número', 'sim', 'feminino'],
  tres: ['quero fazer usg de abdome total', 'guamá', 'tem outros dias?'],
  hc1: ['quero agendar ginecologista', 'guamá', 'o primeiro', 'Maria Clara Souza 12/03/1990, pode ser esse número', 'sim, está certo', 'feminino', 'vou pagar em dinheiro'],
  hc2: ['quero o combo feminino 1', 'guamá', 'o primeiro', 'Josy Teste Fonseca 17/02/1980, pode ser esse número', 'sim, correto', 'feminino', 'sim', 'o primeiro', 'pix'],
  abdtarde: ['quero fazer usg de abdome total', 'guamá', 'tem à tarde?'],
  folic: ['quero usg transvaginal com contagem de foliculos antrais', 'guamá'],
  cardio2: ['quais combos de cardio vocês têm?', 'Cardio 2 teste ergométrico'],
  cardio2b: ['quero o cardio 2 com teste ergometrico'],
  fem2: ['quero o combo feminino 1', 'guamá', 'o primeiro', 'Josy Teste Fonseca 17/02/1980, pode ser esse número', 'sim, correto', 'feminino', 'dinheiro', 'sim', 'o primeiro', 'sim', 'o primeiro', 'obrigada, só isso'],
  cardio: ['quero o combo cardio 1', 'guamá', 'o primeiro', 'Carlos Teste Lima 03/03/1970, pode ser esse número', 'sim, correto', 'masculino', 'dinheiro', 'sim'],
  comboTodo: ['quero fazer o combo feminino 1', 'guamá', 'o primeiro horário', 'Josy Teste Fonseca 17/02/1980, pode ser esse número', 'sim, está certo', 'feminino', 'dinheiro', 'sim, vamos agendar a próxima etapa', 'o primeiro', 'dinheiro também', 'sim, a próxima', 'o primeiro', 'dinheiro', 'sim', 'pode ser o primeiro', 'dinheiro', 'só isso, obrigada'],
  fotoimp: ['quanto fica esses exames?', '[foto:C:/Users/g1ova/AppData/Local/Temp/claude/ec0b50bfd8805ed7/26300803-91a3-43d5-ace0-a4bff1389569/scratchpad/pedido-impresso.jpg]'],
  fotoman: ['quanto fica esses exames?', '[foto:C:/Users/g1ova/AppData/Local/Temp/claude/ec0b50bfd8805ed7/26300803-91a3-43d5-ace0-a4bff1389569/scratchpad/pedido-manuscrito.jpg]'],
  feminino1: ['quero fazer o combo feminino 1', 'guamá', 'pode ser o primeiro horário', 'Josy Teste Fonseca 17/02/1980, pode ser esse número', 'sim, está certo', 'feminino', 'dinheiro', 'sim, quero agendar a próxima'],
  orc2: ['quanto fica hemograma, glicose e o MAPA?', 'sim, esses', 'parcela?'],
  dinheiro: ['quero marcar clinico geral', 'guamá', 'o primeiro', 'Joana Teste Souza 10/05/1990, pode ser esse número', 'feminino', 'dinheiro'],
  link: ['quero marcar clinico geral', 'guamá', 'o primeiro', 'Joana Teste Souza 10/05/1990, pode ser esse número', 'feminino', 'quero pagar no cartão de crédito pelo link'],
  pix: ['quero marcar clinico geral', 'guamá', 'o primeiro', 'Joana Teste Souza 10/05/1990, pode ser esse número', 'feminino', 'vou pagar no pix', '529.982.247-25', '[imagem]'],
  semddd: ['quero marcar clinico geral pro meu filho', 'guamá', 'o primeiro', 'Marcos Silva Lima 05/05/2005, o número dele é 98596-3941', 'masculino', 'vai ser dinheiro'],
  orcamento: ['boa tarde, queria um orçamento desses exames: hemograma, glicose, TSH e colesterol total'],
  preco1: ['quanto custa a consulta com dermatologista?'],
  rubens: ['quero marcar cardiologista', 'guamá', 'o primeiro', 'Rubens Eduardo Teste 10/10/1980', 'masculino'],
  risco: ['quero fazer o risco cirúrgico', 'quero o combo', 'guamá'],
  obst: ['quero uma ultrassom pra minha esposa', 'acho que é obstétrica, ela está com 20 semanas', 'quais médicos fazem?'],
  mae: ['quero marcar clinico geral pra minha mãe amanhã', 'guamá', 'o primeiro', 'Rosa Maria Lima 03/04/1960 feminino', 'o número dela é 91 98123-4567', 'na recepção'],
  horario1: ['oi, qual o horário de funcionamento de vocês?'],
  horario2: ['vocês abrem sábado? até que horas?'],
  horario3: ['boa tarde', 'até que horas vocês atendem hoje? posso ir à tarde fazer exame de sangue?', 'guamá'],
  retorno1: ['oi, quero marcar um retorno com a ginecologista', 'guamá', 'Maria Clara Souza 12/03/1990, pode ser esse número', 'é a primeira vez então'],
  nova1: ['quero marcar consulta com cardiologista', 'guamá', 'é consulta nova', 'o primeiro'],
  ronaldo: ['quero marcar com o clínico geral', 'guamá', 'consulta nova, com o Dr Felipe', 'esse combo inclui só esses exames?', 'quero o combo', 'o primeiro', 'Ronaldo Teste Castro 10/10/1985, pode ser este número', 'é a primeira vez, masculino'],
  japago: ['Amanda, eu havia pago um combo de gastro. Para consulta, endoscopia e ultrassom', 'pra mim mesmo', 'foi o segundo', 'pode ser o primeiro horário', 'Carlos Teste Machado 29/08/1993, esse contato mesmo'],
  yago: ['quero marcar clinico geral', 'guamá', 'é consulta nova', 'o primeiro'],
  feriado1: ['bom dia, vocês funcionam amanhã?'],
  feriado2: ['vocês abrem no dia 25 de dezembro? e no dia 24?'],
  feriado3: ['quero marcar clinico geral pra amanhã', 'guamá', 'é consulta nova'],
  // caso real 19/11: nome e nascimento certos, WhatsApp diferente do telefone do cadastro
  josiane: ['Gostaria de marcar meu retorno com a cardiologista', 'Josiane da Silva Morais  02/12 /79', 'Estive aí semana passada realizando meus exames', '719.166.522-04', 'sim, sou eu', 'o primeiro'],
  respRetorno: ['quero consulta com cardiologista', 'é retorno'],
  hojeFeriado1: ['bom dia, quero fazer exame de sangue hoje'],
  hojeFeriado2: ['vocês estão abertos hoje? queria passar aí agora pra fazer uma ultrassom'],
  hojeFeriado3: ['quero marcar consulta com clinico geral pra hoje', 'é nova', 'guamá'],
  mergulhao: ['Bom dia. O doutor Paulo Mergulhão vai atender hoje? até que horas?', 'é consulta nova'],
  gisele: ['Bom dia', 'Gostaria de um orçamento por gentileza'],
  usgGineco: ['A ultrassom ginecológica precisa agendar? qual o valor?', 'é nova', 'guamá'],
  renato: ['quero marcar clinico geral', 'é nova', 'guamá', 'o primeiro', 'renato giovanny\n08071999\nesse numero aqui'],
  checkupTarde: ['bom dia', 'guamá', 'quero agendar o check up 10', 'pode ser amanhã à tarde?'],
  somenteRx: ['bom dia', 'guamá', 'raio x', 'somente raio x'],
  unidadeOi: ['oi'],
  unidadeDireto: ['quero marcar consulta com cardiologista', 'é nova', 'primeira opção'],
  setores: ['bom dia, que horas vocês funcionam?', 'telégrafo', 'qual o horário da coleta de sangue?', 'e eletrocardiograma, dá pra fazer à tarde?'],
  dados: ['quero marcar consulta com clinico geral amanhã', 'qualquer unidade', 'pode ser', 'Nome: Aline Ferreira Costa\nData de nascimento: 05/07/1988\nsexo feminino', 'vou pagar na recepção'],
};

async function rodar(nome: string, falas: string[]) {
  console.log(`\n================ ${nome} ================`);
  const history: InovstarMessage[] = [];
  let mem: MemoriaIA | null = null;
  let t = Date.now() - falas.length * 60_000;
  for (const fala of falas) {
    history.push({ _id: `in${history.length}`, direction: 'in', type: fala === '[imagem]' || fala.startsWith('[foto:') ? 'image' : 'text', text: fala === '[imagem]' || fala.startsWith('[foto:') ? null : fala, createdAt: new Date(t += 20_000).toISOString() } as any);
    console.log(`\n👤 ${fala.replace(/\n/g, ' | ')}`);
    const t0 = Date.now();
    const r = await atenderComIA({ history, titulos: ['Amanda S. (Clinex):'], telefone: '5591988887777', nomeContato: process.env.CONTATO ?? 'Teste', fonte, memoria: mem, lerPedidos: async () => Promise.all(falas.filter((x) => x.startsWith('[foto:')).map((x) => import('../src/lib/pedidoMedico.js').then((m) => m.analisarPedidoMedico(require('node:fs').readFileSync(x.slice(6, -1)), 'image/jpeg')))), lerComprovante: async () => ({ tipo: 'comprovante', valor: 90, destinatario: 'CLINICA CLINEX', chave: 'clinicaclinex@gmail.com', status: 'concluido' }) as any });
    if (!r) { console.log('   (sem resposta)'); continue; }
    mem = r.mem;
    console.log(`🤖 [${r.resposta.modelo} ${((Date.now() - t0) / 1000).toFixed(1)}s | ${r.resposta.ferramentas.map((f) => `${f.nome}(${f.ms}ms)`).join(', ') || 'sem ferramenta'}]${r.handoff ? ` [TRANSFERE: ${r.handoff.motivo}]` : ''}${r.encerrar ? ' [ENCERRA]' : ''}`);
    console.log(r.texto.split('\n').map((l) => `   ${l}`).join('\n'));
    for (const n of (r as any).notas ?? []) console.log('   [NOTA INTERNA] ' + n.split('\n').join(' | ').slice(0, 260));
    for (const f of r.resposta.ferramentas) if (/erro/.test(f.res)) console.log(`   ⚠ ${f.nome} ${JSON.stringify(f.args)} -> ${f.res}`);
    history.push({ _id: `out${history.length}`, direction: 'out', type: 'text', text: `${TITULO}\n${r.texto}`, createdAt: new Date(t += 20_000).toISOString() } as any);
  }
}

const so = process.argv[2];
for (const [n, f] of Object.entries(CASOS)) if (!so || so.split(',').includes(n)) await rodar(n, f);
