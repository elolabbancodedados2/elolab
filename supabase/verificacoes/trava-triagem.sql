-- ============================================================================
-- VERIFICAÇÃO — etapa 7: triagem entre o pagamento e a fila
--
-- Seis cenários, contra o banco real, terminando em ROLLBACK.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_com_triagem uuid;  -- clínica que liga a chave
  v_sem_triagem uuid;  -- clínica que não usa triagem
  v_paciente    uuid;
  v_medico      uuid;
  v_enfermeiro  uuid;
  v_ag          uuid;
BEGIN
  INSERT INTO public.clinicas (nome, exigir_triagem)
    VALUES ('__verificacao_triagem_on__', true) RETURNING id INTO v_com_triagem;
  INSERT INTO public.clinicas (nome, exigir_triagem)
    VALUES ('__verificacao_triagem_off__', false) RETURNING id INTO v_sem_triagem;

  INSERT INTO public.pacientes (nome, clinica_id)
    VALUES ('__verificacao_paciente__', v_com_triagem) RETURNING id INTO v_paciente;
  INSERT INTO public.medicos (nome, especialidade, crm, clinica_id)
    VALUES ('__verificacao_medico__', 'Clínica Geral', 'CRM-VT', v_com_triagem)
    RETURNING id INTO v_medico;

  -- ─── 1. Clínica sem triagem: entra direto ───
  INSERT INTO public.agendamentos (paciente_id, medico_id, data, hora_inicio, tipo, status, clinica_id)
    VALUES (v_paciente, v_medico, CURRENT_DATE, '08:00', 'consulta', 'confirmado', v_sem_triagem)
    RETURNING id INTO v_ag;
  UPDATE public.agendamentos SET status = 'em_atendimento' WHERE id = v_ag;
  RAISE NOTICE '1. OK — clínica que não usa triagem não foi afetada';

  -- ─── 2. Clínica com triagem, sem triagem registrada: bloqueia ───
  INSERT INTO public.agendamentos (paciente_id, medico_id, data, hora_inicio, tipo, status, clinica_id)
    VALUES (v_paciente, v_medico, CURRENT_DATE, '09:00', 'consulta', 'confirmado', v_com_triagem)
    RETURNING id INTO v_ag;
  BEGIN
    UPDATE public.agendamentos SET status = 'em_atendimento' WHERE id = v_ag;
    RAISE EXCEPTION 'FALHOU 2 — entrou em atendimento sem triagem';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE '2. OK — bloqueado sem triagem';
  END;

  -- ─── 3. Com a triagem registrada, entra ───
  -- `enfermeiro_id` é NOT NULL; qualquer profile serve para a verificação,
  -- que é desfeita no ROLLBACK.
  SELECT id INTO v_enfermeiro FROM public.profiles LIMIT 1;
  IF v_enfermeiro IS NULL THEN
    RAISE EXCEPTION 'Sem nenhum profile no banco para usar como enfermeiro da verificação';
  END IF;

  INSERT INTO public.triagens (paciente_id, agendamento_id, enfermeiro_id, pressao_arterial,
                               classificacao_risco, data_hora, clinica_id)
    VALUES (v_paciente, v_ag, v_enfermeiro, '120/80', 'verde', now(), v_com_triagem);
  UPDATE public.agendamentos SET status = 'em_atendimento' WHERE id = v_ag;
  RAISE NOTICE '3. OK — com triagem registrada, entra';

  -- ─── 4. Atendimento marcado como isento de triagem ───
  INSERT INTO public.agendamentos (paciente_id, medico_id, data, hora_inicio, tipo, status,
                                   clinica_id, exige_triagem)
    VALUES (v_paciente, v_medico, CURRENT_DATE, '10:00', 'retorno', 'confirmado',
            v_com_triagem, false)
    RETURNING id INTO v_ag;
  UPDATE public.agendamentos SET status = 'em_atendimento' WHERE id = v_ag;
  RAISE NOTICE '4. OK — atendimento isento entra sem triagem';

  -- ─── 5. Liberado com justificativa, e o carimbo de quem liberou ───
  INSERT INTO public.agendamentos (paciente_id, medico_id, data, hora_inicio, tipo, status, clinica_id)
    VALUES (v_paciente, v_medico, CURRENT_DATE, '11:00', 'consulta', 'confirmado', v_com_triagem)
    RETURNING id INTO v_ag;

  UPDATE public.agendamentos
     SET liberado_sem_triagem = true,
         liberado_sem_triagem_motivo = 'Enfermagem ausente'
   WHERE id = v_ag;

  IF (SELECT liberado_sem_triagem_em FROM public.agendamentos WHERE id = v_ag) IS NULL THEN
    RAISE EXCEPTION 'FALHOU 5 — a liberação não foi carimbada com a data';
  END IF;

  UPDATE public.agendamentos SET status = 'em_atendimento' WHERE id = v_ag;
  RAISE NOTICE '5. OK — liberação com justificativa entra e fica registrada';

  -- ─── 6. A trava de triagem não atrapalha a de pagamento ───
  -- (as duas leem o mesmo UPDATE OF status; nenhuma pode engolir a outra)
  UPDATE public.clinicas SET exigir_pagamento_previo = true WHERE id = v_com_triagem;
  INSERT INTO public.agendamentos (paciente_id, medico_id, data, hora_inicio, tipo, status,
                                   clinica_id, exige_triagem)
    VALUES (v_paciente, v_medico, CURRENT_DATE, '12:00', 'consulta', 'confirmado',
            v_com_triagem, false)
    RETURNING id INTO v_ag;
  INSERT INTO public.lancamentos (tipo, categoria, descricao, valor, data, data_vencimento,
                                  status, paciente_id, agendamento_id, clinica_id)
    VALUES ('receita', 'consulta', 'Consulta', 250, CURRENT_DATE, CURRENT_DATE,
            'pendente', v_paciente, v_ag, v_com_triagem);
  BEGIN
    UPDATE public.agendamentos SET status = 'em_atendimento' WHERE id = v_ag;
    RAISE EXCEPTION 'FALHOU 6 — isento de triagem passou devendo o pagamento';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE '6. OK — isento de triagem continua parando na trava de pagamento';
  END;

  RAISE NOTICE '';
  RAISE NOTICE '✅ 6/6 — etapa 7 verificada no banco real';
END $$;

ROLLBACK;
