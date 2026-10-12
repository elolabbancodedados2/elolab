BEGIN;

-- Match score visibility to the admin/reception route that uses this module.
DROP POLICY IF EXISTS predicoes_no_show_clinica ON public.predicoes_no_show;
DROP POLICY IF EXISTS "Clinica acessa predicoes" ON public.predicoes_no_show;
CREATE POLICY predicoes_no_show_clinica ON public.predicoes_no_show
  FOR SELECT TO authenticated
  USING (
    public.is_same_clinica(clinica_id)
    AND (public.is_admin(auth.uid()) OR public.is_recepcao(auth.uid()))
  );

-- Recalcula previsões com paciente, médico e histórico limitados à clínica do
-- agendamento. A versão anterior somava o histórico global do paciente e
-- montava notificações sem conferir os tenants das referências.
CREATE OR REPLACE FUNCTION public.atualizar_predicoes_no_show()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  a record;
  total_hist integer;
  faltas integer;
  cancelados integer;
  risco numeric;
  motivos text[];
  recomendacoes text[];
  processados integer := 0;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  DELETE FROM public.predicoes_no_show pn
   WHERE NOT EXISTS (
     SELECT 1
       FROM public.agendamentos ag
       JOIN public.pacientes p ON p.id = ag.paciente_id AND p.clinica_id = ag.clinica_id
       JOIN public.medicos m ON m.id = ag.medico_id AND m.clinica_id = ag.clinica_id
      WHERE ag.id = pn.agendamento_id
        AND ag.paciente_id = pn.paciente_id
        AND ag.clinica_id = pn.clinica_id
        AND ag.data >= v_hoje
        AND ag.status IN ('agendado', 'confirmado')
   );

  FOR a IN
    SELECT ag.*, p.nome, p.email, p.telefone, m.nome AS medico_nome
      FROM public.agendamentos ag
      JOIN public.pacientes p ON p.id = ag.paciente_id AND p.clinica_id = ag.clinica_id
      JOIN public.medicos m ON m.id = ag.medico_id AND m.clinica_id = ag.clinica_id
     WHERE ag.data >= v_hoje
       AND ag.status IN ('agendado', 'confirmado')
  LOOP
    SELECT count(*),
           count(*) FILTER (WHERE hist.status = 'faltou'),
           count(*) FILTER (WHERE hist.status = 'cancelado')
      INTO total_hist, faltas, cancelados
      FROM public.agendamentos hist
     WHERE hist.clinica_id = a.clinica_id
       AND hist.paciente_id = a.paciente_id
       AND hist.id <> a.id
       AND hist.data < a.data
       AND hist.status IN ('finalizado', 'faltou', 'cancelado');

    risco := 0.08;
    motivos := ARRAY[]::text[];
    recomendacoes := ARRAY[]::text[];
    IF total_hist = 0 THEN
      risco := risco + 0.10;
      motivos := array_append(motivos, 'Paciente sem histórico suficiente');
    END IF;
    IF faltas > 0 THEN
      risco := risco + LEAST(0.50, (faltas::numeric / GREATEST(total_hist, 1)) * 0.65);
      motivos := array_append(motivos, format('%s falta(s) em %s atendimento(s)', faltas, total_hist));
    END IF;
    IF cancelados >= 2 THEN
      risco := risco + LEAST(0.12, cancelados * 0.025);
      motivos := array_append(motivos, format('%s cancelamentos anteriores', cancelados));
    END IF;
    IF a.status = 'agendado' THEN
      risco := risco + 0.18;
      motivos := array_append(motivos, 'Presença ainda não confirmada');
      recomendacoes := array_append(recomendacoes, 'Solicitar confirmação');
    END IF;
    IF a.data - v_hoje > 14 THEN
      risco := risco + 0.08;
      motivos := array_append(motivos, 'Agendado com grande antecedência');
    END IF;
    IF extract(hour FROM a.hora_inicio) >= 17 THEN
      risco := risco + 0.05;
      motivos := array_append(motivos, 'Horário no fim do dia');
    END IF;
    IF extract(isodow FROM a.data) = 5 AND extract(hour FROM a.hora_inicio) >= 15 THEN
      risco := risco + 0.05;
      motivos := array_append(motivos, 'Sexta-feira à tarde');
    END IF;
    risco := round(LEAST(0.95, GREATEST(0.03, risco)), 2);

    IF risco >= 0.70 THEN
      recomendacoes := array_append(array_append(recomendacoes, 'Contato ativo da recepção'), 'Oferecer remarcação se necessário');
    ELSIF risco >= 0.40 THEN
      recomendacoes := array_append(recomendacoes, 'Reforçar lembrete 24 horas antes');
    ELSE
      recomendacoes := array_append(recomendacoes, 'Lembrete padrão');
    END IF;

    INSERT INTO public.predicoes_no_show(
      agendamento_id, paciente_id, probabilidade_no_show, motivos_risco,
      recomendacoes, clinica_id, updated_at
    ) VALUES (
      a.id, a.paciente_id, risco, motivos, array_to_string(recomendacoes, ' • '), a.clinica_id, now()
    )
    ON CONFLICT (agendamento_id) DO UPDATE
      SET paciente_id = EXCLUDED.paciente_id,
          probabilidade_no_show = EXCLUDED.probabilidade_no_show,
          motivos_risco = EXCLUDED.motivos_risco,
          recomendacoes = EXCLUDED.recomendacoes,
          clinica_id = EXCLUDED.clinica_id,
          updated_at = now();

    IF risco >= 0.70
       AND a.data BETWEEN v_hoje AND v_hoje + 2
       AND NOT EXISTS (
         SELECT 1 FROM public.notification_queue q
          WHERE q.clinica_id = a.clinica_id
            AND q.dados_extras @> jsonb_build_object('agendamento_id', a.id)
            AND q.dados_extras->>'tipo_notificacao' IN ('lembrete_risco_manual', 'prevencao_no_show')
            AND (
              q.status IN ('pendente', 'enviando')
              OR (q.status = 'enviado' AND COALESCE(q.enviado_em, q.created_at) > now() - interval '20 hours')
            )
       ) THEN
      IF NULLIF(btrim(a.telefone), '') IS NOT NULL THEN
        INSERT INTO public.notification_queue(
          tipo, destinatario_id, destinatario_telefone, destinatario_nome,
          assunto, conteudo, status, clinica_id, dados_extras
        ) VALUES (
          'whatsapp', a.paciente_id, a.telefone, a.nome,
          'Confirmação de consulta',
          format('Olá %s! Podemos confirmar sua consulta com Dr(a). %s em %s às %s?',
            a.nome, a.medico_nome, to_char(a.data, 'DD/MM/YYYY'), to_char(a.hora_inicio, 'HH24:MI')),
          'pendente', a.clinica_id,
          jsonb_build_object('tipo_notificacao', 'prevencao_no_show', 'agendamento_id', a.id, 'risco', risco)
        );
      ELSIF NULLIF(btrim(a.email), '') IS NOT NULL THEN
        INSERT INTO public.notification_queue(
          tipo, destinatario_id, destinatario_email, destinatario_nome,
          assunto, conteudo, status, clinica_id, dados_extras
        ) VALUES (
          'email', a.paciente_id, a.email, a.nome,
          'Confirme sua consulta',
          format('Olá %s! Confirme sua consulta com Dr(a). %s em %s às %s.',
            a.nome, a.medico_nome, to_char(a.data, 'DD/MM/YYYY'), to_char(a.hora_inicio, 'HH24:MI')),
          'pendente', a.clinica_id,
          jsonb_build_object('tipo_notificacao', 'prevencao_no_show', 'agendamento_id', a.id, 'risco', risco)
        );
      END IF;
    END IF;
    processados := processados + 1;
  END LOOP;
  RETURN processados;
