-- Publicação atômica da configuração de IA, histórico append-only e métricas
-- agregadas. Evita salvar a configuração ativa sem registrar a versão do prompt.
CREATE OR REPLACE FUNCTION public.platform_publish_ai_config(
  p_expected_version integer,
  p_ativo boolean,
  p_modelo_principal text,
  p_modelo_fallback text,
  p_temperatura numeric,
  p_max_tokens integer,
  p_limite_mensal_clinica integer,
  p_prompt_base text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config public.platform_ai_config;
  v_next_version integer;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso restrito';
  END IF;

  IF p_expected_version IS NULL THEN
    RAISE EXCEPTION 'Atualize a página antes de publicar a configuração';
  END IF;

  IF p_modelo_principal IS NULL OR p_modelo_principal !~ '^[A-Za-z0-9._-]{2,100}$' THEN
    RAISE EXCEPTION 'Informe um identificador válido para o modelo principal';
  END IF;
  IF p_modelo_fallback IS NOT NULL AND (
    p_modelo_fallback !~ '^[A-Za-z0-9._-]{2,100}$' OR p_modelo_fallback = p_modelo_principal
  ) THEN
    RAISE EXCEPTION 'O modelo alternativo deve ser válido e diferente do principal';
  END IF;
  IF p_temperatura IS NULL OR p_temperatura < 0 OR p_temperatura > 2 THEN
    RAISE EXCEPTION 'A temperatura deve ficar entre 0 e 2';
  END IF;
  IF p_max_tokens IS NULL OR p_max_tokens < 100 OR p_max_tokens > 16000 THEN
    RAISE EXCEPTION 'O máximo de tokens deve ficar entre 100 e 16000';
  END IF;
  IF p_limite_mensal_clinica IS NULL OR p_limite_mensal_clinica < 1 THEN
    RAISE EXCEPTION 'O limite mensal por clínica deve ser maior que zero';
  END IF;
  IF p_prompt_base IS NULL OR length(trim(p_prompt_base)) < 20 OR length(p_prompt_base) > 20000 THEN
    RAISE EXCEPTION 'O prompt base deve ter entre 20 e 20000 caracteres';
  END IF;

  SELECT * INTO v_config
    FROM public.platform_ai_config
   WHERE id = true
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Configuração de IA não encontrada';
  END IF;
  IF v_config.versao <> p_expected_version THEN
    RAISE EXCEPTION 'A configuração mudou desde que a página foi aberta. Atualize antes de publicar.';
  END IF;

  v_next_version := v_config.versao + 1;

  UPDATE public.platform_ai_config
     SET ativo = p_ativo,
         modelo_principal = trim(p_modelo_principal),
         modelo_fallback = nullif(trim(p_modelo_fallback), ''),
         temperatura = p_temperatura,
         max_tokens = p_max_tokens,
         limite_mensal_clinica = p_limite_mensal_clinica,
         prompt_base = trim(p_prompt_base),
         versao = v_next_version,
         updated_at = now(),
         updated_by = auth.uid()
   WHERE id = true
   RETURNING * INTO v_config;

  INSERT INTO public.platform_ai_prompt_versions(versao, prompt, modelo, criado_por)
  VALUES(v_next_version, v_config.prompt_base, v_config.modelo_principal, auth.uid());

  INSERT INTO public.audit_log(user_id, action, collection, record_id, changes)
  VALUES(
    auth.uid(), 'update', 'platform_ai_config', 'true',
    jsonb_build_object(
      'versao', v_next_version,
      'ativo', v_config.ativo,
      'modelo_principal', v_config.modelo_principal,
      'modelo_fallback', v_config.modelo_fallback,
      'limite_mensal_clinica', v_config.limite_mensal_clinica
    )
  );

  RETURN to_jsonb(v_config);
END;
$$;

REVOKE ALL ON FUNCTION public.platform_publish_ai_config(integer, boolean, text, text, numeric, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_publish_ai_config(integer, boolean, text, text, numeric, integer, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_ai_usage_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_start timestamptz := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_summary jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso restrito';
  END IF;

  SELECT jsonb_build_object(
    'period_start', v_period_start,
    'requests', count(*),
    'failed_requests', count(*) FILTER (WHERE sucesso = false),
    'input_tokens', coalesce(sum(input_tokens), 0),
    'output_tokens', coalesce(sum(output_tokens), 0),
    'total_tokens', coalesce(sum(input_tokens + output_tokens), 0),
    'estimated_cost', coalesce(sum(custo_estimado), 0)
  )
    INTO v_summary
    FROM public.platform_ai_usage
   WHERE created_at >= v_period_start;

  RETURN v_summary;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_ai_usage_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_ai_usage_summary() TO authenticated;

-- A tabela de consumo tem um registro por chamada; a tela de cotas recebe
-- somente os totais, nunca a lista de eventos individuais.
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
              WHERE n.clinica_id = c.id AND n.created_at >= date_trunc('month', now())) AS notifications_used
          FROM public.clinicas c
          LEFT JOIN public.platform_tenant_limits l ON l.clinica_id = c.id
          CROSS JOIN public.platform_ai_config ai
        ) x
    ), '[]'::jsonb)
  );
END;
$$;

-- Uma versão publicada não pode ser editada ou removida, mesmo por um admin.
CREATE OR REPLACE FUNCTION public.prevent_platform_ai_prompt_version_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Versões publicadas do prompt são imutáveis';
END;
$$;

DROP TRIGGER IF EXISTS platform_ai_prompt_versions_immutable ON public.platform_ai_prompt_versions;
CREATE TRIGGER platform_ai_prompt_versions_immutable
  BEFORE UPDATE OR DELETE ON public.platform_ai_prompt_versions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_platform_ai_prompt_version_change();
