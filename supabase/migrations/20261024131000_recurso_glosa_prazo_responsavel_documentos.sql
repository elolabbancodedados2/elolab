-- Recurso de glosa com prazo, responsável e documentos anexos.
-- O envio do recurso passa a exigir justificativa, prazo e responsável.
BEGIN;

ALTER TABLE public.glosas_convenio
  ADD COLUMN IF NOT EXISTS recurso_prazo date,
  ADD COLUMN IF NOT EXISTS recurso_responsavel_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_glosas_convenio_recurso_responsavel
  ON public.glosas_convenio (recurso_responsavel_id) WHERE recurso_responsavel_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.glosa_recurso_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE RESTRICT,
  glosa_id uuid NOT NULL REFERENCES public.glosas_convenio(id) ON DELETE RESTRICT,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL CHECK (length(btrim(file_name)) BETWEEN 1 AND 180),
  content_type text NOT NULL CHECK (content_type IN ('application/pdf', 'image/jpeg', 'image/png')),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 10485760),
  enviado_por uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_glosa_recurso_documentos_glosa ON public.glosa_recurso_documentos (clinica_id, glosa_id);

ALTER TABLE public.glosa_recurso_documentos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.glosa_recurso_documentos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.glosa_recurso_documentos TO authenticated;
GRANT ALL ON public.glosa_recurso_documentos TO service_role;
DROP POLICY IF EXISTS glosa_recurso_documentos_select ON public.glosa_recurso_documentos;
CREATE POLICY glosa_recurso_documentos_select ON public.glosa_recurso_documentos FOR SELECT TO authenticated
  USING (public.can_access_financial(auth.uid()) AND public.is_same_clinica(clinica_id));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('recursos-glosa', 'recursos-glosa', false, 10485760, ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png'];

-- Caminho: <clinica_id>/<glosa_id>/<arquivo>
DROP POLICY IF EXISTS recursos_glosa_upload ON storage.objects;
CREATE POLICY recursos_glosa_upload ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'recursos-glosa'
    AND public.can_access_financial(auth.uid())
    AND (storage.foldername(name))[1] = public.get_my_clinica_id()::text
    AND EXISTS (SELECT 1 FROM public.glosas_convenio g
                 WHERE g.id::text = (storage.foldername(name))[2]
                   AND g.clinica_id = public.get_my_clinica_id()
                   AND g.status IN ('pendente', 'recurso_preparacao')));
DROP POLICY IF EXISTS recursos_glosa_read ON storage.objects;
CREATE POLICY recursos_glosa_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'recursos-glosa'
    AND public.can_access_financial(auth.uid())
    AND (storage.foldername(name))[1] = public.get_my_clinica_id()::text);

