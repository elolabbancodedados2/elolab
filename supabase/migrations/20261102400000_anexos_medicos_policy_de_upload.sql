-- Recria a policy de upload do bucket medical-attachments.
--
-- Em 02/11/2026 a produção tinha só med_attach_select_scoped e med_attach_delete_scoped.
-- Sem a policy de INSERT, o envio de resultado de exame (LancarResultado, Exames) e de
-- anexos clínicos falha com erro de RLS. A definição é a mesma de 20260727230000.

BEGIN;

DROP POLICY IF EXISTS "med_attach_insert_scoped" ON storage.objects;

CREATE POLICY "med_attach_insert_scoped" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'medical-attachments'
    AND public.can_access_clinical(auth.uid())
    AND public.storage_med_attach_allowed(name)
  );

COMMIT;
