-- Permite que qualquer administrador da plataforma encerre um aviso global,
-- mantendo o autor original e preservando o histórico.
DROP POLICY IF EXISTS "plataforma gerencia comunicados" ON public.platform_announcements;

CREATE POLICY "plataforma le comunicados"
  ON public.platform_announcements FOR SELECT TO authenticated
  USING (public.is_platform_admin());

CREATE POLICY "plataforma publica comunicados"
  ON public.platform_announcements FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin() AND criado_por = auth.uid());

CREATE POLICY "plataforma atualiza comunicados"
  ON public.platform_announcements FOR UPDATE TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.prevent_platform_announcement_creator_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.criado_por IS DISTINCT FROM OLD.criado_por THEN
    RAISE EXCEPTION 'O autor original do comunicado não pode ser alterado';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_announcement_creator_immutable ON public.platform_announcements;
CREATE TRIGGER platform_announcement_creator_immutable
  BEFORE UPDATE ON public.platform_announcements
  FOR EACH ROW EXECUTE FUNCTION public.prevent_platform_announcement_creator_change();
