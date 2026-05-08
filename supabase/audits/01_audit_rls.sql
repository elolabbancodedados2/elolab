-- ============================================================================
-- EloLab — Auditoria de Row Level Security (RLS)
-- ============================================================================
-- Use este arquivo no Supabase SQL Editor para entender o estado atual de RLS.
-- Este script é SOMENTE LEITURA — não modifica dados nem schema.
--
-- Como usar:
--   1. Abrir Supabase Dashboard → SQL Editor → New query
--   2. Copiar o bloco de cada seção, executar e salvar o resultado
--   3. Comparar com a "Matriz esperada" no final
-- ============================================================================


-- ── 1. Tabelas com RLS desabilitado ─────────────────────────────────────────
-- Tabelas sem RLS ativo permitem que QUALQUER usuário autenticado leia tudo.
-- Esperado: lista vazia (todas as tabelas devem ter RLS).
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = FALSE
ORDER BY tablename;


-- ── 2. Tabelas com RLS ativo mas SEM nenhuma policy ─────────────────────────
-- RLS ativo + zero policies = ninguém consegue ler nem escrever (lockout total).
-- Esperado: lista vazia.
SELECT
  t.schemaname,
  t.tablename,
  t.rowsecurity,
  (SELECT COUNT(*) FROM pg_policies p WHERE p.tablename = t.tablename) AS policy_count
FROM pg_tables t
WHERE t.schemaname = 'public'
  AND t.rowsecurity = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p WHERE p.tablename = t.tablename
  )
ORDER BY t.tablename;


-- ── 3. Inventário completo de policies por tabela ───────────────────────────
SELECT
  schemaname,
  tablename,
  policyname,
  cmd AS command,
  roles,
  qual AS using_clause,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd, policyname;


-- ── 4. Resumo por tabela ────────────────────────────────────────────────────
SELECT
  t.tablename,
  t.rowsecurity AS rls_on,
  COUNT(p.policyname) AS policies,
  STRING_AGG(DISTINCT p.cmd, ', ' ORDER BY p.cmd) AS commands_covered
FROM pg_tables t
LEFT JOIN pg_policies p ON p.tablename = t.tablename
WHERE t.schemaname = 'public'
GROUP BY t.tablename, t.rowsecurity
ORDER BY t.tablename;


-- ── 5. Policies que NÃO filtram por clinica_id (suspeitas) ──────────────────
-- Em multi-tenant por clinica_id, toda policy SELECT/UPDATE/DELETE deve
-- referenciar clinica_id direta ou indiretamente. Esta lista é apenas indicativa.
SELECT
  tablename,
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
  AND cmd IN ('SELECT', 'UPDATE', 'DELETE')
  AND qual IS NOT NULL
  AND qual NOT ILIKE '%clinica_id%'
  AND qual NOT ILIKE '%auth.uid()%'
ORDER BY tablename;


-- ── 6. Tabelas críticas que DEVEM ter RLS (checklist explícito) ─────────────
WITH critical AS (
  SELECT unnest(ARRAY[
    'pacientes',
    'prontuarios',
    'agendamentos',
    'fila_atendimento',
    'prescricoes',
    'atestados',
    'encaminhamentos',
    'exames',
    'lancamentos',
    'pagamentos_mercadopago',
    'profiles',
    'user_roles',
    'audit_log',
    'configuracoes_clinica'
  ]) AS tablename
)
SELECT
  c.tablename,
  EXISTS (SELECT 1 FROM pg_tables t WHERE t.schemaname='public' AND t.tablename=c.tablename) AS exists_in_db,
  COALESCE((SELECT rowsecurity FROM pg_tables t WHERE t.schemaname='public' AND t.tablename=c.tablename), FALSE) AS rls_on,
  COALESCE((SELECT COUNT(*) FROM pg_policies p WHERE p.tablename=c.tablename), 0) AS policy_count,
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM pg_tables t WHERE t.schemaname='public' AND t.tablename=c.tablename)
      THEN '⚪ tabela não existe'
    WHEN NOT (SELECT rowsecurity FROM pg_tables t WHERE t.schemaname='public' AND t.tablename=c.tablename)
      THEN '🔴 RLS DESATIVADO'
    WHEN COALESCE((SELECT COUNT(*) FROM pg_policies p WHERE p.tablename=c.tablename), 0) = 0
      THEN '🔴 RLS sem policies (lockout)'
    ELSE '🟢 OK'
  END AS status
FROM critical c
ORDER BY c.tablename;


-- ── 7. Teste de isolamento (rodar como usuário comum, não service role) ─────
-- Substitua o UUID abaixo pelo id de um usuário real para testar:
--
-- SELECT
--   p.id AS paciente_id,
--   p.nome,
--   p.clinica_id,
--   (SELECT clinica_id FROM profiles WHERE id = auth.uid()) AS minha_clinica
-- FROM pacientes p
-- WHERE p.clinica_id != (SELECT clinica_id FROM profiles WHERE id = auth.uid())
-- LIMIT 5;
--
-- ✅ Esperado: 0 linhas (RLS está bloqueando dados de outras clínicas)
-- 🔴 Se retornar linhas: RLS quebrado, vazamento entre tenants


-- ============================================================================
-- Matriz esperada (referência)
-- ============================================================================
-- | Tabela                      | RLS | Policies mín. | Notas                |
-- |-----------------------------|-----|---------------|----------------------|
-- | pacientes                   | ON  | 4 (CRUD)      | clinica_id           |
-- | prontuarios                 | ON  | 4             | via paciente.clinica |
-- | agendamentos                | ON  | 4             | clinica_id           |
-- | prescricoes                 | ON  | 4             | clinica_id           |
-- | exames                      | ON  | 4             | clinica_id           |
-- | lancamentos + pagamentos_*  | ON  | 4             | clinica_id           |
-- | profiles                    | ON  | 2 (SEL/UPD)   | id = auth.uid()      |
-- | user_roles                  | ON  | 1+            | admin only           |
-- | audit_log                   | ON  | 1 SELECT      | UPDATE/DELETE proibido|
-- ============================================================================
