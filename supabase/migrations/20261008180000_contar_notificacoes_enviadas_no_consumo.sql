-- A cota operacional considera notificações concluídas, conforme o validador
-- usado pela fila. Itens pendentes ou com falha não consomem a cota.
CREATE OR REPLACE FUNCTION public.platform_usage_overview()
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
    'generated_at', now(),
    'clinics', coalesce((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.clinica_nome)
        FROM (
          SELECT
            c.id AS clinica_id,
            c.nome AS clinica_nome,
            coalesce(l.max_users, 20) AS max_users,
            (SELECT count(*) FROM public.profiles p WHERE p.clinica_id = c.id AND p.ativo) AS users_used,
            coalesce(l.max_ai_tokens, ai.limite_mensal_clinica, 100000) AS max_ai_tokens,
            (SELECT coalesce(sum(a.input_tokens + a.output_tokens), 0)
               FROM public.platform_ai_usage a
              WHERE a.clinica_id = c.id AND a.created_at >= date_trunc('month', now())) AS ai_tokens_used,
            coalesce(l.max_notifications, 5000) AS max_notifications,
            (SELECT count(*)
               FROM public.notification_queue n
              WHERE n.clinica_id = c.id
                AND n.status = 'enviado'
                AND n.enviado_em >= date_trunc('month', now())) AS notifications_used
          FROM public.clinicas c
          LEFT JOIN public.platform_tenant_limits l ON l.clinica_id = c.id
          CROSS JOIN public.platform_ai_config ai
        ) x
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_usage_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_usage_overview() TO authenticated;
