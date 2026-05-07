CREATE OR REPLACE FUNCTION public.fn_fill_clinica_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  my_clinica_id uuid;
BEGIN
  IF NEW.clinica_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.clinica_id INTO my_clinica_id
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF my_clinica_id IS NULL AND to_jsonb(NEW) ? 'paciente_id' AND (NEW.paciente_id IS NOT NULL) THEN
    SELECT p.clinica_id INTO my_clinica_id
    FROM public.pacientes p
    WHERE p.id = NEW.paciente_id;
  END IF;

  IF my_clinica_id IS NULL AND to_jsonb(NEW) ? 'medico_id' AND (NEW.medico_id IS NOT NULL) THEN
    SELECT m.clinica_id INTO my_clinica_id
    FROM public.medicos m
    WHERE m.id = NEW.medico_id;
  END IF;

  IF my_clinica_id IS NULL AND to_jsonb(NEW) ? 'medico_solicitante_id' AND (NEW.medico_solicitante_id IS NOT NULL) THEN
    SELECT m.clinica_id INTO my_clinica_id
    FROM public.medicos m
    WHERE m.id = NEW.medico_solicitante_id;
  END IF;

  IF my_clinica_id IS NULL AND to_jsonb(NEW) ? 'agendamento_id' AND (NEW.agendamento_id IS NOT NULL) THEN
    SELECT a.clinica_id INTO my_clinica_id
    FROM public.agendamentos a
    WHERE a.id = NEW.agendamento_id;
  END IF;

  IF my_clinica_id IS NULL AND to_jsonb(NEW) ? 'exame_id' AND (NEW.exame_id IS NOT NULL) THEN
    SELECT e.clinica_id INTO my_clinica_id
    FROM public.exames e
    WHERE e.id = NEW.exame_id;
  END IF;

  IF my_clinica_id IS NULL AND to_jsonb(NEW) ? 'user_id' AND (NEW.user_id IS NOT NULL) THEN
    SELECT p.clinica_id INTO my_clinica_id
    FROM public.profiles p
    WHERE p.id = NEW.user_id;
  END IF;

  IF my_clinica_id IS NOT NULL THEN
    NEW.clinica_id := my_clinica_id;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agendamentos','anexos_prontuario','atestados','audit_log','automation_logs','automation_settings',
    'bloqueios_agenda','chat_conversations','chat_messages','coletas_laboratorio','configuracoes_clinica',
    'consentimentos_lgpd','convenios','employee_invitations','encaminhamentos','estoque','exames',
    'fila_atendimento','funcionarios','lancamentos','lista_espera','medicos','movimentacoes_estoque',
    'notification_queue','notification_templates','paciente_portal_tokens','pacientes','pagamentos_mercadopago',
    'precos_consulta_convenio','precos_exames_convenio','prescricoes','prontuarios','protocolos_clinicos',
    'resultados_laboratorio','retornos','salas','tarefas','templates_atestado','templates_prescricao',
    'tipo_exames_catalog','tipos_consulta','tipos_exame_custom','triagens','tv_panel_media',
    'whatsapp_agent_actions','whatsapp_agents','whatsapp_conversations','whatsapp_messages','whatsapp_sessions'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'clinica_id'
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_fill_clinica_id ON public.%I', t);
      EXECUTE format('CREATE TRIGGER trg_fill_clinica_id BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_fill_clinica_id()', t);
    END IF;
  END LOOP;
END $$;

UPDATE public.exames e
SET clinica_id = (
  SELECT COALESCE(p.clinica_id, m.clinica_id)
  FROM public.pacientes p
  LEFT JOIN public.medicos m ON m.id = e.medico_solicitante_id
  WHERE p.id = e.paciente_id
  LIMIT 1
)
WHERE e.clinica_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.pacientes p
    LEFT JOIN public.medicos m ON m.id = e.medico_solicitante_id
    WHERE p.id = e.paciente_id AND COALESCE(p.clinica_id, m.clinica_id) IS NOT NULL
  );

