-- Keep a check-in from being called while its charge is still being resolved.
-- Existing rows default to confirmed to preserve pre-migration behavior.
BEGIN;

ALTER TABLE public.fila_atendimento
  ADD COLUMN IF NOT EXISTS cobranca_estado text NOT NULL DEFAULT 'confirmada';

-- Preserve old queue rows while making uncoordinated future inserts safe by default.
ALTER TABLE public.fila_atendimento
  ALTER COLUMN cobranca_estado SET DEFAULT 'pendente';

ALTER TABLE public.fila_atendimento
  DROP CONSTRAINT IF EXISTS fila_atendimento_cobranca_estado_check;
ALTER TABLE public.fila_atendimento
  ADD CONSTRAINT fila_atendimento_cobranca_estado_check
  CHECK (cobranca_estado IN ('pendente', 'confirmada', 'gratuita'));

CREATE OR REPLACE FUNCTION public.realizar_checkin(
  p_agendamento_id uuid,
  p_prioridade text DEFAULT 'normal'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agendamento public.agendamentos%rowtype;
  v_fila public.fila_atendimento%rowtype;
  v_posicao integer;
  v_status_anterior text;
  v_clinica_id uuid;
BEGIN
  IF p_prioridade IS NULL OR p_prioridade NOT IN ('normal', 'preferencial', 'urgente') THEN
    RAISE EXCEPTION 'Prioridade de fila invalida.' USING errcode = 'check_violation';
  END IF;

  v_clinica_id := public.get_my_clinica_id();
  IF v_clinica_id IS NULL THEN
    RAISE EXCEPTION 'Perfil sem clinica vinculada.' USING errcode = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_agendamento FROM public.agendamentos
   WHERE id = p_agendamento_id FOR UPDATE;
  IF NOT FOUND OR v_agendamento.clinica_id IS DISTINCT FROM v_clinica_id THEN
    RAISE EXCEPTION 'Agendamento nao encontrado nesta clinica.' USING errcode = 'no_data_found';
  END IF;
  IF v_agendamento.status::text IN ('cancelado', 'faltou', 'finalizado', 'atendimento_finalizado') THEN
    RAISE EXCEPTION 'O agendamento esta % e nao aceita check-in.', v_agendamento.status;
  END IF;

  v_status_anterior := v_agendamento.status::text;
  SELECT * INTO v_fila FROM public.fila_atendimento
   WHERE agendamento_id = p_agendamento_id AND status <> 'finalizado'
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'repetido', true, 'fila_id', v_fila.id,
      'status_agendamento', v_agendamento.status::text,
      'status_anterior', v_status_anterior,
      'cobranca_estado', v_fila.cobranca_estado
    );
  END IF;

  IF v_agendamento.status::text = 'em_atendimento' THEN
    RAISE EXCEPTION 'O atendimento ja foi iniciado e nao aceita check-in.' USING errcode = 'check_violation';
  END IF;

  IF v_agendamento.data IS DISTINCT FROM (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'Somente consultas de hoje podem entrar na fila.' USING errcode = 'check_violation';
  END IF;

  -- Different appointments do not share a row lock. Serialize position
  -- allocation per clinic to prevent concurrent check-ins receiving one slot.
  PERFORM pg_advisory_xact_lock(hashtext(v_agendamento.clinica_id::text), 0);
  SELECT coalesce(max(posicao), 0) + 1 INTO v_posicao
    FROM public.fila_atendimento
   WHERE clinica_id = v_agendamento.clinica_id AND status <> 'finalizado';

  INSERT INTO public.fila_atendimento(
    agendamento_id, posicao, status, prioridade, horario_chegada, clinica_id, cobranca_estado
  ) VALUES (
    v_agendamento.id, v_posicao, 'aguardando', p_prioridade, now(), v_agendamento.clinica_id, 'pendente'
  ) RETURNING * INTO v_fila;

  UPDATE public.agendamentos SET status = 'aguardando' WHERE id = v_agendamento.id;
  RETURN jsonb_build_object(
    'repetido', false, 'fila_id', v_fila.id,
    'status_agendamento', 'aguardando', 'status_anterior', v_status_anterior,
    'cobranca_estado', 'pendente'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.iniciar_atendimento_atomico(
  p_agendamento_id uuid,
  p_fila_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agendamento public.agendamentos%rowtype;
  v_fila public.fila_atendimento%rowtype;
BEGIN
  SELECT * INTO v_agendamento FROM public.agendamentos
   WHERE id = p_agendamento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento nao encontrado nesta clinica.' USING errcode = 'no_data_found';
  END IF;

  SELECT * INTO v_fila FROM public.fila_atendimento
   WHERE id = p_fila_id AND agendamento_id = p_agendamento_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item da fila nao pertence ao agendamento.' USING errcode = 'check_violation';
  END IF;
  IF v_agendamento.status::text = 'em_atendimento' AND v_fila.status = 'em_atendimento' THEN
    RETURN jsonb_build_object('repetido', true, 'status', 'em_atendimento');
  END IF;
  IF v_fila.cobranca_estado = 'pendente' THEN
    RAISE EXCEPTION 'A cobranca do check-in ainda esta sendo confirmada. Atualize a fila e tente novamente.'
      USING errcode = 'check_violation';
  END IF;
  IF v_fila.status NOT IN ('aguardando', 'chamado', 'em_atendimento') THEN
    RAISE EXCEPTION 'O item da fila esta % e nao pode iniciar atendimento.', v_fila.status;
  END IF;

  UPDATE public.agendamentos SET status = 'em_atendimento' WHERE id = v_agendamento.id;
  UPDATE public.fila_atendimento SET status = 'em_atendimento' WHERE id = v_fila.id;
  RETURN jsonb_build_object('repetido', false, 'status', 'em_atendimento');
END;
$$;

CREATE OR REPLACE FUNCTION public.confirmar_estado_cobranca_checkin(
  p_agendamento_id uuid,
  p_clinica_id uuid,
  p_gratuito boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agendamento public.agendamentos%rowtype;
  v_fila public.fila_atendimento%rowtype;
  v_convenio_id uuid;
  v_cobranca_esperada boolean;
  v_tipo_catalogo text;
BEGIN
  IF p_clinica_id IS NULL
     OR NOT (public.can_manage_data(auth.uid()) OR public.is_enfermagem(auth.uid()))
     OR NOT public.is_same_clinica(p_clinica_id) THEN
    RAISE EXCEPTION 'Sem permissao para confirmar o check-in.' USING errcode = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_agendamento FROM public.agendamentos
   WHERE id = p_agendamento_id AND clinica_id = p_clinica_id FOR UPDATE;
  IF NOT FOUND OR (
    (p_gratuito AND v_agendamento.status::text IS DISTINCT FROM 'aguardando')
    OR (NOT p_gratuito AND v_agendamento.status::text NOT IN ('aguardando', 'pago', 'aguardando_pagamento_adicional'))
  ) THEN
    RAISE EXCEPTION 'O atendimento avancou antes da confirmacao da cobranca.' USING errcode = 'check_violation';
  END IF;

  SELECT * INTO v_fila FROM public.fila_atendimento
   WHERE agendamento_id = p_agendamento_id AND clinica_id = p_clinica_id
     AND status IN ('aguardando', 'chamado')
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Check-in ativo nao encontrado.' USING errcode = 'check_violation';
  END IF;

  IF p_gratuito THEN
    IF lower(btrim(coalesce(v_agendamento.tipo, ''))) IN ('exame', 'exames') THEN
      RAISE EXCEPTION 'Exames precisam de preco cadastrado e nao podem ser liberados como consulta gratuita.'
        USING errcode = 'check_violation';
    END IF;
    v_convenio_id := coalesce(
      v_agendamento.convenio_id,
      (SELECT p.convenio_id FROM public.pacientes AS p
        WHERE p.id = v_agendamento.paciente_id AND p.clinica_id = p_clinica_id)
    );
    v_tipo_catalogo := CASE
      WHEN btrim(regexp_replace(
        lower(regexp_replace(btrim(coalesce(v_agendamento.tipo, '')), '^[[:space:]]*[0-9]+[-[:space:]]*', '', 'g')),
        '[^[:alnum:]]+', ' ', 'g'
      ))
        IN ('retorno', 'consulta retorno', 'consulta de retorno')
        THEN 'Retorno'
      ELSE btrim(coalesce(v_agendamento.tipo, ''))
    END;
    SELECT bool_or(coalesce(tc.valor_particular, 0) <> 0 OR coalesce(pc.valor, 0) <> 0)
      INTO v_cobranca_esperada
      FROM public.tipos_consulta AS tc
      LEFT JOIN public.precos_consulta_convenio AS pc
        ON pc.tipo_consulta_id = tc.id
       AND pc.convenio_id = v_convenio_id
       AND pc.clinica_id = p_clinica_id
       AND pc.ativo = true
     WHERE tc.clinica_id = p_clinica_id
       AND tc.ativo = true
       AND lower(btrim(tc.nome)) = lower(btrim(v_tipo_catalogo));
    IF v_cobranca_esperada IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'O catalogo nao confirma que este atendimento seja gratuito.' USING errcode = 'check_violation';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.lancamentos
       WHERE agendamento_id = p_agendamento_id
         AND (clinica_id = p_clinica_id OR clinica_id IS NULL)
         AND status::text NOT IN ('cancelado', 'estornado')
    ) THEN
      RAISE EXCEPTION 'Existe uma cobranca ativa; nao e possivel marcar o check-in como gratuito.'
        USING errcode = 'check_violation';
    END IF;
    UPDATE public.fila_atendimento SET cobranca_estado = 'gratuita' WHERE id = v_fila.id;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.lancamentos
       WHERE agendamento_id = p_agendamento_id
         AND (clinica_id = p_clinica_id OR clinica_id IS NULL)
         AND status::text NOT IN ('cancelado', 'estornado')
    ) THEN
      RAISE EXCEPTION 'Cobranca ativa nao encontrada para confirmar o check-in.' USING errcode = 'check_violation';
    END IF;
    UPDATE public.fila_atendimento SET cobranca_estado = 'confirmada' WHERE id = v_fila.id;
  END IF;
  RETURN true;
END;
$$;

-- Invoice insertion and its check-in state change share the same transaction.
-- This also recovers safely when an older frontend inserts the invoice but
-- does not yet call confirmar_estado_cobranca_checkin.
CREATE OR REPLACE FUNCTION public.marcar_checkin_com_cobranca_ativa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.tipo = 'receita'
     AND NEW.agendamento_id IS NOT NULL
     AND coalesce(NEW.status::text, '') NOT IN ('cancelado', 'estornado')
     AND coalesce(NEW.valor, 0) > 0 THEN
    -- Match the shared lock order used by check-in/start: appointment first,
    -- then queue. This avoids payment-versus-start row-lock inversions.
    IF EXISTS (
      SELECT 1 FROM public.fila_atendimento AS f
       WHERE f.agendamento_id = NEW.agendamento_id
         AND f.status IN ('aguardando', 'chamado')
         AND f.cobranca_estado = 'pendente'
         AND (NEW.clinica_id IS NULL OR f.clinica_id = NEW.clinica_id)
    ) THEN
      PERFORM 1 FROM public.agendamentos AS a
       WHERE a.id = NEW.agendamento_id
         AND (NEW.clinica_id IS NULL OR NEW.clinica_id = a.clinica_id)
       FOR UPDATE;
      UPDATE public.fila_atendimento AS f
         SET cobranca_estado = 'confirmada'
        FROM public.agendamentos AS a
       WHERE a.id = NEW.agendamento_id
         AND f.agendamento_id = a.id
         AND f.clinica_id = a.clinica_id
         AND (NEW.clinica_id IS NULL OR NEW.clinica_id = a.clinica_id)
         AND f.status IN ('aguardando', 'chamado')
         AND f.cobranca_estado = 'pendente';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lancamentos_confirma_checkin ON public.lancamentos;
CREATE TRIGGER lancamentos_confirma_checkin
AFTER INSERT OR UPDATE ON public.lancamentos
FOR EACH ROW EXECUTE FUNCTION public.marcar_checkin_com_cobranca_ativa();

-- The existing payment trigger also protects direct table updates that bypass
-- iniciar_atendimento_atomico. A pending check-in cannot be manually waived.
CREATE OR REPLACE FUNCTION public.exige_pagamento_antes_do_atendimento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ligado boolean;
  v_saldo numeric;
BEGIN
  IF NEW.status::text <> 'em_atendimento' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status::text IN (
    'em_atendimento', 'finalizado', 'atendimento_finalizado', 'aguardando_pagamento_adicional'
  ) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.fila_atendimento
     WHERE agendamento_id = NEW.id
       AND clinica_id = NEW.clinica_id
       AND status IN ('aguardando', 'chamado')
       AND cobranca_estado = 'pendente'
  ) THEN
    RAISE EXCEPTION 'A cobranca do check-in ainda esta sendo confirmada.' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT NEW.exige_pagamento_previo OR NEW.liberado_sem_pagamento THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(exigir_pagamento_previo, false) INTO v_ligado
    FROM public.clinicas WHERE id = NEW.clinica_id;
  IF NOT COALESCE(v_ligado, false) THEN
    RETURN NEW;
  END IF;

  v_saldo := public.saldo_devedor_do_agendamento(NEW.id);
  IF v_saldo > 0.009 THEN
    RAISE EXCEPTION
      'Este paciente tem R$ % em aberto. Receba o pagamento no balcao, ou libere com justificativa.',
      to_char(v_saldo, 'FM999G999D00')
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.realizar_checkin(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.iniciar_atendimento_atomico(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirmar_estado_cobranca_checkin(uuid, uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.marcar_checkin_com_cobranca_ativa() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.realizar_checkin(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iniciar_atendimento_atomico(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_estado_cobranca_checkin(uuid, uuid, boolean) TO authenticated;

COMMIT;
