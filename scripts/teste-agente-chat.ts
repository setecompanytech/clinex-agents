/**
 * Chat do Agente Clinex com controle (src/crm/agente-chat.ts) contra um Claude FALSO: o modelo é um roteiro de respostas.
 * Nada aqui chama a Anthropic, a OpenAI nem manda mensagem a ninguém. Rodar: npx tsx scripts/teste-agente-chat.ts
 */
import assert from 'node:assert/strict';
import type Anthropic from '@anthropic-ai/sdk';

process.env.ANTHROPIC_API_KEY = 'chave-de-teste';
delete process.env.DISPARO_AUTO;

const { conversar, executarAcao, permissoesDe, _definirCliente, NOMES_FERRAMENTAS } = await import('../src/crm/agente-chat.js');
const { criarLead, somaDias } = await import('../src/crm/motor.js');
const { regrasPadrao } = await import('../src/crm/automacoes.js');
const { funisPadrao } = await import('../src/crm/pipeline/regras.js');
type Estado = import('../src/crm/banco.js').Estado;
type Sessao = import('../src/lib/painel-auth.js').Sessao;

let ok = 0;
async function teste(nome: string, fn: () => void | Promise<void>) {
  try { await fn(); ok++; console.log('  ok  ' + nome); }
  catch (e) { process.exitCode = 1; console.log('FALHOU  ' + nome + '\n        ' + (e as Error).message.split('\n').join('\n        ')); }
}

const AGORA = new Date('2026-11-09T12:00:00Z'), HOJE = '2026-11-09';
const novo = (): Estado => ({ versao: 1, atendentes: [], leads: [], usuarios: [], automacoes: regrasPadrao(AGORA), logAuto: [], pipelines: { funis: funisPadrao(AGORA), atribuicoes: [], extras: {}, followups: [], contatos: [], rotina: {} } });
const lead = (e: Estado, nome: string, tel: string, extra: Record<string, unknown> = {}) => { const l = criarLead({ nome, telefone: tel, valor: 300, unidade: 'CLINEX GUAMÁ', exame: 'Ultrassom', atendente: 'Carla', d0: somaDias(HOJE, -1), ...extra } as never, AGORA); e.leads.push(l); return l; };
const sessao = (perfil: Sessao['perfil'], modulos: Sessao['modulos'] = ['crm'], extra: Partial<Sessao> = {}): Sessao => ({ id: 'u1', nome: 'Pessoa Teste', email: 'p@t.com', perfil, modulos, ...extra });
let salvou = 0;
const ctx = (e: Estado, s: Sessao | undefined) => ({ estado: e, agora: AGORA, sessao: s, salvar: () => { salvou++; } });

/** Um Claude falso: cada chamada devolve a próxima resposta do roteiro e guarda o que recebeu. */
type Passo = { tools?: { name: string; input: Record<string, unknown> }[]; texto?: string };
function falso(roteiro: Passo[]) {
  const chamadas: any[] = []; let i = 0;
  _definirCliente({ messages: { create: async (p: any) => {
    chamadas.push(JSON.parse(JSON.stringify(p)));
    const passo = roteiro[Math.min(i++, roteiro.length - 1)];
    const content: any[] = []; if (passo.texto) content.push({ type: 'text', text: passo.texto });
    (passo.tools ?? []).forEach((t, k) => content.push({ type: 'tool_use', id: `tu_${i}_${k}`, name: t.name, input: t.input }));
    return { id: 'msg', type: 'message', role: 'assistant', model: 'falso', content, stop_reason: passo.tools?.length ? 'tool_use' : 'end_turn', usage: {} };
  } } } as unknown as Anthropic);
  return chamadas;
}
const resultadosDe = (chamada: any) => (chamada.messages.at(-1).content as any[]).filter((b) => b.type === 'tool_result');

