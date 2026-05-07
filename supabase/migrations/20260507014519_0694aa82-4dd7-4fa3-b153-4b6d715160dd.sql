
CREATE INDEX IF NOT EXISTS idx_agendamentos_medico_id ON public.agendamentos(medico_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_created_at ON public.agendamentos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_atestados_medico_id ON public.atestados(medico_id);
CREATE INDEX IF NOT EXISTS idx_anexos_clinica_id ON public.anexos_prontuario(clinica_id);
CREATE INDEX IF NOT EXISTS idx_caixa_clinica_data ON public.caixa_diario(clinica_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conv_clinica ON public.chat_conversations(clinica_id);
CREATE INDEX IF NOT EXISTS idx_consentimentos_clinica ON public.consentimentos_lgpd(clinica_id);
CREATE INDEX IF NOT EXISTS idx_employee_inv_clinica ON public.employee_invitations(clinica_id);
CREATE INDEX IF NOT EXISTS idx_employee_inv_status ON public.employee_invitations(status);
CREATE INDEX IF NOT EXISTS idx_feedbacks_medico ON public.feedbacks_nps(medico_id);
CREATE INDEX IF NOT EXISTS idx_feedbacks_agendamento ON public.feedbacks_nps(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_fila_agendamento ON public.fila_atendimento(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_configuracoes_user ON public.configuracoes_clinica(user_id);
CREATE INDEX IF NOT EXISTS idx_assinaturas_mp_clinica ON public.assinaturas_mercadopago(clinica_id);
CREATE INDEX IF NOT EXISTS idx_assinaturas_mp_status ON public.assinaturas_mercadopago(status);
CREATE INDEX IF NOT EXISTS idx_automation_logs_clinica ON public.automation_logs(clinica_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_status ON public.automation_logs(status);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON public.audit_log(user_id);
