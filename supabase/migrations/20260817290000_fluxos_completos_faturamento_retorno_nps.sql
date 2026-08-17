BEGIN;

-- Avaliação clínica real, isolada por clínica e limitada a uma por atendimento.
ALTER TABLE public.feedbacks_nps ADD COLUMN IF NOT EXISTS clinica_id uuid REFERENCES public.clinicas(id) ON DELETE CASCADE;
UPDATE public.feedbacks_nps f SET clinica_id = p.clinica_id FROM public.pacientes p
 WHERE f.paciente_id = p.id AND f.clinica_id IS NULL;
ALTER TABLE public.feedbacks_nps DROP CONSTRAINT IF EXISTS feedbacks_nps_nota_check;
UPDATE public.feedbacks_nps SET nota = GREATEST(1, LEAST(5, ceil(nota / 2.0)::integer)) WHERE nota > 5;
ALTER TABLE public.feedbacks_nps ADD CONSTRAINT feedbacks_nps_nota_check CHECK (nota BETWEEN 1 AND 5);
CREATE UNIQUE INDEX IF NOT EXISTS feedbacks_nps_um_por_agendamento
  ON public.feedbacks_nps(agendamento_id) WHERE agendamento_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS feedbacks_nps_clinica_created ON public.feedbacks_nps(clinica_id, created_at DESC);

DROP VIEW IF EXISTS public.nps_resumo_mensal;
CREATE VIEW public.nps_resumo_mensal WITH (security_invoker = true) AS
SELECT clinica_id, date_trunc('month', created_at) AS mes, count(*) AS total,
       round(avg(nota)::numeric, 2) AS media,
       count(*) FILTER (WHERE nota = 5) AS promotores,
       count(*) FILTER (WHERE nota IN (3,4)) AS neutros,
       count(*) FILTER (WHERE nota <= 2) AS detratores,
       round(100.0 * (count(*) FILTER (WHERE nota = 5) - count(*) FILTER (WHERE nota <= 2)) / NULLIF(count(*),0)) AS nps_score
  FROM public.feedbacks_nps GROUP BY clinica_id, date_trunc('month', created_at);

-- INSERT público anterior permitia forjar paciente/nota. Escrita passa somente
-- pelo patient-portal (service role); usuários da clínica apenas consultam.
DROP POLICY IF EXISTS nps_insert_policy ON public.feedbacks_nps;
DROP POLICY IF EXISTS "nps_insert_policy" ON public.feedbacks_nps;
DROP POLICY IF EXISTS nps_select_policy ON public.feedbacks_nps;
CREATE POLICY nps_select_clinica ON public.feedbacks_nps FOR SELECT TO authenticated
USING (clinica_id = public.current_clinica_id());

ALTER TABLE public.retornos
  ADD COLUMN IF NOT EXISTS confirmado_em timestamptz,
  ADD COLUMN IF NOT EXISTS agendamento_retorno_id uuid REFERENCES public.agendamentos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lembretes_enviados integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS historico jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Lembretes idempotentes de retorno, 7 dias e 1 dia antes, nos canais disponíveis.
CREATE OR REPLACE FUNCTION public.enfileirar_lembretes_retorno()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_total integer := 0; v_data date; v_msg text;
BEGIN
  FOR r IN
    SELECT rt.*, p.nome, p.email, p.telefone
      FROM retornos rt JOIN pacientes p ON p.id = rt.paciente_id
     WHERE rt.status IN ('pendente','agendado','confirmado')
       AND rt.data_retorno_prevista IN (current_date + 1, current_date + 7)
  LOOP
    v_data := r.data_retorno_prevista;
    v_msg := format('Olá %s, seu retorno está previsto para %s. Confirme ou remarque pelo portal do paciente.', r.nome, to_char(v_data, 'DD/MM/YYYY'));
    IF r.email IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM notification_queue q WHERE q.dados_extras->>'retorno_id' = r.id::text
        AND q.dados_extras->>'dias_antes' = (v_data-current_date)::text AND q.tipo = 'email') THEN
      INSERT INTO notification_queue(tipo,destinatario_id,destinatario_email,destinatario_nome,assunto,conteudo,status,clinica_id,dados_extras)
      VALUES ('email',r.paciente_id,r.email,r.nome,'Lembrete de retorno',v_msg,'pendente',r.clinica_id,
              jsonb_build_object('retorno_id',r.id,'dias_antes',v_data-current_date)); v_total := v_total + 1;
    END IF;
    IF r.telefone IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM notification_queue q WHERE q.dados_extras->>'retorno_id' = r.id::text
        AND q.dados_extras->>'dias_antes' = (v_data-current_date)::text AND q.tipo = 'whatsapp') THEN
      INSERT INTO notification_queue(tipo,destinatario_id,destinatario_telefone,destinatario_nome,conteudo,status,clinica_id,dados_extras)
      VALUES ('whatsapp',r.paciente_id,r.telefone,r.nome,v_msg,'pendente',r.clinica_id,
              jsonb_build_object('retorno_id',r.id,'dias_antes',v_data-current_date)); v_total := v_total + 1;
    END IF;
    UPDATE retornos SET lembrete_enviado = true, lembretes_enviados = lembretes_enviados + 1,
      historico = historico || jsonb_build_array(jsonb_build_object('evento','lembrete_enfileirado','em',now(),'dias_antes',v_data-current_date))
      WHERE id = r.id;
  END LOOP;
  RETURN v_total;
END; $$;
REVOKE ALL ON FUNCTION public.enfileirar_lembretes_retorno() FROM PUBLIC;

SELECT cron.unschedule('lembretes-retorno') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='lembretes-retorno');
SELECT cron.schedule('lembretes-retorno','0 12 * * *',$$SELECT public.enfileirar_lembretes_retorno();$$);

