BEGIN;

-- O saldo e seu histórico só podem ser gravados atomicamente pelos RPCs.
DROP POLICY IF EXISTS estoque_insert ON public.estoque;
CREATE POLICY estoque_insert ON public.estoque
  FOR INSERT TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS movimentacoes_estoque_insert_scoped ON public.movimentacoes_estoque;
DROP POLICY IF EXISTS movimentacoes_estoque_insert ON public.movimentacoes_estoque;
CREATE POLICY movimentacoes_estoque_insert ON public.movimentacoes_estoque
  FOR INSERT TO authenticated
  WITH CHECK (false);

REVOKE INSERT, UPDATE ON public.estoque FROM PUBLIC, anon, authenticated;
GRANT UPDATE (
  nome, descricao, categoria, quantidade_minima, unidade, valor_unitario,
  fornecedor, lote, validade, localizacao, codigo_ean, fabricante, valor_venda,
  quantidade_maxima, ponto_pedido, principio_ativo, dosagem
) ON public.estoque TO authenticated;
REVOKE INSERT ON public.movimentacoes_estoque FROM PUBLIC, anon, authenticated;

-- Preserva a validação e a idempotência existentes, executando a escrita
-- como owner para que os clientes não precisem de INSERT/UPDATE direto.
ALTER FUNCTION public.cadastrar_item_estoque(
  uuid, text, text, text, integer, integer, integer, integer,
  numeric, numeric, text, text, date, text, text, text, text, text, text, uuid
) RENAME TO cadastrar_item_estoque_impl;
REVOKE ALL ON FUNCTION public.cadastrar_item_estoque_impl(
  uuid, text, text, text, integer, integer, integer, integer,
  numeric, numeric, text, text, date, text, text, text, text, text, text, uuid
) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.cadastrar_item_estoque(
  p_clinica_id uuid, p_nome text, p_categoria text, p_unidade text,
  p_quantidade integer, p_quantidade_minima integer, p_quantidade_maxima integer,
  p_ponto_pedido integer, p_valor_unitario numeric, p_valor_venda numeric,
  p_localizacao text, p_lote text, p_validade date, p_fornecedor text,
  p_descricao text, p_codigo_ean text, p_fabricante text,
  p_principio_ativo text, p_dosagem text, p_chave_cadastro uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.cadastrar_item_estoque_impl(
    p_clinica_id, p_nome, p_categoria, p_unidade, p_quantidade,
    p_quantidade_minima, p_quantidade_maxima, p_ponto_pedido,
    p_valor_unitario, p_valor_venda, p_localizacao, p_lote, p_validade,
    p_fornecedor, p_descricao, p_codigo_ean, p_fabricante,
    p_principio_ativo, p_dosagem, p_chave_cadastro
  );
$$;
REVOKE ALL ON FUNCTION public.cadastrar_item_estoque(
  uuid, text, text, text, integer, integer, integer, integer,
  numeric, numeric, text, text, date, text, text, text, text, text, text, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cadastrar_item_estoque(
  uuid, text, text, text, integer, integer, integer, integer,
  numeric, numeric, text, text, date, text, text, text, text, text, text, uuid
) TO authenticated;

ALTER FUNCTION public.registrar_movimentacao_estoque(uuid, text, integer, text, uuid)
  RENAME TO registrar_movimentacao_estoque_impl;
REVOKE ALL ON FUNCTION public.registrar_movimentacao_estoque_impl(uuid, text, integer, text, uuid)
  FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.registrar_movimentacao_estoque(
  p_item_id uuid, p_tipo text, p_quantidade integer, p_motivo text DEFAULT NULL,
  p_chave_idempotencia uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.is_admin(auth.uid()) OR public.is_enfermagem(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Seu perfil não pode movimentar o estoque desta clínica.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public.registrar_movimentacao_estoque_impl(
    p_item_id, p_tipo, p_quantidade, p_motivo, p_chave_idempotencia
  );
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_movimentacao_estoque(uuid, text, integer, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_movimentacao_estoque(uuid, text, integer, text, uuid)
  TO authenticated;

-- O inventário manual é responsabilidade de administração e enfermagem.
-- Financeiro e médico podem consultar conforme as políticas de leitura, mas
-- alterações clínicas usam a RPC de baixa vinculada ao prontuário.
DROP POLICY IF EXISTS estoque_update ON public.estoque;
CREATE POLICY estoque_update ON public.estoque
  FOR UPDATE TO authenticated
  USING (
    (public.is_admin(auth.uid()) OR public.is_enfermagem(auth.uid()))
    AND public.is_same_clinica(clinica_id)
  )
  WITH CHECK (
    (public.is_admin(auth.uid()) OR public.is_enfermagem(auth.uid()))
    AND public.is_same_clinica(clinica_id)
  );

-- Baixas clínicas só podem ocorrer para uma prescrição salva no prontuário
-- vigente do profissional. A função é SECURITY DEFINER para separar esse
-- fluxo específico da permissão genérica de edição do inventário.
CREATE OR REPLACE FUNCTION public.registrar_baixa_estoque(
  p_item_id uuid,
  p_quantidade integer,
  p_prontuario_id uuid DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL,
  p_motivo text DEFAULT NULL
)
RETURNS TABLE (
  item_id uuid,
  quantidade_anterior integer,
  quantidade_nova integer,
  ja_baixado boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_clinica_id uuid := public.get_my_clinica_id();
  v_prontuario_clinica_id uuid;
  v_medico_id uuid;
  v_prontuario_assinado boolean;
  v_item public.estoque%ROWTYPE;
  v_motivo text := NULLIF(trim(p_motivo), '');
  v_quantidade_prescrita numeric := 0;
  v_total_prescricoes bigint := 0;
  v_prescricoes_validas bigint := 0;
  v_quantidade_ja_baixada integer;
BEGIN
  IF auth.uid() IS NULL OR v_clinica_id IS NULL
     OR NOT (public.is_admin(auth.uid()) OR public.is_medico(auth.uid())) THEN
    RAISE EXCEPTION 'Seu perfil não pode registrar uma baixa clínica.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_prontuario_id IS NULL THEN
    RAISE EXCEPTION 'Salve o prontuário antes de registrar a dispensação.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_usuario_id IS NOT NULL AND p_usuario_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'O usuário da movimentação deve ser a sessão autenticada.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_quantidade IS NULL OR p_quantidade < 1 THEN
    RAISE EXCEPTION 'A quantidade da baixa deve ser maior que zero.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT p.clinica_id, p.medico_id, COALESCE(p.assinado, false)
    INTO v_prontuario_clinica_id, v_medico_id, v_prontuario_assinado
    FROM public.prontuarios AS p
   WHERE p.id = p_prontuario_id
   FOR UPDATE;
  IF NOT FOUND OR v_prontuario_clinica_id IS DISTINCT FROM v_clinica_id THEN
    RAISE EXCEPTION 'Prontuário não encontrado nesta clínica.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_prontuario_assinado THEN
    RAISE EXCEPTION 'Prontuário assinado é imutável. Registre um adendo antes de qualquer nova dispensação.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF public.is_medico(auth.uid()) AND NOT public.is_admin(auth.uid())
     AND NOT public.is_medico_responsavel_do_prontuario(v_medico_id) THEN
    RAISE EXCEPTION 'Este prontuário pertence a outro profissional.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT e.* INTO v_item
    FROM public.estoque AS e
   WHERE e.id = p_item_id
     AND e.clinica_id = v_clinica_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item de estoque não encontrado nesta clínica.'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- O cliente agrupa prescrições repetidas para o mesmo item. Repetições
  -- idênticas são no-op; uma soma diferente exige conferência antes de nova baixa.
  SELECT m.quantidade INTO v_quantidade_ja_baixada
    FROM public.movimentacoes_estoque AS m
   WHERE m.item_id = p_item_id
     AND m.prontuario_id = p_prontuario_id
     AND m.clinica_id = v_clinica_id
     AND m.tipo = 'saida'
   LIMIT 1;
  IF FOUND THEN
    IF v_quantidade_ja_baixada IS DISTINCT FROM p_quantidade THEN
      RAISE EXCEPTION 'A quantidade prescrita mudou após a quantidade já dispensada. Confira o prontuário e registre um ajuste manual se necessário.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN QUERY SELECT v_item.id, v_item.quantidade, v_item.quantidade, true;
    RETURN;
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE item.quantidade_normalizada ~ '^[0-9]*[1-9][0-9]*$'),
         COALESCE(sum(
           CASE WHEN item.quantidade_normalizada ~ '^[0-9]*[1-9][0-9]*$'
             THEN item.quantidade_normalizada::numeric ELSE 0 END
         ), 0)
    INTO v_total_prescricoes, v_prescricoes_validas, v_quantidade_prescrita
    FROM (
      SELECT trim(COALESCE(pr.quantidade, '')) AS quantidade_normalizada
        FROM public.prescricoes AS pr
       WHERE pr.prontuario_id = p_prontuario_id
         AND pr.clinica_id = v_clinica_id
         AND NULLIF(trim(pr.medicamento), '') IS NOT NULL
         AND position(lower(trim(pr.medicamento)) in lower(v_item.nome)) > 0
    ) AS item;

  IF v_total_prescricoes = 0 OR v_prescricoes_validas <> v_total_prescricoes
     OR v_quantidade_prescrita IS DISTINCT FROM p_quantidade::numeric THEN
    RAISE EXCEPTION 'O item e a quantidade total não correspondem às prescrições salvas neste prontuário.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_item.quantidade < p_quantidade THEN
    RAISE EXCEPTION 'Estoque insuficiente: % disponível, % solicitado.', v_item.quantidade, p_quantidade
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.estoque AS e
     SET quantidade = e.quantidade - p_quantidade
   WHERE e.id = p_item_id
     AND e.clinica_id = v_clinica_id;

  INSERT INTO public.movimentacoes_estoque (
    item_id, clinica_id, tipo, quantidade, prontuario_id, motivo, usuario_id
  ) VALUES (
    p_item_id, v_clinica_id, 'saida', p_quantidade, p_prontuario_id,
    v_motivo, auth.uid()
  );

  RETURN QUERY SELECT v_item.id, v_item.quantidade, v_item.quantidade - p_quantidade, false;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_baixa_estoque(uuid, integer, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_baixa_estoque(uuid, integer, uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.registrar_baixa_estoque(uuid, integer, uuid, uuid, text) IS
  'Debita estoque uma vez por prescrição e prontuário, validando clínica, profissional responsável e item prescrito.';

COMMIT;
