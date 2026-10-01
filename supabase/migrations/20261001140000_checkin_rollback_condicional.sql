-- Serialize queue numbering per clinic while preserving the RPC signature.
-- Derive clinic scope from the authenticated profile for old and new clients.
DROP FUNCTION IF EXISTS public.realizar_checkin(uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.realizar_checkin(
  p_agendamento_id uuid,
  p_prioridade text DEFAULT 'normal'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agendamento public.agendamentos%rowtype;
  v_fila public.fila_atendimento%rowtype;
  v_posicao integer;
  v_status_anterior text;
  v_clinica_id uuid;
BEGIN
  IF p_prioridade IS NULL OR p_prioridade NOT IN ('normal', 'preferencial', 'urgente') THEN
    RAISE EXCEPTION 'Prioridade de fila invalida.' USING errcode = 'check_violation';
  END IF;

  v_clinica_id := public.get_my_clinica_id();
  IF v_clinica_id IS NULL THEN
    RAISE EXCEPTION 'Perfil sem clinica vinculada.' USING errcode = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_agendamento
    FROM public.agendamentos
   WHERE id = p_agendamento_id
   FOR UPDATE;
  IF NOT FOUND OR v_agendamento.clinica_id IS DISTINCT FROM v_clinica_id THEN
    RAISE EXCEPTION 'Agendamento nao encontrado nesta clinica.' USING errcode = 'no_data_found';
  END IF;
  IF v_agendamento.status::text IN ('cancelado', 'faltou', 'finalizado', 'atendimento_finalizado') THEN
    RAISE EXCEPTION 'O agendamento esta % e nao aceita check-in.', v_agendamento.status;
  END IF;

  v_status_anterior := v_agendamento.status::text;
  SELECT * INTO v_fila
    FROM public.fila_atendimento
   WHERE agendamento_id = p_agendamento_id AND status <> 'finalizado'
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'repetido', true,
      'fila_id', v_fila.id,
      'status_agendamento', v_agendamento.status::text,
      'status_anterior', v_status_anterior
    );
  END IF;

  IF v_agendamento.data IS DISTINCT FROM (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'Somente consultas de hoje podem entrar na fila.' USING errcode = 'check_violation';
  END IF;

  -- Different appointments do not share a row lock. Serialize the position
  -- allocation for the clinic so simultaneous check-ins cannot get one slot.
  PERFORM pg_advisory_xact_lock(hashtext(v_agendamento.clinica_id::text), 0);
  SELECT coalesce(max(posicao), 0) + 1 INTO v_posicao
    FROM public.fila_atendimento
   WHERE clinica_id = v_agendamento.clinica_id AND status <> 'finalizado';

  INSERT INTO public.fila_atendimento(
    agendamento_id, posicao, status, prioridade, horario_chegada, clinica_id
  ) VALUES (
    v_agendamento.id, v_posicao, 'aguardando', p_prioridade, now(), v_agendamento.clinica_id
  ) RETURNING * INTO v_fila;

  UPDATE public.agendamentos SET status = 'aguardando' WHERE id = v_agendamento.id;
  RETURN jsonb_build_object(
    'repetido', false,
    'fila_id', v_fila.id,
    'status_agendamento', 'aguardando',
    'status_anterior', v_status_anterior
  );
END;
$$;

REVOKE ALL ON FUNCTION public.realizar_checkin(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.realizar_checkin(uuid, text) TO authenticated;

-- Roll back only the exact new queue row while both records still indicate the
-- untouched waiting state. If the patient has advanced, preserve that work.
CREATE OR REPLACE FUNCTION public.desfazer_checkin_sem_cobranca(
  p_agendamento_id uuid,
  p_fila_id uuid,
  p_clinica_id uuid,
  p_status_anterior text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
  UPDATE public.agendamentos
     SET status = p_status_anterior::public.status_agendamento
   WHERE id = v_agendamento.id;
  RETURN jsonb_build_object('desfeito', true);
END;
$$;

REVOKE ALL ON FUNCTION public.desfazer_checkin_sem_cobranca(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.desfazer_checkin_sem_cobranca(uuid, uuid, uuid, text) TO authenticated;

-- Invoice creation and rollback serialize on the appointment row. That closes
-- the window where a failed request could remove check-in just before another
-- request successfully inserts its invoice.
CREATE OR REPLACE FUNCTION public.criar_cobranca_checkin_atomica(
  p_agendamento_id uuid,
  p_clinica_id uuid,
  p_paciente_id uuid,
  p_categoria text,
  p_descricao text,
  p_valor numeric,
  p_data date
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agendamento public.agendamentos%rowtype;
  v_lancamento public.lancamentos%rowtype;
BEGIN
  IF p_clinica_id IS NULL
     OR NOT (public.can_manage_data(auth.uid()) OR public.is_enfermagem(auth.uid()))
     OR NOT public.is_same_clinica(p_clinica_id) THEN
    RAISE EXCEPTION 'Sem permissao para cobrar nesta clinica.' USING errcode = 'insufficient_privilege';
  END IF;
  IF p_valor <= 0 OR p_categoria NOT IN ('consulta', 'exame') THEN
    RAISE EXCEPTION 'Dados da cobranca invalidos.' USING errcode = 'check_violation';
  END IF;

  SELECT * INTO v_agendamento FROM public.agendamentos
   WHERE id = p_agendamento_id AND clinica_id = p_clinica_id FOR UPDATE;
  IF NOT FOUND OR v_agendamento.paciente_id IS DISTINCT FROM p_paciente_id THEN
    RAISE EXCEPTION 'Agendamento nao encontrado nesta clinica.' USING errcode = 'no_data_found';
  END IF;

  SELECT * INTO v_lancamento FROM public.lancamentos
   WHERE agendamento_id = p_agendamento_id
     AND (clinica_id = p_clinica_id OR clinica_id IS NULL)
   LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    IF v_lancamento.status::text IN ('cancelado', 'estornado') THEN
      RAISE EXCEPTION 'A cobranca anterior foi cancelada ou estornada.' USING errcode = 'check_violation';
    END IF;
    RETURN 'already_exists';
  END IF;

  -- Reception may announce the patient while price lookup is still running.
  -- A called row is still active and must be billable; rollback only removes
  -- an untouched 'aguardando' row while holding this same appointment lock.
  IF v_agendamento.status::text IS DISTINCT FROM 'aguardando' OR NOT EXISTS (
    SELECT 1 FROM public.fila_atendimento f
     WHERE f.agendamento_id = p_agendamento_id
       AND f.clinica_id = p_clinica_id
       AND f.status IN ('aguardando', 'chamado')
  ) THEN
    RAISE EXCEPTION 'Check-in nao esta ativo; cobranca nao criada.' USING errcode = 'check_violation';
  END IF;

  INSERT INTO public.lancamentos(
    tipo, categoria, descricao, valor, data, data_vencimento, status,
    paciente_id, agendamento_id, forma_pagamento, clinica_id
  ) VALUES (
    'receita', p_categoria, p_descricao, p_valor, p_data, p_data, 'pendente',
    p_paciente_id, p_agendamento_id, NULL, p_clinica_id
  );
  RETURN 'created';
END;
$$;

REVOKE ALL ON FUNCTION public.criar_cobranca_checkin_atomica(uuid, uuid, uuid, text, text, numeric, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_cobranca_checkin_atomica(uuid, uuid, uuid, text, text, numeric, date) TO authenticated;

-- Repair zero-value legacy exam charges through a role-scoped write. The old
-- direct UPDATE silently affected zero rows for clinical users under RLS.
CREATE OR REPLACE FUNCTION public.reparar_cobranca_exame_atomica(
  p_lancamento_id uuid,
  p_clinica_id uuid,
  p_descricao text,
  p_valor numeric
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agendamento public.agendamentos%rowtype;
  v_lancamento public.lancamentos%rowtype;
  v_linhas integer;
BEGIN
  IF p_clinica_id IS NULL
     OR NOT (public.can_access_financial(auth.uid()) OR public.is_recepcao(auth.uid()) OR public.is_enfermagem(auth.uid()))
     OR NOT public.is_same_clinica(p_clinica_id) THEN
    RAISE EXCEPTION 'Sem permissao para corrigir cobranca nesta clinica.' USING errcode = 'insufficient_privilege';
  END IF;
  IF p_valor <= 0 OR p_descricao IS NULL OR length(trim(p_descricao)) = 0 THEN
    RAISE EXCEPTION 'Dados da cobranca invalidos.' USING errcode = 'check_violation';
  END IF;

  -- Match the appointment-first lock order used by billing, rollback, and
  -- no-show transitions, including old rows whose clinic_id is NULL.
  SELECT a.* INTO v_agendamento
    FROM public.agendamentos AS a
    JOIN public.lancamentos AS l ON l.agendamento_id = a.id
   WHERE l.id = p_lancamento_id
     AND (l.clinica_id = p_clinica_id OR l.clinica_id IS NULL)
     AND a.clinica_id = p_clinica_id
   FOR UPDATE OF a;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT * INTO v_lancamento FROM public.lancamentos
   WHERE id = p_lancamento_id
     AND (clinica_id = p_clinica_id OR clinica_id IS NULL)
   FOR UPDATE;
  IF NOT FOUND
     OR NOT (
       v_lancamento.categoria = 'exame'
       OR (v_lancamento.categoria = 'consulta' AND lower(btrim(coalesce(v_agendamento.tipo, ''))) IN ('exame', 'exames'))
     )
     OR v_lancamento.valor > 0
     OR v_lancamento.status::text IS DISTINCT FROM 'pendente'
     OR v_agendamento.status IS NULL
     OR v_agendamento.status::text IN ('cancelado', 'faltou')
     OR coalesce(v_lancamento.valor_pago, 0) > 0
     OR EXISTS (
       SELECT 1 FROM public.pagamentos AS p
        WHERE p.lancamento_id = v_lancamento.id
          AND p.estornado_em IS NULL
     ) THEN
    RETURN false;
  END IF;

  UPDATE public.lancamentos
     SET categoria = 'exame', descricao = p_descricao, valor = p_valor, clinica_id = p_clinica_id
   WHERE id = v_lancamento.id;
  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  RETURN v_linhas = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.reparar_cobranca_exame_atomica(uuid, uuid, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reparar_cobranca_exame_atomica(uuid, uuid, text, numeric) TO authenticated;

-- Return only a yes/no result to a clinic clinician/receptionist. These roles
-- do not all have row-level access to consultation charges.
CREATE OR REPLACE FUNCTION public.tem_cobranca_ativa_do_agendamento(
  p_agendamento_id uuid,
  p_clinica_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_clinica_id IS NULL
     OR NOT (public.can_manage_data(auth.uid()) OR public.is_enfermagem(auth.uid()))
     OR NOT public.is_same_clinica(p_clinica_id) THEN
    RAISE EXCEPTION 'Sem permissao para verificar a cobranca nesta clinica.' USING errcode = 'insufficient_privilege';
  END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.agendamentos AS a
      JOIN public.lancamentos AS l
        ON l.agendamento_id = a.id
       AND (l.clinica_id = a.clinica_id OR l.clinica_id IS NULL)
     WHERE a.id = p_agendamento_id
       AND a.clinica_id = p_clinica_id
       AND l.valor > 0
       AND l.status::text NOT IN ('cancelado', 'estornado')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.tem_cobranca_ativa_do_agendamento(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tem_cobranca_ativa_do_agendamento(uuid, uuid) TO authenticated;

-- Resolve stale "in progress" records without overwriting a visit that changed
-- after the list loaded. Pending charges are cancelled together; recorded money
-- requires an explicit refund/reconciliation before marking the visit absent.
CREATE OR REPLACE FUNCTION public.marcar_atendimento_nao_realizado(
  p_agendamento_id uuid,
  p_clinica_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agendamento public.agendamentos%rowtype;
  v_fila public.fila_atendimento%rowtype;
  v_lancamento public.lancamentos%rowtype;
  v_tem_lancamento boolean := false;
  v_pagamento_registrado boolean := false;
BEGIN
  SELECT * INTO v_agendamento
    FROM public.agendamentos
   WHERE id = p_agendamento_id AND clinica_id = p_clinica_id
   FOR UPDATE;
  IF NOT FOUND OR v_agendamento.status::text IS DISTINCT FROM 'em_atendimento' THEN
    RETURN jsonb_build_object('desfeito', false, 'motivo', 'status_alterado');
  END IF;

  SELECT * INTO v_fila
    FROM public.fila_atendimento
   WHERE agendamento_id = p_agendamento_id
     AND clinica_id = p_clinica_id
     AND status <> 'finalizado'
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  SELECT * INTO v_lancamento
    FROM public.lancamentos
   WHERE agendamento_id = p_agendamento_id AND clinica_id = p_clinica_id
   LIMIT 1
   FOR UPDATE;
  v_tem_lancamento := FOUND;

  IF v_tem_lancamento THEN
    SELECT EXISTS (
      SELECT 1 FROM public.pagamentos
       WHERE lancamento_id = v_lancamento.id AND estornado_em IS NULL
    ) INTO v_pagamento_registrado;
    IF v_pagamento_registrado
       OR coalesce(v_lancamento.valor_pago, 0) > 0
       OR v_lancamento.status::text IN ('pago', 'parcial') THEN
      RETURN jsonb_build_object('desfeito', false, 'motivo', 'pagamento_registrado');
    END IF;
    IF v_lancamento.status::text NOT IN ('cancelado', 'estornado') THEN
      UPDATE public.lancamentos SET status = 'cancelado' WHERE id = v_lancamento.id;
    END IF;
  END IF;

  IF v_fila.id IS NOT NULL THEN
    DELETE FROM public.fila_atendimento WHERE id = v_fila.id;
  END IF;
  UPDATE public.agendamentos SET status = 'cancelado' WHERE id = v_agendamento.id;

  RETURN jsonb_build_object(
    'desfeito', true,
    'cobranca_cancelada', v_tem_lancamento AND v_lancamento.status::text NOT IN ('cancelado', 'estornado'),
    'havia_cobranca', v_tem_lancamento
  );
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_atendimento_nao_realizado(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_atendimento_nao_realizado(uuid, uuid) TO authenticated;
