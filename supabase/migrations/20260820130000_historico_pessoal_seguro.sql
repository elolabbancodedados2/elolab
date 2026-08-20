DROP POLICY IF EXISTS "audit_log_select" ON public.audit_log;
DROP POLICY IF EXISTS "audit_log_insert" ON public.audit_log;
DROP POLICY IF EXISTS "audit_log_select_scoped" ON public.audit_log;
DROP POLICY IF EXISTS "audit_log_insert_scoped" ON public.audit_log;

CREATE POLICY "audit_log_select_scoped" ON public.audit_log FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR public.is_platform_admin() OR
  (public.is_admin(auth.uid()) AND clinica_id IS NOT NULL AND clinica_id = public.get_my_clinica_id())
);
CREATE POLICY "audit_log_insert_scoped" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND ((clinica_id IS NOT NULL AND clinica_id = public.get_my_clinica_id()) OR
  (clinica_id IS NULL AND public.is_platform_admin()))
);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_clinica_timestamp ON public.audit_log (user_id, clinica_id, "timestamp" DESC);

CREATE OR REPLACE FUNCTION public.meu_historico_acoes(
  p_action text DEFAULT NULL, p_collection text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL,
  p_page integer DEFAULT 1, p_page_size integer DEFAULT 20
) RETURNS TABLE (event_id uuid, action text, resource text, occurred_at timestamptz, total_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user_id uuid := auth.uid(); v_clinica_id uuid;
  v_page integer := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size integer := LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 50);
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Sessão inválida' USING ERRCODE = '28000'; END IF;
  SELECT p.clinica_id INTO v_clinica_id FROM public.profiles p WHERE p.id = v_user_id AND p.ativo IS TRUE;
  IF v_clinica_id IS NULL THEN RAISE EXCEPTION 'Conta sem clínica ativa' USING ERRCODE = '42501'; END IF;
  IF p_action IS NOT NULL AND p_action NOT IN ('create','update','delete','access','sign','edit_request') THEN
    RAISE EXCEPTION 'Ação inválida' USING ERRCODE = '22023';
  END IF;
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from > p_to THEN
    RAISE EXCEPTION 'Período inválido' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY SELECT a.id, a.action, a.collection, a."timestamp", count(*) OVER ()
  FROM public.audit_log a
  WHERE a.user_id = v_user_id AND a.clinica_id = v_clinica_id
    AND (p_action IS NULL OR a.action = p_action)
    AND (p_collection IS NULL OR a.collection = p_collection)
    AND (p_from IS NULL OR a."timestamp" >= p_from) AND (p_to IS NULL OR a."timestamp" <= p_to)
  ORDER BY a."timestamp" DESC, a.id DESC LIMIT v_page_size OFFSET (v_page - 1) * v_page_size;
END; $$;
REVOKE ALL ON FUNCTION public.meu_historico_acoes(text,text,timestamptz,timestamptz,integer,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.meu_historico_acoes(text,text,timestamptz,timestamptz,integer,integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.meu_historico_acoes(text,text,timestamptz,timestamptz,integer,integer) TO authenticated;
COMMENT ON FUNCTION public.meu_historico_acoes(text,text,timestamptz,timestamptz,integer,integer) IS
  'Somente metadados não sensíveis das ações do usuário autenticado na clínica atual.';
