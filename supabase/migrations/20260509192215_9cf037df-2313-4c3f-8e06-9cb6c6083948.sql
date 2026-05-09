DROP POLICY IF EXISTS config_select ON public.configuracoes_clinica;
DROP POLICY IF EXISTS config_insert ON public.configuracoes_clinica;
DROP POLICY IF EXISTS config_update ON public.configuracoes_clinica;
DROP POLICY IF EXISTS config_delete ON public.configuracoes_clinica;

CREATE POLICY config_select
ON public.configuracoes_clinica
FOR SELECT
USING (
  user_id = auth.uid()
  OR (
    chave = 'precos_exames_internos'
    AND clinica_id IS NOT NULL
    AND public.is_same_clinica(clinica_id)
  )
);

CREATE POLICY config_insert
ON public.configuracoes_clinica
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND (
    clinica_id IS NULL
    OR public.is_same_clinica(clinica_id)
  )
);

CREATE POLICY config_update
ON public.configuracoes_clinica
FOR UPDATE
USING (
  user_id = auth.uid()
  OR (
    chave = 'precos_exames_internos'
    AND clinica_id IS NOT NULL
    AND public.is_same_clinica(clinica_id)
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND (
    clinica_id IS NULL
    OR public.is_same_clinica(clinica_id)
  )
);

CREATE POLICY config_delete
ON public.configuracoes_clinica
FOR DELETE
USING (
  user_id = auth.uid()
  OR (
    chave = 'precos_exames_internos'
    AND clinica_id IS NOT NULL
    AND public.is_same_clinica(clinica_id)
  )
);