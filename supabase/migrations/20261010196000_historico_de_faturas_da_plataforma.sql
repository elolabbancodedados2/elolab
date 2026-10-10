CREATE TABLE IF NOT EXISTS public.platform_subscription_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assinatura_mp_id uuid REFERENCES public.assinaturas_mercadopago(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  mp_authorized_payment_id text NOT NULL UNIQUE,
  mp_preapproval_id text NOT NULL,
  mp_payment_id text,
  invoice_status text NOT NULL,
  payment_status text,
  payment_status_detail text,
  amount numeric(12, 2),
  currency_id text,
  invoice_type text,
  date_created timestamptz,
  last_modified timestamptz,
  debit_date timestamptz,
  retry_attempt integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_subscription_invoices_user_date_idx
  ON public.platform_subscription_invoices (user_id, date_created DESC);
CREATE INDEX IF NOT EXISTS platform_subscription_invoices_preapproval_idx
  ON public.platform_subscription_invoices (mp_preapproval_id, date_created DESC);

ALTER TABLE public.platform_subscription_invoices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_subscription_invoices FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.platform_subscription_invoices TO authenticated;
GRANT ALL ON TABLE public.platform_subscription_invoices TO service_role;

DROP POLICY IF EXISTS platform_subscription_invoices_platform_admin_select
  ON public.platform_subscription_invoices;
CREATE POLICY platform_subscription_invoices_platform_admin_select
  ON public.platform_subscription_invoices
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.platform_subscription_invoice_history(p_limit integer DEFAULT 50)
RETURNS TABLE (
  id uuid,
  clinic_name text,
  owner_email text,
  mp_authorized_payment_id text,
  mp_preapproval_id text,
  mp_payment_id text,
  invoice_status text,
  payment_status text,
  payment_status_detail text,
  amount numeric,
  currency_id text,
  invoice_type text,
  date_created timestamptz,
  debit_date timestamptz,
  retry_attempt integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso restrito à administração da plataforma';
  END IF;

  RETURN QUERY
  SELECT
    i.id,
    COALESCE(c.nome, p.nome, 'Conta sem clínica') AS clinic_name,
    p.email AS owner_email,
    i.mp_authorized_payment_id,
    i.mp_preapproval_id,
    i.mp_payment_id,
    i.invoice_status,
    i.payment_status,
    i.payment_status_detail,
    i.amount,
    i.currency_id,
    i.invoice_type,
    i.date_created,
    i.debit_date,
    i.retry_attempt
  FROM public.platform_subscription_invoices i
  LEFT JOIN public.profiles p ON p.id = i.user_id
  LEFT JOIN LATERAL (
    SELECT clinic.nome
    FROM public.clinicas clinic
    WHERE clinic.owner_id = i.user_id
    ORDER BY clinic.created_at
    LIMIT 1
  ) c ON true
  ORDER BY COALESCE(i.date_created, i.created_at) DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_subscription_invoice_history(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_subscription_invoice_history(integer) TO authenticated, service_role;
