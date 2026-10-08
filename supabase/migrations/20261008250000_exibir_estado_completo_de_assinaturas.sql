-- A gestão de clínicas filtrava as assinaturas apenas para ativa/trial.
-- Canceladas, expiradas e pendentes pareciam não ter assinatura.
DROP FUNCTION IF EXISTS public.platform_get_clinicas_overview();

CREATE FUNCTION public.platform_get_clinicas_overview()
RETURNS TABLE (
  clinica_id uuid,
  clinica_nome text,
  owner_id uuid,
  owner_nome text,
  owner_email text,
  created_at timestamptz,
  suspensa boolean,
  plano_slug text,
  plano_nome text,
  assinatura_status text,
  em_trial boolean,
  trial_fim timestamptz,
  data_fim timestamptz,
  total_medicos bigint,
  total_funcionarios bigint,
  total_pacientes bigint,
  total_agendamentos bigint,
  arquivada boolean,
  arquivada_em timestamptz,
  arquivada_motivo text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso negado: somente administradores da plataforma';
  END IF;

  RETURN QUERY
  SELECT
    c.id, c.nome, c.owner_id, p.nome, p.email, c.created_at, coalesce(c.suspensa, false),
    ap.plano_slug, pl.nome, ap.status, coalesce(ap.em_trial, false),
    ap.trial_fim, ap.data_fim,
    (SELECT count(*) FROM public.medicos m WHERE m.clinica_id = c.id AND m.ativo),
    (SELECT count(*) FROM public.funcionarios f WHERE f.clinica_id = c.id),
    (SELECT count(*) FROM public.pacientes pa WHERE pa.clinica_id = c.id),
    (SELECT count(*) FROM public.agendamentos ag WHERE ag.clinica_id = c.id),
    c.arquivada, c.arquivada_em, c.arquivada_motivo
  FROM public.clinicas c
  LEFT JOIN public.profiles p ON p.id = c.owner_id
  LEFT JOIN public.assinaturas_plano ap ON ap.user_id = c.owner_id
  LEFT JOIN public.planos pl ON pl.id = ap.plano_id
  ORDER BY c.arquivada, c.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_get_clinicas_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_get_clinicas_overview() TO authenticated;
