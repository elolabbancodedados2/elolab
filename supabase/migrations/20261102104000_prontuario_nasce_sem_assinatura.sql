-- ============================================================================
-- Auditoria de 02/11 — prontuário não pode ser inserido já assinado
--
-- A assinatura é protegida pelo trigger trg_require_prontuario_author_to_sign,
-- mas ele só roda em BEFORE UPDATE OF assinado (20261011020000). Um INSERT
-- direto pela API com assinado = true, assinado_em, hash_conteudo e
-- crm_assinante preenchidos criava um registro "assinado" sem passar pelo
-- fluxo de assinatura.
--
-- A política de INSERT passa a exigir que o registro nasça sem assinatura. O
-- app (Prontuarios.tsx, Pacientes.tsx, expo-mobile compose.tsx) nunca envia
-- esses campos na criação; a assinatura acontece depois, por UPDATE.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS prontuarios_insert_autor_ou_admin ON public.prontuarios;
CREATE POLICY prontuarios_insert_autor_ou_admin ON public.prontuarios
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_same_clinica(clinica_id)
    AND public.is_paciente_da_clinica(paciente_id, clinica_id)
    AND (
      public.is_admin(auth.uid())
      OR (public.is_medico(auth.uid()) AND public.is_medico_responsavel_do_prontuario(medico_id))
    )
    AND assinado IS NOT TRUE
    AND assinado_em IS NULL
    AND hash_conteudo IS NULL
    AND crm_assinante IS NULL
  );

COMMIT;
