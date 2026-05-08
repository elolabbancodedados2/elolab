-- Add reproductive health and comorbidity fields to pacientes
-- Necessário para alertas clínicos de prescrição

ALTER TABLE pacientes
ADD COLUMN IF NOT EXISTS gestante BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS amamentando BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS comorbidades TEXT, -- CSV: "úlcera ativa,hipertensão,diabetes"
ADD COLUMN IF NOT EXISTS alergias TEXT;    -- CSV: "penicilina,ibuprofeno"

-- Create index para buscas rápidas
CREATE INDEX IF NOT EXISTS idx_pacientes_gestante ON pacientes(gestante);
CREATE INDEX IF NOT EXISTS idx_pacientes_amamentando ON pacientes(amamentando);

-- Add comment para documentação
COMMENT ON COLUMN pacientes.gestante IS 'Paciente está gestante (para alertas de segurança)';
COMMENT ON COLUMN pacientes.amamentando IS 'Paciente está amamentando (para alertas de segurança)';
COMMENT ON COLUMN pacientes.comorbidades IS 'Lista de comorbidades (CSV): úlcera ativa,hipertensão,diabetes,etc';
COMMENT ON COLUMN pacientes.alergias IS 'Alergias registradas (CSV): penicilina,AINE,cefalosporina,etc';
