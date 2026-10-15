-- PR #15 migration bundle, ordered by filename/version.
-- Apply only to EloLab production after confirming the verified backup and maintenance window.
-- Each migration and its Supabase version record are kept in the same transaction.
-- Stop on the first error; do not rerun a partially completed bundle without checking schema_migrations.

-- >>> 20261011010000 portal_paciente_scoped_links
BEGIN;

-- A emissão da credencial precisa respeitar o isolamento por clínica mesmo
-- sendo chamada diretamente, fora das rotas administrativas do frontend.
-- Emissões interativas também invalidam o link anterior para permitir rotação segura.
CREATE OR REPLACE FUNCTION public.link_portal_paciente(p_paciente_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token_bruto text;
  v_clinica_id uuid;
  v_chamada_trigger boolean := pg_trigger_depth() > 0;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT v_chamada_trigger
     AND NOT public.can_manage_data(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para gerar link do portal';
  END IF;

  -- Serializa as emissões para este paciente e evita deixar dois links ativos
  -- quando dois administradores/receptionistas clicam ao mesmo tempo.
  SELECT clinica_id INTO v_clinica_id
    FROM public.pacientes
   WHERE id = p_paciente_id
   FOR UPDATE;

  IF NOT FOUND THEN RETURN NULL; END IF;

  IF auth.uid() IS NOT NULL
     AND v_clinica_id IS DISTINCT FROM public.get_my_clinica_id() THEN
    RAISE EXCEPTION 'Sem permissão para gerar link do portal deste paciente';
  END IF;

  -- Emissões interativas rotacionam o link compartilhado pela clínica. O
  -- trigger de resultado pode manter o auth.uid() da requisição que liberou
  -- o laudo. pg_trigger_depth() distingue esse fluxo do RPC interativo.
  IF NOT v_chamada_trigger THEN
    UPDATE public.paciente_portal_tokens
       SET ativo = false
     WHERE paciente_id = p_paciente_id
       AND clinica_id IS NOT DISTINCT FROM v_clinica_id
       AND ativo = true;
  END IF;

  v_token_bruto := encode(gen_random_bytes(32), 'hex');
  INSERT INTO public.paciente_portal_tokens
    (paciente_id, clinica_id, token, ativo, expires_at)
  VALUES
    (p_paciente_id, v_clinica_id,
     encode(extensions.digest(v_token_bruto, 'sha256'), 'hex'),
     true, now() + interval '1 year');

  RETURN 'https://app.elolab.com.br/portal-paciente?token=' || v_token_bruto;
END;
$$;

REVOKE ALL ON FUNCTION public.link_portal_paciente(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_portal_paciente(uuid) TO authenticated;

COMMENT ON FUNCTION public.link_portal_paciente(uuid) IS
  'Gera link para paciente da clínica do usuário, rotaciona links em chamadas interativas e persiste somente o hash.';

INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011010000', ARRAY[]::text[], 'portal_paciente_scoped_links');
COMMIT;

-- <<< 20261011010000
-- >>> 20261011020000 prontuario_autoria_e_auditoria
BEGIN;

-- Médico só acessa rascunhos próprios; registros assinados ficam disponíveis
-- à equipe médica da clínica para continuidade do cuidado. A tela não é a
-- fronteira de segurança: essas regras também valem para chamadas REST diretas.
CREATE OR REPLACE FUNCTION public.is_medico_responsavel_do_prontuario(p_medico_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.medicos m
     WHERE m.id = p_medico_id
       AND m.user_id = auth.uid()
       AND m.clinica_id = public.get_my_clinica_id()
       AND m.ativo IS NOT FALSE
  );
$$;
REVOKE ALL ON FUNCTION public.is_medico_responsavel_do_prontuario(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_medico_responsavel_do_prontuario(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_paciente_da_clinica(p_paciente_id uuid, p_clinica_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_paciente_id IS NOT NULL
     AND p_clinica_id IS NOT NULL
     AND (auth.role() = 'service_role' OR p_clinica_id = public.get_my_clinica_id())
     AND EXISTS (
       SELECT 1 FROM public.pacientes p
        WHERE p.id = p_paciente_id
          AND p.clinica_id = p_clinica_id
     );
$$;
REVOKE ALL ON FUNCTION public.is_paciente_da_clinica(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_paciente_da_clinica(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS prontuarios_select ON public.prontuarios;
CREATE POLICY prontuarios_select_autorizado ON public.prontuarios
  FOR SELECT TO authenticated
  USING (
    public.is_same_clinica(clinica_id)
    AND (
      public.is_admin(auth.uid())
      OR (
        public.is_medico(auth.uid())
        AND (assinado IS TRUE OR public.is_medico_responsavel_do_prontuario(medico_id))
      )
    )
  );

DROP POLICY IF EXISTS prontuarios_insert ON public.prontuarios;
CREATE POLICY prontuarios_insert_autor_ou_admin ON public.prontuarios
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_same_clinica(clinica_id)
    AND public.is_paciente_da_clinica(paciente_id, clinica_id)
    AND (
      public.is_admin(auth.uid())
      OR (public.is_medico(auth.uid()) AND public.is_medico_responsavel_do_prontuario(medico_id))
    )
  );

DROP POLICY IF EXISTS prontuarios_update ON public.prontuarios;
CREATE POLICY prontuarios_update_autor_ou_admin ON public.prontuarios
  FOR UPDATE TO authenticated
  USING (
    public.is_same_clinica(clinica_id)
    AND assinado IS NOT TRUE
    AND (
      public.is_admin(auth.uid())
      OR (public.is_medico(auth.uid()) AND public.is_medico_responsavel_do_prontuario(medico_id))
    )
  )
  WITH CHECK (
    public.is_same_clinica(clinica_id)
    AND public.is_paciente_da_clinica(paciente_id, clinica_id)
    AND assinado IS NOT TRUE
    AND (
      public.is_admin(auth.uid())
      OR (public.is_medico(auth.uid()) AND public.is_medico_responsavel_do_prontuario(medico_id))
    )
  );

CREATE OR REPLACE FUNCTION public.prevent_prontuario_patient_reassignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_paciente_da_clinica(NEW.paciente_id, NEW.clinica_id) THEN
    RAISE EXCEPTION 'O paciente e o prontuário precisam pertencer à mesma clínica';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.paciente_id IS DISTINCT FROM OLD.paciente_id THEN
    RAISE EXCEPTION 'O paciente vinculado ao registro clínico não pode ser alterado';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_prevent_prontuario_patient_reassignment ON public.prontuarios;
CREATE TRIGGER trg_prevent_prontuario_patient_reassignment
  BEFORE INSERT OR UPDATE ON public.prontuarios
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_prontuario_patient_reassignment();

CREATE OR REPLACE FUNCTION public.require_prontuario_author_to_sign()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.assinado IS TRUE AND OLD.assinado IS NOT TRUE THEN
    IF COALESCE(current_setting('app.signing_prontuario', true), '') <> 'allowed'
       OR NOT public.is_medico_responsavel_do_prontuario(NEW.medico_id) THEN
      RAISE EXCEPTION 'Somente o profissional autor pode finalizar e assinar este registro';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_require_prontuario_author_to_sign ON public.prontuarios;
CREATE TRIGGER trg_require_prontuario_author_to_sign
  BEFORE UPDATE OF assinado ON public.prontuarios
  FOR EACH ROW
  EXECUTE FUNCTION public.require_prontuario_author_to_sign();

-- Registros clínicos e trilhas do prontuário só podem ser lidos por equipe
-- clínica da mesma unidade. Escritas autenticadas passam pelas RPCs abaixo,
-- que derivam autoria, CRM e unidade do usuário autenticado.
DROP POLICY IF EXISTS "adendos_select_same_clinica" ON public.prontuario_adendos;
CREATE POLICY adendos_select_equipe_clinica ON public.prontuario_adendos
  FOR SELECT TO authenticated
  USING ((public.is_admin(auth.uid()) OR public.is_medico(auth.uid())) AND public.is_same_clinica(clinica_id));

DROP POLICY IF EXISTS "adendos_insert_same_clinica" ON public.prontuario_adendos;
DROP POLICY IF EXISTS acessos_select_same_clinica ON public.prontuario_acessos;
CREATE POLICY acessos_select_equipe_clinica ON public.prontuario_acessos
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) AND public.is_same_clinica(clinica_id));

DROP POLICY IF EXISTS "acessos_insert_same_clinica" ON public.prontuario_acessos;
REVOKE INSERT ON public.prontuario_adendos, public.prontuario_acessos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.prontuario_adendos, public.prontuario_acessos TO authenticated;

-- A consulta da trilha é restrita a administradores (perfil auditor não existe
-- atualmente no EloLab). Apaga nomes de pacientes já gravados no log genérico.
DROP POLICY IF EXISTS audit_log_select ON public.audit_log;
DROP POLICY IF EXISTS audit_log_select_scoped ON public.audit_log;
CREATE POLICY audit_log_select_admin ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) AND public.is_same_clinica(clinica_id));
UPDATE public.audit_log
   SET record_name = NULL
 WHERE collection = 'prontuarios'
   AND record_name IS NOT NULL;

CREATE OR REPLACE FUNCTION public.registrar_prontuario_acesso(
  p_prontuario_id uuid,
  p_acao text,
  p_justificativa text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prontuario public.prontuarios%ROWTYPE;
  v_user_nome text;
  v_user_crm text;
  v_acesso_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_admin(auth.uid()) OR public.is_medico(auth.uid())) THEN
    RAISE EXCEPTION 'Acesso clínico não autorizado';
  END IF;
  IF p_acao NOT IN ('visualizacao', 'edicao', 'exportacao') THEN
    RAISE EXCEPTION 'Ação de auditoria inválida';
  END IF;

  SELECT * INTO v_prontuario
    FROM public.prontuarios
   WHERE id = p_prontuario_id
     AND public.is_same_clinica(clinica_id)
     AND (
       public.is_admin(auth.uid())
       OR (public.is_medico(auth.uid()) AND (assinado IS TRUE OR public.is_medico_responsavel_do_prontuario(medico_id)))
     )
   FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prontuário não encontrado';
  END IF;
  IF p_acao = 'edicao' AND (v_prontuario.assinado IS TRUE OR (
    NOT public.is_admin(auth.uid())
    AND NOT public.is_medico_responsavel_do_prontuario(v_prontuario.medico_id)
  )) THEN
    RAISE EXCEPTION 'Edição de rascunho não autorizada';
  END IF;

  SELECT nome, crm INTO v_user_nome, v_user_crm
    FROM public.medicos
   WHERE user_id = auth.uid()
     AND clinica_id = v_prontuario.clinica_id
     AND ativo IS NOT FALSE
   ORDER BY created_at DESC
   LIMIT 1;

  INSERT INTO public.prontuario_acessos (
    prontuario_id, paciente_id, clinica_id, user_id, user_nome, user_crm,
    acao, justificativa
  ) VALUES (
    v_prontuario.id, v_prontuario.paciente_id, v_prontuario.clinica_id,
    auth.uid(), COALESCE(v_user_nome, auth.jwt() ->> 'email', 'Usuário clínico'),
    v_user_crm, p_acao, NULLIF(btrim(p_justificativa), '')
  ) RETURNING id INTO v_acesso_id;

  RETURN v_acesso_id;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_prontuario_acesso(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_prontuario_acesso(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.registrar_prontuario_adendo(
  p_prontuario_id uuid,
  p_tipo text,
  p_motivo text,
  p_texto text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_prontuario public.prontuarios%ROWTYPE;
  v_medico public.medicos%ROWTYPE;
  v_adendo_id uuid;
  v_criado_em timestamptz := clock_timestamp();
  v_hash text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_medico(auth.uid()) THEN
    RAISE EXCEPTION 'Somente o médico responsável autenticado pode registrar adendo';
  END IF;
  IF p_tipo NOT IN ('retificacao', 'complemento', 'erratum')
     OR NULLIF(btrim(p_motivo), '') IS NULL
     OR NULLIF(btrim(p_texto), '') IS NULL THEN
    RAISE EXCEPTION 'Tipo, motivo e conteúdo do adendo são obrigatórios';
  END IF;

  SELECT * INTO v_prontuario
    FROM public.prontuarios
   WHERE id = p_prontuario_id
   FOR KEY SHARE;
  IF NOT FOUND OR v_prontuario.clinica_id IS DISTINCT FROM public.get_my_clinica_id() THEN
    RAISE EXCEPTION 'Prontuário não encontrado';
  END IF;
  IF NOT v_prontuario.assinado THEN
    RAISE EXCEPTION 'Adendos só podem complementar prontuários assinados';
  END IF;

  SELECT * INTO v_medico
    FROM public.medicos
   WHERE user_id = auth.uid()
     AND clinica_id = v_prontuario.clinica_id
     AND ativo IS NOT FALSE
     AND NULLIF(btrim(crm), '') IS NOT NULL
   ORDER BY created_at DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vincule um cadastro médico ativo com CRM a esta conta';
  END IF;
  IF v_prontuario.medico_id IS DISTINCT FROM v_medico.id THEN
    RAISE EXCEPTION 'Somente o profissional autor pode corrigir ou complementar este registro';
  END IF;

  v_hash := encode(extensions.digest(convert_to(concat_ws(E'\n',
    p_prontuario_id::text, p_tipo, btrim(p_motivo), btrim(p_texto),
    v_medico.id::text, v_medico.nome, v_medico.crm, v_criado_em::text
  ), 'UTF8'), 'sha256'), 'hex');

  INSERT INTO public.prontuario_adendos (
    prontuario_id, clinica_id, medico_id, medico_nome, crm,
    tipo, motivo, texto, hash, created_at
  ) VALUES (
    v_prontuario.id, v_prontuario.clinica_id, v_medico.id, v_medico.nome,
    v_medico.crm, p_tipo, btrim(p_motivo), btrim(p_texto), v_hash, v_criado_em
  ) RETURNING id INTO v_adendo_id;

  INSERT INTO public.prontuario_acessos (
    prontuario_id, paciente_id, clinica_id, user_id, user_nome, user_crm,
    acao, justificativa
  ) VALUES (
    v_prontuario.id, v_prontuario.paciente_id, v_prontuario.clinica_id,
    auth.uid(), v_medico.nome, v_medico.crm, 'adendo', btrim(p_motivo)
  );

  RETURN jsonb_build_object('id', v_adendo_id, 'hash', v_hash, 'created_at', v_criado_em);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_prontuario_adendo(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_prontuario_adendo(uuid, text, text, text) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011020000', ARRAY[]::text[], 'prontuario_autoria_e_auditoria');
COMMIT;

-- <<< 20261011020000
-- >>> 20261011030000 agenda_isolamento_medico
BEGIN;

-- A restriÃ§Ã£o visual da Agenda nÃ£o deve ser a fronteira de seguranÃ§a.
-- O vÃ­nculo usa user_id, a clÃ­nica do perfil autenticado e o id do mÃ©dico.
-- NÃ£o exige que o mÃ©dico esteja ativo: consultas existentes continuam visÃ­veis.
CREATE OR REPLACE FUNCTION public.is_medico_da_agenda(p_medico_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.medicos m
     WHERE m.id = p_medico_id
       AND m.user_id = auth.uid()
       AND m.clinica_id = public.get_my_clinica_id()
  );
$$;
REVOKE ALL ON FUNCTION public.is_medico_da_agenda(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_medico_da_agenda(uuid) TO authenticated;

-- SECURITY DEFINER bypasses row policies, so this RPC repeats the appointment
-- scope check before changing the status and synchronizes the queue in one tx.
CREATE OR REPLACE FUNCTION public.alterar_status_agendamento_com_fila(
  p_agendamento_id uuid,
  p_clinica_id uuid,
  p_status text,
  p_updated_at timestamptz
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

  IF p_status IS NULL OR p_status NOT IN ('cancelado', 'faltou') THEN
    RAISE EXCEPTION 'Status invalido para esta operacao.' USING ERRCODE = '22023';
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

  IF v_agendamento.status::text IN (
    'finalizado', 'atendimento_finalizado', 'pago',
    'aguardando_pagamento', 'aguardando_pagamento_adicional'
  ) THEN
    RETURN jsonb_build_object('atualizado', false, 'fila_removida', 0);
  END IF;

  -- Nunca remova da fila uma consulta cujo atendimento já começou. Esta
  -- allowlist também mantém a RPC alinhada ao diálogo de cancelamento.
  IF p_status = 'faltou' AND v_agendamento.status::text NOT IN (
    'agendado', 'confirmado', 'aguardando'
  ) THEN
    RETURN jsonb_build_object('atualizado', false, 'fila_removida', 0);
  END IF;

  IF p_status = 'cancelado' AND v_agendamento.status::text NOT IN (
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
     SET status = p_status::public.status_agendamento
   WHERE id = p_agendamento_id
     AND clinica_id = p_clinica_id;

  RETURN jsonb_build_object('atualizado', true, 'fila_removida', v_fila_removida);
END;
$$;
REVOKE ALL ON FUNCTION public.alterar_status_agendamento_com_fila(uuid, uuid, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.alterar_status_agendamento_com_fila(uuid, uuid, text, timestamptz) TO authenticated;

DROP POLICY IF EXISTS agendamentos_select ON public.agendamentos;
CREATE POLICY agendamentos_select ON public.agendamentos
  FOR SELECT TO authenticated
  USING (
    has_any_role(auth.uid())
    AND NOT is_financeiro(auth.uid())
    AND is_same_clinica(clinica_id)
    AND (
      NOT is_medico(auth.uid())
      OR can_manage_data(auth.uid())
      OR is_enfermagem(auth.uid())
      OR is_medico_da_agenda(medico_id)
    )
  );

DROP POLICY IF EXISTS agendamentos_insert ON public.agendamentos;
CREATE POLICY agendamentos_insert ON public.agendamentos
  FOR INSERT TO authenticated
  WITH CHECK (
    is_same_clinica(clinica_id)
    AND (
      can_manage_data(auth.uid())
      OR is_enfermagem(auth.uid())
      OR (is_medico(auth.uid()) AND is_medico_da_agenda(medico_id))
    )
  );

DROP POLICY IF EXISTS agendamentos_update ON public.agendamentos;
CREATE POLICY agendamentos_update ON public.agendamentos
  FOR UPDATE TO authenticated
  USING (
    is_same_clinica(clinica_id)
    AND (
      can_manage_data(auth.uid())
      OR is_enfermagem(auth.uid())
      OR (is_medico(auth.uid()) AND is_medico_da_agenda(medico_id))
    )
  )
  WITH CHECK (
    is_same_clinica(clinica_id)
    AND (
      can_manage_data(auth.uid())
      OR is_enfermagem(auth.uid())
      OR (is_medico(auth.uid()) AND is_medico_da_agenda(medico_id))
    )
  );

INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011030000', ARRAY[]::text[], 'agenda_isolamento_medico');
COMMIT;

-- <<< 20261011030000
-- >>> 20261011040000 caixa_select_por_perfil
BEGIN;

-- Match database reads to the roles allowed into the cash register UI.
DROP POLICY IF EXISTS caixa_diario_select_scoped ON public.caixa_diario;
CREATE POLICY caixa_diario_select_scoped
  ON public.caixa_diario
  FOR SELECT
  TO authenticated
  USING (
    public.is_same_clinica(clinica_id)
    AND (
      public.is_admin(auth.uid())
      OR public.is_financeiro(auth.uid())
      OR public.is_recepcao(auth.uid())
    )
  );

INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011040000', ARRAY[]::text[], 'caixa_select_por_perfil');
COMMIT;

-- <<< 20261011040000
-- >>> 20261011050000 fila_triagem_perfis_e_privacidade
BEGIN;

-- Clinical users see triage records; reception gets only appointment IDs via a scoped RPC.
DROP POLICY IF EXISTS triagens_select_scoped ON public.triagens;
CREATE POLICY triagens_select_scoped
  ON public.triagens
  FOR SELECT
  TO authenticated
  USING (
    public.can_access_clinical(auth.uid())
    AND public.is_same_clinica(clinica_id)
  );

-- Queue records can only be created by the validated transactional check-in RPC.
DROP POLICY IF EXISTS fila_atendimento_insert ON public.fila_atendimento;
REVOKE INSERT ON public.fila_atendimento FROM authenticated;

CREATE OR REPLACE FUNCTION public.realizar_checkin(
  p_agendamento_id uuid,
  p_prioridade text DEFAULT 'normal'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agendamento public.agendamentos%rowtype;
  v_fila public.fila_atendimento%rowtype;
  v_posicao integer;
  v_status_anterior text;
  v_clinica_id uuid;
BEGIN
  IF auth.uid() IS NULL
     OR NOT (
       public.is_admin(auth.uid())
       OR public.can_manage_data(auth.uid())
       OR public.is_recepcao(auth.uid())
       OR public.is_enfermagem(auth.uid())
       OR public.is_medico(auth.uid())
     ) THEN
    RAISE EXCEPTION 'Sem permissao para fazer check-in.' USING ERRCODE = '42501';
  END IF;

  IF p_prioridade IS NULL OR p_prioridade NOT IN ('normal', 'preferencial', 'urgente') THEN
    RAISE EXCEPTION 'Prioridade de fila invalida.' USING ERRCODE = 'check_violation';
  END IF;

  v_clinica_id := public.get_my_clinica_id();
  IF v_clinica_id IS NULL THEN
    RAISE EXCEPTION 'Perfil sem clinica vinculada.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_agendamento
    FROM public.agendamentos
   WHERE id = p_agendamento_id
     AND clinica_id = v_clinica_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento nao encontrado nesta clinica.' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT (
    public.is_admin(auth.uid())
    OR public.is_recepcao(auth.uid())
    OR public.can_manage_data(auth.uid())
    OR public.is_enfermagem(auth.uid())
    OR (public.is_medico(auth.uid()) AND public.is_medico_da_agenda(v_agendamento.medico_id))
  ) THEN
    RAISE EXCEPTION 'Sem permissao para fazer check-in neste agendamento.' USING ERRCODE = '42501';
  END IF;

  IF v_agendamento.status::text IN ('cancelado', 'faltou', 'finalizado', 'atendimento_finalizado') THEN
    RAISE EXCEPTION 'O agendamento esta % e nao aceita check-in.', v_agendamento.status USING ERRCODE = 'check_violation';
  END IF;

  v_status_anterior := v_agendamento.status::text;
  SELECT * INTO v_fila
    FROM public.fila_atendimento
   WHERE agendamento_id = p_agendamento_id
     AND clinica_id = v_clinica_id
     AND status <> 'finalizado'
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;
  IF FOUND THEN
    IF (CASE p_prioridade WHEN 'urgente' THEN 3 WHEN 'preferencial' THEN 2 ELSE 1 END)
       > (CASE v_fila.prioridade WHEN 'urgente' THEN 3 WHEN 'preferencial' THEN 2 ELSE 1 END) THEN
      UPDATE public.fila_atendimento
         SET prioridade = p_prioridade
       WHERE id = v_fila.id
       RETURNING * INTO v_fila;
    END IF;
    RETURN jsonb_build_object(
      'repetido', true, 'fila_id', v_fila.id,
      'status_agendamento', v_agendamento.status::text,
      'status_anterior', v_status_anterior,
      'prioridade', v_fila.prioridade,
      'cobranca_estado', v_fila.cobranca_estado
    );
  END IF;

  IF v_agendamento.status::text = 'em_atendimento' THEN
    RAISE EXCEPTION 'O atendimento ja foi iniciado e nao aceita check-in.' USING ERRCODE = 'check_violation';
  END IF;

  IF v_agendamento.data IS DISTINCT FROM (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'Somente consultas de hoje podem entrar na fila.' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_clinica_id::text), 0);
  SELECT coalesce(max(posicao), 0) + 1 INTO v_posicao
    FROM public.fila_atendimento
   WHERE clinica_id = v_clinica_id AND status <> 'finalizado';

  INSERT INTO public.fila_atendimento(
    agendamento_id, posicao, status, prioridade, horario_chegada, clinica_id, cobranca_estado
  ) VALUES (
    v_agendamento.id, v_posicao, 'aguardando', p_prioridade, now(), v_clinica_id, 'pendente'
  ) RETURNING * INTO v_fila;

  UPDATE public.agendamentos SET status = 'aguardando' WHERE id = v_agendamento.id;
  RETURN jsonb_build_object(
    'repetido', false, 'fila_id', v_fila.id,
    'status_agendamento', 'aguardando', 'status_anterior', v_status_anterior,
    'prioridade', p_prioridade, 'cobranca_estado', 'pendente'
  );
END;
$$;
REVOKE ALL ON FUNCTION public.realizar_checkin(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.realizar_checkin(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.listar_agendamentos_com_triagem(p_agendamento_ids uuid[])
RETURNS TABLE (agendamento_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica_id uuid := public.get_my_clinica_id();
BEGIN
  IF auth.uid() IS NULL
     OR v_clinica_id IS NULL
     OR NOT (
       public.is_admin(auth.uid())
       OR public.is_recepcao(auth.uid())
       OR public.can_access_clinical(auth.uid())
     ) THEN
    RAISE EXCEPTION 'Sem permissao para consultar liberacoes de triagem.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT DISTINCT t.agendamento_id
      FROM public.triagens AS t
      JOIN public.agendamentos AS a ON a.id = t.agendamento_id
     WHERE a.clinica_id = v_clinica_id
       AND (t.clinica_id = v_clinica_id OR t.clinica_id IS NULL)
       AND t.agendamento_id = ANY(COALESCE(p_agendamento_ids, ARRAY[]::uuid[]));
END;
$$;
REVOKE ALL ON FUNCTION public.listar_agendamentos_com_triagem(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_agendamentos_com_triagem(uuid[]) TO authenticated;

-- tem_triagem is an internal trigger helper and must not expose a cross-clinic boolean API.
REVOKE ALL ON FUNCTION public.tem_triagem(uuid) FROM PUBLIC, anon, authenticated;

INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011050000', ARRAY[]::text[], 'fila_triagem_perfis_e_privacidade');
COMMIT;

-- <<< 20261011050000
-- >>> 20261011060000 gestao_salas_recepcao
BEGIN;

-- Reception operates rooms during the shift. Keep all mutations restricted to
-- the user's own clinic; platform and clinic admins retain their existing access.
DROP POLICY IF EXISTS salas_insert ON public.salas;
CREATE POLICY salas_insert ON public.salas
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_same_clinica(clinica_id)
    AND (public.is_admin(auth.uid()) OR public.is_recepcao(auth.uid()))
  );

DROP POLICY IF EXISTS salas_update ON public.salas;
CREATE POLICY salas_update ON public.salas
  FOR UPDATE TO authenticated
  USING (
    public.is_same_clinica(clinica_id)
    AND (public.is_admin(auth.uid()) OR public.is_recepcao(auth.uid()))
  )
  WITH CHECK (
    public.is_same_clinica(clinica_id)
    AND (public.is_admin(auth.uid()) OR public.is_recepcao(auth.uid()))
  );

INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011060000', ARRAY[]::text[], 'gestao_salas_recepcao');
COMMIT;

-- <<< 20261011060000
-- >>> 20261011070000 retornos_perfil_medico_e_agenda
BEGIN;

-- Doctors may only see and change returns assigned to their own linked profile.
DROP POLICY IF EXISTS retornos_select_scoped ON public.retornos;
CREATE POLICY retornos_select_scoped ON public.retornos
  FOR SELECT TO authenticated
  USING (
    public.is_same_clinica(clinica_id)
    AND (
      public.is_admin(auth.uid())
      OR public.is_recepcao(auth.uid())
      OR public.is_enfermagem(auth.uid())
      OR (public.is_medico(auth.uid()) AND public.is_medico_da_agenda(medico_id))
    )
  );

DROP POLICY IF EXISTS retornos_insert_scoped ON public.retornos;
CREATE POLICY retornos_insert_scoped ON public.retornos
  FOR INSERT TO authenticated
  WITH CHECK (
    clinica_id = public.get_my_clinica_id()
    AND (
      public.is_admin(auth.uid())
      OR public.is_recepcao(auth.uid())
      OR public.is_enfermagem(auth.uid())
      OR (public.is_medico(auth.uid()) AND public.is_medico_da_agenda(medico_id))
    )
  );

DROP POLICY IF EXISTS retornos_update_scoped ON public.retornos;
CREATE POLICY retornos_update_scoped ON public.retornos
  FOR UPDATE TO authenticated
  USING (
    public.is_same_clinica(clinica_id)
    AND (
      public.is_admin(auth.uid())
      OR public.is_recepcao(auth.uid())
      OR public.is_enfermagem(auth.uid())
      OR (public.is_medico(auth.uid()) AND public.is_medico_da_agenda(medico_id))
    )
  )
  WITH CHECK (
    clinica_id = public.get_my_clinica_id()
    AND (
      public.is_admin(auth.uid())
      OR public.is_recepcao(auth.uid())
      OR public.is_enfermagem(auth.uid())
      OR (public.is_medico(auth.uid()) AND public.is_medico_da_agenda(medico_id))
    )
  );

-- The browser's RLS-scoped agenda query cannot see another doctor's event.
-- This definer RPC checks conflicts privately, revalidates availability and
-- blocks, and writes only a return owned by the caller or clinic operations.
DROP FUNCTION IF EXISTS public.agendar_retorno_atomico(uuid, date, time);
CREATE OR REPLACE FUNCTION public.agendar_retorno_atomico(
  p_retorno_id uuid,
  p_data date,
  p_hora time,
  p_confirmou_fora_expediente boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica_id uuid;
  v_retorno public.retornos%ROWTYPE;
  v_agendamento_id uuid;
  v_fim time;
  v_dia_semana integer;
  v_dentro_expediente boolean;
  v_status_agendamento text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessao invalida.' USING ERRCODE = '42501';
  END IF;

  v_clinica_id := public.get_my_clinica_id();
  IF v_clinica_id IS NULL OR p_data IS NULL OR p_hora IS NULL THEN
    RAISE EXCEPTION 'Clinica, data ou horario invalidos.' USING ERRCODE = '22023';
  END IF;
  IF p_data < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'A data do retorno nao pode estar no passado.' USING ERRCODE = '22023';
  END IF;
  IF p_data = (now() AT TIME ZONE 'America/Sao_Paulo')::date
     AND p_hora <= (now() AT TIME ZONE 'America/Sao_Paulo')::time THEN
    RAISE EXCEPTION 'O horario do retorno nao pode estar no passado.' USING ERRCODE = '22023';
  END IF;

  v_fim := p_hora + interval '30 minutes';
  IF v_fim <= p_hora THEN
    RAISE EXCEPTION 'O horario precisa terminar antes da meia-noite.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_retorno
    FROM public.retornos
   WHERE id = p_retorno_id
     AND clinica_id = v_clinica_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Retorno nao encontrado na clinica atual.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (
    public.is_admin(auth.uid()) OR public.is_recepcao(auth.uid())
    OR public.is_enfermagem(auth.uid())
    OR (public.is_medico(auth.uid()) AND public.is_medico_da_agenda(v_retorno.medico_id))
  ) THEN
    RAISE EXCEPTION 'Sem permissao para agendar este retorno.' USING ERRCODE = '42501';
  END IF;
  IF v_retorno.status IN ('realizado', 'cancelado') THEN
    RAISE EXCEPTION 'Este retorno ja foi realizado ou cancelado.' USING ERRCODE = '23514';
  END IF;
  IF v_retorno.paciente_id IS NULL OR v_retorno.medico_id IS NULL THEN
    RAISE EXCEPTION 'O retorno precisa ter paciente e medico vinculados.' USING ERRCODE = '23503';
  END IF;
  PERFORM 1 FROM public.pacientes p
   WHERE p.id = v_retorno.paciente_id AND p.clinica_id = v_clinica_id
   FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O paciente do retorno nao pertence a clinica atual.' USING ERRCODE = '23503';
  END IF;
  PERFORM 1 FROM public.medicos m
   WHERE m.id = v_retorno.medico_id AND m.clinica_id = v_clinica_id
   FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O medico do retorno nao pertence a clinica atual.' USING ERRCODE = '23503';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'agendamento-online-medico:' || v_clinica_id::text || ':' || v_retorno.medico_id::text || ':' || p_data::text, 0
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'agendamento-online-paciente:' || v_clinica_id::text || ':' || v_retorno.paciente_id::text || ':' || p_data::text, 0
  ));

  IF EXISTS (
    SELECT 1 FROM public.agendamentos a
     WHERE a.clinica_id = v_clinica_id AND a.medico_id = v_retorno.medico_id AND a.data = p_data
       AND a.id IS DISTINCT FROM v_retorno.agendamento_retorno_id
       AND a.status IS DISTINCT FROM 'cancelado'::public.status_agendamento
       AND a.status IS DISTINCT FROM 'faltou'::public.status_agendamento
       AND a.hora_inicio < v_fim
       AND COALESCE(a.hora_fim, a.hora_inicio + interval '30 minutes') > p_hora
  ) THEN
    RAISE EXCEPTION 'Este medico ja tem uma consulta neste horario. Escolha outro horario.' USING ERRCODE = '23P01';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agendamentos a
     WHERE a.clinica_id = v_clinica_id AND a.paciente_id = v_retorno.paciente_id AND a.data = p_data
       AND a.id IS DISTINCT FROM v_retorno.agendamento_retorno_id
       AND a.status IS DISTINCT FROM 'cancelado'::public.status_agendamento
       AND a.status IS DISTINCT FROM 'faltou'::public.status_agendamento
       AND a.hora_inicio < v_fim
       AND COALESCE(a.hora_fim, a.hora_inicio + interval '30 minutes') > p_hora
  ) THEN
    RAISE EXCEPTION 'Este paciente ja tem outro atendimento neste horario. Escolha outro horario.' USING ERRCODE = '23P01';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bloqueios_agenda b
     WHERE b.medico_id = v_retorno.medico_id
       AND b.data_inicio <= p_data AND b.data_fim >= p_data
       AND (COALESCE(b.dia_inteiro, true) OR (
         b.hora_inicio IS NOT NULL AND b.hora_fim IS NOT NULL
         AND b.hora_inicio < v_fim AND b.hora_fim > p_hora
       ))
  ) THEN
    RAISE EXCEPTION 'Este horario esta bloqueado para o medico.' USING ERRCODE = '23P01';
  END IF;

  v_dia_semana := extract(dow FROM p_data)::integer;
  SELECT EXISTS (
    SELECT 1 FROM public.medico_disponibilidade d
     WHERE d.medico_id = v_retorno.medico_id AND d.dia_semana = v_dia_semana AND d.ativo = true
       AND p_hora >= d.hora_inicio AND v_fim <= d.hora_fim
  ) INTO v_dentro_expediente;
  IF NOT v_dentro_expediente AND NOT COALESCE(p_confirmou_fora_expediente, false) THEN
    RAISE EXCEPTION 'O horario esta fora do expediente cadastrado. Confirme explicitamente para continuar.' USING ERRCODE = '22023';
  END IF;

  IF v_retorno.agendamento_retorno_id IS NOT NULL THEN
    v_agendamento_id := v_retorno.agendamento_retorno_id;
    SELECT a.status::text INTO v_status_agendamento
      FROM public.agendamentos a
     WHERE a.id = v_agendamento_id
       AND a.clinica_id = v_clinica_id
       AND a.paciente_id = v_retorno.paciente_id
       AND a.medico_id = v_retorno.medico_id
     FOR UPDATE;
    IF NOT FOUND OR v_status_agendamento IS NULL
       OR v_status_agendamento NOT IN ('agendado', 'confirmado', 'aguardando', 'aguardando_triagem') THEN
      RAISE EXCEPTION 'O atendimento ja foi iniciado ou encerrado e nao pode ser remarcado.' USING ERRCODE = '23514';
    END IF;
    UPDATE public.agendamentos
       SET data = p_data, hora_inicio = p_hora, hora_fim = v_fim, status = 'agendado'
     WHERE id = v_agendamento_id
       AND clinica_id = v_clinica_id
       AND paciente_id = v_retorno.paciente_id
       AND medico_id = v_retorno.medico_id
       AND status::text IN ('agendado', 'confirmado', 'aguardando', 'aguardando_triagem');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'O horario vinculado nao foi encontrado na clinica atual.' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    INSERT INTO public.agendamentos (
      paciente_id, medico_id, data, hora_inicio, hora_fim, tipo, observacoes, status, clinica_id
    ) VALUES (
      v_retorno.paciente_id, v_retorno.medico_id, p_data, p_hora, v_fim, 'retorno',
      'Retorno: ' || COALESCE(NULLIF(btrim(v_retorno.motivo), ''), 'Consulta de retorno'), 'agendado', v_clinica_id
    ) RETURNING id INTO v_agendamento_id;
  END IF;

  UPDATE public.retornos
     SET agendamento_retorno_id = v_agendamento_id, data_retorno_prevista = p_data, status = 'agendado'
   WHERE id = v_retorno.id AND clinica_id = v_clinica_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O retorno nao foi atualizado.' USING ERRCODE = '40001';
  END IF;
  RETURN v_agendamento_id;
END;
$$;

REVOKE ALL ON FUNCTION public.agendar_retorno_atomico(uuid, date, time, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agendar_retorno_atomico(uuid, date, time, boolean) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011070000', ARRAY[]::text[], 'retornos_perfil_medico_e_agenda');
COMMIT;

-- <<< 20261011070000
-- >>> 20261011080000 risco_faltas_perfil_e_lembrete
BEGIN;

-- Match score visibility to the admin/reception route that uses this module.
DROP POLICY IF EXISTS predicoes_no_show_clinica ON public.predicoes_no_show;
DROP POLICY IF EXISTS "Clinica acessa predicoes" ON public.predicoes_no_show;
CREATE POLICY predicoes_no_show_clinica ON public.predicoes_no_show
  FOR SELECT TO authenticated
  USING (
    public.is_same_clinica(clinica_id)
    AND (public.is_admin(auth.uid()) OR public.is_recepcao(auth.uid()))
  );

-- Recalcula previsões com paciente, médico e histórico limitados à clínica do
-- agendamento. A versão anterior somava o histórico global do paciente e
-- montava notificações sem conferir os tenants das referências.
CREATE OR REPLACE FUNCTION public.atualizar_predicoes_no_show()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  a record;
  total_hist integer;
  faltas integer;
  cancelados integer;
  risco numeric;
  motivos text[];
  recomendacoes text[];
  processados integer := 0;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  DELETE FROM public.predicoes_no_show pn
   WHERE NOT EXISTS (
     SELECT 1
       FROM public.agendamentos ag
       JOIN public.pacientes p ON p.id = ag.paciente_id AND p.clinica_id = ag.clinica_id
       JOIN public.medicos m ON m.id = ag.medico_id AND m.clinica_id = ag.clinica_id
      WHERE ag.id = pn.agendamento_id
        AND ag.paciente_id = pn.paciente_id
        AND ag.clinica_id = pn.clinica_id
        AND ag.data >= v_hoje
        AND ag.status IN ('agendado', 'confirmado')
   );

  FOR a IN
    SELECT ag.*, p.nome, p.email, p.telefone, m.nome AS medico_nome
      FROM public.agendamentos ag
      JOIN public.pacientes p ON p.id = ag.paciente_id AND p.clinica_id = ag.clinica_id
      JOIN public.medicos m ON m.id = ag.medico_id AND m.clinica_id = ag.clinica_id
     WHERE ag.data >= v_hoje
       AND ag.status IN ('agendado', 'confirmado')
  LOOP
    SELECT count(*),
           count(*) FILTER (WHERE hist.status = 'faltou'),
           count(*) FILTER (WHERE hist.status = 'cancelado')
      INTO total_hist, faltas, cancelados
      FROM public.agendamentos hist
     WHERE hist.clinica_id = a.clinica_id
       AND hist.paciente_id = a.paciente_id
       AND hist.id <> a.id
       AND hist.data < a.data
       AND hist.status IN ('finalizado', 'faltou', 'cancelado');

    risco := 0.08;
    motivos := ARRAY[]::text[];
    recomendacoes := ARRAY[]::text[];
    IF total_hist = 0 THEN
      risco := risco + 0.10;
      motivos := array_append(motivos, 'Paciente sem histórico suficiente');
    END IF;
    IF faltas > 0 THEN
      risco := risco + LEAST(0.50, (faltas::numeric / GREATEST(total_hist, 1)) * 0.65);
      motivos := array_append(motivos, format('%s falta(s) em %s atendimento(s)', faltas, total_hist));
    END IF;
    IF cancelados >= 2 THEN
      risco := risco + LEAST(0.12, cancelados * 0.025);
      motivos := array_append(motivos, format('%s cancelamentos anteriores', cancelados));
    END IF;
    IF a.status = 'agendado' THEN
      risco := risco + 0.18;
      motivos := array_append(motivos, 'Presença ainda não confirmada');
      recomendacoes := array_append(recomendacoes, 'Solicitar confirmação');
    END IF;
    IF a.data - v_hoje > 14 THEN
      risco := risco + 0.08;
      motivos := array_append(motivos, 'Agendado com grande antecedência');
    END IF;
    IF extract(hour FROM a.hora_inicio) >= 17 THEN
      risco := risco + 0.05;
      motivos := array_append(motivos, 'Horário no fim do dia');
    END IF;
    IF extract(isodow FROM a.data) = 5 AND extract(hour FROM a.hora_inicio) >= 15 THEN
      risco := risco + 0.05;
      motivos := array_append(motivos, 'Sexta-feira à tarde');
    END IF;
    risco := round(LEAST(0.95, GREATEST(0.03, risco)), 2);

    IF risco >= 0.70 THEN
      recomendacoes := array_append(array_append(recomendacoes, 'Contato ativo da recepção'), 'Oferecer remarcação se necessário');
    ELSIF risco >= 0.40 THEN
      recomendacoes := array_append(recomendacoes, 'Reforçar lembrete 24 horas antes');
    ELSE
      recomendacoes := array_append(recomendacoes, 'Lembrete padrão');
    END IF;

    INSERT INTO public.predicoes_no_show(
      agendamento_id, paciente_id, probabilidade_no_show, motivos_risco,
      recomendacoes, clinica_id, updated_at
    ) VALUES (
      a.id, a.paciente_id, risco, motivos, array_to_string(recomendacoes, ' • '), a.clinica_id, now()
    )
    ON CONFLICT (agendamento_id) DO UPDATE
      SET paciente_id = EXCLUDED.paciente_id,
          probabilidade_no_show = EXCLUDED.probabilidade_no_show,
          motivos_risco = EXCLUDED.motivos_risco,
          recomendacoes = EXCLUDED.recomendacoes,
          clinica_id = EXCLUDED.clinica_id,
          updated_at = now();

    IF risco >= 0.70
       AND a.data BETWEEN v_hoje AND v_hoje + 2
       AND NOT EXISTS (
         SELECT 1 FROM public.notification_queue q
          WHERE q.clinica_id = a.clinica_id
            AND q.dados_extras @> jsonb_build_object('agendamento_id', a.id)
            AND q.dados_extras->>'tipo_notificacao' IN ('lembrete_risco_manual', 'prevencao_no_show')
            AND (
              q.status IN ('pendente', 'enviando')
              OR (q.status = 'enviado' AND COALESCE(q.enviado_em, q.created_at) > now() - interval '20 hours')
            )
       ) THEN
      IF NULLIF(btrim(a.telefone), '') IS NOT NULL THEN
        INSERT INTO public.notification_queue(
          tipo, destinatario_id, destinatario_telefone, destinatario_nome,
          assunto, conteudo, status, clinica_id, dados_extras
        ) VALUES (
          'whatsapp', a.paciente_id, a.telefone, a.nome,
          'Confirmação de consulta',
          format('Olá %s! Podemos confirmar sua consulta com Dr(a). %s em %s às %s?',
            a.nome, a.medico_nome, to_char(a.data, 'DD/MM/YYYY'), to_char(a.hora_inicio, 'HH24:MI')),
          'pendente', a.clinica_id,
          jsonb_build_object('tipo_notificacao', 'prevencao_no_show', 'agendamento_id', a.id, 'risco', risco)
        );
      ELSIF NULLIF(btrim(a.email), '') IS NOT NULL THEN
        INSERT INTO public.notification_queue(
          tipo, destinatario_id, destinatario_email, destinatario_nome,
          assunto, conteudo, status, clinica_id, dados_extras
        ) VALUES (
          'email', a.paciente_id, a.email, a.nome,
          'Confirme sua consulta',
          format('Olá %s! Confirme sua consulta com Dr(a). %s em %s às %s.',
            a.nome, a.medico_nome, to_char(a.data, 'DD/MM/YYYY'), to_char(a.hora_inicio, 'HH24:MI')),
          'pendente', a.clinica_id,
          jsonb_build_object('tipo_notificacao', 'prevencao_no_show', 'agendamento_id', a.id, 'risco', risco)
        );
      END IF;
    END IF;
    processados := processados + 1;
  END LOOP;
  RETURN processados;
END;
$$;

REVOKE ALL ON FUNCTION public.atualizar_predicoes_no_show() FROM PUBLIC, anon, authenticated;

-- Enqueue through a narrow server-side operation: the notification queue itself
-- remains admin-only for direct table writes.
CREATE OR REPLACE FUNCTION public.enfileirar_lembrete_risco(p_agendamento_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica_id uuid := public.get_my_clinica_id();
  v_agendamento record;
  v_linhas integer;
BEGIN
  IF auth.uid() IS NULL
     OR v_clinica_id IS NULL
     OR NOT (public.is_admin(auth.uid()) OR public.is_recepcao(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissao para enviar lembretes de risco.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('lembrete-risco:' || p_agendamento_id::text, 0));

  SELECT ag.id, ag.clinica_id, ag.paciente_id, ag.data, ag.hora_inicio,
         p.nome, p.telefone, p.email, m.nome AS medico_nome
    INTO v_agendamento
    FROM public.agendamentos ag
    JOIN public.pacientes p ON p.id = ag.paciente_id AND p.clinica_id = ag.clinica_id
    JOIN public.medicos m ON m.id = ag.medico_id AND m.clinica_id = ag.clinica_id
   WHERE ag.id = p_agendamento_id
     AND ag.clinica_id = v_clinica_id
     AND ag.data >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
     AND ag.status IN ('agendado', 'confirmado');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento nao encontrado na clinica ou indisponivel para lembrete.' USING ERRCODE = 'P0002';
  END IF;
  IF NULLIF(btrim(v_agendamento.telefone), '') IS NULL
     AND NULLIF(btrim(v_agendamento.email), '') IS NULL THEN
    RAISE EXCEPTION 'O paciente nao possui telefone ou e-mail cadastrado.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.notification_queue q
     WHERE q.clinica_id = v_clinica_id
       AND q.dados_extras @> jsonb_build_object('agendamento_id', p_agendamento_id)
       AND q.dados_extras->>'tipo_notificacao' IN ('lembrete_risco_manual', 'prevencao_no_show')
       AND (
         q.status IN ('pendente', 'enviando')
         OR (q.status = 'enviado' AND COALESCE(q.enviado_em, q.created_at) > now() - interval '20 hours')
       )
  ) THEN
    RETURN false;
  END IF;

  IF NULLIF(btrim(v_agendamento.telefone), '') IS NOT NULL THEN
    INSERT INTO public.notification_queue(
      tipo, destinatario_id, destinatario_telefone, destinatario_nome, assunto, conteudo,
      status, clinica_id, dados_extras
    ) VALUES (
      'whatsapp', v_agendamento.paciente_id, v_agendamento.telefone, v_agendamento.nome,
      'Lembrete de consulta',
      format('Ola %s! Lembramos sua consulta com Dr(a). %s em %s as %s. Responda para confirmar.',
        v_agendamento.nome, v_agendamento.medico_nome,
        to_char(v_agendamento.data, 'DD/MM/YYYY'), to_char(v_agendamento.hora_inicio, 'HH24:MI')),
      'pendente', v_clinica_id,
      jsonb_build_object('tipo_notificacao', 'lembrete_risco_manual', 'agendamento_id', p_agendamento_id)
    );
  ELSE
    INSERT INTO public.notification_queue(
      tipo, destinatario_id, destinatario_email, destinatario_nome, assunto, conteudo,
      status, clinica_id, dados_extras
    ) VALUES (
      'email', v_agendamento.paciente_id, v_agendamento.email, v_agendamento.nome,
      'Lembrete de consulta',
      format('Ola %s! Lembramos sua consulta com Dr(a). %s em %s as %s.',
        v_agendamento.nome, v_agendamento.medico_nome,
        to_char(v_agendamento.data, 'DD/MM/YYYY'), to_char(v_agendamento.hora_inicio, 'HH24:MI')),
      'pendente', v_clinica_id,
      jsonb_build_object('tipo_notificacao', 'lembrete_risco_manual', 'agendamento_id', p_agendamento_id)
    );
  END IF;
  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  RETURN v_linhas > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.enfileirar_lembrete_risco(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enfileirar_lembrete_risco(uuid) TO authenticated;

-- The hourly predictor also enqueues directly. Serialize all manual and
-- automatic risk reminders at insertion so the 20-hour deduplication cannot
-- race between two independent callers.
CREATE OR REPLACE FUNCTION public.evitar_lembrete_risco_duplicado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agendamento_id uuid;
BEGIN
  IF COALESCE(NEW.dados_extras->>'tipo_notificacao', '') NOT IN ('lembrete_risco_manual', 'prevencao_no_show') THEN
    RETURN NEW;
  END IF;
  v_agendamento_id := NULLIF(NEW.dados_extras->>'agendamento_id', '')::uuid;
  IF v_agendamento_id IS NULL OR NEW.clinica_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('lembrete-risco:' || v_agendamento_id::text, 0));
  IF EXISTS (
    SELECT 1 FROM public.notification_queue q
     WHERE q.clinica_id = NEW.clinica_id
       AND q.dados_extras @> jsonb_build_object('agendamento_id', v_agendamento_id)
       AND q.dados_extras->>'tipo_notificacao' IN ('lembrete_risco_manual', 'prevencao_no_show')
       AND (
         q.status IN ('pendente', 'enviando')
         OR (q.status = 'enviado' AND COALESCE(q.enviado_em, q.created_at) > now() - interval '20 hours')
       )
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.evitar_lembrete_risco_duplicado() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS notification_queue_dedupe_lembrete_risco ON public.notification_queue;
CREATE TRIGGER notification_queue_dedupe_lembrete_risco
  BEFORE INSERT ON public.notification_queue
  FOR EACH ROW EXECUTE FUNCTION public.evitar_lembrete_risco_duplicado();

INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011080000', ARRAY[]::text[], 'risco_faltas_perfil_e_lembrete');
COMMIT;

-- <<< 20261011080000
-- >>> 20261011090000 pacientes_privacidade_financeira
BEGIN;

-- Financial-only accounts need patient identity/contact details for billing,
-- but must not be able to read clinical fields from the patient table.
DROP POLICY IF EXISTS "pacientes_select" ON public.pacientes;
CREATE POLICY pacientes_select_clinico ON public.pacientes
  FOR SELECT TO authenticated
  USING (
    public.is_same_clinica(clinica_id)
    AND (
      public.is_admin(auth.uid())
      OR public.is_recepcao(auth.uid())
      OR public.is_enfermagem(auth.uid())
      OR public.is_medico(auth.uid())
    )
  );

-- A policy anterior permitia clinica_id NULL, criando fichas sem tenant. A
-- tela envia o tenant, mas a validação também precisa valer para chamadas à API.
DROP POLICY IF EXISTS pacientes_insert ON public.pacientes;
CREATE POLICY pacientes_insert ON public.pacientes
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.can_manage_data(auth.uid()) OR public.is_medico(auth.uid()) OR public.is_enfermagem(auth.uid()))
    AND clinica_id = public.get_my_clinica_id()
  );

CREATE OR REPLACE FUNCTION public.buscar_pacientes_resumo_financeiro(
  p_ids uuid[] DEFAULT NULL,
  p_termo text DEFAULT NULL,
  p_limite integer DEFAULT 20,
  p_sexo text DEFAULT NULL,
  p_convenio_id uuid DEFAULT NULL,
  p_somente_particular boolean DEFAULT false,
  p_nascimento_apos date DEFAULT NULL,
  p_nascimento_ate date DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  nome text,
  nome_social text,
  cpf text,
  telefone text,
  email text,
  data_nascimento date,
  convenio_id uuid,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica_id uuid := public.get_my_clinica_id();
BEGIN
  IF auth.uid() IS NULL OR v_clinica_id IS NULL OR NOT (
    public.is_admin(auth.uid()) OR public.is_recepcao(auth.uid())
    OR public.is_enfermagem(auth.uid()) OR public.is_medico(auth.uid())
    OR public.is_financeiro(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Sem permissao para consultar dados basicos de pacientes.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT p.id, p.nome::text, p.nome_social::text, p.cpf::text,
           p.telefone::text, p.email::text, p.data_nascimento::date,
           p.convenio_id, p.created_at
      FROM public.pacientes p
     WHERE p.clinica_id = v_clinica_id
       AND (p_ids IS NULL OR p.id = ANY(p_ids))
       AND (NULLIF(btrim(p_termo), '') IS NULL OR
            p.nome ILIKE '%' || btrim(p_termo) || '%' OR
            COALESCE(p.nome_social, '') ILIKE '%' || btrim(p_termo) || '%' OR
            COALESCE(p.email, '') ILIKE '%' || btrim(p_termo) || '%' OR
            (regexp_replace(COALESCE(p.cpf, ''), '\D', '', 'g') LIKE '%' || regexp_replace(COALESCE(p_termo, ''), '\D', '', 'g') || '%' AND length(regexp_replace(COALESCE(p_termo, ''), '\D', '', 'g')) >= 3) OR
            (regexp_replace(COALESCE(p.telefone, ''), '\D', '', 'g') LIKE '%' || regexp_replace(COALESCE(p_termo, ''), '\D', '', 'g') || '%' AND length(regexp_replace(COALESCE(p_termo, ''), '\D', '', 'g')) >= 3))
       AND (p_sexo IS NULL OR p.sexo = p_sexo)
       AND (NOT COALESCE(p_somente_particular, false) OR p.convenio_id IS NULL)
       AND (p_convenio_id IS NULL OR p.convenio_id = p_convenio_id)
       AND (p_nascimento_apos IS NULL OR p.data_nascimento >= p_nascimento_apos)
       AND (p_nascimento_ate IS NULL OR p.data_nascimento <= p_nascimento_ate)
     ORDER BY p.created_at DESC, p.id
     LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 20), 500));
END;
$$;

REVOKE ALL ON FUNCTION public.buscar_pacientes_resumo_financeiro(uuid[], text, integer, text, uuid, boolean, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_pacientes_resumo_financeiro(uuid[], text, integer, text, uuid, boolean, date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.resumo_pacientes_clinica(p_hoje date)
RETURNS TABLE(total bigint, com_convenio bigint, menores bigint, com_alergias bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT count(*) AS total,
         count(*) FILTER (WHERE p.convenio_id IS NOT NULL) AS com_convenio,
         count(*) FILTER (WHERE p.data_nascimento IS NOT NULL AND p.data_nascimento <= p_hoje
           AND p.data_nascimento > (p_hoje - interval '18 years')::date) AS menores,
         count(*) FILTER (WHERE cardinality(COALESCE(p.alergias, ARRAY[]::text[])) > 0) AS com_alergias
    FROM public.pacientes p
   WHERE p.clinica_id = public.get_my_clinica_id()
     AND (public.is_admin(auth.uid()) OR public.is_recepcao(auth.uid())
       OR public.is_enfermagem(auth.uid()) OR public.is_medico(auth.uid()));
$$;
REVOKE ALL ON FUNCTION public.resumo_pacientes_clinica(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resumo_pacientes_clinica(date) TO authenticated;

CREATE OR REPLACE FUNCTION public.contar_pacientes_cadastrados(p_inicio timestamptz, p_fim timestamptz)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica_id uuid := public.get_my_clinica_id();
  v_total bigint;
BEGIN
  IF auth.uid() IS NULL OR v_clinica_id IS NULL OR NOT (
    public.is_admin(auth.uid()) OR public.is_recepcao(auth.uid())
    OR public.is_enfermagem(auth.uid()) OR public.is_medico(auth.uid())
    OR public.is_financeiro(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Sem permissao para consultar indicadores de pacientes.' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO v_total FROM public.pacientes p
   WHERE p.clinica_id = v_clinica_id AND p.created_at >= p_inicio AND p.created_at < p_fim;
  RETURN v_total;
END;
$$;
REVOKE ALL ON FUNCTION public.contar_pacientes_cadastrados(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contar_pacientes_cadastrados(timestamptz, timestamptz) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011090000', ARRAY[]::text[], 'pacientes_privacidade_financeira');
COMMIT;

-- <<< 20261011090000
-- >>> 20261011090001 tiss_gravacoes_controladas
BEGIN;

-- Lotes are created as drafts and can only be marked as sent through the
-- validated operations below. Payment status remains exclusive to the return RPC.
REVOKE INSERT, UPDATE ON public.lotes_tiss FROM authenticated, anon, PUBLIC;
REVOKE UPDATE ON public.glosas_convenio FROM authenticated, anon, PUBLIC;

CREATE OR REPLACE FUNCTION public.criar_lote_tiss(
  p_convenio_id uuid,
  p_competencia date,
  p_numero_lote text,
  p_quantidade_guias integer,
  p_valor_apresentado numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinica uuid := public.get_my_clinica_id();
  v_versao text;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_financial(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso financeiro necessário';
  END IF;
  IF v_clinica IS NULL OR p_convenio_id IS NULL OR p_competencia IS NULL
     OR p_competencia <> date_trunc('month', p_competencia)::date
     OR NULLIF(btrim(COALESCE(p_numero_lote, '')), '') IS NULL
     OR p_quantidade_guias IS NULL OR p_quantidade_guias < 1
     OR p_valor_apresentado IS NULL OR p_valor_apresentado <= 0
     OR p_valor_apresentado <> round(p_valor_apresentado, 2) THEN
    RAISE EXCEPTION 'Informe competência, número, quantidade e valor válidos';
  END IF;

  SELECT c.versao_tiss INTO v_versao
    FROM public.convenios c
   WHERE c.id = p_convenio_id AND c.clinica_id = v_clinica;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convênio não encontrado nesta clínica';
  END IF;

  INSERT INTO public.lotes_tiss (
    clinica_id, convenio_id, competencia, numero_lote, versao_tiss,
    quantidade_guias, valor_apresentado, status, criado_por
  ) VALUES (
    v_clinica, p_convenio_id, p_competencia, btrim(p_numero_lote),
    COALESCE(NULLIF(btrim(v_versao), ''), '04.01.00'),
    p_quantidade_guias, p_valor_apresentado, 'rascunho', auth.uid()
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id, 'status', 'rascunho');
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_envio_lote_tiss(p_lote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinica uuid := public.get_my_clinica_id();
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_financial(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso financeiro necessário';
  END IF;
  IF v_clinica IS NULL OR p_lote_id IS NULL THEN
    RAISE EXCEPTION 'Lote inválido';
  END IF;

  UPDATE public.lotes_tiss
     SET status = 'enviado', enviado_em = now()
   WHERE id = p_lote_id AND clinica_id = v_clinica AND status = 'rascunho'
  RETURNING id INTO v_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote não encontrado ou não está mais como rascunho';
  END IF;

  RETURN jsonb_build_object('success', true, 'id', v_id, 'status', 'enviado');
END;
$$;

CREATE OR REPLACE FUNCTION public.atualizar_glosa_convenio(
  p_glosa_id uuid,
  p_status text,
  p_recurso_justificativa text DEFAULT NULL,
  p_valor_recuperado numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinica uuid := public.get_my_clinica_id();
  v_glosa public.glosas_convenio%ROWTYPE;
  v_status_anterior text;
  v_justificativa text := NULLIF(btrim(COALESCE(p_recurso_justificativa, '')), '');
  v_recuperado numeric(14,2);
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_financial(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso financeiro necessário';
  END IF;
  IF v_clinica IS NULL OR p_glosa_id IS NULL THEN
    RAISE EXCEPTION 'Glosa inválida';
  END IF;

  SELECT * INTO v_glosa
    FROM public.glosas_convenio
   WHERE id = p_glosa_id AND clinica_id = v_clinica
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Glosa não encontrada nesta clínica';
  END IF;
  v_status_anterior := v_glosa.status;

  IF p_status = 'recurso_preparacao'
     AND v_status_anterior IN ('pendente', 'recurso_preparacao') THEN
    IF length(COALESCE(v_justificativa, '')) < 10 THEN
      RAISE EXCEPTION 'A justificativa do recurso deve ter ao menos 10 caracteres';
    END IF;
    UPDATE public.glosas_convenio
       SET status = 'recurso_preparacao', recurso_justificativa = v_justificativa
     WHERE id = v_glosa.id;
  ELSIF p_status = 'recurso_enviado' AND v_status_anterior = 'recurso_preparacao' THEN
    IF length(COALESCE(NULLIF(btrim(v_glosa.recurso_justificativa), ''), '')) < 10 THEN
      RAISE EXCEPTION 'Registre a justificativa antes de enviar o recurso';
    END IF;
    UPDATE public.glosas_convenio
       SET status = 'recurso_enviado', recurso_enviado_em = now()
     WHERE id = v_glosa.id;
  ELSIF p_status IN ('aceita', 'mantida') AND v_status_anterior = 'recurso_enviado' THEN
    v_recuperado := COALESCE(p_valor_recuperado, 0);
    IF v_recuperado < 0 OR v_recuperado > v_glosa.valor_glosado
       OR v_recuperado <> round(v_recuperado, 2)
       OR (p_status = 'mantida' AND v_recuperado <> 0) THEN
      RAISE EXCEPTION 'O valor recuperado deve estar entre zero e o valor glosado';
    END IF;
    UPDATE public.glosas_convenio
       SET status = p_status, valor_recuperado = v_recuperado, resolvido_em = now()
     WHERE id = v_glosa.id;
  ELSE
    RAISE EXCEPTION 'Transição de glosa inválida';
  END IF;

  RETURN jsonb_build_object('success', true, 'id', v_glosa.id, 'status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.criar_lote_tiss(uuid, date, text, integer, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_lote_tiss(uuid, date, text, integer, numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.registrar_envio_lote_tiss(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_envio_lote_tiss(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.atualizar_glosa_convenio(uuid, text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_glosa_convenio(uuid, text, text, numeric) TO authenticated;

COMMENT ON FUNCTION public.criar_lote_tiss(uuid, date, text, integer, numeric) IS
  'Cria lote TISS somente como rascunho, dentro do convênio e clínica do usuário financeiro.';
COMMENT ON FUNCTION public.registrar_envio_lote_tiss(uuid) IS
  'Marca como enviado somente lote em rascunho pertencente à clínica do usuário financeiro.';
COMMENT ON FUNCTION public.atualizar_glosa_convenio(uuid, text, text, numeric) IS
  'Aplica transições permitidas da glosa e valida justificativa e valor recuperado no banco.';

INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011090001', ARRAY[]::text[], 'tiss_gravacoes_controladas');
COMMIT;

-- <<< 20261011090001
-- >>> 20261011100000 prontuario_audit_privacy
BEGIN;
-- Remove campos que podem conter informação clínica ou identificar pacientes
-- dos eventos de auditoria do prontuário. A trilha mantém usuário, operação,
-- data/hora e identificador do registro para rastreabilidade.
CREATE OR REPLACE FUNCTION public.fn_sanitizar_auditoria_prontuario()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.collection = 'prontuarios' THEN
    NEW.record_name := NULL;
    NEW.changes := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sanitizar_auditoria_prontuario ON public.audit_log;
CREATE TRIGGER trg_sanitizar_auditoria_prontuario
  BEFORE INSERT OR UPDATE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.fn_sanitizar_auditoria_prontuario();

UPDATE public.audit_log
   SET record_name = NULL, changes = NULL
 WHERE collection = 'prontuarios'
   AND (record_name IS NOT NULL OR changes IS NOT NULL);
INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011100000', ARRAY[]::text[], 'prontuario_audit_privacy');
COMMIT;

-- <<< 20261011100000
-- >>> 20261011110000 tarefas_responsavel_mesma_clinica
BEGIN;
-- Impede que uma tarefa de uma clínica seja atribuída a um perfil de outro tenant.
CREATE OR REPLACE FUNCTION public.validar_responsavel_da_tarefa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  responsavel_clinica_id uuid;
BEGIN
  IF NEW.responsavel_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.clinica_id
    INTO responsavel_clinica_id
    FROM public.profiles p
   WHERE p.id = NEW.responsavel_id;

  IF NOT FOUND OR NEW.clinica_id IS NULL OR responsavel_clinica_id IS DISTINCT FROM NEW.clinica_id THEN
    RAISE EXCEPTION 'O responsável precisa pertencer à mesma clínica da tarefa.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tarefas_validar_responsavel ON public.tarefas;
CREATE TRIGGER tarefas_validar_responsavel
  BEFORE INSERT OR UPDATE OF responsavel_id, clinica_id ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION public.validar_responsavel_da_tarefa();
INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011110000', ARRAY[]::text[], 'tarefas_responsavel_mesma_clinica');
COMMIT;

-- <<< 20261011110000
-- >>> 20261011120000 triagem_tenant_e_autoria
BEGIN;

-- Keep clinical references inside the triage tenant and make the recorded
-- author match the authenticated user for direct REST writes as well.
CREATE OR REPLACE FUNCTION public.validar_referencias_triagem()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  paciente_clinica_id uuid;
  agendamento_clinica_id uuid;
  agendamento_paciente_id uuid;
BEGIN
  IF NEW.clinica_id IS NULL THEN
    RAISE EXCEPTION 'A triagem precisa pertencer a uma clínica.'
      USING ERRCODE = '23514';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.is_same_clinica(NEW.clinica_id) THEN
    RAISE EXCEPTION 'A triagem precisa pertencer à clínica do usuário autenticado.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' AND auth.uid() IS NOT NULL
     AND NEW.enfermeiro_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'A autoria da triagem precisa corresponder ao usuário autenticado.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.enfermeiro_id IS DISTINCT FROM OLD.enfermeiro_id THEN
    RAISE EXCEPTION 'A autoria registrada da triagem não pode ser alterada.'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.clinica_id
    INTO paciente_clinica_id
    FROM public.pacientes p
   WHERE p.id = NEW.paciente_id
   FOR SHARE;

  IF NOT FOUND OR paciente_clinica_id IS DISTINCT FROM NEW.clinica_id THEN
    RAISE EXCEPTION 'O paciente precisa pertencer à mesma clínica da triagem.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.agendamento_id IS NOT NULL THEN
    SELECT a.clinica_id, a.paciente_id
      INTO agendamento_clinica_id, agendamento_paciente_id
      FROM public.agendamentos a
     WHERE a.id = NEW.agendamento_id
     FOR SHARE;

    IF NOT FOUND
       OR agendamento_clinica_id IS DISTINCT FROM NEW.clinica_id
       OR agendamento_paciente_id IS DISTINCT FROM NEW.paciente_id THEN
      RAISE EXCEPTION 'O agendamento precisa pertencer à mesma clínica e ao mesmo paciente da triagem.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_referencias_triagem() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS triagens_validar_referencias ON public.triagens;
CREATE TRIGGER triagens_validar_referencias
  BEFORE INSERT OR UPDATE OF paciente_id, agendamento_id, clinica_id, enfermeiro_id
  ON public.triagens
  FOR EACH ROW EXECUTE FUNCTION public.validar_referencias_triagem();

INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011120000', ARRAY[]::text[], 'triagem_tenant_e_autoria');
COMMIT;

-- <<< 20261011120000
-- >>> 20261011130000 integridade_salas_lista_espera
BEGIN;

-- Keep optional room-provider references in the same clinic as the room.
CREATE OR REPLACE FUNCTION public.validar_medico_responsavel_sala()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  medico_clinica_id uuid;
BEGIN
  IF NEW.clinica_id IS NULL THEN
    RAISE EXCEPTION 'A sala precisa pertencer a uma clínica.'
      USING ERRCODE = '23514';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.is_same_clinica(NEW.clinica_id) THEN
    RAISE EXCEPTION 'A sala precisa pertencer à clínica do usuário autenticado.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.medico_responsavel IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT m.clinica_id
    INTO medico_clinica_id
    FROM public.medicos m
   WHERE m.id = NEW.medico_responsavel
   FOR SHARE;

  IF NOT FOUND OR medico_clinica_id IS DISTINCT FROM NEW.clinica_id THEN
    RAISE EXCEPTION 'O médico responsável precisa pertencer à mesma clínica da sala.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validar_medico_responsavel_sala() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS salas_validar_medico_responsavel ON public.salas;
CREATE TRIGGER salas_validar_medico_responsavel
  BEFORE INSERT OR UPDATE OF medico_responsavel, clinica_id ON public.salas
  FOR EACH ROW EXECUTE FUNCTION public.validar_medico_responsavel_sala();

-- Patient and doctor references in the waiting list must belong to the row's
-- clinic. The shared locks prevent those references moving while we validate.
CREATE OR REPLACE FUNCTION public.validar_referencias_lista_espera()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  paciente_clinica_id uuid;
  medico_clinica_id uuid;
BEGIN
  IF NEW.clinica_id IS NULL THEN
    RAISE EXCEPTION 'O pedido da lista de espera precisa pertencer a uma clínica.'
      USING ERRCODE = '23514';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.is_same_clinica(NEW.clinica_id) THEN
    RAISE EXCEPTION 'O pedido precisa pertencer à clínica do usuário autenticado.'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.clinica_id
    INTO paciente_clinica_id
    FROM public.pacientes p
   WHERE p.id = NEW.paciente_id
   FOR SHARE;

  IF NOT FOUND OR paciente_clinica_id IS DISTINCT FROM NEW.clinica_id THEN
    RAISE EXCEPTION 'O paciente precisa pertencer à mesma clínica do pedido.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.medico_id IS NOT NULL THEN
    SELECT m.clinica_id
      INTO medico_clinica_id
      FROM public.medicos m
     WHERE m.id = NEW.medico_id
     FOR SHARE;

    IF NOT FOUND OR medico_clinica_id IS DISTINCT FROM NEW.clinica_id THEN
      RAISE EXCEPTION 'O médico precisa pertencer à mesma clínica do pedido.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validar_referencias_lista_espera() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS lista_espera_validar_referencias ON public.lista_espera;
CREATE TRIGGER lista_espera_validar_referencias
  BEFORE INSERT OR UPDATE OF paciente_id, medico_id, clinica_id ON public.lista_espera
  FOR EACH ROW EXECUTE FUNCTION public.validar_referencias_lista_espera();

-- Only notify patients whose record belongs to the same clinic as the wait-list row.
CREATE OR REPLACE FUNCTION public.convocar_lista_espera_apos_cancelamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  candidato record;
  paciente record;
  medico_nome text;
  mensagem text;
BEGIN
  IF NEW.status <> 'cancelado' OR OLD.status = 'cancelado' OR NEW.data < current_date THEN
    RETURN NEW;
  END IF;

  SELECT m.nome INTO medico_nome
    FROM public.medicos m
   WHERE m.id = NEW.medico_id AND m.clinica_id = NEW.clinica_id;

  FOR candidato IN
    SELECT le.id, le.paciente_id
      FROM public.lista_espera le
      JOIN public.pacientes p ON p.id = le.paciente_id AND p.clinica_id = le.clinica_id
     WHERE le.clinica_id = NEW.clinica_id
       AND le.status = 'aguardando'
       AND (le.medico_id = NEW.medico_id OR (
         le.medico_id IS NULL
         AND (le.especialidade IS NULL OR le.especialidade = (
           SELECT m.especialidade FROM public.medicos m
            WHERE m.id = NEW.medico_id AND m.clinica_id = NEW.clinica_id
         ))
       ))
     ORDER BY CASE le.prioridade WHEN 'urgente' THEN 1 WHEN 'preferencial' THEN 2 ELSE 3 END,
              le.created_at
     FOR UPDATE OF le SKIP LOCKED
     LIMIT 3
  LOOP
    SELECT p.nome, p.email, p.telefone
      INTO paciente
      FROM public.pacientes p
     WHERE p.id = candidato.paciente_id AND p.clinica_id = NEW.clinica_id;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    mensagem := format(
      'Uma vaga abriu com Dr(a). %s em %s as %s. A oferta fica disponivel por 2 horas no portal.',
      COALESCE(medico_nome, ''), to_char(NEW.data, 'DD/MM/YYYY'), to_char(NEW.hora_inicio, 'HH24:MI')
    );

    IF paciente.telefone IS NOT NULL THEN
      INSERT INTO public.notification_queue(tipo, destinatario_id, destinatario_telefone, destinatario_nome,
        assunto, conteudo, status, clinica_id, dados_extras)
      VALUES('whatsapp', candidato.paciente_id, paciente.telefone, paciente.nome, 'Vaga disponivel', mensagem,
        'pendente', NEW.clinica_id, jsonb_build_object('tipo', 'vaga_lista_espera',
        'lista_espera_id', candidato.id, 'agendamento_cancelado_id', NEW.id));
    END IF;

    IF paciente.email IS NOT NULL THEN
      INSERT INTO public.notification_queue(tipo, destinatario_id, destinatario_email, destinatario_nome,
        assunto, conteudo, status, clinica_id, dados_extras)
      VALUES('email', candidato.paciente_id, paciente.email, paciente.nome, 'Vaga disponivel na agenda', mensagem,
        'pendente', NEW.clinica_id, jsonb_build_object('tipo', 'vaga_lista_espera',
        'lista_espera_id', candidato.id, 'agendamento_cancelado_id', NEW.id));
    END IF;

    IF paciente.telefone IS NOT NULL OR paciente.email IS NOT NULL THEN
      UPDATE public.lista_espera
         SET status = 'notificado', oferta_agendamento_id = NEW.id,
             oferta_expira_em = now() + interval '2 hours',
             observacoes = concat_ws(E'\n', observacoes,
               format('Vaga oferecida em %s para %s %s', now(), NEW.data, NEW.hora_inicio))
       WHERE id = candidato.id AND clinica_id = NEW.clinica_id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.convocar_lista_espera_apos_cancelamento() FROM PUBLIC, anon;

INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011130000', ARRAY[]::text[], 'integridade_salas_lista_espera');
COMMIT;

-- <<< 20261011130000
-- >>> 20261011140000 retornos_integridade_tenant
BEGIN;

-- As FKs simples garantem que as referências existem, mas não que pertencem
-- à clínica do retorno. Validar isso no banco também protege gravações via API.
CREATE OR REPLACE FUNCTION public.validar_referencias_retorno()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.clinica_id IS NULL THEN
    RAISE EXCEPTION 'A clínica do retorno é obrigatória.' USING ERRCODE = '23502';
  END IF;

  IF NEW.paciente_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pacientes p
     WHERE p.id = NEW.paciente_id AND p.clinica_id = NEW.clinica_id
     FOR SHARE
  ) THEN
    RAISE EXCEPTION 'O paciente do retorno não pertence à clínica.' USING ERRCODE = '23503';
  END IF;

  IF NEW.medico_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.medicos m
     WHERE m.id = NEW.medico_id AND m.clinica_id = NEW.clinica_id
     FOR SHARE
  ) THEN
    RAISE EXCEPTION 'O médico do retorno não pertence à clínica.' USING ERRCODE = '23503';
  END IF;

  IF NEW.prontuario_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.prontuarios p
     WHERE p.id = NEW.prontuario_id
       AND p.clinica_id = NEW.clinica_id
       AND (NEW.paciente_id IS NULL OR p.paciente_id = NEW.paciente_id)
     FOR SHARE
  ) THEN
    RAISE EXCEPTION 'O prontuário do retorno não corresponde ao paciente e à clínica.' USING ERRCODE = '23503';
  END IF;

  IF NEW.agendamento_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.agendamentos a
     WHERE a.id = NEW.agendamento_id
       AND a.clinica_id = NEW.clinica_id
       AND (NEW.paciente_id IS NULL OR a.paciente_id = NEW.paciente_id)
     FOR SHARE
  ) THEN
    RAISE EXCEPTION 'O atendimento de origem do retorno não corresponde ao paciente e à clínica.' USING ERRCODE = '23503';
  END IF;

  IF NEW.agendamento_retorno_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.agendamentos a
     WHERE a.id = NEW.agendamento_retorno_id
       AND a.clinica_id = NEW.clinica_id
       AND (NEW.paciente_id IS NULL OR a.paciente_id = NEW.paciente_id)
       AND (NEW.medico_id IS NULL OR a.medico_id = NEW.medico_id)
     FOR SHARE
  ) THEN
    RAISE EXCEPTION 'O agendamento do retorno não corresponde ao paciente, médico e clínica.' USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_referencias_retorno() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS validar_referencias_retorno ON public.retornos;
CREATE TRIGGER validar_referencias_retorno
  BEFORE INSERT OR UPDATE OF paciente_id, medico_id, prontuario_id, agendamento_id,
    agendamento_retorno_id, clinica_id
  ON public.retornos
  FOR EACH ROW EXECUTE FUNCTION public.validar_referencias_retorno();

-- A tela pode ficar aberta enquanto o atendimento avança. Bloquear também no
-- banco evita cancelamento por estado antigo do navegador.
CREATE OR REPLACE FUNCTION public.cancelar_retorno_atomico(p_retorno_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica_id uuid;
  v_retorno public.retornos%ROWTYPE;
  v_status_agendamento text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
  END IF;

  v_clinica_id := public.get_my_clinica_id();
  IF v_clinica_id IS NULL THEN
    RAISE EXCEPTION 'Clínica não identificada.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_retorno FROM public.retornos
   WHERE id = p_retorno_id AND clinica_id = v_clinica_id
   FOR UPDATE;
  IF NOT FOUND OR v_retorno.status IN ('realizado', 'cancelado') THEN
    RETURN false;
  END IF;

  IF v_retorno.agendamento_retorno_id IS NOT NULL THEN
    SELECT a.status::text INTO v_status_agendamento
      FROM public.agendamentos a
     WHERE a.id = v_retorno.agendamento_retorno_id
       AND a.clinica_id = v_clinica_id
       AND a.paciente_id = v_retorno.paciente_id
       AND a.medico_id = v_retorno.medico_id
     FOR UPDATE;
    IF NOT FOUND OR v_status_agendamento IS NULL OR v_status_agendamento NOT IN (
      'agendado', 'confirmado', 'aguardando', 'aguardando_triagem', 'em_triagem'
    ) THEN
      RETURN false;
    END IF;

    UPDATE public.agendamentos SET status = 'cancelado'
     WHERE id = v_retorno.agendamento_retorno_id
       AND clinica_id = v_clinica_id
       AND paciente_id = v_retorno.paciente_id
       AND medico_id = v_retorno.medico_id
       AND status::text IN ('agendado', 'confirmado', 'aguardando', 'aguardando_triagem', 'em_triagem');
    IF NOT FOUND THEN RETURN false; END IF;
  END IF;

  UPDATE public.retornos SET status = 'cancelado'
   WHERE id = v_retorno.id AND clinica_id = v_clinica_id
     AND status IS DISTINCT FROM 'realizado' AND status IS DISTINCT FROM 'cancelado';
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.cancelar_retorno_atomico(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_retorno_atomico(uuid) TO authenticated;

-- Marcar comparecimento respeita a hora marcada, não apenas o dia civil.
CREATE OR REPLACE FUNCTION public.marcar_retorno_realizado_atomico(p_retorno_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica_id uuid;
  v_retorno public.retornos%ROWTYPE;
  v_data date;
  v_hora time;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
  END IF;
  v_clinica_id := public.get_my_clinica_id();
  IF v_clinica_id IS NULL THEN
    RAISE EXCEPTION 'Clínica não identificada.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_retorno FROM public.retornos
   WHERE id = p_retorno_id AND clinica_id = v_clinica_id
   FOR UPDATE;
  IF NOT FOUND OR v_retorno.status IN ('realizado', 'cancelado') THEN RETURN false; END IF;

  IF v_retorno.agendamento_retorno_id IS NOT NULL THEN
    SELECT a.data, a.hora_inicio INTO v_data, v_hora
      FROM public.agendamentos a
     WHERE a.id = v_retorno.agendamento_retorno_id
       AND a.clinica_id = v_clinica_id
       AND a.paciente_id = v_retorno.paciente_id
       AND a.medico_id = v_retorno.medico_id
     FOR UPDATE;
    IF NOT FOUND THEN RETURN false; END IF;
    IF (v_data + v_hora) > (now() AT TIME ZONE 'America/Sao_Paulo') THEN
      RAISE EXCEPTION 'O retorno ainda não chegou ao horário agendado.' USING ERRCODE = '22023';
    END IF;
  ELSIF v_retorno.data_retorno_prevista > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'O retorno ainda não chegou à data prevista.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.retornos SET status = 'realizado'
   WHERE id = v_retorno.id AND clinica_id = v_clinica_id
     AND status IS DISTINCT FROM 'realizado' AND status IS DISTINCT FROM 'cancelado';
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_retorno_realizado_atomico(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_retorno_realizado_atomico(uuid) TO authenticated;

-- A checagem também vale para UPDATE direto na tabela, não apenas para a RPC.
CREATE OR REPLACE FUNCTION public.validar_transicao_status_retorno()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_data date;
  v_hora time;
  v_status_agendamento text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  IF NEW.status = 'realizado' THEN
    IF NEW.agendamento_retorno_id IS NOT NULL THEN
      SELECT a.data, a.hora_inicio, a.status::text
        INTO v_data, v_hora, v_status_agendamento
        FROM public.agendamentos a
       WHERE a.id = NEW.agendamento_retorno_id
         AND a.clinica_id = NEW.clinica_id
         AND a.paciente_id = NEW.paciente_id
         AND a.medico_id = NEW.medico_id
       FOR SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'O agendamento do retorno não corresponde ao registro.' USING ERRCODE = '23503';
      END IF;
      IF (v_data + v_hora) > (now() AT TIME ZONE 'America/Sao_Paulo') THEN
        RAISE EXCEPTION 'O retorno ainda não chegou ao horário agendado.' USING ERRCODE = '22023';
      END IF;
      IF v_status_agendamento IN ('cancelado', 'faltou') THEN
        RAISE EXCEPTION 'O agendamento vinculado foi cancelado ou marcado como falta.' USING ERRCODE = '23514';
      END IF;
    ELSIF NEW.data_retorno_prevista > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
      RAISE EXCEPTION 'O retorno ainda não chegou à data prevista.' USING ERRCODE = '22023';
    END IF;
  ELSIF NEW.status = 'cancelado' AND NEW.agendamento_retorno_id IS NOT NULL THEN
    SELECT a.status::text INTO v_status_agendamento
      FROM public.agendamentos a
     WHERE a.id = NEW.agendamento_retorno_id
       AND a.clinica_id = NEW.clinica_id
       AND a.paciente_id = NEW.paciente_id
         AND a.medico_id = NEW.medico_id
     FOR SHARE;
    IF NOT FOUND OR v_status_agendamento IS DISTINCT FROM 'cancelado' THEN
      RAISE EXCEPTION 'Cancele primeiro o agendamento vinculado pela ação de cancelar retorno.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_transicao_status_retorno() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS validar_transicao_status_retorno ON public.retornos;
CREATE TRIGGER validar_transicao_status_retorno
  BEFORE UPDATE OF status ON public.retornos
  FOR EACH ROW EXECUTE FUNCTION public.validar_transicao_status_retorno();

INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011140000', ARRAY[]::text[], 'retornos_integridade_tenant');
COMMIT;

-- <<< 20261011140000
-- >>> 20261011150000 convenios_integridade_tenant
BEGIN;

-- Impede novos INSERT/UPDATE entre o preflight e a instalação do trigger.
LOCK TABLE public.precos_exames_convenio IN SHARE ROW EXCLUSIVE MODE;

-- Não reatribua silenciosamente tabelas antigas. Se houver registros sem
-- clínica ou cruzados, interrompa para que a clínica proprietária seja
-- confirmada antes de instalar a restrição.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.precos_exames_convenio p
      JOIN public.convenios c ON c.id = p.convenio_id
     WHERE c.clinica_id IS NULL
        OR p.clinica_id IS DISTINCT FROM c.clinica_id
  ) THEN
    RAISE EXCEPTION 'Existem preços de exames sem clínica ou associados a convênio de outra clínica. Corrija os vínculos antes de aplicar esta migration.';
  END IF;
END;
$$;

-- A FK simples em convenio_id aceita associar uma linha de preço da clínica A
-- a um convênio da clínica B. Valide a relação no banco para INSERT e UPDATE.
CREATE OR REPLACE FUNCTION public.validar_tenant_preco_exame_convenio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica_convenio uuid;
BEGIN
  IF NEW.clinica_id IS NULL THEN
    RAISE EXCEPTION 'O preço do exame precisa pertencer a uma clínica';
  END IF;

  SELECT c.clinica_id INTO v_clinica_convenio
    FROM public.convenios c
   WHERE c.id = NEW.convenio_id
   FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convênio não encontrado';
  END IF;
  IF v_clinica_convenio IS DISTINCT FROM NEW.clinica_id THEN
    RAISE EXCEPTION 'O convênio e a tabela de preços precisam pertencer à mesma clínica';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_preco_exame_tenant ON public.precos_exames_convenio;
CREATE TRIGGER trg_validar_preco_exame_tenant
  BEFORE INSERT OR UPDATE ON public.precos_exames_convenio
  FOR EACH ROW EXECUTE FUNCTION public.validar_tenant_preco_exame_convenio();

-- O trigger trg_fill_clinica_id preenche o tenant quando a API omite o campo.
-- A policy exige a clínica ativa, inclusive para chamadas diretas ao PostgREST.
DROP POLICY IF EXISTS precos_exames_convenio_insert_scoped ON public.precos_exames_convenio;
CREATE POLICY precos_exames_convenio_insert_scoped ON public.precos_exames_convenio
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.is_admin(auth.uid()) OR public.is_financeiro(auth.uid()))
    AND clinica_id = public.get_my_clinica_id()
  );

INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011150000', ARRAY[]::text[], 'convenios_integridade_tenant');
COMMIT;

-- <<< 20261011150000
-- >>> 20261011160000 prontuario_integridade_assinado
BEGIN;

CREATE OR REPLACE FUNCTION public.proteger_dependencia_prontuario_assinado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_prontuario_id uuid;
  v_assinado boolean;
  v_pai record;
  v_pais_travados integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_prontuario_id := OLD.prontuario_id;
  ELSE
    v_prontuario_id := NEW.prontuario_id;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.prontuario_id IS DISTINCT FROM NEW.prontuario_id THEN
    v_pais_travados := 0;
    v_assinado := false;
    FOR v_pai IN
      SELECT id, assinado
        FROM public.prontuarios
       WHERE id IN (OLD.prontuario_id, NEW.prontuario_id)
       ORDER BY id
       FOR UPDATE
    LOOP
      v_pais_travados := v_pais_travados + 1;
      IF v_pai.assinado IS TRUE THEN v_assinado := true; END IF;
    END LOOP;
    IF v_pais_travados <> CASE WHEN OLD.prontuario_id IS NULL OR NEW.prontuario_id IS NULL THEN 1 ELSE 2 END THEN
      RAISE EXCEPTION 'Encounter dependency parent was not found.' USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_assinado IS TRUE THEN
      RAISE EXCEPTION 'Anexos de prontuário assinado não podem ser alterados. Registre um novo documento.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF v_prontuario_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT assinado INTO v_assinado
    FROM public.prontuarios WHERE id = v_prontuario_id FOR UPDATE;

  -- Durante exclusão em cascata de um prontuário (possível apenas em rascunho),
  -- o pai pode já não estar visível ao trigger do filho.
  IF NOT FOUND AND TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prontuário relacionado não encontrado.' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_assinado IS TRUE THEN
    RAISE EXCEPTION 'Dependências de prontuário assinado são imutáveis. Registre a alteração como adendo.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prontuario_prescricao_imutavel ON public.prescricoes;
CREATE TRIGGER trg_prontuario_prescricao_imutavel
  BEFORE INSERT OR UPDATE OR DELETE ON public.prescricoes
  FOR EACH ROW EXECUTE FUNCTION public.proteger_dependencia_prontuario_assinado();

DROP TRIGGER IF EXISTS trg_prontuario_anexo_imutavel ON public.anexos_prontuario;
CREATE TRIGGER trg_prontuario_anexo_imutavel
  BEFORE INSERT OR UPDATE OR DELETE ON public.anexos_prontuario
  FOR EACH ROW EXECUTE FUNCTION public.proteger_dependencia_prontuario_assinado();

-- A assinatura e a substituição de receitas travam primeiro o mesmo prontuário.
-- Isso serializa a checagem do estado assinado com qualquer escrita dependente.
CREATE OR REPLACE FUNCTION public.substituir_prescricoes_do_prontuario(
  p_prontuario_id uuid,
  p_prescricoes jsonb DEFAULT '[]'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paciente_id uuid;
  v_medico_id uuid;
  v_clinica_id uuid;
  v_assinado boolean;
  v_inseridas integer := 0;
BEGIN
  IF p_prontuario_id IS NULL THEN RAISE EXCEPTION 'prontuario_id é obrigatório'; END IF;
  IF auth.uid() IS NULL OR NOT (public.is_admin(auth.uid()) OR public.is_medico(auth.uid())) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(p_prescricoes) <> 'array' THEN RAISE EXCEPTION 'p_prescricoes precisa ser um array JSON'; END IF;

  SELECT paciente_id, medico_id, clinica_id, COALESCE(assinado, false)
    INTO v_paciente_id, v_medico_id, v_clinica_id, v_assinado
    FROM public.prontuarios WHERE id = p_prontuario_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prontuário não encontrado ou fora da sua clínica' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_clinica_id IS DISTINCT FROM public.get_my_clinica_id()
     OR (public.is_medico(auth.uid()) AND NOT public.is_admin(auth.uid())
       AND NOT public.is_medico_responsavel_do_prontuario(v_medico_id)) THEN
    RAISE EXCEPTION 'Encounter outside your access' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_assinado THEN
    RAISE EXCEPTION 'Prontuário assinado é imutável. Use adendos para retificar.' USING ERRCODE = 'raise_exception';
  END IF;

  DELETE FROM public.prescricoes WHERE prontuario_id = p_prontuario_id;
  IF EXISTS (SELECT 1 FROM public.prescricoes WHERE prontuario_id = p_prontuario_id) THEN
    RAISE EXCEPTION 'Não foi possível remover prescrições anteriores. Nada foi alterado.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.prescricoes (
    paciente_id, medico_id, prontuario_id, clinica_id, medicamento, dosagem,
    posologia, duracao, quantidade, observacoes, data_emissao, tipo
  )
  SELECT v_paciente_id, v_medico_id, p_prontuario_id, v_clinica_id,
    NULLIF(item->>'medicamento', ''), NULLIF(item->>'dosagem', ''),
    NULLIF(item->>'posologia', ''), NULLIF(item->>'duracao', ''),
    NULLIF(item->>'quantidade', ''), NULLIF(item->>'observacoes', ''),
    COALESCE(NULLIF(item->>'data_emissao', '')::date, CURRENT_DATE),
    COALESCE(NULLIF(item->>'tipo', ''), 'simples')
  FROM jsonb_array_elements(p_prescricoes) AS item
  WHERE NULLIF(item->>'medicamento', '') IS NOT NULL;
  GET DIAGNOSTICS v_inseridas = ROW_COUNT;
  RETURN v_inseridas;
END;
$$;

REVOKE ALL ON FUNCTION public.substituir_prescricoes_do_prontuario(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.substituir_prescricoes_do_prontuario(uuid, jsonb) TO authenticated;

-- Linked prescriptions are written only through the parent-first RPC above.
DROP POLICY IF EXISTS prescricoes_insert ON public.prescricoes;
DROP POLICY IF EXISTS prescricoes_insert_scoped ON public.prescricoes;
DROP POLICY IF EXISTS prescricoes_update ON public.prescricoes;
DROP POLICY IF EXISTS prescricoes_update_scoped ON public.prescricoes;
DROP POLICY IF EXISTS prescricoes_delete ON public.prescricoes;
DROP POLICY IF EXISTS prescricoes_delete_scoped ON public.prescricoes;
CREATE POLICY prescricoes_insert_independentes ON public.prescricoes FOR INSERT TO authenticated
  WITH CHECK ((public.is_admin(auth.uid()) OR public.is_medico(auth.uid()))
    AND clinica_id = public.get_my_clinica_id() AND prontuario_id IS NULL);
CREATE POLICY prescricoes_update_independentes ON public.prescricoes FOR UPDATE TO authenticated
  USING ((public.is_admin(auth.uid()) OR public.is_medico(auth.uid()))
    AND clinica_id = public.get_my_clinica_id() AND prontuario_id IS NULL)
  WITH CHECK ((public.is_admin(auth.uid()) OR public.is_medico(auth.uid()))
    AND clinica_id = public.get_my_clinica_id() AND prontuario_id IS NULL);
CREATE POLICY prescricoes_delete_independentes ON public.prescricoes FOR DELETE TO authenticated
  USING ((public.is_admin(auth.uid()) OR public.is_medico(auth.uid()))
    AND clinica_id = public.get_my_clinica_id() AND prontuario_id IS NULL);

CREATE OR REPLACE FUNCTION public.fn_sanitizar_auditoria_prontuario()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.collection IN ('prontuarios', 'prescricoes', 'anexos_prontuario', 'atestados', 'encaminhamentos') THEN
    NEW.record_name := NULL;
    NEW.changes := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sanitizar_auditoria_prontuario ON public.audit_log;
CREATE TRIGGER trg_sanitizar_auditoria_prontuario
  BEFORE INSERT OR UPDATE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.fn_sanitizar_auditoria_prontuario();

UPDATE public.audit_log
   SET record_name = NULL, changes = NULL
 WHERE collection IN ('prontuarios', 'prescricoes', 'anexos_prontuario', 'atestados', 'encaminhamentos')
   AND (record_name IS NOT NULL OR changes IS NOT NULL);

CREATE OR REPLACE FUNCTION public.registrar_visualizacao_historico_prontuarios(p_prontuario_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_solicitados integer;
  v_autorizados integer;
  v_user_nome text;
  v_user_crm text;
  v_registrados integer;
  v_bloqueados integer;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_admin(auth.uid()) OR public.is_medico(auth.uid())) THEN
    RAISE EXCEPTION 'Acesso clínico não autorizado';
  END IF;
  SELECT COALESCE(array_agg(DISTINCT item_id), ARRAY[]::uuid[]) INTO v_ids
    FROM unnest(COALESCE(p_prontuario_ids, ARRAY[]::uuid[])) AS requested(item_id);
  v_solicitados := cardinality(v_ids);
  IF v_solicitados = 0 THEN RETURN 0; END IF;
  IF v_solicitados > 500 THEN RAISE EXCEPTION 'Lote de auditoria excede 500 registros'; END IF;

  SELECT count(*) INTO v_autorizados
    FROM public.prontuarios p
   WHERE p.id = ANY(v_ids)
     AND public.is_same_clinica(p.clinica_id)
     AND (public.is_admin(auth.uid()) OR (
       public.is_medico(auth.uid())
       AND (p.assinado IS TRUE OR public.is_medico_responsavel_do_prontuario(p.medico_id))
     ));
  IF v_autorizados <> v_solicitados THEN
    RAISE EXCEPTION 'Um ou mais prontuários não foram encontrados ou estão fora do seu acesso';
  END IF;

  SELECT m.nome, m.crm INTO v_user_nome, v_user_crm
    FROM public.medicos m
   WHERE m.user_id = auth.uid() AND m.clinica_id = public.get_my_clinica_id() AND m.ativo IS NOT FALSE
   ORDER BY m.created_at DESC LIMIT 1;
  IF v_user_nome IS NULL THEN
    SELECT p.nome INTO v_user_nome FROM public.profiles p WHERE p.id = auth.uid();
  END IF;

  PERFORM p.id
    FROM public.prontuarios p
   WHERE p.id = ANY(v_ids)
     AND public.is_same_clinica(p.clinica_id)
     AND (public.is_admin(auth.uid()) OR (
       public.is_medico(auth.uid())
       AND (p.assinado IS TRUE OR public.is_medico_responsavel_do_prontuario(p.medico_id))
     ))
   ORDER BY p.id
   FOR UPDATE;
  GET DIAGNOSTICS v_bloqueados = ROW_COUNT;
  IF v_bloqueados <> v_solicitados THEN
    RAISE EXCEPTION 'Requested history is incomplete or outside access';
  END IF;

  INSERT INTO public.prontuario_acessos (
    prontuario_id, paciente_id, clinica_id, user_id, user_nome, user_crm, acao, justificativa
  )
  SELECT p.id, p.paciente_id, p.clinica_id, auth.uid(),
    COALESCE(v_user_nome, auth.jwt() ->> 'email', 'Usuário clínico'), v_user_crm,
    'visualizacao', 'Consulta na lista do histórico clínico'
  FROM public.prontuarios p
  WHERE p.id = ANY(v_ids)
    AND public.is_same_clinica(p.clinica_id)
    AND (public.is_admin(auth.uid()) OR (
      public.is_medico(auth.uid())
      AND (p.assinado IS TRUE OR public.is_medico_responsavel_do_prontuario(p.medico_id))
    ));
  GET DIAGNOSTICS v_registrados = ROW_COUNT;
  IF v_registrados <> v_solicitados THEN
    RAISE EXCEPTION 'History audit was incomplete';
  END IF;
  RETURN v_registrados;
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_visualizacao_historico_prontuarios(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_visualizacao_historico_prontuarios(uuid[]) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011160000', ARRAY[]::text[], 'prontuario_integridade_assinado');
COMMIT;

-- <<< 20261011160000
-- >>> 20261011170000 documentos_clinicos_integridade_tenant
BEGIN;

LOCK TABLE public.atestados, public.encaminhamentos, public.memed_prescricoes,
  public.medicos, public.pacientes, public.prontuarios IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  v_atestados bigint;
  v_encaminhamentos bigint;
  v_memed bigint;
BEGIN
  SELECT count(*) INTO v_atestados
    FROM public.atestados a
    LEFT JOIN public.pacientes p ON p.id = a.paciente_id
    LEFT JOIN public.medicos m ON m.id = a.medico_id
   WHERE a.clinica_id IS NULL
      OR (a.paciente_id IS NOT NULL AND (p.id IS NULL OR p.clinica_id IS DISTINCT FROM a.clinica_id))
      OR (a.medico_id IS NOT NULL AND (m.id IS NULL OR m.clinica_id IS DISTINCT FROM a.clinica_id));

  SELECT count(*) INTO v_encaminhamentos
    FROM public.encaminhamentos e
    LEFT JOIN public.pacientes p ON p.id = e.paciente_id
    LEFT JOIN public.medicos m ON m.id = e.medico_origem_id
    LEFT JOIN public.medicos destino ON destino.id = e.medico_destino_id
    LEFT JOIN public.prontuarios pr ON pr.id = e.prontuario_id
   WHERE e.clinica_id IS NULL
      OR p.id IS NULL OR p.clinica_id IS DISTINCT FROM e.clinica_id
      OR (e.medico_origem_id IS NOT NULL AND (m.id IS NULL OR m.clinica_id IS DISTINCT FROM e.clinica_id))
      OR (e.medico_destino_id IS NOT NULL AND (destino.id IS NULL OR destino.clinica_id IS DISTINCT FROM e.clinica_id))
      OR (e.prontuario_id IS NOT NULL AND (
        pr.id IS NULL OR pr.clinica_id IS DISTINCT FROM e.clinica_id
        OR pr.paciente_id IS DISTINCT FROM e.paciente_id
      ));

  SELECT count(*) INTO v_memed
    FROM public.memed_prescricoes mp
    LEFT JOIN public.pacientes p ON p.id = mp.paciente_id
    LEFT JOIN public.medicos m ON m.id = mp.medico_id
   WHERE mp.clinica_id IS NULL
      OR p.id IS NULL OR p.clinica_id IS DISTINCT FROM mp.clinica_id
      OR m.id IS NULL OR m.clinica_id IS DISTINCT FROM mp.clinica_id;

  IF v_atestados > 0 OR v_encaminhamentos > 0 OR v_memed > 0 THEN
    RAISE EXCEPTION 'Há documentos clínicos com vínculos inválidos: % atestados, % encaminhamentos e % prescrições Memed. Corrija os dados antes de aplicar esta migration.',
      v_atestados, v_encaminhamentos, v_memed;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_tenant_atestado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_clinica uuid;
BEGIN
  IF NEW.clinica_id IS NULL OR (TG_OP = 'INSERT' AND (NEW.paciente_id IS NULL OR NEW.medico_id IS NULL)) THEN
    RAISE EXCEPTION 'Clínica, paciente e médico são obrigatórios no atestado.' USING ERRCODE = 'not_null_violation';
  END IF;
  IF NEW.paciente_id IS NOT NULL THEN
    SELECT clinica_id INTO v_clinica FROM public.pacientes WHERE id = NEW.paciente_id FOR SHARE;
  END IF;
  IF NEW.paciente_id IS NOT NULL AND (NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id) THEN
    RAISE EXCEPTION 'O paciente do atestado não pertence à clínica informada.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.medico_id IS NOT NULL THEN
    SELECT clinica_id INTO v_clinica FROM public.medicos WHERE id = NEW.medico_id FOR SHARE;
  END IF;
  IF NEW.medico_id IS NOT NULL AND (NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id) THEN
    RAISE EXCEPTION 'O médico do atestado não pertence à clínica informada.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_tenant_atestado ON public.atestados;
CREATE TRIGGER trg_validar_tenant_atestado
  BEFORE INSERT OR UPDATE ON public.atestados
  FOR EACH ROW EXECUTE FUNCTION public.validar_tenant_atestado();

CREATE OR REPLACE FUNCTION public.validar_tenant_encaminhamento()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_clinica uuid;
  v_paciente uuid;
BEGIN
  IF NEW.clinica_id IS NULL OR NEW.paciente_id IS NULL
     OR (TG_OP = 'INSERT' AND NEW.medico_origem_id IS NULL) THEN
    RAISE EXCEPTION 'Clínica, paciente e médico de origem são obrigatórios no encaminhamento.' USING ERRCODE = 'not_null_violation';
  END IF;
  SELECT clinica_id INTO v_clinica FROM public.pacientes WHERE id = NEW.paciente_id FOR SHARE;
  IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id THEN
    RAISE EXCEPTION 'O paciente do encaminhamento não pertence à clínica informada.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.medico_origem_id IS NOT NULL THEN
    SELECT clinica_id INTO v_clinica FROM public.medicos WHERE id = NEW.medico_origem_id FOR SHARE;
  END IF;
  IF NEW.medico_origem_id IS NOT NULL AND (NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id) THEN
    RAISE EXCEPTION 'O médico de origem não pertence à clínica informada.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.medico_destino_id IS NOT NULL THEN
    SELECT clinica_id INTO v_clinica FROM public.medicos WHERE id = NEW.medico_destino_id FOR SHARE;
    IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id THEN
      RAISE EXCEPTION 'The destination physician is outside this clinic.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.prontuario_id IS NOT NULL THEN
    SELECT clinica_id, paciente_id INTO v_clinica, v_paciente FROM public.prontuarios WHERE id = NEW.prontuario_id FOR SHARE;
    IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id OR v_paciente IS DISTINCT FROM NEW.paciente_id THEN
      RAISE EXCEPTION 'O prontuário do encaminhamento não corresponde à clínica e paciente informados.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_tenant_encaminhamento ON public.encaminhamentos;
CREATE TRIGGER trg_validar_tenant_encaminhamento
  BEFORE INSERT OR UPDATE ON public.encaminhamentos
  FOR EACH ROW EXECUTE FUNCTION public.validar_tenant_encaminhamento();

CREATE OR REPLACE FUNCTION public.validar_tenant_memed_prescricao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_clinica uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.clinica_id IS DISTINCT FROM OLD.clinica_id
    OR NEW.paciente_id IS DISTINCT FROM OLD.paciente_id
    OR NEW.medico_id IS DISTINCT FROM OLD.medico_id
    OR NEW.memed_prescription_uuid IS DISTINCT FROM OLD.memed_prescription_uuid
  ) THEN
    RAISE EXCEPTION 'A autoria e a vinculação da prescrição Memed são imutáveis.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT clinica_id INTO v_clinica FROM public.pacientes WHERE id = NEW.paciente_id FOR SHARE;
  IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id THEN
    RAISE EXCEPTION 'O paciente da prescrição Memed não pertence à clínica informada.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT clinica_id INTO v_clinica FROM public.medicos WHERE id = NEW.medico_id FOR SHARE;
  IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id THEN
    RAISE EXCEPTION 'O médico da prescrição Memed não pertence à clínica informada.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_tenant_memed_prescricao ON public.memed_prescricoes;
CREATE TRIGGER trg_validar_tenant_memed_prescricao
  BEFORE INSERT OR UPDATE ON public.memed_prescricoes
  FOR EACH ROW EXECUTE FUNCTION public.validar_tenant_memed_prescricao();

DROP POLICY IF EXISTS atestados_insert ON public.atestados;
CREATE POLICY atestados_insert ON public.atestados FOR INSERT TO authenticated
  WITH CHECK ((public.is_admin(auth.uid()) OR public.is_medico(auth.uid())) AND clinica_id = public.get_my_clinica_id());
DROP POLICY IF EXISTS atestados_update_scoped ON public.atestados;
CREATE POLICY atestados_update_scoped ON public.atestados FOR UPDATE TO authenticated
  USING ((public.is_admin(auth.uid()) OR public.is_medico(auth.uid())) AND clinica_id = public.get_my_clinica_id())
  WITH CHECK ((public.is_admin(auth.uid()) OR public.is_medico(auth.uid())) AND clinica_id = public.get_my_clinica_id());

DROP POLICY IF EXISTS encaminhamentos_insert ON public.encaminhamentos;
CREATE POLICY encaminhamentos_insert ON public.encaminhamentos FOR INSERT TO authenticated
  WITH CHECK ((public.is_admin(auth.uid()) OR public.is_medico(auth.uid())) AND clinica_id = public.get_my_clinica_id());
DROP POLICY IF EXISTS encaminhamentos_update_scoped ON public.encaminhamentos;
CREATE POLICY encaminhamentos_update_scoped ON public.encaminhamentos FOR UPDATE TO authenticated
  USING ((public.is_admin(auth.uid()) OR public.is_medico(auth.uid())) AND clinica_id = public.get_my_clinica_id())
  WITH CHECK ((public.is_admin(auth.uid()) OR public.is_medico(auth.uid())) AND clinica_id = public.get_my_clinica_id());

INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011170000', ARRAY[]::text[], 'documentos_clinicos_integridade_tenant');
COMMIT;

-- <<< 20261011170000
-- >>> 20261011180000 integridade_tenant_laboratorio
BEGIN;

-- Keep tenant references stable while legacy rows are checked and guards installed.
LOCK TABLE public.pedidos_laboratorio, public.exames, public.coletas_laboratorio,
  public.resultados_laboratorio, public.pacientes, public.medicos, public.convenios,
  public.tipo_exames_catalog, public.laboratorio_setores
  IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  v_invalidos bigint;
BEGIN
  SELECT count(*) INTO v_invalidos FROM (
    SELECT p.id
      FROM public.pedidos_laboratorio p
      LEFT JOIN public.pacientes pa ON pa.id = p.paciente_id
      LEFT JOIN public.medicos m ON m.id = p.medico_solicitante_id
      LEFT JOIN public.convenios c ON c.id = p.convenio_id
     WHERE p.clinica_id IS NULL OR pa.id IS NULL OR pa.clinica_id IS DISTINCT FROM p.clinica_id
        OR (p.medico_solicitante_id IS NOT NULL AND (m.id IS NULL OR m.clinica_id IS DISTINCT FROM p.clinica_id))
        OR (p.convenio_id IS NOT NULL AND (c.id IS NULL OR c.clinica_id IS DISTINCT FROM p.clinica_id))
    UNION ALL
    SELECT e.id
      FROM public.exames e
      LEFT JOIN public.pacientes pa ON pa.id = e.paciente_id
      LEFT JOIN public.medicos m ON m.id = e.medico_solicitante_id
      LEFT JOIN public.tipo_exames_catalog cat ON cat.id = e.tipo_exame_catalog_id
      LEFT JOIN public.pedidos_laboratorio p ON p.id = e.pedido_laboratorio_id
     WHERE e.clinica_id IS NULL OR pa.id IS NULL OR pa.clinica_id IS DISTINCT FROM e.clinica_id
        OR (e.medico_solicitante_id IS NOT NULL AND (m.id IS NULL OR m.clinica_id IS DISTINCT FROM e.clinica_id))
        OR (e.tipo_exame_catalog_id IS NOT NULL AND (cat.id IS NULL OR cat.clinica_id IS DISTINCT FROM e.clinica_id))
        OR (e.pedido_laboratorio_id IS NOT NULL AND (p.id IS NULL OR p.clinica_id IS DISTINCT FROM e.clinica_id OR p.paciente_id IS DISTINCT FROM e.paciente_id))
    UNION ALL
    SELECT cl.id
      FROM public.coletas_laboratorio cl
      LEFT JOIN public.pacientes pa ON pa.id = cl.paciente_id
      LEFT JOIN public.exames e ON e.id = cl.exame_id
      LEFT JOIN public.medicos m ON m.id = cl.medico_solicitante_id
      LEFT JOIN public.convenios c ON c.id = cl.convenio_id
      LEFT JOIN public.laboratorio_setores s ON s.id = cl.setor_id
      LEFT JOIN public.coletas_laboratorio recoleta ON recoleta.id = cl.recoleta_de_id
     WHERE cl.clinica_id IS NULL OR pa.id IS NULL OR pa.clinica_id IS DISTINCT FROM cl.clinica_id
        OR (cl.exame_id IS NOT NULL AND (e.id IS NULL OR e.clinica_id IS DISTINCT FROM cl.clinica_id OR e.paciente_id IS DISTINCT FROM cl.paciente_id))
        OR (cl.medico_solicitante_id IS NOT NULL AND (m.id IS NULL OR m.clinica_id IS DISTINCT FROM cl.clinica_id))
        OR (cl.convenio_id IS NOT NULL AND (c.id IS NULL OR c.clinica_id IS DISTINCT FROM cl.clinica_id))
        OR (cl.setor_id IS NOT NULL AND (s.id IS NULL OR s.clinica_id IS DISTINCT FROM cl.clinica_id))
        OR (cl.recoleta_de_id IS NOT NULL AND (recoleta.id IS NULL OR recoleta.clinica_id IS DISTINCT FROM cl.clinica_id OR recoleta.paciente_id IS DISTINCT FROM cl.paciente_id))
    UNION ALL
    SELECT r.id
      FROM public.resultados_laboratorio r
      LEFT JOIN public.coletas_laboratorio cl ON cl.id = r.coleta_id
      LEFT JOIN public.pacientes pa ON pa.id = r.paciente_id
      LEFT JOIN public.exames e ON e.id = r.exame_id
     WHERE r.clinica_id IS NULL OR cl.id IS NULL OR cl.clinica_id IS DISTINCT FROM r.clinica_id OR cl.paciente_id IS DISTINCT FROM r.paciente_id
        OR pa.id IS NULL OR pa.clinica_id IS DISTINCT FROM r.clinica_id
        OR (r.exame_id IS NOT NULL AND (e.id IS NULL OR e.clinica_id IS DISTINCT FROM r.clinica_id OR e.paciente_id IS DISTINCT FROM r.paciente_id))
  ) referencias_invalidas;

  IF v_invalidos > 0 THEN
    RAISE EXCEPTION 'Há % vínculos laboratoriais entre clínicas ou incompatíveis com o paciente. Corrija os dados antes de aplicar esta migration.', v_invalidos;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_tenant_pedido_laboratorio()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_clinica uuid;
BEGIN
  IF NEW.clinica_id IS NULL OR NEW.paciente_id IS NULL THEN
    RAISE EXCEPTION 'Clínica e paciente são obrigatórios no pedido laboratorial.' USING ERRCODE = '23514';
  END IF;
  SELECT pa.clinica_id INTO v_clinica FROM public.pacientes pa WHERE pa.id = NEW.paciente_id FOR SHARE;
  IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id THEN
    RAISE EXCEPTION 'O paciente do pedido não pertence à clínica informada.' USING ERRCODE = '23514';
  END IF;
  IF NEW.medico_solicitante_id IS NOT NULL THEN
    SELECT m.clinica_id INTO v_clinica FROM public.medicos m WHERE m.id = NEW.medico_solicitante_id FOR SHARE;
    IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id THEN
      RAISE EXCEPTION 'O médico solicitante do pedido não pertence à clínica informada.' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.convenio_id IS NOT NULL THEN
    SELECT c.clinica_id INTO v_clinica FROM public.convenios c WHERE c.id = NEW.convenio_id FOR SHARE;
    IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id THEN
      RAISE EXCEPTION 'O convênio do pedido não pertence à clínica informada.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_tenant_exame_laboratorial()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_clinica uuid; v_paciente uuid;
BEGIN
  IF NEW.clinica_id IS NULL OR NEW.paciente_id IS NULL THEN
    RAISE EXCEPTION 'Clínica e paciente são obrigatórios no exame.' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.pedido_laboratorio_id IS DISTINCT FROM NEW.pedido_laboratorio_id THEN
    PERFORM p.id FROM public.pedidos_laboratorio p
     WHERE p.id = ANY(array_remove(ARRAY[OLD.pedido_laboratorio_id, NEW.pedido_laboratorio_id], NULL))
     ORDER BY p.id FOR UPDATE;
  ELSIF NEW.pedido_laboratorio_id IS NOT NULL THEN
    PERFORM p.id FROM public.pedidos_laboratorio p WHERE p.id = NEW.pedido_laboratorio_id
     ORDER BY p.id FOR UPDATE;
  END IF;
  SELECT pa.clinica_id INTO v_clinica FROM public.pacientes pa WHERE pa.id = NEW.paciente_id FOR SHARE;
  IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id THEN
    RAISE EXCEPTION 'O paciente do exame não pertence à clínica informada.' USING ERRCODE = '23514';
  END IF;
  IF NEW.medico_solicitante_id IS NOT NULL THEN
    SELECT m.clinica_id INTO v_clinica FROM public.medicos m WHERE m.id = NEW.medico_solicitante_id FOR SHARE;
    IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id THEN
      RAISE EXCEPTION 'O médico solicitante do exame não pertence à clínica informada.' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.tipo_exame_catalog_id IS NOT NULL THEN
    SELECT cat.clinica_id INTO v_clinica FROM public.tipo_exames_catalog cat WHERE cat.id = NEW.tipo_exame_catalog_id FOR SHARE;
    IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id THEN
      RAISE EXCEPTION 'O exame de catálogo não pertence à clínica informada.' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.pedido_laboratorio_id IS NOT NULL THEN
    SELECT p.clinica_id, p.paciente_id INTO v_clinica, v_paciente
      FROM public.pedidos_laboratorio p WHERE p.id = NEW.pedido_laboratorio_id;
    IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id OR v_paciente IS DISTINCT FROM NEW.paciente_id THEN
      RAISE EXCEPTION 'O pedido do exame não corresponde à clínica e ao paciente informados.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_tenant_coleta_laboratorio()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_clinica uuid; v_paciente uuid;
BEGIN
  IF NEW.clinica_id IS NULL OR NEW.paciente_id IS NULL THEN
    RAISE EXCEPTION 'Clínica e paciente são obrigatórios na coleta.' USING ERRCODE = '23514';
  END IF;
  SELECT pa.clinica_id INTO v_clinica FROM public.pacientes pa WHERE pa.id = NEW.paciente_id FOR SHARE;
  IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id THEN
    RAISE EXCEPTION 'O paciente da coleta não pertence à clínica informada.' USING ERRCODE = '23514';
  END IF;
  IF NEW.exame_id IS NOT NULL THEN
    SELECT e.clinica_id, e.paciente_id INTO v_clinica, v_paciente FROM public.exames e WHERE e.id = NEW.exame_id FOR SHARE;
    IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id OR v_paciente IS DISTINCT FROM NEW.paciente_id THEN
      RAISE EXCEPTION 'O exame da coleta não corresponde à clínica e ao paciente informados.' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.medico_solicitante_id IS NOT NULL THEN
    SELECT m.clinica_id INTO v_clinica FROM public.medicos m WHERE m.id = NEW.medico_solicitante_id FOR SHARE;
    IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id THEN
      RAISE EXCEPTION 'O médico solicitante da coleta não pertence à clínica informada.' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.convenio_id IS NOT NULL THEN
    SELECT c.clinica_id INTO v_clinica FROM public.convenios c WHERE c.id = NEW.convenio_id FOR SHARE;
    IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id THEN
      RAISE EXCEPTION 'O convênio da coleta não pertence à clínica informada.' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.setor_id IS NOT NULL THEN
    SELECT s.clinica_id INTO v_clinica FROM public.laboratorio_setores s WHERE s.id = NEW.setor_id FOR SHARE;
    IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id THEN
      RAISE EXCEPTION 'O setor da coleta não pertence à clínica informada.' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.recoleta_de_id IS NOT NULL THEN
    SELECT c.clinica_id, c.paciente_id INTO v_clinica, v_paciente FROM public.coletas_laboratorio c WHERE c.id = NEW.recoleta_de_id FOR SHARE;
    IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id OR v_paciente IS DISTINCT FROM NEW.paciente_id THEN
      RAISE EXCEPTION 'A recoleta deve pertencer à mesma clínica e paciente da amostra anterior.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_tenant_resultado_laboratorio()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_clinica uuid; v_paciente uuid;
BEGIN
  IF NEW.clinica_id IS NULL OR NEW.paciente_id IS NULL OR NEW.coleta_id IS NULL THEN
    RAISE EXCEPTION 'Clínica, paciente e coleta são obrigatórios no resultado.' USING ERRCODE = '23514';
  END IF;
  SELECT c.clinica_id, c.paciente_id INTO v_clinica, v_paciente
    FROM public.coletas_laboratorio c WHERE c.id = NEW.coleta_id FOR SHARE;
  IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id OR v_paciente IS DISTINCT FROM NEW.paciente_id THEN
    RAISE EXCEPTION 'A coleta do resultado não corresponde à clínica e ao paciente informados.' USING ERRCODE = '23514';
  END IF;
  SELECT pa.clinica_id INTO v_clinica FROM public.pacientes pa WHERE pa.id = NEW.paciente_id FOR SHARE;
  IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id THEN
    RAISE EXCEPTION 'O paciente do resultado não pertence à clínica informada.' USING ERRCODE = '23514';
  END IF;
  IF NEW.exame_id IS NOT NULL THEN
    SELECT e.clinica_id, e.paciente_id INTO v_clinica, v_paciente FROM public.exames e WHERE e.id = NEW.exame_id FOR SHARE;
    IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id OR v_paciente IS DISTINCT FROM NEW.paciente_id THEN
      RAISE EXCEPTION 'O exame do resultado não corresponde à clínica e ao paciente informados.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_tenant_pedido_laboratorio ON public.pedidos_laboratorio;
CREATE TRIGGER trg_validar_tenant_pedido_laboratorio BEFORE INSERT OR UPDATE ON public.pedidos_laboratorio
  FOR EACH ROW EXECUTE FUNCTION public.validar_tenant_pedido_laboratorio();
DROP TRIGGER IF EXISTS trg_validar_tenant_exame_laboratorial ON public.exames;
CREATE TRIGGER trg_validar_tenant_exame_laboratorial BEFORE INSERT OR UPDATE ON public.exames
  FOR EACH ROW EXECUTE FUNCTION public.validar_tenant_exame_laboratorial();
DROP TRIGGER IF EXISTS trg_validar_tenant_coleta_laboratorio ON public.coletas_laboratorio;
CREATE TRIGGER trg_validar_tenant_coleta_laboratorio BEFORE INSERT OR UPDATE ON public.coletas_laboratorio
  FOR EACH ROW EXECUTE FUNCTION public.validar_tenant_coleta_laboratorio();
DROP TRIGGER IF EXISTS trg_validar_tenant_resultado_laboratorio ON public.resultados_laboratorio;
CREATE TRIGGER trg_validar_tenant_resultado_laboratorio BEFORE INSERT OR UPDATE ON public.resultados_laboratorio
  FOR EACH ROW EXECUTE FUNCTION public.validar_tenant_resultado_laboratorio();

REVOKE ALL ON FUNCTION public.validar_tenant_pedido_laboratorio() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.validar_tenant_exame_laboratorial() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.validar_tenant_coleta_laboratorio() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.validar_tenant_resultado_laboratorio() FROM PUBLIC, anon;

-- A collection can only advance through the intended workflow. The RPCs below
-- set transaction-local markers after checking clinic, role, state and result data.
CREATE OR REPLACE FUNCTION public.proteger_transicao_coleta_laboratorio()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_transicao text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  v_transicao := current_setting('elolab.lab_transition', true);
  IF (OLD.status IN ('pendente', 'recoleta') AND NEW.status IN ('coletado', 'cancelado'))
     OR (OLD.status = 'coletado' AND NEW.status = 'em_analise') THEN
    RETURN NEW;
  END IF;
  IF NEW.status IN ('validado', 'liberado', 'rejeitada')
     AND v_transicao = NEW.status || ':' || NEW.id::text THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Transição de status laboratorial não permitida: % para %.', OLD.status, NEW.status
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_transicao_coleta_laboratorio ON public.coletas_laboratorio;
CREATE TRIGGER trg_proteger_transicao_coleta_laboratorio
  BEFORE UPDATE OF status ON public.coletas_laboratorio
  FOR EACH ROW EXECUTE FUNCTION public.proteger_transicao_coleta_laboratorio();
REVOKE ALL ON FUNCTION public.proteger_transicao_coleta_laboratorio() FROM PUBLIC, anon;

-- Validation runs with explicit authorization and records authorship atomically.
CREATE OR REPLACE FUNCTION public.validar_coleta_laboratorio(p_coleta_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_status text; v_clinica_id uuid; v_total integer; v_resultados_atualizados integer := 0;
BEGIN
  v_clinica_id := public.get_my_clinica_id();
  IF auth.uid() IS NULL OR v_clinica_id IS NULL OR NOT public.can_access_clinical(auth.uid()) THEN
    RAISE EXCEPTION 'Perfil sem permissão para validar resultados laboratoriais.' USING ERRCODE = '42501';
  END IF;
  SELECT c.status INTO v_status FROM public.coletas_laboratorio c
   WHERE c.id = p_coleta_id AND c.clinica_id = v_clinica_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Coleta não encontrada ou fora da clínica atual.' USING ERRCODE = 'P0002'; END IF;
  IF v_status <> 'em_analise' THEN
    RAISE EXCEPTION 'A coleta precisa estar em análise para ser validada.' USING ERRCODE = '23514';
  END IF;
  SELECT count(*) INTO v_total FROM public.resultados_laboratorio r
   WHERE r.coleta_id = p_coleta_id AND r.clinica_id = v_clinica_id;
  IF v_total = 0 THEN RAISE EXCEPTION 'Inclua ao menos um resultado antes de validar a coleta.' USING ERRCODE = '23514'; END IF;
  UPDATE public.resultados_laboratorio r
     SET validado_por = COALESCE(r.validado_por, auth.uid()),
         data_validacao = COALESCE(r.data_validacao, now())
   WHERE r.coleta_id = p_coleta_id AND r.clinica_id = v_clinica_id
     AND (r.validado_por IS NULL OR r.data_validacao IS NULL);
  GET DIAGNOSTICS v_resultados_atualizados = ROW_COUNT;
  IF EXISTS (SELECT 1 FROM public.resultados_laboratorio r
      WHERE r.coleta_id = p_coleta_id AND r.clinica_id = v_clinica_id
        AND (r.validado_por IS NULL OR r.data_validacao IS NULL)) THEN
    RAISE EXCEPTION 'Não foi possível registrar a autoria da conferência.' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('elolab.lab_transition', 'validado:' || p_coleta_id::text, true);
  UPDATE public.coletas_laboratorio c SET status = 'validado'
   WHERE c.id = p_coleta_id AND c.clinica_id = v_clinica_id AND c.status = 'em_analise';
  IF NOT FOUND THEN RAISE EXCEPTION 'A situação da coleta mudou. Atualize a tela.' USING ERRCODE = '40001'; END IF;
  RETURN v_resultados_atualizados;
END;
$$;
REVOKE ALL ON FUNCTION public.validar_coleta_laboratorio(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validar_coleta_laboratorio(uuid) TO authenticated;

-- Direct updates are not a release path. Only the authorized atomic RPC can
-- change release fields after technical validation.
CREATE OR REPLACE FUNCTION public.proteger_resultado_contra_estado_da_coleta()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_status text; v_clinica_id uuid; v_paciente_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.coleta_id IS DISTINCT FROM NEW.coleta_id THEN
    RAISE EXCEPTION 'O resultado não pode ser transferido para outra coleta.' USING ERRCODE = '23514';
  END IF;
  SELECT c.status, c.clinica_id, c.paciente_id INTO v_status, v_clinica_id, v_paciente_id
    FROM public.coletas_laboratorio c WHERE c.id = NEW.coleta_id FOR UPDATE;
  IF NOT FOUND OR NEW.clinica_id IS DISTINCT FROM v_clinica_id OR NEW.paciente_id IS DISTINCT FROM v_paciente_id THEN
    RAISE EXCEPTION 'O resultado precisa pertencer à mesma clínica e paciente da coleta.' USING ERRCODE = '23514';
  END IF;
  IF v_status = 'validado' THEN
    IF TG_OP = 'UPDATE'
       AND current_setting('elolab.retificar_resultado', true) = NEW.id::text
       AND public.can_access_clinical(auth.uid())
       AND (public.is_admin(auth.uid()) OR public.is_enfermagem(auth.uid()))
       AND length(btrim(coalesce(NEW.observacao_revisao, ''))) >= 10
       AND NEW.liberado IS NOT DISTINCT FROM OLD.liberado THEN
      RETURN NEW;
    END IF;
    IF TG_OP <> 'UPDATE' OR COALESCE(OLD.liberado, false) OR NEW.liberado IS NOT TRUE
       OR current_setting('elolab.liberar_resultado_coleta', true) IS DISTINCT FROM NEW.coleta_id::text
       OR (to_jsonb(NEW) - ARRAY['liberado', 'data_liberacao', 'liberado_por', 'updated_at'])
          IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['liberado', 'data_liberacao', 'liberado_por', 'updated_at']) THEN
      RAISE EXCEPTION 'A coleta já foi validada. Use a liberação técnica para publicar resultados.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF v_status = 'liberado' AND TG_OP = 'UPDATE'
     AND current_setting('elolab.retificar_resultado', true) = NEW.id::text
     AND public.can_access_clinical(auth.uid())
     AND (public.is_admin(auth.uid()) OR public.is_enfermagem(auth.uid()))
     AND OLD.liberado IS TRUE AND NEW.liberado IS TRUE
     AND length(btrim(coalesce(NEW.observacao_revisao, ''))) >= 10 THEN
    RETURN NEW;
  END IF;
  IF v_status NOT IN ('coletado', 'em_analise') THEN
    RAISE EXCEPTION 'Não é permitido incluir ou alterar resultados quando a coleta está em "%".', v_status USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS resultados_respeitam_estado_coleta ON public.resultados_laboratorio;
CREATE TRIGGER resultados_respeitam_estado_coleta BEFORE INSERT OR UPDATE ON public.resultados_laboratorio
  FOR EACH ROW EXECUTE FUNCTION public.proteger_resultado_contra_estado_da_coleta();
REVOKE ALL ON FUNCTION public.proteger_resultado_contra_estado_da_coleta() FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.retificar_resultado_laboratorio(
  p_resultado_id uuid, p_resultado text, p_unidade text, p_referencia_min numeric,
  p_referencia_max numeric, p_referencia_texto text, p_metodo text, p_critico boolean, p_motivo text
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_resultado public.resultados_laboratorio%ROWTYPE; v_clinica_id uuid; v_status_coleta text;
BEGIN
  v_clinica_id := public.get_my_clinica_id();
  IF auth.uid() IS NULL OR v_clinica_id IS NULL OR NOT public.can_access_clinical(auth.uid()) THEN
    RAISE EXCEPTION 'Perfil não autorizado a revisar resultados.' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(p_resultado), '') IS NULL THEN RAISE EXCEPTION 'Informe o resultado.' USING ERRCODE = '23514'; END IF;
  IF p_referencia_min IS NOT NULL AND p_referencia_max IS NOT NULL AND p_referencia_min > p_referencia_max THEN
    RAISE EXCEPTION 'O limite mínimo não pode exceder o máximo.' USING ERRCODE = '23514';
  END IF;
  SELECT r.* INTO v_resultado FROM public.resultados_laboratorio r
   WHERE r.id = p_resultado_id AND r.clinica_id = v_clinica_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Resultado não encontrado na clínica atual.' USING ERRCODE = 'P0002'; END IF;
  SELECT c.status INTO v_status_coleta FROM public.coletas_laboratorio c
   WHERE c.id = v_resultado.coleta_id AND c.clinica_id = v_clinica_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Coleta do resultado não encontrada na clínica atual.' USING ERRCODE = 'P0002'; END IF;
  SELECT r.* INTO v_resultado FROM public.resultados_laboratorio r
   WHERE r.id = p_resultado_id AND r.clinica_id = v_clinica_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Resultado alterado enquanto a retificação era preparada.' USING ERRCODE = '40001'; END IF;
  IF v_resultado.liberado IS TRUE OR v_status_coleta IN ('validado', 'liberado') THEN
    IF length(btrim(coalesce(p_motivo, ''))) < 10 THEN
      RAISE EXCEPTION 'A retificação após validação exige motivo com pelo menos 10 caracteres.' USING ERRCODE = '23514';
    END IF;
    IF NOT (public.is_admin(auth.uid()) OR public.is_enfermagem(auth.uid())) THEN
      RAISE EXCEPTION 'Somente responsável técnico pode retificar resultado validado.' USING ERRCODE = '42501';
    END IF;
  END IF;
  PERFORM set_config('elolab.retificar_resultado', p_resultado_id::text, true);
  UPDATE public.resultados_laboratorio SET
    resultado = btrim(p_resultado), unidade = nullif(btrim(p_unidade), ''),
    valor_referencia_min = p_referencia_min, valor_referencia_max = p_referencia_max,
    valor_referencia_texto = nullif(btrim(p_referencia_texto), ''), metodo = nullif(btrim(p_metodo), ''),
    critico = coalesce(p_critico, false), observacao_revisao = nullif(btrim(p_motivo), ''),
    revisado_por = auth.uid(), revisado_em = now(),
    data_liberacao = CASE WHEN v_resultado.liberado IS TRUE THEN now() ELSE data_liberacao END,
    liberado_por = CASE WHEN v_resultado.liberado IS TRUE THEN auth.uid() ELSE liberado_por END
   WHERE id = p_resultado_id AND clinica_id = v_clinica_id;
  PERFORM set_config('elolab.retificar_resultado', '', true);
  RETURN v_resultado.numero_versao + 1;
END;
$$;
REVOKE ALL ON FUNCTION public.retificar_resultado_laboratorio(uuid, text, text, numeric, numeric, text, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retificar_resultado_laboratorio(uuid, text, text, numeric, numeric, text, text, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.liberar_resultados_laboratorio(p_coleta_id uuid, p_resultado_ids uuid[])
RETURNS TABLE (id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_clinica_id uuid; v_status text; v_solicitados integer; v_encontrados integer;
BEGIN
  v_clinica_id := public.get_my_clinica_id();
  IF auth.uid() IS NULL OR v_clinica_id IS NULL OR NOT public.can_access_clinical(auth.uid()) THEN
    RAISE EXCEPTION 'Perfil não autorizado a liberar resultados.' USING ERRCODE = '42501';
  END IF;
  IF p_coleta_id IS NULL OR p_resultado_ids IS NULL OR cardinality(p_resultado_ids) = 0 THEN
    RAISE EXCEPTION 'Coleta e resultados são obrigatórios.' USING ERRCODE = '23514';
  END IF;
  SELECT c.status INTO v_status FROM public.coletas_laboratorio c
   WHERE c.id = p_coleta_id AND c.clinica_id = v_clinica_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Coleta não encontrada ou fora da clínica atual.' USING ERRCODE = 'P0002'; END IF;
  IF v_status NOT IN ('validado', 'liberado') THEN
    RAISE EXCEPTION 'Conclua a conferência técnica antes da liberação.' USING ERRCODE = '23514';
  END IF;
  SELECT count(DISTINCT x.id) INTO v_solicitados FROM unnest(p_resultado_ids) AS x(id);
  SELECT count(DISTINCT r.id) INTO v_encontrados FROM public.resultados_laboratorio r
   WHERE r.clinica_id = v_clinica_id AND r.coleta_id = p_coleta_id AND r.id = ANY(p_resultado_ids);
  IF v_solicitados = 0 OR v_solicitados <> v_encontrados THEN
    RAISE EXCEPTION 'Todos os resultados solicitados devem pertencer à coleta e à clínica atuais.' USING ERRCODE = '23514';
  END IF;
  PERFORM set_config('elolab.liberar_resultado_coleta', p_coleta_id::text, true);
  RETURN QUERY UPDATE public.resultados_laboratorio r
     SET liberado = true, data_liberacao = COALESCE(r.data_liberacao, now()),
         liberado_por = COALESCE(auth.uid(), r.liberado_por)
   WHERE r.coleta_id = p_coleta_id AND r.clinica_id = v_clinica_id
     AND r.id = ANY(p_resultado_ids) AND COALESCE(r.liberado, false) = false
   RETURNING r.id;
  IF NOT EXISTS (SELECT 1 FROM public.resultados_laboratorio r
      WHERE r.coleta_id = p_coleta_id AND r.clinica_id = v_clinica_id AND COALESCE(r.liberado, false) = false) THEN
    PERFORM set_config('elolab.lab_transition', 'liberado:' || p_coleta_id::text, true);
    UPDATE public.coletas_laboratorio c SET status = 'liberado'
     WHERE c.id = p_coleta_id AND c.clinica_id = v_clinica_id AND c.status = 'validado';
  END IF;
  PERFORM set_config('elolab.liberar_resultado_coleta', '', true);
END;
$$;
REVOKE ALL ON FUNCTION public.liberar_resultados_laboratorio(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.liberar_resultados_laboratorio(uuid, uuid[]) TO authenticated;

-- Keep order status synchronized when an exam changes parent or is deleted.
CREATE OR REPLACE FUNCTION public.laboratorio_recalcular_pedido()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_pedido_id uuid; v_ids uuid[] := ARRAY[]::uuid[]; v_total integer; v_liberados integer;
  v_cancelados integer; v_em_processo integer; v_agendados integer; v_status text; v_clinica_id uuid;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.pedido_laboratorio_id IS NOT NULL THEN
    v_ids := array_append(v_ids, OLD.pedido_laboratorio_id);
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.pedido_laboratorio_id IS NOT NULL THEN
    v_ids := array_append(v_ids, NEW.pedido_laboratorio_id);
  END IF;
  FOR v_pedido_id IN SELECT DISTINCT item.pedido_id FROM unnest(v_ids) AS item(pedido_id)
    WHERE item.pedido_id IS NOT NULL ORDER BY item.pedido_id LOOP
    SELECT count(*), count(*) FILTER (WHERE e.status::text = 'laudo_disponivel'),
           count(*) FILTER (WHERE e.status::text = 'cancelado'),
           count(*) FILTER (WHERE e.status::text = 'realizado'),
           count(*) FILTER (WHERE e.status::text = 'agendado')
      INTO v_total, v_liberados, v_cancelados, v_em_processo, v_agendados
      FROM public.exames e WHERE e.pedido_laboratorio_id = v_pedido_id;
    v_status := CASE
      WHEN v_total = 0 THEN 'cancelado'
      WHEN v_liberados = v_total THEN 'liberado'
      WHEN v_liberados > 0 THEN 'parcialmente_liberado'
      WHEN v_cancelados = v_total THEN 'cancelado'
      WHEN v_em_processo > 0 THEN 'em_processamento'
      WHEN v_agendados > 0 THEN 'agendado'
      ELSE 'solicitado'
    END;
    IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND v_pedido_id = OLD.pedido_laboratorio_id) THEN
      v_clinica_id := OLD.clinica_id;
    ELSE
      v_clinica_id := NEW.clinica_id;
    END IF;
    UPDATE public.pedidos_laboratorio p SET status = v_status, updated_at = now()
     WHERE p.id = v_pedido_id AND p.clinica_id = v_clinica_id AND p.status IS DISTINCT FROM v_status;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_lab_pedido_status_exame ON public.exames;
CREATE TRIGGER trg_lab_pedido_status_exame AFTER INSERT OR UPDATE OF status, pedido_laboratorio_id OR DELETE ON public.exames
  FOR EACH ROW
  EXECUTE FUNCTION public.laboratorio_recalcular_pedido();

-- Rejection is also a state transition and must use the audited movement RPC.
CREATE OR REPLACE FUNCTION public.laboratorio_registrar_evento_amostra(
  p_coleta_id uuid, p_tipo text, p_local text DEFAULT NULL, p_detalhes jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_clinica_id uuid; v_coleta public.coletas_laboratorio%ROWTYPE; v_nova_coleta_id uuid; v_status_anterior text; v_status_novo text; v_motivo text;
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
  IF p_tipo IN ('transporte', 'armazenamento') THEN
    IF nullif(btrim(p_local), '') IS NULL THEN RAISE EXCEPTION 'Informe o local da movimentação.' USING ERRCODE = '23514'; END IF;
    UPDATE public.coletas_laboratorio SET local_atual = btrim(p_local), updated_at = now() WHERE id = p_coleta_id;
  ELSIF p_tipo = 'rejeicao' THEN
    IF v_coleta.status NOT IN ('coletado', 'em_analise') THEN RAISE EXCEPTION 'Somente amostra recebida pode ser rejeitada.' USING ERRCODE = '23514'; END IF;
    IF length(btrim(coalesce(p_detalhes->>'motivo', ''))) < 5 THEN RAISE EXCEPTION 'Informe o motivo da rejeição.' USING ERRCODE = '23514'; END IF;
    PERFORM set_config('elolab.lab_transition', 'rejeitada:' || p_coleta_id::text, true);
    UPDATE public.coletas_laboratorio SET status = 'rejeitada', rejeicao_motivo = btrim(p_detalhes->>'motivo'), updated_at = now()
     WHERE id = p_coleta_id AND clinica_id = v_clinica_id;
  ELSIF p_tipo = 'recoleta' THEN
    v_motivo := nullif(btrim(p_detalhes->>'motivo'), '');
    IF v_coleta.status NOT IN ('coletado', 'em_analise', 'rejeitada') THEN
      RAISE EXCEPTION 'A recoleta só pode ser aberta para amostra coletada, em análise ou rejeitada.' USING ERRCODE = '23514';
    END IF;
    IF length(coalesce(v_motivo, '')) < 5 THEN RAISE EXCEPTION 'Informe o motivo da recoleta.' USING ERRCODE = '23514'; END IF;
    IF v_coleta.status IN ('coletado', 'em_analise') THEN
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
      jsonb_build_object('nova_coleta_id', v_nova_coleta_id, 'motivo', v_motivo), auth.uid());
    RETURN v_nova_coleta_id;
  END IF;
  INSERT INTO public.laboratorio_eventos_amostra (clinica_id, coleta_id, tipo, status_anterior, status_novo, local, detalhes, ator_id)
  VALUES (v_clinica_id, v_coleta.id, p_tipo, v_coleta.status,
    CASE WHEN p_tipo = 'rejeicao' THEN 'rejeitada' ELSE v_coleta.status END,
    nullif(btrim(p_local), ''), coalesce(p_detalhes, '{}'::jsonb), auth.uid()) RETURNING id INTO v_nova_coleta_id;
  RETURN v_nova_coleta_id;
END;
$$;
REVOKE ALL ON FUNCTION public.laboratorio_registrar_evento_amostra(uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.laboratorio_registrar_evento_amostra(uuid, text, text, jsonb) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011180000', ARRAY[]::text[], 'integridade_tenant_laboratorio');
COMMIT;

-- <<< 20261011180000
-- >>> 20261011190000 convites_funcionario_select_admin
BEGIN;

-- Tokens de convite autorizam o aceite pela Edge Function. A leitura direta
-- deve ficar restrita a administradores da clínica e da plataforma.
DROP POLICY IF EXISTS convites_funcionario_select_scoped_v3
  ON public.convites_funcionario;

CREATE POLICY convites_funcionario_select_scoped_v4
ON public.convites_funcionario FOR SELECT TO authenticated
USING (
  public.is_platform_admin()
  OR (
    public.is_admin(auth.uid())
    AND clinica_id IS NOT NULL
    AND clinica_id = public.get_my_clinica_id()
  )
);

INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011190000', ARRAY[]::text[], 'convites_funcionario_select_admin');
COMMIT;

-- <<< 20261011190000
-- >>> 20261011200000 estoque_acesso_por_responsabilidade
BEGIN;

-- O saldo e seu histórico só podem ser gravados atomicamente pelos RPCs.
DROP POLICY IF EXISTS estoque_insert ON public.estoque;
CREATE POLICY estoque_insert ON public.estoque
  FOR INSERT TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS movimentacoes_estoque_insert_scoped ON public.movimentacoes_estoque;
DROP POLICY IF EXISTS movimentacoes_estoque_insert ON public.movimentacoes_estoque;
CREATE POLICY movimentacoes_estoque_insert ON public.movimentacoes_estoque
  FOR INSERT TO authenticated
  WITH CHECK (false);

REVOKE INSERT, UPDATE ON public.estoque FROM PUBLIC, anon, authenticated;
GRANT UPDATE (
  nome, descricao, categoria, quantidade_minima, unidade, valor_unitario,
  fornecedor, lote, validade, localizacao, codigo_ean, fabricante, valor_venda,
  quantidade_maxima, ponto_pedido, principio_ativo, dosagem
) ON public.estoque TO authenticated;
REVOKE INSERT ON public.movimentacoes_estoque FROM PUBLIC, anon, authenticated;

-- Preserva a validação e a idempotência existentes, executando a escrita
-- como owner para que os clientes não precisem de INSERT/UPDATE direto.
ALTER FUNCTION public.cadastrar_item_estoque(
  uuid, text, text, text, integer, integer, integer, integer,
  numeric, numeric, text, text, date, text, text, text, text, text, text, uuid
) RENAME TO cadastrar_item_estoque_impl;
REVOKE ALL ON FUNCTION public.cadastrar_item_estoque_impl(
  uuid, text, text, text, integer, integer, integer, integer,
  numeric, numeric, text, text, date, text, text, text, text, text, text, uuid
) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.cadastrar_item_estoque(
  p_clinica_id uuid, p_nome text, p_categoria text, p_unidade text,
  p_quantidade integer, p_quantidade_minima integer, p_quantidade_maxima integer,
  p_ponto_pedido integer, p_valor_unitario numeric, p_valor_venda numeric,
  p_localizacao text, p_lote text, p_validade date, p_fornecedor text,
  p_descricao text, p_codigo_ean text, p_fabricante text,
  p_principio_ativo text, p_dosagem text, p_chave_cadastro uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.cadastrar_item_estoque_impl(
    p_clinica_id, p_nome, p_categoria, p_unidade, p_quantidade,
    p_quantidade_minima, p_quantidade_maxima, p_ponto_pedido,
    p_valor_unitario, p_valor_venda, p_localizacao, p_lote, p_validade,
    p_fornecedor, p_descricao, p_codigo_ean, p_fabricante,
    p_principio_ativo, p_dosagem, p_chave_cadastro
  );
$$;
REVOKE ALL ON FUNCTION public.cadastrar_item_estoque(
  uuid, text, text, text, integer, integer, integer, integer,
  numeric, numeric, text, text, date, text, text, text, text, text, text, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cadastrar_item_estoque(
  uuid, text, text, text, integer, integer, integer, integer,
  numeric, numeric, text, text, date, text, text, text, text, text, text, uuid
) TO authenticated;

ALTER FUNCTION public.registrar_movimentacao_estoque(uuid, text, integer, text, uuid)
  RENAME TO registrar_movimentacao_estoque_impl;
REVOKE ALL ON FUNCTION public.registrar_movimentacao_estoque_impl(uuid, text, integer, text, uuid)
  FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.registrar_movimentacao_estoque(
  p_item_id uuid, p_tipo text, p_quantidade integer, p_motivo text DEFAULT NULL,
  p_chave_idempotencia uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.is_admin(auth.uid()) OR public.is_enfermagem(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Seu perfil não pode movimentar o estoque desta clínica.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public.registrar_movimentacao_estoque_impl(
    p_item_id, p_tipo, p_quantidade, p_motivo, p_chave_idempotencia
  );
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_movimentacao_estoque(uuid, text, integer, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_movimentacao_estoque(uuid, text, integer, text, uuid)
  TO authenticated;

-- O inventário manual é responsabilidade de administração e enfermagem.
-- Financeiro e médico podem consultar conforme as políticas de leitura, mas
-- alterações clínicas usam a RPC de baixa vinculada ao prontuário.
DROP POLICY IF EXISTS estoque_update ON public.estoque;
CREATE POLICY estoque_update ON public.estoque
  FOR UPDATE TO authenticated
  USING (
    (public.is_admin(auth.uid()) OR public.is_enfermagem(auth.uid()))
    AND public.is_same_clinica(clinica_id)
  )
  WITH CHECK (
    (public.is_admin(auth.uid()) OR public.is_enfermagem(auth.uid()))
    AND public.is_same_clinica(clinica_id)
  );

-- Baixas clínicas só podem ocorrer para uma prescrição salva no prontuário
-- vigente do profissional. A função é SECURITY DEFINER para separar esse
-- fluxo específico da permissão genérica de edição do inventário.
CREATE OR REPLACE FUNCTION public.registrar_baixa_estoque(
  p_item_id uuid,
  p_quantidade integer,
  p_prontuario_id uuid DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL,
  p_motivo text DEFAULT NULL
)
RETURNS TABLE (
  item_id uuid,
  quantidade_anterior integer,
  quantidade_nova integer,
  ja_baixado boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_clinica_id uuid := public.get_my_clinica_id();
  v_prontuario_clinica_id uuid;
  v_medico_id uuid;
  v_prontuario_assinado boolean;
  v_item public.estoque%ROWTYPE;
  v_motivo text := NULLIF(trim(p_motivo), '');
  v_quantidade_prescrita numeric := 0;
  v_total_prescricoes bigint := 0;
  v_prescricoes_validas bigint := 0;
  v_quantidade_ja_baixada integer;
BEGIN
  IF auth.uid() IS NULL OR v_clinica_id IS NULL
     OR NOT (public.is_admin(auth.uid()) OR public.is_medico(auth.uid())) THEN
    RAISE EXCEPTION 'Seu perfil não pode registrar uma baixa clínica.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_prontuario_id IS NULL THEN
    RAISE EXCEPTION 'Salve o prontuário antes de registrar a dispensação.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_usuario_id IS NOT NULL AND p_usuario_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'O usuário da movimentação deve ser a sessão autenticada.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_quantidade IS NULL OR p_quantidade < 1 THEN
    RAISE EXCEPTION 'A quantidade da baixa deve ser maior que zero.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT p.clinica_id, p.medico_id, COALESCE(p.assinado, false)
    INTO v_prontuario_clinica_id, v_medico_id, v_prontuario_assinado
    FROM public.prontuarios AS p
   WHERE p.id = p_prontuario_id
   FOR UPDATE;
  IF NOT FOUND OR v_prontuario_clinica_id IS DISTINCT FROM v_clinica_id THEN
    RAISE EXCEPTION 'Prontuário não encontrado nesta clínica.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_prontuario_assinado THEN
    RAISE EXCEPTION 'Prontuário assinado é imutável. Registre um adendo antes de qualquer nova dispensação.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF public.is_medico(auth.uid()) AND NOT public.is_admin(auth.uid())
     AND NOT public.is_medico_responsavel_do_prontuario(v_medico_id) THEN
    RAISE EXCEPTION 'Este prontuário pertence a outro profissional.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT e.* INTO v_item
    FROM public.estoque AS e
   WHERE e.id = p_item_id
     AND e.clinica_id = v_clinica_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item de estoque não encontrado nesta clínica.'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- O cliente agrupa prescrições repetidas para o mesmo item. Repetições
  -- idênticas são no-op; uma soma diferente exige conferência antes de nova baixa.
  SELECT m.quantidade INTO v_quantidade_ja_baixada
    FROM public.movimentacoes_estoque AS m
   WHERE m.item_id = p_item_id
     AND m.prontuario_id = p_prontuario_id
     AND m.clinica_id = v_clinica_id
     AND m.tipo = 'saida'
   LIMIT 1;
  IF FOUND THEN
    IF v_quantidade_ja_baixada IS DISTINCT FROM p_quantidade THEN
      RAISE EXCEPTION 'A quantidade prescrita mudou após a quantidade já dispensada. Confira o prontuário e registre um ajuste manual se necessário.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN QUERY SELECT v_item.id, v_item.quantidade, v_item.quantidade, true;
    RETURN;
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE item.quantidade_normalizada ~ '^[0-9]*[1-9][0-9]*$'),
         COALESCE(sum(
           CASE WHEN item.quantidade_normalizada ~ '^[0-9]*[1-9][0-9]*$'
             THEN item.quantidade_normalizada::numeric ELSE 0 END
         ), 0)
    INTO v_total_prescricoes, v_prescricoes_validas, v_quantidade_prescrita
    FROM (
      SELECT trim(COALESCE(pr.quantidade, '')) AS quantidade_normalizada
        FROM public.prescricoes AS pr
       WHERE pr.prontuario_id = p_prontuario_id
         AND pr.clinica_id = v_clinica_id
         AND NULLIF(trim(pr.medicamento), '') IS NOT NULL
         AND position(lower(trim(pr.medicamento)) in lower(v_item.nome)) > 0
    ) AS item;

  IF v_total_prescricoes = 0 OR v_prescricoes_validas <> v_total_prescricoes
     OR v_quantidade_prescrita IS DISTINCT FROM p_quantidade::numeric THEN
    RAISE EXCEPTION 'O item e a quantidade total não correspondem às prescrições salvas neste prontuário.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_item.quantidade < p_quantidade THEN
    RAISE EXCEPTION 'Estoque insuficiente: % disponível, % solicitado.', v_item.quantidade, p_quantidade
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.estoque AS e
     SET quantidade = e.quantidade - p_quantidade
   WHERE e.id = p_item_id
     AND e.clinica_id = v_clinica_id;

  INSERT INTO public.movimentacoes_estoque (
    item_id, clinica_id, tipo, quantidade, prontuario_id, motivo, usuario_id
  ) VALUES (
    p_item_id, v_clinica_id, 'saida', p_quantidade, p_prontuario_id,
    v_motivo, auth.uid()
  );

  RETURN QUERY SELECT v_item.id, v_item.quantidade, v_item.quantidade - p_quantidade, false;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_baixa_estoque(uuid, integer, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_baixa_estoque(uuid, integer, uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.registrar_baixa_estoque(uuid, integer, uuid, uuid, text) IS
  'Debita estoque uma vez por prescrição e prontuário, validando clínica, profissional responsável e item prescrito.';

INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011200000', ARRAY[]::text[], 'estoque_acesso_por_responsabilidade');
COMMIT;

-- <<< 20261011200000
-- >>> 20261011210000 chat_integridade_conversas
BEGIN;

LOCK TABLE public.chat_messages IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.chat_conversations IN ACCESS EXCLUSIVE MODE;

-- Remove historical duplicate threads for the same unordered pair while
-- preserving every message by moving it to the oldest canonical thread.
DROP TRIGGER IF EXISTS trg_proteger_identidade_conversa_chat ON public.chat_conversations;
DROP TRIGGER IF EXISTS trg_proteger_conteudo_mensagem_chat ON public.chat_messages;

CREATE TEMP TABLE chat_conversation_duplicates ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    id,
    first_value(id) OVER (
      PARTITION BY clinica_id, LEAST(participante_1_id, participante_2_id), GREATEST(participante_1_id, participante_2_id)
      ORDER BY (participante_1_id > participante_2_id), created_at NULLS LAST, id
    ) AS keeper_id,
    row_number() OVER (
      PARTITION BY clinica_id, LEAST(participante_1_id, participante_2_id), GREATEST(participante_1_id, participante_2_id)
      ORDER BY (participante_1_id > participante_2_id), created_at NULLS LAST, id
    ) AS pair_rank
  FROM public.chat_conversations
)
SELECT id AS duplicate_id, keeper_id
FROM ranked
WHERE pair_rank > 1;

-- Drop directional pair uniqueness (including the legacy
-- chat_conversations_unique constraint) before canonicalizing, because threads
-- in different clinics may have existed in opposite orders under old schemas.
DO $$
DECLARE
  existing_constraint record;
BEGIN
  FOR existing_constraint IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.chat_conversations'::regclass
       AND contype = 'u'
       AND pg_get_constraintdef(oid) LIKE '%(participante_1_id, participante_2_id)%'
  LOOP
    EXECUTE format('ALTER TABLE public.chat_conversations DROP CONSTRAINT %I', existing_constraint.conname);
  END LOOP;
END;
$$;

UPDATE public.chat_messages AS message
   SET conversa_id = duplicate.keeper_id
  FROM chat_conversation_duplicates AS duplicate
 WHERE message.conversa_id = duplicate.duplicate_id;

DELETE FROM public.chat_conversations AS conversation
 USING chat_conversation_duplicates AS duplicate
 WHERE conversation.id = duplicate.duplicate_id;

UPDATE public.chat_conversations
   SET participante_1_id = LEAST(participante_1_id, participante_2_id),
       participante_2_id = GREATEST(participante_1_id, participante_2_id)
 WHERE participante_1_id > participante_2_id;

UPDATE public.chat_conversations AS conversation
   SET preview = latest.texto_preview,
       ultima_mensagem_em = latest.created_at
  FROM (
    SELECT DISTINCT ON (message.conversa_id)
           message.conversa_id,
           left(message.texto, 100) AS texto_preview,
           message.created_at
      FROM public.chat_messages AS message
      ORDER BY message.conversa_id, message.created_at DESC NULLS LAST, message.id DESC
  ) AS latest
 WHERE latest.conversa_id = conversation.id;

ALTER TABLE public.chat_conversations
  DROP CONSTRAINT IF EXISTS chat_conversations_participants_canonical;
ALTER TABLE public.chat_conversations
  ADD CONSTRAINT chat_conversations_participants_canonical
  CHECK (participante_1_id <= participante_2_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_conversations_participants_canonical
  ON public.chat_conversations (clinica_id, participante_1_id, participante_2_id)
  WHERE clinica_id IS NOT NULL;

DROP POLICY IF EXISTS chat_conv_insert_clinic ON public.chat_conversations;
CREATE POLICY chat_conv_insert_clinic ON public.chat_conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    clinica_id = public.get_my_clinica_id()
    AND participante_1_id < participante_2_id
    AND auth.uid() IN (participante_1_id, participante_2_id)
    AND EXISTS (
      SELECT 1 FROM public.profiles AS outro
       WHERE outro.id = CASE
         WHEN participante_1_id = auth.uid() THEN participante_2_id
         ELSE participante_1_id
       END
         AND outro.clinica_id = public.get_my_clinica_id()
         AND outro.ativo IS TRUE
    )
  );

DROP POLICY IF EXISTS chat_conv_delete_clinic ON public.chat_conversations;
DROP POLICY IF EXISTS chat_msg_delete_clinic ON public.chat_messages;
DROP POLICY IF EXISTS chat_conv_update_clinic ON public.chat_conversations;
REVOKE DELETE ON public.chat_conversations FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE ON public.chat_conversations FROM PUBLIC, anon, authenticated;
REVOKE DELETE ON public.chat_messages FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.atualizar_preview_conversa_chat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  ultima public.chat_messages%ROWTYPE;
BEGIN
  -- Serialize preview updates for this conversation and read the newest
  -- persisted message after obtaining the lock.
  PERFORM 1
    FROM public.chat_conversations
   WHERE id = NEW.conversa_id
   FOR UPDATE;

  SELECT * INTO ultima
    FROM public.chat_messages
   WHERE conversa_id = NEW.conversa_id
    ORDER BY created_at DESC NULLS LAST, id DESC
   LIMIT 1;

  UPDATE public.chat_conversations
     SET preview = left(ultima.texto, 100),
         ultima_mensagem_em = ultima.created_at
   WHERE id = NEW.conversa_id;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.atualizar_preview_conversa_chat() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_atualizar_preview_chat ON public.chat_messages;
CREATE TRIGGER trg_atualizar_preview_chat
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.atualizar_preview_conversa_chat();

CREATE OR REPLACE FUNCTION public.definir_data_mensagem_chat()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.created_at := clock_timestamp();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.definir_data_mensagem_chat() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_timestamp_mensagem_chat ON public.chat_messages;
CREATE TRIGGER trg_timestamp_mensagem_chat
  BEFORE INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.definir_data_mensagem_chat();

-- Restore the immutable identity and message-content guards after backfill.
CREATE TRIGGER trg_proteger_identidade_conversa_chat
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW EXECUTE FUNCTION public.proteger_identidade_conversa_chat();
CREATE TRIGGER trg_proteger_conteudo_mensagem_chat
  BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.proteger_conteudo_mensagem_chat();

INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011210000', ARRAY[]::text[], 'chat_integridade_conversas');
COMMIT;

-- <<< 20261011210000
-- >>> 20261011220000 indicadores_produtividade_fuso
BEGIN;
-- Indicadores operacionais sem ranking individual e sem dados identificáveis.
-- O escopo é derivado exclusivamente de auth.uid(); nenhum parâmetro de tenant/usuário é aceito.

CREATE OR REPLACE FUNCTION public.indicadores_produtividade(p_days integer DEFAULT 30)
RETURNS TABLE (
  metric_key text,
  label text,
  current_value numeric,
  previous_value numeric,
  unit text,
  scope text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_clinic uuid;
  v_roles public.app_role[];
  v_admin boolean := false;
  v_today date;
  v_current_date_start date;
  v_previous_date_start date;
  v_current_range_start timestamptz;
  v_current_range_end_exclusive timestamptz;
  v_previous_range_start timestamptz;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_days NOT IN (7, 30, 90) THEN
    RAISE EXCEPTION 'invalid period' USING ERRCODE = '22023';
  END IF;

  SELECT p.clinica_id INTO v_clinic
  FROM public.profiles p
  WHERE p.id = v_user AND COALESCE(p.ativo, true);
  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'clinic membership required' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(ur.role), ARRAY[]::public.app_role[])
    INTO v_roles
  FROM public.user_roles ur
  WHERE ur.user_id = v_user;
  v_admin := 'admin'::public.app_role = ANY(v_roles);
  v_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_current_date_start := v_today - (p_days - 1);
  v_previous_date_start := v_current_date_start - p_days;
  v_current_range_start := v_current_date_start::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_current_range_end_exclusive := (v_today + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_previous_range_start := v_previous_date_start::timestamp AT TIME ZONE 'America/Sao_Paulo';

  -- Tarefas são pessoais para colaboradores e agregadas para admin.
  RETURN QUERY
  SELECT 'tasks_completed', 'Tarefas concluídas',
    count(*) FILTER (WHERE t.data_conclusao >= v_current_range_start AND t.data_conclusao < v_current_range_end_exclusive)::numeric,
    count(*) FILTER (WHERE t.data_conclusao >= v_previous_range_start AND t.data_conclusao < v_current_range_start)::numeric,
    'tarefas', CASE WHEN v_admin THEN 'Clínica' ELSE 'Meu trabalho' END
  FROM public.tarefas t
  WHERE t.clinica_id = v_clinic
    AND (v_admin OR t.responsavel_id = v_user)
    AND t.data_conclusao >= v_previous_range_start
    AND t.data_conclusao < v_current_range_end_exclusive;

  IF v_admin OR 'medico'::public.app_role = ANY(v_roles) THEN
    RETURN QUERY
    SELECT 'appointments_completed', 'Atendimentos concluídos',
      count(*) FILTER (WHERE a.data >= v_current_date_start AND a.data <= v_today)::numeric,
      count(*) FILTER (WHERE a.data >= v_previous_date_start AND a.data < v_current_date_start)::numeric,
      'atendimentos', CASE WHEN v_admin THEN 'Clínica' ELSE 'Meu trabalho' END
    FROM public.agendamentos a
    WHERE a.clinica_id = v_clinic
      AND (v_admin OR EXISTS (
        SELECT 1 FROM public.medicos m
        WHERE m.id = a.medico_id
          AND m.clinica_id = v_clinic
          AND m.user_id = v_user
          AND m.ativo IS NOT FALSE
      ))
      AND a.status IN ('finalizado'::public.status_agendamento, 'atendimento_finalizado'::public.status_agendamento)
      AND a.data >= v_previous_date_start
      AND a.data <= v_today;
  END IF;

  IF v_admin OR 'enfermagem'::public.app_role = ANY(v_roles) THEN
    RETURN QUERY
    SELECT 'collections_completed', 'Coletas realizadas',
      count(*) FILTER (WHERE c.data_coleta >= v_current_range_start AND c.data_coleta < v_current_range_end_exclusive)::numeric,
      count(*) FILTER (WHERE c.data_coleta >= v_previous_range_start AND c.data_coleta < v_current_range_start)::numeric,
      'coletas', CASE WHEN v_admin THEN 'Clínica' ELSE 'Meu trabalho' END
    FROM public.coletas_laboratorio c
    WHERE c.clinica_id = v_clinic
      AND (v_admin OR c.coletado_por = v_user)
      AND c.data_coleta >= v_previous_range_start
      AND c.data_coleta < v_current_range_end_exclusive;
  END IF;

  IF v_admin OR 'financeiro'::public.app_role = ANY(v_roles) THEN
    RETURN QUERY
    SELECT 'payments_received', 'Recebimentos registrados',
      count(*) FILTER (WHERE p.data_pagamento >= v_current_range_start AND p.data_pagamento < v_current_range_end_exclusive)::numeric,
      count(*) FILTER (WHERE p.data_pagamento >= v_previous_range_start AND p.data_pagamento < v_current_range_start)::numeric,
      'recebimentos', CASE WHEN v_admin THEN 'Clínica' ELSE 'Meu trabalho' END
    FROM public.pagamentos p
    WHERE p.clinica_id = v_clinic
      AND p.estornado_em IS NULL
      AND (v_admin OR p.recebido_por = v_user)
      AND p.data_pagamento >= v_previous_range_start
      AND p.data_pagamento < v_current_range_end_exclusive;

    RETURN QUERY
    SELECT 'payments_value', 'Valor recebido',
      COALESCE(sum(p.valor) FILTER (WHERE p.data_pagamento >= v_current_range_start AND p.data_pagamento < v_current_range_end_exclusive), 0),
      COALESCE(sum(p.valor) FILTER (WHERE p.data_pagamento >= v_previous_range_start AND p.data_pagamento < v_current_range_start), 0),
      'BRL', CASE WHEN v_admin THEN 'Clínica' ELSE 'Meu trabalho' END
    FROM public.pagamentos p
    WHERE p.clinica_id = v_clinic
      AND p.estornado_em IS NULL
      AND (v_admin OR p.recebido_por = v_user)
      AND p.data_pagamento >= v_previous_range_start
      AND p.data_pagamento < v_current_range_end_exclusive;
  END IF;

  IF NOT v_admin AND 'recepcao'::public.app_role = ANY(v_roles) THEN
    RETURN QUERY
    SELECT 'appointments_registered', 'Agendamentos registrados',
      count(*) FILTER (WHERE al.timestamp >= v_current_range_start AND al.timestamp < v_current_range_end_exclusive)::numeric,
      count(*) FILTER (WHERE al.timestamp >= v_previous_range_start AND al.timestamp < v_current_range_start)::numeric,
      'agendamentos', 'Meu trabalho'
    FROM public.audit_log al
    WHERE al.clinica_id = v_clinic AND al.user_id = v_user
      AND al.collection = 'agendamentos' AND al.action = 'create'
      AND al.timestamp >= v_previous_range_start
      AND al.timestamp < v_current_range_end_exclusive;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.indicadores_produtividade(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.indicadores_produtividade(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.indicadores_produtividade(integer) TO authenticated;

COMMENT ON FUNCTION public.indicadores_produtividade(integer) IS
  'Indicadores operacionais do próprio usuário; admin recebe somente agregados da clínica, sem nomes, ranking ou PHI.';
INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011220000', ARRAY[]::text[], 'indicadores_produtividade_fuso');
COMMIT;

-- <<< 20261011220000
-- >>> 20261011230000 relatorios_salvos_acesso_e_propriedade
BEGIN;

DROP POLICY IF EXISTS "rel_salvos_select" ON public.relatorios_salvos;
DROP POLICY IF EXISTS "rel_salvos_insert" ON public.relatorios_salvos;
DROP POLICY IF EXISTS "rel_salvos_update" ON public.relatorios_salvos;
DROP POLICY IF EXISTS "rel_salvos_delete" ON public.relatorios_salvos;

-- Saved reports contain recipient addresses and configuration that can expose
-- sensitive clinic data. Finance users can manage their own reports; clinic
-- admins can manage reports for their clinic.
CREATE POLICY rel_salvos_select_scoped ON public.relatorios_salvos
  FOR SELECT TO authenticated
  USING (
    public.is_same_clinica(clinica_id)
    AND (public.is_admin(auth.uid()) OR public.is_financeiro(auth.uid()))
    AND (public.is_admin(auth.uid()) OR user_id = auth.uid())
  );

CREATE POLICY rel_salvos_insert_scoped ON public.relatorios_salvos
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_same_clinica(clinica_id)
    AND (public.is_admin(auth.uid()) OR public.is_financeiro(auth.uid()))
    AND user_id = auth.uid()
  );

CREATE POLICY rel_salvos_update_scoped ON public.relatorios_salvos
  FOR UPDATE TO authenticated
  USING (
    public.is_same_clinica(clinica_id)
    AND (public.is_admin(auth.uid()) OR public.is_financeiro(auth.uid()))
    AND (public.is_admin(auth.uid()) OR user_id = auth.uid())
  )
  WITH CHECK (
    public.is_same_clinica(clinica_id)
    AND (public.is_admin(auth.uid()) OR public.is_financeiro(auth.uid()))
    AND (public.is_admin(auth.uid()) OR user_id = auth.uid())
  );

CREATE POLICY rel_salvos_delete_scoped ON public.relatorios_salvos
  FOR DELETE TO authenticated
  USING (
    public.is_same_clinica(clinica_id)
    AND (public.is_admin(auth.uid()) OR public.is_financeiro(auth.uid()))
    AND (public.is_admin(auth.uid()) OR user_id = auth.uid())
  );

INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011230000', ARRAY[]::text[], 'relatorios_salvos_acesso_e_propriedade');
COMMIT;

-- <<< 20261011230000
-- >>> 20261011240000 financeiro_integridade_e_gravacao_controlada
BEGIN;

-- Patient payments are append-only. Reversals must use estornar_pagamento,
-- which requires a reason and recalculates the receivable atomically.
REVOKE UPDATE, DELETE ON TABLE public.pagamentos FROM authenticated;
DROP POLICY IF EXISTS pagamentos_update ON public.pagamentos;

-- lancar_item_no_atendimento is SECURITY INVOKER and needs its existing
-- insert/update grants. The trigger below still enforces same-clinic links.

CREATE OR REPLACE FUNCTION public.validar_clinica_lancamento_filho()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica_lancamento uuid;
BEGIN
  SELECT l.clinica_id INTO v_clinica_lancamento
    FROM public.lancamentos l
   WHERE l.id = NEW.lancamento_id;

  IF NOT FOUND OR v_clinica_lancamento IS DISTINCT FROM NEW.clinica_id THEN
    RAISE EXCEPTION 'O lançamento informado não pertence à mesma clínica.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_clinica_lancamento_filho() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS pagamentos_validar_clinica_lancamento ON public.pagamentos;
CREATE TRIGGER pagamentos_validar_clinica_lancamento
  BEFORE INSERT OR UPDATE OF lancamento_id, clinica_id ON public.pagamentos
  FOR EACH ROW EXECUTE FUNCTION public.validar_clinica_lancamento_filho();

DROP TRIGGER IF EXISTS lancamento_itens_validar_clinica_lancamento ON public.lancamento_itens;
CREATE TRIGGER lancamento_itens_validar_clinica_lancamento
  BEFORE INSERT OR UPDATE OF lancamento_id, clinica_id ON public.lancamento_itens
  FOR EACH ROW EXECUTE FUNCTION public.validar_clinica_lancamento_filho();

-- Repasse generation and payment already use SECURITY DEFINER RPCs. Approval
-- also gets a controlled transition, so a direct UPDATE cannot mark a repasse
-- paid or skip its workflow.
REVOKE INSERT, UPDATE ON TABLE public.repasses_medicos FROM authenticated;
DROP POLICY IF EXISTS repasses_financeiro_insert ON public.repasses_medicos;
DROP POLICY IF EXISTS repasses_financeiro_update ON public.repasses_medicos;

CREATE OR REPLACE FUNCTION public.validar_origem_quitada_repasse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status_receita text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status
     OR NEW.status NOT IN ('aprovado', 'pago') THEN
    RETURN NEW;
  END IF;

  SELECT l.status INTO v_status_receita
    FROM public.lancamentos l
   WHERE l.id = NEW.lancamento_id
     AND l.clinica_id = NEW.clinica_id
   FOR UPDATE;

  IF NOT FOUND OR v_status_receita IS DISTINCT FROM 'pago' THEN
    RAISE EXCEPTION 'A receita de origem precisa estar quitada para aprovar ou pagar o repasse.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_origem_quitada_repasse() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS repasses_validar_origem_quitada ON public.repasses_medicos;
CREATE TRIGGER repasses_validar_origem_quitada
  BEFORE UPDATE OF status ON public.repasses_medicos
  FOR EACH ROW EXECUTE FUNCTION public.validar_origem_quitada_repasse();

CREATE OR REPLACE FUNCTION public.aprovar_repasse_medico(p_repasse_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica uuid := public.get_my_clinica_id();
  v_repasse public.repasses_medicos%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_financial(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso financeiro necessário' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_repasse
    FROM public.repasses_medicos
   WHERE id = p_repasse_id AND clinica_id = v_clinica
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Repasse não encontrado para esta clínica' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_repasse.status <> 'pendente' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este repasse já mudou de status.');
  END IF;

  UPDATE public.repasses_medicos
     SET status = 'aprovado', aprovado_em = now()
   WHERE id = v_repasse.id AND clinica_id = v_clinica;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.aprovar_repasse_medico(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aprovar_repasse_medico(uuid) TO authenticated;

COMMENT ON FUNCTION public.aprovar_repasse_medico(uuid) IS
  'Aprova um repasse pendente com escopo de clínica e transição serializada.';

INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011240000', ARRAY[]::text[], 'financeiro_integridade_e_gravacao_controlada');
COMMIT;

-- <<< 20261011240000
-- >>> 20261011250000 cobranca_inadimplente_claim_atomico
BEGIN;

CREATE TABLE IF NOT EXISTS public.cobranca_inadimplente_claims (
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  lancamento_id uuid NOT NULL REFERENCES public.lancamentos(id) ON DELETE CASCADE,
  dias_atraso integer NOT NULL CHECK (dias_atraso > 0),
  claimed_until timestamptz NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinica_id, lancamento_id, dias_atraso)
);

ALTER TABLE public.cobranca_inadimplente_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cobranca_inadimplente_claims FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.cobranca_inadimplente_claims TO service_role;

CREATE OR REPLACE FUNCTION public.claim_cobranca_inadimplente(
  p_clinica_id uuid,
  p_lancamento_id uuid,
  p_dias_atraso integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_claimed boolean := false;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Acesso restrito ao processador de notificações' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_clinica_id IS NULL OR p_lancamento_id IS NULL OR p_dias_atraso <= 0 THEN
    RAISE EXCEPTION 'Chave de cobrança inválida' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO public.cobranca_inadimplente_claims
    (clinica_id, lancamento_id, dias_atraso, claimed_until)
  VALUES (p_clinica_id, p_lancamento_id, p_dias_atraso, now() + interval '10 minutes')
  ON CONFLICT (clinica_id, lancamento_id, dias_atraso) DO UPDATE
    SET claimed_until = EXCLUDED.claimed_until, created_at = now()
    WHERE public.cobranca_inadimplente_claims.completed_at IS NULL
      AND public.cobranca_inadimplente_claims.claimed_until < now()
  RETURNING true INTO v_claimed;

  RETURN COALESCE(v_claimed, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.concluir_cobranca_inadimplente(
  p_clinica_id uuid,
  p_lancamento_id uuid,
  p_dias_atraso integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Acesso restrito ao processador de notificações' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.cobranca_inadimplente_claims
     SET completed_at = now(), claimed_until = now()
   WHERE clinica_id = p_clinica_id
     AND lancamento_id = p_lancamento_id
     AND dias_atraso = p_dias_atraso
     AND completed_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_cobranca_inadimplente(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.concluir_cobranca_inadimplente(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_cobranca_inadimplente(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.concluir_cobranca_inadimplente(uuid, uuid, integer) TO service_role;

COMMENT ON TABLE public.cobranca_inadimplente_claims IS
  'Reserva atômica por clínica, lançamento e etapa para evitar cobranças duplicadas em execuções concorrentes.';

INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011250000', ARRAY[]::text[], 'cobranca_inadimplente_claim_atomico');
COMMIT;

-- <<< 20261011250000
-- >>> 20261011260000 agenda_integridade_referencial_e_status
BEGIN;

CREATE OR REPLACE FUNCTION public.validar_referencias_agendamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica_referencia uuid;
BEGIN
  IF NEW.clinica_id IS NULL THEN
    RAISE EXCEPTION 'O agendamento precisa pertencer a uma clínica.' USING ERRCODE = '23514';
  END IF;

  SELECT clinica_id INTO v_clinica_referencia FROM public.pacientes WHERE id = NEW.paciente_id FOR SHARE;
  IF NOT FOUND OR v_clinica_referencia IS DISTINCT FROM NEW.clinica_id THEN
    RAISE EXCEPTION 'O paciente não pertence à clínica do agendamento.' USING ERRCODE = '23514';
  END IF;

  IF NEW.medico_id IS NOT NULL THEN
    SELECT clinica_id INTO v_clinica_referencia FROM public.medicos WHERE id = NEW.medico_id FOR SHARE;
    IF NOT FOUND OR v_clinica_referencia IS DISTINCT FROM NEW.clinica_id THEN
      RAISE EXCEPTION 'O profissional não pertence à clínica do agendamento.' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.sala_id IS NOT NULL THEN
    SELECT clinica_id INTO v_clinica_referencia FROM public.salas WHERE id = NEW.sala_id FOR SHARE;
    IF NOT FOUND OR v_clinica_referencia IS DISTINCT FROM NEW.clinica_id THEN
      RAISE EXCEPTION 'A sala não pertence à clínica do agendamento.' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_referencias_agendamento() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS agendamentos_validar_referencias ON public.agendamentos;
CREATE TRIGGER agendamentos_validar_referencias
  BEFORE INSERT OR UPDATE OF clinica_id, paciente_id, medico_id, sala_id ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.validar_referencias_agendamento();

CREATE OR REPLACE FUNCTION public.validar_transicao_status_agendamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_permitidos text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS NULL OR NEW.status::text NOT IN ('agendado', 'confirmado') THEN
      RAISE EXCEPTION 'Um agendamento novo deve iniciar como agendado ou confirmado.' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status::text = 'cancelado'
     AND NEW.status::text = 'agendado'
     AND EXISTS (
       SELECT 1 FROM public.retornos r
        WHERE r.agendamento_retorno_id = NEW.id
          AND r.clinica_id = NEW.clinica_id
          AND r.status::text NOT IN ('realizado', 'cancelado')
     ) THEN
    RETURN NEW;
  END IF;

  v_permitidos := CASE OLD.status::text
    WHEN 'agendado' THEN ARRAY['confirmado', 'aguardando', 'aguardando_pagamento', 'aguardando_triagem', 'em_triagem', 'pago', 'cancelado', 'faltou']
    WHEN 'confirmado' THEN ARRAY['aguardando', 'aguardando_pagamento', 'aguardando_triagem', 'em_triagem', 'pago', 'cancelado', 'faltou']
    WHEN 'aguardando' THEN ARRAY['aguardando_pagamento', 'aguardando_triagem', 'em_triagem', 'em_atendimento', 'pago', 'cancelado', 'faltou']
    WHEN 'aguardando_pagamento' THEN ARRAY['aguardando', 'pago', 'cancelado']
    WHEN 'aguardando_triagem' THEN ARRAY['aguardando', 'em_triagem', 'em_atendimento', 'pago', 'cancelado', 'faltou']
    WHEN 'em_triagem' THEN ARRAY['aguardando', 'em_atendimento', 'pago', 'cancelado']
    WHEN 'pago' THEN ARRAY['aguardando', 'aguardando_triagem', 'em_triagem', 'em_atendimento', 'finalizado', 'atendimento_finalizado', 'aguardando_pagamento_adicional']
    WHEN 'em_atendimento' THEN ARRAY['finalizado', 'atendimento_finalizado', 'aguardando_pagamento_adicional', 'cancelado']
    WHEN 'aguardando_pagamento_adicional' THEN ARRAY['pago', 'finalizado', 'atendimento_finalizado']
    WHEN 'finalizado' THEN ARRAY['atendimento_finalizado', 'aguardando_pagamento_adicional']
    ELSE ARRAY[]::text[]
  END;

  IF NEW.status IS NULL OR NOT (NEW.status::text = ANY(v_permitidos)) THEN
    RAISE EXCEPTION 'Transição de status de agendamento inválida: % → %.', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status::text = 'pago'
     AND COALESCE(public.saldo_devedor_do_agendamento(NEW.id), 0) > 0.009 THEN
    RAISE EXCEPTION 'O agendamento não pode ficar pago enquanto houver saldo em aberto.' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_transicao_status_agendamento() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS agendamentos_validar_transicao_status ON public.agendamentos;
CREATE TRIGGER agendamentos_validar_transicao_status
  BEFORE INSERT OR UPDATE OF status ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.validar_transicao_status_agendamento();

-- A direct cancellation/no-show update must keep the queue consistent too.
CREATE OR REPLACE FUNCTION public.sincronizar_fila_apos_cancelamento_agendamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status::text IN ('cancelado', 'faltou')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    DELETE FROM public.fila_atendimento
     WHERE agendamento_id = NEW.id
       AND clinica_id = NEW.clinica_id
       AND status <> 'finalizado';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sincronizar_fila_apos_cancelamento_agendamento() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS agendamentos_sincronizar_fila_apos_cancelamento ON public.agendamentos;
CREATE TRIGGER agendamentos_sincronizar_fila_apos_cancelamento
  AFTER UPDATE OF status ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.sincronizar_fila_apos_cancelamento_agendamento();

-- Appointment and block writes take the same per-doctor/day advisory lock.
-- This serializes the database conflict checks and prevents a block from being
-- committed over a newly booked appointment (or vice versa).
CREATE OR REPLACE FUNCTION public.agendamento_nao_sobrepoe_bloqueio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.medico_id IS NULL OR NEW.status::text IN ('cancelado', 'faltou') THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.medico_id::text), (NEW.data - DATE '2000-01-01'));

  IF EXISTS (
    SELECT 1
      FROM public.bloqueios_agenda b
     WHERE b.medico_id = NEW.medico_id
       AND b.clinica_id = NEW.clinica_id
       AND NEW.data BETWEEN b.data_inicio AND b.data_fim
       AND (
         COALESCE(b.dia_inteiro, true)
         OR (NEW.hora_inicio < b.hora_fim
             AND COALESCE(NEW.hora_fim, NEW.hora_inicio + interval '30 minutes') > b.hora_inicio)
       )
  ) THEN
    RAISE EXCEPTION 'AGENDA_BLOQUEIO_CONFLITO: este horário está bloqueado para o profissional.'
      USING ERRCODE = '23P01';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.agendamento_nao_sobrepoe_bloqueio() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS agendamentos_nao_sobrepoe_bloqueio ON public.agendamentos;
CREATE TRIGGER agendamentos_nao_sobrepoe_bloqueio
  BEFORE INSERT OR UPDATE OF medico_id, data, hora_inicio, hora_fim, status ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.agendamento_nao_sobrepoe_bloqueio();

CREATE OR REPLACE FUNCTION public.bloqueio_agenda_sem_conflito()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_data date;
  v_clinica_id uuid;
BEGIN
  v_clinica_id := COALESCE(NEW.clinica_id, OLD.clinica_id);
  IF TG_OP <> 'DELETE' THEN
    SELECT clinica_id INTO v_clinica_id
      FROM public.medicos
     WHERE id = NEW.medico_id
     FOR SHARE;
    IF NOT FOUND OR v_clinica_id IS DISTINCT FROM NEW.clinica_id THEN
      RAISE EXCEPTION 'O profissional do bloqueio precisa pertencer à mesma clínica.' USING ERRCODE = '23514';
    END IF;

    IF NEW.data_fim < NEW.data_inicio THEN
      RAISE EXCEPTION 'O período do bloqueio é inválido.' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT COALESCE(NEW.dia_inteiro, true)
       AND (NEW.hora_inicio IS NULL OR NEW.hora_fim IS NULL OR NEW.hora_fim <= NEW.hora_inicio) THEN
      RAISE EXCEPTION 'Informe horários válidos para o bloqueio parcial.' USING ERRCODE = 'check_violation';
    END IF;

    FOR v_data IN SELECT generate_series(NEW.data_inicio, NEW.data_fim, interval '1 day')::date LOOP
      PERFORM pg_advisory_xact_lock(hashtext(NEW.medico_id::text), (v_data - DATE '2000-01-01'));
    END LOOP;

    IF EXISTS (
      SELECT 1
        FROM public.agendamentos a
       WHERE a.medico_id = NEW.medico_id
         AND a.clinica_id = v_clinica_id
         AND a.data BETWEEN NEW.data_inicio AND NEW.data_fim
         AND a.status::text NOT IN ('cancelado', 'faltou')
         AND (
           COALESCE(NEW.dia_inteiro, true)
           OR (a.hora_inicio < NEW.hora_fim
               AND COALESCE(a.hora_fim, a.hora_inicio + interval '30 minutes') > NEW.hora_inicio)
         )
    ) THEN
      RAISE EXCEPTION 'AGENDA_BLOQUEIO_CONFLITO: o bloqueio coincide com uma consulta existente.'
        USING ERRCODE = '23P01';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.bloqueio_agenda_sem_conflito() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS bloqueios_agenda_sem_conflito ON public.bloqueios_agenda;
CREATE TRIGGER bloqueios_agenda_sem_conflito
  BEFORE INSERT OR UPDATE OR DELETE ON public.bloqueios_agenda
  FOR EACH ROW EXECUTE FUNCTION public.bloqueio_agenda_sem_conflito();

INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011260000', ARRAY[]::text[], 'agenda_integridade_referencial_e_status');
COMMIT;

-- <<< 20261011260000
-- >>> 20261011270000 proteger_lancamentos_e_limites_de_desconto
BEGIN;

-- Status, baixa e data de pagamento so podem mudar pelos fluxos controlados.
REVOKE UPDATE ON TABLE public.lancamentos FROM authenticated;
GRANT UPDATE (descricao, valor, forma_pagamento, desconto, acrescimo, observacoes)
  ON TABLE public.lancamentos TO authenticated;

CREATE OR REPLACE FUNCTION public.cancelar_lancamento_pendente(p_lancamento_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinica_id uuid := public.get_my_clinica_id();
BEGIN
  IF auth.uid() IS NULL OR NOT (public.can_access_financial(auth.uid()) OR public.is_recepcao(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissao para cancelar esta cobranca.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_clinica_id IS NULL THEN
    RAISE EXCEPTION 'Clinica nao identificada.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.lancamentos l
     SET status = 'cancelado'
   WHERE l.id = p_lancamento_id
     AND l.clinica_id = v_clinica_id
     AND l.status IN ('pendente', 'atrasado')
     AND COALESCE(l.valor_pago, 0) = 0
     AND NOT EXISTS (
       SELECT 1 FROM public.pagamentos p
        WHERE p.lancamento_id = l.id AND p.estornado_em IS NULL
     );

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.cancelar_lancamento_pendente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_lancamento_pendente(uuid) TO authenticated;

-- Preserva a baixa atomica da cobranca quando o atendimento e desfeito por
-- falta, sem depender de UPDATE direto concedido ao papel autenticado.
CREATE OR REPLACE FUNCTION public.marcar_atendimento_nao_realizado(
  p_agendamento_id uuid,
  p_clinica_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agendamento public.agendamentos%rowtype;
  v_fila public.fila_atendimento%rowtype;
  v_lancamento public.lancamentos%rowtype;
  v_tem_lancamento boolean := false;
  v_pagamento_registrado boolean := false;
BEGIN
  IF auth.uid() IS NULL OR p_clinica_id IS DISTINCT FROM public.get_my_clinica_id()
     OR NOT (public.is_recepcao(auth.uid()) OR public.can_access_clinical(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissao para desfazer este atendimento.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_agendamento FROM public.agendamentos
   WHERE id = p_agendamento_id AND clinica_id = p_clinica_id FOR UPDATE;
  IF NOT FOUND OR v_agendamento.status::text IS DISTINCT FROM 'em_atendimento' THEN
    RETURN jsonb_build_object('desfeito', false, 'motivo', 'status_alterado');
  END IF;

  SELECT * INTO v_fila FROM public.fila_atendimento
   WHERE agendamento_id = p_agendamento_id AND clinica_id = p_clinica_id AND status <> 'finalizado'
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  SELECT * INTO v_lancamento FROM public.lancamentos
   WHERE agendamento_id = p_agendamento_id AND clinica_id = p_clinica_id LIMIT 1 FOR UPDATE;
  v_tem_lancamento := FOUND;

  IF v_tem_lancamento THEN
    SELECT EXISTS (SELECT 1 FROM public.pagamentos
      WHERE lancamento_id = v_lancamento.id AND estornado_em IS NULL) INTO v_pagamento_registrado;
    IF v_pagamento_registrado OR COALESCE(v_lancamento.valor_pago, 0) > 0
       OR v_lancamento.status::text IN ('pago', 'parcial') THEN
      RETURN jsonb_build_object('desfeito', false, 'motivo', 'pagamento_registrado');
    END IF;
    IF v_lancamento.status::text NOT IN ('cancelado', 'estornado') THEN
      UPDATE public.lancamentos SET status = 'cancelado' WHERE id = v_lancamento.id;
    END IF;
  END IF;

  IF v_fila.id IS NOT NULL THEN DELETE FROM public.fila_atendimento WHERE id = v_fila.id; END IF;
  UPDATE public.agendamentos SET status = 'cancelado' WHERE id = v_agendamento.id;
  RETURN jsonb_build_object(
    'desfeito', true,
    'cobranca_cancelada', v_tem_lancamento AND v_lancamento.status::text NOT IN ('cancelado', 'estornado'),
    'havia_cobranca', v_tem_lancamento
  );
END;
$$;
REVOKE ALL ON FUNCTION public.marcar_atendimento_nao_realizado(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_atendimento_nao_realizado(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.validar_limites_ajuste_lancamento()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.desconto, 0) < 0 OR COALESCE(NEW.desconto, 0) > NEW.valor * 0.50 THEN
    RAISE EXCEPTION 'Desconto acima do limite de 50%% da cobranca.' USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(NEW.acrescimo, 0) < 0 OR COALESCE(NEW.acrescimo, 0) > NEW.valor * 0.30 THEN
    RAISE EXCEPTION 'Acrescimo acima do limite de 30%% da cobranca.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lancamentos_validar_limites_ajuste ON public.lancamentos;
CREATE TRIGGER lancamentos_validar_limites_ajuste
BEFORE INSERT OR UPDATE OF desconto, acrescimo, valor ON public.lancamentos
FOR EACH ROW EXECUTE FUNCTION public.validar_limites_ajuste_lancamento();

INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011270000', ARRAY[]::text[], 'proteger_lancamentos_e_limites_de_desconto');
COMMIT;

-- <<< 20261011270000
-- >>> 20261011280000 prontuario_referencias_e_anexos_assinados
BEGIN;

CREATE OR REPLACE FUNCTION public.validar_referencias_prontuario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_paciente_da_clinica(NEW.paciente_id, NEW.clinica_id) THEN
    RAISE EXCEPTION 'Paciente e prontuario precisam pertencer a mesma clinica.' USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.medico_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.medicos m
     WHERE m.id = NEW.medico_id AND m.clinica_id = NEW.clinica_id
  ) THEN
    RAISE EXCEPTION 'Profissional e prontuario precisam pertencer a mesma clinica.' USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.agendamento_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.agendamentos a
     WHERE a.id = NEW.agendamento_id
       AND a.clinica_id = NEW.clinica_id
       AND a.paciente_id = NEW.paciente_id
       AND a.medico_id = NEW.medico_id
  ) THEN
    RAISE EXCEPTION 'Agendamento, paciente, profissional e prontuario precisam corresponder.' USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prontuario_validar_referencias ON public.prontuarios;
CREATE TRIGGER trg_prontuario_validar_referencias
BEFORE INSERT OR UPDATE OF paciente_id, medico_id, agendamento_id, clinica_id
ON public.prontuarios FOR EACH ROW
EXECUTE FUNCTION public.validar_referencias_prontuario();

-- Evita dois registros principais concorrentes para o mesmo atendimento.
CREATE OR REPLACE FUNCTION public.impedir_prontuario_duplicado_por_agendamento()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.agendamento_id IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(NEW.agendamento_id::text));
  IF EXISTS (
    SELECT 1 FROM public.prontuarios p
     WHERE p.agendamento_id = NEW.agendamento_id
       AND p.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'Ja existe um prontuario para este atendimento.' USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_prontuario_unico_por_agendamento ON public.prontuarios;
CREATE TRIGGER trg_prontuario_unico_por_agendamento
BEFORE INSERT OR UPDATE OF agendamento_id ON public.prontuarios
FOR EACH ROW EXECUTE FUNCTION public.impedir_prontuario_duplicado_por_agendamento();

CREATE OR REPLACE FUNCTION public.storage_med_attach_delete_allowed(_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parts text[];
  v_prontuario_id uuid;
BEGIN
  IF _name IS NULL THEN RETURN false; END IF;
  parts := string_to_array(_name, '/');
  -- Exames usam o prefixo exames/<paciente_id>/..., fora da regra de prontuario.
  IF array_length(parts, 1) >= 3 AND parts[1] = 'exames' THEN RETURN true; END IF;
  -- Permite remover uploads temporarios de receita que falharam antes do INSERT,
  -- mas nunca um PDF que ja esteja vinculado a uma prescricao.
  IF array_length(parts, 1) >= 3 AND parts[1] = 'prescricoes' THEN
    BEGIN
      v_prontuario_id := parts[2]::uuid;
    EXCEPTION WHEN others THEN
      RETURN false;
    END;
    RETURN EXISTS (
      SELECT 1 FROM public.pacientes p
       WHERE p.id = v_prontuario_id AND p.clinica_id = public.get_my_clinica_id()
    ) AND NOT EXISTS (
      SELECT 1 FROM public.prescricoes pr
       WHERE pr.paciente_id = v_prontuario_id AND pr.arquivo_pdf = _name
    );
  END IF;
  BEGIN
    v_prontuario_id := parts[1]::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  RETURN EXISTS (
    SELECT 1 FROM public.prontuarios p
     WHERE p.id = v_prontuario_id AND p.clinica_id = public.get_my_clinica_id()
       AND p.assinado IS NOT TRUE
  );
END;
$$;
REVOKE ALL ON FUNCTION public.storage_med_attach_delete_allowed(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storage_med_attach_delete_allowed(text) TO authenticated;

DROP POLICY IF EXISTS "med_attach_delete_scoped" ON storage.objects;
CREATE POLICY "med_attach_delete_scoped" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'medical-attachments'
    AND (public.is_admin(auth.uid()) OR public.is_medico(auth.uid()))
    AND public.storage_med_attach_allowed(name)
    AND public.storage_med_attach_delete_allowed(name)
  );

-- Uma leitura de prontuario assinado exige uma autorizacao de auditoria recente
-- gravada pelo servidor antes do SELECT. Duplicatas de acesso no mesmo minuto
-- sao evitadas, mantendo a trilha rastreavel sem inundar a tabela.
CREATE OR REPLACE FUNCTION public.prontuario_leitura_auditada(p_prontuario_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.prontuario_acessos pa
     WHERE pa.prontuario_id = p_prontuario_id
       AND pa.user_id = auth.uid()
       AND pa.acao = 'visualizacao'
       AND pa.created_at >= now() - interval '2 minutes'
  );
$$;
REVOKE ALL ON FUNCTION public.prontuario_leitura_auditada(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prontuario_leitura_auditada(uuid) TO authenticated;

DROP POLICY IF EXISTS prontuarios_select_autorizado ON public.prontuarios;
DROP POLICY IF EXISTS prontuarios_select_com_leitura_auditada ON public.prontuarios;
CREATE POLICY prontuarios_select_com_leitura_auditada ON public.prontuarios
  FOR SELECT TO authenticated
  USING (
    public.is_same_clinica(clinica_id)
    AND (public.is_admin(auth.uid()) OR (
      public.is_medico(auth.uid())
      AND (assinado IS TRUE OR public.is_medico_responsavel_do_prontuario(medico_id))
    ))
    AND (assinado IS NOT TRUE OR public.prontuario_leitura_auditada(id))
  );

CREATE OR REPLACE FUNCTION public.registrar_visualizacao_historico_paciente(p_paciente_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinica_id uuid := public.get_my_clinica_id();
  v_nome text;
  v_crm text;
  v_registrados integer := 0;
BEGIN
  IF auth.uid() IS NULL OR v_clinica_id IS NULL
     OR NOT (public.is_admin(auth.uid()) OR public.is_medico(auth.uid())) THEN
    RAISE EXCEPTION 'Acesso ao historico clinico nao autorizado.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.is_paciente_da_clinica(p_paciente_id, v_clinica_id) THEN
    RAISE EXCEPTION 'Paciente nao encontrado nesta clinica.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT nome, crm INTO v_nome, v_crm FROM public.medicos
   WHERE user_id = auth.uid() AND clinica_id = v_clinica_id AND ativo IS NOT FALSE
   ORDER BY created_at DESC LIMIT 1;

  INSERT INTO public.prontuario_acessos (
    prontuario_id, paciente_id, clinica_id, user_id, user_nome, user_crm, acao, justificativa
  )
  SELECT p.id, p.paciente_id, p.clinica_id, auth.uid(),
         COALESCE(v_nome, auth.jwt() ->> 'email', 'Usuario clinico'), v_crm,
         'visualizacao', 'Leitura autorizada do historico do paciente'
    FROM public.prontuarios p
   WHERE p.paciente_id = p_paciente_id AND p.clinica_id = v_clinica_id
     AND (public.is_admin(auth.uid()) OR p.assinado IS TRUE
       OR public.is_medico_responsavel_do_prontuario(p.medico_id))
     AND NOT EXISTS (
       SELECT 1 FROM public.prontuario_acessos pa
        WHERE pa.prontuario_id = p.id AND pa.user_id = auth.uid()
          AND pa.acao = 'visualizacao' AND pa.created_at >= now() - interval '1 minute'
     );
  GET DIAGNOSTICS v_registrados = ROW_COUNT;
  RETURN v_registrados;
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_visualizacao_historico_paciente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_visualizacao_historico_paciente(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.registrar_visualizacao_historico_medico(p_medico_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinica_id uuid := public.get_my_clinica_id();
  v_nome text;
  v_crm text;
  v_registrados integer := 0;
BEGIN
  IF auth.uid() IS NULL OR v_clinica_id IS NULL
     OR NOT (public.is_admin(auth.uid()) OR public.is_medico_responsavel_do_prontuario(p_medico_id)) THEN
    RAISE EXCEPTION 'Acesso ao historico medico nao autorizado.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT nome, crm INTO v_nome, v_crm FROM public.medicos
   WHERE user_id = auth.uid() AND clinica_id = v_clinica_id AND ativo IS NOT FALSE
   ORDER BY created_at DESC LIMIT 1;
  INSERT INTO public.prontuario_acessos (
    prontuario_id, paciente_id, clinica_id, user_id, user_nome, user_crm, acao, justificativa
  )
  SELECT p.id, p.paciente_id, p.clinica_id, auth.uid(),
         COALESCE(v_nome, auth.jwt() ->> 'email', 'Usuario clinico'), v_crm,
         'visualizacao', 'Leitura autorizada do historico do profissional'
    FROM public.prontuarios p
   WHERE p.medico_id = p_medico_id AND p.clinica_id = v_clinica_id
     AND (public.is_admin(auth.uid()) OR p.assinado IS TRUE
       OR public.is_medico_responsavel_do_prontuario(p.medico_id))
     AND NOT EXISTS (
       SELECT 1 FROM public.prontuario_acessos pa
        WHERE pa.prontuario_id = p.id AND pa.user_id = auth.uid()
          AND pa.acao = 'visualizacao' AND pa.created_at >= now() - interval '1 minute'
     );
  GET DIAGNOSTICS v_registrados = ROW_COUNT;
  RETURN v_registrados;
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_visualizacao_historico_medico(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_visualizacao_historico_medico(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.registrar_visualizacao_historico_clinica()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinica_id uuid := public.get_my_clinica_id();
  v_nome text;
  v_crm text;
  v_registrados integer := 0;
BEGIN
  IF auth.uid() IS NULL OR v_clinica_id IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Relatorios clinicos sao restritos a administracao da clinica.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT nome, crm INTO v_nome, v_crm FROM public.medicos
   WHERE user_id = auth.uid() AND clinica_id = v_clinica_id AND ativo IS NOT FALSE
   ORDER BY created_at DESC LIMIT 1;
  INSERT INTO public.prontuario_acessos (
    prontuario_id, paciente_id, clinica_id, user_id, user_nome, user_crm, acao, justificativa
  )
  SELECT p.id, p.paciente_id, p.clinica_id, auth.uid(),
         COALESCE(v_nome, auth.jwt() ->> 'email', 'Administrador'), v_crm,
         'visualizacao', 'Relatorio clinico da clinica'
    FROM public.prontuarios p
   WHERE p.clinica_id = v_clinica_id AND p.assinado IS TRUE
     AND NOT EXISTS (
       SELECT 1 FROM public.prontuario_acessos pa
        WHERE pa.prontuario_id = p.id AND pa.user_id = auth.uid()
          AND pa.acao = 'visualizacao' AND pa.created_at >= now() - interval '1 minute'
     );
  GET DIAGNOSTICS v_registrados = ROW_COUNT;
  RETURN v_registrados;
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_visualizacao_historico_clinica() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_visualizacao_historico_clinica() TO authenticated;

INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011280000', ARRAY[]::text[], 'prontuario_referencias_e_anexos_assinados');
COMMIT;

-- <<< 20261011280000
-- >>> 20261011290000 documentos_clinicos_autoria_transicoes
BEGIN;

-- Preserve who issued new documents. Historical rows remain unattributed rather
-- than assigning a false author retroactively.
ALTER TABLE public.atestados
  ADD COLUMN IF NOT EXISTS criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.encaminhamentos
  ADD COLUMN IF NOT EXISTS criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.validar_autoria_documento_clinico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN NEW.criado_por := auth.uid(); END IF;
    IF NOT public.is_admin(auth.uid()) THEN
      IF NOT public.is_medico(auth.uid()) THEN
        RAISE EXCEPTION 'Somente administracao ou profissional medico pode emitir este documento.'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF TG_TABLE_NAME = 'atestados'
         AND NOT public.is_medico_responsavel_do_prontuario(NEW.medico_id) THEN
        RAISE EXCEPTION 'O medico deve emitir o atestado em seu proprio nome.'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF TG_TABLE_NAME = 'encaminhamentos'
         AND NOT public.is_medico_responsavel_do_prontuario(NEW.medico_origem_id) THEN
        RAISE EXCEPTION 'O medico deve emitir o encaminhamento em seu proprio nome.'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.criado_por IS DISTINCT FROM OLD.criado_por
     OR NEW.clinica_id IS DISTINCT FROM OLD.clinica_id THEN
    RAISE EXCEPTION 'A autoria e a clinica do documento sao imutaveis.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_TABLE_NAME = 'atestados' THEN
    IF NEW.paciente_id IS DISTINCT FROM OLD.paciente_id
       OR NEW.medico_id IS DISTINCT FROM OLD.medico_id THEN
      RAISE EXCEPTION 'Paciente e medico emissor do atestado sao imutaveis.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT public.is_admin(auth.uid()) AND (
      NOT public.is_medico(auth.uid())
      OR NOT public.is_medico_responsavel_do_prontuario(OLD.medico_id)
    ) THEN
      RAISE EXCEPTION 'Somente o medico emissor ou a administracao pode alterar o atestado.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.paciente_id IS DISTINCT FROM OLD.paciente_id
     OR NEW.medico_origem_id IS DISTINCT FROM OLD.medico_origem_id
     OR NEW.medico_destino_id IS DISTINCT FROM OLD.medico_destino_id
     OR NEW.prontuario_id IS DISTINCT FROM OLD.prontuario_id
     OR NEW.especialidade_destino IS DISTINCT FROM OLD.especialidade_destino
     OR NEW.tipo IS DISTINCT FROM OLD.tipo
     OR NEW.urgencia IS DISTINCT FROM OLD.urgencia
     OR NEW.motivo IS DISTINCT FROM OLD.motivo
     OR NEW.hipotese_diagnostica IS DISTINCT FROM OLD.hipotese_diagnostica
     OR NEW.cid_principal IS DISTINCT FROM OLD.cid_principal
     OR NEW.exames_realizados IS DISTINCT FROM OLD.exames_realizados
     OR NEW.tratamento_atual IS DISTINCT FROM OLD.tratamento_atual
     OR NEW.informacoes_adicionais IS DISTINCT FROM OLD.informacoes_adicionais THEN
    RAISE EXCEPTION 'Os dados clinicos e a autoria do encaminhamento sao imutaveis.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.is_admin(auth.uid()) AND (
    NOT public.is_medico(auth.uid())
    OR NOT (
      public.is_medico_responsavel_do_prontuario(OLD.medico_origem_id)
      OR (OLD.medico_destino_id IS NOT NULL
          AND public.is_medico_responsavel_do_prontuario(OLD.medico_destino_id))
    )
  ) THEN
    RAISE EXCEPTION 'Somente os medicos envolvidos ou a administracao podem atualizar o encaminhamento.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_autoria_atestado ON public.atestados;
CREATE TRIGGER trg_validar_autoria_atestado
  BEFORE INSERT OR UPDATE ON public.atestados
  FOR EACH ROW EXECUTE FUNCTION public.validar_autoria_documento_clinico();
DROP TRIGGER IF EXISTS trg_validar_autoria_encaminhamento ON public.encaminhamentos;
CREATE TRIGGER trg_validar_autoria_encaminhamento
  BEFORE INSERT OR UPDATE ON public.encaminhamentos
  FOR EACH ROW EXECUTE FUNCTION public.validar_autoria_documento_clinico();

CREATE OR REPLACE FUNCTION public.validar_transicao_encaminhamento()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    IF NEW.status = 'concluido'
       AND (NULLIF(btrim(NEW.contra_referencia), '') IS NULL OR NEW.data_contra_referencia IS NULL) THEN
      RAISE EXCEPTION 'Um encaminhamento concluido exige contra-referencia e data.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status <> 'concluido'
       AND (NEW.contra_referencia IS DISTINCT FROM OLD.contra_referencia
         OR NEW.data_contra_referencia IS DISTINCT FROM OLD.data_contra_referencia)
       AND (NULLIF(btrim(NEW.contra_referencia), '') IS NOT NULL OR NEW.data_contra_referencia IS NOT NULL) THEN
      RAISE EXCEPTION 'A contra-referencia so pode ser registrada ao concluir o encaminhamento.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'pendente' AND NEW.status = 'em_andamento' THEN
    IF NEW.data_atendimento IS NULL THEN
      RAISE EXCEPTION 'Informe a data de atendimento ao iniciar o encaminhamento.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IN ('pendente', 'em_andamento') AND NEW.status = 'concluido' THEN
    IF NULLIF(btrim(NEW.contra_referencia), '') IS NULL OR NEW.data_contra_referencia IS NULL THEN
      RAISE EXCEPTION 'Um encaminhamento concluido exige contra-referencia e data.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.data_atendimento IS NULL THEN NEW.data_atendimento := NEW.data_contra_referencia; END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IN ('pendente', 'em_andamento') AND NEW.status = 'cancelado' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Transicao de status de encaminhamento nao permitida: % -> %.', OLD.status, NEW.status
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_transicao_encaminhamento ON public.encaminhamentos;
CREATE TRIGGER trg_validar_transicao_encaminhamento
  BEFORE UPDATE OF status, contra_referencia, data_contra_referencia, data_atendimento
  ON public.encaminhamentos
  FOR EACH ROW EXECUTE FUNCTION public.validar_transicao_encaminhamento();

-- Replace permissive legacy SELECT rules, including reception and patient-wide
-- policies. These records are available only to the clinic's clinical roles.
DROP POLICY IF EXISTS atestados_select ON public.atestados;
DROP POLICY IF EXISTS atestados_select_scoped ON public.atestados;
CREATE POLICY atestados_select_clinical_only ON public.atestados
  FOR SELECT TO authenticated
  USING ((public.is_admin(auth.uid()) OR public.is_medico(auth.uid()))
    AND public.is_same_clinica(clinica_id));

DROP POLICY IF EXISTS encaminhamentos_select ON public.encaminhamentos;
DROP POLICY IF EXISTS encaminhamentos_select_scoped ON public.encaminhamentos;
DROP POLICY IF EXISTS "Paciente pode ver seus encaminhamentos" ON public.encaminhamentos;
DROP POLICY IF EXISTS "Médico solicitante pode ver seus encaminhamentos" ON public.encaminhamentos;
DROP POLICY IF EXISTS "Médico destino pode ver encaminhamentos" ON public.encaminhamentos;
CREATE POLICY encaminhamentos_select_clinical_only ON public.encaminhamentos
  FOR SELECT TO authenticated
  USING ((public.is_admin(auth.uid()) OR public.is_medico(auth.uid()))
    AND public.is_same_clinica(clinica_id));

-- Prescriptions are append-only outside their draft encounter workflow. The UI
-- has no update/delete action for standalone prescriptions; service integrations
-- still use the service role and signed encounter rows remain protected by their
-- existing trigger.
DROP POLICY IF EXISTS prescricoes_update_independentes ON public.prescricoes;
DROP POLICY IF EXISTS prescricoes_delete_independentes ON public.prescricoes;
DROP POLICY IF EXISTS prescricoes_update ON public.prescricoes;
DROP POLICY IF EXISTS prescricoes_delete ON public.prescricoes;
DROP POLICY IF EXISTS prescricoes_update_scoped ON public.prescricoes;
DROP POLICY IF EXISTS prescricoes_delete_scoped ON public.prescricoes;

INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011290000', ARRAY[]::text[], 'documentos_clinicos_autoria_transicoes');
COMMIT;

-- <<< 20261011290000
-- >>> 20261011300000 prescricao_memed_idempotencia
BEGIN;

LOCK TABLE public.prescricoes IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.prescricoes
     WHERE observacoes LIKE 'Memed:%'
     GROUP BY clinica_id, observacoes
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Existem prescricoes Memed locais duplicadas; reconcilie os registros antes de criar a chave idempotente.';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS prescricoes_memed_marker_unico
  ON public.prescricoes (clinica_id, observacoes)
  WHERE observacoes LIKE 'Memed:%';

CREATE OR REPLACE FUNCTION public.registrar_prescricao_memed_local(
  p_clinica_id uuid,
  p_paciente_id uuid,
  p_medico_id uuid,
  p_prescription_uuid text,
  p_medicamento text,
  p_data_emissao date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_marker text;
  v_id uuid;
  v_paciente_clinica uuid;
  v_medico_clinica uuid;
  v_paciente_id uuid;
  v_medico_id uuid;
BEGIN
  IF p_clinica_id IS NULL OR p_paciente_id IS NULL OR p_medico_id IS NULL
     OR NULLIF(btrim(p_prescription_uuid), '') IS NULL
     OR NULLIF(btrim(p_medicamento), '') IS NULL THEN
    RAISE EXCEPTION 'Dados obrigatorios da prescricao Memed ausentes.' USING ERRCODE = 'not_null_violation';
  END IF;

  SELECT clinica_id INTO v_paciente_clinica FROM public.pacientes WHERE id = p_paciente_id;
  SELECT clinica_id INTO v_medico_clinica FROM public.medicos WHERE id = p_medico_id;
  IF v_paciente_clinica IS DISTINCT FROM p_clinica_id
     OR v_medico_clinica IS DISTINCT FROM p_clinica_id THEN
    RAISE EXCEPTION 'Paciente e prescritor precisam pertencer a clinica da prescricao.'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  v_marker := 'Memed:' || p_prescription_uuid;
  INSERT INTO public.prescricoes (
    clinica_id, paciente_id, medico_id, tipo, medicamento, observacoes, data_emissao
  ) VALUES (
    p_clinica_id, p_paciente_id, p_medico_id, 'simples', left(p_medicamento, 10000), v_marker,
    COALESCE(p_data_emissao, CURRENT_DATE)
  )
  ON CONFLICT (clinica_id, observacoes) WHERE observacoes LIKE 'Memed:%' DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id, paciente_id, medico_id
      INTO v_id, v_paciente_id, v_medico_id
      FROM public.prescricoes
     WHERE clinica_id = p_clinica_id AND observacoes = v_marker;
    IF v_id IS NULL OR v_paciente_id IS DISTINCT FROM p_paciente_id
       OR v_medico_id IS DISTINCT FROM p_medico_id THEN
      RAISE EXCEPTION 'A prescricao Memed local ja esta vinculada a outro paciente ou medico.'
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_prescricao_memed_local(uuid, uuid, uuid, text, text, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_prescricao_memed_local(uuid, uuid, uuid, text, text, date)
  TO service_role;

COMMENT ON FUNCTION public.registrar_prescricao_memed_local(uuid, uuid, uuid, text, text, date) IS
  'Cria uma unica linha local por receita Memed e torna callbacks concorrentes idempotentes.';

INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011300000', ARRAY[]::text[], 'prescricao_memed_idempotencia');
COMMIT;

-- <<< 20261011300000
-- >>> 20261011310000 pagamentos_insercao_controlada
-- Pagamentos de pacientes só podem ser gravados pelo RPC validado.
-- O RPC passa a SECURITY DEFINER, mas valida perfil e clínica explicitamente.
BEGIN;

REVOKE INSERT ON TABLE public.pagamentos FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS pagamentos_insert ON public.pagamentos;
CREATE OR REPLACE FUNCTION public.registrar_pagamento(
  p_lancamento_id      uuid,
  p_pagamentos         jsonb,
  p_desconto           numeric DEFAULT 0,
  p_acrescimo          numeric DEFAULT 0,
  p_chave_idempotencia text    DEFAULT NULL,
  p_observacoes        text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conta          public.lancamentos%ROWTYPE;
  v_total_informado numeric(12,2);
  v_devido          numeric(12,2);
  v_ja_pago         numeric(12,2);
  v_saldo           numeric(12,2);
  v_agendamento     uuid;
  v_exige_previo    boolean;
  v_status_agend    text;
  v_clinica_id      uuid;
  v_lancamento_chave uuid;
BEGIN
  v_clinica_id := public.get_my_clinica_id();
  IF auth.uid() IS NULL OR v_clinica_id IS NULL
     OR NOT (public.can_access_financial(auth.uid()) OR public.is_recepcao(auth.uid())) THEN
    RAISE EXCEPTION 'Acesso negado ao fluxo de pagamentos.' USING ERRCODE = '42501';
  END IF;

  IF p_lancamento_id IS NULL THEN
    RAISE EXCEPTION 'lancamento_id é obrigatório';
  END IF;

  IF jsonb_typeof(p_pagamentos) <> 'array' OR jsonb_array_length(p_pagamentos) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos uma forma de pagamento.';
  END IF;

  -- ─── Idempotência ───
  IF p_chave_idempotencia IS NOT NULL THEN
    SELECT lancamento_id INTO v_lancamento_chave
      FROM public.pagamentos
     WHERE chave_idempotencia = p_chave_idempotencia AND clinica_id = v_clinica_id;
    IF FOUND THEN
      IF v_lancamento_chave IS DISTINCT FROM p_lancamento_id THEN
        RAISE EXCEPTION 'A chave de idempotência já foi usada em outra cobrança.' USING ERRCODE = 'unique_violation';
      END IF;
      SELECT * INTO v_conta FROM public.lancamentos WHERE id = p_lancamento_id AND clinica_id = v_clinica_id;
      RETURN jsonb_build_object(
        'repetido', true,
        'status', v_conta.status,
        'valor', v_conta.valor,
        'valor_pago', COALESCE(v_conta.valor_pago, 0),
        'saldo', (v_conta.valor - COALESCE(v_conta.desconto, 0) + COALESCE(v_conta.acrescimo, 0)) - COALESCE(v_conta.valor_pago, 0)
      );
    END IF;
  END IF;

  -- ─── Trava a conta ───
  SELECT * INTO v_conta
    FROM public.lancamentos
   WHERE id = p_lancamento_id AND clinica_id = v_clinica_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cobrança não encontrada nesta clínica.' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_conta.clinica_id IS DISTINCT FROM v_clinica_id THEN
    RAISE EXCEPTION 'Cobrança não encontrada nesta clínica.' USING ERRCODE = 'no_data_found';
  END IF;

  -- Two requests with the same key can both pass the fast check above before
  -- either locks the account. Recheck after the account lock so the second
  -- request returns the committed result instead of a false balance/unique error.
  IF p_chave_idempotencia IS NOT NULL THEN
    SELECT lancamento_id INTO v_lancamento_chave
      FROM public.pagamentos
     WHERE chave_idempotencia = p_chave_idempotencia AND clinica_id = v_clinica_id;
    IF FOUND THEN
      IF v_lancamento_chave IS DISTINCT FROM p_lancamento_id THEN
        RAISE EXCEPTION 'A chave de idempotência já foi usada em outra cobrança.' USING ERRCODE = 'unique_violation';
      END IF;
      RETURN jsonb_build_object(
        'repetido', true,
        'status', v_conta.status,
        'valor', v_conta.valor,
        'valor_pago', COALESCE(v_conta.valor_pago, 0),
        'saldo', (v_conta.valor - COALESCE(v_conta.desconto, 0) + COALESCE(v_conta.acrescimo, 0)) - COALESCE(v_conta.valor_pago, 0)
      );
    END IF;
  END IF;

  IF v_conta.status IN ('cancelado', 'estornado') THEN
    RAISE EXCEPTION 'Esta cobrança está % e não pode receber pagamento.', v_conta.status;
  END IF;

  v_clinica_id := v_conta.clinica_id;
  PERFORM 1
    FROM public.caixa_diario AS c
   WHERE c.clinica_id = v_clinica_id
     AND c.data = (now() AT TIME ZONE 'America/Sao_Paulo')::date
     AND c.aberto IS TRUE
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caixa fechado. Abra o caixa do dia antes de registrar pagamentos.' USING ERRCODE = 'check_violation';
  END IF;

  -- ─── Desconto e acréscimo ───
  IF COALESCE(p_desconto, 0) < 0 OR COALESCE(p_acrescimo, 0) < 0 THEN
    RAISE EXCEPTION 'Desconto e acréscimo não podem ser negativos.';
  END IF;

  IF COALESCE(p_desconto, 0) > v_conta.valor THEN
    RAISE EXCEPTION 'Desconto de % é maior que o valor da cobrança (%).',
      p_desconto, v_conta.valor;
  END IF;

  UPDATE public.lancamentos
     SET desconto  = COALESCE(p_desconto, desconto, 0),
         acrescimo = COALESCE(p_acrescimo, acrescimo, 0),
         observacoes = CASE
           WHEN p_observacoes IS NULL OR p_observacoes = '' THEN observacoes
           ELSE concat_ws(' | ', NULLIF(observacoes, ''), p_observacoes)
         END
   WHERE id = p_lancamento_id
   RETURNING * INTO v_conta;

  v_devido  := v_conta.valor - COALESCE(v_conta.desconto, 0) + COALESCE(v_conta.acrescimo, 0);
  v_ja_pago := COALESCE((
    SELECT sum(valor) FROM public.pagamentos
     WHERE lancamento_id = p_lancamento_id AND estornado_em IS NULL
  ), 0);

  SELECT COALESCE(sum((item->>'valor')::numeric), 0)
    INTO v_total_informado
    FROM jsonb_array_elements(p_pagamentos) AS item;

  IF v_total_informado <= 0 THEN
    RAISE EXCEPTION 'O valor do pagamento precisa ser maior que zero.';
  END IF;

  IF round((v_ja_pago + v_total_informado) * 100) > round(v_devido * 100) THEN
    RAISE EXCEPTION 'O pagamento de % excede o saldo devedor de %.',
      v_total_informado, v_devido - v_ja_pago;
  END IF;

  -- ─── Grava os pagamentos ───
  INSERT INTO public.pagamentos (
    lancamento_id, clinica_id, forma_pagamento, valor, parcelas,
    recebido_por, observacoes, chave_idempotencia
  )
  SELECT
    p_lancamento_id,
    v_conta.clinica_id,
    item->>'forma_pagamento',
    (item->>'valor')::numeric,
    COALESCE((item->>'parcelas')::int, 1),
    auth.uid(),
    p_observacoes,
    CASE WHEN ordinalidade = 1 THEN p_chave_idempotencia END
  FROM jsonb_array_elements(p_pagamentos) WITH ORDINALITY AS t(item, ordinalidade);

  SELECT * INTO v_conta FROM public.lancamentos WHERE id = p_lancamento_id AND clinica_id = v_clinica_id;
  v_saldo := v_devido - COALESCE(v_conta.valor_pago, 0);

  -- ─── Avança o agendamento ───
  -- Quem ainda não foi atendido vai a 'pago'; quem já foi atendido e devia o
  -- adicional volta a 'finalizado'. Não mexe em quem está em atendimento.
  IF v_conta.status = 'pago' AND v_conta.agendamento_id IS NOT NULL THEN
    UPDATE public.agendamentos
       SET status = CASE WHEN status::text = 'aguardando_pagamento_adicional'
                         THEN 'finalizado'::public.status_agendamento
                         ELSE 'pago'::public.status_agendamento END
     WHERE id = v_conta.agendamento_id
       AND clinica_id = v_clinica_id
       AND status::text IN ('agendado', 'confirmado', 'aguardando',
                            'aguardando_pagamento', 'aguardando_pagamento_adicional')
    RETURNING id, exige_pagamento_previo, status::text
         INTO v_agendamento, v_exige_previo, v_status_agend;
  END IF;

  RETURN jsonb_build_object(
    'repetido',           false,
    'status',             v_conta.status,
    'valor',              v_conta.valor,
    'desconto',           COALESCE(v_conta.desconto, 0),
    'acrescimo',          COALESCE(v_conta.acrescimo, 0),
    'valor_pago',         COALESCE(v_conta.valor_pago, 0),
    'saldo',              v_saldo,
    'quitado',            v_saldo <= 0.009,
    'agendamento_id',     v_conta.agendamento_id,
    'agendamento_status', v_status_agend
  );
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_pagamento(uuid, jsonb, numeric, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_pagamento(uuid, jsonb, numeric, numeric, text, text) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011310000', ARRAY[]::text[], 'pagamentos_insercao_controlada');
COMMIT;

-- <<< 20261011310000
-- >>> 20261011330000 precos_consulta_tenant_integrity
BEGIN;

-- Preserve existing data for review while enforcing these rules on every new
-- price row and every price update from this point forward.
ALTER TABLE public.precos_consulta_convenio
  ADD CONSTRAINT precos_consulta_valor_valido
  CHECK (valor >= 0 AND valor = round(valor, 2)) NOT VALID;

ALTER TABLE public.precos_exames_convenio
  ADD CONSTRAINT precos_exames_convenio_valores_validos
  CHECK (
    valor_tabela > 0 AND valor_tabela = round(valor_tabela, 2)
    AND (valor_filme IS NULL OR (valor_filme >= 0 AND valor_filme = round(valor_filme, 2)))
    AND (valor_custo IS NULL OR (valor_custo >= 0 AND valor_custo = round(valor_custo, 2)))
    AND (valor_repasse IS NULL OR (valor_repasse >= 0 AND valor_repasse = round(valor_repasse, 2)))
  ) NOT VALID;

ALTER TABLE public.tipos_consulta
  ADD CONSTRAINT tipos_consulta_valores_validos
  CHECK (
    (valor_particular IS NULL OR (valor_particular >= 0 AND valor_particular = round(valor_particular, 2)))
    AND (duracao_minutos IS NULL OR duracao_minutos > 0)
  ) NOT VALID;

CREATE OR REPLACE FUNCTION public.validar_preco_consulta_clinica()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.clinica_id IS NULL THEN
    RAISE EXCEPTION 'O preço precisa pertencer a uma clínica.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tipos_consulta t
     WHERE t.id = NEW.tipo_consulta_id AND t.clinica_id = NEW.clinica_id
  ) THEN
    RAISE EXCEPTION 'O tipo de consulta não pertence à clínica do preço.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.convenios c
     WHERE c.id = NEW.convenio_id AND c.clinica_id = NEW.clinica_id
  ) THEN
    RAISE EXCEPTION 'O convênio não pertence à clínica do preço.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_preco_consulta_clinica() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS precos_consulta_validar_referencias ON public.precos_consulta_convenio;
CREATE TRIGGER precos_consulta_validar_referencias
  BEFORE INSERT OR UPDATE OF clinica_id, tipo_consulta_id, convenio_id
  ON public.precos_consulta_convenio
  FOR EACH ROW EXECUTE FUNCTION public.validar_preco_consulta_clinica();

-- The previous policy also accepted a NULL clinic id, which made prices
-- invisible to the tenant-scoped screens and bypassed row ownership.
DROP POLICY IF EXISTS precos_consulta_insert ON public.precos_consulta_convenio;
CREATE POLICY precos_consulta_insert ON public.precos_consulta_convenio
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_access_financial(auth.uid())
    AND clinica_id = public.get_my_clinica_id()
  );

INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011330000', ARRAY[]::text[], 'precos_consulta_tenant_integrity');
COMMIT;

-- <<< 20261011330000
-- >>> 20261011340000 equipe_privacidade_campos
BEGIN;
-- Limita colunas pessoais sensíveis nas tabelas de equipe. As telas administrativas
-- recebem os dados completos por RPC com validação de papel e clínica.

REVOKE SELECT ON TABLE public.medicos FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, nome, crm, tipo_registro, crm_uf, rqe,
  especialidade, intervalo_consulta, ativo, clinica_id
) ON TABLE public.medicos TO authenticated;
DROP POLICY IF EXISTS "medicos_select" ON public.medicos;
CREATE POLICY "medicos_select" ON public.medicos FOR SELECT TO authenticated
  USING (
    public.has_any_role(auth.uid())
    AND public.get_my_clinica_id() IS NOT NULL
    AND clinica_id = public.get_my_clinica_id()
  );

REVOKE SELECT ON TABLE public.funcionarios FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, nome, cargo, departamento, email, telefone, data_admissao,
  ativo, clinica_id, user_id, created_at, updated_at, tipo_funcionario
) ON TABLE public.funcionarios TO authenticated;

DROP POLICY IF EXISTS "anon_select_funcionarios_for_invite" ON public.funcionarios;
DROP POLICY IF EXISTS "funcionarios_select" ON public.funcionarios;
CREATE POLICY "funcionarios_select" ON public.funcionarios FOR SELECT TO authenticated
  USING (
    (public.is_admin(auth.uid()) OR user_id = auth.uid())
    AND public.get_my_clinica_id() IS NOT NULL
    AND clinica_id = public.get_my_clinica_id()
  );

DROP VIEW IF EXISTS public.funcionarios_safe;
CREATE VIEW public.funcionarios_safe
WITH (security_invoker = true)
AS
SELECT
  id, nome, cargo, departamento, email, telefone, data_admissao,
  ativo, clinica_id, user_id, created_at, updated_at, tipo_funcionario
FROM public.funcionarios;
REVOKE ALL ON public.funcionarios_safe FROM PUBLIC, anon;
GRANT SELECT ON public.funcionarios_safe TO authenticated;

CREATE OR REPLACE FUNCTION public.listar_medicos_equipe_admin()
RETURNS SETOF public.medicos
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.* FROM public.medicos AS m
  WHERE public.is_admin(auth.uid())
    AND m.clinica_id = public.get_my_clinica_id()
  ORDER BY m.nome;
$$;
REVOKE ALL ON FUNCTION public.listar_medicos_equipe_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_medicos_equipe_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.listar_funcionarios_equipe_admin()
RETURNS SETOF public.funcionarios
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT f.* FROM public.funcionarios AS f
  WHERE public.is_admin(auth.uid())
    AND f.clinica_id = public.get_my_clinica_id()
  ORDER BY f.nome;
$$;
REVOKE ALL ON FUNCTION public.listar_funcionarios_equipe_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_funcionarios_equipe_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.listar_medicos_repasse_equipe()
RETURNS TABLE (
  id uuid, nome text, crm text, tipo_repasse text,
  percentual_repasse numeric, valor_repasse_fixo numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.id, m.nome, m.crm, m.tipo_repasse, m.percentual_repasse, m.valor_repasse_fixo
  FROM public.medicos AS m
  WHERE (public.is_admin(auth.uid()) OR public.is_financeiro(auth.uid()))
    AND m.clinica_id = public.get_my_clinica_id()
    AND m.ativo IS TRUE;
$$;
REVOKE ALL ON FUNCTION public.listar_medicos_repasse_equipe() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_medicos_repasse_equipe() TO authenticated;

CREATE OR REPLACE FUNCTION public.listar_funcionarios_chat_equipe()
RETURNS TABLE (user_id uuid, cargo text, tipo_funcionario text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT f.user_id, f.cargo, f.tipo_funcionario
  FROM public.funcionarios AS f
  WHERE public.has_any_role(auth.uid())
    AND f.clinica_id = public.get_my_clinica_id()
    AND f.ativo IS TRUE
    AND f.user_id IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.listar_funcionarios_chat_equipe() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_funcionarios_chat_equipe() TO authenticated;

CREATE OR REPLACE FUNCTION public.contar_equipe_ativa()
RETURNS TABLE (funcionarios bigint, medicos bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    (SELECT count(*) FROM public.funcionarios f
      WHERE f.clinica_id = public.get_my_clinica_id() AND f.ativo IS TRUE),
    (SELECT count(*) FROM public.medicos m
      WHERE m.clinica_id = public.get_my_clinica_id() AND m.ativo IS TRUE)
  WHERE public.has_any_role(auth.uid());
$$;
REVOKE ALL ON FUNCTION public.contar_equipe_ativa() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contar_equipe_ativa() TO authenticated;

CREATE OR REPLACE FUNCTION public.buscar_medico_atual()
RETURNS TABLE (
  id uuid, nome text, crm text, crm_uf text, rqe text,
  especialidade text, foto_url text, intervalo_consulta integer, ativo boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.id, m.nome, m.crm, m.crm_uf, m.rqe, m.especialidade,
         m.foto_url, m.intervalo_consulta, m.ativo
  FROM public.medicos AS m
  WHERE public.is_medico(auth.uid())
    AND m.user_id = auth.uid()
    AND m.clinica_id = public.get_my_clinica_id()
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.buscar_medico_atual() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_medico_atual() TO authenticated;

CREATE OR REPLACE FUNCTION public.buscar_contato_medico_notificacao(p_medico_id uuid)
RETURNS TABLE (id uuid, nome text, email text, user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.id, m.nome, m.email, m.user_id
  FROM public.medicos AS m
  WHERE (
      public.is_admin(auth.uid()) OR public.is_recepcao(auth.uid())
      OR public.is_enfermagem(auth.uid())
      OR (public.is_medico(auth.uid()) AND m.user_id = auth.uid())
    )
    AND m.id = p_medico_id
    AND m.clinica_id = public.get_my_clinica_id()
    AND m.ativo IS TRUE;
$$;
REVOKE ALL ON FUNCTION public.buscar_contato_medico_notificacao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_contato_medico_notificacao(uuid) TO authenticated;
INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011340000', ARRAY[]::text[], 'equipe_privacidade_campos');
COMMIT;

-- <<< 20261011340000
-- >>> 20261011350000 whatsapp_admin_perfil
BEGIN;

-- /agente-ia is an administrator-only area. Tenant membership alone must not
-- expose patient conversations or allow staff to change the clinic's agents.
DO $$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('whatsapp_conversations'::text, 'whatsapp_conversations_select_scoped'::text),
      ('whatsapp_conversations', 'whatsapp_conversations_insert_scoped'),
      ('whatsapp_conversations', 'whatsapp_conversations_update_scoped'),
      ('whatsapp_conversations', 'whatsapp_conversations_delete_scoped'),
      ('whatsapp_messages', 'whatsapp_messages_select_scoped'),
      ('whatsapp_messages', 'whatsapp_messages_insert_scoped'),
      ('whatsapp_messages', 'whatsapp_messages_update_scoped'),
      ('whatsapp_messages', 'whatsapp_messages_delete_scoped'),
      ('whatsapp_agents', 'whatsapp_agents_select_scoped'),
      ('whatsapp_agents', 'whatsapp_agents_insert_scoped'),
      ('whatsapp_agents', 'whatsapp_agents_update_scoped'),
      ('whatsapp_agents', 'whatsapp_agents_delete_scoped'),
      ('whatsapp_sessions', 'whatsapp_sessions_select_scoped'),
      ('whatsapp_sessions', 'whatsapp_sessions_insert_scoped'),
      ('whatsapp_sessions', 'whatsapp_sessions_update_scoped'),
      ('whatsapp_sessions', 'whatsapp_sessions_delete_scoped'),
      ('whatsapp_agent_actions', 'whatsapp_agent_actions_select_scoped'),
      ('whatsapp_agent_actions', 'whatsapp_agent_actions_insert_scoped'),
      ('whatsapp_agent_actions', 'whatsapp_agent_actions_update_scoped'),
      ('whatsapp_agent_actions', 'whatsapp_agent_actions_delete_scoped'),
      ('whatsapp_notas_internas', 'whatsapp_notas_select_scoped'),
      ('whatsapp_notas_internas', 'whatsapp_notas_insert_scoped'),
      ('whatsapp_notas_internas', 'whatsapp_notas_delete_own')
    ) AS policies(table_name, policy_name)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', item.policy_name, item.table_name);
  END LOOP;
END;
$$;

CREATE POLICY whatsapp_conversations_admin_select ON public.whatsapp_conversations
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());
CREATE POLICY whatsapp_conversations_admin_insert ON public.whatsapp_conversations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());
CREATE POLICY whatsapp_conversations_admin_update ON public.whatsapp_conversations
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id())
  WITH CHECK (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());
CREATE POLICY whatsapp_conversations_admin_delete ON public.whatsapp_conversations
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());

CREATE POLICY whatsapp_messages_admin_select ON public.whatsapp_messages
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());
CREATE POLICY whatsapp_messages_admin_insert ON public.whatsapp_messages
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());
CREATE POLICY whatsapp_messages_admin_update ON public.whatsapp_messages
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id())
  WITH CHECK (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());
CREATE POLICY whatsapp_messages_admin_delete ON public.whatsapp_messages
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());

CREATE POLICY whatsapp_agents_admin_select ON public.whatsapp_agents
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());
CREATE POLICY whatsapp_agents_admin_insert ON public.whatsapp_agents
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());
CREATE POLICY whatsapp_agents_admin_update ON public.whatsapp_agents
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id())
  WITH CHECK (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());
CREATE POLICY whatsapp_agents_admin_delete ON public.whatsapp_agents
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());

CREATE POLICY whatsapp_sessions_admin_select ON public.whatsapp_sessions
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());
CREATE POLICY whatsapp_sessions_admin_insert ON public.whatsapp_sessions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());
CREATE POLICY whatsapp_sessions_admin_update ON public.whatsapp_sessions
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id())
  WITH CHECK (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());
CREATE POLICY whatsapp_sessions_admin_delete ON public.whatsapp_sessions
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());

CREATE POLICY whatsapp_agent_actions_admin_select ON public.whatsapp_agent_actions
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());
CREATE POLICY whatsapp_agent_actions_admin_insert ON public.whatsapp_agent_actions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());
CREATE POLICY whatsapp_agent_actions_admin_update ON public.whatsapp_agent_actions
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id())
  WITH CHECK (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());
CREATE POLICY whatsapp_agent_actions_admin_delete ON public.whatsapp_agent_actions
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());

CREATE POLICY whatsapp_notas_admin_select ON public.whatsapp_notas_internas
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id()
    AND EXISTS (SELECT 1 FROM public.whatsapp_conversations c
      WHERE c.id = conversation_id AND c.clinica_id = public.get_my_clinica_id()));
CREATE POLICY whatsapp_notas_admin_insert ON public.whatsapp_notas_internas
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id()
    AND autor_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.whatsapp_conversations c
      WHERE c.id = conversation_id AND c.clinica_id = public.get_my_clinica_id()));
CREATE POLICY whatsapp_notas_admin_delete ON public.whatsapp_notas_internas
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id()
    AND autor_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.whatsapp_conversations c
      WHERE c.id = conversation_id AND c.clinica_id = public.get_my_clinica_id()));

INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011350000', ARRAY[]::text[], 'whatsapp_admin_perfil');
COMMIT;

-- <<< 20261011350000
-- >>> 20261011360000 whatsapp_rpcs_admin_only
BEGIN;
-- O Agente de IA é um módulo administrativo. Como essas RPCs usam
-- SECURITY DEFINER, repetir a autorização dentro da função evita bypass da RLS.
CREATE OR REPLACE FUNCTION public.marcar_whatsapp_como_lida(_conversation_id uuid)
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
     SET nao_lidas = 0
   WHERE id = _conversation_id
     AND clinica_id = public.get_my_clinica_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversa não encontrada nesta clínica'; END IF;
END;
$$;

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
         nao_lidas = 0,
         primeira_resposta_em = COALESCE(primeira_resposta_em, now())
   WHERE id = _conversation_id
     AND clinica_id = public.get_my_clinica_id()
     AND status = 'aguardando_humano'
     AND (responsavel_id IS NULL OR responsavel_id = auth.uid());
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversa já assumida ou indisponível'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_whatsapp_como_lida(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_whatsapp_como_lida(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.assumir_conversa_whatsapp(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assumir_conversa_whatsapp(uuid) TO authenticated;
INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011360000', ARRAY[]::text[], 'whatsapp_rpcs_admin_only');
COMMIT;

-- <<< 20261011360000
-- >>> 20261011370000 impersonacao_exige_motivo
BEGIN;
CREATE OR REPLACE FUNCTION public.platform_start_impersonation(
  _target_clinica_id uuid,
  _motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current_clinica uuid;
  v_exists boolean;
  v_motivo text := btrim(coalesce(_motivo, ''));
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso negado: somente administradores da plataforma.';
  END IF;
  IF length(v_motivo) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'O motivo do acesso deve ter entre 5 e 500 caracteres.';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.clinicas WHERE id = _target_clinica_id) INTO v_exists;
  IF NOT v_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'Clínica não encontrada.');
  END IF;

  SELECT clinica_id INTO v_current_clinica FROM public.profiles WHERE id = auth.uid();

  UPDATE public.platform_impersonation_log
     SET encerrado_em = now()
   WHERE platform_admin_id = auth.uid() AND encerrado_em IS NULL;

  UPDATE public.platform_admins
     SET impersonating_clinica_id = _target_clinica_id,
         original_clinica_id = COALESCE(original_clinica_id, v_current_clinica)
   WHERE user_id = auth.uid();

  UPDATE public.profiles
     SET clinica_id = _target_clinica_id
   WHERE id = auth.uid();

  INSERT INTO public.platform_impersonation_log (
    platform_admin_id, clinica_id, motivo, iniciado_em, acoes
  ) VALUES (
    auth.uid(), _target_clinica_id, v_motivo, now(), '[]'::jsonb
  );

  RETURN jsonb_build_object('success', true, 'clinica_id', _target_clinica_id);
END;
$$;

REVOKE ALL ON FUNCTION public.platform_start_impersonation(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_start_impersonation(uuid, text) TO authenticated;
INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011370000', ARRAY[]::text[], 'impersonacao_exige_motivo');
COMMIT;

-- <<< 20261011370000
-- >>> 20261011380000 registros_pendentes_so_plataforma
BEGIN;
-- SaaS signup/payment records are platform data. Client-side clinic admins
-- must not enumerate or mutate registrations belonging to other clinics.
-- Public checkout, webhook and activation continue through service-role
-- functions / SECURITY DEFINER RPCs.

DROP POLICY IF EXISTS "admins_select_registros" ON public.registros_pendentes;
DROP POLICY IF EXISTS "anon_select_registros_by_code_v2" ON public.registros_pendentes;
DROP POLICY IF EXISTS "authenticated_update_own_registros_v2" ON public.registros_pendentes;
DROP POLICY IF EXISTS "admin_insert_registros" ON public.registros_pendentes;

CREATE POLICY "platform_admin_select_registros_pendentes"
ON public.registros_pendentes
FOR SELECT TO authenticated
USING (public.is_platform_admin());

CREATE POLICY "platform_admin_update_registros_pendentes"
ON public.registros_pendentes
FOR UPDATE TO authenticated
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

CREATE POLICY "platform_admin_insert_registros_pendentes"
ON public.registros_pendentes
FOR INSERT TO authenticated
WITH CHECK (public.is_platform_admin());

-- Keep the anonymous direct-read path explicitly closed. Signup validation
-- is performed by activate_public_registration using the invite code.
CREATE POLICY "anon_select_registros_pendentes_denied"
ON public.registros_pendentes
FOR SELECT TO anon
USING (false);
INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011380000', ARRAY[]::text[], 'registros_pendentes_so_plataforma');
COMMIT;

-- <<< 20261011380000
-- >>> 20261011390000 platform_feature_flags_admin_only
BEGIN;
-- Feature flag definitions are internal platform configuration. Clinic users
-- do not consume these rows; only platform administrators need direct reads.
DROP POLICY IF EXISTS "autenticado le flags" ON public.platform_feature_flags;
DROP POLICY IF EXISTS "plataforma le flags" ON public.platform_feature_flags;

CREATE POLICY "plataforma le flags"
ON public.platform_feature_flags
FOR SELECT TO authenticated
USING (public.is_platform_admin());
INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011390000', ARRAY[]::text[], 'platform_feature_flags_admin_only');
COMMIT;

-- <<< 20261011390000
-- >>> 20261011400000 tarefas_integridade_tenant
BEGIN;
-- Tarefas devem sempre nascer na clÃ­nica do usuÃ¡rio e com autoria verdadeira.
DROP POLICY IF EXISTS "tarefas_insert_v2" ON public.tarefas;
DROP POLICY IF EXISTS "tarefas_insert_tenant" ON public.tarefas;

CREATE POLICY "tarefas_insert_tenant" ON public.tarefas
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(auth.uid())
    AND clinica_id = public.get_my_clinica_id()
    AND criado_por = auth.uid()
  );

-- A autoria Ã© usada para limitar exclusÃ£o. Sem este guard, um usuÃ¡rio da
-- clÃ­nica poderia alterar criado_por de uma tarefa alheia e depois excluÃ­-la.
CREATE OR REPLACE FUNCTION public.impedir_alteracao_autoria_tarefa()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.criado_por IS DISTINCT FROM OLD.criado_por THEN
    RAISE EXCEPTION 'A autoria da tarefa nÃ£o pode ser alterada.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tarefas_autoria_imutavel ON public.tarefas;
CREATE TRIGGER tarefas_autoria_imutavel
  BEFORE UPDATE OF criado_por ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION public.impedir_alteracao_autoria_tarefa();
INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011400000', ARRAY[]::text[], 'tarefas_integridade_tenant');
COMMIT;

-- <<< 20261011400000
-- >>> 20261011410000 caixa_diario_pagamentos_parciais_legados
BEGIN;
-- Include legacy partial receipts in the daily cash screen and closing.
-- These rows predate the `pagamentos` child table and store the received
-- amount directly in `lancamentos.valor_pago`.
CREATE OR REPLACE FUNCTION public.movimentos_caixa_diario(p_data date)
RETURNS TABLE (
  id uuid,
  tipo text,
  descricao text,
  valor numeric,
  forma_pagamento text,
  categoria text,
  data date,
  created_at timestamptz,
  paciente_id uuid,
  paciente_nome text,
  origem_pagamento boolean
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    p.id,
    l.tipo::text,
    CASE WHEN p.estornado_em IS NULL
      THEN COALESCE(NULLIF(p.observacoes, ''), 'Pagamento: ' || l.descricao)
      ELSE 'Estorno: ' || l.descricao
    END,
    CASE WHEN p.estornado_em IS NULL THEN p.valor ELSE -p.valor END,
    p.forma_pagamento,
    l.categoria,
    (COALESCE(p.estornado_em, p.data_pagamento) AT TIME ZONE 'America/Sao_Paulo')::date,
    COALESCE(p.estornado_em, p.data_pagamento),
    l.paciente_id,
    pa.nome,
    true
  FROM public.pagamentos p
  JOIN public.lancamentos l ON l.id = p.lancamento_id
  LEFT JOIN public.pacientes pa ON pa.id = l.paciente_id
  WHERE COALESCE(p.clinica_id, l.clinica_id) = public.get_my_clinica_id()
    AND p_data IS NOT NULL
    AND (COALESCE(p.estornado_em, p.data_pagamento) AT TIME ZONE 'America/Sao_Paulo')::date = p_data
    AND p.forma_pagamento <> 'credito_paciente'
    AND (
      public.is_admin(auth.uid()) OR public.is_financeiro(auth.uid())
      OR public.is_recepcao(auth.uid())
    )

  UNION ALL

  SELECT
    l.id,
    l.tipo::text,
    l.descricao,
    CASE WHEN l.status = 'parcial' THEN COALESCE(l.valor_pago, 0)
         ELSE COALESCE(l.valor_pago, l.valor) END,
    l.forma_pagamento,
    l.categoria,
    COALESCE(l.data_pagamento, l.data),
    CASE WHEN l.data_pagamento IS NOT NULL THEN l.updated_at ELSE l.created_at END,
    l.paciente_id,
    pa.nome,
    false
  FROM public.lancamentos l
  LEFT JOIN public.pacientes pa ON pa.id = l.paciente_id
  WHERE l.clinica_id = public.get_my_clinica_id()
    AND COALESCE(l.data_pagamento, l.data) = p_data
    AND l.status IN ('pago', 'parcial')
    AND (l.status <> 'parcial' OR COALESCE(l.valor_pago, 0) > 0)
    AND l.tipo IN ('receita', 'despesa', 'sangria', 'suprimento')
    AND NOT EXISTS (
      SELECT 1 FROM public.pagamentos p WHERE p.lancamento_id = l.id
    )
    AND (
      public.is_admin(auth.uid()) OR public.is_financeiro(auth.uid())
      OR public.is_recepcao(auth.uid())
    )
  ORDER BY 8 DESC;
$$;

REVOKE ALL ON FUNCTION public.movimentos_caixa_diario(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.movimentos_caixa_diario(date) TO authenticated;
INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011410000', ARRAY[]::text[], 'caixa_diario_pagamentos_parciais_legados');
COMMIT;

-- <<< 20261011410000
-- >>> 20261011420000 precos_exames_config_access
BEGIN;

-- Keep the established shared-configuration access model, while aligning the
-- particular exam price table with the admin/finance roles shown by the app.
DROP POLICY IF EXISTS config_insert ON public.configuracoes_clinica;
CREATE POLICY config_insert ON public.configuracoes_clinica
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (clinica_id IS NULL OR public.is_same_clinica(clinica_id))
  AND (
    NOT public.chave_config_da_clinica(chave)
    OR (chave = 'precos_exames_internos' AND public.can_access_financial(auth.uid()))
    OR public.is_admin(auth.uid())
  )
);

DROP POLICY IF EXISTS config_update ON public.configuracoes_clinica;
CREATE POLICY config_update ON public.configuracoes_clinica
FOR UPDATE TO authenticated
USING (
  (user_id = auth.uid() AND NOT public.chave_config_da_clinica(chave))
  OR (
    clinica_id IS NOT NULL
    AND public.chave_config_da_clinica(chave)
    AND public.is_same_clinica(clinica_id)
    AND (
      (chave = 'precos_exames_internos' AND public.can_access_financial(auth.uid()))
      OR public.is_admin(auth.uid())
    )
  )
)
WITH CHECK (
  (user_id = auth.uid() AND NOT public.chave_config_da_clinica(chave))
  OR (
    clinica_id IS NOT NULL
    AND public.chave_config_da_clinica(chave)
    AND public.is_same_clinica(clinica_id)
    AND (
      (chave = 'precos_exames_internos' AND public.can_access_financial(auth.uid()))
      OR public.is_admin(auth.uid())
    )
  )
);

INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011420000', ARRAY[]::text[], 'precos_exames_config_access');
COMMIT;

-- <<< 20261011420000
-- >>> 20261011430000 automacao_envios_claims
BEGIN;
CREATE TABLE IF NOT EXISTS public.automation_delivery_claims (
  id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  chave text NOT NULL CHECK (length(chave) BETWEEN 1 AND 240),
  estado text NOT NULL DEFAULT 'claimed' CHECK (estado IN ('claimed', 'completed', 'uncertain')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinica_id, chave)
);

ALTER TABLE public.automation_delivery_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_delivery_claims FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_delivery_claims TO service_role;
GRANT SELECT ON public.automation_delivery_claims TO authenticated;
DROP POLICY IF EXISTS automation_delivery_claims_admin_read ON public.automation_delivery_claims;
CREATE POLICY automation_delivery_claims_admin_read
  ON public.automation_delivery_claims FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) AND public.is_same_clinica(clinica_id));

CREATE OR REPLACE FUNCTION public.claim_automation_delivery(p_clinica_id uuid, p_chave text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
  END IF;
  IF p_clinica_id IS NULL OR p_chave IS NULL OR length(p_chave) NOT BETWEEN 1 AND 240 THEN
    RAISE EXCEPTION 'invalid automation delivery claim';
  END IF;

  -- A crashed sender is never retried automatically because its provider result
  -- may be unknown. Convert stale reservations into a visible review state.
  UPDATE public.automation_delivery_claims
  SET estado = 'uncertain', atualizado_em = now()
  WHERE clinica_id = p_clinica_id AND chave = p_chave
    AND estado = 'claimed' AND criado_em < now() - interval '10 minutes';

  INSERT INTO public.automation_delivery_claims (clinica_id, chave)
  VALUES (p_clinica_id, p_chave)
  ON CONFLICT (clinica_id, chave) DO NOTHING;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_automation_delivery(
  p_clinica_id uuid,
  p_chave text,
  p_estado text DEFAULT 'completed'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
  END IF;
  IF p_estado NOT IN ('completed', 'uncertain') THEN
    RAISE EXCEPTION 'invalid terminal claim state';
  END IF;

  UPDATE public.automation_delivery_claims
  SET estado = p_estado, atualizado_em = now()
  WHERE clinica_id = p_clinica_id AND chave = p_chave AND estado = 'claimed';
END;
$$;

CREATE OR REPLACE FUNCTION public.release_automation_delivery(p_clinica_id uuid, p_chave text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.automation_delivery_claims
  WHERE clinica_id = p_clinica_id AND chave = p_chave AND estado = 'claimed';
END;
$$;

REVOKE ALL ON FUNCTION public.claim_automation_delivery(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_automation_delivery(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_automation_delivery(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_automation_delivery(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_automation_delivery(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_automation_delivery(uuid, text) TO service_role;
INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011430000', ARRAY[]::text[], 'automacao_envios_claims');
COMMIT;

-- <<< 20261011430000
-- >>> 20261011440000 fila_notificacoes_resultado_incerto
BEGIN;
ALTER TABLE public.notification_queue
  DROP CONSTRAINT IF EXISTS notification_queue_status_check;

ALTER TABLE public.notification_queue
  ADD CONSTRAINT notification_queue_status_check
  CHECK (status IN ('pendente', 'enviando', 'enviado', 'erro', 'cancelado', 'incerto'));

CREATE OR REPLACE FUNCTION public.reivindicar_notificacoes(p_limite integer DEFAULT 50, p_clinica_id uuid DEFAULT NULL)
RETURNS SETOF public.notification_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Um item abandonado durante uma chamada externa pode ter sido entregue.
  -- Mantê-lo fora da fila evita reenvio sem confirmação do provedor.
  UPDATE public.notification_queue
     SET status = 'incerto',
         erro_mensagem = 'Processamento interrompido após possível envio; verifique o provedor antes de repetir',
         ultimo_erro_em = now(), iniciado_em = NULL
   WHERE status = 'enviando' AND iniciado_em < now() - interval '10 minutes'
     AND (p_clinica_id IS NULL OR clinica_id = p_clinica_id);

  RETURN QUERY
  WITH candidatas AS (
    SELECT q.id FROM public.notification_queue q
     WHERE q.status = 'pendente' AND q.agendado_para <= now()
       AND q.tentativas < q.max_tentativas
       AND (p_clinica_id IS NULL OR q.clinica_id = p_clinica_id)
     ORDER BY q.agendado_para, q.created_at FOR UPDATE SKIP LOCKED
     LIMIT LEAST(GREATEST(COALESCE(p_limite, 50), 1), 100)
  )
  UPDATE public.notification_queue q
     SET status = 'enviando', tentativas = q.tentativas + 1, iniciado_em = now()
    FROM candidatas c WHERE q.id = c.id RETURNING q.*;
END;
$$;

REVOKE ALL ON FUNCTION public.reivindicar_notificacoes(integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reivindicar_notificacoes(integer, uuid) TO service_role;
INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011440000', ARRAY[]::text[], 'fila_notificacoes_resultado_incerto');
COMMIT;

-- <<< 20261011440000
-- >>> 20261011450000 agendamento_bloqueia_remarcacao_em_andamento
BEGIN;
CREATE OR REPLACE FUNCTION public.impedir_remarcacao_agendamento_em_andamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF ROW(NEW.data, NEW.hora_inicio, NEW.hora_fim, NEW.medico_id, NEW.sala_id)
       IS DISTINCT FROM ROW(OLD.data, OLD.hora_inicio, OLD.hora_fim, OLD.medico_id, OLD.sala_id)
     AND OLD.status::text NOT IN ('agendado', 'confirmado', 'aguardando') THEN
    RAISE EXCEPTION 'Agendamento nao pode ser remarcado apos o inicio do atendimento.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.impedir_remarcacao_agendamento_em_andamento() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS agendamentos_impedir_remarcacao_em_andamento ON public.agendamentos;
CREATE TRIGGER agendamentos_impedir_remarcacao_em_andamento
  BEFORE UPDATE OF data, hora_inicio, hora_fim, medico_id, sala_id ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.impedir_remarcacao_agendamento_em_andamento();
INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011450000', ARRAY[]::text[], 'agendamento_bloqueia_remarcacao_em_andamento');
COMMIT;

-- <<< 20261011450000
-- >>> 20261011460000 convenios_codigo_por_clinica
BEGIN;

-- O código interno pertence ao catálogo de cada clínica, não ao sistema inteiro.
-- Mantém também a unicidade dos registros legados sem clínica associada.
LOCK TABLE public.convenios IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.convenios
  DROP CONSTRAINT IF EXISTS convenios_codigo_key;

CREATE UNIQUE INDEX IF NOT EXISTS convenios_clinica_codigo_key
  ON public.convenios (clinica_id, codigo)
  WHERE clinica_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS convenios_codigo_sem_clinica_key
  ON public.convenios (codigo)
  WHERE clinica_id IS NULL;

INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011460000', ARRAY[]::text[], 'convenios_codigo_por_clinica');
COMMIT;

-- <<< 20261011460000
-- >>> 20261011470000 exame_vinculo_prontuario
BEGIN;

ALTER TABLE public.exames
  ADD COLUMN IF NOT EXISTS prontuario_id uuid REFERENCES public.prontuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_exames_prontuario_id
  ON public.exames (prontuario_id)
  WHERE prontuario_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validar_referencia_prontuario_exame()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prontuario_clinica uuid;
  v_prontuario_paciente uuid;
  v_medico_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND public.is_medico(auth.uid()) THEN
    SELECT m.id
      INTO v_medico_id
      FROM public.medicos m
     WHERE m.user_id = auth.uid()
       AND m.clinica_id = NEW.clinica_id
     LIMIT 1;

    IF v_medico_id IS NULL
       OR NEW.medico_solicitante_id IS DISTINCT FROM v_medico_id THEN
      RAISE EXCEPTION 'O médico solicitante deve corresponder ao profissional autenticado.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.prontuario_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.clinica_id, p.paciente_id
    INTO v_prontuario_clinica, v_prontuario_paciente
    FROM public.prontuarios p
   WHERE p.id = NEW.prontuario_id
   FOR SHARE;

  IF NOT FOUND
     OR NEW.paciente_id IS DISTINCT FROM v_prontuario_paciente
     OR NEW.clinica_id IS DISTINCT FROM v_prontuario_clinica THEN
    RAISE EXCEPTION 'O prontuário do exame não corresponde ao paciente e à clínica.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_referencia_prontuario_exame() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS exames_validar_referencia_prontuario ON public.exames;
CREATE TRIGGER exames_validar_referencia_prontuario
  BEFORE INSERT OR UPDATE OF prontuario_id, paciente_id, clinica_id, medico_solicitante_id ON public.exames
  FOR EACH ROW EXECUTE FUNCTION public.validar_referencia_prontuario_exame();

COMMENT ON COLUMN public.exames.prontuario_id IS
  'Evolução clínica que originou a solicitação; deve pertencer ao mesmo paciente e à mesma clínica.';

INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('20261011470000', ARRAY[]::text[], 'exame_vinculo_prontuario');
COMMIT;

-- <<< 20261011470000
