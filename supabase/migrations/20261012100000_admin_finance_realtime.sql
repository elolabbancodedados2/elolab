-- Keeps the admin customer, billing, payment and account views fresh without
-- granting direct table access beyond their existing RLS policies.
DO $$
DECLARE
  v_table text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    RAISE EXCEPTION 'A publicação supabase_realtime não existe.';
  END IF;

  FOREACH v_table IN ARRAY ARRAY[
    'clinicas',
    'profiles',
    'assinaturas_plano',
    'assinaturas_mercadopago',
    'platform_plan_orders',
    'platform_subscription_invoices',
    'platform_subscription_events',
    'mercadopago_webhook_logs',
    'registros_pendentes'
  ] LOOP
    IF to_regclass(format('public.%I', v_table)) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime'
           AND schemaname = 'public'
           AND tablename = v_table
       ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
    END IF;
  END LOOP;
END;
$$;
