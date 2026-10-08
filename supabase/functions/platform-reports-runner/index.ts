import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsPadrao } from '../_shared/cors.ts';

type Schedule = {
  id: string;
  name: string;
  recipients: string[];
  frequency: 'daily' | 'weekly' | 'monthly';
  monthly_day_of_month: number;
};

type RunResult = { schedule_id: string; status: 'success' | 'error'; error?: string; warning?: string };

function nextExecution(now: Date, frequency: Schedule['frequency'], monthlyDay: number) {
  const next = new Date(now);
  if (frequency === 'daily') next.setDate(next.getDate() + 1);
  else if (frequency === 'weekly') next.setDate(next.getDate() + 7);
  else {
    next.setDate(1);
    next.setMonth(next.getMonth() + 1);
    const finalDayOfNextMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(monthlyDay, finalDayOfNextMonth));
  }
  return next;
}

function htmlEscape(value: string) {
  const entities: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, (char) => entities[char] || char);
}

Deno.serve(async (req) => {
  const headers = { ...corsPadrao(req), 'Content-Type': 'application/json' };
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return reply({ error: 'Método não permitido' }, 405);

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let cron = false;
  const provided = req.headers.get('x-cron-secret');
  const expected = Deno.env.get('CRON_SECRET');
  if (provided) {
    if (!expected || provided !== expected) return reply({ error: 'Credencial do agendador inválida' }, 403);
    cron = true;
  }

  if (!cron) {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: auth, error: authError } = await db.auth.getUser(token);
    if (authError || !auth.user) return reply({ error: 'Não autenticado' }, 401);
    const { data: admin, error: adminError } = await db
      .from('platform_admins')
      .select('id')
      .eq('user_id', auth.user.id)
      .eq('ativo', true)
      .maybeSingle();
    if (adminError) return reply({ error: 'Não foi possível validar o acesso' }, 500);
    if (!admin) return reply({ error: 'Acesso restrito' }, 403);
  }

  let body: { id?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // Chamadas do cron enviam corpo vazio para processar todos os vencidos.
  }

  const scheduleId = typeof body.id === 'string' ? body.id.trim() : '';
  if (!cron && !scheduleId) return reply({ error: 'Informe o agendamento que deseja executar' }, 400);
  if (scheduleId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(scheduleId)) {
    return reply({ error: 'Identificador de agendamento inválido' }, 400);
  }

  try {
    let scheduleQuery = db.from('platform_report_schedules').select('*').eq('active', true);
    if (scheduleId) scheduleQuery = scheduleQuery.eq('id', scheduleId);
    else scheduleQuery = scheduleQuery.lte('next_run_at', new Date().toISOString());

    const { data: schedules, error: schedulesError } = await scheduleQuery;
    if (schedulesError) throw schedulesError;
    if (scheduleId && !schedules?.length) return reply({ error: 'Agendamento não encontrado ou pausado' }, 404);
    if (!schedules?.length) return reply({ processed: 0, results: [] });

    const results: RunResult[] = [];
    const { data: report, error: reportError } = await db.rpc('platform_executive_report', { p_days: 30 });
    if (reportError) {
      for (const schedule of schedules as Schedule[]) {
        const message = 'O resumo executivo não pôde ser gerado. Tente novamente mais tarde.';
        const attemptedAt = new Date().toISOString();
        const [{ error: logError }, { error: scheduleError }] = await Promise.all([
          db.from('platform_report_runs').insert({
          schedule_id: schedule.id,
          status: 'error',
          error: message,
          recipients_count: schedule.recipients.length,
          }),
          db.from('platform_report_schedules').update({ last_run_at: attemptedAt }).eq('id', schedule.id),
        ]);
        results.push({
          schedule_id: schedule.id,
          status: 'error',
          error: logError ? 'Falha ao gerar o resumo; o erro também não pôde ser registrado.' : message,
          ...(scheduleError ? { warning: 'A última tentativa não pôde ser atualizada no agendamento.' } : {}),
        });
      }
      return reply({ processed: results.length, results });
    }

    for (const schedule of schedules as Schedule[]) {
      let sent = false;
      try {
        const apiKey = Deno.env.get('RESEND_API_KEY');
        if (!apiKey) throw new Error('Serviço de e-mail não está configurado');

        const metrics = report?.metrics || {};
        const title = htmlEscape(schedule.name);
        const html = `<h1>${title}</h1><p>Resumo dos últimos 30 dias</p><ul><li>Clínicas: ${Number(metrics.clinicas_ativas || 0)}</li><li>Usuários ativos: ${Number(metrics.usuarios_ativos || 0)}</li><li>MRR: R$ ${Number(metrics.mrr || 0).toFixed(2)}</li><li>Incidentes abertos: ${Number(metrics.incidentes_abertos || 0)}</li></ul>`;
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: 'EloLab <noreply@elolab.com.br>', to: schedule.recipients, subject: schedule.name, html }),
        });
        if (!response.ok) throw new Error(`O serviço de e-mail recusou o envio (HTTP ${response.status})`);
        sent = true;

        const sentAt = new Date();
        const { error: scheduleUpdateError } = await db.from('platform_report_schedules').update({
          last_run_at: sentAt.toISOString(),
          next_run_at: nextExecution(sentAt, schedule.frequency, schedule.monthly_day_of_month).toISOString(),
        }).eq('id', schedule.id);
        const { error: runInsertError } = await db.from('platform_report_runs').insert({
          schedule_id: schedule.id,
          status: 'success',
          recipients_count: schedule.recipients.length,
        });

        const persistenceErrors = [scheduleUpdateError, runInsertError].filter(Boolean);
        results.push({
          schedule_id: schedule.id,
          status: 'success',
          ...(persistenceErrors.length ? { warning: 'O e-mail foi enviado, mas o histórico não foi salvo completamente.' } : {}),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 500) : 'Falha inesperada no envio';
        if (!sent) {
          const attemptedAt = new Date().toISOString();
          const [{ error: logError }, { error: scheduleError }] = await Promise.all([
            db.from('platform_report_runs').insert({
              schedule_id: schedule.id,
              status: 'error',
              error: message,
              recipients_count: schedule.recipients.length,
            }),
            db.from('platform_report_schedules').update({ last_run_at: attemptedAt }).eq('id', schedule.id),
          ]);
          results.push({
            schedule_id: schedule.id,
            status: 'error',
            error: logError ? 'O envio falhou e o histórico da falha não pôde ser salvo.' : message,
            ...(scheduleError ? { warning: 'A última tentativa não pôde ser atualizada no agendamento.' } : {}),
          });
        } else {
          results.push({ schedule_id: schedule.id, status: 'success', warning: 'O e-mail foi enviado, mas houve uma falha ao registrar a execução.' });
        }
      }
    }

    return reply({ processed: results.length, results });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : 'Falha ao processar os relatórios' }, 500);
  }
});
