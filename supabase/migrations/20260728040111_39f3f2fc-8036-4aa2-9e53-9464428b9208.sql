ALTER TABLE public.registros_pendentes
  ADD COLUMN IF NOT EXISTS reminder_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.resend_activation_manual(_registro_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg RECORD;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso negado: somente administradores da plataforma.';
  END IF;

  SELECT * INTO v_reg FROM public.registros_pendentes WHERE id = _registro_id;
  IF v_reg IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Registro não encontrado.');
  END IF;

  IF v_reg.user_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este registro já virou conta ativa.');
  END IF;

  UPDATE public.registros_pendentes
  SET expires_at = GREATEST(expires_at, now() + interval '7 days'),
      updated_at = now()
  WHERE id = _registro_id;

  RETURN jsonb_build_object('success', true, 'codigo', v_reg.codigo_convite, 'email', v_reg.email);
END;
$$;

GRANT EXECUTE ON FUNCTION public.resend_activation_manual(uuid) TO authenticated;