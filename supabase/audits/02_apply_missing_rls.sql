-- ============================================================================
-- EloLab — Aplicação de RLS Policies (modelo recomendado)
-- ============================================================================
-- ⚠️  ATENÇÃO: este arquivo modifica policies. EXECUTE PRIMEIRO 01_audit_rls.sql
--    para entender o estado atual. Aplicar policies erradas pode bloquear o app.
--
-- ⚠️  RECOMENDAÇÃO: rodar primeiro num projeto Supabase de staging, validar com
--    contas de teste de cada role (admin, medico, recepcao), e só depois prod.
--
-- Como aplicar:
--   1. Revisar bloco a bloco
--   2. Descomentar APENAS o que se aplica (algumas policies já podem existir)
--   3. Executar em pequenos grupos, testar login/listagem após cada grupo
-- ============================================================================


-- ── Helpers SECURITY DEFINER (idempotentes) ─────────────────────────────────
-- search_path explícito previne schema hijacking.
CREATE OR REPLACE FUNCTION public.user_clinica_id()
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT clinica_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.user_has_role(_role TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role::TEXT = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.user_is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT public.user_has_role('admin');
$$;


-- ── 1. PACIENTES ────────────────────────────────────────────────────────────
-- Multi-tenant por clinica_id. Admin/médico/recepção/enfermagem podem CRUD.
-- ALTER TABLE pacientes ENABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS pacientes_select_own_clinic ON pacientes;
-- CREATE POLICY pacientes_select_own_clinic ON pacientes
--   FOR SELECT USING (clinica_id = public.user_clinica_id());
--
-- DROP POLICY IF EXISTS pacientes_insert_own_clinic ON pacientes;
-- CREATE POLICY pacientes_insert_own_clinic ON pacientes
--   FOR INSERT WITH CHECK (clinica_id = public.user_clinica_id());
--
-- DROP POLICY IF EXISTS pacientes_update_own_clinic ON pacientes;
-- CREATE POLICY pacientes_update_own_clinic ON pacientes
--   FOR UPDATE USING (clinica_id = public.user_clinica_id())
--   WITH CHECK (clinica_id = public.user_clinica_id());
--
-- DROP POLICY IF EXISTS pacientes_delete_own_clinic ON pacientes;
-- CREATE POLICY pacientes_delete_own_clinic ON pacientes
--   FOR DELETE USING (clinica_id = public.user_clinica_id());


-- ── 2. PRONTUÁRIOS ──────────────────────────────────────────────────────────
-- Acesso clínico: admin + médico. Recepção NÃO vê.
-- ALTER TABLE prontuarios ENABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS prontuarios_clinical ON prontuarios;
-- CREATE POLICY prontuarios_clinical ON prontuarios
--   FOR ALL USING (
--     paciente_id IN (
--       SELECT id FROM pacientes WHERE clinica_id = public.user_clinica_id()
--     )
--     AND (public.user_is_admin() OR public.user_has_role('medico'))
--   );


-- ── 3. AGENDAMENTOS ─────────────────────────────────────────────────────────
-- Acesso por clinica_id. CRUD completo para admin/recepção/médico.
-- ALTER TABLE agendamentos ENABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS agendamentos_own_clinic ON agendamentos;
-- CREATE POLICY agendamentos_own_clinic ON agendamentos
--   FOR ALL USING (clinica_id = public.user_clinica_id())
--   WITH CHECK (clinica_id = public.user_clinica_id());


-- ── 4. PRESCRIÇÕES, ATESTADOS, ENCAMINHAMENTOS ──────────────────────────────
-- Mesmo padrão: filtra via paciente_id → clinica_id.
-- Replicar bloco para 'atestados' e 'encaminhamentos' substituindo o nome.
--
-- ALTER TABLE prescricoes ENABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS prescricoes_clinic ON prescricoes;
-- CREATE POLICY prescricoes_clinic ON prescricoes
--   FOR ALL USING (
--     paciente_id IN (
--       SELECT id FROM pacientes WHERE clinica_id = public.user_clinica_id()
--     )
--   );


-- ── 5. FINANCEIRO ───────────────────────────────────────────────────────────
-- Apenas admin e financeiro.
-- ALTER TABLE lancamentos ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE pagamentos_mercadopago ENABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS lancamentos_finance ON lancamentos;
-- CREATE POLICY lancamentos_finance ON lancamentos
--   FOR ALL USING (
--     clinica_id = public.user_clinica_id()
--     AND (public.user_is_admin() OR public.user_has_role('financeiro'))
--   );


-- ── 6. AUDIT LOG ────────────────────────────────────────────────────────────
-- Append-only: SELECT permitido, UPDATE/DELETE proibido (deny by default).
-- ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS audit_log_read ON audit_log;
-- CREATE POLICY audit_log_read ON audit_log
--   FOR SELECT USING (clinica_id = public.user_clinica_id() OR public.user_is_admin());
--
-- DROP POLICY IF EXISTS audit_log_insert ON audit_log;
-- CREATE POLICY audit_log_insert ON audit_log
--   FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);


-- ── 7. PROFILES ─────────────────────────────────────────────────────────────
-- Usuário lê e edita o próprio profile. Admin edita qualquer profile da clínica.
-- ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS profiles_select_self ON profiles;
-- CREATE POLICY profiles_select_self ON profiles
--   FOR SELECT USING (id = auth.uid() OR clinica_id = public.user_clinica_id());
--
-- DROP POLICY IF EXISTS profiles_update_self ON profiles;
-- CREATE POLICY profiles_update_self ON profiles
--   FOR UPDATE USING (id = auth.uid())
--   WITH CHECK (id = auth.uid());
--
-- DROP POLICY IF EXISTS profiles_admin_update ON profiles;
-- CREATE POLICY profiles_admin_update ON profiles
--   FOR UPDATE USING (
--     public.user_is_admin() AND clinica_id = public.user_clinica_id()
--   );


-- ============================================================================
-- Validação pós-aplicação
-- ============================================================================
-- Rode novamente 01_audit_rls.sql e confira:
-- - Seção 6 (matriz crítica): todas as tabelas devem estar 🟢 OK
-- - Seção 7 (teste de isolamento): 0 linhas ao consultar dados de outra clínica
--
-- Para reverter uma policy específica:
--   DROP POLICY IF EXISTS <nome_da_policy> ON <tabela>;
--
-- Para desabilitar RLS de uma tabela (emergência):
--   ALTER TABLE <tabela> DISABLE ROW LEVEL SECURITY;
-- ============================================================================
