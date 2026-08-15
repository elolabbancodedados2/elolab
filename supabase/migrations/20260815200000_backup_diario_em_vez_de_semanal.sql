-- ============================================================================
-- Backup passa a ser diário
--
-- Estava em `0 3 * * 0` — domingo às 3h. Uma clínica que perde o banco numa
-- sexta perde CINCO DIAS de prontuário, pagamento e agenda. Para dado de saúde
-- isso é muito: prontuário não se refaz de memória, e o paciente que fez um
-- exame na quarta não tem como provar que fez.
--
-- Passa para `0 3 * * *`, todo dia às 3h. O custo é armazenamento, e a
-- retenção de 90 dias já limita: 90 arquivos em vez de 13. O JSON atual tem
-- 1,4 MB, então a conta fica em ~130 MB — barato para o que evita.
--
-- O nome do agendamento tinha "weekly" dentro. Manter o nome errado faz quem
-- for investigar daqui a um ano acreditar no nome em vez de olhar o horário.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_comando text;
BEGIN
  SELECT command INTO v_comando FROM cron.job WHERE jobname = 'auto-backup-weekly';

  IF v_comando IS NULL THEN
    RAISE NOTICE 'auto-backup-weekly não existe; nada a fazer.';
    RETURN;
  END IF;

  -- O comando é reaproveitado inteiro: ele carrega os cabeçalhos de
  -- autenticação que as migrations 20260727235000 e 20260729170000 acertaram,
  -- e reescrevê-los aqui seria repetir um problema já resolvido duas vezes.
  PERFORM cron.unschedule('auto-backup-weekly');
  PERFORM cron.schedule('auto-backup-diario', '0 3 * * *', v_comando);
END $$;

COMMIT;
