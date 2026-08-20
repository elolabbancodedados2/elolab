-- Preferencias operacionais pertencem simultaneamente ao usuario e a clinica.
-- A chave composta impede que uma troca de tenant reaproveite configuracoes.
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  density text NOT NULL DEFAULT 'comfortable' CHECK (density IN ('comfortable', 'compact')),
  start_page text NOT NULL DEFAULT '/dashboard' CHECK (start_page IN ('/dashboard', '/agenda', '/tarefas', '/notificacoes')),
  date_format text NOT NULL DEFAULT 'DD/MM/YYYY' CHECK (date_format IN ('DD/MM/YYYY', 'YYYY-MM-DD')),
  browser_notifications boolean NOT NULL DEFAULT true,
  email_daily_summary boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, clinica_id)
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.user_preferences FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO authenticated;

CREATE POLICY user_preferences_owner_select ON public.user_preferences
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND clinica_id = public.current_clinica_id());

CREATE POLICY user_preferences_owner_insert ON public.user_preferences
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND clinica_id = public.current_clinica_id());

CREATE POLICY user_preferences_owner_update ON public.user_preferences
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND clinica_id = public.current_clinica_id())
  WITH CHECK (user_id = auth.uid() AND clinica_id = public.current_clinica_id());

CREATE POLICY user_preferences_owner_delete ON public.user_preferences
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND clinica_id = public.current_clinica_id());

CREATE OR REPLACE FUNCTION public.touch_user_preferences()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_user_preferences ON public.user_preferences;
CREATE TRIGGER touch_user_preferences BEFORE UPDATE ON public.user_preferences
FOR EACH ROW EXECUTE FUNCTION public.touch_user_preferences();

