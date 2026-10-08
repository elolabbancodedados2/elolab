BEGIN;

-- A checagem na Edge Function melhora a mensagem de erro, mas somente o banco
-- pode impedir duas abas de criarem uma cobrança simultaneamente.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.mercadopago_point_orders
     WHERE status IN ('creating', 'created', 'at_terminal', 'action_required')
     GROUP BY clinica_id, lancamento_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Há cobranças Point abertas duplicadas. Concilie-as antes de aplicar a migração.';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS mercadopago_point_one_open_order_per_bill
  ON public.mercadopago_point_orders (clinica_id, lancamento_id)
  WHERE status IN ('creating', 'created', 'at_terminal', 'action_required');

COMMIT;
