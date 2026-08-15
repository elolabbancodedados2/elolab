-- ============================================================================
-- ETAPA 2 de 9 — A cobrança vira uma CONTA com itens e pagamentos
--
-- POR QUE ESTE MODELO
--
-- A migration 20260812130000 criou um índice único que garante UM lançamento
-- por agendamento — necessário para dois atendentes em check-in simultâneo não
-- cobrarem duas vezes. Só que a regra de negócio também exige cobrança
-- ADICIONAL depois da consulta (paciente pagou R$ 250, fez um procedimento de
-- R$ 100 durante o atendimento). Um segundo lançamento seria recusado com
-- 23505.
--
-- A saída não é remover o índice: é mudar o que ele significa. `lancamentos`
-- passa a ser a CONTA do atendimento — uma por agendamento, que é o certo — e
-- o que antes seriam cobranças separadas vira ITEM dessa conta. O procedimento
-- extra é um item novo, não uma cobrança nova.
--
-- Pagamento também sai de coluna para tabela: `lancamentos.forma_pagamento` é
-- uma coluna só, e não há como registrar R$ 200 em Pix mais R$ 300 no cartão
-- dentro da mesma cobrança.
--
-- ─── POR QUE TABELA NOVA, E NÃO REAPROVEITAR pagamentos_mercadopago ─────────
--
-- Aquela tabela está vazia (0 linhas) e tem quase o schema certo, o que faz
-- parecer candidata a ser renomeada. Mas ela é referenciada por SETE arquivos,
-- incluindo as edge functions mercadopago-checkout, mercadopago-webhook e
-- patient-portal. Renomear quebraria o checkout online para economizar uma
-- tabela. Ela continua sendo a tabela do fluxo MercadoPago; `pagamentos` é a do
-- balcão (dinheiro, Pix, cartão na maquininha).
--
-- ─── ESTA MIGRATION NÃO MUDA COMPORTAMENTO ──────────────────────────────────
--
-- Os gatilhos abaixo só recalculam quando EXISTEM itens/pagamentos. Enquanto o
-- app não criar nenhum — o que só acontece na etapa 5 — `lancamentos.valor` e
-- `valor_pago` continuam sendo escritos direto pelo código atual, sem
-- interferência. É o que permite aplicar isto hoje, em produção, sem risco.
-- ============================================================================

BEGIN;