UPDATE public.coletas_laboratorio c
SET clinica_id = (
  SELECT COALESCE(e.clinica_id, p.clinica_id, m.clinica_id)
  FROM public.pacientes p
  LEFT JOIN public.exames e ON e.id = c.exame_id
  LEFT JOIN public.medicos m ON m.id = c.medico_solicitante_id
  WHERE p.id = c.paciente_id
  LIMIT 1
)
WHERE c.clinica_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.pacientes p
    LEFT JOIN public.exames e ON e.id = c.exame_id
    LEFT JOIN public.medicos m ON m.id = c.medico_solicitante_id
    WHERE p.id = c.paciente_id AND COALESCE(e.clinica_id, p.clinica_id, m.clinica_id) IS NOT NULL
  );

UPDATE public.prontuarios pr
SET clinica_id = (
  SELECT COALESCE(p.clinica_id, m.clinica_id)
  FROM public.pacientes p
  LEFT JOIN public.medicos m ON m.id = pr.medico_id
  WHERE p.id = pr.paciente_id
  LIMIT 1
)
WHERE pr.clinica_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.pacientes p
    LEFT JOIN public.medicos m ON m.id = pr.medico_id
    WHERE p.id = pr.paciente_id AND COALESCE(p.clinica_id, m.clinica_id) IS NOT NULL
  );

UPDATE public.fila_atendimento f
SET clinica_id = (
  SELECT a.clinica_id FROM public.agendamentos a WHERE a.id = f.agendamento_id LIMIT 1
)
WHERE f.clinica_id IS NULL
  AND EXISTS (SELECT 1 FROM public.agendamentos a WHERE a.id = f.agendamento_id AND a.clinica_id IS NOT NULL);

UPDATE public.medicos m
SET clinica_id = (
  SELECT p.clinica_id FROM public.profiles p WHERE p.id = m.user_id LIMIT 1
)
WHERE m.clinica_id IS NULL
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = m.user_id AND p.clinica_id IS NOT NULL);

UPDATE public.funcionarios f
SET clinica_id = (
  SELECT p.clinica_id FROM public.profiles p WHERE p.id = f.user_id LIMIT 1
)
WHERE f.clinica_id IS NULL
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = f.user_id AND p.clinica_id IS NOT NULL);

DROP POLICY IF EXISTS "Clinica acessa caixa_diario" ON public.caixa_diario;
DROP POLICY IF EXISTS "caixa_diario_select_scoped" ON public.caixa_diario;
DROP POLICY IF EXISTS "caixa_diario_insert_scoped" ON public.caixa_diario;
DROP POLICY IF EXISTS "caixa_diario_update_scoped" ON public.caixa_diario;
DROP POLICY IF EXISTS "caixa_diario_delete_scoped" ON public.caixa_diario;
CREATE POLICY "caixa_diario_select_scoped" ON public.caixa_diario FOR SELECT TO authenticated USING (has_any_role(auth.uid()) AND is_same_clinica(clinica_id));
CREATE POLICY "caixa_diario_insert_scoped" ON public.caixa_diario FOR INSERT TO authenticated WITH CHECK ((can_access_financial(auth.uid()) OR is_recepcao(auth.uid()) OR is_admin(auth.uid())) AND clinica_id = get_my_clinica_id());
CREATE POLICY "caixa_diario_update_scoped" ON public.caixa_diario FOR UPDATE TO authenticated USING ((can_access_financial(auth.uid()) OR is_recepcao(auth.uid()) OR is_admin(auth.uid())) AND is_same_clinica(clinica_id)) WITH CHECK ((can_access_financial(auth.uid()) OR is_recepcao(auth.uid()) OR is_admin(auth.uid())) AND clinica_id = get_my_clinica_id());
CREATE POLICY "caixa_diario_delete_scoped" ON public.caixa_diario FOR DELETE TO authenticated USING (is_admin(auth.uid()) AND is_same_clinica(clinica_id));

