-- Revoga a conta administrativa de desenvolvimento exposta em migration antiga.
-- Preserva perfil, clinica, assinatura e demais dados para auditoria.
DO $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower('devcriador1@gmail.com');

  IF v_user_id IS NOT NULL THEN
    UPDATE auth.users
    SET encrypted_password = crypt(encode(gen_random_bytes(32), 'hex'), gen_salt('bf')),
        banned_until = now() + interval '100 years',
        updated_at = now()
    WHERE id = v_user_id;

    DELETE FROM public.user_roles
    WHERE user_id = v_user_id AND role = 'admin';

    UPDATE public.assinaturas_plano
    SET status = 'cancelada', em_trial = false, data_fim = now()
    WHERE user_id = v_user_id AND status IN ('ativa', 'trial');
  END IF;

  -- Remove também uma concessão antiga pelo ID que aparecia em outra migration.
  DELETE FROM public.user_roles
  WHERE user_id = 'ad27a18e-d836-4c23-8ba0-899772c6f70f'::uuid
    AND role = 'admin';
END;
$$;