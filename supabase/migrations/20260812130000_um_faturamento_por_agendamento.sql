-- ============================================================================
-- Um agendamento não pode gerar duas cobranças
--
-- `createAutoBilling` consulta se já existe lançamento para o agendamento e,
-- se não houver, insere:
--
--   SELECT id FROM lancamentos WHERE agendamento_id = ... LIMIT 1
--   -- se vazio:
--   INSERT INTO lancamentos (...)
--
-- São duas idas ao banco. Duas recepcionistas fazendo check-in ao mesmo tempo,
-- duas abas abertas, ou check-in e finalização quase simultâneos: as duas
-- consultas respondem "não existe" e as duas inserem. O paciente é cobrado em
-- duplicidade e alguém precisa estornar na frente dele.
--
-- A agenda já foi protegida assim contra dupla marcação (migration
-- 20260728140000, constraint EXCLUDE). O faturamento tinha ficado de fora.
--
-- Índice PARCIAL porque a maioria dos lançamentos não vem de agendamento
-- (despesas, vendas de balcão, sangrias) e todos têm agendamento_id nulo —
-- nulos não conflitam entre si, mas o índice parcial deixa isso explícito e
-- fica menor.
--
-- Estornados e cancelados continuam ocupando o lugar de propósito: se a
-- cobrança foi estornada, a certa é reabrir aquele lançamento, não criar outro
-- em paralelo e perder o rastro do estorno.
-- ============================================================================

BEGIN;

-- ─── Diagnóstico: já existe duplicidade? ────────────────────────────────────
-- O índice não pode ser criado com duplicatas na base. Em vez de falhar com
-- erro obscuro, avisamos com clareza e mostramos como listá-las.
DO $$
DECLARE
  v_duplicados integer;
BEGIN
  SELECT count(*) INTO v_duplicados
  FROM (
    SELECT agendamento_id
      FROM public.lancamentos
     WHERE agendamento_id IS NOT NULL
     GROUP BY clinica_id, agendamento_id
    HAVING count(*) > 1
  ) AS d;

  IF v_duplicados > 0 THEN
    RAISE EXCEPTION
      'Existem % agendamento(s) com mais de um lançamento. Resolva antes de aplicar este índice — use a consulta do rodapé deste arquivo.',
      v_duplicados;
  END IF;
END $$;

-- ─── O índice ───────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS public.lancamentos_um_por_agendamento;

CREATE UNIQUE INDEX lancamentos_um_por_agendamento
  ON public.lancamentos (clinica_id, agendamento_id)
  WHERE agendamento_id IS NOT NULL;

COMMENT ON INDEX public.lancamentos_um_por_agendamento IS
  'Impede duas cobranças para o mesmo agendamento. A checagem do app roda no navegador em duas etapas e não protege contra dois atendentes fazendo check-in ao mesmo tempo.';

COMMIT;

-- ============================================================================
-- SE A MIGRATION FALHAR POR DUPLICIDADE PRÉ-EXISTENTE
-- ============================================================================
-- Liste os casos e decida qual lançamento fica (normalmente o mais antigo, ou
-- o que já foi pago):
--
-- SELECT l.agendamento_id, l.clinica_id, count(*) AS qtd,
--        array_agg(l.id ORDER BY l.created_at) AS lancamentos,
--        array_agg(l.status ORDER BY l.created_at) AS status,
--        array_agg(l.valor ORDER BY l.created_at) AS valores,
--        p.nome AS paciente, a.data AS data_consulta
--   FROM public.lancamentos l
--   LEFT JOIN public.agendamentos a ON a.id = l.agendamento_id
--   LEFT JOIN public.pacientes   p ON p.id = l.paciente_id
--  WHERE l.agendamento_id IS NOT NULL
--  GROUP BY l.clinica_id, l.agendamento_id, p.nome, a.data
-- HAVING count(*) > 1
--  ORDER BY a.data DESC;
