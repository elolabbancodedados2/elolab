BEGIN;

CREATE TABLE IF NOT EXISTS public.portal_acessos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid REFERENCES public.clinicas(id) ON DELETE CASCADE,
  token_id uuid REFERENCES public.paciente_portal_tokens(id) ON DELETE SET NULL,
  token_hash text,
  acao text NOT NULL CHECK (length(acao) BETWEEN 1 AND 80),
  ip text,
  acessado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_acessos_clinica_data_idx ON public.portal_acessos (clinica_id, acessado_em DESC);
CREATE INDEX IF NOT EXISTS portal_acessos_token_idx ON public.portal_acessos (token_id);
ALTER TABLE public.portal_acessos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portal_acessos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.portal_acessos TO authenticated;
GRANT SELECT, INSERT ON public.portal_acessos TO service_role;
DROP POLICY IF EXISTS portal_acessos_select ON public.portal_acessos;
CREATE POLICY portal_acessos_select ON public.portal_acessos FOR SELECT TO authenticated
  USING (public.is_same_clinica(clinica_id) AND public.is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.portal_token_seguranca (
  token_id uuid PRIMARY KEY REFERENCES public.paciente_portal_tokens(id) ON DELETE CASCADE,
  tentativas integer NOT NULL DEFAULT 0 CHECK (tentativas BETWEEN 0 AND 5),
  bloqueado_ate timestamptz
);
ALTER TABLE public.portal_token_seguranca ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portal_token_seguranca FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.portal_token_seguranca TO service_role;

CREATE OR REPLACE FUNCTION public.confirmar_nascimento_portal(p_token_id uuid, p_nascimento text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_token public.paciente_portal_tokens%ROWTYPE;
  v_estado public.portal_token_seguranca%ROWTYPE;
  v_nascimento date;
BEGIN
  SELECT * INTO v_token FROM public.paciente_portal_tokens WHERE id = p_token_id FOR UPDATE;
  IF NOT FOUND OR NOT v_token.ativo OR v_token.expires_at <= now() THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_token');
  END IF;
  SELECT data_nascimento INTO v_nascimento FROM public.pacientes
   WHERE id = v_token.paciente_id AND clinica_id = v_token.clinica_id AND ativo;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'code', 'invalid_token'); END IF;
  INSERT INTO public.portal_token_seguranca (token_id) VALUES (p_token_id) ON CONFLICT DO NOTHING;
  SELECT * INTO v_estado FROM public.portal_token_seguranca WHERE token_id = p_token_id FOR UPDATE;
  IF v_estado.bloqueado_ate > now() THEN
    RETURN jsonb_build_object('success', false, 'code', 'device_locked');
  END IF;
  IF v_nascimento IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'birth_date_missing');
  END IF;
  IF p_nascimento = to_char(v_nascimento, 'YYYY-MM-DD') THEN
    UPDATE public.portal_token_seguranca SET tentativas = 0, bloqueado_ate = NULL WHERE token_id = p_token_id;
    RETURN jsonb_build_object('success', true);
  END IF;
  v_estado.tentativas := CASE WHEN v_estado.bloqueado_ate IS NOT NULL THEN 1 ELSE v_estado.tentativas + 1 END;
  UPDATE public.portal_token_seguranca SET tentativas = v_estado.tentativas,
    bloqueado_ate = CASE WHEN v_estado.tentativas >= 5 THEN now() + interval '15 minutes' END
    WHERE token_id = p_token_id;
  RETURN jsonb_build_object('success', false, 'code', CASE WHEN v_estado.tentativas >= 5 THEN 'device_locked' ELSE 'birth_date_invalid' END);
END;
$$;
REVOKE ALL ON FUNCTION public.confirmar_nascimento_portal(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_nascimento_portal(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.link_portal_paciente(p_paciente_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_token text; v_clinica_id uuid;
BEGIN
  -- Defesa adicional: qualquer trigger recebe somente a página pública de acesso.
  IF pg_trigger_depth() > 0 THEN
    SELECT clinica_id INTO v_clinica_id FROM public.pacientes WHERE id = p_paciente_id;
    RETURN 'https://app.elolab.com.br/portal-paciente?clinica=' || v_clinica_id::text;
  END IF;
  IF auth.uid() IS NULL OR NOT public.can_manage_data(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para gerar link do portal' USING ERRCODE = '42501';
  END IF;
  SELECT clinica_id INTO v_clinica_id FROM public.pacientes WHERE id = p_paciente_id AND ativo FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_clinica_id IS DISTINCT FROM public.get_my_clinica_id() THEN
    RAISE EXCEPTION 'Sem permissão para gerar link deste paciente' USING ERRCODE = '42501';
  END IF;
  UPDATE public.paciente_portal_tokens SET ativo = false
   WHERE paciente_id = p_paciente_id AND clinica_id = v_clinica_id AND ativo;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.paciente_portal_tokens (paciente_id, clinica_id, token, ativo, expires_at)
    VALUES (p_paciente_id, v_clinica_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), true, now() + interval '90 days');
  RETURN 'https://app.elolab.com.br/portal-paciente?clinica=' || v_clinica_id::text || '#token=' || v_token;
END;
$$;
REVOKE ALL ON FUNCTION public.link_portal_paciente(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_portal_paciente(uuid) TO authenticated;
COMMENT ON FUNCTION public.link_portal_paciente(uuid) IS 'Emissão interativa de link com fragmento e validade de 90 dias. Não altera validade de tokens existentes.';

COMMIT;
