-- Etapa 4.1a: RPC para superadmin listar todas as clínicas com métricas e plano
CREATE OR REPLACE FUNCTION public.platform_get_clinicas_overview()
RETURNS TABLE (
  clinica_id uuid,
  clinica_nome text,
  owner_id uuid,
  owner_nome text,
  owner_email text,
  created_at timestamptz,
  plano_slug text,
  plano_nome text,
  assinatura_status text,
  em_trial boolean,
  trial_fim timestamptz,
  total_medicos bigint,
  total_funcionarios bigint,
  total_pacientes bigint,
  total_agendamentos bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso negado: somente administradores da plataforma.';
  END IF;

  RETURN QUERY
  SELECT
    c.id AS clinica_id,
    c.nome AS clinica_nome,
    c.owner_id,
    p.nome AS owner_nome,
    p.email AS owner_email,
    c.created_at,
    ap.plano_slug,
    pl.nome AS plano_nome,
    ap.status AS assinatura_status,
    ap.em_trial,
    ap.trial_fim,
    (SELECT COUNT(*) FROM public.medicos m WHERE m.clinica_id = c.id AND m.ativo = true) AS total_medicos,
    (SELECT COUNT(*) FROM public.funcionarios f WHERE f.clinica_id = c.id) AS total_funcionarios,
    (SELECT COUNT(*) FROM public.pacientes pa WHERE pa.clinica_id = c.id) AS total_pacientes,
    (SELECT COUNT(*) FROM public.agendamentos ag WHERE ag.clinica_id = c.id) AS total_agendamentos
  FROM public.clinicas c
  LEFT JOIN public.profiles p ON p.id = c.owner_id
  LEFT JOIN public.assinaturas_plano ap ON ap.user_id = c.owner_id AND ap.status IN ('ativa','trial')
  LEFT JOIN public.planos pl ON pl.id = ap.plano_id
  ORDER BY c.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_get_clinicas_overview() TO authenticated;