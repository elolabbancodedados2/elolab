-- Provisiona a conta dona como admin de uma clínica interna e a única dona ativa
-- da plataforma. Esta migration não deve ser aplicada em produção sem a etapa de
-- ativação autorizada separadamente.
DO $migration$
DECLARE
  v_user_id uuid;
  v_user_count integer;
  v_clinica_id uuid;
  v_profile_clinica_id uuid;
  v_owned_clinic_count integer;
  v_clinic_owner_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('elolab:owner-clinic:contato@elolab.com.br', 0)
  );

  SELECT count(*)
    INTO v_user_count
    FROM auth.users
   WHERE lower(email) = lower('contato@elolab.com.br');

  IF v_user_count <> 1 THEN
    RAISE EXCEPTION 'Esperada exatamente uma conta auth para contato@elolab.com.br; encontradas %.', v_user_count;
  END IF;

  SELECT id
    INTO v_user_id
    FROM auth.users
   WHERE lower(email) = lower('contato@elolab.com.br');

  SELECT p.clinica_id
    INTO v_profile_clinica_id
    FROM public.profiles AS p
   WHERE p.id = v_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'O perfil de contato@elolab.com.br não existe; provisionamento cancelado.';
  END IF;

  SELECT count(*)
    INTO v_owned_clinic_count
    FROM public.clinicas AS c
   WHERE c.owner_id = v_user_id;

  IF v_owned_clinic_count > 1 THEN
    RAISE EXCEPTION 'A conta dona já possui mais de uma clínica própria; provisionamento cancelado para evitar escolha ambígua.';
  END IF;

  IF v_profile_clinica_id IS NOT NULL THEN
    SELECT c.owner_id
      INTO v_clinic_owner_id
      FROM public.clinicas AS c
     WHERE c.id = v_profile_clinica_id;

    IF NOT FOUND OR v_clinic_owner_id IS DISTINCT FROM v_user_id THEN
      RAISE EXCEPTION 'O perfil de contato@elolab.com.br já aponta para uma clínica de outro proprietário; vínculo preservado.';
    END IF;

    v_clinica_id := v_profile_clinica_id;
  ELSE
    IF v_owned_clinic_count = 1 THEN
      SELECT c.id
        INTO v_clinica_id
        FROM public.clinicas AS c
       WHERE c.owner_id = v_user_id;
    ELSE
      INSERT INTO public.clinicas (nome, owner_id)
      VALUES ('EloLab - Clínica Interna', v_user_id)
      RETURNING id INTO v_clinica_id;
    END IF;
  END IF;

  INSERT INTO public.platform_admins (user_id, nivel, ativo, notes)
  VALUES (v_user_id, 'owner', true, 'Conta proprietária do EloLab')
  ON CONFLICT (user_id) DO UPDATE
    SET nivel = 'owner',
        ativo = true;

  INSERT INTO public.user_roles (user_id, role, assigned_by)
  VALUES (v_user_id, 'admin'::public.app_role, v_user_id)
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.profiles
     SET clinica_id = v_clinica_id,
         updated_at = now()
   WHERE id = v_user_id;

  -- Remove a autoridade da plataforma das demais contas, sem apagar registros
  -- nem alterar seus papéis clínicos, clínicas, perfis ou assinaturas.
  UPDATE public.platform_admins
     SET ativo = false
   WHERE user_id <> v_user_id
     AND ativo = true;
END;
$migration$;
