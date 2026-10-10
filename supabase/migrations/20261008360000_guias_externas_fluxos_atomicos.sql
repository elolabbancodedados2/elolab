-- Mantém a guia e os registros operacionais no mesmo commit. Sem isso, uma
-- falha entre INSERT e UPDATE deixava exames/agendamentos órfãos e o reenvio
-- da ação podia duplicá-los.

CREATE OR REPLACE FUNCTION public.encaminhar_guia_externa_para_fila(
  p_guia_id uuid,
  p_clinica_id uuid,
  p_paciente_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_guia public.guias_externas%ROWTYPE;
  v_inseridos integer;
BEGIN
  IF auth.uid() IS NULL OR p_clinica_id IS DISTINCT FROM public.get_my_clinica_id() THEN
    RAISE EXCEPTION 'Clínica não identificada ou sem acesso.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_guia
    FROM public.guias_externas
   WHERE id = p_guia_id AND clinica_id = p_clinica_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guia não encontrada na clínica atual.' USING ERRCODE = 'P0002';
  END IF;
  IF v_guia.status NOT IN ('recebida', 'em_analise', 'agendada') THEN
    RAISE EXCEPTION 'A guia já foi encaminhada ou não aceita envio para a fila.' USING ERRCODE = '23514';
  END IF;
  IF jsonb_typeof(v_guia.exames_solicitados) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'A guia não contém uma lista válida de exames.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.pacientes
     WHERE id = p_paciente_id AND clinica_id = p_clinica_id
  ) THEN
    RAISE EXCEPTION 'Paciente não encontrado na clínica atual.' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.exames (
    paciente_id, tipo_exame, descricao, status, data_solicitacao, categoria, clinica_id
  )
  SELECT
    p_paciente_id,
    COALESCE(NULLIF(btrim(item ->> 'nome'), ''), NULLIF(btrim(item ->> 'tipo'), '')),
    COALESCE(NULLIF(btrim(item ->> 'descricao'), ''), v_guia.observacoes),
    'solicitado',
    (now() AT TIME ZONE 'America/Sao_Paulo')::date,
    'laboratorio',
    p_clinica_id
  FROM jsonb_array_elements(v_guia.exames_solicitados) AS itens(item)
  WHERE COALESCE(NULLIF(btrim(item ->> 'nome'), ''), NULLIF(btrim(item ->> 'tipo'), '')) IS NOT NULL;

  GET DIAGNOSTICS v_inseridos = ROW_COUNT;
  IF v_inseridos = 0 THEN
    RAISE EXCEPTION 'Informe pelo menos um exame válido antes de encaminhar a guia.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.guias_externas
     SET status = 'encaminhada_fila', paciente_id = p_paciente_id
   WHERE id = p_guia_id AND clinica_id = p_clinica_id;

  RETURN v_inseridos;
END;
$$;

CREATE OR REPLACE FUNCTION public.agendar_guia_externa(
  p_guia_id uuid,
  p_clinica_id uuid,
  p_paciente_id uuid,
  p_data date,
  p_hora time
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_guia public.guias_externas%ROWTYPE;
  v_agendamento_id uuid;
BEGIN
  IF auth.uid() IS NULL OR p_clinica_id IS DISTINCT FROM public.get_my_clinica_id() THEN
    RAISE EXCEPTION 'Clínica não identificada ou sem acesso.' USING ERRCODE = '42501';
  END IF;
  IF p_data IS NULL OR p_hora IS NULL THEN
    RAISE EXCEPTION 'Informe uma data e hora válidas.' USING ERRCODE = '22023';
  END IF;
  IF p_data < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'A data da coleta não pode estar no passado.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_guia
    FROM public.guias_externas
   WHERE id = p_guia_id AND clinica_id = p_clinica_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guia não encontrada na clínica atual.' USING ERRCODE = 'P0002';
  END IF;
  IF v_guia.status NOT IN ('recebida', 'em_analise') THEN
    RAISE EXCEPTION 'Esta guia já foi agendada ou encaminhada.' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.pacientes
     WHERE id = p_paciente_id AND clinica_id = p_clinica_id
  ) THEN
    RAISE EXCEPTION 'Paciente não encontrado na clínica atual.' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.agendamentos (
    paciente_id, data, hora_inicio, tipo, status, observacoes, clinica_id
  ) VALUES (
    p_paciente_id,
    p_data,
    p_hora,
    'coleta',
    'agendado',
    format('Guia externa #%s — %s', left(p_guia_id::text, 8), COALESCE(v_guia.medico_externo_nome, '')),
    p_clinica_id
  ) RETURNING id INTO v_agendamento_id;

  UPDATE public.guias_externas
     SET status = 'agendada',
         paciente_id = p_paciente_id,
         agendamento_id = v_agendamento_id,
         data_agendamento = p_data,
         hora_agendamento = p_hora
   WHERE id = p_guia_id AND clinica_id = p_clinica_id;

  RETURN v_agendamento_id;
END;
$$;

REVOKE ALL ON FUNCTION public.encaminhar_guia_externa_para_fila(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agendar_guia_externa(uuid, uuid, uuid, date, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.encaminhar_guia_externa_para_fila(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agendar_guia_externa(uuid, uuid, uuid, date, time) TO authenticated;
