-- Cadastra o item e registra o saldo de abertura no histórico na mesma transação.
CREATE OR REPLACE FUNCTION public.cadastrar_item_estoque(
  p_clinica_id uuid,
  p_nome text,
  p_categoria text,
  p_unidade text,
  p_quantidade integer,
  p_quantidade_minima integer,
  p_quantidade_maxima integer,
  p_ponto_pedido integer,
  p_valor_unitario numeric,
  p_valor_venda numeric,
  p_localizacao text,
  p_lote text,
  p_validade date,
  p_fornecedor text,
  p_descricao text,
  p_codigo_ean text,
  p_fabricante text,
  p_principio_ativo text,
  p_dosagem text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_item_id uuid;
BEGIN
  IF auth.uid() IS NULL OR p_clinica_id IS DISTINCT FROM public.get_my_clinica_id()
     OR NOT (public.is_admin(auth.uid()) OR public.is_enfermagem(auth.uid())) THEN
    RAISE EXCEPTION 'Você não tem permissão para cadastrar itens nesta clínica.';
  END IF;

  IF p_nome IS NULL OR trim(p_nome) = '' OR p_categoria IS NULL OR trim(p_categoria) = ''
     OR p_unidade IS NULL OR trim(p_unidade) = '' THEN
    RAISE EXCEPTION 'Informe nome, categoria e unidade do item.';
  END IF;
  IF p_quantidade IS NULL OR p_quantidade < 0 OR p_quantidade_minima IS NULL OR p_quantidade_minima < 0 THEN
    RAISE EXCEPTION 'Saldo inicial e estoque mínimo devem ser maiores ou iguais a zero.';
  END IF;
  IF p_quantidade_maxima IS NOT NULL AND (p_quantidade_maxima < 1 OR p_quantidade_maxima < p_quantidade) THEN
    RAISE EXCEPTION 'O estoque máximo deve ser maior ou igual ao saldo inicial.';
  END IF;
  IF p_ponto_pedido IS NOT NULL AND p_ponto_pedido < 1 THEN
    RAISE EXCEPTION 'O ponto de pedido deve ser maior que zero.';
  END IF;
  IF p_valor_unitario IS NULL OR p_valor_unitario < 0 OR p_valor_unitario > 99999999.99
     OR (p_valor_venda IS NOT NULL AND (p_valor_venda < 0 OR p_valor_venda > 99999999.99 OR p_valor_venda = 'NaN'::numeric)) THEN
    RAISE EXCEPTION 'Custo e preço de venda devem ser valores válidos iguais ou maiores que zero.';
  END IF;

  INSERT INTO public.estoque (
    clinica_id, nome, categoria, unidade, quantidade, quantidade_minima,
    quantidade_maxima, ponto_pedido, valor_unitario, valor_venda, localizacao,
    lote, validade, fornecedor, descricao, codigo_ean, fabricante,
    principio_ativo, dosagem
  ) VALUES (
    p_clinica_id, trim(p_nome), trim(p_categoria), trim(p_unidade), p_quantidade,
    p_quantidade_minima, p_quantidade_maxima, p_ponto_pedido, p_valor_unitario,
    p_valor_venda, NULLIF(trim(p_localizacao), ''), NULLIF(trim(p_lote), ''),
    p_validade, NULLIF(trim(p_fornecedor), ''), NULLIF(trim(p_descricao), ''),
    NULLIF(trim(p_codigo_ean), ''), NULLIF(trim(p_fabricante), ''),
    NULLIF(trim(p_principio_ativo), ''), NULLIF(trim(p_dosagem), '')
  ) RETURNING id INTO v_item_id;

  IF p_quantidade > 0 THEN
    INSERT INTO public.movimentacoes_estoque (
      item_id, clinica_id, tipo, quantidade, motivo, usuario_id
    ) VALUES (
      v_item_id, p_clinica_id, 'entrada', p_quantidade, 'Saldo de abertura', auth.uid()
    );
  END IF;

  RETURN v_item_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cadastrar_item_estoque(uuid, text, text, text, integer, integer, integer, integer, numeric, numeric, text, text, date, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cadastrar_item_estoque(uuid, text, text, text, integer, integer, integer, integer, numeric, numeric, text, text, date, text, text, text, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.cadastrar_item_estoque(uuid, text, text, text, integer, integer, integer, integer, numeric, numeric, text, text, date, text, text, text, text, text, text) IS
  'Cadastra um item e registra seu saldo inicial como entrada, na mesma transação e com escopo de clínica.';
