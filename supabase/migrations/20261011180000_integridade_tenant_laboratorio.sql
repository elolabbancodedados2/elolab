BEGIN;

-- Keep tenant references stable while legacy rows are checked and guards installed.
LOCK TABLE public.pedidos_laboratorio, public.exames, public.coletas_laboratorio,
  public.resultados_laboratorio, public.pacientes, public.medicos, public.convenios,
  public.tipo_exames_catalog, public.laboratorio_setores
  IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  v_invalidos bigint;
BEGIN
  SELECT count(*) INTO v_invalidos FROM (
    SELECT p.id
      FROM public.pedidos_laboratorio p
      LEFT JOIN public.pacientes pa ON pa.id = p.paciente_id
      LEFT JOIN public.medicos m ON m.id = p.medico_solicitante_id
      LEFT JOIN public.convenios c ON c.id = p.convenio_id
     WHERE p.clinica_id IS NULL OR pa.id IS NULL OR pa.clinica_id IS DISTINCT FROM p.clinica_id
        OR (p.medico_solicitante_id IS NOT NULL AND (m.id IS NULL OR m.clinica_id IS DISTINCT FROM p.clinica_id))
        OR (p.convenio_id IS NOT NULL AND (c.id IS NULL OR c.clinica_id IS DISTINCT FROM p.clinica_id))
    UNION ALL
    SELECT e.id
      FROM public.exames e
      LEFT JOIN public.pacientes pa ON pa.id = e.paciente_id
      LEFT JOIN public.medicos m ON m.id = e.medico_solicitante_id
      LEFT JOIN public.tipo_exames_catalog cat ON cat.id = e.tipo_exame_catalog_id
      LEFT JOIN public.pedidos_laboratorio p ON p.id = e.pedido_laboratorio_id
     WHERE e.clinica_id IS NULL OR pa.id IS NULL OR pa.clinica_id IS DISTINCT FROM e.clinica_id
        OR (e.medico_solicitante_id IS NOT NULL AND (m.id IS NULL OR m.clinica_id IS DISTINCT FROM e.clinica_id))
        OR (e.tipo_exame_catalog_id IS NOT NULL AND (cat.id IS NULL OR cat.clinica_id IS DISTINCT FROM e.clinica_id))
        OR (e.pedido_laboratorio_id IS NOT NULL AND (p.id IS NULL OR p.clinica_id IS DISTINCT FROM e.clinica_id OR p.paciente_id IS DISTINCT FROM e.paciente_id))
    UNION ALL
    SELECT cl.id
      FROM public.coletas_laboratorio cl
      LEFT JOIN public.pacientes pa ON pa.id = cl.paciente_id
      LEFT JOIN public.exames e ON e.id = cl.exame_id
      LEFT JOIN public.medicos m ON m.id = cl.medico_solicitante_id
      LEFT JOIN public.convenios c ON c.id = cl.convenio_id
      LEFT JOIN public.laboratorio_setores s ON s.id = cl.setor_id
      LEFT JOIN public.coletas_laboratorio recoleta ON recoleta.id = cl.recoleta_de_id
     WHERE cl.clinica_id IS NULL OR pa.id IS NULL OR pa.clinica_id IS DISTINCT FROM cl.clinica_id
        OR (cl.exame_id IS NOT NULL AND (e.id IS NULL OR e.clinica_id IS DISTINCT FROM cl.clinica_id OR e.paciente_id IS DISTINCT FROM cl.paciente_id))
        OR (cl.medico_solicitante_id IS NOT NULL AND (m.id IS NULL OR m.clinica_id IS DISTINCT FROM cl.clinica_id))
        OR (cl.convenio_id IS NOT NULL AND (c.id IS NULL OR c.clinica_id IS DISTINCT FROM cl.clinica_id))
        OR (cl.setor_id IS NOT NULL AND (s.id IS NULL OR s.clinica_id IS DISTINCT FROM cl.clinica_id))
        OR (cl.recoleta_de_id IS NOT NULL AND (recoleta.id IS NULL OR recoleta.clinica_id IS DISTINCT FROM cl.clinica_id OR recoleta.paciente_id IS DISTINCT FROM cl.paciente_id))
    UNION ALL
    SELECT r.id
      FROM public.resultados_laboratorio r
      LEFT JOIN public.coletas_laboratorio cl ON cl.id = r.coleta_id
      LEFT JOIN public.pacientes pa ON pa.id = r.paciente_id
      LEFT JOIN public.exames e ON e.id = r.exame_id
     WHERE r.clinica_id IS NULL OR cl.id IS NULL OR cl.clinica_id IS DISTINCT FROM r.clinica_id OR cl.paciente_id IS DISTINCT FROM r.paciente_id
        OR pa.id IS NULL OR pa.clinica_id IS DISTINCT FROM r.clinica_id
        OR (r.exame_id IS NOT NULL AND (e.id IS NULL OR e.clinica_id IS DISTINCT FROM r.clinica_id OR e.paciente_id IS DISTINCT FROM r.paciente_id))
  ) referencias_invalidas;

  IF v_invalidos > 0 THEN
    RAISE EXCEPTION 'Há % vínculos laboratoriais entre clínicas ou incompatíveis com o paciente. Corrija os dados antes de aplicar esta migration.', v_invalidos;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_tenant_pedido_laboratorio()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_clinica uuid;
