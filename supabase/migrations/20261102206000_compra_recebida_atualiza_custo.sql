-- Recebimento do pedido de compra atualiza o custo unitário do estoque.
--
-- A entrada no estoque não mexia em estoque.valor_unitario: o custo dos itens
-- (usado em valorização do estoque e margem) ficava no valor do cadastro.
-- Agora o recebimento grava o preço unitário do pedido como custo atual.
-- A conta a pagar continua sendo lançada pela tela de Compras, uma vez só.
-- Definição parte de 20261031121000_compras_cotacoes_pedidos.sql.
BEGIN;

CREATE OR REPLACE FUNCTION public.receber_pedido_compra(p_pedido_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica_id uuid := public.current_clinica_id();
  v_pedido public.pedidos_compra%ROWTYPE;
  v_fornecedor text;
  v_item record;
  v_entradas integer := 0;
BEGIN
  IF NOT public.pode_gerir_compras() OR v_clinica_id IS NULL THEN
    RAISE EXCEPTION 'Seu perfil não pode receber pedidos de compra.' USING ERRCODE = '42501';
  END IF;

  SELECT p.* INTO v_pedido
    FROM public.pedidos_compra p
   WHERE p.id = p_pedido_id AND p.clinica_id = v_clinica_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido de compra não encontrado nesta clínica.' USING ERRCODE = 'P0002';
  END IF;
  IF v_pedido.status = 'recebido' THEN
    RETURN jsonb_build_object(
      'pedido_id', v_pedido.id, 'ja_recebido', true, 'entradas', 0,
      'recebido_em', v_pedido.recebido_em
    );
  END IF;
  IF v_pedido.status <> 'emitido' THEN
    RAISE EXCEPTION 'Pedido cancelado não pode ser recebido.' USING ERRCODE = '55000';
  END IF;

  SELECT f.nome INTO v_fornecedor FROM public.fornecedores f WHERE f.id = v_pedido.fornecedor_id;

  FOR v_item IN
    SELECT i.id, i.estoque_id, i.quantidade, i.preco_unitario
      FROM public.pedido_compra_itens i
     WHERE i.pedido_id = v_pedido.id AND i.estoque_id IS NOT NULL
     ORDER BY i.estoque_id, i.id
  LOOP
    PERFORM public.registrar_movimentacao_estoque(
      v_item.estoque_id,
      'entrada',
      v_item.quantidade,
      left(format('Recebimento do pedido de compra %s (%s)', left(v_pedido.id::text, 8), COALESCE(v_fornecedor, 'fornecedor')), 500),
      v_item.id
    );
    -- Custo do item passa a ser o da última compra recebida (bonificação a
    -- preço zero não apaga o custo).
    IF v_item.preco_unitario > 0 THEN
      UPDATE public.estoque SET valor_unitario = v_item.preco_unitario
       WHERE id = v_item.estoque_id AND clinica_id = v_clinica_id;
    END IF;
    v_entradas := v_entradas + 1;
  END LOOP;

  PERFORM set_config('app.compras_rpc', 'on', true);
  UPDATE public.pedidos_compra
     SET status = 'recebido', recebido_por = auth.uid(), recebido_em = now()
   WHERE id = v_pedido.id
   RETURNING * INTO v_pedido;
  PERFORM set_config('app.compras_rpc', 'off', true);

  RETURN jsonb_build_object(
    'pedido_id', v_pedido.id, 'ja_recebido', false, 'entradas', v_entradas,
    'recebido_em', v_pedido.recebido_em
  );
END;
$$;

REVOKE ALL ON FUNCTION public.receber_pedido_compra(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receber_pedido_compra(uuid) TO authenticated;

COMMIT;
