-- Consultas com falta ou canceladas não devem continuar bloqueando a agenda.
-- A constraint anterior passou a liberar apenas 'cancelado' e acabou
-- divergindo da regra da agenda e da consulta de disponibilidade do agente.
BEGIN;

ALTER TABLE public.agendamentos
  DROP CONSTRAINT IF EXISTS agendamentos_sem_sobreposicao;

ALTER TABLE public.agendamentos
  ADD CONSTRAINT agendamentos_sem_sobreposicao
  EXCLUDE USING gist (
    medico_id WITH =,
    data WITH =,
    tsrange(
      (data + hora_inicio)::timestamp,
      (data + COALESCE(hora_fim, hora_inicio + interval '30 minutes'))::timestamp,
      '[)'
    ) WITH &&
  )
  WHERE (
    medico_id IS NOT NULL
    AND status IS DISTINCT FROM 'cancelado'::public.status_agendamento
    AND status IS DISTINCT FROM 'faltou'::public.status_agendamento
  );

COMMENT ON CONSTRAINT agendamentos_sem_sobreposicao ON public.agendamentos IS
  'Impede sobreposição de horários por médico; agendamentos cancelados ou com falta não reservam horário.';

COMMIT;