-- Encerramento e criação/validação da cobrança na mesma transação.
DROP FUNCTION IF EXISTS public.finalizar_atendimento_atomico(uuid,uuid,boolean,integer);
CREATE OR REPLACE FUNCTION public.finalizar_atendimento_atomico(
  p_agendamento_id uuid, p_fila_id uuid DEFAULT NULL,
  p_agendar_retorno boolean DEFAULT false, p_dias_retorno integer DEFAULT NULL,
  p_tipo_exame text DEFAULT NULL
)
RETURNS TABLE(status_agendamento text, retorno_id uuid, cobranca_criada boolean)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE a agendamentos%ROWTYPE; pac_nome text; v_tipo tipos_consulta%ROWTYPE;
  v_valor numeric; v_valor_convenio numeric; v_categoria text := 'consulta'; v_desc text; v_retorno uuid;
  v_status text := 'finalizado'; v_exige boolean := false; v_criada boolean := false;
BEGIN
  SELECT * INTO a FROM agendamentos WHERE id=p_agendamento_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agendamento não encontrado ou fora da sua clínica'; END IF;
  SELECT nome INTO pac_nome FROM pacientes WHERE id=a.paciente_id;
  IF p_fila_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM fila_atendimento WHERE id=p_fila_id AND agendamento_id=a.id FOR UPDATE)
    THEN RAISE EXCEPTION 'Item da fila não pertence ao agendamento'; END IF;

  IF NOT EXISTS(SELECT 1 FROM lancamentos WHERE agendamento_id=a.id) THEN
    IF a.tipo='exame' OR NULLIF(trim(p_tipo_exame),'') IS NOT NULL THEN
      v_categoria := 'exame'; v_desc := COALESCE(NULLIF(trim(p_tipo_exame),''),'Exame');
      IF a.convenio_id IS NOT NULL THEN
        SELECT COALESCE(NULLIF(valor_total,0),NULLIF(valor_tabela,0)) INTO v_valor FROM precos_exames_convenio
         WHERE convenio_id=a.convenio_id AND ativo AND tipo_exame ILIKE v_desc LIMIT 1;
      END IF;
      IF v_valor IS NULL THEN SELECT preco_venda INTO v_valor FROM tipo_exames_catalog
        WHERE clinica_id=a.clinica_id AND ativo AND nome ILIKE v_desc LIMIT 1; END IF;
      IF COALESCE(v_valor,0)<=0 THEN RAISE EXCEPTION 'Não há preço cadastrado para o exame "%"',v_desc; END IF;
    ELSE
      SELECT * INTO v_tipo FROM tipos_consulta WHERE clinica_id=a.clinica_id AND ativo AND nome ILIKE a.tipo LIMIT 1;
      IF NOT FOUND THEN RAISE EXCEPTION 'Não há preço cadastrado para a consulta "%"',a.tipo; END IF;
      v_valor := v_tipo.valor_particular; v_desc := v_tipo.nome;
      IF a.convenio_id IS NOT NULL THEN SELECT valor INTO v_valor_convenio FROM precos_consulta_convenio
        WHERE clinica_id=a.clinica_id AND convenio_id=a.convenio_id AND tipo_consulta_id=v_tipo.id AND ativo LIMIT 1; END IF;
      v_valor := COALESCE(v_valor_convenio, v_valor);
      IF COALESCE(v_valor,0)<=0 THEN v_valor := NULL; END IF; -- tipo gratuito cadastrado
    END IF;
    IF v_valor IS NOT NULL THEN
      INSERT INTO lancamentos(tipo,categoria,descricao,valor,data,data_vencimento,status,paciente_id,agendamento_id,clinica_id)
      VALUES('receita',v_categoria,v_desc||' - '||pac_nome,v_valor,current_date,current_date,'pendente',a.paciente_id,a.id,a.clinica_id);
      v_criada := true;
    END IF;
  END IF;

  SELECT COALESCE(exigir_pagamento_previo,false) INTO v_exige FROM clinicas WHERE id=a.clinica_id;
  IF v_exige AND COALESCE(saldo_devedor_do_agendamento(a.id),0)>0.009 THEN v_status := 'aguardando_pagamento_adicional'; END IF;
  UPDATE agendamentos SET status=v_status::status_agendamento WHERE id=a.id;
  IF p_fila_id IS NOT NULL THEN UPDATE fila_atendimento SET status='finalizado' WHERE id=p_fila_id; END IF;
  IF p_agendar_retorno THEN
    IF p_dias_retorno IS NULL OR p_dias_retorno NOT BETWEEN 1 AND 730 THEN RAISE EXCEPTION 'Prazo do retorno deve estar entre 1 e 730 dias'; END IF;
    SELECT id INTO v_retorno FROM retornos WHERE agendamento_id=a.id AND status<>'cancelado' ORDER BY created_at DESC LIMIT 1;
    IF v_retorno IS NULL THEN INSERT INTO retornos(paciente_id,medico_id,data_retorno_prevista,data_consulta_origem,motivo,status,agendamento_id,clinica_id,historico)
      VALUES(a.paciente_id,a.medico_id,current_date+p_dias_retorno,current_date,'Retorno de '||a.tipo,'pendente',a.id,a.clinica_id,
        jsonb_build_array(jsonb_build_object('evento','criado','em',now()))) RETURNING id INTO v_retorno; END IF;
  END IF;
  RETURN QUERY SELECT v_status,v_retorno,v_criada;
END; $$;
REVOKE ALL ON FUNCTION public.finalizar_atendimento_atomico(uuid,uuid,boolean,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalizar_atendimento_atomico(uuid,uuid,boolean,integer,text) TO authenticated;

COMMIT;
