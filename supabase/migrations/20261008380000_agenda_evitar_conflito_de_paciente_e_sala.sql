-- Evita reservar o mesmo paciente ou a mesma sala em atendimentos simultâneos.
-- Locks consultivos por recurso e dia deixam a validação segura mesmo quando
-- duas recepções salvam ao mesmo tempo. Conflitos antigos não são apagados;
-- eles só bloqueiam novas reservas sobrepostas e podem ser corrigidos pela UI.

BEGIN;

CREATE OR REPLACE FUNCTION public.evitar_conflito_de_recurso_agendamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lock bigint;
  v_intervalo tsrange;
BEGIN
  -- Edições administrativas sem mudança de horário ou recurso não devem ser
  -- impedidas por conflitos antigos que já existam na agenda.
  IF TG_OP = 'UPDATE'
     AND OLD.paciente_id IS NOT DISTINCT FROM NEW.paciente_id
     AND OLD.sala_id IS NOT DISTINCT FROM NEW.sala_id
     AND OLD.data IS NOT DISTINCT FROM NEW.data
     AND OLD.hora_inicio IS NOT DISTINCT FROM NEW.hora_inicio
     AND OLD.hora_fim IS NOT DISTINCT FROM NEW.hora_fim
     AND (
       (OLD.status IS DISTINCT FROM 'cancelado'::public.status_agendamento
        AND OLD.status IS DISTINCT FROM 'faltou'::public.status_agendamento
        AND NEW.status IS DISTINCT FROM 'cancelado'::public.status_agendamento
        AND NEW.status IS DISTINCT FROM 'faltou'::public.status_agendamento)
       OR
       (OLD.status IN ('cancelado', 'faltou') AND NEW.status IN ('cancelado', 'faltou'))
     ) THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelado' OR NEW.status = 'faltou' THEN
    RETURN NEW;
  END IF;

  v_intervalo := tsrange(
    (NEW.data + NEW.hora_inicio)::timestamp,
    (NEW.data + COALESCE(NEW.hora_fim, NEW.hora_inicio + interval '30 minutes'))::timestamp,
    '[)'
  );

  -- Adquire locks em ordem estável para impedir corrida e evitar deadlocks
  -- quando o mesmo atendimento reserva paciente e sala.
  FOR v_lock IN
    SELECT DISTINCT hashtextextended(recurso.chave, 0)
      FROM (VALUES
        (CASE WHEN NEW.paciente_id IS NOT NULL THEN 'paciente:' || NEW.paciente_id::text || ':' || NEW.data::text END),
        (CASE WHEN NEW.sala_id IS NOT NULL THEN 'sala:' || NEW.sala_id::text || ':' || NEW.data::text END)
      ) AS recurso(chave)
     WHERE recurso.chave IS NOT NULL
     ORDER BY 1
  LOOP
    PERFORM pg_advisory_xact_lock(v_lock);
  END LOOP;

  IF NEW.paciente_id IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.agendamentos a
     WHERE a.id IS DISTINCT FROM NEW.id
       AND a.clinica_id IS NOT DISTINCT FROM NEW.clinica_id
       AND a.paciente_id = NEW.paciente_id
       AND a.data = NEW.data
       AND a.status IS DISTINCT FROM 'cancelado'::public.status_agendamento
       AND a.status IS DISTINCT FROM 'faltou'::public.status_agendamento
       AND tsrange(
         (a.data + a.hora_inicio)::timestamp,
         (a.data + COALESCE(a.hora_fim, a.hora_inicio + interval '30 minutes'))::timestamp,
         '[)'
       ) && v_intervalo
  ) THEN
    RAISE EXCEPTION 'AGENDA_RECURSO_CONFLITO: paciente já possui atendimento neste horário.'
      USING ERRCODE = '23P01';
  END IF;

  IF NEW.sala_id IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.agendamentos a
     WHERE a.id IS DISTINCT FROM NEW.id
       AND a.clinica_id IS NOT DISTINCT FROM NEW.clinica_id
       AND a.sala_id = NEW.sala_id
       AND a.data = NEW.data
       AND a.status IS DISTINCT FROM 'cancelado'::public.status_agendamento
       AND a.status IS DISTINCT FROM 'faltou'::public.status_agendamento
       AND tsrange(
         (a.data + a.hora_inicio)::timestamp,
         (a.data + COALESCE(a.hora_fim, a.hora_inicio + interval '30 minutes'))::timestamp,
         '[)'
       ) && v_intervalo
  ) THEN
    RAISE EXCEPTION 'AGENDA_RECURSO_CONFLITO: sala já reservada neste horário.'
      USING ERRCODE = '23P01';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.evitar_conflito_de_recurso_agendamento() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_agendamentos_sem_conflito_de_recurso ON public.agendamentos;
CREATE TRIGGER trg_agendamentos_sem_conflito_de_recurso
  BEFORE INSERT OR UPDATE ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.evitar_conflito_de_recurso_agendamento();

COMMENT ON FUNCTION public.evitar_conflito_de_recurso_agendamento() IS
  'Impede sobreposição de consultas para o mesmo paciente ou sala, inclusive em gravações concorrentes.';

COMMIT;
