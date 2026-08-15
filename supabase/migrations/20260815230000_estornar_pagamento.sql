-- ============================================================================
-- Estornar um pagamento
--
-- A tabela `pagamentos` nasceu com `estornado_em`, `estornado_por` e
-- `motivo_estorno` — o desenho previa o estorno. Só que NADA escreve neles:
-- não há função no banco nem botão na tela.
--
-- Na prática: a recepcionista registra R$ 200 no cartão, percebe que era Pix,
-- e não tem o que fazer. As saídas que sobram são todas ruins — cancelar a
-- conta inteira e refazer (perde o histórico), ou lançar um valor negativo
-- (quebra a soma).
--
-- ─── O QUE O ESTORNO FAZ, E O QUE NÃO FAZ ──────────────────────────────────
--
-- Não apaga a linha. Marca. O pagamento errado continua visível, com quem
-- estornou, quando e por quê — é assim que se explica uma diferença de caixa
-- três meses depois. `recalcular_conta` já ignora pagamento estornado
-- (`estornado_em IS NULL` no somatório), então a conta volta sozinha para
-- `parcial` ou `pendente`.
--
-- O motivo é OBRIGATÓRIO. Estorno sem motivo é exatamente o registro que não
-- serve para nada na hora em que alguém precisa entender o que aconteceu.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.estornar_pagamento(
  p_pagamento_id uuid,
  p_motivo       text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pag   public.pagamentos%ROWTYPE;
  v_conta public.lancamentos%ROWTYPE;
BEGIN
  IF btrim(COALESCE(p_motivo, '')) = '' THEN
    RAISE EXCEPTION 'Diga o motivo do estorno.';
  END IF;

  -- FOR UPDATE: dois cliques no mesmo botão não podem estornar duas vezes.
  SELECT * INTO v_pag FROM public.pagamentos WHERE id = p_pagamento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pagamento não encontrado.' USING ERRCODE = 'no_data_found';
  END IF;

  -- SECURITY DEFINER passa por cima do RLS, então a clínica é conferida aqui.
  IF NOT public.is_same_clinica(v_pag.clinica_id) THEN
    RAISE EXCEPTION 'Este pagamento é de outra clínica.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT (public.can_access_financial(auth.uid()) OR public.is_recepcao(auth.uid())) THEN
    RAISE EXCEPTION 'Seu perfil não pode estornar pagamentos.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_pag.estornado_em IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este pagamento já foi estornado.');
  END IF;

  UPDATE public.pagamentos
     SET estornado_em = now(),
         estornado_por = auth.uid(),
         motivo_estorno = btrim(p_motivo)
   WHERE id = p_pagamento_id;

  -- Refaz a conta sem o pagamento estornado: ela volta para parcial ou
  -- pendente conforme o que sobrou.
  PERFORM public.recalcular_conta(v_pag.lancamento_id);

  SELECT * INTO v_conta FROM public.lancamentos WHERE id = v_pag.lancamento_id;

  RETURN jsonb_build_object(
    'success', true,
    'valor_estornado', v_pag.valor,
    'conta_status', v_conta.status,
    'conta_valor_pago', COALESCE(v_conta.valor_pago, 0)
  );
END;
$$;

COMMENT ON FUNCTION public.estornar_pagamento(uuid, text) IS
  'Marca um pagamento como estornado (não apaga) e refaz a conta. Motivo obrigatório: estorno sem motivo é o registro que não serve na hora de explicar uma diferença de caixa.';

REVOKE ALL ON FUNCTION public.estornar_pagamento(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.estornar_pagamento(uuid, text) TO authenticated;

COMMIT;
