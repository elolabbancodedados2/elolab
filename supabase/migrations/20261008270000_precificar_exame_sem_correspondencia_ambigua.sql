-- Evita que o faturamento escolha silenciosamente o primeiro preço parecido.
-- Primeiro tenta nome exato; só usa correspondência parcial quando há uma
-- única opção. Preço local do convênio continua prevalecendo sobre legado global.
BEGIN;

CREATE OR REPLACE FUNCTION public.resolver_preco_exame(
  p_clinica_id uuid, p_convenio_id uuid, p_tipo_exame text
) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_nome text := public.normalizar_nome_exame(p_tipo_exame);
  v_codigo text := (regexp_match(coalesce(p_tipo_exame, ''), '^\s*(exame\s*:\s*)?([a-z]{2,}[0-9]{3,}|[0-9]{5,})', 'i'))[2];
  v_valor numeric;
  v_matches integer;
  v_global boolean := false;
  v_item jsonb;
BEGIN
  IF p_clinica_id IS NULL OR NOT public.is_same_clinica(p_clinica_id) THEN
    RAISE EXCEPTION 'Clinica invalida para resolver o preco do exame';
  END IF;
  IF length(v_nome) < 2 AND v_codigo IS NULL THEN
    RAISE EXCEPTION 'Informe o nome do exame';
  END IF;

  IF p_convenio_id IS NOT NULL THEN
    SELECT count(*) INTO v_matches
      FROM public.precos_exames_convenio p
     WHERE p.convenio_id = p_convenio_id AND p.ativo
       AND p.clinica_id = p_clinica_id
       AND (public.normalizar_nome_exame(p.tipo_exame) = v_nome
         OR (v_codigo IS NOT NULL AND regexp_replace(upper(coalesce(p.codigo_tuss, '')), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(v_codigo), '[^A-Z0-9]', '', 'g')));

    IF v_matches = 0 THEN
      SELECT count(*) INTO v_matches
        FROM public.precos_exames_convenio p
       WHERE p.convenio_id = p_convenio_id AND p.ativo
         AND p.clinica_id IS NULL
         AND (public.normalizar_nome_exame(p.tipo_exame) = v_nome
           OR (v_codigo IS NOT NULL AND regexp_replace(upper(coalesce(p.codigo_tuss, '')), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(v_codigo), '[^A-Z0-9]', '', 'g')));
      v_global := v_matches > 0;
    END IF;

    IF v_matches > 1 THEN
      RAISE EXCEPTION 'Mais de um preço exato encontrado para o exame "%" neste convênio', p_tipo_exame;
    END IF;

    IF v_matches = 0 AND NOT v_global THEN
      SELECT count(*) INTO v_matches
        FROM public.precos_exames_convenio p
       WHERE p.convenio_id = p_convenio_id AND p.ativo
         AND p.clinica_id = p_clinica_id
         AND length(public.normalizar_nome_exame(p.tipo_exame)) >= 4
         AND length(v_nome) >= 4
         AND (public.normalizar_nome_exame(p.tipo_exame) LIKE '%' || v_nome || '%'
           OR v_nome LIKE '%' || public.normalizar_nome_exame(p.tipo_exame) || '%');
    END IF;

    IF v_matches = 0 THEN
      SELECT count(*) INTO v_matches
        FROM public.precos_exames_convenio p
       WHERE p.convenio_id = p_convenio_id AND p.ativo
         AND p.clinica_id IS NULL
         AND length(public.normalizar_nome_exame(p.tipo_exame)) >= 4
         AND length(v_nome) >= 4
         AND (public.normalizar_nome_exame(p.tipo_exame) LIKE '%' || v_nome || '%'
           OR v_nome LIKE '%' || public.normalizar_nome_exame(p.tipo_exame) || '%');
      v_global := true;
    END IF;

    IF v_matches > 1 THEN
      RAISE EXCEPTION 'O exame "%" combina com vários preços deste convênio. Informe o nome exato e revise a tabela', p_tipo_exame;
    END IF;

    IF v_matches = 1 THEN
      SELECT coalesce(nullif(p.valor_total, 0), nullif(p.valor_tabela, 0)) INTO v_valor
        FROM public.precos_exames_convenio p
       WHERE p.convenio_id = p_convenio_id AND p.ativo
         AND ((v_global AND p.clinica_id IS NULL) OR (NOT v_global AND p.clinica_id = p_clinica_id))
         AND (
           public.normalizar_nome_exame(p.tipo_exame) = v_nome
           OR (v_codigo IS NOT NULL AND regexp_replace(upper(coalesce(p.codigo_tuss, '')), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(v_codigo), '[^A-Z0-9]', '', 'g'))
           OR (length(public.normalizar_nome_exame(p.tipo_exame)) >= 4 AND length(v_nome) >= 4
             AND (public.normalizar_nome_exame(p.tipo_exame) LIKE '%' || v_nome || '%'
               OR v_nome LIKE '%' || public.normalizar_nome_exame(p.tipo_exame) || '%'))
         )
       ORDER BY (public.normalizar_nome_exame(p.tipo_exame) = v_nome) DESC, p.updated_at DESC NULLS LAST
       LIMIT 1;
      IF coalesce(v_valor, 0) > 0 THEN RETURN v_valor; END IF;
    END IF;
  END IF;

  SELECT count(*) INTO v_matches
    FROM public.configuracoes_clinica c
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(c.valor) = 'array' THEN c.valor ELSE '[]'::jsonb END
    ) item
   WHERE c.clinica_id = p_clinica_id AND c.chave = 'precos_exames_internos'
       AND (public.normalizar_nome_exame(item->>'nome') = v_nome
         OR (v_codigo IS NOT NULL AND regexp_replace(upper(coalesce(item->>'codigo_tuss', '')), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(v_codigo), '[^A-Z0-9]', '', 'g')));

  IF v_matches > 1 THEN
    RAISE EXCEPTION 'Mais de um preço particular exato encontrado para o exame "%"', p_tipo_exame;
  END IF;

  IF v_matches = 0 THEN
    SELECT count(*) INTO v_matches
      FROM public.configuracoes_clinica c
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(c.valor) = 'array' THEN c.valor ELSE '[]'::jsonb END
      ) item
     WHERE c.clinica_id = p_clinica_id AND c.chave = 'precos_exames_internos'
       AND length(public.normalizar_nome_exame(item->>'nome')) >= 4
       AND length(v_nome) >= 4
       AND (public.normalizar_nome_exame(item->>'nome') LIKE '%' || v_nome || '%'
         OR v_nome LIKE '%' || public.normalizar_nome_exame(item->>'nome') || '%');
    IF v_matches > 1 THEN
      RAISE EXCEPTION 'O exame "%" combina com vários preços particulares. Informe o nome exato e revise a tabela', p_tipo_exame;
    END IF;
  END IF;

  IF v_matches = 1 THEN
    SELECT item INTO v_item
      FROM public.configuracoes_clinica c
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(c.valor) = 'array' THEN c.valor ELSE '[]'::jsonb END
      ) item
     WHERE c.clinica_id = p_clinica_id AND c.chave = 'precos_exames_internos'
       AND (
         public.normalizar_nome_exame(item->>'nome') = v_nome
         OR (v_codigo IS NOT NULL AND regexp_replace(upper(coalesce(item->>'codigo_tuss', '')), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(v_codigo), '[^A-Z0-9]', '', 'g'))
         OR (length(public.normalizar_nome_exame(item->>'nome')) >= 4 AND length(v_nome) >= 4
           AND (public.normalizar_nome_exame(item->>'nome') LIKE '%' || v_nome || '%'
             OR v_nome LIKE '%' || public.normalizar_nome_exame(item->>'nome') || '%'))
       )
     LIMIT 1;
    v_valor := coalesce(nullif((v_item->>'valor')::numeric, 0), nullif((v_item->>'preco_venda')::numeric, 0));
    IF coalesce(v_valor, 0) > 0 THEN RETURN v_valor; END IF;
  END IF;

  SELECT count(*) INTO v_matches
    FROM public.tipo_exames_catalog t
   WHERE t.clinica_id = p_clinica_id AND t.ativo
     AND (public.normalizar_nome_exame(t.nome) = v_nome
       OR (v_codigo IS NOT NULL AND regexp_replace(upper(coalesce(t.codigo_tuss, '')), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(v_codigo), '[^A-Z0-9]', '', 'g'))
       OR public.normalizar_nome_exame(coalesce(t.codigo_tuss, '') || ' - ' || t.nome) = v_nome);

  IF v_matches > 1 THEN
    RAISE EXCEPTION 'Mais de um preço exato encontrado no catálogo para o exame "%"', p_tipo_exame;
  END IF;

  IF v_matches = 0 THEN
    SELECT count(*) INTO v_matches
      FROM public.tipo_exames_catalog t
     WHERE t.clinica_id = p_clinica_id AND t.ativo
       AND length(public.normalizar_nome_exame(t.nome)) >= 4
       AND length(v_nome) >= 4
       AND (public.normalizar_nome_exame(t.nome) LIKE '%' || v_nome || '%'
         OR v_nome LIKE '%' || public.normalizar_nome_exame(t.nome) || '%');
    IF v_matches > 1 THEN
      RAISE EXCEPTION 'O exame "%" combina com vários preços do catálogo. Informe o nome exato e revise o catálogo', p_tipo_exame;
    END IF;
  END IF;

  IF v_matches = 1 THEN
    SELECT nullif(t.preco_venda, 0) INTO v_valor
      FROM public.tipo_exames_catalog t
     WHERE t.clinica_id = p_clinica_id AND t.ativo
       AND (
         public.normalizar_nome_exame(t.nome) = v_nome
         OR (v_codigo IS NOT NULL AND regexp_replace(upper(coalesce(t.codigo_tuss, '')), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(v_codigo), '[^A-Z0-9]', '', 'g'))
         OR public.normalizar_nome_exame(coalesce(t.codigo_tuss, '') || ' - ' || t.nome) = v_nome
         OR (length(public.normalizar_nome_exame(t.nome)) >= 4 AND length(v_nome) >= 4
           AND (public.normalizar_nome_exame(t.nome) LIKE '%' || v_nome || '%'
             OR v_nome LIKE '%' || public.normalizar_nome_exame(t.nome) || '%'))
       )
     ORDER BY (public.normalizar_nome_exame(t.nome) = v_nome) DESC, t.updated_at DESC NULLS LAST
     LIMIT 1;
  END IF;

  RETURN v_valor;
END;
$$;

REVOKE ALL ON FUNCTION public.resolver_preco_exame(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolver_preco_exame(uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.resolver_preco_exame(uuid, uuid, text) IS
  'Resolve preço de exame por nome/código exato; aceita aproximação somente quando única para evitar cobrança ambígua.';

COMMIT;