CREATE OR REPLACE FUNCTION public.listar_responsaveis_financeiro()
RETURNS TABLE (id uuid, nome text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.id, p.nome
    FROM public.profiles p
   WHERE public.can_access_financial(auth.uid())
     AND p.clinica_id = public.get_my_clinica_id()
     AND public.can_access_financial(p.id)
   ORDER BY p.nome;
$$;

CREATE OR REPLACE FUNCTION public.definir_recurso_glosa(p_glosa_id uuid, p_prazo date, p_responsavel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica uuid := public.get_my_clinica_id();
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_financial(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso financeiro necessário';
  END IF;
  IF p_prazo IS NULL OR p_responsavel_id IS NULL THEN
    RAISE EXCEPTION 'Informe o prazo e o responsável pelo recurso';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_responsavel_id AND p.clinica_id = v_clinica)
     OR NOT public.can_access_financial(p_responsavel_id) THEN
    RAISE EXCEPTION 'O responsável deve ter acesso financeiro nesta clínica';
  END IF;
  UPDATE public.glosas_convenio
     SET recurso_prazo = p_prazo, recurso_responsavel_id = p_responsavel_id
   WHERE id = p_glosa_id AND clinica_id = v_clinica AND status IN ('pendente', 'recurso_preparacao');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Glosa não encontrada ou o recurso já foi enviado';
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_documento_recurso_glosa(
  p_glosa_id uuid, p_storage_path text, p_file_name text, p_content_type text, p_byte_size integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica uuid := public.get_my_clinica_id();
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_financial(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso financeiro necessário';
  END IF;
  IF p_storage_path IS NULL OR split_part(p_storage_path, '/', 1) <> v_clinica::text
     OR split_part(p_storage_path, '/', 2) <> p_glosa_id::text THEN
    RAISE EXCEPTION 'Caminho do documento inválido';
  END IF;
  PERFORM 1 FROM public.glosas_convenio
   WHERE id = p_glosa_id AND clinica_id = v_clinica AND status IN ('pendente', 'recurso_preparacao');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documentos só podem ser anexados antes do envio do recurso';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'recursos-glosa' AND o.name = p_storage_path) THEN
    RAISE EXCEPTION 'Arquivo não encontrado no armazenamento';
  END IF;
  INSERT INTO public.glosa_recurso_documentos (clinica_id, glosa_id, storage_path, file_name, content_type, byte_size, enviado_por)
  VALUES (v_clinica, p_glosa_id, p_storage_path, btrim(p_file_name), p_content_type, p_byte_size, auth.uid())
  ON CONFLICT (storage_path) DO NOTHING
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('success', true, 'id', v_id, 'repetido', v_id IS NULL);
END;
$$;

-- Mesmo fluxo de 20261011090001, agora exigindo prazo e responsável no envio.
CREATE OR REPLACE FUNCTION public.atualizar_glosa_convenio(
  p_glosa_id uuid,
  p_status text,
  p_recurso_justificativa text DEFAULT NULL,
  p_valor_recuperado numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinica uuid := public.get_my_clinica_id();
  v_glosa public.glosas_convenio%ROWTYPE;
  v_status_anterior text;
  v_justificativa text := NULLIF(btrim(COALESCE(p_recurso_justificativa, '')), '');
  v_recuperado numeric(14,2);
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_financial(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso financeiro necessário';
  END IF;
  IF v_clinica IS NULL OR p_glosa_id IS NULL THEN
    RAISE EXCEPTION 'Glosa inválida';
  END IF;

  SELECT * INTO v_glosa
    FROM public.glosas_convenio
   WHERE id = p_glosa_id AND clinica_id = v_clinica
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Glosa não encontrada nesta clínica';
  END IF;
  v_status_anterior := v_glosa.status;

  IF p_status = 'recurso_preparacao'
     AND v_status_anterior IN ('pendente', 'recurso_preparacao') THEN
    IF length(COALESCE(v_justificativa, '')) < 10 THEN
      RAISE EXCEPTION 'A justificativa do recurso deve ter ao menos 10 caracteres';
    END IF;
    UPDATE public.glosas_convenio
       SET status = 'recurso_preparacao', recurso_justificativa = v_justificativa
     WHERE id = v_glosa.id;
  ELSIF p_status = 'recurso_enviado' AND v_status_anterior = 'recurso_preparacao' THEN
    IF length(COALESCE(NULLIF(btrim(v_glosa.recurso_justificativa), ''), '')) < 10 THEN
      RAISE EXCEPTION 'Registre a justificativa antes de enviar o recurso';
    END IF;
    IF v_glosa.recurso_prazo IS NULL OR v_glosa.recurso_responsavel_id IS NULL THEN
      RAISE EXCEPTION 'Defina o prazo e o responsável antes de enviar o recurso';
    END IF;
    UPDATE public.glosas_convenio
       SET status = 'recurso_enviado', recurso_enviado_em = now()
     WHERE id = v_glosa.id;
  ELSIF p_status IN ('aceita', 'mantida') AND v_status_anterior = 'recurso_enviado' THEN
    v_recuperado := COALESCE(p_valor_recuperado, 0);
    IF v_recuperado < 0 OR v_recuperado > v_glosa.valor_glosado
       OR v_recuperado <> round(v_recuperado, 2)
       OR (p_status = 'mantida' AND v_recuperado <> 0) THEN
      RAISE EXCEPTION 'O valor recuperado deve estar entre zero e o valor glosado';
    END IF;
    UPDATE public.glosas_convenio
       SET status = p_status, valor_recuperado = v_recuperado, resolvido_em = now()
     WHERE id = v_glosa.id;
  ELSE
    RAISE EXCEPTION 'Transição de glosa inválida';
  END IF;

  RETURN jsonb_build_object('success', true, 'id', v_glosa.id, 'status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.listar_responsaveis_financeiro() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_responsaveis_financeiro() TO authenticated;
REVOKE ALL ON FUNCTION public.definir_recurso_glosa(uuid, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.definir_recurso_glosa(uuid, date, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.registrar_documento_recurso_glosa(uuid, text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_documento_recurso_glosa(uuid, text, text, text, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.atualizar_glosa_convenio(uuid, text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_glosa_convenio(uuid, text, text, numeric) TO authenticated;

COMMIT;
