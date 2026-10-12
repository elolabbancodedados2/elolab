BEGIN;

CREATE OR REPLACE FUNCTION public.proteger_dependencia_prontuario_assinado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_prontuario_id uuid;
  v_assinado boolean;
  v_pai record;
  v_pais_travados integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_prontuario_id := OLD.prontuario_id;
  ELSE
    v_prontuario_id := NEW.prontuario_id;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.prontuario_id IS DISTINCT FROM NEW.prontuario_id THEN
    v_pais_travados := 0;
    v_assinado := false;
    FOR v_pai IN
      SELECT id, assinado
        FROM public.prontuarios
       WHERE id IN (OLD.prontuario_id, NEW.prontuario_id)
       ORDER BY id
       FOR UPDATE
    LOOP
      v_pais_travados := v_pais_travados + 1;
      IF v_pai.assinado IS TRUE THEN v_assinado := true; END IF;
    END LOOP;
    IF v_pais_travados <> (CASE WHEN OLD.prontuario_id IS NULL OR NEW.prontuario_id IS NULL THEN 1 ELSE 2 END) THEN
      RAISE EXCEPTION 'Encounter dependency parent was not found.' USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_assinado IS TRUE THEN
      RAISE EXCEPTION 'Anexos de prontuário assinado não podem ser alterados. Registre um novo documento.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF v_prontuario_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT assinado INTO v_assinado
    FROM public.prontuarios WHERE id = v_prontuario_id FOR UPDATE;

  -- Durante exclusão em cascata de um prontuário (possível apenas em rascunho),
  -- o pai pode já não estar visível ao trigger do filho.
  IF NOT FOUND AND TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prontuário relacionado não encontrado.' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_assinado IS TRUE THEN
    RAISE EXCEPTION 'Dependências de prontuário assinado são imutáveis. Registre a alteração como adendo.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prontuario_prescricao_imutavel ON public.prescricoes;
CREATE TRIGGER trg_prontuario_prescricao_imutavel
  BEFORE INSERT OR UPDATE OR DELETE ON public.prescricoes
  FOR EACH ROW EXECUTE FUNCTION public.proteger_dependencia_prontuario_assinado();

DROP TRIGGER IF EXISTS trg_prontuario_anexo_imutavel ON public.anexos_prontuario;
CREATE TRIGGER trg_prontuario_anexo_imutavel
  BEFORE INSERT OR UPDATE OR DELETE ON public.anexos_prontuario
  FOR EACH ROW EXECUTE FUNCTION public.proteger_dependencia_prontuario_assinado();

