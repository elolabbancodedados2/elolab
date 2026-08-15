-- ============================================================================
-- ETAPA 2b — A constraint de coerência precisa aceitar pagamento parcial
--
-- A migration 20260728010000 criou:
--
--   CHECK (valor_pago IS NULL
--          OR abs(valor_pago - (valor - desconto + acrescimo)) < 0.01)
--
-- Ou seja: `valor_pago` tem de ser NULL ou EXATAMENTE o total devido. Fazia
-- sentido no modelo em que só existiam "não pago" e "pago", e serviu para
-- impedir `valor_pago` incoerente com a baixa — um problema real na época.
--
-- Mas a etapa 1 introduziu `parcial` em `status_pagamento`, e a etapa 2 fez a
-- conta somar vários pagamentos. Quem paga R$ 100 de R$ 250 grava
-- `valor_pago = 100`, e essa constraint recusa com 23514. Descoberto ao testar
-- o modelo novo, antes de qualquer código usá-lo.
--
-- A regra de coerência CONTINUA — só deixa de exigir quitação integral:
--   * `valor_pago` nunca é negativo;
--   * `valor_pago` nunca passa do total devido, porque excedente é crédito do
--     paciente e ainda não existe onde guardá-lo. Enquanto não existir, receber
--     a mais tem de falhar em vez de sumir do relatório.
--
-- Quitação integral deixa de ser garantida pela constraint e passa a ser o
-- gatilho `recalcular_conta`, que só marca `pago` quando a soma dos pagamentos
-- alcança o devido.
-- ============================================================================

BEGIN;

ALTER TABLE public.lancamentos
  DROP CONSTRAINT IF EXISTS lancamentos_valor_pago_coerente;

ALTER TABLE public.lancamentos
  ADD CONSTRAINT lancamentos_valor_pago_coerente
  CHECK (
    valor_pago IS NULL
    OR (
      valor_pago >= 0
      -- Tolerância de um centavo para o arredondamento da baixa, igual à
      -- constraint anterior.
      AND valor_pago <= (valor - desconto + acrescimo) + 0.01
    )
  );

COMMENT ON CONSTRAINT lancamentos_valor_pago_coerente ON public.lancamentos IS
  'valor_pago vai de zero até o total devido. Aceita pagamento parcial; recusa valor negativo e recebimento acima do devido, que viraria crédito do paciente — conceito que ainda não existe. Quitação integral é responsabilidade do gatilho recalcular_conta.';

COMMIT;
