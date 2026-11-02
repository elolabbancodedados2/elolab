-- ============================================================================
-- Auditoria de 02/11 — remove políticas antigas de storage que nunca caíram
--
-- Políticas permissivas se somam (OR). As versões escopadas por clínica foram
-- criadas depois, mas as originais continuaram ativas porque os DROPs usaram
-- nomes diferentes dos criados:
--
-- medical-attachments (criadas em 20260205172117):
--   "Usuários clínicos podem fazer upload"  — 20260727230000 derrubou
--      "Usuários clínicos podem enviar anexos" (nome errado).
--   "Médicos e admins podem deletar anexos" — 20260727230000 derrubou
--      "Admins e médicos podem deletar anexos" (nome errado).
--   Efeito: upload e remoção de anexos de qualquer clínica.
--   Cobertura atual: med_attach_insert_scoped e med_attach_delete_scoped.
--
-- tv-panel-media (criadas em 20260206034018):
--   "Permitir leitura pública de mídias do painel" — o laço de 20260728041952
--      procurava '%public%', que não casa com "pública".
--   "Admins podem fazer upload de mídias do painel"
--   "Admins podem deletar mídias do painel"
--   Efeito: listagem por qualquer um e upload/remoção entre clínicas.
--   Cobertura atual: tv_panel_media_clinic_list, _write e _delete
--   (20260728160000). O bucket é público, então a URL direta da mídia não
--   depende de política de SELECT.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS "Usuários clínicos podem fazer upload" ON storage.objects;
DROP POLICY IF EXISTS "Médicos e admins podem deletar anexos" ON storage.objects;

DROP POLICY IF EXISTS "Permitir leitura pública de mídias do painel" ON storage.objects;
DROP POLICY IF EXISTS "Admins podem fazer upload de mídias do painel" ON storage.objects;
DROP POLICY IF EXISTS "Admins podem deletar mídias do painel" ON storage.objects;

COMMIT;
