-- Assinatura eletrônica verificável do prontuário.
-- O hash é calculado no servidor sobre o conteúdo clínico e prescrições, nunca
-- sobre dados fornecidos pelo navegador. Um código público permite conferir a
-- integridade sem expor dados pessoais ou clínicos.

CREATE TABLE IF NOT EXISTS public.prontuario_assinaturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_verificacao uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  prontuario_id uuid NOT NULL UNIQUE REFERENCES public.prontuarios(id) ON DELETE RESTRICT,
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE RESTRICT,
  assinado_por_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  medico_id uuid NOT NULL REFERENCES public.medicos(id) ON DELETE RESTRICT,
  assinante_nome text NOT NULL,
  assinante_crm text NOT NULL,
  conteudo_hash text NOT NULL CHECK (conteudo_hash ~ '^[0-9a-f]{64}$'),
  metodo text NOT NULL DEFAULT 'eletronica_simples' CHECK (metodo = 'eletronica_simples'),
  assinado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prontuario_assinaturas ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.prontuario_assinaturas TO authenticated;
GRANT ALL ON public.prontuario_assinaturas TO service_role;

DROP POLICY IF EXISTS prontuario_assinaturas_select_clinica ON public.prontuario_assinaturas;
CREATE POLICY prontuario_assinaturas_select_clinica ON public.prontuario_assinaturas
  FOR SELECT TO authenticated USING (public.is_same_clinica(clinica_id));

-- Sem INSERT/UPDATE/DELETE para clientes: somente a RPC SECURITY DEFINER grava.

CREATE OR REPLACE FUNCTION public.prontuario_conteudo_hash(p_prontuario_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT encode(extensions.digest(convert_to(jsonb_build_object(
    'id', p.id,
    'paciente_id', p.paciente_id,
    'medico_id', p.medico_id,
    'agendamento_id', p.agendamento_id,
    'data', p.data,
    'queixa_principal', p.queixa_principal,
    'historia_doenca_atual', p.historia_doenca_atual,
    'historia_patologica_pregressa', p.historia_patologica_pregressa,
    'historia_familiar', p.historia_familiar,
    'historia_social', p.historia_social,
    'revisao_sistemas', p.revisao_sistemas,
    'alergias_relatadas', p.alergias_relatadas,
    'medicamentos_em_uso', p.medicamentos_em_uso,
    'sinais_vitais', p.sinais_vitais,
    'exames_fisicos', p.exames_fisicos,
    'exame_cabeca_pescoco', p.exame_cabeca_pescoco,
    'exame_torax', p.exame_torax,
    'exame_abdomen', p.exame_abdomen,
    'exame_membros', p.exame_membros,
    'exame_neurologico', p.exame_neurologico,
    'exame_pele', p.exame_pele,
    'hipotese_diagnostica', p.hipotese_diagnostica,
    'diagnostico_principal', p.diagnostico_principal,
    'diagnosticos_secundarios', p.diagnosticos_secundarios,
    'conduta', p.conduta,
    'plano_terapeutico', p.plano_terapeutico,
    'orientacoes_paciente', p.orientacoes_paciente,
    'observacoes_internas', p.observacoes_internas,
    'prescricoes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'medicamento', r.medicamento, 'dosagem', r.dosagem,
        'posologia', r.posologia, 'duracao', r.duracao,
        'quantidade', r.quantidade, 'observacoes', r.observacoes,
        'tipo', r.tipo, 'data_emissao', r.data_emissao
      ) ORDER BY r.id)
      FROM public.prescricoes r WHERE r.prontuario_id = p.id
    ), '[]'::jsonb)
  )::text, 'utf8'), 'sha256'), 'hex')
  FROM public.prontuarios p
  WHERE p.id = p_prontuario_id;
$$;

