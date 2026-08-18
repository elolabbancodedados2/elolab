-- Impede que retries do provedor gerem mensagens e respostas duplicadas.
-- Limpa duplicatas históricas conservando o primeiro registro recebido.
WITH duplicadas AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY clinica_id, message_id
           ORDER BY created_at, id
         ) AS ordem
  FROM public.whatsapp_messages
  WHERE message_id IS NOT NULL
)
DELETE FROM public.whatsapp_messages mensagem
USING duplicadas
WHERE mensagem.id = duplicadas.id
  AND duplicadas.ordem > 1;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_clinica_message_id_key
  ON public.whatsapp_messages (clinica_id, message_id)
  WHERE message_id IS NOT NULL;
