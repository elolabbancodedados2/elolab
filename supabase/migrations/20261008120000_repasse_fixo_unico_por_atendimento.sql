-- Valor fixo representa um honorario por atendimento, mesmo quando as receitas
-- vinculadas ao mesmo agendamento forem quitadas em competencias diferentes.
BEGIN;

CREATE OR REPLACE FUNCTION public.gerar_repasses_medicos(p_competencia date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinica uuid := public.get_my_clinica_id();
  v_count integer;
BEGIN
  IF NOT public.can_access_financial(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso financeiro necessário';
  END IF;
  IF v_clinica IS NULL OR p_competencia IS NULL THEN
    RAISE EXCEPTION 'Clínica e competência são obrigatórias';
  END IF;

  WITH fontes_base AS (
    SELECT l.*,
           a.medico_id,
           COALESCE(
             (SELECT (max(p.data_pagamento) AT TIME ZONE 'America/Sao_Paulo')::date
                FROM public.pagamentos p
               WHERE p.lancamento_id = l.id AND p.estornado_em IS NULL),
             l.data_pagamento,
             l.data
           ) AS data_recebimento
      FROM public.lancamentos l
      JOIN public.agendamentos a
        ON a.id = l.agendamento_id AND a.clinica_id = l.clinica_id
     WHERE l.clinica_id = v_clinica
       AND l.tipo = 'receita'
       AND l.status = 'pago'
  ),
  fontes_ordenadas AS (
    SELECT fontes_base.*,
           row_number() OVER (
             PARTITION BY agendamento_id
             ORDER BY data_recebimento, created_at, id
           ) AS ordem_atendimento
      FROM fontes_base
  ),
  fontes_competencia AS (
    SELECT *
      FROM fontes_ordenadas
     WHERE data_recebimento >= date_trunc('month', p_competencia)::date
       AND data_recebimento < (date_trunc('month', p_competencia) + interval '1 month')::date
  )
  INSERT INTO public.repasses_medicos (
    clinica_id, medico_id, lancamento_id, competencia, valor_base, percentual,
    valor_repasse, tipo_calculo, valor_configurado
  )
  SELECT l.clinica_id,
         l.medico_id,
         l.id,
         date_trunc('month', p_competencia)::date,
         COALESCE(l.valor_pago, l.valor),
         CASE WHEN m.tipo_repasse = 'percentual' THEN m.percentual_repasse ELSE 0 END,
         CASE WHEN m.tipo_repasse = 'fixo' THEN m.valor_repasse_fixo
              ELSE round(COALESCE(l.valor_pago, l.valor) * m.percentual_repasse / 100, 2) END,
         m.tipo_repasse,
         CASE WHEN m.tipo_repasse = 'fixo' THEN m.valor_repasse_fixo ELSE m.percentual_repasse END
    FROM fontes_competencia l
    JOIN public.medicos m ON m.id = l.medico_id AND m.clinica_id = l.clinica_id
   WHERE (m.tipo_repasse = 'percentual' AND m.percentual_repasse > 0)
      OR (m.tipo_repasse = 'fixo' AND m.valor_repasse_fixo > 0 AND l.ordem_atendimento = 1)
  ON CONFLICT (lancamento_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.gerar_repasses_medicos(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerar_repasses_medicos(date) TO authenticated;

COMMENT ON FUNCTION public.gerar_repasses_medicos(date) IS
  'Gera repasses na competência da data do último recebimento não estornado; o valor fixo é gerado apenas para o primeiro recebimento histórico do atendimento.';

COMMIT;
