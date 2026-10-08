-- Checkout transparente dos planos do EloLab.
--
-- Cartão continua recorrente pela API de Assinaturas (/preapproval). Pix e
-- boleto são pagamentos únicos de um período na API de Orders: liberam acesso
-- até periodo_fim e não renovam sozinhos. Esta migration guarda esses pedidos
-- e aplica o pagamento de forma atômica, para que notificações repetidas não
-- estendam o período duas vezes.

ALTER TABLE public.assinaturas_plano
  ADD COLUMN IF NOT EXISTS cobranca_modalidade text;

ALTER TABLE public.assinaturas_plano
  DROP CONSTRAINT IF EXISTS assinaturas_plano_cobranca_modalidade_check;
ALTER TABLE public.assinaturas_plano
  ADD CONSTRAINT assinaturas_plano_cobranca_modalidade_check
  CHECK (cobranca_modalidade IS NULL OR cobranca_modalidade IN ('recorrente', 'pre_pago'));

COMMENT ON COLUMN public.assinaturas_plano.cobranca_modalidade IS
  'recorrente = assinatura no cartão (/preapproval); pre_pago = período pago por Pix/boleto (/v1/orders), válido até data_fim.';

CREATE TABLE IF NOT EXISTS public.platform_plan_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plano_id uuid NOT NULL REFERENCES public.planos(id),
  plano_slug text NOT NULL,
  metodo text NOT NULL CHECK (metodo IN ('pix', 'boleto')),
  valor numeric(12, 2) NOT NULL CHECK (valor > 0),
  periodo_meses integer NOT NULL CHECK (periodo_meses BETWEEN 1 AND 12),
  status text NOT NULL DEFAULT 'criando' CHECK (status IN (
    'criando', 'aguardando_pagamento', 'em_processamento', 'pago',
    'recusado', 'cancelado', 'expirado', 'estornado', 'erro'
  )),
  status_detail text,
  idempotency_key uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  mp_order_id text UNIQUE,
  mp_payment_id text,
  ticket_url text,
  qr_code text,
  qr_code_base64 text,
  digitable_line text,
  barcode_content text,
  expira_em timestamptz,
  pago_em timestamptz,
  periodo_inicio timestamptz,
  periodo_fim timestamptz,
  gateway_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  erro_mensagem text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Um pedido em aberto por conta: cliques repetidos não geram cobranças duplicadas.
CREATE UNIQUE INDEX IF NOT EXISTS platform_plan_orders_um_aberto_por_usuario
  ON public.platform_plan_orders (user_id)
  WHERE status IN ('criando', 'aguardando_pagamento', 'em_processamento');
CREATE INDEX IF NOT EXISTS platform_plan_orders_user_created_idx
  ON public.platform_plan_orders (user_id, created_at DESC);

ALTER TABLE public.platform_plan_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_plan_orders FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.platform_plan_orders TO authenticated;
GRANT ALL ON TABLE public.platform_plan_orders TO service_role;

DROP POLICY IF EXISTS platform_plan_orders_select ON public.platform_plan_orders;
CREATE POLICY platform_plan_orders_select
  ON public.platform_plan_orders
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin());

