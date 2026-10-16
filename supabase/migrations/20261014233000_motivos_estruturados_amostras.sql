BEGIN;

-- A rejeição também altera o status da amostra, mas o RPC registra o evento
-- detalhado logo depois. O trigger deve deixar esse registro para evitar duas
-- linhas de auditoria para a mesma decisão.
CREATE OR REPLACE FUNCTION public.laboratorio_auditar_status_amostra()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.laboratorio_eventos_amostra (clinica_id, coleta_id, tipo, status_novo, detalhes, ator_id)
    VALUES (NEW.clinica_id, NEW.id, 'criada', NEW.status,
      jsonb_build_object('codigo_amostra', NEW.codigo_amostra), auth.uid());
  ELSIF NEW.status IS DISTINCT FROM OLD.status
    AND current_setting('elolab.lab_event_override', true) IS DISTINCT FROM NEW.id::text THEN
    INSERT INTO public.laboratorio_eventos_amostra (clinica_id, coleta_id, tipo, status_anterior, status_novo, detalhes, ator_id)
    VALUES (NEW.clinica_id, NEW.id,
      CASE WHEN NEW.status IN ('rejeitada', 'recoleta') THEN NEW.status ELSE 'status' END,
      OLD.status, NEW.status, '{}'::jsonb, auth.uid());
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.laboratorio_registrar_evento_amostra(
  p_coleta_id uuid,
  p_tipo text,
  p_local text DEFAULT NULL,
  p_detalhes jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_clinica_id uuid;
  v_coleta public.coletas_laboratorio%ROWTYPE;
  v_nova_coleta_id uuid;
  v_status_anterior text;
  v_status_novo text;
  v_motivo_codigo text;
  v_motivo_rotulo text;
  v_motivo_detalhe text;
  v_motivo text;
  v_detalhes jsonb := coalesce(p_detalhes, '{}'::jsonb);
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

  IF p_tipo IN ('rejeicao', 'recoleta') THEN
    IF jsonb_typeof(v_detalhes) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'O motivo estruturado da amostra é inválido.' USING ERRCODE = '22023';
    END IF;
    v_motivo_codigo := nullif(btrim(v_detalhes->>'motivo_codigo'), '');
    v_motivo_detalhe := nullif(btrim(v_detalhes->>'motivo_detalhe'), '');
    v_motivo_rotulo := CASE v_motivo_codigo
      WHEN 'identificacao_divergente' THEN 'Identificação divergente'
      WHEN 'recipiente_inadequado' THEN 'Tubo ou recipiente inadequado'
      WHEN 'volume_insuficiente' THEN 'Volume insuficiente'
      WHEN 'hemolisada' THEN 'Amostra hemolisada'
      WHEN 'coagulada' THEN 'Amostra coagulada'
      WHEN 'conservacao_inadequada' THEN 'Conservação inadequada'
      WHEN 'contaminada' THEN 'Amostra contaminada'
      WHEN 'prazo_excedido' THEN 'Prazo de estabilidade excedido'
      WHEN 'outro' THEN 'Outro'
      ELSE NULL
    END;
    IF v_motivo_rotulo IS NULL THEN
      RAISE EXCEPTION 'Selecione um motivo válido para a amostra.' USING ERRCODE = '22023';
    END IF;
    IF length(coalesce(v_motivo_detalhe, '')) > 300 THEN
      RAISE EXCEPTION 'O detalhe do motivo não pode exceder 300 caracteres.' USING ERRCODE = '22023';
    END IF;
    IF v_motivo_codigo = 'outro' AND length(coalesce(v_motivo_detalhe, '')) < 5 THEN
      RAISE EXCEPTION 'Explique o motivo selecionado em pelo menos 5 caracteres.' USING ERRCODE = '22023';
    END IF;
    v_motivo := v_motivo_rotulo || CASE
      WHEN v_motivo_detalhe IS NULL THEN ''
      ELSE ' — ' || v_motivo_detalhe
    END;
    v_detalhes := jsonb_build_object(
      'motivo_codigo', v_motivo_codigo,
      'motivo_rotulo', v_motivo_rotulo,
      'motivo_detalhe', v_motivo_detalhe,
      'motivo', v_motivo
    );
  END IF;

  IF p_tipo IN ('transporte', 'armazenamento') THEN
    IF nullif(btrim(p_local), '') IS NULL THEN RAISE EXCEPTION 'Informe o local da movimentação.' USING ERRCODE = '23514'; END IF;
    UPDATE public.coletas_laboratorio SET local_atual = btrim(p_local), updated_at = now() WHERE id = p_coleta_id;
  ELSIF p_tipo = 'rejeicao' THEN
    IF v_coleta.status NOT IN ('coletado', 'em_analise') THEN RAISE EXCEPTION 'Somente amostra recebida pode ser rejeitada.' USING ERRCODE = '23514'; END IF;
    PERFORM set_config('elolab.lab_event_override', p_coleta_id::text, true);
    PERFORM set_config('elolab.lab_transition', 'rejeitada:' || p_coleta_id::text, true);
    UPDATE public.coletas_laboratorio SET status = 'rejeitada', rejeicao_motivo = v_motivo, updated_at = now()
     WHERE id = p_coleta_id AND clinica_id = v_clinica_id;
    v_status_novo := 'rejeitada';
  ELSIF p_tipo = 'recoleta' THEN
    IF v_coleta.status NOT IN ('coletado', 'em_analise', 'rejeitada') THEN
      RAISE EXCEPTION 'A recoleta só pode ser aberta para amostra coletada, em análise ou rejeitada.' USING ERRCODE = '23514';
    END IF;
    IF v_coleta.status IN ('coletado', 'em_analise') THEN
      PERFORM set_config('elolab.lab_event_override', p_coleta_id::text, true);
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
      v_detalhes || jsonb_build_object('nova_coleta_id', v_nova_coleta_id), auth.uid());
    RETURN v_nova_coleta_id;
  END IF;

  INSERT INTO public.laboratorio_eventos_amostra (clinica_id, coleta_id, tipo, status_anterior, status_novo, local, detalhes, ator_id)
  VALUES (v_clinica_id, v_coleta.id, p_tipo, v_status_anterior,
    CASE WHEN p_tipo = 'rejeicao' THEN 'rejeitada' ELSE v_status_novo END,
    nullif(btrim(p_local), ''), v_detalhes, auth.uid()) RETURNING id INTO v_nova_coleta_id;
  RETURN v_nova_coleta_id;
END;
$$;

REVOKE ALL ON FUNCTION public.laboratorio_registrar_evento_amostra(uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.laboratorio_registrar_evento_amostra(uuid, text, text, jsonb) TO authenticated;

COMMIT;
