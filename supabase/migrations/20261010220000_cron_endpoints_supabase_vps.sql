-- Redireciona os crons de Edge Functions do projeto Supabase antigo para a
-- API self-hosted na VPS. Mantem agendas, bodies e cabecalhos (inclusive
-- Authorization e x-cron-secret) exatamente como estao.
--
-- As migrations historicas ficam intactas; esta migration corrige os jobs ja
-- criados no banco e tambem os jobs de uma instalacao nova.
BEGIN;

DO $migration$
DECLARE
  v_url_antiga constant text :=
    'https://gebygucrpipaufrlyqqj.supabase.co/functions/v1/';
  v_url_vps constant text :=
    'https://api.elolab.com.br/functions/v1/';
  v_job record;
  v_atualizados integer := 0;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE EXCEPTION 'pg_cron nao esta instalado; nao foi possivel migrar os endpoints.';
  END IF;

  FOR v_job IN
    SELECT jobid, command
      FROM cron.job
     WHERE strpos(command, v_url_antiga) > 0
  LOOP
    PERFORM cron.alter_job(
      v_job.jobid,
      command := replace(v_job.command, v_url_antiga, v_url_vps)
    );
    v_atualizados := v_atualizados + 1;
  END LOOP;

  RAISE NOTICE 'Endpoints de cron atualizados para a VPS: %', v_atualizados;
END;
$migration$;

COMMIT;
