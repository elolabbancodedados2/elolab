-- Item 47: a result (and therefore a release batch, which runs in one
-- transaction) cannot be released while the latest internal quality-control
-- run configured for the sample's sector is outside the approved range.
--
-- Rule: for each (analito, nivel, equipamento) the most recent run counts.
-- Runs of the coleta's sector and runs registered without a sector (general
-- lab QC) apply. A failed run keeps blocking until a newer approved run of the
-- same analyte/level/equipment is recorded (QC rows are insert-only).
-- The check is sector-wide on purpose: analyte names in QC and in results are
-- free text, so per-analyte matching would fail open on naming differences.

CREATE OR REPLACE FUNCTION public.laboratorio_liberacao_exige_controle_qualidade()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_setor_id uuid;
  v_falhas text;
BEGIN
  IF NEW.liberado IS NOT TRUE OR (TG_OP = 'UPDATE' AND OLD.liberado IS TRUE) THEN
    RETURN NEW;
  END IF;

  SELECT c.setor_id INTO v_setor_id
    FROM public.coletas_laboratorio c
   WHERE c.id = NEW.coleta_id AND c.clinica_id = NEW.clinica_id;

  SELECT string_agg(DISTINCT ultimo.analito || COALESCE(' (' || ultimo.nivel || ')', ''), ', ')
    INTO v_falhas
    FROM (
      SELECT DISTINCT ON (q.analito, COALESCE(q.nivel, ''), q.equipamento_id)
             q.analito, q.nivel, q.aprovado
        FROM public.laboratorio_controles_qualidade q
       WHERE q.clinica_id = NEW.clinica_id
         AND (q.setor_id IS NULL OR q.setor_id IS NOT DISTINCT FROM v_setor_id)
       ORDER BY q.analito, COALESCE(q.nivel, ''), q.equipamento_id, q.realizado_em DESC, q.created_at DESC
    ) ultimo
   WHERE ultimo.aprovado IS NOT TRUE;

  IF v_falhas IS NOT NULL THEN
    RAISE EXCEPTION 'Liberação bloqueada: controle de qualidade fora da faixa aprovada (%). Registre uma nova corrida aprovada antes de liberar.', v_falhas
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.laboratorio_liberacao_exige_controle_qualidade() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lab_liberacao_exige_controle_qualidade ON public.resultados_laboratorio;
CREATE TRIGGER trg_lab_liberacao_exige_controle_qualidade
  BEFORE INSERT OR UPDATE OF liberado ON public.resultados_laboratorio
  FOR EACH ROW EXECUTE FUNCTION public.laboratorio_liberacao_exige_controle_qualidade();

CREATE INDEX IF NOT EXISTS idx_lab_controle_qualidade_ultimo
  ON public.laboratorio_controles_qualidade (clinica_id, setor_id, analito, realizado_em DESC);

COMMENT ON FUNCTION public.laboratorio_liberacao_exige_controle_qualidade() IS
  'Bloqueia a liberação de resultados enquanto a corrida mais recente de controle de qualidade do setor estiver fora da faixa aprovada.';
