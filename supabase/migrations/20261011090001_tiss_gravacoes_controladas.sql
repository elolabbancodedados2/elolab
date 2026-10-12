BEGIN;

-- Lotes are created as drafts and can only be marked as sent through the
-- validated operations below. Payment status remains exclusive to the return RPC.
REVOKE INSERT, UPDATE ON public.lotes_tiss FROM authenticated, anon, PUBLIC;
REVOKE UPDATE ON public.glosas_convenio FROM authenticated, anon, PUBLIC;

CREATE OR REPLACE FUNCTION public.criar_lote_tiss(
  p_convenio_id uuid,
  p_competencia date,
  p_numero_lote text,
  p_quantidade_guias integer,
  p_valor_apresentado numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinica uuid := public.get_my_clinica_id();
  v_versao text;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_financial(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso financeiro necessário';
  END IF;
  IF v_clinica IS NULL OR p_convenio_id IS NULL OR p_competencia IS NULL
     OR p_competencia <> date_trunc('month', p_competencia)::date
     OR NULLIF(btrim(COALESCE(p_numero_lote, '')), '') IS NULL
     OR p_quantidade_guias IS NULL OR p_quantidade_guias < 1
     OR p_valor_apresentado IS NULL OR p_valor_apresentado <= 0
     OR p_valor_apresentado <> round(p_valor_apresentado, 2) THEN
    RAISE EXCEPTION 'Informe competência, número, quantidade e valor válidos';
  END IF;

  SELECT c.versao_tiss INTO v_versao
    FROM public.convenios c
   WHERE c.id = p_convenio_id AND c.clinica_id = v_clinica;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convênio não encontrado nesta clínica';
  END IF;

  INSERT INTO public.lotes_tiss (
    clinica_id, convenio_id, competencia, numero_lote, versao_tiss,
    quantidade_guias, valor_apresentado, status, criado_por
  ) VALUES (
    v_clinica, p_convenio_id, p_competencia, btrim(p_numero_lote),
    COALESCE(NULLIF(btrim(v_versao), ''), '04.01.00'),
    p_quantidade_guias, p_valor_apresentado, 'rascunho', auth.uid()
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id, 'status', 'rascunho');
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_envio_lote_tiss(p_lote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinica uuid := public.get_my_clinica_id();
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_financial(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso financeiro necessário';
  END IF;
  IF v_clinica IS NULL OR p_lote_id IS NULL THEN
    RAISE EXCEPTION 'Lote inválido';
  END IF;

  UPDATE public.lotes_tiss
     SET status = 'enviado', enviado_em = now()
   WHERE id = p_lote_id AND clinica_id = v_clinica AND status = 'rascunho'
  RETURNING id INTO v_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote não encontrado ou não está mais como rascunho';
  END IF;

  RETURN jsonb_build_object('success', true, 'id', v_id, 'status', 'enviado');
END;
$$;

CREATE OR REPLACE FUNCTION public.atualizar_glosa_convenio(
  p_glosa_id uuid,
  p_status text,
  p_recurso_justificativa text DEFAULT NULL,
  p_valor_recuperado numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinica uuid := public.get_my_clinica_id();
  v_glosa public.glosas_convenio%ROWTYPE;
  v_status_anterior text;
  v_justificativa text := NULLIF(btrim(COALESCE(p_recurso_justificativa, '')), '');
  v_recuperado numeric(14,2);
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_financial(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso financeiro necessário';
  END IF;
  IF v_clinica IS NULL OR p_glosa_id IS NULL THEN
    RAISE EXCEPTION 'Glosa inválida';
  END IF;

  SELECT * INTO v_glosa
    FROM public.glosas_convenio
   WHERE id = p_glosa_id AND clinica_id = v_clinica
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Glosa não encontrada nesta clínica';
  END IF;
  v_status_anterior := v_glosa.status;

  IF p_status = 'recurso_preparacao'
     AND v_status_anterior IN ('pendente', 'recurso_preparacao') THEN
    IF length(COALESCE(v_justificativa, '')) < 10 THEN
      RAISE EXCEPTION 'A justificativa do recurso deve ter ao menos 10 caracteres';
    END IF;
    UPDATE public.glosas_convenio
       SET status = 'recurso_preparacao', recurso_justificativa = v_justificativa
     WHERE id = v_glosa.id;
  ELSIF p_status = 'recurso_enviado' AND v_status_anterior = 'recurso_preparacao' THEN
    IF length(COALESCE(NULLIF(btrim(v_glosa.recurso_justificativa), ''), '')) < 10 THEN
      RAISE EXCEPTION 'Registre a justificativa antes de enviar o recurso';
    END IF;
    UPDATE public.glosas_convenio
       SET status = 'recurso_enviado', recurso_enviado_em = now()
     WHERE id = v_glosa.id;
  ELSIF p_status IN ('aceita', 'mantida') AND v_status_anterior = 'recurso_enviado' THEN
    v_recuperado := COALESCE(p_valor_recuperado, 0);
    IF v_recuperado < 0 OR v_recuperado > v_glosa.valor_glosado
       OR v_recuperado <> round(v_recuperado, 2)
       OR (p_status = 'mantida' AND v_recuperado <> 0) THEN
      RAISE EXCEPTION 'O valor recuperado deve estar entre zero e o valor glosado';
    END IF;
    UPDATE public.glosas_convenio
       SET status = p_status, valor_recuperado = v_recuperado, resolvido_em = now()
     WHERE id = v_glosa.id;
  ELSE
    RAISE EXCEPTION 'Transição de glosa inválida';
  END IF;

  RETURN jsonb_build_object('success', true, 'id', v_glosa.id, 'status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.criar_lote_tiss(uuid, date, text, integer, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_lote_tiss(uuid, date, text, integer, numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.registrar_envio_lote_tiss(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_envio_lote_tiss(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.atualizar_glosa_convenio(uuid, text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_glosa_convenio(uuid, text, text, numeric) TO authenticated;

COMMENT ON FUNCTION public.criar_lote_tiss(uuid, date, text, integer, numeric) IS
  'Cria lote TISS somente como rascunho, dentro do convênio e clínica do usuário financeiro.';
COMMENT ON FUNCTION public.registrar_envio_lote_tiss(uuid) IS
  'Marca como enviado somente lote em rascunho pertencente à clínica do usuário financeiro.';
COMMENT ON FUNCTION public.atualizar_glosa_convenio(uuid, text, text, numeric) IS
  'Aplica transições permitidas da glosa e valida justificativa e valor recuperado no banco.';

COMMIT;
