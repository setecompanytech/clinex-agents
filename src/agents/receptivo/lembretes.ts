import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { env } from '../../lib/env.js';
import { evt } from '../../lib/log.js';
import { cancelarLembrete, lembretesVencidos, travaCurta } from '../../lib/estado.js';
import { getHistory, sendText } from '../../integrations/inovstar.js';

/**
 * Lembrete de inatividade (Amanda IA): o paciente entrou no fluxo de agendamento, a Amanda respondeu e ele parou de responder.
 * Depois de 15 a 20 min ela pergunta UMA vez se ele quer seguir. A Vercel chama GET /cron/lembretes a cada 5 min
 * ("Authorization: Bearer <CRON_SECRET>"). Não envia se o paciente já respondeu, se a equipe falou depois, se o atendimento
 * mudou de mãos, nem fora do horário (antes das 7h e depois das 21h, horário de Belém).
 */
export const lembretes = Router();

const igual = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
const horaBelem = () => Number(new Intl.DateTimeFormat('pt-BR', { timeZone: env.timezone, hour: '2-digit', hour12: false }).format(new Date())) % 24;

lembretes.get('/lembretes', (req, res, next) => {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return void res.status(503).json({ erro: 'cron', mensagem: 'CRON_SECRET não está configurado.' });
  if (!igual(String(req.headers.authorization ?? ''), `Bearer ${segredo}`)) return void res.status(401).json({ erro: 'auth' });
  rodarLembretes().then((r) => res.json(r)).catch(next);
});

/**
 * Envia os lembretes vencidos. Sem agendador (o plano da Vercel só tem rotina diária), roda de carona em cada mensagem que chega
 * no webhook: uma trava de 60 s no Redis garante uma execução por vez. No horário comercial chegam mensagens o tempo todo.
 */
export async function rodarLembretes(): Promise<{ vencidos: number; enviados: number; pulados: string[] }> {
  if (!(await travaCurta('amanda:ia:lembretes:trava', 60_000))) return { vencidos: 0, enviados: 0, pulados: ['outra execução em andamento'] };
  {
    const vencidos = await lembretesVencidos();
    const titulos = [env.agentTitle, ...env.agentTitlesAntigos].map((t) => t.replace(/\*/g, '').trim()).filter(Boolean);
    let enviados = 0; const pulados: string[] = [];
    for (const l of vencidos) {
      await cancelarLembrete(l.attendanceId); // sai da fila antes de enviar: nunca manda duas vezes
      const h = horaBelem();
      if (h < 7 || h >= 21) { pulados.push(`${l.attendanceId}: fora do horário`); continue; }
      try {
        const { messages } = await getHistory(l.attendanceId, 15);
        // só se, depois da mensagem que a Amanda respondeu, o paciente não escreveu mais e a resposta dela está lá (com o título dela)
        const iAte = messages.findIndex((m) => m._id === l.ate);
        const depois = iAte >= 0 ? messages.slice(iAte + 1).filter((m) => m.type !== 'system' && m.status !== 'whisper' && !m.isWhisper) : [];
        const pacienteVoltou = depois.some((m) => m.direction === 'in');
        const amandaRespondeu = depois.some((m) => m.direction === 'out' && titulos.some((t) => m.text?.includes(t)));
        if (iAte < 0 || pacienteVoltou || !amandaRespondeu) { pulados.push(`${l.attendanceId}: conversa andou`); continue; }
        const texto = `${env.agentTitle ? `${env.agentTitle}\n` : ''}Oi${l.nome ? `, ${l.nome}` : ''}! Você ainda quer seguir com o agendamento${l.servico ? ` (${l.servico})` : ''}? É só me responder que eu continuo de onde paramos.`;
        await sendText({ channelId: l.channelId, to: l.to, attendanceId: l.attendanceId, text: texto, clientMessageId: `agente-lembrete-${l.ate}` });
        enviados++;
        evt('lembrete', { atendimento: l.attendanceId, motivo: 'paciente parado no fluxo de agendamento: perguntou se quer seguir' });
      } catch (e) {
        evt('erro', { mensagem: `lembrete de inatividade falhou (${l.attendanceId}): ${(e as Error).message.slice(0, 160)}` });
      }
    }
    return { vencidos: vencidos.length, enviados, pulados };
  }
}
