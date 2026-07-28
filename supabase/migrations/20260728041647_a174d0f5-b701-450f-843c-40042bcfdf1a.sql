
-- =====================================================================
-- 1. TENANT-SCOPED DELETE POLICIES (replace admin-only global DELETE)
-- =====================================================================
DROP POLICY IF EXISTS resultados_delete ON public.resultados_laboratorio;
CREATE POLICY resultados_delete ON public.resultados_laboratorio FOR DELETE TO authenticated
  USING (is_admin(auth.uid()) AND is_same_clinica(clinica_id));

DROP POLICY IF EXISTS encaminhamentos_delete ON public.encaminhamentos;
CREATE POLICY encaminhamentos_delete ON public.encaminhamentos FOR DELETE TO authenticated
  USING (is_admin(auth.uid()) AND is_same_clinica(clinica_id));

DROP POLICY IF EXISTS retornos_delete ON public.retornos;
CREATE POLICY retornos_delete ON public.retornos FOR DELETE TO authenticated
  USING (is_admin(auth.uid()) AND is_same_clinica(clinica_id));

DROP POLICY IF EXISTS protocolos_delete ON public.protocolos_clinicos;
CREATE POLICY protocolos_delete ON public.protocolos_clinicos FOR DELETE TO authenticated
  USING (is_admin(auth.uid()) AND is_same_clinica(clinica_id));

DROP POLICY IF EXISTS pagamentos_mp_delete ON public.pagamentos_mercadopago;
CREATE POLICY pagamentos_mp_delete ON public.pagamentos_mercadopago FOR DELETE TO authenticated
  USING (is_admin(auth.uid()) AND is_same_clinica(clinica_id));

DROP POLICY IF EXISTS assinaturas_mp_delete ON public.assinaturas_mercadopago;
CREATE POLICY assinaturas_mp_delete ON public.assinaturas_mercadopago FOR DELETE TO authenticated
  USING (is_admin(auth.uid()) AND is_same_clinica(clinica_id));

DROP POLICY IF EXISTS consentimentos_delete ON public.consentimentos_lgpd;
CREATE POLICY consentimentos_delete ON public.consentimentos_lgpd FOR DELETE TO authenticated
  USING (is_admin(auth.uid()) AND is_same_clinica(clinica_id));

DROP POLICY IF EXISTS coletas_delete ON public.coletas_laboratorio;
CREATE POLICY coletas_delete ON public.coletas_laboratorio FOR DELETE TO authenticated
  USING (is_admin(auth.uid()) AND is_same_clinica(clinica_id));

-- Templates: drop old unscoped duplicate, keep the scoped one already in place
DROP POLICY IF EXISTS templates_prescricao_delete ON public.templates_prescricao;
DROP POLICY IF EXISTS templates_atestado_delete ON public.templates_atestado;

-- =====================================================================
-- 2. RESULTADOS_LABORATORIO — clinic scope on INSERT/UPDATE
-- =====================================================================
DROP POLICY IF EXISTS resultados_insert ON public.resultados_laboratorio;
CREATE POLICY resultados_insert ON public.resultados_laboratorio FOR INSERT TO authenticated
  WITH CHECK (can_access_clinical(auth.uid())
              AND ((clinica_id = get_my_clinica_id()) OR (clinica_id IS NULL)));

DROP POLICY IF EXISTS resultados_update ON public.resultados_laboratorio;
CREATE POLICY resultados_update ON public.resultados_laboratorio FOR UPDATE TO authenticated
  USING (can_access_clinical(auth.uid()) AND is_same_clinica(clinica_id))
  WITH CHECK (can_access_clinical(auth.uid()) AND is_same_clinica(clinica_id));

-- =====================================================================
-- 3. FEEDBACKS_NPS — remove public SELECT
-- =====================================================================
DROP POLICY IF EXISTS nps_select_policy ON public.feedbacks_nps;
CREATE POLICY nps_select_policy ON public.feedbacks_nps FOR SELECT TO authenticated
  USING (
    has_any_role(auth.uid())
    AND (
      paciente_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.pacientes p
        WHERE p.id = feedbacks_nps.paciente_id
          AND is_same_clinica(p.clinica_id)
      )
    )
  );

-- =====================================================================
-- 4. STORAGE — guias-externas (folder convention: {clinica_id}/...)
-- =====================================================================
DROP POLICY IF EXISTS guias_externas_storage_read ON storage.objects;
DROP POLICY IF EXISTS guias_externas_storage_insert ON storage.objects;
DROP POLICY IF EXISTS guias_externas_storage_delete ON storage.objects;

CREATE POLICY guias_externas_storage_read ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'guias-externas'
    AND has_any_role(auth.uid())
    AND (storage.foldername(name))[1] = get_my_clinica_id()::text
  );

CREATE POLICY guias_externas_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'guias-externas'
    AND has_any_role(auth.uid())
    AND (storage.foldername(name))[1] = get_my_clinica_id()::text
  );

CREATE POLICY guias_externas_storage_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'guias-externas'
    AND is_admin(auth.uid())
    AND (storage.foldername(name))[1] = get_my_clinica_id()::text
  );

-- =====================================================================
-- 5. STORAGE — patient-photos (folder = {paciente_id})
-- =====================================================================
DROP POLICY IF EXISTS "Authenticated users can view patient photos" ON storage.objects;
DROP POLICY IF EXISTS "Clinical staff can upload patient photos" ON storage.objects;
DROP POLICY IF EXISTS "Clinical staff can update patient photos" ON storage.objects;
DROP POLICY IF EXISTS "Admin can delete patient photos" ON storage.objects;

CREATE POLICY patient_photos_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'patient-photos'
    AND EXISTS (
      SELECT 1 FROM public.pacientes p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND is_same_clinica(p.clinica_id)
    )
  );

CREATE POLICY patient_photos_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'patient-photos'
    AND can_manage_data(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.pacientes p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND is_same_clinica(p.clinica_id)
    )
  );

CREATE POLICY patient_photos_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'patient-photos'
    AND can_manage_data(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.pacientes p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND is_same_clinica(p.clinica_id)
    )
  );

CREATE POLICY patient_photos_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'patient-photos'
    AND is_admin(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.pacientes p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND is_same_clinica(p.clinica_id)
    )
  );

-- =====================================================================
-- 6. PERFORMANCE INDEXES (from slow-query analysis)
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_notification_queue_status_agendado
  ON public.notification_queue (status, agendado_para, tentativas);
CREATE INDEX IF NOT EXISTS idx_notification_queue_clinica_created
  ON public.notification_queue (clinica_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pacientes_clinica_nome
  ON public.pacientes (clinica_id, nome);

CREATE INDEX IF NOT EXISTS idx_agendamentos_clinica_data
  ON public.agendamentos (clinica_id, data, status);
CREATE INDEX IF NOT EXISTS idx_agendamentos_paciente
  ON public.agendamentos (paciente_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_medico
  ON public.agendamentos (medico_id);

CREATE INDEX IF NOT EXISTS idx_lancamentos_clinica_data
  ON public.lancamentos (clinica_id, data DESC);

CREATE INDEX IF NOT EXISTS idx_profiles_created_at
  ON public.profiles (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_logs_clinica_created
  ON public.automation_logs (clinica_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_logs_created
  ON public.automation_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_templates_cat_tipo_ativo
  ON public.notification_templates (categoria, tipo, ativo);

CREATE INDEX IF NOT EXISTS idx_automation_settings_chave
  ON public.automation_settings (chave);
