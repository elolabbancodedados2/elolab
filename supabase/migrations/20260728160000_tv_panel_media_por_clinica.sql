-- ============================================================================
-- Escopa a listagem do Painel TV por clínica
--
-- A migration 20260728120000 deixou a listagem de tv-panel-media liberada a
-- quem tem papel na clínica, com um motivo explícito: os arquivos iam para a
-- RAIZ do bucket, sem pasta, e nenhuma política baseada em caminho conseguiria
-- distinguir a clínica dona.
--
-- O upload foi corrigido no mesmo PR desta migration e passa a gravar
-- `<clinica_id>/<arquivo>` (src/pages/PainelTV.tsx). Com isso a política por
-- pasta finalmente funciona.
--
-- Arquivos ANTIGOS continuam na raiz. A política aceita os dois formatos: se o
-- caminho não tem pasta, cai na regra anterior (papel na clínica). Sem isso, a
-- mídia já cadastrada sumiria das telas.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS "tv_panel_media_clinic_list" ON storage.objects;
CREATE POLICY "tv_panel_media_clinic_list"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'tv-panel-media'
  AND (
    -- Arquivo novo: pasta é a clínica
    (storage.foldername(name))[1] = (public.get_my_clinica_id())::text
    -- Arquivo antigo, gravado na raiz: sem pasta para comparar
    OR array_length(storage.foldername(name), 1) IS NULL
  )
  AND public.has_any_role(auth.uid())
);

-- Escrita e remoção seguem a mesma regra
DROP POLICY IF EXISTS "tv_panel_media_clinic_write" ON storage.objects;
CREATE POLICY "tv_panel_media_clinic_write"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'tv-panel-media'
  AND (storage.foldername(name))[1] = (public.get_my_clinica_id())::text
);

DROP POLICY IF EXISTS "tv_panel_media_clinic_delete" ON storage.objects;
CREATE POLICY "tv_panel_media_clinic_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'tv-panel-media'
  AND (
    (storage.foldername(name))[1] = (public.get_my_clinica_id())::text
    OR array_length(storage.foldername(name), 1) IS NULL
  )
  AND public.has_any_role(auth.uid())
);

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO / LIMPEZA OPCIONAL
-- ============================================================================
-- -- Quantos arquivos ainda estão na raiz (formato antigo, sem escopo)?
-- SELECT count(*) AS na_raiz
--   FROM storage.objects
--  WHERE bucket_id = 'tv-panel-media'
--    AND array_length(storage.foldername(name), 1) IS NULL;
--
-- Enquanto houver arquivos na raiz, a listagem deles fica visível a qualquer
-- clínica. Para fechar por completo, reenvie essas mídias pela tela do Painel
-- TV (o upload novo já grava na pasta certa) e remova as antigas.
