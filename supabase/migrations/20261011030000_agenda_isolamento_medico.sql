BEGIN;

-- A restriÃ§Ã£o visual da Agenda nÃ£o deve ser a fronteira de seguranÃ§a.
-- O vÃ­nculo usa user_id, a clÃ­nica do perfil autenticado e o id do mÃ©dico.
-- NÃ£o exige que o mÃ©dico esteja ativo: consultas existentes continuam visÃ­veis.
CREATE OR REPLACE FUNCTION public.is_medico_da_agenda(p_medico_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.medicos m
     WHERE m.id = p_medico_id
       AND m.user_id = auth.uid()
       AND m.clinica_id = public.get_my_clinica_id()
  );
$$;
REVOKE ALL ON FUNCTION public.is_medico_da_agenda(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_medico_da_agenda(uuid) TO authenticated;

-- SECURITY DEFINER bypasses row policies, so this RPC repeats the appointment
-- scope check before changing the status and synchronizes the queue in one tx.
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
  v_agendamento public.agendamentos%rowtype;
  v_fila_removida integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_same_clinica(p_clinica_id) THEN
    RAISE EXCEPTION 'Sem permissao para atualizar esta consulta.' USING ERRCODE = '42501';
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('cancelado', 'faltou') THEN
    RAISE EXCEPTION 'Status invalido para esta operacao.' USING ERRCODE = '22023';
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

  IF v_agendamento.status::text IN (
    'finalizado', 'atendimento_finalizado', 'pago',
    'aguardando_pagamento', 'aguardando_pagamento_adicional'
  ) THEN
    RETURN jsonb_build_object('atualizado', false, 'fila_removida', 0);
  END IF;

  -- Nunca remova da fila uma consulta cujo atendimento já começou. Esta
  -- allowlist também mantém a RPC alinhada ao diálogo de cancelamento.
  IF p_status = 'faltou' AND v_agendamento.status::text NOT IN (
    'agendado', 'confirmado', 'aguardando'
  ) THEN
    RETURN jsonb_build_object('atualizado', false, 'fila_removida', 0);
  END IF;

  IF p_status = 'cancelado' AND v_agendamento.status::text NOT IN (
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
     SET status = p_status::public.status_agendamento
   WHERE id = p_agendamento_id
     AND clinica_id = p_clinica_id;

  RETURN jsonb_build_object('atualizado', true, 'fila_removida', v_fila_removida);
END;
$$;
REVOKE ALL ON FUNCTION public.alterar_status_agendamento_com_fila(uuid, uuid, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.alterar_status_agendamento_com_fila(uuid, uuid, text, timestamptz) TO authenticated;

DROP POLICY IF EXISTS agendamentos_select ON public.agendamentos;
CREATE POLICY agendamentos_select ON public.agendamentos
  FOR SELECT TO authenticated
  USING (
    has_any_role(auth.uid())
    AND NOT is_financeiro(auth.uid())
    AND is_same_clinica(clinica_id)
    AND (
      NOT is_medico(auth.uid())
      OR can_manage_data(auth.uid())
      OR is_enfermagem(auth.uid())
      OR is_medico_da_agenda(medico_id)
    )
  );

DROP POLICY IF EXISTS agendamentos_insert ON public.agendamentos;
CREATE POLICY agendamentos_insert ON public.agendamentos
  FOR INSERT TO authenticated
  WITH CHECK (
    is_same_clinica(clinica_id)
    AND (
      can_manage_data(auth.uid())
      OR is_enfermagem(auth.uid())
      OR (is_medico(auth.uid()) AND is_medico_da_agenda(medico_id))
    )
  );

DROP POLICY IF EXISTS agendamentos_update ON public.agendamentos;
CREATE POLICY agendamentos_update ON public.agendamentos
  FOR UPDATE TO authenticated
  USING (
    is_same_clinica(clinica_id)
    AND (
      can_manage_data(auth.uid())
      OR is_enfermagem(auth.uid())
      OR (is_medico(auth.uid()) AND is_medico_da_agenda(medico_id))
    )
  )
  WITH CHECK (
    is_same_clinica(clinica_id)
    AND (
      can_manage_data(auth.uid())
      OR is_enfermagem(auth.uid())
      OR (is_medico(auth.uid()) AND is_medico_da_agenda(medico_id))
    )
  );

COMMIT;
