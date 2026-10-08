BEGIN;

CREATE OR REPLACE FUNCTION public.agendar_consulta_online_atomico(
  p_clinica_id uuid,
  p_paciente_id uuid,
  p_medico_id uuid,
  p_data date,
  p_hora_inicio time,
  p_duracao_minutos integer,
  p_observacoes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_fim time;
  v_agendamento_id uuid;
BEGIN
  IF p_clinica_id IS NULL OR p_paciente_id IS NULL OR p_medico_id IS NULL
    OR p_data IS NULL OR p_hora_inicio IS NULL
    OR p_duracao_minutos IS NULL OR p_duracao_minutos < 1 OR p_duracao_minutos > 480 THEN
    RAISE EXCEPTION 'Dados do agendamento inválidos.' USING ERRCODE = '22023';
  END IF;
  IF p_data < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'A data do agendamento não pode estar no passado.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clinicas c
     WHERE c.id = p_clinica_id
       AND NOT COALESCE(c.suspensa, false)
       AND NOT COALESCE(c.arquivada, false)
  ) THEN
    RAISE EXCEPTION 'Clínica indisponível.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.medicos m
     WHERE m.id = p_medico_id AND m.clinica_id = p_clinica_id AND m.ativo
  ) THEN
    RAISE EXCEPTION 'Profissional indisponível para esta clínica.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.pacientes p
     WHERE p.id = p_paciente_id AND p.clinica_id = p_clinica_id
  ) THEN
    RAISE EXCEPTION 'Paciente não encontrado nesta clínica.' USING ERRCODE = '42501';
  END IF;

  v_fim := p_hora_inicio + make_interval(mins => p_duracao_minutos);
  IF v_fim <= p_hora_inicio THEN
    RAISE EXCEPTION 'O agendamento precisa terminar antes da meia-noite.' USING ERRCODE = '22023';
  END IF;

  -- Mesmo paciente em médicos diferentes e mesmo médico com pacientes
  -- diferentes ficam serializados para a mesma clínica e data.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'agendamento-online-medico:' || p_clinica_id::text || ':' || p_medico_id::text || ':' || p_data::text,
    0
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'agendamento-online-paciente:' || p_clinica_id::text || ':' || p_paciente_id::text || ':' || p_data::text,
    0
  ));

  IF EXISTS (
    SELECT 1 FROM public.agendamentos a
     WHERE a.clinica_id = p_clinica_id
       AND a.medico_id = p_medico_id
       AND a.data = p_data
       AND a.status IS DISTINCT FROM 'cancelado'::public.status_agendamento
       AND a.status IS DISTINCT FROM 'faltou'::public.status_agendamento
       AND a.hora_inicio < v_fim
       AND COALESCE(a.hora_fim, a.hora_inicio + interval '30 minutes') > p_hora_inicio
  ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'slot_unavailable',
      'error', 'Este horário acabou de ser ocupado. Escolha outro.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agendamentos a
     WHERE a.clinica_id = p_clinica_id
       AND a.paciente_id = p_paciente_id
       AND a.data = p_data
       AND a.status IS DISTINCT FROM 'cancelado'::public.status_agendamento
       AND a.status IS DISTINCT FROM 'faltou'::public.status_agendamento
       AND a.hora_inicio < v_fim
       AND COALESCE(a.hora_fim, a.hora_inicio + interval '30 minutes') > p_hora_inicio
  ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'booking_unavailable',
      'error', 'Não foi possível reservar esse horário. Escolha outro ou entre em contato com a clínica.');
  END IF;

  INSERT INTO public.agendamentos (
    clinica_id, paciente_id, medico_id, data, hora_inicio, hora_fim,
    tipo, status, observacoes
  ) VALUES (
    p_clinica_id, p_paciente_id, p_medico_id, p_data, p_hora_inicio, v_fim,
    'consulta', 'agendado', p_observacoes
  ) RETURNING id INTO v_agendamento_id;

  RETURN jsonb_build_object('success', true, 'id', v_agendamento_id);
END;
$$;

REVOKE ALL ON FUNCTION public.agendar_consulta_online_atomico(uuid, uuid, uuid, date, time, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agendar_consulta_online_atomico(uuid, uuid, uuid, date, time, integer, text) TO service_role;

COMMENT ON FUNCTION public.agendar_consulta_online_atomico(uuid, uuid, uuid, date, time, integer, text) IS
  'Cria um agendamento online dentro de uma transação, serializando e validando conflitos do médico e do paciente na clínica.';

COMMIT;
