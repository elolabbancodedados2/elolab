-- Operações administrativas em usuários são atômicas e passam por uma única
-- RPC: edição de perfil, ativação e papéis não ficam parcialmente aplicados.
CREATE OR REPLACE FUNCTION public.platform_update_clinic_user(
  p_user_id uuid,
  p_nome text,
  p_telefone text,
  p_roles text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_distinct_roles integer;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso restrito à administração da plataforma';
  END IF;
  IF p_user_id IS NULL OR p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Não é permitido alterar o próprio acesso por esta tela';
  END IF;
  IF EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = p_user_id AND ativo) THEN
    RAISE EXCEPTION 'Administradores da plataforma são gerenciados na Central de Segurança';
  END IF;
  IF p_nome IS NULL OR length(trim(p_nome)) < 2 OR length(p_nome) > 150 THEN
    RAISE EXCEPTION 'Informe um nome com pelo menos 2 caracteres';
  END IF;
  IF p_telefone IS NOT NULL AND length(p_telefone) > 30 THEN
    RAISE EXCEPTION 'O telefone ultrapassa o tamanho permitido';
  END IF;
  IF p_roles IS NULL OR cardinality(p_roles) < 1 OR cardinality(p_roles) > 5 THEN
    RAISE EXCEPTION 'Informe pelo menos uma função';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_roles) AS roles(role_name)
     WHERE roles.role_name NOT IN ('admin', 'medico', 'recepcao', 'enfermagem', 'financeiro')
  ) THEN
    RAISE EXCEPTION 'Uma das funções selecionadas é inválida';
  END IF;
  SELECT count(DISTINCT roles.role_name) INTO v_distinct_roles FROM unnest(p_roles) AS roles(role_name);
  IF v_distinct_roles <> cardinality(p_roles) THEN
    RAISE EXCEPTION 'Há funções duplicadas';
  END IF;

  UPDATE public.profiles
     SET nome = trim(p_nome),
         telefone = nullif(trim(p_telefone), '')
   WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  INSERT INTO public.user_roles(user_id, role)
  SELECT p_user_id, roles.role_name::public.app_role FROM unnest(p_roles) AS roles(role_name);

  INSERT INTO public.audit_log(user_id, action, collection, record_id, record_name, changes)
  VALUES (
    auth.uid(), 'update', 'platform_user_management', p_user_id::text, trim(p_nome),
    jsonb_build_object('roles', p_roles)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_update_clinic_user(uuid, text, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_update_clinic_user(uuid, text, text, text[]) TO authenticated;
