-- ============================================================================
-- Multiunidade, fase 1 (EXPAND) da ADR 0001
-- docs/arquitetura/adr/0001-multiunidade-organizacao-unidades-membros.md
-- Notas: docs/arquitetura/banco/multiunidade.md
--
-- O que faz:
--   1. Cria public.organizacoes, public.membros_organizacao e
--      public.membros_unidade, com RLS, policies por operação e índices.
--   2. Acrescenta public.clinicas.organizacao_id (nullable nesta fase) e um
--      trigger que impede o usuário comum de trocar a organização da clínica.
--   3. Backfill idempotente: uma organização por clínica (1:1), dono da
--      clínica como 'dono' da organização e membros_unidade a partir de
--      profiles.clinica_id x user_roles. Administrador da plataforma em
--      impersonação recebe o vínculo na clínica original, nunca na
--      impersonada. Funcionário inativo na clínica entra com ativo = false.
--   4. Cria helpers novas (minhas_unidades, tem_papel, organizacoes_visiveis,
--      gere_organizacao, gere_unidade). Nenhuma helper existente é alterada:
--      is_same_clinica, get_my_clinica_id, current_clinica_id e has_role
--      mantêm assinatura e corpo. Nenhuma policy existente muda.
--
-- Compatibilidade: nada no app lê as tabelas novas. Sem dupla escrita ainda
-- (fase 2): usuários e papéis criados depois desta migration não ganham
-- vínculo até a fase 2 ou até rodar de novo o bloco de backfill (idempotente).
--
-- Escrita nas tabelas novas: só administrador da plataforma (policy) ou
-- service_role (ignora RLS). RPCs de convite e equipe passam a escrever na
-- fase 2.
--
-- Reversão (nada depende destes objetos nesta fase):
--   BEGIN;
--   DROP TRIGGER IF EXISTS clinicas_proteger_organizacao ON public.clinicas;
--   DROP FUNCTION IF EXISTS public.clinicas_proteger_organizacao();
--   DROP FUNCTION IF EXISTS public.gere_unidade(uuid);
--   DROP FUNCTION IF EXISTS public.gere_organizacao(uuid);
--   DROP FUNCTION IF EXISTS public.organizacoes_visiveis();
--   DROP FUNCTION IF EXISTS public.tem_papel(uuid, public.app_role);
--   DROP FUNCTION IF EXISTS public.minhas_unidades();
--   DROP TABLE IF EXISTS public.membros_unidade;
--   DROP TABLE IF EXISTS public.membros_organizacao;
--   ALTER TABLE public.clinicas DROP COLUMN IF EXISTS organizacao_id;
--   DROP TABLE IF EXISTS public.organizacoes;
--   COMMIT;
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.organizacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 200),
  cnpj_matriz text,
  -- Clínica que originou a organização no backfill 1:1. Garante idempotência
  -- e rastreabilidade; organizações criadas depois deixam NULL.
  clinica_origem_id uuid UNIQUE REFERENCES public.clinicas(id) ON DELETE SET NULL,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.organizacoes IS
  'Rede ou grupo dono de uma ou mais unidades (clinicas). ADR 0001.';

