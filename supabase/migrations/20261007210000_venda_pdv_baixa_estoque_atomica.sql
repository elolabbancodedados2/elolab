-- Registra uma venda do caixa e baixa os produtos do estoque na mesma
-- transação. A chave idempotente evita duplicar a venda se a resposta da rede
-- se perder depois de o banco confirmar a operação.

CREATE TABLE IF NOT EXISTS public.caixa_vendas_pos_idempotencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  chave text NOT NULL,
  lancamento_id uuid REFERENCES public.lancamentos(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT caixa_vendas_pos_chave_unica UNIQUE (clinica_id, chave)
);

ALTER TABLE public.caixa_vendas_pos_idempotencia ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.registrar_venda_pdv(
  p_chave text,
  p_clinica_id uuid,
  p_paciente_id uuid,
  p_data date,
  p_descricao text,
  p_valor_cobrado numeric,
  p_valor_pago numeric,
  p_forma_pagamento text,
  p_produtos jsonb DEFAULT '[]'::jsonb,
  p_exames jsonb DEFAULT '[]'::jsonb
)
RETURNS TABLE (lancamento_id uuid, ja_registrada boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_usuario_id uuid := auth.uid();
  v_reserva_id uuid;
  v_lancamento_id uuid;
  v_item record;
  v_estoque public.estoque%ROWTYPE;
BEGIN
  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida. Entre novamente para registrar a venda.';
  END IF;

  IF NOT (
    public.is_admin(v_usuario_id)
    OR public.is_recepcao(v_usuario_id)
    OR public.can_access_financial(v_usuario_id)
  ) THEN
    RAISE EXCEPTION 'Seu perfil não pode registrar vendas no caixa.';
  END IF;

  IF p_clinica_id IS NULL OR p_clinica_id IS DISTINCT FROM public.get_my_clinica_id() THEN
    RAISE EXCEPTION 'Clínica inválida para esta sessão.';
  END IF;
  IF p_chave IS NULL OR length(trim(p_chave)) < 16 OR length(p_chave) > 120 THEN
    RAISE EXCEPTION 'Chave de segurança da venda inválida.';
  END IF;
  IF p_data IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.caixa_diario c
     WHERE c.clinica_id = p_clinica_id AND c.data = p_data AND c.aberto = true
  ) THEN
    RAISE EXCEPTION 'Abra o caixa da data da venda antes de registrar o pagamento.';
  END IF;
  IF p_descricao IS NULL OR length(trim(p_descricao)) = 0 THEN
    RAISE EXCEPTION 'Informe os itens da venda.';
  END IF;
  IF p_valor_cobrado IS NULL OR p_valor_pago IS NULL
     OR p_valor_cobrado <= 0 OR p_valor_pago <= 0
     OR p_valor_pago > p_valor_cobrado THEN
    RAISE EXCEPTION 'Confira os valores da venda e do pagamento.';
  END IF;
  IF p_forma_pagamento IS NULL OR p_forma_pagamento NOT IN (
    'dinheiro', 'pix', 'credito', 'debito', 'cartao_credito',
    'cartao_debito', 'cheque', 'transferencia', 'convenio', 'boleto'
  ) THEN
    RAISE EXCEPTION 'Forma de pagamento inválida.';
  END IF;
  IF p_produtos IS NULL OR jsonb_typeof(p_produtos) <> 'array' THEN
    RAISE EXCEPTION 'Lista de produtos inválida.';
  END IF;
  IF p_exames IS NULL OR jsonb_typeof(p_exames) <> 'array' THEN
    RAISE EXCEPTION 'Lista de exames inválida.';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(p_produtos) AS x(item)
     WHERE jsonb_typeof(x.item) <> 'object'
        OR COALESCE(x.item->>'item_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        OR COALESCE(x.item->>'quantidade', '') !~ '^[1-9][0-9]*$'
  ) THEN
    RAISE EXCEPTION 'Um dos produtos da venda está inválido.';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(p_exames) AS x(item)
     WHERE jsonb_typeof(x.item) <> 'object'
        OR COALESCE(trim(x.item->>'nome'), '') = ''
        OR COALESCE(x.item->>'quantidade', '') !~ '^[1-9][0-9]*$'
        OR COALESCE(x.item->>'valor', '') !~ '^[0-9]+([.][0-9]{1,2})?$'
  ) THEN
    RAISE EXCEPTION 'Um dos exames da venda está inválido.';
  END IF;
  IF jsonb_array_length(p_exames) > 0 AND p_paciente_id IS NULL THEN
    RAISE EXCEPTION 'Selecione o paciente para registrar os exames vendidos no prontuário.';
  END IF;

  IF p_paciente_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pacientes p
     WHERE p.id = p_paciente_id AND p.clinica_id = p_clinica_id
  ) THEN
    RAISE EXCEPTION 'Paciente não encontrado nesta clínica.';
  END IF;

  -- A reserva da chave e o restante da função pertencem à mesma transação.
  -- Se qualquer baixa ou insert falhar, tudo é desfeito junto.
  INSERT INTO public.caixa_vendas_pos_idempotencia (clinica_id, chave)
  VALUES (p_clinica_id, trim(p_chave))
  ON CONFLICT (clinica_id, chave) DO NOTHING
  RETURNING id INTO v_reserva_id;

  IF v_reserva_id IS NULL THEN
    SELECT i.lancamento_id INTO v_lancamento_id
      FROM public.caixa_vendas_pos_idempotencia i
     WHERE i.clinica_id = p_clinica_id AND i.chave = trim(p_chave)
     FOR UPDATE;
    IF v_lancamento_id IS NULL THEN
      RAISE EXCEPTION 'A venda anterior foi iniciada, mas não pode ser confirmada. Atualize o caixa antes de tentar novamente.';
    END IF;
    RETURN QUERY SELECT v_lancamento_id, true;
    RETURN;
  END IF;

  INSERT INTO public.lancamentos (
    tipo, categoria, descricao, valor, valor_pago, desconto, acrescimo,
    data, data_vencimento, data_pagamento, status, forma_pagamento,
    paciente_id, clinica_id
  ) VALUES (
    'receita', 'receita_caixa', trim(p_descricao), round(p_valor_cobrado, 2),
    round(p_valor_pago, 2), round(p_valor_cobrado - p_valor_pago, 2), 0,
    p_data, p_data, p_data, 'pago', p_forma_pagamento,
    p_paciente_id, p_clinica_id
  ) RETURNING id INTO v_lancamento_id;

  FOR v_item IN
    SELECT (x.item->>'item_id')::uuid AS item_id,
           sum((x.item->>'quantidade')::integer)::integer AS quantidade
      FROM jsonb_array_elements(p_produtos) AS x(item)
     GROUP BY (x.item->>'item_id')::uuid
     ORDER BY (x.item->>'item_id')::uuid
  LOOP
    SELECT e.* INTO v_estoque
      FROM public.estoque e
     WHERE e.id = v_item.item_id AND e.clinica_id = p_clinica_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Um produto da venda não pertence a esta clínica ou foi removido.';
    END IF;
    IF v_estoque.validade IS NOT NULL AND v_estoque.validade < p_data THEN
      RAISE EXCEPTION 'O produto "%" venceu em %. Ele foi removido da venda; confira o estoque.',
        v_estoque.nome, to_char(v_estoque.validade, 'DD/MM/YYYY');
    END IF;
    IF v_estoque.quantidade < v_item.quantidade THEN
      RAISE EXCEPTION 'Estoque insuficiente para "%": há % unidade(s), foram solicitadas %.',
        v_estoque.nome, v_estoque.quantidade, v_item.quantidade;
    END IF;

    UPDATE public.estoque
       SET quantidade = quantidade - v_item.quantidade
     WHERE id = v_estoque.id;

    INSERT INTO public.movimentacoes_estoque (
      item_id, clinica_id, tipo, quantidade, motivo, usuario_id
    ) VALUES (
      v_estoque.id, p_clinica_id, 'saida', v_item.quantidade,
      'Venda no caixa: ' || left(trim(p_descricao), 400), v_usuario_id
    );
  END LOOP;

  FOR v_item IN
    SELECT trim(x.item->>'nome') AS nome,
           sum((x.item->>'quantidade')::integer)::integer AS quantidade,
           (x.item->>'valor')::numeric AS valor
      FROM jsonb_array_elements(p_exames) AS x(item)
     GROUP BY trim(x.item->>'nome'), (x.item->>'valor')::numeric
  LOOP
    INSERT INTO public.exames (
      paciente_id, clinica_id, tipo_exame, status, data_solicitacao,
      data_realizacao, preco_venda, observacoes
    )
    SELECT p_paciente_id, p_clinica_id, v_item.nome, 'realizado', p_data,
           p_data, round(v_item.valor, 2), 'Registrado via Ponto de Venda'
      FROM generate_series(1, v_item.quantidade);
  END LOOP;

  UPDATE public.caixa_vendas_pos_idempotencia
     SET lancamento_id = v_lancamento_id
   WHERE id = v_reserva_id;

  RETURN QUERY SELECT v_lancamento_id, false;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_venda_pdv(text, uuid, uuid, date, text, numeric, numeric, text, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_venda_pdv(text, uuid, uuid, date, text, numeric, numeric, text, jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION public.registrar_venda_pdv(text, uuid, uuid, date, text, numeric, numeric, text, jsonb, jsonb) IS
  'Registra venda do POS, exames vendidos e baixa de estoque atomicamente, com escopo de clínica e idempotência.';
