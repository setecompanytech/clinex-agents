/**
 * Mede o tamanho do que vai para a OpenAI em cada rodada da Amanda IA (sem chamar a OpenAI).
 * Uso: npx tsx --env-file=.env scripts/medir-tokens.ts
 */
import { promptAmanda } from '../src/agents/receptivo/ia/prompt.js';
import { DEFINICOES, executar, memoriaNova, type Contexto } from '../src/agents/receptivo/ia/ferramentas.js';
import { fonteClinilink } from '../src/agents/receptivo/script/clinilinkFonte.js';

const tok = (s: string) => Math.round(s.length / 3.6); // português: ~3,6 caracteres por token
const mem = memoriaNova();
const agora = new Date();
const system = promptAmanda({ modoComercial: true, agora, nomeContato: 'Maria', telefone: '(91) 98888-7777', primeiraResposta: false, mem, unidades: [{ nome: 'Guamá' }, { nome: 'Telégrafo' }], hoje: '2026-11-17' });
const tools = JSON.stringify(DEFINICOES.map((d) => ({ type: 'function', function: { name: d.name, description: d.description, parameters: d.parameters } })));
console.log(`prompt do sistema: ${system.length} caracteres ~ ${tok(system)} tokens`);
console.log(`definição das ferramentas: ${tools.length} caracteres ~ ${tok(tools)} tokens`);

const c: Contexto = { modoComercial: true, fonte: fonteClinilink, mem, telefone: '5591988887777', agora, ultimaDoPaciente: '', pedidoOrcamento: false, saida: { confirmacoes: [], usadas: [] } } as any;
const medir = async (nome: string, args: unknown) => {
  const r = JSON.stringify(await executar(nome, args, c)).slice(0, 12000);
  console.log(`${nome}(${JSON.stringify(args)}): ${r.length} caracteres ~ ${tok(r)} tokens`);
  return JSON.parse(r);
};
const g = await medir('buscar_servico', { pedido: 'consulta ginecologia' });
const id = g?.servico?.servico_id ?? g?.servico_id ?? g?.opcoes?.[0]?.servico_id;
if (id) {
  await medir('ver_horarios', { servico_id: id, unidade: 'Guamá' });
  await medir('combos_do_servico', { servico_id: id });
}
await medir('buscar_servico', { pedido: 'ultrassom' });
await medir('buscar_servico', { pedido: 'combo feminino' });
await medir('orcar_exames', { exames: ['hemograma', 'glicose', 'TSH', 'colesterol total'] });
await medir('sugerir_exames', {});
