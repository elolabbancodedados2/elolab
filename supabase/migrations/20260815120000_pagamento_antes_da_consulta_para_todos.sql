-- ============================================================================
-- Pagamento antes da consulta passa a ser o fluxo PADRÃO do produto
--
-- Até aqui `exigir_pagamento_previo` nascia `false` e eu ligaria clínica por
-- clínica. Estava errado como decisão de produto: vira um sistema com 16
-- comportamentos diferentes, definidos por uma chave que só quem tem acesso ao
-- banco consegue mexer. Ninguém na clínica descobre por que o vizinho tem uma
-- regra que ela não tem.
--
-- O fluxo é o fluxo: Agendamento → Chegada → Check-in → Conferência →
-- PAGAMENTO → Fila → Consulta. Vale para todos.
--
-- A chave continua existindo, mas muda de natureza: deixa de ser interruptor
-- do fornecedor e vira CONFIGURAÇÃO DA CLÍNICA, visível em Configurações.
-- Convênio que fatura no fim do mês desliga sozinho, sem me pedir nada.
--
-- ─── IMPACTO MEDIDO ANTES DE APLICAR ───────────────────────────────────────
--
--   17 agendamentos abertos de hoje em diante nas 16 clínicas
--    0 com saldo devedor
--   => nenhum paciente em curso é barrado por esta migration.
--
-- A triagem NÃO entra nessa: o enunciado diz "Triagem (SE HOUVER)". Continua
-- `false` por padrão, e a clínica que tem enfermagem liga na mesma tela.
-- ============================================================================

BEGIN;

ALTER TABLE public.clinicas
  ALTER COLUMN exigir_pagamento_previo SET DEFAULT true;

-- Clínicas que já existem. Nenhuma tinha ligado — não há escolha de ninguém
-- sendo sobrescrita aqui.
UPDATE public.clinicas
   SET exigir_pagamento_previo = true
 WHERE COALESCE(exigir_pagamento_previo, false) = false;

COMMENT ON COLUMN public.clinicas.exigir_pagamento_previo IS
  'Fluxo padrão do produto: o paciente paga antes de entrar no consultório. A clínica pode desligar em Configurações — convênio que fatura no fim do mês, por exemplo. O bloqueio real é do trigger pagamento_antes_do_atendimento, não da tela.';

COMMIT;
