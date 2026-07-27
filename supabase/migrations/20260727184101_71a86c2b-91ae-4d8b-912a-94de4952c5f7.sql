CREATE OR REPLACE FUNCTION public.accept_employee_invitation(_token text, _user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invite RECORD;
  v_func RECORD;
  v_clinica_id uuid;
BEGIN
  SELECT * INTO v_invite
  FROM public.employee_invitations
  WHERE token = _token
    AND status = 'pending'
    AND expires_at > now()
  LIMIT 1;

  IF v_invite IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Convite inválido, expirado ou já utilizado.');
  END IF;

  v_clinica_id := v_invite.clinica_id;

  SELECT * INTO v_func FROM public.funcionarios WHERE id = v_invite.funcionario_id;

  IF v_clinica_id IS NULL AND v_func.clinica_id IS NOT NULL THEN
    v_clinica_id := v_func.clinica_id;
  END IF;

  UPDATE public.employee_invitations
  SET status = 'accepted', accepted_at = now()
  WHERE id = v_invite.id;

  UPDATE public.funcionarios
  SET user_id = _user_id
  WHERE id = v_invite.funcionario_id;

  IF v_clinica_id IS NOT NULL THEN
    UPDATE public.profiles
    SET clinica_id = v_clinica_id
    WHERE id = _user_id;
  END IF;

  IF array_length(v_invite.roles, 1) > 0 THEN
    INSERT INTO public.user_roles (user_id, role)
    SELECT _user_id, unnest(v_invite.roles)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  IF 'medico' = ANY(v_invite.roles) THEN
    INSERT INTO public.medicos (nome, email, crm, user_id, ativo, clinica_id)
    VALUES (
      COALESCE(v_func.nome, 'Médico'),
      COALESCE(v_func.email, ''),
      'PENDENTE',
      _user_id,
      true,
      v_clinica_id
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object('success', true, 'clinica_id', v_clinica_id);
END;
$function$;

-- Corrigir dados existentes: médicos/funcionários já convidados sem clinica_id no profile
UPDATE public.profiles p
SET clinica_id = f.clinica_id
FROM public.funcionarios f
WHERE f.user_id = p.id
  AND p.clinica_id IS NULL
  AND f.clinica_id IS NOT NULL;

UPDATE public.medicos m
SET clinica_id = p.clinica_id
FROM public.profiles p
WHERE m.user_id = p.id
  AND m.clinica_id IS NULL
  AND p.clinica_id IS NOT NULL;