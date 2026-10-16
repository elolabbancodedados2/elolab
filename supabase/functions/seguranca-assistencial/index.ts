import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checarRateLimit } from '../_shared/rateLimit.ts';
import { corsPadrao } from '../_shared/cors.ts';
import { podeAcessarRelato, validarAtualizacaoRelato, validarDecisaoRetificacao, validarNovoRelato, validarPedidoRetificacao } from './core.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES_SUBMIT = ['admin', 'medico', 'enfermagem'];

Deno.serve(async (req) => {
  const cors = { ...corsPadrao(req), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  });
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  if (Number(req.headers.get('content-length') || 0) > 12_000) return json({ error: 'Requisição inválida' }, 413);

  try {
    const raw = await req.text();
    if (raw.length > 12_000) return json({ error: 'Requisição inválida' }, 413);
    const body = JSON.parse(raw) as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : '';
    const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    if (!bearer) return json({ error: 'Acesso não autorizado' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const db = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const auth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData } = await auth.auth.getUser(bearer);
    const user = authData.user;
    if (!user) return json({ error: 'Acesso não autorizado' }, 401);
    const [{ data: profile }, { data: roleRows }] = await Promise.all([
      db.from('profiles').select('clinica_id,ativo').eq('id', user.id).maybeSingle(),
      db.from('user_roles').select('role').eq('user_id', user.id),
    ]);
    const clinicId = profile?.clinica_id as string | undefined;
    const roles = (roleRows || []).map((row: { role: string }) => row.role);
    if (!clinicId || profile?.ativo === false || !roles.some((role: string) => ROLES_SUBMIT.includes(role))) {
      return json({ error: 'Acesso não autorizado' }, 403);
    }
    const limited = await checarRateLimit(db, { chave: `clinical-safety:${clinicId}:${user.id}`, limite: 100, failClosed: true });
    if (limited) return json({ error: 'Muitas operações. Aguarde um minuto.' }, 429);
    const isAdmin = roles.includes('admin');

    const accessLog = async (reportId: string, event: 'list' | 'view' | 'create' | 'update') => {
      const { error } = await db.from('clinical_safety_access_audit').insert({
        clinic_id: clinicId, report_id: reportId, actor_user_id: user.id, action: event,
      });
      if (error) throw error;
    };
    const hideReporter = (report: Record<string, unknown>) => {
      const { reporter_user_id: reporterId, ...safe } = report;
      return {
        ...safe,
        is_reporter: report.reporter_user_id === user.id,
        reporter_display: isAdmin
          ? (report.reporter_confidential ? 'Identidade protegida' : String(reporterId || 'Relator removido'))
          : undefined,
      };
    };

    if (action === 'create') {
      const validated = validarNovoRelato(body.report);
      if (!validated.ok) return json({ error: 'Revise os campos do relato e tente novamente.' }, 400);
      const { data, error } = await db.rpc('create_clinical_safety_report', {
        p_clinic_id: clinicId, p_actor_user_id: user.id, ...Object.fromEntries(
          Object.entries(validated.value).map(([key, value]) => [`p_${key}`, value]),
        ),
      });
      if (error) throw error;
      const report = Array.isArray(data) ? data[0] : data;
      if (!report) throw new Error('Relato não foi criado.');
      return json({ report: { id: report.report_id, status: report.report_status, created_at: report.report_created_at } });
    }

    if (action === 'list') {
      let query = db.from('clinical_safety_reports').select(
        'id,clinic_id,reporter_user_id,reporter_confidential,category,severity,occurred_at,location_label,summary,immediate_action,status,assigned_to,due_at,created_at,updated_at,closed_at',
      ).eq('clinic_id', clinicId).order('created_at', { ascending: false }).limit(100);
      if (!isAdmin) query = query.eq('reporter_user_id', user.id);
      if (typeof body.status === 'string' && ['submitted', 'triage', 'investigating', 'action_required', 'monitoring', 'closed', 'reopened'].includes(body.status)) query = query.eq('status', body.status);
      if (typeof body.category === 'string' && /^[a-z_]{2,32}$/.test(body.category)) query = query.eq('category', body.category);
      const { data: reports, error } = await query;
      if (error) throw error;
      const rows = reports || [];
      if (rows.length) {
        const auditRows = rows.map((report: { id: string }) => ({ clinic_id: clinicId, report_id: report.id, actor_user_id: user.id, action: 'list' }));
        const { error: auditError } = await db.from('clinical_safety_access_audit').insert(auditRows);
        if (auditError) throw auditError;
      }
      let reviewers: Array<{ id: string; nome: string }> = [];
      if (isAdmin) {
        const { data: profiles } = await db.from('profiles').select('id,nome').eq('clinica_id', clinicId).eq('ativo', true).limit(100);
        const profileIds = (profiles || []).map((row: { id: string }) => row.id);
        if (profileIds.length) {
          const { data: eligible } = await db.from('user_roles').select('user_id').in('user_id', profileIds).in('role', ROLES_SUBMIT);
          const eligibleIds = new Set((eligible || []).map((row: { user_id: string }) => row.user_id));
          reviewers = (profiles || []).filter((row: { id: string }) => eligibleIds.has(row.id)) as Array<{ id: string; nome: string }>;
        }
      }
      const reporterIds = isAdmin ? [...new Set(rows.filter((r: Record<string, unknown>) => !r.reporter_confidential && r.reporter_user_id).map((r: Record<string, unknown>) => r.reporter_user_id as string))] : [];
      let reporterNames = new Map<string, string>();
      if (reporterIds.length) {
        const { data: reporters } = await db.from('profiles').select('id,nome').eq('clinica_id', clinicId).in('id', reporterIds);
        reporterNames = new Map((reporters || []).map((row: { id: string; nome: string }) => [row.id, row.nome]));
      }
      return json({ reports: rows.map((report: Record<string, unknown>) => {
        const safe = hideReporter(report);
        return isAdmin && !report.reporter_confidential
          ? { ...safe, reporter_display: reporterNames.get(String(report.reporter_user_id)) || 'Relator removido' }
          : safe;
      }), reviewers });
    }

    const reportId = typeof body.report_id === 'string' ? body.report_id : '';
    if (!UUID.test(reportId)) return json({ error: 'Relato não encontrado.' }, 404);
    const { data: report, error: reportError } = await db.from('clinical_safety_reports').select('*').eq('id', reportId).eq('clinic_id', clinicId).maybeSingle();
    if (reportError) throw reportError;
    if (!report || !podeAcessarRelato({ user_id: user.id, clinic_id: clinicId, roles }, report)) return json({ error: 'Relato não encontrado.' }, 404);

    if (action === 'get') {
      await accessLog(reportId, 'view');
      const { data: updates, error: updatesError } = isAdmin
        ? await db.from('clinical_safety_updates').select('id,from_status,to_status,review_note,corrective_action,created_at,actor_user_id').eq('report_id', reportId).eq('clinic_id', clinicId).order('created_at', { ascending: false }).limit(100)
        : { data: [], error: null };
      if (updatesError) throw updatesError;
      const safeReport = hideReporter(report);
      if (isAdmin && !report.reporter_confidential && report.reporter_user_id) {
        const { data: reporter } = await db.from('profiles').select('nome').eq('id', report.reporter_user_id).eq('clinica_id', clinicId).maybeSingle();
        safeReport.reporter_display = reporter?.nome || 'Relator removido';
      }
      let correctionsQuery = db.from('clinical_safety_correction_requests').select(
        'id,previous_summary,previous_immediate_action,proposed_summary,proposed_immediate_action,reason,report_updated_at,status,review_note,created_at,reviewed_at',
      ).eq('report_id', reportId).eq('clinic_id', clinicId).order('created_at', { ascending: false }).limit(50);
      if (!isAdmin) correctionsQuery = correctionsQuery.eq('requester_user_id', user.id);
      const { data: correctionRequests, error: correctionsError } = await correctionsQuery;
      if (correctionsError) throw correctionsError;
      return json({ report: safeReport, updates: updates || [], correction_requests: correctionRequests || [] });
    }

    if (action === 'request_correction') {
      if (report.reporter_user_id !== user.id) return json({ error: 'Apenas o relator pode pedir a retificação.' }, 403);
      const validated = validarPedidoRetificacao(body.request);
      if (!validated.ok) return json({ error: 'Revise o texto proposto e o motivo da retificação.' }, 400);
      const { data, error } = await db.rpc('create_clinical_safety_correction_request', {
        p_report_id: reportId, p_clinic_id: clinicId, p_actor_user_id: user.id, ...Object.fromEntries(
          Object.entries(validated.value).map(([key, value]) => [`p_${key}`, value]),
        ),
      });
      if (error) {
        if (error.code === '23505') return json({ error: 'Já existe uma solicitação de retificação pendente para este relato.' }, 409);
        throw error;
      }
      const request = Array.isArray(data) ? data[0] : data;
      if (!request) throw new Error('Solicitação não foi registrada.');
      return json({ correction_request: { id: request.request_id, status: request.request_status, created_at: request.request_created_at } });
    }

    if (action === 'resolve_correction') {
      if (!isAdmin) return json({ error: 'Apenas o administrador da clínica pode decidir a retificação.' }, 403);
      const correctionId = typeof body.correction_id === 'string' ? body.correction_id : '';
      if (!UUID.test(correctionId)) return json({ error: 'Solicitação não encontrada.' }, 404);
      const validated = validarDecisaoRetificacao(body.decision);
      if (!validated.ok) return json({ error: 'Informe a decisão e uma nota de revisão.' }, 400);
      const { data, error } = await db.rpc('resolve_clinical_safety_correction', {
        p_request_id: correctionId, p_clinic_id: clinicId, p_actor_user_id: user.id,
        p_expected_report_updated_at: validated.value.expected_report_updated_at,
        p_status: validated.value.status, p_review_note: validated.value.review_note,
      });
      if (error) throw error;
      const resolved = Array.isArray(data) ? data[0] : data;
      if (!resolved) return json({ error: 'O relato mudou após o pedido. Atualize e avalie a retificação novamente.' }, 409);
      return json({ correction_request: { id: resolved.request_id, status: resolved.request_status, report_updated_at: resolved.report_updated_at } });
    }

    if (action === 'update') {
      if (!isAdmin) return json({ error: 'Apenas o administrador da clínica pode revisar relatos.' }, 403);
      const validated = validarAtualizacaoRelato(body.update);
      if (!validated.ok) return json({ error: 'Revise status, responsável, prazo e nota da revisão.' }, 400);
      const change = validated.value;
      if (change.assigned_to) {
        const [{ data: assignee }, { data: assigneeRoles }] = await Promise.all([
          db.from('profiles').select('id').eq('id', change.assigned_to).eq('clinica_id', clinicId).eq('ativo', true).maybeSingle(),
          db.from('user_roles').select('role').eq('user_id', change.assigned_to).in('role', ROLES_SUBMIT),
        ]);
        if (!assignee || !assigneeRoles?.length) return json({ error: 'O responsável deve ser profissional ativo desta clínica.' }, 400);
      }
      const { data, error: updateError } = await db.rpc('apply_clinical_safety_review', {
        p_report_id: reportId, p_clinic_id: clinicId, p_actor_user_id: user.id,
        p_expected_updated_at: change.expected_updated_at, p_status: change.status,
        p_assigned_to: change.assigned_to, p_due_at: change.due_at,
        p_review_note: change.review_note, p_corrective_action: change.corrective_action,
      });
      if (updateError) throw updateError;
      const updated = Array.isArray(data) ? data[0] : data;
      if (!updated) return json({ error: 'Este relato mudou em outra sessão. Atualize a lista e tente novamente.' }, 409);
      return json({ report: { id: updated.report_id, status: updated.report_status, updated_at: updated.report_updated_at } });
    }
    return json({ error: 'Ação não permitida.' }, 400);
  } catch {
    console.error('[seguranca-assistencial] falha operacional não detalhada');
    return json({ error: 'Não foi possível concluir a operação. Tente novamente.' }, 500);
  }
});
