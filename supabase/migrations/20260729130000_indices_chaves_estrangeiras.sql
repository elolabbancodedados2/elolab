-- ============================================================================
-- Índices para as chaves estrangeiras que não tinham nenhum
--
-- O Postgres cria índice sozinho para chave PRIMÁRIA e para UNIQUE, mas não
-- para chave ESTRANGEIRA. Uma varredura do banco encontrou 81 colunas de FK
-- sem índice.
--
-- 24 delas são clinica_id — a coluna que praticamente toda política RLS usa
-- para filtrar. Sem índice, cada consulta dessas tabelas varre a tabela inteira
-- e só depois descarta o que é de outra clínica. Com 64 pacientes ninguém nota;
-- com alguns milhares, a tela inteira fica lenta.
--
-- As demais 57 servem para junções e, principalmente, para remoções: apagar
-- uma linha da tabela pai obriga o Postgres a varrer a tabela filha inteira
-- procurando referências quando não há índice.
--
-- CREATE INDEX comum trava escrita na tabela enquanto roda. As tabelas são
-- pequenas hoje, então é instantâneo. Se um dia precisar refazer isto com o
-- sistema em uso, troque por CREATE INDEX CONCURRENTLY — que não pode rodar
-- dentro de BEGIN/COMMIT, então cada comando teria que ir solto.
-- ============================================================================

BEGIN;

