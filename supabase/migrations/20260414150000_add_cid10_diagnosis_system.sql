-- CID-10 Diagnosis System
-- Suporte para diagnósticos estruturados com CID-10

-- Tabela de CID-10 (referência)
CREATE TABLE IF NOT EXISTS cid10_codigos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT, -- 'A00–B99', 'C00–D49', etc.
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cid10_codigo ON cid10_codigos(codigo);
CREATE INDEX IF NOT EXISTS idx_cid10_nome ON cid10_codigos(nome);
CREATE INDEX IF NOT EXISTS idx_cid10_categoria ON cid10_codigos(categoria);

-- Tabela de Diagnósticos do Prontuário
CREATE TABLE IF NOT EXISTS prontuario_diagnosticos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prontuario_id UUID NOT NULL REFERENCES prontuarios(id) ON DELETE CASCADE,
  cid10_id UUID REFERENCES cid10_codigos(id),
  codigo_cid TEXT NOT NULL,
  descricao TEXT NOT NULL,
  tipo TEXT CHECK (tipo IN ('principal', 'secundario', 'diferencial')) DEFAULT 'secundario',
  confirmado BOOLEAN DEFAULT false,
  data_confirmacao TIMESTAMP WITH TIME ZONE,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE prontuario_diagnosticos ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_prontuario_diagnosticos_prontuario_id ON prontuario_diagnosticos(prontuario_id);
CREATE INDEX IF NOT EXISTS idx_prontuario_diagnosticos_cid10_id ON prontuario_diagnosticos(cid10_id);
CREATE INDEX IF NOT EXISTS idx_prontuario_diagnosticos_tipo ON prontuario_diagnosticos(tipo);

-- Tabela de Comorbidades do Paciente
CREATE TABLE IF NOT EXISTS paciente_comorbidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  cid10_id UUID REFERENCES cid10_codigos(id),
  codigo_cid TEXT NOT NULL,
  descricao TEXT NOT NULL,
  data_diagnostico DATE,
  ativo BOOLEAN DEFAULT true,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE paciente_comorbidades ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_paciente_comorbidades_paciente_id ON paciente_comorbidades(paciente_id);
CREATE INDEX IF NOT EXISTS idx_paciente_comorbidades_cid10_id ON paciente_comorbidades(cid10_id);

-- Adicionar coluna diagnóstico_principal ao prontuarios
ALTER TABLE prontuarios
ADD COLUMN IF NOT EXISTS diagnostico_principal_cid TEXT,
ADD COLUMN IF NOT EXISTS diagnosticos_count INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_prontuarios_diagnostico_principal_cid ON prontuarios(diagnostico_principal_cid);

-- RLS Policies
CREATE POLICY "Paciente pode ver diagnósticos de seu prontuário"
  ON prontuario_diagnosticos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM prontuarios p
      WHERE p.id = prontuario_id
      AND p.paciente_id = (SELECT id FROM pacientes WHERE id = (SELECT paciente_id FROM prontuarios WHERE id = p.id))
    )
  );

CREATE POLICY "Admin pode ver diagnósticos de pacientes da clínica"
  ON prontuario_diagnosticos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND has_role(auth.uid(), 'admin')
    )
  );

-- Comments
COMMENT ON TABLE cid10_codigos IS 'Referência de códigos CID-10 para diagnósticos';
COMMENT ON TABLE prontuario_diagnosticos IS 'Diagnósticos estruturados em CID-10 para cada prontuário';
COMMENT ON TABLE paciente_comorbidades IS 'Histórico de comorbidades do paciente em CID-10';
COMMENT ON COLUMN prontuario_diagnosticos.tipo IS 'Tipo de diagnóstico: principal (resultado), secundário (relacionado), diferencial (descartado)';
