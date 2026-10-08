-- A auditoria já guarda record_name, mas o painel mostrava apenas o UUID.
-- Retorne o nome legível para dar contexto às ações sensíveis.
CREATE OR REPLACE FUNCTION public.platform_security_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso restrito';
  END IF;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'metrics', jsonb_build_object(
      'users', (SELECT count(*) FROM auth.users),
      'mfa_enabled', (SELECT count(*) FROM public.profiles WHERE coalesce(mfa_enabled, false)),
      'unconfirmed_email', (SELECT count(*) FROM auth.users WHERE email_confirmed_at IS NULL),
      'inactive_90d', (SELECT count(*) FROM auth.users WHERE last_sign_in_at IS NULL OR last_sign_in_at < now() - interval '90 days'),
      'open_sessions', (SELECT count(*) FROM auth.sessions),
      'platform_admins', (SELECT count(*) FROM public.platform_admins WHERE ativo),
      'assisted_access', (SELECT count(*) FROM public.support_access_requests WHERE status = 'approved' AND expires_at > now())
    ),
    'admins', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'user_id', pa.user_id,
        'email', u.email,
        'nome', coalesce(pr.nome, u.email),
        'level', pa.nivel,
        'active', pa.ativo,
        'created_at', pa.created_at,
        'last_sign_in_at', u.last_sign_in_at,
        'mfa_enabled', coalesce(pr.mfa_enabled, false)
      ) ORDER BY pa.created_at)
      FROM public.platform_admins pa
      JOIN auth.users u ON u.id = pa.user_id
      LEFT JOIN public.profiles pr ON pr.id = pa.user_id
    ), '[]'::jsonb),
    'recent_sensitive_actions', coalesce((
      SELECT jsonb_agg(to_jsonb(evento) ORDER BY evento.timestamp DESC)
      FROM (
        SELECT al.id, al.user_id,
               coalesce(pr.nome, u.email, al.user_id::text) AS user_name,
               u.email AS user_email,
               al.action, al.collection, al.record_id, al.record_name, al.timestamp
        FROM public.audit_log al
        LEFT JOIN auth.users u ON u.id = al.user_id
        LEFT JOIN public.profiles pr ON pr.id = al.user_id
        WHERE al.collection IN (
          'platform_restore_requests', 'support_access', 'platform_incidents',
          'notification_queue', 'mercadopago_webhook_logs', 'platform_tenant_limits',
          'platform_ai_config', 'platform_announcements', 'platform_operational_state',
          'platform_feature_flags', 'lgpd_access_request_log'
        )
        ORDER BY al.timestamp DESC
        LIMIT 100
      ) evento
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_security_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_security_overview() TO authenticated;
