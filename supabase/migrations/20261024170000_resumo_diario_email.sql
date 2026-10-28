-- Resumo diário por e-mail: o scheduled-reports-runner reserva o dia nesta
-- coluna antes de enviar, garantindo no máximo um envio por usuário/clínica/dia.
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS email_daily_summary_sent_on date;

COMMENT ON COLUMN public.user_preferences.email_daily_summary_sent_on IS
  'Dia (America/Sao_Paulo) do último resumo diário reservado pelo scheduled-reports-runner.';

CREATE INDEX IF NOT EXISTS user_preferences_daily_summary_optin_idx
  ON public.user_preferences (email_daily_summary_sent_on)
  WHERE email_daily_summary;
