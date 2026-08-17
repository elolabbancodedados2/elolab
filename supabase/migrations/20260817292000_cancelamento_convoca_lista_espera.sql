BEGIN;

-- Qualquer cancelamento (agenda, recepção ou portal) abre a vaga da mesma
-- forma. O bloqueio das linhas impede dois cancelamentos concorrentes de
-- convocarem o mesmo paciente.
CREATE OR REPLACE FUNCTION public.convocar_lista_espera_apos_cancelamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidato record;
  paciente record;
  medico_nome text;
  mensagem text;
BEGIN
  IF NEW.status <> 'cancelado' OR OLD.status = 'cancelado' OR NEW.data < current_date THEN
    RETURN NEW;
  END IF;

  SELECT nome INTO medico_nome FROM public.medicos WHERE id = NEW.medico_id;

  FOR candidato IN
    SELECT le.id, le.paciente_id
      FROM public.lista_espera le
     WHERE le.clinica_id = NEW.clinica_id
       AND le.status = 'aguardando'
       AND (le.medico_id = NEW.medico_id OR (le.medico_id IS NULL AND (le.especialidade IS NULL OR le.especialidade = (SELECT especialidade FROM medicos WHERE id=NEW.medico_id))))
     ORDER BY CASE le.prioridade WHEN 'urgente' THEN 1 WHEN 'preferencial' THEN 2 ELSE 3 END,
              le.created_at
     FOR UPDATE SKIP LOCKED
     LIMIT 3
  LOOP
    SELECT nome, email, telefone INTO paciente FROM public.pacientes WHERE id = candidato.paciente_id;
    mensagem := format('Olá %s! Uma vaga abriu com Dr(a). %s em %s às %s. Entre no portal ou fale com a clínica para reservar.',
      paciente.nome, COALESCE(medico_nome,''), to_char(NEW.data,'DD/MM/YYYY'), to_char(NEW.hora_inicio,'HH24:MI'));

    IF paciente.telefone IS NOT NULL THEN
      INSERT INTO public.notification_queue(tipo,destinatario_id,destinatario_telefone,destinatario_nome,assunto,conteudo,status,clinica_id,dados_extras)
      VALUES('whatsapp',candidato.paciente_id,paciente.telefone,paciente.nome,'Vaga disponível',mensagem,'pendente',NEW.clinica_id,
        jsonb_build_object('tipo','vaga_lista_espera','lista_espera_id',candidato.id,'agendamento_cancelado_id',NEW.id));
    END IF;
    IF paciente.email IS NOT NULL THEN
      INSERT INTO public.notification_queue(tipo,destinatario_id,destinatario_email,destinatario_nome,assunto,conteudo,status,clinica_id,dados_extras)
      VALUES('email',candidato.paciente_id,paciente.email,paciente.nome,'Vaga disponível na agenda',mensagem,'pendente',NEW.clinica_id,
        jsonb_build_object('tipo','vaga_lista_espera','lista_espera_id',candidato.id,'agendamento_cancelado_id',NEW.id));
    END IF;

    IF paciente.telefone IS NOT NULL OR paciente.email IS NOT NULL THEN
      UPDATE public.lista_espera SET status='notificado',
        observacoes=concat_ws(E'\n',observacoes,format('Vaga oferecida em %s para %s %s',now(),NEW.data,NEW.hora_inicio))
       WHERE id=candidato.id;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_convocar_lista_espera_cancelamento ON public.agendamentos;
CREATE TRIGGER trg_convocar_lista_espera_cancelamento
AFTER UPDATE OF status ON public.agendamentos
FOR EACH ROW EXECUTE FUNCTION public.convocar_lista_espera_apos_cancelamento();

COMMIT;
