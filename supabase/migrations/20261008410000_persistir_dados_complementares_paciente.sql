BEGIN;

ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS estado_civil text,
  ADD COLUMN IF NOT EXISTS profissao text,
  ADD COLUMN IF NOT EXISTS tipo_sanguineo text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.pacientes'::regclass
      AND conname = 'pacientes_estado_civil_valido'
  ) THEN
    ALTER TABLE public.pacientes
      ADD CONSTRAINT pacientes_estado_civil_valido
      CHECK (estado_civil IS NULL OR estado_civil IN ('solteiro', 'casado', 'divorciado', 'viuvo', 'uniao_estavel'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.pacientes'::regclass
      AND conname = 'pacientes_tipo_sanguineo_valido'
  ) THEN
    ALTER TABLE public.pacientes
      ADD CONSTRAINT pacientes_tipo_sanguineo_valido
      CHECK (tipo_sanguineo IS NULL OR tipo_sanguineo IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.pacientes'::regclass
      AND conname = 'pacientes_profissao_tamanho_valido'
  ) THEN
    ALTER TABLE public.pacientes
      ADD CONSTRAINT pacientes_profissao_tamanho_valido
      CHECK (profissao IS NULL OR char_length(btrim(profissao)) <= 120);
  END IF;
END;
$$;

COMMENT ON COLUMN public.pacientes.estado_civil IS 'Estado civil informado pelo paciente, usado no cadastro administrativo.';
COMMENT ON COLUMN public.pacientes.profissao IS 'Profissão informada pelo paciente.';
COMMENT ON COLUMN public.pacientes.tipo_sanguineo IS 'Tipo sanguíneo informado; confirmar clinicamente antes de qualquer decisão assistencial.';

COMMIT;
