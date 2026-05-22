ALTER TABLE public.platform_admins
  ADD COLUMN IF NOT EXISTS impersonating_clinica_id uuid REFERENCES public.clinicas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS original_clinica_id uuid;

CREATE OR REPLACE FUNCTION public.platform_start_impersonation(_target_clinica_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_clinica uuid;
  v_exists boolean;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso negado: somente administradores da plataforma.';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.clinicas WHERE id = _target_clinica_id) INTO v_exists;
  IF NOT v_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'Clínica não encontrada.');
  END IF;

  SELECT clinica_id INTO v_current_clinica FROM public.profiles WHERE id = auth.uid();

  UPDATE public.platform_admins
  SET impersonating_clinica_id = _target_clinica_id,
      original_clinica_id = COALESCE(original_clinica_id, v_current_clinica)
  WHERE user_id = auth.uid();

  UPDATE public.profiles
  SET clinica_id = _target_clinica_id
  WHERE id = auth.uid();

  RETURN jsonb_build_object('success', true, 'clinica_id', _target_clinica_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_stop_impersonation()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso negado: somente administradores da plataforma.';
  END IF;

  SELECT original_clinica_id INTO v_original
  FROM public.platform_admins WHERE user_id = auth.uid();

  UPDATE public.profiles
  SET clinica_id = v_original
  WHERE id = auth.uid();

  UPDATE public.platform_admins
  SET impersonating_clinica_id = NULL,
      original_clinica_id = NULL
  WHERE user_id = auth.uid();

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_start_impersonation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_stop_impersonation() TO authenticated;