BEGIN;

-- The queue owns retries and uncertain deliveries; producers only enqueue atomically.
ALTER TABLE public.notification_queue ADD COLUMN IF NOT EXISTS dedupe_key text;
CREATE UNIQUE INDEX IF NOT EXISTS notification_queue_journey_once
  ON public.notification_queue(clinica_id, tipo, dedupe_key);
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS jornada_finalizada_em timestamptz;
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS jornada_versao integer NOT NULL DEFAULT 0;
INSERT INTO public.automation_settings(clinica_id,chave,descricao,valor,ativo)
SELECT c.id,a.chave,a.descricao,'{}'::jsonb,false FROM public.clinicas c CROSS JOIN (VALUES
 ('pos_consulta_agradecimento','Agradecimento uma hora após finalizar a consulta'),
 ('pesquisa_satisfacao','Avaliação de 1 a 5, 24 horas após finalizar a consulta'),
 ('lembrete_retorno','Lembretes de retorno 7 dias e 1 dia antes')) a(chave,descricao)
ON CONFLICT(clinica_id,chave) DO NOTHING;

CREATE OR REPLACE FUNCTION public.enfileirar_mensagem_jornada(
 p_clinica_id uuid,p_paciente_id uuid,p_chave text,p_evento text,p_conteudo text,
 p_agendado_para timestamptz,p_extras jsonb,p_legacy_key text DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p record; s record; canal text; total integer:=0; n integer;
BEGIN
 SELECT * INTO s FROM automation_settings WHERE clinica_id=p_clinica_id AND chave=p_chave AND ativo=true;
 IF NOT FOUND THEN RETURN 0; END IF;
 SELECT * INTO p FROM pacientes WHERE id=p_paciente_id AND clinica_id=p_clinica_id;
 IF NOT FOUND THEN RETURN 0; END IF;
 FOR canal IN SELECT unnest(ARRAY['whatsapp','email']) LOOP
  IF (canal='email' AND nullif(trim(p.email),'') IS NULL)
    OR (canal='whatsapp' AND nullif(regexp_replace(p.telefone,'\D','','g'),'') IS NULL)
    OR s.valor->>canal='false' THEN CONTINUE; END IF;
  -- Keep previously delivered/uncertain legacy messages from being replayed after upgrade.
  IF EXISTS(SELECT 1 FROM automation_delivery_claims c WHERE c.clinica_id=p_clinica_id
    AND (c.chave=p_legacy_key||':'||canal OR (p_chave='confirmacao_agendamento' AND c.chave=p_legacy_key)))
    OR EXISTS(SELECT 1 FROM notification_queue q WHERE q.clinica_id=p_clinica_id AND q.tipo=canal
      AND q.dedupe_key IS NULL AND q.status<>'cancelado' AND (
       (q.dados_extras->>'agendamento_id'=p_extras->>'agendamento_id' AND (
        (p_chave='confirmacao_agendamento' AND q.dados_extras->>'tipo_notificacao' IN ('confirmacao','confirmacao_whatsapp','confirmacao_agendamento'))
        OR (p_chave='lembrete_consulta_24h' AND q.dados_extras->>'tipo_lembrete' IN ('24h','24h_whatsapp'))
        OR (p_chave='lembrete_consulta_2h' AND q.dados_extras->>'tipo_lembrete' IN ('2h','2h_whatsapp'))))
       OR (q.dados_extras->>'resultado_id'=p_extras->>'resultado_id')
       OR (q.dados_extras->>'retorno_id'=p_extras->>'retorno_id' AND q.dados_extras->>'dias_antes'=p_extras->>'dias_antes')
      )) THEN CONTINUE; END IF;
  INSERT INTO notification_queue(clinica_id,tipo,destinatario_id,destinatario_nome,destinatario_email,
    destinatario_telefone,assunto,conteudo,status,agendado_para,dedupe_key,dados_extras)
  VALUES(p_clinica_id,canal,p.id,p.nome,p.email,p.telefone,
    CASE p_chave WHEN 'confirmacao_agendamento' THEN 'Agendamento recebido'
      WHEN 'notificacao_resultado_exame' THEN 'Resultado disponível'
      WHEN 'pesquisa_satisfacao' THEN 'Como foi seu atendimento?'
      WHEN 'pos_consulta_agradecimento' THEN 'Obrigado pela visita'
      WHEN 'lembrete_retorno' THEN 'Lembrete de retorno' ELSE 'Lembrete de consulta' END,
    p_conteudo,'pendente',p_agendado_para,p_chave||':'||p_evento,
    p_extras||jsonb_build_object('automation_key',p_chave,'tipo_notificacao',p_chave,'journey',true)
      ||CASE WHEN p_chave IN ('lembrete_consulta_24h','lembrete_consulta_2h') THEN
       jsonb_build_object('tipo_lembrete',CASE p_chave WHEN 'lembrete_consulta_24h' THEN '24h' ELSE '2h' END||CASE canal WHEN 'whatsapp' THEN '_whatsapp' ELSE '' END)
       ELSE '{}'::jsonb END)
  ON CONFLICT(clinica_id,tipo,dedupe_key) DO NOTHING;
  GET DIAGNOSTICS n=ROW_COUNT; total:=total+n;
 END LOOP;
 RETURN total;
END; $$;

CREATE OR REPLACE FUNCTION public.enfileirar_jornada_paciente(
 p_clinica_id uuid DEFAULT NULL,p_agendamento_id uuid DEFAULT NULL,
 p_resultado_id uuid DEFAULT NULL,p_automation_key text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a record; r record; k text; due timestamptz; slot text; msg text; extra jsonb;
 total integer:=0; dias integer; local_hoje date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
 IF p_agendamento_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM agendamentos WHERE id=p_agendamento_id AND clinica_id=p_clinica_id) THEN
   RAISE EXCEPTION 'Consulta não encontrada nesta clínica' USING ERRCODE='P0002'; END IF;
 IF p_resultado_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM resultados_laboratorio x JOIN coletas_laboratorio c ON c.id=x.coleta_id
   WHERE x.id=p_resultado_id AND c.clinica_id=p_clinica_id AND x.liberado AND x.data_liberacao IS NOT NULL) THEN
   RAISE EXCEPTION 'Resultado liberado não encontrado nesta clínica' USING ERRCODE='P0002'; END IF;
 IF p_resultado_id IS NULL THEN
 FOR a IN SELECT ag.*,p.nome AS paciente_nome,c.nome AS clinica_nome,m.nome AS medico_nome
   FROM agendamentos ag JOIN pacientes p ON p.id=ag.paciente_id AND p.clinica_id=ag.clinica_id
   JOIN clinicas c ON c.id=ag.clinica_id LEFT JOIN medicos m ON m.id=ag.medico_id AND m.clinica_id=ag.clinica_id
   WHERE (p_clinica_id IS NULL OR ag.clinica_id=p_clinica_id)
     AND (p_agendamento_id IS NULL OR ag.id=p_agendamento_id)
     AND (p_agendamento_id IS NOT NULL OR ag.data BETWEEN local_hoje AND local_hoje+8 OR ag.jornada_finalizada_em>now()-interval '2 days')
 LOOP
  slot:=a.id||':'||a.data||':'||a.hora_inicio||':'||a.jornada_versao;
  extra:=jsonb_build_object('agendamento_id',a.id,'appointment_slot',a.data||'T'||a.hora_inicio,'appointment_version',a.jornada_versao);
  FOR k IN SELECT unnest(ARRAY['confirmacao_agendamento','lembrete_consulta_24h','lembrete_consulta_2h','pos_consulta_agradecimento','pesquisa_satisfacao']) LOOP
   IF p_automation_key IS NOT NULL AND k<>p_automation_key THEN CONTINUE; END IF;
   IF k IN ('pos_consulta_agradecimento','pesquisa_satisfacao') THEN
    IF a.status::text NOT IN ('finalizado','aguardando_pagamento_adicional') OR a.jornada_finalizada_em IS NULL THEN CONTINUE; END IF;
    due:=a.jornada_finalizada_em+CASE k WHEN 'pesquisa_satisfacao' THEN interval '24 hours' ELSE interval '1 hour' END;
    msg:=CASE k WHEN 'pesquisa_satisfacao' THEN format('Olá, %s! Como foi seu atendimento na %s? Responda com uma nota de 1 a 5 (1 = muito insatisfeito, 5 = muito satisfeito). Você também pode avaliar no portal do paciente.',a.paciente_nome,a.clinica_nome)
      ELSE format('Olá, %s! A %s agradece pela sua visita. Siga as orientações recebidas no atendimento. Se precisar de ajuda ou agendar seu retorno, fale com nossa equipe.',a.paciente_nome,a.clinica_nome) END;
    total:=total+enfileirar_mensagem_jornada(a.clinica_id,a.paciente_id,k,a.id::text,msg,due,extra);
   ELSE
    IF a.status::text NOT IN ('agendado','confirmado') OR (a.data+a.hora_inicio) AT TIME ZONE 'America/Sao_Paulo'<=now() THEN CONTINUE; END IF;
    IF k='confirmacao_agendamento' THEN
      IF p_agendamento_id IS NULL AND a.created_at<now()-interval '24 hours' THEN CONTINUE; END IF;
      due:=now();
    ELSE
      due:=(a.data+a.hora_inicio) AT TIME ZONE 'America/Sao_Paulo'-CASE k WHEN 'lembrete_consulta_24h' THEN interval '24 hours' ELSE interval '2 hours' END;
      IF due<now()-interval '1 hour' THEN CONTINUE; END IF;
    END IF;
    msg:=format('Olá, %s! %s na %s: %s às %s, com %s. Responda CONFIRMAR para confirmar presença, CANCELAR para cancelar ou REMARCAR para escolher outro horário.',
      a.paciente_nome,CASE k WHEN 'confirmacao_agendamento' THEN 'Seu agendamento foi recebido' ELSE 'Lembrete da consulta' END,
      a.clinica_nome,to_char(a.data,'DD/MM/YYYY'),to_char(a.hora_inicio,'HH24:MI'),coalesce(a.medico_nome,'nossa equipe'));
    total:=total+enfileirar_mensagem_jornada(a.clinica_id,a.paciente_id,k,slot,msg,greatest(now(),due),extra,
      'appointment:'||a.id||':'||CASE k WHEN 'confirmacao_agendamento' THEN 'confirmation' WHEN 'lembrete_consulta_24h' THEN '24h' ELSE '2h' END);
   END IF;
  END LOOP;
 END LOOP;
 END IF;
 IF p_agendamento_id IS NULL AND p_resultado_id IS NULL AND (p_automation_key IS NULL OR p_automation_key='lembrete_retorno') THEN
  FOR r IN SELECT rt.*,p.nome AS paciente_nome,c.nome AS clinica_nome FROM retornos rt
    JOIN pacientes p ON p.id=rt.paciente_id AND p.clinica_id=rt.clinica_id JOIN clinicas c ON c.id=rt.clinica_id
    WHERE rt.status IN ('pendente','agendado','confirmado') AND rt.data_retorno_prevista>=local_hoje
      AND (p_clinica_id IS NULL OR rt.clinica_id=p_clinica_id)
  LOOP
   FOREACH dias IN ARRAY ARRAY[7,1] LOOP
    due:=((r.data_retorno_prevista-dias)+time '09:00') AT TIME ZONE 'America/Sao_Paulo';
    IF due<now()-interval '1 day' THEN CONTINUE; END IF;
    msg:=format('Olá, %s! Seu retorno na %s está previsto para %s. Fale com nossa equipe para agendar ou confirmar o horário.',r.paciente_nome,r.clinica_nome,to_char(r.data_retorno_prevista,'DD/MM/YYYY'));
    total:=total+enfileirar_mensagem_jornada(r.clinica_id,r.paciente_id,'lembrete_retorno',r.id||':'||r.data_retorno_prevista||':'||dias,msg,greatest(now(),due),
      jsonb_build_object('retorno_id',r.id,'return_date',r.data_retorno_prevista,'dias_antes',dias));
   END LOOP;
  END LOOP;
 END IF;
 IF p_agendamento_id IS NULL AND (p_automation_key IS NULL OR p_automation_key='notificacao_resultado_exame') THEN
  FOR r IN SELECT x.id,c.paciente_id,c.clinica_id,p.nome AS paciente_nome,cl.nome AS clinica_nome
    FROM resultados_laboratorio x JOIN coletas_laboratorio c ON c.id=x.coleta_id
    JOIN pacientes p ON p.id=c.paciente_id AND p.clinica_id=c.clinica_id JOIN clinicas cl ON cl.id=c.clinica_id
    WHERE x.liberado AND x.data_liberacao IS NOT NULL AND (p_clinica_id IS NULL OR c.clinica_id=p_clinica_id)
      AND (x.id=p_resultado_id OR (p_resultado_id IS NULL AND x.data_liberacao>now()-interval '2 days'))
  LOOP
   total:=total+enfileirar_mensagem_jornada(r.clinica_id,r.paciente_id,'notificacao_resultado_exame',r.id::text,
    format('Olá, %s! Um resultado de exame está disponível na %s. Acesse o portal do paciente com sua identificação ou entre em contato com nossa equipe. Por privacidade, não enviamos o resultado por esta mensagem.',r.paciente_nome,r.clinica_nome),now(),jsonb_build_object('resultado_id',r.id));
  END LOOP;
 END IF;
 RETURN jsonb_build_object('enfileirados',total,'agendados',(
  SELECT count(*) FROM notification_queue q WHERE q.clinica_id=p_clinica_id AND q.status IN ('pendente','enviando')
   AND (q.dados_extras->>'agendamento_id'=p_agendamento_id::text OR q.dados_extras->>'resultado_id'=p_resultado_id::text)
   AND (p_automation_key IS NULL OR q.dados_extras->>'automation_key'=p_automation_key)),
  'enviados', (SELECT count(*) FROM notification_queue q WHERE q.clinica_id=p_clinica_id AND q.status='enviado'
   AND (q.dados_extras->>'agendamento_id'=p_agendamento_id::text OR q.dados_extras->>'resultado_id'=p_resultado_id::text)
   AND (p_automation_key IS NULL OR q.dados_extras->>'automation_key'=p_automation_key)));
