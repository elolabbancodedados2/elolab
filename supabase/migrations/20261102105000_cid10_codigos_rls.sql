-- ============================================================================
-- Auditoria de 02/11 — cid10_codigos com RLS
--
-- A tabela de referência cid10_codigos (20260414150000) foi criada sem RLS.
-- Com os privilégios padrão do Supabase, anon e authenticated podiam inserir,
-- alterar e apagar códigos pela API.
--
-- O app não escreve nessa tabela (a busca usa `cid10`); ela só é referenciada
-- por prontuario_diagnosticos.cid10_id. Fica leitura para usuários logados.
-- Carga de dados deve ser feita por migration ou service role.
-- ============================================================================

BEGIN;

ALTER TABLE IF EXISTS public.cid10_codigos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.cid10_codigos FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.cid10_codigos FROM authenticated;
GRANT SELECT ON public.cid10_codigos TO authenticated;

DROP POLICY IF EXISTS cid10_codigos_select_autenticado ON public.cid10_codigos;
CREATE POLICY cid10_codigos_select_autenticado ON public.cid10_codigos
  FOR SELECT TO authenticated
  USING (true);

COMMIT;
