-- The public booking endpoint needs to reuse legacy patient records whose CPF
-- formatting differs from the current masked/unmasked representation.
CREATE OR REPLACE FUNCTION public.find_patient_id_by_normalized_cpf(
  p_clinica_id uuid,
  p_cpf text
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.id
  FROM public.pacientes AS p
  WHERE p.clinica_id = p_clinica_id
    AND regexp_replace(p.cpf, '[^0-9]', '', 'g') = regexp_replace(p_cpf, '[^0-9]', '', 'g')
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_patient_id_by_normalized_cpf(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_patient_id_by_normalized_cpf(uuid, text)
  TO service_role;
