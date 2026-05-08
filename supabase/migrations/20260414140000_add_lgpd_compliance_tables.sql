-- LGPD Compliance Tables
-- Registro de consentimentos e requisições de direitos do paciente

-- Tabela de consentimento LGPD
CREATE TABLE IF NOT EXISTS lgpd_consent_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL CHECK (consent_type IN ('data_processing', 'marketing', 'third_party', 'revocation')),
  accepted BOOLEAN NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de solicitações de exclusão (direito ao esquecimento)
CREATE TABLE IF NOT EXISTS lgpd_deletion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL,
  deleted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reason TEXT,
  deleted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de requisições de acesso aos dados (LGPD Art. 18)
CREATE TABLE IF NOT EXISTS lgpd_access_request_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL REFERENCES pacientes(id),
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  request_type TEXT NOT NULL CHECK (request_type IN ('export', 'access', 'correction')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fulfilled', 'denied')),
  fulfillment_date TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes para performance
CREATE INDEX IF NOT EXISTS idx_lgpd_consent_log_paciente_id ON lgpd_consent_log(paciente_id);
CREATE INDEX IF NOT EXISTS idx_lgpd_consent_log_timestamp ON lgpd_consent_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_lgpd_deletion_log_paciente_id ON lgpd_deletion_log(paciente_id);
CREATE INDEX IF NOT EXISTS idx_lgpd_access_request_log_paciente_id ON lgpd_access_request_log(paciente_id);
CREATE INDEX IF NOT EXISTS idx_lgpd_access_request_log_status ON lgpd_access_request_log(status);

-- RLS Policies
ALTER TABLE lgpd_consent_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE lgpd_deletion_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE lgpd_access_request_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Paciente pode ver seu próprio histórico de consentimento"
  ON lgpd_consent_log FOR SELECT
  USING (
    paciente_id = (
      SELECT id FROM pacientes WHERE id = paciente_id
      AND clinica_id = (SELECT clinica_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Admin pode ver histórico de consentimento da clínica"
  ON lgpd_consent_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND has_role(auth.uid(), 'admin')
      AND clinica_id = (SELECT clinica_id FROM pacientes WHERE id = paciente_id)
    )
  );

-- Comments para documentação
COMMENT ON TABLE lgpd_consent_log IS 'Registro de consentimentos LGPD (processamento, marketing, terceiros)';
COMMENT ON TABLE lgpd_deletion_log IS 'Log de exclusões de dados (direito ao esquecimento)';
COMMENT ON TABLE lgpd_access_request_log IS 'Log de requisições de acesso, exportação ou correção de dados';
