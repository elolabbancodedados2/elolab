-- ============================================================================
-- VERIFICAÇÃO — o exame só fecha com resultado
--
-- Termina em ROLLBACK.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE _res(n int, caso text, ok boolean, detalhe text);

CREATE TEMP TABLE _quem AS
SELECT p.id AS usuario, p.clinica_id AS clinica
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role::text = 'admin'
 WHERE p.clinica_id IS NOT NULL LIMIT 1;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT usuario::text FROM _quem), 'role', 'authenticated')::text, true);

DO $$
DECLARE
  v_cli uuid; v_pac uuid; v_ex uuid; v_erro text;
  v_por uuid; v_em timestamptz; v_data date; v_usuario uuid;
BEGIN
  SELECT clinica, usuario INTO v_cli, v_usuario FROM _quem;
  INSERT INTO public.pacientes (nome, clinica_id) VALUES ('__verif_exame__', v_cli) RETURNING id INTO v_pac;
  INSERT INTO public.exames (paciente_id, tipo_exame, status, clinica_id)
    VALUES (v_pac, 'Hemograma', 'realizado', v_cli) RETURNING id INTO v_ex;

  -- 1. Laudo disponível sem resultado é recusado
  BEGIN
    UPDATE public.exames SET status = 'laudo_disponivel' WHERE id = v_ex;
    INSERT INTO _res VALUES (1, 'marcar laudo disponível sem resultado', false, 'ACEITOU');
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
    INSERT INTO _res VALUES (1, 'laudo sem resultado é recusado', true, left(v_erro, 56));
  END;

  -- 2. Lançar o resultado carimba quem e quando
  UPDATE public.exames SET resultado = 'Hemácias 4,8 milhões/mm3. Série branca normal.' WHERE id = v_ex;
  SELECT resultado_por, resultado_em, data_realizacao INTO v_por, v_em, v_data
    FROM public.exames WHERE id = v_ex;
  INSERT INTO _res VALUES (2, 'lançar resultado carimba autor, data e realização',
    v_por = v_usuario AND v_em IS NOT NULL AND v_data IS NOT NULL,
    'por='||coalesce(v_por::text,'nulo')||' realizacao='||coalesce(v_data::text,'nula'));

  -- 3. Agora o laudo passa
  BEGIN
    UPDATE public.exames SET status = 'laudo_disponivel' WHERE id = v_ex;
    INSERT INTO _res VALUES (3, 'com resultado, o laudo é liberado', true, 'liberado');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
    INSERT INTO _res VALUES (3, 'com resultado, o laudo é liberado', false, v_erro);
  END;

  -- 4. Corrigir o texto não troca o autor original
  DECLARE v_por2 uuid; v_em2 timestamptz;
  BEGIN
    UPDATE public.exames SET resultado = resultado || ' (revisado)' WHERE id = v_ex;
    SELECT resultado_por, resultado_em INTO v_por2, v_em2 FROM public.exames WHERE id = v_ex;
    -- Quem corrige a redação não vira autor do exame.
    INSERT INTO _res VALUES (4, 'corrigir o texto preserva a autoria original',
      v_por2 = v_por AND v_em2 = v_em, 'autor mantido='||(v_por2 = v_por)::text);
  END;

  -- 5. Só arquivo, sem texto, também vale
  DECLARE v_ex2 uuid;
  BEGIN
    INSERT INTO public.exames (paciente_id, tipo_exame, status, clinica_id)
      VALUES (v_pac, 'Raio X', 'realizado', v_cli) RETURNING id INTO v_ex2;
    UPDATE public.exames SET arquivo_resultado = 'medical-attachments/laudo.pdf' WHERE id = v_ex2;
    UPDATE public.exames SET status = 'laudo_disponivel' WHERE id = v_ex2;
    INSERT INTO _res VALUES (5, 'laudo em arquivo, sem texto, é aceito', true, 'aceito');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
    INSERT INTO _res VALUES (5, 'laudo em arquivo, sem texto, é aceito', false, v_erro);
  END;
END $$;

SELECT
  string_agg((CASE WHEN ok THEN 'OK   ' ELSE 'FALHOU ' END) || n || '. ' || caso || ' [' || detalhe || ']',
             E'\n' ORDER BY n) AS resultado,
  count(*) FILTER (WHERE ok) || '/' || count(*) AS placar
FROM _res;

ROLLBACK;
