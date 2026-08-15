-- ============================================================================
-- ETAPA 3 de 9 — Registrar pagamento numa transação só
--
-- Hoje a baixa é feita em passos soltos no navegador: atualiza o lançamento,
-- invalida cache, mostra o toast. Se a rede cair no meio, o dinheiro entrou na
-- gaveta e o sistema não sabe — ou o contrário.
--
-- Esta função faz tudo de uma vez: registra os pagamentos, aplica desconto e
-- acréscimo, deixa o gatilho recalcular o saldo e avança o estado do
-- agendamento. Ou tudo acontece, ou nada acontece.
--
-- NÃO MUDA COMPORTAMENTO: nada no app chama esta função ainda. A tela de
-- pagamento passa a usá-la na etapa 5.
--
-- ─── IDEMPOTÊNCIA ──────────────────────────────────────────────────────────
--
-- "Dois cliques não geram dois pagamentos; refresh não duplica transações."
-- A tela manda uma chave por tentativa de pagamento. Se a mesma chave chegar de
-- novo — clique duplo, botão travado, usuário recarregando a página sem saber se
-- deu certo — a função devolve o estado atual em vez de cobrar outra vez.
--
-- ─── SERIALIZAÇÃO ──────────────────────────────────────────────────────────
--
-- O `FOR UPDATE` na conta faz duas recepcionistas recebendo o mesmo paciente ao
-- mesmo tempo entrarem em fila em vez de somarem pagamento em cima de um saldo
-- desatualizado.
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
SECURITY INVOKER          -- respeita o RLS de quem chamou, de propósito
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
  -- Antes de qualquer escrita: se esta tentativa já foi processada, devolve o
  -- estado atual em vez de cobrar de novo.
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
  -- O SELECT passa pelo RLS: conta de outra clínica simplesmente não aparece.
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

  -- Recebimento acima do devido viraria crédito do paciente, e esse conceito
  -- ainda não existe. Recusar é melhor que aceitar e perder o troco do relatório.
  IF round((v_ja_pago + v_total_informado) * 100) > round(v_devido * 100) THEN
    RAISE EXCEPTION 'O pagamento de % excede o saldo devedor de %.',
      v_total_informado, v_devido - v_ja_pago;
  END IF;

  -- ─── Grava os pagamentos ───
  -- Vários de uma vez: é o que permite R$ 200 em Pix mais R$ 300 no cartão.
  -- A chave de idempotência fica só no PRIMEIRO, porque ela identifica a
  -- tentativa inteira, não cada forma.
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

  -- O gatilho `pagamentos_recalculam_conta` já atualizou valor_pago e status.
  SELECT * INTO v_conta FROM public.lancamentos WHERE id = p_lancamento_id;
  v_saldo := v_devido - COALESCE(v_conta.valor_pago, 0);

  -- ─── Avança o agendamento ───
  -- "Não obrigar a recepcionista a atualizar manualmente várias telas."
  -- Só quando a conta ficou quitada e o paciente ainda não entrou em
  -- atendimento — não mexemos em quem já está sendo atendido ou já terminou.
  IF v_conta.status = 'pago' AND v_conta.agendamento_id IS NOT NULL THEN
    UPDATE public.agendamentos
       SET status = 'pago'
     WHERE id = v_conta.agendamento_id
       AND status::text IN ('agendado', 'confirmado', 'aguardando', 'aguardando_pagamento')
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
  'Registra um ou mais pagamentos de uma conta numa transação só, com chave de idempotência para clique duplo e FOR UPDATE para recebimento simultâneo. Devolve o saldo e o novo estado do agendamento.';

REVOKE ALL ON FUNCTION public.registrar_pagamento(uuid, jsonb, numeric, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_pagamento(uuid, jsonb, numeric, numeric, text, text) TO authenticated;

COMMIT;
