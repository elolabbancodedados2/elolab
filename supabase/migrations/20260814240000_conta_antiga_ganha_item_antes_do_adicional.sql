-- ============================================================================
-- ETAPA 8 (parte 3) — a conta antiga precisa virar itens antes de receber o
-- procedimento adicional
--
-- Bug encontrado pela verificação `procedimento-no-atendimento.sql`:
--
--   consulta R$ 250 (conta no modelo antigo: `valor` gravado direto, sem itens)
--   + sutura R$ 100 lançada durante a consulta
--   = conta de R$ 100.
--
-- `recalcular_conta` faz `valor = SUM(itens)`. Assim que o primeiro item entra,
-- a conta passa a valer só o item — e os R$ 250 da consulta somem. TODA conta
-- hoje em produção está no modelo antigo, então isso apagaria a consulta de
-- todo paciente que fizesse um procedimento.
--
-- Duas correções:
--
-- 1. `lancar_item_no_atendimento` semeia um item com o valor que a conta já
--    tinha, antes de acrescentar o novo. A conta migra para o modelo de itens
--    sem mudar de valor.
--
-- 2. `recalcular_conta` passa a acertar o status também quando o pagamento foi
--    gravado à moda antiga (`valor_pago` direto, sem linha em `pagamentos`).
--    Sem isso a conta continuava marcada como "pago" devendo o adicional.
-- ============================================================================

BEGIN;

-- ─── 1. Status coerente também sem linha em `pagamentos` ────────────────────
CREATE OR REPLACE FUNCTION public.recalcular_conta(p_lancamento_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tem_itens      boolean;
  v_total_itens    numeric(12,2);
  v_tem_pagamentos boolean;
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

  SELECT count(*) > 0, COALESCE(sum(valor), 0)
    INTO v_tem_pagamentos, v_total_pago
    FROM public.pagamentos
   WHERE lancamento_id = p_lancamento_id AND estornado_em IS NULL;

  IF NOT v_tem_itens AND NOT v_tem_pagamentos THEN
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

  -- Quando existe linha em `pagamentos`, ela é a verdade. Quando não existe —
  -- conta paga antes desta migração — vale o `valor_pago` que já está lá.
  IF v_tem_pagamentos THEN
    v_pago := v_total_pago;
  END IF;

  UPDATE public.lancamentos
     SET valor_pago = v_pago,
         data_pagamento = CASE WHEN v_pago > 0 THEN COALESCE(data_pagamento, CURRENT_DATE) END,
         status = CASE
           -- Comparação em centavos: numeric é exato, mas o app manda float.
           WHEN round(v_pago * 100) >= round(v_devido * 100) THEN 'pago'::status_pagamento
           WHEN v_pago > 0                                   THEN 'parcial'::status_pagamento
           ELSE status
         END
   WHERE id = p_lancamento_id;
END;
$$;

-- ─── 2. Semear o valor antigo como item antes de acrescentar o novo ─────────
CREATE OR REPLACE FUNCTION public.lancar_item_no_atendimento(
  p_agendamento_id uuid,
  p_descricao      text,
  p_valor_unitario numeric,
  p_quantidade     numeric DEFAULT 1,
  p_categoria      text    DEFAULT 'procedimento',
  p_prontuario_id  uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER          -- respeita o RLS de quem chamou
SET search_path = public
AS $$
DECLARE
  v_agendamento public.agendamentos%ROWTYPE;
  v_conta_id    uuid;
  v_conta       public.lancamentos%ROWTYPE;
  v_paciente    text;
  v_devido      numeric(12,2);
  v_tem_itens   boolean;
BEGIN
  IF p_descricao IS NULL OR btrim(p_descricao) = '' THEN
    RAISE EXCEPTION 'Descreva o procedimento antes de lançar.';
  END IF;

  IF COALESCE(p_valor_unitario, 0) <= 0 THEN
    RAISE EXCEPTION 'O valor do procedimento precisa ser maior que zero.';
  END IF;

  IF COALESCE(p_quantidade, 0) <= 0 THEN
    RAISE EXCEPTION 'A quantidade precisa ser maior que zero.';
  END IF;

  -- O SELECT passa pelo RLS: agendamento de outra clínica não aparece.
  SELECT * INTO v_agendamento FROM public.agendamentos WHERE id = p_agendamento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Atendimento não encontrado nesta clínica.' USING ERRCODE = 'no_data_found';
  END IF;

  -- Conta do atendimento. Pode não existir: retorno é gratuito e não gera
  -- cobrança no check-in.
  SELECT * INTO v_conta
    FROM public.lancamentos
   WHERE agendamento_id = p_agendamento_id
     AND tipo = 'receita'
     AND status NOT IN ('cancelado', 'estornado')
   ORDER BY created_at
   LIMIT 1;

  IF NOT FOUND THEN
    SELECT nome INTO v_paciente FROM public.pacientes WHERE id = v_agendamento.paciente_id;

    INSERT INTO public.lancamentos (
      tipo, categoria, descricao, valor, data, data_vencimento,
      status, paciente_id, agendamento_id, clinica_id
    ) VALUES (
      'receita', 'procedimento',
      concat_ws(' — ', 'Procedimentos do atendimento', v_paciente),
      0, CURRENT_DATE, CURRENT_DATE,
      'pendente', v_agendamento.paciente_id, p_agendamento_id, v_agendamento.clinica_id
    )
    RETURNING id INTO v_conta_id;
  ELSE
    v_conta_id := v_conta.id;

    -- Conta no modelo antigo (valor gravado direto, sem itens): o primeiro
    -- item faria `valor = SUM(itens)` engolir o que já estava cobrado. Vira
    -- item primeiro, com o mesmo valor e a mesma descrição.
    SELECT count(*) > 0 INTO v_tem_itens
      FROM public.lancamento_itens WHERE lancamento_id = v_conta_id;

    IF NOT v_tem_itens AND COALESCE(v_conta.valor, 0) > 0 THEN
      INSERT INTO public.lancamento_itens (
        lancamento_id, clinica_id, descricao, categoria,
        quantidade, valor_unitario, origem
      ) VALUES (
        v_conta_id, v_conta.clinica_id,
        COALESCE(NULLIF(btrim(v_conta.descricao), ''), 'Atendimento'),
        CASE WHEN v_conta.categoria IN ('consulta','retorno','procedimento','exame','produto','taxa','outros')
             THEN v_conta.categoria ELSE 'outros' END,
        1, v_conta.valor, 'checkin'
      );
    END IF;
  END IF;

  INSERT INTO public.lancamento_itens (
    lancamento_id, clinica_id, descricao, categoria,
    quantidade, valor_unitario, origem, prontuario_id, criado_por
  ) VALUES (
    v_conta_id, v_agendamento.clinica_id, btrim(p_descricao), p_categoria,
    p_quantidade, p_valor_unitario, 'atendimento', p_prontuario_id, auth.uid()
  );

  -- O gatilho `itens_recalculam_conta` já somou o item ao valor da conta.
  SELECT * INTO v_conta FROM public.lancamentos WHERE id = v_conta_id;
  v_devido := v_conta.valor - COALESCE(v_conta.desconto, 0) + COALESCE(v_conta.acrescimo, 0);

  RETURN jsonb_build_object(
    'lancamento_id', v_conta_id,
    'valor',         v_conta.valor,
    'valor_pago',    COALESCE(v_conta.valor_pago, 0),
    'saldo',         v_devido - COALESCE(v_conta.valor_pago, 0),
    'status',        v_conta.status
  );
END;
$$;

COMMIT;
