BEGIN;

CREATE TABLE IF NOT EXISTS public.room_hygiene_checklist_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 3 AND 120),
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) BETWEEN 1 AND 40),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, version)
);

CREATE TABLE IF NOT EXISTS public.room_hygiene_active_checklists (
  clinic_id uuid PRIMARY KEY REFERENCES public.clinicas(id) ON DELETE CASCADE,
  checklist_version_id uuid NOT NULL UNIQUE REFERENCES public.room_hygiene_checklist_versions(id),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.room_hygiene_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.salas(id) ON DELETE RESTRICT,
  checklist_version_id uuid NOT NULL REFERENCES public.room_hygiene_checklist_versions(id),
  started_by uuid NOT NULL REFERENCES auth.users(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_by uuid REFERENCES auth.users(id),
  submitted_at timestamptz,
  completed_items jsonb,
  notes text CHECK (notes IS NULL OR length(notes) <= 1000),
  CHECK ((submitted_at IS NULL AND submitted_by IS NULL AND completed_items IS NULL) OR
         (submitted_at IS NOT NULL AND submitted_by IS NOT NULL AND jsonb_typeof(completed_items) = 'array'))
);

CREATE UNIQUE INDEX IF NOT EXISTS room_hygiene_one_open_execution_per_room
  ON public.room_hygiene_executions (clinic_id, room_id) WHERE submitted_at IS NULL;
CREATE INDEX IF NOT EXISTS room_hygiene_executions_by_clinic ON public.room_hygiene_executions (clinic_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.room_hygiene_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  execution_id uuid NOT NULL REFERENCES public.room_hygiene_executions(id) ON DELETE RESTRICT,
  reviewer_id uuid NOT NULL REFERENCES auth.users(id),
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  note text NOT NULL CHECK (length(trim(note)) BETWEEN 3 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.room_hygiene_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clinic_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  room_id uuid REFERENCES public.salas(id) ON DELETE SET NULL,
  execution_id uuid REFERENCES public.room_hygiene_executions(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('checklist_versioned', 'started', 'submitted', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.room_hygiene_checklist_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_hygiene_active_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_hygiene_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_hygiene_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_hygiene_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.room_hygiene_checklist_versions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.room_hygiene_active_checklists FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.room_hygiene_executions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.room_hygiene_reviews FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.room_hygiene_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.room_hygiene_checklist_versions TO service_role;
GRANT ALL ON TABLE public.room_hygiene_active_checklists TO service_role;
GRANT ALL ON TABLE public.room_hygiene_executions TO service_role;
GRANT ALL ON TABLE public.room_hygiene_reviews TO service_role;
GRANT ALL ON TABLE public.room_hygiene_audit TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.room_hygiene_audit_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.create_room_hygiene_checklist(
  p_clinic_id uuid, p_actor_id uuid, p_title text, p_items jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_version integer; v_id uuid;
BEGIN
  IF p_clinic_id IS DISTINCT FROM (SELECT p.clinica_id FROM public.profiles p WHERE p.id = p_actor_id AND p.ativo IS TRUE)
     OR NOT public.is_admin(p_actor_id) THEN
    RAISE EXCEPTION 'Acesso não autorizado' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'Checklist inválido' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.clinicas WHERE id = p_clinic_id FOR UPDATE;
  SELECT COALESCE(max(version), 0) + 1 INTO v_version FROM public.room_hygiene_checklist_versions WHERE clinic_id = p_clinic_id;
  INSERT INTO public.room_hygiene_checklist_versions(clinic_id, version, title, items, created_by)
  VALUES (p_clinic_id, v_version, trim(p_title), p_items, p_actor_id) RETURNING id INTO v_id;
  INSERT INTO public.room_hygiene_active_checklists(clinic_id, checklist_version_id, updated_by)
  VALUES (p_clinic_id, v_id, p_actor_id)
  ON CONFLICT (clinic_id) DO UPDATE SET checklist_version_id = EXCLUDED.checklist_version_id,
    updated_by = EXCLUDED.updated_by, updated_at = now();
  INSERT INTO public.room_hygiene_audit(clinic_id, actor_id, action) VALUES (p_clinic_id, p_actor_id, 'checklist_versioned');
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_room_hygiene_execution(
  p_clinic_id uuid, p_actor_id uuid, p_room_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_checklist uuid; v_execution uuid; v_room_status text;
BEGIN
  IF p_clinic_id IS DISTINCT FROM (SELECT p.clinica_id FROM public.profiles p WHERE p.id = p_actor_id AND p.ativo IS TRUE) OR NOT (
    public.is_admin(p_actor_id) OR public.is_recepcao(p_actor_id) OR public.is_enfermagem(p_actor_id)
  ) THEN RAISE EXCEPTION 'Acesso não autorizado' USING ERRCODE = '42501'; END IF;
  SELECT a.checklist_version_id INTO v_checklist FROM public.room_hygiene_active_checklists a WHERE a.clinic_id = p_clinic_id;
  IF v_checklist IS NULL THEN RAISE EXCEPTION 'Configure um checklist antes de iniciar a higienização' USING ERRCODE = '23514'; END IF;
  SELECT s.status::text INTO v_room_status FROM public.salas s WHERE s.id = p_room_id AND s.clinica_id = p_clinic_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sala não encontrada nesta clínica' USING ERRCODE = '42501'; END IF;
  IF v_room_status = 'ocupado' OR v_room_status = 'manutencao' THEN
    RAISE EXCEPTION 'Sala em uso ou manutenção não pode iniciar higienização' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.room_hygiene_executions e LEFT JOIN public.room_hygiene_reviews r ON r.execution_id = e.id
    WHERE e.clinic_id = p_clinic_id AND e.room_id = p_room_id AND e.submitted_at IS NOT NULL AND r.id IS NULL) THEN
    RAISE EXCEPTION 'A inspeção da higienização anterior ainda está pendente' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.room_hygiene_executions(clinic_id, room_id, checklist_version_id, started_by)
  VALUES (p_clinic_id, p_room_id, v_checklist, p_actor_id) RETURNING id INTO v_execution;
  UPDATE public.salas SET status = 'limpeza' WHERE id = p_room_id AND clinica_id = p_clinic_id;
  INSERT INTO public.room_hygiene_audit(clinic_id, room_id, execution_id, actor_id, action)
  VALUES (p_clinic_id, p_room_id, v_execution, p_actor_id, 'started');
  RETURN v_execution;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_room_hygiene_execution(
  p_clinic_id uuid, p_actor_id uuid, p_execution_id uuid, p_completed_items jsonb, p_notes text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_execution public.room_hygiene_executions%ROWTYPE; v_items jsonb;
BEGIN
  IF p_clinic_id IS DISTINCT FROM (SELECT p.clinica_id FROM public.profiles p WHERE p.id = p_actor_id AND p.ativo IS TRUE) OR NOT (
    public.is_admin(p_actor_id) OR public.is_recepcao(p_actor_id) OR public.is_enfermagem(p_actor_id)
  ) THEN RAISE EXCEPTION 'Acesso não autorizado' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_execution FROM public.room_hygiene_executions e
   WHERE e.id = p_execution_id AND e.clinic_id = p_clinic_id FOR UPDATE;
  IF NOT FOUND OR v_execution.submitted_at IS NOT NULL THEN RAISE EXCEPTION 'Execução indisponível' USING ERRCODE = '40001'; END IF;
  SELECT items INTO v_items FROM public.room_hygiene_checklist_versions WHERE id = v_execution.checklist_version_id AND clinic_id = p_clinic_id;
  IF jsonb_typeof(p_completed_items) <> 'array' OR jsonb_array_length(p_completed_items) <> jsonb_array_length(v_items)
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_completed_items) c
       WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_items) i
         WHERE i->>'id' = c->>'id' AND i->>'label' = c->>'label' AND i->>'required' = c->>'required'))
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_items) i WHERE COALESCE((i->>'required')::boolean, false)
       AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_completed_items) c WHERE c->>'id' = i->>'id' AND c->>'completed' = 'true')) THEN
    RAISE EXCEPTION 'Conclua todos os itens obrigatórios antes de enviar para revisão' USING ERRCODE = '23514';
  END IF;
  UPDATE public.room_hygiene_executions SET submitted_at = now(), submitted_by = p_actor_id,
    completed_items = p_completed_items, notes = NULLIF(trim(p_notes), '') WHERE id = p_execution_id;
  INSERT INTO public.room_hygiene_audit(clinic_id, room_id, execution_id, actor_id, action)
  VALUES (p_clinic_id, v_execution.room_id, p_execution_id, p_actor_id, 'submitted');
