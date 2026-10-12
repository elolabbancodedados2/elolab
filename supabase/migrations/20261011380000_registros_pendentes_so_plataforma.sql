-- SaaS signup/payment records are platform data. Client-side clinic admins
-- must not enumerate or mutate registrations belonging to other clinics.
-- Public checkout, webhook and activation continue through service-role
-- functions / SECURITY DEFINER RPCs.

DROP POLICY IF EXISTS "admins_select_registros" ON public.registros_pendentes;
DROP POLICY IF EXISTS "anon_select_registros_by_code_v2" ON public.registros_pendentes;
DROP POLICY IF EXISTS "authenticated_update_own_registros_v2" ON public.registros_pendentes;
DROP POLICY IF EXISTS "admin_insert_registros" ON public.registros_pendentes;

CREATE POLICY "platform_admin_select_registros_pendentes"
ON public.registros_pendentes
FOR SELECT TO authenticated
USING (public.is_platform_admin());

CREATE POLICY "platform_admin_update_registros_pendentes"
ON public.registros_pendentes
FOR UPDATE TO authenticated
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

CREATE POLICY "platform_admin_insert_registros_pendentes"
ON public.registros_pendentes
FOR INSERT TO authenticated
WITH CHECK (public.is_platform_admin());

-- Keep the anonymous direct-read path explicitly closed. Signup validation
-- is performed by activate_public_registration using the invite code.
CREATE POLICY "anon_select_registros_pendentes_denied"
ON public.registros_pendentes
FOR SELECT TO anon
USING (false);
