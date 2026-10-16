-- Inativar um funcionÃ¡rio remove os papÃ©is e tambÃ©m encerra as sessÃµes Auth.
-- O JWT jÃ¡ emitido pode continuar vÃ¡lido atÃ© expirar; novas renovaÃ§Ãµes falham.
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
    RAISE EXCEPTION 'Apenas um administrador da clÃ­nica pode alterar os papÃ©is.';
  END IF;
  IF _ativo IS NULL THEN
    RAISE EXCEPTION 'O estado do funcionÃ¡rio Ã© obrigatÃ³rio.';
  END IF;

  PERFORM 1 FROM public.clinicas WHERE id = v_clinica_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ClÃ­nica nÃ£o encontrada.';
  END IF;

  SELECT f.user_id INTO v_existing_user_id
    FROM public.funcionarios f
   WHERE f.id = _funcionario_id AND f.clinica_id = v_clinica_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FuncionÃ¡rio nÃ£o encontrado nesta clÃ­nica.';
  END IF;

  IF v_existing_user_id IS NOT NULL AND _user_id IS NOT NULL AND v_existing_user_id <> _user_id THEN
    RAISE EXCEPTION 'Este funcionÃ¡rio jÃ¡ estÃ¡ vinculado a outra conta.';
  END IF;
  v_user_id := COALESCE(_user_id, v_existing_user_id);

  IF v_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = v_user_id AND p.clinica_id = v_clinica_id
  ) THEN
    RAISE EXCEPTION 'A conta vinculada nÃ£o pertence a esta clÃ­nica.';
  END IF;

  IF v_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.funcionarios f
     WHERE f.user_id = v_user_id AND f.clinica_id = v_clinica_id AND f.id <> _funcionario_id
  ) THEN
    RAISE EXCEPTION 'Esta conta jÃ¡ estÃ¡ vinculada a outro funcionÃ¡rio.';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_roles) AS requested(role) WHERE requested.role IS NULL) THEN
    RAISE EXCEPTION 'A lista de papÃ©is contÃ©m um valor invÃ¡lido.';
  END IF;

  v_manter_admin := _ativo AND ('admin'::public.app_role = ANY(v_roles));
  IF v_user_id IS NOT NULL AND public.has_role(v_user_id, 'admin'::public.app_role) AND NOT v_manter_admin THEN
    IF v_user_id = auth.uid() THEN
      RAISE EXCEPTION 'NÃ£o Ã© permitido remover o prÃ³prio acesso de administrador.';
    END IF;
    SELECT count(*) INTO v_admin_count
      FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.id
     WHERE p.clinica_id = v_clinica_id AND ur.role = 'admin'::public.app_role;
    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'A clÃ­nica precisa manter pelo menos um administrador ativo.';
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
  ELSE
    -- A revogaÃ§Ã£o efetiva das sessÃµes e dos refresh tokens fica na mesma
    -- transaÃ§Ã£o que a remoÃ§Ã£o dos papÃ©is. A funÃ§Ã£o auxiliar sÃ³ aceita service_role
    -- diretamente; esta RPC SECURITY DEFINER a chama internamente como owner.
    PERFORM public.admin_encerrar_sessoes(v_user_id);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_employee_roles(uuid, uuid, public.app_role[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_employee_roles(uuid, uuid, public.app_role[], boolean) TO authenticated;

COMMIT;
