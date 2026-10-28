BEGIN;

-- Item 78: auditoria de acessos da clínica por intervalo, exportável apenas por
-- administrador da própria clínica. Devolve só identificadores e autoria do
-- evento, sem nome de paciente nem conteúdo clínico, e registra a própria
-- consulta como acesso auditado.

CREATE INDEX IF NOT EXISTS idx_prontuario_acessos_clinica_created
  ON public.prontuario_acessos (clinica_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_access_clinica_timestamp
  ON public.audit_log (clinica_id, "timestamp" DESC) WHERE action = 'access';

CREATE OR REPLACE FUNCTION public.auditoria_acessos_intervalo(p_inicio timestamptz, p_fim timestamptz)
RETURNS TABLE (
  evento_id text, origem text, ocorrido_em timestamptz, acao text,
  usuario_id uuid, usuario_nome text, recurso text, registro_id text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clinica_id uuid := public.get_my_clinica_id();
BEGIN
  IF auth.uid() IS NULL OR v_clinica_id IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores da clínica podem auditar acessos.' USING ERRCODE = '42501';
  END IF;
  IF p_inicio IS NULL OR p_fim IS NULL OR p_fim < p_inicio THEN
    RAISE EXCEPTION 'Intervalo inválido.' USING ERRCODE = '22023';
  END IF;
  IF p_fim - p_inicio > interval '93 days' THEN
    RAISE EXCEPTION 'O intervalo máximo é de 93 dias.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.audit_log (action, collection, record_id, user_id, clinica_id)
  VALUES ('access', 'auditoria_acessos', p_inicio::text || '/' || p_fim::text, auth.uid(), v_clinica_id);

  RETURN QUERY
  SELECT e.evento_id, e.origem, e.ocorrido_em, e.acao, e.usuario_id, e.usuario_nome, e.recurso, e.registro_id
    FROM (
      SELECT pa.id::text AS evento_id, 'prontuario_acessos'::text AS origem, pa.created_at AS ocorrido_em,
             pa.acao, pa.user_id AS usuario_id, pa.user_nome AS usuario_nome,
             'prontuarios'::text AS recurso, pa.prontuario_id::text AS registro_id
        FROM public.prontuario_acessos pa
       WHERE pa.clinica_id = v_clinica_id AND pa.created_at BETWEEN p_inicio AND p_fim
      UNION ALL
      SELECT al.id::text, 'audit_log'::text, al."timestamp", al.action, al.user_id, al.user_name,
             al.collection, al.record_id
        FROM public.audit_log al
       WHERE al.clinica_id = v_clinica_id AND al.action = 'access' AND al."timestamp" BETWEEN p_inicio AND p_fim
    ) e
   ORDER BY e.ocorrido_em DESC, e.evento_id
   LIMIT 5000;
END;
$$;

REVOKE ALL ON FUNCTION public.auditoria_acessos_intervalo(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auditoria_acessos_intervalo(timestamptz, timestamptz) TO authenticated;

COMMIT;
