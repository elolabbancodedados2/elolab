-- Somente ambiente local ou banco descartável. Não execute em produção.
DO $verification$
DECLARE
  v_owner_id uuid;
  v_active_platform_admins integer;
  v_clinica_id uuid;
  v_owned_clinic_count integer;
BEGIN
  SELECT id
    INTO v_owner_id
    FROM auth.users
   WHERE lower(email) = lower('contato@elolab.com.br');

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'A fixture contato@elolab.com.br não existe.';
  END IF;

  SELECT count(*)
    INTO v_active_platform_admins
    FROM public.platform_admins
   WHERE ativo = true;

  IF v_active_platform_admins <> 1
     OR NOT EXISTS (
       SELECT 1
         FROM public.platform_admins
        WHERE user_id = v_owner_id
          AND nivel = 'owner'
          AND ativo = true
     ) THEN
    RAISE EXCEPTION 'A conta dona deve ser o único administrador de plataforma ativo.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.user_roles
     WHERE user_id = v_owner_id
       AND role = 'admin'::public.app_role
  ) THEN
    RAISE EXCEPTION 'A conta dona não possui o papel clínico admin.';
  END IF;

  SELECT clinica_id
    INTO v_clinica_id
    FROM public.profiles
   WHERE id = v_owner_id;

  IF v_clinica_id IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public.clinicas
     WHERE id = v_clinica_id
       AND owner_id = v_owner_id
  ) THEN
    RAISE EXCEPTION 'O perfil da conta dona não aponta para sua própria clínica.';
  END IF;

  SELECT count(*)
    INTO v_owned_clinic_count
    FROM public.clinicas
   WHERE owner_id = v_owner_id;

  IF v_owned_clinic_count <> 1 THEN
    RAISE EXCEPTION 'Esperada uma única clínica própria da conta dona; encontradas %.', v_owned_clinic_count;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.platform_admins
     WHERE user_id <> v_owner_id
       AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Outra conta mantém autoridade ativa na plataforma.';
  END IF;
END;
$verification$;
