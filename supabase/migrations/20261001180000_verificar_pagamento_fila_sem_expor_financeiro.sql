BEGIN;

-- Perfis clínicos precisam saber se podem chamar o paciente, mas não devem
-- receber a lista nem os valores das cobranças de consulta.
CREATE OR REPLACE FUNCTION public.verificar_pagamento_fila(p_agendamento_ids uuid[])
RETURNS TABLE(agendamento_id uuid, pode_atender boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica_id uuid;
BEGIN
  IF auth.uid() IS NULL
     OR NOT (public.can_manage_data(auth.uid()) OR public.can_access_clinical(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para consultar a liberação da fila.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_clinica_id := public.get_my_clinica_id();
  IF v_clinica_id IS NULL OR NOT public.is_same_clinica(v_clinica_id) THEN
    RAISE EXCEPTION 'Clínica inválida para consultar a fila.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT a.id,
         (
           NOT COALESCE(c.exigir_pagamento_previo, false)
           OR NOT a.exige_pagamento_previo
           OR a.liberado_sem_pagamento
           OR COALESCE(public.saldo_devedor_do_agendamento(a.id), 0) <= 0.009
         ) AS pode_atender
    FROM public.agendamentos a
    JOIN public.clinicas c ON c.id = a.clinica_id
   WHERE a.id = ANY(COALESCE(p_agendamento_ids, '{}'::uuid[]))
     AND a.clinica_id = v_clinica_id
     AND public.is_same_clinica(a.clinica_id);
END;
$$;

REVOKE ALL ON FUNCTION public.verificar_pagamento_fila(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verificar_pagamento_fila(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.verificar_pagamento_fila(uuid[]) IS
  'Devolve apenas a decisão de liberação de cada agendamento da própria clínica; não expõe valores ou lançamentos.';

-- A fila pode ficar aberta após um cancelamento feito pela Agenda. A transição
-- atômica precisa recusar estados terminais mesmo quando um cliente antigo
-- ainda tenta iniciar o atendimento.
CREATE OR REPLACE FUNCTION public.iniciar_atendimento_atomico(
  p_agendamento_id uuid,
  p_fila_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agendamento public.agendamentos%rowtype;
  v_fila public.fila_atendimento%rowtype;
BEGIN
  SELECT * INTO v_agendamento FROM public.agendamentos
   WHERE id = p_agendamento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado nesta clínica.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_fila FROM public.fila_atendimento
   WHERE id = p_fila_id AND agendamento_id = p_agendamento_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item da fila não pertence ao agendamento.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_agendamento.status::text IN (
    'cancelado', 'faltou', 'finalizado', 'atendimento_finalizado', 'aguardando_pagamento_adicional'
  ) THEN
    RAISE EXCEPTION 'O agendamento está % e não pode iniciar atendimento.', v_agendamento.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_agendamento.status::text = 'em_atendimento' AND v_fila.status = 'em_atendimento' THEN
    RETURN jsonb_build_object('repetido', true, 'status', 'em_atendimento');
  END IF;
  IF v_fila.cobranca_estado = 'pendente' THEN
    RAISE EXCEPTION 'A cobrança do check-in ainda está sendo confirmada. Atualize a fila e tente novamente.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_fila.status NOT IN ('aguardando', 'chamado') THEN
    RAISE EXCEPTION 'O item da fila está % e não pode iniciar atendimento.', v_fila.status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.agendamentos SET status = 'em_atendimento' WHERE id = v_agendamento.id;
  UPDATE public.fila_atendimento SET status = 'em_atendimento' WHERE id = v_fila.id;
  RETURN jsonb_build_object('repetido', false, 'status', 'em_atendimento');
END;
$$;

COMMIT;