BEGIN
  IF NEW.clinica_id IS NULL OR NEW.paciente_id IS NULL THEN
    RAISE EXCEPTION 'Clínica e paciente são obrigatórios no pedido laboratorial.' USING ERRCODE = '23514';
  END IF;
  SELECT pa.clinica_id INTO v_clinica FROM public.pacientes pa WHERE pa.id = NEW.paciente_id FOR SHARE;
  IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id THEN
    RAISE EXCEPTION 'O paciente do pedido não pertence à clínica informada.' USING ERRCODE = '23514';
  END IF;
  IF NEW.medico_solicitante_id IS NOT NULL THEN
    SELECT m.clinica_id INTO v_clinica FROM public.medicos m WHERE m.id = NEW.medico_solicitante_id FOR SHARE;
    IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id THEN
      RAISE EXCEPTION 'O médico solicitante do pedido não pertence à clínica informada.' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.convenio_id IS NOT NULL THEN
    SELECT c.clinica_id INTO v_clinica FROM public.convenios c WHERE c.id = NEW.convenio_id FOR SHARE;
    IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id THEN
      RAISE EXCEPTION 'O convênio do pedido não pertence à clínica informada.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_tenant_exame_laboratorial()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_clinica uuid; v_paciente uuid;
BEGIN
  IF NEW.clinica_id IS NULL OR NEW.paciente_id IS NULL THEN
    RAISE EXCEPTION 'Clínica e paciente são obrigatórios no exame.' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.pedido_laboratorio_id IS DISTINCT FROM NEW.pedido_laboratorio_id THEN
    PERFORM p.id FROM public.pedidos_laboratorio p
     WHERE p.id = ANY(array_remove(ARRAY[OLD.pedido_laboratorio_id, NEW.pedido_laboratorio_id], NULL))
     ORDER BY p.id FOR UPDATE;
  ELSIF NEW.pedido_laboratorio_id IS NOT NULL THEN
    PERFORM p.id FROM public.pedidos_laboratorio p WHERE p.id = NEW.pedido_laboratorio_id
     ORDER BY p.id FOR UPDATE;
  END IF;
  SELECT pa.clinica_id INTO v_clinica FROM public.pacientes pa WHERE pa.id = NEW.paciente_id FOR SHARE;
  IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id THEN
    RAISE EXCEPTION 'O paciente do exame não pertence à clínica informada.' USING ERRCODE = '23514';
  END IF;
  IF NEW.medico_solicitante_id IS NOT NULL THEN
    SELECT m.clinica_id INTO v_clinica FROM public.medicos m WHERE m.id = NEW.medico_solicitante_id FOR SHARE;
    IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id THEN
      RAISE EXCEPTION 'O médico solicitante do exame não pertence à clínica informada.' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.tipo_exame_catalog_id IS NOT NULL THEN
    SELECT cat.clinica_id INTO v_clinica FROM public.tipo_exames_catalog cat WHERE cat.id = NEW.tipo_exame_catalog_id FOR SHARE;
    IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id THEN
      RAISE EXCEPTION 'O exame de catálogo não pertence à clínica informada.' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.pedido_laboratorio_id IS NOT NULL THEN
    SELECT p.clinica_id, p.paciente_id INTO v_clinica, v_paciente
      FROM public.pedidos_laboratorio p WHERE p.id = NEW.pedido_laboratorio_id;
    IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id OR v_paciente IS DISTINCT FROM NEW.paciente_id THEN
      RAISE EXCEPTION 'O pedido do exame não corresponde à clínica e ao paciente informados.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_tenant_coleta_laboratorio()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_clinica uuid; v_paciente uuid;
