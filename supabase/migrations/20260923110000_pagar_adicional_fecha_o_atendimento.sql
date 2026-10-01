-- ============================================================================
-- Pagar a cobrança adicional fecha o atendimento
--
-- Hoje `registrar_pagamento` só avança o agendamento a partir de
-- 'agendado/confirmado/aguardando/aguardando_pagamento'. Quem estava em
-- 'aguardando_pagamento_adicional' (procedimento lançado durante a consulta)
-- pagava no balcão e PERMANECIA nesse status: o KPI "devem o adicional" do
-- Painel do Dia continuava contando o paciente já quitado, e o agendamento
-- nunca voltava a 'finalizado'.
--
-- Agora: quitou → 'finalizado'. O status só é mexido quando a conta fica
-- quitada e o paciente já passou pela consulta — quem está em atendimento
-- não é tocado.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.registrar_pagamento(
  p_lancamento_id      uuid,
  p_pagamentos         jsonb,
  p_desconto           numeric DEFAULT 0,
  p_acrescimo          numeric DEFAULT 0,
  p_chave_idempotencia text    DEFAULT NULL,
  p_observacoes        text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_conta          public.lancamentos%ROWTYPE;
  v_total_informado numeric(12,2);
  v_devido          numeric(12,2);
  v_ja_pago         numeric(12,2);
  v_saldo           numeric(12,2);
  v_agendamento     uuid;
  v_exige_previo    boolean;
  v_status_agend    text;
BEGIN
  IF p_lancamento_id IS NULL THEN
    RAISE EXCEPTION 'lancamento_id é obrigatório';
  END IF;

  IF jsonb_typeof(p_pagamentos) <> 'array' OR jsonb_array_length(p_pagamentos) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos uma forma de pagamento.';
  END IF;

  -- ─── Idempotência ───
  IF p_chave_idempotencia IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.pagamentos WHERE chave_idempotencia = p_chave_idempotencia
  ) THEN
    SELECT * INTO v_conta FROM public.lancamentos WHERE id = p_lancamento_id;
    RETURN jsonb_build_object(
      'repetido',   true,
      'status',     v_conta.status,
      'valor',      v_conta.valor,
      'valor_pago', COALESCE(v_conta.valor_pago, 0),
      'saldo',      (v_conta.valor - COALESCE(v_conta.desconto,0) + COALESCE(v_conta.acrescimo,0)) - COALESCE(v_conta.valor_pago, 0)
    );
  END IF;

  -- ─── Trava a conta ───
  SELECT * INTO v_conta
    FROM public.lancamentos
   WHERE id = p_lancamento_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cobrança não encontrada nesta clínica.' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_conta.status IN ('cancelado', 'estornado') THEN
    RAISE EXCEPTION 'Esta cobrança está % e não pode receber pagamento.', v_conta.status;
  END IF;

  -- ─── Desconto e acréscimo ───
  IF COALESCE(p_desconto, 0) < 0 OR COALESCE(p_acrescimo, 0) < 0 THEN
    RAISE EXCEPTION 'Desconto e acréscimo não podem ser negativos.';
  END IF;

  IF COALESCE(p_desconto, 0) > v_conta.valor THEN
    RAISE EXCEPTION 'Desconto de % é maior que o valor da cobrança (%).',
      p_desconto, v_conta.valor;
  END IF;

  UPDATE public.lancamentos
     SET desconto  = COALESCE(p_desconto, desconto, 0),
         acrescimo = COALESCE(p_acrescimo, acrescimo, 0),
         observacoes = CASE
           WHEN p_observacoes IS NULL OR p_observacoes = '' THEN observacoes
           ELSE concat_ws(' | ', NULLIF(observacoes, ''), p_observacoes)
         END
   WHERE id = p_lancamento_id
   RETURNING * INTO v_conta;

  v_devido  := v_conta.valor - COALESCE(v_conta.desconto, 0) + COALESCE(v_conta.acrescimo, 0);
  v_ja_pago := COALESCE((
    SELECT sum(valor) FROM public.pagamentos
     WHERE lancamento_id = p_lancamento_id AND estornado_em IS NULL
  ), 0);

  SELECT COALESCE(sum((item->>'valor')::numeric), 0)
    INTO v_total_informado
    FROM jsonb_array_elements(p_pagamentos) AS item;

  IF v_total_informado <= 0 THEN
    RAISE EXCEPTION 'O valor do pagamento precisa ser maior que zero.';
  END IF;

  IF round((v_ja_pago + v_total_informado) * 100) > round(v_devido * 100) THEN
    RAISE EXCEPTION 'O pagamento de % excede o saldo devedor de %.',
      v_total_informado, v_devido - v_ja_pago;
  END IF;

  -- ─── Grava os pagamentos ───
  INSERT INTO public.pagamentos (
    lancamento_id, clinica_id, forma_pagamento, valor, parcelas,
    recebido_por, observacoes, chave_idempotencia
  )
  SELECT
    p_lancamento_id,
    v_conta.clinica_id,
    item->>'forma_pagamento',
    (item->>'valor')::numeric,
    COALESCE((item->>'parcelas')::int, 1),
    auth.uid(),
    p_observacoes,
    CASE WHEN ordinalidade = 1 THEN p_chave_idempotencia END
  FROM jsonb_array_elements(p_pagamentos) WITH ORDINALITY AS t(item, ordinalidade);

  SELECT * INTO v_conta FROM public.lancamentos WHERE id = p_lancamento_id;
  v_saldo := v_devido - COALESCE(v_conta.valor_pago, 0);

  -- ─── Avança o agendamento ───
  -- Quem ainda não foi atendido vai a 'pago'; quem já foi atendido e devia o
  -- adicional volta a 'finalizado'. Não mexe em quem está em atendimento.
  IF v_conta.status = 'pago' AND v_conta.agendamento_id IS NOT NULL THEN
    UPDATE public.agendamentos
       SET status = CASE WHEN status::text = 'aguardando_pagamento_adicional'
                         THEN 'finalizado'::public.status_agendamento
                         ELSE 'pago'::public.status_agendamento END
     WHERE id = v_conta.agendamento_id
       AND status::text IN ('agendado', 'confirmado', 'aguardando',
                            'aguardando_pagamento', 'aguardando_pagamento_adicional')
    RETURNING id, exige_pagamento_previo, status::text
         INTO v_agendamento, v_exige_previo, v_status_agend;
  END IF;

  RETURN jsonb_build_object(
    'repetido',           false,
    'status',             v_conta.status,
    'valor',              v_conta.valor,
    'desconto',           COALESCE(v_conta.desconto, 0),
    'acrescimo',          COALESCE(v_conta.acrescimo, 0),
    'valor_pago',         COALESCE(v_conta.valor_pago, 0),
    'saldo',              v_saldo,
    'quitado',            v_saldo <= 0.009,
    'agendamento_id',     v_conta.agendamento_id,
    'agendamento_status', v_status_agend
  );
END;
$$;

COMMENT ON FUNCTION public.registrar_pagamento(uuid, jsonb, numeric, numeric, text, text) IS
  'Registra um ou mais pagamentos de uma conta numa transação só, com chave de idempotência para clique duplo e FOR UPDATE para recebimento simultâneo. Quitou o adicional, o atendimento volta a finalizado.';

COMMIT;
