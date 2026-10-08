BEGIN;

ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS lote_tiss_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.lancamentos'::regclass
       AND conname = 'lancamentos_lote_tiss_id_fkey'
  ) THEN
    ALTER TABLE public.lancamentos
      ADD CONSTRAINT lancamentos_lote_tiss_id_fkey
      FOREIGN KEY (lote_tiss_id) REFERENCES public.lotes_tiss(id) ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_lancamentos_lote_tiss
  ON public.lancamentos (lote_tiss_id)
  WHERE lote_tiss_id IS NOT NULL;

ALTER TABLE public.lotes_tiss
  ADD COLUMN IF NOT EXISTS valor_conciliado_financeiro numeric(14,2) NOT NULL DEFAULT 0
  CHECK (valor_conciliado_financeiro >= 0);

CREATE OR REPLACE FUNCTION public.registrar_retorno_lote_tiss(
  p_lote_id uuid,
  p_valor_pago numeric,
  p_motivo_ajuste text,
  p_data_pagamento date,
  p_registrar_financeiro boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinica uuid := public.get_my_clinica_id();
  v_lote public.lotes_tiss%ROWTYPE;
  v_status text;
  v_variacao_financeira numeric(14,2) := 0;
  v_categoria text;
  v_descricao text;
  v_observacao text;
BEGIN
  IF NOT public.can_access_financial(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso financeiro necessário';
  END IF;
  IF v_clinica IS NULL OR p_lote_id IS NULL OR p_valor_pago IS NULL OR p_data_pagamento IS NULL OR p_registrar_financeiro IS NULL THEN
    RAISE EXCEPTION 'Lote, valor, data do recebimento e confirmação financeira são obrigatórios';
  END IF;
  IF p_data_pagamento > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'A data do recebimento não pode ser futura.';
  END IF;
  IF p_valor_pago < 0 OR p_valor_pago <> round(p_valor_pago, 2) THEN
    RAISE EXCEPTION 'O valor recebido deve ser positivo ou zero e ter no máximo duas casas decimais.';
  END IF;

  SELECT * INTO v_lote
    FROM public.lotes_tiss
   WHERE id = p_lote_id AND clinica_id = v_clinica
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote não encontrado nesta clínica.';
  END IF;
  IF v_lote.status NOT IN ('enviado', 'processando', 'pago_parcial', 'pago') THEN
    RAISE EXCEPTION 'Registre ou corrija o retorno somente para lotes enviados, em processamento ou pagos.';
  END IF;
  IF v_lote.valor_apresentado <= 0 THEN
    RAISE EXCEPTION 'O lote precisa ter um valor apresentado maior que zero.';
  END IF;
  IF p_valor_pago > v_lote.valor_apresentado THEN
    RAISE EXCEPTION 'O valor recebido deve ficar entre zero e o valor apresentado.';
  END IF;
  IF p_valor_pago < v_lote.valor_pago AND length(btrim(COALESCE(p_motivo_ajuste, ''))) < 5 THEN
    RAISE EXCEPTION 'Informe o motivo para reduzir o valor recebido anteriormente (mínimo 5 caracteres).';
  END IF;
  IF p_registrar_financeiro
     AND p_valor_pago < v_lote.valor_conciliado_financeiro
     AND length(btrim(COALESCE(p_motivo_ajuste, ''))) < 5 THEN
    RAISE EXCEPTION 'Informe o motivo para reduzir o total já conciliado no financeiro (mínimo 5 caracteres).';
  END IF;
  IF p_valor_pago = v_lote.valor_pago
     AND v_lote.retorno_em IS NOT NULL
     AND (NOT p_registrar_financeiro OR p_valor_pago = v_lote.valor_conciliado_financeiro) THEN
    RETURN jsonb_build_object(
      'success', true,
      'repetido', true,
      'status', v_lote.status,
      'valor_pago', v_lote.valor_pago,
      'variacao_financeira', 0,
      'valor_conciliado_financeiro', v_lote.valor_conciliado_financeiro
    );
  END IF;

  v_status := CASE
    WHEN round(p_valor_pago * 100) >= round(v_lote.valor_apresentado * 100) THEN 'pago'
    WHEN p_valor_pago > 0 THEN 'pago_parcial'
    ELSE 'processando'
  END;

  IF p_registrar_financeiro THEN
    v_variacao_financeira := p_valor_pago - v_lote.valor_conciliado_financeiro;
  END IF;

  IF v_variacao_financeira > 0 THEN
    v_categoria := 'convenio_repasse';
    v_descricao := 'Recebimento do lote TISS ' || v_lote.numero_lote;
    v_observacao := 'Diferença recebida neste retorno; total acumulado do lote: R$ ' || to_char(p_valor_pago, 'FM999999999990D00');
    INSERT INTO public.lancamentos (
      tipo, categoria, descricao, valor, valor_pago, data, data_pagamento,
      status, forma_pagamento, numero_documento, observacoes, clinica_id, lote_tiss_id
    ) VALUES (
      'receita', v_categoria, v_descricao, v_variacao_financeira, v_variacao_financeira,
      p_data_pagamento, p_data_pagamento, 'pago', 'convenio',
      'TISS:' || v_lote.numero_lote, v_observacao, v_clinica, v_lote.id
    );
  ELSIF v_variacao_financeira < 0 THEN
    v_categoria := 'ajuste_convenio';
    v_descricao := 'Correção de recebimento do lote TISS ' || v_lote.numero_lote;
    v_observacao := 'Redução da conciliação financeira em R$ ' || to_char(abs(v_variacao_financeira), 'FM999999999990D00')
      || '. Motivo: ' || COALESCE(NULLIF(btrim(p_motivo_ajuste), ''), 'ajuste conciliado com o retorno atual do lote');
    INSERT INTO public.lancamentos (
      tipo, categoria, descricao, valor, valor_pago, data, data_pagamento,
      status, forma_pagamento, numero_documento, observacoes, clinica_id, lote_tiss_id
    ) VALUES (
      'despesa', v_categoria, v_descricao, abs(v_variacao_financeira), abs(v_variacao_financeira),
      p_data_pagamento, p_data_pagamento, 'pago', 'convenio',
      'TISS:' || v_lote.numero_lote, v_observacao, v_clinica, v_lote.id
    );
  END IF;

  UPDATE public.lotes_tiss
     SET valor_pago = p_valor_pago,
         status = v_status,
         retorno_em = now(),
         valor_conciliado_financeiro = CASE
           WHEN p_registrar_financeiro THEN p_valor_pago
           ELSE valor_conciliado_financeiro
         END,
         observacoes = CASE
           WHEN btrim(COALESCE(p_motivo_ajuste, '')) = '' THEN observacoes
           ELSE concat_ws(E'\n', NULLIF(observacoes, ''), 'Ajuste do retorno: ' || btrim(p_motivo_ajuste))
         END
   WHERE id = p_lote_id;

  RETURN jsonb_build_object(
    'success', true,
    'status', v_status,
    'valor_pago', p_valor_pago,
    'variacao_financeira', v_variacao_financeira,
    'valor_conciliado_financeiro', CASE
      WHEN p_registrar_financeiro THEN p_valor_pago
      ELSE v_lote.valor_conciliado_financeiro
    END
  );
END;
$$;

-- Compatibilidade com telas antigas: assume recebimento registrado hoje.
CREATE OR REPLACE FUNCTION public.registrar_retorno_lote_tiss(
  p_lote_id uuid,
  p_valor_pago numeric,
  p_motivo_ajuste text,
  p_data_pagamento date
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT public.registrar_retorno_lote_tiss(
    p_lote_id,
    p_valor_pago,
    p_motivo_ajuste,
    p_data_pagamento,
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.registrar_retorno_lote_tiss(
  p_lote_id uuid,
  p_valor_pago numeric,
  p_motivo_ajuste text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT public.registrar_retorno_lote_tiss(
    p_lote_id,
    p_valor_pago,
    p_motivo_ajuste,
    (now() AT TIME ZONE 'America/Sao_Paulo')::date,
    false
  );
$$;

REVOKE ALL ON FUNCTION public.registrar_retorno_lote_tiss(uuid, numeric, text, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_retorno_lote_tiss(uuid, numeric, text, date, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.registrar_retorno_lote_tiss(uuid, numeric, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_retorno_lote_tiss(uuid, numeric, text, date) TO authenticated;
REVOKE ALL ON FUNCTION public.registrar_retorno_lote_tiss(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_retorno_lote_tiss(uuid, numeric, text) TO authenticated;

COMMENT ON COLUMN public.lancamentos.lote_tiss_id IS
  'Lote TISS que originou este recebimento ou ajuste financeiro.';
COMMENT ON COLUMN public.lotes_tiss.valor_conciliado_financeiro IS
  'Total do lote já lançado no financeiro; pode divergir de valor_pago até a conciliação explícita.';
COMMENT ON FUNCTION public.registrar_retorno_lote_tiss(uuid, numeric, text, date, boolean) IS
  'Atualiza o total recebido do lote e, somente com confirmação explícita, lança no financeiro a diferença ainda não conciliada.';

COMMIT;
