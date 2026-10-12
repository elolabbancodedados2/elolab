BEGIN;

-- Keep clinical references inside the triage tenant and make the recorded
-- author match the authenticated user for direct REST writes as well.
CREATE OR REPLACE FUNCTION public.validar_referencias_triagem()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  paciente_clinica_id uuid;
  agendamento_clinica_id uuid;
  agendamento_paciente_id uuid;
BEGIN
  IF NEW.clinica_id IS NULL THEN
    RAISE EXCEPTION 'A triagem precisa pertencer a uma clínica.'
      USING ERRCODE = '23514';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.is_same_clinica(NEW.clinica_id) THEN
    RAISE EXCEPTION 'A triagem precisa pertencer à clínica do usuário autenticado.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' AND auth.uid() IS NOT NULL
     AND NEW.enfermeiro_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'A autoria da triagem precisa corresponder ao usuário autenticado.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.enfermeiro_id IS DISTINCT FROM OLD.enfermeiro_id THEN
    RAISE EXCEPTION 'A autoria registrada da triagem não pode ser alterada.'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.clinica_id
    INTO paciente_clinica_id
    FROM public.pacientes p
   WHERE p.id = NEW.paciente_id
   FOR SHARE;

  IF NOT FOUND OR paciente_clinica_id IS DISTINCT FROM NEW.clinica_id THEN
    RAISE EXCEPTION 'O paciente precisa pertencer à mesma clínica da triagem.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.agendamento_id IS NOT NULL THEN
    SELECT a.clinica_id, a.paciente_id
      INTO agendamento_clinica_id, agendamento_paciente_id
      FROM public.agendamentos a
     WHERE a.id = NEW.agendamento_id
     FOR SHARE;

    IF NOT FOUND
       OR agendamento_clinica_id IS DISTINCT FROM NEW.clinica_id
       OR agendamento_paciente_id IS DISTINCT FROM NEW.paciente_id THEN
      RAISE EXCEPTION 'O agendamento precisa pertencer à mesma clínica e ao mesmo paciente da triagem.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_referencias_triagem() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS triagens_validar_referencias ON public.triagens;
CREATE TRIGGER triagens_validar_referencias
  BEFORE INSERT OR UPDATE OF paciente_id, agendamento_id, clinica_id, enfermeiro_id
  ON public.triagens
  FOR EACH ROW EXECUTE FUNCTION public.validar_referencias_triagem();

COMMIT;
