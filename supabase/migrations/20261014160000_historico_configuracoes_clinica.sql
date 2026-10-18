BEGIN;

CREATE TABLE IF NOT EXISTS public.configuracoes_clinica_versoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  chave text NOT NULL CHECK (chave IN ('config_clinica', 'config_impressao', 'config_seguranca')),
  valor jsonb NOT NULL CHECK (jsonb_typeof(valor) = 'object'),
  alterado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  operacao text NOT NULL DEFAULT 'salvar' CHECK (operacao IN ('inicial', 'salvar', 'restaurar')),
  restaurada_de uuid REFERENCES public.configuracoes_clinica_versoes(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS configuracoes_clinica_versoes_historico_idx
  ON public.configuracoes_clinica_versoes (clinica_id, chave, criado_em DESC);
CREATE INDEX IF NOT EXISTS configuracoes_clinica_versoes_restaurada_de_idx
  ON public.configuracoes_clinica_versoes (restaurada_de)
  WHERE restaurada_de IS NOT NULL;

ALTER TABLE public.configuracoes_clinica_versoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS configuracoes_clinica_versoes_admin_select ON public.configuracoes_clinica_versoes;
CREATE POLICY configuracoes_clinica_versoes_admin_select
  ON public.configuracoes_clinica_versoes
  FOR SELECT TO authenticated
  USING (clinica_id = public.get_my_clinica_id() AND public.is_admin(auth.uid()));

REVOKE ALL ON TABLE public.configuracoes_clinica_versoes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.configuracoes_clinica_versoes TO authenticated;

-- Estado atual vira baseline sem atribuir a alteração a um usuário que não pode ser inferido.
INSERT INTO public.configuracoes_clinica_versoes (clinica_id, chave, valor, criado_em, operacao)
SELECT c.clinica_id, c.chave, c.valor, c.updated_at, 'inicial'
  FROM public.configuracoes_clinica c
 WHERE c.clinica_id IS NOT NULL
   AND c.chave IN ('config_clinica', 'config_impressao', 'config_seguranca')
   AND jsonb_typeof(c.valor) = 'object'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.registrar_versao_configuracao_clinica()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_restaurada_de uuid := NULLIF(pg_catalog.current_setting('elolab.config_restore_version_id', true), '')::uuid;
BEGIN
  IF NEW.clinica_id IS NULL OR NEW.chave IS NULL
     OR NEW.chave NOT IN ('config_clinica', 'config_impressao', 'config_seguranca')
     OR pg_catalog.jsonb_typeof(NEW.valor) IS DISTINCT FROM 'object' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.valor IS NOT DISTINCT FROM NEW.valor THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.configuracoes_clinica_versoes
    (clinica_id, chave, valor, alterado_por, criado_em, operacao, restaurada_de)
  VALUES (
    NEW.clinica_id,
    NEW.chave,
    NEW.valor,
    auth.uid(),
    pg_catalog.clock_timestamp(),
    CASE WHEN v_restaurada_de IS NULL THEN 'salvar' ELSE 'restaurar' END,
    v_restaurada_de
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_versao_configuracao_clinica() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_registrar_versao_configuracao_clinica ON public.configuracoes_clinica;
DROP TRIGGER IF EXISTS trg_registrar_versao_configuracao_clinica ON public.configuracoes_clinica;
CREATE TRIGGER trg_registrar_versao_configuracao_clinica
  AFTER INSERT OR UPDATE OF valor ON public.configuracoes_clinica
  FOR EACH ROW EXECUTE FUNCTION public.registrar_versao_configuracao_clinica();

CREATE OR REPLACE FUNCTION public.salvar_configuracao_clinica_segura(
  p_chave text,
  p_valor jsonb,
  p_versao_esperada timestamptz
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
  IF p_chave = 'config_clinica' AND NULLIF(trim(p_valor->>'nomeClinica'), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o nome da clínica antes de salvar.';
  END IF;

  PERFORM 1 FROM public.clinicas WHERE id = v_clinica_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clínica não encontrada.'; END IF;

  SELECT c.id, c.updated_at INTO v_config_id, v_versao_atual
    FROM public.configuracoes_clinica c
   WHERE c.clinica_id = v_clinica_id AND c.chave = p_chave
   FOR UPDATE;
  v_encontrada := FOUND;

  IF v_encontrada THEN
    IF p_versao_esperada IS NULL OR v_versao_atual IS DISTINCT FROM p_versao_esperada THEN
      RAISE EXCEPTION 'Outra pessoa atualizou esta configuração. Recarregue a página e confira os dados antes de salvar novamente.';
    END IF;
    UPDATE public.configuracoes_clinica SET valor = p_valor, updated_at = v_nova_versao WHERE id = v_config_id;
  ELSE
    IF p_versao_esperada IS NOT NULL THEN
      RAISE EXCEPTION 'Esta configuração foi removida ou alterada. Recarregue a página antes de salvar novamente.';
    END IF;
    INSERT INTO public.configuracoes_clinica (user_id, clinica_id, chave, valor, updated_at)
    VALUES (auth.uid(), v_clinica_id, p_chave, p_valor, v_nova_versao);
  END IF;

  IF p_chave = 'config_clinica' THEN
    UPDATE public.clinicas SET nome = trim(p_valor->>'nomeClinica'), cnpj = NULLIF(trim(p_valor->>'cnpj'), '')
     WHERE id = v_clinica_id;
  END IF;

  RETURN v_nova_versao;
END;
$$;

REVOKE ALL ON FUNCTION public.salvar_configuracao_clinica_segura(text, jsonb, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_configuracao_clinica_segura(text, jsonb, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.restaurar_configuracao_clinica_versao(
  p_versao_id uuid,
  p_versao_esperada timestamptz
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clinica_id uuid := public.get_my_clinica_id();
  v_chave text;
  v_valor jsonb;
  v_config_id uuid;
  v_versao_atual timestamptz;
  v_nova_versao timestamptz := clock_timestamp();
BEGIN
  IF auth.uid() IS NULL OR v_clinica_id IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas um administrador da clínica pode restaurar configurações.';
  END IF;
  IF p_versao_esperada IS NULL THEN
    RAISE EXCEPTION 'Atualize a configuração antes de restaurar uma versão.';
  END IF;

  PERFORM 1 FROM public.clinicas WHERE id = v_clinica_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clínica não encontrada.'; END IF;

  SELECT v.chave, v.valor INTO v_chave, v_valor
    FROM public.configuracoes_clinica_versoes v
   WHERE v.id = p_versao_id AND v.clinica_id = v_clinica_id
   FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Versão indisponível para esta clínica.'; END IF;

  SELECT c.id, c.updated_at INTO v_config_id, v_versao_atual
    FROM public.configuracoes_clinica c
   WHERE c.clinica_id = v_clinica_id AND c.chave = v_chave
   FOR UPDATE;
  IF NOT FOUND OR v_versao_atual IS DISTINCT FROM p_versao_esperada THEN
    RAISE EXCEPTION 'Outra pessoa atualizou esta configuração. Recarregue e compare novamente.';
  END IF;

  IF v_chave = 'config_clinica' AND NULLIF(trim(v_valor->>'nomeClinica'), '') IS NULL THEN
    RAISE EXCEPTION 'A versão selecionada não possui um nome válido para a clínica.';
  END IF;
  PERFORM pg_catalog.set_config('elolab.config_restore_version_id', p_versao_id::text, true);
  UPDATE public.configuracoes_clinica SET valor = v_valor, updated_at = v_nova_versao WHERE id = v_config_id;
  PERFORM pg_catalog.set_config('elolab.config_restore_version_id', '', true);
  IF v_chave = 'config_clinica' THEN
    UPDATE public.clinicas SET nome = trim(v_valor->>'nomeClinica'), cnpj = NULLIF(trim(v_valor->>'cnpj'), '')
     WHERE id = v_clinica_id;
  END IF;
  RETURN v_nova_versao;
END;
$$;

REVOKE ALL ON FUNCTION public.restaurar_configuracao_clinica_versao(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restaurar_configuracao_clinica_versao(uuid, timestamptz) TO authenticated;

COMMENT ON TABLE public.configuracoes_clinica_versoes IS
  'Snapshots imutáveis das configurações administrativas da clínica; restauração cria uma nova versão.';

COMMIT;
