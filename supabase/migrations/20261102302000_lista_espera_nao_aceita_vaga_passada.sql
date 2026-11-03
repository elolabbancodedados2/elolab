-- Oferta da lista de espera não vale para horário que já passou (auditoria de 02/11).
--
-- aceitar_oferta_lista_espera (20260817293000) só conferia a validade da
-- oferta (2 horas). Uma vaga das 8h oferecida às 7h30 podia ser aceita às 9h
-- e virar consulta confirmada no passado. Agora o início da vaga precisa ser
-- posterior ao agora no horário de São Paulo; se não for, a oferta é desfeita
-- e o paciente volta a aguardar, como no caso de vaga já ocupada.
-- Base: definição de 20260817293000.

CREATE OR REPLACE FUNCTION public.aceitar_oferta_lista_espera(p_lista_espera_id uuid,p_paciente_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE le lista_espera%ROWTYPE; origem agendamentos%ROWTYPE; novo_id uuid;
BEGIN
  SELECT * INTO le FROM lista_espera WHERE id=p_lista_espera_id AND paciente_id=p_paciente_id FOR UPDATE;
  IF NOT FOUND OR le.status<>'notificado' OR le.oferta_expira_em<=now() THEN RETURN NULL; END IF;
  SELECT * INTO origem FROM agendamentos WHERE id=le.oferta_agendamento_id AND status='cancelado' FOR UPDATE;
  IF NOT FOUND
     OR (origem.data + origem.hora_inicio) <= (now() AT TIME ZONE 'America/Sao_Paulo')
     OR EXISTS(SELECT 1 FROM agendamentos WHERE medico_id=origem.medico_id AND data=origem.data AND hora_inicio=origem.hora_inicio AND status NOT IN('cancelado','faltou')) THEN
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
