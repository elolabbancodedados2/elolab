-- Financeiro gerencial: plano de contas e DRE.
--
-- `plano_contas` guarda as contas gerenciais da clínica, cada uma ligada a um
-- grupo fixo da DRE. `plano_contas_categorias` liga o texto livre da categoria
-- de `lancamentos` (por natureza) a uma conta. A DRE é montada no cliente com
-- os valores realizados de `lancamentos`/`pagamentos`, que esta migration só lê:
-- nenhuma coluna, policy ou trigger de `lancamentos`, `pagamentos` ou
-- `pagamentos_mercadopago` é alterada.
--
-- Regras de natureza por grupo:
--   receita_bruta                       -> só receita
--   deducoes, custos_servicos, despesas_* -> só despesa
--   resultado_financeiro, outras        -> receita ou despesa
--
-- Idempotente: pode ser executada mais de uma vez.
BEGIN;

CREATE TABLE IF NOT EXISTS public.plano_contas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  nome text NOT NULL,
  natureza text NOT NULL,
  grupo_dre text NOT NULL,
  pai_id uuid REFERENCES public.plano_contas(id) ON DELETE RESTRICT,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plano_contas_codigo_unico UNIQUE (clinica_id, codigo),
  CONSTRAINT plano_contas_codigo_formato CHECK (codigo ~ '^[0-9A-Za-z]+([.][0-9A-Za-z]+)*$' AND char_length(codigo) <= 30),
  CONSTRAINT plano_contas_nome_tamanho CHECK (char_length(btrim(nome)) BETWEEN 2 AND 120),
  CONSTRAINT plano_contas_natureza_valida CHECK (natureza IN ('receita', 'despesa')),
  CONSTRAINT plano_contas_grupo_dre_valido CHECK (grupo_dre IN (
    'receita_bruta',
    'deducoes',
    'custos_servicos',
    'despesas_pessoal',
    'despesas_administrativas',
    'despesas_ocupacao',
    'despesas_marketing',
    'resultado_financeiro',
    'outras'
  )),
  CONSTRAINT plano_contas_natureza_do_grupo CHECK (
    (grupo_dre = 'receita_bruta' AND natureza = 'receita')
    OR (grupo_dre IN ('deducoes', 'custos_servicos', 'despesas_pessoal', 'despesas_administrativas',
                      'despesas_ocupacao', 'despesas_marketing') AND natureza = 'despesa')
    OR grupo_dre IN ('resultado_financeiro', 'outras')
  ),
  CONSTRAINT plano_contas_pai_distinto CHECK (pai_id IS NULL OR pai_id <> id)
);

COMMENT ON TABLE public.plano_contas IS
  'Plano de contas gerencial da clínica. Cada conta pertence a um grupo fixo da DRE.';
COMMENT ON COLUMN public.plano_contas.pai_id IS
  'Conta agrupadora (opcional), sempre da mesma clínica. Serve só para organizar a árvore.';

CREATE TABLE IF NOT EXISTS public.plano_contas_categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  natureza text NOT NULL,
  categoria text NOT NULL,
  conta_id uuid NOT NULL REFERENCES public.plano_contas(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plano_contas_categorias_unica UNIQUE (clinica_id, natureza, categoria),
  CONSTRAINT plano_contas_categorias_natureza_valida CHECK (natureza IN ('receita', 'despesa')),
  CONSTRAINT plano_contas_categorias_categoria_tamanho CHECK (char_length(categoria) BETWEEN 1 AND 120)
);

COMMENT ON TABLE public.plano_contas_categorias IS
  'Liga o texto da categoria de lancamentos (por natureza) a uma conta do plano de contas.';

-- As restrições UNIQUE começam por clinica_id e já servem de índice por clínica.
CREATE INDEX IF NOT EXISTS plano_contas_pai_idx
  ON public.plano_contas (pai_id) WHERE pai_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS plano_contas_categorias_conta_idx
  ON public.plano_contas_categorias (conta_id);

