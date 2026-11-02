-- Sangria acima do dinheiro da gaveta recusada também no banco.
--
-- O limite da sangria existia só na tela (CashOperationPage): gravação direta
-- ou duas abas ao mesmo tempo podiam retirar mais do que havia na gaveta. O
-- trigger da conta passa a travar o caixa do dia (FOR UPDATE) e a recusar a
-- sangria maior que abertura + movimentos em dinheiro do dia, o mesmo cálculo
-- de movimentos_caixa_diario usado pela tela e por fechar_caixa_diario.
-- Definição parte de 20261102202000_conta_com_pagamentos_usa_caixa_do_pagamento.sql.
BEGIN;

CREATE OR REPLACE FUNCTION public.exigir_caixa_aberto_para_lancamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_movimento boolean := false;
  v_new_movimento boolean := false;
  v_old_data date;
  v_new_data date;
  v_old_clinica uuid;
  v_new_clinica uuid;
  v_alvo record;
  v_aberto boolean;
  v_sangria boolean;
  v_abertura numeric(12,2);
  v_saldo numeric(12,2);
BEGIN
  -- Preserve descriptive edits on old rows; only financial/accounting changes
  -- need to lock the associated register.
  IF TG_OP = 'UPDATE'
     AND OLD.status IS NOT DISTINCT FROM NEW.status
     AND OLD.tipo IS NOT DISTINCT FROM NEW.tipo
     AND OLD.categoria IS NOT DISTINCT FROM NEW.categoria
     AND OLD.forma_pagamento IS NOT DISTINCT FROM NEW.forma_pagamento
     AND OLD.valor IS NOT DISTINCT FROM NEW.valor
     AND OLD.valor_pago IS NOT DISTINCT FROM NEW.valor_pago
     AND OLD.desconto IS NOT DISTINCT FROM NEW.desconto
     AND OLD.acrescimo IS NOT DISTINCT FROM NEW.acrescimo
     AND OLD.data IS NOT DISTINCT FROM NEW.data
     AND OLD.data_pagamento IS NOT DISTINCT FROM NEW.data_pagamento
     AND OLD.clinica_id IS NOT DISTINCT FROM NEW.clinica_id THEN
    RETURN NEW;
  END IF;

  -- Conta com linhas em pagamentos: o dinheiro do caixa é cada pagamento, já
  -- conferido pelo trigger de pagamentos no dia em que entra ou é estornado.
  -- Conferir o caixa da data da conta barrava a segunda parcela em outro dia
  -- ("Caixa de <dia 1> fechado") quando recalcular_conta atualizava a conta.
  IF TG_OP = 'UPDATE'
     AND OLD.tipo IS NOT DISTINCT FROM NEW.tipo
     AND OLD.clinica_id IS NOT DISTINCT FROM NEW.clinica_id
     AND EXISTS (SELECT 1 FROM public.pagamentos p WHERE p.lancamento_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    v_old_movimento := OLD.status = 'pago'
      AND OLD.tipo IN ('receita', 'despesa', 'sangria', 'suprimento')
      AND (OLD.categoria = 'receita_caixa' OR OLD.tipo IN ('sangria', 'suprimento') OR OLD.forma_pagamento = 'dinheiro');
    IF v_old_movimento THEN
      v_old_data := COALESCE(OLD.data_pagamento, OLD.data);
      v_old_clinica := OLD.clinica_id;
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_movimento := NEW.status = 'pago'
      AND NEW.tipo IN ('receita', 'despesa', 'sangria', 'suprimento')
      AND (NEW.categoria = 'receita_caixa' OR NEW.tipo IN ('sangria', 'suprimento') OR NEW.forma_pagamento = 'dinheiro');
    IF v_new_movimento THEN
      v_new_data := COALESCE(NEW.data_pagamento, NEW.data);
      v_new_clinica := NEW.clinica_id;
    END IF;
  END IF;
  IF NOT v_old_movimento AND NOT v_new_movimento THEN RETURN COALESCE(NEW, OLD); END IF;

  FOR v_alvo IN
    SELECT alvo.data, alvo.clinica_id
      FROM (
        SELECT v_old_data AS data, v_old_clinica AS clinica_id WHERE v_old_movimento
        UNION
        SELECT v_new_data AS data, v_new_clinica AS clinica_id WHERE v_new_movimento
      ) alvo
     ORDER BY alvo.data, alvo.clinica_id
  LOOP
    IF auth.uid() IS NOT NULL AND v_alvo.clinica_id IS DISTINCT FROM public.get_my_clinica_id() THEN
      RAISE EXCEPTION 'Lançamento fora da clínica do usuário.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- Sangria: FOR UPDATE serializa retiradas simultâneas do mesmo caixa, para
    -- que duas sangrias não passem juntas do dinheiro da gaveta.
    v_sangria := v_new_movimento AND NEW.tipo = 'sangria' AND auth.uid() IS NOT NULL
      AND v_alvo.data = v_new_data AND v_alvo.clinica_id = v_new_clinica;
    IF v_sangria THEN
      SELECT c.aberto, c.valor_abertura INTO v_aberto, v_abertura
        FROM public.caixa_diario c
       WHERE c.clinica_id = v_alvo.clinica_id AND c.data = v_alvo.data
       FOR UPDATE;
    ELSE
      SELECT c.aberto INTO v_aberto
        FROM public.caixa_diario c
       WHERE c.clinica_id = v_alvo.clinica_id AND c.data = v_alvo.data
       FOR SHARE;
    END IF;
    IF NOT FOUND OR NOT v_aberto THEN
      RAISE EXCEPTION 'Caixa de % fechado ou inexistente.', v_alvo.data USING ERRCODE = 'check_violation';
    END IF;
    IF v_sangria THEN
      -- Mesmo saldo de gaveta da tela e do fechamento: abertura + dinheiro do dia.
      SELECT round(COALESCE(v_abertura, 0) + COALESCE(sum(
        CASE WHEN m.tipo IN ('receita', 'suprimento') THEN m.valor ELSE -m.valor END
      ), 0), 2)
        INTO v_saldo
        FROM public.movimentos_caixa_diario(v_alvo.data) m
       WHERE m.forma_pagamento = 'dinheiro' AND m.id <> NEW.id;
      IF round(COALESCE(NEW.valor_pago, NEW.valor), 2) > v_saldo THEN
        RAISE EXCEPTION 'A sangria de % é maior que o dinheiro disponível na gaveta (%).',
          round(COALESCE(NEW.valor_pago, NEW.valor), 2), v_saldo USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMIT;
