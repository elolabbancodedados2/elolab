CREATE OR REPLACE FUNCTION public.impedir_remarcacao_agendamento_em_andamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF ROW(NEW.data, NEW.hora_inicio, NEW.hora_fim, NEW.medico_id, NEW.sala_id)
       IS DISTINCT FROM ROW(OLD.data, OLD.hora_inicio, OLD.hora_fim, OLD.medico_id, OLD.sala_id)
     AND OLD.status::text NOT IN ('agendado', 'confirmado', 'aguardando') THEN
    RAISE EXCEPTION 'Agendamento nao pode ser remarcado apos o inicio do atendimento.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.impedir_remarcacao_agendamento_em_andamento() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS agendamentos_impedir_remarcacao_em_andamento ON public.agendamentos;
CREATE TRIGGER agendamentos_impedir_remarcacao_em_andamento
  BEFORE UPDATE OF data, hora_inicio, hora_fim, medico_id, sala_id ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.impedir_remarcacao_agendamento_em_andamento();
