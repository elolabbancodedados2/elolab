ALTER TABLE public.notification_queue
  ADD COLUMN IF NOT EXISTS iniciado_em timestamptz,
  ADD COLUMN IF NOT EXISTS ultimo_erro_em timestamptz;

CREATE INDEX IF NOT EXISTS idx_notification_queue_em_processamento
  ON public.notification_queue (iniciado_em) WHERE status = 'enviando';

CREATE OR REPLACE FUNCTION public.reivindicar_notificacoes(p_limite integer DEFAULT 50, p_clinica_id uuid DEFAULT NULL)
RETURNS SETOF public.notification_queue
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.notification_queue
     SET status = CASE WHEN tentativas >= max_tentativas THEN 'erro' ELSE 'pendente' END,
         agendado_para = CASE WHEN tentativas >= max_tentativas THEN agendado_para ELSE now() END,
         erro_mensagem = 'Processamento anterior interrompido; item recuperado automaticamente',
         ultimo_erro_em = now(), iniciado_em = NULL
   WHERE status = 'enviando' AND iniciado_em < now() - interval '10 minutes'
     AND (p_clinica_id IS NULL OR clinica_id = p_clinica_id);

  RETURN QUERY
  WITH candidatas AS (
    SELECT q.id FROM public.notification_queue q
     WHERE q.status = 'pendente' AND q.agendado_para <= now()
       AND q.tentativas < q.max_tentativas
       AND (p_clinica_id IS NULL OR q.clinica_id = p_clinica_id)
     ORDER BY q.agendado_para, q.created_at FOR UPDATE SKIP LOCKED
     LIMIT LEAST(GREATEST(COALESCE(p_limite, 50), 1), 100)
  )
  UPDATE public.notification_queue q
     SET status = 'enviando', tentativas = q.tentativas + 1, iniciado_em = now()
    FROM candidatas c WHERE q.id = c.id RETURNING q.*;
END;
$$;

REVOKE ALL ON FUNCTION public.reivindicar_notificacoes(integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reivindicar_notificacoes(integer, uuid) TO service_role;
