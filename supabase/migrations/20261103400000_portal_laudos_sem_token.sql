BEGIN;

-- Laudos encaminham à página de acesso sem emitir ou revogar credenciais.
CREATE OR REPLACE FUNCTION public.notify_exam_result_available()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paciente          record;
  v_clinica_nome      text;
  v_link_portal       text;
  v_template          record;
  v_assunto           text;
  v_conteudo          text;
  v_canais_disparados int := 0;
BEGIN
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
  v_link_portal  := 'https://app.elolab.com.br/portal-paciente?clinica=' || NEW.clinica_id::text;

  -- E-mail
  IF v_paciente.email IS NOT NULL AND btrim(v_paciente.email) <> '' THEN
    SELECT * INTO v_template FROM public.notification_templates
     WHERE categoria = 'resultado_exame'
       AND tipo = 'email'
       AND ativo = true
       AND (clinica_id = NEW.clinica_id OR clinica_id IS NULL)
     ORDER BY (clinica_id = NEW.clinica_id) DESC
     LIMIT 1;

    IF v_template.id IS NOT NULL THEN
      v_assunto  := replace(replace(COALESCE(v_template.assunto, ''),
                     '{{paciente_nome}}', COALESCE(v_paciente.nome, '')),
                     '{{clinica_nome}}',  v_clinica_nome);
      v_conteudo := replace(replace(replace(replace(v_template.conteudo,
                     '{{paciente_nome}}', COALESCE(v_paciente.nome, '')),
                     '{{tipo_exame}}',    COALESCE(NEW.tipo_exame, '')),
                     '{{clinica_nome}}',  v_clinica_nome),
                     '{{link_portal}}',   COALESCE(v_link_portal, ''));

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

  -- WhatsApp
  IF v_paciente.telefone IS NOT NULL AND btrim(v_paciente.telefone) <> '' THEN
    SELECT * INTO v_template FROM public.notification_templates
     WHERE categoria = 'resultado_exame'
       AND tipo = 'whatsapp'
       AND ativo = true
       AND (clinica_id = NEW.clinica_id OR clinica_id IS NULL)
     ORDER BY (clinica_id = NEW.clinica_id) DESC
     LIMIT 1;

    IF v_template.id IS NOT NULL THEN
      v_conteudo := replace(replace(replace(replace(v_template.conteudo,
                     '{{paciente_nome}}', COALESCE(v_paciente.nome, '')),
                     '{{tipo_exame}}',    COALESCE(NEW.tipo_exame, '')),
                     '{{clinica_nome}}',  v_clinica_nome),
                     '{{link_portal}}',   COALESCE(v_link_portal, ''));

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

COMMIT;