END;
$$;

CREATE OR REPLACE FUNCTION public.review_room_hygiene_execution(
  p_clinic_id uuid, p_actor_id uuid, p_execution_id uuid, p_decision text, p_note text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_execution public.room_hygiene_executions%ROWTYPE;
BEGIN
  IF p_clinic_id IS DISTINCT FROM (SELECT p.clinica_id FROM public.profiles p WHERE p.id = p_actor_id AND p.ativo IS TRUE) OR NOT (
    public.is_admin(p_actor_id) OR public.is_enfermagem(p_actor_id)
  ) THEN RAISE EXCEPTION 'Acesso não autorizado' USING ERRCODE = '42501'; END IF;
  IF p_decision NOT IN ('approved', 'rejected') OR length(trim(p_note)) NOT BETWEEN 3 AND 1000 THEN
    RAISE EXCEPTION 'Decisão inválida' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_execution FROM public.room_hygiene_executions e
   WHERE e.id = p_execution_id AND e.clinic_id = p_clinic_id AND e.submitted_at IS NOT NULL FOR UPDATE;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM public.room_hygiene_reviews r WHERE r.execution_id = p_execution_id) THEN
    RAISE EXCEPTION 'Execução já revisada ou indisponível' USING ERRCODE = '40001';
  END IF;
  IF p_decision = 'approved' AND EXISTS (
    SELECT 1 FROM jsonb_array_elements((SELECT items FROM public.room_hygiene_checklist_versions WHERE id = v_execution.checklist_version_id)) i
    WHERE COALESCE((i->>'required')::boolean, false) AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_execution.completed_items) c WHERE c->>'id' = i->>'id' AND c->>'completed' = 'true'
    )
  ) THEN RAISE EXCEPTION 'Há itens obrigatórios pendentes' USING ERRCODE = '23514'; END IF;
  INSERT INTO public.room_hygiene_reviews(clinic_id, execution_id, reviewer_id, decision, note)
  VALUES (p_clinic_id, p_execution_id, p_actor_id, p_decision, trim(p_note));
  IF p_decision = 'approved' THEN
    UPDATE public.salas SET status = 'disponivel' WHERE id = v_execution.room_id AND clinica_id = p_clinic_id AND status = 'limpeza';
    IF NOT FOUND THEN RAISE EXCEPTION 'A sala não está aguardando liberação' USING ERRCODE = '40001'; END IF;
  END IF;
  INSERT INTO public.room_hygiene_audit(clinic_id, room_id, execution_id, actor_id, action)
  VALUES (p_clinic_id, v_execution.room_id, p_execution_id, p_actor_id, p_decision);
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_room_hygiene_immutability()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_TABLE_NAME IN ('room_hygiene_checklist_versions', 'room_hygiene_reviews', 'room_hygiene_audit') THEN
    RAISE EXCEPTION 'Registro imutável' USING ERRCODE = '42501';
  END IF;
  IF OLD.submitted_at IS NOT NULL OR NEW.id IS DISTINCT FROM OLD.id OR NEW.clinic_id IS DISTINCT FROM OLD.clinic_id
     OR NEW.room_id IS DISTINCT FROM OLD.room_id OR NEW.checklist_version_id IS DISTINCT FROM OLD.checklist_version_id
     OR NEW.started_by IS DISTINCT FROM OLD.started_by OR NEW.started_at IS DISTINCT FROM OLD.started_at
     OR NEW.submitted_at IS NULL OR NEW.submitted_by IS NULL OR jsonb_typeof(NEW.completed_items) <> 'array' THEN
    RAISE EXCEPTION 'Execução imutável' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_room_hygiene_room_release()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF ((OLD.status = 'limpeza' AND NEW.status = 'disponivel') OR (OLD.status = 'ocupado' AND NEW.status = 'disponivel'))
     AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'A sala só pode ser liberada após inspeção aprovada' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS room_hygiene_require_approved_release ON public.salas;
