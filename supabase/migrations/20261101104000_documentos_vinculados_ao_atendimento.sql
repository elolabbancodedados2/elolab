-- Atestados e encaminhamentos feitos a partir do atendimento passam a guardar
-- o agendamento de origem. Antes ficavam soltos: não apareciam no resumo do
-- atendimento nem dava para saber em que consulta foram emitidos.

ALTER TABLE public.atestados
  ADD COLUMN IF NOT EXISTS agendamento_id uuid REFERENCES public.agendamentos(id) ON DELETE SET NULL;
ALTER TABLE public.encaminhamentos
  ADD COLUMN IF NOT EXISTS agendamento_id uuid REFERENCES public.agendamentos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS atestados_agendamento_idx ON public.atestados (agendamento_id) WHERE agendamento_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS encaminhamentos_agendamento_idx ON public.encaminhamentos (agendamento_id) WHERE agendamento_id IS NOT NULL;

-- O agendamento precisa ser da mesma clínica e do mesmo paciente do documento.
CREATE OR REPLACE FUNCTION public.validar_agendamento_do_documento()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_clinica uuid;
  v_paciente uuid;
BEGIN
  IF NEW.agendamento_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.agendamento_id IS NOT DISTINCT FROM OLD.agendamento_id THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.agendamento_id IS NOT NULL THEN
    RAISE EXCEPTION 'O atendimento de origem do documento não pode ser trocado.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT clinica_id, paciente_id INTO v_clinica, v_paciente
    FROM public.agendamentos WHERE id = NEW.agendamento_id FOR SHARE;
  IF NOT FOUND OR v_clinica IS DISTINCT FROM NEW.clinica_id OR v_paciente IS DISTINCT FROM NEW.paciente_id THEN
    RAISE EXCEPTION 'O atendimento informado não corresponde à clínica e ao paciente do documento.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_agendamento_atestado ON public.atestados;
CREATE TRIGGER trg_validar_agendamento_atestado
  BEFORE INSERT OR UPDATE OF agendamento_id ON public.atestados
  FOR EACH ROW EXECUTE FUNCTION public.validar_agendamento_do_documento();

DROP TRIGGER IF EXISTS trg_validar_agendamento_encaminhamento ON public.encaminhamentos;
CREATE TRIGGER trg_validar_agendamento_encaminhamento
  BEFORE INSERT OR UPDATE OF agendamento_id ON public.encaminhamentos
  FOR EACH ROW EXECUTE FUNCTION public.validar_agendamento_do_documento();
