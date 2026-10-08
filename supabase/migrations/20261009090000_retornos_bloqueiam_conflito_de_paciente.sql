BEGIN;

CREATE OR REPLACE FUNCTION public.agendar_retorno_atomico(
  p_retorno_id uuid,
  p_data date,
  p_hora time
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica_id uuid;
  v_retorno public.retornos%ROWTYPE;
  v_agendamento_id uuid;
  v_fim time;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
  END IF;

  v_clinica_id := public.get_my_clinica_id();
  IF v_clinica_id IS NULL THEN
    RAISE EXCEPTION 'Clínica não identificada.' USING ERRCODE = '42501';
  END IF;
  IF p_data IS NULL OR p_hora IS NULL THEN
    RAISE EXCEPTION 'Informe uma data e um horário válidos.' USING ERRCODE = '22023';
  END IF;
  IF p_data < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'A data do retorno não pode estar no passado.' USING ERRCODE = '22023';
  END IF;

  v_fim := p_hora + interval '30 minutes';
  IF v_fim <= p_hora THEN
    RAISE EXCEPTION 'O horário precisa terminar antes da meia-noite.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_retorno
    FROM public.retornos
   WHERE id = p_retorno_id
     AND clinica_id = v_clinica_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Retorno não encontrado na clínica atual.' USING ERRCODE = 'P0002';
  END IF;
  IF v_retorno.status IN ('realizado', 'cancelado') THEN
    RAISE EXCEPTION 'Este retorno já foi realizado ou cancelado.' USING ERRCODE = '23514';
  END IF;

  -- Serializa conflitos do médico e do paciente, mesmo quando duas recepções
  -- tentam reservar simultaneamente horários com profissionais diferentes.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'retorno-medico:' || v_clinica_id::text || ':' || v_retorno.medico_id::text || ':' || p_data::text,
    0
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'retorno-paciente:' || v_clinica_id::text || ':' || v_retorno.paciente_id::text || ':' || p_data::text,
    0
  ));

  IF EXISTS (
    SELECT 1
      FROM public.agendamentos a
     WHERE a.clinica_id = v_clinica_id
       AND a.medico_id = v_retorno.medico_id
       AND a.data = p_data
       AND a.id IS DISTINCT FROM v_retorno.agendamento_retorno_id
       AND a.status IS DISTINCT FROM 'cancelado'::public.status_agendamento
       AND a.status IS DISTINCT FROM 'faltou'::public.status_agendamento
       AND a.hora_inicio < v_fim
       AND COALESCE(a.hora_fim, a.hora_inicio + interval '30 minutes') > p_hora
  ) THEN
    RAISE EXCEPTION 'Este médico já tem uma consulta neste horário. Escolha outro horário.'
      USING ERRCODE = '23P01';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.agendamentos a
     WHERE a.clinica_id = v_clinica_id
       AND a.paciente_id = v_retorno.paciente_id
       AND a.data = p_data
       AND a.id IS DISTINCT FROM v_retorno.agendamento_retorno_id
       AND a.status IS DISTINCT FROM 'cancelado'::public.status_agendamento
       AND a.status IS DISTINCT FROM 'faltou'::public.status_agendamento
       AND a.hora_inicio < v_fim
       AND COALESCE(a.hora_fim, a.hora_inicio + interval '30 minutes') > p_hora
  ) THEN
    RAISE EXCEPTION 'Este paciente já tem outro atendimento neste horário. Escolha outro horário.'
      USING ERRCODE = '23P01';
  END IF;

  IF v_retorno.agendamento_retorno_id IS NOT NULL THEN
    v_agendamento_id := v_retorno.agendamento_retorno_id;
    UPDATE public.agendamentos
       SET data = p_data,
           hora_inicio = p_hora,
           hora_fim = v_fim,
           status = 'agendado'
     WHERE id = v_agendamento_id
       AND clinica_id = v_clinica_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'O horário vinculado não foi encontrado na clínica atual.' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    INSERT INTO public.agendamentos (
      paciente_id, medico_id, data, hora_inicio, hora_fim, tipo, observacoes, status, clinica_id
    ) VALUES (
      v_retorno.paciente_id,
      v_retorno.medico_id,
      p_data,
      p_hora,
      v_fim,
      'retorno',
      'Retorno: ' || COALESCE(NULLIF(btrim(v_retorno.motivo), ''), 'Consulta de retorno'),
      'agendado',
      v_clinica_id
    ) RETURNING id INTO v_agendamento_id;
  END IF;

  UPDATE public.retornos
     SET agendamento_retorno_id = v_agendamento_id,
         data_retorno_prevista = p_data,
         status = 'agendado'
   WHERE id = v_retorno.id
     AND clinica_id = v_clinica_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O retorno não foi atualizado.' USING ERRCODE = '40001';
  END IF;

  RETURN v_agendamento_id;
END;
$$;

REVOKE ALL ON FUNCTION public.agendar_retorno_atomico(uuid, date, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agendar_retorno_atomico(uuid, date, time) TO authenticated;

COMMENT ON FUNCTION public.agendar_retorno_atomico(uuid, date, time) IS
  'Agenda ou remarca um retorno em transação, validando escopo da clínica e conflitos de horário do médico e do paciente.';

COMMIT;
