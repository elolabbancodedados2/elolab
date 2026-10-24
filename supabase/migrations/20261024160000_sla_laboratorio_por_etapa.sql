BEGIN;

-- SLA do laboratório: limite de alerta configurável por setor (vazio = 24 h) e
-- medianas por etapa (espera da coleta, coleta→recebimento, recebimento→início
-- da análise, análise→liberação) a partir das trilhas já gravadas. SECURITY
-- INVOKER: as políticas RLS de coletas, eventos e resultados continuam valendo.

ALTER TABLE public.laboratorio_setores
  ADD COLUMN IF NOT EXISTS sla_alerta_horas integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'laboratorio_setores_sla_alerta_horas_valido') THEN
    ALTER TABLE public.laboratorio_setores
      ADD CONSTRAINT laboratorio_setores_sla_alerta_horas_valido
      CHECK (sla_alerta_horas IS NULL OR sla_alerta_horas BETWEEN 1 AND 720);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_coletas_lab_clinica_created
  ON public.coletas_laboratorio (clinica_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.laboratorio_sla_etapas(p_inicio timestamptz)
RETURNS TABLE (
  setor_id uuid, setor_nome text, sla_horas integer, amostras integer,
  espera_coleta_h numeric, coleta_recebimento_h numeric, recebimento_processamento_h numeric,
  processamento_liberacao_h numeric, total_h numeric, em_atraso integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH base AS (
    SELECT c.id, c.setor_id, c.status, c.created_at, c.data_coleta,
      (SELECT min(e.created_at) FROM public.laboratorio_eventos_amostra e
        WHERE e.coleta_id = c.id AND e.tipo = 'recebida') AS recebida_em,
      (SELECT min(e.created_at) FROM public.laboratorio_eventos_amostra e
        WHERE e.coleta_id = c.id AND e.status_novo = 'em_analise' AND e.status_anterior IS DISTINCT FROM 'em_analise') AS analise_em,
      (SELECT max(r.data_liberacao) FROM public.resultados_laboratorio r
        WHERE r.coleta_id = c.id AND r.liberado IS TRUE) AS liberado_em
    FROM public.coletas_laboratorio c
    WHERE c.clinica_id = public.get_my_clinica_id()
      AND c.created_at >= greatest(p_inicio, now() - interval '93 days')
      AND c.status <> 'cancelado'
  ), horas AS (
    SELECT b.*,
      CASE WHEN b.data_coleta >= b.created_at THEN extract(epoch FROM b.data_coleta - b.created_at) / 3600 END AS h_coleta,
      CASE WHEN b.recebida_em >= b.data_coleta THEN extract(epoch FROM b.recebida_em - b.data_coleta) / 3600 END AS h_recebimento,
      CASE WHEN b.analise_em >= coalesce(b.recebida_em, b.data_coleta)
        THEN extract(epoch FROM b.analise_em - coalesce(b.recebida_em, b.data_coleta)) / 3600 END AS h_processamento,
      CASE WHEN b.liberado_em >= b.analise_em THEN extract(epoch FROM b.liberado_em - b.analise_em) / 3600 END AS h_liberacao,
      CASE WHEN b.liberado_em >= b.created_at THEN extract(epoch FROM b.liberado_em - b.created_at) / 3600 END AS h_total
    FROM base b
  )
  SELECT s.id, coalesce(s.nome, 'Sem setor'), coalesce(s.sla_alerta_horas, 24), count(*)::integer,
    round(percentile_cont(0.5) WITHIN GROUP (ORDER BY h.h_coleta)::numeric, 2),
    round(percentile_cont(0.5) WITHIN GROUP (ORDER BY h.h_recebimento)::numeric, 2),
    round(percentile_cont(0.5) WITHIN GROUP (ORDER BY h.h_processamento)::numeric, 2),
    round(percentile_cont(0.5) WITHIN GROUP (ORDER BY h.h_liberacao)::numeric, 2),
    round(percentile_cont(0.5) WITHIN GROUP (ORDER BY h.h_total)::numeric, 2),
    (count(*) FILTER (
      WHERE h.status IN ('pendente', 'coletado', 'em_analise', 'validado')
        AND now() - h.created_at > make_interval(hours => coalesce(s.sla_alerta_horas, 24))
    ))::integer
  FROM horas h
  LEFT JOIN public.laboratorio_setores s ON s.id = h.setor_id
  GROUP BY s.id, s.nome, s.sla_alerta_horas
  ORDER BY 10 DESC, 2;
$$;

REVOKE ALL ON FUNCTION public.laboratorio_sla_etapas(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.laboratorio_sla_etapas(timestamptz) TO authenticated;

COMMIT;