-- updated_at
DROP TRIGGER IF EXISTS plano_contas_updated_at ON public.plano_contas;
CREATE TRIGGER plano_contas_updated_at
  BEFORE UPDATE ON public.plano_contas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS plano_contas_categorias_updated_at ON public.plano_contas_categorias;
CREATE TRIGGER plano_contas_categorias_updated_at
  BEFORE UPDATE ON public.plano_contas_categorias
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Conta pai: mesma clínica e sem ciclo.
CREATE OR REPLACE FUNCTION public.validar_plano_contas_pai()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica uuid;
  v_atual uuid;
  v_passos integer := 0;
BEGIN
  IF NEW.pai_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT clinica_id INTO v_clinica FROM public.plano_contas WHERE id = NEW.pai_id;
  IF v_clinica IS NULL OR v_clinica <> NEW.clinica_id THEN
    RAISE EXCEPTION 'A conta pai precisa ser da mesma clínica.' USING ERRCODE = '23514';
  END IF;

  v_atual := NEW.pai_id;
  WHILE v_atual IS NOT NULL LOOP
    IF v_atual = NEW.id THEN
      RAISE EXCEPTION 'A conta não pode ficar abaixo dela mesma.' USING ERRCODE = '23514';
    END IF;
    v_passos := v_passos + 1;
    IF v_passos > 20 THEN
      RAISE EXCEPTION 'O plano de contas aceita no máximo 20 níveis.' USING ERRCODE = '23514';
    END IF;
    SELECT pai_id INTO v_atual FROM public.plano_contas WHERE id = v_atual;
  END LOOP;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validar_plano_contas_pai() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS plano_contas_validar_pai ON public.plano_contas;
CREATE TRIGGER plano_contas_validar_pai
  BEFORE INSERT OR UPDATE OF pai_id, clinica_id ON public.plano_contas
  FOR EACH ROW EXECUTE FUNCTION public.validar_plano_contas_pai();

-- Vínculo de categoria: conta da mesma clínica e da mesma natureza.
CREATE OR REPLACE FUNCTION public.validar_plano_contas_categoria()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica uuid;
  v_natureza text;
BEGIN
  SELECT clinica_id, natureza INTO v_clinica, v_natureza
  FROM public.plano_contas WHERE id = NEW.conta_id;

  IF v_clinica IS NULL OR v_clinica <> NEW.clinica_id THEN
    RAISE EXCEPTION 'A conta precisa ser da mesma clínica da categoria.' USING ERRCODE = '23514';
  END IF;
  IF v_natureza <> NEW.natureza THEN
    RAISE EXCEPTION 'A conta escolhida é de %, mas a categoria é de %.', v_natureza, NEW.natureza
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validar_plano_contas_categoria() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS plano_contas_categorias_validar ON public.plano_contas_categorias;
CREATE TRIGGER plano_contas_categorias_validar
  BEFORE INSERT OR UPDATE OF conta_id, clinica_id, natureza ON public.plano_contas_categorias
  FOR EACH ROW EXECUTE FUNCTION public.validar_plano_contas_categoria();

