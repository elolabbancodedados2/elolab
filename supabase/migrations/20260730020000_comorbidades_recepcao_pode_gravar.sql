-- ============================================================================
-- Recepção não conseguia gravar comorbidade, e isso quebrava o cadastro
--
-- Erro meu na migration 20260729150000. Criei paciente_comorbidades liberando
-- escrita para can_access_clinical (admin, médico, enfermagem) — e coloquei o
-- campo na ficha do paciente, que é preenchida pela RECEPÇÃO.
--
-- Resultado: a recepcionista cadastrava o paciente, digitava "Diabetes", e o
-- RLS recusava. O paciente já tinha sido criado, mas a tela mostrava erro — e
-- quem tenta de novo cria paciente duplicado.
--
-- Registrar "o paciente disse que tem diabetes" na ficha é triagem
-- administrativa, não diagnóstico. Quem preenche a ficha precisa poder gravar.
-- Apagar segue restrito a admin: remover histórico clínico é outra coisa.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS paciente_comorbidades_insert ON public.paciente_comorbidades;
CREATE POLICY paciente_comorbidades_insert ON public.paciente_comorbidades
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.can_access_clinical(auth.uid()) OR public.can_manage_data(auth.uid()))
    AND (clinica_id IS NULL OR clinica_id = public.get_my_clinica_id())
  );

DROP POLICY IF EXISTS paciente_comorbidades_update ON public.paciente_comorbidades;
CREATE POLICY paciente_comorbidades_update ON public.paciente_comorbidades
  FOR UPDATE TO authenticated
  USING (
    (public.can_access_clinical(auth.uid()) OR public.can_manage_data(auth.uid()))
    AND public.is_same_clinica(clinica_id)
  )
  WITH CHECK (
    (public.can_access_clinical(auth.uid()) OR public.can_manage_data(auth.uid()))
    AND public.is_same_clinica(clinica_id)
  );

COMMENT ON POLICY paciente_comorbidades_insert ON public.paciente_comorbidades IS
  'can_manage_data incluído porque o campo fica na ficha do paciente, preenchida pela recepção. Sem isso o cadastro falhava depois de já ter criado o paciente.';

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
-- SELECT cmd, policyname, coalesce(with_check, qual) FROM pg_policies
--  WHERE schemaname='public' AND tablename='paciente_comorbidades' ORDER BY cmd;
-- INSERT e UPDATE devem citar can_manage_data; DELETE deve seguir só is_admin.
