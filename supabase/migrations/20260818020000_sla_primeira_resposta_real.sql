CREATE OR REPLACE FUNCTION public.assumir_conversa_whatsapp(_conversation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.whatsapp_conversations
     SET status = 'em_atendimento_humano', responsavel_id = auth.uid(),
         atendimento_humano_em = COALESCE(atendimento_humano_em, now()), nao_lidas = 0
   WHERE id = _conversation_id
     AND clinica_id = public.current_clinica_id()
     AND status = 'aguardando_humano'
     AND (responsavel_id IS NULL OR responsavel_id = auth.uid());
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversa já assumida ou indisponível'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assumir_conversa_whatsapp(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assumir_conversa_whatsapp(uuid) TO authenticated;
