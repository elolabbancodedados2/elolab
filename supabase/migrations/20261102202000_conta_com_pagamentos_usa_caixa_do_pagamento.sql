-- Conta paga em partes, em dias diferentes, não esbarra no caixa do 1º dia.
--
-- recalcular_conta atualiza status, valor pago e data de pagamento da conta a
-- cada pagamento ou estorno. O trigger da conta conferia o caixa da data de
-- pagamento antiga (dia 1), já fechado, e recusava a segunda parcela em
-- dinheiro ou o estorno em outro dia. Quando a conta tem linhas em
-- pagamentos, o caixa já é conferido pelo trigger de pagamentos.
-- Definição parte de 20261001200000_caixa_diario_eventos_e_reabertura.sql.
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
    SELECT c.aberto INTO v_aberto
      FROM public.caixa_diario c
     WHERE c.clinica_id = v_alvo.clinica_id AND c.data = v_alvo.data
     FOR SHARE;
    IF NOT FOUND OR NOT v_aberto THEN
      RAISE EXCEPTION 'Caixa de % fechado ou inexistente.', v_alvo.data USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMIT;
