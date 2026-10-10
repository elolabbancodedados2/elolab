BEGIN;

ALTER TABLE public.mercadopago_point_orders
  DROP CONSTRAINT IF EXISTS mercadopago_point_orders_payment_sync_status_check;
ALTER TABLE public.mercadopago_point_orders
  ADD CONSTRAINT mercadopago_point_orders_payment_sync_status_check
  CHECK (payment_sync_status IN ('aguardando','registrado','pendente_caixa','falha','estornado'));

-- Concilia uma order Point já confirmada pelo backend com o livro financeiro
-- da clínica. O cliente nunca pode chamar esta função diretamente.
CREATE OR REPLACE FUNCTION public.registrar_pagamento_mercadopago_point(p_point_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.mercadopago_point_orders%ROWTYPE;
  v_bill public.lancamentos%ROWTYPE;
  v_paid numeric(12,2);
  v_due numeric(12,2);
  v_method text;
  v_existing uuid;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Acesso restrito ao reconciliador Mercado Pago.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_order
  FROM public.mercadopago_point_orders
  WHERE id = p_point_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order Point não encontrada.'; END IF;
  IF v_order.payment_sync_status = 'registrado' THEN
    RETURN jsonb_build_object('status', 'registrado', 'repetido', true);
  END IF;
  IF v_order.status <> 'processed' OR v_order.mp_payment_id IS NULL THEN
    RAISE EXCEPTION 'A order Point ainda não tem pagamento acreditado.';
  END IF;

  SELECT id INTO v_existing FROM public.pagamentos
  WHERE chave_idempotencia = v_order.idempotency_key;
  IF FOUND THEN
    UPDATE public.mercadopago_point_orders
       SET payment_sync_status = 'registrado', payment_sync_error = NULL, updated_at = now()
     WHERE id = v_order.id;
    RETURN jsonb_build_object('status', 'registrado', 'repetido', true);
  END IF;

  SELECT * INTO v_bill
  FROM public.lancamentos
  WHERE id = v_order.lancamento_id AND clinica_id = v_order.clinica_id
  FOR UPDATE;
  IF NOT FOUND OR v_bill.status IN ('cancelado', 'estornado') THEN
    UPDATE public.mercadopago_point_orders
       SET payment_sync_status = 'falha', payment_sync_error = 'A cobrança local foi cancelada ou removida.', updated_at = now()
     WHERE id = v_order.id;
    RETURN jsonb_build_object('status', 'falha', 'error', 'A cobrança local foi cancelada ou removida.');
  END IF;

  PERFORM 1 FROM public.caixa_diario
  WHERE clinica_id = v_order.clinica_id
    AND data = (now() AT TIME ZONE 'America/Sao_Paulo')::date
    AND aberto IS TRUE
  FOR SHARE;
  IF NOT FOUND THEN
    UPDATE public.mercadopago_point_orders
       SET payment_sync_status = 'pendente_caixa',
           payment_sync_error = 'Pagamento confirmado no terminal; abra o caixa de hoje para incluí-lo no financeiro.',
           updated_at = now()
     WHERE id = v_order.id;
    RETURN jsonb_build_object('status', 'pendente_caixa');
  END IF;

  SELECT coalesce(sum(valor), 0) INTO v_paid
  FROM public.pagamentos
  WHERE lancamento_id = v_order.lancamento_id AND estornado_em IS NULL;
  v_due := v_bill.valor - coalesce(v_bill.desconto, 0) + coalesce(v_bill.acrescimo, 0) - v_paid;
  IF v_order.valor > v_due + 0.009 THEN
    UPDATE public.mercadopago_point_orders
       SET payment_sync_status = 'falha',
           payment_sync_error = 'O saldo local mudou e é menor que o valor já pago no terminal; requer conferência manual.',
           updated_at = now()
     WHERE id = v_order.id;
    RETURN jsonb_build_object('status', 'falha', 'error', 'O saldo local mudou e é menor que o valor já pago no terminal.');
  END IF;

  v_method := CASE v_order.payment_method
    WHEN 'credito' THEN 'credito'
    WHEN 'debito' THEN 'debito'
    WHEN 'pix' THEN 'pix'
    WHEN 'boleto' THEN 'boleto'
    ELSE 'transferencia'
  END;

  INSERT INTO public.pagamentos (
    lancamento_id, clinica_id, forma_pagamento, valor, parcelas,
    data_pagamento, recebido_por, observacoes, chave_idempotencia
  ) VALUES (
    v_order.lancamento_id, v_order.clinica_id, v_method, v_order.valor, 1,
    coalesce(v_order.paid_at, now()), v_order.created_by,
    concat('Mercado Pago Point · Order ', v_order.mp_order_id, ' · Payment ', v_order.mp_payment_id),
    v_order.idempotency_key
  );

  UPDATE public.mercadopago_point_orders
     SET payment_sync_status = 'registrado', payment_sync_error = NULL, updated_at = now()
   WHERE id = v_order.id;
  RETURN jsonb_build_object('status', 'registrado', 'repetido', false, 'valor', v_order.valor);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_pagamento_mercadopago_point(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pagamento_mercadopago_point(uuid) TO service_role;

-- O webhook de order.refunded precisa desfazer o recebimento no mesmo livro
-- financeiro, mantendo a trilha de auditoria e recalculando o saldo da conta.
CREATE OR REPLACE FUNCTION public.estornar_pagamento_mercadopago_point(p_point_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.mercadopago_point_orders%ROWTYPE;
  v_payment public.pagamentos%ROWTYPE;
  v_found_payment boolean := false;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Acesso restrito ao reconciliador Mercado Pago.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_order FROM public.mercadopago_point_orders
  WHERE id = p_point_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order Point não encontrada.'; END IF;
  IF v_order.status <> 'refunded' THEN RAISE EXCEPTION 'O Mercado Pago ainda não confirmou o estorno.'; END IF;
  IF v_order.payment_sync_status = 'estornado' THEN
    RETURN jsonb_build_object('status', 'estornado', 'repetido', true);
  END IF;

  SELECT * INTO v_payment FROM public.pagamentos
  WHERE chave_idempotencia = v_order.idempotency_key FOR UPDATE;
  v_found_payment := FOUND;
  IF FOUND AND v_payment.estornado_em IS NULL THEN
    UPDATE public.pagamentos
       SET estornado_em = now(),
           motivo_estorno = concat('Estorno confirmado pelo Mercado Pago Point. Order ', v_order.mp_order_id, ' · Payment ', v_order.mp_payment_id)
     WHERE id = v_payment.id;
  END IF;

  UPDATE public.mercadopago_point_orders
     SET payment_sync_status = 'estornado', payment_sync_error = NULL, updated_at = now()
   WHERE id = v_order.id;
  RETURN jsonb_build_object('status', 'estornado', 'repetido', false, 'pagamento_localizado', v_found_payment);
END;
$$;

REVOKE ALL ON FUNCTION public.estornar_pagamento_mercadopago_point(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.estornar_pagamento_mercadopago_point(uuid) TO service_role;

COMMIT;
