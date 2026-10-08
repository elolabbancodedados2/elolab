BEGIN;

ALTER TABLE public.repasses_medicos
  ADD COLUMN IF NOT EXISTS lancamento_pagamento_id uuid
  REFERENCES public.lancamentos(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS repasses_medicos_lancamento_pagamento_uidx
  ON public.repasses_medicos(lancamento_pagamento_id)
  WHERE lancamento_pagamento_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.registrar_pagamento_repasse_medico(
  p_repasse_id uuid,
  p_forma_pagamento text,
  p_data_pagamento date,
  p_observacoes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica uuid := public.get_my_clinica_id();
  v_repasse public.repasses_medicos%ROWTYPE;
  v_medico_nome text;
  v_lancamento_id uuid;
  v_data date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_financial(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso financeiro necessário';
  END IF;
  IF v_clinica IS NULL OR NOT public.is_same_clinica(v_clinica) THEN
    RAISE EXCEPTION 'Clínica não identificada';
  END IF;
  IF p_forma_pagamento IS NULL OR p_forma_pagamento NOT IN (
    'dinheiro', 'pix', 'credito', 'debito', 'cartao_credito', 'cartao_debito', 'transferencia', 'cheque'
  ) THEN
    RAISE EXCEPTION 'Selecione uma forma de pagamento válida';
  END IF;
  IF p_data_pagamento IS NULL OR p_data_pagamento > v_data THEN
    RAISE EXCEPTION 'Informe uma data de pagamento válida, que não seja futura';
  END IF;

  SELECT * INTO v_repasse
    FROM public.repasses_medicos
   WHERE id = p_repasse_id AND clinica_id = v_clinica
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Repasse não encontrado para esta clínica';
  END IF;

  IF v_repasse.status = 'pago' AND v_repasse.lancamento_pagamento_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'ja_registrado', true,
      'lancamento_id', v_repasse.lancamento_pagamento_id);
  END IF;
  IF v_repasse.status <> 'aprovado' THEN
    RAISE EXCEPTION 'Aprove o repasse antes de registrar o pagamento';
  END IF;

  SELECT COALESCE(NULLIF(btrim(nome), ''), 'CRM ' || crm)
    INTO v_medico_nome
    FROM public.medicos
   WHERE id = v_repasse.medico_id AND clinica_id = v_clinica;
  IF v_medico_nome IS NULL THEN
    RAISE EXCEPTION 'Médico não encontrado para esta clínica';
  END IF;

  INSERT INTO public.lancamentos (
    tipo, categoria, descricao, valor, valor_pago, data, data_pagamento,
    data_vencimento, status, forma_pagamento, fornecedor, competencia, observacoes, clinica_id
  ) VALUES (
    'despesa', 'honorario_medico', 'Repasse médico — ' || v_medico_nome,
    v_repasse.valor_repasse, v_repasse.valor_repasse, p_data_pagamento, p_data_pagamento,
    p_data_pagamento, 'pago', p_forma_pagamento, v_medico_nome, to_char(v_repasse.competencia, 'YYYY-MM'),
    NULLIF(btrim(p_observacoes), ''), v_clinica
  ) RETURNING id INTO v_lancamento_id;

  UPDATE public.repasses_medicos
     SET status = 'pago', pago_em = now(), lancamento_pagamento_id = v_lancamento_id
   WHERE id = v_repasse.id AND clinica_id = v_clinica;

  RETURN jsonb_build_object('success', true, 'ja_registrado', false,
    'lancamento_id', v_lancamento_id);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_pagamento_repasse_medico(uuid, text, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_pagamento_repasse_medico(uuid, text, date, text) TO authenticated;

COMMENT ON FUNCTION public.registrar_pagamento_repasse_medico(uuid, text, date, text) IS
  'Registra atomicamente o pagamento aprovado de um repasse médico e cria a despesa correspondente no fluxo financeiro.';

COMMIT;
