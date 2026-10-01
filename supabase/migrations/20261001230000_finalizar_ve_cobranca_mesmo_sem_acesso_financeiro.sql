-- Finalizar atendimento falhava para o MÉDICO sempre que a consulta já tinha
-- cobrança (paga no balcão, por exemplo):
--   duplicate key value violates unique constraint "lancamentos_um_por_agendamento"
--
-- `finalizar_atendimento_atomico` é SECURITY INVOKER e checava a cobrança
-- existente com um SELECT em `lancamentos`. A política de RLS esconde o
-- financeiro do médico, então o SELECT voltava vazio, a função tentava criar
-- outra cobrança e o índice único (que não passa pelo RLS) recusava.
--
-- `agendamento_tem_cobranca_ativa` responde só sim/não, com SECURITY DEFINER,
-- e apenas para agendamentos da clínica de quem chama. O restante da função é
-- idêntico ao da migração 20261001190000.
BEGIN;

CREATE OR REPLACE FUNCTION public.agendamento_tem_cobranca_ativa(p_agendamento_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $f$
  SELECT EXISTS (
    SELECT 1
      FROM public.lancamentos l
      JOIN public.agendamentos a ON a.id = l.agendamento_id
     WHERE l.agendamento_id = p_agendamento_id
       AND l.status::text NOT IN ('cancelado', 'estornado')
       AND public.is_same_clinica(a.clinica_id)
  );
$f$;

REVOKE ALL ON FUNCTION public.agendamento_tem_cobranca_ativa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agendamento_tem_cobranca_ativa(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.finalizar_atendimento_atomico(
  p_agendamento_id uuid,
  p_fila_id uuid DEFAULT NULL,
  p_agendar_retorno boolean DEFAULT false,
  p_dias_retorno integer DEFAULT NULL,
  p_tipo_exame text DEFAULT NULL
)
RETURNS TABLE(status_agendamento text, retorno_id uuid, cobranca_criada boolean, repetido boolean)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  a public.agendamentos%ROWTYPE;
  v_fila public.fila_atendimento%ROWTYPE;
  pac_nome text;
  pac_convenio uuid;
  v_tipo public.tipos_consulta%ROWTYPE;
  v_valor numeric;
  v_valor_convenio numeric;
  v_categoria text := 'consulta';
  v_desc text;
  v_retorno uuid;
  v_status text := 'finalizado';
  v_exige boolean := false;
  v_criada boolean := false;
BEGIN
  SELECT * INTO a
    FROM public.agendamentos
   WHERE id = p_agendamento_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado ou fora da sua clínica';
  END IF;

  IF p_fila_id IS NOT NULL THEN
    SELECT * INTO v_fila
      FROM public.fila_atendimento
     WHERE id = p_fila_id AND agendamento_id = a.id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item da fila não pertence ao agendamento';
    END IF;
  ELSE
    SELECT * INTO v_fila
      FROM public.fila_atendimento
     WHERE agendamento_id = a.id
       AND status::text NOT IN ('finalizado', 'concluido')
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE;
  END IF;

  -- A matching replay is a no-op. In particular, it must not recreate a
  -- charge, return, or overwrite a cancellation made by another session.
  IF a.status::text IN ('finalizado', 'atendimento_finalizado', 'aguardando_pagamento_adicional') THEN
    SELECT id INTO v_retorno
      FROM public.retornos
     WHERE agendamento_id = a.id AND status <> 'cancelado'
     ORDER BY created_at DESC
     LIMIT 1;
    IF v_fila.id IS NOT NULL THEN
      UPDATE public.fila_atendimento SET status = 'finalizado' WHERE id = v_fila.id;
    END IF;
    RETURN QUERY SELECT a.status::text, v_retorno, false, true;
    RETURN;
  END IF;

  IF a.status::text <> 'em_atendimento' THEN
    RAISE EXCEPTION 'Atendimento mudou desde a última atualização. Recarregue a lista antes de tentar novamente.'
      USING ERRCODE = '40001';
  END IF;

  SELECT nome, convenio_id
    INTO pac_nome, pac_convenio
    FROM public.pacientes
   WHERE id = a.paciente_id AND clinica_id = a.clinica_id;

  -- O médico não enxerga `lancamentos` (RLS financeiro). Consultar a tabela
  -- direto aqui devolvia "não há cobrança" para uma consulta já paga, e o
  -- INSERT seguinte batia no índice único: finalizar falhava sempre.
  IF NOT public.agendamento_tem_cobranca_ativa(a.id) THEN
    IF lower(trim(coalesce(a.tipo, ''))) IN ('exame', 'exames')
       OR nullif(trim(p_tipo_exame), '') IS NOT NULL THEN
      v_categoria := 'exame';
      v_desc := coalesce(nullif(trim(p_tipo_exame), ''), 'Exame');
      v_valor := public.resolver_preco_exame(
        a.clinica_id, coalesce(a.convenio_id, pac_convenio), v_desc
      );
      IF coalesce(v_valor, 0) <= 0 THEN
        RAISE EXCEPTION 'Não há preço cadastrado para o exame "%"', v_desc;
      END IF;
    ELSE
      v_desc := CASE
        WHEN lower(trim(coalesce(a.tipo, ''))) IN ('retorno', 'consulta retorno', 'consulta de retorno')
          THEN 'Retorno'
        ELSE a.tipo
      END;
      SELECT * INTO v_tipo
        FROM public.tipos_consulta
       WHERE clinica_id = a.clinica_id AND ativo AND nome ILIKE v_desc
       LIMIT 1;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Não há preço cadastrado para a consulta "%"', v_desc;
      END IF;
      v_valor := v_tipo.valor_particular;
      v_desc := v_tipo.nome;
      IF coalesce(a.convenio_id, pac_convenio) IS NOT NULL THEN
        SELECT valor INTO v_valor_convenio
          FROM public.precos_consulta_convenio
         WHERE clinica_id = a.clinica_id
           AND convenio_id = coalesce(a.convenio_id, pac_convenio)
           AND tipo_consulta_id = v_tipo.id
           AND ativo
         LIMIT 1;
      END IF;
      v_valor := coalesce(v_valor_convenio, v_valor);
      IF coalesce(v_valor, 0) <= 0 THEN v_valor := NULL; END IF;
    END IF;

    IF v_valor IS NOT NULL THEN
      INSERT INTO public.lancamentos(
        tipo, categoria, descricao, valor, data, data_vencimento,
        status, paciente_id, agendamento_id, clinica_id
      ) VALUES (
        'receita', v_categoria, v_desc || ' - ' || pac_nome, v_valor,
        current_date, current_date, 'pendente', a.paciente_id, a.id, a.clinica_id
      );
      v_criada := true;
    END IF;
  END IF;

  SELECT coalesce(exigir_pagamento_previo, false)
    INTO v_exige FROM public.clinicas WHERE id = a.clinica_id;
  IF v_exige AND coalesce(public.saldo_devedor_do_agendamento(a.id), 0) > 0.009 THEN
    v_status := 'aguardando_pagamento_adicional';
  END IF;

  UPDATE public.agendamentos
     SET status = v_status::public.status_agendamento
   WHERE id = a.id;
  IF v_fila.id IS NOT NULL THEN
    UPDATE public.fila_atendimento SET status = 'finalizado' WHERE id = v_fila.id;
  END IF;

  IF p_agendar_retorno THEN
    IF p_dias_retorno IS NULL OR p_dias_retorno NOT BETWEEN 1 AND 730 THEN
      RAISE EXCEPTION 'Prazo do retorno deve estar entre 1 e 730 dias';
    END IF;
    SELECT id INTO v_retorno
      FROM public.retornos
     WHERE agendamento_id = a.id AND status <> 'cancelado'
     ORDER BY created_at DESC
     LIMIT 1;
    IF v_retorno IS NULL THEN
      INSERT INTO public.retornos(
        paciente_id, medico_id, data_retorno_prevista, data_consulta_origem,
        motivo, status, agendamento_id, clinica_id, historico
      ) VALUES (
        a.paciente_id, a.medico_id, current_date + p_dias_retorno,
        current_date, 'Retorno de ' || a.tipo, 'pendente', a.id,
        a.clinica_id, jsonb_build_array(jsonb_build_object('evento', 'criado', 'em', now()))
      ) RETURNING id INTO v_retorno;
    END IF;
  END IF;

  RETURN QUERY SELECT v_status, v_retorno, v_criada, false;
END;
$$;

REVOKE ALL ON FUNCTION public.finalizar_atendimento_atomico(uuid, uuid, boolean, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalizar_atendimento_atomico(uuid, uuid, boolean, integer, text) TO authenticated;

COMMIT;
