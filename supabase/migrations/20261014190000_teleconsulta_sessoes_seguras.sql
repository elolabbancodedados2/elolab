-- Teleconsulta com credencial descartável e sinalização curta. Mídia nunca é gravada.
ALTER TABLE public.agendamentos DROP CONSTRAINT IF EXISTS agendamentos_tipo_check;
ALTER TABLE public.agendamentos ADD CONSTRAINT agendamentos_tipo_check CHECK (tipo = ANY (ARRAY[
  'consulta'::text, 'retorno'::text, 'exame'::text, 'procedimento'::text, 'telemedicina'::text,
  'checkup'::text, 'avaliacao'::text, 'cirurgia'::text, 'triagem'::text,
  'coleta'::text, 'enfermagem'::text, 'vacina'::text, 'curativo'::text
]));

CREATE TABLE public.teleconsulta_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  agendamento_id uuid NOT NULL REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  medico_id uuid NOT NULL REFERENCES public.medicos(id),
  guest_token_hash text NOT NULL UNIQUE CHECK (guest_token_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'closed', 'expired')),
  expires_at timestamptz NOT NULL,
  provider_consented_at timestamptz,
  guest_consented_at timestamptz,
  provider_last_seen_at timestamptz,
  guest_last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  UNIQUE (agendamento_id)
);
CREATE INDEX teleconsulta_sessions_expiry_idx ON public.teleconsulta_sessions (expires_at) WHERE status IN ('waiting', 'active');
ALTER TABLE public.teleconsulta_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.teleconsulta_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.teleconsulta_sessions TO service_role;

CREATE TABLE public.teleconsulta_signals (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.teleconsulta_sessions(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('provider', 'guest')),
  signal_type text NOT NULL CHECK (signal_type IN ('offer', 'answer', 'ice-candidate')),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX teleconsulta_signals_poll_idx ON public.teleconsulta_signals (session_id, id);
ALTER TABLE public.teleconsulta_signals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.teleconsulta_signals FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.teleconsulta_signals TO service_role;

-- Sinais são efêmeros; invocado pela função na leitura/polling. Sem extensão/cron obrigatório.
COMMENT ON TABLE public.teleconsulta_signals IS 'SDP/ICE temporários; expurgados pela Edge Function após leitura ou encerramento. Não contém gravação, transcrição ou texto clínico.';
