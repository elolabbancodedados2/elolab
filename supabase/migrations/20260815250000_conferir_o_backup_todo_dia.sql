-- ============================================================================
-- A conferência do backup roda sozinha, meia hora depois dele
--
-- O backup diário passou a existir, mas ninguém nunca tinha ABERTO um dos
-- arquivos guardados. Backup que nunca foi conferido é hipótese: se o JSON
-- estiver truncado, com uma tabela vazia por permissão negada, ou apontando
-- para anexos que não estão no bucket, só se descobre no dia em que restaurar
-- é a única saída — e nesse dia não há o que fazer.
--
-- `backup-verificar` abre o arquivo mais recente, compara as contagens tabela a
-- tabela com o banco e confere se cada arquivo do manifesto está mesmo lá.
-- É só leitura.
--
-- 3h30: meia hora depois do backup das 3h, folga suficiente para ele terminar.
--
-- O comando é copiado do agendamento do backup, trocando só a URL: ele carrega
-- os cabeçalhos de autenticação que duas migrations anteriores precisaram
-- acertar, e reescrevê-los aqui seria repetir um problema já resolvido.
-- ============================================================================

BEGIN;

DO $$
DECLARE v_comando text;
BEGIN
  SELECT replace(command, '/auto-backup', '/backup-verificar')
    INTO v_comando FROM cron.job WHERE jobname = 'auto-backup-diario';

  IF v_comando IS NULL THEN
    RAISE EXCEPTION 'auto-backup-diario não existe; a conferência ficaria órfã.';
  END IF;

  PERFORM cron.unschedule('backup-verificar-diario')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'backup-verificar-diario');

  PERFORM cron.schedule('backup-verificar-diario', '30 3 * * *', v_comando);
END $$;

COMMIT;