-- A assinatura e a substituição de receitas travam primeiro o mesmo prontuário.
-- Isso serializa a checagem do estado assinado com qualquer escrita dependente.
CREATE OR REPLACE FUNCTION public.substituir_prescricoes_do_prontuario(
  p_prontuario_id uuid,
  p_prescricoes jsonb DEFAULT '[]'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paciente_id uuid;
  v_medico_id uuid;
  v_clinica_id uuid;
  v_assinado boolean;
  v_inseridas integer := 0;
BEGIN
  IF p_prontuario_id IS NULL THEN RAISE EXCEPTION 'prontuario_id é obrigatório'; END IF;
  IF auth.uid() IS NULL OR NOT (public.is_admin(auth.uid()) OR public.is_medico(auth.uid())) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(p_prescricoes) <> 'array' THEN RAISE EXCEPTION 'p_prescricoes precisa ser um array JSON'; END IF;

  SELECT paciente_id, medico_id, clinica_id, COALESCE(assinado, false)
    INTO v_paciente_id, v_medico_id, v_clinica_id, v_assinado
    FROM public.prontuarios WHERE id = p_prontuario_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prontuário não encontrado ou fora da sua clínica' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_clinica_id IS DISTINCT FROM public.get_my_clinica_id()
     OR (public.is_medico(auth.uid()) AND NOT public.is_admin(auth.uid())
       AND NOT public.is_medico_responsavel_do_prontuario(v_medico_id)) THEN
    RAISE EXCEPTION 'Encounter outside your access' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_assinado THEN
    RAISE EXCEPTION 'Prontuário assinado é imutável. Use adendos para retificar.' USING ERRCODE = 'raise_exception';
  END IF;

  DELETE FROM public.prescricoes WHERE prontuario_id = p_prontuario_id;
  IF EXISTS (SELECT 1 FROM public.prescricoes WHERE prontuario_id = p_prontuario_id) THEN
    RAISE EXCEPTION 'Não foi possível remover prescrições anteriores. Nada foi alterado.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.prescricoes (
    paciente_id, medico_id, prontuario_id, clinica_id, medicamento, dosagem,
    posologia, duracao, quantidade, observacoes, data_emissao, tipo
  )
  SELECT v_paciente_id, v_medico_id, p_prontuario_id, v_clinica_id,
    NULLIF(item->>'medicamento', ''), NULLIF(item->>'dosagem', ''),
    NULLIF(item->>'posologia', ''), NULLIF(item->>'duracao', ''),
    NULLIF(item->>'quantidade', ''), NULLIF(item->>'observacoes', ''),
    COALESCE(NULLIF(item->>'data_emissao', '')::date, CURRENT_DATE),
    COALESCE(NULLIF(item->>'tipo', ''), 'simples')
  FROM jsonb_array_elements(p_prescricoes) AS item
  WHERE NULLIF(item->>'medicamento', '') IS NOT NULL;
  GET DIAGNOSTICS v_inseridas = ROW_COUNT;
  RETURN v_inseridas;
END;
$$;

