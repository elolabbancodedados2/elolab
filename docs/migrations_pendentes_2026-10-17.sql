-- ================================================================
-- MIGRAÇÕES PENDENTES - EloLab (v4)
-- Gerado em: 2026-10-17 16:38
--
-- CREATE TABLE/INDEX: IF NOT EXISTS
-- CREATE POLICY/TRIGGER: DROP IF EXISTS antes
-- INSERT backfill: ON CONFLICT DO NOTHING
-- ================================================================


-- ----------------------------------------------------------------
-- 20261014100000_motivo_cancelamento_agendamento
-- ----------------------------------------------------------------
BEGIN;

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS motivo_cancelamento text;

COMMENT ON COLUMN public.agendamentos.motivo_cancelamento IS
  'Categoria administrativa do cancelamento; não registrar informação clínica neste campo.';

CREATE OR REPLACE FUNCTION public.cancelar_agendamento_com_motivo(
  p_agendamento_id uuid,
  p_clinica_id uuid,
  p_updated_at timestamptz,
  p_motivo_cancelamento text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agendamento public.agendamentos%rowtype;
  v_fila_removida integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_same_clinica(p_clinica_id) THEN
    RAISE EXCEPTION 'Sem permissao para atualizar esta consulta.' USING ERRCODE = '42501';
  END IF;

  IF p_motivo_cancelamento IS NULL OR p_motivo_cancelamento NOT IN (
    'solicitacao_paciente', 'indisponibilidade_profissional', 'conflito_horario',
    'ajuste_administrativo', 'outro'
  ) THEN
    RAISE EXCEPTION 'Motivo de cancelamento invalido.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_agendamento
    FROM public.agendamentos
   WHERE id = p_agendamento_id
     AND clinica_id = p_clinica_id
     AND updated_at IS NOT DISTINCT FROM p_updated_at
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('atualizado', false, 'fila_removida', 0);
  END IF;

  IF NOT (
    public.can_manage_data(auth.uid())
    OR public.is_enfermagem(auth.uid())
    OR (public.is_medico(auth.uid()) AND public.is_medico_da_agenda(v_agendamento.medico_id))
  ) THEN
    RAISE EXCEPTION 'Sem permissao para atualizar esta consulta.' USING ERRCODE = '42501';
  END IF;

  IF v_agendamento.status::text NOT IN (
    'agendado', 'confirmado', 'aguardando', 'aguardando_triagem', 'em_triagem'
  ) THEN
    RETURN jsonb_build_object('atualizado', false, 'fila_removida', 0);
  END IF;

  DELETE FROM public.fila_atendimento
   WHERE agendamento_id = p_agendamento_id
     AND clinica_id = p_clinica_id
     AND status <> 'finalizado';
  GET DIAGNOSTICS v_fila_removida = ROW_COUNT;

  UPDATE public.agendamentos
     SET status = 'cancelado'::public.status_agendamento,
         motivo_cancelamento = p_motivo_cancelamento
   WHERE id = p_agendamento_id
     AND clinica_id = p_clinica_id;

  RETURN jsonb_build_object('atualizado', true, 'fila_removida', v_fila_removida);
END;
$$;

REVOKE ALL ON FUNCTION public.cancelar_agendamento_com_motivo(uuid, uuid, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_agendamento_com_motivo(uuid, uuid, timestamptz, text) TO authenticated;

COMMIT;

INSERT INTO supabase_migrations.schema_migrations (version)
  VALUES ('20261014100000') ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------
-- 20261014100500_sessoes_proprias_por_conta
-- ----------------------------------------------------------------
-- Metadados mínimos para a área de segurança da própria conta.
-- Tokens e endereços IP não são armazenados nesta tabela.
CREATE TABLE IF NOT EXISTS public.account_session_activity (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES auth.sessions(id) ON DELETE CASCADE,
  user_agent text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  last_activity_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (user_id, session_id)
);

ALTER TABLE public.account_session_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_session_activity FROM anon, authenticated;

COMMENT ON TABLE public.account_session_activity IS
  'Metadados mínimos por sessão para o titular consultar seus próprios dispositivos e atividade.';

CREATE OR REPLACE FUNCTION public.touch_my_account_session(p_user_agent text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_session_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sessão autenticada necessária.' USING ERRCODE = '42501';
  END IF;

  v_session_id := NULLIF(auth.jwt() ->> 'session_id', '')::uuid;
  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'Identificador de sessão ausente.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.sessions AS auth_session
    WHERE auth_session.id = v_session_id
      AND auth_session.user_id = v_user_id
      AND (auth_session.not_after IS NULL OR auth_session.not_after > statement_timestamp())
  ) THEN
    RAISE EXCEPTION 'Sessão não está ativa.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.account_session_activity AS activity
  WHERE activity.user_id = v_user_id
    AND NOT EXISTS (
      SELECT 1
      FROM auth.sessions AS auth_session
      WHERE auth_session.id = activity.session_id
        AND auth_session.user_id = v_user_id
        AND (auth_session.not_after IS NULL OR auth_session.not_after > statement_timestamp())
    );

  INSERT INTO public.account_session_activity (
    user_id,
    session_id,
    user_agent,
    created_at,
    last_activity_at
  ) VALUES (
    v_user_id,
    v_session_id,
    LEFT(REGEXP_REPLACE(COALESCE(p_user_agent, ''), '[[:cntrl:]]', '', 'g'), 500),
    statement_timestamp(),
    statement_timestamp()
  )
  ON CONFLICT (user_id, session_id) DO UPDATE
  SET user_agent = EXCLUDED.user_agent,
      last_activity_at = statement_timestamp();
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_account_sessions()
RETURNS TABLE (
  session_id uuid,
  created_at timestamptz,
  last_activity_at timestamptz,
  user_agent text,
  is_current boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    auth_session.id AS session_id,
    COALESCE(activity.created_at, auth_session.created_at) AS created_at,
    COALESCE(activity.last_activity_at, auth_session.refreshed_at, auth_session.updated_at, auth_session.created_at) AS last_activity_at,
    COALESCE(activity.user_agent, auth_session.user_agent, '') AS user_agent,
    auth_session.id = NULLIF(auth.jwt() ->> 'session_id', '')::uuid AS is_current
  FROM auth.sessions AS auth_session
  LEFT JOIN public.account_session_activity AS activity
    ON activity.session_id = auth_session.id
   AND activity.user_id = auth_session.user_id
  WHERE auth_session.user_id = auth.uid()
    AND (auth_session.not_after IS NULL OR auth_session.not_after > statement_timestamp())
  ORDER BY is_current DESC,
    COALESCE(activity.last_activity_at, auth_session.refreshed_at, auth_session.updated_at, auth_session.created_at) DESC;
$$;

REVOKE ALL ON FUNCTION public.touch_my_account_session(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_my_account_session(text) TO authenticated;
REVOKE ALL ON FUNCTION public.list_my_account_sessions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_account_sessions() TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version)
  VALUES ('20261014100500') ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------
-- 20261014110000_preparo_consulta_no_portal
-- ----------------------------------------------------------------
BEGIN;

ALTER TABLE public.tipos_consulta
  ADD COLUMN IF NOT EXISTS instrucoes_preparo text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.tipos_consulta'::regclass
       AND conname = 'tipos_consulta_instrucoes_preparo_limite'
  ) THEN
    ALTER TABLE public.tipos_consulta
      ADD CONSTRAINT tipos_consulta_instrucoes_preparo_limite
      CHECK (instrucoes_preparo IS NULL OR char_length(instrucoes_preparo) <= 2000);
  END IF;
END;
$$;

COMMENT ON COLUMN public.tipos_consulta.instrucoes_preparo IS
  'Orientação administrativa de preparo, mostrada apenas ao próprio paciente em consultas futuras ativas no portal.';

COMMIT;

INSERT INTO supabase_migrations.schema_migrations (version)
  VALUES ('20261014110000') ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------
-- 20261014110500_revogar_sessoes_ao_inativar_funcionario
-- ----------------------------------------------------------------
-- Inativar um funcionÃ¡rio remove os papÃ©is e tambÃ©m encerra as sessÃµes Auth.
-- O JWT jÃ¡ emitido pode continuar vÃ¡lido atÃ© expirar; novas renovaÃ§Ãµes falham.
BEGIN;

CREATE OR REPLACE FUNCTION public.sync_employee_roles(
  _funcionario_id uuid,
  _user_id uuid,
  _roles public.app_role[],
  _ativo boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_clinica_id uuid := public.get_my_clinica_id();
  v_existing_user_id uuid;
  v_user_id uuid;
  v_roles public.app_role[] := COALESCE(_roles, ARRAY[]::public.app_role[]);
  v_manter_admin boolean;
  v_admin_count integer;
BEGIN
  IF auth.uid() IS NULL OR v_clinica_id IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas um administrador da clÃ­nica pode alterar os papÃ©is.';
  END IF;
  IF _ativo IS NULL THEN
    RAISE EXCEPTION 'O estado do funcionÃ¡rio Ã© obrigatÃ³rio.';
  END IF;

  PERFORM 1 FROM public.clinicas WHERE id = v_clinica_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ClÃ­nica nÃ£o encontrada.';
  END IF;

  SELECT f.user_id INTO v_existing_user_id
    FROM public.funcionarios f
   WHERE f.id = _funcionario_id AND f.clinica_id = v_clinica_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FuncionÃ¡rio nÃ£o encontrado nesta clÃ­nica.';
  END IF;

  IF v_existing_user_id IS NOT NULL AND _user_id IS NOT NULL AND v_existing_user_id <> _user_id THEN
    RAISE EXCEPTION 'Este funcionÃ¡rio jÃ¡ estÃ¡ vinculado a outra conta.';
  END IF;
  v_user_id := COALESCE(_user_id, v_existing_user_id);

  IF v_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = v_user_id AND p.clinica_id = v_clinica_id
  ) THEN
    RAISE EXCEPTION 'A conta vinculada nÃ£o pertence a esta clÃ­nica.';
  END IF;

  IF v_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.funcionarios f
     WHERE f.user_id = v_user_id AND f.clinica_id = v_clinica_id AND f.id <> _funcionario_id
  ) THEN
    RAISE EXCEPTION 'Esta conta jÃ¡ estÃ¡ vinculada a outro funcionÃ¡rio.';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_roles) AS requested(role) WHERE requested.role IS NULL) THEN
    RAISE EXCEPTION 'A lista de papÃ©is contÃ©m um valor invÃ¡lido.';
  END IF;

  v_manter_admin := _ativo AND ('admin'::public.app_role = ANY(v_roles));
  IF v_user_id IS NOT NULL AND public.has_role(v_user_id, 'admin'::public.app_role) AND NOT v_manter_admin THEN
    IF v_user_id = auth.uid() THEN
      RAISE EXCEPTION 'NÃ£o Ã© permitido remover o prÃ³prio acesso de administrador.';
    END IF;
    SELECT count(*) INTO v_admin_count
      FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.id
     WHERE p.clinica_id = v_clinica_id AND ur.role = 'admin'::public.app_role;
    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'A clÃ­nica precisa manter pelo menos um administrador ativo.';
    END IF;
  END IF;

  UPDATE public.funcionarios
     SET user_id = v_user_id, pending_roles = v_roles, ativo = _ativo
   WHERE id = _funcionario_id AND clinica_id = v_clinica_id;

  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.user_roles WHERE user_id = v_user_id;
  IF _ativo THEN
    INSERT INTO public.user_roles (user_id, role, assigned_by)
    SELECT v_user_id, requested.role, auth.uid()
      FROM (SELECT DISTINCT role FROM unnest(v_roles) AS requested(role)) requested
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    -- A revogaÃ§Ã£o efetiva das sessÃµes e dos refresh tokens fica na mesma
    -- transaÃ§Ã£o que a remoÃ§Ã£o dos papÃ©is. A funÃ§Ã£o auxiliar sÃ³ aceita service_role
    -- diretamente; esta RPC SECURITY DEFINER a chama internamente como owner.
    PERFORM public.admin_encerrar_sessoes(v_user_id);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_employee_roles(uuid, uuid, public.app_role[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_employee_roles(uuid, uuid, public.app_role[], boolean) TO authenticated;

COMMIT;

INSERT INTO supabase_migrations.schema_migrations (version)
  VALUES ('20261014110500') ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------
-- 20261014120000_concorrencia_edicao_funcionario
-- ----------------------------------------------------------------
-- Compare-and-set para impedir que edições abertas em versões antigas
-- sobrescrevam dados e papéis salvos por outro administrador.
BEGIN;

ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS edit_version bigint NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.increment_funcionario_edit_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  NEW.edit_version := OLD.edit_version + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS increment_funcionario_edit_version ON public.funcionarios;
DROP TRIGGER IF EXISTS increment_funcionario_edit_version ON public.funcionarios;
CREATE TRIGGER increment_funcionario_edit_version
BEFORE UPDATE ON public.funcionarios
FOR EACH ROW
EXECUTE FUNCTION public.increment_funcionario_edit_version();

REVOKE ALL ON FUNCTION public.increment_funcionario_edit_version() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sync_employee_roles_if_unchanged(
  _funcionario_id uuid,
  _user_id uuid,
  _roles public.app_role[],
  _ativo boolean,
  _expected_version bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_clinica_id uuid := public.get_my_clinica_id();
  v_existing_user_id uuid;
  v_user_id uuid;
  v_roles public.app_role[] := COALESCE(_roles, ARRAY[]::public.app_role[]);
  v_manter_admin boolean;
  v_admin_count integer;
  v_current_version bigint;
BEGIN
  IF auth.uid() IS NULL OR v_clinica_id IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas um administrador da clínica pode alterar os papéis.';
  END IF;
  IF _ativo IS NULL OR _expected_version IS NULL THEN
    RAISE EXCEPTION 'Estado e versão do funcionário são obrigatórios.';
  END IF;

  PERFORM 1 FROM public.clinicas WHERE id = v_clinica_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clínica não encontrada.';
  END IF;

  SELECT f.user_id, f.edit_version
    INTO v_existing_user_id, v_current_version
    FROM public.funcionarios f
   WHERE f.id = _funcionario_id AND f.clinica_id = v_clinica_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Funcionário não encontrado nesta clínica.';
  END IF;
  IF v_current_version IS DISTINCT FROM _expected_version THEN
    RAISE EXCEPTION 'Outra pessoa alterou esta ficha. Atualize a lista e reabra a edição antes de salvar.'
      USING ERRCODE = '40001';
  END IF;

  IF v_existing_user_id IS NOT NULL AND _user_id IS NOT NULL AND v_existing_user_id <> _user_id THEN
    RAISE EXCEPTION 'Este funcionário já está vinculado a outra conta.';
  END IF;
  v_user_id := COALESCE(_user_id, v_existing_user_id);

  IF v_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = v_user_id AND p.clinica_id = v_clinica_id
  ) THEN
    RAISE EXCEPTION 'A conta vinculada não pertence a esta clínica.';
  END IF;

  IF v_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.funcionarios f
     WHERE f.user_id = v_user_id AND f.clinica_id = v_clinica_id AND f.id <> _funcionario_id
  ) THEN
    RAISE EXCEPTION 'Esta conta já está vinculada a outro funcionário.';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_roles) AS requested(role) WHERE requested.role IS NULL) THEN
    RAISE EXCEPTION 'A lista de papéis contém um valor inválido.';
  END IF;

  v_manter_admin := _ativo AND ('admin'::public.app_role = ANY(v_roles));
  IF v_user_id IS NOT NULL AND public.has_role(v_user_id, 'admin'::public.app_role) AND NOT v_manter_admin THEN
    IF v_user_id = auth.uid() THEN
      RAISE EXCEPTION 'Não é permitido remover o próprio acesso de administrador.';
    END IF;
    SELECT count(*) INTO v_admin_count
      FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.id
     WHERE p.clinica_id = v_clinica_id AND ur.role = 'admin'::public.app_role;
    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'A clínica precisa manter pelo menos um administrador ativo.';
    END IF;
  END IF;

  UPDATE public.funcionarios
     SET user_id = v_user_id, pending_roles = v_roles, ativo = _ativo
   WHERE id = _funcionario_id AND clinica_id = v_clinica_id;

  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.user_roles WHERE user_id = v_user_id;
  IF _ativo THEN
    INSERT INTO public.user_roles (user_id, role, assigned_by)
    SELECT v_user_id, requested.role, auth.uid()
      FROM (SELECT DISTINCT role FROM unnest(v_roles) AS requested(role)) requested
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    PERFORM public.admin_encerrar_sessoes(v_user_id);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_employee_roles_if_unchanged(uuid, uuid, public.app_role[], boolean, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_employee_roles_if_unchanged(uuid, uuid, public.app_role[], boolean, bigint) TO authenticated;

COMMENT ON FUNCTION public.sync_employee_roles_if_unchanged(uuid, uuid, public.app_role[], boolean, bigint) IS
  'Sincroniza papéis do funcionário somente se a versão da ficha continuar igual à observada na edição.';

COMMIT;

INSERT INTO supabase_migrations.schema_migrations (version)
  VALUES ('20261014120000') ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------
-- 20261014120500_historico_saida_fila
-- ----------------------------------------------------------------
BEGIN;

CREATE TABLE IF NOT EXISTS public.fila_atendimento_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  fila_id uuid NOT NULL,
  agendamento_id uuid REFERENCES public.agendamentos(id) ON DELETE SET NULL,
  paciente_id uuid REFERENCES public.pacientes(id) ON DELETE SET NULL,
  motivo text NOT NULL CHECK (motivo IN (
    'paciente_desistiu', 'encaminhado_outro_setor', 'duplicidade_atendimento',
    'ajuste_operacional', 'outro'
  )),
  removido_por uuid NOT NULL,
  ocorreu_em timestamptz NOT NULL DEFAULT now(),
  atendimento_reaberto boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS fila_atendimento_eventos_clinica_data_idx
  ON public.fila_atendimento_eventos (clinica_id, ocorreu_em DESC);

ALTER TABLE public.fila_atendimento_eventos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fila_atendimento_eventos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fila_atendimento_eventos TO authenticated;
DROP POLICY IF EXISTS fila_atendimento_eventos_select ON public.fila_atendimento_eventos;
CREATE POLICY fila_atendimento_eventos_select ON public.fila_atendimento_eventos
  FOR SELECT TO authenticated
  USING (public.can_manage_data(auth.uid()) AND public.is_same_clinica(clinica_id));

CREATE OR REPLACE FUNCTION public.remover_item_fila_com_motivo(
  p_fila_id uuid,
  p_status_esperado text,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica_id uuid;
  v_agendamento_id uuid;
  v_paciente_id uuid;
  v_resultado jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_data(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissao para remover itens da fila.' USING ERRCODE = '42501';
  END IF;

  v_clinica_id := public.get_my_clinica_id();
  IF v_clinica_id IS NULL OR NOT public.is_same_clinica(v_clinica_id) THEN
    RAISE EXCEPTION 'Clinica nao identificada.' USING ERRCODE = '42501';
  END IF;

  IF p_motivo IS NULL OR p_motivo NOT IN (
    'paciente_desistiu', 'encaminhado_outro_setor', 'duplicidade_atendimento',
    'ajuste_operacional', 'outro'
  ) THEN
    RAISE EXCEPTION 'Motivo de saida da fila invalido.' USING ERRCODE = '22023';
  END IF;

  -- Preserve the same lock order as the atomic removal RPC: appointment, then queue row.
  SELECT agendamento_id INTO v_agendamento_id
    FROM public.fila_atendimento
   WHERE id = p_fila_id
     AND clinica_id = v_clinica_id
     AND status::text = p_status_esperado;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('removido', false, 'atendimento_reaberto', false);
  END IF;

  SELECT paciente_id INTO v_paciente_id
    FROM public.agendamentos
   WHERE id = v_agendamento_id
     AND clinica_id = v_clinica_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento nao encontrado nesta clinica.' USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1
    FROM public.fila_atendimento
   WHERE id = p_fila_id
     AND agendamento_id = v_agendamento_id
     AND clinica_id = v_clinica_id
     AND status::text = p_status_esperado
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('removido', false, 'atendimento_reaberto', false);
  END IF;

  v_resultado := public.remover_item_fila_atomico(p_fila_id, p_status_esperado);
  IF COALESCE((v_resultado->>'removido')::boolean, false) THEN
    INSERT INTO public.fila_atendimento_eventos (
      clinica_id, fila_id, agendamento_id, paciente_id, motivo, removido_por,
      atendimento_reaberto
    ) VALUES (
      v_clinica_id, p_fila_id, v_agendamento_id, v_paciente_id, p_motivo,
      auth.uid(), COALESCE((v_resultado->>'atendimento_reaberto')::boolean, false)
    );
  END IF;

  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.remover_item_fila_com_motivo(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remover_item_fila_com_motivo(uuid, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.remover_item_fila_atomico(uuid, text) FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.fila_atendimento_eventos IS
  'Trilha clínica-administrativa de saídas da fila; eventos gravados apenas pela RPC atômica.';

COMMIT;

INSERT INTO supabase_migrations.schema_migrations (version)
  VALUES ('20261014120500') ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------
-- 20261014130000_preferencias_canal_e_janela_lembretes
-- ----------------------------------------------------------------
ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS preferencia_canal_lembrete text NOT NULL DEFAULT 'ambos',
  ADD COLUMN IF NOT EXISTS horario_contato_inicio time NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS horario_contato_fim time NOT NULL DEFAULT '20:00',
  ADD COLUMN IF NOT EXISTS fuso_horario_contato text NOT NULL DEFAULT 'America/Sao_Paulo';

ALTER TABLE public.pacientes
  DROP CONSTRAINT IF EXISTS pacientes_preferencia_canal_lembrete_check,
  ADD CONSTRAINT pacientes_preferencia_canal_lembrete_check
    CHECK (preferencia_canal_lembrete IN ('ambos', 'email', 'whatsapp', 'nenhum')),
  DROP CONSTRAINT IF EXISTS pacientes_janela_contato_valida_check,
  ADD CONSTRAINT pacientes_janela_contato_valida_check
    CHECK (horario_contato_inicio <> horario_contato_fim),
  DROP CONSTRAINT IF EXISTS pacientes_fuso_horario_contato_check,
  ADD CONSTRAINT pacientes_fuso_horario_contato_check
    CHECK (fuso_horario_contato IN (
      'America/Noronha', 'America/Manaus', 'America/Rio_Branco', 'America/Sao_Paulo'
    ));

COMMENT ON COLUMN public.pacientes.preferencia_canal_lembrete IS
  'Canais permitidos para lembretes de consulta: ambos, email, whatsapp ou nenhum.';
COMMENT ON COLUMN public.pacientes.horario_contato_inicio IS
  'Início inclusivo da janela local permitida para lembretes de consulta.';
COMMENT ON COLUMN public.pacientes.horario_contato_fim IS
  'Fim exclusivo da janela local permitida para lembretes de consulta.';

INSERT INTO supabase_migrations.schema_migrations (version)
  VALUES ('20261014130000') ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------
-- 20261014130500_revisao_duplicidade_paciente
-- ----------------------------------------------------------------
BEGIN;

CREATE OR REPLACE FUNCTION public.normalizar_telefone_revisao(p_telefone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  WITH digits AS (
    SELECT regexp_replace(COALESCE(p_telefone, ''), '[^0-9]', '', 'g') AS value
  )
  SELECT CASE
    WHEN char_length(value) IN (12, 13) AND left(value, 2) = '55' THEN substr(value, 3)
    ELSE value
  END
  FROM digits;
$$;
REVOKE ALL ON FUNCTION public.normalizar_telefone_revisao(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.buscar_possiveis_duplicidades_paciente(
  p_nome text,
  p_data_nascimento date,
  p_telefone text,
  p_excluir uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  nome text,
  nome_social text,
  data_nascimento date,
  telefone_final text,
  motivos text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica_id uuid;
  v_nome_normalizado text;
  v_telefone_normalizado text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_data(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissao para revisar cadastros.' USING ERRCODE = '42501';
  END IF;

  v_clinica_id := public.get_my_clinica_id();
  IF v_clinica_id IS NULL OR NOT public.is_same_clinica(v_clinica_id) THEN
    RAISE EXCEPTION 'Clinica nao identificada.' USING ERRCODE = '42501';
  END IF;

  v_nome_normalizado := regexp_replace(
    translate(lower(btrim(COALESCE(p_nome, ''))),
      'áàâãäéèêëíìîïóòôõöúùûüç',
      'aaaaaeeeeiiiiooooouuuuc'),
    '[^a-z0-9]', '', 'g'
  );
  v_telefone_normalizado := public.normalizar_telefone_revisao(p_telefone);

  IF char_length(v_nome_normalizado) < 3 AND char_length(v_telefone_normalizado) < 10 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.nome,
    p.nome_social,
    p.data_nascimento,
    CASE
      WHEN char_length(public.normalizar_telefone_revisao(p.telefone)) > 4
      THEN right(public.normalizar_telefone_revisao(p.telefone), 4)
      ELSE NULL
    END AS telefone_final,
    array_remove(ARRAY[
      CASE WHEN char_length(v_telefone_normalizado) >= 10
        AND public.normalizar_telefone_revisao(p.telefone) = v_telefone_normalizado
        THEN 'telefone'::text END,
      CASE WHEN p_data_nascimento IS NOT NULL
        AND p.data_nascimento = p_data_nascimento
        AND regexp_replace(
          translate(lower(btrim(COALESCE(p.nome, ''))),
            'áàâãäéèêëíìîïóòôõöúùûüç',
            'aaaaaeeeeiiiiooooouuuuc'),
          '[^a-z0-9]', '', 'g'
        ) = v_nome_normalizado
        THEN 'nome_data_nascimento'::text END
    ], NULL) AS motivos
  FROM public.pacientes p
  WHERE p.clinica_id = v_clinica_id
    AND (p_excluir IS NULL OR p.id <> p_excluir)
    AND (
      (char_length(v_telefone_normalizado) >= 10
        AND public.normalizar_telefone_revisao(p.telefone) = v_telefone_normalizado)
      OR (
        p_data_nascimento IS NOT NULL
        AND p.data_nascimento = p_data_nascimento
        AND regexp_replace(
          translate(lower(btrim(COALESCE(p.nome, ''))),
            'áàâãäéèêëíìîïóòôõöúùûüç',
            'aaaaaeeeeiiiiooooouuuuc'),
          '[^a-z0-9]', '', 'g'
        ) = v_nome_normalizado
      )
    )
  ORDER BY
    CASE WHEN char_length(v_telefone_normalizado) >= 10
      AND public.normalizar_telefone_revisao(p.telefone) = v_telefone_normalizado
      THEN 0 ELSE 1 END,
    p.nome
  LIMIT 5;
END;
$$;

REVOKE ALL ON FUNCTION public.buscar_possiveis_duplicidades_paciente(text, date, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_possiveis_duplicidades_paciente(text, date, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.buscar_possiveis_duplicidades_paciente(text, date, text, uuid) IS
  'Retorna até cinco cadastros parecidos apenas da clínica atual para revisão humana; nunca mescla registros.';

COMMIT;

INSERT INTO supabase_migrations.schema_migrations (version)
  VALUES ('20261014130500') ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------
-- 20261014140000_alertas_webhook_comunicacao
-- ----------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS notification_queue_webhook_alert_hour_uidx
  ON public.notification_queue (
    clinica_id,
    (dados_extras ->> 'codigo_alerta'),
    (dados_extras ->> 'janela_alerta')
  )
  WHERE status = 'erro'
    AND dados_extras ? 'codigo_alerta'
    AND dados_extras ? 'janela_alerta';

CREATE OR REPLACE FUNCTION public.registrar_alerta_webhook_comunicacao(
  p_clinica_id uuid,
  p_codigo text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_bucket text := to_char(date_trunc('hour', now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24"Z"');
BEGIN
  IF p_clinica_id IS NULL OR p_codigo <> 'webhook_whatsapp_processing_failed' THEN
    RAISE EXCEPTION 'invalid communication alert';
  END IF;

  INSERT INTO public.notification_queue (
    tipo, assunto, conteudo, status, tentativas, max_tentativas,
    erro_mensagem, agendado_para, clinica_id, dados_extras
  ) VALUES (
    'email',
    'Falha no webhook WhatsApp',
    'Uma falha técnica interrompeu o processamento de um evento de comunicação. Verifique a sessão e a configuração da integração da clínica.',
    'erro', 0, 1,
    'Webhook de comunicação com falha. Código técnico: webhook_whatsapp_processing_failed.',
    now(), p_clinica_id,
    jsonb_build_object(
      'codigo_alerta', p_codigo,
      'janela_alerta', v_bucket
    )
  )
  ON CONFLICT (
    clinica_id,
    (dados_extras ->> 'codigo_alerta'),
    (dados_extras ->> 'janela_alerta')
  )
  WHERE status = 'erro'
    AND dados_extras ? 'codigo_alerta'
    AND dados_extras ? 'janela_alerta'
  DO UPDATE SET
    updated_at = now(),
    erro_mensagem = EXCLUDED.erro_mensagem,
    conteudo = EXCLUDED.conteudo
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_alerta_webhook_comunicacao(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_alerta_webhook_comunicacao(uuid, text)
  TO service_role;

COMMENT ON FUNCTION public.registrar_alerta_webhook_comunicacao(uuid, text) IS
  'Cria alerta técnico sem dados pessoais, deduplicado por clínica e hora; somente service_role pode chamá-lo.';

INSERT INTO supabase_migrations.schema_migrations (version)
  VALUES ('20261014140000') ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------
-- 20261014140500_revogar_links_portal_paciente
-- ----------------------------------------------------------------
BEGIN;

CREATE OR REPLACE FUNCTION public.revogar_links_portal_paciente(p_paciente_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_clinica_id uuid;
  v_revogados integer;
BEGIN
  IF v_user_id IS NULL OR NOT public.can_manage_data(v_user_id) THEN
    RAISE EXCEPTION 'Sem permissão para revogar o acesso ao portal.'
      USING ERRCODE = '42501';
  END IF;

  v_clinica_id := public.get_my_clinica_id();
  IF v_clinica_id IS NULL THEN
    RAISE EXCEPTION 'Perfil sem clínica vinculada.'
      USING ERRCODE = '42501';
  END IF;

  -- Serializa revogação e emissão para que um link recém-gerado não escape da ação.
  PERFORM 1
    FROM public.pacientes p
   WHERE p.id = p_paciente_id
     AND p.clinica_id = v_clinica_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paciente não encontrado nesta clínica.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.paciente_portal_tokens t
     SET ativo = false
   WHERE t.paciente_id = p_paciente_id
     AND t.clinica_id = v_clinica_id
     AND t.ativo = true;

  GET DIAGNOSTICS v_revogados = ROW_COUNT;
  RETURN v_revogados;
END;
$$;

REVOKE ALL ON FUNCTION public.revogar_links_portal_paciente(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revogar_links_portal_paciente(uuid) TO authenticated;

COMMENT ON FUNCTION public.revogar_links_portal_paciente(uuid) IS
  'Invalida links ativos do Portal do Paciente para uma ficha da clínica do usuário e retorna a quantidade revogada.';

COMMIT;

INSERT INTO supabase_migrations.schema_migrations (version)
  VALUES ('20261014140500') ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------
-- 20261014150000_historico_versoes_templates_comunicacao
-- ----------------------------------------------------------------
-- Snapshots imutáveis dos modelos de comunicação, com autoria definida no banco.
CREATE TABLE IF NOT EXISTS public.notification_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL,
  clinica_id uuid REFERENCES public.clinicas(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),
  action text NOT NULL CHECK (action IN ('baseline', 'created', 'updated', 'deleted')),
  snapshot jsonb NOT NULL,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text,
  actor_type text NOT NULL CHECK (actor_type IN ('user', 'system', 'legacy')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, revision)
);

CREATE INDEX IF NOT EXISTS notification_template_versions_clinic_template_idx
  ON public.notification_template_versions (clinica_id, template_id, revision DESC);

ALTER TABLE public.notification_template_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_template_versions_admin_read ON public.notification_template_versions;
CREATE POLICY notification_template_versions_admin_read
  ON public.notification_template_versions
  FOR SELECT TO authenticated
  USING (
    clinica_id IS NOT NULL
    AND public.is_admin(auth.uid())
    AND public.is_same_clinica(clinica_id)
  );

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.notification_template_versions FROM anon, authenticated;
GRANT SELECT ON public.notification_template_versions TO authenticated;

-- O estado atual vira baseline, sem atribuição retroativa de autoria.
INSERT INTO public.notification_template_versions (
  template_id, clinica_id, revision, action, snapshot, actor_type
)
SELECT
  id,
  clinica_id,
  1,
  'baseline',
  to_jsonb(template),
  'legacy'
FROM public.notification_templates AS template
ON CONFLICT (template_id, revision) DO NOTHING;

CREATE OR REPLACE FUNCTION public.capture_notification_template_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_template_id uuid;
  v_clinica_id uuid;
  v_snapshot jsonb;
  v_revision integer;
  v_author_id uuid := auth.uid();
  v_author_name text;
  v_action text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - 'updated_at') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_template_id := OLD.id;
    v_clinica_id := OLD.clinica_id;
    v_snapshot := to_jsonb(OLD);
    v_action := 'deleted';
  ELSIF TG_OP = 'INSERT' THEN
    v_template_id := NEW.id;
    v_clinica_id := NEW.clinica_id;
    v_snapshot := to_jsonb(NEW);
    v_action := 'created';
  ELSE
    v_template_id := NEW.id;
    v_clinica_id := NEW.clinica_id;
    v_snapshot := to_jsonb(NEW);
    v_action := 'updated';
  END IF;

  SELECT COALESCE(MAX(version.revision), 0) + 1
    INTO v_revision
    FROM public.notification_template_versions AS version
   WHERE version.template_id = v_template_id;

  IF v_author_id IS NOT NULL THEN
    SELECT profile.nome
      INTO v_author_name
      FROM public.profiles AS profile
     WHERE profile.id = v_author_id;
  END IF;

  INSERT INTO public.notification_template_versions (
    template_id, clinica_id, revision, action, snapshot,
    author_id, author_name, actor_type
  ) VALUES (
    v_template_id, v_clinica_id, v_revision, v_action, v_snapshot,
    v_author_id, v_author_name, CASE WHEN v_author_id IS NULL THEN 'system' ELSE 'user' END
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_notification_template_version() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notification_template_version_capture ON public.notification_templates;
CREATE TRIGGER notification_template_version_capture
  AFTER INSERT OR UPDATE OR DELETE ON public.notification_templates
  FOR EACH ROW EXECUTE FUNCTION public.capture_notification_template_version();

INSERT INTO supabase_migrations.schema_migrations (version)
  VALUES ('20261014150000') ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------
-- 20261014150500_rastrear_confirmacao_de_contatos_paciente
-- ----------------------------------------------------------------
BEGIN;

ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS telefone_confirmado_em timestamptz,
  ADD COLUMN IF NOT EXISTS telefone_confirmacao_origem text CHECK (telefone_confirmacao_origem IS NULL OR telefone_confirmacao_origem IN ('paciente', 'responsavel', 'equipe')),
  ADD COLUMN IF NOT EXISTS telefone_confirmado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email_confirmado_em timestamptz,
  ADD COLUMN IF NOT EXISTS email_confirmacao_origem text CHECK (email_confirmacao_origem IS NULL OR email_confirmacao_origem IN ('paciente', 'responsavel', 'equipe')),
  ADD COLUMN IF NOT EXISTS email_confirmado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.limpar_confirmacao_contato_alterado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.telefone IS DISTINCT FROM OLD.telefone THEN
    NEW.telefone_confirmado_em := NULL;
    NEW.telefone_confirmacao_origem := NULL;
    NEW.telefone_confirmado_por := NULL;
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    NEW.email_confirmado_em := NULL;
    NEW.email_confirmacao_origem := NULL;
    NEW.email_confirmado_por := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pacientes_limpar_confirmacao_contato ON public.pacientes;
DROP TRIGGER IF EXISTS pacientes_limpar_confirmacao_contato ON public.pacientes;
CREATE TRIGGER pacientes_limpar_confirmacao_contato
  BEFORE UPDATE OF telefone, email ON public.pacientes
  FOR EACH ROW EXECUTE FUNCTION public.limpar_confirmacao_contato_alterado();

CREATE OR REPLACE FUNCTION public.registrar_confirmacao_contato_paciente(
  p_paciente_id uuid,
  p_canal text,
  p_origem text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_clinica_id uuid;
  v_paciente public.pacientes%rowtype;
  v_confirmado_em timestamptz := now();
BEGIN
  IF v_user_id IS NULL OR NOT public.can_manage_data(v_user_id) THEN
    RAISE EXCEPTION 'Sem permissão para confirmar os contatos do paciente.'
      USING ERRCODE = '42501';
  END IF;

  IF p_canal IS NULL OR p_canal NOT IN ('telefone', 'email')
     OR p_origem IS NULL OR p_origem NOT IN ('paciente', 'responsavel', 'equipe') THEN
    RAISE EXCEPTION 'Canal ou origem de confirmação inválidos.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_clinica_id := public.get_my_clinica_id();
  SELECT * INTO v_paciente
    FROM public.pacientes p
   WHERE p.id = p_paciente_id
     AND p.clinica_id = v_clinica_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paciente não encontrado nesta clínica.'
      USING ERRCODE = '42501';
  END IF;

  IF p_canal = 'telefone' THEN
    IF NULLIF(BTRIM(v_paciente.telefone), '') IS NULL THEN
      RAISE EXCEPTION 'Cadastre o telefone antes de confirmar.'
        USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.pacientes
       SET telefone_confirmado_em = v_confirmado_em,
           telefone_confirmacao_origem = p_origem,
           telefone_confirmado_por = v_user_id
     WHERE id = p_paciente_id AND clinica_id = v_clinica_id;
  ELSE
    IF NULLIF(BTRIM(v_paciente.email), '') IS NULL THEN
      RAISE EXCEPTION 'Cadastre o e-mail antes de confirmar.'
        USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.pacientes
       SET email_confirmado_em = v_confirmado_em,
           email_confirmacao_origem = p_origem,
           email_confirmado_por = v_user_id
     WHERE id = p_paciente_id AND clinica_id = v_clinica_id;
  END IF;

  RETURN jsonb_build_object('canal', p_canal, 'confirmado_em', v_confirmado_em, 'origem', p_origem, 'confirmado_por', v_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.limpar_confirmacao_contato_alterado() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_confirmacao_contato_paciente(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_confirmacao_contato_paciente(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.registrar_confirmacao_contato_paciente(uuid, text, text) IS
  'Registra quando e por qual fonte a equipe confirmou um canal de contato do paciente da clínica; alterações futuras no canal removem a confirmação.';

COMMIT;

INSERT INTO supabase_migrations.schema_migrations (version)
  VALUES ('20261014150500') ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------
-- 20261014160000_historico_configuracoes_clinica
-- ----------------------------------------------------------------
BEGIN;

CREATE TABLE IF NOT EXISTS public.configuracoes_clinica_versoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  chave text NOT NULL CHECK (chave IN ('config_clinica', 'config_impressao', 'config_seguranca')),
  valor jsonb NOT NULL CHECK (jsonb_typeof(valor) = 'object'),
  alterado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  operacao text NOT NULL DEFAULT 'salvar' CHECK (operacao IN ('inicial', 'salvar', 'restaurar')),
  restaurada_de uuid REFERENCES public.configuracoes_clinica_versoes(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS configuracoes_clinica_versoes_historico_idx
  ON public.configuracoes_clinica_versoes (clinica_id, chave, criado_em DESC);
CREATE INDEX IF NOT EXISTS configuracoes_clinica_versoes_restaurada_de_idx
  ON public.configuracoes_clinica_versoes (restaurada_de)
  WHERE restaurada_de IS NOT NULL;

ALTER TABLE public.configuracoes_clinica_versoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS configuracoes_clinica_versoes_admin_select ON public.configuracoes_clinica_versoes;
CREATE POLICY configuracoes_clinica_versoes_admin_select
  ON public.configuracoes_clinica_versoes
  FOR SELECT TO authenticated
  USING (clinica_id = public.get_my_clinica_id() AND public.is_admin(auth.uid()));

REVOKE ALL ON TABLE public.configuracoes_clinica_versoes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.configuracoes_clinica_versoes TO authenticated;

-- Estado atual vira baseline sem atribuir a alteração a um usuário que não pode ser inferido.
INSERT INTO public.configuracoes_clinica_versoes (clinica_id, chave, valor, criado_em, operacao)
SELECT c.clinica_id, c.chave, c.valor, c.updated_at, 'inicial'
  FROM public.configuracoes_clinica c
 WHERE c.clinica_id IS NOT NULL
   AND c.chave IN ('config_clinica', 'config_impressao', 'config_seguranca')
   AND jsonb_typeof(c.valor) = 'object'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.registrar_versao_configuracao_clinica()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_restaurada_de uuid := NULLIF(pg_catalog.current_setting('elolab.config_restore_version_id', true), '')::uuid;
BEGIN
  IF NEW.clinica_id IS NULL OR NEW.chave IS NULL
     OR NEW.chave NOT IN ('config_clinica', 'config_impressao', 'config_seguranca')
     OR pg_catalog.jsonb_typeof(NEW.valor) IS DISTINCT FROM 'object' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.valor IS NOT DISTINCT FROM NEW.valor THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.configuracoes_clinica_versoes
    (clinica_id, chave, valor, alterado_por, criado_em, operacao, restaurada_de)
  VALUES (
    NEW.clinica_id,
    NEW.chave,
    NEW.valor,
    auth.uid(),
    pg_catalog.clock_timestamp(),
    CASE WHEN v_restaurada_de IS NULL THEN 'salvar' ELSE 'restaurar' END,
    v_restaurada_de
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_versao_configuracao_clinica() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_registrar_versao_configuracao_clinica ON public.configuracoes_clinica;
DROP TRIGGER IF EXISTS trg_registrar_versao_configuracao_clinica ON public.configuracoes_clinica;
CREATE TRIGGER trg_registrar_versao_configuracao_clinica
  AFTER INSERT OR UPDATE OF valor ON public.configuracoes_clinica
  FOR EACH ROW EXECUTE FUNCTION public.registrar_versao_configuracao_clinica();

CREATE OR REPLACE FUNCTION public.salvar_configuracao_clinica_segura(
  p_chave text,
  p_valor jsonb,
  p_versao_esperada timestamptz
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clinica_id uuid := public.get_my_clinica_id();
  v_config_id uuid;
  v_versao_atual timestamptz;
  v_nova_versao timestamptz := clock_timestamp();
  v_encontrada boolean;
BEGIN
  IF auth.uid() IS NULL OR v_clinica_id IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas um administrador da clínica pode salvar estas configurações.';
  END IF;
  IF p_chave IS NULL OR p_chave NOT IN ('config_clinica', 'config_impressao', 'config_seguranca') THEN
    RAISE EXCEPTION 'Esta configuração não pode ser gravada por este fluxo.';
  END IF;
  IF jsonb_typeof(p_valor) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'O conteúdo da configuração é inválido.';
  END IF;
  IF p_chave = 'config_clinica' AND NULLIF(trim(p_valor->>'nomeClinica'), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o nome da clínica antes de salvar.';
  END IF;

  PERFORM 1 FROM public.clinicas WHERE id = v_clinica_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clínica não encontrada.'; END IF;

  SELECT c.id, c.updated_at INTO v_config_id, v_versao_atual
    FROM public.configuracoes_clinica c
   WHERE c.clinica_id = v_clinica_id AND c.chave = p_chave
   FOR UPDATE;
  v_encontrada := FOUND;

  IF v_encontrada THEN
    IF p_versao_esperada IS NULL OR v_versao_atual IS DISTINCT FROM p_versao_esperada THEN
      RAISE EXCEPTION 'Outra pessoa atualizou esta configuração. Recarregue a página e confira os dados antes de salvar novamente.';
    END IF;
    UPDATE public.configuracoes_clinica SET valor = p_valor, updated_at = v_nova_versao WHERE id = v_config_id;
  ELSE
    IF p_versao_esperada IS NOT NULL THEN
      RAISE EXCEPTION 'Esta configuração foi removida ou alterada. Recarregue a página antes de salvar novamente.';
    END IF;
    INSERT INTO public.configuracoes_clinica (user_id, clinica_id, chave, valor, updated_at)
    VALUES (auth.uid(), v_clinica_id, p_chave, p_valor, v_nova_versao);
  END IF;

  IF p_chave = 'config_clinica' THEN
    UPDATE public.clinicas SET nome = trim(p_valor->>'nomeClinica'), cnpj = NULLIF(trim(p_valor->>'cnpj'), '')
     WHERE id = v_clinica_id;
  END IF;

  RETURN v_nova_versao;
END;
$$;

REVOKE ALL ON FUNCTION public.salvar_configuracao_clinica_segura(text, jsonb, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_configuracao_clinica_segura(text, jsonb, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.restaurar_configuracao_clinica_versao(
  p_versao_id uuid,
  p_versao_esperada timestamptz
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clinica_id uuid := public.get_my_clinica_id();
  v_chave text;
  v_valor jsonb;
  v_config_id uuid;
  v_versao_atual timestamptz;
  v_nova_versao timestamptz := clock_timestamp();
BEGIN
  IF auth.uid() IS NULL OR v_clinica_id IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas um administrador da clínica pode restaurar configurações.';
  END IF;
  IF p_versao_esperada IS NULL THEN
    RAISE EXCEPTION 'Atualize a configuração antes de restaurar uma versão.';
  END IF;

  PERFORM 1 FROM public.clinicas WHERE id = v_clinica_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clínica não encontrada.'; END IF;

  SELECT v.chave, v.valor INTO v_chave, v_valor
    FROM public.configuracoes_clinica_versoes v
   WHERE v.id = p_versao_id AND v.clinica_id = v_clinica_id
   FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Versão indisponível para esta clínica.'; END IF;

  SELECT c.id, c.updated_at INTO v_config_id, v_versao_atual
    FROM public.configuracoes_clinica c
   WHERE c.clinica_id = v_clinica_id AND c.chave = v_chave
   FOR UPDATE;
  IF NOT FOUND OR v_versao_atual IS DISTINCT FROM p_versao_esperada THEN
    RAISE EXCEPTION 'Outra pessoa atualizou esta configuração. Recarregue e compare novamente.';
  END IF;

  IF v_chave = 'config_clinica' AND NULLIF(trim(v_valor->>'nomeClinica'), '') IS NULL THEN
    RAISE EXCEPTION 'A versão selecionada não possui um nome válido para a clínica.';
  END IF;
  PERFORM pg_catalog.set_config('elolab.config_restore_version_id', p_versao_id::text, true);
  UPDATE public.configuracoes_clinica SET valor = v_valor, updated_at = v_nova_versao WHERE id = v_config_id;
  PERFORM pg_catalog.set_config('elolab.config_restore_version_id', '', true);
  IF v_chave = 'config_clinica' THEN
    UPDATE public.clinicas SET nome = trim(v_valor->>'nomeClinica'), cnpj = NULLIF(trim(v_valor->>'cnpj'), '')
     WHERE id = v_clinica_id;
  END IF;
  RETURN v_nova_versao;
END;
$$;

REVOKE ALL ON FUNCTION public.restaurar_configuracao_clinica_versao(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restaurar_configuracao_clinica_versao(uuid, timestamptz) TO authenticated;

COMMENT ON TABLE public.configuracoes_clinica_versoes IS
  'Snapshots imutáveis das configurações administrativas da clínica; restauração cria uma nova versão.';

COMMIT;

INSERT INTO supabase_migrations.schema_migrations (version)
  VALUES ('20261014160000') ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------
-- 20261014160500_scope_consentimentos_lgpd_por_clinica
-- ----------------------------------------------------------------
BEGIN;

-- Corrige consentimentos legados que ficaram sem clínica ou apontaram para
-- uma clínica diferente da ficha proprietária do paciente.
UPDATE public.consentimentos_lgpd c
   SET clinica_id = p.clinica_id
  FROM public.pacientes p
 WHERE p.id = c.paciente_id
   AND c.clinica_id IS DISTINCT FROM p.clinica_id;

CREATE OR REPLACE FUNCTION public.atribuir_clinica_ao_consentimento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clinica_id uuid := public.get_my_clinica_id();
  v_clinica_paciente uuid;
BEGIN
  IF v_clinica_id IS NULL THEN
    RAISE EXCEPTION 'Perfil sem clínica vinculada.' USING ERRCODE = '42501';
  END IF;

  SELECT p.clinica_id INTO v_clinica_paciente
    FROM public.pacientes p
   WHERE p.id = NEW.paciente_id
     AND p.clinica_id = v_clinica_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paciente não encontrado nesta clínica.' USING ERRCODE = '42501';
  END IF;

  -- A clínica vem da ficha, nunca de um valor enviado pelo navegador.
  NEW.clinica_id := v_clinica_paciente;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS consentimentos_lgpd_clinica_da_ficha ON public.consentimentos_lgpd;
DROP TRIGGER IF EXISTS consentimentos_lgpd_clinica_da_ficha ON public.consentimentos_lgpd;
CREATE TRIGGER consentimentos_lgpd_clinica_da_ficha
  BEFORE INSERT OR UPDATE OF paciente_id, clinica_id ON public.consentimentos_lgpd
  FOR EACH ROW EXECUTE FUNCTION public.atribuir_clinica_ao_consentimento();

REVOKE ALL ON FUNCTION public.atribuir_clinica_ao_consentimento() FROM PUBLIC, anon, authenticated;

COMMIT;

INSERT INTO supabase_migrations.schema_migrations (version)
  VALUES ('20261014160500') ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------
-- 20261014170000_platform_enrolled_mfa
-- ----------------------------------------------------------------
-- Reconciliação retroativa: esta versão já está registrada em produção
-- (supabase_migrations.schema_migrations, nome "platform_enrolled_mfa") mas
-- nunca teve um arquivo no git, e o texto original não foi preservado (a
-- coluna `statements` ficou vazia).
--
-- Investiguei a fundo antes de criar este arquivo (só leitura, em produção):
--   - nenhuma coluna com "mfa" no nome além de profiles.mfa_enabled, que já
--     vem de 20260414130000_add_mfa_fields.sql;
--   - nenhuma função, policy de RLS ou comentário de tabela com "mfa" no
--     nome ou na definição;
--   - nenhuma linha com profiles.mfa_enabled = true;
--   - auth.mfa_factors (MFA nativo do GoTrue) está vazia.
--
-- Não encontrei nenhum efeito de esquema ou de dado, no estado atual de
-- produção, que corresponda a essa migration. É possível que tenha sido um
-- ajuste de dado pontual (ex.: habilitar/desabilitar MFA de uma conta
-- específica) cujo efeito foi revertido ou sobrescrito depois por outra
-- operação. Este arquivo existe só para o número de versão constar no git —
-- não reproduz nenhuma mudança, porque não há uma para reproduzir com
-- confiança.
SELECT 1;

INSERT INTO supabase_migrations.schema_migrations (version)
  VALUES ('20261014170000') ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------
-- 20261014171000_atestado_model_template_provenance
-- ----------------------------------------------------------------
BEGIN;

-- Keep the source model revision on each newly issued certificate without
-- copying clinical template content or consent-sensitive CID values.
ALTER TABLE public.atestados
  ADD COLUMN IF NOT EXISTS modelo_atestado_id uuid,
  ADD COLUMN IF NOT EXISTS modelo_atestado_nome text,
  ADD COLUMN IF NOT EXISTS modelo_atestado_atualizado_em timestamptz;

CREATE OR REPLACE FUNCTION public.registrar_versao_modelo_atestado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome text;
  v_atualizado_em timestamptz;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.modelo_atestado_id IS DISTINCT FROM OLD.modelo_atestado_id
       OR NEW.modelo_atestado_nome IS DISTINCT FROM OLD.modelo_atestado_nome
       OR NEW.modelo_atestado_atualizado_em IS DISTINCT FROM OLD.modelo_atestado_atualizado_em THEN
      RAISE EXCEPTION 'A origem e a versao do modelo do atestado sao imutaveis.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.modelo_atestado_id IS NULL THEN
    NEW.modelo_atestado_nome := NULL;
    NEW.modelo_atestado_atualizado_em := NULL;
    RETURN NEW;
  END IF;

  SELECT t.nome, COALESCE(t.updated_at, t.created_at, now())
    INTO v_nome, v_atualizado_em
  FROM public.templates_atestado AS t
  WHERE t.id = NEW.modelo_atestado_id
    AND (t.clinica_id IS NULL OR t.clinica_id = NEW.clinica_id)
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'O modelo de atestado nao existe ou nao pertence a clinica atual.'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  NEW.modelo_atestado_nome := v_nome;
  NEW.modelo_atestado_atualizado_em := v_atualizado_em;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proteger_versao_modelo_atestado ON public.atestados;
DROP TRIGGER IF EXISTS proteger_versao_modelo_atestado ON public.atestados;
CREATE TRIGGER proteger_versao_modelo_atestado
  BEFORE INSERT OR UPDATE ON public.atestados
  FOR EACH ROW EXECUTE FUNCTION public.registrar_versao_modelo_atestado();

COMMENT ON COLUMN public.atestados.modelo_atestado_id IS
  'ID de origem sem FK para preservar procedencia apos remocao do modelo.';
COMMENT ON COLUMN public.atestados.modelo_atestado_nome IS
  'Nome imutavel do modelo usado na emissao.';
COMMENT ON COLUMN public.atestados.modelo_atestado_atualizado_em IS
  'Revisao do modelo capturada pelo banco no momento da emissao.';

COMMIT;

INSERT INTO supabase_migrations.schema_migrations (version)
  VALUES ('20261014171000') ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------
-- 20261014172000_hardening_onboarding_clinica
-- ----------------------------------------------------------------
-- O checklist lê sempre a clínica da sessão e só pode ser consultado por admin.
-- SECURITY DEFINER usa search_path vazio para evitar resolução de objetos por schema mutável.
CREATE OR REPLACE FUNCTION public.clinic_onboarding_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clinica uuid := public.current_clinica_id();
  v_team_count integer;
  v_clinic_schedule_count integer;
  v_available_doctors_count integer;
  v_service_count integer;
  v_whatsapp_count integer;
  v_appointment_count integer;
  v_completed integer;
  v_is_complete boolean;
  v_completed_at timestamptz;
BEGIN
  IF v_clinica IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso restrito ao administrador da clínica';
  END IF;

  SELECT count(*)::integer INTO v_team_count
    FROM public.profiles p
   WHERE p.clinica_id = v_clinica AND p.ativo
     AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id);
  SELECT count(*)::integer INTO v_clinic_schedule_count
    FROM public.configuracoes_clinica c
   WHERE c.clinica_id = v_clinica AND c.chave = 'config_clinica'
     AND NULLIF(c.valor ->> 'horarioAbertura', '') IS NOT NULL
     AND NULLIF(c.valor ->> 'horarioFechamento', '') IS NOT NULL
     AND CASE WHEN pg_catalog.jsonb_typeof(c.valor -> 'diasFuncionamento') = 'array'
       THEN pg_catalog.jsonb_array_length(c.valor -> 'diasFuncionamento') > 0 ELSE false END;
  SELECT count(DISTINCT m.id)::integer INTO v_available_doctors_count
    FROM public.medicos m JOIN public.medico_disponibilidade md ON md.medico_id = m.id
   WHERE m.clinica_id = v_clinica AND m.ativo AND md.ativo IS TRUE
     AND md.dia_semana BETWEEN 0 AND 6 AND md.duracao_consulta > 0
     AND md.intervalo_consultas >= 0 AND md.hora_inicio < md.hora_fim
     AND extract(epoch FROM (md.hora_fim - md.hora_inicio)) >= md.duracao_consulta * 60;
  SELECT count(*)::integer INTO v_service_count FROM public.tipos_consulta t
   WHERE t.clinica_id = v_clinica AND coalesce(t.ativo, true);
  SELECT count(*)::integer INTO v_whatsapp_count FROM public.whatsapp_sessions w
   WHERE w.clinica_id = v_clinica AND pg_catalog.lower(coalesce(w.status, '')) IN ('connected', 'conectado', 'open');
  SELECT count(*)::integer INTO v_appointment_count FROM public.agendamentos a WHERE a.clinica_id = v_clinica;

  -- WhatsApp é mostrado como opcional; não reduz o progresso das quatro etapas essenciais.
  v_completed := (CASE WHEN v_team_count > 0 THEN 1 ELSE 0 END)
    + (CASE WHEN v_clinic_schedule_count > 0 AND v_available_doctors_count > 0 THEN 1 ELSE 0 END)
    + (CASE WHEN v_service_count > 0 THEN 1 ELSE 0 END)
    + (CASE WHEN v_appointment_count > 0 THEN 1 ELSE 0 END);
  v_is_complete := v_completed = 4;

  INSERT INTO public.clinic_onboarding_state (clinica_id, last_opened_at, completed_at, updated_by)
  VALUES (v_clinica, pg_catalog.now(), CASE WHEN v_is_complete THEN pg_catalog.now() END, auth.uid())
  ON CONFLICT (clinica_id) DO UPDATE SET last_opened_at = pg_catalog.now(),
    completed_at = CASE WHEN v_is_complete THEN coalesce(public.clinic_onboarding_state.completed_at, pg_catalog.now()) ELSE null END,
    updated_by = auth.uid()
  RETURNING completed_at INTO v_completed_at;

  RETURN pg_catalog.jsonb_build_object(
    'clinica_id', v_clinica, 'completed_steps', v_completed, 'total_steps', 4,
    'progress', v_completed * 25, 'completed_at', v_completed_at,
    'steps', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('key', 'team', 'complete', v_team_count > 0, 'count', v_team_count),
      pg_catalog.jsonb_build_object('key', 'schedule', 'complete', v_clinic_schedule_count > 0 AND v_available_doctors_count > 0, 'count', v_available_doctors_count),
      pg_catalog.jsonb_build_object('key', 'services', 'complete', v_service_count > 0, 'count', v_service_count),
      pg_catalog.jsonb_build_object('key', 'whatsapp', 'complete', v_whatsapp_count > 0, 'count', v_whatsapp_count),
      pg_catalog.jsonb_build_object('key', 'appointment', 'complete', v_appointment_count > 0, 'count', v_appointment_count)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.clinic_onboarding_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinic_onboarding_overview() TO authenticated;

COMMENT ON FUNCTION public.clinic_onboarding_overview() IS
  'Retorna checklist derivado de dados operacionais da clínica ativa; requer admin e mantém WhatsApp opcional.';

INSERT INTO supabase_migrations.schema_migrations (version)
  VALUES ('20261014172000') ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------
-- 20261014173000_inativar_paciente_com_historico
-- ----------------------------------------------------------------
BEGIN;

ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.paciente_status_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE RESTRICT,
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  ativo boolean NOT NULL,
  motivo text NOT NULL CHECK (motivo IN (
    'solicitacao_titular', 'cadastro_duplicado', 'cadastro_incorreto',
    'transferencia_clinica', 'retorno_ao_atendimento', 'correcao_cadastro', 'outro'
  )),
  alterado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  ocorreu_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS paciente_status_eventos_paciente_data_idx
  ON public.paciente_status_eventos (clinica_id, paciente_id, ocorreu_em DESC);

ALTER TABLE public.paciente_status_eventos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.paciente_status_eventos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.paciente_status_eventos TO authenticated;
DROP POLICY IF EXISTS paciente_status_eventos_select ON public.paciente_status_eventos;
CREATE POLICY paciente_status_eventos_select ON public.paciente_status_eventos
  FOR SELECT TO authenticated
  USING (public.can_manage_data(auth.uid()) AND public.is_same_clinica(clinica_id));

CREATE OR REPLACE FUNCTION public.proteger_status_paciente()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.ativo IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Novos pacientes devem iniciar ativos.' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.ativo IS DISTINCT FROM OLD.ativo
        AND current_setting('app.allow_patient_status_rpc', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Altere o status do paciente pela operação administrativa.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.proteger_status_paciente() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS pacientes_proteger_status ON public.pacientes;
CREATE TRIGGER pacientes_proteger_status
  BEFORE INSERT OR UPDATE OF ativo ON public.pacientes
  FOR EACH ROW EXECUTE FUNCTION public.proteger_status_paciente();

CREATE OR REPLACE FUNCTION public.alterar_status_paciente(
  p_paciente_id uuid,
  p_ativo boolean,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_clinica_id uuid;
  v_ativo_atual boolean;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF v_user_id IS NULL OR NOT public.can_manage_data(v_user_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar o status do paciente.' USING ERRCODE = '42501';
  END IF;
  IF p_ativo IS NULL OR p_motivo IS NULL OR p_motivo NOT IN (
    'solicitacao_titular', 'cadastro_duplicado', 'cadastro_incorreto',
    'transferencia_clinica', 'retorno_ao_atendimento', 'correcao_cadastro', 'outro'
  ) THEN
    RAISE EXCEPTION 'Motivo administrativo inválido.' USING ERRCODE = '22023';
  END IF;

  v_clinica_id := public.get_my_clinica_id();
  SELECT p.ativo INTO v_ativo_atual
    FROM public.pacientes p
   WHERE p.id = p_paciente_id AND p.clinica_id = v_clinica_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paciente não encontrado nesta clínica.' USING ERRCODE = '42501';
  END IF;

  IF v_ativo_atual = p_ativo THEN
    RETURN jsonb_build_object('ativo', v_ativo_atual, 'alterado', false);
  END IF;

  IF NOT p_ativo AND EXISTS (
    SELECT 1
      FROM public.agendamentos a
     WHERE a.paciente_id = p_paciente_id
       AND a.clinica_id = v_clinica_id
       AND a.data >= v_hoje
       AND a.status::text NOT IN ('cancelado', 'faltou', 'finalizado', 'atendimento_finalizado')
  ) THEN
    RAISE EXCEPTION 'Cancele ou conclua os agendamentos atuais e futuros antes de inativar este paciente.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT p_ativo AND EXISTS (
    SELECT 1
      FROM public.fila_atendimento f
      JOIN public.agendamentos a ON a.id = f.agendamento_id
     WHERE a.paciente_id = p_paciente_id
       AND a.clinica_id = v_clinica_id
       AND f.status IN ('aguardando', 'chamado', 'em_atendimento')
  ) THEN
    RAISE EXCEPTION 'Remova o paciente da fila de atendimento antes de inativar.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.allow_patient_status_rpc', 'on', true);
  UPDATE public.pacientes SET ativo = p_ativo
   WHERE id = p_paciente_id AND clinica_id = v_clinica_id;

  IF NOT p_ativo THEN
    UPDATE public.paciente_portal_tokens
       SET ativo = false
     WHERE paciente_id = p_paciente_id
       AND clinica_id = v_clinica_id
       AND ativo = true;
  END IF;

  INSERT INTO public.paciente_status_eventos (paciente_id, clinica_id, ativo, motivo, alterado_por)
  VALUES (p_paciente_id, v_clinica_id, p_ativo, p_motivo, v_user_id);

  RETURN jsonb_build_object('ativo', p_ativo, 'alterado', true);
END;
$$;

REVOKE ALL ON FUNCTION public.alterar_status_paciente(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.alterar_status_paciente(uuid, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.impedir_agendamento_paciente_inativo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ativo boolean;
  v_clinica_id uuid;
BEGIN
  IF NEW.paciente_id IS NULL THEN RETURN NEW; END IF;
  SELECT p.ativo, p.clinica_id INTO v_ativo, v_clinica_id
    FROM public.pacientes p WHERE p.id = NEW.paciente_id FOR SHARE;
  IF NOT FOUND OR v_clinica_id IS DISTINCT FROM NEW.clinica_id THEN
    RAISE EXCEPTION 'Paciente não encontrado nesta clínica.' USING ERRCODE = '23514';
  END IF;
  IF NOT v_ativo THEN
    RAISE EXCEPTION 'Reative o paciente antes de criar ou alterar um agendamento.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.impedir_agendamento_paciente_inativo() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS agendamentos_impedir_paciente_inativo ON public.agendamentos;
CREATE TRIGGER agendamentos_impedir_paciente_inativo
  BEFORE INSERT OR UPDATE OF paciente_id, clinica_id, status, data, hora_inicio, hora_fim ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.impedir_agendamento_paciente_inativo();

CREATE OR REPLACE FUNCTION public.impedir_fila_paciente_inativo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ativo boolean;
  v_clinica_paciente uuid;
  v_clinica_agendamento uuid;
BEGIN
  IF NEW.status IS NULL OR NEW.status NOT IN ('aguardando', 'chamado', 'em_atendimento') THEN RETURN NEW; END IF;
  SELECT p.ativo, p.clinica_id, a.clinica_id
    INTO v_ativo, v_clinica_paciente, v_clinica_agendamento
    FROM public.agendamentos a
    JOIN public.pacientes p ON p.id = a.paciente_id
   WHERE a.id = NEW.agendamento_id
   FOR SHARE OF p;
  IF NOT FOUND OR v_clinica_paciente IS DISTINCT FROM NEW.clinica_id
     OR v_clinica_agendamento IS DISTINCT FROM NEW.clinica_id THEN
    RAISE EXCEPTION 'Agendamento e paciente devem pertencer à clínica do item da fila.' USING ERRCODE = '23514';
  END IF;
  IF NOT v_ativo THEN
    RAISE EXCEPTION 'Reative o paciente antes de incluí-lo na fila de atendimento.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.impedir_fila_paciente_inativo() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS fila_atendimento_impedir_paciente_inativo ON public.fila_atendimento;
CREATE TRIGGER fila_atendimento_impedir_paciente_inativo
  BEFORE INSERT OR UPDATE OF agendamento_id, clinica_id, status ON public.fila_atendimento
  FOR EACH ROW EXECUTE FUNCTION public.impedir_fila_paciente_inativo();

-- Keep tenant checks, token hashing, interactive rotation, and trigger behavior
-- from the scoped-link implementation while refusing inactive patients.
CREATE OR REPLACE FUNCTION public.link_portal_paciente(p_paciente_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token_bruto text;
  v_clinica_id uuid;
  v_ativo boolean;
  v_chamada_trigger boolean := pg_trigger_depth() > 0;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT v_chamada_trigger
     AND NOT public.can_manage_data(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para gerar link do portal';
  END IF;

  SELECT clinica_id, ativo INTO v_clinica_id, v_ativo
    FROM public.pacientes WHERE id = p_paciente_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF auth.uid() IS NOT NULL AND v_clinica_id IS DISTINCT FROM public.get_my_clinica_id() THEN
    RAISE EXCEPTION 'Sem permissão para gerar link do portal deste paciente';
  END IF;
  IF NOT v_ativo THEN
    RAISE EXCEPTION 'Não é possível gerar link do portal para paciente inativo.' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT v_chamada_trigger THEN
    UPDATE public.paciente_portal_tokens SET ativo = false
     WHERE paciente_id = p_paciente_id
       AND clinica_id IS NOT DISTINCT FROM v_clinica_id
       AND ativo = true;
  END IF;

  v_token_bruto := encode(gen_random_bytes(32), 'hex');
  INSERT INTO public.paciente_portal_tokens (paciente_id, clinica_id, token, ativo, expires_at)
  VALUES (p_paciente_id, v_clinica_id,
    encode(extensions.digest(v_token_bruto, 'sha256'), 'hex'), true, now() + interval '1 year');
  RETURN 'https://app.elolab.com.br/portal-paciente?token=' || v_token_bruto;
END;
$$;

REVOKE ALL ON FUNCTION public.link_portal_paciente(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_portal_paciente(uuid) TO authenticated;

COMMENT ON TABLE public.paciente_status_eventos IS
  'Trilha administrativa das inativações e reativações; o histórico clínico permanece associado à ficha.';
COMMENT ON FUNCTION public.alterar_status_paciente(uuid, boolean, text) IS
  'Altera status do paciente de forma auditada e bloqueia inativação com agendamentos ou fila ativos.';

COMMIT;

INSERT INTO supabase_migrations.schema_migrations (version)
  VALUES ('20261014173000') ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------
-- 20261014180000_check_publico_disponibilidade
-- ----------------------------------------------------------------
-- Health check público executa apenas uma constante no banco e não lê dados clínicos.
CREATE OR REPLACE FUNCTION public.public_availability_check()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT pg_catalog.jsonb_build_object('ok', true, 'checked_at', pg_catalog.now());
$$;

REVOKE ALL ON FUNCTION public.public_availability_check() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_availability_check() TO anon, authenticated;

COMMENT ON FUNCTION public.public_availability_check() IS
  'Health check anônimo: confirma que PostgREST e PostgreSQL respondem sem consultar dados da aplicação.';

INSERT INTO supabase_migrations.schema_migrations (version)
  VALUES ('20261014180000') ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------
-- 20261014180500_documentos_portal_paciente_controlados
-- ----------------------------------------------------------------
BEGIN;

CREATE TABLE IF NOT EXISTS public.documentos_portal_paciente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anexo_id uuid NOT NULL UNIQUE REFERENCES public.anexos_prontuario(id) ON DELETE CASCADE,
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  origem text NOT NULL CHECK (origem IN ('clinica', 'externo')),
  validade_ate date,
  publicado boolean NOT NULL DEFAULT false,
  publicado_em timestamptz,
  publicado_por uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  revogado_em timestamptz,
  revogado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT documentos_portal_publicacao_auditada CHECK (
    NOT publicado OR (publicado_em IS NOT NULL AND publicado_por IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS documentos_portal_paciente_publicados_idx
  ON public.documentos_portal_paciente (clinica_id, paciente_id, publicado, validade_ate);

ALTER TABLE public.documentos_portal_paciente ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.documentos_portal_paciente FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.documentos_portal_paciente TO authenticated;
DROP POLICY IF EXISTS documentos_portal_paciente_select ON public.documentos_portal_paciente;
CREATE POLICY documentos_portal_paciente_select ON public.documentos_portal_paciente
  FOR SELECT TO authenticated
  USING (
    public.is_same_clinica(clinica_id)
    AND (public.is_admin(auth.uid()) OR public.is_medico(auth.uid()))
  );

CREATE OR REPLACE FUNCTION public.gerenciar_documento_portal_paciente(
  p_anexo_id uuid,
  p_publicado boolean,
  p_validade_ate date,
  p_origem text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_clinica_id uuid;
  v_paciente_id uuid;
  v_publicacao public.documentos_portal_paciente%rowtype;
BEGIN
  IF v_user_id IS NULL OR NOT (public.is_admin(v_user_id) OR public.is_medico(v_user_id)) THEN
    RAISE EXCEPTION 'Somente administração ou profissional médico pode publicar documentos no portal.'
      USING ERRCODE = '42501';
  END IF;
  IF p_publicado IS NULL OR p_origem NOT IN ('clinica', 'externo') THEN
    RAISE EXCEPTION 'Origem ou status da publicação inválidos.' USING ERRCODE = '22023';
  END IF;
  IF p_publicado AND p_validade_ate IS NOT NULL
     AND p_validade_ate < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'A validade do documento deve ser hoje ou uma data futura.' USING ERRCODE = '22023';
  END IF;

  v_clinica_id := public.get_my_clinica_id();
  SELECT a.paciente_id INTO v_paciente_id
    FROM public.anexos_prontuario a
    JOIN public.pacientes p ON p.id = a.paciente_id
    JOIN public.prontuarios r ON r.id = a.prontuario_id
      AND r.paciente_id = a.paciente_id
      AND r.clinica_id = a.clinica_id
   WHERE a.id = p_anexo_id
     AND a.clinica_id = v_clinica_id
     AND p.clinica_id = v_clinica_id
     AND r.clinica_id = v_clinica_id
   FOR UPDATE OF a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Anexo não encontrado nesta clínica ou sem vínculo válido ao prontuário.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT p_publicado AND NOT EXISTS (
    SELECT 1 FROM public.documentos_portal_paciente d
     WHERE d.anexo_id = p_anexo_id
       AND d.paciente_id = v_paciente_id
       AND d.clinica_id = v_clinica_id
  ) THEN
    RETURN jsonb_build_object('publicado', false, 'alterado', false);
  END IF;

  INSERT INTO public.documentos_portal_paciente (
    anexo_id, paciente_id, clinica_id, origem, validade_ate,
    publicado, publicado_em, publicado_por, revogado_em, revogado_por, atualizado_em
  ) VALUES (
    p_anexo_id, v_paciente_id, v_clinica_id, p_origem, p_validade_ate,
    p_publicado,
    CASE WHEN p_publicado THEN now() ELSE NULL END,
    CASE WHEN p_publicado THEN v_user_id ELSE NULL END,
    CASE WHEN p_publicado THEN NULL ELSE now() END,
    CASE WHEN p_publicado THEN NULL ELSE v_user_id END,
    now()
  )
  ON CONFLICT (anexo_id) DO UPDATE SET
    origem = EXCLUDED.origem,
    validade_ate = EXCLUDED.validade_ate,
    publicado = EXCLUDED.publicado,
    publicado_em = CASE WHEN EXCLUDED.publicado THEN now() ELSE public.documentos_portal_paciente.publicado_em END,
    publicado_por = CASE WHEN EXCLUDED.publicado THEN v_user_id ELSE public.documentos_portal_paciente.publicado_por END,
    revogado_em = CASE WHEN EXCLUDED.publicado THEN NULL ELSE now() END,
    revogado_por = CASE WHEN EXCLUDED.publicado THEN NULL ELSE v_user_id END,
    atualizado_em = now()
  RETURNING * INTO v_publicacao;

  RETURN jsonb_build_object(
    'id', v_publicacao.id,
    'anexo_id', v_publicacao.anexo_id,
    'publicado', v_publicacao.publicado,
    'validade_ate', v_publicacao.validade_ate,
    'origem', v_publicacao.origem,
    'publicado_em', v_publicacao.publicado_em,
    'revogado_em', v_publicacao.revogado_em
  );
END;
$$;

REVOKE ALL ON FUNCTION public.gerenciar_documento_portal_paciente(uuid, boolean, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerenciar_documento_portal_paciente(uuid, boolean, date, text) TO authenticated;

COMMENT ON TABLE public.documentos_portal_paciente IS
  'Publicação administrativa explícita de anexos selecionados no Portal do Paciente; o arquivo original continua privado.';
COMMENT ON FUNCTION public.gerenciar_documento_portal_paciente(uuid, boolean, date, text) IS
  'Publica ou revoga um anexo do portal após validar papel, clínica, paciente e prontuário.';

COMMIT;

INSERT INTO supabase_migrations.schema_migrations (version)
  VALUES ('20261014180500') ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------
-- 20261014181000_prescription_allergy_override_audit
-- ----------------------------------------------------------------
BEGIN;

ALTER TABLE public.prescricoes
  ADD COLUMN IF NOT EXISTS alertas_seguranca jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS justificativa_alerta text,
  ADD COLUMN IF NOT EXISTS alerta_confirmado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS alerta_confirmado_em timestamptz;

CREATE OR REPLACE FUNCTION public.validar_auditoria_alerta_prescricao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_tem_alertas boolean;
  v_override_alergia boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.alertas_seguranca IS DISTINCT FROM OLD.alertas_seguranca
       OR NEW.justificativa_alerta IS DISTINCT FROM OLD.justificativa_alerta
       OR NEW.alerta_confirmado_por IS DISTINCT FROM OLD.alerta_confirmado_por
       OR NEW.alerta_confirmado_em IS DISTINCT FROM OLD.alerta_confirmado_em THEN
      RAISE EXCEPTION 'O registro de alertas e justificativa da prescricao e imutavel.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF jsonb_typeof(NEW.alertas_seguranca) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Os alertas de seguranca devem ser uma lista.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_tem_alertas := jsonb_array_length(NEW.alertas_seguranca) > 0;
  IF length(COALESCE(NEW.justificativa_alerta, '')) > 1000 THEN
    RAISE EXCEPTION 'A justificativa da prescricao excede o limite de 1.000 caracteres.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(NEW.alertas_seguranca) AS alerta
    WHERE COALESCE(alerta->>'id', '') LIKE 'allergy-%'
      AND alerta->'canIgnore' = 'true'::jsonb
  ) INTO v_override_alergia;

  IF v_tem_alertas THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'A confirmacao de alertas exige um profissional autenticado.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.alerta_confirmado_por := auth.uid();
    NEW.alerta_confirmado_em := now();
  ELSE
    NEW.alerta_confirmado_por := NULL;
    NEW.alerta_confirmado_em := NULL;
  END IF;

  IF v_override_alergia THEN
    IF length(btrim(COALESCE(NEW.justificativa_alerta, ''))) < 20 THEN
      RAISE EXCEPTION 'Uma justificativa clinica de pelo menos 20 caracteres e obrigatoria para prosseguir diante de alerta de alergia.'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    NEW.justificativa_alerta := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_auditoria_alerta_prescricao ON public.prescricoes;
DROP TRIGGER IF EXISTS trg_validar_auditoria_alerta_prescricao ON public.prescricoes;
CREATE TRIGGER trg_validar_auditoria_alerta_prescricao
  BEFORE INSERT OR UPDATE ON public.prescricoes
  FOR EACH ROW EXECUTE FUNCTION public.validar_auditoria_alerta_prescricao();

COMMENT ON COLUMN public.prescricoes.alertas_seguranca IS
  'Snapshot dos alertas confirmados no momento da emissao.';
COMMENT ON COLUMN public.prescricoes.justificativa_alerta IS
  'Justificativa clinica imutavel para prosseguir diante de alerta de alergia ignoravel.';
COMMENT ON COLUMN public.prescricoes.alerta_confirmado_por IS
  'Usuario autenticado que confirmou os alertas da prescricao.';
COMMENT ON COLUMN public.prescricoes.alerta_confirmado_em IS
  'Instante em que os alertas da prescricao foram confirmados.';

COMMIT;

INSERT INTO supabase_migrations.schema_migrations (version)
  VALUES ('20261014181000') ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------
-- 20261014190000_teleconsulta_sessoes_seguras
-- ----------------------------------------------------------------
-- Teleconsulta com credencial descartável e sinalização curta. Mídia nunca é gravada.
ALTER TABLE public.agendamentos DROP CONSTRAINT IF EXISTS agendamentos_tipo_check;
ALTER TABLE public.agendamentos ADD CONSTRAINT agendamentos_tipo_check CHECK (tipo = ANY (ARRAY[
  'consulta'::text, 'retorno'::text, 'exame'::text, 'procedimento'::text, 'telemedicina'::text,
  'checkup'::text, 'avaliacao'::text, 'cirurgia'::text, 'triagem'::text,
  'coleta'::text, 'enfermagem'::text, 'vacina'::text, 'curativo'::text
]));

CREATE TABLE IF NOT EXISTS public.teleconsulta_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  agendamento_id uuid NOT NULL REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  medico_id uuid NOT NULL REFERENCES public.medicos(id),
  guest_token_hash text NOT NULL UNIQUE CHECK (guest_token_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'closed', 'expired')),
  expires_at timestamptz NOT NULL,
  provider_consented_at timestamptz,
  guest_consented_at timestamptz,
  provider_last_seen_at timestamptz,
  guest_last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  UNIQUE (agendamento_id)
);
CREATE INDEX IF NOT EXISTS teleconsulta_sessions_expiry_idx ON public.teleconsulta_sessions (expires_at) WHERE status IN ('waiting', 'active');
ALTER TABLE public.teleconsulta_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.teleconsulta_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.teleconsulta_sessions TO service_role;

CREATE TABLE IF NOT EXISTS public.teleconsulta_signals (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.teleconsulta_sessions(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('provider', 'guest')),
  signal_type text NOT NULL CHECK (signal_type IN ('offer', 'answer', 'ice-candidate')),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS teleconsulta_signals_poll_idx ON public.teleconsulta_signals (session_id, id);
ALTER TABLE public.teleconsulta_signals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.teleconsulta_signals FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.teleconsulta_signals TO service_role;

-- Sinais são efêmeros; invocado pela função na leitura/polling. Sem extensão/cron obrigatório.
COMMENT ON TABLE public.teleconsulta_signals IS 'SDP/ICE temporários; expurgados pela Edge Function após leitura ou encerramento. Não contém gravação, transcrição ou texto clínico.';

INSERT INTO supabase_migrations.schema_migrations (version)
  VALUES ('20261014190000') ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------
-- 20261014200000_qualidade_seguranca_assistencial
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clinical_safety_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  reporter_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reporter_confidential boolean NOT NULL DEFAULT true,
  category text NOT NULL CHECK (category IN ('adverse_event', 'near_miss', 'unsafe_condition', 'medication', 'fall', 'infection', 'equipment', 'other')),
  severity text NOT NULL CHECK (severity IN ('low', 'moderate', 'high', 'critical')),
  occurred_at timestamptz NOT NULL,
  location_label text NOT NULL DEFAULT '' CHECK (length(location_label) <= 120),
  summary text NOT NULL CHECK (length(trim(summary)) BETWEEN 20 AND 4000),
  immediate_action text NOT NULL DEFAULT '' CHECK (length(immediate_action) <= 2000),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'triage', 'investigating', 'action_required', 'monitoring', 'closed', 'reopened')),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  CHECK (status <> 'action_required' OR (assigned_to IS NOT NULL AND due_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS clinical_safety_reports_clinic_status_created_idx
  ON public.clinical_safety_reports (clinic_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS clinical_safety_reports_reporter_created_idx
  ON public.clinical_safety_reports (reporter_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS clinical_safety_reports_assigned_due_idx
  ON public.clinical_safety_reports (assigned_to, due_at) WHERE assigned_to IS NOT NULL;
ALTER TABLE public.clinical_safety_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.clinical_safety_reports FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.clinical_safety_reports TO service_role;

CREATE TABLE IF NOT EXISTS public.clinical_safety_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.clinical_safety_reports(id) ON DELETE CASCADE,
  clinic_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  from_status text,
  to_status text NOT NULL CHECK (to_status IN ('submitted', 'triage', 'investigating', 'action_required', 'monitoring', 'closed', 'reopened')),
  review_note text NOT NULL CHECK (length(trim(review_note)) BETWEEN 3 AND 3000),
  corrective_action text NOT NULL DEFAULT '' CHECK (length(corrective_action) <= 3000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clinical_safety_updates_report_created_idx ON public.clinical_safety_updates (report_id, created_at DESC);
ALTER TABLE public.clinical_safety_updates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.clinical_safety_updates FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.clinical_safety_updates TO service_role;

CREATE TABLE IF NOT EXISTS public.clinical_safety_access_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clinic_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  report_id uuid NOT NULL REFERENCES public.clinical_safety_reports(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('list', 'view', 'create', 'update', 'correction_request', 'correction_review')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clinical_safety_access_audit_report_created_idx ON public.clinical_safety_access_audit (report_id, created_at DESC);
ALTER TABLE public.clinical_safety_access_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.clinical_safety_access_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.clinical_safety_access_audit TO service_role;

CREATE OR REPLACE FUNCTION public.create_clinical_safety_report(
  p_clinic_id uuid,
  p_actor_user_id uuid,
  p_reporter_confidential boolean,
  p_category text,
  p_severity text,
  p_occurred_at timestamptz,
  p_location_label text,
  p_summary text,
  p_immediate_action text
)
RETURNS TABLE(report_id uuid, report_status text, report_created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_report public.clinical_safety_reports%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_actor_user_id AND p.clinica_id = p_clinic_id AND COALESCE(p.ativo, true)
  ) OR NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p_actor_user_id AND ur.role::text IN ('admin', 'medico', 'enfermagem')
  ) THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  INSERT INTO public.clinical_safety_reports (
    clinic_id, reporter_user_id, reporter_confidential, category, severity,
    occurred_at, location_label, summary, immediate_action
  ) VALUES (
    p_clinic_id, p_actor_user_id, p_reporter_confidential, p_category, p_severity,
    p_occurred_at, p_location_label, p_summary, p_immediate_action
  ) RETURNING * INTO v_report;

  INSERT INTO public.clinical_safety_access_audit (clinic_id, report_id, actor_user_id, action)
  VALUES (p_clinic_id, v_report.id, p_actor_user_id, 'create');

  RETURN QUERY SELECT v_report.id, v_report.status, v_report.created_at;
END;
$$;
REVOKE ALL ON FUNCTION public.create_clinical_safety_report(uuid, uuid, boolean, text, text, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_clinical_safety_report(uuid, uuid, boolean, text, text, timestamptz, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_clinical_safety_review(
  p_report_id uuid,
  p_clinic_id uuid,
  p_actor_user_id uuid,
  p_expected_updated_at timestamptz,
  p_status text,
  p_assigned_to uuid,
  p_due_at timestamptz,
  p_review_note text,
  p_corrective_action text
)
RETURNS TABLE(report_id uuid, report_status text, report_updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_report public.clinical_safety_reports%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_from_status text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_actor_user_id AND p.clinica_id = p_clinic_id AND COALESCE(p.ativo, true)
  ) OR NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p_actor_user_id AND ur.role::text = 'admin'
  ) THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;
  IF p_status NOT IN ('submitted', 'triage', 'investigating', 'action_required', 'monitoring', 'closed', 'reopened')
    OR length(trim(p_review_note)) NOT BETWEEN 3 AND 3000
    OR length(p_corrective_action) > 3000
    OR (p_status = 'action_required' AND (p_assigned_to IS NULL OR p_due_at IS NULL)) THEN
    RAISE EXCEPTION 'Revisão inválida';
  END IF;
  IF p_assigned_to IS NOT NULL AND (
    NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_assigned_to AND p.clinica_id = p_clinic_id AND COALESCE(p.ativo, true))
    OR NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p_assigned_to AND ur.role::text IN ('admin', 'medico', 'enfermagem'))
  ) THEN
    RAISE EXCEPTION 'Responsável fora da clínica';
  END IF;

  SELECT r.status INTO v_from_status FROM public.clinical_safety_reports r
  WHERE r.id = p_report_id AND r.clinic_id = p_clinic_id AND r.updated_at = p_expected_updated_at
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public.clinical_safety_reports r SET
    status = p_status, assigned_to = p_assigned_to, due_at = p_due_at,
    updated_at = v_now, closed_at = CASE WHEN p_status = 'closed' THEN v_now ELSE NULL END
  WHERE r.id = p_report_id AND r.clinic_id = p_clinic_id AND r.updated_at = p_expected_updated_at
  RETURNING r.* INTO v_report;
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public.clinical_safety_updates (
    report_id, clinic_id, actor_user_id, from_status, to_status, review_note, corrective_action
  ) VALUES (
    p_report_id, p_clinic_id, p_actor_user_id, v_from_status, p_status, trim(p_review_note), p_corrective_action
  );
  INSERT INTO public.clinical_safety_access_audit (clinic_id, report_id, actor_user_id, action)
  VALUES (p_clinic_id, p_report_id, p_actor_user_id, 'update');

  RETURN QUERY SELECT v_report.id, v_report.status, v_report.updated_at;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_clinical_safety_review(uuid, uuid, uuid, timestamptz, text, uuid, timestamptz, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_clinical_safety_review(uuid, uuid, uuid, timestamptz, text, uuid, timestamptz, text, text) TO service_role;

CREATE TABLE IF NOT EXISTS public.clinical_safety_correction_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.clinical_safety_reports(id) ON DELETE CASCADE,
  clinic_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  requester_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  previous_summary text NOT NULL,
  previous_immediate_action text NOT NULL,
  proposed_summary text NOT NULL CHECK (length(trim(proposed_summary)) BETWEEN 20 AND 4000),
  proposed_immediate_action text NOT NULL DEFAULT '' CHECK (length(proposed_immediate_action) <= 2000),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 1000),
  report_updated_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  CHECK ((status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL) OR (status <> 'pending' AND reviewed_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS clinical_safety_one_pending_correction_idx
  ON public.clinical_safety_correction_requests (report_id, requester_user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS clinical_safety_corrections_clinic_created_idx
  ON public.clinical_safety_correction_requests (clinic_id, status, created_at DESC);
ALTER TABLE public.clinical_safety_correction_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.clinical_safety_correction_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.clinical_safety_correction_requests TO service_role;

CREATE OR REPLACE FUNCTION public.create_clinical_safety_correction_request(
  p_report_id uuid,
  p_clinic_id uuid,
  p_actor_user_id uuid,
  p_proposed_summary text,
  p_proposed_immediate_action text,
  p_reason text
)
RETURNS TABLE(request_id uuid, request_status text, request_created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_report public.clinical_safety_reports%ROWTYPE;
  v_request public.clinical_safety_correction_requests%ROWTYPE;
BEGIN
  SELECT r.* INTO v_report FROM public.clinical_safety_reports r
  WHERE r.id = p_report_id AND r.clinic_id = p_clinic_id AND r.reporter_user_id = p_actor_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Relato não encontrado'; END IF;
  IF length(trim(p_reason)) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'Motivo inválido'; END IF;

  INSERT INTO public.clinical_safety_correction_requests (
    report_id, clinic_id, requester_user_id, previous_summary, previous_immediate_action,
    proposed_summary, proposed_immediate_action, reason, report_updated_at
  ) VALUES (
    p_report_id, p_clinic_id, p_actor_user_id, v_report.summary, v_report.immediate_action,
    p_proposed_summary, p_proposed_immediate_action, trim(p_reason), v_report.updated_at
  ) RETURNING * INTO v_request;

  INSERT INTO public.clinical_safety_access_audit (clinic_id, report_id, actor_user_id, action)
  VALUES (p_clinic_id, p_report_id, p_actor_user_id, 'correction_request');
  RETURN QUERY SELECT v_request.id, v_request.status, v_request.created_at;
END;
$$;
REVOKE ALL ON FUNCTION public.create_clinical_safety_correction_request(uuid, uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_clinical_safety_correction_request(uuid, uuid, uuid, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.resolve_clinical_safety_correction(
  p_request_id uuid,
  p_clinic_id uuid,
  p_actor_user_id uuid,
  p_expected_report_updated_at timestamptz,
  p_status text,
  p_review_note text
)
RETURNS TABLE(request_id uuid, request_status text, report_updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request public.clinical_safety_correction_requests%ROWTYPE;
  v_report_updated_at timestamptz;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = p_actor_user_id AND p.clinica_id = p_clinic_id AND COALESCE(p.ativo, true)
  ) OR NOT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p_actor_user_id AND ur.role::text = 'admin'
  ) THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
  IF p_status NOT IN ('approved', 'rejected') OR length(trim(p_review_note)) NOT BETWEEN 3 AND 2000 THEN
    RAISE EXCEPTION 'Decisão inválida';
  END IF;

  SELECT c.* INTO v_request FROM public.clinical_safety_correction_requests c
  WHERE c.id = p_request_id AND c.clinic_id = p_clinic_id AND c.status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  IF p_status = 'approved' THEN
    IF v_request.report_updated_at <> p_expected_report_updated_at THEN RETURN; END IF;
    UPDATE public.clinical_safety_reports r SET
      summary = v_request.proposed_summary,
      immediate_action = v_request.proposed_immediate_action,
      updated_at = clock_timestamp()
    WHERE r.id = v_request.report_id AND r.clinic_id = p_clinic_id AND r.updated_at = p_expected_report_updated_at
    RETURNING r.updated_at INTO v_report_updated_at;
    IF NOT FOUND THEN RETURN; END IF;
  ELSE
    v_report_updated_at := p_expected_report_updated_at;
  END IF;

  UPDATE public.clinical_safety_correction_requests c SET
    status = p_status, reviewed_by = p_actor_user_id, review_note = trim(p_review_note), reviewed_at = clock_timestamp()
  WHERE c.id = p_request_id AND c.status = 'pending';
  INSERT INTO public.clinical_safety_updates (
    report_id, clinic_id, actor_user_id, from_status, to_status, review_note, corrective_action
  ) SELECT v_request.report_id, p_clinic_id, p_actor_user_id, r.status, r.status, trim(p_review_note),
    CASE WHEN p_status = 'approved' THEN 'Retificação aprovada e aplicada com versão anterior preservada.' ELSE 'Pedido de retificação analisado e recusado.' END
    FROM public.clinical_safety_reports r WHERE r.id = v_request.report_id AND r.clinic_id = p_clinic_id
ON CONFLICT DO NOTHING;
  INSERT INTO public.clinical_safety_access_audit (clinic_id, report_id, actor_user_id, action)
  VALUES (p_clinic_id, v_request.report_id, p_actor_user_id, 'correction_review');

  RETURN QUERY SELECT p_request_id, p_status, v_report_updated_at;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_clinical_safety_correction(uuid, uuid, uuid, timestamptz, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_clinical_safety_correction(uuid, uuid, uuid, timestamptz, text, text) TO service_role;

INSERT INTO supabase_migrations.schema_migrations (version)
  VALUES ('20261014200000') ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------
-- 20261014210000_whatsapp_agent_information_capability
-- ----------------------------------------------------------------
BEGIN;

SET LOCAL lock_timeout = '5s';

-- Match the editor: clinic information is a capability, and no selected
-- capabilities leaves only the mandatory handoff to the human team.
ALTER TABLE public.whatsapp_agents
  DROP CONSTRAINT IF EXISTS whatsapp_agents_habilidades_validas;

ALTER TABLE public.whatsapp_agents
  ADD CONSTRAINT whatsapp_agents_habilidades_validas CHECK (
    habilidades IS NULL OR habilidades <@ ARRAY[
      'informacoes_clinica',
      'consultar_disponibilidade',
      'criar_agendamento',
      'consultar_agendamentos_paciente',
      'cancelar_agendamento',
      'reagendar_agendamento',
      'registrar_triagem'
    ]::TEXT[]
  );

COMMIT;

INSERT INTO supabase_migrations.schema_migrations (version)
  VALUES ('20261014210000') ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------
-- 20261014210500_higiene_salas
-- ----------------------------------------------------------------
BEGIN;

CREATE TABLE IF NOT EXISTS public.room_hygiene_checklist_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 3 AND 120),
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) BETWEEN 1 AND 40),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, version)
);

CREATE TABLE IF NOT EXISTS public.room_hygiene_active_checklists (
  clinic_id uuid PRIMARY KEY REFERENCES public.clinicas(id) ON DELETE CASCADE,
  checklist_version_id uuid NOT NULL UNIQUE REFERENCES public.room_hygiene_checklist_versions(id),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.room_hygiene_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.salas(id) ON DELETE RESTRICT,
  checklist_version_id uuid NOT NULL REFERENCES public.room_hygiene_checklist_versions(id),
  started_by uuid NOT NULL REFERENCES auth.users(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_by uuid REFERENCES auth.users(id),
  submitted_at timestamptz,
  completed_items jsonb,
  notes text CHECK (notes IS NULL OR length(notes) <= 1000),
  CHECK ((submitted_at IS NULL AND submitted_by IS NULL AND completed_items IS NULL) OR
         (submitted_at IS NOT NULL AND submitted_by IS NOT NULL AND jsonb_typeof(completed_items) = 'array'))
);

CREATE UNIQUE INDEX IF NOT EXISTS room_hygiene_one_open_execution_per_room
  ON public.room_hygiene_executions (clinic_id, room_id) WHERE submitted_at IS NULL;
CREATE INDEX IF NOT EXISTS room_hygiene_executions_by_clinic ON public.room_hygiene_executions (clinic_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.room_hygiene_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  execution_id uuid NOT NULL REFERENCES public.room_hygiene_executions(id) ON DELETE RESTRICT,
  reviewer_id uuid NOT NULL REFERENCES auth.users(id),
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  note text NOT NULL CHECK (length(trim(note)) BETWEEN 3 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.room_hygiene_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clinic_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  room_id uuid REFERENCES public.salas(id) ON DELETE SET NULL,
  execution_id uuid REFERENCES public.room_hygiene_executions(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('checklist_versioned', 'started', 'submitted', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.room_hygiene_checklist_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_hygiene_active_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_hygiene_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_hygiene_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_hygiene_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.room_hygiene_checklist_versions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.room_hygiene_active_checklists FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.room_hygiene_executions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.room_hygiene_reviews FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.room_hygiene_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.room_hygiene_checklist_versions TO service_role;
GRANT ALL ON TABLE public.room_hygiene_active_checklists TO service_role;
GRANT ALL ON TABLE public.room_hygiene_executions TO service_role;
GRANT ALL ON TABLE public.room_hygiene_reviews TO service_role;
GRANT ALL ON TABLE public.room_hygiene_audit TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.room_hygiene_audit_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.create_room_hygiene_checklist(
  p_clinic_id uuid, p_actor_id uuid, p_title text, p_items jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_version integer; v_id uuid;
BEGIN
  IF p_clinic_id IS DISTINCT FROM (SELECT p.clinica_id FROM public.profiles p WHERE p.id = p_actor_id AND p.ativo IS TRUE)
     OR NOT public.is_admin(p_actor_id) THEN
    RAISE EXCEPTION 'Acesso não autorizado' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'Checklist inválido' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.clinicas WHERE id = p_clinic_id FOR UPDATE;
  SELECT COALESCE(max(version), 0) + 1 INTO v_version FROM public.room_hygiene_checklist_versions WHERE clinic_id = p_clinic_id;
  INSERT INTO public.room_hygiene_checklist_versions(clinic_id, version, title, items, created_by)
  VALUES (p_clinic_id, v_version, trim(p_title), p_items, p_actor_id) RETURNING id INTO v_id;
  INSERT INTO public.room_hygiene_active_checklists(clinic_id, checklist_version_id, updated_by)
  VALUES (p_clinic_id, v_id, p_actor_id)
  ON CONFLICT (clinic_id) DO UPDATE SET checklist_version_id = EXCLUDED.checklist_version_id,
    updated_by = EXCLUDED.updated_by, updated_at = now();
  INSERT INTO public.room_hygiene_audit(clinic_id, actor_id, action) VALUES (p_clinic_id, p_actor_id, 'checklist_versioned');
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_room_hygiene_execution(
  p_clinic_id uuid, p_actor_id uuid, p_room_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_checklist uuid; v_execution uuid; v_room_status text;
BEGIN
  IF p_clinic_id IS DISTINCT FROM (SELECT p.clinica_id FROM public.profiles p WHERE p.id = p_actor_id AND p.ativo IS TRUE) OR NOT (
    public.is_admin(p_actor_id) OR public.is_recepcao(p_actor_id) OR public.is_enfermagem(p_actor_id)
  ) THEN RAISE EXCEPTION 'Acesso não autorizado' USING ERRCODE = '42501'; END IF;
  SELECT a.checklist_version_id INTO v_checklist FROM public.room_hygiene_active_checklists a WHERE a.clinic_id = p_clinic_id;
  IF v_checklist IS NULL THEN RAISE EXCEPTION 'Configure um checklist antes de iniciar a higienização' USING ERRCODE = '23514'; END IF;
  SELECT s.status::text INTO v_room_status FROM public.salas s WHERE s.id = p_room_id AND s.clinica_id = p_clinic_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sala não encontrada nesta clínica' USING ERRCODE = '42501'; END IF;
  IF v_room_status = 'ocupado' OR v_room_status = 'manutencao' THEN
    RAISE EXCEPTION 'Sala em uso ou manutenção não pode iniciar higienização' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.room_hygiene_executions e LEFT JOIN public.room_hygiene_reviews r ON r.execution_id = e.id
    WHERE e.clinic_id = p_clinic_id AND e.room_id = p_room_id AND e.submitted_at IS NOT NULL AND r.id IS NULL) THEN
    RAISE EXCEPTION 'A inspeção da higienização anterior ainda está pendente' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.room_hygiene_executions(clinic_id, room_id, checklist_version_id, started_by)
  VALUES (p_clinic_id, p_room_id, v_checklist, p_actor_id) RETURNING id INTO v_execution;
  UPDATE public.salas SET status = 'limpeza' WHERE id = p_room_id AND clinica_id = p_clinic_id;
  INSERT INTO public.room_hygiene_audit(clinic_id, room_id, execution_id, actor_id, action)
  VALUES (p_clinic_id, p_room_id, v_execution, p_actor_id, 'started');
  RETURN v_execution;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_room_hygiene_execution(
  p_clinic_id uuid, p_actor_id uuid, p_execution_id uuid, p_completed_items jsonb, p_notes text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_execution public.room_hygiene_executions%ROWTYPE; v_items jsonb;
BEGIN
  IF p_clinic_id IS DISTINCT FROM (SELECT p.clinica_id FROM public.profiles p WHERE p.id = p_actor_id AND p.ativo IS TRUE) OR NOT (
    public.is_admin(p_actor_id) OR public.is_recepcao(p_actor_id) OR public.is_enfermagem(p_actor_id)
  ) THEN RAISE EXCEPTION 'Acesso não autorizado' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_execution FROM public.room_hygiene_executions e
   WHERE e.id = p_execution_id AND e.clinic_id = p_clinic_id FOR UPDATE;
  IF NOT FOUND OR v_execution.submitted_at IS NOT NULL THEN RAISE EXCEPTION 'Execução indisponível' USING ERRCODE = '40001'; END IF;
  SELECT items INTO v_items FROM public.room_hygiene_checklist_versions WHERE id = v_execution.checklist_version_id AND clinic_id = p_clinic_id;
  IF jsonb_typeof(p_completed_items) <> 'array' OR jsonb_array_length(p_completed_items) <> jsonb_array_length(v_items)
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_completed_items) c
       WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_items) i
         WHERE i->>'id' = c->>'id' AND i->>'label' = c->>'label' AND i->>'required' = c->>'required'))
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_items) i WHERE COALESCE((i->>'required')::boolean, false)
       AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_completed_items) c WHERE c->>'id' = i->>'id' AND c->>'completed' = 'true')) THEN
    RAISE EXCEPTION 'Conclua todos os itens obrigatórios antes de enviar para revisão' USING ERRCODE = '23514';
  END IF;
  UPDATE public.room_hygiene_executions SET submitted_at = now(), submitted_by = p_actor_id,
    completed_items = p_completed_items, notes = NULLIF(trim(p_notes), '') WHERE id = p_execution_id;
  INSERT INTO public.room_hygiene_audit(clinic_id, room_id, execution_id, actor_id, action)
  VALUES (p_clinic_id, v_execution.room_id, p_execution_id, p_actor_id, 'submitted');
END;
$$;

CREATE OR REPLACE FUNCTION public.review_room_hygiene_execution(
  p_clinic_id uuid, p_actor_id uuid, p_execution_id uuid, p_decision text, p_note text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_execution public.room_hygiene_executions%ROWTYPE;
BEGIN
  IF p_clinic_id IS DISTINCT FROM (SELECT p.clinica_id FROM public.profiles p WHERE p.id = p_actor_id AND p.ativo IS TRUE) OR NOT (
    public.is_admin(p_actor_id) OR public.is_enfermagem(p_actor_id)
  ) THEN RAISE EXCEPTION 'Acesso não autorizado' USING ERRCODE = '42501'; END IF;
  IF p_decision NOT IN ('approved', 'rejected') OR length(trim(p_note)) NOT BETWEEN 3 AND 1000 THEN
    RAISE EXCEPTION 'Decisão inválida' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_execution FROM public.room_hygiene_executions e
   WHERE e.id = p_execution_id AND e.clinic_id = p_clinic_id AND e.submitted_at IS NOT NULL FOR UPDATE;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM public.room_hygiene_reviews r WHERE r.execution_id = p_execution_id) THEN
    RAISE EXCEPTION 'Execução já revisada ou indisponível' USING ERRCODE = '40001';
  END IF;
  IF p_decision = 'approved' AND EXISTS (
    SELECT 1 FROM jsonb_array_elements((SELECT items FROM public.room_hygiene_checklist_versions WHERE id = v_execution.checklist_version_id)) i
    WHERE COALESCE((i->>'required')::boolean, false) AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_execution.completed_items) c WHERE c->>'id' = i->>'id' AND c->>'completed' = 'true'
    )
  ) THEN RAISE EXCEPTION 'Há itens obrigatórios pendentes' USING ERRCODE = '23514'; END IF;
  INSERT INTO public.room_hygiene_reviews(clinic_id, execution_id, reviewer_id, decision, note)
  VALUES (p_clinic_id, p_execution_id, p_actor_id, p_decision, trim(p_note));
  IF p_decision = 'approved' THEN
    UPDATE public.salas SET status = 'disponivel' WHERE id = v_execution.room_id AND clinica_id = p_clinic_id AND status = 'limpeza';
    IF NOT FOUND THEN RAISE EXCEPTION 'A sala não está aguardando liberação' USING ERRCODE = '40001'; END IF;
  END IF;
  INSERT INTO public.room_hygiene_audit(clinic_id, room_id, execution_id, actor_id, action)
  VALUES (p_clinic_id, v_execution.room_id, p_execution_id, p_actor_id, p_decision);
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_room_hygiene_immutability()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_TABLE_NAME IN ('room_hygiene_checklist_versions', 'room_hygiene_reviews', 'room_hygiene_audit') THEN
    RAISE EXCEPTION 'Registro imutável' USING ERRCODE = '42501';
  END IF;
  IF OLD.submitted_at IS NOT NULL OR NEW.id IS DISTINCT FROM OLD.id OR NEW.clinic_id IS DISTINCT FROM OLD.clinic_id
     OR NEW.room_id IS DISTINCT FROM OLD.room_id OR NEW.checklist_version_id IS DISTINCT FROM OLD.checklist_version_id
     OR NEW.started_by IS DISTINCT FROM OLD.started_by OR NEW.started_at IS DISTINCT FROM OLD.started_at
     OR NEW.submitted_at IS NULL OR NEW.submitted_by IS NULL OR jsonb_typeof(NEW.completed_items) <> 'array' THEN
    RAISE EXCEPTION 'Execução imutável' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_room_hygiene_room_release()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF ((OLD.status = 'limpeza' AND NEW.status = 'disponivel') OR (OLD.status = 'ocupado' AND NEW.status = 'disponivel'))
     AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'A sala só pode ser liberada após inspeção aprovada' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS room_hygiene_require_approved_release ON public.salas;
CREATE TRIGGER room_hygiene_require_approved_release BEFORE UPDATE OF status ON public.salas
  FOR EACH ROW EXECUTE FUNCTION public.protect_room_hygiene_room_release();
DROP TRIGGER IF EXISTS room_hygiene_execution_immutable ON public.room_hygiene_executions;
CREATE TRIGGER room_hygiene_execution_immutable BEFORE UPDATE ON public.room_hygiene_executions
  FOR EACH ROW EXECUTE FUNCTION public.protect_room_hygiene_immutability();
DROP TRIGGER IF EXISTS room_hygiene_execution_no_delete ON public.room_hygiene_executions;
CREATE TRIGGER room_hygiene_execution_no_delete BEFORE DELETE ON public.room_hygiene_executions
  FOR EACH ROW EXECUTE FUNCTION public.protect_room_hygiene_immutability();
DROP TRIGGER IF EXISTS room_hygiene_checklist_no_update ON public.room_hygiene_checklist_versions;
CREATE TRIGGER room_hygiene_checklist_no_update BEFORE UPDATE ON public.room_hygiene_checklist_versions
  FOR EACH ROW EXECUTE FUNCTION public.protect_room_hygiene_immutability();
DROP TRIGGER IF EXISTS room_hygiene_checklist_no_delete ON public.room_hygiene_checklist_versions;
CREATE TRIGGER room_hygiene_checklist_no_delete BEFORE DELETE ON public.room_hygiene_checklist_versions
  FOR EACH ROW EXECUTE FUNCTION public.protect_room_hygiene_immutability();
DROP TRIGGER IF EXISTS room_hygiene_review_no_update ON public.room_hygiene_reviews;
CREATE TRIGGER room_hygiene_review_no_update BEFORE UPDATE ON public.room_hygiene_reviews
  FOR EACH ROW EXECUTE FUNCTION public.protect_room_hygiene_immutability();
DROP TRIGGER IF EXISTS room_hygiene_review_no_delete ON public.room_hygiene_reviews;
CREATE TRIGGER room_hygiene_review_no_delete BEFORE DELETE ON public.room_hygiene_reviews
  FOR EACH ROW EXECUTE FUNCTION public.protect_room_hygiene_immutability();
DROP TRIGGER IF EXISTS room_hygiene_audit_no_update ON public.room_hygiene_audit;
CREATE TRIGGER room_hygiene_audit_no_update BEFORE UPDATE ON public.room_hygiene_audit
  FOR EACH ROW EXECUTE FUNCTION public.protect_room_hygiene_immutability();
DROP TRIGGER IF EXISTS room_hygiene_audit_no_delete ON public.room_hygiene_audit;
CREATE TRIGGER room_hygiene_audit_no_delete BEFORE DELETE ON public.room_hygiene_audit
  FOR EACH ROW EXECUTE FUNCTION public.protect_room_hygiene_immutability();

REVOKE ALL ON FUNCTION public.create_room_hygiene_checklist(uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.start_room_hygiene_execution(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_room_hygiene_execution(uuid,uuid,uuid,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_room_hygiene_execution(uuid,uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_room_hygiene_checklist(uuid,uuid,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.start_room_hygiene_execution(uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_room_hygiene_execution(uuid,uuid,uuid,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_room_hygiene_execution(uuid,uuid,uuid,text,text) TO service_role;

COMMIT;

INSERT INTO supabase_migrations.schema_migrations (version)
  VALUES ('20261014210500') ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------
-- 20261014220000_whatsapp_active_human_takeover
-- ----------------------------------------------------------------
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.assumir_conversa_whatsapp(_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Somente administrador pode usar o Agente de IA';
  END IF;

  UPDATE public.whatsapp_conversations
     SET status = 'em_atendimento_humano',
         responsavel_id = auth.uid(),
         atendimento_humano_em = COALESCE(atendimento_humano_em, now()),
         nao_lidas = 0
   WHERE id = _conversation_id
     AND clinica_id = public.get_my_clinica_id()
     AND status IN ('aguardando_humano', 'ativo')
     AND (responsavel_id IS NULL OR responsavel_id = auth.uid());
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversa já assumida ou indisponível'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assumir_conversa_whatsapp(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assumir_conversa_whatsapp(uuid) TO authenticated;
COMMIT;

INSERT INTO supabase_migrations.schema_migrations (version)
  VALUES ('20261014220000') ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------
-- 20261014220500_patrimonio_manutencao_equipamentos
-- ----------------------------------------------------------------
BEGIN;

CREATE TABLE IF NOT EXISTS public.clinic_equipment_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  room_id uuid REFERENCES public.salas(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 160),
  category text NOT NULL CHECK (category IN ('clinical', 'diagnostic', 'it', 'facility', 'other')),
  manufacturer text CHECK (manufacturer IS NULL OR length(manufacturer) <= 120),
  model text CHECK (model IS NULL OR length(model) <= 120),
  serial_number text CHECK (serial_number IS NULL OR length(serial_number) <= 120),
  asset_tag text CHECK (asset_tag IS NULL OR length(asset_tag) <= 80),
  acquired_on date,
  warranty_until date,
  calibration_due date,
  maintenance_interval_days integer CHECK (maintenance_interval_days IS NULL OR maintenance_interval_days BETWEEN 1 AND 3650),
  responsible_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'unavailable', 'retired')),
  block_room_when_unavailable boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, asset_tag)
);

CREATE TABLE IF NOT EXISTS public.clinic_equipment_work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.clinic_equipment_assets(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('preventive', 'corrective', 'calibration', 'inspection')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 3 AND 160),
  description text CHECK (description IS NULL OR length(description) <= 2000),
  due_on date,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  opened_by uuid NOT NULL REFERENCES auth.users(id),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  completion_note text CHECK (completion_note IS NULL OR length(completion_note) <= 2000),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'completed' AND completed_at IS NOT NULL) OR (status <> 'completed' AND completed_at IS NULL))
);
CREATE INDEX IF NOT EXISTS clinic_equipment_orders_due ON public.clinic_equipment_work_orders (clinic_id, status, due_on);
CREATE INDEX IF NOT EXISTS clinic_equipment_assets_calibration ON public.clinic_equipment_assets (clinic_id, calibration_due);

CREATE TABLE IF NOT EXISTS public.clinic_equipment_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.clinic_equipment_assets(id) ON DELETE RESTRICT,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL CHECK (length(trim(file_name)) BETWEEN 1 AND 180),
  content_type text NOT NULL CHECK (content_type IN ('application/pdf', 'image/jpeg', 'image/png')),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 10485760),
  uploaded_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clinic_equipment_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clinic_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES public.clinic_equipment_assets(id) ON DELETE SET NULL,
  work_order_id uuid REFERENCES public.clinic_equipment_work_orders(id) ON DELETE SET NULL,
  document_id uuid REFERENCES public.clinic_equipment_documents(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('asset_created', 'asset_updated', 'order_created', 'order_updated', 'document_added')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clinic_equipment_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_equipment_work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_equipment_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_equipment_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.clinic_equipment_assets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.clinic_equipment_work_orders FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.clinic_equipment_documents FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.clinic_equipment_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.clinic_equipment_assets TO service_role;
GRANT ALL ON TABLE public.clinic_equipment_work_orders TO service_role;
GRANT ALL ON TABLE public.clinic_equipment_documents TO service_role;
GRANT ALL ON TABLE public.clinic_equipment_audit TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.clinic_equipment_audit_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.validate_clinic_equipment_asset()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_room_clinic uuid; v_user_clinic uuid; v_user_active boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.clinic_id IS DISTINCT FROM OLD.clinic_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
    RAISE EXCEPTION 'Identidade do ativo é imutável' USING ERRCODE = '42501';
  END IF;
  IF NEW.room_id IS NOT NULL THEN
    SELECT s.clinica_id INTO v_room_clinic FROM public.salas s WHERE s.id = NEW.room_id;
    IF v_room_clinic IS DISTINCT FROM NEW.clinic_id THEN RAISE EXCEPTION 'Sala de outra clínica' USING ERRCODE = '23514'; END IF;
  END IF;
  IF NEW.responsible_user_id IS NOT NULL THEN
    SELECT p.clinica_id, p.ativo INTO v_user_clinic, v_user_active FROM public.profiles p WHERE p.id = NEW.responsible_user_id;
    IF v_user_clinic IS DISTINCT FROM NEW.clinic_id OR v_user_active IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Responsável deve estar ativo na mesma clínica' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.clinica_id = NEW.clinic_id AND p.ativo IS TRUE
  ) THEN RAISE EXCEPTION 'Acesso não autorizado' USING ERRCODE = '42501'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS clinic_equipment_asset_validate ON public.clinic_equipment_assets;
CREATE TRIGGER clinic_equipment_asset_validate BEFORE INSERT OR UPDATE ON public.clinic_equipment_assets
  FOR EACH ROW EXECUTE FUNCTION public.validate_clinic_equipment_asset();

CREATE OR REPLACE FUNCTION public.validate_clinic_equipment_work_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_asset_clinic uuid; v_assignee_clinic uuid; v_assignee_active boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.clinic_id IS DISTINCT FROM OLD.clinic_id
     OR NEW.asset_id IS DISTINCT FROM OLD.asset_id OR NEW.opened_by IS DISTINCT FROM OLD.opened_by OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
    RAISE EXCEPTION 'Identidade da ordem é imutável' USING ERRCODE = '42501';
  END IF;
  SELECT a.clinic_id INTO v_asset_clinic FROM public.clinic_equipment_assets a WHERE a.id = NEW.asset_id;
  IF v_asset_clinic IS DISTINCT FROM NEW.clinic_id THEN RAISE EXCEPTION 'Ativo de outra clínica' USING ERRCODE = '23514'; END IF;
  IF NEW.assigned_to IS NOT NULL THEN
    SELECT p.clinica_id, p.ativo INTO v_assignee_clinic, v_assignee_active FROM public.profiles p WHERE p.id = NEW.assigned_to;
    IF v_assignee_clinic IS DISTINCT FROM NEW.clinic_id OR v_assignee_active IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Responsável deve estar ativo na mesma clínica' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN NEW.completed_at := now(); END IF;
  IF NEW.status <> 'completed' THEN NEW.completed_at := NULL; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS clinic_equipment_order_validate ON public.clinic_equipment_work_orders;
CREATE TRIGGER clinic_equipment_order_validate BEFORE INSERT OR UPDATE ON public.clinic_equipment_work_orders
  FOR EACH ROW EXECUTE FUNCTION public.validate_clinic_equipment_work_order();

CREATE OR REPLACE FUNCTION public.validate_clinic_equipment_document()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_asset_clinic uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'Documento registrado é imutável' USING ERRCODE = '42501'; END IF;
  SELECT a.clinic_id INTO v_asset_clinic FROM public.clinic_equipment_assets a WHERE a.id = NEW.asset_id;
  IF v_asset_clinic IS DISTINCT FROM NEW.clinic_id THEN RAISE EXCEPTION 'Ativo de outra clínica' USING ERRCODE = '23514'; END IF;
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.clinica_id = NEW.clinic_id AND p.ativo IS TRUE
  ) THEN RAISE EXCEPTION 'Acesso não autorizado' USING ERRCODE = '42501'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS clinic_equipment_document_validate ON public.clinic_equipment_documents;
CREATE TRIGGER clinic_equipment_document_validate BEFORE INSERT OR UPDATE ON public.clinic_equipment_documents
  FOR EACH ROW EXECUTE FUNCTION public.validate_clinic_equipment_document();

CREATE OR REPLACE FUNCTION public.audit_clinic_equipment_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor uuid; v_asset_id uuid; v_order_id uuid; v_doc_id uuid; v_action text; v_details jsonb;
BEGIN
  IF TG_TABLE_NAME = 'clinic_equipment_assets' THEN
    v_actor := COALESCE(auth.uid(), NEW.updated_by, NEW.created_by);
    v_asset_id := NEW.id; v_action := CASE WHEN TG_OP = 'INSERT' THEN 'asset_created' ELSE 'asset_updated' END;
    v_details := jsonb_build_object('status', NEW.status, 'room_id', NEW.room_id, 'calibration_due', NEW.calibration_due);
  ELSIF TG_TABLE_NAME = 'clinic_equipment_work_orders' THEN
    v_actor := COALESCE(auth.uid(), NEW.updated_by, NEW.opened_by);
    v_asset_id := NEW.asset_id; v_order_id := NEW.id;
    v_action := CASE WHEN TG_OP = 'INSERT' THEN 'order_created' ELSE 'order_updated' END;
    v_details := jsonb_build_object('kind', NEW.kind, 'status', NEW.status, 'priority', NEW.priority, 'due_on', NEW.due_on);
  ELSE
    v_actor := COALESCE(auth.uid(), NEW.uploaded_by);
    v_asset_id := NEW.asset_id; v_doc_id := NEW.id; v_action := 'document_added';
    v_details := jsonb_build_object('content_type', NEW.content_type, 'byte_size', NEW.byte_size);
  END IF;
  INSERT INTO public.clinic_equipment_audit(clinic_id, asset_id, work_order_id, document_id, actor_id, action, details)
  VALUES (NEW.clinic_id, v_asset_id, v_order_id, v_doc_id, v_actor, v_action, v_details);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS clinic_equipment_asset_audit ON public.clinic_equipment_assets;
CREATE TRIGGER clinic_equipment_asset_audit AFTER INSERT OR UPDATE ON public.clinic_equipment_assets
  FOR EACH ROW EXECUTE FUNCTION public.audit_clinic_equipment_change();
DROP TRIGGER IF EXISTS clinic_equipment_order_audit ON public.clinic_equipment_work_orders;
CREATE TRIGGER clinic_equipment_order_audit AFTER INSERT OR UPDATE ON public.clinic_equipment_work_orders
  FOR EACH ROW EXECUTE FUNCTION public.audit_clinic_equipment_change();
DROP TRIGGER IF EXISTS clinic_equipment_document_audit ON public.clinic_equipment_documents;
CREATE TRIGGER clinic_equipment_document_audit AFTER INSERT ON public.clinic_equipment_documents
  FOR EACH ROW EXECUTE FUNCTION public.audit_clinic_equipment_change();

CREATE OR REPLACE FUNCTION public.sync_clinic_equipment_room_block()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.room_id IS NOT NULL AND NEW.block_room_when_unavailable AND NEW.status IN ('maintenance', 'unavailable', 'retired') THEN
    UPDATE public.salas SET status = 'manutencao'
     WHERE id = NEW.room_id AND clinica_id = NEW.clinic_id AND status = 'disponivel';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS clinic_equipment_block_room ON public.clinic_equipment_assets;
CREATE TRIGGER clinic_equipment_block_room AFTER INSERT OR UPDATE
  ON public.clinic_equipment_assets FOR EACH ROW EXECUTE FUNCTION public.sync_clinic_equipment_room_block();

CREATE OR REPLACE FUNCTION public.protect_room_equipment_availability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'disponivel' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) AND EXISTS (
    SELECT 1 FROM public.clinic_equipment_assets a WHERE a.room_id = NEW.id AND a.clinic_id = NEW.clinica_id
      AND a.block_room_when_unavailable AND a.status IN ('maintenance', 'unavailable', 'retired')
  ) THEN RAISE EXCEPTION 'A sala tem equipamento indisponível que bloqueia sua liberação' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS clinic_equipment_room_availability ON public.salas;
CREATE TRIGGER clinic_equipment_room_availability BEFORE INSERT OR UPDATE ON public.salas
  FOR EACH ROW EXECUTE FUNCTION public.protect_room_equipment_availability();

CREATE OR REPLACE FUNCTION public.protect_room_hygiene_room_release()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF ((OLD.status = 'limpeza' AND NEW.status = 'disponivel') OR (OLD.status = 'ocupado' AND NEW.status = 'disponivel'))
     AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'A sala só pode ser liberada após inspeção aprovada' USING ERRCODE = '42501';
  END IF;
  IF NEW.status = 'disponivel' AND EXISTS (
    SELECT 1 FROM public.clinic_equipment_assets a WHERE a.room_id = NEW.id AND a.clinic_id = NEW.clinica_id
      AND a.block_room_when_unavailable AND a.status IN ('maintenance', 'unavailable', 'retired')
  ) THEN RAISE EXCEPTION 'A sala tem equipamento indisponível que bloqueia sua liberação' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_clinic_equipment_immutable_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Registro histórico de equipamento é imutável' USING ERRCODE = '42501';
END;
$$;
DROP TRIGGER IF EXISTS clinic_equipment_asset_no_delete ON public.clinic_equipment_assets;
CREATE TRIGGER clinic_equipment_asset_no_delete BEFORE DELETE ON public.clinic_equipment_assets
  FOR EACH ROW EXECUTE FUNCTION public.reject_clinic_equipment_immutable_change();
DROP TRIGGER IF EXISTS clinic_equipment_order_no_delete ON public.clinic_equipment_work_orders;
CREATE TRIGGER clinic_equipment_order_no_delete BEFORE DELETE ON public.clinic_equipment_work_orders
  FOR EACH ROW EXECUTE FUNCTION public.reject_clinic_equipment_immutable_change();

INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('clinic-equipment-documents', 'clinic-equipment-documents', false, 10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png'];

DROP POLICY IF EXISTS clinic_equipment_docs_upload ON storage.objects;
DROP POLICY IF EXISTS clinic_equipment_docs_upload ON storage.objects;
CREATE POLICY clinic_equipment_docs_upload ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'clinic-equipment-documents' AND (storage.foldername(name))[1] = public.get_my_clinica_id()::text
    AND (public.is_admin(auth.uid()) OR public.is_enfermagem(auth.uid()))
    AND EXISTS (SELECT 1 FROM public.clinic_equipment_assets a WHERE a.id = ((storage.foldername(name))[2])::uuid AND a.clinic_id = public.get_my_clinica_id()));
DROP POLICY IF EXISTS clinic_equipment_docs_read ON storage.objects;
DROP POLICY IF EXISTS clinic_equipment_docs_read ON storage.objects;
CREATE POLICY clinic_equipment_docs_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'clinic-equipment-documents' AND (storage.foldername(name))[1] = public.get_my_clinica_id()::text
    AND (public.is_admin(auth.uid()) OR public.is_enfermagem(auth.uid())));
DROP TRIGGER IF EXISTS clinic_equipment_audit_no_update ON public.clinic_equipment_audit;
CREATE TRIGGER clinic_equipment_audit_no_update BEFORE UPDATE ON public.clinic_equipment_audit
  FOR EACH ROW EXECUTE FUNCTION public.reject_clinic_equipment_immutable_change();
DROP TRIGGER IF EXISTS clinic_equipment_audit_no_delete ON public.clinic_equipment_audit;
CREATE TRIGGER clinic_equipment_audit_no_delete BEFORE DELETE ON public.clinic_equipment_audit
  FOR EACH ROW EXECUTE FUNCTION public.reject_clinic_equipment_immutable_change();
DROP TRIGGER IF EXISTS clinic_equipment_document_no_update ON public.clinic_equipment_documents;
CREATE TRIGGER clinic_equipment_document_no_update BEFORE UPDATE ON public.clinic_equipment_documents
  FOR EACH ROW EXECUTE FUNCTION public.reject_clinic_equipment_immutable_change();
DROP TRIGGER IF EXISTS clinic_equipment_document_no_delete ON public.clinic_equipment_documents;
CREATE TRIGGER clinic_equipment_document_no_delete BEFORE DELETE ON public.clinic_equipment_documents
  FOR EACH ROW EXECUTE FUNCTION public.reject_clinic_equipment_immutable_change();

REVOKE ALL ON FUNCTION public.validate_clinic_equipment_asset() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_clinic_equipment_work_order() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_clinic_equipment_document() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_clinic_equipment_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_clinic_equipment_room_block() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_room_equipment_availability() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_clinic_equipment_immutable_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_clinic_equipment_asset() TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_clinic_equipment_work_order() TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_clinic_equipment_document() TO service_role;
GRANT EXECUTE ON FUNCTION public.audit_clinic_equipment_change() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_clinic_equipment_room_block() TO service_role;
GRANT EXECUTE ON FUNCTION public.protect_room_equipment_availability() TO service_role;
GRANT EXECUTE ON FUNCTION public.reject_clinic_equipment_immutable_change() TO service_role;

COMMIT;

INSERT INTO supabase_migrations.schema_migrations (version)
  VALUES ('20261014220500') ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------
-- 20261014230000_whatsapp_agenda_actions
-- ----------------------------------------------------------------
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS motivo_cancelamento text;

CREATE OR REPLACE FUNCTION public.confirmar_acao_agenda_whatsapp(
  p_conversation_id uuid, p_clinica_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_conversation public.whatsapp_conversations%ROWTYPE;
  v_appointment public.agendamentos%ROWTYPE;
  v_pending jsonb;
  v_args jsonb;
  v_action text;
  v_capability text;
  v_habilidades text[];
  v_phone text;
  v_patient_phone text;
  v_phone_count integer;
  v_appointment_id uuid;
  v_doctor_id uuid;
  v_date date;
  v_start time;
  v_end time;
  v_duration integer;
  v_reason text;
  v_message text;
  v_result jsonb;
BEGIN
  SELECT * INTO v_conversation FROM public.whatsapp_conversations
   WHERE id = p_conversation_id FOR UPDATE;
  IF NOT FOUND OR p_clinica_id IS NULL
     OR v_conversation.clinica_id IS DISTINCT FROM p_clinica_id
     OR v_conversation.status IS DISTINCT FROM 'ativo'
     OR v_conversation.responsavel_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Esta conversa não está disponível para ações automáticas.');
  END IF;
  IF v_conversation.acao_pendente IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Não há uma ação aguardando confirmação.');
  END IF;
  v_pending := v_conversation.acao_pendente;
  IF (v_pending->>'expires_at')::timestamptz IS NULL
     OR (v_pending->>'expires_at')::timestamptz <= clock_timestamp() THEN
    UPDATE public.whatsapp_conversations SET acao_pendente = NULL WHERE id = p_conversation_id;
    RETURN jsonb_build_object('success', false, 'message', 'A confirmação expirou. Solicite a operação novamente.');
  END IF;
  v_action := v_pending->>'action';
  v_args := v_pending->'args';
  IF v_action IS NULL OR v_action NOT IN (
    'criar_agendamento', 'cancelar_agendamento', 'reagendar_agendamento', 'confirmar_presenca'
  ) OR jsonb_typeof(v_args) IS DISTINCT FROM 'object' THEN
    RETURN jsonb_build_object('success', false, 'message', 'A ação pendente é inválida.');
  END IF;
  v_capability := CASE WHEN v_action = 'confirmar_presenca'
    THEN 'consultar_agendamentos_paciente' ELSE v_action END;
  SELECT a.habilidades INTO v_habilidades
    FROM public.whatsapp_sessions s JOIN public.whatsapp_agents a ON a.id = s.agent_id
   WHERE s.id = v_conversation.session_id AND s.clinica_id = p_clinica_id
     AND a.clinica_id = p_clinica_id AND a.ativo IS TRUE
   FOR SHARE OF s, a;
  IF NOT FOUND OR NOT COALESCE(v_capability = ANY(v_habilidades), false) THEN
    RETURN jsonb_build_object('success', false, 'message', 'O agente não está autorizado a realizar esta ação.');
  END IF;

  -- Only an unambiguous, exact phone match can authorize patient writes.
  IF v_conversation.remote_jid !~ '^[0-9]+@(s\.whatsapp\.net|c\.us)$' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Não foi possível validar seu cadastro com segurança.');
  END IF;
  v_phone := split_part(v_conversation.remote_jid, '@', 1);
  IF length(v_phone) IN (12, 13) AND left(v_phone, 2) = '55' THEN
    v_phone := substring(v_phone FROM 3);
  END IF;
  IF length(v_phone) NOT IN (10, 11) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Não foi possível validar seu cadastro com segurança.');
  END IF;
  SELECT regexp_replace(COALESCE(p.telefone, ''), '[^0-9]', '', 'g') INTO v_patient_phone
    FROM public.pacientes p
   WHERE p.id = v_conversation.paciente_id AND p.clinica_id = p_clinica_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Não foi possível validar seu cadastro com segurança.');
  END IF;
  IF length(v_patient_phone) IN (12, 13) AND left(v_patient_phone, 2) = '55' THEN
    v_patient_phone := substring(v_patient_phone FROM 3);
  END IF;
  SELECT count(*) INTO v_phone_count FROM public.pacientes p
   WHERE p.clinica_id = p_clinica_id
     AND regexp_replace(COALESCE(p.telefone, ''), '[^0-9]', '', 'g') IN (v_phone, '55' || v_phone);
  IF v_patient_phone IS DISTINCT FROM v_phone OR v_phone_count <> 1 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Não foi possível validar seu cadastro com segurança.');
  END IF;

  IF v_action <> 'criar_agendamento' THEN
    v_appointment_id := (v_args->>'agendamento_id')::uuid;
    SELECT a.* INTO v_appointment FROM public.agendamentos a
     WHERE a.id = v_appointment_id AND a.clinica_id = p_clinica_id
       AND a.paciente_id = v_conversation.paciente_id FOR UPDATE;
    IF NOT FOUND OR v_appointment.status IS NULL
       OR v_appointment.status::text NOT IN ('agendado', 'confirmado')
       OR (v_appointment.data + v_appointment.hora_inicio) <= (clock_timestamp() AT TIME ZONE 'America/Sao_Paulo') THEN
      RETURN jsonb_build_object('success', false, 'message', 'A consulta não está disponível para esta alteração.');
    END IF;
  END IF;

  IF v_action IN ('criar_agendamento', 'reagendar_agendamento') THEN
    v_doctor_id := (v_args->>'medico_id')::uuid;
    IF COALESCE(v_args->>'data', '') !~ '^\d{4}-\d{2}-\d{2}$'
       OR COALESCE(v_args->>'hora_inicio', '') !~ '^([01]\d|2[0-3]):[0-5]\d(:00)?$' THEN
      RETURN jsonb_build_object('success', false, 'message', 'Informe uma data e um horário válidos.');
    END IF;
    v_date := (v_args->>'data')::date;
    v_start := (v_args->>'hora_inicio')::time;
    IF v_date + v_start <= (clock_timestamp() AT TIME ZONE 'America/Sao_Paulo') THEN
      RETURN jsonb_build_object('success', false, 'message', 'Escolha um horário futuro.');
    END IF;
    PERFORM 1 FROM public.medicos m WHERE m.id = v_doctor_id
      AND m.clinica_id = p_clinica_id AND m.ativo IS TRUE FOR SHARE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'message', 'O profissional não está disponível nesta clínica.');
    END IF;
    SELECT d.duracao_consulta INTO v_duration FROM public.medico_disponibilidade d
     WHERE d.medico_id = v_doctor_id AND d.ativo IS TRUE
       AND d.dia_semana = extract(dow FROM v_date)::integer
       AND d.duracao_consulta > 0 AND d.intervalo_consultas >= 0
       AND v_start >= d.hora_inicio
       AND extract(epoch FROM (v_start - d.hora_inicio)) + d.duracao_consulta * 60
           <= extract(epoch FROM (d.hora_fim - d.hora_inicio))
       AND mod(extract(epoch FROM (v_start - d.hora_inicio)),
         (d.duracao_consulta + d.intervalo_consultas) * 60) = 0
     ORDER BY d.hora_inicio, d.id LIMIT 1 FOR SHARE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'message', 'Esse horário não faz parte da agenda disponível do profissional.');
    END IF;
    v_end := v_start + make_interval(mins => v_duration);
    PERFORM pg_advisory_xact_lock(hashtext(v_doctor_id::text), v_date - DATE '2000-01-01');
    IF EXISTS (SELECT 1 FROM public.bloqueios_agenda b
      WHERE b.clinica_id = p_clinica_id AND b.medico_id = v_doctor_id
        AND v_date BETWEEN b.data_inicio AND b.data_fim
        AND (COALESCE(b.dia_inteiro, true) OR (v_start < b.hora_fim AND v_end > b.hora_inicio))) THEN
      RETURN jsonb_build_object('success', false, 'message', 'Esse horário está bloqueado. Escolha outro horário.');
    END IF;
  END IF;

  IF v_action = 'cancelar_agendamento' THEN
    v_reason := nullif(btrim(v_args->>'motivo'), '');
    IF v_reason IS NULL THEN
      RETURN jsonb_build_object('success', false, 'message', 'Informe o motivo do cancelamento.');
    END IF;
    UPDATE public.agendamentos SET status = 'cancelado', motivo_cancelamento = v_reason
     WHERE id = v_appointment_id;
    v_message := 'Sua consulta foi cancelada.';
  ELSIF v_action = 'confirmar_presenca' THEN
    IF v_appointment.status::text <> 'agendado' THEN
      RETURN jsonb_build_object('success', false, 'message', 'A presença nesta consulta já está confirmada.');
    END IF;
    UPDATE public.agendamentos SET status = 'confirmado' WHERE id = v_appointment_id;
    v_message := 'Sua presença na consulta foi confirmada.';
  ELSIF v_action = 'reagendar_agendamento' THEN
    UPDATE public.agendamentos
       SET medico_id = v_doctor_id, data = v_date, hora_inicio = v_start, hora_fim = v_end
     WHERE id = v_appointment_id;
    v_message := 'Sua consulta foi remarcada para ' || to_char(v_date, 'DD/MM/YYYY') || ' às ' || to_char(v_start, 'HH24:MI') || '.';
  ELSE
    INSERT INTO public.agendamentos (clinica_id, paciente_id, medico_id, data, hora_inicio, hora_fim, status, tipo)
    VALUES (p_clinica_id, v_conversation.paciente_id, v_doctor_id, v_date, v_start, v_end, 'agendado', 'consulta')
    RETURNING id INTO v_appointment_id;
    v_message := 'Sua consulta foi agendada para ' || to_char(v_date, 'DD/MM/YYYY') || ' às ' || to_char(v_start, 'HH24:MI') || '.';
  END IF;
  v_result := jsonb_build_object('success', true, 'completed', true, 'agendamento_id', v_appointment_id, 'message', v_message);
  UPDATE public.whatsapp_conversations SET acao_pendente = NULL WHERE id = p_conversation_id;
  INSERT INTO public.whatsapp_agent_actions (clinica_id, conversation_id, tipo_acao, dados_entrada, dados_saida, sucesso)
  VALUES (p_clinica_id, p_conversation_id, v_action, v_args, v_result, true);
  RETURN v_result;
EXCEPTION
  WHEN exclusion_violation THEN
    RETURN jsonb_build_object('success', false, 'message', 'Esse horário está ocupado ou bloqueado. Escolha outro horário.');
  WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
    RETURN jsonb_build_object('success', false, 'message', 'A ação contém dados inválidos. Solicite a operação novamente.');
  WHEN check_violation OR foreign_key_violation THEN
    RETURN jsonb_build_object('success', false, 'message', 'A consulta não está disponível para esta alteração.');
END;
$$;

REVOKE ALL ON FUNCTION public.confirmar_acao_agenda_whatsapp(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_acao_agenda_whatsapp(uuid, uuid) TO service_role;
COMMIT;

INSERT INTO supabase_migrations.schema_migrations (version)
  VALUES ('20261014230000') ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------
-- 20261014230500_auditoria_acoes_documentos_clinicos
-- ----------------------------------------------------------------
BEGIN;

CREATE OR REPLACE FUNCTION public.registrar_acesso_documento_clinico(
  p_tipo text,
  p_documento_id uuid,
  p_acao text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paciente_id uuid;
  v_clinica_id uuid;
  v_user_nome text;
  v_audit_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_clinical(auth.uid())
     OR NOT (public.is_admin(auth.uid()) OR public.is_medico(auth.uid())) THEN
    RAISE EXCEPTION 'Acesso clínico não autorizado' USING ERRCODE = '42501';
  END IF;
  IF p_tipo NOT IN ('anexo_prontuario', 'prescricao', 'atestado', 'encaminhamento')
     OR p_acao NOT IN ('visualizacao', 'impressao', 'exportacao') THEN
    RAISE EXCEPTION 'Tipo ou ação de auditoria inválida' USING ERRCODE = '22023';
  END IF;

  CASE p_tipo
    WHEN 'anexo_prontuario' THEN
      SELECT a.paciente_id INTO v_paciente_id
        FROM public.anexos_prontuario a WHERE a.id = p_documento_id;
    WHEN 'prescricao' THEN
      SELECT p.paciente_id INTO v_paciente_id
        FROM public.prescricoes p WHERE p.id = p_documento_id;
    WHEN 'atestado' THEN
      SELECT a.paciente_id INTO v_paciente_id
        FROM public.atestados a WHERE a.id = p_documento_id;
    WHEN 'encaminhamento' THEN
      SELECT e.paciente_id INTO v_paciente_id
        FROM public.encaminhamentos e WHERE e.id = p_documento_id;
  END CASE;

  SELECT p.clinica_id INTO v_clinica_id
    FROM public.pacientes p
   WHERE p.id = v_paciente_id
     AND public.is_same_clinica(p.clinica_id);
  IF v_clinica_id IS NULL THEN
    RAISE EXCEPTION 'Documento clínico não encontrado ou acesso negado' USING ERRCODE = '42501';
  END IF;

  SELECT p.nome INTO v_user_nome FROM public.profiles p WHERE p.id = auth.uid();
  INSERT INTO public.audit_log (
    user_id, user_name, clinica_id, action, collection, record_id, record_name, changes
  ) VALUES (
    auth.uid(), v_user_nome, v_clinica_id, 'access', 'documentos_clinicos',
    p_tipo || ':' || p_documento_id::text, NULL,
    jsonb_build_array(
      jsonb_build_object('field', 'event', 'newValue', p_acao),
      jsonb_build_object('field', 'document_type', 'newValue', p_tipo)
    )
  ) RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_acesso_documento_clinico(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_acesso_documento_clinico(text, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.registrar_acesso_documento_clinico(text, uuid, text) IS
  'Registra acesso/impressão/exportação de documento clínico autorizado sem copiar nome, conteúdo ou dados sensíveis para audit_log.';

COMMIT;

INSERT INTO supabase_migrations.schema_migrations (version)
  VALUES ('20261014230500') ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------
-- 20261014231000_patient_journey_automation
-- ----------------------------------------------------------------
BEGIN;

-- The queue owns retries and uncertain deliveries; producers only enqueue atomically.
ALTER TABLE public.notification_queue ADD COLUMN IF NOT EXISTS dedupe_key text;
CREATE UNIQUE INDEX IF NOT EXISTS notification_queue_journey_once
  ON public.notification_queue(clinica_id, tipo, dedupe_key);
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS jornada_finalizada_em timestamptz;
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS jornada_versao integer NOT NULL DEFAULT 0;
INSERT INTO public.automation_settings(clinica_id,chave,descricao,valor,ativo)
SELECT c.id,a.chave,a.descricao,'{}'::jsonb,false FROM public.clinicas c CROSS JOIN (VALUES
 ('pos_consulta_agradecimento','Agradecimento uma hora após finalizar a consulta'),
 ('pesquisa_satisfacao','Avaliação de 1 a 5, 24 horas após finalizar a consulta'),
 ('lembrete_retorno','Lembretes de retorno 7 dias e 1 dia antes')) a(chave,descricao)
ON CONFLICT(clinica_id,chave) DO NOTHING;

CREATE OR REPLACE FUNCTION public.enfileirar_mensagem_jornada(
 p_clinica_id uuid,p_paciente_id uuid,p_chave text,p_evento text,p_conteudo text,
 p_agendado_para timestamptz,p_extras jsonb,p_legacy_key text DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p record; s record; canal text; total integer:=0; n integer;
BEGIN
 SELECT * INTO s FROM automation_settings WHERE clinica_id=p_clinica_id AND chave=p_chave AND ativo=true;
 IF NOT FOUND THEN RETURN 0; END IF;
 SELECT * INTO p FROM pacientes WHERE id=p_paciente_id AND clinica_id=p_clinica_id;
 IF NOT FOUND THEN RETURN 0; END IF;
 FOR canal IN SELECT unnest(ARRAY['whatsapp','email']) LOOP
  IF (canal='email' AND nullif(trim(p.email),'') IS NULL)
    OR (canal='whatsapp' AND nullif(regexp_replace(p.telefone,'\D','','g'),'') IS NULL)
    OR s.valor->>canal='false' THEN CONTINUE; END IF;
  -- Keep previously delivered/uncertain legacy messages from being replayed after upgrade.
  IF EXISTS(SELECT 1 FROM automation_delivery_claims c WHERE c.clinica_id=p_clinica_id
    AND (c.chave=p_legacy_key||':'||canal OR (p_chave='confirmacao_agendamento' AND c.chave=p_legacy_key)))
    OR EXISTS(SELECT 1 FROM notification_queue q WHERE q.clinica_id=p_clinica_id AND q.tipo=canal
      AND q.dedupe_key IS NULL AND q.status<>'cancelado' AND (
       (q.dados_extras->>'agendamento_id'=p_extras->>'agendamento_id' AND (
        (p_chave='confirmacao_agendamento' AND q.dados_extras->>'tipo_notificacao' IN ('confirmacao','confirmacao_whatsapp','confirmacao_agendamento'))
        OR (p_chave='lembrete_consulta_24h' AND q.dados_extras->>'tipo_lembrete' IN ('24h','24h_whatsapp'))
        OR (p_chave='lembrete_consulta_2h' AND q.dados_extras->>'tipo_lembrete' IN ('2h','2h_whatsapp'))))
       OR (q.dados_extras->>'resultado_id'=p_extras->>'resultado_id')
       OR (q.dados_extras->>'retorno_id'=p_extras->>'retorno_id' AND q.dados_extras->>'dias_antes'=p_extras->>'dias_antes')
      )) THEN CONTINUE; END IF;
  INSERT INTO notification_queue(clinica_id,tipo,destinatario_id,destinatario_nome,destinatario_email,
    destinatario_telefone,assunto,conteudo,status,agendado_para,dedupe_key,dados_extras)
  VALUES(p_clinica_id,canal,p.id,p.nome,p.email,p.telefone,
    CASE p_chave WHEN 'confirmacao_agendamento' THEN 'Agendamento recebido'
      WHEN 'notificacao_resultado_exame' THEN 'Resultado disponível'
      WHEN 'pesquisa_satisfacao' THEN 'Como foi seu atendimento?'
      WHEN 'pos_consulta_agradecimento' THEN 'Obrigado pela visita'
      WHEN 'lembrete_retorno' THEN 'Lembrete de retorno' ELSE 'Lembrete de consulta' END,
    p_conteudo,'pendente',p_agendado_para,p_chave||':'||p_evento,
    p_extras||jsonb_build_object('automation_key',p_chave,'tipo_notificacao',p_chave,'journey',true)
      ||CASE WHEN p_chave IN ('lembrete_consulta_24h','lembrete_consulta_2h') THEN
       jsonb_build_object('tipo_lembrete',CASE p_chave WHEN 'lembrete_consulta_24h' THEN '24h' ELSE '2h' END||CASE canal WHEN 'whatsapp' THEN '_whatsapp' ELSE '' END)
       ELSE '{}'::jsonb END)
  ON CONFLICT(clinica_id,tipo,dedupe_key) DO NOTHING;
  GET DIAGNOSTICS n=ROW_COUNT; total:=total+n;
 END LOOP;
 RETURN total;
END; $$;

CREATE OR REPLACE FUNCTION public.enfileirar_jornada_paciente(
 p_clinica_id uuid DEFAULT NULL,p_agendamento_id uuid DEFAULT NULL,
 p_resultado_id uuid DEFAULT NULL,p_automation_key text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a record; r record; k text; due timestamptz; slot text; msg text; extra jsonb;
 total integer:=0; dias integer; local_hoje date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
 IF p_agendamento_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM agendamentos WHERE id=p_agendamento_id AND clinica_id=p_clinica_id) THEN
   RAISE EXCEPTION 'Consulta não encontrada nesta clínica' USING ERRCODE='P0002'; END IF;
 IF p_resultado_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM resultados_laboratorio x JOIN coletas_laboratorio c ON c.id=x.coleta_id
   WHERE x.id=p_resultado_id AND c.clinica_id=p_clinica_id AND x.liberado AND x.data_liberacao IS NOT NULL) THEN
   RAISE EXCEPTION 'Resultado liberado não encontrado nesta clínica' USING ERRCODE='P0002'; END IF;
 IF p_resultado_id IS NULL THEN
 FOR a IN SELECT ag.*,p.nome AS paciente_nome,c.nome AS clinica_nome,m.nome AS medico_nome
   FROM agendamentos ag JOIN pacientes p ON p.id=ag.paciente_id AND p.clinica_id=ag.clinica_id
   JOIN clinicas c ON c.id=ag.clinica_id LEFT JOIN medicos m ON m.id=ag.medico_id AND m.clinica_id=ag.clinica_id
   WHERE (p_clinica_id IS NULL OR ag.clinica_id=p_clinica_id)
     AND (p_agendamento_id IS NULL OR ag.id=p_agendamento_id)
     AND (p_agendamento_id IS NOT NULL OR ag.data BETWEEN local_hoje AND local_hoje+8 OR ag.jornada_finalizada_em>now()-interval '2 days')
 LOOP
  slot:=a.id||':'||a.data||':'||a.hora_inicio||':'||a.jornada_versao;
  extra:=jsonb_build_object('agendamento_id',a.id,'appointment_slot',a.data||'T'||a.hora_inicio,'appointment_version',a.jornada_versao);
  FOR k IN SELECT unnest(ARRAY['confirmacao_agendamento','lembrete_consulta_24h','lembrete_consulta_2h','pos_consulta_agradecimento','pesquisa_satisfacao']) LOOP
   IF p_automation_key IS NOT NULL AND k<>p_automation_key THEN CONTINUE; END IF;
   IF k IN ('pos_consulta_agradecimento','pesquisa_satisfacao') THEN
    IF a.status::text NOT IN ('finalizado','aguardando_pagamento_adicional') OR a.jornada_finalizada_em IS NULL THEN CONTINUE; END IF;
    due:=a.jornada_finalizada_em+CASE k WHEN 'pesquisa_satisfacao' THEN interval '24 hours' ELSE interval '1 hour' END;
    msg:=CASE k WHEN 'pesquisa_satisfacao' THEN format('Olá, %s! Como foi seu atendimento na %s? Responda com uma nota de 1 a 5 (1 = muito insatisfeito, 5 = muito satisfeito). Você também pode avaliar no portal do paciente.',a.paciente_nome,a.clinica_nome)
      ELSE format('Olá, %s! A %s agradece pela sua visita. Siga as orientações recebidas no atendimento. Se precisar de ajuda ou agendar seu retorno, fale com nossa equipe.',a.paciente_nome,a.clinica_nome) END;
    total:=total+enfileirar_mensagem_jornada(a.clinica_id,a.paciente_id,k,a.id::text,msg,due,extra);
   ELSE
    IF a.status::text NOT IN ('agendado','confirmado') OR (a.data+a.hora_inicio) AT TIME ZONE 'America/Sao_Paulo'<=now() THEN CONTINUE; END IF;
    IF k='confirmacao_agendamento' THEN
      IF p_agendamento_id IS NULL AND a.created_at<now()-interval '24 hours' THEN CONTINUE; END IF;
      due:=now();
    ELSE
      due:=(a.data+a.hora_inicio) AT TIME ZONE 'America/Sao_Paulo'-CASE k WHEN 'lembrete_consulta_24h' THEN interval '24 hours' ELSE interval '2 hours' END;
      IF due<now()-interval '1 hour' THEN CONTINUE; END IF;
    END IF;
    msg:=format('Olá, %s! %s na %s: %s às %s, com %s. Responda CONFIRMAR para confirmar presença, CANCELAR para cancelar ou REMARCAR para escolher outro horário.',
      a.paciente_nome,CASE k WHEN 'confirmacao_agendamento' THEN 'Seu agendamento foi recebido' ELSE 'Lembrete da consulta' END,
      a.clinica_nome,to_char(a.data,'DD/MM/YYYY'),to_char(a.hora_inicio,'HH24:MI'),coalesce(a.medico_nome,'nossa equipe'));
    total:=total+enfileirar_mensagem_jornada(a.clinica_id,a.paciente_id,k,slot,msg,greatest(now(),due),extra,
      'appointment:'||a.id||':'||CASE k WHEN 'confirmacao_agendamento' THEN 'confirmation' WHEN 'lembrete_consulta_24h' THEN '24h' ELSE '2h' END);
   END IF;
  END LOOP;
 END LOOP;
 END IF;
 IF p_agendamento_id IS NULL AND p_resultado_id IS NULL AND (p_automation_key IS NULL OR p_automation_key='lembrete_retorno') THEN
  FOR r IN SELECT rt.*,p.nome AS paciente_nome,c.nome AS clinica_nome FROM retornos rt
    JOIN pacientes p ON p.id=rt.paciente_id AND p.clinica_id=rt.clinica_id JOIN clinicas c ON c.id=rt.clinica_id
    WHERE rt.status IN ('pendente','agendado','confirmado') AND rt.data_retorno_prevista>=local_hoje
      AND (p_clinica_id IS NULL OR rt.clinica_id=p_clinica_id)
  LOOP
   FOREACH dias IN ARRAY ARRAY[7,1] LOOP
    due:=((r.data_retorno_prevista-dias)+time '09:00') AT TIME ZONE 'America/Sao_Paulo';
    IF due<now()-interval '1 day' THEN CONTINUE; END IF;
    msg:=format('Olá, %s! Seu retorno na %s está previsto para %s. Fale com nossa equipe para agendar ou confirmar o horário.',r.paciente_nome,r.clinica_nome,to_char(r.data_retorno_prevista,'DD/MM/YYYY'));
    total:=total+enfileirar_mensagem_jornada(r.clinica_id,r.paciente_id,'lembrete_retorno',r.id||':'||r.data_retorno_prevista||':'||dias,msg,greatest(now(),due),
      jsonb_build_object('retorno_id',r.id,'return_date',r.data_retorno_prevista,'dias_antes',dias));
   END LOOP;
  END LOOP;
 END IF;
 IF p_agendamento_id IS NULL AND (p_automation_key IS NULL OR p_automation_key='notificacao_resultado_exame') THEN
  FOR r IN SELECT x.id,c.paciente_id,c.clinica_id,p.nome AS paciente_nome,cl.nome AS clinica_nome
    FROM resultados_laboratorio x JOIN coletas_laboratorio c ON c.id=x.coleta_id
    JOIN pacientes p ON p.id=c.paciente_id AND p.clinica_id=c.clinica_id JOIN clinicas cl ON cl.id=c.clinica_id
    WHERE x.liberado AND x.data_liberacao IS NOT NULL AND (p_clinica_id IS NULL OR c.clinica_id=p_clinica_id)
      AND (x.id=p_resultado_id OR (p_resultado_id IS NULL AND x.data_liberacao>now()-interval '2 days'))
  LOOP
   total:=total+enfileirar_mensagem_jornada(r.clinica_id,r.paciente_id,'notificacao_resultado_exame',r.id::text,
    format('Olá, %s! Um resultado de exame está disponível na %s. Acesse o portal do paciente com sua identificação ou entre em contato com nossa equipe. Por privacidade, não enviamos o resultado por esta mensagem.',r.paciente_nome,r.clinica_nome),now(),jsonb_build_object('resultado_id',r.id));
  END LOOP;
 END IF;
 RETURN jsonb_build_object('enfileirados',total,'agendados',(
  SELECT count(*) FROM notification_queue q WHERE q.clinica_id=p_clinica_id AND q.status IN ('pendente','enviando')
   AND (q.dados_extras->>'agendamento_id'=p_agendamento_id::text OR q.dados_extras->>'resultado_id'=p_resultado_id::text)
   AND (p_automation_key IS NULL OR q.dados_extras->>'automation_key'=p_automation_key)),
  'enviados', (SELECT count(*) FROM notification_queue q WHERE q.clinica_id=p_clinica_id AND q.status='enviado'
   AND (q.dados_extras->>'agendamento_id'=p_agendamento_id::text OR q.dados_extras->>'resultado_id'=p_resultado_id::text)
   AND (p_automation_key IS NULL OR q.dados_extras->>'automation_key'=p_automation_key)));
END; $$;

-- Called immediately before the provider: disabled settings and stale source state fail closed.
CREATE OR REPLACE FUNCTION public.validar_notificacao_jornada(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q notification_queue%ROWTYPE; k text; valid boolean;
BEGIN
 SELECT * INTO q FROM notification_queue WHERE id=p_id;
 IF NOT FOUND THEN RETURN false; END IF;
 IF q.dados_extras->>'journey' IS DISTINCT FROM 'true' THEN RETURN true; END IF;
 k:=q.dados_extras->>'automation_key';
 SELECT EXISTS(SELECT 1 FROM automation_settings s WHERE s.clinica_id=q.clinica_id AND s.chave=k AND s.ativo
   AND s.valor->>q.tipo IS DISTINCT FROM 'false') INTO valid;
 valid:=valid AND EXISTS(SELECT 1 FROM pacientes p WHERE p.id=q.destinatario_id AND p.clinica_id=q.clinica_id
   AND CASE q.tipo WHEN 'email' THEN p.email=q.destinatario_email ELSE p.telefone=q.destinatario_telefone END);
 IF q.dados_extras ? 'agendamento_id' THEN
  valid:=valid AND EXISTS(SELECT 1 FROM agendamentos a WHERE a.id::text=q.dados_extras->>'agendamento_id' AND a.clinica_id=q.clinica_id AND a.paciente_id=q.destinatario_id
   AND CASE WHEN k IN ('pesquisa_satisfacao','pos_consulta_agradecimento') THEN a.status::text IN ('finalizado','aguardando_pagamento_adicional')
    ELSE a.status::text IN ('agendado','confirmado') AND a.data||'T'||a.hora_inicio=q.dados_extras->>'appointment_slot' AND a.jornada_versao::text=q.dados_extras->>'appointment_version'
      AND (a.data+a.hora_inicio) AT TIME ZONE 'America/Sao_Paulo'>now() END);
 ELSIF q.dados_extras ? 'retorno_id' THEN
  valid:=valid AND EXISTS(SELECT 1 FROM retornos r WHERE r.id::text=q.dados_extras->>'retorno_id' AND r.clinica_id=q.clinica_id AND r.paciente_id=q.destinatario_id
   AND r.status IN ('pendente','agendado','confirmado') AND r.data_retorno_prevista::text=q.dados_extras->>'return_date');
 ELSIF q.dados_extras ? 'resultado_id' THEN
  valid:=valid AND EXISTS(SELECT 1 FROM resultados_laboratorio x JOIN coletas_laboratorio c ON c.id=x.coleta_id
   WHERE x.id::text=q.dados_extras->>'resultado_id' AND c.clinica_id=q.clinica_id AND c.paciente_id=q.destinatario_id AND x.liberado AND x.data_liberacao IS NOT NULL);
 ELSE valid:=false;
 END IF;
 IF NOT coalesce(valid,false) THEN
   UPDATE notification_queue SET status='cancelado' WHERE id=q.id AND status IN ('pendente','enviando');
 END IF;
 RETURN coalesce(valid,false);
END; $$;

CREATE OR REPLACE FUNCTION public.jornada_agendamento_antes()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.data,NEW.hora_inicio,NEW.paciente_id,NEW.medico_id) IS DISTINCT FROM (OLD.data,OLD.hora_inicio,OLD.paciente_id,OLD.medico_id) THEN
   NEW.jornada_versao:=OLD.jornada_versao+1;
 END IF;
 IF NEW.status::text IN ('finalizado','aguardando_pagamento_adicional') AND NEW.jornada_finalizada_em IS NULL THEN
   NEW.jornada_finalizada_em:=now();
 END IF;
 RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION public.jornada_paciente_evento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q record;
BEGIN
 IF TG_TABLE_NAME='agendamentos' THEN
   FOR q IN SELECT id FROM notification_queue WHERE clinica_id=NEW.clinica_id AND dados_extras->>'agendamento_id'=NEW.id::text AND status='pendente' LOOP
    PERFORM validar_notificacao_jornada(q.id);
   END LOOP;
   PERFORM enfileirar_jornada_paciente(NEW.clinica_id,NEW.id);
 ELSIF TG_TABLE_NAME='retornos' THEN
   FOR q IN SELECT id FROM notification_queue WHERE dados_extras->>'retorno_id'=NEW.id::text AND status='pendente' LOOP
    PERFORM validar_notificacao_jornada(q.id);
   END LOOP;
   PERFORM enfileirar_jornada_paciente(NEW.clinica_id,NULL,NULL,'lembrete_retorno');
 ELSE
   FOR q IN SELECT id FROM notification_queue WHERE dados_extras->>'resultado_id'=NEW.id::text AND status='pendente' LOOP
    PERFORM validar_notificacao_jornada(q.id);
   END LOOP;
   IF NEW.liberado AND NEW.data_liberacao IS NOT NULL THEN
    PERFORM enfileirar_jornada_paciente(c.clinica_id,NULL,NEW.id) FROM coletas_laboratorio c WHERE c.id=NEW.coleta_id;
   END IF;
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS jornada_agendamento_data ON public.agendamentos;
CREATE TRIGGER jornada_agendamento_data BEFORE INSERT OR UPDATE OF status,data,hora_inicio,paciente_id,medico_id ON public.agendamentos FOR EACH ROW EXECUTE FUNCTION public.jornada_agendamento_antes();
DROP TRIGGER IF EXISTS jornada_agendamento_evento ON public.agendamentos;
CREATE TRIGGER jornada_agendamento_evento AFTER INSERT OR UPDATE OF data,hora_inicio,status,paciente_id,medico_id ON public.agendamentos FOR EACH ROW EXECUTE FUNCTION public.jornada_paciente_evento();
DROP TRIGGER IF EXISTS jornada_retorno_evento ON public.retornos;
CREATE TRIGGER jornada_retorno_evento AFTER INSERT OR UPDATE OF data_retorno_prevista,status,paciente_id ON public.retornos FOR EACH ROW EXECUTE FUNCTION public.jornada_paciente_evento();
DROP TRIGGER IF EXISTS jornada_resultado_evento ON public.resultados_laboratorio;
CREATE TRIGGER jornada_resultado_evento AFTER INSERT OR UPDATE OF liberado,data_liberacao ON public.resultados_laboratorio FOR EACH ROW EXECUTE FUNCTION public.jornada_paciente_evento();

-- Preserve the existing daily return cron, with the same atomic producer and opt-in rules.
CREATE OR REPLACE FUNCTION public.enfileirar_lembretes_retorno()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN RETURN (enfileirar_jornada_paciente(NULL,NULL,NULL,'lembrete_retorno')->>'enfileirados')::integer; END; $$;

CREATE OR REPLACE FUNCTION public.normalizar_telefone_jornada(p_telefone text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE WHEN length(d) IN (10,11) THEN '55'||d
   WHEN length(d) IN (12,13) AND left(d,2)='55' THEN d ELSE NULL END
 FROM (SELECT regexp_replace(p_telefone,'\D','','g') AS d) v;
$$;
CREATE OR REPLACE FUNCTION public.registrar_satisfacao_whatsapp(p_clinica_id uuid,p_telefone text,p_nota integer,p_comentario text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a record;
BEGIN
 IF p_nota IS NULL OR p_nota NOT BETWEEN 1 AND 5 OR normalizar_telefone_jornada(p_telefone) IS NULL THEN RETURN false; END IF;
 IF (SELECT count(*) FROM pacientes p WHERE p.clinica_id=p_clinica_id
   AND normalizar_telefone_jornada(p.telefone)=normalizar_telefone_jornada(p_telefone))<>1 THEN RETURN false; END IF;
 SELECT ag.* INTO a FROM notification_queue q JOIN agendamentos ag ON ag.id::text=q.dados_extras->>'agendamento_id'
   AND ag.clinica_id=q.clinica_id AND ag.paciente_id=q.destinatario_id
   JOIN pacientes p ON p.id=ag.paciente_id AND p.clinica_id=ag.clinica_id
 WHERE q.clinica_id=p_clinica_id AND q.tipo='whatsapp' AND q.status='enviado' AND q.enviado_em>now()-interval '7 days'
   AND q.dados_extras->>'automation_key'='pesquisa_satisfacao' AND ag.status::text IN ('finalizado','aguardando_pagamento_adicional')
   AND normalizar_telefone_jornada(p.telefone)=normalizar_telefone_jornada(p_telefone)
   AND normalizar_telefone_jornada(q.destinatario_telefone)=normalizar_telefone_jornada(p_telefone)
 ORDER BY q.enviado_em DESC LIMIT 1;
 IF NOT FOUND THEN RETURN false; END IF;
 INSERT INTO feedbacks_nps(clinica_id,paciente_id,agendamento_id,medico_id,nota,comentario,categoria)
 VALUES(a.clinica_id,a.paciente_id,a.id,a.medico_id,p_nota,nullif(left(trim(p_comentario),2000),''),'geral')
 ON CONFLICT(agendamento_id) WHERE agendamento_id IS NOT NULL DO NOTHING;
 RETURN FOUND;
END; $$;

REVOKE ALL ON FUNCTION public.enfileirar_mensagem_jornada(uuid,uuid,text,text,text,timestamptz,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.enfileirar_jornada_paciente(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.validar_notificacao_jornada(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.registrar_satisfacao_whatsapp(uuid,text,integer,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.enfileirar_lembretes_retorno() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.jornada_paciente_evento() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.jornada_agendamento_antes() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enfileirar_jornada_paciente(uuid,uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.validar_notificacao_jornada(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_satisfacao_whatsapp(uuid,text,integer,text) TO service_role;
COMMIT;

INSERT INTO supabase_migrations.schema_migrations (version)
  VALUES ('20261014231000') ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------
-- 20261014233000_motivos_estruturados_amostras
-- ----------------------------------------------------------------
BEGIN;

-- A rejeição também altera o status da amostra, mas o RPC registra o evento
-- detalhado logo depois. O trigger deve deixar esse registro para evitar duas
-- linhas de auditoria para a mesma decisão.
CREATE OR REPLACE FUNCTION public.laboratorio_auditar_status_amostra()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.laboratorio_eventos_amostra (clinica_id, coleta_id, tipo, status_novo, detalhes, ator_id)
    VALUES (NEW.clinica_id, NEW.id, 'criada', NEW.status,
      jsonb_build_object('codigo_amostra', NEW.codigo_amostra), auth.uid());
  ELSIF NEW.status IS DISTINCT FROM OLD.status
    AND current_setting('elolab.lab_event_override', true) IS DISTINCT FROM NEW.id::text THEN
    INSERT INTO public.laboratorio_eventos_amostra (clinica_id, coleta_id, tipo, status_anterior, status_novo, detalhes, ator_id)
    VALUES (NEW.clinica_id, NEW.id,
      CASE WHEN NEW.status IN ('rejeitada', 'recoleta') THEN NEW.status ELSE 'status' END,
      OLD.status, NEW.status, '{}'::jsonb, auth.uid());
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.laboratorio_registrar_evento_amostra(
  p_coleta_id uuid,
  p_tipo text,
  p_local text DEFAULT NULL,
  p_detalhes jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_clinica_id uuid;
  v_coleta public.coletas_laboratorio%ROWTYPE;
  v_nova_coleta_id uuid;
  v_status_anterior text;
  v_status_novo text;
  v_motivo_codigo text;
  v_motivo_rotulo text;
  v_motivo_detalhe text;
  v_motivo text;
  v_detalhes jsonb := coalesce(p_detalhes, '{}'::jsonb);
BEGIN
  v_clinica_id := public.get_my_clinica_id();
  IF auth.uid() IS NULL OR v_clinica_id IS NULL OR NOT public.can_access_clinical(auth.uid()) THEN
    RAISE EXCEPTION 'Perfil sem permissão para movimentar amostras.' USING ERRCODE = '42501';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('recebida', 'transporte', 'armazenamento', 'rejeicao', 'recoleta', 'observacao') THEN
    RAISE EXCEPTION 'Tipo de movimentação inválido.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_coleta FROM public.coletas_laboratorio c
   WHERE c.id = p_coleta_id AND c.clinica_id = v_clinica_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Amostra não encontrada na clínica atual.' USING ERRCODE = 'P0002'; END IF;

  v_status_anterior := v_coleta.status;
  v_status_novo := v_coleta.status;

  IF p_tipo IN ('rejeicao', 'recoleta') THEN
    IF jsonb_typeof(v_detalhes) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'O motivo estruturado da amostra é inválido.' USING ERRCODE = '22023';
    END IF;
    v_motivo_codigo := nullif(btrim(v_detalhes->>'motivo_codigo'), '');
    v_motivo_detalhe := nullif(btrim(v_detalhes->>'motivo_detalhe'), '');
    v_motivo_rotulo := CASE v_motivo_codigo
      WHEN 'identificacao_divergente' THEN 'Identificação divergente'
      WHEN 'recipiente_inadequado' THEN 'Tubo ou recipiente inadequado'
      WHEN 'volume_insuficiente' THEN 'Volume insuficiente'
      WHEN 'hemolisada' THEN 'Amostra hemolisada'
      WHEN 'coagulada' THEN 'Amostra coagulada'
      WHEN 'conservacao_inadequada' THEN 'Conservação inadequada'
      WHEN 'contaminada' THEN 'Amostra contaminada'
      WHEN 'prazo_excedido' THEN 'Prazo de estabilidade excedido'
      WHEN 'outro' THEN 'Outro'
      ELSE NULL
    END;
    IF v_motivo_rotulo IS NULL THEN
      RAISE EXCEPTION 'Selecione um motivo válido para a amostra.' USING ERRCODE = '22023';
    END IF;
    IF length(coalesce(v_motivo_detalhe, '')) > 300 THEN
      RAISE EXCEPTION 'O detalhe do motivo não pode exceder 300 caracteres.' USING ERRCODE = '22023';
    END IF;
    IF v_motivo_codigo = 'outro' AND length(coalesce(v_motivo_detalhe, '')) < 5 THEN
      RAISE EXCEPTION 'Explique o motivo selecionado em pelo menos 5 caracteres.' USING ERRCODE = '22023';
    END IF;
    v_motivo := v_motivo_rotulo || CASE
      WHEN v_motivo_detalhe IS NULL THEN ''
      ELSE ' — ' || v_motivo_detalhe
    END;
    v_detalhes := jsonb_build_object(
      'motivo_codigo', v_motivo_codigo,
      'motivo_rotulo', v_motivo_rotulo,
      'motivo_detalhe', v_motivo_detalhe,
      'motivo', v_motivo
    );
  END IF;

  IF p_tipo IN ('transporte', 'armazenamento') THEN
    IF nullif(btrim(p_local), '') IS NULL THEN RAISE EXCEPTION 'Informe o local da movimentação.' USING ERRCODE = '23514'; END IF;
    UPDATE public.coletas_laboratorio SET local_atual = btrim(p_local), updated_at = now() WHERE id = p_coleta_id;
  ELSIF p_tipo = 'rejeicao' THEN
    IF v_coleta.status NOT IN ('coletado', 'em_analise') THEN RAISE EXCEPTION 'Somente amostra recebida pode ser rejeitada.' USING ERRCODE = '23514'; END IF;
    PERFORM set_config('elolab.lab_event_override', p_coleta_id::text, true);
    PERFORM set_config('elolab.lab_transition', 'rejeitada:' || p_coleta_id::text, true);
    UPDATE public.coletas_laboratorio SET status = 'rejeitada', rejeicao_motivo = v_motivo, updated_at = now()
     WHERE id = p_coleta_id AND clinica_id = v_clinica_id;
    v_status_novo := 'rejeitada';
  ELSIF p_tipo = 'recoleta' THEN
    IF v_coleta.status NOT IN ('coletado', 'em_analise', 'rejeitada') THEN
      RAISE EXCEPTION 'A recoleta só pode ser aberta para amostra coletada, em análise ou rejeitada.' USING ERRCODE = '23514';
    END IF;
    IF v_coleta.status IN ('coletado', 'em_analise') THEN
      PERFORM set_config('elolab.lab_event_override', p_coleta_id::text, true);
      PERFORM set_config('elolab.lab_transition', 'rejeitada:' || p_coleta_id::text, true);
      UPDATE public.coletas_laboratorio SET status = 'rejeitada', rejeicao_motivo = v_motivo, updated_at = now()
       WHERE id = p_coleta_id AND clinica_id = v_clinica_id;
      v_status_novo := 'rejeitada';
    END IF;
    INSERT INTO public.coletas_laboratorio (paciente_id, exame_id, medico_solicitante_id, clinica_id, tipo_amostra, tubo,
      status, observacoes, jejum_necessario, jejum_horas, urgente, convenio_id, setor_id, recoleta_de_id)
    VALUES (v_coleta.paciente_id, v_coleta.exame_id, v_coleta.medico_solicitante_id, v_clinica_id, v_coleta.tipo_amostra,
      v_coleta.tubo, 'recoleta', concat_ws(E'\n', v_coleta.observacoes, 'Recoleta: ' || v_motivo),
      v_coleta.jejum_necessario, v_coleta.jejum_horas, v_coleta.urgente, v_coleta.convenio_id, v_coleta.setor_id, v_coleta.id)
    RETURNING id INTO v_nova_coleta_id;
    INSERT INTO public.laboratorio_eventos_amostra (clinica_id, coleta_id, tipo, status_anterior, status_novo, detalhes, ator_id)
    VALUES (v_clinica_id, v_coleta.id, 'recoleta', v_status_anterior, v_status_novo,
      v_detalhes || jsonb_build_object('nova_coleta_id', v_nova_coleta_id), auth.uid());
    RETURN v_nova_coleta_id;
  END IF;

  INSERT INTO public.laboratorio_eventos_amostra (clinica_id, coleta_id, tipo, status_anterior, status_novo, local, detalhes, ator_id)
  VALUES (v_clinica_id, v_coleta.id, p_tipo, v_status_anterior,
    CASE WHEN p_tipo = 'rejeicao' THEN 'rejeitada' ELSE v_status_novo END,
    nullif(btrim(p_local), ''), v_detalhes, auth.uid()) RETURNING id INTO v_nova_coleta_id;
  RETURN v_nova_coleta_id;
END;
$$;

REVOKE ALL ON FUNCTION public.laboratorio_registrar_evento_amostra(uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.laboratorio_registrar_evento_amostra(uuid, text, text, jsonb) TO authenticated;

COMMIT;

INSERT INTO supabase_migrations.schema_migrations (version)
  VALUES ('20261014233000') ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------
-- 20261014234500_confirmar_ciencia_resultado_critico
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.resultado_critico_confirmacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  resultado_id uuid NOT NULL REFERENCES public.resultados_laboratorio(id) ON DELETE RESTRICT,
  numero_versao integer NOT NULL CHECK (numero_versao > 0),
  conduta text NOT NULL CHECK (length(btrim(conduta)) BETWEEN 10 AND 2000),
  confirmado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  confirmado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resultado_critico_confirmacoes_resultado_versao_key UNIQUE (resultado_id, numero_versao)
);

CREATE INDEX IF NOT EXISTS resultado_critico_confirmacoes_clinica_resultado_idx
  ON public.resultado_critico_confirmacoes (clinica_id, resultado_id, numero_versao DESC);

ALTER TABLE public.resultado_critico_confirmacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.resultado_critico_confirmacoes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.resultado_critico_confirmacoes TO authenticated;

DROP POLICY IF EXISTS resultado_critico_confirmacoes_select ON public.resultado_critico_confirmacoes;
CREATE POLICY resultado_critico_confirmacoes_select
  ON public.resultado_critico_confirmacoes FOR SELECT TO authenticated
  USING (
    public.is_same_clinica(clinica_id)
    AND public.can_access_clinical(auth.uid())
  );

CREATE OR REPLACE FUNCTION public.confirmar_ciencia_resultado_critico(
  p_resultado_id uuid,
  p_conduta text
)
RETURNS TABLE (
  resultado_id uuid,
  numero_versao integer,
  conduta text,
  confirmado_por uuid,
  confirmado_em timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica_id uuid;
  v_resultado public.resultados_laboratorio%ROWTYPE;
BEGIN
  v_clinica_id := public.get_my_clinica_id();
  IF auth.uid() IS NULL OR v_clinica_id IS NULL
    OR NOT public.is_same_clinica(v_clinica_id)
    OR NOT (public.is_admin(auth.uid()) OR public.is_medico(auth.uid())) THEN
    RAISE EXCEPTION 'Somente médico ou administrador da clínica pode confirmar resultado crítico.'
      USING ERRCODE = '42501';
  END IF;

  IF p_conduta IS NULL OR length(btrim(p_conduta)) < 10 OR length(btrim(p_conduta)) > 2000 THEN
    RAISE EXCEPTION 'Registre a conduta com 10 a 2000 caracteres.' USING ERRCODE = '23514';
  END IF;

  SELECT r.* INTO v_resultado
    FROM public.resultados_laboratorio r
   WHERE r.id = p_resultado_id AND r.clinica_id = v_clinica_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Resultado não encontrado na clínica atual.' USING ERRCODE = 'P0002';
  END IF;
  IF v_resultado.critico IS NOT TRUE THEN
    RAISE EXCEPTION 'Somente resultados marcados como críticos podem ter ciência registrada.' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.resultado_critico_confirmacoes (
    clinica_id, resultado_id, numero_versao, conduta, confirmado_por
  ) VALUES (
    v_clinica_id, v_resultado.id, v_resultado.numero_versao, btrim(p_conduta), auth.uid()
  ) ON CONFLICT ON CONSTRAINT resultado_critico_confirmacoes_resultado_versao_key DO NOTHING;

  RETURN QUERY
    SELECT c.resultado_id, c.numero_versao, c.conduta, c.confirmado_por, c.confirmado_em
      FROM public.resultado_critico_confirmacoes c
     WHERE c.resultado_id = v_resultado.id AND c.numero_versao = v_resultado.numero_versao;
END;
$$;

REVOKE ALL ON FUNCTION public.confirmar_ciencia_resultado_critico(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirmar_ciencia_resultado_critico(uuid, text) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'resultado_critico_confirmacoes'
    ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.resultado_critico_confirmacoes;
  END IF;
END;
$$;

INSERT INTO supabase_migrations.schema_migrations (version)
  VALUES ('20261014234500') ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------
-- 20261014240000_whatsapp_dashboard_stats
-- ----------------------------------------------------------------
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS whatsapp_messages_clinica_created_stats_idx
  ON public.whatsapp_messages (clinica_id, created_at);
CREATE INDEX IF NOT EXISTS whatsapp_conversations_clinica_created_stats_idx
  ON public.whatsapp_conversations (clinica_id, created_at);
CREATE INDEX IF NOT EXISTS whatsapp_actions_clinica_created_stats_idx
  ON public.whatsapp_agent_actions (clinica_id, created_at);

CREATE OR REPLACE FUNCTION public.whatsapp_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  clinic uuid := public.get_my_clinica_id();
  clinic_day date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  day_start timestamptz;
  day_end timestamptz;
  result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) OR clinic IS NULL THEN
    RAISE EXCEPTION 'Acesso restrito ao administrador da clinica' USING ERRCODE = '42501';
  END IF;
  day_start := clinic_day::timestamp AT TIME ZONE 'America/Sao_Paulo';
  day_end := (clinic_day + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo';

  SELECT jsonb_build_object(
    'messages', (SELECT COUNT(*) FROM public.whatsapp_messages
      WHERE clinica_id = clinic AND created_at >= day_start AND created_at < day_end),
    'conversations', (SELECT COUNT(*) FROM public.whatsapp_conversations
      WHERE clinica_id = clinic AND created_at >= day_start AND created_at < day_end),
    'actions', (SELECT COUNT(*) FROM public.whatsapp_agent_actions
      WHERE clinica_id = clinic AND created_at >= day_start AND created_at < day_end),
    -- Pending confirmation and human handoff can report success, but have no booking ID.
    'ai_bookings', (SELECT COUNT(DISTINCT NULLIF(dados_saida->>'agendamento_id', ''))
      FROM public.whatsapp_agent_actions
      WHERE clinica_id = clinic AND created_at >= day_start AND created_at < day_end
        AND tipo_acao = 'criar_agendamento' AND sucesso IS TRUE),
    'confirmed_today', (SELECT COUNT(*) FROM public.agendamentos
      WHERE clinica_id = clinic AND data = clinic_day AND status = 'confirmado'),
    'no_shows_today', (SELECT COUNT(*) FROM public.agendamentos
      WHERE clinica_id = clinic AND data = clinic_day AND status = 'faltou'),
    'delivery_failures',
      (SELECT COUNT(*) FROM public.whatsapp_messages
        WHERE clinica_id = clinic AND direcao = 'saida' AND status = 'erro'
          AND created_at >= day_start AND created_at < day_end)
      + (SELECT COUNT(*) FROM public.notification_queue
        WHERE clinica_id = clinic AND tipo = 'whatsapp' AND status = 'erro'
          AND COALESCE(ultimo_erro_em, created_at) >= day_start
          AND COALESCE(ultimo_erro_em, created_at) < day_end)
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_dashboard_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.whatsapp_dashboard_stats() TO authenticated;
COMMIT;

INSERT INTO supabase_migrations.schema_migrations (version)
  VALUES ('20261014240000') ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------
-- 20261015010000_agendamento_origem_whatsapp
-- ----------------------------------------------------------------
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'manual';

ALTER TABLE public.agendamentos
  DROP CONSTRAINT IF EXISTS agendamentos_origem_valida;
ALTER TABLE public.agendamentos
  ADD CONSTRAINT agendamentos_origem_valida CHECK (origem IN ('manual', 'whatsapp_ia'));

CREATE OR REPLACE FUNCTION public.confirmar_acao_agenda_whatsapp(
  p_conversation_id uuid, p_clinica_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_conversation public.whatsapp_conversations%ROWTYPE;
  v_appointment public.agendamentos%ROWTYPE;
  v_pending jsonb;
  v_args jsonb;
  v_action text;
  v_capability text;
  v_habilidades text[];
  v_phone text;
  v_patient_phone text;
  v_phone_count integer;
  v_appointment_id uuid;
  v_doctor_id uuid;
  v_date date;
  v_start time;
  v_end time;
  v_duration integer;
  v_reason text;
  v_message text;
  v_result jsonb;
BEGIN
  SELECT * INTO v_conversation FROM public.whatsapp_conversations
   WHERE id = p_conversation_id FOR UPDATE;
  IF NOT FOUND OR p_clinica_id IS NULL
     OR v_conversation.clinica_id IS DISTINCT FROM p_clinica_id
     OR v_conversation.status IS DISTINCT FROM 'ativo'
     OR v_conversation.responsavel_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Esta conversa não está disponível para ações automáticas.');
  END IF;
  IF v_conversation.acao_pendente IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Não há uma ação aguardando confirmação.');
  END IF;
  v_pending := v_conversation.acao_pendente;
  IF (v_pending->>'expires_at')::timestamptz IS NULL
     OR (v_pending->>'expires_at')::timestamptz <= clock_timestamp() THEN
    UPDATE public.whatsapp_conversations SET acao_pendente = NULL WHERE id = p_conversation_id;
    RETURN jsonb_build_object('success', false, 'message', 'A confirmação expirou. Solicite a operação novamente.');
  END IF;
  v_action := v_pending->>'action';
  v_args := v_pending->'args';
  IF v_action IS NULL OR v_action NOT IN (
    'criar_agendamento', 'cancelar_agendamento', 'reagendar_agendamento', 'confirmar_presenca'
  ) OR jsonb_typeof(v_args) IS DISTINCT FROM 'object' THEN
    RETURN jsonb_build_object('success', false, 'message', 'A ação pendente é inválida.');
  END IF;
  v_capability := CASE WHEN v_action = 'confirmar_presenca'
    THEN 'consultar_agendamentos_paciente' ELSE v_action END;
  SELECT a.habilidades INTO v_habilidades
    FROM public.whatsapp_sessions s JOIN public.whatsapp_agents a ON a.id = s.agent_id
   WHERE s.id = v_conversation.session_id AND s.clinica_id = p_clinica_id
     AND a.clinica_id = p_clinica_id AND a.ativo IS TRUE
   FOR SHARE OF s, a;
  IF NOT FOUND OR NOT COALESCE(v_capability = ANY(v_habilidades), false) THEN
    RETURN jsonb_build_object('success', false, 'message', 'O agente não está autorizado a realizar esta ação.');
  END IF;

  -- Only an unambiguous, exact phone match can authorize patient writes.
  IF v_conversation.remote_jid !~ '^[0-9]+@(s\.whatsapp\.net|c\.us)$' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Não foi possível validar seu cadastro com segurança.');
  END IF;
  v_phone := split_part(v_conversation.remote_jid, '@', 1);
  IF length(v_phone) IN (12, 13) AND left(v_phone, 2) = '55' THEN
    v_phone := substring(v_phone FROM 3);
  END IF;
  IF length(v_phone) NOT IN (10, 11) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Não foi possível validar seu cadastro com segurança.');
  END IF;
  SELECT regexp_replace(COALESCE(p.telefone, ''), '[^0-9]', '', 'g') INTO v_patient_phone
    FROM public.pacientes p
   WHERE p.id = v_conversation.paciente_id AND p.clinica_id = p_clinica_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Não foi possível validar seu cadastro com segurança.');
  END IF;
  IF length(v_patient_phone) IN (12, 13) AND left(v_patient_phone, 2) = '55' THEN
    v_patient_phone := substring(v_patient_phone FROM 3);
  END IF;
  SELECT count(*) INTO v_phone_count FROM public.pacientes p
   WHERE p.clinica_id = p_clinica_id
     AND regexp_replace(COALESCE(p.telefone, ''), '[^0-9]', '', 'g') IN (v_phone, '55' || v_phone);
  IF v_patient_phone IS DISTINCT FROM v_phone OR v_phone_count <> 1 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Não foi possível validar seu cadastro com segurança.');
  END IF;

  IF v_action <> 'criar_agendamento' THEN
    v_appointment_id := (v_args->>'agendamento_id')::uuid;
    SELECT a.* INTO v_appointment FROM public.agendamentos a
     WHERE a.id = v_appointment_id AND a.clinica_id = p_clinica_id
       AND a.paciente_id = v_conversation.paciente_id FOR UPDATE;
    IF NOT FOUND OR v_appointment.status IS NULL
       OR v_appointment.status::text NOT IN ('agendado', 'confirmado')
       OR (v_appointment.data + v_appointment.hora_inicio) <= (clock_timestamp() AT TIME ZONE 'America/Sao_Paulo') THEN
      RETURN jsonb_build_object('success', false, 'message', 'A consulta não está disponível para esta alteração.');
    END IF;
  END IF;

  IF v_action IN ('criar_agendamento', 'reagendar_agendamento') THEN
    v_doctor_id := (v_args->>'medico_id')::uuid;
    IF COALESCE(v_args->>'data', '') !~ '^\d{4}-\d{2}-\d{2}$'
       OR COALESCE(v_args->>'hora_inicio', '') !~ '^([01]\d|2[0-3]):[0-5]\d(:00)?$' THEN
      RETURN jsonb_build_object('success', false, 'message', 'Informe uma data e um horário válidos.');
    END IF;
    v_date := (v_args->>'data')::date;
    v_start := (v_args->>'hora_inicio')::time;
    IF v_date + v_start <= (clock_timestamp() AT TIME ZONE 'America/Sao_Paulo') THEN
      RETURN jsonb_build_object('success', false, 'message', 'Escolha um horário futuro.');
    END IF;
    PERFORM 1 FROM public.medicos m WHERE m.id = v_doctor_id
      AND m.clinica_id = p_clinica_id AND m.ativo IS TRUE FOR SHARE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'message', 'O profissional não está disponível nesta clínica.');
    END IF;
    SELECT d.duracao_consulta INTO v_duration FROM public.medico_disponibilidade d
     WHERE d.medico_id = v_doctor_id AND d.ativo IS TRUE
       AND d.dia_semana = extract(dow FROM v_date)::integer
       AND d.duracao_consulta > 0 AND d.intervalo_consultas >= 0
       AND v_start >= d.hora_inicio
       AND extract(epoch FROM (v_start - d.hora_inicio)) + d.duracao_consulta * 60
           <= extract(epoch FROM (d.hora_fim - d.hora_inicio))
       AND mod(extract(epoch FROM (v_start - d.hora_inicio)),
         (d.duracao_consulta + d.intervalo_consultas) * 60) = 0
     ORDER BY d.hora_inicio, d.id LIMIT 1 FOR SHARE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'message', 'Esse horário não faz parte da agenda disponível do profissional.');
    END IF;
    v_end := v_start + make_interval(mins => v_duration);
    PERFORM pg_advisory_xact_lock(hashtext(v_doctor_id::text), v_date - DATE '2000-01-01');
    IF EXISTS (SELECT 1 FROM public.bloqueios_agenda b
      WHERE b.clinica_id = p_clinica_id AND b.medico_id = v_doctor_id
        AND v_date BETWEEN b.data_inicio AND b.data_fim
        AND (COALESCE(b.dia_inteiro, true) OR (v_start < b.hora_fim AND v_end > b.hora_inicio))) THEN
      RETURN jsonb_build_object('success', false, 'message', 'Esse horário está bloqueado. Escolha outro horário.');
    END IF;
  END IF;

  IF v_action = 'cancelar_agendamento' THEN
    v_reason := nullif(btrim(v_args->>'motivo'), '');
    IF v_reason IS NULL THEN
      RETURN jsonb_build_object('success', false, 'message', 'Informe o motivo do cancelamento.');
    END IF;
    UPDATE public.agendamentos SET status = 'cancelado', motivo_cancelamento = v_reason
     WHERE id = v_appointment_id;
    v_message := 'Sua consulta foi cancelada.';
  ELSIF v_action = 'confirmar_presenca' THEN
    IF v_appointment.status::text <> 'agendado' THEN
      RETURN jsonb_build_object('success', false, 'message', 'A presença nesta consulta já está confirmada.');
    END IF;
    UPDATE public.agendamentos SET status = 'confirmado' WHERE id = v_appointment_id;
    v_message := 'Sua presença na consulta foi confirmada.';
  ELSIF v_action = 'reagendar_agendamento' THEN
    UPDATE public.agendamentos
       SET medico_id = v_doctor_id, data = v_date, hora_inicio = v_start, hora_fim = v_end
     WHERE id = v_appointment_id;
    v_message := 'Sua consulta foi remarcada para ' || to_char(v_date, 'DD/MM/YYYY') || ' às ' || to_char(v_start, 'HH24:MI') || '.';
  ELSE
    INSERT INTO public.agendamentos (clinica_id, paciente_id, medico_id, data, hora_inicio, hora_fim, status, tipo, origem)
    VALUES (p_clinica_id, v_conversation.paciente_id, v_doctor_id, v_date, v_start, v_end, 'agendado', 'consulta', 'whatsapp_ia')
    RETURNING id INTO v_appointment_id;
    v_message := 'Sua consulta foi agendada para ' || to_char(v_date, 'DD/MM/YYYY') || ' às ' || to_char(v_start, 'HH24:MI') || '.';
  END IF;
  v_result := jsonb_build_object('success', true, 'completed', true, 'agendamento_id', v_appointment_id, 'message', v_message);
  UPDATE public.whatsapp_conversations SET acao_pendente = NULL WHERE id = p_conversation_id;
  INSERT INTO public.whatsapp_agent_actions (clinica_id, conversation_id, tipo_acao, dados_entrada, dados_saida, sucesso)
  VALUES (p_clinica_id, p_conversation_id, v_action, v_args, v_result, true);
  RETURN v_result;
EXCEPTION
  WHEN exclusion_violation THEN
    RETURN jsonb_build_object('success', false, 'message', 'Esse horário está ocupado ou bloqueado. Escolha outro horário.');
  WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
    RETURN jsonb_build_object('success', false, 'message', 'A ação contém dados inválidos. Solicite a operação novamente.');
  WHEN check_violation OR foreign_key_violation THEN
    RETURN jsonb_build_object('success', false, 'message', 'A consulta não está disponível para esta alteração.');
END;
$$;

REVOKE ALL ON FUNCTION public.confirmar_acao_agenda_whatsapp(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_acao_agenda_whatsapp(uuid, uuid) TO service_role;
COMMIT;

INSERT INTO supabase_migrations.schema_migrations (version)
  VALUES ('20261015010000') ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------
-- 20261015020000_agendar_predicoes_no_show
-- ----------------------------------------------------------------
-- Reconciliação retroativa: esta versão já está registrada em produção
-- (supabase_migrations.schema_migrations) mas nunca tinha um arquivo no git.
-- O texto original não foi preservado (a coluna `statements` ficou vazia),
-- então este arquivo recria o efeito observado na instância de produção,
-- não o script exato que rodou.
--
-- Efeito observado: a função `public.atualizar_predicoes_no_show()` (já
-- criada e versionada em 20260817294000_risco_no_show_baseado_em_historico.sql)
-- está agendada no pg_cron com o nome 'atualizar-risco-no-show' às :15 de
-- cada hora. Esse agendamento já existia desde a migration de 17/08 — esta
-- versão reagenda o mesmo job de forma idempotente (cron.schedule substitui
-- um job existente pelo nome), então não há mudança de comportamento real em
-- produção; o objetivo aqui é só fazer git e banco pararem de divergir.
SELECT cron.schedule(
  'atualizar-risco-no-show',
  '15 * * * *',
  $$SELECT public.atualizar_predicoes_no_show();$$
);

INSERT INTO supabase_migrations.schema_migrations (version)
  VALUES ('20261015020000') ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------
-- 20261015100000_reserva_temporaria_agendamento_publico
-- ----------------------------------------------------------------
BEGIN;

CREATE TABLE IF NOT EXISTS public.public_booking_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  medico_id uuid NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  data date NOT NULL,
  hora_inicio time NOT NULL,
  hora_fim time NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (hora_fim > hora_inicio)
);

CREATE INDEX IF NOT EXISTS public_booking_holds_slot_expiry_idx
  ON public.public_booking_holds (clinica_id, medico_id, data, expires_at);
CREATE INDEX IF NOT EXISTS public_booking_holds_expiry_idx
  ON public.public_booking_holds (expires_at);

ALTER TABLE public.public_booking_holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.public_booking_holds FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.public_booking_holds TO service_role;

CREATE OR REPLACE FUNCTION public.reservar_horario_publico_atomico(
  p_clinica_id uuid,
  p_medico_id uuid,
  p_data date,
  p_hora_inicio time,
  p_duracao_minutos integer,
  p_token_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_fim time;
  v_expira timestamptz;
  v_ja_existente public.public_booking_holds%ROWTYPE;
BEGIN
  IF p_clinica_id IS NULL OR p_medico_id IS NULL OR p_data IS NULL OR p_hora_inicio IS NULL
     OR p_duracao_minutos IS NULL OR p_duracao_minutos < 1 OR p_duracao_minutos > 480
     OR p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Dados da reserva inválidos.' USING ERRCODE = '22023';
  END IF;
  IF p_data < (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'A data da reserva não pode estar no passado.' USING ERRCODE = '22023';
  END IF;
  v_fim := p_hora_inicio + pg_catalog.make_interval(mins => p_duracao_minutos);
  IF v_fim <= p_hora_inicio THEN
    RAISE EXCEPTION 'O agendamento precisa terminar antes da meia-noite.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clinicas c WHERE c.id = p_clinica_id
      AND NOT COALESCE(c.suspensa, false) AND NOT COALESCE(c.arquivada, false)
  ) OR NOT EXISTS (
    SELECT 1 FROM public.medicos m WHERE m.id = p_medico_id AND m.clinica_id = p_clinica_id AND m.ativo
  ) THEN
    RAISE EXCEPTION 'Horário indisponível.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'agendamento-online-medico:' || p_clinica_id::text || ':' || p_medico_id::text || ':' || p_data::text, 0
  ));

  SELECT * INTO v_ja_existente FROM public.public_booking_holds h
   WHERE h.token_hash = p_token_hash FOR UPDATE;
  IF FOUND AND v_ja_existente.expires_at > pg_catalog.now()
     AND v_ja_existente.clinica_id = p_clinica_id AND v_ja_existente.medico_id = p_medico_id
     AND v_ja_existente.data = p_data AND v_ja_existente.hora_inicio = p_hora_inicio
     AND v_ja_existente.hora_fim = v_fim THEN
    RETURN pg_catalog.jsonb_build_object('success', true, 'expires_at', v_ja_existente.expires_at);
  ELSIF FOUND AND v_ja_existente.clinica_id <> p_clinica_id THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'code', 'slot_unavailable');
  ELSIF FOUND THEN
    DELETE FROM public.public_booking_holds WHERE id = v_ja_existente.id;
  END IF;

  WITH expired AS (
    SELECT h.id FROM public.public_booking_holds h
     WHERE h.expires_at < pg_catalog.now() - interval '1 day'
     ORDER BY h.expires_at
     LIMIT 250
     FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.public_booking_holds h USING expired e WHERE h.id = e.id;

  IF EXISTS (
    SELECT 1 FROM public.agendamentos a
     WHERE a.clinica_id = p_clinica_id AND a.medico_id = p_medico_id AND a.data = p_data
       AND a.status IS DISTINCT FROM 'cancelado'::public.status_agendamento
       AND a.status IS DISTINCT FROM 'faltou'::public.status_agendamento
       AND a.hora_inicio < v_fim
       AND COALESCE(a.hora_fim, a.hora_inicio + interval '30 minutes') > p_hora_inicio
  ) OR EXISTS (
    SELECT 1 FROM public.public_booking_holds h
     WHERE h.clinica_id = p_clinica_id AND h.medico_id = p_medico_id AND h.data = p_data
       AND h.expires_at > pg_catalog.now() AND h.hora_inicio < v_fim AND h.hora_fim > p_hora_inicio
  ) THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'code', 'slot_unavailable');
  END IF;

  v_expira := pg_catalog.now() + interval '5 minutes';
  INSERT INTO public.public_booking_holds (clinica_id, medico_id, data, hora_inicio, hora_fim, token_hash, expires_at)
  VALUES (p_clinica_id, p_medico_id, p_data, p_hora_inicio, v_fim, p_token_hash, v_expira);
  RETURN pg_catalog.jsonb_build_object('success', true, 'expires_at', v_expira);
END;
$$;

REVOKE ALL ON FUNCTION public.reservar_horario_publico_atomico(uuid, uuid, date, time, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_horario_publico_atomico(uuid, uuid, date, time, integer, text) TO service_role;

CREATE OR REPLACE FUNCTION public.agendar_consulta_online_atomico(
  p_clinica_id uuid, p_paciente_id uuid, p_medico_id uuid, p_data date,
  p_hora_inicio time, p_duracao_minutos integer, p_observacoes text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'success', false,
    'code', 'hold_required',
    'error', 'Selecione novamente o horário para confirmar a reserva.'
  );
$$;
REVOKE ALL ON FUNCTION public.agendar_consulta_online_atomico(uuid, uuid, uuid, date, time, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agendar_consulta_online_atomico(uuid, uuid, uuid, date, time, integer, text) TO service_role;

CREATE FUNCTION public.agendar_consulta_online_atomico(
  p_clinica_id uuid,
  p_paciente_id uuid,
  p_medico_id uuid,
  p_data date,
  p_hora_inicio time,
  p_duracao_minutos integer,
  p_observacoes text,
  p_hold_token_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_fim time;
  v_agendamento_id uuid;
  v_hold public.public_booking_holds%ROWTYPE;
BEGIN
  IF p_clinica_id IS NULL OR p_paciente_id IS NULL OR p_medico_id IS NULL
    OR p_data IS NULL OR p_hora_inicio IS NULL OR p_duracao_minutos IS NULL
    OR p_duracao_minutos < 1 OR p_duracao_minutos > 480
    OR p_hold_token_hash IS NULL OR p_hold_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Dados do agendamento inválidos.' USING ERRCODE = '22023';
  END IF;
  IF p_data < (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'A data do agendamento não pode estar no passado.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clinicas c WHERE c.id = p_clinica_id
      AND NOT COALESCE(c.suspensa, false) AND NOT COALESCE(c.arquivada, false)
  ) OR NOT EXISTS (
    SELECT 1 FROM public.medicos m WHERE m.id = p_medico_id AND m.clinica_id = p_clinica_id AND m.ativo
  ) OR NOT EXISTS (
    SELECT 1 FROM public.pacientes p WHERE p.id = p_paciente_id AND p.clinica_id = p_clinica_id
  ) THEN
    RAISE EXCEPTION 'Agendamento indisponível para esta clínica.' USING ERRCODE = '42501';
  END IF;

  v_fim := p_hora_inicio + pg_catalog.make_interval(mins => p_duracao_minutos);
  IF v_fim <= p_hora_inicio THEN
    RAISE EXCEPTION 'O agendamento precisa terminar antes da meia-noite.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'agendamento-online-medico:' || p_clinica_id::text || ':' || p_medico_id::text || ':' || p_data::text, 0
  ));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'agendamento-online-paciente:' || p_clinica_id::text || ':' || p_paciente_id::text || ':' || p_data::text, 0
  ));

  SELECT * INTO v_hold FROM public.public_booking_holds h
   WHERE h.token_hash = p_hold_token_hash AND h.clinica_id = p_clinica_id
     AND h.medico_id = p_medico_id AND h.data = p_data
     AND h.hora_inicio = p_hora_inicio AND h.hora_fim = v_fim
     AND h.expires_at > pg_catalog.now()
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'code', 'hold_expired',
      'error', 'Sua reserva expirou. Escolha o horário novamente.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agendamentos a WHERE a.clinica_id = p_clinica_id
      AND a.medico_id = p_medico_id AND a.data = p_data
      AND a.status IS DISTINCT FROM 'cancelado'::public.status_agendamento
      AND a.status IS DISTINCT FROM 'faltou'::public.status_agendamento
      AND a.hora_inicio < v_fim
      AND COALESCE(a.hora_fim, a.hora_inicio + interval '30 minutes') > p_hora_inicio
  ) THEN
    DELETE FROM public.public_booking_holds WHERE id = v_hold.id;
    RETURN pg_catalog.jsonb_build_object('success', false, 'code', 'slot_unavailable',
      'error', 'Este horário acabou de ser ocupado. Escolha outro.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agendamentos a WHERE a.clinica_id = p_clinica_id
      AND a.paciente_id = p_paciente_id AND a.data = p_data
      AND a.status IS DISTINCT FROM 'cancelado'::public.status_agendamento
      AND a.status IS DISTINCT FROM 'faltou'::public.status_agendamento
      AND a.hora_inicio < v_fim
      AND COALESCE(a.hora_fim, a.hora_inicio + interval '30 minutes') > p_hora_inicio
  ) THEN
    DELETE FROM public.public_booking_holds WHERE id = v_hold.id;
    RETURN pg_catalog.jsonb_build_object('success', false, 'code', 'booking_unavailable',
      'error', 'Não foi possível reservar esse horário. Escolha outro ou entre em contato com a clínica.');
  END IF;

  INSERT INTO public.agendamentos (
    clinica_id, paciente_id, medico_id, data, hora_inicio, hora_fim, tipo, status, observacoes
  ) VALUES (
    p_clinica_id, p_paciente_id, p_medico_id, p_data, p_hora_inicio, v_fim,
    'consulta', 'agendado', p_observacoes
  ) RETURNING id INTO v_agendamento_id;

  DELETE FROM public.public_booking_holds WHERE id = v_hold.id;
  RETURN pg_catalog.jsonb_build_object('success', true, 'id', v_agendamento_id);
END;
$$;

REVOKE ALL ON FUNCTION public.agendar_consulta_online_atomico(uuid, uuid, uuid, date, time, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agendar_consulta_online_atomico(uuid, uuid, uuid, date, time, integer, text, text) TO service_role;

COMMENT ON TABLE public.public_booking_holds IS
  'Reservas temporárias de horários do agendamento público; tokens são armazenados apenas como hash e expiram em cinco minutos.';

COMMIT;

INSERT INTO supabase_migrations.schema_migrations (version)
  VALUES ('20261015100000') ON CONFLICT DO NOTHING;


NOTIFY pgrst, 'reload schema';
SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 40;
