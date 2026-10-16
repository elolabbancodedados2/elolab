BEGIN;

-- Same NFD normalization as the client matcher, without wildcard expansion.
CREATE OR REPLACE FUNCTION public.normalizar_busca_paciente(p_texto text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT btrim(regexp_replace(
    regexp_replace(normalize(lower(coalesce(p_texto, '')), NFD), U&'[\0300-\036f]', '', 'g'),
    '\s+', ' ', 'g'));
$$;

REVOKE ALL ON FUNCTION public.normalizar_busca_paciente(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalizar_busca_paciente(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.buscar_pacientes_paginado(
  p_termo text DEFAULT NULL,
  p_limite integer DEFAULT 21,
  p_offset integer DEFAULT 0,
  p_status text DEFAULT 'ativos',
  p_sexo text DEFAULT NULL,
  p_convenio_id uuid DEFAULT NULL,
  p_somente_particular boolean DEFAULT false,
  p_nascimento_apos date DEFAULT NULL,
  p_nascimento_ate date DEFAULT NULL
)
RETURNS TABLE (
  id uuid, nome text, nome_social text, cpf text, telefone text, email text,
  data_nascimento date, convenio_id uuid, ativo boolean
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_clinica_id uuid := public.get_my_clinica_id();
  v_busca text := public.normalizar_busca_paciente(p_termo);
  v_digitos text := regexp_replace(coalesce(p_termo, ''), '[^0-9]', '', 'g');
BEGIN
  IF auth.uid() IS NULL OR v_clinica_id IS NULL THEN
    RAISE EXCEPTION 'Sessão e clínica são obrigatórias para buscar pacientes.' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('ativos', 'inativos', 'todos') THEN
    RAISE EXCEPTION 'Filtro de status inválido.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT p.id, p.nome::text, p.nome_social::text, p.cpf::text, p.telefone::text,
         p.email::text, p.data_nascimento::date, p.convenio_id, p.ativo
    FROM public.pacientes p
   WHERE p.clinica_id = v_clinica_id
     AND (p_status = 'todos' OR p.ativo = (p_status = 'ativos'))
     AND (p_sexo IS NULL OR p.sexo = p_sexo)
     AND (p_convenio_id IS NULL OR p.convenio_id = p_convenio_id)
     AND (NOT coalesce(p_somente_particular, false) OR p.convenio_id IS NULL)
     AND (p_nascimento_apos IS NULL OR p.data_nascimento >= p_nascimento_apos)
     AND (p_nascimento_ate IS NULL OR p.data_nascimento <= p_nascimento_ate)
     AND (v_busca = ''
       OR strpos(public.normalizar_busca_paciente(p.nome), v_busca) > 0
       OR strpos(public.normalizar_busca_paciente(p.nome_social), v_busca) > 0
       OR strpos(public.normalizar_busca_paciente(p.email), v_busca) > 0
       OR (length(v_digitos) >= 3 AND (
         strpos(regexp_replace(coalesce(p.cpf, ''), '[^0-9]', '', 'g'), v_digitos) > 0
         OR strpos(regexp_replace(coalesce(p.telefone, ''), '[^0-9]', '', 'g'), v_digitos) > 0
       )))
   ORDER BY CASE WHEN v_busca = '' THEN p.created_at END DESC,
            CASE WHEN v_busca <> '' THEN p.nome END ASC, p.id ASC
   LIMIT greatest(1, least(coalesce(p_limite, 21), 101))
   OFFSET greatest(0, coalesce(p_offset, 0));
END;
$$;

REVOKE ALL ON FUNCTION public.buscar_pacientes_paginado(text, integer, integer, text, text, uuid, boolean, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_pacientes_paginado(text, integer, integer, text, text, uuid, boolean, date, date) TO authenticated;

COMMIT;
