-- The onboarding WhatsApp step is complete only while a session is connected.
-- A disconnected or pending session is configured, but cannot serve patients.
CREATE OR REPLACE FUNCTION public.clinic_onboarding_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinica uuid := public.current_clinica_id();
  v_team_count integer;
  v_clinic_schedule_count integer;
  v_available_doctors_count integer;
  v_service_count integer;
  v_whatsapp_count integer;
  v_appointment_count integer;
  v_completed integer;
  v_is_complete boolean;
  v_completed_at timestamptz;
BEGIN
  IF v_clinica IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso restrito ao administrador da clínica';
  END IF;

  SELECT count(*)::integer INTO v_team_count
  FROM public.profiles p
  WHERE p.clinica_id = v_clinica AND p.ativo AND p.id <> auth.uid();

  SELECT count(*)::integer INTO v_clinic_schedule_count
  FROM public.configuracoes_clinica c
  WHERE c.clinica_id = v_clinica
    AND c.chave = 'config_clinica'
    AND nullif(c.valor ->> 'horarioAbertura', '') IS NOT NULL
    AND nullif(c.valor ->> 'horarioFechamento', '') IS NOT NULL
    AND CASE
      WHEN jsonb_typeof(c.valor -> 'diasFuncionamento') = 'array'
        THEN jsonb_array_length(c.valor -> 'diasFuncionamento') > 0
      ELSE false
    END;

  SELECT count(DISTINCT m.id)::integer INTO v_available_doctors_count
  FROM public.medicos m
  JOIN public.medico_disponibilidade md ON md.medico_id = m.id
  WHERE m.clinica_id = v_clinica
    AND m.ativo
    AND md.ativo IS TRUE
    AND md.dia_semana BETWEEN 0 AND 6
    AND md.duracao_consulta > 0
    AND md.intervalo_consultas >= 0
    AND md.hora_inicio < md.hora_fim
    AND extract(epoch FROM (md.hora_fim - md.hora_inicio)) >= md.duracao_consulta * 60;

  SELECT count(*)::integer INTO v_service_count
  FROM public.tipos_consulta t
  WHERE t.clinica_id = v_clinica AND coalesce(t.ativo, true);

  SELECT count(*)::integer INTO v_whatsapp_count
  FROM public.whatsapp_sessions w
  WHERE w.clinica_id = v_clinica
    AND lower(coalesce(w.status, '')) IN ('connected', 'conectado', 'open');

  SELECT count(*)::integer INTO v_appointment_count
  FROM public.agendamentos a
  WHERE a.clinica_id = v_clinica;

  v_completed := (CASE WHEN v_team_count > 0 THEN 1 ELSE 0 END)
    + (CASE WHEN v_clinic_schedule_count > 0 AND v_available_doctors_count > 0 THEN 1 ELSE 0 END)
    + (CASE WHEN v_service_count > 0 THEN 1 ELSE 0 END)
    + (CASE WHEN v_whatsapp_count > 0 THEN 1 ELSE 0 END)
    + (CASE WHEN v_appointment_count > 0 THEN 1 ELSE 0 END);
  v_is_complete := v_completed = 5;

  INSERT INTO public.clinic_onboarding_state
    (clinica_id, last_opened_at, completed_at, updated_by)
  VALUES
    (v_clinica, now(), CASE WHEN v_is_complete THEN now() END, auth.uid())
  ON CONFLICT (clinica_id) DO UPDATE
    SET last_opened_at = now(),
        completed_at = CASE
          WHEN v_is_complete THEN coalesce(clinic_onboarding_state.completed_at, now())
          ELSE null
        END,
        updated_by = auth.uid()
  RETURNING completed_at INTO v_completed_at;

  RETURN jsonb_build_object(
    'clinica_id', v_clinica,
    'completed_steps', v_completed,
    'total_steps', 5,
    'progress', v_completed * 20,
    'completed_at', v_completed_at,
    'steps', jsonb_build_array(
      jsonb_build_object('key', 'team', 'complete', v_team_count > 0, 'count', v_team_count),
      jsonb_build_object('key', 'schedule', 'complete', v_clinic_schedule_count > 0 AND v_available_doctors_count > 0, 'count', v_available_doctors_count),
      jsonb_build_object('key', 'services', 'complete', v_service_count > 0, 'count', v_service_count),
      jsonb_build_object('key', 'whatsapp', 'complete', v_whatsapp_count > 0, 'count', v_whatsapp_count),
      jsonb_build_object('key', 'appointment', 'complete', v_appointment_count > 0, 'count', v_appointment_count)
    )
  );
END;
$$;
