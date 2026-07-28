-- ============================================================================
-- Baixa de estoque por prescrição passa a ser idempotente
--
-- O PROBLEMA
-- Ao salvar um prontuário, o sistema apaga e reinsere todas as prescrições e,
-- para cada uma, dá baixa no estoque. Só que o prontuário tem AUTOSAVE a cada
-- 60 segundos, e o autosave usa exatamente o mesmo caminho.
--
-- Resultado: enquanto o prontuário fica aberto, o estoque é debitado de novo a
-- cada minuto. Uma prescrição de 20 unidades com a tela aberta por meia hora
-- retira 600 unidades. O controle de estoque simplesmente não fecha com a
-- contagem física, e a causa é invisível para quem usa.
--
-- A SOLUÇÃO
-- Amarrar a movimentação ao prontuário que a originou e deixar o banco garantir
-- que existe no máximo uma baixa por (prontuário, item). O índice único é a
-- garantia real — o código sozinho não basta, porque duas abas abertas fariam
-- o mesmo estrago.
-- ============================================================================

BEGIN;

ALTER TABLE public.movimentacoes_estoque
  ADD COLUMN IF NOT EXISTS prontuario_id uuid REFERENCES public.prontuarios(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.movimentacoes_estoque.prontuario_id IS
  'Prontuário que originou a baixa. Chave de idempotência: impede que o autosave debite o mesmo item repetidamente.';

-- Uma única baixa por prontuário/item. Movimentações manuais (prontuario_id
-- nulo) seguem sem restrição.
CREATE UNIQUE INDEX IF NOT EXISTS uq_movimentacao_por_prontuario_item
  ON public.movimentacoes_estoque (prontuario_id, item_id)
  WHERE prontuario_id IS NOT NULL;

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
-- -- Itens com baixas repetidas suspeitas no mesmo dia e mesmo motivo
-- -- (provável rastro do autosave antes desta correção):
-- SELECT e.nome, m.motivo, date_trunc('day', m.created_at) AS dia,
--        count(*) AS baixas, sum(m.quantidade) AS total_debitado
--   FROM public.movimentacoes_estoque m
--   JOIN public.estoque e ON e.id = m.item_id
--  WHERE m.tipo = 'saida' AND m.motivo ILIKE 'Prescrição%'
--  GROUP BY 1, 2, 3
-- HAVING count(*) > 1
--  ORDER BY baixas DESC
--  LIMIT 50;
--
-- A correção não recompõe o saldo automaticamente: se a consulta acima trouxer
-- resultados, ajuste a quantidade dos itens afetados por inventário.