REVOKE ALL ON FUNCTION public.prontuario_conteudo_hash(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.assinar_prontuario_verificavel(p_prontuario_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_prontuario public.prontuarios%ROWTYPE;
  v_medico public.medicos%ROWTYPE;
  v_hash text;
  v_assinatura public.prontuario_assinaturas%ROWTYPE;
  v_agora timestamptz := clock_timestamp();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação obrigatória'; END IF;

  SELECT * INTO v_prontuario FROM public.prontuarios
   WHERE id = p_prontuario_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_same_clinica(v_prontuario.clinica_id) THEN
    RAISE EXCEPTION 'Prontuário não encontrado';
  END IF;
  IF v_prontuario.assinado THEN RAISE EXCEPTION 'Prontuário já assinado'; END IF;

  SELECT * INTO v_medico FROM public.medicos
   WHERE user_id = auth.uid() AND clinica_id = v_prontuario.clinica_id AND ativo IS NOT FALSE
   ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND OR COALESCE(trim(v_medico.crm), '') = '' THEN
    RAISE EXCEPTION 'Somente médico ativo com CRM pode assinar o prontuário';
  END IF;

  v_hash := public.prontuario_conteudo_hash(p_prontuario_id);
  IF v_hash IS NULL THEN RAISE EXCEPTION 'Não foi possível calcular a integridade do prontuário'; END IF;

  PERFORM set_config('app.signing_prontuario', 'allowed', true);
  UPDATE public.prontuarios SET
    assinado = true, assinado_em = v_agora,
    assinado_por = COALESCE(v_medico.nome, 'Médico'),
    crm_assinante = v_medico.crm,
    hash_conteudo = v_hash,
    tipo_assinatura = 'eletronica_simples'
  WHERE id = p_prontuario_id;

  INSERT INTO public.prontuario_assinaturas (
    prontuario_id, clinica_id, assinado_por_user_id, medico_id,
    assinante_nome, assinante_crm, conteudo_hash, assinado_em
  ) VALUES (
    p_prontuario_id, v_prontuario.clinica_id, auth.uid(), v_medico.id,
    COALESCE(v_medico.nome, 'Médico'), v_medico.crm, v_hash, v_agora
  ) RETURNING * INTO v_assinatura;

  INSERT INTO public.prontuario_acessos (
    prontuario_id, paciente_id, clinica_id, user_id, user_nome, user_crm,
    acao, justificativa
  ) VALUES (
    p_prontuario_id, v_prontuario.paciente_id, v_prontuario.clinica_id,
    auth.uid(), v_assinatura.assinante_nome, v_assinatura.assinante_crm,
    'assinatura', 'Assinatura eletrônica verificável • hash ' || left(v_hash, 16)
  );

  RETURN jsonb_build_object(
    'signedAt', v_assinatura.assinado_em,
    'signerName', v_assinatura.assinante_nome,
    'signerCRM', v_assinatura.assinante_crm,
    'hash', v_assinatura.conteudo_hash,
    'method', v_assinatura.metodo,
    'verificationCode', v_assinatura.codigo_verificacao
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assinar_prontuario_verificavel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assinar_prontuario_verificavel(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.verificar_assinatura_prontuario(p_codigo uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT jsonb_build_object(
    'found', true,
    'valid', a.conteudo_hash = public.prontuario_conteudo_hash(a.prontuario_id),
    'documentType', 'prontuario',
    'documentReference', left(a.prontuario_id::text, 8),
    'signerName', a.assinante_nome,
    'signerCRM', a.assinante_crm,
    'signedAt', a.assinado_em,
    'method', a.metodo,
    'hash', a.conteudo_hash
  ) FROM public.prontuario_assinaturas a WHERE a.codigo_verificacao = p_codigo;
$$;

REVOKE ALL ON FUNCTION public.verificar_assinatura_prontuario(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verificar_assinatura_prontuario(uuid) TO anon, authenticated;

-- A transição para assinado e qualquer preenchimento dos campos de assinatura
-- só é aceita quando a RPC acima habilita o contexto local da transação.
CREATE OR REPLACE FUNCTION public.prevent_signed_prontuario_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.assinado = true THEN
      RAISE EXCEPTION 'Prontuário assinado não pode ser excluído. Use adendo para retificações.';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.assinado = true THEN
    RAISE EXCEPTION 'Prontuário assinado é imutável. Registre uma retificação como adendo.';
  END IF;

  IF (NEW.assinado IS DISTINCT FROM OLD.assinado
      OR NEW.assinado_em IS DISTINCT FROM OLD.assinado_em
      OR NEW.assinado_por IS DISTINCT FROM OLD.assinado_por
      OR NEW.crm_assinante IS DISTINCT FROM OLD.crm_assinante
      OR NEW.hash_conteudo IS DISTINCT FROM OLD.hash_conteudo
      OR NEW.tipo_assinatura IS DISTINCT FROM OLD.tipo_assinatura)
     AND COALESCE(current_setting('app.signing_prontuario', true), '') <> 'allowed' THEN
    RAISE EXCEPTION 'Use a função de assinatura verificável para assinar o prontuário';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON TABLE public.prontuario_assinaturas IS
  'Registro imutável de assinaturas eletrônicas, com hash do conteúdo calculado no servidor e código público de verificação.';