console.log('Permissões por perfil');
await teste('matriz: leitura só consulta; atendente altera leads; gestor/admin/mestre tudo; sem módulo CRM nada', () => {
  assert.deepEqual([...permissoesDe(sessao('leitura'))], ['consultar']);
  const at = permissoesDe(sessao('atendente')); assert.ok(at.has('alterar_leads') && at.has('enviar_whatsapp') && !at.has('ia_alterar') && !at.has('consultar_equipe'));
  for (const p of [sessao('gestor'), sessao('admin'), sessao('admin', ['crm', 'agente'], { master: true })]) assert.equal(permissoesDe(p).size, 6);
  assert.equal(permissoesDe(sessao('gestor', ['agente'])).size, 0, 'gestor sem o módulo CRM');
  assert.equal(permissoesDe(undefined).size, 0);
});

console.log('Conversa com ferramentas');
await teste('o modelo consulta (buscar_leads), recebe o resultado e responde; os leads viram links', async () => {
  const e = novo(); lead(e, 'MARIA SILVA', '91988887777', { valor: 900 }); lead(e, 'JOAO COSTA', '91988886666');
  const ch = falso([{ tools: [{ name: 'buscar_leads', input: { texto: 'maria' } }] }, { texto: 'Achei a Maria Silva, orçamento de R$ 900.' }]);
  const r = await conversar(ctx(e, sessao('atendente')), 'quem é a Maria?', []);
  assert.equal(r.texto, 'Achei a Maria Silva, orçamento de R$ 900.'); assert.equal(r.fonte, 'claude');
  assert.equal(r.itens.length, 1); assert.equal(r.itens[0].titulo, 'MARIA SILVA');
  const res = resultadosDe(ch[1]); assert.equal(res.length, 1); assert.ok(!res[0].is_error); assert.match(res[0].content, /MARIA SILVA/); assert.doesNotMatch(res[0].content, /JOAO/);
});
await teste('o prompt diz quem fala, o perfil e o que ele NÃO pode; no modo voz pede resposta curta e falada', async () => {
  const ch = falso([{ texto: 'ok' }]);
  await conversar(ctx(novo(), sessao('atendente')), 'oi', [], { voz: true });
  const sys = ch[0].system as string;
  assert.match(sys, /Pessoa Teste/); assert.match(sys, /Atendente/); assert.match(sys, /NÃO pode:.*indicadores e desempenho da equipe/); assert.match(sys, /MODO VOZ/);
  assert.equal(ch[0].tools.length, NOMES_FERRAMENTAS.length);
  const ch2 = falso([{ texto: 'ok' }]); await conversar(ctx(novo(), sessao('gestor')), 'oi', []); assert.doesNotMatch(ch2[0].system, /NÃO pode/); assert.doesNotMatch(ch2[0].system, /MODO VOZ/);
});
await teste('permissão negada: a ferramenta nem roda, o modelo recebe o erro e explica; nada vira cartão', async () => {
  const e = novo(); lead(e, 'MARIA SILVA', '91988887777');
  const ch = falso([{ tools: [{ name: 'indicadores', input: {} }, { name: 'ia_definir_modo', input: { modo: 'ligado' } }] }, { texto: 'Você não tem permissão para isso.' }]);
  const r = await conversar(ctx(e, sessao('atendente')), 'como está a conversão e liga a IA', []);
  const res = resultadosDe(ch[1]); assert.equal(res.length, 2); assert.ok(res.every((x: any) => x.is_error)); assert.match(res[0].content, /Sem permissão.*Atendente.*equipe/); assert.match(res[1].content, /Sem permissão.*alterar a IA de disparo/);
  assert.equal(r.acoes.length, 0); assert.equal(e.disparoAuto, undefined, 'a IA não foi mexida');
  const l = falso([{ tools: [{ name: 'criar_lead', input: { nome: 'X', telefone: '91999990000' } }] }, { texto: 'sem permissão' }]);
  const r2 = await conversar(ctx(e, sessao('leitura')), 'cria um lead', []); assert.equal(r2.acoes.length, 0); assert.ok(resultadosDe(l[1])[0].is_error); assert.equal(e.leads.length, 1);
});

