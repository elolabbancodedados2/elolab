-- Orders Point pertencem à conta da clínica, sem misturar com os pagamentos
-- da conta Mercado Pago da plataforma nem duplicar a tabela de assinatura SaaS.
BEGIN;

CREATE TABLE IF NOT EXISTS public.mercadopago_point_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  lancamento_id uuid NOT NULL REFERENCES public.lancamentos(id) ON DELETE RESTRICT,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  request_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  external_reference text NOT NULL UNIQUE,
  mp_order_id text UNIQUE,
  mp_payment_id text,
  terminal_id text NOT NULL,
  valor numeric(12,2) NOT NULL CHECK (valor > 0),
  status text NOT NULL DEFAULT 'creating'
    CHECK (status IN ('creating','created','at_terminal','processed','action_required','failed','canceled','expired','refunded')),
  status_detail text,
  payment_method text,
  payment_sync_status text NOT NULL DEFAULT 'aguardando'
    CHECK (payment_sync_status IN ('aguardando','registrado','pendente_caixa','falha')),
  payment_sync_error text,
  expires_at timestamptz,
  paid_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinica_id, request_id)
);

CREATE INDEX IF NOT EXISTS mercadopago_point_orders_clinic_recent_idx
  ON public.mercadopago_point_orders (clinica_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mercadopago_point_orders_pending_idx
  ON public.mercadopago_point_orders (clinica_id, status)
  WHERE status IN ('creating','created','at_terminal','action_required');

ALTER TABLE public.mercadopago_point_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mercadopago_point_orders FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.mercadopago_point_orders TO service_role;

COMMIT;