BEGIN
  IF NEW.clinica_id IS NULL OR NEW.paciente_id IS NULL THEN
    RAISE EXCEPTION 'Clínica e paciente são obrigatórios na coleta.' USING ERRCODE = '23514';
  END IF;
  SELECT pa.clinica_id INTO v_clinica FROM public.pacientes pa WHERE pa.id = NEW.paciente_id FOR SHARE;
  IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id THEN
    RAISE EXCEPTION 'O paciente da coleta não pertence à clínica informada.' USING ERRCODE = '23514';
  END IF;
  IF NEW.exame_id IS NOT NULL THEN
    SELECT e.clinica_id, e.paciente_id INTO v_clinica, v_paciente FROM public.exames e WHERE e.id = NEW.exame_id FOR SHARE;
    IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id OR v_paciente IS DISTINCT FROM NEW.paciente_id THEN
      RAISE EXCEPTION 'O exame da coleta não corresponde à clínica e ao paciente informados.' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.medico_solicitante_id IS NOT NULL THEN
    SELECT m.clinica_id INTO v_clinica FROM public.medicos m WHERE m.id = NEW.medico_solicitante_id FOR SHARE;
    IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id THEN
      RAISE EXCEPTION 'O médico solicitante da coleta não pertence à clínica informada.' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.convenio_id IS NOT NULL THEN
    SELECT c.clinica_id INTO v_clinica FROM public.convenios c WHERE c.id = NEW.convenio_id FOR SHARE;
    IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id THEN
      RAISE EXCEPTION 'O convênio da coleta não pertence à clínica informada.' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.setor_id IS NOT NULL THEN
    SELECT s.clinica_id INTO v_clinica FROM public.laboratorio_setores s WHERE s.id = NEW.setor_id FOR SHARE;
    IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id THEN
      RAISE EXCEPTION 'O setor da coleta não pertence à clínica informada.' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.recoleta_de_id IS NOT NULL THEN
    SELECT c.clinica_id, c.paciente_id INTO v_clinica, v_paciente FROM public.coletas_laboratorio c WHERE c.id = NEW.recoleta_de_id FOR SHARE;
    IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id OR v_paciente IS DISTINCT FROM NEW.paciente_id THEN
      RAISE EXCEPTION 'A recoleta deve pertencer à mesma clínica e paciente da amostra anterior.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_tenant_resultado_laboratorio()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_clinica uuid; v_paciente uuid;
BEGIN
  IF NEW.clinica_id IS NULL OR NEW.paciente_id IS NULL OR NEW.coleta_id IS NULL THEN
    RAISE EXCEPTION 'Clínica, paciente e coleta são obrigatórios no resultado.' USING ERRCODE = '23514';
  END IF;
  SELECT c.clinica_id, c.paciente_id INTO v_clinica, v_paciente
    FROM public.coletas_laboratorio c WHERE c.id = NEW.coleta_id FOR SHARE;
  IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id OR v_paciente IS DISTINCT FROM NEW.paciente_id THEN
    RAISE EXCEPTION 'A coleta do resultado não corresponde à clínica e ao paciente informados.' USING ERRCODE = '23514';
  END IF;
  SELECT pa.clinica_id INTO v_clinica FROM public.pacientes pa WHERE pa.id = NEW.paciente_id FOR SHARE;
  IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id THEN
    RAISE EXCEPTION 'O paciente do resultado não pertence à clínica informada.' USING ERRCODE = '23514';
  END IF;
  IF NEW.exame_id IS NOT NULL THEN
    SELECT e.clinica_id, e.paciente_id INTO v_clinica, v_paciente FROM public.exames e WHERE e.id = NEW.exame_id FOR SHARE;
    IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id OR v_paciente IS DISTINCT FROM NEW.paciente_id THEN
      RAISE EXCEPTION 'O exame do resultado não corresponde à clínica e ao paciente informados.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_tenant_pedido_laboratorio ON public.pedidos_laboratorio;
CREATE TRIGGER trg_validar_tenant_pedido_laboratorio BEFORE INSERT OR UPDATE ON public.pedidos_laboratorio
  FOR EACH ROW EXECUTE FUNCTION public.validar_tenant_pedido_laboratorio();
DROP TRIGGER IF EXISTS trg_validar_tenant_exame_laboratorial ON public.exames;
CREATE TRIGGER trg_validar_tenant_exame_laboratorial BEFORE INSERT OR UPDATE ON public.exames
  FOR EACH ROW EXECUTE FUNCTION public.validar_tenant_exame_laboratorial();
DROP TRIGGER IF EXISTS trg_validar_tenant_coleta_laboratorio ON public.coletas_laboratorio;
CREATE TRIGGER trg_validar_tenant_coleta_laboratorio BEFORE INSERT OR UPDATE ON public.coletas_laboratorio
  FOR EACH ROW EXECUTE FUNCTION public.validar_tenant_coleta_laboratorio();
