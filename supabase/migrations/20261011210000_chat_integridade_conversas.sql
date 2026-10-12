BEGIN;

LOCK TABLE public.chat_messages IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.chat_conversations IN ACCESS EXCLUSIVE MODE;

-- Remove historical duplicate threads for the same unordered pair while
-- preserving every message by moving it to the oldest canonical thread.
DROP TRIGGER IF EXISTS trg_proteger_identidade_conversa_chat ON public.chat_conversations;
DROP TRIGGER IF EXISTS trg_proteger_conteudo_mensagem_chat ON public.chat_messages;

CREATE TEMP TABLE chat_conversation_duplicates ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    id,
    first_value(id) OVER (
      PARTITION BY clinica_id, LEAST(participante_1_id, participante_2_id), GREATEST(participante_1_id, participante_2_id)
      ORDER BY (participante_1_id > participante_2_id), created_at NULLS LAST, id
    ) AS keeper_id,
    row_number() OVER (
      PARTITION BY clinica_id, LEAST(participante_1_id, participante_2_id), GREATEST(participante_1_id, participante_2_id)
      ORDER BY (participante_1_id > participante_2_id), created_at NULLS LAST, id
    ) AS pair_rank
  FROM public.chat_conversations
)
SELECT id AS duplicate_id, keeper_id
FROM ranked
WHERE pair_rank > 1;

-- Drop directional pair uniqueness (including the legacy
-- chat_conversations_unique constraint) before canonicalizing, because threads
-- in different clinics may have existed in opposite orders under old schemas.
DO $$
DECLARE
  existing_constraint record;
BEGIN
  FOR existing_constraint IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.chat_conversations'::regclass
       AND contype = 'u'
       AND pg_get_constraintdef(oid) LIKE '%(participante_1_id, participante_2_id)%'
  LOOP
    EXECUTE format('ALTER TABLE public.chat_conversations DROP CONSTRAINT %I', existing_constraint.conname);
  END LOOP;
END;
$$;

UPDATE public.chat_messages AS message
   SET conversa_id = duplicate.keeper_id
  FROM chat_conversation_duplicates AS duplicate
 WHERE message.conversa_id = duplicate.duplicate_id;

DELETE FROM public.chat_conversations AS conversation
 USING chat_conversation_duplicates AS duplicate
 WHERE conversation.id = duplicate.duplicate_id;

UPDATE public.chat_conversations
   SET participante_1_id = LEAST(participante_1_id, participante_2_id),
       participante_2_id = GREATEST(participante_1_id, participante_2_id)
 WHERE participante_1_id > participante_2_id;

UPDATE public.chat_conversations AS conversation
   SET preview = latest.texto_preview,
       ultima_mensagem_em = latest.created_at
  FROM (
    SELECT DISTINCT ON (message.conversa_id)
           message.conversa_id,
           left(message.texto, 100) AS texto_preview,
           message.created_at
      FROM public.chat_messages AS message
      ORDER BY message.conversa_id, message.created_at DESC NULLS LAST, message.id DESC
  ) AS latest
 WHERE latest.conversa_id = conversation.id;

ALTER TABLE public.chat_conversations
  DROP CONSTRAINT IF EXISTS chat_conversations_participants_canonical;
ALTER TABLE public.chat_conversations
  ADD CONSTRAINT chat_conversations_participants_canonical
  CHECK (participante_1_id <= participante_2_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_conversations_participants_canonical
  ON public.chat_conversations (clinica_id, participante_1_id, participante_2_id)
  WHERE clinica_id IS NOT NULL;

DROP POLICY IF EXISTS chat_conv_insert_clinic ON public.chat_conversations;
CREATE POLICY chat_conv_insert_clinic ON public.chat_conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    clinica_id = public.get_my_clinica_id()
    AND participante_1_id < participante_2_id
    AND auth.uid() IN (participante_1_id, participante_2_id)
    AND EXISTS (
      SELECT 1 FROM public.profiles AS outro
       WHERE outro.id = CASE
         WHEN participante_1_id = auth.uid() THEN participante_2_id
         ELSE participante_1_id
       END
         AND outro.clinica_id = public.get_my_clinica_id()
         AND outro.ativo IS TRUE
    )
  );

DROP POLICY IF EXISTS chat_conv_delete_clinic ON public.chat_conversations;
DROP POLICY IF EXISTS chat_msg_delete_clinic ON public.chat_messages;
DROP POLICY IF EXISTS chat_conv_update_clinic ON public.chat_conversations;
REVOKE DELETE ON public.chat_conversations FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE ON public.chat_conversations FROM PUBLIC, anon, authenticated;
REVOKE DELETE ON public.chat_messages FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.atualizar_preview_conversa_chat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  ultima public.chat_messages%ROWTYPE;
BEGIN
  -- Serialize preview updates for this conversation and read the newest
  -- persisted message after obtaining the lock.
  PERFORM 1
    FROM public.chat_conversations
   WHERE id = NEW.conversa_id
   FOR UPDATE;

  SELECT * INTO ultima
    FROM public.chat_messages
   WHERE conversa_id = NEW.conversa_id
    ORDER BY created_at DESC NULLS LAST, id DESC
   LIMIT 1;

  UPDATE public.chat_conversations
     SET preview = left(ultima.texto, 100),
         ultima_mensagem_em = ultima.created_at
   WHERE id = NEW.conversa_id;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.atualizar_preview_conversa_chat() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_atualizar_preview_chat ON public.chat_messages;
CREATE TRIGGER trg_atualizar_preview_chat
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.atualizar_preview_conversa_chat();

CREATE OR REPLACE FUNCTION public.definir_data_mensagem_chat()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.created_at := clock_timestamp();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.definir_data_mensagem_chat() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_timestamp_mensagem_chat ON public.chat_messages;
CREATE TRIGGER trg_timestamp_mensagem_chat
  BEFORE INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.definir_data_mensagem_chat();

-- Restore the immutable identity and message-content guards after backfill.
CREATE TRIGGER trg_proteger_identidade_conversa_chat
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW EXECUTE FUNCTION public.proteger_identidade_conversa_chat();
CREATE TRIGGER trg_proteger_conteudo_mensagem_chat
  BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.proteger_conteudo_mensagem_chat();

COMMIT;
