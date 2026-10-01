-- ============================================================================
-- is_same_clinica(): NULL nunca é "da sua clínica"
--
-- A versão de 20260423191101 já devolve false para NULL. Esta migration
-- reafirma a definição de forma idempotente — é defesa contra execução fora de
-- ordem ou recriação manual a partir de uma versão antiga, e aproveita para
-- endurecer: função marcada STABLE, search_path explícito e EXECUTE revogado
-- de anon.
--
-- Sem isto, um admin de UMA clínica enxerga linhas órfãs (clinica_id NULL) de
-- qualquer origem. A regra do multi-tenant é: sem clínica, ninguém vê.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.is_same_clinica(record_clinica_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN record_clinica_id IS NULL THEN false
    ELSE record_clinica_id = (
      SELECT p.clinica_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_same_clinica(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_same_clinica(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.is_same_clinica(uuid) IS
  'true apenas quando a linha pertence à clínica do usuário logado. NULL nunca é da clínica de ninguém.';

COMMIT;
