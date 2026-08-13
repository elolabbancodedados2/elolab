-- Isolamento de contas/convites e fechamento do fluxo de pagamento.
-- Policies RLS permissivas sao somadas com OR; remover as antigas e essencial.

BEGIN;

-- Convites legados: plataforma ve tudo; administrador clinico ve a propria
-- clinica. Registros legados sem clinica_id ficam invisiveis para clinicas.
DROP POLICY IF EXISTS "Authenticated users can view invitations" ON public.employee_invitations;
DROP POLICY IF EXISTS "Admins can insert invitations" ON public.employee_invitations;
DROP POLICY IF EXISTS "Admins can update invitations" ON public.employee_invitations;
DROP POLICY IF EXISTS employee_invitations_select ON public.employee_invitations;
DROP POLICY IF EXISTS employee_invitations_insert ON public.employee_invitations;
DROP POLICY IF EXISTS employee_invitations_update ON public.employee_invitations;
DROP POLICY IF EXISTS employee_invitations_delete ON public.employee_invitations;
DROP POLICY IF EXISTS "anon_select_invitation_by_token" ON public.employee_invitations;
DROP POLICY IF EXISTS "anon_select_invitation_by_token_scoped" ON public.employee_invitations;
DROP POLICY IF EXISTS "anon_select_invitation_by_token_v2" ON public.employee_invitations;
DROP POLICY IF EXISTS employee_invitations_anon_block ON public.employee_invitations;

CREATE POLICY employee_invitations_select_scoped_v3
ON public.employee_invitations FOR SELECT TO authenticated
USING (
  public.is_platform_admin()
  OR (
    public.is_admin(auth.uid())
    AND clinica_id IS NOT NULL
    AND clinica_id = public.get_my_clinica_id()
  )
);

CREATE POLICY employee_invitations_insert_scoped_v3
ON public.employee_invitations FOR INSERT TO authenticated
WITH CHECK (
  public.is_platform_admin()
  OR (
    public.is_admin(auth.uid())
    AND clinica_id IS NOT NULL
    AND clinica_id = public.get_my_clinica_id()
  )
);

CREATE POLICY employee_invitations_update_scoped_v3
ON public.employee_invitations FOR UPDATE TO authenticated
USING (
  public.is_platform_admin()
  OR (
    public.is_admin(auth.uid())
    AND clinica_id IS NOT NULL
    AND clinica_id = public.get_my_clinica_id()
  )
)
WITH CHECK (
  public.is_platform_admin()
  OR (
    public.is_admin(auth.uid())
    AND clinica_id IS NOT NULL
    AND clinica_id = public.get_my_clinica_id()
  )
);

CREATE POLICY employee_invitations_delete_scoped_v3
ON public.employee_invitations FOR DELETE TO authenticated
USING (
  public.is_platform_admin()
  OR (
    public.is_admin(auth.uid())
    AND clinica_id IS NOT NULL
    AND clinica_id = public.get_my_clinica_id()
  )
);

CREATE POLICY employee_invitations_anon_block
ON public.employee_invitations FOR SELECT TO anon
USING (false);

-- Convites novos: sempre isolados por clinica, salvo plataforma.
DROP POLICY IF EXISTS convites_select ON public.convites_funcionario;
DROP POLICY IF EXISTS convites_insert ON public.convites_funcionario;
DROP POLICY IF EXISTS convites_update ON public.convites_funcionario;
DROP POLICY IF EXISTS convites_delete ON public.convites_funcionario;
DROP POLICY IF EXISTS convites_funcionario_select ON public.convites_funcionario;
DROP POLICY IF EXISTS convites_funcionario_insert ON public.convites_funcionario;
DROP POLICY IF EXISTS convites_funcionario_update ON public.convites_funcionario;
DROP POLICY IF EXISTS convites_funcionario_delete ON public.convites_funcionario;

CREATE POLICY convites_funcionario_select_scoped_v3
ON public.convites_funcionario FOR SELECT TO authenticated
USING (public.is_platform_admin() OR clinica_id = public.get_my_clinica_id());

