BEGIN;

CREATE TABLE public.clinic_equipment_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  room_id uuid REFERENCES public.salas(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 160),
  category text NOT NULL CHECK (category IN ('clinical', 'diagnostic', 'it', 'facility', 'other')),
  manufacturer text CHECK (manufacturer IS NULL OR length(manufacturer) <= 120),
  model text CHECK (model IS NULL OR length(model) <= 120),
  serial_number text CHECK (serial_number IS NULL OR length(serial_number) <= 120),
  asset_tag text CHECK (asset_tag IS NULL OR length(asset_tag) <= 80),
  acquired_on date,
  warranty_until date,
  calibration_due date,
  maintenance_interval_days integer CHECK (maintenance_interval_days IS NULL OR maintenance_interval_days BETWEEN 1 AND 3650),
  responsible_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'unavailable', 'retired')),
  block_room_when_unavailable boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, asset_tag)
);

CREATE TABLE public.clinic_equipment_work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.clinic_equipment_assets(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('preventive', 'corrective', 'calibration', 'inspection')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 3 AND 160),
  description text CHECK (description IS NULL OR length(description) <= 2000),
  due_on date,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  opened_by uuid NOT NULL REFERENCES auth.users(id),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  completion_note text CHECK (completion_note IS NULL OR length(completion_note) <= 2000),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'completed' AND completed_at IS NOT NULL) OR (status <> 'completed' AND completed_at IS NULL))
);
CREATE INDEX clinic_equipment_orders_due ON public.clinic_equipment_work_orders (clinic_id, status, due_on);
CREATE INDEX clinic_equipment_assets_calibration ON public.clinic_equipment_assets (clinic_id, calibration_due);

CREATE TABLE public.clinic_equipment_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.clinic_equipment_assets(id) ON DELETE RESTRICT,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL CHECK (length(trim(file_name)) BETWEEN 1 AND 180),
  content_type text NOT NULL CHECK (content_type IN ('application/pdf', 'image/jpeg', 'image/png')),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 10485760),
  uploaded_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.clinic_equipment_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clinic_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES public.clinic_equipment_assets(id) ON DELETE SET NULL,
  work_order_id uuid REFERENCES public.clinic_equipment_work_orders(id) ON DELETE SET NULL,
  document_id uuid REFERENCES public.clinic_equipment_documents(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('asset_created', 'asset_updated', 'order_created', 'order_updated', 'document_added')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clinic_equipment_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_equipment_work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_equipment_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_equipment_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.clinic_equipment_assets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.clinic_equipment_work_orders FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.clinic_equipment_documents FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.clinic_equipment_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.clinic_equipment_assets TO service_role;
GRANT ALL ON TABLE public.clinic_equipment_work_orders TO service_role;
GRANT ALL ON TABLE public.clinic_equipment_documents TO service_role;
GRANT ALL ON TABLE public.clinic_equipment_audit TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.clinic_equipment_audit_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.validate_clinic_equipment_asset()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_room_clinic uuid; v_user_clinic uuid; v_user_active boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.clinic_id IS DISTINCT FROM OLD.clinic_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
    RAISE EXCEPTION 'Identidade do ativo é imutável' USING ERRCODE = '42501';
  END IF;
  IF NEW.room_id IS NOT NULL THEN
    SELECT s.clinica_id INTO v_room_clinic FROM public.salas s WHERE s.id = NEW.room_id;
    IF v_room_clinic IS DISTINCT FROM NEW.clinic_id THEN RAISE EXCEPTION 'Sala de outra clínica' USING ERRCODE = '23514'; END IF;
  END IF;
  IF NEW.responsible_user_id IS NOT NULL THEN
    SELECT p.clinica_id, p.ativo INTO v_user_clinic, v_user_active FROM public.profiles p WHERE p.id = NEW.responsible_user_id;
    IF v_user_clinic IS DISTINCT FROM NEW.clinic_id OR v_user_active IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Responsável deve estar ativo na mesma clínica' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.clinica_id = NEW.clinic_id AND p.ativo IS TRUE
  ) THEN RAISE EXCEPTION 'Acesso não autorizado' USING ERRCODE = '42501'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER clinic_equipment_asset_validate BEFORE INSERT OR UPDATE ON public.clinic_equipment_assets
  FOR EACH ROW EXECUTE FUNCTION public.validate_clinic_equipment_asset();