END; $$;

-- Called immediately before the provider: disabled settings and stale source state fail closed.
CREATE OR REPLACE FUNCTION public.validar_notificacao_jornada(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q notification_queue%ROWTYPE; k text; valid boolean;
BEGIN
 SELECT * INTO q FROM notification_queue WHERE id=p_id;
 IF NOT FOUND THEN RETURN false; END IF;
 IF q.dados_extras->>'journey' IS DISTINCT FROM 'true' THEN RETURN true; END IF;
 k:=q.dados_extras->>'automation_key';
 SELECT EXISTS(SELECT 1 FROM automation_settings s WHERE s.clinica_id=q.clinica_id AND s.chave=k AND s.ativo
   AND s.valor->>q.tipo IS DISTINCT FROM 'false') INTO valid;
 valid:=valid AND EXISTS(SELECT 1 FROM pacientes p WHERE p.id=q.destinatario_id AND p.clinica_id=q.clinica_id
   AND CASE q.tipo WHEN 'email' THEN p.email=q.destinatario_email ELSE p.telefone=q.destinatario_telefone END);
 IF q.dados_extras ? 'agendamento_id' THEN
  valid:=valid AND EXISTS(SELECT 1 FROM agendamentos a WHERE a.id::text=q.dados_extras->>'agendamento_id' AND a.clinica_id=q.clinica_id AND a.paciente_id=q.destinatario_id
   AND CASE WHEN k IN ('pesquisa_satisfacao','pos_consulta_agradecimento') THEN a.status::text IN ('finalizado','aguardando_pagamento_adicional')
    ELSE a.status::text IN ('agendado','confirmado') AND a.data||'T'||a.hora_inicio=q.dados_extras->>'appointment_slot' AND a.jornada_versao::text=q.dados_extras->>'appointment_version'
      AND (a.data+a.hora_inicio) AT TIME ZONE 'America/Sao_Paulo'>now() END);
 ELSIF q.dados_extras ? 'retorno_id' THEN
  valid:=valid AND EXISTS(SELECT 1 FROM retornos r WHERE r.id::text=q.dados_extras->>'retorno_id' AND r.clinica_id=q.clinica_id AND r.paciente_id=q.destinatario_id
   AND r.status IN ('pendente','agendado','confirmado') AND r.data_retorno_prevista::text=q.dados_extras->>'return_date');
 ELSIF q.dados_extras ? 'resultado_id' THEN
  valid:=valid AND EXISTS(SELECT 1 FROM resultados_laboratorio x JOIN coletas_laboratorio c ON c.id=x.coleta_id
   WHERE x.id::text=q.dados_extras->>'resultado_id' AND c.clinica_id=q.clinica_id AND c.paciente_id=q.destinatario_id AND x.liberado AND x.data_liberacao IS NOT NULL);
 ELSE valid:=false;
 END IF;
 IF NOT coalesce(valid,false) THEN
   UPDATE notification_queue SET status='cancelado' WHERE id=q.id AND status IN ('pendente','enviando');
 END IF;
 RETURN coalesce(valid,false);
END; $$;

CREATE OR REPLACE FUNCTION public.jornada_agendamento_antes()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.data,NEW.hora_inicio,NEW.paciente_id,NEW.medico_id) IS DISTINCT FROM (OLD.data,OLD.hora_inicio,OLD.paciente_id,OLD.medico_id) THEN
   NEW.jornada_versao:=OLD.jornada_versao+1;
 END IF;
 IF NEW.status::text IN ('finalizado','aguardando_pagamento_adicional') AND NEW.jornada_finalizada_em IS NULL THEN
   NEW.jornada_finalizada_em:=now();
 END IF;
 RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION public.jornada_paciente_evento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q record;
