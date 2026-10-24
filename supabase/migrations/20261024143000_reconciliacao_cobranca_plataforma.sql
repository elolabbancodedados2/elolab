-- Reconciliação administrativa de cobrança divergente da assinatura EloLab.
--
-- Só a administração da plataforma, com justificativa de 10 a 500 caracteres,
-- e sempre com registro em audit_log (estado anterior, novo, resolução e
-- justificativa). Ajusta somente o registro local; não chama o Mercado Pago.
--   * pix_periodo em_processamento com valor_divergente:
--       'confirmar_pagamento' libera o período pela mesma função atômica do
--       webhook (uma única vez); 'cancelar' encerra o pedido sem liberar acesso.
--   * cartao_assinatura pendente sem ID no gateway:
--       'encerrar_tentativa' marca a tentativa como cancelada. Com ID no
--       gateway a reconciliação é recusada: o estado vem do webhook/gateway.
-- Não toca no financeiro clínico (pagamentos_mercadopago, lancamentos).

CREATE OR REPLACE FUNCTION public.platform_reconciliar_cobranca(
  p_origem text,
  p_id uuid,
  p_resolucao text,
  p_justificativa text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_justificativa text := btrim(coalesce(p_justificativa, ''));
  v_anterior text;
  v_novo text;
  v_resultado jsonb;
  v_pedido public.platform_plan_orders%ROWTYPE;
  v_tentativa public.assinaturas_mercadopago%ROWTYPE;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso restrito à administração da plataforma' USING ERRCODE = '42501';
  END IF;
  IF length(v_justificativa) < 10 OR length(v_justificativa) > 500 THEN
    RAISE EXCEPTION 'Informe uma justificativa de 10 a 500 caracteres' USING ERRCODE = '22023';
  END IF;

  IF p_origem = 'pix_periodo' THEN
    SELECT * INTO v_pedido FROM public.platform_plan_orders WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado' USING ERRCODE = 'P0002'; END IF;
    IF v_pedido.status <> 'em_processamento' OR coalesce(v_pedido.status_detail, '') <> 'valor_divergente' THEN
      RAISE EXCEPTION 'Este pedido não está divergente (status %)', v_pedido.status USING ERRCODE = '22023';
    END IF;
    v_anterior := v_pedido.status;
    IF p_resolucao = 'confirmar_pagamento' THEN
      v_resultado := public.aplicar_status_pedido_plano(p_id, 'pago', 'reconciliado_manual', NULL, NULL);
    ELSIF p_resolucao = 'cancelar' THEN
      v_resultado := public.aplicar_status_pedido_plano(p_id, 'cancelado', 'reconciliado_manual', NULL, NULL);
    ELSE
      RAISE EXCEPTION 'Resolução inválida para pedido Pix' USING ERRCODE = '22023';
    END IF;
    SELECT status INTO v_novo FROM public.platform_plan_orders WHERE id = p_id;

  ELSIF p_origem = 'cartao_assinatura' THEN
    SELECT * INTO v_tentativa
      FROM public.assinaturas_mercadopago
     WHERE id = p_id AND detalhes->>'checkout_type' = 'preapproval_card'
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tentativa não encontrada' USING ERRCODE = 'P0002'; END IF;
    IF p_resolucao <> 'encerrar_tentativa' THEN
      RAISE EXCEPTION 'Resolução inválida para tentativa no cartão' USING ERRCODE = '22023';
    END IF;
    IF v_tentativa.status <> 'pendente' OR v_tentativa.mp_preapproval_id IS NOT NULL THEN
      RAISE EXCEPTION 'Só tentativas pendentes sem assinatura no Mercado Pago podem ser encerradas aqui' USING ERRCODE = '22023';
    END IF;
    v_anterior := v_tentativa.status;
    v_novo := 'cancelada';
    UPDATE public.assinaturas_mercadopago
       SET status = v_novo,
           detalhes = coalesce(detalhes, '{}'::jsonb) || jsonb_build_object(
             'reconciliacao_resolucao', p_resolucao,
             'reconciliado_em', now(),
             'reconciliado_por', auth.uid()
           ),
           updated_at = now()
     WHERE id = p_id;
    v_resultado := jsonb_build_object('aplicado', true, 'status', v_novo);
  ELSE
    RAISE EXCEPTION 'Origem de cobrança inválida' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.audit_log (user_id, action, collection, record_id, changes)
  VALUES (
    auth.uid(),
    'PLATFORM_BILLING_RECONCILED',
    CASE WHEN p_origem = 'pix_periodo' THEN 'platform_plan_orders' ELSE 'assinaturas_mercadopago' END,
    p_id::text,
    jsonb_build_object(
      'origem', p_origem,
      'resolucao', p_resolucao,
      'justificativa', v_justificativa,
      'status_anterior', v_anterior,
      'status_novo', v_novo,
      'resultado', v_resultado
    )
  );

  RETURN jsonb_build_object('status_anterior', v_anterior, 'status_novo', v_novo, 'resultado', v_resultado);
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_reconciliar_cobranca(text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_reconciliar_cobranca(text, uuid, text, text) TO authenticated;

-- Trilha das reconciliações para o painel da plataforma.
CREATE OR REPLACE FUNCTION public.platform_reconciliacoes_cobranca(p_limit integer DEFAULT 50)
RETURNS TABLE (id uuid, record_id text, origem text, resolucao text, justificativa text, status_anterior text, status_novo text, autor_email text, criado_em timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso restrito à administração da plataforma' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT a.id, a.record_id, a.changes->>'origem', a.changes->>'resolucao', a.changes->>'justificativa',
         a.changes->>'status_anterior', a.changes->>'status_novo', p.email::text, a."timestamp"
    FROM public.audit_log a
    LEFT JOIN public.profiles p ON p.id = a.user_id
   WHERE a.action = 'PLATFORM_BILLING_RECONCILED'
   ORDER BY a."timestamp" DESC NULLS LAST
   LIMIT LEAST(GREATEST(coalesce(p_limit, 50), 1), 200);
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_reconciliacoes_cobranca(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_reconciliacoes_cobranca(integer) TO authenticated;
