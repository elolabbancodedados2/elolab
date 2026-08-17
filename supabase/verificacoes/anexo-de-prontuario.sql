-- ============================================================================
-- VERIFICAÇÃO — anexo de prontuário grava?
--
-- Zero anexos em 19 prontuários e 297 exames. A tela existe e está ligada, mas
-- "não usam" e "está quebrado" produzem o mesmo zero.
--
-- Termina em ROLLBACK.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE _res(n int, caso text, ok boolean, detalhe text);
GRANT ALL ON _res TO authenticated;

CREATE TEMP TABLE _quem AS
SELECT p.id AS usuario, p.clinica_id AS clinica,
       (SELECT m.id FROM public.medicos m WHERE m.clinica_id = p.clinica_id LIMIT 1) AS medico
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role::text IN ('admin','medico')
 WHERE p.clinica_id IS NOT NULL LIMIT 1;

-- Prontuário próprio e prontuário do vizinho, criados como postgres.
CREATE TEMP TABLE _alvos AS
WITH meu_pac AS (
  INSERT INTO public.pacientes (nome, clinica_id)
  SELECT '__verif_anexo__', clinica FROM _quem RETURNING id, clinica_id
), meu_pront AS (
  INSERT INTO public.prontuarios (paciente_id, data, clinica_id)
  SELECT id, CURRENT_DATE, clinica_id FROM meu_pac RETURNING id
), cli_viz AS (
  INSERT INTO public.clinicas (nome) VALUES ('__verif_anexo_vizinha__') RETURNING id
), pac_viz AS (
  INSERT INTO public.pacientes (nome, clinica_id) SELECT '__verif_pac_viz__', id FROM cli_viz
  RETURNING id, clinica_id
), pront_viz AS (
  INSERT INTO public.prontuarios (paciente_id, data, clinica_id)
  SELECT id, CURRENT_DATE, clinica_id FROM pac_viz RETURNING id, paciente_id
)
SELECT (SELECT id FROM meu_pront) AS meu,
       (SELECT id FROM meu_pac) AS meu_paciente,
       (SELECT id FROM pront_viz) AS vizinho,
       (SELECT paciente_id FROM pront_viz) AS paciente_vizinho;
GRANT SELECT ON _alvos TO authenticated;
GRANT SELECT ON _quem TO authenticated;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT usuario::text FROM _quem), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

-- 1. Anexar no próprio prontuário
DO $$
DECLARE v_p uuid; v_pac uuid; v_erro text;
BEGIN
  SELECT meu, meu_paciente INTO v_p, v_pac FROM _alvos;
  BEGIN
    INSERT INTO public.anexos_prontuario (prontuario_id, paciente_id, nome_arquivo, url_arquivo, tipo_arquivo)
    VALUES (v_p, v_pac, 'laudo.pdf', 'medical-attachments/x/laudo.pdf', 'application/pdf');
    INSERT INTO _res VALUES (1, 'anexar no próprio prontuário', true, 'gravou');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
    INSERT INTO _res VALUES (1, 'anexar no próprio prontuário', false, left(v_erro, 60));
  END;
END $$;

-- 2. E ler de volta
DO $$
DECLARE v_p uuid; v_qtd int;
BEGIN
  SELECT meu INTO v_p FROM _alvos;
  SELECT count(*) INTO v_qtd FROM public.anexos_prontuario WHERE prontuario_id = v_p;
  INSERT INTO _res VALUES (2, 'o anexo aparece na lista do prontuário', v_qtd = 1, v_qtd||' anexo(s)');
END $$;

-- 3. Anexar no prontuário do vizinho é recusado
DO $$
DECLARE v_v uuid; v_pv uuid; v_erro text;
BEGIN
  SELECT vizinho, paciente_vizinho INTO v_v, v_pv FROM _alvos;
  BEGIN
    INSERT INTO public.anexos_prontuario (prontuario_id, paciente_id, nome_arquivo, url_arquivo, tipo_arquivo)
    VALUES (v_v, v_pv, 'invasao.pdf', 'x/y.pdf', 'application/pdf');
    INSERT INTO _res VALUES (3, 'anexar no prontuário do vizinho', false, 'ACEITOU');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
    INSERT INTO _res VALUES (3, 'anexar no prontuário do vizinho é recusado', true, left(v_erro, 55));
  END;
END $$;

-- 4. E também não LÊ o anexo do vizinho
DO $$
DECLARE v_v uuid; v_pv uuid; v_qtd int;
BEGIN
  SELECT vizinho, paciente_vizinho INTO v_v, v_pv FROM _alvos;
  RESET ROLE;
  -- Semeia um anexo na clínica vizinha, como postgres.
  INSERT INTO public.anexos_prontuario (prontuario_id, paciente_id, nome_arquivo, url_arquivo, tipo_arquivo, clinica_id)
  SELECT v_v, v_pv, 'do_vizinho.pdf', 'x/z.pdf', 'application/pdf', p.clinica_id
    FROM public.prontuarios p WHERE p.id = v_v;
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_qtd FROM public.anexos_prontuario WHERE prontuario_id = v_v;
  -- Ler exame e laudo de paciente de outra clínica é o pior caso desta tabela.
  INSERT INTO _res VALUES (4, 'não lê anexo de prontuário do vizinho', v_qtd = 0,
    v_qtd||' anexo(s) do vizinho visíveis');
END $$;

RESET ROLE;

SELECT
  string_agg((CASE WHEN ok THEN 'OK   ' ELSE 'FALHOU ' END) || n || '. ' || caso || ' [' || detalhe || ']',
             E'\n' ORDER BY n) AS resultado,
  count(*) FILTER (WHERE ok) || '/' || count(*) AS placar
FROM _res;

ROLLBACK;
