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

COMMIT;
