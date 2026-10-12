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
  v_today date;
  v_current_date_start date;
  v_previous_date_start date;
  v_current_range_start timestamptz;
  v_current_range_end_exclusive timestamptz;
  v_previous_range_start timestamptz;
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
  v_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_current_date_start := v_today - (p_days - 1);
  v_previous_date_start := v_current_date_start - p_days;
  v_current_range_start := v_current_date_start::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_current_range_end_exclusive := (v_today + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_previous_range_start := v_previous_date_start::timestamp AT TIME ZONE 'America/Sao_Paulo';

  -- Tarefas são pessoais para colaboradores e agregadas para admin.
  RETURN QUERY
  SELECT 'tasks_completed', 'Tarefas concluídas',
    count(*) FILTER (WHERE t.data_conclusao >= v_current_range_start AND t.data_conclusao < v_current_range_end_exclusive)::numeric,
    count(*) FILTER (WHERE t.data_conclusao >= v_previous_range_start AND t.data_conclusao < v_current_range_start)::numeric,
    'tarefas', CASE WHEN v_admin THEN 'Clínica' ELSE 'Meu trabalho' END
  FROM public.tarefas t
  WHERE t.clinica_id = v_clinic
    AND (v_admin OR t.responsavel_id = v_user)
    AND t.data_conclusao >= v_previous_range_start
    AND t.data_conclusao < v_current_range_end_exclusive;

  IF v_admin OR 'medico'::public.app_role = ANY(v_roles) THEN
    RETURN QUERY
    SELECT 'appointments_completed', 'Atendimentos concluídos',
      count(*) FILTER (WHERE a.data >= v_current_date_start AND a.data <= v_today)::numeric,
      count(*) FILTER (WHERE a.data >= v_previous_date_start AND a.data < v_current_date_start)::numeric,
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
      AND a.data >= v_previous_date_start
      AND a.data <= v_today;
  END IF;

  IF v_admin OR 'enfermagem'::public.app_role = ANY(v_roles) THEN
    RETURN QUERY
    SELECT 'collections_completed', 'Coletas realizadas',
      count(*) FILTER (WHERE c.data_coleta >= v_current_range_start AND c.data_coleta < v_current_range_end_exclusive)::numeric,
      count(*) FILTER (WHERE c.data_coleta >= v_previous_range_start AND c.data_coleta < v_current_range_start)::numeric,
      'coletas', CASE WHEN v_admin THEN 'Clínica' ELSE 'Meu trabalho' END
    FROM public.coletas_laboratorio c
    WHERE c.clinica_id = v_clinic
      AND (v_admin OR c.coletado_por = v_user)
      AND c.data_coleta >= v_previous_range_start
      AND c.data_coleta < v_current_range_end_exclusive;
  END IF;

  IF v_admin OR 'financeiro'::public.app_role = ANY(v_roles) THEN
    RETURN QUERY
    SELECT 'payments_received', 'Recebimentos registrados',
      count(*) FILTER (WHERE p.data_pagamento >= v_current_range_start AND p.data_pagamento < v_current_range_end_exclusive)::numeric,
      count(*) FILTER (WHERE p.data_pagamento >= v_previous_range_start AND p.data_pagamento < v_current_range_start)::numeric,
      'recebimentos', CASE WHEN v_admin THEN 'Clínica' ELSE 'Meu trabalho' END
    FROM public.pagamentos p
    WHERE p.clinica_id = v_clinic
      AND p.estornado_em IS NULL
      AND (v_admin OR p.recebido_por = v_user)
      AND p.data_pagamento >= v_previous_range_start
      AND p.data_pagamento < v_current_range_end_exclusive;

    RETURN QUERY
    SELECT 'payments_value', 'Valor recebido',
      COALESCE(sum(p.valor) FILTER (WHERE p.data_pagamento >= v_current_range_start AND p.data_pagamento < v_current_range_end_exclusive), 0),
      COALESCE(sum(p.valor) FILTER (WHERE p.data_pagamento >= v_previous_range_start AND p.data_pagamento < v_current_range_start), 0),
      'BRL', CASE WHEN v_admin THEN 'Clínica' ELSE 'Meu trabalho' END
    FROM public.pagamentos p
    WHERE p.clinica_id = v_clinic
      AND p.estornado_em IS NULL
      AND (v_admin OR p.recebido_por = v_user)
      AND p.data_pagamento >= v_previous_range_start
      AND p.data_pagamento < v_current_range_end_exclusive;
  END IF;

  IF NOT v_admin AND 'recepcao'::public.app_role = ANY(v_roles) THEN
    RETURN QUERY
    SELECT 'appointments_registered', 'Agendamentos registrados',
      count(*) FILTER (WHERE al.timestamp >= v_current_range_start AND al.timestamp < v_current_range_end_exclusive)::numeric,
      count(*) FILTER (WHERE al.timestamp >= v_previous_range_start AND al.timestamp < v_current_range_start)::numeric,
      'agendamentos', 'Meu trabalho'
    FROM public.audit_log al
    WHERE al.clinica_id = v_clinic AND al.user_id = v_user
      AND al.collection = 'agendamentos' AND al.action = 'create'
      AND al.timestamp >= v_previous_range_start
      AND al.timestamp < v_current_range_end_exclusive;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.indicadores_produtividade(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.indicadores_produtividade(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.indicadores_produtividade(integer) TO authenticated;

COMMENT ON FUNCTION public.indicadores_produtividade(integer) IS
  'Indicadores operacionais do próprio usuário; admin recebe somente agregados da clínica, sem nomes, ranking ou PHI.';
