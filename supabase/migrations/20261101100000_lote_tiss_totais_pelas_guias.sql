-- Totais do lote TISS calculados a partir das guias enquanto o lote está em rascunho.
--
-- Antes, quantidade e valor apresentado ficavam presos ao que foi digitado na
-- criação. Se as guias não somassem exatamente aquilo, `pendencias_lote_tiss`
-- acusava erro e o envio era bloqueado sem que a tela oferecesse como corrigir.
-- Depois do envio os totais ficam congelados: são o que a operadora recebeu.

CREATE OR REPLACE FUNCTION public.recalcular_totais_lote_tiss(p_lote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF p_lote_id IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.lotes_tiss l
     SET quantidade_guias = t.quantidade,
         valor_apresentado = t.valor
    FROM (
      SELECT count(*)::integer AS quantidade, COALESCE(sum(g.valor_total), 0)::numeric(14,2) AS valor
        FROM public.lote_tiss_guias g
       WHERE g.lote_id = p_lote_id
    ) t
   WHERE l.id = p_lote_id
     AND l.status = 'rascunho'
     AND (l.quantidade_guias IS DISTINCT FROM t.quantidade OR l.valor_apresentado IS DISTINCT FROM t.valor);
END;
$$;

REVOKE ALL ON FUNCTION public.recalcular_totais_lote_tiss(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.recalcular_totais_lote_tiss_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.recalcular_totais_lote_tiss(OLD.lote_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND (TG_OP = 'INSERT' OR NEW.lote_id IS DISTINCT FROM OLD.lote_id OR NEW.valor_total IS DISTINCT FROM OLD.valor_total) THEN
    PERFORM public.recalcular_totais_lote_tiss(NEW.lote_id);
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.recalcular_totais_lote_tiss_trigger() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS lote_tiss_guias_recalculam_totais ON public.lote_tiss_guias;
CREATE TRIGGER lote_tiss_guias_recalculam_totais
  AFTER INSERT OR UPDATE OF lote_id, valor_total OR DELETE ON public.lote_tiss_guias
  FOR EACH ROW EXECUTE FUNCTION public.recalcular_totais_lote_tiss_trigger();

-- Lotes em rascunho que já tinham guias passam a refletir a soma real.
DO $$
DECLARE
  v_lote uuid;
BEGIN
  FOR v_lote IN
    SELECT l.id FROM public.lotes_tiss l
     WHERE l.status = 'rascunho'
       AND EXISTS (SELECT 1 FROM public.lote_tiss_guias g WHERE g.lote_id = l.id)
  LOOP
    PERFORM public.recalcular_totais_lote_tiss(v_lote);
  END LOOP;
END;
$$;
