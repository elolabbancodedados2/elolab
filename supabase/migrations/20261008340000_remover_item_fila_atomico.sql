BEGIN;

CREATE OR REPLACE FUNCTION public.remover_item_fila_atomico(
  p_fila_id uuid,
  p_status_esperado text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica_id uuid;
  v_agendamento_id uuid;
  v_agendamento public.agendamentos%ROWTYPE;
  v_fila public.fila_atendimento%ROWTYPE;
  v_linhas integer;
  v_atendimento_reaberto boolean := false;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_data(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para remover itens da fila.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_clinica_id := public.get_my_clinica_id();
  IF v_clinica_id IS NULL THEN
    RAISE EXCEPTION 'Clínica não identificada.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Ler o vínculo primeiro e bloquear as linhas na mesma ordem das transições
  -- de atendimento (agendamento, depois fila), evitando gravações pela metade.
  SELECT agendamento_id INTO v_agendamento_id
    FROM public.fila_atendimento
   WHERE id = p_fila_id
     AND clinica_id = v_clinica_id
     AND status::text = p_status_esperado;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('removido', false, 'atendimento_reaberto', false);
  END IF;

  SELECT * INTO v_agendamento
    FROM public.agendamentos
   WHERE id = v_agendamento_id
     AND clinica_id = v_clinica_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado nesta clínica.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_fila
    FROM public.fila_atendimento
   WHERE id = p_fila_id
     AND agendamento_id = v_agendamento_id
     AND clinica_id = v_clinica_id
   FOR UPDATE;
  IF NOT FOUND OR v_fila.status::text IS DISTINCT FROM p_status_esperado THEN
    RETURN jsonb_build_object('removido', false, 'atendimento_reaberto', false);
  END IF;

  -- Retirar da fila um paciente em consulta devolve o agendamento à recepção;
  -- todos os demais estados preservam o estado clínico que já têm.
  IF v_agendamento.status::text = 'em_atendimento' THEN
    UPDATE public.agendamentos
       SET status = 'aguardando'
     WHERE id = v_agendamento.id
       AND clinica_id = v_clinica_id;
    v_atendimento_reaberto := true;
  END IF;

  DELETE FROM public.fila_atendimento
   WHERE id = v_fila.id
     AND clinica_id = v_clinica_id
     AND status::text = p_status_esperado;
  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  IF v_linhas <> 1 THEN
    RAISE EXCEPTION 'A fila mudou durante a remoção.' USING ERRCODE = 'serialization_failure';
  END IF;

  RETURN jsonb_build_object(
    'removido', true,
    'atendimento_reaberto', v_atendimento_reaberto
  );
END;
$$;

REVOKE ALL ON FUNCTION public.remover_item_fila_atomico(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remover_item_fila_atomico(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.remover_item_fila_atomico(uuid, text) IS
  'Remove um item da fila com escopo de clínica e papel; se o agendamento estiver em atendimento, devolve-o a aguardando na mesma transação.';

COMMIT;
