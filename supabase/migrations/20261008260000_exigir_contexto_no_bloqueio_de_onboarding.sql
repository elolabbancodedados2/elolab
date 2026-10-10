-- Um onboarding bloqueado precisa registrar o motivo/ação; ao concluir,
-- removemos prazo e próxima ação para não manter tarefas obsoletas abertas.
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
  v_next_action text;
  v_due_at timestamptz;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso restrito';
  END IF;
  IF p_stage NOT IN ('created', 'configuration', 'team', 'operational', 'completed', 'blocked') THEN
    RAISE EXCEPTION 'Etapa inválida';
  END IF;

  v_next_action := CASE WHEN p_stage = 'completed' THEN NULL ELSE nullif(trim(p_next_action), '') END;
  v_due_at := CASE WHEN p_stage = 'completed' THEN NULL ELSE p_due_at END;
  IF p_stage <> 'completed' AND length(coalesce(v_next_action, '')) < 3 THEN
    RAISE EXCEPTION 'Defina a próxima ação ou o motivo do bloqueio';
  END IF;
  IF length(coalesce(v_next_action, '')) > 500 THEN
    RAISE EXCEPTION 'A próxima ação deve ter até 500 caracteres';
  END IF;

  SELECT c.nome INTO v_clinic_name
    FROM public.clinicas c
   WHERE c.id = p_clinica_id AND NOT coalesce(c.arquivada, false);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clínica não encontrada ou arquivada';
  END IF;
  IF p_owner_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.platform_admins a WHERE a.user_id = p_owner_id AND a.ativo
  ) THEN
    RAISE EXCEPTION 'O responsável deve ser um administrador ativo da plataforma';
  END IF;

  INSERT INTO public.platform_onboarding(clinica_id, stage, next_action, due_at, owner_id, updated_by)
  VALUES (p_clinica_id, p_stage, v_next_action, v_due_at, p_owner_id, auth.uid())
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
    jsonb_build_object('stage', p_stage, 'next_action', v_next_action, 'due_at', v_due_at, 'owner_id', p_owner_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_update_onboarding(uuid, text, text, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_update_onboarding(uuid, text, text, timestamptz, uuid) TO authenticated;
