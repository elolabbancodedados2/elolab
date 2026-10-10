-- A coleta só pode assumir o estado `liberado` quando há resultados e todos
-- eles já foram publicados pela RPC que registra autoria e data de liberação.
-- Isso impede que uma atualização direta do cliente pule o fluxo de Laudos.

CREATE OR REPLACE FUNCTION public.exigir_resultados_liberados_na_coleta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status::text = 'liberado'
     AND (TG_OP <> 'UPDATE' OR OLD.status::text IS DISTINCT FROM 'liberado') THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.resultados_laboratorio AS r
       WHERE r.coleta_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'A coleta não pode ser liberada sem resultados laboratoriais.'
        USING ERRCODE = 'check_violation';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM public.resultados_laboratorio AS r
       WHERE r.coleta_id = NEW.id
         AND COALESCE(r.liberado, false) = false
    ) THEN
      RAISE EXCEPTION 'Libere todos os resultados pelo módulo Laudos antes de concluir a coleta.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS coleta_liberada_exige_resultados_liberados
  ON public.coletas_laboratorio;

CREATE TRIGGER coleta_liberada_exige_resultados_liberados
  BEFORE UPDATE OF status ON public.coletas_laboratorio
  FOR EACH ROW
  EXECUTE FUNCTION public.exigir_resultados_liberados_na_coleta();

COMMENT ON FUNCTION public.exigir_resultados_liberados_na_coleta() IS
  'Impede marcar uma coleta como liberada antes da publicação de todos os resultados laboratoriais.';
