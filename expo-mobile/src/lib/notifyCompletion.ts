import type { Db } from './useLoad';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

/**
 * Same side effect as finalizarAtendimento in src/lib/workflowAutomation.ts:
 * queue the "consulta finalizada" e-mail. Failures are ignored, as on the web,
 * because the visit and billing are already committed.
 */
export async function queueCompletionEmail(db: Db, params: { pacienteId: string | null; pacienteNome: string; clinicaId: string | null | undefined }) {
  if (!db || !params.pacienteId || !params.clinicaId) return;
  try {
    const { data } = await db.from('pacientes').select('email').eq('id', params.pacienteId).maybeSingle();
    if (!data?.email) return;
    await db.from('notification_queue').insert({
      tipo: 'email',
      destinatario_id: params.pacienteId,
      destinatario_email: data.email,
      destinatario_nome: params.pacienteNome,
      assunto: 'Consulta finalizada — Resumo do atendimento',
      conteudo: `Olá ${escapeHtml(params.pacienteNome)}, seu atendimento foi concluído. Caso tenha receitas ou exames, eles já estão disponíveis no seu portal.`,
      status: 'pendente',
      clinica_id: params.clinicaId,
    });
  } catch {
    // Secondary effect only; see comment above.
  }
}