-- ─── Escopo de clínica: o filtro de toda política RLS ───────────────────────
CREATE INDEX IF NOT EXISTS idx_automation_settings_clinica_id ON public.automation_settings (clinica_id);
CREATE INDEX IF NOT EXISTS idx_configuracoes_clinica_clinica_id ON public.configuracoes_clinica (clinica_id);
CREATE INDEX IF NOT EXISTS idx_lista_espera_clinica_id ON public.lista_espera (clinica_id);
CREATE INDEX IF NOT EXISTS idx_notification_templates_clinica_id ON public.notification_templates (clinica_id);
CREATE INDEX IF NOT EXISTS idx_paciente_portal_tokens_clinica_id ON public.paciente_portal_tokens (clinica_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_mercadopago_clinica_id ON public.pagamentos_mercadopago (clinica_id);
CREATE INDEX IF NOT EXISTS idx_platform_impersonation_log_clinica_id ON public.platform_impersonation_log (clinica_id);
CREATE INDEX IF NOT EXISTS idx_precos_consulta_convenio_clinica_id ON public.precos_consulta_convenio (clinica_id);
CREATE INDEX IF NOT EXISTS idx_precos_exames_convenio_clinica_id ON public.precos_exames_convenio (clinica_id);
CREATE INDEX IF NOT EXISTS idx_protocolos_clinicos_clinica_id ON public.protocolos_clinicos (clinica_id);
CREATE INDEX IF NOT EXISTS idx_resultados_laboratorio_clinica_id ON public.resultados_laboratorio (clinica_id);
CREATE INDEX IF NOT EXISTS idx_retornos_clinica_id ON public.retornos (clinica_id);
CREATE INDEX IF NOT EXISTS idx_salas_clinica_id ON public.salas (clinica_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_clinica_id ON public.tarefas (clinica_id);
CREATE INDEX IF NOT EXISTS idx_templates_atestado_clinica_id ON public.templates_atestado (clinica_id);
CREATE INDEX IF NOT EXISTS idx_templates_prescricao_clinica_id ON public.templates_prescricao (clinica_id);
CREATE INDEX IF NOT EXISTS idx_tipos_consulta_clinica_id ON public.tipos_consulta (clinica_id);
CREATE INDEX IF NOT EXISTS idx_tipos_exame_custom_clinica_id ON public.tipos_exame_custom (clinica_id);
CREATE INDEX IF NOT EXISTS idx_tv_panel_media_clinica_id ON public.tv_panel_media (clinica_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_agent_actions_clinica_id ON public.whatsapp_agent_actions (clinica_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_agents_clinica_id ON public.whatsapp_agents (clinica_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_clinica_id ON public.whatsapp_conversations (clinica_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_clinica_id ON public.whatsapp_messages (clinica_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_clinica_id ON public.whatsapp_sessions (clinica_id);

-- ─── Demais chaves estrangeiras ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_agendamentos_sala_id ON public.agendamentos (sala_id);
CREATE INDEX IF NOT EXISTS idx_anexos_prontuario_uploaded_by ON public.anexos_prontuario (uploaded_by);
CREATE INDEX IF NOT EXISTS idx_assinaturas_mercadopago_paciente_id ON public.assinaturas_mercadopago (paciente_id);
CREATE INDEX IF NOT EXISTS idx_assinaturas_plano_mp_assinatura_id ON public.assinaturas_plano (mp_assinatura_id);
CREATE INDEX IF NOT EXISTS idx_assinaturas_plano_plano_id ON public.assinaturas_plano (plano_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_remetente_id ON public.chat_messages (remetente_id);
CREATE INDEX IF NOT EXISTS idx_coletas_laboratorio_coletado_por ON public.coletas_laboratorio (coletado_por);
CREATE INDEX IF NOT EXISTS idx_coletas_laboratorio_convenio_id ON public.coletas_laboratorio (convenio_id);
CREATE INDEX IF NOT EXISTS idx_coletas_laboratorio_exame_id ON public.coletas_laboratorio (exame_id);
CREATE INDEX IF NOT EXISTS idx_coletas_laboratorio_medico_solicitante_id ON public.coletas_laboratorio (medico_solicitante_id);
CREATE INDEX IF NOT EXISTS idx_convites_funcionario_accepted_by ON public.convites_funcionario (accepted_by);
CREATE INDEX IF NOT EXISTS idx_convites_funcionario_invited_by ON public.convites_funcionario (invited_by);
CREATE INDEX IF NOT EXISTS idx_employee_invitations_funcionario_id ON public.employee_invitations (funcionario_id);
CREATE INDEX IF NOT EXISTS idx_encaminhamentos_prontuario_id ON public.encaminhamentos (prontuario_id);
CREATE INDEX IF NOT EXISTS idx_exames_medico_solicitante_id ON public.exames (medico_solicitante_id);
CREATE INDEX IF NOT EXISTS idx_fila_atendimento_sala_id ON public.fila_atendimento (sala_id);
CREATE INDEX IF NOT EXISTS idx_funcionarios_user_id ON public.funcionarios (user_id);
CREATE INDEX IF NOT EXISTS idx_guias_externas_agendamento_id ON public.guias_externas (agendamento_id);
CREATE INDEX IF NOT EXISTS idx_guias_externas_convenio_id ON public.guias_externas (convenio_id);
CREATE INDEX IF NOT EXISTS idx_guias_externas_registrado_por ON public.guias_externas (registrado_por);
CREATE INDEX IF NOT EXISTS idx_lancamentos_agendamento_id ON public.lancamentos (agendamento_id);
CREATE INDEX IF NOT EXISTS idx_lista_espera_medico_id ON public.lista_espera (medico_id);
CREATE INDEX IF NOT EXISTS idx_lista_espera_paciente_id ON public.lista_espera (paciente_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_estoque_usuario_id ON public.movimentacoes_estoque (usuario_id);
CREATE INDEX IF NOT EXISTS idx_notification_queue_template_id ON public.notification_queue (template_id);
CREATE INDEX IF NOT EXISTS idx_paciente_portal_tokens_paciente_id ON public.paciente_portal_tokens (paciente_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_mercadopago_agendamento_id ON public.pagamentos_mercadopago (agendamento_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_mercadopago_lancamento_id ON public.pagamentos_mercadopago (lancamento_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_mercadopago_paciente_id ON public.pagamentos_mercadopago (paciente_id);
CREATE INDEX IF NOT EXISTS idx_platform_admins_created_by ON public.platform_admins (created_by);
CREATE INDEX IF NOT EXISTS idx_platform_admins_impersonating_clinica_id ON public.platform_admins (impersonating_clinica_id);
CREATE INDEX IF NOT EXISTS idx_platform_impersonation_log_platform_admin_id ON public.platform_impersonation_log (platform_admin_id);
CREATE INDEX IF NOT EXISTS idx_portal_guias_tokens_criado_por ON public.portal_guias_tokens (criado_por);
CREATE INDEX IF NOT EXISTS idx_precos_consulta_convenio_convenio_id ON public.precos_consulta_convenio (convenio_id);
CREATE INDEX IF NOT EXISTS idx_prescricoes_medico_id ON public.prescricoes (medico_id);
CREATE INDEX IF NOT EXISTS idx_prescricoes_prontuario_id ON public.prescricoes (prontuario_id);
CREATE INDEX IF NOT EXISTS idx_prontuarios_agendamento_id ON public.prontuarios (agendamento_id);
CREATE INDEX IF NOT EXISTS idx_protocolos_clinicos_criado_por ON public.protocolos_clinicos (criado_por);
CREATE INDEX IF NOT EXISTS idx_registros_pendentes_plano_id ON public.registros_pendentes (plano_id);
CREATE INDEX IF NOT EXISTS idx_resultados_laboratorio_exame_id ON public.resultados_laboratorio (exame_id);
CREATE INDEX IF NOT EXISTS idx_resultados_laboratorio_liberado_por ON public.resultados_laboratorio (liberado_por);
CREATE INDEX IF NOT EXISTS idx_resultados_laboratorio_validado_por ON public.resultados_laboratorio (validado_por);
CREATE INDEX IF NOT EXISTS idx_retornos_agendamento_id ON public.retornos (agendamento_id);
CREATE INDEX IF NOT EXISTS idx_retornos_medico_id ON public.retornos (medico_id);
CREATE INDEX IF NOT EXISTS idx_retornos_paciente_id ON public.retornos (paciente_id);
CREATE INDEX IF NOT EXISTS idx_retornos_prontuario_id ON public.retornos (prontuario_id);
CREATE INDEX IF NOT EXISTS idx_salas_medico_responsavel ON public.salas (medico_responsavel);
CREATE INDEX IF NOT EXISTS idx_tarefas_criado_por ON public.tarefas (criado_por);
CREATE INDEX IF NOT EXISTS idx_templates_atestado_criado_por ON public.templates_atestado (criado_por);
CREATE INDEX IF NOT EXISTS idx_templates_prescricao_criado_por ON public.templates_prescricao (criado_por);
CREATE INDEX IF NOT EXISTS idx_tipo_exames_catalog_laboratorio_id ON public.tipo_exames_catalog (laboratorio_id);
CREATE INDEX IF NOT EXISTS idx_triagens_agendamento_id ON public.triagens (agendamento_id);
CREATE INDEX IF NOT EXISTS idx_triagens_enfermeiro_id ON public.triagens (enfermeiro_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_assigned_by ON public.user_roles (assigned_by);
CREATE INDEX IF NOT EXISTS idx_whatsapp_agent_actions_conversation_id ON public.whatsapp_agent_actions (conversation_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_paciente_id ON public.whatsapp_conversations (paciente_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_agent_id ON public.whatsapp_sessions (agent_id);

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
-- -- Deve voltar zero:
-- SELECT count(*) AS fks_ainda_sem_indice
--   FROM pg_constraint c
--   JOIN pg_namespace n ON n.oid = c.connamespace
--  WHERE c.contype='f' AND n.nspname='public' AND array_length(c.conkey,1)=1
--    AND NOT EXISTS (SELECT 1 FROM pg_index i
--                     WHERE i.indrelid=c.conrelid AND i.indkey[0]=c.conkey[1]);
