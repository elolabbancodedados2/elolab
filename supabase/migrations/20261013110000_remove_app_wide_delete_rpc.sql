-- Remove a RPC legada de limpeza global, que podia apagar dados clínicos,
-- financeiros, de assinaturas e de auditoria. Nenhum fluxo do app a utiliza.
-- DROP sem CASCADE aborta caso exista dependência não inventariada.
DROP FUNCTION IF EXISTS public.delete_all_app_data();

DO $$
BEGIN
  IF to_regprocedure('public.delete_all_app_data()') IS NOT NULL THEN
    RAISE EXCEPTION 'A RPC destrutiva delete_all_app_data() ainda está presente';
  END IF;
END;
$$;
