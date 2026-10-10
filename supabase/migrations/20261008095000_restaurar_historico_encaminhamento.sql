-- Restaura a tabela ausente no banco EloLab antes da migration que ativa
-- RLS, trigger e permissões do histórico de encaminhamentos.
BEGIN;

CREATE TABLE IF NOT EXISTS public.encaminhamento_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encaminhamento_id uuid NOT NULL
    REFERENCES public.encaminhamentos(id) ON DELETE CASCADE,
  status_anterior text,
  status_novo text NOT NULL,
  usuario_id uuid REFERENCES auth.users(id),
  comentario text,
  data_mudanca timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_encaminhamento_status_history_encaminhamento_id
  ON public.encaminhamento_status_history(encaminhamento_id);

CREATE INDEX IF NOT EXISTS idx_encaminhamento_status_history_data_mudanca
  ON public.encaminhamento_status_history(data_mudanca DESC);

COMMIT;
