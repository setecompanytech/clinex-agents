/**
 * Teste REAL e somente leitura do Clinilink (rotas /v1/crm/*). Não grava nada e não imprime dados de pacientes.
 * Rodar: npx tsx --env-file=.env scripts/teste-clinilink-crm.ts
 */
import { agendamentos, catalogo, clinilinkConfigurado, orcamentos } from '../src/crm/clinilink.js';

const brt = (deslocamentoDias: number) => new Date(Date.now() - 3 * 3_600_000 - deslocamentoDias * 86_400_000).toISOString().slice(0, 10);
const campos = (o: object) => Object.keys(o).sort().join(', ');
const t0 = Date.now();
const passo = (txt: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${txt}`);

if (!clinilinkConfigurado()) { console.error('CRM_CLINILINK_API_KEY não está no .env'); process.exit(1); }

try {
  passo('catálogo de serviços (pode demorar se o Render estiver dormindo)...');
  const cat = await catalogo();
  passo(`catálogo: ${cat.especialidades.length} especialidades, ${cat.servicos.length} serviços`);

  const de = brt(7), ate = brt(1);
  passo(`orçamentos abertos de ${de} a ${ate}...`);
  const orc = await orcamentos({ status: 'aberto', dataInicial: de, dataFinal: ate });
  passo(`orçamentos: ${orc.length}`);
  if (orc[0]) {
    console.log('  campos do orçamento:', campos(orc[0]));
    console.log('  campos do paciente :', campos(orc[0].paciente));
    const status = new Set(orc.map((o) => o.status)); console.log('  status vistos      :', [...status].join(', '));
    const unid = new Map<string, number>(); for (const o of orc) unid.set(o.unidade?.nome ?? '?', (unid.get(o.unidade?.nome ?? '?') ?? 0) + 1);
    console.log('  por unidade        :', [...unid].map(([k, v]) => `${k}=${v}`).join(' · '));
    const ids = new Map<string, string>(); for (const o of orc) if (o.unidade?.id) ids.set(o.unidade.id, o.unidade.nome);
    console.log('  ids de unidade     :', [...ids].map(([id, n]) => `${n}=${id}`).join(' · '));
    console.log('  com telefone       :', orc.filter((o) => o.paciente.telefone).length, 'de', orc.length);
    console.log('  valorLiquido > 0   :', orc.filter((o) => (o.valorLiquido ?? 0) > 0).length);
    console.log('  ids únicos         :', new Set(orc.map((o) => o.orcamentoId)).size);

    const uid = [...ids.keys()][0];
    if (uid) {
      passo(`agendamentos com falta (faltou) de ${de} a ${ate} na unidade ${ids.get(uid)}...`);
      const ag = await agendamentos({ unidadeId: uid, dataInicial: de, dataFinal: ate, status: 'faltou' });
      passo(`agendamentos faltou: ${ag.length}`);
      if (ag[0]) { console.log('  campos do agendamento:', campos(ag[0])); console.log('  status vistos        :', [...new Set(ag.map((a) => a.status))].join(', ')); }
    }
  }
  passo('ok');
} catch (e) {
  console.error('FALHOU:', (e as Error).message);
  process.exitCode = 1;
}