-- ─── Itens da conta ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lancamento_itens (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lancamento_id  uuid NOT NULL REFERENCES public.lancamentos(id) ON DELETE CASCADE,
  clinica_id     uuid REFERENCES public.clinicas(id) ON DELETE CASCADE,

  descricao      text NOT NULL,
  categoria      text NOT NULL DEFAULT 'consulta'
                 CHECK (categoria IN ('consulta', 'retorno', 'procedimento', 'exame', 'produto', 'taxa', 'outros')),

  quantidade     numeric(10,2) NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  valor_unitario numeric(12,2) NOT NULL CHECK (valor_unitario >= 0),
  -- Coluna gerada: o total do item nunca diverge de quantidade × unitário.
  valor_total    numeric(12,2) GENERATED ALWAYS AS (quantidade * valor_unitario) STORED,

  -- De onde veio o item. `atendimento` é o procedimento lançado durante a
  -- consulta, que é justamente o caso que o índice único bloqueava.
  origem         text NOT NULL DEFAULT 'checkin'
                 CHECK (origem IN ('checkin', 'atendimento', 'balcao', 'ajuste')),
  prontuario_id  uuid REFERENCES public.prontuarios(id) ON DELETE SET NULL,

  criado_por     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lancamento_itens_lancamento ON public.lancamento_itens (lancamento_id);
CREATE INDEX IF NOT EXISTS idx_lancamento_itens_clinica    ON public.lancamento_itens (clinica_id);

COMMENT ON TABLE public.lancamento_itens IS
  'Itens da conta do atendimento. Existe para que o procedimento feito durante a consulta seja um item novo, e não uma segunda cobrança — que o índice lancamentos_um_por_agendamento recusaria.';

-- ─── Pagamentos do balcão ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pagamentos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lancamento_id   uuid NOT NULL REFERENCES public.lancamentos(id) ON DELETE CASCADE,
  clinica_id      uuid REFERENCES public.clinicas(id) ON DELETE CASCADE,

  forma_pagamento text NOT NULL
                  CHECK (forma_pagamento IN ('dinheiro','pix','credito','debito','transferencia','boleto','cheque','convenio','credito_paciente')),
  valor           numeric(12,2) NOT NULL CHECK (valor > 0),
  parcelas        integer NOT NULL DEFAULT 1 CHECK (parcelas >= 1),

  data_pagamento  timestamptz NOT NULL DEFAULT now(),
  recebido_por    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  observacoes     text,

  -- Estorno preserva histórico em vez de apagar a linha: "cancelamento mantém
  -- histórico, estorno fica registrado".
  estornado_em    timestamptz,
  estornado_por   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  motivo_estorno  text,

  -- Idempotência: dois cliques ou um refresh não podem virar dois pagamentos.
  -- A tela manda uma chave por tentativa; a segunda gravação com a mesma chave
  -- é recusada pelo índice único abaixo.
  chave_idempotencia text,

  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pagamentos_lancamento ON public.pagamentos (lancamento_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_clinica    ON public.pagamentos (clinica_id);

CREATE UNIQUE INDEX IF NOT EXISTS pagamentos_chave_idempotencia
  ON public.pagamentos (chave_idempotencia)
  WHERE chave_idempotencia IS NOT NULL;

COMMENT ON TABLE public.pagamentos IS
  'Pagamentos recebidos no balcão. Uma conta pode ter vários — é o que permite R$ 200 em Pix mais R$ 300 no cartão na mesma cobrança. pagamentos_mercadopago continua sendo a tabela do checkout online.';

-- ─── Recálculo da conta ─────────────────────────────────────────────────────
--
-- Deliberadamente CONSERVADOR: só age quando há linha filha. Sem itens, o
-- `valor` continua sendo o que o código atual gravou; sem pagamentos, idem para
-- `valor_pago` e `status`. É isso que permite aplicar hoje sem mudar nada.
CREATE OR REPLACE FUNCTION public.recalcular_conta(p_lancamento_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tem_itens      boolean;
  v_total_itens    numeric(12,2);
  v_tem_pagamentos boolean;
  v_total_pago     numeric(12,2);
  v_valor          numeric(12,2);
  v_desconto       numeric(12,2);
  v_acrescimo      numeric(12,2);
  v_devido         numeric(12,2);
BEGIN
  SELECT count(*) > 0, COALESCE(sum(valor_total), 0)
    INTO v_tem_itens, v_total_itens
    FROM public.lancamento_itens WHERE lancamento_id = p_lancamento_id;

  SELECT count(*) > 0, COALESCE(sum(valor), 0)
    INTO v_tem_pagamentos, v_total_pago
    FROM public.pagamentos
   WHERE lancamento_id = p_lancamento_id AND estornado_em IS NULL;

  IF NOT v_tem_itens AND NOT v_tem_pagamentos THEN
    RETURN; -- conta ainda no modelo antigo: não tocar
  END IF;

  IF v_tem_itens THEN
    UPDATE public.lancamentos SET valor = v_total_itens WHERE id = p_lancamento_id;
  END IF;

  SELECT valor, COALESCE(desconto, 0), COALESCE(acrescimo, 0)
    INTO v_valor, v_desconto, v_acrescimo
    FROM public.lancamentos WHERE id = p_lancamento_id;

  v_devido := v_valor - v_desconto + v_acrescimo;

  IF v_tem_pagamentos THEN
    UPDATE public.lancamentos
       SET valor_pago = v_total_pago,
           data_pagamento = CASE WHEN v_total_pago > 0 THEN COALESCE(data_pagamento, CURRENT_DATE) END,
           status = CASE
             -- Comparação em centavos: numeric é exato, mas o app manda float.
             WHEN round(v_total_pago * 100) >= round(v_devido * 100) THEN 'pago'::status_pagamento
             WHEN v_total_pago > 0                                   THEN 'parcial'::status_pagamento
             ELSE status
           END
     WHERE id = p_lancamento_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.recalcular_conta(uuid) IS
  'Recalcula valor, valor_pago e status de uma conta a partir de itens e pagamentos. Só age quando há linha filha, para não interferir nas contas do modelo antigo.';

CREATE OR REPLACE FUNCTION public.recalcular_conta_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalcular_conta(COALESCE(NEW.lancamento_id, OLD.lancamento_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS itens_recalculam_conta ON public.lancamento_itens;
CREATE TRIGGER itens_recalculam_conta
  AFTER INSERT OR UPDATE OR DELETE ON public.lancamento_itens
  FOR EACH ROW EXECUTE FUNCTION public.recalcular_conta_trigger();

DROP TRIGGER IF EXISTS pagamentos_recalculam_conta ON public.pagamentos;
CREATE TRIGGER pagamentos_recalculam_conta
  AFTER INSERT OR UPDATE OR DELETE ON public.pagamentos
  FOR EACH ROW EXECUTE FUNCTION public.recalcular_conta_trigger();

-- ─── RLS, no mesmo padrão de `lancamentos` ──────────────────────────────────
ALTER TABLE public.lancamento_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamentos       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lancamento_itens_select ON public.lancamento_itens;
CREATE POLICY lancamento_itens_select ON public.lancamento_itens FOR SELECT
  USING ((can_access_financial(auth.uid()) OR is_recepcao(auth.uid())) AND clinica_id = get_my_clinica_id());

DROP POLICY IF EXISTS lancamento_itens_insert ON public.lancamento_itens;
CREATE POLICY lancamento_itens_insert ON public.lancamento_itens FOR INSERT
  WITH CHECK ((can_access_financial(auth.uid()) OR is_recepcao(auth.uid())) AND clinica_id = get_my_clinica_id());

DROP POLICY IF EXISTS lancamento_itens_update ON public.lancamento_itens;
CREATE POLICY lancamento_itens_update ON public.lancamento_itens FOR UPDATE
  USING ((can_access_financial(auth.uid()) OR is_recepcao(auth.uid())) AND clinica_id = get_my_clinica_id());

DROP POLICY IF EXISTS lancamento_itens_delete ON public.lancamento_itens;
CREATE POLICY lancamento_itens_delete ON public.lancamento_itens FOR DELETE
  USING (can_access_financial(auth.uid()) AND is_same_clinica(clinica_id));

DROP POLICY IF EXISTS pagamentos_select ON public.pagamentos;
CREATE POLICY pagamentos_select ON public.pagamentos FOR SELECT
  USING ((can_access_financial(auth.uid()) OR is_recepcao(auth.uid())) AND clinica_id = get_my_clinica_id());

DROP POLICY IF EXISTS pagamentos_insert ON public.pagamentos;
CREATE POLICY pagamentos_insert ON public.pagamentos FOR INSERT
  WITH CHECK ((can_access_financial(auth.uid()) OR is_recepcao(auth.uid())) AND clinica_id = get_my_clinica_id());

-- Pagamento não se edita nem se apaga: estorna-se, preenchendo `estornado_em`.
-- Por isso o UPDATE existe e o DELETE não.
DROP POLICY IF EXISTS pagamentos_update ON public.pagamentos;
CREATE POLICY pagamentos_update ON public.pagamentos FOR UPDATE
  USING (can_access_financial(auth.uid()) AND clinica_id = get_my_clinica_id());

COMMIT;

-- ============================================================================
-- CONFERIR DEPOIS DE APLICAR
-- ============================================================================
-- Nada pode ter mudado nas contas existentes (não há itens nem pagamentos):
--
-- SELECT status, count(*), sum(valor) FROM public.lancamentos GROUP BY status;
--
-- E as tabelas devem existir vazias:
--
-- SELECT (SELECT count(*) FROM public.lancamento_itens) AS itens,
--        (SELECT count(*) FROM public.pagamentos)       AS pagamentos;
