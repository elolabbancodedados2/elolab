BEGIN;

CREATE TABLE IF NOT EXISTS public.documentos_portal_paciente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anexo_id uuid NOT NULL UNIQUE REFERENCES public.anexos_prontuario(id) ON DELETE CASCADE,
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  origem text NOT NULL CHECK (origem IN ('clinica', 'externo')),
  validade_ate date,
  publicado boolean NOT NULL DEFAULT false,
  publicado_em timestamptz,
  publicado_por uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  revogado_em timestamptz,
  revogado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT documentos_portal_publicacao_auditada CHECK (
    NOT publicado OR (publicado_em IS NOT NULL AND publicado_por IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS documentos_portal_paciente_publicados_idx
  ON public.documentos_portal_paciente (clinica_id, paciente_id, publicado, validade_ate);

ALTER TABLE public.documentos_portal_paciente ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.documentos_portal_paciente FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.documentos_portal_paciente TO authenticated;
DROP POLICY IF EXISTS documentos_portal_paciente_select ON public.documentos_portal_paciente;
CREATE POLICY documentos_portal_paciente_select ON public.documentos_portal_paciente
  FOR SELECT TO authenticated
  USING (
    public.is_same_clinica(clinica_id)
    AND (public.is_admin(auth.uid()) OR public.is_medico(auth.uid()))
  );

CREATE OR REPLACE FUNCTION public.gerenciar_documento_portal_paciente(
  p_anexo_id uuid,
  p_publicado boolean,
  p_validade_ate date,
  p_origem text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_clinica_id uuid;
  v_paciente_id uuid;
  v_publicacao public.documentos_portal_paciente%rowtype;
BEGIN
  IF v_user_id IS NULL OR NOT (public.is_admin(v_user_id) OR public.is_medico(v_user_id)) THEN
    RAISE EXCEPTION 'Somente administração ou profissional médico pode publicar documentos no portal.'
      USING ERRCODE = '42501';
  END IF;
  IF p_publicado IS NULL OR p_origem NOT IN ('clinica', 'externo') THEN
    RAISE EXCEPTION 'Origem ou status da publicação inválidos.' USING ERRCODE = '22023';
  END IF;
  IF p_publicado AND p_validade_ate IS NOT NULL
     AND p_validade_ate < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'A validade do documento deve ser hoje ou uma data futura.' USING ERRCODE = '22023';
  END IF;

  v_clinica_id := public.get_my_clinica_id();
  SELECT a.paciente_id INTO v_paciente_id
    FROM public.anexos_prontuario a
    JOIN public.pacientes p ON p.id = a.paciente_id
    JOIN public.prontuarios r ON r.id = a.prontuario_id
      AND r.paciente_id = a.paciente_id
      AND r.clinica_id = a.clinica_id
   WHERE a.id = p_anexo_id
     AND a.clinica_id = v_clinica_id
     AND p.clinica_id = v_clinica_id
     AND r.clinica_id = v_clinica_id
   FOR UPDATE OF a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Anexo não encontrado nesta clínica ou sem vínculo válido ao prontuário.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT p_publicado AND NOT EXISTS (
    SELECT 1 FROM public.documentos_portal_paciente d
     WHERE d.anexo_id = p_anexo_id
       AND d.paciente_id = v_paciente_id
       AND d.clinica_id = v_clinica_id
  ) THEN
    RETURN jsonb_build_object('publicado', false, 'alterado', false);
  END IF;

  INSERT INTO public.documentos_portal_paciente (
    anexo_id, paciente_id, clinica_id, origem, validade_ate,
    publicado, publicado_em, publicado_por, revogado_em, revogado_por, atualizado_em
  ) VALUES (
    p_anexo_id, v_paciente_id, v_clinica_id, p_origem, p_validade_ate,
    p_publicado,
    CASE WHEN p_publicado THEN now() ELSE NULL END,
    CASE WHEN p_publicado THEN v_user_id ELSE NULL END,
    CASE WHEN p_publicado THEN NULL ELSE now() END,
    CASE WHEN p_publicado THEN NULL ELSE v_user_id END,
    now()
  )
  ON CONFLICT (anexo_id) DO UPDATE SET
    origem = EXCLUDED.origem,
    validade_ate = EXCLUDED.validade_ate,
    publicado = EXCLUDED.publicado,
    publicado_em = CASE WHEN EXCLUDED.publicado THEN now() ELSE public.documentos_portal_paciente.publicado_em END,
    publicado_por = CASE WHEN EXCLUDED.publicado THEN v_user_id ELSE public.documentos_portal_paciente.publicado_por END,
    revogado_em = CASE WHEN EXCLUDED.publicado THEN NULL ELSE now() END,
    revogado_por = CASE WHEN EXCLUDED.publicado THEN NULL ELSE v_user_id END,
    atualizado_em = now()
  RETURNING * INTO v_publicacao;

  RETURN jsonb_build_object(
    'id', v_publicacao.id,
    'anexo_id', v_publicacao.anexo_id,
    'publicado', v_publicacao.publicado,
    'validade_ate', v_publicacao.validade_ate,
    'origem', v_publicacao.origem,
    'publicado_em', v_publicacao.publicado_em,
    'revogado_em', v_publicacao.revogado_em
  );
END;
$$;

REVOKE ALL ON FUNCTION public.gerenciar_documento_portal_paciente(uuid, boolean, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerenciar_documento_portal_paciente(uuid, boolean, date, text) TO authenticated;

COMMENT ON TABLE public.documentos_portal_paciente IS
  'Publicação administrativa explícita de anexos selecionados no Portal do Paciente; o arquivo original continua privado.';
COMMENT ON FUNCTION public.gerenciar_documento_portal_paciente(uuid, boolean, date, text) IS
  'Publica ou revoga um anexo do portal após validar papel, clínica, paciente e prontuário.';

COMMIT;
