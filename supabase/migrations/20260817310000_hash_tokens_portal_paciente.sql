BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Tokens existentes continuam funcionando: o paciente conserva o valor que
-- recebeu, enquanto o banco passa a guardar somente sua impressão SHA-256.
UPDATE public.paciente_portal_tokens
   SET token = encode(extensions.digest(token, 'sha256'), 'hex');

-- A aplicação não deve mais inserir e depois selecionar o segredo. A função
-- abaixo é o único emissor: devolve o valor bruto uma vez e persiste só o hash.
DROP POLICY IF EXISTS portal_tokens_insert ON public.paciente_portal_tokens;
DROP POLICY IF EXISTS "portal_tokens_insert" ON public.paciente_portal_tokens;

-- O trigger antigo criava um segredo que nunca era entregue e o deixava em
-- texto puro. O token passa a nascer somente quando um link é solicitado.
DROP TRIGGER IF EXISTS pacientes_geram_token_portal ON public.pacientes;
DROP FUNCTION IF EXISTS public.gerar_token_portal_paciente();

CREATE OR REPLACE FUNCTION public.link_portal_paciente(p_paciente_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token_bruto text;
  v_clinica_id uuid;
BEGIN
  SELECT clinica_id INTO v_clinica_id
    FROM public.pacientes
   WHERE id = p_paciente_id;

  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Em chamada interativa, somente quem gerencia a clínica pode emitir link.
  -- auth.uid() nulo é reservado aos triggers internos SECURITY DEFINER.
  IF auth.uid() IS NOT NULL AND NOT public.can_manage_data(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para gerar link do portal';
  END IF;

  v_token_bruto := encode(gen_random_bytes(32), 'hex');
  INSERT INTO public.paciente_portal_tokens
    (paciente_id, clinica_id, token, ativo, expires_at)
  VALUES
    (p_paciente_id, v_clinica_id, encode(extensions.digest(v_token_bruto, 'sha256'), 'hex'), true, now() + interval '1 year');

  RETURN 'https://app.elolab.com.br/portal-paciente?token=' || v_token_bruto;
END;
$$;

REVOKE ALL ON FUNCTION public.link_portal_paciente(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_portal_paciente(uuid) TO authenticated;

COMMENT ON COLUMN public.paciente_portal_tokens.token IS
  'SHA-256 hexadecimal do token. O segredo bruto é retornado uma única vez por link_portal_paciente e nunca é persistido.';

COMMIT;
