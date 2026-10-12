CREATE OR REPLACE FUNCTION public.platform_start_impersonation(
  _target_clinica_id uuid,
  _motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current_clinica uuid;
  v_exists boolean;
  v_motivo text := btrim(coalesce(_motivo, ''));
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso negado: somente administradores da plataforma.';
  END IF;
  IF length(v_motivo) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'O motivo do acesso deve ter entre 5 e 500 caracteres.';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.clinicas WHERE id = _target_clinica_id) INTO v_exists;
  IF NOT v_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'Clínica não encontrada.');
  END IF;

  SELECT clinica_id INTO v_current_clinica FROM public.profiles WHERE id = auth.uid();

  UPDATE public.platform_impersonation_log
     SET encerrado_em = now()
   WHERE platform_admin_id = auth.uid() AND encerrado_em IS NULL;

  UPDATE public.platform_admins
     SET impersonating_clinica_id = _target_clinica_id,
         original_clinica_id = COALESCE(original_clinica_id, v_current_clinica)
   WHERE user_id = auth.uid();

  UPDATE public.profiles
     SET clinica_id = _target_clinica_id
   WHERE id = auth.uid();

  INSERT INTO public.platform_impersonation_log (
    platform_admin_id, clinica_id, motivo, iniciado_em, acoes
  ) VALUES (
    auth.uid(), _target_clinica_id, v_motivo, now(), '[]'::jsonb
  );

  RETURN jsonb_build_object('success', true, 'clinica_id', _target_clinica_id);
END;
$$;

REVOKE ALL ON FUNCTION public.platform_start_impersonation(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_start_impersonation(uuid, text) TO authenticated;
