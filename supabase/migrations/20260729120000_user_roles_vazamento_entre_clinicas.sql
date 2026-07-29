-- ============================================================================
-- Fecha vazamento: admin de uma clínica lia os papéis de TODAS as clínicas
--
-- SINTOMA RELATADO
-- Funcionários apareciam em contas de outras clínicas.
--
-- CAUSA
-- A tabela user_roles tinha DUAS políticas de SELECT:
--
--   user_roles_select_v2     (user_id = auth.uid())
--                            OR (is_admin(auth.uid()) AND user_in_same_clinica(user_id))
--   user_roles_select_admin  is_admin(auth.uid()) OR (user_id = auth.uid())
--
-- Políticas permissivas no Postgres são somadas com OU, então vale sempre a
-- mais frouxa. A segunda não olha clínica nenhuma: qualquer admin de qualquer
-- clínica lia a tabela inteira da plataforma.
--
-- O efeito aparece em /painel-admin, que roda `from('user_roles').select('*')`
-- sem filtro (src/pages/PainelAdmin.tsx). A rota é liberada para o papel
-- `admin` — admin de CLÍNICA, não da plataforma. Como `profiles` já está
-- corretamente escopada, os usuários de fora vinham sem nome, aparecendo como
-- registros estranhos na lista da equipe.
--
-- Diferente de user_roles, a tabela não tem coluna clinica_id: o vínculo com a
-- clínica é indireto, via profiles do usuário. Por isso o escopo depende de
-- user_in_same_clinica(), que devolve NULL quando qualquer um dos dois lados
-- está sem clínica — e o RLS trata NULL como falso, negando o acesso.
--
-- CORREÇÃO
-- Remove a política frouxa e recria a correta incluindo o admin de plataforma,
-- que é quem legitimamente enxerga todas as clínicas (mesmo critério já usado
-- em profiles_select_scoped).
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS user_roles_select_admin ON public.user_roles;
DROP POLICY IF EXISTS user_roles_select_v2    ON public.user_roles;

CREATE POLICY user_roles_select_v2
ON public.user_roles FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_platform_admin()
  OR (public.is_admin(auth.uid()) AND public.user_in_same_clinica(user_id))
);

COMMENT ON POLICY user_roles_select_v2 ON public.user_roles IS
  'Cada um vê o próprio papel; admin da clínica vê os da mesma clínica; admin de plataforma vê tudo. Não pode coexistir com outra política de SELECT mais frouxa: políticas permissivas se somam com OU.';

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
-- -- Deve existir exatamente UMA política de SELECT em user_roles:
-- SELECT policyname, qual FROM pg_policies
--  WHERE schemaname='public' AND tablename='user_roles' AND cmd='SELECT';
--
-- -- Procure o mesmo padrão em outras tabelas — duas políticas de SELECT onde
-- -- uma ignora a clínica anula a outra:
-- SELECT tablename, count(*) AS politicas_select
--   FROM pg_policies WHERE schemaname='public' AND cmd='SELECT'
--  GROUP BY 1 HAVING count(*) > 1 ORDER BY 2 DESC;
