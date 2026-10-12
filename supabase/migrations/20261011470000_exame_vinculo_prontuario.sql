BEGIN;

ALTER TABLE public.exames
  ADD COLUMN IF NOT EXISTS prontuario_id uuid REFERENCES public.prontuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_exames_prontuario_id
  ON public.exames (prontuario_id)
  WHERE prontuario_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validar_referencia_prontuario_exame()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prontuario_clinica uuid;
  v_prontuario_paciente uuid;
  v_medico_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND public.is_medico(auth.uid()) THEN
    SELECT m.id
      INTO v_medico_id
      FROM public.medicos m
     WHERE m.user_id = auth.uid()
       AND m.clinica_id = NEW.clinica_id
     LIMIT 1;

    IF v_medico_id IS NULL
       OR NEW.medico_solicitante_id IS DISTINCT FROM v_medico_id THEN
      RAISE EXCEPTION 'O médico solicitante deve corresponder ao profissional autenticado.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.prontuario_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.clinica_id, p.paciente_id
    INTO v_prontuario_clinica, v_prontuario_paciente
    FROM public.prontuarios p
   WHERE p.id = NEW.prontuario_id
   FOR SHARE;

  IF NOT FOUND
     OR NEW.paciente_id IS DISTINCT FROM v_prontuario_paciente
     OR NEW.clinica_id IS DISTINCT FROM v_prontuario_clinica THEN
    RAISE EXCEPTION 'O prontuário do exame não corresponde ao paciente e à clínica.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_referencia_prontuario_exame() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS exames_validar_referencia_prontuario ON public.exames;
CREATE TRIGGER exames_validar_referencia_prontuario
  BEFORE INSERT OR UPDATE OF prontuario_id, paciente_id, clinica_id, medico_solicitante_id ON public.exames
  FOR EACH ROW EXECUTE FUNCTION public.validar_referencia_prontuario_exame();

COMMENT ON COLUMN public.exames.prontuario_id IS
  'Evolução clínica que originou a solicitação; deve pertencer ao mesmo paciente e à mesma clínica.';

COMMIT;
