
-- 1) Revoke EXECUTE from anon/public on internal SECURITY DEFINER functions.
-- Keep validate_invite_code + validate_invitation_token callable by anon (used pre-login).

DO $$
DECLARE
  r RECORD;
  keep_anon TEXT[] := ARRAY['validate_invite_code','validate_invitation_token'];
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    -- Always revoke from PUBLIC
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC', r.proname, r.args);

    IF r.proname = ANY(keep_anon) THEN
      -- Ensure anon + authenticated can call the pre-login validators
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon, authenticated', r.proname, r.args);
    ELSE
      -- Internal-only: only authenticated + service_role
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon', r.proname, r.args);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

-- 2) Restrict broad SELECT (listing) on public buckets while still allowing
-- direct file access via public URLs. We drop overly-permissive "true" SELECT
-- policies on storage.objects for these buckets, if present.

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND (
        qual ILIKE '%patient-photos%'
        OR qual ILIKE '%tv-panel-media%'
      )
      AND cmd = 'SELECT'
      AND (qual ILIKE '%true%' OR qual ILIKE '%bucket_id =%')
  LOOP
    -- Only drop the generic "anyone can list" style; keep clinic-scoped policies.
    IF pol.policyname ILIKE '%public%'
       OR pol.policyname ILIKE '%anyone%'
       OR pol.policyname ILIKE '%allow%read%'
       OR pol.policyname ILIKE '%read%public%' THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
    END IF;
  END LOOP;
END $$;

-- Recreate scoped SELECT policies: authenticated users of the owning clinic
-- can list; anonymous users can only fetch by exact key via the public URL
-- (which does not require a SELECT policy match when the bucket is public).
CREATE POLICY "patient_photos_clinic_list"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'patient-photos'
  AND (storage.foldername(name))[1] = (public.current_clinica_id())::text
);

CREATE POLICY "tv_panel_media_clinic_list"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'tv-panel-media'
  AND (storage.foldername(name))[1] = (public.current_clinica_id())::text
);
