-- ============================================================================
-- `platform_get_clinicas_saude` permite chamada sem JWT (cron)
--
-- A migration 20260817230000 criou `verificar_saude_clinicas_e_alertar`, que
-- roda no pg_cron. Cron não tem JWT — `auth.uid()` é NULL, `is_platform_admin`
-- devolve false e a chamada é recusada.
--
-- Regra revisada: se há usuário autenticado, exige ser platform admin. Se
-- não há usuário (contexto de cron/trigger interno via SECURITY DEFINER),
-- deixa passar. Cron só é agendado por quem tem acesso ao banco — não é
-- vetor de acesso externo.
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
  -- Com JWT: precisa ser platform_admin. Sem JWT (cron/trigger interno):
  -- passa. Cron não é vetor externo, é agendado direto no banco.
  IF auth.uid() IS NOT NULL AND NOT public.is_platform_admin() THEN
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

COMMIT;
