-- Checkout de novos assinantes: perfil pendente ate a confirmacao do gateway,
-- provisionamento idempotente e nenhuma concessao de trial sem cartao autorizado.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _clinica_id uuid;
  _is_invite boolean;
  _tem_convite boolean;
  _checkout boolean;
  _nome text;
BEGIN
  _nome := COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
  _is_invite := (NEW.raw_user_meta_data->>'invite_token') IS NOT NULL;
  _checkout := NEW.raw_user_meta_data->>'checkout_flow' = 'saas_subscription'
    AND COALESCE(NEW.raw_user_meta_data->>'checkout_plan_slug', '') <> '';

  SELECT EXISTS (
    SELECT 1 FROM public.convites_funcionario c
     WHERE lower(c.email) = lower(NEW.email) AND c.accepted_at IS NULL AND c.expires_at > now()
    UNION ALL
    SELECT 1 FROM public.employee_invitations e
     WHERE lower(e.email) = lower(NEW.email) AND e.status = 'pending' AND e.expires_at > now()
  ) INTO _tem_convite;

  IF _is_invite OR _tem_convite OR _checkout THEN
    INSERT INTO public.profiles (id, nome, email, telefone, cpf_cnpj)
    VALUES (NEW.id, _nome, NEW.email, NEW.raw_user_meta_data->>'telefone', NEW.raw_user_meta_data->>'cpf_cnpj');
  ELSE
    INSERT INTO public.clinicas (id, nome, owner_id)
    VALUES (gen_random_uuid(), 'Clínica de ' || _nome, NEW.id)
    RETURNING id INTO _clinica_id;
    INSERT INTO public.profiles (id, nome, email, telefone, cpf_cnpj, clinica_id)
    VALUES (NEW.id, _nome, NEW.email, NEW.raw_user_meta_data->>'telefone', NEW.raw_user_meta_data->>'cpf_cnpj', _clinica_id);
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END;
$$;

-- O trigger antigo provisionava qualquer INSERT de assinatura, inclusive pendente.
DROP TRIGGER IF EXISTS trg_auto_provision_subscriber ON public.assinaturas_plano;

-- WhatsApp continua disponível no onboarding, mas não impede uma clínica
-- pequena de operar. Serviços, disponibilidade, equipe e primeiro agendamento
-- são as quatro etapas necessárias para marcar a preparação como concluída.
CREATE OR REPLACE FUNCTION public.clinic_onboarding_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinica uuid := public.current_clinica_id();
  v_team_count integer;
  v_clinic_schedule_count integer;
  v_available_doctors_count integer;
  v_service_count integer;
  v_whatsapp_count integer;
  v_appointment_count integer;
  v_completed integer;
  v_is_complete boolean;
  v_completed_at timestamptz;
