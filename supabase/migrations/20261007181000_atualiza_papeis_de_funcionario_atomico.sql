-- Atualiza os papéis da conta vinculada ao funcionário em uma única transação.
-- A trava da clínica também serializa alterações concorrentes de administrador.
CREATE OR REPLACE FUNCTION public.sync_employee_roles(
  _funcionario_id uuid,
  _user_id uuid,
  _roles public.app_role[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_clinica_id uuid := public.get_my_clinica_id();
  v_existing_user_id uuid;
  v_user_id uuid;
  v_roles public.app_role[] := COALESCE(_roles, ARRAY[]::public.app_role[]);
  v_admin_count integer;
BEGIN
  IF auth.uid() IS NULL OR v_clinica_id IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas um administrador da clínica pode alterar os papéis.';
  END IF;

  -- Serializa atribuições e remoções de administradores da mesma clínica.
  PERFORM 1 FROM public.clinicas WHERE id = v_clinica_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clínica não encontrada.';
  END IF;

  SELECT f.user_id
    INTO v_existing_user_id
    FROM public.funcionarios f
   WHERE f.id = _funcionario_id
     AND f.clinica_id = v_clinica_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Funcionário não encontrado nesta clínica.';
  END IF;

  IF _user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = _user_id AND p.clinica_id = v_clinica_id
  ) THEN
    RAISE EXCEPTION 'A conta escolhida não pertence a esta clínica.';
  END IF;

  IF v_existing_user_id IS NOT NULL
     AND _user_id IS NOT NULL
     AND v_existing_user_id <> _user_id THEN
    RAISE EXCEPTION 'Este funcionário já está vinculado a outra conta.';
  END IF;

  v_user_id := COALESCE(_user_id, v_existing_user_id);

  IF v_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.funcionarios f
     WHERE f.user_id = v_user_id
       AND f.clinica_id = v_clinica_id
       AND f.id <> _funcionario_id
  ) THEN
    RAISE EXCEPTION 'Esta conta já está vinculada a outro funcionário.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(v_roles) AS requested(role)
    WHERE requested.role IS NULL
  ) THEN
    RAISE EXCEPTION 'A lista de papéis contém um valor inválido.';
  END IF;

  UPDATE public.funcionarios
     SET user_id = v_user_id,
         pending_roles = v_roles
   WHERE id = _funcionario_id;

  -- Sem conta vinculada, pending_roles alimenta o acesso ao aceitar o convite.
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  IF v_user_id = auth.uid() AND NOT ('admin'::public.app_role = ANY(v_roles)) THEN
    RAISE EXCEPTION 'Não é permitido remover o próprio acesso de administrador.';
  END IF;

  IF public.has_role(v_user_id, 'admin'::public.app_role)
     AND NOT ('admin'::public.app_role = ANY(v_roles)) THEN
    SELECT count(*)
      INTO v_admin_count
      FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.id
     WHERE p.clinica_id = v_clinica_id
       AND ur.role = 'admin'::public.app_role;

    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'A clínica precisa manter pelo menos um administrador.';
    END IF;
  END IF;

  DELETE FROM public.user_roles WHERE user_id = v_user_id;
  INSERT INTO public.user_roles (user_id, role, assigned_by)
  SELECT v_user_id, requested.role, auth.uid()
    FROM (SELECT DISTINCT role FROM unnest(v_roles) AS requested(role)) requested
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_employee_roles(uuid, uuid, public.app_role[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_employee_roles(uuid, uuid, public.app_role[]) TO authenticated;

-- Um reenvio invalida links anteriores antes de emitir o novo, inclusive os
-- convites do fluxo legado, dentro da mesma transação.
CREATE OR REPLACE FUNCTION public.create_employee_invitation(
  _clinica_id uuid,
  _email text,
  _nome text,
  _roles text[],
  _token text,
  _invited_by uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_invite_id uuid;
  v_email text := lower(trim(_email));
BEGIN
  IF _clinica_id IS NULL OR _invited_by IS NULL OR _email IS NULL OR _nome IS NULL
     OR _roles IS NULL OR _token IS NULL OR v_email = '' OR trim(_nome) = ''
     OR cardinality(_roles) = 0 OR trim(_token) = '' THEN
    RAISE EXCEPTION 'Dados obrigatórios do convite ausentes.';
  END IF;

  -- Serializa reenvios simultâneos para o mesmo e-mail na mesma clínica.
  PERFORM pg_advisory_xact_lock(hashtextextended(_clinica_id::text || ':' || v_email, 0));

  UPDATE public.employee_invitations
     SET expires_at = now()
   WHERE clinica_id = _clinica_id
     AND lower(trim(email)) = v_email
     AND accepted_at IS NULL
     AND expires_at > now();

  UPDATE public.convites_funcionario
     SET expires_at = now()
   WHERE clinica_id = _clinica_id
     AND lower(trim(email)) = v_email
     AND accepted_at IS NULL
     AND expires_at > now();

  INSERT INTO public.convites_funcionario (
    clinica_id, email, nome, roles, token, invited_by
  ) VALUES (
    _clinica_id, v_email, trim(_nome), _roles, _token, _invited_by
  )
  RETURNING id INTO v_invite_id;

  RETURN v_invite_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_employee_invitation(uuid, text, text, text[], text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_employee_invitation(uuid, text, text, text[], text, uuid) TO service_role;
