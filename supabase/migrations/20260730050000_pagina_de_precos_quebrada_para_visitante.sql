-- ============================================================================
-- Página de preços não abria para visitante: 401 ao ler os planos
--
-- Um visitante recebia, ao carregar a lista de planos:
--   42501 — permission denied for function has_any_role
--
-- É a página onde o cliente escolhe o plano e assina. Estava quebrada para quem
-- não está logado, que é exatamente o público dela.
--
-- CAUSA
-- `planos` acumulou QUATRO políticas de SELECT:
--
--   planos_public_select   ativo = true            -> public
--   planos_select_all      ativo = true            -> anon, authenticated
--   planos_select          has_any_role(auth.uid()) -> public
--   planos_platform_admin  is_platform_admin()      -> authenticated (FOR ALL)
--
-- O Postgres avalia TODAS as políticas permissivas aplicáveis ao papel. Como
-- `planos_select` foi concedida a `public` — que inclui `anon` — o banco tentava
-- executar has_any_role() para o visitante. E anon perdeu o EXECUTE dessa função
-- num REVOKE anterior, então a chamada não devolve falso: ela ERRA, e o erro
-- derruba a consulta inteira.
--
-- Detalhe que engana: política restritiva demais normalmente devolve lista
-- vazia. Aqui devolve 401. O sintoma parece de autenticação, não de RLS.
--
-- Encontrado pelo teste de e2e depois que ele voltou a rodar de verdade — os
-- testes de RLS estavam sendo pulados por falta da chave anon.
--
-- CORREÇÃO
-- Duas políticas bastam, e sem sobreposição:
--   visitante e usuário logado -> planos ativos
--   admin de plataforma        -> tudo, incluindo inativos, e pode alterar
--
-- planos_select some (era ela que quebrava) e planos_select_all some por ser
-- cópia da planos_public_select. Quatro políticas para a mesma leitura é
-- convite para divergirem — foi assim que o vazamento em user_roles nasceu.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS planos_select      ON public.planos;
DROP POLICY IF EXISTS planos_select_all  ON public.planos;
DROP POLICY IF EXISTS planos_public_select ON public.planos;

-- Catálogo comercial: preço de plano é informação pública por natureza.
-- Inativos ficam de fora para não exibir plano descontinuado na página.
CREATE POLICY planos_public_select ON public.planos
  FOR SELECT TO anon, authenticated
  USING (ativo = true);

COMMENT ON POLICY planos_public_select ON public.planos IS
  'Não pode chamar função de papel (has_any_role e afins): anon não tem EXECUTE nelas e a chamada devolve 42501, derrubando a consulta com 401 em vez de filtrar.';

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
-- -- Devem sobrar exatamente duas políticas: a pública e a de plataforma.
-- SELECT policyname, cmd, roles::text, qual FROM pg_policies
--  WHERE schemaname='public' AND tablename='planos' ORDER BY policyname;
--
-- -- E a leitura anônima precisa voltar 200. Com a chave anon do client.ts:
-- --   curl "$URL/rest/v1/planos?select=id,nome,ativo" -H "apikey: $ANON"
--
-- ⚠️ MESMO DEFEITO, LATENTE, EM OUTRAS 34 POLÍTICAS
-- Elas foram concedidas a `public` (que inclui anon) e chamam funções que anon
-- não executa. Não aparecem porque ninguém acessa aquelas tabelas sem login —
-- mas qualquer tela pública nova sobre elas quebraria do mesmo jeito. Para
-- listar:
--
-- WITH fn_sem_anon AS (
--   SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
-- )
-- SELECT tablename, policyname, cmd FROM pg_policies pol
--  WHERE schemaname='public' AND 'public' = ANY(pol.roles::text[])
--    AND EXISTS (SELECT 1 FROM fn_sem_anon f WHERE coalesce(pol.qual,'') LIKE '%'||f.proname||'(%');
