BEGIN;

-- Doctors may only see and change returns assigned to their own linked profile.
DROP POLICY IF EXISTS retornos_select_scoped ON public.retornos;
CREATE POLICY retornos_select_scoped ON public.retornos
  FOR SELECT TO authenticated
  USING (
    public.is_same_clinica(clinica_id)
    AND (
      public.is_admin(auth.uid())
      OR public.is_recepcao(auth.uid())
      OR public.is_enfermagem(auth.uid())
      OR (public.is_medico(auth.uid()) AND public.is_medico_da_agenda(medico_id))
    )
  );

DROP POLICY IF EXISTS retornos_insert_scoped ON public.retornos;
CREATE POLICY retornos_insert_scoped ON public.retornos
  FOR INSERT TO authenticated
  WITH CHECK (
    clinica_id = public.get_my_clinica_id()
    AND (
      public.is_admin(auth.uid())
      OR public.is_recepcao(auth.uid())
      OR public.is_enfermagem(auth.uid())
      OR (public.is_medico(auth.uid()) AND public.is_medico_da_agenda(medico_id))
    )
  );

DROP POLICY IF EXISTS retornos_update_scoped ON public.retornos;
CREATE POLICY retornos_update_scoped ON public.retornos
  FOR UPDATE TO authenticated
  USING (
    public.is_same_clinica(clinica_id)
    AND (
      public.is_admin(auth.uid())
      OR public.is_recepcao(auth.uid())
      OR public.is_enfermagem(auth.uid())
      OR (public.is_medico(auth.uid()) AND public.is_medico_da_agenda(medico_id))
    )
  )
  WITH CHECK (
    clinica_id = public.get_my_clinica_id()
    AND (
      public.is_admin(auth.uid())
      OR public.is_recepcao(auth.uid())
      OR public.is_enfermagem(auth.uid())
      OR (public.is_medico(auth.uid()) AND public.is_medico_da_agenda(medico_id))
    )
  );

