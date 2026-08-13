-- Fecha os atalhos antigos de trial e vincula o checkout recorrente ao usuário
-- somente depois que o cadastro público foi ativado.

CREATE OR REPLACE FUNCTION public.activate_public_registration(
  _user_id uuid,
  _codigo_convite text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_registro RECORD;
  v_plano RECORD;
  v_gateway_id uuid;
  v_trial_end timestamptz;
  v_subscription_id uuid;
BEGIN
  IF auth.uid() IS NULL
     OR (_user_id <> auth.uid() AND NOT public.is_platform_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário não autorizado.');
  END IF;

  SELECT *
    INTO v_registro
    FROM public.registros_pendentes
   WHERE codigo_convite = _codigo_convite
     AND status IN ('pendente', 'pago')
     AND expires_at > now()
   LIMIT 1;

  IF v_registro IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Código de convite inválido, expirado ou já utilizado.'
    );
  END IF;

  SELECT *
    INTO v_plano
    FROM public.planos
   WHERE slug = v_registro.plano_slug
     AND ativo = true;

  IF v_plano IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plano não encontrado.');
  END IF;

  SELECT amp.id
    INTO v_gateway_id
    FROM public.assinaturas_mercadopago amp
   WHERE amp.detalhes->>'registro_pendente_id' = v_registro.id::text
      OR amp.detalhes->>'checkout_reference' = v_registro.id::text
   ORDER BY amp.created_at DESC
   LIMIT 1;

  UPDATE public.registros_pendentes
     SET status = 'ativado',
         user_id = _user_id,
         activated_at = now()
   WHERE id = v_registro.id;

  UPDATE public.assinaturas_mercadopago
     SET detalhes = coalesce(detalhes, '{}'::jsonb) ||
                    jsonb_build_object('user_id', _user_id),
         updated_at = now()
   WHERE id = v_gateway_id;

  IF EXISTS (
    SELECT 1
      FROM public.assinaturas_plano
     WHERE user_id = _user_id
       AND status IN ('ativa', 'trial')
  ) THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Assinatura já existe.',
      'plano_nome', v_plano.nome
    );
  END IF;

  IF v_registro.status = 'pago' THEN
    INSERT INTO public.assinaturas_plano (
      user_id, plano_id, plano_slug, status, em_trial,
      mp_assinatura_id, data_inicio
    )
    VALUES (
      _user_id, v_plano.id, v_plano.slug, 'ativa', false,
      v_gateway_id, now()
    )
    RETURNING id INTO v_subscription_id;

    RETURN jsonb_build_object(
      'success', true,
      'mode', 'paid',
      'subscription_id', v_subscription_id,
      'plano_nome', v_plano.nome
    );
  END IF;

  v_trial_end := now() + (coalesce(v_plano.trial_dias, 3) || ' days')::interval;

  INSERT INTO public.assinaturas_plano (
    user_id, plano_id, plano_slug, status, em_trial,
    trial_fim, data_inicio, data_fim
  )
  VALUES (
    _user_id, v_plano.id, v_plano.slug, 'trial', true,
    v_trial_end, now(), v_trial_end
  )
  RETURNING id INTO v_subscription_id;

  RETURN jsonb_build_object(
    'success', true,
    'mode', 'trial',
    'subscription_id', v_subscription_id,
    'trial_end', v_trial_end,
    'plano_nome', v_plano.nome
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.start_free_trial(
  _user_id uuid,
  _plano_slug text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plano RECORD;
  v_existing RECORD;
  v_trial_end timestamptz;
  v_subscription_id uuid;
BEGIN
  IF auth.uid() IS NULL
     OR (_user_id <> auth.uid() AND NOT public.is_platform_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário não autorizado.');
  END IF;

  SELECT *
    INTO v_existing
    FROM public.assinaturas_plano
   WHERE user_id = _user_id
     AND (status IN ('ativa', 'trial') OR em_trial = true)
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Você já possui uma assinatura ativa ou já utilizou o período de teste.'
    );
  END IF;

  SELECT *
    INTO v_plano
    FROM public.planos
   WHERE slug = lower(trim(_plano_slug))
     AND ativo = true;

  IF v_plano IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plano não encontrado.');
  END IF;

  v_trial_end := now() + (coalesce(v_plano.trial_dias, 3) || ' days')::interval;

  INSERT INTO public.assinaturas_plano (
    user_id, plano_id, plano_slug, status, em_trial,
    trial_fim, data_inicio, data_fim
  )
  VALUES (
    _user_id, v_plano.id, v_plano.slug, 'trial', true,
    v_trial_end, now(), v_trial_end
  )
  RETURNING id INTO v_subscription_id;

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', v_subscription_id,
    'trial_end', v_trial_end,
    'plano_nome', v_plano.nome
  );
END;
$$;
