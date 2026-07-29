-- ============================================================================
-- Devolve o cabeçalho Authorization aos agendamentos — eles estavam falhando
--
-- O QUE QUEBROU
-- A migration 20260727235000 trocou o cabeçalho Authorization pelo x-cron-secret,
-- em vez de somar os dois. Sete das nove funções chamadas pelo cron rodam com
-- verify_jwt = true, e nesse modo o gateway do Supabase exige um JWT válido
-- ANTES de entregar a requisição à função. Sem Authorization, ele responde
-- 401 UNAUTHORIZED_NO_AUTH_HEADER e o código da função nunca executa.
--
-- Constatado em net._http_response: 78 respostas 401 nos dois dias seguintes.
-- Passaram despercebidas porque cron.job_run_details marca "succeeded" — o
-- net.http_post é assíncrono e só registra que a chamada foi enfileirada, não
-- o que o servidor respondeu.
--
-- Efeito prático no período: lembretes de consulta, fila de notificações,
-- alertas de estoque, felicitações de aniversário, relatório mensal e cobrança
-- de inadimplência não rodaram.
--
-- A CORREÇÃO
-- Os dois cabeçalhos juntos, cada um com seu papel:
--
--   Authorization: Bearer <chave anon>  — passa pelo gateway (verify_jwt)
--   x-cron-secret: <segredo>            — autentica de verdade, dentro da função
--
-- A chave anon ser pública deixou de importar: ela sozinha não basta mais,
-- porque cronSecretOk confere o segredo antes de executar qualquer coisa. Era
-- esse o objetivo original, e removê-la nunca fez parte dele.
--
-- ⚠️ Substitua os dois marcadores antes de executar:
--   COLE_O_SEGREDO_AQUI  -> o mesmo já usado nos agendamentos. Para descobrir:
--       SELECT substring(command from 'x-cron-secret[^0-9a-f]+([0-9a-f]+)')
--         FROM cron.job WHERE jobname = 'birthday-greetings';
--   COLE_A_CHAVE_ANON    -> VITE_SUPABASE_ANON_KEY (é pública, está no site)
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_secret   text := 'COLE_O_SEGREDO_AQUI';
  v_anon     text := 'COLE_A_CHAVE_ANON';
  v_base_url text := 'https://gebygucrpipaufrlyqqj.supabase.co/functions/v1/';
  j          record;
BEGIN
  IF v_secret = 'COLE_O_SEGREDO_AQUI' OR v_anon = 'COLE_A_CHAVE_ANON' THEN
    RAISE EXCEPTION 'Substitua o segredo e a chave anon antes de executar esta migration.';
  END IF;

  FOR j IN
    SELECT * FROM (VALUES
      ('process-notification-queue',            '*/5 * * * *',  'process-notification-queue'),
      ('send-appointment-reminders',            '0 * * * *',    'send-appointment-reminder'),
      ('stock-alerts',                          '0 8 * * *',    'stock-alert'),
      ('birthday-greetings',                    '0 9 * * *',    'birthday-greetings'),
      ('monthly-report',                        '0 7 1 * *',    'monthly-report-generator'),
      ('payment-reminders',                     '0 8 * * *',    'payment-reminder'),
      ('auto-backup-weekly',                    '0 3 * * 0',    'auto-backup'),
      ('welcome-emails',                        '*/5 * * * *',  'welcome-email'),
      ('reconcile-pending-registrations-daily', '15 3 * * *',   'reconcile-pending-registrations')
    ) AS t(job_name, agenda, funcao)
  LOOP
    PERFORM cron.unschedule(j.job_name)
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = j.job_name);

    PERFORM cron.schedule(
      j.job_name,
      j.agenda,
      format(
        $cmd$SELECT net.http_post(
          url := %L,
          headers := %L::jsonb,
          body := concat('{"time": "', now(), '"}')::jsonb
        );$cmd$,
        v_base_url || j.funcao,
        json_build_object(
          'Content-Type',   'application/json',
          'Authorization',  'Bearer ' || v_anon,
          'x-cron-secret',  v_secret
        )::text
      )
    );
  END LOOP;
END $$;

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
-- -- Todos devem ter os dois cabeçalhos:
-- SELECT jobname,
--        command LIKE '%Authorization%'  AS tem_authorization,
--        command LIKE '%x-cron-secret%'  AS tem_segredo
--   FROM cron.job ORDER BY jobname;
--
-- -- Depois de alguns minutos, as respostas devem voltar a 200.
-- -- (process-notification-queue roda a cada 5 min, é o mais rápido de conferir.)
-- SELECT status_code, count(*), max(created)::timestamp(0) AS ultima
--   FROM net._http_response WHERE created > now() - interval '20 minutes'
--  GROUP BY 1 ORDER BY 1;
