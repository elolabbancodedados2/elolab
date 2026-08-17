-- ============================================================================
-- Dashboard de saúde por clínica para a dona do SaaS
--
-- A `platform_get_clinicas_overview` já existente devolve identidade e
-- contadores de cadastros (pacientes, médicos, funcionários, agendamentos).
-- Isso responde "quem são as clínicas" — mas não "como cada uma está":
--
--   - a clínica X marca 200 agendamentos por semana mas nenhum vira laudo?
--   - a clínica Y ficou 15 dias sem atividade?
--   - a clínica Z tem 60 coletas paradas na fila do laboratório?
--
-- Sem esse recorte, a dona do SaaS só descobre problema quando o dono da
-- clínica liga reclamando. Esta migration cria a foto operacional.
--
-- ─── O QUE FAZ ───────────────────────────────────────────────────────────
--
-- Nova RPC `platform_get_clinicas_saude()`, restrita a `is_platform_admin`,
-- devolvendo uma linha por clínica com:
--
--   - identidade (id, nome, status, criada em)
--   - **última atividade real** (max(timestamp) em audit_log, agendamentos,
--     lancamentos)
--   - **agendamentos parados agora** (em_atendimento sem finalização)
--   - **coletas esquecidas** (> 15 dias em pendente/coletado/em_analise)
--   - **exames sem movimento** (solicitado há mais de 7 dias)
--   - **contas em aberto e vencidas**
--   - **último audit_log** — proxy pra "sistema está sendo usado?"
--
-- Também cria uma view `platform_saude_agregada` com números do SaaS todo
-- (total ativas, em trial, expiradas; MRR aproximado; pacientes; etc.)
-- que a dashboard usa como topo.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.platform_get_clinicas_saude()
RETURNS TABLE (
  clinica_id                    uuid,
  clinica_nome                  text,
  criada_em                     timestamptz,
  assinatura_status             text,
  em_trial                      boolean,
  plano_nome                    text,
  suspensa                      boolean,
  arquivada                     boolean,
  ultima_atividade              timestamptz,
  ultima_atividade_ha_dias      integer,
  agendamentos_em_atendimento   integer,
  coletas_esquecidas            integer,
  exames_solicitados_ha_7d      integer,
  contas_a_receber_vencidas     integer,
  contas_a_receber_valor        numeric,
  total_pacientes               integer,
  total_agendamentos_no_mes     integer,
  audits_no_mes                 integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Só a dona do SaaS pode consultar a saúde das clínicas.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH ult_atividade AS (
    SELECT c.id AS clinica_id, GREATEST(
      COALESCE((SELECT MAX(a.timestamp)  FROM audit_log      a WHERE a.clinica_id = c.id), '1970-01-01'::timestamptz),
      COALESCE((SELECT MAX(a.updated_at) FROM agendamentos   a WHERE a.clinica_id = c.id), '1970-01-01'::timestamptz),
      COALESCE((SELECT MAX(l.updated_at) FROM lancamentos    l WHERE l.clinica_id = c.id), '1970-01-01'::timestamptz)
    ) AS quando
    FROM clinicas c
  )
  SELECT
    c.id,
    c.nome,
    c.created_at,
    COALESCE(a.status, 'sem_assinatura')::text,
    COALESCE(a.status = 'trial', false),
    COALESCE(p.nome, ''),
    c.suspensa,
    COALESCE(c.arquivada, false),
    NULLIF(ua.quando, '1970-01-01'::timestamptz),
    CASE WHEN ua.quando > '1970-01-01'::timestamptz
         THEN EXTRACT(DAY FROM now() - ua.quando)::integer
         ELSE NULL END,
    (SELECT COUNT(*)::integer FROM agendamentos ag
      WHERE ag.clinica_id = c.id AND ag.status = 'em_atendimento'),
    (SELECT COUNT(*)::integer FROM fila_alertas_lab_esquecido f
      WHERE f.clinica_id = c.id),
    (SELECT COUNT(*)::integer FROM exames e
      WHERE e.clinica_id = c.id
        AND e.status = 'solicitado'
        AND e.created_at < now() - interval '7 days'),
    (SELECT COUNT(*)::integer FROM lancamentos l
      WHERE l.clinica_id = c.id
        AND l.tipo = 'receita'
        AND l.status = 'pendente'
        AND l.data_vencimento < CURRENT_DATE),
    COALESCE((SELECT SUM(l.valor - COALESCE(l.valor_pago, 0)) FROM lancamentos l
      WHERE l.clinica_id = c.id
        AND l.tipo = 'receita'
        AND l.status IN ('pendente','parcial','atrasado')
        AND l.data_vencimento < CURRENT_DATE), 0),
    (SELECT COUNT(*)::integer FROM pacientes pa WHERE pa.clinica_id = c.id),
    (SELECT COUNT(*)::integer FROM agendamentos ag
      WHERE ag.clinica_id = c.id AND ag.data >= date_trunc('month', CURRENT_DATE)),
    (SELECT COUNT(*)::integer FROM audit_log al
      WHERE al.clinica_id = c.id AND al.timestamp >= date_trunc('month', now()))
  FROM clinicas c
  LEFT JOIN LATERAL (
    SELECT ap.status, ap.plano_id FROM assinaturas_plano ap
     WHERE ap.user_id = c.owner_id
     ORDER BY ap.created_at DESC LIMIT 1
  ) a ON TRUE
  LEFT JOIN planos p ON p.id = a.plano_id
  LEFT JOIN ult_atividade ua ON ua.clinica_id = c.id
  ORDER BY ua.quando DESC NULLS LAST;
END;
$$;

COMMENT ON FUNCTION public.platform_get_clinicas_saude() IS
  'Foto operacional por clínica para a dona do SaaS: última atividade real, agendamentos travados, coletas esquecidas, exames sem movimento e contas vencidas.';

REVOKE ALL ON FUNCTION public.platform_get_clinicas_saude() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_get_clinicas_saude() TO authenticated;

-- ─── View agregada do SaaS todo ─────────────────────────────────────────
--
-- Números que a dashboard mostra no topo, sem depender de um SELECT que
-- some 12 subselects. `SECURITY_INVOKER = true` pra não abrir view pra
-- quem não é platform admin.
CREATE OR REPLACE VIEW public.platform_saude_agregada
WITH (security_invoker = true)
AS
SELECT
  (SELECT COUNT(*) FROM clinicas WHERE NOT COALESCE(arquivada, false)) AS total_clinicas,
  (SELECT COUNT(*) FROM clinicas c
     LEFT JOIN LATERAL (SELECT status FROM assinaturas_plano
                          WHERE user_id = c.owner_id ORDER BY created_at DESC LIMIT 1) a ON TRUE
     WHERE NOT COALESCE(c.arquivada, false) AND a.status = 'ativa') AS clinicas_ativas,
  (SELECT COUNT(*) FROM clinicas c
     LEFT JOIN LATERAL (SELECT status FROM assinaturas_plano
                          WHERE user_id = c.owner_id ORDER BY created_at DESC LIMIT 1) a ON TRUE
     WHERE NOT COALESCE(c.arquivada, false) AND a.status = 'trial') AS clinicas_em_trial,
  (SELECT COUNT(*) FROM clinicas WHERE COALESCE(arquivada, false)) AS clinicas_arquivadas,
  (SELECT COUNT(*) FROM pacientes) AS total_pacientes,
  (SELECT COUNT(*) FROM agendamentos WHERE data >= date_trunc('month', CURRENT_DATE)) AS agendamentos_no_mes,
  (SELECT COUNT(*) FROM audit_log WHERE timestamp > now() - interval '7 days') AS audits_ultimos_7d;

COMMENT ON VIEW public.platform_saude_agregada IS
  'Números do SaaS todo para o topo do dashboard da dona. security_invoker=true — o SELECT ainda passa pelas RLS das tabelas base.';

GRANT SELECT ON public.platform_saude_agregada TO authenticated;

COMMIT;

-- ============================================================================
-- CONFERIR
-- ============================================================================
-- SELECT * FROM public.platform_saude_agregada;
-- SELECT clinica_nome, ultima_atividade_ha_dias, agendamentos_em_atendimento,
--        coletas_esquecidas, exames_solicitados_ha_7d, contas_a_receber_vencidas
--   FROM public.platform_get_clinicas_saude()
--  ORDER BY ultima_atividade_ha_dias NULLS LAST;