console.log('Ações com confirmação');
await teste('ação vira cartão e NÃO executa; só roda no executarAcao (confirmar), e cria o lead de verdade', async () => {
  const e = novo(); salvou = 0;
  const ch = falso([{ tools: [{ name: 'criar_lead', input: { nome: 'Ana Nova', telefone: '91 98888-1111', exame: 'Ultrassom', valor: 350 } }] }, { texto: 'Confirme o cadastro no cartão.' }]);
  const r = await conversar(ctx(e, sessao('atendente')), 'cadastra a Ana Nova', []);
  assert.equal(r.acoes.length, 1); assert.equal(r.acoes[0].ferramenta, 'criar_lead'); assert.match(r.acoes[0].resumo.join(' '), /Ana Nova/); assert.match(r.acoes[0].resumo.join(' '), /R\$\s?350/);
  assert.equal(e.leads.length, 0, 'ainda não criou'); assert.equal(salvou, 0); assert.match(resultadosDe(ch[1])[0].content, /AINDA NÃO/);
  const x = await executarAcao(ctx(e, sessao('atendente')), r.acoes[0].ferramenta, r.acoes[0].args);
  assert.match(x.resumo, /criado/); assert.equal(e.leads.length, 1); assert.equal(e.leads[0].nome, 'Ana Nova'); assert.equal(salvou, 1);
  await assert.rejects(() => executarAcao(ctx(e, sessao('atendente')), 'criar_lead', { nome: 'Outra', telefone: '91988881111' }), /Já existe um lead ativo/);
});
await teste('confirmar também confere a permissão (perfil sem direito não executa nem com o cartão em mãos)', async () => {
  const e = novo();
  await assert.rejects(() => executarAcao(ctx(e, sessao('leitura')), 'criar_lead', { nome: 'X', telefone: '91999990000' }), (er: any) => er.codigo === 'permissao' && er.status === 403);
  await assert.rejects(() => executarAcao(ctx(e, sessao('atendente')), 'ia_definir_modo', { modo: 'ligado' }), (er: any) => er.codigo === 'permissao');
  await assert.rejects(() => executarAcao(ctx(e, sessao('gestor')), 'buscar_leads', {}), /Ação desconhecida/, 'só ações passam por aqui');
  await assert.rejects(() => executarAcao(ctx(e, sessao('gestor', ['agente'])), 'criar_lead', { nome: 'X', telefone: '91999990000' }), (er: any) => er.codigo === 'permissao');
  assert.equal(e.leads.length, 0);
});
await teste('registrar contato: pergunta da recepção é respeitada (regra de ouro 1) e o contato entra no lead', async () => {
  const e = novo(); const l = lead(e, 'MARIA SILVA', '91988887777');
  await assert.rejects(() => executarAcao(ctx(e, sessao('atendente')), 'registrar_contato', { lead_id: l.id, canal: 'ligacao', paciente_ja_foi_a_recepcao: true }), /já foi à recepção/);
  const antes = l.eventos.length;
  const r = await executarAcao(ctx(e, sessao('atendente')), 'registrar_contato', { lead_id: l.id, canal: 'ligacao', resultado: 'Pediu para ligar amanhã', paciente_ja_foi_a_recepcao: false });
  assert.match(r.resumo, /Contato registrado/); assert.ok(l.eventos.length > antes); assert.ok(l.eventos.some((x) => x.tipo === 'contato' && x.texto.includes('Pediu para ligar amanhã')));
});
await teste('atualizar lead: nota, agendamento e descarte pelo motor (as regras do guia continuam valendo)', async () => {
  const e = novo(); const l = lead(e, 'MARIA SILVA', '91988887777');
  await executarAcao(ctx(e, sessao('atendente')), 'atualizar_lead', { lead_id: l.id, acao: 'nota', texto: 'Quer remarcar' }); assert.ok(l.eventos.some((x) => x.tipo === 'nota' && x.texto === 'Quer remarcar'));
  await executarAcao(ctx(e, sessao('atendente')), 'atualizar_lead', { lead_id: l.id, acao: 'agendou', data: '2026-11-12', hora: '09:30' }); assert.equal(l.status, 'agendado');
  await assert.rejects(() => executarAcao(ctx(e, sessao('atendente')), 'atualizar_lead', { lead_id: l.id, acao: 'agendou', data: 'amanhã' }), /./);
  await assert.rejects(() => executarAcao(ctx(e, sessao('atendente')), 'atualizar_lead', { lead_id: 'nao-existe', acao: 'nota', texto: 'x' }), /Lead não encontrado/);
});
await teste('IA de disparo: gestor muda o modo e os gatilhos; "ligado" é risco alto; valores fora do guia são recusados', async () => {
  const e = novo(); lead(e, 'MARIA SILVA', '91988887777');
  const ch = falso([{ tools: [{ name: 'ia_definir_modo', input: { modo: 'ligado' } }, { name: 'ia_ajustar', input: { gatilho: 'primeiro', hora: '09:00' } }] }, { texto: 'Confirme.' }]);
  const r = await conversar(ctx(e, sessao('gestor')), 'liga a IA e põe o primeiro contato às 9h', []);
  assert.equal(r.acoes.length, 2); assert.equal(r.acoes[0].risco, 'alto'); assert.match(r.acoes[0].resumo.join(' '), /mensagens REAIS/); assert.equal(r.acoes[1].risco, 'baixo'); assert.equal(e.disparoAuto, undefined);
  void ch;
  await executarAcao(ctx(e, sessao('gestor')), 'ia_definir_modo', { modo: 'simulacao' }); assert.equal(e.disparoAuto?.modo, 'simulacao');
  await executarAcao(ctx(e, sessao('gestor')), 'ia_ajustar', { gatilho: 'primeiro', hora: '09:00', ativo: true }); assert.equal(e.disparoAuto?.config?.gatilhos?.primeiro?.hora, '09:00');
  await assert.rejects(() => executarAcao(ctx(e, sessao('gestor')), 'ia_ajustar', { janela_inicio: 6 }), /nunca ampliar/);
  await assert.rejects(() => executarAcao(ctx(e, sessao('gestor')), 'ia_ajustar', { gatilho: 'primeiro', hora: '19:30' }), /entre 8:00 e 18:59/);
  await assert.rejects(() => executarAcao(ctx(e, sessao('gestor')), 'ia_definir_modo', { modo: 'voando' }), /Modo inválido/);
});

