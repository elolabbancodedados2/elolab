-- Corrige as policies originais de prontuario_diagnosticos, que não limitavam
-- a leitura à clínica do prontuário. Nenhum dado é alterado por esta migration.
BEGIN;

DROP POLICY IF EXISTS "Paciente pode ver diagnósticos de seu prontuário"
  ON public.prontuario_diagnosticos;
DROP POLICY IF EXISTS "Admin pode ver diagnósticos de pacientes da clínica"
  ON public.prontuario_diagnosticos;

CREATE POLICY "Usuários podem ver diagnósticos da própria clínica"
  ON public.prontuario_diagnosticos FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.prontuarios p
      JOIN public.pacientes paciente ON paciente.id = p.paciente_id
      WHERE p.id = prontuario_diagnosticos.prontuario_id
        AND public.is_same_clinica(paciente.clinica_id)
    )
  );

COMMIT;
