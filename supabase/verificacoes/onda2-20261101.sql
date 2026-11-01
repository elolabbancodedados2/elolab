-- Testes funcionais da Onda 2. Rodar DEPOIS das migrations, na mesma transação, e terminar com ROLLBACK.
SELECT set_config('request.jwt.claims', '{"sub":"f87b44a1-6b7e-41b3-a968-1e76953d796b","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', 'f87b44a1-6b7e-41b3-a968-1e76953d796b', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

\echo == contexto
SELECT auth.uid() AS uid, public.get_my_clinica_id() AS clinica;

-- Caixa de hoje aberto para os testes que precisam dele.
INSERT INTO public.caixa_diario (clinica_id, data, aberto, valor_abertura)
SELECT '7115fc51-9338-4676-be18-523cec4f81a1', (now() AT TIME ZONE 'America/Sao_Paulo')::date, true, 0
WHERE NOT EXISTS (SELECT 1 FROM public.caixa_diario WHERE clinica_id = '7115fc51-9338-4676-be18-523cec4f81a1' AND data = (now() AT TIME ZONE 'America/Sao_Paulo')::date);

\echo == 1. lote TISS: totais seguem as guias em rascunho
DO $$
DECLARE v_lote uuid; v_q int; v_v numeric;
BEGIN
  INSERT INTO public.lotes_tiss (clinica_id, convenio_id, competencia, numero_lote, versao_tiss, quantidade_guias, valor_apresentado, status)
  VALUES ('7115fc51-9338-4676-be18-523cec4f81a1', '692956c3-9007-5d73-ba7f-9dc8cb28ecc1', '2026-10-01', 'TESTE-ONDA2', '04.01.00', 9, 999, 'rascunho')
  RETURNING id INTO v_lote;
  PERFORM public.adicionar_guia_lote_tiss(v_lote, 'G-1', '123', '3e07e4a6-93c2-56f1-8eb6-b1cb385b163b', NULL, '2026-10-10', '10101012', 'consulta', 1, 150.00);
  PERFORM public.adicionar_guia_lote_tiss(v_lote, 'G-2', '123', '3e07e4a6-93c2-56f1-8eb6-b1cb385b163b', NULL, '2026-10-11', '10101012', 'consulta', 1, 250.00);
  SELECT quantidade_guias, valor_apresentado INTO v_q, v_v FROM public.lotes_tiss WHERE id = v_lote;
  IF v_q <> 2 OR v_v <> 400 THEN RAISE EXCEPTION 'FALHA lote: % guias, %', v_q, v_v; END IF;
  PERFORM public.remover_guia_lote_tiss((SELECT id FROM public.lote_tiss_guias WHERE lote_id = v_lote AND numero_guia = 'G-1'));
  SELECT quantidade_guias, valor_apresentado INTO v_q, v_v FROM public.lotes_tiss WHERE id = v_lote;
  IF v_q <> 1 OR v_v <> 250 THEN RAISE EXCEPTION 'FALHA lote após remover: % guias, %', v_q, v_v; END IF;
  PERFORM public.adicionar_guia_lote_tiss(v_lote, 'G-3', '123', '3e07e4a6-93c2-56f1-8eb6-b1cb385b163b', NULL, '2026-10-12', '10101012', 'consulta', 1, 750.00);
  RAISE NOTICE 'OK lote: totais acompanham as guias (1000.00)';
  PERFORM set_config('teste.lote', v_lote::text, true);
END $$;

\echo == 2. glosa: pago + glosado <= apresentado; recurso aceito vira receita
DO $$
DECLARE v_lote uuid := current_setting('teste.lote')::uuid; v_glosa uuid; v_ok boolean := false; v_lanc int;
BEGIN
  UPDATE public.lotes_tiss SET status = 'enviado', enviado_em = now() WHERE id = v_lote;
  v_glosa := (public.registrar_glosa_convenio(v_lote, 'G01', 'Glosa de teste', 'G-3', 300, 'teste-onda2-glosa-1')->>'id')::uuid;
  BEGIN
    PERFORM public.registrar_retorno_lote_tiss(v_lote, 800, NULL, (now() AT TIME ZONE 'America/Sao_Paulo')::date, false);
  EXCEPTION WHEN others THEN v_ok := true; RAISE NOTICE 'OK retorno recusado: %', SQLERRM;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'FALHA: retorno 800 + glosa 300 > 1000 foi aceito'; END IF;
  PERFORM public.registrar_retorno_lote_tiss(v_lote, 700, NULL, (now() AT TIME ZONE 'America/Sao_Paulo')::date, false);
  v_ok := false;
  BEGIN
    PERFORM public.registrar_glosa_convenio(v_lote, 'G02', 'Outra glosa', NULL, 10, 'teste-onda2-glosa-2');
  EXCEPTION WHEN others THEN v_ok := true; RAISE NOTICE 'OK glosa extra recusada: %', SQLERRM;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'FALHA: glosa além do apresentado foi aceita'; END IF;
  UPDATE public.glosas_convenio SET status = 'recurso_enviado' WHERE id = v_glosa;
  PERFORM public.atualizar_glosa_convenio(v_glosa, 'aceita', NULL, 120);
  SELECT count(*) INTO v_lanc FROM public.lancamentos WHERE lote_tiss_id = v_lote AND tipo = 'receita' AND valor = 120 AND numero_documento = 'GLOSA:G01';
  IF v_lanc <> 1 THEN RAISE EXCEPTION 'FALHA: receita do recurso não criada (%)', v_lanc; END IF;
  RAISE NOTICE 'OK glosa: conciliação e receita do recurso';
END $$;

\echo == 3. estorno de venda PDV
DO $$
DECLARE v_lanc uuid; v_antes int; v_depois int; v_res jsonb; v_exames int;
BEGIN
  SELECT quantidade INTO v_antes FROM public.estoque WHERE id = 'eb13e94c-9d53-55ca-b5cd-f887ca9e4b70';
  SELECT lancamento_id INTO v_lanc FROM public.registrar_venda_pdv(
    'teste-onda2-venda-0001', '7115fc51-9338-4676-be18-523cec4f81a1', '3e07e4a6-93c2-56f1-8eb6-b1cb385b163b',
    (now() AT TIME ZONE 'America/Sao_Paulo')::date, 'Venda teste', 80, 80, 'pix',
    '[{"item_id":"eb13e94c-9d53-55ca-b5cd-f887ca9e4b70","quantidade":2}]'::jsonb,
    '[{"nome":"Hemograma teste","quantidade":1,"valor":"50"}]'::jsonb);
  SELECT quantidade INTO v_depois FROM public.estoque WHERE id = 'eb13e94c-9d53-55ca-b5cd-f887ca9e4b70';
  IF v_depois <> v_antes - 2 THEN RAISE EXCEPTION 'FALHA venda não baixou estoque'; END IF;
  v_res := public.estornar_venda_pdv(v_lanc, 'Venda lançada no paciente errado');
  RAISE NOTICE 'estorno: %', v_res;
  SELECT quantidade INTO v_depois FROM public.estoque WHERE id = 'eb13e94c-9d53-55ca-b5cd-f887ca9e4b70';
  IF v_depois <> v_antes THEN RAISE EXCEPTION 'FALHA estoque não voltou: % -> %', v_antes, v_depois; END IF;
  IF (v_res->>'exames_cancelados')::int <> 1 THEN RAISE EXCEPTION 'FALHA exame não cancelado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.lancamentos WHERE id = (v_res->>'estorno_lancamento_id')::uuid AND tipo = 'despesa' AND valor = 80) THEN
    RAISE EXCEPTION 'FALHA despesa de estorno ausente';
  END IF;
  IF NOT (public.estornar_venda_pdv(v_lanc, 'Segunda tentativa')->>'repetido')::boolean THEN RAISE EXCEPTION 'FALHA estorno repetido'; END IF;
  RAISE NOTICE 'OK estorno PDV';
END $$;

\echo == 4. correção de status: faltou -> agendado
DO $$
DECLARE v_ag uuid; v_upd timestamptz; v_res jsonb; v_ok boolean := false;
BEGIN
  INSERT INTO public.agendamentos (clinica_id, paciente_id, medico_id, data, hora_inicio, hora_fim, status, tipo)
  VALUES ('7115fc51-9338-4676-be18-523cec4f81a1', '29e4b602-a863-5e7b-b31d-2f5a03990e49', 'ad97591f-8afa-4436-a4c8-df57120f9c0d',
          '2030-01-07', '06:10', '06:20', 'agendado', 'consulta')
  RETURNING id INTO v_ag;
  UPDATE public.agendamentos SET status = 'faltou' WHERE id = v_ag RETURNING updated_at INTO v_upd;
  BEGIN
    UPDATE public.agendamentos SET status = 'agendado' WHERE id = v_ag;
  EXCEPTION WHEN others THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'FALHA: volta direta de faltou foi aceita'; END IF;
  v_res := public.corrigir_status_agendamento(v_ag, 'curto', v_upd);
EXCEPTION WHEN others THEN
  IF SQLERRM LIKE 'Descreva o motivo%' THEN
    RAISE NOTICE 'OK motivo curto recusado';
  ELSE
    RAISE;
  END IF;
END $$;

DO $$
DECLARE v_ag uuid; v_upd timestamptz; v_res jsonb;
BEGIN
  INSERT INTO public.agendamentos (clinica_id, paciente_id, medico_id, data, hora_inicio, hora_fim, status, tipo)
  VALUES ('7115fc51-9338-4676-be18-523cec4f81a1', '29e4b602-a863-5e7b-b31d-2f5a03990e49', 'ad97591f-8afa-4436-a4c8-df57120f9c0d',
          '2030-01-08', '06:10', '06:20', 'agendado', 'consulta')
  RETURNING id INTO v_ag;
  UPDATE public.agendamentos SET status = 'faltou' WHERE id = v_ag RETURNING updated_at INTO v_upd;
  v_res := public.corrigir_status_agendamento(v_ag, 'Paciente chegou atrasado, falta marcada por engano', v_upd);
  IF NOT (v_res->>'corrigido')::boolean OR (SELECT status::text FROM public.agendamentos WHERE id = v_ag) <> 'agendado' THEN
    RAISE EXCEPTION 'FALHA correção: %', v_res;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.agendamento_correcoes_status WHERE agendamento_id = v_ag AND status_anterior = 'faltou') THEN
    RAISE EXCEPTION 'FALHA trilha da correção';
  END IF;
  RAISE NOTICE 'OK correção de falta: %', v_res;
  PERFORM set_config('teste.ag', v_ag::text, true);
