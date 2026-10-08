-- Serializa a criação de triagens por agendamento. A consulta da interface
-- continua útil para orientar a equipe, mas não consegue impedir duas sessões
-- simultâneas de criarem a mesma ficha.
--
-- Não removemos nem alteramos duplicatas históricas: a regra vale para novos
-- vínculos e para mudanças futuras de agendamento_id.
BEGIN;

CREATE OR REPLACE FUNCTION public.impedir_triagem_duplicada_por_agendamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.agendamento_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.agendamento_id IS NOT DISTINCT FROM NEW.agendamento_id THEN
    RETURN NEW;
  END IF;

  -- A trava transacional torna a verificação segura para inserts concorrentes.
  PERFORM pg_advisory_xact_lock(179202610, hashtext(NEW.agendamento_id::text));

  IF EXISTS (
    SELECT 1
      FROM public.triagens AS t
     WHERE t.agendamento_id = NEW.agendamento_id
       AND t.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'Este agendamento já possui uma triagem registrada.'
      USING ERRCODE = '23505',
            CONSTRAINT = 'triagem_agendamento_unico';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.impedir_triagem_duplicada_por_agendamento() FROM PUBLIC;

DROP TRIGGER IF EXISTS impedir_triagem_duplicada_por_agendamento ON public.triagens;
CREATE TRIGGER impedir_triagem_duplicada_por_agendamento
  BEFORE INSERT OR UPDATE OF agendamento_id ON public.triagens
  FOR EACH ROW
  EXECUTE FUNCTION public.impedir_triagem_duplicada_por_agendamento();

COMMENT ON FUNCTION public.impedir_triagem_duplicada_por_agendamento() IS
  'Impede novas triagens duplicadas por agendamento sob concorrência sem remover registros históricos.';

COMMIT;
