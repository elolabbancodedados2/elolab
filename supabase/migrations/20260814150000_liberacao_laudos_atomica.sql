-- Liberação de resultados laboratoriais em uma única transação.
--
-- A tela pode liberar vários parâmetros do mesmo laudo. Se cada UPDATE for
-- independente, uma falha no meio deixa um laudo parcialmente publicado.
-- Esta função valida o trigger de conferência para todos os registros e só
-- muda a coleta para "liberado" quando não resta resultado pendente.

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

  -- Trava a coleta para serializar duas liberações simultâneas do mesmo laudo
  -- e faz a validação antes de tocar nos resultados.
  SELECT status INTO v_status_coleta
    FROM public.coletas_laboratorio
   WHERE id = p_coleta_id
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
      FROM public.resultados_laboratorio
     WHERE coleta_id = p_coleta_id
       AND id = ANY (p_resultado_ids)
  ) INTO v_tem_resultado;

  IF NOT v_tem_resultado THEN
    RAISE EXCEPTION 'Nenhum resultado pertence à coleta informada';
  END IF;

  -- A cláusula coleta_id impede que o cliente use a função para publicar um
  -- resultado de outra coleta. O UPDATE é atômico: se o trigger de conferência
  -- negar qualquer linha, toda a operação é revertida.
  RETURN QUERY
  UPDATE public.resultados_laboratorio
     SET liberado = true,
         data_liberacao = COALESCE(data_liberacao, now()),
         liberado_por = COALESCE(auth.uid(), liberado_por)
   WHERE coleta_id = p_coleta_id
     AND id = ANY (p_resultado_ids)
     AND COALESCE(liberado, false) = false
  RETURNING resultados_laboratorio.id;

  -- O status da coleta acompanha o lote na mesma transação. Se ainda houver
  -- outro resultado pendente, a coleta continua em "validado".
  IF NOT EXISTS (
    SELECT 1
      FROM public.resultados_laboratorio
     WHERE coleta_id = p_coleta_id
       AND COALESCE(liberado, false) = false
  ) THEN
    UPDATE public.coletas_laboratorio
       SET status = 'liberado'
     WHERE id = p_coleta_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.liberar_resultados_laboratorio(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.liberar_resultados_laboratorio(uuid, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.liberar_resultados_laboratorio(uuid, uuid[]) IS
  'Libera os resultados de uma coleta e atualiza seu status na mesma transação.';