CREATE POLICY convites_funcionario_insert_scoped_v3
ON public.convites_funcionario FOR INSERT TO authenticated
WITH CHECK (
  public.is_platform_admin()
  OR (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id())
);

CREATE POLICY convites_funcionario_update_scoped_v3
ON public.convites_funcionario FOR UPDATE TO authenticated
USING (
  public.is_platform_admin()
  OR (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id())
)
WITH CHECK (
  public.is_platform_admin()
  OR (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id())
);

CREATE POLICY convites_funcionario_delete_scoped_v3
ON public.convites_funcionario FOR DELETE TO authenticated
USING (
  public.is_platform_admin()
  OR (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id())
);

-- Contas: somente o administrador da plataforma lista todos os perfis e papeis.
DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
DROP POLICY IF EXISTS profiles_select_scoped ON public.profiles;
CREATE POLICY profiles_select_platform_or_clinic_v3
ON public.profiles FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR public.is_platform_admin()
  OR (clinica_id IS NOT NULL AND clinica_id = public.get_my_clinica_id())
);

DROP POLICY IF EXISTS user_roles_select_admin ON public.user_roles;
DROP POLICY IF EXISTS user_roles_select_v2 ON public.user_roles;
DROP POLICY IF EXISTS user_roles_select_scoped ON public.user_roles;
CREATE POLICY user_roles_select_platform_or_clinic_v3
ON public.user_roles FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_platform_admin()
  OR (public.is_admin(auth.uid()) AND public.user_in_same_clinica(user_id))
);

-- Recepcao precisa consultar e baixar a cobranca no balcao.
DROP POLICY IF EXISTS lancamentos_select ON public.lancamentos;
CREATE POLICY lancamentos_select_fluxo_v3
ON public.lancamentos FOR SELECT TO authenticated
USING (
  (
    public.can_access_financial(auth.uid())
    OR public.is_recepcao(auth.uid())
    OR (public.can_access_clinical(auth.uid()) AND categoria = 'exame')
  )
  AND clinica_id = public.get_my_clinica_id()
);

DROP POLICY IF EXISTS lancamentos_insert ON public.lancamentos;
CREATE POLICY lancamentos_insert_fluxo_v3
ON public.lancamentos FOR INSERT TO authenticated
WITH CHECK (
  (
    public.can_access_financial(auth.uid())
    OR public.is_recepcao(auth.uid())
    OR (public.can_access_clinical(auth.uid()) AND categoria IN ('consulta', 'exame'))
  )
  AND (clinica_id = public.get_my_clinica_id() OR clinica_id IS NULL)
);

DROP POLICY IF EXISTS lancamentos_update ON public.lancamentos;
CREATE POLICY lancamentos_update_fluxo_v3
ON public.lancamentos FOR UPDATE TO authenticated
USING (
  (public.can_access_financial(auth.uid()) OR public.is_recepcao(auth.uid()))
  AND clinica_id = public.get_my_clinica_id()
)
WITH CHECK (
  (public.can_access_financial(auth.uid()) OR public.is_recepcao(auth.uid()))
  AND clinica_id = public.get_my_clinica_id()
);

-- Automações disparadas por médico/enfermagem precisam poder registrar
-- notificações e logs da própria clínica. A consulta financeira continua
-- restrita às funções financeiras/recepção acima.
DROP POLICY IF EXISTS notification_queue_insert_admin ON public.notification_queue;
CREATE POLICY notification_queue_insert_workflow_v3
ON public.notification_queue FOR INSERT TO authenticated
WITH CHECK (
  (
    public.is_admin(auth.uid())
    OR public.is_recepcao(auth.uid())
    OR public.is_medico(auth.uid())
    OR public.is_enfermagem(auth.uid())
  )
  AND (clinica_id = public.get_my_clinica_id() OR clinica_id IS NULL)
);

DROP POLICY IF EXISTS automation_logs_insert_admin ON public.automation_logs;
CREATE POLICY automation_logs_insert_workflow_v3
ON public.automation_logs FOR INSERT TO authenticated
WITH CHECK (
  public.has_any_role(auth.uid())
  AND (clinica_id = public.get_my_clinica_id() OR clinica_id IS NULL)
);

COMMIT;
