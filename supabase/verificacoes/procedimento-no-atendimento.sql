-- ============================================================================
-- VERIFICAÇÃO — etapa 8: procedimento lançado durante a consulta
--
-- O cenário do enunciado, letra por letra:
--   consulta R$ 250 → paciente paga R$ 250 → entra → sutura R$ 100 durante a
--   consulta → finaliza → falta pagar R$ 100.
--
-- Termina em ROLLBACK: nada fica no banco.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_clinica   uuid;
  v_paciente  uuid;
  v_medico    uuid;
  v_ag        uuid;
  v_conta     uuid;
  v_saldo     numeric;
  v_valor     numeric;
  v_pago      numeric;
  v_status    text;
  v_itens     int;
  v_erro      text;
BEGIN
  -- ─── Cenário ───
  INSERT INTO public.clinicas (nome, exigir_pagamento_previo)
    VALUES ('__verificacao_etapa8__', true) RETURNING id INTO v_clinica;

  INSERT INTO public.pacientes (nome, clinica_id)
    VALUES ('__verificacao_paciente__', v_clinica) RETURNING id INTO v_paciente;

  INSERT INTO public.medicos (nome, especialidade, crm, clinica_id)
    VALUES ('__verificacao_medico__', 'Clínica Geral', 'CRM-VERIF', v_clinica)
    RETURNING id INTO v_medico;

  INSERT INTO public.agendamentos (paciente_id, medico_id, data, hora_inicio, tipo, status, clinica_id)
    VALUES (v_paciente, v_medico, CURRENT_DATE, '10:00', 'consulta', 'confirmado', v_clinica)
    RETURNING id INTO v_ag;

  INSERT INTO public.lancamentos (tipo, categoria, descricao, valor, data, data_vencimento,
                                  status, paciente_id, agendamento_id, clinica_id)
    VALUES ('receita', 'consulta', 'Consulta', 250, CURRENT_DATE, CURRENT_DATE,
            'pendente', v_paciente, v_ag, v_clinica)
    RETURNING id INTO v_conta;

  -- ─── 1. Paga os R$ 250 e entra no consultório ───
  UPDATE public.lancamentos SET valor_pago = 250, status = 'pago' WHERE id = v_conta;

  UPDATE public.agendamentos SET status = 'em_atendimento' WHERE id = v_ag;
  RAISE NOTICE '1. OK — pagou R$ 250 e entrou em atendimento';

  -- ─── 2. Sutura de R$ 100 durante a consulta ───
  PERFORM public.lancar_item_no_atendimento(
    p_agendamento_id => v_ag,
    p_descricao      => 'Sutura simples',
    p_valor_unitario => 100,
    p_quantidade     => 1
  );

  SELECT valor, COALESCE(valor_pago,0), status::text INTO v_valor, v_pago, v_status
    FROM public.lancamentos WHERE id = v_conta;
  v_saldo := public.saldo_devedor_do_agendamento(v_ag);

  IF v_valor <> 350 THEN
    RAISE EXCEPTION 'FALHOU 2 — valor da conta deveria ser 350, veio %', v_valor;
  END IF;
  IF v_pago <> 250 THEN
    RAISE EXCEPTION 'FALHOU 2 — pago deveria continuar 250, veio %', v_pago;
  END IF;
  IF v_saldo <> 100 THEN
    RAISE EXCEPTION 'FALHOU 2 — saldo deveria ser 100, veio %', v_saldo;
  END IF;
  IF v_status <> 'parcial' THEN
    RAISE EXCEPTION 'FALHOU 2 — status deveria virar parcial, veio %', v_status;
  END IF;
  RAISE NOTICE '2. OK — sutura R$ 100: conta 350, pago 250, saldo 100, status parcial';

  -- ─── 3. A trava NÃO pode impedir a volta para em_atendimento ───
  -- (compensação de falha no faturamento; era o bug da parte 2 da etapa 8)
  UPDATE public.agendamentos SET status = 'aguardando_pagamento_adicional' WHERE id = v_ag;
  BEGIN
    UPDATE public.agendamentos SET status = 'em_atendimento' WHERE id = v_ag;
    RAISE NOTICE '3. OK — voltar para em_atendimento com saldo em aberto é permitido';
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'FALHOU 3 — a trava bloqueou a compensação: %', SQLERRM;
  END;

  -- ─── 4. Mas ENTRAR devendo continua proibido ───
  DECLARE
    v_ag2 uuid;
  BEGIN
    INSERT INTO public.agendamentos (paciente_id, medico_id, data, hora_inicio, tipo, status, clinica_id)
      VALUES (v_paciente, v_medico, CURRENT_DATE, '11:00', 'consulta', 'confirmado', v_clinica)
      RETURNING id INTO v_ag2;
    INSERT INTO public.lancamentos (tipo, categoria, descricao, valor, data, data_vencimento,
                                    status, paciente_id, agendamento_id, clinica_id)
      VALUES ('receita', 'consulta', 'Consulta', 250, CURRENT_DATE, CURRENT_DATE,
              'pendente', v_paciente, v_ag2, v_clinica);
    BEGIN
      UPDATE public.agendamentos SET status = 'em_atendimento' WHERE id = v_ag2;
      RAISE EXCEPTION 'FALHOU 4 — entrou em atendimento devendo R$ 250';
    EXCEPTION WHEN check_violation THEN
      RAISE NOTICE '4. OK — entrar devendo continua bloqueado';
    END;
  END;

  -- ─── 5. Retorno gratuito: sem conta, a função cria uma ───
  DECLARE
    v_ag3 uuid;
    v_conta3 uuid;
  BEGIN
    INSERT INTO public.agendamentos (paciente_id, medico_id, data, hora_inicio, tipo, status, clinica_id)
      VALUES (v_paciente, v_medico, CURRENT_DATE, '12:00', 'retorno', 'confirmado', v_clinica)
      RETURNING id INTO v_ag3;

    -- Sem cobrança nenhuma: retorno é gratuito e o paciente entra direto.
    UPDATE public.agendamentos SET status = 'em_atendimento' WHERE id = v_ag3;

    PERFORM public.lancar_item_no_atendimento(
      p_agendamento_id => v_ag3,
      p_descricao      => 'Retirada de pontos',
      p_valor_unitario => 60
    );

    SELECT id, valor INTO v_conta3, v_valor
      FROM public.lancamentos WHERE agendamento_id = v_ag3;
    IF v_conta3 IS NULL OR v_valor <> 60 THEN
      RAISE EXCEPTION 'FALHOU 5 — conta do retorno não foi criada com R$ 60 (veio %)', v_valor;
    END IF;
    RAISE NOTICE '5. OK — retorno gratuito ganhou conta de R$ 60 pelo procedimento';
  END;

  -- ─── 6. Valor zero e descrição vazia são recusados ───
  BEGIN
    PERFORM public.lancar_item_no_atendimento(v_ag, 'Sem preço', 0);
    RAISE EXCEPTION 'FALHOU 6 — aceitou procedimento de valor zero';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
    IF v_erro LIKE 'FALHOU%' THEN RAISE; END IF;
    RAISE NOTICE '6a. OK — valor zero recusado: %', v_erro;
  END;

  BEGIN
    PERFORM public.lancar_item_no_atendimento(v_ag, '   ', 50);
    RAISE EXCEPTION 'FALHOU 6 — aceitou descrição em branco';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
    IF v_erro LIKE 'FALHOU%' THEN RAISE; END IF;
    RAISE NOTICE '6b. OK — descrição vazia recusada: %', v_erro;
  END;

  -- ─── 7. Quantidade multiplica ───
  PERFORM public.lancar_item_no_atendimento(v_ag, 'Curativo', 25, 3);
  SELECT valor INTO v_valor FROM public.lancamentos WHERE id = v_conta;
  IF v_valor <> 425 THEN
    RAISE EXCEPTION 'FALHOU 7 — 350 + (25 × 3) deveria dar 425, veio %', v_valor;
  END IF;
  SELECT count(*) INTO v_itens FROM public.lancamento_itens
    WHERE lancamento_id = v_conta AND origem = 'atendimento';
  IF v_itens <> 2 THEN
    RAISE EXCEPTION 'FALHOU 7 — deveriam existir 2 itens de atendimento, existem %', v_itens;
  END IF;
  RAISE NOTICE '7. OK — 3 curativos de R$ 25: conta foi para R$ 425';

  RAISE NOTICE '';
  RAISE NOTICE '✅ 7/7 — etapa 8 verificada no banco real';
END $$;

ROLLBACK;
