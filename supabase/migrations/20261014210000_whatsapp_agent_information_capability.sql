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
