-- ============================================================================
-- Vigia: atendimento não pode ficar "em atendimento" por mais de 24 horas
--
-- Em 17/08 a produção tem 13 agendamentos parados em `em_atendimento`, o mais
-- antigo desde 15/03/2026 — cinco meses. Cada um bloqueia a sala do médico
-- na visão do painel, faz o consultório parecer ocupado, e o dinheiro nunca
-- entra (finalização é que gera cobrança).
--
-- A PR #31 já abriu tela na Recepção com dois botões, "Foi atendido" e "Não
-- foi", mas ninguém usou nos 5 meses de dado. Uma trava manual que não é
-- clicada não resolve.
--
-- ─── O QUE ESTA MIGRATION FAZ ────────────────────────────────────────────
--
-- 1. `fn_watchdog_atendimento_travado()`: rotina que muda para `cancelado`
--    todo agendamento em `em_atendimento` há mais de 24h. Registra a
--    mudança em `observacoes` com carimbo do horário, para que o dono da
--    clínica saiba que foi automático.
--
-- 2. Cron `pg_cron` de hora em hora executando a rotina.
--
-- ─── POR QUE 24 HORAS ────────────────────────────────────────────────────
--
-- Consulta legítima que estoura o horário e vai pra madrugada continua no
-- estado. Consulta de dia inteiro, com procedimento longo, ainda dentro de
-- 24h. Passou disso, ou o profissional esqueceu de finalizar, ou a
-- recepção nunca vai voltar naquele agendamento. Um dia é limite gentil.
--
-- ─── EFEITOS COLATERAIS QUE FORAM PENSADOS ───────────────────────────────
--
-- - Se o profissional estava lá e esqueceu, `cancelado` reabre o slot na
--   agenda e o registro fica com a mensagem "cancelado automaticamente".
--   Melhor que ficar em falso "em atendimento".
--
-- - Se a cobrança tinha sido lançada, `lancamentos` continua como está —
--   um cancelamento de agendamento não estorna cobrança. Recepção decide
--   estornar ou não pelo caminho normal.
--
-- - `fila_atendimento` recebe DELETE via cascade no agendamento? Não, a
--   FK é ON DELETE SET NULL. A fila fica órfã, e o próprio fluxo já
--   remove quando o técnico limpa. Isso não muda com esta migration.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.watchdog_atendimento_travado()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_afetados integer;
BEGIN
  UPDATE public.agendamentos
     SET status = 'cancelado',
         observacoes = COALESCE(observacoes || E'\n\n', '') ||
           '[SISTEMA ' || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') ||
           '] Cancelado automaticamente: ficou mais de 24h em atendimento sem finalização.',
         updated_at = now()
   WHERE status = 'em_atendimento'
     AND updated_at < now() - interval '24 hours';

  GET DIAGNOSTICS v_afetados = ROW_COUNT;

  IF v_afetados > 0 THEN
    RAISE NOTICE '[watchdog_atendimento_travado] % agendamento(s) cancelado(s) por passar de 24h em atendimento', v_afetados;
  END IF;

  RETURN v_afetados;
END;
$$;

COMMENT ON FUNCTION public.watchdog_atendimento_travado() IS
  'Cancela agendamentos em em_atendimento há mais de 24h. Roda pelo cron a cada hora.';

REVOKE ALL ON FUNCTION public.watchdog_atendimento_travado() FROM PUBLIC;

-- ─── Agendamento no pg_cron ────────────────────────────────────────────────
-- `pg_cron` já é usado pelo sistema (o crontab tem outras entradas). Se por
-- algum motivo a extensão não estiver, este bloco falha claro.
SELECT cron.unschedule('watchdog-atendimento-travado')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'watchdog-atendimento-travado');

SELECT cron.schedule(
  'watchdog-atendimento-travado',
  '17 * * * *',  -- 17 minutos após cada hora, para não bater com outros crons
  $$SELECT public.watchdog_atendimento_travado();$$
);

COMMIT;

-- ============================================================================
-- CONFERIR DEPOIS DE APLICAR
-- ============================================================================
-- Ver os 13 travados de hoje e o que aconteceria:
--
--   SELECT id, data, status, updated_at, now() - updated_at AS parado_ha
--     FROM agendamentos
--    WHERE status = 'em_atendimento'
--      AND updated_at < now() - interval '24 hours'
--    ORDER BY updated_at;
--
-- Executar manualmente sem esperar o cron:
--
--   SELECT public.watchdog_atendimento_travado();
--
-- Desligar:
--
--   SELECT cron.unschedule('watchdog-atendimento-travado');
