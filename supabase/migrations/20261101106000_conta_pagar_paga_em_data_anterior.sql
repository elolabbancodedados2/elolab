-- Conta a pagar registrada como paga em data anterior.
--
-- O pagamento só podia ser lançado com a data de hoje e com o caixa aberto,
-- mesmo quando a despesa foi paga por transferência, Pix ou boleto dias antes.
-- A nova função aceita data passada (até 1 ano) para despesas pagas fora do
-- dinheiro do caixa. Dinheiro continua exigindo o caixa do dia.

CREATE OR REPLACE FUNCTION public.exigir_caixa_aberto_para_pagamento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_clinica uuid;
  v_movimento boolean := false;
  v_aberto boolean;
BEGIN
  -- Conta a pagar quitada em data anterior, fora do dinheiro do caixa: só por
  -- registrar_pagamento_despesa_em_data (flag local da transação).
  IF TG_OP = 'INSERT'
     AND current_setting('elolab.pagamento_despesa_em_data', true) = 'on'
     AND NEW.forma_pagamento NOT IN ('dinheiro', 'credito_paciente') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_movimento := NEW.forma_pagamento <> 'credito_paciente';
    v_clinica := NEW.clinica_id;
    IF v_movimento AND (NEW.data_pagamento AT TIME ZONE 'America/Sao_Paulo')::date <> v_hoje THEN
      RAISE EXCEPTION 'O pagamento deve usar a data atual de Brasília.' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    v_movimento := OLD.forma_pagamento <> 'credito_paciente'
      AND (COALESCE(OLD.estornado_em, OLD.data_pagamento) AT TIME ZONE 'America/Sao_Paulo')::date = v_hoje
      AND (OLD.estornado_em IS DISTINCT FROM NEW.estornado_em
        OR OLD.valor IS DISTINCT FROM NEW.valor
        OR OLD.forma_pagamento IS DISTINCT FROM NEW.forma_pagamento
        OR OLD.data_pagamento IS DISTINCT FROM NEW.data_pagamento);
    v_movimento := v_movimento OR (
      NEW.forma_pagamento <> 'credito_paciente'
      AND (COALESCE(NEW.estornado_em, NEW.data_pagamento) AT TIME ZONE 'America/Sao_Paulo')::date = v_hoje
      AND (OLD.estornado_em IS DISTINCT FROM NEW.estornado_em
        OR OLD.valor IS DISTINCT FROM NEW.valor
        OR OLD.forma_pagamento IS DISTINCT FROM NEW.forma_pagamento
        OR OLD.data_pagamento IS DISTINCT FROM NEW.data_pagamento)
    );
    v_clinica := NEW.clinica_id;
  ELSE
    v_movimento := OLD.forma_pagamento <> 'credito_paciente'
      AND (COALESCE(OLD.estornado_em, OLD.data_pagamento) AT TIME ZONE 'America/Sao_Paulo')::date = v_hoje;
    v_clinica := OLD.clinica_id;
  END IF;
  IF NOT v_movimento THEN RETURN COALESCE(NEW, OLD); END IF;
  IF auth.uid() IS NOT NULL AND v_clinica IS DISTINCT FROM public.get_my_clinica_id() THEN
    RAISE EXCEPTION 'Pagamento fora da clínica do usuário.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT c.aberto INTO v_aberto
    FROM public.caixa_diario c
   WHERE c.clinica_id = v_clinica AND c.data = v_hoje
   FOR SHARE;
  IF NOT FOUND OR NOT v_aberto THEN
    RAISE EXCEPTION 'Caixa fechado. Abra o caixa do dia antes de registrar pagamentos.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_pagamento_despesa_em_data(
  p_lancamento_id uuid,
  p_valor numeric,
  p_forma_pagamento text,
  p_data_pagamento date,
  p_observacoes text DEFAULT NULL,
  p_chave_idempotencia text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_clinica uuid := public.get_my_clinica_id();
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_conta public.lancamentos%ROWTYPE;
  v_devido numeric(12,2);
  v_ja_pago numeric(12,2);
  v_chave_lanc uuid;
