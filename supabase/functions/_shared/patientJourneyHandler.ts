import { clinicaDoChamador, cronOrUserOk, cronSecretOk, usuarioTemAlgumPapel } from './cronAuth.ts';
import { corsPadrao } from './cors.ts';

type JourneyMode = 'reminders' | 'confirmation' | 'result';
const automations = new Set(['confirmacao_agendamento', 'lembrete_consulta_24h', 'lembrete_consulta_2h',
  'pos_consulta_agradecimento', 'pesquisa_satisfacao', 'lembrete_retorno', 'notificacao_resultado_exame']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** All entry points share one atomic producer. Only the queue worker contacts providers. */
export async function handlePatientJourney(req: Request, mode: JourneyMode, supabase: any): Promise<Response> {
  const headers = { ...corsPadrao(req), 'Content-Type': 'application/json' };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return json({ success: false, error: 'Método não permitido.' }, 405);
  if (!cronOrUserOk(req)) return json({ success: false, error: 'Não autorizado.' }, 403);
  try {
    const cron = cronSecretOk(req);
    if (cron && mode !== 'reminders') return json({ success: false, error: 'É necessário um usuário da clínica.' }, 403);
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { if (!cron) return json({ success: false, error: 'Corpo JSON inválido.' }, 400); }
    const key = mode === 'confirmation' ? 'confirmacao_agendamento' : mode === 'result' ? 'notificacao_resultado_exame' : body.automation_key;
    if ((!cron || key != null) && (typeof key !== 'string' || !automations.has(key))) {
      return json({ success: false, error: 'Informe uma automação válida.' }, 400);
    }
    const appointmentId = mode !== 'result' && body.agendamento_id != null ? body.agendamento_id : null;
    const resultId = mode === 'result' ? body.resultado_id : null;
    if ((key === 'confirmacao_agendamento' && !appointmentId) || (mode === 'result' && !resultId)
      || (appointmentId != null && (typeof appointmentId !== 'string' || !uuid.test(appointmentId)))
      || (resultId != null && (typeof resultId !== 'string' || !uuid.test(resultId)))) {
      return json({ success: false, error: 'Informe um identificador válido.' }, 400);
    }
    const clinicId = cron ? null : await clinicaDoChamador(req, supabase);
    const roles = key === 'confirmacao_agendamento' ? ['admin', 'recepcao', 'enfermagem', 'medico']
      : mode === 'result' ? ['admin', 'medico', 'enfermagem'] : ['admin'];
    if (!cron && (!clinicId || !(await usuarioTemAlgumPapel(req, supabase, roles)))) {
      return json({ success: false, error: 'Sem permissão para executar esta automação.' }, 403);
    }
    const { data, error } = await supabase.rpc('enfileirar_jornada_paciente', {
      p_clinica_id: clinicId, p_agendamento_id: appointmentId, p_resultado_id: resultId, p_automation_key: key ?? null,
    });
    if (error) return json({ success: false, error: 'Não foi possível preparar as notificações.' }, error.code === 'P0002' ? 404 : 500);
    const queued = Number(data?.enfileirados ?? 0);
    return json({ success: true, delivery: 'queued', message: queued
      ? `${queued} mensagens adicionadas à fila de envio.`
      : 'Nenhuma mensagem nova: confira a configuração, os contatos e as mensagens já agendadas na fila.',
      stats: { enfileirados: queued, agendados: Number(data?.agendados ?? 0), enviados: Number(data?.enviados ?? 0),
        processados: queued, sucesso: queued, erros: 0, duplicado: queued === 0 && Number(data?.agendados ?? 0) > 0 } });
  } catch {
    return json({ success: false, error: 'Falha ao preparar as notificações.' }, 500);
  }
}
