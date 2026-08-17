BEGIN;

ALTER TABLE public.lista_espera
  ADD COLUMN IF NOT EXISTS oferta_agendamento_id uuid REFERENCES public.agendamentos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS oferta_expira_em timestamptz;

CREATE INDEX IF NOT EXISTS idx_lista_espera_oferta_expira
  ON public.lista_espera(oferta_expira_em) WHERE status='notificado';

CREATE OR REPLACE FUNCTION public.convocar_lista_espera_apos_cancelamento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE candidato record; paciente record; medico_nome text; mensagem text;
BEGIN
  IF NEW.status <> 'cancelado' OR OLD.status='cancelado' OR NEW.data<current_date THEN RETURN NEW; END IF;
  SELECT nome INTO medico_nome FROM medicos WHERE id=NEW.medico_id;
  FOR candidato IN
    SELECT le.id,le.paciente_id FROM lista_espera le
     WHERE le.clinica_id=NEW.clinica_id AND le.status='aguardando'
       AND (le.medico_id=NEW.medico_id OR (le.medico_id IS NULL AND (le.especialidade IS NULL OR le.especialidade=(SELECT especialidade FROM medicos WHERE id=NEW.medico_id))))
     ORDER BY CASE le.prioridade WHEN 'urgente' THEN 1 WHEN 'preferencial' THEN 2 ELSE 3 END,le.created_at
     FOR UPDATE SKIP LOCKED LIMIT 3
  LOOP
    SELECT nome,email,telefone INTO paciente FROM pacientes WHERE id=candidato.paciente_id;
    mensagem:=format('Olá %s! Uma vaga abriu com Dr(a). %s em %s às %s. A oferta fica disponível por 2 horas no portal.',paciente.nome,COALESCE(medico_nome,''),to_char(NEW.data,'DD/MM/YYYY'),to_char(NEW.hora_inicio,'HH24:MI'));
    IF paciente.telefone IS NOT NULL THEN INSERT INTO notification_queue(tipo,destinatario_id,destinatario_telefone,destinatario_nome,assunto,conteudo,status,clinica_id,dados_extras)
      VALUES('whatsapp',candidato.paciente_id,paciente.telefone,paciente.nome,'Vaga disponível',mensagem,'pendente',NEW.clinica_id,jsonb_build_object('tipo','vaga_lista_espera','lista_espera_id',candidato.id,'agendamento_cancelado_id',NEW.id)); END IF;
    IF paciente.email IS NOT NULL THEN INSERT INTO notification_queue(tipo,destinatario_id,destinatario_email,destinatario_nome,assunto,conteudo,status,clinica_id,dados_extras)
      VALUES('email',candidato.paciente_id,paciente.email,paciente.nome,'Vaga disponível na agenda',mensagem,'pendente',NEW.clinica_id,jsonb_build_object('tipo','vaga_lista_espera','lista_espera_id',candidato.id,'agendamento_cancelado_id',NEW.id)); END IF;
    IF paciente.telefone IS NOT NULL OR paciente.email IS NOT NULL THEN
      UPDATE lista_espera SET status='notificado',oferta_agendamento_id=NEW.id,oferta_expira_em=now()+interval '2 hours',
        observacoes=concat_ws(E'\n',observacoes,format('Vaga oferecida em %s para %s %s',now(),NEW.data,NEW.hora_inicio)) WHERE id=candidato.id;
    END IF;
  END LOOP; RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.aceitar_oferta_lista_espera(p_lista_espera_id uuid,p_paciente_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE le lista_espera%ROWTYPE; origem agendamentos%ROWTYPE; novo_id uuid;
BEGIN
  SELECT * INTO le FROM lista_espera WHERE id=p_lista_espera_id AND paciente_id=p_paciente_id FOR UPDATE;
  IF NOT FOUND OR le.status<>'notificado' OR le.oferta_expira_em<=now() THEN RETURN NULL; END IF;
  SELECT * INTO origem FROM agendamentos WHERE id=le.oferta_agendamento_id AND status='cancelado' FOR UPDATE;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM agendamentos WHERE medico_id=origem.medico_id AND data=origem.data AND hora_inicio=origem.hora_inicio AND status NOT IN('cancelado','faltou')) THEN
    UPDATE lista_espera SET status='aguardando',oferta_agendamento_id=NULL,oferta_expira_em=NULL WHERE id=le.id; RETURN NULL;
  END IF;
  INSERT INTO agendamentos(paciente_id,medico_id,data,hora_inicio,hora_fim,tipo,status,observacoes,sala_id,clinica_id,convenio_id)
  VALUES(le.paciente_id,origem.medico_id,origem.data,origem.hora_inicio,origem.hora_fim,origem.tipo,'confirmado','Vaga aceita pela lista de espera',origem.sala_id,origem.clinica_id,(SELECT convenio_id FROM pacientes WHERE id=le.paciente_id))
  RETURNING id INTO novo_id;
  UPDATE lista_espera SET status='agendado',oferta_agendamento_id=NULL,oferta_expira_em=NULL,
    observacoes=concat_ws(E'\n',observacoes,format('Oferta aceita em %s; agendamento %s',now(),novo_id)) WHERE id=le.id;
  UPDATE lista_espera SET status='aguardando',oferta_agendamento_id=NULL,oferta_expira_em=NULL
    WHERE oferta_agendamento_id=origem.id AND id<>le.id AND status='notificado';
  RETURN novo_id;
END; $$;
REVOKE ALL ON FUNCTION public.aceitar_oferta_lista_espera(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.aceitar_oferta_lista_espera(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.expirar_ofertas_lista_espera()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE total integer;
BEGIN
  UPDATE lista_espera SET status='aguardando',oferta_agendamento_id=NULL,oferta_expira_em=NULL,
    observacoes=concat_ws(E'\n',observacoes,format('Oferta expirou em %s',now()))
   WHERE status='notificado' AND oferta_expira_em<=now();
  GET DIAGNOSTICS total=ROW_COUNT; RETURN total;
END; $$;
REVOKE ALL ON FUNCTION public.expirar_ofertas_lista_espera() FROM PUBLIC;
SELECT cron.unschedule('expirar-ofertas-lista-espera') WHERE EXISTS(SELECT 1 FROM cron.job WHERE jobname='expirar-ofertas-lista-espera');
SELECT cron.schedule('expirar-ofertas-lista-espera','*/10 * * * *',$$SELECT public.expirar_ofertas_lista_espera();$$);

COMMIT;
