-- ============================================================================
-- Torna patient-photos privado
--
-- O bucket era público: qualquer pessoa com a URL via a foto do paciente, sem
-- login. As URLs eram geradas por getPublicUrl() e gravadas em
-- pacientes.foto_url e medicos.foto_url / carimbo_url.
--
-- O FRONTEND JÁ FOI AJUSTADO (mesmo PR desta migration):
--   - upload passa a gravar o CAMINHO, não a URL
--     (PatientPhoto.tsx, Medicos.tsx)
--   - exibição gera link assinado na hora, via <StorageAvatarImage> /
--     <StorageImg> (src/components/StorageImage.tsx)
--   - registros antigos guardam URL completa e continuam sendo usados como
--     estão — deixarão de abrir quando o bucket fechar, e a foto pode ser
--     reenviada pela própria tela
--
-- ORDEM DE APLICAÇÃO: deploy do frontend PRIMEIRO, depois esta migration.
-- Invertendo a ordem, as fotos somem até o deploy sair.
-- ============================================================================

BEGIN;

UPDATE storage.buckets SET public = false WHERE id = 'patient-photos';

DROP POLICY IF EXISTS "Authenticated users can view patient photos"   ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload patient photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update patient photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete patient photos" ON storage.objects;
DROP POLICY IF EXISTS "patient_photos_select_scoped" ON storage.objects;
DROP POLICY IF EXISTS "patient_photos_write_scoped"  ON storage.objects;

-- Paths em uso: '<paciente_id>/<arquivo>' e '<medico_id>/<arquivo>'
CREATE OR REPLACE FUNCTION public.storage_patient_photo_allowed(_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate  uuid;
  my_clinica uuid;
BEGIN
  my_clinica := public.get_my_clinica_id();
  IF my_clinica IS NULL OR _name IS NULL THEN
    RETURN false;
  END IF;

  BEGIN
    candidate := (string_to_array(_name, '/'))[1]::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;

  RETURN EXISTS (SELECT 1 FROM public.pacientes WHERE id = candidate AND clinica_id = my_clinica)
      OR EXISTS (SELECT 1 FROM public.medicos   WHERE id = candidate AND clinica_id = my_clinica);
END;
$$;

GRANT EXECUTE ON FUNCTION public.storage_patient_photo_allowed(text) TO authenticated;

CREATE POLICY "patient_photos_select_scoped" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'patient-photos' AND public.storage_patient_photo_allowed(name));

CREATE POLICY "patient_photos_write_scoped" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'patient-photos' AND public.storage_patient_photo_allowed(name))
  WITH CHECK (bucket_id = 'patient-photos' AND public.storage_patient_photo_allowed(name));

COMMIT;
