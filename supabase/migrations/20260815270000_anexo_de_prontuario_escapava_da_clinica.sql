-- ============================================================================
-- Anexo de prontuário não era escopado por clínica
--
-- Encontrado por verificação, ao testar se a aba de anexos funcionava. As
-- quatro políticas de `anexos_prontuario` checavam só o PAPEL:
--
--   anexos_select : can_access_clinical(auth.uid())
--   anexos_insert : can_access_clinical(auth.uid())
--   anexos_update : can_access_clinical(auth.uid())
--   anexos_delete : is_admin(...) OR is_medico(...)
--
-- Nenhuma delas menciona clínica. O `SELECT` é o pior: qualquer usuário
-- clínico de qualquer clínica lia o anexo de prontuário de TODAS as outras —
-- exame, laudo, foto. É dado de saúde de paciente de terceiro, e é a falha de
-- isolamento mais séria encontrada nesta série de verificações.
--
-- Reproduzido antes de corrigir: um médico gravou anexo no prontuário de uma
-- clínica vizinha, dentro de transação desfeita.
--
-- ─── POR QUE NÃO DEU PROBLEMA ATÉ AGORA ────────────────────────────────────
--
-- A tabela está vazia: zero anexos em 19 prontuários. Ninguém chegou a usar a
-- aba, então não houve o que vazar. Corrigir agora, com a tabela vazia, é o
-- momento mais barato possível — nenhuma linha precisa ser reclassificada.
--
-- A coluna `clinica_id` já existe e é preenchida pelo gatilho
-- `fn_fill_clinica_id`, que resolve pelo `paciente_id`. As políticas passam a
-- usá-la, no mesmo formato do resto do sistema.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS anexos_select ON public.anexos_prontuario;
CREATE POLICY anexos_select ON public.anexos_prontuario
  FOR SELECT USING (
    can_access_clinical(auth.uid()) AND is_same_clinica(clinica_id)
  );

DROP POLICY IF EXISTS anexos_insert ON public.anexos_prontuario;
CREATE POLICY anexos_insert ON public.anexos_prontuario
  FOR INSERT WITH CHECK (
    can_access_clinical(auth.uid())
    -- O WITH CHECK roda depois dos gatilhos BEFORE, então quando o app insere
    -- sem informar a clínica o carimbo já aconteceu e a checagem aprova.
    AND (clinica_id IS NULL OR is_same_clinica(clinica_id))
    -- E o prontuário precisa ser desta clínica: sem isto, um anexo com a
    -- clínica certa poderia ser pendurado no prontuário do vizinho.
    AND EXISTS (
      SELECT 1 FROM public.prontuarios p
       WHERE p.id = prontuario_id AND is_same_clinica(p.clinica_id)
    )
  );

DROP POLICY IF EXISTS anexos_update ON public.anexos_prontuario;
CREATE POLICY anexos_update ON public.anexos_prontuario
  FOR UPDATE USING (
    can_access_clinical(auth.uid()) AND is_same_clinica(clinica_id)
  );

DROP POLICY IF EXISTS anexos_delete ON public.anexos_prontuario;
CREATE POLICY anexos_delete ON public.anexos_prontuario
  FOR DELETE USING (
    (is_admin(auth.uid()) OR is_medico(auth.uid())) AND is_same_clinica(clinica_id)
  );

COMMIT;
