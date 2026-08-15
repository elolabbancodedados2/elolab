-- ============================================================================
-- ETAPA 1 de 9 — Estados do fluxo "pagar antes da consulta"
--
-- Esta migration é PURAMENTE ADITIVA e não muda comportamento nenhum: cria os
-- estados e o campo que as etapas seguintes vão usar. Nada no app produz ou lê
-- esses valores ainda. Aplicar hoje e não fazer mais nada deixa o sistema
-- exatamente como está.
--
-- O objetivo é que a etapa 4 — a trava de verdade — seja uma mudança pequena e
-- isolada, em vez de um salto grande num banco com 16 clínicas em produção.
--
-- ─── O QUE JÁ EXISTIA ───────────────────────────────────────────────────────
--
--   status_agendamento: agendado, confirmado, aguardando, em_atendimento,
--                       finalizado, cancelado, faltou
--   status_pagamento:   pendente, pago, cancelado, estornado, atrasado
--
-- ─── DECISÕES DE NOMENCLATURA ───────────────────────────────────────────────
--
-- `aguardando` é MANTIDO com o significado que já tem no código: o paciente
-- está esperando o profissional. Criar um `aguardando_atendimento` novo
-- obrigaria a reescrever a fila, o painel de TV e os relatórios sem ganho.
--
-- "Check-in" não vira estado. É a transição que leva o paciente a
-- `aguardando_pagamento` (quando há saldo) ou direto a `aguardando_triagem` /
-- `aguardando` (quando não há). Um estado que dura milissegundos só polui a
-- máquina de estados — e o próprio fluxo pedido diz "se existir valor a pagar,
-- encaminhar automaticamente para AGUARDANDO PAGAMENTO".
-- ============================================================================

-- ─── Estados do agendamento ─────────────────────────────────────────────────
-- Em PostgreSQL, um valor de enum recém-criado não pode ser USADO na mesma
-- transação em que foi adicionado. Como esta migration apenas os cria, isso não
-- é problema — mas é a razão de os estados virem numa etapa separada do código
-- que vai produzi-los.
ALTER TYPE public.status_agendamento ADD VALUE IF NOT EXISTS 'aguardando_pagamento';
ALTER TYPE public.status_agendamento ADD VALUE IF NOT EXISTS 'pago';
ALTER TYPE public.status_agendamento ADD VALUE IF NOT EXISTS 'aguardando_triagem';
ALTER TYPE public.status_agendamento ADD VALUE IF NOT EXISTS 'em_triagem';
ALTER TYPE public.status_agendamento ADD VALUE IF NOT EXISTS 'atendimento_finalizado';
ALTER TYPE public.status_agendamento ADD VALUE IF NOT EXISTS 'aguardando_pagamento_adicional';

-- ─── Pagamento parcial ──────────────────────────────────────────────────────
-- Sem este valor, quem paga R$ 200 de R$ 500 fica como `pendente` e o sistema
-- perde a informação de que já entrou dinheiro. A etapa 2 passa a calcular este
-- estado a partir da soma dos pagamentos.
ALTER TYPE public.status_pagamento ADD VALUE IF NOT EXISTS 'parcial';

-- ─── Quem precisa pagar antes ───────────────────────────────────────────────
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS exige_pagamento_previo boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.agendamentos.exige_pagamento_previo IS
  'Se true, a etapa 4 impedirá o atendimento enquanto houver saldo devedor. Existe para que retorno, convênio faturado no fim do mês e cortesia não sejam bloqueados — casos em que a clínica legitimamente atende antes de receber. O padrão é true por segurança; a regra de negócio de quais atendimentos são isentos ainda não foi definida, e a trava da etapa 4 NÃO deve ser ligada antes disso.';

-- Índice para a tela "Aguardando pagamento" da etapa 5, que vai listar por
-- clínica e data quem tem cobrança pendente.
CREATE INDEX IF NOT EXISTS idx_agendamentos_clinica_data_status
  ON public.agendamentos (clinica_id, data, status);

-- ============================================================================
-- CONFERIR DEPOIS DE APLICAR
-- ============================================================================
-- Deve listar 13 estados de agendamento e 6 de pagamento:
--
-- SELECT t.typname, string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder)
--   FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
--  WHERE t.typname IN ('status_agendamento', 'status_pagamento')
--  GROUP BY t.typname;
--
-- E nenhum agendamento deve ter mudado de estado:
--
-- SELECT status, count(*) FROM public.agendamentos GROUP BY status ORDER BY 2 DESC;
