BEGIN;

CREATE OR REPLACE FUNCTION public.concluir_fila_atomico(
  p_agendamento_id uuid,
  p_fila_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agendamento public.agendamentos%ROWTYPE;
  v_fila public.fila_atendimento%ROWTYPE;
BEGIN
  SELECT * INTO v_agendamento
    FROM public.agendamentos
   WHERE id = p_agendamento_id
   FOR UPDATE;
  IF NOT FOUND OR v_agendamento.status::text NOT IN ('finalizado', 'atendimento_finalizado') THEN
    RAISE EXCEPTION 'O atendimento mudou e não pode ser concluído. Atualize a recepção.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_fila
    FROM public.fila_atendimento
   WHERE id = p_fila_id AND agendamento_id = p_agendamento_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O item da fila não pertence a este atendimento.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_fila.status = 'concluido' THEN
    RETURN true;
  END IF;
  -- Older completion paths finalized the appointment before updating the queue.
  -- Once the locked appointment is final, these legacy active queue states can
  -- safely be closed too; never touch an already-concluded or unrelated row.
  IF v_fila.status::text NOT IN ('finalizado', 'em_atendimento', 'chamado', 'aguardando') THEN
    RAISE EXCEPTION 'O item da fila não foi finalizado. Atualize a recepção.' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.fila_atendimento
     SET status = 'concluido'
   WHERE id = p_fila_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.concluir_fila_atomico(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.concluir_fila_atomico(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.concluir_fila_atomico(uuid, uuid) IS
  'Conclui idempotentemente uma fila quando o atendimento continua finalizado, incluindo estados ativos deixados por fluxos antigos.';

COMMIT;
