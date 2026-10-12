BEGIN;

-- A emissão da credencial precisa respeitar o isolamento por clínica mesmo
-- sendo chamada diretamente, fora das rotas administrativas do frontend.
-- Emissões interativas também invalidam o link anterior para permitir rotação segura.
CREATE OR REPLACE FUNCTION public.link_portal_paciente(p_paciente_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token_bruto text;
  v_clinica_id uuid;
  v_chamada_trigger boolean := pg_trigger_depth() > 0;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT v_chamada_trigger
     AND NOT public.can_manage_data(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para gerar link do portal';
  END IF;

  -- Serializa as emissões para este paciente e evita deixar dois links ativos
  -- quando dois administradores/receptionistas clicam ao mesmo tempo.
  SELECT clinica_id INTO v_clinica_id
    FROM public.pacientes
   WHERE id = p_paciente_id
   FOR UPDATE;

  IF NOT FOUND THEN RETURN NULL; END IF;

  IF auth.uid() IS NOT NULL
     AND v_clinica_id IS DISTINCT FROM public.get_my_clinica_id() THEN
    RAISE EXCEPTION 'Sem permissão para gerar link do portal deste paciente';
  END IF;

  -- Emissões interativas rotacionam o link compartilhado pela clínica. O
  -- trigger de resultado pode manter o auth.uid() da requisição que liberou
  -- o laudo. pg_trigger_depth() distingue esse fluxo do RPC interativo.
  IF NOT v_chamada_trigger THEN
    UPDATE public.paciente_portal_tokens
       SET ativo = false
     WHERE paciente_id = p_paciente_id
       AND clinica_id IS NOT DISTINCT FROM v_clinica_id
       AND ativo = true;
  END IF;

  v_token_bruto := encode(gen_random_bytes(32), 'hex');
  INSERT INTO public.paciente_portal_tokens
    (paciente_id, clinica_id, token, ativo, expires_at)
  VALUES
    (p_paciente_id, v_clinica_id,
     encode(extensions.digest(v_token_bruto, 'sha256'), 'hex'),
     true, now() + interval '1 year');

  RETURN 'https://app.elolab.com.br/portal-paciente?token=' || v_token_bruto;
END;
$$;

REVOKE ALL ON FUNCTION public.link_portal_paciente(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_portal_paciente(uuid) TO authenticated;

COMMENT ON FUNCTION public.link_portal_paciente(uuid) IS
  'Gera link para paciente da clínica do usuário, rotaciona links em chamadas interativas e persiste somente o hash.';

COMMIT;
