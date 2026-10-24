BEGIN;

-- Item 73: reduzir controles de segurança da clínica exige prova de identidade
-- recente. A prova vem do próprio JWT emitido pelo Supabase Auth: o claim `amr`
-- guarda o instante de cada método (senha ou TOTP), e o refresh não o renova.

CREATE OR REPLACE FUNCTION public.reautenticacao_recente(p_janela_segundos integer DEFAULT 300)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND jsonb_typeof(auth.jwt() -> 'amr') = 'array'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(auth.jwt() -> 'amr') AS a(item)
       WHERE a.item ->> 'method' IN ('password', 'totp')
         AND (a.item ->> 'timestamp') ~ '^\d+$'
         AND (a.item ->> 'timestamp')::bigint >= extract(epoch FROM now())::bigint - GREATEST(p_janela_segundos, 0)
    )
    -- Com 2FA verificado, a sessão precisa estar em AAL2.
    AND (
      NOT EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = auth.uid() AND f.status = 'verified')
      OR auth.jwt() ->> 'aal' = 'aal2'
    );
$$;
REVOKE ALL ON FUNCTION public.reautenticacao_recente(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reautenticacao_recente(integer) TO authenticated;

-- Valores ausentes usam os mesmos padrões da tela de Configurações.
CREATE OR REPLACE FUNCTION public.config_seguranca_reduzida(p_antes jsonb, p_depois jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT
    COALESCE(CASE WHEN (p_depois ->> 'sessionTimeoutMin') ~ '^\d+$' THEN (p_depois ->> 'sessionTimeoutMin')::integer END, 30)
      > COALESCE(CASE WHEN (p_antes ->> 'sessionTimeoutMin') ~ '^\d+$' THEN (p_antes ->> 'sessionTimeoutMin')::integer END, 30)
    OR EXISTS (
      SELECT 1 FROM (VALUES ('mascarCpf', true), ('logAuditoria', true), ('lgpdConsentimento', true),
                            ('senhaForte', true), ('loginDuplo', false)) AS d(campo, padrao)
       WHERE COALESCE(CASE WHEN jsonb_typeof(p_antes -> d.campo) = 'boolean' THEN (p_antes ->> d.campo)::boolean END, d.padrao)
         AND NOT COALESCE(CASE WHEN jsonb_typeof(p_depois -> d.campo) = 'boolean' THEN (p_depois ->> d.campo)::boolean END, d.padrao)
    );
$$;

-- Trigger cobre salvar, restaurar versão e qualquer gravação direta. Chamadas
-- sem usuário (service role, manutenção) não passam por esta verificação.
CREATE OR REPLACE FUNCTION public.exigir_reautenticacao_config_seguranca()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.chave = 'config_seguranca'
     AND auth.uid() IS NOT NULL
     AND public.config_seguranca_reduzida(
       CASE WHEN TG_OP = 'UPDATE' THEN OLD.valor ELSE '{}'::jsonb END, NEW.valor)
     AND NOT public.reautenticacao_recente(300) THEN
    RAISE EXCEPTION 'Confirme sua identidade para reduzir os controles de segurança.'
      USING ERRCODE = '42501', HINT = 'reautenticacao_necessaria';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.exigir_reautenticacao_config_seguranca() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_exigir_reautenticacao_config_seguranca ON public.configuracoes_clinica;
CREATE TRIGGER trg_exigir_reautenticacao_config_seguranca
  BEFORE INSERT OR UPDATE OF valor ON public.configuracoes_clinica
  FOR EACH ROW EXECUTE FUNCTION public.exigir_reautenticacao_config_seguranca();

COMMIT;
