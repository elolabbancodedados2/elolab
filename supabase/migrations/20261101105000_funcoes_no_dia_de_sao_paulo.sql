-- Funções que usavam current_date passam a usar o dia de São Paulo.
--
-- O banco roda em UTC: das 21h à meia-noite, current_date já é o dia seguinte.
-- Retorno agendado pela finalização, cobrança automática, data de realização
-- de exame e outros pegavam a data errada nesse horário.
-- Funções alteradas (11): atualizar_meu_perfil_medico, auto_billing_on_appointment_complete, carimba_resultado_do_exame, convocar_lista_espera_apos_cancelamento, finalizar_atendimento_atomico, indicadores_produtividade, lancar_item_no_atendimento, platform_get_clinicas_saude, recalcular_conta, registrar_prescricao_memed_local, substituir_prescricoes_do_prontuario.
-- Substituições: 17. O restante do corpo é o mesmo de produção em 01/11/2026.

CREATE OR REPLACE FUNCTION public.atualizar_meu_perfil_medico(p_especialidade text, p_rqe text, p_email text, p_telefone text, p_cpf text, p_data_nascimento date, p_foto_url text, p_carimbo_url text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
  v_cpf text := NULLIF(regexp_replace(COALESCE(p_cpf, ''), '[^0-9]', '', 'g'), '');
BEGIN
  SELECT m.id INTO v_id
    FROM public.medicos AS m
   WHERE m.user_id = auth.uid()
     AND m.clinica_id = public.get_my_clinica_id()
     AND m.ativo IS NOT FALSE
   FOR UPDATE;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Cadastro de médico não encontrado para este usuário';
  END IF;

  IF v_cpf IS NOT NULL AND length(v_cpf) <> 11 THEN
    RAISE EXCEPTION 'CPF deve ter 11 dígitos';
  END IF;

  IF p_data_nascimento IS NOT NULL
     AND (p_data_nascimento > (now() AT TIME ZONE 'America/Sao_Paulo')::date OR p_data_nascimento < date '1900-01-01') THEN
    RAISE EXCEPTION 'Data de nascimento inválida';
  END IF;

  -- Arquivos ficam em patient-photos/<medico_id>/..., a pasta que a política
  -- do bucket libera. Recusar outro caminho impede apontar para arquivo alheio.
  IF NULLIF(p_foto_url, '') IS NOT NULL AND p_foto_url NOT LIKE v_id::text || '/%' THEN
    RAISE EXCEPTION 'Caminho de foto inválido';
  END IF;
  IF NULLIF(p_carimbo_url, '') IS NOT NULL AND p_carimbo_url NOT LIKE v_id::text || '/%' THEN
    RAISE EXCEPTION 'Caminho de carimbo inválido';
  END IF;

  UPDATE public.medicos
     SET especialidade   = NULLIF(trim(p_especialidade), ''),
         rqe             = NULLIF(trim(p_rqe), ''),
         email           = NULLIF(trim(p_email), ''),
         telefone        = NULLIF(trim(p_telefone), ''),
         cpf             = v_cpf,
         data_nascimento = p_data_nascimento,
         foto_url        = NULLIF(p_foto_url, ''),
         carimbo_url     = NULLIF(p_carimbo_url, ''),
         updated_at      = now()
   WHERE id = v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_billing_on_appointment_complete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_paciente_nome TEXT;
  v_medico_crm TEXT;
  v_convenio_valor NUMERIC;
  v_descricao TEXT;
BEGIN
  IF NEW.status = 'finalizado' AND (OLD.status IS NULL OR OLD.status != 'finalizado') THEN
    SELECT nome INTO v_paciente_nome FROM public.pacientes WHERE id = NEW.paciente_id;
    SELECT crm INTO v_medico_crm FROM public.medicos WHERE id = NEW.medico_id;
    SELECT c.valor_consulta INTO v_convenio_valor
    FROM public.pacientes p
    LEFT JOIN public.convenios c ON p.convenio_id = c.id
    WHERE p.id = NEW.paciente_id;
    
    v_descricao := 'Consulta - ' || COALESCE(v_paciente_nome, 'Paciente') || ' - ' || COALESCE(NEW.tipo, 'Consulta');
    
    INSERT INTO public.lancamentos (
      tipo, categoria, descricao, valor, data, data_vencimento, status, paciente_id, agendamento_id, forma_pagamento
    ) VALUES (
      'receita', 'consulta', v_descricao,
      COALESCE(v_convenio_valor, 150.00),
      (now() AT TIME ZONE 'America/Sao_Paulo')::date, (now() AT TIME ZONE 'America/Sao_Paulo')::date, 'pendente',
      NEW.paciente_id, NEW.id, NULL
    );
    
    INSERT INTO public.automation_logs (tipo, nome, status, registros_processados, registros_sucesso, detalhes)
    VALUES ('faturamento', 'Faturamento Automático', 'sucesso', 1, 1,
      jsonb_build_object('agendamento_id', NEW.id, 'paciente_id', NEW.paciente_id, 'valor', COALESCE(v_convenio_valor, 150.00))
    );
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.carimba_resultado_do_exame()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tinha boolean;
BEGIN
  v_tinha := TG_OP = 'UPDATE'
    AND (COALESCE(btrim(OLD.resultado), '') <> '' OR COALESCE(btrim(OLD.arquivo_resultado), '') <> '');

  -- Só carimba quando o resultado APARECE. Editar um resultado já lançado
  -- mantém a autoria original: quem corrigiu texto não vira autor do exame.
  IF NOT v_tinha
     AND (COALESCE(btrim(NEW.resultado), '') <> '' OR COALESCE(btrim(NEW.arquivo_resultado), '') <> '')
  THEN
    NEW.resultado_em  := now();
    NEW.resultado_por := auth.uid();
    IF NEW.data_realizacao IS NULL THEN
      NEW.data_realizacao := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.convocar_lista_espera_apos_cancelamento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  candidato record;
  paciente record;
  medico_nome text;
  mensagem text;
BEGIN
  IF NEW.status <> 'cancelado' OR OLD.status = 'cancelado' OR NEW.data < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RETURN NEW;
  END IF;

  SELECT m.nome INTO medico_nome
    FROM public.medicos m
   WHERE m.id = NEW.medico_id AND m.clinica_id = NEW.clinica_id;

  FOR candidato IN
    SELECT le.id, le.paciente_id
      FROM public.lista_espera le
      JOIN public.pacientes p ON p.id = le.paciente_id AND p.clinica_id = le.clinica_id
     WHERE le.clinica_id = NEW.clinica_id
       AND le.status = 'aguardando'
       AND (le.medico_id = NEW.medico_id OR (
         le.medico_id IS NULL
         AND (le.especialidade IS NULL OR le.especialidade = (
           SELECT m.especialidade FROM public.medicos m
            WHERE m.id = NEW.medico_id AND m.clinica_id = NEW.clinica_id
         ))
       ))
     ORDER BY CASE le.prioridade WHEN 'urgente' THEN 1 WHEN 'preferencial' THEN 2 ELSE 3 END,
              le.created_at
     FOR UPDATE OF le SKIP LOCKED
     LIMIT 3
  LOOP
    SELECT p.nome, p.email, p.telefone
      INTO paciente
      FROM public.pacientes p
     WHERE p.id = candidato.paciente_id AND p.clinica_id = NEW.clinica_id;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    mensagem := format(
      'Uma vaga abriu com Dr(a). %s em %s as %s. A oferta fica disponivel por 2 horas no portal.',
      COALESCE(medico_nome, ''), to_char(NEW.data, 'DD/MM/YYYY'), to_char(NEW.hora_inicio, 'HH24:MI')
    );

    IF paciente.telefone IS NOT NULL THEN
      INSERT INTO public.notification_queue(tipo, destinatario_id, destinatario_telefone, destinatario_nome,
        assunto, conteudo, status, clinica_id, dados_extras)
      VALUES('whatsapp', candidato.paciente_id, paciente.telefone, paciente.nome, 'Vaga disponivel', mensagem,
        'pendente', NEW.clinica_id, jsonb_build_object('tipo', 'vaga_lista_espera',
        'lista_espera_id', candidato.id, 'agendamento_cancelado_id', NEW.id));
    END IF;

    IF paciente.email IS NOT NULL THEN
      INSERT INTO public.notification_queue(tipo, destinatario_id, destinatario_email, destinatario_nome,
        assunto, conteudo, status, clinica_id, dados_extras)
      VALUES('email', candidato.paciente_id, paciente.email, paciente.nome, 'Vaga disponivel na agenda', mensagem,
        'pendente', NEW.clinica_id, jsonb_build_object('tipo', 'vaga_lista_espera',
        'lista_espera_id', candidato.id, 'agendamento_cancelado_id', NEW.id));
    END IF;

    IF paciente.telefone IS NOT NULL OR paciente.email IS NOT NULL THEN
      UPDATE public.lista_espera
         SET status = 'notificado', oferta_agendamento_id = NEW.id,
             oferta_expira_em = now() + interval '2 hours',
             observacoes = concat_ws(E'\n', observacoes,
               format('Vaga oferecida em %s para %s %s', now(), NEW.data, NEW.hora_inicio))
       WHERE id = candidato.id AND clinica_id = NEW.clinica_id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.finalizar_atendimento_atomico(p_agendamento_id uuid, p_fila_id uuid DEFAULT NULL::uuid, p_agendar_retorno boolean DEFAULT false, p_dias_retorno integer DEFAULT NULL::integer, p_tipo_exame text DEFAULT NULL::text)
 RETURNS TABLE(status_agendamento text, retorno_id uuid, cobranca_criada boolean, repetido boolean)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  a public.agendamentos%ROWTYPE;
  v_fila public.fila_atendimento%ROWTYPE;
  pac_nome text;
  pac_convenio uuid;
  v_tipo public.tipos_consulta%ROWTYPE;
  v_valor numeric;
  v_valor_convenio numeric;
  v_categoria text := 'consulta';
  v_desc text;
  v_retorno uuid;
  v_status text := 'finalizado';
  v_exige boolean := false;
  v_criada boolean := false;
BEGIN
  SELECT * INTO a
    FROM public.agendamentos
   WHERE id = p_agendamento_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado ou fora da sua clínica';
  END IF;

  IF p_fila_id IS NOT NULL THEN
    SELECT * INTO v_fila
      FROM public.fila_atendimento
     WHERE id = p_fila_id AND agendamento_id = a.id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item da fila não pertence ao agendamento';
    END IF;
  ELSE
    SELECT * INTO v_fila
      FROM public.fila_atendimento
     WHERE agendamento_id = a.id
       AND status::text NOT IN ('finalizado', 'concluido')
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE;
  END IF;

  -- A matching replay is a no-op. In particular, it must not recreate a
  -- charge, return, or overwrite a cancellation made by another session.
  IF a.status::text IN ('finalizado', 'atendimento_finalizado', 'aguardando_pagamento_adicional') THEN
    SELECT id INTO v_retorno
      FROM public.retornos
     WHERE agendamento_id = a.id AND status <> 'cancelado'
     ORDER BY created_at DESC
     LIMIT 1;
    IF v_fila.id IS NOT NULL THEN
      UPDATE public.fila_atendimento SET status = 'finalizado' WHERE id = v_fila.id;
    END IF;
    RETURN QUERY SELECT a.status::text, v_retorno, false, true;
    RETURN;
  END IF;

  IF a.status::text <> 'em_atendimento' THEN
    RAISE EXCEPTION 'Atendimento mudou desde a última atualização. Recarregue a lista antes de tentar novamente.'
      USING ERRCODE = '40001';
  END IF;

  SELECT nome, convenio_id
    INTO pac_nome, pac_convenio
    FROM public.pacientes
   WHERE id = a.paciente_id AND clinica_id = a.clinica_id;

  -- O médico não enxerga `lancamentos` (RLS financeiro). Consultar a tabela
  -- direto aqui devolvia "não há cobrança" para uma consulta já paga, e o
  -- INSERT seguinte batia no índice único: finalizar falhava sempre.
  IF NOT public.agendamento_tem_cobranca_ativa(a.id) THEN
    IF lower(trim(coalesce(a.tipo, ''))) IN ('exame', 'exames')
       OR nullif(trim(p_tipo_exame), '') IS NOT NULL THEN
      v_categoria := 'exame';
      v_desc := coalesce(nullif(trim(p_tipo_exame), ''), 'Exame');
      v_valor := public.resolver_preco_exame(
        a.clinica_id, coalesce(a.convenio_id, pac_convenio), v_desc
      );
      IF coalesce(v_valor, 0) <= 0 THEN
        RAISE EXCEPTION 'Não há preço cadastrado para o exame "%"', v_desc;
      END IF;
    ELSE
      v_desc := CASE
        WHEN lower(trim(coalesce(a.tipo, ''))) IN ('retorno', 'consulta retorno', 'consulta de retorno')
          THEN 'Retorno'
        ELSE a.tipo
      END;
      SELECT * INTO v_tipo
        FROM public.tipos_consulta
       WHERE clinica_id = a.clinica_id AND ativo AND nome ILIKE v_desc
       LIMIT 1;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Não há preço cadastrado para a consulta "%"', v_desc;
      END IF;
      v_valor := v_tipo.valor_particular;
      v_desc := v_tipo.nome;
      IF coalesce(a.convenio_id, pac_convenio) IS NOT NULL THEN
        SELECT valor INTO v_valor_convenio
          FROM public.precos_consulta_convenio
         WHERE clinica_id = a.clinica_id
           AND convenio_id = coalesce(a.convenio_id, pac_convenio)
           AND tipo_consulta_id = v_tipo.id
           AND ativo
         LIMIT 1;
      END IF;
      v_valor := coalesce(v_valor_convenio, v_valor);
      IF coalesce(v_valor, 0) <= 0 THEN v_valor := NULL; END IF;
    END IF;

    IF v_valor IS NOT NULL THEN
      INSERT INTO public.lancamentos(
        tipo, categoria, descricao, valor, data, data_vencimento,
        status, paciente_id, agendamento_id, clinica_id
      ) VALUES (
        'receita', v_categoria, v_desc || ' - ' || pac_nome, v_valor,
        (now() AT TIME ZONE 'America/Sao_Paulo')::date, (now() AT TIME ZONE 'America/Sao_Paulo')::date, 'pendente', a.paciente_id, a.id, a.clinica_id
      );
      v_criada := true;
    END IF;
  END IF;

  SELECT coalesce(exigir_pagamento_previo, false)
    INTO v_exige FROM public.clinicas WHERE id = a.clinica_id;
  IF v_exige AND coalesce(public.saldo_devedor_do_agendamento(a.id), 0) > 0.009 THEN
    v_status := 'aguardando_pagamento_adicional';
  END IF;

  UPDATE public.agendamentos
     SET status = v_status::public.status_agendamento
   WHERE id = a.id;
  IF v_fila.id IS NOT NULL THEN
    UPDATE public.fila_atendimento SET status = 'finalizado' WHERE id = v_fila.id;
  END IF;

  IF p_agendar_retorno THEN
    IF p_dias_retorno IS NULL OR p_dias_retorno NOT BETWEEN 1 AND 730 THEN
      RAISE EXCEPTION 'Prazo do retorno deve estar entre 1 e 730 dias';
    END IF;
    SELECT id INTO v_retorno
      FROM public.retornos
     WHERE agendamento_id = a.id AND status <> 'cancelado'
     ORDER BY created_at DESC
     LIMIT 1;
    IF v_retorno IS NULL THEN
      INSERT INTO public.retornos(
        paciente_id, medico_id, data_retorno_prevista, data_consulta_origem,
        motivo, status, agendamento_id, clinica_id, historico
      ) VALUES (
        a.paciente_id, a.medico_id, (now() AT TIME ZONE 'America/Sao_Paulo')::date + p_dias_retorno,
        (now() AT TIME ZONE 'America/Sao_Paulo')::date, 'Retorno de ' || a.tipo, 'pendente', a.id,
        a.clinica_id, jsonb_build_array(jsonb_build_object('evento', 'criado', 'em', now()))
      ) RETURNING id INTO v_retorno;
    END IF;
  END IF;

  RETURN QUERY SELECT v_status, v_retorno, v_criada, false;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.indicadores_produtividade(p_days integer DEFAULT 30)
 RETURNS TABLE(metric_key text, label text, current_value numeric, previous_value numeric, unit text, scope text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_clinic uuid;
  v_roles public.app_role[];
  v_admin boolean := false;
  v_today date;
  v_current_date_start date;
  v_previous_date_start date;
  v_current_range_start timestamptz;
  v_current_range_end_exclusive timestamptz;
  v_previous_range_start timestamptz;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_days NOT IN (7, 30, 90) THEN
    RAISE EXCEPTION 'invalid period' USING ERRCODE = '22023';
  END IF;

  SELECT p.clinica_id INTO v_clinic
  FROM public.profiles p
  WHERE p.id = v_user AND COALESCE(p.ativo, true);
  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'clinic membership required' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(ur.role), ARRAY[]::public.app_role[])
    INTO v_roles
  FROM public.user_roles ur
  WHERE ur.user_id = v_user;
  v_admin := 'admin'::public.app_role = ANY(v_roles);
  v_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_current_date_start := v_today - (p_days - 1);
  v_previous_date_start := v_current_date_start - p_days;
  v_current_range_start := v_current_date_start::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_current_range_end_exclusive := (v_today + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_previous_range_start := v_previous_date_start::timestamp AT TIME ZONE 'America/Sao_Paulo';

  -- Tarefas são pessoais para colaboradores e agregadas para admin.
  RETURN QUERY
  SELECT 'tasks_completed', 'Tarefas concluídas',
    count(*) FILTER (WHERE t.data_conclusao >= v_current_range_start AND t.data_conclusao < v_current_range_end_exclusive)::numeric,
    count(*) FILTER (WHERE t.data_conclusao >= v_previous_range_start AND t.data_conclusao < v_current_range_start)::numeric,
    'tarefas', CASE WHEN v_admin THEN 'Clínica' ELSE 'Meu trabalho' END
  FROM public.tarefas t
  WHERE t.clinica_id = v_clinic
    AND (v_admin OR t.responsavel_id = v_user)
    AND t.data_conclusao >= v_previous_range_start
    AND t.data_conclusao < v_current_range_end_exclusive;

  IF v_admin OR 'medico'::public.app_role = ANY(v_roles) THEN
    RETURN QUERY
    SELECT 'appointments_completed', 'Atendimentos concluídos',
      count(*) FILTER (WHERE a.data >= v_current_date_start AND a.data <= v_today)::numeric,
      count(*) FILTER (WHERE a.data >= v_previous_date_start AND a.data < v_current_date_start)::numeric,
      'atendimentos', CASE WHEN v_admin THEN 'Clínica' ELSE 'Meu trabalho' END
    FROM public.agendamentos a
    WHERE a.clinica_id = v_clinic
      AND (v_admin OR EXISTS (
        SELECT 1 FROM public.medicos m
        WHERE m.id = a.medico_id
          AND m.clinica_id = v_clinic
          AND m.user_id = v_user
          AND m.ativo IS NOT FALSE
      ))
      AND a.status IN ('finalizado'::public.status_agendamento, 'atendimento_finalizado'::public.status_agendamento)
      AND a.data >= v_previous_date_start
      AND a.data <= v_today;
  END IF;

  IF v_admin OR 'enfermagem'::public.app_role = ANY(v_roles) THEN
    RETURN QUERY
    SELECT 'collections_completed', 'Coletas realizadas',
      count(*) FILTER (WHERE c.data_coleta >= v_current_range_start AND c.data_coleta < v_current_range_end_exclusive)::numeric,
      count(*) FILTER (WHERE c.data_coleta >= v_previous_range_start AND c.data_coleta < v_current_range_start)::numeric,
      'coletas', CASE WHEN v_admin THEN 'Clínica' ELSE 'Meu trabalho' END
    FROM public.coletas_laboratorio c
    WHERE c.clinica_id = v_clinic
      AND (v_admin OR c.coletado_por = v_user)
      AND c.data_coleta >= v_previous_range_start
      AND c.data_coleta < v_current_range_end_exclusive;
  END IF;

  IF v_admin OR 'financeiro'::public.app_role = ANY(v_roles) THEN
    RETURN QUERY
    SELECT 'payments_received', 'Recebimentos registrados',
      count(*) FILTER (WHERE p.data_pagamento >= v_current_range_start AND p.data_pagamento < v_current_range_end_exclusive)::numeric,
      count(*) FILTER (WHERE p.data_pagamento >= v_previous_range_start AND p.data_pagamento < v_current_range_start)::numeric,
      'recebimentos', CASE WHEN v_admin THEN 'Clínica' ELSE 'Meu trabalho' END
    FROM public.pagamentos p
    WHERE p.clinica_id = v_clinic
      AND p.estornado_em IS NULL
      AND (v_admin OR p.recebido_por = v_user)
      AND p.data_pagamento >= v_previous_range_start
      AND p.data_pagamento < v_current_range_end_exclusive;

    RETURN QUERY
    SELECT 'payments_value', 'Valor recebido',
      COALESCE(sum(p.valor) FILTER (WHERE p.data_pagamento >= v_current_range_start AND p.data_pagamento < v_current_range_end_exclusive), 0),
      COALESCE(sum(p.valor) FILTER (WHERE p.data_pagamento >= v_previous_range_start AND p.data_pagamento < v_current_range_start), 0),
      'BRL', CASE WHEN v_admin THEN 'Clínica' ELSE 'Meu trabalho' END
    FROM public.pagamentos p
    WHERE p.clinica_id = v_clinic
      AND p.estornado_em IS NULL
      AND (v_admin OR p.recebido_por = v_user)
      AND p.data_pagamento >= v_previous_range_start
      AND p.data_pagamento < v_current_range_end_exclusive;
  END IF;

  IF NOT v_admin AND 'recepcao'::public.app_role = ANY(v_roles) THEN
    RETURN QUERY
    SELECT 'appointments_registered', 'Agendamentos registrados',
      count(*) FILTER (WHERE al.timestamp >= v_current_range_start AND al.timestamp < v_current_range_end_exclusive)::numeric,
      count(*) FILTER (WHERE al.timestamp >= v_previous_range_start AND al.timestamp < v_current_range_start)::numeric,
      'agendamentos', 'Meu trabalho'
    FROM public.audit_log al
    WHERE al.clinica_id = v_clinic AND al.user_id = v_user
      AND al.collection = 'agendamentos' AND al.action = 'create'
      AND al.timestamp >= v_previous_range_start
      AND al.timestamp < v_current_range_end_exclusive;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.lancar_item_no_atendimento(p_agendamento_id uuid, p_descricao text, p_valor_unitario numeric, p_quantidade numeric DEFAULT 1, p_categoria text DEFAULT 'procedimento'::text, p_prontuario_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_agendamento public.agendamentos%ROWTYPE;
  v_conta_id    uuid;
  v_conta       public.lancamentos%ROWTYPE;
  v_paciente    text;
  v_devido      numeric(12,2);
  v_tem_itens   boolean;
BEGIN
  IF p_descricao IS NULL OR btrim(p_descricao) = '' THEN
    RAISE EXCEPTION 'Descreva o procedimento antes de lançar.';
  END IF;

  IF COALESCE(p_valor_unitario, 0) <= 0 THEN
    RAISE EXCEPTION 'O valor do procedimento precisa ser maior que zero.';
  END IF;

  IF COALESCE(p_quantidade, 0) <= 0 THEN
    RAISE EXCEPTION 'A quantidade precisa ser maior que zero.';
  END IF;

  -- O SELECT passa pelo RLS: agendamento de outra clínica não aparece.
  SELECT * INTO v_agendamento FROM public.agendamentos WHERE id = p_agendamento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Atendimento não encontrado nesta clínica.' USING ERRCODE = 'no_data_found';
  END IF;

  -- Conta do atendimento. Pode não existir: retorno é gratuito e não gera
  -- cobrança no check-in.
  SELECT * INTO v_conta
    FROM public.lancamentos
   WHERE agendamento_id = p_agendamento_id
     AND tipo = 'receita'
     AND status NOT IN ('cancelado', 'estornado')
   ORDER BY created_at
   LIMIT 1;

  IF NOT FOUND THEN
    SELECT nome INTO v_paciente FROM public.pacientes WHERE id = v_agendamento.paciente_id;

    INSERT INTO public.lancamentos (
      tipo, categoria, descricao, valor, data, data_vencimento,
      status, paciente_id, agendamento_id, clinica_id
    ) VALUES (
      'receita', 'procedimento',
      concat_ws(' — ', 'Procedimentos do atendimento', v_paciente),
      0, (now() AT TIME ZONE 'America/Sao_Paulo')::date, (now() AT TIME ZONE 'America/Sao_Paulo')::date,
      'pendente', v_agendamento.paciente_id, p_agendamento_id, v_agendamento.clinica_id
    )
    RETURNING id INTO v_conta_id;
  ELSE
    v_conta_id := v_conta.id;

    -- Conta no modelo antigo (valor gravado direto, sem itens): o primeiro
    -- item faria `valor = SUM(itens)` engolir o que já estava cobrado. Vira
    -- item primeiro, com o mesmo valor e a mesma descrição.
    SELECT count(*) > 0 INTO v_tem_itens
      FROM public.lancamento_itens WHERE lancamento_id = v_conta_id;

    IF NOT v_tem_itens AND COALESCE(v_conta.valor, 0) > 0 THEN
      INSERT INTO public.lancamento_itens (
        lancamento_id, clinica_id, descricao, categoria,
        quantidade, valor_unitario, origem
      ) VALUES (
        v_conta_id, v_conta.clinica_id,
        COALESCE(NULLIF(btrim(v_conta.descricao), ''), 'Atendimento'),
        CASE WHEN v_conta.categoria IN ('consulta','retorno','procedimento','exame','produto','taxa','outros')
             THEN v_conta.categoria ELSE 'outros' END,
        1, v_conta.valor, 'checkin'
      );
    END IF;
  END IF;

  INSERT INTO public.lancamento_itens (
    lancamento_id, clinica_id, descricao, categoria,
    quantidade, valor_unitario, origem, prontuario_id, criado_por
  ) VALUES (
    v_conta_id, v_agendamento.clinica_id, btrim(p_descricao), p_categoria,
    p_quantidade, p_valor_unitario, 'atendimento', p_prontuario_id, auth.uid()
  );

  -- O gatilho `itens_recalculam_conta` já somou o item ao valor da conta.
  SELECT * INTO v_conta FROM public.lancamentos WHERE id = v_conta_id;
  v_devido := v_conta.valor - COALESCE(v_conta.desconto, 0) + COALESCE(v_conta.acrescimo, 0);

  RETURN jsonb_build_object(
    'lancamento_id', v_conta_id,
    'valor',         v_conta.valor,
    'valor_pago',    COALESCE(v_conta.valor_pago, 0),
    'saldo',         v_devido - COALESCE(v_conta.valor_pago, 0),
    'status',        v_conta.status
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.platform_get_clinicas_saude()
 RETURNS TABLE(clinica_id uuid, clinica_nome text, criada_em timestamp with time zone, assinatura_status text, em_trial boolean, plano_nome text, suspensa boolean, arquivada boolean, ultima_atividade timestamp with time zone, ultima_atividade_ha_dias integer, agendamentos_em_atendimento integer, coletas_esquecidas integer, exames_solicitados_ha_7d integer, contas_a_receber_vencidas integer, contas_a_receber_valor numeric, total_pacientes integer, total_agendamentos_no_mes integer, audits_no_mes integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_papel_jwt text := COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    NULLIF(current_setting('request.jwt.claim.role', true), '')
  );
  v_papel_sessao text := NULLIF(NULLIF(current_setting('role', true), ''), 'none');
BEGIN
  -- Com usuário: precisa ser admin da plataforma. Sem usuário: só chamada
  -- interna sem JWT e sem SET ROLE (pg_cron via
  -- verificar_saude_clinicas_e_alertar) ou service_role. anon é recusado
  -- pelo JWT ou, se ele faltar, pelo papel da sessão.
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_platform_admin() THEN
      RAISE EXCEPTION 'Só a dona do SaaS pode consultar a saúde das clínicas.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF COALESCE(v_papel_jwt, 'service_role') <> 'service_role'
     OR COALESCE(v_papel_sessao, 'service_role') <> 'service_role' THEN
    RAISE EXCEPTION 'Só a dona do SaaS pode consultar a saúde das clínicas.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH ult_atividade AS (
    SELECT c.id AS clinica_id, GREATEST(
      COALESCE((SELECT MAX(a.timestamp)  FROM public.audit_log    a WHERE a.clinica_id = c.id), '1970-01-01'::timestamptz),
      COALESCE((SELECT MAX(a.updated_at) FROM public.agendamentos a WHERE a.clinica_id = c.id), '1970-01-01'::timestamptz),
      COALESCE((SELECT MAX(l.updated_at) FROM public.lancamentos  l WHERE l.clinica_id = c.id), '1970-01-01'::timestamptz)
    ) AS quando
    FROM public.clinicas c
  )
  SELECT
    c.id,
    c.nome,
    c.created_at,
    COALESCE(a.status, 'sem_assinatura')::text,
    COALESCE(a.status = 'trial', false),
    COALESCE(p.nome, ''),
    c.suspensa,
    COALESCE(c.arquivada, false),
    NULLIF(ua.quando, '1970-01-01'::timestamptz),
    CASE WHEN ua.quando > '1970-01-01'::timestamptz
         THEN EXTRACT(DAY FROM now() - ua.quando)::integer
         ELSE NULL END,
    (SELECT COUNT(*)::integer FROM public.agendamentos ag
      WHERE ag.clinica_id = c.id AND ag.status = 'em_atendimento'),
    (SELECT COUNT(*)::integer FROM public.fila_alertas_lab_esquecido f
      WHERE f.clinica_id = c.id),
    (SELECT COUNT(*)::integer FROM public.exames e
      WHERE e.clinica_id = c.id
        AND e.status = 'solicitado'
        AND e.created_at < now() - interval '7 days'),
    (SELECT COUNT(*)::integer FROM public.lancamentos l
      WHERE l.clinica_id = c.id
        AND l.tipo = 'receita'
        AND l.status = 'pendente'
        AND l.data_vencimento < (now() AT TIME ZONE 'America/Sao_Paulo')::date),
    COALESCE((SELECT SUM(l.valor - COALESCE(l.valor_pago, 0)) FROM public.lancamentos l
      WHERE l.clinica_id = c.id
        AND l.tipo = 'receita'
        AND l.status IN ('pendente','parcial','atrasado')
        AND l.data_vencimento < (now() AT TIME ZONE 'America/Sao_Paulo')::date), 0),
    (SELECT COUNT(*)::integer FROM public.pacientes pa WHERE pa.clinica_id = c.id),
    (SELECT COUNT(*)::integer FROM public.agendamentos ag
      WHERE ag.clinica_id = c.id AND ag.data >= date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::date)),
    (SELECT COUNT(*)::integer FROM public.audit_log al
      WHERE al.clinica_id = c.id AND al.timestamp >= date_trunc('month', now()))
  FROM public.clinicas c
  LEFT JOIN LATERAL (
    SELECT ap.status, ap.plano_id FROM public.assinaturas_plano ap
     WHERE ap.user_id = c.owner_id
     ORDER BY ap.created_at DESC LIMIT 1
  ) a ON TRUE
  LEFT JOIN public.planos p ON p.id = a.plano_id
  LEFT JOIN ult_atividade ua ON ua.clinica_id = c.id
  ORDER BY ua.quando DESC NULLS LAST;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.recalcular_conta(p_lancamento_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tem_itens      boolean;
  v_total_itens    numeric(12,2);
  v_tem_linha_pag  boolean;   -- existe pagamento, estornado ou não
  v_total_pago     numeric(12,2);
  v_valor          numeric(12,2);
  v_desconto       numeric(12,2);
  v_acrescimo      numeric(12,2);
  v_devido         numeric(12,2);
  v_pago           numeric(12,2);
  v_status         text;
BEGIN
  SELECT count(*) > 0, COALESCE(sum(valor_total), 0)
    INTO v_tem_itens, v_total_itens
    FROM public.lancamento_itens WHERE lancamento_id = p_lancamento_id;

  -- Qualquer linha de pagamento marca a conta como sendo do modelo novo.
  SELECT count(*) > 0 INTO v_tem_linha_pag
    FROM public.pagamentos WHERE lancamento_id = p_lancamento_id;

  -- Mas só o que NÃO foi estornado é dinheiro.
  SELECT COALESCE(sum(valor), 0) INTO v_total_pago
    FROM public.pagamentos
   WHERE lancamento_id = p_lancamento_id AND estornado_em IS NULL;

  IF NOT v_tem_itens AND NOT v_tem_linha_pag THEN
    RETURN; -- conta ainda no modelo antigo: não tocar
  END IF;

  IF v_tem_itens THEN
    UPDATE public.lancamentos SET valor = v_total_itens WHERE id = p_lancamento_id;
  END IF;

  SELECT valor, COALESCE(desconto, 0), COALESCE(acrescimo, 0), COALESCE(valor_pago, 0), status::text
    INTO v_valor, v_desconto, v_acrescimo, v_pago, v_status
    FROM public.lancamentos WHERE id = p_lancamento_id;

  v_devido := v_valor - v_desconto + v_acrescimo;

  -- Conta cancelada ou estornada não volta sozinha para pago/parcial.
  IF v_status IN ('cancelado', 'estornado') THEN
    RETURN;
  END IF;

  IF v_tem_linha_pag THEN
    v_pago := v_total_pago;
  END IF;

  UPDATE public.lancamentos
     SET valor_pago = v_pago,
         -- Sem pagamento vivo, a data de pagamento também sai: conta que deve
         -- não tem data de quitação.
         data_pagamento = CASE WHEN v_pago > 0 THEN COALESCE(data_pagamento, (now() AT TIME ZONE 'America/Sao_Paulo')::date) END,
         status = CASE
           WHEN round(v_pago * 100) >= round(v_devido * 100) THEN 'pago'::status_pagamento
           WHEN v_pago > 0                                   THEN 'parcial'::status_pagamento
           ELSE 'pendente'::status_pagamento
         END
   WHERE id = p_lancamento_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.registrar_prescricao_memed_local(p_clinica_id uuid, p_paciente_id uuid, p_medico_id uuid, p_prescription_uuid text, p_medicamento text, p_data_emissao date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_marker text;
  v_id uuid;
  v_paciente_clinica uuid;
  v_medico_clinica uuid;
  v_paciente_id uuid;
  v_medico_id uuid;
BEGIN
  IF p_clinica_id IS NULL OR p_paciente_id IS NULL OR p_medico_id IS NULL
     OR NULLIF(btrim(p_prescription_uuid), '') IS NULL
     OR NULLIF(btrim(p_medicamento), '') IS NULL THEN
    RAISE EXCEPTION 'Dados obrigatorios da prescricao Memed ausentes.' USING ERRCODE = 'not_null_violation';
  END IF;

  SELECT clinica_id INTO v_paciente_clinica FROM public.pacientes WHERE id = p_paciente_id;
  SELECT clinica_id INTO v_medico_clinica FROM public.medicos WHERE id = p_medico_id;
  IF v_paciente_clinica IS DISTINCT FROM p_clinica_id
     OR v_medico_clinica IS DISTINCT FROM p_clinica_id THEN
    RAISE EXCEPTION 'Paciente e prescritor precisam pertencer a clinica da prescricao.'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  v_marker := 'Memed:' || p_prescription_uuid;
  INSERT INTO public.prescricoes (
    clinica_id, paciente_id, medico_id, tipo, medicamento, observacoes, data_emissao
  ) VALUES (
    p_clinica_id, p_paciente_id, p_medico_id, 'simples', left(p_medicamento, 10000), v_marker,
    COALESCE(p_data_emissao, (now() AT TIME ZONE 'America/Sao_Paulo')::date)
  )
  ON CONFLICT (clinica_id, observacoes) WHERE observacoes LIKE 'Memed:%' DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id, paciente_id, medico_id
      INTO v_id, v_paciente_id, v_medico_id
      FROM public.prescricoes
     WHERE clinica_id = p_clinica_id AND observacoes = v_marker;
    IF v_id IS NULL OR v_paciente_id IS DISTINCT FROM p_paciente_id
       OR v_medico_id IS DISTINCT FROM p_medico_id THEN
      RAISE EXCEPTION 'A prescricao Memed local ja esta vinculada a outro paciente ou medico.'
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;
  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.substituir_prescricoes_do_prontuario(p_prontuario_id uuid, p_prescricoes jsonb DEFAULT '[]'::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_paciente_id uuid;
  v_medico_id uuid;
  v_clinica_id uuid;
  v_assinado boolean;
  v_inseridas integer := 0;
BEGIN
  IF p_prontuario_id IS NULL THEN RAISE EXCEPTION 'prontuario_id é obrigatório'; END IF;
  IF auth.uid() IS NULL OR NOT (public.is_admin(auth.uid()) OR public.is_medico(auth.uid())) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(p_prescricoes) <> 'array' THEN RAISE EXCEPTION 'p_prescricoes precisa ser um array JSON'; END IF;

  SELECT paciente_id, medico_id, clinica_id, COALESCE(assinado, false)
    INTO v_paciente_id, v_medico_id, v_clinica_id, v_assinado
    FROM public.prontuarios WHERE id = p_prontuario_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prontuário não encontrado ou fora da sua clínica' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_clinica_id IS DISTINCT FROM public.get_my_clinica_id()
     OR (public.is_medico(auth.uid()) AND NOT public.is_admin(auth.uid())
       AND NOT public.is_medico_responsavel_do_prontuario(v_medico_id)) THEN
    RAISE EXCEPTION 'Encounter outside your access' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_assinado THEN
    RAISE EXCEPTION 'Prontuário assinado é imutável. Use adendos para retificar.' USING ERRCODE = 'raise_exception';
  END IF;

  DELETE FROM public.prescricoes WHERE prontuario_id = p_prontuario_id;
  IF EXISTS (SELECT 1 FROM public.prescricoes WHERE prontuario_id = p_prontuario_id) THEN
    RAISE EXCEPTION 'Não foi possível remover prescrições anteriores. Nada foi alterado.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.prescricoes (
    paciente_id, medico_id, prontuario_id, clinica_id, medicamento, dosagem,
    posologia, duracao, quantidade, observacoes, data_emissao, tipo
  )
  SELECT v_paciente_id, v_medico_id, p_prontuario_id, v_clinica_id,
    NULLIF(item->>'medicamento', ''), NULLIF(item->>'dosagem', ''),
    NULLIF(item->>'posologia', ''), NULLIF(item->>'duracao', ''),
    NULLIF(item->>'quantidade', ''), NULLIF(item->>'observacoes', ''),
    COALESCE(NULLIF(item->>'data_emissao', '')::date, (now() AT TIME ZONE 'America/Sao_Paulo')::date),
    COALESCE(NULLIF(item->>'tipo', ''), 'simples')
  FROM jsonb_array_elements(p_prescricoes) AS item
  WHERE NULLIF(item->>'medicamento', '') IS NOT NULL;
  GET DIAGNOSTICS v_inseridas = ROW_COUNT;
  RETURN v_inseridas;
END;
$function$
;
