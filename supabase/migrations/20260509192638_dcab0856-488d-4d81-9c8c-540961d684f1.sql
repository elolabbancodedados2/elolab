CREATE OR REPLACE FUNCTION public.fn_fill_clinica_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  IF my_clinica_id IS NULL AND row_data ? 'convenio_id' THEN
    related_id := NULLIF(row_data->>'convenio_id', '')::uuid;
    IF related_id IS NOT NULL THEN
      SELECT c.clinica_id INTO my_clinica_id FROM public.convenios c WHERE c.id = related_id;
    END IF;
  END IF;

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
$function$;

UPDATE public.precos_exames_convenio p
SET clinica_id = c.clinica_id
FROM public.convenios c
WHERE p.convenio_id = c.id
  AND p.clinica_id IS NULL
  AND c.clinica_id IS NOT NULL;