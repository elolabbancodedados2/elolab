-- Health check público executa apenas uma constante no banco e não lê dados clínicos.
CREATE OR REPLACE FUNCTION public.public_availability_check()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT pg_catalog.jsonb_build_object('ok', true, 'checked_at', pg_catalog.now());
$$;

REVOKE ALL ON FUNCTION public.public_availability_check() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_availability_check() TO anon, authenticated;

COMMENT ON FUNCTION public.public_availability_check() IS
  'Health check anônimo: confirma que PostgREST e PostgreSQL respondem sem consultar dados da aplicação.';
