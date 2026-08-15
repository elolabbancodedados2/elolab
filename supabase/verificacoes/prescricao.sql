-- ============================================================================
-- VERIFICAÇÃO — a prescrição salva?
--
-- Zero prescrições em 19 prontuários. O salvamento era destrutivo até 12/08
-- (apagava as antigas antes de gravar as novas, e uma falha no meio perdia as
-- duas pontas). Foi trocado por uma função transacional — mas ninguém testou
-- depois da troca, e "não usam" e "está quebrado" produzem o mesmo zero.
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

-- Todos os prontuários de hoje estão numa clínica só, então o caso do vizinho
-- ficaria inconclusivo. Criamos um, como postgres, dentro do ROLLBACK.
CREATE TEMP TABLE _vizinho AS
WITH cli AS (
  INSERT INTO public.clinicas (nome) VALUES ('__verif_presc_vizinha__') RETURNING id
), pac AS (
  INSERT INTO public.pacientes (nome, clinica_id) SELECT '__verif_pac_vizinho__', id FROM cli
  RETURNING id, clinica_id
), pront AS (
  INSERT INTO public.prontuarios (paciente_id, data, clinica_id)
  SELECT id, CURRENT_DATE, clinica_id FROM pac RETURNING id
)
SELECT id FROM pront;

GRANT SELECT ON _quem TO authenticated;
GRANT SELECT ON _vizinho TO authenticated;

-- Sem trocar o PAPEL, a sessão continua sendo `postgres`, que ignora RLS por
-- completo — e o teste passaria a medir nada. Foi o que aconteceu na primeira
-- versão deste arquivo: ele acusou uma falha de isolamento que não existia.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT usuario::text FROM _quem), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_cli uuid; v_med uuid; v_pac uuid; v_pront uuid; v_r jsonb; v_qtd int; v_erro text;
BEGIN
  SELECT clinica, medico INTO v_cli, v_med FROM _quem;
  INSERT INTO public.pacientes (nome, clinica_id) VALUES ('__verif_presc__', v_cli) RETURNING id INTO v_pac;
  INSERT INTO public.prontuarios (paciente_id, medico_id, data, clinica_id)
    VALUES (v_pac, v_med, CURRENT_DATE, v_cli) RETURNING id INTO v_pront;

  -- 1. Gravar duas prescrições
  v_r := public.substituir_prescricoes_do_prontuario(v_pront, '[
    {"medicamento":"Amoxicilina 500mg","dosagem":"1 cápsula","posologia":"8/8h","duracao":"7 dias","quantidade":"21"},
    {"medicamento":"Dipirona 500mg","dosagem":"1 comprimido","posologia":"6/6h se dor","duracao":"3 dias","quantidade":"12"}
  ]'::jsonb);
  SELECT count(*) INTO v_qtd FROM public.prescricoes WHERE prontuario_id = v_pront;
  INSERT INTO _res VALUES (1, 'gravar duas prescrições', v_qtd = 2, v_qtd||' gravada(s)');

  -- 2. Regravar substitui, não acumula
  v_r := public.substituir_prescricoes_do_prontuario(v_pront, '[
    {"medicamento":"Amoxicilina 500mg","dosagem":"1 cápsula","posologia":"8/8h","duracao":"10 dias","quantidade":"30"}
  ]'::jsonb);
  SELECT count(*) INTO v_qtd FROM public.prescricoes WHERE prontuario_id = v_pront;
  -- O bug antigo dobrava a lista a cada salvamento.
  INSERT INTO _res VALUES (2, 'regravar substitui em vez de acumular', v_qtd = 1, v_qtd||' após regravar');

  -- 3. Lista vazia limpa tudo
  v_r := public.substituir_prescricoes_do_prontuario(v_pront, '[]'::jsonb);
  SELECT count(*) INTO v_qtd FROM public.prescricoes WHERE prontuario_id = v_pront;
  INSERT INTO _res VALUES (3, 'lista vazia apaga as anteriores', v_qtd = 0, v_qtd||' restante(s)');

  -- 4. Prontuário de outra clínica é recusado
  DECLARE v_outro uuid;
  BEGIN
    SELECT id INTO v_outro FROM _vizinho;
    IF v_outro IS NULL THEN
      INSERT INTO _res VALUES (4, 'prontuário de outra clínica', true, 'sem prontuário vizinho para testar');
    ELSE
      BEGIN
        PERFORM public.substituir_prescricoes_do_prontuario(v_outro,
          '[{"medicamento":"X","dosagem":"1","posologia":"1x","duracao":"1","quantidade":"1"}]'::jsonb);
        INSERT INTO _res VALUES (4, 'prescrever no prontuário de outra clínica', false, 'ACEITOU');
      EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
        INSERT INTO _res VALUES (4, 'prescrever no prontuário de outra clínica é recusado', true, left(v_erro,50));
      END;
    END IF;
  END;
END $$;

SELECT
  string_agg((CASE WHEN ok THEN 'OK   ' ELSE 'FALHOU ' END) || n || '. ' || caso || ' [' || detalhe || ']',
             E'\n' ORDER BY n) AS resultado,
  count(*) FILTER (WHERE ok) || '/' || count(*) AS placar
FROM _res;

ROLLBACK;
