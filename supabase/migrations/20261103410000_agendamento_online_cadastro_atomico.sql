BEGIN;

ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS identidade_pendente boolean NOT NULL DEFAULT false;

-- Apenas service_role: a edge já validou CPF, configuração pública, médico e horário.
CREATE OR REPLACE FUNCTION public.solicitar_agendamento_online_atomico(
  p_clinica_id uuid, p_medico_id uuid, p_data date, p_hora_inicio time,
  p_duracao_minutos integer, p_hold_token_hash text, p_cadastro jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_paciente public.pacientes%ROWTYPE;
  v_cpf text := regexp_replace(COALESCE(p_cadastro->>'cpf', ''), '[^0-9]', '', 'g');
  v_identidade_pendente boolean := false;
  v_resultado jsonb;
  v_detalhe text;
  v_observacoes text;
BEGIN
  IF p_cadastro->'aceite_lgpd' IS DISTINCT FROM 'true'::jsonb
     OR length(v_cpf) <> 11 OR length(btrim(COALESCE(p_cadastro->>'nome', ''))) < 3
     OR length(public.normalizar_telefone_revisao(p_cadastro->>'telefone')) NOT BETWEEN 10 AND 11
     OR COALESCE(p_cadastro->>'versao_termo', '') = '' THEN
    RAISE EXCEPTION 'Dados ou aceite inválidos.' USING ERRCODE = '22023';
  END IF;

  -- Serializa também pedidos do mesmo CPF em dias/médicos diferentes.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'pedido-online-cpf:' || p_clinica_id::text || ':' || v_cpf, 0));
  SELECT * INTO v_paciente FROM public.pacientes
   WHERE clinica_id = p_clinica_id
     AND regexp_replace(COALESCE(cpf, ''), '[^0-9]', '', 'g') = v_cpf
   ORDER BY id LIMIT 1 FOR UPDATE;

  IF v_paciente.id IS NOT NULL THEN
    IF NOT v_paciente.ativo OR (SELECT count(*) FROM public.agendamentos
       WHERE clinica_id = p_clinica_id AND paciente_id = v_paciente.id AND status = 'agendado'
         AND data >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
         AND observacoes ILIKE '%[agendamento online]%') >= 2 THEN
      RETURN jsonb_build_object('success', false, 'code', 'booking_unavailable',
        'error', 'Não foi possível concluir este pedido online. Entre em contato com a clínica para continuar.');
    END IF;
    v_identidade_pendente := public.normalizar_telefone_revisao(v_paciente.telefone)
      IS DISTINCT FROM public.normalizar_telefone_revisao(p_cadastro->>'telefone');
  END IF;

  -- Subtransação: até retornos negativos da RPC interna desfazem ficha, aceite e pedido.
  BEGIN
    IF v_paciente.id IS NULL THEN
      INSERT INTO public.pacientes (clinica_id, nome, cpf, telefone, email, data_nascimento)
      VALUES (p_clinica_id, p_cadastro->>'nome',
        substr(v_cpf,1,3)||'.'||substr(v_cpf,4,3)||'.'||substr(v_cpf,7,3)||'-'||substr(v_cpf,10,2),
        p_cadastro->>'telefone', NULLIF(p_cadastro->>'email',''), NULLIF(p_cadastro->>'data_nascimento','')::date)
      RETURNING * INTO v_paciente;
    END IF;
    v_observacoes := '[agendamento online] ' || CASE WHEN v_identidade_pendente
      THEN 'Confirmar identidade no balcão. Telefone informado difere do cadastro; aceite não atribuído à ficha.'
      ELSE 'Marcado pelo paciente no link público. Confirmar com o paciente.' END
      || E'\nNome informado: ' || (p_cadastro->>'nome')
      || E'\nTelefone informado: ' || (p_cadastro->>'telefone');
    v_resultado := public.agendar_consulta_online_atomico(p_clinica_id, v_paciente.id, p_medico_id,
      p_data, p_hora_inicio, p_duracao_minutos, v_observacoes, p_hold_token_hash);
    IF v_resultado->'success' IS DISTINCT FROM 'true'::jsonb THEN
      RAISE EXCEPTION 'Pedido recusado' USING ERRCODE = 'P0409', DETAIL = v_resultado::text;
    END IF;
    UPDATE public.agendamentos SET identidade_pendente = v_identidade_pendente
     WHERE id = (v_resultado->>'id')::uuid AND clinica_id = p_clinica_id;
    IF NOT v_identidade_pendente THEN
      INSERT INTO public.consentimentos_lgpd
        (paciente_id, clinica_id, tipo_consentimento, versao_termo, aceito, data_aceite, ip_aceite)
      VALUES (v_paciente.id, p_clinica_id, 'agendamento_online', p_cadastro->>'versao_termo', true,
        now(), NULLIF(p_cadastro->>'ip_aceite', ''));
    END IF;
  EXCEPTION WHEN SQLSTATE 'P0409' THEN
    GET STACKED DIAGNOSTICS v_detalhe = PG_EXCEPTION_DETAIL;
    RETURN v_detalhe::jsonb;
  END;
  -- Mesma resposta pública com ou sem CPF já cadastrado/identidade pendente.
  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE ALL ON FUNCTION public.solicitar_agendamento_online_atomico(uuid, uuid, date, time, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitar_agendamento_online_atomico(uuid, uuid, date, time, integer, text, jsonb) TO service_role;

COMMIT;
