-- Feature flag definitions are internal platform configuration. Clinic users
-- do not consume these rows; only platform administrators need direct reads.
DROP POLICY IF EXISTS "autenticado le flags" ON public.platform_feature_flags;
DROP POLICY IF EXISTS "plataforma le flags" ON public.platform_feature_flags;

CREATE POLICY "plataforma le flags"
ON public.platform_feature_flags
FOR SELECT TO authenticated
USING (public.is_platform_admin());
