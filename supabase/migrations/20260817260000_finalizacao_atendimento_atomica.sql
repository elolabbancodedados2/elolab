-- Finaliza o atendimento, a fila e o retorno em uma única transação.

CREATE OR REPLACE FUNCTION public.finalizar_atendimento_atomico(
  p_agendamento_id uuid,
  p_fila_id uuid DEFAULT NULL,
  p_agendar_retorno boolean DEFAULT false,
  p_dias_retorno integer DEFAULT NULL
)
RETURNS TABLE (status_agendamento text, retorno_id uuid)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_agendamento public.agendamentos%ROWTYPE;
  v_retorno_id uuid;
  v_status text := 'finalizado';
  v_exige_pagamento boolean := false;
  v_saldo numeric := 0;
BEGIN
  SELECT * INTO v_agendamento
    FROM public.agendamentos
   WHERE id = p_agendamento_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado ou fora da sua clínica';
  END IF;

  IF p_fila_id IS NOT NULL THEN
    PERFORM 1 FROM public.fila_atendimento
     WHERE id = p_fila_id AND agendamento_id = p_agendamento_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item da fila não pertence ao agendamento informado';
    END IF;
  END IF;

  SELECT COALESCE(exigir_pagamento_previo, false)
    INTO v_exige_pagamento
    FROM public.clinicas
   WHERE id = v_agendamento.clinica_id;

  IF v_exige_pagamento THEN
    v_saldo := COALESCE(public.saldo_devedor_do_agendamento(p_agendamento_id), 0);
    IF v_saldo > 0.009 THEN
      v_status := 'aguardando_pagamento_adicional';
    END IF;
  END IF;

  UPDATE public.agendamentos
     SET status = v_status::public.status_agendamento
   WHERE id = p_agendamento_id;

  IF p_fila_id IS NOT NULL THEN
    UPDATE public.fila_atendimento SET status = 'finalizado' WHERE id = p_fila_id;
  END IF;

  IF p_agendar_retorno THEN
    IF p_dias_retorno IS NULL OR p_dias_retorno < 1 OR p_dias_retorno > 730 THEN
      RAISE EXCEPTION 'Prazo do retorno deve estar entre 1 e 730 dias';
    END IF;

    SELECT id INTO v_retorno_id
      FROM public.retornos
     WHERE agendamento_id = p_agendamento_id
       AND status <> 'cancelado'
     ORDER BY created_at DESC
     LIMIT 1;

    IF v_retorno_id IS NULL THEN
      INSERT INTO public.retornos (
        paciente_id, medico_id, data_retorno_prevista, data_consulta_origem,
        motivo, status, agendamento_id, clinica_id
      ) VALUES (
        v_agendamento.paciente_id, v_agendamento.medico_id,
        current_date + p_dias_retorno, current_date,
        'Retorno de ' || COALESCE(v_agendamento.tipo, 'consulta'),
        'pendente', p_agendamento_id, v_agendamento.clinica_id
      ) RETURNING id INTO v_retorno_id;
    END IF;
  END IF;

  RETURN QUERY SELECT v_status, v_retorno_id;
END;
$$;

REVOKE ALL ON FUNCTION public.finalizar_atendimento_atomico(uuid, uuid, boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalizar_atendimento_atomico(uuid, uuid, boolean, integer) TO authenticated;

COMMENT ON FUNCTION public.finalizar_atendimento_atomico(uuid, uuid, boolean, integer) IS
  'Atualiza agendamento e fila e cria o retorno solicitado atomicamente, com bloqueio concorrente.';
