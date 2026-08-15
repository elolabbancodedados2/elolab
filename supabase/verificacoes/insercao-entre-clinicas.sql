-- ============================================================================
-- VERIFICAÇÃO — inserir apontando para outra clínica é recusado
--
-- Assume a identidade de um admin real e tenta escrever na clínica do vizinho.
-- Também confere que o caminho NORMAL (sem informar clínica, deixando o
-- gatilho carimbar) continua funcionando — fechar o buraco quebrando o uso do
-- dia a dia não seria correção.
--
-- Termina em ROLLBACK.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE _res(n int, caso text, ok boolean, detalhe text);
GRANT ALL ON _res TO authenticated;

-- Os ids do vizinho são resolvidos AQUI, como postgres. Buscá-los depois de
-- assumir a identidade do admin devolveria NULL (o RLS esconde), e o INSERT
-- falharia por coluna obrigatória em vez de por permissão — um teste que passa
-- pelo motivo errado é pior que teste nenhum.
CREATE TEMP TABLE _ctx AS
WITH base AS (
  SELECT p.id AS admin_id, p.clinica_id AS minha_clinica
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role::text = 'admin'
   WHERE p.clinica_id IS NOT NULL
   LIMIT 1
), vizinha AS (
  SELECT c.id FROM public.clinicas c, base b
   WHERE c.id <> b.minha_clinica
     AND EXISTS (SELECT 1 FROM public.pacientes x WHERE x.clinica_id = c.id)
   LIMIT 1
)
SELECT b.admin_id, b.minha_clinica,
       (SELECT id FROM vizinha) AS clinica_vizinha,
       (SELECT id FROM public.pacientes WHERE clinica_id = (SELECT id FROM vizinha) LIMIT 1) AS paciente_vizinho,
       (SELECT id FROM public.tipos_consulta WHERE clinica_id = (SELECT id FROM vizinha) LIMIT 1) AS tipo_vizinho,
       (SELECT id FROM public.convenios WHERE clinica_id = (SELECT id FROM vizinha) LIMIT 1) AS convenio_vizinho
  FROM base b;
-- A clínica vizinha pode não ter tipo de consulta e convênio cadastrados. Como
-- postgres, e dentro do ROLLBACK, criamos o que falta — senão o caso 3 sai
-- "inconclusivo" e não prova nada.
DO $$
DECLARE v_viz uuid; v_tipo uuid; v_conv uuid;
BEGIN
  SELECT clinica_vizinha INTO v_viz FROM _ctx;
  IF v_viz IS NULL THEN RETURN; END IF;

  SELECT tipo_vizinho, convenio_vizinho INTO v_tipo, v_conv FROM _ctx;

  IF v_tipo IS NULL THEN
    INSERT INTO public.tipos_consulta (nome, clinica_id)
      VALUES ('__verificacao_tipo_vizinho__', v_viz) RETURNING id INTO v_tipo;
    UPDATE _ctx SET tipo_vizinho = v_tipo;
  END IF;

  IF v_conv IS NULL THEN
    INSERT INTO public.convenios (nome, clinica_id)
      VALUES ('__verificacao_convenio_vizinho__', v_viz) RETURNING id INTO v_conv;
    UPDATE _ctx SET convenio_vizinho = v_conv;
  END IF;
END $$;

GRANT SELECT ON _ctx TO authenticated;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT admin_id::text FROM _ctx), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

-- ─── 1. Token de portal apontando para a clínica vizinha ───
DO $$
DECLARE v_vizinha uuid; v_paciente uuid;
BEGIN
  SELECT clinica_vizinha, paciente_vizinho INTO v_vizinha, v_paciente FROM _ctx;
  IF v_paciente IS NULL THEN
    INSERT INTO _res VALUES (1, 'token de portal na clínica vizinha', false,
      'INCONCLUSIVO — sem paciente na clínica vizinha para testar');
  ELSE
    BEGIN
      INSERT INTO public.paciente_portal_tokens (paciente_id, token, clinica_id)
      VALUES (v_paciente, 'verificacao-token', v_vizinha);
      INSERT INTO _res VALUES (1, 'token de portal na clínica vizinha', false,
        'ACEITOU — credencial criada na casa dos outros');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _res VALUES (1, 'token de portal na clínica vizinha', true, SQLERRM);
    END;
  END IF;
