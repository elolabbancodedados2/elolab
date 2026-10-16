BEGIN;

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS motivo_cancelamento text;

COMMENT ON COLUMN public.agendamentos.motivo_cancelamento IS
  'Categoria administrativa do cancelamento; não registrar informação clínica neste campo.';

CREATE OR REPLACE FUNCTION public.cancelar_agendamento_com_motivo(
  p_agendamento_id uuid,
  p_clinica_id uuid,
  p_updated_at timestamptz,
  p_motivo_cancelamento text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agendamento public.agendamentos%rowtype;
  v_fila_removida integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_same_clinica(p_clinica_id) THEN
    RAISE EXCEPTION 'Sem permissao para atualizar esta consulta.' USING ERRCODE = '42501';
  END IF;

  IF p_motivo_cancelamento IS NULL OR p_motivo_cancelamento NOT IN (
    'solicitacao_paciente', 'indisponibilidade_profissional', 'conflito_horario',
    'ajuste_administrativo', 'outro'
  ) THEN
    RAISE EXCEPTION 'Motivo de cancelamento invalido.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_agendamento
    FROM public.agendamentos
   WHERE id = p_agendamento_id
     AND clinica_id = p_clinica_id
     AND updated_at IS NOT DISTINCT FROM p_updated_at
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('atualizado', false, 'fila_removida', 0);
  END IF;

  IF NOT (
    public.can_manage_data(auth.uid())
    OR public.is_enfermagem(auth.uid())
    OR (public.is_medico(auth.uid()) AND public.is_medico_da_agenda(v_agendamento.medico_id))
  ) THEN
    RAISE EXCEPTION 'Sem permissao para atualizar esta consulta.' USING ERRCODE = '42501';
  END IF;

  IF v_agendamento.status::text NOT IN (
    'agendado', 'confirmado', 'aguardando', 'aguardando_triagem', 'em_triagem'
  ) THEN
    RETURN jsonb_build_object('atualizado', false, 'fila_removida', 0);
  END IF;

  DELETE FROM public.fila_atendimento
   WHERE agendamento_id = p_agendamento_id
     AND clinica_id = p_clinica_id
     AND status <> 'finalizado';
  GET DIAGNOSTICS v_fila_removida = ROW_COUNT;

  UPDATE public.agendamentos
     SET status = 'cancelado'::public.status_agendamento,
         motivo_cancelamento = p_motivo_cancelamento
   WHERE id = p_agendamento_id
     AND clinica_id = p_clinica_id;

  RETURN jsonb_build_object('atualizado', true, 'fila_removida', v_fila_removida);
END;
$$;

REVOKE ALL ON FUNCTION public.cancelar_agendamento_com_motivo(uuid, uuid, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_agendamento_com_motivo(uuid, uuid, timestamptz, text) TO authenticated;

COMMIT;
