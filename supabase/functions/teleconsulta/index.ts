import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checarRateLimit, clientIp } from '../_shared/rateLimit.ts';
import { corsPadrao } from '../_shared/cors.ts';
import { calcularExpiracaoAgendamento, criarTokenConvidado, hashTokenConvidado, validarSinalWebRtc } from './core.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY = 22_000;

Deno.serve(async (req) => {
  const cors = { ...corsPadrao(req), 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  const length = Number(req.headers.get('content-length') || 0);
  if (length > MAX_BODY) return json({ error: 'Requisição inválida' }, 413);

  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY) return json({ error: 'Requisição inválida' }, 413);
    const body = JSON.parse(raw) as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : '';
    const ip = clientIp(req);
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await db.from('teleconsulta_signals').delete().lt('created_at', new Date(Date.now() - 180_000).toISOString());
    await db.from('teleconsulta_sessions').delete().lt('expires_at', new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString());

    const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    let user: { id: string } | null = null;
    let clinicaId: string | null = null;
    let roles: string[] = [];
    if (bearer) {
      const auth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: `Bearer ${bearer}` } }, auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data } = await auth.auth.getUser(bearer);
      if (data.user) {
        user = { id: data.user.id };
        const [{ data: profile }, { data: roleRows }] = await Promise.all([
          db.from('profiles').select('clinica_id').eq('id', user.id).maybeSingle(),
          db.from('user_roles').select('role').eq('user_id', user.id),
        ]);
        clinicaId = profile?.clinica_id ?? null;
        roles = (roleRows || []).map((row: { role: string }) => row.role);
      }
    }

    const allowedStaff = !!user && !!clinicaId && (roles.includes('admin') || roles.includes('medico'));
    if (action === 'create') {
      if (!allowedStaff || !UUID.test(String(body.agendamento_id || ''))) return json({ error: 'Ação não autorizada' }, 403);
      const limited = await checarRateLimit(db, { chave: `teleconsulta:create:${user!.id}`, limite: 12, failClosed: true });
      if (limited) return json({ error: 'Aguarde antes de criar outra sala.' }, 429);
      const { data: appointment } = await db.from('agendamentos')
        .select('id,clinica_id,medico_id,data,hora_inicio,hora_fim,tipo,status')
        .eq('id', body.agendamento_id).eq('clinica_id', clinicaId).maybeSingle();
      if (!appointment || appointment.tipo !== 'telemedicina' || appointment.status === 'cancelado' ||
        (!roles.includes('admin') && !(await db.from('medicos').select('id').eq('id', appointment.medico_id).eq('user_id', user!.id).maybeSingle()).data)) {
        return json({ error: 'Não foi possível abrir uma sala para este agendamento.' }, 404);
      }
      const expiresAt = calcularExpiracaoAgendamento(appointment.data, appointment.hora_inicio, appointment.hora_fim, Date.now());
      if (!expiresAt) {
        return json({ error: 'A sala pode ser criada somente para agendamentos próximos, ainda não realizados.' }, 409);
      }
      const token = criarTokenConvidado();
      const { data: session, error } = await db.from('teleconsulta_sessions').insert({
        clinica_id: clinicaId, agendamento_id: appointment.id, medico_id: appointment.medico_id,
        guest_token_hash: await hashTokenConvidado(token), expires_at: expiresAt.toISOString(),
      }).select('id').single();
      if (error) {
        if (error.code !== '23505') throw error;
        // get_or_create: a sala já existe. `modo: 'entrar'` só devolve a sala;
        // `modo: 'link'` emite um novo link (o token só existe em hash) e o
        // anterior deixa de valer.
        const modo = body.modo === 'entrar' || body.modo === 'link' ? body.modo : null;
        if (!modo) return json({ error: 'Este agendamento já possui uma sala criada.' }, 409);
        const { data: existente } = await db.from('teleconsulta_sessions')
          .select('id,status,expires_at').eq('agendamento_id', appointment.id).eq('clinica_id', clinicaId).maybeSingle();
        if (!existente || ['closed', 'expired'].includes(existente.status) || existente.expires_at <= new Date().toISOString()) {
          return json({ error: 'A sala deste agendamento já foi encerrada.' }, 409);
        }
        if (modo === 'entrar') return json({ session_id: existente.id, expires_at: existente.expires_at, reutilizada: true });
        const { error: erroToken } = await db.from('teleconsulta_sessions')
          .update({ guest_token_hash: await hashTokenConvidado(token) }).eq('id', existente.id).eq('clinica_id', clinicaId);
        if (erroToken) throw erroToken;
        await db.from('audit_log').insert({ user_id: user!.id, clinica_id: clinicaId, action: 'update', collection: 'teleconsulta_sessions', record_id: existente.id, changes: { evento: 'link_reemitido' } });
        return json({ session_id: existente.id, guest_token: token, expires_at: existente.expires_at, reutilizada: true });
      }
      await db.from('audit_log').insert({ user_id: user!.id, clinica_id: clinicaId, action: 'create', collection: 'teleconsulta_sessions', record_id: session.id, changes: { evento: 'sala_criada' } });
      return json({ session_id: session.id, guest_token: token, expires_at: expiresAt.toISOString() });
    }

    const sessionId = String(body.session_id || '');
    if (!UUID.test(sessionId)) return json({ error: 'Sessão inválida ou encerrada.' }, 404);
    let sessionQuery = db.from('teleconsulta_sessions').select('*').eq('id', sessionId);
    let participant: 'provider' | 'guest';
    if (allowedStaff) {
      sessionQuery = sessionQuery.eq('clinica_id', clinicaId);
      const { data: candidate } = await sessionQuery.maybeSingle();
      if (!candidate || (!roles.includes('admin') && !(await db.from('medicos').select('id').eq('id', candidate.medico_id).eq('user_id', user!.id).maybeSingle()).data)) {
        return json({ error: 'Sessão inválida ou encerrada.' }, 404);
      }
      participant = 'provider';
      sessionQuery = db.from('teleconsulta_sessions').select('*').eq('id', sessionId).eq('clinica_id', clinicaId);
    } else {
      const token = typeof body.guest_token === 'string' ? body.guest_token : '';
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return json({ error: 'Sessão inválida ou encerrada.' }, 404);
      const limited = await checarRateLimit(db, { chave: `teleconsulta:guest:${ip}:${await hashTokenConvidado(token)}`, limite: 180, janelaSegundos: 60, failClosed: true });
      if (limited) return json({ error: 'Muitas tentativas. Aguarde um minuto.' }, 429);
      sessionQuery = sessionQuery.eq('guest_token_hash', await hashTokenConvidado(token));
      participant = 'guest';
    }
    const { data: session } = await sessionQuery.maybeSingle();
    if (!session || session.expires_at <= new Date().toISOString() || ['closed', 'expired'].includes(session.status)) {
      if (session?.status !== 'closed') await db.from('teleconsulta_sessions').update({ status: 'expired', closed_at: new Date().toISOString() }).eq('id', sessionId);
      return json({ error: 'Sessão inválida ou encerrada.' }, 404);
    }
    if (action === 'state') {
      await db.from('teleconsulta_sessions').update({ [`${participant}_last_seen_at`]: new Date().toISOString() }).eq('id', sessionId);
      return json({ status: session.status, expires_at: session.expires_at, provider_present: !!session.provider_last_seen_at && Date.now() - Date.parse(session.provider_last_seen_at) < 25_000, guest_present: !!session.guest_last_seen_at && Date.now() - Date.parse(session.guest_last_seen_at) < 25_000 });
    }
    if (action === 'consent') {
      if (participant === 'provider' && !roles.includes('medico') && !roles.includes('admin')) return json({ error: 'Ação não autorizada' }, 403);
      const column = participant === 'provider' ? 'provider_consented_at' : 'guest_consented_at';
      await db.from('teleconsulta_sessions').update({ [column]: new Date().toISOString(), [`${participant}_last_seen_at`]: new Date().toISOString() }).eq('id', sessionId);
      if (participant === 'provider') await db.from('teleconsulta_sessions').update({ status: 'active' }).eq('id', sessionId).eq('status', 'waiting');
      await db.from('audit_log').insert({ user_id: user?.id ?? null, clinica_id: session.clinica_id, action: 'update', collection: 'teleconsulta_sessions', record_id: sessionId, changes: { evento: participant === 'provider' ? 'consentimento_profissional' : 'consentimento_convidado' } });
      return json({ ok: true });
    }
    if (action === 'leave') {
      await db.from('teleconsulta_sessions').update({ [`${participant}_last_seen_at`]: null }).eq('id', sessionId);
      await db.from('audit_log').insert({ user_id: user?.id ?? null, clinica_id: session.clinica_id, action: 'update', collection: 'teleconsulta_sessions', record_id: sessionId, changes: { evento: participant === 'provider' ? 'profissional_saiu' : 'convidado_saiu' } });
      return json({ ok: true });
    }
    if (action === 'reconnect') {
      await db.from('teleconsulta_sessions').update({ [`${participant}_last_seen_at`]: new Date().toISOString() }).eq('id', sessionId);
      if (participant === 'provider') await db.from('teleconsulta_signals').delete().eq('session_id', sessionId);
      await db.from('audit_log').insert({ user_id: user?.id ?? null, clinica_id: session.clinica_id, action: 'update', collection: 'teleconsulta_sessions', record_id: sessionId, changes: { evento: 'reconexao', participante: participant } });
      return json({ ok: true });
    }
    if (action === 'signal') {
      if (!['active', 'waiting'].includes(session.status) || !validarSinalWebRtc(body.signal_type, body.payload).ok) return json({ error: 'Sinalização inválida.' }, 400);
      const consented = participant === 'provider' ? session.provider_consented_at : session.guest_consented_at;
      if (!consented) return json({ error: 'Aceite o consentimento antes de conectar.' }, 403);
      const { error } = await db.from('teleconsulta_signals').insert({ session_id: sessionId, sender: participant, signal_type: body.signal_type, payload: body.payload });
      if (error) throw error;
      return json({ ok: true });
    }
    if (action === 'poll') {
      const { data: signals } = await db.from('teleconsulta_signals').select('id,sender,signal_type,payload').eq('session_id', sessionId).neq('sender', participant).order('id').limit(40);
      const ids = (signals || []).map((signal: { id: number }) => signal.id);
      if (ids.length) await db.from('teleconsulta_signals').delete().in('id', ids);
      await db.from('teleconsulta_sessions').update({ [`${participant}_last_seen_at`]: new Date().toISOString() }).eq('id', sessionId);
      return json({ signals: signals || [] });
    }
    if (action === 'close') {
      if (participant !== 'provider') return json({ error: 'Ação não autorizada' }, 403);
      await db.from('teleconsulta_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', sessionId);
      await db.from('teleconsulta_signals').delete().eq('session_id', sessionId);
      await db.from('audit_log').insert({ user_id: user!.id, clinica_id: clinicaId, action: 'update', collection: 'teleconsulta_sessions', record_id: sessionId, changes: { evento: 'sala_encerrada' } });
      return json({ ok: true });
    }
    return json({ error: 'Ação não permitida' }, 400);
  } catch (error) {
    console.error('[teleconsulta] falha operacional não detalhada');
    return json({ error: 'Não foi possível concluir a ação. Tente novamente.' }, 500);
  }
});
