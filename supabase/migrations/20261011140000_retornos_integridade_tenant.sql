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

COMMIT;
