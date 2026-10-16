BEGIN;

ALTER TABLE public.tipos_consulta
  ADD COLUMN IF NOT EXISTS instrucoes_preparo text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.tipos_consulta'::regclass
       AND conname = 'tipos_consulta_instrucoes_preparo_limite'
  ) THEN
    ALTER TABLE public.tipos_consulta
      ADD CONSTRAINT tipos_consulta_instrucoes_preparo_limite
      CHECK (instrucoes_preparo IS NULL OR char_length(instrucoes_preparo) <= 2000);
  END IF;
END;
$$;

COMMENT ON COLUMN public.tipos_consulta.instrucoes_preparo IS
  'Orientação administrativa de preparo, mostrada apenas ao próprio paciente em consultas futuras ativas no portal.';

COMMIT;
