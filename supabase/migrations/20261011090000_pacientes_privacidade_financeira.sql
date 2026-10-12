BEGIN;

-- Financial-only accounts need patient identity/contact details for billing,
-- but must not be able to read clinical fields from the patient table.
DROP POLICY IF EXISTS "pacientes_select" ON public.pacientes;
CREATE POLICY pacientes_select_clinico ON public.pacientes
  FOR SELECT TO authenticated
  USING (
    public.is_same_clinica(clinica_id)
    AND (
      public.is_admin(auth.uid())
      OR public.is_recepcao(auth.uid())
      OR public.is_enfermagem(auth.uid())
      OR public.is_medico(auth.uid())
    )
  );

-- A policy anterior permitia clinica_id NULL, criando fichas sem tenant. A
-- tela envia o tenant, mas a validação também precisa valer para chamadas à API.
DROP POLICY IF EXISTS pacientes_insert ON public.pacientes;
CREATE POLICY pacientes_insert ON public.pacientes
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.can_manage_data(auth.uid()) OR public.is_medico(auth.uid()) OR public.is_enfermagem(auth.uid()))
    AND clinica_id = public.get_my_clinica_id()
  );

CREATE OR REPLACE FUNCTION public.buscar_pacientes_resumo_financeiro(
  p_ids uuid[] DEFAULT NULL,
  p_termo text DEFAULT NULL,
  p_limite integer DEFAULT 20,
  p_sexo text DEFAULT NULL,
  p_convenio_id uuid DEFAULT NULL,
  p_somente_particular boolean DEFAULT false,
  p_nascimento_apos date DEFAULT NULL,
  p_nascimento_ate date DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  nome text,
  nome_social text,
  cpf text,
  telefone text,
  email text,
  data_nascimento date,
  convenio_id uuid,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica_id uuid := public.get_my_clinica_id();
BEGIN
  IF auth.uid() IS NULL OR v_clinica_id IS NULL OR NOT (
    public.is_admin(auth.uid()) OR public.is_recepcao(auth.uid())
    OR public.is_enfermagem(auth.uid()) OR public.is_medico(auth.uid())
    OR public.is_financeiro(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Sem permissao para consultar dados basicos de pacientes.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT p.id, p.nome::text, p.nome_social::text, p.cpf::text,
           p.telefone::text, p.email::text, p.data_nascimento::date,
           p.convenio_id, p.created_at
      FROM public.pacientes p
     WHERE p.clinica_id = v_clinica_id
       AND (p_ids IS NULL OR p.id = ANY(p_ids))
       AND (NULLIF(btrim(p_termo), '') IS NULL OR
            p.nome ILIKE '%' || btrim(p_termo) || '%' OR
            COALESCE(p.nome_social, '') ILIKE '%' || btrim(p_termo) || '%' OR
            COALESCE(p.email, '') ILIKE '%' || btrim(p_termo) || '%' OR
            (regexp_replace(COALESCE(p.cpf, ''), '\D', '', 'g') LIKE '%' || regexp_replace(COALESCE(p_termo, ''), '\D', '', 'g') || '%' AND length(regexp_replace(COALESCE(p_termo, ''), '\D', '', 'g')) >= 3) OR
            (regexp_replace(COALESCE(p.telefone, ''), '\D', '', 'g') LIKE '%' || regexp_replace(COALESCE(p_termo, ''), '\D', '', 'g') || '%' AND length(regexp_replace(COALESCE(p_termo, ''), '\D', '', 'g')) >= 3))
       AND (p_sexo IS NULL OR p.sexo = p_sexo)
       AND (NOT COALESCE(p_somente_particular, false) OR p.convenio_id IS NULL)
       AND (p_convenio_id IS NULL OR p.convenio_id = p_convenio_id)
       AND (p_nascimento_apos IS NULL OR p.data_nascimento >= p_nascimento_apos)
       AND (p_nascimento_ate IS NULL OR p.data_nascimento <= p_nascimento_ate)
     ORDER BY p.created_at DESC, p.id
     LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 20), 500));
END;
$$;

REVOKE ALL ON FUNCTION public.buscar_pacientes_resumo_financeiro(uuid[], text, integer, text, uuid, boolean, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_pacientes_resumo_financeiro(uuid[], text, integer, text, uuid, boolean, date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.resumo_pacientes_clinica(p_hoje date)
RETURNS TABLE(total bigint, com_convenio bigint, menores bigint, com_alergias bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT count(*) AS total,
         count(*) FILTER (WHERE p.convenio_id IS NOT NULL) AS com_convenio,
         count(*) FILTER (WHERE p.data_nascimento IS NOT NULL AND p.data_nascimento <= p_hoje
           AND p.data_nascimento > (p_hoje - interval '18 years')::date) AS menores,
         count(*) FILTER (WHERE cardinality(COALESCE(p.alergias, ARRAY[]::text[])) > 0) AS com_alergias
    FROM public.pacientes p
   WHERE p.clinica_id = public.get_my_clinica_id()
     AND (public.is_admin(auth.uid()) OR public.is_recepcao(auth.uid())
       OR public.is_enfermagem(auth.uid()) OR public.is_medico(auth.uid()));
$$;
REVOKE ALL ON FUNCTION public.resumo_pacientes_clinica(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resumo_pacientes_clinica(date) TO authenticated;

CREATE OR REPLACE FUNCTION public.contar_pacientes_cadastrados(p_inicio timestamptz, p_fim timestamptz)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica_id uuid := public.get_my_clinica_id();
  v_total bigint;
BEGIN
  IF auth.uid() IS NULL OR v_clinica_id IS NULL OR NOT (
    public.is_admin(auth.uid()) OR public.is_recepcao(auth.uid())
    OR public.is_enfermagem(auth.uid()) OR public.is_medico(auth.uid())
    OR public.is_financeiro(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Sem permissao para consultar indicadores de pacientes.' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO v_total FROM public.pacientes p
   WHERE p.clinica_id = v_clinica_id AND p.created_at >= p_inicio AND p.created_at < p_fim;
  RETURN v_total;
END;
$$;
REVOKE ALL ON FUNCTION public.contar_pacientes_cadastrados(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contar_pacientes_cadastrados(timestamptz, timestamptz) TO authenticated;

COMMIT;
