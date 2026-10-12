BEGIN;

-- Stage the WhatsApp agent schema without reading or rewriting existing rows.
-- Existing NULL capabilities deliberately mean no automated actions until an
-- administrator configures them. A later, authorized data migration can set
-- per-agent capabilities based on `tipo`.
ALTER TABLE public.whatsapp_agents
  ADD COLUMN IF NOT EXISTS habilidades TEXT[];

ALTER TABLE public.whatsapp_agents
  ALTER COLUMN habilidades SET DEFAULT ARRAY[
    'consultar_disponibilidade',
    'criar_agendamento',
    'consultar_agendamentos_paciente'
  ]::TEXT[];

ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS acao_pendente JSONB;

ALTER TABLE public.whatsapp_agents
  DROP CONSTRAINT IF EXISTS whatsapp_agents_habilidades_validas;

ALTER TABLE public.whatsapp_agents
  ADD CONSTRAINT whatsapp_agents_habilidades_validas CHECK (
    habilidades IS NULL OR (
      cardinality(habilidades) > 0
      AND habilidades <@ ARRAY[
        'consultar_disponibilidade',
        'criar_agendamento',
        'consultar_agendamentos_paciente',
        'cancelar_agendamento',
        'reagendar_agendamento',
        'registrar_triagem'
      ]::TEXT[]
    )
  ) NOT VALID;

COMMENT ON COLUMN public.whatsapp_agents.habilidades IS
  'Acoes habilitadas para o agente. NULL desabilita acoes ate configuracao administrativa.';

COMMENT ON COLUMN public.whatsapp_conversations.acao_pendente IS
  'Acao de agenda aguardando confirmacao explicita do paciente pelo WhatsApp.';

COMMIT;
