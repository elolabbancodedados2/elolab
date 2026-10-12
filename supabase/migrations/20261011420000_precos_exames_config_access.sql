BEGIN;

-- Keep the established shared-configuration access model, while aligning the
-- particular exam price table with the admin/finance roles shown by the app.
DROP POLICY IF EXISTS config_insert ON public.configuracoes_clinica;
CREATE POLICY config_insert ON public.configuracoes_clinica
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (clinica_id IS NULL OR public.is_same_clinica(clinica_id))
  AND (
    NOT public.chave_config_da_clinica(chave)
    OR (chave = 'precos_exames_internos' AND public.can_access_financial(auth.uid()))
    OR public.is_admin(auth.uid())
  )
);

DROP POLICY IF EXISTS config_update ON public.configuracoes_clinica;
CREATE POLICY config_update ON public.configuracoes_clinica
FOR UPDATE TO authenticated
USING (
  (user_id = auth.uid() AND NOT public.chave_config_da_clinica(chave))
  OR (
    clinica_id IS NOT NULL
    AND public.chave_config_da_clinica(chave)
    AND public.is_same_clinica(clinica_id)
    AND (
      (chave = 'precos_exames_internos' AND public.can_access_financial(auth.uid()))
      OR public.is_admin(auth.uid())
    )
  )
)
WITH CHECK (
  (user_id = auth.uid() AND NOT public.chave_config_da_clinica(chave))
  OR (
    clinica_id IS NOT NULL
    AND public.chave_config_da_clinica(chave)
    AND public.is_same_clinica(clinica_id)
    AND (
      (chave = 'precos_exames_internos' AND public.can_access_financial(auth.uid()))
      OR public.is_admin(auth.uid())
    )
  )
);

COMMIT;
