BEGIN;

-- Status, baixa e data de pagamento so podem mudar pelos fluxos controlados.
REVOKE UPDATE ON TABLE public.lancamentos FROM authenticated;
GRANT UPDATE (descricao, valor, forma_pagamento, desconto, acrescimo, observacoes)
  ON TABLE public.lancamentos TO authenticated;

CREATE OR REPLACE FUNCTION public.cancelar_lancamento_pendente(p_lancamento_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinica_id uuid := public.get_my_clinica_id();
BEGIN
  IF auth.uid() IS NULL OR NOT (public.can_access_financial(auth.uid()) OR public.is_recepcao(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissao para cancelar esta cobranca.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_clinica_id IS NULL THEN
    RAISE EXCEPTION 'Clinica nao identificada.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.lancamentos l
     SET status = 'cancelado'
   WHERE l.id = p_lancamento_id
     AND l.clinica_id = v_clinica_id
     AND l.status IN ('pendente', 'atrasado')
     AND COALESCE(l.valor_pago, 0) = 0
     AND NOT EXISTS (
       SELECT 1 FROM public.pagamentos p
        WHERE p.lancamento_id = l.id AND p.estornado_em IS NULL
     );

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.cancelar_lancamento_pendente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_lancamento_pendente(uuid) TO authenticated;

-- Preserva a baixa atomica da cobranca quando o atendimento e desfeito por
-- falta, sem depender de UPDATE direto concedido ao papel autenticado.
CREATE OR REPLACE FUNCTION public.marcar_atendimento_nao_realizado(
  p_agendamento_id uuid,
  p_clinica_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agendamento public.agendamentos%rowtype;
  v_fila public.fila_atendimento%rowtype;
  v_lancamento public.lancamentos%rowtype;
  v_tem_lancamento boolean := false;
  v_pagamento_registrado boolean := false;
BEGIN
  IF auth.uid() IS NULL OR p_clinica_id IS DISTINCT FROM public.get_my_clinica_id()
     OR NOT (public.is_recepcao(auth.uid()) OR public.can_access_clinical(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissao para desfazer este atendimento.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_agendamento FROM public.agendamentos
   WHERE id = p_agendamento_id AND clinica_id = p_clinica_id FOR UPDATE;
  IF NOT FOUND OR v_agendamento.status::text IS DISTINCT FROM 'em_atendimento' THEN
    RETURN jsonb_build_object('desfeito', false, 'motivo', 'status_alterado');
  END IF;

  SELECT * INTO v_fila FROM public.fila_atendimento
   WHERE agendamento_id = p_agendamento_id AND clinica_id = p_clinica_id AND status <> 'finalizado'
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  SELECT * INTO v_lancamento FROM public.lancamentos
   WHERE agendamento_id = p_agendamento_id AND clinica_id = p_clinica_id LIMIT 1 FOR UPDATE;
  v_tem_lancamento := FOUND;

  IF v_tem_lancamento THEN
    SELECT EXISTS (SELECT 1 FROM public.pagamentos
      WHERE lancamento_id = v_lancamento.id AND estornado_em IS NULL) INTO v_pagamento_registrado;
    IF v_pagamento_registrado OR COALESCE(v_lancamento.valor_pago, 0) > 0
       OR v_lancamento.status::text IN ('pago', 'parcial') THEN
      RETURN jsonb_build_object('desfeito', false, 'motivo', 'pagamento_registrado');
    END IF;
    IF v_lancamento.status::text NOT IN ('cancelado', 'estornado') THEN
      UPDATE public.lancamentos SET status = 'cancelado' WHERE id = v_lancamento.id;
    END IF;
  END IF;

  IF v_fila.id IS NOT NULL THEN DELETE FROM public.fila_atendimento WHERE id = v_fila.id; END IF;
  UPDATE public.agendamentos SET status = 'cancelado' WHERE id = v_agendamento.id;
  RETURN jsonb_build_object(
    'desfeito', true,
    'cobranca_cancelada', v_tem_lancamento AND v_lancamento.status::text NOT IN ('cancelado', 'estornado'),
    'havia_cobranca', v_tem_lancamento
  );
END;
$$;
REVOKE ALL ON FUNCTION public.marcar_atendimento_nao_realizado(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_atendimento_nao_realizado(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.validar_limites_ajuste_lancamento()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.desconto, 0) < 0 OR COALESCE(NEW.desconto, 0) > NEW.valor * 0.50 THEN
    RAISE EXCEPTION 'Desconto acima do limite de 50%% da cobranca.' USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(NEW.acrescimo, 0) < 0 OR COALESCE(NEW.acrescimo, 0) > NEW.valor * 0.30 THEN
    RAISE EXCEPTION 'Acrescimo acima do limite de 30%% da cobranca.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lancamentos_validar_limites_ajuste ON public.lancamentos;
CREATE TRIGGER lancamentos_validar_limites_ajuste
BEFORE INSERT OR UPDATE OF desconto, acrescimo, valor ON public.lancamentos
FOR EACH ROW EXECUTE FUNCTION public.validar_limites_ajuste_lancamento();

COMMIT;
