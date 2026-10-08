-- Salva configurações compartilhadas sem sobrescrever alterações feitas por outro administrador.
-- Dados da clínica e o JSON de configuração são gravados na mesma transação.
BEGIN;

CREATE OR REPLACE FUNCTION public.salvar_configuracao_clinica_segura(
  p_chave text,
  p_valor jsonb,
  p_versao_esperada timestamptz
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_clinica_id uuid := public.get_my_clinica_id();
  v_config_id uuid;
  v_versao_atual timestamptz;
  v_nova_versao timestamptz := clock_timestamp();
  v_encontrada boolean;
BEGIN
  IF auth.uid() IS NULL OR v_clinica_id IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas um administrador da clínica pode salvar estas configurações.';
  END IF;
  IF p_chave IS NULL OR p_chave NOT IN ('config_clinica', 'config_impressao', 'config_seguranca') THEN
    RAISE EXCEPTION 'Esta configuração não pode ser gravada por este fluxo.';
  END IF;
  IF jsonb_typeof(p_valor) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'O conteúdo da configuração é inválido.';
  END IF;
  IF p_chave = 'config_clinica'
     AND NULLIF(trim(p_valor->>'nomeClinica'), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o nome da clínica antes de salvar.';
  END IF;

  -- Serializa gravações da clínica e mantém uma ordem de bloqueios consistente.
  PERFORM 1 FROM public.clinicas WHERE id = v_clinica_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clínica não encontrada.';
  END IF;

  SELECT c.id, c.updated_at INTO v_config_id, v_versao_atual
    FROM public.configuracoes_clinica c
   WHERE c.clinica_id = v_clinica_id AND c.chave = p_chave
   FOR UPDATE;
  v_encontrada := FOUND;

  IF v_encontrada THEN
    IF p_versao_esperada IS NULL OR v_versao_atual IS DISTINCT FROM p_versao_esperada THEN
      RAISE EXCEPTION 'Outra pessoa atualizou esta configuração. Recarregue a página e confira os dados antes de salvar novamente.';
    END IF;

    UPDATE public.configuracoes_clinica
       SET valor = p_valor, updated_at = v_nova_versao
     WHERE id = v_config_id;
  ELSE
    IF p_versao_esperada IS NOT NULL THEN
      RAISE EXCEPTION 'Esta configuração foi removida ou alterada. Recarregue a página antes de salvar novamente.';
    END IF;

    INSERT INTO public.configuracoes_clinica (user_id, clinica_id, chave, valor, updated_at)
    VALUES (auth.uid(), v_clinica_id, p_chave, p_valor, v_nova_versao);
  END IF;

  IF p_chave = 'config_clinica' THEN
    UPDATE public.clinicas
       SET nome = trim(p_valor->>'nomeClinica'),
           cnpj = NULLIF(trim(p_valor->>'cnpj'), '')
     WHERE id = v_clinica_id;
  END IF;

  RETURN v_nova_versao;
END;
$$;

REVOKE ALL ON FUNCTION public.salvar_configuracao_clinica_segura(text, jsonb, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_configuracao_clinica_segura(text, jsonb, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.salvar_configuracao_clinica_segura(text, jsonb, timestamptz) IS
  'Salva configurações compartilhadas com controle otimista de versão; nome/CNPJ e dados JSON da clínica são atômicos.';

COMMIT;
