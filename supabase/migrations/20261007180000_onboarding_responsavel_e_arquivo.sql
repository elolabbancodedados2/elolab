BEGIN;

CREATE OR REPLACE FUNCTION public.platform_onboarding_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso restrito';
  END IF;

  RETURN jsonb_build_object(
    'clinics', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.readiness, x.clinica_nome)
      FROM (
        SELECT
          c.id AS clinica_id,
          c.nome AS clinica_nome,
          c.created_at,
          COALESCE(o.stage, 'created') AS stage,
          o.owner_id,
          o.next_action,
          o.due_at,
          (SELECT count(*) FROM public.profiles p WHERE p.clinica_id = c.id AND p.ativo) AS team_size,
          EXISTS (SELECT 1 FROM public.configuracoes_clinica cfg WHERE cfg.clinica_id = c.id) AS has_config,
          EXISTS (SELECT 1 FROM public.tipos_consulta t WHERE t.clinica_id = c.id AND t.ativo) AS has_services,
          EXISTS (SELECT 1 FROM public.agendamentos a WHERE a.clinica_id = c.id) AS has_activity,
          (
            CASE WHEN EXISTS (SELECT 1 FROM public.configuracoes_clinica cfg WHERE cfg.clinica_id = c.id) THEN 25 ELSE 0 END +
            CASE WHEN EXISTS (SELECT 1 FROM public.tipos_consulta t WHERE t.clinica_id = c.id AND t.ativo) THEN 25 ELSE 0 END +
            CASE WHEN (SELECT count(*) FROM public.profiles p WHERE p.clinica_id = c.id AND p.ativo) > 1 THEN 25 ELSE 0 END +
            CASE WHEN EXISTS (SELECT 1 FROM public.agendamentos a WHERE a.clinica_id = c.id) THEN 25 ELSE 0 END
          ) AS readiness
        FROM public.clinicas c
        LEFT JOIN public.platform_onboarding o ON o.clinica_id = c.id
        WHERE NOT COALESCE(c.arquivada, false)
      ) x
    ), '[]'::jsonb)
  );
END;
$$;

DROP FUNCTION IF EXISTS public.platform_update_onboarding(uuid, text, text, timestamptz);
CREATE OR REPLACE FUNCTION public.platform_update_onboarding(
  p_clinica_id uuid,
  p_stage text,
  p_next_action text,
  p_due_at timestamptz DEFAULT NULL,
  p_owner_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_name text;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso restrito';
  END IF;
  IF p_stage NOT IN ('created', 'configuration', 'team', 'operational', 'completed', 'blocked') THEN
    RAISE EXCEPTION 'Etapa inválida';
  END IF;
  IF p_next_action IS NOT NULL AND length(p_next_action) > 500 THEN
    RAISE EXCEPTION 'A próxima ação deve ter até 500 caracteres';
  END IF;
  IF p_stage NOT IN ('completed', 'blocked') AND length(trim(COALESCE(p_next_action, ''))) < 3 THEN
    RAISE EXCEPTION 'Defina uma próxima ação para essa etapa';
  END IF;

  SELECT c.nome INTO v_clinic_name
  FROM public.clinicas c
  WHERE c.id = p_clinica_id AND NOT COALESCE(c.arquivada, false);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clínica não encontrada ou arquivada';
  END IF;

  IF p_owner_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.platform_admins a WHERE a.user_id = p_owner_id AND a.ativo
  ) THEN
    RAISE EXCEPTION 'O responsável deve ser um administrador ativo da plataforma';
  END IF;

  INSERT INTO public.platform_onboarding(clinica_id, stage, next_action, due_at, owner_id, updated_by)
  VALUES (p_clinica_id, p_stage, nullif(trim(p_next_action), ''), p_due_at, p_owner_id, auth.uid())
  ON CONFLICT (clinica_id) DO UPDATE
    SET stage = EXCLUDED.stage,
        next_action = EXCLUDED.next_action,
        due_at = EXCLUDED.due_at,
        owner_id = EXCLUDED.owner_id,
        updated_at = now(),
        updated_by = auth.uid();

  INSERT INTO public.audit_log(user_id, action, collection, record_id, record_name, changes)
  VALUES (
    auth.uid(), 'update', 'platform_onboarding', p_clinica_id::text, v_clinic_name,
    jsonb_build_object('stage', p_stage, 'next_action', nullif(trim(p_next_action), ''), 'due_at', p_due_at, 'owner_id', p_owner_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_onboarding_overview() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_update_onboarding(uuid, text, text, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_onboarding_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_update_onboarding(uuid, text, text, timestamptz, uuid) TO authenticated;

COMMIT;
