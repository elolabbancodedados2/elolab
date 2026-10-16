import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checarRateLimit } from '../_shared/rateLimit.ts';
import { corsPadrao } from '../_shared/cors.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STAFF_ROLES = ['admin', 'recepcao', 'enfermagem'];

Deno.serve(async (req) => {
  const cors = { ...corsPadrao(req), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  });
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  try {
    const raw = await req.text();
    if (raw.length > 16_000) return json({ error: 'Requisição inválida' }, 413);
    const body = JSON.parse(raw) as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : '';
    const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    if (!bearer) return json({ error: 'Acesso não autorizado' }, 401);
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const auth = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${bearer}` } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData } = await auth.auth.getUser(bearer);
    const user = authData.user;
    if (!user) return json({ error: 'Acesso não autorizado' }, 401);
    const [{ data: profile }, { data: roleRows }] = await Promise.all([
      db.from('profiles').select('clinica_id,ativo').eq('id', user.id).maybeSingle(),
      db.from('user_roles').select('role').eq('user_id', user.id),
    ]);
    const clinicId = profile?.clinica_id as string | undefined;
    const roles = (roleRows || []).map((row: { role: string }) => row.role);
    if (!clinicId || profile?.ativo === false || !roles.some((role: string) => STAFF_ROLES.includes(role))) {
      return json({ error: 'Acesso não autorizado' }, 403);
    }
    const limited = await checarRateLimit(db, { chave: `room-hygiene:${clinicId}:${user.id}`, limite: 80, failClosed: true });
    if (limited) return json({ error: 'Muitas operações. Aguarde um minuto.' }, 429);
    const isReviewer = roles.includes('admin') || roles.includes('enfermagem');
    const isAdmin = roles.includes('admin');

    if (action === 'list') {
      const [roomsRes, activeRes, checklistRes, executionsRes, reviewsRes] = await Promise.all([
        db.from('salas').select('id,nome,status,localizacao,clinica_id').eq('clinica_id', clinicId).order('nome').limit(200),
        db.from('room_hygiene_active_checklists').select('checklist_version_id').eq('clinic_id', clinicId).maybeSingle(),
        db.from('room_hygiene_checklist_versions').select('id,version,title,items,created_at').eq('clinic_id', clinicId).order('version', { ascending: false }).limit(20),
        db.from('room_hygiene_executions').select('id,room_id,checklist_version_id,started_by,started_at,submitted_by,submitted_at,completed_items,notes').eq('clinic_id', clinicId).order('started_at', { ascending: false }).limit(100),
        db.from('room_hygiene_reviews').select('id,execution_id,reviewer_id,decision,note,created_at').eq('clinic_id', clinicId).order('created_at', { ascending: false }).limit(100),
      ]);
      const failure = [roomsRes, activeRes, checklistRes, executionsRes, reviewsRes].find((result) => result.error)?.error;
      if (failure) throw failure;
      return json({ rooms: roomsRes.data || [], activeChecklistId: activeRes.data?.checklist_version_id || null,
        checklists: checklistRes.data || [], executions: executionsRes.data || [], reviews: reviewsRes.data || [], canReview: isReviewer, canConfigure: isAdmin });
    }

    if (action === 'configure') {
      if (!isAdmin) return json({ error: 'Somente administrador pode versionar o checklist.' }, 403);
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const items = body.items;
      if (title.length < 3 || title.length > 120 || !Array.isArray(items) || items.length < 1 || items.length > 40 ||
          items.some((item) => !item || typeof item !== 'object' || !/^[a-z0-9_-]{1,48}$/i.test(String((item as Record<string, unknown>).id || '')) ||
            typeof (item as Record<string, unknown>).label !== 'string' || String((item as Record<string, unknown>).label).trim().length < 3 ||
            String((item as Record<string, unknown>).label).length > 160 || typeof (item as Record<string, unknown>).required !== 'boolean')) {
        return json({ error: 'Revise o título e os itens do checklist.' }, 400);
      }
      const { data, error } = await db.rpc('create_room_hygiene_checklist', { p_clinic_id: clinicId, p_actor_id: user.id, p_title: title, p_items: items });
      if (error) throw error;
      return json({ checklistId: data });
    }

    if (action === 'start') {
      if (typeof body.room_id !== 'string' || !UUID.test(body.room_id)) return json({ error: 'Sala inválida.' }, 400);
      const { data, error } = await db.rpc('start_room_hygiene_execution', { p_clinic_id: clinicId, p_actor_id: user.id, p_room_id: body.room_id });
      if (error) throw error;
      return json({ executionId: data });
    }

    if (action === 'submit') {
      if (typeof body.execution_id !== 'string' || !UUID.test(body.execution_id) || !Array.isArray(body.completed_items) ||
          body.completed_items.length > 40 || typeof body.notes !== 'string' || body.notes.length > 1000) return json({ error: 'Execução inválida.' }, 400);
      const { error } = await db.rpc('submit_room_hygiene_execution', {
        p_clinic_id: clinicId, p_actor_id: user.id, p_execution_id: body.execution_id,
        p_completed_items: body.completed_items, p_notes: body.notes,
      });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === 'review') {
      if (!isReviewer) return json({ error: 'Perfil sem permissão para revisar.' }, 403);
      if (typeof body.execution_id !== 'string' || !UUID.test(body.execution_id) ||
          !['approved', 'rejected'].includes(String(body.decision)) || typeof body.note !== 'string' || body.note.trim().length < 3 || body.note.length > 1000) {
        return json({ error: 'Revise a decisão e a justificativa.' }, 400);
      }
      const { error } = await db.rpc('review_room_hygiene_execution', {
        p_clinic_id: clinicId, p_actor_id: user.id, p_execution_id: body.execution_id,
        p_decision: body.decision, p_note: body.note.trim(),
      });
      if (error) throw error;
      return json({ ok: true });
    }
    return json({ error: 'Ação inválida.' }, 400);
  } catch (error) {
    console.error('Falha no fluxo de higiene de salas:', error instanceof Error ? error.message : 'erro desconhecido');
    return json({ error: 'Não foi possível concluir a operação. Atualize a tela e tente novamente.' }, 500);
  }
});
