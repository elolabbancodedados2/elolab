BEGIN;

LOCK TABLE public.prescricoes IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.prescricoes
     WHERE observacoes LIKE 'Memed:%'
     GROUP BY clinica_id, observacoes
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Existem prescricoes Memed locais duplicadas; reconcilie os registros antes de criar a chave idempotente.';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS prescricoes_memed_marker_unico
  ON public.prescricoes (clinica_id, observacoes)
  WHERE observacoes LIKE 'Memed:%';

CREATE OR REPLACE FUNCTION public.registrar_prescricao_memed_local(
  p_clinica_id uuid,
  p_paciente_id uuid,
  p_medico_id uuid,
  p_prescription_uuid text,
  p_medicamento text,
  p_data_emissao date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_marker text;
  v_id uuid;
  v_paciente_clinica uuid;
  v_medico_clinica uuid;
  v_paciente_id uuid;
  v_medico_id uuid;
BEGIN
  IF p_clinica_id IS NULL OR p_paciente_id IS NULL OR p_medico_id IS NULL
     OR NULLIF(btrim(p_prescription_uuid), '') IS NULL
     OR NULLIF(btrim(p_medicamento), '') IS NULL THEN
    RAISE EXCEPTION 'Dados obrigatorios da prescricao Memed ausentes.' USING ERRCODE = 'not_null_violation';
  END IF;

  SELECT clinica_id INTO v_paciente_clinica FROM public.pacientes WHERE id = p_paciente_id;
  SELECT clinica_id INTO v_medico_clinica FROM public.medicos WHERE id = p_medico_id;
  IF v_paciente_clinica IS DISTINCT FROM p_clinica_id
     OR v_medico_clinica IS DISTINCT FROM p_clinica_id THEN
    RAISE EXCEPTION 'Paciente e prescritor precisam pertencer a clinica da prescricao.'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  v_marker := 'Memed:' || p_prescription_uuid;
  INSERT INTO public.prescricoes (
    clinica_id, paciente_id, medico_id, tipo, medicamento, observacoes, data_emissao
  ) VALUES (
    p_clinica_id, p_paciente_id, p_medico_id, 'simples', left(p_medicamento, 10000), v_marker,
    COALESCE(p_data_emissao, CURRENT_DATE)
  )
  ON CONFLICT (clinica_id, observacoes) WHERE observacoes LIKE 'Memed:%' DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id, paciente_id, medico_id
      INTO v_id, v_paciente_id, v_medico_id
      FROM public.prescricoes
     WHERE clinica_id = p_clinica_id AND observacoes = v_marker;
    IF v_id IS NULL OR v_paciente_id IS DISTINCT FROM p_paciente_id
       OR v_medico_id IS DISTINCT FROM p_medico_id THEN
      RAISE EXCEPTION 'A prescricao Memed local ja esta vinculada a outro paciente ou medico.'
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_prescricao_memed_local(uuid, uuid, uuid, text, text, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_prescricao_memed_local(uuid, uuid, uuid, text, text, date)
  TO service_role;

COMMENT ON FUNCTION public.registrar_prescricao_memed_local(uuid, uuid, uuid, text, text, date) IS
  'Cria uma unica linha local por receita Memed e torna callbacks concorrentes idempotentes.';

COMMIT;
