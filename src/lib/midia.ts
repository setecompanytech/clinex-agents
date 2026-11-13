/**
 * Arquivo do paciente (foto ou PDF) no formato que o modelo de visão da OpenAI aceita.
 * Imagem: image_url. PDF: file (o modelo lê o texto e as páginas). Outros formatos: null (não dá para ler).
 * O tipo é conferido pelos primeiros bytes também: o WhatsApp às vezes manda PDF como "application/octet-stream".
 */
export type ParteDaMidia =
  | { type: 'image_url'; image_url: { url: string; detail?: 'high' | 'low' | 'auto' } }
  | { type: 'file'; file: { filename: string; file_data: string } };

export function ehPdf(bytes: Buffer, mime: string): boolean {
  return /application\/pdf/i.test(mime) || bytes.subarray(0, 5).toString('latin1') === '%PDF-';
}

export function parteDaMidia(bytes: Buffer, mime: string, detail?: 'high' | 'low' | 'auto'): ParteDaMidia | null {
  const tipo = mime.split(';')[0].trim().toLowerCase();
  if (ehPdf(bytes, tipo)) return { type: 'file', file: { filename: 'documento.pdf', file_data: `data:application/pdf;base64,${bytes.toString('base64')}` } };
  if (/^image\/(png|jpe?g|webp|gif)$/.test(tipo)) return { type: 'image_url', image_url: { url: `data:${tipo};base64,${bytes.toString('base64')}`, ...(detail ? { detail } : {}) } };
  return null;
}
