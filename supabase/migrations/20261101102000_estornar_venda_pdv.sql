-- Estorno de venda do PDV do caixa.
--
-- A venda (`registrar_venda_pdv`) grava um lançamento pago sem linha em
-- `pagamentos`, então `estornar_pagamento` não a encontrava: a venda não podia
-- ser desfeita, e o estoque baixado e os exames criados ficavam como estavam.
--
-- O estorno não altera o dia da venda (que pode estar com o caixa fechado):
-- registra hoje uma saída de mesmo valor e forma, devolve o estoque e cancela
-- os exames que ainda não têm laudo. Tudo na mesma transação.

ALTER TABLE public.caixa_vendas_pos_idempotencia
  ADD COLUMN IF NOT EXISTS estornado_em timestamptz,
  ADD COLUMN IF NOT EXISTS estornado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS motivo_estorno text,
  ADD COLUMN IF NOT EXISTS estorno_lancamento_id uuid REFERENCES public.lancamentos(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.estornar_venda_pdv(p_lancamento_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_usuario uuid := auth.uid();
  v_clinica uuid := public.get_my_clinica_id();
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_venda public.caixa_vendas_pos_idempotencia%ROWTYPE;
  v_lanc public.lancamentos%ROWTYPE;
  v_estorno_id uuid;
  v_mov record;
  v_itens integer := 0;
  v_exames integer := 0;
  v_exames_com_laudo integer := 0;
  v_motivo text := btrim(COALESCE(p_motivo, ''));
BEGIN
  IF v_usuario IS NULL OR v_clinica IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida. Entre novamente.' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_admin(v_usuario) OR public.is_recepcao(v_usuario) OR public.can_access_financial(v_usuario)) THEN
    RAISE EXCEPTION 'Seu perfil não pode estornar vendas do caixa.' USING ERRCODE = '42501';
  END IF;
  IF length(v_motivo) < 5 THEN
    RAISE EXCEPTION 'Informe o motivo do estorno (mínimo 5 caracteres).';
  END IF;

  SELECT * INTO v_venda
    FROM public.caixa_vendas_pos_idempotencia
   WHERE lancamento_id = p_lancamento_id AND clinica_id = v_clinica
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venda do caixa não encontrada nesta clínica.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_venda.estornado_em IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'repetido', true, 'estorno_lancamento_id', v_venda.estorno_lancamento_id);
  END IF;

  SELECT * INTO v_lanc FROM public.lancamentos
   WHERE id = p_lancamento_id AND clinica_id = v_clinica
   FOR UPDATE;
  IF NOT FOUND OR v_lanc.categoria IS DISTINCT FROM 'receita_caixa' OR v_lanc.status::text <> 'pago' THEN
    RAISE EXCEPTION 'Esta venda não está paga e não pode ser estornada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.caixa_diario c
     WHERE c.clinica_id = v_clinica AND c.data = v_hoje AND c.aberto = true
  ) THEN
    RAISE EXCEPTION 'Abra o caixa de hoje para registrar o estorno.';
  END IF;

  INSERT INTO public.lancamentos (
    tipo, categoria, descricao, valor, valor_pago, data, data_vencimento, data_pagamento,
    status, forma_pagamento, paciente_id, clinica_id, observacoes
  ) VALUES (
    'despesa', 'estorno_venda', left('Estorno da venda: ' || v_lanc.descricao, 500),
    COALESCE(v_lanc.valor_pago, 0), COALESCE(v_lanc.valor_pago, 0),
    v_hoje, v_hoje, v_hoje, 'pago', v_lanc.forma_pagamento, v_lanc.paciente_id, v_clinica,
    'Motivo: ' || v_motivo
  ) RETURNING id INTO v_estorno_id;

  -- Saídas de estoque da venda: gravadas na mesma transação do lançamento,
  -- portanto com o mesmo created_at e o motivo "Venda no caixa".
  FOR v_mov IN
    SELECT m.item_id, sum(m.quantidade)::integer AS quantidade
      FROM public.movimentacoes_estoque m
     WHERE m.clinica_id = v_clinica
       AND m.tipo = 'saida'
       AND m.created_at = v_lanc.created_at
       AND m.motivo LIKE 'Venda no caixa: %'
     GROUP BY m.item_id
     ORDER BY m.item_id
  LOOP
    UPDATE public.estoque SET quantidade = quantidade + v_mov.quantidade
     WHERE id = v_mov.item_id AND clinica_id = v_clinica;
    INSERT INTO public.movimentacoes_estoque (item_id, clinica_id, tipo, quantidade, motivo, usuario_id)
    VALUES (v_mov.item_id, v_clinica, 'entrada', v_mov.quantidade,
            left('Estorno de venda no caixa: ' || v_motivo, 500), v_usuario);
    v_itens := v_itens + 1;
  END LOOP;

  IF v_lanc.paciente_id IS NOT NULL THEN
    SELECT count(*) INTO v_exames_com_laudo
      FROM public.exames e
     WHERE e.clinica_id = v_clinica AND e.paciente_id = v_lanc.paciente_id
       AND e.created_at = v_lanc.created_at
       AND e.observacoes = 'Registrado via Ponto de Venda'
       AND e.status::text = 'laudo_disponivel';
    UPDATE public.exames e
       SET status = 'cancelado'
     WHERE e.clinica_id = v_clinica AND e.paciente_id = v_lanc.paciente_id
       AND e.created_at = v_lanc.created_at
       AND e.observacoes = 'Registrado via Ponto de Venda'
       AND e.status::text IN ('solicitado', 'agendado', 'realizado');
    GET DIAGNOSTICS v_exames = ROW_COUNT;
  END IF;

  UPDATE public.lancamentos
     SET observacoes = concat_ws(' | ', NULLIF(observacoes, ''), 'Estornada em ' || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || ': ' || v_motivo)
   WHERE id = v_lanc.id;

  UPDATE public.caixa_vendas_pos_idempotencia
     SET estornado_em = now(), estornado_por = v_usuario, motivo_estorno = v_motivo, estorno_lancamento_id = v_estorno_id
   WHERE id = v_venda.id;

  RETURN jsonb_build_object(
    'success', true,
    'repetido', false,
    'estorno_lancamento_id', v_estorno_id,
    'valor', COALESCE(v_lanc.valor_pago, 0),
    'itens_devolvidos', v_itens,
    'exames_cancelados', v_exames,
    'exames_com_laudo', v_exames_com_laudo
  );
END;
$$;

REVOKE ALL ON FUNCTION public.estornar_venda_pdv(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estornar_venda_pdv(uuid, text) TO authenticated;

-- A tela precisa saber quais lançamentos são vendas do PDV e se já foram estornados.
CREATE OR REPLACE FUNCTION public.vendas_pdv_do_caixa(p_lancamento_ids uuid[])
RETURNS TABLE(lancamento_id uuid, estornado_em timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT v.lancamento_id, v.estornado_em
    FROM public.caixa_vendas_pos_idempotencia v
   WHERE v.clinica_id = public.get_my_clinica_id()
     AND v.lancamento_id = ANY(p_lancamento_ids)
     AND auth.uid() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.vendas_pdv_do_caixa(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendas_pdv_do_caixa(uuid[]) TO authenticated;
