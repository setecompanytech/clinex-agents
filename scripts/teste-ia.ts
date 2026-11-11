/**
 * Simula conversas com a Amanda IA usando a agenda REAL do Clinilink (só leitura): o agendamento é falso (nada é gravado).
 * Uso: npx tsx --env-file=.env scripts/teste-ia.ts [nome-do-caso]
 */
import type { InovstarMessage } from '../src/integrations/inovstar.js';
import { atenderComIA } from '../src/agents/receptivo/ia/atender.js';
import type { MemoriaIA } from '../src/agents/receptivo/ia/ferramentas.js';
import { fonteClinilink } from '../src/agents/receptivo/script/clinilinkFonte.js';
import type { Fonte } from '../src/agents/receptivo/script/catalog.js';

const TITULO = '*Amanda S. (Clinex):*';
const fonte: Fonte = {
  ...fonteClinilink,
  async gerarOS(id) { console.log(`   [gerarOS] agendamento=${id}`); return { ok: true, id: "os-teste-1" }; },
  async reservar(p) { console.log(`   [reservar] paciente=${p.pacienteId ?? "novo"} cadastro=${JSON.stringify(p.cadastro ?? null)}`); return { ok: true, hora: p.slot.inicio, cadastrou: !p.pacienteId, pacienteId: p.pacienteId ?? 'novo-123', agendamentoId: 'ag-teste-1', profissional: p.slot.profissional, profissionalBruto: p.slot.profissionalBruto }; },
};

const CASOS: Record<string, string[]> = {
  gineco: ['oi', 'quero agendar ginecologista', 'guamá', 'o primeiro', 'Maria Clara Souza 12/03/1990', 'pode ser esse número mesmo', 'feminino', 'na recepção', 'beleza', 'obrigada, só isso'],
  ultra: ['boa tarde, vocês fazem ultrassom?', 'obstétrica', 'tem pra essa semana?'],
  matheus: ['Oi, quero marcar USG obstétrico', 'telegrafo com a Ana Clara', 'pode ser o primeiro'],
  sangue: ['quero fazer exame de sangue', 'hemograma, glicose e colesterol total', 'quero agendar a coleta'],
  preco: ['quanto custa a consulta com cardiologista?', 'e qual o endereço do guamá?'],
  resultado: ['quero saber o resultado do meu exame de ontem'],
  link: ['quero marcar clinico geral', 'guamá', 'o primeiro', 'Joana Teste Souza 10/05/1990, pode ser esse número', 'feminino', 'quero pagar no cartão de crédito pelo link'],
  pix: ['quero marcar clinico geral', 'guamá', 'o primeiro', 'Joana Teste Souza 10/05/1990, pode ser esse número', 'feminino', 'vou pagar no pix', '529.982.247-25', '[imagem]'],
  semddd: ['quero marcar clinico geral pro meu filho', 'guamá', 'o primeiro', 'Marcos Silva Lima 05/05/2005, o número dele é 98596-3941', 'masculino', 'vai ser dinheiro'],
  orcamento: ['boa tarde, queria um orçamento desses exames: hemograma, glicose, TSH e colesterol total'],
  preco1: ['quanto custa a consulta com dermatologista?'],
  rubens: ['quero marcar cardiologista', 'guamá', 'o primeiro', 'Rubens Eduardo Teste 10/10/1980', 'masculino'],
  risco: ['quero fazer o risco cirúrgico', 'quero o combo', 'guamá'],
  obst: ['quero uma ultrassom pra minha esposa', 'acho que é obstétrica, ela está com 20 semanas', 'quais médicos fazem?'],
  mae: ['quero marcar clinico geral pra minha mãe amanhã', 'guamá', 'o primeiro', 'Rosa Maria Lima 03/04/1960 feminino', 'o número dela é 91 98123-4567', 'na recepção'],
  dados: ['quero marcar consulta com clinico geral amanhã', 'qualquer unidade', 'pode ser', 'Nome: Aline Ferreira Costa\nData de nascimento: 05/07/1988\nsexo feminino', 'vou pagar na recepção'],
};

async function rodar(nome: string, falas: string[]) {
  console.log(`\n================ ${nome} ================`);
  const history: InovstarMessage[] = [];
  let mem: MemoriaIA | null = null;
  let t = Date.now() - falas.length * 60_000;
  for (const fala of falas) {
    history.push({ _id: `in${history.length}`, direction: 'in', type: fala === '[imagem]' ? 'image' : 'text', text: fala === '[imagem]' ? null : fala, createdAt: new Date(t += 20_000).toISOString() } as any);
    console.log(`\n👤 ${fala.replace(/\n/g, ' | ')}`);
    const t0 = Date.now();
    const r = await atenderComIA({ history, titulos: ['Amanda S. (Clinex):'], telefone: '5591988887777', nomeContato: 'Teste', fonte, memoria: mem, lerComprovante: async () => ({ tipo: 'comprovante', valor: 90, destinatario: 'CLINICA CLINEX', chave: 'clinicaclinex@gmail.com', status: 'concluido' }) as any });
    if (!r) { console.log('   (sem resposta)'); continue; }
    mem = r.mem;
    console.log(`🤖 [${((Date.now() - t0) / 1000).toFixed(1)}s | ${r.resposta.ferramentas.map((f) => `${f.nome}(${f.ms}ms)`).join(', ') || 'sem ferramenta'}]${r.handoff ? ` [TRANSFERE: ${r.handoff.motivo}]` : ''}${r.encerrar ? ' [ENCERRA]' : ''}`);
    console.log(r.texto.split('\n').map((l) => `   ${l}`).join('\n'));
    for (const f of r.resposta.ferramentas) if (/erro/.test(f.res)) console.log(`   ⚠ ${f.nome} ${JSON.stringify(f.args)} -> ${f.res}`);
    history.push({ _id: `out${history.length}`, direction: 'out', type: 'text', text: `${TITULO}\n${r.texto}`, createdAt: new Date(t += 20_000).toISOString() } as any);
  }
}

const so = process.argv[2];
for (const [n, f] of Object.entries(CASOS)) if (!so || so.split(',').includes(n)) await rodar(n, f);
