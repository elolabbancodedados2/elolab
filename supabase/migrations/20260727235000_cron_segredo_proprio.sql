-- ============================================================================
-- Rotinas automáticas deixam de ser disparáveis por qualquer pessoa
--
-- Os 8 agendamentos do pg_cron chamam as edge functions passando a chave `anon`
-- no cabeçalho Authorization. Essa chave é pública por natureza — está no
-- JavaScript do site. Como as funções aceitam qualquer JWT válido do projeto,
-- qualquer visitante consegue disparar à vontade:
--   - reenviar felicitações de aniversário e lembretes por WhatsApp/e-mail
--   - forçar a fila de notificações
--   - disparar cobranças de inadimplência
-- Não vaza dado, mas queima a reputação do domínio e consome a cota do Brevo
-- e da Evolution API.
--
-- Correção: o cron passa a enviar um cabeçalho x-cron-secret com um segredo
-- privado, que cada função confere antes de executar.
--
-- ⚠️ PASSO MANUAL OBRIGATÓRIO ANTES DE RODAR ESTE ARQUIVO
--
-- 1. Gere um segredo:      SELECT encode(gen_random_bytes(32), 'hex');
-- 2. Guarde-o nos secrets das edge functions, com o nome CRON_SECRET:
--       supabase secrets set CRON_SECRET='<valor gerado>'
--    (ou no painel: Edge Functions -> Secrets)
-- 3. Substitua COLE_O_SEGREDO_AQUI abaixo pelo mesmo valor e execute.
--
-- Enquanto o passo 2 não for feito, as funções continuam funcionando: elas só
-- exigem o cabeçalho quando CRON_SECRET está configurado (falha aberta).
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_secret   text := 'COLE_O_SEGREDO_AQUI';
  v_base_url text := 'https://gebygucrpipaufrlyqqj.supabase.co/functions/v1/';
  j          record;
BEGIN
  IF v_secret = 'COLE_O_SEGREDO_AQUI' THEN
    RAISE EXCEPTION
      'Gere um segredo e substitua COLE_O_SEGREDO_AQUI antes de executar esta migration.';
  END IF;

  FOR j IN
    SELECT * FROM (VALUES
      ('process-notification-queue',  '*/5 * * * *', 'process-notification-queue'),
      ('send-appointment-reminders',  '0 * * * *',   'send-appointment-reminder'),
      ('stock-alerts',                '0 8 * * *',   'stock-alert'),
      ('birthday-greetings',          '0 9 * * *',   'birthday-greetings'),
      ('monthly-report',              '0 7 1 * *',   'monthly-report-generator'),
      ('payment-reminders',           '0 8 * * *',   'payment-reminder')
    ) AS t(job_name, agenda, funcao)
  LOOP
    -- Remove o agendamento antigo (que carregava a chave anon)
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
          'Content-Type', 'application/json',
          'x-cron-secret', v_secret
        )::text
      )
    );
  END LOOP;
END $$;

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
-- -- Confirme que nenhum agendamento ainda carrega a chave anon ("eyJ..."):
-- SELECT jobname, schedule, command LIKE '%eyJ%' AS ainda_usa_chave_publica
--   FROM cron.job ORDER BY jobname;
--
-- -- Últimas execuções:
-- SELECT jobid, status, return_message, start_time
--   FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
