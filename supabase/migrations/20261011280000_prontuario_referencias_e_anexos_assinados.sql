BEGIN;

CREATE OR REPLACE FUNCTION public.validar_referencias_prontuario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_paciente_da_clinica(NEW.paciente_id, NEW.clinica_id) THEN
    RAISE EXCEPTION 'Paciente e prontuario precisam pertencer a mesma clinica.' USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.medico_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.medicos m
     WHERE m.id = NEW.medico_id AND m.clinica_id = NEW.clinica_id
  ) THEN
    RAISE EXCEPTION 'Profissional e prontuario precisam pertencer a mesma clinica.' USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.agendamento_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.agendamentos a
     WHERE a.id = NEW.agendamento_id
       AND a.clinica_id = NEW.clinica_id
       AND a.paciente_id = NEW.paciente_id
       AND a.medico_id = NEW.medico_id
  ) THEN
    RAISE EXCEPTION 'Agendamento, paciente, profissional e prontuario precisam corresponder.' USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prontuario_validar_referencias ON public.prontuarios;
CREATE TRIGGER trg_prontuario_validar_referencias
BEFORE INSERT OR UPDATE OF paciente_id, medico_id, agendamento_id, clinica_id
ON public.prontuarios FOR EACH ROW
EXECUTE FUNCTION public.validar_referencias_prontuario();