BEGIN
  IF v_clinica IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso restrito ao administrador da clínica';
  END IF;

  SELECT count(*)::integer INTO v_team_count
    FROM public.profiles p
   WHERE p.clinica_id = v_clinica AND p.ativo AND p.id <> auth.uid()
     AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id);
  SELECT count(*)::integer INTO v_clinic_schedule_count
    FROM public.configuracoes_clinica c
   WHERE c.clinica_id = v_clinica AND c.chave = 'config_clinica'
     AND nullif(c.valor ->> 'horarioAbertura', '') IS NOT NULL
     AND nullif(c.valor ->> 'horarioFechamento', '') IS NOT NULL
     AND CASE WHEN jsonb_typeof(c.valor -> 'diasFuncionamento') = 'array'
       THEN jsonb_array_length(c.valor -> 'diasFuncionamento') > 0 ELSE false END;
  SELECT count(DISTINCT m.id)::integer INTO v_available_doctors_count
    FROM public.medicos m JOIN public.medico_disponibilidade md ON md.medico_id = m.id
   WHERE m.clinica_id = v_clinica AND m.ativo AND md.ativo IS TRUE
     AND md.dia_semana BETWEEN 0 AND 6 AND md.duracao_consulta > 0
     AND md.intervalo_consultas >= 0 AND md.hora_inicio < md.hora_fim
     AND extract(epoch FROM (md.hora_fim - md.hora_inicio)) >= md.duracao_consulta * 60;
  SELECT count(*)::integer INTO v_service_count FROM public.tipos_consulta t
   WHERE t.clinica_id = v_clinica AND coalesce(t.ativo, true);
  SELECT count(*)::integer INTO v_whatsapp_count FROM public.whatsapp_sessions w
   WHERE w.clinica_id = v_clinica AND lower(coalesce(w.status, '')) IN ('connected', 'conectado', 'open');
  SELECT count(*)::integer INTO v_appointment_count FROM public.agendamentos a WHERE a.clinica_id = v_clinica;

  v_completed := (CASE WHEN v_team_count > 0 THEN 1 ELSE 0 END)
    + (CASE WHEN v_clinic_schedule_count > 0 AND v_available_doctors_count > 0 THEN 1 ELSE 0 END)
    + (CASE WHEN v_service_count > 0 THEN 1 ELSE 0 END)
    + (CASE WHEN v_appointment_count > 0 THEN 1 ELSE 0 END);
  v_is_complete := v_completed = 4;

  INSERT INTO public.clinic_onboarding_state (clinica_id, last_opened_at, completed_at, updated_by)
  VALUES (v_clinica, now(), CASE WHEN v_is_complete THEN now() END, auth.uid())
  ON CONFLICT (clinica_id) DO UPDATE SET last_opened_at = now(),
    completed_at = CASE WHEN v_is_complete THEN coalesce(clinic_onboarding_state.completed_at, now()) ELSE null END,
    updated_by = auth.uid()
  RETURNING completed_at INTO v_completed_at;

  RETURN jsonb_build_object(
    'clinica_id', v_clinica, 'completed_steps', v_completed, 'total_steps', 4,
    'progress', v_completed * 25, 'completed_at', v_completed_at,
    'steps', jsonb_build_array(
      jsonb_build_object('key', 'team', 'complete', v_team_count > 0, 'count', v_team_count),
      jsonb_build_object('key', 'schedule', 'complete', v_clinic_schedule_count > 0 AND v_available_doctors_count > 0, 'count', v_available_doctors_count),
      jsonb_build_object('key', 'services', 'complete', v_service_count > 0, 'count', v_service_count),
      jsonb_build_object('key', 'whatsapp', 'complete', v_whatsapp_count > 0, 'count', v_whatsapp_count),
      jsonb_build_object('key', 'appointment', 'complete', v_appointment_count > 0, 'count', v_appointment_count)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.provision_clinic_after_subscription(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_clinic_id uuid;
  v_authorized boolean;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil do assinante não encontrado'; END IF;
  IF v_profile.clinica_id IS NOT NULL THEN
    RETURN jsonb_build_object('created', false, 'clinica_id', v_profile.clinica_id);
  END IF;
  IF EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = p_user_id AND ativo = true) THEN
    RAISE EXCEPTION 'Conta da plataforma não pode ser provisionada como clínica';
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.assinaturas_plano ap
      JOIN public.assinaturas_mercadopago amp ON amp.id = ap.mp_assinatura_id
     WHERE ap.user_id = p_user_id
       AND ap.status IN ('trial', 'ativa')
       AND ap.cobranca_modalidade = 'recorrente'
       AND ap.mp_assinatura_id IS NOT NULL
       AND amp.status = 'ativa'
       AND amp.detalhes->>'preapproval_status' = 'authorized'
    UNION ALL
    SELECT 1
      FROM public.assinaturas_plano ap
      JOIN public.platform_plan_orders po ON po.user_id = ap.user_id
       AND po.plano_id = ap.plano_id AND po.status = 'pago'
     WHERE ap.user_id = p_user_id AND ap.status = 'ativa'
       AND ap.cobranca_modalidade = 'pre_pago' AND ap.data_fim > now()
  ) INTO v_authorized;

  IF NOT v_authorized THEN RAISE EXCEPTION 'Nenhuma assinatura válida confirmada para esta conta'; END IF;

  INSERT INTO public.clinicas (id, nome, owner_id)
  VALUES (gen_random_uuid(), 'Clínica de ' || COALESCE(NULLIF(v_profile.nome, ''), 'novo cliente'), p_user_id)
  RETURNING id INTO v_clinic_id;
  UPDATE public.profiles SET clinica_id = v_clinic_id WHERE id = p_user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (p_user_id, 'admin') ON CONFLICT (user_id, role) DO NOTHING;
  INSERT INTO public.audit_log (user_id, action, collection, record_id, record_name, changes)
  VALUES (p_user_id, 'create', 'clinicas', v_clinic_id::text, 'Clínica provisionada após confirmação da assinatura',
          jsonb_build_object('source', 'subscription_checkout', 'owner_id', p_user_id));
  RETURN jsonb_build_object('created', true, 'clinica_id', v_clinic_id);
END;
$$;

REVOKE ALL ON FUNCTION public.provision_clinic_after_subscription(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_clinic_after_subscription(uuid) TO service_role;

-- A antiga ativação por código não pode mais criar trials sem cartão. Compras
-- legadas já confirmadas continuam podendo ativar por esse caminho.
CREATE OR REPLACE FUNCTION public.activate_public_registration(_user_id uuid, _codigo_convite text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_registro RECORD;
  v_plano RECORD;
  v_gateway_id uuid;
  v_subscription_id uuid;
BEGIN
  IF auth.uid() IS NULL OR (_user_id <> auth.uid() AND NOT public.is_platform_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário não autorizado.');
  END IF;
  SELECT * INTO v_registro FROM public.registros_pendentes
   WHERE codigo_convite = _codigo_convite AND status IN ('pendente', 'pago') AND expires_at > now() LIMIT 1;
  IF v_registro IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Código inválido ou expirado.'); END IF;
  IF v_registro.status <> 'pago' THEN
    RETURN jsonb_build_object('success', false, 'error', 'O teste gratuito exige cartão e autorização da assinatura. Inicie a contratação pela página de planos.');
  END IF;
  SELECT * INTO v_plano FROM public.planos WHERE slug = v_registro.plano_slug AND ativo = true;
  IF v_plano IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Plano não encontrado.'); END IF;
  SELECT id INTO v_gateway_id FROM public.assinaturas_mercadopago
   WHERE detalhes->>'registro_pendente_id' = v_registro.id::text OR detalhes->>'checkout_reference' = v_registro.id::text
   ORDER BY created_at DESC LIMIT 1;
  UPDATE public.registros_pendentes SET status = 'ativado', user_id = _user_id, activated_at = now() WHERE id = v_registro.id;
  UPDATE public.assinaturas_mercadopago SET detalhes = coalesce(detalhes, '{}'::jsonb) || jsonb_build_object('user_id', _user_id), updated_at = now() WHERE id = v_gateway_id;
  IF EXISTS (SELECT 1 FROM public.assinaturas_plano WHERE user_id = _user_id AND status IN ('ativa', 'trial')) THEN
    RETURN jsonb_build_object('success', true, 'message', 'Assinatura já existe.', 'plano_nome', v_plano.nome);
  END IF;
  INSERT INTO public.assinaturas_plano (user_id, plano_id, plano_slug, status, em_trial, mp_assinatura_id, data_inicio, cobranca_modalidade)
  VALUES (_user_id, v_plano.id, v_plano.slug, 'ativa', false, v_gateway_id, now(), 'recorrente')
  RETURNING id INTO v_subscription_id;
  RETURN jsonb_build_object('success', true, 'mode', 'paid', 'subscription_id', v_subscription_id, 'plano_nome', v_plano.nome);
END;
$$;

REVOKE ALL ON FUNCTION public.start_free_trial(uuid, text) FROM PUBLIC, anon, authenticated;

-- Trial fixo para todos os planos, sem tocar em assinaturas ou dados existentes.
UPDATE public.planos SET trial_dias = 3 WHERE ativo = true AND trial_dias IS DISTINCT FROM 3;
