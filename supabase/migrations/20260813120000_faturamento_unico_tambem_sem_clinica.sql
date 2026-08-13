-- ============================================================================
-- Fecha o buraco do índice anti-duplicidade quando a clínica é nula
--
-- A migration 20260812130000 criou:
--
--   CREATE UNIQUE INDEX lancamentos_um_por_agendamento
--     ON lancamentos (clinica_id, agendamento_id)
--    WHERE agendamento_id IS NOT NULL;
--
-- Só que `clinica_id` é anulável, e no Postgres NULL nunca é igual a NULL num
-- índice único. Dois lançamentos do MESMO agendamento com `clinica_id IS NULL`
-- passam pelo índice sem conflito — exatamente a duplicidade que ele deveria
-- impedir. E `createAutoBilling()` grava `resolvedClinicaId`, que é `null`
-- quando o perfil ainda não tem clínica resolvida.
--
-- Em vez de exigir backfill e NOT NULL agora (que quebraria qualquer fluxo
-- legado que ainda grava sem clínica), acrescentamos um segundo índice parcial
-- cobrindo justamente o caso nulo. Os dois juntos garantem: um lançamento por
-- agendamento, com clínica ou sem.
--
-- O caminho definitivo continua sendo tornar `clinica_id` obrigatório; quando
-- isso acontecer, este índice pode ser removido.
-- ============================================================================

BEGIN;

-- ─── Diagnóstico ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_duplicados integer;
BEGIN
  SELECT count(*) INTO v_duplicados
  FROM (
    SELECT agendamento_id
      FROM public.lancamentos
     WHERE agendamento_id IS NOT NULL
       AND clinica_id IS NULL
     GROUP BY agendamento_id
    HAVING count(*) > 1
  ) AS d;

  IF v_duplicados > 0 THEN
    RAISE EXCEPTION
      'Existem % agendamento(s) com mais de um lançamento SEM clínica. Resolva antes — use a consulta do rodapé.',
      v_duplicados;
  END IF;
END $$;

DROP INDEX IF EXISTS public.lancamentos_um_por_agendamento_sem_clinica;

CREATE UNIQUE INDEX lancamentos_um_por_agendamento_sem_clinica
  ON public.lancamentos (agendamento_id)
  WHERE agendamento_id IS NOT NULL AND clinica_id IS NULL;

COMMENT ON INDEX public.lancamentos_um_por_agendamento_sem_clinica IS
  'Complementa lancamentos_um_por_agendamento. Aquele índice inclui clinica_id, e NULL não conflita com NULL — sem este, duas cobranças órfãs do mesmo agendamento passariam.';

COMMIT;

-- ============================================================================
-- SE FALHAR POR DUPLICIDADE PRÉ-EXISTENTE
-- ============================================================================
-- SELECT l.agendamento_id, count(*) AS qtd,
--        array_agg(l.id ORDER BY l.created_at)     AS lancamentos,
--        array_agg(l.status ORDER BY l.created_at) AS status,
--        array_agg(l.valor ORDER BY l.created_at)  AS valores,
--        a.data AS data_consulta
--   FROM public.lancamentos l
--   LEFT JOIN public.agendamentos a ON a.id = l.agendamento_id
--  WHERE l.agendamento_id IS NOT NULL AND l.clinica_id IS NULL
--  GROUP BY l.agendamento_id, a.data
-- HAVING count(*) > 1
--  ORDER BY a.data DESC;
