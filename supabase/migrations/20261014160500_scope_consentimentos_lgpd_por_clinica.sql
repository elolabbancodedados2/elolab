BEGIN;

-- Corrige consentimentos legados que ficaram sem clínica ou apontaram para
-- uma clínica diferente da ficha proprietária do paciente.
UPDATE public.consentimentos_lgpd c
   SET clinica_id = p.clinica_id
  FROM public.pacientes p
 WHERE p.id = c.paciente_id
   AND c.clinica_id IS DISTINCT FROM p.clinica_id;

CREATE OR REPLACE FUNCTION public.atribuir_clinica_ao_consentimento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clinica_id uuid := public.get_my_clinica_id();
  v_clinica_paciente uuid;
BEGIN
  IF v_clinica_id IS NULL THEN
    RAISE EXCEPTION 'Perfil sem clínica vinculada.' USING ERRCODE = '42501';
  END IF;

  SELECT p.clinica_id INTO v_clinica_paciente
    FROM public.pacientes p
   WHERE p.id = NEW.paciente_id
     AND p.clinica_id = v_clinica_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paciente não encontrado nesta clínica.' USING ERRCODE = '42501';
  END IF;

  -- A clínica vem da ficha, nunca de um valor enviado pelo navegador.
  NEW.clinica_id := v_clinica_paciente;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS consentimentos_lgpd_clinica_da_ficha ON public.consentimentos_lgpd;
DROP TRIGGER IF EXISTS consentimentos_lgpd_clinica_da_ficha ON public.consentimentos_lgpd;
CREATE TRIGGER consentimentos_lgpd_clinica_da_ficha
  BEFORE INSERT OR UPDATE OF paciente_id, clinica_id ON public.consentimentos_lgpd
  FOR EACH ROW EXECUTE FUNCTION public.atribuir_clinica_ao_consentimento();

REVOKE ALL ON FUNCTION public.atribuir_clinica_ao_consentimento() FROM PUBLIC, anon, authenticated;

COMMIT;
