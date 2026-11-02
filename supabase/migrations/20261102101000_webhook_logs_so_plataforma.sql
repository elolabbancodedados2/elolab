-- ============================================================================
-- Auditoria de 02/11 — logs de webhook do Mercado Pago só para a plataforma
--
-- webhook_logs_select (20260303164042) e webhook_logs_insert_restricted
-- (20260322225957) usavam is_admin(auth.uid()), que vale para o admin de
-- QUALQUER clínica. Isso permitia:
--   * ler payloads de cobrança de todas as clínicas;
--   * inserir um log com o id de evento de outra pessoa (por exemplo
--     order:<id>:order.refunded:refunded) e "reservar" o evento antes do
--     webhook real, que então seria tratado como repetido.
--
-- Quem grava esses logs são as edge functions mercadopago-webhook e
-- platform-reprocess-job, com service role (ignora RLS). Nenhuma tela insere.
-- A leitura fica restrita à dona do SaaS (painel da plataforma).
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS "webhook_logs_insert_restricted" ON public.mercadopago_webhook_logs;
DROP POLICY IF EXISTS "webhook_logs_insert" ON public.mercadopago_webhook_logs;

DROP POLICY IF EXISTS "webhook_logs_select" ON public.mercadopago_webhook_logs;
CREATE POLICY "webhook_logs_select" ON public.mercadopago_webhook_logs
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

COMMIT;
