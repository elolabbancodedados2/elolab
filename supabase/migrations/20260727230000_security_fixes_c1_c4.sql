-- ============================================================================
-- EloLab — Correções de segurança C1 a C4
-- Data: 2026-07-27
--
-- C1  Isolamento de tenant: impedir troca de clinica_id e vazamento de profiles
-- C2  Storage: escopar medical-attachments e guias-externas por clínica
-- C3  Convites: impedir escalada de privilégio
-- C4  Planos/assinaturas: impedir edição do catálogo global e auto-assinatura
--
-- Idempotente: pode ser executado mais de uma vez com segurança.
-- NÃO inclui a mudança de patient-photos para privado (ver Parte B, arquivo
-- separado) porque ela quebra as fotos exibidas até o frontend ser ajustado.
-- ============================================================================

BEGIN;

-- ============================================================================
-- C1 — Isolamento de tenant
-- ============================================================================

-- C1.1 — Trava de escrita em profiles.clinica_id -----------------------------
-- Hoje qualquer usuário pode fazer PATCH no próprio profile e apontar
-- clinica_id para outra clínica, herdando acesso total a ela.
-- A trava permite apenas os caminhos legítimos:
--   a) service_role / SQL Editor / cron (auth.uid() IS NULL)
--   b) platform admin (usado por platform_start/stop_impersonation)
--   c) funções SECURITY DEFINER confiáveis que sinalizam via flag de transação
--   d) primeira atribuição (NULL -> X) quando o usuário é dono da clínica X

CREATE OR REPLACE FUNCTION public.fn_guard_profile_clinica()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.clinica_id IS NOT DISTINCT FROM OLD.clinica_id THEN
    RETURN NEW;
  END IF;

  -- (a) sem usuário no contexto: service_role, SQL Editor, jobs
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- (c) função interna confiável autorizou explicitamente esta transação
  IF coalesce(current_setting('elolab.allow_clinica_change', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  -- (b) impersonação de platform admin
  IF public.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  -- (d) primeira atribuição para uma clínica da qual o usuário é dono
  IF OLD.clinica_id IS NULL AND NEW.clinica_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.clinicas c
    WHERE c.id = NEW.clinica_id AND c.owner_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'clinica_id do perfil nao pode ser alterado por este usuario'
    USING ERRCODE = '42501';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_guard_profile_clinica() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_profile_clinica ON public.profiles;
CREATE TRIGGER trg_guard_profile_clinica
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_profile_clinica();

-- C1.2 — profiles deixa de ser legível por toda a base ------------------------
-- Antes: USING (has_any_role(auth.uid())) — qualquer usuário com qualquer papel
-- lia nome, email, telefone, cpf_cnpj, clinica_id, mfa_secret e mfa_backup_codes
-- de TODAS as clínicas.

DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_scoped" ON public.profiles;

CREATE POLICY "profiles_select_scoped" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.is_platform_admin()
    OR (
      clinica_id IS NOT NULL
      AND clinica_id = public.get_my_clinica_id()
    )
  );

-- ============================================================================
-- C2 — Storage isolado por clínica
-- ============================================================================

-- C2.1 — medical-attachments -------------------------------------------------
-- Antes: qualquer usuário clínico de QUALQUER clínica lia todos os anexos.
-- Convenções de path em uso hoje:
--   'exames/<paciente_id>/<arquivo>'   (src/pages/Exames.tsx)
--   '<prontuario_id>/<arquivo>'        (src/components/clinical/AnexosProntuario.tsx)

CREATE OR REPLACE FUNCTION public.storage_med_attach_allowed(_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parts     text[];
  candidate uuid;
  my_clinica uuid;
BEGIN
  my_clinica := public.get_my_clinica_id();
  IF my_clinica IS NULL OR _name IS NULL THEN
    RETURN false;
  END IF;

  parts := string_to_array(_name, '/');

  -- padrão A: exames/<paciente_id>/...
  IF array_length(parts, 1) >= 2 AND parts[1] = 'exames' THEN
    BEGIN
      candidate := parts[2]::uuid;
    EXCEPTION WHEN others THEN
      RETURN false;
    END;
    RETURN EXISTS (
      SELECT 1 FROM public.pacientes p
      WHERE p.id = candidate AND p.clinica_id = my_clinica
    );
  END IF;

  -- padrão B: <prontuario_id>/...
  IF array_length(parts, 1) >= 1 THEN
    BEGIN
      candidate := parts[1]::uuid;
    EXCEPTION WHEN others THEN
      RETURN false;
    END;
    RETURN EXISTS (
      SELECT 1 FROM public.prontuarios pr
      WHERE pr.id = candidate AND pr.clinica_id = my_clinica
    );
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.storage_med_attach_allowed(text) TO authenticated;

DROP POLICY IF EXISTS "Usuários clínicos podem ver anexos"        ON storage.objects;
DROP POLICY IF EXISTS "Usuários clínicos podem enviar anexos"     ON storage.objects;
DROP POLICY IF EXISTS "Admins e médicos podem deletar anexos"     ON storage.objects;
DROP POLICY IF EXISTS "Usuários clínicos podem atualizar anexos"  ON storage.objects;
DROP POLICY IF EXISTS "med_attach_select_scoped"                  ON storage.objects;
DROP POLICY IF EXISTS "med_attach_insert_scoped"                  ON storage.objects;
DROP POLICY IF EXISTS "med_attach_update_scoped"                  ON storage.objects;
DROP POLICY IF EXISTS "med_attach_delete_scoped"                  ON storage.objects;

CREATE POLICY "med_attach_select_scoped" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'medical-attachments'
    AND public.can_access_clinical(auth.uid())
    AND public.storage_med_attach_allowed(name)
  );

CREATE POLICY "med_attach_insert_scoped" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'medical-attachments'
    AND public.can_access_clinical(auth.uid())
    AND public.storage_med_attach_allowed(name)
  );