REVOKE ALL ON FUNCTION public.substituir_prescricoes_do_prontuario(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.substituir_prescricoes_do_prontuario(uuid, jsonb) TO authenticated;

-- Linked prescriptions are written only through the parent-first RPC above.
DROP POLICY IF EXISTS prescricoes_insert ON public.prescricoes;
DROP POLICY IF EXISTS prescricoes_insert_scoped ON public.prescricoes;
DROP POLICY IF EXISTS prescricoes_update ON public.prescricoes;
DROP POLICY IF EXISTS prescricoes_update_scoped ON public.prescricoes;
DROP POLICY IF EXISTS prescricoes_delete ON public.prescricoes;
DROP POLICY IF EXISTS prescricoes_delete_scoped ON public.prescricoes;
CREATE POLICY prescricoes_insert_independentes ON public.prescricoes FOR INSERT TO authenticated
  WITH CHECK ((public.is_admin(auth.uid()) OR public.is_medico(auth.uid()))
    AND clinica_id = public.get_my_clinica_id() AND prontuario_id IS NULL);
CREATE POLICY prescricoes_update_independentes ON public.prescricoes FOR UPDATE TO authenticated
  USING ((public.is_admin(auth.uid()) OR public.is_medico(auth.uid()))
    AND clinica_id = public.get_my_clinica_id() AND prontuario_id IS NULL)
  WITH CHECK ((public.is_admin(auth.uid()) OR public.is_medico(auth.uid()))
    AND clinica_id = public.get_my_clinica_id() AND prontuario_id IS NULL);
CREATE POLICY prescricoes_delete_independentes ON public.prescricoes FOR DELETE TO authenticated
  USING ((public.is_admin(auth.uid()) OR public.is_medico(auth.uid()))
    AND clinica_id = public.get_my_clinica_id() AND prontuario_id IS NULL);

CREATE OR REPLACE FUNCTION public.fn_sanitizar_auditoria_prontuario()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.collection IN ('prontuarios', 'prescricoes', 'anexos_prontuario', 'atestados', 'encaminhamentos') THEN
    NEW.record_name := NULL;
    NEW.changes := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sanitizar_auditoria_prontuario ON public.audit_log;
CREATE TRIGGER trg_sanitizar_auditoria_prontuario
  BEFORE INSERT OR UPDATE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.fn_sanitizar_auditoria_prontuario();

UPDATE public.audit_log
   SET record_name = NULL, changes = NULL
 WHERE collection IN ('prontuarios', 'prescricoes', 'anexos_prontuario', 'atestados', 'encaminhamentos')
   AND (record_name IS NOT NULL OR changes IS NOT NULL);

CREATE OR REPLACE FUNCTION public.registrar_visualizacao_historico_prontuarios(p_prontuario_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_solicitados integer;
  v_autorizados integer;
  v_user_nome text;
  v_user_crm text;
  v_registrados integer;
  v_bloqueados integer;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_admin(auth.uid()) OR public.is_medico(auth.uid())) THEN
    RAISE EXCEPTION 'Acesso clínico não autorizado';
  END IF;
  SELECT COALESCE(array_agg(DISTINCT item_id), ARRAY[]::uuid[]) INTO v_ids
    FROM unnest(COALESCE(p_prontuario_ids, ARRAY[]::uuid[])) AS requested(item_id);
  v_solicitados := cardinality(v_ids);
  IF v_solicitados = 0 THEN RETURN 0; END IF;
  IF v_solicitados > 500 THEN RAISE EXCEPTION 'Lote de auditoria excede 500 registros'; END IF;

  SELECT count(*) INTO v_autorizados
    FROM public.prontuarios p
   WHERE p.id = ANY(v_ids)
     AND public.is_same_clinica(p.clinica_id)
     AND (public.is_admin(auth.uid()) OR (
       public.is_medico(auth.uid())
       AND (p.assinado IS TRUE OR public.is_medico_responsavel_do_prontuario(p.medico_id))
     ));
  IF v_autorizados <> v_solicitados THEN
    RAISE EXCEPTION 'Um ou mais prontuários não foram encontrados ou estão fora do seu acesso';
  END IF;

  SELECT m.nome, m.crm INTO v_user_nome, v_user_crm
    FROM public.medicos m
   WHERE m.user_id = auth.uid() AND m.clinica_id = public.get_my_clinica_id() AND m.ativo IS NOT FALSE
   ORDER BY m.created_at DESC LIMIT 1;
  IF v_user_nome IS NULL THEN
    SELECT p.nome INTO v_user_nome FROM public.profiles p WHERE p.id = auth.uid();
  END IF;

  PERFORM p.id
    FROM public.prontuarios p
   WHERE p.id = ANY(v_ids)
     AND public.is_same_clinica(p.clinica_id)
     AND (public.is_admin(auth.uid()) OR (
       public.is_medico(auth.uid())
       AND (p.assinado IS TRUE OR public.is_medico_responsavel_do_prontuario(p.medico_id))
     ))
   ORDER BY p.id
   FOR UPDATE;
  GET DIAGNOSTICS v_bloqueados = ROW_COUNT;
  IF v_bloqueados <> v_solicitados THEN
    RAISE EXCEPTION 'Requested history is incomplete or outside access';
  END IF;

  INSERT INTO public.prontuario_acessos (
    prontuario_id, paciente_id, clinica_id, user_id, user_nome, user_crm, acao, justificativa
  )
  SELECT p.id, p.paciente_id, p.clinica_id, auth.uid(),
    COALESCE(v_user_nome, auth.jwt() ->> 'email', 'Usuário clínico'), v_user_crm,
    'visualizacao', 'Consulta na lista do histórico clínico'
  FROM public.prontuarios p
  WHERE p.id = ANY(v_ids)
    AND public.is_same_clinica(p.clinica_id)
    AND (public.is_admin(auth.uid()) OR (
      public.is_medico(auth.uid())
      AND (p.assinado IS TRUE OR public.is_medico_responsavel_do_prontuario(p.medico_id))
    ));
  GET DIAGNOSTICS v_registrados = ROW_COUNT;
  IF v_registrados <> v_solicitados THEN
    RAISE EXCEPTION 'History audit was incomplete';
  END IF;
  RETURN v_registrados;
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_visualizacao_historico_prontuarios(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_visualizacao_historico_prontuarios(uuid[]) TO authenticated;

COMMIT;
