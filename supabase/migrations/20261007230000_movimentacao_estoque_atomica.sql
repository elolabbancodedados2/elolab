-- Serializa entradas e saídas manuais para manter saldo e histórico juntos.
CREATE OR REPLACE FUNCTION public.registrar_movimentacao_estoque(
  p_item_id uuid,
  p_tipo text,
  p_quantidade integer,
  p_motivo text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_item public.estoque%ROWTYPE;
  v_quantidade_nova integer;
BEGIN
  IF p_tipo IS NULL OR p_tipo NOT IN ('entrada', 'saida') THEN
    RAISE EXCEPTION 'Tipo de movimentação inválido.';
  END IF;
  IF p_quantidade IS NULL OR p_quantidade < 1 THEN
    RAISE EXCEPTION 'A quantidade deve ser um número inteiro maior que zero.';
  END IF;

  SELECT e.* INTO v_item
    FROM public.estoque AS e
   WHERE e.id = p_item_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado nesta clínica.';
  END IF;

  v_quantidade_nova := CASE
    WHEN p_tipo = 'entrada' THEN v_item.quantidade + p_quantidade
    ELSE v_item.quantidade - p_quantidade
  END;

  IF v_quantidade_nova < 0 THEN
    RAISE EXCEPTION 'Estoque insuficiente: % disponível, % solicitado.', v_item.quantidade, p_quantidade;
  END IF;
  IF v_item.quantidade_maxima IS NOT NULL AND v_quantidade_nova > v_item.quantidade_maxima THEN
    RAISE EXCEPTION 'A movimentação ultrapassa o estoque máximo de %.', v_item.quantidade_maxima;
  END IF;

  UPDATE public.estoque AS e
     SET quantidade = v_quantidade_nova
   WHERE e.id = p_item_id;

  INSERT INTO public.movimentacoes_estoque (
    item_id, clinica_id, tipo, quantidade, motivo, usuario_id
  ) VALUES (
    v_item.id, v_item.clinica_id, p_tipo, p_quantidade,
    NULLIF(trim(p_motivo), ''), auth.uid()
  );

  RETURN v_quantidade_nova;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_movimentacao_estoque(uuid, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_movimentacao_estoque(uuid, text, integer, text) TO authenticated;

COMMENT ON FUNCTION public.registrar_movimentacao_estoque(uuid, text, integer, text) IS
  'Atualiza saldo e registra entrada/saída na mesma transação, serializando movimentos concorrentes.';