CREATE POLICY "med_attach_update_scoped" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'medical-attachments'
    AND public.can_access_clinical(auth.uid())
    AND public.storage_med_attach_allowed(name)
  );

CREATE POLICY "med_attach_delete_scoped" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'medical-attachments'
    AND (public.is_admin(auth.uid()) OR public.is_medico(auth.uid()))
    AND public.storage_med_attach_allowed(name)
  );

-- C2.2 — guias-externas ------------------------------------------------------
-- Antes: TO authenticated sem condição — qualquer conta lia/apagava guias de
-- todas as clínicas. Os arquivos já são gravados como '<clinica_id>/<arquivo>'
-- (src/pages/GuiasExternas.tsx), então basta comparar o primeiro nível.

DROP POLICY IF EXISTS "guias_externas_storage_read"   ON storage.objects;
DROP POLICY IF EXISTS "guias_externas_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "guias_externas_storage_delete" ON storage.objects;

CREATE POLICY "guias_externas_storage_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'guias-externas'
    AND (storage.foldername(name))[1] = public.get_my_clinica_id()::text
  );

CREATE POLICY "guias_externas_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'guias-externas'
    AND (storage.foldername(name))[1] = public.get_my_clinica_id()::text
  );

CREATE POLICY "guias_externas_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'guias-externas'
    AND (storage.foldername(name))[1] = public.get_my_clinica_id()::text
  );

-- ============================================================================
-- C3 — Convites de funcionário
-- ============================================================================

-- Antes: accept_employee_invitation aceitava qualquer _user_id, então quem
-- tivesse um token podia vincular os papéis a uma conta arbitrária.
-- Agora o destino é resolvido pelo e-mail do próprio convite: os papéis só
-- podem cair na conta que foi convidada.

