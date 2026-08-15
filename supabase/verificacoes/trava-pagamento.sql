-- ============================================================================
-- Verificação da trava "pagar antes da consulta"
--
-- Roda contra o banco REAL e termina em ROLLBACK — não deixa rastro. Cria uma
-- clínica descartável para não tocar em nenhuma das reais.
--
-- Os seis cenários que a regra precisa acertar, e o esperado de cada um:
--
--   1 trava desligada, devendo   ATENDEU   (comportamento de hoje, preservado)
--   2 ligada, devendo            bloqueou  (a regra)
--   3 ligada, paga               ATENDEU
--   4 retorno gratuito           ATENDEU   (sem cobrança → sem saldo)
--   5 isento / convênio          ATENDEU   (exige_pagamento_previo = false)
--   6 liberado com justificativa ATENDEU   (escapatória auditada)
--
-- Qualquer linha marcada "(ERRADO)" indica regressão.
--
-- Uso: cole no SQL Editor do Supabase.
-- ============================================================================

BEGIN;
DO $$
DECLARE
  cli uuid; pac uuid; med uuid; ag uuid; lanc uuid;
  r_desligada text; r_ligada_devendo text; r_ligada_paga text;
  r_retorno text; r_isento text; r_liberado text;
BEGIN
  INSERT INTO public.clinicas (nome) VALUES ('TESTE TRAVA') RETURNING id INTO cli;
  INSERT INTO public.pacientes (nome, clinica_id) VALUES ('Paciente Teste', cli) RETURNING id INTO pac;
  INSERT INTO public.medicos (nome, crm, clinica_id) VALUES ('Dr Teste', 'TESTE-000', cli) RETURNING id INTO med;

  -- ── 1) trava DESLIGADA: devendo, mas atende (comportamento de hoje) ──
  INSERT INTO public.agendamentos (paciente_id, medico_id, data, hora_inicio, tipo, status, clinica_id)
  VALUES (pac, med, CURRENT_DATE, '09:00', 'consulta', 'aguardando', cli) RETURNING id INTO ag;
  INSERT INTO public.lancamentos (tipo, categoria, descricao, valor, data, data_vencimento, status, agendamento_id, clinica_id)
  VALUES ('receita','consulta','C',250,CURRENT_DATE,CURRENT_DATE,'pendente', ag, cli) RETURNING id INTO lanc;
  BEGIN
    UPDATE public.agendamentos SET status='em_atendimento' WHERE id=ag;
    r_desligada := 'ATENDEU (correto)';
  EXCEPTION WHEN OTHERS THEN r_desligada := 'bloqueou (ERRADO)'; END;

  -- ── liga a trava ──
  UPDATE public.clinicas SET exigir_pagamento_previo = true WHERE id = cli;

  -- ── 2) LIGADA, devendo: tem de bloquear ──
  INSERT INTO public.agendamentos (paciente_id, medico_id, data, hora_inicio, tipo, status, clinica_id)
  VALUES (pac, med, CURRENT_DATE, '10:00', 'consulta', 'aguardando', cli) RETURNING id INTO ag;
  INSERT INTO public.lancamentos (tipo, categoria, descricao, valor, data, data_vencimento, status, agendamento_id, clinica_id)
  VALUES ('receita','consulta','C',250,CURRENT_DATE,CURRENT_DATE,'pendente', ag, cli);
  BEGIN
    UPDATE public.agendamentos SET status='em_atendimento' WHERE id=ag;
    r_ligada_devendo := 'ATENDEU (ERRADO)';
  EXCEPTION WHEN OTHERS THEN r_ligada_devendo := 'bloqueou: ' || left(SQLERRM,45); END;

  -- ── 3) mesma consulta, agora PAGA: tem de liberar ──
  UPDATE public.lancamentos SET valor_pago = 250, status='pago' WHERE agendamento_id = ag;
  BEGIN
    UPDATE public.agendamentos SET status='em_atendimento' WHERE id=ag;
    r_ligada_paga := 'ATENDEU (correto)';
  EXCEPTION WHEN OTHERS THEN r_ligada_paga := 'bloqueou (ERRADO): ' || left(SQLERRM,35); END;

  -- ── 4) RETORNO gratuito (sem cobrança nenhuma): tem de passar ──
  INSERT INTO public.agendamentos (paciente_id, medico_id, data, hora_inicio, tipo, status, clinica_id)
  VALUES (pac, med, CURRENT_DATE, '11:00', 'retorno', 'aguardando', cli) RETURNING id INTO ag;
  BEGIN
    UPDATE public.agendamentos SET status='em_atendimento' WHERE id=ag;
    r_retorno := 'ATENDEU (correto)';
  EXCEPTION WHEN OTHERS THEN r_retorno := 'bloqueou (ERRADO)'; END;

  -- ── 5) marcado como isento (convenio): devendo, mas passa ──
  INSERT INTO public.agendamentos (paciente_id, medico_id, data, hora_inicio, tipo, status, clinica_id, exige_pagamento_previo)
  VALUES (pac, med, CURRENT_DATE, '12:00', 'consulta', 'aguardando', cli, false) RETURNING id INTO ag;
  INSERT INTO public.lancamentos (tipo, categoria, descricao, valor, data, data_vencimento, status, agendamento_id, clinica_id)
  VALUES ('receita','consulta','C',250,CURRENT_DATE,CURRENT_DATE,'pendente', ag, cli);
  BEGIN
    UPDATE public.agendamentos SET status='em_atendimento' WHERE id=ag;
    r_isento := 'ATENDEU (correto)';
  EXCEPTION WHEN OTHERS THEN r_isento := 'bloqueou (ERRADO)'; END;

  -- ── 6) liberacao excepcional com justificativa ──
  INSERT INTO public.agendamentos (paciente_id, medico_id, data, hora_inicio, tipo, status, clinica_id)
  VALUES (pac, med, CURRENT_DATE, '13:00', 'consulta', 'aguardando', cli) RETURNING id INTO ag;
  INSERT INTO public.lancamentos (tipo, categoria, descricao, valor, data, data_vencimento, status, agendamento_id, clinica_id)
  VALUES ('receita','consulta','C',250,CURRENT_DATE,CURRENT_DATE,'pendente', ag, cli);
  UPDATE public.agendamentos
     SET liberado_sem_pagamento = true, motivo_liberacao = 'Emergencia clinica'
   WHERE id = ag;
  BEGIN
    UPDATE public.agendamentos SET status='em_atendimento' WHERE id=ag;
    r_liberado := 'ATENDEU (correto)';
  EXCEPTION WHEN OTHERS THEN r_liberado := 'bloqueou (ERRADO)'; END;

  CREATE TEMP TABLE res AS SELECT
    r_desligada AS "1_trava_desligada", r_ligada_devendo AS "2_ligada_devendo",
    r_ligada_paga AS "3_ligada_paga", r_retorno AS "4_retorno_gratuito",
    r_isento AS "5_isento_convenio", r_liberado AS "6_liberado_com_motivo";
END $$;
SELECT * FROM res;
ROLLBACK;
