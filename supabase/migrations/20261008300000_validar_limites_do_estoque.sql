-- Mantém os limites de estoque válidos também em gravações fora do formulário.
-- A validação por coluna alterada não bloqueia movimentos em registros legados
-- que já tenham algum campo inválido e não estejam sendo corrigidos nessa gravação.
BEGIN;

CREATE OR REPLACE FUNCTION public.validar_limites_estoque()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_inserindo boolean := TG_OP = 'INSERT';
  v_minimo_alterado boolean;
  v_maximo_alterado boolean;
  v_ponto_alterado boolean;
  v_custo_alterado boolean;
  v_venda_alterada boolean;
BEGIN
  IF v_inserindo THEN
    v_minimo_alterado := true;
    v_maximo_alterado := true;
    v_ponto_alterado := true;
    v_custo_alterado := true;
    v_venda_alterada := true;
  ELSE
    v_minimo_alterado := NEW.quantidade_minima IS DISTINCT FROM OLD.quantidade_minima;
    v_maximo_alterado := NEW.quantidade_maxima IS DISTINCT FROM OLD.quantidade_maxima;
    v_ponto_alterado := NEW.ponto_pedido IS DISTINCT FROM OLD.ponto_pedido;
    v_custo_alterado := NEW.valor_unitario IS DISTINCT FROM OLD.valor_unitario;
    v_venda_alterada := NEW.valor_venda IS DISTINCT FROM OLD.valor_venda;
  END IF;

  IF v_minimo_alterado AND NEW.quantidade_minima IS NOT NULL AND NEW.quantidade_minima < 0 THEN
    RAISE EXCEPTION 'O estoque mínimo deve ser maior ou igual a zero.';
  END IF;

  IF v_maximo_alterado AND NEW.quantidade_maxima IS NOT NULL
     AND (NEW.quantidade_maxima < 1 OR NEW.quantidade_maxima < NEW.quantidade) THEN
    RAISE EXCEPTION 'O estoque máximo deve ser maior que zero e maior ou igual ao saldo atual.';
  END IF;

  IF v_ponto_alterado AND NEW.ponto_pedido IS NOT NULL AND NEW.ponto_pedido < 1 THEN
    RAISE EXCEPTION 'O ponto de pedido deve ser maior que zero.';
  END IF;

  IF v_custo_alterado AND NEW.valor_unitario IS NOT NULL
     AND (NEW.valor_unitario < 0 OR NEW.valor_unitario > 99999999.99) THEN
    RAISE EXCEPTION 'O custo unitário deve estar entre zero e 99.999.999,99.';
  END IF;

  IF v_venda_alterada AND NEW.valor_venda IS NOT NULL
     AND (NEW.valor_venda < 0 OR NEW.valor_venda > 99999999.99) THEN
    RAISE EXCEPTION 'O preço de venda deve estar entre zero e 99.999.999,99.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_limites_estoque ON public.estoque;
CREATE TRIGGER trg_validar_limites_estoque
  BEFORE INSERT OR UPDATE ON public.estoque
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_limites_estoque();

COMMENT ON FUNCTION public.validar_limites_estoque() IS
  'Valida limites do cadastro de estoque no banco, inclusive em gravações que não passam pela interface.';

COMMIT;
