-- Sinaliza webhooks repetidos e fora de ordem do Mercado Pago.
--
-- O estado final já era protegido: o handler relê o recurso no gateway e
-- aplicar_status_pedido_plano() não reabre pedido encerrado nem libera o
-- período duas vezes. Faltava registrar o que aconteceu:
--   * repeticoes / ultima_repeticao_em: entregas do mesmo event_id depois de
--     processado (contadas pelo claim, que continua respondendo 'processed');
--   * sinal_ordem: 'repetido' (não alterou um pedido encerrado) ou
--     'fora_de_ordem' (anunciava status diferente do atual no gateway), gravado
--     pela Edge Function ao confirmar o processamento.
-- Aditiva e idempotente.

ALTER TABLE public.mercadopago_webhook_logs
  ADD COLUMN IF NOT EXISTS repeticoes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultima_repeticao_em timestamptz,
  ADD COLUMN IF NOT EXISTS sinal_ordem text;

ALTER TABLE public.mercadopago_webhook_logs
  DROP CONSTRAINT IF EXISTS mercadopago_webhook_logs_sinal_ordem_check;
ALTER TABLE public.mercadopago_webhook_logs
  ADD CONSTRAINT mercadopago_webhook_logs_sinal_ordem_check
  CHECK (sinal_ordem IS NULL OR sinal_ordem IN ('repetido', 'fora_de_ordem'));

CREATE OR REPLACE FUNCTION public.claim_mercadopago_webhook(
  p_event_id text,
  p_event_type text,
  p_data_id text,
  p_payload jsonb,
  p_lease_seconds integer DEFAULT 300
) RETURNS TABLE (log_id uuid, claim_status text, claim_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_log public.mercadopago_webhook_logs%ROWTYPE;
  v_token uuid;
BEGIN
  IF p_event_id IS NULL OR length(p_event_id) = 0 THEN
    RAISE EXCEPTION 'event_id is required';
  END IF;

  INSERT INTO public.mercadopago_webhook_logs
    (event_type, event_id, data_id, payload, tentativas)
  VALUES
    (coalesce(nullif(p_event_type, ''), 'unknown'), p_event_id, p_data_id,
     coalesce(p_payload, '{}'::jsonb), 0)
  ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO NOTHING;

  SELECT * INTO v_log
    FROM public.mercadopago_webhook_logs
    WHERE event_id = p_event_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'webhook log could not be acquired';
  END IF;
  IF coalesce(v_log.processado, false) THEN
    UPDATE public.mercadopago_webhook_logs
       SET repeticoes = coalesce(repeticoes, 0) + 1,
           ultima_repeticao_em = now()
     WHERE id = v_log.id;
    RETURN QUERY SELECT v_log.id, 'processed'::text, NULL::uuid;
    RETURN;
  END IF;
  IF v_log.lease_until IS NOT NULL AND v_log.lease_until > now() THEN
    RETURN QUERY SELECT v_log.id, 'busy'::text, NULL::uuid;
    RETURN;
  END IF;

  v_token := gen_random_uuid();
  UPDATE public.mercadopago_webhook_logs
    SET claim_token = v_token,
        lease_until = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 300), 900))),
        tentativas = coalesce(tentativas, 0) + 1,
        event_type = coalesce(nullif(p_event_type, ''), event_type),
        data_id = coalesce(p_data_id, data_id),
        payload = coalesce(p_payload, payload),
        erro_mensagem = NULL
    WHERE id = v_log.id;

  RETURN QUERY SELECT v_log.id, 'claimed'::text, v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_mercadopago_webhook(text, text, text, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_mercadopago_webhook(text, text, text, jsonb, integer) TO service_role;

-- Mesmo conteúdo de 20261008220000, acrescido dos sinais nos webhooks.
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
    SELECT id, event_id, event_type, data_id, processado, tentativas, erro_mensagem, created_at,
           repeticoes, ultima_repeticao_em, sinal_ordem
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
      'webhooks_falha_24h', (SELECT count(*) FROM public.mercadopago_webhook_logs WHERE created_at >= now() - interval '24 hours' AND erro_mensagem IS NOT NULL),
      'webhooks_sinalizados_24h', (SELECT count(*) FROM public.mercadopago_webhook_logs
                                    WHERE (sinal_ordem IS NOT NULL AND created_at >= now() - interval '24 hours')
                                       OR ultima_repeticao_em >= now() - interval '24 hours')
    ),
    'subscriptions', coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.clinica_nome) FROM carteira c), '[]'::jsonb),
    'webhooks', coalesce((SELECT jsonb_agg(to_jsonb(w) ORDER BY w.created_at DESC) FROM webhooks w), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_billing_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_billing_overview() TO authenticated;
