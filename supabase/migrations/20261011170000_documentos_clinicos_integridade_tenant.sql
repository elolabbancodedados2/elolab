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

COMMIT;
