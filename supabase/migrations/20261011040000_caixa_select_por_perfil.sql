BEGIN;

-- Match database reads to the roles allowed into the cash register UI.
DROP POLICY IF EXISTS caixa_diario_select_scoped ON public.caixa_diario;
CREATE POLICY caixa_diario_select_scoped
  ON public.caixa_diario
  FOR SELECT
  TO authenticated
  USING (
    public.is_same_clinica(clinica_id)
    AND (
      public.is_admin(auth.uid())
      OR public.is_financeiro(auth.uid())
      OR public.is_recepcao(auth.uid())
    )
  );

COMMIT;
