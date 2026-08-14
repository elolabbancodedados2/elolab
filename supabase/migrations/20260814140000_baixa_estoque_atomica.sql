-- Baixa de estoque atômica e idempotente.
--
-- A movimentação e o saldo precisam ser gravados na mesma transação. O
-- bloqueio da linha (`FOR UPDATE`) também impede duas prescrições concorrentes
-- de consumirem o mesmo saldo lido antes por cada aba.

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

  -- A leitura com bloqueio serializa baixas concorrentes do mesmo item.
  SELECT * INTO v_item
    FROM public.estoque
   WHERE id = p_item_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item de estoque não encontrado';
  END IF;

  -- Autosave e duas abas podem tentar registrar a mesma baixa. Depois de
  -- adquirir o bloqueio, a segunda chamada enxerga a primeira e é no-op.
  IF p_prontuario_id IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.movimentacoes_estoque
     WHERE item_id = p_item_id
       AND prontuario_id = p_prontuario_id
       AND tipo = 'saida'
  ) THEN
    RETURN QUERY SELECT v_item.id, v_item.quantidade, v_item.quantidade, true;
    RETURN;
  END IF;

  IF v_item.quantidade < p_quantidade THEN
    RAISE EXCEPTION 'Estoque insuficiente: % disponível, % solicitado',
      v_item.quantidade, p_quantidade;
  END IF;

  UPDATE public.estoque
     SET quantidade = quantidade - p_quantidade
   WHERE id = p_item_id;

  INSERT INTO public.movimentacoes_estoque (
    item_id,
    tipo,
    quantidade,
    prontuario_id,
    motivo,
    usuario_id
  ) VALUES (
    p_item_id,
    'saida',
    p_quantidade,
    p_prontuario_id,
    p_motivo,
    p_usuario_id
  );

  RETURN QUERY SELECT
    v_item.id,
    v_item.quantidade,
    v_item.quantidade - p_quantidade,
    false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_baixa_estoque(uuid, integer, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_baixa_estoque(uuid, integer, uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.registrar_baixa_estoque(uuid, integer, uuid, uuid, text) IS
  'Debita estoque e registra movimentação na mesma transação; baixa por prontuário é idempotente.';
