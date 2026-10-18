BEGIN;

-- Clinical patient editing does not grant administrative or financial access.
DROP POLICY IF EXISTS pacientes_update ON public.pacientes;
CREATE POLICY pacientes_update ON public.pacientes
  FOR UPDATE TO authenticated
  USING (
    (public.can_manage_data(auth.uid()) OR public.is_medico(auth.uid()))
    AND public.is_same_clinica(clinica_id)
  )
  WITH CHECK (
    (public.can_manage_data(auth.uid()) OR public.is_medico(auth.uid()))
    AND clinica_id = public.get_my_clinica_id()
  );

-- Creating a patient requires duplicate review before the existing INSERT.
CREATE OR REPLACE FUNCTION public.buscar_possiveis_duplicidades_paciente(
  p_nome text,
  p_data_nascimento date,
  p_telefone text,
  p_excluir uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  nome text,
  nome_social text,
  data_nascimento date,
  telefone_final text,
  motivos text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica_id uuid;
  v_nome_normalizado text;
  v_telefone_normalizado text;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.can_manage_data(auth.uid()) OR public.is_medico(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissao para revisar cadastros.' USING ERRCODE = '42501';
  END IF;

  v_clinica_id := public.get_my_clinica_id();
  IF v_clinica_id IS NULL OR NOT public.is_same_clinica(v_clinica_id) THEN
    RAISE EXCEPTION 'Clinica nao identificada.' USING ERRCODE = '42501';
  END IF;

  v_nome_normalizado := regexp_replace(
    translate(lower(btrim(COALESCE(p_nome, ''))),
      'áàâãäéèêëíìîïóòôõöúùûüç',
      'aaaaaeeeeiiiiooooouuuuc'),
    '[^a-z0-9]', '', 'g'
  );
  v_telefone_normalizado := public.normalizar_telefone_revisao(p_telefone);

  IF char_length(v_nome_normalizado) < 3 AND char_length(v_telefone_normalizado) < 10 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.nome,
    p.nome_social,
    p.data_nascimento,
    CASE
      WHEN char_length(public.normalizar_telefone_revisao(p.telefone)) > 4
      THEN right(public.normalizar_telefone_revisao(p.telefone), 4)
      ELSE NULL
    END AS telefone_final,
    array_remove(ARRAY[
      CASE WHEN char_length(v_telefone_normalizado) >= 10
        AND public.normalizar_telefone_revisao(p.telefone) = v_telefone_normalizado
        THEN 'telefone'::text END,
      CASE WHEN p_data_nascimento IS NOT NULL
        AND p.data_nascimento = p_data_nascimento
        AND regexp_replace(
          translate(lower(btrim(COALESCE(p.nome, ''))),
            'áàâãäéèêëíìîïóòôõöúùûüç',
            'aaaaaeeeeiiiiooooouuuuc'),
          '[^a-z0-9]', '', 'g'
        ) = v_nome_normalizado
        THEN 'nome_data_nascimento'::text END
    ], NULL) AS motivos
  FROM public.pacientes p
  WHERE p.clinica_id = v_clinica_id
    AND (p_excluir IS NULL OR p.id <> p_excluir)
    AND (
      (char_length(v_telefone_normalizado) >= 10
        AND public.normalizar_telefone_revisao(p.telefone) = v_telefone_normalizado)
      OR (
        p_data_nascimento IS NOT NULL
        AND p.data_nascimento = p_data_nascimento
        AND regexp_replace(
          translate(lower(btrim(COALESCE(p.nome, ''))),
            'áàâãäéèêëíìîïóòôõöúùûüç',
            'aaaaaeeeeiiiiooooouuuuc'),
          '[^a-z0-9]', '', 'g'
        ) = v_nome_normalizado
      )
    )
  ORDER BY
    CASE WHEN char_length(v_telefone_normalizado) >= 10
      AND public.normalizar_telefone_revisao(p.telefone) = v_telefone_normalizado
      THEN 0 ELSE 1 END,
    p.nome
  LIMIT 5;
END;
$$;

REVOKE ALL ON FUNCTION public.buscar_possiveis_duplicidades_paciente(text, date, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_possiveis_duplicidades_paciente(text, date, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.buscar_possiveis_duplicidades_paciente(text, date, text, uuid) IS
  'Retorna até cinco cadastros parecidos apenas da clínica atual para revisão humana; nunca mescla registros.';

COMMIT;
