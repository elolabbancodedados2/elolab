-- Registra glosas serializando alterações por lote, para que dois usuários
-- não ultrapassem juntos o valor total apresentado à operadora.
BEGIN;

ALTER TABLE public.glosas_convenio
  ADD COLUMN IF NOT EXISTS chave_idempotencia text;
CREATE UNIQUE INDEX IF NOT EXISTS glosas_convenio_chave_idempotencia
  ON public.glosas_convenio (chave_idempotencia)
  WHERE chave_idempotencia IS NOT NULL;

CREATE OR REPLACE FUNCTION public.registrar_glosa_convenio(
  p_lote_id uuid,
  p_codigo_glosa text,
  p_motivo text,
  p_guia_referencia text,
  p_valor_glosado numeric,
  p_chave_idempotencia text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinica_id uuid := public.get_my_clinica_id();
  v_lote public.lotes_tiss%ROWTYPE;
  v_total_anterior numeric(14,2);
  v_valor_glosado numeric(14,2);
  v_glosa_id uuid;
  v_lote_existente uuid;
  v_chave_idempotencia text;
BEGIN
  IF NOT public.can_access_financial(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso financeiro necessário';
  END IF;
  IF v_clinica_id IS NULL OR p_lote_id IS NULL THEN
    RAISE EXCEPTION 'Selecione um lote da clínica atual';
  END IF;
  IF NULLIF(btrim(COALESCE(p_chave_idempotencia, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Chave de idempotência obrigatória';
  END IF;
  v_chave_idempotencia := btrim(p_chave_idempotencia);
  IF p_chave_idempotencia IS NOT NULL THEN
    SELECT id, lote_id INTO v_glosa_id, v_lote_existente
      FROM public.glosas_convenio
     WHERE chave_idempotencia = v_chave_idempotencia
       AND clinica_id = v_clinica_id;
    IF FOUND THEN
      IF v_lote_existente IS DISTINCT FROM p_lote_id THEN
        RAISE EXCEPTION 'A chave de idempotência já foi usada em outra glosa';
      END IF;
      RETURN jsonb_build_object('success', true, 'repetido', true, 'id', v_glosa_id);
    END IF;
  END IF;
  IF length(btrim(COALESCE(p_codigo_glosa, ''))) = 0
     OR length(btrim(COALESCE(p_motivo, ''))) = 0
     OR p_valor_glosado IS NULL OR p_valor_glosado <= 0 THEN
    RAISE EXCEPTION 'Informe código, motivo e valor positivo da glosa';
  END IF;
  v_valor_glosado := round(p_valor_glosado, 2);
  IF v_valor_glosado <= 0 THEN
    RAISE EXCEPTION 'O valor da glosa deve ser de pelo menos um centavo';
  END IF;

  SELECT * INTO v_lote
    FROM public.lotes_tiss
   WHERE id = p_lote_id AND clinica_id = v_clinica_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote não encontrado nesta clínica';
  END IF;
  IF p_chave_idempotencia IS NOT NULL THEN
    SELECT id, lote_id INTO v_glosa_id, v_lote_existente
      FROM public.glosas_convenio
     WHERE chave_idempotencia = v_chave_idempotencia
       AND clinica_id = v_clinica_id;
    IF FOUND THEN
      IF v_lote_existente IS DISTINCT FROM p_lote_id THEN
        RAISE EXCEPTION 'A chave de idempotência já foi usada em outra glosa';
      END IF;
      RETURN jsonb_build_object('success', true, 'repetido', true, 'id', v_glosa_id);
    END IF;
  END IF;
  IF v_lote.status NOT IN ('enviado', 'processando', 'pago_parcial', 'pago') THEN
    RAISE EXCEPTION 'Registre glosas somente após o envio do lote à operadora';
  END IF;

  SELECT COALESCE(sum(g.valor_glosado), 0)
    INTO v_total_anterior
    FROM public.glosas_convenio g
   WHERE g.lote_id = p_lote_id
     AND g.clinica_id = v_clinica_id
     AND g.status <> 'cancelada';

  IF v_total_anterior + v_valor_glosado > v_lote.valor_apresentado + 0.009 THEN
    RAISE EXCEPTION 'O total das glosas ultrapassaria o valor apresentado neste lote';
  END IF;

  INSERT INTO public.glosas_convenio (
    clinica_id, lote_id, codigo_glosa, motivo, guia_referencia, valor_glosado, chave_idempotencia
  ) VALUES (
    v_clinica_id, p_lote_id, btrim(p_codigo_glosa), btrim(p_motivo),
    NULLIF(btrim(COALESCE(p_guia_referencia, '')), ''), v_valor_glosado, v_chave_idempotencia
  ) RETURNING id INTO v_glosa_id;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_glosa_id,
    'total_glosado', v_total_anterior + v_valor_glosado,
    'saldo_apresentado', v_lote.valor_apresentado - v_total_anterior - v_valor_glosado
  );
END;
$$;

REVOKE INSERT ON public.glosas_convenio FROM authenticated;
REVOKE ALL ON FUNCTION public.registrar_glosa_convenio(uuid, text, text, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_glosa_convenio(uuid, text, text, text, numeric, text) TO authenticated;

COMMENT ON FUNCTION public.registrar_glosa_convenio(uuid, text, text, text, numeric, text) IS
  'Registra glosa com idempotência, dentro do escopo da clínica, serializando pelo lote para impedir que a soma ultrapasse o valor apresentado.';

COMMIT;
