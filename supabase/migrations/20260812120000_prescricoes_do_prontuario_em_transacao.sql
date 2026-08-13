-- ============================================================================
-- Salvar as prescrições de um prontuário sem poder perdê-las no meio
--
-- O caminho antigo, no navegador, era:
--
--   DELETE FROM prescricoes WHERE prontuario_id = ...   -- erro ignorado
--   for (cada prescrição) INSERT ...                    -- throw no primeiro erro
--
-- São chamadas independentes. Se o segundo INSERT falhasse, o DELETE já tinha
-- sido confirmado: o prontuário ficava sem as prescrições antigas E sem a lista
-- nova. O médico editava três medicamentos e perdia os três.
--
-- No caminho inverso, se o DELETE falhasse em silêncio (RLS, rede), os INSERTs
-- rodavam mesmo assim e a lista de medicamentos do paciente dobrava a cada
-- salvamento.
--
-- Uma função plpgsql roda inteira dentro de uma transação: ou as prescrições
-- todas são trocadas, ou nada muda. É a única forma de garantir isso — o
-- cliente não tem como abrir transação via PostgREST.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.substituir_prescricoes_do_prontuario(
  p_prontuario_id uuid,
  p_prescricoes   jsonb DEFAULT '[]'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER            -- respeita o RLS de quem chamou, de propósito
SET search_path = public
AS $$
DECLARE
  v_paciente_id  uuid;
  v_medico_id    uuid;
  v_clinica_id   uuid;
  v_assinado     boolean;
  v_inseridas    integer := 0;
BEGIN
  IF p_prontuario_id IS NULL THEN
    RAISE EXCEPTION 'prontuario_id é obrigatório';
  END IF;

  IF jsonb_typeof(p_prescricoes) <> 'array' THEN
    RAISE EXCEPTION 'p_prescricoes precisa ser um array JSON';
  END IF;

  -- O SELECT passa pelo RLS: se o prontuário é de outra clínica, não vem nada
  -- e a função para aqui, antes de apagar qualquer coisa.
  SELECT paciente_id, medico_id, clinica_id, COALESCE(assinado, false)
    INTO v_paciente_id, v_medico_id, v_clinica_id, v_assinado
    FROM public.prontuarios
   WHERE id = p_prontuario_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prontuário % não encontrado ou fora da sua clínica', p_prontuario_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Prontuário assinado é imutável (CFM 1.821/07). A tela já bloqueia; aqui a
  -- regra vale também para qualquer outro caminho que chegue ao banco.
  IF v_assinado THEN
    RAISE EXCEPTION 'Prontuário assinado é imutável. Use adendos para retificar.'
      USING ERRCODE = 'raise_exception';
  END IF;

  DELETE FROM public.prescricoes WHERE prontuario_id = p_prontuario_id;

  -- A função é SECURITY INVOKER de propósito (respeita o RLS de quem chamou),
  -- e um DELETE barrado pelo RLS não levanta erro: apaga zero linhas em
  -- silêncio. Sem esta conferência, o INSERT logo abaixo somaria as novas
  -- prescrições às antigas e a lista de medicamentos do paciente dobraria a
  -- cada salvamento — a versão pior do bug que esta migration veio corrigir.
  IF EXISTS (SELECT 1 FROM public.prescricoes WHERE prontuario_id = p_prontuario_id) THEN
    RAISE EXCEPTION
      'Não foi possível remover as prescrições anteriores deste prontuário (sem permissão). Nada foi alterado.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.prescricoes (
    paciente_id, medico_id, prontuario_id, clinica_id,
    medicamento, dosagem, posologia, duracao, quantidade, observacoes,
    data_emissao, tipo
  )
  SELECT
    v_paciente_id,
    v_medico_id,
    p_prontuario_id,
    v_clinica_id,
    NULLIF(item->>'medicamento', ''),
    NULLIF(item->>'dosagem', ''),
    NULLIF(item->>'posologia', ''),
    NULLIF(item->>'duracao', ''),
    NULLIF(item->>'quantidade', ''),
    NULLIF(item->>'observacoes', ''),
    COALESCE(NULLIF(item->>'data_emissao', '')::date, CURRENT_DATE),
    COALESCE(NULLIF(item->>'tipo', ''), 'simples')
  FROM jsonb_array_elements(p_prescricoes) AS item
  WHERE NULLIF(item->>'medicamento', '') IS NOT NULL;

  GET DIAGNOSTICS v_inseridas = ROW_COUNT;
  RETURN v_inseridas;
END;
$$;

COMMENT ON FUNCTION public.substituir_prescricoes_do_prontuario(uuid, jsonb) IS
  'Troca todas as prescrições de um prontuário numa transação só. Existe porque o delete-e-reinsere feito no navegador podia apagar as prescrições e falhar na regravação, deixando o prontuário sem medicação nenhuma.';

REVOKE ALL ON FUNCTION public.substituir_prescricoes_do_prontuario(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.substituir_prescricoes_do_prontuario(uuid, jsonb) TO authenticated;

COMMIT;