DROP POLICY IF EXISTS "Clinica acessa seus laboratorios" ON public.laboratorios;
DROP POLICY IF EXISTS "laboratorios_select_scoped" ON public.laboratorios;
DROP POLICY IF EXISTS "laboratorios_insert_scoped" ON public.laboratorios;
DROP POLICY IF EXISTS "laboratorios_update_scoped" ON public.laboratorios;
DROP POLICY IF EXISTS "laboratorios_delete_scoped" ON public.laboratorios;
CREATE POLICY "laboratorios_select_scoped" ON public.laboratorios FOR SELECT TO authenticated USING (has_any_role(auth.uid()) AND is_same_clinica(clinica_id));
CREATE POLICY "laboratorios_insert_scoped" ON public.laboratorios FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()) AND clinica_id = get_my_clinica_id());
CREATE POLICY "laboratorios_update_scoped" ON public.laboratorios FOR UPDATE TO authenticated USING (is_admin(auth.uid()) AND is_same_clinica(clinica_id)) WITH CHECK (is_admin(auth.uid()) AND clinica_id = get_my_clinica_id());
CREATE POLICY "laboratorios_delete_scoped" ON public.laboratorios FOR DELETE TO authenticated USING (is_admin(auth.uid()) AND is_same_clinica(clinica_id));

DROP POLICY IF EXISTS "Clinica acessa seu catalogo" ON public.tipo_exames_catalog;
DROP POLICY IF EXISTS "tipo_exames_catalog_select_scoped" ON public.tipo_exames_catalog;
DROP POLICY IF EXISTS "tipo_exames_catalog_insert_scoped" ON public.tipo_exames_catalog;
DROP POLICY IF EXISTS "tipo_exames_catalog_update_scoped" ON public.tipo_exames_catalog;
DROP POLICY IF EXISTS "tipo_exames_catalog_delete_scoped" ON public.tipo_exames_catalog;
CREATE POLICY "tipo_exames_catalog_select_scoped" ON public.tipo_exames_catalog FOR SELECT TO authenticated USING (has_any_role(auth.uid()) AND is_same_clinica(clinica_id));
CREATE POLICY "tipo_exames_catalog_insert_scoped" ON public.tipo_exames_catalog FOR INSERT TO authenticated WITH CHECK ((is_admin(auth.uid()) OR is_financeiro(auth.uid())) AND clinica_id = get_my_clinica_id());
CREATE POLICY "tipo_exames_catalog_update_scoped" ON public.tipo_exames_catalog FOR UPDATE TO authenticated USING ((is_admin(auth.uid()) OR is_financeiro(auth.uid())) AND is_same_clinica(clinica_id)) WITH CHECK ((is_admin(auth.uid()) OR is_financeiro(auth.uid())) AND clinica_id = get_my_clinica_id());
CREATE POLICY "tipo_exames_catalog_delete_scoped" ON public.tipo_exames_catalog FOR DELETE TO authenticated USING (is_admin(auth.uid()) AND is_same_clinica(clinica_id));

DROP POLICY IF EXISTS "Usuários autenticados podem gerenciar agentes" ON public.whatsapp_agents;
DROP POLICY IF EXISTS "Usuários autenticados podem gerenciar sessões" ON public.whatsapp_sessions;

DROP POLICY IF EXISTS "precos_insert" ON public.precos_exames_convenio;
DROP POLICY IF EXISTS "precos_update" ON public.precos_exames_convenio;
DROP POLICY IF EXISTS "precos_delete" ON public.precos_exames_convenio;
DROP POLICY IF EXISTS "precos_exames_convenio_insert_scoped" ON public.precos_exames_convenio;
DROP POLICY IF EXISTS "precos_exames_convenio_update_scoped" ON public.precos_exames_convenio;
DROP POLICY IF EXISTS "precos_exames_convenio_delete_scoped" ON public.precos_exames_convenio;
CREATE POLICY "precos_exames_convenio_insert_scoped" ON public.precos_exames_convenio FOR INSERT TO authenticated WITH CHECK ((is_admin(auth.uid()) OR is_financeiro(auth.uid())) AND ((clinica_id = get_my_clinica_id()) OR (clinica_id IS NULL)));
CREATE POLICY "precos_exames_convenio_update_scoped" ON public.precos_exames_convenio FOR UPDATE TO authenticated USING ((is_admin(auth.uid()) OR is_financeiro(auth.uid())) AND is_same_clinica(clinica_id)) WITH CHECK ((is_admin(auth.uid()) OR is_financeiro(auth.uid())) AND clinica_id = get_my_clinica_id());
CREATE POLICY "precos_exames_convenio_delete_scoped" ON public.precos_exames_convenio FOR DELETE TO authenticated USING (is_admin(auth.uid()) AND is_same_clinica(clinica_id));