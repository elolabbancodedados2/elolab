BEGIN;

-- Reception operates rooms during the shift. Keep all mutations restricted to
-- the user's own clinic; platform and clinic admins retain their existing access.
DROP POLICY IF EXISTS salas_insert ON public.salas;
CREATE POLICY salas_insert ON public.salas
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_same_clinica(clinica_id)
    AND (public.is_admin(auth.uid()) OR public.is_recepcao(auth.uid()))
  );

DROP POLICY IF EXISTS salas_update ON public.salas;
CREATE POLICY salas_update ON public.salas
  FOR UPDATE TO authenticated
  USING (
    public.is_same_clinica(clinica_id)
    AND (public.is_admin(auth.uid()) OR public.is_recepcao(auth.uid()))
  )
  WITH CHECK (
    public.is_same_clinica(clinica_id)
    AND (public.is_admin(auth.uid()) OR public.is_recepcao(auth.uid()))
  );

COMMIT;
