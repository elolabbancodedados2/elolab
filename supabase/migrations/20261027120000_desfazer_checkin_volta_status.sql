-- Desfazer check-in sempre falhava: a regra de transição de status proíbe
-- "aguardando -> agendado/confirmado", que é justamente o que o desfazer faz.
-- O paciente ficava na fila sem cobrança. A função de desfazer agora marca a
-- transação, e a regra aceita essa volta somente nesse caso.

CREATE OR REPLACE FUNCTION public.validar_transicao_status_agendamento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_permitidos text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS NULL OR NEW.status::text NOT IN ('agendado', 'confirmado') THEN
      RAISE EXCEPTION 'Um agendamento novo deve iniciar como agendado ou confirmado.' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status::text = 'cancelado'
     AND NEW.status::text = 'agendado'
     AND EXISTS (
       SELECT 1 FROM public.retornos r
        WHERE r.agendamento_retorno_id = NEW.id
          AND r.clinica_id = NEW.clinica_id
          AND r.status::text NOT IN ('realizado', 'cancelado')
     ) THEN
    RETURN NEW;
  END IF;

  -- Volta permitida só dentro de desfazer_checkin_sem_cobranca (flag local da transação).
  IF OLD.status::text = 'aguardando'
     AND NEW.status::text IN ('agendado', 'confirmado')
     AND current_setting('elolab.desfazendo_checkin', true) = 'on' THEN
    RETURN NEW;
  END IF;

  v_permitidos := CASE OLD.status::text
    WHEN 'agendado' THEN ARRAY['confirmado', 'aguardando', 'aguardando_pagamento', 'aguardando_triagem', 'em_triagem', 'pago', 'cancelado', 'faltou']
    WHEN 'confirmado' THEN ARRAY['aguardando', 'aguardando_pagamento', 'aguardando_triagem', 'em_triagem', 'pago', 'cancelado', 'faltou']
    WHEN 'aguardando' THEN ARRAY['aguardando_pagamento', 'aguardando_triagem', 'em_triagem', 'em_atendimento', 'pago', 'cancelado', 'faltou']
    WHEN 'aguardando_pagamento' THEN ARRAY['aguardando', 'pago', 'cancelado']
    WHEN 'aguardando_triagem' THEN ARRAY['aguardando', 'em_triagem', 'em_atendimento', 'pago', 'cancelado', 'faltou']
    WHEN 'em_triagem' THEN ARRAY['aguardando', 'em_atendimento', 'pago', 'cancelado']
    WHEN 'pago' THEN ARRAY['aguardando', 'aguardando_triagem', 'em_triagem', 'em_atendimento', 'finalizado', 'atendimento_finalizado', 'aguardando_pagamento_adicional']
    WHEN 'em_atendimento' THEN ARRAY['finalizado', 'atendimento_finalizado', 'aguardando_pagamento_adicional', 'cancelado']
    WHEN 'aguardando_pagamento_adicional' THEN ARRAY['pago', 'finalizado', 'atendimento_finalizado']
    WHEN 'finalizado' THEN ARRAY['atendimento_finalizado', 'aguardando_pagamento_adicional']
    ELSE ARRAY[]::text[]
  END;

  IF NEW.status IS NULL OR NOT (NEW.status::text = ANY(v_permitidos)) THEN
    RAISE EXCEPTION 'Transição de status de agendamento inválida: % → %.', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status::text = 'pago'
     AND COALESCE(public.saldo_devedor_do_agendamento(NEW.id), 0) > 0.009 THEN
    RAISE EXCEPTION 'O agendamento não pode ficar pago enquanto houver saldo em aberto.' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.desfazer_checkin_sem_cobranca(p_agendamento_id uuid, p_fila_id uuid, p_clinica_id uuid, p_status_anterior text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_agendamento public.agendamentos%rowtype;
  v_fila public.fila_atendimento%rowtype;
  v_linhas integer;
BEGIN
  IF p_clinica_id IS NULL
     OR NOT (public.can_manage_data(auth.uid()) OR public.is_enfermagem(auth.uid()))
     OR NOT public.is_same_clinica(p_clinica_id) THEN
    RAISE EXCEPTION 'Sem permissao para desfazer check-in nesta clinica.' USING errcode = 'insufficient_privilege';
  END IF;
  IF p_status_anterior IS NULL OR p_status_anterior NOT IN ('agendado', 'confirmado', 'aguardando') THEN
    RAISE EXCEPTION 'Status anterior invalido para desfazer check-in.' USING errcode = 'check_violation';
  END IF;

  SELECT * INTO v_agendamento
   FROM public.agendamentos
   WHERE id = p_agendamento_id
     AND clinica_id = p_clinica_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('desfeito', false, 'motivo', 'agendamento_nao_encontrado');
  END IF;

  -- Billing insertion takes this same appointment lock. If it committed first,
  -- preserve check-in; if rollback wins, billing will see no waiting queue row.
  IF EXISTS (
    SELECT 1 FROM public.lancamentos AS l
     WHERE l.agendamento_id = p_agendamento_id
       AND (l.clinica_id = p_clinica_id OR l.clinica_id IS NULL)
       AND l.valor > 0
       AND l.status::text NOT IN ('cancelado', 'estornado')
  ) THEN
    RETURN jsonb_build_object('desfeito', false, 'motivo', 'cobranca_ativa');
  END IF;

  SELECT * INTO v_fila
   FROM public.fila_atendimento
   WHERE id = p_fila_id
     AND agendamento_id = p_agendamento_id
     AND clinica_id = p_clinica_id
   FOR UPDATE;
  IF NOT FOUND
     OR v_agendamento.status::text IS DISTINCT FROM 'aguardando'
     OR v_fila.status IS DISTINCT FROM 'aguardando' THEN
    RETURN jsonb_build_object('desfeito', false, 'motivo', 'atendimento_ja_avancou');
  END IF;

  DELETE FROM public.fila_atendimento WHERE id = v_fila.id;
  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  IF v_linhas <> 1 THEN
    RAISE EXCEPTION 'Nao foi possivel remover a entrada da fila.' USING errcode = 'insufficient_privilege';
  END IF;
  PERFORM set_config('elolab.desfazendo_checkin', 'on', true);
  UPDATE public.agendamentos
     SET status = p_status_anterior::public.status_agendamento
   WHERE id = v_agendamento.id;
  PERFORM set_config('elolab.desfazendo_checkin', 'off', true);
  RETURN jsonb_build_object('desfeito', true);
END;
$function$;
