ALTER TABLE public.whatsapp_agents
  ADD COLUMN IF NOT EXISTS habilidades TEXT[];

UPDATE public.whatsapp_agents
SET habilidades = CASE
  WHEN tipo = 'triagem' THEN ARRAY['registrar_triagem']::TEXT[]
  WHEN tipo = 'agendamento' THEN ARRAY[
    'consultar_disponibilidade',
    'criar_agendamento',
    'consultar_agendamentos_paciente'
  ]::TEXT[]
  ELSE ARRAY[
    'consultar_disponibilidade',
    'criar_agendamento',
    'consultar_agendamentos_paciente'
  ]::TEXT[]
END
WHERE habilidades IS NULL OR cardinality(habilidades) = 0;

ALTER TABLE public.whatsapp_agents
  ALTER COLUMN habilidades SET DEFAULT ARRAY[
    'consultar_disponibilidade',
    'criar_agendamento',
    'consultar_agendamentos_paciente'
  ]::TEXT[],
  ALTER COLUMN habilidades SET NOT NULL;

ALTER TABLE public.whatsapp_agents
  DROP CONSTRAINT IF EXISTS whatsapp_agents_habilidades_validas;

ALTER TABLE public.whatsapp_agents
  ADD CONSTRAINT whatsapp_agents_habilidades_validas CHECK (
    cardinality(habilidades) > 0
    AND habilidades <@ ARRAY[
      'consultar_disponibilidade',
      'criar_agendamento',
      'consultar_agendamentos_paciente',
      'cancelar_agendamento',
      'reagendar_agendamento',
      'registrar_triagem'
    ]::TEXT[]
  );

ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS acao_pendente JSONB;

COMMENT ON COLUMN public.whatsapp_agents.habilidades IS
  'Ações que o agente pode executar. Transferência para humano é sempre habilitada e não pode ser removida.';

COMMENT ON COLUMN public.whatsapp_conversations.acao_pendente IS
  'Ação de agenda aguardando confirmação explícita do paciente pelo WhatsApp.';
