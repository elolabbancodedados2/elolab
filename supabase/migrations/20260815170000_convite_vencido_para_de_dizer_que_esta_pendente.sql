-- ============================================================================
-- Convite vencido dizia "pendente" no banco
--
-- `employee_invitations` guarda o estado em DUAS fontes que podem discordar:
-- a coluna `status` e a data `expires_at`. Nada nunca atualizou a coluna, então
-- os 3 convites marcados como `pending` venceram em 28/03, 31/07 e 05/08.
--
-- A tela não se engana (ela calcula pelo `expires_at`) e a função de aceitar
-- também não (exige `status='pending' AND expires_at > now()`). Quem se engana
-- é qualquer consulta que confie na coluna — inclusive a auditoria que eu
-- mesmo rodei, que contou 3 convites pendentes que não existem.
--
-- Duas correções:
--   1. Acerta as linhas vencidas agora.
--   2. Um gatilho mantém a coluna coerente daqui para frente, para as duas
--      fontes não voltarem a divergir.
--
-- `convites_funcionario`, a tabela do fluxo em uso, não tem esse problema:
-- ela deriva tudo de `accepted_at` e `expires_at`, sem coluna redundante.
-- ============================================================================

BEGIN;

UPDATE public.employee_invitations
   SET status = 'expired'
 WHERE status = 'pending'
   AND expires_at <= now();

CREATE OR REPLACE FUNCTION public.convite_status_coerente()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Aceito manda em tudo: uma vez usado, o convite não "desvence".
  IF NEW.accepted_at IS NOT NULL THEN
    NEW.status := 'accepted';
  ELSIF NEW.expires_at IS NOT NULL AND NEW.expires_at <= now() THEN
    NEW.status := 'expired';
  ELSIF NEW.status IS NULL OR NEW.status = 'expired' THEN
    -- Prorrogar a validade devolve o convite para pendente.
    NEW.status := 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS convite_status_coerente ON public.employee_invitations;
CREATE TRIGGER convite_status_coerente
  BEFORE INSERT OR UPDATE ON public.employee_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.convite_status_coerente();

COMMENT ON COLUMN public.employee_invitations.status IS
  'Derivado de accepted_at e expires_at pelo gatilho convite_status_coerente. Não escreva direto: a verdade é a data.';

COMMIT;
