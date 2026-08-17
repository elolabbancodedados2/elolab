-- Qualifica colunas que colidiam com nomes das colunas de retorno do PL/pgSQL.

CREATE OR REPLACE FUNCTION public.registrar_baixa_estoque(
  p_item_id uuid,
  p_quantidade integer,
  p_prontuario_id uuid DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL,
  p_motivo text DEFAULT NULL
)
RETURNS TABLE (
  item_id uuid,
  quantidade_anterior integer,
  quantidade_nova integer,
  ja_baixado boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_item public.estoque%ROWTYPE;
BEGIN
  IF p_quantidade IS NULL OR p_quantidade < 1 THEN
    RAISE EXCEPTION 'A quantidade da baixa deve ser maior que zero';
  END IF;

  SELECT e.* INTO v_item
    FROM public.estoque AS e
   WHERE e.id = p_item_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item de estoque não encontrado';
  END IF;

  IF p_prontuario_id IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.movimentacoes_estoque AS m
     WHERE m.item_id = p_item_id
       AND m.prontuario_id = p_prontuario_id
       AND m.tipo = 'saida'
  ) THEN
    RETURN QUERY SELECT v_item.id, v_item.quantidade, v_item.quantidade, true;
    RETURN;
  END IF;

  IF v_item.quantidade < p_quantidade THEN
    RAISE EXCEPTION 'Estoque insuficiente: % disponível, % solicitado',
      v_item.quantidade, p_quantidade;
  END IF;

  UPDATE public.estoque AS e
     SET quantidade = e.quantidade - p_quantidade
   WHERE e.id = p_item_id;

  INSERT INTO public.movimentacoes_estoque (
    item_id, tipo, quantidade, prontuario_id, motivo, usuario_id
  ) VALUES (
    p_item_id, 'saida', p_quantidade, p_prontuario_id, p_motivo, p_usuario_id
  );

  RETURN QUERY SELECT
    v_item.id, v_item.quantidade, v_item.quantidade - p_quantidade, false;
END;
$$;

CREATE OR REPLACE FUNCTION public.liberar_resultados_laboratorio(
  p_coleta_id uuid,
  p_resultado_ids uuid[]
)
RETURNS TABLE (id uuid)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_status_coleta text;
  v_tem_resultado boolean;
BEGIN
  IF p_coleta_id IS NULL OR p_resultado_ids IS NULL OR cardinality(p_resultado_ids) = 0 THEN
    RAISE EXCEPTION 'Coleta e resultados são obrigatórios';
  END IF;

  SELECT c.status INTO v_status_coleta
    FROM public.coletas_laboratorio AS c
   WHERE c.id = p_coleta_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Coleta não encontrada ou fora da sua clínica';
  END IF;

  IF v_status_coleta NOT IN ('validado', 'liberado') THEN
    RAISE EXCEPTION
      'Coleta não pode ser liberada enquanto estiver em "%". Conclua a conferência técnica primeiro.',
      v_status_coleta
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.resultados_laboratorio AS r
     WHERE r.coleta_id = p_coleta_id
       AND r.id = ANY (p_resultado_ids)
  ) INTO v_tem_resultado;

  IF NOT v_tem_resultado THEN
    RAISE EXCEPTION 'Nenhum resultado pertence à coleta informada';
  END IF;

  RETURN QUERY
  UPDATE public.resultados_laboratorio AS r
     SET liberado = true,
         data_liberacao = COALESCE(r.data_liberacao, now()),
         liberado_por = COALESCE(auth.uid(), r.liberado_por)
   WHERE r.coleta_id = p_coleta_id
     AND r.id = ANY (p_resultado_ids)
     AND COALESCE(r.liberado, false) = false
  RETURNING r.id;

  IF NOT EXISTS (
    SELECT 1
      FROM public.resultados_laboratorio AS r
     WHERE r.coleta_id = p_coleta_id
       AND COALESCE(r.liberado, false) = false
  ) THEN
    UPDATE public.coletas_laboratorio AS c
       SET status = 'liberado'
     WHERE c.id = p_coleta_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_baixa_estoque(uuid, integer, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_baixa_estoque(uuid, integer, uuid, uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.liberar_resultados_laboratorio(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.liberar_resultados_laboratorio(uuid, uuid[]) TO authenticated;
