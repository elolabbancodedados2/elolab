-- O relatório executivo e Cobranças SaaS usam a mesma regra de assinatura
-- paga válida para que os dois painéis não apresentem MRR divergente.
CREATE OR REPLACE FUNCTION public.platform_executive_report(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso restrito à administração da plataforma';
  END IF;
  IF p_days NOT BETWEEN 7 AND 365 THEN
    RAISE EXCEPTION 'Período deve estar entre 7 e 365 dias';
  END IF;

  WITH crm AS MATERIALIZED (SELECT * FROM public.platform_crm_overview()),
  carteira AS (
    SELECT *, (vence_em IS NOT NULL AND vence_em < now()) AS vencida
      FROM crm
  ), portfolio AS (
    SELECT
      count(*) AS total_clinicas,
      count(*) FILTER (WHERE assinatura_status = 'ativa' AND NOT coalesce(em_trial, false) AND NOT suspensa AND NOT vencida) AS ativas,
      count(*) FILTER (WHERE em_trial AND NOT suspensa AND NOT vencida) AS trials,
      count(*) FILTER (WHERE suspensa) AS suspensas,
      count(*) FILTER (WHERE coalesce(dias_sem_uso, 999) >= 14 AND NOT suspensa AND NOT vencida) AS em_risco,
      coalesce(sum(plano_valor) FILTER (WHERE assinatura_status = 'ativa' AND NOT coalesce(em_trial, false) AND NOT suspensa AND NOT vencida), 0) AS mrr
    FROM carteira
  ), crescimento AS (
    SELECT
      (SELECT count(*) FROM crm WHERE cliente_desde >= now() - make_interval(days => p_days)) AS novas_clinicas,
      (SELECT count(*) FROM public.pacientes WHERE created_at >= now() - make_interval(days => p_days)) AS novos_pacientes,
      (SELECT count(*) FROM public.agendamentos WHERE created_at >= now() - make_interval(days => p_days)) AS agendamentos
  ), suporte AS (
    SELECT count(*) AS tickets,
      count(*) FILTER (WHERE status NOT IN ('resolvido', 'fechado')) AS abertos,
      count(*) FILTER (WHERE status NOT IN ('resolvido', 'fechado') AND sla_limite < now()) AS sla_vencido,
      coalesce(round(avg(extract(epoch FROM (resolvido_em - created_at)) / 3600) FILTER (WHERE resolvido_em IS NOT NULL)::numeric, 1), 0) AS horas_resolucao
    FROM public.support_tickets
    WHERE created_at >= now() - make_interval(days => p_days)
  ), ia AS (
    SELECT count(*) AS chamadas, count(*) FILTER (WHERE sucesso) AS sucessos,
      coalesce(sum(input_tokens + output_tokens), 0) AS tokens,
      coalesce(round(sum(custo_estimado)::numeric, 4), 0) AS custo
    FROM public.platform_ai_usage
    WHERE created_at >= now() - make_interval(days => p_days)
  ), top_clientes AS (
    SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.total_agendamentos DESC), '[]'::jsonb) AS lista
      FROM (
        SELECT clinica_id, clinica_nome, plano_nome, plano_valor, assinatura_status,
               total_pacientes, total_agendamentos, dias_sem_uso
          FROM crm
         ORDER BY total_agendamentos DESC
         LIMIT 10
      ) t
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'days', p_days,
    'portfolio', jsonb_build_object('total_clinicas', p.total_clinicas, 'ativas', p.ativas, 'trials', p.trials,
                                    'suspensas', p.suspensas, 'em_risco', p.em_risco, 'mrr', p.mrr, 'arr', p.mrr * 12),
    'growth', to_jsonb(c),
    'support', to_jsonb(s),
    'ai', jsonb_build_object('chamadas', i.chamadas, 'sucessos', i.sucessos,
      'taxa_sucesso', CASE WHEN i.chamadas = 0 THEN 0 ELSE round(i.sucessos * 100.0 / i.chamadas, 1) END,
      'tokens', i.tokens, 'custo', i.custo),
    'top_clients', t.lista
  ) INTO v_result
  FROM portfolio p CROSS JOIN crescimento c CROSS JOIN suporte s CROSS JOIN ia i CROSS JOIN top_clientes t;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_executive_report(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_executive_report(integer) TO authenticated;
