\set ON_ERROR_STOP on
-- Run ONLY in an empty disposable database named elolab_perf_test_*.
DO $$ BEGIN
  IF current_database() NOT LIKE 'elolab_perf_test_%' THEN
    RAISE EXCEPTION 'Use um banco descartável elolab_perf_test_*.';
  END IF;
END $$;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid;
$$;
CREATE FUNCTION public.get_my_clinica_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'clinica_id')::uuid;
$$;
CREATE TABLE public.pacientes (
  id uuid PRIMARY KEY, clinica_id uuid NOT NULL, nome text NOT NULL, nome_social text,
  cpf text, telefone text, email text, data_nascimento date, convenio_id uuid,
  sexo text, ativo boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pacientes ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA public, auth TO authenticated;
GRANT SELECT ON public.pacientes TO authenticated;
CREATE POLICY pacientes_test_select ON public.pacientes FOR SELECT TO authenticated
  USING (clinica_id = public.get_my_clinica_id()
    AND current_setting('request.jwt.claims')::jsonb->>'perfil' = 'recepcao');

\ir ../migrations/20261016150000_busca_pacientes_paginada.sql

INSERT INTO public.pacientes (id, clinica_id, nome, nome_social, cpf, telefone, email, data_nascimento, sexo) VALUES
 ('00000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','João   da Silva','José Social','123.456.789-00','(11)98888-7777','joao@example.invalid','2000-01-01','M'),
 ('00000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','Paciente 123',NULL,NULL,'+55 21 97777-6666',NULL,'2010-01-01','F'),
 ('00000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','Ana 100%_ (teste)',NULL,NULL,'98888-7777',NULL,'1980-01-01','F'),
 ('00000000-0000-0000-0000-000000000004','22222222-2222-2222-2222-222222222222','João outra clínica',NULL,NULL,NULL,NULL,NULL,NULL),
 ('00000000-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','Ana inativa',NULL,NULL,NULL,NULL,NULL,NULL);
UPDATE public.pacientes SET ativo=false WHERE id='00000000-0000-0000-0000-000000000005';
UPDATE public.pacientes SET convenio_id='33333333-3333-3333-3333-333333333333' WHERE id='00000000-0000-0000-0000-000000000002';
INSERT INTO public.pacientes (id,clinica_id,nome,created_at)
SELECT ('00000000-0000-0000-0001-'||lpad(n::text,12,'0'))::uuid,
 '11111111-1111-1111-1111-111111111111', 'Pagina '||lpad(n::text,3,'0'), '2026-01-01'::timestamptz
FROM generate_series(1,105) n;

DO $$ BEGIN
  ASSERT NOT has_function_privilege('anon', 'public.buscar_pacientes_paginado(text,integer,integer,text,text,uuid,boolean,date,date)', 'EXECUTE'), 'anonymous execution';
END $$;

BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","clinica_id":"11111111-1111-1111-1111-111111111111","perfil":"recepcao"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE n integer; ids uuid[]; first_page uuid[];
BEGIN
  SELECT count(*) INTO n FROM public.buscar_pacientes_paginado('joao da silva');
  ASSERT n=1, 'accent and whitespace normalization';
  SELECT count(*) INTO n FROM public.buscar_pacientes_paginado('JOSE SOCIAL');
  ASSERT n=1, 'social name';
  SELECT count(*) INTO n FROM public.buscar_pacientes_paginado('example.invalid');
  ASSERT n=1, 'email';
  SELECT count(*) INTO n FROM public.buscar_pacientes_paginado('456789');
  ASSERT n=1, 'formatted CPF';
  SELECT count(*) INTO n FROM public.buscar_pacientes_paginado('11988887777');
  ASSERT n=1, 'phone without DDD separator';
  SELECT count(*) INTO n FROM public.buscar_pacientes_paginado('5521977776666');
  ASSERT n=1, 'international phone';
  SELECT count(*) INTO n FROM public.buscar_pacientes_paginado('988887777');
  ASSERT n=2, 'local phone';
  SELECT count(*) INTO n FROM public.buscar_pacientes_paginado('123');
  ASSERT n=2, 'numeric names and CPF';
  SELECT count(*) INTO n FROM public.buscar_pacientes_paginado('100%_ (teste)');
  ASSERT n=1, 'literal punctuation';
  SELECT count(*) INTO n FROM public.buscar_pacientes_paginado('%');
  ASSERT n=1, 'percent must not become wildcard';
  SELECT count(*) INTO n FROM public.buscar_pacientes_paginado('joao');
  ASSERT n=1, 'other clinic must be excluded';
  SELECT count(*) INTO n FROM public.buscar_pacientes_paginado('ana',p_status=>'inativos');
  ASSERT n=1, 'inactive filter';
  SELECT count(*) INTO n FROM public.buscar_pacientes_paginado('ana',p_status=>'todos');
  ASSERT n=2, 'all status filter';
  SELECT count(*) INTO n FROM public.buscar_pacientes_paginado(NULL,p_sexo=>'F',p_nascimento_apos=>'2000-01-01',p_nascimento_ate=>'2015-01-01');
  ASSERT n=1, 'sex and date filters';
  SELECT count(*) INTO n FROM public.buscar_pacientes_paginado(NULL,p_convenio_id=>'33333333-3333-3333-3333-333333333333');
  ASSERT n=1, 'coverage filter';
  SELECT count(*) INTO n FROM public.buscar_pacientes_paginado('Paciente',p_somente_particular=>true);
  ASSERT n=0, 'private filter';
  SELECT array_agg(id) INTO first_page FROM public.buscar_pacientes_paginado('Pagina',50,0);
  SELECT array_agg(id) INTO ids FROM public.buscar_pacientes_paginado('Pagina',51,50);
  ASSERT cardinality(first_page)=50 AND cardinality(ids)=51, 'bounded pages and lookahead';
  ASSERT NOT first_page && ids, 'pages must not overlap';
  ASSERT ids[1]='00000000-0000-0000-0001-000000000051'::uuid, 'stable order';
  SELECT count(*) INTO n FROM public.buscar_pacientes_paginado('Pagina',51,100);
  ASSERT n=5, 'last page';
  SELECT count(*) INTO n FROM public.buscar_pacientes_paginado(NULL,1000000);
  ASSERT n=101, 'bounded response';
  BEGIN
    PERFORM * FROM public.buscar_pacientes_paginado(NULL,p_status=>'invalid');
    RAISE EXCEPTION 'invalid status accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END $$;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","clinica_id":"11111111-1111-1111-1111-111111111111","perfil":"financeiro"}', true);
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM public.buscar_pacientes_paginado(NULL))=0, 'RPC must respect caller RLS';
END $$;
SELECT set_config('request.jwt.claims', '{}', true);
DO $$ BEGIN
  BEGIN
    PERFORM * FROM public.buscar_pacientes_paginado(NULL);
    RAISE EXCEPTION 'missing session accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
ROLLBACK;
SELECT 'patient search SQL checks passed' AS result;
