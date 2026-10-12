BEGIN;

-- Tokens de convite autorizam o aceite pela Edge Function. A leitura direta
-- deve ficar restrita a administradores da clínica e da plataforma.
DROP POLICY IF EXISTS convites_funcionario_select_scoped_v3
  ON public.convites_funcionario;

CREATE POLICY convites_funcionario_select_scoped_v4
ON public.convites_funcionario FOR SELECT TO authenticated
USING (
  public.is_platform_admin()
  OR (
    public.is_admin(auth.uid())
    AND clinica_id IS NOT NULL
    AND clinica_id = public.get_my_clinica_id()
  )
);

COMMIT;