-- The browser's RLS-scoped agenda query cannot see another doctor's event.
-- This definer RPC checks conflicts privately, revalidates availability and
-- blocks, and writes only a return owned by the caller or clinic operations.
DROP FUNCTION IF EXISTS public.agendar_retorno_atomico(uuid, date, time);
CREATE OR REPLACE FUNCTION public.agendar_retorno_atomico(
  p_retorno_id uuid,
  p_data date,
  p_hora time,
  p_confirmou_fora_expediente boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica_id uuid;
  v_retorno public.retornos%ROWTYPE;
  v_agendamento_id uuid;
  v_fim time;
  v_dia_semana integer;
  v_dentro_expediente boolean;
  v_status_agendamento text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessao invalida.' USING ERRCODE = '42501';
  END IF;

  v_clinica_id := public.get_my_clinica_id();
  IF v_clinica_id IS NULL OR p_data IS NULL OR p_hora IS NULL THEN
    RAISE EXCEPTION 'Clinica, data ou horario invalidos.' USING ERRCODE = '22023';
  END IF;
  IF p_data < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'A data do retorno nao pode estar no passado.' USING ERRCODE = '22023';
  END IF;
  IF p_data = (now() AT TIME ZONE 'America/Sao_Paulo')::date
     AND p_hora <= (now() AT TIME ZONE 'America/Sao_Paulo')::time THEN
    RAISE EXCEPTION 'O horario do retorno nao pode estar no passado.' USING ERRCODE = '22023';
  END IF;

  v_fim := p_hora + interval '30 minutes';
  IF v_fim <= p_hora THEN
    RAISE EXCEPTION 'O horario precisa terminar antes da meia-noite.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_retorno
    FROM public.retornos
   WHERE id = p_retorno_id
     AND clinica_id = v_clinica_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Retorno nao encontrado na clinica atual.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (
    public.is_admin(auth.uid()) OR public.is_recepcao(auth.uid())
    OR public.is_enfermagem(auth.uid())
    OR (public.is_medico(auth.uid()) AND public.is_medico_da_agenda(v_retorno.medico_id))
  ) THEN
    RAISE EXCEPTION 'Sem permissao para agendar este retorno.' USING ERRCODE = '42501';
  END IF;
  IF v_retorno.status IN ('realizado', 'cancelado') THEN
    RAISE EXCEPTION 'Este retorno ja foi realizado ou cancelado.' USING ERRCODE = '23514';
  END IF;
  IF v_retorno.paciente_id IS NULL OR v_retorno.medico_id IS NULL THEN
    RAISE EXCEPTION 'O retorno precisa ter paciente e medico vinculados.' USING ERRCODE = '23503';
  END IF;
  PERFORM 1 FROM public.pacientes p
   WHERE p.id = v_retorno.paciente_id AND p.clinica_id = v_clinica_id
   FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O paciente do retorno nao pertence a clinica atual.' USING ERRCODE = '23503';
  END IF;
  PERFORM 1 FROM public.medicos m
   WHERE m.id = v_retorno.medico_id AND m.clinica_id = v_clinica_id
   FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O medico do retorno nao pertence a clinica atual.' USING ERRCODE = '23503';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'agendamento-online-medico:' || v_clinica_id::text || ':' || v_retorno.medico_id::text || ':' || p_data::text, 0
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'agendamento-online-paciente:' || v_clinica_id::text || ':' || v_retorno.paciente_id::text || ':' || p_data::text, 0
  ));

  IF EXISTS (
    SELECT 1 FROM public.agendamentos a
     WHERE a.clinica_id = v_clinica_id AND a.medico_id = v_retorno.medico_id AND a.data = p_data
       AND a.id IS DISTINCT FROM v_retorno.agendamento_retorno_id
       AND a.status IS DISTINCT FROM 'cancelado'::public.status_agendamento
       AND a.status IS DISTINCT FROM 'faltou'::public.status_agendamento
       AND a.hora_inicio < v_fim
       AND COALESCE(a.hora_fim, a.hora_inicio + interval '30 minutes') > p_hora
  ) THEN
    RAISE EXCEPTION 'Este medico ja tem uma consulta neste horario. Escolha outro horario.' USING ERRCODE = '23P01';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agendamentos a
     WHERE a.clinica_id = v_clinica_id AND a.paciente_id = v_retorno.paciente_id AND a.data = p_data
       AND a.id IS DISTINCT FROM v_retorno.agendamento_retorno_id
       AND a.status IS DISTINCT FROM 'cancelado'::public.status_agendamento
       AND a.status IS DISTINCT FROM 'faltou'::public.status_agendamento
       AND a.hora_inicio < v_fim
       AND COALESCE(a.hora_fim, a.hora_inicio + interval '30 minutes') > p_hora
  ) THEN
    RAISE EXCEPTION 'Este paciente ja tem outro atendimento neste horario. Escolha outro horario.' USING ERRCODE = '23P01';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bloqueios_agenda b
     WHERE b.medico_id = v_retorno.medico_id
       AND b.data_inicio <= p_data AND b.data_fim >= p_data
       AND (COALESCE(b.dia_inteiro, true) OR (
         b.hora_inicio IS NOT NULL AND b.hora_fim IS NOT NULL
         AND b.hora_inicio < v_fim AND b.hora_fim > p_hora
       ))
  ) THEN
    RAISE EXCEPTION 'Este horario esta bloqueado para o medico.' USING ERRCODE = '23P01';
  END IF;

  v_dia_semana := extract(dow FROM p_data)::integer;
  SELECT EXISTS (
    SELECT 1 FROM public.medico_disponibilidade d
     WHERE d.medico_id = v_retorno.medico_id AND d.dia_semana = v_dia_semana AND d.ativo = true
       AND p_hora >= d.hora_inicio AND v_fim <= d.hora_fim
  ) INTO v_dentro_expediente;
  IF NOT v_dentro_expediente AND NOT COALESCE(p_confirmou_fora_expediente, false) THEN
    RAISE EXCEPTION 'O horario esta fora do expediente cadastrado. Confirme explicitamente para continuar.' USING ERRCODE = '22023';
  END IF;

  IF v_retorno.agendamento_retorno_id IS NOT NULL THEN
    v_agendamento_id := v_retorno.agendamento_retorno_id;
    SELECT a.status::text INTO v_status_agendamento
      FROM public.agendamentos a
     WHERE a.id = v_agendamento_id
       AND a.clinica_id = v_clinica_id
       AND a.paciente_id = v_retorno.paciente_id
       AND a.medico_id = v_retorno.medico_id
     FOR UPDATE;
    IF NOT FOUND OR v_status_agendamento IS NULL
       OR v_status_agendamento NOT IN ('agendado', 'confirmado', 'aguardando', 'aguardando_triagem') THEN
      RAISE EXCEPTION 'O atendimento ja foi iniciado ou encerrado e nao pode ser remarcado.' USING ERRCODE = '23514';
    END IF;
    UPDATE public.agendamentos
       SET data = p_data, hora_inicio = p_hora, hora_fim = v_fim, status = 'agendado'
     WHERE id = v_agendamento_id
       AND clinica_id = v_clinica_id
       AND paciente_id = v_retorno.paciente_id
       AND medico_id = v_retorno.medico_id
       AND status::text IN ('agendado', 'confirmado', 'aguardando', 'aguardando_triagem');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'O horario vinculado nao foi encontrado na clinica atual.' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    INSERT INTO public.agendamentos (
      paciente_id, medico_id, data, hora_inicio, hora_fim, tipo, observacoes, status, clinica_id
    ) VALUES (
      v_retorno.paciente_id, v_retorno.medico_id, p_data, p_hora, v_fim, 'retorno',
      'Retorno: ' || COALESCE(NULLIF(btrim(v_retorno.motivo), ''), 'Consulta de retorno'), 'agendado', v_clinica_id
    ) RETURNING id INTO v_agendamento_id;
  END IF;

  UPDATE public.retornos
     SET agendamento_retorno_id = v_agendamento_id, data_retorno_prevista = p_data, status = 'agendado'
   WHERE id = v_retorno.id AND clinica_id = v_clinica_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O retorno nao foi atualizado.' USING ERRCODE = '40001';
  END IF;
  RETURN v_agendamento_id;
END;
$$;

REVOKE ALL ON FUNCTION public.agendar_retorno_atomico(uuid, date, time, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agendar_retorno_atomico(uuid, date, time, boolean) TO authenticated;

COMMIT;
