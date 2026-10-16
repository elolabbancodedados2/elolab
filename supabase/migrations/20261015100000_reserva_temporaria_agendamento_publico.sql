BEGIN;

CREATE TABLE public.public_booking_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  medico_id uuid NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  data date NOT NULL,
  hora_inicio time NOT NULL,
  hora_fim time NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (hora_fim > hora_inicio)
);

CREATE INDEX public_booking_holds_slot_expiry_idx
  ON public.public_booking_holds (clinica_id, medico_id, data, expires_at);
CREATE INDEX public_booking_holds_expiry_idx
  ON public.public_booking_holds (expires_at);

ALTER TABLE public.public_booking_holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.public_booking_holds FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.public_booking_holds TO service_role;

CREATE OR REPLACE FUNCTION public.reservar_horario_publico_atomico(
  p_clinica_id uuid,
  p_medico_id uuid,
  p_data date,
  p_hora_inicio time,
  p_duracao_minutos integer,
  p_token_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_fim time;
  v_expira timestamptz;
  v_ja_existente public.public_booking_holds%ROWTYPE;
BEGIN
  IF p_clinica_id IS NULL OR p_medico_id IS NULL OR p_data IS NULL OR p_hora_inicio IS NULL
     OR p_duracao_minutos IS NULL OR p_duracao_minutos < 1 OR p_duracao_minutos > 480
     OR p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Dados da reserva inválidos.' USING ERRCODE = '22023';
  END IF;
  IF p_data < (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'A data da reserva não pode estar no passado.' USING ERRCODE = '22023';
  END IF;
  v_fim := p_hora_inicio + pg_catalog.make_interval(mins => p_duracao_minutos);
  IF v_fim <= p_hora_inicio THEN
    RAISE EXCEPTION 'O agendamento precisa terminar antes da meia-noite.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clinicas c WHERE c.id = p_clinica_id
      AND NOT COALESCE(c.suspensa, false) AND NOT COALESCE(c.arquivada, false)
  ) OR NOT EXISTS (
    SELECT 1 FROM public.medicos m WHERE m.id = p_medico_id AND m.clinica_id = p_clinica_id AND m.ativo
  ) THEN
    RAISE EXCEPTION 'Horário indisponível.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'agendamento-online-medico:' || p_clinica_id::text || ':' || p_medico_id::text || ':' || p_data::text, 0
  ));

  SELECT * INTO v_ja_existente FROM public.public_booking_holds h
   WHERE h.token_hash = p_token_hash FOR UPDATE;
  IF FOUND AND v_ja_existente.expires_at > pg_catalog.now()
     AND v_ja_existente.clinica_id = p_clinica_id AND v_ja_existente.medico_id = p_medico_id
     AND v_ja_existente.data = p_data AND v_ja_existente.hora_inicio = p_hora_inicio
     AND v_ja_existente.hora_fim = v_fim THEN
    RETURN pg_catalog.jsonb_build_object('success', true, 'expires_at', v_ja_existente.expires_at);
  ELSIF FOUND AND v_ja_existente.clinica_id <> p_clinica_id THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'code', 'slot_unavailable');
  ELSIF FOUND THEN
    DELETE FROM public.public_booking_holds WHERE id = v_ja_existente.id;
  END IF;

  WITH expired AS (
    SELECT h.id FROM public.public_booking_holds h
     WHERE h.expires_at < pg_catalog.now() - interval '1 day'
     ORDER BY h.expires_at
     LIMIT 250
     FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.public_booking_holds h USING expired e WHERE h.id = e.id;

  IF EXISTS (
    SELECT 1 FROM public.agendamentos a
     WHERE a.clinica_id = p_clinica_id AND a.medico_id = p_medico_id AND a.data = p_data
       AND a.status IS DISTINCT FROM 'cancelado'::public.status_agendamento
       AND a.status IS DISTINCT FROM 'faltou'::public.status_agendamento
       AND a.hora_inicio < v_fim
       AND COALESCE(a.hora_fim, a.hora_inicio + interval '30 minutes') > p_hora_inicio
  ) OR EXISTS (
    SELECT 1 FROM public.public_booking_holds h
     WHERE h.clinica_id = p_clinica_id AND h.medico_id = p_medico_id AND h.data = p_data
       AND h.expires_at > pg_catalog.now() AND h.hora_inicio < v_fim AND h.hora_fim > p_hora_inicio
  ) THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'code', 'slot_unavailable');
  END IF;

  v_expira := pg_catalog.now() + interval '5 minutes';
  INSERT INTO public.public_booking_holds (clinica_id, medico_id, data, hora_inicio, hora_fim, token_hash, expires_at)
  VALUES (p_clinica_id, p_medico_id, p_data, p_hora_inicio, v_fim, p_token_hash, v_expira);
  RETURN pg_catalog.jsonb_build_object('success', true, 'expires_at', v_expira);
END;
$$;

