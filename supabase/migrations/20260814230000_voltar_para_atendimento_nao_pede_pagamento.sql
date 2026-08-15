-- ============================================================================
-- ETAPA 8 (parte 2) — a trava guarda a ENTRADA, não a volta
--
-- Bug encontrado ao ligar a cobrança adicional: `autoFinalizarAtendimento`
-- compensa uma falha de faturamento devolvendo o agendamento para
-- `em_atendimento`. Com um procedimento lançado durante a consulta, o saldo
-- reabre — e a compensação passava pela trava e era REJEITADA.
--
-- Resultado: erro dentro do tratamento de erro, atendimento travado num estado
-- intermediário e ninguém conseguindo consertar pela tela.
--
-- A regra correta: a trava existe para o paciente não entrar no consultório
-- sem pagar. Quem JÁ foi atendido não pode ser "des-atendido" — voltar para
-- `em_atendimento` a partir de um estado pós-consulta é correção, e correção
-- não pode ser bloqueada por dívida.
-- ============================================================================

BEGIN;

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

  -- Já estava em atendimento, ou está VOLTANDO de um estado pós-consulta
  -- (correção de faturamento, reabertura de prontuário). O paciente já foi
  -- visto; cobrar de novo na porta só trava a correção.
  IF TG_OP = 'UPDATE' AND OLD.status::text IN (
    'em_atendimento', 'finalizado', 'atendimento_finalizado', 'aguardando_pagamento_adicional'
  ) THEN
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

COMMIT;
