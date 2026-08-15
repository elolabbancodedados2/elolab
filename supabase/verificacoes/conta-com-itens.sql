-- ============================================================================
-- Verificação do modelo de conta: itens, pagamento dividido e cobrança extra
--
-- Roda contra o banco REAL e termina em ROLLBACK — não deixa rastro. Serve para
-- conferir, depois de qualquer mudança no financeiro, que os quatro
-- comportamentos abaixo continuam de pé:
--
--   1. item define o valor da conta
--   2. pagamento parcial marca `parcial`, não `pago`
--   3. dois pagamentos de formas diferentes somam na mesma conta
--   4. procedimento lançado durante a consulta reabre saldo, sem esbarrar no
--      índice lancamentos_um_por_agendamento
--
-- Resultado esperado na última linha:
--   valor 350.00 · valor_pago 250.00 · status parcial
--
-- Uso: cole no SQL Editor do Supabase, ou
--   python scripts/aplicar-sql.py supabase/verificacoes/conta-com-itens.sql
-- ============================================================================

BEGIN;

-- Conta de teste: consulta de R$ 250
INSERT INTO public.lancamentos (id, tipo, categoria, descricao, valor, data, data_vencimento, status)
VALUES ('11111111-1111-1111-1111-111111111111', 'receita', 'consulta', 'TESTE', 0, CURRENT_DATE, CURRENT_DATE, 'pendente');

INSERT INTO public.lancamento_itens (lancamento_id, descricao, categoria, quantidade, valor_unitario, origem)
VALUES ('11111111-1111-1111-1111-111111111111', 'Consulta', 'consulta', 1, 250.00, 'checkin');

-- Pagamento DIVIDIDO: R$ 200 Pix + R$ 300 cartao (total 500 > 250 devido)
-- Primeiro so' o Pix parcial de R$ 100, para checar o estado 'parcial'
INSERT INTO public.pagamentos (lancamento_id, forma_pagamento, valor)
VALUES ('11111111-1111-1111-1111-111111111111', 'pix', 100.00);

SELECT 'apos pagamento parcial' AS momento, valor::text, valor_pago::text, status::text
  FROM public.lancamentos WHERE id='11111111-1111-1111-1111-111111111111';

-- Completa com cartao
INSERT INTO public.pagamentos (lancamento_id, forma_pagamento, valor)
VALUES ('11111111-1111-1111-1111-111111111111', 'credito', 150.00);

-- Procedimento extra DURANTE a consulta: o caso que o indice unico bloqueava
INSERT INTO public.lancamento_itens (lancamento_id, descricao, categoria, quantidade, valor_unitario, origem)
VALUES ('11111111-1111-1111-1111-111111111111', 'Sutura', 'procedimento', 1, 100.00, 'atendimento');

SELECT 'apos procedimento extra' AS momento, valor::text, valor_pago::text, status::text
  FROM public.lancamentos WHERE id='11111111-1111-1111-1111-111111111111';

ROLLBACK;
