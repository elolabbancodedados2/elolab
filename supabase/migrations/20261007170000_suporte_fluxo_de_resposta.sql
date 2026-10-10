-- Atualiza a fila conforme quem respondeu, na mesma transação da mensagem.
-- Assim, uma resposta do cliente reabre a fila e a resposta do suporte passa a
-- aguardar o cliente. Notas internas não mudam o estado nem contam como resposta.
CREATE OR REPLACE FUNCTION public.support_ticket_message_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.interno THEN
    RETURN NEW;
  END IF;

  IF public.is_platform_admin() THEN
    UPDATE public.support_tickets
       SET status = 'aguardando_cliente',
           primeira_resposta_em = COALESCE(primeira_resposta_em, NEW.created_at),
           updated_at = now()
     WHERE id = NEW.ticket_id;
  ELSE
    UPDATE public.support_tickets
       SET status = 'aberto',
           updated_at = now()
     WHERE id = NEW.ticket_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_ticket_message_workflow_trigger ON public.support_ticket_messages;
CREATE TRIGGER support_ticket_message_workflow_trigger
  AFTER INSERT ON public.support_ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.support_ticket_message_workflow();