END;
$$;

REVOKE ALL ON FUNCTION public.atualizar_predicoes_no_show() FROM PUBLIC, anon, authenticated;

-- Enqueue through a narrow server-side operation: the notification queue itself
-- remains admin-only for direct table writes.
CREATE OR REPLACE FUNCTION public.enfileirar_lembrete_risco(p_agendamento_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica_id uuid := public.get_my_clinica_id();
  v_agendamento record;
  v_linhas integer;
BEGIN
  IF auth.uid() IS NULL
     OR v_clinica_id IS NULL
     OR NOT (public.is_admin(auth.uid()) OR public.is_recepcao(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissao para enviar lembretes de risco.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('lembrete-risco:' || p_agendamento_id::text, 0));

  SELECT ag.id, ag.clinica_id, ag.paciente_id, ag.data, ag.hora_inicio,
         p.nome, p.telefone, p.email, m.nome AS medico_nome
    INTO v_agendamento
    FROM public.agendamentos ag
    JOIN public.pacientes p ON p.id = ag.paciente_id AND p.clinica_id = ag.clinica_id
    JOIN public.medicos m ON m.id = ag.medico_id AND m.clinica_id = ag.clinica_id
   WHERE ag.id = p_agendamento_id
     AND ag.clinica_id = v_clinica_id
     AND ag.data >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
     AND ag.status IN ('agendado', 'confirmado');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento nao encontrado na clinica ou indisponivel para lembrete.' USING ERRCODE = 'P0002';
  END IF;
  IF NULLIF(btrim(v_agendamento.telefone), '') IS NULL
     AND NULLIF(btrim(v_agendamento.email), '') IS NULL THEN
    RAISE EXCEPTION 'O paciente nao possui telefone ou e-mail cadastrado.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.notification_queue q
     WHERE q.clinica_id = v_clinica_id
       AND q.dados_extras @> jsonb_build_object('agendamento_id', p_agendamento_id)
       AND q.dados_extras->>'tipo_notificacao' IN ('lembrete_risco_manual', 'prevencao_no_show')
       AND (
         q.status IN ('pendente', 'enviando')
         OR (q.status = 'enviado' AND COALESCE(q.enviado_em, q.created_at) > now() - interval '20 hours')
       )
  ) THEN
    RETURN false;
  END IF;

  IF NULLIF(btrim(v_agendamento.telefone), '') IS NOT NULL THEN
    INSERT INTO public.notification_queue(
      tipo, destinatario_id, destinatario_telefone, destinatario_nome, assunto, conteudo,
      status, clinica_id, dados_extras
    ) VALUES (
      'whatsapp', v_agendamento.paciente_id, v_agendamento.telefone, v_agendamento.nome,
      'Lembrete de consulta',
      format('Ola %s! Lembramos sua consulta com Dr(a). %s em %s as %s. Responda para confirmar.',
        v_agendamento.nome, v_agendamento.medico_nome,
        to_char(v_agendamento.data, 'DD/MM/YYYY'), to_char(v_agendamento.hora_inicio, 'HH24:MI')),
      'pendente', v_clinica_id,
      jsonb_build_object('tipo_notificacao', 'lembrete_risco_manual', 'agendamento_id', p_agendamento_id)
    );
  ELSE
    INSERT INTO public.notification_queue(
      tipo, destinatario_id, destinatario_email, destinatario_nome, assunto, conteudo,
      status, clinica_id, dados_extras
    ) VALUES (
      'email', v_agendamento.paciente_id, v_agendamento.email, v_agendamento.nome,
      'Lembrete de consulta',
      format('Ola %s! Lembramos sua consulta com Dr(a). %s em %s as %s.',
        v_agendamento.nome, v_agendamento.medico_nome,
        to_char(v_agendamento.data, 'DD/MM/YYYY'), to_char(v_agendamento.hora_inicio, 'HH24:MI')),
      'pendente', v_clinica_id,
      jsonb_build_object('tipo_notificacao', 'lembrete_risco_manual', 'agendamento_id', p_agendamento_id)
    );
  END IF;
  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  RETURN v_linhas > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.enfileirar_lembrete_risco(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enfileirar_lembrete_risco(uuid) TO authenticated;

-- The hourly predictor also enqueues directly. Serialize all manual and
-- automatic risk reminders at insertion so the 20-hour deduplication cannot
-- race between two independent callers.
CREATE OR REPLACE FUNCTION public.evitar_lembrete_risco_duplicado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agendamento_id uuid;
BEGIN
  IF COALESCE(NEW.dados_extras->>'tipo_notificacao', '') NOT IN ('lembrete_risco_manual', 'prevencao_no_show') THEN
    RETURN NEW;
  END IF;
  v_agendamento_id := NULLIF(NEW.dados_extras->>'agendamento_id', '')::uuid;
  IF v_agendamento_id IS NULL OR NEW.clinica_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('lembrete-risco:' || v_agendamento_id::text, 0));
  IF EXISTS (
    SELECT 1 FROM public.notification_queue q
     WHERE q.clinica_id = NEW.clinica_id
       AND q.dados_extras @> jsonb_build_object('agendamento_id', v_agendamento_id)
       AND q.dados_extras->>'tipo_notificacao' IN ('lembrete_risco_manual', 'prevencao_no_show')
       AND (
         q.status IN ('pendente', 'enviando')
         OR (q.status = 'enviado' AND COALESCE(q.enviado_em, q.created_at) > now() - interval '20 hours')
       )
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.evitar_lembrete_risco_duplicado() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS notification_queue_dedupe_lembrete_risco ON public.notification_queue;
CREATE TRIGGER notification_queue_dedupe_lembrete_risco
  BEFORE INSERT ON public.notification_queue
  FOR EACH ROW EXECUTE FUNCTION public.evitar_lembrete_risco_duplicado();

COMMIT;