-- Uma conta com vínculos não pode trocar de natureza (os vínculos ficariam inválidos).
CREATE OR REPLACE FUNCTION public.proteger_natureza_plano_contas()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.natureza IS DISTINCT FROM OLD.natureza AND EXISTS (
    SELECT 1 FROM public.plano_contas_categorias c WHERE c.conta_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Esta conta tem categorias vinculadas; desfaça os vínculos antes de mudar a natureza.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.proteger_natureza_plano_contas() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS plano_contas_proteger_natureza ON public.plano_contas;
CREATE TRIGGER plano_contas_proteger_natureza
  BEFORE UPDATE OF natureza ON public.plano_contas
  FOR EACH ROW EXECUTE FUNCTION public.proteger_natureza_plano_contas();

-- RLS: leitura para quem acessa o financeiro; escrita só admin e financeiro,
-- sempre na própria clínica. Contas não são apagadas, só desativadas.
ALTER TABLE public.plano_contas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plano_contas_categorias ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.plano_contas FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.plano_contas_categorias FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.plano_contas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plano_contas_categorias TO authenticated;

DROP POLICY IF EXISTS plano_contas_select ON public.plano_contas;
CREATE POLICY plano_contas_select ON public.plano_contas
  FOR SELECT TO authenticated
  USING (public.can_access_financial(auth.uid()) AND public.is_same_clinica(clinica_id));

DROP POLICY IF EXISTS plano_contas_insert ON public.plano_contas;
CREATE POLICY plano_contas_insert ON public.plano_contas
  FOR INSERT TO authenticated
  WITH CHECK ((public.is_admin(auth.uid()) OR public.is_financeiro(auth.uid())) AND public.is_same_clinica(clinica_id));

DROP POLICY IF EXISTS plano_contas_update ON public.plano_contas;
CREATE POLICY plano_contas_update ON public.plano_contas
  FOR UPDATE TO authenticated
  USING ((public.is_admin(auth.uid()) OR public.is_financeiro(auth.uid())) AND public.is_same_clinica(clinica_id))
  WITH CHECK ((public.is_admin(auth.uid()) OR public.is_financeiro(auth.uid())) AND public.is_same_clinica(clinica_id));

DROP POLICY IF EXISTS plano_contas_categorias_select ON public.plano_contas_categorias;
CREATE POLICY plano_contas_categorias_select ON public.plano_contas_categorias
  FOR SELECT TO authenticated
  USING (public.can_access_financial(auth.uid()) AND public.is_same_clinica(clinica_id));

DROP POLICY IF EXISTS plano_contas_categorias_insert ON public.plano_contas_categorias;
CREATE POLICY plano_contas_categorias_insert ON public.plano_contas_categorias
  FOR INSERT TO authenticated
  WITH CHECK ((public.is_admin(auth.uid()) OR public.is_financeiro(auth.uid())) AND public.is_same_clinica(clinica_id));

DROP POLICY IF EXISTS plano_contas_categorias_update ON public.plano_contas_categorias;
CREATE POLICY plano_contas_categorias_update ON public.plano_contas_categorias
  FOR UPDATE TO authenticated
  USING ((public.is_admin(auth.uid()) OR public.is_financeiro(auth.uid())) AND public.is_same_clinica(clinica_id))
  WITH CHECK ((public.is_admin(auth.uid()) OR public.is_financeiro(auth.uid())) AND public.is_same_clinica(clinica_id));

DROP POLICY IF EXISTS plano_contas_categorias_delete ON public.plano_contas_categorias;
CREATE POLICY plano_contas_categorias_delete ON public.plano_contas_categorias
  FOR DELETE TO authenticated
  USING ((public.is_admin(auth.uid()) OR public.is_financeiro(auth.uid())) AND public.is_same_clinica(clinica_id));

-- Plano padrão de clínica médica. Não sobrescreve contas existentes (mesmo
-- código) nem vínculos de categoria já feitos.
CREATE OR REPLACE FUNCTION public.criar_plano_contas_padrao()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_clinica uuid;
  v_contas integer := 0;
  v_vinculos integer := 0;
  v_linhas integer;
BEGIN
  IF v_uid IS NULL OR NOT (public.is_admin(v_uid) OR public.is_financeiro(v_uid)) THEN
    RAISE EXCEPTION 'Sem permissão para criar o plano de contas.' USING ERRCODE = '42501';
  END IF;

  v_clinica := public.current_clinica_id();
  IF v_clinica IS NULL THEN
    RAISE EXCEPTION 'Clínica não identificada.' USING ERRCODE = '42501';
  END IF;

  -- Contas agrupadoras e contas sem pai.
  INSERT INTO public.plano_contas (clinica_id, codigo, nome, natureza, grupo_dre)
  VALUES
    (v_clinica, '1', 'Receitas de serviços', 'receita', 'receita_bruta'),
    (v_clinica, '2', 'Deduções e impostos sobre a receita', 'despesa', 'deducoes'),
    (v_clinica, '3', 'Custos dos serviços prestados', 'despesa', 'custos_servicos'),
    (v_clinica, '4', 'Despesas operacionais', 'despesa', 'despesas_administrativas'),
    (v_clinica, '5', 'Receitas financeiras', 'receita', 'resultado_financeiro'),
    (v_clinica, '6', 'Despesas financeiras e tarifas', 'despesa', 'resultado_financeiro'),
    (v_clinica, '7', 'Outras receitas', 'receita', 'outras'),
    (v_clinica, '8', 'Outras despesas', 'despesa', 'outras')
  ON CONFLICT (clinica_id, codigo) DO NOTHING;
  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  v_contas := v_contas + v_linhas;

  INSERT INTO public.plano_contas (clinica_id, codigo, nome, natureza, grupo_dre, pai_id)
  SELECT v_clinica, f.codigo, f.nome, f.natureza, f.grupo_dre, pai.id
  FROM (VALUES
    ('1.1', 'Consultas e retornos', 'receita', 'receita_bruta', '1'),
    ('1.2', 'Exames e procedimentos', 'receita', 'receita_bruta', '1'),
    ('1.3', 'Convênios', 'receita', 'receita_bruta', '1'),
    ('3.1', 'Honorários e repasses médicos', 'despesa', 'custos_servicos', '3'),
    ('3.2', 'Materiais, medicamentos e insumos', 'despesa', 'custos_servicos', '3'),
    ('4.1', 'Pessoal e encargos', 'despesa', 'despesas_pessoal', '4'),
    ('4.2', 'Administrativas e serviços de terceiros', 'despesa', 'despesas_administrativas', '4'),
    ('4.3', 'Aluguel, condomínio e utilidades', 'despesa', 'despesas_ocupacao', '4'),
    ('4.4', 'Marketing e divulgação', 'despesa', 'despesas_marketing', '4')
  ) AS f(codigo, nome, natureza, grupo_dre, codigo_pai)
  LEFT JOIN public.plano_contas pai ON pai.clinica_id = v_clinica AND pai.codigo = f.codigo_pai
  ON CONFLICT (clinica_id, codigo) DO NOTHING;
  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  v_contas := v_contas + v_linhas;

  -- Vínculos das categorias padrão do app. A conta é ligada só se tiver a
  -- natureza certa (a clínica pode ter reaproveitado o código).
  INSERT INTO public.plano_contas_categorias (clinica_id, natureza, categoria, conta_id)
  SELECT v_clinica, m.natureza, m.categoria, c.id
  FROM (VALUES
    ('receita', 'consulta', '1.1'),
    ('receita', 'retorno', '1.1'),
    ('receita', 'honorario_medico', '1.1'),
    ('receita', 'procedimento', '1.2'),
    ('receita', 'exame', '1.2'),
    ('receita', 'cirurgia', '1.2'),
    ('receita', 'internacao', '1.2'),
    ('receita', 'fisioterapia', '1.2'),
    ('receita', 'psicologia', '1.2'),
    ('receita', 'pediatria', '1.2'),
    ('receita', 'taxa_administrativa', '1.2'),
    ('receita', 'taxa_material', '1.2'),
    ('receita', 'convenio_repasse', '1.3'),
    ('receita', 'outros', '7'),
    ('despesa', 'impostos', '2'),
    ('despesa', 'fornecedores', '3.2'),
    ('despesa', 'folha_pagamento', '4.1'),
    ('despesa', 'servicos', '4.2'),
    ('despesa', 'equipamentos', '4.2'),
    ('despesa', 'aluguel', '4.3'),
    ('despesa', 'marketing', '4.4'),
    ('despesa', 'outros', '8')
  ) AS m(natureza, categoria, codigo)
  JOIN public.plano_contas c
    ON c.clinica_id = v_clinica AND c.codigo = m.codigo AND c.natureza = m.natureza
  ON CONFLICT (clinica_id, natureza, categoria) DO NOTHING;
  GET DIAGNOSTICS v_vinculos = ROW_COUNT;

  RETURN jsonb_build_object('contas_criadas', v_contas, 'categorias_vinculadas', v_vinculos);
END;
$$;

REVOKE ALL ON FUNCTION public.criar_plano_contas_padrao() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_plano_contas_padrao() TO authenticated;

COMMIT;
