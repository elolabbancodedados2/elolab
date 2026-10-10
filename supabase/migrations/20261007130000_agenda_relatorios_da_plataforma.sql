-- Instala a execução horária dos relatórios agendados da plataforma.
-- Reutiliza o comando já configurado para monthly-report para preservar os
-- cabeçalhos de autenticação e o segredo de cron que o projeto usa no banco.
DO $$
DECLARE
  v_command text;
BEGIN
  SELECT command
    INTO v_command
    FROM cron.job
   WHERE jobname = 'monthly-report'
   LIMIT 1;

  IF v_command IS NULL THEN
    RAISE EXCEPTION 'O job monthly-report não foi encontrado; configure o cron antes dos relatórios agendados da plataforma.';
  END IF;

  IF position('/monthly-report-generator' IN v_command) = 0 THEN
    RAISE EXCEPTION 'O comando do job monthly-report não contém o endpoint esperado; revise a configuração antes de instalar os relatórios da plataforma.';
  END IF;

  v_command := replace(v_command, '/monthly-report-generator', '/platform-reports-runner');

  PERFORM cron.unschedule('platform-reports-runner')
   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'platform-reports-runner');

  PERFORM cron.schedule('platform-reports-runner', '0 * * * *', v_command);
END;
$$;
