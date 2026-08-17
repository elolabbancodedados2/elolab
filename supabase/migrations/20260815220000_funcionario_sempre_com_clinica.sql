-- ============================================================================
-- Funcionário criado sem clínica sumia da lista de quem o criou
--
-- As duas regras não conversavam:
--
--   funcionarios_insert: is_admin(...) AND (clinica_id = get_my_clinica_id()
--                                           OR clinica_id IS NULL)
--   funcionarios_select: (...) AND is_same_clinica(clinica_id)
--
-- E `is_same_clinica(NULL)` é falso. Ou seja: dava para GRAVAR sem clínica, e o
-- registro nascia invisível — inclusive para o admin que acabou de criá-lo, que
-- clica em salvar, a lista não muda, e ele cria de novo.
--
-- O gatilho `fn_fill_clinica_id` já carimba a clínica quando o campo vem vazio,
-- e o WITH CHECK roda DEPOIS dos gatilhos BEFORE. Então exigir a clínica aqui
-- não quebra o fluxo normal: quando o app insere sem informar, o gatilho já
-- preencheu e a checagem aprova. Só cai o caso em que nem o gatilho conseguiu
-- resolver — que é exatamente o registro órfão que não se quer criar.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS funcionarios_insert ON public.funcionarios;
CREATE POLICY funcionarios_insert ON public.funcionarios
  FOR INSERT WITH CHECK (
    is_admin(auth.uid()) AND clinica_id = get_my_clinica_id()
  );

COMMIT;
