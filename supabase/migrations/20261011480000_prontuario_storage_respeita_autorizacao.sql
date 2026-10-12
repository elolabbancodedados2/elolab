BEGIN;

-- Downloads de anexos de prontuario devem seguir as mesmas regras de leitura
-- aplicadas ao registro clinico, inclusive a auditoria exigida para assinados.
-- Os prefixes de exames e PDFs de prescricoes preservam o escopo por tenant
-- implementado em storage_med_attach_allowed.
CREATE OR REPLACE FUNCTION public.storage_med_attach_read_allowed(_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parts text[];
  v_id uuid;
BEGIN
  IF _name IS NULL THEN RETURN false; END IF;
  parts := string_to_array(_name, '/');

  -- Exames: exames/<paciente_id>/... (o helper tenant-scoped da policy
  -- continua sendo a autoridade para este prefixo).
  IF array_length(parts, 1) >= 2 AND parts[1] = 'exames' THEN
    RETURN public.storage_med_attach_allowed(_name);
  END IF;

  -- PDFs de prescricoes: prescricoes/<paciente_id>/<arquivo>.
  IF array_length(parts, 1) >= 3 AND parts[1] = 'prescricoes' THEN
    RETURN public.storage_med_attach_allowed(_name);
  END IF;

  BEGIN
    v_id := parts[1]::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;

  RETURN EXISTS (
    SELECT 1
      FROM public.prontuarios p
     WHERE p.id = v_id
       AND public.is_same_clinica(p.clinica_id)
       AND (
         public.is_admin(auth.uid())
         OR (
           public.is_medico(auth.uid())
           AND (p.assinado IS TRUE OR public.is_medico_responsavel_do_prontuario(p.medico_id))
         )
       )
       AND (p.assinado IS NOT TRUE OR public.prontuario_leitura_auditada(p.id))
  );
END;
$$;
REVOKE ALL ON FUNCTION public.storage_med_attach_read_allowed(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storage_med_attach_read_allowed(text) TO authenticated;

DROP POLICY IF EXISTS "med_attach_select_scoped" ON storage.objects;
CREATE POLICY "med_attach_select_scoped" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'medical-attachments'
    AND public.can_access_clinical(auth.uid())
    AND public.storage_med_attach_allowed(name)
    AND public.storage_med_attach_read_allowed(name)
  );

-- Anexos de rascunho só podem ser removidos pelo admin da clínica ou pelo
-- médico autor. Regras existentes para exames e uploads temporários de
-- prescrições permanecem iguais.
CREATE OR REPLACE FUNCTION public.storage_med_attach_delete_allowed(_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parts text[];
  v_id uuid;
BEGIN
  IF _name IS NULL THEN RETURN false; END IF;
  parts := string_to_array(_name, '/');

  -- Mantém o fluxo atual de remoção de anexos de exames, sempre combinado
  -- com storage_med_attach_allowed na policy da tabela storage.objects.
  IF array_length(parts, 1) >= 3 AND parts[1] = 'exames' THEN RETURN true; END IF;

  -- Mantém a limpeza de PDFs temporários de prescrições não vinculados.
  IF array_length(parts, 1) >= 3 AND parts[1] = 'prescricoes' THEN
    BEGIN
      v_id := parts[2]::uuid;
    EXCEPTION WHEN others THEN
      RETURN false;
    END;
    RETURN EXISTS (
      SELECT 1 FROM public.pacientes p
       WHERE p.id = v_id AND p.clinica_id = public.get_my_clinica_id()
    ) AND NOT EXISTS (
      SELECT 1 FROM public.prescricoes pr
       WHERE pr.paciente_id = v_id AND pr.arquivo_pdf = _name
    );
  END IF;

  BEGIN
    v_id := parts[1]::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;

  RETURN EXISTS (
    SELECT 1
      FROM public.prontuarios p
     WHERE p.id = v_id
       AND public.is_same_clinica(p.clinica_id)
       AND p.assinado IS NOT TRUE
       AND (
         public.is_admin(auth.uid())
         OR (
           public.is_medico(auth.uid())
           AND public.is_medico_responsavel_do_prontuario(p.medico_id)
         )
       )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.storage_med_attach_delete_allowed(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storage_med_attach_delete_allowed(text) TO authenticated;

DROP POLICY IF EXISTS "med_attach_delete_scoped" ON storage.objects;
CREATE POLICY "med_attach_delete_scoped" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'medical-attachments'
    AND (public.is_admin(auth.uid()) OR public.is_medico(auth.uid()))
    AND public.storage_med_attach_allowed(name)
    AND public.storage_med_attach_delete_allowed(name)
  );

COMMIT;