-- Evita dois registros principais concorrentes para o mesmo atendimento.
CREATE OR REPLACE FUNCTION public.impedir_prontuario_duplicado_por_agendamento()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.agendamento_id IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(NEW.agendamento_id::text));
  IF EXISTS (
    SELECT 1 FROM public.prontuarios p
     WHERE p.agendamento_id = NEW.agendamento_id
       AND p.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'Ja existe um prontuario para este atendimento.' USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_prontuario_unico_por_agendamento ON public.prontuarios;
CREATE TRIGGER trg_prontuario_unico_por_agendamento
BEFORE INSERT OR UPDATE OF agendamento_id ON public.prontuarios
FOR EACH ROW EXECUTE FUNCTION public.impedir_prontuario_duplicado_por_agendamento();

CREATE OR REPLACE FUNCTION public.storage_med_attach_delete_allowed(_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parts text[];
  v_prontuario_id uuid;
BEGIN
  IF _name IS NULL THEN RETURN false; END IF;
  parts := string_to_array(_name, '/');
  -- Exames usam o prefixo exames/<paciente_id>/..., fora da regra de prontuario.
  IF array_length(parts, 1) >= 3 AND parts[1] = 'exames' THEN RETURN true; END IF;
  -- Permite remover uploads temporarios de receita que falharam antes do INSERT,
  -- mas nunca um PDF que ja esteja vinculado a uma prescricao.
  IF array_length(parts, 1) >= 3 AND parts[1] = 'prescricoes' THEN
    BEGIN
      v_prontuario_id := parts[2]::uuid;
    EXCEPTION WHEN others THEN
      RETURN false;
    END;
    RETURN EXISTS (
      SELECT 1 FROM public.pacientes p
       WHERE p.id = v_prontuario_id AND p.clinica_id = public.get_my_clinica_id()
    ) AND NOT EXISTS (
      SELECT 1 FROM public.prescricoes pr
       WHERE pr.paciente_id = v_prontuario_id AND pr.arquivo_pdf = _name
    );
  END IF;
  BEGIN
    v_prontuario_id := parts[1]::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  RETURN EXISTS (
    SELECT 1 FROM public.prontuarios p
     WHERE p.id = v_prontuario_id AND p.clinica_id = public.get_my_clinica_id()
       AND p.assinado IS NOT TRUE
  );
END;
$$;
REVOKE ALL ON FUNCTION public.storage_med_attach_delete_allowed(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storage_med_attach_delete_allowed(text) TO authenticated;

DROP POLICY IF EXISTS "med_attach_delete_scoped" ON storage.objects;
CREATE POLICY "med_attach_delete_scoped" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'medical-attachments'
    AND (public.is_admin(auth.uid()) OR public.is_medico(auth.uid()))
    AND public.storage_med_attach_allowed(name)
    AND public.storage_med_attach_delete_allowed(name)
  );

-- Uma leitura de prontuario assinado exige uma autorizacao de auditoria recente
-- gravada pelo servidor antes do SELECT. Duplicatas de acesso no mesmo minuto
-- sao evitadas, mantendo a trilha rastreavel sem inundar a tabela.
CREATE OR REPLACE FUNCTION public.prontuario_leitura_auditada(p_prontuario_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.prontuario_acessos pa
     WHERE pa.prontuario_id = p_prontuario_id
       AND pa.user_id = auth.uid()
       AND pa.acao = 'visualizacao'
       AND pa.created_at >= now() - interval '2 minutes'
  );
$$;
REVOKE ALL ON FUNCTION public.prontuario_leitura_auditada(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prontuario_leitura_auditada(uuid) TO authenticated;

DROP POLICY IF EXISTS prontuarios_select_autorizado ON public.prontuarios;
DROP POLICY IF EXISTS prontuarios_select_com_leitura_auditada ON public.prontuarios;
CREATE POLICY prontuarios_select_com_leitura_auditada ON public.prontuarios
  FOR SELECT TO authenticated
  USING (
    public.is_same_clinica(clinica_id)
    AND (public.is_admin(auth.uid()) OR (
      public.is_medico(auth.uid())
      AND (assinado IS TRUE OR public.is_medico_responsavel_do_prontuario(medico_id))
    ))
    AND (assinado IS NOT TRUE OR public.prontuario_leitura_auditada(id))
  );

CREATE OR REPLACE FUNCTION public.registrar_visualizacao_historico_paciente(p_paciente_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinica_id uuid := public.get_my_clinica_id();
  v_nome text;
  v_crm text;
  v_registrados integer := 0;
BEGIN
  IF auth.uid() IS NULL OR v_clinica_id IS NULL
     OR NOT (public.is_admin(auth.uid()) OR public.is_medico(auth.uid())) THEN
    RAISE EXCEPTION 'Acesso ao historico clinico nao autorizado.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.is_paciente_da_clinica(p_paciente_id, v_clinica_id) THEN
    RAISE EXCEPTION 'Paciente nao encontrado nesta clinica.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT nome, crm INTO v_nome, v_crm FROM public.medicos
   WHERE user_id = auth.uid() AND clinica_id = v_clinica_id AND ativo IS NOT FALSE
   ORDER BY created_at DESC LIMIT 1;

  INSERT INTO public.prontuario_acessos (
    prontuario_id, paciente_id, clinica_id, user_id, user_nome, user_crm, acao, justificativa
  )
  SELECT p.id, p.paciente_id, p.clinica_id, auth.uid(),
         COALESCE(v_nome, auth.jwt() ->> 'email', 'Usuario clinico'), v_crm,
         'visualizacao', 'Leitura autorizada do historico do paciente'
    FROM public.prontuarios p
   WHERE p.paciente_id = p_paciente_id AND p.clinica_id = v_clinica_id
     AND (public.is_admin(auth.uid()) OR p.assinado IS TRUE
       OR public.is_medico_responsavel_do_prontuario(p.medico_id))
     AND NOT EXISTS (
       SELECT 1 FROM public.prontuario_acessos pa
        WHERE pa.prontuario_id = p.id AND pa.user_id = auth.uid()
          AND pa.acao = 'visualizacao' AND pa.created_at >= now() - interval '1 minute'
     );
  GET DIAGNOSTICS v_registrados = ROW_COUNT;
  RETURN v_registrados;
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_visualizacao_historico_paciente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_visualizacao_historico_paciente(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.registrar_visualizacao_historico_medico(p_medico_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinica_id uuid := public.get_my_clinica_id();
  v_nome text;
  v_crm text;
  v_registrados integer := 0;
BEGIN
  IF auth.uid() IS NULL OR v_clinica_id IS NULL
     OR NOT (public.is_admin(auth.uid()) OR public.is_medico_responsavel_do_prontuario(p_medico_id)) THEN
    RAISE EXCEPTION 'Acesso ao historico medico nao autorizado.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT nome, crm INTO v_nome, v_crm FROM public.medicos
   WHERE user_id = auth.uid() AND clinica_id = v_clinica_id AND ativo IS NOT FALSE
   ORDER BY created_at DESC LIMIT 1;
  INSERT INTO public.prontuario_acessos (
    prontuario_id, paciente_id, clinica_id, user_id, user_nome, user_crm, acao, justificativa
  )
  SELECT p.id, p.paciente_id, p.clinica_id, auth.uid(),
         COALESCE(v_nome, auth.jwt() ->> 'email', 'Usuario clinico'), v_crm,
         'visualizacao', 'Leitura autorizada do historico do profissional'
    FROM public.prontuarios p
   WHERE p.medico_id = p_medico_id AND p.clinica_id = v_clinica_id
     AND (public.is_admin(auth.uid()) OR p.assinado IS TRUE
       OR public.is_medico_responsavel_do_prontuario(p.medico_id))
     AND NOT EXISTS (
       SELECT 1 FROM public.prontuario_acessos pa
        WHERE pa.prontuario_id = p.id AND pa.user_id = auth.uid()
          AND pa.acao = 'visualizacao' AND pa.created_at >= now() - interval '1 minute'
     );
  GET DIAGNOSTICS v_registrados = ROW_COUNT;
  RETURN v_registrados;
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_visualizacao_historico_medico(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_visualizacao_historico_medico(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.registrar_visualizacao_historico_clinica()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinica_id uuid := public.get_my_clinica_id();
  v_nome text;
  v_crm text;
  v_registrados integer := 0;
BEGIN
  IF auth.uid() IS NULL OR v_clinica_id IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Relatorios clinicos sao restritos a administracao da clinica.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT nome, crm INTO v_nome, v_crm FROM public.medicos
   WHERE user_id = auth.uid() AND clinica_id = v_clinica_id AND ativo IS NOT FALSE
   ORDER BY created_at DESC LIMIT 1;
  INSERT INTO public.prontuario_acessos (
    prontuario_id, paciente_id, clinica_id, user_id, user_nome, user_crm, acao, justificativa
  )
  SELECT p.id, p.paciente_id, p.clinica_id, auth.uid(),
         COALESCE(v_nome, auth.jwt() ->> 'email', 'Administrador'), v_crm,
         'visualizacao', 'Relatorio clinico da clinica'
    FROM public.prontuarios p
   WHERE p.clinica_id = v_clinica_id AND p.assinado IS TRUE
     AND NOT EXISTS (
       SELECT 1 FROM public.prontuario_acessos pa
        WHERE pa.prontuario_id = p.id AND pa.user_id = auth.uid()
          AND pa.acao = 'visualizacao' AND pa.created_at >= now() - interval '1 minute'
     );
  GET DIAGNOSTICS v_registrados = ROW_COUNT;
  RETURN v_registrados;
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_visualizacao_historico_clinica() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_visualizacao_historico_clinica() TO authenticated;

COMMIT;
