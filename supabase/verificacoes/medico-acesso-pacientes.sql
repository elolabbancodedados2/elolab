\set ON_ERROR_STOP on
-- Isolated policy/RPC regression check; never create fixtures in the application database.
DO $$ BEGIN
  IF current_database() NOT LIKE 'elolab_medico_test_%' THEN
    RAISE EXCEPTION 'Use um banco descartável elolab_medico_test_*.';
  END IF;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid;
$$;
CREATE FUNCTION public.get_my_clinica_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'clinica_id')::uuid;
$$;
CREATE FUNCTION public.is_same_clinica(id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT id = public.get_my_clinica_id();
$$;
CREATE FUNCTION public.can_manage_data(id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT current_setting('test.perfil', true) IN ('admin', 'recepcao');
$$;
CREATE FUNCTION public.is_medico(id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT current_setting('test.perfil', true) = 'medico';
$$;
CREATE TABLE public.pacientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinica_id uuid NOT NULL,
  nome text NOT NULL, nome_social text, data_nascimento date, telefone text
);
ALTER TABLE public.pacientes ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA public, auth TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pacientes TO authenticated;
CREATE POLICY pacientes_select ON public.pacientes FOR SELECT TO authenticated
  USING (is_same_clinica(clinica_id));
CREATE POLICY pacientes_insert ON public.pacientes FOR INSERT TO authenticated
  WITH CHECK ((can_manage_data(auth.uid()) OR is_medico(auth.uid())) AND clinica_id = get_my_clinica_id());
CREATE POLICY pacientes_update ON public.pacientes FOR UPDATE TO authenticated
  USING (can_manage_data(auth.uid()) AND is_same_clinica(clinica_id));
CREATE POLICY pacientes_delete ON public.pacientes FOR DELETE TO authenticated
  USING (current_setting('test.perfil') = 'admin' AND is_same_clinica(clinica_id));

\ir ../migrations/20261014130500_revisao_duplicidade_paciente.sql
\if :apply_fix
\ir ../migrations/20261016190000_medico_acesso_pacientes.sql
\endif

INSERT INTO public.pacientes(id, clinica_id, nome, data_nascimento, telefone) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Paciente QA', '1990-01-01', '11999990000'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Paciente QA', '1990-01-01', '11999990000');
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","clinica_id":"11111111-1111-1111-1111-111111111111"}', true);
SET LOCAL test.perfil = 'medico';
SET LOCAL ROLE authenticated;
DO $$
DECLARE n integer; perfil text;
BEGIN
  ASSERT NOT can_manage_data(auth.uid()), 'doctor must not gain administrative privileges';
  UPDATE public.pacientes SET nome_social='Atualizado pelo médico'
    WHERE id='aaaaaaaa-0000-0000-0000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n=1, 'doctor must update own-clinic patient';
  INSERT INTO public.pacientes(clinica_id,nome) VALUES (get_my_clinica_id(),'Novo paciente QA');
  SELECT count(*) INTO n FROM public.buscar_possiveis_duplicidades_paciente('Paciente QA','1990-01-01','11999990000');
  ASSERT n=1, 'doctor duplicate review must include only own clinic';
  SELECT count(*) INTO n FROM public.buscar_possiveis_duplicidades_paciente('Paciente QA','1990-01-01','11999990000','aaaaaaaa-0000-0000-0000-000000000001');
  ASSERT n=0, 'duplicate review must honor excluded patient';
  UPDATE public.pacientes SET nome_social='Outra clínica' WHERE clinica_id='22222222-2222-2222-2222-222222222222';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n=0, 'doctor must not update another clinic';
  BEGIN
    UPDATE public.pacientes SET clinica_id='22222222-2222-2222-2222-222222222222'
      WHERE id='aaaaaaaa-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'doctor transferred patient to another clinic';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  DELETE FROM public.pacientes WHERE id='aaaaaaaa-0000-0000-0000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n=0, 'doctor must not permanently delete history';
  FOREACH perfil IN ARRAY ARRAY['admin','recepcao'] LOOP
    PERFORM set_config('test.perfil',perfil,true);
    UPDATE public.pacientes SET nome_social=perfil WHERE id='aaaaaaaa-0000-0000-0000-000000000001';
    GET DIAGNOSTICS n = ROW_COUNT;
    ASSERT n=1, 'existing operator update permission';
    PERFORM public.buscar_possiveis_duplicidades_paciente('Paciente QA','1990-01-01','11999990000');
  END LOOP;
  FOREACH perfil IN ARRAY ARRAY['financeiro','enfermagem'] LOOP
    PERFORM set_config('test.perfil',perfil,true);
    UPDATE public.pacientes SET nome_social=perfil WHERE id='aaaaaaaa-0000-0000-0000-000000000001';
    GET DIAGNOSTICS n = ROW_COUNT;
    ASSERT n=0, 'unrelated roles must not gain patient update permission';
    BEGIN
      PERFORM public.buscar_possiveis_duplicidades_paciente('Paciente QA','1990-01-01','11999990000');
      RAISE EXCEPTION 'unrelated role gained duplicate-review access';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  ASSERT NOT has_function_privilege('anon','public.buscar_possiveis_duplicidades_paciente(text,date,text,uuid)','EXECUTE'), 'anonymous duplicate review';
END $$;
ROLLBACK;
SELECT 'doctor patient access assertions passed' AS result;
