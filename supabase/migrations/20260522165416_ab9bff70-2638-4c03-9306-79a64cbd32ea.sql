
DO $$
DECLARE
  v_user_id uuid;
  v_clinica_id uuid;
  v_plano_id uuid := '9b3576cd-21b7-45b6-b95e-9ec76e61660c';
BEGIN
  -- Create auth user if not exists
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'devcriador1@gmail.com';

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'devcriador1@gmail.com', crypt('costagold', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"nome":"Dev Criador"}'::jsonb,
      '', '', '', ''
    );

    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_user_id, v_user_id::text,
      jsonb_build_object('sub', v_user_id::text, 'email', 'devcriador1@gmail.com', 'email_verified', true),
      'email', now(), now(), now());
  ELSE
    UPDATE auth.users SET encrypted_password = crypt('costagold', gen_salt('bf')), email_confirmed_at = COALESCE(email_confirmed_at, now()) WHERE id = v_user_id;
  END IF;

  -- Ensure clinica
  SELECT clinica_id INTO v_clinica_id FROM public.profiles WHERE id = v_user_id;
  IF v_clinica_id IS NULL THEN
    INSERT INTO public.clinicas (nome, owner_id) VALUES ('Clínica Dev Criador', v_user_id) RETURNING id INTO v_clinica_id;
  END IF;

  -- Ensure profile
  INSERT INTO public.profiles (id, nome, email, clinica_id)
  VALUES (v_user_id, 'Dev Criador', 'devcriador1@gmail.com', v_clinica_id)
  ON CONFLICT (id) DO UPDATE SET clinica_id = EXCLUDED.clinica_id, email = EXCLUDED.email;

  -- Admin role
  INSERT INTO public.user_roles (user_id, role) VALUES (v_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Cancel existing subs
  UPDATE public.assinaturas_plano SET status = 'cancelada' WHERE user_id = v_user_id AND status IN ('ativa','trial');

  -- Lifetime subscription
  INSERT INTO public.assinaturas_plano (user_id, plano_id, plano_slug, status, em_trial, data_inicio, data_fim)
  VALUES (v_user_id, v_plano_id, 'elolab-ultra', 'ativa', false, now(), now() + interval '100 years');
END $$;
