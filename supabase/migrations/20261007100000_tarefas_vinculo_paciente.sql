-- Permite relacionar uma tarefa operacional ao paciente de origem sem
-- expor dados de outra clínica nem permitir associação pelo perfil financeiro.
ALTER TABLE public.tarefas
  ADD COLUMN IF NOT EXISTS paciente_id uuid
  REFERENCES public.pacientes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tarefas_paciente_id
  ON public.tarefas (paciente_id)
  WHERE paciente_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validar_paciente_da_tarefa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  paciente_clinica_id uuid;
BEGIN
  IF NEW.paciente_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NOT NULL AND (
    NOT public.has_any_role(auth.uid()) OR public.is_financeiro(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Seu perfil não pode vincular pacientes a tarefas.'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.clinica_id
    INTO paciente_clinica_id
    FROM public.pacientes p
   WHERE p.id = NEW.paciente_id;

  IF NOT FOUND OR NEW.clinica_id IS NULL OR paciente_clinica_id IS DISTINCT FROM NEW.clinica_id THEN
    RAISE EXCEPTION 'O paciente precisa pertencer à mesma clínica da tarefa.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tarefas_validar_paciente ON public.tarefas;
CREATE TRIGGER tarefas_validar_paciente
  BEFORE INSERT OR UPDATE OF paciente_id, clinica_id ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION public.validar_paciente_da_tarefa();
