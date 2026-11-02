-- Estorno de pagamento recusado quando o repasse médico da conta já foi pago.
--
-- O estorno refazia a conta, mas o repasse pago ao médico continuava valendo
-- sobre um recebimento que deixou de existir. Agora o estorno pede que o
-- repasse seja desfeito ou ajustado antes.
-- Definição parte de 20260815230000_estornar_pagamento.sql.
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

  -- Repasse já pago ao médico foi calculado sobre este recebimento: estornar
  -- deixaria o médico pago por dinheiro que voltou ao paciente.
  IF EXISTS (
    SELECT 1 FROM public.repasses_medicos r
     WHERE r.lancamento_id = v_pag.lancamento_id AND r.status = 'pago'
  ) THEN
    RAISE EXCEPTION 'O repasse médico desta conta já foi pago. Desfaça ou ajuste o repasse antes de estornar o pagamento.'
      USING ERRCODE = 'check_violation';
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
