-- ============================================================================
-- Remove políticas antigas sem escopo de clínica que anulavam as corretas
--
-- Mesmo defeito da migration 20260729120000, encontrado em mais quatro tabelas
-- ao varrer o banco atrás do padrão.
--
-- Políticas PERMISSIVE no Postgres se somam com OU. Quando uma tabela tem a
-- política nova, escopada por clínica, convivendo com uma antiga que só checa
-- "tem algum papel", a antiga vence sempre e a nova vira decoração.
--
-- ── whatsapp_conversations / whatsapp_messages / whatsapp_agent_actions ─────
-- Cada uma tinha o conjunto correto (select/insert/update/delete escopados) e,
-- por cima, uma política FOR ALL chamada "Usuários autenticados podem ver ...",
-- com USING has_any_role(auth.uid()) e WITH CHECK nulo.
--
-- Efeito: qualquer usuário com papel em qualquer clínica lia as conversas de
-- WhatsApp de TODAS as clínicas — nome, telefone e teor das mensagens dos
-- pacientes. E, por ser FOR ALL sem WITH CHECK, também podia gravar em
-- qualquer clínica. É o vazamento mais sério dos encontrados nesta varredura.
--
-- As tabelas estão vazias hoje, então nada foi exposto de fato.
--
-- ── notification_templates ─────────────────────────────────────────────────
-- "Admins podem gerenciar templates" (FOR ALL, is_admin sem escopo) permitia
-- que o admin de uma clínica editasse os templates de outra.
--
-- Cuidado necessário: os 7 templates existentes têm clinica_id NULL — são os
-- padrões compartilhados. is_same_clinica(NULL) devolve false, então a política
-- escopada sozinha os tornaria invisíveis e a fila de notificação pararia. Por
-- isso a leitura aceita explicitamente o template global; a escrita, não —
-- editar um padrão global mudaria o texto para todas as clínicas.
--
-- ── tv_panel_media ─────────────────────────────────────────────────────────
-- Duas falhas: "Permitir leitura pública das mídias ativas" (USING ativo = true,
-- concedida ao papel `public`, ou seja, sem login) e o conjunto de admin sem
-- escopo de clínica. A rota /painel-tv exige sessão (SupabaseProtectedRoute),
-- então a leitura anônima nunca foi necessária. Tabela vazia hoje.
-- ============================================================================

BEGIN;

-- ─── WhatsApp: basta remover a política frouxa ──────────────────────────────
-- O conjunto escopado (…_select_scoped, _insert_scoped, _update_scoped,
-- _delete_scoped) já cobre todas as operações.
DROP POLICY IF EXISTS "Usuários autenticados podem ver conversas" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "Usuários autenticados podem ver mensagens" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Usuários autenticados podem ver ações"     ON public.whatsapp_agent_actions;

-- ─── notification_templates ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins podem gerenciar templates"   ON public.notification_templates;
DROP POLICY IF EXISTS notification_templates_select_staff  ON public.notification_templates;

-- Leitura: templates da própria clínica e os padrões globais (clinica_id NULL)
CREATE POLICY notification_templates_select_staff
ON public.notification_templates FOR SELECT TO authenticated
USING (
  public.has_any_role(auth.uid())
  AND (clinica_id IS NULL OR public.is_same_clinica(clinica_id))
);

-- Escrita: só admin, só na própria clínica. Os padrões globais ficam de fora
-- de propósito — editá-los mudaria o texto para todas as clínicas.
CREATE POLICY notification_templates_insert_admin
ON public.notification_templates FOR INSERT TO authenticated
WITH CHECK (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());

CREATE POLICY notification_templates_update_admin
ON public.notification_templates FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()) AND public.is_same_clinica(clinica_id))
WITH CHECK (public.is_admin(auth.uid()) AND public.is_same_clinica(clinica_id));

CREATE POLICY notification_templates_delete_admin
ON public.notification_templates FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()) AND public.is_same_clinica(clinica_id));

-- ─── tv_panel_media ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Permitir leitura pública das mídias ativas" ON public.tv_panel_media;
DROP POLICY IF EXISTS "Admins podem ver todas as mídias"           ON public.tv_panel_media;
DROP POLICY IF EXISTS "Admins podem inserir mídias"                ON public.tv_panel_media;
DROP POLICY IF EXISTS "Admins podem atualizar mídias"              ON public.tv_panel_media;
DROP POLICY IF EXISTS "Admins podem deletar mídias"                ON public.tv_panel_media;

CREATE POLICY tv_panel_media_select_staff
ON public.tv_panel_media FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid()) AND public.is_same_clinica(clinica_id));

CREATE POLICY tv_panel_media_insert_admin
ON public.tv_panel_media FOR INSERT TO authenticated
WITH CHECK (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());

CREATE POLICY tv_panel_media_update_admin
ON public.tv_panel_media FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()) AND public.is_same_clinica(clinica_id))
WITH CHECK (public.is_admin(auth.uid()) AND public.is_same_clinica(clinica_id));

CREATE POLICY tv_panel_media_delete_admin
ON public.tv_panel_media FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()) AND public.is_same_clinica(clinica_id));

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
-- -- Nenhuma política de SELECT/ALL deve mencionar has_any_role ou is_admin sem
-- -- acompanhar de is_same_clinica / get_my_clinica_id:
-- SELECT tablename, policyname, cmd, qual
--   FROM pg_policies
--  WHERE schemaname='public' AND cmd IN ('SELECT','ALL') AND permissive='PERMISSIVE'
--    AND qual IS NOT NULL
--    AND qual NOT LIKE '%is_same_clinica%'
--    AND qual NOT LIKE '%get_my_clinica_id%'
--    AND qual NOT LIKE '%user_in_same_clinica%'
--  ORDER BY tablename;
--
-- Nem toda linha desse resultado é problema: catálogos públicos (cid10) e
-- tabelas cujo escopo vem por junção (medico_disponibilidade) aparecem sem
-- falar de clínica diretamente. Confira uma a uma.