ALTER TABLE public.clinicas
  ADD COLUMN IF NOT EXISTS organizacao_id uuid
  REFERENCES public.organizacoes(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.clinicas.organizacao_id IS
  'Organização dona da unidade. Nullable na fase 1; NOT NULL na fase 2 (ADR 0001).';

CREATE TABLE IF NOT EXISTS public.membros_organizacao (
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  papel_org text NOT NULL CHECK (papel_org IN ('dono', 'gestor')),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (organizacao_id, user_id)
);

COMMENT ON TABLE public.membros_organizacao IS
  'Gestores da rede (dono ou gestor). Não dá acesso a dado operacional por si só. ADR 0001.';

CREATE TABLE IF NOT EXISTS public.membros_unidade (
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  papel public.app_role NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (clinica_id, user_id, papel)
);

COMMENT ON TABLE public.membros_unidade IS
  'Vínculo usuário x unidade (clinica_id) x papel. Fonte de autorização a partir da fase 3 da ADR 0001.';

-- ---------------------------------------------------------------------------
-- 2. Índices
-- ---------------------------------------------------------------------------

-- membros_unidade: PK já começa por clinica_id (listagem da equipe da unidade).
-- Consulta das helpers: "unidades e papéis do usuário logado".
CREATE INDEX IF NOT EXISTS idx_membros_unidade_user_ativo
  ON public.membros_unidade (user_id) INCLUDE (clinica_id, papel) WHERE ativo;

-- membros_organizacao: PK começa por organizacao_id.
CREATE INDEX IF NOT EXISTS idx_membros_organizacao_user_ativo
  ON public.membros_organizacao (user_id) INCLUDE (organizacao_id, papel_org) WHERE ativo;

-- clinicas.organizacao_id: unidades de uma rede.
CREATE INDEX IF NOT EXISTS idx_clinicas_organizacao
  ON public.clinicas (organizacao_id) WHERE organizacao_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Helpers novas (nenhuma helper existente é alterada)
-- ---------------------------------------------------------------------------

-- Unidades em que o usuário logado tem vínculo ativo.
CREATE OR REPLACE FUNCTION public.minhas_unidades()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT m.clinica_id
    FROM public.membros_unidade m
   WHERE m.user_id = (SELECT auth.uid())
     AND m.ativo;
$$;

-- O usuário logado tem o papel na unidade? NULL nunca é unidade de ninguém.
CREATE OR REPLACE FUNCTION public.tem_papel(p_clinica uuid, p_papel public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_clinica IS NOT NULL
     AND p_papel IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM public.membros_unidade m
        WHERE m.user_id = (SELECT auth.uid())
          AND m.clinica_id = p_clinica
          AND m.papel = p_papel
          AND m.ativo
     );
$$;

-- Organizações que o usuário logado pode ver: as que gere e as das suas unidades.
CREATE OR REPLACE FUNCTION public.organizacoes_visiveis()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT mo.organizacao_id
    FROM public.membros_organizacao mo
   WHERE mo.user_id = (SELECT auth.uid())
     AND mo.ativo
  UNION
  SELECT c.organizacao_id
    FROM public.clinicas c
    JOIN public.membros_unidade m ON m.clinica_id = c.id
   WHERE m.user_id = (SELECT auth.uid())
     AND m.ativo
     AND c.organizacao_id IS NOT NULL;
$$;

-- O usuário logado é dono ou gestor ativo da organização?
CREATE OR REPLACE FUNCTION public.gere_organizacao(p_organizacao uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_organizacao IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM public.membros_organizacao mo
        WHERE mo.user_id = (SELECT auth.uid())
          AND mo.organizacao_id = p_organizacao
          AND mo.ativo
     );
$$;

-- O usuário logado administra a unidade (admin da unidade ou gestor da rede dona)?
CREATE OR REPLACE FUNCTION public.gere_unidade(p_clinica uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_clinica IS NOT NULL
     AND (
       public.tem_papel(p_clinica, 'admin'::public.app_role)
       OR EXISTS (
         SELECT 1
           FROM public.clinicas c
           JOIN public.membros_organizacao mo ON mo.organizacao_id = c.organizacao_id
          WHERE c.id = p_clinica
            AND mo.user_id = (SELECT auth.uid())
            AND mo.ativo
       )
     );
$$;

REVOKE ALL ON FUNCTION public.minhas_unidades() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tem_papel(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.organizacoes_visiveis() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gere_organizacao(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gere_unidade(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.minhas_unidades() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tem_papel(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.organizacoes_visiveis() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gere_organizacao(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gere_unidade(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Proteção de clinicas.organizacao_id
-- A policy clinicas_update deixa o dono alterar qualquer coluna da clínica.
-- Sem este trigger, o dono poderia pendurar a clínica na rede de outra pessoa.
-- Permitido: migration/service_role (sem auth.uid()), administrador da
-- plataforma ou RPC que ligue elolab.allow_organizacao_change na transação.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.clinicas_proteger_organizacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.organizacao_id IS NOT DISTINCT FROM OLD.organizacao_id THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.organizacao_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF (SELECT auth.uid()) IS NULL
     OR public.is_platform_admin()
     OR coalesce(current_setting('elolab.allow_organizacao_change', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'A organização da clínica só pode ser alterada pela plataforma.'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.clinicas_proteger_organizacao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS clinicas_proteger_organizacao ON public.clinicas;
CREATE TRIGGER clinicas_proteger_organizacao
  BEFORE INSERT OR UPDATE OF organizacao_id ON public.clinicas
  FOR EACH ROW EXECUTE FUNCTION public.clinicas_proteger_organizacao();

DROP TRIGGER IF EXISTS update_organizacoes_updated_at ON public.organizacoes;
CREATE TRIGGER update_organizacoes_updated_at
  BEFORE UPDATE ON public.organizacoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 5. RLS e policies por operação
-- ---------------------------------------------------------------------------

ALTER TABLE public.organizacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membros_organizacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membros_unidade ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.organizacoes, public.membros_organizacao, public.membros_unidade FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.organizacoes, public.membros_organizacao, public.membros_unidade TO authenticated;
GRANT ALL ON public.organizacoes, public.membros_organizacao, public.membros_unidade TO service_role;

-- organizacoes
DROP POLICY IF EXISTS organizacoes_select ON public.organizacoes;
CREATE POLICY organizacoes_select ON public.organizacoes FOR SELECT TO authenticated
  USING (
    (SELECT public.is_platform_admin())
    OR id IN (SELECT public.organizacoes_visiveis())
  );

DROP POLICY IF EXISTS organizacoes_insert ON public.organizacoes;
CREATE POLICY organizacoes_insert ON public.organizacoes FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_platform_admin()));

DROP POLICY IF EXISTS organizacoes_update ON public.organizacoes;
CREATE POLICY organizacoes_update ON public.organizacoes FOR UPDATE TO authenticated
  USING ((SELECT public.is_platform_admin()) OR public.gere_organizacao(id))
  WITH CHECK ((SELECT public.is_platform_admin()) OR public.gere_organizacao(id));

DROP POLICY IF EXISTS organizacoes_delete ON public.organizacoes;
CREATE POLICY organizacoes_delete ON public.organizacoes FOR DELETE TO authenticated
  USING ((SELECT public.is_platform_admin()));

-- membros_organizacao
DROP POLICY IF EXISTS membros_organizacao_select ON public.membros_organizacao;
CREATE POLICY membros_organizacao_select ON public.membros_organizacao FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (SELECT public.is_platform_admin())
    OR public.gere_organizacao(organizacao_id)
  );

DROP POLICY IF EXISTS membros_organizacao_insert ON public.membros_organizacao;
CREATE POLICY membros_organizacao_insert ON public.membros_organizacao FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_platform_admin()));

DROP POLICY IF EXISTS membros_organizacao_update ON public.membros_organizacao;
CREATE POLICY membros_organizacao_update ON public.membros_organizacao FOR UPDATE TO authenticated
  USING ((SELECT public.is_platform_admin()))
  WITH CHECK ((SELECT public.is_platform_admin()));

DROP POLICY IF EXISTS membros_organizacao_delete ON public.membros_organizacao;
CREATE POLICY membros_organizacao_delete ON public.membros_organizacao FOR DELETE TO authenticated
  USING ((SELECT public.is_platform_admin()));

-- membros_unidade
DROP POLICY IF EXISTS membros_unidade_select ON public.membros_unidade;
CREATE POLICY membros_unidade_select ON public.membros_unidade FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (SELECT public.is_platform_admin())
    OR public.gere_unidade(clinica_id)
  );

DROP POLICY IF EXISTS membros_unidade_insert ON public.membros_unidade;
CREATE POLICY membros_unidade_insert ON public.membros_unidade FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_platform_admin()));

DROP POLICY IF EXISTS membros_unidade_update ON public.membros_unidade;
CREATE POLICY membros_unidade_update ON public.membros_unidade FOR UPDATE TO authenticated
  USING ((SELECT public.is_platform_admin()))
  WITH CHECK ((SELECT public.is_platform_admin()));

DROP POLICY IF EXISTS membros_unidade_delete ON public.membros_unidade;
CREATE POLICY membros_unidade_delete ON public.membros_unidade FOR DELETE TO authenticated
  USING ((SELECT public.is_platform_admin()));

-- ---------------------------------------------------------------------------
-- 6. Backfill (idempotente)
-- ---------------------------------------------------------------------------

-- 6.1 Uma organização por clínica ainda sem organização.
INSERT INTO public.organizacoes (nome, cnpj_matriz, clinica_origem_id, criado_por)
SELECT left(coalesce(nullif(btrim(c.nome), ''), 'Organização'), 200), c.cnpj, c.id, c.owner_id
  FROM public.clinicas c
 WHERE c.organizacao_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.organizacoes o WHERE o.clinica_origem_id = c.id);

UPDATE public.clinicas c
   SET organizacao_id = o.id
  FROM public.organizacoes o
 WHERE o.clinica_origem_id = c.id
   AND c.organizacao_id IS NULL;

-- 6.2 Dono da clínica vira dono da organização de origem.
INSERT INTO public.membros_organizacao (organizacao_id, user_id, papel_org)
SELECT c.organizacao_id, c.owner_id, 'dono'
  FROM public.clinicas c
 WHERE c.organizacao_id IS NOT NULL
   AND c.owner_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = c.owner_id)