REVOKE ALL ON FUNCTION public.reservar_horario_publico_atomico(uuid, uuid, date, time, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_horario_publico_atomico(uuid, uuid, date, time, integer, text) TO service_role;

CREATE OR REPLACE FUNCTION public.agendar_consulta_online_atomico(
  p_clinica_id uuid, p_paciente_id uuid, p_medico_id uuid, p_data date,
  p_hora_inicio time, p_duracao_minutos integer, p_observacoes text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'success', false,
    'code', 'hold_required',
    'error', 'Selecione novamente o horário para confirmar a reserva.'
  );
$$;
REVOKE ALL ON FUNCTION public.agendar_consulta_online_atomico(uuid, uuid, uuid, date, time, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agendar_consulta_online_atomico(uuid, uuid, uuid, date, time, integer, text) TO service_role;

CREATE FUNCTION public.agendar_consulta_online_atomico(
  p_clinica_id uuid,
  p_paciente_id uuid,
  p_medico_id uuid,
  p_data date,
  p_hora_inicio time,
  p_duracao_minutos integer,
  p_observacoes text,
  p_hold_token_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_fim time;
  v_agendamento_id uuid;
  v_hold public.public_booking_holds%ROWTYPE;
BEGIN
  IF p_clinica_id IS NULL OR p_paciente_id IS NULL OR p_medico_id IS NULL
    OR p_data IS NULL OR p_hora_inicio IS NULL OR p_duracao_minutos IS NULL
    OR p_duracao_minutos < 1 OR p_duracao_minutos > 480
    OR p_hold_token_hash IS NULL OR p_hold_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Dados do agendamento inválidos.' USING ERRCODE = '22023';
  END IF;
  IF p_data < (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'A data do agendamento não pode estar no passado.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clinicas c WHERE c.id = p_clinica_id
      AND NOT COALESCE(c.suspensa, false) AND NOT COALESCE(c.arquivada, false)
  ) OR NOT EXISTS (
    SELECT 1 FROM public.medicos m WHERE m.id = p_medico_id AND m.clinica_id = p_clinica_id AND m.ativo
  ) OR NOT EXISTS (
    SELECT 1 FROM public.pacientes p WHERE p.id = p_paciente_id AND p.clinica_id = p_clinica_id
  ) THEN
    RAISE EXCEPTION 'Agendamento indisponível para esta clínica.' USING ERRCODE = '42501';
  END IF;

  v_fim := p_hora_inicio + pg_catalog.make_interval(mins => p_duracao_minutos);
  IF v_fim <= p_hora_inicio THEN
    RAISE EXCEPTION 'O agendamento precisa terminar antes da meia-noite.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'agendamento-online-medico:' || p_clinica_id::text || ':' || p_medico_id::text || ':' || p_data::text, 0
  ));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'agendamento-online-paciente:' || p_clinica_id::text || ':' || p_paciente_id::text || ':' || p_data::text, 0
  ));

  SELECT * INTO v_hold FROM public.public_booking_holds h
   WHERE h.token_hash = p_hold_token_hash AND h.clinica_id = p_clinica_id
     AND h.medico_id = p_medico_id AND h.data = p_data
     AND h.hora_inicio = p_hora_inicio AND h.hora_fim = v_fim
     AND h.expires_at > pg_catalog.now()
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'code', 'hold_expired',
      'error', 'Sua reserva expirou. Escolha o horário novamente.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agendamentos a WHERE a.clinica_id = p_clinica_id
      AND a.medico_id = p_medico_id AND a.data = p_data
      AND a.status IS DISTINCT FROM 'cancelado'::public.status_agendamento
      AND a.status IS DISTINCT FROM 'faltou'::public.status_agendamento
      AND a.hora_inicio < v_fim
      AND COALESCE(a.hora_fim, a.hora_inicio + interval '30 minutes') > p_hora_inicio
  ) THEN
    DELETE FROM public.public_booking_holds WHERE id = v_hold.id;
    RETURN pg_catalog.jsonb_build_object('success', false, 'code', 'slot_unavailable',
      'error', 'Este horário acabou de ser ocupado. Escolha outro.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agendamentos a WHERE a.clinica_id = p_clinica_id
      AND a.paciente_id = p_paciente_id AND a.data = p_data
      AND a.status IS DISTINCT FROM 'cancelado'::public.status_agendamento
      AND a.status IS DISTINCT FROM 'faltou'::public.status_agendamento
      AND a.hora_inicio < v_fim
      AND COALESCE(a.hora_fim, a.hora_inicio + interval '30 minutes') > p_hora_inicio
  ) THEN
    DELETE FROM public.public_booking_holds WHERE id = v_hold.id;
    RETURN pg_catalog.jsonb_build_object('success', false, 'code', 'booking_unavailable',
      'error', 'Não foi possível reservar esse horário. Escolha outro ou entre em contato com a clínica.');
  END IF;

  INSERT INTO public.agendamentos (
    clinica_id, paciente_id, medico_id, data, hora_inicio, hora_fim, tipo, status, observacoes
  ) VALUES (
    p_clinica_id, p_paciente_id, p_medico_id, p_data, p_hora_inicio, v_fim,
    'consulta', 'agendado', p_observacoes
  ) RETURNING id INTO v_agendamento_id;

  DELETE FROM public.public_booking_holds WHERE id = v_hold.id;
  RETURN pg_catalog.jsonb_build_object('success', true, 'id', v_agendamento_id);
END;
$$;

REVOKE ALL ON FUNCTION public.agendar_consulta_online_atomico(uuid, uuid, uuid, date, time, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agendar_consulta_online_atomico(uuid, uuid, uuid, date, time, integer, text, text) TO service_role;

COMMENT ON TABLE public.public_booking_holds IS
  'Reservas temporárias de horários do agendamento público; tokens são armazenados apenas como hash e expiram em cinco minutos.';

COMMIT;
