-- ============================================================================
-- ETAPA 4 de 9 — A trava: paciente com saldo devedor não entra em atendimento
--
-- Esta é a única etapa que MUDA COMPORTAMENTO. Por isso nasce DESLIGADA.
--
-- ─── DESLIGADA POR PADRÃO, LIGADA POR CLÍNICA ──────────────────────────────
--
-- São 16 clínicas em produção. Ligar uma trava rígida em todas de uma vez, sem
-- ninguém acompanhando, é o tipo de mudança que para uma recepção inteira numa
-- segunda de manhã. Cada clínica liga quando quiser, opera, e se algo der
-- errado desligar é um UPDATE — não um rollback de migration.
--
-- ─── A REGRA É "HÁ SALDO?", NÃO "QUE TIPO É?" ──────────────────────────────
--
-- Retorno é gratuito por convenção no Brasil, e está cadastrado com valor zero.
-- Como não gera cobrança, não tem saldo, e passa sem nenhuma exceção escrita
-- aqui. O mesmo vale para as coletas de laboratório. Isso mantém a regra com
-- uma condição só, em vez de uma lista de tipos que envelhece mal.
--
-- ─── CONVÊNIO ──────────────────────────────────────────────────────────────
--
-- O plano fatura no fim do mês; o paciente paga no máximo coparticipação.
-- Bloquear alguém porque o convênio ainda não pagou seria absurdo. Hoje nenhum
-- dos 81 pacientes tem convênio — as clínicas operam particular —, então esta
-- é uma decisão preventiva: quando houver convênio, marque o agendamento com
-- `exige_pagamento_previo = false`.
--
-- ─── POR QUE EXISTE ESCAPATÓRIA ────────────────────────────────────────────
--
-- Uma trava sem saída não é cumprida: é contornada. A recepcionista marca a
-- cobrança como paga sem ter recebido para conseguir atender a emergência, o
-- idoso cujo cartão não passou, o paciente antigo sem a carteira. Aí o dado
-- financeiro — justamente o que a regra queria proteger — vira ficção.
--
-- Então existe `liberado_sem_pagamento`, que exige justificativa e registra
-- quem liberou e quando. O paciente é atendido, e a clínica sabe exatamente
-- quantas vezes isso aconteceu e por quê.
-- ============================================================================

BEGIN;

-- ─── Interruptor por clínica ────────────────────────────────────────────────
ALTER TABLE public.clinicas
  ADD COLUMN IF NOT EXISTS exigir_pagamento_previo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clinicas.exigir_pagamento_previo IS
  'Liga a trava que impede atender paciente com saldo devedor. Nasce desligada: cada clínica ativa quando estiver pronta. Desligar em caso de problema é um UPDATE.';

-- ─── Liberação excepcional ──────────────────────────────────────────────────
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS liberado_sem_pagamento     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS liberado_sem_pagamento_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS liberado_sem_pagamento_em  timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_liberacao           text;

COMMENT ON COLUMN public.agendamentos.liberado_sem_pagamento IS
  'Atendimento liberado apesar do saldo devedor. Exige justificativa e registra autor e horário — a alternativa seria a recepção marcar cobrança como paga sem ter recebido, que destrói o dado financeiro.';

-- Justificativa não é opcional: sem ela a liberação não vira registro útil.
ALTER TABLE public.agendamentos
  DROP CONSTRAINT IF EXISTS agendamentos_liberacao_justificada;
ALTER TABLE public.agendamentos
  ADD CONSTRAINT agendamentos_liberacao_justificada
  CHECK (
    NOT liberado_sem_pagamento
    OR (motivo_liberacao IS NOT NULL AND length(btrim(motivo_liberacao)) >= 5)
  );

-- ─── Saldo devedor de um agendamento ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.saldo_devedor_do_agendamento(p_agendamento_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER            -- precisa enxergar a conta mesmo com RLS restritivo
SET search_path = public
AS $$
  SELECT COALESCE(sum(
    (l.valor - COALESCE(l.desconto, 0) + COALESCE(l.acrescimo, 0)) - COALESCE(l.valor_pago, 0)
  ), 0)
    FROM public.lancamentos l
   WHERE l.agendamento_id = p_agendamento_id
     AND l.tipo = 'receita'
     AND l.status NOT IN ('cancelado', 'estornado');
$$;

COMMENT ON FUNCTION public.saldo_devedor_do_agendamento(uuid) IS
  'Quanto falta receber por um atendimento. Zero quando não há cobrança — que é o caso de retorno e coleta, cadastrados como gratuitos.';

-- ─── A trava ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.exige_pagamento_antes_do_atendimento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ligado boolean;
  v_saldo  numeric;
BEGIN
  -- Só interessa a ENTRADA em atendimento. Sair dele, finalizar, cancelar e
  -- qualquer outra transição seguem livres.
  IF NEW.status::text <> 'em_atendimento' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status::text = 'em_atendimento' THEN
    RETURN NEW;
  END IF;

  IF NOT NEW.exige_pagamento_previo OR NEW.liberado_sem_pagamento THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(exigir_pagamento_previo, false) INTO v_ligado
    FROM public.clinicas WHERE id = NEW.clinica_id;

  IF NOT COALESCE(v_ligado, false) THEN
    RETURN NEW;  -- clínica ainda não ligou a trava
  END IF;

  v_saldo := public.saldo_devedor_do_agendamento(NEW.id);

  -- Tolerância de um centavo, igual ao resto do financeiro.
  IF v_saldo > 0.009 THEN
    RAISE EXCEPTION
      'Este paciente tem R$ % em aberto. Receba o pagamento no balcão, ou libere com justificativa.',
      to_char(v_saldo, 'FM999G999D00')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pagamento_antes_do_atendimento ON public.agendamentos;
CREATE TRIGGER pagamento_antes_do_atendimento
  BEFORE INSERT OR UPDATE OF status ON public.agendamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.exige_pagamento_antes_do_atendimento();

COMMIT;

-- ============================================================================
-- COMO LIGAR PARA UMA CLÍNICA
-- ============================================================================
-- UPDATE public.clinicas SET exigir_pagamento_previo = true WHERE id = '<uuid>';
--
-- COMO DESLIGAR, se atrapalhar a operação:
-- UPDATE public.clinicas SET exigir_pagamento_previo = false WHERE id = '<uuid>';
--
-- QUANTAS LIBERAÇÕES EXCEPCIONAIS ACONTECERAM:
-- SELECT c.nome, count(*) AS liberacoes
--   FROM public.agendamentos a JOIN public.clinicas c ON c.id = a.clinica_id
--  WHERE a.liberado_sem_pagamento
--  GROUP BY c.nome ORDER BY 2 DESC;
