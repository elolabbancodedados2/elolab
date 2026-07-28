-- ============================================================================
-- Registra o valor efetivamente recebido/pago em cada lançamento
--
-- O PROBLEMA
-- A tela de baixa em Contas a Receber calcula e mostra o valor final
-- (valor - desconto + acréscimo), mas grava apenas `status = 'pago'`. O
-- desconto vira TEXTO LIVRE no campo observações e a coluna `valor` continua
-- com o valor original.
--
-- Consequência: uma conta de R$ 200 recebida com R$ 20 de desconto continua
-- contabilizada como R$ 200. DRE, fluxo de caixa e relatórios superestimam a
-- receita exatamente pela soma dos descontos concedidos — e o valor real só
-- existe como frase em observações, de onde não dá para somar.
-- A data de recebimento informada na tela também não era gravada em lugar
-- nenhum.
--
-- A SOLUÇÃO
-- `valor` continua sendo o valor COBRADO (não muda, preserva o histórico) e
-- passam a existir colunas para o que de fato entrou no caixa.
--
-- Compatibilidade: as colunas nascem NULL. Os relatórios usam
-- COALESCE(valor_pago, valor), então todo lançamento antigo continua somando
-- exatamente como soma hoje. Nenhum número histórico muda.
-- ============================================================================

BEGIN;

ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS valor_pago      numeric(10,2),
  ADD COLUMN IF NOT EXISTS desconto        numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS acrescimo       numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS data_pagamento  date;

COMMENT ON COLUMN public.lancamentos.valor         IS 'Valor cobrado/originalmente lançado.';
COMMENT ON COLUMN public.lancamentos.valor_pago    IS 'Valor efetivamente recebido ou pago. NULL enquanto não quitado.';
COMMENT ON COLUMN public.lancamentos.desconto      IS 'Desconto concedido na baixa.';
COMMENT ON COLUMN public.lancamentos.acrescimo     IS 'Juros/multa cobrados na baixa.';
COMMENT ON COLUMN public.lancamentos.data_pagamento IS 'Data em que a baixa foi efetivada.';

-- Consistência: valor_pago tem de bater com o cálculo da baixa.
ALTER TABLE public.lancamentos
  DROP CONSTRAINT IF EXISTS lancamentos_valor_pago_coerente;
ALTER TABLE public.lancamentos
  ADD CONSTRAINT lancamentos_valor_pago_coerente
  CHECK (
    valor_pago IS NULL
    OR abs(valor_pago - (valor - desconto + acrescimo)) < 0.01
  );

CREATE INDEX IF NOT EXISTS idx_lancamentos_data_pagamento
  ON public.lancamentos(data_pagamento)
  WHERE data_pagamento IS NOT NULL;

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
-- -- Quanto de desconto ficou preso em observações antes desta migration
-- -- (não dá para recuperar automaticamente, mas mostra o tamanho do problema):
-- SELECT count(*) AS baixas_com_desconto_em_texto
--   FROM public.lancamentos
--  WHERE status = 'pago' AND observacoes ILIKE '%Desconto: R$%';
--
-- -- Diferença entre cobrado e recebido, daqui para frente:
-- SELECT date_trunc('month', COALESCE(data_pagamento, data)) AS mes,
--        sum(valor)                        AS cobrado,
--        sum(COALESCE(valor_pago, valor))  AS recebido,
--        sum(desconto)                     AS descontos
--   FROM public.lancamentos
--  WHERE tipo = 'receita' AND status = 'pago'
--  GROUP BY 1 ORDER BY 1 DESC;
