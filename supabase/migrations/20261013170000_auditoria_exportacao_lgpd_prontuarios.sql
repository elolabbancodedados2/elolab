BEGIN;

-- Exportacao de dados clinicos e um acesso auditavel proprio. Nao registrar
-- falsamente uma visualizacao para satisfazer as policies de prontuario.
CREATE OR REPLACE FUNCTION public.registrar_exportacao_lgpd_paciente(p_paciente_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinica_id uuid := public.get_my_clinica_id();
  v_nome text;
  v_crm text;
  v_registrados integer := 0;
BEGIN
  IF auth.uid() IS NULL OR v_clinica_id IS NULL
     OR NOT (public.is_admin(auth.uid()) OR public.is_medico(auth.uid())) THEN
    RAISE EXCEPTION 'Acesso clinico nao autorizado.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.is_paciente_da_clinica(p_paciente_id, v_clinica_id) THEN
    RAISE EXCEPTION 'Paciente nao encontrado nesta clinica.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT nome, crm INTO v_nome, v_crm FROM public.medicos
   WHERE user_id = auth.uid() AND clinica_id = v_clinica_id AND ativo IS NOT FALSE
   ORDER BY created_at DESC LIMIT 1;

  INSERT INTO public.prontuario_acessos (
    prontuario_id, paciente_id, clinica_id, user_id, user_nome, user_crm, acao, justificativa
  )
  SELECT p.id, p.paciente_id, p.clinica_id, auth.uid(),
         COALESCE(v_nome, auth.jwt() ->> 'email', 'Usuario clinico'), v_crm,
         'exportacao', 'Exportacao solicitada no modulo LGPD'
    FROM public.prontuarios p
   WHERE p.paciente_id = p_paciente_id AND p.clinica_id = v_clinica_id
     AND (public.is_admin(auth.uid()) OR (public.is_medico(auth.uid())
       AND (p.assinado IS TRUE OR public.is_medico_responsavel_do_prontuario(p.medico_id))));
  GET DIAGNOSTICS v_registrados = ROW_COUNT;
  RETURN v_registrados;
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_exportacao_lgpd_paciente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_exportacao_lgpd_paciente(uuid) TO authenticated;

-- Table and Storage policies accept only an explicit recent clinical read or
-- export event for the same signed chart and authenticated user.
CREATE OR REPLACE FUNCTION public.prontuario_leitura_auditada(p_prontuario_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.prontuario_acessos pa
     WHERE pa.prontuario_id = p_prontuario_id
       AND pa.user_id = auth.uid()
       AND pa.acao IN ('visualizacao', 'exportacao')
       AND pa.created_at >= now() - interval '2 minutes'
  );
$$;
REVOKE ALL ON FUNCTION public.prontuario_leitura_auditada(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prontuario_leitura_auditada(uuid) TO authenticated;

COMMIT;
