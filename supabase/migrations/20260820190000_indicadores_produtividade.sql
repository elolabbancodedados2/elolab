-- Indicadores operacionais sem ranking individual e sem dados identificáveis.
-- O escopo é derivado exclusivamente de auth.uid(); nenhum parâmetro de tenant/usuário é aceito.

CREATE OR REPLACE FUNCTION public.indicadores_produtividade(p_days integer DEFAULT 30)
RETURNS TABLE (
  metric_key text,
  label text,
  current_value numeric,
  previous_value numeric,
  unit text,
  scope text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_clinic uuid;
  v_roles public.app_role[];
  v_admin boolean := false;
  v_start timestamptz;
  v_previous_start timestamptz;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_days NOT IN (7, 30, 90) THEN
    RAISE EXCEPTION 'invalid period' USING ERRCODE = '22023';
  END IF;

  SELECT p.clinica_id INTO v_clinic
  FROM public.profiles p
  WHERE p.id = v_user AND COALESCE(p.ativo, true);
  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'clinic membership required' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(ur.role), ARRAY[]::public.app_role[])
    INTO v_roles
  FROM public.user_roles ur
  WHERE ur.user_id = v_user;
  v_admin := 'admin'::public.app_role = ANY(v_roles);
  v_start := now() - make_interval(days => p_days);
  v_previous_start := now() - make_interval(days => p_days * 2);

  -- Tarefas são pessoais para colaboradores e agregadas para admin.
  RETURN QUERY
  SELECT 'tasks_completed', 'Tarefas concluídas',
    count(*) FILTER (WHERE t.data_conclusao >= v_start)::numeric,
    count(*) FILTER (WHERE t.data_conclusao >= v_previous_start AND t.data_conclusao < v_start)::numeric,
    'tarefas', CASE WHEN v_admin THEN 'Clínica' ELSE 'Meu trabalho' END
  FROM public.tarefas t
  WHERE t.clinica_id = v_clinic
    AND (v_admin OR t.responsavel_id = v_user)
    AND t.data_conclusao >= v_previous_start;

  IF v_admin OR 'medico'::public.app_role = ANY(v_roles) THEN
    RETURN QUERY
    SELECT 'appointments_completed', 'Atendimentos concluídos',
      count(*) FILTER (WHERE a.data >= v_start::date)::numeric,
      count(*) FILTER (WHERE a.data >= v_previous_start::date AND a.data < v_start::date)::numeric,
      'atendimentos', CASE WHEN v_admin THEN 'Clínica' ELSE 'Meu trabalho' END
    FROM public.agendamentos a
    WHERE a.clinica_id = v_clinic
      AND (v_admin OR EXISTS (
        SELECT 1 FROM public.medicos m
        WHERE m.id = a.medico_id
          AND m.clinica_id = v_clinic
          AND m.user_id = v_user
          AND m.ativo IS NOT FALSE
      ))
      AND a.status IN ('finalizado'::public.status_agendamento, 'atendimento_finalizado'::public.status_agendamento)
      AND a.data >= v_previous_start::date;
  END IF;

  IF v_admin OR 'enfermagem'::public.app_role = ANY(v_roles) THEN
    RETURN QUERY
    SELECT 'collections_completed', 'Coletas realizadas',
      count(*) FILTER (WHERE c.data_coleta >= v_start)::numeric,
      count(*) FILTER (WHERE c.data_coleta >= v_previous_start AND c.data_coleta < v_start)::numeric,
      'coletas', CASE WHEN v_admin THEN 'Clínica' ELSE 'Meu trabalho' END
    FROM public.coletas_laboratorio c
    WHERE c.clinica_id = v_clinic
      AND (v_admin OR c.coletado_por = v_user)
      AND c.data_coleta >= v_previous_start;
  END IF;

  IF v_admin OR 'financeiro'::public.app_role = ANY(v_roles) THEN
    RETURN QUERY
    SELECT 'payments_received', 'Recebimentos registrados',
      count(*) FILTER (WHERE p.data_pagamento >= v_start::date)::numeric,
      count(*) FILTER (WHERE p.data_pagamento >= v_previous_start::date AND p.data_pagamento < v_start::date)::numeric,
      'recebimentos', CASE WHEN v_admin THEN 'Clínica' ELSE 'Meu trabalho' END
    FROM public.pagamentos p
    WHERE p.clinica_id = v_clinic
      AND p.estornado_em IS NULL
      AND (v_admin OR p.recebido_por = v_user)
      AND p.data_pagamento >= v_previous_start::date;

    RETURN QUERY
    SELECT 'payments_value', 'Valor recebido',
      COALESCE(sum(p.valor) FILTER (WHERE p.data_pagamento >= v_start::date), 0),
      COALESCE(sum(p.valor) FILTER (WHERE p.data_pagamento >= v_previous_start::date AND p.data_pagamento < v_start::date), 0),
      'BRL', CASE WHEN v_admin THEN 'Clínica' ELSE 'Meu trabalho' END
    FROM public.pagamentos p
    WHERE p.clinica_id = v_clinic
      AND p.estornado_em IS NULL
      AND (v_admin OR p.recebido_por = v_user)
      AND p.data_pagamento >= v_previous_start::date;
  END IF;

  IF NOT v_admin AND 'recepcao'::public.app_role = ANY(v_roles) THEN
    RETURN QUERY
    SELECT 'appointments_registered', 'Agendamentos registrados',
      count(*) FILTER (WHERE al.timestamp >= v_start)::numeric,
      count(*) FILTER (WHERE al.timestamp >= v_previous_start AND al.timestamp < v_start)::numeric,
      'agendamentos', 'Meu trabalho'
    FROM public.audit_log al
    WHERE al.clinica_id = v_clinic AND al.user_id = v_user
      AND al.collection = 'agendamentos' AND al.action = 'create'
      AND al.timestamp >= v_previous_start;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.indicadores_produtividade(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.indicadores_produtividade(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.indicadores_produtividade(integer) TO authenticated;

COMMENT ON FUNCTION public.indicadores_produtividade(integer) IS
  'Indicadores operacionais do próprio usuário; admin recebe somente agregados da clínica, sem nomes, ranking ou PHI.';