CREATE TRIGGER room_hygiene_require_approved_release BEFORE UPDATE OF status ON public.salas
  FOR EACH ROW EXECUTE FUNCTION public.protect_room_hygiene_room_release();
DROP TRIGGER IF EXISTS room_hygiene_execution_immutable ON public.room_hygiene_executions;
CREATE TRIGGER room_hygiene_execution_immutable BEFORE UPDATE ON public.room_hygiene_executions
  FOR EACH ROW EXECUTE FUNCTION public.protect_room_hygiene_immutability();
DROP TRIGGER IF EXISTS room_hygiene_execution_no_delete ON public.room_hygiene_executions;
CREATE TRIGGER room_hygiene_execution_no_delete BEFORE DELETE ON public.room_hygiene_executions
  FOR EACH ROW EXECUTE FUNCTION public.protect_room_hygiene_immutability();
DROP TRIGGER IF EXISTS room_hygiene_checklist_no_update ON public.room_hygiene_checklist_versions;
CREATE TRIGGER room_hygiene_checklist_no_update BEFORE UPDATE ON public.room_hygiene_checklist_versions
  FOR EACH ROW EXECUTE FUNCTION public.protect_room_hygiene_immutability();
DROP TRIGGER IF EXISTS room_hygiene_checklist_no_delete ON public.room_hygiene_checklist_versions;
CREATE TRIGGER room_hygiene_checklist_no_delete BEFORE DELETE ON public.room_hygiene_checklist_versions
  FOR EACH ROW EXECUTE FUNCTION public.protect_room_hygiene_immutability();