DROP TRIGGER IF EXISTS trg_validar_tenant_resultado_laboratorio ON public.resultados_laboratorio;
CREATE TRIGGER trg_validar_tenant_resultado_laboratorio BEFORE INSERT OR UPDATE ON public.resultados_laboratorio
  FOR EACH ROW EXECUTE FUNCTION public.validar_tenant_resultado_laboratorio();

REVOKE ALL ON FUNCTION public.validar_tenant_pedido_laboratorio() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.validar_tenant_exame_laboratorial() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.validar_tenant_coleta_laboratorio() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.validar_tenant_resultado_laboratorio() FROM PUBLIC, anon;

-- A collection can only advance through the intended workflow. The RPCs below
-- set transaction-local markers after checking clinic, role, state and result data.
CREATE OR REPLACE FUNCTION public.proteger_transicao_coleta_laboratorio()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_transicao text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  v_transicao := current_setting('elolab.lab_transition', true);
  IF (OLD.status IN ('pendente', 'recoleta') AND NEW.status IN ('coletado', 'cancelado'))
     OR (OLD.status = 'coletado' AND NEW.status = 'em_analise') THEN
    RETURN NEW;
  END IF;
  IF NEW.status IN ('validado', 'liberado', 'rejeitada')
     AND v_transicao = NEW.status || ':' || NEW.id::text THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Transição de status laboratorial não permitida: % para %.', OLD.status, NEW.status
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_transicao_coleta_laboratorio ON public.coletas_laboratorio;
CREATE TRIGGER trg_proteger_transicao_coleta_laboratorio
  BEFORE UPDATE OF status ON public.coletas_laboratorio
  FOR EACH ROW EXECUTE FUNCTION public.proteger_transicao_coleta_laboratorio();
REVOKE ALL ON FUNCTION public.proteger_transicao_coleta_laboratorio() FROM PUBLIC, anon;

