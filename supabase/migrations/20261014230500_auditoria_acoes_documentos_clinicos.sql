BEGIN;

CREATE OR REPLACE FUNCTION public.registrar_acesso_documento_clinico(
  p_tipo text,
  p_documento_id uuid,
  p_acao text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paciente_id uuid;
  v_clinica_id uuid;
  v_user_nome text;
  v_audit_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_clinical(auth.uid())
     OR NOT (public.is_admin(auth.uid()) OR public.is_medico(auth.uid())) THEN
    RAISE EXCEPTION 'Acesso clínico não autorizado' USING ERRCODE = '42501';
  END IF;
  IF p_tipo NOT IN ('anexo_prontuario', 'prescricao', 'atestado', 'encaminhamento')
     OR p_acao NOT IN ('visualizacao', 'impressao', 'exportacao') THEN
    RAISE EXCEPTION 'Tipo ou ação de auditoria inválida' USING ERRCODE = '22023';
  END IF;

  CASE p_tipo
    WHEN 'anexo_prontuario' THEN
      SELECT a.paciente_id INTO v_paciente_id
        FROM public.anexos_prontuario a WHERE a.id = p_documento_id;
    WHEN 'prescricao' THEN
      SELECT p.paciente_id INTO v_paciente_id
        FROM public.prescricoes p WHERE p.id = p_documento_id;
    WHEN 'atestado' THEN
      SELECT a.paciente_id INTO v_paciente_id
        FROM public.atestados a WHERE a.id = p_documento_id;
    WHEN 'encaminhamento' THEN
      SELECT e.paciente_id INTO v_paciente_id
        FROM public.encaminhamentos e WHERE e.id = p_documento_id;
  END CASE;

  SELECT p.clinica_id INTO v_clinica_id
    FROM public.pacientes p
   WHERE p.id = v_paciente_id
     AND public.is_same_clinica(p.clinica_id);
  IF v_clinica_id IS NULL THEN
    RAISE EXCEPTION 'Documento clínico não encontrado ou acesso negado' USING ERRCODE = '42501';
  END IF;

  SELECT p.nome INTO v_user_nome FROM public.profiles p WHERE p.id = auth.uid();
  INSERT INTO public.audit_log (
    user_id, user_name, clinica_id, action, collection, record_id, record_name, changes
  ) VALUES (
    auth.uid(), v_user_nome, v_clinica_id, 'access', 'documentos_clinicos',
    p_tipo || ':' || p_documento_id::text, NULL,
    jsonb_build_array(
      jsonb_build_object('field', 'event', 'newValue', p_acao),
      jsonb_build_object('field', 'document_type', 'newValue', p_tipo)
    )
  ) RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_acesso_documento_clinico(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_acesso_documento_clinico(text, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.registrar_acesso_documento_clinico(text, uuid, text) IS
  'Registra acesso/impressão/exportação de documento clínico autorizado sem copiar nome, conteúdo ou dados sensíveis para audit_log.';

COMMIT;
