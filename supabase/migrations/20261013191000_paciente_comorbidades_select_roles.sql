-- Comorbidades da ficha continuam acessiveis a recepcao e equipe clinica,
-- mas nao ficam expostas a perfis financeiros sem necessidade operacional.
-- A policy filtra leitura; nenhum registro e alterado.
BEGIN;

DROP POLICY IF EXISTS paciente_comorbidades_select
  ON public.paciente_comorbidades;

CREATE POLICY paciente_comorbidades_select
  ON public.paciente_comorbidades FOR SELECT
  TO authenticated
  USING (
    public.is_same_clinica(clinica_id)
    AND (
      public.can_access_clinical(auth.uid())
      OR public.can_manage_data(auth.uid())
    )
  );

COMMIT;
