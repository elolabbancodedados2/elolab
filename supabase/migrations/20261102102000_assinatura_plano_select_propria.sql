-- ============================================================================
-- Auditoria de 02/11 — assinatura do plano visível só ao dono e à plataforma
--
-- assinatura_select (20260303170248) liberava a leitura para is_admin, ou seja,
-- o admin de qualquer clínica via as assinaturas de todas as outras.
--
-- A tela (src/hooks/useSubscriptionPlan.ts) só lê a linha do próprio usuário
-- (.eq('user_id', user.id)); o painel da plataforma usa is_platform_admin.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS "assinatura_select" ON public.assinaturas_plano;
CREATE POLICY "assinatura_select" ON public.assinaturas_plano
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin());

COMMIT;
