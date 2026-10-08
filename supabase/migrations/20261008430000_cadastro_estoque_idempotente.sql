-- Repetir um cadastro após timeout não deve criar outro produto nem outro saldo de abertura.
BEGIN;

ALTER TABLE public.estoque
  ADD COLUMN IF NOT EXISTS chave_cadastro uuid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_estoque_chave_cadastro
  ON public.estoque (clinica_id, chave_cadastro)
  WHERE chave_cadastro IS NOT NULL;

DROP FUNCTION IF EXISTS public.cadastrar_item_estoque(
  uuid, text, text, text, integer, integer, integer, integer,
  numeric, numeric, text, text, date, text, text, text, text, text, text
);

CREATE FUNCTION public.cadastrar_item_estoque(
  p_clinica_id uuid,
  p_nome text,
  p_categoria text,
  p_unidade text,
  p_quantidade integer,
  p_quantidade_minima integer,
  p_quantidade_maxima integer,
  p_ponto_pedido integer,
  p_valor_unitario numeric,
  p_valor_venda numeric,
  p_localizacao text,
  p_lote text,
  p_validade date,
  p_fornecedor text,
  p_descricao text,
  p_codigo_ean text,
  p_fabricante text,
  p_principio_ativo text,
  p_dosagem text,
  p_chave_cadastro uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_item_id uuid;
  v_existente public.estoque%ROWTYPE;
  v_nome text := trim(p_nome);
  v_categoria text := trim(p_categoria);
  v_unidade text := trim(p_unidade);
  v_localizacao text := NULLIF(trim(p_localizacao), '');
  v_lote text := NULLIF(trim(p_lote), '');
  v_fornecedor text := NULLIF(trim(p_fornecedor), '');
  v_descricao text := NULLIF(trim(p_descricao), '');
  v_codigo_ean text := NULLIF(trim(p_codigo_ean), '');
  v_fabricante text := NULLIF(trim(p_fabricante), '');
  v_principio_ativo text := NULLIF(trim(p_principio_ativo), '');
  v_dosagem text := NULLIF(trim(p_dosagem), '');
BEGIN
  IF auth.uid() IS NULL OR p_clinica_id IS DISTINCT FROM public.get_my_clinica_id()
     OR NOT (public.is_admin(auth.uid()) OR public.is_enfermagem(auth.uid())) THEN
    RAISE EXCEPTION 'Você não tem permissão para cadastrar itens nesta clínica.';
  END IF;

  IF v_nome IS NULL OR v_nome = '' OR v_categoria IS NULL OR v_categoria = ''
     OR v_unidade IS NULL OR v_unidade = '' THEN
    RAISE EXCEPTION 'Informe nome, categoria e unidade do item.';
  END IF;
  IF p_quantidade IS NULL OR p_quantidade < 0 OR p_quantidade_minima IS NULL OR p_quantidade_minima < 0 THEN
    RAISE EXCEPTION 'Saldo inicial e estoque mínimo devem ser maiores ou iguais a zero.';
  END IF;
  IF p_quantidade_maxima IS NOT NULL AND (p_quantidade_maxima < 1 OR p_quantidade_maxima < p_quantidade) THEN
    RAISE EXCEPTION 'O estoque máximo deve ser maior ou igual ao saldo inicial.';
  END IF;
  IF p_ponto_pedido IS NOT NULL AND p_ponto_pedido < 1 THEN
    RAISE EXCEPTION 'O ponto de pedido deve ser maior que zero.';
  END IF;
  IF p_valor_unitario IS NULL OR p_valor_unitario < 0 OR p_valor_unitario > 99999999.99
     OR p_valor_unitario = 'NaN'::numeric
     OR (p_valor_venda IS NOT NULL AND (p_valor_venda < 0 OR p_valor_venda > 99999999.99 OR p_valor_venda = 'NaN'::numeric)) THEN
    RAISE EXCEPTION 'Custo e preço de venda devem ser valores válidos iguais ou maiores que zero.';
  END IF;

  INSERT INTO public.estoque (
    clinica_id, nome, categoria, unidade, quantidade, quantidade_minima,
    quantidade_maxima, ponto_pedido, valor_unitario, valor_venda, localizacao,
    lote, validade, fornecedor, descricao, codigo_ean, fabricante,
    principio_ativo, dosagem, chave_cadastro
  ) VALUES (
    p_clinica_id, v_nome, v_categoria, v_unidade, p_quantidade,
    p_quantidade_minima, p_quantidade_maxima, p_ponto_pedido, p_valor_unitario,
    p_valor_venda, v_localizacao, v_lote, p_validade, v_fornecedor, v_descricao,
    v_codigo_ean, v_fabricante, v_principio_ativo, v_dosagem, p_chave_cadastro
  )
  ON CONFLICT (clinica_id, chave_cadastro) WHERE chave_cadastro IS NOT NULL DO NOTHING
  RETURNING id INTO v_item_id;

  IF v_item_id IS NULL THEN
    SELECT e.* INTO v_existente
      FROM public.estoque AS e
     WHERE e.clinica_id = p_clinica_id
       AND e.chave_cadastro = p_chave_cadastro
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Não foi possível confirmar o cadastro. Atualize a tela antes de tentar novamente.';
    END IF;

    -- A chave representa a tentativa original; valores atuais podem ter mudado
    -- desde então por edição ou movimentação feita por outra pessoa.
    RETURN v_existente.id;
  END IF;

  IF p_quantidade > 0 THEN
    INSERT INTO public.movimentacoes_estoque (
      item_id, clinica_id, tipo, quantidade, motivo, usuario_id
    ) VALUES (
      v_item_id, p_clinica_id, 'entrada', p_quantidade, 'Saldo de abertura', auth.uid()
    );
  END IF;

  RETURN v_item_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cadastrar_item_estoque(
  uuid, text, text, text, integer, integer, integer, integer,
  numeric, numeric, text, text, date, text, text, text, text, text, text, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cadastrar_item_estoque(
  uuid, text, text, text, integer, integer, integer, integer,
  numeric, numeric, text, text, date, text, text, text, text, text, text, uuid
) TO authenticated;

COMMENT ON FUNCTION public.cadastrar_item_estoque(
  uuid, text, text, text, integer, integer, integer, integer,
  numeric, numeric, text, text, date, text, text, text, text, text, text, uuid
) IS 'Cadastra item e saldo inicial atomicamente; chamadas repetidas com a mesma chave retornam o mesmo item.';

COMMIT;
