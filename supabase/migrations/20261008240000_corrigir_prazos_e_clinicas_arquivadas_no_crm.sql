-- Datas arredondadas por dias de intervalo escondiam vencimentos recentes.
-- Clínicas arquivadas também não devem compor a carteira comercial ativa.
CREATE OR REPLACE FUNCTION public.platform_crm_overview()
RETURNS TABLE (
  clinica_id uuid,
  clinica_nome text,
  cnpj text,
  suspensa boolean,
  cliente_desde timestamptz,
  dono_nome text,
  dono_email text,
  dono_telefone text,
  plano_nome text,
  plano_valor numeric,
  assinatura_status text,
  em_trial boolean,
  vence_em timestamptz,
  dias_para_vencer integer,
  total_medicos bigint,
  total_funcionarios bigint,
  total_pacientes bigint,
  total_agendamentos bigint,
  ultima_atividade timestamptz,
  dias_sem_uso integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Apenas o dono da plataforma pode consultar o CRM';
  END IF;

  RETURN QUERY
  WITH atividade AS (
    SELECT c.id AS cid,
           GREATEST(
             coalesce((SELECT max(a.created_at) FROM public.agendamentos a WHERE a.clinica_id = c.id), 'epoch'::timestamptz),
             coalesce((SELECT max(pr.created_at) FROM public.prontuarios pr WHERE pr.clinica_id = c.id), 'epoch'::timestamptz),
             coalesce((SELECT max(pa.created_at) FROM public.pacientes pa WHERE pa.clinica_id = c.id), 'epoch'::timestamptz)
           ) AS ultima
      FROM public.clinicas c
     WHERE NOT coalesce(c.arquivada, false)
  ), vencimentos AS (
    SELECT ap.user_id, ap.plano_id, ap.status, coalesce(ap.em_trial, false) AS em_trial,
           coalesce(ap.data_fim, ap.trial_fim) AS vence_em
      FROM public.assinaturas_plano ap
  )
  SELECT
    c.id,
    c.nome,
    c.cnpj,
    coalesce(c.suspensa, false),
    c.created_at,
    p.nome,
    p.email,
    p.telefone,
    pl.nome,
    pl.valor,
    v.status,
    coalesce(v.em_trial, false),
    v.vence_em,
    CASE
      WHEN v.vence_em IS NULL THEN NULL
      WHEN v.vence_em >= now() THEN ceil(extract(epoch FROM (v.vence_em - now())) / 86400)::integer
      ELSE floor(extract(epoch FROM (v.vence_em - now())) / 86400)::integer
    END,
    (SELECT count(*) FROM public.medicos m WHERE m.clinica_id = c.id AND m.ativo),
    (SELECT count(*) FROM public.funcionarios f WHERE f.clinica_id = c.id),
    (SELECT count(*) FROM public.pacientes pa WHERE pa.clinica_id = c.id),
    (SELECT count(*) FROM public.agendamentos ag WHERE ag.clinica_id = c.id),
    nullif(at.ultima, 'epoch'::timestamptz),
    CASE WHEN at.ultima = 'epoch'::timestamptz THEN NULL
         ELSE floor(extract(epoch FROM (now() - at.ultima)) / 86400)::integer
    END
  FROM public.clinicas c
  LEFT JOIN public.profiles p ON p.id = c.owner_id
  LEFT JOIN vencimentos v ON v.user_id = c.owner_id
  LEFT JOIN public.planos pl ON pl.id = v.plano_id
  JOIN atividade at ON at.cid = c.id
  WHERE NOT coalesce(c.arquivada, false)
  ORDER BY v.vence_em NULLS LAST, c.nome;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.platform_crm_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_crm_overview() TO authenticated;
