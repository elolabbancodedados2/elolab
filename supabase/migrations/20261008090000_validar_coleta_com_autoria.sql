-- Validação de laudo em uma transação: só avança de análise, com resultados,
-- e registra quem conferiu cada resultado antes de permitir a publicação.
BEGIN;

CREATE OR REPLACE FUNCTION public.validar_coleta_laboratorio(p_coleta_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_clinica_id uuid;
  v_resultados_atualizados integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT can_access_clinical(auth.uid()) THEN
    RAISE EXCEPTION 'Seu perfil não pode validar resultados laboratoriais.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_clinica_id := get_my_clinica_id();
  IF v_clinica_id IS NULL THEN
    RAISE EXCEPTION 'Clínica não identificada.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT c.status
    INTO v_status
    FROM public.coletas_laboratorio AS c
   WHERE c.id = p_coleta_id
     AND c.clinica_id = v_clinica_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Coleta não encontrada ou fora da clínica atual.'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_status <> 'em_analise' THEN
    RAISE EXCEPTION 'A coleta precisa estar em análise para ser validada. Situação atual: %.', v_status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.resultados_laboratorio AS r
     WHERE r.coleta_id = p_coleta_id
       AND r.clinica_id = v_clinica_id
  ) THEN
    RAISE EXCEPTION 'Inclua ao menos um resultado antes de validar a coleta.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.resultados_laboratorio AS r
     SET validado_por = COALESCE(r.validado_por, auth.uid()),
         data_validacao = COALESCE(r.data_validacao, now())
   WHERE r.coleta_id = p_coleta_id
     AND r.clinica_id = v_clinica_id
     AND (r.validado_por IS NULL OR r.data_validacao IS NULL);
  GET DIAGNOSTICS v_resultados_atualizados = ROW_COUNT;

  IF EXISTS (
    SELECT 1
      FROM public.resultados_laboratorio AS r
     WHERE r.coleta_id = p_coleta_id
       AND r.clinica_id = v_clinica_id
       AND (r.validado_por IS NULL OR r.data_validacao IS NULL)
  ) THEN
    RAISE EXCEPTION 'Não foi possível registrar a autoria da conferência dos resultados.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.coletas_laboratorio AS c
     SET status = 'validado'
   WHERE c.id = p_coleta_id
     AND c.clinica_id = v_clinica_id
     AND c.status = 'em_analise';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A situação da coleta mudou. Atualize a tela e tente novamente.'
      USING ERRCODE = 'serialization_failure';
  END IF;

  RETURN v_resultados_atualizados;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_coleta_laboratorio(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validar_coleta_laboratorio(uuid) TO authenticated;

COMMENT ON FUNCTION public.validar_coleta_laboratorio(uuid) IS
  'Valida coleta em análise com resultados, grava autoria e avança o status em uma transação.';

COMMIT;
