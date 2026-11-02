-- Triagem e finalização só pelos caminhos previstos (auditoria de 02/11).
--
-- A recepção conseguia pular a triagem gravando exige_triagem = false e
-- fechar o atendimento com UPDATE direto de status (pago → finalizado ou
-- em_atendimento → finalizado), sem passar pela finalização com prontuário e
-- cobrança. Agora:
--   * desligar exige_triagem conta como liberação excepcional (médico/admin);
--   * pago → finalizado sai das transições permitidas;
--   * em_atendimento → finalizado/atendimento_finalizado só dentro de
--     finalizar_atendimento_atomico, que liga a flag local elolab.finalizando.
-- aguardando_pagamento_adicional → finalizado continua permitido: é o caminho
-- do recebimento do adicional (20260923110000).
-- Base: definições de 20261024100000, 20261101103000 e 20261101105000.

CREATE OR REPLACE FUNCTION public.restringir_liberacao_excepcional()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_liberou_pagamento boolean;
  v_liberou_triagem boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_liberou_pagamento := COALESCE(NEW.liberado_sem_pagamento, false);
    v_liberou_triagem := COALESCE(NEW.liberado_sem_triagem, false);
  ELSE
    v_liberou_pagamento := COALESCE(NEW.liberado_sem_pagamento, false) AND NOT COALESCE(OLD.liberado_sem_pagamento, false);
    v_liberou_triagem := (COALESCE(NEW.liberado_sem_triagem, false) AND NOT COALESCE(OLD.liberado_sem_triagem, false))
      -- Desligar exige_triagem dispensa a triagem do mesmo jeito que liberado_sem_triagem.
      OR (COALESCE(OLD.exige_triagem, true) AND NOT COALESCE(NEW.exige_triagem, true));
  END IF;

  IF (v_liberou_pagamento OR v_liberou_triagem)
     AND NOT (public.is_admin(auth.uid()) OR public.is_medico(auth.uid())) THEN
    RAISE EXCEPTION 'Liberação excepcional exige perfil médico ou administrador.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.restringir_liberacao_excepcional() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS agendamentos_restringir_liberacao_excepcional ON public.agendamentos;
CREATE TRIGGER agendamentos_restringir_liberacao_excepcional
  BEFORE INSERT OR UPDATE OF liberado_sem_pagamento, liberado_sem_triagem, exige_triagem ON public.agendamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.restringir_liberacao_excepcional();

