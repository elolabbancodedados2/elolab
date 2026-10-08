-- Revoga somente uma autorização ainda ativa e grava a ação na auditoria.
CREATE OR REPLACE FUNCTION public.revoke_support_access(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.support_access_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_request
    FROM public.support_access_requests
   WHERE id = p_request_id
   FOR UPDATE;

  IF NOT FOUND OR NOT (
    public.is_platform_admin()
    OR (v_request.clinica_id = public.current_clinica_id() AND public.is_admin(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;
  IF v_request.status <> 'approved' OR v_request.expires_at <= now() THEN
    RAISE EXCEPTION 'A autorização não está ativa';
  END IF;

  UPDATE public.support_access_requests
     SET status = 'revoked', revoked_at = now(), expires_at = now()
   WHERE id = p_request_id;

  INSERT INTO public.audit_log (user_id, clinica_id, action, collection, record_id, changes)
  VALUES (auth.uid(), v_request.clinica_id, 'update', 'support_access', p_request_id::text,
          jsonb_build_object('status', 'revoked'));
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_support_context(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.support_access_requests%ROWTYPE;
  v_has_diagnostics boolean;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso restrito';
  END IF;

  SELECT * INTO v_request
    FROM public.support_access_requests
   WHERE id = p_request_id AND status = 'approved' AND expires_at > now();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Autorização ausente ou expirada';
  END IF;

  v_has_diagnostics := 'diagnostics' = ANY(v_request.scopes);
  RETURN jsonb_build_object(
    'request_id', v_request.id,
    'clinica_id', v_request.clinica_id,
    'expires_at', v_request.expires_at,
    'scopes', v_request.scopes,
    'active_users', CASE WHEN v_has_diagnostics THEN
      (SELECT count(*) FROM public.profiles WHERE clinica_id = v_request.clinica_id AND ativo)
      ELSE NULL END,
    'failed_automations_24h', CASE WHEN v_has_diagnostics THEN
      (SELECT count(*) FROM public.automation_logs WHERE clinica_id = v_request.clinica_id AND status = 'erro' AND created_at >= now() - interval '24 hours')
      ELSE NULL END,
    'open_support_tickets', CASE WHEN v_has_diagnostics THEN
      (SELECT count(*) FROM public.support_tickets WHERE clinica_id = v_request.clinica_id AND status NOT IN ('resolvido', 'fechado'))
      ELSE NULL END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_support_access(uuid), public.platform_support_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_support_access(uuid), public.platform_support_context(uuid) TO authenticated;
