BEGIN;

-- atualizar_predicoes_no_show() ja calcula o risco e enfileira um lembrete
-- reforcado quando o risco e alto (>= 0.70). Ja estava agendado em producao
-- (job "atualizar-risco-no-show", de hora em hora) sem estar neste repositorio;
-- este arquivo so documenta esse agendamento para fechar a divergencia.
SELECT cron.schedule('atualizar-risco-no-show', '15 * * * *', $$SELECT public.atualizar_predicoes_no_show();$$);

COMMIT;
