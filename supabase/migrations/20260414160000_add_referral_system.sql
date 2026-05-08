-- Referral/Encaminhamento System with Status Tracking
-- Sistema de encaminhamentos entre profissionais e especialidades

-- Tabela de Encaminhamentos
CREATE TABLE IF NOT EXISTS encaminhamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  prontuario_id UUID REFERENCES prontuarios(id) ON DELETE SET NULL,
  medico_solicitante_id UUID NOT NULL REFERENCES medicos(id),
  medico_destino_id UUID REFERENCES medicos(id),
  especialidade_destino TEXT NOT NULL, -- 'cardiologia', 'oftalmologia', etc
  clinica_destino TEXT, -- Nome da clínica/hospital para referências externas
  motivo TEXT NOT NULL,
  descricao_clinica TEXT,
  urgencia TEXT CHECK (urgencia IN ('rotina', 'preferencial', 'urgente')) DEFAULT 'rotina',
  status TEXT CHECK (status IN ('enviado', 'recebido', 'em_andamento', 'concluido', 'cancelado')) DEFAULT 'enviado',
  data_solicitacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  data_recebimento TIMESTAMP WITH TIME ZONE,
  data_conclusao TIMESTAMP WITH TIME ZONE,
  data_cancelamento TIMESTAMP WITH TIME ZONE,
  motivo_cancelamento TEXT,
  resultado_encaminhamento TEXT,
  observacoes_retorno TEXT,
  arquivo_resultado TEXT, -- URL ou referência a arquivo externo
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE encaminhamentos ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_encaminhamentos_paciente_id ON encaminhamentos(paciente_id);
CREATE INDEX IF NOT EXISTS idx_encaminhamentos_medico_solicitante_id ON encaminhamentos(medico_solicitante_id);
CREATE INDEX IF NOT EXISTS idx_encaminhamentos_medico_destino_id ON encaminhamentos(medico_destino_id);
CREATE INDEX IF NOT EXISTS idx_encaminhamentos_status ON encaminhamentos(status);
CREATE INDEX IF NOT EXISTS idx_encaminhamentos_especialidade_destino ON encaminhamentos(especialidade_destino);
CREATE INDEX IF NOT EXISTS idx_encaminhamentos_data_solicitacao ON encaminhamentos(data_solicitacao DESC);

-- Tabela de Histórico de Status (auditoria)
CREATE TABLE IF NOT EXISTS encaminhamento_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encaminhamento_id UUID NOT NULL REFERENCES encaminhamentos(id) ON DELETE CASCADE,
  status_anterior TEXT,
  status_novo TEXT NOT NULL,
  usuario_id UUID REFERENCES auth.users(id),
  comentario TEXT,
  data_mudanca TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_encaminhamento_status_history_encaminhamento_id ON encaminhamento_status_history(encaminhamento_id);
CREATE INDEX IF NOT EXISTS idx_encaminhamento_status_history_data_mudanca ON encaminhamento_status_history(data_mudanca DESC);

-- Tabela de Especialidades de Destino
CREATE TABLE IF NOT EXISTS especialidades_destino (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  descricao TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_especialidades_destino_codigo ON especialidades_destino(codigo);

-- Dados de especialidades comuns
INSERT INTO especialidades_destino (codigo, nome, descricao) VALUES
  ('cardio', 'Cardiologia', 'Doenças do coração e circulatório'),
  ('oftalmo', 'Oftalmologia', 'Doenças dos olhos'),
  ('neuro', 'Neurologia', 'Doenças do sistema nervoso'),
  ('ortopedia', 'Ortopedia', 'Doenças dos ossos e articulações'),
  ('psiquiatria', 'Psiquiatria', 'Transtornos mentais'),
  ('reumatologia', 'Reumatologia', 'Doenças articulares e inflamatórias'),
  ('endocrinologia', 'Endocrinologia', 'Doenças hormonais e metabólicas'),
  ('gastro', 'Gastroenterologia', 'Doenças do aparelho digestivo'),
  ('pneumo', 'Pneumologia', 'Doenças dos pulmões'),
  ('urologia', 'Urologia', 'Doenças do sistema urinário'),
  ('oncologia', 'Oncologia', 'Câncer e tumores'),
  ('geriatria', 'Geriatria', 'Saúde do idoso'),
  ('pediatria', 'Pediatria', 'Saúde infantil'),
  ('dermatologia', 'Dermatologia', 'Doenças da pele'),
  ('otorrino', 'Otorrinolaringologia', 'Doenças do ouvido, nariz e garganta')
ON CONFLICT (codigo) DO NOTHING;

-- RLS Policies
CREATE POLICY "Paciente pode ver seus encaminhamentos"
  ON encaminhamentos FOR SELECT
  USING (
    paciente_id = (SELECT id FROM pacientes WHERE id = paciente_id)
  );

CREATE POLICY "Médico solicitante pode ver seus encaminhamentos"
  ON encaminhamentos FOR SELECT
  USING (
    medico_solicitante_id IN (
      SELECT id FROM medicos WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Médico destino pode ver encaminhamentos"
  ON encaminhamentos FOR SELECT
  USING (
    medico_destino_id IN (
      SELECT id FROM medicos WHERE user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND has_role(auth.uid(), 'admin')
    )
  );

-- Comments
COMMENT ON TABLE encaminhamentos IS 'Sistema de encaminhamentos entre profissionais com rastreamento de status';
COMMENT ON COLUMN encaminhamentos.urgencia IS 'Nível de urgência: rotina (até 30 dias), preferencial (até 15 dias), urgente (até 48h)';
COMMENT ON COLUMN encaminhamentos.status IS 'Status do encaminhamento: enviado (inicial), recebido (destino confirmou), em_andamento, concluido, cancelado';
COMMENT ON TABLE especialidades_destino IS 'Referência de especialidades disponíveis para encaminhamento';
