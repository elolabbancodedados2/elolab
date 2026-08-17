-- Solicitação de convênio rastreável e telemetria sanitizada do frontend.
CREATE OR REPLACE FUNCTION public.solicitar_autorizacao_convenio(
  p_paciente_id uuid, p_convenio_id uuid, p_tipo_servico text,
  p_descricao text, p_observacoes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_auth autorizacoes_convenio%ROWTYPE; v_convenio convenios%ROWTYPE; v_paciente pacientes%ROWTYPE;
BEGIN
  IF NOT (can_manage_data(auth.uid()) OR is_medico(auth.uid())) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT * INTO v_convenio FROM convenios WHERE id=p_convenio_id AND is_same_clinica(clinica_id);
  SELECT * INTO v_paciente FROM pacientes WHERE id=p_paciente_id AND is_same_clinica(clinica_id);
  IF v_convenio.id IS NULL OR v_paciente.id IS NULL THEN RAISE EXCEPTION 'Paciente ou convênio não encontrado'; END IF;
  INSERT INTO autorizacoes_convenio(paciente_id,convenio_id,tipo_servico,descricao,status,observacoes,clinica_id)
  VALUES(p_paciente_id,p_convenio_id,p_tipo_servico,trim(p_descricao),'pendente',nullif(trim(p_observacoes),''),get_my_clinica_id()) RETURNING * INTO v_auth;
  IF nullif(trim(v_convenio.email),'') IS NOT NULL THEN
    INSERT INTO notification_queue(tipo,destinatario_email,destinatario_nome,assunto,conteudo,status,clinica_id,dados_extras)
    VALUES('email',v_convenio.email,v_convenio.nome,'Solicitação de autorização — '||v_paciente.nome,
      'Olá, solicitamos autorização para '||v_paciente.nome||E'.\nProcedimento: '||trim(p_descricao)||E'.\nReferência EloLab: '||v_auth.id::text||
      CASE WHEN nullif(trim(p_observacoes),'') IS NULL THEN '' ELSE E'.\nObservações: '||trim(p_observacoes) END,
      'pendente',get_my_clinica_id(),jsonb_build_object('tipo_notificacao','autorizacao_convenio','autorizacao_id',v_auth.id));
  END IF;
  RETURN jsonb_build_object('id',v_auth.id,'email_enfileirado',nullif(trim(v_convenio.email),'') IS NOT NULL,'email_convenio',v_convenio.email);
END; $$;
GRANT EXECUTE ON FUNCTION public.solicitar_autorizacao_convenio(uuid,uuid,text,text,text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.client_error_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinica_id uuid REFERENCES clinicas(id) ON DELETE CASCADE,
  user_id uuid, tipo text NOT NULL, mensagem text NOT NULL, origem text, rota text,
  release text, navegador text, fingerprint text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_error_events_clinica_created ON client_error_events(clinica_id,created_at DESC);
ALTER TABLE client_error_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY client_error_events_select_admin ON client_error_events FOR SELECT TO authenticated
  USING(is_admin(auth.uid()) AND is_same_clinica(clinica_id));
REVOKE ALL ON client_error_events FROM anon, authenticated;
GRANT SELECT ON client_error_events TO authenticated;
