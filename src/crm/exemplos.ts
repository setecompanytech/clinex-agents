import { aplicar, automatizar, criarLead, exigeLigacao, hojeDe, proximoPasso, somaDias, type Lead } from './motor.js';

/**
 * Leads de EXEMPLO (todos marcados `demo`) para conhecer o CRM cheio. A história de cada um é reproduzida pelo
 * próprio motor, dia a dia, então todos respeitam as regras (prazos, 2 tentativas por dia, janela 8h-19h, motivos).
 * Os telefones são fictícios (91 90000-xxxx) e os nomes são combinados ao acaso: não são de pacientes.
 */
function semente(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PRIMEIROS = ['Ana', 'Carlos', 'Fernanda', 'João', 'Mariana', 'Ricardo', 'Patrícia', 'Lucas', 'Juliana', 'Roberto', 'Camila', 'Fábio', 'Larissa', 'Marcos', 'Renata', 'Thiago', 'Bianca', 'Gustavo', 'Aline', 'Rodrigo', 'Vanessa', 'Diego', 'Letícia', 'Paulo', 'Sabrina', 'Eduardo', 'Tatiane', 'Leonardo', 'Priscila', 'Henrique'];
const SOBRENOMES = ['Lima', 'Reis', 'Costa', 'Alves', 'Duarte', 'Menezes', 'Farias', 'Barbosa', 'Prado', 'Nogueira', 'Teixeira', 'Moreira', 'Cardoso', 'Pinto', 'Azevedo', 'Ramos', 'Figueiredo', 'Lopes', 'Monteiro', 'Xavier', 'Cunha', 'Martins', 'Vasconcelos', 'Dias', 'Matos', 'Pacheco', 'Borges', 'Siqueira', 'Rocha', 'Campos'];
const EXAMES: [string, number][] = [['Ultrassom abdominal', 220], ['Hemograma completo', 90], ['Consulta com cardiologista', 380], ['Ecocardiograma', 480], ['Ressonância magnética', 1250],
  ['Check-up completo', 890], ['Tomografia', 950], ['Consulta com dermatologista', 320], ['Raio x de tórax', 130], ['Eletrocardiograma', 160], ['Combo exames de sangue', 540], ['Densitometria óssea', 310]];
const ORIGENS = ['Instagram', 'Google', 'Indicação', 'WhatsApp', 'Site'];
const ATENDENTES = ['Amanda', 'Bruno', 'Carla'];
const UNIDADES = ['Guamá', 'Telégrafo', 'Nazaré'];
const MOTIVOS = ['Preço', 'Preço', 'Preço', 'Outro lugar', 'Desistiu', 'Plano', 'Outro'];

const as = (dia: string, h: string) => new Date(`${dia}T${h}:00-03:00`);
const hm = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

export function gerarExemplos(agora: Date, n = 64): Lead[] {
  const rng = semente(20260301);
  const hoje = hojeDe(agora);
  const pick = <T,>(a: T[]) => a[Math.floor(rng() * a.length)];
  const leads: Lead[] = [];
  const nomes = new Set<string>();

  for (let i = 0; i < n; i++) {
    const [exame, base] = pick(EXAMES);
    const valor = Math.round(base * (0.85 + rng() * 0.5));
    // espalha as entradas pelos últimos ~45 dias; os últimos dias têm leads novos
    const idade = i < 8 ? Math.floor(rng() * 2) + 1 : Math.floor(rng() * 44) + 1;
    const d0 = somaDias(hoje, -idade);
    let nome = '';
    do { nome = `${pick(PRIMEIROS)} ${pick(SOBRENOMES)}`; } while (nomes.has(nome));
    nomes.add(nome);
    const origem = pick(ORIGENS);
    const lead = criarLead({
      nome, telefone: `9190000${String(1000 + i * 7).slice(-4)}`, exame, valor, origem, unidade: pick(UNIDADES), atendente: pick(ATENDENTES), demo: true, d0,
    }, as(d0, hm(8 + Math.floor(rng() * 10), Math.floor(rng() * 60))));
    // a origem influencia a chance de responder (Indicação e Instagram respondem mais)
    const bonus = origem === 'Indicação' ? 0.22 : origem === 'Instagram' ? 0.1 : origem === 'Google' ? -0.04 : 0;
    simular(lead, hoje, rng, bonus);
    leads.push(lead);
  }
  return leads.sort((a, b) => b.d0.localeCompare(a.d0));
}

/** Reproduz dia a dia, de D0 até ontem; o dia de hoje fica só com as automações (as tarefas de hoje continuam abertas). */
function simular(l: Lead, hoje: string, rng: () => number, bonus: number) {
  const respondePrimeiro = rng() < 0.38 + bonus, respondeDepois = rng() < 0.28 + bonus / 2;
  const vaiAgendar = rng() < 0.55 + bonus / 2, comparece = rng() < 0.72;
  let d = l.d0;
  while (d < hoje) {
    automatizar(l, as(d, '07:30'));
    const tenta = () => {
      for (let k = 0; k < 3; k++) {
        const p = proximoPasso(l, d);
        if (!p || p.situacao === 'futura' || p.passo.decisao) return;
        if (rng() < 0.12) return; // às vezes esquece e o passo atrasa
        const canais: ('whatsapp' | 'ligacao')[] = exigeLigacao(l, p.passo) ? ['whatsapp', 'ligacao'] : p.passo.canais.includes('ligacao') && rng() < 0.5 ? ['ligacao'] : ['whatsapp'];
        const h0 = 8 + Math.floor(rng() * 9); // 8h..16h
        let fez = false;
        canais.forEach((canal, j) => {
          try { aplicar(l, { tipo: 'contato', canal, naoFoiRecepcao: true, passo: p.passo.id, atendente: l.atendente }, as(d, hm(h0 + j, Math.floor(rng() * 60)))); fez = true; } catch { /* regra de ouro barrou */ }
        });
        if (!fez) return;
        const passo = p.passo.id;
        const chance = passo === 'primeiro' ? (respondePrimeiro ? 1 : 0) : passo === 'tentativa' || passo === 'desconto' ? (respondeDepois ? 0.6 : 0) : 0.25;
        if (rng() < chance && l.status !== 'agendado') {
          // quem responde costuma fazer isso nas horas seguintes (picos pela manhã e no começo da tarde)
          const hr = Math.min(21, h0 + 1 + Math.floor(rng() * 5));
          try { aplicar(l, { tipo: 'resposta', atendente: l.atendente }, as(d, hm(hr, Math.floor(rng() * 60)))); } catch { /* */ }
        }
      }
    };
    tenta();
    // alguns pacientes aparecem na recepção sem ninguém do CRM ter fechado: convertido orgânico
    if ((l.status === 'aberto' || l.status === 'sem_retorno' || l.status === 'negociacao') && rng() < 0.007) { try { aplicar(l, { tipo: 'recepcao', atendente: l.atendente }, as(d, '12:00')); } catch { /* */ } }
    if (l.status === 'negociacao' && rng() < 0.22 && vaiAgendar) {
      try { aplicar(l, { tipo: 'agendou', data: somaDias(d, 1 + Math.floor(rng() * 3)), hora: hm(8 + Math.floor(rng() * 9), 0), atendente: l.atendente }, as(d, hm(9 + Math.floor(rng() * 9), Math.floor(rng() * 60)))); } catch { /* */ }
    }
    if (l.status === 'agendado' && l.agendamento && l.agendamento.data <= d) {
      try { aplicar(l, comparece ? { tipo: 'compareceu' } : { tipo: 'noshow' }, as(d, '18:00')); } catch { /* */ }
    }
    const p = proximoPasso(l, d);
    if (l.status === 'negociacao' && p?.passo.id === 'descarte_neg' && p.situacao !== 'futura') {
      try { aplicar(l, { tipo: 'descartar', motivo: MOTIVOS[Math.floor(rng() * MOTIVOS.length)] }, as(d, '17:00')); } catch { /* */ }
    }
    d = somaDias(d, 1);
  }
  automatizar(l, as(hoje, '07:00'));
}