-- Validation runs with explicit authorization and records authorship atomically.
CREATE OR REPLACE FUNCTION public.validar_coleta_laboratorio(p_coleta_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_status text; v_clinica_id uuid; v_total integer; v_resultados_atualizados integer := 0;
BEGIN
  v_clinica_id := public.get_my_clinica_id();
  IF auth.uid() IS NULL OR v_clinica_id IS NULL OR NOT public.can_access_clinical(auth.uid()) THEN
    RAISE EXCEPTION 'Perfil sem permissão para validar resultados laboratoriais.' USING ERRCODE = '42501';
  END IF;
  SELECT c.status INTO v_status FROM public.coletas_laboratorio c
   WHERE c.id = p_coleta_id AND c.clinica_id = v_clinica_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Coleta não encontrada ou fora da clínica atual.' USING ERRCODE = 'P0002'; END IF;
  IF v_status <> 'em_analise' THEN
    RAISE EXCEPTION 'A coleta precisa estar em análise para ser validada.' USING ERRCODE = '23514';
  END IF;
  SELECT count(*) INTO v_total FROM public.resultados_laboratorio r
   WHERE r.coleta_id = p_coleta_id AND r.clinica_id = v_clinica_id;
  IF v_total = 0 THEN RAISE EXCEPTION 'Inclua ao menos um resultado antes de validar a coleta.' USING ERRCODE = '23514'; END IF;
  UPDATE public.resultados_laboratorio r
     SET validado_por = COALESCE(r.validado_por, auth.uid()),
         data_validacao = COALESCE(r.data_validacao, now())
   WHERE r.coleta_id = p_coleta_id AND r.clinica_id = v_clinica_id
     AND (r.validado_por IS NULL OR r.data_validacao IS NULL);
  GET DIAGNOSTICS v_resultados_atualizados = ROW_COUNT;
  IF EXISTS (SELECT 1 FROM public.resultados_laboratorio r
      WHERE r.coleta_id = p_coleta_id AND r.clinica_id = v_clinica_id
        AND (r.validado_por IS NULL OR r.data_validacao IS NULL)) THEN
    RAISE EXCEPTION 'Não foi possível registrar a autoria da conferência.' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('elolab.lab_transition', 'validado:' || p_coleta_id::text, true);
  UPDATE public.coletas_laboratorio c SET status = 'validado'
   WHERE c.id = p_coleta_id AND c.clinica_id = v_clinica_id AND c.status = 'em_analise';
  IF NOT FOUND THEN RAISE EXCEPTION 'A situação da coleta mudou. Atualize a tela.' USING ERRCODE = '40001'; END IF;
  RETURN v_resultados_atualizados;
END;
$$;
REVOKE ALL ON FUNCTION public.validar_coleta_laboratorio(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validar_coleta_laboratorio(uuid) TO authenticated;

-- Direct updates are not a release path. Only the authorized atomic RPC can
-- change release fields after technical validation.
CREATE OR REPLACE FUNCTION public.proteger_resultado_contra_estado_da_coleta()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_status text; v_clinica_id uuid; v_paciente_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.coleta_id IS DISTINCT FROM NEW.coleta_id THEN
    RAISE EXCEPTION 'O resultado não pode ser transferido para outra coleta.' USING ERRCODE = '23514';
  END IF;
  SELECT c.status, c.clinica_id, c.paciente_id INTO v_status, v_clinica_id, v_paciente_id
    FROM public.coletas_laboratorio c WHERE c.id = NEW.coleta_id FOR UPDATE;
  IF NOT FOUND OR NEW.clinica_id IS DISTINCT FROM v_clinica_id OR NEW.paciente_id IS DISTINCT FROM v_paciente_id THEN
    RAISE EXCEPTION 'O resultado precisa pertencer à mesma clínica e paciente da coleta.' USING ERRCODE = '23514';
  END IF;
  IF v_status = 'validado' THEN
    IF TG_OP = 'UPDATE'
       AND current_setting('elolab.retificar_resultado', true) = NEW.id::text
       AND public.can_access_clinical(auth.uid())
       AND (public.is_admin(auth.uid()) OR public.is_enfermagem(auth.uid()))
       AND length(btrim(coalesce(NEW.observacao_revisao, ''))) >= 10
       AND NEW.liberado IS NOT DISTINCT FROM OLD.liberado THEN
      RETURN NEW;
    END IF;
    IF TG_OP <> 'UPDATE' OR COALESCE(OLD.liberado, false) OR NEW.liberado IS NOT TRUE
       OR current_setting('elolab.liberar_resultado_coleta', true) IS DISTINCT FROM NEW.coleta_id::text
       OR (to_jsonb(NEW) - ARRAY['liberado', 'data_liberacao', 'liberado_por', 'updated_at'])
          IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['liberado', 'data_liberacao', 'liberado_por', 'updated_at']) THEN
      RAISE EXCEPTION 'A coleta já foi validada. Use a liberação técnica para publicar resultados.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF v_status = 'liberado' AND TG_OP = 'UPDATE'
     AND current_setting('elolab.retificar_resultado', true) = NEW.id::text
     AND public.can_access_clinical(auth.uid())
     AND (public.is_admin(auth.uid()) OR public.is_enfermagem(auth.uid()))
     AND OLD.liberado IS TRUE AND NEW.liberado IS TRUE
     AND length(btrim(coalesce(NEW.observacao_revisao, ''))) >= 10 THEN
    RETURN NEW;
  END IF;
  IF v_status NOT IN ('coletado', 'em_analise') THEN
    RAISE EXCEPTION 'Não é permitido incluir ou alterar resultados quando a coleta está em "%".', v_status USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS resultados_respeitam_estado_coleta ON public.resultados_laboratorio;
CREATE TRIGGER resultados_respeitam_estado_coleta BEFORE INSERT OR UPDATE ON public.resultados_laboratorio
  FOR EACH ROW EXECUTE FUNCTION public.proteger_resultado_contra_estado_da_coleta();
REVOKE ALL ON FUNCTION public.proteger_resultado_contra_estado_da_coleta() FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.retificar_resultado_laboratorio(
  p_resultado_id uuid, p_resultado text, p_unidade text, p_referencia_min numeric,
  p_referencia_max numeric, p_referencia_texto text, p_metodo text, p_critico boolean, p_motivo text
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_resultado public.resultados_laboratorio%ROWTYPE; v_clinica_id uuid; v_status_coleta text;
BEGIN
  v_clinica_id := public.get_my_clinica_id();
  IF auth.uid() IS NULL OR v_clinica_id IS NULL OR NOT public.can_access_clinical(auth.uid()) THEN
    RAISE EXCEPTION 'Perfil não autorizado a revisar resultados.' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(p_resultado), '') IS NULL THEN RAISE EXCEPTION 'Informe o resultado.' USING ERRCODE = '23514'; END IF;
  IF p_referencia_min IS NOT NULL AND p_referencia_max IS NOT NULL AND p_referencia_min > p_referencia_max THEN
    RAISE EXCEPTION 'O limite mínimo não pode exceder o máximo.' USING ERRCODE = '23514';
  END IF;
  SELECT r.* INTO v_resultado FROM public.resultados_laboratorio r
   WHERE r.id = p_resultado_id AND r.clinica_id = v_clinica_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Resultado não encontrado na clínica atual.' USING ERRCODE = 'P0002'; END IF;
  SELECT c.status INTO v_status_coleta FROM public.coletas_laboratorio c
   WHERE c.id = v_resultado.coleta_id AND c.clinica_id = v_clinica_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Coleta do resultado não encontrada na clínica atual.' USING ERRCODE = 'P0002'; END IF;
  SELECT r.* INTO v_resultado FROM public.resultados_laboratorio r
   WHERE r.id = p_resultado_id AND r.clinica_id = v_clinica_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Resultado alterado enquanto a retificação era preparada.' USING ERRCODE = '40001'; END IF;
  IF v_resultado.liberado IS TRUE OR v_status_coleta IN ('validado', 'liberado') THEN
    IF length(btrim(coalesce(p_motivo, ''))) < 10 THEN
      RAISE EXCEPTION 'A retificação após validação exige motivo com pelo menos 10 caracteres.' USING ERRCODE = '23514';
    END IF;
    IF NOT (public.is_admin(auth.uid()) OR public.is_enfermagem(auth.uid())) THEN
      RAISE EXCEPTION 'Somente responsável técnico pode retificar resultado validado.' USING ERRCODE = '42501';
    END IF;
  END IF;
  PERFORM set_config('elolab.retificar_resultado', p_resultado_id::text, true);
  UPDATE public.resultados_laboratorio SET
    resultado = btrim(p_resultado), unidade = nullif(btrim(p_unidade), ''),
    valor_referencia_min = p_referencia_min, valor_referencia_max = p_referencia_max,
    valor_referencia_texto = nullif(btrim(p_referencia_texto), ''), metodo = nullif(btrim(p_metodo), ''),
    critico = coalesce(p_critico, false), observacao_revisao = nullif(btrim(p_motivo), ''),
    revisado_por = auth.uid(), revisado_em = now(),
    data_liberacao = CASE WHEN v_resultado.liberado IS TRUE THEN now() ELSE data_liberacao END,
    liberado_por = CASE WHEN v_resultado.liberado IS TRUE THEN auth.uid() ELSE liberado_por END
   WHERE id = p_resultado_id AND clinica_id = v_clinica_id;
  PERFORM set_config('elolab.retificar_resultado', '', true);
  RETURN v_resultado.numero_versao + 1;
END;
$$;
REVOKE ALL ON FUNCTION public.retificar_resultado_laboratorio(uuid, text, text, numeric, numeric, text, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retificar_resultado_laboratorio(uuid, text, text, numeric, numeric, text, text, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.liberar_resultados_laboratorio(p_coleta_id uuid, p_resultado_ids uuid[])
RETURNS TABLE (id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_clinica_id uuid; v_status text; v_solicitados integer; v_encontrados integer;
BEGIN
  v_clinica_id := public.get_my_clinica_id();
  IF auth.uid() IS NULL OR v_clinica_id IS NULL OR NOT public.can_access_clinical(auth.uid()) THEN
    RAISE EXCEPTION 'Perfil não autorizado a liberar resultados.' USING ERRCODE = '42501';
  END IF;
  IF p_coleta_id IS NULL OR p_resultado_ids IS NULL OR cardinality(p_resultado_ids) = 0 THEN
    RAISE EXCEPTION 'Coleta e resultados são obrigatórios.' USING ERRCODE = '23514';
  END IF;
  SELECT c.status INTO v_status FROM public.coletas_laboratorio c
   WHERE c.id = p_coleta_id AND c.clinica_id = v_clinica_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Coleta não encontrada ou fora da clínica atual.' USING ERRCODE = 'P0002'; END IF;
  IF v_status NOT IN ('validado', 'liberado') THEN
    RAISE EXCEPTION 'Conclua a conferência técnica antes da liberação.' USING ERRCODE = '23514';
  END IF;
  SELECT count(DISTINCT x.id) INTO v_solicitados FROM unnest(p_resultado_ids) AS x(id);
  SELECT count(DISTINCT r.id) INTO v_encontrados FROM public.resultados_laboratorio r
   WHERE r.clinica_id = v_clinica_id AND r.coleta_id = p_coleta_id AND r.id = ANY(p_resultado_ids);
  IF v_solicitados = 0 OR v_solicitados <> v_encontrados THEN
    RAISE EXCEPTION 'Todos os resultados solicitados devem pertencer à coleta e à clínica atuais.' USING ERRCODE = '23514';
  END IF;
  PERFORM set_config('elolab.liberar_resultado_coleta', p_coleta_id::text, true);
  RETURN QUERY UPDATE public.resultados_laboratorio r
     SET liberado = true, data_liberacao = COALESCE(r.data_liberacao, now()),
         liberado_por = COALESCE(auth.uid(), r.liberado_por)
   WHERE r.coleta_id = p_coleta_id AND r.clinica_id = v_clinica_id
     AND r.id = ANY(p_resultado_ids) AND COALESCE(r.liberado, false) = false
   RETURNING r.id;
  IF NOT EXISTS (SELECT 1 FROM public.resultados_laboratorio r
      WHERE r.coleta_id = p_coleta_id AND r.clinica_id = v_clinica_id AND COALESCE(r.liberado, false) = false) THEN
    PERFORM set_config('elolab.lab_transition', 'liberado:' || p_coleta_id::text, true);
    UPDATE public.coletas_laboratorio c SET status = 'liberado'
     WHERE c.id = p_coleta_id AND c.clinica_id = v_clinica_id AND c.status = 'validado';
  END IF;
  PERFORM set_config('elolab.liberar_resultado_coleta', '', true);
END;
$$;
REVOKE ALL ON FUNCTION public.liberar_resultados_laboratorio(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.liberar_resultados_laboratorio(uuid, uuid[]) TO authenticated;

-- Keep order status synchronized when an exam changes parent or is deleted.
CREATE OR REPLACE FUNCTION public.laboratorio_recalcular_pedido()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_pedido_id uuid; v_ids uuid[] := ARRAY[]::uuid[]; v_total integer; v_liberados integer;
  v_cancelados integer; v_em_processo integer; v_agendados integer; v_status text; v_clinica_id uuid;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.pedido_laboratorio_id IS NOT NULL THEN
    v_ids := array_append(v_ids, OLD.pedido_laboratorio_id);
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.pedido_laboratorio_id IS NOT NULL THEN
    v_ids := array_append(v_ids, NEW.pedido_laboratorio_id);
  END IF;
  FOR v_pedido_id IN SELECT DISTINCT item.pedido_id FROM unnest(v_ids) AS item(pedido_id)
    WHERE item.pedido_id IS NOT NULL ORDER BY item.pedido_id LOOP
    SELECT count(*), count(*) FILTER (WHERE e.status::text = 'laudo_disponivel'),
           count(*) FILTER (WHERE e.status::text = 'cancelado'),
           count(*) FILTER (WHERE e.status::text = 'realizado'),
           count(*) FILTER (WHERE e.status::text = 'agendado')
      INTO v_total, v_liberados, v_cancelados, v_em_processo, v_agendados
      FROM public.exames e WHERE e.pedido_laboratorio_id = v_pedido_id;
    v_status := CASE
      WHEN v_total = 0 THEN 'cancelado'
      WHEN v_liberados = v_total THEN 'liberado'
      WHEN v_liberados > 0 THEN 'parcialmente_liberado'
      WHEN v_cancelados = v_total THEN 'cancelado'
      WHEN v_em_processo > 0 THEN 'em_processamento'
      WHEN v_agendados > 0 THEN 'agendado'
      ELSE 'solicitado'
    END;
    IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND v_pedido_id = OLD.pedido_laboratorio_id) THEN
      v_clinica_id := OLD.clinica_id;
    ELSE
      v_clinica_id := NEW.clinica_id;
    END IF;
    UPDATE public.pedidos_laboratorio p SET status = v_status, updated_at = now()
     WHERE p.id = v_pedido_id AND p.clinica_id = v_clinica_id AND p.status IS DISTINCT FROM v_status;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_lab_pedido_status_exame ON public.exames;
CREATE TRIGGER trg_lab_pedido_status_exame AFTER INSERT OR UPDATE OF status, pedido_laboratorio_id OR DELETE ON public.exames
  FOR EACH ROW
  EXECUTE FUNCTION public.laboratorio_recalcular_pedido();

-- Rejection is also a state transition and must use the audited movement RPC.
CREATE OR REPLACE FUNCTION public.laboratorio_registrar_evento_amostra(
  p_coleta_id uuid, p_tipo text, p_local text DEFAULT NULL, p_detalhes jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_clinica_id uuid; v_coleta public.coletas_laboratorio%ROWTYPE; v_nova_coleta_id uuid; v_status_anterior text; v_status_novo text; v_motivo text;
BEGIN
  v_clinica_id := public.get_my_clinica_id();
  IF auth.uid() IS NULL OR v_clinica_id IS NULL OR NOT public.can_access_clinical(auth.uid()) THEN
    RAISE EXCEPTION 'Perfil sem permissão para movimentar amostras.' USING ERRCODE = '42501';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('recebida', 'transporte', 'armazenamento', 'rejeicao', 'recoleta', 'observacao') THEN
    RAISE EXCEPTION 'Tipo de movimentação inválido.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_coleta FROM public.coletas_laboratorio c
   WHERE c.id = p_coleta_id AND c.clinica_id = v_clinica_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Amostra não encontrada na clínica atual.' USING ERRCODE = 'P0002'; END IF;
  v_status_anterior := v_coleta.status;
  v_status_novo := v_coleta.status;
  IF p_tipo IN ('transporte', 'armazenamento') THEN
    IF nullif(btrim(p_local), '') IS NULL THEN RAISE EXCEPTION 'Informe o local da movimentação.' USING ERRCODE = '23514'; END IF;
    UPDATE public.coletas_laboratorio SET local_atual = btrim(p_local), updated_at = now() WHERE id = p_coleta_id;
  ELSIF p_tipo = 'rejeicao' THEN
    IF v_coleta.status NOT IN ('coletado', 'em_analise') THEN RAISE EXCEPTION 'Somente amostra recebida pode ser rejeitada.' USING ERRCODE = '23514'; END IF;
    IF length(btrim(coalesce(p_detalhes->>'motivo', ''))) < 5 THEN RAISE EXCEPTION 'Informe o motivo da rejeição.' USING ERRCODE = '23514'; END IF;
    PERFORM set_config('elolab.lab_transition', 'rejeitada:' || p_coleta_id::text, true);
    UPDATE public.coletas_laboratorio SET status = 'rejeitada', rejeicao_motivo = btrim(p_detalhes->>'motivo'), updated_at = now()
     WHERE id = p_coleta_id AND clinica_id = v_clinica_id;
  ELSIF p_tipo = 'recoleta' THEN
    v_motivo := nullif(btrim(p_detalhes->>'motivo'), '');
    IF v_coleta.status NOT IN ('coletado', 'em_analise', 'rejeitada') THEN
      RAISE EXCEPTION 'A recoleta só pode ser aberta para amostra coletada, em análise ou rejeitada.' USING ERRCODE = '23514';
    END IF;
    IF length(coalesce(v_motivo, '')) < 5 THEN RAISE EXCEPTION 'Informe o motivo da recoleta.' USING ERRCODE = '23514'; END IF;
    IF v_coleta.status IN ('coletado', 'em_analise') THEN
      PERFORM set_config('elolab.lab_transition', 'rejeitada:' || p_coleta_id::text, true);
      UPDATE public.coletas_laboratorio SET status = 'rejeitada', rejeicao_motivo = v_motivo, updated_at = now()
       WHERE id = p_coleta_id AND clinica_id = v_clinica_id;
      v_status_novo := 'rejeitada';
    END IF;
    INSERT INTO public.coletas_laboratorio (paciente_id, exame_id, medico_solicitante_id, clinica_id, tipo_amostra, tubo,
      status, observacoes, jejum_necessario, jejum_horas, urgente, convenio_id, setor_id, recoleta_de_id)
    VALUES (v_coleta.paciente_id, v_coleta.exame_id, v_coleta.medico_solicitante_id, v_clinica_id, v_coleta.tipo_amostra,
      v_coleta.tubo, 'recoleta', concat_ws(E'\n', v_coleta.observacoes, 'Recoleta: ' || v_motivo),
      v_coleta.jejum_necessario, v_coleta.jejum_horas, v_coleta.urgente, v_coleta.convenio_id, v_coleta.setor_id, v_coleta.id)
    RETURNING id INTO v_nova_coleta_id;
    INSERT INTO public.laboratorio_eventos_amostra (clinica_id, coleta_id, tipo, status_anterior, status_novo, detalhes, ator_id)
    VALUES (v_clinica_id, v_coleta.id, 'recoleta', v_status_anterior, v_status_novo,
      jsonb_build_object('nova_coleta_id', v_nova_coleta_id, 'motivo', v_motivo), auth.uid());
    RETURN v_nova_coleta_id;
  END IF;
  INSERT INTO public.laboratorio_eventos_amostra (clinica_id, coleta_id, tipo, status_anterior, status_novo, local, detalhes, ator_id)
  VALUES (v_clinica_id, v_coleta.id, p_tipo, v_coleta.status,
    CASE WHEN p_tipo = 'rejeicao' THEN 'rejeitada' ELSE v_coleta.status END,
    nullif(btrim(p_local), ''), coalesce(p_detalhes, '{}'::jsonb), auth.uid()) RETURNING id INTO v_nova_coleta_id;
  RETURN v_nova_coleta_id;
END;
$$;
REVOKE ALL ON FUNCTION public.laboratorio_registrar_evento_amostra(uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.laboratorio_registrar_evento_amostra(uuid, text, text, jsonb) TO authenticated;

COMMIT;
