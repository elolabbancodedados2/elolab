CREATE OR REPLACE FUNCTION public.audit_platform_operational_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_action text;
  v_record_id text;
  v_record_name text;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_before := NULL;
    v_after := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_before := to_jsonb(OLD);
    v_after := NULL;
  ELSE
    v_action := 'update';
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
  END IF;

  v_record_id := coalesce(v_after ->> 'id', v_before ->> 'id');

  IF TG_TABLE_NAME = 'platform_operational_state' THEN
    v_record_name := 'Controles operacionais';
    v_before := CASE WHEN v_before IS NULL THEN NULL ELSE jsonb_build_object(
      'somente_leitura', v_before -> 'somente_leitura',
      'bloqueio_emergencial', v_before -> 'bloqueio_emergencial'
    ) END;
    v_after := CASE WHEN v_after IS NULL THEN NULL ELSE jsonb_build_object(
      'somente_leitura', v_after -> 'somente_leitura',
      'bloqueio_emergencial', v_after -> 'bloqueio_emergencial'
    ) END;
  ELSE
    v_record_name := coalesce(v_after ->> 'nome', v_before ->> 'nome', 'Feature flag');
    v_before := CASE WHEN v_before IS NULL THEN NULL ELSE jsonb_build_object(
      'nome', v_before -> 'nome',
      'chave', v_before -> 'chave',
      'ativo', v_before -> 'ativo',
      'percentual', v_before -> 'percentual',
      'destino', v_before -> 'destino',
      'destino_id', v_before -> 'destino_id'
    ) END;
    v_after := CASE WHEN v_after IS NULL THEN NULL ELSE jsonb_build_object(
      'nome', v_after -> 'nome',
      'chave', v_after -> 'chave',
      'ativo', v_after -> 'ativo',
      'percentual', v_after -> 'percentual',
      'destino', v_after -> 'destino',
      'destino_id', v_after -> 'destino_id'
    ) END;
  END IF;

  INSERT INTO public.audit_log (user_id, action, collection, record_id, record_name, changes)
  VALUES (
    auth.uid(),
    v_action,
    TG_TABLE_NAME,
    v_record_id,
    v_record_name,
    jsonb_build_object('from', v_before, 'to', v_after)
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_platform_operational_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS platform_operational_state_audit ON public.platform_operational_state;
CREATE TRIGGER platform_operational_state_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.platform_operational_state
  FOR EACH ROW EXECUTE FUNCTION public.audit_platform_operational_change();

DROP TRIGGER IF EXISTS platform_feature_flags_audit ON public.platform_feature_flags;
CREATE TRIGGER platform_feature_flags_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.platform_feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.audit_platform_operational_change();

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
               al.action, al.collection, al.record_id, al.timestamp
        FROM public.audit_log al
        LEFT JOIN auth.users u ON u.id = al.user_id
        LEFT JOIN public.profiles pr ON pr.id = al.user_id
        WHERE al.collection IN (
          'platform_restore_requests', 'support_access', 'platform_incidents',
          'notification_queue', 'mercadopago_webhook_logs', 'platform_tenant_limits',
          'platform_ai_config', 'platform_announcements', 'platform_operational_state',
          'platform_feature_flags'
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
