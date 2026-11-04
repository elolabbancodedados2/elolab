BEGIN;

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS portal_checkin_status text CHECK (portal_checkin_status IN ('a_caminho', 'chegou')),
  ADD COLUMN IF NOT EXISTS portal_checkin_em timestamptz;

CREATE OR REPLACE FUNCTION public.limpar_chegada_portal_remarcada()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF (NEW.data, NEW.hora_inicio, NEW.paciente_id, NEW.clinica_id) IS DISTINCT FROM
     (OLD.data, OLD.hora_inicio, OLD.paciente_id, OLD.clinica_id) THEN
    NEW.portal_checkin_status := NULL;
    NEW.portal_checkin_em := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS limpar_chegada_portal_remarcada ON public.agendamentos;
CREATE TRIGGER limpar_chegada_portal_remarcada BEFORE UPDATE OF data, hora_inicio, paciente_id, clinica_id
  ON public.agendamentos FOR EACH ROW EXECUTE FUNCTION public.limpar_chegada_portal_remarcada();

CREATE OR REPLACE FUNCTION public.sinalizar_chegada_portal(
  p_clinica_id uuid, p_paciente_id uuid, p_agendamento_id uuid, p_sinal text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_ag public.agendamentos%ROWTYPE; v_inicio timestamptz;
BEGIN
  IF p_sinal IS NULL OR p_sinal NOT IN ('a_caminho', 'chegou') THEN
    RAISE EXCEPTION 'Sinal de chegada inválido' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_ag FROM public.agendamentos WHERE id = p_agendamento_id
    AND paciente_id = p_paciente_id AND clinica_id = p_clinica_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Consulta indisponível.'); END IF;
  v_inicio := (v_ag.data + v_ag.hora_inicio) AT TIME ZONE 'America/Sao_Paulo';
  IF v_ag.data IS DISTINCT FROM (now() AT TIME ZONE 'America/Sao_Paulo')::date
     OR v_inicio IS NULL OR now() < v_inicio - interval '2 hours' OR now() > v_inicio + interval '30 minutes'
     OR v_ag.status::text NOT IN ('agendado', 'confirmado')
     OR EXISTS (SELECT 1 FROM public.fila_atendimento WHERE agendamento_id = v_ag.id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Avise sua chegada na recepção. O check-in online não está disponível para esta consulta.');
  END IF;
  -- Não altera status, fila nem cobrança. Cliques atrasados não desfazem a chegada.
  UPDATE public.agendamentos
    SET portal_checkin_status = CASE WHEN portal_checkin_status = 'chegou' THEN 'chegou' ELSE p_sinal END,
        portal_checkin_em = CASE WHEN portal_checkin_status = 'chegou' THEN portal_checkin_em ELSE now() END
    WHERE id = v_ag.id RETURNING * INTO v_ag;
  RETURN jsonb_build_object('success', true, 'portal_checkin_status', v_ag.portal_checkin_status);
END;
$$;
REVOKE ALL ON FUNCTION public.sinalizar_chegada_portal(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sinalizar_chegada_portal(uuid, uuid, uuid, text) TO service_role;

COMMIT;