END $$;

\echo == 5. documento ligado a atendimento de outro paciente é recusado
DO $$
DECLARE v_ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.encaminhamentos (clinica_id, paciente_id, medico_origem_id, especialidade_destino, motivo, agendamento_id)
    VALUES ('7115fc51-9338-4676-be18-523cec4f81a1', '02c71485-aead-5f3a-8823-ef719fdf5b74', 'ad97591f-8afa-4436-a4c8-df57120f9c0d',
            'Cardiologia', 'Teste', current_setting('teste.ag')::uuid);
  EXCEPTION WHEN others THEN v_ok := SQLERRM LIKE 'O atendimento informado%'; RAISE NOTICE 'erro: %', SQLERRM;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'FALHA vínculo de outro paciente'; END IF;
  RAISE NOTICE 'OK vínculo validado';
END $$;

\echo == 6. fuso
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
             AND pg_get_functiondef(p.oid) ~* '(^|[^a-z0-9_])current_date([^a-z0-9_]|$)') THEN
    RAISE EXCEPTION 'FALHA ainda há current_date';
  END IF;
  RAISE NOTICE 'OK nenhuma função com current_date';
END $$;

\echo == 7. conta a pagar paga em data anterior
DO $$
DECLARE v_l uuid; v_res jsonb; v_ok boolean := false;
BEGIN
  INSERT INTO public.lancamentos (clinica_id, tipo, categoria, descricao, valor, data, data_vencimento, status)
  VALUES ('7115fc51-9338-4676-be18-523cec4f81a1', 'despesa', 'fornecedores', 'Teste retroativo', 100,
          (now() AT TIME ZONE 'America/Sao_Paulo')::date - 15, (now() AT TIME ZONE 'America/Sao_Paulo')::date - 12, 'pendente')
  RETURNING id INTO v_l;
  BEGIN
    PERFORM public.registrar_pagamento_despesa_em_data(v_l, 100, 'dinheiro', (now() AT TIME ZONE 'America/Sao_Paulo')::date - 10);
  EXCEPTION WHEN others THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'FALHA dinheiro retroativo aceito'; END IF;
  v_res := public.registrar_pagamento_despesa_em_data(v_l, 100, 'transferencia', (now() AT TIME ZONE 'America/Sao_Paulo')::date - 10, 'teste', 'teste-onda2-retro-1');
  IF v_res->>'status' <> 'pago' OR (v_res->>'data_pagamento')::date <> (now() AT TIME ZONE 'America/Sao_Paulo')::date - 10 THEN
    RAISE EXCEPTION 'FALHA retroativo: %', v_res;
  END IF;
  -- Pagamento normal do dia continua exigindo a data de hoje.
  v_ok := false;
  BEGIN
    INSERT INTO public.pagamentos (lancamento_id, clinica_id, forma_pagamento, valor, data_pagamento)
    VALUES (v_l, '7115fc51-9338-4676-be18-523cec4f81a1', 'pix', 1, now() - interval '5 days');
  EXCEPTION WHEN others THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'FALHA trava de data do pagamento comum sumiu'; END IF;
  RAISE NOTICE 'OK retroativo: %', v_res;
END $$;

\echo == todos os testes passaram
