BEGIN;

-- Keep optional room-provider references in the same clinic as the room.
CREATE OR REPLACE FUNCTION public.validar_medico_responsavel_sala()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  medico_clinica_id uuid;
BEGIN
  IF NEW.clinica_id IS NULL THEN
    RAISE EXCEPTION 'A sala precisa pertencer a uma clínica.'
      USING ERRCODE = '23514';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.is_same_clinica(NEW.clinica_id) THEN
    RAISE EXCEPTION 'A sala precisa pertencer à clínica do usuário autenticado.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.medico_responsavel IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT m.clinica_id
    INTO medico_clinica_id
    FROM public.medicos m
   WHERE m.id = NEW.medico_responsavel
   FOR SHARE;

  IF NOT FOUND OR medico_clinica_id IS DISTINCT FROM NEW.clinica_id THEN
    RAISE EXCEPTION 'O médico responsável precisa pertencer à mesma clínica da sala.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validar_medico_responsavel_sala() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS salas_validar_medico_responsavel ON public.salas;
CREATE TRIGGER salas_validar_medico_responsavel
  BEFORE INSERT OR UPDATE OF medico_responsavel, clinica_id ON public.salas
  FOR EACH ROW EXECUTE FUNCTION public.validar_medico_responsavel_sala();

-- Patient and doctor references in the waiting list must belong to the row's
-- clinic. The shared locks prevent those references moving while we validate.
CREATE OR REPLACE FUNCTION public.validar_referencias_lista_espera()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  paciente_clinica_id uuid;
  medico_clinica_id uuid;
BEGIN
  IF NEW.clinica_id IS NULL THEN
    RAISE EXCEPTION 'O pedido da lista de espera precisa pertencer a uma clínica.'
      USING ERRCODE = '23514';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.is_same_clinica(NEW.clinica_id) THEN
    RAISE EXCEPTION 'O pedido precisa pertencer à clínica do usuário autenticado.'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.clinica_id
    INTO paciente_clinica_id
    FROM public.pacientes p
   WHERE p.id = NEW.paciente_id
   FOR SHARE;

  IF NOT FOUND OR paciente_clinica_id IS DISTINCT FROM NEW.clinica_id THEN
    RAISE EXCEPTION 'O paciente precisa pertencer à mesma clínica do pedido.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.medico_id IS NOT NULL THEN
    SELECT m.clinica_id
      INTO medico_clinica_id
      FROM public.medicos m
     WHERE m.id = NEW.medico_id
     FOR SHARE;

    IF NOT FOUND OR medico_clinica_id IS DISTINCT FROM NEW.clinica_id THEN
      RAISE EXCEPTION 'O médico precisa pertencer à mesma clínica do pedido.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validar_referencias_lista_espera() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS lista_espera_validar_referencias ON public.lista_espera;
CREATE TRIGGER lista_espera_validar_referencias
  BEFORE INSERT OR UPDATE OF paciente_id, medico_id, clinica_id ON public.lista_espera
  FOR EACH ROW EXECUTE FUNCTION public.validar_referencias_lista_espera();

-- Only notify patients whose record belongs to the same clinic as the wait-list row.
CREATE OR REPLACE FUNCTION public.convocar_lista_espera_apos_cancelamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
$$;
REVOKE ALL ON FUNCTION public.convocar_lista_espera_apos_cancelamento() FROM PUBLIC, anon;

COMMIT;
