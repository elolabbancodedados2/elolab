-- Quota atômica mensal para chamadas concorrentes do assistente médico.
-- Reservas pendentes expiram em 24h, acima do limite máximo de execução das
-- Edge Functions (400s), para que uma chamada válida nunca perca sua reserva.
CREATE TABLE public.platform_ai_token_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  reserved_tokens integer NOT NULL CHECK (reserved_tokens > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'settled', 'released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  settled_at timestamptz
);

CREATE INDEX platform_ai_token_reservations_pending_idx
  ON public.platform_ai_token_reservations (clinica_id, created_at)
  WHERE status = 'pending';

ALTER TABLE public.platform_ai_token_reservations ENABLE ROW LEVEL SECURITY;
-- Sem policies: só as RPCs SECURITY DEFINER, executadas com service role, acessam a tabela.

CREATE OR REPLACE FUNCTION public.platform_ai_reserve_tokens(
  p_clinica_id uuid,
  p_tokens_reservados integer,
  p_limite_padrao integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit bigint;
  v_used bigint;
  v_reservation_id uuid;
  v_month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Acesso restrito';
  END IF;
  IF p_clinica_id IS NULL OR p_tokens_reservados IS NULL OR p_tokens_reservados < 1
     OR p_limite_padrao IS NULL OR p_limite_padrao < 0 THEN
    RAISE EXCEPTION 'Parâmetros inválidos para reserva de tokens';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clinicas WHERE id = p_clinica_id) THEN
    RAISE EXCEPTION 'Clínica não encontrada';
  END IF;

  -- Serializa todas as admissões e liquidações desta clínica.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_clinica_id::text, 0));
  -- A auditoria definitiva fica em platform_ai_usage; manter só a janela recente
  -- de reservas para evitar crescimento sem limite desta tabela operacional.
  DELETE FROM public.platform_ai_token_reservations
    WHERE clinica_id = p_clinica_id
      AND expires_at <= now() - interval '24 hours';

  SELECT coalesce(l.max_ai_tokens, ai.limite_mensal_clinica, p_limite_padrao)
    INTO v_limit
    FROM (SELECT 1) seed
    LEFT JOIN public.platform_tenant_limits l ON l.clinica_id = p_clinica_id
    LEFT JOIN public.platform_ai_config ai ON ai.id = true;

  SELECT
    coalesce((
      SELECT sum(u.input_tokens::bigint + u.output_tokens::bigint)
      FROM public.platform_ai_usage u
      WHERE u.clinica_id = p_clinica_id AND u.created_at >= v_month_start
    ), 0)
    + coalesce((
      SELECT sum(r.reserved_tokens::bigint)
      FROM public.platform_ai_token_reservations r
      WHERE r.clinica_id = p_clinica_id
        AND r.status = 'pending'
        AND r.created_at >= v_month_start
        AND r.expires_at > now()
    ), 0)
    INTO v_used;

  IF v_used + p_tokens_reservados > v_limit THEN
    RETURN jsonb_build_object('accepted', false, 'reservation_id', null, 'used', v_used, 'limit', v_limit);
  END IF;

  INSERT INTO public.platform_ai_token_reservations (clinica_id, reserved_tokens)
    VALUES (p_clinica_id, p_tokens_reservados)
    RETURNING id INTO v_reservation_id;
  RETURN jsonb_build_object('accepted', true, 'reservation_id', v_reservation_id, 'used', v_used, 'limit', v_limit);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_ai_settle_tokens(
  p_reservation_id uuid,
  p_clinica_id uuid,
  p_user_id uuid,
  p_operacao text,
  p_modelo text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_duracao_ms integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation public.platform_ai_token_reservations;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Acesso restrito';
  END IF;
  IF p_reservation_id IS NULL OR p_clinica_id IS NULL OR p_user_id IS NULL
     OR p_operacao IS NULL OR p_modelo IS NULL
     OR p_input_tokens IS NULL OR p_input_tokens < 0
     OR p_output_tokens IS NULL OR p_output_tokens < 0 THEN
    RAISE EXCEPTION 'Parâmetros inválidos para liquidação de tokens';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_clinica_id::text, 0));
  SELECT * INTO v_reservation
    FROM public.platform_ai_token_reservations
    WHERE id = p_reservation_id AND clinica_id = p_clinica_id
      AND status = 'pending' AND expires_at > now()
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva de tokens inexistente, expirada ou já encerrada';
  END IF;

  -- Manter o consumo de sucesso e a troca da reserva na mesma transação evita
  -- que outra chamada entre no intervalo entre liberar e contabilizar tokens.
  INSERT INTO public.platform_ai_usage (
    clinica_id, user_id, operacao, modelo, input_tokens, output_tokens,
    custo_estimado, duracao_ms, sucesso, created_at
  ) VALUES (
    p_clinica_id, p_user_id, p_operacao, p_modelo, p_input_tokens, p_output_tokens,
    p_input_tokens * 0.00000015 + p_output_tokens * 0.0000006,
    p_duracao_ms, true, v_reservation.created_at
  );
  UPDATE public.platform_ai_token_reservations
    SET status = 'settled', settled_at = now()
    WHERE id = p_reservation_id AND clinica_id = p_clinica_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_ai_release_tokens(
  p_reservation_id uuid,
  p_clinica_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Acesso restrito';
  END IF;
  IF p_reservation_id IS NULL OR p_clinica_id IS NULL THEN
    RAISE EXCEPTION 'Parâmetros inválidos para liberar reserva';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_clinica_id::text, 0));
  UPDATE public.platform_ai_token_reservations
    SET status = 'released'
    WHERE id = p_reservation_id AND clinica_id = p_clinica_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva de tokens inexistente ou já encerrada';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_ai_reserve_tokens(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_ai_settle_tokens(uuid, uuid, uuid, text, text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_ai_release_tokens(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_ai_reserve_tokens(uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_ai_settle_tokens(uuid, uuid, uuid, text, text, integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_ai_release_tokens(uuid, uuid) TO service_role;
