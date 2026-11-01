-- Correção de status de agendamento com motivo e trilha própria.
--
-- Não havia como desfazer um "faltou" marcado por engano nem um "iniciar"
-- clicado no paciente errado. As duas voltas passam a existir, só por esta
-- função, com motivo obrigatório e registro em agendamento_correcoes_status.

CREATE TABLE IF NOT EXISTS public.agendamento_correcoes_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  agendamento_id uuid NOT NULL REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  status_anterior text NOT NULL,
  status_novo text NOT NULL,
  motivo text NOT NULL CHECK (length(btrim(motivo)) >= 10),
  usuario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agendamento_correcoes_status_agendamento_idx
  ON public.agendamento_correcoes_status (agendamento_id, created_at DESC);

ALTER TABLE public.agendamento_correcoes_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agendamento_correcoes_status_select ON public.agendamento_correcoes_status;
CREATE POLICY agendamento_correcoes_status_select ON public.agendamento_correcoes_status
  FOR SELECT TO authenticated
  USING (public.is_same_clinica(clinica_id));
REVOKE INSERT, UPDATE, DELETE ON public.agendamento_correcoes_status FROM anon, authenticated;
GRANT SELECT ON public.agendamento_correcoes_status TO authenticated;

CREATE OR REPLACE FUNCTION public.validar_transicao_status_agendamento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_permitidos text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS NULL OR NEW.status::text NOT IN ('agendado', 'confirmado') THEN
      RAISE EXCEPTION 'Um agendamento novo deve iniciar como agendado ou confirmado.' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status::text = 'cancelado'
     AND NEW.status::text = 'agendado'
     AND EXISTS (
       SELECT 1 FROM public.retornos r
        WHERE r.agendamento_retorno_id = NEW.id
          AND r.clinica_id = NEW.clinica_id
          AND r.status::text NOT IN ('realizado', 'cancelado')
     ) THEN
    RETURN NEW;
  END IF;

  -- Correções com motivo, só dentro de corrigir_status_agendamento (flag local da transação).
  IF current_setting('elolab.corrigindo_status', true) = 'on'
     AND ((OLD.status::text = 'faltou' AND NEW.status::text = 'agendado')
       OR (OLD.status::text = 'em_atendimento' AND NEW.status::text = 'aguardando')) THEN
    RETURN NEW;
  END IF;

  -- Volta permitida só dentro de desfazer_checkin_sem_cobranca (flag local da transação).
  IF OLD.status::text = 'aguardando'
     AND NEW.status::text IN ('agendado', 'confirmado')
     AND current_setting('elolab.desfazendo_checkin', true) = 'on' THEN
    RETURN NEW;
  END IF;

  v_permitidos := CASE OLD.status::text
    WHEN 'agendado' THEN ARRAY['confirmado', 'aguardando', 'aguardando_pagamento', 'aguardando_triagem', 'em_triagem', 'pago', 'cancelado', 'faltou']
    WHEN 'confirmado' THEN ARRAY['aguardando', 'aguardando_pagamento', 'aguardando_triagem', 'em_triagem', 'pago', 'cancelado', 'faltou']
    WHEN 'aguardando' THEN ARRAY['aguardando_pagamento', 'aguardando_triagem', 'em_triagem', 'em_atendimento', 'pago', 'cancelado', 'faltou']
    WHEN 'aguardando_pagamento' THEN ARRAY['aguardando', 'pago', 'cancelado']
    WHEN 'aguardando_triagem' THEN ARRAY['aguardando', 'em_triagem', 'em_atendimento', 'pago', 'cancelado', 'faltou']
    WHEN 'em_triagem' THEN ARRAY['aguardando', 'em_atendimento', 'pago', 'cancelado']
    WHEN 'pago' THEN ARRAY['aguardando', 'aguardando_triagem', 'em_triagem', 'em_atendimento', 'finalizado', 'atendimento_finalizado', 'aguardando_pagamento_adicional']
    WHEN 'em_atendimento' THEN ARRAY['finalizado', 'atendimento_finalizado', 'aguardando_pagamento_adicional', 'cancelado']
    WHEN 'aguardando_pagamento_adicional' THEN ARRAY['pago', 'finalizado', 'atendimento_finalizado']
    WHEN 'finalizado' THEN ARRAY['atendimento_finalizado', 'aguardando_pagamento_adicional']
    ELSE ARRAY[]::text[]
  END;

  IF NEW.status IS NULL OR NOT (NEW.status::text = ANY(v_permitidos)) THEN
    RAISE EXCEPTION 'Transição de status de agendamento inválida: % → %.', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status::text = 'pago'
     AND COALESCE(public.saldo_devedor_do_agendamento(NEW.id), 0) > 0.009 THEN
    RAISE EXCEPTION 'O agendamento não pode ficar pago enquanto houver saldo em aberto.' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.corrigir_status_agendamento(p_agendamento_id uuid, p_motivo text, p_updated_at timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_usuario uuid := auth.uid();
  v_clinica uuid := public.get_my_clinica_id();
  v_ag public.agendamentos%ROWTYPE;
  v_novo text;
  v_motivo text := btrim(COALESCE(p_motivo, ''));
BEGIN
  IF v_usuario IS NULL OR v_clinica IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida. Entre novamente.' USING ERRCODE = '42501';
  END IF;
  IF length(v_motivo) < 10 THEN
    RAISE EXCEPTION 'Descreva o motivo da correção (mínimo 10 caracteres).';
  END IF;

  SELECT * INTO v_ag FROM public.agendamentos
   WHERE id = p_agendamento_id AND clinica_id = v_clinica
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado nesta clínica.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_ag.updated_at IS DISTINCT FROM p_updated_at THEN
    RETURN jsonb_build_object('corrigido', false, 'motivo', 'alterado_por_outra_pessoa');
  END IF;

  IF NOT (
    public.can_manage_data(v_usuario)
    OR public.is_recepcao(v_usuario)
    OR public.is_enfermagem(v_usuario)
    OR (public.is_medico(v_usuario) AND public.is_medico_da_agenda(v_ag.medico_id))
  ) THEN
    RAISE EXCEPTION 'Seu perfil não pode corrigir esta consulta.' USING ERRCODE = '42501';
  END IF;

  IF v_ag.status::text = 'faltou' THEN
    v_novo := 'agendado';
  ELSIF v_ag.status::text = 'em_atendimento' THEN
    -- Com evolução registrada o atendimento aconteceu: corrigir é outro fluxo.
    IF EXISTS (SELECT 1 FROM public.prontuarios p WHERE p.agendamento_id = v_ag.id AND p.clinica_id = v_clinica) THEN
      RAISE EXCEPTION 'Este atendimento já tem evolução registrada e não pode voltar para a fila.';
    END IF;
    v_novo := 'aguardando';
  ELSE
    RAISE EXCEPTION 'Só é possível corrigir consultas marcadas como falta ou iniciadas por engano.';
  END IF;

  PERFORM set_config('elolab.corrigindo_status', 'on', true);
  UPDATE public.agendamentos SET status = v_novo::public.status_agendamento WHERE id = v_ag.id;
  PERFORM set_config('elolab.corrigindo_status', 'off', true);

  IF v_novo = 'aguardando' THEN
    UPDATE public.fila_atendimento
       SET status = 'aguardando'
     WHERE agendamento_id = v_ag.id AND clinica_id = v_clinica AND status = 'em_atendimento';
  END IF;

  INSERT INTO public.agendamento_correcoes_status (clinica_id, agendamento_id, status_anterior, status_novo, motivo, usuario_id)
  VALUES (v_clinica, v_ag.id, v_ag.status::text, v_novo, v_motivo, v_usuario);

  RETURN jsonb_build_object('corrigido', true, 'status_anterior', v_ag.status::text, 'status', v_novo);
END;
$$;

REVOKE ALL ON FUNCTION public.corrigir_status_agendamento(uuid, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.corrigir_status_agendamento(uuid, text, timestamptz) TO authenticated;
