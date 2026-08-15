-- ============================================================================
-- VERIFICAÇÃO — estorno de pagamento
--
-- O cenário: consulta R$ 250, recepção registra R$ 250 no cartão, percebe que
-- era Pix, estorna e registra de novo. A conta tem que voltar exatamente ao
-- que era antes do erro.
--
-- Termina em ROLLBACK.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE _res(n int, caso text, ok boolean, detalhe text);

-- A função exige perfil com acesso ao financeiro e confere a clínica, então o
-- teste roda como um admin de verdade, dentro da clínica DELE — rodar como
-- postgres não exercitaria nenhuma dessas duas barreiras.
CREATE TEMP TABLE _quem AS
SELECT p.id AS usuario, p.clinica_id AS clinica
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role::text = 'admin'
 WHERE p.clinica_id IS NOT NULL
 LIMIT 1;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT usuario::text FROM _quem), 'role', 'authenticated')::text, true);

DO $$
DECLARE
  v_clinica uuid; v_pac uuid; v_med uuid; v_ag uuid; v_conta uuid;
  v_pag1 uuid; v_pag2 uuid; v_r jsonb; v_status text; v_pago numeric; v_erro text;
BEGIN
  SELECT clinica INTO v_clinica FROM _quem;
  INSERT INTO public.pacientes (nome, clinica_id) VALUES ('__verif__', v_clinica) RETURNING id INTO v_pac;
  INSERT INTO public.medicos (nome, especialidade, crm, clinica_id)
    VALUES ('__verif__', 'Clínica Geral', 'CRM-EST', v_clinica) RETURNING id INTO v_med;
  INSERT INTO public.agendamentos (paciente_id, medico_id, data, hora_inicio, tipo, status, clinica_id)
    VALUES (v_pac, v_med, CURRENT_DATE, '10:00', 'consulta', 'confirmado', v_clinica) RETURNING id INTO v_ag;
  INSERT INTO public.lancamentos (tipo, categoria, descricao, valor, data, data_vencimento,
                                  status, paciente_id, agendamento_id, clinica_id)
    VALUES ('receita', 'consulta', 'Consulta', 250, CURRENT_DATE, CURRENT_DATE,
            'pendente', v_pac, v_ag, v_clinica) RETURNING id INTO v_conta;

  -- Pagou R$ 250 no cartão (errado).
  INSERT INTO public.pagamentos (lancamento_id, clinica_id, forma_pagamento, valor)
    VALUES (v_conta, v_clinica, 'credito', 250) RETURNING id INTO v_pag1;
  PERFORM public.recalcular_conta(v_conta);

  SELECT status::text, COALESCE(valor_pago,0) INTO v_status, v_pago
    FROM public.lancamentos WHERE id = v_conta;
  INSERT INTO _res VALUES (1, 'pagamento no cartão deixa a conta paga',
    v_status = 'pago' AND v_pago = 250, 'status='||v_status||' pago='||v_pago);

  -- ─── 2. Estorno sem motivo é recusado ───
  BEGIN
    PERFORM public.estornar_pagamento(v_pag1, '   ');
    INSERT INTO _res VALUES (2, 'estorno sem motivo', false, 'ACEITOU');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
    INSERT INTO _res VALUES (2, 'estorno sem motivo é recusado', true, v_erro);
  END;

  -- ─── 3. Estorno com motivo desfaz o pagamento ───
  v_r := public.estornar_pagamento(v_pag1, 'Era Pix, não cartão');
  SELECT status::text, COALESCE(valor_pago,0) INTO v_status, v_pago
    FROM public.lancamentos WHERE id = v_conta;
  INSERT INTO _res VALUES (3, 'conta volta a dever depois do estorno',
    (v_r->>'success')::boolean AND v_pago = 0 AND v_status <> 'pago',
    'status='||v_status||' pago='||v_pago);

  -- ─── 4. A linha errada NÃO some ───
  INSERT INTO _res VALUES (4, 'o pagamento errado continua registrado, com motivo',
    EXISTS (SELECT 1 FROM public.pagamentos
             WHERE id = v_pag1 AND estornado_em IS NOT NULL AND motivo_estorno = 'Era Pix, não cartão'),
    (SELECT coalesce(motivo_estorno,'SUMIU') FROM public.pagamentos WHERE id = v_pag1));

  -- ─── 5. Estornar duas vezes não tira o dinheiro duas vezes ───
  v_r := public.estornar_pagamento(v_pag1, 'de novo');
  SELECT COALESCE(valor_pago,0) INTO v_pago FROM public.lancamentos WHERE id = v_conta;
  INSERT INTO _res VALUES (5, 'estornar duas vezes é recusado',
    (v_r->>'success')::boolean IS NOT TRUE AND v_pago = 0,
    coalesce(v_r->>'error','ACEITOU')||' pago='||v_pago);

  -- ─── 6. Registra certo e a conta fecha igual ───
  INSERT INTO public.pagamentos (lancamento_id, clinica_id, forma_pagamento, valor)
    VALUES (v_conta, v_clinica, 'pix', 250) RETURNING id INTO v_pag2;
  PERFORM public.recalcular_conta(v_conta);
  SELECT status::text, COALESCE(valor_pago,0) INTO v_status, v_pago
    FROM public.lancamentos WHERE id = v_conta;
  INSERT INTO _res VALUES (6, 'refazendo no Pix a conta fecha igual',
    v_status = 'pago' AND v_pago = 250, 'status='||v_status||' pago='||v_pago);
END $$;

SELECT
  string_agg((CASE WHEN ok THEN 'OK   ' ELSE 'FALHOU ' END) || n || '. ' || caso || ' [' || left(detalhe,58) || ']',
             E'\n' ORDER BY n) AS resultado,
  count(*) FILTER (WHERE ok) || '/' || count(*) AS placar
FROM _res;

ROLLBACK;