console.log('Artefatos e navegação');
await teste('artefatos: planilha, documento, painel e mensagem são validados e devolvidos; o resumo pede pouco texto no chat', async () => {
  const e = novo();
  const ch = falso([{ tools: [
    { name: 'criar_artefato', input: { tipo: 'planilha', titulo: 'Leads', colunas: ['Nome', 'Valor'], linhas: [['Maria', 900], ['João', 300]] } },
    { name: 'criar_artefato', input: { tipo: 'documento', titulo: 'Resumo', conteudo: '# Semana\n- 4 conversões' } },
    { name: 'criar_artefato', input: { tipo: 'painel', titulo: 'Painel', html: '<div>oi</div>' } },
    { name: 'criar_artefato', input: { tipo: 'mensagem', titulo: 'Recado', conteudo: 'Olá, Maria!' } },
    { name: 'criar_artefato', input: { tipo: 'planilha', titulo: 'Sem colunas', linhas: [] } },
    { name: 'criar_artefato', input: { tipo: 'documento', titulo: 'Vazio', conteudo: '  ' } },
  ] }, { texto: 'Deixei tudo na tela.' }]);
  const r = await conversar(ctx(e, sessao('leitura')), 'faz uns artefatos', []);
  assert.deepEqual(r.artefatos.map((a) => a.tipo), ['planilha', 'documento', 'painel', 'mensagem']);
  assert.deepEqual(r.artefatos[0].colunas, ['Nome', 'Valor']); assert.equal(r.artefatos[0].linhas?.length, 2); assert.equal(r.artefatos[2].html, '<div>oi</div>');
  const res = resultadosDe(ch[1]); assert.equal(res.filter((x: any) => x.is_error).length, 2); assert.match(res[4].content, /colunas/); assert.match(res[5].content, /vazio/);
});
await teste('abrir: devolve o destino para a tela navegar (lead ou tela), sem mudar nada', async () => {
  const e = novo(); const l = lead(e, 'MARIA SILVA', '91988887777');
  falso([{ tools: [{ name: 'abrir', input: { lead_id: l.id } }] }, { texto: 'Abrindo.' }]);
  const r = await conversar(ctx(e, sessao('leitura')), 'abre a maria', []); assert.deepEqual(r.navegar, { tipo: 'lead', valor: l.id, rotulo: 'Abrir MARIA SILVA' });
  falso([{ tools: [{ name: 'abrir', input: { tela: 'iamanager' } }] }, { texto: 'Abrindo.' }]);
  assert.equal((await conversar(ctx(e, sessao('gestor')), 'abre o ia manager', [])).navegar?.valor, 'iamanager');
});
await teste('dados de equipe: gestor vê; o resumo do dia respeita o responsável do atendente', async () => {
  const e = novo(); lead(e, 'MARIA SILVA', '91988887777'); lead(e, 'JOAO COSTA', '91988886666', { atendente: 'Outra Pessoa' });
  const ch = falso([{ tools: [{ name: 'indicadores', input: { periodo: '7d' } }, { name: 'desempenho_equipe', input: {} }, { name: 'resumo_do_dia', input: {} }, { name: 'status_da_ia', input: {} }, { name: 'regras_do_guia', input: {} }] }, { texto: 'ok' }]);
  await conversar(ctx(e, sessao('gestor')), 'me dá tudo', []);
  const res = resultadosDe(ch[1]); assert.equal(res.length, 5); assert.ok(res.every((x: any) => !x.is_error), res.map((x: any) => String(x.content).slice(0, 80)).join(' | '));
  assert.match(res[0].content, /kpis/); assert.match(res[3].content, /gatilhos/); assert.match(res[4].content, /regrasDeOuro/);
});
await teste('o histórico vira mensagens alternadas, sempre começando e terminando no usuário', async () => {
  const ch = falso([{ texto: 'ok' }]);
  await conversar(ctx(novo(), sessao('gestor')), 'e agora?', [{ papel: 'agent', texto: 'solta' }, { papel: 'user', texto: 'oi' }, { papel: 'agent', texto: 'olá' }, { papel: 'user', texto: 'duas' }, { papel: 'user', texto: 'seguidas' }]);
  const m = ch[0].messages as { role: string; content: string }[];
  assert.deepEqual(m.map((x) => x.role), ['user', 'assistant', 'user']); assert.equal(m.at(-1)!.content, 'e agora?');
});
await teste('falha da ferramenta não derruba a conversa: volta para o modelo como erro', async () => {
  const ch = falso([{ tools: [{ name: 'detalhe_lead', input: { lead_id: 'nao-existe' } }, { name: 'inventada', input: {} }] }, { texto: 'Não achei.' }]);
  const r = await conversar(ctx(novo(), sessao('gestor')), 'detalha', []); assert.equal(r.texto, 'Não achei.');
  const res = resultadosDe(ch[1]); assert.ok(res[0].is_error && /não encontrado/i.test(res[0].content)); assert.ok(res[1].is_error && /desconhecida/.test(res[1].content));
});

console.log(`\n${ok} testes passaram${process.exitCode ? ', COM FALHAS' : ''}.`);
process.exit(process.exitCode ?? 0);
