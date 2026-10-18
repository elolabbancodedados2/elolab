BEGIN;

ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.paciente_status_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE RESTRICT,
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  ativo boolean NOT NULL,
  motivo text NOT NULL CHECK (motivo IN (
    'solicitacao_titular', 'cadastro_duplicado', 'cadastro_incorreto',
    'transferencia_clinica', 'retorno_ao_atendimento', 'correcao_cadastro', 'outro'
  )),
  alterado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  ocorreu_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS paciente_status_eventos_paciente_data_idx
  ON public.paciente_status_eventos (clinica_id, paciente_id, ocorreu_em DESC);

ALTER TABLE public.paciente_status_eventos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.paciente_status_eventos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.paciente_status_eventos TO authenticated;
DROP POLICY IF EXISTS paciente_status_eventos_select ON public.paciente_status_eventos;
CREATE POLICY paciente_status_eventos_select ON public.paciente_status_eventos
  FOR SELECT TO authenticated
  USING (public.can_manage_data(auth.uid()) AND public.is_same_clinica(clinica_id));

CREATE OR REPLACE FUNCTION public.proteger_status_paciente()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.ativo IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Novos pacientes devem iniciar ativos.' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.ativo IS DISTINCT FROM OLD.ativo
        AND current_setting('app.allow_patient_status_rpc', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Altere o status do paciente pela operação administrativa.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.proteger_status_paciente() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS pacientes_proteger_status ON public.pacientes;
CREATE TRIGGER pacientes_proteger_status
  BEFORE INSERT OR UPDATE OF ativo ON public.pacientes
  FOR EACH ROW EXECUTE FUNCTION public.proteger_status_paciente();

CREATE OR REPLACE FUNCTION public.alterar_status_paciente(
  p_paciente_id uuid,
  p_ativo boolean,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_clinica_id uuid;
  v_ativo_atual boolean;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF v_user_id IS NULL OR NOT public.can_manage_data(v_user_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar o status do paciente.' USING ERRCODE = '42501';
  END IF;
  IF p_ativo IS NULL OR p_motivo IS NULL OR p_motivo NOT IN (
    'solicitacao_titular', 'cadastro_duplicado', 'cadastro_incorreto',
    'transferencia_clinica', 'retorno_ao_atendimento', 'correcao_cadastro', 'outro'
  ) THEN
    RAISE EXCEPTION 'Motivo administrativo inválido.' USING ERRCODE = '22023';
  END IF;

  v_clinica_id := public.get_my_clinica_id();
  SELECT p.ativo INTO v_ativo_atual
    FROM public.pacientes p
   WHERE p.id = p_paciente_id AND p.clinica_id = v_clinica_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paciente não encontrado nesta clínica.' USING ERRCODE = '42501';
  END IF;

  IF v_ativo_atual = p_ativo THEN
    RETURN jsonb_build_object('ativo', v_ativo_atual, 'alterado', false);
  END IF;

  IF NOT p_ativo AND EXISTS (
    SELECT 1
      FROM public.agendamentos a
     WHERE a.paciente_id = p_paciente_id
       AND a.clinica_id = v_clinica_id
       AND a.data >= v_hoje
       AND a.status::text NOT IN ('cancelado', 'faltou', 'finalizado', 'atendimento_finalizado')
  ) THEN
    RAISE EXCEPTION 'Cancele ou conclua os agendamentos atuais e futuros antes de inativar este paciente.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT p_ativo AND EXISTS (
    SELECT 1
      FROM public.fila_atendimento f
      JOIN public.agendamentos a ON a.id = f.agendamento_id
     WHERE a.paciente_id = p_paciente_id
       AND a.clinica_id = v_clinica_id
       AND f.status IN ('aguardando', 'chamado', 'em_atendimento')
  ) THEN
    RAISE EXCEPTION 'Remova o paciente da fila de atendimento antes de inativar.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.allow_patient_status_rpc', 'on', true);
  UPDATE public.pacientes SET ativo = p_ativo
   WHERE id = p_paciente_id AND clinica_id = v_clinica_id;

  IF NOT p_ativo THEN
    UPDATE public.paciente_portal_tokens
       SET ativo = false
     WHERE paciente_id = p_paciente_id
       AND clinica_id = v_clinica_id
       AND ativo = true;
  END IF;

  INSERT INTO public.paciente_status_eventos (paciente_id, clinica_id, ativo, motivo, alterado_por)
  VALUES (p_paciente_id, v_clinica_id, p_ativo, p_motivo, v_user_id);

  RETURN jsonb_build_object('ativo', p_ativo, 'alterado', true);
END;
$$;

REVOKE ALL ON FUNCTION public.alterar_status_paciente(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.alterar_status_paciente(uuid, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.impedir_agendamento_paciente_inativo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ativo boolean;
  v_clinica_id uuid;
BEGIN
  IF NEW.paciente_id IS NULL THEN RETURN NEW; END IF;
  SELECT p.ativo, p.clinica_id INTO v_ativo, v_clinica_id
    FROM public.pacientes p WHERE p.id = NEW.paciente_id FOR SHARE;
  IF NOT FOUND OR v_clinica_id IS DISTINCT FROM NEW.clinica_id THEN
    RAISE EXCEPTION 'Paciente não encontrado nesta clínica.' USING ERRCODE = '23514';
  END IF;
  IF NOT v_ativo THEN
    RAISE EXCEPTION 'Reative o paciente antes de criar ou alterar um agendamento.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.impedir_agendamento_paciente_inativo() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS agendamentos_impedir_paciente_inativo ON public.agendamentos;
CREATE TRIGGER agendamentos_impedir_paciente_inativo
  BEFORE INSERT OR UPDATE OF paciente_id, clinica_id, status, data, hora_inicio, hora_fim ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.impedir_agendamento_paciente_inativo();

CREATE OR REPLACE FUNCTION public.impedir_fila_paciente_inativo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ativo boolean;
  v_clinica_paciente uuid;
  v_clinica_agendamento uuid;
BEGIN
  IF NEW.status IS NULL OR NEW.status NOT IN ('aguardando', 'chamado', 'em_atendimento') THEN RETURN NEW; END IF;
  SELECT p.ativo, p.clinica_id, a.clinica_id
    INTO v_ativo, v_clinica_paciente, v_clinica_agendamento
    FROM public.agendamentos a
    JOIN public.pacientes p ON p.id = a.paciente_id
   WHERE a.id = NEW.agendamento_id
   FOR SHARE OF p;
  IF NOT FOUND OR v_clinica_paciente IS DISTINCT FROM NEW.clinica_id
     OR v_clinica_agendamento IS DISTINCT FROM NEW.clinica_id THEN
    RAISE EXCEPTION 'Agendamento e paciente devem pertencer à clínica do item da fila.' USING ERRCODE = '23514';
  END IF;
  IF NOT v_ativo THEN
    RAISE EXCEPTION 'Reative o paciente antes de incluí-lo na fila de atendimento.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.impedir_fila_paciente_inativo() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS fila_atendimento_impedir_paciente_inativo ON public.fila_atendimento;
CREATE TRIGGER fila_atendimento_impedir_paciente_inativo
  BEFORE INSERT OR UPDATE OF agendamento_id, clinica_id, status ON public.fila_atendimento
  FOR EACH ROW EXECUTE FUNCTION public.impedir_fila_paciente_inativo();

-- Keep tenant checks, token hashing, interactive rotation, and trigger behavior
-- from the scoped-link implementation while refusing inactive patients.
CREATE OR REPLACE FUNCTION public.link_portal_paciente(p_paciente_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token_bruto text;
  v_clinica_id uuid;
  v_ativo boolean;
  v_chamada_trigger boolean := pg_trigger_depth() > 0;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT v_chamada_trigger
     AND NOT public.can_manage_data(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para gerar link do portal';
  END IF;

  SELECT clinica_id, ativo INTO v_clinica_id, v_ativo
    FROM public.pacientes WHERE id = p_paciente_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF auth.uid() IS NOT NULL AND v_clinica_id IS DISTINCT FROM public.get_my_clinica_id() THEN
    RAISE EXCEPTION 'Sem permissão para gerar link do portal deste paciente';
  END IF;
  IF NOT v_ativo THEN
    RAISE EXCEPTION 'Não é possível gerar link do portal para paciente inativo.' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT v_chamada_trigger THEN
    UPDATE public.paciente_portal_tokens SET ativo = false
     WHERE paciente_id = p_paciente_id
       AND clinica_id IS NOT DISTINCT FROM v_clinica_id
       AND ativo = true;
  END IF;

  v_token_bruto := encode(gen_random_bytes(32), 'hex');
  INSERT INTO public.paciente_portal_tokens (paciente_id, clinica_id, token, ativo, expires_at)
  VALUES (p_paciente_id, v_clinica_id,
    encode(extensions.digest(v_token_bruto, 'sha256'), 'hex'), true, now() + interval '1 year');
  RETURN 'https://app.elolab.com.br/portal-paciente?token=' || v_token_bruto;
END;
$$;

REVOKE ALL ON FUNCTION public.link_portal_paciente(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_portal_paciente(uuid) TO authenticated;

COMMENT ON TABLE public.paciente_status_eventos IS
  'Trilha administrativa das inativações e reativações; o histórico clínico permanece associado à ficha.';
COMMENT ON FUNCTION public.alterar_status_paciente(uuid, boolean, text) IS
  'Altera status do paciente de forma auditada e bloqueia inativação com agendamentos ou fila ativos.';

COMMIT;
