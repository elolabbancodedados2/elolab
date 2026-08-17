-- Uma prescrição não pode carregar clinica_id correto e, ao mesmo tempo,
-- apontar para paciente, médico ou prontuário de outra clínica.

BEGIN;

DO $$
DECLARE
  v_inconsistentes bigint;
BEGIN
  SELECT count(*) INTO v_inconsistentes
    FROM public.prescricoes AS p
    LEFT JOIN public.prontuarios AS pr ON pr.id = p.prontuario_id
    LEFT JOIN public.pacientes AS pa ON pa.id = p.paciente_id
    LEFT JOIN public.medicos AS m ON m.id = p.medico_id
   WHERE (p.prontuario_id IS NOT NULL AND (
            pr.id IS NULL
            OR pr.clinica_id IS DISTINCT FROM p.clinica_id
            OR pr.paciente_id IS DISTINCT FROM p.paciente_id
            OR pr.medico_id IS DISTINCT FROM p.medico_id
         ))
      OR (p.paciente_id IS NOT NULL AND (pa.id IS NULL OR pa.clinica_id IS DISTINCT FROM p.clinica_id))
      OR (p.medico_id IS NOT NULL AND (m.id IS NULL OR m.clinica_id IS DISTINCT FROM p.clinica_id));

  IF v_inconsistentes > 0 THEN
    RAISE EXCEPTION
      'Há % prescrição(ões) com referências entre clínicas. A migration foi abortada sem alterações.',
      v_inconsistentes;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_prescricao_clinica()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_clinica_id uuid;
  v_paciente_id uuid;
  v_medico_id uuid;
BEGIN
  IF NEW.clinica_id IS NULL THEN
    RAISE EXCEPTION 'clinica_id é obrigatório na prescrição'
      USING ERRCODE = 'not_null_violation';
  END IF;

  IF TG_OP = 'INSERT' AND (NEW.paciente_id IS NULL OR NEW.medico_id IS NULL) THEN
    RAISE EXCEPTION 'Paciente e médico são obrigatórios em uma nova prescrição'
      USING ERRCODE = 'not_null_violation';
  END IF;

  IF NEW.prontuario_id IS NOT NULL THEN
    SELECT pr.clinica_id, pr.paciente_id, pr.medico_id
      INTO v_clinica_id, v_paciente_id, v_medico_id
      FROM public.prontuarios AS pr
     WHERE pr.id = NEW.prontuario_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Prontuário não encontrado ou fora da sua clínica';
    END IF;
    IF v_clinica_id IS DISTINCT FROM NEW.clinica_id
       OR v_paciente_id IS DISTINCT FROM NEW.paciente_id
       OR v_medico_id IS DISTINCT FROM NEW.medico_id THEN
      RAISE EXCEPTION 'A prescrição não corresponde à clínica, paciente e médico do prontuário'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.paciente_id IS NOT NULL THEN
    SELECT pa.clinica_id INTO v_clinica_id
      FROM public.pacientes AS pa
     WHERE pa.id = NEW.paciente_id;
    IF NOT FOUND OR v_clinica_id IS DISTINCT FROM NEW.clinica_id THEN
      RAISE EXCEPTION 'Paciente não encontrado ou pertence a outra clínica'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.medico_id IS NOT NULL THEN
    SELECT m.clinica_id INTO v_clinica_id
      FROM public.medicos AS m
     WHERE m.id = NEW.medico_id;
    IF NOT FOUND OR v_clinica_id IS DISTINCT FROM NEW.clinica_id THEN
      RAISE EXCEPTION 'Médico não encontrado ou pertence a outra clínica'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validar_prescricao_clinica ON public.prescricoes;
CREATE TRIGGER validar_prescricao_clinica
  BEFORE INSERT OR UPDATE OF clinica_id, paciente_id, medico_id, prontuario_id
  ON public.prescricoes
  FOR EACH ROW EXECUTE FUNCTION public.validar_prescricao_clinica();

COMMENT ON FUNCTION public.validar_prescricao_clinica() IS
  'Impede prescrição de uma clínica de referenciar paciente, médico ou prontuário de outra.';

COMMIT;
