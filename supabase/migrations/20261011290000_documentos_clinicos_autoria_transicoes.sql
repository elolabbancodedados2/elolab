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

COMMIT;
