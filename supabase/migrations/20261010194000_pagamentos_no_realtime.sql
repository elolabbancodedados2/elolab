-- A recepção atualiza os totais de recebimento e estorno em tempo real.
-- FULL permite ao Realtime aplicar o filtro de clínica também em UPDATE/DELETE.
BEGIN;

ALTER TABLE public.pagamentos REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'pagamentos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pagamentos;
  END IF;
END;
$$;

COMMIT;