CREATE OR REPLACE FUNCTION public.accept_employee_invitation(_token text, _user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite     RECORD;
  v_func       RECORD;
  v_clinica_id uuid;
  v_target     uuid;
BEGIN
  SELECT * INTO v_invite
  FROM public.employee_invitations
  WHERE token = _token
    AND status = 'pending'
    AND expires_at > now()
  LIMIT 1;

  IF v_invite IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Convite inválido, expirado ou já utilizado.');
  END IF;

  -- O convite só pode ser aceito pela conta cujo e-mail foi convidado.
  SELECT u.id INTO v_target
  FROM auth.users u
  WHERE lower(u.email) = lower(v_invite.email)
  LIMIT 1;

  IF v_target IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Conta do convidado não encontrada.');
  END IF;

  IF _user_id IS DISTINCT FROM v_target THEN
    RETURN jsonb_build_object('success', false, 'error', 'Convite não pertence a esta conta.');
  END IF;

  -- Se já existe sessão, ela precisa ser a do próprio convidado.
  IF auth.uid() IS NOT NULL AND auth.uid() <> v_target THEN
    RETURN jsonb_build_object('success', false, 'error', 'Convite não pertence a esta sessão.');
  END IF;

  v_clinica_id := v_invite.clinica_id;

  SELECT * INTO v_func FROM public.funcionarios WHERE id = v_invite.funcionario_id;

  IF v_clinica_id IS NULL AND v_func.clinica_id IS NOT NULL THEN
    v_clinica_id := v_func.clinica_id;
  END IF;

  UPDATE public.employee_invitations
  SET status = 'accepted', accepted_at = now()
  WHERE id = v_invite.id;

  UPDATE public.funcionarios
  SET user_id = v_target
  WHERE id = v_invite.funcionario_id;

  IF v_clinica_id IS NOT NULL THEN
    -- Autoriza a trava de C1 apenas dentro desta transação
    PERFORM set_config('elolab.allow_clinica_change', 'on', true);
    UPDATE public.profiles
    SET clinica_id = v_clinica_id
    WHERE id = v_target;
    PERFORM set_config('elolab.allow_clinica_change', 'off', true);
  END IF;

  IF array_length(v_invite.roles, 1) > 0 THEN
    INSERT INTO public.user_roles (user_id, role)
    SELECT v_target, unnest(v_invite.roles)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  IF 'medico' = ANY(v_invite.roles) THEN
    INSERT INTO public.medicos (nome, email, crm, user_id, ativo, clinica_id)
    VALUES (
      COALESCE(v_func.nome, 'Médico'),
      COALESCE(v_func.email, ''),
      'PENDENTE',
      v_target,
      true,
      v_clinica_id
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object('success', true, 'clinica_id', v_clinica_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_employee_invitation(text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.accept_employee_invitation(text, uuid) TO anon, authenticated;

-- ============================================================================
-- C4 — Catálogo de planos e assinaturas
-- ============================================================================

-- C4.1 — planos é catálogo GLOBAL (não tem clinica_id).
-- Antes: FOR ALL USING (is_admin(auth.uid())) — como todo cadastro público vira
-- admin, qualquer cliente podia alterar ou apagar os planos da plataforma.

DROP POLICY IF EXISTS "planos_admin"          ON public.planos;
DROP POLICY IF EXISTS "planos_platform_admin" ON public.planos;

CREATE POLICY "planos_platform_admin" ON public.planos
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- C4.2 — assinaturas_plano
-- Antes: INSERT WITH CHECK (is_admin(...) OR user_id = auth.uid()) permitia que
-- o próprio usuário criasse a assinatura com status 'ativa' sem pagar.
-- Escrita agora é exclusiva do platform admin; o webhook do MercadoPago usa
-- service_role, que não passa por RLS.

DROP POLICY IF EXISTS "assinatura_insert" ON public.assinaturas_plano;
DROP POLICY IF EXISTS "assinatura_update" ON public.assinaturas_plano;
DROP POLICY IF EXISTS "assinatura_delete" ON public.assinaturas_plano;

CREATE POLICY "assinatura_insert" ON public.assinaturas_plano
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "assinatura_update" ON public.assinaturas_plano
  FOR UPDATE TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "assinatura_delete" ON public.assinaturas_plano
  FOR DELETE TO authenticated
  USING (public.is_platform_admin());

-- SELECT permanece como estava: o usuário vê a própria assinatura.

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO (rode depois, fora da transação)
-- ============================================================================
-- SELECT tablename, policyname, cmd, qual
--   FROM pg_policies
--  WHERE schemaname = 'public'
--    AND tablename IN ('profiles','planos','assinaturas_plano')
--  ORDER BY tablename, policyname;
--
-- SELECT policyname, qual FROM pg_policies WHERE schemaname = 'storage';
--
-- -- O e-mail que usa /painel-admin precisa estar aqui, senão a tela para de
-- -- salvar alterações de assinatura (C4.2):
-- SELECT pa.user_id, p.email, pa.nivel, pa.ativo
--   FROM public.platform_admins pa
--   JOIN public.profiles p ON p.id = pa.user_id;
