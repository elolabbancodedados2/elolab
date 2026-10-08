CREATE OR REPLACE FUNCTION public.resumo_pacientes_clinica(p_hoje date)
RETURNS TABLE(total bigint, com_convenio bigint, menores bigint, com_alergias bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    count(*) AS total,
    count(*) FILTER (WHERE convenio_id IS NOT NULL) AS com_convenio,
    count(*) FILTER (
      WHERE data_nascimento IS NOT NULL
        AND data_nascimento <= p_hoje
        AND data_nascimento > (p_hoje - interval '18 years')::date
    ) AS menores,
    count(*) FILTER (WHERE cardinality(COALESCE(alergias, ARRAY[]::text[])) > 0) AS com_alergias
  FROM public.pacientes;
$$;

REVOKE ALL ON FUNCTION public.resumo_pacientes_clinica(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resumo_pacientes_clinica(date) TO authenticated;
