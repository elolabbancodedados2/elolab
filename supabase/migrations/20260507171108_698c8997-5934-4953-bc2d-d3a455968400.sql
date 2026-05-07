-- Permitir que recepção/admin apaguem registros operacionais (antes só admin)
-- e garantir que DELETE bloqueado por RLS retorne erro perceptível via .select()

DROP POLICY IF EXISTS exames_delete ON public.exames;
CREATE POLICY exames_delete ON public.exames
  FOR DELETE TO authenticated
  USING (can_manage_data(auth.uid()) AND is_same_clinica(clinica_id));

DROP POLICY IF EXISTS agendamentos_delete ON public.agendamentos;
CREATE POLICY agendamentos_delete ON public.agendamentos
  FOR DELETE TO authenticated
  USING (can_manage_data(auth.uid()) AND is_same_clinica(clinica_id));

DROP POLICY IF EXISTS lancamentos_delete ON public.lancamentos;
CREATE POLICY lancamentos_delete ON public.lancamentos
  FOR DELETE TO authenticated
  USING (can_access_financial(auth.uid()) AND is_same_clinica(clinica_id));

DROP POLICY IF EXISTS fila_atendimento_delete ON public.fila_atendimento;
CREATE POLICY fila_atendimento_delete ON public.fila_atendimento
  FOR DELETE TO authenticated
  USING (can_manage_data(auth.uid()) AND is_same_clinica(clinica_id));

DROP POLICY IF EXISTS tarefas_delete ON public.tarefas;
CREATE POLICY tarefas_delete ON public.tarefas
  FOR DELETE TO authenticated
  USING (has_any_role(auth.uid()) AND is_same_clinica(clinica_id));