CREATE OR REPLACE FUNCTION public.validate_clinic_equipment_work_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_asset_clinic uuid; v_assignee_clinic uuid; v_assignee_active boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.clinic_id IS DISTINCT FROM OLD.clinic_id
     OR NEW.asset_id IS DISTINCT FROM OLD.asset_id OR NEW.opened_by IS DISTINCT FROM OLD.opened_by OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
    RAISE EXCEPTION 'Identidade da ordem é imutável' USING ERRCODE = '42501';
  END IF;
  SELECT a.clinic_id INTO v_asset_clinic FROM public.clinic_equipment_assets a WHERE a.id = NEW.asset_id;
  IF v_asset_clinic IS DISTINCT FROM NEW.clinic_id THEN RAISE EXCEPTION 'Ativo de outra clínica' USING ERRCODE = '23514'; END IF;
  IF NEW.assigned_to IS NOT NULL THEN
    SELECT p.clinica_id, p.ativo INTO v_assignee_clinic, v_assignee_active FROM public.profiles p WHERE p.id = NEW.assigned_to;
    IF v_assignee_clinic IS DISTINCT FROM NEW.clinic_id OR v_assignee_active IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Responsável deve estar ativo na mesma clínica' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN NEW.completed_at := now(); END IF;
  IF NEW.status <> 'completed' THEN NEW.completed_at := NULL; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER clinic_equipment_order_validate BEFORE INSERT OR UPDATE ON public.clinic_equipment_work_orders
  FOR EACH ROW EXECUTE FUNCTION public.validate_clinic_equipment_work_order();

CREATE OR REPLACE FUNCTION public.validate_clinic_equipment_document()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_asset_clinic uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'Documento registrado é imutável' USING ERRCODE = '42501'; END IF;
  SELECT a.clinic_id INTO v_asset_clinic FROM public.clinic_equipment_assets a WHERE a.id = NEW.asset_id;
  IF v_asset_clinic IS DISTINCT FROM NEW.clinic_id THEN RAISE EXCEPTION 'Ativo de outra clínica' USING ERRCODE = '23514'; END IF;
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.clinica_id = NEW.clinic_id AND p.ativo IS TRUE
  ) THEN RAISE EXCEPTION 'Acesso não autorizado' USING ERRCODE = '42501'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER clinic_equipment_document_validate BEFORE INSERT OR UPDATE ON public.clinic_equipment_documents
  FOR EACH ROW EXECUTE FUNCTION public.validate_clinic_equipment_document();

CREATE OR REPLACE FUNCTION public.audit_clinic_equipment_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor uuid; v_asset_id uuid; v_order_id uuid; v_doc_id uuid; v_action text; v_details jsonb;
BEGIN
  IF TG_TABLE_NAME = 'clinic_equipment_assets' THEN
    v_actor := COALESCE(auth.uid(), NEW.updated_by, NEW.created_by);
    v_asset_id := NEW.id; v_action := CASE WHEN TG_OP = 'INSERT' THEN 'asset_created' ELSE 'asset_updated' END;
    v_details := jsonb_build_object('status', NEW.status, 'room_id', NEW.room_id, 'calibration_due', NEW.calibration_due);
  ELSIF TG_TABLE_NAME = 'clinic_equipment_work_orders' THEN
    v_actor := COALESCE(auth.uid(), NEW.updated_by, NEW.opened_by);
    v_asset_id := NEW.asset_id; v_order_id := NEW.id;
    v_action := CASE WHEN TG_OP = 'INSERT' THEN 'order_created' ELSE 'order_updated' END;
    v_details := jsonb_build_object('kind', NEW.kind, 'status', NEW.status, 'priority', NEW.priority, 'due_on', NEW.due_on);
  ELSE
    v_actor := COALESCE(auth.uid(), NEW.uploaded_by);
    v_asset_id := NEW.asset_id; v_doc_id := NEW.id; v_action := 'document_added';
    v_details := jsonb_build_object('content_type', NEW.content_type, 'byte_size', NEW.byte_size);
  END IF;
  INSERT INTO public.clinic_equipment_audit(clinic_id, asset_id, work_order_id, document_id, actor_id, action, details)
  VALUES (NEW.clinic_id, v_asset_id, v_order_id, v_doc_id, v_actor, v_action, v_details);
  RETURN NEW;
END;
$$;
CREATE TRIGGER clinic_equipment_asset_audit AFTER INSERT OR UPDATE ON public.clinic_equipment_assets
  FOR EACH ROW EXECUTE FUNCTION public.audit_clinic_equipment_change();
CREATE TRIGGER clinic_equipment_order_audit AFTER INSERT OR UPDATE ON public.clinic_equipment_work_orders
  FOR EACH ROW EXECUTE FUNCTION public.audit_clinic_equipment_change();
CREATE TRIGGER clinic_equipment_document_audit AFTER INSERT ON public.clinic_equipment_documents
  FOR EACH ROW EXECUTE FUNCTION public.audit_clinic_equipment_change();

CREATE OR REPLACE FUNCTION public.sync_clinic_equipment_room_block()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.room_id IS NOT NULL AND NEW.block_room_when_unavailable AND NEW.status IN ('maintenance', 'unavailable', 'retired') THEN
    UPDATE public.salas SET status = 'manutencao'
     WHERE id = NEW.room_id AND clinica_id = NEW.clinic_id AND status = 'disponivel';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER clinic_equipment_block_room AFTER INSERT OR UPDATE
  ON public.clinic_equipment_assets FOR EACH ROW EXECUTE FUNCTION public.sync_clinic_equipment_room_block();