CREATE OR REPLACE FUNCTION public.validar_transicao_status_agendamento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_permitidos text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS NULL OR NEW.status::text NOT IN ('agendado', 'confirmado') THEN
      RAISE EXCEPTION 'Um agendamento novo deve iniciar como agendado ou confirmado.' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status::text = 'cancelado'
     AND NEW.status::text = 'agendado'
     AND EXISTS (
       SELECT 1 FROM public.retornos r
        WHERE r.agendamento_retorno_id = NEW.id
          AND r.clinica_id = NEW.clinica_id
          AND r.status::text NOT IN ('realizado', 'cancelado')
     ) THEN
    RETURN NEW;
  END IF;

  -- Correções com motivo, só dentro de corrigir_status_agendamento (flag local da transação).
  IF current_setting('elolab.corrigindo_status', true) = 'on'
     AND ((OLD.status::text = 'faltou' AND NEW.status::text = 'agendado')
       OR (OLD.status::text = 'em_atendimento' AND NEW.status::text = 'aguardando')) THEN
    RETURN NEW;
  END IF;

  -- Volta permitida só dentro de desfazer_checkin_sem_cobranca (flag local da transação).
  IF OLD.status::text = 'aguardando'
     AND NEW.status::text IN ('agendado', 'confirmado')
     AND current_setting('elolab.desfazendo_checkin', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- Finalizar só pela RPC finalizar_atendimento_atomico (flag local da transação).
  -- Sem ela, a recepção fechava o atendimento por UPDATE direto, sem prontuário nem cobrança.
  IF OLD.status::text = 'em_atendimento'
     AND NEW.status::text IN ('finalizado', 'atendimento_finalizado')
     AND current_setting('elolab.finalizando', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Finalize o atendimento pela tela de finalização.' USING ERRCODE = 'check_violation';
  END IF;

  v_permitidos := CASE OLD.status::text
    WHEN 'agendado' THEN ARRAY['confirmado', 'aguardando', 'aguardando_pagamento', 'aguardando_triagem', 'em_triagem', 'pago', 'cancelado', 'faltou']
    WHEN 'confirmado' THEN ARRAY['aguardando', 'aguardando_pagamento', 'aguardando_triagem', 'em_triagem', 'pago', 'cancelado', 'faltou']
    WHEN 'aguardando' THEN ARRAY['aguardando_pagamento', 'aguardando_triagem', 'em_triagem', 'em_atendimento', 'pago', 'cancelado', 'faltou']
    WHEN 'aguardando_pagamento' THEN ARRAY['aguardando', 'pago', 'cancelado']
    WHEN 'aguardando_triagem' THEN ARRAY['aguardando', 'em_triagem', 'em_atendimento', 'pago', 'cancelado', 'faltou']
    WHEN 'em_triagem' THEN ARRAY['aguardando', 'em_atendimento', 'pago', 'cancelado']
    WHEN 'pago' THEN ARRAY['aguardando', 'aguardando_triagem', 'em_triagem', 'em_atendimento', 'aguardando_pagamento_adicional']
    WHEN 'em_atendimento' THEN ARRAY['finalizado', 'atendimento_finalizado', 'aguardando_pagamento_adicional', 'cancelado']
    WHEN 'aguardando_pagamento_adicional' THEN ARRAY['pago', 'finalizado', 'atendimento_finalizado']
    WHEN 'finalizado' THEN ARRAY['atendimento_finalizado', 'aguardando_pagamento_adicional']
    ELSE ARRAY[]::text[]
  END;

  IF NEW.status IS NULL OR NOT (NEW.status::text = ANY(v_permitidos)) THEN
    RAISE EXCEPTION 'Transição de status de agendamento inválida: % → %.', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status::text = 'pago'
     AND COALESCE(public.saldo_devedor_do_agendamento(NEW.id), 0) > 0.009 THEN
    RAISE EXCEPTION 'O agendamento não pode ficar pago enquanto houver saldo em aberto.' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.validar_transicao_status_agendamento() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.finalizar_atendimento_atomico(p_agendamento_id uuid, p_fila_id uuid DEFAULT NULL::uuid, p_agendar_retorno boolean DEFAULT false, p_dias_retorno integer DEFAULT NULL::integer, p_tipo_exame text DEFAULT NULL::text)
 RETURNS TABLE(status_agendamento text, retorno_id uuid, cobranca_criada boolean, repetido boolean)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
        (now() AT TIME ZONE 'America/Sao_Paulo')::date, (now() AT TIME ZONE 'America/Sao_Paulo')::date, 'pendente', a.paciente_id, a.id, a.clinica_id
      );
      v_criada := true;
    END IF;
  END IF;

  SELECT coalesce(exigir_pagamento_previo, false)
    INTO v_exige FROM public.clinicas WHERE id = a.clinica_id;
  IF v_exige AND coalesce(public.saldo_devedor_do_agendamento(a.id), 0) > 0.009 THEN
    v_status := 'aguardando_pagamento_adicional';
  END IF;

  -- Autoriza a transição para finalizado em validar_transicao_status_agendamento.
  PERFORM set_config('elolab.finalizando', 'on', true);
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
        a.paciente_id, a.medico_id, (now() AT TIME ZONE 'America/Sao_Paulo')::date + p_dias_retorno,
        (now() AT TIME ZONE 'America/Sao_Paulo')::date, 'Retorno de ' || a.tipo, 'pendente', a.id,
        a.clinica_id, jsonb_build_array(jsonb_build_object('evento', 'criado', 'em', now()))
      ) RETURNING id INTO v_retorno;
    END IF;
  END IF;

  RETURN QUERY SELECT v_status, v_retorno, v_criada, false;
END;
$function$
;

REVOKE ALL ON FUNCTION public.finalizar_atendimento_atomico(uuid, uuid, boolean, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalizar_atendimento_atomico(uuid, uuid, boolean, integer, text) TO authenticated;
