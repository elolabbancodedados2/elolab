-- Limita colunas pessoais sensíveis nas tabelas de equipe. As telas administrativas
-- recebem os dados completos por RPC com validação de papel e clínica.

REVOKE SELECT ON TABLE public.medicos FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, nome, crm, tipo_registro, crm_uf, rqe,
  especialidade, intervalo_consulta, ativo, clinica_id
) ON TABLE public.medicos TO authenticated;
DROP POLICY IF EXISTS "medicos_select" ON public.medicos;
CREATE POLICY "medicos_select" ON public.medicos FOR SELECT TO authenticated
  USING (
    public.has_any_role(auth.uid())
    AND public.get_my_clinica_id() IS NOT NULL
    AND clinica_id = public.get_my_clinica_id()
  );

REVOKE SELECT ON TABLE public.funcionarios FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, nome, cargo, departamento, email, telefone, data_admissao,
  ativo, clinica_id, user_id, created_at, updated_at, tipo_funcionario
) ON TABLE public.funcionarios TO authenticated;

DROP POLICY IF EXISTS "anon_select_funcionarios_for_invite" ON public.funcionarios;
DROP POLICY IF EXISTS "funcionarios_select" ON public.funcionarios;
CREATE POLICY "funcionarios_select" ON public.funcionarios FOR SELECT TO authenticated
  USING (
    (public.is_admin(auth.uid()) OR user_id = auth.uid())
    AND public.get_my_clinica_id() IS NOT NULL
    AND clinica_id = public.get_my_clinica_id()
  );

DROP VIEW IF EXISTS public.funcionarios_safe;
CREATE VIEW public.funcionarios_safe
WITH (security_invoker = true)
AS
SELECT
  id, nome, cargo, departamento, email, telefone, data_admissao,
  ativo, clinica_id, user_id, created_at, updated_at, tipo_funcionario
FROM public.funcionarios;
REVOKE ALL ON public.funcionarios_safe FROM PUBLIC, anon;
GRANT SELECT ON public.funcionarios_safe TO authenticated;

CREATE OR REPLACE FUNCTION public.listar_medicos_equipe_admin()
RETURNS SETOF public.medicos
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.* FROM public.medicos AS m
  WHERE public.is_admin(auth.uid())
    AND m.clinica_id = public.get_my_clinica_id()
  ORDER BY m.nome;
$$;
REVOKE ALL ON FUNCTION public.listar_medicos_equipe_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_medicos_equipe_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.listar_funcionarios_equipe_admin()
RETURNS SETOF public.funcionarios
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT f.* FROM public.funcionarios AS f
  WHERE public.is_admin(auth.uid())
    AND f.clinica_id = public.get_my_clinica_id()
  ORDER BY f.nome;
$$;
REVOKE ALL ON FUNCTION public.listar_funcionarios_equipe_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_funcionarios_equipe_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.listar_medicos_repasse_equipe()
RETURNS TABLE (
  id uuid, nome text, crm text, tipo_repasse text,
  percentual_repasse numeric, valor_repasse_fixo numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.id, m.nome, m.crm, m.tipo_repasse, m.percentual_repasse, m.valor_repasse_fixo
  FROM public.medicos AS m
  WHERE (public.is_admin(auth.uid()) OR public.is_financeiro(auth.uid()))
    AND m.clinica_id = public.get_my_clinica_id()
    AND m.ativo IS TRUE;
$$;
REVOKE ALL ON FUNCTION public.listar_medicos_repasse_equipe() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_medicos_repasse_equipe() TO authenticated;

CREATE OR REPLACE FUNCTION public.listar_funcionarios_chat_equipe()
RETURNS TABLE (user_id uuid, cargo text, tipo_funcionario text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT f.user_id, f.cargo, f.tipo_funcionario
  FROM public.funcionarios AS f
  WHERE public.has_any_role(auth.uid())
    AND f.clinica_id = public.get_my_clinica_id()
    AND f.ativo IS TRUE
    AND f.user_id IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.listar_funcionarios_chat_equipe() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_funcionarios_chat_equipe() TO authenticated;

CREATE OR REPLACE FUNCTION public.contar_equipe_ativa()
RETURNS TABLE (funcionarios bigint, medicos bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    (SELECT count(*) FROM public.funcionarios f
      WHERE f.clinica_id = public.get_my_clinica_id() AND f.ativo IS TRUE),
    (SELECT count(*) FROM public.medicos m
      WHERE m.clinica_id = public.get_my_clinica_id() AND m.ativo IS TRUE)
  WHERE public.has_any_role(auth.uid());
$$;
REVOKE ALL ON FUNCTION public.contar_equipe_ativa() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contar_equipe_ativa() TO authenticated;

CREATE OR REPLACE FUNCTION public.buscar_medico_atual()
RETURNS TABLE (
  id uuid, nome text, crm text, crm_uf text, rqe text,
  especialidade text, foto_url text, intervalo_consulta integer, ativo boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.id, m.nome, m.crm, m.crm_uf, m.rqe, m.especialidade,
         m.foto_url, m.intervalo_consulta, m.ativo
  FROM public.medicos AS m
  WHERE public.is_medico(auth.uid())
    AND m.user_id = auth.uid()
    AND m.clinica_id = public.get_my_clinica_id()
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.buscar_medico_atual() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_medico_atual() TO authenticated;

CREATE OR REPLACE FUNCTION public.buscar_contato_medico_notificacao(p_medico_id uuid)
RETURNS TABLE (id uuid, nome text, email text, user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.id, m.nome, m.email, m.user_id
  FROM public.medicos AS m
  WHERE (
      public.is_admin(auth.uid()) OR public.is_recepcao(auth.uid())
      OR public.is_enfermagem(auth.uid())
      OR (public.is_medico(auth.uid()) AND m.user_id = auth.uid())
    )
    AND m.id = p_medico_id
    AND m.clinica_id = public.get_my_clinica_id()
    AND m.ativo IS TRUE;
$$;
REVOKE ALL ON FUNCTION public.buscar_contato_medico_notificacao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_contato_medico_notificacao(uuid) TO authenticated;