BEGIN
 IF TG_TABLE_NAME='agendamentos' THEN
   FOR q IN SELECT id FROM notification_queue WHERE clinica_id=NEW.clinica_id AND dados_extras->>'agendamento_id'=NEW.id::text AND status='pendente' LOOP
    PERFORM validar_notificacao_jornada(q.id);
   END LOOP;
   PERFORM enfileirar_jornada_paciente(NEW.clinica_id,NEW.id);
 ELSIF TG_TABLE_NAME='retornos' THEN
   FOR q IN SELECT id FROM notification_queue WHERE dados_extras->>'retorno_id'=NEW.id::text AND status='pendente' LOOP
    PERFORM validar_notificacao_jornada(q.id);
   END LOOP;
   PERFORM enfileirar_jornada_paciente(NEW.clinica_id,NULL,NULL,'lembrete_retorno');
 ELSE
   FOR q IN SELECT id FROM notification_queue WHERE dados_extras->>'resultado_id'=NEW.id::text AND status='pendente' LOOP
    PERFORM validar_notificacao_jornada(q.id);
   END LOOP;
   IF NEW.liberado AND NEW.data_liberacao IS NOT NULL THEN
    PERFORM enfileirar_jornada_paciente(c.clinica_id,NULL,NEW.id) FROM coletas_laboratorio c WHERE c.id=NEW.coleta_id;
   END IF;
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS jornada_agendamento_data ON public.agendamentos;
CREATE TRIGGER jornada_agendamento_data BEFORE INSERT OR UPDATE OF status,data,hora_inicio,paciente_id,medico_id ON public.agendamentos FOR EACH ROW EXECUTE FUNCTION public.jornada_agendamento_antes();
DROP TRIGGER IF EXISTS jornada_agendamento_evento ON public.agendamentos;
CREATE TRIGGER jornada_agendamento_evento AFTER INSERT OR UPDATE OF data,hora_inicio,status,paciente_id,medico_id ON public.agendamentos FOR EACH ROW EXECUTE FUNCTION public.jornada_paciente_evento();
DROP TRIGGER IF EXISTS jornada_retorno_evento ON public.retornos;
CREATE TRIGGER jornada_retorno_evento AFTER INSERT OR UPDATE OF data_retorno_prevista,status,paciente_id ON public.retornos FOR EACH ROW EXECUTE FUNCTION public.jornada_paciente_evento();
DROP TRIGGER IF EXISTS jornada_resultado_evento ON public.resultados_laboratorio;
CREATE TRIGGER jornada_resultado_evento AFTER INSERT OR UPDATE OF liberado,data_liberacao ON public.resultados_laboratorio FOR EACH ROW EXECUTE FUNCTION public.jornada_paciente_evento();

