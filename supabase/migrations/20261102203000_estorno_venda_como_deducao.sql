-- Estorno de venda do caixa entra como dedução da receita na DRE.
--
-- estornar_venda_pdv grava uma despesa com categoria 'estorno_venda', que não
-- tinha conta no plano padrão: caía em "sem conta" e a receita bruta da venda
-- ficava sem a dedução. O plano padrão passa a ligar a categoria à conta 2
-- (Deduções), e as clínicas que já têm essa conta recebem o vínculo agora.
-- Vínculos que a clínica já fez não são alterados.
-- Definição parte de 20261031120000_plano_contas_dre.sql.
BEGIN;

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
    ('despesa', 'estorno_venda', '2'),
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

INSERT INTO public.plano_contas_categorias (clinica_id, natureza, categoria, conta_id)
SELECT c.clinica_id, 'despesa', 'estorno_venda', c.id
  FROM public.plano_contas c
 WHERE c.codigo = '2' AND c.natureza = 'despesa' AND c.grupo_dre = 'deducoes'
ON CONFLICT (clinica_id, natureza, categoria) DO NOTHING;

COMMIT;
