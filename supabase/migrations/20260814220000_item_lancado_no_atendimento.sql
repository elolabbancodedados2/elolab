-- ============================================================================
-- ETAPA 8 de 9 — Procedimento lançado durante a consulta
--
-- O cenário do enunciado: o paciente pagou R$ 250 antes de entrar, e durante o
-- atendimento o profissional faz uma sutura de R$ 100. A regra de pagamento
-- antecipado não pode impedir a cobrança posterior.
--
-- O modelo da etapa 2 já suporta isso: o procedimento é um ITEM da conta, com
-- `origem = 'atendimento'`, e o gatilho reabre o saldo. O que faltava era um
-- caminho seguro para criar esse item — a tela do prontuário não deveria
-- montar lançamento à mão.
--
-- ─── QUANDO NÃO EXISTE CONTA ───────────────────────────────────────────────
--
-- Retorno é gratuito e não gera cobrança. Se o profissional fizer um
-- procedimento num retorno, não há conta onde pendurar o item — então a função
-- cria uma. É o único caminho do sistema que cria cobrança DEPOIS do check-in,
-- e por isso respeita o mesmo índice único: uma conta por agendamento.
-- ============================================================================

BEGIN;

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
  SELECT id INTO v_conta_id
    FROM public.lancamentos
   WHERE agendamento_id = p_agendamento_id
     AND tipo = 'receita'
     AND status NOT IN ('cancelado', 'estornado')
   ORDER BY created_at
   LIMIT 1;

  IF v_conta_id IS NULL THEN
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

COMMENT ON FUNCTION public.lancar_item_no_atendimento(uuid, text, numeric, numeric, text, uuid) IS
  'Lança um procedimento realizado durante a consulta como item da conta do atendimento, criando a conta se ainda não houver (caso do retorno gratuito). Devolve o saldo resultante.';

REVOKE ALL ON FUNCTION public.lancar_item_no_atendimento(uuid, text, numeric, numeric, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lancar_item_no_atendimento(uuid, text, numeric, numeric, text, uuid) TO authenticated;

COMMIT;
