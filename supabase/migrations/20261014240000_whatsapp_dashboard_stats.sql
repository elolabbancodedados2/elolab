BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS whatsapp_messages_clinica_created_stats_idx
  ON public.whatsapp_messages (clinica_id, created_at);
CREATE INDEX IF NOT EXISTS whatsapp_conversations_clinica_created_stats_idx
  ON public.whatsapp_conversations (clinica_id, created_at);
CREATE INDEX IF NOT EXISTS whatsapp_actions_clinica_created_stats_idx
  ON public.whatsapp_agent_actions (clinica_id, created_at);

CREATE OR REPLACE FUNCTION public.whatsapp_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  clinic uuid := public.get_my_clinica_id();
  clinic_day date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  day_start timestamptz;
  day_end timestamptz;
  result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) OR clinic IS NULL THEN
    RAISE EXCEPTION 'Acesso restrito ao administrador da clinica' USING ERRCODE = '42501';
  END IF;
  day_start := clinic_day::timestamp AT TIME ZONE 'America/Sao_Paulo';
  day_end := (clinic_day + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo';

  SELECT jsonb_build_object(
    'messages', (SELECT COUNT(*) FROM public.whatsapp_messages
      WHERE clinica_id = clinic AND created_at >= day_start AND created_at < day_end),
    'conversations', (SELECT COUNT(*) FROM public.whatsapp_conversations
      WHERE clinica_id = clinic AND created_at >= day_start AND created_at < day_end),
    'actions', (SELECT COUNT(*) FROM public.whatsapp_agent_actions
      WHERE clinica_id = clinic AND created_at >= day_start AND created_at < day_end),
    -- Pending confirmation and human handoff can report success, but have no booking ID.
    'ai_bookings', (SELECT COUNT(DISTINCT NULLIF(dados_saida->>'agendamento_id', ''))
      FROM public.whatsapp_agent_actions
      WHERE clinica_id = clinic AND created_at >= day_start AND created_at < day_end
        AND tipo_acao = 'criar_agendamento' AND sucesso IS TRUE),
    'confirmed_today', (SELECT COUNT(*) FROM public.agendamentos
      WHERE clinica_id = clinic AND data = clinic_day AND status = 'confirmado'),
    'no_shows_today', (SELECT COUNT(*) FROM public.agendamentos
      WHERE clinica_id = clinic AND data = clinic_day AND status = 'faltou'),
    'delivery_failures',
      (SELECT COUNT(*) FROM public.whatsapp_messages
        WHERE clinica_id = clinic AND direcao = 'saida' AND status = 'erro'
          AND created_at >= day_start AND created_at < day_end)
      + (SELECT COUNT(*) FROM public.notification_queue
        WHERE clinica_id = clinic AND tipo = 'whatsapp' AND status = 'erro'
          AND COALESCE(ultimo_erro_em, created_at) >= day_start
          AND COALESCE(ultimo_erro_em, created_at) < day_end)
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_dashboard_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.whatsapp_dashboard_stats() TO authenticated;
COMMIT;
