-- Add MFA (Multi-Factor Authentication) fields to profiles
-- Necessário para autenticação de dois fatores obrigatória para admin/medico

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS mfa_secret TEXT,
ADD COLUMN IF NOT EXISTS mfa_backup_codes TEXT, -- JSON array of backup codes
ADD COLUMN IF NOT EXISTS mfa_setup_date TIMESTAMP WITH TIME ZONE;

-- Create index para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_profiles_mfa_enabled ON profiles(mfa_enabled);

-- Add comment para documentação
COMMENT ON COLUMN profiles.mfa_enabled IS 'Se MFA está ativado para este usuário';
COMMENT ON COLUMN profiles.mfa_secret IS 'TOTP secret (base32 encoded)';
COMMENT ON COLUMN profiles.mfa_backup_codes IS 'Array JSON de códigos de backup unused';
COMMENT ON COLUMN profiles.mfa_setup_date IS 'Data de quando MFA foi configurado';
