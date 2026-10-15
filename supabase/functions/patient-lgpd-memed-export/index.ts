import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsPadrao } from '../_shared/cors.ts';

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

Deno.serve(async (req) => {
  const corsHeaders = corsPadrao(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405, corsHeaders);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const authorization = req.headers.get('Authorization') ?? '';
    if (!supabaseUrl || !anonKey || !serviceKey || !authorization) {
      return json({ error: 'Não autenticado.' }, 401, corsHeaders);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: 'Não autenticado.' }, 401, corsHeaders);

    const service = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const [{ data: profile, error: profileError }, { data: adminRole, error: roleError }] = await Promise.all([
      service.from('profiles').select('clinica_id').eq('id', user.id).maybeSingle(),
      service.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle(),
    ]);
    if (profileError || roleError) throw new Error('AUTHORIZATION_LOOKUP_FAILED');
    if (!profile?.clinica_id || !adminRole) return json({ error: 'Acesso não autorizado.' }, 403, corsHeaders);

    const body = await req.json().catch(() => null);
    const pacienteId = typeof body?.pacienteId === 'string' ? body.pacienteId.trim() : '';
    if (!pacienteId || pacienteId.length > 100) return json({ error: 'Paciente inválido.' }, 400, corsHeaders);

    const { data: paciente, error: patientError } = await service.from('pacientes')
      .select('id')
      .eq('id', pacienteId)
      .eq('clinica_id', profile.clinica_id)
      .maybeSingle();
    if (patientError) throw new Error('PATIENT_LOOKUP_FAILED');
    // The same response hides whether an ID exists in another clinic.
    if (!paciente) return json({ error: 'Paciente não encontrado.' }, 404, corsHeaders);

    const { data: prescriptions, error: prescriptionError } = await service.from('memed_prescricoes')
      .select('id,clinica_id,paciente_id,medico_id,memed_prescription_uuid,memed_prescription_id,data_prescricao,payload,excluida_em,created_at,updated_at')
      .eq('clinica_id', profile.clinica_id)
      .eq('paciente_id', pacienteId)
      .order('data_prescricao', { ascending: true });
    if (prescriptionError) throw new Error('MEMED_EXPORT_FAILED');

    return json({ memed_prescricoes: prescriptions ?? [] }, 200, corsHeaders);
  } catch (error) {
    // Do not log patient data or return database/service details.
    console.error('[patient-lgpd-memed-export] request failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'Não foi possível exportar as prescrições Memed.' }, 500, corsHeaders);
  }
});
