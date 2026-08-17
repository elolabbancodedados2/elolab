-- ============================================================================
-- Estornar o último pagamento deixava a conta marcada como PAGA
--
-- Encontrado pela verificação do estorno, antes de a tela existir:
--
--   consulta R$ 250 → pagamento R$ 250 → conta `pago`
--   estorno do pagamento         → conta continua `pago`, valor_pago 250
--
-- A culpa é de uma guarda minha, da etapa 2 do fluxo de pagamento:
--
--   IF NOT v_tem_itens AND NOT v_tem_pagamentos THEN
--     RETURN; -- conta ainda no modelo antigo: não tocar
--   END IF;
--
-- `v_tem_pagamentos` só conta pagamento NÃO estornado. Ao estornar o único
-- pagamento de uma conta sem itens, ela passa a parecer uma conta do modelo
-- antigo — e a função sai sem mexer, deixando o `valor_pago` do dinheiro que
-- acabou de ser devolvido.
--
-- A guarda existe por um bom motivo: as contas antigas gravam `valor` e
-- `valor_pago` direto, sem linha filha, e recalculá-las zeraria tudo. O erro é
-- o critério — o que diz que uma conta é do modelo novo é EXISTIR linha de
-- pagamento, estornada ou não. Estorno é histórico, não desaparecimento.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.recalcular_conta(p_lancamento_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tem_itens      boolean;
  v_total_itens    numeric(12,2);
  v_tem_linha_pag  boolean;   -- existe pagamento, estornado ou não
  v_total_pago     numeric(12,2);
  v_valor          numeric(12,2);
  v_desconto       numeric(12,2);
  v_acrescimo      numeric(12,2);
  v_devido         numeric(12,2);
  v_pago           numeric(12,2);
  v_status         text;
BEGIN
  SELECT count(*) > 0, COALESCE(sum(valor_total), 0)
    INTO v_tem_itens, v_total_itens
    FROM public.lancamento_itens WHERE lancamento_id = p_lancamento_id;

  -- Qualquer linha de pagamento marca a conta como sendo do modelo novo.
  SELECT count(*) > 0 INTO v_tem_linha_pag
    FROM public.pagamentos WHERE lancamento_id = p_lancamento_id;

  -- Mas só o que NÃO foi estornado é dinheiro.
  SELECT COALESCE(sum(valor), 0) INTO v_total_pago
    FROM public.pagamentos
   WHERE lancamento_id = p_lancamento_id AND estornado_em IS NULL;

  IF NOT v_tem_itens AND NOT v_tem_linha_pag THEN
    RETURN; -- conta ainda no modelo antigo: não tocar
  END IF;

  IF v_tem_itens THEN
    UPDATE public.lancamentos SET valor = v_total_itens WHERE id = p_lancamento_id;
  END IF;

  SELECT valor, COALESCE(desconto, 0), COALESCE(acrescimo, 0), COALESCE(valor_pago, 0), status::text
    INTO v_valor, v_desconto, v_acrescimo, v_pago, v_status
    FROM public.lancamentos WHERE id = p_lancamento_id;

  v_devido := v_valor - v_desconto + v_acrescimo;

  -- Conta cancelada ou estornada não volta sozinha para pago/parcial.
  IF v_status IN ('cancelado', 'estornado') THEN
    RETURN;
  END IF;

  IF v_tem_linha_pag THEN
    v_pago := v_total_pago;
  END IF;

  UPDATE public.lancamentos
     SET valor_pago = v_pago,
         -- Sem pagamento vivo, a data de pagamento também sai: conta que deve
         -- não tem data de quitação.
         data_pagamento = CASE WHEN v_pago > 0 THEN COALESCE(data_pagamento, CURRENT_DATE) END,
         status = CASE
           WHEN round(v_pago * 100) >= round(v_devido * 100) THEN 'pago'::status_pagamento
           WHEN v_pago > 0                                   THEN 'parcial'::status_pagamento
           ELSE 'pendente'::status_pagamento
         END
   WHERE id = p_lancamento_id;
END;
$$;

COMMIT;
