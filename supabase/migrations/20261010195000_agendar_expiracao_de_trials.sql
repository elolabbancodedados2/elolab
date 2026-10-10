-- Encerra trials vencidos em background sem alterar assinaturas ativas.
-- expire_trials() só seleciona status='trial' e em_trial=true.
DO $migration$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid
    INTO v_job_id
    FROM cron.job
   WHERE jobname = 'expire-platform-trials'
   LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'expire-platform-trials',
    '*/15 * * * *',
    'SELECT public.expire_trials();'
  );
END;
$migration$;
