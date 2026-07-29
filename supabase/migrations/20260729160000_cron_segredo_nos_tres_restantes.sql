-- ============================================================================
-- Completa a proteção do cron: os três jobs que ficaram de fora
--
-- A migration 20260727235000 protegeu seis agendamentos, mas outros três
-- continuaram chamando as edge functions com a chave `anon` no Authorization —
-- chave pública, que está no JavaScript do site:
--
--   auto-backup-weekly                     -> auto-backup
--   welcome-emails                         -> welcome-email
--   reconcile-pending-registrations-daily  -> reconcile-pending-registrations
--
-- Qualquer visitante conseguia forçar backups e disparar e-mails de
-- boas-vindas em massa em nome da clínica.
--
-- O guarda cronSecretOk foi adicionado às três funções no mesmo commit desta
-- migration. Ele falha aberto enquanto CRON_SECRET não estiver configurado nos
-- secrets, então aplicar isto antes do deploy não derruba nada.
--
-- ⚠️ Troque COLE_O_SEGREDO_AQUI pelo MESMO valor usado na migration
-- 20260727235000 — o que já está nos outros seis agendamentos. Para conferir
-- qual é, sem precisar procurar:
--
--   SELECT substring(command from 'x-cron-secret[^0-9a-f]+([0-9a-f]+)')
--     FROM cron.job WHERE jobname = 'birthday-greetings';
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
      'Pegue o segredo já em uso nos outros jobs e substitua COLE_O_SEGREDO_AQUI antes de executar.';
  END IF;

  FOR j IN
    SELECT * FROM (VALUES
      ('auto-backup-weekly',                    '0 3 * * 0',  'auto-backup'),
      ('welcome-emails',                        '*/5 * * * *', 'welcome-email'),
      ('reconcile-pending-registrations-daily', '15 3 * * *', 'reconcile-pending-registrations')
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
-- -- Nenhum agendamento deve mais carregar a chave pública ("eyJ..."):
-- SELECT jobname, command LIKE '%eyJ%' AS ainda_usa_chave_publica
--   FROM cron.job ORDER BY jobname;
