CREATE OR REPLACE FUNCTION public.alterar_status_agendamento_com_fila(
  p_agendamento_id uuid,
  p_clinica_id uuid,
  p_status text,
  p_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_atualizado uuid;
  v_fila_removida integer := 0;
BEGIN
  IF auth.uid() IS NULL
     OR NOT (public.can_manage_data(auth.uid()) OR public.can_access_clinical(auth.uid()))
     OR NOT public.is_same_clinica(p_clinica_id) THEN
    RAISE EXCEPTION 'Sem permissão para atualizar esta consulta.' USING ERRCODE = '42501';
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('cancelado', 'faltou') THEN
    RAISE EXCEPTION 'Status inválido para esta operação.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.agendamentos
     SET status = p_status::public.status_agendamento
   WHERE id = p_agendamento_id
     AND clinica_id = p_clinica_id
     AND updated_at IS NOT DISTINCT FROM p_updated_at
     AND status NOT IN (
       'finalizado', 'atendimento_finalizado', 'pago',
       'aguardando_pagamento', 'aguardando_pagamento_adicional'
     );

  IF NOT FOUND THEN
    RETURN jsonb_build_object('atualizado', false, 'fila_removida', 0);
  END IF;

  v_atualizado := p_agendamento_id;

  DELETE FROM public.fila_atendimento
   WHERE agendamento_id = v_atualizado
     AND clinica_id = p_clinica_id
     AND status <> 'finalizado';
  GET DIAGNOSTICS v_fila_removida = ROW_COUNT;

  RETURN jsonb_build_object('atualizado', true, 'fila_removida', v_fila_removida);
END;
$$;

REVOKE ALL ON FUNCTION public.alterar_status_agendamento_com_fila(uuid, uuid, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.alterar_status_agendamento_com_fila(uuid, uuid, text, timestamptz) TO authenticated;
