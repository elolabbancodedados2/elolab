BEGIN;

-- Conversations without a clinic marker stay inaccessible: the current
-- participant profiles cannot reliably prove which clinic owned old messages.

DROP POLICY IF EXISTS chat_conv_policy ON public.chat_conversations;
DROP POLICY IF EXISTS chat_conv_select ON public.chat_conversations;
DROP POLICY IF EXISTS chat_conv_insert ON public.chat_conversations;
DROP POLICY IF EXISTS chat_conv_update ON public.chat_conversations;
DROP POLICY IF EXISTS chat_conv_delete ON public.chat_conversations;
DROP POLICY IF EXISTS chat_msgs_policy ON public.chat_messages;
DROP POLICY IF EXISTS chat_msg_select ON public.chat_messages;
DROP POLICY IF EXISTS chat_msg_insert ON public.chat_messages;
DROP POLICY IF EXISTS chat_msg_update ON public.chat_messages;
DROP POLICY IF EXISTS chat_msg_delete ON public.chat_messages;

CREATE POLICY chat_conv_select_clinic ON public.chat_conversations
  FOR SELECT TO authenticated
  USING (
    clinica_id = public.get_my_clinica_id()
    AND (participante_1_id = auth.uid() OR participante_2_id = auth.uid())
  );

CREATE POLICY chat_conv_insert_clinic ON public.chat_conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    clinica_id = public.get_my_clinica_id()
    AND participante_1_id = auth.uid()
    AND participante_2_id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles AS outro
       WHERE outro.id = participante_2_id
         AND outro.clinica_id = public.get_my_clinica_id()
         AND outro.ativo IS TRUE
    )
  );

CREATE POLICY chat_conv_update_clinic ON public.chat_conversations
  FOR UPDATE TO authenticated
  USING (
    clinica_id = public.get_my_clinica_id()
    AND (participante_1_id = auth.uid() OR participante_2_id = auth.uid())
  )
  WITH CHECK (
    clinica_id = public.get_my_clinica_id()
    AND (participante_1_id = auth.uid() OR participante_2_id = auth.uid())
  );

CREATE POLICY chat_conv_delete_clinic ON public.chat_conversations
  FOR DELETE TO authenticated
  USING (
    clinica_id = public.get_my_clinica_id()
    AND (participante_1_id = auth.uid() OR participante_2_id = auth.uid())
  );

CREATE POLICY chat_msg_select_clinic ON public.chat_messages
  FOR SELECT TO authenticated
  USING (
    clinica_id = public.get_my_clinica_id()
    AND EXISTS (
      SELECT 1 FROM public.chat_conversations AS c
       WHERE c.id = conversa_id
         AND c.clinica_id = public.get_my_clinica_id()
         AND (c.participante_1_id = auth.uid() OR c.participante_2_id = auth.uid())
         AND (
           (remetente_id = c.participante_1_id AND destinatario_id = c.participante_2_id)
           OR (remetente_id = c.participante_2_id AND destinatario_id = c.participante_1_id)
         )
    )
  );

CREATE POLICY chat_msg_insert_clinic ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    clinica_id = public.get_my_clinica_id()
    AND remetente_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.chat_conversations AS c
       WHERE c.id = conversa_id
         AND c.clinica_id = public.get_my_clinica_id()
         AND (
           (c.participante_1_id = auth.uid() AND c.participante_2_id = destinatario_id)
           OR (c.participante_2_id = auth.uid() AND c.participante_1_id = destinatario_id)
         )
    )
  );

CREATE POLICY chat_msg_update_clinic ON public.chat_messages
  FOR UPDATE TO authenticated
  USING (
    clinica_id = public.get_my_clinica_id()
    AND destinatario_id = auth.uid()
    AND lida_em IS NULL
    AND EXISTS (
      SELECT 1 FROM public.chat_conversations AS c
       WHERE c.id = conversa_id
         AND c.clinica_id = public.get_my_clinica_id()
         AND (c.participante_1_id = auth.uid() OR c.participante_2_id = auth.uid())
    )
  )
  WITH CHECK (
    clinica_id = public.get_my_clinica_id()
    AND destinatario_id = auth.uid()
    AND lida_em IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.chat_conversations AS c
       WHERE c.id = conversa_id
         AND c.clinica_id = public.get_my_clinica_id()
         AND (c.participante_1_id = auth.uid() OR c.participante_2_id = auth.uid())
    )
  );

CREATE POLICY chat_msg_delete_clinic ON public.chat_messages
  FOR DELETE TO authenticated
  USING (
    clinica_id = public.get_my_clinica_id()
    AND remetente_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.chat_conversations AS c
       WHERE c.id = conversa_id
         AND c.clinica_id = public.get_my_clinica_id()
         AND (c.participante_1_id = auth.uid() OR c.participante_2_id = auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.proteger_identidade_conversa_chat()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.participante_1_id IS DISTINCT FROM OLD.participante_1_id
     OR NEW.participante_2_id IS DISTINCT FROM OLD.participante_2_id
     OR NEW.clinica_id IS DISTINCT FROM OLD.clinica_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Os participantes e a clínica da conversa não podem ser alterados.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_identidade_conversa_chat ON public.chat_conversations;
CREATE TRIGGER trg_proteger_identidade_conversa_chat
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW EXECUTE FUNCTION public.proteger_identidade_conversa_chat();

CREATE OR REPLACE FUNCTION public.proteger_conteudo_mensagem_chat()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.conversa_id IS DISTINCT FROM OLD.conversa_id
     OR NEW.remetente_id IS DISTINCT FROM OLD.remetente_id
     OR NEW.destinatario_id IS DISTINCT FROM OLD.destinatario_id
     OR NEW.texto IS DISTINCT FROM OLD.texto
     OR NEW.urgente IS DISTINCT FROM OLD.urgente
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.clinica_id IS DISTINCT FROM OLD.clinica_id
     OR NEW.lida_em IS NULL THEN
    RAISE EXCEPTION 'Mensagens não podem ser editadas; apenas marcar como lidas.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_conteudo_mensagem_chat ON public.chat_messages;
CREATE TRIGGER trg_proteger_conteudo_mensagem_chat
  BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.proteger_conteudo_mensagem_chat();

COMMIT;