ON CONFLICT (organizacao_id, user_id) DO NOTHING;

-- 6.3 membros_unidade = clínica "de casa" do perfil x papéis globais.
-- Em impersonação, a clínica de casa é platform_admins.original_clinica_id.
-- Funcionário com cadastro inativo na clínica (e nenhum ativo) entra inativo.
WITH base AS (
  SELECT p.id AS user_id,
         CASE
           WHEN pa.impersonating_clinica_id IS NOT NULL
                AND pa.impersonating_clinica_id = p.clinica_id
             THEN pa.original_clinica_id
           ELSE p.clinica_id
         END AS clinica_id
    FROM public.profiles p
    LEFT JOIN public.platform_admins pa ON pa.user_id = p.id
   WHERE p.clinica_id IS NOT NULL
)
INSERT INTO public.membros_unidade (clinica_id, user_id, papel, ativo)
SELECT b.clinica_id,
       b.user_id,
       ur.role,
       NOT (
         EXISTS (SELECT 1 FROM public.funcionarios f
                  WHERE f.user_id = b.user_id AND f.clinica_id = b.clinica_id
                    AND f.ativo IS FALSE)
         AND NOT EXISTS (SELECT 1 FROM public.funcionarios f
                          WHERE f.user_id = b.user_id AND f.clinica_id = b.clinica_id
                            AND f.ativo IS NOT FALSE)
       )
  FROM base b
  JOIN public.user_roles ur ON ur.user_id = b.user_id
  JOIN public.clinicas c ON c.id = b.clinica_id
  JOIN auth.users u ON u.id = b.user_id
 WHERE b.clinica_id IS NOT NULL
ON CONFLICT (clinica_id, user_id, papel) DO NOTHING;

-- 6.4 Gate da fase 1 (ADR 0001 §4): perfis com clínica e papel sem vínculo.
DO $$
DECLARE
  v_sem_vinculo integer;
  v_clinicas_sem_org integer;
BEGIN
  SELECT count(*) INTO v_clinicas_sem_org FROM public.clinicas WHERE organizacao_id IS NULL;
  SELECT count(DISTINCT p.id) INTO v_sem_vinculo
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
   WHERE p.clinica_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.membros_unidade m WHERE m.user_id = p.id);
  RAISE NOTICE 'multiunidade fase 1: clinicas sem organizacao = %, perfis com clinica e papel sem vinculo = %',
    v_clinicas_sem_org, v_sem_vinculo;
END;
$$;

COMMIT;
