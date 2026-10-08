BEGIN;

ALTER TABLE public.prescricoes
  ADD COLUMN IF NOT EXISTS arquivo_pdf text;

CREATE OR REPLACE FUNCTION public.storage_med_attach_allowed(_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parts text[];
  candidate uuid;
  my_clinica uuid;
BEGIN
  my_clinica := public.get_my_clinica_id();
  IF my_clinica IS NULL OR _name IS NULL THEN
    RETURN false;
  END IF;

  parts := string_to_array(_name, '/');

  -- Resultados de exames: exames/<paciente_id>/<arquivo>.
  IF array_length(parts, 1) >= 2 AND parts[1] = 'exames' THEN
    BEGIN
      candidate := parts[2]::uuid;
    EXCEPTION WHEN others THEN
      RETURN false;
    END;
    RETURN EXISTS (
      SELECT 1 FROM public.pacientes p
      WHERE p.id = candidate AND p.clinica_id = my_clinica
    );
  END IF;

  -- PDFs de prescrições: prescricoes/<paciente_id>/<arquivo>.
  IF array_length(parts, 1) >= 3 AND parts[1] = 'prescricoes' THEN
    BEGIN
      candidate := parts[2]::uuid;
    EXCEPTION WHEN others THEN
      RETURN false;
    END;
    RETURN EXISTS (
      SELECT 1 FROM public.pacientes p
      WHERE p.id = candidate AND p.clinica_id = my_clinica
    );
  END IF;

  -- Anexos clínicos antigos: <prontuario_id>/<arquivo>.
  IF array_length(parts, 1) >= 1 THEN
    BEGIN
      candidate := parts[1]::uuid;
    EXCEPTION WHEN others THEN
      RETURN false;
    END;
    RETURN EXISTS (
      SELECT 1 FROM public.prontuarios pr
      WHERE pr.id = candidate AND pr.clinica_id = my_clinica
    );
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.storage_med_attach_allowed(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storage_med_attach_allowed(text) TO authenticated;

COMMENT ON COLUMN public.prescricoes.arquivo_pdf IS
  'Path privado do PDF emitido; fica no bucket medical-attachments e é escopado pela clínica do paciente.';

COMMIT;
