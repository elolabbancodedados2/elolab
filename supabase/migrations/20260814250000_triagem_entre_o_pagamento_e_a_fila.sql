-- ============================================================================
-- ETAPA 7 de 9 — Triagem entre o pagamento e a fila do profissional
--
-- O fluxo pedido: Pago → Triagem (SE HOUVER) → Fila do profissional.
--
-- ─── A DECISÃO ─────────────────────────────────────────────────────────────
--
-- Triagem é OPCIONAL POR CLÍNICA, DESLIGADA por padrão.
--
-- Consultório de um clínico só não tem enfermagem. Se a triagem fosse
-- obrigatória para todos, o paciente pagaria e ficaria parado num passo que
-- ninguém na clínica pode executar — a fila congelaria no primeiro dia.
-- Pediatria e pronto-atendimento, que triam de verdade, ligam a chave.
--
-- Mesma forma da trava de pagamento: enquanto ninguém liga, nada muda.
--
-- ─── AS TRÊS PORTAS ────────────────────────────────────────────────────────
--
-- 1. `clinicas.exigir_triagem`      — a clínica usa triagem?
-- 2. `agendamentos.exige_triagem`   — este atendimento precisa? (retorno de
--                                     resultado de exame, por exemplo, não)
-- 3. `agendamentos.liberado_sem_triagem` — a enfermeira faltou e o médico
--                                     decidiu atender assim mesmo. Fica
--                                     registrado com quem e quando.
-- ============================================================================

BEGIN;

ALTER TABLE public.clinicas
  ADD COLUMN IF NOT EXISTS exigir_triagem boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clinicas.exigir_triagem IS
  'Quando true, o paciente passa por triagem entre o pagamento e a fila do profissional. Desligado por padrão: clínica sem enfermagem não conseguiria completar o passo.';

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS exige_triagem boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS liberado_sem_triagem boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS liberado_sem_triagem_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS liberado_sem_triagem_em timestamptz,
  ADD COLUMN IF NOT EXISTS liberado_sem_triagem_motivo text;

COMMENT ON COLUMN public.agendamentos.exige_triagem IS
  'Este atendimento em particular passa por triagem. Só tem efeito onde clinicas.exigir_triagem está ligado.';
COMMENT ON COLUMN public.agendamentos.liberado_sem_triagem IS
  'Atendimento liberado sem triagem por decisão registrada — quem liberou, quando e por quê ficam nas colunas ao lado.';

-- ─── Carimbo de quem liberou ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.carimba_liberacao_sem_triagem()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- COALESCE porque em INSERT não existe OLD.
  IF NEW.liberado_sem_triagem AND NOT COALESCE(OLD.liberado_sem_triagem, false) THEN
    NEW.liberado_sem_triagem_por := auth.uid();
    NEW.liberado_sem_triagem_em  := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS carimba_liberacao_triagem ON public.agendamentos;
CREATE TRIGGER carimba_liberacao_triagem
  BEFORE INSERT OR UPDATE OF liberado_sem_triagem ON public.agendamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.carimba_liberacao_sem_triagem();

-- ─── Existe triagem para este atendimento? ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.tem_triagem(p_agendamento_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.triagens WHERE agendamento_id = p_agendamento_id
  );
$$;

COMMENT ON FUNCTION public.tem_triagem(uuid) IS
  'Se já foi registrada triagem para o atendimento. SECURITY DEFINER porque a recepção não lê triagens, mas o gatilho precisa saber.';

-- ─── A trava ────────────────────────────────────────────────────────────────
--
-- Mesma forma da trava de pagamento, e pelo mesmo motivo: bloquear só na tela
-- é convite para o primeiro atalho furar a regra.
CREATE OR REPLACE FUNCTION public.exige_triagem_antes_do_atendimento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ligado boolean;
BEGIN
  IF NEW.status::text <> 'em_atendimento' THEN
    RETURN NEW;
  END IF;

  -- Já estava em atendimento, ou está voltando de um estado pós-consulta:
  -- correção não pode ser bloqueada.
  IF TG_OP = 'UPDATE' AND OLD.status::text IN (
    'em_atendimento', 'finalizado', 'atendimento_finalizado', 'aguardando_pagamento_adicional'
  ) THEN
    RETURN NEW;
  END IF;

  IF NOT NEW.exige_triagem OR NEW.liberado_sem_triagem THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(exigir_triagem, false) INTO v_ligado
    FROM public.clinicas WHERE id = NEW.clinica_id;

  IF NOT COALESCE(v_ligado, false) THEN
    RETURN NEW;  -- clínica não usa triagem
  END IF;

  IF NOT public.tem_triagem(NEW.id) THEN
    RAISE EXCEPTION
      'Este paciente ainda não passou pela triagem. Registre os sinais vitais, ou libere com justificativa.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS triagem_antes_do_atendimento ON public.agendamentos;
CREATE TRIGGER triagem_antes_do_atendimento
  BEFORE INSERT OR UPDATE OF status ON public.agendamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.exige_triagem_antes_do_atendimento();

COMMIT;

-- ============================================================================
-- COMO LIGAR PARA UMA CLÍNICA
--
--   UPDATE public.clinicas SET exigir_triagem = true WHERE id = '<uuid>';
--
-- Para desligar num atendimento específico (retorno só para ver exame):
--
--   UPDATE public.agendamentos SET exige_triagem = false WHERE id = '<uuid>';
-- ============================================================================
