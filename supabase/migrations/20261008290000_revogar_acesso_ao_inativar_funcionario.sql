-- Inativar ou excluir um funcionário deve retirar o acesso efetivo da conta.
-- pending_roles preserva os papéis atribuídos para permitir reativação.
BEGIN;

CREATE OR REPLACE FUNCTION public.sync_employee_roles(
  _funcionario_id uuid,
  _user_id uuid,
  _roles public.app_role[],
  _ativo boolean
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
  v_manter_admin boolean;
  v_admin_count integer;
BEGIN
  IF auth.uid() IS NULL OR v_clinica_id IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas um administrador da clínica pode alterar os papéis.';
  END IF;
  IF _ativo IS NULL THEN
    RAISE EXCEPTION 'O estado do funcionário é obrigatório.';
  END IF;

  PERFORM 1 FROM public.clinicas WHERE id = v_clinica_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clínica não encontrada.';
  END IF;

  SELECT f.user_id INTO v_existing_user_id
    FROM public.funcionarios f
   WHERE f.id = _funcionario_id AND f.clinica_id = v_clinica_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Funcionário não encontrado nesta clínica.';
  END IF;

  IF v_existing_user_id IS NOT NULL AND _user_id IS NOT NULL AND v_existing_user_id <> _user_id THEN
    RAISE EXCEPTION 'Este funcionário já está vinculado a outra conta.';
  END IF;
  v_user_id := COALESCE(_user_id, v_existing_user_id);

  IF v_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = v_user_id AND p.clinica_id = v_clinica_id
  ) THEN
    RAISE EXCEPTION 'A conta vinculada não pertence a esta clínica.';
  END IF;

  IF v_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.funcionarios f
     WHERE f.user_id = v_user_id AND f.clinica_id = v_clinica_id AND f.id <> _funcionario_id
  ) THEN
    RAISE EXCEPTION 'Esta conta já está vinculada a outro funcionário.';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_roles) AS requested(role) WHERE requested.role IS NULL) THEN
    RAISE EXCEPTION 'A lista de papéis contém um valor inválido.';
  END IF;

  v_manter_admin := _ativo AND ('admin'::public.app_role = ANY(v_roles));
  IF v_user_id IS NOT NULL AND public.has_role(v_user_id, 'admin'::public.app_role) AND NOT v_manter_admin THEN
    IF v_user_id = auth.uid() THEN
      RAISE EXCEPTION 'Não é permitido remover o próprio acesso de administrador.';
    END IF;
    SELECT count(*) INTO v_admin_count
      FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.id
     WHERE p.clinica_id = v_clinica_id AND ur.role = 'admin'::public.app_role;
    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'A clínica precisa manter pelo menos um administrador ativo.';
    END IF;
  END IF;

  UPDATE public.funcionarios
     SET user_id = v_user_id, pending_roles = v_roles, ativo = _ativo
   WHERE id = _funcionario_id AND clinica_id = v_clinica_id;

  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.user_roles WHERE user_id = v_user_id;
  IF _ativo THEN
    INSERT INTO public.user_roles (user_id, role, assigned_by)
    SELECT v_user_id, requested.role, auth.uid()
      FROM (SELECT DISTINCT role FROM unnest(v_roles) AS requested(role)) requested
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END;
$$;

-- Compatibilidade para clientes ainda chamando a assinatura antiga.
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
  v_ativo boolean;
BEGIN
  IF auth.uid() IS NULL OR v_clinica_id IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas um administrador da clínica pode alterar os papéis.';
  END IF;

  PERFORM 1 FROM public.clinicas WHERE id = v_clinica_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clínica não encontrada.';
  END IF;

  SELECT f.ativo INTO v_ativo
    FROM public.funcionarios f
   WHERE f.id = _funcionario_id
     AND f.clinica_id = v_clinica_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Funcionário não encontrado nesta clínica.';
  END IF;

  PERFORM public.sync_employee_roles(_funcionario_id, _user_id, _roles, COALESCE(v_ativo, true));
END;
$$;

REVOKE ALL ON FUNCTION public.sync_employee_roles(uuid, uuid, public.app_role[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_employee_roles(uuid, uuid, public.app_role[], boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.sync_employee_roles(uuid, uuid, public.app_role[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_employee_roles(uuid, uuid, public.app_role[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.excluir_funcionario_revogando_acesso(p_funcionario_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_clinica_id uuid := public.get_my_clinica_id();
  v_user_id uuid;
  v_admin_count integer;
BEGIN
  IF auth.uid() IS NULL OR v_clinica_id IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas um administrador da clínica pode excluir funcionários.';
  END IF;
  PERFORM 1 FROM public.clinicas WHERE id = v_clinica_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clínica não encontrada.';
  END IF;

  SELECT f.user_id INTO v_user_id
    FROM public.funcionarios f
   WHERE f.id = p_funcionario_id AND f.clinica_id = v_clinica_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Funcionário não encontrado nesta clínica.';
  END IF;

  IF v_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = v_user_id AND p.clinica_id = v_clinica_id
  ) THEN
    RAISE EXCEPTION 'A conta vinculada não pertence a esta clínica.';
  END IF;

  IF v_user_id IS NOT NULL AND public.has_role(v_user_id, 'admin'::public.app_role) THEN
    IF v_user_id = auth.uid() THEN
      RAISE EXCEPTION 'Não é permitido excluir a própria conta de administrador.';
    END IF;
    SELECT count(*) INTO v_admin_count
      FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.id
     WHERE p.clinica_id = v_clinica_id AND ur.role = 'admin'::public.app_role;
    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'A clínica precisa manter pelo menos um administrador ativo.';
    END IF;
  END IF;

  IF v_user_id IS NOT NULL THEN
    DELETE FROM public.user_roles WHERE user_id = v_user_id;
  END IF;
  DELETE FROM public.funcionarios WHERE id = p_funcionario_id AND clinica_id = v_clinica_id;
END;
$$;

REVOKE ALL ON FUNCTION public.excluir_funcionario_revogando_acesso(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.excluir_funcionario_revogando_acesso(uuid) TO authenticated;

COMMIT;
