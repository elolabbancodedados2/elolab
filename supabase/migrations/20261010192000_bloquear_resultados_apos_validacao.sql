-- Serializa alterações de resultados com a validação da coleta. Sem o lock
-- compartilhado, um INSERT podia ler "em_analise", perder a corrida para a
-- validação e gravar depois que a coleta já estivesse validada.
BEGIN;

CREATE OR REPLACE FUNCTION public.proteger_resultado_contra_estado_da_coleta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_clinica_id uuid;
  v_paciente_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.coleta_id IS DISTINCT FROM NEW.coleta_id THEN
    RAISE EXCEPTION 'O resultado não pode ser transferido para outra coleta.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT c.status, c.clinica_id, c.paciente_id
    INTO v_status, v_clinica_id, v_paciente_id
    FROM public.coletas_laboratorio AS c
   WHERE c.id = NEW.coleta_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Coleta % não encontrada para este resultado.', NEW.coleta_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NEW.clinica_id IS DISTINCT FROM v_clinica_id
     OR NEW.paciente_id IS DISTINCT FROM v_paciente_id THEN
    RAISE EXCEPTION 'O resultado precisa pertencer à mesma clínica e paciente da coleta.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_status = 'validado' THEN
    IF TG_OP <> 'UPDATE'
       OR COALESCE(OLD.liberado, false)
       OR NEW.liberado IS NOT TRUE
       OR (to_jsonb(NEW) - ARRAY['liberado', 'data_liberacao', 'liberado_por', 'updated_at'])
          IS DISTINCT FROM
          (to_jsonb(OLD) - ARRAY['liberado', 'data_liberacao', 'liberado_por', 'updated_at']) THEN
      RAISE EXCEPTION 'A coleta já foi validada. Não é permitido incluir ou alterar resultados; revise a coleta antes da liberação.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF v_status NOT IN ('coletado', 'em_analise') THEN
    RAISE EXCEPTION 'Não é permitido incluir ou alterar resultados quando a coleta está em "%".', v_status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS resultados_respeitam_estado_coleta ON public.resultados_laboratorio;
CREATE TRIGGER resultados_respeitam_estado_coleta
  BEFORE INSERT OR UPDATE ON public.resultados_laboratorio
  FOR EACH ROW
  EXECUTE FUNCTION public.proteger_resultado_contra_estado_da_coleta();

COMMENT ON FUNCTION public.proteger_resultado_contra_estado_da_coleta() IS
  'Serializa gravações de resultados com validação da coleta e bloqueia alterações clínicas após validação.';

COMMIT;