CREATE OR REPLACE FUNCTION public.protect_room_equipment_availability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'disponivel' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) AND EXISTS (
    SELECT 1 FROM public.clinic_equipment_assets a WHERE a.room_id = NEW.id AND a.clinic_id = NEW.clinica_id
      AND a.block_room_when_unavailable AND a.status IN ('maintenance', 'unavailable', 'retired')
  ) THEN RAISE EXCEPTION 'A sala tem equipamento indisponível que bloqueia sua liberação' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER clinic_equipment_room_availability BEFORE INSERT OR UPDATE ON public.salas
  FOR EACH ROW EXECUTE FUNCTION public.protect_room_equipment_availability();

CREATE OR REPLACE FUNCTION public.protect_room_hygiene_room_release()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF ((OLD.status = 'limpeza' AND NEW.status = 'disponivel') OR (OLD.status = 'ocupado' AND NEW.status = 'disponivel'))
     AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'A sala só pode ser liberada após inspeção aprovada' USING ERRCODE = '42501';
  END IF;
  IF NEW.status = 'disponivel' AND EXISTS (
    SELECT 1 FROM public.clinic_equipment_assets a WHERE a.room_id = NEW.id AND a.clinic_id = NEW.clinica_id
      AND a.block_room_when_unavailable AND a.status IN ('maintenance', 'unavailable', 'retired')
  ) THEN RAISE EXCEPTION 'A sala tem equipamento indisponível que bloqueia sua liberação' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_clinic_equipment_immutable_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Registro histórico de equipamento é imutável' USING ERRCODE = '42501';
END;
$$;
CREATE TRIGGER clinic_equipment_asset_no_delete BEFORE DELETE ON public.clinic_equipment_assets
  FOR EACH ROW EXECUTE FUNCTION public.reject_clinic_equipment_immutable_change();
CREATE TRIGGER clinic_equipment_order_no_delete BEFORE DELETE ON public.clinic_equipment_work_orders
  FOR EACH ROW EXECUTE FUNCTION public.reject_clinic_equipment_immutable_change();

INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('clinic-equipment-documents', 'clinic-equipment-documents', false, 10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png'];

DROP POLICY IF EXISTS clinic_equipment_docs_upload ON storage.objects;
CREATE POLICY clinic_equipment_docs_upload ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'clinic-equipment-documents' AND (storage.foldername(name))[1] = public.get_my_clinica_id()::text
    AND (public.is_admin(auth.uid()) OR public.is_enfermagem(auth.uid()))
    AND EXISTS (SELECT 1 FROM public.clinic_equipment_assets a WHERE a.id = ((storage.foldername(name))[2])::uuid AND a.clinic_id = public.get_my_clinica_id()));
DROP POLICY IF EXISTS clinic_equipment_docs_read ON storage.objects;
CREATE POLICY clinic_equipment_docs_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'clinic-equipment-documents' AND (storage.foldername(name))[1] = public.get_my_clinica_id()::text
    AND (public.is_admin(auth.uid()) OR public.is_enfermagem(auth.uid())));
CREATE TRIGGER clinic_equipment_audit_no_update BEFORE UPDATE ON public.clinic_equipment_audit
  FOR EACH ROW EXECUTE FUNCTION public.reject_clinic_equipment_immutable_change();
CREATE TRIGGER clinic_equipment_audit_no_delete BEFORE DELETE ON public.clinic_equipment_audit
  FOR EACH ROW EXECUTE FUNCTION public.reject_clinic_equipment_immutable_change();
CREATE TRIGGER clinic_equipment_document_no_update BEFORE UPDATE ON public.clinic_equipment_documents
  FOR EACH ROW EXECUTE FUNCTION public.reject_clinic_equipment_immutable_change();
CREATE TRIGGER clinic_equipment_document_no_delete BEFORE DELETE ON public.clinic_equipment_documents
  FOR EACH ROW EXECUTE FUNCTION public.reject_clinic_equipment_immutable_change();

REVOKE ALL ON FUNCTION public.validate_clinic_equipment_asset() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_clinic_equipment_work_order() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_clinic_equipment_document() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_clinic_equipment_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_clinic_equipment_room_block() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_room_equipment_availability() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_clinic_equipment_immutable_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_clinic_equipment_asset() TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_clinic_equipment_work_order() TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_clinic_equipment_document() TO service_role;
GRANT EXECUTE ON FUNCTION public.audit_clinic_equipment_change() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_clinic_equipment_room_block() TO service_role;
GRANT EXECUTE ON FUNCTION public.protect_room_equipment_availability() TO service_role;
GRANT EXECUTE ON FUNCTION public.reject_clinic_equipment_immutable_change() TO service_role;

COMMIT;
