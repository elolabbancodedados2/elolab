CREATE TABLE IF NOT EXISTS public.clinical_safety_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  reporter_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reporter_confidential boolean NOT NULL DEFAULT true,
  category text NOT NULL CHECK (category IN ('adverse_event', 'near_miss', 'unsafe_condition', 'medication', 'fall', 'infection', 'equipment', 'other')),
  severity text NOT NULL CHECK (severity IN ('low', 'moderate', 'high', 'critical')),
  occurred_at timestamptz NOT NULL,
  location_label text NOT NULL DEFAULT '' CHECK (length(location_label) <= 120),
  summary text NOT NULL CHECK (length(trim(summary)) BETWEEN 20 AND 4000),
  immediate_action text NOT NULL DEFAULT '' CHECK (length(immediate_action) <= 2000),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'triage', 'investigating', 'action_required', 'monitoring', 'closed', 'reopened')),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  CHECK (status <> 'action_required' OR (assigned_to IS NOT NULL AND due_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS clinical_safety_reports_clinic_status_created_idx
  ON public.clinical_safety_reports (clinic_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS clinical_safety_reports_reporter_created_idx
  ON public.clinical_safety_reports (reporter_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS clinical_safety_reports_assigned_due_idx
  ON public.clinical_safety_reports (assigned_to, due_at) WHERE assigned_to IS NOT NULL;
ALTER TABLE public.clinical_safety_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.clinical_safety_reports FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.clinical_safety_reports TO service_role;

CREATE TABLE IF NOT EXISTS public.clinical_safety_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.clinical_safety_reports(id) ON DELETE CASCADE,
  clinic_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  from_status text,
  to_status text NOT NULL CHECK (to_status IN ('submitted', 'triage', 'investigating', 'action_required', 'monitoring', 'closed', 'reopened')),
  review_note text NOT NULL CHECK (length(trim(review_note)) BETWEEN 3 AND 3000),
  corrective_action text NOT NULL DEFAULT '' CHECK (length(corrective_action) <= 3000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clinical_safety_updates_report_created_idx ON public.clinical_safety_updates (report_id, created_at DESC);
ALTER TABLE public.clinical_safety_updates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.clinical_safety_updates FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.clinical_safety_updates TO service_role;

CREATE TABLE IF NOT EXISTS public.clinical_safety_access_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clinic_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  report_id uuid NOT NULL REFERENCES public.clinical_safety_reports(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('list', 'view', 'create', 'update', 'correction_request', 'correction_review')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clinical_safety_access_audit_report_created_idx ON public.clinical_safety_access_audit (report_id, created_at DESC);
ALTER TABLE public.clinical_safety_access_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.clinical_safety_access_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.clinical_safety_access_audit TO service_role;

CREATE OR REPLACE FUNCTION public.create_clinical_safety_report(
  p_clinic_id uuid,
  p_actor_user_id uuid,
  p_reporter_confidential boolean,
  p_category text,
  p_severity text,
  p_occurred_at timestamptz,
  p_location_label text,
  p_summary text,
  p_immediate_action text
)
RETURNS TABLE(report_id uuid, report_status text, report_created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_report public.clinical_safety_reports%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_actor_user_id AND p.clinica_id = p_clinic_id AND COALESCE(p.ativo, true)
  ) OR NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p_actor_user_id AND ur.role::text IN ('admin', 'medico', 'enfermagem')
  ) THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  INSERT INTO public.clinical_safety_reports (
    clinic_id, reporter_user_id, reporter_confidential, category, severity,
    occurred_at, location_label, summary, immediate_action
  ) VALUES (
    p_clinic_id, p_actor_user_id, p_reporter_confidential, p_category, p_severity,
    p_occurred_at, p_location_label, p_summary, p_immediate_action
  ) RETURNING * INTO v_report;

  INSERT INTO public.clinical_safety_access_audit (clinic_id, report_id, actor_user_id, action)
  VALUES (p_clinic_id, v_report.id, p_actor_user_id, 'create');

  RETURN QUERY SELECT v_report.id, v_report.status, v_report.created_at;
END;
$$;
REVOKE ALL ON FUNCTION public.create_clinical_safety_report(uuid, uuid, boolean, text, text, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_clinical_safety_report(uuid, uuid, boolean, text, text, timestamptz, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_clinical_safety_review(
  p_report_id uuid,
  p_clinic_id uuid,
  p_actor_user_id uuid,
  p_expected_updated_at timestamptz,
  p_status text,
  p_assigned_to uuid,
  p_due_at timestamptz,
  p_review_note text,
  p_corrective_action text
)
RETURNS TABLE(report_id uuid, report_status text, report_updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_report public.clinical_safety_reports%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_from_status text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_actor_user_id AND p.clinica_id = p_clinic_id AND COALESCE(p.ativo, true)
  ) OR NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p_actor_user_id AND ur.role::text = 'admin'
  ) THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;
  IF p_status NOT IN ('submitted', 'triage', 'investigating', 'action_required', 'monitoring', 'closed', 'reopened')
    OR length(trim(p_review_note)) NOT BETWEEN 3 AND 3000
    OR length(p_corrective_action) > 3000
    OR (p_status = 'action_required' AND (p_assigned_to IS NULL OR p_due_at IS NULL)) THEN
    RAISE EXCEPTION 'Revisão inválida';
  END IF;
  IF p_assigned_to IS NOT NULL AND (
    NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_assigned_to AND p.clinica_id = p_clinic_id AND COALESCE(p.ativo, true))
    OR NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p_assigned_to AND ur.role::text IN ('admin', 'medico', 'enfermagem'))
  ) THEN
    RAISE EXCEPTION 'Responsável fora da clínica';
  END IF;

  SELECT r.status INTO v_from_status FROM public.clinical_safety_reports r
  WHERE r.id = p_report_id AND r.clinic_id = p_clinic_id AND r.updated_at = p_expected_updated_at
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public.clinical_safety_reports r SET
    status = p_status, assigned_to = p_assigned_to, due_at = p_due_at,
    updated_at = v_now, closed_at = CASE WHEN p_status = 'closed' THEN v_now ELSE NULL END
  WHERE r.id = p_report_id AND r.clinic_id = p_clinic_id AND r.updated_at = p_expected_updated_at
  RETURNING r.* INTO v_report;
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public.clinical_safety_updates (
    report_id, clinic_id, actor_user_id, from_status, to_status, review_note, corrective_action
  ) VALUES (
    p_report_id, p_clinic_id, p_actor_user_id, v_from_status, p_status, trim(p_review_note), p_corrective_action
  );
  INSERT INTO public.clinical_safety_access_audit (clinic_id, report_id, actor_user_id, action)
  VALUES (p_clinic_id, p_report_id, p_actor_user_id, 'update');

  RETURN QUERY SELECT v_report.id, v_report.status, v_report.updated_at;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_clinical_safety_review(uuid, uuid, uuid, timestamptz, text, uuid, timestamptz, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_clinical_safety_review(uuid, uuid, uuid, timestamptz, text, uuid, timestamptz, text, text) TO service_role;

CREATE TABLE IF NOT EXISTS public.clinical_safety_correction_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.clinical_safety_reports(id) ON DELETE CASCADE,
  clinic_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  requester_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  previous_summary text NOT NULL,
  previous_immediate_action text NOT NULL,
  proposed_summary text NOT NULL CHECK (length(trim(proposed_summary)) BETWEEN 20 AND 4000),
  proposed_immediate_action text NOT NULL DEFAULT '' CHECK (length(proposed_immediate_action) <= 2000),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 1000),
  report_updated_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  CHECK ((status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL) OR (status <> 'pending' AND reviewed_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS clinical_safety_one_pending_correction_idx
  ON public.clinical_safety_correction_requests (report_id, requester_user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS clinical_safety_corrections_clinic_created_idx
  ON public.clinical_safety_correction_requests (clinic_id, status, created_at DESC);
ALTER TABLE public.clinical_safety_correction_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.clinical_safety_correction_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.clinical_safety_correction_requests TO service_role;

CREATE OR REPLACE FUNCTION public.create_clinical_safety_correction_request(
  p_report_id uuid,
  p_clinic_id uuid,
  p_actor_user_id uuid,
  p_proposed_summary text,
  p_proposed_immediate_action text,
  p_reason text
)
RETURNS TABLE(request_id uuid, request_status text, request_created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_report public.clinical_safety_reports%ROWTYPE;
  v_request public.clinical_safety_correction_requests%ROWTYPE;
BEGIN
  SELECT r.* INTO v_report FROM public.clinical_safety_reports r
  WHERE r.id = p_report_id AND r.clinic_id = p_clinic_id AND r.reporter_user_id = p_actor_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Relato não encontrado'; END IF;
  IF length(trim(p_reason)) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'Motivo inválido'; END IF;

  INSERT INTO public.clinical_safety_correction_requests (
    report_id, clinic_id, requester_user_id, previous_summary, previous_immediate_action,
    proposed_summary, proposed_immediate_action, reason, report_updated_at
  ) VALUES (
    p_report_id, p_clinic_id, p_actor_user_id, v_report.summary, v_report.immediate_action,
    p_proposed_summary, p_proposed_immediate_action, trim(p_reason), v_report.updated_at
  ) RETURNING * INTO v_request;

  INSERT INTO public.clinical_safety_access_audit (clinic_id, report_id, actor_user_id, action)
  VALUES (p_clinic_id, p_report_id, p_actor_user_id, 'correction_request');
  RETURN QUERY SELECT v_request.id, v_request.status, v_request.created_at;
END;
$$;
REVOKE ALL ON FUNCTION public.create_clinical_safety_correction_request(uuid, uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_clinical_safety_correction_request(uuid, uuid, uuid, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.resolve_clinical_safety_correction(
  p_request_id uuid,
  p_clinic_id uuid,
  p_actor_user_id uuid,
  p_expected_report_updated_at timestamptz,
  p_status text,
  p_review_note text
)
RETURNS TABLE(request_id uuid, request_status text, report_updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request public.clinical_safety_correction_requests%ROWTYPE;
  v_report_updated_at timestamptz;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = p_actor_user_id AND p.clinica_id = p_clinic_id AND COALESCE(p.ativo, true)
  ) OR NOT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p_actor_user_id AND ur.role::text = 'admin'
  ) THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
  IF p_status NOT IN ('approved', 'rejected') OR length(trim(p_review_note)) NOT BETWEEN 3 AND 2000 THEN
    RAISE EXCEPTION 'Decisão inválida';
  END IF;

  SELECT c.* INTO v_request FROM public.clinical_safety_correction_requests c
  WHERE c.id = p_request_id AND c.clinic_id = p_clinic_id AND c.status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  IF p_status = 'approved' THEN
    IF v_request.report_updated_at <> p_expected_report_updated_at THEN RETURN; END IF;
    UPDATE public.clinical_safety_reports r SET
      summary = v_request.proposed_summary,
      immediate_action = v_request.proposed_immediate_action,
      updated_at = clock_timestamp()
    WHERE r.id = v_request.report_id AND r.clinic_id = p_clinic_id AND r.updated_at = p_expected_report_updated_at
    RETURNING r.updated_at INTO v_report_updated_at;
    IF NOT FOUND THEN RETURN; END IF;
  ELSE
    v_report_updated_at := p_expected_report_updated_at;
  END IF;

  UPDATE public.clinical_safety_correction_requests c SET
    status = p_status, reviewed_by = p_actor_user_id, review_note = trim(p_review_note), reviewed_at = clock_timestamp()
  WHERE c.id = p_request_id AND c.status = 'pending';
  INSERT INTO public.clinical_safety_updates (
    report_id, clinic_id, actor_user_id, from_status, to_status, review_note, corrective_action
  ) SELECT v_request.report_id, p_clinic_id, p_actor_user_id, r.status, r.status, trim(p_review_note),
    CASE WHEN p_status = 'approved' THEN 'Retificação aprovada e aplicada com versão anterior preservada.' ELSE 'Pedido de retificação analisado e recusado.' END
    FROM public.clinical_safety_reports r WHERE r.id = v_request.report_id AND r.clinic_id = p_clinic_id
ON CONFLICT DO NOTHING;
  INSERT INTO public.clinical_safety_access_audit (clinic_id, report_id, actor_user_id, action)
  VALUES (p_clinic_id, v_request.report_id, p_actor_user_id, 'correction_review');

  RETURN QUERY SELECT p_request_id, p_status, v_report_updated_at;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_clinical_safety_correction(uuid, uuid, uuid, timestamptz, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_clinical_safety_correction(uuid, uuid, uuid, timestamptz, text, text) TO service_role;
