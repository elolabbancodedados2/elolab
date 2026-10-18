BEGIN;

CREATE TABLE IF NOT EXISTS public.fila_atendimento_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  fila_id uuid NOT NULL,
  agendamento_id uuid REFERENCES public.agendamentos(id) ON DELETE SET NULL,
  paciente_id uuid REFERENCES public.pacientes(id) ON DELETE SET NULL,
  motivo text NOT NULL CHECK (motivo IN (
    'paciente_desistiu', 'encaminhado_outro_setor', 'duplicidade_atendimento',
    'ajuste_operacional', 'outro'
  )),
  removido_por uuid NOT NULL,
  ocorreu_em timestamptz NOT NULL DEFAULT now(),
  atendimento_reaberto boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS fila_atendimento_eventos_clinica_data_idx
  ON public.fila_atendimento_eventos (clinica_id, ocorreu_em DESC);

ALTER TABLE public.fila_atendimento_eventos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fila_atendimento_eventos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fila_atendimento_eventos TO authenticated;
DROP POLICY IF EXISTS fila_atendimento_eventos_select ON public.fila_atendimento_eventos;
CREATE POLICY fila_atendimento_eventos_select ON public.fila_atendimento_eventos
  FOR SELECT TO authenticated
  USING (public.can_manage_data(auth.uid()) AND public.is_same_clinica(clinica_id));

CREATE OR REPLACE FUNCTION public.remover_item_fila_com_motivo(
  p_fila_id uuid,
  p_status_esperado text,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica_id uuid;
  v_agendamento_id uuid;
  v_paciente_id uuid;
  v_resultado jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_data(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissao para remover itens da fila.' USING ERRCODE = '42501';
  END IF;

  v_clinica_id := public.get_my_clinica_id();
  IF v_clinica_id IS NULL OR NOT public.is_same_clinica(v_clinica_id) THEN
    RAISE EXCEPTION 'Clinica nao identificada.' USING ERRCODE = '42501';
  END IF;

  IF p_motivo IS NULL OR p_motivo NOT IN (
    'paciente_desistiu', 'encaminhado_outro_setor', 'duplicidade_atendimento',
    'ajuste_operacional', 'outro'
  ) THEN
    RAISE EXCEPTION 'Motivo de saida da fila invalido.' USING ERRCODE = '22023';
  END IF;

  -- Preserve the same lock order as the atomic removal RPC: appointment, then queue row.
  SELECT agendamento_id INTO v_agendamento_id
    FROM public.fila_atendimento
   WHERE id = p_fila_id
     AND clinica_id = v_clinica_id
     AND status::text = p_status_esperado;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('removido', false, 'atendimento_reaberto', false);
  END IF;

  SELECT paciente_id INTO v_paciente_id
    FROM public.agendamentos
   WHERE id = v_agendamento_id
     AND clinica_id = v_clinica_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento nao encontrado nesta clinica.' USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1
    FROM public.fila_atendimento
   WHERE id = p_fila_id
     AND agendamento_id = v_agendamento_id
     AND clinica_id = v_clinica_id
     AND status::text = p_status_esperado
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('removido', false, 'atendimento_reaberto', false);
  END IF;

  v_resultado := public.remover_item_fila_atomico(p_fila_id, p_status_esperado);
  IF COALESCE((v_resultado->>'removido')::boolean, false) THEN
    INSERT INTO public.fila_atendimento_eventos (
      clinica_id, fila_id, agendamento_id, paciente_id, motivo, removido_por,
      atendimento_reaberto
    ) VALUES (
      v_clinica_id, p_fila_id, v_agendamento_id, v_paciente_id, p_motivo,
      auth.uid(), COALESCE((v_resultado->>'atendimento_reaberto')::boolean, false)
    );
  END IF;

  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.remover_item_fila_com_motivo(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remover_item_fila_com_motivo(uuid, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.remover_item_fila_atomico(uuid, text) FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.fila_atendimento_eventos IS
  'Trilha clínica-administrativa de saídas da fila; eventos gravados apenas pela RPC atômica.';

COMMIT;
