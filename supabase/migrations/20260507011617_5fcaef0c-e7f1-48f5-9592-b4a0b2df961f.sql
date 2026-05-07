CREATE OR REPLACE FUNCTION public.fn_fill_clinica_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  my_clinica_id uuid;
  row_data jsonb;
  related_id uuid;
BEGIN
  IF NEW.clinica_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  row_data := to_jsonb(NEW);

  SELECT p.clinica_id INTO my_clinica_id
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF my_clinica_id IS NULL AND row_data ? 'paciente_id' THEN
    related_id := NULLIF(row_data->>'paciente_id', '')::uuid;
    IF related_id IS NOT NULL THEN
      SELECT p.clinica_id INTO my_clinica_id FROM public.pacientes p WHERE p.id = related_id;
    END IF;
  END IF;

  IF my_clinica_id IS NULL AND row_data ? 'medico_id' THEN
    related_id := NULLIF(row_data->>'medico_id', '')::uuid;
    IF related_id IS NOT NULL THEN
      SELECT m.clinica_id INTO my_clinica_id FROM public.medicos m WHERE m.id = related_id;
    END IF;
  END IF;

  IF my_clinica_id IS NULL AND row_data ? 'medico_solicitante_id' THEN
    related_id := NULLIF(row_data->>'medico_solicitante_id', '')::uuid;
    IF related_id IS NOT NULL THEN
      SELECT m.clinica_id INTO my_clinica_id FROM public.medicos m WHERE m.id = related_id;
    END IF;
  END IF;

  IF my_clinica_id IS NULL AND row_data ? 'agendamento_id' THEN
    related_id := NULLIF(row_data->>'agendamento_id', '')::uuid;
    IF related_id IS NOT NULL THEN
      SELECT a.clinica_id INTO my_clinica_id FROM public.agendamentos a WHERE a.id = related_id;
    END IF;
  END IF;

  IF my_clinica_id IS NULL AND row_data ? 'exame_id' THEN
    related_id := NULLIF(row_data->>'exame_id', '')::uuid;
    IF related_id IS NOT NULL THEN
      SELECT e.clinica_id INTO my_clinica_id FROM public.exames e WHERE e.id = related_id;
    END IF;
  END IF;

  IF my_clinica_id IS NULL AND row_data ? 'user_id' THEN
    related_id := NULLIF(row_data->>'user_id', '')::uuid;
    IF related_id IS NOT NULL THEN
      SELECT p.clinica_id INTO my_clinica_id FROM public.profiles p WHERE p.id = related_id;
    END IF;
  END IF;

  IF my_clinica_id IS NOT NULL THEN
    NEW.clinica_id := my_clinica_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "users_select_own" ON public.tipos_exame_custom;
DROP POLICY IF EXISTS "users_insert_own" ON public.tipos_exame_custom;
DROP POLICY IF EXISTS "users_delete_own" ON public.tipos_exame_custom;
DROP POLICY IF EXISTS "tipos_exame_update" ON public.tipos_exame_custom;
DROP POLICY IF EXISTS "tipos_exame_custom_select_scoped" ON public.tipos_exame_custom;
DROP POLICY IF EXISTS "tipos_exame_custom_insert_scoped" ON public.tipos_exame_custom;
DROP POLICY IF EXISTS "tipos_exame_custom_update_scoped" ON public.tipos_exame_custom;
DROP POLICY IF EXISTS "tipos_exame_custom_delete_scoped" ON public.tipos_exame_custom;

CREATE POLICY "tipos_exame_custom_select_scoped" ON public.tipos_exame_custom
FOR SELECT TO authenticated
USING ((user_id = auth.uid()) OR is_same_clinica(clinica_id));

CREATE POLICY "tipos_exame_custom_insert_scoped" ON public.tipos_exame_custom
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND ((clinica_id = get_my_clinica_id()) OR (clinica_id IS NULL)));

CREATE POLICY "tipos_exame_custom_update_scoped" ON public.tipos_exame_custom
FOR UPDATE TO authenticated
USING ((user_id = auth.uid()) OR (is_admin(auth.uid()) AND is_same_clinica(clinica_id)))
WITH CHECK (((user_id = auth.uid()) OR is_admin(auth.uid())) AND clinica_id = get_my_clinica_id());

CREATE POLICY "tipos_exame_custom_delete_scoped" ON public.tipos_exame_custom
FOR DELETE TO authenticated
USING ((user_id = auth.uid()) OR (is_admin(auth.uid()) AND is_same_clinica(clinica_id)));

UPDATE public.tipos_exame_custom t
SET clinica_id = p.clinica_id
FROM public.profiles p
WHERE t.clinica_id IS NULL
  AND t.user_id = p.id
  AND p.clinica_id IS NOT NULL;