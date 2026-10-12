BEGIN;

-- Clinical users see triage records; reception gets only appointment IDs via a scoped RPC.
DROP POLICY IF EXISTS triagens_select_scoped ON public.triagens;
CREATE POLICY triagens_select_scoped
  ON public.triagens
  FOR SELECT
  TO authenticated
  USING (
    public.can_access_clinical(auth.uid())
    AND public.is_same_clinica(clinica_id)
  );

-- Queue records can only be created by the validated transactional check-in RPC.
DROP POLICY IF EXISTS fila_atendimento_insert ON public.fila_atendimento;
REVOKE INSERT ON public.fila_atendimento FROM authenticated;

CREATE OR REPLACE FUNCTION public.realizar_checkin(
  p_agendamento_id uuid,
  p_prioridade text DEFAULT 'normal'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agendamento public.agendamentos%rowtype;
  v_fila public.fila_atendimento%rowtype;
  v_posicao integer;
  v_status_anterior text;
  v_clinica_id uuid;
BEGIN
  IF auth.uid() IS NULL
     OR NOT (
       public.is_admin(auth.uid())
       OR public.can_manage_data(auth.uid())
       OR public.is_recepcao(auth.uid())
       OR public.is_enfermagem(auth.uid())
       OR public.is_medico(auth.uid())
     ) THEN
    RAISE EXCEPTION 'Sem permissao para fazer check-in.' USING ERRCODE = '42501';
  END IF;

  IF p_prioridade IS NULL OR p_prioridade NOT IN ('normal', 'preferencial', 'urgente') THEN
    RAISE EXCEPTION 'Prioridade de fila invalida.' USING ERRCODE = 'check_violation';
  END IF;

  v_clinica_id := public.get_my_clinica_id();
  IF v_clinica_id IS NULL THEN
    RAISE EXCEPTION 'Perfil sem clinica vinculada.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_agendamento
    FROM public.agendamentos
   WHERE id = p_agendamento_id
     AND clinica_id = v_clinica_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento nao encontrado nesta clinica.' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT (
    public.is_admin(auth.uid())
    OR public.is_recepcao(auth.uid())
    OR public.can_manage_data(auth.uid())
    OR public.is_enfermagem(auth.uid())
    OR (public.is_medico(auth.uid()) AND public.is_medico_da_agenda(v_agendamento.medico_id))
  ) THEN
    RAISE EXCEPTION 'Sem permissao para fazer check-in neste agendamento.' USING ERRCODE = '42501';
  END IF;

  IF v_agendamento.status::text IN ('cancelado', 'faltou', 'finalizado', 'atendimento_finalizado') THEN
    RAISE EXCEPTION 'O agendamento esta % e nao aceita check-in.', v_agendamento.status USING ERRCODE = 'check_violation';
  END IF;

  v_status_anterior := v_agendamento.status::text;
  SELECT * INTO v_fila
    FROM public.fila_atendimento
   WHERE agendamento_id = p_agendamento_id
     AND clinica_id = v_clinica_id
     AND status <> 'finalizado'
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;
  IF FOUND THEN
    IF (CASE p_prioridade WHEN 'urgente' THEN 3 WHEN 'preferencial' THEN 2 ELSE 1 END)
       > (CASE v_fila.prioridade WHEN 'urgente' THEN 3 WHEN 'preferencial' THEN 2 ELSE 1 END) THEN
      UPDATE public.fila_atendimento
         SET prioridade = p_prioridade
       WHERE id = v_fila.id
       RETURNING * INTO v_fila;
    END IF;
    RETURN jsonb_build_object(
      'repetido', true, 'fila_id', v_fila.id,
      'status_agendamento', v_agendamento.status::text,
      'status_anterior', v_status_anterior,
      'prioridade', v_fila.prioridade,
      'cobranca_estado', v_fila.cobranca_estado
    );
  END IF;

  IF v_agendamento.status::text = 'em_atendimento' THEN
    RAISE EXCEPTION 'O atendimento ja foi iniciado e nao aceita check-in.' USING ERRCODE = 'check_violation';
  END IF;

  IF v_agendamento.data IS DISTINCT FROM (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'Somente consultas de hoje podem entrar na fila.' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_clinica_id::text), 0);
  SELECT coalesce(max(posicao), 0) + 1 INTO v_posicao
    FROM public.fila_atendimento
   WHERE clinica_id = v_clinica_id AND status <> 'finalizado';

  INSERT INTO public.fila_atendimento(
    agendamento_id, posicao, status, prioridade, horario_chegada, clinica_id, cobranca_estado
  ) VALUES (
    v_agendamento.id, v_posicao, 'aguardando', p_prioridade, now(), v_clinica_id, 'pendente'
  ) RETURNING * INTO v_fila;

  UPDATE public.agendamentos SET status = 'aguardando' WHERE id = v_agendamento.id;
  RETURN jsonb_build_object(
    'repetido', false, 'fila_id', v_fila.id,
    'status_agendamento', 'aguardando', 'status_anterior', v_status_anterior,
    'prioridade', p_prioridade, 'cobranca_estado', 'pendente'
  );
END;
$$;
REVOKE ALL ON FUNCTION public.realizar_checkin(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.realizar_checkin(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.listar_agendamentos_com_triagem(p_agendamento_ids uuid[])
RETURNS TABLE (agendamento_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica_id uuid := public.get_my_clinica_id();
BEGIN
  IF auth.uid() IS NULL
     OR v_clinica_id IS NULL
     OR NOT (
       public.is_admin(auth.uid())
       OR public.is_recepcao(auth.uid())
       OR public.can_access_clinical(auth.uid())
     ) THEN
    RAISE EXCEPTION 'Sem permissao para consultar liberacoes de triagem.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT DISTINCT t.agendamento_id
      FROM public.triagens AS t
      JOIN public.agendamentos AS a ON a.id = t.agendamento_id
     WHERE a.clinica_id = v_clinica_id
       AND (t.clinica_id = v_clinica_id OR t.clinica_id IS NULL)
       AND t.agendamento_id = ANY(COALESCE(p_agendamento_ids, ARRAY[]::uuid[]));
END;
$$;
REVOKE ALL ON FUNCTION public.listar_agendamentos_com_triagem(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_agendamentos_com_triagem(uuid[]) TO authenticated;

-- tem_triagem is an internal trigger helper and must not expose a cross-clinic boolean API.
REVOKE ALL ON FUNCTION public.tem_triagem(uuid) FROM PUBLIC, anon, authenticated;

COMMIT;