END $$;

-- ─── 2. Tipo de consulta na clínica vizinha ───
DO $$
DECLARE v_vizinha uuid;
BEGIN
  SELECT clinica_vizinha INTO v_vizinha FROM _ctx;
  BEGIN
    INSERT INTO public.tipos_consulta (nome, clinica_id) VALUES ('__verificacao__', v_vizinha);
    INSERT INTO _res VALUES (2, 'tipo de consulta na clínica vizinha', false, 'ACEITOU');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _res VALUES (2, 'tipo de consulta na clínica vizinha', true, SQLERRM);
  END;
END $$;

-- ─── 3. Preço de convênio na clínica vizinha ───
DO $$
DECLARE v_vizinha uuid; v_tipo uuid; v_conv uuid;
BEGIN
  SELECT clinica_vizinha, tipo_vizinho, convenio_vizinho INTO v_vizinha, v_tipo, v_conv FROM _ctx;
  IF v_tipo IS NULL OR v_conv IS NULL THEN
    INSERT INTO _res VALUES (3, 'preço de convênio na clínica vizinha', false,
      'INCONCLUSIVO — vizinha não tem tipo de consulta e convênio para testar');
  ELSE
    BEGIN
      INSERT INTO public.precos_consulta_convenio (tipo_consulta_id, convenio_id, clinica_id)
      VALUES (v_tipo, v_conv, v_vizinha);
      INSERT INTO _res VALUES (3, 'preço de convênio na clínica vizinha', false, 'ACEITOU');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _res VALUES (3, 'preço de convênio na clínica vizinha', true, SQLERRM);
    END;
  END IF;
END $$;

-- ─── 4. O caminho normal continua funcionando ───
DO $$
DECLARE v_id uuid; v_gravada uuid; v_minha uuid;
BEGIN
  SELECT minha_clinica INTO v_minha FROM _ctx;
  BEGIN
    -- Sem informar a clínica: o gatilho carimba a do usuário.
    INSERT INTO public.tipos_consulta (nome) VALUES ('__verificacao_normal__') RETURNING id INTO v_id;
    SELECT clinica_id INTO v_gravada FROM public.tipos_consulta WHERE id = v_id;
    INSERT INTO _res VALUES (4, 'criar na própria clínica sem informar o campo', v_gravada = v_minha,
      coalesce(v_gravada::text, 'ficou NULL'));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _res VALUES (4, 'criar na própria clínica sem informar o campo', false, SQLERRM);
  END;
END $$;

-- ─── 5. Informar a PRÓPRIA clínica também vale ───
DO $$
DECLARE v_minha uuid;
BEGIN
  SELECT minha_clinica INTO v_minha FROM _ctx;
  BEGIN
    INSERT INTO public.tipos_consulta (nome, clinica_id) VALUES ('__verificacao_propria__', v_minha);
    INSERT INTO _res VALUES (5, 'criar informando a própria clínica', true, 'aceito, como deve ser');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _res VALUES (5, 'criar informando a própria clínica', false, SQLERRM);
  END;
END $$;

RESET ROLE;

SELECT
  string_agg((CASE WHEN ok THEN 'OK   ' ELSE 'FALHOU ' END) || n || '. ' || caso || ' [' || left(detalhe, 70) || ']',
             E'\n' ORDER BY n) AS resultado,
  count(*) FILTER (WHERE ok) || '/' || count(*) AS placar
FROM _res;

ROLLBACK;
