-- Progresso de treinamento contem apenas metadados do tutorial. Nunca armazena
-- dados clinicos nem cria um tenant "demo" que possa se misturar a producao.
CREATE TABLE IF NOT EXISTS public.user_training_progress (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  tutorial_key text NOT NULL CHECK (tutorial_key ~ '^[a-z0-9_-]{2,64}$'),
  completed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, clinica_id, tutorial_key)
);

ALTER TABLE public.user_training_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_training_progress FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.user_training_progress FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_training_progress TO authenticated;

CREATE POLICY user_training_progress_owner_select ON public.user_training_progress
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND clinica_id = public.current_clinica_id());

CREATE POLICY user_training_progress_owner_insert ON public.user_training_progress
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND clinica_id = public.current_clinica_id());

CREATE POLICY user_training_progress_owner_update ON public.user_training_progress
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND clinica_id = public.current_clinica_id())
  WITH CHECK (user_id = auth.uid() AND clinica_id = public.current_clinica_id());

CREATE POLICY user_training_progress_owner_delete ON public.user_training_progress
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND clinica_id = public.current_clinica_id());

CREATE INDEX IF NOT EXISTS idx_user_training_progress_clinic_user
  ON public.user_training_progress (clinica_id, user_id, completed_at DESC);

