BEGIN;

DROP POLICY IF EXISTS "rel_salvos_select" ON public.relatorios_salvos;
DROP POLICY IF EXISTS "rel_salvos_insert" ON public.relatorios_salvos;
DROP POLICY IF EXISTS "rel_salvos_update" ON public.relatorios_salvos;
DROP POLICY IF EXISTS "rel_salvos_delete" ON public.relatorios_salvos;

-- Saved reports contain recipient addresses and configuration that can expose
-- sensitive clinic data. Finance users can manage their own reports; clinic
-- admins can manage reports for their clinic.
CREATE POLICY rel_salvos_select_scoped ON public.relatorios_salvos
  FOR SELECT TO authenticated
  USING (
    public.is_same_clinica(clinica_id)
    AND (public.is_admin(auth.uid()) OR public.is_financeiro(auth.uid()))
    AND (public.is_admin(auth.uid()) OR user_id = auth.uid())
  );

CREATE POLICY rel_salvos_insert_scoped ON public.relatorios_salvos
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_same_clinica(clinica_id)
    AND (public.is_admin(auth.uid()) OR public.is_financeiro(auth.uid()))
    AND user_id = auth.uid()
  );

CREATE POLICY rel_salvos_update_scoped ON public.relatorios_salvos
  FOR UPDATE TO authenticated
  USING (
    public.is_same_clinica(clinica_id)
    AND (public.is_admin(auth.uid()) OR public.is_financeiro(auth.uid()))
    AND (public.is_admin(auth.uid()) OR user_id = auth.uid())
  )
  WITH CHECK (
    public.is_same_clinica(clinica_id)
    AND (public.is_admin(auth.uid()) OR public.is_financeiro(auth.uid()))
    AND (public.is_admin(auth.uid()) OR user_id = auth.uid())
  );

CREATE POLICY rel_salvos_delete_scoped ON public.relatorios_salvos
  FOR DELETE TO authenticated
  USING (
    public.is_same_clinica(clinica_id)
    AND (public.is_admin(auth.uid()) OR public.is_financeiro(auth.uid()))
    AND (public.is_admin(auth.uid()) OR user_id = auth.uid())
  );

COMMIT;