DROP TRIGGER IF EXISTS room_hygiene_review_no_update ON public.room_hygiene_reviews;
CREATE TRIGGER room_hygiene_review_no_update BEFORE UPDATE ON public.room_hygiene_reviews
  FOR EACH ROW EXECUTE FUNCTION public.protect_room_hygiene_immutability();
DROP TRIGGER IF EXISTS room_hygiene_review_no_delete ON public.room_hygiene_reviews;
CREATE TRIGGER room_hygiene_review_no_delete BEFORE DELETE ON public.room_hygiene_reviews
  FOR EACH ROW EXECUTE FUNCTION public.protect_room_hygiene_immutability();
DROP TRIGGER IF EXISTS room_hygiene_audit_no_update ON public.room_hygiene_audit;
CREATE TRIGGER room_hygiene_audit_no_update BEFORE UPDATE ON public.room_hygiene_audit
  FOR EACH ROW EXECUTE FUNCTION public.protect_room_hygiene_immutability();
DROP TRIGGER IF EXISTS room_hygiene_audit_no_delete ON public.room_hygiene_audit;
CREATE TRIGGER room_hygiene_audit_no_delete BEFORE DELETE ON public.room_hygiene_audit
  FOR EACH ROW EXECUTE FUNCTION public.protect_room_hygiene_immutability();

REVOKE ALL ON FUNCTION public.create_room_hygiene_checklist(uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.start_room_hygiene_execution(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_room_hygiene_execution(uuid,uuid,uuid,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_room_hygiene_execution(uuid,uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_room_hygiene_checklist(uuid,uuid,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.start_room_hygiene_execution(uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_room_hygiene_execution(uuid,uuid,uuid,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_room_hygiene_execution(uuid,uuid,uuid,text,text) TO service_role;

COMMIT;
