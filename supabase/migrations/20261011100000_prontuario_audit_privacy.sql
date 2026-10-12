-- Remove campos que podem conter informação clínica ou identificar pacientes
-- dos eventos de auditoria do prontuário. A trilha mantém usuário, operação,
-- data/hora e identificador do registro para rastreabilidade.
CREATE OR REPLACE FUNCTION public.fn_sanitizar_auditoria_prontuario()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.collection = 'prontuarios' THEN
    NEW.record_name := NULL;
    NEW.changes := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sanitizar_auditoria_prontuario ON public.audit_log;
CREATE TRIGGER trg_sanitizar_auditoria_prontuario
  BEFORE INSERT OR UPDATE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.fn_sanitizar_auditoria_prontuario();

UPDATE public.audit_log
   SET record_name = NULL, changes = NULL
 WHERE collection = 'prontuarios'
   AND (record_name IS NOT NULL OR changes IS NOT NULL);
