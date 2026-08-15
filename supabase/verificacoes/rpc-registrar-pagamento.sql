-- ============================================================================
-- Verificação da RPC registrar_pagamento
--
-- Roda contra o banco REAL e termina em ROLLBACK — não deixa rastro.
--
-- Confere os quatro comportamentos que a regra de negócio exige:
--   1. pagamento dividido em duas formas numa chamada só
--   2. mesma chave de idempotência não cobra de novo (clique duplo, refresh)
--   3. pagamento acima do saldo é recusado
--   4. desconto maior que a cobrança é recusado
--
-- Resultado esperado:
--   pago_1a 500.00 · status_1a pago · repetido_2a true · linhas_pagamento 2
--   erro_excesso e erro_desconto começando com "bloqueou:"
--
-- LIMITAÇÃO: roda com papel privilegiado, então NÃO exercita o RLS. A função é
-- SECURITY INVOKER, e o isolamento por clínica depende das políticas de
-- `lancamentos` e `pagamentos` — verificadas separadamente em
-- scripts/teste-isolamento-clinicas.py.
-- ============================================================================

BEGIN;
DO $$
DECLARE
  r1 jsonb; r2 jsonb; erro_excesso text; erro_desconto text; n_pag int; st_conta text;
BEGIN
  INSERT INTO public.lancamentos (id,tipo,categoria,descricao,valor,data,data_vencimento,status)
  VALUES ('22222222-2222-2222-2222-222222222222','receita','consulta','TESTE',0,CURRENT_DATE,CURRENT_DATE,'pendente');
  INSERT INTO public.lancamento_itens (lancamento_id,descricao,categoria,quantidade,valor_unitario,origem)
  VALUES ('22222222-2222-2222-2222-222222222222','Consulta','consulta',1,500.00,'checkin');

  r1 := public.registrar_pagamento('22222222-2222-2222-2222-222222222222',
        '[{"forma_pagamento":"pix","valor":200},{"forma_pagamento":"credito","valor":300,"parcelas":3}]'::jsonb,
        0,0,'chave-1');

  r2 := public.registrar_pagamento('22222222-2222-2222-2222-222222222222',
        '[{"forma_pagamento":"pix","valor":200}]'::jsonb, 0,0,'chave-1');

  BEGIN
    PERFORM public.registrar_pagamento('22222222-2222-2222-2222-222222222222',
      '[{"forma_pagamento":"dinheiro","valor":50}]'::jsonb, 0,0,'chave-2');
    erro_excesso := 'NAO BLOQUEOU';
  EXCEPTION WHEN OTHERS THEN erro_excesso := 'bloqueou: ' || left(SQLERRM, 40);
  END;

  BEGIN
    PERFORM public.registrar_pagamento('22222222-2222-2222-2222-222222222222',
      '[{"forma_pagamento":"dinheiro","valor":10}]'::jsonb, 9999,0,'chave-3');
    erro_desconto := 'NAO BLOQUEOU';
  EXCEPTION WHEN OTHERS THEN erro_desconto := 'bloqueou: ' || left(SQLERRM, 40);
  END;

  SELECT count(*) INTO n_pag FROM public.pagamentos WHERE lancamento_id='22222222-2222-2222-2222-222222222222';
  SELECT status::text INTO st_conta FROM public.lancamentos WHERE id='22222222-2222-2222-2222-222222222222';

  CREATE TEMP TABLE resultado_teste AS
  SELECT r1->>'valor_pago' AS pago_1a, r1->>'status' AS status_1a, r1->>'quitado' AS quitado_1a,
         r2->>'repetido' AS repetido_2a, r2->>'valor_pago' AS pago_2a,
         erro_excesso, erro_desconto, n_pag::text AS linhas_pagamento, st_conta AS status_final;
END $$;

SELECT * FROM resultado_teste;
ROLLBACK;
