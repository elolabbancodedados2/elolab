BEGIN;

ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS telefone_confirmado_em timestamptz,
  ADD COLUMN IF NOT EXISTS telefone_confirmacao_origem text CHECK (telefone_confirmacao_origem IS NULL OR telefone_confirmacao_origem IN ('paciente', 'responsavel', 'equipe')),
  ADD COLUMN IF NOT EXISTS telefone_confirmado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email_confirmado_em timestamptz,
  ADD COLUMN IF NOT EXISTS email_confirmacao_origem text CHECK (email_confirmacao_origem IS NULL OR email_confirmacao_origem IN ('paciente', 'responsavel', 'equipe')),
  ADD COLUMN IF NOT EXISTS email_confirmado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.limpar_confirmacao_contato_alterado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.telefone IS DISTINCT FROM OLD.telefone THEN
    NEW.telefone_confirmado_em := NULL;
    NEW.telefone_confirmacao_origem := NULL;
    NEW.telefone_confirmado_por := NULL;
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    NEW.email_confirmado_em := NULL;
    NEW.email_confirmacao_origem := NULL;
    NEW.email_confirmado_por := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pacientes_limpar_confirmacao_contato ON public.pacientes;
DROP TRIGGER IF EXISTS pacientes_limpar_confirmacao_contato ON public.pacientes;
CREATE TRIGGER pacientes_limpar_confirmacao_contato
  BEFORE UPDATE OF telefone, email ON public.pacientes
  FOR EACH ROW EXECUTE FUNCTION public.limpar_confirmacao_contato_alterado();

CREATE OR REPLACE FUNCTION public.registrar_confirmacao_contato_paciente(
  p_paciente_id uuid,
  p_canal text,
  p_origem text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_clinica_id uuid;
  v_paciente public.pacientes%rowtype;
  v_confirmado_em timestamptz := now();
BEGIN
  IF v_user_id IS NULL OR NOT public.can_manage_data(v_user_id) THEN
    RAISE EXCEPTION 'Sem permissão para confirmar os contatos do paciente.'
      USING ERRCODE = '42501';
  END IF;

  IF p_canal IS NULL OR p_canal NOT IN ('telefone', 'email')
     OR p_origem IS NULL OR p_origem NOT IN ('paciente', 'responsavel', 'equipe') THEN
    RAISE EXCEPTION 'Canal ou origem de confirmação inválidos.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_clinica_id := public.get_my_clinica_id();
  SELECT * INTO v_paciente
    FROM public.pacientes p
   WHERE p.id = p_paciente_id
     AND p.clinica_id = v_clinica_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paciente não encontrado nesta clínica.'
      USING ERRCODE = '42501';
  END IF;

  IF p_canal = 'telefone' THEN
    IF NULLIF(BTRIM(v_paciente.telefone), '') IS NULL THEN
      RAISE EXCEPTION 'Cadastre o telefone antes de confirmar.'
        USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.pacientes
       SET telefone_confirmado_em = v_confirmado_em,
           telefone_confirmacao_origem = p_origem,
           telefone_confirmado_por = v_user_id
     WHERE id = p_paciente_id AND clinica_id = v_clinica_id;
  ELSE
    IF NULLIF(BTRIM(v_paciente.email), '') IS NULL THEN
      RAISE EXCEPTION 'Cadastre o e-mail antes de confirmar.'
        USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.pacientes
       SET email_confirmado_em = v_confirmado_em,
           email_confirmacao_origem = p_origem,
           email_confirmado_por = v_user_id
     WHERE id = p_paciente_id AND clinica_id = v_clinica_id;
  END IF;

  RETURN jsonb_build_object('canal', p_canal, 'confirmado_em', v_confirmado_em, 'origem', p_origem, 'confirmado_por', v_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.limpar_confirmacao_contato_alterado() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_confirmacao_contato_paciente(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_confirmacao_contato_paciente(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.registrar_confirmacao_contato_paciente(uuid, text, text) IS
  'Registra quando e por qual fonte a equipe confirmou um canal de contato do paciente da clínica; alterações futuras no canal removem a confirmação.';

COMMIT;
