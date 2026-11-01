-- Conciliação de glosas com o retorno do lote TISS.
--
-- 1. Pago + glosado não pode passar do apresentado, nem ao registrar a glosa
--    nem ao registrar o retorno.
-- 2. O valor recuperado num recurso aceito entra no financeiro como receita
--    do convênio, ligada ao lote.
-- Definições partem das versões em produção em 01/11/2026.

CREATE OR REPLACE FUNCTION public.registrar_glosa_convenio(p_lote_id uuid, p_codigo_glosa text, p_motivo text, p_guia_referencia text, p_valor_glosado numeric, p_chave_idempotencia text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- Pago + glosado não pode passar do apresentado: o que a operadora pagou não foi glosado.
  IF v_lote.valor_pago + v_total_anterior + v_valor_glosado > v_lote.valor_apresentado + 0.009 THEN
    RAISE EXCEPTION 'Pago (%) mais glosas (%) ultrapassaria o valor apresentado (%) neste lote',
      v_lote.valor_pago, v_total_anterior + v_valor_glosado, v_lote.valor_apresentado;
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
$function$;

CREATE OR REPLACE FUNCTION public.registrar_retorno_lote_tiss(p_lote_id uuid, p_valor_pago numeric, p_motivo_ajuste text, p_data_pagamento date, p_registrar_financeiro boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_clinica uuid := public.get_my_clinica_id();
  v_lote public.lotes_tiss%ROWTYPE;
  v_status text;
  v_variacao_financeira numeric(14,2) := 0;
  v_categoria text;
  v_descricao text;
  v_observacao text;
  v_glosado numeric(14,2);
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
  -- O recebido mais o glosado não fecha acima do apresentado.
  SELECT COALESCE(sum(g.valor_glosado), 0) INTO v_glosado
    FROM public.glosas_convenio g
   WHERE g.lote_id = p_lote_id AND g.clinica_id = v_clinica AND g.status <> 'cancelada';
  IF p_valor_pago + v_glosado > v_lote.valor_apresentado + 0.009 THEN
    RAISE EXCEPTION 'Recebido (%) mais glosas registradas (%) ultrapassa o valor apresentado (%). Confira as glosas do lote.',
      p_valor_pago, v_glosado, v_lote.valor_apresentado;
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
$function$;

CREATE OR REPLACE FUNCTION public.atualizar_glosa_convenio(p_glosa_id uuid, p_status text, p_recurso_justificativa text DEFAULT NULL::text, p_valor_recuperado numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_clinica uuid := public.get_my_clinica_id();
  v_glosa public.glosas_convenio%ROWTYPE;
  v_status_anterior text;
  v_justificativa text := NULLIF(btrim(COALESCE(p_recurso_justificativa, '')), '');
  v_recuperado numeric(14,2);
  v_lote public.lotes_tiss%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_financial(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso financeiro necessário';
  END IF;
  IF v_clinica IS NULL OR p_glosa_id IS NULL THEN
    RAISE EXCEPTION 'Glosa inválida';
  END IF;

  SELECT * INTO v_glosa
    FROM public.glosas_convenio
   WHERE id = p_glosa_id AND clinica_id = v_clinica
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Glosa não encontrada nesta clínica';
  END IF;
  v_status_anterior := v_glosa.status;

  IF p_status = 'recurso_preparacao'
     AND v_status_anterior IN ('pendente', 'recurso_preparacao') THEN
    IF length(COALESCE(v_justificativa, '')) < 10 THEN
      RAISE EXCEPTION 'A justificativa do recurso deve ter ao menos 10 caracteres';
    END IF;
    UPDATE public.glosas_convenio
       SET status = 'recurso_preparacao', recurso_justificativa = v_justificativa
     WHERE id = v_glosa.id;
  ELSIF p_status = 'recurso_enviado' AND v_status_anterior = 'recurso_preparacao' THEN
    IF length(COALESCE(NULLIF(btrim(v_glosa.recurso_justificativa), ''), '')) < 10 THEN
      RAISE EXCEPTION 'Registre a justificativa antes de enviar o recurso';
    END IF;
    IF v_glosa.recurso_prazo IS NULL OR v_glosa.recurso_responsavel_id IS NULL THEN
      RAISE EXCEPTION 'Defina o prazo e o responsável antes de enviar o recurso';
    END IF;
    UPDATE public.glosas_convenio
       SET status = 'recurso_enviado', recurso_enviado_em = now()
     WHERE id = v_glosa.id;
  ELSIF p_status IN ('aceita', 'mantida') AND v_status_anterior = 'recurso_enviado' THEN
    v_recuperado := COALESCE(p_valor_recuperado, 0);
    IF v_recuperado < 0 OR v_recuperado > v_glosa.valor_glosado
       OR v_recuperado <> round(v_recuperado, 2)
       OR (p_status = 'mantida' AND v_recuperado <> 0) THEN
      RAISE EXCEPTION 'O valor recuperado deve estar entre zero e o valor glosado';
    END IF;
    UPDATE public.glosas_convenio
       SET status = p_status, valor_recuperado = v_recuperado, resolvido_em = now()
     WHERE id = v_glosa.id;
    -- O valor recuperado no recurso é dinheiro que entra: vira receita no
    -- financeiro, ligada ao lote. Antes ficava só registrado na glosa.
    IF p_status = 'aceita' AND v_recuperado > 0 THEN
      SELECT * INTO v_lote FROM public.lotes_tiss WHERE id = v_glosa.lote_id AND clinica_id = v_clinica;
      INSERT INTO public.lancamentos (
        tipo, categoria, descricao, valor, valor_pago, data, data_pagamento,
        status, forma_pagamento, numero_documento, observacoes, clinica_id, lote_tiss_id
      ) VALUES (
        'receita', 'convenio_repasse',
        'Recurso de glosa aceito - lote TISS ' || COALESCE(v_lote.numero_lote, ''),
        v_recuperado, v_recuperado,
        (now() AT TIME ZONE 'America/Sao_Paulo')::date, (now() AT TIME ZONE 'America/Sao_Paulo')::date,
        'pago', 'convenio', 'GLOSA:' || v_glosa.codigo_glosa,
        'Valor recuperado no recurso da glosa ' || v_glosa.codigo_glosa,
        v_clinica, v_glosa.lote_id
      );
    END IF;
  ELSE
    RAISE EXCEPTION 'Transição de glosa inválida';
  END IF;

  RETURN jsonb_build_object('success', true, 'id', v_glosa.id, 'status', p_status);
END;
$function$;
