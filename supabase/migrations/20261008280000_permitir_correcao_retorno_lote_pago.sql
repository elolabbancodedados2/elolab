-- Permite corrigir retornos já marcados como pagos. Reduções continuam
-- exigindo justificativa e são anexadas às observações para auditoria.
BEGIN;

CREATE OR REPLACE FUNCTION public.registrar_retorno_lote_tiss(
  p_lote_id uuid,
  p_valor_pago numeric,
  p_motivo_ajuste text DEFAULT NULL
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
BEGIN
  IF NOT public.can_access_financial(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso financeiro necessário';
  END IF;
  IF v_clinica IS NULL OR p_lote_id IS NULL OR p_valor_pago IS NULL THEN
    RAISE EXCEPTION 'Lote e valor recebido são obrigatórios';
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
  IF p_valor_pago < 0 OR p_valor_pago > v_lote.valor_apresentado THEN
    RAISE EXCEPTION 'O valor recebido deve ficar entre zero e o valor apresentado.';
  END IF;
  IF p_valor_pago < v_lote.valor_pago AND length(btrim(COALESCE(p_motivo_ajuste, ''))) < 5 THEN
    RAISE EXCEPTION 'Informe o motivo para reduzir o valor recebido anteriormente (mínimo 5 caracteres).';
  END IF;
  IF p_valor_pago = v_lote.valor_pago AND v_lote.retorno_em IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'repetido', true,
      'status', v_lote.status,
      'valor_pago', v_lote.valor_pago
    );
  END IF;

  v_status := CASE
    WHEN round(p_valor_pago * 100) >= round(v_lote.valor_apresentado * 100) THEN 'pago'
    WHEN p_valor_pago > 0 THEN 'pago_parcial'
    ELSE 'processando'
  END;

  UPDATE public.lotes_tiss
     SET valor_pago = p_valor_pago,
         status = v_status,
         retorno_em = now(),
         observacoes = CASE
           WHEN btrim(COALESCE(p_motivo_ajuste, '')) = '' THEN observacoes
           ELSE concat_ws(E'\n', NULLIF(observacoes, ''), 'Ajuste do retorno: ' || btrim(p_motivo_ajuste))
         END
   WHERE id = p_lote_id;

  RETURN jsonb_build_object('success', true, 'status', v_status, 'valor_pago', p_valor_pago);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_retorno_lote_tiss(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_retorno_lote_tiss(uuid, numeric, text) TO authenticated;

COMMENT ON FUNCTION public.registrar_retorno_lote_tiss(uuid, numeric, text) IS
  'Registra o total acumulado recebido por lote TISS; permite corrigir lotes pagos e exige motivo auditável quando o valor diminui.';

COMMIT;
