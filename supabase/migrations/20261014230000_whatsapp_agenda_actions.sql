BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS motivo_cancelamento text;

CREATE OR REPLACE FUNCTION public.confirmar_acao_agenda_whatsapp(
  p_conversation_id uuid, p_clinica_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_conversation public.whatsapp_conversations%ROWTYPE;
  v_appointment public.agendamentos%ROWTYPE;
  v_pending jsonb;
  v_args jsonb;
  v_action text;
  v_capability text;
  v_habilidades text[];
  v_phone text;
  v_patient_phone text;
  v_phone_count integer;
  v_appointment_id uuid;
  v_doctor_id uuid;
  v_date date;
  v_start time;
  v_end time;
  v_duration integer;
  v_reason text;
  v_message text;
  v_result jsonb;
BEGIN
  SELECT * INTO v_conversation FROM public.whatsapp_conversations
   WHERE id = p_conversation_id FOR UPDATE;
  IF NOT FOUND OR p_clinica_id IS NULL
     OR v_conversation.clinica_id IS DISTINCT FROM p_clinica_id
     OR v_conversation.status IS DISTINCT FROM 'ativo'
     OR v_conversation.responsavel_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Esta conversa não está disponível para ações automáticas.');
  END IF;
  IF v_conversation.acao_pendente IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Não há uma ação aguardando confirmação.');
  END IF;
  v_pending := v_conversation.acao_pendente;
  IF (v_pending->>'expires_at')::timestamptz IS NULL
     OR (v_pending->>'expires_at')::timestamptz <= clock_timestamp() THEN
    UPDATE public.whatsapp_conversations SET acao_pendente = NULL WHERE id = p_conversation_id;
    RETURN jsonb_build_object('success', false, 'message', 'A confirmação expirou. Solicite a operação novamente.');
  END IF;
  v_action := v_pending->>'action';
  v_args := v_pending->'args';
  IF v_action IS NULL OR v_action NOT IN (
    'criar_agendamento', 'cancelar_agendamento', 'reagendar_agendamento', 'confirmar_presenca'
  ) OR jsonb_typeof(v_args) IS DISTINCT FROM 'object' THEN
    RETURN jsonb_build_object('success', false, 'message', 'A ação pendente é inválida.');
  END IF;
  v_capability := CASE WHEN v_action = 'confirmar_presenca'
    THEN 'consultar_agendamentos_paciente' ELSE v_action END;
  SELECT a.habilidades INTO v_habilidades
    FROM public.whatsapp_sessions s JOIN public.whatsapp_agents a ON a.id = s.agent_id
   WHERE s.id = v_conversation.session_id AND s.clinica_id = p_clinica_id
     AND a.clinica_id = p_clinica_id AND a.ativo IS TRUE
   FOR SHARE OF s, a;
  IF NOT FOUND OR NOT COALESCE(v_capability = ANY(v_habilidades), false) THEN
    RETURN jsonb_build_object('success', false, 'message', 'O agente não está autorizado a realizar esta ação.');
  END IF;

  -- Only an unambiguous, exact phone match can authorize patient writes.
  IF v_conversation.remote_jid !~ '^[0-9]+@(s\.whatsapp\.net|c\.us)$' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Não foi possível validar seu cadastro com segurança.');
  END IF;
  v_phone := split_part(v_conversation.remote_jid, '@', 1);
  IF length(v_phone) IN (12, 13) AND left(v_phone, 2) = '55' THEN
    v_phone := substring(v_phone FROM 3);
  END IF;
  IF length(v_phone) NOT IN (10, 11) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Não foi possível validar seu cadastro com segurança.');
  END IF;
  SELECT regexp_replace(COALESCE(p.telefone, ''), '[^0-9]', '', 'g') INTO v_patient_phone
    FROM public.pacientes p
   WHERE p.id = v_conversation.paciente_id AND p.clinica_id = p_clinica_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Não foi possível validar seu cadastro com segurança.');
  END IF;
  IF length(v_patient_phone) IN (12, 13) AND left(v_patient_phone, 2) = '55' THEN
    v_patient_phone := substring(v_patient_phone FROM 3);
  END IF;
  SELECT count(*) INTO v_phone_count FROM public.pacientes p
   WHERE p.clinica_id = p_clinica_id
     AND regexp_replace(COALESCE(p.telefone, ''), '[^0-9]', '', 'g') IN (v_phone, '55' || v_phone);
  IF v_patient_phone IS DISTINCT FROM v_phone OR v_phone_count <> 1 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Não foi possível validar seu cadastro com segurança.');
  END IF;

  IF v_action <> 'criar_agendamento' THEN
    v_appointment_id := (v_args->>'agendamento_id')::uuid;
    SELECT a.* INTO v_appointment FROM public.agendamentos a
     WHERE a.id = v_appointment_id AND a.clinica_id = p_clinica_id
       AND a.paciente_id = v_conversation.paciente_id FOR UPDATE;
    IF NOT FOUND OR v_appointment.status IS NULL
       OR v_appointment.status::text NOT IN ('agendado', 'confirmado')
       OR (v_appointment.data + v_appointment.hora_inicio) <= (clock_timestamp() AT TIME ZONE 'America/Sao_Paulo') THEN
      RETURN jsonb_build_object('success', false, 'message', 'A consulta não está disponível para esta alteração.');
    END IF;
  END IF;

  IF v_action IN ('criar_agendamento', 'reagendar_agendamento') THEN
    v_doctor_id := (v_args->>'medico_id')::uuid;
    IF COALESCE(v_args->>'data', '') !~ '^\d{4}-\d{2}-\d{2}$'
       OR COALESCE(v_args->>'hora_inicio', '') !~ '^([01]\d|2[0-3]):[0-5]\d(:00)?$' THEN
      RETURN jsonb_build_object('success', false, 'message', 'Informe uma data e um horário válidos.');
    END IF;
    v_date := (v_args->>'data')::date;
    v_start := (v_args->>'hora_inicio')::time;
    IF v_date + v_start <= (clock_timestamp() AT TIME ZONE 'America/Sao_Paulo') THEN
      RETURN jsonb_build_object('success', false, 'message', 'Escolha um horário futuro.');
    END IF;
    PERFORM 1 FROM public.medicos m WHERE m.id = v_doctor_id
      AND m.clinica_id = p_clinica_id AND m.ativo IS TRUE FOR SHARE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'message', 'O profissional não está disponível nesta clínica.');
    END IF;
    SELECT d.duracao_consulta INTO v_duration FROM public.medico_disponibilidade d
     WHERE d.medico_id = v_doctor_id AND d.ativo IS TRUE
       AND d.dia_semana = extract(dow FROM v_date)::integer
       AND d.duracao_consulta > 0 AND d.intervalo_consultas >= 0
       AND v_start >= d.hora_inicio
       AND extract(epoch FROM (v_start - d.hora_inicio)) + d.duracao_consulta * 60
           <= extract(epoch FROM (d.hora_fim - d.hora_inicio))
       AND mod(extract(epoch FROM (v_start - d.hora_inicio)),
         (d.duracao_consulta + d.intervalo_consultas) * 60) = 0
     ORDER BY d.hora_inicio, d.id LIMIT 1 FOR SHARE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'message', 'Esse horário não faz parte da agenda disponível do profissional.');
    END IF;
    v_end := v_start + make_interval(mins => v_duration);
    PERFORM pg_advisory_xact_lock(hashtext(v_doctor_id::text), v_date - DATE '2000-01-01');
    IF EXISTS (SELECT 1 FROM public.bloqueios_agenda b
      WHERE b.clinica_id = p_clinica_id AND b.medico_id = v_doctor_id
        AND v_date BETWEEN b.data_inicio AND b.data_fim
        AND (COALESCE(b.dia_inteiro, true) OR (v_start < b.hora_fim AND v_end > b.hora_inicio))) THEN
      RETURN jsonb_build_object('success', false, 'message', 'Esse horário está bloqueado. Escolha outro horário.');
    END IF;
  END IF;

  IF v_action = 'cancelar_agendamento' THEN
    v_reason := nullif(btrim(v_args->>'motivo'), '');
    IF v_reason IS NULL THEN
      RETURN jsonb_build_object('success', false, 'message', 'Informe o motivo do cancelamento.');
    END IF;
    UPDATE public.agendamentos SET status = 'cancelado', motivo_cancelamento = v_reason
     WHERE id = v_appointment_id;
    v_message := 'Sua consulta foi cancelada.';
  ELSIF v_action = 'confirmar_presenca' THEN
    IF v_appointment.status::text <> 'agendado' THEN
      RETURN jsonb_build_object('success', false, 'message', 'A presença nesta consulta já está confirmada.');
    END IF;
    UPDATE public.agendamentos SET status = 'confirmado' WHERE id = v_appointment_id;
    v_message := 'Sua presença na consulta foi confirmada.';
  ELSIF v_action = 'reagendar_agendamento' THEN
    UPDATE public.agendamentos
       SET medico_id = v_doctor_id, data = v_date, hora_inicio = v_start, hora_fim = v_end
     WHERE id = v_appointment_id;
    v_message := 'Sua consulta foi remarcada para ' || to_char(v_date, 'DD/MM/YYYY') || ' às ' || to_char(v_start, 'HH24:MI') || '.';
  ELSE
    INSERT INTO public.agendamentos (clinica_id, paciente_id, medico_id, data, hora_inicio, hora_fim, status, tipo)
    VALUES (p_clinica_id, v_conversation.paciente_id, v_doctor_id, v_date, v_start, v_end, 'agendado', 'consulta')
    RETURNING id INTO v_appointment_id;
    v_message := 'Sua consulta foi agendada para ' || to_char(v_date, 'DD/MM/YYYY') || ' às ' || to_char(v_start, 'HH24:MI') || '.';
  END IF;
  v_result := jsonb_build_object('success', true, 'completed', true, 'agendamento_id', v_appointment_id, 'message', v_message);
  UPDATE public.whatsapp_conversations SET acao_pendente = NULL WHERE id = p_conversation_id;
  INSERT INTO public.whatsapp_agent_actions (clinica_id, conversation_id, tipo_acao, dados_entrada, dados_saida, sucesso)
  VALUES (p_clinica_id, p_conversation_id, v_action, v_args, v_result, true);
  RETURN v_result;
EXCEPTION
  WHEN exclusion_violation THEN
    RETURN jsonb_build_object('success', false, 'message', 'Esse horário está ocupado ou bloqueado. Escolha outro horário.');
  WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
    RETURN jsonb_build_object('success', false, 'message', 'A ação contém dados inválidos. Solicite a operação novamente.');
  WHEN check_violation OR foreign_key_violation THEN
    RETURN jsonb_build_object('success', false, 'message', 'A consulta não está disponível para esta alteração.');
END;
$$;

REVOKE ALL ON FUNCTION public.confirmar_acao_agenda_whatsapp(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_acao_agenda_whatsapp(uuid, uuid) TO service_role;
COMMIT;
