BEGIN;

CREATE TABLE IF NOT EXISTS public.predicoes_no_show (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id uuid REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  probabilidade_no_show numeric(3,2) NOT NULL CHECK(probabilidade_no_show BETWEEN 0 AND 1),
  motivos_risco text[] NOT NULL DEFAULT '{}',
  recomendacoes text,
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.predicoes_no_show ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS predicoes_no_show_clinica ON public.predicoes_no_show;
DROP POLICY IF EXISTS "Clinica acessa predicoes" ON public.predicoes_no_show;
CREATE POLICY predicoes_no_show_clinica ON public.predicoes_no_show FOR SELECT TO authenticated
  USING(clinica_id=public.current_clinica_id());

ALTER TABLE public.predicoes_no_show ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DELETE FROM public.predicoes_no_show a USING public.predicoes_no_show b
 WHERE a.agendamento_id=b.agendamento_id AND a.created_at<b.created_at;
CREATE UNIQUE INDEX IF NOT EXISTS predicoes_no_show_agendamento_unico ON public.predicoes_no_show(agendamento_id);
CREATE INDEX IF NOT EXISTS predicoes_no_show_clinica_risco ON public.predicoes_no_show(clinica_id,probabilidade_no_show DESC);

CREATE OR REPLACE FUNCTION public.atualizar_predicoes_no_show()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a record; total_hist integer; faltas integer; cancelados integer; risco numeric; motivos text[]; recomendacoes text[]; processados integer:=0;
BEGIN
  DELETE FROM predicoes_no_show p WHERE NOT EXISTS(
    SELECT 1 FROM agendamentos agx WHERE agx.id=p.agendamento_id AND agx.data>=current_date AND agx.status IN('agendado','confirmado'));

  FOR a IN SELECT ag.*,p.nome,p.email,p.telefone,m.nome AS medico_nome
    FROM agendamentos ag JOIN pacientes p ON p.id=ag.paciente_id JOIN medicos m ON m.id=ag.medico_id
   WHERE ag.data>=current_date AND ag.status IN('agendado','confirmado')
  LOOP
    SELECT count(*),count(*) FILTER(WHERE status='faltou'),count(*) FILTER(WHERE status='cancelado')
      INTO total_hist,faltas,cancelados FROM agendamentos
     WHERE paciente_id=a.paciente_id AND id<>a.id AND data<a.data AND status IN('finalizado','faltou','cancelado');
    risco:=0.08; motivos:=ARRAY[]::text[]; recomendacoes:=ARRAY[]::text[];
    IF total_hist=0 THEN risco:=risco+0.10; motivos:=array_append(motivos,'Paciente sem histórico suficiente'); END IF;
    IF faltas>0 THEN risco:=risco+LEAST(0.50,(faltas::numeric/GREATEST(total_hist,1))*0.65); motivos:=array_append(motivos,format('%s falta(s) em %s atendimento(s)',faltas,total_hist)); END IF;
    IF cancelados>=2 THEN risco:=risco+LEAST(0.12,cancelados*0.025); motivos:=array_append(motivos,format('%s cancelamentos anteriores',cancelados)); END IF;
    IF a.status='agendado' THEN risco:=risco+0.18; motivos:=array_append(motivos,'Presença ainda não confirmada'); recomendacoes:=array_append(recomendacoes,'Solicitar confirmação'); END IF;
    IF a.data-current_date>14 THEN risco:=risco+0.08; motivos:=array_append(motivos,'Agendado com grande antecedência'); END IF;
    IF extract(hour FROM a.hora_inicio)>=17 THEN risco:=risco+0.05; motivos:=array_append(motivos,'Horário no fim do dia'); END IF;
    IF extract(isodow FROM a.data)=5 AND extract(hour FROM a.hora_inicio)>=15 THEN risco:=risco+0.05; motivos:=array_append(motivos,'Sexta-feira à tarde'); END IF;
    risco:=round(LEAST(0.95,GREATEST(0.03,risco)),2);
    IF risco>=0.70 THEN recomendacoes:=array_append(array_append(recomendacoes,'Contato ativo da recepção'),'Oferecer remarcação se necessário');
    ELSIF risco>=0.40 THEN recomendacoes:=array_append(recomendacoes,'Reforçar lembrete 24 horas antes');
    ELSE recomendacoes:=array_append(recomendacoes,'Lembrete padrão'); END IF;

    INSERT INTO predicoes_no_show(agendamento_id,paciente_id,probabilidade_no_show,motivos_risco,recomendacoes,clinica_id,updated_at)
    VALUES(a.id,a.paciente_id,risco,motivos,array_to_string(recomendacoes,' • '),a.clinica_id,now())
    ON CONFLICT(agendamento_id) DO UPDATE SET probabilidade_no_show=excluded.probabilidade_no_show,motivos_risco=excluded.motivos_risco,
      recomendacoes=excluded.recomendacoes,clinica_id=excluded.clinica_id,updated_at=now();

    IF risco>=0.70 AND a.data BETWEEN current_date AND current_date+2 AND NOT EXISTS(
      SELECT 1 FROM notification_queue q WHERE q.dados_extras @> jsonb_build_object('tipo_notificacao','prevencao_no_show','agendamento_id',a.id)
        AND q.created_at>now()-interval '20 hours') THEN
      IF a.telefone IS NOT NULL THEN INSERT INTO notification_queue(tipo,destinatario_id,destinatario_telefone,destinatario_nome,assunto,conteudo,status,clinica_id,dados_extras)
        VALUES('whatsapp',a.paciente_id,a.telefone,a.nome,'Confirmação de consulta',format('Olá %s! Podemos confirmar sua consulta com Dr(a). %s em %s às %s?',a.nome,a.medico_nome,to_char(a.data,'DD/MM/YYYY'),to_char(a.hora_inicio,'HH24:MI')),'pendente',a.clinica_id,jsonb_build_object('tipo_notificacao','prevencao_no_show','agendamento_id',a.id,'risco',risco)); END IF;
      IF a.telefone IS NULL AND a.email IS NOT NULL THEN INSERT INTO notification_queue(tipo,destinatario_id,destinatario_email,destinatario_nome,assunto,conteudo,status,clinica_id,dados_extras)
        VALUES('email',a.paciente_id,a.email,a.nome,'Confirme sua consulta',format('Olá %s! Confirme sua consulta com Dr(a). %s em %s às %s.',a.nome,a.medico_nome,to_char(a.data,'DD/MM/YYYY'),to_char(a.hora_inicio,'HH24:MI')),'pendente',a.clinica_id,jsonb_build_object('tipo_notificacao','prevencao_no_show','agendamento_id',a.id,'risco',risco)); END IF;
    END IF;
    processados:=processados+1;
  END LOOP; RETURN processados;
END; $$;
REVOKE ALL ON FUNCTION public.atualizar_predicoes_no_show() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.enfileirar_lembrete_risco(p_agendamento_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE a record; inseriu boolean:=false;
BEGIN
  SELECT ag.*,p.nome,p.email,p.telefone,m.nome AS medico_nome INTO a FROM agendamentos ag
    JOIN pacientes p ON p.id=ag.paciente_id JOIN medicos m ON m.id=ag.medico_id
   WHERE ag.id=p_agendamento_id AND ag.data>=current_date AND ag.status IN('agendado','confirmado');
  IF NOT FOUND THEN RAISE EXCEPTION 'Agendamento não encontrado na sua clínica'; END IF;
  IF EXISTS(SELECT 1 FROM notification_queue q WHERE q.dados_extras @> jsonb_build_object('tipo_notificacao','lembrete_risco_manual','agendamento_id',a.id)
    AND q.created_at>now()-interval '20 hours') THEN RETURN false; END IF;
  IF a.telefone IS NOT NULL THEN INSERT INTO notification_queue(tipo,destinatario_id,destinatario_telefone,destinatario_nome,assunto,conteudo,status,clinica_id,dados_extras)
    VALUES('whatsapp',a.paciente_id,a.telefone,a.nome,'Lembrete de consulta',format('Olá %s! Lembramos sua consulta com Dr(a). %s em %s às %s. Responda para confirmar.',a.nome,a.medico_nome,to_char(a.data,'DD/MM/YYYY'),to_char(a.hora_inicio,'HH24:MI')),'pendente',a.clinica_id,jsonb_build_object('tipo_notificacao','lembrete_risco_manual','agendamento_id',a.id)); inseriu:=true; END IF;
  IF a.email IS NOT NULL THEN INSERT INTO notification_queue(tipo,destinatario_id,destinatario_email,destinatario_nome,assunto,conteudo,status,clinica_id,dados_extras)
    VALUES('email',a.paciente_id,a.email,a.nome,'Lembrete de consulta',format('Olá %s! Lembramos sua consulta com Dr(a). %s em %s às %s.',a.nome,a.medico_nome,to_char(a.data,'DD/MM/YYYY'),to_char(a.hora_inicio,'HH24:MI')),'pendente',a.clinica_id,jsonb_build_object('tipo_notificacao','lembrete_risco_manual','agendamento_id',a.id)); inseriu:=true; END IF;
  RETURN inseriu;
END; $$;
REVOKE ALL ON FUNCTION public.enfileirar_lembrete_risco(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enfileirar_lembrete_risco(uuid) TO authenticated;

SELECT cron.unschedule('atualizar-risco-no-show') WHERE EXISTS(SELECT 1 FROM cron.job WHERE jobname='atualizar-risco-no-show');
SELECT cron.schedule('atualizar-risco-no-show','15 * * * *',$$SELECT public.atualizar_predicoes_no_show();$$);
SELECT public.atualizar_predicoes_no_show();

COMMIT;