-- Preserve the existing daily return cron, with the same atomic producer and opt-in rules.
CREATE OR REPLACE FUNCTION public.enfileirar_lembretes_retorno()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN RETURN (enfileirar_jornada_paciente(NULL,NULL,NULL,'lembrete_retorno')->>'enfileirados')::integer; END; $$;

CREATE OR REPLACE FUNCTION public.normalizar_telefone_jornada(p_telefone text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE WHEN length(d) IN (10,11) THEN '55'||d
   WHEN length(d) IN (12,13) AND left(d,2)='55' THEN d ELSE NULL END
 FROM (SELECT regexp_replace(p_telefone,'\D','','g') AS d) v;
$$;
CREATE OR REPLACE FUNCTION public.registrar_satisfacao_whatsapp(p_clinica_id uuid,p_telefone text,p_nota integer,p_comentario text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a record;
BEGIN
 IF p_nota IS NULL OR p_nota NOT BETWEEN 1 AND 5 OR normalizar_telefone_jornada(p_telefone) IS NULL THEN RETURN false; END IF;
 IF (SELECT count(*) FROM pacientes p WHERE p.clinica_id=p_clinica_id
   AND normalizar_telefone_jornada(p.telefone)=normalizar_telefone_jornada(p_telefone))<>1 THEN RETURN false; END IF;
 SELECT ag.* INTO a FROM notification_queue q JOIN agendamentos ag ON ag.id::text=q.dados_extras->>'agendamento_id'
   AND ag.clinica_id=q.clinica_id AND ag.paciente_id=q.destinatario_id
   JOIN pacientes p ON p.id=ag.paciente_id AND p.clinica_id=ag.clinica_id
 WHERE q.clinica_id=p_clinica_id AND q.tipo='whatsapp' AND q.status='enviado' AND q.enviado_em>now()-interval '7 days'
   AND q.dados_extras->>'automation_key'='pesquisa_satisfacao' AND ag.status::text IN ('finalizado','aguardando_pagamento_adicional')
   AND normalizar_telefone_jornada(p.telefone)=normalizar_telefone_jornada(p_telefone)
   AND normalizar_telefone_jornada(q.destinatario_telefone)=normalizar_telefone_jornada(p_telefone)
 ORDER BY q.enviado_em DESC LIMIT 1;
 IF NOT FOUND THEN RETURN false; END IF;
 INSERT INTO feedbacks_nps(clinica_id,paciente_id,agendamento_id,medico_id,nota,comentario,categoria)
 VALUES(a.clinica_id,a.paciente_id,a.id,a.medico_id,p_nota,nullif(left(trim(p_comentario),2000),''),'geral')
 ON CONFLICT(agendamento_id) WHERE agendamento_id IS NOT NULL DO NOTHING;
 RETURN FOUND;
END; $$;

REVOKE ALL ON FUNCTION public.enfileirar_mensagem_jornada(uuid,uuid,text,text,text,timestamptz,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.enfileirar_jornada_paciente(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.validar_notificacao_jornada(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.registrar_satisfacao_whatsapp(uuid,text,integer,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.enfileirar_lembretes_retorno() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.jornada_paciente_evento() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.jornada_agendamento_antes() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enfileirar_jornada_paciente(uuid,uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.validar_notificacao_jornada(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_satisfacao_whatsapp(uuid,text,integer,text) TO service_role;
COMMIT;
