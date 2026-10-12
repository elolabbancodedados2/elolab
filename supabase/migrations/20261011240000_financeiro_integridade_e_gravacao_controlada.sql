BEGIN;

-- Patient payments are append-only. Reversals must use estornar_pagamento,
-- which requires a reason and recalculates the receivable atomically.
REVOKE UPDATE, DELETE ON TABLE public.pagamentos FROM authenticated;
DROP POLICY IF EXISTS pagamentos_update ON public.pagamentos;

-- lancar_item_no_atendimento is SECURITY INVOKER and needs its existing
-- insert/update grants. The trigger below still enforces same-clinic links.

CREATE OR REPLACE FUNCTION public.validar_clinica_lancamento_filho()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica_lancamento uuid;
BEGIN
  SELECT l.clinica_id INTO v_clinica_lancamento
    FROM public.lancamentos l
   WHERE l.id = NEW.lancamento_id;

  IF NOT FOUND OR v_clinica_lancamento IS DISTINCT FROM NEW.clinica_id THEN
    RAISE EXCEPTION 'O lançamento informado não pertence à mesma clínica.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_clinica_lancamento_filho() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS pagamentos_validar_clinica_lancamento ON public.pagamentos;
CREATE TRIGGER pagamentos_validar_clinica_lancamento
  BEFORE INSERT OR UPDATE OF lancamento_id, clinica_id ON public.pagamentos
  FOR EACH ROW EXECUTE FUNCTION public.validar_clinica_lancamento_filho();

DROP TRIGGER IF EXISTS lancamento_itens_validar_clinica_lancamento ON public.lancamento_itens;
CREATE TRIGGER lancamento_itens_validar_clinica_lancamento
  BEFORE INSERT OR UPDATE OF lancamento_id, clinica_id ON public.lancamento_itens
  FOR EACH ROW EXECUTE FUNCTION public.validar_clinica_lancamento_filho();

-- Repasse generation and payment already use SECURITY DEFINER RPCs. Approval
-- also gets a controlled transition, so a direct UPDATE cannot mark a repasse
-- paid or skip its workflow.
REVOKE INSERT, UPDATE ON TABLE public.repasses_medicos FROM authenticated;
DROP POLICY IF EXISTS repasses_financeiro_insert ON public.repasses_medicos;
DROP POLICY IF EXISTS repasses_financeiro_update ON public.repasses_medicos;

CREATE OR REPLACE FUNCTION public.validar_origem_quitada_repasse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status_receita text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status
     OR NEW.status NOT IN ('aprovado', 'pago') THEN
    RETURN NEW;
  END IF;

  SELECT l.status INTO v_status_receita
    FROM public.lancamentos l
   WHERE l.id = NEW.lancamento_id
     AND l.clinica_id = NEW.clinica_id
   FOR UPDATE;

  IF NOT FOUND OR v_status_receita IS DISTINCT FROM 'pago' THEN
    RAISE EXCEPTION 'A receita de origem precisa estar quitada para aprovar ou pagar o repasse.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_origem_quitada_repasse() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS repasses_validar_origem_quitada ON public.repasses_medicos;
CREATE TRIGGER repasses_validar_origem_quitada
  BEFORE UPDATE OF status ON public.repasses_medicos
  FOR EACH ROW EXECUTE FUNCTION public.validar_origem_quitada_repasse();

CREATE OR REPLACE FUNCTION public.aprovar_repasse_medico(p_repasse_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica uuid := public.get_my_clinica_id();
  v_repasse public.repasses_medicos%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_financial(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso financeiro necessário' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_repasse
    FROM public.repasses_medicos
   WHERE id = p_repasse_id AND clinica_id = v_clinica
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Repasse não encontrado para esta clínica' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_repasse.status <> 'pendente' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este repasse já mudou de status.');
  END IF;

  UPDATE public.repasses_medicos
     SET status = 'aprovado', aprovado_em = now()
   WHERE id = v_repasse.id AND clinica_id = v_clinica;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.aprovar_repasse_medico(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aprovar_repasse_medico(uuid) TO authenticated;

COMMENT ON FUNCTION public.aprovar_repasse_medico(uuid) IS
  'Aprova um repasse pendente com escopo de clínica e transição serializada.';

COMMIT;
