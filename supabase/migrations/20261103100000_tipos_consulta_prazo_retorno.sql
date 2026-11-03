BEGIN;

ALTER TABLE public.tipos_consulta
  ADD COLUMN IF NOT EXISTS prazo_retorno_dias integer DEFAULT 30
  CHECK (prazo_retorno_dias IS NULL OR prazo_retorno_dias >= 0);

COMMENT ON COLUMN public.tipos_consulta.prazo_retorno_dias IS
  'Prazo do retorno gratuito após consulta paga deste tipo com o mesmo médico. NULL significa sem prazo.';

COMMIT;
