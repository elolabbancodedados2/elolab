-- A situação registrada como ativa não basta para o MRR se o período já venceu.
CREATE OR REPLACE FUNCTION public.platform_billing_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso restrito à administração da plataforma';
  END IF;

  WITH carteira AS (
    SELECT
      c.id AS clinica_id,
      c.nome AS clinica_nome,
      p.email AS dono_email,
      ap.id AS assinatura_id,
      ap.status AS assinatura_status,
      ap.em_trial,
      ap.data_fim,
      ap.trial_fim,
      pl.nome AS plano_nome,
      pl.valor AS plano_valor,
      am.status AS mp_status,
      am.proximo_pagamento,
      am.mp_preapproval_id,
      CASE
        WHEN ap.id IS NULL OR ap.status IN ('cancelada', 'expirada') THEN false
        WHEN coalesce(ap.em_trial, false) AND coalesce(ap.trial_fim, ap.data_fim) < now() THEN true
        WHEN NOT coalesce(ap.em_trial, false) AND coalesce(ap.data_fim, ap.trial_fim) < now() THEN true
        ELSE false
      END AS vencida
    FROM public.clinicas c
    LEFT JOIN public.profiles p ON p.id = c.owner_id
    LEFT JOIN public.assinaturas_plano ap ON ap.user_id = c.owner_id
    LEFT JOIN public.planos pl ON pl.id = ap.plano_id
    LEFT JOIN public.assinaturas_mercadopago am ON am.id = ap.mp_assinatura_id
    WHERE NOT coalesce(c.arquivada, false)
  ), webhooks AS (
    SELECT id, event_id, event_type, data_id, processado, tentativas, erro_mensagem, created_at
      FROM public.mercadopago_webhook_logs
     ORDER BY created_at DESC
     LIMIT 100
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'metrics', jsonb_build_object(
      'mrr', coalesce((SELECT sum(plano_valor) FROM carteira WHERE assinatura_status = 'ativa' AND NOT coalesce(em_trial, false) AND NOT vencida), 0),
      'ativas', (SELECT count(*) FROM carteira WHERE assinatura_status = 'ativa' AND NOT coalesce(em_trial, false) AND NOT vencida),
      'trials', (SELECT count(*) FROM carteira WHERE (coalesce(em_trial, false) OR assinatura_status = 'trial') AND NOT vencida),
      'vencidas', (SELECT count(*) FROM carteira WHERE vencida),
      'sem_assinatura', (SELECT count(*) FROM carteira WHERE assinatura_id IS NULL),
      'webhooks_pendentes', (SELECT count(*) FROM public.mercadopago_webhook_logs WHERE NOT coalesce(processado, false)),
      'webhooks_falha_24h', (SELECT count(*) FROM public.mercadopago_webhook_logs WHERE created_at >= now() - interval '24 hours' AND erro_mensagem IS NOT NULL)
    ),
    'subscriptions', coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.clinica_nome) FROM carteira c), '[]'::jsonb),
    'webhooks', coalesce((SELECT jsonb_agg(to_jsonb(w) ORDER BY w.created_at DESC) FROM webhooks w), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_billing_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_billing_overview() TO authenticated;
