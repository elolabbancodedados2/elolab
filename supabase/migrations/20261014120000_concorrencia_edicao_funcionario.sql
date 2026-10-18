-- Compare-and-set para impedir que edições abertas em versões antigas
-- sobrescrevam dados e papéis salvos por outro administrador.
BEGIN;

ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS edit_version bigint NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.increment_funcionario_edit_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  NEW.edit_version := OLD.edit_version + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS increment_funcionario_edit_version ON public.funcionarios;
DROP TRIGGER IF EXISTS increment_funcionario_edit_version ON public.funcionarios;
CREATE TRIGGER increment_funcionario_edit_version
BEFORE UPDATE ON public.funcionarios
FOR EACH ROW
EXECUTE FUNCTION public.increment_funcionario_edit_version();

REVOKE ALL ON FUNCTION public.increment_funcionario_edit_version() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sync_employee_roles_if_unchanged(
  _funcionario_id uuid,
  _user_id uuid,
  _roles public.app_role[],
  _ativo boolean,
  _expected_version bigint
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
  v_current_version bigint;
BEGIN
  IF auth.uid() IS NULL OR v_clinica_id IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas um administrador da clínica pode alterar os papéis.';
  END IF;
  IF _ativo IS NULL OR _expected_version IS NULL THEN
    RAISE EXCEPTION 'Estado e versão do funcionário são obrigatórios.';
  END IF;

  PERFORM 1 FROM public.clinicas WHERE id = v_clinica_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clínica não encontrada.';
  END IF;

  SELECT f.user_id, f.edit_version
    INTO v_existing_user_id, v_current_version
    FROM public.funcionarios f
   WHERE f.id = _funcionario_id AND f.clinica_id = v_clinica_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Funcionário não encontrado nesta clínica.';
  END IF;
  IF v_current_version IS DISTINCT FROM _expected_version THEN
    RAISE EXCEPTION 'Outra pessoa alterou esta ficha. Atualize a lista e reabra a edição antes de salvar.'
      USING ERRCODE = '40001';
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
  ELSE
    PERFORM public.admin_encerrar_sessoes(v_user_id);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_employee_roles_if_unchanged(uuid, uuid, public.app_role[], boolean, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_employee_roles_if_unchanged(uuid, uuid, public.app_role[], boolean, bigint) TO authenticated;

COMMENT ON FUNCTION public.sync_employee_roles_if_unchanged(uuid, uuid, public.app_role[], boolean, bigint) IS
  'Sincroniza papéis do funcionário somente se a versão da ficha continuar igual à observada na edição.';

COMMIT;
