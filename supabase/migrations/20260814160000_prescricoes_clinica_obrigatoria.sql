-- Prescrições não podem ficar sem clínica.
--
-- As políticas já tentavam escopar por clínica, mas aceitavam NULL para manter
-- compatibilidade com dados antigos. NULL não representa uma clínica e pode
-- escapar de verificações de isolamento em RPCs e joins.

BEGIN;

UPDATE public.prescricoes p
   SET clinica_id = pr.clinica_id
  FROM public.prontuarios pr
 WHERE p.clinica_id IS NULL
   AND p.prontuario_id = pr.id
   AND pr.clinica_id IS NOT NULL;

UPDATE public.prescricoes p
   SET clinica_id = pa.clinica_id
  FROM public.pacientes pa
 WHERE p.clinica_id IS NULL
   AND p.paciente_id = pa.id
   AND pa.clinica_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.prescricoes WHERE clinica_id IS NULL) THEN
    RAISE EXCEPTION
      'Existem prescrições sem clínica. Corrija os registros antes de aplicar esta migration.';
  END IF;
END;
$$;

ALTER TABLE public.prescricoes
  ALTER COLUMN clinica_id SET NOT NULL;

DROP POLICY IF EXISTS prescricoes_insert ON public.prescricoes;
DROP POLICY IF EXISTS prescricoes_insert_scoped ON public.prescricoes;
CREATE POLICY prescricoes_insert ON public.prescricoes FOR INSERT TO authenticated
  WITH CHECK (
    (is_admin(auth.uid()) OR is_medico(auth.uid()))
    AND clinica_id = get_my_clinica_id()
  );

DROP POLICY IF EXISTS prescricoes_select ON public.prescricoes;
DROP POLICY IF EXISTS prescricoes_select_scoped ON public.prescricoes;
CREATE POLICY prescricoes_select ON public.prescricoes FOR SELECT TO authenticated
  USING (can_access_clinical(auth.uid()) AND clinica_id = get_my_clinica_id());

DROP POLICY IF EXISTS prescricoes_update ON public.prescricoes;
DROP POLICY IF EXISTS prescricoes_update_scoped ON public.prescricoes;
CREATE POLICY prescricoes_update ON public.prescricoes FOR UPDATE TO authenticated
  USING (
    (is_admin(auth.uid()) OR is_medico(auth.uid()))
    AND clinica_id = get_my_clinica_id()
  )
  WITH CHECK (
    (is_admin(auth.uid()) OR is_medico(auth.uid()))
    AND clinica_id = get_my_clinica_id()
  );

DROP POLICY IF EXISTS prescricoes_delete ON public.prescricoes;
DROP POLICY IF EXISTS prescricoes_delete_scoped ON public.prescricoes;
CREATE POLICY prescricoes_delete ON public.prescricoes FOR DELETE TO authenticated
  USING (
    (is_admin(auth.uid()) OR is_medico(auth.uid()))
    AND clinica_id = get_my_clinica_id()
  );

COMMIT;
