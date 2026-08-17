-- ============================================================================
-- Notificação de laudo pronto: também vai por WhatsApp, e o nome da clínica
-- deixa de ser "EloLab Clínica" hardcoded
--
-- Estado antes desta migration
-- ---------------------------------------------------------------------------
-- A migration 20260131023100 criou `notify_exam_result_available()` que
-- enfileira notificação de EMAIL quando `exames.status → 'laudo_disponivel'`.
-- Dois problemas:
--
--   1. Só email. WhatsApp já existe como canal (Evolution API integrada,
--      templates de WhatsApp podem ser cadastrados), mas o trigger nunca
--      olhou pra ele. É o que a lista de próximas melhorias pediu:
--      "Notificação de laudo pronto por WhatsApp — infra existe, template
--      também. Fluxo automatizado quando exames.status → laudo_disponivel."
--
--   2. Nome da clínica hardcoded como "EloLab Clínica" em todas as
--      substituições `{{clinica_nome}}`. Cada clínica devia ver o próprio
--      nome — quando alguém encaminhava o email para a família, aparecia
--      "EloLab Clínica" em vez de "Clínica São João".
--
-- ─── O QUE ESTA MIGRATION FAZ ─────────────────────────────────────────────
--
-- Redefine `notify_exam_result_available` para:
--
--   - Buscar o nome real da clínica via `clinicas.nome` (join por
--     `exames.clinica_id`).
--   - Enfileirar UMA notificação de e-mail (se o paciente tem e-mail e existe
--     template `resultado_exame`/`email`/ativo da clínica).
--   - Enfileirar UMA notificação de WhatsApp (se o paciente tem telefone e
--     existe template `resultado_exame`/`whatsapp`/ativo da clínica).
--
-- Templates são procurados na clínica dona do exame — se ela não tem, cai
-- num template global (clinica_id IS NULL). Sem template, o canal apenas
-- é pulado, sem erro.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.notify_exam_result_available()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paciente          record;
  v_clinica_nome      text;
  v_template          record;
  v_assunto           text;
  v_conteudo          text;
  v_canais_disparados int := 0;
BEGIN
  -- Só age na transição PARA laudo_disponivel. Corrigir texto, anexo etc.
  -- num laudo já disponível segue livre e não reenfileira notificação.
  IF NEW.status IS DISTINCT FROM 'laudo_disponivel'::status_exame OR
     (TG_OP = 'UPDATE' AND OLD.status = 'laudo_disponivel'::status_exame) THEN
    RETURN NEW;
  END IF;

  SELECT nome, email, telefone INTO v_paciente
    FROM public.pacientes WHERE id = NEW.paciente_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT nome INTO v_clinica_nome
    FROM public.clinicas WHERE id = NEW.clinica_id;

  v_clinica_nome := COALESCE(v_clinica_nome, 'a clínica');

  -- ── Canal e-mail ────────────────────────────────────────────────────────
  IF v_paciente.email IS NOT NULL AND btrim(v_paciente.email) <> '' THEN
    SELECT * INTO v_template FROM public.notification_templates
     WHERE categoria = 'resultado_exame'
       AND tipo = 'email'
       AND ativo = true
       AND (clinica_id = NEW.clinica_id OR clinica_id IS NULL)
     ORDER BY (clinica_id = NEW.clinica_id) DESC   -- preferir o da clínica
     LIMIT 1;

    IF v_template.id IS NOT NULL THEN
      v_assunto  := replace(replace(COALESCE(v_template.assunto, ''),
                     '{{paciente_nome}}', COALESCE(v_paciente.nome, '')),
                     '{{clinica_nome}}',  v_clinica_nome);
      v_conteudo := replace(replace(replace(v_template.conteudo,
                     '{{paciente_nome}}', COALESCE(v_paciente.nome, '')),
                     '{{tipo_exame}}',    COALESCE(NEW.tipo_exame, '')),
                     '{{clinica_nome}}',  v_clinica_nome);

      INSERT INTO public.notification_queue (
        template_id, tipo, destinatario_id, destinatario_email, destinatario_nome,
        assunto, conteudo, dados_extras, status, clinica_id
      ) VALUES (
        v_template.id, 'email', NEW.paciente_id, v_paciente.email, v_paciente.nome,
        v_assunto, v_conteudo,
        jsonb_build_object('exame_id', NEW.id, 'tipo_exame', NEW.tipo_exame),
        'pendente', NEW.clinica_id
      );
      v_canais_disparados := v_canais_disparados + 1;
    END IF;
  END IF;

  -- ── Canal WhatsApp ──────────────────────────────────────────────────────
  IF v_paciente.telefone IS NOT NULL AND btrim(v_paciente.telefone) <> '' THEN
    SELECT * INTO v_template FROM public.notification_templates
     WHERE categoria = 'resultado_exame'
       AND tipo = 'whatsapp'
       AND ativo = true
       AND (clinica_id = NEW.clinica_id OR clinica_id IS NULL)
     ORDER BY (clinica_id = NEW.clinica_id) DESC
     LIMIT 1;

    IF v_template.id IS NOT NULL THEN
      v_conteudo := replace(replace(replace(v_template.conteudo,
                     '{{paciente_nome}}', COALESCE(v_paciente.nome, '')),
                     '{{tipo_exame}}',    COALESCE(NEW.tipo_exame, '')),
                     '{{clinica_nome}}',  v_clinica_nome);

      INSERT INTO public.notification_queue (
        template_id, tipo, destinatario_id, destinatario_telefone, destinatario_nome,
        conteudo, dados_extras, status, clinica_id
      ) VALUES (
        v_template.id, 'whatsapp', NEW.paciente_id, v_paciente.telefone, v_paciente.nome,
        v_conteudo,
        jsonb_build_object('exame_id', NEW.id, 'tipo_exame', NEW.tipo_exame),
        'pendente', NEW.clinica_id
      );
      v_canais_disparados := v_canais_disparados + 1;
    END IF;
  END IF;

  -- Só loga se houve algo a enviar — reduz ruído em `automation_logs`.
  IF v_canais_disparados > 0 THEN
    INSERT INTO public.automation_logs (tipo, nome, status, registros_processados, registros_sucesso, detalhes, clinica_id)
    VALUES ('exame', 'Notificação Resultado Exame', 'sucesso',
      v_canais_disparados, v_canais_disparados,
      jsonb_build_object('exame_id', NEW.id, 'paciente_id', NEW.paciente_id,
                         'tipo_exame', NEW.tipo_exame, 'canais', v_canais_disparados),
      NEW.clinica_id);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_exam_result_available() IS
  'Enfileira e-mail e WhatsApp quando um exame vira laudo_disponivel. Cada canal só sai se o paciente tem o dado de contato E existe template ativo (do dono do exame, ou global). Se falta um lado, o outro segue. Nome da clínica vem de clinicas.nome, não hardcoded.';

COMMIT;

-- ============================================================================
-- CONFERIR
-- ============================================================================
-- Ver templates disponíveis por canal:
--
--   SELECT clinica_id, categoria, tipo, count(*)
--     FROM notification_templates
--    WHERE categoria = 'resultado_exame' AND ativo
--    GROUP BY 1,2,3;
--
-- Após liberar um laudo real, olhar a fila:
--
--   SELECT tipo, status, destinatario_nome, agendado_para, erro_mensagem
--     FROM notification_queue
--    WHERE dados_extras->>'exame_id' = '<uuid>';
