-- ============================================================================
-- Baixa de estoque pelo prontuário nunca acontecia quando quem salvava era médico
--
-- O prontuário desconta do estoque o material prescrito
-- (src/pages/Prontuarios.tsx). Mas a escrita em movimentacoes_estoque e estoque
-- só era liberada para admin, enfermagem e financeiro — não para médico, que é
-- justamente quem preenche prontuário.
--
-- Pior: o código trata QUALQUER erro na inserção como "já houve baixa deste
-- item para este prontuário" e segue adiante (`if (movErr) continue`). A
-- checagem existe por causa do índice único que impede baixa repetida pelo
-- autosave — mas falta de permissão caía no mesmo caminho.
--
-- Resultado: médico salvava o prontuário, a baixa era recusada, ninguém era
-- avisado, e o estoque do sistema seguia mostrando material que já foi usado.
-- Defeito silencioso — não aparecia em nenhuma tela.
--
-- Por que liberar em vez de restringir: a baixa não é uma ação do usuário, é
-- consequência de registrar a prescrição. Quem pode prescrever tem
-- necessariamente que poder consumir o material prescrito.
--
-- O ideal seria a baixa rodar no servidor, por gatilho, independente de quem
-- salva. Fica anotado como melhoria; esta migration resolve o defeito sem
-- reescrever o fluxo, e o índice único continua garantindo a idempotência.
-- ============================================================================

BEGIN;

-- A política existente chamava-se _insert_scoped. Removida junto: manter as duas
-- deixaria uma redundante conviver com a nova, que é superconjunto dela. É o
-- padrão que causou o vazamento entre clínicas em user_roles — políticas
-- permissivas se somam com OU e a mais frouxa vence, então duas políticas para
-- a mesma operação são sempre uma armadilha esperando divergir.
DROP POLICY IF EXISTS movimentacoes_estoque_insert_scoped ON public.movimentacoes_estoque;
DROP POLICY IF EXISTS movimentacoes_estoque_insert ON public.movimentacoes_estoque;
CREATE POLICY movimentacoes_estoque_insert ON public.movimentacoes_estoque
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      public.is_admin(auth.uid())
      OR public.is_enfermagem(auth.uid())
      OR public.is_financeiro(auth.uid())
      OR public.is_medico(auth.uid())
    )
    AND (clinica_id = public.get_my_clinica_id() OR clinica_id IS NULL)
  );

DROP POLICY IF EXISTS estoque_update ON public.estoque;
CREATE POLICY estoque_update ON public.estoque
  FOR UPDATE TO authenticated
  USING (
    (
      public.is_admin(auth.uid())
      OR public.is_enfermagem(auth.uid())
      OR public.is_financeiro(auth.uid())
      OR public.is_medico(auth.uid())
    )
    AND public.is_same_clinica(clinica_id)
  )
  WITH CHECK (
    (
      public.is_admin(auth.uid())
      OR public.is_enfermagem(auth.uid())
      OR public.is_financeiro(auth.uid())
      OR public.is_medico(auth.uid())
    )
    AND public.is_same_clinica(clinica_id)
  );

COMMENT ON POLICY movimentacoes_estoque_insert ON public.movimentacoes_estoque IS
  'Inclui medico porque a baixa é consequência de registrar a prescrição no prontuário, não uma ação de almoxarifado. Sem isso a baixa era recusada em silêncio.';

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
-- -- As duas políticas devem citar is_medico:
-- SELECT tablename, cmd, coalesce(with_check, qual) FROM pg_policies
--  WHERE schemaname='public' AND tablename IN ('estoque','movimentacoes_estoque')
--    AND cmd IN ('INSERT','UPDATE') ORDER BY 1, 2;
--
-- ⚠️ O estoque atual está defasado: tudo que médicos prescreveram até agora não
-- foi descontado. Não há como recompor pelo histórico — as baixas nunca foram
-- gravadas, então não existe registro do que saiu. Só contagem física resolve.
-- Para dimensionar quantos prontuários tinham prescrição e não geraram baixa:
--
-- SELECT count(DISTINCT p.id) AS prontuarios_com_prescricao_sem_baixa
--   FROM public.prontuarios p
--   JOIN public.prescricoes pr ON pr.prontuario_id = p.id
--  WHERE NOT EXISTS (
--    SELECT 1 FROM public.movimentacoes_estoque m WHERE m.prontuario_id = p.id
--  );
