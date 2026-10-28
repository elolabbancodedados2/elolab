-- ============================================================================
-- MFA exigido no servidor (CLIN-QA-304; auditoria rodada 2, item 579)
-- Notas: docs/arquitetura/banco/mfa-servidor.md
--
-- Problema: o segundo fator só era pedido pela tela. Quem chamasse a API com
-- a sessão AAL1 (só senha) fazia operações sensíveis sem o TOTP, inclusive
-- contas com 2FA ativo e administradores da plataforma.
--
-- O que faz:
--   1. Helpers reutilizáveis (STABLE SECURITY DEFINER, search_path = ''):
--      - sessao_aal2(): o JWT atual está em AAL2;
--      - perfil_exige_mfa(): usuário logado é plataforma ativa ou tem papel
--        admin ou financeiro;
--      - mfa_satisfeito(): AAL2, ou nenhum fator verificado e a política não
--        obriga o perfil;
--      - mfa_exigido_para_mim(): para o frontend decidir se pede o cadastro;
--      - exigir_mfa(): levanta 42501 com HINT 'mfa_necessario'.
--   2. public.politica_mfa (linha única, global da plataforma): chave
--      exigir_perfis_privilegiados, padrão FALSE. Enquanto desligada, só quem
--      já tem fator verificado precisa de AAL2 (sem bloqueio de quem ainda não
--      cadastrou). Ligar exige sessão AAL2 de quem liga.
--   3. Triggers por instrução que chamam exigir_mfa() em: user_roles (papéis),
--      platform_admins, platform_impersonation_log (início de impersonação),
--      lgpd_deletion_log (exclusão e anonimização LGPD), employee_invitations
--      (criar e cancelar convite) e politica_mfa. Valem também para RPCs SECURITY DEFINER. Chamadas sem
--      usuário (service_role, GoTrue, migrations) não são afetadas.
--   4. is_platform_admin(): mesma assinatura; passa a exigir mfa_satisfeito().
--      Cobre todas as RPCs platform_* e policies da plataforma de uma vez.
--
-- Compatibilidade: com a política desligada, o comportamento só muda para
-- sessões AAL1 de contas com fator verificado, que pelo app web e móvel já
-- passam pelo TOTP no login (Auth.tsx e expo-mobile login.tsx).
--
-- Ativação (responsável, depois de os perfis privilegiados cadastrarem o fator):
--   UPDATE public.politica_mfa SET exigir_perfis_privilegiados = true;  -- sessão AAL2
-- Emergência (service_role ou psql): mesma linha com false.
--
-- Reversão:
--   BEGIN;
--   CREATE OR REPLACE FUNCTION public.is_platform_admin()
--   RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
--   AS $f$ SELECT EXISTS (SELECT 1 FROM public.platform_admins
--                          WHERE user_id = auth.uid() AND ativo = true); $f$;
--   DROP TRIGGER IF EXISTS trg_exigir_mfa ON public.user_roles;
--   DROP TRIGGER IF EXISTS trg_exigir_mfa ON public.platform_admins;
--   DROP TRIGGER IF EXISTS trg_exigir_mfa ON public.platform_impersonation_log;
--   DROP TRIGGER IF EXISTS trg_exigir_mfa ON public.lgpd_deletion_log;
--   DROP TRIGGER IF EXISTS trg_exigir_mfa ON public.employee_invitations;
--   DROP TRIGGER IF EXISTS trg_exigir_mfa ON public.politica_mfa;
--   DROP TRIGGER IF EXISTS trg_politica_mfa_ligar ON public.politica_mfa;
--   DROP FUNCTION IF EXISTS public.trg_exigir_mfa();
--   DROP FUNCTION IF EXISTS public.politica_mfa_ligar_exige_aal2();
--   DROP FUNCTION IF EXISTS public.exigir_mfa();
--   DROP FUNCTION IF EXISTS public.mfa_exigido_para_mim();
--   DROP FUNCTION IF EXISTS public.mfa_satisfeito();
--   DROP FUNCTION IF EXISTS public.perfil_exige_mfa();
--   DROP FUNCTION IF EXISTS public.sessao_aal2();
--   DROP TABLE IF EXISTS public.politica_mfa;
--   COMMIT;
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Política global (sem clinica_id: vale para a plataforma inteira)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.politica_mfa (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  exigir_perfis_privilegiados boolean NOT NULL DEFAULT false,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.politica_mfa IS
  'Linha única. exigir_perfis_privilegiados = true obriga AAL2 para plataforma, admin e financeiro nas operações sensíveis.';

INSERT INTO public.politica_mfa (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.politica_mfa ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.politica_mfa FROM PUBLIC, anon;
GRANT SELECT, UPDATE ON public.politica_mfa TO authenticated;
GRANT ALL ON public.politica_mfa TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sessao_aal2()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

-- Lê platform_admins direto (não chama is_platform_admin, que depende desta).
CREATE OR REPLACE FUNCTION public.perfil_exige_mfa()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
     AND (
       EXISTS (SELECT 1 FROM public.platform_admins pa
                WHERE pa.user_id = (SELECT auth.uid()) AND pa.ativo = true)
       OR EXISTS (SELECT 1 FROM public.user_roles ur
                   WHERE ur.user_id = (SELECT auth.uid())
                     AND ur.role IN ('admin'::public.app_role, 'financeiro'::public.app_role))
     );
$$;

CREATE OR REPLACE FUNCTION public.mfa_satisfeito()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN (SELECT auth.uid()) IS NULL THEN false
    WHEN public.sessao_aal2() THEN true
    WHEN EXISTS (SELECT 1 FROM auth.mfa_factors f
                  WHERE f.user_id = (SELECT auth.uid()) AND f.status = 'verified') THEN false
    WHEN coalesce((SELECT p.exigir_perfis_privilegiados FROM public.politica_mfa p WHERE p.id), false)
         AND public.perfil_exige_mfa() THEN false
    ELSE true
  END;
$$;

CREATE OR REPLACE FUNCTION public.mfa_exigido_para_mim()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((SELECT p.exigir_perfis_privilegiados FROM public.politica_mfa p WHERE p.id), false)
     AND public.perfil_exige_mfa();
$$;

CREATE OR REPLACE FUNCTION public.exigir_mfa()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL AND NOT public.mfa_satisfeito() THEN
    RAISE EXCEPTION 'Confirme o segundo fator de autenticação para realizar esta operação.'
      USING ERRCODE = '42501', HINT = 'mfa_necessario';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.sessao_aal2() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.perfil_exige_mfa() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mfa_satisfeito() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mfa_exigido_para_mim() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.exigir_mfa() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sessao_aal2() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.perfil_exige_mfa() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mfa_satisfeito() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mfa_exigido_para_mim() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.exigir_mfa() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. is_platform_admin com a mesma assinatura, exigindo MFA
-- Corpo anterior (20260522171216): EXISTS em platform_admins com
-- user_id = auth.uid() AND ativo = true. ACL preservada pelo CREATE OR REPLACE.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
           SELECT 1 FROM public.platform_admins
            WHERE user_id = (SELECT auth.uid()) AND ativo = true
         )
     AND public.mfa_satisfeito();
$$;

-- ---------------------------------------------------------------------------
-- 4. Policies de politica_mfa
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS politica_mfa_select ON public.politica_mfa;
CREATE POLICY politica_mfa_select ON public.politica_mfa FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS politica_mfa_update ON public.politica_mfa;
CREATE POLICY politica_mfa_update ON public.politica_mfa FOR UPDATE TO authenticated
  USING ((SELECT public.is_platform_admin()))
  WITH CHECK ((SELECT public.is_platform_admin()));
-- Sem policy de INSERT ou DELETE: a linha única só muda por UPDATE.

-- Ligar a política exige que quem liga já esteja em AAL2; evita que um
-- administrador sem fator se tranque para fora.
CREATE OR REPLACE FUNCTION public.politica_mfa_ligar_exige_aal2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.exigir_perfis_privilegiados
     AND NOT OLD.exigir_perfis_privilegiados
     AND (SELECT auth.uid()) IS NOT NULL
     AND NOT public.sessao_aal2() THEN
    RAISE EXCEPTION 'Para ligar a exigência, entre com o segundo fator.'
      USING ERRCODE = '42501', HINT = 'mfa_necessario';
  END IF;
  NEW.atualizado_em := now();
  NEW.atualizado_por := (SELECT auth.uid());
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.politica_mfa_ligar_exige_aal2() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_politica_mfa_ligar ON public.politica_mfa;
CREATE TRIGGER trg_politica_mfa_ligar
  BEFORE UPDATE ON public.politica_mfa
  FOR EACH ROW EXECUTE FUNCTION public.politica_mfa_ligar_exige_aal2();

-- ---------------------------------------------------------------------------
-- 5. Triggers nas operações sensíveis (por instrução, antes da escrita)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_exigir_mfa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.exigir_mfa();
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_exigir_mfa() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_exigir_mfa ON public.user_roles;
CREATE TRIGGER trg_exigir_mfa
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_exigir_mfa();

DROP TRIGGER IF EXISTS trg_exigir_mfa ON public.platform_admins;
CREATE TRIGGER trg_exigir_mfa
  BEFORE INSERT OR UPDATE OR DELETE ON public.platform_admins
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_exigir_mfa();

DROP TRIGGER IF EXISTS trg_exigir_mfa ON public.platform_impersonation_log;
CREATE TRIGGER trg_exigir_mfa
  BEFORE INSERT ON public.platform_impersonation_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_exigir_mfa();

DROP TRIGGER IF EXISTS trg_exigir_mfa ON public.lgpd_deletion_log;
CREATE TRIGGER trg_exigir_mfa
  BEFORE INSERT ON public.lgpd_deletion_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_exigir_mfa();

DROP TRIGGER IF EXISTS trg_exigir_mfa ON public.employee_invitations;
CREATE TRIGGER trg_exigir_mfa
  -- Sem UPDATE: o aceite do convite pelo convidado atualiza o status.
  BEFORE INSERT OR DELETE ON public.employee_invitations
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_exigir_mfa();

DROP TRIGGER IF EXISTS trg_exigir_mfa ON public.politica_mfa;
CREATE TRIGGER trg_exigir_mfa
  BEFORE UPDATE ON public.politica_mfa
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_exigir_mfa();

COMMIT;
