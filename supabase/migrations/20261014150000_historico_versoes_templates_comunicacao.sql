-- Snapshots imutáveis dos modelos de comunicação, com autoria definida no banco.
CREATE TABLE public.notification_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL,
  clinica_id uuid REFERENCES public.clinicas(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),
  action text NOT NULL CHECK (action IN ('baseline', 'created', 'updated', 'deleted')),
  snapshot jsonb NOT NULL,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text,
  actor_type text NOT NULL CHECK (actor_type IN ('user', 'system', 'legacy')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, revision)
);

CREATE INDEX notification_template_versions_clinic_template_idx
  ON public.notification_template_versions (clinica_id, template_id, revision DESC);

ALTER TABLE public.notification_template_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_template_versions_admin_read
  ON public.notification_template_versions
  FOR SELECT TO authenticated
  USING (
    clinica_id IS NOT NULL
    AND public.is_admin(auth.uid())
    AND public.is_same_clinica(clinica_id)
  );

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.notification_template_versions FROM anon, authenticated;
GRANT SELECT ON public.notification_template_versions TO authenticated;

-- O estado atual vira baseline, sem atribuição retroativa de autoria.
INSERT INTO public.notification_template_versions (
  template_id, clinica_id, revision, action, snapshot, actor_type
)
SELECT
  id,
  clinica_id,
  1,
  'baseline',
  to_jsonb(template),
  'legacy'
FROM public.notification_templates AS template;

CREATE OR REPLACE FUNCTION public.capture_notification_template_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_template_id uuid;
  v_clinica_id uuid;
  v_snapshot jsonb;
  v_revision integer;
  v_author_id uuid := auth.uid();
  v_author_name text;
  v_action text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - 'updated_at') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_template_id := OLD.id;
    v_clinica_id := OLD.clinica_id;
    v_snapshot := to_jsonb(OLD);
    v_action := 'deleted';
  ELSIF TG_OP = 'INSERT' THEN
    v_template_id := NEW.id;
    v_clinica_id := NEW.clinica_id;
    v_snapshot := to_jsonb(NEW);
    v_action := 'created';
  ELSE
    v_template_id := NEW.id;
    v_clinica_id := NEW.clinica_id;
    v_snapshot := to_jsonb(NEW);
    v_action := 'updated';
  END IF;

  SELECT COALESCE(MAX(version.revision), 0) + 1
    INTO v_revision
    FROM public.notification_template_versions AS version
   WHERE version.template_id = v_template_id;

  IF v_author_id IS NOT NULL THEN
    SELECT profile.nome
      INTO v_author_name
      FROM public.profiles AS profile
     WHERE profile.id = v_author_id;
  END IF;

  INSERT INTO public.notification_template_versions (
    template_id, clinica_id, revision, action, snapshot,
    author_id, author_name, actor_type
  ) VALUES (
    v_template_id, v_clinica_id, v_revision, v_action, v_snapshot,
    v_author_id, v_author_name, CASE WHEN v_author_id IS NULL THEN 'system' ELSE 'user' END
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_notification_template_version() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER notification_template_version_capture
  AFTER INSERT OR UPDATE OR DELETE ON public.notification_templates
  FOR EACH ROW EXECUTE FUNCTION public.capture_notification_template_version();
