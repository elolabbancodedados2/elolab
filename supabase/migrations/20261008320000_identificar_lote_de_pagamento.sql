-- Identifica todas as formas pagas na mesma chamada do RPC, sem confundir
-- pagamentos simultâneos ou recibos de parcelas anteriores.
BEGIN;

ALTER TABLE public.pagamentos
  ADD COLUMN IF NOT EXISTS lote_pagamento_id bigint NULL;

CREATE INDEX IF NOT EXISTS idx_pagamentos_lancamento_lote
  ON public.pagamentos (lancamento_id, lote_pagamento_id);

CREATE OR REPLACE FUNCTION public.marcar_lote_pagamento()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.lote_pagamento_id := txid_current();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marcar_lote_pagamento ON public.pagamentos;
CREATE TRIGGER trg_marcar_lote_pagamento
  BEFORE INSERT ON public.pagamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.marcar_lote_pagamento();

COMMENT ON COLUMN public.pagamentos.lote_pagamento_id IS
  'Identifica todas as formas de pagamento gravadas na mesma transação, para emitir recibos com o valor exato da operação.';

COMMIT;
