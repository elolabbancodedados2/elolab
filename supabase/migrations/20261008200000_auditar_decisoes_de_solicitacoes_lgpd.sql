-- A decisão de uma solicitação precisa de justificativa e trilha de auditoria.
-- A política antiga permitia ao superadmin alterar a linha diretamente e
-- contornar a RPC auditada; as clínicas mantêm a própria política de escopo.
DROP POLICY IF EXISTS "plataforma acompanha solicitacoes" ON public.lgpd_access_request_log;

CREATE OR REPLACE FUNCTION public.platform_update_lgpd_request(
  p_id uuid,
  p_status text,
  p_evidence text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.lgpd_access_request_log%ROWTYPE;
  v_evidence text := trim(coalesce(p_evidence, ''));
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso restrito';
  END IF;
  IF p_status NOT IN ('fulfilled', 'denied') THEN
    RAISE EXCEPTION 'Decisão inválida';
  END IF;
  IF length(v_evidence) < 20 OR length(v_evidence) > 1000 THEN
    RAISE EXCEPTION 'A justificativa deve ter entre 20 e 1.000 caracteres';
  END IF;

  SELECT * INTO v_request
    FROM public.lgpd_access_request_log
   WHERE id = p_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada';
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'A solicitação já foi decidida';
  END IF;

  UPDATE public.lgpd_access_request_log
     SET status = p_status,
         fulfillment_date = CASE WHEN p_status = 'fulfilled' THEN now() ELSE NULL END,
         responsavel_id = auth.uid(),
         evidencia = v_evidence,
         updated_at = now()
   WHERE id = p_id;

  INSERT INTO public.audit_log (user_id, action, collection, record_id, record_name, changes)
  VALUES (
    auth.uid(), 'update', 'lgpd_access_request_log', p_id::text,
    'Solicitação LGPD ' || v_request.request_type,
    jsonb_build_object('status', p_status)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_update_lgpd_request(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_update_lgpd_request(uuid, text, text) TO authenticated;
