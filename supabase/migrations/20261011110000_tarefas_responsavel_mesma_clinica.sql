-- Impede que uma tarefa de uma clínica seja atribuída a um perfil de outro tenant.
CREATE OR REPLACE FUNCTION public.validar_responsavel_da_tarefa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  responsavel_clinica_id uuid;
BEGIN
  IF NEW.responsavel_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.clinica_id
    INTO responsavel_clinica_id
    FROM public.profiles p
   WHERE p.id = NEW.responsavel_id;

  IF NOT FOUND OR NEW.clinica_id IS NULL OR responsavel_clinica_id IS DISTINCT FROM NEW.clinica_id THEN
    RAISE EXCEPTION 'O responsável precisa pertencer à mesma clínica da tarefa.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tarefas_validar_responsavel ON public.tarefas;
CREATE TRIGGER tarefas_validar_responsavel
  BEFORE INSERT OR UPDATE OF responsavel_id, clinica_id ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION public.validar_responsavel_da_tarefa();