-- Aplica o status vindo do Mercado Pago (já consultado no servidor com o
-- access token). Só a transição para 'pago' libera acesso, e só uma vez.
CREATE OR REPLACE FUNCTION public.aplicar_status_pedido_plano(
  p_pedido_id uuid,
  p_status text,
  p_status_detail text,
  p_mp_payment_id text,
  p_snapshot jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pedido public.platform_plan_orders%ROWTYPE;
  v_plano public.assinaturas_plano%ROWTYPE;
  v_tem_plano boolean;
  v_inicio timestamptz;
  v_fim timestamptz;
BEGIN
  IF p_status NOT IN ('aguardando_pagamento', 'em_processamento', 'pago', 'recusado', 'cancelado', 'expirado', 'estornado') THEN
    RAISE EXCEPTION 'Status de pedido inválido: %', p_status;
  END IF;

  SELECT * INTO v_pedido FROM public.platform_plan_orders WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('aplicado', false, 'motivo', 'pedido_inexistente');
  END IF;

  IF v_pedido.status = 'estornado' THEN
    RETURN jsonb_build_object('aplicado', false, 'motivo', 'estado_final', 'status', v_pedido.status);
  END IF;

  IF v_pedido.status = 'pago' THEN
    IF p_status <> 'estornado' THEN
      RETURN jsonb_build_object('aplicado', false, 'motivo', 'ja_pago', 'status', 'pago', 'periodo_fim', v_pedido.periodo_fim);
    END IF;

    UPDATE public.platform_plan_orders
       SET status = 'estornado', status_detail = p_status_detail,
           gateway_snapshot = COALESCE(p_snapshot, gateway_snapshot), updated_at = now()
     WHERE id = v_pedido.id;

    -- Encerra o acesso se o período vigente foi liberado por este pedido.
    UPDATE public.assinaturas_plano
       SET status = 'cancelada', data_fim = now(), data_cancelamento = now(), updated_at = now()
     WHERE user_id = v_pedido.user_id
       AND cobranca_modalidade = 'pre_pago'
       AND status = 'ativa'
       AND data_fim = v_pedido.periodo_fim;

    RETURN jsonb_build_object('aplicado', true, 'status', 'estornado');
  END IF;

  IF p_status <> 'pago' THEN
    -- Notificações fora de ordem não reabrem um pedido já encerrado.
    IF v_pedido.status IN ('recusado', 'cancelado', 'expirado')
       AND p_status IN ('aguardando_pagamento', 'em_processamento') THEN
      RETURN jsonb_build_object('aplicado', false, 'motivo', 'estado_final', 'status', v_pedido.status);
    END IF;

    UPDATE public.platform_plan_orders
       SET status = p_status,
           status_detail = p_status_detail,
           mp_payment_id = COALESCE(p_mp_payment_id, mp_payment_id),
           gateway_snapshot = COALESCE(p_snapshot, gateway_snapshot),
           updated_at = now()
     WHERE id = v_pedido.id;
    RETURN jsonb_build_object('aplicado', true, 'status', p_status);
  END IF;

  -- Pagamento confirmado: libera o período. Renovação antecipada do mesmo
  -- plano soma ao período vigente; troca de plano começa agora.
  SELECT * INTO v_plano FROM public.assinaturas_plano WHERE user_id = v_pedido.user_id FOR UPDATE;
  v_tem_plano := FOUND;
  v_inicio := now();
  IF v_tem_plano
     AND v_plano.cobranca_modalidade = 'pre_pago'
     AND v_plano.status = 'ativa'
     AND v_plano.plano_id = v_pedido.plano_id
     AND v_plano.data_fim > now() THEN
    v_inicio := v_plano.data_fim;
  END IF;
  v_fim := v_inicio + make_interval(months => v_pedido.periodo_meses);

  IF v_tem_plano THEN
    UPDATE public.assinaturas_plano
       SET plano_id = v_pedido.plano_id,
           plano_slug = v_pedido.plano_slug,
           status = 'ativa',
           em_trial = false,
           trial_fim = NULL,
           data_fim = v_fim,
           data_cancelamento = NULL,
           mp_assinatura_id = NULL,
           cobranca_modalidade = 'pre_pago',
           updated_at = now()
     WHERE id = v_plano.id;
  ELSE
    INSERT INTO public.assinaturas_plano (
      user_id, plano_id, plano_slug, status, em_trial, data_inicio, data_fim, cobranca_modalidade
    ) VALUES (
      v_pedido.user_id, v_pedido.plano_id, v_pedido.plano_slug, 'ativa', false, now(), v_fim, 'pre_pago'
    );
  END IF;

  UPDATE public.platform_plan_orders
     SET status = 'pago',
         status_detail = p_status_detail,
         mp_payment_id = COALESCE(p_mp_payment_id, mp_payment_id),
         gateway_snapshot = COALESCE(p_snapshot, gateway_snapshot),
         pago_em = now(),
         periodo_inicio = v_inicio,
         periodo_fim = v_fim,
         updated_at = now()
   WHERE id = v_pedido.id;

  RETURN jsonb_build_object(
    'aplicado', true,
    'status', 'pago',
    'periodo_inicio', v_inicio,
    'periodo_fim', v_fim,
    'havia_recorrencia_ativa', v_tem_plano AND v_plano.mp_assinatura_id IS NOT NULL AND v_plano.status IN ('ativa', 'trial')
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.aplicar_status_pedido_plano(uuid, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_status_pedido_plano(uuid, text, text, text, jsonb) TO service_role;

-- Período pré-pago vencido vira 'expirada'; o bloqueio de escrita segue a
-- carência de clinica_acesso_bloqueado() a partir de data_fim.
CREATE OR REPLACE FUNCTION public.expirar_planos_pre_pagos()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total integer;
BEGIN
  UPDATE public.assinaturas_plano
     SET status = 'expirada', updated_at = now()
   WHERE cobranca_modalidade = 'pre_pago'
     AND status = 'ativa'
     AND data_fim IS NOT NULL
     AND data_fim <= now();
  GET DIAGNOSTICS v_total = ROW_COUNT;
  RETURN v_total;
END;
$function$;

REVOKE ALL ON FUNCTION public.expirar_planos_pre_pagos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expirar_planos_pre_pagos() TO service_role;

DO $migration$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'expire-prepaid-platform-plans' LIMIT 1;
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'expire-prepaid-platform-plans',
    '*/15 * * * *',
    'SELECT public.expirar_planos_pre_pagos();'
  );
END;
$migration$;