BEGIN
  IF auth.uid() IS NULL OR v_clinica IS NULL OR NOT public.can_access_financial(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso financeiro necessário.' USING ERRCODE = '42501';
  END IF;
  IF p_forma_pagamento IS NULL OR p_forma_pagamento NOT IN ('pix', 'transferencia', 'boleto', 'debito', 'credito', 'cheque') THEN
    RAISE EXCEPTION 'Pagamento em data anterior vale para Pix, transferência, boleto, cartão ou cheque. Em dinheiro, use o caixa do dia.';
  END IF;
  IF p_data_pagamento IS NULL OR p_data_pagamento > v_hoje OR p_data_pagamento < v_hoje - 366 THEN
    RAISE EXCEPTION 'A data do pagamento deve estar entre um ano atrás e hoje.';
  END IF;
  IF p_valor IS NULL OR p_valor <= 0 OR p_valor <> round(p_valor, 2) THEN
    RAISE EXCEPTION 'Informe um valor positivo com até duas casas decimais.';
  END IF;

  IF p_chave_idempotencia IS NOT NULL THEN
    SELECT lancamento_id INTO v_chave_lanc FROM public.pagamentos
     WHERE chave_idempotencia = p_chave_idempotencia AND clinica_id = v_clinica;
    IF FOUND THEN
      IF v_chave_lanc IS DISTINCT FROM p_lancamento_id THEN
        RAISE EXCEPTION 'A chave de idempotência já foi usada em outra conta.' USING ERRCODE = 'unique_violation';
      END IF;
      RETURN jsonb_build_object('repetido', true);
    END IF;
  END IF;

  SELECT * INTO v_conta FROM public.lancamentos
   WHERE id = p_lancamento_id AND clinica_id = v_clinica
   FOR UPDATE;
  IF NOT FOUND OR v_conta.tipo <> 'despesa' THEN
    RAISE EXCEPTION 'Conta a pagar não encontrada nesta clínica.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_conta.status::text IN ('cancelado', 'estornado') THEN
    RAISE EXCEPTION 'Esta conta está % e não pode receber pagamento.', v_conta.status;
  END IF;

  v_devido := v_conta.valor - COALESCE(v_conta.desconto, 0) + COALESCE(v_conta.acrescimo, 0);
  v_ja_pago := COALESCE((SELECT sum(valor) FROM public.pagamentos WHERE lancamento_id = p_lancamento_id AND estornado_em IS NULL), 0);
  IF round((v_ja_pago + p_valor) * 100) > round(v_devido * 100) THEN
    RAISE EXCEPTION 'O pagamento de % excede o saldo de %.', p_valor, v_devido - v_ja_pago;
  END IF;

  PERFORM set_config('elolab.pagamento_despesa_em_data', 'on', true);
  INSERT INTO public.pagamentos (
    lancamento_id, clinica_id, forma_pagamento, valor, parcelas, recebido_por, observacoes, chave_idempotencia, data_pagamento
  ) VALUES (
    p_lancamento_id, v_clinica, p_forma_pagamento, p_valor, 1, auth.uid(),
    NULLIF(btrim(COALESCE(p_observacoes, '')), ''), p_chave_idempotencia,
    (p_data_pagamento + time '12:00') AT TIME ZONE 'America/Sao_Paulo'
  );
  PERFORM set_config('elolab.pagamento_despesa_em_data', 'off', true);

  -- recalcular_conta (trigger) preenche a data de quitação com hoje quando
  -- estava vazia; a data real é a informada.
  UPDATE public.lancamentos
     SET data_pagamento = p_data_pagamento,
         forma_pagamento = COALESCE(forma_pagamento, p_forma_pagamento)
   WHERE id = p_lancamento_id
     AND (data_pagamento IS NULL OR data_pagamento = v_hoje OR data_pagamento > p_data_pagamento)
     AND valor_pago > 0;

  SELECT * INTO v_conta FROM public.lancamentos WHERE id = p_lancamento_id;
  RETURN jsonb_build_object(
    'repetido', false,
    'status', v_conta.status,
    'valor_pago', COALESCE(v_conta.valor_pago, 0),
    'saldo', v_devido - COALESCE(v_conta.valor_pago, 0),
    'data_pagamento', v_conta.data_pagamento
  );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_pagamento_despesa_em_data(uuid, numeric, text, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_pagamento_despesa_em_data(uuid, numeric, text, date, text, text) TO authenticated;
