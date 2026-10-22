/**
 * Orientações de preparo que a clínica JÁ manda aos pacientes (texto das atendentes), por procedimento. Valem quando o cadastro do Clinilink
 * (campo preparo) está vazio. Texto de preparo completo começa com "PREPARO": a Amanda manda como mensagem própria, do jeito que a clínica manda.
 *
 * Fonte: conversa real da atendente Ana Luiza com uma paciente, em 21/10/2026 (USG de abdome). Para incluir outro exame, é só acrescentar uma linha.
 */
export const PREPAROS: { re: RegExp; texto: string }[] = [
  {
    re: /\babdome\b/,
    texto: [
      'PREPARO PARA O EXAME DE USG ABDOME',
      '',
      'Jejum: Manter jejum absoluto de 8 horas antes do exame (não ingerir alimentos sólidos ou líquidos).',
      '',
      'Véspera do exame:',
      '• Evite alimentos gordurosos, refrigerantes, leite e derivados (para evitar gases).',
      '• Não mascar chiclete e não fumar no dia do exame.',
    ].join('\n'),
  },
];

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
/** O preparo padrão da clínica para o procedimento (só exames de ultrassom/imagem listados acima). */
export const preparoPadrao = (nome: string): string | undefined => {
  const n = norm(nome);
  if (!/\b(usg|ultrassom|ultrassonografia)\b/.test(n)) return undefined;
  return PREPAROS.find((p) => p.re.test(n))?.texto;
};
