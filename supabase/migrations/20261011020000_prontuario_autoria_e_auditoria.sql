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

COMMIT;
