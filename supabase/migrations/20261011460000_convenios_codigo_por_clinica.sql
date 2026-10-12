BEGIN;

-- O código interno pertence ao catálogo de cada clínica, não ao sistema inteiro.
-- Mantém também a unicidade dos registros legados sem clínica associada.
LOCK TABLE public.convenios IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.convenios
  DROP CONSTRAINT IF EXISTS convenios_codigo_key;

CREATE UNIQUE INDEX IF NOT EXISTS convenios_clinica_codigo_key
  ON public.convenios (clinica_id, codigo)
  WHERE clinica_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS convenios_codigo_sem_clinica_key
  ON public.convenios (codigo)
  WHERE clinica_id IS NULL;

COMMIT;
