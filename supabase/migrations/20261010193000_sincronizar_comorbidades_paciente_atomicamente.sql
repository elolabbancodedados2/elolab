-- Mantém a lista atual da ficha e o histórico de condições em uma transação.
-- Antes, cada desativação, reativação e inclusão era uma chamada independente;
-- uma falha intermediária podia deixar só parte da lista aplicada.
BEGIN;

CREATE OR REPLACE FUNCTION public.sincronizar_comorbidades_paciente(
  p_paciente_id uuid,
  p_descricoes text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinica_id uuid;
BEGIN
  IF auth.uid() IS NULL
     OR NOT (public.can_access_clinical(auth.uid()) OR public.can_manage_data(auth.uid())) THEN
    RAISE EXCEPTION 'Seu perfil não pode atualizar as condições da ficha.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_clinica_id := public.get_my_clinica_id();
  IF v_clinica_id IS NULL THEN
    RAISE EXCEPTION 'Clínica não identificada.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM 1
    FROM public.pacientes AS p
   WHERE p.id = p_paciente_id
     AND p.clinica_id = v_clinica_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paciente não encontrado na clínica atual.'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.paciente_comorbidades AS c
     WHERE c.paciente_id = p_paciente_id
       AND c.clinica_id IS NOT NULL
       AND c.clinica_id <> v_clinica_id
  ) THEN
    RAISE EXCEPTION 'Há condições associadas a outra clínica. Solicite a revisão do cadastro.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.paciente_comorbidades AS c
     SET ativo = EXISTS (
       SELECT 1
         FROM unnest(coalesce(p_descricoes, ARRAY[]::text[])) AS d(descricao)
        WHERE nullif(btrim(d.descricao), '') IS NOT NULL
          AND lower(btrim(d.descricao)) = lower(btrim(c.descricao))
     ),
         clinica_id = coalesce(c.clinica_id, v_clinica_id)
   WHERE c.paciente_id = p_paciente_id
     AND (c.clinica_id IS NULL OR c.clinica_id = v_clinica_id)
     AND (
       c.ativo IS DISTINCT FROM (EXISTS (
         SELECT 1
           FROM unnest(coalesce(p_descricoes, ARRAY[]::text[])) AS d(descricao)
          WHERE nullif(btrim(d.descricao), '') IS NOT NULL
            AND lower(btrim(d.descricao)) = lower(btrim(c.descricao))
       ))
       OR c.clinica_id IS NULL
     );

  INSERT INTO public.paciente_comorbidades (paciente_id, clinica_id, descricao, ativo)
  SELECT p_paciente_id, v_clinica_id, d.descricao, true
    FROM (
      SELECT DISTINCT ON (lower(btrim(x.descricao))) btrim(x.descricao) AS descricao
        FROM unnest(coalesce(p_descricoes, ARRAY[]::text[])) AS x(descricao)
       WHERE nullif(btrim(x.descricao), '') IS NOT NULL
       ORDER BY lower(btrim(x.descricao)), btrim(x.descricao)
    ) AS d
   WHERE NOT EXISTS (
     SELECT 1
       FROM public.paciente_comorbidades AS c
      WHERE c.paciente_id = p_paciente_id
        AND (c.clinica_id IS NULL OR c.clinica_id = v_clinica_id)
        AND lower(btrim(c.descricao)) = lower(d.descricao)
   );
END;
$$;

REVOKE ALL ON FUNCTION public.sincronizar_comorbidades_paciente(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sincronizar_comorbidades_paciente(uuid, text[]) TO authenticated;

COMMENT ON FUNCTION public.sincronizar_comorbidades_paciente(uuid, text[]) IS
  'Sincroniza as condições ativas da ficha com o histórico em uma transação, preservando condições removidas como inativas.';

COMMIT;
