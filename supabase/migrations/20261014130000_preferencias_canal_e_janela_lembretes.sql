ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS preferencia_canal_lembrete text NOT NULL DEFAULT 'ambos',
  ADD COLUMN IF NOT EXISTS horario_contato_inicio time NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS horario_contato_fim time NOT NULL DEFAULT '20:00',
  ADD COLUMN IF NOT EXISTS fuso_horario_contato text NOT NULL DEFAULT 'America/Sao_Paulo';

ALTER TABLE public.pacientes
  DROP CONSTRAINT IF EXISTS pacientes_preferencia_canal_lembrete_check,
  ADD CONSTRAINT pacientes_preferencia_canal_lembrete_check
    CHECK (preferencia_canal_lembrete IN ('ambos', 'email', 'whatsapp', 'nenhum')),
  DROP CONSTRAINT IF EXISTS pacientes_janela_contato_valida_check,
  ADD CONSTRAINT pacientes_janela_contato_valida_check
    CHECK (horario_contato_inicio <> horario_contato_fim),
  DROP CONSTRAINT IF EXISTS pacientes_fuso_horario_contato_check,
  ADD CONSTRAINT pacientes_fuso_horario_contato_check
    CHECK (fuso_horario_contato IN (
      'America/Noronha', 'America/Manaus', 'America/Rio_Branco', 'America/Sao_Paulo'
    ));

COMMENT ON COLUMN public.pacientes.preferencia_canal_lembrete IS
  'Canais permitidos para lembretes de consulta: ambos, email, whatsapp ou nenhum.';
COMMENT ON COLUMN public.pacientes.horario_contato_inicio IS
  'Início inclusivo da janela local permitida para lembretes de consulta.';
COMMENT ON COLUMN public.pacientes.horario_contato_fim IS
  'Fim exclusivo da janela local permitida para lembretes de consulta.';
